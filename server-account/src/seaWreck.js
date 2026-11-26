// @ts-check
// A prize is pieces taken off the wrecked captain's record and held here until the killer collects them or the
// captain reclaims them, so no piece is made or lost.
import { verifySeaWreck, SEA_WRECK_GRACE_S } from '../../src/net/wildReceipt.js';
import { prepareRealmRecord, seizeRealmRecord, realmActFirst, realmAtOf, recordMovedOf, mustChange, dropIfUnnamed, dropObjects, realmSaveTextOf, holdRefusal } from './realm.js';
import { piecesBarred, knownCopySteps } from './ledger.js';
import { ledgerKeyOf } from './judge.js';
import { seaKillSteps } from './seaBounty.js';
import { giveTradeGoods } from '../../src/net/realmTradeLaw.js';
import { seaHoldOf, seaPrizePlaces, takeSeaPrize, seaPrizeTook, SEA_PRIZE_HOLD_S } from '../../src/net/sea/seaPrizeLaw.js';

export const SEA_PRIZE_ROWS = 32;
const parse = (/** @type {any} */ t) => { try { return JSON.parse(t); } catch { return null; } };

/** @param {any} ctx @param {any} player @param {any} body @param {{ gateKey: CryptoKey | null }} keys
 * @param {boolean} [again] */
export async function seaWreck(ctx, player, body, { gateKey }, again = false) {
  if (!gateKey) return { error: 'no-gate-key' };
  const v = await verifySeaWreck(body?.receipt, gateKey, { subtle: ctx.subtle, nowS: ctx.nowS });
  if (!v.ok) return { error: 'receipt', why: v.why };
  const c = v.claims;
  if (player.id !== c.f && player.id !== c.k) return { error: 'not-yours' };
  const seize = player.id === c.k;
  const at = seize ? null : realmAtOf(body?.realm);
  if (!seize && (!at || at.id !== c.c)) return { error: at ? 'not-yours' : 'no-realm-character' };
  const had = await ctx.db.prepare('SELECT boarded, took, seq FROM sea_wrecks WHERE r = ?1').bind(c.r).first();
  if (!had && seize && ctx.nowS < c.i + SEA_WRECK_GRACE_S) return { error: 'grace' };
  if (had) {
    const took = parse(had.took) ?? [];
    // A repeat returns took only to a tab from before the take, since a newer tab never held the pieces.
    const before = !!at && took.length > 0 && Number.isSafeInteger(had.seq) && at.seq < had.seq;
    const now = before ? await ctx.db.prepare('SELECT seq, lease FROM realm_characters WHERE id = ?1 AND player = ?2 AND dead_at IS NULL').bind(c.c, c.f).first() : null;
    return { r: c.r, b: had.boarded, took: before ? took : [], n: took.length, again: true, ...(now && now.lease === at?.lease ? { realm: { seq: now.seq } } : {}) };
  }
  const row = await ctx.db.prepare('SELECT obj, held, judged_seq FROM realm_characters WHERE id = ?1 AND player = ?2 AND dead_at IS NULL').bind(c.c, c.f).first();
  if (!row?.obj || !ctx.bucket) return { error: 'no-realm-character' };
  let barred = new Set();
  const prize = c.b === 1 && !holdRefusal(row);
  if (prize) {
    let stored = null;
    try { stored = JSON.parse(/** @type {string} */ (await realmSaveTextOf(await ctx.bucket.get(row.obj)))); } catch { stored = null; }
    if (!stored || typeof stored !== 'object') return { error: 'no-data' };
    barred = await piecesBarred(ctx.db, c.c, (seaHoldOf(stored, c.u) ?? []).map(ledgerKeyOf).filter((k) => k != null));
  }
  const keep = (/** @type {any} */ it) => { const k = ledgerKeyOf(it); return k != null && barred.has(k); };
  /** @type {any[]} */ let taken = [];
  /** @type {Set<string>} */ const escrow = new Set();
  const change = (/** @type {any} */ save) => {
    taken = takeSeaPrize(save, c.u, seaPrizePlaces(seaHoldOf(save, c.u) ?? [], keep)) ?? [];
    for (const it of taken) { const k = ledgerKeyOf(it); if (k != null) escrow.add(k); }
    return null;
  };
  const moved = prize ? (seize ? await seizeRealmRecord(ctx, c.f, c.c, change, { escrow }) : await prepareRealmRecord(ctx, c.f, /** @type {any} */ (at), change, { escrow })) : null;
  if (moved?.error) return moved;
  if (moved && !taken.length) await dropIfUnnamed(ctx.db, ctx.bucket, c.f, c.c, moved.key);
  const took = seaPrizeTook(taken);
  const steps = [
    ...(moved && taken.length ? moved.steps : []),
    // Each taken piece is marked as a copy for the wrecked captain, so the killer gets the original.
    ...knownCopySteps(ctx.db, c.c, [...escrow], ctx.nowS),
    ctx.db.prepare('INSERT INTO sea_wrecks (r, victim, victim_char, killer, killer_char, boat, boarded, took, seq, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)')
      .bind(c.r, c.f, c.c, c.k, c.kc, c.u, c.b, JSON.stringify(took), moved && taken.length ? moved.seq : null, ctx.nowS),
    ...taken.map((it, i) => ctx.db.prepare("INSERT INTO sea_prizes (r, i, victim, victim_char, killer, killer_char, rec, at, until_s, state) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'held')")
      .bind(c.r, i, c.f, c.c, c.k, c.kc, JSON.stringify(it), ctx.nowS, ctx.nowS + SEA_PRIZE_HOLD_S)),
    ...seaKillSteps(ctx.db, { r: c.r, f: c.f, c: c.c, k: c.k, kc: c.kc, m: c.m }, ctx.nowS),
  ];
  try { await ctx.db.batch(steps); } catch (e) {
    if (moved && taken.length) await dropIfUnnamed(ctx.db, ctx.bucket, c.f, c.c, moved.key);
    const now = await ctx.db.prepare('SELECT 1 AS x FROM sea_wrecks WHERE r = ?1').bind(c.r).first();
    if (now && !again) return seaWreck(ctx, player, body, { gateKey }, true);
    if (at) { const m = await recordMovedOf(ctx.db, c.f, at); if (m) return m; }
    else if (moved && taken.length) return { error: 'seq' };
    throw e;
  }
  if (moved && taken.length) await dropObjects(ctx.bucket, [moved.prev]);
  return { r: c.r, b: c.b, took, n: taken.length, ...(moved && taken.length && !seize ? { realm: { seq: moved.seq } } : {}) };
}

