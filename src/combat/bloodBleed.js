// @ts-check
import { marksBlood } from './bloodDecals.js';
import { GIB_SPLASH_RATE } from './bloodGibs.js';

export const BLEED_THRESHOLD = 0.5;
export const BLEED_WAIT = Object.freeze({ min: 2, max: 5 });
export const BLEED_DROPS_MAX = 6;
export const BLEED_RADIUS = 0.35;
export const BLEED_RATE = GIB_SPLASH_RATE;

export const WOUND_SHARE = 0.5;
export const WOUND_WAIT = 1;

export const POOL_SIZE = Object.freeze({ start: 0.45, end: 1.5 });
export const POOL_SPREAD = 12;
export const POOL_STEPS = 8;

export const STRIDE = 0.7;
export const TELEPORT_SPEED = 40;

export function bleedShare(health, maxHealth, threshold = BLEED_THRESHOLD) {
  if (!(maxHealth > 0) || !(health > 0)) return 0;
  const pct = health / maxHealth;
  if (pct >= threshold) return 0;
  return Math.max(0, Math.min(1, 1 - (pct - 0.01) / (threshold - 0.01)));
}

export function bleedDrops(share) {
  if (!(share > 0)) return 0;
  return Math.max(1, Math.round(share * BLEED_DROPS_MAX));
}

export function poolSizeAt(t) {
  const f = Math.max(0, Math.min(1, t / POOL_SPREAD));
  const step = Math.floor(f * POOL_STEPS) / POOL_STEPS;
  return POOL_SIZE.start + (POOL_SIZE.end - POOL_SIZE.start) * step;
}

export function createBleedLedger({ rng = Math.random } = {}) {
  /** @type {WeakMap<object, { next: number, pooled: boolean, bleeding: boolean, last: number[]|null, walked: number }>} */
  let state = new WeakMap();
  const wait = () => BLEED_WAIT.min + rng() * (BLEED_WAIT.max - BLEED_WAIT.min);

  function tick(dt, bodies, view) {
    const out = [];
    if (!(dt > 0) || !bodies) return out;
    for (const body of bodies) {
      if (!body) continue;
      const v = view ? view(body) : body;
      if (!v || !v.feet || !marksBlood(v.bloodIndex ?? 0)) continue;
      if (!Number.isFinite(v.feet[0]) || !Number.isFinite(v.feet[1]) || !Number.isFinite(v.feet[2])) continue;
      let s = state.get(body);
      // A body first seen dead, such as a restored corpse, has already bled out and gets no pool.
      if (!s) { s = { next: wait(), pooled: !!v.dead, bleeding: false, last: null, walked: 0 }; state.set(body, s); }
      // The player's view sets strides to false because its footstep code already lays its steps.
      if (s.last && v.strides !== false) {
        const dx = v.feet[0] - s.last[0], dy = v.feet[1] - s.last[1], dz = v.feet[2] - s.last[2];
        const run = Math.hypot(dx, dz);
        // A teleport is a speed, not a per-frame distance, so a long frame does not erase a running trail.
        if (run > 0 && run <= TELEPORT_SPEED * dt) {
          const fx = dx / run, fz = dz / run;
          for (let a = STRIDE - s.walked; a <= run; a += STRIDE) {
            const f = a / run;
            out.push({ kind: 'step', body, pos: [s.last[0] + dx * f, s.last[1] + dy * f, s.last[2] + dz * f], forward: [fx, 0, fz] });
          }
          s.walked = (s.walked + run) % STRIDE;
        } else if (run > 0) s.walked = 0;
      }
      s.last = [v.feet[0], v.feet[1], v.feet[2]];
      if (v.dead) {
        if (!s.pooled && v.corpse) { s.pooled = true; out.push({ kind: 'pool', body, pos: [v.feet[0], v.feet[1], v.feet[2]], bloodIndex: v.bloodIndex ?? 0 }); }
        s.bleeding = false;
        continue;
      }
      // A load or the online stream revives an enemy on the same record, so a living body resets the pool latch.
      s.pooled = false;
      const wound = !!v.wound;
      const share = Math.max(bleedShare(v.health, v.maxHealth), wound ? WOUND_SHARE : 0);
      if (!(share > 0)) {
        if (s.bleeding) { s.bleeding = false; s.next = wait(); }
        continue;
      }
      s.bleeding = true;
      if (wound && s.next > WOUND_WAIT) s.next = WOUND_WAIT;
      s.next -= dt;
      if (s.next > 0) continue;
      s.next = wound ? WOUND_WAIT : wait();
      out.push({ kind: 'drip', body, pos: [v.feet[0], v.feet[1], v.feet[2]], bloodIndex: v.bloodIndex ?? 0, count: bleedDrops(share), share });
    }
    return out;
  }

  function clear() { state = new WeakMap(); }

  return { tick, clear, _state: (body) => state.get(body) ?? null };
}
