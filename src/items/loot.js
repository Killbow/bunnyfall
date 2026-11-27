// Loot generation ported from classic LootTables and the ItemBuilder random-item rules.
// Magic item rolls need the MAGIC.DEF registry from setMagicItemTemplates; without it that category stays empty.
import { randomMaterial, randomArmorMaterial, createWeapon, WEAPONS_ENUM, ARMOR_ENUM } from '../combat/enemyEquipment.js';
import { customItemsForGroup } from './itemTemplates.js';
import { ARROW_TEMPLATE } from './inventory.js';
import { dice100 } from '../combat/formulas.js';
import { goldStack } from './inventory.js';
import { ITEM_TEMPLATES, mintCondition, GROUP_TEMPLATE_INDICES, templateByIndex, itemBaseValue, setItemFields } from './itemTemplates.js';
import { CLOTHING_DYES } from '../characters/dyes.js';
import { legacyEnchantmentValue, worksUnworn } from '../magic/enchantments.js';
import { wearableItem } from '../characters/equip.js';
import { validItemField, validItemFields, itemFieldsOfKind, ITEM_STR_MAX } from './itemFields.js';
import { validSetMarks } from './aetheric.js';
import { validGildedMarks } from './gilded.js';
import { validImprint, validCurse, validSocket, MAGIC_DROP_SCALE } from './lootRarity.js';
import { createRandomBook, BOOK_TEMPLATE, bookValue } from './books.js';
import { potionRecipeByKey, POTION_DEFAULT_TEXTURE_RECORD } from './potions.js';
import { RANDOM_TREASURE_ARCHIVE, RANDOM_TREASURE_ICONS, DROP_ICON_ARCHIVES, DROP_ICON_IDXS } from './lootDataTables.js';
import { themedIngredientPool } from './lootThemes.js';
import { pathOfSignatureIndex } from '../characters/arcanePaths.js';
import { getLocalizedSpellName } from '../ui/textManager.js';
import { isOnlinePage } from '../platform/onlineLane.js';
import { rriLootMatrix, rriEnemyLootTableKey, conditionBasedPricesOn, randomConditionLootItems } from '../mods/rriRealism.js';
import { RRI_VENDOR } from '../mods/rriItems.js';
import { RECEIVER_MARKS, VALUE_IS_IDENTITY_TEMPLATES, BOAT_TEMPLATES } from '../net/realmTradeLaw.js';

