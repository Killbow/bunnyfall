// @ts-check
// The reference blood mod is a feel reference only: no code or art from it ships here, only measured numbers.
// The ring holds a fixed count of marks and never retires one on a clock.

// Measured in the reference at 175, not the 200 its setting text claims.
export const OVERKILL_PERCENT = 175;
export const RATE_LADDER = Object.freeze([
  Object.freeze({ upTo: 25, rate: 30 }),
  Object.freeze({ upTo: 50, rate: 50 }),
  Object.freeze({ upTo: 100, rate: 70 }),
]);
export const RATE_NEAR_LETHAL = 150;
export const RATE_MAX = 200;
export const OVERKILL_RATE_HEAVY = 450;
export const OVERKILL_RATE = 350;
export const OVERKILL_SPEED = Object.freeze({ min: 5, max: 10 });
export const ORDINARY_SPEED = Object.freeze({ min: 1, max: 5 });
export const OVERKILL_REACH_SCALE = (OVERKILL_SPEED.min + OVERKILL_SPEED.max)
  / (ORDINARY_SPEED.min + ORDINARY_SPEED.max);

export const HEAVY_WEAPON_TEMPLATE = 126;

export function damagePercent(damage, maxHealth) {
  if (!(maxHealth > 0) || !(damage > 0)) return 0;
  return (damage / maxHealth) * 100;
}

export function ladderRate(percent) {
  if (percent >= OVERKILL_PERCENT) return RATE_MAX;
  for (const rung of RATE_LADDER) if (percent <= rung.upTo) return rung.rate;
  return RATE_NEAR_LETHAL;
}

export function scaleRate(rate, density = 1) {
  const d = Number.isFinite(density) ? Math.max(0, density) : 1;
  // The floor of one means a hit always leaves a mark however low the density.
  return Math.max(1, Math.round(rate * d));
}

export const bloodRate = (damage, maxHealth, density = 1) =>
  scaleRate(ladderRate(damagePercent(damage, maxHealth)), density);

export const MARK_SIZE_MIN = 0.35;
export const MARK_SIZE_MAX = 1.2;

export function markSize(rate) {
  const lo = ladderRate(0), hi = RATE_MAX;
  const t = Math.max(0, Math.min(1, (rate - lo) / (hi - lo)));
  return MARK_SIZE_MIN + (MARK_SIZE_MAX - MARK_SIZE_MIN) * t;
}

export const SPRAY_SHARE = 0.12;
export const SPRAY_MAX = 24;
export function sprayCount(rate) {
  if (!(rate > 0)) return 1;
  return Math.max(1, Math.min(SPRAY_MAX, Math.round(rate * SPRAY_SHARE)));
}

export const SPRAY_RADIUS_MIN = 0.35;
export const SPRAY_RADIUS_MAX = 1.8;
export function sprayRadius(rate) {
  const lo = ladderRate(0), hi = RATE_MAX;
  const t = Math.max(0, Math.min(1, (rate - lo) / (hi - lo)));
  return SPRAY_RADIUS_MIN + (SPRAY_RADIUS_MAX - SPRAY_RADIUS_MIN) * t;
}

