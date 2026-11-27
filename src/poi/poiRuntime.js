// @ts-check

import { applyTextureTransform } from './gltfImport.js';
import { multiply } from '../world/mat4.js';
import { mat4FromQuatPosScale } from '../world/quat.js';

export const POI_TEXTURE_ARCHIVE = 600000;

const r255 = (v) => Math.round(Math.min(Math.max(Number(v) || 0, 0), 1) * 255);

export const POI_STEP_UNITS = 65_536;

/**
 * @param {Iterator<any>} it
 */
function runSteps(it) {
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

/** @param {any} m */
export const samplerOf = (m) => ({ wrapS: m.wrap?.[0] ?? 'repeat', wrapT: m.wrap?.[1] ?? 'repeat', filter: m.filter ?? 'linear' });

/**
 * @param {any} m
 */
export function materialLook(m) {
  return JSON.stringify([
    m.texture ?? null, (m.color ?? [1, 1, 1, 1]).map(r255), m.alpha ?? 'opaque',
    m.alpha === 'cutout' ? r255(m.cutoff ?? 0.5) : null, samplerOf(m), m.emissive ?? null,
    (m.emissiveColor ?? [0, 0, 0]).map((c) => r255(Math.min(c, 1))),
  ]);
}

/** @param {any} m */
export const emits = (m) => !!m.emissive || (m.emissiveColor ?? [0, 0, 0]).some((c) => c > 0);

export function createTextureBook() {
  const records = new Map();
  return {
    recordOf(/** @type {string} */ look) { if (!records.has(look)) records.set(look, records.size); return records.get(look); },
    size: () => records.size,
  };
}

/**
 * @param {{ width: number, height: number, data: Uint8Array | Uint8ClampedArray } | null} image
 * @param {any} m
 */
export const bakeAlbedo = (image, m) => runSteps(bakeAlbedoSteps(image, m));

/**
 * @param {{ width: number, height: number, data: Uint8Array | Uint8ClampedArray } | null} image
 * @param {any} m
 */
export function* bakeAlbedoSteps(image, m) {
  const [cr, cg, cb, ca] = (m.color ?? [1, 1, 1, 1]).map((c) => Math.min(Math.max(c, 0), 1));
  const w = image?.width ?? 1, h = image?.height ?? 1;
  const src = image?.data ?? new Uint8Array([255, 255, 255, 255]);
  if (src.length !== w * h * 4) throw new Error(`poi albedo: ${w}x${h} carries ${src.length} bytes`);
  const out = new Uint8Array(w * h * 4);
  const cut = m.alpha === 'cutout' ? Math.min(Math.max(m.cutoff ?? 0.5, 0), 1) : null;
  let work = 0;
  for (let y = 0; y < h; y++) {
    const from = y * w * 4, to = (h - 1 - y) * w * 4;
    for (let x = 0; x < w * 4; x += 4) {
      const i = from + x, o = to + x;
      out[o] = Math.round(src[i] * cr);
      out[o + 1] = Math.round(src[i + 1] * cg);
      out[o + 2] = Math.round(src[i + 2] * cb);
      const a = (src[i + 3] / 255) * ca;
      out[o + 3] = m.alpha === 'blend' ? Math.round(a * 255) : cut !== null ? (a >= cut ? 255 : 0) : 255;
    }
    if ((work += w) >= POI_STEP_UNITS) { work = 0; yield null; }
  }
  if (m.alpha === 'blend' || cut !== null) yield* bleedClearSteps(out, w, h);
  return { width: w, height: h, colors: out };
}

/**
 * @param {Uint8Array} c
 * @param {number} w
 * @param {number} h
 */
export function* bleedClearSteps(c, w, h) {
  const n = w * h;
  const state = new Uint8Array(n);
  let solid = 0, work = 0;
  for (let i = 0; i < n; i++) if (c[i * 4 + 3] > 0) { state[i] = 2; solid++; }
  if (solid === 0 || solid === n) return;
  const ring = new Int32Array(n - solid);
  let end = 0;
  for (let i = 0; i < n; i++) {
    if (state[i] !== 0) continue;
    const x = i % w, y = (i - x) / w;
    near: for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        if (xx >= 0 && xx < w && state[yy * w + xx] === 2) { state[i] = 1; ring[end++] = i; break near; }
      }
    }
    if (++work >= POI_STEP_UNITS) { work = 0; yield null; }
  }
  for (let start = 0; start < end;) {
    const stop = end;
    for (let q = start; q < stop; q++) {
      const i = ring[q], x = i % w, y = (i - x) / w;
      let r = 0, g = 0, b = 0, wt = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (state[j] === 2) {
            const k = c[j * 4 + 3] || 255;
            r += c[j * 4] * k; g += c[j * 4 + 1] * k; b += c[j * 4 + 2] * k; wt += k;
          } else if (state[j] === 0) { state[j] = 1; ring[end++] = j; }
        }
      }
      c[i * 4] = Math.round(r / wt); c[i * 4 + 1] = Math.round(g / wt); c[i * 4 + 2] = Math.round(b / wt);
      if (++work >= POI_STEP_UNITS) { work = 0; yield null; }
    }
    for (let q = start; q < stop; q++) state[ring[q]] = 2;
    start = stop;
  }
}

