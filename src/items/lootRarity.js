// The loot rarity ladder: tiers, affix lines, Legendary records, and the passes a loot door runs.
// With the loot rarity pref off, no field is written or read, so loot stays classic. Affixes live in item.affixes,
// never in item.enchantments, whose classic readers know only the classic enchantment types.
// Each weighted pick takes one roll, and new kinds and passes go last, so seeded mints keep their draw streams.
import { getPref } from '../ui/uiPrefs.js';
import { armorBodyParts, equipTableOf, wearableItem } from '../characters/equip.js';
import { registerEntityFold, registerWeaponDamageMod, newMods, EMPTY_MODS } from '../characters/entityMods.js';
import { templateByIndex, itemBaseValue, isAmmunition } from './itemTemplates.js';
import { rriVariantWord, rriNativeMaterialValue } from '../mods/rriItems.js';
import { familyOfNative, MATERIAL_FAMILY } from './armorMaterials.js';
import { recipeById, MASTERWORK } from '../net/recipeLaw.js';
import { STAT_KEYS_ORDER } from '../characters/statMods.js';
import { SKILL_NAMES, SKILL_COUNT, SKILLS, MAGIC_SKILLS } from '../characters/skills.js';
import { weaponSkillUsed } from '../characters/weapons.js';
import { ENCHANTMENT_TYPES } from '../formats/magicDef.js';
import { enchantmentName, enchantmentParamName } from '../magic/enchantmentCatalogue.js';
import { rollSigil, sigilOnline, SIGIL_BANDS } from './sigil.js';
import { SLOT_RULES, WEAPON_HANDS } from '../characters/equipRules.js';
import { dressClassOf } from '../justice/clothingStanding.js';
import { survivalOn } from '../systems/survival/switch.js';
import { hoodCapable } from '../systems/survival/temperature.js';
import { rareGate, legendaryGate, rollerLevel, gateLevel } from './lootLevelGate.js';
import { ROLLED_TIERS } from './rarityTier.js';
import { GEM_IDS, GEM_GRADES, GEM_GRADE_WORDS, GEM_ROW_GRADES, GEM_GRADE_TEMPLATE_BASE, GEM_GRADE_TEMPLATES, gemId, ALL_GEM_IDS, isGemId, gemKind, gemGrade, GEM_NAMES, gemTemplateOf } from './gemGrades.js';
import { setPieceKind, rollSetSigil, rollSetJoin, setLines, setSigilLines } from './sigilSets.js';
import { TECHNIQUE_IDS, TECHNIQUE_BANDS, TECHNIQUE_PER_MILLE, techniqueById, techniquesFor, techniqueBrief, techniqueParts } from '../combat/technique/techniqueRoster.js';

export const LOOT_RARITY_KEY = 'lootRarity';
export const lootRarityOn = () => !!getPref(LOOT_RARITY_KEY);

export const RARITY_ORDER = Object.freeze(['common', 'magic', 'rare', 'legendary', 'aetheric', 'artifact', 'gilded']);
export const RARITIES = Object.freeze({
  common:    Object.freeze({ rank: 0, label: 'Common',    colour: '#e9e4d9', tint: null }),
  magic:     Object.freeze({ rank: 1, label: 'Magic',     colour: '#6f9ee8', tint: Object.freeze([0.22, 0.40, 0.80, 0.45]) }),
  rare:      Object.freeze({ rank: 2, label: 'Rare',      colour: '#e4c34f', tint: Object.freeze([0.80, 0.68, 0.18, 0.45]) }),
  legendary: Object.freeze({ rank: 3, label: 'Legendary', colour: '#e07a2e', tint: Object.freeze([0.85, 0.42, 0.10, 0.50]) }),
  aetheric:  Object.freeze({ rank: 4, label: 'Aetheric',  colour: '#bfe8ff', tint: Object.freeze([0.62, 0.86, 1.00, 0.55]) }),
  artifact:  Object.freeze({ rank: 5, label: 'Artifact',  colour: '#b57bee', tint: Object.freeze([0.60, 0.35, 0.85, 0.50]) }),
  gilded:    Object.freeze({ rank: 6, label: 'Gilded',    colour: '#ff3b4a', tint: Object.freeze([1.00, 0.23, 0.29, 0.60]) }),
});
export { ROLLED_TIERS };

const enchanted = (item) => !!(item?.enchantments?.length || item?.customEnchantments?.length);

export function rarityOf(item) {
  if (!item) return 'common';
  if (item.artifact) return 'artifact';
  if (typeof item.rarity === 'string' && RARITIES[item.rarity] && item.rarity !== 'artifact') return item.rarity;
  return item.magic || enchanted(item) ? 'magic' : 'common';
}
export const rarityRank = (item) => RARITIES[rarityOf(item)].rank;

// Ammunition never rolls a tier: an enchanted item cannot stack, so a found stack would split into single rows.
export function rarityEligible(item) {
  if (!item || item.questItem || item.artifact || item.magic || item.rarity || enchanted(item) || item.equipSlot != null) return false;
  if (!wearableItem(item)) return false;
  if (item.group === 'Weapons') return !isAmmunition(item);
  if (isGarment(item)) return lootRarityOn();
  return item.group === 'Armor' || item.group === 'Jewellery';
}

export const CLOTHING_GROUPS = Object.freeze(['MensClothing', 'WomensClothing']);
export const isGarment = (item) => CLOTHING_GROUPS.includes(item?.group);
export const GARMENT_RECORD_GROUP = 'Clothing';
export const recordFitsGroup = (rec, item) => !!rec && (rec.group === item?.group || (rec.group === GARMENT_RECORD_GROUP && isGarment(item)));
export const garmentOnFeet = (item) => isGarment(item) && SLOT_RULES[item.group]?.[item.templateIndex]?.slot === 'Feet';

// Indexed in DFRegion.DungeonTypes order, from 0 Crypt to 18 Cemetery.
export const DUNGEON_RARITY_TIER = Object.freeze([
  9,
  9,
  6,
  5,
  15,
  4,
  4,
  13,
  14,
  10,
  7,
  6,
  5,
  8,
  18,
  11,
  18,
  5,
  3,
]);
export const dungeonRarityTier = (dungeonType) => DUNGEON_RARITY_TIER[dungeonType] ?? 0;
export const INTERIOR_RARITY_TIER = 4;
export const BOSS_LEVEL = 18;

export function corpseSource(basics, entityLevel = 1, mobileType = null) {
  const level = Math.max(1, (basics?.level ?? entityLevel) | 0);
  const boss = basics?.affinity === 'Daedra' || level >= BOSS_LEVEL;
  return { kind: 'corpse', tier: level, boss, family: foeFamily(mobileType) };
}
export const pileSource = (tier, boss = false) => ({ kind: 'pile', tier: Math.max(0, tier | 0), boss });

export const FOE_FAMILIES = Object.freeze({
  undead: Object.freeze([15, 17, 18, 19, 23, 28, 30, 32, 33]),
  daedra: Object.freeze([1, 22, 25, 26, 27, 29, 31, 35, 36, 37, 38]),
  dragon: Object.freeze([34, 40]),
  beast: Object.freeze([0, 2, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14, 20, 41, 42]),
  brute: Object.freeze([7, 12, 16, 21, 24]),
  caster: Object.freeze([128, 129, 130, 131, 132, 133]),
  rogue: Object.freeze([134, 135, 136, 137, 138, 139]),
  warrior: Object.freeze([140, 141, 142, 143, 144, 145, 146]),
});
export const FAMILY_IDS = Object.freeze(Object.keys(FOE_FAMILIES));
export function foeFamily(mobileType) {
  if (!Number.isInteger(mobileType)) return null;
  for (const id of FAMILY_IDS) if (FOE_FAMILIES[id].includes(mobileType)) return id;
  return null;
}
// Indexed in DFRegion.DungeonTypes order, from 0 Crypt to 18 Cemetery.
export const DUNGEON_FAMILY = Object.freeze([
  'undead',
  'brute',
  'warrior',
  'rogue',
  'daedra',
  null,
  'beast',
  'caster',
  'undead',
  'caster',
  'beast',
  'undead',
  'beast',
  'brute',
  'dragon',
  'warrior',
  'daedra',
  'beast',
  'undead',
]);
export const dungeonFamily = (dungeonType) => DUNGEON_FAMILY[dungeonType] ?? null;
export const LEGENDARY_FOUND = Object.freeze({
  graveward: 'undead', 'the-warden': 'undead', 'aegis-of-dawn': 'undead', 'lysandus-visor': 'undead',
  'warp-edge': 'daedra', 'orsiniums-anvil': 'daedra', 'amulet-of-the-nine': 'daedra',
  wyrmbane: 'dragon', 'mountains-root': 'dragon',
  stormcaller: 'beast', 'glenmoril-bow': 'beast', foxglove: 'beast', 'mark-of-the-hist': 'beast',
  titanheart: 'brute', 'gortwogs-cleaver': 'brute', 'reachmans-torc': 'brute',
  'direnni-staff': 'caster', 'archmages-loop': 'caster', 'worms-tooth': 'caster', 'witch-sisters-ring': 'caster',
  nightwhisper: 'rogue', 'tsaesci-fang': 'rogue', 'night-mothers-embrace': 'rogue', 'wayrest-treads': 'rogue',
  'anseis-edge': 'warrior', 'gauntlets-of-the-rose': 'warrior', 'ravens-wings': 'warrior', 'wall-of-daggerfall': 'warrior',
  'kings-mark': 'warrior', 'duelists-vambrace': 'warrior',
});
export const foundAmong = (id) => (typeof id === 'string' ? (LEGENDARY_FOUND[id] ?? legendaryById(id)?.found ?? null) : null);
export const SIGNATURE_WEIGHT = 5;
// A source with no family picks the same index pick would for the same roll.
export function pickLegendary(pool, family, rolls = Math.random) {
  const w = pool.map((r) => (family && foundAmong(r.id) === family ? SIGNATURE_WEIGHT : 1));
  const total = w.reduce((a, b) => a + b, 0);
  let r = rolls() * total;
  for (let i = 0; i < pool.length; i++) { if (r < w[i]) return pool[i]; r -= w[i]; }
  return pool[pool.length - 1];
}

export const RARITY_WEIGHTS = Object.freeze({
  magic:     Object.freeze({ base: 100, perTier: 15,  cap: 600 }),
  rare:      Object.freeze({ base: 15,  perTier: 6,   cap: 260 }),
  legendary: Object.freeze({ base: 1,   perTier: 1.2, cap: 45 }),
});
export const SOURCE_MULT = Object.freeze({ corpse: 1, pile: 1.3, boss: 2.5 });
export let MAGIC_DROP_SCALE = 0.25;
export function setMagicDropScale(k) { MAGIC_DROP_SCALE = Number.isFinite(k) && k >= 0 ? k : 0.25; }
export const LUCK_PCT_PER_POINT = 1;
export const LUCK_MULT_MIN = 0.5;
export const LUCK_MULT_MAX = 1.5;
export const luckMult = (luck = 50) => Math.max(LUCK_MULT_MIN, Math.min(LUCK_MULT_MAX,
  1 + (((luck | 0) - 50) * LUCK_PCT_PER_POINT) / 100));

export function rarityChances({ kind = 'corpse', tier = 0, boss = false, luck = 50, qualityMult = 1, find = 1, weights = RARITY_WEIGHTS, legendaryTier = null, legendaryQuality = null, ladder = 1, rollerLevel: atLevel = null } = {}) {
  const mult = (boss ? SOURCE_MULT.boss : (SOURCE_MULT[kind] ?? 1)) * (Number.isFinite(qualityMult) && qualityMult > 0 ? qualityMult : 1);
  const lk = luckMult(luck);
  const at = (w) => Math.max(0, Math.min(w.cap, (w.base + w.perTier * Math.max(0, tier)) * mult * lk));
  const W = weights?.magic && weights?.rare && weights?.legendary ? weights : RARITY_WEIGHTS;
  const lad = Number.isFinite(ladder) && ladder > 0 ? ladder : 1;
  const magic = at(W.magic) * lad;
  const rare = Math.min(magic, at(W.rare) * lad);
  const legAt = (w) => {
    if (legendaryTier == null && legendaryQuality == null) return at(w);
    const lt = Number.isFinite(legendaryTier) ? legendaryTier : tier;
    const lm = (boss ? SOURCE_MULT.boss : (SOURCE_MULT[kind] ?? 1)) * (Number.isFinite(legendaryQuality) && legendaryQuality > 0 ? legendaryQuality : 1);
    return Math.max(0, Math.min(w.cap, (w.base + w.perTier * Math.max(0, lt)) * lm * lk));
  };
  const legendary = Math.min(rare, legAt(W.legendary) * (Number.isFinite(find) && find > 0 ? find : 1));
  const lv = gateLevel(atLevel);
  const k = MAGIC_DROP_SCALE;
  if (lv == null) return { magic: magic * k, rare: rare * k, legendary: legendary * k };
  const rareG = Math.min(magic, rare * rareGate(lv));
  return { magic: magic * k, rare: rareG * k, legendary: Math.min(rareG, legendary * legendaryGate(lv)) * k };
}

const _finders = new Map();
export function registerLegendaryFind(name, fn) { if (typeof fn === 'function') _finders.set(name, fn); else _finders.delete(name); }
export function legendaryFindMult() {
  let m = 1;
  for (const fn of _finders.values()) { try { const v = fn(); if (Number.isFinite(v) && v > 0) m *= v; } catch { } }
  return m;
}

export function rollRarity(source, rolls = Math.random) {
  const c = rarityChances({ ...source, rollerLevel: source?.rollerLevel ?? rollerLevel() });
  const r = rolls() * 1000;
  if (r < c.legendary) return 'legendary';
  if (r < c.rare) return 'rare';
  if (r < c.magic) return 'magic';
  return 'common';
}

const _uniqueFinds = [];
export const UNIQUE_WEIGHTS = Object.freeze({ base: 0, perTier: 0.35, cap: 6 });

export function registerUniqueFind(find) {
  if (!find?.id || typeof find.mint !== 'function') return _uniqueFinds.length;
  if (!_uniqueFinds.some((f) => f.id === find.id)) {
    _uniqueFinds.push(Object.freeze({ minTier: 4, weight: 1, ...find }));
  }
  return _uniqueFinds.length;
}
export const uniqueFinds = () => _uniqueFinds.slice();

export function uniqueFindChance(find, { kind = 'corpse', tier = 0, boss = false, luck = 50 } = {}) {
  if (!find || tier < (find.minTier ?? 4)) return 0;
  const mult = boss ? SOURCE_MULT.boss : (SOURCE_MULT[kind] ?? 1);
  const luckMod = (Math.max(0, Math.min(100, luck | 0)) - 50) * 0.02;
  const w = find.weights ?? UNIQUE_WEIGHTS;
  return Math.max(0, Math.min(w.cap, (w.base + w.perTier * Math.max(0, tier)) * mult * (find.weight ?? 1) + luckMod));
}

export function rollUniqueFinds(source, rolls = Math.random) {
  const out = [];
  for (const find of _uniqueFinds) {
    if (find.late === true || find.final === true) continue;
    const chance = uniqueFindChance(find, source);
    if (chance <= 0) continue;
    if (rolls() * 1000 < chance) out.push(...(find.mint(rolls) ?? []));
  }
  return out;
}

