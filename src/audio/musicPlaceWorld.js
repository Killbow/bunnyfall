// The world's music place: whether the player is inside the music location's rect, and that
// location's type and index. It also says whether the player is still at a given location and
// holds the music director, the near road and location rect tests, and the holiday text timer.
import { createMusicDirector } from '../scenes/shared.js';
import { HolidayTextTimer } from '../world/holidays.js';
import {
  isInLocationRect, locationWorldRect, mapPixelToWorldCoords, worldCoordToMapPixel,
} from '../world/streamingWorld.js';
import { pointNearPath, UNITS_PER_METRE } from '../world/roadClearance.js';

/** @param {any} shared */
export function createMusicPlaceWorld(shared) {
  const { cam, locationIndex, player, playerTravelPixel, state, terrainGen, walkMode } = shared;
  // AUDIT 24 (the seven-slice sweep): the seam above USED to answer
  // `_musicLoc !== null` - "this map pixel carries a location" - and
  // called that DFU's IsPlayerInLocationRect. It is not. C#'s own
  // comment at PlayerGPS.cs:687 says so in as many words: "Player can
  // be inside a map pixel with location but not inside location rect".
  // The real test is a WORLD-COORDINATE one against the town's
  // footprint widened by one full city block, and a map pixel is up to
  // seven times that area. Every consumer read the widened answer: the
  // quest machine's `when pc enters/exits`, CreateFoe's `send` gate,
  // isPlayerInTown, and the music director's location context.
  const _musicInLocationRect = () => {
    if (!shared._musicLoc) return false;
    const px = playerTravelPixel();
    const wc = state.worldCoords(walkMode ? player.pos : cam.pos);
    return isInLocationRect(wc.x, wc.z, locationWorldRect(shared._musicLoc, px.x, px.y));
  };
  /** DISC19-F: a scene point inside ANY location's widened rect - the
   *  pixel it stands in and its eight neighbours, since a rect widened
   *  by a block can cross its own pixel's edge. The camp gate's
   *  question (campEncounters.js: "camps are a wilderness thing"):
   *  `_musicInLocationRect` answers for the PLAYER against the location
   *  syncTopics last resolved, which on the very frame a new pixel is
   *  entered - the camp roll's frame - is still the old pixel's, and it
   *  says nothing about where the group is put 14-26 units away. */
  /** ROADS-CLEAR (2026-09-25, Mac: "Camps ... shouldnt be placed on roads"): is a scene position within `radiusM`
   *  metres of a road or track's painted band (world/road/roadClearance.js), in its pixel or the next? False until the
   *  network lands - a camp rolled that early stands where it rolled. */
  const _nearRoad = (pos, radiusM) => {
    const net = terrainGen.roads();
    if (!net) return false;
    const wc = state.worldCoords(pos);
    const p = worldCoordToMapPixel(wc.x, wc.z);
    const o = mapPixelToWorldCoords(p.x, p.y);
    return pointNearPath(net, p.x, p.y, wc.x - o.x, wc.z - o.z, radiusM * UNITS_PER_METRE);
  };
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

  /** AUDIT-SEATS C4: whether the player still stands in the location `mapId` names - the rect's own edge, and that
   *  location (an arrival said late, once the seats' read answers, is said only there). */
  const stillAt = (mapId) => shared._wasInLocationRect && shared._musicLoc?.mapTableData?.mapId === mapId;
  const _musicLocationType = () => shared._musicLoc?.mapTableData?.locationType ?? 0xffff;
  const _musicLocationIndex = () => shared._musicLoc?.locationIndex ?? -1;
  // AUDIT 64 F10 - PlayerEnterExit's holiday-text fields (:78-80). The
  // location it remembers is StreamingWorld.CurrentPlayerLocationObject,
  // which in this host IS `_musicLoc`: the per-pixel DFLocation object
  // the rect test already reads, compared by identity as DFU's is.
  const _holidayText = new HolidayTextTimer();
  const musicDirector = createMusicDirector();
  return {
    _holidayText, _inAnyLocationRect, _musicInLocationRect, _musicLocationIndex, _musicLocationType, _nearRoad,
    musicDirector, stillAt,
  };
}