/** @param {any} ctx @param {string} playerId @param {any} at @param {any[]} rows
 * @param {'collected' | 'returned'} state */
async function endPrizes(ctx, playerId, at, rows, state) {
  const items = rows.map((x) => parse(x.rec)).filter((it) => it && typeof it === 'object');
  if (items.length !== rows.length) return { error: 'sea-prize-moved' };
  const prep = await prepareRealmRecord(ctx, playerId, at, (save) => { giveTradeGoods(save, items, 0); return null; });
  if (prep.error) return prep;
  const which = rows.map((_, k) => `(r = ?${2 * k + 4} AND i = ?${2 * k + 5})`).join(' OR ');
  const settle = ctx.db.prepare(`UPDATE sea_prizes SET state = ?1, to_char = ?2, ended_at = ?3 WHERE state = 'held' AND (${which})`)
    .bind(state, at.id, ctx.nowS, ...rows.flatMap((x) => [x.r, x.i]));
  try {
    // Every row read must move once, so another end that landed first fails the whole batch.
    await ctx.db.batch([...prep.steps, settle, mustChange(ctx.db, rows.length)]);
  } catch {
    await dropIfUnnamed(ctx.db, ctx.bucket, playerId, at.id, prep.key);
    const moved = await recordMovedOf(ctx.db, playerId, at);
    if (moved) return moved;
    return { error: 'sea-prize-moved' };
  }
  await dropObjects(ctx.bucket, [prep.prev]);
  return { ok: true, items, realm: { seq: prep.seq } };
}

/** @param {any} ctx @param {any} player @param {any} body */
export async function seaPrizeCollect(ctx, player, { character, realm = null } = {}) {
  const side = await realmActFirst(ctx.db, player.id, character, realm);
  if (side.error) return side;
  if (!side.at) return { error: 'sea-prize-realm' };
  const rows = (await ctx.db.prepare("SELECT r, i, rec FROM sea_prizes WHERE killer = ?1 AND killer_char = ?2 AND state = 'held' AND until_s > ?3 ORDER BY at, r, i LIMIT ?4")
    .bind(player.id, character, ctx.nowS, SEA_PRIZE_ROWS).all()).results ?? [];
  if (!rows.length) return { ok: true, items: [] };
  return endPrizes(ctx, player.id, side.at, rows, 'collected');
}

/** @param {any} ctx @param {any} player @param {any} body */
export async function seaPrizeReclaim(ctx, player, { character, realm = null } = {}) {
  const side = await realmActFirst(ctx.db, player.id, character, realm);
  if (side.error) return side;
  if (!side.at) return { error: 'sea-prize-realm' };
  const rows = (await ctx.db.prepare("SELECT r, i, rec FROM sea_prizes WHERE victim = ?1 AND victim_char = ?2 AND state = 'held' AND until_s <= ?3 ORDER BY at, r, i LIMIT ?4")
    .bind(player.id, character, ctx.nowS, SEA_PRIZE_ROWS).all()).results ?? [];
  if (!rows.length) return { ok: true, items: [] };
  return endPrizes(ctx, player.id, side.at, rows, 'returned');
}
