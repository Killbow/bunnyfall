// @ts-check
// Renders a loaded v2 POI's flat-picture rows (`flats`) through the house-decoration room (scenes/decor/decorRoom.js),
// creating one room per POI that has flats (just as scenes/homeYards.js does for yards). Billboards face the camera and
// mirror past 90 degrees, person sprites stay at scale 1, paperdoll items render as their world sprites, mounts
// (weapons, armor, and trophies) render flat on the decal pass, and lit flats contribute to the POI's lights. Owned by
// scenes/poiHost.js. The runtime ignores `layer` (flats sort by depth), `pivot` (flats sit on their base and mounts
// hang from their center), and `collide` (flats have no colliders), as noted in the inspector (ui/poi/poiFlatUi.js).

import { createDecorRoom, decorIdOfKey } from '../homes/decorRoom.js';
import { decorIsFigure } from '../net/decorLaw.js';
import { decorItemFlat, decorMountItem } from '../homes/decorItems.js';
import { inventoryItemImage } from '../items/itemTemplates.js';
import { trophyArchiveOf } from '../systems/hunt/trophies.js';
import { TROPHY_TEMPLATE } from '../net/trophyLaw.js';
import { quatRotate } from '../world/quat.js';
import { flatYawThrough, mountRotThrough } from './poiFlatRows.js';

export { flatYawThrough, mountRotThrough };

/** Maximum number of lit flats per POI: only the first `POI_FLAT_LIGHTS_MAX` lit rows in room order emit light
 *  (matching scenes/homeYards.js YARD_LAMPS_MAX), and any remaining rows render unlit. */
export const POI_FLAT_LIGHTS_MAX = 8;
/** Maximum number of rooms per frame that may merge static flats sharing a texture into a single batch
 *  (decorRoom.js). */
export const POI_FLAT_MERGES_A_FRAME = 1;
/** Flicker rate in steps per second and maximum range reduction for flickering flat lights (matching
 *  scenes/poiHost.js). */
const FLICKER_HZ = 12, FLICKER_DEPTH = 0.25;

/**
 * Resolves the `[archive, record]` texture of a flat row, or null. Uses `row.flat` when set; otherwise uses `row.item`:
 * a paperdoll item takes its template's world sprite (systems/decor/decorItems.js decorItemFlat), a mount its inventory
 * sprite (systems/item/itemTemplates.js inventoryItemImage), and a trophy the beast plaque sprite for `row.item.p`
 * (systems/hunt/trophies.js trophyArchiveOf; null when `p` is missing). The World Builder saves paperdoll and mount
 * rows with `item` and no `flat`.
 * @param {any} row
 */
export function poiFlatPicture(row) {
  if (Array.isArray(row?.flat)) return row.flat;
  const it = row?.item;
  if (!it || !Number.isInteger(it.t)) return null;
  if (it.t === TROPHY_TEMPLATE) {
    const a = Number.isInteger(it.p) ? trophyArchiveOf(it.p) : null;
    return a == null ? null : [a, 0];
  }
  if (row.kind === 'mount') {
    const item = decorMountItem(it);
    const pic = item ? inventoryItemImage(item) : null;
    return pic && Number.isInteger(pic.archive) && Number.isInteger(pic.record) ? [pic.archive, pic.record] : null;
  }
  return decorItemFlat({ templateIndex: it.t });
}

/**
 * Converts a flat row into a decor piece `{ id, flat, item?, pos, rot, scale, light? }` for scenes/decor/decorRoom.js
 * `put()`, or returns null if the row has no sprite. Transforms `pos` by `place`'s rotation and scale relative to the
 * room origin (so world recentering or terrain height updates only move the room origin), rotates billboard yaw by the
 * POI's heading and mount Euler angles by its full rotation, multiplies row scale and light radius by `place.s`, and
 * locks person sprites to scale 1. @param {any} row @param {{ r: number[], s: number }} place
 */
export function poiFlatPiece(row, place) {
  if (!row || typeof row.key !== 'string' || !Array.isArray(row.t)) return null;
  const flat = poiFlatPicture(row);
  if (!flat) return null;
  const q = Array.isArray(place?.r) ? place.r : [0, 0, 0, 1];
  const s = Number.isFinite(place?.s) ? place.s : 1;
  const at = quatRotate(q, row.t);
  const rot = Array.isArray(row.rot) ? row.rot : [0, 0, 0];
  /** @type {any} */
  const piece = {
    id: row.key, flat: [flat[0], flat[1]],
    pos: [at[0] * s, at[1] * s, at[2] * s],
    rot: row.kind === 'mount' ? mountRotThrough(q, rot) : [flatYawThrough(q, rot[0]), rot[1] ?? 0, rot[2] ?? 0],
    scale: (Number.isFinite(row.scale) ? row.scale : 1) * s,
  };
  if (row.kind !== 'billboard' && row.item && typeof row.item === 'object') piece.item = { ...row.item };
  if (decorIsFigure(piece)) piece.scale = 1;
  const l = row.light;
  if (l && Array.isArray(l.color)) piece.light = { range: l.radius * s, intensity: l.intensity, color: [l.color[0], l.color[1], l.color[2]], flicker: !!l.flicker };
  return piece;
}

