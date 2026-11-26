// Inventory Use, ported from the DFU DaggerfallInventoryWindow.UseItem ladder, where the order of the arms matters.
import { templateByIndex, itemUseHandler } from './itemTemplates.js';
import { isProvPotion, provPotionParts } from '../professions/provItems.js';
import '../professions/fletching.js';
import { doItemEnchantmentPayloads, PAYLOAD } from '../magic/enchantments.js';
import { inflictPoison } from '../afflictions/poisons.js';
import { inflictDisease } from '../afflictions/diseases.js';
import { isEnchanted as hasEnchantments } from './inventory.js';
import { isSurvivalItem, useSurvivalItem } from '../systems/survival/items.js';
import { survivalRules } from '../systems/survival/switch.js';
import { SURVIVAL_RULES } from '../systems/survival/difficulty.js';
import { setLightSource } from './lightSource.js';
import { localizedStrings } from '../ui/textManager.js';
import { hoodCapable, hoodUp } from '../systems/survival/temperature.js';
import { sandPotionRefusal } from '../arena/arenaKit.js';
import { spirePotionRefusal, spirePotionDrunk } from '../systems/eliteGates/spireKit.js';

// The classic window, the enhanced pack, and the quick keys all read these words, so they live in one place.
export const USE_PENDING = Object.freeze({
  book: 'You cannot read that yet.',
  potion: 'You drink the potion.',
  map: 'You study the map.',
  questItem: 'Nothing happens.',
  enchanted: 'Nothing happens.',
  spellbook: 'You cannot open your spellbook here.',
  pitchCamp: 'There is nowhere to set that up here.',
  placeFire: 'There is nowhere to set that up here.',
  openPortal: 'A portal can only be opened under the open sky.',
});

export { TEMPLATES } from './itemKinds.js';
import { TEMPLATES, isLightSource, isPotion } from './itemKinds.js';

export const FIRST_DRUG_TEMPLATE = 78;
// DFU's offset: 78 + 66 lands outside the Poisons enum (drug poisons are 136 to 139), so using a drug inflicts
// nothing but still consumes it. Kept for parity.
export const DRUG_POISON_OFFSET = 66;

export { isLightSource, isPotion } from './itemKinds.js';
export const isPotionRecipe = (it) => it?.group === 'MiscItems' && it.templateIndex === TEMPLATES.Potion_recipe;
export const isParchment = (it) => it?.group === 'UselessItems2' && it.templateIndex === TEMPLATES.Parchment;
export const isClothing = (it) => it?.group === 'MensClothing' || it?.group === 'WomensClothing';
// An artifact book skips the reader and falls through to the enchanted Used payload, as in DFU.
export const isBook = (it) => it?.group === 'Books' && !it.artifact;
export const isDrug = (it) => it?.group === 'Drugs';
export const isSpellbook = (it) => it?.templateIndex === TEMPLATES.Spellbook;
export const isMap = (it) => (it?.group === 'MiscItems' || it?.group === 'Maps')
  && it?.templateIndex === TEMPLATES.Map;

export const VARIANT_CHANGEABLE = Object.freeze(new Set([
  154, 155, 161, 163, 165, 166, 167, 168, 169, 170, 171, 172,
  191, 192, 198, 200, 202, 203, 204, 205, 206, 207, 208, 209,
]));

export function usableItem(item) {
  if (!item) return false;
  if (item.questItem) return true;
  const handler = itemUseHandler(item.templateIndex);
  if (handler && (handler.usable?.(item) ?? true)) return true;
  if (isSurvivalItem(item) || isBook(item) || isPotion(item) || isMap(item) || isSpellbook(item) || isDrug(item) || isLightSource(item)) return true;
  if (hasEnchantments(item)) return true;
  return VARIANT_CHANGEABLE.has(item.templateIndex) && (templateByIndex(item.templateIndex)?.variants ?? 0) > 1;
}

