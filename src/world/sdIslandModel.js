// @ts-check
// Builds what each island hangs on: roots, chains, and the far islands. Visual only: none of it is a collider
// and none of it changes the realm floor or clamp.
import { faces } from './gateModel.js';
import { packRealmFaces, SD_REALM_BRASS_RECORD, SD_REALM_ROOT_RECORD, SD_REALM_FLOOR_RECORD, SD_ISLAND_SIDES, SD_ROOT_DEPTH, SD_LIP } from './sdRealm.js';
import { SD_COURSE } from './sdSteps.js';
import { layGear, SD_WORKS_TOOTH, SD_HANG_NOW } from './sdWorksModel.js';
import { rng } from './sdPixelKit.js';
import { SD_THRESHOLD, SD_ORRERY, SD_ARENA, SD_REALM_ORIGIN, realmToDungeon } from '../net/sdBrain.js';

export const SD_CHAIN_RECORD = 81;
export const SD_HANG = Object.freeze({ top: -SD_LIP, skirt: 2.2, foot: 0.84 });
export const SD_SPIRE = Object.freeze({ sides: 7, rings: 6, jitter: 0.18, bend: 0.06, tip: 0.18, haze: 0.84, step: 0.14 });
export const SD_CHAIN = Object.freeze({ links: 12, width: 0.58, bar: 0.13, swing: 0.035 });
export const spireDepth = (r) => SD_ROOT_DEPTH * Math.min(1.5, 0.4 + r / 12);
export const chainLink = (r) => 0.5 + 0.04 * r;

export const sdHangIslandsOf = (course) => Object.freeze([
  { stage: 'threshold', x: SD_THRESHOLD.x, z: SD_THRESHOLD.z, y: 0, r: SD_THRESHOLD.r, seed: 0x5d1101, spires: 5, chains: 2, gears: 2 },
  { stage: 'orrery', x: SD_ORRERY.x, z: SD_ORRERY.z, y: 0, r: SD_ORRERY.r, seed: 0x5d1102, spires: 5, chains: 2, gears: 3 },
  ...course.checkpoints.map((c, k) => ({ stage: 'steps', x: c.x, z: c.z, y: c.y, r: c.r, seed: 0x5d1103 + k, spires: 3, chains: 1, gears: 1 })),
  { stage: 'arena', x: SD_ARENA.x, z: SD_ARENA.z, y: 0, r: SD_ARENA.r, seed: 0x5d1107, spires: 5, chains: 2, gears: 3 },
].map((i) => Object.freeze(i)));
export const SD_HANG_ISLANDS = sdHangIslandsOf(SD_COURSE);
export const SD_HANG_STAGES = Object.freeze(['threshold', 'orrery', 'steps', 'arena']);

export function hangPlan(isl, { lite = false } = {}) {
  const r = isl.r, rnd = rng(isl.seed), foot = isl.y + SD_HANG.top - SD_HANG.skirt, rb = r * SD_HANG.foot, L0 = spireDepth(r);
  const turn = rnd() * Math.PI * 2, outer = Math.max(0, isl.spires - 1);
  const spires = [{ x: isl.x + Math.cos(turn) * 0.08 * rb, z: isl.z + Math.sin(turn) * 0.08 * rb, R: 0.5 * rb, len: L0, bendA: turn, bend: SD_SPIRE.bend * L0 }];
  for (let j = 0; j < outer && !lite; j++) {
    const a = turn + (j / outer) * Math.PI * 2 + (rnd() - 0.5) * 0.3, d = 0.55 * rb;
    spires.push({ x: isl.x + Math.cos(a) * d, z: isl.z + Math.sin(a) * d, R: (0.24 + 0.08 * rnd()) * rb, len: L0 * (0.35 + 0.35 * rnd()), bendA: a, bend: SD_SPIRE.bend * L0 * 0.6 });
  }
  const ca = turn + Math.PI / Math.max(2, outer), anchors = [];
  for (let k = 0; k < isl.chains; k++) {
    const a = ca + k * Math.PI;
    anchors.push([isl.x + Math.cos(a) * 0.75 * rb, foot + 0.2, isl.z + Math.sin(a) * 0.75 * rb]);
  }
  const gears = [];
  for (let k = 0; k < isl.gears; k++) {
    const si = spires.length > 1 && r > 4 ? 1 + (k % (spires.length - 1)) : 0, s = spires[si];
    const rg = r > 4 ? 1 + rnd() : 0.6 + 0.3 * rnd();
    gears.push({ spire: si, t: 0.22 + 0.3 * rnd(), a: s.bendA + Math.PI * (0.35 + 0.3 * rnd()) * (k % 2 ? 1 : -1), r: rg, teeth: Math.max(10, Math.round(rg * 9)) });
  }
  return { foot, rb, L0, spires, anchors, gears, seed: isl.seed };
}

