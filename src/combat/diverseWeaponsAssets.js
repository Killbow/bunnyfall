import { openUnityBundle } from '../formats/unityBundleClient.js';
import { toScreenOrder } from '../formats/color32Order.js';
import { decodePng } from '../render/textureReplacement.js';
import { DFMOD_KEY_PREFIX } from '../mods/seasonsIliacBayAssets.js';
import { weaponWidgetImage } from './weaponWidgetAssets.js';
import { dfmodCifRciNamed } from '../mods/dfmodTextures.js';
import { APP_ROOT } from '../platform/appRoot.js';
import { DIVERSE_WEAPONS_STEMS, DIVERSE_WEAPONS_METALS, DIVERSE_WEAPONS_BARE, DIVERSE_WEAPONS_ODD } from './diverseWeaponsIndex.js';

export const DIVERSE_WEAPONS_MOD = Object.freeze({
  guid: '8e83d67c-a0ac-4935-a8c5-6b18c9f35bfc',
  title: 'Diverse Weapons',
  version: '1.7.3',
  author: 'RealAKP',
});

// The HD replacers are plain texture mods read by the generic texture path, so this skips them.
const isDiverseDfmod = (name) => /\.dfmod$/i.test(name) && /diverse.?weapons/i.test(name.slice(name.lastIndexOf('/') + 1)) && !/\bhd\b/i.test(name.slice(name.lastIndexOf('/') + 1));
const isPng = (name) => /\.png$/i.test(name);
const isDiversePng = (name) => {
  const base = name.slice(name.lastIndexOf('/') + 1);
  return /^(w_)?[A-Z0-9]+\.CIF_\d+-\d+(_[A-Za-z]+)?\.png$/i.test(base) || /^\d{3}_\d+-\d+_[A-Za-z]+\.png$/i.test(base);
};

// The sprites live under public/ because a bundler URL glob over this many files would build a huge map.
export const SHIPPED_DIR = 'public/art/diverse-weapons';

export function hasDiverseWeaponsSprite(name) {
  if (typeof name !== 'string') return false;
  const m = /^(.*?_\d+-\d+)(?:_([A-Za-z]+))?$/.exec(name);
  if (!m) return DIVERSE_WEAPONS_ODD.includes(name);
  const bits = DIVERSE_WEAPONS_STEMS[m[1]];
  if (!bits) return DIVERSE_WEAPONS_ODD.includes(name);
  if (m[2] === undefined) return (bits & DIVERSE_WEAPONS_BARE) !== 0;
  const i = DIVERSE_WEAPONS_METALS.indexOf(m[2]);
  return i >= 0 ? (bits & (1 << i)) !== 0 : DIVERSE_WEAPONS_ODD.includes(name);
}

export const DIVERSE_WEAPONS_SPRITE_COUNT = Object.values(DIVERSE_WEAPONS_STEMS).reduce((n, b) => n + (b.toString(2).split('1').length - 1), 0) + DIVERSE_WEAPONS_ODD.length;

export const diverseWeaponsSpriteUrl = (name, root = APP_ROOT ?? globalThis.document?.baseURI ?? 'http://localhost/') =>
  new URL(`art/diverse-weapons/${encodeURIComponent(name)}.png`, root).href;

let _names = [];
let _load = null;
let _bundle = null;
let _images = new Map();
let _workerFactory = null;

export function setDiverseWeaponsSources(fileNames, load, { workerFactory = null } = {}) {
  const names = (fileNames ?? []).filter((n) => (n.startsWith(DFMOD_KEY_PREFIX) && isDiverseDfmod(n)) || (isPng(n) && isDiversePng(n)));
  const loader = typeof load === 'function' ? load : null;
  const same = loader === _load && names.length === _names.length && names.every((n, i) => n === _names[i]) && workerFactory === _workerFactory;
  _names = names;
  _load = loader;
  _workerFactory = workerFactory;
  if (!same) forgetBundle();
  return _names.length;
}
function forgetBundle() {
  const old = _bundle;
  _bundle = null; _images = new Map();
  old?.then((b) => b?.bundle.close()).catch(() => null);
}
export const clearDiverseWeaponsSources = () => setDiverseWeaponsSources([], null);
export const diverseWeaponsSourcesCount = () => _names.length;

