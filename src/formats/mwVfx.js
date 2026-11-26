// Runs a Morrowind effect mesh as OpenMW does: every controller uses the effect's own clock from zero, and the
// effect ends at the longest controller stop time unless it loops. `place` and `view` stay separate because
// world-frame particles keep the file's own size and speed.

import { deref } from './mwNifFile.js';
import {
  resolveMaterial, skipGeometryName, stripsToTriangles, hasMarkerFlag, selectedChild,
  ANIM_FLAG_NODES, NODE_TYPES, GEOMETRY_TYPES, PARTICLE_TYPES, VERTEX_COLOR_MODE,
} from './mwNifMesh.js';
import { quatToMat33 } from './mwSkin.js';
import { affineOfTransform, affineMul, affineApply, affineRotate, AFFINE_IDENTITY } from './mwAffine.js';
import { sampleKeyGroup } from './mwKeys.js';
import { trackFromController, sampleTrack } from './mwAnim.js';
import {
  particleSystemsOf, createParticleSystem, controllerTime, packParticleQuads, particleDrawState, affineInverse,
  affineScale, affineOrthoNormalize, PARTICLE_FLOATS, CONTROLLER_FLAG_ACTIVE,
} from './mwParticles.js';

export const timingOf = (c) => ({ frequency: c.frequency, phase: c.phase, startTime: c.startTime, stopTime: c.stopTime, extrapolation: c.flags & 0x6 });

export function activeControllers(nif, rec) {
  const out = [];
  const seen = new Set();
  for (let ref = rec?.controller ?? -1; ref >= 0 && !seen.has(ref);) {
    seen.add(ref);
    const c = deref(nif, ref);
    if (!c) break;
    if (c.flags & CONTROLLER_FLAG_ACTIVE) out.push(c);
    ref = c.next;
  }
  return out;
}

export const COLOR_TARGET = Object.freeze({ Ambient: 0, Diffuse: 1, Specular: 2, Emissive: 3 });
export const BILLBOARD_MODE = Object.freeze({ AlwaysFaceCamera: 0, RotateAboutUp: 1, RigidFaceCamera: 2, AlwaysFaceCenter: 3 });
export const OVERRIDE_CLAMP_MODE = 0;

function propertyControllers(nif, chain, grow) {
  const last = (type) => {
    for (let i = chain.length - 1; i >= 0; i--) { const r = deref(nif, chain[i]); if (r?.type === type) return r; }
    return null;
  };
  const out = { alpha: null, color: null, flip: null };
  for (const c of activeControllers(nif, last('NiMaterialProperty'))) {
    const d = deref(nif, c.data);
    if (c.type === 'NiAlphaController' && d?.data) { out.alpha = { group: d.data, timing: timingOf(c) }; grow(c); }
    else if (c.type === 'NiMaterialColorController' && d?.data) { out.color = { group: d.data, target: (c.flags >> 4) & 3, timing: timingOf(c) }; grow(c); }
  }
  for (const c of activeControllers(nif, last('NiTexturingProperty'))) {
    if (c.type !== 'NiFlipController') continue;
    // Empty sources are dropped, but a source without an external file keeps its slot and draws the base texture,
    // as in OpenMW.
    const files = (c.sources ?? []).filter((s) => s >= 0).map((s) => deref(nif, s)).map((s) => (s && s.external && s.fileName ? s.fileName : null));
    if (files.length) { out.flip = { files, delta: c.delta, timing: timingOf(c) }; grow(c); }
  }
  return out;
}

