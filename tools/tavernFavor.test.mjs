import { LivingTown } from '../src/systems/livingWorld/livingTown.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { songFavor } from '../src/net/tavernFavorLaw.js';
import { bunnyTavernRows } from '../src/systems/guild/bunnyServices.js';
import { _setBunnyBook, tavernProgress } from '../src/systems/guild/bunnyMembership.js';
import { createTavernFavorShop } from '../src/scenes/tavernFavorShop.js';

test('only full minutes count, and completing music pays Favor and local reputation', async () => {
  for (const [seconds, tokens] of [[0, 0], [59, 0], [60, 1], [119, 1], [180, 3], [NaN, 0], [Infinity, 0]]) assert.equal(songFavor(seconds), tokens);
  _setBunnyBook({ bards: { rank: 1 } });
  const entity = { goldPieces: 0, legalRep: {} };
  let finish;
  const rows = bunnyTavernRows({ entity, where: '17:42', day: 1, notes: 24, region: 17, city: '17', perform: (done) => { finish = done; } });
  rows.find((x) => x.code === 'KeyP').action();
  await Promise.resolve();
  assert.equal(tavernProgress().favor, 0);
  finish(24, { perfect: 100, good: 0, total: 100, seconds: 181 });
  assert.equal(tavernProgress().favor, 3);
  assert.equal(tavernProgress().cities['17'], 1);
  assert.equal(entity.legalRep[17], 1);
  assert.equal(entity.legalRep[18], undefined);
});

test('retrying a shop purchase uses the same receipt and applies a reply only once', async () => {
  _setBunnyBook({ bards: { rank: 1 }, _marks: { tavern: { favor: 25, cities: {} } } });
  const entity = { items: [] }, requests = [];
  let view;
  const reply = { ok: true, data: { progress: { favor: 0, cities: {} }, item: { rarity: 'legendary', name: 'Reward', group: 'Weapons', templateIndex: 113 } } };
  const shop = createTavernFavorShop({ entity: () => entity, choose: (v) => { view = v; }, buy: async (request, apply) => {
    requests.push(request);
    if (requests.length === 1) return { ok: false, unknown: true };
    apply(reply); apply(reply); return reply;
  } });
  shop.open(); view.options[0].action();
  await new Promise((resolve) => setImmediate(resolve));
  view.options.find((x) => x.code === 'KeyR').action();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests[0].txn, requests[1].txn);
  assert.equal(entity.items.length, 1); assert.equal(tavernProgress().favor, 0);
});

test('city goodwill affects local strangers and stays separate between cities', () => {
  _setBunnyBook({ _marks: { tavern: { favor: 8, cities: { '17': 4 } } } });
  const mock = (mapId) => ({ o: { town: { mapId } }, _now: 0, _roadNewsAt: () => [], deedNews: () => [], carriedAt: () => [] });
  assert.equal(LivingTown.prototype.reputeAt.call(mock(17)).regard, 4);
  assert.equal(LivingTown.prototype.reputeAt.call(mock(18)).regard, 0);
  assert.equal(tavernProgress().favor, 8);
});

test('Favor shop pages expose all supplies and preserve the selected reward on purchase', async () => {
  _setBunnyBook({ bards: { rank: 1 }, _marks: { tavern: { favor: 10, cities: {} } } });
  let view, request;
  const shop = createTavernFavorShop({ entity: () => ({ items: [] }), choose: (v) => { view = v; }, buy: async (body) => {
    request = body; return { ok: false, error: 'favor-short' };
  } });
  shop.open(); view.options.find((o) => o.code === 'ArrowRight').action();
  assert.ok(view.options[0].label.includes('5 Welkynd Shards'));
  assert.ok(view.options[1].label.includes('3 Stamina Potions'));
  assert.ok(view.options[2].label.includes('3 Restore Power Potions'));
  view.options[0].action(); await new Promise((r) => setImmediate(r));
  assert.equal(request.offer, 'shards');
  view.options.find((o) => o.code === 'ArrowLeft').action();
  assert.ok(view.options[0].label.includes('Random Legendary'));
});
