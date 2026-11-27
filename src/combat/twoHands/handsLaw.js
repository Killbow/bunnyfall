// @ts-check
// Pure two-hand rules shared by the sprite and Morrowind arm lanes; callers pass each hand already described.

import { swingHeft, SWING_FRAME_MAX } from '../../characters/weaponStates.js';

export const HANDS_MODE = Object.freeze({ Single: 'single', Fists: 'fists', Dual: 'dual' });

// WEAPON_TYPES values from combat/fpsWeapon.js, copied because this module is a leaf; keep them equal.
export const DUAL_TYPES = Object.freeze([0, 1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
// ITEM_HANDS.Both from characters/equipTable.js; keep them equal.
const HANDS_BOTH = 4;

/** @typedef {{ item?: any, type?: number, hands?: number, shield?: boolean } | null | undefined} HandDesc */

export function dualEligible(/** @type {HandDesc} */ h) {
  const t = /** @type {number} */ (h?.type);
  return !!h?.item && !h.shield && h.hands !== HANDS_BOTH && DUAL_TYPES.includes(t);
}

/** @param {{ right?: HandDesc, left?: HandDesc, claws?: boolean, leftBusy?: boolean }} hands */
export function handsModeOf({ right = null, left = null, claws = false, leftBusy = false } = {}) {
  if (claws || leftBusy) return HANDS_MODE.Single;
  if (!right?.item && !left?.item) return HANDS_MODE.Fists;
  if (dualEligible(right) && dualEligible(left)) return HANDS_MODE.Dual;
  return HANDS_MODE.Single;
}

export const twoHanded = (mode) => mode === HANDS_MODE.Fists || mode === HANDS_MODE.Dual;

export const otherHand = (hand) => (hand === 'L' ? 'R' : 'L');

export const FLURRY_WINDOW = 0.75;

/**
 * @param {{ mode?: string, lead?: string, last?: string | null, sinceLast?: number }} [s]
 * @returns {{ hand: 'R'|'L', flurry: boolean, off: boolean }}
 */
export function strikeHandOf({ mode = HANDS_MODE.Single, lead = 'R', last = null, sinceLast = Infinity } = {}) {
  const lh = lead === 'L' ? 'L' : 'R';
  if (!twoHanded(mode)) return { hand: lh, flurry: false, off: false };
  const flurry = (last === 'R' || last === 'L') && sinceLast <= FLURRY_WINDOW;
  const hand = flurry ? otherHand(last) : lh;
  const dual = mode === HANDS_MODE.Dual;
  return { hand, flurry: dual && flurry, off: dual && hand !== lh };
}

const MIRROR_STRIKE = Object.freeze({
  StrikeLeft: 'StrikeRight', StrikeRight: 'StrikeLeft', StrikeDownLeft: 'StrikeDownRight', StrikeDownRight: 'StrikeDownLeft',
});
export const mirrorStrike = (state) => MIRROR_STRIKE[state] ?? state;

export const MIRROR_UV = Object.freeze({ u0: 1, v0: 0, u1: 0, v1: 1 });

export function mirrorRect(r, width, x0 = 0) {
  return { ...r, x: x0 + (x0 + width) - (r.x + r.w) };
}

export const handOnLeft = (hand, leftHanded) => (hand === 'L') !== !!leftHanded;

// Read from the WEAPON10.CIF frames: bare-hand records paint either arm, and weapon files paint only the right arm.
export const MELEE_PAINTED_ARM = Object.freeze(['R', 'L', 'R', 'L', 'R', 'R', 'L']);

/**
 * @param {'R'|'L'} hand
 * @param {string} state
 * @param {{ leftHanded?: boolean, painted?: (state: string) => string }} [o]
 * @returns {{ state: string, mirror: boolean }}
 */
export function strikePicture(hand, state, { leftHanded = false, painted = () => 'R' } = {}) {
  const side = handOnLeft(hand, leftHanded) ? 'L' : 'R';
  if (painted(state) === side) return { state, mirror: false };
  const ms = mirrorStrike(state);
  return painted(ms) === side ? { state: ms, mirror: false } : { state: ms, mirror: true };
}

// A flurry is quicker by starting frames into its swing, not by scaling tick time. The machine drops each tick's
// remainder, so a time factor would give a different result at every frame rate.
export const DUAL = Object.freeze({
  FLURRY_FROM_FRAME: 1,
  OFF_DAMAGE: 0.8,
  OFF_TO_HIT: -5,
  OFF_TO_HIT_PER_AGILITY: 0.1,
  OFF_TO_HIT_MIN: -10,
  OFF_TO_HIT_MAX: 0,
  OFF_WEIGHT: 1.5,
});

export function offHandToHit(agility) {
  const a = Number.isFinite(agility) ? agility : 50;
  const t = DUAL.OFF_TO_HIT + Math.round((a - 50) * DUAL.OFF_TO_HIT_PER_AGILITY);
  return Math.max(DUAL.OFF_TO_HIT_MIN, Math.min(DUAL.OFF_TO_HIT_MAX, t));
}

export function offHandBurden(weightKg, strength) {
  return swingHeft((weightKg || 0) * DUAL.OFF_WEIGHT, strength) / swingHeft(weightKg || 0, strength);
}

// The burden is held in whole ticks at the end of the swing, and the fraction carries to the next blow.
/** @returns {{ hold: number, carry: number }} */
export function offHandHold({ burden = 1, ticks = 0, tick = 0, carry = 0 } = {}) {
  const most = tick > 0 ? Math.max(1, SWING_FRAME_MAX / tick) : 1;
  const owed = Math.max(0, (Math.min(burden, most) - 1) * ticks) + Math.max(0, carry || 0);
  const hold = Math.floor(owed + 1e-9);
  return { hold, carry: Math.max(0, owed - hold) };
}

export function offHandDamage(damage) {
  if (!(damage > 0)) return damage;
  return Math.max(1, Math.round(damage * DUAL.OFF_DAMAGE));
}

export const OFF_HAND_BLOW = Object.freeze({ blowShare: offHandDamage, blowWeight: DUAL.OFF_DAMAGE });

// A resting weapon only lowers: its art is cut on the outer side and drawn flush to the view edge, so moving it
// inward would show the cut.
export const GUARD = Object.freeze({
  IN: 10,
  DOWN: 9,
  LOWER: 0.12,
  IN_TAU: 0.05,
  OUT_TAU: 0.14,
  BOUNCE_PX: 1.6,
  BOUNCE_HZ: 1.15,
});

export function easeTo(v, target, tau, dt) {
  if (!(tau > 0)) return target;
  return v + (target - v) * (1 - Math.exp(-Math.max(0, dt) / tau));
}

export function guardStep(g, otherStriking, dt) {
  return easeTo(g, otherStriking ? 1 : 0, otherStriking ? GUARD.IN_TAU : GUARD.OUT_TAU, dt);
}

export function guardOffset(g, side, { time = 0, bounce = 0, hand = 'R', height = null } = {}) {
  const toMid = side === 'left' ? 1 : -1;
  const phase = hand === 'L' ? Math.PI : 0;
  const b = bounce > 0 ? (1 - Math.cos(time * 2 * Math.PI * GUARD.BOUNCE_HZ + phase)) * GUARD.BOUNCE_PX * bounce : 0;
  const weapon = Number.isFinite(height);
  const down = weapon ? GUARD.LOWER * /** @type {number} */ (height) : GUARD.DOWN;
  return [weapon ? 0 : toMid * GUARD.IN * g, down * g + b];
}

export const PAIR_SPREAD = Object.freeze({
  MIN: 0.04,
  GAP: 0.04,
  MAX: 0.2,
  TAU: 0.12,
});

export function pairSpreadAngle(innerAt, fov) {
  const tan = Math.tan(fov / 2);
  const share = (k) => Math.atan(k * 2 * tan);
  const gap = 2 * Math.atan(PAIR_SPREAD.GAP * tan);
  const clear = (a) => { const e = innerAt(a); return !e || !Number.isFinite(e.L) || !Number.isFinite(e.R) || /** @type {number} */ (e.L) + /** @type {number} */ (e.R) >= gap; };
  let lo = share(PAIR_SPREAD.MIN), hi = share(PAIR_SPREAD.MAX);
  if (clear(lo)) return lo;
  if (!clear(hi)) return hi;
  for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (clear(m)) hi = m; else lo = m; }
  return hi;
}

// Matches WALK_STEP_INTERVAL in audio/footsteps.js, so the hands pump in step with the head bob.
export const RUN_STEP_M = 2.5;

// The pump never lifts a sprite: the arm frame is cut only at its foot, which stays below the view edge.
export const RUN_PUMP = Object.freeze({
  ARM_STATE: 'StrikeDownLeft',
  ARM_FRAME: 1,
  DROP: 1.05,
  IN: 0.06,
  OUT: 0.03,
  SWAP: 0.5,
  IN_TAU: 0.12,
  OUT_TAU: 0.16,
  PUNCH_TAU: 0.04,
  MIN_SPEED: 1.0,
  CATCH: 0.5,
  AIR_GRACE: 0.6,
});

export const runPhaseOfBob = (timer) => timer - Math.PI / 2;

const strideStep = (speed, dt) => Math.max(0, speed || 0) * Math.max(0, dt) * Math.PI / RUN_STEP_M;

export function runPhaseStep(phase, speed, dt) {
  const p = phase + strideStep(speed, dt);
  return p % (2 * Math.PI);
}

// The head bob timer jumps when a run starts, stops, or wraps, so the stride follows it only within CATCH and
// otherwise catches up over a few strokes.
export function runPhaseFollow(phase, bob, speed, dt, fresh = false) {
  if (!Number.isFinite(bob)) return runPhaseStep(phase, speed, dt);
  if (fresh || !Number.isFinite(phase)) return bob;
  const walk = strideStep(speed, dt);
  const lo = walk * (1 - RUN_PUMP.CATCH), hi = walk * (1 + RUN_PUMP.CATCH);
  const turn = 2 * Math.PI;
  const off = bob - phase - turn * Math.round((bob - phase) / turn);
  if (off >= lo && off <= hi) return bob;
  return (phase + Math.min(hi, Math.max(lo, off))) % turn;
}

export function runHandsKept({ wanted = false, aloft = false, wasWanted = false, airSeconds = 0 } = {}) {
  return !!wanted || (!!aloft && !!wasWanted && airSeconds <= RUN_PUMP.AIR_GRACE);
}

export function runHandsWanted({ running = false, standing = false, grounded = true, crouching = false, riding = false,
  swimming = false, climbing = false, speed = 0, emptyHands = false, attacking = false } = {}) {
  return !!running && !standing && !!grounded && !crouching && !riding && !swimming && !climbing && !attacking
    && !!emptyHands && speed >= RUN_PUMP.MIN_SPEED;
}

export function pumpOf(phase, hand) {
  const s = Math.sin(phase + (hand === 'L' ? Math.PI : 0));
  const fwd = Math.max(0, s), back = Math.max(0, -s);
  return { dx: RUN_PUMP.IN * fwd - RUN_PUMP.OUT * back, dy: RUN_PUMP.DROP * (1 - s) / 2, frame: RUN_PUMP.ARM_FRAME, s };
}

export const RUN_3D = Object.freeze({
  TOP: Object.freeze({ x: 0.6, y: -0.62, d: 0.42 }),
  BOTTOM: Object.freeze({ x: 0.8, y: -1.7, d: 0.38 }),
  CURL: 1.5,
});
export function pumpTarget3D(phase, hand) {
  const { s } = pumpOf(phase, hand);
  const f = (s + 1) / 2;
  const lerp = (a, b) => a * (1 - f) + b * f;
  return { x: lerp(RUN_3D.BOTTOM.x, RUN_3D.TOP.x), y: lerp(RUN_3D.BOTTOM.y, RUN_3D.TOP.y), d: lerp(RUN_3D.BOTTOM.d, RUN_3D.TOP.d), s };
}

export function runWeightStep(w, wanted, punching, dt) {
  if (punching) return easeTo(w, 0, RUN_PUMP.PUNCH_TAU, dt);
  return easeTo(w, wanted ? 1 : 0, wanted ? RUN_PUMP.IN_TAU : RUN_PUMP.OUT_TAU, dt);
}
