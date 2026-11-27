// @ts-check
import { SD_RAMP, SD_LIGHT } from '../sdLook.js';
import { image, putTexel, scale, ramp, step, noiseField, quantize } from '../sdPixelKit.js';
import { SD_STEPS_ATLAS, SD_STEP_BEVEL, SD_CRACK_STAGES, SD_STEPS_GLOW, SD_CRUMBLE_CRACKS, crackDistance } from '../sdStepsArt.js';
import { SD_CRUMBLE_SIZE } from '../sdSteps.js';
import { SD_BEAT_DISSOLVE } from '../sdStepsModel.js';
import { EG_BAND_RAMPS, EG_BEAT_TELL_RECORDS, EG_DRESS, egBandArtOf, egBandPalette, egDissolveArt } from './egBandArt.js';
import { EG_KIT_RECORD } from './egKit.js';

const BASE = Math.max(...EG_BEAT_TELL_RECORDS.warn.flat(), ...EG_BEAT_TELL_RECORDS.back) + 1;
export const EG_CRUMBLE_TELL_RECORDS = Object.freeze([BASE, BASE + 1, BASE + 2, BASE + 3]);
export const EG_BEAT_STONE_RECORDS = Object.freeze([EG_KIT_RECORD.moulding, EG_KIT_RECORD.found].map((rec, j) => Object.freeze({
  rec,
  warn: Object.freeze(SD_BEAT_DISSOLVE.keep.map((_, k) => BASE + 4 + j * 7 + k)),
  back: Object.freeze([0, 1, 2].map((k) => BASE + 8 + j * 7 + k)),
})));
export const EG_PIECE_TELL_RECORDS = Object.freeze([...EG_CRUMBLE_TELL_RECORDS, ...EG_BEAT_STONE_RECORDS.flatMap((q) => [...q.warn, ...q.back])]);

const EMBER = SD_LIGHT.ember.map((v) => Math.round(v * 255));
const GOLD_LIGHT = SD_LIGHT.gold.map((v) => Math.round(v * 255));
const GOLD = EG_BAND_RAMPS[0].metal;
const BLACK = Object.freeze([0, 0, 0]);
function fill(img, cell, fn) {
  const [x0, y0, w, h] = cell;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = fn((x + 0.5) / w, (y + 0.5) / h, x0 + x, y0 + y); if (c) putTexel(img, x0 + x, y0 + y, c); }
}
const topMetres = (s, t) => [(s - 0.5) * (SD_CRUMBLE_SIZE.w - 2 * SD_STEP_BEVEL), (t - 0.5) * (SD_CRUMBLE_SIZE.d - 2 * SD_STEP_BEVEL)];
const fract = (v) => v - Math.floor(v);

const _crumble = new Map();
export function egCrumbleArt(band, n = 0) {
  const b = Math.max(0, Math.min(3, band | 0)), k0 = `${b}:${n}`;
  let out = _crumble.get(k0);
  if (out) return out;
  const R = EG_BAND_RAMPS[b], A = SD_STEPS_ATLAS, S = SD_CRACK_STAGES[n], k = SD_STEPS_GLOW.crack[n], hot = SD_RAMP.void[4];
  const albedo = image(A.w, A.h), emission = image(A.w, A.h), g = noiseField(0xe6c0 + b * 31 + 7, 6, A.w, A.h);
  const floor = egBandArtOf(b, EG_DRESS.floor)[1].albedo, found = egBandArtOf(b, EG_KIT_RECORD.found)[1].albedo;
  const texel = (img, u, v) => { const x = Math.floor(fract(u) * img.width), y = Math.floor(fract(v) * img.height), i = (y * img.width + x) * 4; return [img.colors[i], img.colors[i + 1], img.colors[i + 2]]; };
  const crack = (mx, mz) => { const [m, br] = crackDistance(mx, mz); return S.branch ? Math.min(m, br * 1.4) : Math.min(m, br * 2.2); };
  fill(albedo, A.top, (s, t, x, y) => {
    const [mx, mz] = topMetres(s, t), d = crack(mx, mz);
    if (d < S.core) return [...hot];
    if (d < S.lip) return step(R.vein, 0);
    return texel(floor, mx / 2 + 0.5, mz / 2 + 0.5);
  });
  fill(emission, A.top, (s, t) => { const [mx, mz] = topMetres(s, t), d = crack(mx, mz); return d < S.core ? scale(EMBER, k) : d < S.lip ? scale(EMBER, k * 0.18) : BLACK; });
  const [x0, y0, w, h] = A.side;
  fill(albedo, A.side, (s, t, x) => texel(found, (x - x0) / found.width, (6 + t * 40) / found.height));
  for (const pts of [SD_CRUMBLE_CRACKS.across, SD_CRUMBLE_CRACKS.along]) for (const p of [pts[0], pts[pts.length - 1]]) {
    const u = Math.abs(Math.abs(p[0]) - SD_CRUMBLE_SIZE.w / 2) < 1e-6 ? (p[1] / SD_CRUMBLE_SIZE.d + 0.5) : (p[0] / SD_CRUMBLE_SIZE.w + 0.5);
    const cx = x0 + Math.round(u * (w - 1));
    for (let yy = 0; yy < h; yy++) { const wob = Math.round(Math.sin(yy * 1.7 + cx) * 0.8); putTexel(albedo, cx + wob, y0 + yy, [...hot]); putTexel(emission, cx + wob, y0 + yy, scale(EMBER, k * (1 - yy / h))); }
  }
  const lineCol = n >= 3 ? EMBER : GOLD_LIGHT;
  fill(albedo, A.line, (s, t) => (t < 0.5 ? step(GOLD, 4) : step(GOLD, 3)));
  fill(emission, A.line, (s, t) => scale(lineCol, t < 0.5 ? SD_STEPS_GLOW.line : SD_STEPS_GLOW.line * 0.7));
  fill(albedo, A.bevel, (s, t, x, y) => ramp(R.stone, 0.62 + 0.25 * (1 - t), x, y));
  fill(albedo, A.under, (s, t, x, y) => ramp(R.vein, 0.2 + 0.5 * g(x, y), x, y));
  quantize(albedo, egBandPalette(b));
  out = Object.freeze({ albedo, emission });
  _crumble.set(k0, out);
  return out;
}
export const egCrumbleTellArt = (band) => EG_CRUMBLE_TELL_RECORDS.map((rec, n) => /** @type {[number, ReturnType<typeof egCrumbleArt>]} */ ([rec, egCrumbleArt(band, n)]));

const _stone = new Map();
export function egBeatStoneArt(band) {
  const b = Math.max(0, Math.min(3, band | 0));
  let out = _stone.get(b);
  if (!out) {
    const list = [];
    for (const q of EG_BEAT_STONE_RECORDS) {
      const [, art] = egBandArtOf(b, q.rec), dark = { albedo: art.albedo, emission: image(art.emission.width, art.emission.height) };
      q.warn.forEach((rec, k) => list.push([rec, egDissolveArt(dark, SD_BEAT_DISSOLVE.keep[k])]));
      q.back.forEach((rec, k) => list.push([rec, egDissolveArt(dark, SD_BEAT_DISSOLVE.keep[k])]));
    }
    _stone.set(b, out = Object.freeze(list));
  }
  return out;
}
