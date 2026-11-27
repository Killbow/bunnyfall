// @ts-check
import GATE_BAKE from '../assets/gate/oblivionGate.json' with { type: 'json' };

// A pseudo-archive above every classic ARENA2 archive and clear of the other generated atlases such as
// `BLOOD_ATLAS_ARCHIVE`.
export const GATE_ARCHIVE = 38101;
export const GATE_STONE_RECORD = 0;
export const GATE_PLINTH_RECORD = 1;
export const RITE_SIGIL_RECORD = 2;
export const GATE_SPINE_RECORD = 3;
export const GATE_RIM_RECORD = 4;
export const EG_ARCH_STONE_RECORD = 5;
export const EG_ARCH_SPINE_RECORD = 6;
export const EG_ARCH_RIM_RECORD = 7;
export const EG_ARCH_RECORD_OF = Object.freeze({ [GATE_STONE_RECORD]: EG_ARCH_STONE_RECORD, [GATE_SPINE_RECORD]: EG_ARCH_SPINE_RECORD, [GATE_RIM_RECORD]: EG_ARCH_RIM_RECORD });

const PART = GATE_BAKE.parts[0];
export const GATE_TILE_M = 5;
export const GATE_FOOT_SINK = 1.2;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

const corner = (i) => [PART.positions[i * 3], PART.positions[i * 3 + 1], PART.positions[i * 3 + 2]];
export const GATE_HEIGHT = PART.positions.reduce((m, v, i) => (i % 3 === 1 ? Math.max(m, v) : m), 0);
export const GATE_HALF_W = PART.positions.reduce((m, v, i) => (i % 3 === 0 ? Math.max(m, Math.abs(v)) : m), 0);

export function gatePieces(part = PART) {
  const up = part.polygons.map((_, k) => k);
  const find = (k) => { while (up[k] !== k) k = up[k] = up[up[k]]; return k; };
  const owner = new Map();
  part.polygons.forEach((poly, k) => { for (const v of poly) { if (owner.has(v)) up[find(k)] = find(owner.get(v)); else owner.set(v, k); } });
  const pieces = new Map();
  part.polygons.forEach((_, k) => { const r = find(k); if (!pieces.has(r)) pieces.set(r, []); pieces.get(r).push(k); });
  return [...pieces.values()];
}

export function gateSpines(part = PART) {
  const out = [];
  for (const ks of gatePieces(part)) {
    const tip = part.polygons[ks[0]].find((v) => ks.every((k) => part.polygons[k].includes(v)));
    if (ks.length >= 3 && tip !== undefined) out.push({ polygons: ks, tip });
  }
  return out;
}

export const GATE_PART = Object.freeze({ Stone: 0, Spike: 1 });

export function faces() {
  const byRec = new Map();
  let part = GATE_PART.Stone;
  const tri = (rec, a, b, c, ua, ub, uc) => {
    let g = byRec.get(rec);
    if (!g) byRec.set(rec, g = { p: [], n: [], uv: [], parts: [] });
    g.parts.push(part);
    const n = norm(cross(sub(b, a), sub(c, a)));
    for (const [v, u] of [[a, ua], [b, ub], [c, uc]]) { g.p.push(v[0], v[1], v[2]); g.n.push(n[0], n[1], n[2]); g.uv.push(u[0], u[1]); }
  };
  const quad = (rec, a, b, c, d, ua, ub, uc, ud) => { tri(rec, a, b, c, ua, ub, uc); tri(rec, a, c, d, ua, uc, ud); };
  return { tri, quad, byRec, as: (p) => { part = p; } };
}

