// The beds one tool click works: the bed aimed at plus its neighbours, up to the tools' area (farmProgressLaw.js).
// Pure: positions in, indices out. Area 3 and 5 take the nearest beds within one step; area 9 is the whole 3x3 block
// (diagonals too), so aiming at the middle bed of a block gathers all nine.
import { FARM_BED_SPACING, FARM_WORK_REACH } from '../farmGardenLaw.js';

const SLACK = .1;
/** Reach for the neighbours of a 3x3 block: the block's far corners sit a bed-step further than the bed aimed at. */
export const blockReach = (area) => FARM_WORK_REACH + (area >= 9 ? FARM_BED_SPACING : 0);

/**
 * @param {number[][]} beds every bed's [x, y, z] (index = bed id; gaps are simply absent beds)
 * @param {number} selected the bed aimed at
 * @param {number} area the tools' area (1, 3, 5 or 9)
 * @param {number[]} feet the worker's position
 * @param {(index: number) => boolean} [visible] whether nothing blocks the way to a bed (the aimed bed is always taken)
 * @returns {number[]} bed ids, the aimed bed first, nearest next
 */
export function farmToolBeds(beds, selected, area, feet, visible = () => true) {
  const at = beds[selected], ids = [selected];
  if (!at || area <= 1) return ids;
  const block = area >= 9, reach = blockReach(area), step = FARM_BED_SPACING + SLACK;
  const near = [];
  for (let i = 0; i < beds.length; i++) {
    const p = beds[i];
    if (i === selected || !p) continue;
    const dx = Math.abs(p[0] - at[0]), dz = Math.abs(p[2] - at[2]);
    if (block ? dx > step || dz > step : Math.hypot(dx, dz) > step) continue;
    if (Math.hypot(p[0] - feet[0], p[2] - feet[2]) > reach) continue;
    near.push({ i, d: Math.hypot(dx, dz) });
  }
  near.sort((a, b) => a.d - b.d || a.i - b.i);
  for (const { i } of near) { if (ids.length >= area) break; if (visible(i)) ids.push(i); }
  return ids;
}
