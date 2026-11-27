// @ts-check
// Settles a realm trade: both characters' records move in one batch, or neither does.

import { REALM_ID_RE, LEASE_RE, mintObjectKey, dropObjects, dropIfUnnamed, realmSaveTextOf, holdRefusal } from './realm.js';
import { wealthOf, ledgerPieces, classicCount } from './judge.js';
import { piecesRefusal, ledgerMoves, leavingKeys } from './ledger.js';
import { REALM_TEXT_MAX_BYTES } from '../../src/net/realmSaveCodec.js';
import { realmTradeHalfOf, halvesAgree, settleRealmTrade, REALM_TRADE_SID_RE, REALM_TRADE_TTL_S } from '../../src/net/realmTradeLaw.js';
import { canon } from '../../src/net/canon.js';

export const REALM_TRADE_BODY_MAX = 32 * 1024;
export const REALM_TRADE_KEEP_S = 7 * 24 * 3600;

const utf8Bytes = (/** @type {string} */ s) => new TextEncoder().encode(s).byteLength;

// Only the exact half that made the trade reads its outcome, since peers may reuse a sid for a later trade.
/** @param {any} t @param {string} playerId @param {{ id: string, seq: number, half: any }} asker */
function outcomeFor(t, playerId, { id, seq, half }) {
  const said = canon(half);
  const side = t.a_player === playerId && t.a_char === id && t.a_seq === seq && t.a_half === said ? 'a'
    : t.b_player === playerId && t.b_char === id && t.b_seq === seq && t.b_half === said ? 'b' : null;
  if (!side) return { error: 'trade-spent' };
  if (t.state === 'refused') {
    const m = /^(trade-held|record-unjudged):([ab])$/.exec(t.why ?? '');
    return m ? { state: 'refused', why: m[1], held: m[2] === side ? 'mine' : 'theirs' } : { state: 'refused', why: t.why ?? 'refused' };
  }
  let result = null;
  try { result = JSON.parse(t.result); } catch { result = null; }
  const mine = result?.[side];
  return mine ? { state: 'done', seq: mine.seq, items: mine.items, gold: mine.gold } : { error: 'server' };
}

// Refuses only a waiting trade, so a refusal that races a settle loses to it.
async function refuse(/** @type {any} */ db, /** @type {string} */ sid, /** @type {string} */ why, /** @type {string} */ playerId, /** @type {{ id: string, seq: number, half: any }} */ asker, /** @type {boolean} */ second) {
  await db.prepare("UPDATE realm_trades SET state = 'refused', why = ?, b_player = COALESCE(b_player, ?), b_char = COALESCE(b_char, ?), b_seq = COALESCE(b_seq, ?), b_half = COALESCE(b_half, ?) WHERE sid = ? AND state = 'waiting'")
    .bind(why, second ? playerId : null, second ? asker.id : null, second ? asker.seq : null, second ? canon(asker.half) : null, sid).run();
  const t = await db.prepare('SELECT * FROM realm_trades WHERE sid = ?').bind(sid).first();
  return t ? outcomeFor(t, playerId, asker) : { error: 'server' };
}

