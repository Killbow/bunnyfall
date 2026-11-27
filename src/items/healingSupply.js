// @ts-check
import { createPotion, registerTabledLootHandler, registerEnemyLootExtra, CLASSIC_RECIPE_KEYS } from './loot.js';
import { BUILDING_TYPES } from '../world/buildingNames.js';
import { renownLootQuarters, lootEased } from './renownLoot.js';

export const HEALING_RECIPE_KEY = CLASSIC_RECIPE_KEYS[2];
export const HEALING_ENEMY_CHANCE = 4;
export const HEALING_PILE_CHANCE = 8;
export const MAGICKA_RECIPE_KEY = CLASSIC_RECIPE_KEYS[4];
export const MAGICKA_ENEMY_CHANCE = 2;
export const MAGICKA_PILE_CHANCE = 4;
export const HEALING_ENEMY_CHANCE_BEFORE = 2;
export const HEALING_PILE_CHANCE_BEFORE = 4;
export function healingSupplyChances(quarters = renownLootQuarters()) {
  return {
    enemy: { healing: lootEased(HEALING_ENEMY_CHANCE_BEFORE, HEALING_ENEMY_CHANCE, quarters), magicka: lootEased(0, MAGICKA_ENEMY_CHANCE, quarters) },
    pile: { healing: lootEased(HEALING_PILE_CHANCE_BEFORE, HEALING_PILE_CHANCE, quarters), magicka: lootEased(0, MAGICKA_PILE_CHANCE, quarters) },
  };
}

export const mintHealingPotion = () => createPotion(HEALING_RECIPE_KEY);
export const mintMagickaPotion = () => createPotion(MAGICKA_RECIPE_KEY);

// The count uses no roll, so the shop shelf's own seeded rolls are unchanged.
export function healingShelfCount(buildingType, quality) {
  const q = Math.max(0, Math.trunc(Number(quality) || 0));
  if (buildingType === BUILDING_TYPES.Alchemist) return 2 + Math.trunc(q / 5);
  if (buildingType === BUILDING_TYPES.GeneralStore) return 1 + Math.trunc(q / 10);
  return 0;
}

export function maybeAddHealingPotion(items, pct, rolls = Math.random) {
  if (!Array.isArray(items) || !(rolls() * 100 < pct)) return false;
  items.push(mintHealingPotion());
  return true;
}
export function maybeAddMagickaPotion(items, pct, rolls = Math.random) {
  if (!Array.isArray(items) || !(rolls() * 100 < pct)) return false;
  items.push(mintMagickaPotion());
  return true;
}

// Install after the smithing install so a field kit rolls first; the healing draw comes before the magicka one.
export function installHealingSupply() {
  registerTabledLootHandler('healing-potion', ({ key, items, rolls, quarters }) => {
    const i = typeof key === 'string' ? key.charCodeAt(0) - 64 : 0;
    if (i >= 10 && i <= 15) { const { pile } = healingSupplyChances(quarters); maybeAddHealingPotion(items, pile.healing, rolls); maybeAddMagickaPotion(items, pile.magicka, rolls); }
  });
  registerEnemyLootExtra('healing-potion', ({ items, rolls, quarters }) => { const { enemy } = healingSupplyChances(quarters); maybeAddHealingPotion(items, enemy.healing, rolls); maybeAddMagickaPotion(items, enemy.magicka, rolls); });
}
