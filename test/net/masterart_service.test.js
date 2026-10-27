// MASTER-ART (2026-10-27; bible/06-Systems/Professions-Arc.md section 57) - A MASTER'S WORK THROUGH THE REAL WORKER. The
// player's feedback ("Add more horizontal progression please!") and the decision: a Master in a craft makes a Legendary
// piece of its kinds, its three lines chosen, their values the service's roll in the Legendary band, for its recipe's
// goods and catalysts from three pursuits, one a character a UTC day. Built from the producers: the Worker over
// node:sqlite (test/accountDb.mjs), the client's own door and book, the mint, the item law and the judge.
import '../chargenDom.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

import { standService, sessionStorageOf, T0 } from '../accountDb.mjs';
import { accountProf, SESSION_KEY, accountRefusalText } from '../../src/net/accountClient.js';
import { createProfBook } from '../../src/net/profBook.js';
import { xpForRank, HEARTWOOD, PEARL, ARCANE_ESSENCE } from '../../src/net/professionLaw.js';
import { recipeById, MASTERWORK } from '../../src/net/recipeLaw.js';
import { MASTER_CATALYSTS, rollMasterLines, masterSignature } from '../../src/net/masterLaw.js';
import { verifyProductRecord, readProductRecord, MINT_V_MASTER } from '../../src/net/productRecord.js';
import { mintPieces, asMinted } from '../../src/systems/smithItems.js';
import { itemFindings } from '../../src/systems/item/itemLaw.js';
import { judgeSave, judgeProducts } from '../../server-account/src/judge.js';
import { masterSpends } from '../../server-account/src/masterWork.js';
import { craftXpText } from '../../src/ui/craftXpWords.js';
import { utcDay } from '../../src/net/marksLaw.js';

const { subtle } = webcrypto;
const noWait = () => Promise.resolve();
const memStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
const NOON = utcDay(T0) * 86_400 + 12 * 3600;
const SWORD = 'longsword:daedric';
const LINES = ['damage', 'stat:strength', 'elemental:fire'];
const CATS = Object.fromEntries(MASTER_CATALYSTS.map((c) => [c.key, c.n]));

