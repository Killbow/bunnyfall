// Movement acceleration: InputManager's ApplyHorizontalForce, ApplyVerticalForce, and ApplyFriction.
// With the setting off the axes are the plain held-key difference; opposing keys cancel to zero.

import { getBool } from '../platform/settings.js';

export const MOVE_ACCELERATION_CONST = 9.8;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

let _limits = null;
export function setAxisLimitsProvider(fn) { _limits = typeof fn === 'function' ? fn : null; }
const clampAxes = (axes) => {
  const l = _limits?.();
  if (!l) return axes;
  return { forward: clamp(axes.forward, -(l.negVertical ?? 1), 1), strafe: clamp(axes.strafe, -(l.negHorizontal ?? 1), l.posHorizontal ?? 1) };
};

export class MoveAxes {
  constructor() {
    this.horizontal = 0;
    this.vertical = 0;
  }

  /**
   * @param {number} dt
   * @param {{forwards?:boolean, backwards?:boolean, left?:boolean, right?:boolean, autorun?:boolean, analog?:{x:number,y:number}|null}} held
   * @returns {{forward:number, strafe:number}}
   */
  update(dt, held, { acceleration = getBool('Controls', 'MovementAcceleration') } = {}) {
    const ax = held.analog ? clamp(Number(held.analog.x) || 0, -1, 1) : 0;
    const ay = held.analog ? clamp(Number(held.analog.y) || 0, -1, 1) : 0;
    if (!acceleration) {
      this.horizontal = ax !== 0 ? ax : (held.right ? 1 : 0) - (held.left ? 1 : 0);
      this.vertical = ay !== 0 ? ay : (held.forwards || held.backwards)
        ? ((held.forwards ? 1 : 0) - (held.backwards ? 1 : 0))
        : (held.autorun ? 1 : 0);
      return clampAxes({ forward: this.vertical, strafe: this.horizontal });
    }
    let posH = false, negH = false, posV = false, negV = false;
    const force = (axis, scale) => clamp(axis + (MOVE_ACCELERATION_CONST * scale) * dt, -1, 1);
    // The autorun force runs before the key forces, and raising its impulse flag stops friction from decaying the axis.
    if (held.autorun) { this.vertical = force(this.vertical, 1); posV = true; }
    // A stick throw is a target the axis settles at, not an impulse toward the rail, so a half throw stays half speed.
    const toward = (axis, target) => axis + clamp(target - axis, -MOVE_ACCELERATION_CONST * dt, MOVE_ACCELERATION_CONST * dt);
    if (ax !== 0) { this.horizontal = toward(this.horizontal, ax); if (ax > 0) posH = true; else negH = true; }
    else {
      if (held.right) { this.horizontal = force(this.horizontal, 1); posH = true; }
      if (held.left) { this.horizontal = force(this.horizontal, -1); negH = true; }
    }
    if (ay !== 0) { this.vertical = toward(this.vertical, ay); if (ay > 0) posV = true; else negV = true; }
    else {
      if (held.forwards) { this.vertical = force(this.vertical, 1); posV = true; }
      if (held.backwards) { this.vertical = force(this.vertical, -1); negV = true; }
    }
    const step = MOVE_ACCELERATION_CONST * dt;
    if (!posV && this.vertical > 0) this.vertical = clamp(this.vertical - step, 0, this.vertical);
    if (!negV && this.vertical < 0) this.vertical = clamp(this.vertical + step, this.vertical, 0);
    if (!posH && this.horizontal > 0) this.horizontal = clamp(this.horizontal - step, 0, this.horizontal);
    if (!negH && this.horizontal < 0) this.horizontal = clamp(this.horizontal + step, this.horizontal, 0);
    return clampAxes({ forward: this.vertical, strafe: this.horizontal });
  }
}