export const LOOT_MATRICES = Object.freeze({
  '-': { MinGold: 0, MaxGold: 0, P1: 0, P2: 0, C1: 0, C2: 0, C3: 0, M1: 0, AM: 0, WP: 0, MI: 0, CL: 0, BK: 0, M2: 0, RL: 0 },
  A: { MinGold: 1, MaxGold: 10, P1: 0, P2: 0, C1: 0, C2: 0, C3: 0, M1: 0, AM: 5, WP: 5, MI: 2, CL: 4, BK: 0, M2: 2, RL: 0 },
  B: { MinGold: 0, MaxGold: 0, P1: 10, P2: 10, C1: 0, C2: 0, C3: 0, M1: 0, AM: 0, WP: 0, MI: 0, CL: 0, BK: 0, M2: 0, RL: 0 },
  C: { MinGold: 2, MaxGold: 20, P1: 10, P2: 10, C1: 5, C2: 5, C3: 5, M1: 5, AM: 5, WP: 25, MI: 3, CL: 0, BK: 2, M2: 2, RL: 2 },
  D: { MinGold: 1, MaxGold: 4, P1: 6, P2: 6, C1: 6, C2: 6, C3: 6, M1: 6, AM: 0, WP: 0, MI: 0, CL: 0, BK: 0, M2: 0, RL: 4 },
  E: { MinGold: 20, MaxGold: 80, P1: 0, P2: 0, C1: 0, C2: 0, C3: 0, M1: 0, AM: 10, WP: 10, MI: 3, CL: 4, BK: 2, M2: 1, RL: 15 },
  F: { MinGold: 4, MaxGold: 30, P1: 2, P2: 2, C1: 5, C2: 5, C3: 5, M1: 2, AM: 50, WP: 50, MI: 1, CL: 0, BK: 0, M2: 3, RL: 0 },
  G: { MinGold: 3, MaxGold: 15, P1: 0, P2: 0, C1: 0, C2: 0, C3: 0, M1: 0, AM: 50, WP: 50, MI: 1, CL: 5, BK: 0, M2: 3, RL: 0 },
  H: { MinGold: 2, MaxGold: 10, P1: 0, P2: 0, C1: 0, C2: 0, C3: 0, M1: 0, AM: 0, WP: 100, MI: 1, CL: 2, BK: 0, M2: 0, RL: 0 },
  I: { MinGold: 0, MaxGold: 0, P1: 0, P2: 0, C1: 0, C2: 0, C3: 0, M1: 0, AM: 0, WP: 0, MI: 2, CL: 0, BK: 0, M2: 0, RL: 5 },
  J: { MinGold: 50, MaxGold: 150, P1: 0, P2: 0, C1: 0, C2: 0, C3: 0, M1: 0, AM: 5, WP: 5, MI: 3, CL: 0, BK: 0, M2: 0, RL: 0 },
  K: { MinGold: 1, MaxGold: 10, P1: 3, P2: 3, C1: 3, C2: 3, C3: 3, M1: 3, AM: 5, WP: 5, MI: 3, CL: 0, BK: 5, M2: 2, RL: 100 },
  L: { MinGold: 1, MaxGold: 20, P1: 0, P2: 0, C1: 3, C2: 3, C3: 3, M1: 3, AM: 50, WP: 50, MI: 1, CL: 75, BK: 0, M2: 5, RL: 3 },
  M: { MinGold: 1, MaxGold: 15, P1: 1, P2: 1, C1: 1, C2: 1, C3: 1, M1: 2, AM: 10, WP: 10, MI: 1, CL: 15, BK: 2, M2: 3, RL: 1 },
  N: { MinGold: 1, MaxGold: 80, P1: 5, P2: 5, C1: 5, C2: 5, C3: 5, M1: 5, AM: 5, WP: 5, MI: 1, CL: 20, BK: 5, M2: 2, RL: 5 },
  O: { MinGold: 5, MaxGold: 20, P1: 1, P2: 1, C1: 1, C2: 1, C3: 1, M1: 1, AM: 10, WP: 15, MI: 2, CL: 0, BK: 0, M2: 0, RL: 0 },
  P: { MinGold: 5, MaxGold: 20, P1: 5, P2: 5, C1: 5, C2: 5, C3: 5, M1: 5, AM: 5, WP: 10, MI: 2, CL: 0, BK: 10, M2: 5, RL: 0 },
  Q: { MinGold: 20, MaxGold: 80, P1: 2, P2: 2, C1: 8, C2: 8, C3: 8, M1: 2, AM: 10, WP: 25, MI: 3, CL: 35, BK: 5, M2: 3, RL: 0 },
  R: { MinGold: 5, MaxGold: 20, P1: 0, P2: 0, C1: 3, C2: 3, C3: 3, M1: 5, AM: 5, WP: 15, MI: 2, CL: 0, BK: 0, M2: 0, RL: 0 },
  S: { MinGold: 50, MaxGold: 125, P1: 5, P2: 5, C1: 5, C2: 5, C3: 5, M1: 15, AM: 10, WP: 10, MI: 3, CL: 0, BK: 5, M2: 5, RL: 0 },
  T: { MinGold: 20, MaxGold: 80, P1: 0, P2: 0, C1: 0, C2: 0, C3: 0, M1: 0, AM: 100, WP: 100, MI: 1, CL: 0, BK: 0, M2: 0, RL: 0 },
  U: { MinGold: 7, MaxGold: 30, P1: 5, P2: 5, C1: 5, C2: 5, C3: 5, M1: 10, AM: 10, WP: 10, MI: 2, CL: 0, BK: 2, M2: 2, RL: 10 },
});

const LOOT_GROUP_KEYS = Object.freeze([
  'PlantIngredients1', 'PlantIngredients2',
  'CreatureIngredients1', 'CreatureIngredients2', 'CreatureIngredients3',
  'MiscellaneousIngredients1', 'MiscellaneousIngredients2',
  'ReligiousItems', 'Gems', 'Jewellery', 'MensClothing', 'WomensClothing',
]);
export const ITEM_GROUPS = Object.freeze(Object.fromEntries(
  LOOT_GROUP_KEYS.map((k) => [k, GROUP_TEMPLATE_INDICES[k]])));
