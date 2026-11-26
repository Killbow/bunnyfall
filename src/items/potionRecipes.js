// @ts-check
// The twenty classic Daggerfall potion recipes and their ingredient hash.
// Imports nothing so the account service can brew potions without the item table or the effect engine.

// The only effect with no classic key, so potion records name it by this string.
export const HEAL_SPELL_POINTS_KEY = 'Heal-SpellPoints';

// Matches the DFU recipe hash, int32 wrap included; an empty list returns 0 before the seed is used.
export function potionRecipeKey(ingredientIds) {
  if (!ingredientIds || ingredientIds.length === 0) return 0;
  let hash = 17;
  for (const id of ingredientIds) hash = (Math.imul(hash, 23) + id) | 0;
  return hash;
}

export const potionKeyFromCauldron = (templateIndices) =>
  potionRecipeKey([...templateIndices].sort((a, b) => a - b));

let _displayNames = null;
export function setPotionDisplayNames(table) { _displayNames = table; }
const withDisplayName = (r) => {
  const en = r.displayName;
  return Object.defineProperty(r, 'displayName', { enumerable: true, get: () => _displayNames?.[r.name] ?? en });
};

// `ingredients` are sorted template indexes; `settings` lists only fields that differ from the default of 1.
export const POTION_RECIPES = Object.freeze([
  { name: 'resistFire', price: 75, ingredients: [7, 10, 32, 35, 64], effect: '8,0', displayName: 'Resist Fire', textureRecord: 34, settings: { chanceBase: 100 } },
  { name: 'resistFrost', price: 75, ingredients: [5, 14, 22, 64], effect: '8,1', displayName: 'Resist Frost', textureRecord: 34, settings: { chanceBase: 100 } },
  { name: 'resistShock', price: 75, ingredients: [16, 64, 68], effect: '8,3', displayName: 'Resist Shock', textureRecord: 34, settings: { chanceBase: 100 } },
  { name: 'resistPoison', price: 125, ingredients: [25, 43, 64], effect: '8,2', displayName: 'Resist Poison', textureRecord: 14, settings: { chanceBase: 5, chanceMod: 19 } },
  { name: 'slowFalling', price: 100, ingredients: [24, 26, 59], effect: '25,255', displayName: 'Slow Falling' },
  { name: 'waterBreathing', price: 100, ingredients: [60, 62, 76], effect: '30,255', displayName: 'Water Breathing', textureRecord: 32 },
  { name: 'chameleonForm', price: 200, ingredients: [9, 11, 16, 60, 63], effect: '23,0', displayName: 'Chameleon Form', textureRecord: 33 },
  { name: 'invisibility', price: 250, ingredients: [3, 39, 60, 63], effect: '13,0', displayName: 'Invisibility', textureRecord: 33 },
  { name: 'shadowForm', price: 200, ingredients: [6, 21, 60, 63], effect: '24,0', displayName: 'Shadow Form', textureRecord: 33 },
  { name: 'cureDisease', price: 100, ingredients: [31, 56, 62], effect: '3,0', displayName: 'Cure Disease', textureRecord: 35, settings: { chanceMod: 10 } },
  { name: 'purification', price: 500, ingredients: [3, 31, 39, 49, 56, 60, 62, 63], effect: '3,0', displayName: 'Purification', textureRecord: 35, settings: { chanceMod: 10, magnitudeBaseLow: 5, magnitudeBaseHigh: 5, magnitudeLevelBase: 19, magnitudeLevelHigh: 19 }, secondary: ['10,8', '13,0'] },
  { name: 'curePoison', price: 200, ingredients: [47, 58, 64, 77], effect: '3,1', displayName: 'Cure Poison', textureRecord: 35, settings: { chanceBase: 5, chanceMod: 19 } },
  { name: 'orcStrength', price: 50, ingredients: [59, 61, 71], effect: '9,0', displayName: 'Orc Strength', textureRecord: 13, settings: { magnitudeLevelBase: 14, magnitudeLevelHigh: 14 } },
  { name: 'freeAction', price: 125, ingredients: [8, 28, 41, 64], effect: '26,255', displayName: 'Free Action', textureRecord: 14, settings: { chanceBase: 5, chanceMod: 19 } },
  { name: 'stamina', price: 25, ingredients: [27, 30, 59], effect: '10,9', displayName: 'Stamina', settings: { magnitudeBaseLow: 5, magnitudeBaseHigh: 5, magnitudeLevelBase: 4, magnitudeLevelHigh: 4 } },
  { name: 'healing', price: 50, ingredients: [16, 42, 62, 65], effect: '10,8', displayName: 'Healing', textureRecord: 15, settings: { magnitudeBaseLow: 5, magnitudeBaseHigh: 5, magnitudeLevelBase: 9, magnitudeLevelHigh: 9 } },
  { name: 'healTrue', price: 100, ingredients: [14, 16, 37, 62], effect: '10,8', displayName: 'Heal True', textureRecord: 16, settings: { magnitudeBaseLow: 5, magnitudeBaseHigh: 5, magnitudeLevelBase: 19, magnitudeLevelHigh: 19 } },
  { name: 'restorePower', price: 75, ingredients: [33, 54, 63, 73], effect: HEAL_SPELL_POINTS_KEY, displayName: 'Restore Power', textureRecord: 12, settings: { magnitudeBaseLow: 5, magnitudeBaseHigh: 5, magnitudeLevelBase: 4, magnitudeLevelHigh: 4 } },
  { name: 'levitation', price: 125, ingredients: [39, 59, 63], effect: '14,255', displayName: 'Levitation' },
  { name: 'waterWalking', price: 50, ingredients: [20, 29, 59, 69], effect: '31,255', displayName: 'Water Walking', textureRecord: 32 },
].map((r) => Object.freeze(withDisplayName(r))));

// The classic bottle icon for recipes that set no `textureRecord`.
export const POTION_DEFAULT_TEXTURE_RECORD = 11;
