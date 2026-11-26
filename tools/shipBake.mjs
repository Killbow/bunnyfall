// Bakes one ship from a Blender FBX scene of parts into the boat's frame, as named by a spec.
// The output JSON is rebaked byte for byte by a test, so it is a derivation of the committed FBX.

import { createHash } from 'node:crypto';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFbx, nodeAt, childNamed, childrenNamed, property70, objectName } from './fbxRead.mjs';
import { eulerXYZ, polygonsOf, sceneFrame, blenderTessellate, blenderProject, tilingFault, BLENDER_FILL } from './fbxMesh.mjs';

// The scene frame never reads the front axis, so a file in other axes is refused rather than re-derived.
export const EXPORT_AXES = Object.freeze({ UpAxis: 1, UpAxisSign: 1, FrontAxis: 2, FrontAxisSign: 1, CoordAxis: 0, CoordAxisSign: 1 });

export const BOX_SLACK = 0.02;

// Rounds half away from zero on both sides so mirrored pairs bake to the same magnitude; adding 0 turns -0 into 0.
export const round4 = (v) => Math.sign(v) * Math.round(Math.abs(v) * 1e4) / 1e4 + 0;

export function toBoat([x, y, z], frame) {
  return [(frame.centreline - y) * frame.scale, (z - frame.waterline) * frame.scale, (x - frame.midship) * frame.scale];
}

const UNREAD_TRANSFORM = Object.freeze([
  ['PreRotation', [0, 0, 0]], ['PostRotation', [0, 0, 0]], ['RotationOffset', [0, 0, 0]], ['RotationPivot', [0, 0, 0]],
  ['ScalingOffset', [0, 0, 0]], ['ScalingPivot', [0, 0, 0]],
  ['GeometricTranslation', [0, 0, 0]], ['GeometricRotation', [0, 0, 0]], ['GeometricScaling', [1, 1, 1]],
]);

function assertExportAxes(tree) {
  const gs = nodeAt(tree.nodes, 'GlobalSettings');
  if (!gs) throw new Error('no GlobalSettings in this FBX - the bake reads its axes there');
  for (const [key, want] of Object.entries(EXPORT_AXES)) {
    const got = property70(gs, key)?.[0];
    if (got === undefined || Number(got) !== want) {
      throw new Error(`GlobalSettings ${key} is ${got} where this export's is ${want} - the bake reads Blender's FBX axes (${Object.entries(EXPORT_AXES).map(([k, v]) => `${k} ${v}`).join(', ')}) and no other; export with Forward -Z, Up Y`);
    }
  }
}

export function assertBlenderFill(tree) {
  const info = nodeAt(tree.nodes, 'FBXHeaderExtension', 'SceneInfo');
  if (!info) throw new Error('no SceneInfo in this FBX\'s header - the bake reads there which Blender wrote it');
  for (const at of ['Original', 'LastSaved']) {
    const name = String(property70(info, `${at}|ApplicationName`)?.[0] ?? '');
    if (!name.startsWith('Blender')) throw new Error(`this FBX was written by ${name || 'nothing named'} (SceneInfo ${at}|ApplicationName), not Blender - the bake cuts faces as Blender ${BLENDER_FILL} does`);
    const version = String(property70(info, `${at}|ApplicationVersion`)?.[0] ?? '');
    if (version !== BLENDER_FILL && !version.startsWith(`${BLENDER_FILL}.`)) {
      throw new Error(`this FBX was written by Blender ${version || '(no version)'} (SceneInfo ${at}|ApplicationVersion) - tools/fbxMesh.mjs cuts faces as Blender ${BLENDER_FILL} does, and another Blender's fill may cut them otherwise; export from Blender ${BLENDER_FILL}, or port that Blender's polyfill_2d.cc and say so in BLENDER_FILL`);
    }
  }
}

const det3 = (a) => a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6]);

// Blender writes its -90 degree axis conversion through float32, so an angle within a microradian snaps to the
// quarter turn. Otherwise vertices mirrored exactly in the scene bake a few micrometers off their pairs.
const quarterTurn = (deg) => { const q = Math.round(deg / 90) * 90; return Math.abs(deg - q) * (Math.PI / 180) <= 1e-6 ? q : deg; };

