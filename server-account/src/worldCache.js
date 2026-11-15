// @ts-check
// Garrison, farm, and charter lists cached per isolate for WORLD_KEPT_MS; concurrent readers share one load.
// Farm, garrison, and charter writes drop it in this isolate; any other change shows within WORLD_KEPT_MS.
import { DB_ROOT } from './service.js';

export const WORLD_KEPT_MS = 30_000;

/** @type {WeakMap<object, Map<string, { gen: number, at: number, value: any, asking: Promise<any>|null }>>} */
const kept = new WeakMap();

const slot = (/** @type {any} */ db, /** @type {string} */ name) => {
  const root = db?.[DB_ROOT] ?? db;
  let m = kept.get(root);
  if (!m) kept.set(root, m = new Map());
  let s = m.get(name);
  if (!s) m.set(name, s = { gen: 0, at: -Infinity, value: undefined, asking: null });
  return s;
};

export async function keptWorld(/** @type {any} */ db, /** @type {string} */ name, /** @type {() => Promise<any>} */ load) {
  const s = slot(db, name);
  if (s.value !== undefined && Date.now() - s.at < WORLD_KEPT_MS) return s.value;
  if (s.asking) return s.asking;
  const gen = s.gen;
  const ask = load().then((value) => { if (s.gen === gen) { s.value = value; s.at = Date.now(); } return value; })
    .finally(() => { if (s.asking === ask) s.asking = null; });
  s.asking = ask;
  return ask;
}

export function dropWorld(/** @type {any} */ db, /** @type {string[]} */ ...names) {
  for (const n of names) { const s = slot(db, n); s.gen++; s.value = undefined; s.asking = null; }
}
