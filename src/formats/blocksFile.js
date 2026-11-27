
import { BsaFile, DIRECTORY_TYPES } from './bsaFile.js';
import { worldDataDoor } from './worldDataDoor.js';
import { dryPuddles } from '../world/puddleDry.js';
import { HeldRecords } from './heldRecords.js';

export const BLOCK_TYPES = Object.freeze({
  Unknown: 0,
  Rmb: 1,
  Rdb: 2,
  Rdi: 3,
});

export const RDB_TYPES = Object.freeze({
  Unknown: 0,
  Border: 1,
  Normal: 2,
  Wet: 3,
  Quest: 4,
  Mausoleum: 5,
  Start: 6,
});

export const RDB_RESOURCE_TYPES = Object.freeze({
  Model: 0x01,
  Light: 0x02,
  Flat: 0x03,
});

export const ROTATION_DIVISOR = 5.68888888888889;
export const RMB_DIMENSION = 4096;
export const TILE_DIMENSION = 256;
export const RDB_DIMENSION = 2048;
export const SCALE_DIVISOR = 256;

const UTF8_DECODER = new TextDecoder('utf-8');

function defaultActionResource() {
  return {
    position: 0,
    axis: 0,
    duration: 0,
    magnitude: 0,
    nextObjectOffset: 0,
    flags: 0,
    previousObjectOffset: -1,
    nextObjectIndex: -1,
  };
}

function defaultResources() {
  return {
    modelResource: {
      xRotation: 0,
      yRotation: 0,
      zRotation: 0,
      modelIndex: 0,
      triggerFlagStartingLock: 0,
      soundIndex: 0,
      actionOffset: 0,
      actionResource: defaultActionResource(),
    },
    flatResource: {
      position: 0,
      textureBitfield: 0,
      textureArchive: 0,
      textureRecord: 0,
      flags: 0,
      magnitude: 0,
      soundIndex: 0,
      factionOrMobileId: 0,
      nextObjectOffset: 0,
      action: 0,
    },
    lightResource: { unknown1: 0, unknown2: 0, radius: 0 },
  };
}

export const BUILDING_DATA_SIZE = 26;

export function readBuildingData(view, pos) {
  return {
    nameSeed: view.getUint16(pos, true),
    serviceTimeLimit: view.getUint32(pos + 2, true),
    unknown: view.getUint16(pos + 6, true),
    unknown2: view.getUint16(pos + 8, true),
    unknown3: view.getUint32(pos + 10, true),
    unknown4: view.getUint32(pos + 14, true),
    factionId: view.getUint16(pos + 18, true),
    sector: view.getInt16(pos + 20, true),
    locationId: view.getUint16(pos + 22, true),
    buildingType: view.getUint8(pos + 24),
    quality: view.getUint8(pos + 25),
  };
}

const dryBlock = (dfBlock) => { dryPuddles(dfBlock?.rmbBlock?.fldHeader?.groundData?.groundTiles); return dfBlock; };

export const BLOCKS_HELD_MAX = 64;

export class BlocksFile {
  constructor() {
    this._bsa = null;
    this._blocks = null;
    this._blockNameLookup = new Map();
    this.autoDiscard = true;
    this._lastBlock = -1;
    this._held = new HeldRecords(BLOCKS_HELD_MAX, (block) => { this._blocks[block] = null; });
  }

  static get filename() {
    return 'BLOCKS.BSA';
  }

  get count() {
    return this._bsa ? this._bsa.count : 0;
  }

  /**
   * @param {Uint8Array} bytes
   * @returns {boolean}
   */
  load(bytes) {
    this._bsa = new BsaFile(bytes);
    if (this._bsa.directoryType !== DIRECTORY_TYPES.NameRecord) return false;
    this._blocks = new Array(this._bsa.count).fill(null);
    return true;
  }

  getBlockName(block) {
    return worldDataDoor()?.getNewDFBlockName(block) ?? (block < this.count ? this._bsa.getRecordName(block) : null);
  }

  getBlockType(block) {
    const name = this.getBlockName(block);
    if (name.endsWith('.RMB')) return BLOCK_TYPES.Rmb;
    if (name.endsWith('.RDB')) return BLOCK_TYPES.Rdb;
    if (name.endsWith('.RDI')) return BLOCK_TYPES.Rdi;
    return BLOCK_TYPES.Unknown;
  }