function spireRing(s, foot, i) {
  const t = i / (SD_SPIRE.rings - 1), b = s.bend * t * t;
  return { x: s.x + Math.cos(s.bendA) * b, y: foot + 0.05 - s.len * t, z: s.z + Math.sin(s.bendA) * b, R: s.R * (1 - (1 - SD_SPIRE.tip) * Math.pow(t, 1.1)) };
}
const hash = (seed, j, i, k) => {
  let h = (seed ^ Math.imul(j + 1, 0x9e3779b1) ^ Math.imul(i + 1, 0x85ebca6b) ^ Math.imul(k + 1, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0; h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

function away(f, rec, a, b, c, d, ua, ub, uc, ud, from) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const m = [(a[0] + c[0]) / 2 - from[0], (a[1] + c[1]) / 2 - from[1], (a[2] + c[2]) / 2 - from[2]];
  if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] >= 0) f.quad(rec, a, b, c, d, ua, ub, uc, ud);
  else f.quad(rec, d, c, b, a, ud, uc, ub, ua);
}
function awayTri(f, rec, a, b, c, ua, ub, uc, from) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const m = [(a[0] + b[0] + c[0]) / 3 - from[0], (a[1] + b[1] + c[1]) / 3 - from[1], (a[2] + b[2] + c[2]) / 3 - from[2]];
  if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] >= 0) f.tri(rec, a, b, c, ua, ub, uc);
  else f.tri(rec, a, c, b, ua, uc, ub);
}
const D = (x, y, z) => realmToDungeon(x, y, z);

