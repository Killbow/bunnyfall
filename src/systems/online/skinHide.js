// BUNNYFALL (2026-11-07): WHO'S CUSTOM SKIN I DO NOT DRAW. Two viewer-side switches, neither of which the other player or the
// server ever hears of: the pref `graphics.customskins` (off = nobody else's custom paperdoll is drawn) and a list of
// accounts (`sub`) whose skins I hide one by one. A hidden skin's wearer is drawn with their ordinary look.
import { getPref } from '../uiPrefs.js';
import { appStorage } from '../appStorage.js';

const KEY = 'bunnyfall.skinHide';
/** sub -> the name it was hidden under (so /showskin and /hiddenskins can say who)
 *  @type {Map<string, string>|null} */
let hidden = null;
const listeners = new Set();

function load() {
  if (hidden) return hidden;
  hidden = new Map();
  try {
    const list = JSON.parse(appStorage()?.getItem?.(KEY) ?? '{}');
    const rows = Array.isArray(list) ? list.map((s) => [s, '']) : Object.entries(list ?? {});
    for (const [sub, name] of rows) if (typeof sub === 'string' && sub.length <= 80) hidden.set(sub, typeof name === 'string' ? name.slice(0, 40) : '');
  } catch { /* an empty list */ }
  return hidden;
}
/** Whether other players' custom skins are drawn for me at all (the pref, on by default). */
export const customSkinsOn = () => getPref('graphics.customskins') !== false;
/** Whether this account's skin is hidden by me. */
export const skinHiddenFor = (/** @type {unknown} */ sub) => typeof sub === 'string' && load().has(sub);
/** Whether a peer's custom skin is drawn for me. */
export const skinShownFor = (/** @type {unknown} */ sub) => customSkinsOn() && !skinHiddenFor(sub);
/** Who is hidden: [[sub, name], ...]. */
export const hiddenSkins = () => [...load()];
export function setSkinHidden(/** @type {string} */ sub, /** @type {boolean} */ on, /** @type {string} */ name = '') {
  const h = load();
  if (!sub || h.has(sub) === !!on) return;
  if (on) h.set(sub, String(name).slice(0, 40)); else h.delete(sub);
  try { appStorage()?.setItem?.(KEY, JSON.stringify(Object.fromEntries([...h].slice(-500)))); } catch { /* kept for this visit */ }
  for (const f of listeners) f();
}
export const onSkinHideChange = (/** @type {() => void} */ f) => { listeners.add(f); return () => { listeners.delete(f); }; };
