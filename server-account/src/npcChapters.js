// @ts-check

import { chaptersOpenFor } from './npcRoll.js';
import { REALM_ID_RE } from './realm.js';
import { regionOk } from '../../src/net/nodeLaw.js';
import { allRegionChapters, hallRowsRead } from './npcHalls.js';
import { weekSettled, keepWeekSettled } from './weekKept.js';
import { agreedGateRegions } from './seatInfluence.js';
import { seatWeekStartMs, SEAT_WEEK_MS, seasonEndingAt, seasonZeroOf, seasonOf, SEASON_WEEKS } from '../../src/net/townSeatLaw.js';
import {
  STRENGTH_START, strengthAfter, failingWeekAfter, strengthTarget, strengthSeasonEnd, chapterBandOf, meritWeekOf, hallHidden, chaptersSwitchOf,
  SEAT_MERIT_WEEKS, seatEligibleAt, chapterSeatPlan, seatChangesOf, chapterTitlesOf, chapterFocusOk, HIDDEN_HALL_FACTIONS,
  chapterEventWeights, chapterEventOf, chapterEventOk, chapterRivalsOf, chapterRivalPick, rivalryEnd, crackdownShuts, CHAPTER_ASCENDANT_FROM,
  schismDoctrinesOf, schismWinner, successionHeir, chapterBackOk, chapterDoctrineOk, SUCCESSION_TURNING,
  patronBidOk, patronEscrowId, patronWinnerOf,
} from '../../src/net/npcChapterLaw.js';
import { MARKS_MAX, MARKS_MOVE_MAX, MARKS_OPS_MAX, MARKS_OPS_WINDOW_S, MARKS_RID_RE, utcDay } from '../../src/net/marksLaw.js';
import { guildMay } from '../../src/net/guildLaw.js';
import { accountKind, displayName, overRate } from './accounts.js';
import { guildActorOf } from './guilds.js';
import { marksOpenFor, guildBalanceOf } from './marks.js';
import { mustChange } from './realm.js';
import { heraldryOfRow } from './halls.js';

export const CHAPTER_WEEKS_MAX = 8;
export const CHAPTER_TURNING_GRACE_S = 300;

/** @param {any} db @param {number} nowS */
export async function allChapters(db, nowS, rows = undefined) {
  return (await allRegionChapters(db, nowS, rows)).sort((a, b) => a.region - b.region || a.faction - b.faction);
}

const gateDayOf = (/** @type {unknown} */ ref) => { const m = /^gate:(\d+)$/.exec(String(ref)); return m ? Number(m[1]) : null; };

const turningOf = (/** @type {number} */ week) => Math.floor((seatWeekStartMs(week) + SEAT_WEEK_MS) / 1000);

/** @param {any} db @param {number} week @param {number} nowS @param {number | null} [zero]
 * @param {string} [open] */
