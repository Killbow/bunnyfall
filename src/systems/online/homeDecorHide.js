// @ts-check
// DECOR-HIDE (2026-10-30, the owner: "at the door of a home of a different player, you can hide its decorations. Only
// you see this change"): ANOTHER PLAYER'S HOME, ITS DECORATIONS HIDDEN FOR ME ALONE. A row at the door of a home that is
// not my account's turns it; the yard and the room then stand as a shunned home's do for me (no placed piece but its
// hired trader, the room as Daggerfall furnished it), and nothing is sent: the choice is this browser's, kept in its
// storage, and the home's owner and every other player see it as before.

import { t } from '../textManager.js';

/** The door row's id. */
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
  } catch { /* no storage here: the choice lasts this visit */ }
  return hidden;
}
function save() {
  try { globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify([...load()].slice(-MAX))); } catch { /* kept in memory */ }
}

/** Whether I may hide this home's decorations: another player's, never my account's, nor a hall of my guild. */
export const homeHideable = (/** @type {any} */ home) => !!home && !home.own && home.mine !== true && home.member !== true && home.insider !== true;
/** Whether I hid the decorations of the home at (mapId, bk). */
export const homeDecorHiddenByMe = (/** @type {number} */ mapId, /** @type {number} */ bk) => load().has(keyOf(mapId, bk));
/** Whether the home at (mapId, bk) stands its decorations for me: shown by the town's law (`shown`) and not hidden by me. */
export const homeDecorSeenByMe = (/** @type {any} */ home, /** @type {number} */ mapId, /** @type {number} */ bk, shown = true) =>
  shown && !(homeHideable(home) && homeDecorHiddenByMe(mapId, bk));
/** Turns it; answers whether the decorations are hidden now. */
export function toggleHomeDecorHidden(/** @type {number} */ mapId, /** @type {number} */ bk) {
  const s = load(), k = keyOf(mapId, bk);
  if (s.has(k)) s.delete(k); else s.add(k);
  version++;
  save();
  return s.has(k);
}
/** Moves with every turn, so a door's cached rows are drawn again. */
export const homeHideVersion = () => version;
/** The door's row, or none for a home I may not hide. */
export function homeHideRows(/** @type {any} */ home, /** @type {number} */ mapId, /** @type {number} */ bk) {
  if (!homeHideable(home)) return [];
  return [{ id: HOME_HIDE_VERB, label: homeDecorHiddenByMe(mapId, bk)
    ? t('home.hide.show', 'Show its decorations')
    : t('home.hide.hide', 'Hide its decorations (only you)') }];
}
/** What is said once it is turned. */
export const homeHideLine = (/** @type {boolean} */ now) => (now
  ? t('home.hide.hidden', 'You no longer see the decorations of this home. Only you see this change.')
  : t('home.hide.shown', 'You see the decorations of this home again.'));
