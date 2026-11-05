// @ts-check
// BUNNYFALL: THE CROSSBOW. A bow-class weapon: it draws, holds and looses on the bow's own machine, spends arrows and is
// scored on Archery, but hits 1.6x as hard and cycles twice as slowly (characters/crossbowIds.js holds the two numbers).
//   - Template 563, a Weapons-group row copied from the Long Bow (so the inventory and paperdoll show a bow until there
//     is crossbow body art), made in the metal ladder like any weapon.
//   - First-person art: combat/crossbowArt.js.
//   - Where: the Weapon Smith's shelf (and, rarely, a Pawn Shop's), and as loot from foes and dungeon piles.

import { ITEM_TEMPLATES, registerCustomTemplates, setItemFields, mintCondition, registerTemplateLore } from './item/itemTemplates.js';
import { registerTabledLootHandler, registerEnemyLootExtra } from './loot/loot.js';
import { CROSSBOW_TEMPLATE } from '../characters/crossbowIds.js';

export { CROSSBOW_TEMPLATE };
const LONG_BOW = 130;

/** The row: the Long Bow's, heavier and dearer. */
export const CROSSBOW_ROW = Object.freeze({
  ...ITEM_TEMPLATES[LONG_BOW],
  index: CROSSBOW_TEMPLATE,
  name: 'Crossbow',
  baseWeight: 4,
  basePrice: 120,
  hitPoints: 100,
  enchantmentPoints: 350,
  rarity: 1,
  isOneHanded: false,
});
registerCustomTemplates([CROSSBOW_ROW]);
registerTemplateLore(CROSSBOW_TEMPLATE, 'A stout bow set crosswise on a stock. It is slow to wind and slow to span, and when it looses, the bolt (an arrow, here) hits far harder than a bowman\'s.');

/** Mint one. Material rides the weapon metal ladder (0 Iron .. 9 Daedric). */
export function createCrossbow({ material = 0 } = {}) {
  return mintCondition(setItemFields({
    group: 'Weapons', templateIndex: CROSSBOW_TEMPLATE, material, flags: 0, variant: 0, message: 0, stackCount: 1,
  }));
}

/** Better shops and richer finds reach for better metal: Iron..Dwarven at the best. */
const metalFor = (quality, rolls) => Math.min(4, Math.floor(rolls() * (1 + quality / 4)));

/** How many a shop carries, by quality 1-20. */
export const CROSSBOW_SHELVES = Object.freeze({
  WeaponSmith: (q) => 1 + Math.floor(q / 8),
  PawnShop: (q) => Math.floor(q / 10),
});
export function crossbowShelfStock(kind, quality = 10, rolls = Math.random) {
  const count = CROSSBOW_SHELVES[kind];
  if (!count) return [];
  const q = Math.max(1, Math.min(20, Math.trunc(Number(quality)) || 1));
  return Array.from({ length: count(q) }, () => createCrossbow({ material: metalFor(q, rolls) }));
}

/** A looting foe's and a dungeon pile's (keys J-O) chance of a crossbow, in percent. */
export const CROSSBOW_FOE_PERCENT = 1;
export const CROSSBOW_PILE_PERCENT = 3;
export function rollCrossbowLoot(items, percent, rolls = Math.random) {
  if (rolls() * 100 < percent) items.push(createCrossbow({ material: metalFor(8, rolls) }));
  return items;
}
const isDungeonPileKey = (/** @type {any} */ key) => { const n = String(key ?? '').charCodeAt(0) - 64; return n >= 10 && n <= 15; };
export function installCrossbowLoot() {
  registerTabledLootHandler('CROSSBOW', ({ key, items, rolls }) => { if (isDungeonPileKey(key)) rollCrossbowLoot(items, CROSSBOW_PILE_PERCENT, rolls); });
  registerEnemyLootExtra('CROSSBOW', ({ items, rolls }) => { rollCrossbowLoot(items, CROSSBOW_FOE_PERCENT, rolls); });
}
