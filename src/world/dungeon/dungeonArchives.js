// Starts every texture archive a dungeon level uses at once, so the first entry does not load them model by model.

import { applyTextureTable } from './dungeonTextures.js';
import { isClimateFreeModel } from '../customModels.js';

/**
 * @param {{ textureTable: number[], blocks: any[] }} dungeon
 * @param {number} climateBaseType
 * @param {(id: number) => any} modelOf
 * @param {(archive: number) => Promise<any>} getTexture
 * @returns {(archive: number) => number}
 */
export function levelRemap(dungeon, climateBaseType, modelOf, getTexture) {
  const remap = (archive) => applyTextureTable(archive, dungeon.textureTable, climateBaseType);
  const archives = new Set();
  for (const b of dungeon.blocks) {
    for (const p of [...b.layout.placements, ...b.layout.actionDoors]) {
      for (const sm of modelOf(p.modelIdNum)?.subMeshes ?? []) {
        archives.add(sm.textureArchive);
        if (!isClimateFreeModel(p.modelIdNum)) archives.add(remap(sm.textureArchive));
      }
    }
    for (const f of b.layout.flats) archives.add(f.archive);
  }
  for (const archive of archives) getTexture(archive).catch(() => {});
  return remap;
}
