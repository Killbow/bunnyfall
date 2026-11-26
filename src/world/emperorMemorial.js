// @ts-check
import { REGION_NAMES } from '../formats/mapsTables.js';
import { GLOBAL_SCALE } from './meshReader.js';
import { BLOCK_FLATS_OFFSET_Y } from './rmbFlats.js';
import { addVendorTextures, decodePng } from '../render/textureReplacement.js';
import { APP_ROOT } from '../platform/appRoot.js';

export const MEMORIAL_REGION = REGION_NAMES.indexOf('Daggerfall');
export const MEMORIAL_TOWN = 'Daggerfall';
// The gate block is matched by name because the location pack places it at (5, 0), while the classic layout has it
// at (2, 0).
export const MEMORIAL_BLOCK = Object.freeze({ name: 'WALLAA10.RMB' });
export const MEMORIAL_X = 28.0;
export const MEMORIAL_Z = 79.0;
export const MEMORIAL_ARCHIVE = 9150;
export const MEMORIAL_RECORD = 0;
export const MEMORIAL_TEXT = Object.freeze({ title: 'Statue of the Emperor' });
export const MEMORIAL_SCALE = Object.freeze({ width: -51, height: -51 });

export const isMemorialTown = (/** @type {any} */ dfLocation) => !!dfLocation && dfLocation.regionIndex === MEMORIAL_REGION && dfLocation.name === MEMORIAL_TOWN;

/**
 * @param {any} dfLocation
 * @param {{ x?: number, y?: number, blockName?: string } | null | undefined} block
 * @returns {Array<any>}
 */
export function memorialFlatsFor(dfLocation, block) {
  if (!isMemorialTown(dfLocation) || !block) return [];
  if (String(block.blockName ?? '').toUpperCase() !== MEMORIAL_BLOCK.name) return [];
  return [{
    archive: MEMORIAL_ARCHIVE, record: MEMORIAL_RECORD, editor: false,
    x: MEMORIAL_X, y: (4 + BLOCK_FLATS_OFFSET_Y) * GLOBAL_SCALE, z: MEMORIAL_Z,
    factionID: 0, flags: 0, recordPosition: 0, rawX: 0, rawY: 0, rawZ: 0,
  }];
}

export const memorialUrl = (root = APP_ROOT ?? globalThis.document?.baseURI ?? 'http://localhost/') => new URL('art/bunnyfall-npcs/emperor-statue.png', root).href;

let _installed = false;
/** @returns {number} */
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
