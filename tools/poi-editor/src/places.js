// @ts-check

// THE GAME'S PLACES, for finding one by name and for drawing its buildings round a POI. The towns, cities and dungeons
// come from MAPS.BSA; a place's buildings are laid out by the game's own layoutLocation (world/locationLayout.js), so a
// building stands where it does in the game. Heights: a place's ground is the flat plane the game cuts for it, the
// pixel's average height (the same calcAvgMaxHeight the game's terrain kernel takes).

import { MapsFile, longitudeLatitudeToMapPixel } from '../../../src/formats/mapsFile.js';
import { BlocksFile } from '../../../src/formats/blocksFile.js';
import { layoutLocation, RMB_SIDE } from '../../../src/world/locationLayout.js';
import { getLocationTerrainTileOrigin, calcAvgMaxHeight } from '../../../src/world/terrain/terrainTiles.js';
import { generateSamples, HEIGHTMAP_DIMENSION, TERRAIN_SIZE, MAX_TERRAIN_HEIGHT, STREAMING_TERRAIN_SCALE } from '../../../src/world/terrain/terrainSampler.js';
import { multiply } from '../../../src/world/mat4.js';

const TILE_SIDE = TERRAIN_SIZE / 128;
const WORLD_HEIGHT = MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE;

/**
 * @param {(name: string) => Promise<Uint8Array>} read an ARENA2 file's bytes
 * @param {() => any} getWoods the loaded WoodsFile (the ground's), or null
 */
export function createPlaces(read, getWoods = () => null) {
  /** @type {'unknown' | 'loaded' | 'missing'} */
  let status = 'unknown', why = '';
  /** @type {any} */ let maps = null;
  /** @type {any} */ let blocks = null;
  /** @type {{ name: string, region: string, regionIndex: number, locationIndex: number, px: number, py: number, type: number }[]} */
  let list = [];
  /** @type {Map<string, any>} */ const byPixel = new Map();
  /** @type {Map<string, any>} */ const cache = new Map();

  return {
    state: () => status,
    /** Why the places could not be loaded (the file that was missing), or ''. */
    why: () => why,
    /** Load the map tables and the block library, and list every place. Answers whether they are there. */
    async open() {
      try {
        const m = new MapsFile(); m.autoDiscard = false;
        if (!m.load(await read('MAPS.BSA'), await read('CLIMATE.PAK'), await read('POLITIC.PAK'))) throw new Error('bad MAPS.BSA');
        const b = new BlocksFile(); b.autoDiscard = false;
        if (!b.load(await read('BLOCKS.BSA'))) throw new Error('bad BLOCKS.BSA');
        maps = m; blocks = b; list = []; byPixel.clear();
        for (let r = 0; r < m.regionCount; r++) {
          const region = m.getRegion(r);
          if (!region) continue;
          for (let l = 0; l < region.locationCount; l++) {
            const loc = m.getLocation(r, l);
            if (!loc?.exterior?.exteriorData) continue;
            const p = longitudeLatitudeToMapPixel(loc.mapTableData.longitude, loc.mapTableData.latitude);
            const row = { name: String(loc.name ?? ''), region: m.getRegionName(r), regionIndex: r, locationIndex: l, px: p.x, py: p.y, type: loc.mapTableData.locationType };
            list.push(row); byPixel.set(`${p.x},${p.y}`, loc);
          }
        }
        status = 'loaded';
      } catch (e) { status = 'missing'; why = String(e?.message ?? e); maps = null; blocks = null; list = []; }
      return status === 'loaded';
    },
    /**
     * Places matching `text`, best first: the name itself (exact, then all words in the name), then places only the region
     * name matches. "wayrest, wayrest" or "wayrest in wayrest" asks for a name inside a region.
     */
    find(text, max = 40) {
      const parts = String(text).toLowerCase().split(/,|\bin\b/).map((x) => x.trim()).filter(Boolean);
      const nameWords = (parts[0] ?? '').split(/\s+/).filter(Boolean), regionWords = (parts[1] ?? '').split(/\s+/).filter(Boolean);
      if (!nameWords.length) return [];
      const rank = (p) => {
        const n = p.name.toLowerCase(), r = p.region.toLowerCase();
        if (regionWords.length && !regionWords.every((w) => r.includes(w))) return -1;
        if (n === nameWords.join(' ')) return 0;
        if (nameWords.every((w) => n.includes(w))) return 1;
        if (!regionWords.length && nameWords.every((w) => `${n} ${r}`.includes(w))) return 2;
        return -1;
      };
      return list.map((p) => ({ p, k: rank(p) })).filter((x) => x.k >= 0).sort((a, b) => a.k - b.k || a.p.name.length - b.p.name.length).slice(0, max).map((x) => x.p);
    },
    /**
     * Where a place's middle is in its pixel's frame (x east, z north of the pixel's south-west corner), and its size.
     * @param {{ regionIndex: number, locationIndex: number }} p
     */
    centreOf(p) {
      const loc = maps?.getLocation(p.regionIndex, p.locationIndex);
      if (!loc) return null;
      const o = getLocationTerrainTileOrigin(loc), w = loc.exterior.exteriorData.width, h = loc.exterior.exteriorData.height;
      return { x: o.x * TILE_SIDE + (w * RMB_SIDE) / 2, z: o.y * TILE_SIDE + (h * RMB_SIDE) / 2, width: w * RMB_SIDE, depth: h * RMB_SIDE };
    },
    /**
     * The buildings of the place on a map pixel, in the pixel's frame: `[{ id, m }]` (ARCH3D model id, a column-major 4 x 4),
     * and the plane the game cuts for the place. Null when the pixel has no place.
     */
    at(px, py) {
      const key = `${px},${py}`;
      if (cache.has(key)) return cache.get(key);
      const loc = byPixel.get(key);
      let out = null;
      const woods = getWoods();
      if (loc && blocks && woods) {
        try {
          const samples = generateSamples(woods, px, py, HEIGHTMAP_DIMENSION, null, null);
          const y = calcAvgMaxHeight(samples)[0] * WORLD_HEIGHT + 0.05;
          const o = getLocationTerrainTileOrigin(loc);
          const lay = layoutLocation(loc, maps, blocks, { enhanced: false, windmills: false });
          const models = [];
          for (const b of lay.blocks) {
            const origin = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, o.x * TILE_SIDE + b.originX, y, o.y * TILE_SIDE + b.originZ, 1]);
            for (const pm of b.layout.models) models.push({ id: pm.modelIdNum, m: multiply(origin, pm.matrix) });
          }
          out = { name: String(loc.name ?? ''), y, models };
        } catch { out = null; }
      }
      cache.set(key, out);
      return out;
    },
  };
}
