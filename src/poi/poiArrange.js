// @ts-check
// Arranging scene nodes in a POI's own frame (meters, +x east, +y up, +z north before the POI's turn): align, distribute,
// reset the turn and size, move by an amount, and drop to the ground. Pure: the editor runs each inside one poiEdit
// step, so it is one undo. Locked rows are never changed (poiScene.js movable), and a group stands for what is in it.
// The ground is the game's own: the caller measures it (scenes/poiEditorHost.js, through the world's surfaceAt) and
// hands each row's lift in.
//
// Ported from the World Builder (tools/poi-editor/src/transforms.js), whose ground is its own base terrain.

import { find, movable } from './poiScene.js';
import { movePart } from './poiEdit.js';

const r4 = (v) => { const r = Math.round(v * 1e4) / 1e4; return r === 0 ? 0 : r; };
const rowsOf = (doc, ids) => movable(doc, ids).map((id) => ({ id, ...find(doc, id) })).filter((f) => Array.isArray(f.row?.t) && f.row.t.length === 3);

/** The mean position of the rows, or null. @param {any} doc @param {string[]} ids */
export function centroid(doc, ids) {
  const rows = rowsOf(doc, ids);
  if (!rows.length) return null;
  const s = [0, 0, 0];
  for (const f of rows) for (let k = 0; k < 3; k++) s[k] += f.row.t[k];
  return s.map((v) => v / rows.length);
}

/** Move by `d` in the POI's own frame. Answers how many rows moved. @param {any} doc @param {string[]} ids @param {number[]} d */
export function moveNodes(doc, ids, d) {
  let n = 0;
  for (const f of rowsOf(doc, ids)) { f.row.t = f.row.t.map((c, k) => r4(Math.min(2000, Math.max(-2000, c + (d[k] ?? 0))))); n++; }
  return n;
}

/** A flat picture of a person keeps its scale (the law says 1), by its Daggerfall archive. @param {any} flat */
export const isFigure = (flat) => flat?.kind === 'billboard' && Array.isArray(flat.flat) && [334, 346, 357, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184].includes(flat.flat[0]);

/** Put parts back to no turn and a size of one, and flats back to no turn and (but figures) a scale of one. People and
 *  lights have neither. Answers how many rows changed. */
export function resetNodes(doc, ids) {
  let n = 0;
  for (const f of rowsOf(doc, ids)) {
    if (f.kind === 'part') { f.row.r = [0, 0, 0, 1]; f.row.s = [1, 1, 1]; n++; }
    else if (f.kind === 'flat') { f.row.rot = [0, 0, 0]; if (!isFigure(f.row)) f.row.scale = 1; n++; }
  }
  return n;
}

/** Align the rows along an axis (0 x, 1 y, 2 z) to the `min`, `mid`, or `max` of their positions. Two at least. */
export function alignNodes(doc, ids, axis, mode) {
  const rows = rowsOf(doc, ids);
  if (rows.length < 2) return 0;
  const v = rows.map((f) => f.row.t[axis]);
  const target = mode === 'min' ? Math.min(...v) : mode === 'max' ? Math.max(...v) : (Math.min(...v) + Math.max(...v)) / 2;
  for (const f of rows) f.row.t = f.row.t.map((c, k) => (k === axis ? r4(target) : c));
  return rows.length;
}

/** Spread the rows evenly along an axis between the outermost two. Three at least. */
export function distributeNodes(doc, ids, axis) {
  const rows = rowsOf(doc, ids).sort((a, b) => a.row.t[axis] - b.row.t[axis]);
  if (rows.length < 3) return 0;
  const a = rows[0].row.t[axis], b = rows[rows.length - 1].row.t[axis];
  rows.forEach((f, i) => { f.row.t = f.row.t.map((c, k) => (k === axis ? r4(a + ((b - a) * i) / (rows.length - 1)) : c)); });
  return rows.length;
}

/**
 * Drop rows to the ground: `lift(id, row)` answers how far up (world meters, negative down) the row must go for its
 * bottom to stand on the ground under it, or null when that ground is not known (not built yet, or the row has no
 * bottom: a light stays where it shines from). Answers how many rows moved.
 * @param {any} doc @param {string[]} ids @param {(id: string, row: any) => (number | null)} lift
 */
export function groundNodes(doc, ids, lift) {
  let n = 0;
  for (const f of rowsOf(doc, ids)) {
    if (f.kind === 'light') continue;
    const dy = lift(f.id, f.row);
    if (dy == null || !Number.isFinite(dy)) continue;
    movePart(doc.place, f.row, [0, dy, 0]);
    n++;
  }
  return n;
}