  getRdbType(blockName) {
    if (blockName.startsWith('B')) return RDB_TYPES.Border;
    if (blockName.startsWith('W')) return RDB_TYPES.Wet;
    if (blockName.startsWith('S')) return RDB_TYPES.Quest;
    if (blockName.startsWith('M')) return RDB_TYPES.Mausoleum;
    if (blockName.startsWith('N')) return RDB_TYPES.Normal;
    return RDB_TYPES.Unknown;
  }

  getBlockIndex(name) {
    if (this._blockNameLookup.has(name)) return this._blockNameLookup.get(name);
    const assigned = worldDataDoor()?.getNewDFBlockIndex(name) ?? -1;
    if (assigned !== -1) return assigned;
    for (let i = 0; i < this.count; i++) {
      if (this.getBlockName(i) === name) {
        this._blockNameLookup.set(name, i);
        return i;
      }
    }
    return -1;
  }

  loadBlock(block) {
    if (block < 0 || block >= this.count) return false;
    const held = this._blocks[block];
    // A replacement stored by `getBlock` has null `bytes`, so `loadBlock` reads the record again instead of serving
    // it.
    if (held !== null && held.bytes !== null) {
      if (this._stillServed(held)) { if (this.autoDiscard) this._held.hold(block); return true; }
      this.discardBlock(block);
    }

    const bytes = this._bsa.getRecordBytes(block);
    const name = this._bsa.getRecordName(block);
    const rec = {
      name,
      bytes,
      view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      door: worldDataDoor(),
      served: [],
      dfBlock: {
        position: this._bsa.getRecordPosition(block),
        index: block,
        name,
        type: this.getBlockType(block),
        rmbBlock: null,
        rdbBlock: null,
        rdiBlock: null,
      },
    };
    this._blocks[block] = rec;

    if (!this._read(block)) {
      this.discardBlock(block);
      return false;
    }

    if (!this._blockNameLookup.has(name)) this._blockNameLookup.set(name, block);
    this._lastBlock = block;
    if (this.autoDiscard) this._held.hold(block);
    return true;
  }

  /** @returns {boolean} */
  _stillServed(rec) {
    const door = worldDataDoor();
    if (rec.door !== door) return false;
    const rmb = rec.dfBlock.rmbBlock;
    if (!rmb) return true;
    // A reader that appends a subrecord (`attachWindmillRecord` in rmbLayout.js) changes the count, which forces a
    // fresh parse.
    if (rmb.subRecords?.length !== rec.served.length) return false;
    for (let i = 0; i < rec.served.length; i++) {
      if ((door?.getBuildingReplacementData(rec.name, rec.dfBlock.index, i) ?? null) !== rec.served[i]) return false;
    }
    return true;
  }

