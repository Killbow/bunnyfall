// WOVEN-PAYS (FIELD BUGS 2026-10-26b; fogs, #feature-feedback, "First time XP bonus from the Loom still isn't working":
// "We now have the ability to weave our own linen bolts (finally!) but I'm still not receiving the first time XP bonus";
// the owner, asked: "Woven cloth pays"). REPRODUCED on main before the fix, through the real book and the real Worker:
// Root Tendrils the service never counted (looted, or bought at a shop for gold) wove into LOOSE Linen, which the loom
// carried out to the bag; the Straps' box said "and 511 more ... from cloth you wove or spun yourself" (ownSpend read
// the Stores alone), and the craft put a bolt back in loose and paid +20, "Your first, but only cloth you wove or spun
// yourself earns the first-time bonus". The wall is now SILVER: a cloth piece's first pays wherever no unit bought with
// silver is spent (net/recipeLaw.js firstCraftPays, server-account/src/professions.js craftAtAnvil `pays`), the box
// reads what the press would spend (net/bagLaw.js stationSpend, net/profBook.js spendOf), and a pattern is made by the
// craft that laid its first on (`first_paid`, migration 0176). bible/01-Overview/bugs/Field-Bugs-2026-10-26b.md.
import '../chargenDom.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import '../../src/systems/professions/profTemplates.js';
import { standService, T0, sessionStorageOf } from '../accountDb.mjs';
import { seatRealm } from '../realmSeat.mjs';
import { accountProf, SESSION_KEY } from '../../src/net/accountClient.js';
import { createProfBook } from '../../src/net/profBook.js';
import { stationSpend, BAG_TEMPLATE } from '../../src/net/bagLaw.js';
import { RECIPES, counterMade, craftXp, recipeById, firstCraftXp, FIRST_MAKE_FLOOR, FIRST_MAKE_SHARE } from '../../src/net/recipeLaw.js';
import { FIRM_NODES } from '../../src/net/firmament/firmamentTree.js';
import { scaleXp } from '../../src/net/firmament/firmamentLaw.js';
import { heldOf, roomFor, mintCarried, takeCarried, giveCarried, bagTakesOf } from '../../src/systems/materialsBag.js';
import { setItemFields } from '../../src/systems/item/itemTemplates.js';
import { ownSpend } from '../../src/ui/professions/profPages.js';
import { craftXpLine, craftXpText } from '../../src/ui/craftXpWords.js';
import { utcDay } from '../../src/net/marksLaw.js';

const NOON = utcDay(T0) * 86_400 + 12 * 3600;
const realNow = Date.now;
Date.now = () => NOON * 1000;
test.after(() => { Date.now = realNow; });
let _rid = 0;
const rid = () => `woven-${String(++_rid).padStart(6, '0')}`;
const SHARE = firstCraftXp(recipeById('garment-141:linen'), true);

