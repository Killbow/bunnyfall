// @ts-check
// The client rolls the spoils. The service only checks that a recorded kill for this account names the send.
import { itemFindings } from '../../src/items/itemLaw.js';
import { LOST_BATCH, LOST_WINDOW_S, LOST_WAITING_MAX, lostKillOf, lostBatchOf, lostPiecesOf } from '../../src/net/lostLaw.js';
import { GILDED, HOURLOCK, DRAGONFIRE_OATH } from '../../src/items/gilded.js';

export const LOST_SENDER = 'Lost and Found';
const words = (/** @type {string} */ subject, /** @type {string} */ where) => Object.freeze({
  subject,
  body: [`You went without taking this from ${where}. It was gathered up and kept for you here.`, '', 'Claim it and it goes into the pack of the online character you are playing.', '', `- ${LOST_SENDER}`].join('\n'),
});
export const LOST_WORDS = Object.freeze({
  gate: words('Left in the Burning Court', 'the floor of the Burning Court'),
  sd: words('Left at the Last Moment', 'the arena floor of the Last Moment'),
  eg: words('Left at a Redoubt', 'beside a Redoubt\'s beacon in the Battlespire'),
});

export const LOST_GILDED = Object.freeze({ gate: DRAGONFIRE_OATH.id, sd: HOURLOCK.id, eg: null });
export const lostLeftBy = (/** @type {{ kind: string }} */ kill, /** @type {any} */ item) => (item?.gilded == null && item?.rarity !== GILDED) || item?.gilded === LOST_GILDED[kill.kind];

async function killAt(db, account, kill) {
  const row = kill.kind === 'gate'
    ? await db.prepare('SELECT at FROM gate_kills WHERE day = ?1 AND account = ?2').bind(kill.day, account).first()
    : kill.kind === 'sd'
      ? await db.prepare('SELECT at FROM sd_kills WHERE slot = ?1 AND account = ?2').bind(kill.slot, account).first()
      : await db.prepare('SELECT at FROM eg_redoubts WHERE b = ?1 AND account = ?2 AND w = ?3 AND paid = 1').bind(kill.b, account, kill.w).first();
  return Number.isSafeInteger(row?.at) ? row.at : null;
}

/** @param {{ db: any, nowS: number }} ctx @param {any} reader @param {{ day?: unknown, pieces?: unknown }} body */
export async function mailLostSpoils({ db, nowS }, reader, { day, pieces } = {}) {
  const kill = lostKillOf(day);
  if (!kill) return { error: 'lost-pieces' };
  const asked = lostPiecesOf(pieces);
  if ('error' in asked) return asked;
  for (const p of asked.pieces) if (itemFindings(p.item).length || !lostLeftBy(kill, p.item)) return { error: 'lost-item', i: p.i };
  // Pieces already written are answered as sent before the kill, window, and box-full checks.
  // A resent send then never makes a second copy.
  const batches = asked.pieces.map((p) => lostBatchOf(kill, p.i));
  const { results: had = [] } = await db.prepare('SELECT batch FROM server_post WHERE to_id = ?1 AND batch IN (SELECT value FROM json_each(?2))')
    .bind(reader.id, JSON.stringify(batches)).all();
  const there = new Set(had.map((r) => r.batch));
  const fresh = asked.pieces.filter((p, k) => !there.has(batches[k]));
  if (!fresh.length) return { ok: true, sent: 0, kept: asked.pieces.length };
  const at = await killAt(db, reader.id, kill);
  if (at == null) return { error: 'lost-no-kill' };
  if (at < nowS - LOST_WINDOW_S) return { error: 'lost-spent' };
  const waiting = await db.prepare("SELECT COUNT(*) AS n FROM server_post WHERE to_id = ?1 AND substr(batch, 1, ?2) = ?3 AND claimed_at IS NULL")
    .bind(reader.id, LOST_BATCH.length, LOST_BATCH).first();
  if ((Number(waiting?.n) || 0) + fresh.length > LOST_WAITING_MAX) return { error: 'lost-full' };
  const { subject, body } = LOST_WORDS[kill.kind];
  // Two sends at once write each piece only once, because the insert ignores rows the one-per-batch index holds.
  await db.batch(fresh.map((p) => db.prepare(`INSERT OR IGNORE INTO server_post (id, to_id, batch, sender, subject, body, item, sent_at)
    VALUES (lower(hex(randomblob(12))), ?1, ?2, ?3, ?4, ?5, ?6, ?7)`).bind(reader.id, lostBatchOf(kill, p.i), LOST_SENDER, subject, body, JSON.stringify(p.item), nowS)));
  return { ok: true, sent: fresh.length, kept: asked.pieces.length };
}
