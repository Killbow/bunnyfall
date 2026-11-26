// @ts-check
// Each act's first write checks every condition against the current rows, and the statements after it move
// Marks or goods only where that write landed.
import { accountKind, displayName, mintId, overRate } from './accounts.js';
import { guildActorOf } from './guilds.js';
import { titheCapAt } from './seatForts.js';
import { marketHallTitheCap } from '../../src/net/fortLaw.js';
import { confirmedSeats, seatsOpenFor } from './townSeats.js';
import { MARKS_MAX, utcDay } from '../../src/net/marksLaw.js';
import {
  seatWeekOf, seatWeekStartMs, SEAT_WEEK_MS, seatKeyOk, seatRegionOk, edictOk, edictForTier, edictMayFollow, bailiwickOf, bountySitePixel, overreachOf, seatUpkeep,
  SEAT_LEVER_RANKS, SEAT_EDICTS_HOUR, BOUNTY_MARKS, BOUNTY_CAMPS_DAY, CROWN_SCALE, TITHE_CAP,
} from '../../src/net/townSeatLaw.js';

const weekAt = (nowS) => seatWeekOf(nowS * 1000);
const LEVERS_SQL = SEAT_LEVER_RANKS.join(', ');
export const BOUNTY_SET_ASIDE_MAX = 100_000;

// Only the last play beat counts, so a late settle counts low, and the scale's 0.4 floor covers that.
export async function activeIn(db, week) {
  const from = Math.floor(seatWeekStartMs(week) / 1000), to = Math.floor((seatWeekStartMs(week) + SEAT_WEEK_MS) / 1000);
  const r = await db.prepare('SELECT COUNT(*) AS n FROM players WHERE handle IS NOT NULL AND played_at >= ? AND played_at < ?').bind(from, to).first();
  return Number(r?.n ?? 0);
}

async function leverOf(db, player, env, character, key) {
  if (accountKind(player) !== 'linked') return { error: 'seats-need-account' };
  if (!seatsOpenFor(player, env)) return { error: 'seats-closed' };
  if (!seatKeyOk(key)) return { error: 'bad-seat' };
  const a = await guildActorOf(db, player, character);
  if ('error' in a) return a;
  if (!SEAT_LEVER_RANKS.includes(Number(a.me.rank))) return { error: 'guild-rank' };
  const hold = await db.prepare('SELECT key, guild_id, tier, region, tithe, tithe_week FROM town_seat_holds WHERE key = ?').bind(key).first();
  if (!hold || hold.guild_id !== a.me.guild_id) return { error: 'seat-not-held' };
  return { me: a.me, hold };
}
const stillSql = (rid, g) => `EXISTS (SELECT 1 FROM guild_members WHERE rowid = ${Number(rid)} AND guild_id = ${g} AND rank IN (${LEVERS_SQL}))`;

/** @param {{db: any, nowS: number}} ctx */
export async function setTithe({ db, nowS }, player, env, { character, key, pct } = {}) {
  const l = await leverOf(db, player, env, character, key);
  if ('error' in l) return l;
  const cap = await titheCapAt(db, key, l.hold.tier, nowS);
  if (!Number.isSafeInteger(pct) || pct < 0 || pct > cap) return { error: 'bad-tithe' };
  const week = weekAt(nowS);
  if (l.hold.tithe_week != null && Number(l.hold.tithe_week) === week) return { error: 'tithe-this-week' };
  if (await overRate({ db, nowS }, `seat-lever:${player.id}`, SEAT_EDICTS_HOUR, 3600)) return { error: 'seats-rate' };
  const r = await db.prepare(`UPDATE town_seat_holds SET tithe = ?1, tithe_week = ?2
    WHERE key = ?3 AND guild_id = ?4 AND (tithe_week IS NULL OR tithe_week <> ?2)
      AND ?1 <= ?5 AND ${stillSql(l.me.rid, '?4')}`)
    .bind(pct, week, key, l.hold.guild_id, cap).run();
  if (!r?.meta?.changes) return { error: 'tithe-this-week' };
  return { ok: true, tithe: pct };
}

