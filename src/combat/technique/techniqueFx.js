import { getPref } from '../../ui/uiPrefs.js';
import { enhancedSoundsOn } from '../../audio/enhancedSounds.js';
import { SOUND } from '../../audio/soundClips.js';

const DEG = Math.PI / 180;

// The hands only dip: first-person sprites sit flush on a screen edge, so a push up or sideways shows their edge.
export const FX_CH = Object.freeze({ pitch: 0, roll: 1, eye: 2, fov: 3, hands: 4 });
export const FX_K = Object.freeze([17, 11, 14, 9, 15]);
const N = FX_K.length;
const _sv = new Float64Array(N * 2);
let _live = false;
const REST_X = 1e-5, REST_V = 1e-4;

// Classes, not object literals, keep these number-only shapes separate so per-frame writes do not box the numbers.
class TechView { constructor() { this.pitch = 0; this.roll = 0; this.eye = [0, 0, 0]; this.fov = 0; } }
class TechHands { constructor() { this.y = 0; } }
const VIEW = new TechView();
const HANDS = new TechHands();

// Peaks in screen terms: pitch, roll, and fov in degrees (up, lean right, and wider are positive), eye in meters.
// Roll stays within 3 degrees because the sky backdrop does not roll.
const f = Object.freeze;
export const TECH_FX = f({
  volley: f({
    release: f({ cam: f({ pitch: 0.9, fov: -2 }), hands: f({ y: 0.03 }) }),
    loose: f({ burst: 'flare' }),
    shaft: f({ burst: 'shaft' }),
    close: f({ burst: 'close', shake: 0.5 }),
  }),
  pierce: f({
    release: f({ cam: f({ fov: -1.5 }) }),
    loose: f({ cam: f({ pitch: 1.4, fov: -3.5 }), hands: f({ y: 0.05 }), shake: 0.8, burst: 'tracer' }),
  }),
  leap: f({
    release: f({ cam: f({ fov: 7, pitch: -1 }), sound: f(['SwingLowPitch', 0.9, 0.8]) }),
    hit: f({ cam: f({ pitch: -3, eye: -0.12, fov: -4 }), hands: f({ y: 0.08 }), shake: 2.6, burst: 'land', r: 2.5, sound: f(['FallHard', 0.9, 0.85]) }),
  }),
  kick: f({
    release: f({ cam: f({ fov: 6, pitch: -0.8 }), sound: f(['SwingLowPitch', 0.8, 0.95]) }),
    hit: f({ cam: f({ pitch: -2.2, eye: -0.09 }), hands: f({ y: 0.06 }), shake: 1.8, burst: 'land', r: 2, sound: f(['FallHard', 0.75, 1.05]) }),
  }),
  whirlwind: f({
    release: f({ cam: f({ roll: -3 }), sound: f(['SwingMediumPitch', 1, 0.75]) }),
    hit: f({ cam: f({ roll: 2 }), hands: f({ y: 0.04 }), shake: 0.9, burst: 'sweep', r: 3 }),
  }),
  slam: f({
    release: f({ cam: f({ pitch: 2 }), sound: f(['SwingLowPitch', 1, 0.7]) }),
    hit: f({ cam: f({ pitch: -3.5, eye: -0.14, fov: -3 }), hands: f({ y: 0.11 }), shake: 3.2, burst: 'shock', r: 3.5, sound: f(['FallHard', 1, 0.7]) }),
  }),
  crush: f({
    release: f({ cam: f({ pitch: 1.2 }), sound: f(['SwingLowPitch', 0.9, 0.85]) }),
    hit: f({ cam: f({ pitch: -2.2 }), hands: f({ y: 0.07 }), shake: 1.6, burst: 'star' }),
  }),
  haymaker: f({
    release: f({ cam: f({ fov: -3, roll: -2 }), sound: f(['SwingLowPitch', 0.9, 0.95]) }),
    hit: f({ cam: f({ pitch: -1.2, fov: 2, roll: 1.5 }), hands: f({ y: 0.05 }), shake: 1.4, burst: 'punch' }),
  }),
  cleave: f({
    release: f({ cam: f({ roll: -2.5 }), sound: f(['SwingMediumPitch', 1, 0.8]) }),
    hit: f({ cam: f({ roll: 2.5, pitch: -0.8 }), hands: f({ y: 0.05 }), shake: 1.1, burst: 'arc', r: 3.2 }),
  }),
  execute: f({
    release: f({ cam: f({ pitch: 1.6 }), sound: f(['SwingLowPitch', 1, 0.75]) }),
    hit: f({ cam: f({ pitch: -2.8, eye: -0.06 }), hands: f({ y: 0.09 }), shake: 2, burst: 'chop' }),
  }),
  shadowstep: f({
    release: f({ cam: f({ fov: 8, roll: -2 }), burst: 'vanish', sound: f(['SwingHighPitch', 0.8, 1.25]) }),
    hit: f({ cam: f({ fov: -3, roll: 2 }), hands: f({ y: 0.05 }), shake: 1, burst: 'star' }),
  }),
  lunge: f({
    release: f({ cam: f({ fov: 7, pitch: -0.6 }), sound: f(['SwingMediumPitch', 0.9, 1.1]) }),
    hit: f({ cam: f({ pitch: -1.4, fov: -3 }), hands: f({ y: 0.06 }), shake: 1.2, burst: 'trail' }),
  }),
  skyfall: f({
    'wind-up': f({ cam: f({ fov: -1 }), burst: 'gather' }),
    release: f({ cam: f({ pitch: 0.6 }), hands: f({ y: 0.025 }) }),
    loose: f({ burst: 'shock', r: 3.3, shake: 0.65 }),
    shaft: f({ burst: 'tracer' }),
  }),
  verdict: f({
    'wind-up': f({ cam: f({ fov: -3 }), hands: f({ y: 0.035 }), burst: 'gather' }),
    loose: f({ cam: f({ pitch: 1.9, fov: -3.5 }), hands: f({ y: 0.06 }), shake: 1.5, burst: 'tracer' }),
  }),
  siege: f({
    'wind-up': f({ cam: f({ fov: -2 }), hands: f({ y: 0.09 }), burst: 'gather', r: 2.2 }),
    loose: f({ cam: f({ pitch: 2, fov: 2 }), hands: f({ y: 0.10 }), shake: 1.6, burst: 'muzzle-wave' }),
  }),
  flurry: f({
    'wind-up': f({ cam: f({ fov: -1.5 }), burst: 'gather' }),
    hit: f({ cam: f({ pitch: -0.45 }), hands: f({ y: 0.02 }), shake: 0.35, burst: 'punch' }),
  }),
  measure: f({
    'wind-up': f({ cam: f({ fov: -2 }), burst: 'gather', r: 2 }),
    release: f({ cam: f({ roll: -2.5 }), sound: f(['SwingMediumPitch', 1, 0.8]) }),
    hit: f({ cam: f({ roll: 2.5, pitch: -0.8 }), shake: 0.8, burst: 'arc', r: 4.25 }),
  }),
  measureFinish: f({
    release: f({ cam: f({ fov: 2 }), hands: f({ y: 0.04 }) }),
    hit: f({ cam: f({ fov: -3, pitch: -1 }), shake: 1.35, burst: 'tracer' }),
  }),
  flurryFinish: f({
    release: f({ cam: f({ fov: 2 }), hands: f({ y: 0.04 }) }),
    hit: f({ cam: f({ pitch: -1.5, fov: -2 }), shake: 1.35, burst: 'muzzle-wave' }),
  }),
  markTarget: f({
    hit: f({ burst: 'close', r: 1.15 }),
  }),
  rally: f({
    'wind-up': f({ cam: f({ fov: -2 }), hands: f({ y: .06 }), burst: 'gather', r: 2.5 }),
    release: f({ cam: f({ fov: 2 }), burst: 'land', r: 2.6 }),
    hit: f({ cam: f({ fov: 1 }), burst: 'shock', r: 2.3 }),
  }),
  sweep: f({
    'wind-up': f({ cam: f({ roll: -1.4 }), hands: f({ y: .045 }) }),
    release: f({ cam: f({ roll: 1.5 }) }),
    hit: f({ burst: 'sweep', shake: 1.1 }),
  }),
  quake: f({
    'wind-up': f({ cam: f({ fov: -2.3 }), hands: f({ y: .07 }), burst: 'gather' }),
    release: f({ cam: f({ pitch: 2, fov: 2 }) }),
    hit: f({ burst: 'shock', shake: 2.1 }),
  }),
  frostRush: f({
    'wind-up': f({ cam: f({ fov: -2 }), hands: f({ y: 0.04 }), burst: 'gather', r: 1.5 }),
    release: f({ cam: f({ fov: 4, pitch: -0.8 }), burst: 'frost-rush', r: 1.4 }),
    hit: f({ cam: f({ pitch: -1.1 }), shake: 0.8, burst: 'frost-rush', r: 1.9 }),
  }),
  ashRush: f({
    'wind-up': f({ cam: f({ fov: -1.4 }), hands: f({ y: 0.035 }) }),
    release: f({ cam: f({ fov: 3, roll: -1.4 }), burst: 'ash-rush', r: 1.6 }),
    hit: f({ cam: f({ roll: 1.4 }), shake: 0.5, burst: 'ash-rush', r: 1.5 }),
  }),
});

