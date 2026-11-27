// Texture mods for Daggerfall Unity (`.dfmod`) attached by the player. A bundle is read by range in its worker,
// and the load order follows DFU's AutoSortMods.

import { openUnityBundle } from '../formats/unityBundleClient.js';
import { createBundlePool } from '../formats/unityBundlePool.js';
import { resampleRgba } from '../formats/resample.js';
import { textureEntry, textureKey, setBundleTextures, textureReplacementEnabled, looseTextureExists, looseTextureBytes, looseTextureGeneration, decodePng, PRELOAD_CONCURRENCY, studioRecordsOf, preloadTextureRecord, textureTierEpoch } from '../render/textureReplacement.js';
import { toColor32 } from '../formats/color32Order.js';
import { registerBillboardXml, unregisterBillboardXml } from '../world/billboardXml.js';
import { getPref, setPref } from '../ui/uiPrefs.js';
import { setSnowlessGround } from '../world/climateSwaps.js';

export const DFMOD_PREFIX = 'dfmod/';
export const DFMOD_INDEX_PREFIX = 'dfmod-index/';
export const DFMOD_INDEX_VERSION = 3;

export const DFMOD_DETAIL = Object.freeze([256, 512, 1024, 0]);
export const DFMOD_DETAIL_DEFAULT = 256;
let _detail = () => DFMOD_DETAIL_DEFAULT;
export function setDfmodDetailSource(fn) { _detail = typeof fn === 'function' ? fn : () => DFMOD_DETAIL_DEFAULT; }
export const dfmodMaxSize = () => {
  const v = _detail();
  const d = v == null || v === '' || !Number.isFinite(Number(v)) ? DFMOD_DETAIL_DEFAULT : Number(v);
  return d > 0 ? d : Infinity;
};
const maxSize = dfmodMaxSize;
export const OPEN_WAIT_MS = 20000;
export const ASK_DEADLINE_MS = 15000;
let _pool = null;
const poolOpen = (src, opts) => {
  if (typeof Worker === 'undefined') return openUnityBundle(src, opts);
  _pool ??= createBundlePool({ size: 2 });
  return _pool.open(src, opts);
};

export const dfmodStoreKey = (fileName) => {
  const base = String(fileName ?? '').replace(/\\/g, '/').split('/').pop();
  return /\.dfmod$/i.test(base) ? DFMOD_PREFIX + base.toLowerCase() : null;
};
export const dfmodIndexKey = (storeKey) => DFMOD_INDEX_PREFIX + String(storeKey).slice(DFMOD_PREFIX.length);

export const hasOwnDoor = (storeKey) => /season|weapon.?widget/i.test(String(storeKey)) || isOriginalDiverseWeapons(storeKey);
export const isOriginalDiverseWeapons = (storeKey) => /diverse.?weapons/i.test(String(storeKey)) && !/\bhd\b/i.test(String(storeKey));
export const WEAPON_FRAME_MIN_SIZE = 512;

const USED_MAPS = new Set(['Albedo', 'Mask']);
const isItemArchive = (a) => a >= 233 && a <= 252;

export function xmlRect(text) {
  const m = /<rect\s+scale="([\d.]+)"\s*>[\s\S]*?<x>(-?[\d.]+)<\/x>\s*<y>(-?[\d.]+)<\/y>\s*<width>(-?[\d.]+)<\/width>\s*<height>(-?[\d.]+)<\/height>/.exec(text);
  if (!m) return null;
  const s = Number(m[1]) || 1;
  return { x: Number(m[2]) / s, y: Number(m[3]) / s, width: Number(m[4]) / s, height: Number(m[5]) / s };
}
export function xmlScale(text) {
  const x = /<scaleX>\s*(-?[\d.]+)\s*<\/scaleX>/.exec(text);
  const y = /<scaleY>\s*(-?[\d.]+)\s*<\/scaleY>/.exec(text);
  if (!x && !y) return null;
  return [x ? Number(x[1]) : 1, y ? Number(y[1]) : 1];
}

function manifestOf(bundle) {
  for (const t of bundle?.textAssets ?? []) {
    if (!/\.dfmod$/i.test(t.name)) continue;
    try { return JSON.parse(t.text); } catch { }
  }
  return null;
}

