// Classic Daggerfall Unity climbing: hold-forward start, skill checks, and wall grasp.
import { SYSTEM_TIMER_UPDATES_DIVISOR } from './motor.js';
import { localizedText } from '../ui/textManager.js';
import { overcapClimbSpeed } from '../characters/skillSoftcap.js';

export const CONTINUE_CLIMBING_SKILL_CHECK_FREQUENCY = 15;
export const REGAIN_HOLD_SKILL_CHECK_FREQUENCY = 5;
export const REGAIN_HOLD_MIN_CHANCE = 20;
export const START_CLIMB_MIN_CHANCE = 70;
export const CONTINUE_CLIMB_MIN_CHANCE = 50;
export const GRASP_WALL_MIN_CHANCE = 40;
export const START_CLIMB_SKILL_CHECK_FREQUENCY = 14;
export const START_CLIMB_HORIZONTAL_TOLERANCE = 0.12;
export const KHAJIIT_CLIMBING_BONUS = 30;
export const CLIMBING_MODE_TEXT = 'Climbing mode.';

const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));

let _chanceOverride = null;
export function registerClimbingChanceOverride(fn) { _chanceOverride = typeof fn === 'function' ? fn : null; }
export const climbingChanceOverride = (base, inputs) => _chanceOverride?.(base, inputs) ?? null;

export function climbingChance(base, liveClimbing, liveLuck, { khajiit = false, enhanced = false } = {}) {
  let skill = liveClimbing + (khajiit ? KHAJIIT_CLIMBING_BONUS : 0);
  if (enhanced) skill *= 2;
  skill = Math.min(95, Math.max(5, skill));
  return Math.trunc(lerp(base, 100, skill * 0.01) + lerp(0, 10, liveLuck * 0.01));
}

export function climbingSpeed(baseSpeed, enhanced = false, liveClimbing = 0) {
  return (baseSpeed / 3) * (enhanced ? 2 : 1) * overcapClimbSpeed(liveClimbing);
}

export class ClimbingState {
  constructor(deps = {}) {
    this.deps = deps;
    this.isClimbing = false;
    this.wasClimbing = false;
    this.isSlipping = false;
    this.startTimer = 0;
    this.continueTimer = 0;
    this.showModeMessage = true;
    this.lastHorizontal = null;
  }

  skillCheck(base) {
    this.deps.tally?.();
    const i = this.deps.inputs?.() ?? { climbing: 0, luck: 0 };
    const chance = climbingChanceOverride(base, { ...i, say: this.deps.say ?? null }) ?? climbingChance(base, i.climbing ?? 0, i.luck ?? 0, i);
    const rolls = this.deps.rolls ?? Math.random;
    if (Math.floor(rolls() * 100) >= chance) {
      if (!this.deps.waterForgiven?.()) return false;
    }
    return true;
  }

  hold() {
    this.isClimbing = true;
    this.isSlipping = false;
  }

  stop() {
    this.isClimbing = false;
    this.showModeMessage = true;
    this.startTimer = 0;
  }

  step(dt, c) {
    const airborneGraspWall = !this.isClimbing && !this.isSlipping && c.falling;
    const inputAbort = !c.forward;
    if (!this.lastHorizontal) this.lastHorizontal = [c.horizontalPos[0], c.horizontalPos[1]];
    const horizontallyStationary =
      Math.hypot(c.horizontalPos[0] - this.lastHorizontal[0], c.horizontalPos[1] - this.lastHorizontal[1])
        < START_CLIMB_HORIZONTAL_TOLERANCE;
    const slippedToGround = this.isSlipping && c.grounded;
    const nonOrthogonalStart = !this.isClimbing && c.forward && !horizontallyStationary;
    const climbingOrForwardOrGrasping = this.isClimbing || c.forward || airborneGraspWall;
    const tooClose = ((this.isClimbing && (c.back || this.isSlipping)) || airborneGraspWall)
      && !!c.tooCloseToGround?.();
    this.wasClimbing = this.isClimbing;
    if (inputAbort
        || !climbingOrForwardOrGrasping
        || !c.touchingSides
        || c.levitating
        || c.riding
        || c.travelling
        || (airborneGraspWall && c.slowFalling)
        || slippedToGround
        || tooClose
        || nonOrthogonalStart) {
      this.stop();
      this.lastHorizontal = [c.horizontalPos[0], c.horizontalPos[1]];
    } else {
      if (this.startTimer <= SYSTEM_TIMER_UPDATES_DIVISOR * START_CLIMB_SKILL_CHECK_FREQUENCY) {
        this.startTimer += dt;
      } else if (!this.isClimbing) {
        if (!airborneGraspWall) {
          if (this.skillCheck(START_CLIMB_MIN_CHANCE)) this.isClimbing = true;
        } else if (this.skillCheck(GRASP_WALL_MIN_CHANCE)) {
          this.isClimbing = true;
        } else {
          this.startTimer = 0;
        }
      }
      if (this.isClimbing) {
        if (this.continueTimer <= SYSTEM_TIMER_UPDATES_DIVISOR
            * (this.isSlipping ? REGAIN_HOLD_SKILL_CHECK_FREQUENCY : CONTINUE_CLIMBING_SKILL_CHECK_FREQUENCY)) {
          this.continueTimer += dt;
        } else {
          this.continueTimer = 0;
          if (!c.anyMove) this.isSlipping = false;
          else if (this.isSlipping) this.isSlipping = !this.skillCheck(REGAIN_HOLD_MIN_CHANCE);
          else this.isSlipping = !this.skillCheck(CONTINUE_CLIMB_MIN_CHANCE);
        }
      }
    }
    if (this.isClimbing) {
      if (this.showModeMessage) {
        this.deps.say?.(localizedText('climbingMode', CLIMBING_MODE_TEXT));
        this.showModeMessage = false;
      }
    } else {
      this.isSlipping = false;
    }
    return this.isClimbing;
  }
}
