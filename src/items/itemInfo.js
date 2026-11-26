import { wagonItemName } from '../travel/wagonKinds.js';
import { horseBornStats, bondTier, STEED_STATS, STEED_STAT_TEXT } from '../travel/steedCare.js';
import { isOatsItem, isWagonKitItem } from '../systems/upkeep/upkeepItemRows.js';
import { KIT_MEND, WAGON_KIT_CEILING } from '../travel/wagonUpkeep.js';
import { unitWeightInKg } from './inventory.js';
import { enemyDisplayName } from '../characters/enemyBasics.js';
import { itemIsIdentified } from '../trade/tradeModes.js';
import { templateByIndex, itemValueOf, conditionPercentage, isAmmunition } from './itemTemplates.js';
import { isPotion, isPotionRecipe, isParchment, TEMPLATES } from './useItem.js';
import { expandLetterSignoff } from '../systems/quest/questMacros.js';
import { itemArmorValue, isShieldTemplate } from './armorMaterials.js';
import { weaponMaterialModifier, weaponMinDamage, weaponMaxDamage, WEAPON_MATERIALS, itemMinDamage, itemMaxDamage } from '../characters/weapons.js';
import { getItemHands, ITEM_HANDS } from '../characters/equipTable.js';
import { ARMOR_MATERIAL, familyOfNative } from './armorMaterials.js';
import { rriNativeMaterialValue } from '../mods/rriItems.js';
import { getInt } from '../platform/settings.js';
import { srand, rand, randomRangeInclusive } from '../formats/dfRandom.js';
import { fullName } from '../characters/nameHelper.js';
import { soulTrapNameSuffix } from '../magic/mysticism.js';
import { potionRecipeByKey } from './potions.js';
import { bookTitle } from './books.js';
import { dfRandPick } from '../formats/textRsc.js';
import { hasArtifactEffect, hasArtifactSubtype, ARTIFACTS } from './artifactEffects.js';
import { isRestItem, restItemLines } from '../systems/survival/restItems.js'; import { isPortalStone, portalStoneLines } from '../travel/portalStone.js';
import { maskText } from '../net/nameFilter.js';
import { isWalletItem, WALLET_CARD_LINES } from './walletItem.js';
import { isSoulCake, isHearthOffering, SOUL_CAKE_TEXT } from '../systems/festival/soulCake.js';
import { isStarglass, STARGLASS_TEXT } from '../systems/starfall/starglass.js';
import { isLockpick, LOCKPICK_TEXT } from '../systems/lockpick/lockpickItem.js';
import { isWeirKey } from '../systems/eliteGates/weirKey.js'; import { EG_TEXT } from '../net/eliteGates/egLaw.js';
import { isIliacCard, isCardBinder, iliacCardName, iliacCardLines, BINDER_CARD_LINES, isCardPack, CARD_PACK_LINES } from '../cards/iliacItems.js';
import { isSurvivalItem, isCampingEquipment, isCampfireKit, isSkillet } from '../systems/survival/items.js';
import { isFood, foodOf, foodStage, foodSatiety, isWaterskin, waterIn, WATERSKIN_CAPACITY_KG, STAGE_WORDS, FOOD_STAGE } from '../systems/survival/food.js';
import { localizedText, localizedTable, formatText, t } from '../ui/textManager.js';
import { getLocalizedItemName, getLocalizedMagicItemName, getLocalizedEnemyName } from '../ui/textManager.js';
import { getMagicItemTemplates } from './loot.js';
import { makerMark, PROVENANCE_RE } from '../net/recipeLaw.js';
export const weirKeySharedLine = () => t('eg.key.shared', 'Every character on your account shares the same Weir Keys.');

export const INFO_TEXT = Object.freeze({
  painting: 250,
  armor: 1000,
  weapon: 1001,
  misc: 1003,
  soulTrap: 1004,
  letterOfCredit: 1007,
  potion: 1008,
  book: 1009,
  arrow: 1011,
  weaponNoMaterial: 1012,
  armorNoMaterial: 1014,
  oghmaInfinium: 1015,
  houseDeed: 1073,
});

export const POTION_RECIPE_FOR_TEXT = 'Recipe for Potion of %po';
export const POTION_RECIPE_WEIGHT_TEXT = 'Weight: %kg kilograms';
export const potionRecipeTokens = () => [
  { text: localizedText('potionRecipeFor', POTION_RECIPE_FOR_TEXT), center: true },
  { text: localizedText('potionRecipeWeight', POTION_RECIPE_WEIGHT_TEXT), center: true },
];