export function islandRoot(f, isl, plan) {
  const { foot, rb, L0, spires } = plan, N = SD_ISLAND_SIDES, top = isl.y + SD_HANG.top, depth = -SD_HANG.top + SD_HANG.skirt + L0;
  const vOf = (y) => Math.min(1, (isl.y - y) / depth);
  const uRep = (circ) => Math.max(1, Math.round((circ * 2) / depth));
  const skirtU = uRep(2 * Math.PI * isl.r), ctr = D(isl.x, foot - 0.02, isl.z), inside = D(isl.x, (top + foot) / 2, isl.z);
  const footAt = (k) => {
    const a = (k / N) * Math.PI * 2, j = hash(plan.seed, 99, 0, k % N);
    return [Math.cos(a) * rb * (0.96 + 0.08 * j), foot + 0.3 * (j - 0.5), Math.sin(a) * rb * (0.96 + 0.08 * j)];
  };
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2, f0 = footAt(k), f1 = footAt(k + 1);
    const t0 = D(isl.x + Math.cos(a0) * isl.r, top, isl.z + Math.sin(a0) * isl.r), t1 = D(isl.x + Math.cos(a1) * isl.r, top, isl.z + Math.sin(a1) * isl.r);
    const b0 = D(isl.x + f0[0], f0[1], isl.z + f0[2]), b1 = D(isl.x + f1[0], f1[1], isl.z + f1[2]);
    const u0 = (k / N) * skirtU, u1 = ((k + 1) / N) * skirtU;
    away(f, SD_REALM_ROOT_RECORD, t0, t1, b1, b0, [u0, vOf(top)], [u1, vOf(top)], [u1, vOf(f1[1])], [u0, vOf(f0[1])], inside);
    awayTri(f, SD_REALM_ROOT_RECORD, ctr, b0, b1, [0.5, vOf(foot - 0.02)], [0.5 + Math.cos(a0) * 0.5, vOf(f0[1])], [0.5 + Math.cos(a1) * 0.5, vOf(f1[1])], D(isl.x, foot + 5, isl.z));
  }
  const S = SD_SPIRE.sides;
  spires.forEach((s, j) => {
    const U = uRep(2 * Math.PI * s.R), rings = [];
    for (let i = 0; i < SD_SPIRE.rings; i++) {
      const c = spireRing(s, foot, i), ring = [];
      for (let k = 0; k < S; k++) {
        const a = (k / S) * Math.PI * 2 + j, rr = c.R * (1 + SD_SPIRE.jitter * (2 * hash(plan.seed, j, i, k) - 1));
        const dy = i === SD_SPIRE.rings - 1 ? c.R * 1.2 * (hash(plan.seed, j, 50 + i, k) - 0.5) : 0;
        ring.push([c.x + Math.cos(a) * rr, c.y + dy, c.z + Math.sin(a) * rr]);
      }
      const step = i > 0 && i < SD_SPIRE.rings - 1 ? 1 + SD_SPIRE.step * (0.6 + 0.8 * hash(plan.seed, j, 80 + i, 0)) : 1;
      const outer = ring.map((p) => [c.x + (p[0] - c.x) * step, p[1], c.z + (p[2] - c.z) * step]);
      rings.push({ c, ring, outer, v: ring.map((p) => (i === SD_SPIRE.rings - 1 ? Math.max(SD_SPIRE.haze, vOf(p[1])) : vOf(p[1]))) });
    }
    for (let i = 0; i + 1 < rings.length; i++) {
      const A = rings[i], B = rings[i + 1], mid = D(A.c.x * 0.5 + B.c.x * 0.5, (A.c.y + B.c.y) / 2, A.c.z * 0.5 + B.c.z * 0.5);
      const ledge = i + 1 < rings.length - 1, ctr = D(B.c.x, B.c.y + 50, B.c.z);
      for (let k = 0; k < S; k++) {
        const k1 = (k + 1) % S, u0 = (k / S) * U, u1 = ((k + 1) / S) * U;
        away(f, SD_REALM_ROOT_RECORD, D(...A.ring[k]), D(...A.ring[k1]), D(...B.outer[k1]), D(...B.outer[k]), [u0, A.v[k]], [u1, A.v[k1]], [u1, B.v[k1]], [u0, B.v[k]], mid);
        if (ledge) away(f, SD_REALM_ROOT_RECORD, D(...B.outer[k]), D(...B.outer[k1]), D(...B.ring[k1]), D(...B.ring[k]), [u0, B.v[k]], [u1, B.v[k1]], [u1, B.v[k1]], [u0, B.v[k]], ctr);
      }
    }
    const last = rings[rings.length - 1], tip = D(last.c.x + last.c.R * 0.3, last.c.y - last.c.R * 1.6, last.c.z), above = D(last.c.x, last.c.y + 1, last.c.z);
    for (let k = 0; k < S; k++) awayTri(f, SD_REALM_ROOT_RECORD, D(...last.ring[k]), D(...last.ring[(k + 1) % S]), tip, [(k / S) * U, last.v[k]], [((k + 1) / S) * U, last.v[(k + 1) % S]], [((k + 0.5) / S) * U, 1], above);
  });
  for (const g of plan.gears) {
    const s = spires[g.spire], i = g.t * (SD_SPIRE.rings - 1), lo = Math.floor(i), c0 = spireRing(s, foot, lo), c1 = spireRing(s, foot, Math.min(SD_SPIRE.rings - 1, lo + 1)), w = i - lo;
    const cx = c0.x + (c1.x - c0.x) * w, cy = c0.y + (c1.y - c0.y) * w, cz = c0.z + (c1.z - c0.z) * w, R = c0.R + (c1.R - c0.R) * w;
    const ox = cx + Math.cos(g.a) * R * 0.8, oz = cz + Math.sin(g.a) * R * 0.8;
    const e1 = [Math.cos(g.a), 0, Math.sin(g.a)], e2 = [0, 1, 0], ax = [-Math.sin(g.a), 0, Math.cos(g.a)];
    layGear(f, SD_REALM_BRASS_RECORD, {
      r: g.r, teeth: g.teeth, under: true, tipV: [0, 0.1], shape: GEAR_RIM,
      at: (u, v, y) => D(ox + e1[0] * u + e2[0] * v + ax[0] * y, cy + e1[1] * u + e2[1] * v + ax[1] * y, oz + e1[2] * u + e2[2] * v + ax[2] * y),
    });
  }
}
const GEAR_RIM = Object.freeze({ ...SD_WORKS_TOOTH, h: 0.28, rim: 0.2, hubProud: 0.6 });

