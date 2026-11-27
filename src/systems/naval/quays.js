// @ts-check
import { alongside, berthSize, BERTH_HULL } from './shipLife.js';
import { hullBuild, MOD_BUILDS } from './navalShips.js';
import { hash32 } from '../../world/spawnedDungeons.js';
import { mulberry32 } from '../../combat/bloodArt.js';
import { SHORE_TERRAIN_FIT_METERS } from '../../world/deepWaterFloor.js';
import { hullAlong, HULL_CLEAR_M } from './seaClearance.js';

export const QUAY_GAP = 0.8;
export const QUAY_WIDTH = 4.5;
export const QUAY_DECK_UP = 1.6;
export const QUAY_DECK_T = 0.3;
export const QUAY_ENDS = 3;
export const PILE_STEP = 4;
export const PILE_R = 0.22;
export const PILE_DEPTH = 6;
export const JETTY_WIDTH = 3;
export const JETTY_STEP = 1;
export const JETTY_BEACH = 20;
// The Deep Waters shelf puts the deepest keel's berth within its shore fit, so a jetty may cross all of it.
export const JETTY_MAX = SHORE_TERRAIN_FIT_METERS + JETTY_BEACH;
export const JETTY_LAND = 2;
export const DRY_M = 0.1;
export const STEP_M = 0.35;
export const RAMP_SLOPE = 0.45;
export const RAMP_MAX = 10;
export const BOLLARD_R = 0.18;
export const BOLLARD_H = 0.55;
export const LANTERN_UP = 3.2;
export const LANTERN_ARM = 0.45;
export const LANTERN_DROP = 0.35;
export const QUAY_SALT = 0x9a1e;
export const CARGO_MAX = 5;
export const BRACE_W = 0.14;
export const BRACE_LOW = -1.2;
export const BRACE_SPAN = PILE_STEP * 1.5;
export const FENDER_STEP = 3;
export const FENDER_DOWN = -0.9;
export const FENDER_W = 0.26;
export const LADDER_DOWN = -1.8;
export const DRESS_LANE = 0.6;
export const JETTY_LAMP_STEP = 22;
export const CRANE_UP = 5.4;
export const CRANE_JIB = 3.2;
export const CRANE_HOOK_UP = 2.9;
// The dress draws from its own stream, so the cargo stays as it always was.
export const PIER_SALT = 0x51e7;

export const DOCK_WAY = 2;
export const DOCK_REACH_M = 25;
export const DOCK_ANGLE = 40;
export const DOCK_EASE = 0.5;
export const WARP_SPEED = 2;
export const FAST_M = 1.5;
export const FAST_DEG = 6;
export const GANGWAY_REACH = 3;
export const GANGWAY_ASHORE = 1.5;
export const GANGWAY_FACING = 0.7;
export const GANGWAY_SLOPE = 30;
export const GANGWAY_CLEAR = 2;
export const GANGWAY_BACK = 1;
export const GANGWAY_LANE = 1.6;
export const QUAY_KERB_W = 0.3;
export const QUAY_KERB_H = 0.15;
// Measured off the colliders of each hull; a mod build used in place of a hull model has its own row.
export const GANGWAY_SIDE = Object.freeze([
  Object.freeze([0.95, 0.7]),
  Object.freeze([1.9, 2.26]),
  Object.freeze([5.45, 6.7]),
  Object.freeze([9.2, 10.75]),
  Object.freeze([6.21, 8.31]),
]);
export const MOD_SMALL_SHIP_GANGWAY = Object.freeze([7.65, 4.14]);
export const MOD_CARRACK_GANGWAY = Object.freeze([7.65, 4.14]);
export const MOD_LARGE_BOAT_GANGWAY = Object.freeze([1.75, 1.36]);
export const MOD_GANGWAYS = Object.freeze({ 1: MOD_LARGE_BOAT_GANGWAY, 2: MOD_SMALL_SHIP_GANGWAY, 4: MOD_CARRACK_GANGWAY });
export const gangwaySide = (hull) => (MOD_GANGWAYS[hull] && hullBuild(hull) === MOD_BUILDS[hull] ? MOD_GANGWAYS[hull] : GANGWAY_SIDE[hull] ?? GANGWAY_SIDE[0]);
// The Large Galley is too long for a berth and never moors.
export const DOCK_REFUSED = Object.freeze([3]);

const TAU = Math.PI * 2;
const wrap = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; else if (a < -Math.PI) a += TAU; return a; };
const DEG = Math.PI / 180;

