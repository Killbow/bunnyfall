// Departs from DFU, which places every misc model untied to any building. Here a shop sign belongs to the building
// with the nearest door within `SIGN_REACH_M`, and a house sign is left out. Doors are used, not building boxes,
// because a sign hangs into the street where a neighbor box can hold it.

import { BUILDING_TYPES, isResidence } from './buildingNames.js';
import { DOOR_TYPE } from './meshReader.js';

export const SHOP_SIGN_FIRST_MODEL = 43700;
export const SHOP_SIGN_LAST_MODEL = 43799;

// Over BLOCKS.BSA, signs at a house door hang 6.02 m from it or nearer, and the next sign nearest a house door is
// 14.79 m away.
export const SIGN_REACH_M = 8;

/** @param {number} modelIdNum */
export const isShopSignModel = (modelIdNum) => modelIdNum >= SHOP_SIGN_FIRST_MODEL && modelIdNum <= SHOP_SIGN_LAST_MODEL;

/** @param {number} buildingType */
export const isHouseType = (buildingType) => buildingType === BUILDING_TYPES.HouseForSale || isResidence(buildingType);

/**
 * @typedef {{ x: number, y: number, z: number }} Vec3
 * @typedef {{ type: number, vert0: Vec3, vert2: Vec3 }} ModelDoor
 * @typedef {{ modelIdNum: number, matrix: ArrayLike<number>, recordIndex?: number }} PlacedModel
 * @typedef {{ dfBlock: { rmbBlock: { fldHeader: { buildingDataList: Array<{ buildingType: number }> } } }, layout: { models: PlacedModel[] } }} LaidOutBlock
 */

/**
 * @param {PlacedModel} sign
 * @param {LaidOutBlock} block
 * @param {(modelIdNum: number) => ModelDoor[] | null | undefined} doorsOf
 * @returns {number}
 */
export function signedBuildingOf(sign, block, doorsOf) {
  const signX = sign.matrix[12];
  const signZ = sign.matrix[14];
  let nearestRecord = -1;
  let nearestDistance = SIGN_REACH_M;
  for (const building of block.layout.models) {
    if (building.recordIndex == null) continue;
    const m = building.matrix;
    for (const door of doorsOf(building.modelIdNum) ?? []) {
      if (door.type !== DOOR_TYPE.BUILDING) continue;
      const cx = (door.vert0.x + door.vert2.x) / 2;
      const cy = (door.vert0.y + door.vert2.y) / 2;
      const cz = (door.vert0.z + door.vert2.z) / 2;
      const doorX = m[0] * cx + m[4] * cy + m[8] * cz + m[12];
      const doorZ = m[2] * cx + m[6] * cy + m[10] * cz + m[14];
      const distance = Math.hypot(doorX - signX, doorZ - signZ);
      if (distance > nearestDistance) continue;
      nearestDistance = distance;
      nearestRecord = building.recordIndex;
    }
  }
  return nearestRecord;
}

/**
 * Relies on `layoutRmbBlock` order, buildings before signs, so building models are loaded by the time a sign is
 * asked.
 * @param {PlacedModel} placed
 * @param {LaidOutBlock} block
 * @param {(modelIdNum: number) => ModelDoor[] | null | undefined} doorsOf
 * @returns {boolean}
 */
export function isHouseSign(placed, block, doorsOf) {
  if (placed.recordIndex != null) return false;
  if (!isShopSignModel(placed.modelIdNum)) return false;
  const record = signedBuildingOf(placed, block, doorsOf);
  if (record < 0) return false;
  const buildingType = block.dfBlock.rmbBlock.fldHeader.buildingDataList[record]?.buildingType;
  return isHouseType(buildingType);
}
