// @ts-check
// Blows are judged on the struck player's own client, and the relay never learns ship damage. Coordinates are site
// meters with x east and z north.
import { SERPENT_ATTACK_TABLE, SERPENT_ATTACK_BY_ID, CRUSH, GRIP, MAEL_R, MAEL_EYE_R, MAEL_PULL, MAEL_SWIRL, MAEL_GRIND, SPIT_FLIGHT_MS, ramLen, RAM_V, serpentWrapYaw } from '../net/serpentBrain.js';

export function shipPoints(boat) {
  const fx = Math.sin(boat.yw) * boat.hl, fz = Math.cos(boat.yw) * boat.hl;
  return [[boat.x + fx, boat.z + fz], [boat.x, boat.z], [boat.x - fx, boat.z - fz]];
}

export function shapeMeets(atk, boat, t = atk?.at ?? 0) {
  const A = SERPENT_ATTACK_BY_ID[atk?.a];
  if (!A || !boat || !atk.tg?.length) return false;
  const [cx, cz] = atk.tg[0];
  const pts = shipPoints(boat);
  switch (A.shape) {
    case 'disc': return pts.some(([x, z]) => Math.hypot(x - cx, z - cz) <= A.r + boat.hw);
    case 'rings': return pts.some(([x, z]) => { const d = Math.hypot(x - cx, z - cz); return d >= A.r0 - boat.hw && d <= A.r1 + boat.hw; });
    case 'sector': return pts.some(([x, z]) => {
      const d = Math.hypot(x - cx, z - cz);
      return d <= A.r + boat.hw && (d < 1 || Math.abs(serpentWrapYaw(Math.atan2(x - cx, z - cz) - atk.yw)) <= (A.arc * Math.PI) / 360);
    });
    case 'lane': {
      const [bx, bz] = atk.tg[1] ?? atk.tg[0];
      const len = Math.hypot(bx - cx, bz - cz) || 1, ux = (bx - cx) / len, uz = (bz - cz) / len;
      const run = Math.max(0, Math.min(len, ((t - atk.at) / 1000) * RAM_V));
      return pts.some(([x, z]) => { const a = (x - cx) * ux + (z - cz) * uz, s = Math.abs((x - cx) * uz - (z - cz) * ux); return a >= -boat.hw && a <= run + boat.hw && s <= A.width / 2 + boat.hw; });
    }
    case 'ring': return pts.some(([x, z]) => Math.hypot(x - cx, z - cz) <= A.r);
    default: return false;
  }
}
export function ramHead(atk, t) {
  const A = SERPENT_ATTACK_BY_ID[atk?.a];
  if (A !== SERPENT_ATTACK_TABLE.ram || t < atk.at || t > atk.at + A.active || !atk.tg?.[1]) return null;
  const [ax, az] = atk.tg[0], [bx, bz] = atk.tg[1];
  const k = Math.min(1, ((t - atk.at) / 1000) * RAM_V / Math.max(1, ramLen()));
  return [ax + (bx - ax) * k, az + (bz - az) * k];
}

