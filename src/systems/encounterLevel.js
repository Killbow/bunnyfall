// @ts-check
// ═══════════════════════════════════════════════════════════════════
// ENCOUNTER LEVEL: THE ONE POLICY for what level a fight is built at (Phase 3 of the encounter rework, 2026-11-02).
//
// Before this, seven sources each picked a level their own way (a dungeon's builder, the wilds' banding, a seeded band,
// outlaws, road company, quests at spawn time, super dungeons), every client rolled its own world from its own idea of
// the party's level, and three stat layers (place, Master Skills, the hero's threat) scaled the result again.
//
// THE RULES
//   1. THE PARTY LEVEL (`partyThreatLevel`): the (lower) median of the members' levels, every member first clamped to within
//      max(CLAMP_MIN, CLAMP_FRAC x median) of that median, then the mean of the clamped, rounded. One much stronger or
//      much weaker member moves it by about a level (never drags it), a join or a leave moves it by about a level, and a
//      party of one is its own level. Party SIZE is not a level: it widens the group (the group rolls cap it).
//   2. THE PLACE (`placeOffset`): a place has a tier (0..21: lootRarity.js DUNGEON_RARITY_TIER for a dungeon, the wilds'
//      PLACE_THREAT). The tier shifts the level the place builds at around the party's, from -2 (a cemetery) to +4 (a
//      dragon's den). So a place has an identity, and the world does not follow the strongest player.
//   3. ONE LEVEL, ONE MOMENT: a dungeon's level is fixed at its session's first build (`dungeonSessionLevel`), a quest's
//      at its acceptance (the quest's `qlv` stamp), a wilderness encounter's by its owner at the spawn (the grant signs
//      it). Nobody who joins, leaves or levels up afterwards changes it.
//   4. A FIXED MARKER TOO STRONG for the level is a random draw of its dungeon's own table at that level
//      (`markerTooStrong`, `bandedPick`): the content stays in the tables, a low party just does not meet it by a
//      placement the map never graded.
//
// Pure: no host, no storage but the session map below.
// ═══════════════════════════════════════════════════════════════════

/** Every number the policy reads, in one place. */
export const ENCOUNTER_LEVEL = Object.freeze({
  /** A member's level is held within max(min, frac x median) of the party's median before the mean is taken. */
  party: Object.freeze({ clampMin: 3, clampFrac: 0.25 }),
  /** The place's tier -> a level offset: (tier - pivot) x perTier, rounded, held to [min, max]. */
  place: Object.freeze({ pivot: 9, perTier: 0.4, min: -3, max: 4 }),
  /** The wilds' tier by the hour (skillSoftcap.js PLACE_THREAT.wilderness) and a road's, below the open wild. */
  wild: Object.freeze({ day: 5, night: 7, road: 4 }),
  /** A fixed marker's monster is too strong when its level is over ratio x level + slack. */
  fixedMarker: Object.freeze({ ratio: 2, slack: 4 }),
  /** Table band either side of the level (classic ChooseRandomEnemy's -3/+3). */
  band: Object.freeze({ below: 3, above: 3 }),
  /** How long a dungeon's session level stands after its last build, ms (the player may pop out and come back). */
  sessionMs: 30 * 60_000,
});

const C = ENCOUNTER_LEVEL;
const finite = (n) => typeof n === 'number' && Number.isFinite(n);

/** The party's threat level. `levels`: every member's, the caller's own included. Null for fewer than two members.
 *  @param {number[]} levels */
export function partyThreatLevel(levels) {
  const ls = (levels ?? []).map(Number).filter((l) => finite(l) && l >= 1);
  if (ls.length < 2) return null;
  const sorted = [...ls].sort((a, b) => a - b);
  const median = sorted[(sorted.length - 1) >> 1];   // the LOWER median: a pair of 3 and 20 is read from the 3, not their midpoint
  const reach = Math.max(C.party.clampMin, C.party.clampFrac * median);
  const clamped = ls.map((l) => Math.min(median + reach, Math.max(median - reach, l)));
  return Math.max(1, Math.round(clamped.reduce((a, l) => a + l, 0) / clamped.length));
}

/** The level offset a place of `tier` builds at around the party's. @param {number} tier */
export function placeOffset(tier) {
  if (!finite(tier)) return 0;
  const o = Math.round((tier - C.place.pivot) * C.place.perTier);
  return Math.min(C.place.max, Math.max(C.place.min, o));
}

/** The level a place of `tier` builds at for a party at `level`. @param {number} level @param {number} tier */
export function placeLevel(level, tier) {
  return Math.max(1, Math.round(level) + placeOffset(tier));
}

/** The wilds' tier: night, the day, or a road (the road is the tamer). @param {{ night?: boolean, road?: boolean }} o */
export function wildTier({ night = false, road = false } = {}) {
  return road ? C.wild.road : night ? C.wild.night : C.wild.day;
}

/** Whether a fixed-marker monster of `monsterLevel` is too strong for a place built at `level`. */
export function markerTooStrong(monsterLevel, level) {
  return finite(monsterLevel) && monsterLevel > C.fixedMarker.ratio * Math.max(1, level) + C.fixedMarker.slack;
}

/** A table pick banded on `level`, with no unbanded roll: the index band is [level-below, level+above], and below the
 *  table's low end the first six, over its top the last six (classic's clamps). `rng(min, maxExclusive)` an integer.
 *  @param {number[]} table @param {number} level @param {(min: number, maxExcl: number) => number} rng */
export function bandedPick(table, level, rng) {
  const last = table.length - 1;
  let min = level - C.band.below, max = level + C.band.above;
  if (min < 0) { min = 0; max = Math.min(5, last); }
  else if (max > last) { max = last; min = Math.max(0, last - 5); }
  return table[rng(min, max + 1)];
}

// ── a dungeon's session level ────────────────────────────────────────
/** @type {Map<number | string, { level: number, at: number }>} */
const sessions = new Map();

/** A dungeon's level for this session: the first build's, kept while builds keep coming within `sessionMs`; a fresh
 *  session recomputes. `key` the dungeon's location id, `fresh` the level the caller would build at now (the party's
 *  placed on its tier), `now` ms. A late joiner's build therefore reads the session's, not its own moment's.
 *  @param {number | string} key @param {number} fresh @param {number} [now] */
export function dungeonSessionLevel(key, fresh, now = Date.now()) {
  const s = sessions.get(key);
  if (s && now - s.at <= C.sessionMs) { s.at = now; return s.level; }
  const level = Math.max(1, Math.round(fresh));
  sessions.set(key, { level, at: now });
  if (sessions.size > 64) for (const [k, v] of sessions) if (now - v.at > C.sessionMs) sessions.delete(k);
  return level;
}

/** Forget a dungeon's session (a test, or a host that knows the session ended). */
export const endDungeonSession = (key) => { sessions.delete(key); };

/** A level handed in by the session's first builder (a joiner's door): it replaces mine, and the session keeps it. */
export function adoptSessionLevel(key, level, now = Date.now()) {
  if (!finite(level) || level < 1) return;
  sessions.set(key, { level: Math.round(level), at: now });
}
