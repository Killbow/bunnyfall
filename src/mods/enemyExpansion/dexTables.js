// The Daggerfall Enemy Expansion tables read as BestiaryMod.Start reads them, line for line,
// with the CSV helpers in dexCsv.js.

import { readCsvTable, splitCsvLine, parseArrayArg, parseFloatArrayArg, parseBool, parseCsInt, csvLines, splitCsvHeader } from './dexCsv.js';
import { MOBILE_TYPES } from '../../characters/mobileTypes.js';
import { WEAPON_MATERIALS } from '../../characters/weapons.js';
import { MOBILE_TEAMS } from '../../characters/enemyTargets.js';
import { MOBILE_BEHAVIOUR } from '../../characters/enemyBasics.js';
import { ENEMY_GROUPS, GROUP_BITS } from '../../combat/formulas.js';
import { EFFECT_FLAGS } from '../../magic/spellcast.js';
import { SKILLS } from '../../characters/skills.js';
import { DUNGEON_TYPES } from '../../formats/mapsFile.js';


export const MOBILE_AFFINITY = Object.freeze(['None', 'Daylight', 'Darkness', 'Undead', 'Animal', 'Daedra', 'Golem', 'Water', 'Human']);
export { MOBILE_TEAMS, ENEMY_GROUPS };
export const CAREER_SKILLS = Object.freeze({ None: -1, ...SKILLS, Count: 35 });
export const ENEMY_GENDERS = Object.freeze({ Unspecified: 0, Female: 1, Male: 2 });
export const TOLERANCE = Object.freeze(['Normal', 'Immune', 'Resistant', 'LowTolerance', 'CriticalWeakness']);
export const ATTACK_MODIFIER = Object.freeze(['Normal', 'Bonus', 'Phobia']);

export function parseEnum(names, token, { ignoreCase = false, what = 'enum' } = {}) {
  const v = String(token).trim();
  const entries = Array.isArray(names) ? names.map((n, i) => [n, i]) : Object.entries(names);
  if (/^[+-]?\d+$/.test(v)) {
    const n = Number.parseInt(v, 10);
    const hit = entries.find(([, value]) => value === n);
    return hit ? hit[0] : n;
  }
  const hit = entries.find(([name]) => (ignoreCase ? name.toLowerCase() === v.toLowerCase() : name === v));
  if (!hit) throw new Error(`Requested value '${token}' was not found in ${what}.`);
  return hit[0];
}


const TOLERANCE_BYTE = Object.freeze({ Resistant: 'resistanceFlags', Immune: 'immunityFlags', LowTolerance: 'lowToleranceFlags', CriticalWeakness: 'criticalWeaknessFlags' });

export function newCareer(name) {
  return {
    name, resistanceFlags: 0, immunityFlags: 0, lowToleranceFlags: 0, criticalWeaknessFlags: 0, abilityFlagsAndSpellPointsBitfield: 0,
    rapidHealing: 0, regeneration: 0, unknown1: 0, spellAbsorptionFlags: 0, attackModifierFlags: 0, forbiddenMaterialsFlags: 0,
    weaponArmorShieldsBitfield: 0, primarySkills: [0, 0, 0], majorSkills: [0, 0, 0], minorSkills: [0, 0, 0, 0, 0, 0],
    hitPointsPerLevel: 0, advancementMultiplierRaw: 0, advancementMultiplier: 0,
    strength: 0, intelligence: 0, willpower: 0, agility: 0, endurance: 0, personality: 0, speed: 0, luck: 0,
  };
}

export function setTolerance(career, effect, tolerance) {
  const bit = EFFECT_FLAGS[effect];
  for (const b of Object.values(TOLERANCE_BYTE)) career[b] = (career[b] ?? 0) & ~bit;
  if (TOLERANCE_BYTE[tolerance]) career[TOLERANCE_BYTE[tolerance]] |= bit;
}

export function setAttackModifier(career, group, modifier) {
  const [bonus, phobia] = GROUP_BITS[ENEMY_GROUPS[group]];
  career.attackModifierFlags = (career.attackModifierFlags ?? 0) & ~(bonus | phobia);
  if (modifier === 'Bonus') career.attackModifierFlags |= bonus;
  else if (modifier === 'Phobia') career.attackModifierFlags |= phobia;
}

