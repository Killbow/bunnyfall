// The world's drawn ground: the triangle surface height that placed things sit on, and the player
// collider built over the walked height and that surface, with its cover index.
import { Collider } from '../player/collider.js';
import { createCoverIndex } from '../ai/cover.js';
import { surfaceHeightAt } from './terrainSurface.js';
import { TERRAIN_SIZE } from './terrainSampler.js';

/** @param {any} shared */
export function createTerrainSurfaceWorld(shared) {
  const { _stT, built, heightAt } = shared;
  const surfaceAt = (x, z) => {
    const c = shared.state.compensation;
    const px = shared.state.mapOrigin.x + Math.floor((x - c[0]) / TERRAIN_SIZE);
    const py = shared.state.mapOrigin.y - Math.floor((z - c[2]) / TERRAIN_SIZE);
    const p = built.get(`${px},${py}`);
    if (!p) return -Infinity;
    const t = shared.state.pixelTranslation(p.px, p.py, _stT);
    const lx = x - t[0], lz = z - t[2];
    if (lx < 0 || lz < 0 || lx >= TERRAIN_SIZE || lz >= TERRAIN_SIZE) return -Infinity;
    if (p.deepWaters) { const f = shared.deepWaters.floorLocalY(p, lx, lz); if (f != null) return f + t[1]; }   // DW-B: the floor is drawn there
    return surfaceHeightAt(p.samples, lx, lz, p._stride ?? 1) + t[1];
  };
  const collider = new Collider(heightAt, surfaceAt);
  collider.cover = createCoverIndex();   // TACT1: the streamed world's trees, rocks and props are cover, with the switch on
  return { collider, surfaceAt };
}
