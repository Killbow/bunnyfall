// @ts-check

export const RIPPLE_CELLS = 96;
export const RIPPLE_SPAN = 48;
export const RIPPLE_HZ = 30;
export const RIPPLE_DAMPING = 0.975;
export const RIPPLE_SCALE = 0.012;

/**
 * @returns {{ origin: number[], packed: number[], bytes: Uint8Array, recenter: (x: number, z: number) => boolean,
 *   disturb: (x: number, z: number, strength: number, radius?: number) => void, step: (dt: number) => number,
 *   heightAt: (x: number, z: number) => number, version: () => number, asleep: () => boolean }}
 */
export function createRipples({ cells = RIPPLE_CELLS, span = RIPPLE_SPAN, hz = RIPPLE_HZ, damping = RIPPLE_DAMPING } = {}) {
  const n = cells * cells, cell = span / cells;
  let cur = new Float32Array(n), prev = new Float32Array(n), next = new Float32Array(n);
  const origin = [0, 0];
  const bytes = new Uint8Array(n).fill(128);
  const packed = [0, 0];
  let acc = 0, version = 0, live = false;
  const idx = (cx, cz) => cz * cells + cx;

  function recenter(x, z) {
    const ox = Math.floor(x / cell - cells / 2) * cell, oz = Math.floor(z / cell - cells / 2) * cell;
    const dx = Math.round((ox - origin[0]) / cell), dz = Math.round((oz - origin[1]) / cell);
    if (!dx && !dz) return false;
    origin[0] = ox; origin[1] = oz;
    if (!live) return true;
    if (Math.abs(dx) >= cells || Math.abs(dz) >= cells) { cur.fill(0); prev.fill(0); return true; }
    slide(cur, dx, dz); slide(prev, dx, dz);
    return true;
  }
  function slide(a, dx, dz) {
    next.fill(0);
    for (let z = 1; z < cells - 1; z++) {
      const sz = z + dz;
      if (sz < 0 || sz >= cells) continue;
      for (let x = 1; x < cells - 1; x++) {
        const sx = x + dx;
        if (sx >= 0 && sx < cells) next[idx(x, z)] = a[idx(sx, sz)];
      }
    }
    a.set(next);
  }

  function disturb(x, z, strength, radius = 0.8) {
    const r = Math.max(cell, radius), rc = Math.ceil(r / cell);
    const cx = Math.floor((x - origin[0]) / cell), cz = Math.floor((z - origin[1]) / cell);
    for (let j = -rc; j <= rc; j++) {
      for (let i = -rc; i <= rc; i++) {
        const gx = cx + i, gz = cz + j;
        if (gx < 1 || gz < 1 || gx >= cells - 1 || gz >= cells - 1) continue;
        const d = Math.hypot(i * cell, j * cell) / r;
        if (d >= 1) continue;
        cur[idx(gx, gz)] -= strength * 0.5 * (1 + Math.cos(Math.PI * d));
        live = true;
      }
    }
  }

  function step(dt) {
    acc = Math.min(acc + Math.max(0, dt), 4 / hz);
    let k = 0;
    while (acc >= 1 / hz) {
      acc -= 1 / hz;
      if (!live) continue;
      let energy = 0;
      for (let z = 1; z < cells - 1; z++) {
        for (let x = 1; x < cells - 1; x++) {
          const i = idx(x, z);
          const v = ((cur[i - 1] + cur[i + 1] + cur[i - cells] + cur[i + cells]) * 0.5 - prev[i]) * damping;
          next[i] = v;
          energy += v * v;
        }
      }
      const t = prev; prev = cur; cur = next; next = t;
      k++;
      if (energy < 1e-10) { live = false; cur.fill(0); prev.fill(0); }
    }
    if (k) {
      for (let i = 0; i < n; i++) bytes[i] = Math.max(1, Math.min(255, Math.round(128 + cur[i] / RIPPLE_SCALE)));
      packed[0] = origin[0]; packed[1] = origin[1];
      version++;
    }
    return k;
  }

  function heightAt(x, z) {
    const cx = Math.floor((x - origin[0]) / cell), cz = Math.floor((z - origin[1]) / cell);
    return cx < 0 || cz < 0 || cx >= cells || cz >= cells ? 0 : cur[idx(cx, cz)];
  }

  return { origin, packed, bytes, recenter, disturb, step, heightAt, version: () => version, asleep: () => !live };
}

export const stirOf = (speed, swimming) => (swimming ? 0.035 : 0.02) + Math.min(speed, 8) * 0.012;
export const STIR_PERIOD = 0.1;
export const BOAT_STIR = 2.5;

/**
 * @param {ReturnType<typeof createRipples>} field
 */
export function createRippleStir(field) {
  const last = new WeakMap();
  let acc = 0, emit = false;
  return {
    field,
    /**
     * @param {number} dt
     * @param {number} x
     * @param {number} z
     */
    begin(dt, x, z) { field.recenter(x, z); acc += dt; emit = acc >= STIR_PERIOD; if (emit) acc = 0; },
    /**
     * @param {object} key
     * @param {ArrayLike<number>} pos
     * @param {boolean} swimming
     * @param {number} nowMs
     */
    stir(key, pos, swimming, nowMs, force = 1, minSpeed = 0) {
      let l = last.get(key);
      if (!l) last.set(key, l = { x: pos[0], z: pos[2], t: nowMs });
      const speed = Math.hypot(pos[0] - l.x, pos[2] - l.z) / Math.max(1e-3, (nowMs - l.t) / 1000);
      l.x = pos[0]; l.z = pos[2]; l.t = nowMs;
      if (emit && speed >= minSpeed) field.disturb(pos[0], pos[2], stirOf(speed, swimming) * force, swimming ? 1.0 : 0.7);
    },
    /** @param {number} dt */
    end(dt) { return field.step(dt); },
  };
}

export const BOAT_WAKE_SPEED = 0.25;