/** A seated character on the real Worker, a bag in its pack, and the real book carrying for it. */
async function stand() {
  const s = await standService({ PROFESSIONS_OPEN: 'on', MARKS_OPEN: 'on', BOARD_OPEN: 'on' });
  const raw = s.env.DB._raw;
  const mac = await s.registered('Mac');
  mac.character = (await seatRealm(s.env, mac.secret, 'Mac', { name: 'Mac', level: 5, items: [], goldPieces: 0 })).id;
  const rows = (table, m) => raw.prepare(`SELECT origin, qty FROM ${table} WHERE player = ? AND char_id = ? AND material = ? AND qty > 0 ORDER BY origin`)
    .all(mac.id, mac.character, m).map((r) => [r.origin, Number(r.qty)]);
  const give = (m, origin, qty) => raw.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = excluded.qty`).run(mac.id, mac.character, m, origin, qty);
  const xpOf = () => Number(raw.prepare('SELECT xp FROM prof_tracks WHERE player = ? AND char_id = ? AND profession = ?').get(mac.id, mac.character, 'outfitting')?.xp ?? 0);
  const e = { stats: { strength: 50 }, items: [setItemFields({ group: 'UselessItems2', templateIndex: BAG_TEMPLATE })], bagItems: [], goldPieces: 0 };
  const hands = {
    held: (k) => heldOf(e, k), room: (k) => roomFor(e, k), mint: (k, n) => mintCarried(e, k, n),
    take: (k, n, id, order) => takeCarried(e, k, n, id, order), give: (k, n) => giveCarried(e, k, n),
    stamped: (id) => Object.hasOwn(bagTakesOf(e), id), unstamp: (id) => { delete e.bagTakes?.[id]; },
    stamps: () => Object.entries(bagTakesOf(e)).map(([id, t]) => ({ id, ...t })),
  };
  const mem = new Map();
  const book = createProfBook({ door: accountProf({ fetch: s.fetch, storage: sessionStorageOf(SESSION_KEY, mac) }), storage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) },
    character: () => mac.character, now: () => NOON * 1000, sleep: () => Promise.resolve(), carry: hands });
  const craft = async (id) => {
    const r = await book.craft(id, { clean: false, name: 'Mac' }, () => {});
    assert.equal(r.ok, true, JSON.stringify(r));
    return r.data;
  };
  const ask = (id, at) => s.call('/v1/prof/craft', { character: mac.character, recipe: id, clean: false, name: 'Mac', rid: at }, mac.secret);
  return { s, raw, mac, e, book, rows, give, xpOf, craft, ask };
}

// ─── THE LAW ─────────────────────────────────────────────────────────

test('WOVEN-PAYS law: a station spends a material\'s loose units first, then bought, then own, its shortfall put in from the count (bought, then own) and the pack\'s uncounted units as loose (mutants: the order turned; the put-in unforeseen; the count\'s bought put in after its own)', () => {
  assert.deepEqual(stationSpend({ own: 3, bought: 1, loose: 1 }, null, 1), { loose: 1, bought: 0, own: 0 });
  assert.deepEqual(stationSpend({ own: 3, bought: 1, loose: 1 }, null, 3), { loose: 1, bought: 1, own: 1 });
  assert.deepEqual(stationSpend({ own: 3, bought: 1 }, null, 2), { loose: 0, bought: 1, own: 1 });
  assert.deepEqual(stationSpend({}, null, 2), { loose: 2, bought: 0, own: 0 }, 'nothing counted: the pack\'s units, loose');
  assert.deepEqual(stationSpend({ own: 1 }, { own: 1, bought: 1 }, 3), { loose: 0, bought: 1, own: 2 }, 'the count\'s bought put in first, then its own');
  assert.deepEqual(stationSpend({ own: 1 }, { own: 1, bought: 1 }, 2), { loose: 0, bought: 1, own: 1 }, 'one short: the count\'s bought bolt, never its own');
  assert.deepEqual(stationSpend({ own: 1 }, { own: 1, bought: 1 }, 1), { loose: 0, bought: 0, own: 1 }, 'the Stores cover it: nothing put in');
  assert.deepEqual(stationSpend({ own: 1 }, { own: 1 }, 4), { loose: 2, bought: 0, own: 2 }, 'past the count: loose');
});

test('WOVEN-PAYS law: an old row\'s XP says whether it paid its first - every judged recipe\'s own XP, at any rank and the Firmament\'s every star, stays under the least share (FIRST_MAKE_FLOOR), and every share is at least it (mutants: the floor moved)', () => {
  const judged = RECIPES.filter(counterMade);
  assert.equal(judged.length, 152);
  let pct = 0;
  for (const n of FIRM_NODES.values()) pct += Number(n.stats?.['xp.outfitting'] ?? 0);
  const most = Math.max(...judged.flatMap((r) => Array.from({ length: 101 }, (_, rank) => scaleXp(craftXp(r.tier, rank), pct))));
  assert.ok(most < FIRST_MAKE_FLOOR, `a judged craft's own XP at most ${most}`);
  assert.ok(Object.values(FIRST_MAKE_SHARE).every((x) => x >= FIRST_MAKE_FLOOR));
  assert.equal(FIRST_MAKE_FLOOR, 500);
});

