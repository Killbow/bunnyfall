// Viewer-side switches that hide other players' custom skins: a global pref and a per-account list.
import { getPref } from '../ui/uiPrefs.js';
import { appStorage } from '../platform/appStorage.js';

const KEY = 'bunnyfall.skinHide';
/** @type {Map<string, string>|null} */
let hidden = null;
const listeners = new Set();

function load() {
  if (hidden) return hidden;
  hidden = new Map();
  try {
    const list = JSON.parse(appStorage()?.getItem?.(KEY) ?? '{}');
    const rows = Array.isArray(list) ? list.map((s) => [s, '']) : Object.entries(list ?? {});
    for (const [sub, name] of rows) if (typeof sub === 'string' && sub.length <= 80) hidden.set(sub, typeof name === 'string' ? name.slice(0, 40) : '');
  } catch { }
  return hidden;
}
export const customSkinsOn = () => getPref('graphics.customskins') !== false;
export const skinHiddenFor = (/** @type {unknown} */ sub) => typeof sub === 'string' && load().has(sub);
export const skinShownFor = (/** @type {unknown} */ sub) => customSkinsOn() && !skinHiddenFor(sub);
export const hiddenSkins = () => [...load()];
export function setSkinHidden(/** @type {string} */ sub, /** @type {boolean} */ on, /** @type {string} */ name = '') {
  const h = load();
  if (!sub || h.has(sub) === !!on) return;
  if (on) h.set(sub, String(name).slice(0, 40)); else h.delete(sub);
  try { appStorage()?.setItem?.(KEY, JSON.stringify(Object.fromEntries([...h].slice(-500)))); } catch { }
  for (const f of listeners) f();
}
export const onSkinHideChange = (/** @type {() => void} */ f) => { listeners.add(f); return () => { listeners.delete(f); }; };
