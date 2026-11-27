// @ts-check
import { egCircleSpecs, egBandOfHall, EG_BRINK_HALLS, egSeed } from '../../net/eliteGates/egLaw.js';
import { egRouteAlongAt, egRouteLen } from '../../net/eliteGates/egRoute.js';
import { SD_REALM_ORIGIN } from '../../net/sdBrain.js';
import { SD_LIP, SD_ISLAND_SIDES } from '../sdRealm.js';
import { hangPlan, SD_HANG } from '../sdIslandModel.js';
import { rng } from '../sdPixelKit.js';
import { EG_KIT_RECORD, egKitStyle } from './egKit.js';
import { egBandArchive, EG_DRESS, EG_KIT_MAP } from './egBandArt.js';
import { egAtmosOf } from './egAtmos.js';
// `egHall.js` imports this module, so read these bindings only inside functions, never at module load.
import { egIsleDisc, egTubeBand, egWallBand, egWallFoot, egNicheBoxes, EG_LAMP } from './egHall.js';

const K = EG_KIT_RECORD, ASHLAR = EG_DRESS.pillar;
const TAU = Math.PI * 2;
const ringAngle = (c) => ((Math.atan2(c.z - c.cz, c.x - c.cx) % TAU) + TAU) % TAU;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

export const EG_RUIN = Object.freeze({
  ring: 2.5, pitch: Object.freeze([6, 9]), pitchLite: 12, wayPad: 4, floorPad: 1.0, stepPad: 1.2,
  depth: Object.freeze([20, 40]), lampTop: Object.freeze([2.6, 3.4]), whole: Object.freeze([7.2, 9.4]), broken: Object.freeze([-1.5, 6.0]),
  wholeEvery: 3, slab: 0.6, bay: Object.freeze([6, 8]), bayLite: 12, fall: Object.freeze([16, 28]),
  tris: 20000, trisLite: 12000,
});
export const EG_RUIN_CORNICE = Object.freeze({ gap: 0.004, under: 0.002, reach: 0.35 });
const MB = EG_KIT_MAP[EG_KIT_RECORD.moulding].bands, FXB = EG_KIT_MAP[EG_KIT_RECORD.fixture].bands, FDB = EG_KIT_MAP[EG_KIT_RECORD.found].bands, CHB = EG_KIT_MAP[EG_KIT_RECORD.chain].bands;
export const EG_FOUND_V = Object.freeze({ slab: FDB.slab, course: FDB.courses, row: 8 / EG_KIT_MAP[EG_KIT_RECORD.found].h, rubble: FDB.rubble, deep: FDB.deep, haze: FDB.haze[0] });
export const EG_FIXTURE_V = Object.freeze({ flame: FXB.flame, body: FXB.body, grille: FXB.grille, cells: EG_KIT_MAP[EG_KIT_RECORD.fixture].cells, quad: Object.freeze([0.5, 1]) });
export const EG_RUIN_FORMS = Object.freeze([
  Object.freeze({ col: Object.freeze({ r: 0.55, sides: 12, taper: 0.88 }), course: Object.freeze({ n: 5, h: 0.85, step: 0.55 }), spire: Object.freeze({ sides: 7, rings: 6, jitter: 0.18, bend: 0.06, tip: 0.18, step: 0.14, twist: 0, len: 1.0, sats: 0, rec: K.found }), statue: 3.7 }),
  Object.freeze({ col: Object.freeze({ r: 0.6, sides: 12, taper: 0.9 }), course: Object.freeze({ n: 3, h: 0.8, step: 0.45 }), spire: Object.freeze({ sides: 6, rings: 7, jitter: 0.26, bend: 0.2, tip: 0.1, step: 0.05, twist: 0.32, len: 1.1, sats: 2, rec: K.found }), statue: 3.5 }),
  Object.freeze({ col: Object.freeze({ r: 0.5, sides: 8, taper: 0.92 }), course: Object.freeze({ n: 2, h: 0.7, step: 0.4 }), spire: Object.freeze({ sides: 5, rings: 5, jitter: 0.05, bend: 0, tip: 0.02, step: 0, twist: 0, len: 1.15, sats: 5, rec: K.crystal }), statue: 2.6 }),
  Object.freeze({ col: Object.freeze({ r: 0.65, sides: 6, taper: 0.95 }), course: Object.freeze({ n: 3, h: 0.9, step: 0.6 }), spire: Object.freeze({ sides: 6, rings: 4, jitter: 0.03, bend: 0, tip: 0.7, step: 0.32, twist: 0, len: 0.8, sats: 5, rec: K.crystal }), statue: 3.8 }),
]);
const formOf = (band) => EG_RUIN_FORMS[clamp(band | 0, 0, 3)];
export const EG_FIXTURE_FLAME = Object.freeze({ tripod: 1.1, lantern: 1.2, moonlamp: 1.64, basket: 1.45 });
const GALLOWS = 1.05;

const mv = (b, t) => lerp(MB[b][0], MB[b][1], clamp(t, 0, 1));
const prof = (pts, bands) => Object.freeze({ pts: Object.freeze(pts.map((p) => Object.freeze(p))), bands: Object.freeze(bands) });
const leanProfile = (P) => {
  const keep = P.pts.map((_, j) => j === 0 || j === P.pts.length - 1 || P.bands[j] !== P.bands[j - 1]);
  return { pts: P.pts.filter((_, j) => keep[j]), bands: P.bands.filter((_, j) => keep[j]) };
};
export const EG_CORNICES = Object.freeze({
  'egg-and-dart': prof([[0, 0], [0.3, 0], [0.3, -0.06], [0.27, -0.08], [0.32, -0.13], [0.32, -0.19], [0.27, -0.24], [0.24, -0.26], [0.24, -0.34], [0.2, -0.37], [0.13, -0.42], [0.07, -0.5], [0.03, -0.62], [0.01, -0.78]],
    ['fillet', 'fillet', 'fillet', 'ornament', 'ornament', 'ornament', 'band', 'band', 'cove', 'cove', 'cove', 'cove', 'torn']),
  skulls: prof([[0, 0], [0.28, 0], [0.28, -0.05], [0.24, -0.08], [0.31, -0.11], [0.31, -0.13], [0.31, -0.42], [0.25, -0.45], [0.25, -0.5], [0.12, -0.6], [0.02, -0.76]],
    ['fillet', 'fillet', 'fillet', 'band', 'band', 'ornament', 'cove', 'cove', 'cove', 'torn']),
  facets: prof([[0, 0], [0.33, 0], [0.33, -0.05], [0.34, -0.17], [0.2, -0.3], [0.27, -0.38], [0.06, -0.62], [0.01, -0.68]],
    ['fillet', 'fillet', 'ornament', 'ornament', 'band', 'cove', 'torn']),
  straps: prof([[0, 0], [0.34, 0], [0.34, -0.55], [0.22, -0.62], [0.01, -0.7]],
    ['fillet', 'ornament', 'band', 'torn']),
});

