// @ts-check
import {
  KT_ANCHOR, KT_WAIST, KT_GALLERY, KT_LANDING, KT_HOLD, KT_HATCH, KT_HOLD_HATCH, KT_QUARTER_WALL, KT_ANCHOR_LIFT, KT_LIFT, KT_MAIN_TOP, KT_YARD,
  KT_LINE, KT_LINE_LAND, KT_RAIL_R, railRuns, KT_GUN_ZS, KT_GUN_DEPTH, KT_COURSE, KT_COURSE_SPEC, KT_GANGWAY, KT_BRIDGE, KT_HELM, KT_CONSOLE, KT_RESONATORS, KT_BRIDGE_CRADLES, KT_SECTIONS, sectionAt, KT_CABIN,
  KT_CABIN_DOOR, KT_VAULT, KT_STERN_LIFT, KT_WAIST_COVER, KT_WARDEN_POSTS, KT_ENGINE, KT_SOCKETS, KT_CRADLES, KT_VENTS, KT_HAMMER, KT_STEAM,
  KT_ARCS, KT_DECK_H, KT_MAIN_MAST, KT_BOW, deckToDungeon,
} from '../../net/ketch/ketchDeck.js';
import { faces } from '../gateModel.js';
import { ketchKit, packKetchFaces, packKetchHit, KT_TILE_M } from './ketchKit.js';
import { KT_REC as R, KT_NET_M } from './ketchArt.js';

export const KT_FLOOR_T = 0.3;
export const KT_BULWARK = Object.freeze({ h: 1.4, t: 0.35 });
export const KT_NET_TOP = 7;
// Collider-only lid at KT_NET_TOP over the netted decks, so a body cannot climb out over the quarter wall or the
// nets.
export const KT_LID_Y = KT_NET_TOP;
export const KT_RAIL_H = 1.1;
export const KT_HIGH_NET = 3.4;
export const KT_HOUSE = Object.freeze({ x: 11, z0: KT_QUARTER_WALL.z + 0.6, z1: 170, eave: 8, ridge: 12.5 });
export const KT_HULL = Object.freeze({ bilge: -14, keel: -20, fin: -25, rub: -2 });
// Returns false for the hull run the anchor-lift cage rises past, so the cage never meets the hull collider.
export function hullRunSolid(a, b) {
  const L = KT_ANCHOR_LIFT, dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((L.x - a[0]) * dx + (L.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(a[0] + dx * t - L.x, a[1] + dz * t - L.z) > L.r + 1;
}
export const KT_CAGE = Object.freeze({ half: 2.6, h: 2.8, peak: 4.4 });
// The cage floor sits this far above its zero so it is never coplanar with the hold floor at the lift's foot.
export const KT_CAGE_LIFT_M = 0.02;

export const KT_SHAFT = Object.freeze({ t: 0.3, door: Object.freeze({ z0: KT_LIFT.z - 2, z1: KT_LIFT.z + 2, h: 3.2 }) });
export const KT_MASTS = Object.freeze([
  Object.freeze({ x: KT_MAIN_MAST.x, z: KT_MAIN_MAST.z, y0: 0, y1: 52, r: KT_MAIN_MAST.r, vanes: Object.freeze([24, 48, 26]) }),
  Object.freeze({ x: 0, z: 140, y0: KT_HOUSE.ridge, y1: 42, r: 0.65, vanes: Object.freeze([22, 38, KT_COURSE_SPEC.start.x]) }),
]);
export const KT_VANE_DZ = 1.2;
export const KT_JACKSTAY = Object.freeze({
  x: KT_COURSE_SPEC.start.x,
  fore: Object.freeze({ y: (KT_MASTS[0].vanes[0] + KT_MASTS[0].vanes[1]) / 2, z: KT_MASTS[0].z + KT_VANE_DZ }),
  aft: Object.freeze({ y: (KT_MASTS[1].vanes[0] + KT_MASTS[1].vanes[1]) / 2, z: KT_MASTS[1].z + KT_VANE_DZ }),
});
export function jackstayY(z) {
  const { fore: a, aft: b } = KT_JACKSTAY;
  return a.y + ((b.y - a.y) * (z - a.z)) / (b.z - a.z);
}
export const KT_GROUND = Object.freeze({ y: -260, tile: 420, half: 3200 });
// The city is eight blocks a side (819.2 m), so 700 m east places the anchor-lift about 290 m outside the east
// wall.
export const KT_STATION = Object.freeze({ x: 700, z: -140 });
export const KT_CITY = Object.freeze({ x: -KT_STATION.x, z: -KT_STATION.z, r: 400, towers: 24, houses: 340, seed: 0x6b1c });
export const KT_LAMP = Object.freeze({ color: Object.freeze([1.0, 0.8, 0.5]), below: Object.freeze([1.0, 0.7, 0.4]), range: 11, rangeBelow: 9, glass: 0.16 });

const BRIDGE_C = KT_BRIDGE;
export function ketchHullOutline(steps = 10) {
  const out = [[-4, 0], [4, 0], [8, 6], [KT_ANCHOR.x1, KT_ANCHOR.z1], [KT_WAIST.x1, KT_WAIST.z0]];
  const joinA = Math.atan2(KT_WAIST.x1, -Math.sqrt(BRIDGE_C.r ** 2 - KT_WAIST.x1 ** 2));
  const cabinA = Math.atan2(KT_CABIN.x1, Math.sqrt(BRIDGE_C.r ** 2 - KT_CABIN.x1 ** 2));
  const arc = (a0, a1) => { for (let k = 0; k <= steps; k++) { const a = a0 + ((a1 - a0) * k) / steps; out.push([BRIDGE_C.x + Math.sin(a) * BRIDGE_C.r, BRIDGE_C.z + Math.cos(a) * BRIDGE_C.r]); } };
  arc(joinA, cabinA);
  out.push([KT_CABIN.x1, KT_CABIN.z1], [KT_CABIN.x0, KT_CABIN.z1]);
  arc(-cabinA, -joinA);
  out.push([KT_WAIST.x0, KT_WAIST.z0], [KT_ANCHOR.x0, KT_ANCHOR.z1], [-8, 6]);
  return out;
}

// `rowDz` keeps each glass clear of the hammer wind-up, and `holdDrop` keeps the floor pool of a hold lamp under
// KT_LADDER.below.telegraphFloor.
export const KT_HUNG_LAMPS = Object.freeze({
  rowDz: 1.8, wayOnZ: 62.5, cradleX: 7, middleZ: Object.freeze([112, 126, 100]), engine: 4.5,
  landing: Object.freeze({ x: 5, z: Object.freeze([114, 124]) }), drop: 1.7, holdDrop: 0.8,
});
export function ketchLampSpots() {
  const up = [], below = [], cabin = [];
  for (const z of [20, 32, 44, 56]) for (const x of [KT_WAIST.x0 + KT_BULWARK.t + 0.2, KT_WAIST.x1 - KT_BULWARK.t - 0.2]) up.push([x, 2.3, z]);
  up.push([-3.2, 3.6, KT_QUARTER_WALL.z - 0.4], [3.2, 3.6, KT_QUARTER_WALL.z - 0.4], [-6, 2.3, 8], [6, 2.3, 8]);
  const HL = KT_HUNG_LAMPS, gCeil = -KT_FLOOR_T, hCeil = KT_GALLERY.y - KT_FLOOR_T;
  for (const z of [HL.wayOnZ, ...KT_HAMMER.rows.map((r) => r + HL.rowDz)]) below.push([0, gCeil - HL.drop, z, gCeil]);
  for (const z of HL.landing.z) for (const sx of [-1, 1]) below.push([sx * HL.landing.x, gCeil - HL.holdDrop, z, gCeil]);
  for (const [x, z] of KT_CRADLES) below.push([Math.sign(x) * HL.cradleX, hCeil - HL.holdDrop, z, hCeil]);
  for (const z of HL.middleZ) below.push([0, hCeil - HL.holdDrop, z, hCeil]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) below.push([KT_ENGINE.x + sx * HL.engine, hCeil - HL.holdDrop, KT_ENGINE.z + sz * HL.engine, hCeil]);
  up.push([KT_MAIN_TOP.x - 4.2, KT_MAIN_TOP.y + 2.4, KT_MAIN_TOP.z - 4.2], [KT_MAIN_TOP.x + 4.2, KT_MAIN_TOP.y + 2.4, KT_MAIN_TOP.z + 4.2]);
  up.push([KT_COURSE_SPEC.start.x, KT_COURSE_SPEC.start.y + 2.4, KT_COURSE_SPEC.start.z + 2.4]);
  for (let k = 0; k < 8; k++) { const a = (k + 0.5) * (Math.PI / 4); up.push([BRIDGE_C.x + Math.sin(a) * (BRIDGE_C.core - 0.6), 2.6, BRIDGE_C.z + Math.cos(a) * (BRIDGE_C.core - 0.6)]); }
  cabin.push([-4, 3.6, KT_CABIN.z0 + 3], [4, 3.6, KT_CABIN.z1 - 3]);
  return { up, below, cabin };
}
export function ketchLights() {
  const { up, below, cabin } = ketchLampSpots();
  const L = (p, color, range, zone) => { const [x, y, z] = deckToDungeon(p[0], p[1], p[2]); return { x, y, z, range, color: [...color], zone }; };
  return [...up.map((p) => L(p, KT_LAMP.color, KT_LAMP.range, 'deck')), ...below.map((p) => L(p, KT_LAMP.below, KT_LAMP.rangeBelow, 'below')), ...cabin.map((p) => L(p, KT_LAMP.below, KT_LAMP.rangeBelow, 'cabin'))];
}

function lamp(K, p) {
  const g = KT_LAMP.glass;
  K.box(R.lamp, p[0] - g, p[0] + g, p[1] - g, p[1] + g, p[2] - g, p[2] + g);
  K.box(R.brass, p[0] - g * 1.3, p[0] + g * 1.3, p[1] + g, p[1] + g + 0.06, p[2] - g * 1.3, p[2] + g * 1.3);
  if (p.length > 3) K.box(R.brass, p[0] - 0.03, p[0] + 0.03, p[1] + g + 0.06, p[3], p[2] - 0.03, p[2] + 0.03, { skip: ['top'] });
  else K.box(R.brass, p[0] - 0.03, p[0] + 0.03, p[1] - g - 0.5, p[1] - g, p[2] - 0.03, p[2] + 0.03, { skip: ['bottom'] });
}
export function ketchAftDeck(n = 16) {
  const B = KT_BRIDGE, X = KT_WAIST.x1, z0 = KT_HOUSE.z1, a = Math.asin(X / B.r), pts = [[0, z0], [X, z0]];
  for (let k = 0; k <= n; k++) { const t = Math.PI - a + (2 * a * k) / n; pts.push([B.x + Math.sin(t) * B.r, B.z + Math.cos(t) * B.r]); }
  pts.push([-X, z0]);
  return pts;
}

function bulwark(K, pts, y, inside, net = KT_NET_TOP) {
  const B = KT_BULWARK;
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i], q = pts[i + 1], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (L < 1e-6) continue;
    let nx = -(q[1] - p[1]) / L, nz = (q[0] - p[0]) / L;
    const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
    if ((inside[0] - mx) * nx + (inside[1] - mz) * nz < 0) { nx = -nx; nz = -nz; }
    const ip = [p[0] + nx * B.t, p[1] + nz * B.t], iq = [q[0] + nx * B.t, q[1] + nz * B.t];
    K.quad(R.iron, [ip[0], y, ip[1]], [iq[0], y, iq[1]], [iq[0], y + B.h, iq[1]], [ip[0], y + B.h, ip[1]], [nx, 0, nz], null, true);
    K.quad(R.brass, [p[0], y + B.h, p[1]], [q[0], y + B.h, q[1]], [iq[0], y + B.h, iq[1]], [ip[0], y + B.h, ip[1]], [0, 1, 0]);
    if (net > B.h) {
      K.quad2(R.net, [p[0], y + B.h, p[1]], [q[0], y + B.h, q[1]], [q[0], y + net, q[1]], [p[0], y + net, p[1]], [nx, 0, nz], [[0, 0], [L / KT_NET_M, 0], [L / KT_NET_M, (net - B.h) / KT_NET_M], [0, (net - B.h) / KT_NET_M]]);
      K.quad(null, [ip[0], y, ip[1]], [iq[0], y, iq[1]], [iq[0], y + net, iq[1]], [ip[0], y + net, ip[1]], [nx, 0, nz], null, true);
      K.pipe(R.brass, [p[0], y + net, p[1]], [q[0], y + net, q[1]], 0.05, 6);
      const m = Math.max(1, Math.round(L / 4));
      for (let k = 0; k <= m; k++) { const x = p[0] + ((q[0] - p[0]) * k) / m, z = p[1] + ((q[1] - p[1]) * k) / m; K.pipe(R.brass, [x, y + B.h, z], [x, y + net, z], 0.06, 6); }
    }
  }
}

