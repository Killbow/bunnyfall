// @ts-check

import { verifyOrder } from '../../src/net/identityToken.js';
import { RESTART_KEY, RESTART_MAX_S } from '../../src/net/restartLaw.js';

/** @param {any} room @param {number} now */
async function pendingAt(room, now) {
  if (room._restartAt === undefined) {
    const at = await room.state.storage.get(RESTART_KEY);
    room._restartAt = Number.isSafeInteger(at) ? at : 0;
  }
  if (room._restartAt && room._restartAt <= now) {
    room._restartAt = 0;
    await room.state.storage.delete(RESTART_KEY);
  }
  return room._restartAt;
}

/** @param {number} at @param {number} now */
const frameOf = (at, now) => JSON.stringify({ t: 'restart', in: at ? Math.max(0, at - now) : 0 });

/** @param {any} room @param {unknown} order @param {number} now @returns {Promise<{ ok: boolean, n?: number }>} */
export async function takeRestartOrder(room, order, now) {
  if (typeof order !== 'string' || !order || order.length > 1024) return { ok: false };
  await room._loadKey();
  if (!room._verifyKey) return { ok: false };
  const r = await verifyOrder(order, room._verifyKey, { subtle: crypto.subtle, nowS: Math.floor(now / 1000), kind: 'restart' });
  if (!r.ok) return { ok: false };
  const at = r.claims.ra * 1000;
  if (at && (at <= now || at - now > (RESTART_MAX_S + 60) * 1000)) return { ok: false };
  if (at) await room.state.storage.put(RESTART_KEY, at);
  else await room.state.storage.delete(RESTART_KEY);
  room._restartAt = at;
  const frame = frameOf(at, now);
  let n = 0;
  for (const [ws, a] of [...room._all()]) if (a.id && room._send(ws, frame)) n++;
  return { ok: true, n };
}

/** @param {any} room @param {any} ws @param {number} now */
export async function sayRestartTo(room, ws, now) {
  // Send the frame even with no restart pending, so a countdown canceled while the player was away ends.
  room._send(ws, frameOf(await pendingAt(room, now), now));
}
