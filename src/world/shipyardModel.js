// @ts-check
// Builds a port shipyard in its own frame: y up, front along +z, sea side along -z.
// It holds the fence, gate arch, slipway, hull on the stocks, office, crew hall, timber yard, and sea wall.
// Every face is wound outward and the collider uses the same triangles. Pure.
import { YARD_MESH_KIT, YARD_SINK, YARD_TILE_M, SIGN_BOARD } from './merchantYards/merchantYardModels.js';
import { PORT_ARCHIVE, PORT_REC } from './portArt.js';
import { PORT_FOOT } from './portSites.js';

const { faces, hexa, box, post, fenceRun, floor, drum, signboard, assemble, uvOf } = YARD_MESH_KIT;

const F = PORT_FOOT.shipyard;
export const SHIPYARD = Object.freeze({
  fence: Object.freeze({ x0: -F.hx + 0.2, x1: F.hx - 0.2, z0: -F.hz + 0.2, z1: F.hz - 0.2, h: 1.3, rails: Object.freeze([0.5, 1.05]) }),
  gate: Object.freeze({ x0: -1.0, x1: 3.4, postH: 4.3, beamY: 3.95 }),
  hull: Object.freeze({ x: -5.2, zStern: -6.9, zBow: 4.7, half: 2.05, keel: 0.95, keelH: 0.32, sheer: 3.55, mid: -1.3 }),
  office: Object.freeze({ x0: 3.7, x1: 10.5, z0: 1.7, z1: 7.3, wallH: 2.9, ridge: 4.5, porchX: 2.5 }),
  hall: Object.freeze({ x0: 3.5, x1: 10.5, z0: -7.4, z1: 0.3, backH: 3.3, frontH: 2.7 }),
  seaWall: Object.freeze({ gap0: -8.0, gap1: -2.4, h: 0.9 }),
  steamBox: Object.freeze([-F.hx + 2.85, 0.9, -1.4, -F.hx + 3.85, 1.5, 2.2]),
  firebox: Object.freeze([-F.hx + 2.9, 0, 2.3, -F.hx + 3.8, 0.8, 3.1]),
  scaffold: Object.freeze({ out: 1.05, posts: Object.freeze([-6.0, -3.0, 0.0, 3.0]) }),
  capstan: Object.freeze({ x: -0.4, z: -6.25, bar: 1.1, y: 0.8 }),
  lantern: Object.freeze([3.25, 1.9, 5.33]),
  points: Object.freeze({
    keeper: Object.freeze([3.05, 4.4]),
    crewmaster: Object.freeze([9.2, -3.6]),
    recruits: Object.freeze([Object.freeze([5.3, -1.4]), Object.freeze([4.5, -4.6]), Object.freeze([5.7, -6.4])]),
    workers: Object.freeze([Object.freeze([-2.2, 1.6, 2.25]), Object.freeze([-8.3, 3.55, 0])]),
  }),
});

const R = PORT_REC;
/**
 * @param {number[]} a
 * @param {number[]} b
 */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
/**
 * @param {number[]} a
 * @param {number[]} b
 */
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/**
 * @param {number[]} a
 * @param {number} k
 */
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
/**
 * @param {number[]} a
 * @param {number[]} b
 */
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** @param {number[]} a */
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/**
 * @param {any} f
 * @param {number} rec
 * @param {number[]} a
 * @param {number[]} b
 * @param {number} w
 * @param {number} [h]
 */
export function beam(f, rec, a, b, w, h = w) {
  const u = unit(sub(b, a));
  const ref = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const s = scale(unit(cross(u, ref)), w / 2), t = scale(unit(cross(s, u)), h / 2);
  const c = (p, i, j) => add(add(p, scale(s, i)), scale(t, j));
  hexa(f, rec, [c(a, -1, -1), c(a, 1, -1), c(a, 1, 1), c(a, -1, 1), c(b, -1, -1), c(b, 1, -1), c(b, 1, 1), c(b, -1, 1)], { under: true });
}
/**
 * @param {any} f
 * @param {number} rec
 * @param {number} x
 * @param {number} y
 * @param {number} z0
 * @param {number} z1
 * @param {number} r
 * @param {{ sides?: number, end?: number }} [o]
 */
