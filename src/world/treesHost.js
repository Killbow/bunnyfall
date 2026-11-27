// @ts-check
import { createLowPolyTrees } from '../mods/lowPolyTreesAssets.js';
import { buildTreeSet } from './lowPolyTrees.js';
import { FOREST_STAMP } from '../professions/treeHost.js';
import { FELLED } from '../ai/cover.js';

/**
 * @param {{ renderer: any, getTexture: (archive: number) => Promise<any>, seasons?: any, seasonsActive: () => boolean,
 *   lowPolyTreesOn: boolean, jungle?: any, breathe: () => Promise<void>, yards: () => any }} deps
 */
export function createTreesHost({ renderer, getTexture, seasons = null, seasonsActive, lowPolyTreesOn, jungle = null, breathe, yards }) {
  const lowPolyTrees = lowPolyTreesOn ? createLowPolyTrees({
    renderer, getTexture,
    seasonal: seasons ? {
      key: (a) => (seasonsActive() && !seasons.installing && seasons.lookup(a, 1) ? `s${seasons.installedSeason}.${seasons.generation}` : ''),
      picture: (a, r) => (seasonsActive() ? seasons.lookup(a, r)?.texture ?? null : null),
      generation: () => seasons.generation,
    } : null,
    breathe,
  }) : null;
  const jungleDoor = jungle?.door ?? null;
  const lptSway = new Map();
  const lptWindfall = new Map();
  const lptSets = [], jungleSets = [];
  const opts = { skip: (set, i) => FELLED.has(set.centers[i]), swayOf: (proto) => lptSway.get(proto) ?? 0, windfallOf: (proto) => lptWindfall.get(proto) ?? 0, stamp: 0, planes: null };
  const ready = (set, t) => {
    if (!set.trees) { const made = buildTreeSet(set.px, set.py, set.groups); set.trees = made.trees; set.centers = made.centers; }
    set.ox = t[0]; set.oy = t[1]; set.oz = t[2];
    return set;
  };
  const drop = (set) => { if (set?.trees) { set.trees = null; set.centers = null; } };
  return {
    lowPolyTrees, lptSway, lptWindfall,
    /**
     * @param {any[]} pixels
     * @param {ArrayLike<number>} eye
     * @param {Float32Array|null} planes
     */
    frame(pixels, eye, planes) {
      if (!lowPolyTrees && !jungleDoor) return;
      lptSets.length = 0; jungleSets.length = 0;
      for (let i = 0; i < pixels.length; i++) {
        const p = pixels[i], a = p.lowPolyTrees, b = p.jungleTrees;
        if (!a && !b) continue;
        if (p._dist2 > 2) { if (p._dist2 > 8) { drop(a); drop(b); } continue; }
        if (!p._t) continue;
        if (a && lowPolyTrees) lptSets.push(ready(a, p._t));
        if (b && jungleDoor) jungleSets.push(ready(b, p._t));
      }
      for (const set of yards()?.treeSets() ?? []) lptSets.push(set);
      opts.stamp = FOREST_STAMP.n;
      opts.planes = planes;
      lowPolyTrees?.frame(lptSets, eye[0], eye[1], eye[2], opts);
      jungleDoor?.frame(jungleSets, eye[0], eye[1], eye[2], opts);
    },
    released(p) {
      if (p.lowPolyTrees) for (const h of p.lowPolyTrees.handles) lowPolyTrees?.release(h);
      if (p.jungleTrees) for (const h of p.jungleTrees.handles) jungleDoor?.release(h);
    },
    releasedBuild(m) {
      for (const h of m.lptHandles ?? []) lowPolyTrees?.release(h);
      for (const h of m.jungleHandles ?? []) jungleDoor?.release(h);
    },
  };
}
