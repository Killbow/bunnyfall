// @ts-check
import { YARD_ARCHIVE, YARD_REC } from './merchantYardArt.js';
import { YARD_FOOT } from './merchantYardSites.js';

export const YARD_TILE_M = 1.2;
export const YARD_SINK = 0.3;
export const YARD_FLOOR_Y = 0.025;
export const SIGN_BOARD = Object.freeze({ w: 1.6, h: 0.7, t: 0.06 });

export const STABLE_YARD = Object.freeze({
  fence: Object.freeze({ x0: -6.5, x1: 6.5, z0: -5.75, z1: 4.25, h: 1.35, rails: Object.freeze([0.55, 1.1]) }),
  gate: Object.freeze({ half: 1.6, postH: 3.5, beamY: 3.3 }),
  shed: Object.freeze({ z0: -5.75, z1: -2.55, backH: 3.2, frontH: 2.55 }),
  horses: Object.freeze([[-3.8, 1.0, 0.8, 0.6], [0.2, -1.0, -0.2, -1], [3.4, 0.6, -0.6, 0.8]].map((h) => Object.freeze(h))),
  keeper: Object.freeze([2.2, 3.5]),
});
export const WAGON_YARD = Object.freeze({
  fence: Object.freeze({ x0: -8.5, x1: 8.5, z0: -6.75, z1: 5.25, h: 1.1, rails: Object.freeze([0.5, 0.95]) }),
  opening: 6.2,
  shed: Object.freeze({ z0: -6.75, z1: -4.35, backH: 3.0, frontH: 2.5 }),
  post: Object.freeze({ x: -7.6, z: 6.15, h: 3.6, armY: 3.3, armTo: -5.4 }),
  wagons: Object.freeze([['cart', -5.6, 0.4], ['openWagon', 0, 0.4], ['caravan', 5.6, 0.4]].map((w) => Object.freeze(w))),
  keeper: Object.freeze([-5.2, 5.7]),
});

export const CARPENTER_YARD = Object.freeze({
  fence: Object.freeze({ x0: -6.5, x1: 6.5, z1: 4.5, h: 1.1, rails: Object.freeze([0.5, 0.95]) }),
  gate: Object.freeze({ half: 1.8, postH: 3.5, beamY: 3.3 }),
  shop: Object.freeze({ z0: -6, z1: -2.6, backH: 3.3, frontH: 2.7 }),
  bench: Object.freeze([-1.7, 0.88, -5.6, 1.7, 0.98, -4.85]),
  keeper: Object.freeze([-2.6, 3.1]),
});

/**
 * @param {number[]} a
 * @param {number[]} b
 */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
/**
 * @param {number[]} a
 * @param {number[]} b
 */
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** @param {number[]} a */
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
/**
 * @param {number[]} a
 * @param {number[]} b
 */
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function faces() {
  /** @type {Map<number, {p: number[], n: number[], uv: number[], hung: boolean[]}>} */
  const byRec = new Map();
  let hanging = false;
  const tri = (rec, a, b, c, ua, ub, uc) => {
    let g = byRec.get(rec);
    if (!g) byRec.set(rec, g = { p: [], n: [], uv: [], hung: [] });
    const n = norm(cross(sub(b, a), sub(c, a)));
    for (const [v, u] of [[a, ua], [b, ub], [c, uc]]) { g.p.push(v[0], v[1], v[2]); g.n.push(n[0], n[1], n[2]); g.uv.push(u[0], u[1]); }
    g.hung.push(hanging);
  };
  const quad = (rec, a, b, c, d, ua, ub, uc, ud, out) => {
    if (dot(cross(sub(b, a), sub(c, a)), out) < 0) { tri(rec, a, d, c, ua, ud, uc); tri(rec, a, c, b, ua, uc, ub); return; }
    tri(rec, a, b, c, ua, ub, uc); tri(rec, a, c, d, ua, uc, ud);
  };
  const hang = (/** @type {boolean} */ on) => { hanging = on; };
  return { tri, quad, byRec, hang };
}

function uvOf(p, n) {
  const T = YARD_TILE_M;
  if (Math.abs(n[1]) > 0.7) return [p[0] / T, p[2] / T];
  if (Math.abs(n[0]) > Math.abs(n[2])) return [p[2] / T, -p[1] / T];
  return [p[0] / T, -p[1] / T];
}

