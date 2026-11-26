// Getters return null on failure where DFU returns an unloaded default object; callers guard with `?.`.
// `loadRegion` caches recent regions that DFU re-reads on every call.

import { cromwarkSettlementRemoved, filterCromwarkSettlementLookups } from '../world/wild/cromwarkSettlements.js';
import { BsaFile, DIRECTORY_TYPES } from './bsaFile.js';
import { worldDataDoor } from './worldDataDoor.js';
import { PakFile } from './pakFile.js';
import { readBuildingData, BUILDING_DATA_SIZE } from './blocksFile.js';
import { HeldRecords } from './heldRecords.js';
import { REGION_NAMES, REGION_RACES, CLIMATES, MAX_MAP_PIXEL_X, MAX_MAP_PIXEL_Y } from './mapsTables.js';
export { REGION_NAMES, REGION_RACES, CLIMATES, MAX_MAP_PIXEL_X, MAX_MAP_PIXEL_Y };

export const WORLD_MAP_TERRAIN_DIM = 32768;
export const WORLD_MAP_TILE_DIM = 128;
export const WORLD_MAP_RMB_DIM = 4096;

// Saves without a stored region index read 0. As in DFU, it re-scans only when the index is 0 and the stored name
// differs from REGION_NAMES[0]; an unknown name falls back to 0.
export function patchRegionIndex(regionIndex, canonicalRegionName) {
  if (regionIndex === 0 && canonicalRegionName !== REGION_NAMES[regionIndex]) {
    regionIndex = REGION_NAMES.indexOf(canonicalRegionName);
    if (regionIndex === -1) regionIndex = 0;
  }
  return regionIndex;
}

export const REGION_TEMPLES = Object.freeze([
  106, 82, 0, 0, 0, 98, 0, 0, 0, 92,
  0, 106, 0, 0, 0, 84, 36, 36, 84, 88,
  82, 88, 98, 92, 0, 0, 82, 0, 0, 0,
  0, 0, 88, 94, 36, 94, 106, 84, 106, 106,
  88, 98, 82, 98, 84, 94, 36, 88, 94, 36,
  98, 84, 106, 88, 106, 88, 92, 84, 98, 88,
  82, 94,
]);

export const RMB_BLOCK_PREFIXES = Object.freeze([
  'TVRN', 'GENR', 'RESI', 'WEAP', 'ARMR', 'ALCH', 'BANK', 'BOOK',
  'CLOT', 'FURN', 'GEMS', 'LIBR', 'PAWN', 'TEMP', 'TEMP', 'PALA',
  'FARM', 'DUNG', 'CAST', 'MANR', 'SHRI', 'RUIN', 'SHCK', 'GRVE',
  'FILL', 'KRAV', 'KDRA', 'KOWL', 'KMOO', 'KCAN', 'KFLA', 'KHOR',
  'KROS', 'KWHE', 'KSCA', 'KHAW', 'MAGE', 'THIE', 'DARK', 'FIGH',
  'CUST', 'WALL', 'MARK', 'SHIP', 'WITC',
]);

const LETTER2_ARRAY = ['A', 'L', 'M', 'S'];

const RDB_BLOCK_LETTERS = ['N', 'W', 'L', 'S', 'B', 'M'];

export const LOCATION_TYPES = Object.freeze({
  TownCity: 0, TownHamlet: 1, TownVillage: 2, HomeFarms: 3,
  DungeonLabyrinth: 4, ReligionTemple: 5, Tavern: 6, DungeonKeep: 7,
  HomeWealthy: 8, ReligionCult: 9, DungeonRuin: 10, HomePoor: 11,
  Graveyard: 12, Coven: 13, HomeYourShips: 14, None: 0xffff,
});

export const DUNGEON_TYPES = Object.freeze({
  Crypt: 0, OrcStronghold: 1, HumanStronghold: 2, Prison: 3,
  DesecratedTemple: 4, Mine: 5, NaturalCave: 6, Coven: 7,
  VampireHaunt: 8, Laboratory: 9, HarpyNest: 10, RuinedCastle: 11,
  SpiderNest: 12, GiantStronghold: 13, DragonsDen: 14,
  BarbarianStronghold: 15, VolcanicCaves: 16, ScorpionNest: 17,
  Cemetery: 18, NoDungeon: 255,
});

