// @ts-check
import { lwSeed, lwRng, rollInt, pickWeighted } from './seed.js';
import { seededRng } from '../../weather/wind.js';
import { DAY_MIN, DAY_START_MIN } from './dayPlan.js';
import { WORLD_MAP_TERRAIN_DIM as NATIVE_PIXEL } from '../../formats/mapsFile.js';
import { NATIVE_PER_M } from '../../travel/travelDungeons.js';
import { CITY_COURT_BLOCKS } from './census.js';
import { companiesOf, companyOfPlace, namedIn, COMPANY_DIVE_CHANCE, holyDayOf, holyDepartMin, holyDraw } from './companies.js';

export { NATIVE_PIXEL, NATIVE_PER_M };
export const NATIVE_BLOCK = 4096;
export const WALK_FROM_H = 7;
export const WALK_TO_H = 19;
export const TRADER_PACE_X = 2;
export const TRIP_PACE = Object.freeze({ merchant: 1.05 * TRADER_PACE_X, mercenary: 1.05 * TRADER_PACE_X, adventurer: 1.3, courier: 1.6, pilgrim: 1, sailor: 1.25, pedlar: 1 * TRADER_PACE_X });
export const CYCLE_DAYS = Object.freeze({ merchant: 7, adventurer: 7, pilgrim: 20, courier: 5, pedlar: 6 });
export const TRIP_CHANCE = Object.freeze({ merchant: 0.9, adventurer: 0.7, pilgrim: 0.5, courier: 0.9, pedlar: 0.85 });
export const TRIP_RANGE_PX = Object.freeze({ merchant: [3, 14], adventurer: [3, 12], pilgrim: [3, 18], courier: [4, 18], pedlar: [2, 6] });
export const STAY_DAYS = Object.freeze({ merchant: [1, 2], adventurer: [1, 1], pilgrim: [1, 2], courier: [0, 1], pedlar: [0, 1] });
export const HIRE_MAX = 3;
export const ROAD_PACE = Object.freeze({ carter: 0.8 * TRADER_PACE_X, hunter: 1, patrol: 1, noble: 0.85, retainer: 0.85, minstrel: 0.95 });
// A trip must fit its cycle with a day spare (`estDays <= len - 1`); a minstrel's trip takes five days, so a
// shorter cycle means no minstrel ever leaves.
export const ROAD_CYCLE_DAYS = Object.freeze({ carter: 7, hunter: 4, patrol: 6, noble: 20, minstrel: 6 });
export const ROAD_TRIP_CHANCE = Object.freeze({ carter: 0.8, hunter: 0.75, patrol: 0.95, noble: 0.6, minstrel: 0.8 });
// The carter range is what a morning walk covers between `WALK_FROM_H` and `MARKET_IN_H` at carter pace.
export const ROAD_RANGE_PX = Object.freeze({ carter: [1, 2], hunter: [1, 3], patrol: [3, 12], noble: [6, 18], minstrel: [3, 8] });
export const ROAD_STAY_DAYS = Object.freeze({ carter: [0, 0], hunter: [0, 0], patrol: [0, 1], noble: [1, 2], minstrel: [1, 2] });
/**
 * @param {Record<string, any>} first
 * @param {Record<string, any>} road
 * @param {string} job
 */
const rowOf = (first, road, job) => first[job] ?? road[job];
export const MARKET_BLOCKS = 4;
export const MARKET_IN_H = 12;
export const MARKET_OUT_H = 13.5;
export const WILD_TRIES = 6;
export const INN_TYPE = 6;
export const INN_REACH_PX = 1;
export const INN_AHEAD_N = NATIVE_PIXEL;
export const PATROL_COVER_DAYS = 2;
export const PATROL_RISK = 0.5;
export const TRIP_REACH_PX = 18;
// Packs a pixel and a reach into one number, valid for px in [-512, 1536) and py in [-256, 768). `LIVING_NEAR_KEPT`
// must exceed the pixels of one long way, since `innsAlong` asks at each.
export const livingNearKey = (px, py, r) => (r * 1024 + (py + 256)) * 2048 + (px + 512);
export const LIVING_NEAR_KEPT = 8192;
export const DIVE_CHANCE = 0.55;
export const DIVE_RANGE_PX = Object.freeze([1, 8]);
export const DIVE_MIN = Object.freeze([240, 600]);
export const SEA_CHANCE = Object.freeze({ merchant: 0.4, pilgrim: 0.3, courier: 0.35, pedlar: 0.2, adventurer: 0.15 });
export const SEA_PACE_X = 3;
export const SEA_TIDE_H = Object.freeze([6, 9]);
// Classic walking speed, 1.3 m/s, divided by the classic clock rate of 0.2 game minutes per real second.
export const CALENDAR_MPM = 1.3 / 0.2;
// `STOP_RING_N` stays above livingRoads.js `FOE_RING_N` so a beset party's enemies also spawn on dry ground.
export const STOP_RING_N = 200;
export const DRY_STEP_N = 80;

/**
 * @typedef {import('./census.js').Resident} Resident
 * @typedef {import('./census.js').LwTown} LwTown
 * @typedef {{ pixels: { x: number, y: number }[], kinds?: string[] }} RoutePlan
 * @typedef {{ pts: number[][], cum: number[], len: number, kinds: string[], dry?: (nx: number, nz: number) => boolean, inns?: { s: number, town: LwTown }[] }} Way
 * @typedef {{ townsNear: (px: number, py: number, rMax: number) => LwTown[], routeOf: (a: LwTown, b: LwTown) => (RoutePlan | null | undefined), rosterOf: (town: LwTown) => Resident[], templeTown?: (town: LwTown) => boolean, holderOf?: (res: Resident, k: number) => (Resident | null), dungeonsNear?: (px: number, py: number, rMax: number) => LwTown[], fated?: (res: Resident, k: number) => boolean, fate?: (trip: Trip) => (Trip | undefined), lanesFrom?: (town: LwTown) => ({ to: LwTown, len: number, key: string }[] | undefined), dryAt?: (nx: number, nz: number) => boolean, marketBandOf?: (town: LwTown, day: number) => (string | null), }} TripWorld
 * @typedef {{ id: string, k?: number, kind: string, leader: Resident, party: Resident[], from: LwTown, to: LwTown, way: Way, pace: number, outT0: number, outT1: number, backT0: number, backT1: number, trim0: number, trim1: number, enc?: any, halt?: { t0: number, t1: number, fightEnd: number, s: number, leg: 'out'|'back' }, fallen?: { res: Resident, t: number, s: number, inside?: boolean, hand?: boolean, atSea?: boolean }[], turned?: boolean, dive?: { t0: number, t1: number }, sea?: { key: string, len: number }, market?: boolean, wild?: { x: number, z: number }, company?: { key: string, name: string }, holy?: { day: number, id: number }, hiredBy?: string }} Trip
 */

/** @param {number} mpm */
export const paceScale = (mpm) => Math.max(1, CALENDAR_MPM / Math.max(0.1, mpm));

/**
 * @param {number} a
 * @param {number} b
 */
export function walkedMinutes(a, b) {
  if (!(b > a)) return 0;
  const from = WALK_FROM_H * 60, to = WALK_TO_H * 60;
  let total = 0;
  let day = Math.floor(a / DAY_MIN);
  for (; day * DAY_MIN < b; day++) {
    const lo = Math.max(a, day * DAY_MIN + from), hi = Math.min(b, day * DAY_MIN + to);
    if (hi > lo) total += hi - lo;
  }
  return total;
}

/**
 * @param {number} a
 * @param {number} minutes
 */
export function whenWalked(a, minutes) {
  let left = Math.max(0, minutes);
  const from = WALK_FROM_H * 60, to = WALK_TO_H * 60;
  let day = Math.floor(a / DAY_MIN);
  let t = a;
  for (let guard = 0; guard < 4000; guard++, day++) {
    const lo = Math.max(t, day * DAY_MIN + from), hi = day * DAY_MIN + to;
    if (hi > lo) {
      if (hi - lo >= left) return lo + left;
      left -= hi - lo;
    }
    t = (day + 1) * DAY_MIN;
  }
  return t;
}

/**
 * @param {RoutePlan} plan
 * @param {((nx: number, nz: number) => boolean) | null} [dry]
 * @returns {Way}
 */
