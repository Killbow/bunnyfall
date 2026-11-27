// @ts-check
// Shapes a pixel ground for the spawn the roll gives, alive or dead, so clients that disagree on a spawn clock
// still agree on the ground. Reads no clocks.
import { CLIMATES } from '../formats/mapsTables.js';
import { inEther } from './ethericSea.js';
import { spawnsDungeon, pathFreePixel, WORLD_SALT } from './spawnedDungeons.js';
import { wildMaskOf, wildInside } from './wildZone.js';

/**
 * @typedef {object} SpawnGroundHandles
 * @property {{ getClimateIndex(x: number, y: number): number }} maps
 * @property {boolean} online
 * @property {boolean} etherSea
 * @property {(px: number, py: number) => boolean} plateauDry
 * @property {{ roads(): object | null }} terrainGen
 * @property {(px: number, py: number) => object | null} cloneAt
 * @property {(px: number, py: number) => boolean} spawnGone
 */

/** @param {SpawnGroundHandles} handles */
export function createSpawnGroundPlace(handles) {
  const { maps, online, etherSea, plateauDry, terrainGen, cloneAt, spawnGone } = handles;

  function inOpenZone(px, py) {
    const mask = wildMaskOf(maps);
    return !!mask && wildInside(mask, px, py);
  }

  /**
   * @param {number} px
   * @param {number} py
   * @param {{ clocks?: boolean }} [options]
   */
  function spawnAt(px, py, { clocks = true } = {}) {
    if (maps.getClimateIndex(px, py) === CLIMATES.Ocean) return null;
    if (!plateauDry(px, py)) return null;
    if (clocks && spawnGone(px, py)) return null;
    const roads = terrainGen.roads();
    if (roads && !pathFreePixel(roads, px, py)) return null;
    return cloneAt(px, py);
  }

  /**
   * @param {number} px
   * @param {number} py
   * @param {object | null | undefined} stood
   */
  function groundLocationAt(px, py, stood) {
    if (stood) return stood;
    if (!online) return null;
    if (etherSea && inEther(px, py)) return null;
    if (inOpenZone(px, py)) return null;
    if (!spawnsDungeon(WORLD_SALT, px, py)) return null;
    return spawnAt(px, py, { clocks: false });
  }

  return { spawnAt, groundLocationAt };
}
