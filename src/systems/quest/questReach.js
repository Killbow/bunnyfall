// @ts-check
// With Nearby quests on, remote quest sites come from those within a level-based reach of the player's map pixel.
// Distance is the longest axis because travel time charges one map pixel per step along it.
// Nothing here rolls: callers draw from the returned pools with the quest's own roll, so seeded quests stay seeded.

import { getPref } from '../../ui/uiPrefs.js';
import { longitudeLatitudeToMapPixel } from '../../formats/mapsFile.js';

export const NEARBY_QUESTS_KEY = 'nearbyQuests';
export const QUEST_REACH_BASE = 10;
export const QUEST_REACH_PER_LEVEL = 4;
export const QUEST_REACH_MIN_CHOICES = 3;
export const QUEST_REACH_TUNING = { override: /** @type {boolean|null} */ (null) };
if (typeof window !== 'undefined') /** @type {any} */ (window).__DF_QUEST_REACH = QUEST_REACH_TUNING;

export const questReachOn = () => QUEST_REACH_TUNING.override ?? !!getPref(NEARBY_QUESTS_KEY);

export function questReachPixels(level) {
  const lv = Number.isFinite(level) && level >= 1 ? Math.floor(level) : 1;
  return QUEST_REACH_BASE + QUEST_REACH_PER_LEVEL * (lv - 1);
}

export function mapTablePixel(entry) {
  if (!Number.isFinite(entry?.longitude) || !Number.isFinite(entry?.latitude)) return null;
  return longitudeLatitudeToMapPixel(entry.longitude, entry.latitude);
}

export function indicesWithin(regionData, indices, origin, reach) {
  const out = [];
  for (const i of indices) {
    const px = mapTablePixel(regionData.mapTable[i]);
    if (!px) return null;
    if (mapPixelDistance(px, origin) <= reach) out.push(i);
  }
  return out;
}

export function mapPixelDistance(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function nearbyIndices(regionData, indices, origin, reach, minChoices = QUEST_REACH_MIN_CHOICES) {
  const within = indicesWithin(regionData, indices, origin, reach);
  if (within === null) return indices;
  if (within.length >= minChoices || within.length === indices.length) return within;
  const dist = (i) => mapPixelDistance(/** @type {{x:number,y:number}} */ (mapTablePixel(regionData.mapTable[i])), origin);
  return indices.map((i) => [i, dist(i)]).sort((p, q) => p[1] - q[1] || p[0] - q[0]).slice(0, minChoices).map((p) => p[0]);
}
