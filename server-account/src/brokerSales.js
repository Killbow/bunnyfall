// A settle fences a request id that has no row in the same statement, so a lost press can never land
// after the client refunds its embers.

import { arenaWeekOf } from '../../src/net/arenaLaw.js';
import { BROKER_RID_RE } from '../../src/net/insignia.js';

export const brokerRidOk = (rid) => typeof rid === 'string' && BROKER_RID_RE.test(rid);
const nonceOk = brokerRidOk;

export async function brokerSaleOf(db, account, rid) {
  const r = await db.prepare('SELECT kind, item, at FROM broker_sales WHERE account = ?1 AND rid = ?2').bind(account, rid).first();
  return r ? { kind: String(r.kind), item: typeof r.item === 'string' ? r.item : null, at: Number(r.at) || 0 } : null;
}

export const brokerSaleWrite = (db, { account, rid, kind, item, nowS }) => db.prepare(
  'INSERT INTO broker_sales (account, rid, kind, item, at) SELECT ?1, ?2, ?3, ?4, ?5 WHERE changes() > 0',
).bind(account, rid, kind, item, nowS);

export const brokerRidFreeSql = (acc, rid) => `NOT EXISTS (SELECT 1 FROM broker_sales WHERE account = ${acc} AND rid = ${rid})`;

/** @param {{ db: any, nowS: number }} ctx @param {{ id: string, handle?: string|null }} player @param {any} body */
export async function settleBrokerSale({ db, nowS }, player, body) {
  if (!player?.handle) return { error: 'guest' };
  const rid = body?.rid, nonce = body?.nonce;
  if (!brokerRidOk(rid) || !nonceOk(nonce)) return { error: 'rid' };
  const [, counted] = await db.batch([
    db.prepare("INSERT INTO broker_sales (account, rid, kind, item, at) VALUES (?1, ?2, 'fence', NULL, ?3) ON CONFLICT (account, rid) DO NOTHING").bind(player.id, rid, nowS),
    db.prepare('UPDATE broker_sales SET settled = settled + 1, asked_by = COALESCE(asked_by, ?3) WHERE account = ?1 AND rid = ?2 RETURNING kind, item, at, asked_by')
      .bind(player.id, rid, nonce),
  ]);
  const row = counted?.results?.[0];
  if (!row || row.kind === 'fence') return { held: false };
  return { held: true, kind: String(row.kind), item: row.item, by: String(row.asked_by), ...(row.kind === 'panoply' ? { week: arenaWeekOf(Number(row.at) || 0) } : {}) };
}
