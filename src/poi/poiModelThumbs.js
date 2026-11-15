// @ts-check
// Draws pictures of the game's models for the asset browser in software (poi/poiThumb.js renderThumbShown: typed
// arrays, no WebGL context, and no canvas) and caches them as small PNG object URLs. createPoiModelReader reads a model
// without uploading or pinning anything on the GPU: the world's copy (cpuModels), else a built custom model (cached by
// the custom model registry, as the world caches it), else an alias or the ARCH3D record, which is dropped once drawn.
// Classic textures come from a few TEXTURE files it reads itself. Each step waits for idle time, and a picture no
// longer wanted is skipped. The page caches PAGE_KEEP pictures and Cache Storage saves STORE_KEEP, under a cache name
// that changes with each build; when storage is blocked, pictures are drawn but not saved.

import { renderThumbShown, encodePng } from './poiThumb.js';
import { TextureFile, texName, LAST_CLASSIC_TEXTURE_ARCHIVE } from '../formats/textureFile.js';
import { dfMeshToModel } from '../world/meshReader.js';
import { patchSeams } from '../world/arch3dSeams.js';
import { customModelBuilt, customModelNeeds, customAliasFor, aliasSubMeshes, hasCustomModel } from '../world/customModels.js';
import { getBytes, forgetBytes } from '../scenes/dataSource.js';

/** Rendered width and height of a card thumbnail in pixels (displayed at 56 CSS pixels in grid view). */
export const MODEL_THUMB_SIZE = 64;
/** Maximum number of classic TEXTURE archives cached by a reader across models. */
const TEXTURE_FILES = 8;
/** Maximum number of model thumbnail URLs cached in page memory. */
const PAGE_KEEP = 4000;
/** Maximum number of model thumbnails saved in the browser's Cache Storage. */
const STORE_KEEP = 2000;
/** Minimum remaining idle time in milliseconds required before starting a work step (rendering one thumbnail takes
 *  about 1 to 2 ms). */
const IDLE_NEED = 4;
/** Cache format version, incremented whenever thumbnail rendering changes. */
const THUMB_FORMAT = 2;
const STORE_PREFIX = 'bunnyfall-poi-model-thumbs';
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** Returns this build's suffix for the cache name of saved pictures (the format version and the module's file name).
 *  A built page's module file name carries its content hash, so a new build reads none of an old build's pictures. */
export function modelThumbBuild(url = import.meta.url) {
  try { return `${THUMB_FORMAT}-${new URL(url).pathname.split('/').pop()}`; } catch { return `${THUMB_FORMAT}`; }
}

/** Resolves to an idle deadline with at least `need` ms remaining, or to null when `requestIdleCallback` times out
 *  after 1 second (or after 50 ms when unavailable) so one step still runs on a busy page. */
function idleSlot(/** @type {number} */ need) {
  return new Promise((ok) => {
    const ric = /** @type {any} */ (globalThis).requestIdleCallback;
    if (typeof ric !== 'function') { setTimeout(() => ok(null), 50); return; }
    const ask = () => ric((/** @type {any} */ d) => (d.didTimeout ? ok(null) : d.timeRemaining() >= need ? ok(d) : ask()), { timeout: 1000 });
    ask();
  });
}

/** Returns whether `bytes` is longer than the 8-byte PNG signature and starts with it. */
const isPng = (/** @type {Uint8Array | null} */ bytes) => !!bytes && bytes.length > 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b);

/**
 * Returns a store of rendered model pictures in the browser's Cache Storage, opened on first use, or null when there is
 * none (such as in Node or when storage is blocked). All operations catch storage errors; `get` deletes and ignores
 * non-PNG entries, `put` trims the oldest entries once the store exceeds `cap`, caches from other builds are deleted on
 * first use, and `settled()` resolves once all in-flight writes finish.
 * @param {{ caches?: any, build?: string, cap?: number }} [o]
 */
