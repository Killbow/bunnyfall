// @ts-check
// MAGICAL TAVERNS (2026-11-18, the owner: "separate 'magical' taverns that share their interiors across all of the map ...
// all of the doors to these taverns are just portals. If the city has at least two taverns, one tavern gets hueshifted to
// blue and becomes the magical tavern ... the window shows a starry sky and Nyx replaces the bartender").
//
// THE LAW, pure and shared by every client (no DOM, no clock, no network). The pieces that stand it:
//   scenes/magicTavernRoom.js   the town's pick, the door that opens the shared hall, its people (Nyx), its windows
//   render/magicTavernLook.js   the blue outside, the portal door, the star glass
//   a few lines in scenes/pixelBuild.js (outside), worldModes.js (door), interiorContext.js (people), world.js (the room)
//
// THE RULE. A town holds the taverns its blocks list (buildingType 15). With fewer than TWO it has no magical tavern. With
// two or more, take their building keys in ascending order and pick index `hash(mapId) mod count`: the map id and the keys
// are Daggerfall's own data, so every client agrees without a word on the wire. (The server never needs the pick: a
// shift's validation reads the origin tavern's own record, which a magical tavern keeps - see magicTavernRoom.js.)
//
// THE SHARED ROOM. Every magical tavern opens ONE hall. Its presence room is the relay's ordinary building room,
// `interior:m<MAGIC_ROOM.mapId>.<MAGIC_ROOM.buildingKey>`, a number pair no town of the game owns (a real map id is
// MAPS.BSA's, well under 4 billion and none of them this; the key is past every real building key, 8 digits), so
// players from every town meet there with the relay as it is.

import { contentOn } from './contentOff.js';

/** Whether the feature is on at all (systems/contentOff.js). */
export const magicTavernsOn = () => contentOn('magicTaverns');

/** The shared hall's relay room, as `roomKeyFor` spells it: `interior:m4000000007.77000001`. */
export const MAGIC_ROOM = Object.freeze({ mapId: 4_000_000_007, buildingKey: 77_000_001 });

/** The hall's body: the BIGGEST tavern interior Daggerfall has - of every building that is a tavern in a TVRN* block, the one
 *  with the most things in its room, the lowest block name and record winning a tie (scenes/magicTavernRoom.js `grandestTavern`).
 *  Read off the game's own files, so every client picks the same one. Where none can be read, a magical tavern is left as the plain one. */
export const MAGIC_HALL_BLOCKS = /^TVRN/i;

/** What the room's people are: the keeper's name and the art she stands as (systems/guild/guildClerkArt.js). */
export const MAGIC_KEEPER = Object.freeze({ name: 'Nyx', art: 'nyx' });

/** A 32-bit mix (murmur3's finaliser), so neighbouring map ids pick unrelated taverns. @param {number} n */
export function mixMapId(n) {
  let h = (n >>> 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * The magical tavern of a town: its building key, or null where the town has fewer than two taverns.
 * @param {number} mapId the town's MapTableData.MapId
 * @param {number[]} tavernKeys the building keys of the town's taverns, in any order
 * @returns {number | null}
 */
export function magicTavernKeyOf(mapId, tavernKeys) {
  const keys = [...new Set(tavernKeys.filter((k) => Number.isSafeInteger(k)))].sort((a, b) => a - b);
  if (keys.length < 2 || !Number.isFinite(mapId) || mapId <= 0) return null;
  return keys[mixMapId(mapId) % keys.length];
}
