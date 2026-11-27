// The level a skill's cost reads: the level the character has earned, ascended or not.
// Holding a level back gains nothing, and taking it costs nothing.
import { usesVirtueLeveling, LEVELUP_TOTAL } from './oblivionLeveling.js';
import { LEVEL_CAP } from './levelCap.js';

const classicEarned = (start, current) => Math.floor((current - start + 28) / 15);

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