/**
 * @param {{ width: number, height: number, data: Uint8Array | Uint8ClampedArray } | null} image
 * @param {any} m
 * @param {{ width: number, height: number }} size
 */
export const bakeEmission = (image, m, size) => runSteps(bakeEmissionSteps(image, m, size));

/**
 * @param {{ width: number, height: number, data: Uint8Array | Uint8ClampedArray } | null} image
 * @param {any} m
 * @param {{ width: number, height: number }} size
 */
export function* bakeEmissionSteps(image, m, size) {
  if (!emits(m)) return null;
  const [er, eg, eb] = (m.emissiveColor ?? [0, 0, 0]).map((c) => Math.min(Math.max(c, 0), 1));
  const w = image?.width ?? size.width, h = image?.height ?? size.height;
  const out = new Uint8Array(w * h * 4);
  let work = 0;
  for (let y = 0; y < h; y++) {
    const from = y * w * 4, to = (h - 1 - y) * w * 4;
    for (let x = 0; x < w * 4; x += 4) {
      const i = from + x, o = to + x;
      out[o] = Math.round((image ? image.data[i] : 255) * er);
      out[o + 1] = Math.round((image ? image.data[i + 1] : 255) * eg);
      out[o + 2] = Math.round((image ? image.data[i + 2] : 255) * eb);
      out[o + 3] = 255;
    }
    if ((work += w) >= POI_STEP_UNITS) { work = 0; yield null; }
  }
  return { width: w, height: h, colors: out };
}

/**
 * @param {import('./poiMesh.js').PoiMesh} mesh
 * @param {any[]} materials
 * @param {(m: any) => number} recordOf
 * @param {{ mirrored?: boolean, scale?: number[] | null }} [opts]
 */
export const poiPartModels = (mesh, materials, recordOf, opts = {}) => runSteps(poiPartModelSteps(mesh, materials, recordOf, opts));

/**
 * @param {import('./poiMesh.js').PoiMesh} mesh
 * @param {any[]} materials
 * @param {(m: any) => number} recordOf
 * @param {{ mirrored?: boolean, scale?: number[] | null }} [opts]
 */