// Late and final finds roll at the end of a door, so finds added later never move the draws a seed already made.
export function rollLateFinds(source, rolls = Math.random) {
  const out = [];
  for (const find of _uniqueFinds) {
    if (find.late !== true || find.final === true) continue;
    const chance = uniqueFindChance(find, source);
    if (chance > 0 && rolls() * 1000 < chance) out.push(...(find.mint(rolls) ?? []));
  }
  return out;
}
let _finalFindsOff = false;
export function _holdFinalFindsForTests(off) { _finalFindsOff = !!off; }
export function rollFinalFinds(source, rolls = Math.random) {
  const out = [];
  if (_finalFindsOff) return out;
  for (const find of _uniqueFinds) {
    if (find.final !== true) continue;
    const chance = uniqueFindChance(find, source);
    if (chance > 0 && rolls() * 1000 < chance) out.push(...(find.mint(rolls) ?? []));
  }
  return out;
}
const _customLegendaries = [];
export function registerLegendary(record) {
  if (!record?.id) return _customLegendaries.length;
  if (!_customLegendaries.some((l) => l.id === record.id)) _customLegendaries.push(Object.freeze(record));
  return _customLegendaries.length;
}

export const RESIST_ELEMENTS = Object.freeze(['fire', 'frost', 'shock', 'poison', 'magic']);
const ELEMENTS = RESIST_ELEMENTS;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const AFFIX_RANGES = Object.freeze({
  damage: Object.freeze({ magic: [5, 12],  rare: [10, 25], legendary: [20, 40] }),
  armor:  Object.freeze({ magic: [3, 6],   rare: [6, 12],  legendary: [12, 20] }),
  stat:   Object.freeze({ magic: [2, 5],   rare: [5, 10],  legendary: [10, 15] }),
  resist: Object.freeze({ magic: [10, 20], rare: [20, 35], legendary: [35, 50] }),
  skill:  Object.freeze({ magic: [5, 10],  rare: [10, 20], legendary: [20, 30] }),
  weight: Object.freeze({ magic: [10, 20], rare: [20, 35], legendary: [35, 50] }),
  elemental: Object.freeze({ magic: [1, 3], rare: [3, 6], legendary: [6, 10] }),
  leech:     Object.freeze({ magic: [2, 4], rare: [4, 7], legendary: [7, 10] }),
  thorns:    Object.freeze({ magic: [1, 3], rare: [3, 6], legendary: [6, 10] }),
  focus:     Object.freeze({ magic: [2, 4], rare: [4, 7], legendary: [7, 10] }),
  slayer:    Object.freeze({ magic: [5, 10], rare: [10, 20], legendary: [20, 30] }),
  standing:  Object.freeze({ magic: [2, 3], rare: [3, 5], legendary: [5, 8] }),
  warmth:    Object.freeze({ magic: [2, 4], rare: [4, 7], legendary: [7, 10] }),
  dry:       Object.freeze({ magic: [10, 20], rare: [20, 35], legendary: [35, 50] }),
  castSpeed: Object.freeze({ magic: [3, 6], rare: [6, 10], legendary: [10, 15] }),
  potency:    Object.freeze({ magic: [3, 6], rare: [6, 10], legendary: [10, 15] }),
  wellspring: Object.freeze({ magic: [2, 4], rare: [4, 7], legendary: [7, 10] }),
  technique: TECHNIQUE_BANDS,
});
export const AFFIX_COUNTS = Object.freeze({ magic: [1, 2], rare: [3, 4] });

const STAT_SUFFIX = Object.freeze({
  strength: ['of the Ox', 'of the Bear', 'of the Titan'],
  intelligence: ['of the Owl', 'of the Sage', 'of the Archmage'],
  willpower: ['of the Oak', 'of Iron Will', 'of the Unbroken'],
  agility: ['of the Cat', 'of the Falcon', 'of the Wind'],
  endurance: ['of the Boar', 'of the Mountain', 'of the Ageless'],
  personality: ['of the Peacock', 'of the Silver Tongue', 'of Kings'],
  speed: ['of the Hare', 'of the Stag', 'of Lightning'],
  luck: ['of the Fox', 'of Fortune', 'of the Gods'],
});
const RESIST_SUFFIX = Object.freeze({
  fire: ['of Embers', 'of Flame', 'of the Inferno'],
  frost: ['of Rime', 'of Winter', 'of the Glacier'],
  shock: ['of Sparks', 'of Storms', 'of the Tempest'],
  poison: ['of Venom', 'of the Serpent', 'of the Antidote'],
  magic: ['of Warding', 'of the Ward', 'of Negation'],
});
const SKILL_SUFFIX = Object.freeze(['of Practice', 'of Skill', 'of Mastery']);
export const PROC_ELEMENTS = Object.freeze(['fire', 'frost', 'shock']);
export const SLAYER_FOES = Object.freeze(['undead', 'daedra', 'humanoid', 'animal']);
const ELEMENTAL_PREFIX = Object.freeze({
  fire: ['Smouldering', 'Burning', 'Infernal'], frost: ['Chilling', 'Freezing', 'Glacial'], shock: ['Sparking', 'Crackling', 'Thundering'],
});
const LEECH_SUFFIX = Object.freeze(['of Leeching', 'of the Leech', 'of the Vampire']);
const THORNS_PREFIX = Object.freeze(['Barbed', 'Spiked', 'Thorned']);
const FOCUS_PREFIX = Object.freeze(["Adept's", "Magister's", "Sorcerer's"]);
const SLAYER_SUFFIX = Object.freeze({
  undead: ['of Rest', 'of the Gravewatch', 'of Exorcism'], daedra: ['of Banishing', 'of the Exile', "of Oblivion's Bane"],
  humanoid: ['of the Duelist', 'of the Headsman', 'of the Warlord'], animal: ['of the Hunt', 'of the Huntsman', 'of the Wild Hunt'],
});
const SLAYER_NOUN = Object.freeze({ undead: 'the undead', daedra: 'daedra', humanoid: 'humanoids', animal: 'animals' });
export const STANDING_GROUPS = Object.freeze(['commoners', 'merchants', 'scholars', 'nobility', 'underworld']);
const STANDING_NAME = Object.freeze({ commoners: 'Commoners', merchants: 'Merchants', scholars: 'Scholars', nobility: 'the Nobility', underworld: 'the Underworld' });
const STANDING_SUFFIX = Object.freeze({
  commoners: ['of the Village', 'of the Commons', 'of the People'], merchants: ['of Trade', 'of the Market', 'of the Guildhall'],
  scholars: ['of Letters', 'of the Library', 'of the College'], nobility: ['of the Court', 'of the Peerage', 'of the Crown'],
  underworld: ['of the Alley', 'of the Shadows', 'of the Underworld'],
});
const WARMTH_PREFIX = Object.freeze(['Lined', 'Quilted', 'Fur-lined']);
const DRY_PREFIX = Object.freeze(['Waxed', 'Oiled', 'Stormproof']);
const CAST_SPEED_SUFFIX = Object.freeze(['of Quickening', 'of Alacrity', 'of the Swift Hand']);
const POTENCY_PREFIX = Object.freeze(["Evoker's", "Battlemage's", "Warlock's"]);
const WELLSPRING_SUFFIX = Object.freeze(['of the Spring', 'of the Wellspring', 'of the Font']);
const DAMAGE_PREFIX = Object.freeze(["Soldier's", "Warrior's", "Slayer's"]);
const ARMOR_PREFIX = Object.freeze(["Sentinel's", "Guardian's", "Bulwark"]);
const WEIGHT_PREFIX = Object.freeze(["Porter's", "Mule's", "Giant's"]);
const BAND = Object.freeze({ magic: 0, rare: 1, legendary: 2 });

export const AFFIX_KINDS = Object.freeze({
  damage: Object.freeze({ slot: 'prefix', groups: Object.freeze(['Weapons']), params: null,
    word: (band) => DAMAGE_PREFIX[band], label: (a) => `+${a.value}% damage` }),
  armor:  Object.freeze({ slot: 'prefix', groups: Object.freeze(['Armor']), params: null,
    word: (band) => ARMOR_PREFIX[band], label: (a) => `+${a.value} armor` }),
  weight: Object.freeze({ slot: 'prefix', groups: Object.freeze(['Armor', 'Jewellery']), params: null,
    word: (band) => WEIGHT_PREFIX[band], label: (a) => `+${a.value}% carrying capacity` }),
  stat:   Object.freeze({ slot: 'suffix', groups: Object.freeze(['Weapons', 'Armor', 'Jewellery', ...CLOTHING_GROUPS]), params: STAT_KEYS_ORDER,
    word: (band, p) => STAT_SUFFIX[p][band], label: (a) => `+${a.value} ${cap(a.param)}` }),
  resist: Object.freeze({ slot: 'suffix', groups: Object.freeze(['Armor', 'Jewellery']), params: ELEMENTS,
    word: (band, p) => RESIST_SUFFIX[p][band], label: (a) => `+${a.value}% ${cap(a.param)} resistance` }),
  skill:  Object.freeze({ slot: 'suffix', groups: Object.freeze(['Weapons', 'Armor', 'Jewellery', ...CLOTHING_GROUPS]), params: Object.freeze([...Array(SKILL_COUNT).keys()]),
    word: (band) => SKILL_SUFFIX[band], label: (a) => `+${a.value} ${SKILL_NAMES[a.param] ?? 'Skill'}` }),
  elemental: Object.freeze({ slot: 'prefix', groups: Object.freeze(['Weapons']), params: PROC_ELEMENTS, proc: true,
    word: (band, p) => ELEMENTAL_PREFIX[p][band], label: (a) => `+${a.value} ${cap(a.param)} damage` }),
  leech:  Object.freeze({ slot: 'suffix', groups: Object.freeze(['Weapons']), params: null, proc: true,
    word: (band) => LEECH_SUFFIX[band], label: (a) => `${a.value}% life leech on this weapon's own blows` }),
  thorns: Object.freeze({ slot: 'prefix', groups: Object.freeze(['Armor']), params: null, proc: true,
    word: (band) => THORNS_PREFIX[band], label: (a) => `${a.value} thorns` }),
  focus:  Object.freeze({ slot: 'prefix', groups: Object.freeze(['Jewellery']), params: null, proc: true,
    word: (band) => FOCUS_PREFIX[band], label: (a) => `-${a.value}% spell cost` }),
  slayer: Object.freeze({ slot: 'suffix', groups: Object.freeze(['Weapons']), params: SLAYER_FOES, proc: true,
    word: (band, p) => SLAYER_SUFFIX[p][band], label: (a) => `+${a.value}% damage vs ${SLAYER_NOUN[a.param]}` }),
  standing: Object.freeze({ slot: 'suffix', groups: CLOTHING_GROUPS, params: STANDING_GROUPS,
    word: (band, p) => STANDING_SUFFIX[p][band], label: (a) => `+${a.value} standing with ${STANDING_NAME[a.param]}` }),
  warmth: Object.freeze({ slot: 'prefix', groups: CLOTHING_GROUPS, params: null, survival: true,
    word: (band) => WARMTH_PREFIX[band], label: (a) => `+${a.value} warmth` }),
  dry:    Object.freeze({ slot: 'prefix', groups: CLOTHING_GROUPS, params: null, survival: true,
    word: (band) => DRY_PREFIX[band], label: (a) => `${a.value}% weatherproof` }),
  castSpeed: Object.freeze({ slot: 'suffix', groups: Object.freeze(['Jewellery', 'Weapons']), params: null, proc: true,
    word: (band) => CAST_SPEED_SUFFIX[band], label: (a) => `+${a.value}% casting speed` }),
  potency: Object.freeze({ slot: 'prefix', groups: Object.freeze(['Jewellery', 'Weapons']), params: null, proc: true,
    word: (band) => POTENCY_PREFIX[band], label: (a) => `+${a.value}% spell damage` }),
  wellspring: Object.freeze({ slot: 'suffix', groups: Object.freeze(['Jewellery']), params: null, proc: true,
    word: (band) => WELLSPRING_SUFFIX[band], label: (a) => `${a.value}% magicka on a kill` }),
  technique: Object.freeze({ slot: null, groups: Object.freeze(['Weapons', 'Armor']), params: TECHNIQUE_IDS, technique: true,
    word: (band, p) => techniqueById(p)?.name ?? '', label: (a) => `${techniqueById(a.param)?.name ?? 'Technique'} +${a.value}%` }),
});
// Techniques stay out of every pool so no pool draw moves; they roll in their own pass at the end of a door.
export const AFFIX_IDS = Object.freeze(Object.keys(AFFIX_KINDS).filter((id) => !AFFIX_KINDS[id].technique));

export const AFFIX_WORTH = Object.freeze({ damage: 40, armor: 60, weight: 15, stat: 90, resist: 20, skill: 25,
  elemental: 50, leech: 80, thorns: 40, focus: 60, slayer: 25,
  standing: 60, warmth: 30, dry: 8,
  castSpeed: 60,
  potency: 60, wellspring: 60,
  technique: 30 });
export const GARMENT_WORTH_SHARE = 0.5;
const GARMENT_STATS = Object.freeze(['personality']);
export function kindParams(id, item) {
  const k = AFFIX_KINDS[id];
  if (!k?.params) return null;
  if (id === 'technique') return techniquesFor(item);
  return id === 'stat' && isGarment(item) ? GARMENT_STATS : k.params;
}

const rangeInt = (min, max, rolls) => min + Math.floor(rolls() * (max + 1 - min));
const pick = (list, rolls) => list[Math.floor(rolls() * list.length)];
function pickByLines(pool, linesOf, rolls) {
  const weights = pool.map((id) => Math.max(0, linesOf(id)));
  let r = rolls() * weights.reduce((n, w) => n + w, 0);
  let last = pool.length - 1;
  for (let i = 0; i < pool.length; i++) {
    if (weights[i] > 0) last = i;
    if (r < weights[i]) return pool[i];
    r -= weights[i];
  }
  return pool[last];
}
export const _pickByLinesForTests = pickByLines;
export function kindLines(id, item, held = []) {
  const params = kindParams(id, item);
  if (!params) return held.some((a) => a?.id === id) ? 0 : 1;
  return params.filter((p) => !held.some((a) => a?.id === id && a.param === p)).length;
}
export const drawWeight = (id, item, held = [], lean = armorLean(item)) => {
  const n = kindLines(id, item, held);
  return AFFIX_KINDS[id]?.proc ? Math.min(1, n) : n * (lean?.kinds[id] ?? 1);
};

export const SKILL_OWN_SHARE = 0.5;
export const SKILL_KIN_SHARE = 0.85;
const S = SKILLS;
const STRIKE_KIN = Object.freeze([S.CriticalStrike, S.Backstabbing, S.Dodging]);
const BODY_KIN = Object.freeze([S.ShortBlade, S.LongBlade, S.HandToHand, S.Axe, S.BluntWeapon, S.Archery, S.CriticalStrike,
  S.Dodging, S.Running, S.Jumping, S.Climbing, S.Swimming]);
const MIND_KIN = Object.freeze([...MAGIC_SKILLS, S.Etiquette, S.Streetwise, S.Mercantile, S.Lockpicking, S.Pickpocket,
  S.Stealth, S.Medical]);
