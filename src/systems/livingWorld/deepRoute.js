// @ts-check
// Stops are the random enemy (record 15) and random treasure (record 19) editor markers only; placed enemies, quest
// markers, and placed treasure are never stops. Routes are pure, so every reader sees a company at the same stops
// at the same minutes.
import { lwSeed, lwRng, textSeed, rollInt } from './seed.js';
import { DAY_MIN } from './dayPlan.js';
import { RANDOM_RECORD } from '../../characters/dungeonEnemies.js';
import { RANDOM_TREASURE_MARKER_RECORD } from '../../items/loot.js';

// Imported from the enemy and loot modules so each marker record has one source; never restate them as literals.
export const STOP_FOE = RANDOM_RECORD;
export const STOP_TREASURE = RANDOM_TREASURE_MARKER_RECORD;
export const DEEP_FOE_MIN = Object.freeze([25, 40]);
export const DEEP_TREASURE_MIN = 10;
export const DEEP_DETOUR = 1.6;
export const DEEP_WALK_M = 30;
export const DEEP_RISK = 0.5;
export const DEEP_FIGHT_MIN = 20;
export const DIVE_CLEAR_MIN = DAY_MIN;
const DEEP = 0x64656570;

/**
 * @typedef {{ key: string, kind: 'foe'|'treasure', x: number, y: number, z: number, block: number, loadID: number }} Stop
 * @typedef {{ stop: Stop, tIn: number, tOut: number, fight: boolean }} Leg
 * @typedef {{ legs: Leg[], entry: { x: number, z: number }, out: { t0: number, t1: number, path: { x: number, z: number, y?: number }[] }, t0: number }} Route
 */

/**
 * @param {{ originX: number, originZ: number, isStartingBlock?: boolean, layout: { markers: any[] } }[]} blocks
 * @param {number} side
 * @param {{ x: number, z: number } | null} [entry]
 * @returns {Stop[]}
 */
export function stopsOf(blocks, side, entry = null) {
  const grid = blocks.map((b) => ({ gx: Math.round(b.originX / side), gz: Math.round(b.originZ / side) }));
  const inBlock = blocks.map((b, bi) => (b.layout?.markers ?? [])
    .filter((m) => !m.archive && (m.record === STOP_FOE || m.record === STOP_TREASURE))
    .map((m) => /** @type {Stop} */ ({ key: `${bi}:${m.position}`, kind: m.record === STOP_FOE ? 'foe' : 'treasure', x: m.x + b.originX, y: m.y, z: m.z + b.originZ, block: bi, loadID: m.loadID ?? 0 })));
  if (!blocks.length) return [];
  // Without a start marker, begin at the block flagged `isStartingBlock`; a dungeon block list does not put the
  // start first.
  const start = blocks.find((b) => b.isStartingBlock) ?? blocks[0];
  const from = entry ?? { x: start.originX + side / 2, z: start.originZ + side / 2 };
  let first = blocks.findIndex((b) => from.x >= b.originX && from.x < b.originX + side && from.z >= b.originZ && from.z < b.originZ + side);
  if (first < 0) first = 0;
  const order = [first];
  const seen = new Set(order);
  for (let i = 0; i < order.length; i++) {
    const g = grid[order[i]];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = grid.findIndex((q, k) => !seen.has(k) && q.gx === g.gx + dx && q.gz === g.gz + dz);
      if (j >= 0) { seen.add(j); order.push(j); }
    }
  }
  for (let k = 0; k < blocks.length; k++) if (!seen.has(k)) order.push(k);
  /** @type {Stop[]} */
  const out = [];
  let at = from;
  for (const bi of order) {
    const left = [...inBlock[bi]];
    while (left.length) {
      let best = 0;
      for (let i = 1; i < left.length; i++) {
        const d = Math.hypot(left[i].x - at.x, left[i].z - at.z) - Math.hypot(left[best].x - at.x, left[best].z - at.z);
        if (d < -1e-9 || (Math.abs(d) <= 1e-9 && left[i].key < left[best].key)) best = i;
      }
      const s = left.splice(best, 1)[0];
      out.push(s);
      at = s;
    }
  }
  return out;
}

/** @param {any} trip */
export function deepFightOf(trip) {
  // A fated trouble met inside is the dive's only fight; a road trouble on the way there or back does not cancel
  // the deep fight.
  if (trip.enc?.inside) return null;
  const rng = lwRng(textSeed(trip.id), DEEP);
  return rng() < DEEP_RISK ? rng() : null;
}

/** @param {Stop} s */
export const stopDwellOf = (s) => (s.kind === 'foe' ? rollInt(lwRng(textSeed(s.key), DEEP), DEEP_FOE_MIN[0], DEEP_FOE_MIN[1]) : DEEP_TREASURE_MIN);
const walkMin = (a, b) => (Math.hypot(a.x - b.x, a.z - b.z) * DEEP_DETOUR) / DEEP_WALK_M;

/**
 * @param {Stop[]} stops
 * @param {{ x: number, z: number }} entry
 * @param {any} trip
 * @returns {Route | null}
 */
