// @ts-check
// Paints the two pictures under the islands: the Works brass and the chain links.
import { SD_RAMP } from './sdLook.js';
import { rng, noiseField, image, putTexel, scale, ramp, step, bevel, rivet, paletteOf, quantize } from './sdPixelKit.js';

export const SD_WORKS_TIP_GLOW = 0.42;
export const SD_WORKS_TIP_ROWS = 7;

const { brass: Br, verdigris: Vg, void: Vo } = SD_RAMP;
const BLACKENED = Object.freeze([Vo[1], Vo[2], Br[0], Br[1]]);

export function worksArt(seed = 0x5d1180) {
  const S = 64, albedo = image(S), emission = image(S), r = rng(seed);
  const broad = noiseField(seed, 4, S), grain = noiseField(seed + 1, 8, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (y < SD_WORKS_TIP_ROWS) {
      const c = step(Br, y < 2 ? 5 : 4);
      putTexel(albedo, x, y, c); putTexel(emission, x, y, scale(c, SD_WORKS_TIP_GLOW));
      continue;
    }
    putTexel(albedo, x, y, ramp(BLACKENED, 0.1 + 0.32 * broad(x, y) + 0.16 * (grain(x, y) - 0.5), x, y)); putTexel(emission, x, y, [0, 0, 0]);
  }
  for (let py = SD_WORKS_TIP_ROWS + 1; py + 16 <= S + 8; py += 16) for (let px = 0; px < S; px += 16) {
    const h = Math.min(16, S - py);
    if (h < 4) continue;
    bevel(albedo, px, py, 16, h, step(Br, 1), step(Vo, 0));
    if (h >= 8) rivet(albedo, px + 4, py + 4, step(Br, 1), step(Vo, 0), step(Br, 2));
    if (r() < 0.5) for (let k = 0; k < 4; k++) putTexel(albedo, px + 15, py + h - 1 - k, step(Vg, 0));
  }
  quantize(albedo, paletteOf(Br, Vg, Vo));
  return { albedo, emission };
}

export function chainArt(seed = 0x5d1181) {
  const S = 32, albedo = image(S), emission = image(S), tone = noiseField(seed, 4, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const band = Math.floor(y / 8), t = tone(x, y);
    const c = band === 0 ? ramp(Br, 0.12 + 0.2 * t, x, y)
      : band === 2 ? ramp(Br, 0.3 + 0.25 * t, x, y)
        : band === 3 ? (t > 0.6 ? step(Vg, 1) : ramp(Br, 0.05 + 0.15 * t, x, y))
          : ramp(Br, 0.1 + 0.2 * t, x, y);
    putTexel(albedo, x, y, c); putTexel(emission, x, y, [0, 0, 0]);
  }
  for (let x = 0; x < S; x++) { putTexel(albedo, x, 0, step(Br, 3)); putTexel(albedo, x, 16, step(Br, 4)); putTexel(albedo, x, 7, step(Br, 0)); }
  quantize(albedo, paletteOf(Br, Vg));
  return { albedo, emission };
}

/** @returns {Array<[number, { albedo: import('./sdPixelKit.js').Img, emission: import('./sdPixelKit.js').Img }]>} */
export const hangArt = () => [[80, worksArt()], [81, chainArt()]];