export function ketchCheckpointChains(c) {
  const head = [KT_JACKSTAY.x, jackstayY(c.z), c.z], out = [];
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 + Math.PI / 2; out.push([[c.x + Math.sin(a) * (c.r - 0.3), c.y + 0.1, c.z + Math.cos(a) * (c.r - 0.3)], head]); }
  return out;
}

export function ketchGangwaySill() {
  const W = KT_GANGWAY, L = Math.hypot(W.bx - W.ax, W.bz - W.az), ux = (W.bx - W.ax) / L, uz = (W.bz - W.az) / L, h = W.w / 2 + 0.1;
  const at = (s, u) => [W.ax - uz * s * h + ux * u, W.az + ux * s * h + uz * u];
  return [at(1, -0.3), at(1, 0.1), at(-1, 0.1), at(-1, -0.3)];
}

// Lamps are a separate shadowless mesh because glass inside the ship mesh blocks its own cube shadow map and lights
// nothing.
export function buildKetchShip() {
  const hit = [];
  const K = ketchKit({ f: faces(), hit });
  const T = KT_FLOOR_T, B = KT_BULWARK;

  const outline = ketchHullOutline();
  const cxz = [0, 118];
  const toward = (p, k) => [p[0] + (cxz[0] - p[0]) * k, p[1] + (cxz[1] - p[1]) * k];
  const bilge = outline.map((p) => [p[0] * 0.94, p[1] + (p[1] < 60 ? 1.2 : p[1] > 200 ? -1.2 : 0)]);
  const keel = outline.map((p) => [p[0] * 0.32, Math.max(8, Math.min(230, p[1]))]);
  for (let i = 0; i < outline.length; i++) {
    const j = (i + 1) % outline.length, a = outline[i], b = outline[j], c = bilge[i], d = bilge[j], e = keel[i], g = keel[j];
    const out = [(a[0] + b[0]) / 2 - cxz[0], 0, (a[1] + b[1]) / 2 - cxz[1]];
    K.quad(R.hull, [a[0], B.h, a[1]], [b[0], B.h, b[1]], [d[0], KT_HULL.bilge, d[1]], [c[0], KT_HULL.bilge, c[1]], out);
    // Below the deck only the hull sides are solid, never the run the anchor-lift cage rides through. The bilge and
    // keel are drawn only, so a fall inside the hull reaches the void cast-back.
    if (hullRunSolid(a, b)) { const k = (B.h + T) / (B.h - KT_HULL.bilge), pa = [a[0] + (c[0] - a[0]) * k, a[1] + (c[1] - a[1]) * k], pb = [b[0] + (d[0] - b[0]) * k, b[1] + (d[1] - b[1]) * k]; K.quad(null, [pa[0], -T, pa[1]], [pb[0], -T, pb[1]], [d[0], KT_HULL.bilge, d[1]], [c[0], KT_HULL.bilge, c[1]], out, null, true); }
    K.quad(R.hull, [c[0], KT_HULL.bilge, c[1]], [d[0], KT_HULL.bilge, d[1]], [g[0], KT_HULL.keel, g[1]], [e[0], KT_HULL.keel, e[1]], [out[0], -0.8, out[2]]);
    const lift = (p, k) => { const L = Math.hypot(p[0] - cxz[0], p[1] - cxz[1]) || 1; return [p[0] + ((p[0] - cxz[0]) / L) * k, p[1] + ((p[1] - cxz[1]) / L) * k]; };
    const ra = lift(a, 0.08), rb = lift(b, 0.08);
    K.quad(R.gilt, [ra[0], KT_HULL.rub - 0.25, ra[1]], [rb[0], KT_HULL.rub - 0.25, rb[1]], [rb[0], KT_HULL.rub + 0.25, rb[1]], [ra[0], KT_HULL.rub + 0.25, ra[1]], out);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L > 20) for (let s = 6; s < L - 3; s += 6) for (const y of [KT_GALLERY.y + 2.6, KT_HOLD.y + 2.8]) {
      const t0 = (s - 0.5) / L, t1 = (s + 0.5) / L, k = y < KT_GALLERY.y ? 1 - (KT_GALLERY.y - y) / 20 : 1;
      const pa = lift([a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], 0.05 * k), pb = lift([a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1], 0.05 * k);
      K.quad(R.glass, [pa[0], y - 0.5, pa[1]], [pb[0], y - 0.5, pb[1]], [pb[0], y + 0.5, pb[1]], [pa[0], y + 0.5, pa[1]], out);
    }
  }
  K.fan(R.hull, keel.slice().reverse(), KT_HULL.keel, [0, -1, 0]);
  K.quad2(R.hull, [0, KT_HULL.keel, 14], [0, KT_HULL.keel, 214], [0, KT_HULL.fin, 196], [0, KT_HULL.fin, 30], [1, 0, 0]);
  for (const s of [-1, 1]) {
    K.quad2(R.vane, [s * 12.6, -7, 118], [s * 12.6, -7, 150], [s * 34, -10, 156], [s * 36, -9, 126], [0, 1, 0], [[0.5, 1], [0.5, 1], [1, 0], [0, 0]]);
    K.quad2(R.vane, [s * 20, -6, 206], [s * 18, -6, 226], [s * 30, -9, 236], [s * 34, -8, 214], [0, 1, 0], [[0.5, 1], [0.5, 1], [1, 0], [0, 0]]);
    const hx = s * 22, hy = -9, hz0 = 70, hz1 = 112;
    K.pipe(R.brass, [hx, hy, hz0], [hx, hy, hz1], 1.6, 12, { caps: true });
    K.cone(R.brass, [hx, hy, hz1 + 6], [hx, hy, hz1 - 2], 3.4, 12);
    K.cone(R.copper, [hx, hy, hz0], [hx, hy, hz0 - 6], 1.6, 12);
    K.pipe(R.iron, [s * 12.8, -4, 84], [hx, hy, 84], 0.35, 6);
    K.pipe(R.iron, [s * 12.8, -4, 100], [hx, hy, 100], 0.35, 6);
  }
  K.pipe(R.brass, [0, 1.2, 1], [0, 8, -20], 0.5, 10, { caps: true });
  K.cone(R.gilt, [0, 8, -20], [0, 9.2, -25], 0.9, 10);
  K.pipe(R.iron, [0, B.h, 1.5], [0, 9, 1.5], 0.25, 8);
  K.pipe(R.iron, [0, 9, 1.5], [0, 9, KT_ANCHOR_LIFT.z], 0.2, 6);

  const W0 = KT_BOW, bow = [[-W0.tip, 0], [W0.tip, 0], [W0.beam, W0.at], [KT_ANCHOR.x1, KT_ANCHOR.z1], [KT_ANCHOR.x0, KT_ANCHOR.z1], [-W0.beam, W0.at]];
  K.fan(R.deck, bow, 0, [0, 1, 0], true);
  const shaft = [KT_LIFT.x - KT_LIFT.half, KT_LIFT.x + KT_LIFT.half, KT_LIFT.z - KT_LIFT.half, KT_LIFT.z + KT_LIFT.half];
  const hatch = [KT_HATCH.x0, KT_HATCH.x1, KT_HATCH.z0, KT_HATCH.z1];
  K.slabWithHoles(R.deck, KT_WAIST.x0, KT_WAIST.x1, KT_WAIST.z0, KT_QUARTER_WALL.z, 0, [hatch, shaft], [0, 1, 0], true);
  for (const s of [-1, 1]) K.quad(R.deck, [s * KT_HOUSE.x, 0, KT_HOUSE.z0], [s * KT_WAIST.x1, 0, KT_HOUSE.z0], [s * KT_WAIST.x1, 0, KT_HOUSE.z1], [s * KT_HOUSE.x, 0, KT_HOUSE.z1], [0, 1, 0], null, true);
  K.fan(R.deck, ketchAftDeck(), 0, [0, 1, 0], true);
  const meet = KT_BRIDGE.z - Math.sqrt(KT_BRIDGE.r * KT_BRIDGE.r - KT_WAIST.x1 * KT_WAIST.x1);
  const fore = [[KT_WAIST.x0, meet], [KT_WAIST.x0, KT_WAIST.z0], [KT_ANCHOR.x0, KT_ANCHOR.z1], [-W0.beam, W0.at], [-W0.tip, 0], [W0.tip, 0], [W0.beam, W0.at], [KT_ANCHOR.x1, KT_ANCHOR.z1], [KT_WAIST.x1, KT_WAIST.z0], [KT_WAIST.x1, meet]];
  bulwark(K, fore, 0, [0, 30]);
  K.fan(null, bow, KT_LID_Y, [0, -1, 0], true);
  K.slabWithHoles(null, KT_WAIST.x0, KT_WAIST.x1, KT_WAIST.z0, KT_QUARTER_WALL.z, KT_LID_Y, [shaft], [0, -1, 0], true);
  for (const c of KT_WAIST_COVER.capstans) {
    K.cyl(R.iron, c.x, c.z, c.r, 0, c.h * 0.6, 14, { top: false, solid: true });
    K.cyl(R.brass, c.x, c.z, c.r * 0.82, c.h * 0.6, c.h, 14, { solid: true, capRec: R.gear });
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; K.pipe(R.iron, [c.x, c.h * 0.85, c.z], [c.x + Math.sin(a) * (c.r + 0.7), c.h * 0.85, c.z + Math.cos(a) * (c.r + 0.7)], 0.06, 6); }
  }
  for (const c of KT_WAIST_COVER.covers) {
    K.box(R.iron, c.x - c.w / 2, c.x + c.w / 2, 0, c.h, c.z - c.d / 2, c.z + c.d / 2, { skip: ['bottom'], solid: true, recs: { top: R.grate } });
    K.box(R.brass, c.x - c.w / 2 - 0.05, c.x + c.w / 2 + 0.05, c.h - 0.08, c.h + 0.02, c.z - c.d / 2 - 0.05, c.z + c.d / 2 + 0.05, { skip: ['bottom', 'top'] });
  }
  const AL = KT_ANCHOR_LIFT;
  K.sector(R.brass, AL.x, AL.z, 0, AL.r, 0, Math.PI * 2, 0.02, 24, { faceUv: true });
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; K.pipe(R.brass, [AL.x + Math.sin(a) * AL.r, 0, AL.z + Math.cos(a) * AL.r], [AL.x + Math.sin(a) * AL.r, 3, AL.z + Math.cos(a) * AL.r], 0.06, 6); }
  for (let k = 0; k < 24; k++) { const a0 = (k / 24) * Math.PI * 2, a1 = ((k + 1) / 24) * Math.PI * 2; K.pipe(R.brass, [AL.x + Math.sin(a0) * AL.r, 3, AL.z + Math.cos(a0) * AL.r], [AL.x + Math.sin(a1) * AL.r, 3, AL.z + Math.cos(a1) * AL.r], 0.07, 5); }
  K.pipe(R.chain, [AL.x, 3, AL.z], [AL.x, 9, AL.z], 0.12, 4);
  K.box(R.stone, KT_WAIST.x0, KT_WAIST.x1, 0, KT_QUARTER_WALL.h, KT_QUARTER_WALL.z, KT_QUARTER_WALL.z + 0.6, { skip: ['bottom'], solid: true });
  K.box(R.gilt, -1.9, 1.9, 0, 4, KT_QUARTER_WALL.z - 0.12, KT_QUARTER_WALL.z, { skip: ['bottom', 'pz'] });
  K.box(R.iron, -1.5, 1.5, 0, 3.6, KT_QUARTER_WALL.z - 0.18, KT_QUARTER_WALL.z - 0.12, { skip: ['bottom', 'pz'] });
  K.cyl(R.gear, 0, KT_QUARTER_WALL.z - 0.2, 0.9, 1.4, 1.42, 16);
  const H = KT_HATCH;
  K.box(R.brass, H.x0 - 0.2, H.x0, 0, 0.35, H.z0, H.z1 + 0.2, { skip: ['bottom'], solid: true });
  K.box(R.brass, H.x1, H.x1 + 0.2, 0, 0.35, H.z0, H.z1 + 0.2, { skip: ['bottom'], solid: true });
  K.box(R.brass, H.x0, H.x1, 0, 0.35, H.z1, H.z1 + 0.2, { skip: ['bottom'], solid: true });
  K.rail([[H.x0 - 0.1, H.z0], [H.x0 - 0.1, H.z1]], 0.35, { h: 0.8, postRec: R.brass, barRec: R.brass });
  K.rail([[H.x1 + 0.1, H.z0], [H.x1 + 0.1, H.z1]], 0.35, { h: 0.8, postRec: R.brass, barRec: R.brass });
  K.stairs(R.deck, H.x0, H.x1, H.z0, H.z1, H.y0 - T, H.y1, 20, { riserRec: R.brass, soffitRec: R.iron });
  for (const x of [H.x0, H.x1]) K.quad(R.iron, [x, -T, H.z0], [x, -T, H.z1], [x, 0, H.z1], [x, 0, H.z0], [x < 0 ? 1 : -1, 0, 0]);

  const HO = KT_HOUSE;
  K.box(R.stone, -HO.x, HO.x, 0, HO.eave, HO.z0, HO.z1, { skip: ['bottom', 'top'], recs: { nz: R.stone }, solid: true });
  for (let k = 0; k < 8; k++) {
    const a0 = (k / 8) * (Math.PI / 2), a1 = ((k + 1) / 8) * (Math.PI / 2);
    for (const s of [-1, 1]) {
      const x0 = s * HO.x * Math.cos(a0), x1 = s * HO.x * Math.cos(a1), y0 = HO.eave + (HO.ridge - HO.eave) * Math.sin(a0), y1 = HO.eave + (HO.ridge - HO.eave) * Math.sin(a1);
      K.quad(R.hull, [x0, y0, HO.z0], [x1, y1, HO.z0], [x1, y1, HO.z1], [x0, y0, HO.z1], [s * Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2), 0], null, true);
      for (const z of [HO.z0, HO.z1]) K.tri(R.stone, [x0, y0, z], [x1, y1, z], [0, HO.eave, z], [0, 0], [1, 0], [0.5, 1], [0, 0, z === HO.z0 ? -1 : 1], true);
    }
  }
  for (const s of [-1, 1]) {
    for (let z = HO.z0 + 6; z < HO.z1 - 3; z += 8) K.quad(R.glass, [s * (HO.x + 0.03), 3, z - 1.2], [s * (HO.x + 0.03), 3, z + 1.2], [s * (HO.x + 0.03), 5.4, z + 1.2], [s * (HO.x + 0.03), 5.4, z - 1.2], [s, 0, 0]);
    K.pipe(R.copper, [s * (HO.x + 0.4), 6.6, HO.z0], [s * (HO.x + 0.4), 6.6, HO.z1], 0.3, 8);
    K.pipe(R.copper, [s * (HO.x + 0.4), 1.4, HO.z0], [s * (HO.x + 0.4), 1.4, HO.z1], 0.22, 8);
  }

  const G = KT_GALLERY, LA = KT_LANDING, gy = G.y, ceil = -T;
  const holdHatch = [KT_HOLD_HATCH.x0, KT_HOLD_HATCH.x1, KT_HOLD_HATCH.z0, KT_HOLD_HATCH.z1];
  K.slabWithHoles(R.deck, G.x0, G.x1, G.z0, G.z1, gy, [], [0, 1, 0], true);
  K.slabWithHoles(R.deck, LA.x0, LA.x1, LA.z0, LA.z1, gy, [holdHatch], [0, 1, 0], true);
  // Solid so a classic climb up a gun deck wall stops at the ceiling.
  K.slabWithHoles(R.iron, G.x0, G.x1, G.z0, G.z1, ceil, [hatch], [0, -1, 0], true);
  K.slabWithHoles(R.iron, LA.x0, LA.x1, LA.z0, LA.z1, ceil, [], [0, -1, 0], true);
  for (let z = G.z0 + 3; z < LA.z1; z += 6) { const x0 = z >= LA.z0 ? LA.x0 : G.x0, x1 = z >= LA.z0 ? LA.x1 : G.x1; K.box(R.brass, x0, x1, ceil - 0.35, ceil, z - 0.2, z + 0.2, { skip: ['top'] }); }
  const wall = (rec, a, b, y0, y1, inward) => K.quad(rec, [a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], inward, null, true);
  wall(R.iron, [G.x0, G.z0], [G.x0, LA.z0], gy, ceil, [1, 0, 0]);
  wall(R.iron, [G.x1, G.z0], [G.x1, LA.z0], gy, ceil, [-1, 0, 0]);
  wall(R.iron, [G.x0, G.z0], [G.x1, G.z0], gy, ceil, [0, 0, 1]);
  wall(R.iron, [LA.x0, LA.z0], [G.x0, LA.z0], gy, ceil, [0, 0, 1]);
  wall(R.iron, [G.x1, LA.z0], [LA.x1, LA.z0], gy, ceil, [0, 0, 1]);
  wall(R.iron, [LA.x0, LA.z0], [LA.x0, LA.z1], gy, ceil, [1, 0, 0]);
  wall(R.iron, [LA.x1, LA.z0], [LA.x1, LA.z1], gy, ceil, [-1, 0, 0]);
  wall(R.stone, [LA.x0, LA.z1], [LA.x1, LA.z1], gy, ceil, [0, 0, -1]);
  for (const z of KT_GUN_ZS) for (const s of [-1, 1]) {
    const x = s > 0 ? G.x1 : G.x0, y = gy + 1.5;
    K.box(R.brass, x - s * 0.05, x, y - 0.75, y + 0.75, z - 0.75, z + 0.75, { skip: [s > 0 ? 'px' : 'nx'] });
    K.pipe(R.iron, [x - s * 1.25, y, z], [x, y, z], 0.32, 10, { caps: true });
    K.box(R.iron, Math.min(x - s * KT_GUN_DEPTH, x - s * 0.1), Math.max(x - s * KT_GUN_DEPTH, x - s * 0.1), gy, y - 0.2, z - 0.55, z + 0.55, { skip: ['bottom'], solid: true });
  }
  for (const z of KT_HAMMER.rows) for (const x of KT_HAMMER.lanes) {
    K.box(R.iron, x - 1.0, x + 1.0, ceil - 1.1, ceil, z - 1.0, z + 1.0, { skip: ['top'] });
    K.cyl(R.brass, x, z, 0.55, ceil - 1.5, ceil - 1.1, 10, { top: false, bottom: true });
  }
  for (const s of [-1, 1]) {
    const x = s * (G.x1 - 0.35);
    K.pipe(R.copper, [x, ceil - 0.8, G.z0], [x, ceil - 0.8, LA.z0], 0.24, 8);
    for (const z of KT_STEAM.z) {
      K.pipe(R.copper, [x, ceil - 0.8, z], [x, gy + 0.7, z], 0.2, 8);
      K.box(R.grate, x - 0.25, x + 0.25, gy + 0.2, gy + 0.9, z - KT_STEAM.w / 2, z + KT_STEAM.w / 2, { skip: ['bottom'] });
    }
  }
  for (const [x, z] of KT_WARDEN_POSTS) K.sector(R.brass, x, z, 1.4, 1.7, 0, Math.PI * 2, gy + 0.01, 20);
  const HH = KT_HOLD_HATCH;
  K.box(R.brass, HH.x0 - 0.2, HH.x0, gy, gy + 0.35, HH.z0, HH.z1 + 0.2, { skip: ['bottom'], solid: true });
  K.box(R.brass, HH.x1, HH.x1 + 0.2, gy, gy + 0.35, HH.z0, HH.z1 + 0.2, { skip: ['bottom'], solid: true });
  K.box(R.brass, HH.x0, HH.x1, gy, gy + 0.35, HH.z1, HH.z1 + 0.2, { skip: ['bottom'], solid: true });
  K.stairs(R.deck, HH.x0, HH.x1, HH.z0, HH.z1, HH.y0 - T, HH.y1, 20, { riserRec: R.brass, soffitRec: R.iron });
  for (const x of [HH.x0, HH.x1]) K.quad(R.iron, [x, gy - T, HH.z0], [x, gy - T, HH.z1], [x, gy, HH.z1], [x, gy, HH.z0], [x < 0 ? 1 : -1, 0, 0]);

  const HD = KT_HOLD, hy = HD.y, hc = gy - T;
  K.slabWithHoles(R.deck, HD.x0, HD.x1, HD.z0, HD.z1, hy, [], [0, 1, 0], true);
  K.slabWithHoles(R.iron, HD.x0, HD.x1, HD.z0, HD.z1, hc, [holdHatch, shaft], [0, -1, 0], true);
  wall(R.inner, [HD.x0, HD.z0], [HD.x0, HD.z1], hy, hc, [1, 0, 0]);
  wall(R.inner, [HD.x1, HD.z0], [HD.x1, HD.z1], hy, hc, [-1, 0, 0]);
  wall(R.stone, [HD.x0, HD.z0], [HD.x1, HD.z0], hy, hc, [0, 0, 1]);
  wall(R.stone, [HD.x0, HD.z1], [HD.x1, HD.z1], hy, hc, [0, 0, -1]);
  for (let z = HD.z0 + 4; z < HD.z1; z += 6) {
    for (const s of [-1, 1]) K.box(R.iron, s > 0 ? HD.x1 - 0.35 : HD.x0, s > 0 ? HD.x1 : HD.x0 + 0.35, hy, hc, z - 0.25, z + 0.25, { skip: ['bottom', 'top'] });
    K.box(R.iron, HD.x0, HD.x1, hc - 0.35, hc, z - 0.25, z + 0.25, { skip: ['top'] });
  }
  const E = KT_ENGINE;
  K.cyl(R.iron, E.x, E.z, E.r, hy, hy + E.h, 20, { capRec: R.gear, solid: true });
  for (const y of [hy + 0.6, hy + 2.4, hy + 4.4]) K.cyl(R.brass, E.x, E.z, E.r + 0.08, y, y + 0.3, 20, { top: false });
  K.cyl(R.gear, E.x, E.z, 1.4, hy + E.h, hy + E.h + 0.25, 16, { top: true });
  for (const s of [-1, 1]) {
    K.pipe(R.copper, [E.x + s * 1.6, hy + E.h, E.z - 1], [E.x + s * 1.6, hc, E.z - 1], 0.45, 10);
    K.pipe(R.copper, [E.x + s * 2.4, hy + 3, E.z - 1.8], [s * (HD.x1 - 0.5), hy + 3, E.z - 1.8], 0.3, 8);
  }
  K.pipe(R.iron, [E.x, hy + 2.8, E.z - E.r - 0.2], [E.x, hy + 2.8, E.z - E.r - 1.2], 0.3, 8);
  K.cyl(R.gear, E.x, E.z - E.r - 1.4, 2.2, hy + 0.6, hy + 0.6, 1);
  {
    const fz = E.z - E.r - 1.3, fy = hy + 2.8, fr = 2.4, n = 20;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      const P = (a) => [E.x + Math.cos(a) * fr, fy + Math.sin(a) * fr, fz];
      const uv = (a) => [0.5 + Math.cos(a) / 2, 0.5 + Math.sin(a) / 2];
      K.tri(R.gear, [E.x, fy, fz], P(a0), P(a1), [0.5, 0.5], uv(a0), uv(a1), [0, 0, -1], true);
      K.tri(R.gear, [E.x, fy, fz], P(a0), P(a1), [0.5, 0.5], uv(a0), uv(a1), [0, 0, 1], true);
    }
  }
  for (const [x, z] of KT_SOCKETS) {
    K.cyl(R.copper, x, z, 0.42, hy, hy + 0.9, 10, { capRec: R.brass, solid: true });
    K.cyl(R.brass, x, z, 0.5, hy + 0.9, hy + 1.05, 10, { top: false });
  }
  const cradle = (x, z, y) => {
    K.box(R.iron, x - 0.6, x + 0.6, y, y + 0.7, z - 0.6, z + 0.6, { skip: ['bottom'], solid: true });
    for (const s of [-1, 1]) K.pipe(R.brass, [x + s * 0.45, y + 0.7, z], [x + s * 0.45, y + 1.8, z], 0.06, 6);
    K.pipe(R.brass, [x - 0.45, y + 1.8, z], [x + 0.45, y + 1.8, z], 0.07, 6);
  };
  for (const [x, z] of KT_CRADLES) cradle(x, z, hy);
  for (const z of KT_ARCS.z) for (const s of [-1, 1]) {
    const x = s * KT_ARCS.post;
    K.cyl(R.copper, x, z, 0.42, hy, hy + 4.2, 10, { capRec: R.brass, solid: true });
    for (let y = hy + 0.6; y < hy + 4; y += 0.5) K.cyl(R.brass, x, z, 0.5, y, y + 0.12, 10, { top: false });
    K.cone(R.brass, [x, hy + 4.2, z], [x, hy + 5, z], 0.5, 8);
  }
  for (const [x, z] of KT_VENTS) {
    const s = Math.sign(x), wx = s > 0 ? HD.x1 - 0.02 : HD.x0 + 0.02;
    K.quad(R.grate, [wx, hy, z - 1.1], [wx, hy, z + 1.1], [wx, hy + 1.6, z + 1.1], [wx, hy + 1.6, z - 1.1], [-s, 0, 0]);
    K.box(R.brass, wx - s * 0.12, wx, hy + 1.6, hy + 1.8, z - 1.3, z + 1.3);
  }

  {
    const L = KT_LIFT, t = KT_SHAFT.t, x0 = L.x - L.half, x1 = L.x + L.half, z0 = L.z - L.half, z1 = L.z + L.half, D0 = KT_SHAFT.door;
    for (const [a, b, n] of [[[x1, z0], [x1, z1], [1, 0, 0]], [[x0, z0], [x1, z0], [0, 0, -1]], [[x0, z1], [x1, z1], [0, 0, 1]]]) {
      K.quad(R.iron, [a[0], L.y0, a[1]], [b[0], L.y0, b[1]], [b[0], L.y1, b[1]], [a[0], L.y1, a[1]], n, null, true);
      const i = [a[0] - n[0] * t, a[1] - n[2] * t], j = [b[0] - n[0] * t, b[1] - n[2] * t];
      K.quad(R.iron, [i[0], L.y0, i[1]], [j[0], L.y0, j[1]], [j[0], L.y1, j[1]], [i[0], L.y1, i[1]], [-n[0], 0, -n[2]], null, true);
    }
    const west = (za, zb, ya, yb) => {
      K.quad(R.iron, [x0, ya, za], [x0, ya, zb], [x0, yb, zb], [x0, yb, za], [-1, 0, 0], null, true);
      K.quad(R.iron, [x0 + t, ya, za], [x0 + t, ya, zb], [x0 + t, yb, zb], [x0 + t, yb, za], [1, 0, 0], null, true);
    };
    west(z0, D0.z0, L.y0, L.y1); west(D0.z1, z1, L.y0, L.y1); west(D0.z0, D0.z1, L.y0 + D0.h, L.y1);
    K.box(R.brass, x0 - 0.15, x0 + t + 0.15, L.y0 + D0.h, L.y0 + D0.h + 0.3, D0.z0 - 0.2, D0.z1 + 0.2);
    for (const z of [D0.z0 - 0.1, D0.z1 + 0.1]) K.box(R.brass, x0 - 0.15, x0 + t + 0.15, L.y0, L.y0 + D0.h, z - 0.1, z + 0.1);
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) K.box(R.brass, x - 0.2, x + 0.2, L.y0, L.y1 + 0.1, z - 0.2, z + 0.2, { skip: ['bottom'] });
    K.rail([[x0, z0 - 0.15], [x1 + 0.15, z0 - 0.15], [x1 + 0.15, z1 + 0.15], [x0, z1 + 0.15]], L.y1, { h: KT_RAIL_H, net: KT_HIGH_NET, netRec: R.net, postRec: R.brass, barRec: R.brass });
  }

  {
    const M = KT_MAIN_TOP, n = 48, half = KT_LIFT.half;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      const sq = (a) => { const s = Math.sin(a), c = Math.cos(a), k2 = half / Math.max(Math.abs(s), Math.abs(c)); return [M.x + s * k2, M.z + c * k2]; };
      const i0 = sq(a0), i1 = sq(a1), o0 = [M.x + Math.sin(a0) * M.r, M.z + Math.cos(a0) * M.r], o1 = [M.x + Math.sin(a1) * M.r, M.z + Math.cos(a1) * M.r];
      K.quad(R.deck, [i0[0], M.y, i0[1]], [o0[0], M.y, o0[1]], [o1[0], M.y, o1[1]], [i1[0], M.y, i1[1]], [0, 1, 0], null, true);
      K.quad(R.iron, [i0[0], M.y - T, i0[1]], [o0[0], M.y - T, o0[1]], [o1[0], M.y - T, o1[1]], [i1[0], M.y - T, i1[1]], [0, -1, 0]);
      K.quad(R.brass, [o0[0], M.y - T, o0[1]], [o1[0], M.y - T, o1[1]], [o1[0], M.y, o1[1]], [o0[0], M.y, o0[1]], [Math.sin((a0 + a1) / 2), 0, Math.cos((a0 + a1) / 2)]);
    }
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; K.pipe(R.iron, [M.x + Math.sin(a) * KT_LIFT.half, M.y - 5, M.z + Math.cos(a) * KT_LIFT.half], [M.x + Math.sin(a) * (M.r - 0.4), M.y - T, M.z + Math.cos(a) * (M.r - 0.4)], 0.14, 6); }
    const gap = Math.atan2(KT_YARD.halfW + 0.1, M.r), pts = [];
    for (let k = 0; k <= 40; k++) { const a = Math.PI / 2 + gap + ((2 * Math.PI - 2 * gap) * k) / 40; pts.push([M.x + Math.sin(a) * (M.r - 0.1), M.z + Math.cos(a) * (M.r - 0.1)]); }
    K.rail(pts, M.y, { h: KT_RAIL_H, net: KT_HIGH_NET, netRec: R.net, postRec: R.brass, barRec: R.brass });
    const Y = KT_YARD, yx0 = M.x + Math.sqrt(M.r ** 2 - Y.halfW ** 2) - 0.4;
    K.box(R.deck, yx0, Y.x1 + 0.6, Y.y - T, Y.y, Y.z - Y.halfW, Y.z + Y.halfW, { solid: true, recs: { bottom: R.iron, px: R.brass, nx: R.brass, pz: R.brass, nz: R.brass } });
    for (const s of [-1, 1]) K.rail([[yx0, Y.z + s * (Y.halfW - 0.05)], [Y.x1 + 0.2, Y.z + s * (Y.halfW - 0.05)]], Y.y, { h: KT_RAIL_H, net: KT_HIGH_NET, netRec: R.net, postRec: R.brass, barRec: R.brass });
    K.pipe(R.iron, [KT_LIFT.x + KT_LIFT.half, Y.y - 6, Y.z], [Y.x1, Y.y - T, Y.z], 0.18, 6);
    const A = KT_COURSE_SPEC.start;
    K.sector(R.deck, A.x, A.z, 0, A.r, 0, Math.PI * 2, A.y, 32, { solid: true, rim: 0.4, rimRec: R.brass });
    K.cone(R.hull, [A.x, A.y - 0.4, A.z], [A.x, A.y - 3.2, A.z], A.r, 16);
    for (const c of KT_COURSE.checkpoints) for (const [p, q] of ketchCheckpointChains(c)) K.pipe(R.chain, p, q, 0.06, 4);
    K.cyl(R.brass, KT_LINE.x, KT_LINE.z, 0.22, M.y, M.y + 3.2, 10, { solid: true });
    K.cyl(R.gear, KT_LINE.x, KT_LINE.z, 0.55, M.y + 3.0, M.y + 3.15, 12);
    K.sector(R.edge, KT_LINE.x, KT_LINE.z, KT_LINE.r - 0.08, KT_LINE.r, 0, Math.PI * 2, M.y + 0.01, 20);
  }

  {
    const W = KT_GANGWAY, dx = W.bx - W.ax, dz = W.bz - W.az, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, nx = -uz, nz = ux, h = W.w / 2;
    const a = [W.ax + nx * h, W.az + nz * h], b = [W.bx + nx * h, W.bz + nz * h], c = [W.bx - nx * h, W.bz - nz * h], d = [W.ax - nx * h, W.az - nz * h];
    K.quad(R.deck, [a[0], 0, a[1]], [b[0], 0, b[1]], [c[0], 0, c[1]], [d[0], 0, d[1]], [0, 1, 0], null, true);
    K.quad(R.iron, [a[0], -T, a[1]], [b[0], -T, b[1]], [c[0], -T, c[1]], [d[0], -T, d[1]], [0, -1, 0]);
    for (const [p, q, s] of /** @type {Array<[number[], number[], number]>} */ ([[a, b, 1], [d, c, -1]])) {
      K.quad(R.brass, [p[0], -T, p[1]], [q[0], -T, q[1]], [q[0], 0, q[1]], [p[0], 0, p[1]], [s * nx, 0, s * nz]);
      K.rail([[p[0] - s * nx * 0.05, p[1] - s * nz * 0.05], [q[0] - s * nx * 0.05, q[1] - s * nz * 0.05]], 0, { h: KT_RAIL_H, net: KT_HIGH_NET, netRec: R.net, postRec: R.brass, barRec: R.brass });
    }
    K.prism(R.brass, ketchGangwaySill(), -T, 0.02, { bottom: true });
  }

  {
    const C = KT_BRIDGE;
    K.sector(R.deck, C.x, C.z, 0, C.core, 0, Math.PI * 2, C.y, 48, { solid: true });
    K.sector(R.iron, C.x, C.z, 0, C.core, 0, Math.PI * 2, C.y - 1.2, 48, { up: false });
    for (const r of [6, 13]) K.sector(R.brass, C.x, C.z, r - 0.12, r + 0.12, 0, Math.PI * 2, C.y + 0.01, 64);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a), px = -c * 0.08, pz = s * 0.08;
      K.quad(R.brass, [C.x + s * 6 + px, C.y + 0.01, C.z + c * 6 + pz], [C.x + s * 13 + px, C.y + 0.01, C.z + c * 13 + pz], [C.x + s * 13 - px, C.y + 0.01, C.z + c * 13 - pz], [C.x + s * 6 - px, C.y + 0.01, C.z + c * 6 - pz], [0, 1, 0]);
    }
    K.sector(R.gilt, C.x, C.z, 0, 1.6, 0, Math.PI * 2, C.y + 0.01, 24, { faceUv: true });
    K.cyl(R.brass, KT_HELM.x, KT_HELM.z, 0.7, C.y, C.y + 1.2, 12, { solid: true, capRec: R.gilt });
    {
      const wx = KT_HELM.x, wy = C.y + 2.6, wz = KT_HELM.z + 0.2, wr = 1.6, n = 24;
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2, P = (a) => [wx + Math.cos(a) * wr, wy + Math.sin(a) * wr, wz];
        const uv = (a) => [0.5 + Math.cos(a) / 2, 0.5 + Math.sin(a) / 2];
        K.tri(R.gear, [wx, wy, wz], P(a0), P(a1), [0.5, 0.5], uv(a0), uv(a1), [0, 0, -1]);
        K.tri(R.gear, [wx, wy, wz], P(a0), P(a1), [0.5, 0.5], uv(a0), uv(a1), [0, 0, 1]);
      }
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; K.pipe(R.gilt, [wx + Math.cos(a) * wr, wy + Math.sin(a) * wr, wz], [wx + Math.cos(a) * (wr + 0.4), wy + Math.sin(a) * (wr + 0.4), wz], 0.07, 6, { caps: true }); }
      K.pipe(R.brass, [wx, wy, wz], [wx, wy, wz + 1.2], 0.15, 8);
    }
    const CO = KT_CONSOLE;
    K.box(R.iron, CO.x0, CO.x1, C.y, C.y + CO.h, CO.z0, CO.z1, { skip: ['bottom'], solid: true, recs: { top: R.gilt } });
    for (let k = 0; k < 8; k++) {
      const a = k * (Math.PI / 4), x = C.x + Math.sin(a) * (C.core - 0.5), z = C.z + Math.cos(a) * (C.core - 0.5);
      K.cyl(R.brass, x, z, 0.3, C.y, C.y + 7, 8, { top: false, solid: true });
      K.cone(R.gilt, [x, C.y + 7, z], [x, C.y + 9.5, z], 0.36, 8);
      K.cyl(R.brass, x, z, 0.42, C.y + 2.2, C.y + 2.4, 8, { top: false });
    }
    for (const [x, z] of KT_BRIDGE_CRADLES) cradle(x, z, C.y);
    K.cone(R.hull, [C.x, C.y - 1.2, C.z], [C.x, KT_HULL.keel - 2, C.z], C.core, 24);
  }

  {
    const CB = KT_CABIN, DR = KT_CABIN_DOOR, h = 5.2, roof = 6.8;
    K.slabWithHoles(R.deck, CB.x0, CB.x1, CB.z0 - 1.2, CB.z1, 0, [], [0, 1, 0], true);
    const cw = (a, b, ya, yb, outward) => {
      K.quad(R.stone, [a[0], ya, a[1]], [b[0], ya, b[1]], [b[0], yb, b[1]], [a[0], yb, a[1]], outward, null, true);
      const t = 0.4, i = [a[0] - outward[0] * t, a[1] - outward[2] * t], j = [b[0] - outward[0] * t, b[1] - outward[2] * t];
      K.quad(R.stone, [i[0], ya, i[1]], [j[0], ya, j[1]], [j[0], yb, j[1]], [i[0], yb, i[1]], [-outward[0], 0, -outward[2]], null, true);
    };
    cw([CB.x0, CB.z0], [DR.x0, CB.z0], 0, h, [0, 0, -1]);
    cw([DR.x1, CB.z0], [CB.x1, CB.z0], 0, h, [0, 0, -1]);
    cw([DR.x0, CB.z0], [DR.x1, CB.z0], 3.4, h, [0, 0, -1]);
    cw([CB.x0, CB.z0], [CB.x0, CB.z1], 0, h, [-1, 0, 0]);
    cw([CB.x1, CB.z0], [CB.x1, CB.z1], 0, h, [1, 0, 0]);
    cw([CB.x0, CB.z1], [CB.x1, CB.z1], 0, h, [0, 0, 1]);
    K.box(R.gilt, DR.x0 - 0.3, DR.x1 + 0.3, 3.4, 3.8, CB.z0 - 0.1, CB.z0 + 0.05);
    for (const x of [DR.x0 - 0.15, DR.x1 + 0.15]) K.box(R.gilt, x - 0.15, x + 0.15, 0, 3.4, CB.z0 - 0.1, CB.z0 + 0.05);
    for (const s of [-1, 1]) {
      K.quad(R.hull, [0, roof, CB.z0 - 0.3], [s * (CB.x1 + 0.4), h, CB.z0 - 0.3], [s * (CB.x1 + 0.4), h, CB.z1 + 0.3], [0, roof, CB.z1 + 0.3], [s * 0.6, 1, 0], null, true);
      for (const z of [CB.z0, CB.z1]) K.tri(R.stone, [0, roof, z], [s * CB.x1, h, z], [0, h, z], [0.5, 1], [0, 0], [0.5, 0], [0, 0, z === CB.z0 ? -1 : 1]);
    }
    K.slabWithHoles(R.iron, CB.x0, CB.x1, CB.z0, CB.z1, h, [], [0, -1, 0], true);
    for (const x of [-4.4, 4.4]) K.quad(R.glass, [x - 1, 1.6, CB.z0 - 0.04], [x + 1, 1.6, CB.z0 - 0.04], [x + 1, 3.6, CB.z0 - 0.04], [x - 1, 3.6, CB.z0 - 0.04], [0, 0, -1]);
    const V = KT_VAULT;
    K.box(R.iron, V.x - 0.8, V.x + 0.8, 0, 0.8, V.z - 0.5, V.z + 0.5, { skip: ['bottom'], solid: true, recs: { top: R.gilt } });
    K.box(R.gilt, V.x - 0.85, V.x + 0.85, 0.8, 1.0, V.z - 0.55, V.z + 0.55, { skip: ['bottom'] });
    const SL = KT_STERN_LIFT;
    K.sector(R.brass, SL.x, SL.z, 0, SL.r, 0, Math.PI * 2, 0.02, 20, { faceUv: true });
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; K.pipe(R.brass, [SL.x + Math.sin(a) * SL.r, 0, SL.z + Math.cos(a) * SL.r], [SL.x + Math.sin(a) * SL.r, 3, SL.z + Math.cos(a) * SL.r], 0.06, 6); }
    K.pipe(R.chain, [SL.x, 3, SL.z], [SL.x, h, SL.z], 0.1, 4);
  }

  for (const m of KT_MASTS) {
    K.cyl(R.brass, m.x, m.z, m.r, m.y0, m.y1, 12, { solid: m.y0 === 0, capRec: R.gilt });
    for (let y = m.y0 + 4; y < m.y1; y += 6) K.cyl(R.iron, m.x, m.z, m.r + 0.08, y, y + 0.3, 12, { top: false });
    const [lo, hi, reach] = m.vanes;
    for (const s of [-1, 1]) {
      const n = 5, mid = (lo + hi) / 2;
      for (let k = 0; k < n; k++) {
        const a0 = -0.9 + (1.8 * k) / n, a1 = -0.9 + (1.8 * (k + 1)) / n;
        const P = (a) => [m.x + s * Math.cos(a) * reach, mid + Math.sin(a) * (hi - lo) * 0.9, m.z + KT_VANE_DZ];
        K.tri(R.vane, [m.x + s * m.r, mid, m.z + KT_VANE_DZ], P(a0), P(a1), [0.5, 1], [k / n, 0], [(k + 1) / n, 0], [0, 0, 1]);
        K.tri(R.vane, [m.x + s * m.r, mid, m.z + KT_VANE_DZ], P(a0), P(a1), [0.5, 1], [k / n, 0], [(k + 1) / n, 0], [0, 0, -1]);
      }
      K.pipe(R.brass, [m.x, mid, m.z + KT_VANE_DZ], [m.x + s * reach, mid, m.z + KT_VANE_DZ], 0.18, 6);
      K.pipe(R.chain, [m.x, m.y1 - 2, m.z], [s * 12.8, KT_BULWARK.h, m.z - 8], 0.04, 4);
      K.pipe(R.chain, [m.x, m.y1 - 2, m.z], [s * 12.8, KT_BULWARK.h, m.z + 8], 0.04, 4);
    }
    if (m.y0 === 0) {
      K.sector(R.iron, m.x, m.z, 0, 1.8, 0, Math.PI * 2, 36, 16, { rim: 1.0, rimRec: R.brass });
      K.sector(R.iron, m.x, m.z, 0, 1.8, 0, Math.PI * 2, 35, 16, { up: false });
    }
  }
  const [MAIN, MIZZEN] = KT_MASTS;
  K.pipe(R.chain, [0, 8, -20], [MAIN.x, MAIN.y1 - 1, MAIN.z], 0.05, 4);
  K.pipe(R.chain, [MAIN.x, MAIN.y1 - 1, MAIN.z], [MIZZEN.x, MIZZEN.y1 - 1, MIZZEN.z], 0.05, 4);
  K.pipe(R.chain, [MIZZEN.x, MIZZEN.y1 - 1, MIZZEN.z], [0, 6.8, KT_CABIN.z0 + 2], 0.05, 4);
  K.pipe(R.brass, [KT_JACKSTAY.x, KT_JACKSTAY.fore.y, KT_JACKSTAY.fore.z], [KT_JACKSTAY.x, KT_JACKSTAY.aft.y, KT_JACKSTAY.aft.z], 0.14, 6);

  const { up, below, cabin } = ketchLampSpots(), LK = ketchKit({ f: faces(), hit: null });
  for (const p of [...up, ...below, ...cabin]) lamp(LK, p);

  return { model: packKetchFaces(K.f), hit, lights: ketchLights(), lamps: packKetchFaces(LK.f) };
}

