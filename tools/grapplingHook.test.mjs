import assert from 'node:assert/strict';
import test from 'node:test';
import { lawfulItem } from '../src/items/itemLaw.js';
import { repairItemLists, savedItemLists } from '../src/saves/save.js';
import { ACTIONS, DEFAULT_BINDINGS } from '../src/ui/inputActions.js';
import { grappleClick, grappleFrame, grappleThrowing, grappleView, cancelGrapple } from '../src/combat/grapple/grapple.js';
import { stepHeavyGear } from '../src/combat/heavyGearRig.js';
import { getItemHands, ITEM_HANDS } from '../src/characters/equipTable.js';
import { createGrapplingHook } from '../src/systems/heavyGear.js';

test('the hook is a carried item: lawful, never held, and a hook saved as held goes back to the pack', () => {
  const hook = createGrapplingHook();
  assert.equal(lawfulItem(hook), true);
  assert.equal(getItemHands(hook), ITEM_HANDS.None);   // no hand: it cannot be equipped
  const pack = [{ ...hook, equipSlot: 19 }];
  repairItemLists(savedItemLists({ items: pack }));
  assert.equal(pack.length, 1);
  assert.equal(pack[0].equipSlot, undefined);
});

test('the hook has its own key action and needs no weapon in hand', () => {
  assert.ok(ACTIONS.includes('GrapplingHook'));
  assert.ok(DEFAULT_BINDINGS.some(([, action]) => action === 'GrapplingHook'));
  cancelGrapple();
  assert.equal(grappleClick(false), false);
  assert.equal(grappleClick(true), true);
  assert.equal(grappleThrowing(), true);
  assert.equal(grappleView().held, true);
  assert.equal(grappleClick(true), false);
  for (let i = 0; i < 20; i++) grappleFrame(0.05);
  assert.equal(grappleThrowing(), false);
  cancelGrapple();
});

test('without a hook in the pack the key says so and throws nothing', () => {
  cancelGrapple();
  const said = [];
  const base = { dt: 0.016, weapon: null, sheathed: true, held: false, canAttack: false, paralyzed: false, canHook: true, say: (l) => said.push(l) };
  stepHeavyGear({}, { ...base, hookDown: false, hasHook: false });
  stepHeavyGear({}, { ...base, hookDown: true, hasHook: false });
  assert.equal(grappleThrowing(), false);
  assert.equal(said.length, 1);
  stepHeavyGear({}, { ...base, hookDown: false, hasHook: true });
  stepHeavyGear({}, { ...base, hookDown: true, hasHook: true });
  assert.equal(grappleThrowing(), true);
  cancelGrapple();
});
