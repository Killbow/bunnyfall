// @ts-check
// BUNNYFALL (2026-11-04, the owner: "remember every village and settlement in the area is a desolated mess"; asked: "No
// townsfolk, shops, guards or quest givers. Doors are boarded up, or open onto looted, empty rooms. The purple monsters
// roam the streets, including in Cromwark Hamlet"): THE REACH'S TOWNS, DESOLATE (systems/wild/cromwark.js).
//
// A town is desolate when its map pixel is inside the zone (wildZone.js's mask, read off the map files every client holds,
// so every client agrees, online and off). The hosts ask:
//   - the pixel's build (scenes/pixelBuild.js): no wandering population, no standing NPCs in the streets;
//   - a door (scenes/worldModes.js): half are boarded up, the rest open onto rooms with nobody in them - the same doors
//     on every machine (a hash of the town, the block and the building);
//   - the wanderers' roll (scenes/world.js): a desolate town's streets roll the wilds' tables, day and night.
import { wildMaskOf, wildInside } from './wildZone.js';
import { CROMWARK_ON } from './cromwark.js';
import { t } from '../textManager.js';

/** The world's map files, registered once by the world host (scenes/cromwarkHost.js) for the hosts that hold none. */
let _maps = null;
export const setCromwarkMaps = (/** @type {any} */ maps) => { _maps = maps ?? null; };
/** Is map pixel (px, py) one of the reach's desolate grounds? `maps` the map files (null: the registered ones). */
export const cromwarkDesolateAt = (/** @type {any} */ maps, /** @type {number} */ px, /** @type {number} */ py) =>
  CROMWARK_ON && Number.isFinite(px) && Number.isFinite(py) && wildInside(wildMaskOf(maps ?? _maps), px, py);

/** A location's map pixel (formats/mapsFile.js longitudeLatitudeToMapPixel), or null. */
export function locationPixel(/** @type {any} */ dfLocation) {
  const m = dfLocation?.mapTableData;
  if (!m || !Number.isFinite(m.longitude) || !Number.isFinite(m.latitude)) return null;
  return { x: Math.trunc(m.longitude / 128), y: 499 - Math.trunc(m.latitude / 128) };
}
/** Is this location desolate? */
export function cromwarkDesolateLocation(/** @type {any} */ maps, /** @type {any} */ dfLocation) {
  const p = locationPixel(dfLocation);
  return !!p && cromwarkDesolateAt(maps, p.x, p.y);
}

/** A building's door in a desolate town: 'boarded' (it will not open) or 'looted' (open, nobody inside) - or null
 *  outside the reach. The same answer on every machine. */
export function cromwarkDoor(/** @type {any} */ maps, /** @type {any} */ dfLocation, /** @type {number} */ blockIndex, /** @type {number} */ recordIndex) {
  if (!cromwarkDesolateLocation(maps, dfLocation)) return null;
  let h = 0x811c9dc5;
  for (const v of [dfLocation?.mapTableData?.mapId ?? 0, blockIndex | 0, recordIndex | 0]) { h ^= v >>> 0; h = Math.imul(h, 0x01000193) >>> 0; h ^= h >>> 13; }
  return (h & 1) ? 'boarded' : 'looted';
}

/** The doors' words, read when said. */
export const cromwarkTownText = (/** @type {'boarded' | 'looted'} */ k) => (k === 'boarded'
  ? t('cromwark.door.boarded', 'The door is boarded up. Nobody has lived here since Cromwark fell.')
  : t('cromwark.door.looted', 'The house stands open. Whatever was here was taken long ago.'));
