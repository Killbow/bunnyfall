// @ts-check
// Hands a departing cell node's rows to the nodes that now hold their pixels. A take is idempotent by each row's
// own key, so a repeated handover leaves every receiver as one handover would. This is not in index.js because
// every named export of the entrypoint is read as an entrypoint.
import { partitionRows, nodeBounds } from '../../src/net/cellTree.js';
import { owLedgerOf, owIdPixel, owPrune, owGraveKey, owRowKey } from '../../src/net/overworldLaw.js';
import { OW_LEDGER_KEY, parkSpotOf, mapPixelOfWire, SWEEP_PAGE } from './relay.js';
import { ROOM_CALL_MS } from './relayScale.js';
import { FREEZES_KEY } from './staffFreeze.js';

/**
 * @typedef {object} NodeRows
 * @property {Array<[string, any]>} parks
 * @property {any} led
 * @property {Record<string, unknown>} copy
 */
/**
 * @typedef {object} HandoverPayload
 * @property {number} v
 * @property {Array<[string, any]>} parks
 * @property {Array<[string, number]>} sp
 * @property {any[]} dg
 * @property {any[]} gr
 * @property {Record<string, unknown>} copy
 */

export const CELL_INTERNAL_TAKE = '/internal/cells/take';
export const CELL_MOVED_KEY = 'cellmoved';
export const CELL_PULLED_KEY = 'cellpulled';
export const HANDOVER_V = 1;
// Any key no entry names blocks the move, so a store this file does not know stops a repartition instead of
// being lost by it.
export const KEY_CLASSES = Object.freeze([
  ['park:', 'part', 'a parked team - by its spot'],
  [OW_LEDGER_KEY, 'part', 'the overworld ledger - its spent ids, dungeons and graves, each by its pixel'],
  ['relaycfg', 'copy', 'the relay\'s settings, as the hub said them'],
  ['bans', 'copy', 'the room\'s bans'],
  [FREEZES_KEY, 'copy', 'the room\'s freezes'],
  ['look:', 'drop', 'an id\'s look - swept at the drain, said again at its hello'],
  ['secret:', 'drop', 'an id\'s secret - swept at the drain, said again at its hello'],
  ['hellos', 'drop', 'a relay before SCALE2b\'s hello bucket'],
  [CELL_MOVED_KEY, 'drop', 'when a move closed this node - a node that takes rows is one again'],
  [CELL_PULLED_KEY, 'drop', 'the fine cells a coarse node pulled at the seed - a cell that gave once gives nothing again'],
].map((entry) => Object.freeze(entry)));
/** @param {string} key */
export const keyClass = (key) => {
  for (const [pattern, kind] of KEY_CLASSES) if (pattern.endsWith(':') ? key.startsWith(pattern) : key === pattern) return kind;
  return 'block';
};

/** @param {any} storage @param {number} [max] */
export async function blockersOf(storage, max = 8) {
  const blockers = [];
  let after = null;
  for (;;) {
    const page = await storage.list({ limit: SWEEP_PAGE, ...(after ? { startAfter: after } : {}) });
    for (const key of page.keys()) {
      if (keyClass(key) === 'block') {
        blockers.push(key);
        if (blockers.length >= max) return blockers;
      }
      after = key;
    }
    if (page.size < SWEEP_PAGE) return blockers;
  }
}

/** @param {any} record @returns {[number, number] | null} */
export const parkPixel = (record) => {
  const spot = parkSpotOf(record?.r);
  return spot && Number.isFinite(spot[0]) && Number.isFinite(spot[1]) ? /** @type {[number, number]} */ (mapPixelOfWire(spot[0], spot[1])) : null;
};

