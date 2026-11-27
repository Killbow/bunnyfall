// The exterior surface model: what the player stands on outdoors, following PlayerMotor.cs.
import { playerTileMapIndex, WATER_TILE_INDEX, convertTile } from '../world/terrainSurface.js';
import { waterCorners, waterCoverage } from '../world/waterCorners.js';

export const ON_EXTERIOR_WATER = Object.freeze({
  None: 'None',
  Swimming: 'Swimming',
  WaterWalking: 'WaterWalking',
});

export const WALKING_RAY_DISTANCE = 1.0;
export const RIDING_RAY_DISTANCE = 2.0;

export const rayDistanceFor = (onFoot) => (onFoot ? WALKING_RAY_DISTANCE : RIDING_RAY_DISTANCE);

export function onShallowWaterTile(tileIndex) {
  return tileIndex === 5
    || tileIndex === 6
    || tileIndex === 8
    || tileIndex === 20
    || tileIndex === 21
    || tileIndex === 23
    || tileIndex === 30
    || tileIndex === 31
    || (tileIndex >= 33 && tileIndex <= 36)
    || tileIndex === 49;
}

export function onPathTile(tileIndex) {
  return tileIndex === 46 || tileIndex === 47 || tileIndex === 55;
}

/**
 * @param {object} p
 * @param {number} p.centreY
 * @param {number} p.terrainY
 * @param {number} p.meshDist
 * @param {number} p.rayDistance
 * @returns {{hit: boolean, terrain: boolean, staticGeometry: boolean, dist: number}}
 */
export function downProbe({ centreY, terrainY, meshDist = Infinity, rayDistance = WALKING_RAY_DISTANCE }) {
  const maxDist = rayDistance * 2;
  const ty = (terrainY == null || !Number.isFinite(terrainY)) ? -Infinity : terrainY;
  const terrainDist = (ty <= centreY) ? centreY - ty : Infinity;
  const md = (meshDist == null || !(meshDist >= 0)) ? Infinity : meshDist;
  const dist = Math.min(terrainDist, md);
  if (!(dist <= maxDist)) return { hit: false, terrain: false, staticGeometry: false, dist: Infinity };
  const terrain = terrainDist < md;
  return { hit: true, terrain, staticGeometry: !terrain, dist };
}

export function onExteriorGroundMethod({ inside = false, probe = null } = {}) {
  if (inside || !probe?.hit) return false;
  return !!probe.terrain;
}

export function onExteriorStaticGeometryMethod({ inside = false, probe = null } = {}) {
  if (inside || !probe?.hit) return false;
  return !!probe.staticGeometry;
}

/**
 * @param {object} p
 * @param {boolean} p.onGround
 * @param {number} p.tileIndex
 * @param {boolean} p.waterWalking
 */
export function exteriorWaterMethod({ onGround = false, tileIndex = -1, waterWalking = false, coverage = null } = {}) {
  if (onGround && coverage != null && coverage >= SWIM_COVERAGE) {
    return waterWalking ? ON_EXTERIOR_WATER.WaterWalking : ON_EXTERIOR_WATER.Swimming;
  }
  const shallow = onShallowWaterTile(tileIndex);
  if (!onGround || (tileIndex !== WATER_TILE_INDEX && !shallow)) return ON_EXTERIOR_WATER.None;
  if (waterWalking || shallow) return ON_EXTERIOR_WATER.WaterWalking;
  return ON_EXTERIOR_WATER.Swimming;
}
export const SWIM_COVERAGE = 0.5;
export function feetWaterCoverage(rawTile, feet) {
  if (rawTile == null || !feet) return null;
  return waterCoverage(waterCorners(convertTile(rawTile)), feet[0], feet[1]);
}

export function exteriorPathMethod({ onGround = false, tileIndex = -1 } = {}) {
  return onGround && onPathTile(tileIndex);
}

/** @returns {{water: string, path: boolean, staticGeometry: boolean, onGround: boolean, tileIndex: number}} */
export function exteriorSurfaces({
  inside = false, rawTile = null, tileIndex = null,
  waterWalking = false, probe = null, feet = null,
} = {}) {
  const idx = tileIndex == null ? playerTileMapIndex(rawTile) : tileIndex;
  const onGround = onExteriorGroundMethod({ inside, probe });
  return {
    water: exteriorWaterMethod({ onGround, tileIndex: idx, waterWalking, coverage: feetWaterCoverage(rawTile, feet) }),
    path: exteriorPathMethod({ onGround, tileIndex: idx }),
    staticGeometry: onExteriorStaticGeometryMethod({ inside, probe }),
    onGround,
    tileIndex: idx,
  };
}

/** @returns {{swimming: boolean, submerged: false, motorSwimming: false}} */
export function exteriorSwimLatch(wasSwimming, tileIndex) {
  return {
    swimming: tileIndex === WATER_TILE_INDEX ? !!wasSwimming : false,
    submerged: false,
    motorSwimming: false,
  };
}

export function exteriorSwimming({ wasSwimming = false, sunk = false, unsunk = false, tileIndex = -1 } = {}) {
  if (sunk) return true;
  if (unsunk) return false;
  return exteriorSwimLatch(wasSwimming, tileIndex).swimming;
}
