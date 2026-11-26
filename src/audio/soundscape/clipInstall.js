// @ts-check

export const CLIP_RETRY_MS = Object.freeze([2000, 8000, 30000, 120000]);

/**
 * @param {Record<string, string>} files
 * @param {{ urlOf?: (file: string) => string, fetchBytes?: ((file: string) => Promise<Uint8Array>) | null, now?: () => number, retryMs?: readonly number[] }} [opts]
 */
export function createClipInstaller(files, { urlOf = (f) => f, fetchBytes = null, now = () => Date.now(), retryMs = CLIP_RETRY_MS } = {}) {
  const keys = Object.keys(files);
  const ready = new Set(), refused = new Set();
  /** @type {Map<string, Uint8Array>} */
  const bytes = new Map();
  /** @type {Promise<number> | null} */
  let running = null;
  let settled = Promise.resolve(0), nextAt = 0, tries = 0, gaveUp = false;
  const load = fetchBytes ?? (async (/** @type {string} */ file) => {
    const r = await fetch(urlOf(file));
    if (!r.ok) throw Object.assign(new Error(`${file}: ${r.status}`), { status: r.status });
    return new Uint8Array(await r.arrayBuffer());
  });
  const finished = () => ready.size + refused.size >= keys.length;
  /** @param {any} audio */
  async function pass(audio) {
    for (const key of keys) {
      if (ready.has(key) || refused.has(key)) continue;
      try {
        if (!bytes.has(key)) bytes.set(key, await load(files[key]));
        if (await audio.registerSound(key, bytes.get(key))) { ready.add(key); bytes.delete(key); }
      } catch (err) {
        const status = Number(/** @type {any} */ (err)?.status);
        if (status >= 400 && status < 500) refused.add(key);
      }
    }
    if (!finished()) {
      if (tries < retryMs.length) nextAt = now() + retryMs[tries++];
      else gaveUp = true;
    }
    return ready.size;
  }
  return {
    get count() { return ready.size; },
    has: (/** @type {string} */ key) => ready.has(key),
    /** @param {any} audio @returns {Promise<number>} */
    install(audio) {
      if (running) return running;
      if (gaveUp || finished() || !audio?.registerSound || now() < nextAt) return settled;
      running = pass(audio).then((n) => { running = null; settled = Promise.resolve(n); return n; });
      return running;
    },
    _reset() { ready.clear(); refused.clear(); bytes.clear(); running = null; settled = Promise.resolve(0); nextAt = 0; tries = 0; gaveUp = false; },
  };
}