const RUIN_SALT = 0x0e6a51;
function h01(seed, a = 0, b = 0, c = 0) {
  let h = (seed ^ Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca6b) ^ Math.imul(c + 1, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0; h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const hallSeed = (spec) => egSeed(spec.seed >>> 0, RUIN_SALT ^ Math.imul(spec.h | 0, 0x2545f491));
function bandAt(spec, seed, x, y, z, key) {
  const band = egBandOfHall(spec.h);
  if (!EG_BRINK_HALLS.includes(spec.h) || band <= 0) return band;
  const t = clamp(egRouteAlongAt(spec, x, y, z) / Math.max(1, spec.route ? egRouteLen(spec) : spec.len ?? 80), 0, 1);
  if (t < 1 / 3) return band - 1;
  if (t > 2 / 3) return band;
  return h01(seed, 777, key) < (t - 1 / 3) * 3 ? band : band - 1;
}

/** @param {any} spec */
const EG_RUIN_FALL_DEEP = 120;
function ruinLaw(spec) {
  const floors = [], boxes = [], air = [], rings = [], ways = [];
  let magma = null;
  for (const [i, d] of spec.discs.entries()) floors.push({ t: 'd', i, x: d.x, z: d.z, r: d.r, y: d.y ?? 0, b: [d.x - d.r, d.z - d.r, d.x + d.r, d.z + d.r], top: d.y ?? 0 });
  for (const bd of spec.bands) floors.push({ t: 'b', x0: bd.x - bd.halfW, x1: bd.x + bd.halfW, z0: bd.z0, z1: bd.z1, y: bd.y ?? 0, b: [bd.x - bd.halfW, bd.z0, bd.x + bd.halfW, bd.z1], top: bd.y ?? 0 });
  for (const l of spec.lanes ?? []) {
    const dx = l.bx - l.ax, dz = l.bz - l.az, len = Math.hypot(dx, dz) || 1;
    floors.push({ t: 'l', ax: l.ax, az: l.az, bx: l.bx, bz: l.bz, ux: dx / len, uz: dz / len, len, hw: l.hw, y: l.y ?? 0, b: [Math.min(l.ax, l.bx) - l.hw, Math.min(l.az, l.bz) - l.hw, Math.max(l.ax, l.bx) + l.hw, Math.max(l.az, l.bz) + l.hw], top: l.y ?? 0 });
  }
  for (const q of spec.ramps ?? []) {
    const dx = q.bx - q.ax, dz = q.bz - q.az, len = Math.hypot(dx, dz) || 1;
    floors.push({ t: 'r', ax: q.ax, az: q.az, ux: dx / len, uz: dz / len, len, hw: q.hw, y0: q.y0, y1: q.y1, b: [Math.min(q.ax, q.bx) - q.hw, Math.min(q.az, q.bz) - q.hw, Math.max(q.ax, q.bx) + q.hw, Math.max(q.az, q.bz) + q.hw], top: Math.min(q.y0, q.y1) });
  }
  for (const q of spec.caves ?? []) {
    const yLo = Math.min(q.y, q.yB ?? q.y), yHi = Math.max(q.y, q.yB ?? q.y), out = q.open ? 1.4 : 0.6;
    boxes.push([q.x - q.halfW - out, q.open ? yLo - 0.9 : yLo - egWallFoot(q), q.z0, q.x + q.halfW + out, yHi + q.height + (q.kit === 'gloam' ? 10 : 1.2), q.z1]);
    ways.push([q.x, q.z0, q.halfW + 0.6], [q.x, q.z1, q.halfW + 0.6]);
  }
  const ox = SD_REALM_ORIGIN[0] + spec.x0, oz = SD_REALM_ORIGIN[2];
  for (const { b } of egNicheBoxes(spec)) boxes.push([b[0] - ox - 0.1, b[1] - 0.1, b[2] - oz - 0.1, b[3] - ox + 0.1, b[4] + 0.3, b[5] - oz + 0.1]);
  for (const q of spec.heroes ?? []) boxes.push([q.box[0] - 0.5, q.box[1] - 0.5, q.box[2] - 0.5, q.box[3] + 0.5, q.box[4] + 0.5, q.box[5] + 0.5]);
  for (const s of spec.steps ?? []) {
    const hw = s.w / 2 + (s.amp ?? 0);
    boxes.push([s.x - hw - 0.3, s.y - 1.5, s.z - s.d / 2 - 0.3, s.x + hw + 0.3, s.y + 3, s.z + s.d / 2 + 0.3]);
    const g = s.gap ?? 0, a = s.after ?? 0;
    if (s.hd === 1 || s.hd === 3) { const lo = s.hd === 1 ? g : a, hi = s.hd === 1 ? a : g; air.push([s.x - s.w / 2 - lo - 0.3, s.y - 4, s.z - s.d / 2 - 0.3, s.x + s.w / 2 + hi + 0.3, s.y + 4, s.z + s.d / 2 + 0.3]); }
    else air.push([s.x - hw - 0.3, s.y - 4, s.z - s.d / 2 - (s.hd === 2 ? a : g) - 0.3, s.x + hw + 0.3, s.y + 4, s.z + s.d / 2 + (s.hd === 2 ? g : a) + 0.3]);
    ways.push([s.x, s.z - s.d / 2, hw], [s.x, s.z + s.d / 2, hw]);
    if ((s.road ?? 0) === 0 && s.after > 0 && !s.hd) ways.push([s.x, s.z + s.d / 2 + s.after, s.w / 2]);
  }
  for (const v of spec.vents ?? []) boxes.push([v.x - v.halfW, 0.05, v.z - v.d / 2, v.x + v.halfW, 8, v.z + v.d / 2]);
  for (const l of spec.lanes ?? []) ways.push([l.ax, l.az, l.hw], [l.bx, l.bz, l.hw]);
  for (const bd of spec.bands) ways.push([bd.x, bd.z0, bd.halfW], [bd.x, bd.z1, bd.halfW]);
  for (const q of spec.ramps ?? []) ways.push([q.ax, q.az, q.hw], [q.bx, q.bz, q.hw]);
  for (const d of spec.deco ?? []) {
    const y = d.y ?? 0;
    if (d.t === 'wall') { rings.push([d.x, d.z, d.r - 0.4, d.r + 1.3, y - 0.6, y + d.h + 2]); ways.push([d.x, d.z - d.r, 0.2 * d.r], [d.x, d.z + d.r, 0.2 * d.r]); }
    else if (d.t === 'tiers') { rings.push([d.x, d.z, d.r - 0.4, d.r + 3.9, y - 0.6, y + d.h * 0.5 + 1]); ways.push([d.x, d.z - d.r, 0.2 * d.r], [d.x, d.z + d.r, 0.2 * d.r]); }
    else if (d.t === 'hall') { for (const sg of [-1, 1]) boxes.push([d.x + sg * d.hw - (sg > 0 ? 0.4 : 1.3), y - 0.6, d.z0, d.x + sg * d.hw + (sg > 0 ? 1.3 : 0.4), y + d.h + 2, d.z1]); ways.push([d.x, d.z0, d.hw], [d.x, d.z1, d.hw]); }
    else if (d.t === 'arch') boxes.push([d.x - d.r - 1.5, y + 0.05, d.z - 0.8, d.x + d.r + 1.5, y + d.h + 0.5, d.z + 0.8]);
    else if (d.t === 'magma') magma = { x: d.x, z: d.z, r: d.r, y };
  }
  if (spec.gate) boxes.push([spec.gate.x - spec.gate.halfW - 0.3, 0.05, spec.gate.z - 0.5, spec.gate.x + spec.gate.halfW + 0.3, 5, spec.gate.z + 0.5]);
  // No ruin goes under or inside a falling piece, because it would hang in the air after the piece falls.
  for (const d of spec.discs) if (egIsleDisc(spec, d)) rings.push([d.x, d.z, 0, d.r + 0.05, (d.y ?? 0) - EG_RUIN_FALL_DEEP, (d.y ?? 0) + 0.05]);
  for (const bd of spec.bands) if (egWallBand(spec, bd) || egTubeBand(bd)) boxes.push([bd.x - bd.halfW - 0.05, (bd.y ?? 0) - EG_RUIN_FALL_DEEP, bd.z0, bd.x + bd.halfW + 0.05, (bd.y ?? 0) + 0.05, bd.z1]);
  return { floors, boxes, air, rings, ways, magma };
}
function onFloor(F, x, z) {
  if (x < F.b[0] || x > F.b[2] || z < F.b[1] || z > F.b[3]) return false;
  if (F.t === 'd') { const dx = x - F.x, dz = z - F.z; return dx * dx + dz * dz <= F.r * F.r; }
  if (F.t === 'b') return true;
  const px = x - F.ax, pz = z - F.az, s = px * F.ux + pz * F.uz, t = -px * F.uz + pz * F.ux;
  if (F.t === 'r') return s >= 0 && s <= F.len && Math.abs(t) <= F.hw;
  const sc = clamp(s, 0, F.len);
  return Math.hypot(px - F.ux * sc, pz - F.uz * sc) <= F.hw;
}
function topOf(F, x, z) {
  if (F.t !== 'r') return F.y;
  return F.y0 + (F.y1 - F.y0) * clamp(((x - F.ax) * F.ux + (z - F.az) * F.uz) / F.len, 0, 1);
}
function floorDist(F, x, z) {
  if (F.t === 'd') return Math.hypot(x - F.x, z - F.z) - F.r;
  if (F.t === 'b') { const dx = Math.max(F.x0 - x, x - F.x1), dz = Math.max(F.z0 - z, z - F.z1); return dx > 0 || dz > 0 ? Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) : Math.max(dx, dz); }
  const px = x - F.ax, pz = z - F.az, s = px * F.ux + pz * F.uz, t = -px * F.uz + pz * F.ux;
  if (F.t === 'l') { const sc = clamp(s, 0, F.len); return Math.hypot(px - F.ux * sc, pz - F.uz * sc) - F.hw; }
  const ds = Math.max(-s, s - F.len), dt = Math.abs(t) - F.hw;
  return ds > 0 || dt > 0 ? Math.hypot(Math.max(ds, 0), Math.max(dt, 0)) : Math.max(ds, dt);
}
/**
 * @param {any} L
 * @param {number} x
 * @param {number} z
 * @param {number} rad
 * @param {number} [floorPad]
 * @param {number} [ringPad]
 */
function clearTall(L, x, z, rad, floorPad = EG_RUIN.floorPad, ringPad = 0.3) {
  for (const [wx, wz, hw] of L.ways) if (Math.hypot(x - wx, z - wz) - hw < EG_RUIN.wayPad + rad) return false;
  for (const F of L.floors) if (floorDist(F, x, z) < floorPad + rad) return false;
  for (const b of L.boxes) { const pad = rad + 0.5; if (x > b[0] - pad && x < b[3] + pad && z > b[2] - pad && z < b[5] + pad) return false; }
  for (const b of L.air) { const pad = rad + EG_RUIN.stepPad; if (x > b[0] - pad && x < b[3] + pad && z > b[2] - pad && z < b[5] + pad) return false; }
  for (const [cx, cz, r0, r1] of L.rings) { const d = Math.hypot(x - cx, z - cz); if (d > r0 - rad - ringPad && d < r1 + rad + ringPad) return false; }
  return true;
}

// Buckets are pooled across halls and reset per hall, so `packRuin` must copy them out before the next build reuses
// them.
const POOL = new Map();
function ruinWriter() {
  const B = new Map();
  let band = 0, cur = null, curKey = -1, marks = null;
  const lo = [0, 0, 0], hi = [0, 0, 0];
  const pieces = [];
  const bucket = (rec) => {
    const key = band * 1000 + rec;
    if (key === curKey) return cur;
    let g = B.get(key);
    if (!g) {
      g = POOL.get(key);
      if (!g) POOL.set(key, (g = { band, rec, p: new Float32Array(3 * 8192), n: new Float32Array(3 * 8192), uv: new Float32Array(2 * 8192), v: 0 }));
      g.v = 0;
      B.set(key, g);
    }
    if (marks && !marks.has(key)) marks.set(key, g.v);
    cur = g; curKey = key;
    return g;
  };
  const grow = (g) => {
    const cap = (g.p.length / 3) * 2, p = new Float32Array(cap * 3), n = new Float32Array(cap * 3), uv = new Float32Array(cap * 2);
    p.set(g.p); n.set(g.n); uv.set(g.uv); g.p = p; g.n = n; g.uv = uv;
  };
  function tri(rec, ax, ay, az, bx, by, bz, cx, cy, cz, au, av, bu, bv, cu, cv) {
    const ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az;
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (!(l > 1e-10)) return;
    nx /= l; ny /= l; nz /= l;
    const g = bucket(rec);
    if ((g.v + 3) * 3 > g.p.length) grow(g);
    let i = g.v * 3, j = g.v * 2;
    g.p[i] = ax; g.p[i + 1] = ay; g.p[i + 2] = az; g.p[i + 3] = bx; g.p[i + 4] = by; g.p[i + 5] = bz; g.p[i + 6] = cx; g.p[i + 7] = cy; g.p[i + 8] = cz;
    for (let k = 0; k < 3; k++, i += 3) { g.n[i] = nx; g.n[i + 1] = ny; g.n[i + 2] = nz; }
    g.uv[j] = au; g.uv[j + 1] = av; g.uv[j + 2] = bu; g.uv[j + 3] = bv; g.uv[j + 4] = cu; g.uv[j + 5] = cv;
    g.v += 3;
    if (marks) {
      if (ax < lo[0]) lo[0] = ax; if (bx < lo[0]) lo[0] = bx; if (cx < lo[0]) lo[0] = cx; if (ax > hi[0]) hi[0] = ax; if (bx > hi[0]) hi[0] = bx; if (cx > hi[0]) hi[0] = cx;
      if (ay < lo[1]) lo[1] = ay; if (by < lo[1]) lo[1] = by; if (cy < lo[1]) lo[1] = cy; if (ay > hi[1]) hi[1] = ay; if (by > hi[1]) hi[1] = by; if (cy > hi[1]) hi[1] = cy;
      if (az < lo[2]) lo[2] = az; if (bz < lo[2]) lo[2] = bz; if (cz < lo[2]) lo[2] = cz; if (az > hi[2]) hi[2] = az; if (bz > hi[2]) hi[2] = bz; if (cz > hi[2]) hi[2] = cz;
    }
  }
  function T(rec, a, b, c, ua, va, ub, vb, uc, vc, ox, oy, oz) {
    const n0 = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), n1 = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), n2 = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (n0 * ox + n1 * oy + n2 * oz >= 0) tri(rec, a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], ua, va, ub, vb, uc, vc);
    else tri(rec, a[0], a[1], a[2], c[0], c[1], c[2], b[0], b[1], b[2], ua, va, uc, vc, ub, vb);
  }
  function Q4(rec, a, b, c, d, ua, va, ub, vb, uc, vc, ud, vd, ox, oy, oz) {
    const n0 = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), n1 = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), n2 = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (n0 * ox + n1 * oy + n2 * oz >= 0) { tri(rec, a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], ua, va, ub, vb, uc, vc); tri(rec, a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2], ua, va, uc, vc, ud, vd); }
    else { tri(rec, a[0], a[1], a[2], d[0], d[1], d[2], c[0], c[1], c[2], ua, va, ud, vd, uc, vc); tri(rec, a[0], a[1], a[2], c[0], c[1], c[2], b[0], b[1], b[2], ua, va, uc, vc, ub, vb); }
  }
  function QA(rec, a, b, c, d, u0, v0, u1, v1, p) {
    const mx = (a[0] + c[0]) / 2 - p[0], my = (a[1] + c[1]) / 2 - p[1], mz = (a[2] + c[2]) / 2 - p[2];
    Q4(rec, a, b, c, d, u0, v0, u1, v0, u1, v1, u0, v1, mx, my, mz);
  }
  const W = {
    tri, T, Q4, QA,
    ashlar: /** @type {number} */ (ASHLAR),
    band(b) { band = b; curKey = -1; return W; },
    get bandNow() { return band; },
    begin() { marks = new Map(); curKey = -1; lo[0] = lo[1] = lo[2] = Infinity; hi[0] = hi[1] = hi[2] = -Infinity; },
    drop() { const m = marks; marks = null; curKey = -1; if (m) for (const [key, v] of m) B.get(key).v = v; },
    commit(law, occ = false) {
      const m = marks;
      marks = null; curKey = -1;
      if (!m) return false;
      if (law && breaks(law, m)) { for (const [key, v] of m) B.get(key).v = v; return false; }
      if (occ) {
        const runs = [];
        for (const [key, v] of m) { const g = B.get(key), n = (g.v - v) / 3; if (n > 0) runs.push([key, v / 3, n]); }
        if (runs.length) pieces.push({ runs, b: [lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]] });
      }
      return true;
    },
    buckets: () => [...B.entries()].filter(([, g]) => g.v > 0).sort((a, b) => a[0] - b[0]).map(([key, g]) => ({ key, ...g })),
    pieces,
    get triangles() { let n = 0; for (const g of B.values()) n += g.v / 3; return n; },
  };
  function breaks(law, m) {
    const F = law.floors.filter((f) => hi[1] > f.top + 1e-3 && f.b[0] <= hi[0] && f.b[2] >= lo[0] && f.b[1] <= hi[2] && f.b[3] >= lo[2]);
    const X = law.boxes.filter((b) => b[0] < hi[0] && b[3] > lo[0] && b[1] < hi[1] && b[4] > lo[1] && b[2] < hi[2] && b[5] > lo[2]);
    const R = law.rings.filter(([cx, cz, r0, r1, y0, y1]) => {
      if (!(y0 < hi[1] && y1 > lo[1])) return false;
      const nx = Math.max(lo[0] - cx, 0, cx - hi[0]), nz = Math.max(lo[2] - cz, 0, cz - hi[2]), fx = Math.max(Math.abs(lo[0] - cx), Math.abs(hi[0] - cx)), fz = Math.max(Math.abs(lo[2] - cz), Math.abs(hi[2] - cz));
      return nx * nx + nz * nz < r1 * r1 && fx * fx + fz * fz > r0 * r0;
    });
    if (!F.length && !X.length && !R.length) return false;
    const C = [];
    for (const f of F) C.push(f.b[0], f.top + 1e-3, f.b[1], f.b[2], Infinity, f.b[3]);
    for (const b of X) C.push(b[0], b[1], b[2], b[3], b[4], b[5]);
    for (const q of R) C.push(q[0] - q[3], q[4], q[1] - q[3], q[0] + q[3], q[5], q[1] + q[3]);
    const nC = C.length;
    const bad = (x, y, z) => {
      for (const f of F) if (y > topOf(f, x, z) + 1e-3 && onFloor(f, x, z)) return true;
      for (const b of X) if (x > b[0] && x < b[3] && y > b[1] && y < b[4] && z > b[2] && z < b[5]) return true;
      for (const [cx, cz, r0, r1, y0, y1] of R) { if (y <= y0 || y >= y1) continue; const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz; if (d2 > r0 * r0 && d2 < r1 * r1) return true; }
      return false;
    };
    for (const [key, v0] of m) {
      const g = B.get(key), P = g.p;
      for (let v = v0; v < g.v; v += 3) {
        const i = v * 3, ax = P[i], ay = P[i + 1], az = P[i + 2], bx = P[i + 3], by = P[i + 4], bz = P[i + 5], cx = P[i + 6], cy = P[i + 7], cz = P[i + 8];
        let tx0 = ax, tx1 = ax, ty0 = ay, ty1 = ay, tz0 = az, tz1 = az;
        if (bx < tx0) tx0 = bx; else if (bx > tx1) tx1 = bx;
        if (cx < tx0) tx0 = cx; else if (cx > tx1) tx1 = cx;
        if (by < ty0) ty0 = by; else if (by > ty1) ty1 = by;
        if (cy < ty0) ty0 = cy; else if (cy > ty1) ty1 = cy;
        if (bz < tz0) tz0 = bz; else if (bz > tz1) tz1 = bz;
        if (cz < tz0) tz0 = cz; else if (cz > tz1) tz1 = cz;
        let near = false;
        for (let c = 0; c < nC; c += 6) if (C[c] <= tx1 && C[c + 3] >= tx0 && C[c + 2] <= tz1 && C[c + 5] >= tz0 && C[c + 1] < ty1 && C[c + 4] > ty0) { near = true; break; }
        if (!near) continue;
        if (bad(ax, ay, az) || bad(bx, by, bz) || bad(cx, cy, cz) || bad((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2) || bad((bx + cx) / 2, (by + cy) / 2, (bz + cz) / 2)
          || bad((ax + cx) / 2, (ay + cy) / 2, (az + cz) / 2) || bad((ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3)) return true;
      }
    }
    return false;
  }

  return W;
}
/** @typedef {ReturnType<typeof ruinWriter>} RuinWriter */

const frame = (x, y, z, yaw = 0, k = 1) => ({ x, y, z, c: Math.cos(yaw), s: Math.sin(yaw), k });
const ID = frame(0, 0, 0);
const at = (f, x, y, z) => [f.x + (x * f.c + z * f.s) * f.k, f.y + y * f.k, f.z + (-x * f.s + z * f.c) * f.k];
const dirOf = (f, x, y, z) => [x * f.c + z * f.s, y, -x * f.s + z * f.c];

function lathe(W, rec, f, cx, cy, cz, prof, sides, { a0 = 0, wraps = 0, vOf = (y) => -y / 2, jit = null } = {}) {
  let rmax = 0;
  for (const p of prof) if (p[0] > rmax) rmax = p[0];
  const U = wraps || Math.max(1, Math.round((TAU * rmax * f.k) / 2)), n = prof.length, grid = new Array((sides + 1) * n), vs = prof.map((p) => vOf(p[1]));
  for (let k = 0; k <= sides; k++) {
    const a = a0 + (k / sides) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    for (let j = 0; j < n; j++) { const r = prof[j][0] * (jit ? jit(k % sides, j) : 1); grid[k * n + j] = at(f, cx + ca * r, cy + prof[j][1], cz + sa * r); }
  }
  for (let k = 0; k < sides; k++) {
    const am = a0 + ((k + 0.5) / sides) * TAU, ca = Math.cos(am), sa = Math.sin(am), u0 = (k / sides) * U, u1 = ((k + 1) / sides) * U;
    for (let j = 0; j + 1 < n; j++) {
      const r0 = prof[j][0], y0 = prof[j][1], r1 = prof[j + 1][0], y1 = prof[j + 1][1];
      if (r0 <= 0 && r1 <= 0) continue;
      const ox = (y1 - y0) * ca, oy = -(r1 - r0), oz = (y1 - y0) * sa, wx = ox * f.c + oz * f.s, wz = -ox * f.s + oz * f.c, v0 = vs[j], v1 = vs[j + 1];
      const A = grid[k * n + j], Bq = grid[(k + 1) * n + j], C = grid[(k + 1) * n + j + 1], D = grid[k * n + j + 1];
      if (r0 <= 0) W.T(rec, A, C, D, (u0 + u1) / 2, v0, u1, v1, u0, v1, wx, oy, wz);
      else if (r1 <= 0) W.T(rec, A, Bq, C, u0, v0, u1, v0, (u0 + u1) / 2, v1, wx, oy, wz);
      else W.Q4(rec, A, Bq, C, D, u0, v0, u1, v0, u1, v1, u0, v1, wx, oy, wz);
    }
  }
}
function beam(W, rec, a, b, w, h, { caps = true, up = null, uS = 0.5, v0 = 0, v1 = 0 } = {}) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
  if (!(len > 1e-6)) return;
  const d = [dx / len, dy / len, dz / len], u = up ?? (Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]);
  let sx = d[1] * u[2] - d[2] * u[1], sy = d[2] * u[0] - d[0] * u[2], sz = d[0] * u[1] - d[1] * u[0];
  const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
  const ux = sy * d[2] - sz * d[1], uy = sz * d[0] - sx * d[2], uz = sx * d[1] - sy * d[0];
  const C = (p, i, j) => [p[0] + sx * i * w / 2 + ux * j * h / 2, p[1] + sy * i * w / 2 + uy * j * h / 2, p[2] + sz * i * w / 2 + uz * j * h / 2];
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const vv = v1 > v0;
  for (let k = 0; k < 4; k++) {
    const [i0, j0] = corners[k], [i1, j1] = corners[(k + 1) % 4], side = (k % 2 ? h : w);
    const A = C(a, i0, j0), Bp = C(a, i1, j1), Cp = C(b, i1, j1), Dp = C(b, i0, j0);
    if (vv) W.QA(rec, A, Bp, Cp, Dp, 0, v0, side * uS, v1, mid); else W.QA(rec, A, Bp, Cp, Dp, 0, 0, side * uS, len * uS, mid);
  }
  if (caps) for (const [p, s] of [[a, -1], [b, 1]]) { const q = corners.map(([i, j]) => C(p, i, j)); W.QA(rec, q[0], q[1], q[2], q[3], 0, 0, w * uS, h * uS, [p[0] - d[0] * s, p[1] - d[1] * s, p[2] - d[2] * s]); }
}
function tube(W, rec, a, b, r0, r1, sides, { v0 = 0, vS = 0.5, v1 = null, caps = true } = {}) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
  if (!(len > 1e-6)) return;
  const d = [dx / len, dy / len, dz / len], u = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let sx = d[1] * u[2] - d[2] * u[1], sy = d[2] * u[0] - d[0] * u[2], sz = d[0] * u[1] - d[1] * u[0];
  const sl = Math.hypot(sx, sy, sz); sx /= sl; sy /= sl; sz /= sl;
  const tx = sy * d[2] - sz * d[1], ty = sz * d[0] - sx * d[2], tz = sx * d[1] - sy * d[0];
  const R = (p, r, k) => { const t = (k / sides) * TAU, c = Math.cos(t) * r, q = Math.sin(t) * r; return [p[0] + sx * c + tx * q, p[1] + sy * c + ty * q, p[2] + sz * c + tz * q]; };
  for (let k = 0; k < sides; k++) {
    const t = ((k + 0.5) / sides) * TAU, o = [sx * Math.cos(t) + tx * Math.sin(t), sy * Math.cos(t) + ty * Math.sin(t), sz * Math.cos(t) + tz * Math.sin(t)];
    const ve = v1 ?? v0 + len * vS;
    W.Q4(rec, R(a, r0, k), R(a, r0, k + 1), R(b, r1, k + 1), R(b, r1, k), k / sides, v0, (k + 1) / sides, v0, (k + 1) / sides, ve, k / sides, ve, o[0], o[1], o[2]);
    if (caps) { W.T(rec, a, R(a, r0, k), R(a, r0, k + 1), 0.5, v0, 0, v0, 1, v0, -d[0], -d[1], -d[2]); W.T(rec, b, R(b, r1, k), R(b, r1, k + 1), 0.5, v0, 0, v0, 1, v0, d[0], d[1], d[2]); }
  }
}
/**
 * @param {any} W
 * @param {number} rec
 * @param {any} f
 * @param {number} x0
 * @param {number} y0
 * @param {number} z0
 * @param {number} x1
 * @param {number} y1
 * @param {number} z1
 * @param {{ skip?: string, uS?: number, v?: string | number[] }} [o]
 */
