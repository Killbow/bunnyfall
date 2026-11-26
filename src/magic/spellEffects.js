// The Spell Maker effect catalog: each DFU effect with group, subgroup, and support flags, keyed `type,subType`.
// Support flags decide what the player may set; EFFECT_COST_TABLE in spellcost.js decides what is charged.
// Charm supports chance only, as in DFU's CharmEffect.

import { localizedStrings, localizedTable } from '../ui/textManager.js';

// DFCareer.Stats order, which puts Personality ahead of Speed as the classic subType does.
export const STAT_SUBGROUPS = Object.freeze(
  ['Strength', 'Intelligence', 'Willpower', 'Agility', 'Endurance', 'Personality', 'Speed', 'Luck']);

const D = 'duration', C = 'chance', M = 'magnitude';
const ROWS = [
  [0, 255, 'Paralyze', '', [D, C]],
  [1, 0, 'Continuous Damage', 'Health', [D, M]],
  [1, 1, 'Continuous Damage', 'Fatigue', [D, M]],
  [1, 2, 'Continuous Damage', 'Spell Points', [D, M]],
  [2, 255, 'Create Item', '', [D]],
  [3, 0, 'Cure', 'Disease', [C]],
  [3, 1, 'Cure', 'Poison', [C]],
  [3, 2, 'Cure', 'Paralyzation', [C]],
  [4, 0, 'Damage', 'Health', [M]],
  [4, 1, 'Damage', 'Fatigue', [M]],
  [4, 2, 'Damage', 'Spell Points', [M]],
  [5, 255, 'Disintegrate', '', [C]],
  [6, 0, 'Dispel', 'Magic', [C]],
  [6, 1, 'Dispel', 'Undead', [C]],
  [6, 2, 'Dispel', 'Daedra', [C]],
  [8, 0, 'Elemental Resistance', 'Fire', [D, C]],
  [8, 1, 'Elemental Resistance', 'Frost', [D, C]],
  [8, 2, 'Elemental Resistance', 'Poison', [D, C]],
  [8, 3, 'Elemental Resistance', 'Shock', [D, C]],
  [8, 4, 'Elemental Resistance', 'Magicka', [D, C]],
  [12, 255, 'Soul Trap', '', [D, C]],
  [13, 0, 'Invisibility', 'Normal', [D]],
  [13, 1, 'Invisibility', 'True', [D]],
  [14, 255, 'Levitate', '', [D]],
  [15, 255, 'Light', '', [D]],
  [16, 255, 'Lock', '', [C]],
  [17, 255, 'Open', '', [C]],
  [18, 255, 'Regenerate', '', [D, M]],
  [19, 255, 'Silence', '', [D, C]],
  [20, 255, 'Spell Absorption', '', [D, C]],
  [21, 255, 'Spell Reflection', '', [D, C]],
  [22, 255, 'Spell Resistance', '', [D, C]],
  [23, 0, 'Chameleon', 'Normal', [D]],
  [23, 1, 'Chameleon', 'True', [D]],
  [24, 0, 'Shadow', 'Normal', [D]],
  [24, 1, 'Shadow', 'True', [D]],
  [25, 255, 'Slowfall', '', [D]],
  [26, 255, 'Free Action', '', [D]],
  [27, 255, 'Jumping', '', [D]],
  [28, 255, 'Climbing', '', [D]],
  // Morph Self is in the registry so the spellbook can name it; `false` keeps it out of the maker's pickers,
  // since DFU allows it at no crafting station.
  [29, 255, 'Morph Self', '', [], false],
  // Resurrect is sold ready-made online, so it is not craftable.
  [45, 255, 'Resurrect', '', [], false],
  [46, 255, 'Shared Cartography', '', [D]],
  [47, 255, 'Meteor', '', []],
  [48, 255, 'Slow', '', [D]],
  [49, 255, 'Clairvoyance', '', [D]],
  [50, 255, 'Rescue', '', []],
  [51, 255, 'Featherweight', '', [D]],
  [52, 255, 'Wall of Earth', '', [D]],
  [53, 255, 'Decoy', '', [D]],
  [54, 255, 'Gravity Well', '', [D]],
  [55, 255, 'Recall Minions', '', [C]],
  [56, 255, 'Summon Skeleton', '', [C, M]],
  [57, 255, 'Summon Zombie', '', [C, M]],
  [58, 255, 'Summon Ghost', '', [C, M]],
  [59, 255, 'Summon Mummy', '', [C, M]],
  [60, 255, 'Summon Vampire', '', [C, M]],
  [61, 255, 'Summon Lich', '', [C, M]],
  [62, 255, 'Summon Ancient Vampire', '', [C, M]],
  [63, 255, 'Summon Ancient Lich', '', [C, M]],
  [30, 255, 'Water Breathing', '', [D]],
  [31, 255, 'Water Walking', '', [D]],
  [33, 0, 'Pacify', 'Animal', [C]],
  [33, 1, 'Pacify', 'Undead', [C]],
  [33, 2, 'Pacify', 'Humanoid', [C]],
  [33, 3, 'Pacify', 'Daedra', [C]],
  [34, 255, 'Charm', '', [C]],
  [35, 255, 'Shield', '', [D, M]],
  [39, 0, 'Detect', 'Magic', [D]],
  [39, 1, 'Detect', 'Enemy', [D]],
  [39, 2, 'Detect', 'Treasure', [D]],
  [40, 255, 'Identify', '', [C]],
  [43, 255, 'Teleport', '', []],
  [44, 255, 'Comprehend Languages', '', [D, C]],
];
const FAMILIES = [
  [7, 'Drain', STAT_SUBGROUPS, [M]],
  [9, 'Fortify Attribute', STAT_SUBGROUPS, [D, M]],
  [10, 'Heal', [...STAT_SUBGROUPS, 'Health', 'Fatigue'], [M]],
  [11, 'Transfer', [...STAT_SUBGROUPS, 'Health', 'Fatigue'], [M]],
];