export function armorShouldShowMaterial(item, setting = getInt('GUI', 'HelmAndShieldMaterialDisplay', 0, 3)) {
  if (item?.artifact) return false;
  const isHelmOrShield = isShieldTemplate(item?.templateIndex) || item?.templateIndex === TEMPLATES.Helm;
  if (isHelmOrShield) {
    // item.material is the raw nativeMaterialValue, so the >= compares against the enum hold.
    const m = item?.material ?? ARMOR_MATERIAL.None;
    if (setting === 1 && m >= ARMOR_MATERIAL.Iron) return true;
    if (setting === 2 && m >= ARMOR_MATERIAL.Chain) return true;
    if (setting === 3) return true;
    return false;
  }
  return true;
}

export function itemInfoTextId(item) {
  if (!item) return INFO_TEXT.misc;
  switch (item.group) {
    case 'Armor':
      return armorShouldShowMaterial(item) ? INFO_TEXT.armor : INFO_TEXT.armorNoMaterial;
    case 'Weapons':
      if (isAmmunition(item)) return INFO_TEXT.arrow;
      if (item.artifact) return INFO_TEXT.weaponNoMaterial;
      return INFO_TEXT.weapon;
    case 'Books':
      // Daggerfall Unity tests no param here: any book with a special artifact effect is the Oghma Infinium.
      return hasArtifactEffect(item) ? INFO_TEXT.oghmaInfinium : INFO_TEXT.book;
    case 'Paintings':
      return INFO_TEXT.painting;
    case 'MiscItems':
      if (isPotionRecipe(item)) return INFO_TEXT.misc;
      if (item.templateIndex === TEMPLATES.House_Deed) return INFO_TEXT.houseDeed;
      if (item.templateIndex === TEMPLATES.Soul_trap) return INFO_TEXT.soulTrap;
      if (item.templateIndex === TEMPLATES.Letter_of_credit) return INFO_TEXT.letterOfCredit;
      return INFO_TEXT.misc;
    default:
      if (isPotion(item)) return INFO_TEXT.potion;
      if (hasArtifactSubtype(item, ARTIFACTS.AzurasStar)) return INFO_TEXT.soulTrap;
      return INFO_TEXT.misc;
  }
}

export const CONDITION_WORDS = localizedTable({ 0: ['Broken', 'Broken'], 1: ['Useless', 'Useless'], 2: ['Battered', 'Battered'], 3: ['Worn', 'Worn'],
  4: ['Used', 'Used'], 5: ['SlightlyUsed', 'Slightly Used'], 6: ['AlmostNew', 'Almost New'], 7: ['New', 'New'] });
export const CONDITION_THRESHOLDS = Object.freeze([1, 5, 15, 40, 60, 75, 91, 101]);

export { conditionPercentage };

export function conditionWord(item) {
  const max = item?.maxCondition ?? 0;
  if (!(max > 0 && (item.currentCondition ?? 0) <= max)) return String(item?.currentCondition ?? 0);
  const pct = conditionPercentage(item);
  let i = 0;
  while (i < CONDITION_THRESHOLDS.length - 1 && pct > CONDITION_THRESHOLDS[i]) i++;
  return CONDITION_WORDS[i];
}

export function weightString(item) {
  const weight = unitWeightInKg(item) * (item?.stackCount ?? 1);
  return weight % 1 === 0 ? String(weight) : weight.toFixed(2);
}

export function weaponDamageString(item) {
  const [min, max] = weaponDamageRange(item);
  return `${min} - ${max}`;
}

// Daggerfall Unity's armor mod is double what classic shows, which it treats as correct.
export function armourModString(item) {
  const v = itemArmorValue(item);
  return v > 0 ? `+${v}` : v < 0 ? `-${Math.abs(v)}` : '0';
}

/** @returns {string|null} */
export const itemDamageLine = (item) => (
  item?.group === 'Weapons' && !isAmmunition(item)
    ? weaponDamageString(item) : null);

/** @returns {string|null} */
export const itemHandsLine = (item) => (
  item?.group === 'Weapons' && !isAmmunition(item)
    ? (getItemHands(item) === ITEM_HANDS.Both ? 'Two-handed' : 'One-handed')
    : null);