function fbox(W, rec, f, x0, y0, z0, x1, y1, z1, { skip = '', uS = 0.5, v = 'down' } = {}) {
  const P = (x, y, z) => at(f, x, y, z), c = at(f, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), k = f.k;
  const wy0 = f.y + y0 * k, wy1 = f.y + y1 * k;
  const [vt, vb] = Array.isArray(v) ? v : v === 'up' ? [wy1 * uS, wy0 * uS] : [0, (y1 - y0) * k * uS];
  /** @type {Array<[string, number[][], number]>} */
  const sides = [
    ['nz', [P(x0, y1, z0), P(x1, y1, z0), P(x1, y0, z0), P(x0, y0, z0)], x1 - x0],
    ['pz', [P(x0, y1, z1), P(x1, y1, z1), P(x1, y0, z1), P(x0, y0, z1)], x1 - x0],
    ['nx', [P(x0, y1, z0), P(x0, y1, z1), P(x0, y0, z1), P(x0, y0, z0)], z1 - z0],
    ['px', [P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1), P(x1, y0, z0)], z1 - z0],
  ];
  for (const [name, q, w] of sides) if (!skip.includes(name)) W.QA(rec, q[0], q[1], q[2], q[3], 0, vt, w * uS * k, vb, c);
  const planar = Array.isArray(v) ? [v[0], v[0] + (v[1] - v[0]) * 0.5] : null;
  for (const [name, y] of /** @type {Array<[string, number]>} */ ([['top', y1], ['bottom', y0]])) {
    if (skip.includes(name)) continue;
    const q = [P(x0, y, z0), P(x1, y, z0), P(x1, y, z1), P(x0, y, z1)];
    if (planar) W.QA(rec, q[0], q[1], q[2], q[3], 0, planar[0], (x1 - x0) * uS * k, planar[1], c);
    else W.QA(rec, q[0], q[1], q[2], q[3], 0, 0, (x1 - x0) * uS * k, (z1 - z0) * uS * k, c);
  }
}
function gem(W, rec, f, x, y, z, r, tall = 1.6) {
  const c = at(f, x, y, z), top = at(f, x, y + r * tall, z), bot = at(f, x, y - r * tall, z);
  const rim = [0, 1, 2, 3].map((k) => at(f, x + Math.cos((k / 4) * TAU) * r, y, z + Math.sin((k / 4) * TAU) * r));
  for (let k = 0; k < 4; k++) {
    const a = rim[k], b = rim[(k + 1) % 4];
    for (const t of [top, bot]) { const m = [(a[0] + b[0] + t[0]) / 3 - c[0], (a[1] + b[1] + t[1]) / 3 - c[1], (a[2] + b[2] + t[2]) / 3 - c[2]]; W.T(rec, a, b, t, 0, 0.5, 0.5, 0.5, 0.25, t === top ? 0 : 1, m[0], m[1], m[2]); }
  }
}
function chain(W, a, n, link = 0.32) {
  const w = link * 0.58, th = link * 0.13, pitch = link - 2 * th, ho = w / 2, vo = link / 2;
  for (let i = 0; i < n; i++) {
    const cy = a[1] - th - i * pitch - link / 2, e = i % 2 ? [0, 0, 1] : [1, 0, 0], nrm = i % 2 ? [1, 0, 0] : [0, 0, 1];
    const P = (s, y, d) => [a[0] + e[0] * s + nrm[0] * d, cy + y, a[2] + e[2] * s + nrm[2] * d];
    const out = [[-ho, -vo], [ho, -vo], [ho, vo], [-ho, vo]], inn = [[-ho + th, -vo + th], [ho - th, -vo + th], [ho - th, vo - th], [-ho + th, vo - th]], hd = th / 2;
    for (let k = 0; k < 4; k++) {
      const k1 = (k + 1) % 4, o0 = out[k], o1 = out[k1], i0 = inn[k], i1 = inn[k1];
      for (const d of [-hd, hd]) { const nd = [nrm[0] * d, 0, nrm[2] * d]; W.Q4(K.chain, P(o0[0], o0[1], d), P(o1[0], o1[1], d), P(i1[0], i1[1], d), P(i0[0], i0[1], d), 0, CHB.faces[0], 1, CHB.faces[0], 1, CHB.faces[1], 0, CHB.faces[1], nd[0], nd[1], nd[2]); }
      const mo = [e[0] * (o0[0] + o1[0]) / 2, (o0[1] + o1[1]) / 2, e[2] * (o0[0] + o1[0]) / 2];
      W.Q4(K.chain, P(o0[0], o0[1], -hd), P(o1[0], o1[1], -hd), P(o1[0], o1[1], hd), P(o0[0], o0[1], hd), 0, CHB.outer[0], 1, CHB.outer[0], 1, CHB.outer[1], 0, CHB.outer[1], mo[0], mo[1], mo[2]);
      W.Q4(K.chain, P(i0[0], i0[1], -hd), P(i1[0], i1[1], -hd), P(i1[0], i1[1], hd), P(i0[0], i0[1], hd), 0, CHB.inner[0], 1, CHB.inner[0], 1, CHB.inner[1], 0, CHB.inner[1], -mo[0], -mo[1], -mo[2]);
    }
  }
  return a[1] - n * pitch - 2 * th;
}

function corniceRun(W, rec, path, P, { closed = false, ends = true } = {}) {
  const G = EG_RUIN_CORNICE.gap, U = EG_RUIN_CORNICE.under, n = path.length, segs = closed ? n : n - 1, prof = P.pts;
  const vA = [], vB = [];
  for (let j = 0; j + 1 < prof.length;) {
    let e = j;
    while (e + 1 < prof.length - 1 && P.bands[e + 1] === P.bands[j]) e++;
    const band = MB[P.bands[j]], seg = [];
    let tot = 0;
    for (let q = j; q <= e; q++) { const l = Math.hypot(prof[q + 1][0] - prof[q][0], prof[q + 1][1] - prof[q][1]); seg.push(l); tot += l; }
    let acc = 0;
    for (let q = j; q <= e; q++) { vA[q] = lerp(band[0], band[1], acc / tot); acc += seg[q - j]; vB[q] = lerp(band[0], band[1], acc / tot); }
    j = e + 1;
  }
  let reach = 0, mm = 1;
  for (const q of prof) reach = Math.max(reach, q[0]);
  for (const q of path) mm = Math.max(mm, q.m);
  const sc = Math.min(1, (EG_RUIN_CORNICE.reach / mm - G - 1e-3) / reach);
  const pt = (p, j) => { const o = (G + prof[j][0] * sc) * p.m; return [p.x + p.nx * o, p.y - U + prof[j][1], p.z + p.nz * o]; };
  const grid = path.map((p) => prof.map((_, j) => pt(p, j)));
  let along = 0;
  for (let s = 0; s < segs; s++) {
    const A = path[s], Bq = path[(s + 1) % n], L = Math.hypot(Bq.x - A.x, Bq.z - A.z), nx = (A.nx + Bq.nx) / 2, nz = (A.nz + Bq.nz) / 2;
    for (let j = 0; j + 1 < prof.length; j++) {
      const du = prof[j + 1][0] - prof[j][0], dv = prof[j + 1][1] - prof[j][1];
      const o = [-dv * nx, du, -dv * nz];
      const GA = grid[s], GB = grid[(s + 1) % n];
      W.Q4(rec, GA[j], GB[j], GB[j + 1], GA[j + 1], along / 2, vA[j], (along + L) / 2, vA[j], (along + L) / 2, vB[j], along / 2, vB[j], o[0], o[1], o[2]);
    }
    along += L;
  }
  if (closed || !ends) return;
  for (const [p, q] of [[path[0], path[1]], [path[n - 1], path[n - 2]]]) {
    const tx = p.x - q.x, tz = p.z - q.z;
    for (let j = 0; j + 1 < prof.length; j++) {
      if (Math.abs(prof[j + 1][1] - prof[j][1]) < 1e-6) continue;
      const a = pt(p, j), b = pt(p, j + 1), back = (y) => [p.x + p.nx * G * p.m, y, p.z + p.nz * G * p.m];
      W.Q4(rec, a, b, back(b[1]), back(a[1]), prof[j][0] / 2, vA[j], prof[j + 1][0] / 2, vB[j], 0, vB[j], 0, vA[j], tx, 0, tz);
    }
  }
}
function corniceSpikes(W, path, closed) {
  const n = path.length, segs = closed ? n : n - 1, G = EG_RUIN_CORNICE.gap;
  let carry = 0.6;
  for (let s = 0; s < segs; s++) {
    const A = path[s], Bq = path[(s + 1) % n], L = Math.hypot(Bq.x - A.x, Bq.z - A.z);
    for (let t = carry; t < L; t += 1.2) {
      const k = t / L, x = lerp(A.x, Bq.x, k), z = lerp(A.z, Bq.z, k), y = lerp(A.y, Bq.y, k) - EG_RUIN_CORNICE.under - 0.55, nx = lerp(A.nx, Bq.nx, k), nz = lerp(A.nz, Bq.nz, k), o = (G + 0.26) * A.m;
      const c = [x + nx * o, y, z + nz * o], tip = [c[0], y - 0.32, c[2]], q = [[0.07, 0], [0, 0.07], [-0.07, 0], [0, -0.07]].map(([a, b]) => [c[0] + a, y, c[2] + b]);
      for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4], m = [(a[0] + b[0]) / 2 - c[0], -0.1, (a[2] + b[2]) / 2 - c[2]]; W.T(K.fixture, a, b, tip, 0, 0.3, 0.1, 0.3, 0.05, 0.9, m[0], m[1], m[2]); }
      carry = t + 1.2 - L;
    }
    if (carry >= L) carry -= L;
  }
}
const rimSides = (r) => (r <= 3.5 ? SD_ISLAND_SIDES / 3 : r < 7 ? SD_ISLAND_SIDES / 2 : SD_ISLAND_SIDES);
function rimPath(d) {
  const N = rimSides(d.r), m = 1 / Math.cos(Math.PI / N), out = [];
  for (let k = 0; k < N; k++) { const a = (k / N) * TAU; out.push({ x: d.x + Math.cos(a) * d.r, y: d.y ?? 0, z: d.z + Math.sin(a) * d.r, nx: Math.cos(a), nz: Math.sin(a), m, a }); }
  return out;
}

