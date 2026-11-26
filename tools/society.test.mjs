import assert from 'node:assert/strict';
import test from 'node:test';
import { d1Sqlite, seedPlayer } from './lib/d1Sqlite.mjs';
import { societyOffers, societyWaresHeld, societyBuyRefused, SOCIETY_WARES, SOCIETY_ORES, SOCIETY_OFFERS } from '../src/net/mine/societyLaw.js';
import { societyState, societyTake, societyTurnIn, societyBuy } from '../server-account/src/society.js';
import { titlesHeld, aurasHeld } from '../server-account/src/titles.js';

const NOW = 1_800_000_000, DAY = Math.floor(NOW / 86400), CHAR = 'char-0001';

/** The whole account schema (every migration), a registered player and a guest. */
function d1() {
  const { db, sqlite } = d1Sqlite();
  seedPlayer(sqlite, 'p1', 'Miner');
  sqlite.prepare("INSERT INTO players (id, handle, guest_name, created_at, last_seen) VALUES ('g1', NULL, 'Guest', 1, 1)").run();
  return { db, sqlite };
}
const ctx = (db) => ({ db, nowS: NOW });
const P = { id: 'p1', handle: 'Miner' };

test('the desk offers the same three distinct contracts to a character all day, a new three tomorrow', () => {
  const a = societyOffers(CHAR, DAY);
  assert.equal(a.length, SOCIETY_OFFERS);
  assert.equal(new Set(a.map((o) => o.ore)).size, SOCIETY_OFFERS);
  assert.ok(a.every((o) => SOCIETY_ORES.includes(o.ore) && o.n >= 30 && o.seals > 0));
  assert.deepEqual(societyOffers(CHAR, DAY), a);
  const days = Array.from({ length: 30 }, (_, i) => societyOffers(CHAR, DAY + i).map((o) => o.ore).join());
  assert.ok(new Set(days).size > 5);
});

test('the shop’s ladder: in order, once each, for its Seals; a wares list keeps the known ones alone', () => {
  assert.deepEqual(societyWaresHeld('title:prospector junk title:prospector aura:burningstair'), ['title:prospector', 'aura:burningstair']);
  assert.equal(societyBuyRefused('title:delver', [], 9999), 'ladder');
  assert.equal(societyBuyRefused('title:prospector', ['title:prospector'], 9999), 'owned');
  assert.equal(societyBuyRefused('title:prospector', [], 10), 'seals-short');
  assert.equal(societyBuyRefused('aura:burningstair', [], SOCIETY_WARES.at(-1).seals), null);
});

test('a contract taken, turned in short (it stands), then in full: the Stores’ own ore taken, the Seals paid once', async () => {
  const { db, sqlite } = d1();
  assert.equal((await societyState(ctx(db), { id: 'g1', handle: null }, { character: CHAR })).error, 'need-account');
  const desk = await societyState(ctx(db), P, { character: CHAR });
  assert.equal(desk.seals, 0);
  assert.equal(desk.offers.length, SOCIETY_OFFERS);
  const offer = desk.offers[0];
  assert.equal((await societyTake(ctx(db), P, { character: CHAR, ore: 'metal:nonsense' })).error, 'not-offered');
  assert.equal((await societyTake(ctx(db), P, { character: CHAR, ore: offer.ore })).contract.n, offer.n);
  assert.equal((await societyTake(ctx(db), P, { character: CHAR, ore: offer.ore })).error, 'has-contract');
  sqlite.prepare("INSERT INTO prof_stores VALUES ('p1', ?1, ?2, 'own', ?3), ('p1', ?1, ?2, 'bought', 4000)").run(CHAR, offer.ore, offer.n - 1);
  const short = await societyTurnIn(ctx(db), P, { character: CHAR });
  assert.equal(short.error, 'short');   // bought ore never counts
  assert.equal((await societyState(ctx(db), P, { character: CHAR })).contract.held, offer.n - 1);
  sqlite.prepare("UPDATE prof_stores SET qty = qty + 5 WHERE origin = 'own'").run();
  const paid = await societyTurnIn(ctx(db), P, { character: CHAR });
  assert.equal(paid.paid, offer.seals);
  assert.equal(paid.seals, offer.seals);
  assert.equal(sqlite.prepare("SELECT qty FROM prof_stores WHERE origin = 'own'").get().qty, 4);
  assert.equal((await societyTurnIn(ctx(db), P, { character: CHAR })).error, 'no-contract');   // once
});

