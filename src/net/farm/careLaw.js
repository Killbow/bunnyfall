// @ts-check
// BUNNYFALL FARM EXPANSION, PHASE 2 (docs/FARM-EXPANSION.md sections 4.2, 4.4, 8.3): CARE, GRADES, WEEDS AND BIRDS.
//
// A planted bed gathers CARE (0..CARE_MAX) from the hands that tend it:
//   - watering it in its last WATER_CARE_S of moisture, before it dries (keeping it wet, not drowning it): +1;
//   - weeding it when weeds have come (a bed dry for a day grows them): +1, more with the weeding game;
//   - sowing and scything it well (the field games, farmGameLaw.js): +1 or +2.
// BIRDS visit each farm in windows its own map id draws from the hour (the same for every client and the service): a
// window nobody chases off costs every bed growing through it a point of care, at most BIRD_TOLL_MAX a crop.
// At harvest the care makes the crop's GRADE (the soil keeps its own extra crops), and the grade its yield:
// Common x1, Fine x1.25, Choice x1.5, Prize x2. Nothing here ever kills a crop or takes a bed: rule 4, crops pause,
// never die. Pure: both ends read it.

/** The care a bed can hold. */
export const CARE_MAX = 6;
/** Watering in a bed's last this-many seconds of moisture counts as care. */
export const WATER_CARE_S = 6 * 3600;
/** A planted bed dry this long grows weeds, s. */
export const WEED_DRY_S = 86400;
/** The grades, worst first, and what each multiplies the yield by. */
export const GRADES = Object.freeze(['common', 'fine', 'choice', 'prize']);
export const GRADE_YIELD = Object.freeze([1, 1.25, 1.5, 2]);
/** Care needed for each grade above Common (the soil keeps its own extra crops, gradedYield: it does not raise the grade). */
export const GRADE_AT = Object.freeze([2, 3, 4]);

/** A bed's grade (0..3) from its care. */
export function gradeOf(care) {
  const c = Math.max(0, care | 0);
  return c >= GRADE_AT[2] ? 3 : c >= GRADE_AT[1] ? 2 : c >= GRADE_AT[0] ? 1 : 0;
}
/** A harvest's crops: the seed's yield and the soil's extras, times the grade's share, rounded. */
export const gradedYield = (seedYield, soil, grade) => Math.max(1, Math.round((seedYield + (soil | 0)) * GRADE_YIELD[grade]));
/** Care kept within its bounds. */
export const clampCare = (n) => Math.max(0, Math.min(CARE_MAX, Math.round(n)));

/** Whether a planted bed has weeds now: dry for WEED_DRY_S since it was last wet, tended or weeded. */
export function bedWeedy(bed, nowS, ripe = false) {
  if (!bed?.crop || ripe) return false;
  return nowS - Math.max(bed.wetUntil ?? 0, bed.tick ?? 0, bed.weeded ?? 0) > WEED_DRY_S;
}

// ─── BIRDS ────────────────────────────────────────────────────────────

/** In each real hour, the chance birds come to a farm, and how long they stay, s. */
export const BIRD_CHANCE = .3, BIRD_STAY_S = 20 * 60;
/** The most care birds take from one crop. */
export const BIRD_TOLL_MAX = 2;
/** The windows kept in a garden's chased list: five days of hours, longer than the slowest crop's winter growth. */
export const BIRD_KEEP = 120;

function hash01(seed, n) {
  let h = (Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(n | 0, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0; h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
/** The birds' visit in real hour `hour` at a farm, or null: { id: the hour, from, to } (seconds). */
export function birdWindow(mapId, hour) {
  if (hash01(mapId, hour) >= BIRD_CHANCE) return null;
  const from = hour * 3600 + Math.floor(hash01(mapId ^ 0x5bd1e995, hour) * (3600 - BIRD_STAY_S));
  return { id: hour, from, to: from + BIRD_STAY_S };
}
/** The visit going on at `nowS`, or null. */
export function birdsNow(mapId, nowS) {
  const w = birdWindow(mapId, Math.floor(nowS / 3600));
  return w && nowS >= w.from && nowS < w.to ? w : null;
}
/** The visits between two times that nobody chased (`chased` the garden's list of window ids), at most `cap`. */
export function birdsUnchased(mapId, chased, fromS, toS, cap = BIRD_TOLL_MAX) {
  let n = 0;
  for (let h = Math.floor(fromS / 3600); h <= Math.floor(toS / 3600) && n < cap; h++) {
    const w = birdWindow(mapId, h);
    if (w && w.to > fromS && w.from < toS && !(chased ?? []).includes(w.id)) n++;
  }
  return n;
}
