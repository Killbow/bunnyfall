
import { decodeTextureImage } from './mwTexture.js';

export const TEXTURE_WORKERS_MAX = 4;

export const TEXTURE_IDLE_MS = 5000;

export function textureThreadDisabled(search = globalThis.location?.search) {
  try { return /[?&]texturethread=off\b/.test(search ?? ''); }
  catch { return false; }
}

// Keep the `new Worker(new URL(...))` spelling, because Vite matches that exact form to bundle the worker entry.
function defaultWorkerFactory() {
  return new Worker(new URL('./mwTextureWorker.js', import.meta.url), { type: 'module' });
}

export function texturePoolSize(cores = globalThis.navigator?.hardwareConcurrency) {
  const n = Number.isFinite(cores) && cores > 0 ? Math.floor(cores) : 2;
  return Math.max(1, Math.min(TEXTURE_WORKERS_MAX, n - 1));
}

// A decoder error rejects with `decoderError: true` on either thread and is never retried; only a dead worker sends
// its jobs back to this thread.
export function createTexturePool({ workerFactory = null, size = texturePoolSize(), idleMs = TEXTURE_IDLE_MS } = {}) {
  const factory = workerFactory
    ?? ((textureThreadDisabled() || typeof Worker === 'undefined') ? null : defaultWorkerFactory);
  const here = (path, bytes, levels) => {
    try { return Promise.resolve(decodeTextureImage(path, bytes, levels == null ? undefined : { levels })); }
    catch (e) { return Promise.reject(Object.assign(e instanceof Error ? e : new Error(String(e)), { decoderError: true })); }
  };
  const slots = [];
  let dead = !factory;
  let opened = 0;
  let nextId = 1;
  const stats = { offThread: 0, onThread: 0, workers: 0 };

  let idle = null;
  const wake = () => { if (idle !== null) { clearTimeout(idle); idle = null; } };
  const rest = () => {
    if (idle !== null || !slots.length || slots.some((s) => s.jobs.size > 0)) return;
    idle = setTimeout(() => {
      idle = null;
      for (const s of slots.filter((x) => x.jobs.size === 0)) {
        slots.splice(slots.indexOf(s), 1);
        opened--;
        try { s.w.terminate?.(); } catch { }
      }
      stats.workers = slots.length;
    }, idleMs);
    idle.unref?.();
  };

  const drop = (slot, why) => {
    const i = slots.indexOf(slot);
    // Both `onerror` and a failed post call this, so it must act only once per slot.
    if (i < 0) return;
    slots.splice(i, 1);
    stats.workers = slots.length;
    try { slot.w.terminate?.(); } catch { }
    for (const j of slot.jobs.values()) { stats.onThread++; here(j.path, j.bytes, j.levels).then(j.resolve, j.reject); }
    slot.jobs.clear();
    if (!slots.length && opened >= size) { dead = true; console.warn('[mw textures] workers unavailable; decoding on the main thread -', why); }
    rest();
  };
  const open = () => {
    opened++;
    const slot = { w: null, jobs: new Map() };
    try {
      slot.w = factory();
      slot.w.onerror = (e) => drop(slot, e?.message ?? 'mw texture worker failed');
      slot.w.onmessage = (ev) => {
        const m = ev.data ?? {};
        const j = slot.jobs.get(m.id);
        if (!j) return;
        slot.jobs.delete(m.id);
        if (m.t === 'image') j.resolve(m.image);
        else j.reject(Object.assign(new Error(m.message ?? 'mw texture worker error'), { decoderError: true }));
        rest();
      };
      slots.push(slot);
      stats.workers = slots.length;
      return slot;
    } catch (e) {
      try { slot.w?.terminate?.(); } catch { }
      if (!slots.length) { dead = true; console.warn('[mw textures] workers unavailable; decoding on the main thread -', e?.message ?? e); }
      return null;
    }
  };
  const pick = () => {
    let best = null;
    for (const s of slots) if (!best || s.jobs.size < best.jobs.size) best = s;
    if ((!best || best.jobs.size > 0) && opened < size) return open() ?? best;
    return best;
  };

  return {
    stats,
    /** @returns {Promise<{width:number, height:number, mips:{width:number, height:number, rgba:Uint8Array}[]}>} */
    decode(path, bytes, { levels = null } = {}) {
      const slot = dead ? null : pick();
      if (!slot) { stats.onThread++; return here(path, bytes, levels); }
      wake();
      return new Promise((resolve, reject) => {
        const id = nextId++;
        slot.jobs.set(id, { path, bytes, levels, resolve, reject });
        // Post a copy, so the caller's bytes stay whole for the main-thread fallback if this worker dies.
        const copy = bytes.slice();
        try { slot.w.postMessage({ t: 'decode', id, path, bytes: copy, levels }, [copy.buffer]); stats.offThread++; }
        catch (e) { drop(slot, e?.message ?? 'mw texture worker refused a job'); }
      });
    },
    close() { dead = true; wake(); for (const s of [...slots]) { slots.splice(slots.indexOf(s), 1); try { s.w.terminate?.(); } catch { } for (const j of s.jobs.values()) here(j.path, j.bytes, j.levels).then(j.resolve, j.reject); } },
  };
}

let _pool = null;
export function decodeTextureOffThread(path, bytes, opts) {
  _pool ??= createTexturePool();
  return _pool.decode(path, bytes, opts);
}
export function _resetTexturePool() { try { _pool?.close(); } catch { } _pool = null; }
export function _useTexturePool(pool) { _resetTexturePool(); _pool = pool; }