test('Seals buy the ladder in order and The Burning Stair, which the account then wears for good', async () => {
  const { db, sqlite } = d1();
  sqlite.prepare("UPDATE players SET society_seals = 6000 WHERE id = 'p1'").run();
  assert.equal((await societyBuy(ctx(db), P, { ware: 'title:delver' })).error, 'ladder');
  assert.equal((await societyBuy(ctx(db), P, { ware: 'title:prospector' })).seals, 6000 - 150);
  assert.equal((await societyBuy(ctx(db), P, { ware: 'title:prospector' })).error, 'owned');
  assert.equal((await societyBuy(ctx(db), P, { ware: 'aura:burningstair' })).seals, 6000 - 150 - 4000);
  const row = sqlite.prepare("SELECT * FROM players WHERE id = 'p1'").get();
  assert.ok(titlesHeld(row, {}).includes('prospector'));
  assert.ok(aurasHeld(row, {}).includes('burningstair'));
  assert.equal((await societyBuy(ctx(db), P, { ware: 'title:delver' })).seals, 1850 - 400);
  assert.equal((await societyBuy(ctx(db), P, { ware: 'title:deepwarden' })).seals, 1450 - 900);
  assert.equal((await societyBuy(ctx(db), P, { ware: 'title:masteroftheseam' })).error, 'seals-short');

});

test('a member turns in for a tenth more Seals a rank, read off their own realm record; kit is used one at a time', async () => {
  const { db, sqlite } = d1();
  const { societyKitUse, societyRankOf } = await import('../server-account/src/society.js');
  const save = JSON.stringify({ name: 'Miner', modData: { BunnyGuilds: { cartographers: { rank: 3, joinedAt: 1 } } } });
  sqlite.prepare("INSERT INTO realm_characters (id, player, name, created_at, updated_at, obj) VALUES ('realm-0001', 'p1', 'Miner', 1, 1, 'obj-1'), ('realm-0002', 'g1', 'Other', 1, 1, 'obj-2')").run();
  const bucket = { get: async (k) => (k === 'obj-1' || k === 'obj-2' ? { arrayBuffer: async () => new TextEncoder().encode(save).buffer } : null) };
  const c = { db, nowS: NOW, bucket };
  assert.equal(await societyRankOf(c, 'p1', 'realm-0001'), 3);
  assert.equal(await societyRankOf(c, 'p1', 'realm-0002'), -1);   // another account's record says nothing
  const offer = societyOffers(CHAR, DAY)[0];
  await societyTake(c, P, { character: CHAR, ore: offer.ore });
  sqlite.prepare("INSERT INTO prof_stores VALUES ('p1', ?1, ?2, 'own', ?3)").run(CHAR, offer.ore, offer.n);
  const paid = await societyTurnIn(c, P, { character: CHAR, realm: 'realm-0001' });
  assert.equal(paid.rank, 3);
  assert.equal(paid.paid, Math.round(offer.seals * 1.3));
  assert.equal((await societyKitUse(c, P, { character: CHAR, kit: 'fuel' })).error, 'kit-none');
  assert.equal((await societyKitUse(c, P, { character: CHAR, kit: 'drill' })).error, 'society-bad');   // a drill is owned, never spent
  sqlite.prepare("INSERT INTO mine_kit VALUES ('p1', ?1, 'fuel', 2)").run(CHAR);
  assert.equal((await societyKitUse(c, P, { character: CHAR, kit: 'fuel' })).qty, 1);
  assert.equal((await societyState(c, P, { character: CHAR })).kit.fuel, 1);
});