export function buildHangModel(stage, { lite = false, islands = SD_HANG_ISLANDS } = {}) {
  const f = faces();
  for (const isl of islands) if (isl.stage === stage) islandRoot(f, isl, hangPlan(isl, { lite }));
  return packRealmFaces(f);
}

export function buildChainModel(isl, { lite = false } = {}) {
  const plan = hangPlan(isl, { lite }), f = faces(), lk = chainLink(isl.r), wk = lk * SD_CHAIN.width, th = lk * SD_CHAIN.bar, pitch = lk - 2 * th;
  for (const an of plan.anchors) {
    for (let n = 0; n < SD_CHAIN.links; n++) {
      const cy = an[1] - th - n * pitch - lk / 2, turned = n % 2 === 1;
      const e = turned ? [0, 0, 1] : [1, 0, 0], nrm = turned ? [1, 0, 0] : [0, 0, 1];
      const P = (s, y, d) => D(an[0] + e[0] * s + nrm[0] * d, cy + y, an[2] + e[2] * s + nrm[2] * d);
      const ho = wk / 2, hi = wk / 2 - th, vo = lk / 2, vi = lk / 2 - th, hd = th / 2, mid = P(0, 0, 0);
      const outer = [[-ho, -vo], [ho, -vo], [ho, vo], [-ho, vo]], inner = [[-hi, -vi], [hi, -vi], [hi, vi], [-hi, vi]];
      for (let k = 0; k < 4; k++) {
        const k1 = (k + 1) % 4, o0 = outer[k], o1 = outer[k1], i0 = inner[k], i1 = inner[k1];
        for (const d of [-hd, hd]) away(f, SD_CHAIN_RECORD, P(o0[0], o0[1], d), P(o1[0], o1[1], d), P(i1[0], i1[1], d), P(i0[0], i0[1], d), [0, 0], [1, 0], [1, 0.25], [0, 0.25], P(0, 0, -d * 50));
        away(f, SD_CHAIN_RECORD, P(o0[0], o0[1], -hd), P(o1[0], o1[1], -hd), P(o1[0], o1[1], hd), P(o0[0], o0[1], hd), [0, 0.5], [1, 0.5], [1, 0.75], [0, 0.75], mid);
        away(f, SD_CHAIN_RECORD, P(i0[0], i0[1], -hd), P(i1[0], i1[1], -hd), P(i1[0], i1[1], hd), P(i0[0], i0[1], hd), [0, 0.75], [1, 0.75], [1, 1], [0, 1], P(o0[0] * 4 + o1[0] * 4, o0[1] * 4 + o1[1] * 4, 0));
      }
    }
  }
  const a = plan.anchors[0], b = plan.anchors[1];
  const dx = b ? b[0] - a[0] : -(a[2] - isl.z), dz = b ? b[2] - a[2] : a[0] - isl.x, l = Math.hypot(dx, dz) || 1;
  return { model: packRealmFaces(f), axle: Object.freeze({ p: Object.freeze(D(a[0], a[1], a[2])), d: Object.freeze([dx / l, 0, dz / l]) }) };
}

