// @ts-check
// Builds the Unmoored Steps meshes and their collider triangles, plus checkpoints B and C.
// Pure: the scene uploads them and moves them. Every step mesh stays inside its collider box.
import { realmToDungeon } from '../net/sdBrain.js';
import { faces } from './gateModel.js';
import { realmIsland, packRealmFaces, SD_REALM_FLOOR_RECORD, SD_ISLAND_SIDES } from './sdRealm.js';
import { SD_HALL_GLOW_RECORD, SD_HALL_ATLAS_RECORD, SD_HALL_ATLAS, atlasUv } from './sdHallArt.js';
import { SD_STEPS_RECORD, SD_STEPS_ATLAS, SD_RISER_ATLAS, SD_PARTS_ATLAS, SD_STEP_BEVEL, SD_STEP_LINE, SD_CRUMBLE_CRACKS } from './sdStepsArt.js';
import { BAYER4 } from './sdPixelKit.js';
import { SD_STEP_THICK, SD_DRIFT_SIZE, SD_BEAT_SIZE, SD_CRUMBLE_SIZE, SD_RISER_H, SD_COURSE, SD_GUST_EVERY, SD_GUST_WARN, SD_GUST_FOR, gustAt } from './sdSteps.js';
import { SD_ENDINGS } from '../net/sdMarks.js';

export const SD_STEP_KINDS = Object.freeze(['drift', 'beat', 'riser', 'crumble']);
export function stepBox(kind) {
  const size = kind === 'drift' ? SD_DRIFT_SIZE : kind === 'crumble' ? SD_CRUMBLE_SIZE : SD_BEAT_SIZE;
  return { w: size.w, d: size.d, h: kind === 'riser' ? SD_RISER_H + SD_STEP_THICK : SD_STEP_THICK };
}
export const SD_STEP_WEAR = Object.freeze({
  drift: Object.freeze({ atlas: SD_STEPS_RECORD.drift }),
  beat: Object.freeze({ atlas: SD_STEPS_RECORD.beat[0] }),
  riser: Object.freeze({ atlas: SD_STEPS_RECORD.riser }),
  crumble: Object.freeze({ atlas: SD_STEPS_RECORD.crumble[0] }),
});

