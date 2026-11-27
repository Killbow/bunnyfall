import { registerCustomTemplates, setItemFields, mintCondition } from '../../items/itemTemplates.js';
import { modSetting, modLatchedOn } from '../../mods/modSettings.js';
import { registerModEffectKind, WATER_WALKING_SILENT_KIND } from '../../magic/effects.js';
import { HULL_NAMES, HULL_PRICES, HULL_WEIGHTS, VARIANT_NAMES } from './comeSailAwayHulls.js';
import { packedHullWeight, hullFromMessage } from './comeSailAwayHulls.js';

export const BOAT_PARTS_TEMPLATE = 1320;
export const BOAT_DEED_TEMPLATE = 1321;
export const BOAT_ITEM_GROUP = 'UselessItems2';

// These rows match vendor/come-sail-away/ItemTemplates.json field for field.
export const CSA_ITEM_TEMPLATES = Object.freeze([
  Object.freeze({ index: 1320, name: 'Parts of', baseWeight: 120, hitPoints: 1400, capacityOrTarget: 400, basePrice: 4000, enchantmentPoints: 1250, rarity: 1, variants: 0, drawOrderOrEffect: 0, isBluntWeapon: false, isLiquid: false, isOneHanded: false, isIngredient: false, worldTextureArchive: 0, worldTextureRecord: 0, playerTextureArchive: 212, playerTextureRecord: 11, hasNoEncumbrance: false }),
  Object.freeze({ index: 1321, name: 'Deed to', baseWeight: 0.5, hitPoints: 1400, capacityOrTarget: 400, basePrice: 6000, enchantmentPoints: 1250, rarity: 1, variants: 0, drawOrderOrEffect: 0, isBluntWeapon: false, isLiquid: false, isOneHanded: false, isIngredient: false, worldTextureArchive: 0, worldTextureRecord: 0, playerTextureArchive: 209, playerTextureRecord: 5, hasNoEncumbrance: false }),
]);
// Registered at import, so a saved boat item keeps its name, weight, and picture with the mod off.
registerCustomTemplates(CSA_ITEM_TEMPLATES);

const csaLoaded = () => {
  const latched = modLatchedOn('come-sail-away');
  if (latched !== undefined) return latched;
  try { return modSetting('come-sail-away', 'Enabled') !== false; } catch { return false; }
};
registerModEffectKind(WATER_WALKING_SILENT_KIND, csaLoaded);

export function mintBoatItem(templateIndex, uid) {
  return mintCondition(setItemFields({ group: BOAT_ITEM_GROUP, templateIndex, material: 0, flags: 0, variant: 0, message: 0, stackCount: 1, UID: uid }));
}

// Throws where the C# arrays would throw.
function at(table, i, what) {
  if (!(Number.isInteger(i) && i >= 0 && i < table.length)) throw new RangeError(`IndexOutOfRangeException: Index was outside the bounds of the array. (${what} ${i})`);
  return table[i];
}
export const boatItemName = (name, hull, variant) => `${name} ${at(HULL_NAMES, hull, 'hull')} '${at(VARIANT_NAMES, variant, 'variant')}'`;
export const boatItemMessage = (hull, variant) => hull * 10 + variant;

export function mintDeed(hull, variant, uid, value) {
  const deed = mintBoatItem(BOAT_DEED_TEMPLATE, uid);
  deed.message = boatItemMessage(hull, variant);
  deed.value = value;
  deed.name = boatItemName(deed.name, hull, variant);
  return deed;
}

export function mintParts(hull, variant, uid) {
  const parts = mintBoatItem(BOAT_PARTS_TEMPLATE, uid);
  parts.message = boatItemMessage(hull, variant);
  parts.value = at(HULL_PRICES, hull, 'hull');
  parts.weightInKg = HULL_WEIGHTS[hull];
  parts.name = boatItemName(parts.name, hull, variant);
  return parts;
}

// Returns how many items it fixed; a second run fixes none.
/** @param {any[]} list */
export function repairPartsWeights(list) {
  let n = 0;
  for (const item of Array.isArray(list) ? list : []) {
    if (item?.templateIndex !== BOAT_PARTS_TEMPLATE) continue;
    const kg = packedHullWeight(hullFromMessage(item.message | 0));
    if (Number.isFinite(kg) && item.weightInKg !== kg) { item.weightInKg = kg; n++; }
  }
  return n;
}

// A deed without a UID would match any boat another such deed placed, so shelf items get one.
export function mintShelfBoatUids(items, uid) {
  for (const item of items) if ((item.templateIndex === BOAT_PARTS_TEMPLATE || item.templateIndex === BOAT_DEED_TEMPLATE) && item.UID == null) item.UID = uid();
  return items;
}

export const cargoLootTarget = (cargo) => ({ items: () => cargo.Items, containerImage: () => cargo.ContainerImage, playerOwned: cargo.playerOwned !== false, storage: true });

// `range(min, max)` excludes max, as Unity's int Random.Range does, so deeds never roll the Rowboat or Carrack.
export function assignVariantsToShopItems(items, range) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.templateIndex === BOAT_DEED_TEMPLATE) {
      const num = range(1, 4);
      const num2 = 0;
      item.message = boatItemMessage(num, num2);
      item.value = at(HULL_PRICES, num, 'hull');
      item.name = boatItemName(item.name, num, num2);
    } else if (item.templateIndex === BOAT_PARTS_TEMPLATE) {
      const num3 = 0;
      const num4 = 0;
      item.message = boatItemMessage(num3, num4);
      item.value = HULL_PRICES[num3];
      item.weightInKg = HULL_WEIGHTS[num3];
      item.name = boatItemName(item.name, num3, num4);
    }
  }
  return items;
}