export { BOOK_TEMPLATE };

export { RANDOM_TREASURE_ARCHIVE, RANDOM_TREASURE_ICONS, DROP_ICON_ARCHIVES, DROP_ICON_IDXS };
export const RANDOM_TREASURE_MARKER_RECORD = 19;

export const DUNGEON_LOOT_KEYS = Object.freeze(['K', 'N', 'N', 'N', 'K', 'M', 'M', 'Q', 'K', 'U', 'D', 'N', 'L', 'F', 'S', 'N', 'M', 'L', 'N']);

const WEAPON_NAMES = Object.keys(WEAPONS_ENUM);
const ARMOR_PIECES = Object.values(ARMOR_ENUM);

export function createRandomWeapon(playerLevel, rolls = Math.random) {
  const customs = customItemsForGroup('Weapons');
  const groupIndex = Math.floor(rolls() * (19 + customs.length));
  // Classic draws the material for every slot before the arrow test, so arrows spend that draw too.
  const material = randomMaterial(playerLevel, rolls);
  if (groupIndex >= 19) return { group: 'Weapons', ...createWeapon(customs[groupIndex - 19], material) };
  if (groupIndex === 18) return createWeapon(ARROW_TEMPLATE, 0, rolls);
  const name = WEAPON_NAMES[groupIndex];
  return { group: 'Weapons', ...createWeapon(WEAPONS_ENUM[name], material) };
}

export function createRandomArmor(playerLevel, rolls = Math.random) {
  const customs = customItemsForGroup('Armor');
  const i = Math.floor(rolls() * (ARMOR_PIECES.length + customs.length));
  const piece = i < ARMOR_PIECES.length ? ARMOR_PIECES[i] : customs[i - ARMOR_PIECES.length];
  return setItemFields({ group: 'Armor', templateIndex: piece, material: randomArmorMaterial(playerLevel, rolls) });
}

const pick = (list, rolls) => list[Math.floor(rolls() * list.length)];

export const createRandomOfGroup = (group, rolls = Math.random) => ({ group, templateIndex: pick(ITEM_GROUPS[group], rolls) });
export const createRandomReligiousItem = (rolls = Math.random) => createRandomOfGroup('ReligiousItems', rolls);
export const createRandomGem = (rolls = Math.random) => createRandomOfGroup('Gems', rolls);
export const createRandomJewellery = (rolls = Math.random) => createRandomOfGroup('Jewellery', rolls);

const named = setItemFields;

// Classic rolls the dye before the variant here, the reverse of shop clothing, so the two must not share a helper.
export function createRandomClothing(gender, rolls = Math.random) {
  const group = gender === 'female' ? 'WomensClothing' : 'MensClothing';
  const templateIndex = pick(ITEM_GROUPS[group], rolls);
  const dye = CLOTHING_DYES[Math.floor(rolls() * CLOTHING_DYES.length)];
  const variant = Math.floor(rolls() * (ITEM_TEMPLATES[templateIndex]?.variants ?? 0));
  return { group, templateIndex, dye, variant };
}

let _lootGoldMult = () => 1;
export function setLootGoldMult(fn) { _lootGoldMult = typeof fn === 'function' ? fn : () => 1; }
function lootGoldMult() { try { const m = Number(_lootGoldMult()); return Number.isFinite(m) && m >= 1 && m <= 2 ? m : 1; } catch { return 1; } }

