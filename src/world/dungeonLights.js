import { getFloat } from '../platform/settings.js';
import { GLOBAL_SCALE } from './meshReader.js';
import { RDB_RESOURCE_TYPES } from '../formats/blocksFile.js';

export const DUNGEON_AMBIENT = Object.freeze([0.12, 0.12, 0.12]);
// Two constants because DFU serializes the castle and special-area ambients as separate fields that an override
// could split.
export const CASTLE_AMBIENT = Object.freeze([0.58, 0.58, 0.58]);
export const SPECIAL_AREA_AMBIENT = Object.freeze([0.58, 0.58, 0.58]);
export const SPECIAL_AREA_BLOCK = 'S0000161.RDB';

export function dungeonAmbientFor({ inCastle = false, inSpecialArea = false } = {}) {
  if (inCastle) return CASTLE_AMBIENT;
  if (inSpecialArea) return SPECIAL_AREA_AMBIENT;
  const scale = getFloat('Enhancements', 'DungeonAmbientLightScale', 0, 1);
  return scale === 1 ? DUNGEON_AMBIENT : DUNGEON_AMBIENT.map((v) => v * scale);
}
// DFU culls each light by XZ distance alone at this range (a 2048-unit block plus a 12-unit margin). The range cull
// must run before the nearest-light pick for the shader slots.
export const UNSCALED_BLOCK_RANGE = 2060;
export const DUNGEON_LIGHT_BLOCK_RANGE = UNSCALED_BLOCK_RANGE * GLOBAL_SCALE;

export const DUNGEON_LIGHT_INTENSITY = 0.8;
export const DUNGEON_LIGHT_COLOR = Object.freeze([
  DUNGEON_LIGHT_INTENSITY, DUNGEON_LIGHT_INTENSITY, DUNGEON_LIGHT_INTENSITY,
]);

/**
 * @param {object} dfBlock
 * @returns {Array<{x:number,y:number,z:number,range:number}>}
 */
export function collectDungeonLights(dfBlock) {
  const lights = [];
  for (const group of dfBlock.rdbBlock.objectRootList) {
    if (!group.rdbObjects) continue;
    for (const obj of group.rdbObjects) {
      if (obj.type !== RDB_RESOURCE_TYPES.Light) continue;
      lights.push({
        x: obj.xPos * GLOBAL_SCALE,
        y: -obj.yPos * GLOBAL_SCALE,
        z: obj.zPos * GLOBAL_SCALE,
        range: obj.resources.lightResource.radius * GLOBAL_SCALE * 3,
      });
    }
  }
  return lights;
}
