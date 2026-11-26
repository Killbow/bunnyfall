// Terrain height sampling: a 129x129 heightmap per world map pixel, ported from DFU's DefaultTerrainSampler.cs.
// Sample (x, y) sits at data[x * dim + y]; the small heightmap rows are read in inverted Y order.
// The Perlin source is a documented departure (see perlin.js).

import { perlinNoise } from './perlin.js';
import { GLOBAL_SCALE } from './meshReader.js';

export const HEIGHTMAP_DIMENSION = 129;
export const MAX_TERRAIN_HEIGHT = 1539;
export const DEFAULT_TERRAIN_SCALE = 1.5;
export const STREAMING_TERRAIN_SCALE = 1.25;
export const WORLD_MAP_TERRAIN_DIM = 32768;
export const TERRAIN_SIZE = WORLD_MAP_TERRAIN_DIM * GLOBAL_SCALE;
const MAX_MAP_PIXEL_Y = 500;

// BASE_HEIGHT_SCALE is exported because the overworld relief and the far ring build their macro heights on it.
export const BASE_HEIGHT_SCALE = 8;
// NOISE_MAP_SCALE is exported so the landforms grade a road to the kernel's own macro height.
export const NOISE_MAP_SCALE = 4;
export const EXTRA_NOISE_SCALE = 10;
// 3.4f * baseHeightScale is the float 27.200000762939453 in C#, not the double 27.2.
// The tile job's ocean compare is float32, so every reader shares the float.
export const SCALED_OCEAN_ELEVATION = Math.fround(3.4 * BASE_HEIGHT_SCALE);
export const SCALED_BEACH_ELEVATION = Math.fround(5.0 * BASE_HEIGHT_SCALE);

export function cubicInterpolator(v0, v1, v2, v3, frac) {
  const A = (v3 - v2) - (v0 - v1);
  const B = (v0 - v1) - A;
  const C = v2 - v0;
  const D = v1;
  return A * (frac * frac * frac) + B * (frac * frac) + C * frac + D;
}

export function getNoise(x, y, frequency, amplitude, persistance, octaves, seed = 0) {
  let finalValue = 0;
  for (let i = 0; i < octaves; i++) {
    finalValue += perlinNoise(seed + x * frequency, seed + y * frequency) * amplitude;
    frequency *= 2.0;
    amplitude *= persistance;
  }
  return Math.min(1, Math.max(0, finalValue));
}

/** @returns {(x: number, y: number) => number} */
export function sampleKernel(woods, mapPixelX, mapPixelY, hDim = HEIGHTMAP_DIMENSION, groundNoise = true, landform = null, classic = null) {
  const { base, noise } = kernelTerms(woods, mapPixelX, mapPixelY, hDim);
  const shape = landform ? landform.pixel(mapPixelX, mapPixelY) : null;

  return (x, y) => {
    {
      let scaledHeight = 0;

      const baseHeight = base(x, y);
      scaledHeight += baseHeight * BASE_HEIGHT_SCALE;

      const noiseHeight = noise(x, y);
      scaledHeight += noiseHeight * NOISE_MAP_SCALE;

      let ground = 0;
      if (groundNoise) {
        const noisex = mapPixelX * (hDim - 1) + x;
        const noisey = (MAX_MAP_PIXEL_Y - mapPixelY) * (hDim - 1) + y;
        const lowFreq = getNoise(noisex, noisey, 0.3, 0.5, 0.5, 1);
        const highFreq = getNoise(noisex, noisey, 0.9, 0.5, 0.5, 1);
        ground = (lowFreq * highFreq) * EXTRA_NOISE_SCALE;
        scaledHeight += ground;
      }

      if (scaledHeight < SCALED_OCEAN_ELEVATION) scaledHeight = SCALED_OCEAN_ELEVATION;

      if (shape) {
        const h = scaledHeight < MAX_TERRAIN_HEIGHT ? scaledHeight : MAX_TERRAIN_HEIGHT;
        if (classic) classic[x * hDim + y] = h / MAX_TERRAIN_HEIGHT;
        return Math.max(0, shape(x, y, h, baseHeight * BASE_HEIGHT_SCALE, ground) / MAX_TERRAIN_HEIGHT);
      }
      return Math.min(1, Math.max(0, scaledHeight / MAX_TERRAIN_HEIGHT));
    }
  };
}

