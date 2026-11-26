// User texture replacements, as in Daggerfall Unity's TextureReplacement.cs. File names follow its GetName,
// {archive:000}_{record}-{frame}[_{dye}][_{map}].png, and only the archive is zero-padded.

import { getBool } from '../platform/settings.js';
import { toColor32 } from '../formats/color32Order.js';
import { dyeToken } from '../characters/dyes.js';
import { isTouchDevice } from '../ui/touchDevice.js';

export const TEXTURE_MAPS = Object.freeze(['Albedo', 'Normal', 'Height', 'Emission', 'MetallicGloss', 'Mask']);

export const TEXTURE_EXTENSION = 'png';

export const textureReplacementEnabled = () => getBool('Enhancements', 'AssetInjection');

export function textureName(archive, record, frame = 0, map = 'Albedo', dye = null) {
  let name = `${String(archive).padStart(3, '0')}_${record}-${frame}`;
  if (dye) name = `${name}_${dye}`;
  if (map && map !== 'Albedo') name = `${name}_${map}`;
  return name;
}

// Daggerfall Unity writes the dye first and the map last, so the map is the last token that names a TextureMap and
// anything before it is the dye. A dye literally named Normal would be misread, as in Daggerfall Unity.
export function textureEntry(fileName) {
  const name = String(fileName ?? '').trim();
  const base = name.slice(name.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return null;
  if (base.slice(dot + 1).toLowerCase() !== TEXTURE_EXTENSION) return null;

  const tokens = base.slice(0, dot).split('_');
  if (tokens.length < 2) return null;
  if (!/^\d+$/.test(tokens[0])) return null;
  const rf = /^(\d+)-(\d+)$/.exec(tokens[1]);
  if (!rf) return null;

  const rest = tokens.slice(2);
  let map = 'Albedo';
  if (rest.length && TEXTURE_MAPS.includes(rest[rest.length - 1]) && rest[rest.length - 1] !== 'Albedo') {
    map = rest.pop();
  }
  if (rest.length > 1) return null;
  return {
    archive: Number(tokens[0]),
    record: Number(rf[1]),
    frame: Number(rf[2]),
    map,
    dye: rest.length ? rest[0] : null,
    fileName,
  };
}

// The key carries the frame and the dye, because GetName writes the dye before the map.
export const textureKey = (archive, record, frame = 0, map = 'Albedo', dye = null) => {
  const d = dyeToken(dye);
  return `${Number(archive)}_${Number(record)}-${Number(frame)}${d ? `_${d}` : ''}${map && map !== 'Albedo' ? `_${map}` : ''}`;
};

let _index = new Map();
let _load = null;
let _looseGen = 0;

export function setTextureReplacements(fileNames, load) {
  _looseGen++;
  const was = _index;
  _index = new Map();
  for (const fileName of fileNames ?? []) {
    const e = textureEntry(fileName);
    if (!e) continue;
    const key = textureKey(e.archive, e.record, e.frame, e.map, e.dye);
    if (!_index.has(key)) _index.set(key, e);
  }
  const wasLoad = _load;
  _load = typeof load === 'function' ? load : null;
  if (_load !== wasLoad || !sameEntries(was, _index)) tierChanged();
  return _index.size;
}

export const textureReplacementCount = () => _index.size;

export const looseTextureExists = (archive, record, frame = 0, map = 'Albedo') =>
  textureReplacementEnabled() && !!_load && _index.has(textureKey(archive, record, frame, map));
export async function looseTextureBytes(archive, record, frame = 0, map = 'Albedo') {
  if (!looseTextureExists(archive, record, frame, map)) return null;
  const entry = _index.get(textureKey(archive, record, frame, map));
  try {
    const bytes = await _load(entry.fileName);
    return bytes && bytes.byteLength > 0 ? bytes : null;
  } catch (e) {
    console.warn(`[texture] replacement ${entry.fileName} would not load:`, e?.message ?? e);
    return null;
  }
}
export const looseTextureGeneration = () => _looseGen;

const _vendor = new Map();
// Entries with standIn: true are archives that exist only as vendored art, with no ARENA2 file. Without it, an
// entry overrides one record of a real archive; the archive number cannot tell the two apart.
export function addVendorTextures(entries) {
  let n = 0;
  for (const e of entries ?? []) {
    if (!Number.isFinite(e?.archive) || !Number.isFinite(e?.record) || (typeof e.load !== 'function' && typeof e.build !== 'function')) continue;
    const map = e.map ?? 'Albedo';
    const key = textureKey(e.archive, e.record, e.frame ?? 0, map, e.dye ?? null);
    const prev = _vendor.get(key);
    const entry = { archive: Number(e.archive), record: Number(e.record), frame: Number(e.frame ?? 0), map, dye: e.dye ?? null, gate: typeof e.gate === 'function' ? e.gate : null, lazy: e.lazy === true, fileName: e.fileName ?? key, load: e.load ?? null, build: typeof e.build === 'function' ? e.build : null, standIn: e.standIn === true, yields: e.yields === true, offset: e.offset ?? null, studio: e.studio === true, under: null, readOnly: e.readOnly === true };
    if (prev?.studio && !entry.studio) {
      coverWith(prev, entry);
      dropDecoded(key);
      n++;
      continue;
    }
    if (entry.studio && prev) coverWith(entry, prev.studio ? prev.under : prev);
    _vendor.set(key, entry);
    n++;
  }
  if (n) tierChanged();
  return n;
}
export const vendorTextureCount = () => _vendor.size;
function coverWith(studio, under) {
  if (!under) return;
  studio.under = under;
  if (under.standIn) studio.standIn = true;
  if (under.lazy) studio.lazy = true;
  if (under.readOnly) studio.readOnly = true;
  studio.offset ??= under.offset ?? null;
}
export function studioRecordsOf(archive) {
  const a = Number(archive), out = [];
  for (const e of _vendor.values()) if (e.studio && e.archive === a && e.frame === 0 && e.map === 'Albedo' && e.dye == null) out.push(e.record);
  return out.sort((x, y) => x - y);
}

// The renderer keeps the first picture given for a key, so an archive's first load waits up to `atMost` ms for a
// registration on its way. A slow network costs the art, never the world.
const _holds = new Set();
export function holdTextureTiers(promise, atMost) {
  let timer = null;
  const held = Promise.race([Promise.resolve(promise).catch(() => {}), new Promise((r) => { timer = setTimeout(r, atMost); })])
    .then(() => { clearTimeout(timer); _holds.delete(held); });
  _holds.add(held);
  return held;
}
export const textureTiersSettled = () => (_holds.size ? Promise.all([..._holds]) : null);
export function clearVendorTextures() { _vendor.clear(); tierChanged(); }
// Answered from the registration: one vendored record of a real archive must not send it down the stand-in branch.
export const isVendorArchive = (archive) => { for (const e of _vendor.values()) if (e.standIn && e.archive === Number(archive)) return true; return false; };
// Read from the registry, not the decoded map, so a PNG not yet fetched cannot shrink the archive under a caller.
export function vendorRecordCount(archive) {
  let n = 0;
  for (const e of _vendor.values()) if (e.standIn && e.archive === Number(archive)) n = Math.max(n, e.record + 1);
  return n;
}
const _frameCounts = new Map();
export function vendorFrameCount(archive, record) {
  const a = Number(archive);
  let held = _frameCounts.get(a);
  if (!held || held.gen !== _tierGen) {
    const frames = new Map();
    for (const e of _vendor.values()) {
      if (!e.standIn || e.archive !== a || e.map !== 'Albedo') continue;
      if (!frames.has(e.record)) frames.set(e.record, new Set());
      frames.get(e.record).add(e.frame);
    }
    const counts = new Map();
    for (const [r, set] of frames) { let n = 0; while (set.has(n)) n++; counts.set(r, n); }
    held = { gen: _tierGen, counts };
    _frameCounts.set(a, held);
  }
  return Math.max(1, held.counts.get(Number(record)) ?? 0);
}
// It must answer recordCount and getSize, because icon doors check record < tex.recordCount before they upload.
function topDownRgba(decoded) {
  if (!decoded?.colors) return null;
  const { width, height, colors } = decoded;
  const row = width * 4;
  const out = new Uint8ClampedArray(colors.length);
  for (let y = 0; y < height; y++) out.set(colors.subarray(y * row, (y + 1) * row), (height - 1 - y) * row);
  return out;
}

const vendorEntryOf = (archive, record, map = 'Albedo') => {
  const bare = _vendor.get(textureKey(archive, record, 0, map));
  if (bare) return bare;
  for (const e of _vendor.values()) if (e.archive === Number(archive) && e.record === Number(record) && e.frame === 0 && e.map === map) return e;
  return null;
};
// A stand-in registered undyed, with no dyed entry for its record, answers every dye with itself; a dyed set still
// answers by its dyes alone.
const standInDye = (archive, record, frame, map, dye) => {
  if (!dyeToken(dye) || _vendor.has(textureKey(archive, record, frame, map, dye))) return dye;
  const bare = _vendor.get(textureKey(archive, record, frame, map));
  if (!bare?.standIn) return dye;
  for (const e of _vendor.values()) if (e.archive === bare.archive && e.record === bare.record && e.frame === bare.frame && e.map === bare.map && e.dye != null && !e.studio) return dye;
  return null;
};
const decodedOf = (archive, record) => {
  const bare = _decoded.get(textureKey(archive, record, 0));
  if (bare) return bare;
  for (const [k, e] of _vendor) if (e.archive === Number(archive) && e.record === Number(record) && e.frame === 0 && e.map === 'Albedo' && _decoded.has(k)) return _decoded.get(k);
  return null;
};
const measuredOf = (archive, record) => {
  const d = decodedOf(archive, record);
  if (d) return d;
  const bare = _released.get(textureKey(archive, record, 0));
  if (bare) return bare;
  for (const [k, e] of _vendor) if (e.archive === Number(archive) && e.record === Number(record) && e.frame === 0 && e.map === 'Albedo' && _released.has(k)) return _released.get(k);
  return null;
};
// A readOnly frame whose GPU copy was evicted gets a transparent 1x1 marked pending, so the renderer stores nothing
// at the key and the next draw asks again.
const _pending = new Map();
const CLEAR_TEXEL = new Uint8ClampedArray(4);
function pendingPicture(archive, record, frame) {
  const key = textureKey(archive, record, frame);
  let p = _pending.get(key);
  if (!p) {
    let asking = false;
    p = Object.freeze({ width: 1, height: 1, colors: CLEAR_TEXEL, pending: () => {
      if (asking) return;
      asking = true;
      const lit = _vendor.has(textureKey(archive, record, frame, 'Emission')) ? preloadTextureRecord(archive, record, frame, 'Emission') : Promise.resolve(null);
      lit.then(() => preloadTextureRecord(archive, record, frame)).then((c32) => { if (c32) asking = false; });
    } });
    _pending.set(key, p);
  }
  return p;
}
export function vendorTextureStandIn(archive) {
  const recordCount = vendorRecordCount(archive);
  const size = (record) => { const d = measuredOf(archive, record); return d ? (d.box ?? { width: d.width, height: d.height }) : { width: 1, height: 1 }; };
  return {
    vendor: true,
    archive: Number(archive),
    recordCount,
    getSize: (record) => (record >= 0 && record < recordCount ? size(record) : { width: 0, height: 0 }),
    getScale: (record) => measuredOf(archive, record)?.recordScale ?? { width: 0, height: 0 },
    getOffset: (record) => vendorEntryOf(archive, record ?? 0)?.offset ?? { x: 0, y: 0 },
    getFrameCount: (record) => vendorFrameCount(archive, record),
    getWidth: (record) => size(record).width,
    getHeight: (record) => size(record).height,
    // The paper doll reads the bitmap itself, so this returns top-down RGBA in `rgba`. The `data` field stays null
    // because no indexed bitmap exists, and a zero-filled one would draw black.
    getDFBitmap: (record, frame = 0) => { const d = decodedOf(archive, record), m = d ?? measuredOf(archive, record); return { ...(m ? { width: m.width, height: m.height } : size(record)), data: null, rgba: topDownRgba(d), record, frame }; },
    getBox: (record) => measuredOf(archive, record)?.box ?? null,
    getColor32: (bitmap) => {
      const r = bitmap?.record ?? 0, f = bitmap?.frame ?? 0, key = textureKey(archive, r, f);
      if (_vendor.get(key)?.readOnly) return _decoded.get(key) ?? pendingPicture(archive, r, f);
      return decodedOf(archive, r) ?? null;
    },
  };
}
let _bundle = new Map();
// WebKit never reports navigator.deviceMemory, so a touch browser with no report is read as iOS's 2 GB tab limit.
export const IOS_TAB_GB = 2;
export const bundleBudgetGb = (nav = globalThis.navigator, win = globalThis.window) => {
  const reported = Number(nav?.deviceMemory);
  if (reported > 0) return reported;
  return isTouchDevice(win) ? IOS_TAB_GB : 8;
};
export const bundleBudgetBytes = (nav = globalThis.navigator, win = globalThis.window) => Math.round(Math.min(1536, 192 * bundleBudgetGb(nav, win)) * 1024 * 1024);
let _bundleBytes = 0;
let _budgetWarned = false;
export const bundleDecodedBytes = () => _bundleBytes;
export function setBundleTextures(entries) {
  const was = _bundle;
  _bundle = new Map();
  _budgetWarned = false;
  for (const e of entries ?? []) {
    if (!Number.isFinite(e?.archive) || !Number.isFinite(e?.record) || typeof e.image !== 'function') continue;
    const map = e.map ?? 'Albedo';
    const key = textureKey(e.archive, e.record, e.frame ?? 0, map, e.dye ?? null);
    if (_bundle.has(key)) continue;
    _bundle.set(key, { archive: Number(e.archive), record: Number(e.record), frame: Number(e.frame ?? 0), map, dye: e.dye ?? null, fileName: e.fileName ?? key, src: e.src ?? null, image: e.image, lazy: e.lazy === true, rect: e.rect ?? null });
  }
  if (!sameEntries(was, _bundle)) tierChanged();
  return _bundle.size;
}
export const bundleTextureCount = () => _bundle.size;
export function textureReplacementRect(archive, record, frame = 0, map = 'Albedo', dye = null) {
  dye = standInDye(archive, record, frame, map, dye);
  const key = textureKey(archive, record, frame, map, dye);
  if (_index.has(key) || vendorOf(key)) return null;
  return _bundle.get(key)?.rect ?? null;
}

const ownPick = (key) => textureReplacementEnabled() && (_index.has(key) || _bundle.has(key));
const vendorOf = (key) => { const v = _vendor.get(key); return v && !(v.yields && ownPick(key)) ? v : null; };
const entryFor = (key) => _index.get(key) ?? vendorOf(key) ?? _bundle.get(key) ?? null;

export function clearTextureReplacements() {
  _looseGen++;
  const had = _index.size > 0 || _load !== null;
  _index = new Map();
  _load = null;
  if (had) tierChanged();
}

// One picture is cached per key with the source it was decoded from. It answers only while the entry that
// answers the key has that source, and a decode that lands after its entry stopped answering is dropped.
const _decodedFrom = new Map();
const _released = new Map();
const _bundleBytesOf = new Map();
const srcOf = (e) => e?.src ?? e?.fileName ?? null;
const liveEntry = (key) => {
  const on = textureReplacementEnabled();
  return (on && _load ? _index.get(key) : null) ?? vendorOf(key) ?? (on ? _bundle.get(key) : null) ?? null;
};
const decodedFrom = (key, entry) => (entry && _decodedFrom.get(key) === srcOf(entry) ? _decoded.get(key) ?? null : null);
const releasedFrom = (key, entry) => !!entry && _released.get(key)?.src === srcOf(entry);
function release(key, entry, c32) {
  _released.set(key, { src: srcOf(entry), width: c32.width, height: c32.height, box: c32.box ?? null, recordScale: c32.recordScale ?? null });
  dropDecoded(key);
}
function dropDecoded(key) {
  _decoded.delete(key);
  _decodedFrom.delete(key);
  const b = _bundleBytesOf.get(key);
  if (b !== undefined) { _bundleBytes -= b; _bundleBytesOf.delete(key); }
}
function putDecoded(key, entry, c32) {
  dropDecoded(key);
  _released.delete(key);
  _decoded.set(key, c32);
  _decodedFrom.set(key, srcOf(entry));
  if (entry.image) { const b = c32.width * c32.height * 4; _bundleBytesOf.set(key, b); _bundleBytes += b; }
}
const sourceRegistered = (key, src) => [_vendor.get(key), _index.get(key), _bundle.get(key)].some((e) => e && srcOf(e) === src);
function sameEntries(a, b) {
  if (a.size !== b.size) return false;
  for (const [k, e] of b) if (srcOf(a.get(k)) !== srcOf(e)) return false;
  return true;
}
let _tierGen = 0;
function tierChanged() {
  _tierGen++;
  for (const [k, src] of [..._decodedFrom]) if (!sourceRegistered(k, src)) dropDecoded(k);
  for (const [k, r] of [..._released]) if (!sourceRegistered(k, r.src)) _released.delete(k);
  _pending.clear();
}
export const textureTierEpoch = () => `${_tierGen}:${textureReplacementEnabled() ? 1 : 0}`;

export function hasTextureReplacement(archive, record, frame = 0, map = 'Albedo', dye = null) {
  dye = standInDye(archive, record, frame, map, dye);
  const key = textureKey(archive, record, frame, map, dye);
  const v = vendorOf(key);
  if (v) return !v.gate || v.gate() === true;
  if (!textureReplacementEnabled()) return false;
  return _index.has(key) || _bundle.has(key);
}

export async function textureReplacementBytes(archive, record, frame = 0, map = 'Albedo', dye = null) {
  dye = standInDye(archive, record, frame, map, dye);
  if (!hasTextureReplacement(archive, record, frame, map, dye)) return null;
  const entry = entryFor(textureKey(archive, record, frame, map, dye));
  if (entry?.build || entry?.image) return null;
  const load = entry?.load ?? _load;
  if (!entry || !load) return null;
  try {
    const bytes = await load(entry.fileName);
    return bytes && bytes.byteLength > 0 ? bytes : null;
  } catch (e) {
    console.warn(`[texture] replacement ${entry.fileName} would not load:`, e?.message ?? e);
    return null;
  }
}

// Replacements decode alongside getTexture's async archive load, because the upload path is synchronous.

// The map holds color32 with rows bottom-up, as getColor32 returns them and as the upload expects with
// UNPACK_FLIP_Y_WEBGL off. Browser decodes are top-down, so they convert here, at the one door.
const _decoded = new Map();

let _deriveContext = null;
export function setTextureDeriveContext(ctx) { _deriveContext = ctx ?? null; }
const withRecordScale = (c32, picture) => { if (picture?.scale) c32.recordScale = picture.scale; return c32; };
async function entryColor32(entry, decode) {
  if (entry.studio && entry.under) {
    const base = await pictureColor32(entry.under, decode).catch(() => null);
    const own = await pictureColor32(entry, decode).catch((e) => { console.warn(`[texture] ${entry.fileName} would not decode - the picture it covers is drawn:`, e?.message ?? e); return null; });
    if (!own) return base;
    if (base) { own.box = { width: base.width, height: base.height }; if (base.recordScale && !own.recordScale) own.recordScale = base.recordScale; }
    return own;
  }
  return pictureColor32(entry, decode);
}
async function pictureColor32(entry, decode) {
  if (entry.build) {
    if (!_deriveContext) throw new Error(`${entry.fileName}: derived from classic art and no pipeline is up to read it`);
    const picture = await entry.build(_deriveContext);
    return picture ? withRecordScale(toColor32(picture), picture) : null;
  }
  if (entry.image) {
    if (_bundleBytes >= bundleBudgetBytes()) {
      if (!_budgetWarned) { _budgetWarned = true; console.warn(`[texture] texture mods reached their memory budget (${Math.round(bundleBudgetBytes() / 1048576)} MB) - further mod pictures draw classic this session; lower Texture detail to fit more`); }
      return null;
    }
    const img = await entry.image();
    return img ? toColor32(img) : null;
  }
  const bytes = await (entry.load ?? _load)(entry.fileName);
  if (!bytes || !bytes.byteLength) return null;
  return toColor32(await decode(bytes));
}

export async function decodePng(bytes) {
  const blob = new Blob([bytes], { type: 'image/png' });
  const bmp = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
  bmp.close?.();
  return { width: img.width, height: img.height, data: new Uint8Array(img.data.buffer) };
}

// Lazy entries are not preloaded, because getTexture awaits this preload before it publishes the archive.
export const PRELOAD_CONCURRENCY = 16;
export const PRELOAD_LANES = 32;
let _preloadFree = PRELOAD_LANES;
const _preloadQueue = [];
const preloadTurn = () => (_preloadFree > 0 ? (_preloadFree--, Promise.resolve()) : new Promise((go) => { _preloadQueue.push(go); }));
const preloadTurnDone = () => { const next = _preloadQueue.shift(); if (next) next(); else _preloadFree++; };
export async function preloadTextureArchive(archive, { decode = decodePng, concurrency = PRELOAD_CONCURRENCY } = {}) {
  let done = 0;
  const a = Number(archive);
  const keys = new Set();
  for (const tier of [_vendor, _index, _bundle]) for (const [k, e] of tier) if (e.archive === a) keys.add(k);
  const todo = [];
  for (const key of keys) {
    const entry = liveEntry(key);
    if (entry && !entry.lazy && !decodedFrom(key, entry) && !releasedFrom(key, entry)) todo.push([key, entry]);
  }
  const one = async ([key, entry]) => {
    try {
      const c32 = await entryColor32(entry, decode);
      if (!c32) return;
      if (srcOf(liveEntry(key)) !== srcOf(entry)) return;
      putDecoded(key, entry, c32);
      done++;
    } catch (e) {
      console.warn(`[texture] ${entry.fileName} would not decode:`, e?.message ?? e);
    }
  };
  let next = 0;
  const lane = async () => {
    while (next < todo.length) {
      const item = todo[next++];
      await preloadTurn();
      try { await one(item); } finally { preloadTurnDone(); }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, todo.length)) }, lane));
  return done;
}

