// Touch lock-on: a tap locks an enemy, the camera faces its chest, and the host draws the dot.
// This game's own feature; Daggerfall Unity has no touch input.

import { wrapAngle } from '../world/mat4.js';

export const LOCK_PICK_DISTANCE = 24;
export const LOCK_BREAK_DISTANCE = 32;
export const LOCK_FACE_GAIN = 8;
export const CHEST_FRACTION = 0.6;

export { wrapAngle };

export function chestPoint(foe) {
  const feet = foe?.ai?.feet;
  if (!feet) return null;
  const h = foe.ai?.height ?? 1.8;
  return [feet[0], feet[1] + h * CHEST_FRACTION, feet[2]];
}

export function createLockOn({
  breakDistance = LOCK_BREAK_DISTANCE,
  gain = LOCK_FACE_GAIN,
} = {}) {
  let target = null;
  return {
    get target() { return target; },
    get locked() { return target !== null; },
    lock(foe) { target = foe ?? null; },
    unlock() { target = null; },
    toggle(foe) {
      target = (target === foe) ? null : (foe ?? null);
      return target;
    },
    tick(dt, cam, eye, lookFilter) {
      if (!target) return null;
      if (target.dead) { target = null; return null; }
      const chest = chestPoint(target);
      if (!chest) { target = null; return null; }
      const dx = chest[0] - eye[0], dy = chest[1] - eye[1], dz = chest[2] - eye[2];
      const horiz = Math.hypot(dx, dz);
      if (Math.hypot(horiz, dy) > breakDistance) { target = null; return null; }
      // The error is to the look target (camera plus the filter's owed look); using the camera alone overshoots.
      const yawErr = wrapAngle(Math.atan2(dx, dz) - (cam.yaw + lookFilter.residualYaw));
      const pitchErr = Math.atan2(dy, horiz) - (cam.pitch + lookFilter.residualPitch);
      const k = Math.min(1, gain * dt);
      lookFilter.add(yawErr * k, pitchErr * k);
      return chest;
    },
  };
}