export async function settleChapterWeek(db, week, nowS, zero = null, open = 'on') {
  const turning = turningOf(week);
  const active = Number((await db.prepare('SELECT COUNT(*) AS n FROM players WHERE handle IS NOT NULL AND played_at >= ?1')
    .bind(turning - SEAT_WEEK_MS / 1000).first())?.n ?? 0);
  const target = strengthTarget(active);
  const { results: lines = [] } = await db.prepare(`SELECT faction, region, source, ref, SUM(amount) AS n FROM npc_chapter_merit WHERE week = ?1
    GROUP BY faction, region, source, CASE WHEN source = 'gate' THEN ref ELSE '' END`).bind(week).all();
  const gateDays = [...new Set(lines.filter((r) => r.source === 'gate').map((r) => gateDayOf(r.ref)).filter((d) => d !== null))];
  const agreed = await agreedGateRegions(db, gateDays);
  const merits = lines.filter((r) => r.source !== 'gate' || agreed.get(/** @type {number} */ (gateDayOf(r.ref))) === Number(r.region));
  const last = await db.prepare("SELECT open FROM npc_chapter_weeks WHERE week < ?1 AND open <> 'off' ORDER BY week DESC LIMIT 1").bind(week).first();
  const opened = open === 'on' && last?.open === 'dev'
    && !(await db.prepare("SELECT 1 FROM npc_chapter_weeks WHERE week < ?1 AND open = 'on' LIMIT 1").bind(week).first());
  const { results: held = [] } = opened ? { results: [] } : await db.prepare('SELECT faction, region, strength, event, event_season, event_data, shut_season, doctrine, doctrine_season FROM npc_chapters').all();
  /** @type {Map<string, Chapter>} */
  const all = new Map();
  const at = (/** @type {number} */ f, /** @type {number} */ g) => {
    const k = `${f}|${g}`;
    if (!all.has(k)) all.set(k, { faction: f, region: g, prev: STRENGTH_START, merit: 0, s: STRENGTH_START, event: null, eventSeason: null, data: {}, shut: null, doctrine: null, doctrineSeason: null });
    return /** @type {Chapter} */ (all.get(k));
  };
  const confirmed = await allChapters(db, nowS);
  for (const c of confirmed) at(c.faction, c.region);
  for (const r of held) Object.assign(at(Number(r.faction), Number(r.region)), heldEvent(r), { prev: Number(r.strength) });
  for (const r of merits) at(Number(r.faction), Number(r.region)).merit += Number(r.n);
  const ends = seasonEndingAt(week, zero);
  const keys = new Set(confirmed.map((c) => `${c.faction}|${c.region}`));
  const season = seasonOf(week, zero);
  const live = (/** @type {Chapter} */ c) => (season && c.eventSeason === season.n ? c.event : null);
  for (const c of all.values()) c.s = failingWeekAfter(c.prev, strengthAfter(c.prev, c.merit, target), c.merit, target);
  if (season && week >= season.start + SUCCESSION_TURNING - 1) await successionNamed(db, season, week, all, live);
  /** @type {any[]} */
  const seasonRows = ends ? await seasonEnded(db, /** @type {{ n: number, start: number }} */ (season), week, all, keys, live, opened, open) : [];
  const next = seasonOf(week + 1, zero);
  if (next && next.start === week + 1) await seasonDrawn(db, next.n, week, season, all, keys);
  const patrons = opened ? await patronsDrawn(db, PATRON_SEASONS_ALL, new Set())
    : next && next.start === week + 1 ? await patronsDrawn(db, next.n, keys) : null;
  const rows = [...all.values()].map((c) => [c.faction, c.region, ends ? strengthSeasonEnd(c.s) : c.s, c.merit, c.event, c.eventSeason, JSON.stringify(c.data), c.shut, c.doctrine, c.doctrineSeason]);
  const seats = await seatsPlaced(db, week, turning, open, opened, keys);
  try {
    await db.batch([
      // A plain INSERT of the week's key goes first, so a second settler fails on the key and its whole
      // batch rolls back.
      db.prepare('INSERT INTO npc_chapter_weeks (week, active, target, chapters, open, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(week, active, target, rows.length, open, nowS),
      ...(opened ? [db.prepare("UPDATE npc_chapters SET strength = ?1, event = NULL, event_season = NULL, event_data = '{}', shut_season = NULL, doctrine = NULL, doctrine_season = NULL, patron = NULL, patron_season = NULL WHERE true").bind(STRENGTH_START)] : []),
      db.prepare(`INSERT INTO npc_chapters (faction, region, strength, week, merit, at, event, event_season, event_data, shut_season, doctrine, doctrine_season)
        SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), ?1, json_extract(value, '$[3]'), ?2,
          json_extract(value, '$[4]'), json_extract(value, '$[5]'), json_extract(value, '$[6]'), json_extract(value, '$[7]'),
          json_extract(value, '$[8]'), json_extract(value, '$[9]')
        FROM json_each(?3) WHERE true
        ON CONFLICT (faction, region) DO UPDATE SET strength = excluded.strength, week = excluded.week, merit = excluded.merit, at = excluded.at,
          event = excluded.event, event_season = excluded.event_season, event_data = excluded.event_data, shut_season = excluded.shut_season,
          doctrine = excluded.doctrine, doctrine_season = excluded.doctrine_season`)
        .bind(week, nowS, JSON.stringify(rows)),
      db.prepare('DELETE FROM npc_chapter_seats WHERE true'),
      db.prepare(`INSERT INTO npc_chapter_seats (faction, region, char_id, account, seat, since, week, at)
        SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]'),
          json_extract(value, '$[4]'), json_extract(value, '$[5]'), ?1, ?2 FROM json_each(?3)
          WHERE EXISTS (SELECT 1 FROM realm_characters c WHERE c.id = json_extract(value, '$[2]'))`)
        .bind(week, nowS, JSON.stringify(seats.rows)),
      db.prepare(`INSERT INTO npc_chapter_history (faction, region, week, kind, char_id, data, at)
        SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), ?1, 'seat', json_extract(value, '$[2]'),
          json_object('from', json_extract(value, '$[3]'), 'to', json_extract(value, '$[4]')), ?2 FROM json_each(?3)
          WHERE json_extract(value, '$[4]') IS NULL OR EXISTS (SELECT 1 FROM realm_characters c WHERE c.id = json_extract(value, '$[2]'))`)
        .bind(week, nowS, JSON.stringify(seats.changes)),
      db.prepare(`INSERT INTO npc_chapter_history (faction, region, week, kind, char_id, data, at)
        SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), ?1, json_extract(value, '$[2]'), json_extract(value, '$[3]'), json_extract(value, '$[4]'), ?2
        FROM json_each(?3) WHERE json_extract(value, '$[3]') = '' OR EXISTS (SELECT 1 FROM realm_characters c WHERE c.id = json_extract(value, '$[3]'))`)
        .bind(week, nowS, JSON.stringify([...seasonRows, ...(patrons?.rows ?? [])])),
      ...(patrons ? patronStatements(db, patrons, nowS) : []),
    ]);
  } catch {
    return { settled: false };
  }
  return { settled: true, chapters: rows.length };
}

const PATRON_ACTOR = 'chapters';
const PATRON_SEASONS_ALL = 2 ** 31 - 1;
const LEDGER = 'INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)';

/** @param {any} db @param {number} n @param {Set<string>} keys */
async function patronsDrawn(db, n, keys) {
  const { results: bids = [] } = await db.prepare(`SELECT b.faction, b.region, b.season, b.guild_id, b.amount, b.at, g.name, g.tag,
      (SELECT balance FROM guild_marks m WHERE m.guild_id = b.guild_id) AS treasury
    FROM npc_chapter_patron_bids b LEFT JOIN guilds g ON g.id = b.guild_id WHERE b.season <= ?1 AND b.state = 'open'
    ORDER BY b.season, b.faction, b.region, b.guild_id`).bind(n).all();
  /** @type {Map<string, any[]>} */
  const by = new Map();
  for (const b of bids) {
    const k = `${b.faction}|${b.region}|${b.season}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k)?.push(b);
  }
  /** @type {Map<string, number>} */
  const home = new Map();
  const lines = [], won = [], rows = [];
  for (const [k, list] of by) {
    const [f, g, season] = k.split('|').map(Number);
    const standing = season === n && keys.has(`${f}|${g}`) && !hallHidden(f) ? list.filter((b) => b.name != null) : [];
    const win = patronWinnerOf(standing.map((b) => ({ guild: String(b.guild_id), amount: Number(b.amount), at: Number(b.at), b })))?.b ?? null;
    for (const b of list) {
      const guild = String(b.guild_id), id = patronEscrowId(season, f, g, guild);
      if (b === win) {
        lines.push([id, 'burn', null, 'patron', f, g, guild, season]);
        won.push([f, g, guild]);
        rows.push([f, g, 'patron', '', JSON.stringify({ season: n, guild, name: String(b.name), tag: b.tag == null ? '' : String(b.tag) })]);
        continue;
      }
      const left = home.has(guild) ? /** @type {number} */ (home.get(guild)) : Number(b.treasury ?? 0);
      const goes = b.name != null && left + Number(b.amount) <= MARKS_MAX;
      if (goes) home.set(guild, left + Number(b.amount));
      lines.push([id, goes ? 'guild' : 'burn', goes ? guild : null, 'patron-return', f, g, guild, season]);
    }
  }
  return { n, lines, won, rows };
}

/** @param {any} db @param {{ n: number, lines: any[], won: any[] }} p @param {number} nowS */
function patronStatements(db, { n, lines, won }, nowS) {
  return [
    db.prepare(`${LEDGER} SELECT 'escrow', json_extract(v.value, '$[0]'), json_extract(v.value, '$[1]'), json_extract(v.value, '$[2]'),
        json_extract(v.value, '$[3]'), b.amount, ?2, ?3, '${PATRON_ACTOR}', 'The Turning', json_extract(v.value, '$[0]')
      FROM json_each(?1) v JOIN npc_chapter_patron_bids b ON b.faction = json_extract(v.value, '$[4]') AND b.region = json_extract(v.value, '$[5]')
        AND b.guild_id = json_extract(v.value, '$[6]') AND b.season = json_extract(v.value, '$[7]') AND b.state = 'open'`).bind(JSON.stringify(lines), utcDay(nowS), nowS),
    db.prepare(`UPDATE npc_chapter_patron_bids SET state = CASE WHEN (faction, region, guild_id, season) IN (SELECT json_extract(value, '$[0]'),
        json_extract(value, '$[1]'), json_extract(value, '$[2]'), ?1 FROM json_each(?2)) THEN 'won' ELSE 'lost' END
      WHERE season <= ?1 AND state = 'open' AND (faction, region, guild_id, season) IN (SELECT json_extract(value, '$[4]'), json_extract(value, '$[5]'),
        json_extract(value, '$[6]'), json_extract(value, '$[7]') FROM json_each(?3))`).bind(n, JSON.stringify(won), JSON.stringify(lines)),
    db.prepare(`UPDATE npc_chapters SET patron = w.guild, patron_season = ?2
      FROM (SELECT json_extract(value, '$[0]') AS f, json_extract(value, '$[1]') AS g, json_extract(value, '$[2]') AS guild FROM json_each(?1)) w
      WHERE npc_chapters.faction = w.f AND npc_chapters.region = w.g`).bind(JSON.stringify(won), n),
    // Fails the whole batch while a bid for the Season is still open, so a bid that landed after the
    // read settles on the next read.
    db.prepare("INSERT INTO realm_tx_guard (moved, expected) SELECT 1, 0 WHERE EXISTS (SELECT 1 FROM npc_chapter_patron_bids WHERE season <= ?1 AND state = 'open')").bind(n),
  ];
}

/** @param {{ db: any, nowS: number }} ctx @param {any} player @param {any} env @param {any} body */
export async function bidPatron(ctx, player, env, { character, faction, region, marks, rid } = {}) {
  const { db, nowS } = ctx;
  if (typeof character !== 'string' || !REALM_ID_RE.test(character) || !regionOk(region) || !Number.isSafeInteger(faction)) return { error: 'body' };
  if (accountKind(player) !== 'linked') return { error: 'marks-need-account' };
  if (typeof rid !== 'string' || !MARKS_RID_RE.test(rid)) return { error: 'marks-rid' };
  const prior = await db.prepare('SELECT * FROM marks_ledger WHERE actor = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (prior) {
    if (prior.kind !== 'patron-escrow') return { error: 'marks-rid' };
    const bid = await db.prepare('SELECT season, amount FROM npc_chapter_patron_bids WHERE faction = ?1 AND region = ?2 AND guild_id = ?3 ORDER BY season DESC').bind(faction, region, prior.src_id).first();
    return { ok: true, repeat: true, season: Number(bid?.season ?? 0), marks: Number(bid?.amount ?? 0), guildMarks: await guildBalanceOf(db, prior.src_id) };
  }
  const zero = seasonZeroOf(env?.SEASON_ZERO_WEEK);
  await settleChaptersDue(db, nowS, zero, env?.CHAPTERS_OPEN);
  const now = seasonOf(meritWeekOf(nowS), zero);
  if (!now) return { error: 'no-season' };
  const season = now.n + 1;
  if (hallHidden(faction) || !(await allChapters(db, nowS)).some((c) => c.faction === faction && c.region === region)) return { error: 'no-chapter' };
  const a = await guildActorOf(db, player, character);
  if (a.error) return a;
  if (!guildMay(a.me.rank, 'withdraw')) return { error: 'guild-rank' };
  if (!marksOpenFor(player, env)) return { error: 'marks-closed' };
  const guild = String(a.me.guild_id);
  const prev = Number((await db.prepare('SELECT amount FROM npc_chapter_patron_bids WHERE faction = ?1 AND region = ?2 AND season = ?3 AND guild_id = ?4')
    .bind(faction, region, season, guild).first())?.amount ?? 0);
  if (!Number.isSafeInteger(marks) || marks < 1 || marks - prev > MARKS_MOVE_MAX) return { error: 'bad-marks' };
  if (!patronBidOk(marks, prev)) return { error: marks > MARKS_MAX ? 'bad-marks' : 'patron-low' };
  if (await overRate(ctx, `marks:${player.id}`, MARKS_OPS_MAX, MARKS_OPS_WINDOW_S)) return { error: 'marks-rate' };
  const more = marks - prev;
  try {
    await db.batch([
      db.prepare(`${LEDGER} SELECT 'guild', ?1, 'escrow', ?2, 'patron-escrow', ?3, ?4, ?5, ?6, ?7, ?8
        WHERE COALESCE((SELECT balance FROM guild_marks WHERE guild_id = ?1), 0) >= ?3
          AND EXISTS (SELECT 1 FROM guild_members WHERE player = ?6 AND char_id = ?9 AND guild_id = ?1 AND rank = ?10)
          AND COALESCE((SELECT amount FROM npc_chapter_patron_bids WHERE faction = ?11 AND region = ?12 AND season = ?13 AND guild_id = ?1), 0) = ?14
          AND NOT EXISTS (SELECT 1 FROM npc_chapter_weeks WHERE week >= ?15)`)
        .bind(guild, patronEscrowId(season, faction, region, guild), more, utcDay(nowS), nowS, player.id, displayName(player), rid, character, a.me.rank,
          faction, region, season, prev, now.end - 1),
      mustChange(db),
      db.prepare(`INSERT INTO npc_chapter_patron_bids (faction, region, season, guild_id, amount, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT (faction, region, season, guild_id) DO UPDATE SET amount = excluded.amount, at = excluded.at`).bind(faction, region, season, guild, marks, nowS),
    ]);
  } catch {
    if (await db.prepare('SELECT 1 FROM npc_chapter_weeks WHERE week >= ?1').bind(now.end - 1).first()) return { error: 'closed' };
    return { error: (await guildBalanceOf(db, guild)) < more ? 'guild-marks-short' : 'patron-low' };
  }
  return { ok: true, season, marks, guildMarks: await guildBalanceOf(db, guild) };
}

export async function regionPatrons(/** @type {any} */ db, /** @type {number | null} */ region, /** @type {number | null} */ n) {
  const read = patronsRead(db, region, n);
  return patronsFrom(read ? (await read.all()).results ?? [] : []);
}
export function patronsRead(/** @type {any} */ db, /** @type {number | null} */ region, /** @type {number | null} */ n) {
  if (n == null) return null;
  const head = 'SELECT c.faction, c.region, g.id, g.name, g.tag, g.heraldry FROM npc_chapters c JOIN guilds g ON g.id = c.patron';
  return region == null ? db.prepare(`${head} WHERE c.patron_season = ?1`).bind(n) : db.prepare(`${head} WHERE c.region = ?2 AND c.patron_season = ?1`).bind(n, region);
}
export function patronsFrom(/** @type {any[]} */ results) {
  /** @type {Map<string, any>} */
  const out = new Map();
  for (const r of results) out.set(`${r.faction}|${r.region}`, { id: String(r.id), name: String(r.name), tag: String(r.tag ?? ''), heraldry: heraldryOfRow(r.heraldry) });
  return out;
}

export async function guildPatronBids(/** @type {any} */ db, /** @type {number} */ region, /** @type {number} */ n, /** @type {string} */ guild) {
  const { results = [] } = await db.prepare("SELECT faction, amount FROM npc_chapter_patron_bids WHERE region = ?1 AND season = ?2 AND guild_id = ?3 AND state = 'open'").bind(region, n, guild).all();
  return new Map(results.map((/** @type {any} */ r) => [Number(r.faction), Number(r.amount)]));
}

/** @typedef {{ faction: number, region: number, prev: number, merit: number, s: number, event: string | null, eventSeason: number | null, data: any, shut: number | null, doctrine: string | null, doctrineSeason: number | null }} Chapter */

function heldEvent(/** @type {any} */ r) {
  let data = {};
  try { data = JSON.parse(r.event_data ?? '{}') ?? {}; } catch { }
  return {
    event: chapterEventOk(r.event) ? String(r.event) : null, eventSeason: r.event_season == null ? null : Number(r.event_season),
    data: typeof data === 'object' && !Array.isArray(data) ? data : {}, shut: r.shut_season == null ? null : Number(r.shut_season),
    doctrine: chapterDoctrineOk(r.doctrine) ? String(r.doctrine) : null, doctrineSeason: r.doctrine_season == null ? null : Number(r.doctrine_season),
  };
}

/** @param {any} db @param {number} from @param {number} to */
async function accountMeritBetween(db, from, to) {
  const { results: lines = [] } = await db.prepare(`SELECT faction, region, account, source, ref, SUM(amount) AS n FROM npc_chapter_merit WHERE week BETWEEN ?1 AND ?2
    GROUP BY faction, region, account, source, CASE WHEN source = 'gate' THEN ref ELSE '' END`).bind(from, to).all();
  const gateDays = [...new Set(lines.filter((r) => r.source === 'gate').map((r) => gateDayOf(r.ref)).filter((d) => d !== null))];
  const agreed = await agreedGateRegions(db, gateDays);
  /** @type {Map<string, number>} */
  const out = new Map();
  for (const r of lines) {
    if (r.source === 'gate' && agreed.get(/** @type {number} */ (gateDayOf(r.ref))) !== Number(r.region)) continue;
    const k = `${r.faction}|${r.region}|${r.account}`;
    out.set(k, (out.get(k) ?? 0) + Number(r.n));
  }
  return out;
}

/** @param {any} db @param {{ n: number, start: number }} season @param {number} week */
async function seasonBacking(db, season, week) {
  const { results = [] } = await db.prepare('SELECT faction, region, account, char_id, side FROM npc_chapter_backing WHERE season = ?1 ORDER BY account')
    .bind(season.n).all();
  /** @type {Map<string, { account: string, char: string, side: number }[]>} */
  const backs = new Map();
  for (const r of results) {
    const k = `${r.faction}|${r.region}`;
    if (!backs.has(k)) backs.set(k, []);
    backs.get(k)?.push({ account: String(r.account), char: String(r.char_id), side: Number(r.side) });
  }
  const { results: seated = [] } = await db.prepare("SELECT faction, region, char_id FROM npc_chapter_seats WHERE seat = 'master'").all();
  const masters = new Map(seated.map((m) => [`${m.faction}|${m.region}`, String(m.char_id)]));
  return { backs, masters, merit: backs.size ? await accountMeritBetween(db, season.start, week) : new Map() };
}

/** @param {any} db @param {{ n: number, start: number }} season @param {number} week
 * @param {Map<string, Chapter>} all @param {(c: Chapter) => string | null} live */
async function successionNamed(db, season, week, all, live) {
  const due = [...all.values()].filter((c) => live(c) === 'succession' && !Number.isSafeInteger(c.data.heir));
  if (!due.length) return;
  const { backs, masters, merit } = await seasonBacking(db, season, week);
  for (const c of due) {
    const k = `${c.faction}|${c.region}`;
    const list = (backs.get(k) ?? []).filter((b) => chapterBackOk('succession', b.side));
    const master = list.find((b) => b.char === masters.get(k))?.side ?? null;
    const top = list.reduce((/** @type {{ account: string, side: number, n: number } | null} */ best, b) => {
      const n = merit.get(`${k}|${b.account}`) ?? 0;
      return n > 0 && (!best || n > best.n) ? { account: b.account, side: b.side, n } : best;
    }, null);
    const heir = successionHeir(master, top?.side ?? null);
    c.data = { ...c.data, heir, named: master !== null ? 'master' : top ? 'member' : 'hall' };
  }
}

/** @param {any} db @param {number} from @param {number} to */
async function chapterMeritBetween(db, from, to) {
  const { results: lines = [] } = await db.prepare(`SELECT faction, region, source, ref, SUM(amount) AS n FROM npc_chapter_merit WHERE week BETWEEN ?1 AND ?2
    GROUP BY faction, region, source, CASE WHEN source = 'gate' THEN ref ELSE '' END`).bind(from, to).all();
  const gateDays = [...new Set(lines.filter((r) => r.source === 'gate').map((r) => gateDayOf(r.ref)).filter((d) => d !== null))];
  const agreed = await agreedGateRegions(db, gateDays);
  /** @type {Map<string, number>} */
  const out = new Map();
  for (const r of lines) {
    if (r.source === 'gate' && agreed.get(/** @type {number} */ (gateDayOf(r.ref))) !== Number(r.region)) continue;
    const k = `${r.faction}|${r.region}`;
    out.set(k, (out.get(k) ?? 0) + Number(r.n));
  }
  return out;
}

/** @param {any} db @param {{ n: number, start: number }} season @param {number} week
 * @param {Map<string, Chapter>} all @param {Set<string>} keys @param {(c: Chapter) => string | null} live
 * @param {boolean} opened @param {string} open */
async function seasonEnded(db, season, week, all, keys, live, opened, open) {
  const merit = await chapterMeritBetween(db, season.start, week);
  /** @type {Map<string, string | null>} */
  const raced = new Map();
  /** @type {Set<string>} */
  const ran = new Set();
  for (const c of all.values()) {
    if (live(c) !== 'rivalry') continue;
    const k = `${c.faction}|${c.region}`, rk = `${c.data.rival}|${c.region}`;
    const r = keys.has(rk) ? all.get(rk) : undefined;
    if (!r) { c.data = { ...c.data, won: null }; continue; }
    const pair = [k, rk].sort().join('&');
    if (!raced.has(pair) && (ran.has(k) || ran.has(rk))) raced.set(pair, null);
    if (!raced.has(pair)) {
      const end = rivalryEnd([c.s, r.s], [merit.get(k) ?? 0, merit.get(rk) ?? 0]);
      c.s = end.a; r.s = end.b;
      raced.set(pair, end.won === null ? null : end.won === 'a' ? k : rk);
      ran.add(k); ran.add(rk);
    }
    const winner = raced.get(pair);
    c.data = { ...c.data, won: winner == null ? null : winner === k };
  }
  if ([...all.values()].some((c) => live(c) === 'schism')) {
    const { backs, masters, merit: by } = await seasonBacking(db, season, week);
    for (const c of all.values()) {
      if (live(c) !== 'schism') continue;
      const k = `${c.faction}|${c.region}`;
      const list = (backs.get(k) ?? []).filter((b) => chapterBackOk('schism', b.side));
      /** @type {[number, number]} */
      const sums = [0, 0];
      for (const b of list) sums[b.side] += by.get(`${k}|${b.account}`) ?? 0;
      const won = schismWinner(sums, list.find((b) => b.char === masters.get(k))?.side ?? null);
      const doctrine = won === null ? null : schismDoctrinesOf(season.n, c.faction, c.region)[won];
      if (doctrine) { c.doctrine = doctrine; c.doctrineSeason = season.n + 1; }
      c.data = { ...c.data, sums, doctrine };
    }
  }
  /** @type {any[]} */
  const out = [];
  for (const c of all.values()) {
    const e = live(c);
    if (e === 'crackdown') {
      const shut = crackdownShuts(c.s);
      if (shut) c.shut = season.n + 1;
      c.data = { ...c.data, shut };
    }
    if (e && e !== 'calm') out.push([c.faction, c.region, 'event', '', JSON.stringify({ ...c.data, season: season.n, event: e })]);
  }
  const trial = open !== 'on' || !!(await db.prepare("SELECT 1 FROM npc_chapter_weeks WHERE week BETWEEN ?1 AND ?2 AND open = 'dev' LIMIT 1").bind(season.start, week - 1).first());
  if (season.n > 0 && !opened && !trial) {
    const { results: masters = [] } = await db.prepare(`SELECT s.faction, s.region, s.char_id FROM npc_chapter_seats s WHERE s.seat = 'master' AND s.since <= ?1
      AND NOT EXISTS (SELECT 1 FROM npc_chapter_history h WHERE h.char_id = s.char_id AND h.week BETWEEN ?2 AND ?3 AND h.faction = s.faction
        AND h.region = s.region AND h.kind = 'seat' AND json_extract(h.data, '$.to') = 'master')
      ORDER BY s.faction, s.region`).bind(season.start - 1, season.start, week - 1).all();
    for (const m of masters) {
      if (keys.has(`${m.faction}|${m.region}`)) out.push([Number(m.faction), Number(m.region), 'season', String(m.char_id), JSON.stringify({ season: season.n })]);
    }
  }
  return out;
}

/** @param {any} db @param {number} n @param {number} week @param {{ start: number } | null} ended
 * @param {Map<string, Chapter>} all @param {Set<string>} keys */
async function seasonDrawn(db, n, week, ended, all, keys) {
  /** @type {Map<string, number>} */
  const masters = new Map();
  if (ended) {
    const { results = [] } = await db.prepare(`SELECT faction, region, COUNT(*) AS n FROM npc_chapter_history WHERE kind = 'seat' AND week BETWEEN ?1 AND ?2
      AND json_extract(data, '$.to') = 'master' GROUP BY faction, region`).bind(ended.start - 1, week - 1).all();
    for (const r of results) masters.set(`${r.faction}|${r.region}`, Number(r.n));
  }
  const { results: curfews = [] } = await db.prepare(`SELECT DISTINCT h.region FROM town_seat_edicts e JOIN town_seat_holds h ON h.key = e.key
    WHERE e.week = ?1 AND e.state = 'law' AND e.edict = 'curfew'`).bind(week).all();
  const curfew = new Set(curfews.map((r) => Number(r.region)));
  for (const c of all.values()) {
    const k = `${c.faction}|${c.region}`;
    if (!keys.has(k)) continue;
    const rivals = chapterRivalsOf(c.faction).map((f) => all.get(`${f}|${c.region}`)).filter((r) => r && keys.has(`${r.faction}|${r.region}`))
      .map((r) => ({ faction: /** @type {Chapter} */ (r).faction, strength: /** @type {Chapter} */ (r).s }));
    const rival = chapterRivalPick(rivals);
    const weights = chapterEventWeights({
      faction: c.faction, band: chapterBandOf(c.s).band, masters: masters.get(k) ?? 0,
      rivalBand: rival === null ? null : chapterBandOf(/** @type {Chapter} */ (all.get(`${rival}|${c.region}`)).s).band, curfew: curfew.has(c.region),
    });
    c.event = chapterEventOf(n, c.faction, c.region, weights);
    c.eventSeason = n;
    c.data = c.event === 'rivalry' ? { rival } : {};
  }
}

/** @param {any} db @param {number} week @param {number} turning @param {string} open @param {boolean} opened
 * @param {Set<string>} chapters */
async function seatsPlaced(db, week, turning, open, opened, chapters) {
  const dev = open === 'on' ? (await db.prepare("SELECT MAX(week) AS w FROM npc_chapter_weeks WHERE week < ?1 AND open = 'dev'").bind(week).first())?.w : null;
  const { results: opens = [] } = await db.prepare("SELECT week FROM npc_chapter_weeks WHERE week < ?1 AND open <> 'off' ORDER BY week DESC LIMIT ?2")
    .bind(week, SEAT_MERIT_WEEKS - 1).all();
  const from = Math.max(Math.min(week - SEAT_MERIT_WEEKS + 1, ...opens.map((/** @type {any} */ r) => Number(r.week))), dev == null ? -Infinity : Number(dev) + 1);
  const { results: lines = [] } = await db.prepare(`SELECT faction, region, char_id, source, ref, SUM(amount) AS n FROM npc_chapter_merit
    WHERE week BETWEEN ?1 AND ?2 GROUP BY faction, region, char_id, source, CASE WHEN source = 'gate' THEN ref ELSE '' END`).bind(from, week).all();
  const gateDays = [...new Set(lines.filter((r) => r.source === 'gate').map((r) => gateDayOf(r.ref)).filter((d) => d !== null))];
  const agreed = await agreedGateRegions(db, gateDays);
  const counted = lines.filter((r) => r.source !== 'gate' || agreed.get(/** @type {number} */ (gateDayOf(r.ref))) === Number(r.region));
  const chars = [...new Set(counted.map((r) => String(r.char_id)))];
  const { results: roll = [] } = chars.length ? await db.prepare(`SELECT r.char_id, r.faction_id, r.player, r.rep, r.member, r.joined_at, p.registered_at
    FROM npc_roll r JOIN realm_characters c ON c.id = r.char_id AND c.player = r.player AND c.dead_at IS NULL JOIN players p ON p.id = r.player
    WHERE r.member = 1 AND r.dormant = 0 AND r.char_id IN (SELECT value FROM json_each(?1))`).bind(JSON.stringify(chars)).all() : { results: [] };
  const eligible = new Map(roll.filter((r) => seatEligibleAt({ member: r.member, rep: r.rep, joinedAt: r.joined_at, registeredAt: r.registered_at }, turning))
    .map((r) => [`${r.char_id}|${r.faction_id}`, { account: String(r.player), joinedAt: Number(r.joined_at) }]));
  /** @type {Map<string, { faction: number, region: number, char: string, account: string, merit: number, joinedAt: number }>} */
  const candidates = new Map();
  for (const r of counted) {
    const e = eligible.get(`${r.char_id}|${r.faction}`);
    if (!e || !chapters.has(`${r.faction}|${r.region}`)) continue;
    const k = `${r.faction}|${r.region}|${r.char_id}`;
    if (!candidates.has(k)) candidates.set(k, { faction: Number(r.faction), region: Number(r.region), char: String(r.char_id), ...e, merit: 0 });
    /** @type {any} */ (candidates.get(k)).merit += Number(r.n);
  }
  const { results: sat = [] } = opened ? { results: [] } : await db.prepare('SELECT faction, region, char_id, seat, since FROM npc_chapter_seats').all();
  const sitting = sat.map((s) => ({ faction: Number(s.faction), region: Number(s.region), char: String(s.char_id), seat: String(s.seat), since: Number(s.since) }));
  const since = new Map(sitting.map((s) => [`${s.faction}|${s.region}|${s.char}`, s.since]));
  const plan = chapterSeatPlan(candidates.values(), sitting);
  return {
    rows: plan.map((p) => [p.faction, p.region, p.char, p.account, p.seat, since.get(`${p.faction}|${p.region}|${p.char}`) ?? week]),
    changes: seatChangesOf(sitting, plan).map((c) => [c.faction, c.region, c.char, c.from, c.to]),
  };
}

// The relay must know every chapter title id before CHAPTER_TITLES is on; it refuses a token with
// an unknown title at the hello.
export const chapterTitlesOpenFor = (/** @type {any} */ player, /** @type {any} */ env) => env?.CHAPTER_TITLES === 'on' && chaptersOpenFor(player, env);

const seasonStartOf = (/** @type {number} */ week, /** @type {number | null} */ zero) => seasonOf(week, zero)?.start ?? Math.floor(week / SEASON_WEEKS) * SEASON_WEEKS;

/** @param {any} db @param {string} playerId @param {number} nowS @param {number | null} [zero]
 * @param {string | null} [character] */
export async function chapterTitlesOfAccount(db, playerId, nowS, zero = null, character = null) {
  const week = meritWeekOf(nowS);
  const who = 'JOIN realm_characters c ON c.id = x.char_id AND c.player = ?1 AND c.dead_at IS NULL WHERE (?2 IS NULL OR x.char_id = ?2)';
  const { results: seats = [] } = await db.prepare(`SELECT x.char_id, x.faction, x.region, x.seat FROM npc_chapter_seats x ${who}`).bind(playerId, character).all();
  const { results: lost = [] } = await db.prepare(`SELECT x.char_id, x.faction, x.region FROM npc_chapter_history x ${who}
    AND x.kind = 'seat' AND json_extract(x.data, '$.from') = 'master' AND x.week >= ?3`).bind(playerId, character, seasonStartOf(week, zero)).all();
  const { results: whole = [] } = await db.prepare(`SELECT x.char_id, x.faction, x.region, x.data FROM npc_chapter_history x ${who}
    AND x.kind = 'season'`).bind(playerId, character).all();
  const season = seasonOf(week, zero)?.n ?? 0;
  if (!seats.length && !lost.length && !whole.length) return [];
  const confirmed = new Set((await allChapters(db, nowS)).map((c) => `${c.faction}|${c.region}`));
  const led = seats.filter((r) => r.seat === 'master').map((r) => [Number(r.faction), Number(r.region)]);
  const { results: rising = [] } = led.length
    ? await db.prepare(`SELECT faction, region FROM npc_chapters WHERE strength >= ?1 AND (faction, region) IN
        (SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(?2))`).bind(CHAPTER_ASCENDANT_FROM, JSON.stringify(led)).all() : { results: [] };
  const ascendant = new Set(rising.map((/** @type {any} */ c) => `${c.faction}|${c.region}`));
  const kept = (/** @type {any[]} */ rows) => rows.filter((r) => confirmed.has(`${r.faction}|${r.region}`));
  const seatsHere = kept(seats), lostHere = kept(lost);
  const heldOf = (/** @type {any} */ r) => { try { return Number(JSON.parse(r.data)?.season); } catch { return NaN; } };
  const chars = [...new Set([...seatsHere, ...lostHere, ...whole].map((r) => String(r.char_id)))].sort();
  return chars.flatMap((ch) => chapterTitlesOf(
    seatsHere.filter((r) => r.char_id === ch).map((r) => ({ f: Number(r.faction), region: Number(r.region), seat: String(r.seat), high: ascendant.has(`${r.faction}|${r.region}`) })),
    lostHere.filter((r) => r.char_id === ch).map((r) => ({ f: Number(r.faction), region: Number(r.region) })), season,
    whole.filter((r) => r.char_id === ch).map((r) => ({ f: Number(r.faction), region: Number(r.region), season: heldOf(r) })),
  ).map((t) => ({ char: ch, ...t })));
}

export async function chapterSeatsOf(/** @type {any} */ db, /** @type {unknown} */ character) {
  if (typeof character !== 'string') return [];
  const { results = [] } = await db.prepare('SELECT faction, region, seat, since FROM npc_chapter_seats WHERE char_id = ?1 ORDER BY faction, region').bind(character).all();
  return results.map((/** @type {any} */ s) => ({ f: Number(s.faction), region: Number(s.region), seat: String(s.seat), since: Number(s.since) }));
}

/** @param {any} db @param {number} nowS @param {number | null} [zero] @param {unknown} [open] */
export async function settleChaptersDue(db, nowS, zero = null, open = 'on') {
  const sw = chaptersSwitchOf(open);
  const current = meritWeekOf(nowS - CHAPTER_TURNING_GRACE_S);
  if (weekSettled(db, `chapters:${sw}`, current)) return 0;
  const last = (await db.prepare('SELECT MAX(week) AS w FROM npc_chapter_weeks').first())?.w;
  if (last != null && Number(last) + 1 >= current) { keepWeekSettled(db, `chapters:${sw}`, current); return 0; }
  if (sw === 'off') {
    if (last == null) return 0;
    const weeks = [];
    for (let w = Math.max(Number(last) + 1, current - CHAPTER_WEEKS_MAX); w < current; w++) weeks.push(w);
    await db.prepare(`INSERT OR IGNORE INTO npc_chapter_weeks (week, active, target, chapters, open, at)
      SELECT value, 0, 0, 0, 'off', ?1 FROM json_each(?2)`).bind(nowS, JSON.stringify(weeks)).run();
    return 0;
  }
  const from = Math.max(last == null ? current - 1 : Number(last) + 1, current - CHAPTER_WEEKS_MAX);
  let n = 0;
  for (let w = from; w < current; w++) {
    const r = await settleChapterWeek(db, w, nowS, zero, sw);
    if (!r.settled) break;
    n++;
  }
  if (from + n >= current) keepWeekSettled(db, `chapters:${sw}`, current);
  return n;
}

export const seasonNumberAt = (/** @type {number} */ nowS, /** @type {number | null} */ zero) => seasonOf(meritWeekOf(nowS), zero)?.n ?? null;

function eventView(/** @type {any} */ r, /** @type {number | null} */ n, /** @type {(f: number) => boolean} */ named) {
  if (n == null) return null;
  const e = heldEvent(r);
  const event = e.eventSeason === n ? e.event : null;
  const shut = e.shut === n;
  const doctrine = e.doctrineSeason === n ? e.doctrine : null;
  if (!event && !shut && !doctrine) return null;
  const rival = event === 'rivalry' && Number.isSafeInteger(e.data.rival) && named(e.data.rival) ? e.data.rival : null;
  return {
    event, ...(rival !== null ? { rival } : {}), ...(shut ? { shut: true } : {}), ...(doctrine ? { doctrine } : {}),
    ...(event === 'schism' || event === 'succession' ? { season: n } : {}),
    ...(event === 'schism' ? { sides: schismDoctrinesOf(n, Number(r.faction), Number(r.region)) } : {}),
    ...(event === 'succession' && Number.isSafeInteger(e.data.heir) ? { heir: e.data.heir } : {}),
  };
}

/** @param {any} db @param {number} region @param {number | null} n @param {(f: number) => boolean} [named] */
export async function regionEvents(db, region, n, named = (f) => !hallHidden(f)) {
  /** @type {Map<number, { event: string | null, rival?: number, shut?: boolean }>} */
  const out = new Map();
  if (n == null) return out;
  const { results = [] } = await db.prepare('SELECT faction, region, event, event_season, event_data, shut_season, doctrine, doctrine_season FROM npc_chapters WHERE region = ?1').bind(region).all();
  for (const r of results) {
    const v = eventView(r, n, named);
    if (v) out.set(Number(r.faction), v);
  }
  return out;
}

export async function regionBackings(/** @type {any} */ db, /** @type {number} */ region, /** @type {number | null} */ n, /** @type {string} */ account) {
  if (n == null) return new Map();
  const { results = [] } = await db.prepare('SELECT faction, side FROM npc_chapter_backing WHERE region = ?1 AND season = ?2 AND account = ?3').bind(region, n, account).all();
  return new Map(results.map((/** @type {any} */ r) => [Number(r.faction), Number(r.side)]));
}

/** @param {{ db: any, nowS: number }} ctx @param {{ id: string }} player @param {any} env @param {any} body */
export async function backChapter({ db, nowS }, player, env, { character, faction, region, side } = {}) {
  if (typeof character !== 'string' || !REALM_ID_RE.test(character) || !Number.isSafeInteger(faction) || !regionOk(region) || !Number.isSafeInteger(side)) return { error: 'body' };
  const zero = seasonZeroOf(env?.SEASON_ZERO_WEEK);
  await settleChaptersDue(db, nowS, zero, env?.CHAPTERS_OPEN);
  const week = meritWeekOf(nowS);
  const season = seasonOf(week, zero);
  if (!season) return { error: 'no-event' };
  // A stranger asking about a hidden guild's chapter gets no-event, so refusals never reveal where
  // its halls are.
  if (hallHidden(faction) && !(await db.prepare('SELECT 1 FROM npc_roll WHERE char_id = ?1 AND player = ?2 AND faction_id = ?3 AND member = 1 AND dormant = 0')
    .bind(character, player.id, faction).first())) return { error: 'no-event' };
  const row = await db.prepare('SELECT event, event_season, event_data FROM npc_chapters WHERE faction = ?1 AND region = ?2').bind(faction, region).first();
  const e = row ? heldEvent(row) : null;
  const event = e && e.eventSeason === season.n ? e.event : null;
  if (!e || (event !== 'schism' && event !== 'succession')) return { error: 'no-event' };
  if (!chapterBackOk(event, side)) return { error: 'no-side' };
  if (event === 'succession' && (Number.isSafeInteger(e.data.heir) || week >= season.start + SUCCESSION_TURNING)) return { error: 'closed' };
  const r = await db.prepare(`INSERT INTO npc_chapter_backing (faction, region, season, account, char_id, side, at)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
    WHERE EXISTS (SELECT 1 FROM npc_roll WHERE char_id = ?5 AND player = ?4 AND faction_id = ?1 AND member = 1 AND dormant = 0)
      AND EXISTS (SELECT 1 FROM realm_characters WHERE id = ?5 AND player = ?4 AND dead_at IS NULL)
      AND EXISTS (SELECT 1 FROM npc_chapters WHERE faction = ?1 AND region = ?2 AND event = ?8 AND event_season = ?3)
    ON CONFLICT (faction, region, season, account) DO UPDATE SET char_id = excluded.char_id, side = excluded.side, at = excluded.at`)
    .bind(faction, region, season.n, player.id, character, side, nowS, event).run();
  return Number(r?.meta?.changes ?? 0) > 0 ? { ok: true, event, side } : { error: 'not-member' };
}

export async function regionStrengths(/** @type {any} */ db, /** @type {number} */ region, /** @type {number[]} */ factions) {
  const out = new Map(factions.map((f) => [f, STRENGTH_START]));
  if (!factions.length) return out;
  const { results = [] } = await db.prepare('SELECT faction, strength FROM npc_chapters WHERE region = ?1').bind(region).all();
  for (const r of results) if (out.has(Number(r.faction))) out.set(Number(r.faction), Number(r.strength));
  return out;
}

/** @param {{ db: any, nowS: number }} ctx @param {any} player @param {any} env */
export async function chapterSheet({ db, nowS }, player, env) {
  if (!chaptersOpenFor(player, env)) return { error: 'chapters-closed' };
  await settleChaptersDue(db, nowS, seasonZeroOf(env?.SEASON_ZERO_WEEK), env?.CHAPTERS_OPEN);
  const n = seasonNumberAt(nowS, seasonZeroOf(env?.SEASON_ZERO_WEEK));
  const patronQ = patronsRead(db, null, n);
  const [hallRows, chapterRows, seatQ, patronRows] = await db.batch([
    hallRowsRead(db),
    db.prepare('SELECT faction, region, strength, event, event_season, event_data, shut_season, doctrine, doctrine_season FROM npc_chapters'),
    db.prepare(`SELECT s.faction, s.region, s.seat, c.name FROM npc_chapter_seats s
    JOIN realm_characters c ON c.id = s.char_id ORDER BY s.seat = 'master' DESC, s.since, s.char_id`),
    ...(patronQ ? [patronQ] : []),
  ]);
  const chapters = (await allChapters(db, nowS, hallRows?.results ?? [])).filter((c) => !hallHidden(c.faction));
  const results = chapterRows?.results ?? [];
  const held = new Map(results.map((/** @type {any} */ r) => [`${r.faction}|${r.region}`, Number(r.strength)]));
  const events = new Map(results.map((/** @type {any} */ r) => [`${r.faction}|${r.region}`, eventView(r, n, (f) => !hallHidden(f))]));
  const patrons = patronsFrom(patronRows?.results ?? []);
  const seatRows = seatQ?.results ?? [];
  /** @type {Map<string, { seat: string, name: string }[]>} */
  const seats = new Map();
  for (const r of seatRows) {
    const k = `${r.faction}|${r.region}`;
    if (!seats.has(k)) seats.set(k, []);
    seats.get(k)?.push({ seat: String(r.seat), name: String(r.name) });
  }
  return {
    week: meritWeekOf(nowS),
    chapters: chapters.map((c) => {
      const strength = held.get(`${c.faction}|${c.region}`) ?? STRENGTH_START;
      const patron = patrons.get(`${c.faction}|${c.region}`);
      return { f: c.faction, region: c.region, strength, band: chapterBandOf(strength).band, seats: seats.get(`${c.faction}|${c.region}`) ?? [], ...events.get(`${c.faction}|${c.region}`),
        ...(patron ? { patron } : {}) };
    }),
  };
}

/** @param {{ db: any, nowS: number }} ctx @param {{ id: string }} player @param {any} env @param {any} body */
export async function setChapterFocus({ db, nowS }, player, env, { character, faction, region, focus } = {}) {
  if (typeof character !== 'string' || !REALM_ID_RE.test(character) || !Number.isSafeInteger(faction) || !regionOk(region)) return { error: 'body' };
  if (!chapterFocusOk(faction, focus)) return { error: 'no-focus' };
  await settleChaptersDue(db, nowS, seasonZeroOf(env?.SEASON_ZERO_WEEK), env?.CHAPTERS_OPEN);
  const week = meritWeekOf(nowS);
  const r = await db.prepare(`UPDATE npc_chapters SET focus = ?1, focus_week = ?2 WHERE faction = ?3 AND region = ?4
    AND EXISTS (SELECT 1 FROM npc_chapter_seats s JOIN realm_characters c ON c.id = s.char_id AND c.player = ?6 AND c.dead_at IS NULL
      WHERE s.faction = ?3 AND s.region = ?4 AND s.char_id = ?5 AND s.seat = 'master' AND s.week = ?7)`).bind(focus, week, faction, region, character, player.id, week - 1).run();
  return Number(r?.meta?.changes ?? 0) > 0 ? { ok: true, focus, week } : { error: 'not-master' };
}

export async function regionFocuses(/** @type {any} */ db, /** @type {number} */ region, /** @type {number} */ week) {
  const { results = [] } = await db.prepare('SELECT faction, focus FROM npc_chapters WHERE region = ?1 AND focus_week = ?2 AND focus IS NOT NULL').bind(region, week).all();
  return new Map(results.filter((/** @type {any} */ r) => chapterFocusOk(Number(r.faction), r.focus)).map((/** @type {any} */ r) => [Number(r.faction), String(r.focus)]));
}

export async function masterSeatsIn(/** @type {any} */ db, /** @type {unknown} */ character, /** @type {number} */ region, /** @type {number} */ week) {
  if (typeof character !== 'string') return new Set();
  const { results = [] } = await db.prepare("SELECT faction FROM npc_chapter_seats WHERE char_id = ?1 AND region = ?2 AND seat = 'master' AND week = ?3").bind(character, region, week - 1).all();
  return new Set(results.map((/** @type {any} */ r) => Number(r.faction)));
}

export const CHAPTER_CHRONICLE_ROWS = 60;
/** @param {{ db: any }} ctx @param {any} _player @param {any} env @param {any} body */
export async function chapterChronicle({ db }, _player, env, { region } = {}) {
  if (!regionOk(region)) return { error: 'body' };
  // Hidden guilds are filtered before the newest rows are counted, so they neither shorten the book
  // nor show in its count.
  const { results = [] } = await db.prepare(`SELECT h.faction, h.week, h.kind, h.data, c.name FROM npc_chapter_history h
    LEFT JOIN realm_characters c ON c.id = h.char_id WHERE h.region = ?1 AND h.faction NOT IN (SELECT value FROM json_each(?3))
    ORDER BY h.seq DESC LIMIT ?2`).bind(region, CHAPTER_CHRONICLE_ROWS, JSON.stringify(HIDDEN_HALL_FACTIONS)).all();
  const rows = results.reverse().map((/** @type {any} */ r) => {
    /** @type {any} */
    let data = {};
    try { data = JSON.parse(r.data); } catch { }
    if (data && typeof data === 'object' && hallHidden(data.rival)) { data = { ...data }; delete data.rival; }
    return { faction: Number(r.faction), week: Number(r.week), kind: String(r.kind), data, name: r.name ?? null };
  });
  return { rows, zero: seasonZeroOf(env?.SEASON_ZERO_WEEK) };
}
