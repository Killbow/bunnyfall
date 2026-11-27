// Constants and steps follow DeepBathymetry.cs from Iliac Puddle No More. `perlinNoise` replaces Unity's
// Mathf.PerlinNoise, so the sea floor has the same shape as the mod's but different hills.

import { perlinNoise } from './perlin.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * clamp01(t);

export const SHELF_MIN_DEPTH = 2.7;
export const SHELF_BREAK_DISTANCE = 360;
export const SHELF_RAMP_METERS = 2700;
export const MAX_ABSOLUTE_DEPTH = 250;

// Climate indices: 223 Ocean, 224 Desert, 225 hot Desert, 226 Mountain, 227 Rainforest, 228 Swamp, 229 Subtropical,
// 230 Mountain woods, 231 Woodlands, and 232 Haunted woodlands.
export function climateBaseDepth(climateIndex) {
  switch (climateIndex) {
    case 223: return 210;
    case 229: return 175;
    case 227: return 150;
    case 228: return 28;
    case 231: return 165;
    case 232: return 165;
    case 230: return 185;
    case 226: return 185;
    case 224: return 90;
    case 225: return 90;
    default: return 210;
  }
}

export function climateBandSignal(climateIndex) {
  switch (climateIndex) {
    case 223: return 1;
    case 229: return 0.7;
    case 227: return 0.55;
    case 228: return 0.15;
    case 231: return 0.6;
    case 232: return 0.45;
    case 230: return 0.65;
    case 226: return 0.65;
    case 224: return 0.3;
    case 225: return 0.3;
    default: return 0.8;
  }
}

export const depthBand01 = (depthMeters) => clamp01(depthMeters / MAX_ABSOLUTE_DEPTH);

export function resolveUserMaxDepth(waterDepth) {
  if (waterDepth == null) return MAX_ABSOLUTE_DEPTH;
  return clamp(waterDepth, 1, MAX_ABSOLUTE_DEPTH);
}

/**
 * @param {number} worldX
 * @param {number} worldZ
 * @param {number} baseDepth
 * @param {number} distanceToCoastMeters
 * @param {?number} waterDepth
 */
export function sampleDepthMeters(worldX, worldZ, baseDepth, distanceToCoastMeters, waterDepth) {
  const num = resolveUserMaxDepth(waterDepth);
  const num2 = computeMinimumNavigableDepth(distanceToCoastMeters, num);
  const num3 = num / 200;
  const num4 = computeDeepOcean01(distanceToCoastMeters);
  const climateBase = applyDeepPlainHeadroom(baseDepth, num, num2, num3, num4);
  const num5 = computeShelfDepth(climateBase, distanceToCoastMeters);
  const num6 = computeNearShoreRelief01(distanceToCoastMeters);
  const num7 = sampleSignedPerlin(worldX, worldZ, 4200, 1000, -7000);
  const num8 = lerp(1, 0.55, num4);
  const num9 = num5 + num7 * 0.3 * num8 * num5;
  const num10 = sampleSignedPerlin(worldX, worldZ, 330, -3300, 4400) * 24 * num6;
  const num11 = sampleSignedPerlin(worldX, worldZ, 80, 5500, -2200) * 6 * num6;
  const num12 = computeAbyssalRelief(worldX, worldZ, num4);
  const num13 = computeRavineAddition(worldX, worldZ, distanceToCoastMeters);
  const num14 = num9 + num10 + num11 + num12 + num13;
  const minimumRawDepth = num2 / Math.max(0.0001, num3);
  const num15 = computeSeamountLift(worldX, worldZ, distanceToCoastMeters, computePeakLiftCapacity(num14, minimumRawDepth, 0.82));
  const num16 = computeVolcanicConeLift(worldX, worldZ, distanceToCoastMeters, computePeakLiftCapacity(num14, minimumRawDepth, 0.88));
  const num17 = (num14 - num15 - num16) * num3;
  const num18 = computeSafetyFloorRelief(worldX, worldZ, distanceToCoastMeters, num);
  return clamp(Math.max(num17, num2 + num18), num2, num);
}

function computeMinimumNavigableDepth(distanceToCoastMeters, userMaxDepth) {
  const num = Math.min(SHELF_MIN_DEPTH, userMaxDepth * 0.4);
  const num2 = Math.min(11.2, userMaxDepth);
  if (num2 <= num) return num;
  const num3 = clamp01(distanceToCoastMeters / 128);
  const num4 = num3 * num3 * (3 - 2 * num3);
  return lerp(num, num2, num4);
}