/** A service, Mac in it with tracks at ranks and the Stores given, and Mac's book on the service's clock. */
async function stand({ tracks = { smithing: 100 }, stores = {}, now = NOON } = {}) {
  const s = await standService({ PROFESSIONS_OPEN: 'on', MARKS_OPEN: 'on' });
  const raw = s.env.DB._raw;
  const mac = await s.seated('Mac');
  for (const [p, rank] of Object.entries(tracks)) raw.prepare('INSERT INTO prof_tracks (player, char_id, profession, xp, updated_at) VALUES (?, ?, ?, ?, 1)').run(mac.id, mac.character, p, xpForRank(rank));
  const give = (key, qty, origin = 'own') => raw.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = excluded.qty`).run(mac.id, mac.character, key, origin, qty);
  for (const [k, n] of Object.entries(stores)) give(k, n);
  const door = accountProf({ fetch: s.fetch, storage: sessionStorageOf(SESSION_KEY, mac) });
  const book = createProfBook({ door, storage: memStorage(), character: () => mac.character, now: () => now * 1000, sleep: noWait });
  assert.equal((await book.refresh()).ok, true);
  const held = (key, origin = null) => Number(raw.prepare(`SELECT COALESCE(SUM(qty), 0) AS n FROM prof_stores WHERE player = ? AND material = ?${origin ? ' AND origin = ?' : ''}`).get(mac.id, key, ...(origin ? [origin] : [])).n);
  const ask = (body) => s.call('/v1/prof/master', { character: mac.character, ...body }, mac.secret);
  return { s, raw, mac, door, book, give, held, ask };
}
const swordGoods = () => Object.fromEntries(recipeById(SWORD).inputs.map((i) => [i.key, i.n]));

test('MASTER-ART DONE WHEN: a Smith at Master makes a Daedric Longsword her own way - the three lines she chose at the values the service rolled in the Legendary band, a Masterwork with her mark, the record signed and naming the lines; the goods and the three catalysts spent; the piece is what its record mints, lawful to the item law and to the judge; the craft\'s word says it (mutants: the record without its lines; the catalysts unspent; the lines minted off another seed)', async (t) => {
  t.mock.method(Date, 'now', () => NOON * 1000);
  const m = await stand({ stores: { ...swordGoods(), ...CATS } });
  const minted = [];
  const r = await m.book.craft(SWORD, { clean: false, name: 'Mac', master: LINES }, (data) => minted.push(...mintPieces(data)));
  assert.equal(r.ok, true, JSON.stringify(r));
  const d = r.data;
  assert.deepEqual([d.master, d.quality, d.xp, d.first, d.chosen], [true, MASTERWORK, 0, false, LINES]);
  assert.deepEqual(d.lines, rollMasterLines(recipeById(SWORD), LINES, d.seed), 'the lines at the values its seed rolls');
  for (const a of d.lines) assert.ok(a.value >= [20, 10, 6][LINES.indexOf(a.param ? `${a.id}:${a.param}` : a.id)], 'in the Legendary band');
  // the record: signed, Masterwork, the master's version and its lines
  const v = await verifyProductRecord(d.pieces[0].record, m.s.identityPublic, { subtle });
  assert.equal(v.ok, true, JSON.stringify(v));
  assert.deepEqual([v.claims.q, v.claims.v, v.claims.l, v.claims.m, v.claims.a], [MASTERWORK, MINT_V_MASTER, LINES, 'Mac', 1]);
  // what it spent: the recipe's goods and the catalysts, each to nought
  for (const k of [...Object.keys(swordGoods()), ...Object.keys(CATS)]) assert.equal(m.held(k), 0, k);
  const row = m.raw.prepare('SELECT * FROM prof_masters WHERE player = ?').get(m.mac.id);
  assert.deepEqual([row.recipe, row.day, JSON.parse(row.lines), row.provenance], [SWORD, utcDay(NOON), LINES, d.pieces[0].provenance]);
  const prod = m.raw.prepare('SELECT * FROM products WHERE provenance = ?').get(row.provenance);
  assert.deepEqual([prod.quality, prod.marked, prod.owner, prod.recipe, prod.bought_with], [MASTERWORK, 1, m.mac.id, SWORD, null]);
  // the piece the client minted: Legendary, its lines, its maker's mark, no record, no enchantment
  assert.equal(minted.length, 1);
  const sword = minted[0];
  assert.deepEqual([sword.rarity, sword.affixes, sword.legendary, sword.enchantments ?? [], sword.quality, sword.maker], ['legendary', d.lines, undefined, [], MASTERWORK, 'Mac']);
  assert.equal(asMinted(sword), true, 'the market takes it as minted');
  assert.deepEqual(itemFindings(sword), [], 'the item law holds it lawful');
  const judged = judgeSave({ level: 10, goldPieces: 0, items: [sword] });
  assert.deepEqual(judged.findings, []);
  assert.equal((await judgeProducts(m.s.env.DB, judged.provenances)).findings.length, 0, 'and its record agrees, line for line');
  // a piece carrying other values than its record's is no Master's work of it
  const forged = { ...sword, affixes: sword.affixes.map((a, i) => (i === 0 ? { ...a, value: a.value === 40 ? 39 : 40 } : a)) };
  assert.deepEqual(itemFindings(forged), [], 'in the band, the law alone cannot tell');
  const fj = judgeSave({ level: 10, goldPieces: 0, items: [forged] });
  assert.deepEqual((await judgeProducts(m.s.env.DB, fj.provenances)).findings.map((f) => f.code), ['provenance'], 'the judge holds it to its record');
  // the state and the craft's word
  assert.equal(m.book.state.master.made, true);
  assert.equal(m.book.state.master.last.recipe, SWORD);
  assert.equal(craftXpText(recipeById(SWORD), d, 'Smithing'), '(a Master\'s work)');
  assert.equal((await m.book.refresh({ force: true })).ok, true);
  assert.deepEqual(m.book.state.master.made, true, 'and the service\'s state says it');
});

test('MASTER-ART THE SERVICE REFUSES what it was not asked for or cannot see: a craft below Master, a piece no tier takes, lines the piece may not carry, two effects, a dye on a sword; a second work the same day on another request (the next day\'s is made); a request asked again is answered, never made twice; a claim of the seated character alone (mutants: the rank read below 100; the day\'s bound dropped; the day\'s status; the route unseated)', async (t) => {
  let now = NOON;
  t.mock.method(Date, 'now', () => now * 1000);
  const m = await stand({ tracks: { smithing: 99 }, stores: { ...swordGoods(), ...CATS } });
  const ask = (rid, body = {}) => m.ask({ rid, recipe: SWORD, lines: LINES, name: 'Mac', ...body });
  assert.equal((await ask('mastr-000001')).body.error, 'prof-rank', 'Smithing 99 is no Master');
  m.raw.prepare('UPDATE prof_tracks SET xp = ? WHERE player = ?').run(xpForRank(100), m.mac.id);
  assert.equal((await ask('mastr-000002', { recipe: 'nothing:here' })).body.error, 'bad-recipe');
  assert.equal((await ask('mastr-000003', { recipe: 'kit:iron' })).body.error, 'prof-master', 'a Repair Kit wears no tier');
  assert.equal((await ask('mastr-000004', { lines: ['damage', 'armor', 'stat:strength'] })).body.error, 'prof-master-lines', 'a sword carries no armour line');
  assert.equal((await ask('mastr-000005', { lines: ['damage', 'leech', 'elemental:fire'] })).body.error, 'prof-master-lines', 'one effect at most');
  assert.equal((await ask('mastr-000006', { lines: ['damage', 'damage', 'stat:strength'] })).body.error, 'prof-master-lines', 'a line chosen twice');
  assert.equal((await ask('mastr-000007', { lines: ['damage', 'stat:strength'] })).body.error, 'prof-master-lines', 'three lines');
  assert.equal((await ask('mastr-000008', { dye: 2 })).body.error, 'prof-dye');
  const one = await ask('mastr-000009');
  assert.equal(one.body.ok, true, JSON.stringify(one.body));
  const again = await ask('mastr-000009');
  assert.deepEqual([again.body.repeat, again.body.pieces], [true, one.body.pieces], 'the same work, answered');
  for (const [k, n] of Object.entries(swordGoods())) m.give(k, n);
  for (const [k, n] of Object.entries(CATS)) m.give(k, n);
  const day = await ask('mastr-000010');
  assert.deepEqual([day.status, day.body.error], [409, 'prof-master-day'], 'one a character a day');
  assert.equal(m.raw.prepare('SELECT COUNT(*) AS n FROM prof_masters').get().n, 1);
  assert.equal(m.held(PEARL.key), CATS[PEARL.key], 'nothing spent by the refusal');
  now = NOON + 86_400;
  const next = await ask('mastr-000011');
  assert.equal(next.body.ok, true, 'the next day\'s');
  assert.equal(accountRefusalText('prof-master-day').includes('midnight UTC'), true);
  // a progression claim: asked of an account with no seated realm character, refused before the route reads a word
  const bare = await m.s.registered('bare');
  const unseated = await m.s.call('/v1/prof/master', { character: 'char-bare', rid: 'mastr-000012', recipe: SWORD, lines: LINES }, bare.secret);
  assert.deepEqual([unseated.status, unseated.body.error], [403, 'progress-seat']);
});

test('MASTER-ART THE CATALYSTS ARE WHAT THE SERVICE COUNTED: own or bought, never loose (a looted Pearl the service never saw) nor bought with gold; a Pearl jewel\'s own Pearl spent beside its three (loose units cover the goods, never the catalysts) (mutants: a catalyst spent over the station\'s origins; the shared key read once)', async (t) => {
  t.mock.method(Date, 'now', () => NOON * 1000);
  const m = await stand({ stores: { ...swordGoods(), [HEARTWOOD.key]: 2, [ARCANE_ESSENCE.key]: 10 } });
  m.give(PEARL.key, 3, 'loose');
  const ask = (rid, body = {}) => m.ask({ rid, recipe: SWORD, lines: LINES, name: 'Mac', ...body });
  const loose = await ask('mastr-000101');
  assert.deepEqual([loose.body.error, loose.status], ['stores-short', 409], 'loose Pearls are no catalyst');
  m.give(PEARL.key, 3, 'gold');
  const gold = (await ask('mastr-000102')).body;
  assert.deepEqual([gold.error], ['stores-gold'], 'nor Pearls bought with gold - and it says so');
  m.give(PEARL.key, 0, 'gold');
  m.give(PEARL.key, 3, 'bought');
  const ok = await ask('mastr-000103');
  assert.equal(ok.body.ok, true, JSON.stringify(ok.body));
  assert.deepEqual([m.held(PEARL.key, 'bought'), m.held(PEARL.key, 'loose')], [0, 3], 'the bought spent, the loose left');
  assert.equal(m.raw.prepare('SELECT bought_with FROM products WHERE provenance = ?').get(ok.body.pieces[0].provenance).bought_with, 'marks', 'a piece of bought goods is bought');
  // a Pearl jewel: its Pearl a good (a station's - loose too) and three more a catalyst (counted)
  const ring = 'ring:gold:pearl';
  const r = recipeById(ring);
  assert.ok(r, 'the Gold Pearl Ring stands');
  assert.deepEqual(masterSpends(r).find((s) => s.key === PEARL.key), { key: PEARL.key, in: 1, cat: 3 });
  const j = await stand({ tracks: { smithing: 100 }, stores: Object.fromEntries([...r.inputs.filter((i) => i.key !== PEARL.key).map((i) => [i.key, i.n]), [HEARTWOOD.key, 2], [ARCANE_ESSENCE.key, 10]]) });
  j.give(PEARL.key, 3, 'own');
  j.give(PEARL.key, 1, 'loose');
  const ringLines = ['stat:intelligence', 'resist:magic', 'focus'];
  const jr = await j.ask({ rid: 'mastr-000104', recipe: ring, lines: ringLines, name: 'Mac' });
  assert.equal(jr.body.ok, true, JSON.stringify(jr.body));
  assert.deepEqual([j.held(PEARL.key, 'own'), j.held(PEARL.key, 'loose')], [0, 0], 'the loose one the good, the three own the catalysts');
  assert.equal(j.raw.prepare('SELECT bought_with FROM products WHERE provenance = ?').get(jr.body.pieces[0].provenance).bought_with, 'gold', 'a loose good walls it to gold, as a craft\'s');
  const k = await stand({ tracks: { smithing: 100 }, stores: Object.fromEntries([...r.inputs.filter((i) => i.key !== PEARL.key).map((i) => [i.key, i.n]), [HEARTWOOD.key, 2], [ARCANE_ESSENCE.key, 10]]) });
  k.give(PEARL.key, 3, 'own');
  const kr = await k.ask({ rid: 'mastr-000105', recipe: ring, lines: ringLines, name: 'Mac' });
  assert.equal(kr.body.error, 'stores-short', 'three Pearls are the catalysts alone - the ring\'s own is short');
  assert.equal(readProductRecord(jr.body.pieces[0].record).l.join(), ringLines.join());
  assert.equal(masterSignature(jr.body.lines).split('|').length, 3);
});
