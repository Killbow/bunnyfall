// BUNNYFALL CRAFTING REWORK, PHASE 1: SALVAGE ANYTHING. Found gear breaks into its recipe's materials (about 40%), into
// the Stores as the character's own, with a little XP; a request asked twice is answered once.
import '../chargenDom.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { standService } from '../accountDb.mjs';
import { salvageRecipeOf, expectedYield, rollSalvage, previewSalvage, GEAR_SALVAGE_SHARE, roundAtRandom } from '../../src/net/salvageLaw.js';
import { seededRng } from '../../src/systems/wind/wind.js';

const longsword = { templateIndex: 120, material: 4, group: 'Weapons', maxCondition: 100, currentCondition: 100 };

test('BUNNYFALL SALVAGE law: the recipe a piece breaks back into, 40% of it, less when worn', () => {
  assert.equal(salvageRecipeOf(longsword)?.id, 'longsword:dwarven');
  assert.equal(salvageRecipeOf({ templateIndex: 102, material: 0x0200, group: 'Armor' })?.id, 'cuirass:iron');
  assert.equal(salvageRecipeOf({ templateIndex: 130, material: 1, group: 'Weapons' })?.id, 'longbow:oak');
  assert.equal(salvageRecipeOf({ templateIndex: 200, material: 0, group: 'Jewellery' }), null, 'no recipe, nothing');
  const y = expectedYield(salvageRecipeOf(longsword), 1);
  assert.deepEqual(y.find((i) => i.key === 'ingot:dwarven'), { key: 'ingot:dwarven', n: 3 * GEAR_SALVAGE_SHARE });
  assert.ok(expectedYield(salvageRecipeOf(longsword), 0)[0].n < y[0].n, 'a broken piece gives less');
  assert.equal(roundAtRandom(1.2, 0.1), 2);
  assert.equal(roundAtRandom(1.2, 0.5), 1);
  assert.equal(previewSalvage([longsword])[0].key, 'ingot:dwarven');
});

test('BUNNYFALL SALVAGE law: the random rounding keeps the average over many pieces', () => {
  const r = rollSalvage(Array.from({ length: 1000 }, () => ({ t: 120, m: 4, g: 'Weapons', c: 1 })), seededRng(7));
  const ingots = r.yields.find((y) => y.key === 'ingot:dwarven').n;
  assert.ok(Math.abs(ingots - 1200) < 60, `about 1.2 an ingot a sword (${ingots} for 1000)`);
  assert.equal(r.broken, 1000);
  assert.ok(r.xp.smithing > 0);
});

test('BUNNYFALL SALVAGE service: the materials into the Stores as own, the XP onto the track, a repeat answered once', async () => {
  const s = await standService({ PROFESSIONS_OPEN: 'on', MARKS_OPEN: 'on' });
  const raw = s.env.DB._raw;
  const mac = await s.seated('Mac');
  const ask = (body) => s.call('/v1/prof/salvage', { character: mac.character, ...body }, mac.secret);
  const pieces = [{ t: 120, m: 4, g: 'Weapons', c: 1 }, { t: 102, m: 0x0200, g: 'Armor', c: 1 }];
  const r = await ask({ rid: 'salvage-0000001', pieces });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.pieces, 2);
  const held = (key) => Number(raw.prepare("SELECT COALESCE(SUM(qty), 0) AS n FROM prof_stores WHERE player = ? AND material = ? AND origin = 'own'").get(mac.id, key).n);
  for (const y of r.body.yields) assert.equal(held(y.key), y.n, `${y.key} landed as own`);
  assert.ok(held('ingot:iron') >= 2, 'a cuirass gives at least 2 of its 6 iron ingots');
  const xp = Number(raw.prepare("SELECT xp FROM prof_tracks WHERE player = ? AND profession = 'smithing'").get(mac.id).xp);
  assert.ok(xp > 0, 'Smithing XP');
  const again = await ask({ rid: 'salvage-0000001', pieces });
  assert.equal(again.body.repeat, true);
  assert.deepEqual(again.body.yields, r.body.yields);
  for (const y of r.body.yields) assert.equal(held(y.key), y.n, 'nothing twice');
  const none = await ask({ rid: 'salvage-0000002', pieces: [{ t: 200, m: 0, g: 'Jewellery', c: 1 }] });
  assert.equal(none.body.error, 'prof-no-salvage');
  const bad = await ask({ rid: 'salvage-0000003', pieces: [{ t: 'x' }] });
  assert.equal(bad.body.error, 'bad-piece');
});
