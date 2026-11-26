import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { societyOffers, societyWaresHeld, societyBuyRefused, SOCIETY_WARES, SOCIETY_ORES, SOCIETY_OFFERS } from '../src/net/mine/societyLaw.js';
import { societyState, societyTake, societyTurnIn, societyBuy } from '../server-account/src/society.js';
import { titlesHeld, aurasHeld } from '../server-account/src/titles.js';

const NOW = 1_800_000_000, DAY = Math.floor(NOW / 86400), CHAR = 'char-0001';

/** The account database as D1 hands it, over node's own SQLite: the players' and Stores' columns the Society reads, and its migration. */
function d1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE players (id TEXT PRIMARY KEY, handle TEXT);
    CREATE TABLE prof_stores (player TEXT, char_id TEXT, material TEXT, origin TEXT, qty INTEGER, PRIMARY KEY (player, char_id, material, origin));
    INSERT INTO players (id, handle) VALUES ('p1', 'Miner'), ('g1', NULL);`);
  sqlite.exec(readFileSync(new URL('../server-account/migrations/0222_society.sql', import.meta.url), 'utf8'));
  const db = {
    prepare(sql) {
      const st = sqlite.prepare(sql);
      return { bind: (...args) => ({ first: async () => st.get(...args) ?? null, run: async () => ({ meta: st.run(...args) }) }) };
    },
  };
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
  sqlite.prepare("INSERT INTO prof_stores VALUES ('p1', ?1, ?2, 'own', ?3), ('p1', ?1, ?2, 'bought', 9999)").run(CHAR, offer.ore, offer.n - 1);
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
