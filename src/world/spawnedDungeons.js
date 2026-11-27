// Spawned dungeons: the roll, the id, and the clone. The host (world/pixelBuild.js buildPixelNow) owns the ground.
// The roll hashes (WORLD_SALT, pixel), never Math.random, so a reload never rerolls it and every client agrees.

import { mapPixelToLongitudeLatitude } from '../formats/mapsFile.js';
import { MINUTES_PER_DAY } from './gameDate.js';
import { TERRAIN_SIZE, HEIGHTMAP_DIMENSION, MAX_TERRAIN_HEIGHT, SCALED_BEACH_ELEVATION, sampleKernel } from './terrainSampler.js';
import { getLocationTerrainTileOrigin, WORLD_MAP_TILE_DIM, BEACH_JITTER } from './terrainTiles.js';
import { dataPoint, PATH_KEYS } from '../travel/travelPaths.js';

export const SPAWN_CHANCE = 0.30;

export const ELITE_CHANCE = 0.10;
export const ANY_SPAWN_CHANCE = SPAWN_CHANCE + ELITE_CHANCE;
export const SPAWN_KEEP = 0.75;
export const ELITE_FOE_MULTIPLIER = 3;
export const ELITE_HEALTH_SCALE = 2;
export const ELITE_DAMAGE_SCALE = 2;
export const ELITE_LOOT_DROP_MULT = 1.2;
export const ELITE_LOOT_QUALITY_MULT = 1.2;
export const ELITE_NAME_PREFIX = 'Elite ';
export const SALT_MAX = 4095;
export const WORLD_SALT = 1;

const PIXEL_ID_MAX = 500 * 1000;

export function hash32(...ns) {
  let h = 0x811c9dc5;
  for (const n of ns) {
    h ^= n >>> 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
  }
  return h >>> 0;
}

export const spawnRoll = (salt, px, py) => hash32(salt, px, py, 1) / 4294967296;

export const spawnKept = (salt, px, py, keep = SPAWN_KEEP) => hash32(salt, px, py, 3) / 4294967296 < keep;

export function spawnsDungeon(salt, px, py, chance = ANY_SPAWN_CHANCE) {
  if (!(spawnRoll(salt, px, py) < chance)) return false;
  if (chance !== ANY_SPAWN_CHANCE) return true;
  return spawnKept(salt, px, py);
}

export function pathFreePixel(net, px, py) {
  for (let t = 0; t < PATH_KEYS.length; t++) if (dataPoint(net, t, px, py)) return false;
  return true;
}

export const SPAWN_DRY_ELEVATION = SCALED_BEACH_ELEVATION + BEACH_JITTER;

export function spawnPlateauFloor(woods, px, py) {
  const k = sampleKernel(woods, px, py, HEIGHTMAP_DIMENSION, false);
  let sum = 0;
  for (let x = 0; x < HEIGHTMAP_DIMENSION; x++) for (let y = 0; y < HEIGHTMAP_DIMENSION; y++) sum += k(x, y);
  return (sum / (HEIGHTMAP_DIMENSION * HEIGHTMAP_DIMENSION)) * MAX_TERRAIN_HEIGHT;
}

export function spawnGroundDry(woods, px, py, kernelOf = sampleKernel) {
  const k = kernelOf(woods, px, py, HEIGHTMAP_DIMENSION, false);
  const n = HEIGHTMAP_DIMENSION * HEIGHTMAP_DIMENSION;
  let sum = 0;
  for (let x = 0; x < HEIGHTMAP_DIMENSION; x++) {
    for (let y = 0; y < HEIGHTMAP_DIMENSION; y++) sum += k(x, y);
    if ((sum / n) * MAX_TERRAIN_HEIGHT > SPAWN_DRY_ELEVATION) return true;
  }
  return false;
}

export function createSpawnGround(woods) {
  const dry = new Map();
  return (px, py) => {
    const key = py * 1000 + px;
    let d = dry.get(key);
    if (d === undefined) dry.set(key, d = spawnGroundDry(woods, px, py));
    return d;
  };
}