function foundation(W, piece, d, band, seed, lite) {
  const F = formOf(band), style = egKitStyle(band), y0 = (d.y ?? 0) - SD_LIP, N = rimSides(d.r), rec = K.found;
  const big = d.r >= 10, nC = Math.max(1, Math.min(lite ? 2 : F.course.n, Math.floor((d.r * 0.42) / F.course.step))), FV = EG_FOUND_V;
  const perOf = (rows, h, r) => Math.max(1, Math.round((TAU * r) / ((EG_KIT_MAP[K.found].w * h) / rows)));
  const ringAt = (r, y, jitR = 0, jitY = 0, key = 0) => {
    const out = [];
    for (let k = 0; k < N; k++) {
      const a = (k / N) * TAU, jr = jitR ? 1 + jitR * (2 * h01(seed, key, k) - 1) : 1, jy = jitY ? jitY * (2 * h01(seed, key + 50, k) - 1) : 0;
      out.push([d.x + Math.cos(a) * r * jr, y + jy, d.z + Math.sin(a) * r * jr]);
    }
    return out;
  };
  const centre = (y) => [d.x, y, d.z];
  const wall = (A, B, va, vb, mid, per) => { for (let k = 0; k < N; k++) { const k1 = (k + 1) % N; W.QA(rec, A[k], A[k1], B[k1], B[k], (k / N) * per, va, ((k + 1) / N) * per, vb, mid); } };
  let r = d.r - 0.002, y = y0, Bk = null, rFoot = 0;
  const skirt = (big ? 2.2 : 1.4) + 0.6 * h01(seed, 12), H = EG_KIT_MAP[K.found].h;
  piece(() => {
    const A = ringAt(r, y);
    Bk = ringAt(r, y - EG_RUIN.slab);
    wall(A, Bk, FV.slab[0], FV.slab[1], centre(y - 0.3), perOf((FV.slab[1] - FV.slab[0]) * H, EG_RUIN.slab, r));
    y -= EG_RUIN.slab;
    for (let c = 0; c < nC; c++) {
      const r1 = r - F.course.step * (0.85 + 0.3 * h01(seed, 11, c)), j = c < 2 ? 0 : 0.02 * c, per = perOf(8, F.course.h, r1);
      const cv0 = FV.course[0] + Math.min(c, 4) * FV.row, cv1 = Math.min(FV.course[1], cv0 + FV.row), lv = c ? cv0 - 2 / H : FV.slab[1] - 1 / H;
      const top = ringAt(r1, y, j, 0, 100 + c), bottom = ringAt(r1, y - F.course.h, j * 1.5, c >= nC - 1 ? 0.12 : 0, 200 + c);
      for (let k = 0; k < N; k++) { const k1 = (k + 1) % N; W.Q4(rec, Bk[k], Bk[k1], top[k1], top[k], (k / N) * per, lv, ((k + 1) / N) * per, lv, ((k + 1) / N) * per, lv + 1.5 / H, (k / N) * per, lv + 1.5 / H, 0, -1, 0); }
      wall(top, bottom, cv0, cv1, centre(y - F.course.h / 2), per);
      Bk = bottom; r = r1; y -= F.course.h;
    }
    rFoot = r * 0.9;
    const foot = ringAt(rFoot, y - skirt, 0.06, 0.45, 300), per = perOf((FV.rubble[1] - FV.rubble[0]) * H, skirt, r);
    for (let k = 0; k < N; k++) {
      const k1 = (k + 1) % N;
      W.QA(rec, Bk[k], Bk[k1], foot[k1], foot[k], (k / N) * per, FV.rubble[0], ((k + 1) / N) * per, FV.rubble[1], centre(y - skirt / 2));
      W.T(rec, centre(y - skirt + 0.02), foot[k], foot[k1], 0.5, FV.rubble[1], (k / N) * per, FV.rubble[1], ((k + 1) / N) * per, FV.rubble[1], 0, -1, 0);
    }
  });
  if (!rFoot) return;
  const yF = y - skirt;
  const n = lite ? 1 : clamp(Math.round(d.r / 4) + 2, 3, 6);
  const plan = hangPlan({ x: d.x, z: d.z, y: yF - SD_HANG.top + SD_HANG.skirt, r: rFoot / SD_HANG.foot, seed: (seed ^ 0x51ee) >>> 0, spires: n, chains: 0, gears: 0 }, { lite });
  const L0 = plan.L0 * F.spire.len, vOf = F.spire.rec === K.crystal ? (yy) => yy / 2 : (yy) => lerp(FV.deep[0], FV.deep[1], clamp((yF - yy) / L0, 0, 1));
  const S = d.r <= 3.5 ? { ...F.spire, rings: Math.max(4, F.spire.rings - 2) } : F.spire;
  plan.spires.forEach((s, j) => piece(() => spire(W, S, { ...s, len: s.len * F.spire.len }, yF, seed, j, vOf)));
  const sats = lite || d.r <= 3.5 ? 0 : Math.round(F.spire.sats * Math.min(2, d.r / 8));
  for (let j = 0; j < sats; j++) {
    const a = h01(seed, 13, j) * TAU, rr = rFoot * (0.45 + 0.42 * h01(seed, 14, j)), R = Math.max(0.35, rFoot * (0.06 + 0.07 * h01(seed, 15, j)));
    piece(() => spire(W, F.spire, { x: d.x + Math.cos(a) * rr, z: d.z + Math.sin(a) * rr, R, len: L0 * (0.2 + 0.35 * h01(seed, 16, j)), bendA: a, bend: 0 }, yF, seed, 40 + j, vOf));
  }
  if (!lite && (d.role === 'court' || d.role === 'isle')) hanging(W, piece, style.hanging, d, yF, rFoot, plan, seed);
}
function spire(W, S, s, foot, seed, j, vOf) {
  const rec = S.rec, R = S.rings, n = S.sides, rings = [], metric = rec !== K.found;
  const U = metric ? Math.max(1, Math.round((TAU * s.R) / 2)) : Math.max(1, Math.round((TAU * s.R * 2) / Math.max(2, s.len * 1.4)));
  for (let i = 0; i < R; i++) {
    const t = i / (R - 1), b = (s.bend || S.bend * s.len) * t * t, cx = s.x + Math.cos(s.bendA) * b, cz = s.z + Math.sin(s.bendA) * b;
    const y = foot + 0.05 - s.len * t, rr = s.R * (1 - (1 - S.tip) * Math.pow(t, 1.1)), tw = S.twist * i;
    const ring = [], step = i > 0 && i < R - 1 ? 1 + S.step * (0.6 + 0.8 * h01(seed, j, 80 + i)) : 1;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + j + tw, r = rr * (1 + S.jitter * (2 * h01(seed, j, i, k) - 1));
      const dy = i === R - 1 && S.tip < 0.5 ? rr * 1.2 * (h01(seed, j, 50 + i, k) - 0.5) : 0;
      ring.push([cx + Math.cos(a) * r, y + dy, cz + Math.sin(a) * r]);
    }
    rings.push({ cx, cz, y, ring, outer: ring.map((p) => [cx + (p[0] - cx) * step, p[1], cz + (p[2] - cz) * step]) });
  }
  for (let i = 0; i + 1 < R; i++) {
    const A = rings[i], Bq = rings[i + 1], mid = [(A.cx + Bq.cx) / 2, (A.y + Bq.y) / 2, (A.cz + Bq.cz) / 2], ledge = i + 1 < R - 1 && S.step > 0;
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n, u0 = (k / n) * U, u1 = ((k + 1) / n) * U;
      W.QA(rec, A.ring[k], A.ring[k1], Bq.outer[k1], Bq.outer[k], u0, vOf(A.y), u1, vOf(Bq.y), mid);
      if (ledge) W.Q4(rec, Bq.outer[k], Bq.outer[k1], Bq.ring[k1], Bq.ring[k], u0, vOf(Bq.y), u1, vOf(Bq.y), u1, vOf(Bq.y), u0, vOf(Bq.y), 0, -1, 0);
    }
  }
  const last = rings[R - 1], flat = S.tip >= 0.5;
  const tip = flat ? [last.cx, last.y - 0.02, last.cz] : [last.cx + s.R * S.tip * 0.4, last.y - Math.max(0.6, s.R * (0.6 + 1.2 * S.tip)), last.cz];
  const hv = metric ? vOf(last.y) : Math.max(EG_FOUND_V.haze, vOf(last.y)), tv = metric ? vOf(tip[1]) : 0.98;
  for (let k = 0; k < n; k++) W.T(rec, last.ring[k], last.ring[(k + 1) % n], tip, (k / n) * U, hv, ((k + 1) / n) * U, hv, ((k + 0.5) / n) * U, tv, 0, -1, 0);
}
function hanging(W, piece, kind, d, yF, rF, plan, seed) {
  const outer = plan.spires.slice(1), n = kind === 'chandelier' ? 1 : kind === 'cage' ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const a = (outer.length ? Math.atan2(outer[i % outer.length].z - d.z, outer[i % outer.length].x - d.x) + Math.PI / Math.max(2, outer.length) : 0) + i * 2.1 + 0.4 * h01(seed, 60, i);
    const rr = rF * (0.62 + 0.18 * h01(seed, 61, i)), x = d.x + Math.cos(a) * rr, z = d.z + Math.sin(a) * rr, top = [x, yF + 0.1, z];
    piece(() => hangOne(W, kind, a, x, z, top, yF, rF, seed, i));
  }
}
function hangOne(W, kind, a, x, z, top, yF, rF, seed, i) {
  {
    if (kind === 'chandelier') {
      const R = clamp(rF * 0.12, 1.2, 2.4), drop = 4 + 3 * h01(seed, 62, i), hub = [x, yF - drop, z];
      for (let k = 0; k < 3; k++) { const b = (k / 3) * TAU; beam(W, K.fixture, [x + Math.cos(b) * R * 0.7, yF + 0.1, z + Math.sin(b) * R * 0.7], hub, 0.07, 0.07, { caps: false, v0: EG_FIXTURE_V.body[0], v1: EG_FIXTURE_V.body[1] }); }
      beam(W, K.fixture, [x, yF + 0.1, z], [x, hub[1] - 1.6, z], 0.12, 0.12, { v0: EG_FIXTURE_V.body[0], v1: EG_FIXTURE_V.body[1] });
      for (const [rr2, dy] of [[R, -0.9], [R * 0.6, -1.5]]) {
        const pts = Array.from({ length: 12 }, (_, k) => [x + Math.cos((k / 12) * TAU) * rr2, hub[1] + dy, z + Math.sin((k / 12) * TAU) * rr2]);
        for (let k = 0; k < 12; k++) beam(W, K.fixture, pts[k], pts[(k + 1) % 12], 0.09, 0.07, { caps: false, v0: EG_FIXTURE_V.body[0], v1: EG_FIXTURE_V.body[1] });
        for (let k = 0; k < 12; k += 2) { beam(W, K.fixture, [x, hub[1], z], pts[k], 0.05, 0.05, { caps: false, v0: EG_FIXTURE_V.body[0], v1: EG_FIXTURE_V.body[1] }); lathe(W, K.fixture, ID, pts[k][0], pts[k][1], pts[k][2], [[0, 0], [0.05, 0.02], [0.11, 0.16], [0.09, 0.17], [0, 0.1]], 5, { vOf: (y) => lerp(EG_FIXTURE_V.body[0], EG_FIXTURE_V.body[1], y / 0.17) }); }
      }
    } else if (kind === 'cage') {
      const end = chain(W, top, 3 + Math.floor(3 * h01(seed, 63, i)), 0.4), cy = end - 0.85, R = 0.42;
      const bv = (h) => (y) => lerp(EG_FIXTURE_V.body[0], EG_FIXTURE_V.body[1], y / h);
      grille(W, frame(x, cy - 0.75, z), [[R, 0], [R, 1.5]], 6);
      lathe(W, K.fixture, ID, x, cy + 0.75, z, [[R + 0.04, 0], [R + 0.04, 0.06], [0.08, 0.32], [0, 0.34]], 6, { vOf: bv(0.34) });
      lathe(W, K.fixture, ID, x, cy - 0.81, z, [[0, 0], [R + 0.04, 0], [R + 0.04, 0.06], [0, 0.06]], 6, { vOf: bv(0.06) });
      beam(W, K.fixture, [x, cy + 1.09, z], [x, end + 0.02, z], 0.05, 0.05, { caps: false, v0: EG_FIXTURE_V.body[0], v1: EG_FIXTURE_V.body[1] });
      gem(W, K.crystal, ID, x, cy, z, 0.24, 1.8);
    } else if (kind === 'shards') {
      const R = 0.5 + 0.5 * h01(seed, 64, i);
      spire(W, { sides: 4, rings: 3, jitter: 0.12, bend: 0, tip: 0.02, step: 0, twist: 0.4, rec: K.crystal }, { x, z, R, len: 7 + 6 * h01(seed, 65, i), bendA: a, bend: 0.4 }, yF + 0.3, seed, 90 + i, (yy) => yy / 2);
    } else {
      const L = clamp(rF * 0.9, 3, 9), b = a + Math.PI / 2, p0 = [x - Math.cos(b) * L, yF - 1.5, z - Math.sin(b) * L], p1 = [x, yF - 2.4 - 1.5 * h01(seed, 66, i), z], p2 = [x + Math.cos(b) * L * 0.8, yF - 0.6 - 2.5 * h01(seed, 67, i), z + Math.sin(b) * L * 0.8];
      for (const [p, q] of [[p0, p1], [p1, p2]]) { beam(W, K.fixture, p, q, 0.36, 0.08, { v0: EG_FIXTURE_V.body[0], v1: EG_FIXTURE_V.body[1] }); beam(W, K.fixture, [p[0], p[1] - 0.25, p[2]], [q[0], q[1] - 0.25, q[2]], 0.1, 0.42, { caps: false, v0: EG_FIXTURE_V.body[0], v1: EG_FIXTURE_V.body[1] }); beam(W, K.fixture, [p[0], p[1] - 0.5, p[2]], [q[0], q[1] - 0.5, q[2]], 0.36, 0.08, { v0: EG_FIXTURE_V.body[0], v1: EG_FIXTURE_V.body[1] }); }
      chain(W, [p2[0], p2[1] - 0.55, p2[2]], 4 + Math.floor(4 * h01(seed, 68, i)), 0.45);
    }
  }
}

export function egArchRise(style, w) {
  if (style === 'round') return w / 2;
  if (style === 'squat') return w / 4;
  const R = (style === 'lancet' ? 1.3 : 1) * w;
  return Math.sqrt(R * R - (R - w / 2) ** 2);
}
function archAt(style, w, t) {
  const hw = w / 2;
  if (style === 'round') { const a = Math.PI * (1 - t); return [Math.cos(a) * hw, Math.sin(a) * hw, Math.cos(a), Math.sin(a)]; }
  if (style === 'squat') {
    const rise = w / 4, R = (hw * hw + rise * rise) / (2 * rise), c = rise - R, a = lerp(Math.atan2(-c, -hw), Math.atan2(-c, hw), t);
    return [Math.cos(a) * R, c + Math.sin(a) * R, Math.cos(a), Math.sin(a)];
  }
  const R = (style === 'lancet' ? 1.3 : 1) * w, off = R - hw;
  if (t <= 0.5) { const a = lerp(Math.PI, Math.acos(-off / R), t * 2); return [off + Math.cos(a) * R, Math.sin(a) * R, Math.cos(a), Math.sin(a)]; }
  const a = lerp(Math.acos(off / R), 0, (t - 0.5) * 2);
  return [-off + Math.cos(a) * R, Math.sin(a) * R, Math.cos(a), Math.sin(a)];
}
function archRing(W, f, style, w, ys, th, ring, blocks, fill) {
  const pts = [];
  for (let k = 0; k <= blocks; k++) { const [s, h, ns, nh] = archAt(style, w, k / blocks); pts.push([s, ys + h, ns, nh]); }
  const P = (s, y, t) => at(f, s, y, t), rv = ring / 2;
  let ua = 0;
  for (let k = 0; k < blocks; k++) {
    const [as, ah, an, anh] = pts[k], [bs, bh, bn, bnh] = pts[k + 1], ub = ua + Math.hypot(bs - as, bh - ah) / 2;
    const ea = [as + an * ring, ah + anh * ring], eb = [bs + bn * ring, bh + bnh * ring];
    for (const t of [-th / 2, th / 2]) { const o = dirOf(f, 0, 0, t); W.Q4(K.voussoir, P(as, ah, t), P(bs, bh, t), P(eb[0], eb[1], t), P(ea[0], ea[1], t), ua, 0, ub, 0, ub, rv, ua, rv, o[0], o[1], o[2]); }
    const si = dirOf(f, -(an + bn), -(anh + bnh), 0);
    W.Q4(K.voussoir, P(as, ah, -th / 2), P(bs, bh, -th / 2), P(bs, bh, th / 2), P(as, ah, th / 2), ua, 0, ub, 0, ub, Math.min(0.5, th / 4), ua, Math.min(0.5, th / 4), si[0], si[1], si[2]);
    if (fill != null) {
      for (const t of [-th / 2, th / 2]) { const o = dirOf(f, 0, 0, t); W.Q4(W.ashlar, P(ea[0], ea[1], t), P(eb[0], eb[1], t), P(eb[0], fill, t), P(ea[0], fill, t), ea[0] / 2, ea[1] / 2, eb[0] / 2, eb[1] / 2, eb[0] / 2, fill / 2, ea[0] / 2, fill / 2, o[0], o[1], o[2]); }
    } else {
      const ob = dirOf(f, an + bn, anh + bnh, 0);
      W.Q4(K.voussoir, P(ea[0], ea[1], -th / 2), P(eb[0], eb[1], -th / 2), P(eb[0], eb[1], th / 2), P(ea[0], ea[1], th / 2), ua, rv, ub, rv, ub, rv + th / 4, ua, rv + th / 4, ob[0], ob[1], ob[2]);
    }
    ua = ub;
  }
}
function pier(W, f, s0, s1, th, yTop, yFoot, seed, key) {
  const P = (s, y, t) => at(f, s, y, t), c = at(f, (s0 + s1) / 2, (yTop + yFoot) / 2, 0);
  const q = [[s0, -th / 2], [s1, -th / 2], [s1, th / 2], [s0, th / 2]], feet = q.map((_, k) => yFoot + 2.5 * h01(seed, key, k));
  for (let k = 0; k < 4; k++) {
    const [a0, b0] = q[k], [a1, b1] = q[(k + 1) % 4], k1 = (k + 1) % 4, len = Math.hypot(a1 - a0, b1 - b0);
    W.QA(W.ashlar, P(a0, yTop, b0), P(a1, yTop, b1), P(a1, feet[k1], b1), P(a0, feet[k], b0), 0, yTop / 2, len / 2, Math.min(feet[k], feet[k1]) / 2, c);
  }
  const tip = P((s0 + s1) / 2 + 0.2 * (h01(seed, key, 9) - 0.5), yFoot - 2.5 - 2 * h01(seed, key, 8), 0.1);
  for (let k = 0; k < 4; k++) {
    const [a0, b0] = q[k], [a1, b1] = q[(k + 1) % 4], A = P(a0, feet[k], b0), Bq = P(a1, feet[(k + 1) % 4], b1), m = [(A[0] + Bq[0]) / 2 - c[0], -0.5, (A[2] + Bq[2]) / 2 - c[2]];
    W.T(K.found, A, Bq, tip, 0, EG_FOUND_V.deep[0], 0.5, EG_FOUND_V.deep[0], 0.25, EG_FOUND_V.haze, m[0], m[1], m[2]);
  }
}
const alongFrame = (x, y, z, ux, uz) => ({ x, y, z, c: ux, s: -uz, k: 1 });
function bridge(W, piece, band, seed, run, lite, law = null) {
  if (law) { for (const r of bridgeRuns(law, run)) bridge(W, piece, band, seed, r, lite); return; }
  const { ax, az, bx, bz, hw, yd } = run, L = Math.hypot(bx - ax, bz - az);
  if (L < 2) return;
  const ux = (bx - ax) / L, uz = (bz - az) / L, style = egKitStyle(band).arch, th = 2 * hw - 0.1;
  const nb = Math.max(1, Math.round(L / (lite ? EG_RUIN.bayLite : lerp(EG_RUIN.bay[0], EG_RUIN.bay[1], h01(seed, 70))))), bay = L / nb;
  const pw = Math.min(1.1, bay * 0.16), fall = lerp(EG_RUIN.fall[0], EG_RUIN.fall[1], h01(seed, 71));
  const pt = (s) => [ax + ux * s, az + uz * s];
  for (let i = 0; i < nb; i++) {
    const s0 = i * bay, s1 = (i + 1) * bay, span = bay - pw, rise = egArchRise(style, span);
    const ys = yd - 0.25 - rise - 0.45, [mx, mz] = pt((s0 + s1) / 2);
    piece(() => {
      archRing(W, alongFrame(mx, 0, mz, ux, uz), style, span, ys, th, 0.45, style === 'squat' ? 7 : 11, yd);
      for (const ps of i === 0 ? [s0, s1] : [s1]) {
        const [px, pz] = pt(ps);
        pier(W, alongFrame(px, 0, pz, ux, uz), -pw / 2, pw / 2, th + 0.1, yd, ys - fall * (0.8 + 0.4 * h01(seed, 72, i)), seed, 700 + i * 7 + (ps === s0 ? 1 : 0));
      }
    });
  }
}
function bridgeRuns(law, run) {
  const { ax, az, bx, bz, hw, yd } = run, L = Math.hypot(bx - ax, bz - az), top = run.top ?? yd;
  if (!(L >= 2)) return [];
  const ux = (bx - ax) / L, uz = (bz - az) / L, n = Math.max(2, Math.ceil(L / 0.25)), w = hw + 0.15, PAD = 0.7, out = [];
  const boxes = law.boxes.filter((b) => b[1] < top - 1e-3 && b[4] > yd - EG_RUIN.fall[1] - 4);
  const discs = law.rings.filter((q) => q[2] === 0 && q[4] < top - 1e-3 && q[5] > yd - EG_RUIN.fall[1] - 4);
  if (!boxes.length && !discs.length) return [run];
  const ok = [];
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * L, x = ax + ux * s, z = az + uz * s, ex = Math.abs(uz) * w + Math.abs(ux) * PAD, ez = Math.abs(ux) * w + Math.abs(uz) * PAD;
    ok.push(!boxes.some((b) => x + ex > b[0] && x - ex < b[3] && z + ez > b[2] && z - ez < b[5]) && !discs.some((q) => Math.hypot(x - q[0], z - q[1]) < q[3] + w + PAD));
  }
  if (ok.every(Boolean)) return [run];
  for (let i = 0; i <= n;) {
    if (!ok[i]) { i++; continue; }
    let j = i;
    while (j + 1 <= n && ok[j + 1]) j++;
    const s0 = (i / n) * L, s1 = (j / n) * L;
    if (s1 - s0 >= 2) out.push({ ...run, ax: ax + ux * s0, az: az + uz * s0, bx: ax + ux * s1, bz: az + uz * s1 });
    i = j + 1;
  }
  return out;
}