export function classicCareers() {
  const out = new Map();
  for (const [name, id] of Object.entries(MOBILE_TYPES)) {
    if (id >= 0 && id <= 42) out.set(name, { name, base: { kind: 'monster', index: id }, edits: [] });
    else if (id >= 128 && id <= 145) out.set(name, { name, base: { kind: 'class', index: id - 128 }, edits: [] });
  }
  out.set('Guard', { name: 'Guard', base: { kind: 'class', index: 18 }, edits: [] });
  return out;
}

export function careerFromSpec(spec, baseCareer = null) {
  const c = spec.base ? structuredClone(baseCareer ?? newCareer(spec.name)) : newCareer(spec.name);
  for (const edit of spec.edits) edit(c);
  return c;
}

const STAT_COLUMNS = Object.freeze([['HitPointsPerLevel', 'hitPointsPerLevel'], ['Strength', 'strength'], ['Intelligence', 'intelligence'],
  ['Willpower', 'willpower'], ['Agility', 'agility'], ['Endurance', 'endurance'], ['Endurance', 'endurance'], ['Personality', 'personality'],
  ['Speed', 'speed'], ['Luck', 'luck']]);
const STAT_MISSING = Object.freeze({ HitPointsPerLevel: 'HitPointsPerLevel', Strength: 'Strength', Intelligence: 'Intelligence', Willpower: 'Willpower',
  Agility: 'Agility', Endurance: 'Strength', Personality: 'Personality', Speed: 'Speed', Luck: 'Luck' });

export function readCareerTable(text, careers, assetName, log = () => {}) {
  const lines = csvLines(text);
  const fields = splitCsvHeader(lines[0] ?? '');
  const lower = fields.map((f) => f.toLowerCase());
  const idx = (name) => { const i = lower.indexOf(name.toLowerCase()); return i === -1 ? null : i; };
  const nameIndex = idx('Name');
  if (nameIndex == null) { log('error', `[DEX] Career DB file '${assetName}': could not find field 'Name' in header`); return; }
  const cols = Object.fromEntries(['HitPointsPerLevel', 'Strength', 'Intelligence', 'Willpower', 'Agility', 'Endurance', 'Personality', 'Speed', 'Luck',
    'Magic', 'Fire', 'Frost', 'Shock', 'Poison', 'Paralysis', 'UndeadAttackModifier', 'DaedraAttackModifier', 'HumanoidAttackModifier', 'AnimalsAttackModifier'].map((n) => [n, idx(n)]));
  for (let i = 1; i < lines.length; i++) {
    const lineNumber = i + 1;
    try {
      const tokens = splitCsvLine(lines[i]);
      const cell = (c) => { if (c >= tokens.length) throw new RangeError('Index was outside the bounds of the array.'); return tokens[c]; };
      const careerName = cell(nameIndex);
      const existing = careers.get(careerName) ?? [...careers.values()].find((c) => c.name.toLowerCase() === String(careerName).toLowerCase());
      const replacement = !!existing;
      const spec = existing ?? { name: careerName, base: null, edits: [] };
      let dropped = false;
      for (const [col, key] of STAT_COLUMNS) {
        const c = cols[col];
        if (c != null && cell(c)) { const v = parseCsInt(cell(c), `line=${lineNumber}`); spec.edits.push((career) => { career[key] = v; }); }
        else if (!replacement) { log('error', `[DEX] Career '${careerName}' did not have ${STAT_MISSING[col]} specified`); dropped = true; break; }
      }
      if (dropped) continue;
      for (const effect of ['Magic', 'Fire', 'Frost', 'Shock', 'Poison', 'Paralysis']) {
        const c = cols[effect];
        if (c != null && cell(c)) { const t = parseEnum(TOLERANCE, cell(c), { what: 'Tolerance' }); spec.edits.push((career) => setTolerance(career, effect, t)); }
      }
      for (const group of ['Undead', 'Daedra', 'Humanoid', 'Animals']) {
        const c = cols[`${group}AttackModifier`];
        if (c != null && cell(c)) { const m = parseEnum(ATTACK_MODIFIER, cell(c), { what: 'AttackModifier' }); spec.edits.push((career) => setAttackModifier(career, group, m)); }
      }
      if (!replacement) careers.set(careerName, spec);
    } catch (ex) {
      log('error', `[DEX] Error while parsing ${assetName}:${lineNumber}: ${ex?.message ?? ex}`);
    }
  }
}