export const CLIMATE_BASE_TYPES = Object.freeze({
  None: -1, Desert: 0, Mountain: 100, Temperate: 300, Swamp: 400,
});

export const CLIMATE_NATURE = Object.freeze({
  RainForest: 500, SubTropical: 501, Swamp: 502, Desert: 503,
  TemperateWoodland: 504, WoodlandHills: 506, HauntedWoodlands: 508,
  Mountains: 510,
});

export const FACTION_RACES = Object.freeze({
  None: -1, Nord: 0, Khajiit: 1, Redguard: 2, Breton: 3,
});

export const DEFAULT_CLIMATE = 231;

export function longitudeLatitudeToMapPixel(longitude, latitude) {
  return { x: Math.trunc(longitude / 128), y: 499 - Math.trunc(latitude / 128) };
}

export function mapPixelToLongitudeLatitude(mapPixelX, mapPixelY) {
  return { x: mapPixelX * 128, y: (499 - mapPixelY) * 128 };
}

export function getMapPixelID(mapPixelX, mapPixelY) {
  return mapPixelY * 1000 + mapPixelX;
}

export function getPixelFromPixelID(pixelID) {
  const x = pixelID % 1000;
  return { x, y: (pixelID - x) / 1000 };
}

export function mapPixelToWorldCoord(mapPixelX, mapPixelY) {
  return { x: mapPixelX * 32768, y: (499 - mapPixelY) * 32768 };
}

export function worldCoordToMapPixel(worldX, worldZ) {
  return { x: Math.trunc(worldX / 32768), y: 499 - Math.trunc(worldZ / 32768) };
}

export function getWorldClimateSettings(worldClimate) {
  const s = { worldClimate };
  switch (worldClimate) {
    case CLIMATES.Ocean:
      s.climateType = CLIMATE_BASE_TYPES.Swamp;
      s.groundArchive = 402;
      s.natureArchive = CLIMATE_NATURE.TemperateWoodland;
      s.skyBase = 24;
      s.people = FACTION_RACES.Breton;
      break;
    case CLIMATES.Desert:
    case CLIMATES.Desert2:
      s.climateType = CLIMATE_BASE_TYPES.Desert;
      s.groundArchive = 2;
      s.natureArchive = CLIMATE_NATURE.Desert;
      s.skyBase = 8;
      s.people = FACTION_RACES.Redguard;
      break;
    case CLIMATES.Mountain:
      s.climateType = CLIMATE_BASE_TYPES.Mountain;
      s.groundArchive = 102;
      s.natureArchive = CLIMATE_NATURE.Mountains;
      s.skyBase = 0;
      s.people = FACTION_RACES.Nord;
      break;
    case CLIMATES.Rainforest:
      s.climateType = CLIMATE_BASE_TYPES.Swamp;
      s.groundArchive = 402;
      s.natureArchive = CLIMATE_NATURE.RainForest;
      s.skyBase = 24;
      s.people = FACTION_RACES.Redguard;
      break;
    case CLIMATES.Swamp:
      s.climateType = CLIMATE_BASE_TYPES.Swamp;
      s.groundArchive = 402;
      s.natureArchive = CLIMATE_NATURE.Swamp;
      s.skyBase = 24;
      s.people = FACTION_RACES.Breton;
      break;
    case CLIMATES.Subtropical:
      s.climateType = CLIMATE_BASE_TYPES.Desert;
      s.groundArchive = 2;
      s.natureArchive = CLIMATE_NATURE.SubTropical;
      s.skyBase = 24;
      s.people = FACTION_RACES.Breton;
      break;
    case CLIMATES.MountainWoods:
      s.climateType = CLIMATE_BASE_TYPES.Temperate;
      s.groundArchive = 102;
      s.natureArchive = CLIMATE_NATURE.WoodlandHills;
      s.skyBase = 16;
      s.people = FACTION_RACES.Breton;
      break;
    case CLIMATES.Woodlands:
      s.climateType = CLIMATE_BASE_TYPES.Temperate;
      s.groundArchive = 302;
      s.natureArchive = CLIMATE_NATURE.TemperateWoodland;
      s.skyBase = 16;
      s.people = FACTION_RACES.Breton;
      break;
    case CLIMATES.HauntedWoodlands:
      s.climateType = CLIMATE_BASE_TYPES.Temperate;
      s.groundArchive = 302;
      s.natureArchive = CLIMATE_NATURE.HauntedWoodlands;
      s.skyBase = 16;
      s.people = FACTION_RACES.Breton;
      break;
    default:
      s.climateType = CLIMATE_BASE_TYPES.Temperate;
      s.groundArchive = 302;
      s.natureArchive = CLIMATE_NATURE.TemperateWoodland;
      s.skyBase = 16;
      s.people = FACTION_RACES.Breton;
      break;
  }
  s.natureSet = s.natureArchive;
  return s;
}

