// The hotbar lives in this device's storage, never the account, and holds catalog ids, never placed pieces.
import { appStorage } from '../platform/appStorage.js';

const KEY = 'dfdecor-hotbar';
export const DECOR_HOT_SLOTS = 10;
const ID_RE = /^(?:m\d{1,6}|f\d{1,5}\.\d{1,5})$/;

export const decorHotId = (key) => typeof key === 'string' && ID_RE.test(key);

const empty = () => Array(DECOR_HOT_SLOTS).fill(null);

export function loadDecorHotbar(storage = appStorage()) {
  try {
    const raw = storage?.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    const out = empty();
    if (!Array.isArray(list)) return out;
    for (let i = 0; i < DECOR_HOT_SLOTS; i++) out[i] = decorHotId(list[i]) ? list[i] : null;
    return out;
  } catch {
    return empty();
  }
}

export function saveDecorHotbar(slots, storage = appStorage()) {
  try {
    const out = Array.from({ length: DECOR_HOT_SLOTS }, (_, i) => (decorHotId(slots?.[i]) ? slots[i] : null));
    storage?.setItem(KEY, JSON.stringify(out));
    return true;
  } catch {
    return false;
  }
}
