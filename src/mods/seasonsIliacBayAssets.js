import { readUnityBundle } from '../formats/unityBundle.js';
import { toColor32 } from '../formats/color32Order.js';
import { decodePng } from '../render/textureReplacement.js';
import { SEASONS_MOD, PREFIX_FOLDER, filesForPrefix } from './seasonsIliacBay.js';

export const DFMOD_KEY_PREFIX = 'dfmod/';
export const LOOSE_KEY_PREFIX = 'Seasons of the Iliac Bay/';

const FOLDERS = new Set(Object.values(PREFIX_FOLDER).map((f) => f.toLowerCase()));
const isPng = (name) => /\.png$/i.test(name);
export const SEASONS_DFMOD = 'seasons of the iliac bay.dfmod';
const isSeasonsDfmod = (name) => /\.dfmod$/i.test(name) && /season/i.test(name);

export function seasonsAssetKey(relativePath) {
  const path = String(relativePath ?? '').replace(/\\/g, '/');
  const parts = path.split('/').filter(Boolean);
  const base = parts[parts.length - 1] ?? '';
  if (isSeasonsDfmod(base)) return DFMOD_KEY_PREFIX + base.toLowerCase();
  if (!isPng(base)) return null;
  for (let i = parts.length - 2; i >= 0; i--) {
    const seg = parts[i];
    if (FOLDERS.has(seg.toLowerCase())) return `${LOOSE_KEY_PREFIX}${seg}/${base}`;
  }
  return null;
}


let _names = [];
let _load = null;
let _bundles = new Map();
let _seasonsBundle = null;

export function setSeasonsSources(fileNames, load) {
  const names = (fileNames ?? []).filter((n) => (n.startsWith(DFMOD_KEY_PREFIX) && isSeasonsDfmod(n.slice(DFMOD_KEY_PREFIX.length))) || n.startsWith(LOOSE_KEY_PREFIX));
  const loader = typeof load === 'function' ? load : null;
  const same = loader === _load && names.length === _names.length && names.every((n, i) => n === _names[i]);
  _names = names;
  _load = loader;
  if (!same) {
    _bundles = new Map();
    _seasonsBundle = null;
  }
  return _names.length;
}

export const clearSeasonsSources = () => setSeasonsSources([], null);

export const seasonsSourcesCount = () => _names.length;

async function openBundle(name) {
  if (!_bundles.has(name)) {
    _bundles.set(name, (async () => {
      try {
        const bytes = await _load(name);
        if (!bytes || !bytes.byteLength) return null;
        return readUnityBundle(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
      } catch (e) {
        console.warn(`[seasons] ${name} would not open:`, e?.message ?? e);
        return null;
      }
    })());
  }
  return _bundles.get(name);
}

export function bundleManifest(bundle) {
  for (const t of bundle?.textAssets ?? []) {
    if (!/\.dfmod$/i.test(t.name)) continue;
    try { return JSON.parse(t.text); } catch { }
  }
  return null;
}

async function seasonsBundle() {
  if (!_seasonsBundle) {
    _seasonsBundle = (async () => {
      if (!_load) return null;
      for (const name of _names) {
        if (!name.startsWith(DFMOD_KEY_PREFIX)) continue;
        const bundle = await openBundle(name);
        if (!bundle) continue;
        const manifest = bundleManifest(bundle);
        if (!manifest) continue;
        if (manifest.GUID === SEASONS_MOD.guid || manifest.ModTitle === SEASONS_MOD.title) {
          if (manifest.ModVersion && String(manifest.ModVersion) !== SEASONS_MOD.version) console.warn(`[seasons] the bundle is ${manifest.ModTitle} ${manifest.ModVersion}; the port is ${SEASONS_MOD.version}'s script - a later version may do what this one does not`);
          return { bundle, manifest, files: manifest.Files ?? [] };
        }
      }
      return null;
    })();
  }
  return _seasonsBundle;
}


export async function loadSeasonsTextures(prefix, { decode = decodePng } = {}) {
  const out = [];
  const b = await seasonsBundle();
  if (b) {
    const byName = new Map(b.bundle.textures.map((t) => [t.name, t]));
    for (const file of filesForPrefix(b.files, prefix)) {
      const base = file.slice(file.lastIndexOf('/') + 1);
      const stem = base.replace(/\.[^.]*$/, '');
      const tex = byName.get(stem);
      if (!tex) { console.warn(`LoadTexturesFromMod: failed to load asset ${base}`); continue; }
      try {
        // Color32 order: row 0 is the picture's bottom row, as the hosts upload it.
        const image = toColor32(tex.rgba());
        out.push({ name: base, width: image.width, height: image.height, image });
      } catch (e) {
        console.warn(`[seasons] ${base} would not decode:`, e?.message ?? e);
      }
    }
    return out;
  }
  if (!_load) return out;
  const loose = _names.filter((n) => n.startsWith(LOOSE_KEY_PREFIX));
  for (const name of filesForPrefix(loose, prefix)) {
    const base = name.slice(name.lastIndexOf('/') + 1);
    try {
      const bytes = await _load(name);
      if (!bytes || !bytes.byteLength) continue;
      const image = toColor32(await decode(bytes));
      out.push({ name: base, width: image.width, height: image.height, image });
    } catch (e) {
      console.warn(`[seasons] ${base} would not decode:`, e?.message ?? e);
    }
  }
  return out;
}

export async function seasonsInstalled() {
  if (!_names.length) return false;
  if (await seasonsBundle()) return true;
  return _names.some((n) => n.startsWith(LOOSE_KEY_PREFIX));
}
