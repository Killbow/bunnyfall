// @ts-check
// Client copy of the relay Orrery draw, computed from the breach seed and hall. The relay never imports this file,
// so edits here do not move `RELAY_VERSION`.
import { orreryOf, SD_STONES, sdHourShown } from '../../net/sdBrain.js';
import { egOrreryTurns } from '../../net/eliteGates/egBrain.js';
import { egSeed } from '../../net/eliteGates/egLaw.js';

// Duplicates the literal salt in `egBrain.js`, which is not exported so the relay bundle stays unchanged; change
// both together.
export const EG_ORRERY_SALT = 0x0a7e;
// Matches the planar reach the relay checks in `egBrain.js`; the relay drops a turn sent from farther away without
// a reply.
export const EG_STONE_REACH_M = 3.5;

/**
 * The relay also passes The Fraying `fray`, which changes no part of the draw, so only the returned `fray` can
 * differ from the relay copy.
 * @param {number} seed
 * @param {any} spec
 */
export function spireOrreryOf(seed, spec) {
  if (spec?.kind !== 'athenaeum' || !Number.isSafeInteger(spec.h)) return null;
  return orreryOf((egSeed(seed, EG_ORRERY_SALT + spec.h) % 2147483646) + 1, egOrreryTurns(spec.c));
}
export const spireStoneName = (j) => { const n = SD_STONES[j]?.name ?? ''; return n.charAt(0).toUpperCase() + n.slice(1); };
export const spireStoneWords = (j, h) => `${spireStoneName(j)} - ${sdHourShown(h)}`;
export const spireRiddleLines = (o) => (o?.riddles ?? []).map((r) => r.text);