export const REGIONS_HELD_MAX = 64;

export class MapsFile {
  constructor() {
    this._bsa = null;
    this._regions = null;
    this.autoDiscard = true;
    this._lastRegion = -1;
    this._held = new HeldRecords(REGIONS_HELD_MAX, (region) => { this._regions[region] = null; });
    this.climatePak = new PakFile();
    this.politicPak = new PakFile();
    this._isReady = false;
  }

  static get filename() {
    return 'MAPS.BSA';
  }

  get regionCount() {
    return this._bsa ? Math.trunc(this._bsa.count / 4) : 0;
  }

  get ready() {
    return this._isReady;
  }

  /**
   * @param {Uint8Array} mapsBytes
   * @param {Uint8Array} climateBytes
   * @param {Uint8Array} politicBytes
   * @returns {boolean}
   */
  load(mapsBytes, climateBytes, politicBytes) {
    this._isReady = false;
    this.climatePak.load(climateBytes);
    this.politicPak.load(politicBytes);

    this._bsa = new BsaFile(mapsBytes);
    if (this._bsa.directoryType !== DIRECTORY_TYPES.NameRecord) return false;
    this._regions = new Array(this.regionCount).fill(null);
    this._isReady = true;
    return true;
  }

  getRegionName(region) {
    if (region < 0 || region >= this.regionCount) return '';
    return REGION_NAMES[region];
  }

  getRegionIndex(name) {
    for (let i = 0; i < this.regionCount; i++) {
      if (REGION_NAMES[i] === name) return i;
    }
    return -1;
  }

  loadRegion(region) {
    if (region < 0 || region >= this.regionCount) return false;
    const held = this._regions[region];
    if (held !== null) {
      const door = worldDataDoor();
      if (held.door === door) {
        // The world-data door tracks what it already added per region, so calling it again adds only new locations.
        door?.getDFRegionAdditionalLocationData(region, held.dfRegion);
        filterCromwarkSettlementLookups(held.dfRegion, region);
        if (this.autoDiscard) this._held.hold(region);
        return true;
      }
      this.discardRegion(region);
    }

    // The four records are views into the MAPS.BSA buffer, so the readers must never write to them.
    const record = region * 4;
    const rec = {
      name: REGION_NAMES[region],
      mapPItem: this._bsa.getRecordView(record),
      mapDItem: this._bsa.getRecordView(record + 1),
      mapTable: this._bsa.getRecordView(record + 2),
      mapNames: this._bsa.getRecordView(record + 3),
      dfRegion: null,
      door: worldDataDoor(),
    };
    if (
      rec.mapNames.length === 0 || rec.mapTable.length === 0 ||
      rec.mapPItem.length === 0 || rec.mapDItem.length === 0
    ) {
      return false;
    }
    this._regions[region] = rec;

    if (!this._readRegion(region)) {
      this.discardRegion(region);
      return false;
    }

    rec.door?.getDFRegionAdditionalLocationData(region, rec.dfRegion);
    filterCromwarkSettlementLookups(rec.dfRegion, region);

    this._lastRegion = region;
    if (this.autoDiscard) this._held.hold(region);
    return true;
  }

