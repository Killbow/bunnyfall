// @ts-check
import { mapPixelToLongitudeLatitude, LOCATION_TYPES } from '../formats/mapsFile.js';
import { CELLS_W, etherHash, etherBandOf, etherDepthAt, ETHER_WORD, isleAt, islesNear } from './ethericSea.js';

// Isle place ids use their own lane in the high 12 bits and start past the largest Bay pixel id, so they never
// match a Bay id.
export const ETHER_PLACE_SALT = 0xe7;
export const ETHER_PLACE_BASE = 500000;
export const ETHER_REGION = 19;
export const ETHER_REGION_NAME = `the ${ETHER_WORD} Isles`;
export const TOWN_BLOCKS = Object.freeze({ port: Object.freeze([2, 6]), haven: Object.freeze([6, 12]) });
export const ELITE_BANDS = Object.freeze(['deep', 'abyss']);

export const etherPlaceId = (isle) => (((ETHER_PLACE_SALT << 20) | (ETHER_PLACE_BASE + isle.cy * CELLS_W + isle.cx)) >>> 0);
// Negative and below -999, so it never matches a MAPS.BSA row or the -1 that spawns share.
export const etherLocationIndex = (isle) => -(1000 + isle.cy * CELLS_W + isle.cx);
export const isEtherPlaceId = (id) => ((Number(id) >>> 20) & 0xfff) === ETHER_PLACE_SALT && ((Number(id) >>> 0) & 0xfffff) >= ETHER_PLACE_BASE;
export const PLACE_KINDS = Object.freeze(['port', 'ruin']);
export function etherPlaceIsle(x, y) {
  const isle = isleAt(x, y);
  return isle && isle.px === x && isle.py === y && PLACE_KINDS.includes(isle.kind) ? isle : null;
}
/**
 * @param {{x:number, y:number}} at
 * @param {number} reach
 * @param {'port'|'ruin'} kind
 */
export function etherPlaceRows(at, reach, kind) {
  return islesNear(at.x, at.y, Math.ceil(reach)).filter((i) => i.kind === kind && Math.hypot(i.px - at.x, i.py - at.y) <= reach)
    .map((isle) => ({ x: isle.px, y: isle.py, isle, row: { mapID: etherPlaceId(isle), regionIndex: ETHER_REGION } }));
}

const blocksOf = (l) => (l?.exterior?.exteriorData?.width | 0) * (l?.exterior?.exteriorData?.height | 0);
const idOf = (l) => (l?.mapTableData?.mapId ?? 0) >>> 0;
/**
 * @param {Iterable<any>} rows
 * @param {(mapId: number) => boolean} [isMain]
 */
export function etherTemplates(rows, isMain = () => false) {
  const list = [...(rows ?? [])].filter((l) => l?.exterior?.exteriorData && !l.spawned && !l.ether && !isMain(idOf(l)));
  const type = (l) => l.mapTableData?.locationType;
  const within = (l, range) => blocksOf(l) >= range[0] && blocksOf(l) <= range[1];
  const byId = (a, b) => idOf(a) - idOf(b);
  const towns = list.filter((l) => !l.hasDungeon && (type(l) === LOCATION_TYPES.TownHamlet || type(l) === LOCATION_TYPES.TownVillage) && within(l, TOWN_BLOCKS.port)).sort(byId);
  const havens = list.filter((l) => !l.hasDungeon && (type(l) === LOCATION_TYPES.TownHamlet || type(l) === LOCATION_TYPES.TownVillage) && within(l, TOWN_BLOCKS.haven)).sort(byId);
  const dungeons = list.filter((l) => l.hasDungeon && l.dungeon?.blocks?.length);
  const small = dungeons.filter((l) => blocksOf(l) === 1);
  const ruins = (small.length ? small : dungeons).sort(byId);
  return { towns, havens, ruins };
}

export function etherTemplateOf(templates, isle) {
  if (!templates || !isle) return null;
  const list = isle.kind === 'ruin' ? templates.ruins : isle.kind === 'port' ? (isle.haven && templates.havens?.length ? templates.havens : templates.towns) : null;
  return list?.length ? list[etherHash(isle.seed, 11) % list.length] : null;
}

/**
 * Templates are cached location objects shared with the exterior layout, so the clone copies every nested object it
 * changes and never mutates the template.
 * @param {any} template
 * @param {any} isle
 * @param {{ regionIndex?: number, regionName?: string, politic?: number, climate?: any }} [where]
 */
export function synthesizeEtherLocation(template, isle, where = {}) {
  const mapId = etherPlaceId(isle);
  const ll = mapPixelToLongitudeLatitude(isle.px, isle.py);
  const port = isle.kind === 'port';
  const loc = {
    ...template,
    name: isle.name,
    regionIndex: where.regionIndex ?? ETHER_REGION,
    regionName: where.regionName ?? ETHER_REGION_NAME,
    politic: where.politic ?? template.politic,
    climate: where.climate ?? template.climate,
    locationIndex: etherLocationIndex(isle),
    mapTableData: { ...template.mapTableData, mapId, longitude: ll.x, latitude: ll.y },
    exterior: {
      ...template.exterior,
      exteriorData: { ...template.exterior?.exteriorData, locationId: mapId, mapId, portTownAndUnknown: port ? 1 : 0 },
      ...(template.exterior?.recordElement ? { recordElement: { ...template.exterior.recordElement, header: { ...template.exterior.recordElement.header, locationId: mapId } } } : {}),
    },
    ether: isle.key,
    etherKind: isle.kind,
  };
  if (template.dungeon) loc.dungeon = { ...template.dungeon, recordElement: { ...template.dungeon?.recordElement, header: { ...template.dungeon?.recordElement?.header, locationId: mapId } } };
  if (isle.kind === 'ruin' && ELITE_BANDS.includes(etherBandOf(etherDepthAt(isle.px)).id)) loc.elite = true;
  return loc;
}
