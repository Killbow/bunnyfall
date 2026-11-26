// @ts-check
import { runJob } from './soundJobs.js';

globalThis.onmessage = (/** @type {MessageEvent} */ e) => {
  const { id, job } = e.data ?? {};
  try {
    const samples = runJob(job);
    /** @type {any} */ (globalThis).postMessage({ id, samples }, samples ? [samples.buffer] : []);
  } catch (err) {
    /** @type {any} */ (globalThis).postMessage({ id, samples: null, error: String(/** @type {any} */ (err)?.message ?? err) });
  }
};
