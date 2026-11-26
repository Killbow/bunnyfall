// @ts-check
// Staff counts never change a frame, field, or timing that a player receives.
// Both feeds stay off until their URL is set, and counts live in memory only, so a woken room starts over.
import { ID_RE } from '../../src/net/identityToken.js';
import { wrapAngle } from '../../src/world/mat4.js';
import { isCellRoom, foesFrameFull, PIXEL_UNITS, FOES_FIRST_MS } from './relay.js';
import { NET_FEED_MS, NET_FEED_V, REACT_FEED_V, NET_KINDS, REACT_KINDS, REACT_EPISODE_MS, REACT_FIRST_MS, STAFF_FEED_ROWS, STAFF_FEED_SIG_HEADER, STAFF_FEED_POST_MS, STAFF_FEED_AGE_MAX_MS, NET_HOT, FOE_HOT, sealStaffFeed, netRowOk, foeRowOk, reactRowOk } from './staffFeedLaw.js';

export const NET_SLACK_MS = 2_000;
const SLOT_MS = 10_000;
const MINUTE_MS = 60_000;
// Slaughterfish, Dreugh, and Lamia mobile types.
export const FOE_SEA_TYPES = Object.freeze([11, 41, 42]);
// Must match FOE_BOUND.giantType in src/net/foeBounds.js.
const GIANT_TYPE = 16;
export const REACT_OPEN_MAX = 2;
export const REACT_ROOM_OPEN_MAX = 64;
export const REACT_FEED_MS = 10 * 60_000;
// World units are 2.5 cm each.
const UNITS_PER_M = 40;

const KIND_OF = new Map([['pose', 0], ['act', 1], ['cast', 1], ['hit', 2], ['trade', 3], ['foes', 4], ['own', 4], ['chat', 5], ['say', 5]]);
const OTHER = NET_KINDS.length - 1;
// The client writes `t` first (FOES_PREFIX and OWN_PREFIX in src/net/wire.js), so the kind is read without parsing.
const kindOf = (/** @type {unknown} */ message) => (typeof message === 'string' && message.startsWith('{"t":"') ? KIND_OF.get(message.slice(6, message.indexOf('"', 6))) ?? OTHER : OTHER);
const on = (/** @type {unknown} */ url) => typeof url === 'string' && url.startsWith('https://');
const randomId = () => [...crypto.getRandomValues(new Uint8Array(8))].map((x) => x.toString(16).padStart(2, '0')).join('');
/** @param {any[]} rows @param {(r: any) => boolean} ok */
const lawful = (rows, ok) => {
  const out = rows.filter(ok);
  if (out.length < rows.length) console.warn('[staff] rows the law refuses left out', rows.length - out.length);
  return out;
};

/** @param {any} room @param {string} url @param {{ body: Uint8Array, sig: string }} sealed */
async function post(room, url, sealed) {
  const init = { method: 'POST', headers: { 'content-type': 'application/json', [STAFF_FEED_SIG_HEADER]: sealed.sig }, body: sealed.body, signal: AbortSignal.timeout(STAFF_FEED_POST_MS) };
  try {
    const svc = room.env?.ACCOUNTS;
    const res = typeof svc?.fetch === 'function' ? await svc.fetch(new Request(url, init)) : await fetch(url, init);
    if (!res.ok) console.warn('[staff] the service said', res.status);
    return res.ok ? 'ok' : res.status >= 500 ? 'failed' : 'refused';
  } catch (e) { console.warn('[staff] post failed', e?.message ?? e); return 'failed'; }
}

/** @param {any} room @param {any} W @param {string} url @param {any} batch @param {() => void} arm */
async function send(room, W, url, batch, arm) {
  const old = W.retry;
  W.retry = null;
  if (old && Date.now() - old.at < STAFF_FEED_AGE_MAX_MS && (await post(room, url, old.sealed)) === 'failed') W.retry = old;
  const sealed = batch && await sealStaffFeed(batch, await room._receiptKeyOf(), { subtle: crypto.subtle });
  const r = sealed ? await post(room, url, sealed) : 'refused';
  if (r === 'failed') W.retry = { sealed, at: batch.at };
  if (W.retry) arm();
  return r === 'ok';
}

// A hot window posts on the next frame after it ends or when the room drains; no timer keeps the object awake.
const netOf = (/** @type {any} */ room) => (room._staffNet ??= { rows: new Map(), foes: new Map(), from: 0, q: null, timer: null, retry: null });
const netBegin = (/** @type {number} */ w, /** @type {any} */ m) => ({ w, slot: -1, min: -1, c10: 0, b10: 0, c60: 0, b60: 0, p10: 0, pb10: 0, p60: 0, pb60: 0, n: 0, b: 0,
  k: NET_KINDS.map(() => 0), nr0: m.nr | 0, j0: m.junk | 0, c0: m.nc | 0, hot: false });
