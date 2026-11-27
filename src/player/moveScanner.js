// The classic half of PlayerMoveScanner: the step probe and the upward head probe.
// The climb, hang, and rappel probes belong to advanced climbing, which this game does not ship.

import { CAPSULE_RADIUS } from './motor.js';

export const STEP_PROBE_RADIUS = 0.1;
export const STEP_PROBE_DISPLACEMENT = 0.10;
export const STEP_PROBE_RANGE = 2.10;
export const HEAD_HIT_RADIUS_FACTOR = 0.85;
export const HEAD_PROBE_RANGE = 2;
export const IN_FRONT_REACH = 0.1;

export class PlayerMoveScanner {
  constructor(collider, radius = CAPSULE_RADIUS) {
    this.collider = collider;
    this.radius = radius;
    this.headHitRadius = radius * HEAD_HIT_RADIUS_FACTOR;
    this.stepHitDistance = 0;
    this.headHitDistance = 0;
    this.hitSomethingInFront = false;
    this.headHitKey = null;
  }

  get _canScan() { return typeof this.collider?.sphereCast === 'function'; }

  /**
   * @param {ArrayLike<number>} position
   * @param {ArrayLike<number>} moveDirection
   * @param {number} height
   * @param {boolean} jumping
   */
  findStep(position, moveDirection, height, jumping) {
    if (!this._canScan) { this.stepHitDistance = 0; return; }
    const maxRange = height / 2 + STEP_PROBE_RANGE;
    const hx = moveDirection[0];
    const hz = moveDirection[2];
    const len = Math.hypot(hx, hz);
    const s = len > 0 ? STEP_PROBE_DISPLACEMENT / len : 0;
    const origin = [position[0] + hx * s, position[1], position[2] + hz * s];
    const d = jumping ? Infinity
      : this.collider.sphereCast(origin, STEP_PROBE_RADIUS, [0, -1, 0], maxRange).dist;
    this.stepHitDistance = Number.isFinite(d) ? d : 0;
  }

  // A rejected hit leaves the head distance stale, as in Daggerfall Unity.
  // A clear cast clears the key and returns false.
  /**
   * @param {ArrayLike<number>} origin
   * @returns {boolean}
   */
  findHeadHit(origin) {
    if (!this._canScan) return false;
    const hit = this.collider.sphereCast(origin, this.headHitRadius, [0, 1, 0], HEAD_PROBE_RANGE);
    if (Number.isFinite(hit.dist)) {
      this.headHitDistance = hit.dist;
      this.headHitKey = hit.key;
      return true;
    }
    this.headHitKey = null;
    return false;
  }

  setHitSomethingInFront(position, direction) {
    if (typeof this.collider?.raycast !== 'function') { this.hitSomethingInFront = false; return false; }
    this.hitSomethingInFront = Number.isFinite(
      this.collider.raycast(position, direction, this.radius + IN_FRONT_REACH));
    return this.hitSomethingInFront;
  }
}
