// @ts-check
import { dungeonTrilight, dungeonFog } from '../../render/enhancedLighting.js';
import { applyFog } from '../../render/underwaterFog.js';

const f3 = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ c) => Object.freeze([a, b, c]);
const unit = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => { const n = Math.hypot(x, y, z); return f3(x / n, y / n, z / n); };

export const ED_ATMOS = Object.freeze({
  fog: Object.freeze({ mode: 'exp', density: 0.011, start: 0, end: 0, color: f3(0.085, 0.03, 0.14) }),
  tri: Object.freeze({ sky: f3(0.2, 0.1, 0.34), equator: f3(0.15, 0.07, 0.24), ground: f3(0.32, 0.1, 0.5) }),
  key: Object.freeze({ scale: 0.32, dir: unit(0.25, 0.85, 0.35), color: f3(0.72, 0.42, 1.0) }),
  grade: Object.freeze({ adaptKey: 0.13, adaptMax: 1.5, bloom: 0.85, vignette: 0.38, contrast: 1.08 }),
  lamp: f3(0.82, 0.55, 1.15),
});

const _tri = { sky: [0, 0, 0], equator: [0, 0, 0], ground: [0, 0, 0] };
const _fog = { mode: '', density: 0, start: 0, end: 0, color: [0, 0, 0] };
const _fogColor = new Float32Array(3);
const _equator = new Float32Array(3);

export const edAtmosHere = (/** @type {any} */ loc) => !!loc?.eliteDungeon?.key;

// Call after the dungeon's own lighting and fog are set; this overrides them for the frame.
export function edAtmosFrame(/** @type {any} */ renderer, /** @type {any} */ loc) {
  if (!edAtmosHere(loc) || !renderer) return;
  const lane = !!renderer.lightingLane;
  const t = dungeonTrilight(lane, ED_ATMOS.tri, lane ? _tri : null) ?? ED_ATMOS.tri;
  _equator.set(t.equator);
  renderer.setLighting(_equator, 0, undefined, t);
  renderer.setMoonlight(ED_ATMOS.key);
  applyFog(renderer, dungeonFog(lane, ED_ATMOS.fog, lane ? _fog : null) ?? ED_ATMOS.fog, _fogColor);
  renderer.setSceneGrade?.(ED_ATMOS.grade);
}

// Multiplies `color` in place, so pass the frame's own array, never a shared constant.
export function edLampTint(/** @type {any} */ loc, /** @type {Float32Array} */ color) {
  if (!edAtmosHere(loc) || !color) return color;
  for (let k = 0; k < 3; k++) color[k] *= ED_ATMOS.lamp[k];
  return color;
}