export const isEliteSpawn = (salt, px, py, normal = SPAWN_CHANCE, elite = ELITE_CHANCE) => {
  const r = spawnRoll(salt, px, py);
  if (!(r >= normal && r < normal + elite)) return false;
  if (normal !== SPAWN_CHANCE || elite !== ELITE_CHANCE) return true;
  return spawnKept(salt, px, py);
};

export function spawnedMapId(salt, px, py) {
  if (!Number.isInteger(salt) || salt < 1 || salt > SALT_MAX) throw new RangeError(`salt ${salt}`);
  const id = py * 1000 + px;
  if (!Number.isInteger(id) || px < 0 || px > 999 || py < 0 || id >= PIXEL_ID_MAX) throw new RangeError(`pixel ${px},${py}`);
  return ((salt << 20) | id) >>> 0;
}

export const pickTemplate = (templates, salt, px, py) => (templates?.length ? templates[hash32(salt, px, py, 2) % templates.length] : null);

/**
 * @param {object} template
 * @param {{salt:number, px:number, py:number, where?:{regionIndex?:number, regionName?:string, politic?:number, climate?:object}, elite?:boolean}} o
 */
export function synthesizeDungeonLocation(template, { salt, px, py, where = {}, elite = false }) {
  const mapId = spawnedMapId(salt, px, py);
  const ll = mapPixelToLongitudeLatitude(px, py);
  return {
    ...template,
    name: `${elite ? ELITE_NAME_PREFIX : ''}${template.name} (${px},${py})`,
    regionIndex: where.regionIndex ?? template.regionIndex,
    regionName: where.regionName ?? template.regionName,
    politic: where.politic ?? template.politic,
    climate: where.climate ?? template.climate,
    locationIndex: -1,
    mapTableData: { ...template.mapTableData, mapId, longitude: ll.x, latitude: ll.y },
    exterior: { ...template.exterior, exteriorData: { ...template.exterior?.exteriorData, locationId: mapId } },
    dungeon: { ...template.dungeon, recordElement: { ...template.dungeon?.recordElement, header: { ...template.dungeon?.recordElement?.header, locationId: mapId } } },
    spawned: true,
    elite: !!elite,
  };
}

export function spawnTemplates(locations, isMain = () => false) {
  const dungeons = [...(locations ?? [])].filter((l) => l?.hasDungeon && l.dungeon?.blocks?.length
    && l.exterior?.exteriorData && !isMain(l.mapTableData?.mapId) && !l.spawned && !l.ether
    && !l.editorDungeon
    && spawnClearance(l.exterior.exteriorData.width, l.exterior.exteriorData.height) >= SPAWN_CLEARANCE_M);
  const small = dungeons.filter((l) => l.exterior.exteriorData.width * l.exterior.exteriorData.height === 1);
  return small.length ? small : dungeons;
}

export const SPAWN_CLEARANCE_M = 300;
export const BLOCK_M = TERRAIN_SIZE / 8;
export const spawnClearance = (width, height) => (TERRAIN_SIZE - Math.max(width | 0, height | 0) * BLOCK_M) / 2;

export function spawnedLocationCentreLocal(loc) {
  const tile = TERRAIN_SIZE / WORLD_MAP_TILE_DIM;
  const o = getLocationTerrainTileOrigin(loc);
  const w = loc.exterior.exteriorData.width, h = loc.exterior.exteriorData.height;
  return [(o.x + w * 8) * tile, (o.y + h * 8) * tile];
}

export function dungeonSightLine(metres, direction, tier = 'regular') {
  const what = tier === 'super' ? 'an Abyss Dungeon' : tier === 'elite' ? 'an Elite Dungeon' : 'a Dungeon';
  return sightLineOf(what, metres, direction);
}
export function sightLineOf(what, metres, direction) {
  const m = Math.max(10, Math.round(metres / 10) * 10);
  return `You see ${what} ${m} meters to the ${direction}!`;
}

