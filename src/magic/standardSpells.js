// Every spell list (the magic registries and character creation) builds from standardSpellsByIndex, so a mod's
// SpellRecords.json spells appear in all of them or in none.
import { readSpellsStd, spellsByIndexMap } from '../formats/spellsStd.js';

const EFFECT_FIELDS = Object.freeze(['type', 'subType', 'durationBase', 'durationMod', 'durationPerLevel', 'chanceBase', 'chanceMod',
  'chancePerLevel', 'magnitudeBaseLow', 'magnitudeBaseHigh', 'magnitudeLevelBase', 'magnitudeLevelHigh', 'magnitudePerLevel']);
const RECORD_FIELDS = Object.freeze({ spellName: 'name', element: 'element', rangeType: 'rangeType', cost: 'cost', index: 'index', icon: 'icon' });

const blankEffect = () => Object.fromEntries(EFFECT_FIELDS.map((k) => [k, 0]));
const effectOf = (item) => { const e = blankEffect(); for (const k of EFFECT_FIELDS) if (Number.isInteger(item?.[k])) e[k] = item[k]; return e; };

const _assets = [];
export function registerSpellRecordsAsset(source, items) {
  if (!Array.isArray(items)) throw new Error(`registerSpellRecordsAsset: ${source}'s SpellRecords.json is no list`);
  _assets.push({ source, items });
}
export function _resetSpellRecordsAssets() { _assets.length = 0; }

// A named effects array replaces all of the record's effects, as DFU's deserializer replaces an array.
export function spellRecordFromJson(item, base = null) {
  const r = base ? structuredClone(base) : { effects: [blankEffect(), blankEffect(), blankEffect()], element: -1, rangeType: -1, cost: -1, name: '', icon: -1, index: -1 };
  for (const [json, field] of Object.entries(RECORD_FIELDS)) {
    if (!(json in item)) continue;
    r[field] = field === 'name' ? String(item[json]) : item[json];
  }
  if (Array.isArray(item.effects)) r.effects = item.effects.map(effectOf);
  return r;
}

export function mergeSpellRecords(records) {
  for (const { items } of _assets) {
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const at = records.findIndex((r) => r.index === item.index);
      if (at !== -1) records[at] = spellRecordFromJson(item, records[at]);
      else records.push(spellRecordFromJson(item));
    }
  }
  return records;
}

export const standardSpellsByIndex = (bytes) => spellsByIndexMap(mergeSpellRecords(readSpellsStd(bytes)));