  discardRegion(region) {
    if (region < 0 || region >= this.regionCount) return;
    this._regions[region] = null;
    this._held.forget(region);
  }

  getRegion(region) {
    if (!this.loadRegion(region)) return null;
    return this._regions[region].dfRegion;
  }

  // World-data mod locations are appended after the region's own MAPNAMES entries, so an index below this count is
  // a classic location.
  baseLocationCount(region) {
    if (!this.loadRegion(region)) return 0;
    return this._readLocationCount(region);
  }

  getRegionByName(name) {
    const region = this.getRegionIndex(name);
    if (region === -1) return null;
    return this.getRegion(region);
  }

  getLocation(region, location) {
    if (!this.loadRegion(region)) return null;

    if (cromwarkSettlementRemoved(this._regions[region].dfRegion.mapTable[location]?.mapId)) return null;
    const dfLocation = this._readLocation(region, location);
    if (!dfLocation) return null;

    dfLocation.regionIndex = region;
    dfLocation.locationIndex = location;
    worldDataDoor()?.editLocation?.(dfLocation, this);
    return dfLocation;
  }

  getLocationByName(regionName, locationName) {
    const region = this.getRegionIndex(regionName);
    if (!this.loadRegion(region)) return null;
    const dfRegion = this._regions[region].dfRegion;
    if (!dfRegion.mapNameLookup.has(locationName)) return null;
    return this.getLocation(region, dfRegion.mapNameLookup.get(locationName));
  }

  getRmbBlockName(dfLocation, x, y) {
    // Tells the world-data door which town is being read, so a town saved in another layout reads its blocks from
    // that layout.
    if (Number.isInteger(dfLocation.regionIndex) && Number.isInteger(dfLocation.locationIndex)) worldDataDoor()?.noteReadingLocation?.(dfLocation.regionIndex, dfLocation.locationIndex);
    const index = y * dfLocation.exterior.exteriorData.width + x;
    return dfLocation.exterior.exteriorData.blockNames[index];
  }

  // The 8-bit truncation of 2 * blockCharacter before the shift matches DFU and is required.
  resolveRmbBlockName(dfLocation, blockIndex, blockNumber, blockCharacter) {
    const prefix = RMB_BLOCK_PREFIXES[blockIndex];

    let letter1;
    if ((blockCharacter & 0x10) !== 0) {
      letter1 = String.fromCharCode(dfLocation.exterior.exteriorData.letter1ForRMBName);
    } else {
      letter1 = 'A';
    }

    const letter2 = LETTER2_ARRAY[((2 * blockCharacter) & 0xff) >> 6];

    let numbers;
    if (blockIndex === 13 || blockIndex === 14) {
      numbers = String.fromCharCode((blockCharacter & 0xf) + 65) + String(blockNumber);
    } else {
      numbers = String(blockNumber).padStart(2, '0');
    }

    return prefix + letter1 + letter2 + numbers + '.RMB';
  }

  // The +1 on X lines the PAK up with the height map, as in DFU.
  getClimateIndex(mapPixelX, mapPixelY) {
    return this.climatePak.getValue(mapPixelX + 1, mapPixelY);
  }

  // The +1 on X lines the PAK up with the height map, as in DFU.
  getPoliticIndex(mapPixelX, mapPixelY) {
    return this.politicPak.getValue(mapPixelX + 1, mapPixelY);
  }

  // Reads the politic map, which covers every pixel, so it works in the wilderness where no location exists. A
  // second method named `getRegionIndex` would replace the by-name lookup.
  getRegionIndexAt(mapPixelX, mapPixelY) {
    const politicIndex = this.getPoliticIndex(mapPixelX, mapPixelY);
    let result = politicIndex === 64 ? 31 : politicIndex - 128;
    // 105 is a known bad politic value, which DFU maps to region 16, the Wrothgarian Mountains.
    if (result === 105) result = 16;
    if (result < 0 || result >= 62) result = 0;
    return result;
  }

