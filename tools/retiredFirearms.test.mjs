import assert from 'node:assert/strict';
import test from 'node:test';
import { judgeSave } from '../server-account/src/judge.js';
import { lawTemplate, lawfulItem } from '../src/items/itemLaw.js';
import { repairItemLists, savedItemLists } from '../src/saves/save.js';
import { quickslotSaveData, restoreQuickslotSaveData } from '../src/items/quickslots.js';
import { validLookItem } from '../src/net/wire.js';
import { armsTop } from '../src/net/siegeRef.js';
import { ArrowFlight } from '../src/combat/arrowFlight.js';
import { weaponTypeForItem, WEAPON_TYPES } from '../src/combat/fpsWeapon.js';
import { ammoCountFor } from '../src/items/inventory.js';
import { ketchSpoilsList } from '../src/systems/ketch/ketchSpoils.js';

const weapon = (templateIndex) => ({ group: 'Weapons', templateIndex, material: 0 });
const slot = (template) => ({ type: 'item', kind: 'weapon', key: 'Weapons|' + template + '|0||||||', name: 'Saved weapon' });

test('retired templates are unavailable to the current item and relay laws', () => {
  for (const template of [560, 561, 562, 565]) {   // 565 the grappling hook, a tool now
    assert.equal(lawTemplate(template), null);
    assert.equal(lawfulItem(weapon(template)), false);
    assert.equal(validLookItem({ ...weapon(template), equipSlot: 19 }), null);
    assert.equal(armsTop(template, 0), null);
  }
  for (const template of [129, 130, 563, 564]) {
    assert.ok(lawTemplate(template));
    assert.equal(weaponTypeForItem(weapon(template)), WEAPON_TYPES.Bow);
    assert.equal(ammoCountFor([{ ...weapon(561), stackCount: 20 }, { ...weapon(131), stackCount: 3 }], weapon(template)), 3);
  }
});

test('save repair removes retired templates from inventories and quickslots without shifting assignments', () => {
  const keep = weapon(131);
  const pack = [{ ...weapon(560), equipSlot: 19 }, keep];
  const stored = [weapon(561), { ...keep }];
  const save = { items: pack, wagonItems: stored };
  repairItemLists(savedItemLists(save));
  repairItemLists(savedItemLists(save));
  assert.deepEqual(pack.map(i => i.templateIndex), [131]);
  assert.deepEqual(stored.map(i => i.templateIndex), [131]);
  restoreQuickslotSaveData({ hotbar: [slot(560), slot(130)], hotbarPresets: [null, [slot(562), slot(129)]] });
  const slots = quickslotSaveData();
  assert.equal(slots.hotbar[0], null);
  assert.deepEqual(slots.hotbar[1], slot(130));
  assert.equal(slots.hotbarPresets[1][0], null);
  assert.deepEqual(slots.hotbarPresets[1][1], slot(129));
});

test('the account judge can read an old save while the live item law still refuses retired items', () => {
  const old = { items: [weapon(560), weapon(561), weapon(562)] };
  const baseline = judgeSave({ items: [] });
  assert.deepEqual(judgeSave(old), baseline);
});

test('ordinary arrows and carried Ballista bolts enter the flight simulation', () => {
  const flight = new ArrowFlight({ getGpuMesh: () => null });
  flight.fire([0, 2, 0], [0, 0, 1], { fromPlayer: true, weapon: weapon(130) });
  flight.fire([0, 2, 0], [0, 0, 1], { fromPlayer: true, weapon: weapon(564) });
  assert.equal(flight.arrows.length, 2);
  assert.equal(Boolean(flight.arrows[0].arc), false);
  assert.equal(Boolean(flight.arrows[1].arc), true);
});

test('Ketch receipts still award equipment and gold', () => {
  for (let seed = 1; seed <= 15; seed++) {
    const share = ketchSpoilsList(seed, 30);
    assert.equal(share.filter(x => x.kind === 'item').length, 2);
    assert.ok(share.find(x => x.kind === 'gold').gold > 0);
    assert.ok(share.every(x => ![560, 561, 562].includes(x.item?.templateIndex)));
  }
});
