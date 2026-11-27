import { SKILLS, SKILL_COUNT, SKILLS_RECENTLY_RAISED_WORDS, levelUpSkillSum } from './skills.js';
import { spellPointsFor } from '../combat/formulas.js';
import { mintCharacterId } from './characterId.js';
import { restoreAbilityProgress } from '../combat/abilities/progress.js';
import { CLASSIC_GAME_START_TIME } from '../world/gameDate.js';
import { liveStat, STAT_KEYS_ORDER, FATIGUE_MULTIPLIER } from './statMods.js';
import { renownHpOf, renownMpOf, foldMpOf, spireHpOf } from './renownLayer.js';
import { ensureOfflinePsijicSeals } from '../systems/psijicSealsLaw.js';

export const CLASS_CAREERS = Object.freeze([
  'Mage', 'Spellsword', 'Battlemage', 'Sorcerer', 'Healer',
  'Nightblade', 'Bard', 'Burglar', 'Rogue', 'Acrobat', 'Thief',
  'Assassin', 'Monk', 'Archer', 'Ranger', 'Barbarian', 'Warrior',
  'Knight',
]);



export const STAT_MIN_BONUS_ROLL = 0;
export const STAT_MAX_BONUS_ROLL = 10;
export const STAT_MIN_BONUS_POOL = 6;
export const STAT_MAX_BONUS_POOL = 14;
export { STAT_KEYS_ORDER };
const STAT_KEYS = STAT_KEYS_ORDER;

export function rollStats(career, rolls = Math.random) {
  const range = (lo, hi) => lo + Math.floor(rolls() * (hi + 1 - lo));
  const stats = {};
  for (const k of STAT_KEYS) stats[k] = career[k] + range(STAT_MIN_BONUS_ROLL, STAT_MAX_BONUS_ROLL);
  const bonusPool = range(STAT_MIN_BONUS_POOL, STAT_MAX_BONUS_POOL);
  return { stats, bonusPool };
}

export function statTotal(stats) {
  let n = 0;
  for (const k of STAT_KEYS) n += stats?.[k] ?? 0;
  return n;
}

export const SKILL_DEFAULT_MIN = 3;
export const SKILL_DEFAULT_MAX = 6;
export const PRIMARY_SKILL_MIN = 28;
export const MAJOR_SKILL_MIN = 18;
export const MINOR_SKILL_MIN = 13;
export const SKILL_BONUS_ROLL_MAX = 3;
export const BONUS_POOL_PER_SKILL_GROUP = 6;

export function rollSkills(career, rolls = Math.random) {
  const range = (lo, hi) => lo + Math.floor(rolls() * (hi + 1 - lo));
  const skills = new Array(SKILL_COUNT);
  for (let i = 0; i < SKILL_COUNT; i++) skills[i] = range(SKILL_DEFAULT_MIN, SKILL_DEFAULT_MAX);
  for (const id of career.primarySkills) skills[id] = PRIMARY_SKILL_MIN + range(0, SKILL_BONUS_ROLL_MAX);
  for (const id of career.majorSkills) skills[id] = MAJOR_SKILL_MIN + range(0, SKILL_BONUS_ROLL_MAX);
  for (const id of career.minorSkills) skills[id] = MINOR_SKILL_MIN + range(0, SKILL_BONUS_ROLL_MAX);
  return { skills, groupPools: { primary: BONUS_POOL_PER_SKILL_GROUP, major: BONUS_POOL_PER_SKILL_GROUP, minor: BONUS_POOL_PER_SKILL_GROUP } };
}

export const STARTING_SPELL_SETS = Object.freeze({
  0: [1, 37, 2, 97, 8],
  1: [8, 44, 37],
  2: [8, 2, 37],
  3: [1, 37, 2, 97, 8],
  4: [97, 2, 1, 37],
  5: [44, 2],
  6: [37],
});

export const HEALER_CAREER_INDEX = 4;
export const HEAL_OTHER_SOURCE_SPELL = 97;
export const HEAL_OTHER_INDEX = -1000;
export const HEAL_OTHER_NAME = "Balyna's Healing Touch";
export function healOtherSpell(spellsByIndex) {
  const src = spellsByIndex?.get?.(HEAL_OTHER_SOURCE_SPELL);
  if (!src || !Array.isArray(src.effects)) return null;
  return {
    effects: src.effects.map((e) => ({ ...e })),
    element: src.element,
    rangeType: 1,
    cost: 0,
    name: HEAL_OTHER_NAME,
    icon: src.icon,
    index: HEAL_OTHER_INDEX,
    custom: true,
  };
}

let _spellsAssigner = null;
export function setStartingSpellsAssigner(fn) { _spellsAssigner = typeof fn === 'function' ? fn : null; }
export function assignStartingSpells(careerIndex, spellsByIndex, career = null) {
  return _spellsAssigner?.(career, spellsByIndex) ?? startingSpells(careerIndex, spellsByIndex);
}

export function startingSpells(careerIndex, spellsByIndex) {
  const set = STARTING_SPELL_SETS[careerIndex];
  if (!set || !spellsByIndex) return [];
  const out = [];
  for (const id of set) {
    const sp = spellsByIndex.get(id);
    if (sp) out.push(sp);
    else console.warn(`[chargen] starting spell ${id} missing from SPELLS.STD`);
  }
  if (careerIndex === HEALER_CAREER_INDEX) {
    const touch = healOtherSpell(spellsByIndex);
    if (touch) out.push(touch);
  }
  return out;
}

