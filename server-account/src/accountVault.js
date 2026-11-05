// @ts-check
// BUNNYFALL (2026-11-05, Phase 5: "a way for characters on the same account to access shared items and gold"): THE ACCOUNT
// VAULT, as the service keeps it. A shelf of pieces and a purse, the account's own - every character of the account reaches
// them at a bank (src/ui/accountVaultWindow.js). It is the guild vault's law (guildVault.js) with one owner:
//   - a piece moves on a REALM RECORD, in the vault's own batch (prepareRealmRecord's guard rolls both back or lands both),
//     by the trade's own law (takeTradeGoods): what may leave a pack - never what is worn, a quest's, summoned, BOUND to its
//     character, a boat's, or the Materials Bag;
//   - gold moves the same way, the record's own purse (payFromSave / creditSave) against `players.vault_gold`;
//   - a realm character's alone: only a realm record is the service's to move.
// EVERY CLOCK IS AN ARGUMENT, as in accounts.js.
import { displayName, overRate } from './accounts.js';
import { prepareRealmRecord, realmActFirst, recordMovedOf, mustChange, dropObjects, dropIfUnnamed, REALM_ID_RE } from './realm.js';
import { takeTradeGoods, giveTradeGoods, recordCount, REALM_TRADE_RECORD_MAX } from '../../src/net/realm/realmTradeLaw.js';
import { payFromSave, creditSave } from '../../src/net/realm/realmGoldLaw.js';
import { wagonItemName } from '../../src/systems/wagon/wagonKinds.js';
import { lawfulItem } from '../../src/systems/item/itemLaw.js';

/** The shelves' count, the purse's ceiling, one act's gold, the acts allowed a minute. */
export const ACCOUNT_VAULT_SLOTS = 60;
export const ACCOUNT_VAULT_GOLD_MAX = 100_000_000;
export const ACCOUNT_VAULT_MOVE_MAX = 1_000_000;
const OPS_MAX = 30, OPS_WINDOW_S = 60;
const spend = (/** @type {any} */ ctx, /** @type {any} */ player) => overRate(ctx, `avault:${player.id}`, OPS_MAX, OPS_WINDOW_S);
const pieceName = (/** @type {any} */ rec) => String(wagonItemName(rec) ?? rec?.name ?? 'an item').slice(0, 64);
const parse = (/** @type {string} */ t) => { try { return JSON.parse(t); } catch { return null; } };

/** THE VAULT: every slot's piece (its record, name, count, which character put it, when), the shelves' count, the purse. */
export async function accountVaultOf({ db }, player) {
  const { results: rows = [] } = await db.prepare('SELECT slot, rec, name, count, dep_name, at FROM account_vault WHERE player_id = ? ORDER BY slot').bind(player.id).all();
  const me = await db.prepare('SELECT vault_gold FROM players WHERE id = ?').bind(player.id).first();
  return {
    ok: true,
    vault: {
      max: ACCOUNT_VAULT_SLOTS,
      gold: Number(me?.vault_gold) || 0,
      items: rows.map((r) => ({ slot: Number(r.slot), rec: parse(r.rec), name: r.name, count: Number(r.count), by: r.dep_name, at: Number(r.at) })),
    },
  };
}

/** PUT A PIECE IN: `{ character, realm, pick, item, count }` (the guild vault's put, one owner). Refusals: `avault-full`,
 *  `vault-goods`, `avault-moved` and the realm's own. */
export async function accountVaultPut(ctx, player, { character, realm = null, pick, item, count = null } = {}) {
  const { db, bucket, nowS } = ctx;
  if (typeof character !== 'string' || !REALM_ID_RE.test(character)) return { error: 'realm-only' };
  const side = await realmActFirst(db, player.id, character, realm);
  if (side.error) return side;
  if (!side.at) return { error: 'realm-needed' };
  if (!item || typeof item !== 'object' || Array.isArray(item) || !Number.isSafeInteger(pick) || pick < 0) return { error: 'bad-vault-item' };
  const n = count == null ? recordCount(item) : count;
  if (!Number.isSafeInteger(n) || n < 1 || n > recordCount(item)) return { error: 'bad-vault-count' };
  if (await spend(ctx, player)) return { error: 'guild-rate' };
  const { results: held = [] } = await db.prepare('SELECT slot FROM account_vault WHERE player_id = ?').bind(player.id).all();
  const taken = new Set(held.map((r) => Number(r.slot)));
  let slot = -1;
  for (let i = 0; i < ACCOUNT_VAULT_SLOTS; i++) if (!taken.has(i)) { slot = i; break; }
  if (slot < 0) return { error: 'avault-full' };
  /** @type {any} */
  let piece = null;
  const offered = { ...item, stackCount: n };
  const prep = await prepareRealmRecord(ctx, player.id, side.at, (save) => {
    const moved = takeTradeGoods(save, { items: [offered], gold: 0 }, [pick]);
    if (!moved || moved.length !== 1) return 'vault-goods';
    piece = moved[0];
    return JSON.stringify(piece).length > REALM_TRADE_RECORD_MAX ? 'vault-goods' : null;
  }, { outbound: true, escrow: true });
  if ('error' in prep) return prep;
  const who = displayName(player);
  try {
    await db.batch([
      ...prep.steps,
      db.prepare(`INSERT INTO account_vault (player_id, slot, rec, name, count, dep_char, dep_name, at)
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 WHERE (SELECT COUNT(*) FROM account_vault WHERE player_id = ?1) < ${ACCOUNT_VAULT_SLOTS}`)
        .bind(player.id, slot, JSON.stringify(piece), pieceName(piece), recordCount(piece), character, who, nowS),
      mustChange(db),
    ]);
  } catch {
    await dropIfUnnamed(db, bucket, player.id, side.at.id, prep.key);
    const moved = await recordMovedOf(db, player.id, side.at);
    if (moved) return moved;
    const used = Number((await db.prepare('SELECT COUNT(*) AS n FROM account_vault WHERE player_id = ?').bind(player.id).first())?.n ?? 0);
    return { error: used >= ACCOUNT_VAULT_SLOTS ? 'avault-full' : 'avault-moved' };
  }
  await dropObjects(bucket, [prep.prev]);
  return { ok: true, slot, item: piece, realm: { seq: prep.seq } };
}

