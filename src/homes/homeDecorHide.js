// @ts-check
// Hides another player's home decorations for this browser only; the choice stays in local storage, never sent.

import { t } from '../ui/textManager.js';

export const HOME_HIDE_VERB = 'home-decor-hide';
const STORE_KEY = 'bunnyfall.hiddenHomeDecor';
const MAX = 500;

/** @type {Set<string> | null} */
let hidden = null;
let version = 0;
const keyOf = (/** @type {number} */ mapId, /** @type {number} */ bk) => `${Number(mapId) >>> 0}:${Number(bk) >>> 0}`;

function load() {
  if (hidden) return hidden;
  hidden = new Set();
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(STORE_KEY) ?? '[]');
    if (Array.isArray(raw)) for (const k of raw.slice(-MAX)) if (typeof k === 'string' && /^\d+:\d+$/.test(k)) hidden.add(k);
  } catch { }
  return hidden;
}
function save() {
  try { globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify([...load()].slice(-MAX))); } catch { }
}

export const homeHideable = (/** @type {any} */ home) => !!home && !home.own && home.mine !== true && home.member !== true && home.insider !== true;
export const homeDecorHiddenByMe = (/** @type {number} */ mapId, /** @type {number} */ bk) => load().has(keyOf(mapId, bk));
export const homeDecorSeenByMe = (/** @type {any} */ home, /** @type {number} */ mapId, /** @type {number} */ bk, shown = true) =>
  shown && !(homeHideable(home) && homeDecorHiddenByMe(mapId, bk));
export function toggleHomeDecorHidden(/** @type {number} */ mapId, /** @type {number} */ bk) {
  const s = load(), k = keyOf(mapId, bk);
  if (s.has(k)) s.delete(k); else s.add(k);
  version++;
  save();
  return s.has(k);
}
export const homeHideVersion = () => version;
export function homeHideRows(/** @type {any} */ home, /** @type {number} */ mapId, /** @type {number} */ bk) {
  if (!homeHideable(home)) return [];
  return [{ id: HOME_HIDE_VERB, label: homeDecorHiddenByMe(mapId, bk)
    ? t('home.hide.show', 'Show its decorations')
    : t('home.hide.hide', 'Hide its decorations (only you)') }];
}
export const homeHideLine = (/** @type {boolean} */ now) => (now
  ? t('home.hide.hidden', 'You no longer see the decorations of this home. Only you see this change.')
  : t('home.hide.shown', 'You see the decorations of this home again.'));