export const SPELL_POINT_MULTIPLIERS = Object.freeze({ 0: 3.0, 4: 2.0, 8: 1.75, 12: 1.5, 16: 1.0, 20: 0.5 });
export function spellPointMultiplier(abilityFlagsAndSpellPointsBitfield) {
  return SPELL_POINT_MULTIPLIERS[(abilityFlagsAndSpellPointsBitfield & 0x1C00) >> 8] ?? 1.0;
}
export const spellPoints = spellPointsFor;

export const hitPointsModifier = (endurance) => Math.floor(endurance / 10) - 5;
export const rollMaxHealthLevel1 = (career) => 25 + career.hitPointsPerLevel;

export function hitPointsPerLevelUp(career, endurance, rolls = Math.random) {
  const minRoll = Math.trunc(career.hitPointsPerLevel / 2);
  const maxRoll = career.hitPointsPerLevel;
  let add = minRoll + Math.floor(rolls() * (maxRoll + 1 - minRoll));
  add += hitPointsModifier(endurance);
  return add < 1 ? 1 : add;
}

export function spendPoolLowest(values, keysOrIds, pool) {
  let p = pool;
  while (p > 0) {
    let low = keysOrIds[0];
    for (const k of keysOrIds) if (values[k] < values[low]) low = k;
    values[low] += 1;
    p--;
  }
}

export function createCharacter(playerEntity, career, careerIndex, { rolls = Math.random, name = career.name } = {}) {
  const { stats, bonusPool } = rollStats(career, rolls);
  spendPoolLowest(stats, STAT_KEYS, bonusPool);
  const { skills, groupPools } = rollSkills(career, rolls);
  spendPoolLowest(skills, career.primarySkills, groupPools.primary);
  spendPoolLowest(skills, career.majorSkills, groupPools.major);
  spendPoolLowest(skills, career.minorSkills, groupPools.minor);
  return applyCharacter(playerEntity, career, careerIndex, { name, stats, skills, rolls });
}

export function applyCharacter(playerEntity, career, careerIndex, { name = career.name, gender, race, raceId, faceIndex, lookRace = null, stats, skills, rolls = Math.random } = {}) {
  const maxHealth = rollMaxHealthLevel1(career);
  const maxMagicka = spellPoints(stats.intelligence, spellPointMultiplier(career.abilityFlagsAndSpellPointsBitfield ?? 0x1000));
  Object.assign(playerEntity, {
    maxMagicka,
    magicka: maxMagicka,
    fatigue: (stats.strength + stats.endurance) * FATIGUE_MULTIPLIER,
    name,
    gender: gender ?? playerEntity.gender ?? 'male',
    race: race ?? playerEntity.race ?? 'Breton',
    raceId: raceId ?? playerEntity.raceId ?? 1,
    faceIndex: faceIndex ?? playerEntity.faceIndex ?? 0,
    lookRace: lookRace ?? null,
    career,
    careerIndex,
    level: 1,
    maxHealth,
    health: maxHealth,
    stats,
    skills,
    skillUses: new Array(SKILL_COUNT).fill(0),
    skillsRecentlyRaised: new Array(SKILLS_RECENTLY_RAISED_WORDS).fill(0),

    lastSkillCheckTime: CLASSIC_GAME_START_TIME,
    chargenDone: true,
    wayfarerAnchor: null,
    characterId: mintCharacterId(),
  });
  playerEntity.startingLevelUpSkillSum = levelUpSkillSum(playerEntity);
  playerEntity.currentLevelUpSkillSum = playerEntity.startingLevelUpSkillSum;
  defineLiveMaxMagicka(playerEntity);
  defineLiveMaxHealth(playerEntity);
  restoreAbilityProgress(playerEntity, null);
  if (playerEntity._online !== true) ensureOfflinePsijicSeals(playerEntity);
  return playerEntity;
}

export function defineLiveMaxHealth(entity) {
  const desc = Object.getOwnPropertyDescriptor(entity, 'maxHealth');
  if (desc && desc.get) return entity;
  let stored = desc ? desc.value : 0;
  Object.defineProperty(entity, 'maxHealth', {
    configurable: true,
    enumerable: true,
    get() {
      const limiter = this.maxHealthLimiter;
      const own = limiter >= 1 && limiter < stored ? limiter : stored;
      return own + renownHpOf(this) + spireHpOf(this);
    },
    set(v) { stored = v; },
  });
  Object.defineProperty(entity, 'rawMaxHealth', {
    configurable: true,
    enumerable: false,
    get() { return stored; },
    set(v) { stored = v; },
  });
  return entity;
}

export function defineLiveMaxMagicka(entity) {
  const desc = Object.getOwnPropertyDescriptor(entity, 'maxMagicka');
  if (desc && desc.get) return entity;
  let stored = desc ? desc.value : 0;
  Object.defineProperty(entity, 'maxMagicka', {
    configurable: true,
    enumerable: true,
    get() {
      const career = this.career;
      const raw = career
        ? spellPoints(liveStat(this, 'intelligence'),
          spellPointMultiplier(career.abilityFlagsAndSpellPointsBitfield ?? 0x1000))
        : stored;
      const effective = raw + (this.maxMagickaModifier ?? 0) + renownMpOf(this) + foldMpOf(this);
      return effective < 0 ? 0 : effective;
    },
    set(v) { stored = v; },
  });
  return entity;
}

