import { Table } from './table.js';

const _tables = {
  staticMessages: null,
  globalVars: null,
  places: null,
  items: null,
  foes: null,
  diseases: null,
  factions: null,
  sounds: null,
  spells: null,
};

const _extraRows = { places: [], factions: [], items: [], foes: [] };
function applyExtraRows(table, entries) {
  for (const e of entries) {
    if (typeof e === 'string') table.addIntoTable([e]);
    else if (e && typeof e.line === 'string' && !table.hasValue(e.unlessKey)) table.addIntoTable([e.line]);
  }
}
export function addIntoQuestTables(rows = {}) {
  for (const [key, lines] of Object.entries(rows)) {
    if (!_extraRows[key] || !Array.isArray(lines)) continue;
    _extraRows[key].push(...lines);
    if (_tables[key]) applyExtraRows(_tables[key], lines);
  }
}
export function _resetExtraQuestRows() { for (const k of Object.keys(_extraRows)) _extraRows[k].length = 0; }

export function loadQuestTables(sources) {
  const map = {
    'Quests-StaticMessages': 'staticMessages',
    'Quests-GlobalVars': 'globalVars',
    'Quests-Places': 'places',
    'Quests-Items': 'items',
    'Quests-Foes': 'foes',
    'Quests-Diseases': 'diseases',
    'Quests-Factions': 'factions',
    'Quests-Sounds': 'sounds',
    'Quests-Spells': 'spells',
  };
  for (const [file, key] of Object.entries(map)) {
    if (sources[file] != null) {
      _tables[key] = new Table(sources[file]);
      if (_extraRows[key]?.length) applyExtraRows(_tables[key], _extraRows[key]);
    }
  }
}

function need(key, name) {
  if (!_tables[key]) throw new Error(`quest tables not loaded: ${name} (call loadQuestTables first)`);
  return _tables[key];
}

export const staticMessagesTable = () => need('staticMessages', 'Quests-StaticMessages');
export const globalVarsTable = () => need('globalVars', 'Quests-GlobalVars');
export const placesTable = () => need('places', 'Quests-Places');
export const itemsTable = () => need('items', 'Quests-Items');
export const foesTable = () => need('foes', 'Quests-Foes');
export const soundsTable = () => need('sounds', 'Quests-Sounds');
export const factionsTable = () => need('factions', 'Quests-Factions');
export const spellsTable = () => need('spells', 'Quests-Spells');
export const diseasesTable = () => need('diseases', 'Quests-Diseases');

export function resetQuestTables() {
  for (const k of Object.keys(_tables)) _tables[k] = null;
}
