// Caches the road network in IndexedDB, keyed on GENERATOR_VERSION, the dials, the settlement list, and WOODS size.
// Bump GENERATOR_VERSION by hand whenever the generator's logic changes.

import { ROAD_DIALS } from './roadNetwork.js';

export const GENERATOR_VERSION = 20;

const DB = 'daggerfall-roads', STORE = 'networks';

export function roadsCacheKey({ settlements, woodsLength, dials = {} }) {
  let sum = 0;
  for (const s of settlements) sum = (sum + s.x * 31 + s.y * 17 + (s.type | 0) * 7) >>> 0;
  const d = { ...ROAD_DIALS, ...dials };
  return `roads:v${GENERATOR_VERSION}:${settlements.length}:${sum}:${woodsLength}:${JSON.stringify(d)}`;
}

export function idbStore(indexedDBRef = globalThis.indexedDB, { db: dbName = DB, store: storeName = STORE } = {}) {
  if (!indexedDBRef) return null;
  const open = () => new Promise((resolve) => {
    try {
      const req = indexedDBRef.open(dbName, 1);
      req.onupgradeneeded = () => { try { req.result.createObjectStore(storeName); } catch { } };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  const tx = (db, mode, fn) => new Promise((resolve) => {
    try {
      const t = db.transaction(storeName, mode);
      const req = fn(t.objectStore(storeName));
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return {
    async get(key) { const db = await open(); if (!db) return null; const v = await tx(db, 'readonly', (s) => s.get(key)); db.close(); return v; },
    async set(key, value) { const db = await open(); if (!db) return null; const v = await tx(db, 'readwrite', (s) => s.put(value, key)); db.close(); return v; },
  };
}

export async function cachedNetwork({ key, build, store = idbStore() }) {
  if (store) {
    const hit = await store.get(key);
    if (hit && hit.roads && hit.tracks) return { ...hit, cached: true };
  }
  const net = build();
  if (net && store) await store.set(key, { roads: net.roads, tracks: net.tracks, stats: net.stats });
  return net ? { ...net, cached: false } : null;
}