export function browserThumbStore({ caches = undefined, build = modelThumbBuild(), cap = STORE_KEEP } = {}) {
  let c = caches;
  if (c === undefined) { try { c = globalThis.caches; } catch { c = null; } }
  if (!c || typeof c.open !== 'function') return null;
  const name = `${STORE_PREFIX}-${build}`;
  const url = (/** @type {string} */ key) => `https://poi-model-thumbs.invalid/${encodeURIComponent(key)}`;
  let count = 0, trimming = false;
  /** @type {Promise<any> | null} */
  let opened = null;
  const box = () => (opened ??= (async () => {
    const b = await c.open(name);
    try { for (const k of await c.keys()) if (k.startsWith(STORE_PREFIX) && k !== name) await c.delete(k); } catch { /* ignore cleanup failure */ }
    try { count = (await b.keys()).length; } catch { count = 0; }
    return b;
  })());
  /** @type {Set<Promise<void>>} */
  const writing = new Set();
  return {
    name,
    async get(/** @type {string} */ key) {
      try {
        const b = await box();
        const r = await b.match(url(key));
        if (!r) return null;
        const bytes = new Uint8Array(await r.arrayBuffer());
        if (isPng(bytes)) return bytes;
        await b.delete(url(key));
        return null;
      } catch { return null; }
    },
    put(/** @type {string} */ key, /** @type {Uint8Array} */ bytes) {
      const p = (async () => {
        try {
          const b = await box();
          await b.put(url(key), new Response(/** @type {any} */ (bytes), { headers: { 'content-type': 'image/png' } }));
          // one trim at a time: writes that land during a trim are counted, and the next write after it trims them
          if (++count > cap && !trimming) {
            trimming = true;
            try {
              const keys = await b.keys();
              const drop = keys.slice(0, Math.max(0, keys.length - Math.floor(cap * 0.9)));
              for (const k of drop) await b.delete(k);
              count -= drop.length;
            } finally { trimming = false; }
          }
        } catch { /* not saved */ }
      })();
      writing.add(p);
      void p.finally(() => writing.delete(p));
      return p;
    },
    writing: () => writing.size,
    settled: () => Promise.all([...writing]).then(() => undefined),
  };
}

/**
 * Converts a `dfMeshToModel` model into `renderThumb` input pieces, grouping submesh index runs by texture and flipping
 * V coordinates to top-down order to match `dfModelAsImport` in `poi/dfModelImport.js`.
 * @param {any} m @param {(archive: number, record: number) => any} pictureOf
 */
export function modelThumbPieces(m, pictureOf) {
  const matOf = new Map(), pictures = [], runs = [];
  for (const sm of m.subMeshes ?? []) {
    const key = `${sm.textureArchive}_${sm.textureRecord}`;
    let mi = matOf.get(key);
    if (mi == null) { mi = pictures.length; pictures.push(pictureOf(sm.textureArchive, sm.textureRecord)); matOf.set(key, mi); }
    runs.push({ start: sm.startIndex, count: sm.primitiveCount * 3, mi });
  }
  const byMat = new Map();
  for (const r of runs) { const l = byMat.get(r.mi) ?? []; l.push(r); byMat.set(r.mi, l); }
  let n = 0;
  for (const r of runs) n += r.count;
  const indices = new Uint32Array(n), submeshes = [], materials = [];
  let at = 0;
  for (const [mi, list] of byMat) {
    const start = at;
    for (const r of list) { indices.set(m.indices.subarray ? m.indices.subarray(r.start, r.start + r.count) : Array.prototype.slice.call(m.indices, r.start, r.start + r.count), at); at += r.count; }
    submeshes.push({ start, count: at - start });
    materials.push({ picture: pictures[mi], wrap: ['repeat', 'repeat'] });
  }
  const uvs = new Float32Array(m.uvs.length);
  for (let i = 0; i < uvs.length; i += 2) { uvs[i] = m.uvs[i]; uvs[i + 1] = 1 - m.uvs[i + 1]; }
  return [{ mesh: { positions: m.positions, normals: m.normals, uvs, indices, submeshes }, materials }];
}

/** Decodes a TEXTURE record into top-down RGBA pixels (`{ width, height, data }`, matching `dfTexturePng` in
 *  `poi/dfModelImport.js`), or returns null. */