export function wayOf(plan, dry = null) {
  const pts = (plan?.pixels ?? []).map((p) => [p.x * NATIVE_PIXEL + NATIVE_PIXEL / 2, (499 - p.y) * NATIVE_PIXEL + NATIVE_PIXEL / 2]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  /** @type {Way} */
  const way = { pts, cum, len: cum[cum.length - 1] ?? 0, kinds: [...(plan?.kinds ?? [])] };
  if (dry) way.dry = dry;
  return way;
}

/**
 * @param {(px: number, py: number, fx: number, fz: number) => boolean} dry
 * @returns {(nx: number, nz: number) => boolean}
 */
export function nativeDry(dry) {
  return (nx, nz) => {
    const gx = nx / NATIVE_PIXEL, gz = nz / NATIVE_PIXEL;
    const px = Math.floor(gx), pz = Math.floor(gz);
    return dry(px, 499 - pz, gx - px, gz - pz);
  };
}

/** @type {WeakMap<Way, Map<string, number>>} */
const stopsOf = new WeakMap();

/**
 * The route planner marks water per whole pixel, so a straight leg along a coast can cross the sea. Stops move to
 * the first dry place on, or the leg end.
 * @param {Way} way
 * @param {number} s
 * @param {1|-1} dir
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
export function dryStop(way, s, dir, lo, hi) {
  const dry = way.dry;
  if (!dry) return s;
  let kept = stopsOf.get(way);
  if (!kept) stopsOf.set(way, kept = new Map());
  const key = `${dir}:${s}:${lo}:${hi}`;
  const known = kept.get(key);
  if (known !== undefined) return known;
  let found = dir > 0 ? hi : lo;
  for (let at = s; at >= lo && at <= hi; at += dir * DRY_STEP_N) {
    const p = wayAt(way, at);
    let ok = dry(p.x, p.z);
    for (let i = 0; ok && i < 8; i++) ok = dry(p.x + Math.sin((i * Math.PI) / 4) * STOP_RING_N, p.z + Math.cos((i * Math.PI) / 4) * STOP_RING_N);
    if (ok) { found = at; break; }
  }
  kept.set(key, found);
  return found;
}

/** @param {number} t */
const lastDusk = (t) => { const d = Math.floor(t / DAY_MIN) * DAY_MIN + WALK_TO_H * 60; return d <= t ? d : d - DAY_MIN; };

/**
 * @param {Way} way
 * @param {number} s
 */
export function wayAt(way, s) {
  const { pts, cum } = way;
  if (!pts.length) return { x: 0, z: 0, yaw: 0 };
  if (pts.length === 1) return { x: pts[0][0], z: pts[0][1], yaw: 0 };
  const d = Math.max(0, Math.min(way.len, s));
  let i = 1;
  while (i < pts.length - 1 && cum[i] < d) i++;
  const a = pts[i - 1], b = pts[i];
  const seg = cum[i] - cum[i - 1];
  const k = seg > 0 ? (d - cum[i - 1]) / seg : 0;
  return { x: a[0] + (b[0] - a[0]) * k, z: a[1] + (b[1] - a[1]) * k, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) };
}

export const LANE_EASE_N = 400;

/**
 * Near a corner the line becomes a quadratic curve with the corner as its middle control point, so a lane offset
 * never jumps or folds. For a right angle the tightest radius is 7 m.
 * @param {Way} way
 * @param {number} s
 * @param {number} side
 */
export function laneAt(way, s, side) {
  const { pts, cum } = way;
  const p = wayAt(way, s);
  let x = p.x, z = p.z, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  if (pts.length >= 3) {
    const d = Math.max(0, Math.min(way.len, s));
    let i = 1;
    while (i < pts.length - 1 && cum[i] < d) i++;
    const ease = (/** @type {number} */ j) => Math.min(LANE_EASE_N, (cum[j] - cum[j - 1]) / 2, (cum[j + 1] - cum[j]) / 2);
    const j = i < pts.length - 1 && cum[i] - d < ease(i) ? i : i > 1 && d - cum[i - 1] < ease(i - 1) ? i - 1 : 0;
    if (j) {
      const e = ease(j), v = pts[j];
      const ia = Math.hypot(v[0] - pts[j - 1][0], v[1] - pts[j - 1][1]) || 1, ib = Math.hypot(pts[j + 1][0] - v[0], pts[j + 1][1] - v[1]) || 1;
      const ux = (v[0] - pts[j - 1][0]) / ia, uz = (v[1] - pts[j - 1][1]) / ia, wx = (pts[j + 1][0] - v[0]) / ib, wz = (pts[j + 1][1] - v[1]) / ib;
      const t = (d - (cum[j] - e)) / (2 * e), u = 1 - t;
      x = v[0] - e * ux * u * u + e * wx * t * t;
      z = v[1] - e * uz * u * u + e * wz * t * t;
      fx = ux * u + wx * t; fz = uz * u + wz * t;
      const n = Math.hypot(fx, fz) || 1;
      fx /= n; fz /= n;
    }
  }
  return { x: x + fz * side, z: z - fx * side, yaw: Math.atan2(fx, fz) };
}

/** @param {LwTown} town */
export const townTrim = (town) => (Math.ceil(Math.sqrt(Math.max(1, town.blocks | 0))) * NATIVE_BLOCK) / 2 + NATIVE_BLOCK / 2;

/**
 * Measures to the rectangular grid box of the town, not a radius, because walls follow the grid edge and a radius
 * trim ends a diagonal way inside them.
 * @param {LwTown} town
 * @param {Way} way
 * @param {boolean} [fromEnd]
 */
export function townExit(town, way, fromEnd = false) {
  const w = town?.w ?? 0, h = town?.h ?? 0;
  const pts = way?.pts ?? [];
  if (!(w > 0 && h > 0) || pts.length < 2) return townTrim(town);
  const ex = (w * NATIVE_BLOCK) / 2 + NATIVE_BLOCK / 2, ez = (h * NATIVE_BLOCK) / 2 + NATIVE_BLOCK / 2;
  const at = (i) => pts[fromEnd ? pts.length - 1 - i : i];
  const [cx, cz] = at(0);
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = at(i - 1), b = at(i);
    const dx = b[0] - a[0], dz = b[1] - a[1], seg = Math.hypot(dx, dz);
    if (Math.abs(b[0] - cx) > ex || Math.abs(b[1] - cz) > ez) {
      let t = 1;
      if (dx) t = Math.min(t, ((dx > 0 ? ex : -ex) - (a[0] - cx)) / dx);
      if (dz) t = Math.min(t, ((dz > 0 ? ez : -ez) - (a[1] - cz)) / dz);
      return run + Math.max(0, t) * seg;
    }
    run += seg;
  }
  return run;
}
/**
 * @param {LwTown} home
 * @param {LwTown | null} to
 * @param {Way} way
 * @returns {[number, number]}
 */
export function wayTrims(home, to, way) {
  const t0 = townExit(home, way), t1 = to ? townExit(to, way, true) : 0;
  if (t0 + t1 < way.len) return [t0, t1];
  return [Math.min(t0, way.len * 0.4), to ? Math.min(t1, way.len * 0.4) : 0];
}

/**
 * @param {Resident} res
 * @param {number} day
 * @param {number} scale
 */
export function cycleOf(res, day, scale) {
  const len = Math.max(2, Math.round((rowOf(CYCLE_DAYS, ROAD_CYCLE_DAYS, res.job) ?? 8) * scale));
  const phase = lwSeed(res.town, res.slot, 0x6379) % len;
  const k = Math.floor((day + phase) / len);
  return { k, start: k * len - phase, len };
}

/**
 * @param {string} job
 * @param {LwTown} home
 * @param {LwTown} t
 */
export function roadBound(job, home, t) {
  if (job === 'patrol') return home.region == null || t.region === home.region;
  if (job === 'noble') return t.type === 0 && (t.blocks | 0) >= CITY_COURT_BLOCKS;
  if (job === 'minstrel') return (t.blocks | 0) >= MARKET_BLOCKS;
  return true;
}

/**
 * @param {Resident} res
 * @param {Resident[]} roster
 * @returns {Resident|null}
 */
export function leaderOf(res, roster) {
  if (res.job === 'mercenary') return contractOf(res, roster);
  if (res.job === 'patrol') {
    const first = roster.filter((r) => r.job === 'patrol').sort((a, b) => a.slot - b.slot)[0] ?? null;
    return first && first.slot !== res.slot ? first : null;
  }
  if (res.job === 'adventurer') {
    const c = companyOfPlace(res, roster);
    return c && c.places[0].slot !== res.slot ? c.places[0] : null;
  }
  if (res.job === 'retainer') {
    const nobles = roster.filter((r) => r.job === 'noble').sort((a, b) => a.slot - b.slot);
    const i = roster.filter((r) => r.job === 'retainer').sort((a, b) => a.slot - b.slot).findIndex((r) => r.slot === res.slot);
    return nobles.length && i >= 0 ? nobles[i % nobles.length] : null;
  }
  return null;
}

// Every carter reaches a Destitute market only because the online carter cycle is exactly fourteen days; changing
// either value leaves cycles with no market.
export const MARKET_BOOM_DAY = 4;
export const MARKET_DESTITUTE_WEEKS = 2;
/**
 * @param {LwTown} town
 * @param {number} day
 * @param {string|null} [band]
 */
export const marketDay = (town, day, band = null) => {
  const s = day + (lwSeed(town.mapId >>> 0, 0x6d6b74) % 7);
  if (band === 'Destitute') return s % 7 === 0 && Math.floor(s / 7) % MARKET_DESTITUTE_WEEKS === 0;
  return s % 7 === 0 || (band === 'Booming' && s % 7 === MARKET_BOOM_DAY);
};

/**
 * @param {Resident} res
 * @param {LwTown} home
 * @param {number} k
 * @param {TripWorld} world
 * @param {{ start: number, len: number, pace: number, rng: () => number }} o
 * @returns {Trip|null|undefined}
 */
