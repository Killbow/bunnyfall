// `new Worker(new URL(...))` must keep that exact spelling for Vite. The WOODS bytes are copied to the worker,
// never transferred, because this thread keeps reading them.

import { buildGlobalSteps, classifyPixel, PIXEL_MIXED, DeepWatersBake } from './deepWatersBake.js';
import { bakeCacheKey, bakeStore, cachedBake, fnv1a, rectsFingerprint, rectsLookup } from './deepWatersBakeCache.js';
import { locationRectReader } from './terrainTiles.js';
import { buildDeepWatersPixel } from './deepWatersPixel.js';
import { worldBakes, waterFrameOf, ETHER_FRAME } from './etherWatersBake.js';
import { etherWoods } from './ethericSea.js';
import { afterFirstFrame } from '../systems/afterFirstFrame.js';

function defaultWorkerFactory() {
  return new Worker(new URL('./deepWatersWorker.js', import.meta.url), { type: 'module' });
}

/**
 * @param {object} woods
 * @param {Iterable<[number, number, object]>} locations
 * @returns {Array<number[]>}
 */
export function deepWatersLocationRects(woods, locations, maps, blocks) {
  const rows = [];
  const rectOf = locationRectReader(maps, blocks);
  for (const [px, py, loc] of locations) {
    if (!loc || loc.spawned) continue;
    if (classifyPixel(woods, px, py) !== PIXEL_MIXED) continue;
    const r = rectOf(loc);
    rows.push([py * 1000 + px, r.xMin, r.xMax, r.yMin, r.yMax]);
  }
  return rows;
}

const etherGround = (woods) => (woods?.isEtherGround ? woods : etherWoods(woods));

async function buildHere(woods, rows, { store = bakeStore(), sliceMs = 8, woodsBytes = null } = {}) {
  const key = bakeCacheKey({ woodsHash: woodsBytes ? fnv1a(woodsBytes) : 0, rectsHash: rectsFingerprint(rows) });
  const locationRectAt = rectsLookup(rows);
  let result = null;
  if (store) {
    const hit = await store.get(key);
    if (hit && hit.state && hit.classes && hit.partialIndex && hit.partialBits) return { ...hit, cached: true };
  }
  const steps = buildGlobalSteps(woods, { locationRectAt });
  for (;;) {
    const t0 = globalThis.performance?.now?.() ?? Date.now();
    let r;
    do { r = steps.next(); } while (!r.done && (globalThis.performance?.now?.() ?? Date.now()) - t0 < sliceMs);
    if (r.done) { result = r.value; break; }
    await new Promise((res) => setTimeout(res, 0));
  }
  return cachedBake({ key, build: () => result, store });
}

/**
 * @param {object} deps
 * @param {object} deps.woods
 * @param {?object|Function|boolean} [deps.ether]
 * @param {?Uint8Array} deps.woodsBytes
 * @param {Array<number[]>} deps.rects
 * @param {?Function} [deps.workerFactory]
 * @param {?object} [deps.store]
 * @returns {{ready: Promise<?DeepWatersBake>, buildPixel: (job: object, centre?: number[]) => Promise<?object>, dispose: () => void, readonly onWorker: boolean}}
 */
export function openDeepWaters({ woods, woodsBytes = null, rects = [], ether = null, workerFactory = undefined, store = undefined } = {}) {
  if (!woods) return { ready: Promise.resolve(null), buildPixel: async () => null, dispose() {}, get onWorker() { return false; } };
  const factory = workerFactory === undefined
    ? ((typeof Worker === 'undefined' || !woodsBytes) ? null : defaultWorkerFactory)
    : workerFactory;
  let worker = null;
  let bake = null;
  let disposed = false;
  let warned = false;
  const pending = new Map();
  let nextId = 1;
  const etherRects = typeof ether?.ready === 'function' ? ether.ready : async () => (typeof ether === 'function' ? ether() : ether === true ? null : ether);
  let etherGate = null;
  const sendEther = async () => {
    const rects = await etherRects();
    try { worker?.postMessage({ t: 'ether', rects }); } catch { dropWorker(); }
  };

  const here = (job) => {
    if (!bake || disposed) return null;
    try {
      return buildDeepWatersPixel(job, bake);
    } catch (e) {
      if (!warned) { warned = true; console.warn(`[deep waters] pixel ${job?.px},${job?.py} failed to promote: ${e?.message ?? e}`); }
      return null;
    }
  };
  const adopt = (result) => {
    if (result && bake) bake.adoptPlanes(result.planes);
    return result;
  };
  const dropWorker = () => {
    const w = worker;
    worker = null;
    try { w?.terminate?.(); } catch { }
    for (const [id, p] of pending) { pending.delete(id); p.resolve(adopt(here(p.job))); }
  };

  const ready = (async () => {
    let record = null;
    if (factory) {
      record = await new Promise((resolve) => {
        try {
          worker = factory();
          worker.onerror = () => { resolve(null); dropWorker(); };
          worker.onmessage = (ev) => {
            const m = ev.data ?? {};
            if (m.t === 'built') resolve(m.record);
            else if (m.t === 'error') { resolve(null); dropWorker(); }
            else if (m.t === 'pixel') {
              const p = pending.get(m.id);
              if (!p) return;
              pending.delete(m.id);
              p.resolve(adopt(m.error || !m.result ? here(p.job) : m.result));
            }
          };
          const bytes = woodsBytes.slice();
          worker.postMessage({ t: 'build', woodsBytes: bytes, rects, ether: !!ether }, [bytes.buffer]);
        } catch (e) {
          console.warn('[deep waters] worker unavailable; building on the main thread', e);
          resolve(null);
          dropWorker();
        }
      });
    }
    if (!record && !disposed) record = await buildHere(woods, rects, { woodsBytes, ...(store !== undefined ? { store } : {}) });
    if (!record || disposed) return null;
    if (ether) afterFirstFrame(() => { if (!disposed) void etherRects(); });
    bake = worldBakes(new DeepWatersBake({ woods, global: record, locationRectAt: rectsLookup(rects) }), { woods: ether ? etherGround(woods) : woods, ether });
    return bake;
  })();

  return {
    ready,
    buildPixel(job, centre = null) {
      return ready.then(async (b) => {
        if (!b || disposed) return null;
        if (ether && waterFrameOf(job.px, job.py, true) === ETHER_FRAME) await (etherGate ??= sendEther());
        if (disposed) return null;
        if (!worker) return adopt(here(job));
        return new Promise((resolve) => {
          const id = nextId++;
          pending.set(id, { resolve, job });
          try {
            worker.postMessage({ t: 'pixel', id, job, centre });
          } catch {
            pending.delete(id);
            resolve(adopt(here(job)));
          }
        });
      });
    },
    dispose() {
      disposed = true;
      const w = worker;
      worker = null;
      try { w?.terminate?.(); } catch { }
      for (const [id, p] of pending) { pending.delete(id); p.resolve(null); }
    },
    get onWorker() { return !!worker; },
  };
}

export async function loadDeepWatersBake(deps = {}) {
  const dw = openDeepWaters(deps);
  const bake = await dw.ready;
  dw.dispose();
  return bake;
}
