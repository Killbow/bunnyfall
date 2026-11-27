// @ts-check

import {
  validStaffEvent, validStaffEventTell, newStaffLedger, foldStaffWord, staffBossCall, staffEventDone, staffEventLapsed,
  staffLedgerState, staffEventTell, staffEventEarned, staffEventBoard, validStaffBoard, STAFF_EVENTS_MAX, STAFF_EVENT_TELL_MS, STAFF_EVENT_ID_RE,
} from '../../src/net/staffEvent/staffEventLaw.js';
import { mintStaffReceipt } from '../../src/net/staffEvent/staffEventReceipt.js';
import { SOCIAL_ROOM, worldRoom, mapPixelOfWire } from '../../src/net/wire.js';
import { junkOutsideCover, cellCall } from './cellNodes.js';
import { verifyOrder } from '../../src/net/identityToken.js';

export const STAFF_EVENTS_KEY = 'sevents';
export const STAFF_LEDGER_PREFIX = 'sevl:';
export const SEV_INTERNAL_BOOK = '/internal/sev/book';
export const SEV_INTERNAL_TELL = '/internal/sev/tell';
export const SEV_INTERNAL_CALL = '/internal/sev/call';
export const SEV_BOOK_FRESH_MS = 30_000;
export const SEV_BOOK_MISS_MS = 5_000;
export const SEV_BOARDS_KEPT = 2 * STAFF_EVENTS_MAX;
const CALL_MS = 3_000;
export const STAFF_EVENT_OPS = Object.freeze(['start', 'end', 'boss', 'look']);

