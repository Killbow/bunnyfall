// BUNNYFALL: THE LEVEL A SKILL'S COST READS. Daggerfall prices a skill raise by 1.04^level, and Daggerfall levels you
// on its own. Here ascending is a button, so "never ascend" made skills train faster and was the meta. The cost now
// reads the level the character has EARNED, ascended or not: holding a level back gains nothing, and taking it costs
// nothing either.
import { usesVirtueLeveling, LEVELUP_TOTAL } from './oblivionLeveling.js';
import { LEVEL_CAP } from './levelCap.js';

/** Daggerfall's level from the skill sum (advancement.js calculatePlayerLevel, restated to keep this a leaf). */
const classicEarned = (start, current) => Math.floor((current - start + 28) / 15);

/** The level the character has earned: its own level, plus every level it is owed and has not taken. */
export function earnedLevel(entity) {
  const level = Number.isFinite(entity?.level) ? entity.level : 1;
  let earned = level;
  if (usesVirtueLeveling(entity)) {
    earned = level + Math.floor(Math.max(0, entity?.levelProgress ?? 0) / LEVELUP_TOTAL);
  } else if (Number.isFinite(entity?.startingLevelUpSkillSum) && Number.isFinite(entity?.currentLevelUpSkillSum)) {
    earned = Math.max(level, classicEarned(entity.startingLevelUpSkillSum, entity.currentLevelUpSkillSum));
  }
  if (entity?.readyToLevelUp && Number.isFinite(entity?.pendingLevel)) earned = Math.max(earned, entity.pendingLevel);
  return Math.min(Math.max(level, LEVEL_CAP), earned);
}