/**
 * @param {{ pos: number[], yaw: number, normal: number[] }} berth
 * @param {number} [hull]
 */
export function quayFrame(berth, hull = BERTH_HULL) {
  const [nx, nz] = berth.normal;
  const theta = Math.atan2(nz, -nx);
  const fz = Math.sin(berth.yaw) * nz - Math.cos(berth.yaw) * nx;
  const zSign = fz >= 0 ? 1 : -1;
  const s = berthSize(hull);
  const zAft = zSign > 0 ? s.aftZ : -s.bowZ, zBow = zSign > 0 ? s.bowZ : -s.aftZ;
  return { origin: [berth.pos[0], berth.pos[1]], theta, zSign, halfWidth: s.halfWidth, z0: Math.min(zAft, zBow), z1: Math.max(zAft, zBow) };
}
export function quayToScene(frame, lx, lz) {
  const c = Math.cos(frame.theta), s = Math.sin(frame.theta);
  return [frame.origin[0] + lx * c + lz * s, frame.origin[1] - lx * s + lz * c];
}
export function sceneToQuay(frame, x, z) {
  const c = Math.cos(frame.theta), s = Math.sin(frame.theta), dx = x - frame.origin[0], dz = z - frame.origin[1];
  return [dx * c - dz * s, dx * s + dz * c];
}

// Daggerfall's port towns have no pier data, so each quay is planned from the terrain behind its berth.
/**
 * @param {{ berth: { pos: number[], yaw: number, normal: number[] }, hull?: number, key?: string, index?: number,
 *   seaY: number, groundAt: (x: number, z: number) => number, others?: Array<{ plan: any, origin?: number[] }> }} a
 */
