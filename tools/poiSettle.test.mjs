// Tests the shared settlement rules (src/poi/poiSettle.js) and the account service's reward mint, run with:
//   node --test tools/poiSettle.test.mjs
// Covers potions named by recipe (minting, matching, counting and taking, spending Potent ones last), empty bottles,
// the names claims are counted under, and a take of the records a player hands over.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recordMatches, recordAccepts, countOf, takeableOf, takeStacks, takeChosen, handRecord, potionKeyOf, eventClaim, recipeClaim } from '../src/poi/poiSettle.js';
import { recipeWhy, gateCtx, createDm, branchOf } from '../src/poi/poiDmCore.js';
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

test('an event\'s claim and a recipe\'s claim never share a name, and other names stay as stored', () => {
  assert.notEqual(eventClaim('gift'), recipeClaim('event', 'gift'));
  assert.equal(eventClaim('gift'), 'event/gift');
  assert.equal(recipeClaim('nyra', 'brew'), 'nyra/brew');
  assert.equal(recipeClaim('trade', 'event'), 'trade/event');
  assert.notEqual(recipeClaim('event', 'x'), recipeClaim('trade', 'event'));
});

const sword = (/** @type {any} */ extra = {}) => ({ .../** @type {any} */ (mintGift({ template: 120, group: 'Weapons', material: 0, count: 1 })).item, ...extra });
const pick = (/** @type {any} */ save, /** @type {number} */ at, n = 1) => ({ at, n, rec: handRecord(save.items[at]) });
const LONGSWORD = { template: 120, group: 'Weapons', count: 1 };

test('a hand-over takes exactly the records named, and the others stay', () => {
  const save = { items: [sword({ enchantments: [{ type: 1, param: 2 }], value: 900 }), sword()], lightSourceIndex: -1 };
  assert.deepEqual(takeChosen(save, [LONGSWORD], [[pick(save, 1)]]), { ok: true, picks: [{ at: 1, n: 1 }] });
  assert.equal(save.items.length, 1);
  assert.deepEqual(save.items[0].enchantments, [{ type: 1, param: 2 }], 'the enchanted one stays');
  const moved = { items: [sword(), sword({ enchantments: [{ type: 1, param: 2 }] })] };
  const d = pick(moved, 0);
  moved.items.reverse();
  assert.deepEqual(takeChosen(moved, [LONGSWORD], [[d]]).picks, [{ at: 1, n: 1 }]);
  assert.deepEqual(moved.items.map((r) => r.enchantments?.length ?? 0), [1]);
  const two = { items: [sword({ equipSlot: 3 }), sword()] };
  assert.deepEqual(takeChosen(two, [LONGSWORD], [[pick(two, 0)]]).picks, [{ at: 1, n: 1 }]);
  assert.equal(two.items[0].equipSlot, 3);
});

test('a hand-over is refused, and nothing moves, when a record may not leave or is not the one described, or the picks do not add up', () => {
  const worn = { items: [sword({ equipSlot: 3 }), sword({ questItem: true }), sword({ bound: true })] };
  const before = JSON.stringify(worn);
  for (const at of [0, 1, 2]) assert.deepEqual(takeChosen(worn, [LONGSWORD], [[pick(worn, at)]]), { ok: false, why: 'hand' }, `record ${at}`);
  assert.equal(JSON.stringify(worn), before);
  const save = { items: [sword(), { ...potion('healing', 3) }] };
  const was = JSON.stringify(save);
  assert.equal(takeChosen(save, [LONGSWORD], [[{ at: 0, n: 1, rec: { ...handRecord(save.items[0]), currentCondition: 3 } }]]).ok, false, 'a description of no record held');
  assert.equal(takeChosen(save, [LONGSWORD], [[pick(save, 1)]]).ok, false, 'a record the stack does not accept');
  const heal = { template: 83, recipe: 'healing', count: 2 };
  assert.equal(takeChosen(save, [heal], [[pick(save, 1, 1)]]).ok, false, 'one short');
  assert.equal(takeChosen(save, [heal], [[pick(save, 1, 3)]]).ok, false, 'one over');
  assert.equal(takeChosen(save, [heal, heal], [[pick(save, 1, 2)], [pick(save, 1, 2)]]).ok, false, 'one record past its count for two stacks');
  assert.equal(takeChosen(save, [heal], []).ok, false, 'a list missing');
  assert.equal(JSON.stringify(save), was);
  assert.deepEqual(takeChosen(save, [heal, { ...heal, count: 1 }], [[pick(save, 1, 2)], [pick(save, 1, 1)]]), { ok: true, picks: [{ at: 1, n: 3 }] }, 'within its count, one record serves two stacks');
});

