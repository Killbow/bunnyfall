// BUNNYFALL (2026-11-26, caverns): A DRILL'S HAUL, PAID - the account service's half of the drill (the spec's sections 5
// and 7). The relay signed what a drill's setter took from its hopper (src/net/mine/mineReceipt.js); this verifies the
// signature with the relay's public half (the gate's key, as the arena's receipts), checks the haul is the caller's,
// keeps it once (`mine_hauls`, migration 0221: one row a receipt, whoever carries it twice), holds the account to
// MINE_HAULS_PER_DAY pieces a day, and pays the ore into the character's Stores as its own.
import { verifyMineReceipt, mineReceiptId } from '../../src/net/mine/mineReceipt.js';
import { asks, shut } from './profShared.js';
import { STORES_MAX } from '../../src/net/professionLaw.js';

/** The most drill ore an account banks in a UTC day (a few full shifts). */
export const MINE_HAULS_PER_DAY = 400;

/**
 * @param {{ db: any, nowS: number, subtle: SubtleCrypto }} ctx
 * @param {any} player
 * @param {any} env
 * @param {{ receipt?: unknown, character?: unknown }} body
 * @param {CryptoKey|null} publicKey
 */
export async function claimMineHaul(ctx, player, env, body, publicKey) {
  const { db, nowS, subtle } = ctx;
  const refused = asks(player, { character: body?.character, rid: null, needRid: false }) ?? shut(player, env);
  if (refused) return refused;
  if (!publicKey) return { error: 'no-gate-key' };
  const v = await verifyMineReceipt(body.receipt, publicKey, { subtle, nowS });
  if (!v.ok) return { error: 'receipt', why: v.why };
  const c = v.claims;
  if (c.u !== player.id) return { error: 'not-yours' };
  const day = Math.floor(nowS / 86400);
  const today = Number((await db.prepare('SELECT COALESCE(SUM(n), 0) AS n FROM mine_hauls WHERE player = ?1 AND day = ?2').bind(player.id, day).first())?.n ?? 0);
  const n = Math.max(0, Math.min(c.n, MINE_HAULS_PER_DAY - today));
  if (n <= 0) return { error: 'day-full' };
  const id = mineReceiptId(c), nonce = crypto.randomUUID();   // this request's own: the Stores' write pays only the row it made
  // the row and the Stores in one batch: the row's INSERT OR IGNORE decides, the Stores' write pays only where it took
  const [took] = await db.batch([
    db.prepare('INSERT OR IGNORE INTO mine_hauls (id, player, char_id, ore, n, day, at, nonce) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)').bind(id, player.id, body.character, c.o, n, day, nowS, nonce),
    db.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty)
      SELECT player, char_id, ore, 'own', n FROM mine_hauls WHERE id = ?1 AND player = ?2 AND nonce = ?3
      ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = MIN(?4, prof_stores.qty + excluded.qty)`).bind(id, player.id, nonce, STORES_MAX),
  ]);
  if (!took?.meta?.changes) return { paid: 0, why: 'claimed' };
  return { paid: n, ore: c.o, ...(n < c.n ? { capped: true } : {}) };
}
