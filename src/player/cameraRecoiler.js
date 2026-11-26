// Camera recoil when the player takes damage, ported from Daggerfall Unity's CameraRecoiler.
import { getInt } from '../platform/settings.js';
import { clampPitch } from './pitchLimit.js';

export const BASE_MAX_RECOIL_SEVERITY = 50;
export const MIN_PERCENT_THRESHOLD = 0.02;
export const TIMER_SPEED = 2 * Math.PI;
export const RECOIL_FRACTION = Object.freeze([0, 0.25, 0.5, 0.75, 1]);
const DEG = Math.PI / 180;

export function recoilTimerStart(percentHealthLost) {
  const piScalar = 5 + Math.floor(percentHealthLost * 5);
  return piScalar * Math.PI;
}

export function recoilRotationScalar(setting, healthLost, timer, timerStart) {
  const maxRotationScalar = BASE_MAX_RECOIL_SEVERITY * (RECOIL_FRACTION[setting] ?? 0);
  const healthLostFactor = Math.min(Math.max(healthLost * 0.015, 0.015), 1);
  return maxRotationScalar * (timer / timerStart) * healthLostFactor;
}

export class CameraRecoiler {
  constructor() {
    this.swaying = false;
    this.swayAxis = [0, 0];
    this.timerStart = 0;
    this.timer = 0;
    this.applied = [0, 0];
  }

  reset() { this.swaying = false; }

  /** @returns {boolean} */
  update(dt, cam, { healthLost = 0, healthLostPercent = 0, paused = false,
    setting = getInt('Controls', 'CameraRecoilStrength', 0, 4), rolls = Math.random } = {}) {
    cam.pitch += this.applied[0] * DEG;
    cam.yaw -= this.applied[1] * DEG;
    this.applied = [0, 0];
    if (setting === 0 || paused) return false;
    if (healthLost > 0 && healthLostPercent > MIN_PERCENT_THRESHOLD) {
      this.swaying = true;
      this.timerStart = recoilTimerStart(healthLostPercent);
      this.timer = this.timerStart;
      const a = rolls() * 2 * Math.PI;
      this.swayAxis = [Math.cos(a), Math.sin(a)];
    }
    if (!this.swaying) return false;
    this.timer -= dt * TIMER_SPEED;
    const scalar = recoilRotationScalar(setting, healthLost, this.timer, this.timerStart);
    const xAngle = Math.sin(this.timer) * scalar * this.swayAxis[0];
    const yAngle = Math.sin(this.timer) * scalar * this.swayAxis[1];
    const pitchBefore = cam.pitch;
    cam.pitch = clampPitch(pitchBefore - xAngle * DEG);
    cam.yaw += yAngle * DEG;
    this.applied = [(pitchBefore - cam.pitch) / DEG, yAngle];
    this.swaying = this.timer > 0;
    return true;
  }
}
