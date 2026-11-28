import { WERERAT, rollWererat } from './wererat.js';
import { chooseRandomEnemy, resolveEncounterTableIndex, playerReading } from './encounters.js';
import { encounterTable } from './encounterTableDoor.js';
import { factionOf, SOLITARY_TYPES, NIGHT_ONLY_FACTIONS } from './mobileFactions.js';
import { CLASSIC_MINUTES_PER_SECOND } from '../world/worldTick.js';

const MAX_SEED_ATTEMPTS = 4;

export const MIN_CAMP_SPAWN_DISTANCE = 100;
export const MAX_CAMP_SPAWN_DISTANCE = 150;

/**
 * @param {{feet:number[], yawRad:number, fovDegrees:number, groundAt:(x:number,z:number)=>number, minDistance?:number, maxDistance?:number, rolls?:() => number}} o
 * @returns {{x:number,y:number,z:number}|null}
 */
export function campAnchorSpot({ feet, yawRad, fovDegrees, groundAt, minDistance = MIN_CAMP_SPAWN_DISTANCE, maxDistance = MAX_CAMP_SPAWN_DISTANCE, rolls = Math.random, bearingDegrees = null }) {
  if (!feet || typeof groundAt !== 'function') return null;
  let yawDegrees;
  if (Number.isFinite(bearingDegrees)) {
    yawDegrees = bearingDegrees + rolls() * 4 - 2;
  } else {
    const side = fovDegrees + rolls() * 4;
    yawDegrees = rolls() > 0.5 ? -side : side;
  }
  const yaw = yawRad + yawDegrees * Math.PI / 180;
  const dist = minDistance + rolls() * (maxDistance - minDistance);
  const x = feet[0] + Math.sin(yaw) * dist;
  const z = feet[2] + Math.cos(yaw) * dist;
  const y = groundAt(x, z);
  if (!Number.isFinite(y)) return null;
  return { x, y, z };
}

export const CAMP_SIGHT_RADIUS = 60;

export const CAMP_SIZE = Object.freeze([3, 5]);
export const PACK_SIZE = Object.freeze([2, 4]);
export const CAMP_SPACING = 3;
export const PACK_SPACING = 6;
export const CAMP_ALERT_RADIUS = CAMP_SPACING * 3;
export const PACK_ALERT_RADIUS = PACK_SPACING * 2;

export const CAMP_WINDOW_REAL_MINUTES = 15;
export const CAMP_WINDOW_MINUTES = CAMP_WINDOW_REAL_MINUTES * 60 * CLASSIC_MINUTES_PER_SECOND;
export const campWindowOpen = (gameMinutes) => Math.floor(gameMinutes) % CAMP_WINDOW_MINUTES === 0;

export const CAMP_CHANCE = 0.05;
export const rollCampChance = (roll01 = Math.random()) => roll01 < CAMP_CHANCE;
export const rollCampKind = (roll01 = Math.random()) => (roll01 < 0.5 ? 'camp' : 'pack');

export const CAMP_CHANCE_ON_CHUNK_LOAD = 0.50;
export const rollCampChanceOnChunkLoad = (roll01 = Math.random()) => roll01 < CAMP_CHANCE_ON_CHUNK_LOAD;
export const CAMP_GROUPS_ON_CHUNK_LOAD = 3;

export const CAMP_GROUP_BEARINGS = Object.freeze([0, 90, 270]);
export function campGroupBearings(fovDegrees, n = CAMP_GROUPS_ON_CHUNK_LOAD) {
  void fovDegrees;
  if (n <= CAMP_GROUP_BEARINGS.length) return CAMP_GROUP_BEARINGS.slice(0, Math.max(1, n));
  return Array.from({ length: n }, (_, k) => (k * 360) / n);
}

export const GROUP_ROLL_RADIUS = 100;
export function amGroupRollOwner(myId, myFeet, peers, radius = GROUP_ROLL_RADIUS) {
  if (myId == null || !myFeet || !peers?.length) return true;
  const r2 = radius * radius;
  const me = String(myId);
  const near = (a, b) => { const dx = a[0] - b[0], dz = a[2] - b[2]; return dx * dx + dz * dz <= r2; };
  const all = [{ id: me, feet: myFeet }];
  for (const p of peers) if (p?.id != null && String(p.id) !== me && Array.isArray(p.feet)) all.push({ id: String(p.id), feet: p.feet });
  all.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const rollers = [];
  for (const p of all) {
    const taken = rollers.some((r) => near(r.feet, p.feet));
    if (p.id === me) return !taken;
    if (!taken) rollers.push(p);
  }
  return true;
}