export function marketTrip(res, home, k, world, { start, len, pace, rng }) {
  const [, rMax] = ROAD_RANGE_PX.carter;
  const dist = (/** @type {LwTown} */ t) => Math.hypot((t.px ?? 0) - (home.px ?? 0), (t.py ?? 0) - (home.py ?? 0));
  const near = world.townsNear(home.px ?? 0, home.py ?? 0, rMax)
    .filter((t) => t.mapId !== home.mapId && (t.blocks | 0) >= MARKET_BLOCKS && (t.type == null || t.type === 0 || t.type === 2))
    .sort((a, b) => dist(a) - dist(b) || a.mapId - b.mapId);
  const leave = Math.floor((5 + rng()) * 60);
  for (const to of near) {
    let day = -1;
    for (let d = start; d < start + len; d++) if (marketDay(to, d, world.marketBandOf?.(to, d) ?? null)) { day = d; break; }
    if (day < 0) continue;
    const plan = world.routeOf(home, to);
    if (plan === undefined) return undefined;
    if (!plan || !(plan.pixels?.length >= 2)) continue;
    const way = wayOf(plan, world.dryAt);
    const [trim0, trim1] = wayTrims(home, to, way);
    const walk = Math.max(0, way.len - trim0 - trim1) / pace;
    const outT0 = day * DAY_MIN + leave;
    const outT1 = whenWalked(outT0, walk);
    if (outT1 > day * DAY_MIN + MARKET_IN_H * 60) continue;
    const backT0 = day * DAY_MIN + MARKET_OUT_H * 60;
    const backT1 = whenWalked(backT0, walk);
    if (backT1 > day * DAY_MIN + WALK_TO_H * 60) continue;
    return { id: `${res.id}:${k}`, k, kind: res.job, leader: res, party: [res], from: home, to, way, pace,
      outT0, outT1, backT0, backT1, trim0, trim1, market: true };
  }
  return null;
}

/**
 * @param {number} px
 * @param {number} py
 * @returns {LwTown}
 */
const wildOf = (px, py) => ({ mapId: -1, name: 'the wild', px, py, blocks: 1, wild: true });

/**
 * @param {Resident} res
 * @param {LwTown} home
 * @param {number} k
 * @param {TripWorld} world
 * @param {{ start: number, len: number, pace: number, rng: () => number }} o
 * @returns {Trip|null}
 */
export function wildTrip(res, home, k, world, { start, len, pace, rng }) {
  const hx = ((home.px ?? 0) + 0.5) * NATIVE_PIXEL, hz = (499 - (home.py ?? 0) + 0.5) * NATIVE_PIXEL;
  const [rMin, rMax] = ROAD_RANGE_PX.hunter;
  for (let i = 0; i < WILD_TRIES; i++) {
    const ang = rng() * Math.PI * 2, d = (rMin + rng() * (rMax - rMin)) * NATIVE_PIXEL;
    const wx = hx + Math.sin(ang) * d, wz = hz + Math.cos(ang) * d;
    const ppx = Math.floor(wx / NATIVE_PIXEL), ppy = 499 - Math.floor(wz / NATIVE_PIXEL);
    if (world.townsNear(ppx, ppy, 0).length) continue;
    let dry = true;
    for (let j = 1; dry && j <= 4; j++) dry = !world.dryAt || world.dryAt(hx + ((wx - hx) * j) / 4, hz + ((wz - hz) * j) / 4);
    if (!dry) continue;
    /** @type {Way} */
    const way = { pts: [[hx, hz], [wx, wz]], cum: [0, d], len: d, kinds: ['open'] };
    if (world.dryAt) way.dry = world.dryAt;
    const [trim0, trim1] = wayTrims(home, null, way);
    const walk = Math.max(0, d - trim0) / pace;
    const estDays = 3;
    if (estDays > len - 1) return null;
    const dayOffset = Math.floor(rng() * (len - estDays));
    const outT0 = (start + dayOffset) * DAY_MIN + Math.floor((6 + rng()) * 60);
    const outT1 = whenWalked(outT0, walk);
    const backT0 = (Math.floor(outT1 / DAY_MIN) + 1) * DAY_MIN + Math.floor((8 + rng() * 2) * 60);
    const backT1 = whenWalked(backT0, walk);
    if (backT1 > (start + len) * DAY_MIN + DAY_START_MIN) return null;
    return { id: `${res.id}:${k}`, k, kind: res.job, leader: res, party: [res], from: home, to: wildOf(ppx, ppy), way, pace,
      outT0, outT1, backT0, backT1, trim0, trim1, wild: { x: wx, z: wz } };
  }
  return null;
}

/**
 * @param {Way} way
 * @param {RoutePlan} plan
 * @param {TripWorld} world
 * @param {LwTown} home
 * @param {LwTown} to
 * @returns {Way}
 */
export function innsAlong(way, plan, world, home, to) {
  /** @type {Map<number, { s: number, town: LwTown }>} */
  const found = new Map();
  const px = plan?.pixels ?? [];
  for (let i = 0; i < px.length; i++) {
    for (const t of world.townsNear(px[i].x, px[i].y, INN_REACH_PX)) {
      if (t.type !== INN_TYPE || t.mapId === home.mapId || t.mapId === to.mapId || found.has(t.mapId)) continue;
      found.set(t.mapId, { s: way.cum[i] ?? 0, town: t });
    }
  }
  if (found.size) way.inns = [...found.values()].sort((a, b) => a.s - b.s || a.town.mapId - b.town.mapId);
  return way;
}

/**
 * @param {Way} way
 * @param {number} s
 * @param {1|-1} dir
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
export function nightStop(way, s, dir, lo, hi) {
  const inn = innAhead(way, s, dir, lo, hi);
  return inn ? inn.s : dryStop(way, s, dir, lo, hi);
}

/**
 * @param {Way} way
 * @param {number} s
 * @param {1|-1} dir
 * @param {number} lo
 * @param {number} hi
 */
export function innAhead(way, s, dir, lo, hi) {
  let best = null;
  for (const inn of way.inns ?? []) {
    const ahead = dir * (inn.s - s);
    if (ahead < 0 || ahead > INN_AHEAD_N || inn.s < lo || inn.s > hi) continue;
    if (!best || ahead < dir * (best.s - s)) best = inn;
  }
  return best;
}

/**
 * @param {Resident} res
 * @param {LwTown} home
 * @param {number} k
 * @param {TripWorld} world
 * @param {{ mpm: number }} o
 * @returns {Trip|null|undefined}
 */
export function ownTrip(res, home, k, world, { mpm }) {
  const chance = rowOf(TRIP_CHANCE, ROAD_TRIP_CHANCE, res.job);
  if (!(chance > 0)) return null;
  if ((res.job === 'patrol' || res.job === 'adventurer') && leaderOf(res, world.rosterOf(home))) return null;
  const company = res.job === 'adventurer' ? companyOfPlace(res, world.rosterOf(home)) : null;
  // A fated rider sends out the whole patrol, company or procession, so no member dies abroad without a road under
  // them.
  const riders = company ? company.places.slice(1) : res.job === 'patrol' ? world.rosterOf(home).filter((r) => r.job === 'patrol' && r.slot !== res.slot)
    : res.job === 'noble' ? world.rosterOf(home).filter((r) => r.job === 'retainer' && leaderOf(r, world.rosterOf(home))?.slot === res.slot) : [];
  const scale = paceScale(mpm);
  const len = Math.max(2, Math.round((rowOf(CYCLE_DAYS, ROAD_CYCLE_DAYS, res.job) ?? 8) * scale));
  const phase = lwSeed(res.town, res.slot, 0x6379) % len;
  const start = k * len - phase;
  const rng = lwRng(res.town, res.slot, k, 0x74726970);
  const goes = rng() < chance || !!world.fated?.(res, k) || riders.some((p) => world.fated?.(p, k));
  const holyCycle = res.job === 'pilgrim' && !!world.templeTown;
  if (!goes && !holyCycle) return null;
  const pace = (rowOf(TRIP_PACE, ROAD_PACE, res.job) ?? 1) * mpm * NATIVE_PER_M;
  if (res.job === 'carter') return marketTrip(res, home, k, world, { start, len, pace, rng });
  if (res.job === 'hunter') return wildTrip(res, home, k, world, { start, len, pace, rng });
  // Dives and sea passages draw from their own seeded streams, so a cycle without one keeps the trip it would
  // otherwise make.
  if (res.job === 'adventurer' && world.dungeonsNear) {
    const drng = lwRng(res.town, res.slot, k, 0x64697665);
    if (drng() < (company ? COMPANY_DIVE_CHANCE : DIVE_CHANCE)) {
      const dive = diveTrip(res, home, k, world, { start, len, pace, rng: drng });
      if (dive !== null) return dive;
    }
  }
  if (holyCycle) {
    const holy = holyTrip(res, home, k, world, { start, len, pace });
    if (holy !== null) return holy;
    if (!goes) return null;
  }
  const seaShare = SEA_CHANCE[/** @type {keyof typeof SEA_CHANCE} */ (res.job)] ?? 0;
  if (home.port && world.lanesFrom && seaShare > 0) {
    const srng = lwRng(res.town, res.slot, k, 0x736561);
    if (srng() < seaShare) {
      const sea = seaTrip(res, home, k, world, { start, len, mpm, pace, rng: srng });
      if (sea !== null) return sea;
    }
  }
  const order = roadOrder(rng, home, res.job, world);
  if (!order) return null;
  const [sLo, sHi] = rowOf(STAY_DAYS, ROAD_STAY_DAYS, res.job) ?? [1, 1];
  const stay = rollInt(rng, sLo, sHi);
  const departH = res.job === 'adventurer' ? 6 + rng() * 2 : 7 + rng() * 2;
  const offsetRoll = rng();
  for (const to of order) {
    const plan = world.routeOf(home, to);
    if (plan === undefined) return undefined;
    if (!plan || !(plan.pixels?.length >= 2)) continue;
    const way = innsAlong(wayOf(plan, world.dryAt), plan, world, home, to);
    const [trim0, trim1] = wayTrims(home, /** @type {LwTown} */ (to), way);
    const walk = Math.max(0, way.len - trim0 - trim1) / pace;
    const estDays = 2 * Math.ceil(walk / ((WALK_TO_H - WALK_FROM_H) * 60)) + stay + 1;
    if (estDays > len - 1) continue;
    const dayOffset = Math.floor(offsetRoll * (len - estDays));
    const outT0 = (start + dayOffset) * DAY_MIN + Math.floor(departH * 60);
    const outT1 = whenWalked(outT0, walk);
    const arriveDay = Math.floor(outT1 / DAY_MIN);
    const morning = (d) => d * DAY_MIN + 7 * 60 + (lwSeed(res.town, res.slot, k, 0x6261) % 120);
    const backT0 = Math.max(outT1 + 60, stay > 0 ? morning(arriveDay + stay) : (outT1 - arriveDay * DAY_MIN < 12 * 60 ? outT1 + 120 : morning(arriveDay + 1)));
    const backT1 = whenWalked(backT0, walk);
    if (backT1 > (start + len) * DAY_MIN + DAY_START_MIN) continue;
    return { id: `${res.id}:${k}`, k, kind: res.job, leader: res, party: [res], from: home, to: /** @type {LwTown} */ (to), way, pace,
      outT0, outT1, backT0, backT1, trim0, trim1 };
  }
  return null;
}

