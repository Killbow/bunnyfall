// @ts-check
import { cromwarkQuestSiteBlocked } from '../../world/wild/cromwarkSettlements.js';
import { LOCATION_TYPES, longitudeLatitudeToMapPixel } from '../../formats/mapsFile.js';

const TOWN_TYPES = new Set([LOCATION_TYPES.TownCity, LOCATION_TYPES.TownHamlet, LOCATION_TYPES.TownVillage]);
export const isTownEntry = (e) => !!e && !cromwarkQuestSiteBlocked(e.mapId) && TOWN_TYPES.has(e.locationType);

export function townAt(dfRegion, regionName, pixel) {
  const table = dfRegion?.mapTable ?? [];
  for (let i = 0; i < table.length; i++) {
    const e = table[i];
    if (!isTownEntry(e)) continue;
    const px = longitudeLatitudeToMapPixel(e.longitude, e.latitude);
    if (px.x === pixel?.x && px.y === pixel?.y) return { region: String(regionName), loc: String(dfRegion.mapNames?.[i] ?? '') };
  }
  return null;
}

export function nearestTown(dfRegion, regionName, pixel) {
  const table = dfRegion?.mapTable ?? [];
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < table.length; i++) {
    const e = table[i];
    if (!isTownEntry(e) || !dfRegion.mapNames?.[i]) continue;
    const px = longitudeLatitudeToMapPixel(e.longitude, e.latitude);
    const d = (px.x - pixel.x) ** 2 + (px.y - pixel.y) ** 2;
    if (d < bestD) { bestD = d; best = { region: String(regionName), loc: String(dfRegion.mapNames[i]), pixel: px }; }
  }
  return best;
}

// Scanning every region changes the loaded region in `maps`, so the region loaded before is loaded again at the
// end.
export function nearestTownAnywhere(maps, regionNames, pixel) {
  const before = maps?._lastRegion ?? -1;
  let best = null;
  let bestD = Infinity;
  for (let r = 0; r < (maps?.regionCount ?? 0); r++) {
    const hit = nearestTown(maps.getRegion(r), regionNames[r], pixel);
    if (!hit) continue;
    const d = (hit.pixel.x - pixel.x) ** 2 + (hit.pixel.y - pixel.y) ** 2;
    if (d < bestD) { bestD = d; best = hit; }
  }
  if (before >= 0 && typeof maps?.loadRegion === 'function') maps.loadRegion(before);
  return best;
}

// The reload carries `world=1` so it goes straight to the world host; the front door clears the menu keys and the
// birth would be lost.
export function birthSearch(search, personId, place) {
  const p = new URLSearchParams(search);
  for (const k of ['load', 'loadkey', 'classicload', 'classic', 'class', 'test', 'realm', 'realmnew', 'spawn', 'legacyborn']) p.delete(k);
  p.set('world', '1');
  if (p.has('online')) p.set('realmnew', '1');
  p.set('legacyborn', String(personId));
  if (place?.region) p.set('region', place.region);
  if (place?.loc) p.set('loc', place.loc);
  return `?${p.toString()}`;
}

export function loadSearch(search, key) {
  const p = new URLSearchParams(search);
  for (const k of ['classicload', 'class', 'test', 'realm', 'realmnew', 'spawn', 'legacyborn', 'region', 'loc']) p.delete(k);
  p.set('world', '1');
  p.set('classic', '1');
  p.set('load', '1');
  p.set('loadkey', String(key));
  return `?${p.toString()}`;
}
