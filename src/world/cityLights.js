// Each archive-210 flat gives one point light, as DFU RMBLayout AddLight does. `getScaledSize` returns world units,
// so `size.h` is added after the GLOBAL_SCALE multiply, which gives the same number as DFU.

import { RMB_DIMENSION } from '../formats/blocksFile.js';
import { GLOBAL_SCALE } from './meshReader.js';
import { lightList, packLight, adoptLight } from '../render/lightId.js';

export const LIGHTS_ARCHIVE = 210;
export const CITY_LIGHT_RANGE = 18;
export const LIGHT_CAP_FADE = 16;
export function capFadeColors(lit, lead, pos, cap, color, fade = LIGHT_CAP_FADE) {
  return capFade(lit, lead, pos, cap, color, 0, fade);
}
export function capFadePairs(lit, lead, pos, cap, colors, fade = LIGHT_CAP_FADE) {
  return capFade(lit, lead, pos, cap, colors, 3, fade);
}
function capFade(lit, lead, pos, cap, color, stride, fade) {
  const count = lit.length >> 2;
  if (count <= cap || lead >= cap) return null;
  const dist = (i) => Math.hypot(lit[i * 4] - pos[0], lit[i * 4 + 1] - pos[1], lit[i * 4 + 2] - pos[2]);
  const cut = dist(cap);
  const out = new Float32Array(cap * 3);
  for (let i = 0; i < cap; i++) {
    const share = i < lead ? 1 : Math.max(0, Math.min(1, (cut - dist(i)) / fade));
    const c = i * stride;
    out[i * 3] = color[c] * share; out[i * 3 + 1] = color[c + 1] * share; out[i * 3 + 2] = color[c + 2] * share;
  }
  return out;
}
// Keyed by map pixel, not pool index, so each lantern keeps its flicker when the pool refills in a different order.
export const lanternSlot = (px, py) => (Math.imul(px | 0, 73856093) ^ Math.imul(py | 0, 19349663)) >>> 0;
/**
 * @param {Iterable<{ px: number, py: number, lights: ArrayLike<ArrayLike<number>> }>} pixels
 * @param {(p: any) => ArrayLike<number>} translate
 * @param {Array<{ x: number, y: number, z: number }>} pool
 * @param {Float32Array} ranges
 * @param {ArrayLike<number>} animRanges
 * @param {((p: any) => (ArrayLike<ArrayLike<number>>|null)) | null} [extra]
 * @returns {{ n: number, ranges: Float32Array }}
 */
export function fillLanternPool(pixels, translate, pool, ranges, animRanges, extra = null) {
  let n = 0;
  for (const p of pixels) {
    const more = extra ? extra(p) : null;
    const m = more ? more.length : 0;
    if (!p.lights.length && !m) continue;
    const t = translate(p);
    ranges = rangesFor(ranges, n + p.lights.length + m);
    const slot0 = lanternSlot(p.px, p.py);
    for (let j = 0; j < p.lights.length + m; j++) {
      const l = j < p.lights.length ? p.lights[j] : more[j - p.lights.length];
      const e = pool[n] ?? (pool[n] = { x: 0, y: 0, z: 0 });
      e.x = l[0] + t[0]; e.y = l[1] + t[1]; e.z = l[2] + t[2];
      adoptLight(e, l);
      ranges[n] = animRanges[(slot0 + j) % animRanges.length];
      n++;
    }
  }
  return { n, ranges };
}
export function rangesFor(ranges, n) {
  if (ranges.length >= n) return ranges;
  const g = new Float32Array(Math.max(n, ranges.length * 2));
  g.set(ranges);
  return g;
}
export const CITY_LIGHT_INTENSITY = 1;
export const CITY_LIGHT_COLOR = Object.freeze([1, 1, 1]);

/**
 * @param {object} dfBlock
 * @param {(record:number) => {w:number,h:number}} getScaledSize
 * @returns {Array<{record:number,x:number,y:number,z:number,foot:number,w:number,h:number}>}
 */