/**
 * @param {LwTown} home
 * @param {string} job
 * @param {TripWorld} world
 * @returns {{ picks: { town: LwTown, w: number }[], total: number, farFirst: { town: LwTown, d: number }[] } | null}
 */
const _roadChoices = new WeakMap();
export const ROAD_CHOICES_KEPT = 2048;
export function roadChoices(home, job, world) {
  let byHome = _roadChoices.get(world);
  if (!byHome) _roadChoices.set(world, (byHome = new Map()));
  const key = `${home.mapId}:${job}`;
  const kept = byHome.get(key);
  if (kept !== undefined) { byHome.delete(key); byHome.set(key, kept); return kept; }
  const [rMin, rMax] = rowOf(TRIP_RANGE_PX, ROAD_RANGE_PX, job) ?? [3, 12];
  const near = world.townsNear(home.px ?? 0, home.py ?? 0, rMax)
    .filter((t) => t.mapId !== home.mapId && Math.max(Math.abs((t.px ?? 0) - (home.px ?? 0)), Math.abs((t.py ?? 0) - (home.py ?? 0))) >= rMin)
    .filter((t) => roadBound(job, home, t));
  if (!near.length) { keepChoices(byHome, key, null); return null; }
  const dist = new Map(near.map((t) => [t, Math.hypot((t.px ?? 0) - (home.px ?? 0), (t.py ?? 0) - (home.py ?? 0))]));
  /** @type {Record<string, number>} */
  const weights = {};
  /** @type {Map<string, LwTown>} */
  const townOf = new Map();
  for (const t of near) {
    const d = /** @type {number} */ (dist.get(t));
    const size = Math.pow(Math.max(1, t.blocks | 0), 0.7);
    let w = job === 'merchant' ? size / (1 + d / 8) : job === 'pilgrim' ? ((world.templeTown?.(t) ? 6 : 0.2) * size) / (1 + d / 12) : 1 / (1 + d / 10);
    if (job === 'adventurer') w = size / (1 + d / 6);
    else if (job === 'patrol' || job === 'noble' || job === 'minstrel') w = size / (1 + d / 8);
    const k = String(t.mapId);
    weights[k] = w;
    if (!townOf.has(k)) townOf.set(k, t);
  }
  const picks = [];
  let total = 0;
  for (const k in weights) if (weights[k] > 0) { total += weights[k]; picks.push({ town: /** @type {LwTown} */ (townOf.get(k)), w: weights[k] }); }
  const farFirst = near.map((t) => ({ town: t, d: /** @type {number} */ (dist.get(t)) })).sort((a, b) => b.d - a.d || a.town.mapId - b.town.mapId);
  const choices = { picks, total, farFirst };
  keepChoices(byHome, key, choices);
  return choices;
}
function keepChoices(byHome, key, choices) {
  byHome.set(key, choices);
  if (byHome.size <= ROAD_CHOICES_KEPT) return;
  for (const k of byHome.keys()) { byHome.delete(k); if (byHome.size <= ROAD_CHOICES_KEPT * 0.75) break; }
}

/**
 * Must take one draw and walk `picks` in the order `pickWeighted` walks the weights object (integer keys
 * ascending), so cached picks return the same town.
 * @param {() => number} rng
 * @param {{ picks: { town: LwTown, w: number }[], total: number }} choices
 * @returns {LwTown|null}
 */
function pickChoice(rng, { picks, total }) {
  if (!(total > 0)) return null;
  let r = rng() * total;
  let last = null;
  for (const p of picks) {
    last = p.town;
    r -= p.w;
    if (r < 0) return p.town;
  }
  return last;
}

/**
 * @param {() => number} rng
 * @param {LwTown} home
 * @param {string} job
 * @param {TripWorld} world
 * @returns {LwTown[]|null}
 */
export function roadOrder(rng, home, job, world) {
  const choices = roadChoices(home, job, world);
  if (!choices) return null;
  const first = pickChoice(rng, choices);
  if (!first) return null;
  const d0 = Math.hypot((first.px ?? 0) - (home.px ?? 0), (first.py ?? 0) - (home.py ?? 0));
  return [first, ...choices.farFirst.filter((c) => c.town !== first && c.d < d0).map((c) => c.town)];
}

const noWay = () => ({ pts: [], cum: [0], len: 0, kinds: [] });

/**
 * @param {LwTown} home
 * @param {TripWorld} world
 * @returns {LwTown[]}
 */
const _templesNear = new WeakMap();
export function templesNear(home, world) {
  let byHome = _templesNear.get(world);
  if (!byHome) _templesNear.set(world, (byHome = new Map()));
  const kept = byHome.get(home.mapId);
  if (kept) return kept;
  const [rMin, rMax] = TRIP_RANGE_PX.pilgrim;
  const dist = (t) => Math.hypot((t.px ?? 0) - (home.px ?? 0), (t.py ?? 0) - (home.py ?? 0));
  const temples = world.townsNear(home.px ?? 0, home.py ?? 0, rMax)
    .filter((t) => t.mapId !== home.mapId && Math.max(Math.abs((t.px ?? 0) - (home.px ?? 0)), Math.abs((t.py ?? 0) - (home.py ?? 0))) >= rMin && !!world.templeTown?.(t))
    .sort((a, b) => dist(a) - dist(b) || a.mapId - b.mapId);
  byHome.set(home.mapId, temples);
  return temples;
}

export const HOLY_IN_H = 10;
/**
 * @param {Resident} res
 * @param {LwTown} home
 * @param {number} k
 * @param {TripWorld} world
 * @param {{ start: number, len: number, pace: number }} o
 * @returns {Trip|null|undefined}
 */
export function holyTrip(res, home, k, world, { start, len, pace }) {
  if (!holyDraw(res, k)) return null;
  const holy = holyDayOf(templesNear(home, world), start, len);
  if (!holy) return null;
  const plan = world.routeOf(home, holy.town);
  if (plan === undefined) return undefined;
  if (!plan || !(plan.pixels?.length >= 2)) return null;
  const to = /** @type {LwTown} */ (holy.town);
  const way = innsAlong(wayOf(plan, world.dryAt), plan, world, home, to);
  const [trim0, trim1] = wayTrims(home, to, way);
  const walk = Math.max(0, way.len - trim0 - trim1) / pace;
  const by = holy.day * DAY_MIN + HOLY_IN_H * 60;
  let outDay = holy.day - Math.ceil(walk / ((WALK_TO_H - WALK_FROM_H) * 60));
  let outT0 = outDay * DAY_MIN + holyDepartMin(home, holy.day), outT1 = whenWalked(outT0, walk);
  for (let i = 0; i < 2 && outT1 > by; i++) { outDay--; outT0 = outDay * DAY_MIN + holyDepartMin(home, holy.day); outT1 = whenWalked(outT0, walk); }
  if (outT1 > by) return null;
  const backT0 = (holy.day + 1) * DAY_MIN + 7 * 60 + (lwSeed(home.mapId >>> 0, holy.day, 0x6261) % 120);
  const backT1 = whenWalked(backT0, walk);
  if (outT0 < start * DAY_MIN || backT1 > (start + len) * DAY_MIN + DAY_START_MIN) return null;
  return { id: `${res.id}:${k}`, k, kind: res.job, leader: res, party: [res], from: home, to, way, pace,
    outT0, outT1, backT0, backT1, trim0, trim1, holy: { day: holy.day, id: holy.id } };
}

/**
 * @param {Resident} res
 * @param {LwTown} home
 * @param {number} k
 * @param {TripWorld} world
 * @param {{ start: number, len: number, mpm: number, pace: number, rng: () => number }} o
 * @returns {Trip|null|undefined}
 */
