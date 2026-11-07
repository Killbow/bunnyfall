// BUNNYFALL (2026-11-07): WHO'S CUSTOM SKIN I DO NOT DRAW. Two viewer-side switches, neither of which the other player or the
// server ever hears of: the pref `graphics.customskins` (off = nobody else's custom paperdoll is drawn) and a list of
// accounts (`sub`) whose skins I hide one by one. A hidden skin's wearer is drawn with their ordinary look.
import { getPref } from '../uiPrefs.js';
import { appStorage } from '../appStorage.js';

const KEY = 'bunnyfall.skinHide';
/** @type {Set<string>|null} */
let hidden = null;
const listeners = new Set();

function load() {
  if (hidden) return hidden;
  hidden = new Set();
  try {
    const list = JSON.parse(appStorage()?.getItem?.(KEY) ?? '[]');
    for (const s of Array.isArray(list) ? list : []) if (typeof s === 'string' && s.length <= 80) hidden.add(s);
  } catch { /* an empty list */ }
  return hidden;
}
/** Whether other players' custom skins are drawn for me at all (the pref, on by default). */
export const customSkinsOn = () => getPref('graphics.customskins') !== false;
/** Whether this account's skin is hidden by me. */
export const skinHiddenFor = (/** @type {unknown} */ sub) => typeof sub === 'string' && load().has(sub);
/** Whether a peer's custom skin is drawn for me. */
export const skinShownFor = (/** @type {unknown} */ sub) => customSkinsOn() && !skinHiddenFor(sub);
export function setSkinHidden(/** @type {string} */ sub, /** @type {boolean} */ on) {
  const h = load();
  if (!sub || h.has(sub) === !!on) return;
  if (on) h.add(sub); else h.delete(sub);
  try { appStorage()?.setItem?.(KEY, JSON.stringify([...h].slice(-500))); } catch { /* kept for this visit */ }
  for (const f of listeners) f();
}
export const onSkinHideChange = (/** @type {() => void} */ f) => { listeners.add(f); return () => { listeners.delete(f); }; };