export function planQuay({ berth, hull = BERTH_HULL, key = '', index = 0, seaY, groundAt, others = [] }) {
  const frame = quayFrame(berth, hull);
  const deck = QUAY_DECK_UP;
  const x0 = frame.halfWidth + QUAY_GAP, x1 = x0 + QUAY_WIDTH;
  const z0 = frame.z0 - QUAY_ENDS, z1 = frame.z1 + QUAY_ENDS;
  let unbuilt = false;
  const ground = (lx, lz) => {
    const [x, z] = quayToScene(frame, lx, lz);
    const g = groundAt(x, z);
    if (!Number.isFinite(g)) { unbuilt = true; return NaN; }
    return g - seaY;
  };
  const footOf = (lx, lz) => { const g = ground(lx, lz); return Math.max(-PILE_DEPTH, Number.isFinite(g) ? g - 0.3 : -PILE_DEPTH); };
  const piles = [];
  const rows = [];
  const pileRow = (lx, from, to) => {
    const n = Math.max(1, Math.round((to - from) / PILE_STEP));
    const first = piles.length;
    for (let k = 0; k <= n; k++) {
      const lz = from + ((to - from) * k) / n;
      const foot = footOf(lx, lz);
      if (foot < deck - QUAY_DECK_T - 0.4) piles.push([lx, lz, foot]);
    }
    rows.push(piles.slice(first));
  };
  pileRow(x0 + PILE_R, z0 + PILE_R, z1 - PILE_R);
  pileRow(x1 - PILE_R, z0 + PILE_R, z1 - PILE_R);
  const zJ = (frame.z0 + frame.z1) / 2;
  let jetty = null, ramp = null;
  // A jetty that meets an earlier berth's pier ends on it, never runs across it.
  const piers = others.flatMap((o) => (o?.plan ? pierOutline(o.plan, o.origin) : [])).map((box) => box.map(([x, z]) => sceneToQuay(frame, x, z)));
  const onPier = (lx) => piers.some((box) => [-0.5, 0, 0.5].some((k) => inBox(box, lx, zJ + k * JETTY_WIDTH)));
  for (let t = 0; t <= JETTY_MAX && !jetty; t += JETTY_STEP) {
    if (onPier(x1 + t)) {
      let a = Math.max(0, t - JETTY_STEP), b = t;
      for (let k = 0; k < 6; k++) { const m = (a + b) / 2; if (onPier(x1 + m)) b = m; else a = m; }
      jetty = { x0: x1, x1: x1 + b, z0: zJ - JETTY_WIDTH / 2, z1: zJ + JETTY_WIDTH / 2 };
      break;
    }
    const g = ground(x1 + t, zJ);
    if (!Number.isFinite(g)) break;
    if (g >= deck - STEP_M) { jetty = { x0: x1, x1: x1 + t + (g <= deck + 2 * STEP_M ? JETTY_LAND : 0), z0: zJ - JETTY_WIDTH / 2, z1: zJ + JETTY_WIDTH / 2 }; break; }
    if (g >= DRY_M) {
      jetty = { x0: x1, x1: x1 + t, z0: zJ - JETTY_WIDTH / 2, z1: zJ + JETTY_WIDTH / 2 };
      let end = RAMP_MAX, endY = deck - RAMP_MAX * RAMP_SLOPE;
      for (let s = JETTY_STEP; s <= RAMP_MAX; s += JETTY_STEP) {
        const y = deck - s * RAMP_SLOPE, gs = ground(x1 + t + s, zJ);
        if (!Number.isFinite(gs)) break;
        if (y <= gs + 0.05) { end = s; endY = Math.max(y, gs); break; }
      }
      ramp = { x0: x1 + t, x1: x1 + t + end, y0: deck, y1: endY, z0: jetty.z0, z1: jetty.z1 };
    }
  }
  if (unbuilt) return null;
  if (jetty && jetty.x1 - jetty.x0 > 0.5) {
    pileRow(Math.min(jetty.x1, x1 + 0.6), jetty.z0 + PILE_R, jetty.z1 - PILE_R);
    for (let lx = x1 + PILE_STEP; lx < jetty.x1 - 0.5; lx += PILE_STEP) pileRow(lx, jetty.z0 + PILE_R, jetty.z1 - PILE_R);
  }
  if (unbuilt) return null;
  const zMid = (frame.z0 + frame.z1) / 2;
  const bollards = [[x0 + 0.45, frame.z0 + 4], [x0 + 0.45, zMid], [x0 + 0.45, frame.z1 - 4]];
  const lanterns = [[x1 - 0.4, z0 + 0.6], [x1 - 0.4, z1 - 0.6]];
  // Cargo is drawn from the harbor key and berth number, so every player at the harbor sees the same quay.
  const r = mulberry32(hash32(keyHash(key), index >>> 0, QUAY_SALT));
  const cargo = [];
  const count = 2 + Math.floor(r() * (CARGO_MAX - 1));
  for (let k = 0, tries = 0; k < count && tries < 24; tries++) {
    const kind = r() < 0.6 ? 'crate' : 'barrel';
    const s = kind === 'crate' ? 0.8 + r() * 0.35 : 0.36;
    const lz = z0 + 2 + r() * (z1 - z0 - 4);
    const lx = x1 - 0.9 - r() * 1.2;
    if (Math.abs(lz - zJ) < JETTY_WIDTH / 2 + 1 || Math.abs(lz) < GANGWAY_LANE || Math.abs(lz - z0) < 1.6 || Math.abs(lz - z1) < 1.6) continue;
    if (cargo.some((c) => Math.abs(c.z - lz) < 1.6)) continue;
    const stack = kind === 'crate' && r() < 0.35 ? 2 : 1;
    cargo.push({ kind, x: lx, z: lz, s, stack });
    k++;
  }
  const dress = pierDress({ frame, deck, quay: { x0, x1, z0, z1 }, zJ, jetty, rows, bollards, cargo, key, index, ground });
  if (unbuilt) return null;
  return {
    frame, deck, quay: { x0, x1, z0, z1 }, jetty, ramp, piles, bollards, lanterns, cargo, ...dress,
  };
}

/**
 * @param {{ frame: any, deck: number, quay: { x0: number, x1: number, z0: number, z1: number }, zJ: number, jetty: any,
 *   rows: number[][][], bollards: number[][], cargo: Array<any>, key?: string, index?: number,
 *   ground: (lx: number, lz: number) => number }} a
 */
