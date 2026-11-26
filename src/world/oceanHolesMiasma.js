import { SURFACE_MIASMA_LIFETIME, SURFACE_MIASMA_MAX_PARTICLES, SURFACE_MIASMA_EMISSION_RATE } from './oceanHoles.js';

const f32 = Math.fround;
export const DEFAULT_DURATION = 5;
export const START_SIZE_MAX = 6;
export const DRIFT = 0.12;
export const SIZE_KEYS = Object.freeze([[0, 0], [0.02, 1], [0.9, 1], [1, 0]]);

export function evaluateSizeCurve(t) {
  if (t <= SIZE_KEYS[0][0]) return SIZE_KEYS[0][1];
  for (let i = 1; i < SIZE_KEYS.length; i++) {
    const [t1, v1] = SIZE_KEYS[i];
    if (t <= t1) {
      const [t0, v0] = SIZE_KEYS[i - 1];
      const u = (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * (u * u * (3 - 2 * u));
    }
  }
  return SIZE_KEYS[SIZE_KEYS.length - 1][1];
}

/**
 * @param {{count: number, height: number, radius: number, roll?: () => number}} o
 */
export function createMiasma({ count, height, radius, roll = Math.random }) {
  const max = Math.max(1, count);
  const rate = f32(f32(SURFACE_MIASMA_EMISSION_RATE * count) / SURFACE_MIASMA_MAX_PARTICLES);
  const v = f32(height / SURFACE_MIASMA_LIFETIME);
  const particles = [];
  let accum = 0;
  const range = (a, b) => a + (b - a) * roll();
  function emit() {
    const a = roll() * Math.PI * 2, r = radius * Math.sqrt(roll());
    particles.push({
      p: [Math.cos(a) * r, 0, Math.sin(a) * r],
      v: [range(-DRIFT, DRIFT), range(f32(v * 0.85), v), range(-DRIFT, DRIFT)],
      size: range(3, START_SIZE_MAX), rot: range(0, Math.PI * 2),
      age: 0, life: SURFACE_MIASMA_LIFETIME,
    });
  }
  function step(dt) {
    if (!(dt > 0)) return;
    for (let i = particles.length - 1; i >= 0; i--) {
      const q = particles[i];
      q.age += dt;
      if (q.age >= q.life) { particles.splice(i, 1); continue; }
      q.p[0] += q.v[0] * dt; q.p[1] += q.v[1] * dt; q.p[2] += q.v[2] * dt;
    }
    accum += rate * dt;
    while (accum >= 1) {
      accum -= 1;
      if (particles.length < max) emit();
    }
  }
  for (let t = 0; t < DEFAULT_DURATION; t += 1 / 60) step(1 / 60);
  return {
    particles, step, rate, max,
    sizeOf: (q) => q.size * evaluateSizeCurve(q.age / q.life),
  };
}

export function miasmaReach({ height, radius }) {
  const half = START_SIZE_MAX / 2, out = radius + DRIFT * SURFACE_MIASMA_LIFETIME + half;
  return [-out, -half, -out, out, height + half, out];
}