function corners({ w, d, h }) {
  const x = w / 2, z = d / 2;
  return [[-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z], [-x, -h, -z], [x, -h, -z], [x, -h, z], [-x, -h, z]];
}
const TOP = [0, 3, 2, 1], UNDER = [4, 5, 6, 7];
const SIDES = Object.freeze([[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]);

/**
 * @param {{ w: number, h: number }} A
 * @param {ReadonlyArray<number>} c
 */
const cellUv = (A, c) => [(c[0] + 0.25) / A.w, (c[1] + 0.25) / A.h, (c[0] + c[2] - 0.25) / A.w, (c[1] + c[3] - 0.25) / A.h];
function cells(f, rec, a, b, c, d, ua, ub, uc, ud, nu = 1, nv = 1, keep = null) {
  const at = (P, s, t) => [0, 1, 2].map((k) => P[0][k] * (1 - s) * (1 - t) + P[1][k] * s * (1 - t) + P[2][k] * s * t + P[3][k] * (1 - s) * t);
  const uv = (s, t) => [0, 1].map((k) => ua[k] * (1 - s) * (1 - t) + ub[k] * s * (1 - t) + uc[k] * s * t + ud[k] * (1 - s) * t);
  const P = [a, b, c, d];
  for (let iv = 0; iv < nv; iv++) for (let iu = 0; iu < nu; iu++) {
    if (keep && !keep(iu, iv)) continue;
    const s0 = iu / nu, s1 = (iu + 1) / nu, t0 = iv / nv, t1 = (iv + 1) / nv;
    f.quad(rec, at(P, s0, t0), at(P, s1, t0), at(P, s1, t1), at(P, s0, t1), uv(s0, t0), uv(s1, t0), uv(s1, t1), uv(s0, t1));
  }
}
function bevelledBox(f, rec, A, { w, d, h }, { z0 = 0, cell = 0, keep = null } = {}) {
  const b = SD_STEP_BEVEL, x = w / 2, zf = d / 2, zn = -d / 2 + z0;
  const ring = (y, i) => [[-x + i, y, zn + i], [x - i, y, zn + i], [x - i, y, zf - i], [-x + i, y, zf - i]];
  const L = [ring(0, b), ring(-b, 0), ring(-b - SD_STEP_LINE, 0), ring(-h + b, 0), ring(-h, b)];
  const T = cellUv(A, A.top), U = cellUv(A, A.under);
  let face = 0;
  const n = (len) => (cell > 0 ? Math.max(1, Math.round(len / cell)) : 1);
  const kf = (k) => (keep ? (iu, iv) => keep(k, iu, iv) : null);
  const t0 = L[0];
  cells(f, rec, t0[0], t0[3], t0[2], t0[1], [T[0], T[1]], [T[0], T[3]], [T[2], T[3]], [T[2], T[1]], n(zf - zn), n(w), keep ? (iu, iv) => keep(face, iv, iu) : null);
  face++;
  const band = (up, lo, C) => {
    const c = cellUv(A, C);
    for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0]]) {
      const len = Math.hypot(up[j][0] - up[i][0], up[j][2] - up[i][2]) || Math.hypot(lo[j][0] - lo[i][0], lo[j][2] - lo[i][2]);
      cells(f, rec, up[i], up[j], lo[j], lo[i], [c[0], c[1]], [c[2], c[1]], [c[2], c[3]], [c[0], c[3]], n(len), n(Math.abs(up[i][1] - lo[i][1]) + 0.001), kf(face++));
    }
  };
  band(L[0], L[1], A.bevel);
  band(L[1], L[2], A.line);
  band(L[2], L[3], A.side);
  band(L[3], L[4], A.bevel);
  const u = L[4];
  cells(f, rec, u[0], u[1], u[2], u[3], [U[0], U[1]], [U[2], U[1]], [U[2], U[3]], [U[0], U[3]], n(w), n(zf - zn), kf(face));
}
export const SD_RACK = Object.freeze({ n: 11, w: 0.9, h: 0.12, out: 0.05, pitch: 0.19, from: 0.1 });
function rack(f, rec, A, d) {
  const z1 = -d / 2 + SD_RACK.out, z0 = -d / 2, c = cellUv(A, A.bevel), x = SD_RACK.w / 2;
  const UV = [[c[0], c[1]], [c[2], c[1]], [c[2], c[3]], [c[0], c[3]]];
  for (let k = 0; k < SD_RACK.n; k++) {
    const y = -SD_RISER_H + SD_RACK.from + k * SD_RACK.pitch, hb = SD_RACK.h / 2, hf = SD_RACK.h / 4;
    const bl = [-x, y - hb, z1], br = [x, y - hb, z1], tl = [-x, y + hb, z1], tr = [x, y + hb, z1];
    const fl = [-x, y - hf, z0], fr = [x, y - hf, z0], gl = [-x, y + hf, z0], gr = [x, y + hf, z0];
    f.quad(rec, gl, gr, fr, fl, ...UV);
    f.quad(rec, tl, tr, gr, gl, ...UV);
    f.quad(rec, fl, fr, br, bl, ...UV);
    f.quad(rec, gr, tr, br, fr, ...UV);
    f.quad(rec, fl, bl, tl, gl, ...UV);
  }
}
export function buildStepModel(kind) {
  const f = faces(), box = stepBox(kind), rec = SD_STEP_WEAR[kind].atlas;
  if (kind === 'riser') { bevelledBox(f, rec, SD_RISER_ATLAS, box, { z0: SD_RACK.out }); rack(f, rec, SD_RISER_ATLAS, box.d); } else bevelledBox(f, rec, SD_STEPS_ATLAS, box);
  return packRealmFaces(f);
}
export const SD_BEAT_DISSOLVE = Object.freeze({ keep: Object.freeze([12, 8, 4, 2]), cell: 0.135 });
export function buildBeatDissolve(keep) {
  const f = faces();
  bevelledBox(f, SD_STEP_WEAR.beat.atlas, SD_STEPS_ATLAS, stepBox('beat'), { cell: SD_BEAT_DISSOLVE.cell, keep: (face, iu, iv) => BAYER4[(((iv + face * 3) & 3) << 2) | ((iu + face * 5) & 3)] < keep });
  return packRealmFaces(f);
}
export function stepTris(kind) {
  const c = corners(stepBox(kind));
  const positions = new Float32Array(c.flat()), indices = [];
  for (const [a, b, e, g] of [TOP, UNDER, ...SIDES]) indices.push(a, b, e, a, e, g);
  return { positions, indices };
}
export function stepEdges(kind) {
  const c = corners(stepBox(kind));
  return [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].map(([a, b]) => [c[a], c[b]]);
}

