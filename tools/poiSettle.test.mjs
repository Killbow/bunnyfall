// Checks for the shared settle rules (src/poi/poiSettle.js), run with:
//   node --test tools/poiSettle.test.mjs
// They cover empty bottles and the recipe names a stack takes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { countOf, takeStacks, potionKeyOf } from '../src/poi/poiSettle.js';
import { mintGift } from '../server-account/src/staffGive.js';
import { createPotion } from '../src/systems/loot/loot.js';
import { POTION_RECIPES, potionRecipeKey } from '../src/systems/potionRecipes.js';

const keyOf = (/** @type {string} */ name) => potionRecipeKey(/** @type {any} */ (POTION_RECIPES.find((r) => r.name === name)).ingredients);
const potion = (/** @type {string} */ name, n = 1, extra = {}) => ({ ...createPotion(keyOf(name)), ...(n > 1 ? { stackCount: n } : {}), ...extra });
const bottles = (/** @type {number} */ n) => /** @type {any} */ (mintGift({ template: 83, count: n })).item;
/** Builds a test pack with 3 empty bottles, a Purification, a Heal True, a Potent Heal True, and 2 Healing. */
const pack = () => ({ items: [bottles(3), potion('purification'), potion('healTrue'), potion('healTrue', 1, { potent: 40 }), potion('healing', 2)], lightSourceIndex: -1 });
const left = (/** @type {any} */ save) => save.items.map((/** @type {any} */ r) => [r.potionRecipeKey ?? 0, r.potent ?? 0, r.stackCount ?? 1]);

test('a bottle stack matches only empty bottles: a take of one never removes a potion', () => {
  const save = pack();
  assert.equal(countOf(save, { template: 83, count: 1 }), 3);
  assert.equal(takeStacks(save, [{ template: 83, count: 1 }]).ok, true);
  assert.deepEqual(left(save), [[0, 0, 2], [keyOf('purification'), 0, 1], [keyOf('healTrue'), 0, 1], [keyOf('healTrue'), 40, 1], [keyOf('healing'), 0, 2]]);
  assert.equal(takeStacks(save, [{ template: 83, count: 3 }]).ok, false, 'two empty bottles are left, and potions do not count');
});

test('recipe names are the game\'s twenty, by their keys', () => {
  assert.equal(POTION_RECIPES.length, 20);
  for (const r of POTION_RECIPES) assert.equal(potionKeyOf(r.name), potionRecipeKey(r.ingredients));
  assert.equal(potionKeyOf('Heal True'), null);
  assert.equal(potionKeyOf(undefined), null);
});
