// RMB block assembly: placed model matrices and ground tilemap.
// 1:1 with the layout math in Daggerfall Unity's RMBLayout.cs (MIT, Daggerfall Workshop).

import { ROTATION_DIVISOR, RMB_DIMENSION } from '../formats/blocksFile.js';
import { PLACEMENTS as WINDMILL_PLACEMENTS } from './windmillMesh.js';
import { WINDMILL_INTERIOR } from './windmillInterior.js';
import { GLOBAL_SCALE } from './meshReader.js';
import { trs, multiply } from './mat4.js';
import { GROUND_RECORD_LIMIT } from './terrainTiles.js';

export const PROPS_OFFSET_Y = -4;
export const GROUND_OFFSET = -1;
export const GROUND_TILE_SIZE = 256;
export const GROUND_TILE_DIM = 16;

export const CITY_GATE_OPEN_MODEL_ID = 446;
export const CITY_GATE_CLOSED_MODEL_ID = 447;
export const isCityGate = (modelID) =>
  modelID === CITY_GATE_OPEN_MODEL_ID || modelID === CITY_GATE_CLOSED_MODEL_ID;

export const BULLETIN_BOARD_MODEL_ID = 41739;
export const isBulletinBoard = (modelID) => modelID === BULLETIN_BOARD_MODEL_ID;

/**
 * @param {object} dfBlock
 * @param {{enhanced?:boolean, windmills?:boolean}} [opts]
 * @returns {{models:Array<{modelId:string,modelIdNum:number,matrix:Float32Array}>,
 *   groundTiles:Array<Array<{record:number,rotated:boolean,flipped:boolean}>>}}
 */
/**
 * @returns {[number, number, number]}
 */
export function modelScaleVector(obj) {
  return [obj.xScale || 1, obj.yScale || 1, obj.zScale || 1];
}

export const WINDMILL_MODEL_ID = 41600;

export function layoutRmbBlock(dfBlock, { enhanced = false, windmills = true } = {}) {
  const rmb = dfBlock.rmbBlock;
  const models = [];
  const millsHere = enhanced && windmills;
  const ownMills = [];

  for (let recordIndex = 0; recordIndex < rmb.subRecords.length; recordIndex++) {
    const subRecord = rmb.subRecords[recordIndex];
    const subRecordMatrix = trs(
      subRecord.xPos * GLOBAL_SCALE,
      0,
      (RMB_DIMENSION - subRecord.zPos) * GLOBAL_SCALE,
      0,
      -subRecord.yRotation / ROTATION_DIVISOR,
      0
    );

    for (const obj of subRecord.exterior.block3dObjectRecords) {
      const modelMatrix = trs(
        obj.xPos * GLOBAL_SCALE,
        -obj.yPos * GLOBAL_SCALE,
        obj.zPos * GLOBAL_SCALE,
        -obj.xRotation / ROTATION_DIVISOR,
        -obj.yRotation / ROTATION_DIVISOR,
        -obj.zRotation / ROTATION_DIVISOR,
        ...modelScaleVector(obj)
      );
      if (millsHere && obj.modelIdNum === WINDMILL_MODEL_ID) { ownMills.push({ matrix: multiply(subRecordMatrix, modelMatrix) }); continue; }
      models.push({
        modelId: obj.modelId,
        modelIdNum: obj.modelIdNum,
        matrix: multiply(subRecordMatrix, modelMatrix),
        recordIndex,
        recordAt: [subRecordMatrix[12], subRecordMatrix[13], subRecordMatrix[14]],
      });
    }
  }

  for (const obj of rmb.misc3dObjectRecords) {
    const miscMatrix = trs(
      obj.xPos * GLOBAL_SCALE,
      (-obj.yPos + PROPS_OFFSET_Y) * GLOBAL_SCALE,
      (obj.zPos + RMB_DIMENSION) * GLOBAL_SCALE,
      -obj.xRotation / ROTATION_DIVISOR,
      -obj.yRotation / ROTATION_DIVISOR,
      -obj.zRotation / ROTATION_DIVISOR,
      ...modelScaleVector(obj)
    );
    if (millsHere && obj.modelIdNum === WINDMILL_MODEL_ID) { ownMills.push({ matrix: miscMatrix }); continue; }
    models.push({ modelId: obj.modelId, modelIdNum: obj.modelIdNum, matrix: miscMatrix });
  }

  const placed = dfBlock.fromWorldData ? [] : windmillsFor(dfBlock.name);
  const mills = [...placed, ...ownMills];
  if (mills.length && enhanced && windmills) {
    const recordIndex = placed.length ? attachWindmillRecord(dfBlock) : -1;
    for (const w of placed) {
      if (!w.building) continue;
      w.building.recordIndex = recordIndex;
      models.push(w.building);
    }
  }

  return { models, windmills: mills, groundTiles: buildGroundTilemap(dfBlock) };
}