/** @returns {{ shmAt: (r: number, c: number) => number, lhmAt: (r: number, c: number) => number }} */
export function kernelWindows(woods, mapPixelX, mapPixelY) {
  const sd = 4;
  const shm = woods.getHeightMapValuesRange1Dim(mapPixelX - 2, mapPixelY - 2, sd);
  const lhm = woods.getLargeHeightMapValuesRange(mapPixelX - 1, mapPixelY, 3);
  const ld = 9;
  return { shmAt: (r, c) => shm[r + c * sd], lhmAt: (r, c) => lhm[r + c * ld] };
}

/** @returns {{ base: (x: number, y: number) => number, noise: (x: number, y: number) => number }} */
export function kernelTerms(woods, mapPixelX, mapPixelY, hDim = HEIGHTMAP_DIMENSION) {
  const div = (hDim - 1) / 3;
  const { shmAt, lhmAt } = kernelWindows(woods, mapPixelX, mapPixelY);

  const base = (x, y) => {
    const sfracx = x / (hDim - 1);
    const sfracy = y / (hDim - 1);
    const x1 = cubicInterpolator(shmAt(0, 3), shmAt(1, 3), shmAt(2, 3), shmAt(3, 3), sfracx);
    const x2 = cubicInterpolator(shmAt(0, 2), shmAt(1, 2), shmAt(2, 2), shmAt(3, 2), sfracx);
    const x3 = cubicInterpolator(shmAt(0, 1), shmAt(1, 1), shmAt(2, 1), shmAt(3, 1), sfracx);
    const x4 = cubicInterpolator(shmAt(0, 0), shmAt(1, 0), shmAt(2, 0), shmAt(3, 0), sfracx);
    return cubicInterpolator(x1, x2, x3, x4, sfracy);
  };
  const noise = (x, y) => {
    const rx = x / div;
    const ry = y / div;
    const ix = Math.floor(rx);
    const iy = Math.floor(ry);
    const fracx = (x - ix * div) / div;
    const fracy = (y - iy * div) / div;
    const x1 = cubicInterpolator(lhmAt(ix, iy + 0), lhmAt(ix + 1, iy + 0), lhmAt(ix + 2, iy + 0), lhmAt(ix + 3, iy + 0), fracx);
    const x2 = cubicInterpolator(lhmAt(ix, iy + 1), lhmAt(ix + 1, iy + 1), lhmAt(ix + 2, iy + 1), lhmAt(ix + 3, iy + 1), fracx);
    const x3 = cubicInterpolator(lhmAt(ix, iy + 2), lhmAt(ix + 1, iy + 2), lhmAt(ix + 2, iy + 2), lhmAt(ix + 3, iy + 2), fracx);
    const x4 = cubicInterpolator(lhmAt(ix, iy + 3), lhmAt(ix + 1, iy + 3), lhmAt(ix + 2, iy + 3), lhmAt(ix + 3, iy + 3), fracx);
    return cubicInterpolator(x1, x2, x3, x4, fracy);
  };
  return { base, noise };
}

/**
 * @param {object} woods
 * @param {number} mapPixelX
 * @param {number} mapPixelY
 * @param {number} hDim
 * @param {?object} [landform]
 * @param {?Float32Array} [classic]
 * @returns {Float32Array}
 */
export function generateSamples(woods, mapPixelX, mapPixelY, hDim = HEIGHTMAP_DIMENSION, landform = null, classic = null) {
  const kernel = sampleKernel(woods, mapPixelX, mapPixelY, hDim, true, landform, classic);
  const data = new Float32Array(hDim * hDim);
  for (let x = 0; x < hDim; x++) {
    for (let y = 0; y < hDim; y++) {
      data[x * hDim + y] = kernel(x, y);
    }
  }
  return data;
}

/** @returns {(x: number, y: number) => number} */
export function ghostSampler(woods, mapPixelX, mapPixelY, hDim = HEIGHTMAP_DIMENSION, landform = null) {
  const span = hDim - 1;
  const kernels = new Map();
  const kernelAt = (dx, dy) => {
    const key = `${dx},${dy}`;
    let k = kernels.get(key);
    if (!k) kernels.set(key, k = sampleKernel(woods, mapPixelX + dx, mapPixelY + dy, hDim, true, landform));
    return k;
  };
  return (x, y) => {
    let dx = 0, dy = 0;
    if (x < 0) { dx = -1; x += span; } else if (x > span) { dx = 1; x -= span; }
    if (y < 0) { dy = 1; y += span; } else if (y > span) { dy = -1; y -= span; }
    return kernelAt(dx, dy)(x, y);
  };
}
