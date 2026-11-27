// @ts-check
// The one policy for what level a fight is built at: the party level shifted by the place's tier, fixed at the first
// build. Pure: no host, no storage but the session map below.

export const ENCOUNTER_LEVEL = Object.freeze({
  party: Object.freeze({ clampMin: 3, clampFrac: 0.25 }),
  place: Object.freeze({ pivot: 9, perTier: 0.4, min: -3, max: 4 }),
  wild: Object.freeze({ day: 5, night: 7, road: 4 }),
  fixedMarker: Object.freeze({ ratio: 2, slack: 4 }),
  band: Object.freeze({ below: 3, above: 3 }),
  sessionMs: 30 * 60_000,
});

const C = ENCOUNTER_LEVEL;
const finite = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * @param {number[]} levels
 */
export function partyThreatLevel(levels) {
  const ls = (levels ?? []).map(Number).filter((l) => finite(l) && l >= 1);
  if (ls.length < 2) return null;
  const sorted = [...ls].sort((a, b) => a - b);
  // The lower median: a pair of 3 and 20 is read from the 3, not their midpoint.
  const median = sorted[(sorted.length - 1) >> 1];
  const reach = Math.max(C.party.clampMin, C.party.clampFrac * median);
  const clamped = ls.map((l) => Math.min(median + reach, Math.max(median - reach, l)));
  return Math.max(1, Math.round(clamped.reduce((a, l) => a + l, 0) / clamped.length));
}

/** @param {number} tier */
export function placeOffset(tier) {
  if (!finite(tier)) return 0;
  const o = Math.round((tier - C.place.pivot) * C.place.perTier);
  return Math.min(C.place.max, Math.max(C.place.min, o));
}

/** @param {number} level @param {number} tier */
export function placeLevel(level, tier) {
  return Math.max(1, Math.round(level) + placeOffset(tier));
}

/** @param {{ night?: boolean, road?: boolean }} o */
export function wildTier({ night = false, road = false } = {}) {
  return road ? C.wild.road : night ? C.wild.night : C.wild.day;
}

export function markerTooStrong(monsterLevel, level) {
  return finite(monsterLevel) && monsterLevel > C.fixedMarker.ratio * Math.max(1, level) + C.fixedMarker.slack;
}

/**
 * @param {number[]} table
 * @param {number} level
 * @param {(min: number, maxExcl: number) => number} rng
 */
export function bandedPick(table, level, rng) {
  const last = table.length - 1;
  let min = level - C.band.below, max = level + C.band.above;
  if (min < 0) { min = 0; max = Math.min(5, last); }
  else if (max > last) { max = last; min = Math.max(0, last - 5); }
  return table[rng(min, max + 1)];
}

/** @type {Map<number | string, { level: number, at: number }>} */
const sessions = new Map();

/**
 * @param {number | string} key
 * @param {number} fresh
 * @param {number} [now]
 */
export function dungeonSessionLevel(key, fresh, now = Date.now()) {
  const s = sessions.get(key);
  if (s && now - s.at <= C.sessionMs) { s.at = now; return s.level; }
  const level = Math.max(1, Math.round(fresh));
  sessions.set(key, { level, at: now });
  if (sessions.size > 64) for (const [k, v] of sessions) if (now - v.at > C.sessionMs) sessions.delete(k);
  return level;
}

export const endDungeonSession = (key) => { sessions.delete(key); };

export function adoptSessionLevel(key, level, now = Date.now()) {
  if (!finite(level) || level < 1) return;
  sessions.set(key, { level: Math.round(level), at: now });
}
