import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSurvivalItem } from '../src/systems/survival/items.js';
import { TEMPLATE, rotFoodDay, FOOD_STAGE, removePutridFood } from '../src/systems/survival/food.js';
import { tidyFoodInventory } from '../src/systems/survival/foodInventory.js';
import { addItem } from '../src/systems/inventory.js';
import { cookFood } from '../src/systems/survival/camp.js';

test('raw and cooked meat stack separately while preserving freshness and rot protection', () => {
  const items = [];
  addItem(items, createSurvivalItem(TEMPLATE.RawMeat, { stackCount: 3 }));
  addItem(items, createSurvivalItem(TEMPLATE.RawMeat, { stackCount: 2 }));
  addItem(items, createSurvivalItem(TEMPLATE.Meat));
  addItem(items, createSurvivalItem(TEMPLATE.RawMeat, { foodStage: 1 }));
  addItem(items, { ...createSurvivalItem(TEMPLATE.RawMeat), noRot: true });
  addItem(items, { ...createSurvivalItem(TEMPLATE.RawMeat), slowRot: true });
  addItem(items, { ...createSurvivalItem(TEMPLATE.RawMeat), rotDay: 2 });
  assert.equal(items.length, 6); assert.equal(items[0].stackCount, 5);
});
test('older saves lose putrid food and combine matching meat in every supplied collection', () => {
  const collections = Array.from({ length: 4 }, () => [createSurvivalItem(TEMPLATE.RawMeat), createSurvivalItem(TEMPLATE.RawMeat), createSurvivalItem(TEMPLATE.Apple, { foodStage: 4 }), createSurvivalItem(TEMPLATE.Meat, { foodStage: 4 })]);
  for (const list of collections) { tidyFoodInventory(list); assert.equal(list.length, 1); assert.equal(list[0].stackCount, 2); }
});
test('food disappears on reaching putrid and already-putrid protected stacks are removed', () => {
  const list = [createSurvivalItem(TEMPLATE.Apple, { foodStage: FOOD_STAGE.Rotten }), { ...createSurvivalItem(TEMPLATE.RawMeat, { stackCount: 3, foodStage: 4 }), noRot: true }, createSurvivalItem(TEMPLATE.Meat)];
  rotFoodDay([list], 0, () => .999);
  assert.equal(list.length, 1); assert.equal(list[0].templateIndex, TEMPLATE.Meat);
  assert.equal(removePutridFood(null), 0);
});
test('cooking a meat stack spends one piece and merges the cooked result', () => {
  const raw = createSurvivalItem(TEMPLATE.RawMeat, { stackCount: 3 }), list = [raw];
  cookFood(raw, list); cookFood(raw, list);
  assert.equal(raw.stackCount, 1); assert.equal(list.length, 2);
  assert.equal(list.find((it) => it.templateIndex === TEMPLATE.Meat).stackCount, 2);
});