// Each part is built about its own origin and the host places it by draw matrix and collider translation;
// `sections` and `line` are built in the dungeon frame.
export function buildKetchParts() {
  const part = (fn, solid = false) => { const hit = solid ? [] : null; const K = ketchKit({ f: faces(), hit }); fn(K); return { model: packKetchFaces(K.f), hit }; };
  const O = deckToDungeon(0, 0, 0);
  const local = (p) => { const m = p.model.positions; for (let i = 0; i < m.length; i += 3) { m[i] -= O[0]; m[i + 1] -= O[1]; m[i + 2] -= O[2]; } if (p.hit) for (let i = 0; i < p.hit.length; i += 3) { p.hit[i] -= O[0]; p.hit[i + 1] -= O[1]; p.hit[i + 2] -= O[2]; } return p; };
  const hammer = local(part((K) => {
    K.box(R.iron, -1.25, 1.25, 0, 0.9, -1.25, 1.25, { recs: { bottom: R.iron, top: R.brass } });
    K.box(R.brass, -1.32, 1.32, 0.6, 0.78, -1.32, 1.32, { skip: ['top', 'bottom'] });
    K.pipe(R.brass, [0, 0.9, 0], [0, 6.5, 0], 0.32, 10);
  }));
  const C = KT_CAGE;
  const cage = local(part((K) => {
    K.box(R.iron, -C.half, C.half, -0.25, KT_CAGE_LIFT_M, -C.half, C.half, { solid: true, recs: { top: R.deck } });
    for (const [a, b, n] of [[[C.half, -C.half], [C.half, C.half], [-1, 0, 0]], [[-C.half, -C.half], [C.half, -C.half], [0, 0, 1]], [[-C.half, C.half], [C.half, C.half], [0, 0, -1]]]) {
      K.quad2(R.net, [a[0], 0.1, a[1]], [b[0], 0.1, b[1]], [b[0], C.h, b[1]], [a[0], C.h, a[1]], n, [[0, 0], [2.6, 0], [2.6, 1.4], [0, 1.4]]);
      K.quad(null, [a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], C.h, b[1]], [a[0], C.h, a[1]], n, null, true);
      K.pipe(R.brass, [a[0], C.h, a[1]], [b[0], C.h, b[1]], 0.08, 6);
      K.pipe(R.brass, [a[0], 1.1, a[1]], [b[0], 1.1, b[1]], 0.05, 6);
    }
    for (const [x, z] of [[C.half, C.half], [C.half, -C.half], [-C.half, C.half], [-C.half, -C.half]]) K.pipe(R.brass, [x, 0, z], [x, C.h, z], 0.1, 6);
    for (const [a, b, n] of [[[-C.half, -C.half], [C.half, -C.half], [0, 0.6, -1]], [[C.half, -C.half], [C.half, C.half], [1, 0.6, 0]], [[C.half, C.half], [-C.half, C.half], [0, 0.6, 1]], [[-C.half, C.half], [-C.half, -C.half], [-1, 0.6, 0]]]) {
      K.tri(R.iron, [a[0], C.h, a[1]], [b[0], C.h, b[1]], [0, C.peak + C.h, 0], [0, 0], [1, 0], [0.5, 1], n, true);
      K.tri(R.iron, [a[0], C.h, a[1]], [b[0], C.h, b[1]], [0, C.peak + C.h, 0], [0, 0], [1, 0], [0.5, 1], [-n[0], -n[1], -n[2]]);
    }
    K.box(R.lamp, -0.16, 0.16, C.h - 0.4, C.h - 0.08, -0.16, 0.16);
  }, true));
  const D0 = KT_SHAFT.door, L = KT_LIFT;
  const bars = (K, x, za, zb, ya, yb, pitch) => {
    for (let z = za + pitch / 2; z < zb; z += pitch) K.pipe(R.iron, [x, ya, z], [x, yb, z], 0.06, 6);
    for (const y of [ya + 0.2, (ya + yb) / 2, yb - 0.1]) K.pipe(R.brass, [x, y, za], [x, y, zb], 0.07, 6);
    K.quad(null, [x, ya, za], [x, ya, zb], [x, yb, zb], [x, yb, za], [-1, 0, 0], null, true);
  };
  const gateHold = local(part((K) => bars(K, L.x - L.half - 0.15, D0.z0, D0.z1, L.y0, L.y0 + D0.h, 0.3), true));
  const gateTop = local(part((K) => bars(K, L.x - L.half - 0.15, L.z - L.half, L.z + L.half, L.y1, L.y1 + KT_HIGH_NET, 0.25), true));
  const leaf = (H, xa, xb) => local(part((K) => {
    K.box(R.grate, xa, xb, H.y0, H.y0 + 0.1, H.z0, H.z1, { recs: { bottom: R.grate } });
    for (const z of [H.z0 + 0.1, (H.z0 + H.z1) / 2, H.z1 - 0.1]) K.box(R.brass, xa, xb, H.y0 + 0.1, H.y0 + 0.16, z - 0.08, z + 0.08);
  }));
  const grate = (H) => ({ left: leaf(H, H.x0 - 0.05, (H.x0 + H.x1) / 2), right: leaf(H, (H.x0 + H.x1) / 2, H.x1 + 0.05), hit: local(part((K) => K.box(null, H.x0 - 0.05, H.x1 + 0.05, H.y0, H.y0 + 0.1, H.z0, H.z1, { solid: true }), true)).hit });
  const grateWatch = grate(KT_HATCH), grateHold = grate(KT_HOLD_HATCH);
  const DR = KT_CABIN_DOOR;
  const doorLeaf = (xa, xb) => local(part((K) => {
    K.box(R.iron, xa, xb, 0, 3.4, DR.z - 0.12, DR.z + 0.12, { recs: { nz: R.gilt } });
    K.cyl(R.gear, (xa + xb) / 2, DR.z - 0.14, 0.45, 1.6, 1.62, 12);
  }));
  const doors = { left: doorLeaf(DR.x0, 0), right: doorLeaf(0, DR.x1), hit: local(part((K) => K.box(null, DR.x0, DR.x1, 0, 3.4, DR.z - 0.12, DR.z + 0.12, { solid: true }), true)).hit };
  const BC = KT_BRIDGE;
  const sections = Array.from({ length: KT_SECTIONS }, (_, k) => part((K) => {
    const a0 = (k * Math.PI) / 4, a1 = ((k + 1) * Math.PI) / 4;
    K.sector(R.deck, BC.x, BC.z, BC.core, BC.r, a0, a1, BC.y, 8, { solid: true, rim: 1.2, rimRec: R.hull, inner: true, ends: true });
    K.sector(R.hull, BC.x, BC.z, BC.core, BC.r, a0, a1, BC.y - 1.2, 8, { up: false });
    K.sector(R.edge, BC.x, BC.z, BC.r - 0.08, BC.r, a0, a1, BC.y + 0.01, 8);
    for (const [r0, r1] of railRuns(a0, a1)) {
      const pts = [], n = Math.max(1, Math.ceil(((r1 - r0) / (a1 - a0)) * 8));
      for (let j = 0; j <= n; j++) { const a = r0 + ((r1 - r0) * j) / n; pts.push([BC.x + Math.sin(a) * KT_RAIL_R, BC.z + Math.cos(a) * KT_RAIL_R]); }
      K.rail(pts, BC.y, { h: 0.95, postRec: R.brass, barRec: R.brass });
    }
    const ri = KT_RESONATORS.findIndex(([x, z]) => sectionAt(x, z) === k);
    if (ri >= 0) {
      const [x, z] = KT_RESONATORS[ri];
      K.cyl(R.iron, x, z, 1.1, BC.y, BC.y + 0.5, 12, { solid: true, capRec: R.brass });
      K.cyl(R.brass, x, z, 0.45, BC.y + 0.5, BC.y + 3.4, 10, { solid: true, top: false });
      for (let j = 0; j < 4; j++) { const a = (j / 4) * Math.PI * 2; K.pipe(R.copper, [x + Math.sin(a) * 0.9, BC.y + 0.5, z + Math.cos(a) * 0.9], [x + Math.sin(a) * 0.3, BC.y + 3.4, z + Math.cos(a) * 0.3], 0.1, 6); }
      K.cyl(R.brass, x, z, 0.7, BC.y + 3.4, BC.y + 3.6, 12, { top: true });
    }
  }, true));
  const crystal = (rec) => local(part((K) => {
    const h = 0.9, w = 0.55, pts = [[w, 0, 0], [0, 0, w], [-w, 0, 0], [0, 0, -w]];
    for (let j = 0; j < 4; j++) {
      const p = pts[j], q = pts[(j + 1) % 4];
      K.tri(rec, p, q, [0, h, 0], [0, 0], [1, 0], [0.5, 1], [p[0] + q[0], 0.5, p[2] + q[2]]);
      K.tri(rec, p, q, [0, -h, 0], [0, 0], [1, 0], [0.5, 1], [p[0] + q[0], -0.5, p[2] + q[2]]);
    }
  }));
  const resonator = { true: crystal(R.aether), false: crystal(R.ember) };
  const cell = local(part((K) => {
    K.cyl(R.aether, 0, 0, 0.24, 0.12, 0.72, 10, { top: false, wrap: true });
    K.cyl(R.brass, 0, 0, 0.28, 0, 0.12, 10, { top: true, bottom: true });
    K.cyl(R.brass, 0, 0, 0.28, 0.72, 0.84, 10, { top: true, bottom: true });
    for (const s of [-1, 1]) K.pipe(R.brass, [s * 0.2, 0.84, 0], [s * 0.12, 1.02, 0], 0.03, 5);
    K.pipe(R.brass, [-0.12, 1.02, 0], [0.12, 1.02, 0], 0.035, 5);
  }));
  const fork = local(part((K) => {
    K.cyl(R.iron, 0, 0, 0.55, 0, 0.25, 10, { top: true });
    K.pipe(R.brass, [0, 0.25, 0], [0, 0.9, 0], 0.14, 8);
    K.pipe(R.brass, [-0.3, 0.9, 0], [0.3, 0.9, 0], 0.12, 8);
    for (const s of [-1, 1]) { K.pipe(R.brass, [s * 0.3, 0.9, 0], [s * 0.3, 2.0, 0], 0.11, 8); K.box(R.aether, s * 0.3 - 0.13, s * 0.3 + 0.13, 2.0, 2.25, -0.13, 0.13); }
  }));
  const arc = [R.arc0, R.arc1, R.arc2, R.arc3].map((rec) => local(part((K) => {
    const x0 = -KT_ARCS.post + 0.5, x1 = KT_ARCS.post - 0.5, w = KT_ARCS.w * 0.45;
    K.quad2(rec, [x0, -w, 0], [x1, -w, 0], [x1, w, 0], [x0, w, 0], [0, 0, 1], [[0, 0], [3, 0], [3, 1], [0, 1]]);
    K.quad2(rec, [x0, 0, -w], [x1, 0, -w], [x1, 0, w], [x0, 0, w], [0, 1, 0], [[0, 0], [3, 0], [3, 1], [0, 1]]);
  })));
  const line = part((K) => {
    const n = 16;
    let p = bosunLineAt(0);
    for (let k = 1; k <= n; k++) { const q = bosunLineAt(k / n); K.pipe(R.chain, p, q, 0.06, 4); p = q; }
  });
  const lodestone = local(part((K) => {
    const S = KT_LODESTONE, c = [0, S.lift, 0], r = S.r;
    K.cyl(R.brass, 0, 0, 0.32, 0, 0.12, 12, { capRec: R.gilt });
    K.pipe(R.brass, [0, 0.12, 0], [0, S.lift - r - 0.05, 0], 0.07, 6);
    const ring = [[r, 0], [0, r], [-r, 0], [0, -r]];
    for (const tip of [1, -1]) for (let k = 0; k < 4; k++) {
      const [ax, az] = ring[k], [bx, bz] = ring[(k + 1) % 4], P = [c[0], c[1] + tip * r * 1.35, c[2]], A = [c[0] + ax, c[1], c[2] + az], B = [c[0] + bx, c[1], c[2] + bz];
      K.tri(R.aether, P, A, B, [0.5, 1], [0, 0], [1, 0], [(ax + bx) / 2, tip * r, (az + bz) / 2]);
    }
    const hr = r + 0.14, n = 20;
    for (let k = 0; k < n; k++) { const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2; K.pipe(R.brass, [Math.cos(a0) * hr, S.lift + Math.sin(a0) * hr, 0], [Math.cos(a1) * hr, S.lift + Math.sin(a1) * hr, 0], 0.035, 5); }
  }));
  return { hammer, cage, gateHold, gateTop, grateWatch, grateHold, doors, sections, resonator, cell, fork, arc, line, lodestone };
}
export const KT_LODESTONE = Object.freeze({ x: (KT_CONSOLE.x0 + KT_CONSOLE.x1) / 2, y: KT_BRIDGE.y + KT_CONSOLE.h, z: (KT_CONSOLE.z0 + KT_CONSOLE.z1) / 2, lift: 1.1, r: 0.4, spin: 0.35 });
// The ketch client moves the bosun's line rider along this same path, so the drawn line and the rider stay
// together.
export function bosunLineAt(t) {
  const a = [KT_LINE.x, KT_MAIN_TOP.y + 3.1, KT_LINE.z], b = [KT_LINE_LAND.x, 3, KT_LINE_LAND.z], k = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k - 6 * Math.sin(Math.PI * k), a[2] + (b[2] - a[2]) * k];
}

