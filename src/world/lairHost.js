// @ts-check
import { bountyDungeons } from '../guilds/bountyBoard.js';
import { RUMOR_PX } from '../revenants/revenantFeud.js';
import { meshHasDungeonEntrance } from '../travel/travelDungeonModels.js';
import { layoutLocation } from './locationLayout.js';
import { isEnhanced } from '../ui/uiSkin.js';
import { wildMaskOf, wildInside } from './wildZone.js';
import { isOnlinePage } from '../platform/onlineLane.js';

/**
 * Returns null when no door was found but some model could not be read; `enterable` treats null as enterable.
 * @param {ReadonlyArray<{ layout?: { models?: ReadonlyArray<{ modelIdNum: number, enhancedOnly?: boolean }> } }>} blocks
 * @param {(id: number) => boolean | null} entranceOf
 * @param {boolean} [enhanced]
 * @returns {boolean | null}
 */
export function blocksPlaceEntrance(blocks, entranceOf, enhanced = false) {
  let unread = false;
  for (const b of blocks ?? []) {
    for (const m of b?.layout?.models ?? []) {
      if (m.enhancedOnly && !enhanced) continue;
      const e = entranceOf(m.modelIdNum);
      if (e === true) return true;
      if (e == null) unread = true;
    }
  }
  return unread ? null : false;
}

export const LAIR_MEND_PX = RUMOR_PX;

/** @param {{ maps: any, blocks: any, arch: { getRecordIndex: (id: number) => number, getMesh: (i: number) => any }, locations: Map<string, any>, dungeons: Map<string, string>, regions: Map<string, number>, here: () => { x: number, y: number }, enhanced?: () => boolean, layout?: typeof layoutLocation }} deps */
export function createLairDoor({ maps, blocks, arch, locations, dungeons, regions, here, enhanced = isEnhanced, layout = layoutLocation }) {
  const locationAt = (x, y) => locations.get(`${x},${y}`) ?? null;
  const dungeonAt = (x, y) => dungeons.get(`${x},${y}`) || null;
  const regionAt = (x, y) => regions.get(`${x},${y}`) ?? -1;
  /** @type {Map<number, boolean | null>} */
  const byModel = new Map();
  /** @type {Map<string, boolean>} */
  const byPixel = new Map();
  const entranceOf = (id) => {
    if (byModel.has(id)) return /** @type {boolean | null} */ (byModel.get(id));
    let v = null;
    try { const i = arch.getRecordIndex(id); const mesh = i === -1 ? null : arch.getMesh(i); v = mesh ? meshHasDungeonEntrance(mesh) : null; } catch { v = null; }
    byModel.set(id, v);
    return v;
  };
  // Online, a place inside the wild zone is never enterable. A place whose entrance cannot be read counts as
  // enterable.
  const enterable = (px, py) => {
    if (isOnlinePage() && wildInside(wildMaskOf(maps), px, py)) return false;
    const en = !!enhanced();
    const key = `${en ? 1 : 0}:${px},${py}`;
    const kept = byPixel.get(key);
    if (kept !== undefined) return kept;
    let v = true;
    try {
      const loc = locationAt(px, py);
      if (loc?.exterior?.exteriorData) v = blocksPlaceEntrance(layout(loc, maps, blocks, { enhanced: en, windmills: false }).blocks, entranceOf, en) !== false;
    } catch { v = true; }
    byPixel.set(key, v);
    return v;
  };
  const nearest = (px, py) => {
    let best = null, bestD = Infinity;
    for (let dy = -LAIR_MEND_PX; dy <= LAIR_MEND_PX; dy++) {
      for (let dx = -LAIR_MEND_PX; dx <= LAIR_MEND_PX; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy)), x = px + dx, y = py + dy;
        if (d === 0 || d >= bestD || x < 0 || y < 0 || x >= 1000 || y >= 500) continue;
        const name = dungeonAt(x, y);
        if (!name || !enterable(x, y)) continue;
        // Matches the lair shape revenantFeud.js sanitizeLair saves, including the 80-character name cap.
        best = { px: x, py: y, name: String(name).slice(0, 80), region: regionAt(x, y) };
        bestD = d;
      }
    }
    return best;
  };
  return function lairHere(at) {
    const { x, y } = at ?? here();
    let ring = null;
    return {
      px: x, py: y, enterable, nearest,
      get dungeons() { return (ring ??= bountyDungeons(x, y, dungeonAt).filter((d) => enterable(d.px, d.py)).map((d) => ({ ...d, region: regionAt(d.px, d.py) }))); },
    };
  };
}