  readLocationIdFast(region, location) {
    const rec = this._regions[region];
    // A location added by the world-data door carries its id on the map table, so the BSA is not read for it.
    const entry = rec.dfRegion?.mapTable?.[location];
    if (cromwarkSettlementRemoved(entry?.mapId)) return 0;
    if (entry?.locationId) return entry.locationId;
    const v = new DataView(rec.mapPItem.buffer, rec.mapPItem.byteOffset, rec.mapPItem.byteLength);
    const locationCount = this._readLocationCount(region);
    let pos = v.getUint32(location * 4, true) + locationCount * 4;
    const doorCount = v.getUint32(pos, true);
    pos += 4 + doorCount * 6;
    pos += 33;
    return v.getUint16(pos, true);
  }

  _readRegion(region) {
    try {
      const rec = this._regions[region];
      rec.dfRegion = {
        name: REGION_NAMES[region],
        locationCount: 0,
        mapNames: null,
        mapTable: null,
        mapNameLookup: new Map(),
        mapIdLookup: new Map(),
      };
      this._readMapNames(region);
      this._readMapTable(region);
    } catch (e) {
      return false;
    }
    return true;
  }

  _readCStringSkip(bytes, r, stride) {
    // Unlike DFU, the terminator scan stops at the record end instead of throwing, which would fail the whole
    // region. Classic MAPS.BSA never reaches that end.
    let end = r.pos;
    while (end < bytes.byteLength && bytes[end] !== 0) end++;
    let s = '';
    for (let i = r.pos; i < end; i++) s += String.fromCharCode(bytes[i]);
    r.pos += stride;
    return s;
  }

  _readMapNames(region) {
    const rec = this._regions[region];
    const bytes = rec.mapNames;
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const dfRegion = rec.dfRegion;

    dfRegion.locationCount = v.getUint32(0, true);
    dfRegion.mapNames = new Array(dfRegion.locationCount);

    const r = { pos: 4 };
    for (let i = 0; i < dfRegion.locationCount; i++) {
      let mapName = this._readCStringSkip(bytes, r, 32);
      // Two classic names fill all 32 bytes with no terminator, so the scan runs into the next slot. The cap keeps
      // the name correct, and the next name still starts at its 32-byte stride.
      if (mapName.length > 32) mapName = mapName.slice(0, 32);
      dfRegion.mapNames[i] = mapName;
      if (!dfRegion.mapNameLookup.has(mapName)) dfRegion.mapNameLookup.set(mapName, i);
    }
  }

  _readMapTable(region) {
    const rec = this._regions[region];
    const bytes = rec.mapTable;
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const dfRegion = rec.dfRegion;

    dfRegion.mapTable = new Array(dfRegion.locationCount);
    let pos = 0;
    for (let i = 0; i < dfRegion.locationCount; i++) {
      const mapId = v.getInt32(pos, true);
      const bitfield = v.getUint32(pos + 4, true);
      const entry = {
        mapId,
        longitude: (bitfield & 0x1ffffff) >>> 8,
        // Matches C# uint math for (4 * bitfield) >> 27: the top two bits drop off before the shift.
        locationType: (bitfield << 2) >>> 27,
        discovered: ((bitfield >>> 24) & 0x40) !== 0,
        latitude: (v.getInt32(pos + 8, true) & 0xffffff) >>> 8,
        dungeonType: bytes[pos + 12],
        key: v.getUint32(pos + 13, true),
        locationId: 0,
      };
      pos += 17;
      dfRegion.mapTable[i] = entry;
      if (!dfRegion.mapIdLookup.has(entry.mapId)) dfRegion.mapIdLookup.set(entry.mapId, i);
    }
  }

  _readLocationCount(region) {
    const bytes = this._regions[region].mapNames;
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
  }

  /** @returns {object|null} */
  readClassicLocation(region, location) {
    if (!this.loadRegion(region)) return null;
    const dfLocation = this._readClassicLocation(region, location);
    if (!dfLocation) return null;
    dfLocation.regionIndex = region;
    dfLocation.locationIndex = location;
    return dfLocation;
  }

