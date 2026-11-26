// @ts-check

import { prepareRealmRecord } from './realm.js';
import { takeTradeGoods, tradeableRecord } from '../../src/net/realmTradeLaw.js';

export function takeCraftedPiece(save, provenance) {
  const items = Array.isArray(save.items) ? save.items : [];
  const at = items.findIndex((rec) => rec?.provenance === provenance && tradeableRecord(rec));
  if (at >= 0) return takeTradeGoods(save, { items: [items[at]], gold: 0 }, [at])?.[0] ?? null;
  const home = Array.isArray(save.furnishings) ? save.furnishings : [];
  const h = home.findIndex((rec) => !!rec && typeof rec === 'object' && !Array.isArray(rec) && rec.provenance === provenance);
  return h >= 0 ? home.splice(h, 1)[0] : null;
}

/** @param {any} ctx @param {string} me @param {{ id: string, lease: string, seq: number }} at
 * @param {string} provenance @param {boolean} escrow @param {((moved: any) => string | null) | null} [check] */
export async function prepareCraftedPiece(ctx, me, at, provenance, escrow, check = null) {
  /** @type {any} */
  let moved = null;
  // The returned steps must run in the caller's own batch behind its decision statement.
  const prep = await prepareRealmRecord(ctx, me, at, (save) => {
    moved = takeCraftedPiece(save, provenance);
    return moved ? (check?.(moved) ?? null) : 'market-piece-gone';
  }, { outbound: true, escrow });
  return prep.error ? prep : { ...prep, moved };
}

/** @param {any} db @param {string} me @param {string} provenance */
export async function pieceComingBack(db, me, provenance) {
  // A returned item delivery carries the provenance only inside its item JSON.
  return !!(await db.prepare("SELECT 1 FROM market_deliveries WHERE player = ?2 AND collected = 0 AND item IS NOT NULL AND json_extract(item, '$.provenance') = ?1")
    .bind(provenance, me).first());
}