export const itemArmourLine = (item) => (item?.group === 'Armor' ? armourModString(item) : null);

export const ARMOR_TYPE_WORDS = Object.freeze(['Leather', 'Chain', 'Plate']);
export function itemArmorTypeLine(item) {
  if (item?.group !== 'Armor') return null;
  // Same read as the equip gate's armor-type test, so the card always names the family a class restriction checks.
  return ARMOR_TYPE_WORDS[familyOfNative(rriNativeMaterialValue(item))] ?? null;
}

export function weaponDamageRange(item) {
  const mod = weaponMaterialModifier(item?.material ?? WEAPON_MATERIALS.Iron);
  return [itemMinDamage(item) + mod, itemMaxDamage(item) + mod];
}

export const MATERIAL_NAMES = Object.freeze(['Iron', 'Steel', 'Silver', 'Elven', 'Dwarven',
  'Mithril', 'Adamantium', 'Ebony', 'Orcish', 'Daedric']);
export function materialName(item) {
  const m = item?.material;
  if (item?.group === 'Armor') {
    if (m === ARMOR_MATERIAL.Leather) return 'Leather';
    if (m === ARMOR_MATERIAL.Chain || m === ARMOR_MATERIAL.Chain2) return 'Chain';
    return MATERIAL_NAMES[(m ?? 0) & 0xff] ?? '';
  }
  return MATERIAL_NAMES[m ?? 0] ?? '';
}
// materialName stays the English identity because weapon art lookups key on it; MATERIAL_TEXT is the shown word.
const MATERIAL_TEXT = localizedTable({
  Iron: ['iron', 'Iron'], Steel: ['steel', 'Steel'], Silver: ['silver', 'Silver'], Elven: ['elven', 'Elven'],
  Dwarven: ['dwarven', 'Dwarven'], Mithril: ['mithril', 'Mithril'], Adamantium: ['adamantium', 'Adamantium'],
  Ebony: ['ebony', 'Ebony'], Orcish: ['orcish', 'Orcish'], Daedric: ['daedric', 'Daedric'],
  Leather: ['leather', 'Leather'], Chain: ['chain', 'Chain'],
});
const materialText = (item) => MATERIAL_TEXT[materialName(item)] ?? '';
export const metalLabel = (id) => MATERIAL_TEXT[id] ?? id;

/** @returns {string|null} */
export function questLetterName(item, getQuest, rolls = Math.random) {
  if (!isParchment(item) || !item.questItem) return null;
  const quest = getQuest?.(item.questUID);
  if (!quest) return null;
  const questItem = quest.getItem?.(item.questSymbol);
  // Message id 0 resolves; only a negative id (the default -1) skips. The tokens arrive unexpanded.
  if (!questItem || questItem.usedMessageID < 0) return null;
  const message = quest.getMessage?.(questItem.usedMessageID);
  if (!message) return null;
  return expandLetterSignoff(quest, message.getTextTokens(-1, rolls, false));
}

export const PAINTING_TEXT_BASE = Object.freeze({ sub: 6100, adj: 6200, pp1: 6300, pp2: 6400 });

export const PAINTING_RECORD_COUNT = 180;

export function paintingRecordPart(record, start, end) {
  let i = start;
  while (i <= end && record[i] !== 0xff) i++;
  return (i - start === 1) ? record[i - 1] : record[randomRangeInclusive(start, i - 1)];
}

// The DFRandom state this walk leaves is what the painting macros draw from next, so the read order matters.
/** @returns {object|null} */
export function initPaintingInfo(item, readRecord, readInfoRows = null) {
  if (!item || item.group !== 'Paintings') return null;
  if (item.paintingInfo) return item.paintingInfo;
  if (!readRecord) return null;
  srand(item.message ?? 0);
  const paintingIndex = rand() % PAINTING_RECORD_COUNT;
  const record = readRecord(paintingIndex);
  if (!record) return null;
  // PAINT.DAT record 70 has an empty fourth slot, which Daggerfall Unity fills with four fixed parts.
  if (paintingIndex === 70 && record[30] === 0xff) {
    record[30] = 3;
    record[31] = 6;
    record[32] = 8;
    record[33] = 10;
  }
  const info = {
    filename: `${String.fromCharCode((paintingIndex >> 3) + 65)}PAINT.CIF`,
    fileIdx: paintingIndex & 7,
    sub: paintingRecordPart(record, 0, 9) + PAINTING_TEXT_BASE.sub,
    adj: paintingRecordPart(record, 10, 19) + PAINTING_TEXT_BASE.adj,
    pp1: paintingRecordPart(record, 20, 29) + PAINTING_TEXT_BASE.pp1,
    pp2: paintingRecordPart(record, 30, 39) + PAINTING_TEXT_BASE.pp2,
    // The description variant is drawn once and cached, while the macro words are redrawn on every look.
    rows: readInfoRows ? (readInfoRows(INFO_TEXT.painting) ?? null) : null,
  };
  item.paintingInfo = info;
  return info;
}

