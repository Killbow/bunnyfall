// @ts-check
// A settled week is never unsettled, so an isolate caches it per database binding until that week passes.
// A D1 Time Travel restore past a Turning breaks this: redeploy the Worker after a manual restore.
import { DB_ROOT } from './service.js';

/** @type {WeakMap<object, Map<string, number>>} */
let kept = new WeakMap();
const keyOf = (/** @type {any} */ db) => (db && typeof db === 'object' ? db[DB_ROOT] ?? db : null);

export function weekSettled(/** @type {any} */ db, /** @type {string} */ name, /** @type {number} */ week) {
  const k = keyOf(db);
  return !!k && kept.get(k)?.get(name) === week;
}
export function keepWeekSettled(/** @type {any} */ db, /** @type {string} */ name, /** @type {number} */ week) {
  const k = keyOf(db);
  if (!k) return;
  let m = kept.get(k);
  if (!m) kept.set(k, (m = new Map()));
  m.set(name, week);
}
export function _resetWeeksKept() { kept = new WeakMap(); }
