// @ts-check

export const GIB_COUNT = 10;
export const GIB_THROW_SIDE = 15;
export const GIB_THROW_UP = Object.freeze({ min: 5, max: 15 });
// Gibs match the reference blood mod's Unity physics, so they use Unity gravity rather than the player motor's.
export const UNITY_GRAVITY = 9.81;
export const GIB_GRAVITY_SCALE = 3;
export const GIB_GRAVITY = UNITY_GRAVITY * GIB_GRAVITY_SCALE;
export const GIB_DRAG = 0.1;
export const GIB_LIFE = 4;
export const GIB_FIXED_DT = 0.02;
export const GIB_SPLASH_RATE = 20;
export const GIB_SPLASH_SPEED = Object.freeze({ min: 2, max: 4 });

// The splat sprays from just above the landing point because a downward ray that starts on a surface can miss it.
export const GIB_SPRAY_LIFT = 0.1;

export function throwGibs(pos, rng = Math.random, count = GIB_COUNT) {
  const out = [];
  if (!pos || !(count > 0)) return out;
  const n = Math.min(Math.floor(Number.isFinite(count) ? count : GIB_COUNT), GIB_COUNT * 10);
  for (let i = 0; i < n; i++) {
    out.push({
      pos: [pos[0], pos[1], pos[2]],
      vel: [
        (rng() * 2 - 1) * GIB_THROW_SIDE,
        GIB_THROW_UP.min + rng() * (GIB_THROW_UP.max - GIB_THROW_UP.min),
        (rng() * 2 - 1) * GIB_THROW_SIDE,
      ],
      age: 0,
      acc: 0,
      still: false,
    });
  }
  return out;
}

export function gibStep(g, dt) {
  if (!g || g.still || !(dt > 0)) return null;
  g.age += dt;
  if (g.age >= GIB_LIFE) { g.still = true; return null; }
  let dx = 0, dy = 0, dz = 0;
  g.acc = (g.acc ?? 0) + dt;
  // Whole fixed steps with the remainder carried, as Unity does, keep the arc identical at every frame rate.
  while (g.acc >= GIB_FIXED_DT - 1e-9) {
    g.acc -= GIB_FIXED_DT;
    const damp = Math.max(0, 1 - GIB_DRAG * GIB_FIXED_DT);
    g.vel[0] *= damp; g.vel[1] *= damp; g.vel[2] *= damp;
    g.vel[1] -= GIB_GRAVITY * GIB_FIXED_DT;
    dx += g.vel[0] * GIB_FIXED_DT; dy += g.vel[1] * GIB_FIXED_DT; dz += g.vel[2] * GIB_FIXED_DT;
  }
  const dist = Math.hypot(dx, dy, dz);
  if (!(dist > 0)) return null;
  return {
    from: [g.pos[0], g.pos[1], g.pos[2]],
    dir: [dx / dist, dy / dist, dz / dist],
    dist,
    to: [g.pos[0] + dx, g.pos[1] + dy, g.pos[2] + dz],
  };
}

export function gibFly(g, step) {
  if (!g || !step) return false;
  g.pos[0] = step.to[0]; g.pos[1] = step.to[1]; g.pos[2] = step.to[2];
  return true;
}

export function gibLand(g, point) {
  if (!g) return false;
  if (point) { g.pos[0] = point[0]; g.pos[1] = point[1]; g.pos[2] = point[2]; }
  g.still = true;
  return true;
}

export const gibSprayOrigin = (g) => [g.pos[0], g.pos[1] + GIB_SPRAY_LIFT, g.pos[2]];

export function dripFrom(point) {
  if (!point) return null;
  return { pos: [point[0], point[1], point[2]], vel: [0, 0, 0], age: 0, acc: 0, still: false };
}

export const DRIP_SPLASH_RATE = 1;

export function shiftGibs(gibs, delta) {
  if (!gibs || !delta) return 0;
  let n = 0;
  for (const g of gibs) { if (!g) continue; g.pos[0] += delta[0]; g.pos[1] += delta[1]; g.pos[2] += delta[2]; n++; }
  return n;
}
