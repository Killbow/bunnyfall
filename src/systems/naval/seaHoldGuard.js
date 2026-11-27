// @ts-check
import { appStorage } from '../../platform/appStorage.js';
import { t } from '../../ui/textManager.js';

// The boarding window (SEA_REF.boardMs) plus a minute for the wreck carry; the hold opens when the carry lands.
export const SEA_HOLD_SHUT_MS = 240_000;
export const SEA_HOLD_SHUT_KEY = 'dfo.sea.holdShut';

/** @type {Map<number, number>} */
const shut = new Map();
let read = false;
const storage = () => { try { return appStorage(); } catch { return null; } };
function load() {
  if (read) return;
  read = true;
  try {
    const o = JSON.parse(storage()?.getItem(SEA_HOLD_SHUT_KEY) ?? '{}');
    for (const [k, v] of Object.entries(o && typeof o === 'object' ? o : {})) if (Number.isSafeInteger(Number(k)) && Number.isFinite(v)) shut.set(Number(k), v);
  } catch { }
}
const save = () => { try { storage()?.setItem(SEA_HOLD_SHUT_KEY, JSON.stringify(Object.fromEntries(shut))); } catch { } };

// The prize is read from the record when the wreck is carried, so the hold stays shut until then.
// The shut holds survive a reload.
export function shutSeaHold(/** @type {unknown} */ uid, now = Date.now()) {
  load();
  if (!(Number.isSafeInteger(uid) && /** @type {number} */ (uid) > 0)) return;
  shut.set(/** @type {number} */ (uid), now + SEA_HOLD_SHUT_MS);
  save();
}
export function openSeaHold(/** @type {unknown} */ uid) {
  load();
  if (shut.delete(/** @type {number} */ (uid))) save();
}
export function seaHoldShut(/** @type {unknown} */ uid, now = Date.now()) {
  load();
  const until = shut.get(/** @type {number} */ (uid));
  if (until == null) return false;
  if (now < until) return true;
  shut.delete(/** @type {number} */ (uid));
  save();
  return false;
}
/** What a page says of a shut hold. */
export const seaHoldShutText = () => t('sea.pvp.holdShut', 'The hold is locked while the wreck can still be boarded.');
