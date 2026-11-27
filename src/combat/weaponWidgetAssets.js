// Weapon Widget textures, read from the player's attached .dfmod bundle or from loose PNGs of the same name.
// The textures are renders of ARENA2 art and are not in this repository. A missing bundle never throws.

import { readUnityBundle } from '../formats/unityBundle.js';
import { toScreenOrder } from '../formats/color32Order.js';
import { decodePng } from '../render/textureReplacement.js';
import { MATERIAL_NAMES } from '../items/itemInfo.js';
import { WEAPON_MATERIALS } from '../characters/weapons.js';
import { customTextureNames } from './diverseWeapons.js';

export const WEAPON_WIDGET_MOD = Object.freeze({
  guid: '9f301f2b-298b-43d8-8f3f-c54deaa841e0',
  title: 'Weapon Widget',
  version: '1.6',
  author: 'RedRoryOTheGlen',
});

import { DFMOD_KEY_PREFIX } from '../mods/seasonsIliacBayAssets.js';
export { DFMOD_KEY_PREFIX };
const isWidgetDfmod = (name) => /\.dfmod$/i.test(name) && /weapon.?widget/i.test(name.slice(name.lastIndexOf('/') + 1));
const isPng = (name) => /\.png$/i.test(name);

export function widgetMetalName(material) {
  return material != null && material !== WEAPON_MATERIALS.None ? MATERIAL_NAMES[material] : null;
}

export function widgetTextureName(fileName, record, frame, material, doubleScale = true) {
  return customTextureNames(fileName, record, frame, widgetMetalName(material), doubleScale)[0];
}

let _names = [];
let _load = null;
let _bundle = null;
let _images = new Map();

export function setWeaponWidgetSources(fileNames, load) {
  const names = (fileNames ?? []).filter((n) => (n.startsWith(DFMOD_KEY_PREFIX) && isWidgetDfmod(n)) || (isPng(n) && /(^|\/)w?_?WEAPO/i.test(n)));
  const loader = typeof load === 'function' ? load : null;
  const same = loader === _load && names.length === _names.length && names.every((n, i) => n === _names[i]);
  _names = names;
  _load = loader;
  if (!same) { _bundle = null; _images = new Map(); }
  return _names.length;
}
export const clearWeaponWidgetSources = () => setWeaponWidgetSources([], null);
export const weaponWidgetSourcesCount = () => _names.length;

function manifestOf(bundle) {
  for (const t of bundle?.textAssets ?? []) {
    if (!/\.dfmod$/i.test(t.name)) continue;
    try { return JSON.parse(t.text); } catch { }
  }
  return null;
}

export async function weaponWidgetBundle() {
  if (!_bundle) {
    _bundle = (async () => {
      if (!_load) return null;
      for (const name of _names) {
        if (!name.startsWith(DFMOD_KEY_PREFIX)) continue;
        try {
          const bytes = await _load(name);
          if (!bytes || !bytes.byteLength) continue;
          const bundle = readUnityBundle(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
          const manifest = manifestOf(bundle);
          if (!manifest) continue;
          if (manifest.GUID === WEAPON_WIDGET_MOD.guid || manifest.ModTitle === WEAPON_WIDGET_MOD.title) {
            if (manifest.ModVersion && String(manifest.ModVersion) !== WEAPON_WIDGET_MOD.version) console.warn(`[weapon widget] the bundle is ${manifest.ModTitle} ${manifest.ModVersion}; the port is ${WEAPON_WIDGET_MOD.version}'s IL`);
            return { bundle, manifest };
          }
        } catch (e) {
          console.warn(`[weapon widget] ${name} would not open:`, e?.message ?? e);
        }
      }
      return null;
    })();
  }
  return _bundle;
}

// Returns `{ width, height, colors }`, the shape the texture upload reads, or null. Misses are cached too.
export function weaponWidgetImage(name) {
  if (!_images.has(name)) {
    _images.set(name, (async () => {
      const b = await weaponWidgetBundle();
      const tex = b?.bundle?.textures?.find((t) => t.name === name);
      if (tex) {
        // Both sources decode top row first and draw on a screen quad, so rows are never flipped.
        try { return toScreenOrder(tex.rgba()); } catch (e) { console.warn(`[weapon widget] ${name} would not decode:`, e?.message ?? e); }
      }
      if (!_load) return null;
      const loose = _names.find((n) => isPng(n) && n.slice(n.lastIndexOf('/') + 1).replace(/\.png$/i, '') === name);
      if (!loose) return null;
      try {
        const bytes = await _load(loose);
        if (!bytes || !bytes.byteLength) return null;
        return toScreenOrder(await decodePng(bytes));
      } catch (e) {
        console.warn(`[weapon widget] ${loose} would not decode:`, e?.message ?? e);
        return null;
      }
    })());
  }
  return _images.get(name);
}

export async function weaponWidgetTexturesAttached() {
  if (!_names.length) return false;
  return !!(await weaponWidgetBundle()) || _names.some(isPng);
}
