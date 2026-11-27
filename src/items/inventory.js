import { FEATHERWEIGHT_FACTOR } from '../magic/bunnySpellLaw.js';
import templates from '../characters/itemTemplates.json' with { type: 'json' };
import { weightForMaterial, WEAPONS } from '../characters/weapons.js';
import { mintCondition, rollPaintingMessage, templateByIndex, isAmmunition } from './itemTemplates.js';
import { isPlate, plateMetal } from './armorMaterials.js';
import { isRriStackable } from '../mods/rriRealism.js';
import { noteShot } from '../combat/shotTally.js';
import { cardWorth } from '../net/cardWorthLaw.js';
import { PATRON_COUNTER_MARK, COUNTER_PAID_MARK, COUNTER_VALUE_MARK } from '../net/patronLaw.js';
import { isFood, foodStage } from '../systems/survival/food.js';
import { isStolen, markStolen } from '../justice/stolenGoods.js';
import { sameFoundMark, carryFoundMark } from './foundMark.js';

export function isEnchanted(item) {
  return !!(item?.enchantments?.length || item?.customEnchantments?.length);
}

// Gold is the entity.goldPieces counter, so the player's own item list never holds Currency. A gold pile entering
// the pack is spent into the counter instead.
export const GOLD_TEMPLATE = 276;
export const goldStack = (stackCount = 0) => ({
  group: 'Currency', templateIndex: GOLD_TEMPLATE,
  name: templates.find((t) => t.index === GOLD_TEMPLATE)?.name ?? 'Gold Pieces',
  value: 1,
  stackCount,
});

// Both terms matter: MiscItems.Unused is template 276 too.
export const isGoldPieces = (item) =>
  item?.group === 'Currency' && item?.templateIndex === GOLD_TEMPLATE;

export const goldPiecesOf = (entity) => entity?.goldPieces ?? 0;

export function addGoldPieces(entity, amount) {
  if (!entity) return 0;
  entity.goldPieces = goldPiecesOf(entity) + amount;
  return entity.goldPieces;
}

export const LETTER_OF_CREDIT_TEMPLATE = 275;
export const letterOfCredit = (value = 0) => ({
  group: 'MiscItems', templateIndex: LETTER_OF_CREDIT_TEMPLATE,
  name: templates.find((t) => t.index === LETTER_OF_CREDIT_TEMPLATE)?.name ?? 'Letter of credit',
  value, stackCount: 1,
});

export const ARROW_TEMPLATE = WEAPONS.Arrow;
export const OIL_TEMPLATE = 252;
// Spelled here rather than imported from useItem.js, whose import chain reaches combat/formulas.js and back here.
export const GLASS_BOTTLE_TEMPLATE = 83;

export const isSummoned = (item) => (item?.timeForItemToDisappear ?? 0) !== 0;

export function isStackable(item) {
  if (isSummoned(item) && !(item.group === 'Weapons' && item.templateIndex === ARROW_TEMPLATE)) return false;
  if (item.equipSlot != null || isEnchanted(item) || item.questItem) return false;
  if (isRriStackable(item)) return true;
  if (templateByIndex(item.templateIndex)?.isIngredient) return true;
  if (templateByIndex(item.templateIndex)?.stackable) return true;
  if (item.group === 'UselessItems1' && item.templateIndex === GLASS_BOTTLE_TEMPLATE) return true;
  if (item.group === 'Books') return true;
  if (item.group === 'Currency') return true;
  if (item.group === 'Weapons' && item.templateIndex === ARROW_TEMPLATE) return true;
  if (item.group === 'UselessItems2' && item.templateIndex === OIL_TEMPLATE) return true;
  return false;
}

export function stacksWith(a, b) {
  return isStackable(a) && isStackable(b) &&
    (!isFood(a) || (foodStage(a) === foodStage(b) && (a.rotDay ?? null) === (b.rotDay ?? null) && (a.noRot === true) === (b.noRot === true) && (a.slowRot === true) === (b.slowRot === true))) &&
    a.group === b.group && a.templateIndex === b.templateIndex &&
    // An absent material is 0, so a split mint (material 0) re-merges into a source stack with no material field.
    (a.material ?? 0) === (b.material ?? 0) &&
    (a.message ?? 0) === (b.message ?? 0) &&
    (a.potionRecipeKey ?? 0) === (b.potionRecipeKey ?? 0) &&
    (a.potent ?? 0) === (b.potent ?? 0) &&
    (a.timeForItemToDisappear ?? 0) === (b.timeForItemToDisappear ?? 0) &&
    (a.locked === true) === (b.locked === true) &&
    (a.card ?? null) === (b.card ?? null) &&
    isStolen(a) === isStolen(b) &&
    sameFoundMark(a, b);
}

export function findExistingStack(list, item) {
  for (const held of list) {
    // A record already in the list is not its own stack mate, or re-adding it would double its count.
    if (held !== item && stacksWith(held, item)) return held;
  }
  return null;
}

