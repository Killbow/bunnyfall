// @ts-check

// Decorating a POI's interior: the room shell and the built-in pieces taken out of it, a flat's own light and where a
// hanging lantern's flame is, and hanging a mount on a surface. Pure: the editor runs each inside one poiEdit step.
// The names and limits are the game's (net/decorLaw.js, poi/poiLawV2.js): a built-in piece is `m<placement>:<model>` or
// `f<flat>:<archive>.<record>`, at most DECOR_HIDDEN_CAP of them, none twice.

import { DECOR_BASE_KEY_RE, DECOR_HIDDEN_CAP, decorBaseWhat, DECOR_MOUNT_LIFT } from '../../../src/net/decorLaw.js';
import { decorFlameLift } from '../../../src/systems/decor/decorFlame.js';
import { POI_V2_LIMITS } from '../../../src/poi/poiLawV2.js';

const r3 = (v) => Math.round(v * 1000) / 1000;
const HIDDEN_MAX = Math.min(DECOR_HIDDEN_CAP, POI_V2_LIMITS.hiddenBase ?? DECOR_HIDDEN_CAP);

/** The document's interior block as it stands: `{ shellModel, hiddenBaseKeys }`, never undefined. */
export const interiorOf = (doc) => ({ shellModel: doc?.interior?.shellModel ?? null, hiddenBaseKeys: [...(doc?.interior?.hiddenBaseKeys ?? [])] });

function block(doc) {
  if (!doc.interior) doc.interior = { shellModel: null, hiddenBaseKeys: [] };
  if (!Array.isArray(doc.interior.hiddenBaseKeys)) doc.interior.hiddenBaseKeys = [];
  return doc.interior;
}

/** Drop an empty interior block, so a POI that decorates nothing keeps none. */
function tidy(doc) { const i = doc.interior; if (i && i.shellModel == null && !i.hiddenBaseKeys.length) delete doc.interior; }

/** Set (a whole number of ARCH3D's models, 1 to 999999) or clear (null) the room shell. Answers `{ ok } or { refused }`. */
export function setShell(doc, id) {
  if (id !== null && !(Number.isInteger(id) && id >= 1 && id <= 999999)) return { refused: 'A shell is a Daggerfall model number from 1 to 999999.' };
  const i = block(doc); i.shellModel = id; tidy(doc);
  return { ok: true };
}

/** A built-in piece's name, read: `{ kind: 'model', model }`, `{ kind: 'flat', archive, record }` or null. */
export function describeBase(key) {
  const w = decorBaseWhat(key);
  if (!w) return null;
  return w.model != null ? { kind: 'model', model: w.model } : { kind: 'flat', archive: w.flat[0], record: w.flat[1] };
}

export const baseKeyWhy = (key) => (typeof key !== 'string' || !DECOR_BASE_KEY_RE.test(key) ? 'A built-in piece is named m<placement>:<model> for a model or f<flat>:<archive>.<record> for a picture, for example m12:456 or f3:200.4.' : '');

/** Take a built-in piece out of the room. */
export function hideBase(doc, key) {
  const why = baseKeyWhy(key);
  if (why) return { refused: why };
  const i = block(doc);
  if (i.hiddenBaseKeys.includes(key)) { tidy(doc); return { refused: 'That piece is already taken out.' }; }
  if (i.hiddenBaseKeys.length >= HIDDEN_MAX) { tidy(doc); return { refused: `A room may keep at most ${HIDDEN_MAX} built-in pieces taken out.` }; }
  i.hiddenBaseKeys.push(key);
  return { ok: true };
}

/** Put a built-in piece back. */
export function showBase(doc, key) {
  const i = doc.interior;
  if (!i?.hiddenBaseKeys?.includes(key)) return { refused: 'That piece is not taken out.' };
  i.hiddenBaseKeys = i.hiddenBaseKeys.filter((k) => k !== key); tidy(doc);
  return { ok: true };
}

