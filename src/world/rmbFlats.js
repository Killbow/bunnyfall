// RMB flat (billboard) collection: misc block flats, exterior subrecord flats, and ground scenery.
// 1:1 with Daggerfall Unity's RMBLayout (MIT, Daggerfall Workshop). Exterior nature-range flats set
// billboardPosition.z to natureFlatsOffsetY, an upstream quirk kept for parity.

import { RMB_DIMENSION, SCALE_DIVISOR } from '../formats/blocksFile.js';
import { GLOBAL_SCALE } from './meshReader.js';
import { applyBillboardXml, billboardXmlScaleOf, billboardXmlGeneration } from './billboardXml.js';
import { textureReplacementEnabled, hasTextureReplacement } from '../render/textureReplacement.js';
import { flatFieldFor, sowField } from './flatFields.js';
import { PROPS_OFFSET_Y } from './rmbLayout.js';
import { quarterOf } from '../ui/townQuarters.js';

export const BLOCK_FLATS_OFFSET_Y = -6;
const NATURE_FLATS_OFFSET_Y = -2;
export const EDITOR_FLATS_ARCHIVE = 199;
export const LIGHTS_ARCHIVE = 210;
const NATURE_ARCHIVE_MIN = 500;
const NATURE_ARCHIVE_MAX = 511;
export const isNatureArchive = (archive) => archive >= NATURE_ARCHIVE_MIN && archive <= NATURE_ARCHIVE_MAX;
export const NATURE_FLATS_Y = NATURE_FLATS_OFFSET_Y * GLOBAL_SCALE;

const AUTOMAP_SIDE = 64, AUTOMAP_PER_TILE = AUTOMAP_SIDE / 16;
/**
 * @param {?ArrayLike<number>} autoMap
 * @param {number} x
 * @param {number} y
 * @param {?(i: number) => boolean} held
 */
export function sceneryUnderRoof(autoMap, x, y, held) {
  if (!autoMap || autoMap.length < AUTOMAP_SIDE * AUTOMAP_SIDE || !held) return false;
  const col = AUTOMAP_PER_TILE * x, row = AUTOMAP_SIDE - AUTOMAP_PER_TILE * (y + 1);
  if (col < 1 || row < 1 || col >= AUTOMAP_SIDE || row >= AUTOMAP_SIDE) return false;
  for (const r of [row - 1, row]) for (const c of [col - 1, col]) if (quarterOf(autoMap[r * AUTOMAP_SIDE + c]) === null) return false;
  return held(row * AUTOMAP_SIDE + col);
}

/**
 * @param {?ArrayLike<number>} autoMap
 * @param {?Array<{xPos: number, zPos: number}>} subRecords
 * @returns {?(i: number) => boolean}
 */
export function heldFootprints(autoMap, subRecords) {
  if (!autoMap || autoMap.length < AUTOMAP_SIDE * AUTOMAP_SIDE) return null;
  const run = new Int32Array(AUTOMAP_SIDE * AUTOMAP_SIDE).fill(-1);
  let runs = 0;
  for (let i = 0; i < run.length; i++) {
    if (run[i] >= 0 || quarterOf(autoMap[i]) === null) continue;
    const open = [i];
    run[i] = runs;
    while (open.length) {
      const k = open.pop(), r = Math.floor(k / AUTOMAP_SIDE), c = k % AUTOMAP_SIDE;
      for (const [rr, cc] of [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]) {
        if (rr < 0 || cc < 0 || rr >= AUTOMAP_SIDE || cc >= AUTOMAP_SIDE) continue;
        const kk = rr * AUTOMAP_SIDE + cc;
        if (run[kk] < 0 && quarterOf(autoMap[kk]) !== null) { run[kk] = runs; open.push(kk); }
      }
    }
    runs++;
  }
  const held = new Set();
  for (const s of subRecords ?? []) {
    const c = Math.floor(s.xPos / 64), r = Math.floor(s.zPos / 64);
    if (r >= 0 && c >= 0 && r < AUTOMAP_SIDE && c < AUTOMAP_SIDE && run[r * AUTOMAP_SIDE + c] >= 0) held.add(run[r * AUTOMAP_SIDE + c]);
  }
  return (i) => run[i] >= 0 && held.has(run[i]);
}

/**
 * @param {{width:number,height:number}} size
 * @param {{width:number,height:number}} scale
 * @returns {{w:number,h:number}}
 */
const _mobileSize = new WeakMap();
const _mobileXml = new WeakMap();

export function mobileBillboardSize(t, record) {
  let byRecord = _mobileSize.get(t);
  if (!byRecord) { byRecord = []; _mobileSize.set(t, byRecord); }
  let size = byRecord[record];
  if (!size) { size = scaledBillboardSize(t.getSize(record), t.getScale(record)); byRecord[record] = size; }
  if (!(textureReplacementEnabled() || t?.vendor === true)) return size;
  const s = billboardXmlScaleOf(t?.archive, record);
  if (!s) return size;
  let byXml = _mobileXml.get(t);
  if (!byXml) { byXml = []; _mobileXml.set(t, byXml); }
  const gen = billboardXmlGeneration();
  let x = byXml[record];
  if (!x || x.s !== s || x.gen !== gen) { x = { s, gen, size: { w: size.w * s[0], h: size.h * s[1] } }; byXml[record] = x; }
  return x.size;
}
export function billboardSize(t, record) {
  const size = scaledBillboardSize(t.getSize(record), t.getScale(record));
  return t?.archive != null && hasTextureReplacement(t.archive, record, 0) ? applyBillboardXml(t.archive, record, size) : size;
}
export function classicBillboardSize(t, record) {
  return scaledBillboardSize(t.getSize(record), t.getScale(record));
}

