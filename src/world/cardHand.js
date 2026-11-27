// @ts-check
import { invert4 } from '../player/tapRay.js';
import { multiply, trs, quatToMat4 } from './mat4.js';
import { CARD_W } from './cardMotion.js';

// The projection mirrors x, so the view's +X shows on the screen's left; forward is the view's -Z.
export const HELD_AT = Object.freeze([-0.03, -0.115, -0.27]);
export const HELD_FAN_DEG = 9;
export const HELD_LEAN_DEG = 58;
export const PEEK_LEAN_DEG = 14;
export const HELD_GAP = CARD_W * 0.42;
export const PEEK_GAP = CARD_W * 0.62;
export const PEEK_RISE = 0.035;
export const PEEK_RATE = 10;
export const DRAG_LIFT = 0.015;

export const FACE_THE_EYE = trs(0, 0, 0, -90, 180, 0);

export const HELD_LIFT_MAX = 0.08;
export const HELD_PANEL_GAP_PX = 10;

export const HELD_FIT_ASPECT = 0.8;
export const heldFit = (aspect) => (aspect > 0 && aspect < HELD_FIT_ASPECT ? HELD_FIT_ASPECT / aspect : 1);

/**
 * @param {ArrayLike<number>} view
 * @param {number} n
 * @param {number} [peek]
 * @param {number} [lift]
 * @param {number} [fit]
 */
export function heldMatrices(view, n, peek = 0, lift = 0, fit = 1) {
  const p = Math.max(0, Math.min(1, peek));
  const f = Math.max(1, fit);
  const camera = invert4(view);
  const lean = HELD_LEAN_DEG + (PEEK_LEAN_DEG - HELD_LEAN_DEG) * p;
  const gap = HELD_GAP + (PEEK_GAP - HELD_GAP) * p;
  return Array.from({ length: n }, (_, i) => {
    const k = i - (n - 1) / 2;
    const up = HELD_AT[1] + PEEK_RISE * p + Math.max(0, Math.min(HELD_LIFT_MAX * f, lift));
    const local = trs(HELD_AT[0] + k * gap, f * up, f * HELD_AT[2] - k * 0.002, -lean, 0, -k * HELD_FAN_DEG);
    return multiply(camera, multiply(local, FACE_THE_EYE));
  });
}

export const HELD_EASE_S = 0.25;

function quatOf(m) {
  const tr = m[0] + m[5] + m[10];
  let q;
  if (tr > 0) { const k = Math.sqrt(tr + 1) * 2; q = [(m[6] - m[9]) / k, (m[8] - m[2]) / k, (m[1] - m[4]) / k, k / 4]; }
  else if (m[0] > m[5] && m[0] > m[10]) { const k = Math.sqrt(1 + m[0] - m[5] - m[10]) * 2; q = [k / 4, (m[4] + m[1]) / k, (m[8] + m[2]) / k, (m[6] - m[9]) / k]; }
  else if (m[5] > m[10]) { const k = Math.sqrt(1 + m[5] - m[0] - m[10]) * 2; q = [(m[4] + m[1]) / k, k / 4, (m[9] + m[6]) / k, (m[8] - m[2]) / k]; }
  else { const k = Math.sqrt(1 + m[10] - m[0] - m[5]) * 2; q = [(m[8] + m[2]) / k, (m[9] + m[6]) / k, k / 4, (m[1] - m[4]) / k]; }
  return q;
}

/**
 * @param {ArrayLike<number>} a
 * @param {ArrayLike<number>} b
 * @param {number} u
 */
export function blendMatrix(a, b, u) {
  const k = Math.max(0, Math.min(1, u));
  const qa = quatOf(a), qb = quatOf(b);
  const sign = qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3] < 0 ? -1 : 1;
  const q = qa.map((v, i) => v + (qb[i] * sign - v) * k);
  const n = Math.hypot(...q) || 1;
  const m = quatToMat4(q.map((v) => v / n));
  for (let i = 0; i < 3; i++) m[12 + i] = a[12 + i] + (b[12 + i] - a[12 + i]) * k;
  return m;
}

/**
 * @param {number} bottomPx
 * @param {number} panelTopPx
 * @param {number} h
 * @param {ArrayLike<number>} proj
 * @param {number} [fit]
 */
