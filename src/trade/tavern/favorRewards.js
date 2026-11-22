// @ts-check
import { favorLegendary } from './favorLegendary.js';
import { welkyndShards } from '../../worldEvents/gateSpoils.js';
import { createPotion } from '../../items/loot.js';
import { POTION_RECIPES, potionRecipeKey } from '../../items/potionRecipes.js';
export function favorReward(id, roll = Math.random) {
  if (id === 'legendary') return favorLegendary(roll);
  if (id === 'shards') return welkyndShards(5);
  const recipe = POTION_RECIPES.find((r) => r.name === ({ stamina: 'stamina', magicka: 'restorePower' })[id]);
  return recipe ? Object.assign(createPotion(potionRecipeKey(recipe.ingredients)), { stackCount: 3 }) : null;
}