// Rows keep English names because the catalog matches on them and dfuEffectKeyOf derives DFU keys from them;
// these tables localize only what is shown.
const GROUP_NAMES = localizedTable({
  Paralyze: ['paralyze', 'Paralyze'], 'Continuous Damage': ['continuousDamage', 'Continuous Damage'],
  'Create Item': ['createItem', 'Create Item'], Cure: ['cure', 'Cure'], Damage: ['damage', 'Damage'],
  Disintegrate: ['disintegrate', 'Disintegrate'], Dispel: ['dispel', 'Dispel'], Drain: ['drain', 'Drain'],
  'Elemental Resistance': ['elementalResistance', 'Elemental Resistance'],
  'Fortify Attribute': ['fortifyAttribute', 'Fortify Attribute'], Heal: ['heal', 'Heal'], Transfer: ['transfer', 'Transfer'],
  'Soul Trap': ['soulTrap', 'Soul Trap'], Invisibility: ['invisibility', 'Invisibility'], Levitate: ['levitate', 'Levitate'],
  Light: ['light', 'Light'], Lock: ['lock', 'Lock'], Open: ['open', 'Open'], Regenerate: ['regenerate', 'Regenerate'],
  Silence: ['silence', 'Silence'], 'Spell Absorption': ['spellAbsorption', 'Spell Absorption'],
  'Spell Reflection': ['spellReflection', 'Spell Reflection'], 'Spell Resistance': ['spellResistance', 'Spell Resistance'],
  Chameleon: ['chameleon', 'Chameleon'], Shadow: ['shadow', 'Shadow'], Slowfall: ['slowfall', 'Slowfall'],
  'Free Action': ['freeAction', 'Free Action'], Jumping: ['jumping', 'Jumping'], Climbing: ['climbing', 'Climbing'],
  'Morph Self': ['morphSelf', 'Morph Self'], 'Water Breathing': ['waterBreathing', 'Water Breathing'],
  'Water Walking': ['waterWalking', 'Water Walking'], Pacify: ['pacify', 'Pacify'], Charm: ['charm', 'Charm'],
  Shield: ['shield', 'Shield'], Detect: ['detect', 'Detect'], Identify: ['identify', 'Identify'],
  Teleport: ['teleport', 'Teleport'], 'Comprehend Languages': ['comprehendLanguages', 'Comprehend Languages'],
});
const SUBGROUP_NAMES = localizedTable({
  Health: ['health', 'Health'], Fatigue: ['fatigue', 'Fatigue'], 'Spell Points': ['spellPoints', 'Spell Points'],
  Disease: ['disease', 'Disease'], Poison: ['poison', 'Poison'], Paralyzation: ['paralyzation', 'Paralyzation'],
  Magic: ['magic', 'Magic'], Undead: ['undead', 'Undead'], Daedra: ['daedra', 'Daedra'], Enemy: ['enemy', 'Enemy'],
  Treasure: ['treasure', 'Treasure'], Normal: ['normal', 'Normal'],
  Strength: ['strength', 'Strength'], Intelligence: ['intelligence', 'Intelligence'], Willpower: ['willpower', 'Willpower'],
  Agility: ['agility', 'Agility'], Endurance: ['endurance', 'Endurance'], Personality: ['personality', 'Personality'],
  Speed: ['speed', 'Speed'], Luck: ['luck', 'Luck'],
});
const VARIANT_SUBGROUP_NAMES = localizedStrings({
  Fire: 'Fire', Frost: 'Frost', Poison: 'Poison', Shock: 'Shock', Magicka: 'Magicka',
  Animal: 'Animal', Undead: 'Undead', Humanoid: 'Humanoid', Daedra: 'Daedra',
});
const VARIANT_TYPES = new Set([8, 33]);
const shown = (names, en) => (Object.hasOwn(names, en) ? names[en] : en);