function hexa(f, rec, c, { top = rec, under = false, uv = uvOf } = {}) {
  const [a0, b0, c0, d0, a1, b1, c1, d1] = c;
  const mid = c.reduce((m, p) => [m[0] + p[0] / 8, m[1] + p[1] / 8, m[2] + p[2] / 8], [0, 0, 0]);
  const face = (r, p, q, s, t) => {
    const fm = [(p[0] + q[0] + s[0] + t[0]) / 4, (p[1] + q[1] + s[1] + t[1]) / 4, (p[2] + q[2] + s[2] + t[2]) / 4];
    const out = norm(sub(fm, mid));
    let n = norm(cross(sub(q, p), sub(s, p)));
    if (dot(n, out) < 0) n = [-n[0], -n[1], -n[2]];
    f.quad(r, p, q, s, t, uv(p, n), uv(q, n), uv(s, n), uv(t, n), out);
  };
  face(rec, a0, b0, b1, a1);
  face(rec, b0, c0, c1, b1);
  face(rec, c0, d0, d1, c1);
  face(rec, d0, a0, a1, d1);
  face(top, a1, b1, c1, d1);
  if (under) face(rec, a0, b0, c0, d0);
}
const box = (f, rec, x0, y0, z0, x1, y1, z1, o = {}) => hexa(f, rec, [
  [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
], o);
const post = (f, x, z, h, s = 0.16, rec = YARD_REC.wood) => box(f, rec, x - s / 2, -YARD_SINK, z - s / 2, x + s / 2, h, z + s / 2);

function fenceRun(f, x0, z0, x1, z1, { h, rails, step = 2.2, s = 0.16, rail = [0.08, 0.14], ends = true }) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(len / step));
  const at = (k) => [x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n];
  for (let k = ends ? 0 : 1; k <= (ends ? n : n - 1); k++) { const [x, z] = at(k); post(f, x, z, h, s); }
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const [t, hh] = rail;
  for (const y of rails) {
    if (alongX) box(f, YARD_REC.wood, Math.min(x0, x1), y - hh / 2, z0 - t / 2, Math.max(x0, x1), y + hh / 2, z0 + t / 2, { under: true });
    else box(f, YARD_REC.wood, x0 - t / 2, y - hh / 2, Math.min(z0, z1), x0 + t / 2, y + hh / 2, Math.max(z0, z1), { under: true });
  }
}

function floor(f, rec, x0, z0, x1, z1) {
  const y = YARD_FLOOR_Y, up = [0, 1, 0];
  const P = (x, z) => [x, y, z], U = (x, z) => [x / YARD_TILE_M, z / YARD_TILE_M];
  f.quad(rec, P(x0, z0), P(x1, z0), P(x1, z1), P(x0, z1), U(x0, z0), U(x1, z0), U(x1, z1), U(x0, z1), up);
}

function leanTo(f, { x0, x1, z0, z1, backH, frontH, posts, stalls = [], stallH = 1.4, stallTo = z1 - 0.6 }) {
  const W = 0.15, slope = (z) => backH + ((frontH - backH) * (z - z0)) / (z1 - z0);
  box(f, YARD_REC.plank, x0, -YARD_SINK, z0, x1, backH, z0 + W);
  for (const [a, b] of [[x0, x0 + W], [x1 - W, x1]]) {
    hexa(f, YARD_REC.plank, [
      [a, -YARD_SINK, z0 + W], [b, -YARD_SINK, z0 + W], [b, -YARD_SINK, z1], [a, -YARD_SINK, z1],
      [a, slope(z0 + W), z0 + W], [b, slope(z0 + W), z0 + W], [b, slope(z1), z1], [a, slope(z1), z1],
    ]);
  }
  for (const x of posts) post(f, x, z1 - 0.1, slope(z1 - 0.1), 0.18);
  for (const x of stalls) box(f, YARD_REC.plank, x - 0.04, 0, z0 + W, x + 0.04, stallH, stallTo);
  const o = 0.3, t = 0.12, zb = z0 - 0.2, zf = z1 + 0.35, yb = slope(zb) + 0.12, yf = slope(zf) + 0.12;
  hexa(f, YARD_REC.plank, [
    [x0 - o, yb - t, zb], [x1 + o, yb - t, zb], [x1 + o, yf - t, zf], [x0 - o, yf - t, zf],
    [x0 - o, yb, zb], [x1 + o, yb, zb], [x1 + o, yf, zf], [x0 - o, yf, zf],
  ], { top: YARD_REC.shingle, under: true, uv: (p, n) => (n[1] > 0.7 ? [p[0] / YARD_TILE_M, (p[2] - zb) / YARD_TILE_M] : uvOf(p, n)) });
}

