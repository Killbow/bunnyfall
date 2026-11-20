// BUNNYFALL MODPACK1: PAPERDOLL ENHANCED'S MISSING PIECES (the owner: "paperdoll enhanced is missing some sprites so
// provide some workarounds"). Paperdoll Enhanced 1.2.0 dresses female characters, and against the classic records it
// leaves out (measured on its .dfmod, 2026-11-20):
//
//   - Helmets in most metals: records 28-32 of the female armour archives (245-248) carry Dwarven, sometimes Steel or
//     Adamantium, and a mask; the shields (33-36) only their plain picture and Dwarven; the chain greaves (11) only
//     Iron and Steel. The other metals drew the classic piece - a low-resolution sprite over an HD body.
//   - Two Formal Brassiere styles: records 4 and 7 of the female clothing archives (235-238), in every colour.
//
// The workarounds, both behind the "Fill in missing pieces" switch (pref pdeFillGaps, on by default):
//   - A MISSING METAL is the mod's own picture of the same piece in another metal, recoloured to the one asked for.
//     The recolour reads Daggerfall's own dye law: the classic record's dyed pixels (palette 0x70-0x7F) say WHERE the
//     metal is, and the two metals' palette ramps say HOW each shade maps - each mod pixel there is matched to its
//     nearest shade of the source metal and moved to the same shade of the target, keeping its own detail.
//   - A MISSING STYLE borrows the neighbouring style's picture (4 -> 5, 7 -> 6), in the colour asked for.
//
// Male characters are never touched: the mod has no male art, and their archives (239-242, 249-252) are not here.

import { applyDyeToIndex, DYE_COLORS, DYE_TARGETS } from '../../characters/dyes.js';

export const PDE_FEMALE_CLOTHING = Object.freeze([235, 236, 237, 238]);
export const PDE_FEMALE_ARMOR = Object.freeze([245, 246, 247, 248]);
/** The two missing Formal Brassiere styles and the style each borrows. */
export const PDE_STYLE_STAND_IN = Object.freeze({ 4: 5, 7: 6 });
/** The metals a missing one is recoloured from, the closest in look first; Silver (18) is the mod's plain picture. */
export const PDE_SOURCE_METALS = Object.freeze([DYE_COLORS.Steel, DYE_COLORS.Iron, DYE_COLORS.Mithril, DYE_COLORS.Elven, DYE_COLORS.Silver,
  DYE_COLORS.Dwarven, DYE_COLORS.Adamantium, DYE_COLORS.Ebony, DYE_COLORS.Orcish, DYE_COLORS.Daedric]);
const METALS = new Set([15, 16, 18, 19, 20, 21, 22, 23, 24, 25]);
const BAND = 0x70;   // the weapons-and-armour dye band of the palette

/** What to do for a doll piece with no picture of its own: `{ style }` (draw this record instead), `{ metal }` (recolour
 *  from one of these metals' pictures, in order) or null (draw the classic piece). */
export function pdeGap(archive, record, dye) {
  if (PDE_FEMALE_CLOTHING.includes(archive) && PDE_STYLE_STAND_IN[record] != null) return { style: PDE_STYLE_STAND_IN[record] };
  if (PDE_FEMALE_ARMOR.includes(archive) && METALS.has(Number(dye ?? DYE_COLORS.Silver))) {
    const target = Number(dye ?? DYE_COLORS.Silver);
    return { metal: PDE_SOURCE_METALS.filter((m) => m !== target) };
  }
  return null;
}

/** A palette entry as [r, g, b]. */
const rgbOf = (palette, i) => { const c = palette.get(i); return [c.r, c.g, c.b]; };
/** The 16 shades of the armour band in one metal. */
export const metalRamp = (palette, dye) => Array.from({ length: 16 }, (_, i) => rgbOf(palette, applyDyeToIndex(BAND + i, dye, DYE_TARGETS.WeaponsAndArmor)));

const LUMA_STEPS = 32;
const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
/** The records the mod carries in every metal, asked first when a metal pair's colours are learned. */
export const PDE_REFERENCE_RECORDS = Object.freeze([27, 0, 1, 2, 4, 5, 6, 7, 9, 12, 13, 14, 15, 16, 18, 19, 20, 21, 23, 24, 25, 26]);

/**
 * THE MOD'S OWN COLOURS for a metal pair, learned off one piece it draws in both (the same drawing, so pixel for
 * pixel): for each brightness of the source metal, the mean colour the target metal has there. Only pixels the two
 * differ in are read (the metal - straps, buckles and skin are the same in both). Answers LUMA_STEPS [r, g, b] (gaps
 * filled from their neighbours), or null when the two pictures do not line up or share no metal.
 */
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

/** Where the metal is on a classic record: its armour-band pixels, grown by one pixel (the HD art's edges are softer). */
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
 * Recolour a mod picture of a piece from one metal to another.
 * @param pic     { width, height, rgba } top-down - the mod's picture in `from`
 * @param classic { width, height, data } the classic record's indexed bitmap (where the metal is)
 * @param palette the doll's palette (`get(i)` -> { r, g, b })
 * @param ramp    learnMetalRamp's answer for this pair, or null: then the classic palette ramps are the guide
 * Answers a new { width, height, rgba }.
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
      if (ramp) {   // the mod's own colours: the target's colour at this brightness
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