test('a chosen Potent potion of the recipe counts for a hand-over', () => {
  const save = pack();
  assert.deepEqual(takeChosen(save, [{ template: 83, recipe: 'healTrue', count: 1 }], [[pick(save, 3)]]), { ok: true, picks: [{ at: 3, n: 1 }] });
  assert.deepEqual(left(save), [[0, 0, 3], [keyOf('purification'), 0, 1], [keyOf('healTrue'), 0, 1], [keyOf('healing'), 0, 2]], 'the Potent one left, the plain one stays');
});

test('a description leaves out what never tells two items apart, except a letter of credit\'s value', () => {
  const d = handRecord(sword({ equipSlot: 3, stackCount: 1, acquired: 5 }));
  for (const k of ['equipSlot', 'stackCount', 'value', 'acquired']) assert.equal(k in d, false, k);
  assert.equal(d.currentCondition, 1600);
  assert.equal(handRecord({ templateIndex: 275, group: 'Currency', value: 500 }).value, 500);
});

test('a requirement counts only records a take may spend; a condition counts every record held', () => {
  const save = { items: [sword({ equipSlot: 3 }), sword({ questItem: true })] };
  assert.equal(countOf(save, LONGSWORD), 2);
  assert.equal(takeableOf(save, LONGSWORD), 0);
  const ctx = { count: (/** @type {any} */ s) => countOf(save, s), takeable: (/** @type {any} */ s) => takeableOf(save, s), gold: 0, getVar: () => undefined };
  const who = { char: 'c', player: 'p', nowS: 0 };
  assert.equal(recipeWhy({ requireItems: [LONGSWORD] }, who, ctx, () => null), 'items');
  assert.equal(recipeWhy({ when: { k: 'has_item', item: LONGSWORD } }, who, ctx, () => null), null);
  save.items.push(sword());
  assert.equal(recipeWhy({ requireItems: [LONGSWORD] }, who, ctx, () => null), null);
});

test('a condition that gates a take counts only records that may leave; a plain condition counts every one', () => {
  const save = { items: [sword({ equipSlot: 3 })] };
  const ctx = { count: (/** @type {any} */ s) => countOf(save, s), takeable: (/** @type {any} */ s) => takeableOf(save, s), gold: 0, getVar: () => undefined };
  const has = { k: 'has_item', item: LONGSWORD };
  const who = { char: 'c', player: 'p', nowS: 0 };
  assert.equal(recipeWhy({ when: has, requireItems: [LONGSWORD] }, who, ctx, () => null), 'when', 'the recipe takes the sword its condition checks');
  assert.equal(recipeWhy({ when: has, requireItems: [] }, who, ctx, () => null), null);
  assert.equal(gateCtx(ctx, [{ template: 83, count: 1 }]).count(LONGSWORD), 1, 'a take of another item gates nothing');
  const doc = { v: 2, variables: [], events: [
    { key: 'toll', trigger: { k: 'chained' }, when: has, then: [{ k: 'take_item', item: LONGSWORD }], else: [{ k: 'say', text: 'Bring one.' }] },
    { key: 'look', trigger: { k: 'chained' }, when: has, then: [{ k: 'say', text: 'Nice sword.' }] }] };
  const dm = createDm(doc);
  dm.read = () => ctx;
  assert.equal(branchOf(doc.events[0], dm), 'else', 'worn: the toll asks for a sword the player can hand over');
  assert.equal(branchOf(doc.events[1], dm), 'then', 'worn still counts as held where nothing is taken');
});

test('the wagon a save drives while it holds goods may not leave, as in a realm trade; an empty one may', () => {
  const CART = { template: 93, group: 'Transportation', count: 1 };
  const cart = () => /** @type {any} */ (mintGift({ template: 93, group: 'Transportation', count: 1 })).item;
  const iron = /** @type {any} */ (mintGift({ template: 71, count: 40 })).item;
  const loaded = { items: [cart()], wagonItems: [iron] };
  const before = JSON.stringify(loaded);
  assert.equal(takeableOf(loaded, CART), 0);
  assert.equal(countOf(loaded, CART), 1, 'a condition still sees the cart');
  assert.deepEqual(takeStacks(loaded, [CART]), { ok: false, why: 'items' });
  assert.deepEqual(takeChosen(loaded, [CART], [[pick(loaded, 0)]]), { ok: false, why: 'hand' });
  assert.equal(JSON.stringify(loaded), before);
  const empty = { items: [cart()], wagonItems: [] };
  assert.equal(takeableOf(empty, CART), 1);
  assert.equal(takeChosen(empty, [CART], [[pick(empty, 0)]]).ok, true);
});
