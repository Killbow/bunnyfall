// @ts-check
// Course rules of the Unmoored Steps: where each step sits, how it moves on the anchored clock, and what the void
// does to a body that falls. Pure. The platform clock lives in net/eliteGates/egSpanLaw.js.
import { SD_ARENA } from '../net/sdBrain.js';
import { SD_FIRST_STEP } from './sdHall.js';
import { courseOf, EG_BEAT_CYCLE_S, EG_BEAT_SOLID_S, EG_BEAT_BLINK_S, EG_CRUMBLE_DELAY_S } from '../net/eliteGates/egSpanLaw.js';
export { stepAt, beatStands, beatBlinks, beatWarned } from '../net/eliteGates/egSpanLaw.js';

export const SD_VOID_Y = -30;
export const SD_CAST_BACK_LOSS = 0.15;
export const SD_STEP_THICK = 0.6;
export const SD_DRIFT_SIZE = Object.freeze({ w: 3.0, d: 2.4 });
export const SD_BEAT_SIZE = Object.freeze({ w: 3.0, d: 2.6 });
export const SD_CRUMBLE_SIZE = Object.freeze({ w: 2.6, d: 2.6 });
export const SD_RISER_H = 2.3;
export const SD_BEAT_CYCLE = EG_BEAT_CYCLE_S;
export const SD_BEAT_SOLID = EG_BEAT_SOLID_S;
export const SD_BEAT_HALF = SD_BEAT_CYCLE / 2;
export const SD_BEAT_BLINK = EG_BEAT_BLINK_S;
export const SD_CRUMBLE_DELAY = EG_CRUMBLE_DELAY_S;
export const SD_CRUMBLE_BACK = 5;
export const SD_CRUMBLE_FALL_G = 9.8;
export const SD_GUST_EVERY = 6;
export const SD_GUST_FOR = 1;
export const SD_GUST_SPEED = 3;
export const SD_GUST_WARN = 1;

const DRIFT_GAPS = [2.6, 2.8, 2.4, 3.0, 2.6, 3.2, 2.8, 2.6, 2.6];
const DRIFT_AMPS = [1.2, 1.6, 1.0, 1.8, 1.4, 2.0, 1.6, 1.2];
const DRIFT_PERIODS = [4, 5, 6, 4.5, 7, 5.5, 6.5, 5];
const BEAT_PLAN = [['beat', 2.6], ['beat', 2.8], ['beat', 2.6], ['riser', 0], ['beat', 2.6], ['beat', 2.8], ['riser', 0], ['beat', 2.6], ['beat', 2.8]];
const BEAT_TO_C = 2.6;
const CRUMBLE_GAPS = [2.6, 2.4, 2.8, 2.6, 2.8, 2.6, 2.8, 2.6];
const CRUMBLE_TO_ARENA = 2.4;
const CHECK_R = 3;

export const SD_COURSE_SPEC = (() => {
  const size = (q) => Object.freeze({ w: q.w, d: q.d });
  const drift = [];
  for (let k = 0; k < 8; k++) drift.push(Object.freeze({ kind: 'drift', gap: DRIFT_GAPS[k], size: size(SD_DRIFT_SIZE), ...{ amp: DRIFT_AMPS[k], period: DRIFT_PERIODS[k], phase: k * 0.9 } }));
  let beat = 0;
  const beats = BEAT_PLAN.map(([kind, gap]) => Object.freeze(kind === 'riser' ? { kind, gap, size: size(SD_BEAT_SIZE), rise: SD_RISER_H }
    : { kind, gap, size: size(SD_BEAT_SIZE), beat: (beat++ % 2) * SD_BEAT_HALF }));
  const crumble = CRUMBLE_GAPS.map((gap) => Object.freeze({ kind: 'crumble', gap, size: size(SD_CRUMBLE_SIZE) }));
  return Object.freeze({
    start: Object.freeze({ x: SD_FIRST_STEP.x, y: 0, z: SD_FIRST_STEP.z, r: SD_FIRST_STEP.r }), checkR: CHECK_R, toEnd: CRUMBLE_TO_ARENA,
    sections: Object.freeze([
      Object.freeze({ pieces: Object.freeze(drift), check: DRIFT_GAPS[8] }),
      Object.freeze({ pieces: Object.freeze(beats), check: BEAT_TO_C }),
      Object.freeze({ pieces: Object.freeze(crumble), check: null, descend: true }),
    ]),
  });
})();
const frozenCourse = (c) => Object.freeze({ steps: Object.freeze(c.steps.map((s) => Object.freeze(s))), checkpoints: Object.freeze(c.checkpoints.map((q) => Object.freeze(q))), end: c.end });
export const SD_COURSE = frozenCourse(courseOf(SD_COURSE_SPEC));
export const SD_STEPS_COURSE = SD_COURSE.steps;
export const SD_CHECKPOINTS = SD_COURSE.checkpoints;
export const SD_COURSE_END = SD_COURSE.end;
export const SD_STEPS_FREE = Object.freeze({ z0: SD_FIRST_STEP.z + SD_FIRST_STEP.r - 0.4, z1: SD_ARENA.z - SD_ARENA.r + 0.4 });
export const SD_STEPS_FREE_HALF_W = 40;
export const SD_STEPS_FLOORS = Object.freeze([
  Object.freeze({ kind: 'band', x: 0, z0: SD_STEPS_FREE.z0, z1: SD_STEPS_FREE.z1, halfW: SD_STEPS_FREE_HALF_W }),
  Object.freeze({ kind: 'disc', ...SD_ARENA }),
]);
export function spanAt(z, course = SD_COURSE) {
  const C = course.checkpoints;
  for (let k = C.length - 1; k >= 0; k--) if (z >= C[k].z - C[k].r) return k;
  return -1;
}

export function crumbleAfter(since, out = { drop: 0, whole: true, shaking: false }) {
  if (since == null || since < 0 || since >= SD_CRUMBLE_DELAY + SD_CRUMBLE_BACK) { out.drop = 0; out.whole = true; out.shaking = false; return out; }
  if (since < SD_CRUMBLE_DELAY) { out.drop = 0; out.whole = true; out.shaking = true; return out; }
  const f = since - SD_CRUMBLE_DELAY;
  out.drop = 0.5 * SD_CRUMBLE_FALL_G * f * f; out.whole = false; out.shaking = false;
  return out;
}
const gustSign = (n) => (n % 2 === 0 ? 1 : -1);
export function gustAt(t, out = { push: 0, warn: false }) {
  const n = Math.floor(t / SD_GUST_EVERY), u = t - n * SD_GUST_EVERY;
  out.push = u < SD_GUST_FOR ? gustSign(n) * SD_GUST_SPEED : 0;
  out.warn = u >= SD_GUST_EVERY - SD_GUST_WARN;
  return out;
}
export function breathSeen(t, out = { dir: 0, k: 0 }) {
  const n = Math.floor((t + SD_GUST_WARN) / SD_GUST_EVERY), u = t + SD_GUST_WARN - n * SD_GUST_EVERY, span = SD_GUST_WARN + SD_GUST_FOR;
  if (u < span) { out.dir = gustSign(n); out.k = u / span; } else { out.dir = 0; out.k = 0; }
  return out;
}
export const inBreath = (z, course = SD_COURSE) => z > course.checkpoints[2].z + course.checkpoints[2].r && z < course.end;
export const inVoid = (y) => y < SD_VOID_Y;
export const castBackTo = (span, course = SD_COURSE) => { const C = course.checkpoints, c = C[Math.max(0, Math.min(C.length - 1, span))]; return [c.x, c.y, c.z]; };