function computeNearShoreRelief01(distanceToCoastMeters) {
  const num = clamp01(distanceToCoastMeters / 180);
  return num * num * (3 - 2 * num);
}

function computeSafetyFloorRelief(worldX, worldZ, distanceToCoastMeters, userMaxDepth) {
  const num = clamp01(distanceToCoastMeters / 128);
  if (num <= 0) return 0;
  const num2 = num * num * (3 - 2 * num);
  const num3 = Math.min(8, userMaxDepth * 0.12) * num2;
  const num4 = sampleSignedPerlin(worldX, worldZ, 150, -1700, 3100) * 0.5 + 0.5;
  return num3 * num4;
}

function computeDeepOcean01(distanceToCoastMeters) {
  let num = (distanceToCoastMeters - SHELF_BREAK_DISTANCE) / Math.max(1, 2340);
  num = clamp01(num);
  return num * num * (3 - 2 * num);
}

function applyDeepPlainHeadroom(climateBase, userMaxDepth, minimumDepth, scale, deepOcean) {
  if (scale <= 0 || deepOcean <= 0) return climateBase;
  const num = Math.min(42, userMaxDepth * 0.28) * deepOcean;
  const num2 = Math.max(minimumDepth, userMaxDepth - num);
  return Math.min(climateBase, num2 / scale);
}

function computeAbyssalRelief(worldX, worldZ, deepOcean) {
  if (deepOcean <= 0) return 0;
  const num = sampleSignedPerlin(worldX, worldZ, 680, -6100, 2700) * 12;
  const num2 = sampleSignedPerlin(worldX, worldZ, 115, 4200, -5100) * 5.5;
  return (num + num2) * deepOcean;
}

function computePeakLiftCapacity(featureBaseDepth, minimumRawDepth, depthFraction) {
  return Math.max(0, featureBaseDepth - minimumRawDepth) * clamp01(depthFraction);
}

function computeShelfDepth(climateBase, distanceToCoastMeters) {
  if (distanceToCoastMeters <= 0) return SHELF_MIN_DEPTH;
  if (distanceToCoastMeters >= SHELF_RAMP_METERS) return climateBase;
  const num = distanceToCoastMeters / SHELF_RAMP_METERS;
  const num2 = num * num * (3 - 2 * num);
  const num3 = 0.3 * num + 0.7 * num2;
  return lerp(SHELF_MIN_DEPTH, climateBase, num3);
}

function computeRavineAddition(worldX, worldZ, distanceToCoastMeters) {
  if (distanceToCoastMeters < 1500) return 0;
  const num = samplePerlin01(worldX, worldZ, 1300, 9000, 9000);
  if (num < 0.66) return 0;
  const num2 = (num - 0.66) / 0.33999997;
  return num2 * num2 * (3 - 2 * num2) * 110;
}

function computeSeamountProfile(worldX, worldZ, distanceToCoastMeters) {
  if (distanceToCoastMeters < 1500) return 0;
  const num = samplePerlin01(worldX, worldZ, 2500, -8400, 6700);
  if (num < 0.62) return 0;
  const num2 = (num - 0.62) / 0.38;
  return clamp01(num2 * num2 * (3 - 2 * num2));
}

function computeSeamountLift(worldX, worldZ, distanceToCoastMeters, maxLiftMeters) {
  return computeSeamountProfile(worldX, worldZ, distanceToCoastMeters) * Math.max(0, maxLiftMeters);
}

function computeVolcanicConeProfile(worldX, worldZ, distanceToCoastMeters) {
  if (distanceToCoastMeters < 1800) return 0;
  const num = samplePerlin01(worldX, worldZ, 1800, 1800, -9600);
  if (num < 0.7) return 0;
  const num2 = (num - 0.7) / 0.3;
  return clamp01(num2 * Math.sqrt(clamp01(num2)));
}

function computeVolcanicConeLift(worldX, worldZ, distanceToCoastMeters, maxLiftMeters) {
  return computeVolcanicConeProfile(worldX, worldZ, distanceToCoastMeters) * Math.max(0, maxLiftMeters);
}

function samplePerlin01(worldX, worldZ, periodMeters, seedX, seedZ) {
  const num = 1 / Math.max(0.0001, periodMeters);
  return perlinNoise((worldX + seedX) * num, (worldZ + seedZ) * num);
}

function sampleSignedPerlin(worldX, worldZ, periodMeters, seedX, seedZ) {
  return samplePerlin01(worldX, worldZ, periodMeters, seedX, seedZ) * 2 - 1;
}