export function pierDress({ frame, deck, quay, zJ, jetty, rows, bollards, cargo, key = '', index = 0, ground }) {
  const { x0, x1, z0, z1 } = quay;
  const rd = mulberry32(hash32(keyHash(key), index >>> 0, PIER_SALT));
  const inLane = (lz, pad) => Math.abs(lz) < GANGWAY_LANE + pad;
  const braces = [];
  const top = deck - QUAY_DECK_T - 0.12;
  for (const row of rows) {
    for (let k = 0; k + 1 < row.length; k++) {
      const a = row[k], b = row[k + 1];
      const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (span < 0.5 || span > BRACE_SPAN) continue;
      const low = Math.max(a[2], b[2], BRACE_LOW) + 0.1;
      if (top - low < 0.6) continue;
      braces.push([[a[0], top, a[1]], [b[0], low, b[1]]], [[a[0], low, a[1]], [b[0], top, b[1]]]);
    }
  }
  const zMid = (frame.z0 + frame.z1) / 2;
  const ladders = [];
  for (const want of [(frame.z0 + 4 + zMid) / 2, (zMid + frame.z1 - 4) / 2]) {
    let lz = want;
    if (inLane(lz, DRESS_LANE + 0.4)) lz = (lz < 0 ? -1 : 1) * (GANGWAY_LANE + DRESS_LANE + 0.4);
    if (bollards.some(([, bz]) => Math.abs(bz - lz) < 0.8)) lz += lz < 0 ? -1.2 : 1.2;
    if (lz < z0 + 1 || lz > z1 - 1) continue;
    const g = ground(x0 - 0.1, lz);
    if (!Number.isFinite(g) || g > deck - 0.8) continue;
    ladders.push([lz, Math.max(LADDER_DOWN, g + 0.05)]);
  }
  const fenders = [];
  const nF = Math.max(1, Math.round((z1 - z0 - 3) / FENDER_STEP));
  for (let k = 0; k <= nF; k++) {
    const lz = z0 + 1.5 + ((z1 - z0 - 3) * k) / nF;
    if (inLane(lz, DRESS_LANE + FENDER_W / 2) || ladders.some(([lzL]) => Math.abs(lzL - lz) < 0.8)) continue;
    const g = ground(x0 - 0.15, lz);
    if (!Number.isFinite(g) || g > deck - 0.6) continue;
    fenders.push([lz, Math.max(FENDER_DOWN, g + 0.05)]);
  }
  const cleats = [[x0 + 0.35, z0 + 1], [x0 + 0.35, z1 - 1], ...ladders.map(([lz]) => [x0 + 0.35, lz + (lz < 0 ? -0.9 : 0.9)])];
  const coils = [];
  for (const [, bz] of bollards) {
    const side = rd() < 0.5 ? -1 : 1, r = 0.26 + rd() * 0.1;
    for (const cz of [bz + side * 0.95, bz - side * 0.95]) {
      if (inLane(cz, DRESS_LANE + r) || cz < z0 + 0.8 || cz > z1 - 0.8) continue;
      coils.push([x0 + 1.05, cz, r]);
      break;
    }
  }
  let crane = null;
  if ((index >>> 0) === 0) {
    for (const end of rd() < 0.5 ? [1, -1] : [-1, 1]) {
      const cz = end > 0 ? z1 - 3 : z0 + 3;
      if (inLane(cz, 1) || Math.abs(cz - zJ) < JETTY_WIDTH / 2 + 1.5) continue;
      if (cargo.some((c) => Math.abs(c.z - cz) < c.s / 2 + 0.6)) continue;
      crane = { x: x1 - 0.75, z: cz, dir: -end, up: CRANE_UP, jib: CRANE_JIB, hook: CRANE_HOOK_UP };
      break;
    }
  }
  const jettyLanterns = [];
  if (jetty) {
    let k = 1;
    for (let lx = jetty.x0 + JETTY_LAMP_STEP; lx < jetty.x1 - 4; lx += JETTY_LAMP_STEP, k++) {
      const side = k % 2 ? 1 : -1;
      jettyLanterns.push([lx, side > 0 ? jetty.z0 + 0.06 : jetty.z1 - 0.06, side]);
    }
  }
  return { braces, fenders, ladders, cleats, coils, crane, jettyLanterns };
}
export function pierOutline(plan, origin = plan.frame.origin) {
  const at = { ...plan.frame, origin };
  return [plan.quay, plan.jetty, plan.ramp].filter((r) => r && r.x1 - r.x0 > 0)
    .map((r) => [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]].map(([x, z]) => quayToScene(at, x, z)));
}
/**
 * @param {number[]} p
 * @param {number} dx
 * @param {number} dz
 * @param {number} far
 * @param {number[][][]} piers
 */