function recordRgba(/** @type {any} */ t, /** @type {number} */ record) {
  const bm = t?.getDFBitmap?.(record, 0);
  if (!bm?.width || !bm.height || typeof t.getColor32 !== 'function') return null;
  const { width: w, height: h, colors } = t.getColor32(bm, -1);
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) data.set(colors.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  return { width: w, height: h, data };
}

/**
 * Creates a model reader that bypasses GPU uploads and pinning. Classic texture archives are held in a small local
 * cache and freed on eviction or `release()`, while mod archives (above `TEXTURE.511`) are loaded through `getTexture`
 * into the pipeline's `textureFiles` cache. Awaits `room()` (when provided) between steps to yield to idle time.
 * @param {{ arch: any, palette?: any, cpuModels?: Map<number, any> | null, textureFiles?: Map<number, any> | null,
 *   getTexture?: ((archive: number) => Promise<any>) | null, fetch?: (name: string) => Promise<Uint8Array>,
 *   forget?: (name: string) => void, room?: (() => Promise<any>) | null }} o
 */
export function createPoiModelReader({ arch, palette = null, cpuModels = null, textureFiles = null, getTexture = null, fetch = getBytes, forget = forgetBytes, room = null }) {
  const step = () => (room ? room() : Promise.resolve());
  // the TEXTURE files the last few models used, newest last
  /** @type {Map<number, any>} */
  const files = new Map();
  /** @type {Map<number, Promise<any>>} */
  const reading = new Map();
  /** the archives of the model being read */
  let using = new Set();
  function letGo(/** @type {number} */ archive) {
    files.delete(archive);
    // do not evict the raw archive bytes from dataSource if the world pipeline has loaded this archive
    if (!textureFiles?.has(archive)) { try { forget(texName(archive)); } catch { /* ignore release failure */ } }
  }
  /** Loads a TEXTURE archive: reads classic archives locally and delegates mod archives (above `TEXTURE.511`) to
   *  `getTexture`. */
  async function textureFile(/** @type {number} */ archive) {
    if (archive > LAST_CLASSIC_TEXTURE_ARCHIVE) return getTexture ? getTexture(archive).catch(() => null) : null;
    const had = files.get(archive);
    if (had !== undefined) { files.delete(archive); files.set(archive, had); return had; }
    if (!reading.has(archive)) {
      reading.set(archive, (async () => {
        let t = null;
        try {
          const bytes = await fetch(texName(archive));
          await step();
          const f = new TextureFile();
          if (f.load(bytes, texName(archive), palette)) t = f;
        } catch { t = null; }
        files.set(archive, t);
        // once more than TEXTURE_FILES files are held, evict the oldest, but never one the current model uses
        for (const a of [...files.keys()]) { if (files.size <= TEXTURE_FILES) break; if (!using.has(a)) letGo(a); }
        return t;
      })().finally(() => reading.delete(archive)));
    }
    return reading.get(archive);
  }
  const fileOf = (/** @type {number} */ a) => (a > LAST_CLASSIC_TEXTURE_ARCHIVE ? textureFiles?.get(a) : files.get(a));
  const sizeOf = (/** @type {number} */ a, /** @type {number} */ r) => {
    const t = fileOf(a);
    return t ? { width: t.getWidth(r), height: t.getHeight(r) } : { width: 1, height: 1 };
  };
  const classicOf = (/** @type {number} */ mid) => { const i = arch.getRecordIndex(mid); return i === -1 ? null : arch.getMesh(i); };
  const usable = (/** @type {any} */ m) => !!(m?.positions?.length && m.normals && m.uvs && m.indices);

  /** Loads model `id` in `dfMeshToModel` format along with its texture archives, or returns null, checking in
   *  pipeline order (`buildGpuMesh` in `scenes/dataPipeline.js`): `cpuModels`, custom models, model aliases, and
   *  finally `ARCH3D.BSA`. */
  async function read(/** @type {number} */ id) {
    const own = cpuModels?.get(id);
    if (usable(own)) {
      using = new Set(own.subMeshes.map((/** @type {any} */ s) => s.textureArchive));
      for (const a of using) await textureFile(a);
      return own;
    }
    await step();
    if (hasCustomModel(id)) {
      using = new Set();
      for (const mid of customModelNeeds(id)) for (const sm of classicOf(mid)?.subMeshes ?? []) using.add(sm.textureArchive);
      for (const a of using) await textureFile(a);
      await step();
      const m = await customModelBuilt(id, { classicModel: (/** @type {number} */ mid) => { const d = classicOf(mid); return d ? dfMeshToModel(d, sizeOf) : null; } });
      for (const sm of m?.subMeshes ?? []) { using.add(sm.textureArchive); await textureFile(sm.textureArchive); }
      return usable(m) ? m : null;
    }
    // loads a classic ARCH3D model, or a model alias (a classic model with remapped textures via world/customModels.js
    // registerModelAlias, such as dyed town beds from 42069 up, which are not in the asset catalog and are only
    // requested by ID)
    const alias = customAliasFor(id);
    const from = alias ? alias.model : id;
    const dm = classicOf(from);
    if (!dm?.subMeshes?.length) return null;
    using = new Set(dm.subMeshes.map((/** @type {any} */ s) => s.textureArchive));
    for (const to of Object.values(alias?.remap ?? {})) using.add(to[0]);
    for (const a of using) await textureFile(a);
    await step();
    const m = dfMeshToModel(patchSeams(from, dm), sizeOf);
    return alias ? { ...m, subMeshes: aliasSubMeshes(m.subMeshes, alias.remap) } : m;
  }
  return {
    read, textureFile,
    /** Returns record `r` of loaded texture archive `a` as top-down RGBA pixels, or null. */
    pictureOf: (/** @type {number} */ a, /** @type {number} */ r) => recordRgba(fileOf(a), r),
    files: () => files.size,
    release() { for (const a of [...files.keys()]) letGo(a); },
  };
}

