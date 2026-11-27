// @ts-check
// Encounter level for the open land: the party's level placed on the wilds' tier.
import { effectiveLevel } from './mentorMode.js';
import { placeLevel, wildTier } from './encounterLevel.js';

/** @param {any} entity @param {{ night?: boolean, road?: boolean }} [when] */
export const wildEncounterLevel = (entity, when = {}) => placeLevel(effectiveLevel(entity), wildTier(when));

/** @param {any} behaviour */
export function questFoeLevel(behaviour) {
  const q = behaviour?.targetQuest ?? behaviour?.machine?.getQuest?.(behaviour?.questUID) ?? null;
  const l = q?.qlv;
  return Number.isFinite(l) && l >= 1 ? l : null;
}
