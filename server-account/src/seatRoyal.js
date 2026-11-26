// @ts-check
import { accountKind, overRate } from './accounts.js';
import { seatsOpenFor, confirmedSeats } from './townSeats.js';
import { utcDay, MARKS_MAX } from '../../src/net/marksLaw.js';
import { mintSiegeOrder, siegeFieldValid } from '../../src/net/identityToken.js';
import { verifyRoyalReceipt } from '../../src/net/siegeReceipt.js';
import {
  seatWeekOf, seatWeekStartMs, seatKeyOk, SEAT_WEEK_MS, ROYAL_PAIR_DAY, ROYAL_LADDER_ROWS, settleRing, royalStandings, CROWN_SEAT_REGIONS, seasonOf,
} from '../../src/net/townSeatLaw.js';

const weekAt = (nowS) => seatWeekOf(nowS * 1000);
export const ROYAL_PASS_HOUR = 120;
const seatOpen = (player, env) => (accountKind(player) !== 'linked' ? { error: 'seats-need-account' } : !seatsOpenFor(player, env) ? { error: 'seats-closed' } : null);

export async function royalRuling(db, week, key) {
  const r = await db.prepare("SELECT guild_id, cost FROM town_seat_edicts WHERE key = ? AND week = ? AND edict = 'royal-tourney' AND state IN ('law', 'returned')").bind(key, week).first();
  return r ? { guild: r.guild_id, prize: Number(r.cost) } : null;
}
const windowOf = (week) => { const sb = Math.floor(seatWeekStartMs(week) / 1000); return { sb, se: sb + SEAT_WEEK_MS / 1000 }; };

/** @param {{db: any, nowS: number, subtle: SubtleCrypto}} ctx @param {CryptoKey|null} signingKey */
export async function royalPass({ db, nowS, subtle }, player, env, { key, field, watch = false } = {}, signingKey) {
  const closed = seatOpen(player, env);
  if (closed) return closed;
  if (!seatKeyOk(key)) return { error: 'bad-seat' };
  const seat = (await confirmedSeats(db, nowS)).get(key);
  if (!seat || seat.tier !== 'crown') return { error: 'royal-none' };
  const week = weekAt(nowS);
  if (!(await royalRuling(db, week, key))) return { error: 'royal-none' };
  if (await overRate({ db, nowS }, `seat-royal:${player.id}`, ROYAL_PASS_HOUR, 3600)) return { error: 'seats-rate' };
  const side = watch === true ? 'watch' : 'duel';
  let ring = (await db.prepare('SELECT field FROM town_seat_royal WHERE week = ? AND key = ?').bind(week, key).first())?.field ?? null;
  if (!ring) {
    if (side === 'duel') {
      if (!siegeFieldValid(field, 'crown', 'royal')) return { error: 'field-bad' };
      await db.prepare(`INSERT INTO town_seat_royal_fields (week, key, account, field, at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (week, key, account) DO UPDATE SET field = excluded.field, at = excluded.at`).bind(week, key, player.id, JSON.stringify(field), nowS).run();
    }
    const { results: rows = [] } = await db.prepare('SELECT account, field, at FROM town_seat_royal_fields WHERE week = ? AND key = ? ORDER BY at, rowid').bind(week, key).all();
    const f = settleRing(rows.map((r) => ({ account: r.account, field: r.field, at: Number(r.at) })));
    if (!f) return { error: 'ring-unsettled' };
    // When two requests settle the ring at once, the first one written stands.
    await db.prepare('INSERT OR IGNORE INTO town_seat_royal (week, key, field, at) VALUES (?, ?, ?, ?)').bind(week, key, f, nowS).run();
    ring = (await db.prepare('SELECT field FROM town_seat_royal WHERE week = ? AND key = ?').bind(week, key).first())?.field ?? f;
  }
  const { sb, se } = windowOf(week);
  const out = { side, week, key, startsAt: sb, endsAt: se };
  if (!signingKey) return { ...out, pass: null };
  const pass = await mintSiegeOrder({ s: player.id, sk: key, sw: week, sd: side, st: 'crown', sn: 'royal', sb, se, sf: JSON.parse(String(ring)) }, signingKey, { subtle, nowS });
  return { ...out, pass };
}

/** @param {{db: any, nowS: number, subtle: SubtleCrypto}} ctx @param {CryptoKey|null} publicKey */
export async function claimRoyal({ db, nowS, subtle }, player, env, { receipt } = {}, publicKey) {
  const closed = seatOpen(player, env);
  if (closed) return closed;
  if (!publicKey) return { error: 'no-gate-key' };
  // The relay cannot reach this service, so each receipt reaches it through the winning client.
  const v = await verifyRoyalReceipt(receipt, publicKey, { subtle, nowS });
  if (!v.ok) return { error: 'receipt', why: v.why };
  const c = v.claims;
  if (c.s !== player.id) return { error: 'not-yours' };
  if (!(await royalRuling(db, c.sw, c.sk))) return { error: 'royal-none' };
  if (await db.prepare('SELECT 1 FROM town_seat_weeks WHERE week = ?').bind(c.sw).first()) return { error: 'royal-over' };
  const day = utcDay(c.i);
  // A bout row is keyed on its room number, so a receipt sent twice counts once, and the pair's daily cap
  // is checked inside the INSERT.
  const ins = await db.prepare(`INSERT INTO town_seat_bouts (week, key, n, winner, loser, day, counted, at)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, (SELECT COUNT(*) FROM town_seat_bouts WHERE week = ?1 AND key = ?2 AND day = ?6
      AND ((winner = ?4 AND loser = ?5) OR (winner = ?5 AND loser = ?4))) < ?7, ?8
    WHERE NOT EXISTS (SELECT 1 FROM town_seat_bouts WHERE week = ?1 AND key = ?2 AND n = ?3)`)
    .bind(c.sw, c.sk, c.n, c.s, c.l, day, ROYAL_PAIR_DAY, nowS).run();
  const row = await db.prepare('SELECT winner, counted FROM town_seat_bouts WHERE week = ? AND key = ? AND n = ?').bind(c.sw, c.sk, c.n).first();
  if (!row || row.winner !== player.id) return { error: 'not-yours' };
  const wins = Number((await db.prepare('SELECT COUNT(*) AS n FROM town_seat_bouts WHERE week = ? AND key = ? AND winner = ? AND counted = 1').bind(c.sw, c.sk, player.id).first())?.n ?? 0);
  return { ok: true, counted: Number(row.counted) === 1, repeat: !ins?.meta?.changes, wins };
}

