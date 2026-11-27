// Mod-writable encounter tables: a mod registers a selector here, and every reader goes through this module.
import { ENCOUNTER_TABLES } from './encounterTables.js';

const _selectors = [];
let _gen = 0;
export function registerEncounterTableSelector(selector) {
  if (typeof selector?.table !== 'function' || typeof selector.choices !== 'function') throw new Error('registerEncounterTableSelector: { table(index, place), choices(index) }');
  _selectors.push(selector);
  _gen++;
}
export const encounterTableGeneration = () => _gen;
export function _resetEncounterTableSelectors() { _selectors.length = 0; _gen++; }

export function encounterTable(index, place = null, rolls = null) {
  if (place?.local || place?.dungeon) {
    for (const s of _selectors) {
      const t = s.table(index, place);
      if (t) return t;
    }
    return ENCOUNTER_TABLES[index] ?? null;
  }
  const choices = encounterTableChoices(index);
  if (choices.length < 2) return choices[0] ?? null;
  if (typeof rolls !== 'function') throw new Error(`encounterTable: table ${index} has ${choices.length} choices, and a roll every machine agrees on picks by its own die`);
  return choices[Math.floor(rolls() * choices.length)];
}

export function encounterTableChoices(index) {
  for (const s of _selectors) {
    const c = s.choices(index);
    if (c?.length) return c;
  }
  return ENCOUNTER_TABLES[index] ? [ENCOUNTER_TABLES[index]] : [];
}
