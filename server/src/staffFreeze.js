// @ts-check

import { SOCIAL_ROOM, CLOSE_POLICY, isSocialRoom, isChatRoom, tokenGate } from '../../src/net/wire.js';
import { MAX_TTL_S, SKEW_S, tokenBodyOf, _b64url } from '../../src/net/identityToken.js';
import { isHidden } from './staffHidden.js';

export const STAFF_ORDER_KINDS = Object.freeze(['freeze', 'staffline']);
export const FREEZES_KEY = 'freezes';
export const FREEZES_MAX = 512;
export const FREEZE_OLD_REASON = 'old build frozen';
export const STAFF_NUDGE_HZ_MAX = 8;
export const STAFF_IN_MAX = 512;
const AIMED = new Set(['trade', 'cast', 'duel', 'wild', 'wed', 'siege']);

/** @param {any} tok */
const claimsOf = (tok) => { try { return JSON.parse(new TextDecoder().decode(_b64url.decode(tokenBodyOf(tok)))); } catch { return null; } };

/** @param {any} a @param {number} nowS */
export const frozenAt = (a, nowS) => Number(a?.fz) > nowS;
// Any freeze bars the seat, lapsed or not, until a lease or hello lifts it,
// so a seat never moves back on the clock alone.
/** @param {any} a */
export const seatBarred = (a) => Number(a?.fz) > 0;

const kept = (/** @type {{ i: number, fz: number }} */ b, /** @type {number} */ nowS) => b.fz > nowS || b.i > nowS - MAX_TTL_S - SKEW_S;

/** @param {any} room @param {number} nowS */
export function loadFreezes(room, nowS) {
  room._freezes ??= new Map();
  room._freezesLoad ??= (async () => {
    let book = null;
    try { book = await room.state.storage.get(FREEZES_KEY); } catch (e) { room._freezesLoad = null; console.warn('[freeze] read', /** @type {any} */ (e)?.message ?? e); return; }
    if (!book || typeof book !== 'object') return;
    for (const [s, v] of Object.entries(book)) {
      if (!Array.isArray(v) || !Number.isSafeInteger(v[0]) || !Number.isSafeInteger(v[1])) continue;
      const b = { i: v[0], fz: v[1], sig: typeof v[2] === 'string' ? v[2] : '' };
      if (!kept(b, nowS) || room._freezes.get(s)?.i >= b.i) continue;
      room._freezes.set(s, b);
    }
  })();
  return room._freezesLoad;
}

/** @param {any} room @param {number} nowS */
async function saveFreezes(room, nowS) {
  for (const [s, b] of room._freezes) if (!kept(b, nowS)) room._freezes.delete(s);
  try { await room.state.storage.put(FREEZES_KEY, Object.fromEntries([...room._freezes].map(([s, b]) => [s, [b.i, b.fz, b.sig]]))); } catch (e) { console.warn('[freeze] write', /** @type {any} */ (e)?.message ?? e); }
}

/** @param {any} room @param {string} sub @param {number} ti @param {number} nowS */
async function bookOver(room, sub, ti, nowS) {
  await loadFreezes(room, nowS);
  const b = typeof sub === 'string' ? room._freezes.get(sub) : null;
  return b && b.i >= ti ? (b.fz > nowS ? b.fz : 0) : undefined;
}

/** @param {any} room @param {any} c @param {string} order @param {number} now @param {string} oldWords */
export async function takeStaffOrder(room, c, order, now, oldWords) {
  const nowS = Math.floor(now / 1000);
  if (c.o === 'staffline') {
    const joined = room._staffIn ??= new Map();
    joined.delete(c.s);
    if (joined.size >= STAFF_IN_MAX) joined.delete(joined.keys().next().value);
    joined.set(c.s, c.i);
    nudge(room, c.s, { t: 'chat', ch: 'staff', th: c.s, sl: c.sl, st: 1, at: now });
    return true;
  }
  const sig = order.slice(order.lastIndexOf('.') + 1);
  await loadFreezes(room, nowS);
  const held = room._freezes.get(c.s);
  if (held && (c.i < held.i || held.sig === sig)) return true;
  const fz = c.fz > nowS ? c.fz : 0;
  room._freezes.delete(c.s);
  if (room._freezes.size >= FREEZES_MAX) room._freezes.delete(room._freezes.keys().next().value);
  room._freezes.set(c.s, { i: c.i, fz, sig });
  await saveFreezes(room, nowS);
  const told = JSON.stringify({ t: 'frozen', until: fz });
  for (const [ws, b] of [...room._all()]) {
    // A token minted after the order already carries the current freeze.
    if (b.sub !== c.s || b.gio > c.i) continue;
    const next = { ...b, fz };
    room._setAttach(ws, next);
    room._send(ws, told);
    if (fz && b.fv !== 1) room._refuse(ws, oldWords, CLOSE_POLICY, FREEZE_OLD_REASON);
    else freezeMoved(room, b, next);
  }
  return true;
}

