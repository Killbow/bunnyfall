// Asset loads cached by key that forget a failure: one dropped download must not leave a model, weapon, face, or
// texture missing until the page reloads. A failure is held for LOAD_RETRY_MS, so a caller that asks every frame does
// not ask the network every frame. Each further failure of the same key doubles the wait, up to LOAD_RETRY_MAX_MS.
export const LOAD_RETRY_MS = 10_000;
export const LOAD_RETRY_MAX_MS = 300_000;

/** @type {WeakMap<Map<any, any>, Map<any, number>>} */
const failures = new WeakMap();

/** @param {Map<any, any>} cache @param {any} key @param {any} held @param {number} [ms] */
export function forgetLater(cache, key, held, ms = LOAD_RETRY_MS) {
  let counts = failures.get(cache);
  if (!counts) failures.set(cache, (counts = new Map()));
  const n = counts.get(key) ?? 0;
  counts.set(key, n + 1);
  setTimeout(() => { if (cache.get(key) === held) cache.delete(key); }, Math.min(ms * 2 ** n, LOAD_RETRY_MAX_MS));
}

/** @template T @param {Map<any, Promise<T>>} cache @param {any} key @param {() => T | Promise<T>} load @param {number} [ms]
 *  @returns {Promise<T>} */
export function cachedLoad(cache, key, load, ms = LOAD_RETRY_MS) {
  const held = cache.get(key);
  if (held) return held;
  let p;
  try { p = Promise.resolve(load()); } catch (e) { p = Promise.reject(e); }
  cache.set(key, p);
  p.then(() => { failures.get(cache)?.delete(key); }, () => forgetLater(cache, key, p, ms));
  return p;
}
