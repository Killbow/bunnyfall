import { OGHMA_BONUS_POOL } from '../items/artifactEffects.js';
import { SKILLS, setSkillRecentlyIncreased, levelUpSkillSum } from './skills.js';
import { SKILL_SOFT_CAP, SKILL_HARD_CAP, OVERCAP_LEVEL_CAP, softcapCostMultiplier, milestoneAt } from './skillSoftcap.js';
import { masterSkillsActive, skillCanPassCap, masteryRefusal } from './masterSkills.js';
import { hitPointsPerLevelUp, spendPoolLowest } from './chargen.js';
import { ONLINE_BONUS_POOL } from './levelEven.js';
import { refreshOnlineLayer } from './renownLayer.js';
import { isOnlinePage } from '../platform/onlineLane.js';
import { LEVEL_CAP, atLevelCap, releaseCapLatch } from './levelCap.js';
import { earnedLevel } from './earnedLevel.js';
import {
  usesVirtueLeveling, addSkillProgress, checkForVirtueLevelUp, levelingSettings, virtueLevelUpHeadless,
} from './oblivionLeveling.js';

export const SKILL_ADVANCEMENT_MULTIPLIER = Object.freeze([
  12,
  1, 1,
  5,
  15, 15, 15, 15, 15, 15, 15, 15, 15,
  2,
  1,
  2, 2,
  1,
  2,
  1,
  4,
  50,
  1,
  2,
  1, 1,
  2,
  1,
  2, 2, 2, 2, 2,
  1,
  8,
]);

export const SKILL_RAISE_CHECK_INTERVAL = 360;
export const LEVELUP_BONUS_POOL_MIN = 4;
export const LEVELUP_BONUS_POOL_MAX = 6;

export function skillUsesForAdvancement(skillValue, skillMult, careerAdvMult, level) {
  const levelMod = Math.pow(1.04, level);
  return Math.floor((skillValue * skillMult * careerAdvMult * levelMod * 2) / 5) + 1;
}

export const LEVELUP_SKILL_SUM_PER_LEVEL = 15;

export const calculatePlayerLevel = (startingSum, currentSum) =>
  Math.floor((currentSum - startingSum + 28) / LEVELUP_SKILL_SUM_PER_LEVEL);

export const levelUpSkillSumAnchor = (currentSum, level) =>
  currentSum + 28 - level * LEVELUP_SKILL_SUM_PER_LEVEL;

export { levelUpSkillSum };

export function alreadyMasteredASkill(entity) {
  return entity.career.primarySkills.some((id) => entity.skills[id] >= SKILL_SOFT_CAP);
}

export function softcapUsesForAdvancement(skillValue, skillMult, careerAdvMult, level) {
  const lv = skillValue >= SKILL_SOFT_CAP ? Math.min(level, OVERCAP_LEVEL_CAP) : level;
  return skillUsesForAdvancement(skillValue, skillMult, careerAdvMult, lv) * softcapCostMultiplier(skillValue);
}

export { getSkillRecentlyIncreased as skillRecentlyIncreased, setSkillRecentlyIncreased, resetSkillsRecentlyRaised } from './skills.js';

