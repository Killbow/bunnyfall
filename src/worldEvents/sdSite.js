// @ts-check
// The relay sends only the region. Every client derives the same site, template, and map id from its own map files,
// so every choice here must stay deterministic.
import { LOCATION_TYPES, REGION_NAMES } from '../formats/mapsFile.js';
import { hubClaim, outranks } from '../world/regionHubs.js';
import { sdRoll, sdNameOf } from '../net/sdLaw.js';
import { synthesizeDungeonLocation, spawnClearance, SPAWN_CLEARANCE_M, SALT_MAX } from '../world/spawnedDungeons.js';

export const SD_GREAT_CITIES = 8;
export const SD_TEMPLATE_MIN_BLOCKS = 12;
export const SD_TEMPLATE_TYPES = Object.freeze([LOCATION_TYPES.DungeonLabyrinth, LOCATION_TYPES.DungeonKeep]);
// Hollow salts start above this so their map ids never collide with spawned dungeons, which use `WORLD_SALT` (1).
export const SD_SALT_BASE = 2048;
// Salts cycle with period 2047 (2049 to 4095), so slot `s` and slot `s + 2047` share a map id salt.
export const sdSalt = (s) => SD_SALT_BASE + 1 + ((Math.max(1, s | 0) - 1) % (SALT_MAX - SD_SALT_BASE));

const W = 1000;
// The low 20 bits of a MapId hold the map pixel id `py * 1000 + px`, as in Daggerfall Unity.
export const pixelOfLoc = (loc) => { const id = (Number(loc?.mapTableData?.mapId) >>> 0) & 0xfffff; return { px: id % W, py: Math.floor(id / W) }; };

/**
 * @param {Iterable<any>} locations
 * @param {number} r
 * @param {{ isBase?: (loc:any) => boolean, regionNameOf?: (r:number) => string }} [o]
 */
export function sdCities(locations, r, { isBase = () => true, regionNameOf = (i) => REGION_NAMES[i] ?? '' } = {}) {
  const rows = [];
  for (const loc of locations ?? []) {
    if (!loc || !Number.isInteger(loc.regionIndex) || !Number.isInteger(loc.locationIndex) || !isBase(loc)) continue;
    if (r >= 0 && loc.regionIndex !== r) continue;
    const claim = hubClaim(loc, regionNameOf(loc.regionIndex));
    if (!claim) continue;
    if (r < 0 && loc.mapTableData?.locationType !== LOCATION_TYPES.TownCity) continue;
    rows.push({ loc, claim });
  }
  rows.sort((a, b) => (outranks(a.claim, b.claim) ? -1 : outranks(b.claim, a.claim) ? 1 : a.loc.regionIndex - b.loc.regionIndex));
  return (r < 0 ? rows.slice(0, SD_GREAT_CITIES) : rows).map((x) => x.loc);
}

const _byTown = new WeakMap();
function pixelsByTown(scan) {
  let m = _byTown.get(scan);
  if (m) return m;
  m = new Map();
  for (const list of scan.byRegion.values()) {
    for (const p of list) {
      const t = scan.townAt[p];
      if (t < 0) continue;
      let l = m.get(t);
      if (!l) m.set(t, l = []);
      l.push(p);
    }
  }
  // Sorting keeps the pixel order identical on every client, so the slot roll picks the same pixel everywhere.
  for (const l of m.values()) l.sort((a, b) => a - b);
  _byTown.set(scan, m);
  return m;
}

/**
 * @param {{ s:number, r:number }} rec
 * @param {{ byRegion: Map<number, ArrayLike<number>>, towns: Array<{name:string, px:number, py:number, region:number}>, townAt: ArrayLike<number> }} scan
 * @param {any[]} cities
 * @param {(px: number, py: number) => boolean} [ground]
 */
export function findSdSite(rec, scan, cities, ground = () => true) {
  if (!rec || !scan || !cities?.length) return null;
  const byTown = pixelsByTown(scan);
  const start = rec.r < 0 ? sdRoll(rec.s, 5) % cities.length : 0;
  for (let k = 0; k < cities.length; k++) {
    const city = cities[(start + k) % cities.length];
    const { px: cx, py: cy } = pixelOfLoc(city);
    const ti = scan.towns.findIndex((t) => t.px === cx && t.py === cy);
    const pixels = ti >= 0 ? byTown.get(ti) : null;
    if (!pixels?.length) continue;
    const roll = sdRoll(rec.s, 4) % pixels.length;
    for (let j = 0; j < pixels.length; j++) {
      const id = pixels[(roll + j) % pixels.length];
      if (!ground(id % W, Math.floor(id / W))) continue;
      return { s: rec.s, px: id % W, py: Math.floor(id / W), city, cityName: String(city.name ?? ''), cityRegion: city.regionIndex, region: rec.r };
    }
  }
  return null;
}

/**
 * @param {Iterable<any>} locations
 * @param {(mapId:number) => boolean} [isMain]
 */
export function sdTemplates(locations, isMain = () => false) {
  return [...(locations ?? [])].filter((l) => l?.hasDungeon && (l.dungeon?.blocks?.length ?? 0) >= SD_TEMPLATE_MIN_BLOCKS
    && SD_TEMPLATE_TYPES.includes(l.mapTableData?.locationType) && l.exterior?.exteriorData && !l.spawned
    && !isMain(l.mapTableData?.mapId)
    && spawnClearance(l.exterior.exteriorData.width, l.exterior.exteriorData.height) >= SPAWN_CLEARANCE_M);
}
export const pickSdTemplate = (s, templates) => (templates?.length ? templates[sdRoll(s, 3) % templates.length] : null);

/**
 * @param {{ s:number }} rec
 * @param {{ px:number, py:number, cityName:string }} site
 * @param {any} template
 * @param {{ regionIndex?:number, regionName?:string, politic?:number, climate?:object }} [where]
 */
export function sdHollowLocation(rec, site, template, where = {}) {
  if (!rec || !site || !template) return null;
  const loc = synthesizeDungeonLocation(template, { salt: sdSalt(rec.s), px: site.px, py: site.py, where, elite: false });
  return { ...loc, name: sdNameOf(rec.s, site.cityName), superTier: true, sdSlot: rec.s };
}
