// @ts-check
// The relay cannot call this service, so the pass is an order signed here and checked by the room, and the
// result arrives in a fighter's receipt. The result INSERT is the first write in the batch and is keyed by the
// battle, so a second receipt for the same battle rolls back whole.
import { accountKind, displayName, overRate } from './accounts.js';
import { renownHeldSql } from './renownTracks.js';
import { CHAR_ID_RE } from './service.js';
import { seatsOpenFor, confirmedSeats } from './townSeats.js';
import { fortifierAt, fortsCaptureWithSave, fortTierAt, siegewrightAt, fortsLapsedStatements, fortsDueStatements, fortsGuildFallStatements, fortsRestoredStatements } from './seatForts.js';
import { canModerate } from './titles.js';
import { mustChange } from './realm.js';
import { gatherStandings } from './seatInfluence.js';
import { utcDay, MARKS_MAX } from '../../src/net/marksLaw.js';
import { mintSiegeOrder, siegeFieldValid } from '../../src/net/identityToken.js';
import { SIEGE_RAMS_MAX } from '../../src/net/siegeRef.js';
import { verifySiegeReceipt, SIEGE_RECEIPT_TTL_S } from '../../src/net/siegeReceipt.js';
import { RENOWN_XP_MAX, RENOWN_TRACKS_MAX } from '../../src/net/renown.js';
import {
  seatWeekOf, seatKeyOk, settleField, passWindowEnds, passOpens, siegeWinner, siegeAftermath, spoilsOf, SIEGE_HONOURS,
  CLAIM_FEE, STANDING_START, STANDING_MAX, seasonFloor, seasonZeroOf, siegeMinutes, seatWeekStartMs, seasonOf, STANDING_CHANGES,
} from '../../src/net/townSeatLaw.js';

const weekAt = (nowS) => seatWeekOf(nowS * 1000);
export const SIEGE_PASS_HOUR = 120;
const seatOpen = (player, env) => (accountKind(player) !== 'linked' ? { error: 'seats-need-account' } : !seatsOpenFor(player, env) ? { error: 'seats-closed' } : null);
const ridOf = () => { const b = new Uint8Array(12); crypto.getRandomValues(b); return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); };

async function battleAt(db, week, key) {
  const b = await db.prepare('SELECT * FROM town_seat_battles WHERE week = ? AND key = ?').bind(week, key).first();
  return b ? { ...b, starts_at: Number(b.starts_at), ends_at: Number(b.ends_at), week: Number(b.week), key: Number(b.key) } : null;
}
const resultAt = (db, week, key) => db.prepare('SELECT result, raised, winner FROM town_seat_results WHERE week = ? AND key = ?').bind(week, key).first();
const PRIOR_SQL = `json_object(
  'hold', json((SELECT json_object('guild', guild_id, 'region', region, 'standing', standing, 'since', since_week, 'truce', truce_week,
    'tithe', tithe, 'titheWeek', tithe_week, 'owed', owed) FROM town_seat_holds WHERE key = ?2)),
  'legacy', json((SELECT json_group_array(json_array(week, guild_id, amount)) FROM town_seat_legacy WHERE key = ?2 AND week >= ?1)))`;
const priorWorks = (db, W, K, guild = null) => db.prepare(`UPDATE town_seat_results SET prior = json_set(COALESCE(prior, '{}'),
  '$.forts', json((SELECT json_group_object(work, tier) FROM town_seat_forts WHERE key = ?2)),
  '$.projects', json((SELECT json_group_array(json_array(work, building, guild_id, builder, siegewright, stands_at, at)) FROM town_seat_forts WHERE key = ?2 AND building IS NOT NULL)),
  '$.held', json((SELECT json_group_array(json_array(work, material, qty)) FROM town_seat_fort_held WHERE key = ?2 AND qty > 0)),
  '$.edict', (SELECT edict FROM town_seat_edicts WHERE key = ?2 AND week = ?1 + 1 AND guild_id = ?3 AND state = 'proclaimed')) WHERE week = ?1 AND key = ?2`).bind(W, K, guild);
