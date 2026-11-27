// @ts-check
import { segmentBoxEntry, toBoxLocal, flatUnit } from './navalBallistics.js';
import { batteryOf, SIDE_DIR } from './navalShips.js';
import { toWorld } from './navalGunnery.js';
import { quatRotate } from '../../world/quat.js';

export const AIM_CAM_OUT = 4;
export const AIM_CAM_UP = 5.5;
export const AIM_CAM_AFT = 3;
export const AIM_CAM_TAU = 0.22;
export const AIM_CAM_CLEAR = 1.2;
export const AIM_CAM_AHEAD = 4;

const isEnd = (side) => side === 'bow' || side === 'stern';
const inside = (box, p, pad) => { const l = toBoxLocal(box, p); return Math.abs(l[0]) <= box.h[0] + pad && Math.abs(l[1]) <= box.h[1] + pad && Math.abs(l[2]) <= box.h[2] + pad; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const reachAlong = (box, d) => dot(box.c, d) + Math.abs(dot(box.ax, d)) * box.h[0] + Math.abs(dot(box.ay, d)) * box.h[1] + Math.abs(dot(box.az, d)) * box.h[2];
const UP = Object.freeze([0, 1, 0]);

export function endEye(side, c, fwd, own) {
  if (side === 'bow') {
    const along = Math.max(dot(c, fwd) + AIM_CAM_AHEAD, ...own.filter(Boolean).map((b) => reachAlong(b, fwd) + AIM_CAM_CLEAR));
    const k = along - dot(c, fwd);
    return [c[0] + fwd[0] * k, c[1] + AIM_CAM_UP, c[2] + fwd[2] * k];
  }
  const p = [c[0], c[1] + AIM_CAM_UP, c[2]];
  for (let pass = 0; pass <= own.length; pass++) {
    const over = own.filter((b) => b && inside(b, p, AIM_CAM_CLEAR));
    if (!over.length) break;
    p[1] = Math.max(...over.map((b) => reachAlong(b, UP) + AIM_CAM_CLEAR));
  }
  return p;
}
const toLocal = (pose, p) => {
  const q = pose.rotation;
  return quatRotate([-q[0], -q[1], -q[2], q[3]], [p[0] - pose.position[0], p[1] - pose.position[1], p[2] - pose.position[2]]);
};

/**
 * @param {object} deps
 * @param {(key: string, dflt: any) => any} deps.setting
 * @param {() => boolean} deps.aiming
 * @param {() => ({ side: string } | null)} deps.aim
 * @param {() => any} deps.boat
 * @param {(boat: any) => boolean} deps.wrecked
 * @param {(boat: any) => { position: number[], rotation: number[] }} deps.pose
 * @param {() => Iterable<any>} deps.alongside
 * @param {(boat: any) => any} deps.hull
 * @param {(boat: any) => any[]} deps.rig
 */
export function createAimCamera(deps) {
  let camK = 0, camSide = null, camLocal = /** @type {number[] | null} */ (null);
  function eye(ownEye, dt) {
    const boat = deps.boat();
    const aim = deps.aim();
    const want = deps.setting('AimCamera', true) !== false && deps.aiming() && boat && aim && aim.side
      && !deps.wrecked(boat) ? aim.side : null;
    if (want) camSide = want;
    camK += ((want ? 1 : 0) - camK) * (1 - Math.exp(-Math.max(0, dt) / AIM_CAM_TAU));
    if (!want && camK < 1e-3) { camK = 0; camSide = null; camLocal = null; }
    if (!boat || !camSide || camK <= 0) return ownEye;
    const pose = deps.pose(boat);
    const bat = batteryOf(boat.hull, camSide);
    if (!bat) return ownEye;
    const ports = bat.muzzles.map((m) => toWorld(pose, m));
    const c = ports.reduce((acc, m) => [acc[0] + m[0] / ports.length, acc[1] + m[1] / ports.length, acc[2] + m[2] / ports.length], [0, 0, 0]);
    const fire = flatUnit(quatRotate(pose.rotation, SIDE_DIR[camSide])) ?? [1, 0, 0];
    const fwd = flatUnit(quatRotate(pose.rotation, [0, 0, 1])) ?? [0, 0, 1];
    let at = isEnd(camSide)
      ? endEye(camSide, c, fwd, [deps.hull(boat), ...deps.rig(boat)])
      : [c[0] + fire[0] * AIM_CAM_OUT - fwd[0] * AIM_CAM_AFT, c[1] + AIM_CAM_UP, c[2] + fire[2] * AIM_CAM_OUT - fwd[2] * AIM_CAM_AFT];
    let clear = 1;
    for (const box of deps.alongside()) {
      const hit = box ? segmentBoxEntry(c, at, box, AIM_CAM_CLEAR) : null;
      if (hit && hit.t < clear) clear = hit.t;
    }
    if (clear < 1) at = [c[0] + (at[0] - c[0]) * clear, c[1] + (at[1] - c[1]) * clear, c[2] + (at[2] - c[2]) * clear];
    const local = toLocal(pose, at);
    const step = 1 - Math.exp(-Math.max(0, dt) / AIM_CAM_TAU);
    camLocal = camLocal ? camLocal.map((v, i) => v + (local[i] - v) * step) : local;
    at = toWorld(pose, camLocal);
    const k = camK * camK * (3 - 2 * camK);
    return [ownEye[0] + (at[0] - ownEye[0]) * k, ownEye[1] + (at[1] - ownEye[1]) * k, ownEye[2] + (at[2] - ownEye[2]) * k];
  }
  return { eye };
}
