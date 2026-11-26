// @ts-check

import { verifyKetchReceipt } from '../../src/net/ketch/ketchReceipt.js';
import { spoilsGrantStatement } from './budget.js';

export const KT_CID_RE = /^[0-9a-f]{16}$/;

const int = (v) => (Number.isSafeInteger(Number(v)) ? Number(v) : 0);
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

export async function ketchRecordOf({ db }, playerId) {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM ketch_voyages WHERE account = ?1').bind(playerId).first();
  return { sailed: int(r?.n) };
}

/**
 * @param {{ db: any, nowS: number, subtle: SubtleCrypto, rand: (b: Uint8Array) => Uint8Array }} ctx
 * @param {{ id: string, handle?: string|null }} player
 * @param {unknown} receipt
 * @param {CryptoKey|null} publicKey
 * @param {unknown} [cid]
 */
export async function claimKetch({ db, nowS, subtle, rand }, player, receipt, publicKey, cid = null) {
  if (!publicKey) return { error: 'no-gate-key' };
  const v = await verifyKetchReceipt(receipt, publicKey, { subtle, nowS });
  if (!v.ok) return { error: 'receipt', why: v.why };
  const c = v.claims;
  if (c.s !== player.id) return { error: 'not-yours' };
  const nonce = hex(rand(new Uint8Array(8))), mine = typeof cid === 'string' && KT_CID_RE.test(cid) ? cid : null;
  const [row, kept, count] = await db.batch([
    db.prepare('INSERT OR IGNORE INTO ketch_voyages (voyage, account, owner, earned, lv, nonce, at, body, cid) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)')
      .bind(c.d, player.id, c.o, c.x, c.l, nonce, nowS, c.m ? JSON.stringify(c.m) : null, mine),
    db.prepare('SELECT owner, nonce, cid FROM ketch_voyages WHERE voyage = ?1 AND account = ?2').bind(c.d, player.id),
    db.prepare('SELECT COUNT(*) AS n FROM ketch_voyages WHERE account = ?1').bind(player.id),
    // The spoils fill runs in this batch only when this claim's nonce wrote the row, so a retry never refills.
    spoilsGrantStatement(db, player.id, 0, 'EXISTS (SELECT 1 FROM ketch_voyages WHERE voyage = ?5 AND account = ?1 AND nonce = ?6)', c.d, nonce),
  ]);
  const sailed = int(count?.results?.[0]?.n), guest = !player.handle ? { guest: true } : {};
  if (Number(row?.meta?.changes ?? 0) > 0) return { recorded: true, voyage: c.d, share: true, sailed, ...guest };
  const k = kept?.results?.[0] ?? null;
  return k?.owner === c.o ? { recorded: false, why: 'claimed', share: mine != null && k.cid === mine, sailed, ...guest } : { recorded: false, why: 'taken', share: false, sailed, ...guest };
}
