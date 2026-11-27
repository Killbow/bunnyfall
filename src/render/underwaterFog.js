// @ts-check
// Dungeon underwater fog, ported from Daggerfall Unity, with the backup and restore of the room fog around it.
// The fog ramps across a 0.02-unit band at the water surface rather than switching at one height.

import { GLOBAL_SCALE } from '../world/meshReader.js';

export const WATER_FOG_COLOR = Object.freeze([14 / 255, 25 / 255, 21 / 255]);
export const WATER_MAP_COLOR = Object.freeze([0.1, 0.3, 0.25, 0.4]);

export const FOG_DENSITY_MIN = 0;
export const FOG_DENSITY_MAX = 0.25;

export const DUNGEON_FOG = Object.freeze({
  mode: 'exp', density: 0.005, start: 0, end: 0, color: Object.freeze([0, 0, 0]),
});

// The renderer holds the color array it receives, so `into` must belong to the caller alone.
export function applyFog(renderer, s, into = null) {
  renderer.setFog(s.mode, s.density, s.start, s.end, into ? (into.set(s.color), into) : new Float32Array(s.color));
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);

/**
 * @param {number} waterLevel
 * @param {number} camY
 * @returns {number}
 */
export function fogT(waterLevel, camY) {
  const adjustedCamYPos = camY + (50 * GLOBAL_SCALE) - 0.95;
  const waterEntryThreshold = (waterLevel * -1 * GLOBAL_SCALE) + 0.38;
  const waterExitThreshold = waterEntryThreshold - 0.02;
  const clampedCamYPos = clamp(adjustedCamYPos, waterExitThreshold, waterEntryThreshold);
  // The thresholds always differ by 0.02, so this guard never fails; it stays as in the classic code.
  if (waterEntryThreshold - waterExitThreshold !== 0.0) {
    return 1 - ((clampedCamYPos - waterExitThreshold) / (waterEntryThreshold - waterExitThreshold));
  }
  return 0.0;
}

export class UnderwaterFog {
  constructor() {
    /** @type {{mode: string, density: number, start: number, end: number, color: number[]}} */
    this.original = { ...DUNGEON_FOG, color: [...DUNGEON_FOG.color] };
    this.waterFogColor = WATER_FOG_COLOR;
    this.waterMapColor = WATER_MAP_COLOR;
    this.fogDensityMin = FOG_DENSITY_MIN;
    this.fogDensityMax = FOG_DENSITY_MAX;
    this.oldFogT = 0.0;
  }

  /**
   * @param {number} waterLevel
   * @param {number} camY
   * @param {{mode: string, density: number, start: number, end: number,
   *          color: number[]}} current
   * @returns {{mode: string, density: number, start: number, end: number,
   *            color: number[]}}
   */
  updateFog(waterLevel, camY, current) {
    const t = fogT(waterLevel, camY);

    // The backup runs before oldFogT advances, so the frame that enters the water still saves the dry fog.
    if (this.oldFogT === 0.0 && current) {
      this.original = {
        mode: current.mode, density: current.density,
        start: current.start, end: current.end,
        color: current.color ? Array.from(current.color) : [0, 0, 0],
      };
    }
    this.oldFogT = t;

    // Underwater fog keeps the saved start and end distances, as in Daggerfall Unity.
    if (t > 0.0) {
      return {
        mode: 'exp',
        density: lerp(this.fogDensityMin, this.fogDensityMax, t),
        start: this.original.start,
        end: this.original.end,
        color: Array.from(this.waterFogColor),
      };
    }
    return {
      mode: this.original.mode, density: this.original.density,
      start: this.original.start, end: this.original.end,
      color: Array.from(this.original.color),
    };
  }
}
