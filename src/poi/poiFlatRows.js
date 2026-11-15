// @ts-check
// Pure helpers for a POI's flat-picture rows (`flats`, poiLawV2.js), shared by the runtime and the in-game editor.
// Computes how a row's facing and a mount's frame rotate with the POI's placement (used by scenes/poiFlats.js), and
// implements editor operations for creating, rotating, scaling, and mirroring rows. The editor runs mutating helpers
// inside poiEdit's `edit` so each operation is a single undo step. Uses no DOM, WebGL, or item tables.

import { decorMountFrame, decorFlatMirrored } from '../net/decorLaw.js';
import { quatAngleAxis, quatRotate } from '../world/quat.js';
import { POI_V2_LIMITS, POI_V2_PINS as P } from './poiLawV2.js';
import { freshKey } from './poiScene.js';
import { worldToPlace, selectionOf } from './poiEdit.js';

const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const r4 = (v) => { const r = Math.round(v * 1e4) / 1e4; return r === 0 ? 0 : r; };
const r3 = (v) => { const r = Math.round(v * 1e3) / 1e3; return r === 0 ? 0 : r; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const conj = (q) => [-q[0], -q[1], -q[2], q[3]];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Wraps an angle in degrees into the range (-180, 180]. */
export const wrapDeg = (d) => { let v = d % 360; if (v > 180) v -= 360; if (v <= -180) v += 360; return v; };

/** Rotates a row's horizontal facing (`yaw`, in degrees around the Y axis) by quaternion `q` and returns the new
 *  heading in (-180, 180]. If the rotated forward vector points straight up or down, returns the original `yaw`. */
export function flatYawThrough(q, yaw) {
  const own = Number.isFinite(yaw) ? yaw : 0;
  const d = quatRotate(q, [Math.sin(own * RAD), 0, Math.cos(own * RAD)]);
  if (Math.hypot(d[0], d[2]) < 1e-9) return r4(wrapDeg(own));
  return r4(wrapDeg(Math.atan2(d[0], d[2]) * DEG));
}

/**
 * Rotates a mount's `[heading, tilt, spin]` Euler angles (in degrees, net/decorLaw.js decorMountFrame) by quaternion
 * `q`. Computes the exact angles for the rotated frame: heading and tilt come from the rotated normal, and spin comes
 * from the rotated right vector.
 */
export function mountRotThrough(q, rot) {
  const f = decorMountFrame(rot);
  const n = quatRotate(q, f.normal), right = quatRotate(q, f.right);
  const pitch = Math.asin(clamp(n[1], -1, 1));
  const yaw = Math.atan2(n[0], n[2]);
  const r0 = [-Math.cos(yaw), 0, Math.sin(yaw)];
  const u0 = cross(r0, n);
  const spin = Math.atan2(-dot(right, u0), dot(right, r0));
  return [r4(yaw * DEG), r4(pitch * DEG), r4(spin * DEG)];
}

/** Returns whether a row is a billboard from one of Daggerfall's person archives, which the schema holds at scale 1.
 *  @param {any} row */
export const isFigureRow = (row) => row?.kind === 'billboard' && Array.isArray(row.flat) && P.npcFlatArchives.includes(row.flat[0]);

/** Returns whether an item hangs flat as a mount (any weapon except arrows, any armor, or a trophy). @param {any} it */
export const itemHangs = (it) => !!it && (it.t === P.trophyTemplate || (it.g === P.decorWeaponsGroup && it.t !== P.decorArrowTemplate) || it.g === P.decorArmorGroup);

/** Returns whether a row renders horizontally mirrored under POI placement `place`. Billboards and paperdoll items
 *  mirror when their world-space facing exceeds 90 degrees from 0 (net/decorLaw.js decorFlatMirrored); mounts never
 *  mirror. */
export function flatMirrored(row, place) {
  if (!row || row.kind === 'mount') return false;
  const yaw = flatYawThrough(Array.isArray(place?.r) ? place.r : [0, 0, 0, 1], row.rot?.[0]);
  return decorFlatMirrored({ flat: [0, 0], rot: [yaw, 0, 0] });
}

/** Default height offset in meters (in POI space) from the clicked ground point to a newly placed mount's center. */
export const POI_FLAT_MOUNT_LIFT_M = 1;
/** Returns whether `doc` is below the maximum number of flat-picture rows allowed by the schema. @param {any} doc */
export const flatRoom = (doc) => (Array.isArray(doc?.flats) ? doc.flats.length : 0) < POI_V2_LIMITS.flats;

/**
 * Builds a new flat row `{ key, name?, kind, flat?, item?, t, rot, scale, layer, collide, light? }` with a unique key
 * for `doc` (without inserting it). Items use kind `'mount'` when they hang and `'paperdoll'` otherwise. A mount starts
 * upright with its center `POI_FLAT_MOUNT_LIFT_M` above the clicked point so it is ready to move onto a wall and is not
 * buried by winter ground snow.
 * @param {any} doc @param {{ kind?: string, flat?: number[] | null, item?: any, name?: string, t: number[], light?: any }} o
 */
export function newFlat(doc, { kind = 'billboard', flat = null, item = null, name = '', t, light = null }) {
  const isItem = !!item && kind !== 'billboard';
  const k = isItem ? (itemHangs(item) ? 'mount' : 'paperdoll') : 'billboard';
  const taken = new Set((doc?.flats ?? []).map((f) => f?.key));
  const key = freshKey(isItem ? `item-${item.t}` : `flat-${flat?.[0]}-${flat?.[1]}`, taken);
  /** @type {any} */
  const lift = k === 'mount' ? POI_FLAT_MOUNT_LIFT_M : 0;
  const row = { key, kind: k, t: t.map((c, i) => r3(clamp(c + (i === 1 ? lift : 0), -2000, 2000))), rot: [0, 0, 0], scale: 1, layer: 0, collide: false };
  const clean = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 64);
  if (clean) row.name = clean;
  if (isItem) {
    row.item = { t: item.t, ...(Number.isInteger(item.g) ? { g: item.g } : {}) };
    if (Array.isArray(flat)) row.flat = [flat[0], flat[1]];
  } else row.flat = [flat?.[0] ?? 0, flat?.[1] ?? 0];
  if (light) row.light = { color: [...light.color], radius: light.radius, intensity: light.intensity, flicker: !!light.flicker };
  return row;
}

