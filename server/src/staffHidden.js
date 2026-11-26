// @ts-check
import { verifyOrder } from '../../src/net/identityToken.js';
import { sealHiddenSeen, HIDDEN_SEEN_V, HIDDEN_SEEN_SIG_HEADER, HIDDEN_SEEN_POST_MS } from '../../src/net/hiddenSeen.js';
import { isChatRoom } from './relay.js';

export const HIDDEN_RESERVE = 8;
export const HIDDEN_FRAMES = Object.freeze(['ping', 'pose', 'lease', 'find', 'say']);
export const HIDDEN_CHAT = 'staff';
export const HIDDEN_LAPSED = 'hidden lapsed';
const HIDDEN_FRAME_MAX = 4096;

/** @param {any} a */
export const isHidden = (a) => a?.hid === 1;

/** @param {unknown} message */
export function hiddenMay(message) {
  if (typeof message !== 'string' || message.length > HIDDEN_FRAME_MAX) return false;
  let m;
  try { m = JSON.parse(message); } catch { return false; }
  if (!m || typeof m !== 'object') return false;
  return HIDDEN_FRAMES.includes(m.t) || (m.t === 'chat' && m.ch === HIDDEN_CHAT)
    || (m.t === 'stp' && m.k === 'ask');
}

/** @param {Request} request */
export const hiddenAsked = (request) => new URL(request.url).searchParams.get('hd') === '1';

/** @param {any} room */
export function hiddenSeats(room) {
  let n = 0;
  for (const [ws, b] of room._all()) if ((b.hid || b.hs) && !room._dead.has(ws) && !room._gone.has(ws)) n++;
  return n;
}

/** @param {any} room */
function hiddenPending(room) {
  let n = 0;
  for (const [ws, b] of room._all()) if (b.hs && !b.hid && !room._dead.has(ws) && !room._gone.has(ws)) n++;
  return n;
}

/** @param {any} room @param {boolean} ask @param {number} cap */
export function seatsTaken(room, ask, cap) {
  const all = room.state.getWebSockets().length;
  if (!ask) return all < cap ? all : all - hiddenSeats(room);
  const seats = all - HIDDEN_RESERVE;
  return seats < cap && hiddenPending(room) >= HIDDEN_RESERVE ? cap : seats;
}

/** @param {any} room @param {any} ws @param {any} a @param {any} m @param {any} who */
export function hiddenHello(room, ws, a, m, who) {
  if (room._hidHellos.has(m)) who.hid = 1;
  if (a.hs && !who.hid) return HIDDEN_LAPSED;
  // A hidden hello never takes over a visible socket's id;
  // the replaced socket would send no leave and stay frozen in place.
  if (who.hid && room._withId(m.id, ws).some(([, b]) => !isHidden(b))) return 'id taken';
  // A private home is closed to hidden sockets when this relay cannot report the entry.
  if (who.hid && String(a.key).startsWith('owned:') && !hiddenSeenOn(room.env)) return 'private room';
  return null;
}

/** @param {any} room @param {any} ws @param {any} a @param {any} m */
export function hiddenPose(room, ws, a, m) {
  const posed = m.t === 'pose' && !isChatRoom(a.key);
  const met = room._meter(ws, a, Date.now(), { pose: posed ? m.p : a.pose }, {}, posed);
  if (met && m.t === 'ping') room._send(ws, '{"t":"pong"}');
}

/** @param {any} room @param {unknown} order @param {number} now */
export async function hiddenLapse(room, order, now) {
  if (typeof order !== 'string' || !order || order.length > 1024) return false;
  await room._loadKey();
  if (!room._verifyKey) return false;
  const r = await verifyOrder(order, room._verifyKey, { subtle: crypto.subtle, nowS: Math.floor(now / 1000), kind: 'hide' });
  if (!r.ok) return false;
  const { s, i } = r.claims;
  // A socket whose token was minted after the order stays open.
  for (const [ws, b] of [...room._all()]) if (isHidden(b) && b.sub === s && !(b.gio > i)) room._refuse(ws, HIDDEN_LAPSED);
  return true;
}

/** @param {any} env */
export const hiddenSeenOn = (env) => typeof env?.HIDDEN_SEEN_URL === 'string' && env.HIDDEN_SEEN_URL.startsWith('https://') && !!env.GATE_SIGNING_KEY;

/** @param {any} room @param {string} key @param {string} sub */
export function hiddenEntered(room, key, sub) {
  const url = room.env?.HIDDEN_SEEN_URL;
  if (!hiddenSeenOn(room.env) || !String(key).startsWith('owned:')) return null;
  return (async () => {
    try {
      const id = [...crypto.getRandomValues(new Uint8Array(8))].map((x) => x.toString(16).padStart(2, '0')).join('');
      const sealed = await sealHiddenSeen({ v: HIDDEN_SEEN_V, id, at: Date.now(), s: sub, r: key }, await room._receiptKeyOf(), { subtle: crypto.subtle });
      if (!sealed) return false;
      const init = { method: 'POST', headers: { 'content-type': 'application/json', [HIDDEN_SEEN_SIG_HEADER]: sealed.sig }, body: sealed.body, signal: AbortSignal.timeout(HIDDEN_SEEN_POST_MS) };
      const svc = room.env?.ACCOUNTS;
      const res = typeof svc?.fetch === 'function' ? await svc.fetch(new Request(url, init)) : await fetch(url, init);
      if (!res.ok) console.warn('[hidden] the service said', res.status);
      return res.ok;
    } catch (e) { console.warn('[hidden] seen post failed', e?.message ?? e); return false; }
  })();
}
