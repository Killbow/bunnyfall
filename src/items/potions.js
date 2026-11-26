// Classic Daggerfall potion mixing: recipe lookup by ingredient hash, drink bundles, and the cauldron steps.
import { templateByIndex } from './itemTemplates.js';
import {
  POTION_RECIPES, POTION_DEFAULT_TEXTURE_RECORD, potionRecipeKey, potionKeyFromCauldron, setPotionDisplayNames,
} from './potionRecipes.js';
import { localizedStrings } from '../ui/textManager.js';
export { POTION_RECIPES, POTION_DEFAULT_TEXTURE_RECORD, potionRecipeKey, potionKeyFromCauldron };

const POTION_NAME_TEXT = localizedStrings({
  resistFire: 'Resist Fire', resistFrost: 'Resist Frost', resistShock: 'Resist Shock', resistPoison: 'Resist Poison',
  slowFalling: 'Slow Falling', waterBreathing: 'Water Breathing', chameleonForm: 'Chameleon Form',
  invisibility: 'Invisibility', shadowForm: 'Shadow Form', cureDisease: 'Cure Disease', purification: 'Purification',
  curePoison: 'Cure Poison', orcStrength: 'Orc Strength', freeAction: 'Free Action', stamina: 'Stamina',
  healing: 'Healing', healTrue: 'Heal True', restorePower: 'Restore Power', levitation: 'Levitation',
  waterWalking: 'Water Walking',
});
setPotionDisplayNames(POTION_NAME_TEXT);

const _byKey = new Map(POTION_RECIPES.map((r) => [potionRecipeKey(r.ingredients), r]));
const _recipeOverrides = new Map();
// Mod recipes replace built-in ones that share their ingredient key.
export function overridePotionRecipes(rows) {
  _recipeOverrides.clear();
  for (const r of rows ?? []) _recipeOverrides.set(potionRecipeKey(r.ingredients), Object.isFrozen(r) ? r : Object.freeze(r));
}
export const potionRecipeByKey = (key) => _recipeOverrides.get(key) ?? _byKey.get(key) ?? null;

// All effects share one settings object from the recipe, as in classic, so secondary effects get the same numbers.
// rangeType 0 is caster only, and element 4 is Magic, which picks the drink sound.
export function potionBundle(recipeKey) {
  const recipe = potionRecipeByKey(recipeKey);
  if (!recipe) return null;
  const settings = recipe.settings ?? {};
  const entry = (id) => {
    const slot = { ...BLANK_EFFECT_SETTINGS, ...settings };
    const pair = /^\d+,\d+$/.test(id) ? id.split(',').map(Number) : null;
    return pair
      ? { type: pair[0], subType: pair[1], ...slot }
      : { type: -1, subType: -1, key: id, ...slot };
  };
  return {
    name: recipe.displayName,
    rangeType: 0,
    element: 4,
    bundleType: 'potion',
    effects: [entry(recipe.effect), ...(recipe.secondary ?? []).map(entry)],
  };
}

const BLANK_EFFECT_SETTINGS = Object.freeze({
  durationBase: 1, durationMod: 1, durationPerLevel: 1,
  chanceBase: 1, chanceMod: 1, chancePerLevel: 1,
  magnitudeBaseLow: 1, magnitudeBaseHigh: 1,
  magnitudeLevelBase: 1, magnitudeLevelHigh: 1, magnitudePerLevel: 1,
});
export const potionRecipeKeys = () => [...(_byKey.keys())];

// A failed mix makes nothing, unlike classic's useless potion; the caller spends the ingredients either way.
export function mixCauldron(templateIndices) {
  const key = potionKeyFromCauldron(templateIndices);
  const recipe = potionRecipeByKey(key);
  return recipe ? { kind: 'mixed', recipe, key } : { kind: 'failed' };
}

export const isIngredient = (item) => !!templateByIndex(item?.templateIndex)?.isIngredient;

export const knownRecipes = (recipeKeys = []) =>
  [...new Set(recipeKeys)].map((k) => potionRecipeByKey(k)).filter(Boolean)
    .sort((a, b) => (a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : 0));

export const CAULDRON_CAPACITY = 8;

export const cauldronAccepts = (cauldron) => cauldron.length < CAULDRON_CAPACITY;

// As in DFU, an ingredient in neither the pack nor the wagon stops the walk and leaves the rest unspent.
export function consumeCauldron(cauldron, { takeFromPack, takeFromWagon }) {
  for (let i = 0; i < cauldron.length; i++) {
    const templateIndex = cauldron[i].templateIndex;
    const group = cauldron[i].group;
    if (takeFromPack(templateIndex, group)) continue;
    if (takeFromWagon(templateIndex, group)) continue;
    return { kind: 'broke', at: i };
  }
  return { kind: 'spent' };
}

export function gatherRecipe(recipe, availableTemplateIndices) {
  const pool = [...availableTemplateIndices];
  const found = [], missing = [];
  for (const id of recipe.ingredients) {
    const at = pool.indexOf(id);
    if (at < 0) { missing.push(id); continue; }
    pool.splice(at, 1);
    found.push(id);
  }
  return { found, missing };
}