export const SERPENT_PAIR_SHARE = 2 / 3;
export const fleetShare = (n) => (n === 2 ? SERPENT_PAIR_SHARE : 1);
// Carries the rounding remainder on `carry` (mutated in place) so shared damage over a fight sums to `k` of the
// whole, instead of rounding each blow.
function shared(x, k, carry, key) {
  if (k === 1 || !carry) return Math.round(x * k);
  const v = x * k + (carry[key] ?? 0), n = Math.round(v);
  carry[key] = v - n;
  return n;
}
export const SERPENT_THROW_X = 0.5;
export const SERPENT_CANVAS_X = 0.5;
export const shipHurt = (A, whole, k = 1, carry = null) => ({ hull: shared(A.hull * whole.maxHull + A.base, k, carry, 'hull'), sail: shared(A.sail * SERPENT_CANVAS_X * whole.maxSail, k, carry, 'sail'), crew: shared(A.crew | 0, k, carry, 'crew') });
export const crushHurt = (whole, k = 1, carry = null) => shipHurt(CRUSH, whole, k, carry);
export const venomBite = (pool, maxHealth) => Math.max(1, Math.round(pool.pct * Math.max(0, maxHealth) + pool.base));
export const venomHurt = (whole, k = 1, carry = null) => shared(whole, k, carry, 'venom');
export function gripHurt(whole, dtS, carry = { hull: 0, crew: 0 }, k = 1) {
  const hull = carry.hull + (GRIP.hull * whole.maxHull + GRIP.base) * dtS * k, crew = carry.crew + GRIP.crew * dtS * k;
  const out = { hull: Math.floor(hull), sail: 0, crew: Math.floor(crew) };
  return { hurt: out, carry: { hull: hull - out.hull, crew: crew - out.crew } };
}
export function grindHurt(whole, dtS, carry = 0, k = 1) {
  const hull = carry + (MAEL_GRIND.hull * whole.maxHull + MAEL_GRIND.base) * dtS * k;
  return { hurt: { hull: Math.floor(hull), sail: 0, crew: 0 }, carry: hull - Math.floor(hull) };
}

export function shoveOf(atk, boat) {
  const A = SERPENT_ATTACK_BY_ID[atk?.a];
  if (!A || !(A.shove > 0) || !atk.tg?.length) return [0, 0];
  let dx = boat.x - atk.tg[0][0], dz = boat.z - atk.tg[0][1];
  if (A.shape === 'lane' && atk.tg[1]) {
    const lx = atk.tg[1][0] - atk.tg[0][0], lz = atk.tg[1][1] - atk.tg[0][1], l = Math.hypot(lx, lz) || 1;
    const side = Math.sign(dx * (lz / l) - dz * (lx / l)) || 1;
    dx = (lz / l) * side; dz = (-lx / l) * side;
  }
  const d = Math.hypot(dx, dz) || 1, v = A.shove * SERPENT_THROW_X;
  return [(dx / d) * v, (dz / d) * v];
}
export const SHOVE_S = 2.5;
export const shoveLeft = (v, ageS) => { const k = Math.max(0, 1 - ageS / SHOVE_S); return [v[0] * k, v[1] * k]; };

export const MAEL_GROW_MS = 4000;
export function maelPull(mael, x, z, t) {
  if (!mael || t < mael.at) return { v: [0, 0], eye: false, k: 0 };
  const dx = mael.x - x, dz = mael.z - z, d = Math.hypot(dx, dz);
  if (d > MAEL_R || d < 1e-6) return { v: [0, 0], eye: d <= MAEL_EYE_R, k: 0 };
  const grow = Math.min(1, (t - mael.at) / MAEL_GROW_MS), near = 1 - d / MAEL_R;
  const inward = (MAEL_PULL[0] + (MAEL_PULL[1] - MAEL_PULL[0]) * near) * grow, swirl = MAEL_SWIRL * near * grow;
  const ux = dx / d, uz = dz / d;
  return { v: [ux * inward + uz * swirl, uz * inward - ux * swirl], eye: d <= MAEL_EYE_R, k: grow };
}

export function globAt(atk, t, jawY = 14) {
  if (SERPENT_ATTACK_BY_ID[atk?.a] !== SERPENT_ATTACK_TABLE.spit || !atk.tg?.[0]) return null;
  const from = atk.at - SPIT_FLIGHT_MS;
  if (t < from || t > atk.at) return null;
  const k = (t - from) / SPIT_FLIGHT_MS, [bx, bz] = atk.tg[0];
  return [atk.x + (bx - atk.x) * k, jawY * (1 - k) + 22 * k * (1 - k), atk.z + (bz - atk.z) * k];
}
export const poolOf = (atk) => { const P = SERPENT_ATTACK_TABLE.spit.pool; return { x: atk.tg[0][0], z: atk.tg[0][1], r: P.r, at: atk.at, until: atk.at + P.ms, pct: P.pct, base: P.base }; };
export const poolBites = (p, x, z, t) => t >= p.at && t < p.until && Math.hypot(x - p.x, z - p.z) <= p.r;
