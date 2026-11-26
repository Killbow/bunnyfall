// @ts-check

import { DEPTH_EDGE_SOFTNESS } from './passiveFish.js';
import { rangeInt, rangeFloat } from '../items/unleveledLoot.js';
import { roundToInt } from './mathf.js';
import { MOBILE_TYPES as MOBILE } from '../characters/mobileTypes.js';

const f32 = Math.fround;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const DEPTH_AQUATIC_TABLE = Object.freeze([
  [MOBILE.Slaughterfish, 60, 0, 0.7], [MOBILE.Lamia, 18, 0, 0.45], [MOBILE.Nymph, 10, 0, 0.55], [MOBILE.Dreugh, 25, 0.15, 1],
  [MOBILE.Zombie, 6, 0.4, 1], [MOBILE.SkeletalWarrior, 7, 0.45, 1], [MOBILE.Ghost, 7, 0.5, 1], [MOBILE.Wraith, 5, 0.6, 1],
  [MOBILE.IceAtronach, 4, 0.7, 1], [MOBILE.Vampire, 3, 0.75, 1], [MOBILE.Lich, 2, 0.85, 1],
].map(([type, weight, lo, hi]) => Object.freeze({ type, weight, minDepthFraction: f32(lo), maxDepthFraction: f32(hi) })));

export const RARE_TYPES = Object.freeze([MOBILE.Ghost, MOBILE.SkeletalWarrior, MOBILE.Wraith, MOBILE.Zombie, MOBILE.IceAtronach, MOBILE.Vampire, MOBILE.Lich]);
export const BOSS_TYPES = Object.freeze([MOBILE.AncientLich, MOBILE.VampireAncient]);
export const TREASURE_GUARD_TEAM = 'Undead';

export const SPAWN_VIEWPORT_MARGIN = 0.08;
export const MINIMUM_COLUMN_DEPTH = 4;
export const ENEMY_SEAFLOOR_CLEARANCE = 2.5;
export const FLOOR_ENEMY_SEAFLOOR_CLEARANCE = 0.5;
export const ENEMY_SURFACE_CLEARANCE = 3;
export const DEEP_SWIMMER_FLOOR_BIAS_START = 0.55;
export const DEEP_SWIMMER_FLOOR_BAND_TOP = 0.35;
export const TREASURE_GUARD_DISTANCE = Object.freeze([8, 30]);
export const MAX_TREASURE_GUARD_COUNT = 5;
export const ENEMY_FREQUENCY_FOR_MAX_TREASURE_GUARDS = 0.6;
export const ENEMY_ATTEMPTS_PER_PIXEL = 96;
export const ENEMY_FREQUENCY_AT_MIDPOINT = 0.5;
export const MAX_PENDING_ENEMY_SPAWNS_PER_FRAME = 1;
export const BOSS_SPAWN_CHANCE = 0.01;
export const BOSS_MIN_DEPTH_FRACTION = 0.6;
export const TREASURE_GUARD_BOSS_CHANCE = 0.02;
export const DEFAULT_ENEMY_CAP = 8;

export function enemyRoster() {
  const out = [];
  for (const t of [...DEPTH_AQUATIC_TABLE.map((e) => e.type), ...RARE_TYPES, ...BOSS_TYPES]) if (!out.includes(t)) out.push(t);
  return out;
}

export function depthBandWeight(e, depthFraction) {
  if (depthFraction >= e.minDepthFraction && depthFraction <= e.maxDepthFraction) return f32(e.weight);
  const off = depthFraction < e.minDepthFraction ? f32(e.minDepthFraction - depthFraction) : f32(depthFraction - e.maxDepthFraction);
  return f32(e.weight * clamp01(f32(1 - f32(off / f32(DEPTH_EDGE_SOFTNESS)))));
}

export function pickAquaticForDepth(depthFraction, roll) {
  depthFraction = clamp01(f32(depthFraction));
  let total = 0;
  for (const e of DEPTH_AQUATIC_TABLE) total = f32(total + depthBandWeight(e, depthFraction));
  if (total <= 0) return MOBILE.Slaughterfish;
  let r = f32(roll() * total);
  for (const e of DEPTH_AQUATIC_TABLE) {
    const w = depthBandWeight(e, depthFraction);
    if (r < w) return e.type;
    r = f32(r - w);
  }
  return DEPTH_AQUATIC_TABLE[0].type;
}

export const pickBoss = (roll) => BOSS_TYPES[rangeInt(0, BOSS_TYPES.length, roll)];
export const pickRare = (roll) => RARE_TYPES[rangeInt(0, RARE_TYPES.length, roll)];