export function techniqueMotion() {
  const v = Number(getPref('techniqueMotion'));
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
}

function kick(ch, peak) {
  if (!peak) return;
  _sv[ch * 2 + 1] += peak * FX_K[ch] * Math.E;
  _live = true;
}

// Roll is kicked negated because every host lens mirrors the camera X axis (world/mat4.js mirrorProjectionX).
/**
 * @param {{ pitch?: number, roll?: number, eye?: number, fov?: number }|null|undefined} c
 * @param {{ y?: number }|null|undefined} hands
 * @param {number} [m]
 */
export function kickFx(c, hands, m = 1) {
  if (!(m > 0)) return;
  if (c) { kick(FX_CH.pitch, (c.pitch ?? 0) * DEG * m); kick(FX_CH.roll, -(c.roll ?? 0) * DEG * m); kick(FX_CH.eye, (c.eye ?? 0) * m); kick(FX_CH.fov, (c.fov ?? 0) * m); }
  if (hands?.y > 0) kick(FX_CH.hands, hands.y * m);
}

export function techniqueCue(id, moment, door = null, place = null) {
  const row = TECH_FX[id]?.[moment];
  if (!row) return false;
  const m = techniqueMotion();
  if (m > 0) {
    kickFx(row.cam, row.hands, m);
    if (row.shake) door?.shake?.(row.shake * m);
  }
  if (row.burst && place?.at) door?.fx?.(row.burst, place.at, row.r != null ? { ...place, r: row.r } : place);
  if (row.sound && enhancedSoundsOn()) {
    const clip = SOUND[row.sound[0]];
    if (clip != null) door?.sound?.(clip, row.sound[1], row.sound[2]);
  }
  return true;
}