const revoltStood = (db, K, W, guild, name, nowS, history) => [
  db.prepare('DELETE FROM town_seat_holds WHERE key = ? AND guild_id = ?').bind(K, guild),
  db.prepare("UPDATE town_seat_edicts SET state = 'void' WHERE key = ? AND week = ? AND state = 'proclaimed'").bind(K, W + 1),
  history('revolt-stood', { guild: name }),
  ...fortsLapsedStatements(db, K, nowS),
];

/** @param {{db: any, nowS: number, subtle: SubtleCrypto}} ctx @param {CryptoKey|null} signingKey */
export async function siegePass({ db, nowS, subtle }, player, env, { key, field, week: asked } = {}, signingKey) {
  const closed = seatOpen(player, env);
  if (closed) return closed;
  if (!seatKeyOk(key)) return { error: 'bad-seat' };
  const week = asked === weekAt(nowS) - 1 ? asked : weekAt(nowS);
  const b = await battleAt(db, week, key);
  if (!b || b.state === 'void') return { error: 'battle-none' };
  if (nowS < passOpens(b)) return { error: 'pass-early' };
  const se = passWindowEnds(b);
  const late = nowS >= se;
  if (late && nowS >= se + SIEGE_RECEIPT_TTL_S) return { error: 'pass-late' };
  if (await overRate({ db, nowS }, `seat-pass:${player.id}`, SIEGE_PASS_HOUR, 3600)) return { error: 'seats-rate' };
  const row = await db.prepare('SELECT side FROM town_seat_rosters WHERE week = ? AND key = ? AND account = ?').bind(week, key, player.id).first();
  const side = row?.side === 'attack' || row?.side === 'defend' ? row.side : 'watch';
  if (late && (side === 'watch' || !b.field)) return { error: 'pass-late' };
  let settled = b.field ?? null;
  if (!settled) {
    if (side !== 'watch') {
      if (!siegeFieldValid(field, b.tier)) return { error: 'field-bad' };
      await db.prepare(`INSERT INTO town_seat_fields (week, key, account, side, field, at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (week, key, account) DO UPDATE SET field = excluded.field, at = excluded.at`)
        .bind(week, key, player.id, side, JSON.stringify(field), nowS).run();
    }
    const { results: rows = [] } = await db.prepare('SELECT side, field, at FROM town_seat_fields WHERE week = ? AND key = ? ORDER BY at, rowid').bind(week, key).all();
    const f = settleField(rows.map((r) => ({ side: r.side, field: r.field, at: Number(r.at) })), nowS >= b.starts_at, b.kind);
    if (!f) return { error: 'field-unsettled' };
    // The field is settled once, so a racing second request keeps the first one's.
    await db.prepare('UPDATE town_seat_battles SET field = ? WHERE week = ? AND key = ? AND field IS NULL').bind(f, week, key).run();
    settled = (await db.prepare('SELECT field FROM town_seat_battles WHERE week = ? AND key = ?').bind(week, key).first())?.field ?? f;
  }
  const out = { side, week, key, startsAt: b.starts_at, endsAt: b.ends_at, window: se, ...(late ? { late: true } : {}) };
  if (!signingKey) return { ...out, pass: null };
  const sf = JSON.parse(String(settled));
  const sx = await siegeWorks(db, b, nowS);
  const pass = await mintSiegeOrder({ s: player.id, sk: key, sw: week, sd: side, st: b.tier, sn: b.kind, sb: b.starts_at, se, sf, sx }, signingKey, { subtle, nowS });
  return { ...out, pass };
}

async function siegeWorks(db, b, nowS) {
  if (b.kind !== 'siege') return null;
  if (b.works) return JSON.parse(String(b.works));
  const walls = await fortTierAt(db, b.key, 'walls', nowS), gatehouse = await fortTierAt(db, b.key, 'gatehouse', nowS), barracks = await fortTierAt(db, b.key, 'barracks', nowS);
  const gate = b.tier === 'crown' ? gatehouse : gatehouse >= 1 ? gatehouse : -1;
  const rams = gate >= 0 ? Math.max(0, Math.min(SIEGE_RAMS_MAX, Number(b.rams ?? 0) || 0)) : 0;
  const sx = [walls, gate, rams, (await siegewrightAt(db, b.week, b.key, nowS)) ? 1 : 0, barracks];
  // Works are frozen at the first pass because the relay room refuses a later pass that names different works.
  await db.prepare('UPDATE town_seat_battles SET works = ? WHERE week = ? AND key = ? AND works IS NULL').bind(JSON.stringify(sx), b.week, b.key).run();
  const row = await db.prepare('SELECT works FROM town_seat_battles WHERE week = ? AND key = ?').bind(b.week, b.key).first();
  return row?.works ? JSON.parse(String(row.works)) : sx;
}

