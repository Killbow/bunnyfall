// Daggerfall Enemy Expansion's enemy ids, read from the mod's tables without its install.
// The account service loads none of the game, and its item rules read these ids for soul gems.

import { DEX_TABLE_TEXT } from './dexTableText.js';
import { MUDEX_TABLE_TEXT } from './mudexTableText.js';
import { readCsvTable, parseCsInt } from './dexCsv.js';
import { isClassicEnemyId } from '../../characters/enemyBasics.js';

export const DEX_ENEMY_IDS = Object.freeze((() => {
  const ids = new Set();
  for (const [name, text] of [...Object.entries(DEX_TABLE_TEXT), ...Object.entries(MUDEX_TABLE_TEXT)]) {
    if (!name.endsWith('.mdb.csv')) continue;
    const table = readCsvTable(text);
    const col = table.column('ID');
    if (col == null) continue;
    for (const { tokens } of table.rows) {
      let id;
      try { id = parseCsInt(tokens[col]); } catch { continue; }
      if (!isClassicEnemyId(id)) ids.add(id);
    }
  }
  return [...ids].sort((a, b) => a - b);
})());