/** @param {{db: any, nowS: number}} ctx */
export async function proclaimEdict({ db, nowS }, player, env, { character, key, edict = null, setAside = 0 } = {}) {
  const l = await leverOf(db, player, env, character, key);
  if ('error' in l) return l;
  const week = weekAt(nowS), next = week + 1;
  if (await overRate({ db, nowS }, `seat-lever:${player.id}`, SEAT_EDICTS_HOUR, 3600)) return { error: 'seats-rate' };
  if (edict === null) {
    const r = await db.prepare(`DELETE FROM town_seat_edicts WHERE key = ?1 AND week = ?2 AND guild_id = ?3 AND state = 'proclaimed' AND ${stillSql(l.me.rid, '?3')}`)
      .bind(key, next, l.hold.guild_id).run();
    return r?.meta?.changes ? { ok: true, next: null } : { error: 'seat-no-edict' };
  }
  if (!edictOk(edict)) return { error: 'bad-edict' };
  if (!edictForTier(edict, l.hold.tier)) return { error: 'edict-tier' };
  const aside = edict === 'bounty' ? setAside : 0;
  if (edict === 'bounty' && (!Number.isSafeInteger(aside) || aside < BOUNTY_MARKS || aside > BOUNTY_SET_ASIDE_MAX)) return { error: 'bad-bounty' };
  const now = await db.prepare("SELECT edict FROM town_seat_edicts WHERE key = ? AND week = ? AND state = 'law'").bind(key, week).first();
  if (!edictMayFollow(edict, now?.edict ?? null)) return { error: 'edict-twice' };
  const r = await db.prepare(`INSERT INTO town_seat_edicts (key, week, edict, guild_id, set_by, set_aside, state, at)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, 'proclaimed', ?7 WHERE ${stillSql(l.me.rid, '?4')}
      AND EXISTS (SELECT 1 FROM town_seat_holds WHERE key = ?1 AND guild_id = ?4)
    ON CONFLICT (key, week) DO UPDATE SET edict = excluded.edict, guild_id = excluded.guild_id, set_by = excluded.set_by,
      set_aside = excluded.set_aside, at = excluded.at WHERE town_seat_edicts.state = 'proclaimed'`)
    .bind(key, next, edict, l.hold.guild_id, displayName(player), aside, nowS).run();
  if (!r?.meta?.changes) return { error: 'guild-rank' };
  return { ok: true, next: edict };
}

export async function edictsOf(db, week) {
  return edictsFrom((await edictsRead(db, week).all()).results);
}
export const edictsRead = (/** @type {any} */ db, /** @type {number} */ week) => db.prepare("SELECT key, edict, guild_id, set_aside, spent FROM town_seat_edicts WHERE week = ? AND state = 'law'").bind(week);
export const edictsFrom = (/** @type {any[]} */ results = []) => new Map(results.map((e) => [Number(e.key), { edict: e.edict, guild: e.guild_id, setAside: Number(e.set_aside), spent: Number(e.spent) }]));

export async function holdingOf(db, key, nowS) {
  const h = await db.prepare('SELECT key, guild_id, tier, standing, tithe, tithe_week, owed FROM town_seat_holds WHERE key = ?').bind(key).first();
  if (!h) return null;
  const week = weekAt(nowS);
  const { results: es = [] } = await db.prepare("SELECT week, edict, state FROM town_seat_edicts WHERE key = ? AND week IN (?, ?) AND state IN ('law', 'proclaimed')")
    .bind(key, week, week + 1).all();
  const { results: tiers = [] } = await db.prepare('SELECT tier FROM town_seat_holds WHERE guild_id = ?').bind(h.guild_id).all();
  const active = h.tier === 'crown' ? await activeIn(db, week) : CROWN_SCALE.per;
  return {
    standing: Number(h.standing), tithe: Number(h.tithe), titheWeek: h.tithe_week == null ? null : Number(h.tithe_week),
    edict: es.find((e) => Number(e.week) === week && e.state === 'law')?.edict ?? null,
    next: es.find((e) => Number(e.week) === week + 1 && e.state === 'proclaimed')?.edict ?? null,
    upkeep: seatUpkeep(h.tier, overreachOf(tiers.map((t) => t.tier)), active), owed: Number(h.owed),
  };
}

export async function titheAt(db, nowS, region, pixel = null) {
  if (!seatRegionOk(region)) return null;
  const { results: held = [] } = await db.prepare(`SELECT h.key, h.guild_id, h.tithe, h.tier,
    (SELECT f.tier FROM town_seat_forts f WHERE f.key = h.key AND f.work = 'market') AS market FROM town_seat_holds h WHERE h.region = ?`).bind(region).all();
  if (!held.length) return null;
  const seat = bailiwickOf((await confirmedSeats(db, nowS)).values(), region, pixel);
  const h = seat ? held.find((x) => Number(x.key) === seat.key) : null;
  return h ? { key: seat.key, guild: h.guild_id, pct: Math.min(Number(h.tithe), marketHallTitheCap(TITHE_CAP[h.tier] ?? 0, Number(h.market ?? 0))) } : null;
}