export function collectCityLights(dfBlock, getScaledSize) {
  const rmb = dfBlock.rmbBlock;
  const lights = [];

  for (const obj of rmb.miscFlatObjectRecords) {
    if (obj.textureArchive !== LIGHTS_ARCHIVE) continue;
    const size = getScaledSize(obj.textureRecord);
    lights.push({
      // `record`, `foot`, `w`, and `h` feed systems/survival/hearth.js, which tells braziers from lanterns and
      // sizes each hearth box from its sprite.
      record: obj.textureRecord,
      x: obj.xPos * GLOBAL_SCALE,
      y: -obj.yPos * GLOBAL_SCALE + size.h,
      z: (obj.zPos + RMB_DIMENSION) * GLOBAL_SCALE,
      foot: -obj.yPos * GLOBAL_SCALE, w: size.w, h: size.h,
    });
  }

  for (const subRecord of rmb.subRecords) {
    const subX = subRecord.xPos * GLOBAL_SCALE;
    const subZ = -subRecord.zPos * GLOBAL_SCALE;
    for (const obj of subRecord.exterior.blockFlatObjectRecords) {
      if (obj.textureArchive !== LIGHTS_ARCHIVE) continue;
      const size = getScaledSize(obj.textureRecord);
      lights.push({
        record: obj.textureRecord,
        x: obj.xPos * GLOBAL_SCALE + subX,
        y: -obj.yPos * GLOBAL_SCALE + size.h,
        z: (obj.zPos + RMB_DIMENSION) * GLOBAL_SCALE + subZ,
        foot: -obj.yPos * GLOBAL_SCALE, w: size.w, h: size.h,
      });
    }
  }

  return lights;
}

// Result arrays stay per call because `setPointLights` holds the returned buffer across the frame's re-uploads;
// ties keep the earliest index.
const _selD = [];
const _selIdx = [];

export function nearestLights(lights, pos, max = 16, range = CITY_LIGHT_RANGE, colorOf = null, xzRange = 0, n = -1) {
  const perLight = typeof range !== 'number' ? range : null;
  const xz2 = xzRange > 0 ? xzRange * xzRange : 0;
  // The world host passes `n` because its pooled light array is longer than its live contents; -1 means the whole
  // array.
  const len = n < 0 ? lights.length : Math.min(n, lights.length);
  let count = 0;
  for (let i = 0; i < len; i++) {
    const l = lights[i];
    const dx = l.x - pos[0];
    const dy = l.y - pos[1];
    const dz = l.z - pos[2];
    // DFU compares XZ only and disables on strictly greater, so a light exactly at `xzRange` stays lit; this gate
    // runs before the nearest-`max` admission.
    if (xz2 && dx * dx + dz * dz > xz2) continue;
    const d = dx * dx + dy * dy + dz * dz;
    if (count >= max && d >= _selD[count - 1]) continue;
    let j = count < max ? count++ : count - 1;
    while (j > 0 && _selD[j - 1] > d) { _selD[j] = _selD[j - 1]; _selIdx[j] = _selIdx[j - 1]; j--; }
    _selD[j] = d; _selIdx[j] = i;
  }
  const out = lightList(count);
  for (let i = 0; i < count; i++) {
    const l = lights[_selIdx[i]];
    // A per-light range array shorter than the list yields undefined, which becomes NaN and breaks point shadows,
    // so fall back to `CITY_LIGHT_RANGE`.
    const w = perLight ? perLight[_selIdx[i]] : range;
    packLight(out, i, l, Number.isFinite(w) ? w : CITY_LIGHT_RANGE);
  }
  if (!colorOf) return out;
  // Colors reuse the same selection indices so they stay in `data` order, even on distance ties.
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const c = colorOf(lights[_selIdx[i]], _selIdx[i]);
    colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
  }
  return { data: out, colors };
}