export function paintingMacros(info, readVariant) {
  if (!info || !readVariant) return null;
  // Each macro burns one rand() first, since classic uses every other value.
  const part = (id) => { rand(); return readVariant(id) ?? ''; };
  const sub = part(info.sub);
  const adj = part(info.adj);
  const pp1 = part(info.pp1);
  const pp2 = part(info.pp2);
  rand();
  const gender = rand() & 1;
  const bank = rand() & 7;
  return { sub, adj, pp1, pp2, artist: fullName(bank, gender) };
}

export function potionMacroName(item) {
  if (!isPotion(item) && !isPotionRecipe(item)) return null;
  if (isPotion(item) && item?.prov?.k === 'c' && typeof item.name === 'string') return item.name;
  const name = potionRecipeByKey(item?.potionRecipeKey)?.displayName ?? localizedText('unknownPowers', 'Unknown Powers');
  return isPotionRecipe(item) ? name : localizedText('potionOf', 'Potion of %po').replaceAll('%po', () => name);
}

export function potionRecipeIngredientNames(item) {
  if (!isPotionRecipe(item)) return null;
  return (potionRecipeByKey(item?.potionRecipeKey ?? 0)?.ingredients ?? []).map((id) => templateText(templateByIndex(id)));
}

function templateText(t) {
  return t ? getLocalizedItemName(t.index, t.name ?? '') : '';
}
export const lookNameParts = (item) => ({ material: materialText(item), name: templateText(templateByIndex(item?.templateIndex)) });

const shownSoulName = (soul) => getLocalizedEnemyName(soul, enemyDisplayName(soul));

export function shownItemName(item) {
  const raw = item?.name;
  if (raw == null) return raw;
  // The stored name stays canonical because code keys on it. Player-given words are starred before the lookup.
  const name = maskedItemName(String(raw));
  const t = templateByIndex(item.templateIndex);
  if (t && name === t.name) return getLocalizedItemName(t.index, name);
  const artifact = !!item.artifact;
  const m = (getMagicItemTemplates() ?? []).find((mt) => mt?.name === name && (mt.type !== 0) === artifact);
  return m ? getLocalizedMagicItemName(m.index, name) : name;
}

const _shownNames = new Map();
function maskedItemName(name) {
  let shown = _shownNames.get(name);
  if (shown === undefined) {
    if (_shownNames.size >= 512) _shownNames.clear();
    shown = maskText(name);
    _shownNames.set(name, shown);
  }
  return shown;
}

export function resolveItemName(item) {
  const templateName = templateText(templateByIndex(item?.templateIndex));
  const wagon = wagonItemName(item);
  if (wagon) return wagon;
  if (!itemIsIdentified(item)) return templateName;
  const short = shownItemName(item) ?? templateName;
  if (item?.artifact) return short;
  if (item?.group === 'Books') return bookTitle(item?.message ?? -1) ?? short;
  if (isIliacCard(item)) return iliacCardName(item);
  return templateName ? short.replaceAll('%it', () => templateName) : short;
}

export function itemLongName(item, opts) {
  const long = itemLongNameBare(item, opts);
  return typeof item?.woodName === 'string' && item.woodName && !long.endsWith(`, ${item.woodName}`) ? `${long}, ${item.woodName}` : long;
}
function itemLongNameBare(item, opts) {
  const { name, material } = itemNameParts(item, opts);
  if (!material || withholdsMaterialPrefix(item) || namesItsMetal(item, material)) return name;
  return formatText(item?.group === 'Armor'
    ? localizedText('longArmorNameFormatString', '{0} {1}')
    : localizedText('longWeaponNameFormatString', '{0} {1}'), material, name);
}
const namesItsMetal = (item, material) => String(templateText(templateByIndex(item?.templateIndex)) ?? '').toLowerCase().startsWith(`${String(material).toLowerCase()} `);
function withholdsMaterialPrefix(item) {
  if (item?.qlNamed === true) return true;
  return !itemIsIdentified(item) || !!item?.artifact || !!item?.legendary || !!item?.aetheric || !!item?.gilded;
}

