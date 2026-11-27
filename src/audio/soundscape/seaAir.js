// @ts-check
import { audio as defaultAudio } from '../audio.js';
import { ensureBed } from './soundJobs.js';
import { SCAPE_SFX } from './soundscapeSfx.js';

export const SEA_BEDS = Object.freeze({
  swell: Object.freeze({ name: 'sea:swell', bed: 'sea:swell', min: 0.15, max: 0.78, depth: 0.55 }),
  wash: Object.freeze({ name: 'sea:wash', bed: 'sea:wash', max: 0.6, from: 0.4, full: 7 }),
  rigging: Object.freeze({ name: 'sea:rigging', bed: 'sea:rigging', max: 0.42, from: 0.5 }),
});

export const SEA_FAR = 'seaAir';

export const SWELL_WAVES = Object.freeze([Object.freeze([8.3, 0.55, 0]), Object.freeze([12.7, 0.3, 1.3]), Object.freeze([5.1, 0.15, 0.4])]);

export const SEA_WEATHER = Object.freeze({ rain: 0.12, thunder: 0.35, snow: 0.06 });
export const SEA_STATE_FLOOR = 0.15;

const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
const smooth = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };

export function seaState(wind, weather) {
  return clamp01(SEA_STATE_FLOOR + 0.7 * clamp01(wind) + (SEA_WEATHER[/** @type {keyof typeof SEA_WEATHER} */ (weather)] ?? 0));
}

export function seaSwellAt(t) {
  let v = 0;
  for (const [period, share, phase] of SWELL_WAVES) {
    const omega = (2 * Math.PI) / period;
    v += share * Math.sin(omega * t + phase);
  }
  return clamp01(0.5 + 0.5 * v);
}

export function swellBed(state, t) {
  const { min, max, depth } = SEA_BEDS.swell;
  const s = seaSwellAt(t);
  return { volume: (min + (max - min) * clamp01(state)) * (1 - depth + depth * s), pitch: 0.9 + 0.1 * clamp01(state) + 0.06 * (s - 0.5) };
}

export function washBed(way, state, t) {
  const { max, from, full } = SEA_BEDS.wash;
  const w = smooth(from, full, way);
  return { volume: max * w * (0.75 + 0.25 * seaSwellAt(t - 1.7)) * (0.8 + 0.2 * clamp01(state)), pitch: 0.85 + 0.3 * clamp01(way / full) };
}

export function riggingBed(wind, gust, weather) {
  const { max, from } = SEA_BEDS.rigging;
  const w = clamp01(clamp01(wind) + (weather === 'thunder' ? 0.3 : weather === 'rain' ? 0.1 : 0));
  return { volume: max * smooth(from, 1, w) * (0.6 + 0.4 * clamp01(gust)), pitch: 0.92 + 0.2 * w + 0.06 * (clamp01(gust) - 0.5) };
}

export const GULL_GAP_S = Object.freeze([7, 26]);
export const GULL_PAIR = 0.3;

export const gullsAbout = ({ nearLand, night, weather }) => !!nearLand && !night && weather !== 'rain' && weather !== 'thunder' && weather !== 'snow';

export function watchBells(minuteOfDay) {
  const m = ((Math.floor(minuteOfDay) % 1440) + 1440) % 1440;
  const n = Math.floor((m % 240) / 30);
  return n === 0 ? 8 : n;
}
export const BELL_STROKE_S = 0.42;
export const BELL_PAIR_S = 1.15;
export const bellStrokes = (n) => Array.from({ length: Math.max(0, Math.floor(n)) }, (_, i) => Math.floor(i / 2) * BELL_PAIR_S + (i % 2) * BELL_STROKE_S);
export const BELL_MIN_REAL_S = 60;
export const NORMAL_PACE = 0.2;
export const BELL_MAX_PACE = 0.5;
export const BELL_PACE_TAU_S = 3;
export const BELL_CLIP = 107;
export const BELL_PITCH = 1.22;

const flatOf = (fwd) => { const l = Math.hypot(fwd[0], fwd[2]) || 1; return [fwd[0] / l, 0, fwd[2] / l]; };
const at = (ear, ...parts) => { const p = [...ear]; for (const [v, k] of parts) { p[0] += v[0] * k; p[1] += v[1] * k; p[2] += v[2] * k; } return p; };
const UP = [0, 1, 0];
/** @param {() => number} rand @param {number} a @param {number} b */
const between = (rand, a, b) => a + (b - a) * rand();
/** @template T @param {() => number} rand @param {ReadonlyArray<T>} list @returns {T} */
const pick = (rand, list) => list[Math.min(list.length - 1, Math.floor(rand() * list.length))];

