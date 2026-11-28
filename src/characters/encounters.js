// Random encounters: PlayerEntity.IntermittentEnemySpawn and the RollRandomSpawn arms over the baked tables,
// where tables 0-18 are by dungeon type, 19 underwater, 20-37 by climate, and 39-44 by building type.

import { rollWererat } from './wererat.js';
import { mobileTeamOf } from './enemyTargets.js';
import { wouldBeSpawnedInClassic } from './enemyMotor.js';
import { CLIMATES } from '../formats/mapsFile.js';
import { ENCOUNTER_TABLES } from './encounterTables.js';
import { encounterTable } from './encounterTableDoor.js';
import { readPlayerGps } from '../world/playerGps.js';
import { dice100 } from '../combat/formulas.js';

export { ENCOUNTER_TABLES };

export const CLIMATE_TABLE = new Map([
  [CLIMATES.Desert, [20, 21, 22]], [CLIMATES.Desert2, [20, 21, 22]],
  [CLIMATES.Mountain, [23, 24, 25]],
  [CLIMATES.Rainforest, [26, 27, 28]],
  [CLIMATES.Subtropical, [29, 30, 31]],
  [CLIMATES.Swamp, [32, 33, 34]], [CLIMATES.MountainWoods, [32, 33, 34]], [CLIMATES.Woodlands, [32, 33, 34]],
  [CLIMATES.HauntedWoodlands, [35, 36, 37]],
]);
const BUILDING_TABLE = new Map([[11, 40], [14, 41], [16, 42], [17, 42], [18, 43], [19, 44]]);

export const MIN_DUNGEON_SPAWN_DISTANCE = 8;
export const MIN_LOCATION_SPAWN_DISTANCE = 10;
export const MIN_WILDERNESS_SPAWN_DISTANCE = 10;

export const SPAWNER_ARMS = Object.freeze({
  locationNight: Object.freeze({ minDistance: MIN_LOCATION_SPAWN_DISTANCE, maxDistance: 20, lineOfSightCheck: true }),
  wilderness: Object.freeze({ minDistance: MIN_WILDERNESS_SPAWN_DISTANCE, maxDistance: 20, lineOfSightCheck: true }),
  dungeonRest: Object.freeze({ minDistance: MIN_DUNGEON_SPAWN_DISTANCE, maxDistance: 20, lineOfSightCheck: false }),
  cityGuards: Object.freeze({ minDistance: 12.8, maxDistance: 51.2, lineOfSightCheck: true }),
});

export const timeForSpawn = (gameMinutes) => (Math.trunc(gameMinutes / 12) % 12) === 0;

export const rollLocationNight = (roll01 = Math.random()) => Math.floor(roll01 * 24);
export const rollWildernessDay = (roll01 = Math.random()) => Math.floor(roll01 * 36);
export const rollWildernessNight = (roll01 = Math.random()) => Math.floor(roll01 * 24);
// The dungeon roll runs only under an active enemy alert.
export const rollDungeon = (enemyAlertActive, roll01 = Math.random()) =>
  enemyAlertActive ? Math.floor(roll01 * 36) : 1;

export function resolveEncounterTableIndex(ctx) {
  if (ctx.underwater) return 19;
  if (ctx.dungeonType != null) return ctx.dungeonType;
  if (ctx.buildingType != null) return BUILDING_TABLE.get(ctx.buildingType) ?? 39;
  const band = CLIMATE_TABLE.get(ctx.climateIndex);
  if (!band) return null;
  if (ctx.inLocationRect) {
    if (ctx.isDay) return null;
    return band[0];
  }
  return ctx.isDay ? band[1] : band[2];
}

export function chooseRandomEnemy(ctx, rolls = Math.random) {
  const idx = resolveEncounterTableIndex(ctx);
  if (idx == null) return -1;
  const table = ctx.table ?? encounterTable(idx, ctx, rolls);

  const roll = Math.floor(rolls() * 100) + 1;
  const level = ctx.playerLevel ?? 1;
  let min, max;
  if (roll > 80) {
    if (roll > 95) {
      if (level <= 5) { min = 0; max = level + 2; }
      else { min = 0; max = level + 1; }
    } else { min = 0; max = level + 1; }
  } else { min = level - 3; max = level + 3; }
  if (min < 0) { min = 0; max = 5; }
  if (max > 19) { min = 14; max = 19; }

  if (!table) return -1;
  if (max + 1 > table.length) {
    max = table.length - 1;
    min = max >= 5 ? max - 5 : Math.floor(rolls() * max);
  }
  return table[min + Math.floor(rolls() * (max + 1 - min))];
}

// A night carried for a party member runs inside quietNights and rolls no ambush, so only the rester rolls.

let _quiet = 0;
export function quietNights(fn) {
  _quiet++;
  try { return fn(); } finally { _quiet--; }
}

export function playerReading(ctx, gps = ctx) {
  if (!ctx.inside) readPlayerGps(gps);
  return { ...ctx, local: true };
}

