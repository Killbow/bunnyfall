// World of Daggerfall location loader.

import { HEIGHTMAP_DIMENSION, MAX_TERRAIN_HEIGHT, STREAMING_TERRAIN_SCALE, SCALED_OCEAN_ELEVATION } from './terrainSampler.js';

export const WOD_TERRAIN_SIZE = 128;
export const WOD_TERRAIN_PIXEL_SIZE = Math.fround(819.2);
export const WOD_TERRAIN_SIZE_MULTI = Math.fround(WOD_TERRAIN_PIXEL_SIZE / WOD_TERRAIN_SIZE);
export const WOD_TERRAIN_HEIGHT_MAX = Math.fround(MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE);
export const WOD_AWAKE_REGION = 17;
export const WOD_REFUSED_REGION = 31;
export const WOD_OCEAN_REGIONS = Object.freeze([31, 3, 29, 28, 30]);

const f32 = Math.fround;

const PIX_W = 1000, PIX_H = 500;
const pixelSlot = (x, y) => (Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < PIX_W && y < PIX_H ? y * PIX_W + x : -1);
function type0Between(t0, a, b) {
  let lo = 0, hi = t0.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (t0[mid] <= a) lo = mid + 1; else hi = mid; }
  return lo < t0.length && t0[lo] < b;
}

export class LocationSession {
  constructor() {
    this.count = 0;
    this._cap = 0;
    this.worldX = new Int32Array(0);
    this.worldY = new Int32Array(0);
    this.terrainX = new Int32Array(0);
    this.terrainY = new Int32Array(0);
    this.type = new Int32Array(0);
    this.locationID = new Int32Array(0);
    this.name = [];
    this.prefab = [];
    this.regions = [];
  }

  hasRegion(region) { return this.regions.includes(region); }

  pixelIndex() {
    if (this._pix && this._pixCount === this.count) return this._pix;
    const first = new Int32Array(PIX_W * PIX_H).fill(-1), next = new Int32Array(this.count).fill(-1);
    const type0 = [];
    for (let i = this.count - 1; i >= 0; i--) {
      const p = pixelSlot(this.worldX[i], this.worldY[i]);
      if (p >= 0) { next[i] = first[p]; first[p] = i; }
      if (this.type[i] === 0) type0.push(i);
    }
    this._pix = { first, next, type0: Int32Array.from(type0.reverse()) };
    this._pixCount = this.count;
    return this._pix;
  }

  _grow(extra) {
    const need = this.count + extra;
    if (need <= this._cap) return;
    const cap = Math.max(need, this._cap * 2, 1024);
    for (const k of ['worldX', 'worldY', 'terrainX', 'terrainY', 'type', 'locationID']) {
      const a = new Int32Array(cap);
      a.set(this[k].subarray(0, this.count));
      this[k] = a;
    }
    this._cap = cap;
  }

  /**
   * @param {number} region
   * @param {{count:number, worldX:ArrayLike<number>, worldY:ArrayLike<number>,
   *   terrainX:ArrayLike<number>, terrainY:ArrayLike<number>, type:ArrayLike<number>,
   *   locationID:ArrayLike<number>, name:string[], prefab:string[]}} cols
   * @returns {boolean}
   */
  appendRegion(region, cols) {
    if (this.hasRegion(region)) return false;
    this._grow(cols.count);
    const o = this.count;
    for (let i = 0; i < cols.count; i++) {
      this.worldX[o + i] = cols.worldX[i];
      this.worldY[o + i] = cols.worldY[i];
      this.terrainX[o + i] = cols.terrainX[i];
      this.terrainY[o + i] = cols.terrainY[i];
      this.type[o + i] = cols.type[i];
      this.locationID[o + i] = cols.locationID[i];
      this.name.push(cols.name[i]);
      this.prefab.push(cols.prefab[i]);
    }
    this.count += cols.count;
    this.regions.push(region);
    return true;
  }

