// Enemy entity builder: DFU's SetEnemyCareer and RollEnemyClassMaxHealth, with career loading from the data files.

import { effectiveSkill, rawSkillForEffective } from './skillSoftcap.js';
import { KNIGHT_CITY_WATCH as KNIGHT_CITYWATCH_ID } from './mobileTypes.js';
import { meanerMonstersRow as pcaaoMeanerMonstersRow } from '../combat/pcaaoMeanerMonsters.js';
import { applyMeanerMonsters } from './meanerMonsters.js';
import { enemyEntityType, enemyCareerIndex } from './enemyBasics.js';
import { customCareerTemplate } from './customEnemies.js';

export { KNIGHT_CITY_WATCH as KNIGHT_CITYWATCH_ID } from './mobileTypes.js';

let _monsterBsa = null;
let _monsterBsaRead = null;
const _monsterCareers = new Map();
export async function loadMonsterCareer(careerIndex, fetchBytes) {
  const hit = _monsterCareers.get(careerIndex);
  if (hit) return hit;
  if (!_monsterBsa) {
    _monsterBsaRead ??= (async () => {
      const { BsaFile } = await import('../formats/bsaFile.js');
      return (_monsterBsa = new BsaFile(await fetchBytes('MONSTER.BSA')));
    })().finally(() => { _monsterBsaRead = null; });
    _monsterBsa = await _monsterBsaRead;
  }
  const name = `ENEMY${String(careerIndex).padStart(3, '0')}.CFG`;
  const idx = _monsterBsa.getRecordIndex(name);
  if (idx === -1) return null;
  const { ClassFile } = await import('../formats/classFile.js');
  const cf = new ClassFile();
  cf.load(_monsterBsa.getRecordBytes(idx));
  _monsterCareers.set(careerIndex, cf.career);
  return cf.career;
}

const _classCareers = new Map();
export async function loadClassCareer(careerIndex, fetchBytes) {
  if (_classCareers.has(careerIndex)) return _classCareers.get(careerIndex);
  const { ClassFile } = await import('../formats/classFile.js');
  const cf = new ClassFile();
  let bytes;
  try { bytes = await fetchBytes(`CLASS${String(careerIndex).padStart(2, '0')}.CFG`); } catch { bytes = null; }
  const career = bytes && cf.load(bytes) !== false ? cf.career : null;
  _classCareers.set(careerIndex, career);
  return career;
}

export async function loadEnemyCareer(mobileType, fetchBytes) {
  const custom = customCareerTemplate(mobileType);
  if (custom) return custom.load(fetchBytes);
  const kind = enemyEntityType(mobileType);
  if (kind === 'monster') return loadMonsterCareer(mobileType, fetchBytes);
  if (kind === 'class') return loadClassCareer(mobileType - 128, fetchBytes);
  return null;
}

const _mintRowEditors = [];
export function registerMintRowEditor(fn) {
  if (typeof fn !== 'function') throw new Error('registerMintRowEditor: a function of (mobileType, row)');
  _mintRowEditors.push(fn);
}
export function _resetMintRowEditors() { _mintRowEditors.length = 0; }
const editAtMint = (mobileType, row) => { let r = row; for (const fn of _mintRowEditors) r = fn(mobileType, r) ?? r; return r; };

export function rollEnemyClassMaxHealth(level, hitPointsPerLevel, rollFn = Math.random) {
  const baseHealth = 10;
  let maxHealth = baseHealth;
  for (let i = 0; i < level; i++) {
    maxHealth += 1 + Math.floor(rollFn() * hitPointsPerLevel);
  }
  return maxHealth;
}

export function skillsLevel(level) {
  const s = level * 5 + 30;
  return s > 100 ? 100 : s;
}

export function applyProgressionScaling(entity, scaling) {
  if (!entity || !scaling) return entity;
  if (typeof entity.skills === 'number') {
    entity.skills = rawSkillForEffective(effectiveSkill(entity.skills) + scaling.skillGain);
  }
  entity.maxHealth = Math.max(1, Math.round(entity.maxHealth * scaling.healthMult));
  entity.health = entity.maxHealth;
  if (scaling.heroHealth > 1) entity.healthMult = (entity.healthMult ?? 1) * scaling.heroHealth;
  entity.damageScale = (Number.isFinite(entity.damageScale) ? entity.damageScale : 1) * scaling.damageMult;
  entity.challengeLevel = (entity.level ?? 1) + scaling.challengeLevels;
  entity.progression = { share: scaling.share, veteran: scaling.veteran, place: scaling.place ?? 0, edge: scaling.edge, hero: { damage: scaling.heroDamage ?? 1, health: scaling.heroHealth ?? 1 } };
  return entity;
}

/**
 * @param mobileType
 * @param basics
 * @param career
 * @param playerLevel
 */
export function makeEnemyEntity(mobileType, basicsIn, career, playerLevel, rollFn = Math.random, { exactLevel = false } = {}) {
  const isClass = enemyEntityType(mobileType) === 'class';
  const basics = editAtMint(mobileType, pcaaoMeanerMonstersRow(mobileType, applyMeanerMonsters(mobileType, basicsIn)));
  const stats = career
    ? {
        strength: career.strength, intelligence: career.intelligence,
        willpower: career.willpower, agility: career.agility,
        endurance: career.endurance, personality: career.personality,
        speed: career.speed, luck: career.luck,
      }
    : { strength: 50, intelligence: 50, willpower: 50, agility: 50, endurance: 50, personality: 50, speed: 50, luck: 50 };
  let level, maxHealth, liveSpeed, armor;
  if (isClass) {
    level = playerLevel;
    // exactLevel skips the watchman bonus when the level was already rolled by the entity this copies.
    if (mobileType === KNIGHT_CITYWATCH_ID && !exactLevel) level += 3 + Math.floor(rollFn() * 4);
    maxHealth = rollEnemyClassMaxHealth(level, career.hitPointsPerLevel, rollFn);
    liveSpeed = career.speed;
    armor = 0;
  } else {
    level = basics.level;
    maxHealth = basics.minHealth + Math.floor(rollFn() * (basics.maxHealth + 1 - basics.minHealth));
    liveSpeed = career ? career.speed : 50;
    armor = (basics.armorValue ?? 0) * 5;
  }
  return {
    mobileType,
    isClass,
    isPlayer: false,
    careerIndex: enemyCareerIndex(mobileType),
    level,
    maxHealth,
    health: maxHealth,
    liveSpeed,
    armor,
    armorValues: new Array(7).fill(isClass ? 100 : armor),
    skills: skillsLevel(level),
    basics,
    stats,
    fatigue: (stats.strength + stats.endurance) * 64,
    // The whole career stays: saving throws and poison immunity read its tolerance bytes.
    career,
    attackModifierFlags: career ? career.attackModifierFlags : null,
    minMetalToHit: basics.minMetalToHit,
    team: basics.team ?? 'PlayerEnemy',
    // mobileTeam is a per-instance copy of the row team, as DFU copies the MobileEnemy struct.
    mobileTeam: basics.team ?? 'PlayerEnemy',
    affinity: basics.affinity,
    name: isClass ? career.name : undefined,
  };
}

export const enemyLootSpawned = Object.freeze({
  _fns: [],
  add(fn) { this._fns.push(fn); return () => { const i = this._fns.indexOf(fn); if (i >= 0) this._fns.splice(i, 1); }; },
  raise(args) { for (const fn of [...this._fns]) fn(args); },
});