/** TAKE A PIECE OUT: `{ character, realm, slot, count, at }` - the slot's piece (or `count` of its stack) into the taker's
 *  record; `at` when the slot was read, so a slot emptied and filled again is never the one taken. */
export async function accountVaultTake(ctx, player, { character, realm = null, slot, count = null, at = null } = {}) {
  const { db, bucket, nowS } = ctx;
  if (typeof character !== 'string' || !REALM_ID_RE.test(character)) return { error: 'realm-only' };
  const side = await realmActFirst(db, player.id, character, realm);
  if (side.error) return side;
  if (!side.at) return { error: 'realm-needed' };
  if (!Number.isSafeInteger(slot) || slot < 0 || slot >= ACCOUNT_VAULT_SLOTS) return { error: 'bad-vault-slot' };
  const row = await db.prepare('SELECT * FROM account_vault WHERE player_id = ? AND slot = ?').bind(player.id, slot).first();
  if (!row || (at != null && Number(row.at) !== at)) return { error: row ? 'avault-moved' : 'avault-empty' };
  const have = Number(row.count);
  const n = count == null ? have : count;
  if (!Number.isSafeInteger(n) || n < 1 || n > have) return { error: 'bad-vault-count' };
  if (await spend(ctx, player)) return { error: 'guild-rate' };
  const rec = parse(row.rec);
  if (!rec || typeof rec !== 'object') return { error: 'avault-empty' };
  if (!lawfulItem(rec)) return { error: 'vault-goods' };
  const give = { ...rec };
  if (rec.stackCount !== undefined || n > 1) give.stackCount = n;
  const left = have - n;
  const rest = left > 0 ? { ...rec, stackCount: left } : null;
  const prep = await prepareRealmRecord(ctx, player.id, side.at, (save) => { giveTradeGoods(save, [give], 0); return null; });
  if ('error' in prep) return prep;
  try {
    await db.batch([
      ...prep.steps,
      rest
        ? db.prepare('UPDATE account_vault SET rec = ?4, count = ?5 WHERE player_id = ?1 AND slot = ?2 AND at = ?3 AND count = ?6 AND rec = ?7').bind(player.id, slot, Number(row.at), JSON.stringify(rest), left, have, row.rec)
        : db.prepare('DELETE FROM account_vault WHERE player_id = ?1 AND slot = ?2 AND at = ?3 AND count = ?4 AND rec = ?5').bind(player.id, slot, Number(row.at), have, row.rec),
      mustChange(db),
    ]);
  } catch {
    await dropIfUnnamed(db, bucket, player.id, side.at.id, prep.key);
    const moved = await recordMovedOf(db, player.id, side.at);
    if (moved) return moved;
    return { error: 'avault-moved' };
  }
  await dropObjects(bucket, [prep.prev]);
  void nowS;
  return { ok: true, slot, item: give, left, realm: { seq: prep.seq } };
}

/** GOLD IN OR OUT: `{ character, realm, gold, kind: 'deposit' | 'withdraw', region, letter }`. The record pays or is paid in
 *  the purse's own batch, each guarded; both or neither. */
export async function accountVaultGold(ctx, player, { character, realm = null, gold, kind, region = null, letter = false } = {}) {
  const { db, bucket } = ctx;
  if (typeof character !== 'string' || !REALM_ID_RE.test(character)) return { error: 'realm-only' };
  const side = await realmActFirst(db, player.id, character, realm);
  if (side.error) return side;
  if (!side.at) return { error: 'realm-needed' };
  if (kind !== 'deposit' && kind !== 'withdraw') return { error: 'bad-gold' };
  if (!Number.isSafeInteger(gold) || gold < 1 || gold > ACCOUNT_VAULT_MOVE_MAX) return { error: 'bad-gold' };
  if (await spend(ctx, player)) return { error: 'guild-rate' };
  const dep = kind === 'deposit';
  const prep = await prepareRealmRecord(ctx, player.id, side.at, (save) => (dep
    ? (payFromSave(save, gold, region) ? null : 'realm-gold')
    : (creditSave(save, gold, { letter }) ? null : 'bad-gold')), { outbound: dep });
  if ('error' in prep) return prep;
  const move = dep
    ? db.prepare('UPDATE players SET vault_gold = vault_gold + ?1 WHERE id = ?2 AND vault_gold + ?1 <= ?3').bind(gold, player.id, ACCOUNT_VAULT_GOLD_MAX)
    : db.prepare('UPDATE players SET vault_gold = vault_gold - ?1 WHERE id = ?2 AND vault_gold >= ?1').bind(gold, player.id);
  try {
    await db.batch([...prep.steps, move, mustChange(db)]);
  } catch {
    await dropIfUnnamed(db, bucket, player.id, side.at.id, prep.key);
    const moved = await recordMovedOf(db, player.id, side.at);
    if (moved) return moved;
    return { error: dep ? 'avault-gold-full' : 'avault-gold-short' };
  }
  await dropObjects(bucket, [prep.prev]);
  const me = await db.prepare('SELECT vault_gold FROM players WHERE id = ?').bind(player.id).first();
  return { ok: true, gold: Number(me?.vault_gold) || 0, realm: { seq: prep.seq } };
}