export function nextVariant(item) {
  if (!VARIANT_CHANGEABLE.has(item?.templateIndex)) return false;
  const total = templateByIndex(item.templateIndex)?.variants ?? 0;
  let variant = (item.variant ?? 0) + 1;
  if (variant >= total) variant = 0;
  item.variant = variant;
  return true;
}

// Hooded drawings come in hood-down and hood-up pairs, so the hood moves to `variant ^ 1` when that drawing exists.
export function toggleHood(item) {
  if (!hoodCapable(item)) return false;
  const total = templateByIndex(item.templateIndex)?.variants ?? 0;
  const from = item.variant ?? 0;
  const up = hoodUp(item);
  if ((from ^ 1) < total) {
    item.variant = from ^ 1;
    if (hoodUp(item) !== up) return true;
    item.variant = from;
  }
  for (let i = 1; i < total; i++) {
    nextVariant(item);
    if (hoodUp(item) !== up) return true;
  }
  item.variant = from;
  return false;
}
export const HOOD_TEXT = Object.freeze({ raise: 'You raise your hood.', lower: 'You lower your hood.' });

export const drapeCount = (item) => (hoodCapable(item) ? Math.floor((templateByIndex(item.templateIndex)?.variants ?? 0) / 2) : 0);
export function nextDrape(item) {
  const drapes = drapeCount(item);
  if (drapes < 2) return false;
  const from = item.variant ?? 0;
  const up = hoodUp(item);
  const d = Math.min(drapes - 1, from >> 1);
  for (let step = 1; step < drapes; step++) {
    const pair = (d + step) % drapes;
    for (const v of [2 * pair, 2 * pair + 1]) {
      item.variant = v;
      if (hoodUp(item) === up) return true;
    }
  }
  item.variant = from;
  return false;
}
export const DRAPE_TEXT = 'You rearrange your cloak.';

export const USE_TEXT = localizedStrings({
  lightDouse: 'You douse the %it.',
  lightLight: 'You light the %it.',
  lightEmpty: 'Your %it has no fuel left.',
  lightRefuel: 'You refuel your %it with a bottle of oil.',
  lightFull: 'Your %it is full.',
  cannotUseThis: 'You cannot use this.',
  bookUnavailable: 'The book is ruined and is now unreadable.',
  readMapFail: 'You have already discovered the location shown by this map.',
});
export const NO_SPELLS_TEXT_ID = 12;
export const MAP_TEXT_ID = 499;

export const expandItemMacro = (text, item, name) =>
  (text ?? '').replaceAll('%it', name ?? item?.name ?? templateByIndex(item?.templateIndex)?.name ?? 'item');

