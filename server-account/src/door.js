// @ts-check
import { isTombstone, TOMB_WHERE } from './legacy.js';
import { bucketFrom, SEAT_WHERE } from './progress.js';

// seat_id and seat_held share one WHERE and one index, so both subqueries read the same row.
const DOOR_SQL = `SELECT
  (SELECT 1 FROM realm_characters WHERE ${TOMB_WHERE}) AS dead,
  (SELECT id FROM realm_characters WHERE ${SEAT_WHERE}) AS seat_id,
  (SELECT held FROM realm_characters WHERE ${SEAT_WHERE}) AS seat_held,
  (SELECT 1 FROM players WHERE id = ?1) AS player,
  (SELECT played_s FROM players WHERE id = ?1) AS now,
  (SELECT allowance FROM progress_play WHERE player = ?1 AND stream = ?3) AS allowance,
  (SELECT played_at FROM progress_play WHERE player = ?1 AND stream = ?3) AS played_at`;

/** @param {any} db @param {string} playerId @param {{ tomb: string|null, stream: string|null }} ask */
export async function doorReads(db, playerId, { tomb, stream }) {
  /** @type {{ dead: boolean, seat: any, bucket: any, stream: string|null }} */
  const out = { dead: false, seat: undefined, bucket: undefined, stream };
  if (stream == null) {
    if (tomb != null) out.dead = await isTombstone(db, playerId, tomb);
    return out;
  }
  const r = await db.prepare(DOOR_SQL).bind(playerId, tomb, stream).first();
  out.dead = !!r?.dead;
  out.seat = r?.seat_id != null ? { id: r.seat_id, held: r.seat_held } : null;
  out.bucket = r?.player ? bucketFrom({ now: r.now, allowance: r.allowance, played_at: r.played_at }) : null;
  return out;
}
