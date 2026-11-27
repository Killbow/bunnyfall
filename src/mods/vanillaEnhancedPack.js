import pack from '../../vendor/vanilla-enhanced/vanilla-enhanced.index.json' with { type: 'json' };
import sandsPack from '../../vendor/sands-of-the-alikr/sands-of-the-alikr.index.json' with { type: 'json' };
import snowfallPack from '../../vendor/snowfall/snowfall.index.json' with { type: 'json' };
import { setShippedDfmods } from './dfmodTextures.js';
import { decodePng, PRELOAD_CONCURRENCY } from '../render/textureReplacement.js';
import { resampleRgba, mipFitSize } from '../formats/resample.js';
import { APP_ROOT } from '../platform/appRoot.js';

export const VE_PACK_SOURCE = Object.freeze({ repo: pack.Source, commit: pack.Commit });
export const VE_PACK_MODS = Object.freeze(pack.Mods.map((m) => Object.freeze({ ...m })));

export const ON_BY_DEFAULT = Object.freeze(new Set(['base']));

const fetchBytes = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
};
let _fetch = fetchBytes;
let _decode = decodePng;
const defaultWorker = () => new Worker(new URL('./vanillaEnhancedDecodeWorker.js', import.meta.url), { type: 'module' });
let _makeWorker = defaultWorker;
export function _setVePackIoForTests({ fetch = null, decode = null, worker = null } = {}) {
  _fetch = fetch ?? fetchBytes; _decode = decode ?? decodePng;
  _makeWorker = worker ?? (fetch || decode ? null : defaultWorker);
  _workers = null;
  _shared.clear(); _sharedBytes = 0;
}

const DECODE_WORKERS = 2;
let _workers = null;
let _nextAsk = 1, _turn = 0;
function decodeWorkers() {
  if (_workers !== null) return _workers;
  if (!_makeWorker || (_makeWorker === defaultWorker && typeof Worker === 'undefined')) return false;
  try {
    _workers = Array.from({ length: DECODE_WORKERS }, () => {
      const lane = { w: _makeWorker(), pending: new Map(), dead: false };
      lane.w.onmessage = (ev) => {
        const m = ev.data ?? {};
        const p = lane.pending.get(m.id);
        if (!p) return;
        lane.pending.delete(m.id);
        if (m.error) p.reject(Object.assign(new Error(m.error), { unsupported: m.unsupported === true }));
        else p.resolve({ img: { width: m.width, height: m.height, data: m.data }, native: m.native ?? [m.width, m.height] });
      };
      lane.w.onerror = (e) => {
        lane.dead = true;
        for (const p of lane.pending.values()) p.reject(Object.assign(new Error(e?.message ?? 'decode worker failed'), { unsupported: true }));
        lane.pending.clear();
      };
      return lane;
    });
  } catch { _workers = false; }
  return _workers;
}
const askWorker = (lanes, url, maxSize) => new Promise((resolve, reject) => {
  const live = lanes.filter((l) => !l.dead);
  if (!live.length) { reject(Object.assign(new Error('no decode worker is alive'), { unsupported: true })); return; }
  const lane = live[_turn++ % live.length];
  const id = _nextAsk++;
  lane.pending.set(id, { resolve, reject });
  try { lane.w.postMessage({ id, url, maxSize }); } catch (e) { lane.pending.delete(id); reject(Object.assign(e, { unsupported: true })); }
});
const SHARED_BYTES = 32 * 1024 * 1024;
const SHARED_MS = 10000;
const _shared = new Map();
let _sharedBytes = 0;
const dropShared = (url, e) => { if (_shared.get(url) !== e) return; _shared.delete(url); _sharedBytes -= e.bytes; };
function shareDecode(url, maxSize) {
  const was = _shared.get(url);
  if (was) dropShared(url, was);
  const e = { decoded: null, bytes: 0 };
  e.decoded = decodeShippedNow(url, maxSize).then((d) => {
    if (_shared.get(url) !== e) return d;
    e.bytes = d.img?.data?.byteLength ?? 0; _sharedBytes += e.bytes;
    setTimeout(() => dropShared(url, e), SHARED_MS)?.unref?.();
    for (const [k, o] of _shared) { if (_sharedBytes <= SHARED_BYTES) break; if (o.bytes) dropShared(k, o); }
    return d;
  }, (err) => { dropShared(url, e); throw err; });
  _shared.set(url, e);
  return e.decoded;
}
const fitsAs = ({ img, native }, maxSize) => { const [w, h] = mipFitSize(native[0], native[1], maxSize); return w === img.width && h === img.height; };
async function decodeShipped(path, maxSize = Infinity, root = pack.Root) {
  const url = vePackUrl(path, undefined, root);
  const hit = _shared.get(url);
  if (hit) {
    _shared.delete(url); _shared.set(url, hit);
    const d = await hit.decoded.catch(() => null);
    if (d && fitsAs(d, maxSize)) return d.img;
  }
  return (await shareDecode(url, maxSize)).img;
}
/** @returns {Promise<{ img: { width: number, height: number, data: Uint8Array }, native: number[] }>} */
async function decodeShippedNow(url, maxSize) {
  const lanes = decodeWorkers();
  if (lanes) {
    try { return await askWorker(lanes, url, maxSize); } catch (e) {
      if (!e?.unsupported) throw e;
      for (const l of lanes) { try { l.w.terminate(); } catch { } }
      _workers = false;
    }
  }
  const img = await _decode(await _fetch(url));
  const [w, h] = mipFitSize(img.width, img.height, maxSize);
  return { img: w === img.width && h === img.height ? img : resampleRgba(img, w, h), native: [img.width, img.height] };
}

