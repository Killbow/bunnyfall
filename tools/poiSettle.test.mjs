// Tests the shared settlement rules (src/poi/poiSettle.js) and the account service's reward mint, run with:
//   node --test tools/poiSettle.test.mjs
// They cover potions named by recipe (the mint, matching, has and take, Potent ones last) and empty bottles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recordMatches, recordAccepts, countOf, takeStacks, potionKeyOf } from '../src/poi/poiSettle.js';
import { mintGift } from '../server-account/src/staffGive.js';
import { createPotion } from '../src/systems/loot/loot.js';
import { POTION_RECIPES, potionRecipeKey } from '../src/systems/potionRecipes.js';
import { itemFindings } from '../src/systems/item/itemLaw.js';
import { itemNameParts } from '../src/systems/item/itemInfo.js';

const keyOf = (/** @type {string} */ name) => potionRecipeKey(/** @type {any} */ (POTION_RECIPES.find((r) => r.name === name)).ingredients);
const potion = (/** @type {string} */ name, n = 1, extra = {}) => ({ ...createPotion(keyOf(name)), ...(n > 1 ? { stackCount: n } : {}), ...extra });
const bottles = (/** @type {number} */ n) => /** @type {any} */ (mintGift({ template: 83, count: n })).item;
/** Builds a test pack with 3 empty bottles, a Purification, a Heal True, a Potent Heal True, and 2 Healing. */
const pack = () => ({ items: [bottles(3), potion('purification'), potion('healTrue'), potion('healTrue', 1, { potent: 40 }), potion('healing', 2)], lightSourceIndex: -1 });
const left = (/** @type {any} */ save) => save.items.map((/** @type {any} */ r) => [r.potionRecipeKey ?? 0, r.potent ?? 0, r.stackCount ?? 1]);

test('the service mints a named potion as the game makes it: Heal True, worth 100, lawful, and named', () => {
  const g = /** @type {any} */ (mintGift({ template: 83, recipe: 'healTrue', count: 2 }));
  assert.equal(g.error, undefined);
  const made = createPotion(keyOf('healTrue'));
  assert.equal(g.item.potionRecipeKey, keyOf('healTrue'));
  assert.equal(g.item.value, 100);
  assert.equal(g.item.value, made.value);
  assert.equal(g.item.worldTextureRecord, made.worldTextureRecord);
  assert.equal(g.item.stackCount, 2);
  assert.equal(g.item.potent, undefined, 'never a Potent one');
  assert.deepEqual(g.findings, []);
  assert.deepEqual(itemFindings(g.item), []);
  assert.equal(itemNameParts(g.item).name, 'Potion of Heal True');
});

test('the mint refuses a recipe the game does not know and a recipe on any other item', () => {
  assert.equal(/** @type {any} */ (mintGift({ template: 83, recipe: 'greaterHealing', count: 1 })).error, 'staff-item-template');
  assert.equal(/** @type {any} */ (mintGift({ template: 83, recipe: 7, count: 1 })).error, 'staff-item-template');
  assert.equal(/** @type {any} */ (mintGift({ template: 71, recipe: 'healing', count: 1 })).error, 'staff-item-template');
  assert.equal(/** @type {any} */ (mintGift({ template: 113, recipe: 'healing' })).error, 'staff-item-template');
  // without a recipe the Glass Bottle is still an empty bottle
  const empty = /** @type {any} */ (mintGift({ template: 83, count: 1 })).item;
  assert.ok(!empty.potionRecipeKey);
});

test('a bottle stack matches only empty bottles: a take of one never removes a potion', () => {
  const save = pack();
  assert.equal(countOf(save, { template: 83, count: 1 }), 3);
  assert.equal(takeStacks(save, [{ template: 83, count: 1 }]).ok, true);
  assert.deepEqual(left(save), [[0, 0, 2], [keyOf('purification'), 0, 1], [keyOf('healTrue'), 0, 1], [keyOf('healTrue'), 40, 1], [keyOf('healing'), 0, 2]]);
  assert.equal(takeStacks(save, [{ template: 83, count: 3 }]).ok, false, 'two empty bottles are left, and potions do not count');
});

test('a recipe stack counts Potent potions too, and a take spends them only when no plain one is left', () => {
  const save = pack();
  assert.equal(countOf(save, { template: 83, recipe: 'healTrue', count: 1 }), 2, 'the plain and the Potent Heal True');
  assert.equal(countOf(save, { template: 83, recipe: 'healing', count: 1 }), 2);
  assert.equal(countOf(save, { template: 83, recipe: 'invisibility', count: 1 }), 0);
  assert.equal(countOf(save, { template: 83, recipe: 'nonsense', count: 1 }), 0);
  const potent = potion('healTrue', 1, { potent: 40 });
  assert.equal(recordMatches(potent, { template: 83, recipe: 'healTrue', count: 1 }), false, 'not the exact item');
  assert.equal(recordAccepts(potent, { template: 83, recipe: 'healTrue', count: 1 }), true, 'but accepted for it');
  assert.equal(recordAccepts(potent, { template: 83, recipe: 'healing', count: 1 }), false);
  assert.equal(recordAccepts(potent, { template: 83, count: 1 }), false, 'a bottle stack takes only empty bottles');
  assert.equal(takeStacks(save, [{ template: 83, recipe: 'healTrue', count: 1 }]).ok, true);
  assert.deepEqual(left(save), [[0, 0, 3], [keyOf('purification'), 0, 1], [keyOf('healTrue'), 40, 1], [keyOf('healing'), 0, 2]], 'the plain one first');
  assert.equal(takeStacks(save, [{ template: 83, recipe: 'healTrue', count: 1 }]).ok, true);
  assert.deepEqual(left(save), [[0, 0, 3], [keyOf('purification'), 0, 1], [keyOf('healing'), 0, 2]], 'then the Potent one');
  const before = left(save);
  assert.equal(takeStacks(save, [{ template: 83, recipe: 'healTrue', count: 1 }]).ok, false);
  assert.deepEqual(left(save), before, 'a refused take changes nothing');
  // Spend the plain potion first even when the Potent stack is smaller.
  const two = { items: [potion('healing', 3), potion('healing', 1, { potent: 25 })] };
  assert.equal(takeStacks(two, [{ template: 83, recipe: 'healing', count: 2 }]).ok, true);
  assert.deepEqual(left(two), [[keyOf('healing'), 0, 1], [keyOf('healing'), 25, 1]]);
  assert.equal(takeStacks(two, [{ template: 83, recipe: 'healing', count: 2 }]).ok, true, 'one plain and one Potent cover two');
  assert.deepEqual(left(two), []);
});

test('recipe names are the game\'s twenty, by their keys', () => {
  assert.equal(POTION_RECIPES.length, 20);
  for (const r of POTION_RECIPES) assert.equal(potionKeyOf(r.name), potionRecipeKey(r.ingredients));
  assert.equal(potionKeyOf('Heal True'), null);
  assert.equal(potionKeyOf(undefined), null);
});