export const CLEARED_TTL_DAYS = 2;
export const GENERAL_TTL_DAYS = 7;
export const CLEARED_TTL_MINUTES = CLEARED_TTL_DAYS * MINUTES_PER_DAY;
export const GENERAL_TTL_MINUTES = GENERAL_TTL_DAYS * MINUTES_PER_DAY;

export const REBIRTH_TTL_DAYS = 12;
export const REBIRTH_TTL_MINUTES = REBIRTH_TTL_DAYS * MINUTES_PER_DAY;

export function spawnDeath(rec) {
  if (!rec) return NaN;
  const a = Number.isFinite(rec.cleared) ? rec.cleared + CLEARED_TTL_MINUTES : Infinity;
  const b = Number.isFinite(rec.seen) ? rec.seen + GENERAL_TTL_MINUTES : Infinity;
  const d = Math.min(a, b);
  return Number.isFinite(d) ? d : NaN;
}

export function spawnReborn(rec, now) {
  const d = spawnDeath(rec);
  return Number.isFinite(d) && Number.isFinite(now) && now - d >= REBIRTH_TTL_MINUTES;
}

export function spawnExpired(rec, now) {
  const d = spawnDeath(rec);
  return Number.isFinite(d) && Number.isFinite(now) && now >= d && now - d < REBIRTH_TTL_MINUTES;
}

export function createSpawnLedger() {
  /** @type {Map<string, {seen:number, cleared?:number}>} */
  const rows = new Map();
  let last = NaN;
  const at = (now) => { if (Number.isFinite(now)) last = now; return now; };
  const live = (key, now) => { const r = rows.get(key); return r && !spawnReborn(r, now) ? r : null; };
  return {
    note(key, now) {
      if (!key || !Number.isFinite(at(now))) return null;
      let r = live(key, now);
      if (!r) { r = { seen: now }; rows.set(key, r); }
      return r;
    },
    clear(key, now) {
      if (!key || !Number.isFinite(now)) return null;
      const r = this.note(key, now);
      if (r && !Number.isFinite(r.cleared)) r.cleared = now;
      return r;
    },
    expired: (key, now) => spawnExpired(rows.get(key), at(now)),
    has: (key, now) => !!live(key, at(now)),
    merge(key, seen, cleared, now = NaN) {
      if (!key || !Number.isFinite(seen)) return false;
      const clear = Number.isFinite(cleared) ? cleared : null;
      if (spawnReborn(clear === null ? { seen } : { seen, cleared: clear }, at(now))) return false;
      const r = live(key, now);
      if (!r) { rows.set(key, clear === null ? { seen } : { seen, cleared: clear }); return true; }
      let moved = false;
      if (seen < r.seen) { r.seen = seen; moved = true; }
      if (clear !== null && !(Number.isFinite(r.cleared) && r.cleared <= clear)) { r.cleared = clear; moved = true; }
      return moved;
    },
    wireRow(key) {
      const r = rows.get(key);
      const at = /^(\d{1,3}),(\d{1,3})$/.exec(String(key));
      if (!r || !at) return null;
      const px = Number(at[1]), py = Number(at[2]);
      return Number.isFinite(r.cleared) ? [px, py, r.seen, r.cleared] : [px, py, r.seen];
    },
    forget(key) { return rows.delete(key); },
    get size() { return rows.size; },
    toJSON: () => [...rows].filter(([, r]) => !spawnReborn(r, last)).map(([k, r]) => [k, r.seen, ...(Number.isFinite(r.cleared) ? [r.cleared] : [])]),
    load(rowsIn) {
      rows.clear();
      last = NaN;
      for (const [k, seen, cleared] of rowsIn ?? []) {
        if (typeof k === 'string' && Number.isFinite(seen)) rows.set(k, Number.isFinite(cleared) ? { seen, cleared } : { seen });
      }
      return rows.size;
    },
  };
}
