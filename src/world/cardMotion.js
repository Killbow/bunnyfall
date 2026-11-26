// @ts-check

// Real cards are 0.25 mm thick; `CARD_T` is 1 mm so the cloth never shows through a card.
export const CARD_W = 0.063;
export const CARD_L = 0.088;
export const CARD_T = 0.001;
export const DEAL_LIFT = 0.18;
export const FLIGHT_SPEED = 2.4;
export const FLIGHT_MIN_S = 0.18;
export const ARC_HEIGHT = 0.06;
export const SLIDE_DECEL = 3.2;
export const SLIDE_MIN = 0.02;
export const SLIDE_SPREAD = 0.05;
export const SPIN_MAX = 3.5;
export const REST_JITTER = 0.008;
export const YAW_JITTER = 0.12;
export const FLIP_S = 0.32;
// `THROW_LAND_S` is the longest a throw takes to land and stop; `settleMs` in cards/cardTableSession.js waits on it
// and on `DEAL_STAGGER`.
export const DEAL_STAGGER = 0.11;
export const THROW_LAND_S = 0.7;
export const CHIP_R = 0.0195;
export const CHIP_T = 0.0033;
export const CHIP_STACK_MAX = 20;
export const PUSH_S = 0.45;
export const SCOOP_LIFT = 0.03;
export const CHIP_VALUES = Object.freeze([500, 100, 25, 5, 1]);

export function hashSeed(...xs) {
  let h = 0x811c9dc5;
  for (const x of xs) { h ^= (x | 0) >>> 0; h = Math.imul(h, 0x01000193) >>> 0; h ^= h >>> 15; }
  return h >>> 0;
}
export function seedUnits(seed, n = 3) {
  let a = seed >>> 0;
  const out = [];
  for (let i = 0; i < n; i++) {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    out.push(((t ^ (t >>> 14)) >>> 0) / 4294967296);
  }
  return out;
}

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** @param {{from: number[], to: number[], yaw: number, roll?: number, t0: number, seed: number, fromYaw?: number, fromRoll?: number}} p */
export function dealMotion({ from, to, yaw, roll = Math.PI, t0, seed, fromYaw = undefined, fromRoll = roll }) {
  const [jx, jz, js] = seedUnits(seed);
  const rest = [to[0] + (jx - 0.5) * 2 * REST_JITTER, to[1], to[2] + (jz - 0.5) * 2 * REST_JITTER];
  const dx = rest[0] - from[0], dz = rest[2] - from[2];
  const dist = Math.hypot(dx, dz) || 1e-6;
  const dir = [dx / dist, dz / dist];
  const slide = Math.min(dist * 0.5, SLIDE_MIN + js * SLIDE_SPREAD);
  const land = [rest[0] - dir[0] * slide, rest[1], rest[2] - dir[1] * slide];
  const flight = Math.max(FLIGHT_MIN_S, (dist - slide) / FLIGHT_SPEED);
  const v0 = Math.sqrt(2 * SLIDE_DECEL * slide);
  const slideS = v0 / SLIDE_DECEL;
  const spin = (js - 0.5) * 2 * SPIN_MAX;
  const yawRest = yaw + (jx - jz) * YAW_JITTER;
  const tLand = t0 + flight, t1 = tLand + slideS;
  const spinLeft = (v) => spin * 0.25 * (v0 > 0 ? v / v0 : 0);
  return {
    t0, land: tLand, t1, rest,
    at(t) {
      const lying = fromYaw !== undefined;
      if (t <= t0) return lying ? { pos: from.slice(), yaw: fromYaw, roll: fromRoll, moving: false } : { pos: from.slice(), yaw: yawRest + spin, roll, moving: false, held: true };
      if (t < tLand) {
        const u = (t - t0) / flight;
        const y = lerp(from[1], land[1], u) + ARC_HEIGHT * 4 * u * (1 - u);
        const turn = lying ? lerp(fromYaw, yawRest + spinLeft(v0), u) : yawRest + spin * (1 - u) + spinLeft(v0);
        return { pos: [lerp(from[0], land[0], u), y, lerp(from[2], land[2], u)], yaw: turn, roll: lerp(fromRoll, roll, smooth(u)), moving: true };
      }
      if (t < t1) {
        const s = t - tLand, v = v0 - SLIDE_DECEL * s;
        const d = v0 * s - 0.5 * SLIDE_DECEL * s * s;
        return { pos: [land[0] + dir[0] * d, rest[1], land[2] + dir[1] * d], yaw: yawRest + spinLeft(v), roll, moving: true };
      }
      return { pos: rest.slice(), yaw: yawRest, roll, moving: false };
    },
  };
}

