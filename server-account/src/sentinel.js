// @ts-check
// BUNNYFALL (2026-11-20): THE SENTINEL GARRISON EVENT, KEPT (src/net/sentinelLaw.js says the law). The two sides' counts, the
// month's clock and the outcome, written once; each account's lifetime gifts (the donor's title and aura at SENTINEL_DONOR_PIECES)
// and its Garrison Tokens (the event shop). A friends' server: a gift is the game's word, bounded (SENTINEL_GIVE_MAX, and
// SENTINEL_DAILY_CAP an account a day). Who gave to which side is never kept, only how much each account gave in all and today.
import { SENTINEL_DAILY_CAP, SENTINEL_DONOR_PIECES, cleanSide, cleanGive, sentinelPct, sentinelLeaning, sentinelPhase, sentinelOfferById, sentinelTokens, SENTINEL_TOKENS_PER_PIECE } from '../../src/net/sentinelLaw.js';

const DAY_S = 86400;

/** The event row, begun on the first ask and settled once the month is over. */
async function readEvent(db, nowS) {
  await db.prepare('INSERT OR IGNORE INTO sentinel_event (id, started_at) VALUES (1, ?)').bind(nowS).run();
  let row = await db.prepare('SELECT started_at, stay_pts, leave_pts, outcome FROM sentinel_event WHERE id = 1').first();
  const phase = sentinelPhase(nowS, Number(row.started_at));
  if (phase.over && !row.outcome) {
    // once: the first reader after the month's end writes it, and a second finds it written
    await db.prepare('UPDATE sentinel_event SET outcome = ?1 WHERE id = 1 AND outcome IS NULL').bind(sentinelLeaning(Number(row.stay_pts), Number(row.leave_pts))).run();
    row = await db.prepare('SELECT started_at, stay_pts, leave_pts, outcome FROM sentinel_event WHERE id = 1').first();
  }
  return { row, phase };
}

async function givenToday(db, account, day) {
  const r = await db.prepare('SELECT n FROM sentinel_gifts WHERE account = ? AND day = ?').bind(account, day).first();
  return Number(r?.n) || 0;
}

/** An account's own: today's gifts, its lifetime count, its tokens and what the donor's honours need. */
async function mineOf(db, player, today) {
  const r = player?.id ? await db.prepare('SELECT sentinel_given, sentinel_spent FROM players WHERE id = ?').bind(player.id).first() : null;
  const given = Number(r?.sentinel_given) || 0, spent = Number(r?.sentinel_spent) || 0;
  return { today, cap: SENTINEL_DAILY_CAP, given, tokens: sentinelTokens(given, spent), donorAt: SENTINEL_DONOR_PIECES };
}

function shape(row, phase, mine) {
  const stay = Number(row.stay_pts) || 0, leave = Number(row.leave_pts) || 0;
  // the last days the bar is dark: no percentages leave the service
  const pct = phase.dark && !phase.over ? null : sentinelPct(stay, leave);
  return {
    ok: true, startedAt: Number(row.started_at), endsAt: phase.endsAt, daysLeft: phase.daysLeft, dark: phase.dark && !phase.over,
    over: phase.over, outcome: phase.over ? row.outcome ?? null : null, pct, mine,
  };
}

/** The bar as it stands: `{ ok, startedAt, endsAt, daysLeft, dark, over, outcome, pct, mine }` - `pct` null while the bar is dark. */
export async function sentinelStatus({ db: session, primary, nowS }, player) {
  const db = primary ?? session;
  const { row, phase } = await readEvent(db, nowS);
  const today = player?.id ? await givenToday(db, player.id, Math.floor(nowS / DAY_S)) : 0;
  return shape(row, phase, await mineOf(db, player, today));
}

/** A gift: `{ side, n }` - n pieces of arms and armor for a side. Answers the bar after it with `taken`
 *  (what the day's cap let through). Each piece pays tokens by being counted in `sentinel_given`. */
export async function sentinelGive({ db: session, primary, nowS }, player, body) {
  const db = primary ?? session;
  const side = cleanSide(body?.side), n = cleanGive(body?.n);
  if (!player?.id || !side || !n) return { error: 'sentinel-bad' };
  const { phase } = await readEvent(db, nowS);
  if (phase.over) return { error: 'sentinel-over' };
  const day = Math.floor(nowS / DAY_S);
  const used = await givenToday(db, player.id, day);
  const take = Math.min(n, SENTINEL_DAILY_CAP - used);
  if (take <= 0) return { error: 'sentinel-cap' };
  await db.prepare('INSERT OR IGNORE INTO sentinel_gifts (account, day, n) VALUES (?1, ?2, 0)').bind(player.id, day).run();
  const res = await db.prepare('UPDATE sentinel_gifts SET n = n + ?3 WHERE account = ?1 AND day = ?2 AND n + ?3 <= ?4').bind(player.id, day, take, SENTINEL_DAILY_CAP).run();
  if (!(res?.meta?.changes > 0)) return { error: 'busy' };
  // two fixed statements, so no word of the player's ever reaches the SQL
  const sql = side === 'stay' ? 'UPDATE sentinel_event SET stay_pts = stay_pts + ? WHERE id = 1' : 'UPDATE sentinel_event SET leave_pts = leave_pts + ? WHERE id = 1';
  await db.prepare(sql).bind(take).run();
  await db.prepare('UPDATE players SET sentinel_given = sentinel_given + ?2, last_seen = ?3 WHERE id = ?1').bind(player.id, take, nowS).run();
  const after = await readEvent(db, nowS);
  return { ...shape(after.row, after.phase, await mineOf(db, player, used + take)), taken: take };
}

/** A buy in the event shop: `{ offer }` - an id from SENTINEL_OFFERS. The tokens are taken in one guarded write (the balance
 *  must still cover the price), then the offer is answered so the game can mint it: `{ ok, offer, mine }`. The shop stays
 *  open after the month: the tokens are the donors' to spend. */
export async function sentinelBuy({ db: session, primary, nowS }, player, body) {
  const db = primary ?? session;
  const offer = sentinelOfferById(body?.offer);
  if (!player?.id || !offer) return { error: 'sentinel-bad' };
  const res = await db.prepare('UPDATE players SET sentinel_spent = sentinel_spent + ?2, last_seen = ?3 WHERE id = ?1 AND sentinel_given * ?4 - sentinel_spent >= ?2')
    .bind(player.id, offer.price, nowS, SENTINEL_TOKENS_PER_PIECE).run();
  if (!(res?.meta?.changes > 0)) return { error: 'sentinel-short', mine: await mineOf(db, player, await givenToday(db, player.id, Math.floor(nowS / DAY_S))) };
  return { ok: true, offer: offer.id, mine: await mineOf(db, player, await givenToday(db, player.id, Math.floor(nowS / DAY_S))) };
}
