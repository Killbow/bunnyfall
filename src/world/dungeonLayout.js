import { layoutRdbBlock, RDB_SIDE } from './rdbLayout.js';
import { dungeonTextureTable } from './dungeonTextures.js';
import { DOOR_TYPE } from './meshReader.js';
import { transformPoint } from './mat4.js';

export { RDB_SIDE };

// `exitDoors` holds every door face the block models carry (building, entrance, and exit); only a DungeonExit door
// leaves the dungeon.
export const isDungeonExitDoor = (door) => door?.doorType === DOOR_TYPE.DUNGEON_EXIT;

const OVERLAP_TOLERANCE = 1.4;

/**
 * @param {object} dfLocation
 * @param {object} blocksFile
 * @param {(modelIdNum:number) => object} getModel
 * @returns {{blocks:Array<{name:string,originX:number,originZ:number, isStartingBlock:boolean,layout:object}>,textureTable:number[], startMarker:{x,y,z}|null,enterMarker:{x,y,z}|null}}
 */
export function layoutDungeon(dfLocation, blocksFile, getModel) {
  if (!dfLocation.hasDungeon) {
    throw new Error(`location has no dungeon: ${dfLocation.name}`);
  }

  const textureTable = dungeonTextureTable({
    locationId: dfLocation.dungeon.recordElement.header.locationId,
    mapId: dfLocation.mapTableData?.mapId ?? 0,
    worldClimate: dfLocation.climate.worldClimate,
  });

  const blocks = [];
  let startMarker = null;
  let enterMarker = null;

  for (const block of dfLocation.dungeon.blocks) {
    const blockIndex = blocksFile.getBlockIndex(block.blockName);
    if (blockIndex === -1) throw new Error(`block not found: ${block.blockName}`);
    const dfBlock = blocksFile.getBlock(blockIndex);
    const layout = layoutRdbBlock(dfBlock, blockIndex, block.isStartingBlock, getModel);
    const originX = block.x * RDB_SIDE;
    const originZ = block.z * RDB_SIDE;

    if (block.isStartingBlock) {
      if (layout.startMarkers.length > 0) {
        const m = layout.startMarkers[0];
        startMarker = { x: m.x + originX, y: m.y, z: m.z + originZ };
      }
      if (layout.enterMarkers.length > 0) {
        const m = layout.enterMarkers[0];
        enterMarker = { x: m.x + originX, y: m.y, z: m.z + originZ };
      }
    }

    blocks.push({
      name: block.blockName,
      originX,
      originZ,
      isStartingBlock: block.isStartingBlock,
      layout,
      dfBlock,
    });
  }

  removeOverlappingDoors(blocks);

  return { blocks, textureTable, startMarker, enterMarker };
}

function removeOverlappingDoors(blocks) {
  const registry = [];

  // Matches DFU: exit door centers use the building matrix without the block origin, harmless because the starting
  // block sits at grid 0,0. Only the first exit per block is taken.
  for (const b of blocks) {
    for (const door of b.layout.exitDoors) {
      if (isDungeonExitDoor(door)) {
        registry.push(transformPoint(door.matrix, door.centre.x, door.centre.y, door.centre.z));
        break;
      }
    }
  }

  for (const b of blocks) {
    for (const actionDoor of b.layout.actionDoors) {
      const pos = [
        actionDoor.matrix[12] + b.originX,
        actionDoor.matrix[13],
        actionDoor.matrix[14] + b.originZ,
      ];
      let duplicateFound = false;
      for (const p of registry) {
        const d = Math.hypot(pos[0] - p[0], pos[1] - p[1], pos[2] - p[2]);
        if (d < OVERLAP_TOLERANCE) {
          actionDoor.disabled = true;
          duplicateFound = true;
          break;
        }
      }
      if (!duplicateFound) registry.push(pos);
    }
  }
}
