// Terrain surface data for the tilemap-shader pass: a 129x129 height grid and a 128x128 tilemap texture per pixel.
// convertTilemap is DFU's UpdateTileMapDataJob. The shader decode keeps DFU's flip and rotate transforms.

import {
  HEIGHTMAP_DIMENSION, MAX_TERRAIN_HEIGHT, STREAMING_TERRAIN_SCALE, TERRAIN_SIZE,
} from './terrainSampler.js';
import { WORLD_MAP_TILE_DIM } from './terrainTiles.js';

export function convertTile(tile) {
  if (tile === 0xff) return 0;
  let record = (tile * 4) & 0xff;
  if ((tile & 64) !== 0) record += 1;
  if ((tile & 128) !== 0) record += 2;
  return record;
}

export function convertTilemap(tilemapData) {
  const out = new Uint8Array(tilemapData.length);
  for (let i = 0; i < tilemapData.length; i++) out[i] = convertTile(tilemapData[i]);
  return out;
}

// The clip byte is one the conversion never writes (223 at most).
// deepWaterCap.js writes it and the terrain clip variant discards it.
export const CLIP_SENTINEL = 255;

export const playerTileMapIndex = (rawTile) => (rawTile == null ? -1 : convertTile(rawTile) >> 2);

export const WATER_TILE_INDEX = 0;

export const isOutdoorWaterTile = (rawTile) => playerTileMapIndex(rawTile) === WATER_TILE_INDEX;

export const TERRAIN_SKIRT_DEPTH = 40;

/**
 * @param {Float32Array} heightmapData
 * @param {number} lx
 * @param {number} lz
 * @param {number} [stride]
 * @returns {number}
 */
export function surfaceHeightAt(heightmapData, lx, lz, stride = 1) {
  const hDim = HEIGHTMAP_DIMENSION;
  const worldHeight = MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE;
  const quad = (TERRAIN_SIZE / (hDim - 1)) * stride;
  const last = (hDim - 1) / stride - 1;
  const at = (x, z) => heightmapData[Math.max(0, Math.min(hDim - 1, x)) * hDim
    + Math.max(0, Math.min(hDim - 1, z))];
  const qx = Math.max(0, Math.min(last, Math.floor(lx / quad)));
  const qz = Math.max(0, Math.min(last, Math.floor(lz / quad)));
  const ax = lx / quad - qx, az = lz / quad - qz;
  const x0 = qx * stride, z0 = qz * stride, x1 = x0 + stride, z1 = z0 + stride;
  const h00 = at(x0, z0), h10 = at(x1, z0), h01 = at(x0, z1), h11 = at(x1, z1);
  const h = az >= ax
    ? h00 + az * (h01 - h00) + ax * (h11 - h01)
    : h00 + ax * (h10 - h00) + az * (h11 - h10);
  return h * worldHeight;
}

/**
 * @param {Float32Array} normals
 * @param {number} lx
 * @param {number} lz
 * @param {number[]|Float32Array} [out]
 * @returns {number[]|Float32Array}
 */
export function surfaceNormalAt(normals, lx, lz, out = [0, 0, 0]) {
  const g = HEIGHTMAP_DIMENSION;
  const quad = TERRAIN_SIZE / (g - 1);
  const last = g - 2;
  const qx = Math.max(0, Math.min(last, Math.floor(lx / quad)));
  const qz = Math.max(0, Math.min(last, Math.floor(lz / quad)));
  const ax = lx / quad - qx, az = lz / quad - qz;
  const i00 = (qz * g + qx) * 3, i10 = i00 + 3, i01 = i00 + g * 3, i11 = i01 + 3;
  let l2 = 0;
  for (let c = 0; c < 3; c++) {
    const n00 = normals[i00 + c], n10 = normals[i10 + c], n01 = normals[i01 + c], n11 = normals[i11 + c];
    const v = az >= ax ? n00 + az * (n01 - n00) + ax * (n11 - n01) : n00 + ax * (n10 - n00) + az * (n11 - n10);
    out[c] = v; l2 += v * v;
  }
  const l = Math.sqrt(l2) || 1;
  out[0] /= l; out[1] /= l; out[2] /= l;
  return out;
}

/**
 * @param {Float32Array} heightmapData
 * @param {number} lx
 * @param {number} lz
 * @param {number} [stride]
 * @param {number[]|Float32Array} [out]
 * @returns {number[]|Float32Array}
 */