export function logZ(f, rec, x, y, z0, z1, r, { sides = 8, end = R.wood } = {}) {
  for (let k = 0; k < sides; k++) {
    const a = (k / sides) * Math.PI * 2, b = ((k + 1) / sides) * Math.PI * 2;
    const p = (ang, z) => [x + Math.cos(ang) * r, y + Math.sin(ang) * r, z];
    const out = [Math.cos((a + b) / 2), Math.sin((a + b) / 2), 0];
    const u = (r * Math.PI * 2) / sides / YARD_TILE_M, v = (z1 - z0) / YARD_TILE_M;
    f.quad(rec, p(a, z0), p(b, z0), p(b, z1), p(a, z1), [0, 0], [u, 0], [u, v], [0, v], out);
    f.tri(end, [x, y, z1], p(a, z1), p(b, z1), [0.5, 0.5], [0.5 + Math.cos(a) * 0.4, 0.5 + Math.sin(a) * 0.4], [0.5 + Math.cos(b) * 0.4, 0.5 + Math.sin(b) * 0.4]);
    f.tri(end, [x, y, z0], p(b, z0), p(a, z0), [0.5, 0.5], [0.5 + Math.cos(b) * 0.4, 0.5 + Math.sin(b) * 0.4], [0.5 + Math.cos(a) * 0.4, 0.5 + Math.sin(a) * 0.4]);
  }
}
function twoSided(f, rec, a, b, c, d, ua, ub, uc, ud, n) {
  f.quad(rec, a, b, c, d, ua, ub, uc, ud, n);
  f.quad(rec, a, b, c, d, ua, ub, uc, ud, scale(n, -1));
}

const H = SHIPYARD.hull;
export const hullHalf = (z) => {
  const t = (z - H.mid) / ((H.zBow - H.zStern) / 2);
  return H.half * Math.max(0.12, 1 - t * t * t * t * (t > 0 ? 0.95 : 0.7));
};
export const hullSheer = (z) => {
  const t = (z - H.mid) / ((H.zBow - H.zStern) / 2);
  return H.sheer + 0.45 * t * t + (t > 0 ? 0.2 * t : 0);
};
export function hullPoint(z, t, s) {
  const bottom = H.keel + H.keelH, top = hullSheer(z), b = hullHalf(z);
  const out = Math.sqrt(Math.max(0, 1 - (1 - Math.min(t, 0.82) / 0.82) ** 2)) - (t > 0.82 ? 0.08 * (t - 0.82) / 0.18 : 0);
  return [H.x + s * b * out, bottom + (top - bottom) * t, z];
}
export const HULL_STATIONS = Object.freeze(Array.from({ length: 14 }, (_, i) => Math.round((H.zStern + 0.55 + i * 0.83) * 100) / 100));
export const PLANKED_TO = 0.55;
const T_STEPS = Object.freeze([0, 0.12, 0.25, 0.4, 0.55, 0.7, 0.85, 1]);