export function seaTrip(res, home, k, world, { start, len, mpm, pace, rng }) {
  const all = world.lanesFrom?.(home);
  if (all === undefined) return undefined;
  const lanes = all.filter((l) => l.to && l.to.mapId !== home.mapId && l.len > 0);
  if (!lanes.length) return null;
  /** @type {Record<string, number>} */
  const weights = {};
  for (const l of lanes) {
    const size = Math.pow(Math.max(1, l.to.blocks | 0), 0.7);
    const temple = res.job === 'pilgrim' ? (world.templeTown?.(l.to) ? 6 : 0.2) : 1;
    weights[l.key] = (temple * size) / (1 + l.len / 10000);
  }
  const pick = pickWeighted(rng, weights);
  const first = lanes.find((l) => l.key === pick);
  if (!first) return null;
  const order = [first, ...lanes.filter((l) => l !== first && l.len < first.len).sort((a, b) => b.len - a.len || (a.key < b.key ? -1 : 1))];
  const [sLo, sHi] = STAY_DAYS[/** @type {keyof typeof STAY_DAYS} */ (res.job)] ?? [1, 1];
  const stay = rollInt(rng, sLo, sHi);
  const tideMin = Math.floor((SEA_TIDE_H[0] + rng() * (SEA_TIDE_H[1] - SEA_TIDE_H[0])) * 60);
  const offsetRoll = rng();
  const cycleEnd = (start + len) * DAY_MIN + DAY_START_MIN;
  for (const l of order) {
    const cross = Math.ceil(l.len / (Math.max(0.1, mpm) * SEA_PACE_X));
    const span = Math.ceil((2 * cross) / DAY_MIN) + Math.max(1, stay) + 1;
    const outT0 = (start + Math.floor(offsetRoll * Math.max(0, len - span))) * DAY_MIN + tideMin;
    const outT1 = outT0 + cross;
    const backT0 = Math.max(outT1 + 60, (Math.floor(outT1 / DAY_MIN) + Math.max(1, stay)) * DAY_MIN + tideMin);
    const backT1 = backT0 + cross;
    if (backT1 > cycleEnd) continue;
    return { id: `${res.id}:${k}`, k, kind: res.job, leader: res, party: [res], from: home, to: l.to, way: noWay(), pace,
      outT0, outT1, backT0, backT1, trim0: 0, trim1: 0, sea: { key: l.key, len: l.len } };
  }
  return null;
}

/**
 * @param {Resident} res
 * @param {LwTown} home
 * @param {number} k
 * @param {TripWorld} world
 * @param {{ start: number, len: number, pace: number, rng: () => number }} o
 * @returns {Trip|null|undefined}
 */
export function diveTrip(res, home, k, world, { start, len, pace, rng }) {
  const [rMin, rMax] = DIVE_RANGE_PX;
  const near = (world.dungeonsNear?.(home.px ?? 0, home.py ?? 0, rMax) ?? [])
    .filter((d) => Math.max(Math.abs((d.px ?? 0) - (home.px ?? 0)), Math.abs((d.py ?? 0) - (home.py ?? 0))) >= rMin);
  if (!near.length) return null;
  const dist = (d) => Math.hypot((d.px ?? 0) - (home.px ?? 0), (d.py ?? 0) - (home.py ?? 0));
  /** @type {Record<string, number>} */
  const weights = {};
  for (const d of near) weights[String(d.mapId)] = 1 / (1 + dist(d) / 4);
  const pick = pickWeighted(rng, weights);
  const first = near.find((d) => String(d.mapId) === pick);
  if (!first) return null;
  const order = [first, ...near.filter((d) => d !== first && dist(d) < dist(first)).sort((a, b) => dist(b) - dist(a) || a.mapId - b.mapId)];
  const inside = rollInt(rng, DIVE_MIN[0], DIVE_MIN[1]);
  const departH = 6 + rng() * 2;
  const offsetRoll = rng();
  for (const to of order) {
    const plan = world.routeOf(home, to);
    if (plan === undefined) return undefined;
    if (!plan || !(plan.pixels?.length >= 2)) continue;
    const way = wayOf(plan, world.dryAt);
    const [trim0, trim1] = wayTrims(home, to, way);
    const walk = Math.max(0, way.len - trim0 - trim1) / pace;
    const estDays = 2 * Math.ceil(walk / ((WALK_TO_H - WALK_FROM_H) * 60)) + Math.ceil(inside / DAY_MIN) + 1;
    if (estDays > len - 1) continue;
    const dayOffset = Math.floor(offsetRoll * (len - estDays));
    const outT0 = (start + dayOffset) * DAY_MIN + Math.floor(departH * 60);
    const outT1 = whenWalked(outT0, walk);
    const backT0 = outT1 + inside;
    const backT1 = whenWalked(backT0, walk);
    if (!(backT1 <= (start + len) * DAY_MIN + DAY_START_MIN)) continue;
    return { id: `${res.id}:${k}`, k, kind: res.job, leader: res, party: [res], from: home, to, way, pace,
      outT0, outT1, backT0, backT1, trim0, trim1, dive: { t0: outT1, t1: backT0 } };
  }
  return null;
}

/**
 * @param {Resident} res
 * @param {LwTown} town
 * @param {number} k
 * @param {TripWorld} world
 * @param {{ mpm: number, memo?: Map<string, Trip|null> }} o
 * @returns {Trip|null|undefined}
 */
export function memoTrip(res, town, k, world, o) {
  const key = `${res.id}:${k}`;
  let trip = o.memo?.get(key);
  if (trip === undefined) { trip = ownTrip(res, town, k, world, o); if (trip !== undefined) o.memo?.set(key, trip); }
  return trip;
}

/** @param {Resident[]} roster */
const dealOf = (roster) => ({
  merchants: roster.filter((r) => r.job === 'merchant').sort((a, b) => a.slot - b.slot),
  sellswords: roster.filter((r) => r.job === 'mercenary').sort((a, b) => a.slot - b.slot),
});

/**
 * @param {Resident} res
 * @param {Resident[]} roster
 */
export function contractOf(res, roster) {
  const { merchants, sellswords } = dealOf(roster);
  const i = sellswords.findIndex((r) => r.slot === res.slot);
  return merchants.length && i >= 0 ? merchants[i % merchants.length] : null;
}

/**
 * @param {Resident} res
 * @param {Resident[]} roster
 * @param {number} day
 * @param {number} scale
 */
export function placeCycle(res, roster, day, scale) {
  const m = leaderOf(res, roster);
  return cycleOf(m ?? res, day, scale).k;
}

/**
 * @param {Resident} res
 * @param {LwTown} town
 * @param {number} k
 * @param {TripWorld} world
 * @param {{ mpm: number, memo?: Map<string, Trip|null> }} o
 * @returns {boolean|undefined}
 */
export function setsOut(res, town, k, world, o) {
  let who = res;
  if (res.job === 'mercenary' || leaderOf(res, world.rosterOf(town))) {
    const m = leaderOf(res, world.rosterOf(town));
    const held = m && (world.holderOf ? world.holderOf(m, k) : m);
    if (!held) return false;
    who = held;
  }
  const trip = memoTrip(who, town, k, world, o);
  return trip === undefined ? undefined : !!trip;
}

/**
 * @param {LwTown} town
 * @param {number} t
 * @param {TripWorld} world
 * @param {{ mpm: number, memo?: Map<string, Trip|null> }} o
 * @returns {Trip[]|undefined}
 */
export function townTrips(town, t, world, o) {
  const scale = paceScale(o.mpm);
  const day = Math.floor(t / DAY_MIN);
  const roster = world.rosterOf(town);
  let pending = false;
  /**
   * @param {Resident} res
   * @param {number} k
   */
  const tripOf = (res, k) => {
    const trip = memoTrip(res, town, k, world, o);
    if (trip === undefined) pending = true;
    return trip ?? null;
  };
  const memo = /** @type {Map<string, any> | undefined} */ (o.memo);
  const key = `town:${town.mapId}:${day}`;
  let kept = memo?.get(key);
  if (kept && (kept.world !== world || kept.scale !== scale)) kept = undefined;
  if (!kept) {
    /** @type {Trip[]} */
    const cands = [];
    for (const res of roster) {
      if (!(rowOf(TRIP_CHANCE, ROAD_TRIP_CHANCE, res.job) > 0)) continue;
      const cyc = cycleOf(res, day, scale);
      for (const k of [cyc.k - 1, cyc.k]) {
        const holder = world.holderOf ? world.holderOf(res, k) : res;
        if (!holder) continue;
        const trip = tripOf(holder, k);
        if (trip) cands.push(trip);
      }
    }
    if (pending) return undefined;
    kept = { world, scale, cands, pass: /** @type {number[]|null} */ (null), out: /** @type {Trip[]|null} */ (null) };
    memo?.set(key, kept);
  }
  /** @type {number[]} */
  const pass = [];
  for (let i = 0; i < kept.cands.length; i++) { const trip = kept.cands[i]; if (trip.backT1 > t - DAY_MIN && trip.outT0 < t + DAY_MIN) pass.push(i); }
  const same = (/** @type {number[]} */ a, /** @type {number[]} */ b) => a.length === b.length && a.every((x, i) => x === b[i]);
  if (kept.out && same(kept.pass, pass)) return kept.out;
  const trips = pass.map((i) => kept.cands[i]);
  const made = formCaravans(town, trips, roster, tripOf, scale, world.holderOf, world.fated);
  if (pending) return undefined;
  const out = world.fate ? made.map((tr) => /** @type {Trip} */ (/** @type {any} */ (world.fate)(tr))) : made;
  if (out.some((tr) => !tr)) return undefined;
  kept.pass = pass; kept.out = out;
  return out;
}

const JOINS = new Set(['pilgrim', 'courier', 'pedlar']);

