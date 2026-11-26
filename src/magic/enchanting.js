import { doEnchantedPayloads, classicEnchantmentType } from './enchantments.js';
import { unequipItem } from '../characters/equip.js';
import { templateByIndex } from '../items/itemTemplates.js';
import { ARMOR_MATERIAL } from '../items/armorMaterials.js';
import { WEAPON_MATERIALS } from '../characters/weapons.js';
import { customItemClass } from '../mods/rriItems.js';
import { localizedText, t } from '../ui/textManager.js';
import { enchantGold } from '../net/alchemyLaw.js';
import { recipeById, jewelPoints } from '../net/recipeLaw.js';
import { enchantmentSettings } from './enchantmentCatalogue.js';
import { ENCHANTMENT_TYPES } from '../formats/magicDef.js';
import { isAetheric } from '../items/aetheric.js';
import { isGilded } from '../items/gilded.js';
import { isCursed, lootRarityOn, RARE_FLAVOURS } from '../items/lootRarity.js';

export const MAX_ENCHANTMENTS = 10;

export const GOLD_PER_ENCHANTMENT_POINT = 10;

export const WEAPON_ENCHANTMENT_MULTIPLIER = Object.freeze({
  [WEAPON_MATERIALS.Iron]: -0.25,
  [WEAPON_MATERIALS.Steel]: 0,
  [WEAPON_MATERIALS.Silver]: 0.75,
  [WEAPON_MATERIALS.Elven]: 0.25,
  [WEAPON_MATERIALS.Dwarven]: 0.5,
  [WEAPON_MATERIALS.Mithril]: 0.25,
  [WEAPON_MATERIALS.Adamantium]: 0.75,
  [WEAPON_MATERIALS.Ebony]: 1.0,
  [WEAPON_MATERIALS.Orcish]: 1.5,
  [WEAPON_MATERIALS.Daedric]: 2.0,
});

export const ARMOR_ENCHANTMENT_MULTIPLIER = Object.freeze({
  [ARMOR_MATERIAL.Leather]: 0,
  [ARMOR_MATERIAL.Chain]: 0,
  [ARMOR_MATERIAL.Chain2]: 0,
  [ARMOR_MATERIAL.Steel]: 0,
  [ARMOR_MATERIAL.Iron]: -0.25,
  [ARMOR_MATERIAL.Silver]: 0.75,
  [ARMOR_MATERIAL.Elven]: 0.25,
  [ARMOR_MATERIAL.Dwarven]: 0.5,
  [ARMOR_MATERIAL.Mithril]: 0.25,
  [ARMOR_MATERIAL.Adamantium]: 0.75,
  [ARMOR_MATERIAL.Ebony]: 1.0,
  [ARMOR_MATERIAL.Orcish]: 1.5,
  [ARMOR_MATERIAL.Daedric]: 2.0,
});

export const weaponEnchantmentMultiplier = (material) =>
  WEAPON_ENCHANTMENT_MULTIPLIER[material] ?? 0;
export const armorEnchantmentMultiplier = (material) =>
  ARMOR_ENCHANTMENT_MULTIPLIER[material] ?? 0;