// The board hangs: drawn and hit by rays but not solid to bodies, because at 2.4 m it sits inside a rider capsule
// under the gate beam.
function signboard(f, rec, x, yMid, z, hangTo) {
  f.hang(true);
  const { w, h, t } = SIGN_BOARD, x0 = x - w / 2, x1 = x + w / 2, y0 = yMid - h / 2, y1 = yMid + h / 2, z0 = z - t / 2, z1 = z + t / 2;
  // The world is left-handed, so from the street looking along -z, +x is on the viewer's left and the left edge of
  // the picture is at x1.
  f.quad(rec, [x1, y1, z1], [x0, y1, z1], [x0, y0, z1], [x1, y0, z1], [0, 0], [1, 0], [1, 1], [0, 1], [0, 0, 1]);
  // From inside the yard looking along +z, +x is on the right, so the left edge is at x0.
  f.quad(rec, [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0], [0, 0], [1, 0], [1, 1], [0, 1], [0, 0, -1]);
  const e = [0, 0], g = [0.1, 1];
  f.quad(YARD_REC.wood, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], e, g, g, e, [0, 1, 0]);
  f.quad(YARD_REC.wood, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], e, g, g, e, [0, -1, 0]);
  f.quad(YARD_REC.wood, [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], e, g, g, e, [-1, 0, 0]);
  f.quad(YARD_REC.wood, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], e, g, g, e, [1, 0, 0]);
  for (const rx of [x0 + 0.12, x1 - 0.12]) box(f, YARD_REC.iron, rx - 0.015, y1, z - 0.015, rx + 0.015, hangTo, z + 0.015);
  f.hang(false);
}

function wheel(f, c, r, lean, { spokes = 10, half = 0.05 } = {}) {
  const cl = Math.cos(lean), sl = Math.sin(lean);
  const P = (u, v, w) => [c[0] + u, c[1] + v * cl + w * sl, c[2] - v * sl + w * cl];
  const ring = (rec, r0, r1, n = 16) => {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, b = ((k + 1) / n) * Math.PI * 2;
      const pts = (rr, ang, x) => P(Math.cos(ang) * rr, Math.sin(ang) * rr, x);
      hexa(f, rec, [pts(r0, a, -half), pts(r1, a, -half), pts(r1, b, -half), pts(r0, b, -half), pts(r0, a, half), pts(r1, a, half), pts(r1, b, half), pts(r0, b, half)]);
    }
  };
  ring(YARD_REC.iron, r - 0.04, r);
  ring(YARD_REC.wood, r - 0.12, r - 0.04);
  ring(YARD_REC.iron, 0.04, 0.12, 8);
  for (let k = 0; k < spokes; k++) {
    const a = (k / spokes) * Math.PI * 2, s = 0.025;
    const along = [Math.cos(a), Math.sin(a)], across = [-Math.sin(a), Math.cos(a)];
    const at = (rr, w, x) => P(along[0] * rr + across[0] * w, along[1] * rr + across[1] * w, x);
    hexa(f, YARD_REC.wood, [at(0.12, -s, -half / 2), at(r - 0.12, -s, -half / 2), at(r - 0.12, s, -half / 2), at(0.12, s, -half / 2),
      at(0.12, -s, half / 2), at(r - 0.12, -s, half / 2), at(r - 0.12, s, half / 2), at(0.12, s, half / 2)]);
  }
}