/** @param {any} ctx @param {string} playerId @param {any} body */
export async function tradeRealm({ db, bucket, rand, nowS }, playerId, body) {
  if (!bucket) return { error: 'no-storage' };
  const { id, lease, seq, sid } = body ?? {};
  if (typeof id !== 'string' || !REALM_ID_RE.test(id) || typeof lease !== 'string' || !LEASE_RE.test(lease)) return { error: 'body' };
  if (!Number.isSafeInteger(seq) || seq < 1 || typeof sid !== 'string' || !REALM_TRADE_SID_RE.test(sid)) return { error: 'body' };
  const half = realmTradeHalfOf(body);
  if (!half) return { error: 'body' };

  const asker = { id, seq, half };

  // Read the caller's record before the trade row: a settle moves both in one batch, so the later row read sees it.
  const row = await db.prepare('SELECT seq, lease, bytes, obj, prev, held, judged_seq, clean_obj FROM realm_characters WHERE id = ? AND player = ?').bind(id, playerId).first();
  if (!row) return { error: 'no-realm-character' };
  if (row.lease !== lease) return { error: 'lease' };
  // A settled trade answers its halves before the sequence check, because the settle moved the record on.
  let t = await db.prepare('SELECT * FROM realm_trades WHERE sid = ?').bind(sid).first();
  if (t && t.state !== 'waiting') return outcomeFor(t, playerId, asker);
  if (row.seq !== seq || !row.bytes || !row.obj) return { error: 'seq', seq: row.seq };

  if (!t) {
    await db.prepare('DELETE FROM realm_trades WHERE created_at < ?').bind(nowS - REALM_TRADE_KEEP_S).run();
    // A character keeps one waiting half: a new sid replaces any older one in the same batch.
    const [, put] = await db.batch([
      db.prepare("DELETE FROM realm_trades WHERE a_player = ? AND a_char = ? AND state = 'waiting' AND sid != ?").bind(playerId, id, sid),
      db.prepare(
        "INSERT INTO realm_trades (sid, a_player, a_char, a_lease, a_seq, a_half, state, created_at) VALUES (?, ?, ?, ?, ?, ?, 'waiting', ?)"
        + ' ON CONFLICT (sid) DO NOTHING',
      ).bind(sid, playerId, id, lease, seq, canon(half), nowS),
    ]);
    if (put.meta.changes) return { state: 'waiting' };
    t = await db.prepare('SELECT * FROM realm_trades WHERE sid = ?').bind(sid).first();
    if (!t) return { error: 'server' };
    if (t.state !== 'waiting') return outcomeFor(t, playerId, asker);
  }
  const first = t.a_player === playerId && t.a_char === id;
  if (first ? t.a_seq !== seq || t.a_half !== canon(half) : t.a_player === playerId) return { error: 'trade-spent' };
  if (nowS - t.created_at > REALM_TRADE_TTL_S) return refuse(db, sid, 'expired', playerId, asker, !first);
  if (first) return { state: 'waiting' };

  let firstHalf = null;
  try { firstHalf = realmTradeHalfOf(JSON.parse(t.a_half)); } catch { firstHalf = null; }
  if (!firstHalf || !halvesAgree(firstHalf, half)) return refuse(db, sid, 'mismatch', playerId, asker, true);
  const other = await db.prepare('SELECT seq, lease, obj, prev, held, judged_seq, clean_obj FROM realm_characters WHERE id = ? AND player = ?').bind(t.a_char, t.a_player).first();
  if (!other || other.lease !== t.a_lease || other.seq !== t.a_seq || !other.obj) return refuse(db, sid, 'moved', playerId, asker, true);
  const gives = (/** @type {any} */ h) => h.give.items.length > 0 || h.give.gold > 0;
  const heldA = gives(firstHalf) ? holdRefusal(other) : null;
  const heldBy = heldA ?? (gives(half) ? holdRefusal(row) : null);
  if (heldBy) return refuse(db, sid, `${heldBy.error}:${heldA ? 'a' : 'b'}`, playerId, asker, true);

  // Goods come from each record's last checkpoint, never from what the client sent.
  const [objA, objB] = await Promise.all([bucket.get(other.obj), bucket.get(row.obj)]);
  let saveA = null, saveB = null;
  try { saveA = JSON.parse(await realmSaveTextOf(objA)); saveB = JSON.parse(await realmSaveTextOf(objB)); } catch { saveA = saveB = null; }
  if (!saveA || !saveB || typeof saveA !== 'object' || typeof saveB !== 'object') return refuse(db, sid, 'no-data', playerId, asker, true);
  const s = settleRealmTrade(saveA, saveB, firstHalf, half);
  if (!s.ok) return refuse(db, sid, s.why ?? 'goods', playerId, asker, true);
  const piecesA = [ledgerPieces(saveA), ledgerPieces(s.a)], piecesB = [ledgerPieces(saveB), ledgerPieces(s.b)];
  const leftA = leavingKeys(...piecesA), leftB = leavingKeys(...piecesB);
  const why = (classicCount(s.a) < classicCount(saveA) || classicCount(s.b) < classicCount(saveB) ? 'piece-legacy' : null)
    ?? (leftA.twice.length || leftB.twice.length ? 'piece-dupe' : null)
    ?? (await piecesRefusal(db, t.a_char, leftA.leaving)) ?? (await piecesRefusal(db, id, leftB.leaving));
  if (why) return refuse(db, sid, why, playerId, asker, true);
  const movedA = wealthOf(s.a) - wealthOf(saveA), movedB = wealthOf(s.b) - wealthOf(saveB);
  const textA = JSON.stringify(s.a), textB = JSON.stringify(s.b);
  const bytesA = utf8Bytes(textA), bytesB = utf8Bytes(textB);
  if (bytesA > REALM_TEXT_MAX_BYTES || bytesB > REALM_TEXT_MAX_BYTES) return refuse(db, sid, 'too-large', playerId, asker, true);

  const keyA = mintObjectKey(rand, t.a_player, t.a_char, t.a_seq + 1);
  const keyB = mintObjectKey(rand, playerId, id, seq + 1);
  await bucket.put(keyA, textA);
  await bucket.put(keyB, textB);
  const result = JSON.stringify({ a: { seq: t.a_seq + 1, ...s.toA }, b: { seq: seq + 1, ...s.toB } });
  const move = (/** @type {any} */ r) => `UPDATE realm_characters SET seq = ?1, bytes = ?2, obj = ?3, prev = obj, updated_at = ?4, witnessed = witnessed + ?5, svc_seq = ?1${r.clean_obj != null && r.clean_obj === r.obj ? ', clean_obj = ?3, clean_seq = ?1' : ''}
    WHERE id = ?6 AND player = ?7 AND lease = ?8 AND seq = ?9`;
  const movesA = ledgerMoves(db, { player: t.a_player, char: t.a_char, seq: t.a_seq + 1, nowS }, piecesA[0], piecesA[1], { from: playerId });
  const movesB = ledgerMoves(db, { player: playerId, char: id, seq: seq + 1, nowS }, piecesB[0], piecesB[1], { from: t.a_player });
  try {
    await db.batch([
      db.prepare(move(other)).bind(t.a_seq + 1, bytesA, keyA, nowS, movedA, t.a_char, t.a_player, t.a_lease, t.a_seq),
      db.prepare(move(row)).bind(seq + 1, bytesB, keyB, nowS, movedB, id, playerId, lease, seq),
      ...movesA.left, ...movesB.left, ...movesA.entered, ...movesB.entered,
      db.prepare("UPDATE realm_trades SET state = 'done', result = ?, b_player = ?, b_char = ?, b_seq = ?, b_half = ? WHERE sid = ? AND state = 'waiting'").bind(result, playerId, id, seq, canon(half), sid),
      db.prepare(
        // The guard row fails its CHECK unless both records and the trade moved, which rolls back the batch.
        'INSERT INTO realm_tx_guard (moved, expected) SELECT n, 3 FROM (SELECT'
        + ' (SELECT COUNT(*) FROM realm_characters WHERE (id = ? AND obj = ? AND lease = ?) OR (id = ? AND obj = ? AND lease = ?))'
        + " + (SELECT COUNT(*) FROM realm_trades WHERE sid = ? AND state = 'done' AND b_char = ?) AS n) WHERE n != 3",
      ).bind(t.a_char, keyA, t.a_lease, id, keyB, lease, sid, id),
    ]);
  } catch {
    // The batch may have committed with its answer lost, so an object is dropped only when no row names it.
    await dropIfUnnamed(db, bucket, t.a_player, t.a_char, keyA);
    await dropIfUnnamed(db, bucket, playerId, id, keyB);
    return refuse(db, sid, 'moved', playerId, asker, true);
  }
  await dropObjects(bucket, [other.prev === other.clean_obj ? null : other.prev, row.prev === row.clean_obj ? null : row.prev]);
  return { state: 'done', seq: seq + 1, items: s.toB.items, gold: s.toB.gold };
}
