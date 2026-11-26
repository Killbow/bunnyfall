// @ts-check
import { POSE_SEAT_TOP_MAX } from '../net/wire.js';
import { EYE_HEIGHT } from './motor.js';
import { climbRequestToRig } from '../combat/climbRig.js';

export const SEAT_TOP_STEP = 0.05;
export const SEAT_TOP_DEFAULT = 0.8;

export const SEAT_HIP_DROP = 0.48;
export const SEAT_PELVIS_HEIGHT = 1.09;
export const SEATED_HIP_HEIGHT = SEAT_PELVIS_HEIGHT - SEAT_HIP_DROP;
export const SEATED_EYE_HEIGHT = EYE_HEIGHT - SEAT_HIP_DROP;
export const SEAT_OUT = 0.35;
export const SEAT_HAND_ON = 0.1;
export const SEAT_FOOT_AHEAD = 0.45;
export const SEAT_FOOT_SIDE = 0.12;
export const SEAT_ANKLE = 0.08;
export const SEAT_HAND_SIDE = 0.2;
export const SEAT_HAND_OVER = 0.04;

export const seatedMotion = (bag) => ({ ...bag, forward: 0, strafe: 0, running: false, speed: 0, standing: true, riding: false, jumping: false });
export const seatedCamera = (cam) => (cam && (cam.seat || cam.saddle) && cam.move ? { ...cam, move: seatedMotion(cam.move) } : cam);

export const seatTopByte = (top) => Math.min(POSE_SEAT_TOP_MAX, Math.max(1, Math.round((Number(top) || 0) / SEAT_TOP_STEP)));
export const seatTopOf = (st) => (Number.isInteger(st) && st >= 1 && st <= POSE_SEAT_TOP_MAX ? st * SEAT_TOP_STEP : SEAT_TOP_DEFAULT);

/**
 * @param {number[]} feet
 * @param {number} yaw
 * @param {number} [top]
 * @param {{weight?: number, height?: number}} [race]
 */
export function seatRigInput(feet, yaw, top = SEAT_TOP_DEFAULT, race = {}) {
  const h = race.height ?? 1, w = race.weight ?? 1;
  const f = [Math.sin(yaw), 0, Math.cos(yaw)];
  const r = [Math.cos(yaw), 0, 0 - Math.sin(yaw)];
  const at = (ahead, side, up) => [feet[0] + f[0] * ahead + r[0] * side, feet[1] + up, feet[2] + f[2] * ahead + r[2] * side];
  const elbow = (side) => { const v = [r[0] * side + 0, -1, r[2] * side + 0]; const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
  const hand = (side) => ({ at: at(SEAT_OUT + SEAT_HAND_ON, side * SEAT_HAND_SIDE * w, top + SEAT_HAND_OVER), fingers: f.slice(), palm: [0, -1, 0], pole: elbow(side), w: 1, curl: 0.3 });
  const foot = (side) => ({ at: at(SEAT_FOOT_AHEAD * w, side * SEAT_FOOT_SIDE * w, SEAT_ANKLE * h), toe: f.slice(), pole: f.slice(), w: 1 });
  return {
    origin: [feet[0], feet[1], feet[2]],
    yaw,
    req: {
      w: 1,
      offset: [0, -SEAT_HIP_DROP * h, 0],
      hands: { L: hand(-1), R: hand(1) },
      feet: { L: foot(-1), R: foot(1) },
    },
  };
}

/**
 * @param {{feet: number[], yaw: number, top?: number} | null | undefined} seat
 * @param {{unitsPerMetre: number, weight?: number, height?: number}} rig
 */
export function seatRequestFor(seat, { unitsPerMetre, weight = 1, height = 1 }) {
  if (!seat || !seat.feet) return null;
  const s = seatRigInput(seat.feet, seat.yaw, seat.top, { weight, height });
  return climbRequestToRig(s.req, { feet: s.origin, yaw: s.yaw, unitsPerMetre, weight, height });
}

export const STIRRUP_SIDE = 0.32;
export const STIRRUP_DROP = 0.8;
export const STIRRUP_AHEAD = 0.08;
export const REIN_AHEAD = 0.36;
export const REIN_UP = 0.18;
export const REIN_SIDE = 0.12;
export const SADDLE_LEAN_GALLOP = 0.28;

/**
 * @param {number[]} feet
 * @param {{ seat: number[], yaw: number, lean?: number }} saddle
 * @param {{weight?: number, height?: number}} [race]
 */
export function saddleRigInput(feet, saddle, race = {}) {
  const h = race.height ?? 1, w = race.weight ?? 1;
  const yaw = saddle.yaw;
  const f = [Math.sin(yaw), 0, Math.cos(yaw)];
  const right = [Math.cos(yaw), 0, 0 - Math.sin(yaw)];
  const hips = saddle.seat;
  const at = (ahead, side, up) => [hips[0] + f[0] * ahead + right[0] * side, hips[1] + up, hips[2] + f[2] * ahead + right[2] * side];
  const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l + 0, v[1] / l + 0, v[2] / l + 0]; };
  const stirrup = (side) => ({ at: at(STIRRUP_AHEAD * h, side * STIRRUP_SIDE, -STIRRUP_DROP * h), toe: unit([f[0] + right[0] * side * 0.3, 0, f[2] + right[2] * side * 0.3]),
    pole: unit([f[0] * 0.85 + right[0] * side * 0.5, 0, f[2] * 0.85 + right[2] * side * 0.5]), w: 1 });
  const rein = (side) => ({ at: at(REIN_AHEAD * h, side * REIN_SIDE * w, REIN_UP * h), fingers: f.slice(), palm: unit([0, -1, 0]),
    pole: unit([right[0] * side * 0.6 - f[0] * 0.3, -0.75, right[2] * side * 0.6 - f[2] * 0.3]), w: 1, curl: 1.2 });
  return {
    origin: [feet[0], feet[1], feet[2]],
    yaw,
    req: {
      w: 1,
      offset: [hips[0] - feet[0], hips[1] - feet[1] - SEAT_PELVIS_HEIGHT * h, hips[2] - feet[2]],
      lean: { pitch: SADDLE_LEAN_GALLOP * Math.min(1, Math.max(0, saddle.lean ?? 0)), roll: 0 },
      hands: { L: rein(-1), R: rein(1) },
      feet: { L: stirrup(-1), R: stirrup(1) },
    },
  };
}

/**
 * @param {{feet: number[], seat: number[], yaw: number, lean?: number} | null | undefined} saddle
 * @param {{unitsPerMetre: number, weight?: number, height?: number}} rig
 */
export function saddleRequestFor(saddle, { unitsPerMetre, weight = 1, height = 1 }) {
  if (!saddle || !saddle.feet || !saddle.seat) return null;
  const s = saddleRigInput(saddle.feet, saddle, { weight, height });
  return climbRequestToRig(s.req, { feet: s.origin, yaw: s.yaw, unitsPerMetre, weight, height });
}