export function attachWindmillRecord(dfBlock) {
  const subs = dfBlock.rmbBlock.subRecords;
  const already = subs.findIndex((r) => r?.windmill);
  if (already >= 0) return already;
  subs.push({
    windmill: true,
    xPos: 0, zPos: 0, yRotation: 0,
    exterior: {
      header: {
        position: 0, num3dObjectRecords: 0, numFlatObjectRecords: 0,
        numSection3Records: 0, numPeopleRecords: 0, numDoorRecords: 0,
        unknown1: 0, unknown2: 0, unknown3: 0, unknown4: 0, unknown5: 0, unknown6: 0,
      },
      block3dObjectRecords: [], blockFlatObjectRecords: [],
      blockSection3Records: [], blockPeopleRecords: [], blockDoorRecords: [],
    },
    interior: WINDMILL_INTERIOR,
  });
  return subs.length - 1;
}

export function windmillsFor(blockName) {
  const out = [];
  for (const p of WINDMILL_PLACEMENTS) {
    if (p.block !== blockName) continue;
    const subRecordMatrix = trs(
      p.subX * GLOBAL_SCALE, 0, (RMB_DIMENSION - p.subZ) * GLOBAL_SCALE,
      0, -p.subRot / ROTATION_DIVISOR, 0
    );
    const modelMatrix = trs(
      p.x * GLOBAL_SCALE, -p.y * GLOBAL_SCALE, p.z * GLOBAL_SCALE,
      0, -p.rotY / ROTATION_DIVISOR, 0
    );
    const entry = { matrix: multiply(subRecordMatrix, modelMatrix) };
    if (p.building) {
      const b = p.building;
      entry.building = {
        modelId: String(b.modelIdNum),
        modelIdNum: b.modelIdNum,
        enhancedOnly: true,
        matrix: multiply(subRecordMatrix, trs(
          b.x * GLOBAL_SCALE, -b.y * GLOBAL_SCALE, b.z * GLOBAL_SCALE,
          0, -b.rotY / ROTATION_DIVISOR, 0
        )),
      };
    }
    out.push(entry);
  }
  return out;
}

export function buildGroundTilemap(dfBlock) {
  const src = dfBlock.rmbBlock.fldHeader.groundData.groundTiles;
  const tiles = new Array(GROUND_TILE_DIM);
  for (let y = 0; y < GROUND_TILE_DIM; y++) {
    tiles[y] = new Array(GROUND_TILE_DIM);
    for (let x = 0; x < GROUND_TILE_DIM; x++) {
      const tile = src[x][GROUND_TILE_DIM - 1 - y];
      if (tile.textureRecord < GROUND_RECORD_LIMIT) {
        tiles[y][x] = {
          record: tile.textureRecord,
          rotated: tile.isRotated,
          flipped: tile.isFlipped,
        };
      } else {
        tiles[y][x] = { record: 2, rotated: false, flipped: false };
      }
    }
  }
  return tiles;
}
