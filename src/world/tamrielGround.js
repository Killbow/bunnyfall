// @ts-check
// The ground beyond the Bay: serves the terrain kernel's height and climate reads for any pixel of the frame.
// The seam band past the Bay's edge returns WoodsFile's clamped read exactly, so Bay samples stay byte-identical.
// The height rule lives here and tamrielRaster.js reads it. Pure, deterministic, cached per pixel.
import { rangeLift, provinceByKey } from './tamrielGeography.js';
import { provinceKeyAt, coastDistanceAt } from './tamrielLand.js';
import { bayToPicture, inBay, BAY_W, BAY_H } from './tamrielFrame.js';
import { CLIMATES } from '../formats/mapsTables.js';

export const SHORE_BYTE = 5;
export const INLAND_BYTE = 22;
export const SNOW_BYTE = 112;
export const PLAIN_REACH = 6;
export const SEAM_PX = 2;
export const BLEND_PX = 12;
export const GROUND_CACHE_MAX = 262144;

export function groundHash(x, y, salt = 0x51ed) {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function authoredHeightByte(px, py, noise = 0) {
  if (!provinceKeyAt(px, py)) return 0;
  const inland = Math.min(1, coastDistanceAt(px, py) / PLAIN_REACH);
  let h = SHORE_BYTE + (INLAND_BYTE - SHORE_BYTE) * inland + noise;
  const lift = rangeLift(px, py);
  if (lift > 0) h = Math.max(h, SHORE_BYTE + (SNOW_BYTE - SHORE_BYTE) * lift);
  return Math.max(SHORE_BYTE, Math.min(255, Math.round(h)));
}

export function bayEdgeDistance(x, y) {
  return Math.max(0, -x, x - (BAY_W - 1), -y, y - (BAY_H - 1));
}

/** @type {Map<number, number>} */
const _bytes = new Map();
const cacheKey = (x, y) => (x + 8192) * 32768 + (y + 8192);
export const groundCacheSize = () => _bytes.size;
export const dropGroundCache = () => _bytes.clear();

export function tamrielHeightByte(x, y) {
  const k = cacheKey(x, y);
  const hit = _bytes.get(k);
  if (hit !== undefined) return hit;
  const [px, py] = bayToPicture(x + 0.5, y + 0.5);
  const byte = authoredHeightByte(px, py, (groundHash(x, y) - 0.5) * 4);
  if (_bytes.size >= GROUND_CACHE_MAX) _bytes.clear();
  _bytes.set(k, byte);
  return byte;
}

export function tamrielClimateAt(x, y) {
  const [px, py] = bayToPicture(x + 0.5, y + 0.5);
  const key = provinceKeyAt(px, py);
  return key ? (provinceByKey(key)?.climate ?? CLIMATES.Woodlands) : CLIMATES.Ocean;
}

export function tamrielLargeMap(x, y) {
  const data = [];
  for (let ix = 0; ix < 5; ix++) {
    const col = new Uint8Array(5);
    for (let iy = 0; iy < 5; iy++) col[iy] = Math.floor(groundHash(x * 5 + ix, y * 5 + iy, 0x2545) * 10);
    data.push(col);
  }
  return data;
}

/** @param {any} woods */
export function groundWoods(woods) {
  const ground = Object.create(woods);
  ground.getHeightMapValue = function (x, y) {
    const d = bayEdgeDistance(x, y);
    if (d <= SEAM_PX) return woods.getHeightMapValue(x, y);
    const edge = woods.getHeightMapValue(x, y);
    const t = Math.min(1, (d - SEAM_PX) / BLEND_PX);
    return Math.round(edge * (1 - t) + tamrielHeightByte(x, y) * t);
  };
  ground.getLargeMapData = function (x, y) {
    return bayEdgeDistance(x, y) <= SEAM_PX ? woods.getLargeMapData(x, y) : tamrielLargeMap(x, y);
  };
  ground.isTamrielGround = true;
  ground.bay = woods;
  return ground;
}

export function groundClimateIndex(bayClimateIndex) {
  return (x, y) => (inBay(x, y) ? bayClimateIndex(x, y) : tamrielClimateAt(x, y));
}