export function generateRandomLoot(matrix, who, rolls = Math.random, { itemChanceScale = 1, mobileType = null } = {}) {
  const items = [];
  const level = Math.max(1, who.level | 0);
  const gold = Math.round((matrix.MinGold + Math.floor(rolls() * (matrix.MaxGold + 1 - matrix.MinGold))) * level * lootGoldMult());
  if (gold > 0) items.push(goldStack(gold));
  const halving = (chance, make) => {
    let c = chance * itemChanceScale;
    while (dice100(Math.trunc(c), rolls())) { const it = make(); if (it) items.push(mintCondition(named(it))); c *= 0.5; }
  };
  halving(matrix.WP, () => createRandomWeapon(level, rolls));
  halving(matrix.AM, () => createRandomArmor(level, rolls));
  const ingredient = (chance, groupName) =>
    halving(chance, () => createRandomOfGroup(groupName, rolls));
  const creatureIngredient = (chance, groupName, tier) =>
    halving(chance, () => {
      const pool = themedIngredientPool(mobileType, tier, ITEM_GROUPS[groupName]);
      return pool.length ? { group: groupName, templateIndex: pick(pool, rolls) } : null;
    });
  creatureIngredient(matrix.C1 * level, 'CreatureIngredients1', 'C1');
  creatureIngredient(matrix.C2 * level, 'CreatureIngredients2', 'C2');
  creatureIngredient(matrix.C3, 'CreatureIngredients3', 'C3');
  ingredient(matrix.P1 * level, 'PlantIngredients1');
  ingredient(matrix.P2 * level, 'PlantIngredients2');
  ingredient(matrix.M1, 'MiscellaneousIngredients1');
  ingredient(matrix.M2, 'MiscellaneousIngredients2');
  if (_magicItemTemplates) {
    halving(matrix.MI * MAGIC_DROP_SCALE, () => createRegularMagicItem(_magicItemTemplates, level, who.gender, rolls));
  }
  halving(matrix.CL, () => createRandomClothing(who.gender, rolls));
  halving(matrix.BK, () => createRandomBook(rolls));
  halving(matrix.RL, () => createRandomReligiousItem(rolls));
  return items;
}

let _magicItemTemplates = null;
export function setMagicItemTemplates(templates) { _magicItemTemplates = templates; }
let _spellsByIndex = null;
export function setSpellRecordsByIndex(byIndex) { _spellsByIndex = byIndex; }
export const spellRecordOfIndex = (index) => _spellsByIndex?.get?.(index) ?? null;

// Spells keep their canonical names because saves, classic imports, and the boat test read them.
// Only the shown name is localized.
export function shownSpellName(spell) {
  const name = spell?.name;
  const sig = Number.isInteger(spell?.index) ? pathOfSignatureIndex(spell.index) : null;
  if (sig) return name === sig.spell.nameEn ? sig.spell.name : name;
  const stock = typeof name === 'string' && Number.isInteger(spell.index) && spell.index >= 0 ? spellRecordOfIndex(spell.index) : null;
  if (!stock) return name;
  const own = String(stock.name ?? '');
  return name === own || name === own.replace(/^!/, '') ? getLocalizedSpellName(spell.index, name) : name;
}

const MAGIC_GROUPS_0 = Object.freeze([2, 3, 6, 10, 12, 14, 25]);
const MAGIC_GROUPS_1 = Object.freeze([2, 3, 6, 12, 25]);

function magicItemBase(magicItem, playerLevel, gender, rolls) {
  let groupId;
  if (magicItem.group === 0) groupId = MAGIC_GROUPS_0[Math.floor(rolls() * 7)];
  else if (magicItem.group === 1) groupId = MAGIC_GROUPS_1[Math.floor(rolls() * 5)];
  else groupId = 3;
  let base;
  if (groupId === 3) {
    base = createRandomWeapon(playerLevel, rolls);
    while (base.name === 'Arrow') base = createRandomWeapon(playerLevel, rolls);
  } else if (groupId === 2) base = createRandomArmor(playerLevel, rolls);
  else if (groupId === 6 || groupId === 12) base = createRandomClothing(gender, rolls);
  else if (groupId === 10) base = createRandomReligiousItem(rolls);
  else if (groupId === 14) base = createRandomGem(rolls);
  else base = createRandomJewellery(rolls);
  return base;
}

export const powersNeedWearing = (rows) => rows.some((r) => !worksUnworn(r));
export const MAGIC_BASE_DRAWS = 64;