const json = (/** @type {any} */ o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

/** @param {any} room @returns {Promise<import('../../src/net/staffEvent/staffEventLaw.js').StaffEvent[]>} */
async function bookOf(room) {
  if (!room._sevBook) {
    let v = null;
    try { v = await room.state.storage.get(STAFF_EVENTS_KEY); } catch (e) { console.warn('[sev] read', /** @type {any} */ (e)?.message ?? e); }
    if (!room._sevBook) room._sevBook = (Array.isArray(v?.l) ? v.l : []).map(validStaffEvent).filter(Boolean).slice(0, STAFF_EVENTS_MAX);
    room._sevBoards ??= new Map((Array.isArray(v?.b) ? v.b : []).filter((/** @type {any} */ x) => Array.isArray(x) && STAFF_EVENT_ID_RE.test(x[0]) && validStaffBoard(x[1])).slice(-SEV_BOARDS_KEPT));
  }
  room._sevLive ??= new Map();
  room._sevBoards ??= new Map();
  return room._sevBook;
}
/** @param {any} room */
async function saveBook(room) {
  try { await room.state.storage.put(STAFF_EVENTS_KEY, { l: room._sevBook, b: [...(room._sevBoards ?? [])] }); } catch (e) { console.warn('[sev] write', /** @type {any} */ (e)?.message ?? e); }
}
/** @param {any[]} l */
const bookFrame = (l) => JSON.stringify({ t: 'sev', k: 'ev', l });
/** @param {any} room @param {string} s */
function fanAll(room, s) { for (const [ws, b] of [...room._all()]) if (b.id) room._send(ws, s); }

/** @param {any} room @param {any} e @param {object} body */
export async function tellCell(room, e, body) {
  try { const res = await cellCall(room.env, worldRoom(e.px, e.py), 0, SEV_INTERNAL_CALL, body, CALL_MS); return !!res?.ok; }
  catch (err) { console.warn('[sev] cell', /** @type {any} */ (err)?.message ?? err); return false; }
}

/** @param {any} room @param {string} id @param {string} why */
async function endEvent(room, id, why) {
  const book = await bookOf(room);
  const e = book.find((x) => x.id === id);
  if (!e) return false;
  room._sevBook = book.filter((x) => x.id !== id);
  room._sevLive.delete(id);
  await saveBook(room);
  fanAll(room, JSON.stringify({ t: 'sev', k: 'end', id, why }));
  fanAll(room, bookFrame(room._sevBook));
  await tellCell(room, e, { id, op: 'end', ev: e });
  return true;
}
/** @param {any} room @param {number} now */
async function lapse(room, now) {
  for (const e of [...(await bookOf(room))]) if (staffEventLapsed(e, now)) await endEvent(room, e.id, 'time');
}
/** @param {any} room */
const lookOf = (room) => room._sevBook.map((/** @type {any} */ e) => ({ ...e, live: room._sevLive.get(e.id) ?? null }));

/** @param {any} room @param {any} c @param {number} now */
export async function takeStaffEventOrder(room, c, now) {
  if (!STAFF_EVENT_OPS.includes(c?.op)) return { ok: false };
  await bookOf(room);
  await lapse(room, now);
  if (c.op === 'start') {
    const e = validStaffEvent(c.ev);
    if (!e) return { ok: false, why: 'event' };
    if (!room._sevBook.some((/** @type {any} */ x) => x.id === e.id)) {
      if (room._sevBook.length >= STAFF_EVENTS_MAX) return { ok: false, why: 'full', l: lookOf(room) };
      room._sevBook = [...room._sevBook, e];
      await saveBook(room);
      fanAll(room, bookFrame(room._sevBook));
      if (e.an) fanAll(room, JSON.stringify({ t: 'sev', k: 'an', id: e.id }));
    }
    return { ok: true, l: lookOf(room) };
  }
  if (c.op === 'end') {
    if (typeof c.ei !== 'string' || !STAFF_EVENT_ID_RE.test(c.ei)) return { ok: false };
    await endEvent(room, c.ei, 'staff');
    return { ok: true, l: lookOf(room) };
  }
  if (c.op === 'boss') {
    const e = room._sevBook.find((/** @type {any} */ x) => x.id === c.ei);
    if (!e) return { ok: false, why: 'gone', l: lookOf(room) };
    e.fb = Math.min(99, (e.fb ?? 0) + 1);
    await saveBook(room);
    fanAll(room, bookFrame(room._sevBook));
    await tellCell(room, e, { id: e.id, op: 'boss', fb: e.fb });
    return { ok: true, l: lookOf(room) };
  }
  return { ok: true, l: lookOf(room), bd: [...room._sevBoards] };
}

/** @param {any} room @param {unknown} order @param {number} now */
export async function takeStaffEventLaw(room, order, now) {
  if (typeof order !== 'string' || !order || order.length > 1024) return { ok: false };
  await room._loadKey();
  if (!room._verifyKey) return { ok: false };
  const r = await verifyOrder(order, room._verifyKey, { subtle: crypto.subtle, nowS: Math.floor(now / 1000), kind: 'sevent' });
  if (!r.ok) return { ok: false };
  return takeStaffEventOrder(room, r.claims, now);
}

/** @param {any} room @param {any} ws @param {number} now */
export async function sayStaffBook(room, ws, now) {
  await lapse(room, now);
  const book = await bookOf(room);
  if (book.length) room._send(ws, bookFrame(book));
}
/** @param {any} room */
export async function staffBookInternal(room) {
  await lapse(room, Date.now());
  return json({ l: await bookOf(room) });
}
/** @param {any} room @param {Request} request */
export async function staffTellInternal(room, request) {
  let body = null;
  try { body = await request.json(); } catch { }
  const t = validStaffEventTell(body?.t);
  const book = await bookOf(room);
  const e = t ? book.find((x) => x.id === t.id) : null;
  if (!t || !e) return json({ ok: false });
  room._sevLive.set(t.id, { ...t, at: Date.now() });
  if (t.top && !room._sevBoards.has(t.id)) {
    room._sevBoards.set(t.id, t.top);
    while (room._sevBoards.size > SEV_BOARDS_KEPT) room._sevBoards.delete(room._sevBoards.keys().next().value);
    await saveBook(room);
  }
  if (['boss', 'done'].includes(body?.done)) await endEvent(room, t.id, body.done);
  return json({ ok: true });
}

/** @param {any} room @param {string} id @param {number} now */
async function eventOf(room, id, now) {
  const c = room._sevCopy;
  const fresh = c && now - c.at < SEV_BOOK_FRESH_MS;
  const e = c?.l.find((/** @type {any} */ x) => x.id === id) ?? null;
  if (fresh && (e || now - c.at < SEV_BOOK_MISS_MS)) return e;
  const rooms = room.env?.ROOMS;
  if (!rooms?.idFromName || !rooms?.get) return e;
  try {
    const res = await rooms.get(rooms.idFromName(SOCIAL_ROOM)).fetch(new Request(`https://relay.internal${SEV_INTERNAL_BOOK}`, { method: 'POST', body: '{}', signal: AbortSignal.timeout(CALL_MS) }));
    const got = res?.ok ? await res.json() : null;
    const l = (Array.isArray(got?.l) ? got.l : []).map(validStaffEvent).filter(Boolean);
    room._sevCopy = { at: now, l };
    return l.find((/** @type {any} */ x) => x.id === id) ?? null;
  } catch (err) { console.warn('[sev] book', /** @type {any} */ (err)?.message ?? err); return e; }
}
/** @param {any} room @param {any} e @param {number} now */
async function ledgerOf(room, e, now) {
  room._sevLed ??= new Map();
  let led = room._sevLed.get(e.id);
  if (!led) {
    let v = null;
    try { v = await room.state.storage.get(STAFF_LEDGER_PREFIX + e.id); } catch { }
    led = v && typeof v === 'object' && v.id === e.id ? v : newStaffLedger(e, now);
    room._sevLed.set(e.id, led);
  }
  return led;
}
const rand32 = () => crypto.getRandomValues(new Uint32Array(1))[0];
/** @param {any} room @param {any} led @param {number} now */
async function payReward(room, led, e, now) {
  led.rw = 1;
  led.rc = {};
  const key = await room._receiptKeyOf?.() ?? null;
  const nowS = Math.floor(now / 1000);
  for (const { acct, rec, rank } of staffEventEarned(led, e.rk)) {
    try { led.rc[acct] = await mintStaffReceipt({ v: led.id, s: acct, c: rand32(), r: rank, h: Math.min(rec.h ?? 0, 9999), g: e.gd ?? 0 }, key, { subtle: crypto.subtle, nowS }); }
    catch (err) { console.warn('[sev] receipt refused', /** @type {any} */ (err)?.message ?? err); }
  }
  led.top = staffEventBoard(led, e.rk);
}
/** @param {any} room @param {any} led */
function sayReward(room, led) {
  const bd = JSON.stringify({ t: 'sev', k: 'bd', id: led.id, top: led.top ?? [] });
  for (const [ws, b] of [...room._all()]) if (b.id) room._send(ws, bd);
  handReceipts(room, led);
}
/** @param {any} room @param {any} led */
function handReceipts(room, led) {
  const newest = new Map();
  for (const [ws, b] of [...room._all()]) {
    if (!b.id || typeof b.sub !== 'string' || !led.rc?.[b.sub]) continue;
    const had = newest.get(b.sub);
    if (!had || (b.since ?? 0) >= (had.b.since ?? 0)) newest.set(b.sub, { ws, b });
  }
  for (const [sub, { ws }] of newest) room._send(ws, JSON.stringify({ t: 'sev', k: 'rc', id: led.id, r: led.rc[sub] }));
}
/** @param {any} room @param {any} led @param {any} e @param {number} now @param {boolean} urgent */
async function keep(room, led, e, now, urgent) {
  const done = staffEventDone(led, e);
  const paying = (led.bk === 1 || !!done) && !led.rw;
  if (paying) await payReward(room, led, e, now);
  try { await room.state.storage.put(STAFF_LEDGER_PREFIX + led.id, led); } catch (err) { console.warn('[sev] ledger', /** @type {any} */ (err)?.message ?? err); }
  const s = JSON.stringify({ t: 'sev', ...staffLedgerState(led) });
  for (const [ws, b] of [...room._all()]) if (b.id) room._send(ws, s);
  if (paying) sayReward(room, led);
  if (done) led.ended = 1;
  room._sevToldAt ??= new Map();
  if (!urgent && !done && now - (room._sevToldAt.get(led.id) ?? 0) < STAFF_EVENT_TELL_MS) return;
  room._sevToldAt.set(led.id, now);
  const rooms = room.env?.ROOMS;
  if (!rooms?.idFromName || !rooms?.get) return;
  try { await rooms.get(rooms.idFromName(SOCIAL_ROOM)).fetch(new Request(`https://relay.internal${SEV_INTERNAL_TELL}`, { method: 'POST', body: JSON.stringify({ t: staffEventTell(led, now), ...(done ? { done } : {}) }), signal: AbortSignal.timeout(CALL_MS) })); }
  catch (err) { console.warn('[sev] tell', /** @type {any} */ (err)?.message ?? err); }
}

/** @param {any} room @param {any} ws @param {any} a @param {any} m @param {number} now */
export async function staffEventWord(room, ws, a, m, now) {
  if (junkOutsideCover(room, ws, a, worldRoom(m.px, m.py))) return;
  if (a.ly) return;
  const e = await eventOf(room, m.id, now);
  if (!e || e.px !== m.px || e.py !== m.py) return;
  const led = await ledgerOf(room, e, now);
  const [px, py] = a.pose ? mapPixelOfWire(a.pose.x, a.pose.z) : [-1, -1];
  const acct = typeof a.sub === 'string' && a.sub ? a.sub : `id:${a.id}`;
  const called = staffBossCall(led, e);
  const r = px === m.px && py === m.py ? foldStaffWord(led, e, acct, a.name ?? '', m, now) : { credited: 0, known: false, boss: false };
  if (called || r.credited > 0 || r.boss) { await keep(room, led, e, now, called || r.boss); return; }
  room._send(ws, JSON.stringify({ t: 'sev', ...staffLedgerState(led) }));
  if (led.rc?.[acct]) room._send(ws, JSON.stringify({ t: 'sev', k: 'rc', id: led.id, r: led.rc[acct] }));
}

/** @param {any} room @param {Request} request */
export async function staffCallInternal(room, request) {
  let body = null;
  try { body = await request.json(); } catch { }
  if (typeof body?.id !== 'string' || !STAFF_EVENT_ID_RE.test(body.id)) return json({ ok: false }, 400);
  const now = Date.now();
  if (body.op === 'end') {
    const led = room._sevLed?.get(body.id);
    const e = validStaffEvent(body.ev);
    if (led && e && e.id === body.id && !led.rw && !led.ended) {
      try { await payReward(room, led, e, now); if (led.top?.length || Object.keys(led.rc ?? {}).length) sayReward(room, led); } catch (err) { console.warn('[sev] end pay', /** @type {any} */ (err)?.message ?? err); }
    }
    if (led) led.ended = 1;
    room._sevCopy = null;
    try { await room.state.storage.delete(STAFF_LEDGER_PREFIX + body.id); } catch { }
    room._sevLed?.delete(body.id);
    return json({ ok: true });
  }
  if (body.op === 'boss') {
    room._sevCopy = null;
    const e = await eventOf(room, body.id, now);
    if (!e) return json({ ok: false });
    const led = await ledgerOf(room, e, now);
    if (staffBossCall(led, e)) await keep(room, led, e, now, true);
    return json({ ok: true });
  }
  return json({ ok: false }, 400);
}
