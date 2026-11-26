
import { readCStringScan } from './fileProxy.js';
import { readSpellRecord } from './spellsStd.js';
import { parseCharacterRecordData } from './characterRecord.js';
import { readBuildingData, BUILDING_DATA_SIZE } from './blocksFile.js';

export const SAVETREE_FILENAME = 'SAVETREE.DAT';

export const SAVE_TREE_HEADER_LENGTH = 19;
export const SAVE_TREE_VERSION = 0x126;

export const RECORD_ROOT_LENGTH = 71;
export const LIGHT_DATA_LENGTH_MULTIPLIER = 39;

export const ENVIRONMENTS = Object.freeze({
  Outside: 1, Building: 2, Dungeon: 3,
});

export const RECORD_TYPES = Object.freeze({
  Null: 0x00,
  World: 0x01,
  Item: 0x02,
  Character: 0x03,
  CharacterPositionRecord: 0x04,
  CharacterCamera: 0x05,
  Interactable3dObject: 0x06,
  Light: 0x07,
  NPCFlat: 0x08,
  Spell: 0x09,
  GuildMembership: 0x0a,
  DiseaseOrPoison: 0x0b,
  UnusedClass: 0x0c,
  UnusedKeyword: 0x0d,
  QBNData: 0x0e,
  UnusedKeyHolder: 0x0f,
  QuestHolder: 0x10,
  UnusedNPC: 0x11,
  EnemyMobile: 0x12,
  Trap: 0x13,
  TrappedSoul: 0x14,
  SpellcastingCreatureListHead: 0x16,
  Options: 0x17,
  Logbook: 0x18,
  BankAccount: 0x19,
  UnusedBankInfo: 0x1a,
  UnusedSafetyBox: 0x1b,
  OldClass: 0x1c,
  OldGuild: 0x1d,
  UnusedBless: 0x1e,
  Potion: 0x1f,
  Door: 0x20,
  Treasure: 0x21,
  Marker: 0x22,
  UnusedRumor: 0x23,
  Goods: 0x24,
  UnusedDeed: 0x25,
  House: 0x26,
  NonWorld: 0x27,
  RegionMark: 0x28,
  NPCMark: 0x29,
  OneShot: 0x2a,
  MysteryRecord2: 0x2b,
  Corpse: 0x2c,
  NPC: 0x2d,
  GenericNPC: 0x2e,
  DungeonAutomapData: 0x33,
  Container: 0x34,
  NPCMobile: 0x35,
  ItemLeftForRepair: 0x36,
  TavernRoom: 0x40,
  QuestNPC: 0x41,
});

export const ITEM_FLAGS = Object.freeze({
  None: 0x00,
  IngredientRegular: 0x01,
  OneHandedWeapon: 0x04,
  IngredientLiquid: 0x09,
  BluntWeapon: 0x10,
  Enchanted: 0x20,
});

export { readCStringFixed, readCStringScan } from './fileProxy.js';

export function readPosition(view, offset) {
  return {
    worldX: view.getInt32(offset, true),
    worldY: view.getInt32(offset + 4, true),
    worldZ: view.getInt32(offset + 8, true),
  };
}

/** @param {Uint8Array} bytes */
export function readSaveTreeHeader(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = v.getInt32(0, true);
  if (version !== SAVE_TREE_VERSION)
    throw new Error('SaveTree file has an invalid version number, must be 0x126.');
  return {
    rawData: bytes.slice(0, SAVE_TREE_HEADER_LENGTH),
    version,
    // The player's load position comes from the later CharacterPositionRecord (0x04), not from this header triple.
    characterPosition: { position: readPosition(v, 4) },
    mapId: v.getUint16(16, true),
    environment: bytes[18],
  };
}

/** @returns {{record: object, nextOffset: number}} */
export function readBuildingRecords(bytes, offset) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const streamPosition = offset;
  const recordLength = v.getInt32(offset, true);
  let pos = offset + 4;
  const numberOfBuildings = recordLength > 0 ? Math.trunc(recordLength / BUILDING_DATA_SIZE) : 0;
  const recordData = new Array(numberOfBuildings);
  for (let i = 0; i < numberOfBuildings; i++) {
    recordData[i] = readBuildingData(v, pos);
    pos += BUILDING_DATA_SIZE;
  }
  return {
    record: { streamPosition, recordLength, numberOfBuildings, recordData },
    nextOffset: pos,
  };
}

