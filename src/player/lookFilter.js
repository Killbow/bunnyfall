// Mouse-look smoothing and swing suppression, ported from Daggerfall Unity's PlayerMouseLook.
// The filter keeps the owed look as a residual, so external writes to the camera need no resync.

import { getFloat, getInt } from '../platform/settings.js';
import { PITCH_LIMIT } from './pitchLimit.js';

export const SMOOTHING_MAX = 0.9;
export { PITCH_LIMIT };

export const PITCH_FLOOR = (75 * Math.PI) / 180;
// The provider returns the pitch floor in degrees, down-positive, or null for PITCH_FLOOR.
let _floorProvider = null;
export function setPitchFloorProvider(fn) { _floorProvider = typeof fn === 'function' ? fn : null; }
export const pitchFloor = () => { const d = _floorProvider?.(); return Number.isFinite(d) ? Math.min((Math.max(d, -90) * Math.PI) / 180, PITCH_FLOOR) : PITCH_FLOOR; };

// A repeated frame timestamp (dt 0) makes no progress instead of 0/0 NaN.
export function frameRateScaledFraction(fractionAt60FPS, dt) {
  if (fractionAt60FPS >= 1) return 1;
  if (!(dt > 0)) return 0;
  const frames = dt * 60;
  const c = (1 - fractionAt60FPS) / fractionAt60FPS;
  return 1 - c / (frames + c);
}

export function frameSmoothing(smoothing, dt) {
  const s = Math.min(Math.max(smoothing, 0), SMOOTHING_MAX);
  return 1 - frameRateScaledFraction(1 - s, dt);
}

let _controllerLook = false;
export function setControllerLook(on) { _controllerLook = !!on; }
export const controllerLook = () => _controllerLook;

let _frameYaw = 0, _framePitch = 0;
export function takeFrameLook() { const v = [_frameYaw, _framePitch]; _frameYaw = 0; _framePitch = 0; return v; }

/**
 * @param swingHeld
 * @param weaponIsBow
 * @param swingMode
 */
export function swingSuppressesLook({ swingHeld = false, weaponIsBow = false,
  swingMode = getInt('Controls', 'WeaponSwingMode', 0, 2) } = {}) {
  return !!swingHeld && swingMode === 0 && !weaponIsBow;
}

export class LookFilter {
  constructor() {
    this.residualYaw = 0;
    this.residualPitch = 0;
    this.turnYaw = 0;
  }

  // Drops the owed look; a held swing in mode 0 settles every frame so it never pays out an interrupted look.
  settle() {
    this.residualYaw = 0;
    this.residualPitch = 0;
  }

  centerPitch(cam) {
    this.residualPitch = -(cam?.pitch ?? 0);
  }

  turn(dyaw, dpitch = 0) {
    // The yaw turn is owed apart so a held swing cannot settle it away, and a turn never counts as the frame's look.
    this.turnYaw += dyaw;
    this.residualPitch += dpitch;
  }

  add(dyaw, dpitch) {
    this.residualYaw += dyaw;
    this.residualPitch += dpitch;
    _frameYaw += dyaw; _framePitch += dpitch;
  }

  tick(dt, cam, { smoothing = getFloat('Controls', 'MouseLookSmoothingFactor', 0, SMOOTHING_MAX) } = {}) {
    const targetPitch = Math.max(-pitchFloor(), Math.min(PITCH_LIMIT, cam.pitch + this.residualPitch));
    this.residualPitch = targetPitch - cam.pitch;
    const s = frameSmoothing(_controllerLook && smoothing < 0.5 ? 0.5 : smoothing, dt);
    const stepYaw = this.residualYaw * (1 - s);
    const stepPitch = this.residualPitch * (1 - s);
    cam.yaw += stepYaw + this.turnYaw;
    this.turnYaw = 0;
    cam.pitch += stepPitch;
    this.residualYaw -= stepYaw;
    this.residualPitch -= stepPitch;
  }
}