export function chainSwing(ticks) {
  const s = Math.floor(ticks), e = ticks - s;
  return SD_CHAIN.swing * (s % 2 === 0 ? 1 : -1) * Math.cos(Math.PI * e);
}
export function chainMatrix(axle, now, out) {
  const angle = now[SD_HANG_NOW.swing], p = axle.p, d = axle.d, c = Math.cos(angle), s = Math.sin(angle), t = 1 - c, x = d[0], y = d[1], z = d[2];
  out[0] = t * x * x + c; out[1] = t * x * y + s * z; out[2] = t * x * z - s * y; out[3] = 0;
  out[4] = t * x * y - s * z; out[5] = t * y * y + c; out[6] = t * y * z + s * x; out[7] = 0;
  out[8] = t * x * z + s * y; out[9] = t * y * z - s * x; out[10] = t * z * z + c; out[11] = 0;
  out[12] = p[0] - (out[0] * p[0] + out[4] * p[1] + out[8] * p[2]);
  out[13] = p[1] - (out[1] * p[0] + out[5] * p[1] + out[9] * p[2]);
  out[14] = p[2] - (out[2] * p[0] + out[6] * p[1] + out[10] * p[2]);
  out[15] = 1;
  return out;
}

export const SD_FAR_CENTRE = Object.freeze([0, 0, 130]);
export const SD_FAR_ISLANDS = Object.freeze([
  [0.15, 306, -64, 9, 22], [0.62, 296, -90, 6, 15], [1.1, 322, -58, 11, 26], [1.58, 292, -104, 7, 17],
  [2.05, 316, -73, 10, 24], [2.5, 300, -54, 5, 12], [2.98, 324, -84, 8, 20], [3.45, 294, -66, 9, 23],
  [3.95, 312, -98, 6, 14], [4.42, 304, -60, 10, 25], [4.9, 320, -78, 7, 18], [5.5, 297, -70, 8, 19],
].map(([a, d, y, r, len]) => Object.freeze({ a, d, y, r, len })));
export function buildFarIslandsModel() {
  const f = faces(), N = 8;
  SD_FAR_ISLANDS.forEach((isl, j) => {
    const cx = SD_FAR_CENTRE[0] + Math.cos(isl.a) * isl.d, cz = SD_FAR_CENTRE[2] + Math.sin(isl.a) * isl.d, seed = 0x5d11f0 + j;
    const at = (rad, k, y) => { const a = (k / N) * Math.PI * 2 + j; return D(cx + Math.cos(a) * rad, y, cz + Math.sin(a) * rad); };
    const ctr = D(cx, isl.y, cz), under = D(cx, isl.y - 1e3, cz), waistY = isl.y - isl.len * 0.45, tip = D(cx + isl.r * 0.2, isl.y - isl.len, cz);
    for (let k = 0; k < N; k++) {
      const j0 = 0.85 + 0.3 * hash(seed, 0, 0, k), j1 = 0.85 + 0.3 * hash(seed, 0, 0, (k + 1) % N);
      awayTri(f, SD_REALM_FLOOR_RECORD, ctr, at(isl.r, k, isl.y), at(isl.r, k + 1, isl.y), [0, 0], [isl.r / 4, 0], [0, isl.r / 4], under);
      const w0 = at(isl.r * 0.55 * j0, k, waistY + 2 * (j0 - 1)), w1 = at(isl.r * 0.55 * j1, k + 1, waistY + 2 * (j1 - 1)), mid = D(cx, isl.y - isl.len * 0.3, cz);
      away(f, SD_REALM_ROOT_RECORD, at(isl.r, k, isl.y), at(isl.r, k + 1, isl.y), w1, w0, [k / 4, 0.05], [(k + 1) / 4, 0.05], [(k + 1) / 4, 0.5], [k / 4, 0.5], mid);
      awayTri(f, SD_REALM_ROOT_RECORD, w0, w1, tip, [k / 4, 0.5], [(k + 1) / 4, 0.5], [(k + 0.5) / 4, 1], mid);
    }
  });
  return packRealmFaces(f);
}
export function farIslandsMatrix(now, out) {
  const angle = now[SD_HANG_NOW.far], c = Math.cos(angle), s = Math.sin(angle), px = SD_REALM_ORIGIN[0] + SD_FAR_CENTRE[0], pz = SD_REALM_ORIGIN[2] + SD_FAR_CENTRE[2];
  out[0] = c; out[1] = 0; out[2] = s; out[3] = 0;
  out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
  out[8] = -s; out[9] = 0; out[10] = c; out[11] = 0;
  out[12] = px - (c * px - s * pz); out[13] = 0; out[14] = pz - (s * px + c * pz); out[15] = 1;
  return out;
}