export const SPRAY_LOBES_MAX = 3;
export const SPRAY_LOBE_SPREAD = 0.42;
export const SPRAY_STRAY = 0.18;
export const SPRAY_NEAR = 0.18;
export const SPRAY_FLYER = 0.08;
export const SPRAY_FLYER_REACH = 1.35;
export const SPRAY_SCALE_MIN = 0.3;
export const SPRAY_SCALE_MAX = 2.1;
const TAU = Math.PI * 2;
const frac = (x) => x - Math.floor(x);
const gauss = (u1, u2) => Math.sqrt(-2 * Math.log(Math.max(1e-6, 1 - u1))) * Math.cos(TAU * u2);
export function sprayScale(u) {
  const v = Math.max(0, Math.min(1, u));
  return v < 0.5
    ? SPRAY_SCALE_MIN + (1 - SPRAY_SCALE_MIN) * Math.pow(2 * v, 1.5)
    : 1 + (SPRAY_SCALE_MAX - 1) * Math.pow(2 * v - 1, 3);
}
export function sprayPattern(count, radius, thrown = null, rng = Math.random) {
  const n = Math.max(1, Math.floor(count) || 1);
  const R = radius > 0 ? radius : 0;
  const out = [{ dx: 0, dz: 0, scale: 1 }];
  if (n === 1) return out;
  const tx = thrown?.[0] ?? 0, tz = thrown?.[1] ?? 0;
  const main = Math.hypot(tx, tz) > 1e-6 ? Math.atan2(tz, tx) + (rng() - 0.5) * 0.4 : rng() * TAU;
  const k = Math.min(SPRAY_LOBES_MAX, 1 + Math.floor(rng() * SPRAY_LOBES_MAX));
  const lobes = [];
  let weight = 0;
  for (let j = 0; j < k; j++) {
    const ang = j === 0 ? main : main + (rng() < 0.5 ? -1 : 1) * (0.9 + rng() * 2);
    const w = j === 0 ? 1 : 0.3 + rng() * 0.4;
    lobes.push({ ang, w, spread: SPRAY_LOBE_SPREAD * (0.6 + rng() * 0.9) });
    weight += w;
  }
  for (let i = 1; i < n; i++) {
    let ang;
    if (frac(rng() + i * 0.7548776662) < SPRAY_STRAY) ang = frac(rng() + i * 0.6180339887) * TAU;
    else {
      let pick = frac(rng() + i * 0.6180339887) * weight, lobe = lobes[0];
      for (const l of lobes) { lobe = l; pick -= l.w; if (pick < 0) break; }
      ang = lobe.ang + gauss(rng(), frac(rng() + i * 0.5698402910)) * lobe.spread;
    }
    let r = R * (SPRAY_NEAR + (1 - SPRAY_NEAR) * Math.pow(frac(rng() + i * 0.4142135624), 0.8));
    let scale = sprayScale(rng());
    if (rng() < SPRAY_FLYER) { r *= SPRAY_FLYER_REACH; scale *= 0.6; }
    out.push({ dx: Math.cos(ang) * r, dz: Math.sin(ang) * r, scale });
  }
  return out;
}

export const SPATTER_SCALE = 0.45;
export const SIZE_JITTER = 0.3;
export function dropSize(i, rate, rng = Math.random) {
  const base = markSize(rate) * (i > 0 ? SPATTER_SCALE : 1);
  return Math.max(0, base * (1 + (rng() - 0.5) * 2 * SIZE_JITTER));
}

export const BURST_DROPS_MAX = 48;
export const burstRate = (heavy, density = 1) => scaleRate(heavy ? OVERKILL_RATE_HEAVY : OVERKILL_RATE, density);
export function burstCount(heavy, density = 1) {
  return Math.max(1, Math.min(BURST_DROPS_MAX, Math.round(burstRate(heavy, density) * SPRAY_SHARE)));
}
export const burstReach = (heavy, density = 1) => sprayRadius(burstRate(heavy, density)) * OVERKILL_REACH_SCALE;

export const CEILING_DOT = 0.7;
// The normal already faces the ray, so a ceiling hit from below points within CEILING_DOT of straight down.
export function isCeilingNormal(normal) {
  const n = unit(normal);
  return !!n && -n[1] > CEILING_DOT;
}

export const CEILING_EVERY = 4;
export const looksUp = (i) => i > 0 && (i + 1) % CEILING_EVERY === 0;

// Midpoints of the push bands each swing applies in the reference, in player space: x right, y up, z forward.
export const SWING_PUSH = Object.freeze({
  StrikeDown: Object.freeze([0, 3, 0]),
  StrikeDownLeft: Object.freeze([-7.5, -7.5, 0]),
  StrikeLeft: Object.freeze([-7.5, 0, 0]),
  StrikeRight: Object.freeze([7.5, 0, 0]),
  StrikeDownRight: Object.freeze([7.5, -7.5, 0]),
  StrikeUp: Object.freeze([0, 0, -5]),
});

export const SWING_LEAN = 0.08;

export function swingThrow(state, forward) {
  const p = Object.hasOwn(SWING_PUSH, state) ? SWING_PUSH[state] : null;
  if (!p) return [0, 0];
  const f = unit([forward?.[0] ?? 0, 0, forward?.[2] ?? 0]);
  if (!f) return [0, 0];
  // Only the flat push moves a mark on the floor, and right is (f.z, 0, -f.x) in the scene's handedness.
  const rx = f[2], rz = -f[0];
  return [(rx * p[0] + f[0] * p[2]) * SWING_LEAN, (rz * p[0] + f[2] * p[2]) * SWING_LEAN];
}

