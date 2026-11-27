// Port of PlayerGPS nearby-object flags and the Detect effects' query.

import { LOCATION_TYPES } from '../formats/mapsFile.js';
import { enemyCareerIndex } from '../characters/enemyBasics.js';
import { ENEMY_GROUPS, enemyEntityGroup } from '../combat/enemyGroups.js';

export const NEARBY = Object.freeze({
  None: 0,
  Enemy: 1,
  Treasure: 2,
  Magic: 4,
  Undead: 8,
  Daedra: 16,
  Humanoid: 32,
  Animal: 64,
});

export const REFRESH_NEARBY_OBJECTS_INTERVAL = 0.33;
export const NEARBY_DEFAULT_MAX_RANGE = 14;

const GROUP_FLAG = Object.freeze({
  [ENEMY_GROUPS.Undead]: NEARBY.Undead,
  [ENEMY_GROUPS.Daedra]: NEARBY.Daedra,
  [ENEMY_GROUPS.Humanoid]: NEARBY.Humanoid,
  [ENEMY_GROUPS.Animals]: NEARBY.Animal,
});

const careerIndexOf = (mobileType) => enemyCareerIndex(mobileType);
export const TOWN_LOCATION_TYPES = Object.freeze(new Set([
  LOCATION_TYPES.TownCity, LOCATION_TYPES.TownHamlet, LOCATION_TYPES.TownVillage,
  LOCATION_TYPES.HomeFarms, LOCATION_TYPES.HomeWealthy,
  LOCATION_TYPES.Tavern, LOCATION_TYPES.ReligionTemple,
]));
export function isPlayerInTown(locationType, {
  mustBeInLocationRect = false, mustBeOutside = false,
  inLocationRect = false, inside = false,
} = {}) {
  if (!TOWN_LOCATION_TYPES.has(locationType)) return false;
  if (mustBeInLocationRect && !inLocationRect) return false;
  if (mustBeOutside && inside) return false;
  return true;
}

export const enemyGroupOf = (mobileType) => GROUP_FLAG[enemyEntityGroup(careerIndexOf(mobileType))] ?? NEARBY.None;

export function entityFlags(rec) {
  if (!rec) return NEARBY.None;
  let result = NEARBY.None;
  if (rec.civilian) {
    result |= NEARBY.Humanoid;
  } else {
    result |= NEARBY.Enemy;
    result |= enemyGroupOf(rec.mobileType);
  }
  if ((rec.effectCount ?? 0) > 0) result |= NEARBY.Magic;
  return result;
}

export function lootFlags(rec) {
  if (!rec) return NEARBY.None;
  return (rec.itemCount ?? 0) > 0 ? NEARBY.Treasure : NEARBY.None;
}

const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function updateNearbyObjects(playerPos, { entities = [], loot = [] } = {}) {
  const out = [];
  for (const rec of entities) {
    if (!rec?.pos) continue;
    out.push({
      ref: rec.ref ?? rec,
      pos: [rec.pos[0], rec.pos[1], rec.pos[2]],
      distance: dist3(playerPos, rec.pos),
      flags: entityFlags(rec),
      active: rec.active !== false,
    });
  }
  for (const rec of loot) {
    if (!rec?.pos) continue;
    out.push({
      ref: rec.ref ?? rec,
      pos: [rec.pos[0], rec.pos[1], rec.pos[2]],
      distance: dist3(playerPos, rec.pos),
      flags: lootFlags(rec),
      active: rec.active !== false,
    });
  }
  return out;
}

export function getNearbyObjects(list, flags, maxRange = NEARBY_DEFAULT_MAX_RANGE, activeInHierarchy = true) {
  if (flags === NEARBY.None) return null;
  return (list ?? []).filter((no) =>
    (no.flags & flags) === flags
    && no.distance < maxRange
    && no.active === activeInHierarchy);
}

// The timer resets to 0 on fire and does not subtract the interval, so a long frame never banks a second rebuild.
export function createNearbyScan(rebuild) {
  let timer = 0;
  let list = [];
  return {
    get list() { return list; },
    tick(dt) {
      timer += dt;
      if (timer > REFRESH_NEARBY_OBJECTS_INTERVAL) {
        list = rebuild() ?? [];
        timer = 0;
      }
      return list;
    },
    reset() { timer = 0; list = []; },
  };
}

export const DETECT_KIND_FLAG = Object.freeze({
  detectMagic: NEARBY.Magic,
  detectEnemy: NEARBY.Enemy,
  detectTreasure: NEARBY.Treasure,
});

export function detectedMarkers(entity, list) {
  const out = [];
  for (const a of entity?.activeEffects ?? []) {
    if (a.ended) continue;
    const flag = DETECT_KIND_FLAG[a.kind];
    if (flag == null) continue;
    for (const no of getNearbyObjects(list, flag) ?? []) out.push([no.pos[0], no.pos[2]]);
  }
  return out;
}

export const hasLiveDetector = (entity) =>
  (entity?.activeEffects ?? []).some((a) => !a.ended && DETECT_KIND_FLAG[a.kind] != null);
