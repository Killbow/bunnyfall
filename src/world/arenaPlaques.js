// @ts-check

import { registerCustomModel } from './customModels.js';

export const PLAQUE_MODEL = 864110;
export const PLAQUE_BARE_MODEL = 864111;
export const PLAQUE_MAX = 10;
export const PLAQUE_W = 0.8;
export const PLAQUE_H = 0.62;
export const PLAQUE_D = 0.05;
export const PLAQUE_PICTURE = Object.freeze({ archive: 48, record: 3, w: 0.66, h: 0.48 });
export const PLAQUE_GAP_M = 1;
export const PLAQUE_UP_M = 1.65;
export const PLAQUE_LOOK_M = 7;
export const PLAQUE_OFF_M = 0.02;
export const PLAQUE_FLAT_M = 0.2;
export const PLAQUE_WOOD = Object.freeze([0, 46]);
const WAYS = Object.freeze(Array.from({ length: 8 }, (_, i) => Object.freeze([Math.sin((i * Math.PI) / 4), Math.cos((i * Math.PI) / 4)])));

export function plaqueModel(picture = true) {
  /** @type {Map<string, { archive: number, record: number, p: number[], n: number[], uv: number[], i: number[] }>} */
  const groups = new Map();
  const quad = (tex, pts, n, uv = [[0, 0], [1, 0], [1, -1], [0, -1]]) => {
    const key = `${tex[0]}_${tex[1]}`;
    if (!groups.has(key)) groups.set(key, { archive: tex[0], record: tex[1], p: [], n: [], uv: [], i: [] });
    const g = /** @type {any} */ (groups.get(key));
    // Wound so cross(b - a, c - a) points along the normal, the front face.
    const [a, b, c] = pts;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const order = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0 ? [0, 3, 2, 0, 2, 1] : [0, 1, 2, 0, 2, 3];
    const base = g.p.length / 3;
    for (let k = 0; k < 4; k++) { g.p.push(...pts[k]); g.n.push(...n); g.uv.push(...uv[k]); }
    for (const k of order) g.i.push(base + k);
  };
  const W = PLAQUE_W / 2, H = PLAQUE_H / 2, D = PLAQUE_D;
  const face = [[W, H, D], [-W, H, D], [-W, -H, D], [W, -H, D]];
  const back = face.map(([x, y]) => [x, y, 0]);
  if (picture) {
    // The picture sits slightly in front of the wood so the two never z-fight.
    const pw = PLAQUE_PICTURE.w / 2, ph = PLAQUE_PICTURE.h / 2, z = D + 0.008;
    quad([PLAQUE_PICTURE.archive, PLAQUE_PICTURE.record], [[pw, ph, z], [-pw, ph, z], [-pw, -ph, z], [pw, -ph, z]], [0, 0, 1]);
  }
  quad(PLAQUE_WOOD, face, [0, 0, 1]);
  for (let k = 0; k < 4; k++) {
    const a = face[k], b = face[(k + 1) % 4], c = back[(k + 1) % 4], d = back[k];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, l = Math.hypot(mx, my) || 1;
    quad(PLAQUE_WOOD, [a, b, c, d], [mx / l, my / l, 0]);
  }
  quad(PLAQUE_WOOD, [back[3], back[2], back[1], back[0]], [0, 0, -1]);
  let nv = 0, ni = 0;
  for (const g of groups.values()) { nv += g.p.length / 3; ni += g.i.length; }
  const positions = new Float32Array(nv * 3), normals = new Float32Array(nv * 3), uvs = new Float32Array(nv * 2), indices = new Uint32Array(ni);
  const subMeshes = [];
  let v = 0, i = 0;
  for (const g of groups.values()) {
    positions.set(g.p, v * 3); normals.set(g.n, v * 3); uvs.set(g.uv, v * 2);
    for (let k = 0; k < g.i.length; k++) indices[i + k] = g.i[k] + v;
    subMeshes.push({ textureArchive: g.archive, textureRecord: g.record, startIndex: i, primitiveCount: g.i.length / 3 });
    v += g.p.length / 3; i += g.i.length;
  }
  return { positions, normals, uvs, indices, subMeshes, doors: [] };
}

let _registered = false;
export function registerArenaPlaques() {
  if (_registered) return;
  _registered = true;
  registerCustomModel(PLAQUE_MODEL, () => plaqueModel(true));
  registerCustomModel(PLAQUE_BARE_MODEL, () => plaqueModel(false));
}
export const _resetArenaPlaques = () => { _registered = false; };

/**
 * @param {number[]|null} at
 * @param {(o: number[], d: number[], max: number) => number} ray
 * @param {{ max?: number }} [o]
 */
export function hallPlaquePlan(at, ray, { max = PLAQUE_MAX } = {}) {
  if (!Array.isArray(at) || !at.slice(0, 3).every(Number.isFinite) || typeof ray !== 'function') return null;
  const drop = ray([at[0], at[1] + 0.5, at[2]], [0, -1, 0], 8);
  if (!Number.isFinite(drop)) return null;
  const floor = at[1] + 0.5 - drop;
  const y = floor + PLAQUE_UP_M;
  let way = null, dist = Infinity;
  for (const w of WAYS) {
    const d = ray([at[0], y, at[2]], [w[0], 0, w[1]], PLAQUE_LOOK_M);
    if (Number.isFinite(d) && d < dist - 1e-6) { dist = d; way = w; }
  }
  if (!way) return null;
  const right = [way[1], -way[0]];
  const yawDeg = (Math.atan2(-way[0], -way[1]) * 180) / Math.PI;
  const spots = [];
  const n = Math.max(0, Math.floor(max));
  for (let t = 0; spots.length < n && t < n * 2 + 1; t++) {
    const s = (t % 2 ? 1 : -1) * Math.ceil(t / 2) * PLAQUE_GAP_M;
    const lat = Math.abs(s), dir = [right[0] * Math.sign(s || 1), right[1] * Math.sign(s || 1)];
    if (lat > 0) { const clear = ray([at[0], y, at[2]], [dir[0], 0, dir[1]], lat + PLAQUE_W / 2); if (Number.isFinite(clear) && clear < lat + PLAQUE_W / 2) continue; }
    const x0 = at[0] + right[0] * s, z0 = at[2] + right[1] * s;
    const d = ray([x0, y, z0], [way[0], 0, way[1]], dist + PLAQUE_FLAT_M + 0.5);
    if (!Number.isFinite(d) || Math.abs(d - dist) > PLAQUE_FLAT_M) continue;
    const back = d - PLAQUE_OFF_M;
    spots.push({ s, pos: [x0 + way[0] * back, y, z0 + way[1] * back] });
  }
  spots.sort((a, b) => a.s - b.s);
  return { floor, wall: [way[0], way[1]], plaques: spots.map((p, k) => ({ pos: p.pos, yawDeg, k })) };
}