export async function levyAt(db, nowS, region, pixel) {
  if (!seatRegionOk(region) || !pixel) return null;
  const { results = [] } = await db.prepare("SELECT key FROM town_seat_edicts WHERE week = ? AND state = 'law' AND edict = 'levy'").bind(weekAt(nowS)).all();
  if (!results.length) return null;
  const seat = bailiwickOf((await confirmedSeats(db, nowS)).values(), region, pixel);
  return seat && results.some((e) => Number(e.key) === seat.key) ? seat.key : null;
}

export const openGatesRead = (db, nowS, mapId) => db.prepare("SELECT 1 FROM town_seat_edicts WHERE key = ? AND week = ? AND state = 'law' AND edict = 'open-gates'")
  .bind(mapId, weekAt(nowS));

/** @param {{db: any, nowS: number, rand: (b: Uint8Array) => any}} ctx */
export async function claimBounty({ db, nowS, rand }, player, env, { character, site, region } = {}) {
  if (accountKind(player) !== 'linked') return { error: 'seats-need-account' };
  if (!seatsOpenFor(player, env)) return { error: 'seats-closed' };
  if (typeof character !== 'string' || !character) return { error: 'bad-bounty' };
  const pixel = bountySitePixel(site);
  if (!pixel || !seatRegionOk(region)) return { error: 'bad-bounty' };
  const week = weekAt(nowS), day = utcDay(nowS);
  const { results: rules = [] } = await db.prepare("SELECT key FROM town_seat_edicts WHERE week = ? AND state = 'law' AND edict = 'bounty'").bind(week).all();
  if (!rules.length) return { ok: true, paid: 0, why: 'no-bounty' };
  const seat = bailiwickOf((await confirmedSeats(db, nowS)).values(), region, pixel);
  if (!seat || !rules.some((e) => Number(e.key) === seat.key)) return { ok: true, paid: 0, why: 'no-bounty' };
  if (await overRate({ db, nowS }, `seat-bounty:${player.id}`, BOUNTY_CAMPS_DAY * 4, 3600)) return { error: 'seats-rate' };
  const n = mintId(rand);
  const escrow = `bounty:${seat.key}:${week}`;
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO town_seat_bounties (day, site, account, key, week, at, n)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
      WHERE (SELECT COUNT(*) FROM town_seat_bounties WHERE account = ?3 AND day = ?1) < ?8
        AND EXISTS (SELECT 1 FROM town_seat_edicts WHERE key = ?4 AND week = ?5 AND state = 'law' AND edict = 'bounty' AND spent + ?9 <= set_aside)
        AND COALESCE((SELECT balance FROM marks WHERE account = ?3), 0) + ?9 <= ?10`)
      .bind(day, site, player.id, seat.key, week, nowS, n, BOUNTY_CAMPS_DAY, BOUNTY_MARKS, MARKS_MAX),
    db.prepare(`UPDATE town_seat_edicts SET spent = spent + ?3 WHERE key = ?1 AND week = ?2
      AND EXISTS (SELECT 1 FROM town_seat_bounties WHERE day = ?4 AND site = ?5 AND n = ?6)`).bind(seat.key, week, BOUNTY_MARKS, day, site, n),
    db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'escrow', ?1, 'account', account, 'bounty', ?2, day, at, account, ?3, 'bounty:' || day || ':' || site
      FROM town_seat_bounties WHERE day = ?4 AND site = ?5 AND n = ?6`).bind(escrow, BOUNTY_MARKS, character, day, site, n),
  ]);
  const row = await db.prepare('SELECT account, n FROM town_seat_bounties WHERE day = ? AND site = ?').bind(day, site).first();
  if (row?.n === n) return { ok: true, paid: BOUNTY_MARKS, key: seat.key };
  if (row) return { ok: true, paid: 0, why: row.account === player.id ? 'repeat' : 'claimed' };
  const today = await db.prepare('SELECT COUNT(*) AS c FROM town_seat_bounties WHERE account = ? AND day = ?').bind(player.id, day).first();
  if (Number(today?.c ?? 0) >= BOUNTY_CAMPS_DAY) return { ok: true, paid: 0, why: 'day-full' };
  const e = await db.prepare('SELECT set_aside, spent FROM town_seat_edicts WHERE key = ? AND week = ?').bind(seat.key, week).first();
  if (e && Number(e.spent) + BOUNTY_MARKS > Number(e.set_aside)) return { ok: true, paid: 0, why: 'spent' };
  return { error: 'marks-full' };
}