export function itemNameParts(item, opts = {}) {
  const parts = namePartsOf(item, opts);
  const house = item?.heirloom?.house;
  if (typeof house !== 'string' || !house || !itemIsIdentified(item)) return parts;
  const bare = withholdsMaterialPrefix(item);
  const whole = parts.material && !bare ? `${parts.material} ${parts.name}` : parts.name;
  return { name: house.startsWith('of ') ? `${whole} of the house ${house}` : `${house}'s ${whole}`, material: bare ? parts.material : '' };
}
function gearMaterialText(item) {
  if (item?.group === 'Weapons' && !isAmmunition(item)) return materialText(item);
  if (item?.group === 'Armor' && armorShouldShowMaterial(item)) return materialText(item);
  return '';
}
const RARE_OR_BETTER = new Set(['rare', 'legendary', 'aetheric', 'gilded']);
const rareOrBetter = (item) => RARE_OR_BETTER.has(item?.rarity) || !!item?.legendary || !!item?.aetheric || !!item?.gilded;
const saysWithheldMaterial = (item) => !item?.artifact && (itemIsIdentified(item) || rareOrBetter(item));
export const itemSaysMaterial = (item) => !!gearMaterialText(item) && (!withholdsMaterialPrefix(item) || saysWithheldMaterial(item));
function namePartsOf(item, { getQuest = null, differentiatePlantIngredients = true } = {}) {
  if (typeof item?.bardName === 'string' && item.bardName && itemIsIdentified(item)) return { name: maskedItemName(item.bardName), material: '' };
  const base = resolveItemName(item);
  if (withholdsMaterialPrefix(item)) {
    const material = saysWithheldMaterial(item) ? gearMaterialText(item) : '';
    return { name: base, material };
  }
  if (differentiatePlantIngredients) {
    if (item?.group === 'PlantIngredients1' && item.templateIndex < 18) return { name: formatText(localizedText('ingredientFormatString', '{0} {1}'), base, localizedText('northern', '(northern)')), material: '' };
    if (item?.group === 'PlantIngredients2' && item.templateIndex < 18) return { name: formatText(localizedText('ingredientFormatString', '{0} {1}'), base, localizedText('southern', '(southern)')), material: '' };
  }
  let material = gearMaterialText(item);
  if ((item?.quality === 4 || item?.marked === true) && typeof item.maker === 'string' && item.maker && makerMark(item.maker) === item.maker
    && typeof item.provenance === 'string' && PROVENANCE_RE.test(item.provenance)) return { name: `${item.maker}'s ${material ? `${material} ` : ''}${base}`, material: '' };
  if (isPotion(item)) return { name: `${Number.isInteger(item.potent) && item.potent > 0 ? 'Potent ' : ''}${potionMacroName(item) ?? base}`, material };
  const signoff = questLetterName(item, getQuest);
  if (signoff) return { name: signoff, material: '' };
  return { name: base + soulTrapNameSuffix(item, shownSoulName), material };
}

