// @ts-check
// Unlike DFU, which builds every interior door, a door with a floor on one side and none on the other is sealed
// when the room is built. Some House2 interiors hang doors in walls with nothing behind them.

import { t } from '../ui/textManager.js';

export const SEALED_DOOR_TEXT = 'This door will not open.';
export const sealedDoorText = () => t('player.sealedDoor', SEALED_DOOR_TEXT);

// Matches the default `maxDist` of `standsOnFloor` in player/enterExit.js; change both together.
export const DOOR_FLOOR_REACH = 10;

// House2 doors sit on a half-meter lip of floor with nothing past it, so a nearer sample finds a false floor.
export const DOOR_SIDE_STEP = 1.0;
const ACROSS = Object.freeze([0.25, 0.5, 0.75]);
const RAY_LIFT = 0.5;

/**
 * @param {{ raycast: (o: number[], d: number[], max: number, f?: any) => number }} collider
 * @param {{ key: string, cpu: { positions: ArrayLike<number> }, base: ArrayLike<number> }} door
 * @returns {[boolean, boolean]}
 */
export function doorSidesFloored(collider, door) {
  const p = door.cpu.positions, m = door.base;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (p[i + k] < lo[k]) lo[k] = p[i + k];
      if (p[i + k] > hi[k]) hi[k] = p[i + k];
    }
  }
  const through = hi[0] - lo[0] < hi[2] - lo[2] ? 0 : 2;
  const across = 2 - through;
  const at = (local) => [0, 1, 2].map((r) => m[r] * local[0] + m[4 + r] * local[1] + m[8 + r] * local[2] + m[12 + r]);
  const axis = (k) => {
    const v = [m[4 * k], 0, m[4 * k + 2]];
    const len = Math.hypot(v[0], v[2]) || 1;
    return [v[0] / len, 0, v[2] / len];
  };
  const out = axis(through);
  const skip = { skip: [door.key] };
  const floored = (side) => ACROSS.some((f) => {
    const local = [0, lo[1], 0];
    local[through] = (lo[through] + hi[through]) / 2;
    local[across] = lo[across] + f * (hi[across] - lo[across]);
    const base = at(local);
    const origin = [base[0] + side * DOOR_SIDE_STEP * out[0], base[1] + RAY_LIFT, base[2] + side * DOOR_SIDE_STEP * out[2]];
    return Number.isFinite(collider.raycast(origin, [0, -1, 0], DOOR_FLOOR_REACH + RAY_LIFT, skip));
  });
  return [floored(-1), floored(1)];
}

/**
 * @param {{ objects: Map<string, any>, collider: any }} actions
 * @returns {string[]}
 */
export function sealDoorsToNowhere(actions) {
  const sealed = [];
  for (const o of actions.objects.values()) {
    if (o.kind !== 'door' || o.special || !o.cpu?.positions) continue;
    const [near, far] = doorSidesFloored(actions.collider, o);
    if (near === far) continue;
    o.sealed = true;
    sealed.push(o.key);
  }
  return sealed;
}
