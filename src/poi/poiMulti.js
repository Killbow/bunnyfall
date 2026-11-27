// @ts-check

import { quatAngleAxis, quatRotate } from '../world/quat.js';
import { movePart, rotatePart, scalePart } from './poiEdit.js';
import { find, parseId } from './poiScene.js';
import { turnFlatRow, scaleFlatRow } from './poiFlatRows.js';

const conj = (q) => [-q[0], -q[1], -q[2], q[3]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const r4 = (v) => { const r = Math.round(v * 1e4) / 1e4; return r === 0 ? 0 : r; };
const clampT = (v) => Math.min(2000, Math.max(-2000, v));

/** @param {string[]} items */
export const singleItem = (items) => items.length === 1 && ['part', 'light'].includes(parseId(items[0]).kind);

/** @param {string[]} ids */
export function kindsOf(ids) {
  let parts = 0, others = 0;
  for (const id of ids) { if (parseId(id).kind === 'part') parts++; else others++; }
  return { parts, others };
}

/**
 * @param {any} doc
 * @param {string[]} ids
 */
export function pivotOf(doc, ids) {
  const s = [0, 0, 0];
  let n = 0;
  for (const id of ids) { const t = find(doc, id)?.row?.t; if (Array.isArray(t) && t.length === 3) { for (let k = 0; k < 3; k++) s[k] += t[k]; n++; } }
  return n ? s.map((v) => v / n) : null;
}

/**
 * @param {any} doc
 * @param {string[]} ids
 * @param {{ move?: number[], turn?: { axis: number[], deg: number }, size?: number[] }} r
 * @param {{ pivot: number[], axes: number[][] }} at
 */
export function applyMulti(doc, ids, r, { pivot, axes }) {
  const place = doc.place;
  const rows = ids.map((id) => find(doc, id)).filter((f) => f && Array.isArray(f.row?.t));
  if (r.move) for (const f of rows) movePart(place, f?.row, r.move);
  if (r.turn && r.turn.deg) {
    const local = quatRotate(conj(place.r), r.turn.axis);
    const q = quatAngleAxis(r.turn.deg, local);
    for (const f of rows) {
      if (!f) continue;
      const off = f.row.t.map((c, k) => c - pivot[k]);
      f.row.t = quatRotate(q, off).map((c, k) => r4(clampT(c + pivot[k])));
      if (f.kind === 'part') rotatePart(place, f.row, r.turn.axis, r.turn.deg);
      else if (f.kind === 'flat') turnFlatRow(place, f.row, r.turn.axis, r.turn.deg);
    }
  }
  if (r.size && r.size.some((x) => x !== 1)) {
    const la = axes.map((a) => quatRotate(conj(place.r), a));
    for (const f of rows) {
      if (!f) continue;
      const off = f.row.t.map((c, k) => c - pivot[k]);
      const sized = [0, 0, 0];
      for (let j = 0; j < 3; j++) { const c = dot(off, la[j]) * r.size[j]; for (let k = 0; k < 3; k++) sized[k] += la[j][k] * c; }
      f.row.t = sized.map((c, k) => r4(clampT(c + pivot[k])));
      if (f.kind === 'part') {
        const own = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((e) => quatRotate(f.row.r, e));
        scalePart(f.row, own.map((a) => { let best = 0, j0 = 0; for (let j = 0; j < 3; j++) { const d = Math.abs(dot(a, la[j])); if (d > best) { best = d; j0 = j; } } return r.size?.[j0] ?? 1; }));
      } else if (f.kind === 'flat') scaleFlatRow(f.row, r.size.find((x) => x !== 1) ?? 1);
    }
  }
}
