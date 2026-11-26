// The Daggerfall Enemy Expansion install: what BestiaryMod.Start does at game load, once,
// after the Roleplay & Realism install.

import { DEX_TABLE_TEXT } from './dexTableText.js';
import { MUDEX_TABLE_TEXT } from './mudexTableText.js';
import { DEX_VENDOR, MUDEX_VENDOR, dexLoaded, mudexLoaded } from './dexSwitches.js';
import { meanerMonstersEnabled } from '../../characters/meanerMonsters.js';
import { classicCareers, readCareerTable, readEnemyTables, careerFromSpec, writeEnemyLine, readEncounterTables, addDefaultEncounterTables } from './dexTables.js';
import { createDexEncounterSelector } from './dexEncounters.js';
import { ENCOUNTER_TABLES } from '../../characters/encounterTables.js';
import { registerEncounterTableSelector } from '../../characters/encounterTableDoor.js';
import { onPlayerGpsEvents } from '../../world/playerGps.js';
import { ENEMY_BASICS, registerEnemyRows, isClassicEnemyId, enemyDisplayName } from '../../characters/enemyBasics.js';
import { registerCustomCareerTemplate, registerCustomEnemyName } from '../../characters/customEnemies.js';
import { loadMonsterCareer, loadClassCareer, registerMintRowEditor } from '../../characters/enemyEntity.js';
import { addIntoQuestTables } from '../../systems/quest/tables.js';
import { modSetting, latchModLoaded } from '../modSettings.js';
import { installDexSprites } from './dexSprites.js';
import { dexEnemyNameText } from './dexNames.js';
import { registerCustomEnemyNameText } from '../../ui/textManager.js';
import { installDexBodies } from './dexBodies.js';
import { registerFoeGhost } from '../../characters/foeLook.js';
import { registerSpellRecordsAsset } from '../../magic/standardSpells.js';
import { registerEnemySpellbook } from '../../characters/enemySpells.js';
import { createDexSpellbooks } from './dexSpells.js';
import { createDexCombatDoors } from './dexCombat.js';
import { registerFormulaOverride, registerSkeletalTarget, registerEnemyGroup, registerEnemyLanguage } from '../../combat/formulas.js';
import { registerForcedGender } from '../../characters/mobileUnit.js';
import { installDexTroll } from './dexTroll.js';
import { createDexEquipmentAssigner } from './dexEquipment.js';
import { setEnemyEquipmentAssigner, enemyEquipmentAssigner } from '../../combat/enemyEquipment.js';

export { DEX_VENDOR, dexLoaded };

const dbAssets = (extension, mudex) => [...Object.entries(DEX_TABLE_TEXT), ...(mudex ? Object.entries(MUDEX_TABLE_TEXT) : [])]
  .filter(([n]) => n.endsWith(extension)).map(([n, text]) => [n.replace(/\.csv$/, ''), text]);

const consoleLog = (level, message) => (level === 'error' ? console.error(message) : console.warn(message));

let _read = null;
const _reads = new Map();
const _classicOriginals = new Map();
let _replacedAssigner;

export function dexRead({ log = consoleLog, mudex } = {}) {
  const game = mudex === undefined;
  const key = game ? mudexLoaded() : mudex === true;
  let read = _reads.get(key);
  if (!read) { read = readMod(key, log); _reads.set(key, read); }
  if (game) _read = read;
  return read;
}

function readMod(mudex, log) {
  const careers = classicCareers();
  for (const [name, text] of dbAssets('.cdb.csv', mudex)) readCareerTable(text, careers, name, log);
  const enemies = readEnemyTables(dbAssets('.mdb.csv', mudex), careers, {
    liveRow: (id) => ENEMY_BASICS[id],
    isClassic: isClassicEnemyId,
    classicName: (id) => enemyDisplayName(id),
    log,
  });
  const encounters = addDefaultEncounterTables(readEncounterTables(dbAssets('.tdb.csv', mudex), log), (i) => ENCOUNTER_TABLES[i], log);
  return { careers, ...enemies, encounters };
}

export function dexProperties(mobileId) {
  const read = _read;
  if (!read) return null;
  if (isClassicEnemyId(mobileId)) return dexLoaded() ? read.classic.get(mobileId)?.props ?? null : null;
  return read.enemies.get(mobileId)?.props ?? null;
}

export const dexEnemyIds = () => (_read ? [..._read.enemies.keys()].sort((a, b) => a - b) : []);

const _careers = new Map();
function careerLoader(spec) {
  return (fetchBytes) => {
    if (!_careers.has(spec)) {
      const base = !spec.base ? Promise.resolve(null)
        : spec.base.kind === 'monster' ? loadMonsterCareer(spec.base.index, fetchBytes) : loadClassCareer(spec.base.index, fetchBytes);
      _careers.set(spec, base.then((b) => careerFromSpec(spec, b)));
    }
    return _careers.get(spec);
  };
}

