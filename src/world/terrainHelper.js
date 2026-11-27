// Port of Daggerfall Unity's TerrainHelper repairs, run once before the first terrain streams: the coastal
// climate dilation and the location neighborhood smoothing. Both mutate the in-memory reader buffers.
// Dilation reads the live buffer and swaps in a clone per pass; smoothing writes live in scan order, as DFU does.

import { MAP_WIDTH, MAP_HEIGHT } from '../formats/woodsFile.js';
import { PAK_WIDTH } from '../formats/pakFile.js';
import { hasLocation } from '../maps/mapDirectory.js';

export const OCEAN_CLIMATE = 223;

export const SMOOTH_GRADIENT_THRESHOLD = 20;

/**
 * @param {object} maps
 * @param {number} [passes]
 * @returns {number}
 */
export function dilateCoastalClimate(maps, passes = 2) {
  const pak = maps?.climatePak;
  if (!pak?.buffer) return 0;
  pak.undilated ??= pak.buffer;
  let changed = 0;
  for (let pass = 0; pass < passes; pass++) {
    const src = pak.buffer;
    const climateArray = src.slice();
    const transfer = (srcX, srcY, dstX, dstY) => {
      const srcClimate = src[srcY * PAK_WIDTH + (srcX + 1)];
      if (srcClimate === OCEAN_CLIMATE) return;
      const dstOffset = dstY * PAK_WIDTH + (dstX + 1);
      if (src[dstOffset] !== OCEAN_CLIMATE) return;
      if (climateArray[dstOffset] !== srcClimate) changed++;
      climateArray[dstOffset] = srcClimate;
    };
    for (let y = 1; y < MAP_HEIGHT - 1; y++) {
      for (let x = 1; x < MAP_WIDTH - 1; x++) {
        transfer(x, y, x - 1, y - 1);
        transfer(x, y, x, y - 1);
        transfer(x, y, x + 1, y - 1);
        transfer(x, y, x - 1, y);
        transfer(x, y, x + 1, y);
        transfer(x, y, x - 1, y + 1);
        transfer(x, y, x, y + 1);
        transfer(x, y, x + 1, y + 1);
      }
    }
    pak.buffer = climateArray;
  }
  return changed;
}

export function terrainGradient(x0y0, x1y0, x0y1) {
  return Math.abs(x1y0 - x0y0) + Math.abs(x0y1 - x0y0);
}

function averageHeights(heightArray, cx, cy) {
  let average = 0;
  let counter = 0;
  for (let y = cy - 1; y < cy + 2; y++) {
    for (let x = cx - 1; x < cx + 2; x++) {
      average += heightArray[y * MAP_WIDTH + x];
      counter++;
    }
  }
  average /= counter;
  const b = Math.trunc(average) & 0xff;
  for (let y = cy - 1; y < cy + 2; y++) {
    for (let x = cx - 1; x < cx + 2; x++) {
      heightArray[y * MAP_WIDTH + x] = b;
    }
  }
}

/**
 * @param {Map} mapDict
 * @param {object} woods
 * @param {number} [threshold]
 * @returns {number}
 */
export function smoothLocationNeighbourhood(mapDict, woods, threshold = SMOOTH_GRADIENT_THRESHOLD) {
  const heightArray = woods?.heightMapBuffer;
  if (!heightArray) return 0;
  let smoothed = 0;
  for (let y = 1; y < MAP_HEIGHT - 1; y++) {
    for (let x = 1; x < MAP_WIDTH - 1; x++) {
      if (!hasLocation(mapDict, x, y)) continue;
      const x0y0 = heightArray[y * MAP_WIDTH + x];
      const x1y0 = heightArray[y * MAP_WIDTH + (x + 1)];
      const x0y1 = heightArray[(y + 1) * MAP_WIDTH + x];
      if (terrainGradient(x0y0, x1y0, x0y1) > threshold) {
        averageHeights(heightArray, x, y);
        smoothed++;
      }
    }
  }
  return smoothed;
}