  instance(i) {
    return {
      locationID: this.locationID[i], name: this.name[i], type: this.type[i], prefab: this.prefab[i],
      worldX: this.worldX[i], worldY: this.worldY[i], terrainX: this.terrainX[i], terrainY: this.terrainY[i],
    };
  }
}

/**
 * @param {{mapPixelX:number, mapPixelY:number, hasLocation:boolean,
 *   worldHeight:number, regionIndex?:number}} tile
 * @param {LocationSession} session
 * @param {(name:string) => ?{height:number,width:number}} getPrefab
 * @param {?(x:number, y:number) => number} pathsPoint
 * @param {?(prefabName:string, prefab:object, rect:object) => boolean} siteClear
 * @returns {Array<{index:number, prefab:object, flatten:boolean,
 *   rect:{x:number,y:number,width:number,height:number}}>}
 */
export function pickLocations(tile, session, getPrefab, pathsPoint = null, siteClear = null) {
  const idx = typeof session.pixelIndex === 'function' ? session.pixelIndex() : null;
  const p = idx ? pixelSlot(tile.mapPixelX, tile.mapPixelY) : -1;
  if (p < 0) return pickLocationsScan(tile, session, getPrefab, pathsPoint, siteClear);
  const st = pickState(tile, getPrefab, pathsPoint, siteClear);
  const { type } = session;
  let prev = -1;
  for (let i = idx.first[p]; i >= 0; i = idx.next[i]) {
    if ((st.hasLocation || st.ocean) && type0Between(idx.type0, prev, i)) return st.out;
    prev = i;
    const t = type[i];
    if (st.hasLocation) { if (t === 0) return st.out; else if (t === 2) continue; }
    if (st.ocean) { if (t === 0) return st.out; else if (t === 2) continue; }
    considerInstance(st, session, i, t);
  }
  return st.out;
}

/**
 * @param {{mapPixelX:number, mapPixelY:number, hasLocation:boolean, worldHeight:number, regionIndex?:number}} tile
 * @param {LocationSession} session
 * @param {(name:string) => ?{height:number,width:number}} getPrefab
 * @param {?(x:number, y:number) => number} [pathsPoint]
 * @param {?(prefabName:string, prefab:object, rect:object) => boolean} [siteClear]
 */
export function pickLocationsScan(tile, session, getPrefab, pathsPoint = null, siteClear = null) {
  const st = pickState(tile, getPrefab, pathsPoint, siteClear);
  const { worldX, worldY, type } = session;
  const px = tile.mapPixelX, py = tile.mapPixelY;
  for (let i = 0; i < session.count; i++) {
    const t = type[i];
    if (st.hasLocation) {
      if (t === 0) return st.out;
      else if (t === 2) continue;
    }
    if (st.ocean) {
      if (t === 0) return st.out;
      else if (t === 2) continue;
    }
    if (px !== worldX[i] || py !== worldY[i]) continue;
    considerInstance(st, session, i, t);
  }
  return st.out;
}

function pickState(tile, getPrefab, pathsPoint, siteClear) {
  return { out: [], hasLocation: !!tile.hasLocation, ocean: WOD_OCEAN_REGIONS.includes(tile.regionIndex ?? -1) && tile.worldHeight <= 2, pathsDataPoint: 0, getPrefab, pathsPoint, siteClear };
}

function considerInstance(st, session, i, t) {
  const tx = session.terrainX[i], ty = session.terrainY[i];
  if (tx <= 0 || ty <= 0 || (tx > 128 || ty > 128)) return;
  if (st.pathsPoint) st.pathsDataPoint = st.pathsPoint(session.worldX[i], session.worldY[i]) & 0xff;
  if (st.pathsDataPoint !== 0) return;
  const prefab = st.getPrefab(session.prefab[i]);
  if (prefab == null) return;
  if ((tx + prefab.height > 128 || ty + prefab.width > 128)) return;
  if ((tx + prefab.height > 127 || ty + prefab.width > 127)) return;
  const rect = { x: tx, y: ty, width: prefab.width, height: prefab.height };
  if (st.siteClear && !st.siteClear(session.prefab[i], prefab, rect)) return;
  const flatten = t === 0 || t === 2;
  if (flatten) st.hasLocation = true;
  st.out.push({ index: i, prefab, flatten, rect });
}