export function buildDfmodIndex(bundle) {
  const manifest = manifestOf(bundle) ?? {};
  const xml = {};
  for (const t of bundle.textAssets ?? []) {
    if (/\.dfmod$/i.test(t.name)) continue;
    let text;
    try { text = t.text; } catch { continue; }
    if (/<info>/i.test(text) && (/<scale[XY]>/i.test(text) || /<rect/i.test(text))) xml[t.name] = text;
  }
  return {
    v: DFMOD_INDEX_VERSION,
    title: manifest.ModTitle ?? null, version: manifest.ModVersion ?? null, author: manifest.ModAuthor ?? null, guid: manifest.GUID ?? null,
    deps: manifestDeps(manifest),
    textures: (bundle.textures ?? []).map((t) => [t.name, t.width, t.height]),
    arrays: (bundle.arrays ?? []).map((a) => [a.name, a.width, a.height, a.depth]),
    xml,
  };
}

export function manifestDeps(manifest) {
  const deps = Array.isArray(manifest?.Dependencies) ? manifest.Dependencies : [];
  return deps.filter((d) => typeof d?.Name === 'string' && d.Name).map((d) => [d.Name, d.IsOptional === true, d.IsPeer === true]);
}


export const dfmodFileName = (key) => String(key ?? '').slice(DFMOD_PREFIX.length).replace(/\.dfmod$/i, '');

export function dfmodLoadOrder(mods) {
  const base = [...(mods ?? [])].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const byName = new Map(base.map((m) => [dfmodFileName(m.key), m]));
  const depsOf = (m) => (m.index?.deps ?? []).filter(([, , peer]) => !peer).map(([name]) => byName.get(String(name).toLowerCase())).filter(Boolean);
  const sorted = [];
  const visited = new Set();
  const visit = (m) => {
    if (!visited.has(m)) {
      visited.add(m);
      for (const d of depsOf(m)) visit(d);
      sorted.push(m);
    } else if (!sorted.includes(m)) throw new Error('Cyclic dependency found');
  };
  try {
    for (const m of base) visit(m);
    return sorted;
  } catch (e) {
    console.warn(`[dfmod] the attached mods could not be sorted by their dependencies (${e?.message ?? e}) - they load by file name`);
    return base;
  }
}

