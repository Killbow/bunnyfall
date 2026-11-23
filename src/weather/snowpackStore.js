// The snow the ground holds about the player, saved in the browser between sessions so a boot goes on from it instead
// of integrating the year again (snowpack.js `seed`). Never in a character save. A store that cannot open is a miss.
import { idbStore } from '../world/roadsCache.js';
import { BUILD_TAG } from '../buildTag.js';
import { skyCalendarOn } from './skyCalendar.js';

export const SNOWPACK_STORE_VERSION = 1;
export const SNOWPACK_STORE_POINTS = 512;

// One record under one key, so a game update replaces the last one's instead of adding a key.
export const SNOWPACK_STORE_KEY = 'snowpack';
export const snowpackStoreTag = () => `v${SNOWPACK_STORE_VERSION}:${BUILD_TAG}:${skyCalendarOn() ? 'sky' : 'one'}`;

/**
 * @param {{ get(key: string): Promise<any>, set(key: string, value: any): Promise<any> } | null} [store]
 */
export function snowpackStore(store = idbStore(globalThis.indexedDB, { db: 'daggerfall-snowpack', store: 'points' })) {
  if (!store) return null;
  /** @type {Map<number, any>} */
  let kept = new Map();
  let tag = null;
  return {
    async load() {
      tag = snowpackStoreTag();
      const hit = await store.get(SNOWPACK_STORE_KEY);
      kept = new Map((hit?.tag === tag && Array.isArray(hit.points) ? hit.points : []).map((r) => [r.key, r]));
      return [...kept.values()];
    },
    /** @param {any[]} records @param {boolean} [keepEarlier] */
    async save(records, keepEarlier = false) {
      if (!records.length) return;
      for (const r of records) {
        const had = kept.get(r.key);
        if (keepEarlier && had && had.origin === r.origin && had.step <= r.step) continue;
        kept.delete(r.key); kept.set(r.key, r);
      }
      while (kept.size > SNOWPACK_STORE_POINTS) kept.delete(kept.keys().next().value);
      await store.set(SNOWPACK_STORE_KEY, { tag: tag ?? snowpackStoreTag(), points: [...kept.values()] });
    },
  };
}
