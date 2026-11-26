// @ts-check
// Each act's first write asks every condition against the rows as they stand, and what follows moves only where
// that write landed.
import { accountKind, displayName, overRate } from './accounts.js';
import { guildActorOf } from './guilds.js';
import { seatsOpenFor } from './townSeats.js';
import { mustChange } from './realm.js';
import { utcDay } from '../../src/net/marksLaw.js';
import { GUILD_RANK_MASTER } from '../../src/net/guildLaw.js';
import {
  seatWeekOf, seatWeekStartMs, seatPhaseOf, seatKeyOk, siegeWindowOk, SEAT_LEVER_RANKS, SEAT_EDICTS_HOUR, SEAT_MEMBER_WAIT_S,
  SIEGE_SIDE_MAX, SELLSWORDS_MAX, SIGN_CLOSES_MS, SELLSWORD_COOL_WEEKS, sellswordFeeOk, sideOf,
} from '../../src/net/townSeatLaw.js';

const weekAt = (nowS) => seatWeekOf(nowS * 1000);
const LEVERS_SQL = SEAT_LEVER_RANKS.join(', ');
export const BLACKOUT_LEAD_S = 30 * 60;

const seatOpen = (player, env) => (accountKind(player) !== 'linked' ? { error: 'seats-need-account' } : !seatsOpenFor(player, env) ? { error: 'seats-closed' } : null);

/** @param {{db: any, nowS: number}} ctx */
export async function setWindow({ db, nowS }, player, env, { character, key, day, hour } = {}) {
  const closed = seatOpen(player, env);
  if (closed) return closed;
  if (!seatKeyOk(key)) return { error: 'bad-seat' };
  if (!siegeWindowOk(day, hour)) return { error: 'bad-window' };
  const a = await guildActorOf(db, player, character);
  if ('error' in a) return a;
  if (!SEAT_LEVER_RANKS.includes(Number(a.me.rank))) return { error: 'guild-rank' };
  // The window locks outside the Muster, so the window the Turning freezes is the one challengers saw all through
  // it.
  if (seatPhaseOf(nowS * 1000) !== 'muster') return { error: 'window-reckoning' };
  if (await overRate({ db, nowS }, `seat-window:${player.id}`, SEAT_EDICTS_HOUR, 3600)) return { error: 'seats-rate' };
  const r = await db.prepare(`INSERT INTO town_seat_windows (key, guild_id, day, hour, set_by, at)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE EXISTS (SELECT 1 FROM town_seat_holds WHERE key = ?1 AND guild_id = ?2)
      AND EXISTS (SELECT 1 FROM guild_members WHERE rowid = ?7 AND guild_id = ?2 AND rank IN (${LEVERS_SQL}))
    ON CONFLICT (key) DO UPDATE SET guild_id = excluded.guild_id, day = excluded.day, hour = excluded.hour, set_by = excluded.set_by, at = excluded.at`)
    .bind(key, a.me.guild_id, day, hour, displayName(player), nowS, Number(a.me.rid)).run();
  if (!r?.meta?.changes) return { error: 'seat-not-held' };
  return { ok: true, window: { day, hour } };
}

export async function windowOf(db, key, guildId) {
  const w = await db.prepare('SELECT day, hour FROM town_seat_windows WHERE key = ? AND guild_id = ?').bind(key, guildId).first();
  return w ? { day: Number(w.day), hour: Number(w.hour) } : null;
}

async function battleAt(db, week, key) {
  const b = await db.prepare('SELECT * FROM town_seat_battles WHERE week = ? AND key = ?').bind(week, key).first();
  return b ? { ...b, starts_at: Number(b.starts_at), ends_at: Number(b.ends_at), week: Number(b.week), key: Number(b.key) } : null;
}
const roomSql = (w, k, s) => `(SELECT COUNT(*) FROM town_seat_rosters WHERE week = ${w} AND key = ${k} AND side = ${s})
  < CASE (SELECT tier FROM town_seat_battles WHERE week = ${w} AND key = ${k}) WHEN 'crown' THEN ${SIEGE_SIDE_MAX.crown} ELSE ${SIEGE_SIDE_MAX.palace} END`;