export function vfxOf(nif) {
  const nodes = new Map();
  const shapes = [];
  const particleChains = new Map();
  let length = 0;
  const grow = (c) => { if (Number.isFinite(c?.stopTime)) length = Math.max(length, c.stopTime); };
  const rootRec = deref(nif, nif.roots.find((r) => r >= 0) ?? -1);
  const rootTex = (rootRec?.properties ?? []).find((p) => deref(nif, p)?.type === 'NiTexturingProperty') ?? -1;
  const hasMarkers = rootRec ? hasMarkerFlag(nif, rootRec) : false;

  const visit = (ref, parent, chain, animFlags, overridden, skipMeshes, isRoot) => {
    const rec = deref(nif, ref);
    if (!rec) return;
    if (!isRoot && String(rec.name || '').toLowerCase() === 'bounding box') return;
    if (rec.type === 'RootCollisionNode') return;
    const isNode = NODE_TYPES.has(rec.type);
    const isShape = GEOMETRY_TYPES.has(rec.type);
    const isParticles = PARTICLE_TYPES.has(rec.type);
    if (!isNode && !isShape && !isParticles) return;
    const flags = ANIM_FLAG_NODES.has(rec.type) ? rec.flags | 0 : animFlags;
    const own = (rec.properties ?? []).filter((p) => p >= 0);
    // As in OpenMW, a non-root node that lists the root's first NiTexturingProperty is marked, and the particle
    // texture override covers its whole subtree.
    const marked = overridden || (!isRoot && rootTex >= 0 && own.includes(rootTex));
    const nextChain = own.length ? [...chain, ...own] : chain;
    const controllers = activeControllers(nif, rec);
    const hidden = (rec.flags & 1) !== 0;
    const hasVis = controllers.some((c) => c.type === 'NiVisController');
    const entry = {
      ref, parent, name: rec.name || '',
      rest: { rotation: Float32Array.from(rec.rotation ?? [1, 0, 0, 0, 1, 0, 0, 0, 1]), translation: [...(rec.translation ?? [0, 0, 0])], scale: rec.scale ?? 1 },
      billboard: rec.type === 'NiBillboardNode' ? (rec.flags >> 5) & 3 : null,
      hidden, track: null, vis: null,
    };
    for (const c of controllers) {
      if (c.type === 'NiKeyframeController') {
        const track = trackFromController(nif, c);
        if (track) { entry.track = { ...track, timing: timingOf(c) }; grow(c); }
      } else if (c.type === 'NiVisController') {
        const data = deref(nif, c.data);
        entry.vis = { keys: data?.keys ?? [], timing: timingOf(c) };
        grow(c);
      }
    }
    nodes.set(ref, entry);
    // A hidden node skips every mesh beneath it unless it has a visibility controller, which can show it later.
    const skip = skipMeshes || (hidden && !hasVis);
    if (isParticles) {
      if (!skip && !skipGeometryName(rec.name, hasMarkers)) particleChains.set(ref, { chain: nextChain, override: marked });
      return;
    }
    if (isNode) {
      const only = selectedChild(rec);
      const kids = only !== null ? [rec.children?.[only]] : (rec.children ?? []);
      for (const child of kids) if (child !== undefined && child >= 0) visit(child, ref, nextChain, flags, marked, skip, false);
      return;
    }
    if (skip || rec.skin >= 0 || skipGeometryName(rec.name, hasMarkers)) return;
    const data = deref(nif, rec.data);
    if (!data || !data.vertices) return;
    const indices = rec.type === 'NiTriStrips' ? stripsToTriangles(data) : Uint16Array.from(data.triangles ?? []);
    if (!indices.length) return;
    const props = nextChain.map((p) => deref(nif, p)).filter(Boolean);
    const shape = {
      ref, name: rec.name || '',
      positions: Float32Array.from(data.vertices),
      uvs: data.uvSets?.length ? Float32Array.from(data.uvSets[0]) : null,
      colors: data.colors ? Float32Array.from(data.colors) : null,
      indices,
      material: resolveMaterial(nif, props, !!data.colors),
      uv: null,
      override: marked,
      ...propertyControllers(nif, nextChain, grow),
    };
    for (const c of controllers) {
      if (c.type !== 'NiUVController') continue;
      const d = deref(nif, c.data);
      if (d?.groups) { shape.uv = { groups: d.groups, timing: timingOf(c) }; grow(c); }
    }
    shapes.push(shape);
  };
  for (const r of nif.roots) if (r >= 0) visit(r, -1, [], 0, false, false, true);

  // Only roots with a transform are walked, because a .kf NiSequence root has none to compose.
  const particles = [];
  const sceneRoots = nif.roots.filter((r) => r >= 0 && deref(nif, r)?.rotation);
  for (const desc of particleSystemsOf(sceneRoots.length === nif.roots.length ? nif : { ...nif, roots: sceneRoots }, { includeHidden: true })) {
    const own = particleChains.get(desc.ref);
    if (!own) continue;
    grow(desc.controller);
    const { alpha, flip } = propertyControllers(nif, own.chain, grow);
    particles.push({ desc, node: desc.ref, emitter: desc.emitter ? desc.emitter.ref : null, alpha, flip, override: own.override });
  }
  return { nodes, shapes, particles, length };
}