  /** @returns {boolean} */
  locationReplaced(region, location) {
    return !!worldDataDoor()?.getDFLocationReplacementData(region, location, this);
  }

  _readLocation(region, location) {
    const replacement = worldDataDoor()?.getDFLocationReplacementData(region, location, this);
    if (replacement) return replacement;
    return this._readClassicLocation(region, location);
  }

  _readClassicLocation(region, location) {
    try {
      const rec = this._regions[region];
      const dfLocation = {
        loaded: false,
        regionName: REGION_NAMES[region],
        name: '',
        regionIndex: 0,
        locationIndex: 0,
        hasDungeon: false,
        politic: 0,
        climate: null,
        mapTableData: null,
        exterior: {
          recordElement: null,
          buildingCount: 0,
          unknown1: null,
          buildings: null,
          exteriorData: null,
        },
        dungeon: { recordElement: null, header: null, blocks: null },
      };

      this._readMapPItem(region, location, dfLocation);
      this._readMapDItem(region, dfLocation);

      dfLocation.mapTableData = rec.dfRegion.mapTable[location];
      this._readClimatePoliticData(dfLocation);

      dfLocation.loaded = true;
      return dfLocation;
    } catch (e) {
      return null;
    }
  }

  _readClimatePoliticData(dfLocation) {
    const pos = longitudeLatitudeToMapPixel(
      dfLocation.mapTableData.longitude,
      dfLocation.mapTableData.latitude
    );
    dfLocation.politic = this.politicPak.getValue(pos.x, pos.y);
    const worldClimate = this.climatePak.getValue(pos.x, pos.y);
    dfLocation.climate = getWorldClimateSettings(worldClimate);
  }

  _readMapPItem(region, location, dfLocation) {
    const rec = this._regions[region];
    const bytes = rec.mapPItem;
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const locationCount = this._readLocationCount(region);

    const r = { pos: v.getUint32(location * 4, true) + locationCount * 4 };

    dfLocation.name = rec.dfRegion.mapNames[location];

    dfLocation.exterior.recordElement = this._readLocationRecordElement(bytes, v, r);

    dfLocation.exterior.buildingCount = v.getUint16(r.pos, true);
    dfLocation.exterior.unknown1 = bytes.slice(r.pos + 2, r.pos + 7);
    r.pos += 7;

    const buildings = new Array(dfLocation.exterior.buildingCount);
    for (let b = 0; b < buildings.length; b++) {
      buildings[b] = readBuildingData(v, r.pos);
      r.pos += BUILDING_DATA_SIZE;
    }
    dfLocation.exterior.buildings = buildings;

    const ext = {};
    ext.anotherName = this._readCStringSkip(bytes, r, 32);
    ext.mapId = v.getInt32(r.pos, true);
    ext.locationId = v.getUint32(r.pos + 4, true);
    ext.width = bytes[r.pos + 8];
    ext.height = bytes[r.pos + 9];
    ext.unknown2 = bytes.slice(r.pos + 10, r.pos + 14);
    ext.letter1ForRMBName = bytes[r.pos + 14];
    ext.portTownAndUnknown = bytes[r.pos + 15];
    ext.unknown3 = bytes[r.pos + 16];
    r.pos += 17;
    ext.blockIndex = bytes.slice(r.pos, r.pos + 64);
    ext.blockNumber = bytes.slice(r.pos + 64, r.pos + 128);
    ext.blockCharacter = bytes.slice(r.pos + 128, r.pos + 192);
    r.pos += 192;
    ext.unknown4 = bytes.slice(r.pos, r.pos + 34);
    r.pos += 34 + 8 + 1;
    ext.unknown5 = new Array(22);
    for (let i = 0; i < 22; i++) {
      ext.unknown5[i] = v.getUint32(r.pos, true);
      r.pos += 4;
    }
    r.pos += 40;
    ext.unknown6 = v.getUint32(r.pos, true);
    r.pos += 4;
    dfLocation.exterior.exteriorData = ext;

    const totalBlocks = ext.width * ext.height;
    ext.blockNames = new Array(totalBlocks);
    for (let i = 0; i < totalBlocks; i++) {
      ext.blockNames[i] = this.resolveRmbBlockName(
        dfLocation,
        ext.blockIndex[i],
        ext.blockNumber[i],
        ext.blockCharacter[i]
      );
    }
  }