export function craftedJewelPoints(item) {
  const r = craftedJewelRecipe(item);
  if (!r || !Number.isSafeInteger(item.enchantmentPoints) || item.enchantmentPoints < 0) return null;
  const tpl = templateByIndex(r.templateIndex)?.enchantmentPoints ?? 0;
  // Items from the wire or a save are untrusted, so the stored points never exceed what the recipe can mint.
  return Math.min(item.enchantmentPoints, jewelPoints(r, tpl, item.hand ?? null));
}
export function craftedJewelRecipe(item) {
  if (item?.group !== 'Jewellery' || !/^[0-9a-f]{16}$/.test(item.provenance ?? '') || typeof item.recipe !== 'string') return null;
  const r = recipeById(item.recipe);
  return r?.kind === 'jewel' && r.templateIndex === item.templateIndex ? r : null;
}
const TYPE_KEY = Object.freeze(Object.fromEntries(Object.entries(ENCHANTMENT_TYPES).map(([k, v]) => [v, k])));
export function enchantmentRowCost(e) {
  return enchantmentSettings(TYPE_KEY[e?.type] ?? e?.type, e?.param)?.enchantCost ?? null;
}
// itemLaw.js isMakerRow tests the same field, so the two must change together.
export const makerLaid = (e) => e?.enchantCost !== undefined;
export function rareKeeps(item) {
  // An unidentified Rare stays out, since the item maker would show its rows and identify it for free.
  if (!lootRarityOn() || item?.rarity !== 'rare' || item.magic === true || item.artifact === true || item.isIdentified !== true) return false;
  const [flavour, ...rest] = (item.enchantments ?? []).filter((e) => !makerLaid(e));
  const flavours = RARE_FLAVOURS[item.group] ?? RARE_FLAVOURS.Jewellery;
  if (flavour && !flavours.some((f) => f.type === flavour.type && f.param === flavour.param)) return false;
  if (!rest.length) return true;
  return rest.length === 1 && isCursed(item) && rest[0]?.type === item.cursed.type && rest[0]?.param === item.cursed.param;
}
// null means the item maker refuses the item, as classic refuses any enchanted item.
export function keptEnchantments(item) {
  if (item?.rarity === 'legendary') return null;
  const list = item?.enchantments ?? [];
  if (!list.length) return [];
  const jewel = craftedJewelRecipe(item) != null;
  if (!jewel && !rareKeeps(item)) return null;
  const out = [];
  for (const e of list) {
    const parent = typeof e?.parentEnchantment === 'string' ? e.parentEnchantment : 0;
    const row = enchantmentSettings(TYPE_KEY[e?.type] ?? e?.type, e?.param, { parent });
    if (!row) return null;
    out.push({ ...row, kept: true });
    // Rare flavor rows are rolled without regard to item points, so the rolled rows cost nothing.
    if (!jewel && !makerLaid(e)) out[out.length - 1].enchantCost = 0;
  }
  return out;
}
export function itemEnchantmentPower(item, lookup = templateByIndex) {
  if (!item) throw new Error('itemEnchantmentPower: item is null');
  const raw = craftedJewelPoints(item) ?? lookup(item.templateIndex)?.enchantmentPoints ?? 0;
  const basePower = Number.isInteger(item.craftMods?.a) && item.craftMods.a !== 0 ? Math.max(0, Math.round(raw * (1 + item.craftMods.a / 100))) : raw;
  const cls = customItemClass(item.templateIndex);
  if (cls?.enchantmentPower) return cls.enchantmentPower(item, { enchantmentPoints: basePower, armorEnchantmentMultiplier });
  let multiplier = 0;
  if (item.group === 'Weapons') multiplier = weaponEnchantmentMultiplier(item.material);
  else if (item.group === 'Armor') multiplier = armorEnchantmentMultiplier(item.material);
  // Classic floors the material share, so a negative multiplier such as iron's rounds away from zero.
  return basePower + Math.floor(basePower * multiplier);
}

export const enchantmentListCost = (list = [], { countForced = false } = {}) =>
  list.reduce((sum, e) => (
    (!countForced && (e.parentEnchantment ?? 0) !== 0) ? sum : sum + (e.enchantCost ?? 0)
  ), 0);

// Side effects have negative costs, so they add budget but never lower the gold price.
export const totalEnchantmentCost = (powers = [], sideEffects = []) =>
  enchantmentListCost(powers) + enchantmentListCost(sideEffects);

export const totalGoldCost = (powers = []) =>
  enchantmentListCost(powers, { countForced: true }) * GOLD_PER_ENCHANTMENT_POINT;