export function visAt(keys, time) {
  if (!keys || !keys.length) return true;
  let lo = 0; let hi = keys.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (time < keys[mid].time) hi = mid; else lo = mid + 1; }
  return !!keys[Math.max(0, lo - 1)].value;
}

export function uvAt(u, v, { uTrans = 0, vTrans = 0, uScale = 1, vScale = 1 }) {
  return [(u - 0.5) * uScale + 0.5 - uTrans, (v - 0.5) * vScale + 0.5 + vTrans];
}

export function flipIndex(time, delta, count) {
  if (!(count > 0)) return -1;
  if (!delta) return 0;
  const i = Math.trunc(time / delta) % count;
  return i < 0 ? i + count : i;
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function shapeVertexColour(material, colors, i, alphaUniform = 1) {
  const vc = colors ? [colors[i * 4], colors[i * 4 + 1], colors[i * 4 + 2], colors[i * 4 + 3]] : null;
  const mode = material.vertexColorMode;
  const emissive = vc && mode === VERTEX_COLOR_MODE.Emission ? vc : material.emissive;
  const ambient = vc && (mode === VERTEX_COLOR_MODE.AmbientAndDiffuse || mode === VERTEX_COLOR_MODE.Ambient) ? vc : material.ambient;
  const diffuseA = vc && (mode === VERTEX_COLOR_MODE.AmbientAndDiffuse || mode === VERTEX_COLOR_MODE.Diffuse) ? vc[3] : material.alpha;
  return [clamp01(emissive[0] + ambient[0]), clamp01(emissive[1] + ambient[1]), clamp01(emissive[2] + ambient[2]), clamp01(diffuseA * alphaUniform)];
}

const m3mul = (a, b) => {
  const o = new Float32Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
};
const m3tApply = (a, v) => [a[0] * v[0] + a[3] * v[1] + a[6] * v[2], a[1] * v[0] + a[4] * v[1] + a[7] * v[2], a[2] * v[0] + a[5] * v[1] + a[8] * v[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return l > 0 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 0]; };
const fromColumns = (a, b, c) => Float32Array.from([a[0], b[0], c[0], a[1], b[1], c[1], a[2], b[2], c[2]]);

// OpenMW's `mat.getRotate() * mBaseRotation` applies mat first in osg row order, so the column-vector result is
// `base * mat`.
export function billboardRotation(mode, base, translation, eye, look, up) {
  let mat = null;
  if (mode === BILLBOARD_MODE.RotateAboutUp) {
    const d = m3tApply(base, [eye[0] - translation[0], eye[1] - translation[1], eye[2] - translation[2]]);
    const n = Math.hypot(d[0], d[2]);
    if (n > 1e-12) { const x = d[0] / n, z = d[2] / n; mat = fromColumns([z, 0, -x], [0, 1, 0], [x, 0, z]); }
  } else {
    // The two center modes fall through to RigidFaceCamera, because OpenMW builds them with the default mode.
    const relForward = norm(m3tApply(base, look));
    let relUp = m3tApply(base, up);
    const relRight = norm(cross(relUp, relForward));
    relUp = norm(cross(relForward, relRight));
    if (mode === BILLBOARD_MODE.AlwaysFaceCamera) {
      const n = Math.sqrt(relUp[1] * relUp[1] + relRight[1] * relRight[1]);
      if (n > 1e-6) {
        const cos = relUp[1] / n, sin = -relRight[1] / n;
        mat = fromColumns(
          [-relRight[0] * cos - relUp[0] * sin, -relRight[1] * cos - relUp[1] * sin, -relRight[2] * cos - relUp[2] * sin],
          [relUp[0] * cos - relRight[0] * sin, relUp[1] * cos - relRight[1] * sin, relUp[2] * cos - relRight[2] * sin],
          [-relForward[0], -relForward[1], -relForward[2]]);
      }
    } else {
      mat = fromColumns(relRight, relUp, relForward);
    }
  }
  return mat ? m3mul(base, mat) : Float32Array.from(base);
}

function localParts(node, clock) {
  const rest = node.rest;
  if (!node.track) return rest;
  const s = sampleTrack(node.track, controllerTime(node.track.timing, clock));
  return {
    rotation: s.rotation ? quatToMat33(s.rotation) : rest.rotation,
    translation: s.translation ? [s.translation[0], s.translation[1], s.translation[2]] : rest.translation,
    scale: s.scale ?? rest.scale,
  };
}

const turn = (m, v) => affineRotate(m, v[0], v[1], v[2]);

export function createVfx(desc, { textureOverride = null, rolls = Math.random, loop = false } = {}) {
  let time = 0;
  let finished = false;
  const sims = desc.particles.map((p) => createParticleSystem(p.desc, { rolls }));
  const shapeBufs = desc.shapes.map(() => null);
  const partBufs = desc.particles.map(() => null);
  const worldOf = new Map();
  const visibleOf = new Map();
  // Nodes are recorded parents first, so each parent's world transform exists before its children are posed.
  const order = [...desc.nodes.keys()];

  function pose(eyeLocal) {
    worldOf.clear(); visibleOf.clear();
    for (const ref of order) {
      const node = desc.nodes.get(ref);
      const parentW = node.parent >= 0 ? (worldOf.get(node.parent) ?? AFFINE_IDENTITY) : AFFINE_IDENTITY;
      const p = localParts(node, time);
      let rotation = p.rotation;
      if (node.billboard !== null && eyeLocal) {
        const inv = affineInverse(parentW);
        const eye = affineApply(inv, eyeLocal.position[0], eyeLocal.position[1], eyeLocal.position[2]);
        rotation = billboardRotation(node.billboard, p.rotation, p.translation, eye, turn(inv, eyeLocal.look), turn(inv, eyeLocal.up));
      }
      worldOf.set(ref, affineMul(parentW, affineOfTransform({ rotation, translation: p.translation, scale: p.scale })));
      const vis = node.vis ? visAt(node.vis.keys, controllerTime(node.vis.timing, time)) : !node.hidden;
      visibleOf.set(ref, vis && (node.parent >= 0 ? visibleOf.get(node.parent) ?? true : true));
    }
  }

  function textureOf(item, base) {
    if (item.override && textureOverride) return textureOverride;
    if (item.flip) return item.flip.files[flipIndex(controllerTime(item.flip.timing, time), item.flip.delta, item.flip.files.length)] ?? base;
    return base;
  }
  function drawStateOf(item, material) {
    const s = particleDrawState(material);
    return item.override && textureOverride ? { ...s, textureFile: textureOverride, clampMode: OVERRIDE_CLAMP_MODE } : s;
  }
  const alphaOf = (item) => (item.alpha ? sampleKeyGroup(item.alpha.group, 1, controllerTime(item.alpha.timing, time)) ?? 1 : 1);

  function packShape(i, shape, m) {
    let material = shape.material;
    if (shape.color) {
      const c = sampleKeyGroup(shape.color.group, 3, controllerTime(shape.color.timing, time)) ?? [1, 1, 1];
      const key = ['ambient', 'diffuse', null, 'emissive'][shape.color.target];
      if (key) material = { ...material, [key]: [c[0], c[1], c[2]] };
    }
    const alpha = alphaOf(shape);
    let uvT = null;
    if (shape.uv && shape.uvs) {
      const t = controllerTime(shape.uv.timing, time);
      const g = shape.uv.groups;
      uvT = { uTrans: sampleKeyGroup(g[0], 1, t) ?? 0, vTrans: sampleKeyGroup(g[1], 1, t) ?? 0, uScale: sampleKeyGroup(g[2], 1, t) ?? 1, vScale: sampleKeyGroup(g[3], 1, t) ?? 1 };
    }
    const n = shape.indices.length;
    const need = n * PARTICLE_FLOATS;
    let buf = shapeBufs[i];
    if (!buf || buf.length < need) buf = shapeBufs[i] = new Float32Array(need);
    let o = 0;
    for (let k = 0; k < n; k++) {
      const v = shape.indices[k];
      const p = affineApply(m, shape.positions[v * 3], shape.positions[v * 3 + 1], shape.positions[v * 3 + 2]);
      let u = shape.uvs ? shape.uvs[v * 2] : 0; let w = shape.uvs ? shape.uvs[v * 2 + 1] : 0;
      if (uvT) [u, w] = uvAt(u, w, uvT);
      const c = shapeVertexColour(material, shape.colors, v, alpha);
      buf[o++] = p[0]; buf[o++] = p[1]; buf[o++] = p[2];
      buf[o++] = 0; buf[o++] = 0;
      buf[o++] = u; buf[o++] = w;
      buf[o++] = c[0]; buf[o++] = c[1]; buf[o++] = c[2]; buf[o++] = c[3];
      buf[o++] = 0;
    }
    return { key: `shape:${i}`, packed: buf, count: n, drawState: drawStateOf(shape, shape.material), texture: textureOf(shape, shape.material.textureFile) };
  }

  return {
    desc,
    get time() { return time; },
    get done() { return finished; },
    get systems() { return sims; },
    update(dt, { place = null, view = null, eye = null } = {}) {
      if (finished) return { time, done: true, streams: [] };
      time += dt;
      if (time >= desc.length) {
        if (loop && desc.length > 0) time -= desc.length * Math.floor(time / desc.length);
        else { finished = true; return { time, done: true, streams: [] }; }
      }
      const placeA = place ?? AFFINE_IDENTITY;
      const viewA = view ?? AFFINE_IDENTITY;
      const out = affineMul(viewA, placeA);
      let eyeLocal = null;
      if (eye) {
        const inv = affineInverse(out);
        eyeLocal = { position: affineApply(inv, eye.position[0], eye.position[1], eye.position[2]), look: turn(inv, eye.look), up: turn(inv, eye.up) };
      }
      pose(eyeLocal);
      const streams = [];
      desc.shapes.forEach((shape, i) => {
        if (visibleOf.get(shape.ref) ?? true) streams.push(packShape(i, shape, affineMul(out, worldOf.get(shape.ref) ?? AFFINE_IDENTITY)));
      });
      desc.particles.forEach((p, i) => {
        const sim = sims[i];
        const ps = worldOf.get(p.node) ?? affineOfTransform(p.desc.world);
        const em = p.emitter !== null ? worldOf.get(p.emitter) ?? null : null;
        let packed;
        if (p.desc.localSpace) {
          sim.update(dt, time, null, em ? affineMul(affineInverse(ps), em) : null);
          const m = affineMul(out, ps);
          packed = packParticleQuads(sim.quads(), partBufs[i], { place: (x, y, z) => affineApply(m, x, y, z), sizeScale: affineScale(m) });
        } else {
          const frame = affineOrthoNormalize(affineMul(placeA, ps));
          const emW = em ? affineOrthoNormalize(affineMul(placeA, em)) : null;
          sim.update(dt, time, frame, emW ? affineMul(affineInverse(frame), emW) : null);
          packed = packParticleQuads(sim.quads(), partBufs[i], { place: (x, y, z) => affineApply(viewA, x, y, z), sizeScale: affineScale(viewA) });
        }
        partBufs[i] = packed.packed;
        if (!(visibleOf.get(p.node) ?? true) || !packed.count) return;
        const alpha = alphaOf(p);
        if (alpha !== 1) for (let k = 10; k < packed.count * PARTICLE_FLOATS; k += PARTICLE_FLOATS) packed.packed[k] = clamp01(packed.packed[k] * alpha);
        streams.push({ key: `particles:${i}`, packed: packed.packed, count: packed.count, drawState: drawStateOf(p, p.desc.material), texture: textureOf(p, p.desc.material?.textureFile ?? null) });
      });
      return { time, done: false, streams };
    },
  };
}

export function vfxTextures(desc) {
  const out = new Set();
  const add = (f) => { if (f) out.add(f); };
  for (const s of desc.shapes) { add(s.material.textureFile); for (const f of s.flip?.files ?? []) add(f); }
  for (const p of desc.particles) { add(p.desc.material?.textureFile); for (const f of p.flip?.files ?? []) add(f); }
  return [...out];
}

export function vfxCapacity(desc) {
  const out = new Map();
  desc.shapes.forEach((s, i) => out.set(`shape:${i}`, s.indices.length));
  desc.particles.forEach((p, i) => out.set(`particles:${i}`, Math.max(1, p.desc.data?.numParticles | 0) * 6));
  return out;
}
