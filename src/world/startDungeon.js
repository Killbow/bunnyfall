// The tutorial dungeon: the dungeon on the classic start's cell (Startup.StartCellX/Y), so a custom cell moves it.
// world.js reads the same two keys inline. isPrivateersHold matches the Hold by map id instead.
import { getInt } from '../platform/settings.js';
import { longitudeLatitudeToMapPixel } from '../formats/mapsFile.js';
import { PRIVATEERS_HOLD_MAP_ID } from './dungeonTextures.js';

export const isStartCell = (px) => !!px && px.x === getInt('Startup', 'StartCellX') && px.y === getInt('Startup', 'StartCellY');

function pixelOf(loc) {
  const mt = loc?.mapTableData;
  return mt && Number.isFinite(mt.longitude) && Number.isFinite(mt.latitude) ? longitudeLatitudeToMapPixel(mt.longitude, mt.latitude) : null;
}

export const isStartDungeon = (loc) => isStartCell(pixelOf(loc));

export const isPrivateersHold = (loc) => ((loc?.mapTableData?.mapId ?? 0) >>> 0) === PRIVATEERS_HOLD_MAP_ID;

export const HOLD_ONCE_TEXT = 'You cannot go back into Privateer\'s Hold.';

