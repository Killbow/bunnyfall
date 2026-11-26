// @ts-check

import { poiDocProblems, poiPixelId, POI_SHA_RE } from './poiLaw.js';

export const POI_FEED_POLL_MS = 60_000;
export const POI_FEED_RETRY_MS = 5_000;
export const POI_FEED_CACHE_KEY = 'poi:feed';
export const poiAssetCacheKey = (/** @type {string} */ sha) => `poi:a:${sha}`;
export const POI_ASSET_MEMORY_BYTES = 64 * 1024 * 1024;

const hex = (/** @type {ArrayBuffer} */ buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const NONE = Object.freeze([]);

/** @param {{
 *   base: () => string | null,
 *   fetch?: (url: string, init?: any) => Promise<any>,
 *   cache?: { get: (key: string) => Promise<Uint8Array | null>, put: (key: string, bytes: Uint8Array) => Promise<void> } | null,
 *   subtle?: any, now?: () => number, log?: any,
 * }} deps */
export function createPoiFeed({ base, fetch = (u, i) => globalThis.fetch(u, i), cache = null, subtle = globalThis.crypto?.subtle, now = () => Date.now(), log = console }) {
  /** @type {Map<string, { id: string, rev: number, doc: any, draft?: boolean }>} */
  let live = new Map();
  /** @type {Map<string, any>} */
  let overlay = new Map();
  let version = -1, etag = null;
  let heldBase = null, floor = -1;
  let nextAsk = 0, wait = POI_FEED_RETRY_MS, asking = null, gen = 0;
  let again = false;
  /** @type {Map<number, any[]>} */
  let byPixel = new Map();
  const listeners = new Set();
  const memory = new Map();
  let memoryBytes = 0;
  const loading = new Map();

  function reindex() {
    const all = new Map(live);
    for (const [id, e] of overlay) {
      if (e === null) all.delete(id);
      else all.set(id, e);
    }
    byPixel = new Map();
    for (const e of all.values()) {
      const k = poiPixelId(e.doc);
      if (!byPixel.has(k)) byPixel.set(k, []);
      byPixel.get(k).push(e);
    }
    gen++;
    for (const fn of listeners) { try { fn(); } catch (e) { if (log) console.warn('[poi] a listener threw', e); } }
  }
  function take(body, tag) {
    if (!body || !Number.isInteger(body.v) || !Array.isArray(body.pois)) return false;
    const next = new Map();
    for (const p of body.pois) {
      if (!p || typeof p.id !== 'string' || !Number.isInteger(p.rev)) continue;
      const problems = poiDocProblems(p.doc);
      if (problems.length || p.doc.id !== p.id) { if (log) console.warn(`[poi] ${p.id} r${p.rev} is not stood - the law refuses it`, problems.slice(0, 3)); continue; }
      next.set(p.id, { id: p.id, rev: p.rev, doc: p.doc });
    }
    live = next;
    version = body.v;
    etag = tag ?? `"poi-${body.v}"`;
    reindex();
    return true;
  }

  async function readKept() {
    if (!cache) return false;
    try {
      const bytes = await cache.get(POI_FEED_CACHE_KEY);
      if (!bytes || version >= 0) return false;
      const kept = JSON.parse(new TextDecoder().decode(bytes));
      const b = base();
      if (!b || kept.base !== b) return false;
      heldBase = b;
      return take(kept.body, kept.etag);
    } catch (e) { if (log) console.warn('[poi] the kept feed would not read', e?.message ?? e); return false; }
  }

  async function ask() {
    const b = base();
    if (!b) return false;
    if (b !== heldBase) { heldBase = b; etag = null; version = -1; floor = -1; }
    const res = await fetch(`${b}/v1/poi/live`, { headers: etag ? { 'if-none-match': etag } : {} });
    if (res.status === 304) return false;
    if (!res.ok) throw new Error(`poi feed ${res.status}`);
    const text = await res.text();
    const body = JSON.parse(text);
    if (Number.isInteger(body?.v) && body.v < floor) { if (log) console.warn(`[poi] the feed answered v${body.v} under v${floor} - a stale answer, not taken`); return false; }
    const tag = res.headers?.get?.('etag') ?? null;
    const changed = body.v !== version;
    if (!take(body, tag)) throw new Error('poi feed: not a feed');
    floor = body.v;
    if (cache) cache.put(POI_FEED_CACHE_KEY, new TextEncoder().encode(JSON.stringify({ base: b, etag: tag, body }))).catch(() => {});
    return changed;
  }

  /** @param {number} [t] */
  function tick(t = now()) {
    if (asking || t < nextAsk) return null;
    again = false;
    asking = ask().then(() => { wait = POI_FEED_RETRY_MS; nextAsk = again ? 0 : now() + POI_FEED_POLL_MS; }, (e) => {
      if (log) console.warn('[poi] the feed would not answer', e?.message ?? e);
      nextAsk = again ? 0 : now() + wait;
      wait = Math.min(wait * 2, POI_FEED_POLL_MS);
    }).finally(() => { asking = null; });
    return asking;
  }

  function remember(sha, bytes) {
    if (memory.has(sha)) return;
    memory.set(sha, bytes);
    memoryBytes += bytes.byteLength;
    for (const [k, v] of memory) {
      if (memoryBytes <= POI_ASSET_MEMORY_BYTES) break;
      memory.delete(k);
      memoryBytes -= v.byteLength;
    }
  }

  return {
    async start() { await readKept(); nextAsk = 0; },
    tick,
    refresh() {
      if (!asking) { nextAsk = 0; return tick(); }
      again = true;
      return asking.then(() => asking ?? tick());
    },
    atPixel(/** @type {number} */ px, /** @type {number} */ py) { return byPixel.get(py * 1000 + px) ?? NONE; },
    all() { return [...byPixel.values()].flat(); },
    liveOf(/** @type {string} */ id) { return live.get(id) ?? null; },
    version: () => version,
    generation: () => gen,
    onChange(/** @type {() => void} */ fn) { listeners.add(fn); return () => listeners.delete(fn); },
    setOverlay(/** @type {Map<string, any>} */ drafts) {
      overlay = new Map();
      for (const [id, d] of drafts) overlay.set(id, d === null ? null : { id, rev: d.rev ?? 0, doc: d.doc, draft: true });
      reindex();
    },
    /**
     * @param {string} sha
     * @param {{ auth?: string | null }} [opts]
     */
    asset(sha, { auth = null } = {}) {
      if (!POI_SHA_RE.test(sha)) return Promise.reject(new Error('poi asset: not a sha256'));
      if (memory.has(sha)) return Promise.resolve(memory.get(sha));
      if (loading.has(sha)) return loading.get(sha);
      const p = (async () => {
        const check = async (bytes) => bytes && hex(await subtle.digest('SHA-256', bytes)) === sha;
        if (cache) {
          try { const kept = await cache.get(poiAssetCacheKey(sha)); if (kept && (await check(kept))) { remember(sha, kept); return kept; } } catch { }
        }
        const b = base();
        if (!b) throw new Error('poi asset: no service');
        const res = await fetch(`${b}/v1/poi/asset/${sha}`, { headers: auth ? { authorization: `Bearer ${auth}` } : {} });
        if (!res.ok) throw new Error(`poi asset ${sha.slice(0, 12)}: ${res.status}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (!(await check(bytes))) throw new Error(`poi asset ${sha.slice(0, 12)}: the bytes are not the ones it names`);
        remember(sha, bytes);
        if (cache) cache.put(poiAssetCacheKey(sha), bytes).catch(() => {});
        return bytes;
      })().finally(() => loading.delete(sha));
      loading.set(sha, p);
      return p;
    },
  };
}

export function browserPoiCache(caches = globalThis.caches) {
  if (!caches?.open) return null;
  const url = (key) => `https://poi.invalid/${encodeURIComponent(key)}`;
  let opened = null;
  const box = () => (opened ??= caches.open('dagger-poi'));
  return {
    async get(key) { const r = await (await box()).match(url(key)); return r ? new Uint8Array(await r.arrayBuffer()) : null; },
    async put(key, bytes) { await (await box()).put(url(key), new Response(bytes)); },
  };
}