  /**
   * Reads the record past the world-data door and the block cache; world-data diffs in worldDataJson.js compare
   * against this.
   * @returns {object|null}
   */
  readClassicBlock(block) {
    if (block < 0 || block >= this.count) return null;
    const bytes = this._bsa.getRecordBytes(block);
    const name = this._bsa.getRecordName(block);
    const rec = {
      name, bytes, view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), classic: true,
      dfBlock: { position: this._bsa.getRecordPosition(block), index: block, name, type: this.getBlockType(block), rmbBlock: null, rdbBlock: null, rdiBlock: null },
    };
    const saved = this._blocks[block];
    this._blocks[block] = rec;
    try {
      return this._read(block) ? rec.dfBlock : null;
    } finally {
      this._blocks[block] = saved;
    }
  }

  discardBlock(block) {
    if (block < 0 || block >= this.count) return;
    this._blocks[block] = null;
    this._held.forget(block);
  }

  getBlock(block) {
    const replacement = block >= 0 ? worldDataDoor()?.getDFBlockReplacementData(block, this.getBlockName(block)) : null;
    if (replacement) {
      if (this._blocks && this._blocks.length > block) this._blocks[block] = { name: replacement.name, bytes: null, view: null, dfBlock: replacement };
      return dryBlock(replacement);
    }
    if (!this.loadBlock(block)) return null;
    return dryBlock(this._blocks[block].dfBlock);
  }

  getBlockByName(name) {
    let index = this.getBlockIndex(name);
    if (index === -1) {
      const alternateName = this._searchAlternateRMBName(name);
      if (alternateName) index = this.getBlockIndex(alternateName);
    }
    return this.getBlock(index);
  }

  static getBlockAutoMap(block, removeGroundFlats) {
    // Copy before removing flats, because the parsed block is shared with every reader.
    const data = removeGroundFlats ? block.rmbBlock.fldHeader.autoMapData.slice() : block.rmbBlock.fldHeader.autoMapData;
    if (removeGroundFlats) {
      for (let i = 0; i < data.length; i++) {
        if (data[i] === 0xfb) data[i] = 0x00;
      }
    }
    return { width: 64, height: 64, data, palette: null };
  }

  checkName(name) {
    const index = this.getBlockIndex(name);
    if (index === -1) return this._searchAlternateRMBName(name);
    return name;
  }

  _searchAlternateRMBName(name) {
    let found = '';
    const prefix = name.slice(0, 4);
    const suffix = name.slice(name.length - 6);
    for (let block = 0; block < this.count; block++) {
      const test = this.getBlockName(block);
      if (test.startsWith(prefix) && test.endsWith(suffix)) found = test;
    }
    return found;
  }

  _read(block) {
    try {
      const rec = this._blocks[block];
      switch (rec.dfBlock.type) {
        case BLOCK_TYPES.Rmb: {
          const r = { pos: 0 };
          rec.dfBlock.rmbBlock = { fldHeader: null, subRecords: null, misc3dObjectRecords: null, miscFlatObjectRecords: null };
          this._readRmbFldHeader(r, rec);
          this._readRmbBlockData(r, rec);
          rec.dfBlock.rmbBlock.misc3dObjectRecords = this._readRmbModelRecords(
            r, rec, rec.dfBlock.rmbBlock.fldHeader.numMisc3dObjectRecords
          );
          rec.dfBlock.rmbBlock.miscFlatObjectRecords = this._readRmbFlatObjectRecords(
            r, rec, rec.dfBlock.rmbBlock.fldHeader.numMiscFlatObjectRecords
          );
          break;
        }
        case BLOCK_TYPES.Rdb: {
          const r = { pos: 0 };
          rec.dfBlock.rdbBlock = {
            position: 0, header: null, modelReferenceList: null, modelDataList: null,
            objectHeader: null, unknownObjectList: null, objectRootList: null,
          };
          this._readRdbHeader(r, rec);
          this._readRdbModelReferenceList(r, rec);
          this._readRdbModelDataList(r, rec);
          this._readRdbObjectSectionHeader(r, rec);
          this._readRdbUnknownLinkedList(r, rec);
          this._readRdbObjectSectionRootList(r, rec);
          this._readRdbObjectLists(r, rec);
          this._fixRdbData(block);
          break;
        }
        case BLOCK_TYPES.Rdi:
          rec.dfBlock.rdiBlock = { data: rec.bytes.slice(0, 512) };
          break;
        default:
          return false;
      }
    } catch (e) {
      return false;
    }
    return true;
  }

  // Matches the C# fixed-length `ReadCString`: the whole field is decoded and only trailing NULs are trimmed, so
  // embedded NULs survive.
  _readCString(rec, offset, fieldLength) {
    return UTF8_DECODER
      .decode(rec.bytes.subarray(offset, offset + fieldLength))
      .replace(/\0+$/, '');
  }

  _readRmbFldHeader(r, rec) {
    const v = rec.view;
    const h = {
      numBlockDataRecords: rec.bytes[r.pos],
      numMisc3dObjectRecords: rec.bytes[r.pos + 1],
      numMiscFlatObjectRecords: rec.bytes[r.pos + 2],
      blockPositions: new Array(32),
      buildingDataList: new Array(32),
      section2UnknownData: new Array(32),
      blockDataSizes: new Array(32),
      groundData: { header: null, groundTiles: null, groundScenery: null },
      autoMapData: null,
      name: '',
      otherNames: new Array(32),
    };
    r.pos += 3;

    for (let i = 0; i < 32; i++) {
      h.blockPositions[i] = {
        unknown1: v.getUint32(r.pos, true),
        unknown2: v.getUint32(r.pos + 4, true),
        xPos: v.getInt32(r.pos + 8, true),
        zPos: v.getInt32(r.pos + 12, true),
        yRotation: v.getInt32(r.pos + 16, true),
      };
      r.pos += 20;
    }

    for (let i = 0; i < 32; i++) {
      h.buildingDataList[i] = readBuildingData(v, r.pos);
      r.pos += BUILDING_DATA_SIZE;
    }

    for (let i = 0; i < 32; i++) {
      h.section2UnknownData[i] = v.getUint32(r.pos, true);
      r.pos += 4;
    }

    for (let i = 0; i < 32; i++) {
      h.blockDataSizes[i] = v.getInt32(r.pos, true);
      r.pos += 4;
    }

    h.groundData.header = rec.bytes.slice(r.pos, r.pos + 8);
    r.pos += 8;
    h.groundData.groundTiles = this._readRmbGroundTilesData(r, rec);
    h.groundData.groundScenery = this._readRmbGroundSceneryData(r, rec);

    h.autoMapData = rec.bytes.slice(r.pos, r.pos + 64 * 64);
    r.pos += 64 * 64;

    h.name = this._readCString(rec, r.pos, 13);
    r.pos += 13;
    for (let i = 0; i < 32; i++) {
      h.otherNames[i] = this._readCString(rec, r.pos, 13);
      r.pos += 13;
    }

    rec.dfBlock.rmbBlock.fldHeader = h;
  }

  _readRmbGroundTilesData(r, rec) {
    const tiles = Array.from({ length: 16 }, () => new Array(16));
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const bitfield = rec.bytes[r.pos++];
        tiles[x][y] = {
          tileBitfield: bitfield,
          textureRecord: bitfield & 0x3f,
          isRotated: (bitfield & 0x40) === 0x40,
          isFlipped: (bitfield & 0x80) === 0x80,
        };
      }
    }
    return tiles;
  }

  _readRmbGroundSceneryData(r, rec) {
    const scenery = Array.from({ length: 16 }, () => new Array(16));
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const bitfield = rec.bytes[r.pos++];
        if (bitfield < 255) {
          scenery[x][y] = {
            tileBitfield: bitfield,
            unknown1: bitfield & 0x03,
            textureRecord: Math.floor(bitfield / 0x04) - 1,
          };
        } else {
          scenery[x][y] = { tileBitfield: bitfield, unknown1: 0, textureRecord: -1 };
        }
      }
    }
    return scenery;
  }

  _readRmbBlockData(r, rec) {
    const h = rec.dfBlock.rmbBlock.fldHeader;
    const recordCount = h.numBlockDataRecords;
    const subRecords = new Array(recordCount);
    let position = r.pos;
    const door = rec.classic ? null : worldDataDoor();
    rec.served = new Array(recordCount).fill(null);
    for (let i = 0; i < recordCount; i++) {
      const replacement = door?.getBuildingReplacementData(rec.name, rec.dfBlock.index, i);
      if (replacement) {
        rec.served[i] = replacement;
        subRecords[i] = { ...replacement.rmbSubRecord };
        if (replacement.factionId > 0) h.buildingDataList[i].factionId = replacement.factionId;
        h.buildingDataList[i].buildingType = replacement.buildingType;
        if (replacement.quality > 0) h.buildingDataList[i].quality = replacement.quality;
        if (replacement.nameSeed > 0) h.buildingDataList[i].nameSeed = replacement.nameSeed;
        door.applyBuildingReplacementAutoMapData(replacement, h.autoMapData);
      } else {
        subRecords[i] = {
          xPos: h.blockPositions[i].xPos,
          zPos: h.blockPositions[i].zPos,
          yRotation: h.blockPositions[i].yRotation,
          exterior: this._readRmbBlockSubRecord(r, rec),
          interior: this._readRmbBlockSubRecord(r, rec),
        };
      }
      // Subrecords step by `blockDataSizes`, not by the bytes read, which skips padding as Daggerfall Unity does.
      position += h.blockDataSizes[i];
      r.pos = position;
    }
    rec.dfBlock.rmbBlock.subRecords = subRecords;
  }

  _readRmbBlockSubRecord(r, rec) {
    const v = rec.view;
    const header = {
      position: r.pos,
      num3dObjectRecords: rec.bytes[r.pos],
      numFlatObjectRecords: rec.bytes[r.pos + 1],
      numSection3Records: rec.bytes[r.pos + 2],
      numPeopleRecords: rec.bytes[r.pos + 3],
      numDoorRecords: rec.bytes[r.pos + 4],
      unknown1: v.getInt16(r.pos + 5, true),
      unknown2: v.getInt16(r.pos + 7, true),
      unknown3: v.getInt16(r.pos + 9, true),
      unknown4: v.getInt16(r.pos + 11, true),
      unknown5: v.getInt16(r.pos + 13, true),
      unknown6: v.getInt16(r.pos + 15, true),
    };
    r.pos += 17;

    const block3dObjectRecords = this._readRmbModelRecords(r, rec, header.num3dObjectRecords);
    const blockFlatObjectRecords = this._readRmbFlatObjectRecords(r, rec, header.numFlatObjectRecords);

    const blockSection3Records = new Array(header.numSection3Records);
    for (let i = 0; i < header.numSection3Records; i++) {
      blockSection3Records[i] = {
        xPos: v.getInt32(r.pos, true),
        yPos: v.getInt32(r.pos + 4, true),
        zPos: v.getInt32(r.pos + 8, true),
        unknown1: rec.bytes[r.pos + 12],
        unknown2: rec.bytes[r.pos + 13],
        unknown3: v.getInt16(r.pos + 14, true),
      };
      r.pos += 16;
    }

    const blockPeopleRecords = this._readRmbFlatObjectRecords(r, rec, header.numPeopleRecords);

    const blockDoorRecords = new Array(header.numDoorRecords);
    for (let i = 0; i < header.numDoorRecords; i++) {
      blockDoorRecords[i] = {
        position: r.pos,
        xPos: v.getInt32(r.pos, true),
        yPos: v.getInt32(r.pos + 4, true),
        zPos: v.getInt32(r.pos + 8, true),
        yRotation: v.getInt16(r.pos + 12, true),
        openRotation: v.getInt16(r.pos + 14, true),
        doorModelIndex: rec.bytes[r.pos + 16],
        unknown: rec.bytes[r.pos + 17],
        nullValue1: rec.bytes[r.pos + 18],
      };
      r.pos += 19;
    }

    return {
      header,
      block3dObjectRecords,
      blockFlatObjectRecords,
      blockSection3Records,
      blockPeopleRecords,
      blockDoorRecords,
    };
  }

  _readRmbModelRecords(r, rec, count) {
    const v = rec.view;
    const out = new Array(count);
    for (let i = 0; i < count; i++) {
      const objectId1 = v.getInt16(r.pos, true);
      const objectId2 = rec.bytes[r.pos + 2];
      const modelIdNum = objectId1 * 100 + objectId2;
      out[i] = {
        objectId1,
        objectId2,
        modelId: String(modelIdNum),
        modelIdNum,
        objectType: rec.bytes[r.pos + 3],
        unknown1: v.getUint32(r.pos + 4, true),
        unknown2: v.getUint32(r.pos + 8, true),
        unknown3: v.getUint32(r.pos + 12, true),
        xPos1: v.getInt32(r.pos + 24, true),
        yPos1: v.getInt32(r.pos + 28, true),
        zPos1: v.getInt32(r.pos + 32, true),
        xPos: v.getInt32(r.pos + 36, true),
        yPos: v.getInt32(r.pos + 40, true),
        zPos: v.getInt32(r.pos + 44, true),
        nullValue2: v.getUint32(r.pos + 48, true),
        xRotation: 0,
        yRotation: v.getInt16(r.pos + 52, true),
        zRotation: 0,
        unknown4: v.getUint16(r.pos + 54, true),
        unknown5: v.getUint32(r.pos + 60, true),
      };
      r.pos += 66;
    }
    return out;
  }

  _readRmbFlatObjectRecords(r, rec, count) {
    const v = rec.view;
    const out = new Array(count);
    for (let i = 0; i < count; i++) {
      const textureBitfield = v.getUint16(r.pos + 12, true);
      out[i] = {
        position: r.pos,
        xPos: v.getInt32(r.pos, true),
        yPos: v.getInt32(r.pos + 4, true),
        zPos: v.getInt32(r.pos + 8, true),
        textureBitfield,
        textureArchive: textureBitfield >> 7,
        textureRecord: textureBitfield & 0x7f,
        factionID: v.getInt16(r.pos + 14, true),
        flags: rec.bytes[r.pos + 16],
      };
      r.pos += 17;
    }
    return out;
  }

  _readRdbHeader(r, rec) {
    const v = rec.view;
    rec.dfBlock.rdbBlock.position = r.pos;
    rec.dfBlock.rdbBlock.header = {
      unknown1: v.getUint32(r.pos, true),
      width: v.getUint32(r.pos + 4, true),
      height: v.getUint32(r.pos + 8, true),
      objectRootOffset: v.getUint32(r.pos + 12, true),
      unknown2: v.getUint32(r.pos + 16, true),
    };
    r.pos += 20;
  }

  _readRdbModelReferenceList(r, rec) {
    const list = new Array(750);
    for (let i = 0; i < 750; i++) {
      const modelId = this._readCString(rec, r.pos, 5);
      // `/^\d+$/` is narrower than C# `UInt32.TryParse` (no sign or whitespace), a difference no BLOCKS.BSA modelId
      // field exercises.
      list[i] = {
        modelId,
        modelIdNum: /^\d+$/.test(modelId) ? Number.parseInt(modelId, 10) : 0,
        description: this._readCString(rec, r.pos + 5, 3),
      };
      r.pos += 8;
    }
    rec.dfBlock.rdbBlock.modelReferenceList = list;
  }

  _readRdbModelDataList(r, rec) {
    const v = rec.view;
    const list = new Array(750);
    for (let i = 0; i < 750; i++) {
      list[i] = { unknown1: v.getUint32(r.pos, true) };
      r.pos += 4;
    }
    rec.dfBlock.rdbBlock.modelDataList = list;
  }

  _readRdbObjectSectionHeader(r, rec) {
    const v = rec.view;
    rec.dfBlock.rdbBlock.objectHeader = {
      unknownOffset: v.getUint32(r.pos, true),
      unknown1: v.getUint32(r.pos + 4, true),
      unknown2: v.getUint32(r.pos + 8, true),
      unknown3: v.getUint32(r.pos + 12, true),
      length: v.getUint32(r.pos + 16, true),
      unknown4: rec.bytes.slice(r.pos + 20, r.pos + 52),
      dagr: this._readCString(rec, r.pos + 52, 4),
      unknown5: rec.bytes.slice(r.pos + 56, r.pos + 512),
    };
    r.pos += 512;
  }

  _readRdbUnknownLinkedList(r, rec) {
    const v = rec.view;
    const position = r.pos;
    let pos = rec.dfBlock.rdbBlock.objectHeader.unknownOffset;

    let list = null;
    let count = 0;
    while (true) {
      const obj = {
        position: pos,
        next: v.getInt32(pos, true),
        index: v.getInt16(pos + 4, true),
        unknownOffset: v.getInt32(pos + 6, true) >>> 0,
      };

      // Indices count backwards, so the first node's index is the list length; the terminating node is not stored.
      if (list === null) list = new Array(obj.index).fill(null);

      if (obj.next < 0) break;

      if (count >= list.length) throw new RangeError('UnknownObjectList overflow');
      list[count++] = obj;
      pos = obj.next;
    }

    rec.dfBlock.rdbBlock.unknownObjectList = list;
    r.pos = position;
  }

  _readRdbObjectSectionRootList(r, rec) {
    const v = rec.view;
    if (r.pos !== rec.dfBlock.rdbBlock.header.objectRootOffset) {
      throw new Error('Start of ObjectRoot section does not match header offset.');
    }
    const { width, height } = rec.dfBlock.rdbBlock.header;
    const rootList = new Array(width * height);
    for (let i = 0; i < width * height; i++) {
      rootList[i] = { rootOffset: v.getInt32(r.pos, true), rdbObjects: null };
      r.pos += 4;
    }
    rec.dfBlock.rdbBlock.objectRootList = rootList;
  }

  _readRdbObjectLists(r, rec) {
    const rootList = rec.dfBlock.rdbBlock.objectRootList;
    for (let i = 0; i < rootList.length; i++) {
      if (rootList[i].rootOffset < 0) continue;
      const objectCount = this._countRdbObjects(rec, rootList[i]);
      if (objectCount === 0) continue;
      rootList[i].rdbObjects = new Array(objectCount);
      this._readRdbObjects(rec, rootList[i]);
    }
  }

  _countRdbObjects(rec, objectRoot) {
    const v = rec.view;
    let pos = objectRoot.rootOffset;
    let objectCount = 0;
    while (true) {
      objectCount++;
      const next = v.getInt32(pos, true);
      if (next < 0) break;
      pos = next;
    }
    return objectCount;
  }

  _readRdbObjects(rec, objectRoot) {
    const v = rec.view;
    let pos = objectRoot.rootOffset;
    let index = 0;
    while (true) {
      const obj = {
        position: pos,
        next: v.getInt32(pos, true),
        previous: v.getInt32(pos + 4, true),
        index,
        xPos: v.getInt32(pos + 8, true),
        yPos: v.getInt32(pos + 12, true),
        zPos: v.getInt32(pos + 16, true),
        type: rec.bytes[pos + 20],
        resourceOffset: v.getUint32(pos + 21, true),
        resources: defaultResources(),
      };
      objectRoot.rdbObjects[index] = obj;

      if (obj.next < 0) break;
      pos = obj.next;
      index++;
    }

    for (let i = 0; i < objectRoot.rdbObjects.length; i++) {
      const obj = objectRoot.rdbObjects[i];
      switch (obj.type) {
        case RDB_RESOURCE_TYPES.Model:
          this._readRdbModelResource(rec, obj, objectRoot.rdbObjects);
          break;
        case RDB_RESOURCE_TYPES.Flat:
          this._readRdbFlatResource(rec, obj);
          break;
        case RDB_RESOURCE_TYPES.Light:
          this._readRdbLightResource(rec, obj);
          break;
        default:
          throw new Error('Unknown RDB resource type encountered.');
      }
    }
  }

  _readRdbModelResource(rec, rdbObject, rdbObjects) {
    const v = rec.view;
    const pos = rdbObject.resourceOffset;
    const m = rdbObject.resources.modelResource;
    m.xRotation = v.getInt32(pos, true);
    m.yRotation = v.getInt32(pos + 4, true);
    m.zRotation = v.getInt32(pos + 8, true);
    m.modelIndex = v.getUint16(pos + 12, true);
    m.triggerFlagStartingLock = v.getUint32(pos + 14, true);
    m.soundIndex = rec.bytes[pos + 18];
    m.actionOffset = v.getInt32(pos + 19, true);

    if (m.actionOffset > 0) this._readRdbModelActionRecords(rec, rdbObject, rdbObjects);
  }

  _readRdbModelActionRecords(rec, rdbObject, rdbObjects) {
    const v = rec.view;
    const pos = rdbObject.resources.modelResource.actionOffset;
    const a = rdbObject.resources.modelResource.actionResource;
    a.position = pos;
    a.axis = rec.bytes[pos];
    a.duration = v.getUint16(pos + 1, true);
    a.magnitude = v.getUint16(pos + 3, true);
    a.nextObjectOffset = v.getInt32(pos + 5, true);
    a.flags = rec.bytes[pos + 9];

    if (a.nextObjectOffset < 0) return;

    for (let index = 0; index < rdbObjects.length; index++) {
      if (rdbObjects[index].position === a.nextObjectOffset) {
        a.nextObjectIndex = index;
        rdbObjects[index].resources.modelResource.actionResource.previousObjectOffset =
          rdbObject.position;
        break;
      }
    }
  }

  _readRdbFlatResource(rec, rdbObject) {
    const v = rec.view;
    const pos = rdbObject.resourceOffset;
    const f = rdbObject.resources.flatResource;
    f.position = pos;
    f.textureBitfield = v.getUint16(pos, true);
    f.textureArchive = f.textureBitfield >> 7;
    f.textureRecord = f.textureBitfield & 0x7f;
    f.flags = v.getUint16(pos + 2, true);
    f.magnitude = rec.bytes[pos + 4];
    f.soundIndex = rec.bytes[pos + 5];
    f.factionOrMobileId = f.magnitude | (f.soundIndex << 8);
    f.nextObjectOffset = v.getInt32(pos + 6, true);
    f.action = rec.bytes[pos + 10];
  }

  _readRdbLightResource(rec, rdbObject) {
    const v = rec.view;
    const pos = rdbObject.resourceOffset;
    const l = rdbObject.resources.lightResource;
    l.unknown1 = v.getUint32(pos, true);
    l.unknown2 = v.getUint32(pos + 4, true);
    l.radius = v.getUint16(pos + 8, true);
  }

  _fixRdbData(block) {
    const rdb = this._blocks[block].dfBlock.rdbBlock;
    if (block === 994) {
      rdb.objectRootList[4].rdbObjects[18].resources.modelResource.modelIndex = 10;
      rdb.objectRootList[4].rdbObjects[18].xPos = 640;
      rdb.objectRootList[5].rdbObjects[8].resources.modelResource.modelIndex = 11;
    } else if (block === 945 || block === 946) {
      rdb.objectRootList[2].rdbObjects = null;
    } else if (block === 958) {
      rdb.objectRootList[0].rdbObjects[36].yPos = -300;
    } else if (block === 975) {
      rdb.objectRootList[0].rdbObjects[24].xPos = 543;
    } else if (block === 1025) {
      let wallModelIndex = 0;
      const modelList = rdb.modelReferenceList;
      for (let i = 0; i < modelList.length; ++i) {
        if (modelList[i].modelIdNum === 0) {
          modelList[i] = { modelId: '72100', modelIdNum: 72100, description: 'DOR' };
          wallModelIndex = i;
          break;
        }
      }

      const corner = rdb.objectRootList[5].rdbObjects[39];
      corner.xPos += 64;
      corner.zPos -= 64;
      const x = corner.xPos;
      const y = corner.yPos;
      const z = corner.zPos;
      corner.resources.modelResource.modelIndex = 35;
      corner.resources.modelResource.yRotation = -512;
      const exit = rdb.objectRootList[8].rdbObjects[0];
      exit.xPos = x;
      exit.zPos = z + 126;
      const start = rdb.objectRootList[4].rdbObjects[5];
      start.xPos = x;
      start.zPos = z;

      const rdbObjects = rdb.objectRootList[8].rdbObjects.slice();
      const wall = {
        position: 0,
        next: 0,
        previous: 0,
        index: rdbObjects.length,
        xPos: x,
        yPos: y,
        zPos: z + 128,
        type: RDB_RESOURCE_TYPES.Model,
        resourceOffset: 0,
        resources: defaultResources(),
      };
      wall.resources.modelResource.modelIndex = wallModelIndex;
      wall.resources.modelResource.yRotation = -512;
      rdbObjects.push(wall);
      rdb.objectRootList[8].rdbObjects = rdbObjects;
    } else if (block === 1034) {
      rdb.objectRootList[4].rdbObjects[38].resources.modelResource.modelIndex = 10;
      rdb.objectRootList[4].rdbObjects[38].resources.modelResource.yRotation = -512;
      rdb.objectRootList[5].rdbObjects[40].resources.modelResource.modelIndex = 10;
      rdb.objectRootList[5].rdbObjects[40].resources.modelResource.yRotation = -2560;

      const rdbObjects = rdb.objectRootList[6].rdbObjects.slice();
      const corridor = {
        position: 0,
        next: 0,
        previous: 0,
        index: rdbObjects.length,
        xPos: 1152,
        yPos: -1792,
        zPos: 1920,
        type: RDB_RESOURCE_TYPES.Model,
        resourceOffset: 0,
        resources: defaultResources(),
      };
      corridor.resources.modelResource.modelIndex = 11;
      corridor.resources.modelResource.yRotation = -512;
      rdbObjects.push(corridor);
      rdb.objectRootList[6].rdbObjects = rdbObjects;

      rdb.objectRootList[2].rdbObjects[0].resources.modelResource.modelIndex = 23;
    } else if (block === 1036) {
      rdb.objectRootList[4].rdbObjects[15].resources.modelResource.modelIndex = 5;

      rdb.objectRootList[5].rdbObjects[34].resources.modelResource.modelIndex = 7;
      rdb.objectRootList[5].rdbObjects[34].resources.modelResource.yRotation = -512;

      const rdbObjects = rdb.objectRootList[5].rdbObjects.slice();
      const corridor = {
        position: 0,
        next: 0,
        previous: 0,
        index: rdbObjects.length,
        xPos: 1152,
        yPos: -384,
        zPos: 1408,
        type: RDB_RESOURCE_TYPES.Model,
        resourceOffset: 0,
        resources: defaultResources(),
      };
      corridor.resources.modelResource.modelIndex = 4;
      corridor.resources.modelResource.yRotation = 512;
      rdbObjects.push(corridor);
      rdb.objectRootList[5].rdbObjects = rdbObjects;
    }
  }
}
