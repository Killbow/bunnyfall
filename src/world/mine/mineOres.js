// @ts-check
// BUNNYFALL (2026-11-26, caverns): THE OWNER'S ORES AT THE HOLES - each hole of a mine wears a cluster of the owner's ore
// and crystal models (world/mine/mineArt.js), colour-shifted to its ore (MINE_ORE_TINT) and set on its floor round it.
// The owner: "make them bigger and make them clustered". A rich seam's cluster is of the big crystals, a common one's of
// the small ores; which pieces, where and how big, by the hole, so every page stands the same cluster.
import { multiply, trs } from '../mat4.js';
import { MINE_RICH_ORES } from '../../net/mine/mineLayout.js';

/** How many of the baked ores (the last, the clusters) are the rich seams'. */
export const MINE_ORE_RICH_FROM = 11;
/** A cluster: how many pieces (at least, and how many more it may have), how tall the middle one and the rest stand
 *  (m - each piece scaled to it, the owner's pieces being of every size), a rich seam's taller, and how far round the
 *  hole they stand (m). */
export const MINE_ORE_CLUSTER = Object.freeze({ min: 3, more: 3, middle: 1.1, rest: [0.5, 0.9], richMult: 1.4, ring: [0.35, 0.95] });

const hashOf = (/** @type {string} */ s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/** The pieces a hole's ore draws from: [first, count] of the baked ores. */
function rangeOf(/** @type {string} */ ore, /** @type {number} */ count) {
  const rich = MINE_RICH_ORES.includes(ore) && count > MINE_ORE_RICH_FROM;
  return rich ? [MINE_ORE_RICH_FROM, count - MINE_ORE_RICH_FROM] : [0, Math.min(count, MINE_ORE_RICH_FROM)];
}

/** Which baked ore a hole's first piece is (an index into `ores`), or -1 where none are baked. */
export function mineOreModelOf(/** @type {{ ore: string }} */ hole, /** @type {number} */ count) {
  if (count <= 0) return -1;
  const [lo, n] = rangeOf(hole.ore, count);
  return lo + (hashOf(hole.ore) % n);
}

/** A piece's matrix: the model's middle and its foot at `at`, turned `yaw` degrees, scaled `s`. */
export function mineOreMatrix(/** @type {number[]} */ at, /** @type {number[]} */ box, yaw = 0, s = 1) {
  const cx = (box[0] + box[3]) / 2, cz = (box[2] + box[5]) / 2;
  return multiply(trs(at[0], at[1], at[2], 0, yaw, 0, s, s, s), trs(-cx, -box[1], -cz, 0, 0, 0));
}

/** A hole's cluster: `{ i, at, yaw, tall }` a piece (`tall` its height, m), the same on every page. */
export function mineOreCluster(/** @type {{ at: number[], k: number, ore: string }} */ hole, /** @type {number} */ count) {
  if (count <= 0) return [];
  const [lo, n] = rangeOf(hole.ore, count), C = MINE_ORE_CLUSTER;
  let h = hashOf(`${hole.ore}|${hole.at.join(',')}|${hole.k}`);
  const next = () => { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = (h ^ (h >>> 13)) >>> 0; return h / 4294967296; };
  const pieces = C.min + Math.floor(next() * (C.more + 1)), out = [];
  for (let p = 0; p < pieces; p++) {
    const a = (p / pieces) * Math.PI * 2 + next() * 0.8, r = p === 0 ? 0 : C.ring[0] + next() * (C.ring[1] - C.ring[0]);
    const tall = (p === 0 ? C.middle : C.rest[0] + next() * (C.rest[1] - C.rest[0])) * (lo > 0 ? C.richMult : 1);
    out.push({ i: lo + Math.floor(next() * n), at: [hole.at[0] + Math.cos(a) * r, hole.at[1], hole.at[2] + Math.sin(a) * r], yaw: Math.floor(next() * 360), tall });
  }
  return out;
}

/**
 * The draws of a mine's ores: a cluster a hole, each piece wearing its ore's colours, for a dungeon context's dynamicDraws.
 * @param {any} layout the mine's (net/mine/mineLayout.js)
 * @param {{ gpu: any, box: number[] }[]} ores the baked ores
 * @param {((i: number, ore: string) => any) | null} [meshOf] a piece's mesh in an ore's colours (mineArt's oreMesh), else its own
 */
export function mineOreDraws(layout, ores, meshOf = null) {
  const out = [];
  for (const sec of layout.sections) for (const ch of sec.chambers) for (const h of ch.holes) {
    for (const p of mineOreCluster(h, ores.length)) {
      const gpu = meshOf?.(p.i, h.ore) ?? ores[p.i]?.gpu;
      if (!gpu) continue;
      const box = ores[p.i].box, s = p.tall / Math.max(0.05, box[4] - box[1]);
      out.push({ gpu, object: { matrix: mineOreMatrix(p.at, box, p.yaw, s) }, hidden: false, noShadow: true, texRemap: null });
    }
  }
  return out;
}