/** @param {NodeRows} rows @param {string[]} targets @returns {Map<string, HandoverPayload>} */
export function handoverPayloads(rows, targets) {
  const square = targets.map(nodeBounds).reduce((union, bounds) => (union && bounds ? { x0: Math.min(union.x0, bounds.x0), y0: Math.min(union.y0, bounds.y0), x1: Math.max(union.x1, bounds.x1), y1: Math.max(union.y1, bounds.y1) } : null));
  if (!square) throw new Error('handover: a target that is no node');
  // A ledger row may sit up to OW_CELL_MARGIN_PX past its cell, so a pixel outside the square goes to the
  // nearest target.
  const clamp = (/** @type {[number, number] | null} */ pixel) => (pixel ? /** @type {[number, number]} */ ([Math.min(Math.max(pixel[0], square.x0), square.x1 - 1), Math.min(Math.max(pixel[1], square.y0), square.y1 - 1)]) : null);
  const parks = partitionRows(rows.parks, ([, record]) => clamp(parkPixel(record)), targets).by;
  const spent = partitionRows(rows.led.sp, (entry) => {
    const pixel = owIdPixel(entry[0]);
    return clamp(pixel ? [pixel.x, pixel.y] : null);
  }, targets).by;
  const dungeons = partitionRows(Object.values(rows.led.dg), (row) => clamp([row[0], row[1]]), targets).by;
  const graves = partitionRows(Object.values(rows.led.gr ?? {}), (grave) => clamp([grave[0], grave[1]]), targets).by;
  return new Map(targets.map((target) => [target, { v: HANDOVER_V, parks: parks.get(target), sp: spent.get(target), dg: dungeons.get(target), gr: graves.get(target), copy: rows.copy }]));
}

/** @param {any} env */
export const roomPost = (env) => async (/** @type {string} */ target, /** @type {any} */ payload) => {
  const response = await env.ROOMS.get(env.ROOMS.idFromName(target)).fetch(new Request(`https://relay.internal${CELL_INTERNAL_TAKE}`, { method: 'POST', body: JSON.stringify(payload), signal: AbortSignal.timeout(ROOM_CALL_MS) }));
  return response.ok;
};

// A move hands over twice: first with `keep` while the node still serves sockets, then at the close with `force`.
// At the close, a blocking key that arrived since the first send is left behind and named in `orphaned`.
/**
 * @param {any} room
 * @param {string[]} targets
 * @param {(target: string, payload: any) => Promise<boolean>} post
 * @param {number} [now]
 * @param {{ keep?: boolean, force?: boolean }} [how]
 */
export async function handOver(room, targets, post, now = Date.now(), { keep = false, force = false } = {}) {
  const storage = room.state.storage;
  const blocked = await blockersOf(storage);
  if (blocked.length && !force) return { ok: false, blocked };
  const orphaned = blocked.length ? { orphaned: blocked } : {};
  const rows = await rowsOf(storage, now);
  if (emptyRows(rows)) return { ok: true, sent: {}, ...orphaned };
  const payloads = handoverPayloads(rows, targets);
  const postOnce = async (/** @type {string} */ target) => {
    try {
      return await post(target, payloads.get(target));
    } catch {
      return false;
    }
  };
  const failed = [];
  for (const target of targets) if (!(await postOnce(target)) && !(await postOnce(target))) failed.push(target);
  if (failed.length) return { ok: false, failed };
  if (!keep) await letGo(room, rows.parks);
  return { ok: true, sent: Object.fromEntries([...payloads].map(([target, payload]) => [target, payload.parks.length + payload.sp.length + payload.dg.length + payload.gr.length])), ...orphaned };
}
/** @param {any} storage @param {number} now @returns {Promise<NodeRows>} */
export async function rowsOf(storage, now) {
  const parks = [...(await storage.list({ prefix: 'park:' }))];
  const ledger = owLedgerOf(await storage.get(OW_LEDGER_KEY));
  owPrune(ledger, now);
  const copy = /** @type {Record<string, unknown>} */ ({});
  for (const [key, kind] of KEY_CLASSES)
    if (kind === 'copy') {
      const value = await storage.get(key);
      if (value !== undefined) copy[key] = value;
    }
  return { parks, led: ledger, copy };
}
/** @param {{ parks: any[], led: any, copy: object }} rows */
const emptyRows = (rows) => !rows.parks.length && !rows.led.sp.length && !Object.keys(rows.led.dg).length && !Object.keys(rows.led.gr ?? {}).length && !Object.keys(rows.copy).length;
/** @param {any} room @param {Array<[string, any]>} parks */
export async function letGo(room, parks) {
  const storage = room.state.storage;
  const handed = parks.map(([key]) => key);
  // The runtime deletes at most 128 keys a call.
  for (let offset = 0; offset < handed.length; offset += 128) await storage.delete(handed.slice(offset, offset + 128));
  await storage.delete(OW_LEDGER_KEY);
  room._parks = null;
  room._owLoad = null;
}

