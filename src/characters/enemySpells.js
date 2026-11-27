import { SKILLS, MAGIC_SKILLS } from './skills.js';

const IMP_SPELLS = Object.freeze([0x07, 0x0A, 0x1D, 0x2C]);
const GHOST_SPELLS = Object.freeze([0x22]);
const ORC_SHAMAN_SPELLS = Object.freeze([0x06, 0x07, 0x16, 0x19, 0x1F]);
const WRAITH_SPELLS = Object.freeze([0x1C, 0x1F]);
const FROST_DAEDRA_SPELLS = Object.freeze([0x10, 0x14]);
const FIRE_DAEDRA_SPELLS = Object.freeze([0x0E, 0x19]);
const DAEDROTH_SPELLS = Object.freeze([0x16, 0x17, 0x1F]);
const VAMPIRE_SPELLS = Object.freeze([0x33]);
const SEDUCER_SPELLS = Object.freeze([0x34, 0x43]);
const VAMPIRE_ANCIENT_SPELLS = Object.freeze([0x08, 0x32]);
const DAEDRA_LORD_SPELLS = Object.freeze([0x08, 0x0A, 0x0E, 0x3C, 0x43]);
const LICH_SPELLS = Object.freeze([0x08, 0x0A, 0x0E, 0x22, 0x3C]);
const ANCIENT_LICH_SPELLS = Object.freeze([0x08, 0x0A, 0x0E, 0x1D, 0x1F, 0x22, 0x3C]);

export const MONSTER_SPELL_LISTS = Object.freeze({
  1: IMP_SPELLS,
  18: GHOST_SPELLS,
  21: ORC_SHAMAN_SPELLS,
  23: WRAITH_SPELLS,
  25: FROST_DAEDRA_SPELLS,
  26: FIRE_DAEDRA_SPELLS,
  27: DAEDROTH_SPELLS,
  28: VAMPIRE_SPELLS,
  29: SEDUCER_SPELLS,
  30: VAMPIRE_ANCIENT_SPELLS,
  31: DAEDRA_LORD_SPELLS,
  32: LICH_SPELLS,
  33: ANCIENT_LICH_SPELLS,
});

export const ENEMY_CLASS_SPELLS = Object.freeze([
  FROST_DAEDRA_SPELLS, DAEDROTH_SPELLS, ORC_SHAMAN_SPELLS,
  VAMPIRE_ANCIENT_SPELLS, DAEDRA_LORD_SPELLS, LICH_SPELLS,
  ANCIENT_LICH_SPELLS,
]);

export const ENEMY_MAGIC_SKILL = 80;

export const SPELL_CAST_SOUND = Object.freeze([352, 353, 350, 351, 349]);

export function setEnemySpells(entity, spellList, spellsByIndex) {
  entity.maxMagicka = 10 * entity.level + 100;
  entity.magicka = entity.maxMagicka;
  entity.skillOverrides = { ...(entity.skillOverrides ?? {}) };
  for (const id of MAGIC_SKILLS) entity.skillOverrides[id] = ENEMY_MAGIC_SKILL;
  entity.spells = [];
  for (const idx of spellList) {
    const sp = spellsByIndex?.get(idx);
    if (!sp) {
      console.error(`[enemySpells] classic spell ${idx} missing from the standard list`);
      continue;
    }
    entity.spells.push(sp);
  }
}

const _spellbooks = [];
export function registerEnemySpellbook(fn) {
  if (typeof fn !== 'function') throw new Error('registerEnemySpellbook: a function of (entity, level)');
  _spellbooks.push(fn);
}
export function _resetEnemySpellbooks() { _spellbooks.length = 0; }

export function enemySpellIndices(entity, level = entity?.level) {
  if (!entity) return [];
  for (const fn of _spellbooks) {
    const book = fn(entity, level);
    if (book) return book;
  }
  if (!entity.isClass) return MONSTER_SPELL_LISTS[entity.careerIndex] ?? [];
  if (!entity.basics?.castsMagic) return [];
  return ENEMY_CLASS_SPELLS[Math.min(6, Math.trunc(level / 3))] ?? [];
}

export function assignEnemySpells(entity, spellsByIndex) {
  if (!spellsByIndex) return;
  const list = enemySpellIndices(entity);
  if (list.length) setEnemySpells(entity, list, spellsByIndex);
}