const _snVn = new Float64Array(12);
const _snAt = (data, x, z) => data[Math.max(0, Math.min(HEIGHTMAP_DIMENSION - 1, x)) * HEIGHTMAP_DIMENSION + Math.max(0, Math.min(HEIGHTMAP_DIMENSION - 1, z))];
export function surfaceNormalFromSamples(heightmapData, lx, lz, stride = 1, out = [0, 0, 0]) {
  const hDim = HEIGHTMAP_DIMENSION, cell = TERRAIN_SIZE / (hDim - 1), lift = MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE;
  const quad = cell * stride;
  const last = (hDim - 1) / stride - 1;
  const qx = Math.max(0, Math.min(last, Math.floor(lx / quad)));
  const qz = Math.max(0, Math.min(last, Math.floor(lz / quad)));
  const ax = lx / quad - qx, az = lz / quad - qz;
  const ny = 2 * cell * stride, vn = _snVn;
  for (let c = 0; c < 4; c++) {
    const x = (qx + (c & 1)) * stride, z = (qz + (c >> 1)) * stride;
    const nx = _snAt(heightmapData, x - stride, z) * lift - _snAt(heightmapData, x + stride, z) * lift;
    const nz = _snAt(heightmapData, x, z - stride) * lift - _snAt(heightmapData, x, z + stride) * lift;
    const l = Math.hypot(nx, ny, nz);
    vn[c * 3] = nx / l; vn[c * 3 + 1] = ny / l; vn[c * 3 + 2] = nz / l;
  }
  let l2 = 0;
  for (let c = 0; c < 3; c++) {
    const sw = vn[c], se = vn[3 + c], nw = vn[6 + c], ne = vn[9 + c];
    const v = az >= ax ? sw + az * (nw - sw) + ax * (ne - nw) : sw + ax * (se - sw) + az * (ne - se);
    out[c] = v; l2 += v * v;
  }
  const l = Math.sqrt(l2) || 1;
  for (let c = 0; c < 3; c++) out[c] /= l;
  return out;
}

/**
 * @param {ArrayLike<number>} values
 * @returns {number}
 */
export function gridValueAt(values, gx, gz, cell, lx, lz) {
  const qx = Math.max(0, Math.min(gx - 2, Math.floor(lx / cell))), qz = Math.max(0, Math.min(gz - 2, Math.floor(lz / cell)));
  const ax = lx / cell - qx, az = lz / cell - qz;
  const i = qz * gx + qx;
  const v00 = values[i], v10 = values[i + 1], v01 = values[i + gx], v11 = values[i + gx + 1];
  return az >= ax ? v00 + az * (v01 - v00) + ax * (v11 - v01) : v00 + ax * (v10 - v00) + az * (v11 - v10);
}

export const UNITY_HEIGHTMAP_MAX_HEIGHT = 32766;
export const unityHeightmapStep = (h) => Math.round(Math.min(1, Math.max(0, h)) * UNITY_HEIGHTMAP_MAX_HEIGHT);
const UNITY_HEIGHT_PER_STEP = Math.fround((MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE) / UNITY_HEIGHTMAP_MAX_HEIGHT);

/**
 * @param {Float32Array} heightmapData
 * @param {number} lx
 * @param {number} lz
 * @param {number} [stride]
 * @returns {number}
 */
export function terrainSampleHeightAt(heightmapData, lx, lz, stride = 1) {
  const f = Math.fround;
  const hDim = HEIGHTMAP_DIMENSION;
  const quad = (TERRAIN_SIZE / (hDim - 1)) * stride;
  const last = (hDim - 1) / stride - 1;
  const at = (x, z) => unityHeightmapStep(heightmapData[Math.max(0, Math.min(hDim - 1, x)) * hDim
    + Math.max(0, Math.min(hDim - 1, z))]);
  const qx = Math.max(0, Math.min(last, Math.floor(lx / quad)));
  const qz = Math.max(0, Math.min(last, Math.floor(lz / quad)));
  const u = f(lx / quad - qx), v = f(lz / quad - qz);
  const x0 = qx * stride, z0 = qz * stride, x1 = x0 + stride, z1 = z0 + stride;
  const z00 = at(x0, z0), z11 = at(x1, z1);
  let h;
  if (u > v) {
    const z10 = at(x1, z0);
    h = f(f(z00 + f((z10 - z00) * u)) + f((z11 - z10) * v));
  } else {
    const z01 = at(x0, z1);
    h = f(f(z00 + f((z11 - z01) * u)) + f((z01 - z00) * v));
  }
  return f(h * UNITY_HEIGHT_PER_STEP);
}

/**
 * @param {Float32Array} heightmapData
 * @param {number} avg
 * @param {number} lx
 * @param {number} lz
 */
export function groundOffPlane(heightmapData, avg, lx, lz) {
  return surfaceHeightAt(heightmapData, lx, lz) - Math.fround(avg) * (MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE);
}

export const GROUND_UNDER_INSET = 0.25;

/**
 * @param {Float32Array} heightmapData
 * @param {ArrayLike<number>} box
 * @returns {number}
 */
