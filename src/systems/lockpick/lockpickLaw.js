// @ts-check
import { actBand } from '../../net/professionLaw.js';

export const LOCK_PINS_MIN = 2;
export const LOCK_PINS_MAX = 6;
export const LOCK_PINS_STEP = 4;
export const SPOOL_ONE = 8;
export const SPOOL_TWO = 14;

export const LOCKPICK_ACT = Object.freeze({
  riseS: 0.2,
  riseJitter: 0.45,
  fallS: 0.32,
  springS: 0.22,
  graceS: 0.03,
  windowMinS: 0.08,
  windowMaxS: 0.6,
  breakScale: 0.55,
  breakMin: 0.04,
  breakMax: 0.6,
  freeRisk: 0.35,
  senseSkill: 50,
});

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const chanceOf = (chance) => clamp(Number.isFinite(chance) ? chance : 5, 5, 95);

export const pinsFor = (lock) => clamp(LOCK_PINS_MIN + Math.floor(Math.max(0, Number(lock) || 0) / LOCK_PINS_STEP), LOCK_PINS_MIN, LOCK_PINS_MAX);
export const spoolsFor = (lock) => ((Number(lock) || 0) >= SPOOL_TWO ? 2 : (Number(lock) || 0) >= SPOOL_ONE ? 1 : 0);
export const setWindowS = (chance, band = 1) => {
  const A = LOCKPICK_ACT;
  return (A.windowMinS + ((A.windowMaxS - A.windowMinS) * (chanceOf(chance) - 5)) / 90) * (Number(band) > 0 ? Number(band) : 1);
};
export const slipBreakChance = (chance) => clamp(((100 - chanceOf(chance)) / 100) * LOCKPICK_ACT.breakScale, LOCKPICK_ACT.breakMin, LOCKPICK_ACT.breakMax);
export const lockBand = (agility) => actBand(Number(agility) || 0);
export const sensesBinding = (skill) => (Number(skill) || 0) >= LOCKPICK_ACT.senseSkill;

export function lockSeed(key) {
  let h = 0x811c9dc5;
  const s = String(key ?? '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
function stream(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function bindingOrder(n, seed) {
  const order = Array.from({ length: Math.max(0, n | 0) }, (_, i) => i);
  const r = stream(seed);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return order;
}
export function spoolPins(n, spools, seed) {
  const order = bindingOrder(n, seed);
  const r = stream((seed ^ 0x9e3779b9) >>> 0);
  const pool = order.slice(1);
  const out = Array.from({ length: order.length }, () => false);
  for (let k = 0; k < Math.min(spools, pool.length); k++) {
    const j = k + Math.floor(r() * (pool.length - k));
    [pool[k], pool[j]] = [pool[j], pool[k]];
    out[pool[k]] = true;
  }
  return out;
}
// Matches DFU: an interior lock rolls 0 to 99 against the chance, while a front door rolls 1 to 100, hence the
// `exterior` offset.
export const autoOpens = (chance, roll01, exterior = false) => (exterior ? 1 : 0) + Math.floor(Number(roll01) * 100) < chanceOf(chance);