// ─── THE REPORT ──────────────────────────────────────────────────────

test('WOVEN-PAYS the report: Root Tendrils the service never counted weave into loose Linen, carried out to the bag; the Straps\' box says the 511, and the craft - a bolt put back in loose - lays it on and says so (mutants: the loose units walled again; the box reads the Stores alone)', async () => {
  const { book, e, rows, xpOf, craft } = await stand();
  mintCarried(e, 'p1:12', 6);   // looted, or bought at a shop for gold: in the pack, never counted
  assert.equal((await book.refresh()).ok, true);
  const w = await book.smelt('weave:linen-north', 3);
  assert.equal(w.ok, true, JSON.stringify(w));
  assert.deepEqual([w.data.own, w.data.bought, w.data.loose, w.data.put.bag], [0, 0, 3, 3], 'loose bolts, into the bag');
  assert.deepEqual([rows('prof_stores', 'cloth:linen'), rows('prof_carried', 'cloth:linen'), heldOf(e, 'cloth:linen')], [[], [], 3], 'carried, uncounted');
  const straps = recipeById('garment-141:linen');
  assert.equal(ownSpend(book, straps), true);
  assert.equal(craftXpLine(straps, 0, 'Outfitting', {}, ownSpend(book, straps)), `20 Outfitting experience, and ${SHARE} more the first time you make this piece at this grade from cloth not bought with silver.`);
  const made = await craft('garment-141:linen');
  assert.deepEqual([made.xp, made.first, made.firstPaid, xpOf()], [20 + SHARE, true, true, 20 + SHARE]);
  assert.equal(craftXpText(straps, made, 'Outfitting'), `(+${20 + SHARE} Outfitting experience, with the first-time bonus)`);
});

// ─── THE SILVER WALL ─────────────────────────────────────────────────

test('WOVEN-PAYS the silver wall: a bought bolt beside a loose one is spent only where the loose do not cover the craft - the Straps (one bolt) pay, the Breeches (two) do not; a bought bolt carried goes in first; the box says each before the press (mutants: a bought unit held read as spent; the loose units\' cover unread)', async () => {
  const { book, e, give, rows, craft } = await stand();
  give('cloth:linen', 'loose', 1);
  give('cloth:linen', 'bought', 1);
  assert.equal((await book.refresh()).ok, true);
  assert.equal(ownSpend(book, recipeById('garment-141:linen')), true);
  const straps = await craft('garment-141:linen');
  assert.deepEqual([straps.xp, straps.firstPaid, rows('prof_stores', 'cloth:linen')], [20 + SHARE, true, [['bought', 1]]], 'the loose bolt spent, the bought one kept');
  give('cloth:linen', 'loose', 1);
  assert.equal((await book.refresh()).ok, true);
  const breeches = recipeById('garment-152:linen');
  assert.equal(ownSpend(book, breeches), false);
  assert.equal(craftXpLine(breeches, 0, 'Outfitting', {}, ownSpend(book, breeches)), '20 Outfitting experience. This would use cloth bought with silver, which earns no first-time bonus.');
  const b = await craft('garment-152:linen');
  assert.deepEqual([b.xp, b.first, b.firstPaid], [20, true, false]);
  assert.equal(craftXpText(breeches, b, 'Outfitting'), '(+20 Outfitting experience. Cloth bought with silver earns no first-time bonus, so this piece\'s is still yours to earn)');
  // a Weavers' bolt carried, withdrawn counted as bought: the Robes' shortfall puts it in first
  give('cloth:linen', 'bought', 1);
  assert.equal((await book.refresh()).ok, true);
  assert.equal((await book.withdraw('cloth:linen', 1, (k, q) => mintCarried(e, k, q))).ok, true);
  assert.deepEqual(rows('prof_carried', 'cloth:linen'), [['bought', 1]]);
  mintCarried(e, 'cloth:linen', 2);   // and two the pack holds past the count
  const robes = recipeById('garment-165:linen');
  assert.equal(ownSpend(book, robes), false, 'the counted bought bolt goes in before the loose');
  const r = await craft('garment-165:linen');
  assert.deepEqual([r.first, r.firstPaid], [true, false]);
});

