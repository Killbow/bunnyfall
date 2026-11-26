// @ts-check
// BUNNYFALL (2026-11-26, caverns): TIMBER GRADES - the spec's section 10: "timber grades from felling (sound, knotty, prime),
// which change how many planks a log saws to". A felling's logs take its GRADE from the Wood-Axe's own act
// (server-account/src/profHarvest.js cutsOf: how many of the finish's chops were clean):
//   prime   every chop clean (the Clean Cut)       saws to one plank MORE than its wood's yield
//   sound   at least half the chops clean           saws to its wood's yield (a Timberwright's three, else two)
//   knotty  fewer than half                         saws to one plank LESS
// The Stores keep no unit's grade: the account service counts a character's prime and knotty logs of each wood beside
// them (`prof_log_grades`, migration 0223, as unbruised herbs are counted). A saw at the workbench spends loose and bought
// logs first, as every work does (they are sound); of the character's own logs, the prime first and the knotty last.
// Pure: the service and the page read it.

/** How many chops of a finish must be clean for a sound log (a share of the finish). */
export const TIMBER_SOUND_SHARE = 0.5;
/** A grade's planks past (or short of) its wood's yield, a log. */
export const TIMBER_PLANKS = Object.freeze({ prime: 1, sound: 0, knotty: -1 });

/** A felling's grade from its act: `cuts` clean chops of a finish of `most`, `clean` the whole finish clean. */
export function timberGrade(/** @type {number} */ cuts, /** @type {number} */ most, /** @type {boolean} */ clean) {
  if (clean) return 'prime';
  return cuts >= Math.ceil(Math.max(1, most) * TIMBER_SOUND_SHARE) ? 'sound' : 'knotty';
}

/**
 * The graded logs a saw of `count` spends, and its planks past the yield. `own` the character's own logs of the wood
 * held now, `other` its loose and bought ones (spent first, sound), `prime` and `knotty` the counts kept beside the Stores
 * (each read no higher than the own logs hold).
 * @param {{ count: number, own: number, other: number, prime: number, knotty: number }} o
 * @returns {{ prime: number, knotty: number, extra: number }}
 */
export function sawGrades({ count, own, other, prime, knotty }) {
  const ownUsed = Math.max(0, Math.min(own, count - Math.min(count, Math.max(0, other))));
  const p = Math.max(0, Math.min(prime, own)), k = Math.max(0, Math.min(knotty, own - p));
  const primeUsed = Math.min(ownUsed, p);
  const knottyUsed = Math.max(0, Math.min(k, ownUsed - (own - k)));   // the knotty are the last of the own logs
  return { prime: primeUsed, knotty: knottyUsed, extra: primeUsed * TIMBER_PLANKS.prime + knottyUsed * TIMBER_PLANKS.knotty };
}