function bar(f, rec, a, b, s, cell) {
  const P = SD_PARTS_ATLAS, c = cellUv(P, cell), d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d);
  const t = d.map((v) => v / L), up = Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const n1 = norm(cross(t, up)), n2 = cross(n1, t);
  const off = (p, u, v) => [p[0] + (n1[0] * u + n2[0] * v) * s / 2, p[1] + (n1[1] * u + n2[1] * v) * s / 2, p[2] + (n1[2] * u + n2[2] * v) * s / 2];
  const ring = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let k = 0; k < 4; k++) {
    const [u0, v0] = ring[k], [u1, v1] = ring[(k + 1) % 4];
    f.quad(rec, off(a, u0, v0), off(b, u0, v0), off(b, u1, v1), off(a, u1, v1), [c[0], c[1]], [c[0], c[3]], [c[2], c[3]], [c[2], c[1]]);
  }
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

export const SD_PENDULUM = Object.freeze({ len: 18, into: 0.41, rod: 0.07, foot: 2.15, head: 2.15, eye: 1.3, gear: 1.4, teeth: 16, gearD: 0.2 });
export const pendulumAngle = (dx) => Math.asin(Math.max(-1, Math.min(1, dx / SD_PENDULUM.len)));
export function buildPendulum({ teeth = true } = {}) {
  const f = faces(), P = SD_PENDULUM, rec = SD_STEPS_RECORD.parts, A = SD_PARTS_ATLAS;
  const n = P.teeth * 2, root = P.gear * 0.86, hub = P.gear * 0.22, z0 = -P.gearD / 2, z1 = P.gearD / 2, g = cellUv(A, A.gear), r = cellUv(A, A.rim);
  const gu = (x, y) => [g[0] + (g[2] - g[0]) * (0.5 + x / (2 * P.gear)), g[1] + (g[3] - g[1]) * (0.5 + y / (2 * P.gear))];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, R = teeth && i % 2 ? root : P.gear;
    const p = (a, rr, z) => [Math.cos(a) * rr, Math.sin(a) * rr, z];
    const q = (a, rr) => gu(Math.cos(a) * rr, Math.sin(a) * rr);
    f.quad(rec, p(a0, hub, z0), p(a1, hub, z0), p(a1, R, z0), p(a0, R, z0), q(a0, hub), q(a1, hub), q(a1, R), q(a0, R));
    f.quad(rec, p(a0, R, z1), p(a1, R, z1), p(a1, hub, z1), p(a0, hub, z1), q(a0, R), q(a1, R), q(a1, hub), q(a0, hub));
    f.quad(rec, p(a0, R, z0), p(a1, R, z0), p(a1, R, z1), p(a0, R, z1), [r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]);
    const b = ((i + 1) / n) * Math.PI * 2, R0 = i % 2 ? root : P.gear, R1 = i % 2 ? P.gear : root;
    if (teeth) f.quad(rec, p(b, R0, z0), p(b, R1, z0), p(b, R1, z1), p(b, R0, z1), [r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]);
  }
  for (const s of [-1, 1]) {
    bar(f, rec, [s * P.head, 0, 0], [s * P.foot, -P.len - P.into, 0], P.rod, A.rod);
    bar(f, rec, [s * P.eye, -P.len - P.into, 0], [s * P.foot, -P.len - P.into, 0], P.rod, A.rod);
  }
  bar(f, rec, [-P.head, 0, 0], [P.head, 0, 0], P.rod, A.rod);
  return packRealmFaces(f);
}