function drum(f, rec, x, z, sides, r0, r1, y0, y1, top = rec) {
  for (let k = 0; k < sides; k++) {
    const a = (k / sides) * Math.PI * 2, b = ((k + 1) / sides) * Math.PI * 2;
    const p = (r, ang, y) => [x + Math.cos(ang) * r, y, z + Math.sin(ang) * r];
    const out = [Math.cos((a + b) / 2), 0, Math.sin((a + b) / 2)];
    const v = (y1 - y0) / YARD_TILE_M, u = ((r0 + r1) * Math.PI) / sides / YARD_TILE_M;
    f.quad(rec, p(r0, a, y0), p(r0, b, y0), p(r1, b, y1), p(r1, a, y1), [0, v], [u, v], [u, 0], [0, 0], out);
    if (r1 > 0) f.tri(top, [x, y1, z], p(r1, b, y1), p(r1, a, y1), [0.5, 0.5], [0.5 + Math.cos(b) * 0.4, 0.5 + Math.sin(b) * 0.4], [0.5 + Math.cos(a) * 0.4, 0.5 + Math.sin(a) * 0.4]);
  }
}

function logZ(f, x, yc, z0, z1, r, sides = 9) {
  const p = (a, z) => [x + Math.cos(a) * r, yc + Math.sin(a) * r, z];
  const T = YARD_TILE_M, round = (2 * Math.PI * r) / sides / T;
  for (let k = 0; k < sides; k++) {
    const a = (k / sides) * Math.PI * 2, b = ((k + 1) / sides) * Math.PI * 2, m = (a + b) / 2;
    f.quad(YARD_REC.bark, p(a, z0), p(b, z0), p(b, z1), p(a, z1), [z0 / T, k * round], [z0 / T, (k + 1) * round], [z1 / T, (k + 1) * round], [z1 / T, k * round], [Math.cos(m), Math.sin(m), 0]);
    const ua = [0.5 + Math.cos(a) * 0.48, 0.5 - Math.sin(a) * 0.48], ub = [0.5 + Math.cos(b) * 0.48, 0.5 - Math.sin(b) * 0.48];
    f.tri(YARD_REC.endgrain, [x, yc, z1], p(a, z1), p(b, z1), [0.5, 0.5], ua, ub);
    f.tri(YARD_REC.endgrain, [x, yc, z0], p(b, z0), p(a, z0), [0.5, 0.5], ub, ua);
  }
}
function beam(f, rec, P, Q, half) {
  const d = norm(sub(Q, P)), ref = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(cross(d, ref)), v = cross(d, u);
  const at = (o, su, sv) => [o[0] + (u[0] * su + v[0] * sv) * half, o[1] + (u[1] * su + v[1] * sv) * half, o[2] + (u[2] * su + v[2] * sv) * half];
  hexa(f, rec, [at(P, -1, -1), at(P, 1, -1), at(P, 1, 1), at(P, -1, 1), at(Q, -1, -1), at(Q, 1, -1), at(Q, 1, 1), at(Q, -1, 1)], { under: true });
}
function furniture(f, x, z, w, d, y, { t = 0.05, leg = 0.05, back = 0, backZ = -1, rail = true, rec = YARD_REC.plank, top = YARD_REC.wood } = {}) {
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
  box(f, rec, x0, y - t, z0, x1, y, z1, { top, under: true });
  for (const [lx, lz] of [[x0 + leg, z0 + leg], [x1 - leg, z0 + leg], [x1 - leg, z1 - leg], [x0 + leg, z1 - leg]]) {
    const tall = back > 0 && Math.sign(lz - z) === backZ;
    box(f, YARD_REC.wood, lx - leg / 2, 0, lz - leg / 2, lx + leg / 2, tall ? y + back : y - t, lz + leg / 2);
  }
  if (back > 0 && rail) { const bz = backZ < 0 ? z0 + leg : z1 - leg; box(f, YARD_REC.wood, x0 + leg / 2, y + back - 0.08, bz - leg / 2, x1 - leg / 2, y + back - 0.02, bz + leg / 2); }
}

function assemble(f, archive = YARD_ARCHIVE) {
  const recs = [...f.byRec.keys()].sort((a, b) => a - b);
  const count = recs.reduce((n, r) => n + f.byRec.get(r).p.length / 3, 0);
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), uvs = new Float32Array(count * 2);
  const indices = new Uint32Array(count);
  const subMeshes = [];
  // One mark per triangle, where 1 is a hung sign that rays hit and bodies pass, as the `sight` argument of
  // collider `addMesh` expects.
  const sight = new Uint8Array(count / 3);
  let v = 0;
  for (const rec of recs) {
    const g = f.byRec.get(rec), n = g.p.length / 3;
    positions.set(g.p, v * 3); normals.set(g.n, v * 3); uvs.set(g.uv, v * 2);
    for (let i = 0; i < n; i++) indices[v + i] = v + i;
    for (let k = 0; k < n / 3; k++) sight[v / 3 + k] = g.hung[k] ? 1 : 0;
    subMeshes.push({ textureArchive: archive, textureRecord: rec, startIndex: v, primitiveCount: n / 3 });
    v += n;
  }
  return { positions, normals, uvs, indices, subMeshes, sight };
}