/**
 * Caravans depend only on the trips themselves, never on which trips a reader asked about, so a train read mid-walk
 * is the train that set out.
 * @param {LwTown} town
 * @param {Trip[]} trips
 * @param {Resident[]} roster
 * @param {(res: Resident, k: number) => Trip|null} tripOf
 * @param {number} scale
 * @param {(res: Resident, k: number) => (Resident | null)} [holderOf]
 * @param {(res: Resident, k: number) => boolean} [fated]
 * @returns {Trip[]}
 */
export function formCaravans(town, trips, roster, tripOf, scale, holderOf, fated) {
  const { merchants, sellswords } = dealOf(roster);
  const dayOf = (/** @type {Trip} */ tr) => Math.floor(tr.outT0 / DAY_MIN);
  const held = (/** @type {Resident} */ r, /** @type {number} */ k) => (holderOf ? holderOf(r, k) : r);
  /**
   * @param {Resident} r
   * @param {number} d
   */
  const placeTrip = (r, d) => { const k = cycleOf(r, d, scale).k; const h = held(r, k); return h ? tripOf(h, k) : null; };
  /** @param {Trip} j */
  const trainOf = (j) => {
    const d = dayOf(j);
    for (const m of merchants) {
      const mt = placeTrip(m, d);
      if (mt && mt.to.mapId === j.to.mapId && dayOf(mt) === d) return mt;
    }
    return null;
  };
  /** @param {Trip} tr */
  const hiredOf = (tr) => {
    const mi = merchants.findIndex((m) => m.slot === tr.leader.slot);
    const want = seededRng(lwSeed(tr.leader.town, tr.leader.slot, tr.outT0 | 0, 0x68697265))() * (HIRE_MAX + 1) | 0;
    const k = tr.k ?? cycleOf(tr.leader, dayOf(tr), scale).k;
    const contract = mi < 0 ? [] : sellswords.filter((_, i) => i % merchants.length === mi);
    return /** @type {Resident[]} */ (contract.map((sw, i) => { const h = held(sw, k); return h && (i < want || !!fated?.(h, k)) ? h : null; }).filter((h) => !!h));
  };
  const companies = companiesOf(roster);
  const membersOf = (/** @type {any} */ c, /** @type {Trip} */ tr) => {
    const k = tr.k ?? cycleOf(tr.leader, dayOf(tr), scale).k;
    return [tr.leader, ...c.places.slice(1).map((p) => held(p, k)).filter((h) => !!h)];
  };
  /** @param {Trip} ct */
  const trainFor = (ct) => {
    if (ct.dive || ct.sea) return null;
    const d = dayOf(ct);
    for (const m of merchants) {
      const mt = placeTrip(m, d);
      if (mt && !mt.sea && mt.to.mapId === ct.to.mapId && dayOf(mt) === d && !hiredOf(mt).length) return mt;
    }
    return null;
  };
  /**
   * Only the first company in deal order is hired on a train; any other company setting out with it keeps its own
   * trip.
   * @param {Trip} ct
   */
  const hireOf = (ct) => {
    const mt = trainFor(ct);
    if (!mt) return null;
    const d = dayOf(ct);
    const first = companies.find((c) => { const t = placeTrip(c.places[0], d); return !!t && trainFor(t)?.id === mt.id; });
    return first && first.places[0].slot === ct.leader.slot ? mt : null;
  };
  const pilgrims = roster.filter((r) => r.job === 'pilgrim').sort((a, b) => a.slot - b.slot);
  /** @param {Trip} pt */
  const bandOf = (pt) => {
    const d = dayOf(pt);
    return pilgrims.map((r) => placeTrip(r, d)).filter((t) => !!t && t.kind === 'pilgrim' && !t.sea && t.to.mapId === pt.to.mapId && dayOf(t) === d && !trainOf(t));
  };
  /** @type {Trip[]} */
  const out = [];
  for (const tr of trips) {
    if (tr.kind === 'merchant') {
      const hired = hiredOf(tr);
      const d = dayOf(tr);
      const joined = [];
      for (const r of roster) {
        if (!JOINS.has(r.job)) continue;
        const jt = placeTrip(r, d);
        if (jt && jt.to.mapId === tr.to.mapId && dayOf(jt) === d && trainOf(jt)?.id === tr.id) joined.push(jt.leader);
      }
      let hiredBy = null;
      if (!hired.length) {
        for (const c of companies) {
          const ct = placeTrip(c.places[0], d);
          if (ct && hireOf(ct)?.id === tr.id) { joined.push(...membersOf(c, ct)); hiredBy = c.key; break; }
        }
      }
      out.push({ ...tr, party: [tr.leader, ...hired, ...joined], ...(hiredBy ? { hiredBy } : {}) });
    } else if (tr.kind === 'patrol' || tr.kind === 'noble') {
      const k = tr.k ?? cycleOf(tr.leader, dayOf(tr), scale).k;
      const riders = roster.filter((r) => r.slot !== tr.leader.slot && leaderOf(r, roster)?.slot === tr.leader.slot).sort((a, b) => a.slot - b.slot);
      out.push({ ...tr, party: [tr.leader, ...riders.map((r) => held(r, k)).filter((h) => !!h)] });
    } else if (tr.kind === 'adventurer') {
      const c = companies.find((x) => x.places[0].slot === tr.leader.slot) ?? null;
      if (!c) out.push(tr);
      else if (!hireOf(tr)) { const named = namedIn(c, town.name ?? ''); out.push({ ...tr, party: membersOf(c, tr), company: { key: c.key, name: named.name } }); }
    } else if (tr.kind === 'pilgrim') {
      if (trainOf(tr)) continue;
      const band = bandOf(tr);
      if (band.length < 2) out.push(tr);
      else if (band[0].id === tr.id) out.push({ ...tr, party: band.map((t) => t.leader) });
    } else if (!(JOINS.has(tr.kind) && trainOf(tr))) out.push(tr);
  }
  return out;
}

export const NEWS_DAYS = 3;

/** @param {LwTown|null|undefined} to */
export const placeName = (to) => (to && !(to.mapId < 0) ? to.name ?? '' : '');

/**
 * @param {Trip[]} trips
 * @param {number} t
 * @returns {{ id: string, enc: string, kind: string, who: string, foe: number|null, place: string, t: number, dive: boolean, sea: boolean }[]}
 */
export function newsOf(trips, t) {
  const seen = new Set();
  const out = [];
  for (const tr of trips) {
    const enc = tr.enc;
    if (!enc || seen.has(tr.id)) continue;
    seen.add(tr.id);
    const known = tr.backT1;
    if (!(known <= t && t - known < NEWS_DAYS * DAY_MIN)) continue;
    const fell = tr.fallen?.filter((f) => !f.hand) ?? [];
    const who = fell[0]?.res ?? tr.leader;
    out.push({ id: tr.id, enc: enc.id, kind: fell.length ? 'fell' : enc.kind, who: who.name, foe: enc.foes?.[0] ?? null, ...(enc.bandName ? { band: enc.bandName } : {}), place: placeName(tr.to), t: known, dive: !!tr.dive, sea: !!tr.sea });
  }
  return out.sort((a, b) => b.t - a.t);
}

/**
 * @param {Trip} trip
 * @param {number} t
 * @returns {{ phase: 'home'|'out'|'stay'|'back'|'sea', x?: number, z?: number, yaw?: number, camp?: boolean, s?: number, halt?: boolean, fight?: boolean, inn?: LwTown }}
 */