/** Rotates a flat row around world-space `axis` by `deg` degrees. Billboards and paperdoll items rotate only around
 *  the vertical axis (which also controls mirroring); mounts rotate their full 3D frame. @param {any} place @param
 *  {any} row @param {number[]} axis @param {number} deg */
export function turnFlatRow(place, row, axis, deg) {
  if (!row || !Number.isFinite(deg) || !deg) return false;
  const local = quatRotate(conj(place.r), axis);
  const q = quatAngleAxis(deg, local);
  const rot = Array.isArray(row.rot) ? row.rot : [0, 0, 0];
  row.rot = row.kind === 'mount' ? mountRotThrough(q, rot) : [flatYawThrough(q, rot[0]), rot[1] ?? 0, rot[2] ?? 0];
  return true;
}

/** Multiplies a flat row's scale by `k`, clamped to the schema bounds; person sprites stay at scale 1. @param {any}
 *  row @param {number} k */
export function scaleFlatRow(row, k) {
  if (!row || isFigureRow(row) || !Number.isFinite(k) || k <= 0) return false;
  row.scale = r3(clamp((Number.isFinite(row.scale) ? row.scale : 1) * k, P.decorScaleMin, P.decorScaleMax));
  return true;
}

/** Sets whether a billboard or paperdoll item is mirrored under placement `place` by rotating its facing 180 degrees
 *  when needed. Mounts cannot be mirrored and return false. @param {any} place @param {any} row @param {boolean} on */
export function setFlatMirrored(place, row, on) {
  if (!row || row.kind === 'mount') return false;
  if (flatMirrored(row, place) === on) return true;
  const rot = Array.isArray(row.rot) ? row.rot : [0, 0, 0];
  row.rot = [r4(wrapDeg((rot[0] ?? 0) + 180)), rot[1] ?? 0, rot[2] ?? 0];
  return true;
}

/**
 * Places a pending flat picture (`want`, passed to `newFlat`) at scene position `at` on editor click
 * (scenes/poiEditorHost.js). Adds and selects the row in POI `sel` (default: the selected POI) as a single undo step.
 * When `sel` is null, it creates a new POI around `spot` and `lift`, named after the flat or `fallbackName`. It then
 * passes the new key to `want.onPlaced`. Returns false while the target POI's origin or ground height is not built.
 * @param {{ edit: any, originOf: (doc: any) => (number[] | null), at: number[], spot: { px: number, py: number, x: number, z: number },
 *   lift: number, ground: number, want: any, fallbackName?: string, sel?: { id: string } | null }} o
 */
export function placeFlatAt({ edit, originOf, at, spot, lift, ground, want, fallbackName = '', sel = edit.selection() }) {
  if (sel ? !originOf(edit.docOf(sel.id)) : !Number.isFinite(ground)) return false;
  let key = null;
  const fill = (doc) => {
    const o = originOf(doc);
    if (!o || !flatRoom(doc)) return;
    const row = newFlat(doc, { ...want, t: worldToPlace(doc.place, [at[0] - o[0], at[1] - o[1], at[2] - o[2]]) });
    (doc.flats ??= []).push(row);
    key = row.key;
  };
  const held = (id) => selectionOf(id, key ? [`flat:${key}`] : []);
  if (!sel) edit.create({ px: spot.px, py: spot.py, x: spot.x, z: spot.z, y: lift, name: want.name || fallbackName }, fill, held);
  else if (edit.edit(sel.id, 'add flat', fill) && key) edit.select(held(sel.id));
  if (key) want.onPlaced?.(key);
  return true;
}
