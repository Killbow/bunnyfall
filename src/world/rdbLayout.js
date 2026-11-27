// RDB dungeon block assembly, 1:1 with Daggerfall Unity's RDBLayout.cs (MIT, Daggerfall Workshop).
// The model matrix is T * Rz * Rx * Ry, not the RMB order.

import { ROTATION_DIVISOR, RDB_RESOURCE_TYPES } from '../formats/blocksFile.js';
import { GLOBAL_SCALE } from './meshReader.js';
import { getStaticDoors } from './staticDoors.js';
import { trs, multiply } from './mat4.js';

export const RDB_SIDE = 2048 * GLOBAL_SCALE;

export const EXIT_DOOR_MODEL_ID = 70300;
const RED_BRICK_DOOR_MODEL_ID = 72100;
const MIN_TAPESTRY_ID = 42500;
const MAX_TAPESTRY_ID = 42571;
const EDITOR_FLATS_ARCHIVE = 199;
import { RANDOM_TREASURE_ARCHIVE as FIXED_TREASURE_FLATS_ARCHIVE } from '../items/loot.js';

import { isNpcFlat } from './npcFlatArchives.js';
import { editorPersonOf } from './editorPeople.js';
export { NPC_FLAT_ARCHIVES, isNpcFlat } from './npcFlatArchives.js';

export const ACTION_FLAGS = Object.freeze({
  None: 0x00, Translation: 0x01,
  PositiveX: 0x02, NegativeX: 0x03, PositiveY: 0x04, NegativeY: 0x05,
  PositiveZ: 0x06, NegativeZ: 0x07,
  Rotation: 0x08, CastSpell: 0x09, ShowText: 0x0b, ShowTextWithInput: 0x0c,
  Teleport: 0x0e, LockDoor: 0x10, UnlockDoor: 0x11, OpenDoor: 0x12,
  CloseDoor: 0x14, Hurt21: 0x15, Hurt22: 0x16, Hurt23: 0x17, Hurt24: 0x18,
  Hurt25: 0x19, Poison: 0x1a, Unknown27: 0x1b, DrainMagicka: 0x1c,
  Dialogue: 0x1d, Activate: 0x1e, SetGlobalVar: 0x1f, Unknown32: 0x20,
  Unknown50: 0x32, DoorText: 0x63,
  Unknown100: 0x64,
});

export const MOVE_ACTION_FLAGS = new Set([
  ACTION_FLAGS.Translation,
  ACTION_FLAGS.PositiveX, ACTION_FLAGS.NegativeX,
  ACTION_FLAGS.PositiveY, ACTION_FLAGS.NegativeY,
  ACTION_FLAGS.PositiveZ, ACTION_FLAGS.NegativeZ,
  ACTION_FLAGS.Rotation,
]);

export const TRIGGER_FLAGS = Object.freeze({
  None: 0x00, Collision01: 0x01, Direct: 0x02, Collision03: 0x03,
  Attack: 0x05, Direct6: 0x06, MultiTrigger: 0x08, Collision09: 0x09,
  Door: 0x0a,
});

const AXES = Object.freeze({
  None: 0, NegativeX: 1, PositiveX: 2, NegativeY: 3, PositiveY: 4,
  NegativeZ: 5, PositiveZ: 6,
});

const ACTION_FLAG_VALUES = new Set(Object.values(ACTION_FLAGS));
const TRIGGER_FLAG_VALUES = new Set(Object.values(TRIGGER_FLAGS));

const LOCK_VALUES = [
  0x00, 0x02, 0x04, 0x06, 0x08, 0x0a, 0x0c, 0x0e,
  0x10, 0x12, 0x14, 0x19, 0x1e, 0x32, 0x80, 0xff,
];

