import { applyDyeToIndex, DYE_COLORS, DYE_TARGETS } from '../../characters/dyes.js';

export const PDE_FEMALE_CLOTHING = Object.freeze([235, 236, 237, 238]);
export const PDE_FEMALE_ARMOR = Object.freeze([245, 246, 247, 248]);
export const PDE_STYLE_STAND_IN = Object.freeze({ 4: 5, 7: 6 });
export const PDE_SOURCE_METALS = Object.freeze([DYE_COLORS.Steel, DYE_COLORS.Iron, DYE_COLORS.Mithril, DYE_COLORS.Elven, DYE_COLORS.Silver,
  DYE_COLORS.Dwarven, DYE_COLORS.Adamantium, DYE_COLORS.Ebony, DYE_COLORS.Orcish, DYE_COLORS.Daedric]);
const METALS = new Set([15, 16, 18, 19, 20, 21, 22, 23, 24, 25]);
// Classic armor records mark dyeable metal pixels with palette indices 0x70 to 0x7F.
const BAND = 0x70;

export function pdeGap(archive, record, dye) {
  if (PDE_FEMALE_CLOTHING.includes(archive) && PDE_STYLE_STAND_IN[record] != null) return { style: PDE_STYLE_STAND_IN[record] };
  if (PDE_FEMALE_ARMOR.includes(archive) && METALS.has(Number(dye ?? DYE_COLORS.Silver))) {
    const target = Number(dye ?? DYE_COLORS.Silver);
    return { metal: PDE_SOURCE_METALS.filter((m) => m !== target) };
  }
  return null;
}

const rgbOf = (palette, i) => { const c = palette.get(i); return [c.r, c.g, c.b]; };
export const metalRamp = (palette, dye) => Array.from({ length: 16 }, (_, i) => rgbOf(palette, applyDyeToIndex(BAND + i, dye, DYE_TARGETS.WeaponsAndArmor)));

const LUMA_STEPS = 32;
const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
export const PDE_REFERENCE_RECORDS = Object.freeze([27, 0, 1, 2, 4, 5, 6, 7, 9, 12, 13, 14, 15, 16, 18, 19, 20, 21, 23, 24, 25, 26]);

export function learnMetalRamp(srcPic, dstPic) {
  if (!srcPic || !dstPic || srcPic.width !== dstPic.width || srcPic.height !== dstPic.height) return null;
  const sum = Array.from({ length: LUMA_STEPS }, () => [0, 0, 0, 0]);
  const a = srcPic.rgba, b = dstPic.rgba;
  for (let o = 0; o < a.length; o += 4) {
    if (a[o + 3] < 128 || b[o + 3] < 128) continue;
    const d = Math.abs(a[o] - b[o]) + Math.abs(a[o + 1] - b[o + 1]) + Math.abs(a[o + 2] - b[o + 2]);
    if (d < 24) continue;
    const k = Math.min(LUMA_STEPS - 1, Math.floor((luma(a[o], a[o + 1], a[o + 2]) * LUMA_STEPS) / 256));
    const s = sum[k];
    s[0] += b[o]; s[1] += b[o + 1]; s[2] += b[o + 2]; s[3]++;
  }
  const ramp = sum.map((s) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : null));
  const known = ramp.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
  if (known.length < 3) return null;
  for (let i = 0; i < LUMA_STEPS; i++) {
    if (ramp[i]) continue;
    const lo = [...known].reverse().find((k) => k < i), hi = known.find((k) => k > i);
    if (lo == null) ramp[i] = ramp[hi];
    else if (hi == null) ramp[i] = ramp[lo];
    else { const t = (i - lo) / (hi - lo); ramp[i] = ramp[lo].map((v, c) => v + (ramp[hi][c] - v) * t); }
  }
  return ramp;
}

// The mask grows by one pixel because the HD art has softer edges than the classic record.
function metalMask(classic) {
  const cw = classic?.width ?? 0, ch = classic?.height ?? 0, cd = classic?.data ?? null;
  if (!cd) return null;
  const m = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const v = cd[y * cw + x];
    if (v >= BAND && v < BAND + 16) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const xx = x + i, yy = y + j;
      if (xx >= 0 && yy >= 0 && xx < cw && yy < ch) m[yy * cw + xx] = 1;
    }
  }
  return { m, cw, ch };
}

/**
 * @param pic { width, height, rgba }
 * @param classic { width, height, data }
 * @param palette
 * @param ramp
 */
export function recolourMetal(pic, classic, palette, from, to, ramp = null) {
  const { width: w, height: h, rgba } = pic;
  const out = new Uint8ClampedArray(rgba);
  const mask = metalMask(classic);
  const src = ramp ? null : metalRamp(palette, from), dst = ramp ? null : metalRamp(palette, to);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (out[o + 3] === 0) continue;
      if (mask && !mask.m[Math.min(mask.ch - 1, Math.floor((y * mask.ch) / h)) * mask.cw + Math.min(mask.cw - 1, Math.floor((x * mask.cw) / w))]) continue;
      const r = out[o], g = out[o + 1], b = out[o + 2];
      if (ramp) {
        const t = ramp[Math.min(LUMA_STEPS - 1, Math.floor((luma(r, g, b) * LUMA_STEPS) / 256))];
        out[o] = t[0]; out[o + 1] = t[1]; out[o + 2] = t[2];
        continue;
      }
      let best = 0, bestD = Infinity;
      for (let k = 0; k < 16; k++) {
        const s = src[k];
        const d = (r - s[0]) ** 2 + (g - s[1]) ** 2 + (b - s[2]) ** 2;
        if (d < bestD) { bestD = d; best = k; }
      }
      const s = src[best], t = dst[best];
      out[o] = t[0] + (r - s[0]);
      out[o + 1] = t[1] + (g - s[1]);
      out[o + 2] = t[2] + (b - s[2]);
    }
  }
  return { width: w, height: h, rgba: out };
}
