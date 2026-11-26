// @ts-check
// The relay cannot call this service, so stakes travel through the player. A stake moves gold from the realm record
// into a held row and returns a signed order the relay seats once. A cash-out pays the relay's receipt back into
// the record and marks the row paid in the same batch, so each stake pays out once.
import { realmActFirst, prepareRealmRecord, mustChange, dropIfUnnamed, recordMovedOf, dropObjects } from './realm.js';
import { payFromSave, creditSave } from '../../src/net/realmGoldLaw.js';
import { regionOk } from '../../src/net/nodeLaw.js';
import { mintStakeOrder, STAKE_ROOM_RE } from '../../src/net/identityToken.js';
import { verifyCardReceipt, CARD_RECEIPT_TTL_S } from '../../src/net/cardReceipt.js';
import { HOLDEM_BBS, HOLDEM_STAKE_MIN_BB, HOLDEM_STAKE_MAX_BB, HOLDEM_TABLES_MAX, HOLDEM_TOPUP_MIN_BB, holdemGoldTable } from '../../src/net/holdemTable.js';
import { GAMBIT_STAKE_BB, gambitStakeOk } from '../../src/net/gambit/gambitStakes.js';

export const CARDS_RID_RE = /^[A-Za-z0-9_-]{8,40}$/;
const stakeIdOf = (rand) => { const b = new Uint8Array(10); rand(b); return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); };

const orderOf = (row, player, signingKey, subtle, nowS) => mintStakeOrder({ s: player.id, cj: row.id, cr: row.room, ct: Number(row.tbl), ca: Number(row.amount), cb: Number(row.bb) }, signingKey, { subtle, nowS });