export function sceneObjects(tree, read = () => true) {
  const objects = nodeAt(tree.nodes, 'Objects');
  if (!objects) throw new Error('no Objects section in this FBX');
  assertExportAxes(tree);
  const byId = new Map(objects.children.map((o) => [String(o.props[0]), o]));
  const links = childrenNamed(nodeAt(tree.nodes, 'Connections'), 'C').map((c) => ({ kind: c.props[0], src: String(c.props[1]), dst: String(c.props[2]) }));
  const frame = sceneFrame(tree);
  const out = [];
  for (const model of childrenNamed(objects, 'Model')) {
    if (model.props[2] !== 'Mesh') continue;
    const id = String(model.props[0]);
    const name = objectName(model.props[1]);
    const parent = links.find((l) => l.kind === 'OO' && l.src === id);
    if (!parent || parent.dst !== '0') throw new Error(`${name} is parented under object ${parent?.dst} - the bake reads root objects only`);
    for (const [prop, identity] of UNREAD_TRANSFORM) {
      const v = property70(model, prop);
      if (v && v.some((x, i) => Math.abs(Number(x) - identity[i]) > 1e-9)) throw new Error(`${name} carries ${prop} ${JSON.stringify(v)} - the bake reads T*R*S only`);
    }
    if (Number(property70(model, 'RotationOrder')?.[0] ?? 0) !== 0) throw new Error(`${name}: rotation order is not XYZ Euler`);
    const geoLink = links.find((l) => l.kind === 'OO' && l.dst === id && byId.get(l.src)?.name === 'Geometry');
    const geo = geoLink ? byId.get(geoLink.src) : null;
    if (!geo) throw new Error(`${name} has no Geometry`);
    const materials = links.filter((l) => l.kind === 'OO' && l.dst === id && byId.get(l.src)?.name === 'Material').map((l) => objectName(byId.get(l.src).props[1]));
    const S = (property70(model, 'Lcl Scaling') ?? [1, 1, 1]).map(Number);
    const R = eulerXYZ((property70(model, 'Lcl Rotation') ?? [0, 0, 0]).map(Number).map(quarterTurn));
    const T = (property70(model, 'Lcl Translation') ?? [0, 0, 0]).map(Number);
    const m = frame.m;
    const place = (p) => {
      const s = [p[0] * S[0], p[1] * S[1], p[2] * S[2]];
      const w = [R[0] * s[0] + R[1] * s[1] + R[2] * s[2] + T[0], R[3] * s[0] + R[4] * s[1] + R[5] * s[2] + T[1], R[6] * s[0] + R[7] * s[1] + R[8] * s[2] + T[2]];
      return [m[0] * w[0] + m[1] * w[1] + m[2] * w[2], m[3] * w[0] + m[4] * w[1] + m[5] * w[2], m[6] * w[0] + m[7] * w[1] + m[8] * w[2]];
    };
    if (!read(name)) {
      const raw = childNamed(geo, 'Vertices')?.props[0] ?? [];
      const scene = [];
      for (let i = 0; i < raw.length; i += 3) scene.push(place([raw[i], raw[i + 1], raw[i + 2]]));
      out.push({ name, unread: true, local: [], scene, origin: place([0, 0, 0]), polygons: [], polyMaterial: [], materials });
      continue;
    }
    const det = det3([0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => (m[r * 3] * R[c] + m[r * 3 + 1] * R[3 + c] + m[r * 3 + 2] * R[6 + c]) * S[c])));
    if (!(det > 0)) throw new Error(`${name}'s transform ${det < 0 ? 'mirrors it' : 'flattens it'} (scale ${JSON.stringify(S)}, determinant ${det.toPrecision(4)}) - ${det < 0 ? 'its faces would bake inside out' : 'it would bake flat'}; apply the scale in Blender (Ctrl+A) before exporting`);
    const raw = childNamed(geo, 'Vertices')?.props[0];
    const pvi = childNamed(geo, 'PolygonVertexIndex')?.props[0];
    if (!raw || !pvi) throw new Error(`${name}'s Geometry carries no Vertices/PolygonVertexIndex`);
    const local = [], scene = [];
    for (let i = 0; i < raw.length; i += 3) {
      local.push([raw[i], raw[i + 1], raw[i + 2]]);
      scene.push(place([raw[i], raw[i + 1], raw[i + 2]]));
    }
    const matLayer = childNamed(geo, 'LayerElementMaterial');
    const matIndex = matLayer ? childNamed(matLayer, 'Materials')?.props[0] : null;
    const matMap = matLayer ? childNamed(matLayer, 'MappingInformationType')?.props[0] : null;
    const polygons = polygonsOf(pvi);
    const polyMaterial = polygons.map((_, k) => (matIndex ? (matMap === 'AllSame' ? matIndex[0] : matIndex[k]) : -1));
    const normal = (n) => {
      const s = [n[0] / S[0], n[1] / S[1], n[2] / S[2]];
      const w = [R[0] * s[0] + R[1] * s[1] + R[2] * s[2], R[3] * s[0] + R[4] * s[1] + R[5] * s[2], R[6] * s[0] + R[7] * s[1] + R[8] * s[2]];
      const v = [m[0] * w[0] + m[1] * w[1] + m[2] * w[2], m[3] * w[0] + m[4] * w[1] + m[5] * w[2], m[6] * w[0] + m[7] * w[1] + m[8] * w[2]];
      const len = Math.hypot(v[0], v[1], v[2]);
      return len > 1e-12 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 0, 1];
    };
    out.push({ name, local, scene, origin: place([0, 0, 0]), polygons, polyMaterial, materials, geo, normal });
  }
  return out;
}

