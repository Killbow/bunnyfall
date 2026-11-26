// @ts-check
// BUNNYFALL (2026-11-26, caverns): THE OWNER'S ORES AT THE HOLES - each hole of a mine wears one of the owner's ore and
// crystal models (world/mine/mineArt.js), set on its floor and turned by its number. A rich seam wears one of the big
// crystal clusters, a common one a small ore; which of them, by the ore's key, so every page stands the same one.
import { multiply, trs } from '../mat4.js';
import { MINE_RICH_ORES } from '../../net/mine/mineLayout.js';

/** How many of the baked ores (the last, the clusters) are the rich seams'; and the models' scale over their own size. */
export const MINE_ORE_RICH_FROM = 11;
export const MINE_ORE_SCALE = 1.6;

const hashOf = (/** @type {string} */ s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/** Which baked ore a hole wears (an index into `ores`), or -1 where none are baked. */
export function mineOreModelOf(/** @type {{ ore: string }} */ hole, /** @type {number} */ count) {
  if (count <= 0) return -1;
  const rich = MINE_RICH_ORES.includes(hole.ore) && count > MINE_ORE_RICH_FROM;
  const lo = rich ? MINE_ORE_RICH_FROM : 0, n = rich ? count - MINE_ORE_RICH_FROM : Math.min(count, MINE_ORE_RICH_FROM);
  return lo + (hashOf(hole.ore) % n);
}

/** A hole's ore model's matrix: the model's middle and its foot on the hole, turned by the hole's number, scaled. */
export function mineOreMatrix(/** @type {{ at: number[], k: number }} */ hole, /** @type {number[]} */ box) {
  const cx = (box[0] + box[3]) / 2, cz = (box[2] + box[5]) / 2;
  return multiply(trs(hole.at[0], hole.at[1], hole.at[2], 0, (hole.k * 137) % 360, 0, MINE_ORE_SCALE, MINE_ORE_SCALE, MINE_ORE_SCALE), trs(-cx, -box[1], -cz, 0, 0, 0));
}

/**
 * The draws of a mine's ores: `{ gpu, object: { matrix } }` a hole, for a dungeon context's dynamicDraws.
 * @param {any} layout the mine's (net/mine/mineLayout.js)
 * @param {{ gpu: any, box: number[] }[]} ores the baked ores
 */
export function mineOreDraws(layout, ores) {
  const out = [];
  for (const sec of layout.sections) for (const ch of sec.chambers) for (const h of ch.holes) {
    const i = mineOreModelOf(h, ores.length);
    if (i < 0 || !ores[i]?.gpu) continue;
    out.push({ gpu: ores[i].gpu, object: { matrix: mineOreMatrix(h, ores[i].box) }, hidden: false, noShadow: true, texRemap: null });
  }
  return out;
}