const _decoding = new Map();
export function preloadTextureRecord(archive, record, frame = 0, map = 'Albedo', dye = null, { decode = decodePng } = {}) {
  dye = standInDye(archive, record, frame, map, dye);
  const key = textureKey(archive, record, frame, map, dye);
  const entry = liveEntry(key);
  if (decodedFrom(key, entry)) return Promise.resolve(decodedNow(key));
  if (!entry || !hasTextureReplacement(archive, record, frame, map, dye)) return Promise.resolve(null);
  const ask = `${key}\n${srcOf(entry)}`;
  if (!_decoding.has(ask)) {
    _decoding.set(ask, (async () => {
      try {
        const c32 = await entryColor32(entry, decode);
        if (!c32) return null;
        if (srcOf(liveEntry(key)) !== srcOf(entry)) return null;
        putDecoded(key, entry, c32);
        return decodedNow(key);
      } catch (e) {
        console.warn(`[texture] ${entry.fileName} would not decode:`, e?.message ?? e);
        return null;
      } finally { _decoding.delete(ask); }
    })());
  }
  return _decoding.get(ask);
}

export function decodedTexture(archive, record, frame = 0, map = 'Albedo', dye = null) {
  dye = standInDye(archive, record, frame, map, dye);
  const key = textureKey(archive, record, frame, map, dye);
  const pic = decodedNow(key);
  if (pic) { const e = liveEntry(key); if (e?.readOnly) release(key, e, pic); }
  return pic;
}
function decodedNow(key) {
  const v = vendorOf(key);
  if (v) return (!v.gate || v.gate() === true) ? decodedFrom(key, liveEntry(key)) : null;
  if (!textureReplacementEnabled()) return null;
  return decodedFrom(key, liveEntry(key));
}

export function decodedTextureTopDown(archive, record, frame = 0, map = 'Albedo', dye = null) {
  const d = decodedTexture(archive, record, frame, map, dye);
  return d ? { width: d.width, height: d.height, rgba: topDownRgba(d) } : null;
}

export const decodedTextureCount = () => _decoded.size;
export function decodedTextureBytes() {
  let n = 0;
  for (const c of _decoded.values()) n += c?.colors?.byteLength ?? 0;
  return n;
}