// Classic Daggerfall's blood index 2 is the bloodless set, such as skeletons.
export const BLOODLESS_INDEX = 2;
export const marksBlood = (bloodIndex) => (bloodIndex ?? 0) !== BLOODLESS_INDEX;

export const isOverkill = (damage, maxHealth) => damagePercent(damage, maxHealth) >= OVERKILL_PERCENT;

export function bloodHit(damage, entity, { fromPlayer = false, weapon = null, swing = null, forward = null } = {}) {
  return Object.freeze({
    damage: Number.isFinite(damage) ? damage : 0,
    // A relay-run body's maxHealth is a wire count, not its real health, so it measures as the bottom rung.
    maxHealth: Number.isFinite(entity?.maxHealth) && !entity?.relayHealth ? entity.maxHealth : 0,
    fromPlayer: !!fromPlayer,
    heavy: (weapon?.templateIndex ?? -1) === HEAVY_WEAPON_TEMPLATE,
    throw: Object.freeze(swingThrow(swing, forward)),
  });
}

export const LETHAL_HIT = Object.freeze({ damage: 1, maxHealth: 1, fromPlayer: true, heavy: false, throw: Object.freeze([0, 0]) });

// Matches the 2 cm nudge the hit splash uses, so a mark does not fight its surface.
export const SURFACE_LIFT = 0.02;