export function pierAlong(p, dx, dz, far, piers, clear = HULL_CLEAR_M) {
  // From inside a pier's clearance, only the pier itself stops the look.
  return hullAlong(p, dx, dz, far, piers.map(([a, b, , d]) => {
    const ux = b[0] - a[0], uz = b[1] - a[1], vx = d[0] - a[0], vz = d[1] - a[1], lu = Math.hypot(ux, uz), lv = Math.hypot(vx, vz);
    return { c: [(b[0] + d[0]) / 2, 0, (b[1] + d[1]) / 2], ax: [ux / lu, 0, uz / lu], ay: [0, 1, 0], az: [vx / lv, 0, vz / lv], h: [lu / 2, 1, lv / 2] };
  }), clear);
}
function inBox(box, x, z) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, az] = box[i], [bx, bz] = box[(i + 1) % 4];
    const c = (bx - ax) * (z - az) - (bz - az) * (x - ax);
    if (c === 0) continue;
    if (sign && Math.sign(c) !== sign) return false;
    sign = Math.sign(c);
  }
  return true;
}
export function keyHash(key) {
  let h = 0x811c9dc5;
  const s = String(key ?? '');
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h >>> 0;
}
export const lanternHead = (lx, lz, deck) => [lx - LANTERN_ARM, deck + LANTERN_UP - LANTERN_DROP, lz];
export const jettyLanternHead = (lx, lz, side, deck) => [lx, deck + LANTERN_UP - LANTERN_DROP, lz + side * LANTERN_ARM];
// Lights use the berth's live place: a recenter moves the berth, never the plan.
export function lanternLights(plan, seaY, origin = plan.frame.origin) {
  const frame = origin === plan.frame.origin ? plan.frame : { ...plan.frame, origin };
  const at = (h) => { const [x, z] = quayToScene(frame, h[0], h[2]); return [x, seaY + h[1], z]; };
  return [
    ...plan.lanterns.map(([lx, lz]) => at(lanternHead(lx, lz, plan.deck))),
    ...(plan.jettyLanterns ?? []).map(([lx, lz, side]) => at(jettyLanternHead(lx, lz, side, plan.deck))),
  ];
}

/**
 * @param {{ pos: number[], yaw: number, hull: number }} ship
 * @param {Array<any>} berths
 */
export function dockFor(ship, berths) {
  if (DOCK_REFUSED.includes(ship.hull)) return null;
  let best = null;
  for (const b of berths) {
    if (b.free === false) continue;
    const at = alongside(b.berth, ship.hull, b.hull ?? BERTH_HULL);
    const d = Math.hypot(at[0] - ship.pos[0], at[1] - ship.pos[2]);
    if (d > DOCK_REACH_M || (best && d >= best.d)) continue;
    const ahead = Math.abs(wrap(ship.yaw - b.berth.yaw)) <= Math.PI / 2;
    const yaw = ahead ? b.berth.yaw : wrap(b.berth.yaw + Math.PI);
    if (Math.abs(wrap(ship.yaw - yaw)) > DOCK_ANGLE * DEG) continue;
    best = { key: b.key, index: b.index, name: b.name ?? null, pos: at, yaw, d };
  }
  return best;
}
export function madeFast(ship, dock) {
  return !!dock && dock.d <= FAST_M && Math.abs(wrap(ship.yaw - dock.yaw)) <= FAST_DEG * DEG;
}
export function warpStep(pos, yaw, dock, dt) {
  const t = Math.max(0, dt), dx = dock.pos[0] - pos[0], dz = dock.pos[1] - pos[1], d = Math.hypot(dx, dz);
  const ease = 1 - Math.exp(-DOCK_EASE * t);
  const step = Math.min(WARP_SPEED * t, d * ease);
  const k = d > 1e-9 ? step / d : 1;
  return { pos: [pos[0] + dx * k, pos[1] + dz * k], yaw: wrap(yaw + wrap(dock.yaw - yaw) * Math.max(k, ease)) };
}
export function quaySide(yaw, landward) {
  const sx = Math.cos(yaw), sz = -Math.sin(yaw);
  return sx * landward[0] + sz * landward[1] >= 0 ? 1 : -1;
}
export function gangwayFoot(headX, headY, x0, x1) {
  if (headY <= QUAY_DECK_UP + QUAY_KERB_H) return { x: x0, y: QUAY_DECK_UP + QUAY_KERB_H };
  const run = (headY - QUAY_DECK_UP) / Math.tan(GANGWAY_SLOPE * DEG);
  return { x: Math.min(x1 - GANGWAY_BACK, Math.max(x0 + GANGWAY_CLEAR, headX + run)), y: QUAY_DECK_UP };
}
export const landwardOf = (berth) => [-berth.normal[0], -berth.normal[1]];