/** Returns the ray intersection distance to a `{ min, max }` axis-aligned bounding box (slab test), or null if it
 *  misses within `max`. */
function rayAabb(o, d, b, max) {
  let lo = 0, hi = max;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-12) { if (o[a] < b.min[a] || o[a] > b.max[a]) return null; continue; }
    let t0 = (b.min[a] - o[a]) / d[a], t1 = (b.max[a] - o[a]) / d[a];
    if (t0 > t1) { const k = t0; t0 = t1; t1 = k; }
    lo = Math.max(lo, t0); hi = Math.min(hi, t1);
    if (lo > hi) return null;
  }
  return lo;
}

/**
 * Creates the manager for POI flat pictures. Forwards renderer and texture callbacks to each POI's decor room, uses
 * `flatAnims(px, py)` to animate multi-frame flats on map square `(px, py)` in sync with nearby town flats, and uses
 * `now` for light flicker and batch-merge timing.
 * @param {{ renderer: any, getTexture?: any, uploadRecord?: any, uploadRecordFrame?: any, flatAnims?: ((px: number, py: number) => any) | null, now?: () => number }} deps
 */
export function createPoiFlats({ renderer, getTexture = null, uploadRecord = null, uploadRecordFrame = null, flatAnims = null, now = () => Date.now() }) {
  /** maps POI id to its decor room and last synced state */
  const pools = new Map();
  /** dense array of the same pool entries for index-based iteration without per-frame iterator allocation */
  const list = [];
  let mergesLeft = 0;
  const merge = { take: () => { if (mergesLeft <= 0) return false; mergesLeft--; return true; }, now };
  /** reusable per-frame light and billboard-batch arrays, cleared with `pop()` to retain backing capacity across
   *  frames */
  const lit = [];
  const outBatches = [];
  const empty = (a) => { while (a.length) a.pop(); };
  /** current frame counter used to cache each POI's bounding boxes (`boxOf`) once per frame */
  let frameNo = 0;

  function make(s) {
    const p = { id: s.id, px: s.px, py: s.py, o: [0, 0, 0], doc: null, sigs: new Map(), rows: [], on: false, room: null, boxes: null, boxesAt: -1 };
    p.room = createDecorRoom({
      meshes: null, renderer, getTexture, uploadRecord, uploadRecordFrame, collider: () => null, origin: () => p.o,
      flatAnims: () => flatAnims?.(p.px, p.py) ?? null, merge,
    });
    pools.set(s.id, p);
    list.push(p);
    return p;
  }

  /** Synchronizes pool `p`'s decor room with `doc.flats`, updating changed pieces and removing deleted ones. */
  function restock(p, doc) {
    const seen = new Set();
    for (const row of doc.flats ?? []) {
      const piece = poiFlatPiece(row, doc.place);
      if (!piece || seen.has(piece.id)) continue;
      seen.add(piece.id);
      const sig = JSON.stringify(piece);
      if (p.sigs.get(piece.id) === sig) continue;
      p.sigs.set(piece.id, sig);
      p.room.put(piece);
    }
    for (const id of [...p.sigs.keys()]) if (!seen.has(id)) { p.sigs.delete(id); p.room.remove(id); }
  }

  return {
    /** Starts a new frame: resets the per-frame batch-merge budget and marks all POI flat rooms hidden until
     *  `sync()` marks them active. */
    frame() {
      mergesLeft = POI_FLAT_MERGES_A_FRAME;
      frameNo++;
      for (let i = 0; i < list.length; i++) list[i].on = false;
    },
    /**
     * Synchronizes an active POI for the current frame (`s` holds its `id`, `doc`, `px`, `py`, and `y`, the POI's
     * height in its map square's frame; `t` is the map square's translation). Creates the decor room when the POI first
     * has flats, moves the room origin when the POI moves, and updates changed pieces when `s.doc` changes; builds
     * nothing when neither changed.
     */
    sync(s, t) {
      let p = pools.get(s.id);
      if (!p) { if (!Array.isArray(s.doc.flats) || !s.doc.flats.length) return; p = make(s); }
      p.on = true;
      p.px = s.px; p.py = s.py;
      const pl = s.doc.place;
      const ox = t[0] + pl.x, oy = t[1] + s.y, oz = t[2] + pl.z;
      if (ox !== p.o[0] || oy !== p.o[1] || oz !== p.o[2]) { p.o[0] = ox; p.o[1] = oy; p.o[2] = oz; p.room.restand(); p.boxes = null; }
      if (p.doc !== s.doc) { p.doc = s.doc; restock(p, s.doc); p.boxes = null; }
    },
    /** Destroys a POI's decor room and removes its state when the POI is unloaded. */
    drop(id) {
      const p = pools.get(id);
      if (!p) return;
      p.room.destroyAll();
      pools.delete(id);
      const i = list.indexOf(p);
      if (i >= 0) list.splice(i, 1);
    },
    /** Hides all POI flat rooms when leaving the outdoor world (scenes/poiHost.js standDown) until `sync()` runs
     *  again. */
    hideAll() { for (let i = 0; i < list.length; i++) list[i].on = false; },
    /** Collects billboard batches from all active POI flat rooms into a single reusable array for the world's
     *  billboard pass. Calls `room.draw(null)` on each active room first so static flats sharing a texture can merge
     *  into a single batch (decorRoom.js). */
    batches() {
      empty(outBatches);
      for (let i = 0; i < list.length; i++) if (list[i].on) { list[i].room.draw(null); list[i].room.batchesSeen(outBatches); }
      return outBatches;
    },
    /** Draws mounted flats for all active POIs on the world's decal pass and returns the number of mounts drawn. */
    drawMounts(r = renderer) {
      let n = 0;
      for (let i = 0; i < list.length; i++) if (list[i].on) n += list[i].room.drawMounts(r);
      return n;
    },
    /** Appends scene-light records (`{ x, y, z, range, color }`, with `color` scaled by intensity) for all active
     *  POI flat lights, applying the same range flicker used by POI lights and reusing each POI's row objects across
     *  frames. */
    lights(out = []) {
      const tick = Math.floor(now() / (1000 / FLICKER_HZ));
      for (let k = 0; k < list.length; k++) {
        const p = list[k];
        if (!p.on) continue;
        empty(lit);
        p.room.pushLights(lit, POI_FLAT_LIGHTS_MAX);
        for (let i = 0; i < lit.length; i++) {
          const l = lit[i];
          const row = p.rows[i] ?? (p.rows[i] = { x: 0, y: 0, z: 0, range: 0, color: new Float32Array(3) });
          const f = l.flicker ? 1 - FLICKER_DEPTH * (((Math.imul(tick + (i + 101) * 7919, 2654435761) >>> 0) % 1000) / 1000) : 1;
          row.x = l.x; row.y = l.y; row.z = l.z; row.range = l.range * f;
          const k2 = Number.isFinite(l.intensity) ? l.intensity : 1;
          row.color[0] = l.color[0] * k2; row.color[1] = l.color[1] * k2; row.color[2] = l.color[2] * k2;
          out.push(row);
        }
      }
      empty(lit);
      return out;
    },
    /** Finds the nearest visible flat whose bounding box is hit by ray `(o, d)` within distance `max`, returning `{
     *  id, key, dist, kind: 'flat' }` or null. Skips any flat where `skip(id, key, 'flat')` returns true. */
    pick(o, d, max = 6000, skip = null) {
      let best = null;
      for (const p of list) {
        if (!p.on) continue;
        for (const tg of p.room.targets()) {
          const key = decorIdOfKey(tg.key);
          if (key == null || skip?.(p.id, key, 'flat')) continue;
          const t = rayAabb(o, d, tg.aabb, best ? best.dist : max);
          if (t != null) best = { id: p.id, key, dist: t, kind: 'flat' };
        }
      }
      return best;
    },
    /** Returns a placed flat's bounding box in the scene (`[minX, minY, minZ, maxX, maxY, maxZ]`), or null if its
     *  texture has not loaded yet. Caches each POI's boxes once per frame (and again after its flats change) so
     *  editor queries do not walk the decor room once per flat. */
    boxOf(id, key) {
      const p = pools.get(id);
      if (!p) return null;
      if (!p.boxes || p.boxesAt !== frameNo) {
        p.boxes = new Map();
        p.boxesAt = frameNo;
        for (const tg of p.room.targets()) p.boxes.set(decorIdOfKey(tg.key), [...tg.aabb.min, ...tg.aabb.max]);
      }
      return p.boxes.get(key) ?? null;
    },
    /** Returns a summary of every POI's flat room, `[{ id, pieces, on }]`, for tests. */
    standing: () => list.map((p) => ({ id: p.id, pieces: p.room.size(), on: p.on })),
  };
}