export function fillFace(object, k) {
  const poly = object.polygons[k];
  if (poly.length < 3) throw new Error(`${object.name} polygon #${k}: ${poly.length} corners is not a face`);
  const corners = poly.map((vi) => object.local[vi]);
  const tris = blenderTessellate(corners);
  const fault = tilingFault(blenderProject(corners), tris, corners);
  if (fault) throw new Error(`${object.name} polygon #${k} (${poly.length} corners): Blender's cut does not tile it - ${fault}. Fix the face in Blender before exporting.`);
  return tris;
}

export function sameShape(a, b) {
  if (a.scene.length !== b.scene.length || a.polygons.length !== b.polygons.length) return false;
  if (!a.scene.every((p, i) => p.every((v, k) => Math.abs(v - b.scene[i][k]) < 1e-6))) return false;
  return a.polygons.every((p, i) => p.length === b.polygons[i].length && p.every((v, j) => v === b.polygons[i][j]));
}

export function boxOf(points) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of points) for (let k = 0; k < 3; k++) { if (p[k] < min[k]) min[k] = p[k]; if (p[k] > max[k]) max[k] = p[k]; }
  return { min, max };
}
export const mm = (b) => [b.min.map((v) => Math.round(v * 1000) / 1000 + 0), b.max.map((v) => Math.round(v * 1000) / 1000 + 0)];

export function bakePart(role, object, polyIds, frame) {
  const place = typeof frame === 'function' ? frame : (p) => toBoat(p, frame);
  const remap = new Map();
  const positions = [];
  const take = (vi) => {
    if (!remap.has(vi)) {
      remap.set(vi, positions.length / 3);
      positions.push(...place(object.scene[vi]).map(round4));
    }
    return remap.get(vi);
  };
  const polygons = [], triangles = [], triangleOf = [], material = [];
  let split = 0;
  for (const k of polyIds) {
    const poly = object.polygons[k];
    const tris = fillFace(object, k);
    const ring = poly.map(take);
    const p = polygons.length;
    // The scene-to-boat transform is a mirror, so reversing the corners keeps each face's front on the same side.
    polygons.push([...ring].reverse());
    material.push(object.polyMaterial[k] >= 0 ? object.materials[object.polyMaterial[k]] ?? null : null);
    for (const [a, b, c] of tris) { triangles.push(ring[a], ring[c], ring[b]); triangleOf.push(p); }
    if (poly.length > 3) split++;
  }
  return { role, object: object.name, positions, polygons, material, triangles, triangleOf, split };
}