export function buildCrumbleChunks(n = 4) {
  const { at, across, along } = SD_CRUMBLE_CRACKS, W = SD_CRUMBLE_SIZE.w / 2, D = SD_CRUMBLE_SIZE.d / 2, H = SD_STEP_THICK;
  const k = across.findIndex((p) => p === at || (p[0] === at[0] && p[1] === at[1])), j = along.findIndex((p) => p[0] === at[0] && p[1] === at[1]);
  const xNeg = across.slice(0, k + 1).reverse(), xPos = across.slice(k), zNeg = along.slice(0, j + 1).reverse(), zPos = along.slice(j);
  const regions = n === 2 ? [[xNeg, [[-W, D], [W, D]], xPos], [xPos, [[W, -D], [-W, -D]], xNeg]]
    : [[zPos, [[W, D]], xPos], [xNeg, [[-W, D]], zPos], [zNeg, [[-W, -D]], xNeg], [xPos, [[W, -D]], zNeg]];
  const rec = SD_STEPS_RECORD.crumble[3], A = SD_STEPS_ATLAS, T = cellUv(A, A.top), S = cellUv(A, A.side), U = cellUv(A, A.under);
  const tw = SD_CRUMBLE_SIZE.w - 2 * SD_STEP_BEVEL, td = SD_CRUMBLE_SIZE.d - 2 * SD_STEP_BEVEL, cl = (v) => Math.max(0, Math.min(1, v));
  const topUv = (x, z) => [T[0] + (T[2] - T[0]) * cl(x / tw + 0.5), T[1] + (T[3] - T[1]) * cl(z / td + 0.5)];
  return regions.map(([a, corners, b]) => {
    let poly = [...a, ...corners, ...b.slice(1).reverse()].map((p) => [p[0], p[1]]);
    let area = 0;
    for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; area += p[0] * q[1] - q[0] * p[1]; }
    if (area > 0) poly = poly.reverse();
    let cx = 0, cz = 0;
    for (const p of poly) { cx += p[0]; cz += p[1]; }
    cx /= poly.length; cz /= poly.length;
    const mid = [cx, -H / 2, cz], o = (x, y, z) => [x - mid[0], y - mid[1], z - mid[2]];
    const f = faces();
    for (const [p, q, r] of earClip(poly)) {
      f.tri(rec, o(p[0], 0, p[1]), o(q[0], 0, q[1]), o(r[0], 0, r[1]), topUv(p[0], p[1]), topUv(q[0], q[1]), topUv(r[0], r[1]));
      f.tri(rec, o(r[0], -H, r[1]), o(q[0], -H, q[1]), o(p[0], -H, p[1]), [U[0], U[1]], [U[2], U[1]], [U[2], U[3]]);
    }
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const outer = (Math.abs(p[0]) === W && Math.abs(q[0]) === W && p[0] === q[0]) || (Math.abs(p[1]) === D && Math.abs(q[1]) === D && p[1] === q[1]);
      const c = outer ? S : U;
      f.quad(rec, o(q[0], 0, q[1]), o(p[0], 0, p[1]), o(p[0], -H, p[1]), o(q[0], -H, q[1]), [c[0], c[1]], [c[2], c[1]], [c[2], c[3]], [c[0], c[3]]);
    }
    return { model: packRealmFaces(f), at: Object.freeze(mid), poly: Object.freeze(poly.map((p) => Object.freeze(p))) };
  });
}
function earClip(poly) {
  const cw = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0;
  const inside = (p, a, b, c) => cw(a, b, p) && cw(b, c, p) && cw(c, a, p);
  const v = poly.slice(), out = [];
  for (let guard = 0; v.length > 3 && guard < 256; guard++) {
    for (let i = 0; i < v.length; i++) {
      const a = v[(i + v.length - 1) % v.length], b = v[i], c = v[(i + 1) % v.length];
      if (!cw(a, b, c) || v.some((p) => p !== a && p !== b && p !== c && inside(p, a, b, c))) continue;
      out.push([a, b, c]); v.splice(i, 1);
      break;
    }
  }
  out.push([v[0], v[1], v[2]]);
  return out;
}
export const SD_GRIT = Object.freeze({ n: 42, period: 0.5, depth: 3.2, speed: 2.4, speck: 0.05, half: 1.0 });
export function buildGritModel(seed = 0x5d95) {
  const f = faces(), rec = SD_STEPS_RECORD.parts, c = cellUv(SD_PARTS_ATLAS, SD_PARTS_ATLAS.grit);
  let s = seed >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const per = Math.round(SD_GRIT.n / ((SD_GRIT.depth + SD_GRIT.period) / SD_GRIT.period)), lay = [];
  for (let k = 0; k < per; k++) lay.push([(rnd() * 2 - 1) * SD_GRIT.half, rnd() * SD_GRIT.period, (rnd() * 2 - 1) * SD_GRIT.half]);
  const UV = [[c[0], c[1]], [c[2], c[1]], [(c[0] + c[2]) / 2, c[3]]];
  for (let y0 = -SD_STEP_THICK + SD_GRIT.period; y0 > -SD_STEP_THICK - SD_GRIT.depth; y0 -= SD_GRIT.period) {
    for (const [x, dy, z] of lay) {
      const e = SD_GRIT.speck, y = y0 - dy, P = [[x, y + e, z], [x - e, y - e, z - e], [x + e, y - e, z - e], [x, y - e, z + e]];
      for (const [a, b, d] of [[0, 2, 1], [0, 3, 2], [0, 1, 3], [1, 2, 3]]) f.tri(rec, P[a], P[b], P[d], ...UV);
    }
  }
  return packRealmFaces(f);
}