/**
 * @typedef {{ ear: number[], fwd: number[], bow?: number[] | null, way: number, wind: number, gust: number, weather: string,
 *   night: boolean, nearLand: boolean, minute: number, paused: boolean }} SeaFrame
 */

/** @param {{ engine?: any, rand?: () => number }} [opts] */
export function createSeaAir({ engine = defaultAudio, rand = Math.random } = {}) {
  let t = 0, on = false, lastMinute = null, lastBellT = -Infinity, pace = NORMAL_PACE, gullIn = 0;
  /** @type {Array<{ at: number, play: (s: SeaFrame) => void }>} */
  let due = [];
  const play = (clip, pos, volume, { pitch = 1, ref = 3, max = 120 } = {}) => {
    try { engine.play3d(clip, pos, volume, { refDistance: ref, maxDistance: max, pitch, far: SEA_FAR }); } catch { }
  };
  const bed = (spec, v) => {
    if (!ensureBed(engine, spec.bed)) return;
    try { engine.setBed(spec.name, v.volume > 0.002 ? spec.bed : null, v); } catch { }
  };
  const reset = () => { lastMinute = null; due = []; gullIn = 0; pace = NORMAL_PACE; };
  const seed = () => { gullIn = between(rand, 2, GULL_GAP_S[0]); };
  /** @param {SeaFrame} c */
  const headingOf = (c) => flatOf(c.bow ?? c.fwd ?? [0, 0, 1]);
  return {
    get on() { return on; },
    /** @param {number} dt @param {SeaFrame} s */
    frame(dt, s) {
      if (!s || !Array.isArray(s.ear) || s.ear.length !== 3) return;
      const step = Math.max(0, Math.min(0.25, Number(dt) || 0));
      // The event clock stops while paused, so strokes queued before a pause do not all ring on the unpause frame.
      if (!s.paused) t += step;
      if (!on) seed();
      on = true;
      const state = seaState(s.wind, s.weather);
      bed(SEA_BEDS.swell, swellBed(state, t));
      bed(SEA_BEDS.wash, washBed(s.way, state, t));
      bed(SEA_BEDS.rigging, riggingBed(s.wind, s.gust, s.weather));
      if (s.paused || step === 0) return;
      if (gullsAbout(s)) {
        if ((gullIn -= step) <= 0) {
          const az = between(rand, -Math.PI, Math.PI), d = between(rand, 25, 70), h = between(rand, 12, 30);
          /** @param {number[]} ear @param {number} k */
          const gull = (ear, k) => play(pick(rand, SCAPE_SFX.gull), [ear[0] + Math.sin(az) * d * k, ear[1] + h, ear[2] + Math.cos(az) * d * k], between(rand, 0.35, 0.6), { pitch: between(rand, 0.92, 1.08), ref: 18, max: 400 });
          gull(s.ear, 1);
          if (rand() < GULL_PAIR) due.push({ at: t + between(rand, 0.5, 1.6), play: (c) => gull(c.ear, 0.9) });
          gullIn = between(rand, GULL_GAP_S[0], GULL_GAP_S[1]);
        }
      } else gullIn = between(rand, 2, GULL_GAP_S[0]);
      const minute = Number(s.minute);
      if (Number.isFinite(minute)) {
        if (lastMinute != null) {
          const dm = ((minute - lastMinute) % 1440 + 1440 + 720) % 1440 - 720;
          if (Math.abs(dm) <= 30) pace += (dm / step - pace) * Math.min(1, step / BELL_PACE_TAU_S);
        }
        // Bells ring only when one half hour passes at the world's own pace, so a load, rest, or jump strikes none.
        const half = Math.floor(minute / 30);
        if (lastMinute != null && ((half - Math.floor(lastMinute / 30)) % 48 + 48) % 48 === 1 && pace <= BELL_MAX_PACE && t - lastBellT >= BELL_MIN_REAL_S) {
          lastBellT = t;
          for (const k of bellStrokes(watchBells((half * 30) % 1440))) due.push({ at: t + k, play: (c) => play(BELL_CLIP, at(c.ear, [headingOf(c), 3], [UP, 2.5]), 0.4, { pitch: BELL_PITCH, ref: 6, max: 300 }) });
        }
        lastMinute = minute;
      }
      if (due.length) {
        const now = due.filter((d) => d.at <= t);
        if (now.length) { due = due.filter((d) => d.at > t); for (const d of now) d.play(s); }
      }
    },
    stop() {
      reset();
      if (!on) return;
      on = false;
      try {
        for (const spec of Object.values(SEA_BEDS)) engine.setBed(spec.name, null);
        engine.fadeFar?.(SEA_FAR);
      } catch { }
    },
  };
}
