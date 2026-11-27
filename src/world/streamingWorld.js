// Floating-origin streaming for the world scene: which map pixels are in range, when the world recenters,
// and where everything sits. Ported from Daggerfall Unity's StreamingWorld and FloatingOrigin as pure state.

import { TERRAIN_SIZE } from './terrainSampler.js';
import { GLOBAL_SCALE } from './meshReader.js';
import { WORLD_MAP_TILE_DIM, getLocationTerrainTileOrigin } from './terrainTiles.js';

export const TERRAIN_DISTANCE = 3;
export const BUILD_RETRY_MS = Object.freeze([2000, 4000, 8000, 16000, 32000]);
const VERTICAL_THRESHOLD = 500;
const MIN_MAP_PIXEL_X = 0;
const MIN_MAP_PIXEL_Y = 0;
const MAX_MAP_PIXEL_X = 1000;
const MAX_MAP_PIXEL_Y = 500;
export const SCENE_MAP_RATIO = 1 / GLOBAL_SCALE;
const NATIVE_PIXEL = 32768;

export function worldCoordToMapPixel(worldX, worldZ) {
  return {
    x: Math.trunc(worldX / NATIVE_PIXEL),
    y: 499 - Math.trunc(worldZ / NATIVE_PIXEL),
  };
}

export function mapPixelToWorldCoords(mapPixelX, mapPixelY) {
  return { x: mapPixelX * NATIVE_PIXEL, z: (499 - mapPixelY) * NATIVE_PIXEL };
}

export const WORLD_MAP_RMB_DIM = 4096;

export function locationWorldRect(dfLocation, mapPixelX, mapPixelY) {
  const origin = mapPixelToWorldCoords(mapPixelX, mapPixelY);
  const tileOrigin = getLocationTerrainTileOrigin(dfLocation);
  const minX = origin.x + tileOrigin.x * 2 * WORLD_MAP_TILE_DIM;
  const minZ = origin.z + tileOrigin.y * 2 * WORLD_MAP_TILE_DIM;
  return {
    minX,
    maxX: minX + dfLocation.exterior.exteriorData.width * WORLD_MAP_RMB_DIM,
    minZ,
    maxZ: minZ + dfLocation.exterior.exteriorData.height * WORLD_MAP_RMB_DIM,
  };
}

// IsPlayerInLocationRect is a world-coordinate test against the town's footprint widened by one city block,
// not "this map pixel carries a location".
export function isInLocationRect(worldX, worldZ, rect) {
  if (!rect) return false;
  const extraRect = WORLD_MAP_RMB_DIM;
  return worldX >= rect.minX - extraRect && worldX <= rect.maxX + extraRect
    && worldZ >= rect.minZ - extraRect && worldZ <= rect.maxZ + extraRect;
}

export const nearestFirstFrom = (current) => (a, b) => {
  const ca = Math.max(Math.abs(a.px - current.x), Math.abs(a.py - current.y));
  const cb = Math.max(Math.abs(b.px - current.x), Math.abs(b.py - current.y));
  if (ca !== cb) return ca - cb;
  return ((a.px - current.x) ** 2 + (a.py - current.y) ** 2) - ((b.px - current.x) ** 2 + (b.py - current.y) ** 2);
};

export class StreamingWorldState {
  constructor(terrainDistance = TERRAIN_DISTANCE) {
    this.terrainDistance = terrainDistance;
    this.mapOrigin = { x: 0, y: 0 };
    this.compensation = [0, 0, 0];
    this.current = { x: 0, y: 0 };
    this.loaded = new Map();
    this.failed = new Map();
    this.initOffset = [0, 0, 0];
  }

  static key(px, py) {
    return `${px},${py}`;
  }

  init(mapPixelX, mapPixelY) {
    const was = this.worldCoords([0, 0, 0]);
    this.mapOrigin = { x: mapPixelX, y: mapPixelY };
    this.compensation = [0, this.compensation[1], 0];
    this.current = { x: mapPixelX, y: mapPixelY };
    this.loaded.clear();
    this.failed.clear();
    const [ox, oz] = this.localFromWorld(was.x, was.z);
    this.initOffset = [ox, 0, oz];
    return this._loadList();
  }

  localFromWorld(nativeX, nativeZ) {
    const corner = mapPixelToWorldCoords(this.mapOrigin.x, this.mapOrigin.y);
    return [
      (nativeX - corner.x) / SCENE_MAP_RATIO + this.compensation[0],
      (nativeZ - corner.z) / SCENE_MAP_RATIO + this.compensation[2],
    ];
  }

  worldCoords(scenePos) {
    const corner = mapPixelToWorldCoords(this.mapOrigin.x, this.mapOrigin.y);
    return {
      x: corner.x + (scenePos[0] - this.compensation[0]) * SCENE_MAP_RATIO,
      z: corner.z + (scenePos[2] - this.compensation[2]) * SCENE_MAP_RATIO,
    };
  }

  pixelTranslation(px, py, out = [0, 0, 0]) {
    out[0] = (px - this.mapOrigin.x) * TERRAIN_SIZE + this.compensation[0];
    out[1] = this.compensation[1];
    out[2] = -(py - this.mapOrigin.y) * TERRAIN_SIZE + this.compensation[2];
    return out;
  }

  static onMap(px, py) {
    return px >= MIN_MAP_PIXEL_X && px < MAX_MAP_PIXEL_X
      && py >= MIN_MAP_PIXEL_Y && py < MAX_MAP_PIXEL_Y;
  }

  static frame = null;
  static frames = [];
  static streams(px, py) {
    if (StreamingWorldState.onMap(px, py)) return true;
    const f = StreamingWorldState.frame;
    if (!!f && px >= f.x0 && px < f.x0 + f.w && py >= f.y0 && py < f.y0 + f.h) return true;
    return StreamingWorldState.frames.some((b) => px >= b.x0 && px < b.x0 + b.w && py >= b.y0 && py < b.y0 + b.h);
  }