/**
 * @param {number[]} pos
 * @param {{w:number,h:number}} size
 * @returns {number[]}
 */
export function centredBase(pos, size) {
  return [pos[0], pos[1] - (size?.h ?? 0) / 2, pos[2]];
}

export function scaledBillboardSize(size, scale) {
  const xChange = Math.trunc(size.width * (scale.width / SCALE_DIVISOR));
  const yChange = Math.trunc(size.height * (scale.height / SCALE_DIVISOR));
  return {
    w: (size.width + xChange) * GLOBAL_SCALE,
    h: (size.height + yChange) * GLOBAL_SCALE,
  };
}

/**
 * @param {{rmbBlock: {miscFlatObjectRecords: any[]}}} dfBlock
 * @returns {Array<{archive:number,record:number,x:number,y:number,z:number,editor:boolean}>}
 */
export function collectMiscFlats(dfBlock) {
  const flats = [];
  for (const obj of dfBlock.rmbBlock.miscFlatObjectRecords) {
    flats.push({
      archive: obj.textureArchive,
      record: obj.textureRecord,
      editor: obj.textureArchive === EDITOR_FLATS_ARCHIVE,
      x: obj.xPos * GLOBAL_SCALE,
      y: (-obj.yPos + BLOCK_FLATS_OFFSET_Y) * GLOBAL_SCALE,
      z: (obj.zPos + RMB_DIMENSION) * GLOBAL_SCALE,
      factionID: obj.factionID, flags: obj.flags, recordPosition: obj.position,
      rawX: obj.xPos, rawY: obj.yPos, rawZ: obj.zPos,
    });
  }
  return flats;
}

/**
 * @param {object} dfBlock
 * @param {number} natureArchive
 * @param {{climateIndex?:?number, solid?:?Function}} [fields]
 * @returns {Array<{archive:number,record:number,x:number,y:number,z:number,
 *   editor?:boolean}>}
 */
export function collectBlockFlats(dfBlock, natureArchive, { climateIndex = null, solid = null, extra = null } = {}) {
  const rmb = dfBlock.rmbBlock;
  const flats = [];

  for (const f of collectMiscFlats(dfBlock)) flats.push(f);

  if (natureArchive >= NATURE_ARCHIVE_MIN && natureArchive <= NATURE_ARCHIVE_MAX) {
    for (const obj of rmb.misc3dObjectRecords ?? []) {
      const spec = flatFieldFor(obj.modelIdNum);
      if (!spec) continue;
      flats.push(...sowField(spec, natureArchive, obj.xPos * GLOBAL_SCALE, (-obj.yPos + PROPS_OFFSET_Y) * GLOBAL_SCALE, (obj.zPos + RMB_DIMENSION) * GLOBAL_SCALE, { climateIndex, solid }));
    }
  }

  for (const subRecord of rmb.subRecords) {
    const subX = subRecord.xPos * GLOBAL_SCALE;
    const subZ = -subRecord.zPos * GLOBAL_SCALE;
    for (const obj of subRecord.exterior.blockFlatObjectRecords) {
      let archive = obj.textureArchive;
      if (archive === EDITOR_FLATS_ARCHIVE) continue;

      let x = obj.xPos * GLOBAL_SCALE + subX;
      let y = (-obj.yPos + BLOCK_FLATS_OFFSET_Y) * GLOBAL_SCALE;
      let z = (obj.zPos + RMB_DIMENSION) * GLOBAL_SCALE + subZ;

      if (archive >= NATURE_ARCHIVE_MIN && archive <= NATURE_ARCHIVE_MAX) {
        archive = natureArchive;
        z = NATURE_FLATS_OFFSET_Y;
      }

      flats.push({ archive, record: obj.textureRecord, x, y, z, factionID: obj.factionID, flags: obj.flags, recordPosition: obj.position, rawX: obj.xPos, rawY: obj.yPos, rawZ: obj.zPos });
    }
  }

  const scenery = rmb.fldHeader.groundData.groundScenery;
  const autoMap = rmb.fldHeader.autoMapData;
  const held = heldFootprints(autoMap, rmb.subRecords);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const item = scenery[x][15 - y];
      if (item.textureRecord < 1) continue;
      if (sceneryUnderRoof(autoMap, x, y, held)) continue;
      flats.push({
        archive: natureArchive,
        record: item.textureRecord,
        x: x * 256 * GLOBAL_SCALE,
        y: NATURE_FLATS_OFFSET_Y * GLOBAL_SCALE,
        z: (y * 256 + 256) * GLOBAL_SCALE,
      });
    }
  }

  if (extra) for (const f of extra) flats.push(f);
  return flats;
}
