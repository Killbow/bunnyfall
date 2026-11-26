// @ts-check
// BUNNYFALL (2026-11-26, caverns): THE MINE'S CREATURES - what a wave or a stray (net/mine/mineBrain.js) brings, stood by
// the dungeon's own encounter door (scenes/dungeonContext.js spawnFoeNear: the room's host stands them, shared, as a
// rest's ambush is). The spec's section 8 by depth: rats, giant bats and spiders shallow; scorpions, orcs and spriggans
// in the middle; skeletons, zombies and orc sergeants deep. A wave stands in the chamber its noise came from, a ring
// about the chamber's middle; a stray anywhere in its chamber.
import { MOBILE_TYPES } from '../../characters/mobileTypes.js';

/** The creatures by depth band, and which band each section is (a section past the last is the last's). */
export const MINE_FOE_BANDS = Object.freeze([
  Object.freeze([MOBILE_TYPES.Rat, MOBILE_TYPES.GiantBat, MOBILE_TYPES.Spider]),
  Object.freeze([MOBILE_TYPES.GiantScorpion, MOBILE_TYPES.Orc, MOBILE_TYPES.Spriggan]),
  Object.freeze([MOBILE_TYPES.SkeletalWarrior, MOBILE_TYPES.Zombie, MOBILE_TYPES.OrcSergeant]),
]);
export const MINE_FOE_BAND_OF = Object.freeze([0, 0, 1, 1, 2, 2]);
/** How near the chamber's middle a creature stands, as a share of its narrower radius (at least, at most). */
export const MINE_FOE_RING = Object.freeze([0.25, 0.8]);

/** The creatures a section's band brings. */
export const mineFoesOf = (/** @type {number} */ s) => MINE_FOE_BANDS[MINE_FOE_BAND_OF[Math.min(Math.max(0, s), MINE_FOE_BAND_OF.length - 1)]];

/**
 * A wave's or a stray's creatures stood: `n` of the section's band in chamber `c` of section `s`, each through `spawn`
 * (the dungeon's door: `(mobileType, feet, minDistance, maxDistance) => Promise`). Answers how many were asked.
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
