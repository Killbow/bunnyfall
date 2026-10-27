// HUNTERS-MARK (2026-10-27; a player, handed on by the owner: "Add more horizontal progression please!";
// bible/06-Systems/Bounty-Boards.md section 12): THE CLIENT'S HALF - the hunt's book over the real Worker (a paid
// bounty kept and reported, the service's word adopted, a final refusal let go, a lost answer kept across a reload),
// the week's named mark headless (posted from the rung, taken, stood as one crowned elite, paid in gold and a trophy,
// reported, lapsed at the week's end), the bounty host reporting a board's clear with its region, and the board's
// window drawing the rank and the mark.
import '../chargenDom.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { byClass } from '../chargenDom.mjs';
import { standService, T0, sessionStorageOf } from '../accountDb.mjs';
import { accountHunt, SESSION_KEY } from '../../src/net/accountClient.js';
import { createHuntBook, HUNT_KEEP, HUNT_STATE_MS, huntBook } from '../../src/net/huntBook.js';
import {
  huntGameDayAt, huntWeekAt, huntMarkId, huntMarkOf, huntMarkGold, HUNT_MARK_NAMES, HUNT_RUNGS, HUNT_MARK_RUNG,
} from '../../src/net/huntLaw.js';
import { bountyId, bountySites, boardPostings } from '../../src/systems/bounty/bountyBoard.js';
import { createHuntersMark, huntMarkTraits, huntOnline, HUNT_MARK_TRAITS } from '../../src/scenes/huntersMark.js';
import { createBountyHost } from '../../src/scenes/bountyHost.js';
import { mountBountyBoard, markStateWord } from '../../src/ui/bounty/bountyWindow.js';
import { rankWords, rankShare } from '../../src/ui/bounty/huntRank.js';
import { TROPHY_TEMPLATE } from '../../src/net/trophyLaw.js';
import { trophyTitle } from '../../src/systems/hunt/trophies.js';
import { sharedClassicMinutes } from '../../src/net/wire.js';
import { seatWeekStartMs, SEAT_WEEK_MS } from '../../src/net/townSeatLaw.js';
import { utcDay } from '../../src/net/marksLaw.js';
import '../../src/systems/professions/profTemplates.js';   // the Mounted Trophy's row, as the game registers it

const NOON = utcDay(T0) * 86_400 + 12 * 3600;
const memStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
const until = async (ok) => { for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setImmediate(r)); assert.ok(ok(), 'it settled'); };
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

// ─── THE BOOK ────────────────────────────────────────────────────────

