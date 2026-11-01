// @ts-check
// ENCOUNTER-LEVEL: the level the open land builds a fight at - the party's (mentorMode.js effectiveLevel) placed on the
// wilds' tier (encounterLevel.js wildTier: the day's, the night's, a road's, which is the tamer). Quests keep their own
// (questFoeLevel: the party level stamped on the quest at its acceptance, `qlv`).
import { effectiveLevel } from './mentorMode.js';
import { placeLevel, wildTier } from './encounterLevel.js';

/** @param {any} entity @param {{ night?: boolean, road?: boolean }} [when] */
export const wildEncounterLevel = (entity, when = {}) => placeLevel(effectiveLevel(entity), wildTier(when));

/** A quest foe's level: the stamp its quest took at acceptance, or null (an old quest, a foe of no quest's).
 *  @param {any} behaviour a QuestResourceBehaviour */
export function questFoeLevel(behaviour) {
  const q = behaviour?.targetQuest ?? behaviour?.machine?.getQuest?.(behaviour?.questUID) ?? null;
  const l = q?.qlv;
  return Number.isFinite(l) && l >= 1 ? l : null;
}