/** @param {any} s */
const netPeaks = (s) => { s.p10 = Math.max(s.p10, s.c10); s.pb10 = Math.max(s.pb10, s.b10); s.p60 = Math.max(s.p60, s.c60); s.pb60 = Math.max(s.pb60, s.b60); };
export const netHot = (/** @type {any} */ s, /** @type {any} */ m) => s.p10 >= NET_HOT.frames10 || s.pb10 >= NET_HOT.bytes10 || (m.nr | 0) > s.nr0 || (m.junk | 0) > s.j0 || (m.nc | 0) > s.c0;

/** @param {any} room @param {any} ws @param {unknown} message @param {number} now */
export function staffNetFrame(room, ws, message, now) {
  if (!on(room.env?.STAFF_NET_FEED_URL)) return;
  const m = room._meterOf(ws);
  const w = Math.floor(now / NET_FEED_MS);
  const rolled = !!(m.nf && m.nf.w !== w);
  if (rolled) netFold(room, m, room._attach(ws));
  const s = (m.nf ??= netBegin(w, m));
  const slot = Math.floor(now / SLOT_MS);
  if (slot !== s.slot) {
    netPeaks(s);
    s.slot = slot; s.c10 = 0; s.b10 = 0;
    const min = Math.floor(now / MINUTE_MS);
    if (min !== s.min) { s.min = min; s.c60 = 0; s.b60 = 0; }
  }
  const bytes = typeof message === 'string' ? message.length : (/** @type {any} */ (message)?.byteLength ?? 0);
  s.c10++; s.c60++; s.n++; s.b10 += bytes; s.b60 += bytes; s.b += bytes;
  s.k[kindOf(message)]++;
  if (!s.hot && (s.c10 >= NET_HOT.frames10 || s.b10 >= NET_HOT.bytes10 || netHot(s, m))) { s.hot = true; netOf(room); }
  if (rolled) {
    const W = room._staffNet;
    if (W && (W.rows.size || W.foes.size || W.retry)) void staffNetFlush(room, now);
  }
}

/** @param {any} room @param {any} ws @param {unknown} why */
export function staffNetClosed(room, ws, why) {
  if (typeof why !== 'string' || !why.startsWith('too many') || !on(room.env?.STAFF_NET_FEED_URL)) return;
  const m = room._meterOf(ws);
  m.nc = (m.nc | 0) + 1;
  m.nw = why.slice(0, 40);
}

/** @param {any} room @param {any} m @param {any} a */
function netFold(room, m, a) {
  const s = m.nf;
  m.nf = null;
  if (!s) return;
  netPeaks(s);
  if (!s.hot && !netHot(s, m)) return;
  const acct = a?.sub || a?.id;
  if (typeof acct !== 'string' || !ID_RE.test(acct)) return;
  const W = netOf(room);
  W.q ??= a.key ?? null;
  if (!W.from || s.w * NET_FEED_MS < W.from) W.from = Math.max(1, s.w * NET_FEED_MS);
  const c = (m.nc | 0) - s.c0;
  const row = W.rows.get(acct) ?? { a: acct, n: 0, b: 0, p10: 0, pb10: 0, p60: 0, pb60: 0, k: NET_KINDS.map(() => 0), nr: 0, j: 0, c: 0 };
  row.n += s.n; row.b += s.b; row.nr += (m.nr | 0) - s.nr0; row.j += (m.junk | 0) - s.j0; row.c += c;
  row.p10 = Math.max(row.p10, s.p10); row.pb10 = Math.max(row.pb10, s.pb10); row.p60 = Math.max(row.p60, s.p60); row.pb60 = Math.max(row.pb60, s.pb60);
  s.k.forEach((x, i) => { row.k[i] += x; });
  if (c > 0 && m.nw) row.w = m.nw;
  W.rows.set(acct, row);
  if (W.rows.size + W.foes.size >= STAFF_FEED_ROWS * 4) void staffNetFlush(room);
}

