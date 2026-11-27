// Daggerfall Enemy Expansion's encounter tables, picked as BestiaryMod picks them,
// on the encounter table door (characters/encounterTableDoor.js).

import { srand, rand, getSeed, setSeed } from '../../formats/dfRandom.js';
import { CLIMATE_TABLE } from '../../characters/encounters.js';

export function createDexEncounterSelector(read, { random = Math.random } = {}) {
  const written = new Map();
  const tablesAt = (index) => read.byIndex.get(index) ?? [];
  const write = (index, table) => { if (table.enemyIds) written.set(index, table.enemyIds); };
  const selectTable = (index) => {
    const tables = tablesAt(index);
    if (tables.length) write(index, tables[Math.floor(random() * tables.length)]);
  };
  const selectDungeonTable = (index, { unknown2, region }) => {
    const tables = tablesAt(index);
    if (!tables.length) return;
    const was = getSeed();
    srand((unknown2 & 0xffff) ^ ((region & 0xff) << 8));
    const pick = rand() % tables.length;
    setSeed(was);
    write(index, tables[pick]);
  };
  const selectClimateTables = (climateIndex) => {
    const band = CLIMATE_TABLE.get(climateIndex);
    if (band) { selectTable(band[1]); selectTable(band[2]); }
  };
  return {
    table(index, place) {
      if (place?.dungeon) selectDungeonTable(index, place.dungeon);
      return written.get(index) ?? null;
    },
    choices(index) {
      const ids = tablesAt(index).map((t) => t.enemyIds).filter(Boolean);
      return ids.length ? ids : null;
    },
    gps: {
      climateIndexChanged: selectClimateTables,
      exitLocationRect: selectClimateTables,
      enterLocationRect: (climateIndex) => { const band = CLIMATE_TABLE.get(climateIndex); if (band) selectTable(band[0]); },
    },
  };
}