function hullOnStocks(f) {
  for (let z = H.zStern + 0.3; z <= H.zBow - 0.2; z += 1.45) box(f, R.wood, H.x - 0.32, 0, z - 0.25, H.x + 0.32, H.keel, z + 0.25, { top: R.tar });
  box(f, R.tar, H.x - 0.15, H.keel, H.zStern, H.x + 0.15, H.keel + H.keelH, H.zBow, { under: true });
  const stem = [];
  for (let k = 0; k <= 5; k++) { const a = (k / 5) * (Math.PI / 2); stem.push([H.x, H.keel + H.keelH * 0.5 + Math.sin(a) * (hullSheer(H.zBow) + 0.6 - H.keel), H.zBow - 0.2 + (1 - Math.cos(a)) * 0.95]); }
  for (let k = 0; k < stem.length - 1; k++) beam(f, R.wood, stem[k], stem[k + 1], 0.22, 0.26);
  beam(f, R.wood, [H.x, H.keel + 0.1, H.zStern + 0.1], [H.x, hullSheer(H.zStern) + 0.5, H.zStern - 0.55], 0.22, 0.26);
  for (const z of HULL_STATIONS) {
    for (const s of [-1, 1]) {
      for (let k = 0; k < T_STEPS.length - 1; k++) beam(f, R.wood, hullPoint(z, T_STEPS[k], s), hullPoint(z, T_STEPS[k + 1], s), 0.14, 0.12);
    }
  }
  const stations = [H.zStern + 0.1, ...HULL_STATIONS, H.zBow - 0.15];
  for (const s of [-1, 1]) {
    for (let i = 0; i < stations.length - 1; i++) {
      const z0 = stations[i], z1 = stations[i + 1];
      for (let k = 0; T_STEPS[k + 1] <= PLANKED_TO + 1e-9; k++) {
        const t0 = T_STEPS[k], t1 = T_STEPS[k + 1];
        const a = hullPoint(z0, t0, s), b = hullPoint(z1, t0, s), c = hullPoint(z1, t1, s), d = hullPoint(z0, t1, s);
        const n = unit(cross(sub(b, a), sub(d, a)));
        const outward = n[0] * s >= 0 ? n : scale(n, -1);
        const v0 = t0 * 4, v1 = t1 * 4;
        twoSided(f, R.hull, a, b, c, d, [z0 / YARD_TILE_M, v0], [z1 / YARD_TILE_M, v0], [z1 / YARD_TILE_M, v1], [z0 / YARD_TILE_M, v1], outward);
      }
      beam(f, R.wood, hullPoint(z0, 1, s), hullPoint(z1, 1, s), 0.12, 0.16);
    }
  }
  const S = SHIPYARD.steamBox, posts = SHIPYARD.scaffold.posts;
  HULL_STATIONS.forEach((z, i) => {
    if (i % 2) return;
    for (const s of [-1, 1]) {
      if (s < 0 ? z > S[2] - 0.2 && z < S[5] + 0.2 : posts.some((p) => Math.abs(p - z) < 0.2)) continue;
      const at = hullPoint(z, 0.45, s);
      beam(f, R.wood, [at[0] + s * 1.5, -YARD_SINK, z], at, 0.14, 0.14);
    }
  });
  for (const dx of [-1.15, 1.15]) box(f, R.tar, H.x + dx - 0.18, -YARD_SINK, H.zStern - 1.0, H.x + dx + 0.18, 0.22, H.zBow + 0.8, { under: true });
  const sx = H.x + H.half + SHIPYARD.scaffold.out, walkY = SHIPYARD.points.workers[0][2] - 0.05;
  for (const z of posts) post(f, sx + 0.35, z, walkY + 1.0, 0.13, R.wood);
  for (const z of posts) post(f, sx - 0.35, z, walkY - 0.06, 0.13, R.wood);
  box(f, R.plank, sx - 0.45, walkY - 0.06, -6.4, sx + 0.45, walkY, 3.4, { under: true });
  box(f, R.wood, sx + 0.3, walkY + 0.95, -6.2, sx + 0.4, walkY + 1.05, 3.2, { under: true });
  for (const x of [sx - 0.2, sx + 0.2]) beam(f, R.wood, [x, 0, 4.4], [x, walkY + 0.6, 3.5], 0.06, 0.06);
  for (let k = 1; k <= 6; k++) { const t = k / 7; box(f, R.wood, sx - 0.22, t * (walkY + 0.6) - 0.025, 4.4 - t * 0.9 - 0.03, sx + 0.22, t * (walkY + 0.6) + 0.025, 4.4 - t * 0.9 + 0.03); }
}