export function createRegularMagicItem(templates, playerLevel, gender, rolls = Math.random, chosenItem = -1) {
  const regular = templates.filter((t) => t.type === 0);
  // Matches the classic guard: an index equal to the length passes here and throws when the row is read.
  if (chosenItem > regular.length) throw new Error(`Magic item subclass ${chosenItem} does not exist`);
  if (chosenItem === -1) chosenItem = Math.floor(rolls() * regular.length);
  const magicItem = regular[chosenItem];
  const enchantments = magicItem.enchantments.filter((e) => e.type !== -1);
  let base = magicItemBase(magicItem, playerLevel, gender, rolls);
  // Unlike classic, a power that works only when worn redraws its base until a slot can wear it.
  if (powersNeedWearing(enchantments)) {
    for (let i = 1; i < MAGIC_BASE_DRAWS && !wearableItem(base); i++) base = magicItemBase(magicItem, playerLevel, gender, rolls);
    if (!wearableItem(base)) base = createRandomArmor(playerLevel, rolls);
  }
  // As in classic, the enchantment value replaces the base item's value, and the MAGIC.DEF row's value is unused.
  return {
    ...base,
    name: magicItem.name,
    magic: true,
    enchantments,
    value: legacyEnchantmentValue(enchantments, { spellOfIndex: spellRecordOfIndex }),
    maxCondition: magicItem.uses,
    currentCondition: magicItem.uses,
  };
}

export const ITEM_GROUP_NAME_BY_CLASS = Object.freeze([
  'Drugs', 'UselessItems1', 'Armor', 'Weapons', 'MagicItems', 'Artifacts',
  'MensClothing', 'Books', 'Furniture', 'UselessItems2', 'ReligiousItems',
  'Maps', 'WomensClothing', 'Paintings', 'Gems', 'PlantIngredients1',
  'PlantIngredients2', 'CreatureIngredients1', 'CreatureIngredients2',
  'CreatureIngredients3', 'MiscellaneousIngredients1', 'MetalIngredients',
  'MiscellaneousIngredients2', 'Transportation', 'Deeds', 'Jewellery',
  'QuestItems', 'MiscItems', 'Currency',
]);

// Items from a classic save carry only the classic flags word, so these bits are read back out of it.
export const ITEM_IDENTIFIED_MASK = 0x20;
export const ITEM_ARTIFACT_MASK = 0x800;

// Enum value order with None first; legacyGetArtifactSubType matches these names against item short names.
export const ARTIFACT_SUB_TYPE_NAMES = Object.freeze([
  ['None', -1],
  ['Masque_of_Clavicus', 0], ['Mehrunes_Razor', 1], ['Mace_of_Molag_Bal', 2],
  ['Hircine_Ring', 3], ['Sanguine_Rose', 4], ['Oghma_Infinium', 5],
  ['Wabbajack', 6], ['Ring_of_Namira', 7], ['Skull_of_Corruption', 8],
  ['Azuras_Star', 9], ['Volendrung', 10], ['Warlocks_Ring', 11],
  ['Auriels_Bow', 12], ['Necromancers_Amulet', 13], ['Chrysamere', 14],
  ['Lords_Mail', 15], ['Staff_of_Magnus', 16], ['Ring_of_Khajiit', 17],
  ['Ebony_Mail', 18], ['Auriels_Shield', 19], ['Spell_Breaker', 20],
  ['Skeletons_Key', 21], ['Ebony_Blade', 22],
]);

export function legacyGetArtifactSubType(itemShortName) {
  const key = String(itemShortName ?? '').replaceAll('\'', '').replaceAll(' ', '_');
  for (const [name, value] of ARTIFACT_SUB_TYPE_NAMES) {
    if (key.includes(name)) return value;
  }
  return -1;
}

export function legacyArtifactIndexBitfieldCheck(item) {
  if (!item?.artifact) return item;
  if (((item.artifactIndexBitfield ?? 0) & 1) !== 0) return item;
  const subType = legacyGetArtifactSubType(item.shortName ?? item.name);
  if (subType !== -1) item.artifactIndexBitfield = (subType << 1) | 1;
  return item;
}

export const ARTIFACT_MALE_TEXTURE_ARCHIVE = 432;
export const ARTIFACT_FEMALE_TEXTURE_ARCHIVE = 433;
export const ARTIFACT_TEXTURE_INDEX_MAPPINGS = Object.freeze([
  12, 13, 10, 8, 19, 16, 25, 18, 21, 2, 24, 26, 0, 15, 3, 9, 23, 17, 7, 1, 22, 20, 5,
]);
export function artifactTextureIndices(artifactIndex, gender = 'male') {
  return {
    archive: gender === 'female' ? ARTIFACT_FEMALE_TEXTURE_ARCHIVE : ARTIFACT_MALE_TEXTURE_ARCHIVE,
    record: ARTIFACT_TEXTURE_INDEX_MAPPINGS[artifactIndex] ?? 0,
  };
}

