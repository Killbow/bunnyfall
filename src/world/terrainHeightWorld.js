// Terrain height for the world: the bilinear ground height the player walks on.
// It reads through the floating-origin translation of the current pixel, with the height cell size and sail pad.
import { HEIGHTMAP_DIMENSION, TERRAIN_SIZE } from './terrainSampler.js';

/** @param {any} shared */
export function createTerrainHeightWorld(shared) {
  const { built, worldHeight } = shared;
  const MILL_SAIL_PAD = 30;
  const heightCell = TERRAIN_SIZE / (HEIGHTMAP_DIMENSION - 1);
  const _htT = [0, 0, 0];
  /** @param {boolean} [terrainOnly] */
  const heightAt = (x, z, terrainOnly = false) => {
    const c = shared.state.compensation;
    const px = shared.state.mapOrigin.x + Math.floor((x - c[0]) / TERRAIN_SIZE);
    const py = shared.state.mapOrigin.y - Math.floor((z - c[2]) / TERRAIN_SIZE);
    const p = built.get(`${px},${py}`);
    if (p) {
      const t = shared.state.pixelTranslation(p.px, p.py, _htT);
      const lx = x - t[0];
      const lz = z - t[2];
      if (lx < 0 || lz < 0 || lx >= TERRAIN_SIZE || lz >= TERRAIN_SIZE) return -Infinity;
      if (p.deepWaters) { const f = shared.deepWaters.floorLocalY(p, lx, lz); if (f != null) return terrainOnly ? -Infinity : f + t[1]; }
      const fx = lx / heightCell;
      const fz = lz / heightCell;
      const ix = Math.min(HEIGHTMAP_DIMENSION - 2, Math.floor(fx));
      const iz = Math.min(HEIGHTMAP_DIMENSION - 2, Math.floor(fz));
      const sx = fx - ix;
      const sz = fz - iz;
      const at = (a, b) => p.samples[a * HEIGHTMAP_DIMENSION + b] * worldHeight;
      const h =
        at(ix, iz) * (1 - sx) * (1 - sz) + at(ix + 1, iz) * sx * (1 - sz) +
        at(ix, iz + 1) * (1 - sx) * sz + at(ix + 1, iz + 1) * sx * sz;
      return h + t[1];
    }
    return -Infinity;
  };
  const _stT = [0, 0, 0];
  return { MILL_SAIL_PAD, _stT, heightAt, heightCell };
}