export function buildStableModel() {
  const f = faces(), F = STABLE_YARD.fence, G = STABLE_YARD.gate, S = STABLE_YARD.shed;
  floor(f, YARD_REC.dirt, F.x0 + 0.05, S.z0 + 0.15, F.x1 - 0.05, F.z1 - 0.05);
  leanTo(f, { x0: F.x0, x1: F.x1, z0: S.z0, z1: S.z1, backH: S.backH, frontH: S.frontH, posts: [F.x0 + 0.1, -2.15, 2.15, F.x1 - 0.1], stalls: [-2.15, 2.15] });
  const fence = { h: F.h, rails: F.rails };
  fenceRun(f, F.x0, S.z1, F.x0, F.z1, fence);
  fenceRun(f, F.x1, S.z1, F.x1, F.z1, fence);
  fenceRun(f, F.x0, F.z1, -G.half, F.z1, { ...fence, ends: false });
  fenceRun(f, G.half, F.z1, F.x1, F.z1, { ...fence, ends: false });
  for (const x of [-G.half, G.half]) post(f, x, F.z1, G.postH, 0.24);
  box(f, YARD_REC.wood, -G.half - 0.35, G.beamY, F.z1 - 0.12, G.half + 0.35, G.beamY + 0.22, F.z1 + 0.12, { under: true });
  signboard(f, YARD_REC.signStable, 0, G.beamY - 0.2 - SIGN_BOARD.h / 2, F.z1, G.beamY);
  for (const [x, y] of [[-5.2, 0], [-4.05, 0], [-4.62, 0.5]]) box(f, YARD_REC.hay, x - 0.5, y, S.z0 + 0.35, x + 0.5, y + 0.5, S.z0 + 0.95);
  box(f, YARD_REC.plank, -1.6, 0.6, S.z0 + 0.15, 1.6, 1.0, S.z0 + 0.7, { top: YARD_REC.hay, under: true });
  drum(f, YARD_REC.hay, 4.3, -4.3, 7, 1.0, 0.25, 0, 0.85);
  const tx0 = 5.25, tx1 = 6.05, tz0 = -1.2, tz1 = 1.4, th = 0.6, w = 0.06;
  box(f, YARD_REC.plank, tx0, 0, tz0, tx1, 0.12, tz1);
  box(f, YARD_REC.plank, tx0, 0, tz0, tx0 + w, th, tz1);
  box(f, YARD_REC.plank, tx1 - w, 0, tz0, tx1, th, tz1);
  box(f, YARD_REC.plank, tx0, 0, tz0, tx1, th, tz0 + w);
  box(f, YARD_REC.plank, tx0, 0, tz1 - w, tx1, th, tz1);
  f.quad(YARD_REC.water, [tx0 + w, 0.48, tz0 + w], [tx1 - w, 0.48, tz0 + w], [tx1 - w, 0.48, tz1 - w], [tx0 + w, 0.48, tz1 - w], [0, 0], [1, 0], [1, 2], [0, 2], [0, 1, 0]);
  fenceRun(f, 3.0, YARD_FOOT.stable.hz - 0.55, 5.6, YARD_FOOT.stable.hz - 0.55, { h: 1.1, rails: [1.0], s: 0.14 });
  return assemble(f);
}