export const KT_LIFT_CROWN = 3;
export const KT_SKY_CHAIN = -KT_GROUND.y - KT_LIFT_CROWN;
export function buildKetchAnchorLift() {
  const O = deckToDungeon(0, 0, 0);
  const local = (model) => { const m = model.positions; for (let i = 0; i < m.length; i += 3) { m[i] -= O[0]; m[i + 1] -= O[1]; m[i + 2] -= O[2]; } return model; };
  const C = ketchKit({ f: faces() }), r = KT_ANCHOR_LIFT.r, h = KT_LIFT_CROWN;
  C.sector(R.brass, 0, 0, 0, r, 0, Math.PI * 2, 0.05, 24, { faceUv: true, rim: 0.05, rimRec: R.brass });
  C.sector(R.aether, 0, 0, r - 0.18, r + 0.06, 0, Math.PI * 2, 0.07, 24);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; C.pipe(R.brass, [Math.sin(a) * r, 0, Math.cos(a) * r], [Math.sin(a) * r, h, Math.cos(a) * r], 0.06, 6); }
  for (let k = 0; k < 24; k++) { const a0 = (k / 24) * Math.PI * 2, a1 = ((k + 1) / 24) * Math.PI * 2; C.pipe(R.brass, [Math.sin(a0) * r, h, Math.cos(a0) * r], [Math.sin(a1) * r, h, Math.cos(a1) * r], 0.07, 5); }
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; C.pipe(R.chain, [Math.sin(a) * r, h, Math.cos(a) * r], [0, h + 1.6, 0], 0.05, 4); }
  C.box(R.lamp, -0.18, 0.18, h + 1.3, h + 1.66, -0.18, 0.18);
  const L = ketchKit({ f: faces() });
  L.pipe(R.chain, [0, 0, 0], [0, -1, 0], 0.12, 4);
  return { cage: local(packKetchFaces(C.f)), chain: local(packKetchFaces(L.f)) };
}

