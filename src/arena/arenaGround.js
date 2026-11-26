// @ts-check

import { questNameIn } from '../systems/quest/machine.js';

// Quest actions check this at the spawn event, not at placement: a wave left pending would fire every tick and
// interrupt rest. The interval passes as for a hidden enemy, so the curse continues off the grounds.
export const ARENA_GROUND_QUESTS = Object.freeze(['S0000977']);
export const ARENA_GROUND_M = 150;

/**
 * @param {{ questName?: string | null, feet?: number[] | null, centre?: number[] | null, inArenaLevel?: boolean }} q
 */
export function keptOffArenaGround({ questName = null, feet = null, centre = null, inArenaLevel = false } = {}) {
  if (questName == null || !questNameIn(ARENA_GROUND_QUESTS, questName)) return false;
  if (inArenaLevel) return true;
  if (!feet || !centre) return false;
  return Math.hypot(feet[0] - centre[0], feet[2] - centre[2]) < ARENA_GROUND_M;
}
