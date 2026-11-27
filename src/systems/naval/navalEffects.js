// @ts-check
export const PARTICLE_BUDGET = 900;
// Past PARTICLE_BUDGET the lowest rank goes first, and the nearest its end within a rank, so broadside smoke goes last.
export const EVICT_RANK = Object.freeze({ spray: 0, foam: 0, glint: 0, debris: 1, shred: 1, ember: 1, flash: 2, timber: 2, smoke: 3 });
export const TIMBER_LIFE = 18;
export const SMOLDER_RATE = 3;
export const SPOUT_UP = Object.freeze({ big: 14, small: 10 });
export const DRENCH_N = 16;
export const BOIL_RATE = 14;
export const SPATTER_M = 3;
// Air speed in meters per second for each unit of the sailing wind strength.
export const WIND_MPS = 4;
export const GUN_SMOKE_LIFE = Object.freeze([9, 14]);
export const GUN_SMOKE_SWELL = Object.freeze([6, 10]);
const G = 9.81;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** @param {{ random?: () => number, wind?: () => number[] }} deps */
export function createNavalEffects({ random = Math.random, wind = () => [0, 0, 0] } = {}) {
  /** @type {any[]} */ let parts = [];
  const r = random;
  const jitter = (s) => (r() - 0.5) * 2 * s;
  const push = (p) => { parts.push(p); };

  function smoke(pos, dir, scale = 1, n = 6, hang = false) {
    for (let i = 0; i < n; i++) {
      const out = 1.5 + r() * 5.5;
      const life = hang ? GUN_SMOKE_LIFE[0] + r() * (GUN_SMOKE_LIFE[1] - GUN_SMOKE_LIFE[0]) : 4 + r() * 4.5;
      const swell = hang ? GUN_SMOKE_SWELL[0] + r() * (GUN_SMOKE_SWELL[1] - GUN_SMOKE_SWELL[0]) : 5 + r() * 3;
      push({
        kind: 'smoke', pos: [pos[0] + jitter(0.4), pos[1] + jitter(0.3), pos[2] + jitter(0.4)],
        vel: [dir[0] * out * scale + jitter(0.6), dir[1] * out * 0.4 + 0.25 + r() * 0.4, dir[2] * out * scale + jitter(0.6)],
        age: 0, life, size0: 1.1 * scale, size1: swell * scale, drag: 1.4, lift: 0.18,
        color: [0.78 + jitter(0.05), 0.77 + jitter(0.05), 0.74 + jitter(0.05)], alpha: 0.62, rot: r() * 6.28, spin: jitter(0.25), blend: 'alpha',
      });
    }
  }
  function flash(pos, dir, scale = 1) {
    push({ kind: 'flash', pos: [...pos], vel: [0, 0, 0], age: 0, life: 0.11, size0: 2.2 * scale, size1: 3.1 * scale, drag: 0, lift: 0, color: [1, 0.78, 0.42], alpha: 1, rot: r() * 6.28, spin: 0, blend: 'add' });
    push({ kind: 'flash', pos: [pos[0] + dir[0] * 1.3 * scale, pos[1] + dir[1] * 1.3 * scale, pos[2] + dir[2] * 1.3 * scale], vel: [dir[0] * 6, dir[1] * 6, dir[2] * 6], age: 0, life: 0.08, size0: 1.6 * scale, size1: 2.4 * scale, drag: 0, lift: 0, color: [1, 0.6, 0.25], alpha: 0.9, rot: r() * 6.28, spin: 0, blend: 'add' });
  }
  function muzzle(pos, dir, scale = 1) {
    const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    const d = [dir[0] / l, dir[1] / l, dir[2] / l];
    flash(pos, d, scale);
    smoke(pos, d, scale, Math.round(5 + 3 * scale), true);
  }
  function splash(pos, big = false, scale = 1) {
    const k = Math.max(1, Number(scale) || 1), q = Math.sqrt(k);
    const n = Math.round((big ? 22 : 12) * (0.5 + 0.5 * k));
    const up = (big ? 9 : 6.5) * q;
    for (let i = 0; i < n; i++) {
      const a = r() * 6.28, s = r() * (big ? 2.2 : 1.4) * q;
      push({ kind: 'spray', pos: [pos[0] + jitter(0.3), pos[1] + 0.05, pos[2] + jitter(0.3)], vel: [Math.sin(a) * s, up * (0.55 + r() * 0.6), Math.cos(a) * s], age: 0, life: 0.9 + r() * 0.8, size0: (big ? 0.9 : 0.6) * k, size1: (big ? 1.8 : 1.2) * k, drag: 0.4, gravity: G, color: [0.9, 0.95, 1], alpha: 0.8, rot: r() * 6.28, spin: jitter(1), blend: 'alpha' });
    }
    push({ kind: 'foam', flat: true, pos: [pos[0], pos[1] + 0.04, pos[2]], vel: [0, 0, 0], age: 0, life: big ? 3.2 : 2.4, size0: (big ? 1.6 : 1) * k, size1: (big ? 9 : 5.5) * k, drag: 0, lift: 0, color: [0.92, 0.96, 1], alpha: 0.7, rot: r() * 6.28, spin: 0, blend: 'alpha' });
  }
  function spout(pos, big = false, scale = 1) {
    const k = Math.max(1, Number(scale) || 1);
    for (let i = 0; i < (big ? 6 : 4); i++) {
      push({ kind: 'spray', pos: [pos[0] + jitter(0.15), pos[1] + 0.1, pos[2] + jitter(0.15)], vel: [jitter(0.35), (big ? SPOUT_UP.big : SPOUT_UP.small) * Math.sqrt(k) * (0.8 + r() * 0.3), jitter(0.35)], age: 0, life: 1.6 + r() * 0.6, size0: (big ? 1 : 0.7) * k, size1: (big ? 1.7 : 1.2) * k, drag: 0.2, gravity: G, color: [0.94, 0.97, 1], alpha: 0.85, rot: r() * 6.28, spin: jitter(0.6), blend: 'alpha' });
    }
  }
  function drench(pos, toward, k = 1) {
    const dx = toward[0] - pos[0], dz = toward[2] - pos[2], l = Math.hypot(dx, dz) || 1;
    const w = clamp(k, 0, 1);
    for (let i = 0; i < Math.round(DRENCH_N * (0.5 + 0.5 * w)); i++) {
      const s = (2.5 + r() * 3) * (0.6 + 0.4 * w);
      push({ kind: 'spray', pos: [pos[0] + jitter(0.6), pos[1] + 0.2, pos[2] + jitter(0.6)], vel: [dx / l * s + jitter(0.8), 6 + r() * 4, dz / l * s + jitter(0.8)], age: 0, life: 1.3 + r() * 0.6, size0: 0.8, size1: 1.6, drag: 0.3, gravity: G, color: [0.9, 0.95, 1], alpha: 0.8, rot: r() * 6.28, spin: jitter(1), blend: 'alpha' });
    }
  }
  function hit(pos, dir, heavy = false, scale = 1) {
    const k = Math.max(1, Number(scale) || 1);
    const l = Math.hypot(dir[0], dir[2]) || 1;
    const d = [dir[0] / l, 0, dir[2] / l];
    const n = Math.round((heavy ? 16 : 10) * (0.5 + 0.5 * k));
    for (let i = 0; i < n; i++) {
      const s = (3 + r() * 7) * Math.sqrt(k);
      push({ kind: 'debris', pos: [...pos], vel: [d[0] * s + jitter(3), (2 + r() * 5) * Math.sqrt(k), d[2] * s + jitter(3)], age: 0, life: 1.2 + r() * 1.2, size0: (0.18 + r() * 0.22) * k, size1: 0.18 * k, drag: 0.2, gravity: G, color: [0.36 + jitter(0.06), 0.25 + jitter(0.04), 0.15], alpha: 1, rot: r() * 6.28, spin: jitter(12), blend: 'alpha', solid: true });
    }
    smoke(pos, [d[0] * 0.3, 0.5, d[2] * 0.3], (heavy ? 0.8 : 0.55) * k, heavy ? 5 : 3);
    push({ kind: 'flash', pos: [...pos], vel: [0, 0, 0], age: 0, life: 0.08 * (0.5 + 0.5 * k), size0: 1.2 * k, size1: 1.8 * k, drag: 0, lift: 0, color: [1, 0.7, 0.35], alpha: 0.8, rot: r() * 6.28, spin: 0, blend: 'add' });
  }
  function blast(pos) {
    for (let i = 0; i < 10; i++) push({ kind: 'flash', pos: [pos[0] + jitter(1.5), pos[1] + r() * 2, pos[2] + jitter(1.5)], vel: [jitter(3), 2 + r() * 4, jitter(3)], age: 0, life: 0.35 + r() * 0.35, size0: 3 + r() * 2, size1: 6 + r() * 3, drag: 1.5, lift: 0, color: [1, 0.55 + r() * 0.2, 0.2], alpha: 1, rot: r() * 6.28, spin: jitter(1), blend: 'add' });
    smoke(pos, [0, 1, 0], 1.6, 12);
    hit(pos, [jitter(1), 0, jitter(1)], true);
    splash(pos, true);
  }
  function burn(pos, dt) {
    const k = clamp(dt, 0, 0.1);
    if (r() < 14 * k) push({ kind: 'ember', pos: [pos[0] + jitter(0.8), pos[1] + r() * 0.5, pos[2] + jitter(0.8)], vel: [jitter(0.6), 2 + r() * 2.5, jitter(0.6)], age: 0, life: 1 + r() * 1.2, size0: 0.22, size1: 0.05, drag: 0.5, lift: 0.4, color: [1, 0.55, 0.18], alpha: 1, rot: 0, spin: 0, blend: 'add' });
    if (r() < 5 * k) push({ kind: 'smoke', pos: [pos[0] + jitter(0.5), pos[1] + 1, pos[2] + jitter(0.5)], vel: [jitter(0.3), 1.6 + r(), jitter(0.3)], age: 0, life: 5 + r() * 3, size0: 1.6, size1: 7, drag: 0.6, lift: 0.3, color: [0.2, 0.19, 0.18], alpha: 0.55, rot: r() * 6.28, spin: jitter(0.2), blend: 'alpha' });
  }
  function glint(pos, k, dt) {
    const n = r() < clamp(dt, 0, 0.1) * 30 ? 1 : 0;
    for (let i = 0; i < n; i++) {
      push({ kind: 'glint', pos: [pos[0] + jitter(0.15), pos[1] + jitter(0.1), pos[2] + jitter(0.15)], vel: [0, 0, 0], age: 0, life: 0.1 + r() * 0.08, size0: 1.1 + 0.6 * k, size1: 1.5 + 0.8 * k, drag: 0, lift: 0, color: [1, 0.6 + 0.15 * r(), 0.26], alpha: 0.35 + 0.6 * clamp(k, 0, 1), rot: r() * 6.28, spin: 0, blend: 'add' });
    }
  }
  function tear(pos, dir) {
    const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    const d = [dir[0] / l, dir[1] / l, dir[2] / l];
    for (let i = 0; i < 9; i++) {
      const sp = 1.5 + r() * 3;
      push({ kind: 'shred', pos: [...pos], vel: [d[0] * sp + jitter(1.2), d[1] * sp + jitter(0.8), d[2] * sp + jitter(1.2)], age: 0, life: 2 + r() * 1.5, size0: 0.3 + r() * 0.35, size1: 0.25, drag: 1.6, gravity: 1.6, color: [0.86 + jitter(0.04), 0.82 + jitter(0.04), 0.7], alpha: 0.95, rot: r() * 6.28, spin: jitter(6), blend: 'alpha', solid: true });
    }
  }
  function shotMuzzle(pos, dir, scale = 1, shot = null) {
    muzzle(pos, dir, scale);
    const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    const d = [dir[0] / l, dir[1] / l, dir[2] / l];
    if (shot === 'grape') smoke(pos, [d[0], d[1] * 0.4 - 0.1, d[2]], scale * 1.25, 4, true);
    if (shot === 'heated') push({ kind: 'flash', pos: [pos[0] + d[0] * 0.8, pos[1] + d[1] * 0.8, pos[2] + d[2] * 0.8], vel: [d[0] * 9, d[1] * 9, d[2] * 9], age: 0, life: 0.16, size0: 1.4 * scale, size1: 2.6 * scale, drag: 0, lift: 0, color: [1, 0.36, 0.1], alpha: 1, rot: r() * 6.28, spin: 0, blend: 'add' });
  }
  function shotSplash(pos, big = false, shot = null, scale = 1) {
    if (shot === 'grape') {
      for (let i = 0; i < 6; i++) {
        const a = r() * 6.28, d = r() * SPATTER_M;
        const at = [pos[0] + Math.sin(a) * d, pos[1], pos[2] + Math.cos(a) * d];
        for (let k = 0; k < 3; k++) push({ kind: 'spray', pos: [at[0] + jitter(0.1), at[1] + 0.05, at[2] + jitter(0.1)], vel: [jitter(0.6), 2.5 + r() * 2, jitter(0.6)], age: 0, life: 0.5 + r() * 0.4, size0: 0.3, size1: 0.55, drag: 0.4, gravity: G, color: [0.9, 0.95, 1], alpha: 0.75, rot: r() * 6.28, spin: jitter(1), blend: 'alpha' });
        push({ kind: 'foam', flat: true, pos: [at[0], at[1] + 0.04, at[2]], vel: [0, 0, 0], age: 0, life: 1.4, size0: 0.4, size1: 1.8, drag: 0, lift: 0, color: [0.92, 0.96, 1], alpha: 0.55, rot: r() * 6.28, spin: 0, blend: 'alpha' });
      }
      return;
    }
    splash(pos, big, scale);
    spout(pos, big, scale);
    if (shot === 'heated') {
      for (let i = 0; i < 4; i++) push({ kind: 'smoke', pos: [pos[0] + jitter(0.4), pos[1] + 0.3, pos[2] + jitter(0.4)], vel: [jitter(0.4), 2.2 + r() * 1.2, jitter(0.4)], age: 0, life: 1.6 + r(), size0: 0.8, size1: 3.2, drag: 0.8, lift: 0.5, color: [0.95, 0.95, 0.94], alpha: 0.6, rot: r() * 6.28, spin: jitter(0.3), blend: 'alpha' });
    }
  }
  function shotHit(pos, dir, heavy = false, scale = 1, shot = null) {
    if (shot === 'grape') {
      const k = Math.max(1, Number(scale) || 1);
      for (let i = 0; i < 16; i++) {
        const at = [pos[0] + jitter(SPATTER_M * 0.5), pos[1] + jitter(0.8), pos[2] + jitter(SPATTER_M * 0.5)];
        push({ kind: 'debris', pos: at, vel: [jitter(3), 1 + r() * 3, jitter(3)], age: 0, life: 0.8 + r() * 0.8, size0: (0.08 + r() * 0.1) * k, size1: 0.08 * k, drag: 0.3, gravity: G, color: [0.4 + jitter(0.06), 0.28 + jitter(0.04), 0.17], alpha: 1, rot: r() * 6.28, spin: jitter(14), blend: 'alpha', solid: true });
      }
      smoke(pos, [0, 0.5, 0], 0.4 * k, 2);
      return;
    }
    hit(pos, dir, heavy, scale);
    if (shot === 'heated') {
      for (let i = 0; i < 10; i++) push({ kind: 'ember', pos: [pos[0] + jitter(0.3), pos[1] + jitter(0.3), pos[2] + jitter(0.3)], vel: [jitter(3), 1.5 + r() * 3.5, jitter(3)], age: 0, life: 0.8 + r() * 1.1, size0: 0.26, size1: 0.06, drag: 0.6, lift: 0.3, color: [1, 0.5 + r() * 0.2, 0.15], alpha: 1, rot: 0, spin: 0, blend: 'add' });
    }
  }
  function shotTear(pos, dir, shot = null) {
    tear(pos, dir);
    if (shot === 'chain') {
      tear(pos, dir);
      hit(pos, dir, false, 0.6);
    }
    if (shot === 'heated') burn(pos, 0.1);
  }
  function timber(pos, n = 2) {
    for (let i = 0; i < n; i++) {
      const a = r() * 6.28, sp = 0.3 + r() * 0.5, size = 0.8 + r() * 0.6;
      push({ kind: 'timber', flat: true, solid: true, aspect: 3 + r() * 2, pos: [pos[0] + jitter(2), pos[1] + 0.06, pos[2] + jitter(2)], vel: [Math.sin(a) * sp, 0, Math.cos(a) * sp],
        age: 0, life: TIMBER_LIFE * (1 + r() * 0.5), size0: size, size1: size, drag: 0.25, lift: 0, color: [0.3 + jitter(0.04), 0.2 + jitter(0.03), 0.12], alpha: 1, rot: r() * 6.28, spin: jitter(0.1), blend: 'alpha' });
    }
  }
  function smolder(a, b, dt, k) {
    if (r() >= SMOLDER_RATE * clamp(k, 0, 1) * clamp(dt, 0, 0.1)) return;
    const u = r();
    push({ kind: 'smoke', pos: [a[0] + (b[0] - a[0]) * u + jitter(1.2), a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u + jitter(1.2)], vel: [jitter(0.3), 1.1 + r() * 0.8, jitter(0.3)],
      age: 0, life: 4 + r() * 3, size0: 1.2, size1: 5.5, drag: 0.6, lift: 0.25, color: [0.36, 0.35, 0.34], alpha: 0.45, rot: r() * 6.28, spin: jitter(0.2), blend: 'alpha' });
  }
  function founder(pos, dt, spread = 6) {
    const k = clamp(dt, 0, 0.1);
    if (r() < 10 * k) push({ kind: 'foam', flat: true, pos: [pos[0] + jitter(spread), pos[1] + 0.04, pos[2] + jitter(spread)], vel: [0, 0, 0], age: 0, life: 2.4, size0: 1.2, size1: 4, drag: 0, lift: 0, color: [0.9, 0.95, 1], alpha: 0.6, rot: r() * 6.28, spin: 0, blend: 'alpha' });
    if (r() < BOIL_RATE * k) {
      const at = [pos[0] + jitter(spread * 0.7), pos[1], pos[2] + jitter(spread * 0.7)];
      for (let i = 0; i < 3; i++) push({ kind: 'spray', pos: [at[0] + jitter(0.2), at[1] + 0.05, at[2] + jitter(0.2)], vel: [jitter(0.5), 1.8 + r() * 1.6, jitter(0.5)], age: 0, life: 0.45 + r() * 0.3, size0: 0.25, size1: 0.5, drag: 0.4, gravity: G, color: [0.92, 0.96, 1], alpha: 0.8, rot: r() * 6.28, spin: jitter(1), blend: 'alpha' });
      push({ kind: 'foam', flat: true, pos: [at[0], at[1] + 0.04, at[2]], vel: [0, 0, 0], age: 0, life: 1, size0: 0.3, size1: 1.4, drag: 0, lift: 0, color: [0.92, 0.96, 1], alpha: 0.65, rot: r() * 6.28, spin: 0, blend: 'alpha' });
    }
  }

  function step(dt) {
    const t = Math.max(0, dt);
    if (t === 0) return;
    const w = wind();
    const ax = (w[0] ?? 0) * WIND_MPS, az = (w[2] ?? 0) * WIND_MPS;
    const keep = [];
    for (const p of parts) {
      p.age += t;
      if (p.age >= p.life) continue;
      const drag = Math.exp(-(p.drag ?? 0) * t);
      if (p.kind === 'smoke') { p.vel[0] = ax + (p.vel[0] - ax) * drag; p.vel[2] = az + (p.vel[2] - az) * drag; }
      else { p.vel[0] *= drag; p.vel[2] *= drag; }
      p.vel[1] = p.vel[1] * drag - (p.gravity ?? 0) * t + (p.lift ?? 0) * t;
      p.pos[0] += p.vel[0] * t; p.pos[1] += p.vel[1] * t; p.pos[2] += p.vel[2] * t;
      p.rot += p.spin * t;
      keep.push(p);
    }
    parts = keep.length > PARTICLE_BUDGET ? evict(keep, keep.length - PARTICLE_BUDGET) : keep;
  }
  function evict(list, n) {
    const byRank = [[], [], [], []];
    for (let i = 0; i < list.length; i++) byRank[EVICT_RANK[list[i].kind] ?? 0].push(i);
    const drop = new Uint8Array(list.length);
    for (const idx of byRank) {
      if (n <= 0) break;
      if (idx.length > n) idx.sort((a, b) => list[b].age / list[b].life - list[a].age / list[a].life);
      for (let k = 0; k < idx.length && n > 0; k++, n--) drop[idx[k]] = 1;
    }
    return list.filter((_, i) => !drop[i]);
  }

  function drawList() {
    return parts.map((p) => {
      const k = p.age / p.life;
      const size = p.size0 + (p.size1 - p.size0) * (p.kind === 'smoke' ? Math.sqrt(k) : k);
      const fade = p.kind === 'flash' || p.kind === 'glint' ? 1 - k : p.kind === 'smoke' ? Math.min(1, k * 6) * (1 - k) : p.kind === 'debris' || p.kind === 'shred' ? 1 - Math.max(0, k - 0.7) / 0.3
        : p.kind === 'timber' ? 1 - Math.max(0, k - 0.8) / 0.2 : 1 - k * k;
      return { pos: p.pos, size, color: [p.color[0], p.color[1], p.color[2], p.alpha * fade], rot: p.rot, blend: p.blend, flat: !!p.flat, solid: !!p.solid, kind: p.kind, aspect: p.aspect ?? 1 };
    });
  }

  function offsetAll(o) { for (const p of parts) { p.pos[0] += o[0]; p.pos[1] += o[1]; p.pos[2] += o[2]; } }

  return {
    muzzle, flash, smoke, splash, hit, blast, burn, glint, tear, founder, timber, smolder, step, drawList, offsetAll,
    spout, drench,
    shotMuzzle, shotSplash, shotHit, shotTear,
    clear() { parts = []; },
    get count() { return parts.length; },
  };
}
