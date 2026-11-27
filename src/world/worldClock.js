// Day/night cycle: time-of-day driving sun, ambient, sky frame, window style, and city lights.

import { UMRandom } from '../formats/umRandom.js';

export const LIGHTS_ON_HOUR = 17;
export const LIGHTS_OFF_HOUR = 8;
import { MINUTES_PER_HOUR, MINUTES_PER_DAY, DAWN_HOUR, DUSK_HOUR } from './gameDate.js';

export { MINUTES_PER_HOUR, MINUTES_PER_DAY, DAWN_HOUR, DUSK_HOUR };

export const SUN_RIG_INTENSITY = 0.6;
export const SUN_RIG_COLOR = Object.freeze([0.8161765, 0.954361, 1]);
export const INDIRECT_LIGHT_COLOR = Object.freeze([0.7058824, 0.7058824, 0.7058824]);
export const INDIRECT_LIGHT_INTENSITY = 1.0;
export const INDIRECT_LIGHT_RANGE = 150;
export const EXTERIOR_NOON_AMBIENT = Object.freeze([0.9, 0.9, 0.9]);
export const EXTERIOR_NIGHT_AMBIENT = Object.freeze([0.25, 0.25, 0.25]);

const LIGHT_CURVE = [
  [0, 0, 0, 0],
  [0.08, 0.36, 2.8928573, 2.8928573],
  [0.5, 0.9, 0, 0],
  [0.92, 0.36, -2.8928576, -2.8928576],
  [1, 0, 0, 0],
];

let activeLightCurve = LIGHT_CURVE;
export function setLightCurve(keys) {
  activeLightCurve = keys && keys.length ? keys : LIGHT_CURVE;
}
export function activeLightCurveKeys() { return activeLightCurve; }

export function evaluateCurve(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (t >= last[0]) return last[1];
  let i = 0;
  while (t > keys[i + 1][0]) i++;
  const [t0, v0, , outSlope] = keys[i];
  const [t1, v1, inSlope] = keys[i + 1];
  const dt = t1 - t0;
  const s = (t - t0) / dt;
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  return h00 * v0 + h10 * dt * outSlope + h01 * v1 + h11 * dt * inSlope;
}

export function hourOf(minuteOfDay) {
  return Math.floor((((minuteOfDay % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
}

export function isNight(minuteOfDay) {
  const hour = hourOf(minuteOfDay);
  return hour < DAWN_HOUR || hour >= DUSK_HOUR;
}

export function isCityLightsOn(minuteOfDay) {
  const hour = hourOf(minuteOfDay);
  return hour >= LIGHTS_ON_HOUR || hour < LIGHTS_OFF_HOUR;
}

export function dayFraction(minuteOfDay) {
  const dawn = DAWN_HOUR * MINUTES_PER_HOUR;
  const dayRange = DUSK_HOUR * MINUTES_PER_HOUR - dawn;
  const m = ((minuteOfDay % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return (m - dawn) / dayRange;
}

export function daylightScale(minuteOfDay) {
  return evaluateCurve(activeLightCurve, Math.max(0, Math.min(1, dayFraction(minuteOfDay))));
}

export function sunDirection(minuteOfDay) {
  const x = Math.PI * Math.max(0, Math.min(1, dayFraction(minuteOfDay)));
  return new Float32Array([Math.cos(x), Math.sin(x), 0]);
}

export function exteriorAmbient(minuteOfDay, nightAmbientScale = 1, weatherScale = 1) {
  const s = daylightScale(minuteOfDay) * weatherScale * weatherScale;
  const out = new Float32Array(3);
  for (let i = 0; i < 3; i++) {
    const night = EXTERIOR_NIGHT_AMBIENT[i] * nightAmbientScale;
    out[i] = night + (EXTERIOR_NOON_AMBIENT[i] - night) * s;
  }
  return out;
}

export function sunScale(minuteOfDay) {
  return isNight(minuteOfDay) ? 0 : SUN_RIG_INTENSITY * daylightScale(minuteOfDay);
}

export function indirectLightScale(minuteOfDay) {
  return isNight(minuteOfDay) ? 0 : INDIRECT_LIGHT_INTENSITY * daylightScale(minuteOfDay);
}

export function skyFrameForTime(minuteOfDay) {
  if (isNight(minuteOfDay)) return null;
  return Math.max(0, Math.min(63, Math.round(dayFraction(minuteOfDay) * 63)));
}

export function windowStyleForTime(minuteOfDay) {
  return isCityLightsOn(minuteOfDay) ? 'night' : 'day';
}

export function parseTimeOfDay(value) {
  if (value === null || value === undefined || value === '') return null;
  const hm = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const n = Number(value);
  return Number.isFinite(n) ? ((n % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY : null;
}

export class CityLightAnimator {
  constructor(count, startRange, seed = 0x9d2c5680) {
    this._starts = new Float32Array(count);
    if (typeof startRange === 'number') this._starts.fill(startRange);
    else this._starts.set(startRange);
    this.variance = 1.0;
    this.speed = 0.4;
    this.framesPerSecond = 14;
    this._accumulator = 0;
    this._rng = new UMRandom(seed >>> 0 || 1);
    this.ranges = new Float32Array(this._starts);
    this._targets = new Float32Array(this._starts);
    this._stepping = new Uint8Array(count);
  }

  tick(dtSeconds) {
    this._accumulator += dtSeconds;
    const step = 1 / this.framesPerSecond;
    while (this._accumulator >= step) {
      this._accumulator -= step;
      for (let i = 0; i < this.ranges.length; i++) {
        if (this._stepping[i]) {
          if (this._targets[i] <= this.ranges[i]) {
            this.ranges[i] -= this.speed;
            if (this.ranges[i] <= this._targets[i]) this._stepping[i] = 0;
          } else {
            this.ranges[i] += this.speed;
            if (this.ranges[i] >= this._targets[i]) this._stepping[i] = 0;
          }
        } else {
          this._targets[i] =
            this._starts[i] - this.variance + this._rng.nextFloat() * this.variance;
          this._stepping[i] = 1;
        }
      }
    }
  }
}

export function viewOutLight(minute, nightScale, weatherSun = 1, sunFactor = 1) {
  const w = Number.isFinite(weatherSun) ? Math.max(0, weatherSun) : 1, c = Number.isFinite(sunFactor) ? Math.max(0, sunFactor) : 1;
  return { ambient: exteriorAmbient(minute, nightScale, w), sun: sunScale(minute) * w * c };
}