export function buildKetchGround() {
  const K = ketchKit({ f: faces() });
  const G = KT_GROUND, y = G.y, h = G.half, k = (2 * h) / G.tile;
  K.quad(R.ground, [-h, y, -h + 120], [h, y, -h + 120], [h, y, h + 120], [-h, y, h + 120], [0, 1, 0], [[0, 0], [k, 0], [k, k], [0, k]]);
  const C = KT_CITY;
  let s = C.seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let j = 0; j < C.towers; j++) {
    const a0 = (j / C.towers) * Math.PI * 2, a1 = ((j + 1) / C.towers) * Math.PI * 2;
    const p = [C.x + Math.sin(a0) * C.r, C.z + Math.cos(a0) * C.r], q = [C.x + Math.sin(a1) * C.r, C.z + Math.cos(a1) * C.r];
    K.prism(R.stone, [[p[0], p[1]], [q[0], q[1]], [q[0] - Math.sin((a0 + a1) / 2) * 4, q[1] - Math.cos((a0 + a1) / 2) * 4], [p[0] - Math.sin((a0 + a1) / 2) * 4, p[1] - Math.cos((a0 + a1) / 2) * 4]], y, y + 14);
    K.cyl(R.stone, p[0], p[1], 6, y, y + 22, 8, { capRec: R.copper });
  }
  for (let j = 0; j < C.houses; j++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * (C.r - 18) + 8, x = C.x + Math.sin(a) * d, z = C.z + Math.cos(a) * d;
    if (Math.hypot(x - C.x, z - C.z) < 30) continue;
    const w = 6 + r() * 8, l = 8 + r() * 10, hh = 5 + r() * 6, yaw = Math.round(r() * 4) * (Math.PI / 4);
    const cs = Math.cos(yaw), sn = Math.sin(yaw), P = (u, v) => [x + u * cs - v * sn, z + u * sn + v * cs];
    K.prism(R.stone, [P(-w / 2, -l / 2), P(w / 2, -l / 2), P(w / 2, l / 2), P(-w / 2, l / 2)], y, y + hh, { top: false });
    const ridge = y + hh + w * 0.45, ra = P(0, -l / 2), rb = P(0, l / 2);
    for (const sd of [-1, 1]) { const ea = P(sd * w / 2, -l / 2), eb = P(sd * w / 2, l / 2); K.quad(R.copper, [ea[0], y + hh, ea[1]], [eb[0], y + hh, eb[1]], [rb[0], ridge, rb[1]], [ra[0], ridge, ra[1]], [sd * cs, 0.8, sd * sn]); }
    for (const v of [-l / 2, l / 2]) { const pa = P(-w / 2, v), pb = P(w / 2, v), pr = P(0, v); K.tri(R.stone, [pa[0], y + hh, pa[1]], [pb[0], y + hh, pb[1]], [pr[0], ridge, pr[1]], [0, 0], [1, 0], [0.5, 1], [-sn * Math.sign(v), 0, cs * Math.sign(v)]); }
  }
  K.prism(R.stone, [[C.x - 14, C.z - 14], [C.x + 14, C.z - 14], [C.x + 14, C.z + 14], [C.x - 14, C.z + 14]], y, y + 30, { topRec: R.iron });
  for (const [dx, dz] of [[-16, -16], [16, -16], [16, 16], [-16, 16]]) K.cyl(R.stone, C.x + dx, C.z + dz, 5, y, y + 38, 10, { capRec: R.copper });
  return packKetchFaces(K.f);
}

export const ketchColliderOf = (ship) => packKetchHit(ship.hit);
export const KT_ROOM_H = KT_DECK_H;
