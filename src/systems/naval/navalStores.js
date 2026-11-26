// @ts-check
import { registerCustomTemplates, setItemFields, mintCondition } from '../../items/itemTemplates.js';

// Saved items hold this template index, so it must never change or collide with another custom template.
export const STORES_TEMPLATE = 1330;
export const STORES_GROUP = 'UselessItems2';
export const STORES_ROW = Object.freeze({
  index: STORES_TEMPLATE, name: 'Carpenter\'s Stores', baseWeight: 10, hitPoints: 1, capacityOrTarget: 0, basePrice: 25,
  enchantmentPoints: 0, rarity: 1, variants: 0, drawOrderOrEffect: 0, isBluntWeapon: false, isLiquid: false,
  isOneHanded: false, isIngredient: false, worldTextureArchive: 204, worldTextureRecord: 8, playerTextureArchive: 0,
  playerTextureRecord: 0, stackable: true,
});
// Registered at import, not on demand, so a save that holds stores always finds the template.
registerCustomTemplates([STORES_ROW]);

/** @param {number} n */
export const mintStores = (n) => mintCondition(setItemFields({ group: STORES_GROUP, templateIndex: STORES_TEMPLATE, material: 0, flags: 0, variant: 0, message: 0, stackCount: Math.max(1, n | 0) }));
export const isStores = (it) => it?.templateIndex === STORES_TEMPLATE;
/** @param {any[]} items */
export const storesIn = (items) => (items ?? []).reduce((n, it) => n + (isStores(it) ? Math.max(1, it.stackCount | 0) : 0), 0);
/** @param {any[]} items */
export function spendStore(items) {
  const i = (items ?? []).findIndex(isStores);
  if (i < 0) return false;
  const it = items[i];
  if ((it.stackCount | 0) > 1) it.stackCount--;
  else items.splice(i, 1);
  return true;
}
