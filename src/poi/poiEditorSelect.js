// @ts-check
// What the in-game POI editor's cursor selects beyond a part's triangles (scenes/poiEditorHost.js calls these): a person
// under the ray, the things inside a dragged box, the box drawn on the screen, and the editor's own view of the working
// set (hidden rows left out). DOM-free, as the host is.

import { quatRotate } from '../world/quat.js';
import { projectToScreen } from '../player/tapRay.js';
import { canvasPoint } from '../player/travelPick.js';
import { find, marksOf, nodeId, viewDoc } from './poiScene.js';

/** How near a ray must pass a person's upright line to pick them (meters, at a POI size of one). */
export const POI_NPC_PICK_M = 0.45;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A row's spot in the scene frame, from its POI's origin. @param {any} doc @param {number[]} origin @param {number[]} t */
export const spotOf = (doc, origin, t) => add(origin, mul(quatRotate(doc.place.r, t), doc.place.s));

/** Where a person stands and how tall they are drawn, in the scene frame. */
export function npcLine(doc, origin, n) {
  const feet = spotOf(doc, origin, n.t);
  return { feet, head: add(feet, [0, (Number(n.h) || 1.8) * doc.place.s, 0]) };
}

/** The nearest person of `doc` whose upright line the ray passes within reach, not hidden or locked: `{ key, dist }` or
 *  null. @param {number[]} o @param {number[]} d a unit direction */
export function pickNpc(doc, origin, o, d, max = 6000) {
  const marks = marksOf(doc);
  let best = null;
  (doc.npcs ?? []).forEach((n, i) => {
    if (!n || !Array.isArray(n.t)) return;
    const m = marks.get(nodeId('npc', doc, i));
    if (m?.hidden || m?.frozen) return;
    const { feet, head } = npcLine(doc, origin, n);
    // the closest approach of the ray to the segment feet..head
    const u = sub(head, feet), w = sub(feet, o);
    const a = dot(u, u), b = dot(u, d), c = dot(d, d), dd = dot(u, w), e = dot(d, w);
    const den = a * c - b * b;
    let s = den > 1e-9 ? (b * e - c * dd) / den : 0;
    s = Math.min(1, Math.max(0, s));
    const p = add(feet, mul(u, s));
    const tRay = dot(sub(p, o), d);
    if (tRay <= 0 || tRay > max) return;
    const gap = Math.hypot(...sub(add(o, mul(d, tRay)), p));
    if (gap <= POI_NPC_PICK_M * Math.max(1, doc.place.s) && (!best || tRay < best.dist)) best = { key: n.key, dist: tRay };
  });
  return best;
}

/**
 * Returns the IDs of unlocked, visible rows in `doc` whose centers project inside screen rectangle `r` (in canvas
 * pixels): parts by the center of their bounding box (`boxOf(key)`), lights by their position, NPCs at half height, and
 * flat pictures by their placement position.
 * @param {any} doc @param {number[]} origin @param {{ x0: number, y0: number, x1: number, y1: number }} r
 * @param {any} v the frame (proj, view, w, h, rect) @param {(key: string) => (number[] | null)} boxOf
 */
export function rowsInRect(doc, origin, r, v, boxOf) {
  const lo = [Math.min(r.x0, r.x1), Math.min(r.y0, r.y1)], hi = [Math.max(r.x0, r.x1), Math.max(r.y0, r.y1)];
  const marks = marksOf(doc);
  const inside = (p) => { const s = projectToScreen(p, v.w, v.h, v.proj, v.view, v.rect ?? null); return s.front && s.x >= lo[0] && s.x <= hi[0] && s.y >= lo[1] && s.y <= hi[1]; };
  const out = [];
  const ok = (id) => { const m = marks.get(id); return !!m && !m.hidden && !m.frozen; };
  (doc.parts ?? []).forEach((p, i) => {
    const id = nodeId('part', doc, i);
    const b = ok(id) ? boxOf(p.key) : null;
    if (b && inside([(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2])) out.push(id);
  });
  (doc.lights ?? []).forEach((l, i) => { const id = `light:${i}`; if (ok(id) && Array.isArray(l?.t) && inside(spotOf(doc, origin, l.t))) out.push(id); });
  (doc.npcs ?? []).forEach((n, i) => {
    const id = nodeId('npc', doc, i);
    if (!ok(id) || !Array.isArray(n?.t)) return;
    const { feet, head } = npcLine(doc, origin, n);
    if (inside(mul(add(feet, head), 0.5))) out.push(id);
  });
  (doc.flats ?? []).forEach((f, i) => { const id = nodeId('flat', doc, i); if (ok(id) && Array.isArray(f?.t) && inside(spotOf(doc, origin, f.t))) out.push(id); });
  return out;
}

/** The rows a box dragged from `from` to `to` (client px) holds: those of the held POI, or with none held, of the open
 *  POI with the most inside it. Answers `{ id, got }`, or null. `originOf` a document's origin in the scene frame. */
export function boxPick({ edit, host, frame, originOf }, from, to) {
  if (!frame) return null;
  const [x0, y0] = canvasPoint(from[0], from[1], frame.canvasRect), [x1, y1] = canvasPoint(to[0], to[1], frame.canvasRect);
  const sel = edit.selection();
  let best = null;
  for (const id of sel ? [sel.id] : edit.ids()) {
    const doc = edit.docOf(id), o = doc ? originOf(doc) : null;
    if (!doc || !o || edit.shownAs?.(id) !== undefined) continue;
    const got = rowsInRect(doc, o, { x0, y0, x1, y1 }, frame, (key) => host.partOf(id, key)?.box ?? null);
    if (!best || got.length > best.got.length) best = { id, got };
  }
  return best;
}

/** How far a row of a POI must go up (world meters) for its bottom to stand on the game's ground under it (poi/
 *  poiArrange.js groundNodes): a part by its drawn box, anything else by its spot. Null while that ground is not built. */
export function liftOf({ edit, host, originOf, surfaceAt }, id, rowId) {
  const doc = edit.docOf(id), o = doc ? originOf(doc) : null, f = doc ? find(doc, rowId) : null;
  if (!o || !f || !Array.isArray(f.row.t)) return null;
  const at = spotOf(doc, o, f.row.t);
  const box = f.kind === 'part' ? host.partOf(id, f.row.key)?.box : null;
  const ground = surfaceAt(at[0], at[2]);
  return Number.isFinite(ground) ? ground - (box ? box[1] : at[1]) : null;
}

/** The working set's overlay (poiEdit.js overlay) as the open editor draws it: each document without its hidden rows.
 *  @param {Map<string, any>} overlay */
export function editorView(overlay) {
  const out = new Map();
  for (const [id, e] of overlay) out.set(id, e && e.doc ? { ...e, doc: viewDoc(e.doc) } : e);
  return out;
}

/** A screen rect's outline as lines a meter in front of the eye, through the rays at its corners (`rayAt`). */
export function rectLines(r, rayAt, color) {
  const corners = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]].map(([x, y]) => { const ray = rayAt(x, y); return ray ? add(ray.o, ray.d) : null; });
  if (corners.some((c) => !c)) return [];
  return corners.map((a, i) => ({ a, b: /** @type {number[]} */ (corners[(i + 1) % 4]), color }));
}