export const isMonsterId = (enemyId) => Math.trunc(enemyId / 128) % 2 === 0;

const CLASSIC_RANGED = new Set(['Battlemage', 'Nightblade', 'Bard', 'Burglar', 'Rogue', 'Acrobat', 'Thief', 'Assassin', 'Monk', 'Archer', 'Ranger',
  'Barbarian', 'Warrior', 'Knight'].map((n) => MOBILE_TYPES[n]));

export function classicCareerName(mobileID) {
  const nameOf = (id) => Object.keys(MOBILE_TYPES).find((k) => MOBILE_TYPES[k] === id);
  if (mobileID < 128) return nameOf(mobileID);
  if (mobileID === MOBILE_TYPES.Knight_CityWatch) return 'Guard';
  if (mobileID < 256) return nameOf(mobileID);
  throw new Error(`Mobile '${mobileID}' has unknown career`);
}

export const newCustomProperties = () => ({
  name: null, career: null, group: 'None', language: 'None', spellbookTable: null, onHitEffect: 0, forcedGender: 'Unspecified',
  isTransparent: false, isSkeletal: false, hasRangedAttack: false, hasNoSpellAnimations: false, equipmentTable: null,
});

const ENEMY_COLUMNS = Object.freeze(['ID', 'Name', 'Career', 'MaleTexture', 'FemaleTexture', 'CorpseTextureArchive', 'CorpseTextureRecord',
  'FemaleCorpseTextureArchive', 'FemaleCorpseTextureRecord', 'HasIdle', 'CastsMagic', 'NoSpellAnims', 'HasRangedAttack', 'PrimaryAttackAnimFrames',
  'Team', 'Level', 'Behaviour', 'Affinity', 'Group', 'Language', 'MinDamage', 'MaxDamage', 'MinDamage2', 'MaxDamage2', 'MinDamage3', 'MaxDamage3',
  'MinHealth', 'MaxHealth', 'ArmorValue', 'MinMetalToHit', 'Weight', 'SeesThroughInvisibility', 'MoveSound', 'BarkSound', 'AttackSound',
  'ParrySounds', 'CanOpenDoors', 'LootTableKey', 'MapChance', 'Spellbook', 'OnHit', 'NoBlood', 'PrimaryAttackAnimFrames2', 'ChanceForAttack2',
  'PrimaryAttackAnimFrames3', 'ChanceForAttack3', 'PrimaryAttackAnimFrames4', 'ChanceForAttack4', 'PrimaryAttackAnimFrames5', 'ChanceForAttack5',
  'NoShadow', 'ForcedGender', 'GlowColor', 'Transparent', 'EquipmentTable']);

export function newMobileEnemy(id) {
  return { id, behaviour: 'General', affinity: 'None', team: 'PlayerEnemy', maleTexture: 0, femaleTexture: 0, corpseTexture: { archive: 0, record: 0 },
    minMetalToHit: WEAPON_MATERIALS.Iron, minDamage: 0, maxDamage: 0, minDamage2: 0, maxDamage2: 0, minDamage3: 0, maxDamage3: 0, minHealth: 0, maxHealth: 0,
    level: 0, armorValue: 0, weight: 0, mapChance: 0, soulPts: 0, bloodIndex: 0, moveSound: 0, barkSound: 0, attackSound: 0 };
}

