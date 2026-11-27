import { GLOBAL_SCALE } from './meshReader.js';
import { layoutRmbBlock } from './rmbLayout.js';
import { RMB_DIMENSION } from '../formats/blocksFile.js';

export const RMB_SIDE = RMB_DIMENSION * GLOBAL_SCALE;

export function hasCustomLocationPosition(dfLocation) {
  const ext = dfLocation?.exterior?.exteriorData;
  if (!ext || ext.width !== 1 || ext.height !== 1) return false;
  return String(ext.blockNames?.[0] ?? '').startsWith('CUST');
}

/**
 * @param {object} dfLocation
 * @param {MapsFile} mapsFile
 * @param {BlocksFile} blocksFile
 * @param {{enhanced?:boolean, windmills?:boolean}} [opts]
 * @returns {{width:number,height:number,groundArchive:number, blocks:Array<{x:number,y:number,blockName:string,dfBlock:object, layout:object,originX:number,originZ:number}>}}
 */
export function layoutLocation(dfLocation, mapsFile, blocksFile, { enhanced = false, windmills = true } = {}) {
  const width = dfLocation.exterior.exteriorData.width;
  const height = dfLocation.exterior.exteriorData.height;
  const blocks = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const blockName = blocksFile.checkName(mapsFile.getRmbBlockName(dfLocation, x, y));
      const dfBlock = blocksFile.getBlockByName(blockName);
      if (!dfBlock) continue;
      blocks.push({
        x,
        y,
        blockName,
        dfBlock,
        layout: layoutRmbBlock(dfBlock, { enhanced, windmills }),
        originX: x * RMB_SIDE,
        originZ: y * RMB_SIDE,
      });
    }
  }

  return {
    width,
    height,
    groundArchive: dfLocation.climate.groundArchive,
    blocks,
  };
}