const RING_ROLES = Object.freeze(['court', 'isle', 'arrive', 'end', 'bastion']);
export const egDiscLamps = (d) => (d.role === 'court' || d.role === 'isle' ? 6 : d.role === 'arrive' || d.role === 'end' ? 2 : d.role === 'bastion' || d.role === 'balcony' || d.role === 'perch' ? 1 : 0);
const FIXTURE_R = Object.freeze({ tripod: 0.5, lantern: 0.36, moonlamp: 0.26, basket: 0.47 });
function ringOf(spec, d, band) {
  const rad0 = formOf(band).col.r;
  let R = d.r + EG_RUIN.ring, gap = null;
  for (const q of spec.deco ?? []) {
    if ((q.t !== 'wall' && q.t !== 'tiers') || Math.hypot(q.x - d.x, q.z - d.z) > 0.5 || q.r <= d.r) continue;
    if (q.r - d.r >= EG_RUIN.ring + 2 * rad0 + 1.2) continue;
    const room = q.r - 0.4 - d.r;
    gap = { R: d.r + room / 2, rad: clamp(room / 2 - 0.3, 0.16, 0.3), room };
    R = (q.t === 'wall' ? q.r + 1.3 : q.r + 3.9) + rad0 + 0.8;
  }
  return { R, rad: rad0, gap };
}
function flameAt(kind, x, z, top, cx, cz, rDisc, k) {
  const y = top + 0.05 + EG_FIXTURE_FLAME[kind] * k;
  if (kind !== 'lantern') return [x, y, z];
  const d = Math.hypot(x - cx, z - cz) || 1, room = d - rDisc - 0.45 - FIXTURE_R.lantern * k;
  if (room >= GALLOWS * k) return [x + ((cx - x) / d) * GALLOWS * k, y, z + ((cz - z) / d) * GALLOWS * k];
  return [x - ((z - cz) / d) * GALLOWS * k, y, z + ((x - cx) / d) * GALLOWS * k];
}
const _plans = new Map();
/**
 * @param {any} spec
 * @param {{ lite?: boolean }} [o]
 */
export function egRuinColumns(spec, { lite = false } = {}) {
  const key = `${spec.seed >>> 0}:${spec.h}:${spec.geo ?? 0}:${spec.laid ?? 0}:${spec.v ?? 0}:${lite ? 1 : 0}`;
  const had = _plans.get(key);
  if (had && had.spec === spec) return had.plan;
  const plan = planRings(spec, lite);
  if (_plans.size >= 64) _plans.delete(_plans.keys().next().value);
  _plans.set(key, { spec, plan });
  return plan;
}
function planRings(spec, lite) {
  const seed = hallSeed(spec), L = ruinLaw(spec), cols = [], arches = [], among = [], lamps = [], magma = L.magma;
  spec.discs.forEach((d, i) => {
    const nl = egDiscLamps(d), ring = RING_ROLES.includes(d.role), y = d.y ?? 0;
    if (!nl && !ring && d.role !== 'island') return;
    if (egIsleDisc(spec, d)) return;
    const band0 = bandAt(spec, seed, d.x, y, d.z, i), { R, rad, gap } = ringOf(spec, d, band0), ds = (seed ^ Math.imul(i + 1, 0x632be5ab)) >>> 0;
    const footOf = (x, z, j) => {
      const f = y - lerp(EG_RUIN.depth[0], EG_RUIN.depth[1], h01(ds, 5, j));
      return magma && Math.abs(x - magma.x) < magma.r && Math.abs(z - magma.z) < magma.r ? Math.max(f, magma.y - 0.3) : f;
    };
    const taken = [];
    // Lamps are placed before the ring columns and never depend on `lite`, so every screen gets the same lights.
    const lrad = gap ? gap.rad : rad, fp = gap ? 0.15 : EG_RUIN.floorPad, rp = gap ? 0.05 : 0.3;
    for (let k = 0; k < nl; k++) {
      const a0 = (k / nl) * TAU + Math.PI / 4, lim = Math.PI / Math.max(1, nl) - 0.03;
      let got = null;
      for (const LR of gap ? [gap.R] : [R, R + 2.5, R + 5]) for (let step = 0; step * 0.035 <= lim && !got; step++) for (const sg of step ? [1, -1] : [1]) {
        const a = a0 + sg * step * 0.035, x = d.x + Math.cos(a) * LR, z = d.z + Math.sin(a) * LR;
        const cb = bandAt(spec, seed, x, y, z, 1000 + i * 16 + k), kind = egKitStyle(cb).fixture, fk = gap ? clamp((gap.room / 2 - fp - 0.03) / FIXTURE_R[kind], 0.45, 1) : 1;
        if (!clearTall(L, x, z, Math.max(lrad, FIXTURE_R[kind] * fk), fp, rp) || taken.some((t) => Math.hypot(t[0] - x, t[1] - z) < 2 * lrad + 1.6)) continue;
        const top = y + lerp(EG_RUIN.lampTop[0], EG_RUIN.lampTop[1], h01(ds, 6, k)), flame = flameAt(kind, x, z, top, d.x, d.z, d.r, fk);
        if (kind === 'lantern' && !clearTall(L, flame[0], flame[2], FIXTURE_R.lantern * fk, fp, rp)) continue;
        got = { d: i, k, kind: 'lamp', x, z, a, rad: lrad, foot: footOf(x, z, 100 + k), top, floor: y, band: cb, slot: -1, ring: LR, cx: d.x, cz: d.z, flame, fk };
        break;
      }
      if (got) { cols.push(got); taken.push([got.x, got.z]); lamps.push(Object.freeze({ d: i, k, at: Object.freeze(got.flame), band: got.band })); }
    }
    const place = (a) => [d.x + Math.cos(a) * R, d.z + Math.sin(a) * R];
    if (d.role === 'island') {
      if (lite) return;
      for (let j = 0; j < 2; j++) {
        const a = h01(ds, 7, j) * TAU, [x, z] = place(a);
        if (!clearTall(L, x, z, rad)) continue;
        cols.push({ d: i, k: -1, kind: 'broken', x, z, a, rad, foot: footOf(x, z, j), top: y + lerp(-2, 3.5, h01(ds, 8, j)), floor: y, band: bandAt(spec, seed, x, y, z, 2000 + i * 8 + j), slot: -1, ring: R, cx: d.x, cz: d.z });
      }
      return;
    }
    if (!ring) return;
    const pitch = lite ? EG_RUIN.pitchLite : lerp(EG_RUIN.pitch[0], EG_RUIN.pitch[1], h01(ds, 9));
    const n = Math.max(4, Math.round((TAU * R) / pitch)), a0 = h01(ds, 10) * TAU, wholeAt = Math.floor(h01(ds, 11) * EG_RUIN.wholeEvery);
    const H = y + lerp(EG_RUIN.whole[0], EG_RUIN.whole[1], h01(ds, 12)), slots = [];
    for (let j = 0; j < n; j++) {
      const a = a0 + (j / n) * TAU, [x, z] = place(a);
      if (taken.some((t) => Math.hypot(t[0] - x, t[1] - z) < Math.max(2 * rad + 1.6, pitch * 0.55)) || !clearTall(L, x, z, rad)) continue;
      const whole = j % EG_RUIN.wholeEvery === wholeAt && d.role !== 'arrive' && d.role !== 'end';
      slots.push({ d: i, k: -1, kind: whole ? 'whole' : 'broken', x, z, a, rad, foot: footOf(x, z, j), top: whole ? H : y + lerp(EG_RUIN.broken[0], EG_RUIN.broken[1], h01(ds, 13, j)), floor: y, band: bandAt(spec, seed, x, y, z, 3000 + i * 64 + j), slot: j, ring: R, cx: d.x, cz: d.z, n });
    }
    if (!lite && d.role === 'court') {
      const want = 1 + (h01(ds, 14) < 0.6 ? 1 : 0), cands = slots.filter((c) => c.kind === 'broken' && clearTall(L, c.x, c.z, 1.3));
      cands.sort((p, q) => h01(ds, 15, p.slot) - h01(ds, 15, q.slot));
      for (const c of cands.slice(0, want)) c.kind = 'statue';
    }
    cols.push(...slots);
    if (d.role === 'arrive' || d.role === 'end') for (const sx of [-1, 1]) {
      for (const dz of [0, 1.5, -1.5, 3, -3]) {
        const x = d.x + sx * (d.r + 3.4), z = d.z + dz, w = 3.2, kk = 4000 + i * 4 + (sx > 0 ? 1 : 0);
        if (!clearTall(L, x, z - w / 2 - 0.4, 0.6) || !clearTall(L, x, z + w / 2 + 0.4, 0.6) || taken.some((t) => Math.hypot(t[0] - x, t[1] - z) < w / 2 + 2)) continue;
        arches.push({ d: i, x, z, w, h: y + 5.2 + 1.2 * h01(ds, 16, sx + 1), foot: y - lerp(14, 24, h01(ds, 17, sx + 1)), floor: y, band: bandAt(spec, seed, x, y, z, kk), key: kk });
        break;
      }
    }
    if (d.role === 'court' || d.role === 'isle') {
      const m = lite ? 2 : d.role === 'court' ? 5 : 3;
      for (let j = 0; j < m; j++) {
        const a = a0 + ((j + 0.5) / m) * TAU + 0.3 * (h01(ds, 18, j) - 0.5), rr = R + 2.2 + 2.5 * h01(ds, 19, j), x = d.x + Math.cos(a) * rr, z = d.z + Math.sin(a) * rr;
        if (!clearTall(L, x, z, 1.4) || cols.some((c) => c.d === i && Math.hypot(c.x - x, c.z - z) < c.rad + 2.2)) continue;
        among.push({ d: i, x, z, a, floor: y, band: bandAt(spec, seed, x, y, z, 5000 + i * 8 + j), key: 5000 + i * 8 + j, foot: footOf(x, z, 300 + j) });
      }
    }
  });
  const byKey = new Map(lamps.map((l) => [`${l.d}:${l.k}`, l]));
  return Object.freeze({ cols, arches, among, lamps, lamp: (d, k) => byKey.get(`${d}:${k}`) ?? null });
}

