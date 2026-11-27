import { createMusicDirector } from '../scenes/shared.js';
import { HolidayTextTimer } from '../world/holidays.js';
import {
  isInLocationRect, locationWorldRect, mapPixelToWorldCoords, worldCoordToMapPixel,
} from '../world/streamingWorld.js';
import { pointNearPath, UNITS_PER_METRE } from '../world/roadClearance.js';

/** @param {any} shared */
export function createMusicPlaceWorld(shared) {
  const { cam, locationIndex, player, playerTravelPixel, state, terrainGen, walkMode } = shared;
  // A map pixel can hold a location while the player is outside its rect, the town footprint widened by one block.
  const _musicInLocationRect = () => {
    if (!shared._musicLoc) return false;
    const px = playerTravelPixel();
    const wc = state.worldCoords(walkMode ? player.pos : cam.pos);
    return isInLocationRect(wc.x, wc.z, locationWorldRect(shared._musicLoc, px.x, px.y));
  };
  const _nearRoad = (pos, radiusM) => {
    const net = terrainGen.roads();
    if (!net) return false;
    const wc = state.worldCoords(pos);
    const p = worldCoordToMapPixel(wc.x, wc.z);
    const o = mapPixelToWorldCoords(p.x, p.y);
    return pointNearPath(net, p.x, p.y, wc.x - o.x, wc.z - o.z, radiusM * UNITS_PER_METRE);
  };
  // A widened rect can cross the edge of its pixel, so the eight neighboring pixels are tested too.
  const _inAnyLocationRect = (pos) => {
    const wc = state.worldCoords(pos);
    const px = worldCoordToMapPixel(wc.x, wc.z);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const loc = locationIndex.get(`${px.x + dx},${px.y + dy}`);
        if (loc?.exterior?.exteriorData && isInLocationRect(wc.x, wc.z, locationWorldRect(loc, px.x + dx, px.y + dy))) return true;
      }
    }
    return false;
  };

  const stillAt = (mapId) => shared._wasInLocationRect && shared._musicLoc?.mapTableData?.mapId === mapId;
  const _musicLocationType = () => shared._musicLoc?.mapTableData?.locationType ?? 0xffff;
  const _musicLocationIndex = () => shared._musicLoc?.locationIndex ?? -1;
  const _holidayText = new HolidayTextTimer();
  const musicDirector = createMusicDirector();
  return {
    _holidayText, _inAnyLocationRect, _musicInLocationRect, _musicLocationIndex, _musicLocationType, _nearRoad,
    musicDirector, stillAt,
  };
}