const JEWEL_KIN = Object.freeze([...MIND_KIN, S.HandToHand, S.CriticalStrike]);
const STREET_KIN = Object.freeze([S.Etiquette, S.Streetwise, S.Mercantile, S.Stealth, S.Pickpocket, S.Lockpicking, S.Medical]);
const FEET_KIN = Object.freeze([S.Running, S.Jumping, S.Climbing, S.Swimming, S.Stealth]);
export const ARMOR_LEAN = Object.freeze({
  [MATERIAL_FAMILY.Leather]: Object.freeze({
    own: 0.35,
    kinds: Object.freeze({ armor: 0.5, weight: 2, stat: 1.5, resist: 0.75 }),
    stat: Object.freeze({ agility: 3, speed: 3, luck: 1.5, strength: 0.5, endurance: 0.5 }),
    resist: Object.freeze({ poison: 2, frost: 1.5 }) }),
  [MATERIAL_FAMILY.Chain]: Object.freeze({
    own: 0.5,
    kinds: Object.freeze({ resist: 2 }),
    stat: Object.freeze({ endurance: 2, agility: 1.5, willpower: 1.5 }),
    resist: Object.freeze({ magic: 2, fire: 1.5, frost: 1.5, shock: 0.5 }) }),
  [MATERIAL_FAMILY.Plate]: Object.freeze({
    own: 0.65,
    kinds: Object.freeze({ armor: 3, weight: 2, stat: 1.25, resist: 0.75 }),
    stat: Object.freeze({ strength: 3, endurance: 3, agility: 0.4, speed: 0.4 }),
    resist: Object.freeze({ fire: 2, frost: 1.5, shock: 0.5, magic: 0.75 }) }),
});
export function armorLean(item) {
  if (item?.group !== 'Armor') return null;
  return ARMOR_LEAN[familyOfNative(rriNativeMaterialValue(item))] ?? null;
}
function pickWeighted(list, weightOf, rolls) {
  const r = rolls();
  const w = list.map((x) => Math.max(0, weightOf(x)));
  const sum = w.reduce((n, x) => n + x, 0);
  if (!(sum > 0)) return list[Math.floor(r * list.length)];
  let at = r * sum;
  for (let i = 0; i < list.length; i++) { if (at < w[i]) return list[i]; at -= w[i]; }
  return list[list.length - 1];
}
const leanedParam = (lean, id, free, rolls) => (lean?.[id] && (id === 'stat' || id === 'resist')
  ? pickWeighted(free, (p) => lean[id][p] ?? 1, rolls) : pick(free, rolls));
export const _pickWeightedForTests = pickWeighted;

export function skillKin(item, { fists = true } = {}) {
  if (item?.group === 'Weapons') return { own: weaponSkillUsed(item.templateIndex), kin: STRIKE_KIN };
  if (item?.group === 'Armor') return { own: null, kin: BODY_KIN };
  if (item?.group === 'Jewellery') return { own: null, kin: fists ? JEWEL_KIN : MIND_KIN };
  if (isGarment(item)) return { own: null, kin: garmentOnFeet(item) ? FEET_KIN : STREET_KIN };
  return { own: null, kin: Object.freeze([]) };
}
export const STANDING_OWN_SHARE = 0.5;
const STANDING_LEAN = Object.freeze({ common: Object.freeze(['commoners']), fine: Object.freeze(['nobility', 'merchants']), religious: Object.freeze(['scholars']) });
function pickStanding(item, free, rolls) {
  const r = rolls();
  const lean = (STANDING_LEAN[dressClassOf(item)] ?? []).filter((g) => free.includes(g));
  const step = (list, lo, hi) => list[Math.min(list.length - 1, Math.floor(((r - lo) / (hi - lo)) * list.length))];
  if (lean.length && r < STANDING_OWN_SHARE) return step(lean, 0, STANDING_OWN_SHARE);
  return step(free, lean.length ? STANDING_OWN_SHARE : 0, 1);
}
export const _pickStandingForTests = pickStanding;
function pickSkill(item, free, rolls, fists = true) {
  const r = rolls();
  const { own, kin } = skillKin(item, { fists });
  const ownFree = own != null && free.includes(own);
  if (ownFree && r < SKILL_OWN_SHARE) return own;
  const near = kin.filter((s) => free.includes(s));
  const lo = ownFree ? SKILL_OWN_SHARE : 0;
  const within = (list, from, to) => list[Math.min(list.length - 1, Math.floor(((r - from) / (to - from)) * list.length))];
  if (near.length && r < SKILL_KIN_SHARE) return within(near, lo, SKILL_KIN_SHARE);
  return within(free, near.length ? SKILL_KIN_SHARE : lo, 1);
}
export const _pickSkillForTests = pickSkill;
const lineParam = (item, id, free, rolls) => (id === 'skill' ? pickSkill(item, free, rolls) : id === 'standing' ? pickStanding(item, free, rolls) : leanedParam(armorLean(item), id, free, rolls));

export function validAffix(a) {
  if (!a || typeof a !== 'object') return false;
  const k = Object.hasOwn(AFFIX_KINDS, a.id) ? AFFIX_KINDS[a.id] : null;
  if (!k) return false;
  if (k.params ? !k.params.includes(a.param) : a.param !== undefined) return false;
  const max = AFFIX_RANGES[a.id].legendary[1];
  return Number.isInteger(a.value) && a.value >= 1 && a.value <= max;
}
export const validAffixList = (list) => Array.isArray(list) && list.every(validAffix);
export const affixLabel = (a) => (validAffix(a) ? AFFIX_KINDS[a.id].label(a) : '');
export const affixWord = (a, tier) => (validAffix(a) ? AFFIX_KINDS[a.id].word(BAND[tier] ?? 0, a.param) : '');

// byLines, lean, and fists set to false reproduce the rules older crafted product records minted under
// (the MINT_V_ versions in net/productRecord.js), so a saved record mints the same piece.
export function rollAffixes(item, tier, rolls = Math.random, { byLines = true, lean: leans = true, fists = true } = {}) {
  const lean = leans && byLines ? armorLean(item) : null;
  const kinds = AFFIX_IDS.filter((id) => AFFIX_KINDS[id].groups.includes(item.group) && !AFFIX_KINDS[id].proc);
  const [min, max] = AFFIX_COUNTS[tier] ?? [0, 0];
  const count = rangeInt(min, max, rolls);
  const out = [];
  const taken = new Set();
  const mint = (id) => {
    const k = AFFIX_KINDS[id];
    const [lo, hi] = AFFIX_RANGES[id][tier];
    const value = rangeInt(lo, hi, rolls);
    if (!k.params) { taken.add(id); return { id, value }; }
    const free = kindParams(id, item).filter((p) => !taken.has(`${id}:${p}`));
    if (id === 'standing') { const g = pickStanding(item, free, rolls); taken.add(`${id}:${g}`); return { id, param: g, value }; }
    const param = id === 'skill' ? pickSkill(item, free, rolls, fists) : leanedParam(lean, id, free, rolls);
    taken.add(`${id}:${param}`);
    return { id, param, value };
  };
  const open = () => kinds.filter((id) => AFFIX_KINDS[id].params ? kindParams(id, item).some((p) => !taken.has(`${id}:${p}`)) : !taken.has(id));
  const own = item.group === 'Weapons' ? 'damage' : item.group === 'Armor' ? 'armor' : isGarment(item) ? 'standing' : null;
  for (let i = 0; i < count; i++) {
    let pool = open();
    if (!pool.length) break;
    if (!byLines && tier === 'rare' && i === count - 1) {
      const has = (slot) => out.some((a) => AFFIX_KINDS[a.id].slot === slot);
      const need = !has('prefix') ? 'prefix' : !has('suffix') ? 'suffix' : null;
      if (need) { const p = pool.filter((id) => AFFIX_KINDS[id].slot === need); if (p.length) pool = p; }
    }
    const draw = () => (byLines ? pickByLines(pool, (k) => drawWeight(k, item, out, lean), rolls) : pick(pool, rolls));
    const id = i === 0 && own && pool.includes(own) && rolls() < (lean?.own ?? 0.5) ? own : draw();
    out.push(mint(id));
  }
  return out;
}

const T = ENCHANTMENT_TYPES;
// Garments never take Cast When Held, since classic bills its casting cost in condition at the first equip.
const GARMENT_FLAVOURS = Object.freeze([
  { type: T.GoodRepWith, param: 0 },
  { type: T.GoodRepWith, param: 1 },
  { type: T.GoodRepWith, param: 2 },
  { type: T.GoodRepWith, param: 3 },
  { type: T.GoodRepWith, param: 4 },
  { type: T.EnhancesSkill, param: 1 },
  { type: T.EnhancesSkill, param: 2 },
  { type: T.EnhancesSkill, param: 14 },
  { type: T.EnhancesSkill, param: 16 },
  { type: T.ImprovesTalents, param: 0 },
  { type: T.ImprovesTalents, param: 1 },
]);
// A retired flavour stays listed but is never drawn, since the item law and the market still read pieces with it.
export const RARE_FLAVOURS = Object.freeze({
  Weapons: Object.freeze([
    { type: T.CastWhenStrikes, param: 7 },
    { type: T.CastWhenStrikes, param: 16 },
    { type: T.CastWhenStrikes, param: 53 },
    { type: T.CastWhenStrikes, param: 52 },
    { type: T.CastWhenStrikes, param: 33 },
    { type: T.VampiricEffect, param: 1, retired: true },
    { type: T.PotentVs, param: 0 },
    { type: T.PotentVs, param: 1 },
    { type: T.PotentVs, param: 2 },
    { type: T.PotentVs, param: 3 },
    { type: T.RepairsObjects, param: -1 },
  ]),
  Armor: Object.freeze([
    { type: T.CastWhenHeld, param: 37 },
    { type: T.CastWhenHeld, param: 41 },
    { type: T.CastWhenHeld, param: 42 },
    { type: T.CastWhenHeld, param: 24, retired: true },
    { type: T.RegensHealth, param: 2 },
    { type: T.RegensHealth, param: 1 },
    { type: T.IncreasedWeightAllowance, param: 0 },
    { type: T.RepairsObjects, param: -1 },
    { type: T.ImprovesTalents, param: 1 },
  ]),
  Jewellery: Object.freeze([
    { type: T.CastWhenHeld, param: 44 },
    { type: T.CastWhenHeld, param: 45 },
    { type: T.CastWhenHeld, param: 49 },
    { type: T.CastWhenHeld, param: 39 },
    { type: T.ExtraSpellPts, param: 8 },
    { type: T.ExtraSpellPts, param: 7 },
    { type: T.AbsorbsSpells, param: -1 },
    { type: T.ImprovesTalents, param: 0 },
    { type: T.ImprovesTalents, param: 2 },
    { type: T.GoodRepWith, param: 1 },
  ]),
  MensClothing: GARMENT_FLAVOURS,
  WomensClothing: GARMENT_FLAVOURS,
});