export function pickEnemyForDepth(depthFraction, roll) {
  if (depthFraction >= BOSS_MIN_DEPTH_FRACTION && roll() < BOSS_SPAWN_CHANCE) return pickBoss(roll);
  return pickAquaticForDepth(depthFraction, roll);
}

export const pickTreasureGuardType = (includeBoss, bossSpawned, roll) => (includeBoss && !bossSpawned ? pickBoss(roll) : pickRare(roll));

const FLOOR_TYPES = new Set([MOBILE.Zombie, MOBILE.SkeletalWarrior, MOBILE.IceAtronach, MOBILE.Nymph, MOBILE.Lich, MOBILE.AncientLich, MOBILE.Vampire, MOBILE.VampireAncient]);
export const mustSpawnOnFloor = (type) => FLOOR_TYPES.has(type);

/**
 * @param {import('./passiveFish.js').FishFrame} f
 */
export function resolveSpawnColumn(f, x, z, waterDepth) {
  const col = f.column(x, z);
  if (!col) return null;
  const floorY = f.renderedSeafloorY(col, x, z) + ENEMY_SEAFLOOR_CLEARANCE;
  const surfaceY = col.oceanY - ENEMY_SURFACE_CLEARANCE;
  if (surfaceY - floorY < MINIMUM_COLUMN_DEPTH) return null;
  return { floorY, surfaceY, column: col, depthFraction: clamp01(col.depth / Math.max(1, waterDepth)) };
}

export function pickEnemyPosition(x, z, floorY, surfaceY, type, depthFraction, roll) {
  if (mustSpawnOnFloor(type)) return [x, floorY - ENEMY_SEAFLOOR_CLEARANCE + FLOOR_ENEMY_SEAFLOOR_CLEARANCE, z];
  let t = roll();
  const bias = clamp01((depthFraction - DEEP_SWIMMER_FLOOR_BIAS_START) / 0.45);
  if (bias > 0) t = t + (rangeFloat(0, DEEP_SWIMMER_FLOOR_BAND_TOP, roll) - t) * bias;
  return [x, floorY + (surfaceY - floorY) * t, z];
}

export const alignFloorEnemyY = (y, controllerHeight) => y - FLOOR_ENEMY_SEAFLOOR_CLEARANCE + controllerHeight * 0.52;

export function scaledEnemyAttemptsPerPixel(frequency) {
  return Math.max(0, roundToInt(f32(ENEMY_ATTEMPTS_PER_PIXEL * f32(f32(frequency) / ENEMY_FREQUENCY_AT_MIDPOINT))));
}

export function rollCount(scaledCount, roll) {
  let n = Math.floor(Math.max(0, scaledCount));
  if (roll() < scaledCount - n) n++;
  return n;
}

export const rollTreasureGuardCount = (frequency, roll) =>
  Math.min(MAX_TREASURE_GUARD_COUNT, Math.max(0, rollCount(f32(MAX_TREASURE_GUARD_COUNT * clamp01(f32(frequency) / ENEMY_FREQUENCY_FOR_MAX_TREASURE_GUARDS)), roll)));

export const pickRingDistance = (min, max, roll) => {
  const a = f32(min * min), b = f32(max * max);
  return Math.sqrt(f32(a + f32(f32(b - a) * f32(roll()))));
};

/**
 * @param {number[]} p
 * @param {number[]} playerPos
 * @param {number[]} camForward
 */
export function isBehindPlayerHeading(p, playerPos, camForward) {
  const fx = camForward[0], fz = camForward[2];
  if (fx * fx + fz * fz < 0.001) return false;
  const dx = p[0] - playerPos[0], dz = p[2] - playerPos[2];
  if (dx * dx + dz * dz < 144) return false;
  return fx * dx + fz * dz < 0;
}

export const spawnRevealDistance = (vision, velocity) => vision + Math.hypot(velocity[0], velocity[2]) * 2;

/**
 * @param {number[]} p
 * @param {number[]} playerPos
 * @param {{forward: number[], viewport: (p: number[]) => number[], revealDistance: number}} view
 */
export function isOutsideImmediateView(p, playerPos, visibleDistance, margin, view) {
  if (!view) return true;
  if (isBehindPlayerHeading(p, playerPos, view.forward)) return false;
  const v = view.viewport(p);
  if (v[2] <= 0) return true;
  const dx = p[0] - playerPos[0], dz = p[2] - playerPos[2], flatSq = dx * dx + dz * dz;
  if (v[0] >= -margin && v[0] <= 1 + margin && v[1] >= -margin && v[1] <= 1 + margin) return flatSq > view.revealDistance * view.revealDistance;
  if (flatSq > visibleDistance * visibleDistance) return true;
  if (!(v[0] < -margin) && !(v[0] > 1 + margin) && !(v[1] < -margin)) return v[1] > 1 + margin;
  return true;
}