export function expandItemInfo(text, item, { name = null, soul = null, potion = null, bookTitle: macroBookTitle = null, bookAuthor = null, painting = null } = {}) {
  const t = templateByIndex(item?.templateIndex);
  const identified = itemIsIdentified(item);
  const itemName = !identified ? templateText(t)
    : item?.group === 'Books' ? (bookTitle(item?.message ?? -1) ?? name ?? shownItemName(item) ?? templateText(t))
      : (name ?? shownItemName(item) ?? templateText(t)) + soulTrapNameSuffix(item, shownSoulName);
  const soulName = soul ?? (item?.trappedSoulType != null ? shownSoulName(item.trappedSoulType) : null);
  const potionMacro = potion ?? potionMacroName(item);
  const authorMacro = bookAuthor ?? _bookAuthors.get(item?.message) ?? null;
  return (text ?? '')
    .replaceAll('%it', itemName)
    .replaceAll('%arm', itemName)
    .replaceAll('%wep', itemName)
    .replaceAll('%bt', macroBookTitle ?? itemName)
    .replaceAll('%ba', authorMacro ?? localizedText('unknownAuthor', 'unknown author'))
    .replaceAll('%po', potionMacro ?? itemName)
    .replaceAll('%sub', painting?.sub ?? '')
    .replaceAll('%adj', painting?.adj ?? '')
    .replaceAll('%pp1', painting?.pp1 ?? '')
    .replaceAll('%pp2', painting?.pp2 ?? '')
    .replaceAll('%an', painting?.artist ?? '')
    .replaceAll('%hs', soulName ?? localizedText('Nothing', 'Nothing'))
    .replaceAll('%mat', identified && !item?.artifact ? materialText(item) : '')
    .replaceAll('%qua', conditionWord(item))
    .replaceAll('%kg', weightString(item))
    .replaceAll('%wth', String(itemValueOf(item) * (item?.stackCount ?? 1)))
    .replaceAll('%wdm', item?.group === 'Weapons' ? weaponDamageString(item) : '')
    .replaceAll('%mod', item?.group === 'Armor' ? armourModString(item) : '');
}

let _paintFile = null;
export function setPaintFile(paintFile) { _paintFile = paintFile ?? null; }

// Book files load asynchronously, so a book shows the unknown author until it has been opened once this session.
const _bookAuthors = new Map();
export function setBookAuthor(id, author) {
  if (id == null || !author) return;
  _bookAuthors.set(id, author);
}
export const getBookAuthor = (id) => _bookAuthors.get(id) ?? null;

export function survivalInfoTokens(item) {
  const t = templateByIndex(item?.templateIndex);
  const out = [{ text: isIliacCard(item) ? iliacCardName(item) : shownItemName(item) ?? t?.name ?? '', center: true }, { text: `Weight: ${unitWeightInKg(item).toFixed(2)} kilograms`, center: true }];
  if (isFood(item)) {
    const s = foodStage(item);
    out.push({ text: s >= FOOD_STAGE.Putrid ? 'Putrid. Too disgusting to force down.' : `Nourishes for ${foodSatiety(item)} minutes${s > 0 ? ` (${STAGE_WORDS[s].toLowerCase()})` : ''}`, center: true });
    if (foodOf(item)?.raw) out.push({ text: 'Raw. Cook it at a fire.', center: true });
  } else if (isWaterskin(item)) out.push({ text: `Water: ${waterIn(item).toFixed(1)} of ${WATERSKIN_CAPACITY_KG.toFixed(1)} kg`, center: true });
  else if (isCampingEquipment(item)) out.push({ text: `${item.currentCondition ?? 0} use${item.currentCondition === 1 ? '' : 's'} left`, center: true });
  else if (isCampfireKit(item)) out.push({ text: `${item.currentCondition ?? 0} night${item.currentCondition === 1 ? '' : 's'} of fuel`, center: true });
  else if (isSkillet(item)) out.push({ text: 'Cooking at a campfire goes twice as fast.', center: true });
  else if (isRestItem(item)) for (const text of restItemLines(item)) out.push({ text, center: true });
  else if (isPortalStone(item)) for (const text of portalStoneLines()) out.push({ text, center: true });
  else if (isWeirKey(item)) out.push({ text: EG_TEXT.keyLine, center: true }, { text: weirKeySharedLine(), center: true });
  else if (isSoulCake(item)) for (const text of SOUL_CAKE_TEXT.cake()) out.push({ text, center: true });
  else if (isHearthOffering(item)) for (const text of SOUL_CAKE_TEXT.offering()) out.push({ text, center: true });
  else if (isStarglass(item)) for (const text of STARGLASS_TEXT.glass()) out.push({ text, center: true });
  else if (isLockpick(item)) for (const text of LOCKPICK_TEXT.card()) out.push({ text, center: true });
  else if (isWalletItem(item)) for (const text of WALLET_CARD_LINES) out.push({ text, center: true });
  else if (isIliacCard(item)) for (const text of iliacCardLines(item)) out.push({ text, center: true });
  else if (isCardBinder(item)) for (const text of BINDER_CARD_LINES) out.push({ text, center: true });
  else if (isCardPack(item)) for (const text of CARD_PACK_LINES) out.push({ text, center: true });
  else if (isOatsItem(item)) out.push({ text: 'A day\u2019s food for a horse. Use it to feed the horse you ride.', center: true });
  else if (isWagonKitItem(item)) out.push({ text: `Repairs ${Math.round(KIT_MEND * 100)}% of a wagon, up to ${Math.round(WAGON_KIT_CEILING * 100)}%. Takes an hour.`, center: true });
  return out;
}