  _readLocationRecordElement(bytes, v, r) {
    const doorCount = v.getUint32(r.pos, true);
    r.pos += 4;
    const doors = new Array(doorCount);
    for (let door = 0; door < doorCount; door++) {
      doors[door] = {
        buildingDataIndex: v.getUint16(r.pos, true),
        nullValue: bytes[r.pos + 2],
        mask: bytes[r.pos + 3],
        unknown1: bytes[r.pos + 4],
        unknown2: bytes[r.pos + 5],
      };
      r.pos += 6;
    }

    const header = {
      alwaysOne1: v.getUint32(r.pos, true),
      x: v.getInt32(r.pos + 7, true),
      y: v.getInt32(r.pos + 15, true),
      isExterior: v.getUint16(r.pos + 19, true),
      unknown1: v.getUint32(r.pos + 23, true),
      unknown2: v.getUint32(r.pos + 27, true),
      alwaysOne2: v.getUint16(r.pos + 31, true),
      locationId: v.getUint16(r.pos + 33, true),
      isInterior: v.getUint16(r.pos + 39, true),
      exteriorLocationId: v.getUint32(r.pos + 41, true),
      locationName: '',
    };
    r.pos += 45 + 26;
    header.locationName = this._readCStringSkip(bytes, r, 32);
    r.pos += 9;

    return { doorCount, doors, header };
  }

  _readMapDItem(region, dfLocation) {
    const rec = this._regions[region];
    const bytes = rec.mapDItem;
    dfLocation.hasDungeon = false;
    if (bytes.byteLength === 0) return;

    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    const locationId = dfLocation.exterior.recordElement.header.locationId;
    const dungeonCount = v.getUint32(0, true);
    let pos = 4;
    let found = false;
    let offset = 0;
    for (let i = 0; i < dungeonCount; i++) {
      offset = v.getUint32(pos, true);
      const exteriorLocationId = v.getUint16(pos + 6, true);
      pos += 8;
      if (exteriorLocationId === locationId) {
        found = true;
        break;
      }
    }
    if (!found) return;

    const r = { pos: 4 + dungeonCount * 8 + offset };

    dfLocation.dungeon.recordElement = this._readLocationRecordElement(bytes, v, r);

    const header = {
      unknown1: v.getUint32(r.pos + 2, true),
      unknown2: v.getUint32(r.pos + 6, true),
      blockCount: v.getUint16(r.pos + 10, true),
      unknown3: bytes.slice(r.pos + 12, r.pos + 17),
    };
    r.pos += 17;
    dfLocation.dungeon.header = header;

    const blocks = new Array(header.blockCount);
    for (let i = 0; i < header.blockCount; i++) {
      const x = v.getInt8(r.pos);
      const z = v.getInt8(r.pos + 1);
      const bitfield = v.getUint16(r.pos + 2, true);
      r.pos += 4;
      const blockNumber = bitfield & 0x3ff;
      const isStartingBlock = (bitfield & 0x400) === 0x400;
      const blockIndex = bitfield >> 11;
      blocks[i] = {
        x,
        z,
        blockNumberStartIndexBitfield: bitfield,
        blockNumber,
        isStartingBlock,
        blockIndex,
        blockName: `${RDB_BLOCK_LETTERS[blockIndex]}${String(blockNumber).padStart(7, '0')}.RDB`,
      };
    }
    dfLocation.dungeon.blocks = blocks;

    // Orsinium (location 50015) has a border block that overlaps another, so it moves to z = -2, as in classic.
    if (dfLocation.dungeon.recordElement.header.locationId === 50015) {
      dfLocation.dungeon.blocks[13].z = -2;
    }

    dfLocation.hasDungeon = true;
  }
}