/**
 * Creates a cache of model pictures at one `size`. `wanted(id)` returns whether model `id` still needs its picture (its
 * card is on screen, or it is selected), and `onReady(id)` runs once the picture, or its absence, is known.
 * @param {{ arch: any, palette?: any, cpuModels?: Map<number, any> | null, textureFiles?: Map<number, any> | null,
 *   getTexture?: ((archive: number) => Promise<any>) | null, fetch?: (name: string) => Promise<Uint8Array>, forget?: (name: string) => void,
 *   store?: ReturnType<typeof browserThumbStore>, idle?: (need: number) => Promise<any>, size?: number, keep?: number,
 *   wanted?: (id: number) => boolean, onReady?: (id: number) => void }} o
 */
export function createPoiModelThumbs({ arch, palette = null, cpuModels = null, textureFiles = null, getTexture = null, fetch = getBytes, forget = forgetBytes,
  store = browserThumbStore(), idle = idleSlot, size = MODEL_THUMB_SIZE, keep = PAGE_KEEP, wanted = () => true, onReady = () => {} }) {
  /** @type {Map<number, string | null>} model id -> object URL (null: no picture), oldest first */
  const made = new Map();
  /** @type {number[]} */
  const queue = [];
  let running = false, gone = false;
  const counts = { drawn: 0, stored: 0, failed: 0, skipped: 0, drawMs: 0, drawMsMax: 0, slots: 0 };
  // the idle period the current step runs in: a step waits for a new one once this one has too little time left
  /** @type {any} */
  let deadline = null;
  async function room() {
    if (deadline && deadline.timeRemaining() >= IDLE_NEED) return;
    counts.slots++;
    deadline = await idle(IDLE_NEED);
  }
  const reader = createPoiModelReader({ arch, palette, cpuModels, textureFiles, getTexture, fetch, forget, room });

  /** Renders model `id` as PNG bytes, returning null if it cannot be rendered or undefined if it is no longer
   *  needed. */
  async function draw(/** @type {number} */ id) {
    await room();
    if (gone || !wanted(id)) return undefined;
    const m = await reader.read(id);
    if (!m) return null;
    await room();
    if (gone || !wanted(id)) return undefined;
    const t0 = performance.now();
    // a model that renders nothing even two-sided has no picture, and its card shows its number
    const img = renderThumbShown(/** @type {any} */ (modelThumbPieces(m, reader.pictureOf)), { size });
    if (!img) return null;
    const png = encodePng(img);
    const ms = performance.now() - t0;
    counts.drawMs += ms;
    counts.drawMsMax = Math.max(counts.drawMsMax, ms);
    return png;
  }

  const keyOf = (/** @type {number} */ id) => `${size}/${id}${hasCustomModel(id) ? 'c' : customAliasFor(id) ? 'a' : ''}`;
  function keepUrl(/** @type {number} */ id, /** @type {string | null} */ url) {
    made.set(id, url);
    // when the cache exceeds keep, revoke and evict the oldest entries that are no longer needed
    if (made.size > keep) {
      for (const [k, u] of made) {
        if (made.size <= keep) break;
        if (k === id || wanted(k)) continue;
        if (u) URL.revokeObjectURL(u);
        made.delete(k);
      }
    }
  }
  async function one(/** @type {number} */ id) {
    const key = keyOf(id);
    const kept = store ? await store.get(key) : null;
    if (gone) return;
    if (kept) { counts.stored++; keepUrl(id, URL.createObjectURL(new Blob([/** @type {any} */ (kept)], { type: 'image/png' }))); onReady(id); return; }
    let png;
    try { png = await draw(id); } catch { png = null; }
    if (gone) return;
    if (png === undefined) { counts.skipped++; return; }
    if (!png) { counts.failed++; keepUrl(id, null); onReady(id); return; }
    counts.drawn++;
    keepUrl(id, URL.createObjectURL(new Blob([/** @type {any} */ (png)], { type: 'image/png' })));
    if (store) void store.put(key, png);
    onReady(id);
  }
  async function run() {
    if (running) return;
    running = true;
    try {
      while (queue.length && !gone) {
        const id = /** @type {number} */ (queue.shift());
        // skip a model that is no longer needed before its turn starts (it will be queued again if needed later)
        if (made.has(id)) continue;
        if (!wanted(id)) { counts.skipped++; continue; }
        await one(id);
      }
    } finally { running = false; }
  }

  return {
    /** Returns the cached object URL for model `id`, null if it has no picture, or undefined if not yet loaded. */
    url: (/** @type {number} */ id) => made.get(id),
    /** Queues model `id` for thumbnail loading and calls `onReady(id)` once the result is known. */
    want(/** @type {number} */ id) {
      if (gone || made.has(id) || queue.includes(id)) return;
      queue.push(id);
      void run();
    },
    stats: () => ({ ...counts, kept: made.size, queued: queue.length, textureFiles: reader.files(), store: store?.name ?? null, writing: store?.writing() ?? 0 }),
    /** Resolves once all in-flight Cache Storage writes have finished. */
    settled: () => store?.settled() ?? Promise.resolve(),
    /** Cancels queued work, revokes all cached object URLs, and releases cached texture archives. */
    destroy() {
      gone = true;
      queue.length = 0;
      for (const u of made.values()) if (u) URL.revokeObjectURL(u);
      made.clear();
      reader.release();
    },
  };
}

/**
 * Builds a one-model pipe (`{ getGpuMesh, cpuModels, getTexture, done }`) for `dfModelAsImport` in
 * `poi/dfModelImport.js`, served by its own `createPoiModelReader`, so reading a model for the editor uploads and pins
 * nothing on the GPU. `done()` releases the model and texture files it read.
 * @param {{ arch: any, palette?: any, cpuModels?: Map<number, any> | null, textureFiles?: Map<number, any> | null, getTexture?: ((archive: number) => Promise<any>) | null }} o
 */
export function poiModelImportPipe(o) {
  const reader = createPoiModelReader(o);
  /** @type {Map<number, any>} */
  const cpuModels = new Map();
  return {
    getGpuMesh: async (/** @type {number} */ id) => { const m = await reader.read(id); if (m) cpuModels.set(id, m); },
    cpuModels,
    getTexture: (/** @type {number} */ a) => reader.textureFile(a),
    done() { cpuModels.clear(); reader.release(); },
  };
}