test('HUNTERS-MARK THE BOOK over the real Worker: a paid bounty kept, reported and let go once answered, the service\'s count adopted; a final refusal let go, a late notice never kept; a lost answer kept across a reload and reported by the next page; a slot an account and character\'s own (mutants: the kept list never cleared; a final refusal kept; the late check gone; the slot by character alone; the state not adopted)', async (t) => {
  let clock = NOON * 1000;
  t.mock.method(Date, 'now', () => clock);
  const s = await standService({ SEATS_OPEN: 'on' });
  const mac = await s.seated('Mac');
  const day = huntGameDayAt(clock);
  const storage = memStorage();
  const door = accountHunt({ fetch: s.fetch, storage: sessionStorageOf(SESSION_KEY, mac) });
  const book = createHuntBook({ door, storage, character: () => mac.character, now: () => clock });
  assert.equal(book.state, null);
  await book.refresh();
  assert.equal(book.state.clears, 0, 'the service\'s word: nothing yet');
  const first = bountyId(day, 300, 200, 1, 1);
  assert.equal(book.report(first, 17), true);
  await until(() => book.kept().length === 0);
  assert.equal(book.state.clears, 1, 'the answer\'s count adopted');
  assert.equal(Number(book.state.regions[17]), 1, 'and the region\'s');
  // a notice past the trusted level: the service refuses it for good, and the book lets it go
  assert.equal(HUNT_KEEP.includes('hunt-tier'), false);
  assert.equal(book.report(bountyId(day, 300, 200, 2, 30), 17), true);
  await until(() => book.kept().length === 0);
  assert.equal(book.state.clears, 1, 'not counted');
  assert.equal(book.report(bountyId(day - 13, 300, 200, 0, 1)), false, 'a notice a real day late is never kept');
  // the network gone: kept, across a reload, reported by the next page
  const offline = { account: () => mac.id, state: async () => ({ ok: false, error: 'offline' }), clear: async () => ({ ok: false, error: 'offline' }) };
  const lost = createHuntBook({ door: offline, storage, character: () => mac.character, now: () => clock });
  const second = bountyId(day, 301, 200, 1, 1);
  lost.report(second, null);
  await flush();
  assert.deepEqual(lost.kept(), [second], 'kept through the answer that never came');
  assert.deepEqual(createHuntBook({ door: offline, storage, character: () => 'another', now: () => clock }).kept(), [], 'another character\'s slot is its own');
  assert.deepEqual(createHuntBook({ door: { ...offline, account: () => 'someone' }, storage, character: () => mac.character, now: () => clock }).kept(), [], 'and another account\'s');
  const next = createHuntBook({ door, storage, character: () => mac.character, now: () => clock });
  assert.deepEqual(next.kept(), [second], 'the reloaded page finds it');
  await next.pump();
  assert.deepEqual(next.kept(), []);
  assert.equal(next.state.clears, 2);
  // the beat: a stale state is asked again
  let asked = 0;
  const beat = createHuntBook({ door: { ...offline, state: async () => { asked++; return { ok: true, data: { clears: 5 } }; } }, storage: memStorage(), character: () => 'c', now: () => clock });
  beat.tick(); await flush();
  assert.equal(asked, 1);
  beat.tick(); await flush();
  assert.equal(asked, 1, 'fresh: not asked again');
  clock += HUNT_STATE_MS;
  beat.tick(); await flush();
  assert.equal(asked, 2, 'stale: asked again');
  assert.equal(beat.state.clears, 5);
});

// ─── THE NAMED MARK ──────────────────────────────────────────────────

/** A named mark's module on a Wednesday of `wall`, its book's door answering `clears` (reports kept: the door offline). */
function markOf({ clears = HUNT_RUNGS[HUNT_MARK_RUNG].at, level = 16, wall = Date.UTC(2026, 9, 28, 12) } = {}) {
  const at = { wall, here: null, clears };
  const cleared = [];
  const door = {
    account: () => 'acct-1',
    state: async () => ({ ok: true, data: { clears: at.clears, marks: 0, markDone: false, regions: { 5: 3 }, account: { clears: at.clears + 10 } } }),
    clear: async (c, id, region) => { cleared.push([id, region]); return { ok: false, error: 'offline' }; },
  };
  const entity = { goldPieces: 0, items: [] };
  const said = [], notices = [], stood = [], pool = [];
  let repaints = 0;
  const mark = createHuntersMark({
    hunt: { door, storage: memStorage(), character: () => 'char-1' }, now: () => 0, wallNow: () => at.wall, level: () => level, entity: () => entity,
    townName: () => 'Daggerfall', regionAt: () => 5, sitesFor: () => [[302, 203], [298, 199]],
    playerPixel: () => at.here, canStand: () => true, foePool: () => pool,
    standPack: (o) => {
      stood.push(o);
      const foes = Array.from({ length: o.count }, () => ({ dead: false, corpse: false, entity: { health: 40, maxHealth: 40, mobileType: o.mobileType } }));
      pool.push(...foes);
      return { foes: Promise.resolve(foes), dx: 30, dz: 40 };
    },
    say: (l) => said.push(l), notice: (n) => notices.push(n), repaint: () => { repaints++; },
  });
  return { mark, at, cleared, entity, said, notices, stood, pool, repaints: () => repaints };
}
const TOWN = { px: 300, py: 200 };

