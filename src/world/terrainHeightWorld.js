// The world's terrain height: the bilinear ground height the player walks on, read through the
// current pixel's floating-origin translation, with the height cell size and the mill sail pad.
import { HEIGHTMAP_DIMENSION, TERRAIN_SIZE } from './terrainSampler.js';

/** @param {any} shared */
export function createTerrainHeightWorld(shared) {
  const { built, worldHeight } = shared;
  // The sails sweep well past the tower's own box; the pad keeps a
  // mill's rotor from vanishing while its tower still shows.
  const MILL_SAIL_PAD = 30;
  // Player collision (P1): per-pixel triangle buckets in PIXEL-LOCAL
  // space, resolved through the live floating-origin translation; the
  // floor is the terrain heightmap, bilinear over the stored samples.
  const heightCell = TERRAIN_SIZE / (HEIGHTMAP_DIMENSION - 1);
  // EV2: the containing pixel is COMPUTABLE - pixelTranslation is an
  // affine map, so its inverse names the one pixel that can hold
  // (x, z) and the 49-entry scan (with a fresh translation array per
  // entry, inside the collider's substeps) collapses to one Map.get.
  // The invariant it leans on - the current pixel's frame sits at the
  // origin under compensation - is the one streaming.test.js:"2000-step fuzz holds" fuzz
  // pins over 2000 crossings.
  const _htT = [0, 0, 0];
  /** @param {boolean} [terrainOnly] - DW-D: a carved cell's seafloor is no DaggerfallTerrain (DeepWaterFloorMesh), so
   *  the surface model's down probe asks for the terrain alone and reads the carved sea as nothing (-Infinity) */
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
      if (p.deepWaters) { const f = shared.deepWaters.floorLocalY(p, lx, lz); if (f != null) return terrainOnly ? -Infinity : f + t[1]; }   // DW-B: a carved cell's ground is the seafloor
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
  // BLOOD1 AUDIT 3: WHERE THE GROUND IS DRAWN. `heightAt` above is the
  // bilinear read the capsule has always walked on; the terrain is cut
  // into two triangles a quad (terrainSurface.js says why the two
  // surfaces differ, and measured it: up to 0.08 apart on real grades).
  // The grass placer asks this; the blood - lifted 2cm off "the
  // ground" - was the one thing still placed by bilinear, so on a hill
  // a mark lay clipped into the slope on one half of a quad and floated
  // over it on the other. The capsule keeps its floor; what is PLACED
  // asks this.
  const _stT = [0, 0, 0];
  return { MILL_SAIL_PAD, _stT, heightAt, heightCell };
}
