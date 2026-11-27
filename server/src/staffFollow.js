// @ts-check
import { FOLLOW_INTERNAL_SAY, FOLLOWERS_MAX, FOLLOWED_MAX, NOTE_STALE_MS, noteWhere, validFollowSay } from '../../src/net/staffFollow.js';
import { isChatRoom, isSocialRoom, SOCIAL_ROOM } from '../../src/net/wire.js';
import { ROOM_CALL_MS } from './relayScale.js';

/** @typedef {{ _attach: (ws: any) => any, _bySub: () => Map<string, Set<any>>, _send: (ws: any, s: string) => boolean, _setAttach: (ws: any, a: any, lazy?: boolean) => boolean, _dead: Set<any>, _gone: Set<any>, env?: any, _follows?: Map<string, Set<any>>, _fol?: Map<string, number> }} FollowRoom */

/** @param {FollowRoom} room @param {any} ws */
const live = (room, ws) => !room._dead.has(ws) && !room._gone.has(ws) && !ws?.closed;
/** @param {FollowRoom} room @param {string} sub @param {any} [except] */
function socketsOf(room, sub, except = null) {
  const out = [];
  for (const ws of room._bySub().get(sub) ?? []) if (ws !== except && live(room, ws)) out.push(ws);
  return out;
}
/** @param {FollowRoom} room @param {string} sub */
function followersOf(room, sub) {
  const set = room._follows?.get(sub);
  if (!set) return null;
  for (const ws of set) if (!live(room, ws)) set.delete(ws);
  if (!set.size) { room._follows?.delete(sub); return null; }
  return set;
}

/** @param {FollowRoom} room @param {string} sub @param {number} now @returns {{ p: any, at: number } | null} */
export function noteOf(room, sub, now) {
  let pm = null;
  for (const ws of socketsOf(room, sub)) { const b = room._attach(ws); if (b.pm && (!pm || b.pm.at > pm.at)) pm = b.pm; }
  if (!pm || !(now - pm.at <= NOTE_STALE_MS)) return null;
  const { at, ...p } = pm;
  return { p, at };
}

/** @param {FollowRoom} room @param {string} sub @param {object} frame */
function tell(room, sub, frame) {
  const set = followersOf(room, sub);
  if (!set) return 0;
  const s = JSON.stringify({ t: 'fol', ...frame });
  for (const ws of set) room._send(ws, s);
  return set.size;
}

/** @param {FollowRoom} room @param {any} a @param {any} p */
export function followNoted(room, a, p) {
  const was = a.pm;
  if (a.sub && room._follows?.has(a.sub) && noteWhere(was) !== noteWhere(p)) tell(room, a.sub, { k: 'note', sub: a.sub, p, ag: 0 });
  const { rk, ...fan } = p;
  void rk;
  return fan;
}

// The room `rk` is for staff alone, so the copy a party receives never carries it.
/** @param {any} p */
export const withoutRoom = (p) => { const { rk, ...rest } = p; void rk; return rest; };

/** @param {FollowRoom} room @param {any} ws @param {number} now */
export function followHello(room, ws, now) {
  const a = room._attach(ws);
  if (typeof a?.fo !== 'string' || !isSocialRoom(a.key)) return;
  const follows = (room._follows ??= new Map());
  let set = followersOf(room, a.fo);
  if (!set) {
    if (follows.size >= FOLLOWED_MAX) return;
    follows.set(a.fo, set = new Set());
  }
  if (set.size >= FOLLOWERS_MAX) return;
  set.add(ws);
  room._send(ws, JSON.stringify({ t: 'fol', k: 'on', sub: a.fo }));
  const n = noteOf(room, a.fo, now);
  if (n) room._send(ws, JSON.stringify({ t: 'fol', k: 'note', sub: a.fo, p: n.p, ag: Math.floor((now - n.at) / 1000) }));
  else if (!socketsOf(room, a.fo).length) room._send(ws, JSON.stringify({ t: 'fol', k: 'gone', sub: a.fo }));
}

/** @param {FollowRoom} room @param {string} sub @param {'in'|'out'} k @param {any} a */
function say(room, sub, k, a) {
  const rooms = room.env?.ROOMS;
  if (!rooms?.idFromName || !rooms?.get) return;
  // Send the socket id: rosters in place rooms name no account, so the spectator client finds the target by id.
  const body = JSON.stringify({ sub, k, room: a.key, ...(a.ly ? { ly: a.ly } : {}), id: a.id });
  void (async () => {
    try { await rooms.get(rooms.idFromName(SOCIAL_ROOM)).fetch(new Request(`https://relay.internal${FOLLOW_INTERNAL_SAY}`, { method: 'POST', body, signal: AbortSignal.timeout(ROOM_CALL_MS) })); }
    catch (e) { console.warn('[follow] the bus did not hear a room', /** @type {any} */ (e)?.message ?? e); }
  })();
}

/** @param {FollowRoom} room @param {any} ws @param {any} a */
export function followJoined(room, ws, a) {
  if (!a?.id || isChatRoom(a.key) || isSocialRoom(a.key)) return;
  if (typeof a.fo === 'string') {
    const fol = (room._fol ??= new Map());
    fol.set(a.fo, (fol.get(a.fo) ?? 0) + 1);
    const here = socketsOf(room, a.fo, ws)[0];
    if (here) say(room, a.fo, 'in', room._attach(here));
    return;
  }
  if (a.sub && room._fol?.has(a.sub) && socketsOf(room, a.sub, ws).length === 0) say(room, a.sub, 'in', a);
}

/** @param {FollowRoom} room @param {any} ws @param {any} a */
export function followLeft(room, ws, a) {
  if (!a?.id) return;
  if (typeof a.fo === 'string') {
    const set = room._follows?.get(a.fo);
    if (set?.delete(ws) && !set.size) room._follows?.delete(a.fo);
    const n = room._fol?.get(a.fo);
    if (n != null) { if (n > 1) room._fol?.set(a.fo, n - 1); else room._fol?.delete(a.fo); }
    return;
  }
  if (!a.sub || !(room._follows?.has(a.sub) || room._fol?.has(a.sub)) || socketsOf(room, a.sub, ws).length) return;
  if (isSocialRoom(a.key)) tell(room, a.sub, { k: 'gone', sub: a.sub });
  else if (!isChatRoom(a.key)) say(room, a.sub, 'out', a);
}

/** @param {FollowRoom} room @param {Request} request */
export async function followSayInternal(room, request) {
  let b;
  try { b = validFollowSay(await request.json()); } catch { b = null; }
  if (!b) return Response.json({ error: 'bad' }, { status: 400 });
  return Response.json({ ok: 1, told: tell(room, b.sub, b) });
}