export function createArtifact(templates, artifactIndex, { gender = 'male' } = {}) {
  const artifacts = templates.filter((t) => t.type === 1 || t.type === 2);
  const magicItem = artifacts[artifactIndex];
  if (!magicItem) throw new Error(`Artifact template index out of range: ArtifactIndex=${artifactIndex}`);
  const groupName = ITEM_GROUP_NAME_BY_CLASS[magicItem.group];
  const templateIndex = GROUP_TEMPLATE_INDICES[groupName]?.[magicItem.groupIndex];
  let material = magicItem.material;
  if (magicItem.group === 2) material = 0x200 + material;
  return {
    group: groupName,
    templateIndex,
    name: magicItem.name,
    magic: true,
    artifact: true,
    isIdentified: true,
    artifactIndexBitfield: (artifactIndex << 1) | 1,
    material,
    enchantments: magicItem.enchantments.filter((e) => e.type !== -1),
    maxCondition: magicItem.uses,
    currentCondition: magicItem.uses,
    // Classic identifies the Skeleton's Key by world texture archive 432 and record 20.
    // A female character gets archive 433, so her key does not bypass the lock level of a door.
    playerTextureArchive: artifactTextureIndices(artifactIndex, gender).archive,
    playerTextureRecord: artifactTextureIndices(artifactIndex, gender).record,
    worldTextureArchive: artifactTextureIndices(artifactIndex, gender).archive,
    worldTextureRecord: artifactTextureIndices(artifactIndex, gender).record,
    value: magicItem.value,
  };
}

export function getMagicItemTemplates() { return _magicItemTemplates; }

// Senders must obey this bound too, since a list over it is refused whole.
export const LOOT_LIST_MAX = 64;
export const LOOT_ITEM_KEYS_MAX = 48;
export const LOOT_STR_MAX = ITEM_STR_MAX;
export const LOOT_DEPTH_MAX = 4;
export const LOOT_STACK_MAX = 65535;

function clampLootValue(v, depth) {
  if (v === null) return null;
  const t = typeof v;
  if (t === 'boolean') return v;
  if (t === 'number') return Number.isFinite(v) ? v : undefined;
  if (t === 'string') return v.length > LOOT_STR_MAX ? v.slice(0, LOOT_STR_MAX) : v;
  if (t !== 'object' || depth >= LOOT_DEPTH_MAX) return undefined;
  if (Array.isArray(v)) {
    if (v.length > LOOT_LIST_MAX) return undefined;
    const out = [];
    for (const e of v) { const c = clampLootValue(e, depth + 1); if (c === undefined) return undefined; out.push(c); }
    return out;
  }
  if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) return undefined;
  const keys = Object.keys(v);
  if (keys.length > LOOT_ITEM_KEYS_MAX) return undefined;
  const out = {};
  for (const k of keys) {
    if (!k || k.length > LOOT_STR_MAX || k === '__proto__') return undefined;
    const c = clampLootValue(v[k], depth + 1);
    if (c !== undefined) out[k] = c;
  }
  return out;
}

export const LOOT_ARRAY_FIELDS = Object.freeze(itemFieldsOfKind('array'));

// The item law registers itself through setItemLaw because it imports this module.
let _itemLaw = null;
let _priceCeiling = null;
export function setItemLaw(fn, ceiling = null) { _itemLaw = typeof fn === 'function' ? fn : null; _priceCeiling = typeof ceiling === 'function' ? ceiling : null; }

export function validLootItem(v) {
  const out = wireLootItem(v);
  return out && !lawRefuses(out) ? lawPriced(out) : null;
}
const lawRefuses = (/** @type {any} */ it) => !!_itemLaw && _itemLaw(it, { receiver: true }).length > 0;
export const itemLawFindings = (/** @type {any} */ it) => (_itemLaw ? _itemLaw(it) : []);
const lawPriced = (/** @type {any} */ it) => {
  if (_priceCeiling && !VALUE_IS_IDENTITY_TEMPLATES.includes(it.templateIndex) && !BOAT_TEMPLATES.includes(it.templateIndex)) {
    it.value = Math.min(it.value, Math.max(_priceCeiling(it), wireFloorOf(it)));
  }
  return it;
};

