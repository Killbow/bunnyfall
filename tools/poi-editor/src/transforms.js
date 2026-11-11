// @ts-check

// Moving, turning and sizing scene nodes, in the POI's own frame (metres, +x east, +y up, +z north). Pure: the editor
// runs these inside one poiEdit step, so a drag or a numeric entry is one undo. A node that has no turn (a light) or
// no size (a person) is moved only. Frozen nodes are never changed.

import { quatMultiply, quatAngleAxis, quatRotate } from '../../../src/world/quat.js';
import { tidyQuat } from '../../../src/poi/poiEdit.js';
import { find, buildTree } from './scene.js';

const r3 = (v) => Math.round(v * 1000) / 1000;

/** The ids among `ids` that may change: not hidden, not frozen, not groups (a group moves by its members). */
export function movable(doc, ids) {
  const ok = new Set();
  const walk = (ns) => ns.forEach((n) => { if (n.kind !== 'group' && !n.frozen) ok.add(n.id); walk(n.children); });
  walk(buildTree(doc));
  const asked = new Set(ids);
  const walkG = (ns, inside) => ns.forEach((n) => { const i = inside || asked.has(n.id); if (n.kind !== 'group' && i && !n.frozen) asked.add(n.id); walkG(n.children, i); });
  walkG(buildTree(doc), false);
  return [...asked].filter((i) => ok.has(i));
}

const rowsOf = (doc, ids) => movable(doc, ids).map((id) => find(doc, id)).filter(Boolean);

/** The mean position of the nodes, or null. */
export function centroid(doc, ids) {
  const rows = rowsOf(doc, ids).filter((f) => f?.row.t);
  if (!rows.length) return null;
  const s = [0, 0, 0];
  for (const f of rows) for (let k = 0; k < 3; k++) s[k] += f?.row.t[k];
  return s.map((v) => v / rows.length);
}

/** Move by a world delta. Answers how many nodes moved. */
export function moveNodes(doc, ids, d) {
  let n = 0;
  for (const f of rowsOf(doc, ids)) { if (!f?.row.t) continue; f.row.t = f.row.t.map((c, k) => r3(c + d[k])); n++; }
  return n;
}

/** Turn about a world axis through `pivot` (default: the nodes' centre). */
export function turnNodes(doc, ids, axis, deg, pivot = centroid(doc, ids)) {
  const q = quatAngleAxis(deg, axis);
  const ax = axis.map(Math.abs);
  const k = ax[0] > 0.5 ? 0 : ax[1] > 0.5 ? 1 : 2;
  let n = 0;
  for (const f of rowsOf(doc, ids)) {
    if (!f) continue;
    const row = f.row;
    if (pivot && row.t) row.t = quatRotate(q, row.t.map((c, i) => c - pivot[i])).map((c, i) => r3(c + pivot[i]));
    if (f.kind === 'part') row.r = tidyQuat(quatMultiply(q, row.r));
    else if (f.kind === 'flat') row.rot = row.rot.map((c, i) => (i === k ? r3(c + (axis[k] < 0 ? -deg : deg)) : c));
    else if (f.kind === 'npc' && k === 1) row.yaw = r3((row.yaw ?? 0) + (axis[1] < 0 ? -deg : deg));
    n++;
  }
  return n;
}

/** Size by factors along x, y, z (parts) or the mean factor (flats). People and lights keep their size. */
export function sizeNodes(doc, ids, f) {
  let n = 0;
  const mean = (f[0] + f[1] + f[2]) / 3;
  for (const x of rowsOf(doc, ids)) {
    if (!x) continue;
    if (x.kind === 'part') { x.row.s = x.row.s.map((c, i) => r3(Math.max(0.01, c * f[i]))); n++; }
    else if (x.kind === 'flat' && !isFigure(x.row)) { x.row.scale = r3(Math.min(4, Math.max(0.25, x.row.scale * mean))); n++; }
  }
  return n;
}

/** A flat picture of a person keeps its scale (the law says 1). */
export const isFigure = (flat) => flat.kind === 'billboard' && Array.isArray(flat.flat) && [334, 346, 357, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184].includes(flat.flat[0]);

/** Put nodes back to no turn and no size, where the kind has them. */
export function resetNodes(doc, ids) {
  let n = 0;
  for (const x of rowsOf(doc, ids)) {
    if (!x) continue;
    if (x.kind === 'part') { x.row.r = [0, 0, 0, 1]; x.row.s = [1, 1, 1]; n++; }
    else if (x.kind === 'flat') { x.row.rot = [0, 0, 0]; if (!isFigure(x.row)) x.row.scale = 1; n++; }
    else if (x.kind === 'npc') { x.row.yaw = 0; n++; }
  }
  return n;
}

/** Set one number of a node exactly (the inspector's field). `path` like `t.1`, `scale`, `yaw`. */
export function setNumber(doc, id, path, value) {
  const f = find(doc, id);
  if (!f || !Number.isFinite(value)) return false;
  const [k, i] = path.split('.');
  if (i === undefined) f.row[k] = r3(value);
  else if (Array.isArray(f.row[k])) f.row[k][Number(i)] = r3(value);
  else return false;
  return true;
}

/** Put the nodes on the ground plane of the POI (height 0), or on `y`. */
export function groundNodes(doc, ids, y = 0) {
  let n = 0;
  for (const f of rowsOf(doc, ids)) if (f?.row.t) { f.row.t = [f.row.t[0], r3(y), f.row.t[2]]; n++; }
  return n;
}

/** Align nodes along an axis index (0 x, 1 y, 2 z) to the `min`, `mid` or `max` of their positions. */
export function alignNodes(doc, ids, axis, mode) {
  const rows = rowsOf(doc, ids).filter((f) => f?.row.t);
  if (rows.length < 2) return 0;
  const v = rows.map((f) => f?.row.t[axis]);
  const target = mode === 'min' ? Math.min(...v) : mode === 'max' ? Math.max(...v) : (Math.min(...v) + Math.max(...v)) / 2;
  for (const f of rows) f?.row.t.splice(axis, 1, r3(target));
  return rows.length;
}

/** Spread nodes evenly along an axis between the outermost two. */
export function distributeNodes(doc, ids, axis) {
  const rows = rowsOf(doc, ids).filter((f) => f?.row.t).sort((a, b) => a?.row.t[axis] - b?.row.t[axis]);
  if (rows.length < 3) return 0;
  const a = rows[0]?.row.t[axis], b = rows[rows.length - 1]?.row.t[axis];
  rows.forEach((f, i) => f?.row.t.splice(axis, 1, r3(a + ((b - a) * i) / (rows.length - 1))));
  return rows.length;
}

/** A value snapped to a step (0 or less: no snap). */
export const snap = (v, step) => (step > 0 ? Math.round(v / step) * step : v);
