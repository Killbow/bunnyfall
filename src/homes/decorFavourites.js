// Favorites live in this device's storage, never the account, keyed by catalog id so a renamed piece stays one.
import { appStorage } from '../platform/appStorage.js';

const KEY = 'dfdecor-fav';
const ID_RE = /^(?:m\d{1,6}|f\d{1,5}\.\d{1,5})$/;

export function loadDecorFavourites(storage = appStorage()) {
  try {
    const raw = storage?.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((k) => typeof k === 'string' && ID_RE.test(k)) : []);
  } catch {
    return new Set();
  }
}

export function saveDecorFavourites(ids, storage = appStorage()) {
  try {
    storage?.setItem(KEY, JSON.stringify([...ids]));
    return true;
  } catch {
    return false;
  }
}

export const decorIsFavourite = (key, storage = appStorage()) => loadDecorFavourites(storage).has(key);

export function toggleDecorFavourite(key, storage = appStorage()) {
  const ids = loadDecorFavourites(storage);
  if (typeof key !== 'string' || !ID_RE.test(key)) return ids;
  if (ids.has(key)) ids.delete(key);
  else ids.add(key);
  saveDecorFavourites(ids, storage);
  return ids;
}
