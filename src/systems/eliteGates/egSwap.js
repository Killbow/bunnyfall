// @ts-check
// Keep the `new Worker(new URL(..., import.meta.url))` spelling exact so Vite bundles the worker; the factory stays
// injectable so node never evaluates it.
import { egCircleKey } from '../../world/eliteGates/egCircleParts.js';

export const EG_SWAP_WAIT_MS = 1500;

function defaultWorkerFactory() {
  return new Worker(new URL('../../world/eliteGates/egCircleWorker.js', import.meta.url), { type: 'module' });
}

/** @param {{ workerFactory?: (() => any) | null }} [deps] */
export function createEgSwap({ workerFactory = undefined } = {}) {
  const factory = workerFactory === undefined ? (typeof Worker === 'undefined' ? null : defaultWorkerFactory) : workerFactory;
  let worker = null, dead = !factory, nextId = 1;
  /** @type {{ key: string, id: number, parts: any, g: boolean } | null} */
  let job = null;
  const fail = () => { dead = true; job = null; try { worker?.terminate?.(); } catch { } worker = null; };
  function ensure() {
    if (worker || dead) return worker;
    try { worker = factory(); } catch { fail(); return null; }
    worker.onmessage = (ev) => {
      const m = ev?.data ?? {};
      if (!job || m.id !== job.id) return;
      if (m.t === 'built' && m.parts?.key === job.key) job.parts = m.parts;
      else fail();
    };
    worker.onerror = () => fail();
    return worker;
  }
  const stateOf = (key) => (!job || job.key !== key ? null : job.parts ? 'ready' : 'building');
  return {
    want(seed, c, geo = 0, band = -1, given = null, lite = false) {
      const key = egCircleKey(seed, c, geo), g = !!given;
      if (dead) return null;
      if (job?.key === key && job.g === g) return stateOf(key);
      const w = ensure();
      if (!w) return null;
      job = { key, id: nextId++, parts: null, g };
      try { w.postMessage({ t: 'build', id: job.id, seed: seed >>> 0, c, geo: geo || 0, band, given: given ?? null, lite: !!lite }); } catch { fail(); return null; }
      return stateOf(key);
    },
    peek(seed, c, geo = 0) { return stateOf(egCircleKey(seed, c, geo)) === 'ready' ? job.parts : null; },
    state(seed, c, geo = 0) { return stateOf(egCircleKey(seed, c, geo)); },
    take(seed, c, geo = 0) {
      if (stateOf(egCircleKey(seed, c, geo)) !== 'ready') return null;
      const parts = job.parts;
      job = null;
      return parts;
    },
    drop() { job = null; try { worker?.terminate?.(); } catch { } worker = null; dead = !factory; },
    get offered() { return !dead; },
  };
}