export function partyAt(trip, t) {
  const { way, pace, trim0, trim1 } = trip;
  const walk = Math.max(0, way.len - trim0 - trim1);
  const daylight = (m) => { const h = (((m % DAY_MIN) + DAY_MIN) % DAY_MIN) / 60; return h >= WALK_FROM_H && h < WALK_TO_H; };
  if (t < trip.outT0 || t >= trip.backT1) return { phase: 'home' };
  if (trip.sea) return { phase: t < trip.outT1 || t >= trip.backT0 ? 'sea' : 'stay' };
  const light = daylight(trip.outT0) ? trip.outT0 : whenWalked(trip.outT0, 0);
  if (t < light) return { phase: 'home' };
  const h = trip.halt;
  const placed = (/** @type {'out'|'back'} */ phase, /** @type {number} */ s, extra = {}) => {
    const p = wayAt(way, s);
    return { phase, x: p.x, z: p.z, yaw: phase === 'back' ? p.yaw + Math.PI : p.yaw, camp: !daylight(t), s, ...extra };
  };
  if (h && t >= h.t0 && t < h.t1) return placed(h.leg, h.s, { halt: true, fight: t < h.fightEnd });
  // Night camps start from where the party stands at each dusk, and the position only moves forward along the leg.
  // Wet stretches or a dawn start never make the party jump.
  const walked = (/** @type {'out'|'back'} */ phase, /** @type {number} */ legT0, /** @type {(m: number) => number} */ sAt) => {
    const s = sAt(t);
    if (!way.dry && !way.inns) return placed(phase, s);
    const dir = phase === 'out' ? 1 : -1;
    const lo = trim0, hi = way.len - trim1;
    let fall = daylight(legT0) ? lastDusk(legT0) + DAY_MIN : legT0;
    if (t < fall) return placed(phase, s);
    let at = sAt(fall), camp = nightStop(way, at, dir, lo, hi);
    // The walk to the night's stop counts only minutes walked since dusk, excluding a halt, so a party leaving a
    // halt does not jump ahead.
    const held = (/** @type {number} */ a, /** @type {number} */ b) => (h && h.leg === phase ? Math.max(0, Math.min(b, h.t1) - Math.max(a, h.t0)) : 0);
    for (let next = lastDusk(fall) + DAY_MIN; next <= t; next += DAY_MIN) {
      const gone = next - fall - held(fall, next);
      const on = pace * gone >= Math.abs(camp - at) ? camp : at + dir * pace * gone;
      const w = sAt(next);
      at = dir * (w - on) >= 0 ? w : on;
      fall = next;
      camp = nightStop(way, at, dir, lo, hi);
    }
    const gone = t - fall - held(fall, t);
    const reached = pace * gone >= Math.abs(camp - at);
    const there = reached ? camp : at + dir * pace * gone;
    if (daylight(t) && dir * (s - there) >= 0) return { ...placed(phase, s), camp: false };
    const inn = reached ? way.inns?.find((i) => i.s === camp) ?? null : null;
    return { ...placed(phase, there), camp: reached, ...(inn ? { inn: inn.town } : {}) };
  };
  if (trip.turned && h && t >= h.t1) return walked('back', h.t1, (m) => Math.max(trim0, h.s - Math.min(h.s - trim0, pace * walkedMinutes(h.t1, m))));
  const lag = (/** @type {'out'|'back'} */ leg, /** @type {number} */ m) => {
    if (!h || h.leg !== leg || m < h.t0) return 0;
    return Math.max(0, pace * walkedMinutes(h.t0, h.t1) - HALT_CATCH_UP * pace * walkedMinutes(h.t1, m));
  };
  if (t < trip.outT1) return walked('out', light, (m) => Math.max(trim0, trim0 + Math.min(walk, pace * walkedMinutes(trip.outT0, m)) - lag('out', m)));
  if (t < trip.backT0 && trip.wild) {
    const sOut = (/** @type {number} */ m) => Math.max(trim0, trim0 + Math.min(walk, pace * walkedMinutes(trip.outT0, m)) - lag('out', m));
    const end = way.len - trim1, s1 = h && h.leg === 'out' && h.t1 >= trip.outT1 ? h.s : sOut(trip.outT1);
    const on = (/** @type {number} */ m) => (m < trip.outT1 ? sOut(m) : Math.min(end, s1 + (1 + HALT_CATCH_UP) * pace * walkedMinutes(trip.outT1, m)));
    if (end - s1 > 1 && on(t) < end) return walked('out', light, on);
  }
  if (t < trip.backT0) return trip.wild ? { ...placed('out', way.len - trim1), camp: true } : { phase: 'stay' };
  return walked('back', trip.backT0, (m) => Math.min(way.len - trim1, way.len - trim1 - Math.min(walk, pace * walkedMinutes(trip.backT0, m)) + lag('back', m)));
}

export const HALT_CATCH_UP = 0.5;

/**
 * @param {Trip} trip
 * @param {(res: Resident) => (number|null)} handOf
 * @returns {Trip}
 */
export function handsOn(trip, handOf) {
  const hands = [];
  for (const m of trip.party) {
    const t = handOf(m);
    if (t != null && t < trip.backT1) hands.push({ res: m, t, s: 0, hand: true });
  }
  return hands.length ? { ...trip, fallen: [...(trip.fallen ?? []), ...hands] } : trip;
}

/**
 * @param {Trip} trip
 * @param {number} t
 */
export const membersAt = (trip, t) => (trip.fallen?.length ? trip.party.filter((m) => !trip.fallen?.some((f) => f.res.id === m.id && f.t <= t)) : trip.party);

/** @param {Trip} trip */
export const leavingYaw = (trip) => wayAt(trip.way, trip.trim0 + 1).yaw;
/** @param {Trip} trip */
export const arrivingYaw = (trip) => wayAt(trip.way, trip.way.len - trip.trim1 - 1).yaw + Math.PI;

/**
 * @param {Resident} res
 * @param {Trip[]} trips
 * @returns {{ t0: number, t1: number, yaw: number, armed: boolean, dock: boolean }[]}
 */
export function awayOf(res, trips) {
  const out = [];
  for (const tr of trips) {
    if (!tr.party.some((p) => p.id === res.id)) continue;
    const fell = tr.fallen?.some((f) => f.res.id === res.id);
    // Uses first light as `partyAt` does, so a party leaving before dawn is never missing from both the town and
    // the road.
    const t0 = tr.sea ? tr.outT0 : whenWalked(tr.outT0, 0);
    out.push({ t0, t1: fell ? Infinity : tr.backT1, yaw: leavingYaw(tr), armed: res.cls != null, dock: !!tr.sea });
  }
  return out.sort((a, b) => a.t0 - b.t0);
}

/**
 * @param {LwTown} town
 * @param {number} day
 * @param {TripWorld} world
 * @param {{ mpm: number, memo?: Map<string, Trip|null> }} o
 * @returns {{ res: Resident, trip: Trip, inT: number, outT: number, yaw: number, dock: boolean }[] | undefined}
 */
export function visitorsOf(town, day, world, o) {
  const D0 = day * DAY_MIN + DAY_START_MIN, D1 = D0 + DAY_MIN;
  const out = [];
  let pending = false;
  const homes = [...world.townsNear(town.px ?? 0, town.py ?? 0, TRIP_REACH_PX)];
  const lanes = town.port ? world.lanesFrom?.(town) : [];
  if (lanes === undefined) pending = true;
  for (const l of lanes ?? []) if (l.to && !homes.some((h) => h.mapId === l.to.mapId)) homes.push(l.to);
  for (const from of homes) {
    if (from.mapId === town.mapId) continue;
    const trips = townTrips(from, D0 + DAY_MIN / 2, world, o);
    if (trips === undefined) { pending = true; continue; }
    for (const tr of trips) {
      if (tr.to.mapId !== town.mapId || tr.turned || !(tr.outT1 < D1 && tr.backT0 > D0)) continue;
      for (const res of membersAt(tr, tr.outT1)) out.push({ res, trip: tr, inT: tr.outT1, outT: tr.backT0, yaw: arrivingYaw(tr), dock: !!tr.sea });
    }
  }
  return pending ? undefined : out;
}

/**
 * Binary search: `ok` must be false at `a`, true at `b`, and change only once between them.
 * @param {number} a
 * @param {number} b
 * @param {(m: number) => boolean} ok
 */
const firstMinute = (a, b, ok) => {
  let lo = Math.floor(a), hi = Math.ceil(b);
  while (hi - lo > 1) { const m = Math.floor((lo + hi) / 2); if (ok(m)) hi = m; else lo = m; }
  return hi;
};

/**
 * @param {LwTown} inn
 * @param {number} day
 * @param {TripWorld} world
 * @param {{ mpm: number, memo?: Map<string, Trip|null> }} o
 * @returns {{ res: Resident, trip: Trip, inT: number, outT: number, yaw: number, dock: boolean }[] | undefined}
 */
export function innGuestsOf(inn, day, world, o) {
  const D0 = day * DAY_MIN + DAY_START_MIN, D1 = D0 + DAY_MIN;
  const out = [];
  const seen = new Set();
  let pending = false;
  for (const from of world.townsNear(inn.px ?? 0, inn.py ?? 0, TRIP_REACH_PX)) {
    for (const d of [day - 1, day]) {
      const trips = townTrips(from, d * DAY_MIN + 23 * 60, world, o);
      if (trips === undefined) { pending = true; break; }
      // The whole night is sampled every 15 minutes because a party walking on in the dark can reach the inn after
      // any fixed hour.
      const dusk = d * DAY_MIN + WALK_TO_H * 60, dawn = (d + 1) * DAY_MIN + WALK_FROM_H * 60;
      const lodged = (/** @type {Trip} */ tr, /** @type {number} */ m) => partyAt(tr, m).inn?.mapId === inn.mapId;
      for (const tr of trips) {
        if (tr.sea || !(tr.outT0 < dawn && tr.backT1 > dusk) || !tr.way.inns?.some((i) => i.town.mapId === inn.mapId)) continue;
        let at = null, inT = -1;
        for (let m = dusk; m < dawn; m += 15) {
          const p = partyAt(tr, m);
          if (p.inn?.mapId === inn.mapId) { at = p; inT = m > dusk ? firstMinute(m - 15, m, (x) => lodged(tr, x)) : m; break; }
          if (p.camp && !p.halt && !(tr.halt && tr.halt.t0 > m && tr.halt.t0 < dawn)) break;
        }
        if (!at) continue;
        let outT = dawn;
        while (outT < tr.backT1 && outT < dawn + DAY_MIN && lodged(tr, outT)) outT += 15;
        if (outT > dawn) outT = firstMinute(outT - 15, outT, (x) => !lodged(tr, x));
        if (!(inT < D1 && outT > D0)) continue;
        const yaw = /** @type {number} */ (at.yaw ?? 0) + Math.PI;
        for (const res of membersAt(tr, inT)) {
          if (seen.has(res.id)) continue;
          seen.add(res.id);
          out.push({ res, trip: tr, inT, outT, yaw, dock: false });
        }
      }
    }
  }
  return pending ? undefined : out;
}

/**
 * Returns undefined while a needed round waits on its way, so no client caches a trouble from an incomplete answer.
 * Reads only `memoTrip`, never trouble, so a trip's trouble never asks for itself.
 * @param {Trip} trip
 * @param {TripWorld} world
 * @param {{ mpm: number, memo?: Map<string, Trip|null> }} o
 * @returns {boolean|undefined}
 */