const swordsRoomSql = (w, k, s) => `(SELECT COUNT(*) FROM town_seat_rosters WHERE week = ${w} AND key = ${k} AND side = ${s} AND sellsword = 1)
  < CASE (SELECT tier FROM town_seat_battles WHERE week = ${w} AND key = ${k}) WHEN 'crown' THEN ${SELLSWORDS_MAX.crown} ELSE ${SELLSWORDS_MAX.palace} END`;
const openSql = (w, k, now) => `${now} < (SELECT starts_at FROM town_seat_battles WHERE week = ${w} AND key = ${k} AND state = 'scheduled') - ${SIGN_CLOSES_MS / 1000}`;

/** @param {{db: any, nowS: number}} ctx */
export async function signBattle({ db, nowS }, player, env, { character, key } = {}) {
  const closed = seatOpen(player, env);
  if (closed) return closed;
  if (!seatKeyOk(key)) return { error: 'bad-seat' };
  if (typeof character !== 'string' || !character) return { error: 'guild-character' };
  const week = weekAt(nowS);
  const b = await battleAt(db, week, key);
  if (!b || b.state !== 'scheduled') return { error: 'battle-none' };
  if (nowS >= b.starts_at - SIGN_CLOSES_MS / 1000) return { error: 'sign-closed' };
  if (await db.prepare('SELECT 1 FROM town_seat_rosters WHERE week = ? AND key = ? AND account = ?').bind(week, key, player.id).first()) return { error: 'sign-twice' };
  if (await overRate({ db, nowS }, `seat-sign:${player.id}`, SEAT_EDICTS_HOUR, 3600)) return { error: 'seats-rate' };
  const bound = (await db.prepare('SELECT guild_id FROM town_seat_binds WHERE week = ? AND account = ?').bind(week, player.id).first())?.guild_id ?? null;
  const me = await db.prepare('SELECT guild_id, joined_at FROM guild_members WHERE player = ? AND char_id = ?').bind(player.id, character).first();
  const side = me ? sideOf({ attacker: b.attacker, defender: b.defender }, me.guild_id) : null;
  if (side) {
    const turningS = Math.floor(seatWeekStartMs(week) / 1000);
    if (Number(me.joined_at) > turningS - SEAT_MEMBER_WAIT_S) return { error: 'sign-new-member' };
    const then = (await db.prepare('SELECT guild_id FROM town_seat_binds WHERE week = ? AND account = ?').bind(week - 1, player.id).first())?.guild_id ?? null;
    if (then !== me.guild_id && b.kind !== 'revolt') return { error: 'sign-unbound' };
    if (bound != null && bound !== me.guild_id) return { error: 'sign-bound-elsewhere' };
    const r = await db.prepare(`INSERT INTO town_seat_rosters (week, key, account, char_id, guild_id, side, sellsword, fee, at)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, 0, 0, ?7
      WHERE ${openSql('?1', '?2', '?7')} AND ${roomSql('?1', '?2', '?6')}
        AND EXISTS (SELECT 1 FROM guild_members WHERE player = ?3 AND char_id = ?4 AND guild_id = ?5 AND joined_at <= ?8)
        AND COALESCE((SELECT guild_id FROM town_seat_binds WHERE week = ?1 AND account = ?3), ?5) = ?5
      ON CONFLICT DO NOTHING`).bind(week, key, player.id, character, me.guild_id, side, nowS, turningS - SEAT_MEMBER_WAIT_S).run();
    if (!r?.meta?.changes) return { error: nowS >= b.starts_at - SIGN_CLOSES_MS / 1000 ? 'sign-closed' : 'side-full' };
    await db.prepare('INSERT OR IGNORE INTO town_seat_binds (week, account, guild_id, char_id, at) VALUES (?, ?, ?, ?, ?)').bind(week, player.id, me.guild_id, character, nowS).run();
    return { ok: true, side, sellsword: false };
  }
  const hire = await db.prepare("SELECT guild_id, fee FROM town_seat_hires WHERE week = ? AND key = ? AND account = ? AND state = 'offered'").bind(week, key, player.id).first();
  if (!hire) return { error: 'battle-not-side' };
  const swordSide = sideOf({ attacker: b.attacker, defender: b.defender }, hire.guild_id);
  if (!swordSide) return { error: 'battle-not-side' };
  if (await db.prepare('SELECT 1 FROM guild_members WHERE player = ? AND guild_id IN (?, ?)').bind(player.id, b.attacker, b.defender).first()) return { error: 'sellsword-member' };
  if (bound != null && bound !== hire.guild_id) return { error: 'sign-bound-elsewhere' };
  const other = swordSide === 'attack' ? b.defender : b.attacker;
  if (await db.prepare('SELECT 1 FROM town_seat_rosters WHERE account = ? AND guild_id = ? AND week >= ? AND week < ?').bind(player.id, other, week - SELLSWORD_COOL_WEEKS, week).first()) return { error: 'sellsword-cooling' };
  const [r] = await db.batch([
    db.prepare(`INSERT INTO town_seat_rosters (week, key, account, char_id, guild_id, side, sellsword, fee, at)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, 1, h.fee, ?7 FROM town_seat_hires h
      WHERE h.week = ?1 AND h.key = ?2 AND h.account = ?3 AND h.guild_id = ?5 AND h.state = 'offered'
        AND ${openSql('?1', '?2', '?7')} AND ${roomSql('?1', '?2', '?6')} AND ${swordsRoomSql('?1', '?2', '?6')}
        AND NOT EXISTS (SELECT 1 FROM guild_members WHERE player = ?3 AND guild_id IN (?8, ?9))
        AND COALESCE((SELECT guild_id FROM town_seat_binds WHERE week = ?1 AND account = ?3), ?5) = ?5
      ON CONFLICT DO NOTHING`).bind(week, key, player.id, character, hire.guild_id, swordSide, nowS, b.attacker, b.defender),
    db.prepare("UPDATE town_seat_hires SET state = 'signed' WHERE week = ? AND key = ? AND account = ? AND state = 'offered' AND changes() > 0").bind(week, key, player.id),
  ]);
  if (!r?.meta?.changes) return { error: nowS >= b.starts_at - SIGN_CLOSES_MS / 1000 ? 'sign-closed' : 'sellswords-full' };
  await db.prepare('INSERT OR IGNORE INTO town_seat_binds (week, account, guild_id, char_id, at) VALUES (?, ?, ?, ?, ?)').bind(week, player.id, hire.guild_id, character, nowS).run();
  return { ok: true, side: swordSide, sellsword: true, fee: Number(hire.fee) };
}