export function absorbStack(held, item) {
    held.stackCount = (held.stackCount ?? 1) + (item.stackCount ?? 1);
    if (item[PATRON_COUNTER_MARK] === true) held[PATRON_COUNTER_MARK] = true;
    // A merge keeps the lower counter price, so it never lifts a piece's resale cap.
    if (Number.isInteger(item[COUNTER_PAID_MARK])) held[COUNTER_PAID_MARK] = Number.isInteger(held[COUNTER_PAID_MARK]) ? Math.min(held[COUNTER_PAID_MARK], item[COUNTER_PAID_MARK]) : item[COUNTER_PAID_MARK];
    if (Number.isInteger(item[COUNTER_VALUE_MARK])) held[COUNTER_VALUE_MARK] = Number.isInteger(held[COUNTER_VALUE_MARK]) ? Math.min(held[COUNTER_VALUE_MARK], item[COUNTER_VALUE_MARK]) : item[COUNTER_VALUE_MARK];
    return held;
}

export function addItem(list, item, position = 'back') {
  const held = findExistingStack(list, item);
  if (held) return absorbStack(held, item);
  if (list.includes(item)) {
    console.warn(`[inventory] AddItem() encountered a duplicate item for ${item.name ?? item.templateIndex}`);
    return item;
  }
  if (position === 'front') list.unshift(item);
  else list.push(item);
  return item;
}

const splitPricedByIdentity = (stack) =>
  stack.group === 'Books' || (stack.group === 'UselessItems1' && stack.templateIndex === GLASS_BOTTLE_TEMPLATE);

export function splitStack(list, stack, numberToPick, { rolls = Math.random } = {}) {
  const count = stack?.stackCount ?? 1;
  if (count <= 1 || numberToPick < 1 || numberToPick > count || !list.includes(stack)) return null;
  if (numberToPick === count) return stack;
  const template = templateByIndex(stack.templateIndex);
  const priced = splitPricedByIdentity(stack);
  // A fresh template mint, as in Daggerfall Unity, but the identity fields and marks below carry over to the split.
  const picked = mintCondition({
    group: stack.group,
    templateIndex: stack.templateIndex,
    name: template?.name,
    material: 0,
    flags: 0,
    variant: 0,
    value: priced ? (stack.value ?? template?.basePrice ?? 0) : (template?.basePrice ?? 0),
    enchantmentPoints: template?.enchantmentPoints,
    message: stack.group === 'Paintings' ? rollPaintingMessage(rolls) : (stack.message ?? 0),
    stackCount: numberToPick,
  });
  if (stack.potionRecipeKey) picked.potionRecipeKey = stack.potionRecipeKey;
  if (stack.potent) picked.potent = stack.potent;
  if (priced && stack.worldTextureRecord != null) picked.worldTextureRecord = stack.worldTextureRecord;
  if (stack.timeForItemToDisappear) picked.timeForItemToDisappear = stack.timeForItemToDisappear;
  if (stack.locked === true) picked.locked = true;
  if (typeof stack.card === 'string') {
    picked.card = stack.card;
    const w = cardWorth(stack.card);
    if (w > 0) picked.value = w;
  }
  if (stack.bound === true) picked.bound = true;
  if (stack[PATRON_COUNTER_MARK] === true) picked[PATRON_COUNTER_MARK] = true;
  if (Number.isInteger(stack[COUNTER_PAID_MARK])) picked[COUNTER_PAID_MARK] = stack[COUNTER_PAID_MARK];
  if (Number.isInteger(stack[COUNTER_VALUE_MARK])) picked[COUNTER_VALUE_MARK] = stack[COUNTER_VALUE_MARK];
  if (isStolen(stack)) markStolen([picked]);
  carryFoundMark(stack, picked);
  list.push(picked);
  stack.stackCount = count - numberToPick;
  return picked;
}

export function getItem(list, group, templateIndex, {
  allowEnchantedItem = true, allowQuestItem = true, priorityToConjured = false,
} = {}) {
  let selected = null;
  for (const item of list ?? []) {
    if (item.group !== group || item.templateIndex !== templateIndex) continue;
    if (!allowEnchantedItem && isEnchanted(item)) continue;
    if (!allowQuestItem && item.questItem) continue;
    if (!priorityToConjured) return item;
    // With priorityToConjured, a summoned item wins over a real one, and the shortest-lived summoned item wins.
    if (isSummoned(item)) {
      if (selected == null || !isSummoned(selected)
        || selected.timeForItemToDisappear > item.timeForItemToDisappear) selected = item;
    } else if (selected == null) {
      selected = item;
    }
  }
  return selected;
}

export function removeOne(list, templateIndex, opts) {
  const picked = getItem(list, opts.group, templateIndex, opts);
  const i = picked ? list.indexOf(picked) : -1;
  if (i < 0) return false;
  const it = list[i];
  if ((it.stackCount ?? 1) > 1) it.stackCount--;
  else list.splice(i, 1);
  return true;
}