function column(W, c, lite) {
  const F = formOf(c.band), r = c.rad, sides = F.col.sides, style = egKitStyle(c.band), wraps = EG_KIT_MAP[K.shaft].around[clamp(c.band, 0, 3)];
  const base = c.foot, top = c.top, vOf = (yy) => (yy - c.floor) / 2, a0 = c.band === 3 ? Math.PI / 6 : 0;
  const blk = { x: c.x, z: c.z, R: r * 1.9, len: 2.5 + 2.5 * h01(c.foot * 977 | 0, 3), bendA: c.a, bend: 0.2 };
  spire(W, { sides: 5, rings: 3, jitter: 0.2, bend: 0, tip: 0.15, step: 0.1, twist: 0, rec: K.found }, blk, base - 0.55, (c.x * 131 + c.z * 71) | 0, 7, (yy) => lerp(EG_FOUND_V.rubble[0], EG_FOUND_V.deep[1], clamp((base - yy) / 6, 0, 1)));
  fbox(W, K.voussoir, frame(c.x, base - 0.55, c.z, c.a), -r * 1.35, 0, -r * 1.35, r * 1.35, 0.55, r * 1.35, { skip: '' });
  lathe(W, K.moulding, ID, c.x, base, c.z, [[r * 1.24, 0], [r * 1.2, 0.2], [r, 0.36]], sides, { a0, vOf: (yy) => mv('cove', 1 - yy / 0.36) });
  const yTop = top - (c.kind === 'whole' ? 0.85 : 0), rt = r * F.col.taper, mid = lerp(r, rt, 0.4);
  const prof = [[r, base + 0.36], [mid, lerp(base + 0.36, yTop, 0.45)], [rt, yTop]];
  lathe(W, K.shaft, ID, c.x, 0, c.z, prof, sides, { a0, wraps, vOf });
  if (c.kind === 'whole') capital(W, c, style.capital, rt, yTop, sides, a0);
  else if (c.kind === 'lamp') {
    lathe(W, K.shaft, ID, c.x, yTop, c.z, [[rt, 0], [rt * 0.98, 0.04], [0, 0.05]], sides, { a0, wraps, vOf: (yy) => vOf(yTop + yy) });
    fixture(W, c, style.fixture, yTop + 0.05, lite);
  } else breakTop(W, c, rt, yTop, sides, a0, wraps, vOf);
}
function breakTop(W, c, r, y, sides, a0, wraps, vOf) {
  const s = (c.x * 53 + c.z * 97) | 0, h = 0.5 + 0.5 * h01(s, 1), ox = 0.08 * (h01(s, 2) - 0.5), oz = 0.08 * (h01(s, 3) - 0.5);
  const ring = [], top = [];
  for (let k = 0; k < sides; k++) {
    const a = a0 + (k / sides) * TAU, jr = 1 - 0.04 * h01(s, 4, k);
    ring.push([c.x + ox + Math.cos(a) * r * jr, y + 0.02, c.z + oz + Math.sin(a) * r * jr]);
    top.push([c.x + ox + Math.cos(a) * r * jr * 0.97, y + h * (0.3 + 0.7 * h01(s, 5, k)), c.z + oz + Math.sin(a) * r * jr * 0.97]);
  }
  const ctr = [c.x + ox, y + h * (0.4 + 0.5 * h01(s, 6)), c.z + oz], mid = [c.x, y + h / 2, c.z];
  for (let k = 0; k < sides; k++) {
    const k1 = (k + 1) % sides, u0 = (k / sides) * wraps, u1 = ((k + 1) / sides) * wraps;
    W.QA(K.shaft, ring[k], ring[k1], top[k1], top[k], u0, vOf(y), u1, vOf(y + h), mid);
    W.T(K.shaft, top[k], top[k1], ctr, u0, vOf(y + h), u1, vOf(y + h), (u0 + u1) / 2, vOf(y + h) + 0.1, 0, 1, 0);
  }
}
function capital(W, c, kind, r, y, sides, a0) {
  const f = frame(c.x, y, c.z, Math.atan2(c.cx - c.x, c.cz - c.z)), vM = (yy) => mv('ornament', 1 - yy / 0.5), ab = { v: [MB.fillet[0], MB.band[1]] };
  lathe(W, K.moulding, ID, c.x, y, c.z, [[r, 0], [r * 1.06, 0.06], [r * 1.06, 0.12], [r, 0.14]], sides, { a0, vOf: (yy) => mv('band', 1 - yy / 0.14) });
  if (kind === 'scroll') {
    lathe(W, K.moulding, ID, c.x, y + 0.14, c.z, [[r, 0], [r * 1.3, 0.16], [r * 1.38, 0.3], [r * 1.2, 0.38]], sides, { a0, vOf: vM });
    for (const sx of [-1, 1]) { tube(W, K.moulding, at(f, sx * r * 1.22, 0.42, -r * 1.3), at(f, sx * r * 1.22, 0.42, r * 1.3), 0.21, 0.21, 8, { v0: MB.ornament[0], v1: MB.ornament[1] }); tube(W, K.moulding, at(f, sx * r * 1.22, 0.42, -r * 1.36), at(f, sx * r * 1.22, 0.42, r * 1.36), 0.09, 0.09, 6, { v0: MB.band[0], v1: MB.band[1] }); }
    fbox(W, K.moulding, f, -r * 1.45, 0.62, -r * 1.45, r * 1.45, 0.85, r * 1.45, ab);
  } else if (kind === 'skull') {
    lathe(W, K.moulding, ID, c.x, y + 0.14, c.z, [[r * 0.95, 0], [r * 1.25, 0.12], [r * 1.3, 0.3], [r * 1.0, 0.5]], sides, { a0, vOf: vM });
    for (let k = 0; k < 4; k++) {
      const a = Math.atan2(c.cz - c.z, c.cx - c.x) + (k / 4) * TAU, sx = c.x + Math.cos(a) * r * 1.15, sz = c.z + Math.sin(a) * r * 1.15;
      lathe(W, K.statue, ID, sx, y + 0.2, sz, [[0, 0], [0.16, 0.04], [0.2, 0.2], [0.17, 0.33], [0, 0.38]], 6, { vOf: (yy) => (y + yy) / 2 });
      fbox(W, K.statue, frame(sx, y + 0.12, sz, Math.PI / 2 - a), -0.11, 0, 0.0, 0.11, 0.13, 0.16, { v: 'up' });
    }
    fbox(W, K.moulding, f, -r * 1.4, 0.62, -r * 1.4, r * 1.4, 0.85, r * 1.4, ab);
  } else if (kind === 'crescent') {
    lathe(W, K.moulding, ID, c.x, y + 0.14, c.z, [[r, 0], [r * 1.4, 0.3], [r * 1.42, 0.4], [r * 1.1, 0.48]], sides, { a0, vOf: vM });
    fbox(W, K.moulding, f, -r * 1.3, 0.48, -r * 1.3, r * 1.3, 0.62, r * 1.3, ab);
    const pts = [];
    for (let k = 0; k <= 8; k++) { const t = (k / 8) * Math.PI; pts.push([Math.cos(t) * 0.62, 0.62 + 0.25 + Math.sin(t) * 0.55]); }
    for (let k = 8; k >= 0; k--) { const t = (k / 8) * Math.PI; pts.push([Math.cos(t) * 0.42 + 0.0, 0.62 + 0.25 + Math.sin(t) * 0.32 + 0.12]); }
    for (let k = 0; k < 8; k++) {
      const a = pts[k], b = pts[k + 1], ib = pts[16 - k - 1], ia = pts[16 - k];
      const u0 = k / 8, u1 = (k + 1) / 8, b0 = MB.band[0], b1 = MB.band[1];
      for (const t of [-0.06, 0.06]) { const o = dirOf(f, 0, 0, t); W.Q4(K.moulding, at(f, a[0], a[1], t), at(f, b[0], b[1], t), at(f, ib[0], ib[1], t), at(f, ia[0], ia[1], t), u0, b0, u1, b0, u1, b1, u0, b1, o[0], o[1], o[2]); }
      const om = dirOf(f, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.87, 0), oi = dirOf(f, -(ia[0] + ib[0]) / 2, -((ia[1] + ib[1]) / 2 - 0.87), 0);
      W.Q4(K.moulding, at(f, a[0], a[1], -0.06), at(f, b[0], b[1], -0.06), at(f, b[0], b[1], 0.06), at(f, a[0], a[1], 0.06), u0, b0, u1, b0, u1, b1, u0, b1, om[0], om[1], om[2]);
      W.Q4(K.moulding, at(f, ia[0], ia[1], -0.06), at(f, ib[0], ib[1], -0.06), at(f, ib[0], ib[1], 0.06), at(f, ia[0], ia[1], 0.06), u0, b0, u1, b0, u1, b1, u0, b1, oi[0], oi[1], oi[2]);
    }
  } else {
    lathe(W, K.moulding, ID, c.x, y + 0.14, c.z, [[r, 0], [r * 1.3, 0.2], [r * 1.3, 0.5]], sides, { a0, vOf: vM });
    fbox(W, K.moulding, f, -r * 1.4, 0.5, -r * 1.4, r * 1.4, 0.85, r * 1.4, ab);
    for (let k = 0; k < 6; k++) {
      const a = a0 + (k / 6) * TAU, b0 = [c.x + Math.cos(a) * r * 1.3, y + 0.7, c.z + Math.sin(a) * r * 1.3], tip = [c.x + Math.cos(a) * (r * 1.3 + 0.7), y + 1.15, c.z + Math.sin(a) * (r * 1.3 + 0.7)];
      beam(W, K.fixture, b0, tip, 0.12, 0.12, { v0: FXB.body[0], v1: FXB.body[1] });
    }
  }
}
function flame(W, x, y0, z, k, cell) {
  const [qw, qh] = EG_FIXTURE_V.quad, w = (qw * k) / 2, h = qh * k, u0 = cell / EG_FIXTURE_V.cells, u1 = (cell + 1) / EG_FIXTURE_V.cells, [v0, v1] = EG_FIXTURE_V.flame;
  for (const [ax, az] of [[1, 0], [0, 1]]) {
    const A = [x - ax * w, y0 + h, z - az * w], Bq = [x + ax * w, y0 + h, z + az * w], C = [Bq[0], y0, Bq[2]], D = [A[0], y0, A[2]];
    for (const sg of [1, -1]) W.Q4(K.fixture, A, Bq, C, D, u0, v0, u1, v0, u1, v1, u0, v1, -az * sg, 0, ax * sg);
  }
}
function grille(W, f, prof, sides) {
  const [g0, g1] = EG_FIXTURE_V.grille, y0 = prof[0][1], y1 = prof[prof.length - 1][1], vOf = (yy) => lerp(g1, g0, (yy - y0) / (y1 - y0 || 1));
  lathe(W, K.fixture, f, 0, 0, 0, prof, sides, { vOf, wraps: 1 });
  lathe(W, K.fixture, f, 0, 0, 0, [...prof].reverse(), sides, { vOf, wraps: 1 });
}
function fixture(W, c, kind, y, lite) {
  const k = c.fk ?? 1, f = frame(c.x, y, c.z, 0, k), sides = lite ? 5 : 7, [b0, b1] = EG_FIXTURE_V.body, fl = c.flame;
  const body = (h) => (yy) => lerp(b0, b1, clamp(yy / h, 0, 1));
  const rod = (p, q, w, caps = true) => beam(W, K.fixture, at(f, ...p), at(f, ...q), w * k, w * k, { caps, v0: b0, v1: b1 });
  const cell = Math.floor(h01((Math.round(c.x * 31) ^ Math.round(c.z * 17)) >>> 0, 67) * EG_FIXTURE_V.cells), qh = EG_FIXTURE_V.quad[1] * k;
  if (kind === 'tripod') {
    for (let j = 0; j < 3; j++) { const a = (j / 3) * TAU + (c.a ?? 0); rod([Math.cos(a) * 0.36, 0, Math.sin(a) * 0.36], [Math.cos(a) * 0.16, 0.55, Math.sin(a) * 0.16], 0.06); }
    lathe(W, K.fixture, f, 0, 0.5, 0, [[0, 0], [0.38, 0.12], [0.5, 0.34], [0.42, 0.34], [0, 0.18]], sides + 1, { vOf: body(0.34) });
  } else if (kind === 'lantern') {
    const ox = (fl[0] - c.x) / k, oz = (fl[2] - c.z) / k, arm = EG_FIXTURE_FLAME.lantern + 0.9;
    rod([-ox * 0.08, 0, -oz * 0.08], [-ox * 0.08, arm + 0.1, -oz * 0.08], 0.12);
    rod([-ox * 0.08, arm, -oz * 0.08], [ox, arm, oz], 0.1);
    rod([-ox * 0.08, arm - 0.55, -oz * 0.08], [ox * 0.55, arm, oz * 0.55], 0.06);
    chain(W, at(f, ox, arm - 0.05, oz), 1, 0.3 * k);
    const cg = frame(fl[0], fl[1] - 0.55 * k, fl[2], 0, k);
    grille(W, cg, [[0.3, 0], [0.3, 1.1]], 6);
    lathe(W, K.fixture, cg, 0, 1.1, 0, [[0.34, 0], [0.34, 0.05], [0.06, 0.2], [0, 0.22]], 6, { vOf: body(0.22) });
    lathe(W, K.fixture, cg, 0, -0.06, 0, [[0, 0], [0.34, 0], [0.34, 0.06], [0, 0.06]], 6, { vOf: body(0.06) });
  } else if (kind === 'moonlamp') {
    lathe(W, K.fixture, f, 0, 0, 0, [[0.14, 0], [0.07, 0.1], [0.05, 1.3], [0.12, 1.36], [0.2, 1.42], [0.16, 1.44]], sides, { vOf: body(1.44) });
  } else {
    lathe(W, K.fixture, f, 0, 0, 0, [[0.16, 0], [0.08, 0.2], [0.05, 0.8], [0.04, 0.95]], 4, { vOf: body(0.95), a0: Math.PI / 4 });
    grille(W, f, [[0.12, 0.82], [0.3, 1.04], [0.46, 1.3]], 8);
  }
  flame(W, fl[0], fl[1] - qh / 2, fl[2], k, cell);
}
function entablature(W, c, n, share, seed) {
  const y = c.top, dx = n.x - c.x, dz = n.z - c.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, len = L * share;
  const yaw = Math.atan2(ux, uz), f = frame(c.x, y, c.z, yaw), w = c.rad * 1.25;
  const broken = share < 0.99, jag = (k) => (broken ? 0.35 * h01(seed, 81, k) : 0);
  /** @type {Array<[number, number, number, number, { uS?: number, v?: number[] }]>} */
  const parts = [[K.voussoir, 0, 0.45, w * 0.92, {}], [K.relief, 0.45, 1.05, w * 0.86, { uS: 1 / 0.6, v: [0, 1] }], [K.moulding, 1.05, 1.35, w * 1.06, { v: [MB.ornament[0], MB.ornament[1]] }]];
  for (const [rec, y0, y1, hw, o] of parts) {
    const z1 = len - jag(rec), z0 = -c.rad * 0.6;
    fbox(W, rec, f, -hw, y0, z0, hw, y1, z1, { skip: 'bottom', ...o });
    W.QA(K.coffer, at(f, -hw, y0, z0), at(f, hw, y0, z0), at(f, hw, y0, z1), at(f, -hw, y0, z1), 0, 0, hw, (z1 - z0) / 2, at(f, 0, y0 + 1, z0));
  }
  return { a: at(f, 0, 0, Math.min(0.6, len * 0.2)), b: at(f, 0, 0, len - 0.6), y, ux, uz, len };
}
function banner(W, line, t, w, h) {
  const cx = lerp(line.a[0], line.b[0], t), cz = lerp(line.a[2], line.b[2], t), y = line.y - 0.02, ux = line.ux, uz = line.uz;
  const A = [cx - ux * w / 2, y, cz - uz * w / 2], Bq = [cx + ux * w / 2, y, cz + uz * w / 2], C = [Bq[0], y - h, Bq[2]], D = [A[0], y - h, A[2]];
  const nx = -uz, nz = ux;
  W.Q4(K.banner, A, Bq, C, D, 0, 0, 1, 0, 1, 1, 0, 1, nx, 0, nz);
  W.Q4(K.banner, A, Bq, C, D, 0, 0, 1, 0, 1, 1, 0, 1, -nx, 0, -nz);
  beam(W, K.fixture, [A[0] - ux * 0.12, y - 0.04, A[2] - uz * 0.12], [Bq[0] + ux * 0.12, y - 0.04, Bq[2] + uz * 0.12], 0.06, 0.06, { v0: EG_FIXTURE_V.body[0], v1: EG_FIXTURE_V.body[1] });
}

