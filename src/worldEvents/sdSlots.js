// @ts-check
import { appStorage } from '../platform/appStorage.js';
import { SD_ENTERED_MAX } from '../world/sdDungeon.js';
import { SD_REZ_MS } from '../net/sdLaw.js';

// The page stops offering a raise this long before the server `SD_REZ_MS` window closes, so a raise sent at the
// edge is not refused.
export const SD_REZ_PAGE_SLACK_MS = 10_000;

/**
 * Stores slots per signed-in account (`<key>:<id>`) because the server records deaths by account. Each call
 * re-reads storage, so writes from another tab merge instead of being overwritten.
 * @param {string} key
 * @param {() => string|null|undefined} me
 * @param {() => any} [storage]
 * @param {() => number} [clock]
 * @returns {{ has: (s: number) => boolean, add: (s: number) => void, mayRise: (s: number|null|undefined) => boolean, rise: (s: number|null|undefined) => void }}
 */
export function sdSlotsKept(key, me, storage = appStorage, clock = () => Date.now()) {
  const read = new Map(), own = new Map();
  /** @type {{ s: number, at: number } | null} */
  let last = null;
  const keyNow = () => { const id = me(); return id ? `${key}:${id}` : key; };
  const stored = (k) => {
    let raw = null;
    try { raw = storage()?.getItem?.(k) ?? null; } catch { raw = null; }
    let r = read.get(k);
    if (!r || r.raw !== raw) {
      let list = [];
      try { const v = JSON.parse(raw ?? '[]'); if (Array.isArray(v)) list = v.filter(Number.isSafeInteger); } catch { list = []; }
      r = { raw, set: new Set(list) };
      read.set(k, r);
    }
    return r.set;
  };
  return {
    has: (s) => { const k = keyNow(); return stored(k).has(s) || !!own.get(k)?.has(s); },
    add: (s) => {
      const k = keyNow();
      // The world host calls `add` every frame of the death screen, so the time is stamped only when the slot
      // changes.
      if (last?.s !== s) last = { s, at: clock() };
      if (!own.has(k)) own.set(k, new Set());
      own.get(k).add(s);
      const now = stored(k);
      if (now.has(s)) return;
      try { storage()?.setItem?.(k, JSON.stringify([...now, s].slice(-SD_ENTERED_MAX))); } catch { }
    },
    mayRise: (s) => s == null || last?.s !== s || clock() - last.at <= SD_REZ_MS - SD_REZ_PAGE_SLACK_MS,
    rise: (s) => {
      if (s == null || last?.s !== s || clock() - last.at > SD_REZ_MS - SD_REZ_PAGE_SLACK_MS) return;
      last = null;
      const k = keyNow();
      own.get(k)?.delete(s);
      const now = stored(k);
      if (!now.has(s)) return;
      try { storage()?.setItem?.(k, JSON.stringify([...now].filter((x) => x !== s))); } catch { }
    },
  };
}
