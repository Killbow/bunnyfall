
import { readUnityBundle } from './unityBundle.js';

const utf8 = (b) => new TextDecoder('utf-8').decode(b);

export function bundleThreadDisabled(search = globalThis.location?.search) {
  try { return /[?&]bundlethread=off\b/.test(search ?? ''); }
  catch { return false; }
}

// Keep the `new Worker(new URL(...))` spelling: Vite matches it statically to bundle the worker entry.
function defaultWorkerFactory() {
  return new Worker(new URL('./unityBundleWorker.js', import.meta.url), { type: 'module' });
}

export function openBundleHere(bytes, { maxTextureSize = Infinity, knownTextures = null } = {}) {
  const bundle = readUnityBundle(bytes, { maxTextureSize, knownTextures });
  const byName = new Map();
  for (const t of bundle.textures) if (!byName.has(t.name)) byName.set(t.name, t);
  return {
    onThread: true,
    textAssets: bundle.textAssets.map((t) => ({ name: t.name, bytes: t.bytes, get text() { return utf8(t.bytes); } })),
    textures: bundle.textures.map((t) => ({ name: t.name, width: t.width, height: t.height, format: t.format })),
    rgba: async (name, opts) => { const tex = byName.get(name); return tex ? tex.rgba(opts) : null; },
    arrays: (bundle.arrays ?? []).map((a) => ({ name: a.name, width: a.width, height: a.height, depth: a.depth })),
    layers: async (name) => { const a = bundle.arrays?.find((x) => x.name === name); return a ? a.layers() : null; },
    close() { byName.clear(); },
  };
}

export async function openUnityBundle(bytes, { workerFactory = null, maxTextureSize = Infinity, knownTextures = null } = {}) {
  const factory = workerFactory
    ?? ((bundleThreadDisabled() || typeof Worker === 'undefined') ? null : defaultWorkerFactory);
  const isBlob = typeof Blob !== 'undefined' && bytes instanceof Blob;
  const here = async () => openBundleHere(isBlob ? new Uint8Array(await bytes.arrayBuffer()) : bytes, { maxTextureSize, knownTextures });
  if (!factory) return here();
  let w = null;
  const pending = new Map();
  let nextId = 1;
  let dead = null;
  const down = (why) => {
    if (dead) return;
    dead = new Error(why);
    for (const p of pending.values()) p.reject(dead);
    pending.clear();
    try { w?.terminate?.(); } catch { }
  };
  const ask = (msg, transfer = []) => new Promise((resolve, reject) => {
    if (dead) { reject(dead); return; }
    const id = nextId++;
    pending.set(id, { resolve, reject });
    try { w.postMessage({ ...msg, id }, transfer); }
    catch (e) { pending.delete(id); reject(e); }
  });
  try {
    w = factory();
    w.onerror = (e) => down(e?.message ?? 'unity bundle worker failed');
    w.onmessage = (ev) => {
      const m = ev.data ?? {};
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      // An `error` reply means the worker answered with a reader error, so the catch below rethrows it instead of
      // reopening on this thread.
      if (m.t === 'error') p.reject(Object.assign(new Error(m.message), { readerError: true })); else p.resolve(m);
    };
    // Transfer a copy so the caller's bytes stay intact for the fallback if the worker never answers.
    let opened;
    if (isBlob) opened = await ask({ t: 'open', blob: bytes, maxTextureSize, knownTextures });
    else { const copy = bytes.slice(); opened = await ask({ t: 'open', bytes: copy, maxTextureSize, knownTextures }, [copy.buffer]); }
    return {
      onThread: false,
      textAssets: opened.textAssets.map((t) => ({ name: t.name, bytes: t.bytes, get text() { return utf8(t.bytes); } })),
      textures: opened.textures,
      rgba: async (name, opts) => (await ask({ t: 'rgba', name, maxSize: opts?.maxSize })).image ?? null,
      arrays: opened.arrays ?? [],
      layers: async (name) => (await ask({ t: 'layers', name })).images ?? null,
      close() { try { w.postMessage({ t: 'close' }); } catch { } down('unity bundle worker closed'); },
    };
  } catch (e) {
    down(e?.message ?? 'unity bundle worker failed');
    if (e?.readerError) throw e;
    console.warn('[unity bundle] worker unavailable; opening on the main thread', e?.message ?? e);
    return here();
  }
}
