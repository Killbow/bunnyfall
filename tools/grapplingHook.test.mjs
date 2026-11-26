import assert from 'node:assert/strict';
import test from 'node:test';
import { lawfulItem } from '../src/items/itemLaw.js';
import { repairItemLists, savedItemLists } from '../src/saves/save.js';
import { ACTIONS, DEFAULT_BINDINGS } from '../src/ui/inputActions.js';
import { grappleClick, grappleFrame, grappleThrowing, grappleView, cancelGrapple } from '../src/combat/grapple/grapple.js';
import { stepHeavyGear } from '../src/combat/heavyGearRig.js';
import { getItemHands, ITEM_HANDS } from '../src/characters/equipTable.js';
import { createGrapplingHook } from '../src/systems/heavyGear.js';
import { equipItem } from '../src/characters/equip.js';
import { attachTouch } from '../src/ui/touch.js';
import { held } from '../src/ui/input.js';
import { setPref } from '../src/ui/uiPrefs.js';

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

test('a two-handed weapon in hand does not let the hook be equipped', () => {
  const claymore = { group: 'Weapons', templateIndex: 122, material: 0, stackCount: 1 };
  const hook = createGrapplingHook();
  const entity = { items: [claymore, hook] };
  assert.notEqual(equipItem(entity, claymore), null);
  const slot = claymore.equipSlot;
  assert.equal(equipItem(entity, hook), null);
  assert.equal(hook.equipSlot, undefined);
  assert.equal(claymore.equipSlot, slot);
});

test('a tap on the touch Grappling hook button throws the hook, even one shorter than a frame', () => {
  const keys = new Set();
  const els = [];
  const el = () => {
    const e = { style: {}, attrs: {}, on: {}, addEventListener(type, fn) { (this.on[type] ??= []).push(fn); }, removeEventListener() {},
      appendChild: (c) => c, remove() {}, setAttribute(k, v) { this.attrs[k] = v; }, classList: { add() {}, remove() {}, toggle() {} },
      getBoundingClientRect: () => ({ x: 0, y: 0, width: 100, height: 100, left: 0, top: 0, right: 100, bottom: 100 }) };
    els.push(e);
    return e;
  };
  const saved = { window: globalThis.window, document: globalThis.document, KeyboardEvent: globalThis.KeyboardEvent,
    requestAnimationFrame: globalThis.requestAnimationFrame };
  let queued = [];
  globalThis.requestAnimationFrame = (fn) => queued.push(fn);
  globalThis.document = { createElement: el, body: el(), documentElement: el(), addEventListener() {}, removeEventListener() {} };
  globalThis.window = { location: { search: '?touch=on' }, navigator: {}, innerWidth: 800, innerHeight: 400, addEventListener() {}, removeEventListener() {},
    dispatchEvent: (e) => { if (e.type === 'keydown') keys.add(e.code); else if (e.type === 'keyup') keys.delete(e.code); } };
  globalThis.KeyboardEvent = class { constructor(type, o) { this.type = type; Object.assign(this, o); } };
  setPref('touchButton3', 'GrapplingHook');
  const layer = attachTouch(el(), { look() {} });
  try {
    cancelGrapple();
    const rig = {};
    const frame = () => {
      stepHeavyGear(rig, { dt: 0.016, weapon: null, sheathed: true, held: false, canAttack: false, paralyzed: false,
        hookDown: held(keys, 'GrapplingHook'), canHook: true, hasHook: true, say: () => {} });
      const now = queued; queued = []; for (const fn of now) fn();
    };
    frame();
    const button = els.find((e) => e.attrs['aria-label'] === 'Grappling hook');
    const touch = { preventDefault() {}, stopPropagation() {} };
    button.on.touchstart[0](touch);
    button.on.touchend[0](touch);
    frame();
    assert.equal(grappleThrowing(), true);
    frame();
    frame();
    assert.equal(held(keys, 'GrapplingHook'), false);
  } finally {
    layer?.dispose?.();
    cancelGrapple();
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; }
  }
});