async function countedBouts(db, week, key) {
  const { results = [] } = await db.prepare('SELECT winner, loser, at FROM town_seat_bouts WHERE week = ? AND key = ? AND counted = 1').bind(week, key).all();
  return results.map((r) => ({ winner: r.winner, loser: r.loser, at: Number(r.at) }));
}

export async function royalView(db, key, nowS) {
  const week = weekAt(nowS);
  const rule = await royalRuling(db, week, key);
  if (!rule) return null;
  const rows = royalStandings(await countedBouts(db, week, key)).slice(0, ROYAL_LADDER_ROWS);
  const ids = rows.map((r) => r.account);
  const { results: ps = [] } = ids.length ? await db.prepare(`SELECT id, handle FROM players WHERE id IN (${ids.map(() => '?').join(', ')})`).bind(...ids).all() : { results: [] };
  const name = new Map(ps.map((p) => [p.id, p.handle ?? '']));
  const { sb, se } = windowOf(week);
  return { prize: rule.prize, startsAt: sb, endsAt: se, ladder: rows.map((r) => ({ name: name.get(r.account) ?? '', wins: r.wins, losses: r.losses })) };
}

export async function royalTurning(db, week, nowS, history, registry) {
  const { results: rules = [] } = await db.prepare("SELECT key, guild_id, cost FROM town_seat_edicts WHERE week = ? AND edict = 'royal-tourney' AND state = 'law'").bind(week).all();
  const out = [];
  const day = utcDay(nowS);
  for (const r of rules) {
    const key = Number(r.key), prize = Number(r.cost), escrow = `royal:${key}:${week}`;
    const top = royalStandings(await countedBouts(db, week, key))[0] ?? null;
    const kingdom = CROWN_SEAT_REGIONS[registry.get(key)?.region] ?? null;
    if (top) {
      const handle = (await db.prepare('SELECT handle FROM players WHERE id = ?').bind(top.account).first())?.handle ?? '';
      const full = `COALESCE((SELECT balance FROM marks WHERE account = ?3), 0) + ?2 > ${MARKS_MAX} OR NOT EXISTS (SELECT 1 FROM players WHERE id = ?3)`;
      if (prize > 0) {
        out.push(db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
          SELECT 'escrow', ?1, CASE WHEN ${full} THEN 'burn' ELSE 'account' END, CASE WHEN ${full} THEN NULL ELSE ?3 END, 'royal-prize', ?2, ?4, ?5, 'seats', 'The Royal Tourney', ?1 || ':prize'`)
          .bind(escrow, prize, top.account, day, nowS));
      }
      out.push(
        db.prepare('INSERT OR IGNORE INTO town_seat_titles (account, title, key, week, at) VALUES (?, \'champion\', ?, ?, ?)').bind(top.account, key, week, nowS),
        db.prepare('INSERT INTO town_seat_royal (week, key, field, champion, at) VALUES (?, ?, NULL, ?, ?) ON CONFLICT (week, key) DO UPDATE SET champion = excluded.champion').bind(week, key, top.account, nowS),
        history(key, 'royal-champion', { name: handle, kingdom, wins: top.wins, prize }),
      );
    } else {
      if (prize > 0) {
        out.push(db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
          SELECT 'escrow', ?1, 'guild', ?2, 'royal-return', ?3, ?4, ?5, 'seats', 'The Royal Tourney', ?1 || ':return'
          WHERE EXISTS (SELECT 1 FROM guilds WHERE id = ?2) AND COALESCE((SELECT balance FROM guild_marks WHERE guild_id = ?2), 0) + ?3 <= ${MARKS_MAX}`)
          .bind(escrow, r.guild_id, prize, day, nowS));
      }
      out.push(history(key, 'royal-none', { kingdom }));
    }
    out.push(db.prepare("UPDATE town_seat_edicts SET state = 'returned' WHERE key = ? AND week = ? AND state = 'law'").bind(key, week));
  }
  return out;
}

export const KEPT_TITLES = Object.freeze(['crowned', 'keeper', 'champion']);
export async function keptTitleOf(db, playerId, title, zero = null) {
  if (!KEPT_TITLES.includes(title)) return null;
  const r = await db.prepare('SELECT key, week FROM town_seat_titles WHERE account = ? AND title = ? ORDER BY week DESC, key LIMIT 1').bind(playerId, title).first();
  return r ? { ts: [Number(r.key), seasonOf(Number(r.week), zero)?.n ?? 0] } : null;
}