export function distanceFromRect(rect, x, y) {
  const xMin = rect.x, xMax = f32(rect.x + rect.width);
  const yMin = rect.y, yMax = f32(rect.y + rect.height);
  let sq = 0;
  if (x > xMax) sq = f32(sq + f32(f32(x - xMax) * f32(x - xMax)));
  else if (x < xMin) sq = f32(sq + f32(f32(xMin - x) * f32(xMin - x)));
  if (y > yMax) sq = f32(sq + f32(f32(y - yMax) * f32(y - yMax)));
  else if (y < yMin) sq = f32(sq + f32(f32(yMin - y) * f32(yMin - y)));
  return f32(Math.sqrt(sq));
}

/**
 * @param {Float32Array} samples
 * @param {{x:number,y:number,width:number,height:number}} rect
 * @returns {number}
 */
export function flattenForLocation(samples, rect, hDim = HEIGHTMAP_DIMENSION) {
  let count = 0;
  let tmp = 0;
  for (let x = rect.x; x <= rect.x + rect.width; x++) {
    for (let y = rect.y; y <= rect.y + rect.height; y++) {
      tmp = f32(tmp + samples[x * hDim + y]);
      count++;
    }
  }
  const avg = f32(tmp / count);
  for (let x = 1; x <= 127; x++) {
    for (let y = 1; y <= 127; y++) {
      const i = x * hDim + y;
      const a = samples[i];
      const d = distanceFromRect(rect, x, y);
      if (a <= SEA_SAMPLE && avg > a && d > SEA_RAMP) continue;
      let t = f32(1 / f32(d + 1));
      if (t > 1) t = 1; else if (t < 0) t = 0;
      samples[i] = f32(a + f32(f32(avg - a) * t));
    }
  }
  return avg;
}

export const SEA_SAMPLE = f32(SCALED_OCEAN_ELEVATION / MAX_TERRAIN_HEIGHT);
export const SEA_RAMP = 2;

/**
 * @param {Float32Array} samples
 * @param {Array<{flatten:boolean, rect:object}>} picks
 * @param {number} initialAverage
 * @returns {{averages:number[], locationRect:?{xMin:number,xMax:number,yMin:number,yMax:number}}}
 */
export function applyPicks(samples, picks, initialAverage = 0) {
  const averages = [];
  let average = initialAverage;
  let locationRect = null;
  for (const p of picks) {
    if (p.flatten) {
      average = flattenForLocation(samples, p.rect);
      locationRect = {
        xMin: p.rect.x, xMax: p.rect.x + p.rect.width,
        yMin: p.rect.y, yMax: p.rect.y + p.rect.height,
      };
    }
    averages.push(average);
  }
  return { averages, locationRect };
}

/**
 * @param {{rect:object, prefab:{obj:Array<object>}}} pick
 * @param {number} averageHeight
 * @param {(type:number, name:string) => boolean} validate
 * @returns {Array<{obj:object, pos:[number,number,number]}>}
 */
export function placeObjects(pick, averageHeight, validate) {
  const out = [];
  const baseX = f32(pick.rect.x * WOD_TERRAIN_SIZE_MULTI);
  const baseY = f32(averageHeight * WOD_TERRAIN_HEIGHT_MAX);
  const baseZ = f32(pick.rect.y * WOD_TERRAIN_SIZE_MULTI);
  for (const obj of pick.prefab.obj) {
    if (!validate(obj.type, obj.name)) continue;
    out.push({ obj, pos: [f32(baseX + obj.pos.x), f32(baseY + obj.pos.y), f32(baseZ + obj.pos.z)] });
  }
  return out;
}