function plinth(W, x, z, yaw, foot, top, seed) {
  const f = frame(x, 0, z, yaw), s = 0.85;
  fbox(W, K.statue, f, -s, top - 0.18, -s, s, top, s * 0.55 - 0.2 * h01(seed, 3), { v: 'up' });
  fbox(W, K.voussoir, f, -s * 0.9, foot, -s * 0.9, s * 0.9, top - 0.18, s * 0.9, { skip: 'bottom' });
  spire(W, { sides: 4, rings: 3, jitter: 0.15, bend: 0, tip: 0.2, step: 0, twist: 0.3, rec: K.found }, { x, z, R: 1.25, len: 4 + 3 * h01(seed, 4), bendA: yaw, bend: 0 }, foot, seed, 3, () => EG_FOUND_V.deep[0]);
}
function statue(W, f, kind) {
  const S = K.statue, v = (yy) => (f.y + yy * f.k) / 2, P = (x, y, z) => at(f, x, y, z);
  const limb = (a, b, w, h = w) => beam(W, S, P(...a), P(...b), w * f.k, h * f.k);
  if (kind === 'battlemage') {
    lathe(W, S, f, 0, 0, 0, [[0, 0], [0.64, 0], [0.68, 0.32], [0.6, 0.9], [0.5, 1.6], [0.42, 2.05], [0.5, 2.28], [0.47, 2.42], [0.28, 2.56], [0, 2.58]], 10, { vOf: v });
    lathe(W, S, f, 0, 0, 0.02, [[0, 2.52], [0.2, 2.56], [0.26, 2.74], [0.25, 2.92], [0.16, 3.08], [0, 3.14]], 8, { vOf: v });
    lathe(W, S, f, 0, 0, -0.06, [[0, 2.5], [0.3, 2.56], [0.33, 2.8], [0.27, 3.04], [0.12, 3.2], [0, 3.22]], 8, { vOf: v, a0: Math.PI / 8 });
    limb([0.44, 2.3, 0], [0.6, 2.76, 0.1], 0.24); limb([0.6, 2.76, 0.1], [0.66, 3.28, 0.2], 0.2);
    limb([0.68, 0.9, 0.22], [0.7, 4.15, 0.22], 0.09); gem(W, S, f, 0.7, 4.32, 0.22, 0.18, 1.5);
    limb([-0.44, 2.3, 0], [-0.54, 1.8, 0.16], 0.24); limb([-0.54, 1.8, 0.16], [-0.3, 1.62, 0.4], 0.2);
    fbox(W, S, f, -0.42, 1.52, 0.36, -0.12, 1.92, 0.5, { v: 'up' });
  } else if (kind === 'mourner') {
    lathe(W, S, f, 0, 0, 0, [[0, 0], [0.72, 0], [0.74, 0.3], [0.6, 1.1], [0.5, 1.8], [0.47, 2.15], [0.3, 2.34], [0, 2.36]], 10, { vOf: v });
    const g = frame(f.x, f.y, f.z, Math.atan2(f.s, f.c), f.k), tilt = 0.35, hood = [[0, 0], [0.3, 0.04], [0.35, 0.3], [0.29, 0.55], [0.12, 0.72], [0, 0.75]];
    const hp = hood.map(([r, y]) => [r, y]), base = [0, 2.2, 0.06];
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * TAU, a1 = ((k + 1) / 8) * TAU;
      for (let j = 0; j + 1 < hp.length; j++) {
        const Pq = (r, y, a) => { const lx = Math.cos(a) * r, lz0 = Math.sin(a) * r, ly = y; return at(g, base[0] + lx, base[1] + ly * Math.cos(tilt) - lz0 * Math.sin(tilt), base[2] + lz0 * Math.cos(tilt) + ly * Math.sin(tilt)); };
        const A = Pq(hp[j][0], hp[j][1], a0), Bq = Pq(hp[j][0], hp[j][1], a1), C = Pq(hp[j + 1][0], hp[j + 1][1], a1), D = Pq(hp[j + 1][0], hp[j + 1][1], a0), c = at(g, base[0], base[1] + 0.35, base[2] + 0.1);
        if (hp[j][0] <= 0) W.T(S, A, C, D, 0, 0, 0.3, 0.3, 0, 0.3, (C[0] + D[0]) / 2 - c[0], (C[1] + D[1]) / 2 - c[1], (C[2] + D[2]) / 2 - c[2]);
        else if (hp[j + 1][0] <= 0) W.T(S, A, Bq, C, 0, 0, 0.3, 0, 0.15, 0.3, (A[0] + Bq[0]) / 2 - c[0], (A[1] + Bq[1]) / 2 - c[1], (A[2] + Bq[2]) / 2 - c[2]);
        else W.QA(S, A, Bq, C, D, 0, 0, 0.3, 0.3, c);
      }
    }
    limb([0.42, 2.1, 0.04], [0.1, 1.55, 0.42], 0.26); limb([-0.42, 2.1, 0.04], [-0.1, 1.55, 0.42], 0.26);
    fbox(W, S, f, -0.16, 1.42, 0.38, 0.16, 1.66, 0.58, { v: 'up' });
    fbox(W, S, f, -0.5, 0, -0.95, 0.5, 0.22, -0.4, { v: 'up' });
  } else if (kind === 'raven') {
    limb([0.16, 0, 0.1], [0.16, 0.55, 0.05], 0.09); limb([-0.16, 0, 0.1], [-0.16, 0.55, 0.05], 0.09);
    const tilt = 0.62, body = [[0, 0], [0.26, 0.12], [0.44, 0.45], [0.46, 0.82], [0.38, 1.15], [0.24, 1.4], [0, 1.5]];
    const Pb = (r, y, a) => { const lx = Math.cos(a) * r, lz = Math.sin(a) * r * 1.1; return at(f, lx, 0.5 + y * Math.cos(tilt) - lz * Math.sin(tilt), -0.2 + lz * Math.cos(tilt) + y * Math.sin(tilt)); };
    const bc = at(f, 0, 1.05, 0.2);
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * TAU, a1 = ((k + 1) / 8) * TAU;
      for (let j = 0; j + 1 < body.length; j++) {
        const A = Pb(body[j][0], body[j][1], a0), Bq = Pb(body[j][0], body[j][1], a1), C = Pb(body[j + 1][0], body[j + 1][1], a1), D = Pb(body[j + 1][0], body[j + 1][1], a0);
        if (body[j][0] <= 0) W.T(S, A, C, D, 0, 0, 0.3, 0.3, 0, 0.3, (C[0] + D[0]) / 2 - bc[0], (C[1] + D[1]) / 2 - bc[1], (C[2] + D[2]) / 2 - bc[2]);
        else if (body[j + 1][0] <= 0) W.T(S, A, Bq, C, 0, 0, 0.3, 0, 0.15, 0.3, (A[0] + Bq[0]) / 2 - bc[0], (A[1] + Bq[1]) / 2 - bc[1], (A[2] + Bq[2]) / 2 - bc[2]);
        else W.QA(S, A, Bq, C, D, 0, 0, 0.3, 0.3, bc);
      }
    }
    lathe(W, S, f, 0, 0, 0.62, [[0, 1.55], [0.2, 1.6], [0.26, 1.78], [0.2, 1.96], [0, 2.02]], 7, { vOf: v });
    limb([0, 1.8, 0.82], [0, 1.66, 1.32], 0.14, 0.12);
    for (const sx of [-1, 1]) {
      const a = P(sx * 0.42, 1.45, 0.25), b = P(sx * 0.36, 0.55, -0.85), c = P(sx * 0.48, 0.85, 0.2), o = dirOf(f, sx, 0, 0);
      W.T(S, a, b, c, 0, 0, 0.6, 0.6, 0.1, 0.4, o[0], o[1], o[2]);
      W.T(S, a, b, c, 0, 0, 0.6, 0.6, 0.1, 0.4, -o[0], -o[1], -o[2]);
    }
    fbox(W, S, f, -0.22, 0.32, -1.25, 0.22, 0.4, -0.45, { v: 'up' });
  } else {
    fbox(W, S, f, -0.4, 0, -0.18, -0.08, 1.3, 0.18, { v: 'up' }); fbox(W, S, f, 0.08, 0, -0.18, 0.4, 1.3, 0.18, { v: 'up' });
    lathe(W, S, f, 0, 1.15, 0, [[0.5, 0], [0.56, 0.4], [0.46, 0.5]], 6, { vOf: v });
    lathe(W, S, f, 0, 1.6, 0, [[0.42, 0], [0.5, 0.5], [0.58, 0.9], [0.5, 1.02], [0.2, 1.08]], 6, { vOf: v, a0: Math.PI / 6 });
    for (const sx of [-1, 1]) {
      lathe(W, S, frame(...P(sx * 0.62, 2.48, 0), Math.atan2(f.s, f.c), f.k), 0, 0, 0, [[0.3, -0.12], [0.34, 0.06], [0.22, 0.22], [0, 0.26]], 6, { vOf: v });
      limb([sx * 0.62, 2.35, 0.05], [sx * 0.42, 1.95, 0.4], 0.24); limb([sx * 0.42, 1.95, 0.4], [sx * 0.1, 2.06, 0.62], 0.2);
      limb([sx * 0.14, 3.0, 0.02], [sx * 0.34, 3.36, -0.12], 0.1); limb([sx * 0.34, 3.36, -0.12], [sx * 0.24, 3.66, -0.4], 0.06);
    }
    fbox(W, S, f, -0.17, 2.68, -0.18, 0.17, 3.08, 0.18, { v: 'up' });
    limb([0, 0.02, 0.62], [0, 1.8, 0.62], 0.22, 0.06); limb([-0.42, 1.82, 0.62], [0.42, 1.82, 0.62], 0.1); limb([0, 1.82, 0.62], [0, 2.22, 0.62], 0.07); gem(W, S, f, 0, 2.3, 0.62, 0.08, 1.2);
  }
}

function amongThing(W, m, kind, lite) {
  const s = (Math.round(m.x * 37) ^ Math.round(m.z * 59)) >>> 0, y = m.floor;
  if (kind === 'obelisk') {
    let yy = y - 5 - 3 * h01(s, 1), rr = 1.1 + 0.3 * h01(s, 2);
    const n = 5 + Math.floor(3 * h01(s, 3));
    spire(W, { sides: 5, rings: 3, jitter: 0.2, bend: 0, tip: 0.15, step: 0, twist: 0.2, rec: K.found }, { x: m.x, z: m.z, R: rr * 1.1, len: 6, bendA: 0, bend: 0 }, yy, s, 1, (q) => lerp(EG_FOUND_V.rubble[1], EG_FOUND_V.deep[1], clamp((yy - q) / 6, 0, 1)));
    for (let i = 0; i < n; i++) {
      const hh = 0.9 + 0.9 * h01(s, 4, i), ox = 0.15 * (h01(s, 5, i) - 0.5), oz = 0.15 * (h01(s, 6, i) - 0.5), yaw = h01(s, 7, i) * TAU, poly = [];
      for (let k = 0; k < 5; k++) { const a = yaw + (k / 5) * TAU, r = rr * (0.8 + 0.3 * h01(s, 8 + i, k)); poly.push([m.x + ox + Math.cos(a) * r, m.z + oz + Math.sin(a) * r]); }
      const c = [m.x + ox, yy + hh / 2, m.z + oz];
      for (let k = 0; k < 5; k++) { const [a0, b0] = poly[k], [a1, b1] = poly[(k + 1) % 5]; W.QA(K.statue, [a0, yy + hh, b0], [a1, yy + hh, b1], [a1, yy, b1], [a0, yy, b0], 0, (yy + hh) / 2, Math.hypot(a1 - a0, b1 - b0) / 2, yy / 2, c); }
      for (let k = 1; k < 4; k++) { W.T(K.statue, [poly[0][0], yy + hh, poly[0][1]], [poly[k][0], yy + hh, poly[k][1]], [poly[k + 1][0], yy + hh, poly[k + 1][1]], 0, 0, 0.5, 0, 0.5, 0.5, 0, 1, 0); W.T(K.statue, [poly[0][0], yy, poly[0][1]], [poly[k][0], yy, poly[k][1]], [poly[k + 1][0], yy, poly[k + 1][1]], 0, 0, 0.5, 0, 0.5, 0.5, 0, -1, 0); }
      yy += hh; rr *= 0.86;
    }
  } else if (kind === 'thorns') {
    const root = [m.x, y - 9 - 5 * h01(s, 1), m.z], n = lite ? 4 : 7;
    for (let i = 0; i < n; i++) {
      const a = h01(s, 2, i) * TAU, lean = 0.25 + 0.4 * h01(s, 3, i), len = 9 + 7 * h01(s, 4, i), kink = 0.45 + 0.2 * h01(s, 5, i);
      const mid = [root[0] + Math.cos(a) * lean * len * kink, root[1] + len * kink, root[2] + Math.sin(a) * lean * len * kink];
      const tip = [mid[0] + Math.cos(a + 0.5) * lean * 1.4 * len * (1 - kink), root[1] + len, mid[2] + Math.sin(a + 0.5) * lean * 1.4 * len * (1 - kink)];
      const R = 0.35 + 0.25 * h01(s, 6, i);
      thorn(W, root, mid, tip, R);
    }
  } else if (kind === 'pylon') {
    const foot = y - 12 - 6 * h01(s, 1), top = y + 5 + 3 * h01(s, 2), yaw = h01(s, 3) * TAU, f = frame(m.x, 0, m.z, yaw);
    const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [i, j] of legs) beam(W, K.fixture, at(f, i * 0.9, foot, j * 0.9), at(f, i * 0.35, top, j * 0.35), 0.18, 0.18, { v0: EG_FIXTURE_V.body[0], v1: EG_FIXTURE_V.body[1] });
    for (let yy = y - 2; yy < top - 1; yy += 2.6) { const t = (yy - foot) / (top - foot), w = lerp(0.9, 0.35, t); for (let k = 0; k < 4; k++) { const [i0, j0] = legs[k], [i1, j1] = legs[(k + 1) % 4]; beam(W, K.fixture, at(f, i0 * w, yy, j0 * w), at(f, i1 * w, yy, j1 * w), 0.1, 0.1, { caps: false, v0: EG_FIXTURE_V.body[0], v1: EG_FIXTURE_V.body[1] }); } }
    beam(W, K.fixture, at(f, 0, top, -0.4), at(f, 0, top, 2.2), 0.22, 0.26, { v0: EG_FIXTURE_V.body[0], v1: EG_FIXTURE_V.body[1] });
    if (!lite) chain(W, at(f, 0, top - 0.15, 2.0), 6 + Math.floor(5 * h01(s, 4)), 0.48);
  }
}
function thorn(W, root, mid, tip, R) {
  const ring = (p, r, q, k) => { const dx = q[0] - p[0], dz = q[2] - p[2], l = Math.hypot(dx, dz) || 1, sx = -dz / l, sz = dx / l; return [[p[0] + sx * r, p[1], p[2] + sz * r], [p[0], p[1] + r * 0.2, p[2]], [p[0] - sx * r, p[1], p[2] - sz * r], [p[0], p[1] - r * 0.2 - k, p[2]]]; };
  const a = ring(root, R, mid, 0), b = ring(mid, R * 0.55, tip, 0.05);
  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4, c0 = [(root[0] + mid[0]) / 2, (root[1] + mid[1]) / 2, (root[2] + mid[2]) / 2];
    W.QA(K.crystal, a[k], a[k1], b[k1], b[k], k / 4, root[1] / 2, (k + 1) / 4, mid[1] / 2, c0);
    const c1 = [(mid[0] * 2 + tip[0]) / 3, (mid[1] * 2 + tip[1]) / 3, (mid[2] * 2 + tip[2]) / 3];
    const m = [(b[k][0] + b[k1][0] + tip[0]) / 3 - c1[0], (b[k][1] + b[k1][1] + tip[1]) / 3 - c1[1], (b[k][2] + b[k1][2] + tip[2]) / 3 - c1[2]];
    W.T(K.crystal, b[k], b[k1], tip, k / 4, mid[1] / 2, (k + 1) / 4, mid[1] / 2, (k + 0.5) / 4, tip[1] / 2, m[0], m[1], m[2]);
  }
}
function plateArch(W, q, seed) {
  const style = egKitStyle(q.band).arch, g = alongFrame(q.x, 0, q.z, 0, 1), pw = 0.7, th = 0.9, top = q.h + 0.6, ys = q.h - egArchRise(style, q.w);
  archRing(W, g, style, q.w, ys, th, 0.5, style === 'squat' ? 7 : 11, top);
  for (const sg of [-1, 1]) pier(W, g, sg > 0 ? q.w / 2 : -q.w / 2 - pw, sg > 0 ? q.w / 2 + pw : -q.w / 2, th + 0.12, top, q.foot, seed, 900 + (sg > 0 ? 1 : 0));
  const h = 0.5 + 0.6 * h01(seed, 91);
  fbox(W, K.moulding, g, -q.w / 2 - pw - 0.1, top - 0.12, -th / 2 - 0.12, q.w / 2 + pw + 0.1, top, th / 2 + 0.12, {});
  fbox(W, W.ashlar, g, -q.w / 2 - pw, top, -th / 2 - 0.06, q.w / 2 + pw * (0.2 + 0.8 * h01(seed, 92)) - q.w * 0.3 * h01(seed, 93), top + h, th / 2 + 0.06, {});
}