export function raiseSkills(entity, classicTimeMinutes, rolls = Math.random, onLevelUp = null, onMastery = null, onRaise = null, onMilestone = null) {
  if (!entity.chargenDone) return [];
  if ((classicTimeMinutes - (entity.lastSkillCheckTime ?? 0)) <= SKILL_RAISE_CHECK_INTERVAL) return [];
  entity.lastSkillCheckTime = classicTimeMinutes;
  const virtue = usesVirtueLeveling(entity);
  const virtueSettings = virtue ? levelingSettings() : null;
  const raised = [];
  for (let i = 0; i < entity.skillUses.length; i++) {
    const needed = skillUsesForAdvancement(
      entity.skills[i], SKILL_ADVANCEMENT_MULTIPLIER[i], entity.career.advancementMultiplier, earnedLevel(entity));
    const reflexesMod = 0x10000 - ((entity.reflexes - 2) << 13);
    const calcUses = (entity.skillUses[i] * reflexesMod) >> 16;
    const master = masterSkillsActive(entity);
    if (entity.skills[i] >= SKILL_SOFT_CAP && skillCanPassCap(entity, i)) {
      if (entity.skills[i] >= SKILL_HARD_CAP) continue;
      const uses = Math.floor((entity.skillUses[i] * reflexesMod) / 0x10000);
      const cost = softcapUsesForAdvancement(entity.skills[i], SKILL_ADVANCEMENT_MULTIPLIER[i], entity.career.advancementMultiplier, earnedLevel(entity));
      const prog = (entity.skillProgress ??= new Array(entity.skillUses.length).fill(0));
      prog[i] = (prog[i] ?? 0) + uses / cost;
      entity.skillUses[i] = 0;
      if (!(prog[i] >= 1)) continue;
      const nextCost = softcapUsesForAdvancement(entity.skills[i] + 1, SKILL_ADVANCEMENT_MULTIPLIER[i], entity.career.advancementMultiplier, earnedLevel(entity));
      prog[i] = (prog[i] - 1) * cost / nextCost;
      entity.skills[i] += 1;
      setSkillRecentlyIncreased(entity, i);
      raised.push(i);
      onRaise?.(i);
      const ms = milestoneAt(entity.skills[i]);
      if (ms) onMilestone?.(i, ms);
      continue;
    }
    if (calcUses < needed) continue;
    entity.skillUses[i] = 0;
    if (entity.skills[i] < 100 && (entity.skills[i] < 95 || master || !alreadyMasteredASkill(entity))) {
      if (virtue) addSkillProgress(entity, i, virtueSettings);
      entity.skills[i] += 1;

      setSkillRecentlyIncreased(entity, i);
      raised.push(i);
      onRaise?.(i);
      if (entity.skills[i] === 100 && entity.career.primarySkills.includes(i)) onMastery?.(i);
    }
  }
  if (raised.length) { const sum = levelUpSkillSum(entity); if (!(entity.currentLevelUpSkillSum >= sum)) entity.currentLevelUpSkillSum = sum; }
  if (virtue ? checkForVirtueLevelUp(entity) : checkForLevelUp(entity)) {
    if (!onLevelUp) {
      if (virtue) virtueLevelUpHeadless(entity, virtueSettings, rolls);
      else applyLevelUp(entity, (stats, pool) => spendPoolLowest(stats, Object.keys(stats), pool), rolls);
    } else {
      onLevelUp(entity);
    }
  }
  return raised;
}

export function skillAdvanceProgress(entity, i, { now = null } = {}) {
  const wait = skillCheckWait(entity, now);
  const value = entity.skills?.[i] ?? 0;
  const needed = skillUsesForAdvancement(value, SKILL_ADVANCEMENT_MULTIPLIER[i], entity.career?.advancementMultiplier ?? 1, earnedLevel(entity));
  const reflexesMod = 0x10000 - (((entity.reflexes ?? 2) - 2) << 13);
  const tally = entity.skillUses?.[i] ?? 0;
  if (value >= SKILL_SOFT_CAP && skillCanPassCap(entity, i)) {
    if (value >= SKILL_HARD_CAP) return { have: 0, need: 0, ready: false, held: 'cap', wait };
    const cost = softcapUsesForAdvancement(value, SKILL_ADVANCEMENT_MULTIPLIER[i], entity.career?.advancementMultiplier ?? 1, earnedLevel(entity));
    const uses = Math.floor((tally * reflexesMod) / 0x10000), banked = entity.skillProgress?.[i] ?? 0;
    return { have: Math.floor(banked * cost) + uses, need: cost, ready: banked + uses / cost >= 1, held: null, wait };
  }
  const have = (tally * reflexesMod) >> 16;
  const held = value >= 100 ? (masteryRefusal(entity, i) == null ? 'master' : 'cap')
    : value >= 95 && !masterSkillsActive(entity) && lockedBy(entity, i) ? 'lock' : null;
  return { have, need: needed, ready: !held && have >= needed, held, wait };
}
export function skillCheckWait(entity, now = null) {
  if (!Number.isFinite(now)) return 0;
  return Math.max(0, Math.floor(entity?.lastSkillCheckTime ?? 0) + SKILL_RAISE_CHECK_INTERVAL + 1 - Math.floor(now));
}
const meetsBelowCap = (entity, i) => ((((entity.skillUses?.[i] ?? 0) * (0x10000 - (((entity.reflexes ?? 2) - 2) << 13))) >> 16)
  >= skillUsesForAdvancement(entity.skills?.[i] ?? 0, SKILL_ADVANCEMENT_MULTIPLIER[i], entity.career?.advancementMultiplier ?? 1, earnedLevel(entity)));