export function buildTransportModel() {
  const f = faces(), F = WAGON_YARD.fence, S = WAGON_YARD.shed, P = WAGON_YARD.post;
  floor(f, YARD_REC.gravel, F.x0 + 0.05, S.z0 + 0.15, F.x1 - 0.05, F.z1 - 0.05);
  leanTo(f, { x0: F.x0, x1: F.x1, z0: S.z0, z1: S.z1, backH: S.backH, frontH: S.frontH, posts: [F.x0 + 0.1, -2.8, 2.8, F.x1 - 0.1] });
  const fence = { h: F.h, rails: F.rails, step: 2.4 };
  fenceRun(f, F.x0, S.z1, F.x0, F.z1, fence);
  fenceRun(f, F.x1, S.z1, F.x1, F.z1, fence);
  fenceRun(f, F.x0, F.z1, -WAGON_YARD.opening, F.z1, { ...fence, ends: false });
  fenceRun(f, WAGON_YARD.opening, F.z1, F.x1, F.z1, { ...fence, ends: false });
  for (const x of [-WAGON_YARD.opening, WAGON_YARD.opening]) post(f, x, F.z1, 1.6, 0.22);
  box(f, YARD_REC.plank, -7.7, 0, S.z0 + 0.3, -5.5, 0.85, S.z0 + 1.05, { top: YARD_REC.wood });
  wheel(f, [-3.9, 0.62, S.z0 + 0.42], 0.6, 0.18);
  wheel(f, [-2.2, 0.62, S.z0 + 0.42], 0.6, 0.22, { spokes: 12 });
  for (let k = 0; k < 4; k++) box(f, YARD_REC.wood, 1.8, k * 0.1, S.z0 + 0.3 + (k % 2) * 0.05, 5.0, k * 0.1 + 0.09, S.z0 + 0.95 + (k % 2) * 0.05);
  drum(f, YARD_REC.plank, 6.9, S.z0 + 0.7, 10, 0.36, 0.36, 0, 0.95, YARD_REC.wood);
  post(f, P.x, P.z, P.h, 0.22);
  box(f, YARD_REC.wood, P.x, P.armY, P.z - 0.08, P.armTo, P.armY + 0.16, P.z + 0.08, { under: true });
  box(f, YARD_REC.wood, P.x + 0.1, P.armY - 0.5, P.z - 0.05, P.x + 0.2, P.armY, P.z + 0.05);
  signboard(f, YARD_REC.signTransport, (P.x + P.armTo) / 2 + 0.1, P.armY - 0.25 - SIGN_BOARD.h / 2, P.z, P.armY);
  return assemble(f);
}

