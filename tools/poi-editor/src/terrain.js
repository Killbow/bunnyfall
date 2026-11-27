// @ts-check

import { WoodsFile } from '../../../src/formats/woodsFile.js';
import { generateSamples, HEIGHTMAP_DIMENSION, TERRAIN_SIZE } from '../../../src/world/terrainSampler.js';
import { surfaceHeightAt } from '../../../src/world/terrainSurface.js';

export const FIDELITY = Object.freeze({
  level: 'base',
  note: 'Ground is the game\'s base terrain from WOODS.WLD. The hills, road cuts and town flattening the game adds are not shown, so the true ground can differ by a few metres.',
});

const MAP_W = 1000, MAP_H = 500;

/** @param {(name: string) => Promise<Uint8Array>} [read] */
export function createTerrain(read = async () => { throw new Error('no reader'); }) {
  /** @type {'unknown' | 'loaded' | 'missing'} */
  let status = 'unknown';
  /** @type {any} */
  let woods = null;
  /** @type {Map<number, Float32Array>} */
  const cache = new Map();
  const KEEP = 12;

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
    async open() {
      try {
        const w = new WoodsFile();
        if (!w.load(await read('WOODS.WLD'))) throw new Error('bad WOODS.WLD');
        woods = w; status = 'loaded';
      } catch { woods = null; status = 'missing'; }
      cache.clear();
      return status === 'loaded';
    },
    woods: () => woods,
    useWoods(w) { woods = w; status = w ? 'loaded' : 'missing'; cache.clear(); },
    groundAt,
    placeGround: (place) => groundAt(place.px, place.py, place.x, place.z),
  };
}

export function originHeight(terrain, place) {
  if (place.ground === 'absolute') return place.y;
  const g = terrain.placeGround(place);
  return g == null ? null : g + place.y;
}

export function pixelSpot(place, a, b) {
  const [qx, qy, qz, qw] = place.r;
  const yaw = Math.atan2(2 * (qw * qy + qx * qz), 1 - 2 * (qy * qy + qx * qx));
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [place.x + place.s * (a * c + b * s), place.z + place.s * (-a * s + b * c)];
}

export function groundInFrame(terrain, place, a, b) {
  const o = originHeight(terrain, place);
  if (o == null) return null;
  const [x, z] = pixelSpot(place, a, b);
  const g = terrain.groundAt(place.px, place.py, x, z);
  return g == null ? null : (g - o) / place.s;
}

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

export function pixelToPoiMatrix(terrain, place) {
  const H = originHeight(terrain, place);
  if (H == null) return null;
  const [qx, qy, qz, qw] = place.r;
  const yaw = Math.atan2(2 * (qw * qy + qx * qz), 1 - 2 * (qy * qy + qx * qx));
  const c = Math.cos(yaw), s = Math.sin(yaw), S = place.s, X = place.x, Z = place.z;
  return new Float32Array([c / S, 0, s / S, 0, 0, 1 / S, 0, 0, -s / S, 0, c / S, 0, -(c * X - s * Z) / S, -H / S, -(s * X + c * Z) / S, 1]);
}