async function higherOf(db, b, nowS, zero) {
  const seat = (await confirmedSeats(db, nowS)).get(b.key);
  if (!seat) return null;
  const w = b.week - 1;
  const list = await gatherStandings(db, seat, w, Math.floor(seatWeekStartMs(b.week) / 1000), !!seasonOf(w, zero));
  const { results: legacy = [] } = await db.prepare('SELECT guild_id, amount FROM town_seat_legacy WHERE week = ? AND key = ?').bind(w, b.key).all();
  const of = (g) => (list.find((s) => s.guild === g)?.total ?? 0) + Number(legacy.find((l) => l.guild_id === g)?.amount ?? 0);
  const a = of(b.attacker), d = of(b.defender);
  return a > d ? 'attack' : d > a ? 'defend' : null;
}

// A fee is burnt instead of failing when its target balance is full, so a Sellsword's purse never rolls
// back the result.
export async function swordsSettled(db, week, key, nowS, { voided = false } = {}) {
  const { results: hires = [] } = await db.prepare("SELECT account, state FROM town_seat_hires WHERE week = ? AND key = ? AND state IN ('offered', 'signed') AND fee > 0 ORDER BY at, account")
    .bind(week, key).all();
  const day = utcDay(nowS), out = [];
  for (const h of hires) {
    const paid = h.state === 'signed' && !voided;
    const fits = paid
      ? `EXISTS (SELECT 1 FROM players WHERE id = h.account) AND COALESCE((SELECT balance FROM marks WHERE account = h.account), 0) + h.fee <= ${MARKS_MAX}`
      : `EXISTS (SELECT 1 FROM guilds WHERE id = h.guild_id) AND COALESCE((SELECT balance FROM guild_marks WHERE guild_id = h.guild_id), 0) + h.fee <= ${MARKS_MAX}`;
    out.push(db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'escrow', 'hire:' || h.week || ':' || h.key || ':' || h.account || ':' || h.at, CASE WHEN ${fits} THEN ?5 ELSE 'burn' END,
        CASE WHEN ${fits} THEN ${paid ? 'h.account' : 'h.guild_id'} END, ?6, h.fee, ?7, ?8, 'seats', 'A siege', 'hire:' || h.week || ':' || h.key || ':' || h.account || ':' || h.at || ?9
      FROM town_seat_hires h WHERE h.week = ?1 AND h.key = ?2 AND h.account = ?3 AND h.state = ?4 AND h.fee > 0`)
      .bind(week, key, h.account, h.state, paid ? 'account' : 'guild', paid ? 'sellsword-fee' : 'sellsword-return', day, nowS, paid ? ':fee' : ':return'));
  }
  out.push(db.prepare(`UPDATE town_seat_hires SET state = 'withdrawn' WHERE week = ? AND key = ? AND state IN ('offered'${voided ? ", 'signed'" : ''})`).bind(week, key));
  return out;
}

async function applyResult(db, b, c, nowS, zero) {
  const W = b.week, K = b.key, result = c.r, raised = c.a === 1 ? 1 : 0;
  const names = new Map();
  const { results: gs = [] } = await db.prepare('SELECT id, name, tag FROM guilds WHERE id IN (?, ?)').bind(b.attacker, b.defender).all();
  for (const g of gs) names.set(g.id, { name: g.name, tag: g.tag });
  const nameOf = (id) => names.get(id) ?? { name: '', tag: '' };
  const history = (kind, data) => db.prepare('INSERT INTO town_seat_history (key, week, kind, data, at) VALUES (?, ?, ?, ?, ?)').bind(K, W, kind, JSON.stringify(data), nowS);
  const day = utcDay(nowS);
  const swords = await swordsSettled(db, W, K, nowS);
  // The result lands only for a battle still scheduled with its week unsettled, so a late receipt moves
  // nothing the Turning already settled.
  const head = (winner) => [
    db.prepare(`INSERT INTO town_seat_results (week, key, result, raised, winner, rid, at, prior) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ${PRIOR_SQL}
      WHERE EXISTS (SELECT 1 FROM town_seat_battles WHERE week = ?1 AND key = ?2 AND state = 'scheduled')
        AND NOT EXISTS (SELECT 1 FROM town_seat_weeks WHERE week = ?1)`).bind(W, K, result, raised, winner, ridOf(), nowS),
    mustChange(db),
    db.prepare("UPDATE town_seat_battles SET state = ? WHERE week = ? AND key = ?").bind(result === 'forfeit' ? 'forfeit' : 'fought', W, K),
  ];
  const run = async (stmts) => { try { await db.batch(stmts); return true; } catch { return false; } };
  if (b.kind === 'revolt') {
    if (result === 'defend') {
      return run([...head('defend'),
        db.prepare('UPDATE town_seat_holds SET standing = MAX(standing, ?) WHERE key = ? AND guild_id = ?').bind(STANDING_CHANGES.revoltTo, K, b.defender),
        history('revolt-down', { guild: nameOf(b.defender) }), ...swords]);
    }
    return run([...head('attack'), ...fortsDueStatements(db, nowS, K), priorWorks(db, W, K, b.defender),
      ...revoltStood(db, K, W, b.defender, nameOf(b.defender), nowS, history), ...swords]);
  }
  if (b.kind === 'tourney') {
    const higher = result === 'tie' ? await higherOf(db, b, nowS, zero) : null;
    const winner = siegeWinner(result, higher);
    const order = winner === 'defend' ? [b.defender, b.attacker] : winner === 'attack' ? [b.attacker, b.defender] : [];
    const seat = (await confirmedSeats(db, nowS)).get(K);
    const fee = CLAIM_FEE[b.tier] ?? CLAIM_FEE.palace;
    for (const g of order) {
      const ok = await run([...head(g === b.attacker ? 'attack' : 'defend'),
        db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
          SELECT 'guild', ?1, 'burn', NULL, 'seat-claim', ?2, ?3, ?4, 'seats', 'The Tourney', ?5
          WHERE COALESCE((SELECT balance FROM guild_marks WHERE guild_id = ?1), 0) >= ?2 AND NOT EXISTS (SELECT 1 FROM town_seat_holds WHERE key = ?6)`)
          .bind(g, fee, day, nowS, `tourney-${W}-${K}`, K), mustChange(db),
        db.prepare('INSERT INTO town_seat_holds (key, guild_id, region, tier, since_week, standing, truce_week, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(K, g, Number(seat?.region ?? 0), b.tier, W, STANDING_START, W, nowS),
        history('tourney-won', { guild: nameOf(g) }), ...swords]);
      if (ok) return true;
      if (await resultAt(db, W, K)) return false;
    }
    return run([...head(null), history('tourney-unheld', {}), ...swords]);
  }
  const forfeitPaid = result === 'forfeit' && !!(await db.prepare(`SELECT 1 FROM town_seat_results r JOIN town_seat_battles x ON x.week = r.week AND x.key = r.key
    WHERE r.result = 'forfeit' AND x.state <> 'void' AND x.attacker = ? AND x.defender = ? AND r.week >= ? AND r.week < ? LIMIT 1`).bind(b.attacker, b.defender, seasonFloor(W, zero), W).first());
  const throne = c.th === 1 ? 1 : 0;
  const after = siegeAftermath('siege', result, raised, { forfeitPaid, throne: throne === 1 });
  const stmts = [...head(siegeWinner(result))];
  if (after.taken) {
    const seat = (await confirmedSeats(db, nowS)).get(K);
    const seasonWeek = seasonFloor(W, zero);
    stmts.push(...fortsDueStatements(db, nowS, K), priorWorks(db, W, K));
    const fortifier = await fortifierAt(db, W, K, nowS, seasonWeek);
    stmts.push(...fortsCaptureWithSave(db, K, { week: W, nowS, seasonWeek, fortifier, history }));
    stmts.push(
      db.prepare(`INSERT INTO town_seat_holds (key, guild_id, region, tier, since_week, standing, truce_week, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (key) DO UPDATE SET guild_id = excluded.guild_id, since_week = excluded.since_week, standing = excluded.standing,
          truce_week = excluded.truce_week, tithe = 0, tithe_week = NULL, owed = 0, at = excluded.at`)
        .bind(K, b.attacker, Number(seat?.region ?? 0), b.tier, W, STANDING_START, W, nowS),
      db.prepare('DELETE FROM town_seat_legacy WHERE key = ? AND guild_id = ? AND week >= ?').bind(K, b.defender, W),
      history('siege-taken', { guild: nameOf(b.attacker), from: nameOf(b.defender), minutes: siegeMinutes(Number(b.starts_at), Number(c.i)) }),
    );
  } else {
    if (after.standing) stmts.push(db.prepare('UPDATE town_seat_holds SET standing = MIN(?, standing + ?) WHERE key = ? AND guild_id = ?').bind(STANDING_MAX, after.standing, K, b.defender));
    if (after.bonus) stmts.push(db.prepare("INSERT OR IGNORE INTO town_seat_aftermath (week, key, guild_id, what) VALUES (?, ?, ?, 'bonus')").bind(W, K, b.defender));
    if (after.barred) {
      stmts.push(
        db.prepare("INSERT OR IGNORE INTO town_seat_aftermath (week, key, guild_id, what) VALUES (?, ?, ?, 'barred')").bind(W, K, b.attacker),
        // Voided, never deleted: the Watch day cap and the Orc Raid caps still count these rows.
        db.prepare('UPDATE town_seat_influence SET voided = 1 WHERE week = ? AND key = ? AND guild_id = ?').bind(W, K, b.attacker),
        db.prepare('DELETE FROM town_seat_legacy WHERE week = ? AND key = ? AND guild_id = ?').bind(W, K, b.attacker),
      );
    }
    const kind = result === 'forfeit' ? 'siege-forfeit' : result === 'absent' ? 'siege-absent' : 'siege-held';
    stmts.push(history(kind, { guild: nameOf(b.defender), against: nameOf(b.attacker), ...(kind === 'siege-held' ? { throne } : {}) }));
  }
  return run([...stmts, ...swords]);
}