function lockedBy(entity, i) {
  if (alreadyMasteredASkill(entity)) return true;
  for (const j of entity.career?.primarySkills ?? []) {
    if (j >= i || entity.skills?.[j] !== 99 || skillCanPassCap(entity, j)) continue;
    if (meetsBelowCap(entity, j) && !lockedBy(entity, j)) return true;
  }
  return false;
}
export function countReadyToImprove(entity, { now = null } = {}) {
  if (!entity?.chargenDone || !Array.isArray(entity.skillUses) || skillCheckWait(entity, now) > 0) return 0;
  let n = 0;
  for (let i = 0; i < entity.skillUses.length; i++) if (skillAdvanceProgress(entity, i).ready) n++;
  return n;
}
export const skillsReadyToImprove = (entity) => {
  if (!entity?.chargenDone || !Array.isArray(entity.skillUses)) return [];
  const out = [];
  for (let i = 0; i < entity.skillUses.length; i++) if (skillAdvanceProgress(entity, i).ready) out.push(i);
  return out;
};

export function checkForLevelUp(entity) {
  releaseCapLatch(entity);
  const calculated = Math.min(LEVEL_CAP, calculatePlayerLevel(entity.startingLevelUpSkillSum, entity.currentLevelUpSkillSum));
  const levelUp = entity.level < calculated;
  if (levelUp) {
    entity.readyToLevelUp = true;
    entity.pendingLevel = entity.level + 1;
  }
  return levelUp;
}

export function bonusPoolFor(entity, rolls = Math.random, { online = isOnlinePage() } = {}) {
  if (entity.pendingBonusPool == null) {
    entity.pendingBonusPool = online ? ONLINE_BONUS_POOL : LEVELUP_BONUS_POOL_MIN + Math.floor(rolls() * (LEVELUP_BONUS_POOL_MAX + 1 - LEVELUP_BONUS_POOL_MIN));
  }
  return entity.pendingBonusPool;
}

export function applyLevelUp(entity, distribute, rolls = Math.random, prerolledPool = null) {
  if (!entity.readyToLevelUp) return false;
  if (entity.oghmaLevelUp) {
    distribute(entity.stats, OGHMA_BONUS_POOL);
    refreshOnlineLayer(entity, { keepHealth: true });
    entity.readyToLevelUp = false;
    entity.oghmaLevelUp = false;
    entity.pendingLevel = null;
    entity.pendingBonusPool = null;
    return true;
  }
  if (atLevelCap(entity)) {
    entity.readyToLevelUp = false;
    entity.pendingLevel = null;
    entity.pendingBonusPool = null;
    return false;
  }
  entity.level += 1;
  entity.maxHealth = (entity.rawMaxHealth ?? entity.maxHealth) + hitPointsPerLevelUp(entity.career, entity.stats.endurance, rolls);
  entity.health = Math.min(entity.health, entity.maxHealth);
  const pool = prerolledPool ?? bonusPoolFor(entity, rolls);
  distribute(entity.stats, pool);
  refreshOnlineLayer(entity, { keepHealth: true });
  entity.readyToLevelUp = false;
  entity.pendingLevel = null;
  entity.pendingBonusPool = null;
  return true;
}