export function lowestGroundUnder(heightmapData, box) {
  const cell = TERRAIN_SIZE / (HEIGHTMAP_DIMENSION - 1);
  const clamp = (v) => Math.max(0, Math.min(TERRAIN_SIZE, v));
  const span = (lo, hi) => {
    const a = clamp(lo + (hi - lo) * GROUND_UNDER_INSET), b = clamp(hi - (hi - lo) * GROUND_UNDER_INSET);
    const out = [a, (a + b) / 2, b];
    for (let g = Math.ceil(a / cell) * cell; g < b; g += cell) out.push(g);
    return out;
  };
  const xs = span(box[0], box[3]), zs = span(box[2], box[5]);
  let low = Infinity;
  for (const x of xs) for (const z of zs) low = Math.min(low, surfaceHeightAt(heightmapData, x, z));
  return low;
}

/**
 * @param {Float32Array} heightmapData
 * @param {number} [stride]
 * @param {(x: number, z: number) => number} [ghost]
 * @returns {{positions: Float32Array, normals: Float32Array}}
 */
export function buildTerrainGrid(heightmapData, stride = 1, ghost = null) {
  const hDim = HEIGHTMAP_DIMENSION;
  const cell = TERRAIN_SIZE / (hDim - 1);
  const worldHeight = MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE;
  const at = (x, z) => {
    if (ghost && (x < 0 || x >= hDim || z < 0 || z >= hDim)) return ghost(x, z) * worldHeight;
    return heightmapData[Math.max(0, Math.min(hDim - 1, x)) * hDim
      + Math.max(0, Math.min(hDim - 1, z))] * worldHeight;
  };

  const g = (hDim - 1) / stride + 1;
  const skirt = stride > 1 ? g * 4 : 0;
  const positions = new Float32Array((g * g + skirt) * 3);
  const normals = new Float32Array((g * g + skirt) * 3);
  let o = 0;
  for (let zi = 0; zi < g; zi++) {
    for (let xi = 0; xi < g; xi++) {
      const x = xi * stride, z = zi * stride;
      positions[o] = x * cell;
      positions[o + 1] = at(x, z);
      positions[o + 2] = z * cell;
      const hl = at(x - stride, z);
      const hr = at(x + stride, z);
      const hd = at(x, z - stride);
      const hu = at(x, z + stride);
      const nx = hl - hr;
      const nz = hd - hu;
      const ny = 2 * cell * stride;
      const l = Math.hypot(nx, ny, nz);
      normals[o] = nx / l;
      normals[o + 1] = ny / l;
      normals[o + 2] = nz / l;
      o += 3;
    }
  }
  if (skirt) {
    // Perimeter order matches buildTerrainIndices' skirt walk: first row, last row, first column, last column.
    const edges = [
      (i) => i,
      (i) => (g - 1) * g + i,
      (i) => i * g,
      (i) => i * g + (g - 1),
    ];
    for (const edge of edges) {
      for (let i = 0; i < g; i++) {
        const src = edge(i) * 3;
        positions[o] = positions[src];
        positions[o + 1] = positions[src + 1] - TERRAIN_SKIRT_DEPTH;
        positions[o + 2] = positions[src + 2];
        normals[o] = normals[src];
        normals[o + 1] = normals[src + 1];
        normals[o + 2] = normals[src + 2];
        o += 3;
      }
    }
  }
  return { positions, normals };
}

export function buildTerrainIndices(stride = 1) {
  const hDim = HEIGHTMAP_DIMENSION;
  const g = (hDim - 1) / stride + 1;
  const q = g - 1;
  const skirtQuads = stride > 1 ? q * 4 : 0;
  const indices = new Uint32Array(q * q * 6 + skirtQuads * 12);
  let o = 0;
  for (let z = 0; z < q; z++) {
    for (let x = 0; x < q; x++) {
      const i0 = z * g + x;
      const i1 = i0 + 1;
      const i2 = i0 + g;
      const i3 = i2 + 1;
      indices[o++] = i0; indices[o++] = i2; indices[o++] = i3;
      indices[o++] = i0; indices[o++] = i3; indices[o++] = i1;
    }
  }
  if (skirtQuads) {
    const edges = [
      (i) => i,
      (i) => (g - 1) * g + i,
      (i) => i * g,
      (i) => i * g + (g - 1),
    ];
    for (let e = 0; e < 4; e++) {
      const edge = edges[e];
      const base = g * g + e * g;
      for (let i = 0; i < q; i++) {
        const t0 = edge(i), t1 = edge(i + 1);
        const b0 = base + i, b1 = base + i + 1;
        indices[o++] = t0; indices[o++] = b0; indices[o++] = b1;
        indices[o++] = t0; indices[o++] = b1; indices[o++] = t1;
        indices[o++] = t0; indices[o++] = b1; indices[o++] = b0;
        indices[o++] = t0; indices[o++] = t1; indices[o++] = b1;
      }
    }
  }
  return indices;
}

export const TERRAIN_TILE_DIM = WORLD_MAP_TILE_DIM;