export function writeEnemyLine(mobile, props, tokens, col, { mobileID, enemyReplacement, classicReplacement, careers, lineNumber, log = () => {}, classicName = () => null }) {
  const cell = (name) => { const i = col[name]; if (i >= tokens.length) throw new RangeError('Index was outside the bounds of the array.'); return tokens[i]; };
  const has = (name) => col[name] != null && cell(name) !== '';
  const at = (name) => `line=${lineNumber}, column=${col[name] + 1}`;
  const int = (name) => parseCsInt(cell(name), at(name));
  const bool = (name) => parseBool(cell(name), at(name));
  if (has('Name')) props.name = cell('Name');
  else if (!enemyReplacement) { log('error', `[DEX] Enemy '${mobile.id}' did not have a Name specified.`); return { ok: false }; }
  const enemyName = props.name || classicName(mobileID);
  if (has('Career')) props.career = cell('Career');
  else if (!enemyReplacement) { log('error', `[DEX] Enemy '${enemyName}' did not have a Career specified.`); return { ok: false }; }
  let careerName;
  if (props.career) careerName = props.career;
  else if (classicReplacement) careerName = classicCareerName(mobileID);
  else { log('error', `[DEX] Enemy '${enemyName}' has no defined career`); return { ok: false }; }
  const known = careers.has(careerName) || [...careers.keys()].some((k) => k.toLowerCase() === String(careerName).toLowerCase());
  if (!known) { log('error', `[DEX] Enemy '${enemyName}' has unknown career '${careerName}'`); return { ok: false }; }
  if (has('Behaviour')) mobile.behaviour = parseEnum(MOBILE_BEHAVIOUR, cell('Behaviour'), { ignoreCase: true, what: 'MobileBehaviour' });
  let isSkeletal = false;
  if (has('Affinity')) {
    if (cell('Affinity').toLowerCase() === 'skeletal') { isSkeletal = true; mobile.affinity = 'Undead'; }
    else mobile.affinity = parseEnum(MOBILE_AFFINITY, cell('Affinity'), { ignoreCase: true, what: 'MobileAffinity' });
  }
  if (has('Team')) mobile.team = parseEnum(MOBILE_TEAMS, cell('Team'), { ignoreCase: true, what: 'MobileTeams' });
  else if (!enemyReplacement) { log('error', `[DEX] Enemy '${enemyName}' did not have a Team specified.`); return { ok: false }; }
  if (has('MaleTexture')) mobile.maleTexture = int('MaleTexture');
  else if (!enemyReplacement) { log('error', `[DEX] Enemy '${enemyName}' did not have a MaleTexture specified.`); return { ok: false }; }
  if (has('FemaleTexture')) mobile.femaleTexture = int('FemaleTexture');
  else if (!enemyReplacement) { log('error', `[DEX] Enemy '${enemyName}' did not have a FemaleTexture specified.`); return { ok: false }; }
  if (has('CorpseTextureArchive') && has('CorpseTextureRecord')) mobile.corpseTexture = { archive: int('CorpseTextureArchive'), record: int('CorpseTextureRecord') };
  else if (!enemyReplacement) { log('error', `[DEX] Enemy '${enemyName}' did not have a CorpseTextureArchive or CorpseTextureRecord specified.`); return { ok: false }; }
  if (has('FemaleCorpseTextureArchive') && has('FemaleCorpseTextureRecord')) mobile.femaleCorpseTexture = { archive: int('FemaleCorpseTextureArchive'), record: int('FemaleCorpseTextureRecord') };
  if (has('HasIdle')) mobile.hasIdle = bool('HasIdle');
  if (has('CastsMagic')) mobile.castsMagic = bool('CastsMagic');
  if (has('NoSpellAnims')) props.hasNoSpellAnimations = bool('NoSpellAnims');
  if (has('HasRangedAttack')) props.hasRangedAttack = bool('HasRangedAttack');
  if (props.hasRangedAttack && mobile.rangedAttackAnimFrames == null) mobile.rangedAttackAnimFrames = [3, 2, 0, 0, 0, -1, 1, 1, 2, 3];
  if (mobile.castsMagic) {
    if (props.hasRangedAttack) { mobile.hasRangedAttack1 = true; mobile.hasRangedAttack2 = true; }
    else { mobile.hasRangedAttack1 = true; mobile.hasRangedAttack2 = false; }
    if (!props.hasNoSpellAnimations) mobile.hasSpellAnimation = true;
    if (mobile.spellAnimFrames == null) mobile.spellAnimFrames = [0, 1, 2, 3, 3];
  } else {
    mobile.hasRangedAttack1 = props.hasRangedAttack;
    mobile.hasRangedAttack2 = false;
  }
  if (has('PrimaryAttackAnimFrames')) mobile.primaryAttackAnimFrames = parseArrayArg(cell('PrimaryAttackAnimFrames'), at('PrimaryAttackAnimFrames'));
  for (const [n, chance] of [[2, 50], [3, 25], [4, 12], [5, 6]]) {
    if (has(`PrimaryAttackAnimFrames${n}`)) {
      mobile[`primaryAttackAnimFrames${n}`] = parseArrayArg(cell(`PrimaryAttackAnimFrames${n}`), at(`PrimaryAttackAnimFrames${n}`));
      mobile[`chanceForAttack${n}`] = has(`ChanceForAttack${n}`) ? parseCsInt(cell(`ChanceForAttack${n}`)) : chance;
    }
  }
  const monster = !enemyReplacement && isMonsterId(mobile.id);
  if (has('Level')) mobile.level = parseCsInt(cell('Level'));
  else if (monster) { log('warn', `[DEX] Monster '${enemyName}' did not have a level specified. Defaulting to 1`); mobile.level = 1; }
  if (has('MinDamage')) mobile.minDamage = parseCsInt(cell('MinDamage'));
  else if (monster) { log('warn', `[DEX] Monster '${enemyName}' did not have a min damage specified. Defaulting to 1`); mobile.minDamage = 1; }
  if (has('MaxDamage')) mobile.maxDamage = parseCsInt(cell('MaxDamage'));
  else if (monster) { log('warn', `[DEX] Monster '${enemyName}' did not have a max damage specified. Defaulting to ${mobile.minDamage + 1}`); mobile.maxDamage = mobile.minDamage + 1; }
  for (const k of ['MinDamage2', 'MaxDamage2', 'MinDamage3', 'MaxDamage3']) if (has(k)) mobile[k[0].toLowerCase() + k.slice(1)] = parseCsInt(cell(k));
  if (has('MinHealth')) mobile.minHealth = parseCsInt(cell('MinHealth'));
  else if (monster) { log('warn', `[DEX] Monster '${enemyName}' did not have a min health specified. Defaulting to 1`); mobile.minHealth = 1; }
  if (has('MaxHealth')) mobile.maxHealth = parseCsInt(cell('MaxHealth'));
  else if (monster) { log('warn', `[DEX] Monster '${enemyName}' did not have a max health specified. Defaulting to ${mobile.minHealth + 1}`); mobile.maxHealth = mobile.minHealth + 1; }
  if (has('ArmorValue')) mobile.armorValue = parseCsInt(cell('ArmorValue'));
  else if (monster) { log('warn', `[DEX] Monster '${enemyName}' did not have an armor value specified. Defaulting to 0`); mobile.armorValue = 0; }
  if (has('MinMetalToHit')) { const m = parseEnum(WEAPON_MATERIALS, cell('MinMetalToHit'), { ignoreCase: true, what: 'WeaponMaterialTypes' }); mobile.minMetalToHit = typeof m === 'number' ? m : WEAPON_MATERIALS[m]; }
  if (has('Weight')) mobile.weight = parseCsInt(cell('Weight'));
  else if (monster) { log('warn', `[DEX] Monster '${enemyName}' did not have a weight specified. Defaulting to 100`); mobile.weight = 100; }
  if (has('SeesThroughInvisibility')) mobile.seesThroughInvisibility = bool('SeesThroughInvisibility');
  if (has('MoveSound')) mobile.moveSound = parseCsInt(cell('MoveSound'));
  else if (!enemyReplacement) {
    if (isMonsterId(mobile.id)) { log('warn', `[DEX] Monster '${enemyName}' does not have a defined MoveSound. This can cause issues.`); mobile.moveSound = -1; }
    else mobile.moveSound = 243;
  }
  if (has('BarkSound')) mobile.barkSound = parseCsInt(cell('BarkSound'));
  else if (!enemyReplacement) {
    if (isMonsterId(mobile.id)) { log('warn', `[DEX] Monster '${enemyName}' does not have a defined BarkSound. This can cause issues.`); mobile.barkSound = -1; }
    else mobile.barkSound = 244;
  }
  if (has('AttackSound')) mobile.attackSound = parseCsInt(cell('AttackSound'));
  else if (!enemyReplacement) {
    if (isMonsterId(mobile.id)) { log('warn', `[DEX] Monster '${enemyName}' does not have a defined AttackSound. This can cause issues.`); mobile.barkSound = -1; }
    else mobile.barkSound = 245;
  }
  if (has('ParrySounds')) mobile.parrySounds = bool('ParrySounds');
  if (has('CanOpenDoors')) mobile.canOpenDoors = bool('CanOpenDoors');
  if (has('LootTableKey')) mobile.lootTableKey = cell('LootTableKey');
  if (has('MapChance')) mobile.mapChance = parseCsInt(cell('MapChance'));
  if (has('NoBlood')) mobile.bloodIndex = bool('NoBlood') ? 2 : 0;
  if (has('NoShadow')) mobile.noShadow = bool('NoShadow');
  if (has('GlowColor')) {
    const c = parseFloatArrayArg(cell('GlowColor'), `line=${lineNumber},column=${col.GlowColor}`).map((v) => Math.fround(v));
    if (c.length < 3) log('error', `[DEX] Enemy '${enemyName}' had invalid glow color '${cell('GlowColor')}'`);
    else mobile.glowColor = { r: c[0], g: c[1], b: c[2], a: c.length >= 4 ? c[3] : 1 };
  }
  props.isSkeletal = isSkeletal;
  if (has('Group')) props.group = parseEnum(ENEMY_GROUPS, cell('Group'), { what: 'EnemyGroups' });
  if (has('Language')) props.language = parseEnum(CAREER_SKILLS, cell('Language'), { what: 'Skills' });
  let spellbook = null;
  if (has('Spellbook')) {
    const token = cell('Spellbook');
    if (/^\d/.test(token) || token[0] === '[' || token[0] === '{') {
      spellbook = { name: String(mobileID), spellIds: parseArrayArg(token, at('Spellbook')) };
      props.spellbookTable = String(mobileID);
    } else props.spellbookTable = token;
  }
  if (has('OnHit')) props.onHitEffect = parseCsInt(cell('OnHit'));
  if (has('ForcedGender')) props.forcedGender = parseEnum(ENEMY_GENDERS, cell('ForcedGender'), { what: 'EnemyGenders' });
  if (has('Transparent')) props.isTransparent = bool('Transparent');
  if (has('EquipmentTable')) props.equipmentTable = cell('EquipmentTable');
  return { ok: true, careerName, spellbook };
}