function skipFault(o, skip, byName, spec) {
  if (skip.twin) {
    const t = byName.get(skip.twin);
    return !t || !sameShape(o, t) ? `${o.name} was to be ${skip.twin}'s twin in its place and is not` : null;
  }
  if (skip.empty) return o.polygons.length ? `${o.name} was to be empty and has ${o.polygons.length} faces` : null;
  const b = boxOf(o.scene);
  if (skip.band) {
    const [y0, y1] = spec.band;
    return o.polygons.length && !(b.max[1] < y0 || b.min[1] > y1) ? `${o.name} was to stand outside her band of the scene (Y ${y0} to ${y1}) and stands at Y ${b.min[1].toFixed(2)} to ${b.max[1].toFixed(2)}` : null;
  }
  return !(b.min[1] > skip.minY) ? `${o.name} was to be another station (beyond Y ${skip.minY}) and stands at Y ${b.min[1].toFixed(2)}` : null;
}

/**
 * @param {Uint8Array} fbxBytes
 * @param {{ bake: string, source: string, frame: { scale: number, waterline: number, midship: number, centreline: number }, roles: Record<string, { role: string, box: number[][] }>, skip: Record<string, any>, band?: number[], hull?: string, cut?: (o: any, all: number[]) => any[] }} spec
 */
export function bakeScene(fbxBytes, spec, tree = readFbx(fbxBytes), source = spec.source) {
  assertBlenderFill(tree);
  const objects = sceneObjects(tree);
  const parts = [];
  const seen = new Set();
  const byName = new Map(objects.map((o) => [o.name, o]));
  const hullRole = spec.hull ?? 'hull';
  for (const o of objects) {
    const skip = spec.skip[o.name];
    if (skip) {
      const fault = skipFault(o, skip, byName, spec);
      if (fault) throw new Error(fault);
      continue;
    }
    const r = spec.roles[o.name];
    if (!r) throw new Error(`${o.name} plays no role aboard - name it in ROLES (or SKIP) after reading the scene`);
    const b = boxOf(o.scene);
    const off = Math.max(...[b.min, b.max].flatMap((end, e) => end.map((v, k) => Math.abs(v - r.box[e][k]))));
    if (!(off <= BOX_SLACK)) throw new Error(`${o.name} (${r.role}) was read standing in the box ${JSON.stringify(r.box)} and stands in ${JSON.stringify(mm(b))} - ${(off * 100).toFixed(1)} cm out where ${BOX_SLACK * 100} cm is let pass; read the scene again (--list) before re-baking`);
    seen.add(o.name);
    const all = o.polygons.map((_, k) => k);
    if (r.role === hullRole) {
      // frame.centreline must equal the hull's origin Y exactly, or mirrored pairs bake unequal.
      if (o.origin[1] !== spec.frame.centreline) throw new Error(`the hull's origin stands at scene Y ${o.origin[1]} and FRAME.centreline is ${spec.frame.centreline} - set the centreline to the hull's Y`);
      if (spec.cut) parts.push(...spec.cut(o, all));
      else parts.push(bakePart(r.role, o, all, spec.frame));
    } else parts.push(bakePart(r.role, o, all, spec.frame));
  }
  const missing = Object.keys(spec.roles).filter((n) => !seen.has(n));
  if (missing.length) throw new Error(`the scene has none of ${missing.join(', ')}`);
  return {
    bake: spec.bake,
    source,
    sha256: createHash('sha256').update(fbxBytes).digest('hex'),
    creator: childNamed(tree.nodes, 'Creator')?.props[0] ?? null,
    frame: { ...spec.frame },
    parts,
  };
}

export function bakeJson(baked) {
  const { parts, ...head } = baked;
  const lines = parts.map((p) => `    ${JSON.stringify(p)}`);
  return `${JSON.stringify(head, null, 2).replace(/\n}$/, '')},\n  "parts": [\n${lines.join(',\n')}\n  ]\n}\n`;
}

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

export function sourcePath(file) {
  const abs = resolve(file);
  const rel = relative(ROOT, abs);
  return rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel) ? rel.split(sep).join('/') : abs;
}

export function listScene(bytes, spec = null) {
  return sceneObjects(readFbx(bytes)).map((o) => {
    const role = spec?.roles?.[o.name]?.role ?? (spec?.skip?.[o.name] ? '(skipped)' : '?');
    return `${o.name.padEnd(14)} ${role.padEnd(20)} ${o.polygons.length ? JSON.stringify(mm(boxOf(o.scene))) : '(no faces)'}  ${o.polygons.length} polygons`;
  });
}