export function getModelMatrix(obj) {
  const mr = obj.resources.modelResource;
  const degreesX = -mr.xRotation / ROTATION_DIVISOR;
  const degreesY = -mr.yRotation / ROTATION_DIVISOR;
  const degreesZ = -mr.zRotation / ROTATION_DIVISOR;
  const t = trs(
    obj.xPos * GLOBAL_SCALE, -obj.yPos * GLOBAL_SCALE, obj.zPos * GLOBAL_SCALE,
    0, 0, 0);
  const rz = trs(0, 0, 0, 0, 0, degreesZ);
  const rx = trs(0, 0, 0, degreesX, 0, 0);
  const ry = trs(0, 0, 0, 0, degreesY, 0);
  return multiply(multiply(multiply(t, rz), rx), ry);
}

export function isActionDoor(rdb, modelReference) {
  if (rdb.modelReferenceList[modelReference].modelIdNum === RED_BRICK_DOOR_MODEL_ID) {
    return false;
  }
  const description = rdb.modelReferenceList[modelReference].description;
  return description === 'DOR' || description === 'DDR' ||
    description === 'NEW' || description === 'CAV';
}

export function rdbModelActs(obj) {
  return obj.resources.modelResource.actionResource.flags !== 0;
}

function rotationActionVector(action, axis) {
  if (action.axisRaw === 13 && action.description === 'TRP') {
    axis = AXES.NegativeX;
    // Classic uses 392, but the player can get stuck at that angle.
    action.magnitude = 400;
  }
  const v = { x: 0, y: 0, z: 0 };
  const magnitude = action.magnitude;
  switch (axis) {
    case AXES.NegativeX: v.x = -magnitude; break;
    case AXES.NegativeY: v.y = -magnitude; break;
    case AXES.NegativeZ: v.z = -magnitude; break;
    case AXES.PositiveX: v.x = magnitude; break;
    case AXES.PositiveY: v.y = magnitude; break;
    case AXES.PositiveZ: v.z = magnitude; break;
    default: break;
  }
  action.rotation = {
    x: v.x / ROTATION_DIVISOR,
    y: v.y / ROTATION_DIVISOR,
    z: v.z / ROTATION_DIVISOR,
  };
}

function translationActionVector(action, axis) {
  const v = { x: 0, y: 0, z: 0 };
  const magnitude = action.magnitude;
  switch (axis) {
    case AXES.NegativeX: v.x = magnitude; break;
    case AXES.NegativeY: v.y = -magnitude; break;
    case AXES.NegativeZ: v.z = magnitude; break;
    case AXES.PositiveX: v.x = -magnitude; break;
    case AXES.PositiveY: v.y = magnitude; break;
    case AXES.PositiveZ: v.z = -magnitude; break;
    default: break;
  }
  action.translation = {
    x: v.x * GLOBAL_SCALE,
    y: v.y * GLOBAL_SCALE,
    z: v.z * GLOBAL_SCALE,
  };
}

function buildAction(description, soundIndex, duration, magnitude, axisRaw, triggerRaw, actionRaw, isFlat) {
  const action = {
    description,
    index: soundIndex,
    duration,
    magnitude,
    axisRaw,
    triggerFlag: TRIGGER_FLAG_VALUES.has(triggerRaw) ? triggerRaw : TRIGGER_FLAGS.None,
    actionFlag: ACTION_FLAG_VALUES.has(actionRaw) ? actionRaw : ACTION_FLAGS.None,
    isFlat,
    rotation: { x: 0, y: 0, z: 0 },
    translation: { x: 0, y: 0, z: 0 },
    nextObject: -1,
    previousObject: -1,
  };

  switch (action.actionFlag) {
    case ACTION_FLAGS.Translation:
      translationActionVector(action, axisRaw);
      break;
    case ACTION_FLAGS.Rotation:
      rotationActionVector(action, axisRaw);
      break;
    case ACTION_FLAGS.PositiveX:
      action.duration = 50;
      action.magnitude = axisRaw * 8;
      translationActionVector(action, AXES.PositiveX);
      break;
    case ACTION_FLAGS.NegativeX:
      action.duration = 50;
      action.magnitude = axisRaw * 8;
      translationActionVector(action, AXES.NegativeX);
      break;
    case ACTION_FLAGS.PositiveY:
      action.duration = 50;
      action.magnitude = axisRaw * 8;
      translationActionVector(action, AXES.PositiveY);
      break;
    case ACTION_FLAGS.NegativeY:
      action.duration = 50;
      action.magnitude = axisRaw * 8;
      translationActionVector(action, AXES.NegativeY);
      break;
    case ACTION_FLAGS.PositiveZ:
      action.duration = 50;
      action.magnitude = axisRaw * 8;
      translationActionVector(action, AXES.PositiveZ);
      break;
    case ACTION_FLAGS.NegativeZ:
      action.duration = 50;
      action.magnitude = axisRaw * 8;
      translationActionVector(action, AXES.NegativeZ);
      break;
    default:
      break;
  }

  switch (description) {
    case 'LID': action.rotation = { x: 0, y: 0, z: -90 }; break;
    case 'WHE': action.rotation = { x: 0, y: -360, z: 0 }; break;
  }

  return action;
}

