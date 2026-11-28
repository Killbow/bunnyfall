// Dungeon enemies data layer: a translation of DFU RDBLayout fixed and random enemy placement, classic selection path.

import { srand, randomRangeInclusive } from '../formats/dfRandom.js';
import { ENCOUNTER_TABLES } from './encounterTables.js';
import { encounterTable } from './encounterTableDoor.js';
import { WERERAT, rollWererat } from './wererat.js';
import { MOBILE_TYPES } from './mobileTypes.js';
import { markerTooStrong, bandedPick } from './encounterLevel.js';
import { ENEMY_BASICS } from './enemyBasics.js';
import { getBool } from '../platform/settings.js';

const EDITOR_FLATS_ARCHIVE = 199;
const FIXED_RECORD = 16;
export const RANDOM_RECORD = 15;
const UNDERWATER_TABLE = 19;
const PASSIVE_ACTION = 99;
const GENDER_FEMALE_FLAG = 1;
const GENDER_MALE_FLAG = 2;
export const WATER_SPECIES = new Set([
  MOBILE_TYPES.Slaughterfish, MOBILE_TYPES.Dreugh, MOBILE_TYPES.Lamia,
]);

export function makeSlotRng(seed) {
  let s = (seed >>> 0) || 1;
  return (min, maxExclusive) => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return min + (s % (maxExclusive - min));
  };
}

export function chooseRandomEnemyType(table, playerLevel) {
  let minTableIndex = 0;
  let maxTableIndex = table.length;
  const random = randomRangeInclusive(1, 100);
  if (random > 95 && playerLevel <= 5) {
    maxTableIndex = playerLevel + 2;
  } else if (random > 80) {
    maxTableIndex = playerLevel + 1;
  } else {
    minTableIndex = playerLevel - 3;
    maxTableIndex = playerLevel + 3;
  }
  if (minTableIndex < 0) {
    minTableIndex = 0;
    maxTableIndex = 5;
  } else if (maxTableIndex > 19) {
    minTableIndex = 14;
    maxTableIndex = 19;
  }
  return table[randomRangeInclusive(minTableIndex, maxTableIndex)];
}

export const RANDOM_MONSTER_VARIANCE = 4;

export function alternateRandomEnemyType(table, playerLevel, rng, variance = RANDOM_MONSTER_VARIANCE) {
  const monsterPower = Math.min(Math.max(playerLevel / 20, 0), 1);
  const base = Math.trunc(table.length * monsterPower);
  let min = base - variance; if (min < 0) min = 0;
  let max = base + variance; if (max >= table.length) max = table.length - 1;
  return table[rng(min, max + 1)];
}

export const dungeonPlace = (dfLocation) => ({
  locationId: dfLocation.dungeon.recordElement.header.locationId,
  dungeon: { unknown2: dfLocation.dungeon.recordElement.header.unknown2, region: dfLocation.regionIndex },
});

function markerSpawnSeed(locationId, marker, blockIndex) {
  const x = Math.trunc((Number(marker.x) || 0) * 1000);
  const y = Math.trunc((Number(marker.rawY) || 0) * 1000);
  const z = Math.trunc((Number(marker.z) || 0) * 1000);
  return (((locationId ?? 0) * 31)
    ^ ((marker.loadID ?? 0) + 7919 * (blockIndex + 1))
    ^ Math.imul(x, 73856093)
    ^ Math.imul(y, 19349663)
    ^ Math.imul(z, 83492791)
    ^ (marker.flags ?? 0)) >>> 0;
}

function safeBandedPick(table, playerLevel, seed) {
  if (!Array.isArray(table) || !table.length) return null;
  const rng = makeSlotRng(seed);
  const last = table.length - 1;
  let min = playerLevel - 3, max = playerLevel + 3;
  if (min < 0) { min = 0; max = Math.min(5, last); }
  else if (max > last) { max = last; min = Math.max(0, last - 5); }
  const band = table.slice(min, max + 1);
  const safe = band.filter((id) => Number.isInteger(id)
    && !markerTooStrong(ENEMY_BASICS[id]?.level, playerLevel));
  return safe.length ? safe[rng(0, safe.length)] : null;
}

