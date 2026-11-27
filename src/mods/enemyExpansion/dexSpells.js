// Daggerfall Enemy Expansion's spellbook tables: thirteen one-book tables and "Class",
// a ladder of seven books by enemy level.

import { MONSTER_SPELL_LISTS } from '../../characters/enemySpells.js';

const book = (spellIds, minLevel = 0) => Object.freeze({ spellIds: Object.freeze([...spellIds]), minLevel });
const one = (careerIndex) => Object.freeze([book(MONSTER_SPELL_LISTS[careerIndex])]);

export const DEX_SPELLBOOK_TABLES = Object.freeze(new Map([
  ['Imp', one(1)], ['Ghost', one(18)], ['OrcShaman', one(21)], ['Wraith', one(23)], ['FrostDaedra', one(25)],
  ['FireDaedra', one(26)], ['Daedroth', one(27)], ['Vampire', one(28)], ['Seducer', one(29)], ['VampireAncient', one(30)],
  ['DaedraLord', one(31)], ['Lich', one(32)], ['AncientLich', one(33)],
  ['Class', Object.freeze([
    book(MONSTER_SPELL_LISTS[25]), book(MONSTER_SPELL_LISTS[27], 3), book(MONSTER_SPELL_LISTS[21], 6), book(MONSTER_SPELL_LISTS[30], 9),
    book(MONSTER_SPELL_LISTS[31], 12), book(MONSTER_SPELL_LISTS[32], 15), book(MONSTER_SPELL_LISTS[33], 18),
  ])],
]));

export function spellbookOf(table, level) {
  let out = null;
  for (const b of table) if (level >= b.minLevel) out = b;
  return out;
}

export function createDexSpellbooks(raw, propsOf, { ids = [], log = () => {} } = {}) {
  const tables = new Map();
  for (const [name, t] of DEX_SPELLBOOK_TABLES) tables.set(name.toLowerCase(), t);
  for (const [name, spells] of raw) tables.set(String(name).toLowerCase(), Object.freeze([book(spells)]));
  const tableOf = (mobileType) => {
    const name = propsOf(mobileType)?.spellbookTable;
    return name ? tables.get(name.toLowerCase()) ?? null : null;
  };
  for (const id of ids) if (propsOf(id)?.spellbookTable && !tableOf(id)) log('error', `[DEX] Unknown enemy spell table '${propsOf(id).spellbookTable}'`);
  return {
    tables,
    spellbook: (entity, level) => spellbookOf(tableOf(entity?.mobileType) ?? [], level)?.spellIds ?? null,
  };
}