export const foeHot = (/** @type {any} */ r) => r.o >= FOE_HOT.own || r.h >= FOE_HOT.host || r.x > 0;
/** @param {any} room @param {any} a @param {boolean} make */
function foeRow(room, a, make) {
  const acct = a?.sub || a?.id;
  if (typeof acct !== 'string' || !ID_RE.test(acct)) return null;
  const W = netOf(room);
  W.q ??= a.key ?? null;
  let row = W.foes.get(acct);
  if (!row && make) {
    if (W.rows.size + W.foes.size >= STAFF_FEED_ROWS * 4) void staffNetFlush(room);
    row = { a: acct, o: 0, h: 0, r: 0, e: 0, bo: 0, s: 0, x: 0 };
    W.foes.set(acct, row);
  }
  return row ?? null;
}
/** @param {any} room @param {any} a @param {any} data @param {number} now @param {any} [lane] */
export function staffFoesSeen(room, a, data, now, lane) {
  if (!on(room.env?.STAFF_NET_FEED_URL) || !foesFrameFull(data) || !Array.isArray(data?.f)) return;
  if (lane) { if (now - (lane.counted ?? -Infinity) < FOES_FIRST_MS) return; lane.counted = now; }
  /** @type {Map<unknown, any>} */
  const live = new Map();
  for (const r of data.f) if (r && typeof r === 'object' && r.d !== 1 && r.i != null) live.set(r.i, r);
  const indoor = !isCellRoom(a.key);
  const row = foeRow(room, a, live.size >= (indoor ? FOE_HOT.host : FOE_HOT.own));
  if (!row) return;
  if (indoor) row.h = Math.max(row.h, live.size);
  else if (live.size > row.o) {
    row.o = live.size; row.r = 0; row.e = 0; row.bo = 0; row.s = 0;
    for (const r of live.values()) {
      if (Number.isInteger(r.cp) || (typeof r.nm === 'string' && r.nm) || (Number.isInteger(r.gg) && r.t === GIANT_TYPE)) row.bo++;
      else if (r.z === 1) row.e++;
      else if (FOE_SEA_TYPES.includes(r.t)) row.s++;
      else row.r++;
    }
  }
}
/** @param {any} room @param {any} a @param {number} n @param {number} now */
export function staffFoesStripped(room, a, n, now) {
  void now;
  if (!on(room.env?.STAFF_NET_FEED_URL)) return;
  const row = foeRow(room, a, true);
  if (!row) return;
  row.x += n;
}

const netUrgent = (/** @type {any} */ x, /** @type {any} */ y) => y.c - x.c || (y.nr + y.j) - (x.nr + x.j) || y.p10 - x.p10 || y.pb10 - x.pb10;
const foeUrgent = (/** @type {any} */ x, /** @type {any} */ y) => y.x - x.x || y.o - x.o || y.h - x.h;

/** @param {any} room @param {number} [now] */
export async function staffNetFlush(room, now = Date.now()) {
  const W = room._staffNet;
  if (!W) return false;
  if (W.timer) { clearTimeout(W.timer); W.timer = null; }
  const url = room.env?.STAFF_NET_FEED_URL;
  const w = Math.floor(now / NET_FEED_MS);
  for (const [ws, a] of room._all()) { const m = room._meters.get(ws); if (m?.nf && m.nf.w < w) netFold(room, m, a); }
  const rows = lawful([...W.rows.values()], netRowOk).sort(netUrgent);
  const foes = lawful([...W.foes.values()], foeRowOk).sort(foeUrgent);
  const batch = rows.length || foes.length ? (() => {
    const net = rows.slice(0, STAFF_FEED_ROWS - Math.min(foes.length, STAFF_FEED_ROWS / 2));
    return { v: NET_FEED_V, id: randomId(), at: now, q: W.q, from: W.from || now, ms: 1, net, foe: foes.slice(0, STAFF_FEED_ROWS - net.length) };
  })() : null;
  W.rows = new Map(); W.foes = new Map(); W.from = 0;
  if (!on(url) || (!batch && !W.retry)) return false;
  return send(room, W, url, batch, () => {});
}

const reactOf = (/** @type {any} */ room) => (room._staffReact ??= { open: new Map(), openN: 0, rows: [], from: 0, q: null, timer: null, retry: null });

/** @param {any} room @param {any} ws @param {any} a @param {any} gr @param {number} now */
export function staffReactAsk(room, ws, a, gr, now) {
  if (!on(room.env?.REACTION_FEED_URL) || !REACT_KINDS.includes(gr?.k) || !isCellRoom(a.key) || typeof a.sub !== 'string' || !ID_RE.test(a.sub)) return;
  const R = reactOf(room);
  const mine = R.open.get(ws) ?? [];
  if (mine.length >= REACT_OPEN_MAX || R.openN >= REACT_ROOM_OPEN_MAX) return;
  const p = a.pose ?? {};
  mine.push({ a: a.sub, k: gr.k, n: gr.n, t0: now, last: p, w0: p.wd ? 1 : 0, hk: p.hk | 0, hu: p.hu | 0, ps: 0, mv: 0, tn: 0, at: {} });
  R.open.set(ws, mine);
  R.openN++;
  R.q ??= a.key;
}