export const LEGENDARIES = Object.freeze([
  { id: 'wyrmbane', name: 'Wyrmbane', group: 'Weapons',
    affixes: [{ id: 'damage', value: 35 }, { id: 'stat', param: 'strength', value: 12 }, { id: 'skill', param: 34, value: 20 }],
    enchantment: { type: T.CastWhenStrikes, param: 25 },
    lore: 'Forged for a dragon hunt no chronicle finished.' },
  { id: 'nightwhisper', name: 'Nightwhisper', group: 'Weapons', templates: [113, 114, 116, 117],
    affixes: [{ id: 'damage', value: 25 }, { id: 'stat', param: 'agility', value: 12 }, { id: 'stat', param: 'speed', value: 10 }, { id: 'skill', param: 16, value: 25 }],
    enchantment: { type: T.CastWhenHeld, param: 44 },
    lore: 'A blade the Dark Brotherhood swears it never lost.' },
  { id: 'graveward', name: 'Graveward', group: 'Weapons', templates: [124, 125, 126, 127, 128],
    affixes: [{ id: 'damage', value: 30 }, { id: 'stat', param: 'endurance', value: 10 }, { id: 'skill', param: 34, value: 25 }],
    enchantment: { type: T.PotentVs, param: 0 },
    lore: 'The Order of the Hour buried it with its bearer. It did not stay buried.' },
  { id: 'stormcaller', name: "Stormcaller's Bow", group: 'Weapons', templates: [129, 130],
    affixes: [{ id: 'damage', value: 30 }, { id: 'stat', param: 'agility', value: 10 }, { id: 'skill', param: 33, value: 25 }],
    enchantment: { type: T.CastWhenStrikes, param: 20 },
    lore: 'Strung with a hair of the Ebonarm, or so the archer said.' },
  { id: 'the-warden', name: 'The Warden', group: 'Armor', templates: [102, 103, 104, 105, 106, 107, 108],
    affixes: [{ id: 'armor', value: 15 }, { id: 'stat', param: 'endurance', value: 12 }, { id: 'resist', param: 'magic', value: 40 }],
    enchantment: { type: T.RegensHealth, param: 0 },
    lore: 'Worn by the last warden of a keep that no longer stands.' },
  { id: 'titanheart', name: 'Titanheart', group: 'Armor', templates: [102, 103, 104, 105, 106, 107, 108],
    affixes: [{ id: 'armor', value: 12 }, { id: 'stat', param: 'strength', value: 15 }, { id: 'weight', value: 40 }],
    enchantment: { type: T.AbsorbsSpells, param: -1 },
    lore: 'Its plates are said to have been beaten from a giant\'s own heart.' },
  { id: 'aegis-of-dawn', name: 'Aegis of Dawn', group: 'Armor', templates: [109, 110, 111, 112],
    affixes: [{ id: 'armor', value: 18 }, { id: 'resist', param: 'fire', value: 45 }, { id: 'stat', param: 'willpower', value: 10 }],
    enchantment: { type: T.CastWhenHeld, param: 39 },
    lore: 'Raised against the Underking\'s host at the dawn of the second era.' },
  { id: 'foxglove', name: 'Foxglove', group: 'Jewellery',
    affixes: [{ id: 'stat', param: 'luck', value: 15 }, { id: 'stat', param: 'speed', value: 10 }, { id: 'resist', param: 'poison', value: 35 }],
    enchantment: { type: T.ImprovesTalents, param: 1 },
    lore: 'Pretty, and poisonous to those who would take it from you.' },
  { id: 'kings-mark', name: "King's Mark", group: 'Jewellery',
    affixes: [{ id: 'stat', param: 'personality', value: 15 }, { id: 'skill', param: 1, value: 25 }, { id: 'weight', value: 35 }],
    enchantment: { type: T.GoodRepWith, param: 3 },
    lore: 'Whoever wears it is received at court; whoever loses it is not.' },
  { id: 'archmages-loop', name: "Archmage's Loop", group: 'Jewellery',
    affixes: [{ id: 'stat', param: 'intelligence', value: 15 }, { id: 'stat', param: 'willpower', value: 12 }, { id: 'resist', param: 'shock', value: 40 }],
    enchantment: { type: T.ExtraSpellPts, param: 8 },
    lore: 'One of the rings the Mages Guild does not admit to having made.' },
  { id: 'anseis-edge', name: "Ansei's Edge", group: 'Weapons', templates: [118, 119, 120, 121, 122, 123],
    affixes: [{ id: 'damage', value: 30 }, { id: 'stat', param: 'agility', value: 12 }, { id: 'skill', param: 29, value: 25 }],
    enchantment: { type: T.PotentVs, param: 2 },
    lore: 'Carried out of drowned Yokuda by a sword-singer who never sang again.' },
  { id: 'tsaesci-fang', name: 'Tsaesci Fang', group: 'Weapons', templates: [114, 117, 121, 123],
    affixes: [{ id: 'damage', value: 28 }, { id: 'stat', param: 'speed', value: 12 }, { id: 'skill', param: 34, value: 25 }],
    enchantment: { type: T.CastWhenStrikes, param: 56 },
    lore: 'Akaviri steel, folded by the serpent-folk who came to take Tamriel and stayed to serve it.' },
  { id: 'orsiniums-anvil', name: "Orsinium's Anvil", group: 'Weapons', templates: [124, 125, 126],
    affixes: [{ id: 'damage', value: 32 }, { id: 'stat', param: 'strength', value: 12 }, { id: 'skill', param: 32, value: 25 }],
    enchantment: { type: T.PotentVs, param: 1 },
    lore: 'Beaten on the anvil that raised Orsinium again, and every bit as hard to put down.' },
  { id: 'glenmoril-bow', name: 'The Glenmoril Bow', group: 'Weapons', templates: [129, 130],
    affixes: [{ id: 'damage', value: 28 }, { id: 'stat', param: 'agility', value: 10 }, { id: 'skill', param: 33, value: 22 }],
    enchantment: { type: T.PotentVs, param: 3 },
    lore: 'Strung by the witches of Glenmoril for a hunt that Hircine himself had called.' },
  { id: 'direnni-staff', name: 'The Direnni Staff', group: 'Weapons', templates: [115],
    affixes: [{ id: 'damage', value: 20 }, { id: 'stat', param: 'intelligence', value: 15 }, { id: 'skill', param: 22, value: 25 }, { id: 'stat', param: 'willpower', value: 10 }],
    enchantment: { type: T.CastWhenStrikes, param: 54 },
    lore: 'From the Adamantine Tower, when the Direnni still ruled High Rock and thought they always would.' },
  { id: 'gortwogs-cleaver', name: "Gortwog's Cleaver", group: 'Weapons', templates: [127, 128],
    affixes: [{ id: 'damage', value: 36 }, { id: 'stat', param: 'strength', value: 10 }, { id: 'skill', param: 31, value: 25 }],
    enchantment: { type: T.VampiricEffect, param: 1 },
    lore: 'King Gortwog\'s own, before the crown made him sit down; he still asks after it.' },
  { id: 'worms-tooth', name: "Worm's Tooth", group: 'Weapons', templates: [113, 114],
    affixes: [{ id: 'damage', value: 24 }, { id: 'stat', param: 'intelligence', value: 12 }, { id: 'skill', param: 27, value: 22 }, { id: 'skill', param: 19, value: 20 }],
    enchantment: { type: T.CastWhenStrikes, param: 67 },
    lore: 'A necromancer\'s knife, cut from the King of Worms\' own tooth - or so his acolytes swear.' },
  { id: 'warp-edge', name: 'Warp-Edge', group: 'Weapons', templates: [118, 122, 123],
    affixes: [{ id: 'damage', value: 38 }, { id: 'stat', param: 'luck', value: 12 }, { id: 'skill', param: 34, value: 22 }],
    enchantment: { type: T.CastWhenStrikes, param: 55 },
    lore: 'Forged in the hour the West warped and every ending happened at once. It remembers all of them.' },
  { id: 'lysandus-visor', name: 'The Visor of King Lysandus', group: 'Armor', templates: [107],
    affixes: [{ id: 'armor', value: 16 }, { id: 'stat', param: 'willpower', value: 12 }, { id: 'resist', param: 'magic', value: 40 }, { id: 'stat', param: 'personality', value: 10 }],
    enchantment: { type: T.RegensHealth, param: 2 },
    lore: 'The ghost-king\'s own. It still sees Cryngaine Field, and the arrow that ended him.' },
  { id: 'wayrest-treads', name: "The Wayrest Courier's Treads", group: 'Armor', templates: [108],
    affixes: [{ id: 'armor', value: 12 }, { id: 'stat', param: 'speed', value: 15 }, { id: 'skill', param: 21, value: 25 }],
    enchantment: { type: T.ImprovesTalents, param: 1 },
    lore: 'Worn thin on the road between Wayrest and Daggerfall by a courier who was never once late.' },
  { id: 'gauntlets-of-the-rose', name: 'Gauntlets of the Rose', group: 'Armor', templates: [103],
    affixes: [{ id: 'armor', value: 14 }, { id: 'stat', param: 'strength', value: 12 }, { id: 'skill', param: 30, value: 25 }],
    enchantment: { type: T.StrengthensArmor, param: -1 },
    lore: 'Of Wayrest\'s Knights of the Rose, sworn to strike with an open hand - and then with a closed one.' },
  { id: 'mountains-root', name: "The Mountain's Root", group: 'Armor', templates: [104],
    affixes: [{ id: 'armor', value: 16 }, { id: 'stat', param: 'endurance', value: 12 }, { id: 'weight', value: 40 }],
    enchantment: { type: T.IncreasedWeightAllowance, param: 1 },
    lore: 'Dwemer-wrought for a foreman of the deep halls who never once lost his footing.' },
  { id: 'ravens-wings', name: "The Raven's Wings", group: 'Armor', templates: [105, 106],
    affixes: [{ id: 'armor', value: 14 }, { id: 'stat', param: 'agility', value: 12 }, { id: 'skill', param: 20, value: 25 }],
    enchantment: { type: T.CastWhenHeld, param: 37 },
    lore: 'Of Camlorn\'s Order of the Raven, whose knights drop from the walls and land standing.' },
  { id: 'night-mothers-embrace', name: "The Night Mother's Embrace", group: 'Armor', templates: [102],
    affixes: [{ id: 'armor', value: 14 }, { id: 'stat', param: 'agility', value: 10 }, { id: 'skill', param: 19, value: 25 }, { id: 'skill', param: 16, value: 20 }],
    enchantment: { type: T.CastWhenHeld, param: 45 },
    lore: 'Sweet Mother, sweet Mother, send your child unto me - and she sent this instead.' },
  { id: 'wall-of-daggerfall', name: 'The Wall of Daggerfall', group: 'Armor', templates: [111, 112],
    affixes: [{ id: 'armor', value: 18 }, { id: 'stat', param: 'endurance', value: 12 }, { id: 'resist', param: 'shock', value: 40 }],
    enchantment: { type: T.RepairsObjects, param: -1 },
    lore: 'Hewn from the gate the city was named for. The gate fell; this did not.' },
  { id: 'amulet-of-the-nine', name: 'The Amulet of the Nine', group: 'Jewellery', templates: [133, 139],
    affixes: [{ id: 'stat', param: 'willpower', value: 12 }, { id: 'skill', param: 23, value: 25 }, { id: 'resist', param: 'magic', value: 40 }],
    enchantment: { type: T.RegensHealth, param: 1 },
    lore: 'Blessed at each of the Nine\'s altars in turn, and a tenth time by someone who would not give a name.' },
  { id: 'witch-sisters-ring', name: "The Witch-Sisters' Ring", group: 'Jewellery', templates: [135],
    affixes: [{ id: 'stat', param: 'intelligence', value: 12 }, { id: 'skill', param: 24, value: 25 }, { id: 'resist', param: 'frost', value: 40 }],
    enchantment: { type: T.ExtraSpellPts, param: 6 },
    lore: 'Passed hand to hand through a Glenmoril coven; each sister added a curse, and none took one off.' },
  { id: 'duelists-vambrace', name: "The Duelist's Vambrace", group: 'Jewellery', templates: [134, 136],
    affixes: [{ id: 'stat', param: 'agility', value: 12 }, { id: 'stat', param: 'speed', value: 10 }, { id: 'skill', param: 34, value: 25 }],
    enchantment: { type: T.ImprovesTalents, param: 2 },
    lore: 'Worn through a hundred Sentinel duels. Its owner lost one, and has not been seen since.' },
  { id: 'mark-of-the-hist', name: 'The Mark of the Hist', group: 'Jewellery', templates: [137],
    affixes: [{ id: 'stat', param: 'endurance', value: 12 }, { id: 'resist', param: 'poison', value: 45 }, { id: 'skill', param: 17, value: 25 }],
    enchantment: { type: T.CastWhenHeld, param: 42 },
    lore: 'Hist-sap hardened in the shape of a hand. The Argonians call it a gift; the Hist does not say.' },
  { id: 'reachmans-torc', name: "The Reachman's Torc", group: 'Jewellery', templates: [138],
    affixes: [{ id: 'stat', param: 'strength', value: 12 }, { id: 'stat', param: 'willpower', value: 10 }, { id: 'resist', param: 'shock', value: 40 }],
    enchantment: { type: T.ExtraSpellPts, param: 9 },
    lore: 'Briar-bound and hagraven-blessed, taken off a Reach chieftain who had no more use for it.' },
]);
// Separate from LEGENDARIES so seeded picks over that table stay unchanged.
export const WARDROBE_LEGENDARIES = Object.freeze([
  Object.freeze({ id: 'alikr-robes', name: "The Alik'r Wayfarer's Robes", group: GARMENT_RECORD_GROUP, templates: Object.freeze([163, 200]),
    affixes: Object.freeze([{ id: 'dry', value: 45 }, { id: 'skill', param: 21, value: 25 }, { id: 'standing', param: 'commoners', value: 6 }]),
    enchantment: Object.freeze({ type: T.ImprovesTalents, param: 1 }),
    found: 'beast',
    power: Object.freeze({ name: 'Desert-Born', kind: 'climate', heat: 20, survival: true,
      brief: 'Feel the heat 20 degrees less', text: 'You feel the heat 20 degrees less' }),
    lore: "Worn across the Alik'r by a caravan-master who crossed it forty times and drank at every well on the way twice." }),
  Object.freeze({ id: 'wrothgar-mantle', name: 'The Wrothgar Pass Mantle', group: GARMENT_RECORD_GROUP, templates: Object.freeze([155, 192]),
    affixes: Object.freeze([{ id: 'warmth', value: 10 }, { id: 'dry', value: 40 }, { id: 'skill', param: 18, value: 25 }]),
    enchantment: Object.freeze({ type: T.ExtraSpellPts, param: 0 }),
    found: 'brute',
    power: Object.freeze({ name: 'Mountain-Born', kind: 'climate', cold: 20, survival: true,
      brief: 'Feel the cold 20 degrees less', text: 'You feel the cold 20 degrees less' }),
    lore: "Orsinium's sentries hold the Wrothgar passes in these. The one that came down without its sentry has never said where he went." }),
  Object.freeze({ id: 'stendarr-vestments', name: 'The Vestments of Stendarr', group: GARMENT_RECORD_GROUP, templates: Object.freeze([164, 201]),
    affixes: Object.freeze([{ id: 'skill', param: 23, value: 25 }, { id: 'standing', param: 'scholars', value: 6 }, { id: 'stat', param: 'personality', value: 12 }]),
    enchantment: Object.freeze({ type: T.ExtraSpellPts, param: 7 }),
    found: 'daedra',
    power: Object.freeze({ name: "Stendarr's Mercy", kind: 'school', school: 23, less: 25,
      brief: 'Restoration costs 25% less', text: 'Your Restoration spells cost 25% less magicka' }),
    lore: "Stendarr's vigilants wore these into the Desecrated Temples. Some of the vigilants came back; all of the robes did." }),
  Object.freeze({ id: 'pilgrims-sandals', name: "The Pilgrim's Sandals", group: GARMENT_RECORD_GROUP, templates: Object.freeze([150, 189, 147, 186]),
    affixes: Object.freeze([{ id: 'skill', param: 21, value: 25 }, { id: 'skill', param: 3, value: 22 }, { id: 'stat', param: 'personality', value: 10 }]),
    enchantment: Object.freeze({ type: T.RegensHealth, param: 1 }),
    found: 'undead',
    power: Object.freeze({ name: 'The Long Road', kind: 'longroad', fatigue: 25, fall: 50,
      brief: 'Tire 25% slower; falls hurt half', text: 'You tire 25% slower when traveling, and falls deal half damage' }),
    lore: 'Worn to every shrine of the Nine in turn, and on to a tenth that no map in the Bay will show.' }),
  Object.freeze({ id: 'barenziah-silks', name: 'The Silks of Queen Barenziah', group: GARMENT_RECORD_GROUP, templates: Object.freeze([195, 196, 194, 159, 160, 143]),
    affixes: Object.freeze([{ id: 'standing', param: 'nobility', value: 8 }, { id: 'stat', param: 'personality', value: 15 }, { id: 'skill', param: 1, value: 25 }]),
    enchantment: Object.freeze({ type: T.GoodRepWith, param: 1 }),
    found: 'caster',
    power: Object.freeze({ name: 'Royal Bearing', kind: 'bearing', standing: 5,
      brief: '+5 standing with every group', text: '+5 standing with every social group' }),
    lore: "Barenziah wore them to Eadwyre's court at Wayrest. They were stolen twice in the year after, and returned once." }),
  Object.freeze({ id: 'shades-cowl', name: "The Shade's Cowl", group: GARMENT_RECORD_GROUP, templates: Object.freeze([154, 191]),
    affixes: Object.freeze([{ id: 'standing', param: 'underworld', value: 8 }, { id: 'skill', param: 16, value: 25 }, { id: 'skill', param: 15, value: 22 }]),
    enchantment: Object.freeze({ type: T.EnhancesSkill, param: 13 }),
    found: 'rogue',
    power: Object.freeze({ name: 'Unseen', kind: 'hood', skill: 16, more: 25,
      brief: '+25 Stealth while hooded', text: 'While its hood is up, you have +25 Stealth' }),
    lore: 'Made for a Daggerfall cutpurse who was never once seen. Nobody can say what she looked like - only that the cowl was gray.' }),
]);
// Separate from LEGENDARIES and WARDROBE_LEGENDARIES so seeded picks over those tables stay unchanged.
export const ARCANE_LEGENDARIES = Object.freeze([
  Object.freeze({ id: 'eye-of-magnus', name: 'The Eye of Magnus', group: 'Jewellery', templates: Object.freeze([133, 139]),
    affixes: Object.freeze([{ id: 'stat', param: 'intelligence', value: 15 }, { id: 'skill', param: 22, value: 25 }, { id: 'resist', param: 'magic', value: 40 }]),
    enchantment: Object.freeze({ type: T.ExtraSpellPts, param: 2 }),
    found: 'caster',
    power: Object.freeze({ name: "Magnus's Gaze", kind: 'pierce', points: 15,
      brief: 'Spells pierce 15 resistance', text: 'Enemies\' saving throws against your Destruction spells are 15 lower. Enemies immune to the element stay immune' }),
    lore: 'Ground from a shard of the sun the Mages Guild swears it never kept. Look through it at noon and you will not look again.' }),
  Object.freeze({ id: 'ring-of-artaeum', name: 'The Ring of Artaeum', group: 'Jewellery', templates: Object.freeze([135]),
    affixes: Object.freeze([{ id: 'stat', param: 'willpower', value: 12 }, { id: 'skill', param: 27, value: 25 }, { id: 'resist', param: 'fire', value: 40 }]),
    enchantment: Object.freeze({ type: T.ExtraSpellPts, param: 5 }),
    found: 'caster',
    power: Object.freeze({ name: 'Wellspring of Artaeum', kind: 'attune', pct: 1, low: 2,
      brief: 'Regain 1% magicka a round', text: 'Each round you regain 1% of your magicka, or 2% while below half' }),
    lore: 'A Psijic novice\'s ring, left behind when the isle was. The Order has not asked for it back; the Order rarely asks.' }),
  Object.freeze({ id: 'shalidors-brand', name: "Shalidor's Brand", group: 'Weapons', templates: Object.freeze([118, 119, 120]),
    affixes: Object.freeze([{ id: 'damage', value: 24 }, { id: 'stat', param: 'intelligence', value: 12 }, { id: 'skill', param: 22, value: 22 }]),
    enchantment: Object.freeze({ type: T.CastWhenStrikes, param: 7 }),
    found: 'caster',
    power: Object.freeze({ name: 'Arcane Surge', kind: 'surge', pct: 25, above: 75,
      brief: '+25% spell damage above 75% MP', text: 'While you wield it and your magicka is above 75%, your Destruction spells deal 25% more damage' }),
    lore: 'The first Archmage carried a blade, his apprentices said, so that no one would think to look at his hands.' }),
]);
export const legendaryById = (id) => allLegendaries().find((l) => l.id === id) ?? null;
export const LEGENDARY_POWERS = Object.freeze({
  wyrmbane: Object.freeze({ name: 'Dragonsbane', kind: 'bane', foes: Object.freeze([34, 40, 16]), pct: 50,
    brief: '+50% vs dragons and giants', text: 'This weapon deals 50% more damage to dragonlings and giants' }),
  nightwhisper: Object.freeze({ name: 'Silent Death', kind: 'unaware', pct: 100,
    brief: '+100% vs unaware foes', text: 'This weapon deals double damage to enemies that have not noticed you' }),
  graveward: Object.freeze({ name: 'Sanctified', kind: 'sanctified', group: 'undead', pct: 40, heal: 10,
    brief: 'Undead: +40% damage, kills heal', text: 'This weapon deals 40% more damage to undead. While you wield it, each undead you kill heals you for 10% of your health' }),
  stormcaller: Object.freeze({ name: 'Chain Lightning', kind: 'chain', metres: 6, share: 50,
    brief: 'Arrows jump 50% to a nearby foe', text: 'Each arrow that hits jumps to the nearest other enemy within 6 m, dealing 50% of its damage as shock' }),
  'anseis-edge': Object.freeze({ name: 'Way of the Sword', kind: 'flow', pct: 6, max: 5, seconds: 6,
    brief: '+6% per hit, up to 5 (6s)', text: 'Each hit gives you Flow for 6 s, up to 5 times: +6% weapon damage each time' }),
  'tsaesci-fang': Object.freeze({ name: "Serpent's Kiss", kind: 'venom', flat: 8,
    brief: '+8 poison, x2 under half', text: 'Each hit adds 8 poison damage, doubled against enemies below half health. Enemies that resist poison take half, and immune ones take none' }),
  'orsiniums-anvil': Object.freeze({ name: 'Earthshaker', kind: 'quake', metres: 3, share: 25,
    brief: 'Hits splash 25% within 3 m', text: 'Each hit also deals 25% of its damage to every other enemy within 3 m' }),
  'glenmoril-bow': Object.freeze({ name: "Hunter's Moon", kind: 'moon', pct: 35, beast: 35,
    brief: 'At night: +35%, +70% vs animals', text: 'At night this weapon deals 35% more damage, or 70% more to animals' }),
  'direnni-staff': Object.freeze({ name: 'Arcane Conduit', kind: 'conduit', less: 20, mana: 3,
    brief: '-20% spell cost; hits give 3 MP', text: 'While you wield it, your spells cost 20% less magicka and each hit restores 3 magicka' }),
  'gortwogs-cleaver': Object.freeze({ name: 'Orc Rage', kind: 'rage', heal: 10, below: 33, pct: 30,
    brief: 'Kills heal 10%; +30% when low', text: 'While you wield it, each kill heals you for 10% of your health, and below 33% health its hits deal 30% more damage' }),
  'worms-tooth': Object.freeze({ name: 'Soul Siphon', kind: 'siphon', pct: 15,
    brief: 'Kills restore 15% magicka', text: 'While you wield it, each kill restores 15% of your magicka' }),
  'warp-edge': Object.freeze({ name: 'Many Endings', kind: 'echo', chance: 10,
    brief: '10% chance to strike twice', text: 'Each hit has a 10% chance to strike again for the same damage' }),
  'the-warden': Object.freeze({ name: 'Last Stand', kind: 'laststand', below: 25, less: 25,
    brief: '-25% damage taken when low', text: 'Below 25% health, you take 25% less damage' }),
  titanheart: Object.freeze({ name: 'Unyielding', kind: 'unyielding', most: 25,
    brief: 'No hit takes over 25% health', text: 'No single hit can take more than 25% of your health' }),
  'aegis-of-dawn': Object.freeze({ name: 'Dawnward', kind: 'dawnward', charges: 5,
    brief: 'Every 6th hit on you is blocked', text: 'Each enemy hit on you adds a charge. At 5 charges, the next hit is blocked completely' }),
  'lysandus-visor': Object.freeze({ name: "The Ghost-King's Vigil", kind: 'vigil', below: 33, heal: 20, recover: 60,
    brief: 'Heal 20% when low (60s)', text: 'When a hit drops you below 33% health, you heal 20% of your health. Recovers in 60 s' }),
  'wayrest-treads': Object.freeze({ name: "Courier's Haste", kind: 'haste', speed: 20, rounds: 2, recover: 10,
    brief: 'Kills: +20 Speed (2 rounds)', text: 'Each kill gives you +20 Speed for 2 rounds. Recovers in 10 s' }),
  'gauntlets-of-the-rose': Object.freeze({ name: 'Open Hand', kind: 'fists', share: 50,
    brief: 'Fists hit again for 50%', text: 'Each bare-handed hit strikes again for 50% of its damage' }),
  'mountains-root': Object.freeze({ name: 'Bedrock', kind: 'bedrock', less: 4, max: 5, seconds: 6,
    brief: '-4% per hit taken, up to 5', text: 'Each enemy hit on you lowers the damage of later hits by 4% for 6 s, up to 5 times' }),
  'ravens-wings': Object.freeze({ name: "Raven's Evasion", kind: 'evade', chance: 15,
    brief: '15% chance to evade a hit', text: 'You have a 15% chance to evade each enemy hit completely' }),
  'night-mothers-embrace': Object.freeze({ name: "Sweet Mother's Kiss", kind: 'execute', below: 25, pct: 50,
    brief: '+50% to foes under 25%', text: 'Your weapon deals 50% more damage to enemies below 25% health' }),
  'wall-of-daggerfall': Object.freeze({ name: 'Bulwark', kind: 'bulwark', less: 5,
    brief: 'Blows on you: -5 damage', text: 'Each enemy hit on you deals 5 less damage, to a minimum of 1' }),
  foxglove: Object.freeze({ name: "Fortune's Favour", kind: 'fortune', mult: 1.5,
    brief: 'Legendaries 50% more likely', text: 'While you wear it, you are 50% more likely to find a Legendary' }),
  'kings-mark': Object.freeze({ name: 'Tribute', kind: 'tribute', gold: 5,
    brief: 'Kills pay 5 gold per level', text: 'Each kill pays you 5 gold per level of the enemy' }),
  'archmages-loop': Object.freeze({ name: 'Spell Mastery', kind: 'mastery', less: 15, low: 30,
    brief: '-15% spell cost, -30% when low', text: 'Your spells cost 15% less magicka, or 30% less while your magicka is below half' }),
  'amulet-of-the-nine': Object.freeze({ name: 'Divine Grace', kind: 'grace', heal: 25, recover: 180,
    brief: 'Cheat death, heal 25% (180s)', text: 'A hit that would kill you leaves you alive and heals you for 25% of your health. Recovers in 180 s' }),
  'witch-sisters-ring': Object.freeze({ name: 'Hex', kind: 'hex', less: 25, seconds: 8,
    brief: 'Attackers deal 25% less (8s)', text: 'An enemy that hits you is hexed for 8 s and deals 25% less damage to you' }),
  'duelists-vambrace': Object.freeze({ name: 'First Blood', kind: 'firstblood', pct: 60,
    brief: '+60% on first hit per foe', text: 'Your first weapon hit on each enemy deals 60% more damage' }),
  'mark-of-the-hist': Object.freeze({ name: 'Hist-Sap', kind: 'regen', pct: 1, low: 2,
    brief: 'Regenerate 1% health a round', text: 'Each round you regain 1% of your health, or 2% while below half' }),
  'reachmans-torc': Object.freeze({ name: "Hagraven's Pact", kind: 'absorb', chance: 15,
    brief: '15% chance to absorb a spell', text: 'Destruction spells that hit you have a 15% chance to be absorbed, like Spell Absorption' }),
});
// gilded.js registers its records here because it imports this file.
let _gilded = null;
export function registerGildedRecords(api) { _gilded = api && typeof api.powerOf === 'function' && typeof api.loreOf === 'function' ? api : null; }
export const powerOf = (id) => (typeof id === 'string' ? (LEGENDARY_POWERS[id] ?? legendaryById(id)?.power ?? _gilded?.powerOf(id) ?? null) : null);
export const powerLine = (p) => (p?.name && p?.brief ? `${p.name}: ${p.brief}${p.survival && !survivalOn() ? SURVIVAL_OFF_NOTE : ''}` : '');
export function imprintLine(item) {
  if (item?.rarity !== 'rare' || typeof item.imprint !== 'string') return '';
  const rec = legendaryById(item.imprint);
  const p = powerOf(item.imprint);
  return rec && p?.name ? `Imprint: ${p.name} (of ${rec.name})${p.brief ? ` - ${p.brief}` : ''}` : '';
}
export function powerFits(item, power) {
  if (!item || !power) return false;
  const shoots = item.group === 'Weapons' && weaponSkillUsed(item.templateIndex) === SKILLS.Archery;
  if (power.kind === 'chain' || power.kind === 'hammerfall' || power.kind === 'broadside') return shoots;
  if (power.kind === 'quake') return item.group === 'Weapons' && !shoots;
  if (power.kind === 'hood') return hoodCapable(item);
  return true;
}
export const validImprint = (item) => item?.imprint === undefined
  || (item.rarity === 'rare' && typeof item.imprint === 'string' && recordFitsGroup(legendaryById(item.imprint), item) && powerFits(item, powerOf(item.imprint)));

