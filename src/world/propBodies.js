// @ts-check
// Collision bodies for solid props: DFU flats have no collider, so a solid flat gets an upright cylinder.
import { NOT_COVER_ARCHIVES, COVER_RADIUS_FRAC, COVER_HEIGHT_FRAC, COVER_TRUNK_R, COVER_CROWN_FROM } from '../ai/cover.js';
import { responseByte, RESPONSE } from '../weather/windfall.js';
import { JUNGLE_MEASURES } from './jungle/jungleModels.js';
import { isNatureArchive } from './rmbFlats.js';
import { STEP_OFFSET, CAPSULE_HEIGHT } from '../player/motor.js';

export function flatBody(c, t, archive, record, size, { tree = false } = {}) {
  if (NOT_COVER_ARCHIVES.has(archive) || c?.noCover) return null;
  const w = size?.w ?? 0, h = size?.h ?? 0;
  const sway = isNatureArchive(archive) ? responseByte(archive, record) : 0;
  if (tree || sway === RESPONSE.full) return body(c, Math.min(w * COVER_RADIUS_FRAC, COVER_TRUNK_R), h * COVER_CROWN_FROM);
  if (sway !== 0) return null;
  return body(c, (footShare(t, record, size) * w) / 2, h * COVER_HEIGHT_FRAC);
}
const body = (c, r, h) => (r > 0 && h >= STEP_OFFSET ? { c, r, h, lift: 0, body: true, _mark: 0 } : null);

export function flatBodies(t, archive, record, size, centers, opts = {}) {
  const out = [];
  for (const c of centers) { const b = flatBody(c, t, archive, record, size, opts); if (b) out.push(b); }
  return out;
}

const _feet = new WeakMap();
/**
 * @param {any} t
 * @param {number} record
 * @param {{ w: number, h: number }} size
 */
export function footShare(t, record, size) {
  if (!t?.getDFBitmap || !(size?.h > 0)) return 2 * COVER_RADIUS_FRAC;
  let known = _feet.get(t);
  if (!known) _feet.set(t, (known = new Map()));
  const key = `${record}:${size.h.toFixed(3)}`;
  if (known.has(key)) return known.get(key);
  const bmp = t.getDFBitmap(record, 0);
  let share = 2 * COVER_RADIUS_FRAC;
  const solid = bmp?.data ? (/** @type {number} */ i) => bmp.data[i] !== 0 : bmp?.rgba?.length >= bmp?.width * bmp?.height * 4 ? (/** @type {number} */ i) => bmp.rgba[i * 4 + 3] !== 0 : null;
  if (solid && bmp.width > 0 && bmp.height > 0) {
    const perRow = size.h / bmp.height, spans = [];
    const lo = Math.max(0, bmp.height - Math.round(Math.min(size.h, CAPSULE_HEIGHT) / perRow)), hi = bmp.height - 1 - Math.round(STEP_OFFSET / perRow);
    for (let y = lo; y <= hi; y++) {
      let n = 0;
      for (let x = 0; x < bmp.width; x++) if (solid(y * bmp.width + x)) n++;
      spans.push(n / bmp.width);
    }
    if (spans.length) { spans.sort((p, q) => p - q); share = spans[spans.length >> 1]; }
  }
  known.set(key, share);
  return share;
}

export function jungleBody(c, species, scale) {
  const m = JUNGLE_MEASURES[species];
  return { c, r: m.trunk * scale, h: m.crownFrom * scale, lift: 0, body: true, _mark: 0 };
}