function manifestOf(bundle) {
  for (const t of bundle?.textAssets ?? []) {
    if (!/\.dfmod$/i.test(t.name)) continue;
    try { return JSON.parse(t.text); } catch { }
  }
  return null;
}

export async function diverseWeaponsBundle() {
  if (!_bundle) {
    _bundle = (async () => {
      if (!_load) return null;
      for (const name of _names) {
        if (!name.startsWith(DFMOD_KEY_PREFIX)) continue;
        try {
          const bytes = await _load(name);
          if (!bytes || !bytes.byteLength) continue;
          const bundle = await openUnityBundle(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), { workerFactory: _workerFactory });
          const manifest = manifestOf(bundle);
          if (!manifest) { bundle.close(); continue; }
          if (manifest.GUID === DIVERSE_WEAPONS_MOD.guid || manifest.ModTitle === DIVERSE_WEAPONS_MOD.title) {
            if (manifest.ModVersion && String(manifest.ModVersion) !== DIVERSE_WEAPONS_MOD.version) console.warn(`[diverse weapons] the bundle is ${manifest.ModTitle} ${manifest.ModVersion}; the port carries ${DIVERSE_WEAPONS_MOD.version}'s script`);
            const byName = new Map();
            for (const t of bundle.textures ?? []) if (!byName.has(t.name)) byName.set(t.name, t);
            return { bundle, manifest, byName };
          }
          bundle.close();
        } catch (e) {
          console.warn(`[diverse weapons] ${name} would not open:`, e?.message ?? e);
        }
      }
      return null;
    })();
  }
  return _bundle;
}

export async function diverseWeaponsTexturesAttached() { return !!(await diverseWeaponsBundle()); }

export function diverseWeaponsImage(name, { decode = decodePng, fetchFn = globalThis.fetch } = {}) {
  if (!_images.has(name)) {
    _images.set(name, (async () => {
      const attached = _names.length ? await attachedImage(name, decode) : null;
      if (attached) return attached;
      if (!hasDiverseWeaponsSprite(name) || typeof fetchFn !== 'function') return null;
      try {
        const res = await fetchFn(diverseWeaponsSpriteUrl(name));
        if (!res?.ok) { console.warn(`[diverse weapons] ${name}.png is in the index and not on the site (${res?.status})`); return null; }
        return toScreenOrder(await decode(new Uint8Array(await res.arrayBuffer())));
      } catch (e) {
        console.warn(`[diverse weapons] ${name} would not load:`, e?.message ?? e);
        return null;
      }
    })());
  }
  return _images.get(name);
}

async function attachedImage(name, decode) {
  const b = await diverseWeaponsBundle();
  if (b?.byName.has(name)) {
    // The bundle reader already returns rows top-first like a decoded PNG, so neither path flips them.
    try { const img = await b.bundle.rgba(name); if (img) return toScreenOrder(img); } catch (e) { console.warn(`[diverse weapons] ${name} would not decode:`, e?.message ?? e); }
  }
  if (!_load) return null;
  const loose = _names.find((n) => isPng(n) && n.slice(n.lastIndexOf('/') + 1).replace(/\.png$/i, '') === name);
  if (!loose) return null;
  try {
    const bytes = await _load(loose);
    if (!bytes || !bytes.byteLength) return null;
    return toScreenOrder(await decode(bytes));
  } catch (e) {
    console.warn(`[diverse weapons] ${loose} would not decode:`, e?.message ?? e);
    return null;
  }
}

// A player-attached texture mod, such as an HD replacer, answers before either weapon mod.
export async function customWeaponImage(name) {
  return (await dfmodWeaponImage(name)) ?? (await weaponModImage(name));
}
async function weaponModImage(name) {
  return (await diverseWeaponsImage(name)) ?? (await weaponWidgetImage(name)) ?? null;
}
async function dfmodWeaponImage(name) {
  try { const img = await dfmodCifRciNamed(name); return img ? toScreenOrder(img) : null; } catch { return null; }
}

export function _resetDiverseWeaponsImages() { forgetBundle(); }