export const allLegendaries = () => [...LEGENDARIES, ...WARDROBE_LEGENDARIES, ...ARCANE_LEGENDARIES, ..._customLegendaries];
export function legendariesFor(item) {
  const pool = allLegendaries().filter((l) => recordFitsGroup(l, item) && (!l.templates || l.templates.includes(item.templateIndex)));
  const claimed = pool.filter((l) => l.exclusive);
  return claimed.length ? claimed : pool;
}

export function rarityName(item, tier, affixes) {
  const template = templateByIndex(item.templateIndex)?.name;
  return nameAround(template != null ? rriVariantWord(item) + template : (item.name ?? ''), tier, affixes);
}
const nameAround = (base, tier, affixes) => {
  const names = (a, slot) => AFFIX_KINDS[a?.id]?.slot === slot && !AFFIX_KINDS[a.id].proc;
  const pre = affixes.find((a) => names(a, 'prefix'));
  const suf = affixes.find((a) => names(a, 'suffix'));
  const parts = [];
  if (pre) parts.push(affixWord(pre, tier));
  parts.push(base);
  if (suf) parts.push(affixWord(suf, tier));
  return parts.join(' ');
};
const markNamed = (item) => item?.quality === MASTERWORK && typeof item.maker === 'string' && item.maker !== '' && !!recipeById(item.recipe);
function ladderBase(item) {
  const template = templateByIndex(item?.templateIndex)?.name;
  const r = recipeById(item?.recipe);
  if (r?.kind === 'jewel') return r.name;
  if (template == null) return null;
  return markNamed(item) ? template : rriVariantWord(item) + template;
}
const _slotWords = new Map();
function slotWords(tier, slot) {
  const key = `${tier}:${slot}`;
  let words = _slotWords.get(key);
  if (!words) {
    words = new Set();
    for (const id of AFFIX_IDS) {
      const k = AFFIX_KINDS[id];
      if (k.slot === slot && !k.proc) for (const p of k.params ?? [null]) words.add(k.word(BAND[tier] ?? 0, p));
    }
    _slotWords.set(key, words);
  }
  return words;
}
function ladderBuilt(item, tier, name) {
  if (typeof name !== 'string') return false;
  for (const base of new Set([ladderBase(item), templateByIndex(item?.templateIndex)?.name])) {
    const at = typeof base === 'string' && base ? name.indexOf(base) : -1;
    if (at < 0) continue;
    const pre = name.slice(0, at), suf = name.slice(at + base.length);
    if ((pre === '' || (pre.endsWith(' ') && slotWords(tier, 'prefix').has(pre.slice(0, -1))))
      && (suf === '' || (suf.startsWith(' ') && slotWords(tier, 'suffix').has(suf.slice(1))))) return true;
  }
  return false;
}
const ladderName = (item, tier) => (markNamed(item) ? ladderBase(item) : nameAround(ladderBase(item) ?? '', tier, item.affixes.filter((a) => a?.gem == null)));
// Rebuild the name only when the ladder built the old one; a name the player or a quest gave stays.
export function linesName(item, tier, was = item) {
  return ladderBuilt(was, was?.rarity, was?.name) ? ladderName(item, tier) : was?.name;
}
// Load repairs run on every load, so each must leave already repaired items unchanged.
export function repairCraftedNames(items) {
  let n = 0;
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || typeof it !== 'object' || (it.rarity !== 'magic' && it.rarity !== 'rare') || !Array.isArray(it.affixes) || !recipeById(it.recipe) || !Object.isExtensible(it)) continue;
    const name = linesName(it, it.rarity);
    if (name === it.name) continue;
    it.name = name;
    n++;
  }
  return n;
}

export function repairRarityNames(items) {
  let n = 0;
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || typeof it !== 'object' || (it.rarity !== 'magic' && it.rarity !== 'rare') || !Array.isArray(it.affixes) || !Object.isExtensible(it)) continue;
    const word = rriVariantWord(it);
    const template = templateByIndex(it.templateIndex)?.name;
    if (!word || template == null || it.name !== nameAround(template, it.rarity, it.affixes)) continue;
    it.name = nameAround(word + template, it.rarity, it.affixes);
    n++;
  }
  return n;
}

export const RARITY_HOME = Object.freeze({ Jewellery: 133 });
export function repairRarityBases(items) {
  let n = 0;
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || typeof it !== 'object' || !ROLLED_TIERS.includes(it.rarity) || !Object.isExtensible(it)) continue;
    const home = RARITY_HOME[it.group];
    if (home == null || wearableItem(it)) continue;
    const from = { ...it };
    it.templateIndex = home;
    if (it.rarity !== 'legendary' && Array.isArray(it.affixes) && it.name === rarityName(from, it.rarity, it.affixes)) it.name = rarityName(it, it.rarity, it.affixes);
    if (Number.isFinite(it.value)) it.value += itemBaseValue(it) - itemBaseValue(from);
    n++;
  }
  return n;
}

export const RARITY_HOMED_FROM = Object.freeze({ Jewellery: Object.freeze([140]) });
// The realm ledger treats a print moved by repairRarityBases as the same piece, so held pieces never read forged.
export function rehomedPrint(was, now) {
  const [wt, wm] = String(was).split(':'), [nt, nm] = String(now).split(':');
  return wm === nm && Object.entries(RARITY_HOMED_FROM).some(([g, from]) => Number(nt) === RARITY_HOME[g] && from.includes(Number(wt)));
}

export const affixesWorth = (affixes, item = null) => Math.round((affixes ?? []).reduce((n, a) => n + (AFFIX_WORTH[a.id] ?? 0) * (a.value | 0), 0)
  * (isGarment(item) ? GARMENT_WORTH_SHARE : 1));