export const vePackUrl = (path, root = APP_ROOT ?? globalThis.document?.baseURI ?? 'http://localhost/', packRoot = pack.Root) =>
  new URL(`${packRoot}/${path.split('/').map(encodeURIComponent).join('/')}`, root).href;

export function vePackClient(mod) {
  const root = mod.root ?? pack.Root;
  const files = new Map(mod.index.textures.map(([name]) => [name, `${mod.dir === '.' ? '' : `${mod.dir}/`}${name}.png`]));
  const picture = (path) => decodeShipped(path, Infinity, root);
  return {
    async rgba(name, { maxSize = Infinity } = {}) {
      const path = files.get(name);
      if (!path) throw new Error(`${mod.index.title} carries no ${name}`);
      return decodeShipped(path, maxSize, root);
    },
    async layers(name) {
      const paths = mod.slices?.[name] ?? [];
      if (!paths.length) throw new Error(`${mod.index.title}: ${name} carries no slices`);
      const out = new Array(paths.length);
      let next = 0;
      const one = (i) => picture(paths[i]).catch((e) => { console.warn(`[vanilla-enhanced] ${paths[i]} would not load:`, e?.message ?? e); return null; });
      const lane = async () => { while (next < paths.length) { const i = next++; out[i] = await one(i); } };
      await Promise.all(Array.from({ length: Math.min(PRELOAD_CONCURRENCY, paths.length) }, lane));
      return out;
    },
    close() {},
  };
}

export const ENVIRONMENT_PACK_MODS = Object.freeze([sandsPack, snowfallPack].flatMap((p) => p.Mods.map((m) => Object.freeze({ ...m, root: p.Root }))));
const SHIPPED = Object.freeze([
  ...VE_PACK_MODS.map((m) => Object.freeze({ key: m.key, index: m.index, open: () => vePackClient(m), on: ON_BY_DEFAULT.has(m.dir) })),
  ...ENVIRONMENT_PACK_MODS.map((m) => Object.freeze({ key: m.key, index: m.index, open: () => vePackClient(m), on: true })),
]);
export const installVanillaEnhancedPack = () => setShippedDfmods(SHIPPED);