export function spike(f, b, w, tip) {
  f.as(GATE_PART.Spike);
  const ax = norm(sub(tip, b));
  const up = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const s1 = norm(cross(ax, up)), s2 = norm(cross(ax, s1));
  const q = [0, 1, 2, 3].map((k) => { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; return [b[0] + (s1[0] * Math.cos(a) + s2[0] * Math.sin(a)) * w, b[1] + (s1[1] * Math.cos(a) + s2[1] * Math.sin(a)) * w, b[2] + (s1[2] * Math.cos(a) + s2[2] * Math.sin(a)) * w]; });
  for (let k = 0; k < 4; k++) {
    const a = q[k], c = q[(k + 1) % 4];
    const n = cross(sub(c, a), sub(tip, a));
    const mid = [(a[0] + c[0] + tip[0]) / 3 - b[0], (a[1] + c[1] + tip[1]) / 3 - b[1], (a[2] + c[2] + tip[2]) / 3 - b[2]];
    if (n[0] * mid[0] + n[1] * mid[1] + n[2] * mid[2] >= 0) f.tri(GATE_STONE_RECORD, a, c, tip, [0, 0], [0.25, 0], [0.12, 0.8]);
    else f.tri(GATE_STONE_RECORD, a, tip, c, [0, 0], [0.12, 0.8], [0.25, 0]);
  }
}

export const ARCH_PROFILE_N = 24;
export const ARCH_Y0 = 0;
export function gateArchTop(part = PART) {
  const at = (i) => [part.positions[i * 3], part.positions[i * 3 + 1], part.positions[i * 3 + 2]];
  let top = Infinity;
  const T = part.triangles;
  for (let t = 0; t < T.length; t += 3) {
    const [a, b, c] = [at(T[t]), at(T[t + 1]), at(T[t + 2])];
    const side = (p, q) => (q[0] - p[0]) * (0 - p[2]) - (q[2] - p[2]) * (0 - p[0]);
    const s1 = side(a, b), s2 = side(b, c), s3 = side(c, a);
    if (!((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0))) continue;
    const y = (s2 * a[1] + s3 * b[1] + s1 * c[1]) / (s1 + s2 + s3);
    if (y > 0.5 && y < top) top = y;
  }
  if (!Number.isFinite(top)) throw new Error('the gate has no stone over its threshold - no opening to hang the fire in');
  return top;
}
export const ARCH_Y1 = gateArchTop();
export const PORTAL_CENTRE_Y = (ARCH_Y0 + ARCH_Y1) / 2;

/**
 * @param {ArrayLike<number>} P
 * @param {number} y
 */
export function gateClearAt(P, y) {
  let clear = Infinity;
  for (let i = 0; i < P.length; i += 9) {
    let lo = Infinity, hi = -Infinity;
    for (let e = 0; e < 3; e++) {
      const a = i + e * 3, b = i + ((e + 1) % 3) * 3, ya = P[a + 1] - y, yb = P[b + 1] - y;
      if ((ya < 0 && yb < 0) || (ya > 0 && yb > 0) || ya === yb) continue;
      const x = P[a] + (P[b] - P[a]) * (ya / (ya - yb));
      lo = Math.min(lo, x); hi = Math.max(hi, x);
    }
    if (lo <= hi) clear = Math.min(clear, lo <= 0 && hi >= 0 ? 0 : Math.min(Math.abs(lo), Math.abs(hi)));
  }
  return clear;
}
const BAKE_SOUP = Float64Array.from(PART.triangles.flatMap((v) => corner(v)));
// Heights stay 1 mm inside both ends: a lintel corner in single precision sits about 1e-7 below `ARCH_Y1`, in the
// lintel plane.
const cornerHeights = (P) => [...new Set(Array.from({ length: P.length / 3 }, (_, i) => P[i * 3 + 1]))].filter((y) => y > ARCH_Y0 + 1e-3 && y < ARCH_Y1 - 1e-3);
export const GATE_OPEN_HALF_W = Math.max(...cornerHeights(BAKE_SOUP).map((y) => gateClearAt(BAKE_SOUP, y)).filter(Number.isFinite));

/**
 * `n` must be the triangle normal, not the quad normal: some baked quads are 0.3 to 0.4 m out of plane and would
 * stretch the texels.
 * @param {number[]} p
 * @param {number[]} n
 */