export function readRecordRoot(streamData) {
  const v = new DataView(streamData.buffer, streamData.byteOffset, streamData.byteLength);
  return {
    pitch: v.getInt16(1, true),
    yaw: v.getInt16(3, true),
    roll: v.getInt16(5, true),
    position: readPosition(v, 7),
    spriteIndex: v.getUint16(27, true),
    picture2: v.getUint16(29, true),
    recordId: v.getUint32(31, true),
    questId: streamData[38],
    parentRecordId: v.getUint32(39, true),
    time: v.getUint32(43, true),
    itemObject: v.getUint32(47, true),
    questObjectId: v.getUint32(51, true),
    nextObject: v.getUint32(55, true),
    childObject: v.getUint32(59, true),
    sublistHead: v.getUint32(63, true),
    parentRecordType: v.getInt32(67, true),
  };
}

export function parseItemRecordData(recordData) {
  const v = new DataView(recordData.buffer, recordData.byteOffset, recordData.byteLength);
  const d = {
    name: readCStringScan(recordData, 0),
    group: v.getUint16(32, true),
    index: v.getUint16(34, true),
    value: v.getUint32(36, true),
    unknown: v.getUint16(40, true),
    flags: v.getUint16(42, true),
    currentCondition: v.getUint16(44, true),
    maxCondition: v.getUint16(46, true),
    unknown2: recordData[48],
    typeDependentData: recordData[49],
    image1: v.getUint16(50, true),
    image2: v.getUint16(52, true),
    material: v.getUint16(54, true),
    color: recordData[56],
    weight: v.getUint32(57, true),
    enchantmentPoints: v.getUint16(61, true),
    message: v.getUint16(63, true),
    variants: recordData[65],
    drawOrderOrEffect: recordData[66],
    magic: [],
  };
  for (let i = 0; i < 10; i++) {
    d.magic.push({
      type: v.getInt16(67 + i * 4, true),
      param: v.getInt16(69 + i * 4, true),
    });
  }
  return d;
}

export function parseGuildMembershipRecordData(recordData) {
  const v = new DataView(recordData.buffer, recordData.byteOffset, recordData.byteLength);
  return {
    rank: recordData[0],
    notedByGuild: recordData[1],
    guildType: recordData[2],
    factionId: v.getUint16(3, true),
    timeOfLastRankChange: v.getUint32(5, true),
    unused: recordData[9],
    blessingMagnitude: recordData[10],
    unused2: v.getUint16(11, true),
  };
}

// `daysOfSymptomsLeft` uses 0xFF for never-ending and 0xFE for symptoms over.
export function parseDiseaseOrPoisonRecordData(recordData) {
  const v = new DataView(recordData.buffer, recordData.byteOffset, recordData.byteLength);
  const u16 = (o) => v.getUint16(o, true);
  return {
    id: recordData[0],
    damagesSTR: u16(1), damagesINT: u16(3), damagesWIL: u16(5),
    damagesAGI: u16(7), damagesEND: u16(9), damagesPER: u16(11),
    damagesSPD: u16(13), damagesLUC: u16(15), damagesHEA: u16(17),
    damagesFAT: u16(19), damagesSPL: u16(21),
    minDamage: u16(23), maxDamage: u16(25),
    daysOfSymptomsLeft: u16(27), incubationOver: u16(29),
    totaldamageSTR: u16(31), totaldamageINT: u16(33), totaldamageWIL: u16(35),
    totaldamageAGI: u16(37), totaldamageEND: u16(39), totaldamagePER: u16(41),
    totaldamageSPD: u16(43), totaldamageLUC: u16(45),
  };
}

// A container's root `spriteIndex` names its kind, and 4 is the wagon.
export const isWagonRecord = (record) => record.recordRoot?.spriteIndex === 4;

/**
 * @typedef {object} SaveTreeRecord
 * @property {number} streamPosition
 * @property {number} streamLength
 * @property {Uint8Array|null} streamData
 * @property {number} recordType
 * @property {object|null} recordRoot
 * @property {Uint8Array|null} recordData
 * @property {any} parsedData
 * @property {SaveTreeRecord|null} parent
 * @property {SaveTreeRecord[]} children
 * @property {boolean} failedRecord
 */

