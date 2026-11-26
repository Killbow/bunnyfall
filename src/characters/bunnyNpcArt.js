// @ts-check
import { addVendorTextures, vendorTextureCount, decodePng } from '../render/textureReplacement.js';
import { APP_ROOT } from '../platform/appRoot.js';

export const bunnyNpcArtUrl = (name, root = APP_ROOT ?? globalThis.document?.baseURI ?? 'http://localhost/') =>
  new URL(`art/bunnyfall-npcs/${encodeURIComponent(name)}.png`, root).href;

export const BUNNY_NPC_FLATS = Object.freeze([
  Object.freeze({ archive: 346, record: 22, frame: 0, name: '346_22-0' }),
]);

export const BUNNY_NPC_PORTRAITS = Object.freeze({ 'FACES.CIF#43': 'barenziah-face', 'BUNNYFALL#0': 'nyx' });

let _installed = false;
/** @returns {number} */
export function installBunnyNpcArt({ fetchBytes = null } = {}) {
  if (_installed && vendorTextureCount() > 0) return 0;
  _installed = true;
  const load = fetchBytes ?? (async (/** @type {string} */ name) => {
    const r = await fetch(bunnyNpcArtUrl(name));
    if (!r.ok) throw new Error(`${name}: ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  });
  return addVendorTextures(BUNNY_NPC_FLATS.map((e) => ({ archive: e.archive, record: e.record, frame: e.frame, fileName: e.name, load: () => load(e.name), lazy: true })));
}

/** @param {string} key */
export async function bunnyPortraitImage(key) {
  const name = /** @type {Record<string, string>} */ (BUNNY_NPC_PORTRAITS)[key];
  if (!name) return null;
  try {
    const r = await fetch(bunnyNpcArtUrl(name));
    if (!r.ok) return null;
    const img = await decodePng(new Uint8Array(await r.arrayBuffer()));
    return name === 'nyx' ? topOf(img, 0.4) : img;
  } catch { return null; }
}
function topOf(img, share) {
  const h = Math.max(1, Math.round(img.height * share));
  return { ...img, height: h, data: img.data.slice(0, img.width * h * 4) };
}
export const hasBunnyPortrait = (/** @type {string} */ key) => Object.prototype.hasOwnProperty.call(BUNNY_NPC_PORTRAITS, key);