export function* poiPartModelSteps(mesh, materials, recordOf, { scale = null, mirrored = !!scale && scale[0] * scale[1] * scale[2] < 0 } = {}) {
  const groups = { opaque: [], translucent: [] };
  mesh.submeshes.forEach((sm, i) => {
    const m = materials[i];
    (m?.alpha === 'blend' ? groups.translucent : groups.opaque).push(i);
  });
  const [sx, sy, sz] = scale ?? [1, 1, 1];
  const scaled = sx !== 1 || sy !== 1 || sz !== 1;
  const V = mesh.positions.length / 3;
  const stamp = new Int32Array(V * 2).fill(-1), slot = new Int32Array(V * 2);
  let gen = 0, work = 0;
  function* build(list) {
    if (!list.length) return null;
    let maxV = 0, maxI = 0;
    for (const i of list) { const k = materials[i].twoSided ? 2 : 1; maxI += mesh.submeshes[i].count * k; maxV += Math.min(V, mesh.submeshes[i].count) * k; }
    const positions = new Float32Array(maxV * 3), normals = new Float32Array(maxV * 3), uvs = new Float32Array(maxV * 2), indices = new Uint32Array(maxI);
    const subMeshes = [];
    let nv = 0, ni = 0;
    for (const i of list) {
      const sm = mesh.submeshes[i];
      const m = materials[i];
      const tt = m.uv && (m.uv.rotation || m.uv.offset[0] || m.uv.offset[1] || m.uv.scale[0] !== 1 || m.uv.scale[1] !== 1) ? m.uv : null;
      const own = gen++;
      const start = ni;
      const vert = (v, flip) => {
        const key = flip ? V + v : v;
        if (stamp[key] === own) return slot[key];
        const at = nv++;
        positions[at * 3] = mesh.positions[v * 3] * sx; positions[at * 3 + 1] = mesh.positions[v * 3 + 1] * sy; positions[at * 3 + 2] = mesh.positions[v * 3 + 2] * sz;
        let nx = mesh.normals[v * 3], ny = mesh.normals[v * 3 + 1], nz = mesh.normals[v * 3 + 2];
        if (scaled) { nx /= sx; ny /= sy; nz /= sz; const l = Math.hypot(nx, ny, nz); if (l > 0) { nx /= l; ny /= l; nz /= l; } }
        const s = flip ? -1 : 1;
        normals[at * 3] = s * nx + 0; normals[at * 3 + 1] = s * ny + 0; normals[at * 3 + 2] = s * nz + 0;
        let u = mesh.uvs[v * 2], w = mesh.uvs[v * 2 + 1];
        if (tt) [u, w] = applyTextureTransform(tt, u, w);
        uvs[at * 2] = u; uvs[at * 2 + 1] = 1 - w;
        stamp[key] = own; slot[key] = at;
        return at;
      };
      const sides = !m.twoSided ? 1 : 2, backFirst = m.twoSided && m.alpha === 'blend';
      for (let side = 0; side < sides; side++) {
        const back = side === 0 ? backFirst : !backFirst;
        for (let k = sm.start; k < sm.start + sm.count; k += 3) {
          const a = mesh.indices[k], b = mesh.indices[k + 1], c = mesh.indices[k + 2];
          if (back !== mirrored) { indices[ni] = vert(a, back); indices[ni + 1] = vert(c, back); indices[ni + 2] = vert(b, back); }
          else { indices[ni] = vert(a, back); indices[ni + 1] = vert(b, back); indices[ni + 2] = vert(c, back); }
          ni += 3;
          if (++work >= POI_STEP_UNITS) { work = 0; yield null; }
        }
      }
      subMeshes.push({ textureArchive: POI_TEXTURE_ARCHIVE, textureRecord: recordOf(m), startIndex: start, primitiveCount: (ni - start) / 3 });
    }
    return { positions: positions.slice(0, nv * 3), normals: normals.slice(0, nv * 3), uvs: uvs.slice(0, nv * 2), indices: indices.slice(0, ni), subMeshes };
  }
  const opaque = yield* build(groups.opaque);
  const translucent = yield* build(groups.translucent);
  return { opaque, translucent };
}

export const det3 = (m) => m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
export const xform = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];

/**
 * @param {any} place
 * @param {number} y
 */
export const placeMatrix = (place, y) => mat4FromQuatPosScale(place.r, [place.x, y, place.z], [place.s, place.s, place.s]);

/**
 * @param {Float32Array} place
 * @param {any} part
 */
export const partMatrix = (place, part) => multiply(place, mat4FromQuatPosScale(part.r, part.t, part.s));

export function boxThrough(m, min, max) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < 8; i++) {
    const p = xform(m, [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]]);
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  }
  return { min: lo, max: hi };
}

/**
 * @param {any} doc
 * @param {Float32Array} place
 */
export const lightsOf = (doc, place) => (doc.lights ?? []).map((l) => ({
  at: xform(place, l.t), range: l.radius * doc.place.s, color: l.color.map((c) => c * l.intensity), intensity: l.intensity, flicker: l.flicker,
}));

/**
 * @param {any} doc
 * @param {Float32Array} place
 */
export const npcsOf = (doc, place) => (doc.npcs ?? []).map((n) => ({
  key: n.key, name: n.name, at: xform(place, n.t), yaw: n.yaw, h: n.h * doc.place.s, look: n.look, lines: n.lines, reach: n.radius,
}));