function office(f) {
  const O = SHIPYARD.office, W = 0.16;
  box(f, R.plank, O.x0, -YARD_SINK, O.z0, O.x1, O.wallH, O.z0 + W);
  box(f, R.plank, O.x0, -YARD_SINK, O.z1 - W, O.x1, O.wallH, O.z1);
  box(f, R.plank, O.x1 - W, -YARD_SINK, O.z0, O.x1, O.wallH, O.z1);
  box(f, R.plank, O.x0, -YARD_SINK, O.z0, O.x0 + W, O.wallH, O.z1);
  const zm = (O.z0 + O.z1) / 2, o = 0.35, t = 0.12, slope = (O.ridge - O.wallH) / (zm - O.z0);
  for (const [a, b] of [[O.x0, O.x0 + W], [O.x1 - W, O.x1]]) {
    hexa(f, R.plank, [[a, O.wallH, O.z0], [b, O.wallH, O.z0], [b, O.wallH, O.z1], [a, O.wallH, O.z1], [a, O.ridge - t, zm - 0.01], [b, O.ridge - t, zm - 0.01], [b, O.ridge - t, zm + 0.01], [a, O.ridge - t, zm + 0.01]]);
  }
  for (const s of [-1, 1]) {
    const zr = zm, ze = s < 0 ? O.z0 - o : O.z1 + o, ye = O.wallH - o * slope;
    const roofUv = (p, n) => (n[1] > 0.3 ? [p[0] / YARD_TILE_M, Math.abs(p[2] - zr) / YARD_TILE_M] : uvOf(p, n));
    hexa(f, R.plank, [
      [O.x0 - o - 1.2, O.ridge - t, zr], [O.x1 + o, O.ridge - t, zr], [O.x1 + o, ye - t, ze], [O.x0 - o - 1.2, ye - t, ze],
      [O.x0 - o - 1.2, O.ridge, zr], [O.x1 + o, O.ridge, zr], [O.x1 + o, ye, ze], [O.x0 - o - 1.2, ye, ze],
    ], { top: R.shingle, under: true, uv: roofUv });
  }
  for (const z of [O.z0 + 0.4, O.z1 - 0.4]) post(f, O.porchX, z, O.wallH - 0.05, 0.16, R.wood);
  box(f, R.wood, O.porchX - 0.1, O.wallH - 0.2, O.z0 + 0.2, O.porchX + 0.1, O.wallH, O.z1 - 0.2, { under: true });
  const door = [3.9, 4.95], win = [2.3, 3.3];
  f.quad(R.door, [O.x0 - 0.02, 0, door[1]], [O.x0 - 0.02, 0, door[0]], [O.x0 - 0.02, 2.1, door[0]], [O.x0 - 0.02, 2.1, door[1]], [0, 1], [1, 1], [1, 0], [0, 0], [-1, 0, 0]);
  f.quad(R.window, [O.x0 - 0.02, 1.1, win[1]], [O.x0 - 0.02, 1.1, win[0]], [O.x0 - 0.02, 2.0, win[0]], [O.x0 - 0.02, 2.0, win[1]], [0, 1], [1, 1], [1, 0], [0, 0], [-1, 0, 0]);
  for (const z of [win[0] - 0.28, win[1] + 0.02]) box(f, R.tar, O.x0 - 0.06, 1.05, z, O.x0 - 0.02, 2.05, z + 0.26);
  for (const [x0, x1] of [[4.6, 5.6], [8.2, 9.2]]) {
    f.quad(R.window, [x0, 1.1, O.z1 + 0.02], [x1, 1.1, O.z1 + 0.02], [x1, 2.0, O.z1 + 0.02], [x0, 2.0, O.z1 + 0.02], [1, 1], [0, 1], [0, 0], [1, 0], [0, 0, 1]);
  }
  const [lx, , lz] = SHIPYARD.lantern;
  box(f, R.iron, lx, 2.2, lz - 0.03, O.x0, 2.26, lz + 0.03);
  box(f, R.iron, lx - 0.12, 2.03, lz - 0.13, lx + 0.12, 2.08, lz + 0.13, { under: true });
  box(f, R.iron, lx - 0.12, 1.72, lz - 0.13, lx + 0.12, 1.77, lz + 0.13, { under: true });
  box(f, R.glass, lx - 0.08, 1.77, lz - 0.09, lx + 0.08, 2.03, lz + 0.09);
  for (const [dx, dz] of [[-0.11, -0.12], [0.09, -0.12], [-0.11, 0.1], [0.09, 0.1]]) box(f, R.iron, lx + dx - 0.012, 1.77, lz + dz - 0.012, lx + dx + 0.012, 2.03, lz + dz + 0.012);
  post(f, 2.0, 6.6, 2.4, 0.14, R.wood);
  box(f, R.wood, 1.95, 2.25, 6.6, 2.45, 2.33, 6.7);
  drum(f, R.brass, 2.32, 6.65, 8, 0.2, 0.12, 1.85, 2.25, R.brass);
  box(f, R.plank, O.x0 - 0.85, 0.42, 5.7, O.x0 - 0.45, 0.5, 6.9, { under: true });
  for (const z of [5.8, 6.8]) box(f, R.wood, O.x0 - 0.8, 0, z - 0.04, O.x0 - 0.5, 0.42, z + 0.04);
  drum(f, R.plank, 9.6, O.z0 - 0.55, 10, 0.34, 0.34, 0, 0.9, R.wood);
  drum(f, R.tar, 8.8, O.z0 - 0.6, 10, 0.34, 0.34, 0, 0.9, R.tar);
}