// These lines match TEXT.RSC records 1650 to 1658, except the no-enchantments line from Daggerfall Unity.
export const NOT_ENOUGH_GOLD_TO_ENCHANT = 'You do not have the gold to properly pay the enchanter.';
export const BEYOND_ITEM_LIMIT = 'You cannot enchant this item beyond its limit.';
export const ITEM_ENCHANTED = 'The item has been enchanted.';
export const ITEM_MUST_BE_SELECTED = 'An item must be selected to be enchanted.';
export const NO_ENCHANTMENTS_PREPARED = 'You have not prepared enchantments for this item.';
export const CANNOT_ENCHANT_MORE_POWERS = 'You cannot enchant this item with any more powers.';
export const NO_MORE_SIDE_EFFECTS = 'No further side-effects may be enchanted in this item.';

export const itemMakerRefuses = (item) => isAetheric(item) || isGilded(item);
export const AETHERIC_TAKES_NO_ENCHANTMENT = 'An Aetheric piece takes no enchantment.';

export function openPickerDecision(selectingPowers, { item = null, powers = [], sideEffects = [] } = {}) {
  if (!item) return { kind: 'refuse', text: ITEM_MUST_BE_SELECTED };
  // Classic tests for exactly ten, not ten or more, so lists that grow past ten are not refused here.
  if (powers.length + sideEffects.length === MAX_ENCHANTMENTS) {
    return { kind: 'refuse', text: selectingPowers ? CANNOT_ENCHANT_MORE_POWERS : NO_MORE_SIDE_EFFECTS };
  }
  return { kind: 'open' };
}

export function enchantDecision(item, powers = [], sideEffects = [], { gold = 0, discountPct = 0, souls = null } = {}) {
  if (!item) return { kind: 'noItem', text: ITEM_MUST_BE_SELECTED };
  if (itemMakerRefuses(item)) return { kind: 'refused', text: AETHERIC_TAKES_NO_ENCHANTMENT };
  if (powers.length === 0 && sideEffects.length === 0) {
    return { kind: 'noEnchantments', text: localizedText('noEnchantments', NO_ENCHANTMENTS_PREPARED) };
  }
  if (souls !== null) {
    const held = new Set(souls);
    if ([...powers, ...sideEffects].some((e) => e?.type === 'SoulBound' && !held.has(e.param))) return { kind: 'soulGone', text: t('enchant.soulGone', 'That soul is no longer in your pack.') };
  }
  const cost = totalEnchantmentCost(powers, sideEffects) + enchantmentListCost(keptEnchantments(item) ?? []);
  const goldCost = enchantGold(totalGoldCost(powers), discountPct);
  const power = itemEnchantmentPower(item);
  // Gold is checked before the item's limit, so a player who can afford neither sees the gold message.
  if (gold < goldCost) {
    return { kind: 'noGold', text: NOT_ENOUGH_GOLD_TO_ENCHANT, goldCost };
  }
  if (power < cost) {
    return { kind: 'overLimit', text: BEYOND_ITEM_LIMIT, cost, power };
  }
  return { kind: 'enchant', text: ITEM_ENCHANTED, goldCost, cost, power };
}

export function applyEnchantments(item, enchantments, { owner = null, ctx = null, nowMinutes = null } = {}) {
  if (!enchantments || enchantments.length === 0) {
    throw new Error('applyEnchantments: enchantments cannot be null or empty');
  }
  const applied = [];
  let count = 0;
  // Classic adds a row before it tests the count, so the cap keeps eleven rows, not ten.
  for (const e of enchantments) {
    applied.push({ ...e });
    if (++count > MAX_ENCHANTMENTS) break;
  }
  const kept = keptEnchantments(item)?.length ? item.enchantments : [];
  applied.length = Math.min(applied.length, Math.max(0, MAX_ENCHANTMENTS + 1 - kept.length));
  // Kept rows ran their created payloads when they were laid, so only the new rows run them.
  doEnchantedPayloads(item, applied, { entity: owner, ctx, nowMinutes });
  // The owner must equip the item again, so its on-equip payloads run.
  unequipItem(owner, item);
  // Runtime readers look an enchantment up by its classic type number, so stored rows must not keep their keys.
  item.enchantments = [...kept, ...applied.map((e) => ({ ...e, type: classicEnchantmentType(e.type) }))];
  item.isIdentified = true;
  return item;
}

export const enchantmentCostLabel = (cost, power) => `${cost}/${power}`;