function editedClassicRow(id, row, read) {
  const c = read.classic.get(id);
  if (!c?.row) return row;
  let out = row;
  for (const line of c.lines) {
    const copy = { ...structuredClone(out), id };
    const r = writeEnemyLine(copy, structuredClone(c.props), line.tokens, line.col, { mobileID: id, enemyReplacement: true, classicReplacement: true, careers: read.careers, lineNumber: line.lineNumber });
    if (!r.ok) continue;
    delete copy.id;
    out = copy;
  }
  return out;
}

export const dexClassicRow = (id, row, { mudex = false } = {}) => editedClassicRow(id, row, dexRead({ mudex }));

let _installed = false;
let _dropNameText = null;
export function installEnemyExpansion({ on = modSetting(DEX_VENDOR, 'Enabled') === true, meaner = meanerMonstersEnabled(), log = consoleLog } = {}) {
  if (_installed) return { loaded: dexLoaded(), mudex: mudexLoaded(), enemies: _read?.enemies.size ?? 0 };
  _installed = true;
  const mudex = latchModLoaded(MUDEX_VENDOR, !!on && !!meaner);
  const read = dexRead({ log, mudex });
  _read = read;
  const rows = [];
  for (const [id, e] of read.enemies) {
    const row = { ...e.row };
    delete row.id;
    rows.push([id, row]);
    const spec = read.careers.get(e.careerName) ?? [...read.careers.values()].find((s) => s.name.toLowerCase() === e.careerName.toLowerCase());
    registerCustomCareerTemplate(id, { name: spec.name, load: careerLoader(spec) });
  }
  registerEnemyRows(rows);
  _dropNameText = registerCustomEnemyNameText(dexEnemyNameText);
  registerCustomEnemyName((id) => read.enemies.get(id)?.props.name || null);
  installDexSprites();
  installDexBodies();
  const loaded = latchModLoaded(DEX_VENDOR, on);
  if (loaded) {
    for (const [id, c] of read.classic) {
      if (!c.row) continue;
      const target = ENEMY_BASICS[id];
      _classicOriginals.set(id, structuredClone(target));
      for (const k of Object.keys(target)) delete target[k];
      const row = { ...c.row };
      delete row.id;
      Object.assign(target, row);
    }
    registerMintRowEditor((mobileType, row) => (read.classic.get(mobileType)?.row ? editedClassicRow(mobileType, row, read) : row));
    registerFoeGhost((id) => dexProperties(id)?.isTransparent === true);
    registerSpellRecordsAsset(DEX_VENDOR, JSON.parse(DEX_TABLE_TEXT['SpellRecords.json']));
    registerEnemySpellbook(createDexSpellbooks(read.spellbooks, dexProperties, { ids: [...read.enemies.keys(), ...read.classic.keys()], log }).spellbook);
    const combat = createDexCombatDoors(read.enemies, dexProperties);
    registerFormulaOverride('onMonsterHit', combat.monsterHit);
    registerSkeletalTarget(combat.skeletal);
    registerEnemyGroup(combat.group);
    registerEnemyLanguage(combat.language);
    registerForcedGender(combat.gender);
    // Start runs after RRI's Awake wrote its own assigner, so this one is the one that applies.
    _replacedAssigner = enemyEquipmentAssigner();
    setEnemyEquipmentAssigner(createDexEquipmentAssigner(dexProperties));
    installDexTroll(DEX_VENDOR);
    const encounters = createDexEncounterSelector(read.encounters);
    registerEncounterTableSelector(encounters);
    onPlayerGpsEvents(encounters.gps);
    addIntoQuestTables({ foes: read.questFoes.map(([id, name]) => ({ line: `${id}, ${name}`, unlessKey: name })) });
  }
  return { loaded, mudex, enemies: read.enemies.size };
}

export function _resetEnemyExpansion() {
  for (const [id, saved] of _classicOriginals) {
    const target = ENEMY_BASICS[id];
    for (const k of Object.keys(target)) delete target[k];
    Object.assign(target, saved);
  }
  _classicOriginals.clear();
  if (_replacedAssigner !== undefined) setEnemyEquipmentAssigner(_replacedAssigner);
  _replacedAssigner = undefined;
  for (const id of _read ? _read.enemies.keys() : []) delete ENEMY_BASICS[String(id)];
  _careers.clear();
  _dropNameText?.();
  _dropNameText = null;
  _read = null;
  _reads.clear();
  latchModLoaded(MUDEX_VENDOR, false);
  _installed = false;
}