/** @param {any} room @param {any} ws @param {string} key @param {any} who @param {any} m @param {number} now @param {string} oldWords */
export async function frozenHello(room, ws, key, who, m, now, oldWords) {
  const nowS = Math.floor(now / 1000);
  const fz = claimsOf(m.tok)?.fz;
  const own = Number.isSafeInteger(fz) && fz > nowS ? fz : 0;
  const book = key === SOCIAL_ROOM ? await bookOver(room, who.subject, who.gio, nowS) : undefined;
  who.fz = book ?? own;
  if (who.fz && m.fv !== 1) { room._refuse(ws, oldWords, CLOSE_POLICY, FREEZE_OLD_REASON); return true; }
  if (who.fz && !isChatRoom(key)) m.pose = posedHere(room, who.subject);
  if (who.fz || (book !== undefined && book !== own)) room._send(ws, JSON.stringify({ t: 'frozen', until: who.fz }));
  return false;
}

/** @param {any} room @param {any} vws @param {any} a @param {number} ti @param {number} now @param {string} oldWords */
export async function busFreeze(room, vws, a, ti, now, oldWords) {
  const nowS = Math.floor(now / 1000);
  const book = await bookOver(room, a.sub, ti, nowS);
  const next = book === undefined ? a : { ...a, fz: book };
  if (frozenAt(next, nowS) && next.fv !== 1) { vws.att = next; room._refuse(vws, oldWords, CLOSE_POLICY, FREEZE_OLD_REASON); return null; }
  if (book !== undefined && book !== (Number(a.fz) > nowS ? a.fz : 0)) room._send(vws, JSON.stringify({ t: 'frozen', until: book }));
  return next;
}

/** @param {any} room @param {unknown} sub */
function posedHere(room, sub) {
  if (typeof sub !== 'string' || !sub) return null;
  for (const [, b] of room._all()) if (b.sub === sub && b.pose && typeof b.pose === 'object') return { ...b.pose, mv: 0 };
  return null;
}

/** @param {any} room @param {any} was @param {any} now */
export function freezeMoved(room, was, now) {
  if (seatBarred(was) === seatBarred(now) || isChatRoom(was?.key)) return;
  room._hostMemo = undefined;
  room._sayHost();
}

/** @param {any} room @param {any} a @param {any} m */
export function frozenFrame(room, a, m) {
  const nowS = Math.floor(Date.now() / 1000);
  if (frozenAt(a, nowS) && m.t !== 'ping') {
    if (m.t === 'chat' && m.ch === 'staff' && m.me !== true) return false;
    if (m.t === 'pose' && a.pose && typeof a.pose === 'object') { m.p = { ...a.pose, yaw: m.p.yaw, pitch: m.p.pitch, mv: 0 }; return false; }
    return true;
  }
  return aimedAtFrozen(room, a, m, nowS);
}

/** @param {any} room @param {any} a @param {any} m @param {number} nowS */
function aimedAtFrozen(room, a, m, nowS) {
  if (m.t === 'arena' && m.k === 'hit') {
    for (const [, b] of room._all()) if (b !== a && b.af && frozenAt(b, nowS)) return true;
    return false;
  }
  if (!AIMED.has(m.t)) return false;
  const to = m.t === 'siege' ? m.to : m.data?.to;
  if (typeof to !== 'string') return false;
  for (const ws of room._byId().get(to) ?? []) if (frozenAt(room._all().get(ws), nowS)) return true;
  return false;
}

/** @param {any} room @param {any} ws @param {any} a @param {any} frame @param {number} now */
export function staffLine(room, ws, a, frame, now) {
  if (frame.t !== 'chat' || !isSocialRoom(a.key)) { room._junk(ws); return; }
  const sl = /^[1-9]\d{0,14}$/.test(frame.text) ? Number(frame.text) : 0;
  if (!sl || typeof a.sub !== 'string' || !a.sub) return;
  if (!frozenAt(a, Math.floor(now / 1000)) && !room._staffIn?.has(a.sub)) return;
  const budget = tokenGate(room._staffNudges, now, STAFF_NUDGE_HZ_MAX);
  room._staffNudges = budget.bucket;
  if (!budget.pass) return;
  nudge(room, a.sub, { t: 'chat', ch: 'staff', th: a.sub, sl, id: a.id, name: a.name, at: now });
}

/** @param {any} room @param {any[]} events */
export async function busMissed(room, events) {
  for (const [vid, kind, said] of Array.isArray(events) ? events : []) {
    // Must match the lease frame shape that `shardKeeps` in src/net/hubShards.js keeps.
    if (kind !== 'f' || !said.startsWith('{"t":"lease"')) continue;
    const ws = room._byVid(vid), a = ws && room._pastWait(ws);
    if (a) try { await room._leaseRead(ws, a, { t: 'lease' }, said, Date.now()); } catch (e) { console.warn('[freeze] pass', /** @type {any} */ (e)?.message ?? e); }
  }
}

function nudge(/** @type {any} */ room, /** @type {string} */ sub, /** @type {object} */ frame) {
  const out = JSON.stringify(frame);
  for (const [other, b] of [...room._all()]) if (b.id && (b.sub === sub || isHidden(b))) room._send(other, out);
}
