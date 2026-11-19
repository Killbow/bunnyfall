// @ts-check
// BUNNYFALL FARM EXPANSION, PHASE 2 (docs/FARM-EXPANSION.md section 10): FARM WORK, AND THE THREE TITLES IT EARNS.
// Every account keeps one count that only goes up: the time it has put into Company farms, all of it, not one loop. The
// service raises it in the same transaction as the work that earns it (server-account/src/farmGardens.js), so a retried
// request never pays twice, and never past FARM_WORK_DAY_CAP an account a UTC day - the titles measure days given to
// the farm, not one long session. The titles are derived from it by the service (server-account/src/titles.js), as the
// Marks of Mastery are; the last carries First Light, the Elite Breach's dawn ring (the owner's choice, 2026-11-19).
// Pure: no clock, no network. Every number is balance, tunable here.

/** The most farm work an account earns for titles in one UTC day. */
export const FARM_WORK_DAY_CAP = 400;
/** The titles, in order: [key (net/identityToken.js TITLES), farm work needed]. */
export const FARM_TITLES = /** @type {ReadonlyArray<readonly [string, number]>} */ (Object.freeze([
  Object.freeze(['furrowhand', 3000]),
  Object.freeze(['harvestwarden', 15000]),
  Object.freeze(['sheafsovereign', 45000]),
]));
/** The aura the last title carries (render/auraRing.js's look, already drawn). */
export const FARM_TITLE_AURA = Object.freeze({ sheafsovereign: 'firstlight' });

/** What each kind of work is worth. */
export const FARM_WORK = Object.freeze({
  bed: 1,       // a bed hoed, planted or watered by your hand
  crop: 1,      // each crop harvested by your hand
  sack: 2,      // each sack carried to the factor's wagon
  game: 5,      // a field game played for its full bonus (farmGameLaw.js GAME_WORK)
  animal: 3,    // an animal fed, watered, milked or mucked out (PHASE 3)
});

/** The farm work an action earns: `op` the garden op, `worked` the beds it worked, `harvested` its crops, `sacks` the
 *  sacks it hauled, `game` whether a field game was played for its full bonus. Shipping and buying earn none. */
export function farmWorkOf(op, { worked = 0, harvested = 0, sacks = 0, game = false, horse = false, tended = 0 } = {}) {
  const played = game ? FARM_WORK.game : 0;
  if (op === 'harvest') return harvested * FARM_WORK.crop + played;
  if (op === 'haul') return sacks * (FARM_WORK.sack + (horse ? 1 : 0));   // PHASE 3: a content horse draws the wagon
  if (op === 'herd') return tended * FARM_WORK.animal + played;
  if (op === 'hoe' || op === 'plough' || op === 'plant' || op === 'water' || op === 'weed') return worked * FARM_WORK.bed + played;
  if (op === 'birds') return played;
  return 0;
}

/** The farm titles `total` farm work holds, in order. */
export const farmTitlesFor = (total) => FARM_TITLES.filter(([, n]) => Number(total) >= n).map(([t]) => t);
/** The next title and how much it needs, or null at the last. */
export function nextFarmTitle(total) {
  const next = FARM_TITLES.find(([, n]) => Number(total) < n);
  return next ? { title: next[0], needed: next[1], left: next[1] - Number(total) } : null;
}
/** The title, if any, that crossing from `before` to `after` earns. */
export const farmTitleCrossed = (before, after) => FARM_TITLES.find(([, n]) => Number(before) < n && Number(after) >= n)?.[0] ?? null;

/** What `points` of work adds to an account at day `day`, with `day0`/`today0` its stored day and its count that day:
 *  { day, today, gained }. The mirror of the service's SQL (farmGardens.js), for the client's words and the tests. */
export function farmWorkStep(day0, today0, day, points) {
  const before = day0 === day ? Math.max(0, today0) : 0;
  const today = Math.min(FARM_WORK_DAY_CAP, before + Math.max(0, points));
  return { day, today, gained: today - before };
}
