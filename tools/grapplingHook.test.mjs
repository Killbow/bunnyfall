import assert from 'node:assert/strict';
import test from 'node:test';
import { lawTemplate, lawfulItem } from '../src/items/itemLaw.js';
import { repairItemLists, savedItemLists } from '../src/saves/save.js';
import { quickslotSaveData, restoreQuickslotSaveData } from '../src/items/quickslots.js';
import { validLookItem } from '../src/net/wire.js';
import { ACTIONS, DEFAULT_BINDINGS } from '../src/ui/inputActions.js';
import { grappleClick, grappleFrame, grappleThrowing, grappleView, cancelGrapple } from '../src/combat/grapple/grapple.js';
import { heavyGearShelfStock, rollHeavyGearLoot } from '../src/systems/heavyGear.js';

const hook = { group: 'Weapons', templateIndex: 565, material: 0 };

test('the grappling hook is no item: the old one is cleared from saves, quickslots, the wire and the law', () => {
  assert.equal(lawTemplate(565), null);
  assert.equal(lawfulItem(hook), false);
  assert.equal(validLookItem({ ...hook, equipSlot: 19 }), null);
  const pack = [{ ...hook, equipSlot: 19 }, { group: 'Weapons', templateIndex: 113, material: 0 }];
  const save = { items: pack, wagonItems: [{ ...hook }] };
  repairItemLists(savedItemLists(save));
  assert.deepEqual(pack.map((i) => i.templateIndex), [113]);
  assert.equal(save.wagonItems.length, 0);
  restoreQuickslotSaveData({ hotbar: [{ type: 'item', kind: 'weapon', key: 'Weapons|565|0||||||', name: 'Grappling Hook' }] });
  assert.equal(quickslotSaveData().hotbar[0], null);
});

test('no shop or pile makes a hook any more', () => {
  for (const kind of ['GeneralStore', 'PawnShop', 'WeaponSmith']) assert.ok(heavyGearShelfStock(kind, 0, 20, () => 0).every((i) => i.templateIndex !== 565));
  assert.ok(rollHeavyGearLoot([], () => 0).every((i) => i.templateIndex !== 565));
});

test('the hook has its own key action and needs no weapon in hand', () => {
  assert.ok(ACTIONS.includes('GrapplingHook'));
  assert.ok(DEFAULT_BINDINGS.some(([, action]) => action === 'GrapplingHook'));
  cancelGrapple();
  assert.equal(grappleClick(false), false);
  assert.equal(grappleClick(true), true);   // no item held, nothing equipped
  assert.equal(grappleThrowing(), true);
  assert.equal(grappleView().held, true);
  assert.equal(grappleClick(true), false);   // already throwing
  for (let i = 0; i < 20; i++) grappleFrame(0.05);
  assert.equal(grappleThrowing(), false);
  cancelGrapple();
});
