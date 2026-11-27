// @ts-check
import { LOCATION_TYPES } from '../formats/mapsFile.js';
import { YARD_KIND_ORDER, CRAFT_YARD_ORDER, YARD_TALK_GROUPS, YARD_KEY_BASE, YARD_QUALITY, townSeed, townKeeper, namedAfter } from '../world/merchantYards/merchantYards.js';

export const PORT_SITE_ORDER = Object.freeze(['shipyard', 'lighthouse']);
export const PORT_PLACE_ORDER = Object.freeze(['shipyard', 'crewhall', 'lighthouse', 'docks']);
export const PORT_PLACES = Object.freeze({
  shipyard: Object.freeze({ key: 'shipyard', title: 'Shipyard', keeper: 'Shipmaster', trade: 'Ships sold, bought back, mended and refitted', sign: 'SHIPS', seed: 0x5419a7, group: 'Shipyards' }),
  crewhall: Object.freeze({ key: 'crewhall', title: 'Crew Hall', keeper: 'Crewmaster', trade: 'Hands signed on for any ship', sign: 'CREW', seed: 0x0c4e11, group: 'Crew halls' }),
  lighthouse: Object.freeze({ key: 'lighthouse', title: 'Lighthouse', keeper: 'Lightkeeper', trade: 'The harbor\'s light', sign: '', seed: 0x011947, group: 'Lighthouses' }),
  docks: Object.freeze({ key: 'docks', title: 'Docks', keeper: '', trade: 'Ships made fast and cargo landed', sign: '', seed: 0x00d0c5, group: 'Docks' }),
});
export const validPortPlace = (k) => (typeof k === 'string' && Object.prototype.hasOwnProperty.call(PORT_PLACES, k) ? k : null);
export const validPortSite = (k) => (PORT_SITE_ORDER.includes(/** @type {any} */ (k)) ? /** @type {string} */ (k) : null);

export const PORT_TOWN_TYPES = Object.freeze([LOCATION_TYPES.TownCity, LOCATION_TYPES.TownHamlet, LOCATION_TYPES.TownVillage]);
/** @param {number} type */
export const isPortTownType = (type) => PORT_TOWN_TYPES.includes(/** @type {any} */ (type));
export const isPortTown = (loc, isPort) => isPortTownType(loc?.mapTableData?.locationType) && !!isPort;
// The port data alone does not prove a coast, because inland region capitals also carry the PortTownAndUnknown
// byte, so `portTownOnSea` adds the open-sea check.
export const portTownByData = (loc, hasPort) => !!hasPort?.(loc?.mapTableData?.mapId) || (loc?.exterior?.exteriorData?.portTownAndUnknown ?? 0) !== 0;

// Each kind's directory key is `YARD_KEY_BASE` plus its index here, so reordering this list changes the key of
// every later kind.
export const FOUND_KIND_ORDER = Object.freeze([...YARD_KIND_ORDER, ...PORT_PLACE_ORDER, ...CRAFT_YARD_ORDER]);
export const FOUND_TALK_GROUPS = Object.freeze({
  ...YARD_TALK_GROUPS,
  ...Object.fromEntries(PORT_PLACE_ORDER.map((k) => [k, PORT_PLACES[k].group])),
});
export const foundBuildingKey = (kind) => {
  const i = FOUND_KIND_ORDER.indexOf(/** @type {any} */ (kind));
  return i < 0 ? -1 : YARD_KEY_BASE + i;
};
const UNLETTERED = new Set(['crewhall', 'docks'].map((k) => foundBuildingKey(k)));
export const lettersOnMap = (buildingKey) => !UNLETTERED.has(buildingKey);

/**
 * @param {number} mapId
 * @param {string} place
 * @param {number} regionIndex
 */
export const portKeeper = (mapId, place, regionIndex) => townKeeper(townSeed(mapId, PORT_PLACES[validPortPlace(place) ?? 'shipyard'].seed), regionIndex);

/**
 * @param {string} place
 * @param {{ keeperName?: string|null, townName?: string|null }} [o]
 */
export function portPlaceName(place, { keeperName = '', townName = '' } = {}) {
  const k = validPortPlace(place) ?? 'shipyard';
  const town = String(townName ?? '').trim();
  if (k === 'lighthouse') return town ? `The ${town} Light` : 'The Lighthouse';
  if (k === 'docks') return town ? `${town} Docks` : 'The Docks';
  return namedAfter(keeperName, PORT_PLACES[k].title);
}

/** @param {Array<any>|null|undefined} places */
export function portDirectoryRows(places) {
  const out = [];
  for (const s of places ?? []) {
    const kind = validPortPlace(s?.kind);
    if (!kind || !Number.isFinite(s.x) || !Number.isFinite(s.z)) continue;
    out.push({
      name: typeof s.name === 'string' && s.name ? s.name : portPlaceName(kind), buildingType: `port:${kind}`, factionId: 0, quality: YARD_QUALITY,
      position: [s.x, 0, s.z], buildingKey: foundBuildingKey(kind), yard: kind,
    });
  }
  return out;
}