export function applyRarity(item, tier, rolls = Math.random, legendaryPool = null, { family = null, fits = null, byLines = true, lean = true, fists = true } = {}) {
  if (!item || !ROLLED_TIERS.includes(tier)) return item;
  let affixes;
  let enchantment = null;
  if (tier === 'legendary') {
    const pool = legendaryPool ?? legendariesFor(item).filter((l) => !l.shopOnly);
    if (!pool.length) return applyRarity(item, 'rare', rolls, null, { byLines, lean, fists });
    const rec = pickLegendary(pool, family, rolls);
    affixes = rec.affixes.map((a) => ({ ...a }));
    enchantment = rec.enchantment;
    item.legendary = rec.id;
    item.name = rec.name;
  } else {
    affixes = rollAffixes(item, tier, rolls, { byLines, lean, fists });
    item.name = rarityName(item, tier, affixes);
    if (tier === 'rare') enchantment = rareFlavour(RARE_FLAVOURS[item.group] ?? RARE_FLAVOURS.Jewellery, rolls, fits);
  }
  item.rarity = tier;
  item.affixes = affixes;
  if (enchantment) item.enchantments = [{ type: enchantment.type, param: enchantment.param }];
  item.value = itemBaseValue(item) + affixesWorth(affixes, item) + (enchantment ? rareEnchantWorth(item) : 0);
  return item;
}
function rareFlavour(list, rolls, fits = null) {
  const all = list.filter((f) => !f.retired);
  const first = pick(all, rolls);
  if (typeof fits !== 'function' || fits(first)) return first;
  const ok = all.filter(fits);
  return ok.length ? pick(ok, rolls) : first;
}
export const RARE_ENCHANT_WORTH = 600;
export const rareEnchantWorth = (item) => Math.round(RARE_ENCHANT_WORTH * (isGarment(item) ? GARMENT_WORTH_SHARE : 1));
// Rolled worth on a crafted or imbued piece is power, not price; counters take it off, so crafting makes no gold.
export function craftedRarityWorth(item) {
  if ((typeof item?.provenance !== 'string' && item?.imbued !== true) || !ROLLED_TIERS.includes(item.rarity)) return 0;
  const rolled = affixesWorth(Array.isArray(item.affixes) ? item.affixes : [], item) + (item.rarity === 'rare' ? rareEnchantWorth(item) : 0);
  return typeof item.provenance !== 'string' && Number.isInteger(item.imbueWorth) ? Math.min(rolled, Math.max(0, item.imbueWorth)) : rolled;
}

export function rollLootRarity(items, sourceIn, { rolls = Math.random, luck = 50, find: findIn = undefined, level = undefined } = {}) {
  if (!sourceIn || !Array.isArray(items)) return items;
  // The final finds roll even with the ladder off, since the Pellet is a find, not a tier.
  if (!lootRarityOn()) return (items.push(...rollFinalFinds({ ...sourceIn, luck }, rolls)), items);
  const source = { ...sourceIn, rollerLevel: sourceIn.rollerLevel ?? level ?? rollerLevel() };
  const find = findIn ?? legendaryFindMult();
  const minted = [];
  for (const it of items) {
    if (isGarment(it)) continue;
    if (!rarityEligible(it)) continue;
    it.untaken = true;
    const tier = rollRarity({ ...source, luck, find }, rolls);
    if (tier !== 'common') { applyRarity(it, tier, rolls, null, { family: source.family ?? null }); minted.push(it); }
  }
  for (const found of rollUniqueFinds({ ...source, luck }, rolls)) {
    const piece = rarityEligible(found);
    if (piece) {
      const tier = rollRarity({ ...source, luck, find }, rolls);
      if (tier !== 'common') { applyRarity(found, tier, rolls, null, { family: source.family ?? null }); minted.push(found); }
    }
    if (piece || rarityRank(found) >= RARITIES.legendary.rank) found.untaken = true;
    items.push(found);
  }
  // Each pass runs after every draw before it, so a seeded door keeps its earlier pieces; add new passes last.
  lastPass(minted, rolls);
  const dressed = wardrobePass(items, source, { rolls, luck, find });
  cursePass([...minted, ...dressed], rolls);
  socketPass(minted, rolls);
  items.push(...rollLateFinds({ ...source, luck }, rolls));
  weaponSocketPass(minted, rolls);
  items.push(...(_gemFind?.({ ...source, luck }, rolls) ?? []));
  damnPass(minted, rolls);
  techniquePass(minted, rolls);
  items.push(...rollFinalFinds({ ...source, luck }, rolls));
  return items;
}
// gems.js registers its find here because it imports this file.
let _gemFind = null;
export function registerGemFind(fn) { _gemFind = typeof fn === 'function' ? fn : null; }
export function wardrobePass(items, source, { rolls = Math.random, luck = 50, find = 1 } = {}) {
  const dressed = [];
  if (!lootRarityOn() || !source || !Array.isArray(items)) return dressed;
  for (const g of items) {
    if (!isGarment(g) || g.untaken === true || !rarityEligible(g)) continue;
    g.untaken = true;
    const rung = rollRarity({ ...source, luck, find }, rolls);
    if (rung !== 'common') { applyRarity(g, rung, rolls, null, { family: source.family ?? null }); dressed.push(g); }
  }
  lastPass(dressed, rolls);
  return dressed;
}
export function lastPass(pieces, rolls = Math.random, { on = lootRarityOn() } = {}) {
  for (const it of pieces ?? []) if (it?.rarity === 'magic' || it?.rarity === 'rare') rollProcLine(it, rolls, on);
  for (const it of pieces ?? []) if (it?.rarity === 'legendary') rollExalted(it, rolls, on);
}

export const PROC_PER_MILLE = Object.freeze({ magic: 200, rare: 350 });
let _procPerMille = PROC_PER_MILLE;
export function _setProcForTests(table) { _procPerMille = table == null ? PROC_PER_MILLE : table; }
export function addProcLine(item, rolls = Math.random) {
  if ((item?.rarity !== 'magic' && item?.rarity !== 'rare') || !Array.isArray(item.affixes)) return null;
  const kinds = AFFIX_IDS.filter((id) => AFFIX_KINDS[id].proc && AFFIX_KINDS[id].groups.includes(item.group) && !item.affixes.some((a) => a?.id === id));
  if (!kinds.length) return null;
  const id = pick(kinds, rolls);
  const k = AFFIX_KINDS[id];
  const [lo, hi] = AFFIX_RANGES[id][item.rarity];
  const value = rangeInt(lo, hi, rolls);
  const line = k.params ? { id, param: pick(k.params, rolls), value } : { id, value };
  item.affixes = [...item.affixes, line];
  item.value = (Number.isFinite(item.value) ? item.value : itemBaseValue(item)) + affixesWorth([line]);
  return line;
}
export function rollProcLine(item, rolls = Math.random, on = lootRarityOn()) {
  if (!on || (item?.rarity !== 'magic' && item?.rarity !== 'rare') || !Array.isArray(item.affixes)) return null;
  if (item.affixes.some((a) => AFFIX_KINDS[a?.id]?.proc)) return null;
  if (!(rolls() * 1000 < (_procPerMille[item.rarity] ?? 0))) return null;
  return addProcLine(item, rolls);
}
export const isProcAffix = (a) => !!AFFIX_KINDS[a?.id]?.proc;
// A technique line and set gem lines stay last on a piece, as the item law expects.
function withLine(affixes, line) {
  const at = affixes.findIndex((a) => a?.gem != null || !!AFFIX_KINDS[a?.id]?.technique);
  return at < 0 ? [...affixes, line] : [...affixes.slice(0, at), line, ...affixes.slice(at)];
}

export const isTechniqueAffix = (a) => !!AFFIX_KINDS[a?.id]?.technique;
export function techniqueLineOf(item) {
  const list = item?.affixes;
  if (!Array.isArray(list)) return null;
  for (let i = 0; i < list.length; i++) { const a = list[i]; if (isTechniqueAffix(a) && validAffix(a)) return a; }
  return null;
}
let _techniquePerMille = TECHNIQUE_PER_MILLE;
export function _setTechniqueForTests(table) { _techniquePerMille = table == null ? TECHNIQUE_PER_MILLE : table; }
export const techniqueEligible = (item) => ROLLED_TIERS.includes(item?.rarity) && Array.isArray(item.affixes)
  && techniquesFor(item).length > 0 && !item.affixes.some(isTechniqueAffix);
export function addTechniqueLine(item, rolls = Math.random, { id: chosen = null } = {}) {
  if (!techniqueEligible(item)) return null;
  if (chosen != null && !techniquesFor(item).includes(chosen)) return null;
  const id = chosen ?? pick(techniquesFor(item), rolls);
  const [lo, hi] = AFFIX_RANGES.technique[item.rarity];
  const line = { id: 'technique', param: id, value: rangeInt(lo, hi, rolls) };
  const gem = item.affixes.findIndex((a) => a?.gem != null);
  item.affixes = gem < 0 ? [...item.affixes, line] : [...item.affixes.slice(0, gem), line, ...item.affixes.slice(gem)];
  item.value = (Number.isFinite(item.value) ? item.value : itemBaseValue(item)) + affixesWorth([line], item);
  return line;
}
export function rollTechniqueLine(item, rolls = Math.random) {
  if (!lootRarityOn() || !techniqueEligible(item)) return null;
  const perMille = _techniquePerMille[item.rarity] ?? 0;
  if (!(perMille > 0)) return null;
  if (!(rolls() * 1000 < perMille)) return null;
  return addTechniqueLine(item, rolls);
}
export function techniquePass(pieces, rolls = Math.random) {
  for (const it of pieces ?? []) rollTechniqueLine(it, rolls);
}
export const techniqueDetail = (a) => (isTechniqueAffix(a) && validAffix(a) ? techniqueBrief(a.param, a.value) : '');

export const EXALTED_PER_MILLE = 100;
export const EXALTED_WORTH = 1000;
export const exaltedWorth = (item) => Math.round(EXALTED_WORTH * (isGarment(item) ? GARMENT_WORTH_SHARE : 1));
let _exaltedPerMille = EXALTED_PER_MILLE;
export function _setExaltedForTests(perMille) { _exaltedPerMille = perMille == null ? EXALTED_PER_MILLE : perMille; }