/** @param {{pos: number[], yaw: number, fromRoll?: number, t0: number, pivot?: 'edge'|'middle', acrossYaw?: number}} p */
export function flipMotion({ pos, yaw, fromRoll = Math.PI, t0, pivot = 'edge', acrossYaw = yaw }) {
  const t1 = t0 + FLIP_S;
  return {
    t0, t1,
    at(t) {
      const u = smooth((t - t0) / FLIP_S);
      const a = u * Math.PI;
      // `trs` Rz turns +X toward +Y for a positive roll, so the edge pivot subtracts the turn to keep the right
      // edge on the cloth.
      const r = [Math.cos(acrossYaw), 0 - Math.sin(acrossYaw)];
      const edge = pivot === 'edge';
      const lift = (CARD_W / 2) * Math.sin(a), across = edge ? (CARD_W / 2) * (1 - Math.cos(a)) : 0;
      return { pos: [pos[0] + r[0] * across, pos[1] + lift, pos[2] + r[1] * across], yaw, roll: edge ? fromRoll - a : fromRoll + a, moving: u > 0 && u < 1 };
    },
  };
}

export function flipShift(to, yaw) {
  return [to[0] - Math.cos(yaw) * CARD_W, to[1], to[2] + Math.sin(yaw) * CARD_W];
}

/** @param {number} amount */
export function chipStacks(amount) {
  let left = Math.max(0, Math.floor(Number(amount) || 0));
  const out = [];
  for (const value of CHIP_VALUES) {
    const count = Math.floor(left / value);
    if (count) { out.push({ value, count }); left -= count * value; }
  }
  return out;
}

/**
 * @param {number} amount
 * @param {number[]} at
 * @param {number} yaw
 * @param {boolean} [outward]
 */
export function chipDiscs(amount, at, yaw, outward = false) {
  const r = [Math.cos(yaw), 0 - Math.sin(yaw)];
  const columns = [];
  for (const { value, count } of chipStacks(amount)) for (let left = count; left > 0; left -= CHIP_STACK_MAX) columns.push({ value, count: Math.min(CHIP_STACK_MAX, left) });
  const out = [];
  columns.forEach((c, i) => {
    const off = (outward ? i : i - (columns.length - 1) / 2) * CHIP_R * 2.15;
    for (let k = 0; k < c.count; k++) out.push({ value: c.value, pos: [at[0] + r[0] * off, at[1] + CHIP_T * (k + 0.5), at[2] + r[1] * off] });
  });
  return out;
}

/**
 * @param {number[]} from
 * @param {number[]} to
 * @param {number} t0
 * @param {number} t
 * @param {number} [lift]
 */
export function pushAt(from, to, t0, t, lift = 0) {
  const u = smooth((t - t0) / PUSH_S);
  return [lerp(from[0], to[0], u), lerp(from[1], to[1], u) + lift * 4 * u * (1 - u), lerp(from[2], to[2], u)];
}

export const GATHER_S = 0.8;
export const GATHER_LIFT = 0.02;

/** @param {{from: {pos: number[], yaw: number, roll: number}, to: number[], yaw: number, t0: number}} p */
export function gatherMotion({ from, to, yaw, t0 }) {
  const t1 = t0 + GATHER_S;
  return {
    t0, t1, rest: to.slice(),
    at(t) {
      const u = smooth((t - t0) / GATHER_S);
      return { pos: [lerp(from.pos[0], to[0], u), lerp(from.pos[1], to[1], u) + GATHER_LIFT * 4 * u * (1 - u), lerp(from.pos[2], to[2], u)], yaw: lerp(from.yaw, yaw, u), roll: lerp(from.roll, Math.PI, u), moving: t < t1 };
    },
  };
}

export const DECK_PLATES = 16;
export const DECK_CARDS = 52;

export const RIFFLE_S = 0.8;
export const RIFFLE_HALF = 8;
export const RIFFLE_PART = 0.05;

/**
 * @param {number} t
 * @param {number} t0
 * @param {number[]} at
 * @param {number} yaw
 */
export function riffleAt(t, t0, at, yaw) {
  const u = (t - t0) / RIFFLE_S;
  if (!(u >= 0 && u < 1)) return [];
  const r = [Math.cos(yaw), 0 - Math.sin(yaw)];
  const n = RIFFLE_HALF * 2;
  const part = smooth(Math.min(1, u / 0.25)) * (1 - smooth((u - 0.8) / 0.2));
  const out = [];
  for (let k = 0; k < n; k++) {
    const side = k % 2 ? 1 : -1;
    const fall = 0.25 + 0.55 * (k / n);
    const fallen = smooth((u - fall) / 0.06);
    const inHalf = Math.floor(k / 2);
    const off = side * RIFFLE_PART * part * (1 - fallen);
    const layer = fallen > 0.5 ? k : RIFFLE_HALF + inHalf;
    out.push({ card: -1, pos: [at[0] + r[0] * off, at[1] + CARD_T * (0.5 + layer) + 0.012 * (1 - fallen) * part, at[2] + r[1] * off], yaw, roll: Math.PI + side * 0.35 * part * (1 - fallen) });
  }
  return out;
}
