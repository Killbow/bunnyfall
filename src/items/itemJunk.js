// @ts-check
import { isLocked, setLocked } from './itemLock.js';
import { isBound } from './itemBound.js';

export const JUNK_GROUPS = Object.freeze(['Weapons', 'Armor', 'Jewellery', 'MensClothing', 'WomensClothing']);
export const isJunk = (/** @type {any} */ item) => item?.junk === true;
export const junkable = (/** @type {any} */ item) => !!item && JUNK_GROUPS.includes(item.group) && !item.questItem && !isBound(item);
export function setJunk(/** @type {any} */ item, /** @type {boolean} */ on) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  if (on) { item.junk = true; setLocked(item, false); } else delete item.junk;
  return true;
}
export function toggleJunk(/** @type {any} */ item) {
  setJunk(item, !isJunk(item));
  return isJunk(item);
}
export function lockLiftsJunk(/** @type {any} */ item) {
  if (isLocked(item)) setJunk(item, false);
}
export const JUNK_LINE = 'Junk. Sell junk at a shop puts it on the counter, and Take all leaves it behind.';