export function routeOf(stops, entry, trip) {
  const dive = trip?.dive;
  if (!dive) return null;
  const mid = dive.t0 + (dive.t1 - dive.t0) / 2;
  const fightAt = deepFightOf(trip);
  /** @type {Leg[]} */
  const legs = [];
  let t = dive.t0, at = entry;
  for (const s of stops) {
    const tIn = t + walkMin(at, s);
    if (tIn > mid) break;
    const tOut = tIn + stopDwellOf(s);
    if (tOut > mid) break;
    legs.push({ stop: s, tIn, tOut, fight: s.kind === 'foe' });
    t = tOut; at = s;
  }
  if (fightAt != null) {
    const foes = legs.map((l, i) => (l.stop.kind === 'foe' ? i : -1)).filter((i) => i >= 0);
    if (foes.length) {
      const i = foes[Math.min(foes.length - 1, Math.floor(fightAt * foes.length))];
      legs[i].tOut += DEEP_FIGHT_MIN;
      for (let j = i + 1; j < legs.length; j++) { legs[j].tIn += DEEP_FIGHT_MIN; legs[j].tOut += DEEP_FIGHT_MIN; }
    }
  }
  const yOf = (/** @type {any} */ o) => (Number.isFinite(o?.y) ? { y: o.y } : {});
  const path = [...legs.map((l) => ({ x: l.stop.x, z: l.stop.z, ...yOf(l.stop) })).reverse(), { x: entry.x, z: entry.z, ...yOf(entry) }];
  let back = 0;
  for (let i = 1; i < path.length; i++) back += walkMin(path[i - 1], path[i]);
  const last = legs.length ? legs[legs.length - 1].tOut : dive.t0;
  const outT0 = Math.min(Math.max(last, dive.t1 - back), dive.t1);
  return { legs, entry: { x: entry.x, z: entry.z }, out: { t0: outT0, t1: dive.t1, path }, t0: dive.t0 };
}

/**
 * @param {Route | null} route
 * @param {number} t
 */
export function stopAt(route, t) {
  if (!route || t < route.t0 || t >= route.out.t1) return null;
  let prev = /** @type {{ x: number, z: number }} */ (route.entry), prevT = route.t0;
  for (const l of route.legs) {
    if (t < l.tIn) return { between: [prev, l.stop], f: (t - prevT) / Math.max(1e-9, l.tIn - prevT) };
    if (t < l.tOut) return { at: l.stop, fighting: l.fight };
    prev = l.stop; prevT = l.tOut;
  }
  if (t < route.out.t0) return { at: route.legs.length ? route.legs[route.legs.length - 1].stop : null, fighting: false, resting: true };
  const p = route.out.path;
  const seg = [];
  let total = 0;
  for (let i = 1; i < p.length; i++) { const d = Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z); seg.push(d); total += d; }
  let goal = total * ((t - route.out.t0) / Math.max(1e-9, route.out.t1 - route.out.t0));
  for (let i = 0; i < seg.length; i++) {
    if (goal <= seg[i]) { const f = seg[i] ? goal / seg[i] : 0, y = p[i + 1].y ?? p[i].y; return { out: { x: p[i].x + (p[i + 1].x - p[i].x) * f, z: p[i].z + (p[i + 1].z - p[i].z) * f, ...(y != null ? { y } : {}) } }; }
    goal -= seg[i];
  }
  const last = p[p.length - 1];
  return { out: { x: last.x, z: last.z, ...(last.y != null ? { y: last.y } : {}) } };
}

/**
 * @param {Route | null} route
 * @param {number} t
 */
export function pointAt(route, t) {
  const s = stopAt(route, t);
  if (!s) return null;
  if (s.at) return { x: s.at.x, z: s.at.z, y: s.at.y };
  if (s.between) { const [a, b] = s.between; return { x: a.x + (b.x - a.x) * s.f, z: a.z + (b.z - a.z) * s.f, y: /** @type {any} */ (b).y }; }
  return s.out ? { x: s.out.x, z: s.out.z, y: s.out.y } : null;
}

/**
 * @param {(Route | null)[]} routes
 * @param {number} t
 * @returns {Set<string>}
 */
export function clearedOf(routes, t) {
  const out = new Set();
  for (const r of routes) for (const l of r?.legs ?? []) if (l.tOut <= t && t - l.tOut < DIVE_CLEAR_MIN) out.add(l.stop.key);
  return out;
}

/**
 * @param {Route | null} route
 * @param {number} t
 * @returns {Stop | null}
 */
export function stopOfMinute(route, t) {
  const s = stopAt(route, t);
  if (!s) return route?.legs.length ? route.legs[route.legs.length - 1].stop : null;
  if (s.at) return s.at;
  if (s.between) { const b = /** @type {any} */ (s.between[1]); const a = /** @type {any} */ (s.between[0]); return s.f >= 0.5 || !a.key ? b : a; }
  if (s.out && route?.legs.length) {
    const o = s.out;
    let best = route.legs[0].stop;
    for (const l of route.legs) if (Math.hypot(l.stop.x - o.x, l.stop.z - o.z) < Math.hypot(best.x - o.x, best.z - o.z)) best = l.stop;
    return best;
  }
  return route?.legs.length ? route.legs[route.legs.length - 1].stop : null;
}

/** @param {string} id */
export const fightBeat = (id) => (lwSeed(textSeed(id), DEEP) % 1000) / 1000;
