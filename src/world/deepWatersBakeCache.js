// The key hashes the WOODS.WLD bytes only after `syncHeightMapBytes` copies the boot smoothing into them, so the
// smoothing is part of the key.

import { idbStore } from './roadsCache.js';

// Bump when a bake rule changes (a threshold, the tie, the flood seeds, or the heights read), or IndexedDB keeps
// serving the old coastline.
export const BAKE_GENERATOR_VERSION = 1;

export function fnv1a(bytes, h = 0x811c9dc5) {
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function rectsFingerprint(rows) {
  let h = 0x811c9dc5;
  for (const r of [...rows].sort((a, b) => a[0] - b[0])) {
    for (const v of r) { h ^= v & 0xff; h = Math.imul(h, 0x01000193); h ^= (v >>> 8) & 0xff; h = Math.imul(h, 0x01000193); h ^= (v >>> 16) & 0xff; h = Math.imul(h, 0x01000193); }
  }
  return h >>> 0;
}

export function rectsLookup(rows) {
  const m = new Map();
  for (const r of rows) m.set(r[0], { xMin: r[1], xMax: r[2], yMin: r[3], yMax: r[4] });
  return (px, py) => m.get(py * 1000 + px) ?? null;
}

export function bakeCacheKey({ woodsHash, rectsHash }) {
  return `dwbake:v${BAKE_GENERATOR_VERSION}:${woodsHash >>> 0}:${rectsHash >>> 0}`;
}

export const bakeStore = (indexedDBRef = globalThis.indexedDB) => idbStore(indexedDBRef, { db: 'daggerfall-deepwaters', store: 'bakes' });

export async function cachedBake({ key, build, store = bakeStore() }) {
  if (store) {
    const hit = await store.get(key);
    if (hit && hit.state && hit.classes && hit.partialIndex && hit.partialBits) return { ...hit, cached: true };
  }
  const g = build();
  if (g && store) await store.set(key, { state: g.state, classes: g.classes, partialIndex: g.partialIndex, partialBits: g.partialBits, stats: g.stats });
  return g ? { ...g, cached: false } : null;
}