test('HUNTERS-MARK THE NAMED MARK: none offline or below the Stalker\'s rung; from it, the week\'s beast of the reader\'s tier under its name, lairing on one of the board\'s own sites, its purse three packs\' and a trophy, its two traits the week\'s; taken once, stood as one crowned elite at its pixel, paid in gold and a mounted trophy, reported, done for the week; a held one lapses at the week\'s end (mutants: the rung\'s check; the count of one; the crown; the trophy\'s name; the report; the week\'s lapse)', async () => {
  const off = createHuntersMark({ hunt: null, now: () => 0, level: () => 16, entity: () => ({}), townName: () => '', sitesFor: () => [[1, 1]], playerPixel: () => null, canStand: () => true, standPack: () => null, say: () => {}, notice: () => {}, repaint: () => {} });
  assert.equal(off.boardRank(TOWN), null, 'offline: no rank');
  assert.equal(off.boardMark(TOWN), null, 'and no mark');
  assert.equal(huntBook(), null, 'no book for the pages');
  assert.equal(huntOnline(false, { changed() {} }), null);
  const low = markOf({ clears: HUNT_RUNGS[HUNT_MARK_RUNG].at - 1 });
  assert.deepEqual(low.mark.boardRank(TOWN), { reading: true }, 'the service not heard yet');
  await low.mark.book.refresh();
  assert.equal(low.mark.boardMark(TOWN), null, 'one short of the rung: no mark');
  assert.deepEqual(low.mark.boardRank(TOWN), { rung: 'hunter', clears: 39, next: { id: 'stalker', at: 40 }, from: 15, region: 3, waiting: 0 });
  const m = markOf();
  await m.mark.book.refresh();
  assert.ok(m.repaints() >= 1, 'the service\'s word redraws the board');
  const week = huntWeekAt(m.at.wall);
  const { foe, name, tier } = huntMarkOf(week, 16);
  const mk = m.mark.boardMark(TOWN);
  assert.equal(mk.state, 'open');
  const p = mk.posting;
  assert.equal(p.id, huntMarkId(week, 300, 200, 16));
  assert.equal(p.title, trophyTitle(foe, HUNT_MARK_NAMES.indexOf(name)));
  assert.match(p.title, new RegExp(`^${name} the `));
  assert.equal(p.gold, huntMarkGold(16));
  assert.deepEqual(p.traits, huntMarkTraits(week, tier));
  assert.equal(p.traits.length, HUNT_MARK_TRAITS);
  assert.ok([[302, 203], [298, 199]].some(([x, y]) => x === p.target.px && y === p.target.py), 'one of the board\'s own sites');
  assert.equal(p.count, 1);
  assert.equal(m.mark.take(p.id).ok, true);
  assert.equal(m.mark.boardMark(TOWN).state, 'held');
  assert.equal(m.mark.take(p.id).ok, false, 'held already');
  assert.equal(m.mark.mapMarks().length, 1);
  assert.equal(m.mark.questLogEntries()[0].clockSeconds, Math.floor((seatWeekStartMs(week) + SEAT_WEEK_MS - m.at.wall) / 1000));
  // away from its pixel: nothing stands
  m.mark.tick(1);
  assert.equal(m.stood.length, 0);
  m.at.here = { x: p.target.px, y: p.target.py };
  m.mark.tick(1); await flush();
  assert.equal(m.stood.length, 1);
  assert.equal(m.stood[0].count, 1, 'one beast');
  assert.equal(m.stood[0].mobileType, foe);
  const beast = m.pool[0].entity;
  assert.equal(beast.eliteFoe, true, 'an elite');
  assert.equal(beast.raidLeader.name, p.title, 'under its name');
  assert.deepEqual([...beast.bossTraits].sort(), [...p.traits].sort(), 'its two traits');
  m.mark.tick(1); await flush();
  assert.equal(m.stood.length, 1, 'stood once');
  m.pool[0].dead = true; m.pool[0].corpse = true;
  m.mark.tick(1); await flush();
  assert.equal(m.entity.goldPieces, p.gold, 'the purse');
  const trophy = m.entity.items.find((i) => i.templateIndex === TROPHY_TEMPLATE);
  assert.ok(trophy, 'a mounted trophy in the pack');
  assert.equal(trophy.message, foe);
  assert.equal(trophy.variant, HUNT_MARK_NAMES.indexOf(name) + 1);
  assert.equal(trophy.name, `Trophy: ${p.title}`);
  assert.deepEqual(m.cleared[0], [p.id, 5], 'reported with the board\'s region');
  assert.deepEqual(m.mark.book.kept(), [p.id], 'kept until the service answers');
  assert.equal(m.notices.length, 1);
  assert.equal(m.mark.boardMark(TOWN).state, 'paid');
  assert.equal(m.mark.take(p.id).ok, false, 'one a week');
  // a mark held past its week lapses
  const late = markOf();
  await late.mark.book.refresh();
  const lp = late.mark.boardMark(TOWN).posting;
  late.mark.take(lp.id);
  late.at.wall += 7 * 86_400_000;
  late.mark.tick(1);
  assert.equal(late.mark._held(), null);
  assert.match(late.said.at(-1), /The week is over\./);
  assert.equal(late.mark.boardMark(TOWN).state, 'open', 'next week\'s is posted');
});