export function buildCarpenterModel() {
  const f = faces(), F = CARPENTER_YARD.fence, G = CARPENTER_YARD.gate, S = CARPENTER_YARD.shop, B = CARPENTER_YARD.bench;
  floor(f, YARD_REC.shavings, F.x0 + 0.05, S.z0 + 0.15, F.x1 - 0.05, F.z1 - 0.05);
  leanTo(f, { x0: F.x0, x1: F.x1, z0: S.z0, z1: S.z1, backH: S.backH, frontH: S.frontH, posts: [F.x0 + 0.1, -2.4, 2.4, F.x1 - 0.1] });
  const fence = { h: F.h, rails: F.rails };
  fenceRun(f, F.x0, S.z1, F.x0, F.z1, fence);
  fenceRun(f, F.x1, S.z1, F.x1, F.z1, fence);
  fenceRun(f, F.x0, F.z1, -G.half, F.z1, { ...fence, ends: false });
  fenceRun(f, G.half, F.z1, F.x1, F.z1, { ...fence, ends: false });
  for (const x of [-G.half, G.half]) post(f, x, F.z1, G.postH, 0.24);
  box(f, YARD_REC.wood, -G.half - 0.35, G.beamY, F.z1 - 0.12, G.half + 0.35, G.beamY + 0.22, F.z1 + 0.12, { under: true });
  signboard(f, YARD_REC.signCarpenter, 0, G.beamY - 0.2 - SIGN_BOARD.h / 2, F.z1, G.beamY);
  const [bx0, by0, bz0, bx1, by1, bz1] = B;
  box(f, YARD_REC.plank, bx0, by0, bz0, bx1, by1, bz1, { top: YARD_REC.wood, under: true });
  for (const [lx, lz] of [[bx0 + 0.1, bz0 + 0.1], [bx1 - 0.1, bz0 + 0.1], [bx1 - 0.1, bz1 - 0.1], [bx0 + 0.1, bz1 - 0.1]]) box(f, YARD_REC.wood, lx - 0.06, 0, lz - 0.06, lx + 0.06, by0, lz + 0.06);
  box(f, YARD_REC.plank, bx0 + 0.16, 0.22, bz0 + 0.04, bx1 - 0.16, 0.27, bz1 - 0.04, { under: true });
  box(f, YARD_REC.wood, bx0 + 0.08, 0.66, bz1, bx0 + 0.38, by1 + 0.04, bz1 + 0.14, { under: true });
  box(f, YARD_REC.iron, bx0 + 0.2, 0.74, bz1 + 0.14, bx0 + 0.26, 0.8, bz1 + 0.34, { under: true });
  box(f, YARD_REC.wood, 0.3, by1, -5.32, 0.64, by1 + 0.08, -5.22);
  box(f, YARD_REC.iron, 0.44, by1 + 0.08, -5.3, 0.48, by1 + 0.12, -5.24);
  box(f, YARD_REC.wood, -0.86, by1, -5.42, -0.66, by1 + 0.12, -5.28);
  box(f, YARD_REC.wood, -0.78, by1 + 0.03, -5.28, -0.74, by1 + 0.07, -4.98);
  box(f, YARD_REC.plank, 0.9, by1, -5.1, 1.4, by1 + 0.03, -4.95);
  box(f, YARD_REC.plank, 1.0, by1 + 0.03, -5.3, 1.35, by1 + 0.06, -5.18);
  const wz = S.z0 + 0.15, tz = wz + 0.05;
  box(f, YARD_REC.plank, -1.6, 1.35, wz, 1.6, 2.15, tz);
  box(f, YARD_REC.iron, -1.3, 1.62, tz, -0.5, 1.84, tz + 0.02);
  box(f, YARD_REC.wood, -1.48, 1.56, tz, -1.28, 1.9, tz + 0.04);
  box(f, YARD_REC.wood, -0.2, 1.5, tz, -0.15, 1.92, tz + 0.04);
  box(f, YARD_REC.iron, -0.3, 1.92, tz, -0.05, 2.0, tz + 0.05);
  box(f, YARD_REC.iron, 0.3, 1.55, tz, 0.8, 1.6, tz + 0.02);
  box(f, YARD_REC.iron, 0.3, 1.6, tz, 0.35, 1.95, tz + 0.02);
  for (const cx of [1.0, 1.17, 1.34]) {
    box(f, YARD_REC.wood, cx - 0.03, 1.75, tz, cx + 0.03, 1.95, tz + 0.04);
    box(f, YARD_REC.iron, cx - 0.015, 1.55, tz, cx + 0.015, 1.75, tz + 0.02);
  }
  for (const x of [-6.1, -3.0]) post(f, x, -5.5, 2.2, 0.12);
  for (const [k, y] of [0.6, 1.2, 1.8].entries()) {
    box(f, YARD_REC.plank, -6.14, y - 0.04, wz, -2.96, y, -5.2, { top: YARD_REC.wood, under: true });
    box(f, YARD_REC.wood, -5.9 + k * 0.1, y, wz + 0.05, -3.3, y + 0.06, -5.32, { under: true });
    box(f, YARD_REC.wood, -5.8, y + 0.06, wz + 0.08, -3.5 - k * 0.15, y + 0.12, -5.4, { under: true });
  }
  furniture(f, 4.2, -4.0, 0.44, 0.44, 0.46, { back: 0.46, backZ: -1, rail: false });
  box(f, YARD_REC.plank, 2.9, 0, -5.75, 3.8, 0.55, -5.2, { top: YARD_REC.wood });
  box(f, YARD_REC.iron, 3.3, 0.38, -5.2, 3.4, 0.5, -5.18);
  drum(f, YARD_REC.plank, 5.6, -5.25, 10, 0.32, 0.32, 0, 0.8, YARD_REC.wood);
  for (const [dx, dz] of [[-0.1, -0.05], [0.05, 0.08], [0.12, -0.1], [-0.05, 0.12]]) box(f, YARD_REC.wood, 5.6 + dx - 0.02, 0.8, -5.25 + dz - 0.02, 5.6 + dx + 0.02, 1.12, -5.25 + dz + 0.02);
  const R = 0.28, LZ0 = -1.8, LZ1 = 0.6, up = Math.sqrt((2 * R) ** 2 - (R + 0.02) ** 2);
  for (const x of [-5.6, -5.0, -4.4]) logZ(f, x, R, LZ0, LZ1, R);
  for (const x of [-5.3, -4.7]) logZ(f, x, R + up, LZ0 + 0.15, LZ1 - 0.1, R);
  for (const z of [-0.5, 0.9]) {
    box(f, YARD_REC.wood, -2.9, 0.68, z - 0.05, -1.5, 0.78, z + 0.05, { under: true });
    for (const x of [-2.75, -1.65]) for (const s of [-1, 1]) beam(f, YARD_REC.wood, [x, 0.05 - YARD_SINK, z + s * 0.32], [x, 0.7, z + s * 0.03], 0.035);
  }
  box(f, YARD_REC.plank, -2.36, 0.78, -1.0, -2.04, 0.83, 1.5, { top: YARD_REC.wood, under: true });
  drum(f, YARD_REC.bark, 0.9, 0.0, 9, 0.32, 0.3, 0, 0.55, YARD_REC.endgrain);
  box(f, YARD_REC.iron, 0.82, 0.47, -0.02, 1.02, 0.6, 0.02, { under: true });
  beam(f, YARD_REC.wood, [0.98, 0.56, 0], [1.32, 1.08, 0], 0.025);
  for (const x of [2.9, 5.5]) box(f, YARD_REC.wood, x - 0.08, 0, -1.85, x + 0.08, 0.15, -0.15);
  for (let k = 0; k < 5; k++) {
    const y = 0.15 + k * 0.11;
    for (let j = 0; j < 4; j++) box(f, YARD_REC.plank, 2.6, y, -1.8 + j * 0.4, 5.8, y + 0.06, -1.5 + j * 0.4, { top: YARD_REC.wood, under: true });
    if (k < 4) for (const x of [2.8, 4.2, 5.6]) box(f, YARD_REC.wood, x - 0.025, y + 0.06, -1.82, x + 0.025, y + 0.11, -0.18);
  }
  furniture(f, 4.1, 2.65, 1.4, 0.9, 0.76, { t: 0.05, leg: 0.06 });
  furniture(f, 2.95, 2.65, 0.42, 0.42, 0.45, { back: 0.5, backZ: -1 });
  furniture(f, 5.25, 2.65, 0.42, 0.42, 0.45, { back: 0.5, backZ: 1 });
  furniture(f, -4.5, 3.2, 1.6, 0.34, 0.46, { leg: 0.06 });
  return assemble(f);
}