/** @param {any} ctx @param {any} player @param {any} env @param {any} body @param {CryptoKey|null} signingKey */
export async function stakeCards(ctx, player, env, { character, realm = null, region, room, table, bb, amount, rid, topup = false } = {}, signingKey = null) {
  const { db, nowS, rand, subtle } = ctx;
  const side = await realmActFirst(db, player.id, character, realm);
  if (side.error) return side;
  if (!side.at) return { error: 'cards-realm' };
  if (!signingKey) return { error: 'cards-closed' };
  if (typeof rid !== 'string' || !CARDS_RID_RE.test(rid)) return { error: 'bad-rid' };
  const prior = await db.prepare('SELECT * FROM card_stakes WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  // A repeat returns the order minted at the stake's original time, so asking again never extends the sit window.
  if (prior) return prior.status === 'held' ? { ok: true, repeat: true, id: prior.id, amount: Number(prior.amount), stake: await orderOf(prior, player, signingKey, subtle, Number(prior.at)) } : { error: 'cards-stake-paid' };
  if (!regionOk(region)) return { error: 'bad-region' };
  if (typeof room !== 'string' || !STAKE_ROOM_RE.test(room)) return { error: 'bad-room' };
  if (!Number.isInteger(table) || table < 0 || table >= HOLDEM_TABLES_MAX) return { error: 'bad-table' };
  if (bb === GAMBIT_STAKE_BB) {
    if (!holdemGoldTable(table)) return { error: 'bad-table' };
    if (topup === true || !gambitStakeOk(amount)) return { error: 'bad-buy-in' };
  } else {
    if (!HOLDEM_BBS.includes(bb)) return { error: 'bad-stakes' };
    if (!Number.isSafeInteger(amount) || amount < (topup === true ? HOLDEM_TOPUP_MIN_BB : HOLDEM_STAKE_MIN_BB) * bb || amount > HOLDEM_STAKE_MAX_BB * bb) return { error: 'bad-buy-in' };
  }
  const id = stakeIdOf(rand);
  const prep = await prepareRealmRecord(ctx, player.id, side.at, (save) => (payFromSave(save, amount, region) ? null : 'realm-gold'), { outbound: true });
  if (prep.error) return prep;
  try {
    await db.batch([
      ...prep.steps,
      db.prepare(`INSERT INTO card_stakes (id, player, char_id, rid, room, tbl, bb, amount, status, at, region) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'held', ?9, ?10)`)
        .bind(id, player.id, character, rid, room, table, bb, amount, nowS, region),
    ]);
  } catch {
    await dropIfUnnamed(db, ctx.bucket, player.id, side.at.id, prep.key);
    const moved = await recordMovedOf(db, player.id, side.at);
    if (moved) return moved;
    return { error: 'cards-stake-failed' };
  }
  await dropObjects(ctx.bucket, [prep.prev]);
  const row = { id, room, tbl: table, amount, bb };
  return { ok: true, id, amount, stake: await orderOf(row, player, signingKey, subtle, nowS), realm: { seq: prep.seq } };
}

/** @param {any} ctx @param {any} player @param {any} env @param {any} body @param {CryptoKey|null} publicKey */
export async function cashoutCards(ctx, player, env, { character, realm = null, receipt } = {}, publicKey = null) {
  const { db, nowS, subtle } = ctx;
  if (!publicKey) return { error: 'no-gate-key' };
  // Receipts of any age are accepted because the paid row, not the receipt's age, stops a second payout.
  const v = await verifyCardReceipt(receipt, publicKey, { subtle, nowS, anyAge: true });
  if (!v.ok) return { error: 'cards-receipt', why: v.why };
  const c = v.claims;
  if (c.s !== player.id) return { error: 'cards-not-yours' };
  const row = await db.prepare('SELECT * FROM card_stakes WHERE id = ?1 AND player = ?2').bind(c.j, player.id).first();
  if (!row) return { error: 'cards-no-stake' };
  if (row.char_id !== character) return { error: 'cards-other-character' };
  // Check the realm record before the repeat answer, so a cash-out that landed but lost its answer syncs first.
  const side = await realmActFirst(db, player.id, character, realm);
  if (side.error) return side;
  if (!side.at) return { error: 'cards-realm' };
  if (row.status === 'paid') return { ok: true, repeat: true, gold: Number(row.paid ?? 0) };
  if ((c.w === 'refused' || c.w === 'void') && c.r !== Number(row.amount)) return { error: 'cards-receipt', why: 'sum' };
  // A seat leaves with no more than every stake brought to its table during the receipt's life, since one
  // player's re-buy becomes another player's chips.
  const into = await db.prepare(`SELECT COALESCE(SUM(amount), 0) AS n FROM card_stakes WHERE room = ?1 AND tbl = ?2 AND bb = ?3 AND at <= ?4 AND at >= ?5`)
    .bind(row.room, row.tbl, row.bb, c.i, c.i - CARD_RECEIPT_TTL_S).first();
  if (c.r > Number(into?.n ?? 0)) return { error: 'cards-receipt', why: 'sum' };
  if (Number(row.bb) === GAMBIT_STAKE_BB && c.r > 2 * Number(row.amount)) return { error: 'cards-receipt', why: 'sum' };
  const home = Number(row.region);
  if (!regionOk(home)) return { error: 'bad-region' };
  const settle = db.prepare(`UPDATE card_stakes SET status = 'paid', paid = ?3, paid_at = ?4 WHERE id = ?1 AND player = ?2 AND status = 'held'`).bind(c.j, player.id, c.r, nowS);
  if (c.r === 0) {
    const done = await db.batch([settle, mustChange(db)]).then(() => true, () => false);
    if (done) return { ok: true, gold: 0 };
    const now = await db.prepare('SELECT status FROM card_stakes WHERE id = ?1').bind(c.j).first();
    return now?.status === 'paid' ? { ok: true, repeat: true, gold: 0 } : { error: 'cards-cashout-failed' };
  }
  const prep = await prepareRealmRecord(ctx, player.id, side.at, (save) => (creditSave(save, c.r, { bank: home }) ? null : 'bad-gold'));
  if (prep.error) return prep;
  try {
    await db.batch([...prep.steps, settle, mustChange(db)]);
  } catch {
    await dropIfUnnamed(db, ctx.bucket, player.id, side.at.id, prep.key);
    const moved = await recordMovedOf(db, player.id, side.at);
    if (moved) return moved;
    const now = await db.prepare('SELECT status, paid FROM card_stakes WHERE id = ?1').bind(c.j).first();
    return now?.status === 'paid' ? { ok: true, repeat: true, gold: Number(now.paid ?? 0) } : { error: 'cards-cashout-failed' };
  }
  await dropObjects(ctx.bucket, [prep.prev]);
  return { ok: true, gold: c.r, realm: { seq: prep.seq } };
}
