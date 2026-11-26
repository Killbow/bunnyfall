// Builds one building interior from DaggerfallInterior AddModels, AddFlats, and AddActionDoors. Prop models (type
// 3) keep +Y and sit on their lowest vertex. Floor models (type 5) negate Y and also sit on their lowest vertex,
// unlike DFU. Action doors use models 9000-9004 because the identical 900x-980x door models have different origins.

import { ROTATION_DIVISOR } from '../formats/blocksFile.js';
import { GLOBAL_SCALE, DOOR_TYPE } from './meshReader.js';
import { EDITOR_FLATS_ARCHIVE } from './rmbFlats.js';
import { getStaticDoors } from './staticDoors.js';
import { trs } from './mat4.js';
import { modelScaleVector } from './rmbLayout.js';

// Every placement carries `objectType` because the decor and furniture code selects props by this type.
export const PROP_MODEL_TYPE = 3;
// Classic data writes type 5 models at their story height, so they sit on their lowest vertex here. DFU centers
// them, which sinks the Castle Daggerfall tower rooms by half their height.
export const FLOOR_MODEL_TYPE = 5;
export const DOOR_MODEL_BASE_ID = 9000;
export const DOOR_MODEL_COUNT = 5;

const SYNTHESISED_DOOR_SIZE = Object.freeze({ x: 1.2, y: 2.4, z: 1.2 });

export const INTERIOR_MARKER = {
  REST: 4,
  ENTER: 8,
  TREASURE: 19,
  LADDER_BOTTOM: 21,
  LADDER_TOP: 22,
};

// Verbatim DFU IsBadInteriorModel table: block index to the building record indexes whose misplaced model 31000 is
// removed.
const BAD_MODEL_ID = 31000;
const BAD_INTERIOR_MODEL_RECORDS = new Map([
  [51, [1]],
  [84, [8, 9, 10, 11]],
  [88, [2, 3, 4]],
  [96, [2, 5, 6]],
  [106, [1]],
  [154, [0, 1, 2]],
  [155, [0, 1, 2, 3]],
  [156, [0, 1]],
  [158, [6, 7]],
  [159, [0]],
  [169, [5, 8]],
  [388, [2, 3, 4, 5]],
  [502, [2]],
  [513, [1, 2, 12]],
  [514, [0, 5, 6]],
  [516, [0]],
  [534, [10]],
  [537, [5]],
  [538, [12]],
  [574, [10, 12]],
  [575, [12, 13]],
  [597, [7, 8]],
  [601, [6, 7]],
  [680, [7, 8]],
  [697, [0, 1, 2, 3]],
  [1195, [1]],
  [1278, [1, 2, 3, 4]],
]);

const BAD_MODEL_SPOT = Object.freeze({ xPos: 192, yPos: -192, zPos: 64 });

/**
 * Unlike DFU, this removes only the 31000 at the misplaced spot, so a town pack that rebuilds a listed room keeps
 * its own 31000.
 * @param {number} blockIndex
 * @param {number} recordIndex
 * @param {{ modelIdNum: number, xPos: number, yPos: number, zPos: number }} obj
 */
export function isBadInteriorModel(blockIndex, recordIndex, obj) {
  if (obj.modelIdNum !== BAD_MODEL_ID) return false;
  if (obj.xPos !== BAD_MODEL_SPOT.xPos || obj.yPos !== BAD_MODEL_SPOT.yPos || obj.zPos !== BAD_MODEL_SPOT.zPos) return false;
  const records = BAD_INTERIOR_MODEL_RECORDS.get(blockIndex);
  return records !== undefined && records.includes(recordIndex);
}

function lowestY(model) {
  const verts = model.positions;
  let bottomY = verts[1];
  for (let i = 4; i < verts.length; i += 3) {
    if (verts[i] < bottomY) bottomY = verts[i];
  }
  return bottomY;
}

// A subrecord with no interior header returns true because it is not known to be empty. Building summaries use the
// same check for `hasInterior`.
export const hasInteriorModels = (sub) => sub?.interior?.header?.num3dObjectRecords !== 0;

/**
 * @param {object} dfBlock
 * @param {number} blockIndex
 * @param {number} recordIndex
 * @param {(modelIdNum:number) => object} getModel
 * @returns {{placements:Array<{modelIdNum:number,objectType:number,matrix:Float32Array}>, actionDoors:Array<{modelIdNum:number,matrix:Float32Array,openRotation:number}>, flats:Array<{archive:number,record:number,x:number,y:number,z:number}>, markers:Array<{type:number,x:number,y:number,z:number}>, doors:Array<object>}}
 */