function wireLootItem(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  if (v.templateIndex == null || validItemField('templateIndex', v.templateIndex) === undefined) return null;
  if (!templateByIndex(v.templateIndex)) return null;
  const out = clampLootValue(v, 0);
  if (!out || typeof out !== 'object' || Array.isArray(out)) return null;
  if (!validItemFields(out)) return null;
  if (!validSetMarks(out)) return null;
  if (!validGildedMarks(out)) return null;
  if (!validImprint(out)) return null;
  if (!validCurse(out)) return null;
  if (!validSocket(out)) return null;
  out.value = Math.max(Number.isFinite(out.value) ? out.value : 0, wireFloorOf(out));
  if (out.stackCount !== undefined && (!Number.isInteger(out.stackCount) || out.stackCount < 1 || out.stackCount > LOOT_STACK_MAX)) return null;
  for (const k of RECEIVER_MARKS) delete out[k];
  return out;
}

export const LOOT_NEWER_TEXT = 'Something in here is from a newer version of the game. Reload to open it.';
export const LOOT_NEWER_TAKE_TEXT = 'Something on this body is from a newer version of the game. Reload to take it.';

export function validLootList(v) {
  if (!Array.isArray(v) || v.length > LOOT_LIST_MAX) return null;
  const out = [];
  for (const e of v) {
    const it = wireLootItem(e);
    if (!it) return null;
    if (!lawRefuses(it)) out.push(lawPriced(it));
  }
  return out;
}

export const lootMatrix = (key) => rriLootMatrix(key) ?? LOOT_MATRICES[key] ?? LOOT_MATRICES['-'];

export function generateItems(lootTableKey, who, rolls = Math.random, opts = {}) {
  return generateRandomLoot(lootMatrix(lootTableKey), who, rolls, opts);
}
export const enemyLootTableKey = (mobileType, key) => rriEnemyLootTableKey(mobileType, key);

// Random potions draw from this list too; classic draws them from the registered recipes, which match it unmodded.
export const CLASSIC_RECIPE_KEYS = Object.freeze([
  221871, 239524, 4975678, 5017404, 5188896, 111516185, 4826108, 216843, 224588, 220192,
  240081, 4937012, 228890, 221117, 4870452, 5361377, 112080144, 4842851, 4815872, 2031019196,
]);

export const MAP_TEMPLATE_INDEX = 287;
export const POTION_RECIPE_TEMPLATE_INDEX = 278;
export const POTION_TEMPLATE_INDEX = GROUP_TEMPLATE_INDICES.UselessItems1[1];

const potionValue = (recipeKey, item) => potionRecipeByKey(recipeKey)?.price ?? itemBaseValue(item);
/** @param {any} item */
const wireFloorOf = (item) => {
  if (item.group === 'Books' && item.templateIndex === BOOK_TEMPLATE) return bookValue(item.message);
  if (item.group === 'MiscItems' && item.templateIndex === POTION_RECIPE_TEMPLATE_INDEX && item.potionRecipeKey != null) return potionValue(item.potionRecipeKey, item);
  return itemBaseValue(item);
};

export function createPotion(recipeKey) {
  const potion = { group: 'UselessItems1', templateIndex: POTION_TEMPLATE_INDEX, potionRecipeKey: recipeKey };
  const recipe = potionRecipeByKey(recipeKey);
  if (!recipe) return mintCondition({ ...potion, value: itemBaseValue(potion) });
  return mintCondition({
    ...potion,
    value: recipe.price,
    worldTextureRecord: recipe.textureRecord ?? POTION_DEFAULT_TEXTURE_RECORD,
  });
}

export function createRandomPotion(rolls = Math.random) {
  return createPotion(CLASSIC_RECIPE_KEYS[Math.floor(rolls() * CLASSIC_RECIPE_KEYS.length)]);
}

export function randomlyAddMap(chance, items, rolls = Math.random) {
  if (!dice100(chance, rolls())) return null;
  const map = mintCondition({ group: 'MiscItems', templateIndex: MAP_TEMPLATE_INDEX, value: itemBaseValue({ group: 'MiscItems', templateIndex: MAP_TEMPLATE_INDEX }) });
  items.push(map);
  return map;
}