/** Put every built-in piece back. */
export function showAllBase(doc) { if (doc.interior) { doc.interior.hiddenBaseKeys = []; tidy(doc); } return { ok: true }; }

// ── a flat's own light ──
export const LIGHT_DEFAULT = Object.freeze({ color: [1, 0.8, 0.5], radius: 8, intensity: 1, flicker: true });
export const LIGHT_LIMITS = Object.freeze({ radius: [1, 30], intensity: [0, 4] });

/** Give a flat a light (or remove it). Mounts and people may carry one like any flat. */
export function setFlatLight(row, on) {
  if (!row || !Array.isArray(row.t)) return false;
  if (on) row.light = row.light ?? { color: [...LIGHT_DEFAULT.color], radius: LIGHT_DEFAULT.radius, intensity: LIGHT_DEFAULT.intensity, flicker: LIGHT_DEFAULT.flicker };
  else delete row.light;
  return true;
}

/** Change one field of a flat's light, kept inside the law's range. Answers whether it changed. */
export function editFlatLight(row, field, value) {
  const l = row?.light;
  if (!l) return false;
  if (field === 'color') { if (!Array.isArray(value) || value.length !== 3 || value.some((c) => !Number.isFinite(c))) return false; l.color = value.map((c) => r3(Math.min(1, Math.max(0, c)))); return true; }
  if (field === 'flicker') { l.flicker = !!value; return true; }
  const lim = /** @type {Record<string, number[]>} */ (LIGHT_LIMITS)[field];
  if (!lim || !Number.isFinite(value)) return false;
  l[field] = r3(Math.min(lim[1], Math.max(lim[0], value)));
  return true;
}

/**
 * Where a lit flat's light stands, in the POI's frame: at the flat's spot, lifted to the flame for a hanging lantern
 * (TEXTURE.210's chain lanterns - the game's decorFlameLift), at the picture's middle for any other. `heightM` is the
 * picture's height in metres, scale applied.
 */
export function lightSpot(row, heightM) {
  const t = row.t ?? [0, 0, 0];
  const pair = Array.isArray(row.flat) ? row.flat : null;
  const lift = pair && pair[0] === 210 ? decorFlameLift(pair[1], heightM) : null;
  const pivotY = row.pivot?.[1] ?? 0.5;
  const up = lift ?? heightM * (pivotY === 1 ? 0.5 : 0.5);
  return [t[0], r3(t[1] + up), t[2]];
}

// ── hanging a mount ──
/** The nearest hit of a ray on a box: `{ dist, point, normal }` (the normal of the face it hits), or null. Slab test. */
export function rayBox(origin, dir, lo, hi) {
  let tmin = -Infinity, tmax = Infinity, axis = -1, sign = 0;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(dir[k]) < 1e-12) { if (origin[k] < lo[k] || origin[k] > hi[k]) return null; continue; }
    let t1 = (lo[k] - origin[k]) / dir[k], t2 = (hi[k] - origin[k]) / dir[k], s = -1;
    if (t1 > t2) { [t1, t2] = [t2, t1]; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = k; sign = s; }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (tmin < 0 || axis < 0) return null;
  const normal = [0, 0, 0]; normal[axis] = sign;
  return { dist: tmin, point: origin.map((o, k) => o + dir[k] * tmin), normal };
}

/**
 * The turn [heading, tilt, spin] and spot that hang a mount on a surface whose normal is `normal`, at `point`: the picture
 * faces out along the normal (decorMountFrame's own: heading about up, tilt up from level) and stands DECOR_MOUNT_LIFT
 * off the surface so it wins the depth test.
 */
export function mountOnSurface(point, normal) {
  const l = Math.hypot(...normal) || 1, n = normal.map((c) => c / l);
  const yaw = (Math.atan2(n[0], n[2]) * 180) / Math.PI, pitch = (Math.asin(Math.max(-1, Math.min(1, n[1]))) * 180) / Math.PI;
  return { rot: [r3(yaw), r3(pitch), 0], t: point.map((c, k) => r3(c + n[k] * DECOR_MOUNT_LIFT)) };
}