function edgeRuns(law, ax, az, bx, bz, hw, y, self) {
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, out = [];
  for (const side of [-1, 1]) {
    const nx = -uz * side, nz = ux * side, n = Math.max(2, Math.ceil(L / 0.5)), ok = [];
    for (let i = 0; i <= n; i++) {
      const s = (i / n) * L, ex = ax + ux * s + nx * hw, ez = az + uz * s + nz * hw;
      ok.push(!(corniceHit(law, self, ex - nx * 0.05, ez - nz * 0.05, y) || corniceHit(law, self, ex + nx * 0.18, ez + nz * 0.18, y) || corniceHit(law, self, ex + nx * EG_RUIN_CORNICE.reach, ez + nz * EG_RUIN_CORNICE.reach, y)));
    }
    let i = 0;
    while (i <= n) {
      if (!ok[i]) { i++; continue; }
      let j = i;
      while (j + 1 <= n && ok[j + 1]) j++;
      const s0 = (i / n) * L, s1 = (j / n) * L;
      if (s1 - s0 >= 1) out.push([{ x: ax + ux * s0 + nx * hw, y, z: az + uz * s0 + nz * hw, nx, nz, m: 1 }, { x: ax + ux * s1 + nx * hw, y, z: az + uz * s1 + nz * hw, nx, nz, m: 1 }]);
      i = j + 1;
    }
  }
  return out;
}
function corniceHit(law, self, x, z, y) {
  for (const F of law.floors) if (F !== self && onFloor(F, x, z)) return true;
  for (const b of law.boxes) if (x > b[0] && x < b[3] && z > b[2] && z < b[5] && b[1] < y && b[4] > y - 1) return true;
  for (const [cx, cz, r0, r1, y0, y1] of law.rings) { const d = Math.hypot(x - cx, z - cz); if (d > r0 && d < r1 && y0 < y && y1 > y - 1) return true; }
  return false;
}
function rimRuns(law, d, self) {
  const P = rimPath(d), N = P.length, y = d.y ?? 0, ok = P.map((p, k) => {
    const q = P[(k + 1) % N], mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2, nx = (p.nx + q.nx) / 2, nz = (p.nz + q.nz) / 2;
    return ![0, 0.1, 0.25, EG_RUIN_CORNICE.reach].some((o) => corniceHit(law, self, mx + nx * o, mz + nz * o, y) || corniceHit(law, self, p.x + p.nx * o, p.z + p.nz * o, y) || corniceHit(law, self, q.x + q.nx * o, q.z + q.nz * o, y));
  });
  if (ok.every(Boolean)) return [{ path: P, closed: true }];
  if (!ok.some(Boolean)) return [];
  const start = ok.indexOf(false), runs = [];
  let cur = null;
  for (let i = 1; i <= N; i++) {
    const k = (start + i) % N;
    if (ok[k]) { if (!cur) cur = [P[k]]; cur.push(P[(k + 1) % N]); }
    else if (cur) { runs.push({ path: cur, closed: false }); cur = null; }
  }
  if (cur) runs.push({ path: cur, closed: false });
  return runs;
}

function walkLamp(W, x, z, s, band, lite, seed) {
  const kind = egKitStyle(band).fixture, k = Math.min(0.8, 0.26 / FIXTURE_R[kind]), ly = EG_LAMP.h, px = x + s * 0.8;
  if (kind === 'lantern') {
    const base = ly - EG_FIXTURE_FLAME.lantern * k;
    lathe(W, K.shaft, ID, px, 0, z, [[0, -10 - 3 * h01(seed, 34)], [0.2, -9.5 - 3 * h01(seed, 34)], [0.15, base - 0.05], [0, base]], 6, { vOf: (yy) => -yy / 2 });
    fixture(W, { x: px, z, a: 0, flame: [x, ly, z], fk: k }, kind, base, lite);
    return;
  }
  const base = ly - EG_FIXTURE_FLAME[kind] * k;
  lathe(W, K.shaft, ID, px, 0, z, [[0, -10 - 3 * h01(seed, 34)], [0.2, -9.5 - 3 * h01(seed, 34)], [0.15, base - 0.1], [0.18, base - 0.02], [0, base]], 6, { vOf: (yy) => -yy / 2 });
  beam(W, K.fixture, [px, base - 0.06, z], [x, base - 0.06, z], 0.1, 0.1, { v0: EG_FIXTURE_V.body[0], v1: EG_FIXTURE_V.body[1] });
  beam(W, K.fixture, [px, base - 0.75, z], [lerp(px, x, 0.7), base - 0.08, z], 0.06, 0.06, { v0: EG_FIXTURE_V.body[0], v1: EG_FIXTURE_V.body[1] });
  fixture(W, { x, z, a: 0, flame: [x, ly, z], fk: k }, kind, base, lite);
}
function hallRuin(W, spec, lite, tally = null) {
  const seed = hallSeed(spec), law = ruinLaw(spec), plan = egRuinColumns(spec, { lite });
  const cap = lite ? EG_RUIN.trisLite : EG_RUIN.tris, was0 = W.triangles;
  // Only `optional` pieces are dropped for the budget, so foundations, cornices, bridges, and lamp fixtures are
  // laid before them.
  const lay = (band, occ, fn, what = '', optional = false) => {
    const was = W.triangles;
    W.band(band); W.begin(); fn();
    const over = optional && W.triangles - was0 > cap;
    if (over) W.drop();
    const kept = !over && W.commit(law, occ);
    if (tally) { const e = tally[what] ?? (tally[what] = { tris: 0, kept: 0, cut: 0, over: 0 }); e.tris += W.triangles - was; e[kept ? 'kept' : over ? 'over' : 'cut']++; }
    return kept;
  };
  const pieces = (band, what) => (fn) => lay(band, false, fn, what);
  const corn = (kind) => (lite ? leanProfile(EG_CORNICES[kind]) : EG_CORNICES[kind]);
  spec.discs.forEach((d, i) => {
    if (egIsleDisc(spec, d)) return;
    const self = law.floors.find((F) => F.t === 'd' && F.i === i), band = bandAt(spec, seed, d.x, d.y ?? 0, d.z, i), ds = (seed ^ Math.imul(i + 1, 0x7fffffed)) >>> 0, kind = egKitStyle(band).cornice;
    foundation(W, pieces(band, 'foundation'), d, band, ds, lite);
    for (const run of rimRuns(law, d, self)) lay(band, false, () => { corniceRun(W, K.moulding, run.path, corn(kind), { closed: run.closed }); if (kind === 'straps') corniceSpikes(W, run.path, run.closed); }, 'cornice');
  });
  spec.bands.forEach((b, i) => {
    if (egWallBand(spec, b) || egTubeBand(b)) return;
    const self = law.floors.find((F) => F.t === 'b' && F.x0 === b.x - b.halfW && F.z0 === b.z0 && F.z1 === b.z1), band = bandAt(spec, seed, b.x, b.y ?? 0, (b.z0 + b.z1) / 2, 100 + i), y = b.y ?? 0;
    const q = b.role === 'cave' ? (spec.caves ?? []).find((c) => b.z0 >= c.z0 - 0.01 && b.z1 <= c.z1 + 0.01 && !c.open) : null, bs = (seed ^ Math.imul(i + 1, 7919)) >>> 0;
    let z0 = b.z0, z1 = b.z1;
    for (const d of spec.discs) {
      if (Math.abs(d.x - b.x) >= d.r) continue;
      const half = Math.sqrt(d.r * d.r - (b.x - d.x) ** 2);
      if (d.z <= b.z0 + 1 && d.z + half > z0) z0 = Math.min(b.z1, d.z + half);
      if (d.z >= b.z1 - 1 && d.z - half < z1) z1 = Math.max(b.z0, d.z - half);
    }
    if (z1 - z0 < 1.5) return;
    if (q) {
      const yd = Math.min(q.y, q.yB ?? q.y) - egWallFoot(q) - 0.05, hw = b.halfW + 0.65;
      for (const r of bridgeRuns(law, { ax: b.x, az: z0, bx: b.x, bz: z1, hw, yd: yd - 0.6, top: yd + 0.04 })) {
        lay(band, false, () => fbox(W, W.ashlar, frame(b.x, 0, 0), -hw, yd - 0.6, r.az, hw, yd + 0.04, r.bz, { skip: 'top' }), 'bridge');
        bridge(W, pieces(band, 'bridge'), band, bs, r, lite);
      }
      return;
    }
    bridge(W, pieces(band, 'bridge'), band, bs, { ax: b.x, az: z0, bx: b.x, bz: z1, hw: b.halfW - 0.02, yd: y - 0.92 }, lite, law);
    const kind = egKitStyle(band).cornice;
    for (const path of edgeRuns(law, b.x, b.z0, b.x, b.z1, b.halfW, y, self)) lay(band, false, () => { corniceRun(W, K.moulding, path, corn(kind)); if (kind === 'straps') corniceSpikes(W, path, false); }, 'cornice');
  });
  (spec.lanes ?? []).forEach((l, i) => {
    const self = law.floors.find((F) => F.t === 'l' && F.ax === l.ax && F.az === l.az && F.bx === l.bx && F.bz === l.bz), band = bandAt(spec, seed, (l.ax + l.bx) / 2, l.y ?? 0, (l.az + l.bz) / 2, 200 + i), y = l.y ?? 0;
    const len = Math.hypot(l.bx - l.ax, l.bz - l.az), ux = (l.bx - l.ax) / len, uz = (l.bz - l.az) / len;
    let s0 = 0, s1 = len;
    for (const d of spec.discs) {
      const px = d.x - l.ax, pz = d.z - l.az, s = px * ux + pz * uz, t = -px * uz + pz * ux;
      if (Math.abs(t) >= d.r) continue;
      const half = Math.sqrt(d.r * d.r - t * t);
      if (s < len / 2) s0 = Math.max(s0, s + half); else s1 = Math.min(s1, s - half);
    }
    if (s1 - s0 > 1.5) bridge(W, pieces(band, 'bridge'), band, (seed ^ Math.imul(i + 1, 104729)) >>> 0, { ax: l.ax + ux * s0, az: l.az + uz * s0, bx: l.ax + ux * s1, bz: l.az + uz * s1, hw: l.hw - 0.02, yd: y - 0.92 }, lite, law);
    const kind = egKitStyle(band).cornice;
    for (const path of edgeRuns(law, l.ax, l.az, l.bx, l.bz, l.hw, y, self)) lay(band, false, () => { corniceRun(W, K.moulding, path, corn(kind)); if (kind === 'straps') corniceSpikes(W, path, false); }, 'cornice');
  });
  for (const c of plan.cols) if (c.kind === 'lamp') lay(c.band, true, () => column(W, c, lite), 'lamp');
  if (spec.walk) for (let z = spec.walk.z0 + 8; z < spec.walk.z1; z += EG_LAMP.pitch) for (const s of [-1, 1]) {
    const band = bandAt(spec, seed, spec.walk.x, undefined, z, 6000 + Math.round(z));
    lay(band, true, () => walkLamp(W, s * (spec.walk.halfW + 0.3), z, s, band, lite, (seed ^ Math.imul(Math.round(z * 10) + 1, s > 0 ? 17 : 23)) >>> 0), 'lamp');
  }
  for (const q of plan.arches) lay(q.band, true, () => plateArch(W, q, (seed ^ q.key) >>> 0), 'arch', true);
  const stood = new Set(plan.cols.filter((c) => c.kind === 'lamp'));
  for (const c of plan.cols) {
    if (c.kind === 'lamp') continue;
    if (c.kind !== 'statue') { if (lay(c.band, true, () => column(W, c, lite), 'column', true)) stood.add(c); continue; }
    const yaw = Math.atan2(c.cx - c.x, c.cz - c.z), top = c.floor + 0.35 + 0.5 * h01(seed, 30, c.slot), k = formOf(c.band).statue / 3.6;
    if (lay(c.band, true, () => { plinth(W, c.x, c.z, yaw, c.foot + 8, top, (seed ^ Math.imul(c.slot + 1, 31)) >>> 0); statue(W, frame(c.x, top, c.z, yaw, k), egKitStyle(c.band).statue); }, 'statue', true)) stood.add(c);
  }
  const byDisc = new Map();
  for (const c of plan.cols) if (stood.has(c)) { const key = `${c.d}:${c.ring.toFixed(2)}`; if (!byDisc.has(key)) byDisc.set(key, []); byDisc.get(key).push(c); }
  for (const ring of byDisc.values()) {
    ring.sort((p, q) => ringAngle(p) - ringAngle(q));
    for (let j = 0; j < ring.length; j++) {
      const c = ring[j];
      if (c.kind !== 'whole' || ring.length < 2) continue;
      const nb = [ring[(j + 1) % ring.length], ring[(j - 1 + ring.length) % ring.length]].find((q) => q !== c && Math.hypot(q.x - c.x, q.z - c.z) <= 11);
      if (!nb) continue;
      const L = Math.hypot(nb.x - c.x, nb.z - c.z), share = nb.kind === 'whole' ? 1 : Math.min(4.6 / L, (nb.kind === 'statue' ? 0.4 : 0.42) + 0.22 * h01(seed, 31, c.slot));
      lay(c.band, true, () => {
        const line = entablature(W, c, nb, share, (seed ^ Math.imul(c.slot + 1, 977)) >>> 0);
        if (!lite && line.len > 2.2) banner(W, line, 0.5, Math.min(1.5, line.len - 1), 3.4 + 1.8 * h01(seed, 32, c.slot));
      }, 'entablature', true);
    }
  }
  for (const m of plan.among) { const kind = egKitStyle(m.band).among; if (kind) lay(m.band, true, () => amongThing(W, m, kind, lite), 'among', true); }
}

function packRuin(W, ox, oz) {
  const bs = W.buckets();
  let verts = 0;
  for (const g of bs) verts += g.v;
  const positions = new Float32Array(verts * 3), normals = new Float32Array(verts * 3), uvs = new Float32Array(verts * 2), indices = new Uint32Array(verts), subMeshes = [], first = new Map();
  let v = 0;
  for (const g of bs) {
    first.set(g.key, { sub: subMeshes.length, v });
    for (let i = 0; i < g.v; i++) { positions[(v + i) * 3] = g.p[i * 3] + ox; positions[(v + i) * 3 + 1] = g.p[i * 3 + 1]; positions[(v + i) * 3 + 2] = g.p[i * 3 + 2] + oz; }
    normals.set(g.n.subarray(0, g.v * 3), v * 3); uvs.set(g.uv.subarray(0, g.v * 2), v * 2);
    for (let i = 0; i < g.v; i++) indices[v + i] = v + i;
    subMeshes.push({ textureArchive: egBandArchive(g.band), textureRecord: g.rec, startIndex: v, primitiveCount: g.v / 3 });
    v += g.v;
  }
  const occluders = W.pieces.map(({ runs, b }) => ({ b: [b[0] + ox, b[1], b[2] + oz, b[3] + ox, b[4], b[5] + oz], r: runs.map(([key, tri, n]) => { const s = first.get(key); return [s.sub, s.v + tri * 3, n]; }) }));
  return { positions, normals, uvs, indices, subMeshes, occluders };
}
function sphereOf(P) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  if (!(x0 <= x1)) return [0, 0, 0, 0];
  return [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2];
}

/**
 * @param {number} seed
 * @param {number} c
 * @param {number} [geo]
 * @param {{ lite?: boolean }} [opts]
 * @returns {Array<{ h: number, x0: number, model: any, sphere: number[] }>}
 */
export function buildEgRuinParts(seed, c, geo = 0, { lite = false } = {}) {
  const out = [];
  for (const spec of egCircleSpecs(seed, c, geo)) {
    const W = ruinWriter();
    W.band(egBandOfHall(spec.h));
    if (EG_BRINK_HALLS.includes(spec.h)) W.ashlar = K.voussoir;
    hallRuin(W, spec, lite);
    const model = packRuin(W, SD_REALM_ORIGIN[0] + spec.x0, SD_REALM_ORIGIN[2]);
    out.push({ h: spec.h, x0: spec.x0, model, sphere: sphereOf(model.positions) });
  }
  return out;
}
/**
 * @param {number} seed
 * @param {number} c
 * @param {number} [geo]
 * @param {{ lite?: boolean }} [opts]
 */
export function egRuinBudget(seed, c, geo = 0, { lite = false } = {}) {
  return egCircleSpecs(seed, c, geo).map((spec) => {
    const W = ruinWriter(), kinds = {};
    W.band(egBandOfHall(spec.h));
    if (EG_BRINK_HALLS.includes(spec.h)) W.ashlar = K.voussoir;
    hallRuin(W, spec, lite, kinds);
    return { h: spec.h, kind: spec.kind, tris: W.triangles, draws: W.buckets().length, kinds };
  });
}
// A host must put up the dress of every band returned here before drawing; a Brink circle also wears the band
// above.
export function egRuinBands(c) {
  const band = egBandOfHall(5 * (c - 1) + 1);
  return EG_BRINK_HALLS.includes(5 * (c - 1) + 1) && band > 0 ? [band - 1, band] : [band];
}
export const egRuinLampTint = (band) => egAtmosOf(band).lamp;
export const egRuinLaw = (spec) => ruinLaw(spec);
export { onFloor as egRuinOnFloor, topOf as egRuinTopOf };
void rng;