export function crewSignBox() {
  const { w, h } = SIGN_BOARD, A = SHIPYARD.hall, x = A.x0 - 0.15, y = A.frontH - 0.25 - h / 2, z = (A.z0 + A.z1) / 2;
  return [x - 0.15, y - h / 2 - 0.1, z - w / 2 - 0.1, x + 0.15, y + h / 2 + 0.1, z + w / 2 + 0.1];
}
function crewSign(f) {
  f.hang(true);
  const { w, h, t } = SIGN_BOARD, A = SHIPYARD.hall, x = A.x0 - 0.15, yMid = A.frontH - 0.25 - h / 2, zMid = (A.z0 + A.z1) / 2;
  const x0 = x - t / 2, x1 = x + t / 2, y0 = yMid - h / 2, y1 = yMid + h / 2, z0 = zMid - w / 2, z1 = zMid + w / 2;
  f.quad(R.signCrew, [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [0, 0], [1, 0], [1, 1], [0, 1], [-1, 0, 0]);
  f.quad(R.signCrew, [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [x1, y0, z0], [0, 0], [1, 0], [1, 1], [0, 1], [1, 0, 0]);
  const e = [0, 0], g = [0.1, 1];
  f.quad(R.wood, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], e, g, g, e, [0, 1, 0]);
  f.quad(R.wood, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], e, g, g, e, [0, -1, 0]);
  f.quad(R.wood, [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], e, g, g, e, [0, 0, -1]);
  f.quad(R.wood, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], e, g, g, e, [0, 0, 1]);
  for (const rz of [z0 + 0.12, z1 - 0.12]) box(f, R.iron, x - 0.015, y1, rz - 0.015, x + 0.015, A.frontH, rz + 0.015);
  f.hang(false);
}
function crewHall(f) {
  const A = SHIPYARD.hall, W = 0.15;
  const slope = (x) => A.frontH + ((A.backH - A.frontH) * (x - A.x0)) / (A.x1 - A.x0);
  box(f, R.plank, A.x1 - W, -YARD_SINK, A.z0, A.x1, A.backH, A.z1);
  hexa(f, R.plank, [
    [A.x0, -YARD_SINK, A.z0], [A.x1 - W, -YARD_SINK, A.z0], [A.x1 - W, -YARD_SINK, A.z0 + W], [A.x0, -YARD_SINK, A.z0 + W],
    [A.x0, slope(A.x0), A.z0], [A.x1 - W, slope(A.x1 - W), A.z0], [A.x1 - W, slope(A.x1 - W), A.z0 + W], [A.x0, slope(A.x0), A.z0 + W],
  ]);
  for (const z of [A.z0 + 0.1, (A.z0 + A.z1) / 2 - 1.3, A.z1 - 0.1]) post(f, A.x0 + 0.1, z, slope(A.x0 + 0.1), 0.18, R.wood);
  box(f, R.wood, A.x0, A.frontH - 0.22, A.z0 + W, A.x0 + 0.2, A.frontH, A.z1, { under: true });
  const o = 0.35, t = 0.12, xb = A.x1 + 0.25, xf = A.x0 - o, yb = slope(xb) + 0.12, yf = slope(xf) + 0.12;
  hexa(f, R.plank, [
    [xb, yb - t, A.z0 - 0.3], [xf, yf - t, A.z0 - 0.3], [xf, yf - t, A.z1 + 0.3], [xb, yb - t, A.z1 + 0.3],
    [xb, yb, A.z0 - 0.3], [xf, yf, A.z0 - 0.3], [xf, yf, A.z1 + 0.3], [xb, yb, A.z1 + 0.3],
  ], { top: R.shingle, under: true, uv: (p, n) => (n[1] > 0.7 ? [p[2] / YARD_TILE_M, (xb - p[0]) / YARD_TILE_M] : uvOf(p, n)) });
  const tx0 = 7.25, tx1 = 8.15, tz0 = -6.3, tz1 = -0.9;
  box(f, R.plank, tx0, 0.74, tz0, tx1, 0.82, tz1, { top: R.wood, under: true });
  for (const [x, z] of [[tx0 + 0.1, tz0 + 0.1], [tx1 - 0.1, tz0 + 0.1], [tx0 + 0.1, tz1 - 0.1], [tx1 - 0.1, tz1 - 0.1]]) box(f, R.wood, x - 0.05, 0, z - 0.05, x + 0.05, 0.74, z + 0.05);
  for (const bx of [tx0 - 0.55, tx1 + 0.35]) {
    box(f, R.plank, bx, 0.42, tz0 + 0.2, bx + 0.32, 0.48, tz1 - 0.2, { under: true });
    for (const z of [tz0 + 0.4, tz1 - 0.4]) box(f, R.wood, bx + 0.12, 0, z - 0.04, bx + 0.2, 0.42, z + 0.04);
  }
  box(f, R.canvas, tx0 + 0.2, 0.82, -4.1, tx0 + 0.65, 0.86, -3.5);
  box(f, R.iron, tx1 - 0.3, 0.82, -2.0, tx1 - 0.1, 1.08, -1.8, { top: R.iron });
  box(f, R.glass, tx1 - 0.27, 0.86, -1.97, tx1 - 0.13, 1.04, -1.83);
  const nx = A.x1 - W - 0.04;
  box(f, R.wood, nx - 0.04, 1.15, -6.1, nx, 2.75, -1.2);
  f.quad(R.notices, [nx - 0.05, 1.25, -1.3], [nx - 0.05, 1.25, -6.0], [nx - 0.05, 2.65, -6.0], [nx - 0.05, 2.65, -1.3], [1, 1], [0, 1], [0, 0], [1, 0], [-1, 0, 0]);
  crewSign(f);
  box(f, R.tar, 4.0, 0, -2.6, 4.9, 0.55, -2.0, { top: R.wood });
  drum(f, R.rope, 4.3, -5.6, 10, 0.42, 0.42, 0, 0.22, R.rope);
  drum(f, R.plank, 6.2, -6.9, 10, 0.3, 0.3, 0, 0.75, R.wood);
}