export function gateFaceUv(p, n) {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  if (ay >= ax && ay >= az) return [p[0] / GATE_TILE_M, p[2] / GATE_TILE_M];
  if (ax >= az) return [p[2] / GATE_TILE_M, p[1] / GATE_TILE_M];
  return [p[0] / GATE_TILE_M, p[1] / GATE_TILE_M];
}

export const RIM_REACH_M = 0.5;
/**
 * @param {number[]} c
 * @param {number[]} n
 */
export function gateRimFace(c, n) {
  if (!(Math.abs(c[0]) < GATE_OPEN_HALF_W + RIM_REACH_M)) return false;
  if (n[0] * Math.sign(c[0]) < -0.5 && Math.abs(n[2]) < 0.5) return true;
  return n[1] < -0.3 && c[1] > ARCH_Y0 + 1;
}

function laidFaces() {
  const trisOf = PART.polygons.map(() => []);
  PART.triangleOf.forEach((k, t) => trisOf[k].push([PART.triangles[t * 3], PART.triangles[t * 3 + 1], PART.triangles[t * 3 + 2]]));
  const tipOf = new Map(gateSpines().flatMap((s) => s.polygons.map((k) => [k, s.tip])));
  const pieceOf = [];
  gatePieces().forEach((ks, i) => { for (const k of ks) pieceOf[k] = i; });
  const out = [];
  PART.polygons.forEach((poly, k) => {
    const piece = pieceOf[k];
    if (tipOf.has(k)) { for (const ids of trisOf[k]) out.push({ k, piece, kind: 'spine', tri: ids.map(corner), ids }); return; }
    if (poly.every((v) => Math.abs(corner(v)[1]) < 1e-3)) {
      const down = (p) => [p[0], p[1] - GATE_FOOT_SINK, p[2]];
      for (let i = 0; i < poly.length; i++) {
        const a = corner(poly[i]), b = corner(poly[(i + 1) % poly.length]);
        out.push({ k, piece, kind: 'wall', tri: [a, b, down(b)] }, { k, piece, kind: 'wall', tri: [a, down(b), down(a)] });
      }
      for (const ids of trisOf[k]) out.push({ k, piece, kind: 'sole', tri: ids.map((v) => down(corner(v))) });
      return;
    }
    for (const ids of trisOf[k]) out.push({ k, piece, kind: 'stone', tri: ids.map(corner) });
  });
  return out;
}

export function buildGateModel() {
  const f = faces();
  const tipOf = new Map(gateSpines().flatMap((s) => s.polygons.map((k) => [k, s.tip])));
  for (const { k, kind, tri: [a, b, c], ids } of laidFaces()) {
    if (kind === 'spine') {
      f.as(GATE_PART.Spike);
      const tip = tipOf.get(k), roots = PART.polygons[k].filter((v) => v !== tip);
      const uvOf = (v) => (v === tip ? [0.5, 1] : v === roots[0] ? [0, 0] : [1, 0]);
      f.tri(GATE_SPINE_RECORD, a, b, c, uvOf(ids[0]), uvOf(ids[1]), uvOf(ids[2]));
      continue;
    }
    f.as(GATE_PART.Stone);
    const n = norm(cross(sub(b, a), sub(c, a)));
    const mid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const lay = (p) => gateFaceUv(p, n);
    f.tri(gateRimFace(mid, n) ? GATE_RIM_RECORD : GATE_STONE_RECORD, a, b, c, lay(a), lay(b), lay(c));
  }
  const recs = [...f.byRec.keys()].sort((a, b) => a - b);
  const count = recs.reduce((n, r) => n + f.byRec.get(r).p.length / 3, 0);
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), uvs = new Float32Array(count * 2);
  const parts = new Uint8Array(count / 3);
  const indices = new Uint32Array(count);
  const subMeshes = [];
  let v = 0;
  for (const rec of recs) {
    const g = f.byRec.get(rec);
    const n = g.p.length / 3;
    positions.set(g.p, v * 3); normals.set(g.n, v * 3); uvs.set(g.uv, v * 2); parts.set(g.parts, v / 3);
    for (let i = 0; i < n; i++) indices[v + i] = v + i;
    subMeshes.push({ textureArchive: GATE_ARCHIVE, textureRecord: rec, startIndex: v, primitiveCount: n / 3 });
    v += n;
  }
  return { positions, normals, uvs, indices, subMeshes, triangles: positions, parts };
}