export function readEnemyTables(files, careers, { liveRow, isClassic, hasFoe = () => false, classicName = () => null, log = () => {} }) {
  const enemies = new Map(), classic = new Map(), spellbooks = new Map(), questFoes = [];
  for (const [assetName, text] of files) {
    const table = readCsvTable(text);
    if (!table.fields.length || (table.fields.length === 1 && table.fields[0] === '')) continue;
    const col = Object.fromEntries(ENEMY_COLUMNS.map((n) => [n, table.column(n)]));
    if (col.ID == null) { log('error', `[DEX] Monster DB file '${assetName}': could not find field 'ID' in header`); continue; }
    for (const { lineNumber, tokens } of table.rows) {
      try {
        const mobileID = parseCsInt(tokens[col.ID]);
        const classicReplacement = isClassic(mobileID);
        const enemyReplacement = classicReplacement || enemies.has(mobileID);
        const mobile = enemyReplacement ? { ...structuredClone(enemies.get(mobileID)?.row ?? classic.get(mobileID)?.row ?? liveRow(mobileID)), id: mobileID } : newMobileEnemy(mobileID);
        let props;
        if (classicReplacement) {
          props = classic.get(mobileID)?.props;
          if (!props) { props = newCustomProperties(); props.hasRangedAttack = CLASSIC_RANGED.has(mobileID); classic.set(mobileID, { row: null, props, lines: [] }); }
        } else props = enemies.get(mobileID)?.props ?? newCustomProperties();
        const r = writeEnemyLine(mobile, props, tokens, col, { mobileID, enemyReplacement, classicReplacement, careers, lineNumber, log, classicName });
        if (!r.ok) continue;
        if (r.spellbook) spellbooks.set(r.spellbook.name, r.spellbook.spellIds);
        if (!enemyReplacement) {
          enemies.set(mobileID, { row: mobile, props, careerName: r.careerName });
          const questName = props.name.replaceAll(' ', '_');
          if (!hasFoe(questName)) questFoes.push([mobileID, questName]);
        } else if (classicReplacement) {
          const c = classic.get(mobileID);
          c.row = mobile;
          c.lines.push({ tokens, col, lineNumber });
        }
        else enemies.set(mobileID, { ...enemies.get(mobileID), row: mobile, props });
      } catch (ex) {
        log('error', `[DEX] Error while parsing ${assetName}:${lineNumber}: ${ex?.message ?? ex}`);
      }
    }
  }
  return { enemies, classic, spellbooks, questFoes };
}


