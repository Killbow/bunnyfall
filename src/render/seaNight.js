// @ts-check
// Sea reflection sky under Dynamic Skies, which publishes only the fog color (black by sunset).
// Colors are in display space because the water program sums them there.
import { MOONLIGHT } from './enhancedSky.js';

export const NIGHT_SEA_HORIZON = Object.freeze([0.05, 0.075, 0.16]);
export const NIGHT_SEA_ZENITH = Object.freeze([0.02, 0.03, 0.09]);
export const DUSK_SEA_GLOW = Object.freeze([0.85, 0.38, 0.14]);
export const DUSK_SEA_BAND = Object.freeze([0.2, 0.11, 0.1]);
const ZENITH_OF_FOG = Object.freeze([0.55, 0.65, 0.85]);

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mean3 = (c) => (c[0] + c[1] + c[2]) / 3;

/** @typedef {{ zenith: number[], horizon: number[], glow: number[], glowDir: number[], night: number }} SeaSky */

// The returned function writes the same object on every call.
/** @returns {(fog: ArrayLike<number>, sunDir: ArrayLike<number> | null | undefined, moon: number, cover: number) => SeaSky} */
export function createSeaNightSky() {
  /** @type {SeaSky} */
  const out = { zenith: [0, 0, 0], horizon: [0, 0, 0], glow: [0, 0, 0], glowDir: [0, 1], night: 0 };
  const nhMean = mean3(NIGHT_SEA_HORIZON), nzMean = mean3(NIGHT_SEA_ZENITH);
  return (fog, sunDir, moon, cover) => {
    const sunY = sunDir ? sunDir[1] : 1;
    const floorW = smooth(0.15, -0.15, sunY);
    const glowW = smooth(0.35, 0.05, sunY) * smooth(-0.3, -0.02, sunY);
    const lift = (1 + 0.8 * clamp01(moon / MOONLIGHT.masser)) * (1 - 0.45 * cover);
    const gray = 0.6 * cover;
    const band = glowW * (1 - 0.6 * cover), glow = glowW * (1 - 0.7 * cover);
    for (let i = 0; i < 3; i++) {
      const nh = (NIGHT_SEA_HORIZON[i] + (nhMean - NIGHT_SEA_HORIZON[i]) * gray) * lift * floorW;
      const nz = (NIGHT_SEA_ZENITH[i] + (nzMean - NIGHT_SEA_ZENITH[i]) * gray) * lift * floorW;
      out.horizon[i] = Math.max(fog[i], nh) + DUSK_SEA_BAND[i] * band;
      out.zenith[i] = Math.max(fog[i] * ZENITH_OF_FOG[i], nz);
      out.glow[i] = DUSK_SEA_GLOW[i] * glow;
    }
    const sx = sunDir ? sunDir[0] : 0, sz = sunDir ? sunDir[2] : 1, sl = Math.hypot(sx, sz) || 1;
    out.glowDir[0] = sx / sl;
    out.glowDir[1] = sz / sl;
    out.night = smooth(0.1, -0.1, sunY);
    return out;
  };
}