export const buildYardModel = (kind) => (kind === 'transport' ? buildTransportModel() : kind === 'carpenter' ? buildCarpenterModel() : buildStableModel());

export function signBoxOf(kind) {
  const { w, h } = SIGN_BOARD, grow = 0.1;
  if (kind === 'carpenter') {
    const G = CARPENTER_YARD.gate, z = CARPENTER_YARD.fence.z1, y = G.beamY - 0.2 - h / 2;
    return [-w / 2 - grow, y - h / 2 - grow, z - 0.15, w / 2 + grow, y + h / 2 + grow, z + 0.15];
  }
  if (kind === 'transport') {
    const P = WAGON_YARD.post, x = (P.x + P.armTo) / 2 + 0.1, y = P.armY - 0.25 - h / 2;
    return [x - w / 2 - grow, y - h / 2 - grow, P.z - 0.15, x + w / 2 + grow, y + h / 2 + grow, P.z + 0.15];
  }
  const G = STABLE_YARD.gate, z = STABLE_YARD.fence.z1, y = G.beamY - 0.2 - h / 2;
  return [-w / 2 - grow, y - h / 2 - grow, z - 0.15, w / 2 + grow, y + h / 2 + grow, z + 0.15];
}
export const benchBoxOf = () => { const B = CARPENTER_YARD.bench; return [B[0] - 0.05, 0, B[2] - 0.05, B[3] + 0.05, B[4] + 0.15, B[5] + 0.4]; };
export const yardPoints = (kind) => (kind === 'transport'
  ? { keeper: WAGON_YARD.keeper, horses: [], wagons: WAGON_YARD.wagons, bench: null }
  : kind === 'carpenter' ? { keeper: CARPENTER_YARD.keeper, horses: [], wagons: [], bench: benchBoxOf() }
    : { keeper: STABLE_YARD.keeper, horses: STABLE_YARD.horses, wagons: [], bench: null });

export const YARD_MESH_KIT = Object.freeze({ faces, uvOf, hexa, box, post, fenceRun, floor, leanTo, signboard, wheel, drum, assemble });