/** @param {{db: any, nowS: number, subtle: SubtleCrypto}} ctx @param {CryptoKey|null} publicKey */
export async function claimSiege({ db, nowS, subtle }, player, env, { receipt, character } = {}, publicKey) {
  const closed = seatOpen(player, env);
  if (closed) return closed;
  if (!publicKey) return { error: 'no-gate-key' };
  const v = await verifySiegeReceipt(receipt, publicKey, { subtle, nowS });
  if (!v.ok) return { error: 'receipt', why: v.why };
  const c = v.claims;
  if (c.s !== player.id) return { error: 'not-yours' };
  const b = await battleAt(db, c.sw, c.sk);
  if (!b) return { error: 'battle-none' };
  if (b.state === 'void') return { error: 'battle-void' };
  let r = await resultAt(db, c.sw, c.sk);
  const zero = seasonZeroOf(env?.SEASON_ZERO_WEEK);
  const applied = !r && await applyResult(db, b, c, nowS, zero);
  r = await resultAt(db, c.sw, c.sk);
  if (!r) {
    const settled = await db.prepare('SELECT 1 FROM town_seat_weeks WHERE week = ?').bind(c.sw).first();
    if (settled || (await battleAt(db, c.sw, c.sk))?.state === 'void') return { error: 'battle-void' };
    throw new Error('claimSiege: the result was neither written nor found');
  }
  const out = { result: r.result, winner: r.winner ?? null, applied };
  if (c.h !== 1 || b.kind === 'revolt') return { ...out, honours: null };
  if (typeof character !== 'string' || !CHAR_ID_RE.test(character)) return { error: 'honours-character' };
  const rostered = await db.prepare('SELECT char_id FROM town_seat_rosters WHERE week = ? AND key = ? AND account = ?').bind(c.sw, c.sk, player.id).first();
  if (!rostered || rostered.char_id !== character) return { error: 'honours-character' };
  if (await db.prepare('SELECT 1 FROM town_seat_honours WHERE week = ? AND key = ? AND account = ?').bind(c.sw, c.sk, player.id).first()) return { error: 'honours-twice' };
  const spent = !!(await db.prepare(`SELECT 1 FROM town_seat_honours h JOIN town_seat_battles x ON x.week = h.week AND x.key = h.key
    WHERE h.marks > 0 AND h.week >= ?1 AND h.week <= ?2 AND NOT (h.week = ?2 AND h.key = ?5)
      AND ((x.attacker = ?3 AND x.defender = ?4) OR (x.attacker = ?4 AND x.defender = ?3)) LIMIT 1`).bind(seasonFloor(c.sw, zero), c.sw, b.attacker, b.defender, c.sk).first());
  const won = r.winner === c.sd;
  const give = spent ? { marks: 0, xp: 0 } : won ? SIEGE_HONOURS.win : SIEGE_HONOURS.lose;
  const spoil = spent ? null : spoilsOf(c.sw, c.sk, player.id);
  const rid = ridOf();
  const mine = 'EXISTS (SELECT 1 FROM town_seat_honours WHERE week = ?1 AND key = ?2 AND account = ?3 AND rid = ?4)';
  const stmts = [
    db.prepare('INSERT INTO town_seat_honours (week, key, account, side, char_id, marks, xp, spoil, rid, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(c.sw, c.sk, player.id, c.sd, character, give.marks, give.xp, spoil, rid, nowS),
  ];
  if (give.marks > 0) {
    stmts.push(db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'mint', NULL, 'account', ?3, 'siege-honours', ?5, ?6, ?7, ?3, 'Siege Honours', 'siege-honours:' || ?1 || ':' || ?2 WHERE ${mine}`)
      .bind(c.sw, c.sk, player.id, rid, give.marks, utcDay(nowS), nowS));
  }
  if (give.xp > 0) {
    stmts.push(
      db.prepare(`UPDATE renown_tracks SET xp = MIN(?5, xp + ?6), updated_at = ?7 WHERE player = ?3 AND char_id = ?8 AND ${mine}`)
        .bind(c.sw, c.sk, player.id, rid, RENOWN_XP_MAX, give.xp, nowS, character),
      db.prepare(`INSERT INTO renown_tracks (player, char_id, name, xp, last_rid, created_at, updated_at)
        SELECT ?3, ?8, ?9, MIN(?5, ?6), NULL, ?7, ?7 WHERE ${mine}
          AND NOT EXISTS (SELECT 1 FROM renown_tracks WHERE player = ?3 AND char_id = ?8)
          AND ${renownHeldSql('?3')} < ?10`)
        .bind(c.sw, c.sk, player.id, rid, RENOWN_XP_MAX, give.xp, nowS, character, displayName(player), RENOWN_TRACKS_MAX),
    );
  }
  if (spoil) {
    stmts.push(db.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty) SELECT ?3, ?5, ?6, 'own', 1 WHERE ${mine}
      ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = prof_stores.qty + 1`).bind(c.sw, c.sk, player.id, rid, character, spoil));
  }
  try { await db.batch(stmts); } catch { return { error: 'honours-twice' }; }
  return { ...out, honours: { side: c.sd, won, marks: give.marks, xp: give.xp, spoil, spent } };
}

