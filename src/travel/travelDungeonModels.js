// @ts-check
import { multiply, trs } from '../world/mat4.js';
import { subMeshDoorType, DOOR_TYPE } from '../world/meshReader.js';

export const TV_DUNGEON_MODELS_MAX = 12;
export const TV_DUNGEON_ICON_M = 24;
export const TV_DUNGEON_GROW_MAX = 12;

/**
 * @template {{ key: string, d: number }} T
 * @param {Iterable<T>} list
 * @param {number} [max]
 * @returns {T[]}
 */
export function dungeonModelSet(list, max = TV_DUNGEON_MODELS_MAX) {
  return [...(list ?? [])].sort((a, b) => a.d - b.d || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).slice(0, Math.max(0, max));
}

export const TV_DUNGEON_LOADS_PER_FRAME = 1;

/**
 * @template {{ key: string }} T
 * @param {Iterable<T>} list
 * @param {{ has: (key: string) => boolean }} held
 * @param {boolean} up
 * @param {(g: T) => void} start
 * @param {number} [max]
 */
export function startDungeonLoads(list, held, up, start, max = TV_DUNGEON_LOADS_PER_FRAME) {
  if (!up) return 0;
  let n = 0;
  for (const g of list ?? []) {
    if (n >= max) break;
    if (held.has(g.key)) continue;
    start(g);
    n++;
  }
  return n;
}

/** @param {{ subMeshes?: Array<{ textureArchive: number, textureRecord: number, planes?: any[] }> } | null | undefined} dfMesh */
export function meshHasDungeonEntrance(dfMesh) {
  for (const sm of dfMesh?.subMeshes ?? []) {
    if (sm.planes?.length && subMeshDoorType(sm.textureArchive, sm.textureRecord) === DOOR_TYPE.DUNGEON_ENTRANCE) return true;
  }
  return false;
}

/**
 * @param {Array<{ originX: number, originZ: number, layout?: { models?: Array<{ modelIdNum: number, matrix: Float32Array|number[], enhancedOnly?: boolean }> } }>} blocks
 * @param {number} locX
 * @param {number} locZ
 * @param {(id: number) => ({ subMeshes?: any[], totalTriangles?: number } | null | undefined)} meshOf
 * @param {boolean} [enhanced]
 * @returns {{ modelIdNum: number, local: Float32Array, entrance: boolean } | null}
 */
export function dungeonEntranceModel(blocks, locX, locZ, meshOf, enhanced = true) {
  let best = null, most = -1;
  for (const b of blocks ?? []) {
    for (const placed of b.layout?.models ?? []) {
      if (placed.enhancedOnly && !enhanced) continue;
      const mesh = meshOf(placed.modelIdNum);
      if (!mesh) continue;
      const entrance = meshHasDungeonEntrance(mesh);
      const tris = mesh.totalTriangles ?? 0;
      if (!entrance && tris <= most) continue;
      const local = multiply(trs(locX + b.originX, 0, locZ + b.originZ, 0, 0, 0), placed.matrix);
      if (entrance) return { modelIdNum: placed.modelIdNum, local, entrance: true };
      most = tris;
      best = { modelIdNum: placed.modelIdNum, local, entrance: false };
    }
  }
  return best;
}

/**
 * @param {number} h
 * @param {number} [blend]
 */
export function owDungeonGrow(h, blend = 1) {
  if (!(h > 0)) return 1;
  const b = Number.isFinite(blend) ? Math.max(0, Math.min(1, blend)) : 1;
  const full = Math.max(1, Math.min(TV_DUNGEON_GROW_MAX, TV_DUNGEON_ICON_M / h));
  return 1 + (full - 1) * b;
}

/**
 * Assumes `local` is affine with a last row of 0 0 0 1, so only its rotation and its offset from the foot are
 * scaled.
 * @param {Float32Array|number[]} local
 * @param {number[]} box
 * @param {number[]} at
 * @param {number} g
 * @param {Float32Array} [out]
 */
export function grownModelMatrix(local, box, at, g, out = new Float32Array(16)) {
  const fx = (box[0] + box[3]) / 2, fz = (box[2] + box[5]) / 2;
  for (let c = 0; c < 3; c++) {
    out[4 * c] = g * local[4 * c]; out[4 * c + 1] = g * local[4 * c + 1]; out[4 * c + 2] = g * local[4 * c + 2]; out[4 * c + 3] = 0;
  }
  out[12] = g * (local[12] - fx) + at[0];
  out[13] = g * local[13] + at[1];
  out[14] = g * (local[14] - fz) + at[2];
  out[15] = 1;
  return out;
}

// Over a built pixel, a model grown no more than this overlaps the real one and would z-fight, so the world draws
// it alone.
export const TV_DUNGEON_GROWN_MIN = 1.05;
export const owDungeonDrawn = (g, built) => !built || g > TV_DUNGEON_GROWN_MIN;

export const modelFoot = (box) => [(box[0] + box[3]) / 2, 0, (box[2] + box[5]) / 2];