export function useItem(item, collection, {
  entity = null, rolls = Math.random, nowMinute = 0,
  localItems = null, spellCount = () => 0, isEnchanted = () => false,
  drinkPotion = null,
  revealMap = null,
  getQuest = null, nameOf = null,
  target = null, chooseTarget = false,
} = {}) {
  if (!item) return { kind: 'none' };
  const named = (t) => expandItemMacro(USE_TEXT[t], item, nameOf?.(item));
  const bag = localItems ?? collection;

  // Only a quest item the quest is watching returns early, unless it is a parchment or clothing. Setting
  // `useClicked` is the only way a quest's `used do` task fires.
  const questItem = !!item.questItem;
  if (questItem) {
    const quest = getQuest?.(item.questUID);
    const resource = quest?.getItem?.(item.questSymbol) ?? null;
    if (resource) {
      if (!resource.useClicked && resource.actionWatching) {
        resource.useClicked = true;
        const dfItem = resource.daggerfallUnityItem ?? item;
        if (!isParchment(dfItem) && !isClothing(dfItem)) {
          return { kind: 'questItem', questItem: true, popToHUD: true };
        }
      }
      if (resource.usedMessageID !== 0) quest.showMessagePopup?.(resource.usedMessageID, true);
    }
  }

  const handler = itemUseHandler(item.templateIndex);
  if (handler) {
    const handled = handler(item, collection, { entity, rolls, nowMinute, localItems: bag, target, chooseTarget, drinkPotion });
    if (handled) return questItem ? { ...handled, questItem: true } : handled;
  }

  let out = null;
  // With the survival arc off, meals use Casual rules, so a meal never sickens in the classic game.
  if (isSurvivalItem(item)) out = useSurvivalItem(item, collection, { entity, now: nowMinute, rolls, currentDay: Math.trunc(nowMinute / 1440), inflict: inflictDisease, rules: survivalRules() ?? SURVIVAL_RULES.casual, offMeal: survivalRules() == null });
  else if (isBook(item)) out = { kind: 'book', item, failText: named('bookUnavailable') };

  else if (isPotion(item) && sandPotionRefusal()) out = { kind: 'refused', refused: true, text: sandPotionRefusal() };
  else if (isPotion(item) && spirePotionRefusal(item)) out = { kind: 'refused', refused: true, text: spirePotionRefusal(item) };

  else if (isPotion(item)) {
    // Removes this record, not the first with the same template, because every potion shares the bottle template.
    if (collection) removeOneRecord(collection, item);
    const drank = !drinkPotion ? null : isProvPotion(item)
      ? provPotionParts(item).map((p) => drinkPotion(p.key, item.prov.p)).filter(Boolean).join(', ') || null
      : drinkPotion(item.potionRecipeKey ?? 0, Number.isInteger(item.potent) ? item.potent : 0);
    spirePotionDrunk(item);
    out = drank ? { kind: 'potion', potion: drank } : { kind: 'potion', pending: true };
  }

  else if (isPotionRecipe(item)) out = { kind: 'potionRecipe', text: named('cannotUseThis') };

  else if (isMap(item) && collection) {
    // The map is consumed whether or not a location is revealed, as in DFU. A host with no reveal seam keeps it.
    if (!revealMap) { out = { kind: 'map', pending: true }; }
    else {
      const i = collection.indexOf(item);
      if (i >= 0) collection.splice(i, 1);
      const revealed = revealMap();
      out = revealed
        ? { kind: 'map', textId: MAP_TEXT_ID, revealed, macros: { map: revealed } }
        : { kind: 'map', text: named('readMapFail') };
    }
  }

  else if (isSpellbook(item)) {
    out = spellCount() === 0
      ? { kind: 'noSpells', textId: NO_SPELLS_TEXT_ID }
      : { kind: 'spellbook' };
  }

  else if (isDrug(item) && collection) {
    const poisonType = item.templateIndex + DRUG_POISON_OFFSET;
    const inflicted = entity ? inflictPoison(entity, poisonType, true, { rolls, currentMinute: nowMinute }) : null;
    const i = collection.indexOf(item);
    if (i >= 0) collection.splice(i, 1);
    out = { kind: 'drugged', poisonType, inflicted: !!inflicted };
  }

  else if (isLightSource(item)) {
    if (item.templateIndex !== TEMPLATES.Lantern && (item.currentCondition ?? 0) <= 0) out = { kind: 'empty', text: named('lightEmpty') };
    else if (entity?.lightSource === item) {
      setLightSource(entity, null);
      out = { kind: 'doused', text: named('lightDouse') };
    } else {
      setLightSource(entity, item);
      out = { kind: 'lit', text: named('lightLight') };
    }
  }

  else {
    const moved = nextVariant(item);
    out = moved ? { kind: 'variant', variant: item.variant } : { kind: 'none' };
  }

  if (questItem) out = { ...out, questItem: true };
  // The Used payload runs after the whole ladder, so an enchanted potion is drunk and fires its payload, as in DFU.
  if (isEnchanted(item)) {
    doItemEnchantmentPayloads(PAYLOAD.Used, item, { entity, collection, nowMinutes: nowMinute });
    return { ...out, enchanted: true, closesWindow: true };
  }
  return out;
}

function removeOneRecord(list, item) {
  const i = list.indexOf(item);
  if (i < 0) return false;
  if ((item.stackCount ?? 1) > 1) item.stackCount--;
  else list.splice(i, 1);
  return true;
}