// ─── THE PATTERN MADE BY THE CRAFT THAT PAID ─────────────────────────

test('WOVEN-PAYS the pattern: a craft of the Weavers\' cloth lays none on and makes no pattern - the next Straps of the loom\'s cloth pay the first, and the one after none; the decision writes `first_paid` (mutants: any craft makes the pattern; first_paid unwritten)', async () => {
  const { book, raw, mac, give, xpOf, craft } = await stand();
  give('cloth:linen', 'bought', 1);
  assert.equal((await book.refresh()).ok, true);
  const bought = await craft('garment-141:linen');
  assert.deepEqual([bought.xp, bought.first, bought.firstPaid], [20, true, false]);
  give('cloth:linen', 'own', 2);
  assert.equal((await book.refresh()).ok, true);
  const own = await craft('garment-141:linen');
  assert.deepEqual([own.xp, own.first, own.firstPaid], [20 + SHARE, true, true], 'the first was still owed');
  const again = await craft('garment-141:linen');
  assert.deepEqual([again.xp, again.first, again.firstPaid], [20, false, false]);
  assert.equal(xpOf(), 60 + SHARE);
  assert.deepEqual(raw.prepare('SELECT xp, first, first_paid FROM prof_crafts WHERE player = ? ORDER BY at, rowid').all(mac.id).map((r) => [Number(r.xp), Number(r.first), r.first_paid]),
    [[20, 1, 0], [20 + SHARE, 1, 1], [20, 0, 0]]);
});

test('WOVEN-PAYS rows from before the column: a judged first that laid no share on leaves its pattern owed, one whose XP holds the share made it, any row of an unjudged pattern made it; and an old row\'s answer reads its piece as CLOTH-GEMS did (mutants: an old row read as made, or as owed, whatever its XP; the answer\'s old reading gone)', async () => {
  const { book, raw, mac, give, craft, ask } = await stand();
  const old = (recipe, xp, first) => raw.prepare(`INSERT INTO prof_crafts (player, rid, char_id, recipe, quality, count, provenance, seed, xp, first, at, n)
    VALUES (?, ?, ?, ?, 1, 1, ?, 1, ?, ?, 1, 'old')`).run(mac.id, rid(), mac.character, recipe, String(_rid).padStart(16, '0'), xp, first);
  old('garment-142:linen', 20, 1);   // the Armbands, of the Weavers' cloth, under S1 before the column
  old('garment-143:linen', 20 + SHARE, 1);   // the Kimono, its first laid on
  old('garment-149:linen', 20, 1);   // the Boots (a bolt and a Cured Leather - never judged), its share eaten by the limit
  give('cloth:linen', 'own', 10);
  give('leather:cured', 'own', 2);
  assert.equal((await book.refresh()).ok, true);
  assert.deepEqual([(await craft('garment-142:linen')).firstPaid, (await craft('garment-143:linen')).firstPaid, (await craft('garment-149:linen')).firstPaid], [true, false, false]);
  // an old row's answer, asked again: its piece's bought_with, as CLOTH-GEMS read it
  give('cloth:linen', 'bought', 1);
  const at = rid();
  const first = await ask('garment-146:linen', at);
  assert.deepEqual([first.status, first.body.firstPaid], [200, false]);
  raw.prepare('UPDATE prof_crafts SET first_paid = NULL WHERE player = ? AND rid = ?').run(mac.id, at);
  raw.prepare(`UPDATE products SET bought_with = NULL WHERE provenance = ?`).run(first.body.pieces[0].provenance);
  const repeat = await ask('garment-146:linen', at);
  assert.deepEqual([repeat.body.repeat, repeat.body.firstPaid], [true, true], 'NULL: the piece read, as before the column');
});
