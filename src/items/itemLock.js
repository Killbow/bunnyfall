// @ts-check

export const isLocked = (/** @type {any} */ item) => item?.locked === true;

export function setLocked(/** @type {any} */ item, /** @type {boolean} */ on) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  if (on) item.locked = true;
  // Unlocked deletes the field, so a save with nothing locked carries no extra key.
  else delete item.locked;
  return true;
}

export function toggleLocked(/** @type {any} */ item) {
  setLocked(item, !isLocked(item));
  return isLocked(item);
}

export const LOCK_CLOSES = Object.freeze(['drop', 'sell', 'trade']);

export const lockRefuses = (/** @type {any} */ item, /** @type {string} */ way) => isLocked(item) && LOCK_CLOSES.includes(way);

export const lockedText = (/** @type {string} */ name) => `${name || 'That'} is locked. Unlock it first.`;

export const LOCKED_LINE = 'Locked. It will not be dropped, sold or traded.';