export function rollGroupComposition(ctx, rolls) {
  const timeOfDay = ((Number.isFinite(ctx.skyMinutes) ? ctx.skyMinutes : ctx.gameMinutes) % 1440 + 1440) % 1440;
  const isDay = timeOfDay >= 360 && timeOfDay <= 1080;
  const tableIdx = resolveEncounterTableIndex({ ...ctx, isDay });
  const rollCtx = { ...ctx, isDay, table: tableIdx != null ? (ctx.table ?? encounterTable(tableIdx, { ...ctx, isDay }, rolls)) : null };

  const sized = Number.isInteger(ctx.size) && ctx.size >= 1;
  const lone = sized && ctx.size === 1;
  let seed = -1;
  for (let attempt = 0; attempt < MAX_SEED_ATTEMPTS; attempt++) {
    const m = chooseRandomEnemy(rollCtx, rolls);
    if (m === -1) return null;
    if (SOLITARY_TYPES.has(m) && !lone) continue;
    if (isDay && NIGHT_ONLY_FACTIONS.has(factionOf(m))) continue;
    seed = m;
    break;
  }
  if (seed === -1) return null;

  const kind = rollCampKind(rolls());
  const [lo, hi] = kind === 'camp' ? CAMP_SIZE : PACK_SIZE;
  const rolled = lo + Math.floor(rolls() * (hi - lo + 1));
  const size = sized ? ctx.size : rolled;
  const mobileTypes = [seed];

  const theme = factionOf(seed);
  const { table } = rollCtx;
  const pool = theme && table ? table.filter((id) => factionOf(id) === theme) : [];

  for (let i = 1; i < size; i++) {
    mobileTypes.push(pool.length ? pool[Math.floor(rolls() * pool.length)] : seed);
  }

  for (const [i, type] of mobileTypes.entries()) {
    if (rollWererat(type, rolls) === WERERAT) { mobileTypes[i] = WERERAT; break; }
  }
  return {
    kind, mobileTypes,
    spacing: kind === 'camp' ? CAMP_SPACING : PACK_SPACING,
    alertRadius: kind === 'camp' ? CAMP_ALERT_RADIUS : PACK_ALERT_RADIUS,
    minDistance: MIN_CAMP_SPAWN_DISTANCE, maxDistance: MAX_CAMP_SPAWN_DISTANCE,
  };
}

const campGateOk = (ctx) => !(ctx.inside || ctx.inLocationRect || ctx.preventEnemySpawns);

export function rollCampEncounter(ctx, rolls = Math.random) {
  ctx = playerReading(ctx);
  if (!campGateOk(ctx)) return null;
  if (!campWindowOpen(ctx.gameMinutes)) return null;
  return rollGroupComposition(ctx, rolls);
}

const chunkGps = (ctx) => ({ climateIndex: ctx.climateIndex });

export function rollCampEncounterOnChunkLoad(ctx, rolls = Math.random) {
  ctx = playerReading(ctx, chunkGps(ctx));
  if (!campGateOk(ctx)) return null;
  if (!rollCampChanceOnChunkLoad(rolls())) return null;
  return rollGroupComposition(ctx, rolls);
}

export function rollCampEncountersOnChunkLoad(ctx, rolls = Math.random, { groups = CAMP_GROUPS_ON_CHUNK_LOAD, fovDegrees = 60 } = {}) {
  ctx = playerReading(ctx, chunkGps(ctx));
  if (!campGateOk(ctx)) return null;
  if (!rollCampChanceOnChunkLoad(rolls())) return null;
  const bearings = campGroupBearings(fovDegrees, groups);
  const out = [];
  for (let g = 0; g < groups; g++) {
    const hit = rollGroupComposition(ctx, rolls);
    if (hit) out.push({ ...hit, bearingDegrees: bearings[g] });
  }
  return out.length ? out : null;
}
