// @ts-check
import { MOBILE_TYPES } from '../../characters/mobileTypes.js';

export const MINE_FOE_BANDS = Object.freeze([
  Object.freeze([MOBILE_TYPES.Rat, MOBILE_TYPES.GiantBat, MOBILE_TYPES.Spider]),
  Object.freeze([MOBILE_TYPES.GiantScorpion, MOBILE_TYPES.Orc, MOBILE_TYPES.Spriggan]),
  Object.freeze([MOBILE_TYPES.SkeletalWarrior, MOBILE_TYPES.Zombie, MOBILE_TYPES.OrcSergeant]),
]);
export const MINE_FOE_BAND_OF = Object.freeze([0, 0, 1, 1, 2, 2]);
export const MINE_FOE_RING = Object.freeze([0.25, 0.8]);

export const mineFoesOf = (/** @type {number} */ s) => MINE_FOE_BANDS[MINE_FOE_BAND_OF[Math.min(Math.max(0, s), MINE_FOE_BAND_OF.length - 1)]];

/**
 * @param {any} layout
 * @param {{ s: number, c: number, n: number }} call
 * @param {(t: number, feet: number[], lo: number, hi: number) => any} spawn
 * @param {() => number} [rand]
 */
export function standMineFoes(layout, { s, c, n }, spawn, rand = Math.random) {
  const ch = layout?.sections?.[s]?.chambers?.[c];
  if (!ch || !(n > 0)) return 0;
  const band = mineFoesOf(s), r = Math.min(ch.rx, ch.rz);
  let asked = 0;
  for (let i = 0; i < Math.min(n, 8); i++) {
    const t = band[Math.floor(rand() * band.length) % band.length];
    try { spawn(t, ch.c, r * MINE_FOE_RING[0], r * MINE_FOE_RING[1]); asked++; } catch (e) { console.warn('[mine] a creature', /** @type {any} */ (e)?.message ?? e); }
  }
  return asked;
}
