import { HEIGHTMAP_DIMENSION } from './terrainSampler.js';
import { WORLD_MAP_TILE_DIM } from './terrainTiles.js';
import { heightSample, mapDataHasWater, mapDataFullySubmerged, DW_WATER_THRESHOLD } from './deepWaterClassification.js';
import { CLIP_SENTINEL } from './terrainSurface.js';

const f32 = Math.fround;
const clampInt = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// A clipped texel carries the byte 255, which no real tile byte reaches: 56 records shifted left by 2 with the
// rotate and flip bits top out at 223.
export { CLIP_SENTINEL };

export function isClippedWaterTileData(tileData) {
  const n = tileData >> 2;
  return n === 0 || n === 5 || n === 6 || n === 7 || n === 48;
}

export function isPromotedTerrainTexelSafeToClip(mapData, texelX, texelZ, texelDim = WORLD_MAP_TILE_DIM) {
  if (!mapData || !mapData.samples || texelDim <= 0) return true;
  const num = DW_WATER_THRESHOLD;
  const length = HEIGHTMAP_DIMENSION, length2 = HEIGHTMAP_DIMENSION;
  const num2 = clampInt(Math.floor(f32(f32(texelX * (length2 - 1)) / texelDim)), 0, length2 - 1);
  const num3 = clampInt(Math.ceil(f32(f32((texelX + 1) * (length2 - 1)) / texelDim)), 0, length2 - 1);
  const num4 = clampInt(Math.floor(f32(f32(texelZ * (length - 1)) / texelDim)), 0, length - 1);
  const num5 = clampInt(Math.ceil(f32(f32((texelZ + 1) * (length - 1)) / texelDim)), 0, length - 1);
  for (let i = num4; i <= num5; i++) for (let j = num2; j <= num3; j++) if (heightSample(mapData, i, j) > num) return false;
  return true;
}

export function shouldClipPromotedWaterTexel(mapData, tileData, texelX, texelZ, texelDim = WORLD_MAP_TILE_DIM) {
  return isClippedWaterTileData(tileData) && isPromotedTerrainTexelSafeToClip(mapData, texelX, texelZ, texelDim);
}

function nearestSolidTexel(source, texelX, texelZ, dim) {
  for (let i = 1; i <= 8; i++) {
    for (let j = -i; j <= i; j++) {
      for (let k = -i; k <= i; k++) {
        if (Math.abs(k) !== i && Math.abs(j) !== i) continue;
        const x = texelX + k, z = texelZ + j;
        if (x >= 0 && z >= 0 && x < dim && z < dim) {
          const v = source[z * dim + x];
          if (!isClippedWaterTileData(v)) return v;
        }
      }
    }
  }
  return -1;
}

/**
 * @param {Uint8Array} tilemapBytes
 * @param {object} mapData
 * @returns {?Uint8Array}
 */
export function patchTilemapForClip(tilemapBytes, mapData) {
  const num = WORLD_MAP_TILE_DIM;
  if (!tilemapBytes || tilemapBytes.length !== num * num) return null;
  const out = new Uint8Array(tilemapBytes.length);
  let flag = false;
  for (let i = 0; i < num; i++) {
    for (let j = 0; j < num; j++) {
      const k = i * num + j;
      let v = tilemapBytes[k];
      const water = isClippedWaterTileData(v);
      if (water && isPromotedTerrainTexelSafeToClip(mapData, j, i, num)) { v = CLIP_SENTINEL; flag = true; }
      else if (water) {
        const r = nearestSolidTexel(tilemapBytes, j, i, num);
        if (r >= 0) { v = r; flag = true; }
      }
      out[k] = v;
    }
  }
  return flag ? out : null;
}

export function shouldHidePureOceanCap(mapPixelX, mapPixelY, mapData, bake) {
  if (!bake || !bake.loaded || !bake.mapPixelHasWaterCells(mapPixelX, mapPixelY)) return false;
  if (bake.mapPixelHasLandCells(mapPixelX, mapPixelY)) return false;
  if (mapDataHasWater(mapData)) return mapDataFullySubmerged(mapData);
  return false;
}

/** @returns {{hide: boolean, tilemap: ?Uint8Array}} */
export function capDecision(mapPixelX, mapPixelY, mapData, tilemapBytes, bake) {
  const hide = shouldHidePureOceanCap(mapPixelX, mapPixelY, mapData, bake);
  const clip = !hide && mapDataHasWater(mapData);
  return { hide, tilemap: clip ? patchTilemapForClip(tilemapBytes, mapData) : null };
}

/**
 * @param {Uint8Array} bytes
 * @param {number} [stride]
 * @returns {?Uint32Array}
 */
export function clippedTerrainIndices(bytes, stride = 1) {
  const dim = WORLD_MAP_TILE_DIM;
  const g = (HEIGHTMAP_DIMENSION - 1) / stride + 1;
  const q = g - 1;
  const out = [];
  let dropped = 0;
  for (let z = 0; z < q; z++) {
    for (let x = 0; x < q; x++) {
      let clipped = true;
      for (let tz = z * stride; tz < (z + 1) * stride && clipped; tz++) {
        for (let tx = x * stride; tx < (x + 1) * stride; tx++) if (bytes[tz * dim + tx] !== CLIP_SENTINEL) { clipped = false; break; }
      }
      if (clipped) { dropped++; continue; }
      const i0 = z * g + x, i1 = i0 + 1, i2 = i0 + g, i3 = i2 + 1;
      out.push(i0, i2, i3, i0, i3, i1);
    }
  }
  if (stride > 1) {
    const edges = [(i) => i, (i) => (g - 1) * g + i, (i) => i * g, (i) => i * g + (g - 1)];
    const last = dim - 1;
    const tiles = [(t) => t, (t) => last * dim + t, (t) => t * dim, (t) => t * dim + last];
    for (let e = 0; e < 4; e++) {
      const edge = edges[e], tile = tiles[e], base = g * g + e * g;
      for (let i = 0; i < q; i++) {
        let clipped = true;
        for (let t = i * stride; t < (i + 1) * stride; t++) if (bytes[tile(t)] !== CLIP_SENTINEL) { clipped = false; break; }
        if (clipped) { dropped++; continue; }
        const t0 = edge(i), t1 = edge(i + 1), b0 = base + i, b1 = base + i + 1;
        out.push(t0, b0, b1, t0, b1, t1, t0, b1, b0, t0, t1, b1);
      }
    }
  }
  if (!dropped) return null;
  return Uint32Array.from(out);
}
