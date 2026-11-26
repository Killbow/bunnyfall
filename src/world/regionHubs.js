// @ts-check
// Every region's main city is its hub: the same result on every client, from the rows MAPS.BSA holds.

import { REGION_NAMES, LOCATION_TYPES, longitudeLatitudeToMapPixel } from '../formats/mapsFile.js';

export const HUB_CAPITALS = Object.freeze(['Daggerfall', 'Wayrest', 'Sentinel']);

const KIND_RANK = Object.freeze({
  [LOCATION_TYPES.TownCity]: 3,
  [LOCATION_TYPES.TownHamlet]: 2,
  [LOCATION_TYPES.TownVillage]: 1,
});

const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();

export function hubClaim(loc, regionName) {
  const kind = KIND_RANK[loc?.mapTableData?.locationType];
  if (!kind) return null;
  const ext = loc.exterior?.exteriorData;
  const blocks = (ext?.width | 0) * (ext?.height | 0);
  const buildings = loc.exterior?.buildingCount | 0;
  return [kind, same(loc.name, regionName) ? 1 : 0, blocks, buildings, -(loc.locationIndex | 0)];
}

export function outranks(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

/**
 * @param {Iterable<any>|null|undefined} locations
 * @param {{ regionNameOf?: (regionIndex: number) => string, isBase?: (loc: any) => boolean }} [opts]
 */
export function pickRegionHubs(locations, { regionNameOf = (r) => REGION_NAMES[r] ?? '', isBase = () => true } = {}) {
  /** @type {Map<number, {loc: any, claim: number[]}>} */
  const best = new Map();
  for (const loc of locations ?? []) {
    if (!loc || !Number.isInteger(loc.regionIndex) || !Number.isInteger(loc.locationIndex) || !isBase(loc)) continue;
    const claim = hubClaim(loc, regionNameOf(loc.regionIndex));
    if (!claim) continue;
    const had = best.get(loc.regionIndex);
    if (!had || outranks(claim, had.claim)) best.set(loc.regionIndex, { loc, claim });
  }
  /** @type {Map<number, any>} */
  const byRegion = new Map();
  /** @type {Map<number, any>} */
  const byMapId = new Map();
  for (const [regionIndex, { loc }] of [...best].sort((a, b) => a[0] - b[0])) {
    const regionName = regionNameOf(regionIndex);
    const px = longitudeLatitudeToMapPixel(loc.mapTableData.longitude, loc.mapTableData.latitude);
    const hub = Object.freeze({
      regionIndex,
      locationIndex: loc.locationIndex,
      name: loc.name,
      regionName,
      mapId: loc.mapTableData.mapId >>> 0,
      pixel: Object.freeze({ x: px.x, y: px.y }),
      capital: HUB_CAPITALS.some((c) => same(c, loc.name) && same(c, regionName)),
    });
    byRegion.set(regionIndex, hub);
    byMapId.set(hub.mapId, hub);
  }
  return Object.freeze({ byRegion, byMapId });
}

export const hubOfRegion = (hubs, regionIndex) => hubs?.byRegion?.get(regionIndex) ?? null;
export const hubAtMapId = (hubs, mapId) => (mapId == null || !Number.isFinite(Number(mapId)) ? null : hubs?.byMapId?.get(Number(mapId) >>> 0) ?? null);

export const hubTitle = (hub) => (hub.capital ? `Capital of the Kingdom of ${hub.regionName}` : `Hub of ${hub.regionName}`);
export const hubMapWord = (hub) => (hub.capital ? 'Capital' : 'Hub');
export const hubArrivalLine = (hub) => `${hub.name}, ${hub.capital ? 'capital of the Kingdom of' : 'hub of'} ${hub.regionName}.`;
