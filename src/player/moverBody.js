// Body collision for moving platforms in dungeons: a mover's step carries or presses the body.
// When the body is pinned, the mover holds at its previous pose until the body is clear.
import { CAPSULE_RADIUS } from './motor.js';
import { invert4 } from './tapRay.js';
import { transformPoint } from '../world/mat4.js';

export const MOVER_PRESS = 1e-3;
export const MOVER_STEP = CAPSULE_RADIUS / 2;
export const MOVER_STEPS_MAX = 16;

const centreOf = (body) => [body.pos[0], body.pos[1] + body.height / 2, body.pos[2]];

export function moverPresses(collider, key, body) {
  return collider.capsuleContact(body.pos, body.height, -MOVER_PRESS, { only: [key] }) !== null;
}

export function carriedBy(m0, m1, p) {
  const inv = invert4(m0);
  if (!inv) return [0, 0, 0];
  const l = transformPoint(inv, p[0], p[1], p[2]);
  const q = transformPoint(m1, l[0], l[1], l[2]);
  return [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
}

export function moverSteps(collider, key, m0, m1, body) {
  const d = carriedBy(m0, m1, centreOf(body)), travel = Math.hypot(d[0], d[1], d[2]);
  if (body.groundKey !== key && collider.capsuleContact(body.pos, body.height, travel, { only: [key] }) === null) return 0;
  return Math.min(MOVER_STEPS_MAX, Math.max(1, Math.ceil(travel / MOVER_STEP)));
}

// Returns false when the new pose still presses the body after the carry and did not press it at the old pose.
export function meetBody(collider, key, m0, m1, body, place) {
  if (body.groundKey !== key && !moverPresses(collider, key, body)) return true;
  place(m0);
  const before = moverPresses(collider, key, body);
  const want = carriedBy(m0, m1, centreOf(body)), to = [body.pos[0], body.pos[1], body.pos[2]];
  place(null);
  collider.move(to, want[0], want[1], want[2], body.height, false);
  body.carryBy(to[0] - body.pos[0], to[1] - body.pos[1], to[2] - body.pos[2]);
  place(m1);
  return before || !moverPresses(collider, key, body);
}
