// BUNNYFALL CRAFTING REWORK, PHASE 2: UPGRADES. A temper reaches Masterwork, capped by the rank, its cost rising with
// the quality (40/40/80/150% of the main input, 100/100/300/1000 gold); a plain found piece takes a Magic roll at
// Superior and a Rare one at Masterwork. A found metal piece moves one metal up for 80% of the new metal's recipe.
import '../chargenDom.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { standService, sessionStorageOf } from '../accountDb.mjs';
import { accountProf, SESSION_KEY } from '../../src/net/accountClient.js';
import { createProfBook } from '../../src/net/profBook.js';
import { xpForRank } from '../../src/net/professionLaw.js';
import { recipeById } from '../../src/net/recipeLaw.js';
import { temperCost, temperCap, temperGold, temperRefusal, TEMPER_TOP } from '../../src/net/temperLaw.js';
import { upgradeRecipeOf, upgradeRefusal, metalUpgradeCost, upgradeGold } from '../../src/net/upgradeLaw.js';
import { temperItem, upgradeMaterialItem } from '../../src/systems/smithItems.js';
import { weaponOfMaterial, armorOfMaterial } from '../../src/combat/enemyEquipment.js';

const memStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
let _rid = 0;
const rid = () => `bfupg-${String(++_rid).padStart(6, '0')}`;

async function stand({ smithing = 0, stores = {} } = {}) {
  const s = await standService({ PROFESSIONS_OPEN: 'on', MARKS_OPEN: 'on' });
  const raw = s.env.DB._raw;
  const mac = await s.seated('Mac');
  raw.prepare('INSERT INTO prof_tracks (player, char_id, profession, xp, updated_at) VALUES (?, ?, ?, ?, 1)').run(mac.id, mac.character, 'smithing', xpForRank(smithing));
  for (const [k, n] of Object.entries(stores)) raw.prepare("INSERT INTO prof_stores (player, char_id, material, origin, qty) VALUES (?, ?, ?, 'own', ?)").run(mac.id, mac.character, k, n);
  const door = accountProf({ fetch: s.fetch, storage: sessionStorageOf(SESSION_KEY, mac) });
  const book = createProfBook({ door, storage: memStorage(), character: () => mac.character, sleep: () => Promise.resolve() });
  assert.equal((await book.refresh()).ok, true);
  const held = (key) => Number(raw.prepare('SELECT COALESCE(SUM(qty), 0) AS n FROM prof_stores WHERE player = ? AND material = ?').get(mac.id, key).n);
  return { s, raw, mac, book, held };
}

test('BUNNYFALL UPGRADE law: tempers to Masterwork, rank-capped, dearer as they climb', () => {
  const r = recipeById('longsword:steel');
  assert.equal(TEMPER_TOP, 4);
  assert.deepEqual([1, 2, 3].map((q) => temperCost(r, q).n), [2, 3, 5], '40%, 80%, 150% of 3 ingots, rounded up');
  assert.deepEqual([1, 2, 3].map(temperGold), [100, 300, 1000]);
  assert.deepEqual([10, 25, 40, 70].map((k) => temperCap(r, k)), [2, 3, 4, 4], 'the best the craft could roll at that margin');
  const w = weaponOfMaterial(120, 1);
  for (const q of [1, 2, 3]) assert.equal(temperItem(w, { quality: q + 1 }), true);
  assert.equal(w.quality, 4);
  assert.equal(w.rarity, 'magic', 'a plain piece takes a Magic roll at Superior');
  assert.equal(temperRefusal(w), 'masterwork');
});

test('BUNNYFALL UPGRADE law: one metal up, lines kept, Daedric the top, chain and leather never', () => {
  const w = weaponOfMaterial(120, 0);
  w.rarity = 'rare'; w.affixes = [{ id: 'damage', value: 3 }];
  const next = upgradeRecipeOf(w);
  assert.equal(next.id, 'longsword:steel');
  assert.deepEqual(metalUpgradeCost(next), { key: 'ingot:steel', n: 3 });
  assert.equal(upgradeGold(next), 400);
  const was = w.value;
  assert.equal(upgradeMaterialItem(w, next), true);
  assert.equal(w.material, 1);
  assert.ok(w.value > was);
  assert.deepEqual([w.rarity, w.affixes.length], ['rare', 1], 'its lines kept');
  assert.equal(upgradeRefusal(weaponOfMaterial(120, 9)), 'top');
  assert.equal(upgradeRefusal(armorOfMaterial(102, 0x100)), 'not', 'chain');
  assert.equal(upgradeRefusal(armorOfMaterial(102, 0)), 'not', 'leather');
  assert.equal(upgradeRefusal({ ...weaponOfMaterial(120, 2), provenance: '0123456789abcdef' }), 'made');
  assert.equal(upgradeRecipeOf(armorOfMaterial(102, 0x200 + 4))?.id, 'cuirass:mithril');
});

test('BUNNYFALL UPGRADE service: the temper takes the new cost and cap; the material upgrade spends 80% and pays XP', async () => {
  const t = await stand({ smithing: 10, stores: { 'ingot:steel': 20 } });
  const r1 = await t.book.temper('longsword:steel', 1, null);
  assert.equal(r1.ok, true, JSON.stringify(r1));
  assert.equal(t.held('ingot:steel'), 18, '40% of 3, rounded up');
  const r2 = await t.book.temper('longsword:steel', 2, null);
  assert.equal(r2.error, 'prof-temper-rank', 'rank 10 is 0 over Steel: Fine is its top');
  const u = await t.book.upgrade('longsword:steel', 'sword-1');
  assert.equal(u.ok, true, JSON.stringify(u));
  assert.equal(t.held('ingot:steel'), 15, '80% of 3, rounded up');
  assert.ok(u.data.xp > 0);
  const low = await t.book.upgrade('longsword:mithril', 'sword-2');
  assert.equal(low.error, 'prof-rank');
  const bad = await t.s.call('/v1/prof/upgrade', { character: t.mac.character, recipe: 'staff:pine', rid: rid() }, t.mac.secret);
  assert.equal(bad.body.error, 'prof-upgrade');
});