/** @param {any} room @param {any} ws @param {any} p @param {number} now */
export function staffReactPose(room, ws, p, now) {
  const mine = room._staffReact?.open.get(ws);
  if (mine) for (const e of [...mine]) {
    const t = now - e.t0;
    if (t > REACT_EPISODE_MS) { reactClose(room, ws, e, now); continue; }
    const q = e.last, at = e.at;
    e.ps++;
    at.p1 ??= t;
    if (p.wd && !q.wd) at.wd ??= t;
    if ((p.an | 0) !== (q.an | 0) || (p.cn | 0) !== (q.cn | 0) || (p.ar | 0) !== (q.ar | 0)) at.ac ??= t;
    if ((p.hk | 0) > e.hk) { at.hk ??= t; e.hk = p.hk | 0; }
    if ((p.hu | 0) > e.hu) { at.hu ??= t; e.hu = p.hu | 0; }
    if (t <= REACT_FIRST_MS && Number.isFinite(q.x) && Number.isFinite(q.z)) {
      const step = Math.hypot(p.x - q.x, p.z - q.z);
      // A step longer than a cell is a teleport, not movement.
      if (step <= PIXEL_UNITS) e.mv += step;
      e.tn += Math.abs(wrapAngle(p.yaw - q.yaw));
    }
    e.last = p;
    if (p.dd) { at.dd = t; reactClose(room, ws, e, now); }
  }
  const R = room._staffReact;
  if (R && (R.rows.length || R.retry) && R.from && now - R.from >= REACT_FEED_MS) void staffReactFlush(room, now);
}

/** @param {any} room @param {any} ws @param {any} e @param {number} now */
function reactClose(room, ws, e, now) {
  const R = reactOf(room);
  const mine = R.open.get(ws) ?? [];
  const i = mine.indexOf(e);
  if (i < 0) return;
  mine.splice(i, 1);
  if (!mine.length) R.open.delete(ws);
  R.openN--;
  const ms = Math.min(REACT_EPISODE_MS, Math.max(0, now - e.t0));
  const times = Object.fromEntries(Object.entries(e.at).filter(([, v]) => v <= ms));
  R.rows.push({ a: e.a, k: e.k, n: e.n, t: e.t0, ms, ps: e.ps, w0: e.w0, mv: Math.round((e.mv / UNITS_PER_M) * 10), tn: Math.round(e.tn * 100), ...times });
  if (!R.from) R.from = now;
  if (R.rows.length >= STAFF_FEED_ROWS) void staffReactFlush(room);
}

/** @param {any} room @param {number} [now] */
export async function staffReactTick(room, now = Date.now()) {
  const R = reactOf(room);
  for (const [ws, mine] of [...R.open]) for (const e of [...mine]) if (now - e.t0 >= REACT_EPISODE_MS) reactClose(room, ws, e, now);
  if ((R.rows.length || R.retry) && now - R.from >= REACT_FEED_MS) await staffReactFlush(room, now);
}

/** @param {any} room @param {number} [now] */
export async function staffReactFlush(room, now = Date.now()) {
  const R = room._staffReact;
  if (!R) return false;
  const rows = lawful(R.rows.splice(0, STAFF_FEED_ROWS), (r) => reactRowOk(r, now));
  R.from = R.rows.length ? now : 0;
  const url = room.env?.REACTION_FEED_URL;
  if (!on(url) || (!rows.length && !R.retry)) return false;
  const went = await send(room, R, url, rows.length ? { v: REACT_FEED_V, id: randomId(), at: now, q: R.q, rows } : null, () => {});
  // A failed batch waits a full window before it goes again, the same pace as the net feed.
  R.from ||= R.retry ? now : 0;
  return went;
}

/** @param {any} room */
export function staffFeedsStop(room) {
  for (const W of [room._staffNet, room._staffReact]) if (W?.timer) { clearTimeout(W.timer); W.timer = null; }
}

/** @param {any} room @param {any} ws @param {any} a @param {number} now */
export function staffLeft(room, ws, a, now) {
  const m = room._meters?.get(ws);
  if (m?.nf) netFold(room, m, a);
  const mine = room._staffReact?.open.get(ws);
  if (mine) for (const e of [...mine]) reactClose(room, ws, e, now);
}
