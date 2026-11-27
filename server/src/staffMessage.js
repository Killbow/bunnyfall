import { verifyOrder } from '../../src/net/identityToken.js';

// The frame carries only the message id; the game reads the words from the account service with its own session.
/** @param {any} room @param {unknown} order @param {number} now @returns {Promise<{ ok: boolean, n?: number, old?: number }>} */
export async function takeStaffMessage(room, order, now) {
  if (typeof order !== 'string' || !order || order.length > 1024) return { ok: false };
  await room._loadKey();
  if (!room._verifyKey) return { ok: false };
  const r = await verifyOrder(order, room._verifyKey, { subtle: crypto.subtle, nowS: Math.floor(now / 1000), kind: 'smsg' });
  if (!r.ok) return { ok: false };
  const frame = JSON.stringify({ t: 'smsg', mi: r.claims.mi });
  let n = 0, old = 0;
  for (const ws of [...(room._bySub().get(r.claims.s) ?? [])]) {
    const a = room._attach(ws);
    if (!a.id || room._dead.has(ws) || room._gone.has(ws)) continue;
    if (a.sm !== 1) old++;
    else if (room._send(ws, frame)) n++;
  }
  return { ok: true, n, old };
}