/** @param {{db: any, nowS: number}} ctx */
export async function unsignBattle({ db, nowS }, player, env, { key } = {}) {
  const closed = seatOpen(player, env);
  if (closed) return closed;
  if (!seatKeyOk(key)) return { error: 'bad-seat' };
  const week = weekAt(nowS);
  const [r] = await db.batch([
    db.prepare(`DELETE FROM town_seat_rosters WHERE week = ?1 AND key = ?2 AND account = ?3 AND ${openSql('?1', '?2', '?4')}`).bind(week, key, player.id, nowS),
    db.prepare("UPDATE town_seat_hires SET state = 'offered' WHERE week = ? AND key = ? AND account = ? AND state = 'signed' AND changes() > 0").bind(week, key, player.id),
  ]);
  if (!r?.meta?.changes) return { error: (await battleAt(db, week, key)) ? 'sign-closed' : 'battle-none' };
  return { ok: true };
}

async function sideMasterOf(db, player, env, character, key, nowS) {
  const closed = seatOpen(player, env);
  if (closed) return closed;
  if (!seatKeyOk(key)) return { error: 'bad-seat' };
  const a = await guildActorOf(db, player, character);
  if ('error' in a) return a;
  if (Number(a.me.rank) !== GUILD_RANK_MASTER) return { error: 'guild-rank' };
  const b = await battleAt(db, weekAt(nowS), key);
  if (!b || b.state !== 'scheduled') return { error: 'battle-none' };
  const side = sideOf({ attacker: b.attacker, defender: b.defender }, a.me.guild_id);
  if (!side) return { error: 'battle-not-side' };
  if (nowS >= b.starts_at - SIGN_CLOSES_MS / 1000) return { error: 'sign-closed' };
  return { me: a.me, b, side };
}