export const DEX_DEFAULT_TABLES = Object.freeze([
  ...Object.entries(DUNGEON_TYPES).filter(([n]) => n !== 'NoDungeon').sort(([, a], [, b]) => a - b).map(([n]) => n),
  'Underwater',
  ...['Desert', 'Mountain', 'Rainforest', 'Subtropical', 'Woodlands', 'Haunted'].flatMap((c) => [`${c}CityNight`, `${c}Day`, `${c}Night`]),
].map((n) => `Default${n}`));

class IgnoreCaseMap extends Map {
  get(k) { return super.get(String(k).toUpperCase()); }
  has(k) { return super.has(String(k).toUpperCase()); }
  set(k, v) { return super.set(String(k).toUpperCase(), v); }
  delete(k) { return super.delete(String(k).toUpperCase()); }
}

export function readEncounterTables(files, log = () => {}) {
  const tables = new IgnoreCaseMap(), byIndex = new Map();
  const at = (i) => byIndex.get(i) ?? byIndex.set(i, []).get(i);
  for (const [assetName, text] of files) {
    const [header = '', ...lines] = csvLines(text);
    const fields = splitCsvHeader(header);
    if (fields.length < 21) {
      log('error', `[DEX] Error while parsing ${assetName}: table database has invalid format (expected at least 21 columns)`);
      continue;
    }
    const hasTableIndices = fields[1].toLowerCase() === 'table indices';
    let lineNumber = 1;
    for (const line of lines) {
      ++lineNumber;
      try {
        const tokens = splitCsvLine(line);
        if (tokens.length < 21) {
          log('error', `[DEX] Error while parsing ${assetName}:${lineNumber}: table database line has invalid format (expected at least 21 columns)`);
          continue;
        }
        const name = tokens[0];
        let table = tables.get(name);
        if (table) {
          if (hasTableIndices) {
            const tableIndices = parseArrayArg(tokens[1], `line=${lineNumber}, column=2`);
            const same = tableIndices.length === table.tableIndices?.length && tableIndices.every((v, k) => v === table.tableIndices[k]);
            if (tableIndices.length !== 0 && !same) {
              for (const i of table.tableIndices ?? []) byIndex.set(i, at(i).filter((t) => t.name !== name));
              table.tableIndices = tableIndices;
              for (const i of tableIndices) at(i).push(table);
            }
          }
          table.enemyIds = tokens.slice(hasTableIndices ? 2 : 1).map((id) => parseCsInt(id, `line=${lineNumber}`));
        } else {
          if (!hasTableIndices) {
            log('error', '[DEX] Error while parsing new encounter tables: table indices not specified');
            continue;
          }
          table = { name, tableIndices: parseArrayArg(tokens[1], `line=${lineNumber}, column=2`), enemyIds: null };
          for (const i of table.tableIndices) at(i).push(table);
          table.enemyIds = tokens.slice(2).map((id) => parseCsInt(id, `line=${lineNumber}`));
          tables.set(name, table);
        }
      } catch (ex) {
        log('error', `[DEX] Error while parsing ${assetName}:${lineNumber}: ${ex?.message ?? ex}`);
      }
    }
  }
  return { tables, byIndex };
}

export function addDefaultEncounterTables(read, vanilla, log = () => {}) {
  DEX_DEFAULT_TABLES.forEach((name, index) => {
    if (read.tables.has(name)) {
      if (!(read.byIndex.get(index)?.length)) log('error', `[DEX] Encounter index '${name}' has no tables`);
      return;
    }
    const table = { name, tableIndices: null, enemyIds: [...vanilla(index)] };
    (read.byIndex.get(index) ?? read.byIndex.set(index, []).get(index)).push(table);
    read.tables.set(name, table);
  });
  return read;
}
