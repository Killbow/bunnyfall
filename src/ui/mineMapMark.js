// @ts-check
import { MAP_WIDTH, MAP_HEIGHT } from '../formats/woodsFile.js';
import { mineAt } from '../net/mine/mineSites.js';
import { t } from './textManager.js';

export const MINE_MARK_CSS = '#f68a20';
export const MINE_MARK_RGB = /** @type {const} */ ([246, 138, 32]);
export const mineLegendText = () => t('mine.mapLabel', 'Mine');

/**
 * @param {{ getClimateIndex: (x: number, y: number) => number }} maps
 * @param {ReadonlyMap<string, unknown>} locations
 */
export function createMineMapMarks(maps, locations) {
  /** @type {{ x: number, y: number, key: string }[] | undefined} */
  let candidates;
  /** @type {{ x: number, y: number, key: string }[]} */
  let marks = [];
  return () => {
    if (!candidates) {
      candidates = [];
      for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
          if (mineAt({ px: x, py: y, climate: maps.getClimateIndex(x, y), occupied: false })) {
            candidates.push({ x, y, key: `${x},${y}` });
          }
        }
      }
    }
    const next = candidates.filter(({ key }) => !locations.has(key));
    if (next.length !== marks.length || next.some((mark, i) => mark !== marks[i])) marks = next;
    return marks;
  };
}
