// @ts-check
import { SOUND_BEDS, bedSamples } from './soundBeds.js';
import { murmurSamples, tavernSamples } from './townBeds.js';

/**
 * @param {{ kind: string, key?: string, voices?: Float32Array[] }} job
 * @returns {Float32Array | null}
 */
export function runJob(job) {
  if (job?.kind === 'bed') { const spec = /** @type {Record<string, any>} */ (SOUND_BEDS)[/** @type {string} */ (job.key)]; return spec ? bedSamples(spec) : null; }
  if (job?.kind === 'murmur' && job.voices?.length) return murmurSamples(job.voices);
  if (job?.kind === 'tavern' && job.voices?.length) return tavernSamples(job.voices);
  return null;
}

/** @type {Map<string, Float32Array>} */
const _made = new Map();
/** @type {WeakMap<object, Set<string>>} */
const _on = new WeakMap();
/** @type {Set<string>} */
const _failed = new Set();
let _making = /** @type {string | null} */ (null);
let _nextId = 1;
/** @type {Map<number, { key: string, job: any }>} */
const _pending = new Map();
/** @type {any} */
let _worker;

function workerFailed() {
  _worker = null;
  const jobs = [..._pending.values()];
  _pending.clear();
  _making = null;
  // A town job's voices were transferred to the worker, so its driver asks again next frame.
  for (const { key, job } of jobs) if (!job.voices) settle(key, () => runJob(job));
}
function settle(key, make) {
  try { const s = make(); if (s) _made.set(key, s); } catch (err) { _failed.add(key); console.warn(`[soundscape] ${key} could not be made:`, err); }
  if (_making === key) _making = null;
}

/** @param {any} [WorkerCtor] */
export function soundWorker(WorkerCtor = /** @type {any} */ (globalThis).Worker) {
  if (_worker !== undefined) return _worker;
  // Vite bundles the worker only from the exact spelling new Worker(new URL(...), { type: 'module' }).
  try {
    _worker = typeof WorkerCtor !== 'function' ? null
      : WorkerCtor === /** @type {any} */ (globalThis).Worker
        ? new Worker(new URL('./soundWorker.js', import.meta.url), { type: 'module' })
        : new WorkerCtor('./soundWorker.js', { type: 'module' });
  } catch { _worker = null; }
  if (_worker) {
    _worker.onmessage = (/** @type {MessageEvent} */ e) => {
      const { id, samples, error } = e.data ?? {};
      const p = _pending.get(id);
      if (!p) return;
      _pending.delete(id);
      settle(p.key, () => { if (error) throw new Error(error); return samples ?? null; });
    };
    _worker.onerror = () => workerFailed();
  }
  return _worker;
}

/**
 * @param {{ registerSamples?: (key: string, samples: Float32Array, rate: number) => boolean }} engine
 * @param {string} key
 * @param {() => any} job
 * @param {number} rate
 * @param {{ worker?: (() => any) | null, idle?: ((fn: () => void, opts: { timeout: number }) => unknown) | null }} [opts]
 */
export function ensureMade(engine, key, job, rate, { worker = soundWorker, idle = /** @type {any} */ (globalThis).requestIdleCallback ?? null } = {}) {
  if (!engine?.registerSamples) return false;
  let on = _on.get(engine);
  if (on?.has(key)) return true;
  const have = _made.get(key);
  if (have) {
    if (!engine.registerSamples(key, have, rate)) return false;
    if (!on) _on.set(engine, (on = new Set()));
    on.add(key);
    _made.delete(key);
    return true;
  }
  if (_failed.has(key) || _making != null) return false;
  const j = job();
  if (!j) return false;
  const w = typeof worker === 'function' ? worker() : null;
  if (w) {
    const id = _nextId++;
    _making = key;
    _pending.set(id, { key, job: j });
    w.postMessage({ id, job: j }, (j.voices ?? []).map((/** @type {Float32Array} */ v) => v.buffer));
    return false;
  }
  if (typeof idle === 'function') {
    _making = key;
    idle(() => settle(key, () => runJob(j)), { timeout: 1000 });
    return false;
  }
  settle(key, () => runJob(j));
  return ensureMade(engine, key, () => null, rate, { worker: null, idle: null });
}

/** @param {any} engine @param {string} key @param {any} [opts] */
export function ensureBed(engine, key, opts) {
  const spec = /** @type {Record<string, any>} */ (SOUND_BEDS)[key];
  return !!spec && ensureMade(engine, key, () => ({ kind: 'bed', key }), spec.rate, opts);
}

export function _resetMade() { _made.clear(); _failed.clear(); _pending.clear(); _making = null; _worker = undefined; }