function timberYard(f) {
  const x0 = SHIPYARD.fence.x0;
  for (const z of [-4.4, 1.0]) box(f, R.tar, x0 + 0.3, 0, z - 0.15, x0 + 2.3, 0.18, z + 0.15);
  const logs = [[x0 + 0.65, 0.42], [x0 + 1.2, 0.42], [x0 + 1.75, 0.42], [x0 + 0.92, 0.88], [x0 + 1.48, 0.88], [x0 + 1.2, 1.34]];
  for (const [x, y] of logs) logZ(f, R.wood, x, y, -5.2, 1.6, 0.26, { end: R.plank });
  for (let k = 0; k < 5; k++) box(f, R.plank, x0 + 0.4, k * 0.12, 2.6 + (k % 2) * 0.05, x0 + 2.0, k * 0.12 + 0.07, 6.2 + (k % 2) * 0.05, { top: R.plank });
  const S = SHIPYARD.steamBox, B = SHIPYARD.firebox;
  for (const z of [-0.8, 1.6]) { box(f, R.wood, S[0] + 0.05, 0, z - 0.05, S[0] + 0.15, S[1], z + 0.05); box(f, R.wood, S[3] - 0.15, 0, z - 0.05, S[3] - 0.05, S[1], z + 0.05); }
  box(f, R.plank, ...S, { top: R.plank, under: true });
  box(f, R.stone, ...B, { top: R.stone });
  drum(f, R.iron, (B[0] + B[3]) / 2, (B[2] + B[5]) / 2, 8, 0.14, 0.12, B[4], 2.7, R.iron);
  for (const [x, z] of [[x0 + 0.6, -6.4], [x0 + 1.3, -6.6], [x0 + 0.85, -5.8]]) drum(f, R.tar, x, z, 10, 0.34, 0.34, 0, 0.92, R.tar);
  box(f, R.stone, x0 + 2.5, 0, -6.9, x0 + 3.4, 0.35, -6.0, { top: R.stone });
  drum(f, R.iron, x0 + 2.95, -6.45, 10, 0.32, 0.38, 0.35, 0.85, R.tar);
  drum(f, R.rope, x0 + 4.2, -7.0, 10, 0.5, 0.5, 0, 0.24, R.rope);
  drum(f, R.rope, x0 + 4.2, -7.0, 10, 0.36, 0.36, 0.24, 0.42, R.rope);
  const ax = x0 + 0.25, az = 4.0;
  beam(f, R.iron, [ax + 0.2, 0.15, az], [ax, 2.2, az], 0.12, 0.12);
  beam(f, R.iron, [ax - 0.05, 1.95, az - 0.75], [ax - 0.05, 1.95, az + 0.75], 0.1, 0.1);
  for (const s of [-1, 1]) beam(f, R.iron, [ax + 0.2, 0.15, az], [ax + 0.25, 0.75, az + s * 0.75], 0.11, 0.11);
}
function sheerlegs(f) {
  const H2 = SHIPYARD.hull, top = [H2.x - 2.9, 7.4, -7.75];
  beam(f, R.wood, [H2.x - 4.4, -YARD_SINK, -6.4], top, 0.22, 0.22);
  beam(f, R.wood, [H2.x - 1.4, -YARD_SINK, -6.4], top, 0.22, 0.22);
  beam(f, R.rope, top, [H2.x - 3.4, -YARD_SINK, 0.4], 0.04, 0.04);
  post(f, H2.x - 3.4, 0.4, 0.5, 0.14, R.wood);
  box(f, R.wood, top[0] - 0.14, top[1] - 0.5, top[2] - 0.12, top[0] + 0.14, top[1] - 0.2, top[2] + 0.12);
  beam(f, R.rope, [top[0], top[1] - 0.5, top[2]], [top[0], 3.1, top[2]], 0.035, 0.035);
  box(f, R.wood, top[0] - 0.12, 2.75, top[2] - 0.1, top[0] + 0.12, 3.1, top[2] + 0.1);
  beam(f, R.iron, [top[0], 2.75, top[2]], [top[0], 2.45, top[2] + 0.12], 0.05, 0.05);
  const { x: cx, z: cz, bar, y: by } = SHIPYARD.capstan;
  drum(f, R.wood, cx, cz, 10, 0.42, 0.34, 0, 0.95, R.wood);
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI; beam(f, R.wood, [cx - Math.cos(a) * bar, by, cz - Math.sin(a) * bar], [cx + Math.cos(a) * bar, by, cz + Math.sin(a) * bar], 0.07, 0.07); }
}