export const DFMOD_OFF_PREF = 'dfmodOff';
const offKeys = () => { const v = getPref(DFMOD_OFF_PREF); return Array.isArray(v) ? v.filter((k) => typeof k === 'string') : []; };
export const DFMOD_SHIPPED_PREF = 'dfmodShipped';
const shippedChoices = () => { const v = getPref(DFMOD_SHIPPED_PREF); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
const switchKeyOf = (key) => _shadowOf.get(key) ?? key;
const shippedOf = (key) => _shipped.find((s) => s.key === key) ?? null;
export const dfmodEnabled = (key) => {
  const k = switchKeyOf(key);
  const shipped = shippedOf(k);
  if (!shipped) return !offKeys().includes(k);
  const choice = shippedChoices()[k];
  return typeof choice === 'boolean' ? choice : shipped.on === true;
};

export async function indexDfmodBytes(bytes, { open = openUnityBundle } = {}) {
  const isBlob = typeof Blob !== 'undefined' && bytes instanceof Blob;
  const bundle = await open(isBlob || bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  try { return buildDfmodIndex(bundle); } finally { try { bundle.close?.(); } catch { } }
}


let _mods = [];
let _prio = [];
let _open = new Map();
let _openErrors = new Map();
let _img = new Map();
let _cifRci = new Map();
let _load = null;
let _loadBlob = null;
let _opener = poolOpen;
let _generation = 0;
let _reads = 0;
let _sig = null;
let _sigParts = new Map();
let _registered = null;
let _warmedGen = -1;
let _shippedSrc = null;
let _shipped = [];
let _attached = [];
let _unregistered = new Map();
let _shippedLive = new Set();
let _shadowOf = new Map();

const sameMod = (s, m) => s.key === m.key || (!!s.index?.title && s.index.title === m.index?.title);
function liveShipped() {
  _shadowOf = new Map();
  for (const m of _attached) { const s = _shipped.find((x) => sameMod(x, m)); if (s) _shadowOf.set(m.key, s.key); }
  const shadowed = new Set(_shadowOf.values());
  _shippedLive = new Set(_shipped.filter((s) => !shadowed.has(s.key)).map((s) => s.key));
  return _shipped.filter((s) => _shippedLive.has(s.key)).map(({ key, index, stamp }) => ({ key, index, stamp: `s:${stamp ?? index.version ?? ''}` }));
}

const NO_MODS = /[?&]nomods\b/;
export const noModsPage = (search = globalThis.location?.search ?? '') => NO_MODS.test(search);

function fingerprint(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${text.length}:${h.toString(16)}`;
}

function forgetOpen() {
  for (const p of _open.values()) p.then((b) => b?.close?.()).catch(() => null);
  _open = new Map();
  _openErrors = new Map();
}

const knownOf = (key) => _mods.find((m) => m.key === key)?.index?.textures ?? null;

function bundleFor(key) {
  if (!_open.has(key)) {
    const shipped = _shippedLive.has(key) ? _shipped.find((s) => s.key === key) : null;
    _open.set(key, (async () => {
      if (shipped) return shipped.open();
      if (_loadBlob) {
        const blob = await _loadBlob(key);
        if (blob?.size) return _opener(blob, { maxTextureSize: maxSize(), knownTextures: knownOf(key) });
      }
      if (!_load) return null;
      const bytes = await _load(key);
      if (!bytes || !bytes.byteLength) return null;
      return _opener(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), { maxTextureSize: maxSize(), knownTextures: knownOf(key) });
    })().catch((e) => {
      console.warn(`[dfmod] ${key} would not open:`, e?.message ?? e);
      _openErrors.set(key, openWords(e));
      return null;
    }));
  }
  return _open.get(key);
}

async function bundleImage(key, name, { floor = 0 } = {}) {
  let timer;
  const waited = new Promise((res) => { timer = setTimeout(() => res(null), OPEN_WAIT_MS); });
  const b = await Promise.race([bundleFor(key), waited]);
  clearTimeout(timer);
  if (!b) return null;
  try { return await b.rgba(name, { maxSize: Math.max(maxSize(), floor), deadline: Date.now() + ASK_DEADLINE_MS }); } catch (e) { console.warn(`[dfmod] ${name} would not decode:`, e?.message ?? e); return null; }
}

async function readIndex(key, load) {
  try {
    const bytes = await load(dfmodIndexKey(key));
    if (!bytes || !bytes.byteLength) return null;
    const text = new TextDecoder().decode(bytes);
    const idx = JSON.parse(text);
    if (idx?.v === DFMOD_INDEX_VERSION) return { index: idx, fp: fingerprint(text), stale: false };
    if (idx?.v === 2) return { index: { ...idx, deps: [] }, fp: fingerprint(text), stale: true };
    return null;
  } catch { return null; }
}
const openWords = (e) => (e?.name === 'NotReadableError' || /could not be read/i.test(e?.message ?? '')
  ? 'the browser could not read the stored file; remove it and add it again'
  : /allocation failed|out of memory/i.test(e?.message ?? '') ? 'ran out of memory; lower Texture detail or attach fewer mods'
    : String(e?.message ?? e));

export async function setDfmodSources(fileNames, load, { saveIndex = null, open = null, loadBlob = null, background = true, warm = false } = {}) {
  const stored = (fileNames ?? []).filter((n) => typeof n === 'string' && n.startsWith(DFMOD_PREFIX) && /\.dfmod$/i.test(n) && !hasOwnDoor(n)).sort();
  const noMods = noModsPage();
  const names = noMods ? [] : stored;
  const ticket = ++_reads;
  const reads = [];
  for (const key of names) {
    if (typeof load !== 'function') break;
    reads.push([key, await readIndex(key, load)]);
    if (ticket !== _reads) return 0;
  }
  const parts = new Map(reads.map(([key, r]) => [key, r ? r.fp : 'missing']));
  const sig = [...stored.map((k) => `${k}=${noMods ? 'nomods' : parts.get(k) ?? 'missing'}`)].join('\n');
  if (sig === _sig && load === _load && _registered !== null) {
    if (warm) warmOpen(_generation);
    return _registered;
  }
  const gen = ++_generation;
  _load = typeof load === 'function' ? load : null;
  _loadBlob = typeof loadBlob === 'function' ? loadBlob : null;
  if (open) _opener = open;
  forgetOpen();
  _attached = reads.filter(([, r]) => r).map(([key, r]) => ({ key, index: r.index, stamp: `a:${r.fp}` }));
  _unregistered = new Map([
    ...stored.filter(() => noMods).map((k) => [k, { state: 'nomods', error: null }]),
    ...reads.filter(([, r]) => !r).map(([k]) => [k, { state: 'indexing', error: null }]),
  ]);
  _mods = dfmodLoadOrder([..._attached, ...liveShipped()]);
  _sig = sig; _sigParts = parts;
  _registered = install();
  const todo = reads.filter(([, r]) => !r || r.stale).map(([key]) => key);
  const indexMissing = async () => {
    for (const key of todo) {
      let index = null, why = null;
      try {
        const src = (_loadBlob && await _loadBlob(key)) || await _load(key);
        if (src && (src.size || src.byteLength)) index = await indexDfmodBytes(src, { open: _opener === poolOpen ? openUnityBundle : _opener });
        else why = new Error('nothing stored to read');
        if (index && saveIndex) {
          const text = JSON.stringify(index);
          if (await saveIndex(dfmodIndexKey(key), text).then(() => true, () => false) && gen === _generation) {
            _sigParts.set(key, fingerprint(text));
            _sig = stored.map((k) => `${k}=${_sigParts.get(k) ?? 'missing'}`).join('\n');
          }
        }
      } catch (e) { why = e; console.warn(`[dfmod] ${key} could not be indexed:`, e?.message ?? e); }
      if (gen !== _generation) return;
      if (index) {
        const text = JSON.stringify(index);
        _attached = [..._attached.filter((m) => m.key !== key), { key, index, stamp: `a:${fingerprint(text)}` }];
        _unregistered.delete(key);
        _mods = dfmodLoadOrder([..._attached, ...liveShipped()]);
        _registered = install();
      } else if (!_attached.some((m) => m.key === key)) {
        _unregistered.set(key, { state: 'error', error: openWords(why) });
      }
    }
  };
  if (todo.length) { if (background) indexMissing(); else await indexMissing(); }
  if (warm) warmOpen(gen);
  return _registered;
}

function warmOpen(gen) {
  if (_warmedGen === gen) return;
  _warmedGen = gen;
  (async () => { for (const { key } of _mods) { if (gen !== _generation) return; if (dfmodEnabled(key)) await bundleFor(key); } })();
}

function install() {
  const entries = [];
  const table = {};
  _img = new Map(); _cifRci = new Map(); _prio = [];
  const walk = [];
  for (const { key, index, stamp } of [..._mods].reverse()) {
    if (!dfmodEnabled(key)) continue;
    walk.push(`${key}@${stamp ?? ''}`);
    const rects = new Map();
    for (const [name, text] of Object.entries(index.xml ?? {})) {
      const rect = xmlRect(text);
      if (rect) { rects.set(name, rect); rects.set(name.toUpperCase(), rect); }
      const scale = xmlScale(text);
      const e = scale && textureEntry(`${name}.png`);
      if (e && e.map === 'Albedo' && !e.dye) ((table[e.archive] ??= {})[e.record] ??= scale);
    }
    const arrays = new Map();
    for (const [name, , , depth] of index.arrays ?? []) {
      const m = /^(\d+)-TexArray$/i.exec(name);
      if (m && !arrays.has(Number(m[1]))) arrays.set(Number(m[1]), { name, depth });
    }
    const names = new Map();
    for (const [name] of index.textures ?? []) {
      const e = textureEntry(`${name}.png`);
      if (e) {
        if (!USED_MAPS.has(e.map)) continue;
        if (e.map === 'Albedo' && !e.dye && !names.has(textureKey(e.archive, e.record, e.frame))) names.set(textureKey(e.archive, e.record, e.frame), name);
        entries.push({
          archive: e.archive, record: e.record, frame: e.frame, map: e.map, dye: e.dye, fileName: `${key}:${name}`,
          src: `${key}@${stamp ?? ''}:${name}`,
          image: () => bundleImage(key, name), lazy: isItemArchive(e.archive), rect: rects.get(name) ?? null,
        });
        continue;
      }
      const up = name.toUpperCase();
      if (/\.IMG$/.test(up)) { if (!_img.has(up)) _img.set(up, { key, name }); continue; }
      if (/\.(CIF|RCI)_\d+-\d+(_[A-Z]+)?$/.test(up) && !_cifRci.has(up)) _cifRci.set(up, { key, name, rect: rects.get(name) ?? rects.get(up) ?? null });
    }
    _prio.push({ key, names, arrays, looseGround: new Set(index.looseGround ?? []) });
  }
  const n = setBundleTextures(entries);
  if (Object.keys(table).length) registerBillboardXml('dfmod', table); else unregisterBillboardXml('dfmod');
  _dollArt = _img.size > 0 || _cifRci.size > 0 || entries.some((e) => isItemArchive(e.archive));
  const sig = walk.join('|');
  if (sig !== _walkSig) {
    _walkSig = sig;
    _groundCache = new Map();
    _imgCache = new Map();
    _installGen++;
  }
  return n + _img.size + _cifRci.size;
}
let _walkSig = null;
let _dollArt = false;
export const dfmodCarriesDollArt = () => _dollArt;

export function setShippedDfmods(list) {
  if (list === _shippedSrc) return _registered;
  _shippedSrc = list;
  for (const key of _shippedLive) { const p = _open.get(key); if (p) { _open.delete(key); p.then((b) => b?.close?.()).catch(() => null); } }
  _shipped = (list ?? []).filter((s) => typeof s?.key === 'string' && s.key.startsWith(DFMOD_PREFIX) && s.index && typeof s.open === 'function');
  _mods = dfmodLoadOrder([..._attached, ...liveShipped()]);
  _registered = install();
  return _registered;
}

export function clearDfmodSources() {
  _generation++; _reads++;
  _load = null; _sig = null; _sigParts = new Map(); _registered = null; _attached = []; _unregistered = new Map();
  forgetOpen();
  _mods = dfmodLoadOrder(liveShipped());
  install();
}

export function setDfmodEnabled(keys, on) {
  const list = (Array.isArray(keys) ? keys : [keys]).filter((k) => typeof k === 'string');
  const off = new Set(offKeys());
  const choices = { ...shippedChoices() };
  let attached = false, shipped = false;
  for (const key of list) {
    const k = switchKeyOf(key);
    if (shippedOf(k)) { shipped = true; choices[k] = !!on; }
    else { attached = true; if (on) off.delete(k); else off.add(k); }
  }
  let saved = true;
  if (attached) saved = setPref(DFMOD_OFF_PREF, [...off].sort()) && saved;
  if (shipped) saved = setPref(DFMOD_SHIPPED_PREF, choices) && saved;
  if (!on) {
    for (const k of list) {
      const p = _open.get(k);
      if (!p) continue;
      _open.delete(k);
      p.then((b) => b?.close?.()).catch(() => null);
    }
  }
  _registered = install();
  return saved;
}
export function forgetDfmodOff(keys) {
  const drop = new Set((Array.isArray(keys) ? keys : [keys]).filter((k) => typeof k === 'string'));
  const off = offKeys();
  if (off.some((k) => drop.has(k))) setPref(DFMOD_OFF_PREF, off.filter((k) => !drop.has(k)));
}
export function noteDfmodAttached(key, index = null) {
  forgetDfmodOff(key);
  const s = _shipped.find((x) => sameMod(x, { key, index }));
  if (s && shippedChoices()[s.key] !== true) setPref(DFMOD_SHIPPED_PREF, { ...shippedChoices(), [s.key]: true });
}

export const attachedDfmods = () => _mods.map(({ key, index }) => ({
  key, fileName: dfmodFileName(key),
  title: index.title ?? key.slice(DFMOD_PREFIX.length), version: index.version, author: index.author, textures: index.textures?.length ?? 0,
  arrays: index.arrays?.length ?? 0,
  deps: (index.deps ?? []).map(([name]) => String(name).toLowerCase()),
  enabled: dfmodEnabled(key),
  error: _openErrors.get(key) ?? null,
  guid: index.guid ?? null,
  shipped: _shippedLive.has(key),
}));
export const unregisteredDfmods = () => [..._unregistered].map(([key, u]) => ({ key, fileName: dfmodFileName(key), state: u.state, error: u.error ?? null }));


let _imgCache = new Map();
let _installGen = 0;
export const dfmodGeneration = () => _installGen;
const cached = (id, hit, opts) => {
  if (!hit) return Promise.resolve(null);
  if (!_imgCache.has(id)) _imgCache.set(id, bundleImage(hit.key, hit.name, opts));
  return _imgCache.get(id);
};
export const hasDfmodImg = (name) => _img.has(String(name).toUpperCase());
export const hasDfmodCifRci = (file, record, frame = 0) => _cifRci.has(`${String(file).toUpperCase()}_${record}-${frame}`);
export const dfmodImgImage = (name) => cached(`img:${String(name).toUpperCase()}`, _img.get(String(name).toUpperCase()));
export const dfmodCifRciImage = (file, record, frame = 0) => {
  const k = `${String(file).toUpperCase()}_${record}-${frame}`;
  return cached(`cif:${k}`, _cifRci.get(k));
};

export const dfmodCifRciRect = (file, record, frame = 0) => _cifRci.get(`${String(file).toUpperCase()}_${record}-${frame}`)?.rect ?? null;

export const dfmodCifRciNamed = (name) => {
  const k = String(name).toUpperCase();
  return cached(`cif:${k}`, _cifRci.get(k), { floor: WEAPON_FRAME_MIN_SIZE });
};

let _groundCache = new Map();
export const GROUND_CACHE_SETS = 3;

export function groundSource(archive) {
  if (!textureReplacementEnabled()) return null;
  const a = Number(archive);
  if (looseTextureExists(a, 0, 0)) return { kind: 'records' };
  for (const m of _prio) {
    if (m.looseGround.has(a)) return { kind: 'records', pack: m.key };
    const arr = m.arrays.get(a);
    if (arr) return { kind: 'array', key: m.key, name: arr.name, depth: arr.depth };
    if (m.names.has(textureKey(a, 0, 0))) return { kind: 'records' };
  }
  return null;
}
export const SNOWLESS_FILE_NAME = 'vanilla enhanced - snowless swamps and jungles';
export function winterGroundSnowless(archive) {
  const s = groundSource(archive);
  return s?.kind === 'array' && dfmodFileName(s.key) === SNOWLESS_FILE_NAME;
}
setSnowlessGround(winterGroundSnowless);
export const hasDfmodGround = (archive, recordCount = 56) => !!groundSource(archive) || recordOwners(archive, recordCount).some(Boolean);

function recordOwners(archive, recordCount, pack = null) {
  if (!textureReplacementEnabled()) return [];
  const a = Number(archive);
  return Array.from({ length: recordCount }, (_, r) => {
    if (looseTextureExists(a, r, 0)) return { loose: true };
    const k = textureKey(a, r, 0);
    const m = _prio.find((p) => (pack === null || p.key === pack) && p.names.has(k));
    return m ? { key: m.key, name: m.names.get(k) } : null;
  });
}

async function recordPicture(archive, record, owner, decode) {
  try {
    if (owner.loose) {
      const bytes = await looseTextureBytes(archive, record, 0);
      return bytes ? toColor32(await decode(bytes)) : null;
    }
    const b = await bundleFor(owner.key);
    const img = b ? await b.rgba(owner.name, { maxSize: maxSize() }) : null;
    return img ? toColor32(img) : null;
  } catch (e) {
    console.warn(`[dfmod] ground record ${archive}_${record}-0 would not decode:`, e?.message ?? e);
    return null;
  }
}

function classicAt(c, w, h) {
  if (c.width === w && c.height === h) return c;
  const out = resampleRgba({ width: c.width, height: c.height, data: c.colors }, w, h);
  return { width: out.width, height: out.height, colors: out.data };
}

const classicLayer = (tex, r) => tex.getColor32(tex.getDFBitmap(r, 0), 0);

export function dfmodGroundLayers(archive, tex, { decode = decodePng } = {}) {
  const n = tex?.recordCount ?? 0;
  const studio = n ? studioRecordsOf(archive).filter((r) => r < n) : [];
  if (!n || (!textureReplacementEnabled() && !studio.length)) return Promise.resolve(null);
  const id = `${Number(archive)}:${n}:${looseTextureGeneration()}${studio.length ? `:${textureTierEpoch()}` : ''}`;
  const hit = _groundCache.get(id);
  _groundCache.delete(id);
  if (hit) { _groundCache.set(id, hit); return hit; }
  for (const k of _groundCache.keys()) if (k.startsWith(`${Number(archive)}:`)) _groundCache.delete(k);
  const answer = groundLayers(Number(archive), tex, decode).then((set) => (studio.length ? studioGround(Number(archive), tex, set, studio, decode) : set)).then(({ layers, whole }) => {
    if (!whole && _groundCache.get(id) === answer) _groundCache.delete(id);
    return layers;
  });
  _groundCache.set(id, answer);
  while (_groundCache.size > GROUND_CACHE_SETS) _groundCache.delete(_groundCache.keys().next().value);
  return _groundCache.get(id);
}

async function groundLayers(archive, tex, decode) {
  const n = tex.recordCount;
  const src = groundSource(archive);
  if (src?.kind === 'array') {
    if (src.depth === n) {
      const b = await bundleFor(src.key);
      if (b?.layers) {
        try {
          const imgs = await b.layers(src.name);
          const first = imgs?.find(Boolean);
          if (imgs?.length === n && first && imgs.every((i) => !i || (i.width === first.width && i.height === first.height))) {
            return { layers: imgs.map((i, r) => (i ? toColor32(i) : classicAt(classicLayer(tex, r), first.width, first.height))), whole: imgs.every(Boolean) };
          }
        } catch (e) { console.warn(`[dfmod] ${src.name} would not decode:`, e?.message ?? e); return { layers: null, whole: false }; }
      }
      return { layers: null, whole: !!b?.layers };
    }
    console.warn(`[dfmod] ${src.name}: expected depth ${n} but got ${src.depth} - the records are sought instead`);
  }
  const owners = recordOwners(archive, n, src?.pack ?? null);
  if (!owners.some(Boolean)) return { layers: null, whole: true };
  const pics = new Array(n).fill(null);
  let next = 0;
  const lane = async () => { while (next < n) { const r = next++; if (owners[r]) pics[r] = await recordPicture(archive, r, owners[r], decode); } };
  await Promise.all(Array.from({ length: Math.min(PRELOAD_CONCURRENCY, n) }, lane));
  const whole = owners.every((o, r) => !o || !!pics[r]);
  if (!pics.some(Boolean)) return { layers: null, whole };
  const size = pics[0] ?? classicLayer(tex, 0);
  return { layers: pics.map((p, r) => (p && p.width === size.width && p.height === size.height ? p : classicAt(classicLayer(tex, r), size.width, size.height))), whole };
}

async function studioGround(archive, tex, { layers, whole }, records, decode) {
  const pics = await Promise.all(records.map((r) => preloadTextureRecord(archive, r, 0, 'Albedo', null, { decode })));
  if (!pics.some(Boolean)) return { layers, whole: false };
  const base = layers ?? Array.from({ length: tex.recordCount }, (_, r) => classicLayer(tex, r));
  let { width, height } = base[0];
  for (const p of pics) if (p && p.width * p.height > width * height) ({ width, height } = p);
  const out = base.map((l) => classicAt(l, width, height));
  records.forEach((r, k) => { if (pics[k]) out[r] = classicAt(pics[k], width, height); });
  return { layers: out, whole: whole && pics.every(Boolean) };
}

export { resampleRgba };

export function _resetDfmodForTests() { _shippedSrc = null; _shipped = []; clearDfmodSources(); _opener = poolOpen; _warmedGen = -1; }