export function heldLift(bottomPx, panelTopPx, h, proj, fit = 1) {
  const over = bottomPx - (panelTopPx - HELD_PANEL_GAP_PX);
  if (!(over > 0) || !(h > 0) || !(proj[5] > 0)) return 0;
  return Math.min(HELD_LIFT_MAX * Math.max(1, fit), (over * 2 * -HELD_AT[2]) / (proj[5] * h));
}

/**
 * @param {number[]} eye
 * @param {number[]|null} dir
 * @param {number} top
 */
export function tablePoint(eye, dir, top) {
  if (!dir || !(dir[1] < -1e-6)) return null;
  const s = (top - eye[1]) / dir[1];
  if (!(s > 0)) return null;
  return [eye[0] + dir[0] * s, top, eye[2] + dir[2] * s];
}

export const STACK_GRAB_M = 0.07;
export const onStack = (p, place) => !!p && Math.hypot(p[0] - place.stack[0], p[2] - place.stack[2]) <= STACK_GRAB_M;

/**
 * @param {number[]|null} p
 * @param {{centre: number[], axisYaw: number, halfLong: number, halfShort: number}|null|undefined} frame
 * @param {number} [inset]
 */
export function onTable(p, frame, inset = 0) {
  if (!p || !frame) return false;
  const dx = p[0] - frame.centre[0], dz = p[2] - frame.centre[2];
  const a = [Math.sin(frame.axisYaw), Math.cos(frame.axisYaw)];
  return Math.abs(dx * a[0] + dz * a[1]) <= frame.halfLong - inset && Math.abs(dx * a[1] - dz * a[0]) <= frame.halfShort - inset;
}

/**
 * @param {number[]|null} p
 * @param {{stack: number[], holes: number[][], yaw: number}} place
 * @param {any} [frame]
 */
export function inBetZone(p, place, frame = null) {
  if (!p || (frame && !onTable(p, frame))) return false;
  const f = [Math.sin(place.yaw), Math.cos(place.yaw)];
  const depth = (q) => q[0] * f[0] + q[2] * f[1];
  return depth(p) > depth(place.holes[0]) + 0.02;
}

/**
 * @param {any} legal
 * @param {number|null} sliderValue
 * @param {number} myBet
 */
export function dragBet(legal, sliderValue, myBet = 0) {
  if (!legal) return null;
  if (legal.raise && (sliderValue != null || !(legal.call > 0))) {
    const to = Math.min(legal.raise.max, Math.max(legal.raise.min, Math.floor(Number(sliderValue) || legal.raise.min)));
    return { id: 'raise', value: to, amount: to - myBet };
  }
  if (legal.call > 0) return { id: 'call', value: legal.call, amount: legal.call };
  return null;
}

export const CLICK_SLOP = 0.012;
export const CLICK_MS = 300;
export const PUSH_FOLD = 0.1;
export const SQUEEZE_PULL = 0.12;
export const SQUEEZE_RISE = CARD_W * 0.55;
export const SQUEEZE_TURN_DEG = 12;

/**
 * @param {number[]|null} from
 * @param {number[]|null} to
 * @param {number} ms
 * @param {number} h
 */
export function handGesture(from, to, ms, h) {
  if (!from || !to || !(h > 0)) return null;
  const dx = (to[0] - from[0]) / h, dy = (to[1] - from[1]) / h;
  if (Math.hypot(dx, dy) <= CLICK_SLOP && ms <= CLICK_MS) return 'click';
  if (-dy >= PUSH_FOLD && -dy > Math.abs(dx)) return 'push';
  return null;
}
/**
 * @param {number[]|null} from
 * @param {number[]|null} to
 * @param {number} h
 */
export function squeezeOf(from, to, h) {
  if (!from || !to || !(h > 0)) return null;
  const pull = (to[1] - from[1]) / h;
  return pull > CLICK_SLOP ? Math.min(1, (pull - CLICK_SLOP) / SQUEEZE_PULL) : null;
}
/**
 * The held card's top points up the screen, so the squeeze draws it toward its foot (-Z) to follow a finger pulling
 * down.
 * @param {ArrayLike<number>} m
 * @param {number} s
 */
export function squeezeMatrix(m, s) {
  const k = Math.max(0, Math.min(1, s));
  return multiply(m, trs(0, 0, -SQUEEZE_RISE * k, 0, SQUEEZE_TURN_DEG * k, 0));
}