/** @returns {{record: SaveTreeRecord, nextOffset: number}} */
export function readSaveTreeRecord(bytes, offset, length) {
  const record = {
    streamPosition: offset,
    streamLength: length,
    streamData: null,
    recordType: RECORD_TYPES.Null,
    recordRoot: null,
    recordData: null,
    parsedData: null,
    parent: null,
    children: [],
    failedRecord: false,
  };
  if (length <= 0) return { record, nextOffset: offset };

  record.recordType = bytes[offset];
  if (record.recordType === RECORD_TYPES.Light)
    record.streamLength = length * LIGHT_DATA_LENGTH_MULTIPLIER;

  // A Light record's multiplied length can run past the end of the stream, because the overflow guard checks the
  // stored length. `slice` clamps, as DFU's ReadBytes does.
  record.streamData = bytes.slice(offset, offset + record.streamLength);

  // A record shorter than its 71-byte root gets an all-zero root, as in DFU, so it is keyed by RecordID 0.
  if (record.streamData.length < RECORD_ROOT_LENGTH) {
    record.failedRecord = true;
    record.recordRoot = {
      pitch: 0, yaw: 0, roll: 0,
      position: { worldX: 0, worldY: 0, worldZ: 0 },
      spriteIndex: 0, picture2: 0, recordId: 0, questId: 0,
      parentRecordId: 0, time: 0, itemObject: 0, questObjectId: 0,
      nextObject: 0, childObject: 0, sublistHead: 0, parentRecordType: 0,
    };
    return { record, nextOffset: offset + record.streamLength };
  }
  record.recordRoot = readRecordRoot(record.streamData);
  record.recordData = record.streamData.subarray(RECORD_ROOT_LENGTH);

  switch (record.recordType) {
    case RECORD_TYPES.Item:
      record.parsedData = parseItemRecordData(record.recordData);
      break;
    case RECORD_TYPES.Character:
      record.parsedData = parseCharacterRecordData(record.recordData);
      break;
    case RECORD_TYPES.Spell:
      record.parsedData = readSpellRecord(record.recordData);
      break;
    case RECORD_TYPES.GuildMembership:
    case RECORD_TYPES.OldGuild:
      record.parsedData = parseGuildMembershipRecordData(record.recordData);
      break;
    case RECORD_TYPES.DiseaseOrPoison:
      record.parsedData = parseDiseaseOrPoisonRecordData(record.recordData);
      break;
    case RECORD_TYPES.TrappedSoul:
      record.parsedData = { unknown: record.recordData.slice() };
      break;
    case RECORD_TYPES.Container:
      record.parsedData = { unknown: record.recordData.slice() };
      break;
    default:
      break;
  }

  return { record, nextOffset: offset + record.streamLength };
}

export class SaveTree {
  constructor() {
    this.header = null;
    this.buildingRecords = null;
    this.rootRecord = this._emptyRecord();
    /** @type {Map<number, object>} */
    this.recordDictionary = new Map();
    this.duplicateKeysFound = 0;
  }

  _emptyRecord() {
    return {
      streamPosition: 0, streamLength: 0, streamData: null,
      recordType: RECORD_TYPES.Null, recordRoot: null, recordData: null,
      parsedData: null, parent: null, children: [], failedRecord: false,
    };
  }

  /**
   * @param {Uint8Array|ArrayBuffer} buffer
   * @returns {boolean}
   */
  load(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    this.header = readSaveTreeHeader(bytes);
    const buildings = readBuildingRecords(bytes, SAVE_TREE_HEADER_LENGTH);
    this.buildingRecords = buildings.record;
    this._readRecords(bytes, buildings.nextOffset);
    return true;
  }

  findRecord(type, root = null) {
    const records = this.findRecords(type, root);
    return records.length === 0 ? null : records[0];
  }

  findRecords(type, root = null) {
    const list = [];
    const walk = (record) => {
      if (record.recordType === type) list.push(record);
      for (const child of record.children) walk(child);
    };
    walk(root ?? this.rootRecord);
    return list;
  }

  filterRecordsByParentType(source, parentType) {
    return source.filter((r) => r.parent !== null && r.parent.recordType === parentType);
  }

  _readRecords(bytes, offset) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.recordDictionary.clear();
    this.duplicateKeysFound = 0;
    this.rootRecord = this._emptyRecord();
    let pos = offset;
    while (pos < bytes.length) {
      const length = v.getInt32(pos, true);
      pos += 4;
      if (length <= 0) continue;

      // The guard uses `>=` as DFU does, so a record that ends exactly at the end of the file is rejected and
      // reading stops.
      if (pos + length >= bytes.length) break;

      const { record, nextOffset } = readSaveTreeRecord(bytes, pos, length);
      pos = nextOffset;

      // Duplicate RecordIDs are counted and dropped, never overwritten, as DFU's AddRecord does.
      const key = record.recordRoot.recordId;
      if (this.recordDictionary.has(key)) {
        this.duplicateKeysFound++;
        continue;
      }
      this.recordDictionary.set(key, record);
    }

    for (const record of this.recordDictionary.values()) {
      const parent = this.recordDictionary.get(record.recordRoot.parentRecordId);
      if (parent !== undefined) {
        record.parent = parent;
        parent.children.push(record);
      } else {
        this.rootRecord.children.push(record);
      }
    }
  }
}