/** @param {{db: any, nowS: number}} ctx */
export async function hireSellsword({ db, nowS }, player, env, { character, key, handle, fee = 0 } = {}) {
  const m = await sideMasterOf(db, player, env, character, key, nowS);
  if ('error' in m) return m;
  if (!sellswordFeeOk(fee)) return { error: 'bad-fee' };
  if (typeof handle !== 'string' || !handle) return { error: 'bad-handle' };
  const who = await db.prepare('SELECT id FROM players WHERE handle = ? COLLATE NOCASE').bind(handle).first();
  if (!who) return { error: 'no-such-account' };
  if (who.id === player.id) return { error: 'sellsword-member' };
  if (await db.prepare('SELECT 1 FROM guild_members WHERE player = ? AND guild_id IN (?, ?)').bind(who.id, m.b.attacker, m.b.defender).first()) return { error: 'sellsword-member' };
  const week = m.b.week;
  if (await db.prepare("SELECT 1 FROM town_seat_hires WHERE week = ? AND key = ? AND account = ? AND state <> 'withdrawn'").bind(week, key, who.id).first()) return { error: 'hire-twice' };
  if (await overRate({ db, nowS }, `seat-lever:${player.id}`, SEAT_EDICTS_HOUR, 3600)) return { error: 'seats-rate' };
  const max = SELLSWORDS_MAX[m.b.tier] ?? SELLSWORDS_MAX.palace;
  const stmts = [
    db.prepare(`INSERT INTO town_seat_hires (week, key, account, guild_id, fee, state, by_name, at)
      SELECT ?1, ?2, ?3, ?4, ?5, 'offered', ?6, ?7
      WHERE (SELECT COUNT(*) FROM town_seat_hires WHERE week = ?1 AND key = ?2 AND guild_id = ?4 AND state IN ('offered', 'signed')) < ${max}
        AND EXISTS (SELECT 1 FROM guild_members WHERE rowid = ?8 AND guild_id = ?4 AND rank = ${GUILD_RANK_MASTER})
        AND ${openSql('?1', '?2', '?7')}
      ON CONFLICT (week, key, account) DO UPDATE SET guild_id = excluded.guild_id, fee = excluded.fee, state = 'offered', by_name = excluded.by_name, at = excluded.at
        WHERE town_seat_hires.state = 'withdrawn'`)
      .bind(week, key, who.id, m.me.guild_id, fee, displayName(player), nowS, Number(m.me.rid)),
    mustChange(db),
  ];
  if (fee > 0) {
    stmts.push(db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'guild', ?1, 'escrow', ?2, 'sellsword-escrow', ?3, ?4, ?5, ?6, 'A Sellsword', ?2
      WHERE COALESCE((SELECT balance FROM guild_marks WHERE guild_id = ?1), 0) >= ?3`)
      .bind(m.me.guild_id, `hire:${week}:${key}:${who.id}:${nowS}`, fee, utcDay(nowS), nowS, player.id), mustChange(db));
  }
  try { await db.batch(stmts); } catch { return { error: fee > 0 ? 'guild-marks-short' : 'sellswords-full' }; }
  return { ok: true, fee };
}

/** @param {{db: any, nowS: number}} ctx */
export async function withdrawHire({ db, nowS }, player, env, { character, key, handle } = {}) {
  const m = await sideMasterOf(db, player, env, character, key, nowS);
  if ('error' in m) return m;
  const who = typeof handle === 'string' ? await db.prepare('SELECT id FROM players WHERE handle = ? COLLATE NOCASE').bind(handle).first() : null;
  if (!who) return { error: 'no-such-account' };
  const h = await db.prepare("SELECT fee, at FROM town_seat_hires WHERE week = ? AND key = ? AND account = ? AND guild_id = ? AND state = 'offered'").bind(m.b.week, key, who.id, m.me.guild_id).first();
  if (!h) return { error: 'hire-none' };
  const stmts = [
    db.prepare("UPDATE town_seat_hires SET state = 'withdrawn' WHERE week = ? AND key = ? AND account = ? AND guild_id = ? AND state = 'offered'").bind(m.b.week, key, who.id, m.me.guild_id),
    mustChange(db),
  ];
  if (Number(h.fee) > 0) {
    stmts.push(db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      VALUES ('escrow', ?1, 'guild', ?2, 'sellsword-return', ?3, ?4, ?5, ?6, 'A Sellsword', ?1 || ':return')`)
      .bind(`hire:${m.b.week}:${key}:${who.id}:${Number(h.at)}`, m.me.guild_id, Number(h.fee), utcDay(nowS), nowS, player.id));
  }
  try { await db.batch(stmts); } catch { return { error: 'hire-none' }; }
  return { ok: true };
}

