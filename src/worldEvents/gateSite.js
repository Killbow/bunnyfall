// @ts-check
// Every client derives the same gate site from its own map data with no relay message, so the scan reads only base
// game data. The climate alone does not mark the coast, because land climates spread two pixels into the sea, so
// the height byte also decides water.
import { CLIMATES, LOCATION_TYPES, REGION_NAMES } from '../formats/mapsFile.js';
import { BASE_HEIGHT_SCALE, SCALED_OCEAN_ELEVATION } from '../world/terrainSampler.js';
import { spawnsDungeon, WORLD_SALT } from '../world/spawnedDungeons.js';
import { pickGateRegion, pickGatePixel, gateSpotLocal, omenRing } from '../net/gateLaw.js';
import { WILD_REGION } from '../world/wildZone.js';

const W = 1000, H = 500;
export const GATE_TOWN_TYPES = Object.freeze([LOCATION_TYPES.TownCity, LOCATION_TYPES.TownHamlet, LOCATION_TYPES.TownVillage]);
export const GATE_TOWN_MIN_PX = 2;
export const GATE_TOWN_MAX_PX = 4;
export const GATE_REGION_MIN_PIXELS = 24;

// Province values are 128 plus the region index, and 128 + 105 is the one invalid value DFU maps to the Wrothgarian
// Mountains. The value 64 is sea, not a province.
export const politicClaimed = (pol) => (pol >= 128 && pol < 128 + REGION_NAMES.length) || pol === 128 + 105;
// Must match `isWaterPixel` in `ui/overworldModel.js`.
export const gateSeaPixel = (climate, byte) => climate === CLIMATES.Ocean || byte * BASE_HEIGHT_SCALE <= SCALED_OCEAN_ELEVATION;

/**
 * @param {{regionCount:number, getRegion:(r:number)=>any, getClimateIndex:(x:number,y:number)=>number, getPoliticIndex:(x:number,y:number)=>number, getRegionIndexAt:(x:number,y:number)=>number, baseLocationCount?:(r:number)=>number}} maps
 * @param {{spawnSalt?: number, heightAt?: ((x:number, y:number) => number)|null}} [o]
 * @returns {GateScan}
 */
export const scanGatePixels = (maps, o) => /** @type {GateScan} */ (gateScanner(maps, o).step());

/** @typedef {{byRegion: Map<number, Int32Array>, towns: Array<{name:string, px:number, py:number, region:number}>, townAt: Int32Array}} GateScan */

/**
 * @param {Parameters<typeof scanGatePixels>[0]} maps
 * @param {Parameters<typeof scanGatePixels>[1]} [o]
 */
export function gateScanner(maps, { spawnSalt = WORLD_SALT, heightAt = null } = {}) {
  /** @type {Uint8Array|null} */ let near = null;
  /** @type {Int32Array} */ let townAt;
  /** @type {GateScan['towns']} */ const towns = [];
  /** @type {Map<number, number[]>} */
  const lists = new Map();
  /** @type {GateScan|null} */ let done = null;
  let y = 1;
  const masks = () => {
    near = new Uint8Array(W * H);
    townAt = new Int32Array(W * H).fill(-1);
    const townDist = new Uint8Array(W * H).fill(255);
    const townTypes = new Set(GATE_TOWN_TYPES);
    for (let r = 0; r < (maps?.regionCount ?? 0); r++) {
      const region = maps.getRegion(r);
      const table = region?.mapTable;
      if (!table) continue;
      // Only base game rows count, because a world-data mod appends rows that some clients load and others do not,
      // which changes the site.
      const base = typeof maps.baseLocationCount === 'function' ? Math.min(table.length, maps.baseLocationCount(r)) : table.length;
      for (let i = 0; i < base; i++) {
        const row = table[i];
        if (!row) continue;
        // The low 20 bits of a DFU MapId are its map pixel, `y * 1000 + x`.
        const id = (row.mapId >>> 0) & 0xfffff;
        const px = id % 1000, py = Math.floor(id / 1000);
        if (px >= W || py >= H) continue;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const x = px + dx, y = py + dy;
          if (x >= 0 && y >= 0 && x < W && y < H) near[y * W + x] = 1;
        }
        if (!townTypes.has(row.locationType)) continue;
        const t = towns.length;
        towns.push({ name: String(region.mapNames?.[i] ?? ''), px, py, region: r });
        for (let dy = -GATE_TOWN_MAX_PX; dy <= GATE_TOWN_MAX_PX; dy++) for (let dx = -GATE_TOWN_MAX_PX; dx <= GATE_TOWN_MAX_PX; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          if (d < GATE_TOWN_MIN_PX) continue;
          const x = px + dx, y = py + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const p = y * W + x;
          if (d < townDist[p]) { townDist[p] = d; townAt[p] = t; }
        }
      }
    }
  };
  const row = () => {
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      if (near[p] || townAt[p] < 0) continue;
      if (gateSeaPixel(maps.getClimateIndex(x, y), heightAt ? heightAt(x, y) : 255)) continue;
      if (spawnsDungeon(spawnSalt, x, y)) continue;
      // `getRegionIndexAt` clamps an unknown politic value to region 0, so unclaimed pixels are skipped here before
      // they can join that region's list.
      if (!politicClaimed(maps.getPoliticIndex(x, y))) continue;
      const r = maps.getRegionIndexAt(x, y);
      let list = lists.get(r);
      if (!list) lists.set(r, list = []);
      list.push(p);
    }
  };
  return {
    /** @param {() => boolean} [more] */
    step(more = () => true) {
      if (done) return done;
      if (!near) masks();
      do { row(); y++; } while (y < H - 1 && more());
      if (y < H - 1) return null;
      const byRegion = new Map();
      // The lists are ascending because rows are scanned in order, and the day's pixel roll depends on that order.
      for (const [r, list] of lists) byRegion.set(r, Int32Array.from(list));
      return (done = { byRegion, towns, townAt });
    },
    progress: () => (done ? 1 : (y - 1) / (H - 2)),
  };
}

export const gateRegions = (scan) => [...scan.byRegion.keys()].filter((r) => r !== WILD_REGION && scan.byRegion.get(r).length >= GATE_REGION_MIN_PIXELS).sort((a, b) => a - b);

/**
 * @param {number} day
 * @param {GateScan} scan
 */
export function findGateSite(day, scan) {
  const region = pickGateRegion(day, gateRegions(scan));
  if (region == null) return null;
  const id = pickGatePixel(day, scan.byRegion.get(region));
  if (id == null) return null;
  const px = id % W, py = Math.floor(id / W);
  const town = scan.towns[scan.townAt[id]] ?? null;
  const spot = gateSpotLocal(day);
  const regionName = REGION_NAMES[region] ?? '';
  const near = town?.name || regionName;
  // The nearest town can lie in a different province from the gate, so it is named with its own province.
  const townRegion = town ? (REGION_NAMES[town.region] ?? '') : '';
  return { day, region, regionName, px, py, town, spot, ring: omenRing(day, px, py, spot), near, place: town?.name && townRegion ? `${town.name}, ${townRegion}` : near };
}