export const sdWaystonesOf = (course) => Object.freeze(course.checkpoints.map((c) => Object.freeze([c.x - 1.9, c.y, c.z + 0.4])));
export const SD_WAYSTONES = sdWaystonesOf(SD_COURSE);
export const SD_WAYSTONE = Object.freeze({ base: 0.5, baseH: 0.12, shaft: 0.3, top: 0.24, h: 0.85, cap: 0.18 });
export function buildWaystoneModel() {
  const f = faces(), W = SD_WAYSTONE, rec = SD_STEPS_RECORD.parts, P = SD_PARTS_ATLAS;
  const box = (hw0, hw1, y0, y1, cell, ends) => {
    const c = cellUv(P, cell), r0 = [[-hw0, y0, -hw0], [hw0, y0, -hw0], [hw0, y0, hw0], [-hw0, y0, hw0]], r1 = [[-hw1, y1, -hw1], [hw1, y1, -hw1], [hw1, y1, hw1], [-hw1, y1, hw1]];
    for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0]]) f.quad(rec, r1[i], r1[j], r0[j], r0[i], [c[0], c[3]], [c[2], c[3]], [c[2], c[1]], [c[0], c[1]]);
    if (ends) f.quad(rec, r1[0], r1[3], r1[2], r1[1], [c[0], c[1]], [c[0], c[3]], [c[2], c[3]], [c[2], c[1]]);
  };
  box(W.base / 2, W.base / 2, 0, W.baseH, P.stone, true);
  box(W.shaft / 2, W.top / 2, W.baseH, W.baseH + W.h, P.rune, false);
  const c = cellUv(P, P.cap), y0 = W.baseH + W.h, s = W.top / 2 + 0.03, apex = [0, y0 + W.cap, 0], r = [[-s, y0, -s], [s, y0, -s], [s, y0, s], [-s, y0, s]];
  for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0]]) f.tri(rec, r[j], r[i], apex, [c[2], c[1]], [c[0], c[1]], [(c[0] + c[2]) / 2, c[3]]);
  return packRealmFaces(f);
}

export const sdVaneAt = (course) => { const C = course.checkpoints[2]; return Object.freeze([C.x + 1.6, C.y, C.z + 1.4]); };
export const SD_VANE = Object.freeze({ at: sdVaneAt(SD_COURSE), h: 2.4, swing: 0.25, back: 0.8, arm: 1.0, fin: 0.7, head: 0.55, post: 0.09 });
const _vaneGust = { push: 0, warn: false };
export function vaneYawInto(io) {
  const t = io[0], n = Math.floor((t + SD_GUST_WARN) / SD_GUST_EVERY), u = t + SD_GUST_WARN - n * SD_GUST_EVERY, span = SD_GUST_WARN + SD_GUST_FOR;
  const dir = gustAt(n * SD_GUST_EVERY + SD_GUST_FOR / 2, _vaneGust).push > 0 ? 1 : -1;
  const k = u < span ? u / SD_VANE.swing : (u - span) / SD_VANE.back, e = k < 0 ? 0 : k > 1 ? 1 : k, w = e * e * (3 - 2 * e);
  io[1] = dir * (Math.PI / 2) * (u < span ? w : 1 - w);
}
export const vaneYawAt = (t) => { const io = new Float64Array(2); io[0] = t; vaneYawInto(io); return io[1]; };

