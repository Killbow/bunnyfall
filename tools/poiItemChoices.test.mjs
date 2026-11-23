// Verifies that src/poi/poiItemChoices.js matches the item law as the account service loads it, and that every
// listed item can be minted by the service as a POI gift and passes the POI trade law.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lawItemChoices, moduleText } from './poiItemChoices.mjs';
import { POI_ITEM_CHOICES } from '../src/poi/poiItemChoices.js';
import { mintGift } from '../server-account/src/staffGive.js';
import { poiTradeProblems } from '../src/poi/poiTradeLaw.js';

test('the item list is the one the item law gives now', async () => {
  const text = readFileSync(new URL('../src/poi/poiItemChoices.js', import.meta.url), 'utf8');
  assert.equal(text, moduleText(await lawItemChoices()), 'run node tools/poiItemChoices.mjs');
});

test('every listed item is minted by the service and taken by the trade law', () => {
  for (const [template, group] of POI_ITEM_CHOICES) {
    const gift = mintGift({ template, group });
    assert.equal(gift.error, undefined, `template ${template}`);
    assert.deepEqual(gift.findings, [], `template ${template}`);
    const doc = { v: 2, events: [{ key: 'e', name: 'E', trigger: { k: 'chained' }, then: [{ k: 'give_item', item: { template, group, count: 1 } }] }] };
    assert.deepEqual(poiTradeProblems(doc), [], `template ${template}`);
  }
});

test('the list leaves out gold, bound items, and templates the service does not know', async () => {
  const { lawTemplate } = await import('../src/items/itemLaw.js');
  const listed = new Set(POI_ITEM_CHOICES.map((r) => r[0]));
  assert.ok(!POI_ITEM_CHOICES.some((r) => r[1] === 'Currency'));
  assert.ok(![...listed].some((i) => lawTemplate(i)?.bound));
  assert.ok(!listed.has(6666), 'the Humanoid Corpse is registered only in the browser');
});

test('the picker for a take or requirement leaves out what no player can hand over (the Materials Bag, a boat\'s parts and deed)', async () => {
  const { itemChoices, takeChoices } = await import('../src/poi/poiDmEdit.js');
  const out = new Set(takeChoices());
  assert.deepEqual(itemChoices().filter((r) => !out.has(r)).map((r) => r.template).sort((a, b) => a - b), [600, 1320, 1321]);
});
