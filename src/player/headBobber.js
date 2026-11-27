// Head bobbing, following Daggerfall Unity HeadBobber.cs.
import { getBool } from '../platform/settings.js';
import { WALK_STEP_INTERVAL } from '../audio/footsteps.js';
import { clampPitch } from './pitchLimit.js';

export const BOB_SPEED = WALK_STEP_INTERVAL / 2;
export const END_TIMER_MAX = 0.5;
export const BOUNCE_MAX = 0.17;
export const BOUNCE_TIMER_MAX = 0.10;
const DEG = Math.PI / 180;

export const BOB_STYLE = Object.freeze({
  Crouching: Object.freeze([0.08, 0.07, 0.5, 0.2]),
  Walking: Object.freeze([0.045, 0.062, 0.25, 0.1]),
  Running: Object.freeze([0.09, 0.11, 0.6, 0.15]),
  Horse: Object.freeze([0.03, 0.115, 0.2, 0.1]),
  Swimming: Object.freeze([0, 0, 0, 0]),
});

export function bobbingStyle({ swimming, running, crouching, riding }) {
  if (swimming) return 'Swimming';
  if (running) return 'Running';
  if (crouching) return 'Crouching';
  if (riding) return 'Horse';
  return 'Walking';
}

const lerp = (a, b, t) => a + (b - a) * Math.min(Math.max(t, 0), 1);

export class HeadBobber {
  constructor() {
    this.timer = Math.PI / 2;
    this.beginTransitionTimer = 0;
    this.endTransitionTimer = 0;
    this.isStopping = false;
    this.readyToBounce = false;
    this.bounceTimerDown = 0;
    this.bounceTimerUp = 0;
    this.offset = [0, 0];
    this.nod = [0, 0];
    this.style = 'Walking';
  }

  /**
   * @param {number} dt
   * @param {{yaw:number, pitch:number}} cam
   * @param {object} s
   */
  update(dt, cam, {
    enabled = getBool('Controls', 'HeadBobbing'),
    health = 1, paused = false, climbing = false, grounded = true,
    swimming = false, running = false, crouching = false, riding = false, levitating = false,
    velocity = 0, moving = false,
    out = null,
  } = {}) {
    cam.pitch += this.nod[0] * DEG;
    cam.yaw -= this.nod[1] * DEG;
    this.nod = [0, 0];
    if (out) out.bobTimer = enabled ? this.timer : null;
    if (!enabled || health < 1 || paused || climbing || !grounded) return this.offset;
    this.style = bobbingStyle({ swimming, running, crouching, riding });
    const [bobX, bobY, nodX, nodY] = BOB_STYLE[this.style];
    let posX = 0, posY = 0;
    let rotX = 0, rotY = 0;
    const timeIncrement = velocity * BOB_SPEED * dt;
    const plotPath = () => [Math.cos(this.timer) * bobX, Math.abs(Math.sin(this.timer) * bobY)];
    const plotRotation = () => [Math.abs(Math.sin(this.timer) * nodX), -Math.sin(this.timer) * nodY];
    if (moving) {
      if (this.endTransitionTimer > 0) { this.endTransitionTimer = 0; this.timer = Math.PI; }
      this.timer += timeIncrement;
      this.beginTransitionTimer += timeIncrement;
      [posX, posY] = plotPath();
      [rotX, rotY] = plotRotation();
      if (this.beginTransitionTimer <= Math.PI) {
        const t = (this.timer % Math.PI) / Math.PI;
        posX = lerp(0, posX, t); posY = lerp(0, posY, t);
      }
      this.isStopping = true;
      this.endTransitionTimer = 0;
    } else if (this.isStopping && this.endTransitionTimer <= END_TIMER_MAX) {
      if (this.timer > 0) this.timer = Math.max(this.timer - timeIncrement, 0);
      this.beginTransitionTimer = 0;
      this.endTransitionTimer += dt;
      const t = this.endTransitionTimer / END_TIMER_MAX;
      posX = lerp(this.offset[0], 0, t); posY = lerp(this.offset[1], 0, t);
      [rotX, rotY] = plotRotation();
    } else if (this.isStopping) {
      this.endTransitionTimer = 0;
      this.timer = Math.PI;
      this.isStopping = false;
    }
    if (this.timer > Math.PI * 2) this.timer = 0;
    if (out) out.bobTimer = this.timer;
    posY = this._applySimpleBouncing(dt, posY, { grounded, swimming, climbing, levitating });
    this.offset = [posX, posY];
    const pitchBefore = cam.pitch;
    cam.pitch = clampPitch(pitchBefore - rotX * DEG);
    this.nod = [(pitchBefore - cam.pitch) / DEG, rotY];
    cam.yaw += rotY * DEG;
    return this.offset;
  }

  _applySimpleBouncing(dt, posY, { grounded, swimming, climbing, levitating }) {
    if (climbing || levitating) return posY;
    let upSpeed = 1, downSpeed = 1;
    if (swimming) { upSpeed = 0.40; downSpeed = 0.1; }
    if ((!grounded || swimming) && !this.readyToBounce) {
      this.readyToBounce = true;
      this.bounceTimerUp = 0;
      this.bounceTimerDown = 0;
    } else if (this.readyToBounce && (grounded || swimming)) {
      if (this.bounceTimerDown < BOUNCE_TIMER_MAX) {
        this.bounceTimerDown += dt * downSpeed;
        const t = this.bounceTimerDown / BOUNCE_TIMER_MAX;
        return lerp(0, -BOUNCE_MAX, t);
      } else if (this.bounceTimerUp < BOUNCE_TIMER_MAX) {
        this.bounceTimerUp += dt * upSpeed;
        const t = this.bounceTimerUp / BOUNCE_TIMER_MAX;
        return lerp(-BOUNCE_MAX, 0, t);
      } else {
        this.readyToBounce = false;
      }
    }
    return posY;
  }
}