export function intermittentEnemySpawn(ctx, rolls = Math.random) {
  ctx = playerReading(ctx);
  if (_quiet > 0) return null;
  // A rough rest asks the same decision twice and takes the first spawn; the host hands the count, and a non-finite
  // count asks once.
  const asks = Number.isFinite(ctx.restAsks) ? Math.max(1, Math.trunc(ctx.restAsks)) : 1;
  let r = null;
  for (let i = 0; i < asks && !r; i++) r = intermittentEnemySpawnOnce(ctx, rolls);
  return r;
}
function intermittentEnemySpawnOnce(ctx, rolls) {
  if (!timeForSpawn(ctx.gameMinutes) || ctx.preventEnemySpawns) return null;
  const timeOfDay = ((Number.isFinite(ctx.skyMinutes) ? ctx.skyMinutes : ctx.gameMinutes) % 1440 + 1440) % 1440;
  if (!ctx.inside) {
    if (ctx.inLocationRect) {
      if ((timeOfDay < 360 || timeOfDay > 1080) && rollLocationNight(rolls()) === 0) {
        const mobileType = chooseRandomEnemy({ ...ctx, isDay: false }, rolls);
        if (mobileType !== -1) return { mobileType: rollWererat(mobileType, rolls), ...SPAWNER_ARMS.locationNight };
      }
      return null;
    }
    const day = timeOfDay >= 360 && timeOfDay <= 1080;
    if (day ? rollWildernessDay(rolls()) !== 0 : rollWildernessNight(rolls()) !== 0) return null;
    const mobileType = chooseRandomEnemy({ ...ctx, isDay: day }, rolls);
    return mobileType === -1 ? null : { mobileType: rollWererat(mobileType, rolls), ...SPAWNER_ARMS.wilderness };
  }
  if (ctx.inDungeon && ctx.isResting) {
    if (rollDungeon(ctx.enemyAlertActive, rolls()) === 0) {
      const mobileType = chooseRandomEnemy(ctx, rolls);
      if (mobileType !== -1) return { mobileType: rollWererat(mobileType, rolls), ...SPAWNER_ARMS.dungeonRest };
    }
  }
  return null;
}

export const PASSIVE_GUARD_LEGAL_REP = -10;
export const PASSIVE_GUARD_LOW_REP_CHANCE = 5;
export const PASSIVE_GUARD_BANISHED_CHANCE = 10;
export const SEVERE_PUNISHMENT_BANISHED = 1;
export const SEVERE_PUNISHMENT_EXECUTED = 2;

export function passiveGuardSpawns({ legalRep = 0, severePunishmentFlags = 0 } = {}, rolls = Math.random) {
  let spawns = 0;
  if (legalRep < PASSIVE_GUARD_LEGAL_REP && dice100(PASSIVE_GUARD_LOW_REP_CHANCE, rolls())) spawns++;
  if ((severePunishmentFlags & SEVERE_PUNISHMENT_BANISHED) !== 0
    && dice100(PASSIVE_GUARD_BANISHED_CHANCE, rolls())) spawns++;
  return spawns;
}

export const ALERT_DECAY_MINUTES = 8 * 60;
export function setEnemyAlert(entity, alert, gameMinutes = 0) {
  entity.enemyAlertActive = !!alert;
  if (alert) entity.lastEnemyAlertTime = gameMinutes;
}
export function decayEnemyAlert(entity, gameMinutes) {
  if (entity.enemyAlertActive && (gameMinutes - (entity.lastEnemyAlertTime ?? 0)) > ALERT_DECAY_MINUTES) {
    setEnemyAlert(entity, false);
  }
}

export const RESTING_DISTANCE = 12;

export function areEnemiesNearby(foes, { resting = false, includingPacified = false } = {}) {
  for (const f of foes ?? []) {
    if (!f || f.dead || !f.ai) continue;
    // An enemy in the water while the player is aboard a boat cannot reach them, so it is not nearby.
    if (f.ai.unreachable) continue;
    // Only enemies near the local player count: the motor latches targetIsLocalPlayer and _distLocal, so an enemy
    // fighting another party member does not block this player's rest.
    const canSee = !!(f.ai.detected && f.ai.inSight && f.ai.targetIsLocalPlayer !== false);
    if (resting && !canSee && (f.ai._distLocal ?? f.ai._dist ?? Infinity) > RESTING_DISTANCE) continue;
    if (!(canSee || f.ai.wouldBeSpawned)) continue;
    if (includingPacified) return true;
    if (foeHostile(f)) return true;
  }
  return false;
}

/**
 * @param {any[]} foes
 * @param {number[] | null} feet
 */
export function fightNear(foes, feet) {
  if (areEnemiesNearby(foes)) return true;
  if (!feet) return false;
  for (const f of foes ?? []) {
    if (!foeHostile(f) || f.ai.unreachable || !f.ai.feet) continue;
    const dx = f.ai.feet[0] - feet[0], dy = f.ai.feet[1] - feet[1], dz = f.ai.feet[2] - feet[2];
    if (wouldBeSpawnedInClassic(Math.hypot(dx, dy, dz), dy, false, 0, false)) return true;
  }
  return false;
}

export function foeHostile(f) {
  return !!f && !f.dead && !!f.ai && (f.ai.isHostile ?? true) && mobileTeamOf(f.entity) !== 'PlayerAlly';
}

export function foeAlerted(f) {
  return foeHostile(f) && f.ai.targetIsLocalPlayer === true && (!!f.ai.detected || (f.ai.giveUpTimer ?? 0) > 0);
}
