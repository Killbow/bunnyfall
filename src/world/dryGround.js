// @ts-check
// Uses the same water compare as the terrain tile job (`sampleHeight` and `isWaterHeight`) on height map samples
// only, so every client finds the same ground dry. Location flattening and mod-painted water are ignored.
import { sampleKernel, HEIGHTMAP_DIMENSION } from './terrainSampler.js';
import { sampleHeight, isWaterHeight } from './terrainTiles.js';

/**
 * `fx` runs east and `fz` north across the pixel, matching the sample grid (x 0 at the west edge, y 0 at the
 * south).
 * @param {any} woods
 * @param {number} [keep]
 * @returns {(px: number, py: number, fx: number, fz: number) => boolean}
 */
export function createDryGround(woods, keep = 8) {
  const span = HEIGHTMAP_DIMENSION - 1;
  /** @type {Map<number, (x: number, y: number) => number>} */
  const kernels = new Map();
  // Rounds through float32 as the pixel stores samples, so the water compare matches the tile job.
  const wet = (/** @type {(x: number, y: number) => number} */ k, /** @type {number} */ x, /** @type {number} */ y) => isWaterHeight(sampleHeight(Math.fround(k(x, y))));
  return (px, py, fx, fz) => {
    const key = py * 1000 + px;
    let k = kernels.get(key);
    if (!k) {
      if (kernels.size >= keep) kernels.delete(/** @type {number} */ (kernels.keys().next().value));
      kernels.set(key, k = sampleKernel(woods, px, py));
    }
    const x0 = Math.min(span - 1, Math.max(0, Math.floor(fx * span))), y0 = Math.min(span - 1, Math.max(0, Math.floor(fz * span)));
    return !wet(k, x0, y0) && !wet(k, x0 + 1, y0) && !wet(k, x0, y0 + 1) && !wet(k, x0 + 1, y0 + 1);
  };
}