export function buildShipyardModel() {
  const f = faces(), Fe = SHIPYARD.fence, G = SHIPYARD.gate, Wl = SHIPYARD.seaWall;
  floor(f, R.sawdust, Fe.x0 + 0.05, Fe.z0 + 0.05, Fe.x1 - 0.05, Fe.z1 - 0.05);
  const fence = { h: Fe.h, rails: Fe.rails, step: 2.4 };
  fenceRun(f, Fe.x0, Fe.z0 + 0.9, Fe.x0, Fe.z1, fence);
  fenceRun(f, Fe.x1, Fe.z0 + 0.9, Fe.x1, Fe.z1, fence);
  fenceRun(f, Fe.x0, Fe.z1, G.x0, Fe.z1, { ...fence, ends: false });
  fenceRun(f, G.x1, Fe.z1, Fe.x1, Fe.z1, { ...fence, ends: false });
  for (const x of [G.x0, G.x1]) post(f, x, Fe.z1, G.postH, 0.26, R.wood);
  box(f, R.wood, G.x0 - 0.4, G.beamY, Fe.z1 - 0.13, G.x1 + 0.4, G.beamY + 0.24, Fe.z1 + 0.13, { under: true });
  signboard(f, R.signShips, (G.x0 + G.x1) / 2, G.beamY - 0.2 - SIGN_BOARD.h / 2, Fe.z1, G.beamY);
  box(f, R.stone, Fe.x0, -YARD_SINK, Fe.z0 - 0.15, Wl.gap0, Wl.h, Fe.z0 + 0.35, { top: R.tar });
  box(f, R.stone, Wl.gap1, -YARD_SINK, Fe.z0 - 0.15, Fe.x1, Wl.h, Fe.z0 + 0.35, { top: R.tar });
  hullOnStocks(f);
  office(f);
  crewHall(f);
  timberYard(f);
  sheerlegs(f);
  return assemble(f, PORT_ARCHIVE);
}

export function shipsSignBox() {
  const { w, h } = SIGN_BOARD, G = SHIPYARD.gate, z = SHIPYARD.fence.z1, x = (G.x0 + G.x1) / 2, y = G.beamY - 0.2 - h / 2;
  return [x - w / 2 - 0.1, y - h / 2 - 0.1, z - 0.15, x + w / 2 + 0.1, y + h / 2 + 0.1, z + 0.15];
}
export function hullBox() {
  return [H.x - H.half - 0.2, H.keel, H.zStern - 0.6, H.x + H.half + 0.2, hullSheer(H.zBow) + 0.6, H.zBow + 1.0];
}
export function noticesBox() {
  const x = SHIPYARD.hall.x1 - 0.2;
  return [x - 0.2, 1.15, -6.1, x + 0.1, 2.75, -1.2];
}
