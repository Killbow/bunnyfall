// @ts-check
// Living-world rolls must use these seeded helpers, never `Math.random` or the DFRandom global stream, so every
// client derives the same world.
import { hash32 } from '../../world/spawnedDungeons.js';
import { seededRng } from '../../weather/wind.js';

// Changing the salt re-rolls every resident, so saved regards and tales would attach to different people.
export const LW_SALT = 0x11fe;

/** @param {...number} parts */
export const lwSeed = (...parts) => hash32(LW_SALT, ...parts);
/** @param {...number} parts */
export const lwRng = (...parts) => seededRng(lwSeed(...parts));
/** @param {...number} parts */
export const lwRoll = (...parts) => lwSeed(...parts) / 4294967296;

/**
 * @param {() => number} rng
 * @param {number} lo
 * @param {number} hi
 */
export const rollInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
/**
 * @template T
 * @param {() => number} rng
 * @param {readonly T[]} list
 * @returns {T}
 */
export const pickOf = (rng, list) => list[Math.floor(rng() * list.length) % list.length];
/**
 * @param {() => number} rng
 * @param {Record<string, number>} weights
 * @returns {string|null}
 */
export function pickWeighted(rng, weights) {
  let total = 0;
  for (const k in weights) if (weights[k] > 0) total += weights[k];
  if (!(total > 0)) return null;
  let r = rng() * total;
  let last = null;
  for (const k in weights) {
    if (!(weights[k] > 0)) continue;
    last = k;
    r -= weights[k];
    if (r < 0) return k;
  }
  return last;
}

/** @param {string} s */
export function textSeed(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