export function stepTechniqueFx(dt) {
  if (!_live || !(dt > 0)) return;
  let any = false;
  for (let i = 0; i < N; i++) {
    const x = _sv[i * 2], v = _sv[i * 2 + 1];
    if (x === 0 && v === 0) continue;
    const k = FX_K[i], e = Math.exp(-k * dt), b = v + k * x;
    let x1 = (x + b * dt) * e, v1 = (v - k * b * dt) * e;
    if (Math.abs(x1) < REST_X && Math.abs(v1) < REST_V) { x1 = 0; v1 = 0; } else any = true;
    _sv[i * 2] = x1; _sv[i * 2 + 1] = v1;
  }
  _live = any;
  VIEW.pitch = _sv[FX_CH.pitch * 2]; VIEW.roll = _sv[FX_CH.roll * 2]; VIEW.eye[1] = _sv[FX_CH.eye * 2]; VIEW.fov = _sv[FX_CH.fov * 2];
  HANDS.y = _sv[FX_CH.hands * 2];
}

export const techniqueView = () => VIEW;
export const techniqueHands = () => HANDS;
export const techniqueFxLive = () => _live;

export function resetTechniqueFx() {
  _sv.fill(0);
  _live = false;
  VIEW.pitch = 0; VIEW.roll = 0; VIEW.eye[1] = 0; VIEW.fov = 0;
  HANDS.y = 0;
}