export async function fightOf(db, key, player, character, nowS) {
  const week = weekAt(nowS);
  const b = await battleAt(db, week, key);
  const hold = await db.prepare('SELECT guild_id FROM town_seat_holds WHERE key = ?').bind(key).first();
  const window = hold ? await windowOf(db, key, hold.guild_id) : null;
  if (!b) return window ? { window } : null;
  const { results: gs = [] } = await db.prepare('SELECT id, name, tag FROM guilds WHERE id IN (?, ?)').bind(b.attacker, b.defender).all();
  const g = new Map(gs.map((x) => [x.id, { id: x.id, name: x.name, tag: x.tag }]));
  const { results: rows = [] } = await db.prepare('SELECT side, sellsword, COUNT(*) AS n FROM town_seat_rosters WHERE week = ? AND key = ? GROUP BY side, sellsword').bind(week, key).all();
  const sides = { attack: { n: 0, swords: 0 }, defend: { n: 0, swords: 0 } };
  for (const r of rows) { const s = sides[r.side]; if (!s) continue; s.n += Number(r.n); if (Number(r.sellsword)) s.swords += Number(r.n); }
  const out = {
    week, key, kind: b.kind, tier: b.tier, startsAt: b.starts_at, endsAt: b.ends_at, moved: !!b.moved, state: b.state,
    attackerGuild: g.get(b.attacker) ?? { id: b.attacker, name: '', tag: '' }, defenderGuild: g.get(b.defender) ?? { id: b.defender, name: '', tag: '' },
    sides, max: SIEGE_SIDE_MAX[b.tier] ?? SIEGE_SIDE_MAX.palace, swordsMax: SELLSWORDS_MAX[b.tier] ?? SELLSWORDS_MAX.palace,
    open: nowS < b.starts_at - SIGN_CLOSES_MS / 1000, window,
  };
  if (accountKind(player) !== 'linked') return out;
  const signed = await db.prepare('SELECT side, sellsword FROM town_seat_rosters WHERE week = ? AND key = ? AND account = ?').bind(week, key, player.id).first();
  const me = typeof character === 'string' ? await db.prepare('SELECT guild_id, rank FROM guild_members WHERE player = ? AND char_id = ?').bind(player.id, character).first() : null;
  const hire = await db.prepare("SELECT guild_id, fee, state FROM town_seat_hires WHERE week = ? AND key = ? AND account = ? AND state <> 'withdrawn'").bind(week, key, player.id).first();
  const side = me ? sideOf({ attacker: b.attacker, defender: b.defender }, me.guild_id) : null;
  const mine = { side: signed?.side ?? side, signed: !!signed, sellsword: !!signed?.sellsword || !!hire,
    ...(hire ? { hire: { side: sideOf({ attacker: b.attacker, defender: b.defender }, hire.guild_id), fee: Number(hire.fee) } } : {}) };
  if (side && me && Number(me.rank) === GUILD_RANK_MASTER) {
    const { results: hs = [] } = await db.prepare(`SELECT p.handle, h.fee, h.state FROM town_seat_hires h JOIN players p ON p.id = h.account
      WHERE h.week = ? AND h.key = ? AND h.guild_id = ? AND h.state <> 'withdrawn' ORDER BY h.at`).bind(week, key, me.guild_id).all();
    mine.hires = hs.map((h) => ({ handle: h.handle, fee: Number(h.fee), state: h.state }));
  }
  return { ...out, mine };
}

export async function siegesLive(db, nowS) {
  const r = await db.prepare("SELECT COUNT(*) AS n, MAX(ends_at) AS until FROM town_seat_battles WHERE state = 'scheduled' AND starts_at - ? <= ? AND ends_at > ?")
    .bind(BLACKOUT_LEAD_S, nowS, nowS).first();
  return { live: Number(r?.n ?? 0) > 0, until: r?.until == null ? null : Number(r.until) };
}