export function collectDungeonEnemies(blockLayouts, { locationId, dungeonType, dungeon = null, playerLevel = 1,
  alternate = getBool('Enhancements', 'AlternateRandomEnemySelection') } = {}) {
  const slotRng = makeSlotRng(locationId);
  const place = { dungeon, local: true };
  const dungeonTable = encounterTable(dungeonType, place), underwaterTable = encounterTable(UNDERWATER_TABLE, place);
  const nonWater = new Array(256);
  const water = new Array(256);
  if (!alternate) {
    srand(locationId);
    for (let i = 0; i < 256; i++) nonWater[i] = chooseRandomEnemyType(dungeonTable, playerLevel);
    for (let i = 0; i < 256; i++) water[i] = chooseRandomEnemyType(underwaterTable, playerLevel);
  }

  const out = [];
  const emit = (marker, block, mobileType, fixed) => {
    if (WATER_SPECIES.has(mobileType)
      && (block.waterLevel === 10000 || block.waterLevel - 20 > marker.rawY)) {
      return;
    }
    if (mobileType === MOBILE_TYPES.Rat && marker.actionByte !== PASSIVE_ACTION) {
      const die = makeSlotRng(markerSpawnSeed(locationId, marker, blockIndex) ^ 0x7a44b6d1);
      mobileType = rollWererat(mobileType, () => die(0, 10000) / 10000);
    }
    // useGenderFlag is true only for fixed enemies: on random markers the flags byte is the slot.
    let gender = mobileType === WERERAT ? 'female' : 'unspecified';
    if (fixed && mobileType > 43 && mobileType !== WERERAT) {
      if ((marker.flags & GENDER_FEMALE_FLAG) === GENDER_FEMALE_FLAG) gender = 'female';
      if ((marker.flags & GENDER_MALE_FLAG) === GENDER_MALE_FLAG) gender = 'male';
    }
    out.push({
      x: marker.x + block.originX,
      y: marker.y,
      z: marker.z + block.originZ,
      mobileType,
      fixed,
      reaction: marker.actionByte === PASSIVE_ACTION ? 'passive' : 'hostile',
      gender,
      spawnDistanceType: marker.soundIndex,
      loadID: marker.loadID ?? 0,
      blockIndex,
    });
  };

  let blockIndex = -1;
  for (const block of blockLayouts) {
    blockIndex++;
    for (const marker of block.markers) {
      // editorObjects holds archive 199 only; archive 216 treasure flats in the marker list have no enemy fields.
      if ((marker.archive ?? EDITOR_FLATS_ARCHIVE) !== EDITOR_FLATS_ARCHIVE) continue;
      if (marker.record === FIXED_RECORD) {
        const typeValue = marker.isCustomData ? marker.factionOrMobileId : marker.factionOrMobileId & 0xff;
        if (!marker.isCustomData && typeValue === 99) continue;
        let placed = typeValue;
        if (dungeonType < ENCOUNTER_TABLES.length) {
          const seed = ((((locationId ?? 0) * 31) ^ ((marker.loadID ?? 0) + 7919 * (blockIndex + 1))) >>> 0);
          if (markerTooStrong(ENEMY_BASICS[typeValue]?.level, playerLevel)) {
            placed = safeBandedPick(dungeonTable, playerLevel, seed);
          }
        }
        if (placed != null) emit(marker, block, placed, true);
      } else if (marker.record === RANDOM_RECORD) {
        if (dungeonType >= ENCOUNTER_TABLES.length) continue;
        const usingWater = block.waterLevel < marker.rawY;
        if (alternate) {
          const table = usingWater ? underwaterTable : dungeonTable;
          let selected = alternateRandomEnemyType(table, playerLevel, slotRng);
          if (markerTooStrong(ENEMY_BASICS[selected]?.level, playerLevel)) {
            selected = safeBandedPick(table, playerLevel, markerSpawnSeed(locationId, marker, blockIndex));
          }
          if (selected != null) emit(marker, block, selected, false);
          continue;
        }
        let slot = marker.flags;
        if (slot === 0) slot = slotRng(1, 7);
        let selected = (usingWater ? water : nonWater)[slot];
        const table = usingWater ? underwaterTable : dungeonTable;
        if (markerTooStrong(ENEMY_BASICS[selected]?.level, playerLevel)) {
          selected = safeBandedPick(table, playerLevel, markerSpawnSeed(locationId, marker, blockIndex));
        }
        if (selected != null) emit(marker, block, selected, false);
      }
    }
  }
  return out;
}


export const ELITE_COPY_OFFSET = 0.9;
const ELITE_WALL_MARGIN = 0.45;

export const ELITE_FLOOR_STEP = 0.6;

/**
 * @param {Array<object>} enemies
 * @param {{copies?:number, offset?:number,
 *   clearance?:(from:number[], dir:number[], dist:number) => number,
 *   floor?:(at:number[]) => ?number}} o
 */
export function expandEliteEnemies(enemies, { copies = 3, offset = ELITE_COPY_OFFSET, clearance = null, floor = null } = {}) {
  const n = Math.max(1, copies | 0);
  const out = [];
  for (const e of enemies) {
    out.push({ ...e, elite: true });
    const base = floor ? floor([e.x, e.y, e.z]) : null;
    for (let k = 1; k < n; k++) {
      const a0 = ((k - 1) / (n - 1)) * 2 * Math.PI;
      let x = e.x, z = e.z;
      for (const turn of [0, 0.5, -0.5, 1]) {
        const a = a0 + turn * Math.PI;
        const dir = [Math.cos(a), 0, Math.sin(a)];
        let d = offset;
        if (clearance) {
          const free = clearance([e.x, e.y, e.z], dir, offset + ELITE_WALL_MARGIN);
          if (Number.isFinite(free)) d = Math.max(0, Math.min(offset, free - ELITE_WALL_MARGIN));
        }
        const cx = e.x + dir[0] * d, cz = e.z + dir[2] * d;
        if (floor && base != null && d > 0) {
          const f = floor([cx, e.y, cz]);
          if (f == null || Math.abs(f - base) > ELITE_FLOOR_STEP) continue;
        }
        x = cx; z = cz;
        break;
      }
      const copy = e.mobileType === WERERAT ? { mobileType: MOBILE_TYPES.Rat, gender: 'unspecified' } : {};
      out.push({ ...e, ...copy, x, z, elite: true, eliteCopy: true });
    }
  }
  return out;
}

export function enemyHierarchyOrder(pool, layoutCount) {
  return pool
    .map((f, i) => ({ f, k: i < layoutCount && Number.isInteger(f?.src?.blockIndex) ? [f.src.blockIndex, f.src.fixed ? 0 : 1, i] : [Infinity, 2, i] }))
    .sort((a, b) => (a.k[0] === b.k[0] ? 0 : a.k[0] - b.k[0]) || a.k[1] - b.k[1] || a.k[2] - b.k[2])
    .map((x) => x.f);
}