// ─── THE BOUNTY HOST ─────────────────────────────────────────────────

test('HUNTERS-MARK THE BOUNTY HOST reports every board bounty it pays, with the board\'s region, to the hunt\'s book; the board\'s window is handed the rank and the mark; the journal\'s abandon of a mark is the mark\'s module\'s (mutants: the report gone from pay; the region dropped; the board\'s hunt view gone)', async () => {
  const wall = Date.UTC(2026, 9, 28, 12);
  const minutes = Math.floor(sharedClassicMinutes(wall));
  const today = Math.floor(minutes / 1440);
  const town = { px: 300, py: 200, name: 'Daggerfall' };
  const sites = bountySites(town.px, town.py, () => true);
  const p = boardPostings({ day: today, ...town, level: 5, sites }).find((q) => q.count < 6 && q.kind !== 'dungeon');
  assert.ok(p, 'a small posting today');
  const cleared = [];
  const door = { account: () => 'a', state: async () => ({ ok: true, data: { clears: 52, regions: { 9: 7 } } }), clear: async (c, id, region) => { cleared.push([id, region]); return { ok: false, error: 'offline' }; } };
  const entity = { goldPieces: 0, items: [] };
  const pool = [];
  let board = null;
  const host = createBountyHost({
    now: () => minutes, wallNow: () => wall, level: () => 5, entity: () => entity, townName: () => 'Daggerfall', regionAt: () => 9, siteOk: () => true,
    playerPixel: () => ({ x: p.target.px, y: p.target.py }), canStand: () => true,
    standPack: ({ count }) => { const foes = Array.from({ length: count }, () => ({ dead: false, corpse: false, entity: { health: 10 } })); pool.push(...foes); return { foes: Promise.resolve(foes), dx: 0, dz: 80 }; },
    foePool: () => pool, say: () => {}, showNotice: () => true, openBoardWindow: (d) => { board = d; }, rolls: () => 0.3,
    hunt: { door, storage: memStorage(), character: () => 'c-1' },
  });
  host.openBoard(town);
  await host.hunt.book.refresh();
  const view = board.hunt();
  assert.equal(view.rank.rung, 'stalker');
  assert.equal(view.rank.region, 7, 'this board\'s region');
  assert.equal(view.mark.state, 'open', 'a Stalker is posted the week\'s mark');
  assert.equal(board.take(p.id).ok, true);
  host.tick(1); await flush();
  for (const f of pool) { f.dead = true; f.corpse = true; f.entity.health = 0; }
  host.tick(1); await flush();
  assert.equal(entity.goldPieces, p.gold, 'paid');
  assert.deepEqual(cleared[0], [p.id, 9], 'reported, with its region');
  assert.deepEqual(host.hunt.book.kept(), [p.id]);
  // the journal's abandon of a mark goes to the mark's module
  assert.equal(view.takeMark(view.mark.posting.id).ok, true);
  assert.equal(host.hunt._held()?.id, view.mark.posting.id);
  assert.equal(view.dropMark(view.mark.posting.id).ok, true);
  assert.equal(host.hunt._held(), null);
});

