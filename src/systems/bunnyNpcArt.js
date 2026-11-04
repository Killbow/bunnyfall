// @ts-check
// BUNNYFALL (2026-11-04, the owner: "i have given you sprites to replace both Berenziah's overworld and talk sprite"):
// THE PORT'S OWN PICTURES FOR NAMED PEOPLE. Queen Barenziah of Wayrest is faction 391 (FACTION.TXT: face 43, flat
// TEXTURE.346 record 22). Her world flat is one record of a real ARENA2 archive, so it goes on the texture door's vendor
// tier as a replacement of that record (the same size as the classic one, 79x160 - nothing rescales). Her talk portrait
// is FACES.CIF record 43, which the talk window asks here before it asks a mod or the game's file.
//
// The pictures live in public/art/bunnyfall-npcs/ (346_22-0.png, barenziah-face.png). Not a DFU member.
import { addVendorTextures, vendorTextureCount, decodePng } from './textureReplacement.js';
import { APP_ROOT } from './appRoot.js';

/** The shipped picture's URL, off the app root as the other shipped art is. */
export const bunnyNpcArtUrl = (name, root = APP_ROOT ?? globalThis.document?.baseURI ?? 'http://localhost/') =>
  new URL(`art/bunnyfall-npcs/${encodeURIComponent(name)}.png`, root).href;

/** World flats replaced: TEXTURE.<archive> record <record>, each by its DFU file name. */
export const BUNNY_NPC_FLATS = Object.freeze([
  Object.freeze({ archive: 346, record: 22, frame: 0, name: '346_22-0' }),   // Queen Barenziah
]);

/** Talk portraits replaced, by `<file>#<record>` (the talk window's own key): FACES.CIF record 43, Queen Barenziah. */
export const BUNNY_NPC_PORTRAITS = Object.freeze({ 'FACES.CIF#43': 'barenziah-face' });

let _installed = false;
/** Register the flats once (before the archives load, as shared.js does). `fetchBytes(name)` is the test seam.
 *  @returns {number} how many were registered (0 when already installed) */
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

/** The talk portrait the port draws for a record, top-down RGBA as a mod's picture is, or null where it has none or it will
 *  not load (the classic record stands then). `key` is `<file>#<record>`.
 *  @param {string} key */
export async function bunnyPortraitImage(key) {
  const name = /** @type {Record<string, string>} */ (BUNNY_NPC_PORTRAITS)[key];
  if (!name) return null;
  try {
    const r = await fetch(bunnyNpcArtUrl(name));
    if (!r.ok) return null;
    return await decodePng(new Uint8Array(await r.arrayBuffer()));
  } catch { return null; }
}
export const hasBunnyPortrait = (/** @type {string} */ key) => Object.prototype.hasOwnProperty.call(BUNNY_NPC_PORTRAITS, key);
