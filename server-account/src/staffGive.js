// @ts-check
// The item is minted here by the game's own producers and checked with itemFindings before it is given, so a gift
// never breaks the item rules the player trades under.
import { itemFindings, itemWorth, lawTemplate, templateGroups, GOLD_INT_MAX } from '../../src/items/itemLaw.js';
import { customTemplateRows, setItemFields, mintCondition } from '../../src/items/itemTemplates.js';
import { GROUP_TEMPLATE_INDICES } from '../../src/items/itemTemplatesData.js';
import { createWeapon, weaponOfMaterial, armorOfMaterial, ARROW_TEMPLATE } from '../../src/combat/enemyEquipment.js';
import { applyEnchantments, itemEnchantmentPower, MAX_ENCHANTMENTS } from '../../src/magic/enchanting.js';
import {
  pickEnchantment, enchantmentTypes, enchantmentName, enchantmentParamValues, enchantmentParamName, enchantmentCost, isSideEffect,
  hasItemMakerFlag, ITEM_MAKER_FLAGS,
} from '../../src/magic/enchantmentCatalogue.js';
import { WEAPON_MATERIALS } from '../../src/characters/weapons.js';
import { ARMOR_MATERIAL } from '../../src/items/armorMaterials.js';
import { isStackable, LETTER_OF_CREDIT_TEMPLATE } from '../../src/items/inventory.js';
import { valuablePiece, mintItemId } from '../../src/items/itemIds.js';
import { createPotion, POTION_TEMPLATE_INDEX } from '../../src/items/loot.js';
import { potionById } from '../../src/net/alchemyLaw.js';

export const GIVE_REASONS = Object.freeze(['bug-refund', 'event-prize', 'compensation', 'testing', 'other']);
export const GIVE_ENCHANT_MAX = MAX_ENCHANTMENTS + 1;
const WEAPON_MATS = Object.freeze(Object.entries(WEAPON_MATERIALS).filter(([, v]) => v >= 0).map(([name, v]) => [v, name]));
const ARMOR_MATS = Object.freeze(Object.entries(ARMOR_MATERIAL).filter(([k, v]) => v >= 0 && k !== 'Chain2').map(([name, v]) => [v, name]));

function templateList() {
  /** @type {Map<number, string[]>} */
  const groups = new Map();
  for (const [g, list] of Object.entries(GROUP_TEMPLATE_INDICES)) for (const i of list) groups.set(i, [...(groups.get(i) ?? []), g]);
  for (const r of customTemplateRows()) if (Number.isInteger(r?.index) && !groups.has(r.index)) groups.set(r.index, templateGroups(r.index));
  return [...groups].map(([i, gs]) => ({ i, name: lawTemplate(i)?.name ?? `#${i}`, groups: gs })).filter((t) => t.name && t.groups.length);
}

let _catalogue = /** @type {any} */ (null);
export function giveCatalogue() {
  if (_catalogue) return _catalogue;
  const items = templateList().map((t) => ({ ...t, stacks: t.groups.some((group) => isStackable({ group, templateIndex: t.i })) }));
  const enchants = enchantmentTypes().map((key) => ({
    key, name: enchantmentName(key), side: isSideEffect(key), weaponOnly: hasItemMakerFlag(key, ITEM_MAKER_FLAGS.WeaponOnly),
    params: enchantmentParamValues(key).map((p) => [p, enchantmentParamName(key, p), enchantmentCost(key, p)]),
  }));
  _catalogue = { items, letter: LETTER_OF_CREDIT_TEMPLATE, materials: { Weapons: WEAPON_MATS, Armor: ARMOR_MATS }, enchants, enchantMax: GIVE_ENCHANT_MAX, reasons: GIVE_REASONS };
  return _catalogue;
}

/** @param {any} spec @param {((b: Uint8Array<ArrayBuffer>) => Uint8Array) | undefined} [rand] */
export function mintGift(spec, rand = undefined) {
  const i = spec?.template;
  if (!Number.isInteger(i) || !lawTemplate(i)) return { error: 'staff-item-template' };
  const groups = templateGroups(i);
  const group = spec.group === undefined ? groups[0] : spec.group;
  if (!groups.includes(group)) return { error: 'staff-item-template' };
  const count = spec.count === undefined ? 1 : spec.count;
  if (!Number.isSafeInteger(count) || count < 1 || count > GOLD_INT_MAX) return { error: 'staff-item-template' };
  const mats = group === 'Weapons' ? WEAPON_MATS : group === 'Armor' ? ARMOR_MATS : null;
  const material = mats ? (spec.material === undefined ? mats[0][0] : spec.material) : undefined;
  if (mats && !mats.some(([v]) => v === material)) return { error: 'staff-item-template' };
  if (!mats && spec.material !== undefined) return { error: 'staff-item-template' };
  // The recipe name is checked here because the item law accepts a bottle with any key.
  const potion = spec.recipe === undefined ? null : potionById(spec.recipe);
  if (spec.recipe !== undefined && (!potion || group !== 'UselessItems1' || i !== POTION_TEMPLATE_INDEX)) return { error: 'staff-item-template' };
  /** @type {any} */
  let item;
  if (group === 'Weapons' && i === ARROW_TEMPLATE) item = { ...createWeapon(ARROW_TEMPLATE, 0, () => 0), stackCount: count };
  else if (group === 'Weapons') item = weaponOfMaterial(i, material);
  else if (group === 'Armor') item = armorOfMaterial(i, material);
  else if (potion) item = createPotion(potion.key);
  else item = mintCondition(setItemFields({ group, templateIndex: i }));
  if (spec.gold !== undefined) {
    if (i !== LETTER_OF_CREDIT_TEMPLATE || !Number.isSafeInteger(spec.gold) || spec.gold < 1 || spec.gold > GOLD_INT_MAX) return { error: 'staff-item-template' };
    item.value = spec.gold;
  }
  if (count > 1) {
    if (!isStackable(item)) return { error: 'staff-item-template' };
    item.stackCount = count;
  }
  const asked = Array.isArray(spec.enchant) ? spec.enchant : [];
  if (asked.length > GIVE_ENCHANT_MAX) return { error: 'staff-item-enchant' };
  /** @type {any[]} */
  const rows = [];
  for (const e of asked) {
    const pick = typeof e?.key === 'string' ? pickEnchantment(e.key, e.param) : null;
    if (!pick || pick.kind !== 'add') return { error: 'staff-item-enchant' };
    rows.push(pick.settings, ...pick.powers, ...pick.sideEffects);
  }
  if (rows.length > GIVE_ENCHANT_MAX) return { error: 'staff-item-enchant' };
  if (rows.length) applyEnchantments(item, rows);
  if (valuablePiece(item)) item.uid = mintItemId(rand);
  const cost = rows.reduce((s, r) => s + ((r.parentEnchantment ?? 0) === 0 ? r.enchantCost : 0), 0);
  return { item, findings: itemFindings(item), cost, power: rows.length ? itemEnchantmentPower(item, lawTemplate) : 0 };
}

/** @param {any} item */
export function giftWorth(item) {
  try { return itemWorth(item); } catch { return null; }
}