/** @param {any} room @param {any} payload @param {number} [now] */
export async function takeHandover(room, payload, now = Date.now()) {
  if (!payload || payload.v !== HANDOVER_V) return null;
  const storage = room.state.storage;
  let taken = 0;
  if (room._cellMoved !== null) {
    await storage.delete(CELL_MOVED_KEY);
    room._cellMoved = null;
  }
  const keptParks = room._parks ? await room._parks : null;
  for (const entry of Array.isArray(payload.parks) ? payload.parks : []) {
    const [key, record] = Array.isArray(entry) ? entry : [];
    if (typeof key !== 'string' || keyClass(key) !== 'part' || !key.startsWith('park:') || typeof record?.k !== 'string') continue;
    const standing = await storage.get(key);
    if (standing && (standing.at ?? 0) >= (record.at ?? 0)) continue;
    await storage.put(key, record);
    keptParks?.set(key, record);
    taken++;
  }
  const ledger = await room._owLedger(now);
  const ends = new Map(ledger.sp.map((/** @type {[string, number]} */ entry) => [entry[0], entry[1]]));
  for (const entry of Array.isArray(payload.sp) ? payload.sp : [])
    if (Array.isArray(entry) && typeof entry[0] === 'string' && Number.isFinite(entry[1]) && !(ends.get(entry[0]) >= entry[1])) {
      ends.set(entry[0], entry[1]);
      taken++;
    }
  const dungeons = { ...ledger.dg };
  for (const row of Array.isArray(payload.dg) ? payload.dg : []) {
    if (!Array.isArray(row)) continue;
    const key = owRowKey(row[0], row[1]);
    if (!(dungeons[key]?.[2] >= row[2])) {
      dungeons[key] = row;
      taken++;
    }
  }
  const graves = { ...(ledger.gr ?? {}) };
  for (const grave of Array.isArray(payload.gr) ? payload.gr : []) {
    if (!Array.isArray(grave)) continue;
    const key = owGraveKey(grave);
    if (!graves[key]) {
      graves[key] = grave;
      taken++;
    }
  }
  const merged = owLedgerOf({ sp: [...ends].sort((left, right) => left[1] - right[1]), dg: dungeons, gr: graves });
  owPrune(merged, now);
  // Merge into the instance's own ledger object, so the next frame reads the merged ledger.
  Object.assign(ledger, merged);
  await room._owWrite(ledger);
  for (const [key, value] of Object.entries(payload.copy && typeof payload.copy === 'object' ? payload.copy : {})) {
    if (keyClass(key) === 'copy' && (await storage.get(key)) === undefined) await storage.put(key, value);
  }
  return taken;
}

/** @param {any} room @param {Request} request */
export async function cellTakeInternal(room, request) {
  let body = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const taken = await takeHandover(room, body);
  return new Response(JSON.stringify(taken == null ? { error: 'not a handover' } : { ok: true, n: taken }), { status: taken == null ? 400 : 200, headers: { 'content-type': 'application/json' } });
}