export function itemInfoRows(item, rows, macros = {}) {
  let painting = macros.painting ?? null;
  let record = null;
  if (isPotionRecipe(item)) record = potionRecipeTokens();
  if (isSurvivalItem(item) || isRestItem(item)) record = survivalInfoTokens(item);
  if (isPortalStone(item) || isWalletItem(item) || isIliacCard(item) || isCardBinder(item) || isCardPack(item) || isWeirKey(item) || isSoulCake(item) || isHearthOffering(item) || isStarglass(item) || isLockpick(item)) record = survivalInfoTokens(item);
  if (!painting && item?.group === 'Paintings' && _paintFile) {
    const info = initPaintingInfo(item, (i) => _paintFile.read(i), (id) => rows(id, dfRandPick));
    if (info) {
      record = info.rows;
      const readVariant = macros.paintingVariant ?? ((id) => (rows(id, dfRandPick) ?? [])[0]?.text ?? '');
      painting = paintingMacros(info, readVariant);
    }
  }
  return (record ?? rows(itemInfoTextId(item)) ?? [])
    .map((r) => ({ ...r, text: expandItemInfo(r.text, item, { ...macros, painting }) }))
    .filter((r) => r.text.trim() !== '');
}

export function itemInfoPanelRows(item, rows, macros = {}) {
  const out = itemInfoRows(item, rows, macros);
  if (item?.group !== 'Paintings' || !out.length) return out;
  const last = out[out.length - 1];
  return [{ ...last, text: (last.text ?? '').trim() }];
}

export const PANEL_KG_SRC = 'kilograms';
export const PANEL_KG_REP = 'kg';
export const PANEL_DAM_SRC = 'points of damage';
export const PANEL_DAM_REP = 'damage';
export const PANEL_AR_SRC = 'armor rating';
export const PANEL_AR_REP = 'armor';

// Only the small info panel gets this pass; the popup keeps the record's full words, as in Daggerfall Unity.
export function infoPanelShorten(rows) {
  const kgSrc = localizedText('kgSrc', PANEL_KG_SRC), kgRep = localizedText('kgRep', PANEL_KG_REP);
  const damSrc = localizedText('damSrc', PANEL_DAM_SRC), damRep = localizedText('damRep', PANEL_DAM_REP);
  const arSrc = localizedText('arSrc', PANEL_AR_SRC), arRep = localizedText('arRep', PANEL_AR_REP);
  return (rows ?? []).map((r) => ({
    ...r,
    text: (r.text ?? '')
      .replaceAll(kgSrc, kgRep)
      .replaceAll(damSrc, damRep)
      .replaceAll(arSrc, arRep),
  }));
}

// No value row: a base value is no shop's price, and the inventory card shows none either.
/** @returns {{label: string, text: string}[]} */
export function itemStatRows(item) {
  if (!item) return [];
  const rows = [];
  const push = (label, text) => { if (text != null && text !== '') rows.push({ label, text }); };
  push('Damage', itemDamageLine(item));
  push('Armor', itemArmourLine(item));
  push('Type', itemArmorTypeLine(item));
  push('Hands', itemHandsLine(item));
  push('Material', itemNameParts(item).material);
  const survival = isSurvivalItem(item) || isRestItem(item) || isPortalStone(item) || isWalletItem(item) || isIliacCard(item) || isCardBinder(item) || isCardPack(item) || isOatsItem(item) || isWagonKitItem(item) || isLockpick(item);
  if (survival) for (const t of survivalInfoTokens(item).slice(2)) push('', t.text);
  else if ((item.maxCondition ?? 0) > 0) push('Condition', `${conditionWord(item)} (${conditionPercentage(item)}%)`);
  const born = horseBornStats(item);
  if (born) for (const k of STEED_STATS) push(STEED_STAT_TEXT[k], String(born[k]));
  if (born && Number.isInteger(item.horseBond) && item.horseBond > 0) push('Bond', `${bondTier(item.horseBond / 10)} (${Math.floor(item.horseBond / 10)})`);
  push('Weight', `${weightString(item)} kg`);
  return rows;
}