export function layoutInterior(dfBlock, blockIndex, recordIndex, getModel) {
  const recordData = dfBlock.rmbBlock.subRecords[recordIndex];
  if (!hasInteriorModels(recordData)) {
    throw new Error(`No interior 3D models found for record index ${recordIndex}`);
  }

  const placements = [];
  const doors = [];

  for (const obj of recordData.interior.block3dObjectRecords) {
    if (isBadInteriorModel(blockIndex, recordIndex, obj)) continue;

    const model = getModel(obj.modelIdNum);
    if (!model) {
      console.warn(`[interior] model ${obj.modelIdNum} is not in this ARCH3D - the placement is skipped`);
      continue;
    }

    let px, py, pz;
    if (obj.objectType === PROP_MODEL_TYPE) {
      px = obj.xPos * GLOBAL_SCALE;
      py = obj.yPos * GLOBAL_SCALE + -lowestY(model);
      pz = obj.zPos * GLOBAL_SCALE;
    } else if (obj.objectType === FLOOR_MODEL_TYPE) {
      px = obj.xPos * GLOBAL_SCALE;
      py = -obj.yPos * GLOBAL_SCALE + -lowestY(model);
      pz = obj.zPos * GLOBAL_SCALE;
    } else {
      px = obj.xPos * GLOBAL_SCALE;
      py = -obj.yPos * GLOBAL_SCALE;
      pz = obj.zPos * GLOBAL_SCALE;
    }

    const matrix = trs(
      px, py, pz,
      -obj.xRotation / ROTATION_DIVISOR,
      -obj.yRotation / ROTATION_DIVISOR,
      -obj.zRotation / ROTATION_DIVISOR,
      ...modelScaleVector(obj),
    );

    placements.push({ modelIdNum: obj.modelIdNum, objectType: obj.objectType, matrix });

    const staticDoors = getStaticDoors(model, blockIndex, recordIndex, matrix);
    if (staticDoors) doors.push(...staticDoors);
  }

  const flats = [];
  const markers = [];
  for (const obj of recordData.interior.blockFlatObjectRecords) {
    const x = obj.xPos * GLOBAL_SCALE;
    const y = -obj.yPos * GLOBAL_SCALE;
    const z = obj.zPos * GLOBAL_SCALE;
    if (obj.textureArchive === EDITOR_FLATS_ARCHIVE) {
      markers.push({ type: obj.textureRecord, x, y, z });
      continue;
    }
    flats.push({ archive: obj.textureArchive, record: obj.textureRecord, x, y, z, ...(obj.hang === true ? { hang: true } : {}) });
  }

  const actionDoors = [];
  for (const obj of recordData.interior.blockDoorRecords) {
    const matrix = trs(
      obj.xPos * GLOBAL_SCALE,
      -obj.yPos * GLOBAL_SCALE,
      obj.zPos * GLOBAL_SCALE,
      0,
      -obj.yRotation / ROTATION_DIVISOR,
      0,
    );
    actionDoors.push({
      modelIdNum: DOOR_MODEL_BASE_ID + (obj.doorModelIndex % DOOR_MODEL_COUNT),
      matrix,
      openRotation: obj.openRotation,
    });
  }

  const spawnPoints = [];
  for (const obj of recordData.interior.blockSection3Records ?? []) {
    spawnPoints.push([obj.xPos * GLOBAL_SCALE, -obj.yPos * GLOBAL_SCALE, obj.zPos * GLOBAL_SCALE]);
  }

  // An interior's only exit is a static door baked into a placed model. When none exists, as in the vendored mill
  // interior, a door is synthesized at the enter or rest marker.
  if (doors.length === 0) {
    const enter = markers.find((m) => m.type === INTERIOR_MARKER.ENTER)
      ?? markers.find((m) => m.type === INTERIOR_MARKER.REST);
    if (enter) doors.push(exitDoorAt(enter, blockIndex, recordIndex));
  }

  return { placements, actionDoors, flats, markers, doors, spawnPoints };
}

// The identity matrix is correct because the marker is already in interior space. The normal is +Z because
// `interiorLanding` steps along it, and a zero normal lands the player inside the door box.
function exitDoorAt(marker, blockIndex, recordIndex) {
  return {
    matrix: trs(0, 0, 0, 0, 0, 0),
    doorType: DOOR_TYPE.BUILDING,
    blockIndex,
    recordIndex,
    doorIndex: 0,
    synthesised: true,
    centre: { x: marker.x, y: marker.y, z: marker.z },
    normal: { x: 0, y: 0, z: 1 },
    size: { x: SYNTHESISED_DOOR_SIZE.x, y: SYNTHESISED_DOOR_SIZE.y, z: SYNTHESISED_DOOR_SIZE.z },
  };
}