const recordLines = (item) => (item?.legendary ? (legendaryById(item.legendary)?.affixes.length ?? null) : null);
export function affixBand(item, i) {
  const a = item?.affixes?.[i];
  if (!validAffix(a)) return null;
  if (a.gem != null) return null;
  if (item.rarity === 'magic' || item.rarity === 'rare') return AFFIX_RANGES[a.id][item.rarity];
  if (item.rarity === 'legendary' && isTechniqueAffix(a)) return AFFIX_RANGES.technique.legendary;
  if (item.rarity === 'legendary' && (item.exalted === true || isCursed(item))) {
    const own = recordLines(item);
    return own != null && i >= own ? AFFIX_RANGES[a.id].legendary : null;
  }
  return null;
}
export function affixLine(item, i) {
  const label = affixLabel(item?.affixes?.[i]);
  if (!label) return '';
  const gem = item.affixes[i].gem;
  if (gem != null) return `${GEM_NAMES[gem] ?? 'Gem'}: ${label}`;
  const band = affixBand(item, i);
  return band ? `${label} [${band[0]}-${band[1]}]` : label;
}
export const SURVIVAL_OFF_NOTE = ' (survival off)';
export const asleepNote = (a) => (AFFIX_KINDS[a?.id]?.survival && !survivalOn() ? SURVIVAL_OFF_NOTE : '');
export function isPerfect(item) {
  if (item?.rarity !== 'rare' || !Array.isArray(item.affixes) || !item.affixes.length) return false;
  if (item.affixes.some((a) => a?.gem != null)) return isPerfect({ ...item, affixes: item.affixes.filter((a) => a?.gem == null) });
  return item.affixes.every((a, i) => { const b = affixBand(item, i); return !!b && a.value === b[1]; });
}
export const CURSED_WORD = 'Cursed ';
export const DAMNED_WORD = 'Damned ';
export function tierLabel(item) {
  const tier = rarityOf(item);
  if (tier === 'legendary' && item?.exalted === true) return 'Exalted Legendary';
  const cursed = isCursed(item) && identified(item) ? (isDamned(item) ? DAMNED_WORD : CURSED_WORD) : '';
  if (tier === 'rare' && isPerfect(item) && identified(item)) return `${cursed}Perfect Rare`;
  return `${cursed}${RARITIES[tier].label}`;
}
export function exaltLegendary(item, rolls = Math.random) {
  if (item?.rarity !== 'legendary' || item.exalted === true || !Array.isArray(item.affixes)) return false;
  const kinds = AFFIX_IDS.filter((id) => AFFIX_KINDS[id].groups.includes(item.group));
  const carried = new Set(item.affixes.map((a) => a?.id));
  const freeParams = (id) => kindParams(id, item).filter((p) => !item.affixes.some((a) => a?.id === id && a.param === p));
  let pool = kinds.filter((id) => !carried.has(id));
  if (!pool.length) pool = kinds.filter((id) => AFFIX_KINDS[id].params && freeParams(id).length);
  if (!pool.length) return false;
  const id = pickByLines(pool, (k) => drawWeight(k, item, item.affixes), rolls);
  const [lo, hi] = AFFIX_RANGES[id].legendary;
  const value = rangeInt(Math.ceil((lo + hi) / 2), hi, rolls);
  const k = AFFIX_KINDS[id];
  const free = carried.has(id) ? freeParams(id) : kindParams(id, item);
  const line = k.params ? { id, param: isGarment(item) ? lineParam(item, id, free, rolls) : pick(free, rolls), value } : { id, value };
  item.affixes = withLine(item.affixes, line);
  item.exalted = true;
  item.value = (Number.isFinite(item.value) ? item.value : itemBaseValue(item)) + exaltedWorth(item) + affixesWorth([line], item);
  return true;
}
export function rollExalted(item, rolls = Math.random, on = lootRarityOn()) {
  if (!on || item?.rarity !== 'legendary' || item.exalted === true) return false;
  if (!(rolls() * 1000 < _exaltedPerMille)) return false;
  return exaltLegendary(item, rolls);
}
export const CURSE_IN = 12;
let _curseIn = CURSE_IN;
export function _setCurseForTests(n) { _curseIn = n == null ? CURSE_IN : n; }
// Only drawbacks the game reads live; item-maker-only and inert classic rows are left out so no line is dead.
export const CURSE_DRAWBACKS = Object.freeze([
  Object.freeze({ type: T.BadRepWith, params: Object.freeze([0, 1, 2, 3, 4]) }),
  Object.freeze({ type: T.BadReactionsFrom, params: Object.freeze([0, 1, 2]) }),
  Object.freeze({ type: T.ItemDeteriorates, params: Object.freeze([2]), metal: Object.freeze([1, 2]) }),
  Object.freeze({ type: T.UserTakesDamage, params: Object.freeze([1]) }),
  Object.freeze({ type: T.LowDamageVs, params: Object.freeze([0, 1, 2, 3]), groups: Object.freeze(['Weapons']) }),
  Object.freeze({ type: T.HealthLeech, params: Object.freeze([1]), groups: Object.freeze(['Weapons']) }),
]);
const CURSE_METAL = Object.freeze(['Weapons', 'Armor']);
export function curseParams(row, item) {
  if (row.groups && !row.groups.includes(item?.group)) return [];
  const own = Array.isArray(item?.enchantments) ? item.enchantments : [];
  const lines = Array.isArray(item?.affixes) ? item.affixes : [];
  const params = row.metal && CURSE_METAL.includes(item?.group) ? row.metal : row.params;
  return params.filter((p) => !own.some((e) => (row.type === T.BadRepWith && e?.type === T.GoodRepWith && (e.param === p || e.param === 5))
    || (row.type === T.LowDamageVs && e?.type === T.PotentVs && e.param === p))
    && !lines.some((a) => (row.type === T.BadRepWith && a?.id === 'standing' && a.param === STANDING_GROUPS[p])
      || (row.type === T.LowDamageVs && a?.id === 'slayer' && a.param === SLAYER_FOES[p])));
}
export const isCursed = (item) => !!item?.cursed && typeof item.cursed === 'object';
export const DAMNED_IN = 4;
export const DAMNED_DRAWBACK = Object.freeze({ type: T.HealthLeech, param: 0 });
export const isDamned = (item) => isCursed(item) && item.cursed.type === DAMNED_DRAWBACK.type && item.cursed.param === DAMNED_DRAWBACK.param;
const damnable = (item) => item?.rarity === 'legendary' && item.group === 'Weapons';
export function cursePiece(item, rolls = Math.random, { damned = false } = {}) {
  if ((item?.rarity !== 'rare' && item?.rarity !== 'legendary') || item.exalted === true || isCursed(item) || !Array.isArray(item.affixes)) return false;
  const numbers = AFFIX_IDS.filter((id) => !AFFIX_KINDS[id].proc && AFFIX_KINDS[id].groups.includes(item.group));
  const carried = new Set(item.affixes.map((a) => a?.id));
  const unclaimed = (id) => kindParams(id, item).filter((p) => !item.affixes.some((a) => a?.id === id && a.param === p));
  let pool = numbers.filter((id) => !carried.has(id));
  if (!pool.length) pool = numbers.filter((id) => AFFIX_KINDS[id].params && unclaimed(id).length);
  const rows = CURSE_DRAWBACKS.filter((row) => curseParams(row, item).length);
  if (!pool.length || !rows.length) return false;
  const id = pickByLines(pool, (k) => drawWeight(k, item, item.affixes), rolls);
  const [lo, hi] = AFFIX_RANGES[id][item.rarity];
  const top = Math.ceil((lo + hi) / 2);
  const value = rangeInt(top, hi, rolls);
  const line = AFFIX_KINDS[id].params ? { id, param: lineParam(item, id, carried.has(id) ? unclaimed(id) : kindParams(id, item), rolls), value } : { id, value };
  const lined = { ...item, affixes: [...item.affixes, line] };
  const row = pick(CURSE_DRAWBACKS.filter((r) => curseParams(r, lined).length), rolls);
  const drawback = { type: row.type, param: pick(curseParams(row, lined), rolls) };
  item.affixes = withLine(item.affixes, line);
  item.enchantments = [...(Array.isArray(item.enchantments) ? item.enchantments : []), { ...drawback }];
  item.cursed = drawback;
  item.value = (Number.isFinite(item.value) ? item.value : itemBaseValue(item)) + affixesWorth([line], item);
  if (damned) damnPiece(item);
  return true;
}
export function damnPiece(item) {
  if (!damnable(item) || !isCursed(item) || isDamned(item) || !Array.isArray(item.affixes) || !item.affixes.length) return false;
  const old = item.affixes.at(-1);
  const line = { ...old, value: AFFIX_RANGES[old.id].legendary[1] };
  const c = item.cursed;
  const list = Array.isArray(item.enchantments) ? item.enchantments : [];
  let at = -1;
  for (let i = list.length - 1; i >= 0 && at < 0; i--) if (list[i]?.type === c.type && list[i]?.param === c.param) at = i;
  if (at < 0) return false;
  item.affixes = [...item.affixes.slice(0, -1), line];
  item.enchantments = list.map((e, i) => (i === at ? { ...DAMNED_DRAWBACK } : e));
  item.cursed = { ...DAMNED_DRAWBACK };
  item.value = (Number.isFinite(item.value) ? item.value : itemBaseValue(item)) + affixesWorth([line], item) - affixesWorth([old], item);
  return true;
}
export function damnPass(pieces, rolls = Math.random) {
  const damned = [];
  if (!lootRarityOn()) return damned;
  for (const it of pieces ?? []) {
    if (!damnable(it) || !isCursed(it) || isDamned(it)) continue;
    if (rolls() * DAMNED_IN >= DAMNED_IN - 1 && damnPiece(it)) damned.push(it);
  }
  return damned;
}
export function cursePass(pieces, rolls = Math.random) {
  const cursed = [];
  if (!lootRarityOn()) return cursed;
  for (const it of pieces ?? []) {
    if ((it?.rarity !== 'rare' && it?.rarity !== 'legendary') || it.exalted === true || isCursed(it)) continue;
    if (rolls() * _curseIn < 1 && cursePiece(it, rolls)) cursed.push(it);
  }
  return cursed;
}
export function validCurse(item) {
  if (item?.cursed == null) return true;
  const c = item.cursed;
  if (!isCursed(item) || (item.rarity !== 'rare' && item.rarity !== 'legendary') || item.exalted === true) return false;
  const carried = Array.isArray(item.enchantments) && item.enchantments.some((e) => e?.type === c.type && e?.param === c.param);
  if (isDamned(item)) return damnable(item) && carried;
  const row = CURSE_DRAWBACKS.find((r) => r.type === c.type);
  if (!row || (row.groups && !row.groups.includes(item.group))) return false;
  if (!(row.metal && CURSE_METAL.includes(item.group) ? row.metal : row.params).includes(c.param)) return false;
  return carried;
}
export function curseLine(item) {
  if (!isCursed(item)) return '';
  const key = Object.keys(T).find((k) => T[k] === item.cursed.type);
  if (!key) return '';
  const param = enchantmentParamName(key, item.cursed.param);
  return param && param !== 'None' ? `${enchantmentName(key)}: ${param}` : enchantmentName(key);
}
export const SOCKET_PER_MILLE = Object.freeze({ rare: 150, legendary: 300 });
let _socketPerMille = null;
export function _setSocketForTests(perMille) { _socketPerMille = perMille; }
export const SOCKET_GROUPS = Object.freeze(['Weapons', 'Armor', 'Jewellery']);
export const SOCKET_EMPTY = 'empty';
export { GEM_IDS, GEM_GRADES, GEM_GRADE_WORDS, GEM_ROW_GRADES, GEM_GRADE_TEMPLATE_BASE, GEM_GRADE_TEMPLATES, gemId, ALL_GEM_IDS, gemKind, gemGrade, GEM_NAMES, gemTemplateOf };
export const SOCKET_VALUES = Object.freeze([SOCKET_EMPTY, ...ALL_GEM_IDS]);
const graded = (id, param, values) => Object.freeze({ id, param, values: Object.freeze(values) });
export const GEM_GRADE_LINES = Object.freeze({
  ruby: Object.freeze({ weapon: graded('elemental', 'fire', [1, 2, 3, 4, 6]), other: graded('resist', 'fire', [4, 7, 10, 15, 20]) }),
  emerald: Object.freeze({ weapon: graded('leech', null, [1, 2, 3, 5, 7]), other: graded('resist', 'poison', [4, 7, 10, 15, 20]) }),
  sapphire: Object.freeze({ weapon: graded('elemental', 'frost', [1, 2, 3, 4, 6]), other: graded('resist', 'frost', [4, 7, 10, 15, 20]) }),
  diamond: Object.freeze({ weapon: graded('damage', null, [2, 4, 6, 9, 12]), other: graded('resist', 'magic', [4, 7, 10, 15, 20]) }),
  jade: Object.freeze({ weapon: graded('stat', 'willpower', [1, 2, 4, 6, 8]), other: graded('stat', 'willpower', [1, 2, 4, 6, 8]) }),
  turquoise: Object.freeze({ weapon: graded('stat', 'agility', [1, 2, 4, 6, 8]), other: graded('stat', 'personality', [1, 2, 4, 6, 8]) }),
  malachite: Object.freeze({ weapon: graded('stat', 'strength', [1, 2, 4, 6, 8]), other: graded('stat', 'endurance', [1, 2, 4, 6, 8]) }),
  amber: Object.freeze({ weapon: graded('stat', 'speed', [1, 2, 4, 6, 8]), other: graded('stat', 'luck', [1, 2, 3, 4, 6]) }),
});
const gradeLine = (row, grade) => ({ id: row.id, ...(row.param ? { param: row.param } : {}), value: row.values[GEM_GRADES.indexOf(grade)] });
export const GEM_LINES = Object.freeze(Object.fromEntries(GEM_IDS.map((k) => [k, Object.freeze({
  weapon: Object.freeze(gradeLine(GEM_GRADE_LINES[k].weapon, 'plain')), other: Object.freeze(gradeLine(GEM_GRADE_LINES[k].other, 'plain')) })])));
export function gemKindOf(item) {
  if (item?.group !== 'Gems' || !Number.isInteger(item.templateIndex)) return null;
  if (item.templateIndex < GEM_IDS.length) return GEM_IDS[item.templateIndex] ?? null;
  const at = GEM_GRADE_TEMPLATES.indexOf(item.templateIndex);
  return at < 0 ? null : ALL_GEM_IDS[GEM_IDS.length + at];
}
export const WEAPON_SOCKETS = Object.freeze({ short: 1, one: 2, two: 3 });
// Reads the hands table without the bow-hand setting, so the socket count never changes with a setting.
export function socketMax(item) {
  if (!SOCKET_GROUPS.includes(item?.group)) return 0;
  if (item.group !== 'Weapons') return 1;
  if (isAmmunition(item)) return 0;
  const t = item.templateIndex;
  if (weaponSkillUsed(t) === SKILLS.ShortBlade) return WEAPON_SOCKETS.short;
  return WEAPON_HANDS[t] === 'Both' ? WEAPON_SOCKETS.two : WEAPON_SOCKETS.one;
}
export function socketCap(item) {
  const max = socketMax(item);
  if (item?.rarity === 'rare' || item?.rarity === 'legendary') return max;
  return item?.rarity === 'magic' && item.group === 'Weapons' ? Math.min(1, max) : 0;
}
// Older saves carry one socket string; it reads as a list of one, and the first write replaces it with a list.
export function socketsOf(item) {
  if (Array.isArray(item?.sockets)) return item.sockets;
  return SOCKET_VALUES.includes(item?.socket) ? [item.socket] : [];
}
function writeSockets(item, list) {
  item.sockets = list;
  delete item.socket;
}
export const hasSocket = (item) => socketsOf(item).length > 0;
export function socketGem(item, at = null) {
  const list = socketsOf(item);
  const v = at == null ? list.find(isGemId) : list[at];
  return isGemId(v) ? v : null;
}
export const socketGems = (item) => socketsOf(item).filter(isGemId);
export const emptySockets = (item) => socketsOf(item).filter((v) => v === SOCKET_EMPTY).length;
export function gemLine(item, gem) {
  const row = GEM_GRADE_LINES[gemKind(gem)];
  return row ? { ...gradeLine(item?.group === 'Weapons' ? row.weapon : row.other, gemGrade(gem)), gem } : null;
}
export function socketPass(pieces, rolls = Math.random) {
  const given = [];
  if (!lootRarityOn()) return given;
  for (const it of pieces ?? []) {
    const perMille = SOCKET_PER_MILLE[it?.rarity] == null ? 0 : (_socketPerMille ?? SOCKET_PER_MILLE[it.rarity]);
    if (!perMille || !SOCKET_GROUPS.includes(it.group) || hasSocket(it) || !socketCap(it)) continue;
    if (rolls() * 1000 < perMille) { writeSockets(it, [SOCKET_EMPTY]); given.push(it); }
  }
  return given;
}
export const WEAPON_SOCKET_PER_MILLE = Object.freeze({ magic: 120, rare: 250, legendary: 400 });
export const MORE_SOCKET_PER_MILLE = Object.freeze({ rare: 300, legendary: 450 });
let _weaponSockets = null;
export function _setWeaponSocketsForTests(t) { _weaponSockets = t; }
export function weaponSocketPass(pieces, rolls = Math.random) {
  const given = [];
  if (!lootRarityOn()) return given;
  for (const it of pieces ?? []) {
    const cap = it?.group === 'Weapons' ? socketCap(it) : 0;
    if (!cap) continue;
    const list = [...socketsOf(it)];
    const first = _weaponSockets?.first ?? WEAPON_SOCKET_PER_MILLE[it.rarity] ?? 0;
    const more = _weaponSockets?.more ?? MORE_SOCKET_PER_MILLE[it.rarity] ?? 0;
    let gave = false;
    if (!list.length) {
      if (!(first > 0) || !(rolls() * 1000 < first)) continue;
      list.push(SOCKET_EMPTY);
      gave = true;
    }
    while (list.length < cap && more > 0 && rolls() * 1000 < more) { list.push(SOCKET_EMPTY); gave = true; }
    if (gave) { writeSockets(it, list); given.push(it); }
  }
  return given;
}
function layGemLines(item) {
  const own = (Array.isArray(item.affixes) ? item.affixes : []).filter((a) => a?.gem == null);
  item.affixes = [...own, ...socketGems(item).map((g) => gemLine(item, g))];
}
// A set gem adds what the loose gem costs, never the worth of its line, so cheap gems cannot inflate a price.
const gemWorth = (gem) => itemBaseValue({ group: 'Gems', templateIndex: gemTemplateOf(gem) });
/** @param {unknown} gem */
export const gemWorthOf = (gem) => (isGemId(gem) ? gemWorth(gem) : 0);
export function setGem(item, gem, at = null) {
  const list = socketsOf(item);
  const i = at == null ? list.indexOf(SOCKET_EMPTY) : at;
  if (list[i] !== SOCKET_EMPTY || !isGemId(gem)) return null;
  const line = /** @type {any} */ (gemLine(item, gem));
  writeSockets(item, list.map((v, j) => (j === i ? gem : v)));
  layGemLines(item);
  item.value = (Number.isFinite(item.value) ? item.value : itemBaseValue(item)) + gemWorth(gem);
  return line;
}
export function unsetGem(item, at = null) {
  const list = socketsOf(item);
  const i = at == null ? list.findIndex(isGemId) : at;
  const gem = isGemId(list[i]) ? list[i] : null;
  if (!gem) return null;
  const line = gemLine(item, gem);
  // A gem in the old socket string was priced by the worth of its line, so removing it takes that worth off.
  const legacy = item.sockets == null && item.socket != null;
  writeSockets(item, list.map((v, j) => (j === i ? SOCKET_EMPTY : v)));
  layGemLines(item);
  item.value = (Number.isFinite(item.value) ? item.value : itemBaseValue(item)) - (legacy ? affixesWorth([line], item) : gemWorth(gem));
  return gem;
}
export function validSocket(item) {
  const gems = (Array.isArray(item?.affixes) ? item.affixes : []).filter((a) => a?.gem != null);
  if (item?.socket == null && item?.sockets == null) return gems.length === 0;
  if (item.socket != null && item.sockets != null) return false;
  const list = item.sockets != null ? item.sockets : [item.socket];
  if (!Array.isArray(list)) return false;
  if (!list.length) return gems.length === 0;
  if (list.length > socketCap(item) || !list.every((v) => SOCKET_VALUES.includes(v))) return false;
  const set = list.filter(isGemId);
  if (gems.length !== set.length) return false;
  return set.every((g, i) => {
    const want = gemLine(item, g);
    const a = gems[i];
    return !!want && a.gem === g && a.id === want.id && a.param === want.param && a.value === want.value;
  });
}
export function socketLine(item) {
  const n = emptySockets(item);
  return n === 1 ? 'Socket: empty' : n > 1 ? `Sockets: ${n} empty` : null;
}
export const gemPieceCap = (id) => AFFIX_RANGES[id]?.rare[1] ?? 0;
export function readLines(item) {
  const list = Array.isArray(item?.affixes) ? item.affixes : [];
  if (!list.some((a) => a?.gem != null)) return list;
  const used = new Map();
  return list.map((a) => {
    if (a?.gem == null || !validAffix(a)) return a;
    const key = `${a.id}:${a.param ?? ''}`;
    const value = Math.min(a.value, Math.max(0, gemPieceCap(a.id) - (used.get(key) ?? 0)));
    used.set(key, (used.get(key) ?? 0) + value);
    return value === a.value ? a : { ...a, value };
  });
}
export function gemCapLine(item) {
  const read = readLines(item);
  const held = (Array.isArray(item?.affixes) ? item.affixes : []).find((a, i) => a?.gem != null && read[i] !== a);
  return held ? `Gems: ${affixLabel({ id: held.id, ...(held.param != null ? { param: held.param } : {}), value: gemPieceCap(held.id) })} at most` : null;
}
function reforgePool(item, index) {
  const old = item.affixes[index];
  const was = AFFIX_KINDS[old.id];
  const others = item.affixes.filter((a, i) => i !== index && a?.gem == null);
  const freeParams = (id) => kindParams(id, item).filter((p) => !others.some((a) => a?.id === id && a.param === p));
  const ids = (was.technique ? ['technique'] : AFFIX_IDS).filter((id) => {
    const k = AFFIX_KINDS[id];
    if (id === old.id || !k.groups.includes(item.group) || !!k.proc !== !!was.proc) return false;
    return k.params ? freeParams(id).length > 0 : !others.some((a) => a?.id === id);
  });
  return { ids, others, freeParams };
}
export function reforgeableLines(item) {
  const list = Array.isArray(item?.affixes) ? item.affixes : [];
  let lines = [];
  if (item?.rarity === 'magic' || item?.rarity === 'rare') lines = list.map((_, i) => i);
  else if (item?.rarity === 'legendary' && item.exalted === true && list.length) lines = [list.filter((a) => a?.gem == null).length - 1];
  if (lines.length === 1 && item?.rarity === 'legendary' && isTechniqueAffix(list[lines[0]])) lines = [lines[0] - 1];
  return lines.filter((i) => validAffix(list[i]) && list[i].gem == null && reforgePool(item, i).ids.length > 0);
}
export const REFORGES_MAX = 31;
export const reforgeCount = (item) => (Number.isInteger(item?.reforges) && item.reforges > 0 ? item.reforges : Number.isInteger(item?.reforged) ? 1 : 0);
export function reforgeChoices(item, index) {
  if (!reforgeableLines(item).includes(index)) return [];
  const { ids, freeParams } = reforgePool(item, index);
  return ids.flatMap((id) => {
    const [low, high] = AFFIX_RANGES[id][item.rarity];
    const value = item.rarity === 'legendary' ? Math.ceil((low + high) / 2) : low;
    return AFFIX_KINDS[id].params
      ? freeParams(id).map((param) => ({ id, param, value }))
      : [{ id, value }];
  });
}