export function surfaceBasis(normal, turn = 0) {
  const n = unit(normal) ?? [0, 1, 0];
  const seed = Math.abs(n[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
  const r0 = unit(cross(seed, n)) ?? [1, 0, 0];
  const u0 = cross(n, r0);
  const c = Math.cos(turn), s = Math.sin(turn);
  return {
    normal: n,
    right: [r0[0] * c + u0[0] * s, r0[1] * c + u0[1] * s, r0[2] * c + u0[2] * s],
    up: [u0[0] * c - r0[0] * s, u0[1] * c - r0[1] * s, u0[2] * c - r0[2] * s],
  };
}

export function basisAlong(normal, along, turn = 0) {
  const n = unit(normal) ?? [0, 1, 0];
  const a = along ? [along[0], along[1], along[2]] : null;
  if (!a) return surfaceBasis(n, turn);
  const d = a[0] * n[0] + a[1] * n[1] + a[2] * n[2];
  const r = unit([a[0] - n[0] * d, a[1] - n[1] * d, a[2] - n[2] * d]);
  if (!r) return surfaceBasis(n, turn);
  return { normal: n, right: r, up: cross(n, r) };
}

export const STREAK_MAX = 2.5;
export function streakFor(flown, reach) {
  if (!(flown > 0) || !(reach > 0)) return 1;
  return 1 + Math.min(1, flown / reach) * (STREAK_MAX - 1);
}

export function impactStretch(across, down) {
  const h = Math.abs(across), v = Math.abs(down);
  if (!(h > 0) || !Number.isFinite(h)) return 1;
  if (!(v > 0)) return STREAK_MAX;
  return Math.min(STREAK_MAX, Math.hypot(h, v) / v);
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function unit(v) {
  if (!v) return null;
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > 1e-6 ? [v[0] / l, v[1] / l, v[2] / l] : null;
}

// Position 3, uv 2, rgba 4, and wetness 1, the layout the decal shader reads.
export const DECAL_FLOATS_PER_VERTEX = 10;
export const DECAL_VERTS = 4;
export const DECAL_FLOATS = DECAL_VERTS * DECAL_FLOATS_PER_VERTEX;

const WHITE = Object.freeze([1, 1, 1, 1]);

export function writeDecalQuad(out, offset, decal, uv = null) {
  const u0 = uv?.u0 ?? 0, v0 = uv?.v0 ?? 0, u1 = uv?.u1 ?? 1, v1 = uv?.v1 ?? 1;
  const [px, py, pz] = decal.pos;
  const h = decal.size / 2;
  const hs = h * (decal.stretch ?? 1);
  const rx = decal.right[0] * hs, ry = decal.right[1] * hs, rz = decal.right[2] * hs;
  const ux = decal.up[0] * h, uy = decal.up[1] * h, uz = decal.up[2] * h;
  const c = decal.tint ?? WHITE;
  const wet = Number.isFinite(decal.wet) ? Math.max(0, Math.min(1, decal.wet)) : 0;
  const corner = (i, sx, sy, u, v) => {
    const o = offset + i * DECAL_FLOATS_PER_VERTEX;
    out[o] = px + rx * sx + ux * sy;
    out[o + 1] = py + ry * sx + uy * sy;
    out[o + 2] = pz + rz * sx + uz * sy;
    out[o + 3] = u; out[o + 4] = v;
    out[o + 5] = c[0]; out[o + 6] = c[1]; out[o + 7] = c[2]; out[o + 8] = c[3] ?? 1;
    out[o + 9] = wet;
  };
  corner(0, -1, -1, u0, v0);
  corner(1, -1, 1, u0, v1);
  corner(2, 1, 1, u1, v1);
  corner(3, 1, -1, u1, v0);
  return offset + DECAL_FLOATS;
}

// An empty slot is a zero-area quad so the ring still draws whole in one call.
export function clearDecalQuad(out, offset) {
  out.fill(0, offset, offset + DECAL_FLOATS);
  return offset + DECAL_FLOATS;
}

export function decalIndices(capacity) {
  const out = new Uint32Array(capacity * 6);
  for (let q = 0; q < capacity; q++) {
    const b = q * DECAL_VERTS, o = q * 6;
    out[o] = b; out[o + 1] = b + 2; out[o + 2] = b + 1;
    out[o + 3] = b; out[o + 4] = b + 3; out[o + 5] = b + 2;
  }
  return out;
}

/** @param {{capacity?:number, rng?:() => number}} [opts] */
export function createBloodDecalPool({ capacity = 1000, rng = Math.random } = {}) {
  const cap = Math.max(1, Math.floor(Number.isFinite(Number(capacity)) ? Number(capacity) : 1000));
  /** @type {Array<any>} */
  const ring = new Array(cap).fill(null);
  let next = 0;
  let serial = 0;
  let live = 0;
  let touched = 0;

  function place(point, normal, { size = 1, tint = null, turn = null, along = null, stretch = 1, uv = null } = {}) {
    if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || !Number.isFinite(point[2])) return null;
    const basis = along ? basisAlong(normal, along, Number.isFinite(turn) ? turn : rng() * Math.PI * 2) : surfaceBasis(normal, Number.isFinite(turn) ? turn : rng() * Math.PI * 2);
    const slot = next;
    const d = {
      slot,
      serial: serial++,
      pos: [
        point[0] + basis.normal[0] * SURFACE_LIFT,
        point[1] + basis.normal[1] * SURFACE_LIFT,
        point[2] + basis.normal[2] * SURFACE_LIFT,
      ],
      normal: basis.normal,
      right: basis.right,
      up: basis.up,
      size: Number.isFinite(size) ? Math.max(0, size) : 0,
      stretch: Number.isFinite(stretch) ? Math.max(1, stretch) : 1,
      tint,
      uv,
    };
    if (!ring[slot]) live++;
    ring[slot] = d;
    next = (next + 1) % cap;
    if (slot + 1 > touched) touched = slot + 1;
    return d;
  }

  function at(slot) { return ring[slot] ?? null; }

  function decals() {
    const out = [];
    for (let i = 0; i < cap; i++) {
      const d = ring[(next + i) % cap];
      if (d) out.push(d);
    }
    return out;
  }

  function shiftOrigin(delta) {
    if (!delta) return 0;
    if (!Number.isFinite(delta[0]) || !Number.isFinite(delta[1]) || !Number.isFinite(delta[2])) return 0;
    let n = 0;
    for (const d of ring) {
      if (!d) continue;
      d.pos[0] += delta[0]; d.pos[1] += delta[1]; d.pos[2] += delta[2];
      n++;
    }
    return n;
  }

  function clear() {
    ring.fill(null);
    next = 0; live = 0; touched = 0;
    return true;
  }

  /** @returns {Array<[number, number]>} */
  // One draw blends in slot order without depth writes, so a wrapped ring draws its oldest range first.
  function ranges() {
    if (touched < cap) return touched > 0 ? [[0, touched]] : [];
    return next > 0 ? [[next, cap], [0, next]] : [[0, cap]];
  }

  return {
    ranges,
    get touched() { return touched; },
    place, decals, at, shiftOrigin, clear,
    get capacity() { return cap; },
    get count() { return live; },
    get placed() { return serial; },
    _ring: () => ring.slice(),
  };
}
