// @ts-check
// The in-game editor's per-frame drawings of the selection (scenes/poiEditorHost.js), made again only when
// they change, and the point a placing ray picks.

import { marksOf, movable } from './poiScene.js';
import { boxAlong } from './poiGizmoBox.js';

function drawnFrom() {
  let k = new Float64Array(64), n = 0, last = -1, same = false;
  const at = (i, v) => { if (k[i] !== v) { k[i] = v; same = false; } };
  return {
    start(/** @type {boolean} */ was) { n = 0; same = was; },
    add(/** @type {ArrayLike<number> | null | undefined} */ a, /** @type {number} */ m) {
      if (k.length < n + m + 1) { const g = new Float64Array((n + m + 1) * 2); g.set(k); k = g; same = false; }
      at(n++, a ? 1 : 0);
      if (a) for (let j = 0; j < m; j++) at(n++, a[j]);
    },
    fresh() { const ok = same && n === last; last = n; return ok; },
  };
}

/** @param {{ edit: any, host: any, boxLines: (b: number[], color: number[]) => any[], colors: Record<string, number[]> }} deps */
export function createSelectionBoxes({ edit, host, boxLines, colors }) {
  const from = drawnFrom(), set = { inWorld: /** @type {any[]} */ ([]), onTop: /** @type {any[]} */ ([]), picked: new Set(), marks: new Map() };
  let lastSel = null, lastGen = -1;
  return (/** @type {any} */ sel, /** @type {any} */ doc, /** @type {string[]} */ items) => {
    const seen = sel === lastSel && edit.generation() === lastGen;
    if (!seen) { lastSel = sel; lastGen = edit.generation(); set.picked = new Set(doc ? movable(doc, items) : []); set.marks = doc ? marksOf(doc) : new Map(); }
    from.start(seen);
    for (const p of doc?.parts ?? []) from.add(host.partOf(sel.id, p.key)?.box, 6);
    for (const f of doc?.flats ?? []) from.add(host.flatBox?.(sel.id, f?.key), 6);
    if (from.fresh()) return set;
    const { picked, marks } = set;
    set.inWorld.length = 0; set.onTop.length = 0;
    const boxed = [...(doc?.parts ?? []).map((p) => [`part:${p.key}`, host.partOf(sel.id, p.key)?.box]), ...(doc?.flats ?? []).map((f) => [`flat:${f?.key}`, host.flatBox?.(sel.id, f?.key)])];
    for (const [id, box] of boxed) {
      if (!box || marks.get(id)?.hidden) continue;
      const on2 = picked.has(id) || items.includes(id);
      const color = marks.get(id)?.frozen ? colors.locked : on2 ? colors.part : colors.poi;
      if (!items.length || on2) { set.inWorld.push(...boxLines(box, color)); set.onTop.push(...boxLines(box, [color[0], color[1], color[2], 0.22])); }
    }
    return set;
  };
}

/** @param {{ edit: any, host: any }} deps */
export function createSizeBox({ edit, host }) {
  const from = drawnFrom();
  let lastSel = null, lastGen = -1, last = /** @type {{ lo: number[], hi: number[] } | null} */ (null);
  return (/** @type {any} */ tg, /** @type {(tg: any) => number[][]} */ points) => {
    from.start(tg.sel === lastSel && edit.generation() === lastGen);
    from.add(tg.c, 3);
    for (const a of tg.axes) from.add(a, 3);
    const each = (/** @type {string} */ kind, /** @type {string} */ key) => {
      const p = kind === 'part' ? host.partOf(tg.sel.id, key) : null;
      if (p) { from.add(p.scene, 16); from.add(p.min, 3); from.add(p.max, 3); } else from.add(kind === 'flat' ? host.flatBox?.(tg.sel.id, key) : null, 6);
    };
    if (tg.multi) for (const id of tg.multi.ids) each(id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1));
    else if (tg.part) each('part', tg.part.key);
    else { for (const p of tg.doc.parts) each('part', p.key); for (const f of tg.doc.flats ?? []) each('flat', f?.key); }
    if (!from.fresh()) { last = boxAlong(tg.c, tg.axes, points(tg)); lastSel = tg.sel; lastGen = edit.generation(); }
    return last;
  };
}

/**
 * @param {{ o: number[], d: number[] }} ray
 * @param {(o: number[], d: number[]) => ({ point: number[] | null } | null)} groundHit
 * @param {(x: number, z: number) => number} surfaceAt
 * @param {number} rise
 */
export function pointUnder(ray, groundHit, surfaceAt, rise) {
  const g = groundHit(ray.o, ray.d)?.point ?? null;
  const bare = (/** @type {number[] | null} */ p) => !!p && Math.abs(p[1] - surfaceAt(p[0], p[2])) < 1e-6;
  if (!(rise > 0) || !bare(g)) return g;
  const h = groundHit([ray.o[0], ray.o[1] - rise, ray.o[2]], ray.d)?.point ?? null;
  return bare(h) ? h : g;
}