export function reforgeAffix(item, index, choice) {
  const line = reforgeChoices(item, index).find((a) => a.id === choice?.id && a.param === choice?.param);
  if (!line) return null;
  const old = item.affixes[index];
  const tier = item.rarity;
  const count = Math.min(REFORGES_MAX, reforgeCount(item) + 1);
  item.affixes = item.affixes.map((a, i) => (i === index ? line : a));
  item.reforges = count;
  delete item.reforged;
  if (tier !== 'legendary') item.name = linesName(item, tier);
  item.value = (Number.isFinite(item.value) ? item.value : itemBaseValue(item)) - affixesWorth([old], item) + affixesWorth([line], item);
  return line;
}
export function honeableLines(item) {
  const takes = item?.rarity === 'magic' || item?.rarity === 'rare' || (item?.rarity === 'legendary' && item.exalted === true);
  if (!takes || !Array.isArray(item.affixes)) return [];
  return item.affixes.map((_, i) => i).filter((i) => { const b = affixBand(item, i); return !!b && item.affixes[i].value < b[1]; });
}
export function honeAffix(item, index) {
  if (!honeableLines(item).includes(index)) return null;
  const old = item.affixes[index];
  const band = /** @type {number[]} */ (affixBand(item, index));
  const line = { ...old, value: band[1] };
  item.affixes = item.affixes.map((a, i) => (i === index ? line : a));
  item.honed = (item.honed | 0) + 1;
  const was = Number.isFinite(item.value) ? item.value : itemBaseValue(item);
  item.value = was + affixesWorth([line], item) - affixesWorth([old], item);
  return line;
}
export const CHAMPION_SOURCE = Object.freeze({ tier: 2, quality: 1.25, ladder: 0.5 });
export const championSource = (source, qualityMult = 1) => ({
  ...source,
  qualityMult,
  ladder: CHAMPION_SOURCE.ladder,
  legendaryTier: source.tier + CHAMPION_SOURCE.tier,
  legendaryQuality: qualityMult * CHAMPION_SOURCE.quality,
});
// Roll the carried loot on a copy, never the worn kit; what the roll adds past the carried pieces goes on the body.
export function rollCorpseLoot(entity, basics, { rolls = Math.random, luck = 50, qualityMult = 1, weights = null, find = undefined, level = undefined } = {}) {
  if (!lootRarityOn() || !entity) return entity?.items ?? [];
  const worn = new Set(entity.equip ? equipTableOf(entity).filter(Boolean) : []);
  const loot = (entity.items ?? []).filter((it) => it && !worn.has(it));
  const carried = loot.length;
  const source = corpseSource(basics, entity.level, entity.mobileType);
  const champ = typeof entity.champion === 'string' && entity.champion !== '';
  rollLootRarity(loot, champ ? championSource(source, qualityMult) : { ...source, qualityMult, ...(weights ? { weights } : {}) }, { rolls, luck, find, level });
  if (loot.length > carried) (entity.items ??= []).push(...loot.slice(carried));
  return entity.items;
}
export function stampWonWeapons(items, fighters = 1, { rolls = Math.random } = {}) {
  if (!sigilOnline() || !lootRarityOn() || !Array.isArray(items)) return 0;
  let n = 0;
  const fresh = [];
  for (const it of items) {
    if (!it || it.group !== 'Weapons' || isAmmunition(it) || it.questItem || it.sigil) continue;
    const tier = rarityOf(it);
    if (!SIGIL_BANDS[tier]) continue;
    const s = rollSigil(tier, fighters, rolls);
    if (s) { it.sigil = s; n++; fresh.push(it); }
  }
  for (const it of fresh) { const set = rollSetJoin(rolls); if (set) it.sigil = { ...it.sigil, set }; }
  for (const it of items) {
    if (!it || it.questItem || it.sigil) continue;
    const kind = setPieceKind(it);
    if (kind !== 'armor' && kind !== 'shield') continue;
    const s = rollSetSigil(rarityOf(it), fighters, rolls);
    if (s) { it.sigil = s; n++; }
  }
  return n;
}

export function bestRarity(items) {
  let best = null;
  for (const it of items ?? []) {
    const r = rarityOf(it);
    if (!best || RARITIES[r].rank > RARITIES[best].rank) best = r;
  }
  return best;
}

function wornItems(entity) {
  const slots = entity?.equip?.slots;
  if (slots) return slots.filter((it) => it && Array.isArray(it.affixes) && it.affixes.length);
  return (entity?.items ?? []).filter((it) => it && it.equipSlot != null && Array.isArray(it.affixes) && it.affixes.length);
}

// The weapon damage line is not folded; it applies through the weapon damage modifier registered below.
export function affixFold(entity) {
  if (!entity || !lootRarityOn()) return EMPTY_MODS;
  const mods = newMods();
  const rolledResist = {};
  for (const it of wornItems(entity)) {
    const rolled = ROLLED_TIERS.includes(it.rarity);
    for (const a of readLines(it)) {
      if (!validAffix(a)) continue;
      const v = a.value | 0;
      switch (a.id) {
        // Armor lines apply to the piece's own body parts, as material armor does.
        case 'armor': for (const part of armorBodyParts(it)) mods.armorParts[part] += v; break;
        case 'weight': mods.weightMult += v / 100; break;
        case 'stat': mods.stats[a.param] = (mods.stats[a.param] ?? 0) + v; break;
        case 'skill': mods.skills[a.param] = (mods.skills[a.param] ?? 0) + v; break;
        case 'resist':
          if (rolled) rolledResist[a.param] = (rolledResist[a.param] ?? 0) + v;
          else mods.resist[a.param] = (mods.resist[a.param] ?? 0) + v;
          break;
        case 'standing': { const g = STANDING_GROUPS.indexOf(a.param); if (g >= 0) mods.standing[g] += v; break; }
        case 'warmth': mods.warmth += v; break;
        case 'dry': mods.dry += v; break;
        default: break;
      }
    }
  }
  for (const [el, v] of Object.entries(rolledResist)) mods.resist[el] = (mods.resist[el] ?? 0) + rolledCounts(v, mods.resist[el] ?? 0);
  return mods;
}
// With the saving throw base of 50, rolled lines capped at 45 per element never make a body immune alone.
export const RESIST_CAP = 45;
const rolledCounts = (rolled, own) => Math.min(rolled, Math.max(0, RESIST_CAP - own));
function resistSplit(pieces, element) {
  let rolled = 0, own = 0;
  for (const p of pieces) {
    const pts = readLines(p).reduce((n, a) => n + (validAffix(a) && a.id === 'resist' && a.param === element ? a.value : 0), 0);
    if (ROLLED_TIERS.includes(p.rarity)) rolled += pts; else own += pts;
  }
  return { rolled, own };
}
export function rolledResistOf(entity, element) {
  if (!entity || !lootRarityOn()) return { worn: 0, counts: 0 };
  const { rolled, own } = resistSplit(wornItems(entity).filter(identified), element);
  return { worn: rolled, counts: rolledCounts(rolled, own) };
}
export function lineComparison(entity, item, replaces = []) {
  if (!lootRarityOn() || !item || !identified(item)) return null;
  const known = (replaces ?? []).filter((r) => r && r !== item && identified(r));
  if (!known.length) return null;
  const key = (a) => `${a.id}:${a.param ?? ''}`;
  const mine = readLines(item).filter(validAffix);
  const theirs = known.flatMap((r) => readLines(r).filter(validAffix));
  const sumIn = (list, k) => list.reduce((n, a) => n + (key(a) === k ? a.value : 0), 0);
  const carried = new Set(theirs.map(key));
  const own = new Set(mine.map(key));
  const rows = [...own].map((k) => {
    const a = mine.find((x) => key(x) === k);
    const value = sumIn(mine, k);
    const row = { text: AFFIX_KINDS[a.id].label({ ...a, value }), delta: carried.has(k) ? value - sumIn(theirs, k) : null, resist: null };
    if (a.id === 'resist') {
      const now = rolledResistOf(entity, a.param);
      const worn = resistSplit(wornItems(entity).filter(identified), a.param), out = resistSplit(known, a.param), inn = resistSplit([item], a.param);
      const rolledThen = Math.max(0, worn.rolled - out.rolled + inn.rolled);
      row.resist = { now: now.counts, then: rolledCounts(rolledThen, Math.max(0, worn.own - out.own + inn.own)) };
    }
    return row;
  });
  const lost = [...carried].filter((k) => !own.has(k)).map((k) => {
    const a = theirs.find((x) => key(x) === k);
    return affixLabel({ ...a, value: Math.min(sumIn(theirs, k), AFFIX_RANGES[a.id].legendary[1]) });
  });
  return { rows, lost };
}
export function affixWeaponDamage(weapon, damage) {
  if (!lootRarityOn() || !Array.isArray(weapon?.affixes)) return damage;
  const pct = readLines(weapon).reduce((n, a) => n + (a.id === 'damage' ? (a.value | 0) : 0), 0);
  return pct ? Math.trunc(damage * (1 + pct / 100)) : damage;
}
export const LOOT_RARITY_FOLD = 'lootRarity';
registerEntityFold(LOOT_RARITY_FOLD, affixFold);
registerWeaponDamageMod(LOOT_RARITY_FOLD, affixWeaponDamage);

// A local copy of the classic identified rule, since tradeModes.js imports this file.
const identified = (item) => !enchanted(item) || item?.isIdentified === true;
export const rarityKnown = (item) => identified(item);
export function techniqueCardView(item) {
  if (!lootRarityOn() || !item || rarityOf(item) === 'common' || !identified(item)) return null;
  const line = techniqueLineOf(item);
  const parts = line ? techniqueParts(line.param, line.value) : null;
  if (!parts) return null;
  return { id: line.param, name: techniqueById(line.param).name, value: line.value, band: affixBand(item, item.affixes.indexOf(line)),
    base: techniqueById(line.param).base, ...parts };
}

// aetheric.js registers its lore here because it imports this file.
let _aethericLore = null;
export function registerAethericLore(fn) { _aethericLore = typeof fn === 'function' ? fn : null; }
export function rarityLines(item, { sigil = true, set = true, lore = true, technique = true } = {}) {
  if (!lootRarityOn() || !item) return [];
  const tier = rarityOf(item);
  if (tier === 'common') return [];
  const out = [tierLabel(item)];
  if (!identified(item)) { out.push('Unidentified'); return [...out, ...(sigil ? setSigilLines(item) : []), ...(set ? setLines(item) : [])]; }
  const blocked = technique ? null : techniqueLineOf(item);
  (item.affixes ?? []).forEach((a, i) => {
    if (blocked && a === blocked) return;
    out.push(affixLine(item, i) + asleepNote(a));
    const d = techniqueDetail(a);
    if (d) out.push(d);
  });
  if (item.rarity && Array.isArray(item.enchantments)) {
    for (const e of item.enchantments) {
      if (!e || e.type === T.None) continue;
      const key = Object.keys(T).find((k) => T[k] === e.type);
      const param = key ? enchantmentParamName(key, e.param) : null;
      out.push(param && param !== 'None' ? `${enchantmentName(key)}: ${param}` : enchantmentName(key ?? ''));
    }
  }
  { const s = socketLine(item); if (s) out.push(s); }
  { const c = gemCapLine(item); if (c) out.push(c); }
  { const p = item.legendary ? powerOf(item.legendary) : item.gilded ? powerOf(item.gilded) : null; if (p) out.push(powerLine(p)); }
  { const im = imprintLine(item); if (im) out.push(im); }
  if (sigil) out.push(...setSigilLines(item));
  if (set) out.push(...setLines(item));
  const words = !lore ? null : item.legendary ? legendaryById(item.legendary)?.lore : item.aetheric ? (_aethericLore?.(item) ?? null) : item.gilded ? (_gilded?.loreOf(item) ?? null) : null;
  if (words) out.push(words);
  return out;
}
export function rarityColour(item) {
  if (!lootRarityOn()) return null;
  const tier = rarityOf(item);
  return tier === 'common' ? null : RARITIES[tier].colour;
}
export function rarityTint(item) {
  if (!lootRarityOn()) return null;
  return RARITIES[rarityOf(item)].tint;
}
export function rarityAttr(item) {
  if (!lootRarityOn()) return null;
  const tier = rarityOf(item);
  return tier === 'common' ? null : tier;
}
