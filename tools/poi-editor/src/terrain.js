// @ts-check

// THE GROUND UNDER A POI, read as the game reads it: WOODS.WLD through the game's own sampler (world/terrain/
// terrainSampler.js generateSamples) and its own surface read (terrainSurface.js surfaceHeightAt: the stride-1 grid, the
// quad's diagonal, sample * 1539 * 1.25 metres). What it does NOT have is what the game lays over that ground at run
// time: the landforms' hills, the road and river cuts, and the flattening beside a town or a dungeon. So the answer is
// the game's BASE ground, and `FIDELITY` says so; the viewport shows it as a banner. Without WOODS.WLD there is no
// ground at all, and `heightAt` answers null: the viewport then draws the plain metre grid and says that.

import { WoodsFile } from '../../../src/formats/woodsFile.js';
import { generateSamples, HEIGHTMAP_DIMENSION, TERRAIN_SIZE } from '../../../src/world/terrain/terrainSampler.js';
import { surfaceHeightAt } from '../../../src/world/terrain/terrainSurface.js';

export const FIDELITY = Object.freeze({
  level: 'base',
  note: 'Ground is the game\'s base terrain from WOODS.WLD. The hills, road cuts and town flattening the game adds are not shown, so the true ground can differ by a few metres.',
});

const MAP_W = 1000, MAP_H = 500;

/** @param {(name: string) => Promise<Uint8Array>} [read] the bytes of an ARENA2 file by name */
export function createTerrain(read = async () => { throw new Error('no reader'); }) {
  /** @type {'unknown' | 'loaded' | 'missing'} */
  let status = 'unknown';
  /** @type {any} */
  let woods = null;
  /** @type {Map<number, Float32Array>} */
  const cache = new Map();
  const KEEP = 12;

  /** The pixel's 129 x 129 normalized samples (sample(x, z) = data[x * 129 + z]), or null off the map / without data. */
  function samples(px, py) {
    if (!woods || px < 0 || py < 0 || px >= MAP_W || py >= MAP_H) return null;
    const key = py * MAP_W + px;
    let d = cache.get(key);
    if (d) { cache.delete(key); cache.set(key, d); return d; }
    d = generateSamples(woods, px, py, HEIGHTMAP_DIMENSION, null, null);
    if (cache.size >= KEEP) cache.delete(/** @type {number} */ (cache.keys().next().value));
    cache.set(key, d);
    return d;
  }

  /**
   * The ground height in metres at a point of pixel (px, py): `x` east and `z` north of its south-west corner. A point
   * past the pixel's edge is read from the neighbouring pixel (the map's y runs south: north is py - 1). Null when
   * there is no ground data, or the point is off the map.
   */
  function groundAt(px, py, x, z) {
    let ox = px, oy = py, lx = x, lz = z;
    while (lx < 0) { ox -= 1; lx += TERRAIN_SIZE; }
    while (lx >= TERRAIN_SIZE) { ox += 1; lx -= TERRAIN_SIZE; }
    while (lz < 0) { oy += 1; lz += TERRAIN_SIZE; }
    while (lz >= TERRAIN_SIZE) { oy -= 1; lz -= TERRAIN_SIZE; }
    const d = samples(ox, oy);
    return d ? surfaceHeightAt(d, lx, lz) : null;
  }

  return {
    state: () => status,
    fidelity: FIDELITY,
    /** Load WOODS.WLD. Answers whether the ground is there. */
    async open() {
      try {
        const w = new WoodsFile();
        if (!w.load(await read('WOODS.WLD'))) throw new Error('bad WOODS.WLD');
        woods = w; status = 'loaded';
      } catch { woods = null; status = 'missing'; }
      cache.clear();
      return status === 'loaded';
    },
    /** Use an already loaded WoodsFile (tests). */
    /** The loaded WoodsFile, or null. */
    woods: () => woods,
    useWoods(w) { woods = w; status = w ? 'loaded' : 'missing'; cache.clear(); },
    groundAt,
    /** The ground under the POI's own spot, or null. */
    placeGround: (place) => groundAt(place.px, place.py, place.x, place.z),
  };
}

/**
 * The height the POI's origin stands at, in the pixel's frame: the ground under it plus `y` for 'snap', `y` itself for
 * 'absolute'. Null when 'snap' has no ground to read.
 */
export function originHeight(terrain, place) {
  if (place.ground === 'absolute') return place.y;
  const g = terrain.placeGround(place);
  return g == null ? null : g + place.y;
}

/** A POI-frame point's spot in the pixel's frame (the place's turn about up and its size; tilt is ignored). */
export function pixelSpot(place, a, b) {
  const [qx, qy, qz, qw] = place.r;
  const yaw = Math.atan2(2 * (qw * qy + qx * qz), 1 - 2 * (qy * qy + qx * qx));   // about +y, Unity order
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // a left-handed turn about +y by `yaw`: x' = x cos + z sin, z' = -x sin + z cos
  return [place.x + place.s * (a * c + b * s), place.z + place.s * (-a * s + b * c)];
}

/**
 * The ground's height in the POI's own frame at (a, b) - metres above the POI's y = 0 plane - or null when there is no
 * ground. Place scale divides the world metres back to the POI's.
 */
export function groundInFrame(terrain, place, a, b) {
  const o = originHeight(terrain, place);
  if (o == null) return null;
  const [x, z] = pixelSpot(place, a, b);
  const g = terrain.groundAt(place.px, place.py, x, z);
  return g == null ? null : (g - o) / place.s;
}

/** A square of ground around the POI's origin as a grid: `{ n, step, heights }`, heights[i * n + j] at (a_i, b_j). Null without ground. */
export function surfaceGrid(terrain, place, half = 60, step = 6) {
  const n = Math.floor((half * 2) / step) + 1;
  const heights = new Float32Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const h = groundInFrame(terrain, place, -half + i * step, -half + j * step);
    if (h == null) return null;
    heights[i * n + j] = h;
  }
  return { n, step, half, heights };
}

/**
 * Put nodes' y on the ground under them: the ground's height in the POI's frame at the node's own (x, z), plus `lift`.
 * `rows` are objects with a `t` triple. Answers how many moved; none when there is no ground (the caller says so).
 */
export function dropOnGround(terrain, place, rows, lift = 0) {
  let n = 0;
  for (const row of rows) {
    if (!row?.t) continue;
    const h = groundInFrame(terrain, place, row.t[0], row.t[2]);
    if (h == null) return 0;
    row.t = [row.t[0], Math.round((h + lift) * 1000) / 1000, row.t[2]];
    n++;
  }
  return n;
}

/**
 * The 4 x 4 (column-major) that takes a point of the pixel's frame into the POI's own frame: the place's origin (and
 * the height it stands at) taken off, its turn about up undone, its size divided out. Null when the height is unknown.
 */
export function pixelToPoiMatrix(terrain, place) {
  const H = originHeight(terrain, place);
  if (H == null) return null;
  const [qx, qy, qz, qw] = place.r;
  const yaw = Math.atan2(2 * (qw * qy + qx * qz), 1 - 2 * (qy * qy + qx * qx));
  const c = Math.cos(yaw), s = Math.sin(yaw), S = place.s, X = place.x, Z = place.z;
  return new Float32Array([c / S, 0, s / S, 0, 0, 1 / S, 0, 0, -s / S, 0, c / S, 0, -(c * X - s * Z) / S, -H / S, -(s * X + c * Z) / S, 1]);
}