  inRange(px, py) {
    return StreamingWorldState.streams(px, py) &&
      Math.abs(px - this.current.x) <= this.terrainDistance &&
      Math.abs(py - this.current.y) <= this.terrainDistance;
  }

  _loadList() {
    const list = [];
    const d = this.terrainDistance;
    for (let py = this.current.y - d; py <= this.current.y + d; py++) {
      for (let px = this.current.x - d; px <= this.current.x + d; px++) {
        if (!StreamingWorldState.streams(px, py)) continue;
        if (this.loaded.has(StreamingWorldState.key(px, py))) continue;
        list.push({ px, py });
      }
    }
    list.sort(nearestFirstFrom(this.current));
    for (const p of list) this.loaded.set(StreamingWorldState.key(p.px, p.py), p);
    return list;
  }

  release(px, py) {
    this.loaded.delete(StreamingWorldState.key(px, py));
  }

  fail(px, py, now) {
    const key = StreamingWorldState.key(px, py);
    this.loaded.delete(key);
    const tries = (this.failed.get(key)?.tries ?? 0) + 1;
    this.failed.set(key, { px, py, tries, at: tries <= BUILD_RETRY_MS.length ? now + BUILD_RETRY_MS[tries - 1] : Infinity });
  }

  stood(px, py) {
    this.failed.delete(StreamingWorldState.key(px, py));
  }

  retryDue(now) {
    const out = [];
    for (const [key, f] of this.failed) {
      if (!this.inRange(f.px, f.py)) { this.failed.delete(key); continue; }
      if (f.at > now || this.loaded.has(key)) continue;
      f.at = Infinity;
      const p = { px: f.px, py: f.py };
      this.loaded.set(key, p);
      out.push(p);
    }
    return out.sort(nearestFirstFrom(this.current));
  }

  owes(queue) {
    while (queue.length && !this.loaded.has(StreamingWorldState.key(queue[0].px, queue[0].py))) queue.shift();
    return queue.length > 0;
  }

  /**
   * @param {number[]} camPos
   * @returns {{offset:number[]|null, load:Array, unload:Array,
   *   pixelChanged:boolean, current:{x,y}}}
   */
  update(camPos) {
    const offset = [0, 0, 0];
    let moved = false;

    if (camPos[1] < -VERTICAL_THRESHOLD || camPos[1] > VERTICAL_THRESHOLD) {
      offset[1] = -camPos[1];
      moved = true;
    }

    const w = this.worldCoords(camPos);
    const pixel = worldCoordToMapPixel(w.x, w.z);
    const pixelChanged = pixel.x !== this.current.x || pixel.y !== this.current.y;
    let load = [];
    const unload = [];
    if (pixelChanged) {
      offset[0] = -(pixel.x - this.current.x) * TERRAIN_SIZE;
      offset[2] = (pixel.y - this.current.y) * TERRAIN_SIZE;
      moved = true;
      this.current = pixel;
    }
    if (moved) {
      this.compensation[0] += offset[0];
      this.compensation[1] += offset[1];
      this.compensation[2] += offset[2];
    }
    if (pixelChanged) {
      load = this._loadList();
      for (const p of this.loaded.values()) {
        if (!this.inRange(p.px, p.py)) unload.push({ px: p.px, py: p.py });
      }
    }
    return { offset: moved ? offset : null, load, unload, pixelChanged, current: this.current };
  }
}

export const MAX_TERRAIN_ARRAY = 256;

// Placement runs before collection, so a tile that just left range survives until a new tile needs its slot.
export class TerrainSlots {
  constructor(size = MAX_TERRAIN_ARRAY) {
    this.size = size;
    /** @type {Array<{px:number, py:number, active:boolean}>} */
    this.slots = [];
    /** @type {Map<string, number>} */
    this.keys = new Map();
  }

  has(key) { return this.keys.has(key); }

  clear() {
    for (const s of this.slots) { s.active = false; s.px = -2147483648; s.py = -2147483648; }
    this.keys.clear();
  }

  /**
   * @param {number} cx
   * @param {number} cy
   * @param {number} distance
   * @param {(px:number, py:number) => boolean} [onMap]
   * @returns {{reactivated:string[], recycled:string[], pooled:string[]}}
   */
  step(cx, cy, distance, onMap = () => true) {
    const inRange = (x, y) => Math.abs(x - cx) <= distance && Math.abs(y - cy) <= distance;
    const out = { reactivated: [], recycled: [], pooled: [] };
    for (let y = cy - distance; y <= cy + distance; y++) {
      for (let x = cx - distance; x <= cx + distance; x++) {
        if (!onMap(x, y)) continue;
        const key = `${x},${y}`;
        const at = this.keys.get(key);
        if (at !== undefined) {
          const s = this.slots[at];
          if (!s.active) { s.active = true; out.reactivated.push(key); }
          continue;
        }
        let found = -1;
        for (let i = 0; i < this.size; i++) {
          const s = this.slots[i];
          if (!s || (!s.active && !inRange(s.px, s.py))) { found = i; break; }
        }
        if (found === -1) continue;
        const old = this.slots[found];
        if (old) {
          const k = `${old.px},${old.py}`;
          if (this.keys.get(k) === found) { this.keys.delete(k); out.recycled.push(k); }
        }
        this.slots[found] = { px: x, py: y, active: true };
        this.keys.set(key, found);
      }
    }
    for (const s of this.slots) {
      if (s.active && !inRange(s.px, s.py)) { s.active = false; out.pooled.push(`${s.px},${s.py}`); }
    }
    return out;
  }
}