export const spendArrow = (list) => removeOne(list, ARROW_TEMPLATE,
  { group: 'Weapons', allowQuestItem: false, priorityToConjured: true });

export function spendAmmoFor(list, weapon, shot = null) {
  const template = ARROW_TEMPLATE;
  const opts = { group: 'Weapons', allowQuestItem: false, priorityToConjured: true };
  const real = !isSummoned(getItem(list, opts.group, template, opts));
  if (!removeOne(list, template, opts)) return false;
  if (real) noteShot(list, template);
  if (shot) shot.summoned = !real;
  return true;
}

export function ammoCountFor(list, weapon, { usableOnly = false } = {}) {
  const template = ARROW_TEMPLATE;
  let n = 0;
  for (const it of list ?? []) {
    if (it?.templateIndex !== template || (usableOnly && (it.group !== 'Weapons' || it.questItem))) continue;
    n += Math.max(0, it.stackCount ?? 1);
  }
  return n;
}

export function transferAll(fromList, toList) {
  let n = 0;
  for (const item of fromList) { addItem(toList, item); n++; }
  fromList.length = 0;
  return n;
}

export function takeOneInto(entity, fromList, item) {
  if (!entity || !Array.isArray(fromList) || !item) return null;
  // Matched by identity, since the pile can change between drawing a row and taking it; a stale row takes nothing.
  const at = fromList.indexOf(item);
  if (at < 0) return null;
  fromList.splice(at, 1);
  if (isGoldPieces(item)) addGoldPieces(entity, item.stackCount ?? 1);
  else {
    entity.items = entity.items || [];
    addItem(entity.items, item); tellTaken(item);
  }
  return item;
}
const _takeListeners = new Map();
export function registerTakeListener(name, fn) { if (typeof fn === 'function') _takeListeners.set(name, fn); else _takeListeners.delete(name); }
export function tellTaken(item) {
  if (!item) return;
  for (const fn of _takeListeners.values()) { try { fn(item); } catch { } }
}

// Daggerfall Unity truncates leather weight through int division, so its Round call is a no-op. This matches it.
export const leatherWeight = (weightKg) => Math.trunc(Math.trunc(weightKg * 4) / 2) / 4;

export { weightForMaterial };

export function unitWeightInKg(item) {
  const t = templateByIndex(item.templateIndex);
  if (Number.isFinite(item.weightInKg)) return item.weightInKg + (Number.isFinite(item.water) && item.water > 0 ? item.water : 0);
  let base = t ? t.baseWeight : 0;
  if (Number.isFinite(item.water) && item.water > 0) base += item.water;
  if (item.group === 'Weapons' && !isAmmunition(item) && item.material != null) {
    base = weightForMaterial(base, item.material);
  }
  if (item.group === 'Armor' && item.material != null) {
    if (item.material === 0x0000) base = leatherWeight(base);
    else if (isPlate(item.material)) base = weightForMaterial(base, plateMetal(item.material));
  }
  return base;
}

export function effectiveUnitWeightInKg(item) {
  const t = templateByIndex(item.templateIndex);
  if (t?.hasNoEncumbrance) return 0;
  return unitWeightInKg(item);
}

export function itemWeight(item) {
  return effectiveUnitWeightInKg(item) * (item.stackCount ?? 1);
}

export const totalWeight = (list) => list.reduce((a, i) => a + itemWeight(i), 0);

export const weightInGPUnits = (kg) => Math.round(kg * 400);

export const GOLD_PIECE_WEIGHT_KG = 0.0025;

/** @param {any} entity */
export const carryFactor = (entity) =>
  ((entity?.activeEffects ?? []).some((a) => a.kind === 'featherweight' && !a.ended) ? FEATHERWEIGHT_FACTOR : 1);

export const carriedWeight = (entity, items = entity?.items ?? []) =>
  (totalWeight(items) + goldPiecesOf(entity) * GOLD_PIECE_WEIGHT_KG) * carryFactor(entity);

export function canHoldAmount(unitsAvailable, unitWeightKg, capacityKg, loadKg) {
  let canHold = unitsAvailable;
  const roundUnitWeight = weightInGPUnits(unitWeightKg);
  if (roundUnitWeight > 0) {
    canHold = Math.min(canHold, Math.trunc((weightInGPUnits(capacityKg) - weightInGPUnits(loadKg)) / roundUnitWeight));
  }
  return canHold;
}

// Featherweight scales the capacity, not each unit, so GP-unit rounding still sees true weights.
export function packCanHoldAmount(entity, unitsAvailable, unitWeightKg, capacityKg, items = entity?.items ?? []) {
  const f = carryFactor(entity);
  return canHoldAmount(unitsAvailable, unitWeightKg, capacityKg / f, carriedWeight(entity, items) / f);
}
