// @ts-check
// BUNNYFALL: server restart warnings, the hub's half (net/restartLaw.js has the rules).

import { verifyOrder } from '../../src/net/identityToken.js';
import { RESTART_KEY, RESTART_MAX_S } from '../../src/net/restartLaw.js';

/** The pending restart's time (epoch ms), or 0. @param {any} room @param {number} now */
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

/** The frame for one player: milliseconds left, 0 for none. @param {number} at @param {number} now */
const frameOf = (at, now) => JSON.stringify({ t: 'restart', in: at ? Math.max(0, at - now) : 0 });

/**
 * A restart order taken at the hub's door. Answers `{ ok, n }`: whether the order was good, and how many sockets were told.
 * @param {any} room the hub (a Room) @param {unknown} order @param {number} now
 * @returns {Promise<{ ok: boolean, n?: number }>}
 */
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
  for (const [ws, a] of [...room._all()]) if (a.id && room._send(ws, frame)) n++;   // every player in the hub, shards' too
  return { ok: true, n };
}

/** A player just came online: tell them the pending restart, or that there is none (a countdown called off while they
 *  were away ends on their screen too). @param {any} room @param {any} ws @param {number} now */
export async function sayRestartTo(room, ws, now) {
  room._send(ws, frameOf(await pendingAt(room, now), now));
}