// Keys that magic/effects.js acts on; a spell effect with any other key casts and does nothing.
export const PORTED_KEYS = new Set([
  '0,255',
  '1,0', '1,1', '1,2',
  '3,0', '3,1', '3,2',
  '4,0', '4,1', '4,2',
  '7,0', '7,1', '7,2', '7,3', '7,4', '7,5', '7,6', '7,7',
  '9,0', '9,1', '9,2', '9,3', '9,4', '9,5', '9,6', '9,7',
  '10,0', '10,1', '10,2', '10,3', '10,4', '10,5', '10,6', '10,7', '10,8', '10,9',
  '11,0', '11,1', '11,2', '11,3', '11,4', '11,5', '11,6', '11,7', '11,8', '11,9',
  '8,0', '8,1', '8,2', '8,3', '8,4',
  '13,0', '13,1',
  '14,255',
  '16,255', '17,255',
  '18,255',
  '19,255',
  '2,255',
  '5,255',
  '15,255',
  '20,255', '21,255', '22,255',
  '44,255',
  '23,0', '23,1',
  '24,0', '24,1',
  '25,255',
  '26,255',
  '27,255',
  '28,255',
  '29,255',
  '45,255',
  '46,255',
  '47,255', '48,255', '49,255', '50,255', '51,255', '52,255', '53,255', '54,255',
  '55,255', '56,255', '57,255', '58,255', '59,255', '60,255', '61,255', '62,255', '63,255',
  '30,255',
  '31,255',
  '6,0', '6,1', '6,2',
  '12,255',
  '33,0', '33,1', '33,2', '33,3',
  '34,255',
  '35,255',
  '39,0', '39,1', '39,2',
  '40,255',
  '43,255',
]);

// DFU's six concealment effect classes override DisplayName as "Group (Subgroup)".
const PAREN_DISPLAY_NAME = new Set([
  '13,0', '13,1',
  '23,0', '23,1',
  '24,0', '24,1',
]);

const ENGLISH_NAMES = new Map();

export const SPELL_MAKER_EFFECTS = Object.freeze((() => {
  const out = [];
  const push = (type, subType, group, subgroup, supports, craftable = true) => {
    const key = `${type},${subType}`;
    const subgroups = VARIANT_TYPES.has(type) ? VARIANT_SUBGROUP_NAMES : SUBGROUP_NAMES;
    const groupName = () => shown(GROUP_NAMES, group);
    const subGroupName = () => (subgroup ? shown(subgroups, subgroup) : '');
    ENGLISH_NAMES.set(key, [group, subgroup]);
    out.push(Object.freeze({
      key, type, subType,
      get group() { return groupName(); },
      get subgroup() { return subGroupName(); },
      get name() {
        const g = groupName(), s = subGroupName();
        return s ? (PAREN_DISPLAY_NAME.has(key) ? `${g} (${s})` : `${g} ${s}`) : g;
      },
      duration: supports.includes(D), chance: supports.includes(C), magnitude: supports.includes(M),
      ported: PORTED_KEYS.has(key),
      craftable,
    }));
  };
  for (const [t, s, g, sub, sup, craft] of ROWS) push(t, s, g, sub, sup, craft);
  for (const [t, g, subs, sup] of FAMILIES) subs.forEach((sub, i) => push(t, i, g, sub, sup));
  const en = (e) => ENGLISH_NAMES.get(e.key)[0];
  return out.sort((a, b) => (en(a) === en(b) ? a.subType - b.subType : en(a).localeCompare(en(b))));
})());

export const spellMakerGroups = () =>
  [...new Set(SPELL_MAKER_EFFECTS.filter((e) => e.craftable).map((e) => e.group))].sort();

export const spellMakerSubgroups = (group) =>
  SPELL_MAKER_EFFECTS.filter((e) => e.group === group && e.craftable)
    .sort((a, b) => a.subgroup.localeCompare(b.subgroup));

export const effectByKey = (key) => SPELL_MAKER_EFFECTS.find((e) => e.key === key) ?? null;