// ─── THE BOARD'S WINDOW ──────────────────────────────────────────────

test('HUNTERS-MARK THE BOARD\'S WINDOW: the rank under its title - the rung and the clears, this region\'s, a bar to the next rung, the reports still to count; the week\'s mark first in the list, its card its traits, purse and trophy, Take handing its id; no header offline (mutants: the rank line never drawn; the bar backwards; the mark row not first; Take not handed the id)', () => {
  const posting = {
    id: 'm.2900.300.200.16', title: 'Scarneck the Gargoyle', tier: 5, gold: 600, tierLabel: 'Tier 5', story: 'It has killed hunters before.',
    poster: 'the hunters of Daggerfall', mapLine: 'Marked on your map.', traits: ['berserker', 'warded'],
  };
  const took = [];
  const rank = { rung: 'stalker', clears: 52, next: { id: 'slayer', at: 100 }, from: 40, region: 7, waiting: 1 };
  const host = document.createElement('div');
  const view = mountBountyBoard(host, {
    town: { name: 'Daggerfall' }, rows: () => [], held: () => [], nextDayIn: () => 60, inParty: () => false,
    take: () => ({ ok: true }), drop: () => ({ ok: true }), share: () => ({ ok: true }),
    hunt: () => ({ rank, mark: { posting, state: took.length ? 'held' : 'open' }, takeMark: (id) => { took.push(id); return { ok: true }; }, dropMark: () => ({ ok: true }) }),
  });
  const line = byClass(host, 'bounty-rank')[0];
  assert.ok(line, 'the rank line');
  assert.match(line.textContent, /Stalker · 52 bounties/);
  assert.match(line.textContent, /7 in this region/);
  assert.match(line.textContent, /Slayer at 100/);
  assert.match(line.textContent, /1 still to count/);
  assert.equal(byClass(host, 'bounty-rankbar')[0].children[0].style.width, `${Math.round(rankShare(rank) * 100)}%`);
  assert.equal(rankShare(rank), 0.2, '12 of the 60 to the next rung');
  const rows = byClass(host, 'bounty-post');
  assert.ok(rows[0].classList.contains('bounty-mark'), 'the mark first');
  assert.match(rows[0].textContent, /Scarneck the Gargoyle/);
  assert.match(rows[0].textContent, new RegExp(markStateWord('open')));
  rows[0].onclick();
  const card = byClass(host, 'bounty-markcard')[0];
  assert.ok(card, 'its card');
  assert.match(card.textContent, /It is .+ and .+\./);
  assert.match(card.textContent, /600 gold pieces/);
  byClass(card, 'bounty-take')[0].onclick({ stopPropagation() {}, preventDefault() {} });
  assert.deepEqual(took, [posting.id]);
  assert.match(byClass(host, 'bounty-note')[0].textContent, /Taken: Scarneck the Gargoyle/);
  view.unmount();
  const bare = document.createElement('div');
  mountBountyBoard(bare, { town: { name: 'X' }, rows: () => [], held: () => [], nextDayIn: () => 60, inParty: () => false, take: () => ({ ok: true }), drop: () => ({ ok: true }), share: () => ({ ok: true }) }).unmount();
  assert.equal(byClass(bare, 'bounty-rank').length, 0, 'offline: no header');
  assert.equal(rankWords({ reading: true }).region, '');
  assert.equal(rankWords({ ...rank, next: null }).next, 'The top rung');
});