/**
 * The pass draws the fire edge as a straight line between profile heights. Where a stone corner falls between two
 * samples, both are lowered by what that line would overrun.
 * @param {{positions: Float32Array}} [model]
 * @param {number} [margin]
 */
export function gateArchProfile(model = buildGateModel(), margin = 0.15) {
  const out = new Float32Array(ARCH_PROFILE_N);
  const P = model.positions;
  const band = (ARCH_Y1 - ARCH_Y0) / (ARCH_PROFILE_N - 1);
  const at = (k) => Math.min(ARCH_Y1 - 1e-3, Math.max(ARCH_Y0 + 1e-3, ARCH_Y0 + k * band));
  for (let k = 0; k < ARCH_PROFILE_N; k++) out[k] = gateClearAt(P, at(k));
  for (let k = 0; k < ARCH_PROFILE_N; k++) out[k] = Number.isFinite(out[k]) ? Math.max(0, out[k] - margin) : 0;
  const bends = cornerHeights(P);
  for (let k = 0; k + 1 < ARCH_PROFILE_N; k++) {
    const y0 = ARCH_Y0 + k * band, y1 = ARCH_Y0 + (k + 1) * band;
    let over = 0;
    for (const y of bends) {
      if (!(y > y0 && y < y1)) continue;
      const line = out[k] + (out[k + 1] - out[k]) * ((y - y0) / band);
      over = Math.max(over, line - (gateClearAt(P, y) - margin));
    }
    if (over > 0) { out[k] = Math.max(0, out[k] - over); out[k + 1] = Math.max(0, out[k + 1] - over); }
  }
  return out;
}

// Each piece is closed on its own, spine roots capped, because the open spine cones would flip ray parity through
// the pillars.
export function gateSolids() {
  const byPiece = new Map();
  for (const f of laidFaces()) { if (!byPiece.has(f.piece)) byPiece.set(f.piece, []); byPiece.get(f.piece).push(...f.tri.flat()); }
  const pieceOf = [];
  gatePieces().forEach((ks, i) => { for (const k of ks) pieceOf[k] = i; });
  for (const { polygons, tip } of gateSpines()) {
    const roots = [...new Set(polygons.flatMap((k) => PART.polygons[k]))].filter((v) => v !== tip);
    byPiece.get(pieceOf[polygons[0]]).push(...roots.flatMap((v) => corner(v)));
  }
  return [...byPiece.values()].map((a) => Float64Array.from(a));
}
let _solids = null;
const INSIDE_RAY = norm([0.4813, 0.6127, 0.6271]);
/** @param {number[]} p */
export function insideGateStone(p) {
  const solids = (_solids ??= gateSolids()), d = INSIDE_RAY;
  for (const T of solids) {
    let hits = 0;
    for (let i = 0; i < T.length; i += 9) {
      const e1 = [T[i + 3] - T[i], T[i + 4] - T[i + 1], T[i + 5] - T[i + 2]], e2 = [T[i + 6] - T[i], T[i + 7] - T[i + 1], T[i + 8] - T[i + 2]];
      const h = cross(d, e2), det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
      if (Math.abs(det) < 1e-12) continue;
      const s = [p[0] - T[i], p[1] - T[i + 1], p[2] - T[i + 2]];
      const u = (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]) / det;
      if (u < 0 || u > 1) continue;
      const q = cross(s, e1), v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det;
      if (v < 0 || u + v > 1) continue;
      if ((e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det > 0) hits++;
    }
    if (hits % 2) return true;
  }
  return false;
}