// Returns null when nothing was stored, because `{}` would read as a stored state with the seat unheld.
function priorOf(row) {
  try { const p = JSON.parse(String(row?.prior ?? '')); return p && typeof p === 'object' && !Array.isArray(p) ? p : null; } catch { return null; }
}

/** @param {{db: any, nowS: number}} ctx */
export async function voidSiege({ db, nowS }, mod, env, { key } = {}) {
  if (!canModerate(mod, env)) return { error: 'not-moderator' };
  if (!seatKeyOk(key)) return { error: 'bad-seat' };
  const W = weekAt(nowS);
  // A receipt that lands between the read and the write rolls the void back whole, and the loop reads it again.
  for (let tries = 0; tries < 3; tries++) {
    const b = await battleAt(db, W, key);
    if (!b) return { error: 'battle-none' };
    const out = { ok: true, key, week: W, battle: b.kind };
    if (b.state === 'void') return { ...out, repeat: true };
    if (await db.prepare('SELECT 1 FROM town_seat_weeks WHERE week = ?').bind(W).first()) return { error: 'battle-settled' };
    const r = await db.prepare('SELECT result, raised, winner, rid, at, prior FROM town_seat_results WHERE week = ? AND key = ?').bind(W, key).first();
    const { results: gs = [] } = await db.prepare('SELECT id, name, tag FROM guilds WHERE id IN (?, ?)').bind(b.attacker, b.defender).all();
    const names = new Map(gs.map((g) => [g.id, { name: g.name, tag: g.tag }]));
    const nameOf = (id) => names.get(id) ?? { name: '', tag: '' };
    // The week must still be unsettled inside the write, so a Turning that came first rolls the void back.
    const unsettled = 'NOT EXISTS (SELECT 1 FROM town_seat_weeks WHERE week = ?1)';
    const stmts = r
      ? [db.prepare(`UPDATE town_seat_battles SET state = 'void' WHERE week = ?1 AND key = ?2 AND state IN ('fought', 'forfeit')
          AND EXISTS (SELECT 1 FROM town_seat_results WHERE week = ?1 AND key = ?2 AND rid = ?3) AND ${unsettled}`).bind(W, key, r.rid), mustChange(db)]
      : [db.prepare(`UPDATE town_seat_battles SET state = 'void' WHERE week = ?1 AND key = ?2 AND state = 'scheduled'
          AND NOT EXISTS (SELECT 1 FROM town_seat_results WHERE week = ?1 AND key = ?2) AND ${unsettled}`).bind(W, key), mustChange(db),
        ...(await swordsSettled(db, W, key, nowS, { voided: true }))];
    if (!r && b.kind === 'revolt' && await db.prepare('SELECT 1 FROM town_seat_holds WHERE key = ? AND guild_id = ?').bind(key, b.defender).first()) {
      const history = (kind, data) => db.prepare('INSERT INTO town_seat_history (key, week, kind, data, at) VALUES (?, ?, ?, ?, ?)').bind(key, W, kind, JSON.stringify(data), nowS);
      stmts.push(...revoltStood(db, key, W, b.defender, nameOf(b.defender), nowS, history));
    }
    let restored = false;
    if (r) {
      const kept = priorOf(r);
      const p = kept ?? {};
      const held = p.hold && typeof p.hold === 'object' && p.hold.guild === b.defender ? p.hold : null;
      const legacyBack = (Array.isArray(p.legacy) ? p.legacy : []).filter((l) => Array.isArray(l) && Number.isSafeInteger(l[0]) && typeof l[1] === 'string' && Number.isSafeInteger(l[2]) && l[2] >= 0)
        .map(([w, g, n]) => db.prepare('INSERT OR IGNORE INTO town_seat_legacy (week, key, guild_id, amount) VALUES (?, ?, ?, ?)').bind(w, key, g, n));
      if (b.kind === 'tourney') {
        const won = r.winner === 'attack' ? b.attacker : r.winner === 'defend' ? b.defender : null;
        if (won) {
          stmts.push(
            db.prepare('DELETE FROM town_seat_holds WHERE key = ? AND guild_id = ? AND since_week = ?').bind(key, won, W),
            db.prepare("UPDATE town_seat_edicts SET state = 'void' WHERE key = ? AND week = ? AND guild_id = ? AND state = 'proclaimed'").bind(key, W + 1, won),
            ...fortsLapsedStatements(db, key, nowS),
          );
        }
      } else if (r.result === 'attack') {
        const back = held != null || kept == null;
        const seat = held ? null : (await confirmedSeats(db, nowS)).get(key);
        const num = (v, d) => (Number.isSafeInteger(v) ? v : d);
        const h = held ?? {};
        stmts.push(
          ...fortsDueStatements(db, nowS, key),
          ...(b.kind === 'siege' ? fortsGuildFallStatements(db, key, b.attacker) : []),
          !back ? db.prepare('DELETE FROM town_seat_holds WHERE key = ? AND guild_id = ? AND since_week = ?').bind(key, b.attacker, W) : db.prepare(`INSERT INTO town_seat_holds (key, guild_id, region, tier, since_week, standing, truce_week, tithe, tithe_week, owed, at)
            SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11 WHERE EXISTS (SELECT 1 FROM guilds WHERE id = ?2)
            ON CONFLICT (key) DO UPDATE SET guild_id = excluded.guild_id, region = excluded.region, since_week = excluded.since_week,
              standing = excluded.standing, truce_week = excluded.truce_week, tithe = excluded.tithe, tithe_week = excluded.tithe_week,
              owed = excluded.owed, at = excluded.at WHERE town_seat_holds.guild_id = ?12`)
            .bind(key, b.defender, num(h.region, Number(seat?.region ?? 0)), b.tier, num(h.since, W), num(h.standing, STANDING_START),
              num(h.truce, null), num(h.tithe, 0), num(h.titheWeek, null), num(h.owed, 0), nowS, b.attacker),
          ...legacyBack,
        );
        if (b.kind === 'siege') {
          stmts.push(db.prepare("UPDATE town_seat_edicts SET state = 'void' WHERE key = ? AND week = ? AND guild_id = ? AND state = 'proclaimed'").bind(key, W + 1, b.attacker));
          const forts = p.forts && typeof p.forts === 'object' ? Object.entries(p.forts).filter(([, t]) => Number.isSafeInteger(t) && t >= 0 && t <= 3) : [];
          for (const [work, t] of forts) stmts.push(db.prepare('UPDATE town_seat_forts SET tier = MAX(tier, ?) WHERE key = ? AND work = ?').bind(t, key, work));
          stmts.push(db.prepare('DELETE FROM town_seat_fortifier WHERE key = ? AND at = ?').bind(key, Number(r.at)));
        }
        if (held) {
          const int = (v) => Number.isSafeInteger(v);
          const projects = (Array.isArray(p.projects) ? p.projects : []).filter((x) => Array.isArray(x) && typeof x[0] === 'string' && int(x[1]) && x[1] >= 1 && x[1] <= 3
            && x[2] === b.defender && (x[5] == null || int(x[5])) && int(x[6])).map(([work, building, , builder, siegewright, standsAt, at]) => [work, building, builder === 1, siegewright === 1, standsAt ?? null, at]);
          const stuff = (Array.isArray(p.held) ? p.held : []).filter((x) => Array.isArray(x) && typeof x[0] === 'string' && typeof x[1] === 'string' && int(x[2]) && x[2] > 0);
          stmts.push(...fortsRestoredStatements(db, key, b.defender, projects, stuff));
          if (b.kind === 'revolt' && typeof p.edict === 'string') {
            stmts.push(db.prepare("UPDATE town_seat_edicts SET state = 'proclaimed' WHERE key = ? AND week = ? AND guild_id = ? AND edict = ? AND state = 'void'").bind(key, W + 1, b.defender, p.edict));
          }
        }
        restored = back && names.has(b.defender);
      } else {
        if (held && Number.isSafeInteger(held.standing)) {
          stmts.push(db.prepare('UPDATE town_seat_holds SET standing = ? WHERE key = ? AND guild_id = ?').bind(held.standing, key, b.defender));
        }
        if (b.kind === 'siege') {
          stmts.push(
            db.prepare(`DELETE FROM town_seat_aftermath WHERE week = ?1 AND key = ?2
              AND ((guild_id = ?3 AND what = 'bonus') OR (guild_id = ?4 AND what = 'barred'))`).bind(W, key, b.defender, b.attacker),
            db.prepare('UPDATE town_seat_influence SET voided = 0 WHERE week = ? AND key = ? AND guild_id = ?').bind(W, key, b.attacker),
            ...legacyBack,
          );
        }
      }
    }
    stmts.push(db.prepare('INSERT INTO town_seat_history (key, week, kind, data, at) VALUES (?, ?, ?, ?, ?)').bind(key, W, 'siege-voided',
      JSON.stringify({ battle: b.kind, result: r?.result ?? null, guild: nameOf(b.attacker), holder: nameOf(b.defender), restored, by: mod.handle ?? null }), nowS));
    try { await db.batch(stmts); } catch { continue; }
    return { ...out, result: r?.result ?? null, restored };
  }
  throw new Error('voidSiege: the battle would not hold still');
}
