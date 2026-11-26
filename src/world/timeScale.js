// The game clock rate, Unity's Time.timeScale: an accelerated journey or a sea helm sets it, otherwise it is 1.
// The frame multiplies dt by timeScale(), and player/motor.js scales its frame time by the same number.
// Pause is not this: this game holds the frame instead. Ask the journey, never this number, whether one runs.

import { paceRateOn, ROAD_PACE_MAX, OPEN_PACE_MAX } from '../travel/travelPace.js';

export const MAX_TIME_SCALE = 100;

// ROAD_PACE_MAX in travelPace.js must equal MAX_TIME_SCALE.
export const TRAVEL_ROAD_RATE = ROAD_PACE_MAX;
export const TRAVEL_OPEN_RATE = OPEN_PACE_MAX;
export const travelRateOf = (onRoad) => paceRateOn(onRoad);

let _scale = 1;

export const timeScale = () => _scale;
export const timeAccelerated = () => _scale > 1;

export function setTimeScale(n) {
  const v = Number(n);
  _scale = Number.isFinite(v) ? Math.max(0.01, Math.min(MAX_TIME_SCALE, v)) : 1;
  return _scale;
}

export const resetTimeScale = () => setTimeScale(1);

export function _setTimeScaleForTest(n) { _scale = n; }