// DFU effect keys such as `ContinuousDamage-SpellPoints`, which quest cast actions match against.
// Byte-folded because spell records store no subtype as -1 and the registry as 255.
export function dfuEffectKeyOf(type, subType) {
  const t = (type ?? 0) & 0xff;
  const s = (subType ?? 0) & 0xff;
  const row = SPELL_MAKER_EFFECTS.find((e) => (e.type & 0xff) === t && (e.subType & 0xff) === s);
  if (!row) return null;
  const [group, subgroup] = ENGLISH_NAMES.get(row.key);
  const g = group.replace(/ /g, '');
  return subgroup ? `${g}-${subgroup.replace(/ /g, '')}` : g;
}

export const SPELLBOOK_DESCRIPTION_IDS = new Map([
  ['0,255', 1202],
  ['1,0', 1204], ['1,1', 1205], ['1,2', 1206],
  ['2,255', 1207],
  ['3,0', 1209], ['3,1', 1210], ['3,2', 1211],
  ['4,0', 1212], ['4,1', 1213], ['4,2', 1214],
  ['5,255', 1215],
  ['6,0', 1216], ['6,1', 1217], ['6,2', 1218],
  ['7,0', 1219], ['7,1', 1220], ['7,2', 1221], ['7,3', 1222],
  ['7,4', 1223], ['7,5', 1225], ['7,6', 1224], ['7,7', 1226],
  ['8,0', 1227], ['8,1', 1228], ['8,2', 1229], ['8,3', 1230], ['8,4', 1231],
  ['9,0', 1232], ['9,1', 1233], ['9,2', 1234], ['9,3', 1235],
  ['9,4', 1236], ['9,5', 1237], ['9,6', 1238], ['9,7', 1239],
  ['10,0', 1240], ['10,1', 1241], ['10,2', 1242], ['10,3', 1243], ['10,4', 1244],
  ['10,5', 1245], ['10,6', 1246], ['10,7', 1247], ['10,8', 1248], ['10,9', 1249],
  ['11,0', 1250], ['11,1', 1251], ['11,2', 1252], ['11,3', 1253], ['11,4', 1254],
  ['11,5', 1255], ['11,6', 1256], ['11,7', 1257], ['11,8', 1258], ['11,9', 1259],
  ['12,255', 1303],
  ['13,0', 1260], ['13,1', 1261],
  ['14,255', 1262],
  ['15,255', 1263],
  ['16,255', 1264], ['17,255', 1265],
  ['18,255', 1266],
  ['19,255', 1267],
  ['20,255', 1268], ['21,255', 1269], ['22,255', 1270],
  ['23,0', 1271], ['23,1', 1272],
  ['24,0', 1273], ['24,1', 1274],
  ['25,255', 1275],
  ['26,255', 1276],
  ['27,255', 1277], ['28,255', 1278],
  ['29,255', 1279],
  ['30,255', 1282], ['31,255', 1283],
  ['33,0', 1285], ['33,1', 1286], ['33,2', 1287], ['33,3', 1288],
  ['34,255', 1289],
  ['35,255', 1290],
  ['39,0', 1296], ['39,1', 1297], ['39,2', 1298],
  ['40,255', 1299],
  ['43,255', 1302],
  ['44,255', 1305],
]);

// Unsupported components keep DFU's default of 1, since every description record prints all three.
export function classicEffectSettings(e) {
  const t = e ? effectByKey(`${e.type},${e.subType & 0xff}`) : null;
  const s = {
    durationBase: 1, durationPlus: 1, durationPerLevel: 1,
    chanceBase: 1, chancePlus: 1, chancePerLevel: 1,
    magnitudeBaseMin: 1, magnitudeBaseMax: 1, magnitudePlusMin: 1, magnitudePlusMax: 1, magnitudePerLevel: 1,
  };
  if (t?.duration) {
    s.durationBase = e.durationBase ?? 0;
    s.durationPlus = e.durationMod ?? 0;
    s.durationPerLevel = Math.max(e.durationPerLevel ?? 0, 1);
  }
  if (t?.chance) {
    s.chanceBase = e.chanceBase ?? 0;
    s.chancePlus = e.chanceMod ?? 0;
    s.chancePerLevel = Math.max(e.chancePerLevel ?? 0, 1);
  }
  if (t?.magnitude) {
    s.magnitudeBaseMin = e.magnitudeBaseLow ?? 0;
    s.magnitudeBaseMax = e.magnitudeBaseHigh ?? 0;
    s.magnitudePlusMin = e.magnitudeLevelBase ?? 0;
    s.magnitudePlusMax = e.magnitudeLevelHigh ?? 0;
    s.magnitudePerLevel = Math.max(e.magnitudePerLevel ?? 0, 1);
  }
  return s;
}