export function patrolCover(trip, world, o) {
  if (!trip.from || !trip.to || trip.to.mapId < 0) return false;
  const ends = new Set([trip.from.mapId, trip.to.mapId]);
  const lo = trip.outT0 - PATROL_COVER_DAYS * DAY_MIN, hi = trip.backT1;
  const scale = paceScale(o.mpm);
  const [, reach] = ROAD_RANGE_PX.patrol;
  const asked = new Set();
  let pending = false;
  for (const end of [trip.from, trip.to]) {
    for (const town of world.townsNear(end.px ?? 0, end.py ?? 0, reach)) {
      if (asked.has(town.mapId)) continue;
      asked.add(town.mapId);
      if (town.type !== 0 || (town.blocks | 0) < CITY_COURT_BLOCKS) continue;
      const first = world.rosterOf(town).find((r) => r.job === 'patrol' && !leaderOf(r, world.rosterOf(town)));
      if (!first) continue;
      const k1 = cycleOf(first, Math.floor(hi / DAY_MIN), scale).k;
      for (let kk = cycleOf(first, Math.floor(lo / DAY_MIN), scale).k - 1; kk <= k1; kk++) {
        const holder = world.holderOf ? world.holderOf(first, kk) : first;
        const pt = holder ? memoTrip(holder, town, kk, world, o) : null;
        if (pt === undefined) { pending = true; continue; }
        if (pt && pt.outT0 < hi && pt.backT1 > lo && (ends.has(pt.from.mapId) || ends.has(pt.to.mapId))) return true;
      }
    }
  }
  return pending ? undefined : false;
}

/**
 * @param {number} px
 * @param {number} py
 * @param {number} t
 * @param {TripWorld} world
 * @param {{ mpm: number, memo?: Map<string, Trip|null> }} o
 * @param {number} [rPx]
 * @returns {{ parties: { trip: Trip, at: ReturnType<typeof partyAt> }[], pending: boolean }}
 */
export function partiesNear(px, py, t, world, o, rPx = 6) {
  const parties = [];
  let pending = false;
  for (const town of world.townsNear(px, py, rPx + TRIP_REACH_PX)) {
    const got = partiesOfTown(town, px, py, t, world, o, rPx);
    if (got === undefined) { pending = true; continue; }
    for (const p of got) parties.push(p);
  }
  return { parties, pending };
}

/**
 * @param {LwTown} town
 * @param {number} px
 * @param {number} py
 * @param {number} t
 * @param {TripWorld} world
 * @param {{ mpm: number, memo?: Map<string, Trip|null> }} o
 * @param {number} [rPx]
 * @returns {{ trip: Trip, at: ReturnType<typeof partyAt> }[] | undefined}
 */
export function partiesOfTown(town, px, py, t, world, o, rPx = 6) {
  const trips = townTrips(town, t, world, o);
  if (trips === undefined) return undefined;
  const parties = [];
  for (const trip of trips) {
    const at = partyAt(trip, t);
    if (at.phase !== 'out' && at.phase !== 'back') continue;
    const ppx = Math.floor(/** @type {number} */ (at.x) / NATIVE_PIXEL), ppy = 499 - Math.floor(/** @type {number} */ (at.z) / NATIVE_PIXEL);
    if (Math.max(Math.abs(ppx - px), Math.abs(ppy - py)) <= rPx) parties.push({ trip, at });
  }
  return parties;
}

export const REMAINS_MIN = DAY_MIN;

/**
 * @param {number} px
 * @param {number} py
 * @param {number} t
 * @param {TripWorld} world
 * @param {{ mpm: number, memo?: Map<string, Trip|null> }} o
 * @param {number} [rPx]
 * @returns {{ remains: { key: string, res: Resident, x: number, z: number, yaw: number, trip: Trip }[], pending: boolean }}
 */
export function remainsNear(px, py, t, world, o, rPx = 6) {
  const remains = [];
  let pending = false;
  for (const town of world.townsNear(px, py, rPx + TRIP_REACH_PX)) {
    const got = remainsOfTown(town, px, py, t, world, o, rPx);
    if (got === undefined) { pending = true; continue; }
    for (const r of got) remains.push(r);
  }
  return { remains, pending };
}

/**
 * @param {LwTown} town
 * @param {number} px
 * @param {number} py
 * @param {number} t
 * @param {TripWorld} world
 * @param {{ mpm: number, memo?: Map<string, Trip|null> }} o
 * @param {number} [rPx]
 * @returns {{ key: string, res: Resident, x: number, z: number, yaw: number, trip: Trip }[] | undefined}
 */
export function remainsOfTown(town, px, py, t, world, o, rPx = 6) {
  const trips = townTrips(town, t, world, o);
  if (trips === undefined) return undefined;
  const remains = [];
  for (const trip of trips) {
    const fell = trip.fallen?.filter((f) => !f.hand);
    if (!fell?.length) continue;
    fell.forEach((f, i) => {
      if (f.inside || f.atSea || !(f.t <= t && t < f.t + REMAINS_MIN)) return;
      const p = wayAt(trip.way, f.s);
      const ppx = Math.floor(p.x / NATIVE_PIXEL), ppy = 499 - Math.floor(p.z / NATIVE_PIXEL);
      if (Math.max(Math.abs(ppx - px), Math.abs(ppy - py)) > rPx) return;
      const side = (i - (fell.length - 1) / 2) * 60;
      remains.push({ key: `rem:${f.res.id}`, res: f.res, x: p.x + Math.cos(p.yaw) * side, z: p.z - Math.sin(p.yaw) * side, yaw: p.yaw, trip });
    });
  }
  return remains;
}

export const DEEP_REMAINS_MIN = 3 * DAY_MIN;

/**
 * @param {LwTown} dungeon
 * @param {number} t
 * @param {TripWorld} world
 * @param {{ mpm: number, memo?: Map<string, Trip|null> }} o
 * @returns {{ remains: { key: string, res: Resident, trip: Trip, t: number }[], pending: boolean }}
 */
export function fallenIn(dungeon, t, world, o) {
  /** @type {Map<string, { key: string, res: Resident, trip: Trip, t: number }>} */
  const found = new Map();
  let pending = false;
  for (const town of world.townsNear(dungeon.px ?? 0, dungeon.py ?? 0, TRIP_REACH_PX)) {
    // `townTrips` returns only trips within a day of the minute asked, so remains are found by reading back over
    // every day they lie.
    for (let back = 0; back * DAY_MIN <= DEEP_REMAINS_MIN + DAY_MIN; back++) {
      const trips = townTrips(town, t - back * DAY_MIN, world, o);
      if (trips === undefined) { pending = true; break; }
      for (const trip of trips) {
        if (!trip.dive || trip.to?.mapId !== dungeon.mapId) continue;
        for (const f of trip.fallen ?? []) {
          if (!f.inside || f.hand || !(f.t <= t && t < f.t + DEEP_REMAINS_MIN)) continue;
          const key = `deep:${f.res.id}:${trip.id}`;
          if (!found.has(key)) found.set(key, { key, res: f.res, trip, t: f.t });
        }
      }
    }
  }
  return { remains: [...found.values()].sort((a, b) => a.t - b.t || (a.key < b.key ? -1 : 1)), pending };
}

/**
 * @param {LwTown} dungeon
 * @param {number} t
 * @param {TripWorld} world
 * @param {{ mpm: number, memo?: Map<string, Trip|null> }} o
 * @returns {{ divers: { trip: Trip, members: Resident[] }[], pending: boolean }}
 */
export function diversAt(dungeon, t, world, o) {
  const divers = [];
  let pending = false;
  for (const town of world.townsNear(dungeon.px ?? 0, dungeon.py ?? 0, TRIP_REACH_PX)) {
    const trips = townTrips(town, t, world, o);
    if (trips === undefined) { pending = true; continue; }
    for (const trip of trips) {
      if (!trip.dive || trip.to?.mapId !== dungeon.mapId || !(trip.dive.t0 <= t && t < trip.backT0)) continue;
      const members = membersAt(trip, t);
      if (members.length) divers.push({ trip, members });
    }
  }
  return { divers, pending };
}

/**
 * @param {LwTown} dungeon
 * @param {number} t0
 * @param {number} t1
 * @param {TripWorld} world
 * @param {{ mpm: number, memo?: Map<string, Trip|null> }} o
 * @returns {{ dives: Trip[], pending: boolean }}
 */
export function divesIn(dungeon, t0, t1, world, o) {
  /** @type {Map<string, Trip>} */
  const found = new Map();
  let pending = false;
  for (const town of world.townsNear(dungeon.px ?? 0, dungeon.py ?? 0, TRIP_REACH_PX)) {
    for (let back = 0; t1 - back * DAY_MIN >= t0 - DAY_MIN; back++) {
      const trips = townTrips(town, t1 - back * DAY_MIN, world, o);
      if (trips === undefined) { pending = true; break; }
      for (const trip of trips) {
        if (!trip.dive || trip.to?.mapId !== dungeon.mapId || !(trip.dive.t0 < t1 && trip.dive.t1 > t0) || found.has(trip.id)) continue;
        if (trip.turned) continue;
        found.set(trip.id, trip);
      }
    }
  }
  return { dives: [...found.values()].sort((a, b) => /** @type {any} */ (a.dive).t0 - /** @type {any} */ (b.dive).t0 || (a.id < b.id ? -1 : 1)), pending };
}
