// @ts-check
// BUNNYFALL (2026-11-04, the owner: "Add an Emperor statue memorial in Daggerfall ... i have attached the emperors statue
// sprite to add in front of the main entrance of daggerfall"; asked which, he said "main entrance is the city gate"):
// THE EMPEROR'S MEMORIAL, ITS LAW - where it stands, and the picture it wears. Pure: no renderer, no GL, no clock.
//
// WHERE. Daggerfall city (region Daggerfall, location Daggerfall) is an 8x8 walled town with two gates, each a wall block
// with a gate model and a start marker standing outside it. The north gate is block (2, 0), WALLAA10.RMB: its wall runs
// along z 91.2 of the block, the gate model (446) at x 38.4, the start marker (the place a traveller arrives) at
// x 41.3, z 72.7 - outside the wall, in front of the gate. The memorial stands in front of that gate, off the gate's own
// line (the way in and out runs through it), at MEMORIAL_X, MEMORIAL_Z in the block's frame, metres.
//
// WHAT. One flat: the owner's PNG (public/art/bunnyfall-npcs/emperor-statue.png, 152x212) on the texture door's vendor
// tier as a stand-in archive of its own (a flat in no ARENA2 file), drawn as a billboard like any other flat, at a size
// that makes it a statue (MEMORIAL_SCALE of its pixels) rather than a giant. The block's flats carry it as one more
// (rmbFlats.js collectBlockFlats `extra`), so both exterior hosts stand it from the one place and a season turning stands
// it again.
//
// Not a DFU member.
import { REGION_NAMES } from '../formats/mapsTables.js';
import { GLOBAL_SCALE } from './meshReader.js';
import { BLOCK_FLATS_OFFSET_Y } from './rmbFlats.js';
import { addVendorTextures, decodePng } from '../systems/textureReplacement.js';
import { APP_ROOT } from '../systems/appRoot.js';

/** The place: Daggerfall's own city (a pack's read of it keeps both names). */
export const MEMORIAL_REGION = REGION_NAMES.indexOf('Daggerfall');
export const MEMORIAL_TOWN = 'Daggerfall';
/** The block of the gate (the wall block with the north gate): its grid cell and its name. */
export const MEMORIAL_BLOCK = Object.freeze({ x: 2, y: 0, name: 'WALLAA10.RMB' });
/** Where it stands in that block, metres: beside the gate's line (the gate at x 38.4), before the wall (z 91.2). */
export const MEMORIAL_X = 28.0;
export const MEMORIAL_Z = 79.0;
/** The stand-in archive and record its picture takes on the texture door (no ARENA2 file holds either). */
export const MEMORIAL_ARCHIVE = 9150;
export const MEMORIAL_RECORD = 0;
/** What the plaque, the hover and a press on it say. */
export const MEMORIAL_TEXT = Object.freeze({ title: 'Statue of the Emperor' });
/** The picture's size against its pixels: 0.8 stands it 4.2 m tall (the record's scale is in 256ths over 1). */
export const MEMORIAL_SCALE = Object.freeze({ width: -51, height: -51 });

/** Is `dfLocation` (as MapsFile reads it) Daggerfall city? */
export const isMemorialTown = (/** @type {any} */ dfLocation) => !!dfLocation && dfLocation.regionIndex === MEMORIAL_REGION && dfLocation.name === MEMORIAL_TOWN;

/**
 * The flats this block carries for the memorial: one in the gate's block of Daggerfall, none anywhere else. In the shape
 * collectMiscFlats makes (rmbFlats.js), block-local metres, `y` the billboard's base as a marker's is.
 * @param {any} dfLocation @param {{ x?: number, y?: number, blockName?: string } | null | undefined} block
 * @returns {Array<any>}
 */
export function memorialFlatsFor(dfLocation, block) {
  if (!isMemorialTown(dfLocation) || !block) return [];
  if (block.x !== MEMORIAL_BLOCK.x || block.y !== MEMORIAL_BLOCK.y || block.blockName !== MEMORIAL_BLOCK.name) return [];
  return [{
    archive: MEMORIAL_ARCHIVE, record: MEMORIAL_RECORD, editor: false,
    x: MEMORIAL_X, y: (4 + BLOCK_FLATS_OFFSET_Y) * GLOBAL_SCALE, z: MEMORIAL_Z,   // y: the start marker's own (yPos -4 in the record)
    factionID: 0, flags: 0, recordPosition: 0, rawX: 0, rawY: 0, rawZ: 0,
  }];
}

/** The picture's URL, off the app root as the other shipped art is. */
export const memorialUrl = (root = APP_ROOT ?? globalThis.document?.baseURI ?? 'http://localhost/') => new URL('art/bunnyfall-npcs/emperor-statue.png', root).href;

let _installed = false;
/** Register the picture once, before the archives load. `fetchBytes()` is the test seam. @returns {number} */
export function installEmperorMemorial({ fetchBytes = null } = {}) {
  if (_installed) return 0;
  _installed = true;
  const get = fetchBytes ?? (async () => {
    const r = await fetch(memorialUrl());
    if (!r.ok) throw new Error(`emperor-statue: ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  });
  return addVendorTextures([{
    archive: MEMORIAL_ARCHIVE, record: MEMORIAL_RECORD, fileName: 'bunnyfall-emperor-statue', standIn: true,
    build: async () => ({ ...(await decodePng(await get())), scale: MEMORIAL_SCALE }),
  }]);
}
export function _resetEmperorMemorial() { _installed = false; }