export function buildVaneModel(ending = null) {
  const f = faces(), V = SD_VANE, rec = SD_STEPS_RECORD.parts, P = SD_PARTS_ATLAS, i = SD_ENDINGS.findIndex((E) => E.id === ending);
  bar(f, rec, [0, 0, 0], [0, V.h + 0.1, 0], V.post, P.rod);
  bar(f, rec, [0, V.h, -V.arm], [0, V.h, V.arm], 0.06, P.rod);
  const q = cellUv(P, P.vane), y = V.h, hw = V.head * 0.45, tip = [0, y, V.arm + V.head], lo = [0, y - hw, V.arm], hi = [0, y + hw, V.arm];
  f.tri(rec, lo, hi, tip, [q[0], q[1]], [q[0], q[3]], [q[2], q[1]]); f.tri(rec, tip, hi, lo, [q[2], q[1]], [q[0], q[3]], [q[0], q[1]]);
  const zf = -V.arm, zb = -V.arm + V.fin, yl = y - V.fin * 0.45, yh = y + V.fin * 0.55;
  const E = i >= 0 ? SD_HALL_ATLAS.emblem[i] : null, a = E ? atlasUv(E, 0, 0) : null, b = E ? atlasUv(E, 1, 1) : null;
  const fr = E ? SD_HALL_ATLAS_RECORD : rec, u0 = E ? a[0] : q[0], u1 = E ? b[0] : q[2], v0 = E ? a[1] : q[1], v1 = E ? b[1] : q[3];
  f.quad(fr, [0, yl, zf], [0, yl, zb], [0, yh, zb], [0, yh, zf], [u1, v0], [u0, v0], [u0, v1], [u1, v1]);
  f.quad(fr, [0, yh, zf], [0, yh, zb], [0, yl, zb], [0, yl, zf], [u0, v1], [u1, v1], [u1, v0], [u0, v0]);
  return packRealmFaces(f);
}

export function buildChecksModel(course = SD_COURSE) {
  const f = faces();
  for (const [k, c] of course.checkpoints.entries()) if (k > 0) realmIsland(f, c.x, c.z, c.r, SD_REALM_FLOOR_RECORD, { y: c.y });
  return packRealmFaces(f);
}
export function checkFloorTris(course = SD_COURSE) {
  const out = [];
  for (const [k, { x: cx, y, z: cz, r }] of course.checkpoints.entries()) {
    if (k === 0) continue;
    for (let j = 0; j < SD_ISLAND_SIDES; j++) {
      const a0 = (j / SD_ISLAND_SIDES) * Math.PI * 2, a1 = ((j + 1) / SD_ISLAND_SIDES) * Math.PI * 2;
      out.push(...realmToDungeon(cx, y, cz), ...realmToDungeon(cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r), ...realmToDungeon(cx + Math.cos(a0) * r, y, cz + Math.sin(a0) * r));
    }
  }
  return new Float32Array(out);
}

export const SD_BREATH = Object.freeze({ n: 64, halfX: 10, sweep: 10, len: 1.4, thick: 0.04 });
export function buildBreathModel(course = SD_COURSE) {
  const f = faces(), C = course.checkpoints[2], z0 = C.z + C.r, z1 = course.end;
  let seed = 0x5db7;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const rec = SD_HALL_GLOW_RECORD.brass, UV = [[0, 0], [0, 1], [1, 1], [1, 0]];
  const both = (a, b, c, d) => { f.quad(rec, a, b, c, d, ...UV); f.quad(rec, d, c, b, a, ...UV); };
  for (let k = 0; k < SD_BREATH.n; k++) {
    const x = C.x + (rnd() * 2 - 1) * SD_BREATH.halfX, z = z0 + rnd() * (z1 - z0);
    const y = C.y * (1 - (z - z0) / (z1 - z0)) - 0.4 + rnd() * 2.6;
    const half = (SD_BREATH.len * (0.6 + 0.4 * rnd())) / 2, t = SD_BREATH.thick, tail = t * 0.2;
    both([x - half, y - tail, z], [x - half, y + tail, z], [x + half, y + t, z], [x + half, y - t, z]);
    both([x - half, y, z + tail], [x - half, y, z - tail], [x + half, y, z - t], [x + half, y, z + t]);
  }
  return packRealmFaces(f);
}