export function randomlyAddPotion(chance, items, rolls = Math.random) {
  if (!dice100(chance, rolls())) return null;
  const potion = createRandomPotion(rolls);
  items.push(potion);
  return potion;
}

export function randomlyAddPotionRecipe(chance, items, rolls = Math.random) {
  if (!dice100(chance, rolls())) return null;
  const key = CLASSIC_RECIPE_KEYS[Math.floor(rolls() * CLASSIC_RECIPE_KEYS.length)];
  const row = { group: 'MiscItems', templateIndex: POTION_RECIPE_TEMPLATE_INDEX, potionRecipeKey: key };
  const recipe = mintCondition({ ...row, value: potionValue(key, row) });
  items.push(recipe);
  return recipe;
}

// Classic adds the map roll for every enemy, but potions and recipes only for one with a loot table.
// Call this after the enemy's equipment is in the list, as classic does.
export function addEnemyLootExtras(items, basics, rolls = Math.random, { quarters = undefined, mobileType = null } = {}) {
  if (!items || !basics) return items;
  randomlyAddMap(basics.mapChance ?? 0, items, rolls);
  const key = basics.lootTableKey;
  if (key && key !== '-') {
    randomlyAddPotion(3, items, rolls);
    randomlyAddPotionRecipe(2, items, rolls);
    for (const fn of [..._enemyLootExtras.values()]) {
      try { fn({ items, basics, rolls, quarters, mobileType }); } catch (e) { console.warn('[enemyLoot] an extra threw', e); }
    }
  }
  return items;
}
const _enemyLootExtras = new Map();
const _kept = new WeakSet();
export const keepLoot = (item) => { if (item && typeof item === 'object') _kept.add(item); return item; };
export const isLootKept = (item) => !!item && typeof item === 'object' && _kept.has(item);
export function registerEnemyLootExtra(name, fn) { if (typeof fn === 'function') _enemyLootExtras.set(name, fn); else _enemyLootExtras.delete(name); }

export function unlevelPileGold(items, level) {
  const by = Math.max(1, Math.trunc(level) || 1);
  for (const it of items) if (it?.group === 'Currency') it.stackCount = Math.max(1, Math.trunc((it.stackCount ?? 0) / by));
  return items;
}

export const PILE_MAP_CHANCES = Object.freeze([2, 1, 1, 2, 2, 15]);

export function addPileLootExtras(items, lootTableKey, rolls = Math.random, { locationIndex = null, luck = 50, level = 1, online = isOnlinePage(), where = null, quarters = undefined } = {}) {
  if (!items || !lootTableKey) return items;
  if (online) unlevelPileGold(items, level);
  const alphabetIndex = lootTableKey.charCodeAt(0) - 64;
  if (alphabetIndex >= 10 && alphabetIndex <= 15) {
    randomlyAddMap(PILE_MAP_CHANCES[alphabetIndex - 10], items, rolls);
    randomlyAddPotion(4, items, rolls);
    randomlyAddPotionRecipe(2, items, rolls);
  }
  if (lootTableKey !== '-') raiseTabledLootSpawned({ locationIndex, key: lootTableKey, items, rolls, luck, where, quarters });
  return items;
}

// Handlers run in mod load order, and the realism condition pass must run first.
const _tabledLootHandlers = new Map([
  [RRI_VENDOR, ({ items, rolls }) => { if (conditionBasedPricesOn()) randomConditionLootItems(items, rolls); }],
]);
export function registerTabledLootHandler(name, fn) { if (typeof fn === 'function') _tabledLootHandlers.set(name, fn); else _tabledLootHandlers.delete(name); }
export function raiseTabledLootSpawned(args) {
  for (const fn of [..._tabledLootHandlers.values()]) {
    try { fn(args); } catch (e) { console.warn('[lootSpawned] a pile handler threw', e); }
  }
  return args.items;
}
export const tableLootSpawned = Object.freeze({
  add(fn) { const id = Symbol('tableLootSpawned'); _tabledLootHandlers.set(id, fn); return () => { _tabledLootHandlers.delete(id); }; },
  raise: (args) => raiseTabledLootSpawned(args),
});