function modelAction(rdb, obj) {
  const mr = obj.resources.modelResource;
  const description = rdb.modelReferenceList[mr.modelIndex].description;
  return buildAction(
    description,
    mr.soundIndex,
    mr.actionResource.duration,
    mr.actionResource.magnitude,
    mr.actionResource.axis,
    mr.triggerFlagStartingLock,
    mr.actionResource.flags,
    false,
  );
}

function flatAction(obj) {
  const fr = obj.resources.flatResource;
  return buildAction('FLT', fr.soundIndex, 0, fr.magnitude, fr.magnitude, fr.flags, fr.action, true);
}

export function* rdbObjects(rdb) {
  for (const group of rdb.objectRootList) {
    if (!group.rdbObjects) continue;
    yield* group.rdbObjects;
  }
}

/**
 * @param {object} dfBlock
 * @param {number} blockIndex
 * @param {boolean} allowExitDoors
 * @param {(modelIdNum:number) => object} getModel
 * @returns {{placements:Array,actionDoors:Array,flats:Array,markers:Array,
 *   startMarkers:Array,enterMarkers:Array,exitDoors:Array,
 *   actionLinks:Map,waterLevel:number,castleBlock:boolean}}
 */
export function layoutRdbBlock(dfBlock, blockIndex, allowExitDoors, getModel) {
  const rdb = dfBlock.rdbBlock;
  const blockPosition = dfBlock.position ?? 0;
  const placements = [];
  const actionDoors = [];
  const flats = [];
  const markers = [];
  const startMarkers = [];
  const enterMarkers = [];
  const exitDoors = [];
  const actionLinks = new Map();
  const objectPositions = new Map();

  const addModelLink = (obj, action) => {
    if (!actionLinks.has(obj.position)) {
      actionLinks.set(obj.position, {
        nextKey: obj.resources.modelResource.actionResource.nextObjectOffset,
        prevKey: obj.resources.modelResource.actionResource.previousObjectOffset,
        action,
      });
    }
  };

  for (const obj of rdbObjects(rdb)) {
    if (obj.type === RDB_RESOURCE_TYPES.Model) {
      const modelReference = obj.resources.modelResource.modelIndex;
      const modelIdNum = rdb.modelReferenceList[modelReference].modelIdNum;

      if (modelIdNum === EXIT_DOOR_MODEL_ID && !allowExitDoors) continue;

      const matrix = getModelMatrix(obj);
      const acts = rdbModelActs(obj);
      const action = acts ? modelAction(rdb, obj) : null;

      if (isActionDoor(rdb, modelReference)) {
        const mr = obj.resources.modelResource;
        actionDoors.push({
          modelIdNum,
          matrix,
          position: obj.position,
          loadID: blockPosition + obj.position,
          startingLockValue: LOCK_VALUES[mr.triggerFlagStartingLock >> 4],
          action,
        });
        objectPositions.set(obj.position, positionEntryFromMatrix(matrix, obj));
        if (acts) addModelLink(obj, action);
        continue;
      }

      const model = getModel(modelIdNum);
      const staticDoors = getStaticDoors(model, blockIndex, 0, matrix);
      if (staticDoors) exitDoors.push(...staticDoors);

      placements.push({ modelIdNum, matrix, action, position: obj.position });
      objectPositions.set(obj.position, positionEntryFromMatrix(matrix, obj));
      if (acts) addModelLink(obj, action);
    } else if (obj.type === RDB_RESOURCE_TYPES.Flat) {
      const fr = obj.resources.flatResource;
      const x = obj.xPos * GLOBAL_SCALE;
      const y = -obj.yPos * GLOBAL_SCALE;
      const z = obj.zPos * GLOBAL_SCALE;
      const acts = fr.action > 0;
      const action = acts ? flatAction(obj) : null;

      if (fr.textureArchive === EDITOR_FLATS_ARCHIVE) {
        const marker = {
          record: fr.textureRecord, x, y, z, position: obj.position, action,
          loadID: blockPosition + obj.position,
          rawY: obj.yPos, flags: fr.flags, factionOrMobileId: fr.factionOrMobileId,
          soundIndex: fr.soundIndex, actionByte: fr.action,
          isCustomData: !!fr.isCustomData,
        };
        markers.push(marker);
        if (fr.textureRecord === 10) {
          startMarkers.push(marker);
        } else if (fr.textureRecord === 8) {
          enterMarkers.push(marker);
        }
        if (!actionLinks.has(obj.position)) {
          actionLinks.set(obj.position, { nextKey: fr.nextObjectOffset, prevKey: -1, action });
        }
      } else if (fr.textureArchive === FIXED_TREASURE_FLATS_ARCHIVE) {
        markers.push({ record: fr.textureRecord, archive: fr.textureArchive, x, y, z, position: obj.position, action });
        if (acts && !actionLinks.has(obj.position)) {
          actionLinks.set(obj.position, { nextKey: fr.nextObjectOffset, prevKey: -1, action });
        }
      } else {
        flats.push({
          archive: fr.textureArchive, record: fr.textureRecord, x, y, z, action,
          position: obj.position,
          npc: isNpcFlat(fr.textureArchive),
          factionID: fr.factionOrMobileId, flags: fr.flags,
          flatPosition: fr.position,
          rawX: obj.xPos, rawY: obj.yPos, rawZ: obj.zPos,
          editorPerson: editorPersonOf(fr.editorPerson),
        });
        if (acts && !actionLinks.has(obj.position)) {
          actionLinks.set(obj.position, { nextKey: fr.nextObjectOffset, prevKey: -1, action });
        }
      }
      objectPositions.set(obj.position, { x, y, z, yawDeg: 0 });
    }
  }

  for (const link of actionLinks.values()) {
    if (!link.action) continue;
    if (actionLinks.has(link.nextKey)) link.action.nextObject = link.nextKey;
    if (actionLinks.has(link.prevKey)) link.action.previousObject = link.prevKey;
  }

  let waterLevel = 10000;
  let castleBlock = false;
  if (startMarkers.length > 0) {
    const first = startMarkers[0];
    const src = findFlatResource(rdb, first.position);
    if (src.soundIndex !== 0) waterLevel = -8 * src.soundIndex;
    castleBlock = src.magnitude !== 0;
  }

  return {
    placements, actionDoors, flats, markers, startMarkers, enterMarkers,
    exitDoors, actionLinks, objectPositions, waterLevel, castleBlock,
  };
}

function positionEntryFromMatrix(matrix, obj) {
  return {
    x: matrix[12], y: matrix[13], z: matrix[14],
    yawDeg: -obj.resources.modelResource.yRotation / ROTATION_DIVISOR,
  };
}

function findFlatResource(rdb, position) {
  for (const obj of rdbObjects(rdb)) {
    if (obj.position === position) return obj.resources.flatResource;
  }
  throw new Error(`flat resource not found at position ${position}`);
}
