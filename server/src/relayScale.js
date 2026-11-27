// These live outside index.js: every named export of the entrypoint is read as an entrypoint, and exporting a
// constant or function there stops the Worker from starting.
import { LAYERS_MAX, LAYER_HEADER, LAYER_FULL_HEADER, LAYER_ASK_HEADER, LAYER_EMPTY_HEADER, LAYER_LAST_HEADER, layerName } from './relay.js';

export const IDX_TRUST_MS = 1000;
export const ATTACH_LAZY_MS = 2000;
export const PARTIES_MAX = 4096;
export const HUB_KEEP_MAX = 8192;
export const ACCT_SEEN_WRITE_MS = 10 * 60 * 1000;
export const ROOM_CALL_MS = 5000;
// Past the bound the oldest key goes, never the whole map; setting a key again moves it to the back.
export class Bounded extends Map {
  constructor(max) { super(); this.max = max; }
  set(k, v) {
    if (this.has(k)) this.delete(k);
    else while (this.size >= this.max) this.delete(this.keys().next().value);
    return super.set(k, v);
  }
}

export const METRICS_WINDOW_MS = 5 * 60 * 1000;
export const roomKindOf = (key) => { const k = String(key ?? ''); const i = k.indexOf(':'); return ((i > 0 ? k.slice(0, i) : k).replace(/[^a-z0-9_-]/gi, '').slice(0, 16)) || 'none'; };
// Stored queries read each double and blob by position, so append new counts as blobs and never reorder them.
// After the room's kind and relay version, every blob is a decimal string read back with toUInt32 ('' for no cell
// level), so no blob names a player.
export class RoomMetrics {
  constructor(now = Date.now()) { this.reset(now); }
  reset(now) {
    this.since = now;
    this.c = { hellos: 0, busy: 0, frames: 0, bytesIn: 0, poses: 0, sends: 0, bytesOut: 0, reads: 0, writes: 0, refusals: 0, full: 0, drops: 0, peak: 0, foes: 0, hits: 0, chats: 0, owed: 0, batches: 0, hitDrops: 0, fullDrops: 0, fulls: 0, held: 0, heldSent: 0, heldGone: 0, heldMs: 0, beats: 0, cellMoves: 0, cellBlocked: 0 };
  }
  get busy() { const c = this.c; return c.hellos + c.busy + c.frames + c.sends + c.reads + c.writes + c.refusals + c.full > 0; }
  flush(sink, kind, sockets, version, now = Date.now(), force = false, level = '') {
    if (!force && now - this.since < METRICS_WINDOW_MS) return false;
    const c = this.c, wrote = this.busy && !!sink && typeof sink.writeDataPoint === 'function';
    if (wrote) {
      try {
        sink.writeDataPoint({
          indexes: [kind], blobs: [kind, String(version), String(c.hitDrops), String(c.fullDrops), String(c.fulls), String(c.held), String(c.heldSent), String(c.heldGone), String(Math.round(c.heldMs)), String(c.beats), String(level), String(c.cellMoves), String(c.cellBlocked)],
          doubles: [now - this.since, sockets, c.hellos, c.busy, c.frames, c.bytesIn, c.poses, c.sends, c.bytesOut, c.reads, c.writes, c.refusals,
            c.full, c.drops, Math.max(c.peak, sockets), c.foes, c.hits, c.chats, c.owed, c.batches],
        });
      } catch {  }
    }
    this.reset(now);
    return wrote;
  }
}
export const rowsWritten = (method, args) =>
  method === 'put' && args[0] && typeof args[0] === 'object'
    ? Object.keys(args[0]).length
    : method === 'delete' && Array.isArray(args[0])
      ? args[0].length
      : 1;
// A Proxy, so each storage method is looked up on the real storage at the call and a test that swaps one sees it.
export function countedState(state, metrics) {
  const storage = state?.storage;
  if (!storage) return state;
  const counted = new Proxy(storage, {
    get(t, k) {
      const v = Reflect.get(t, k);
      if (typeof v !== 'function') return v;
      if (k === 'get' || k === 'list') return (...args) => { metrics.c.reads++; return v.apply(t, args); };
      if (k === 'put' || k === 'delete' || k === 'deleteAll' || k === 'setAlarm' || k === 'deleteAlarm')
        return (...args) => {
          metrics.c.writes += rowsWritten(k, args);
          return v.apply(t, args);
        };
      return v.bind(t);
    },
    set(t, k, v) { return Reflect.set(t, k, v); },
  });
  return new Proxy(state, {
    get(t, k) {
      if (k === 'storage') return counted;
      const v = Reflect.get(t, k);
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}

export async function askRoom(rooms, name, request) {
  for (let i = 0; ; i++) {
    try { return await rooms.get(rooms.idFromName(name)).fetch(request); } catch (e) {
      const err = /** @type {{ retryable?: boolean, overloaded?: boolean, message?: string }} */ (e ?? {});
      // Every ask is an upgrade that nothing has run yet, so a retryable error is asked once more. An overloaded
      // one never is, since that only lengthens the queue.
      if (i === 0 && err.retryable && !err.overloaded) continue;
      console.warn('[worker] a room did not answer', name, err.message ?? e);
      return new Response(JSON.stringify({ error: err.overloaded ? 'busy' : 'unavailable' }), { status: 503, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'retry-after': '2' } });
    }
  }
}

export async function layerWalk(rooms, key, request, start) {
  // The page's own walk headers are never passed on. An asked layer that holds nobody answers LAYER_EMPTY_HEADER,
  // and the walk restarts at the place, so a page cannot claim a private empty copy of a place.
  const page = Object.fromEntries(request.headers);
  delete page[LAYER_ASK_HEADER]; delete page[LAYER_LAST_HEADER];
  let ask = start > 0, res = null;
  for (let i = 0; i < LAYERS_MAX; i++) {
    const ly = (start + i) % LAYERS_MAX;
    const headers = { ...page, [LAYER_HEADER]: String(ly) };
    if (ask) headers[LAYER_ASK_HEADER] = '1';
    else if (i === LAYERS_MAX - 1) headers[LAYER_LAST_HEADER] = '1';
    res = await askRoom(rooms, layerName(key, ly), new Request(request, { headers }));
    if (ask) { ask = false; if (res.status === 503 && res.headers.get(LAYER_EMPTY_HEADER) === '1') { start = 0; i = -1; continue; } }
    if (res.status !== 503 || res.headers.get(LAYER_FULL_HEADER) !== '1') return res;
  }
  return res;
}
