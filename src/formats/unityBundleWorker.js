// Worker side of unityBundleClient.js and unityBundlePool.js. Import only pure, DOM-free modules here: a worker has
// no DOM and evaluates the whole import graph.

import { readUnityBundle } from './unityBundle.js';

// `FileReaderSync` exists only in a worker, so this byte source works only on the worker side.
export function blobSource(blob, Reader = globalThis.FileReaderSync) {
  const fr = new Reader();
  return { size: blob.size, slice: (a, b) => new Uint8Array(fr.readAsArrayBuffer(blob.slice(a, Math.min(blob.size, b)))) };
}

// A message without `bid` uses slot 0, as unityBundleClient.js sends; unityBundlePool.js sends a `bid` on every
// message.
const slots = new Map();

export function handle(m, post) {
  const bid = m.bid ?? 0;
  try {
    if (m.t === 'open') {
      const bytes = m.blob ? blobSource(m.blob) : m.bytes instanceof Uint8Array ? m.bytes : new Uint8Array(m.bytes);
      const maxTextureSize = Number.isFinite(m.maxTextureSize) ? m.maxTextureSize : Infinity;
      const bundle = readUnityBundle(bytes, { maxTextureSize, knownTextures: m.knownTextures ?? null });
      const byName = new Map();
      for (const t of bundle.textures) if (!byName.has(t.name)) byName.set(t.name, t);
      slots.set(bid, { bundle, byName, maxTextureSize });
      if (m.quiet) { post({ t: 'opened', id: m.id, textAssets: [], textures: [] }); return; }
      const textAssets = bundle.textAssets.map((t) => ({ name: t.name, bytes: t.bytes.slice() }));
      const textures = bundle.textures.map((t) => ({ name: t.name, width: t.width, height: t.height, format: t.format }));
      const arrays = (bundle.arrays ?? []).map((a) => ({ name: a.name, width: a.width, height: a.height, depth: a.depth }));
      post({ t: 'opened', id: m.id, textAssets, textures, arrays }, textAssets.map((t) => t.bytes.buffer));
      return;
    }
    if (m.t === 'layers') {
      const slot = slots.get(bid);
      const arr = slot?.bundle.arrays?.find((a) => a.name === m.name);
      if (!arr) { post({ t: 'layers', id: m.id, images: null }); return; }
      const images = arr.layers().map((img) => ({ width: img.width, height: img.height, data: img.data.byteOffset === 0 && img.data.byteLength === img.data.buffer.byteLength ? img.data : img.data.slice() }));
      post({ t: 'layers', id: m.id, images }, images.map((i) => i.data.buffer));
      return;
    }
    if (m.t === 'rgba') {
      const slot = slots.get(bid);
      const tex = slot?.byName.get(m.name);
      if (!tex) { post({ t: 'rgba', id: m.id, image: null }); return; }
      const img = tex.rgba({ maxSize: Number.isFinite(m.maxSize) ? m.maxSize : slot.maxTextureSize });
      const data = img.data.byteOffset === 0 && img.data.byteLength === img.data.buffer.byteLength ? img.data : img.data.slice();
      post({ t: 'rgba', id: m.id, image: { width: img.width, height: img.height, data } }, [data.buffer]);
      return;
    }
    if (m.t === 'close') { slots.delete(bid); return; }
    post({ t: 'error', id: m.id, message: `unity bundle worker: unknown message ${JSON.stringify(m.t)}` });
  } catch (e) {
    post({ t: 'error', id: m.id, message: e?.message ?? String(e) });
  }
}

globalThis.onmessage = (ev) => handle(ev.data ?? {}, (msg, transfer) => globalThis.postMessage(msg, transfer ?? []));
