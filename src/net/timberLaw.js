// @ts-check
// The service counts prime and knotty logs alongside each character’s Stores.
// The saw spends loose and bought logs first, then gathered logs in prime-to-knotty order.

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