export function effectMacroSource(e) {
  const s = classicEffectSettings(e);
  return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, () => String(v)]));
}

export const spellBookDescriptionId = (key) => SPELLBOOK_DESCRIPTION_IDS.get(key) ?? null;
export const PORT_EFFECT_DESCRIPTIONS = new Map([
  ['45,255', Object.freeze([
    'Resurrect',
    'Calls a fallen party member back from death.',
    'Cast by touch at their body, and they rise where',
    'they fell, with 30% of their health.',
  ])],
  ['47,255', Object.freeze(['Meteor', 'Cast as an area at range, the spell falls', 'from the sky on the spot you aim at, and', 'its blast throws the foes in it back.'])],
  ['48,255', Object.freeze(['Slow', 'While it lasts, the target moves at half', 'its speed.'])],
  ['49,255', Object.freeze(['Clairvoyance', 'While it lasts, you sense where your quests\'', 'people, things and foes stand: they are', 'marked on your map and compass.'])],
  ['50,255', Object.freeze(['Rescue', 'Pulls a party member, a companion or an', 'allied creature you can see to your side.'])],
  ['51,255', Object.freeze(['Featherweight', 'While it lasts, what you carry weighs half.'])],
  ['52,255', Object.freeze(['Wall of Earth', 'A wall of earth rises where you look,', 'blocking the way while it lasts.'])],
  ['53,255', Object.freeze(['Decoy', 'A double of you appears where you look.', 'Foes nearby lose sight of you and go to it.'])],
  ['55,255', Object.freeze(['Recall Minions', 'Recall all minions to your location.', 'Duration: Instantaneous.', 'Chance: % chance the recall will succeed.'])],
  ['56,255', Object.freeze(['Summon Skeleton', 'Summons a skeleton to follow and guard you.', 'Needs a Humanoid Corpse, spent when it rises.', 'Magnitude: its health, and its mace.'])],
  ['57,255', Object.freeze(['Summon Zombie', 'Summons a zombie to follow and guard you.', 'Needs a Humanoid Corpse, spent when it rises.', 'Magnitude: its health, and its mace.'])],
  ['58,255', Object.freeze(['Summon Ghost', 'Summons a ghost to follow and guard you.', 'Needs a Humanoid Corpse and Ectoplasm.', 'Magnitude: its health.'])],
  ['59,255', Object.freeze(['Summon Mummy', 'Summons a mummy to follow and guard you.', 'Needs a Humanoid Corpse and Oil or a Bandage.', 'Magnitude: its health.'])],
  ['60,255', Object.freeze(['Summon Vampire', 'Summons a vampire to follow and guard you.', 'Needs a Humanoid Corpse and a Red or Yellow Rose.', 'Magnitude: its health.'])],
  ['61,255', Object.freeze(['Summon Lich', 'Summons a lich to follow and guard you.', 'Needs a Humanoid Corpse and Lich Dust.', 'Magnitude: its health.'])],
  ['62,255', Object.freeze(['Summon Ancient Vampire', 'Summons an ancient vampire to follow and guard you.', 'Needs a Humanoid Corpse and a Black or White Rose.', 'Magnitude: its health.'])],
  ['63,255', Object.freeze(['Summon Ancient Lich', 'Summons an ancient lich to follow and guard you.', 'Needs a Humanoid Corpse and Lich Dust.', 'Magnitude: its health.'])],
  ['54,255', Object.freeze(['Gravity Well', 'Where an area spell carrying it bursts, a', 'well opens that pulls the foes about it in.'])],
  ['46,255', Object.freeze([
    'Shared Cartography',
    'While it lasts, the parts of a dungeon you',
    'map are drawn on your party\'s maps too,',
    'for those in the same dungeon.',
  ])],
]);
export const portEffectDescription = (key) => PORT_EFFECT_DESCRIPTIONS.get(key) ?? null;

// Spell maker records are the spellbook ids plus 300, except Drain Personality and Drain Speed, whose spellbook
// ids are out of order.
export const SPELLMAKER_DESCRIPTION_OFFSET = 300;
const SPELLMAKER_DESCRIPTION_EXCEPTIONS = new Map([
  ['7,5', 1524],
  ['7,6', 1525],
]);
export const spellMakerDescriptionId = (key) => {
  const named = SPELLMAKER_DESCRIPTION_EXCEPTIONS.get(key);
  if (named != null) return named;
  const book = spellBookDescriptionId(key);
  return book == null ? null : book + SPELLMAKER_DESCRIPTION_OFFSET;
};
