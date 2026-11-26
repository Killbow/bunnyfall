import { getBool } from '../platform/settings.js';
import { isOnlinePage } from '../platform/onlineLane.js';
import { NO_VARIANT, makeLocationKey, getLocationVariant, getBlockVariantHere, getBuildingVariantHere, setNewLocationIndexResolver, readingLocationKeyOf, noteReadingLocation } from '../world/worldDataVariants.js';
import { LOCATION_TYPES, DUNGEON_TYPES, getWorldClimateSettings, REGION_NAMES } from './mapsFile.js';
import { BLOCK_TYPES, RDB_RESOURCE_TYPES } from './blocksFile.js';
import { BUILDING_TYPES } from '../world/buildingNames.js';
import { setWorldDataDoor } from './worldDataDoor.js';
import { curateBlockPeople } from '../world/curatedPeople.js';
import { curateBlockPlacements } from '../world/curatedPlacements.js';

export const AUTO_MAP_DATA_SIZE = 64 * 64;
export const EDITOR_LOCATION_PREFIX = 'locationnew-bunnyfall-';
const NO_REPLACEMENT = Symbol('noReplacement');
export { makeLocationKey };

export const assetInjectionOn = () => getBool('Enhancements', 'AssetInjection');
// The door is latched once per game and always open online. Closing it mid-game would leave holes where the boot's
// location index expects pack blocks.
let _doorLatched = null;
export function latchWorldDataDoor() { _doorLatched = assetInjectionOn() || isOnlinePage(); return _doorLatched; }
export const worldDataDoorOpen = () => _doorLatched ?? (assetInjectionOn() || isOnlinePage());
const worldDataOn = worldDataDoorOpen;

// Each file name keeps every mod's entry, highest priority first, and the first enabled one is served, so a
// disabled mod never hides the one under it.
const _assets = new Map();
function addAssetEntry(fileName, entry) {
  const list = _assets.get(fileName) ?? [];
  const mine = list.findIndex((e) => (e.vendor ?? null) === (entry.vendor ?? null));
  if (mine >= 0) list.splice(mine, 1);
  let at = list.findIndex((e) => e.priority <= entry.priority);
  if (at < 0) at = list.length;
  list.splice(at, 0, entry);
  _assets.set(fileName, list);
}
export function registerWorldDataAsset(fileName, json, isOn = null, { priority = 0, vendor = null } = {}) {
  if (!fileName || json == null) return false;
  addAssetEntry(fileName, { json, get: null, isOn: typeof isOn === 'function' ? isOn : null, priority, vendor });
  return true;
}
export function registerWorldDataPack(pack, isOn = null, { priority = 0 } = {}) {
  if (!pack?.names) return 0;
  let n = 0;
  for (const name of pack.names()) {
    addAssetEntry(name, { json: null, get: (maps) => pack.rebuild(name, maps), isOn: typeof isOn === 'function' ? isOn : null, priority, vendor: pack.vendor });
    n++;
  }
  return n;
}
function assetOn(a) {
  if (!a) return false;
  const pin = a.vendor ? pinHere() : null;
  if (pin?.in?.has(a.vendor)) return true;
  if (pin?.out?.has(a.vendor)) return false;
  return a.isOn?.() ?? true;
}
export const worldDataVendorCarries = (vendor, fileName) => (_assets.get(fileName) ?? []).some((a) => a.vendor === vendor);
function liveAsset(fileName) {
  for (const a of _assets.get(fileName) ?? []) if (assetOn(a)) return a;
  return null;
}
const _refused = new Set();
function assetJson(a, fileName, maps) {
  if (a.json != null) return a.json;
  try {
    return a.get(maps);
  } catch (e) {
    if (!_refused.has(fileName)) { _refused.add(fileName); console.error(`[worlddata] ${fileName} (${a.vendor}): ${e?.message ?? e} - not served`); }
    return null;
  }
}
function tryGetAsset(fileName, maps = null) { const a = liveAsset(fileName); return layered(fileName, a ? assetJson(a, fileName, maps) : null); }

// A layer adds its records to whichever file the door serves under that name. `apply` must return a new object,
// because the served JSON is shared and may belong to another mod.
const _layers = [];
export function registerWorldDataLayer(layer) {
  if (!layer || typeof layer.match !== 'function' || typeof layer.apply !== 'function') return false;
  const at = _layers.findIndex((l) => l.vendor === layer.vendor);
  if (at >= 0) _layers.splice(at, 1);
  _layers.push(layer);
  return true;
}
function layered(fileName, json) {
  if (json == null || !_layers.length) return json;
  let out = json;
  for (const l of _layers) {
    if (!l.match(fileName) || !(l.isOn?.() ?? true) || l.owns?.(json)) continue;
    out = l.apply(out, fileName) ?? out;
  }
  return out;
}
function findAssets(extension) {
  const out = [];
  for (const [name] of _assets) {
    if (!name.endsWith(extension)) continue;
    const a = liveAsset(name);
    if (a) out.push({ name, get json() { return assetJson(a, name, null); } });
  }
  return out;
}

let _pinAt = () => null;
export function setLayoutPinOracle(fn) { _pinAt = typeof fn === 'function' ? fn : () => null; }
let _pinKey = null;
const pinLocationKey = () => _pinKey ?? readingLocationKeyOf();
const pinHere = () => _pinAt(pinLocationKey());

let regions = new Map();
let locations = new Map();
let blocks = new Map();
export const BLOCK_CACHE_MAX = 192;
function cacheBlock(key, value) {
  blocks.set(key, value);
  if (blocks.size > BLOCK_CACHE_MAX) blocks.delete(blocks.keys().next().value);
}
let buildings = new Map();
let nextBlockIndex = 0;
let newBlockNames = new Map();
let newBlockIndices = new Map();
let _blocksFile = null;

export function bindWorldDataBlocks(blocksFile) { _blocksFile = blocksFile ?? null; }
export const boundWorldDataBlocks = () => _blocksFile;
export function installWorldDataReplacement() {
  setNewLocationIndexResolver(getNewDFLocationIndex);
  setWorldDataDoor({ getDFRegionAdditionalLocationData, getDFLocationReplacementData, getDFBlockReplacementData, getBuildingReplacementData, getNewDFBlockName, getNewDFBlockIndex, applyBuildingReplacementAutoMapData, noteReadingLocation, editLocation, locationPinned });
}
export function _resetWorldDataReplacement({ assets = true } = {}) {
  regions = new Map(); locations = new Map(); blocks = new Map(); buildings = new Map();
  nextBlockIndex = 0; newBlockNames = new Map(); newBlockIndices = new Map(); _blocksFile = null;
  _refused.clear(); _quietLocations = false; _doorLatched = null;
  if (assets) { _assets.clear(); _portBlocks.clear(); _portNameByIndex = null; _locationEdits.length = 0; _layers.length = 0; }
}

// Port blocks are served whatever AssetInjection, mod switches, or pins say, and use fixed indices past any BSA so
// new mod blocks still number from `BsaFile.Count`.
const _portBlocks = new Map();
/** @type {Map<number, string> | null} */
let _portNameByIndex = null;
export function registerPortBlock(name, json, index) {
  if (!name || json == null || !Number.isSafeInteger(index)) return false;
  _portBlocks.set(name, { index, json, block: null });
  _portNameByIndex = null;
  return true;
}
/** @param {number} index */
function portBlockByIndex(index) {
  if (!_portNameByIndex) {
    _portNameByIndex = new Map();
    for (const [name, b] of _portBlocks) if (!_portNameByIndex.has(b.index)) _portNameByIndex.set(b.index, name);
  }
  return _portNameByIndex.get(index) ?? null;
}
function portBlock(name) {
  const b = _portBlocks.get(name);
  if (!b) return null;
  b.block ??= blockFromJson(b.json, b.index);
  return b.block;
}
// Edits never run on `readClassicLocation`, because a pack's location edits are taken against that unedited read.
const _locationEdits = [];
export function registerLocationEdit(fn) { if (typeof fn === 'function' && !_locationEdits.includes(fn)) _locationEdits.push(fn); }
// A location read from inside an edit, such as a pin oracle asking a town's type, is returned unedited.
let _editing = false;
export function editLocation(dfLocation, maps = null) {
  if (_editing || !dfLocation) return dfLocation;
  _editing = true;
  try { for (const fn of _locationEdits) fn(dfLocation, maps, _blocksFile); } finally { _editing = false; }
  return dfLocation;
}

export const regionReplacementFilename = (regionIndex) => `region-${regionIndex}.json`;
export const locationReplacementFilename = (regionIndex, locationIndex, variant = NO_VARIANT) => `location-${regionIndex}-${locationIndex}${variant}.json`;
export const blockReplacementFilename = (blockName, variant = NO_VARIANT) => `${blockName}${variant}.json`;
export const buildingReplacementFilename = (blockName, blockIndex, recordIndex, variant = NO_VARIANT) => `${blockName}-${blockIndex}-building${recordIndex}${variant}.json`;

export function getNewDFLocationIndex(regionIndex, locationName) {
  const r = regions.get(regionIndex);
  if (r && r !== NO_REPLACEMENT && r.mapNameLookup.has(locationName)) return r.mapNameLookup.get(locationName);
  return -1;
}

export function getDFRegionAdditionalLocationData(regionIndex, dfRegion) {
  if (!worldDataOn() || !dfRegion) return false;
  const cached = regions.get(regionIndex);
  if (cached !== undefined) {
    if (cached !== NO_REPLACEMENT) { copyRegionInto(cached, dfRegion); return true; }
    return false;
  }
  const dataLocationCount = dfRegion.locationCount;
  let locationAssignmentSuccess = true;
  for (const asset of findAssets(`-${regionIndex}.json`)) {
    const { name } = asset;
    if (!name.startsWith('locationnew-')) continue;
    // Read `asset.json` only after the name check, because reading it rebuilds the file and pack `location-*` names
    // share this suffix.
    const json = asset.json;
    try {
      const dfLocation = locationFromJson(json, regionIndex);
      // `editorDungeon` keeps a Bunnyfall Dungeon Editor place out of world/smallerDungeons.js and
      // world/spawnedDungeons.js, so it shows as designed.
      if (name.startsWith(EDITOR_LOCATION_PREFIX)) dfLocation.editorDungeon = true;
      locationAssignmentSuccess = addLocationToRegion(regionIndex, dfRegion, dfLocation) && locationAssignmentSuccess;
    } catch (e) { console.error(`[worlddata] ${name}: ${e?.message ?? e}`); locationAssignmentSuccess = false; }
  }
  if (dfRegion.locationCount > dataLocationCount) {
    if (locationAssignmentSuccess) regions.set(regionIndex, snapshotRegion(dfRegion));
    console.log(`[worlddata] Added ${dfRegion.locationCount - dataLocationCount} new DFLocation's to region ${regionIndex}, indexes: ${dataLocationCount} - ${dfRegion.locationCount - 1}`);
    return true;
  }
  regions.set(regionIndex, NO_REPLACEMENT);
  return false;
}
function copyRegionInto(cached, dfRegion) {
  if (dfRegion.locationCount >= cached.locationCount) return;
  for (let i = dfRegion.locationCount; i < cached.locationCount; i++) {
    dfRegion.mapNames.push(cached.mapNames[i]);
    dfRegion.mapTable.push(cached.mapTable[i]);
    if (!dfRegion.mapIdLookup.has(cached.mapTable[i].mapId)) dfRegion.mapIdLookup.set(cached.mapTable[i].mapId, i);
    if (!dfRegion.mapNameLookup.has(cached.mapNames[i])) dfRegion.mapNameLookup.set(cached.mapNames[i], i);
  }
  dfRegion.locationCount = cached.locationCount;
}
const snapshotRegion = (r) => ({ locationCount: r.locationCount, mapNames: r.mapNames.slice(), mapTable: r.mapTable.slice(), mapNameLookup: new Map(r.mapNameLookup), mapIdLookup: new Map(r.mapIdLookup) });

function addLocationToRegion(regionIndex, dfRegion, dfLocation) {
  // Both duplicate checks run before any write, so a refused location leaves no row in the region's arrays that its
  // lookups do not know.
  if (dfRegion.mapIdLookup.has(dfLocation.mapTableData.mapId)) throw new Error(`[worlddata] region ${regionIndex}: mapId ${dfLocation.mapTableData.mapId} is already a location's (${dfLocation.name})`);
  if (dfRegion.mapNameLookup.has(dfLocation.name)) throw new Error(`[worlddata] region ${regionIndex}: a location named ${JSON.stringify(dfLocation.name)} already stands`);
  dfLocation.mapTableData.locationId = dfLocation.exterior.recordElement.header.locationId;
  const locationIndex = dfRegion.locationCount++;
  dfRegion.mapNames.push(dfLocation.name);
  dfLocation.locationIndex = locationIndex;
  dfLocation.exterior.recordElement.header.unknown2 = locationIndex >>> 0;
  dfRegion.mapTable.push(dfLocation.mapTableData);
  dfRegion.mapIdLookup.set(dfLocation.mapTableData.mapId, locationIndex);
  dfRegion.mapNameLookup.set(dfLocation.name, locationIndex);
  locations.set(String(makeLocationKey(regionIndex, locationIndex)), dfLocation);
  return assignBlockIndices(dfLocation);
}

export function getDFLocationReplacementData(regionIndex, locationIndex, maps = null) {
  if (!worldDataOn()) return null;
  const locationKey = makeLocationKey(regionIndex, locationIndex);
  const { variant, newLocation } = getLocationVariant(locationKey);
  let locationVariantKey = `${locationKey}${variant}`;
  if (newLocation && !locations.has(locationVariantKey)) {
    if (!loadNewDFLocationVariant(regionIndex, locationIndex, variant)) locationVariantKey = String(locationKey);
  }
  // A town whose pin names a mod that carries this file is read fresh and never cached, because the answer
  // depends on the loaded save. A mod-added location still returns its cached entry.
  const fileName = locationReplacementFilename(regionIndex, locationIndex, variant);
  if (pinnedHere(locationKey, fileName)) {
    if (newLocation) return locations.get(locationVariantKey) ?? null;
    const json = withPinKey(locationKey, () => tryGetAsset(fileName, maps));
    if (!json) return null;
    const dfLocation = locationFromJson(json, regionIndex);
    dfLocation.locationIndex = locationIndex;
    assignBlockIndices(dfLocation);
    return dfLocation;
  }
  const cached = locations.get(locationVariantKey);
  if (cached !== undefined) return cached === NO_REPLACEMENT ? null : cached;
  const json = tryGetAsset(fileName, maps);
  if (!json) {
    if (variant === NO_VARIANT) locations.set(locationVariantKey, NO_REPLACEMENT);
    return null;
  }
  const dfLocation = locationFromJson(json, regionIndex);
  dfLocation.locationIndex = locationIndex;
  if (assignBlockIndices(dfLocation)) locations.set(locationVariantKey, dfLocation);
  if (!_quietLocations) console.log(`[worlddata] Found DFLocation override, region:${regionIndex}, index:${locationIndex} variant:${variant}`);
  return dfLocation;
}
let _quietLocations = false;
export function quietLocationOverrides(on) { _quietLocations = !!on; }
function pinnedHere(locationKey, fileName) {
  const pin = _pinAt(locationKey);
  if (!pin || (!pin.out?.size && !pin.in?.size)) return false;
  return (_assets.get(fileName) ?? []).some((a) => a.vendor && (pin.out?.has(a.vendor) || pin.in?.has(a.vendor)));
}
function locationPinned(regionIndex, locationIndex) {
  const pin = _pinAt(makeLocationKey(regionIndex, locationIndex));
  return !!pin && !!(pin.out?.size || pin.in?.size);
}
function withPinKey(key, fn) {
  const was = _pinKey;
  _pinKey = key;
  try { return fn(); } finally { _pinKey = was; }
}
export function loadNewDFLocationVariant(regionIndex, locationIndex, variant) {
  const locationKey = makeLocationKey(regionIndex, locationIndex);
  const base = locations.get(String(locationKey));
  if (!base || base === NO_REPLACEMENT) return false;
  const locationVariantKey = `${locationKey}${variant}`;
  if (locations.has(locationVariantKey)) return false;
  for (const asset of findAssets(`-${regionIndex}${variant}.json`)) {
    // This takes any asset with the suffix, as DFU's mod path does, including names that do not start with
    // `locationnew-`.
    const json = asset.json;
    if (!json) continue;
    const variantLocation = locationFromJson(json, regionIndex);
    addNewDFLocationVariant(locationIndex, locationVariantKey, variantLocation);
    return true;
  }
  return false;
}
function addNewDFLocationVariant(locationIndex, locationVariantKey, variantLocation) {
  variantLocation.locationIndex = locationIndex;
  variantLocation.exterior.recordElement.header.unknown2 = locationIndex >>> 0;
  locations.set(locationVariantKey, variantLocation);
}

export const getNewDFBlockIndex = (blockName) => _portBlocks.get(blockName)?.index ?? newBlockIndices.get(blockName) ?? -1;
export const getNewDFBlockName = (block) => portBlockByIndex(block) ?? newBlockNames.get(block) ?? null;
function assignBlockIndices(dfLocation) {
  if (!_blocksFile) return false;
  if (nextBlockIndex === 0) nextBlockIndex = _blocksFile.count;
  for (const blockName of dfLocation.exterior?.exteriorData?.blockNames ?? []) {
    if (_blocksFile.getBlockIndex(blockName) === -1) assignNextIndex(blockName);
  }
  for (const dungeonBlock of dfLocation.dungeon?.blocks ?? []) {
    if (_blocksFile.getBlockIndex(dungeonBlock.blockName) === -1) assignNextIndex(dungeonBlock.blockName);
  }
  return true;
}
function assignNextIndex(blockName) {
  newBlockNames.set(nextBlockIndex, blockName);
  newBlockIndices.set(blockName, nextBlockIndex);
  if (!_quietLocations) console.log(`[worlddata] Found a new DFBlock: ${blockName}, (assigned index: ${nextBlockIndex})`);
  nextBlockIndex++;
}

export function getDFBlockReplacementData(block, blockName) {
  if (blockName && _portBlocks.has(blockName)) return portBlock(blockName);
  if (!worldDataOn() || !blockName) return null;
  const variant = getBlockVariantHere(blockName);
  const blockKey = `${blockName}${variant}`;
  if (pinnedHere(pinLocationKey(), blockReplacementFilename(blockName, variant))) {
    const json = tryGetAsset(blockReplacementFilename(blockName, variant));
    if (!json) return null;
    const dfBlock = blockFromJson(json, block, blockName);
    if (blockName.endsWith('.RMB')) replaceRmbBlockBuildingData(blockName, block, dfBlock);
    curateBlockPeople(dfBlock, liveAsset(blockReplacementFilename(blockName, variant))?.vendor);
    curateBlockPlacements(dfBlock, liveAsset(blockReplacementFilename(blockName, variant))?.vendor);
    return dfBlock;
  }
  const cached = blocks.get(blockKey);
  if (cached !== undefined) { blocks.delete(blockKey); blocks.set(blockKey, cached); return cached === NO_REPLACEMENT ? null : cached; }
  const json = tryGetAsset(blockReplacementFilename(blockName, variant));
  if (!json) {
    if (variant === NO_VARIANT) cacheBlock(blockName, NO_REPLACEMENT);
    return null;
  }
  const dfBlock = blockFromJson(json, block, blockName);
  if (blockName.endsWith('.RMB')) replaceRmbBlockBuildingData(blockName, block, dfBlock);
  curateBlockPeople(dfBlock, liveAsset(blockReplacementFilename(blockName, variant))?.vendor);
  curateBlockPlacements(dfBlock, liveAsset(blockReplacementFilename(blockName, variant))?.vendor);
  cacheBlock(blockKey, dfBlock);
  console.log(`[worlddata] Found DFBlock override: ${blockName} (index: ${block})`);
  return dfBlock;
}
function replaceRmbBlockBuildingData(blockName, blockIndex, dfBlock) {
  const rmb = dfBlock.rmbBlock;
  for (let i = 0; i < rmb.subRecords.length; i++) {
    const data = getBuildingReplacementData(blockName, blockIndex, i);
    if (!data) continue;
    rmb.subRecords[i].exterior = data.rmbSubRecord.exterior;
    rmb.subRecords[i].interior = data.rmbSubRecord.interior;
    const entry = rmb.fldHeader.buildingDataList[i] ?? (rmb.fldHeader.buildingDataList[i] = emptyBuildingData());
    if (data.factionId > 0) entry.factionId = data.factionId;
    entry.buildingType = data.buildingType;
    if (data.quality > 0) entry.quality = data.quality;
    if (data.nameSeed > 0) entry.nameSeed = data.nameSeed;
    applyBuildingReplacementAutoMapData(data, rmb.fldHeader.autoMapData);
  }
}

export function getBuildingReplacementData(blockName, blockIndex, recordIndex) {
  if (!worldDataOn() || !blockName) return null;
  const variant = getBuildingVariantHere(blockName, recordIndex, NO_VARIANT);
  const key = `${blockIndex}|${recordIndex}|${variant}`;
  const file = buildingReplacementFilename(blockName, blockIndex, recordIndex, variant);
  if (pinnedHere(pinLocationKey(), file)) { const json = tryGetAsset(file); return json ? buildingReplacementFromJson(json) : null; }
  const cached = buildings.get(key);
  if (cached !== undefined) return cached === NO_REPLACEMENT ? null : cached;
  const json = tryGetAsset(buildingReplacementFilename(blockName, blockIndex, recordIndex, variant));
  if (!json) {
    if (variant === NO_VARIANT) buildings.set(key, NO_REPLACEMENT);
    return null;
  }
  const data = buildingReplacementFromJson(json);
  buildings.set(key, data);
  return data;
}
export function applyBuildingReplacementAutoMapData(buildingData, blockAutoMapData) {
  const src = buildingData?.autoMapData;
  if (!src || src.length !== AUTO_MAP_DATA_SIZE || !blockAutoMapData) return;
  for (let i = 0; i < AUTO_MAP_DATA_SIZE; i++) if (src[i] !== 30) blockAutoMapData[i] = src[i];
}

const enumOf = (table, v, fallback = 0) => (typeof v === 'number' ? v : (table[v] ?? fallback));
const emptyBuildingData = () => ({ nameSeed: 0, serviceTimeLimit: 0, unknown: 0, unknown2: 0, unknown3: 0, unknown4: 0, factionId: 0, sector: 0, locationId: 0, buildingType: 0, quality: 0 });
export function buildingDataFromJson(b) {
  return { ...emptyBuildingData(), nameSeed: b.NameSeed ?? 0, factionId: b.FactionId ?? 0, sector: b.Sector ?? 0, locationId: b.LocationId ?? 0, buildingType: enumOf(BUILDING_TYPES, b.BuildingType, -1), quality: b.Quality ?? 0 };
}
export function locationFromJson(json, regionIndex = json.RegionIndex ?? 0) {
  const mt = json.MapTableData ?? {};
  const ext = json.Exterior ?? {};
  const h = ext.RecordElement?.Header ?? {};
  const ed = ext.ExteriorData ?? {};
  const blockNames = [...(ed.BlockNames ?? [])];
  return {
    loaded: json.Loaded ?? true,
    regionName: json.RegionName ?? REGION_NAMES[regionIndex] ?? '',
    name: json.Name ?? '',
    regionIndex,
    locationIndex: json.LocationIndex ?? 0,
    hasDungeon: !!json.HasDungeon,
    politic: json.Politic ?? 0,
    climate: getWorldClimateSettings(json.Climate?.WorldClimate ?? 231),
    mapTableData: {
      mapId: mt.MapId ?? 0, longitude: mt.Longitude ?? 0, locationType: enumOf(LOCATION_TYPES, mt.LocationType, LOCATION_TYPES.None),
      discovered: !!mt.Discovered, latitude: mt.Latitude ?? 0, dungeonType: enumOf(DUNGEON_TYPES, mt.DungeonType, DUNGEON_TYPES.NoDungeon), key: mt.Key ?? 0, locationId: 0,
    },
    exterior: {
      recordElement: {
        doorCount: 0, doors: [],
        header: recordHeaderFromJson(h, json.Name),
      },
      buildingCount: ext.BuildingCount ?? (ext.Buildings?.length ?? 0),
      unknown1: null,
      buildings: (ext.Buildings ?? []).map(buildingDataFromJson),
      exteriorData: {
        anotherName: ed.AnotherName ?? '', mapId: ed.MapId ?? 0, locationId: ed.LocationId ?? 0, width: ed.Width ?? 1, height: ed.Height ?? 1,
        unknown2: null, letter1ForRMBName: 0, portTownAndUnknown: ed.PortTownAndUnknown ?? 0, unknown3: 0,
        blockIndex: null, blockNumber: null, blockCharacter: null, unknown4: null, unknown5: null, unknown6: 0, blockNames,
      },
    },
    dungeon: json.Dungeon ? dungeonFromJson(json.Dungeon, json.Name) : { recordElement: null, header: null, blocks: null },
  };
}
function recordHeaderFromJson(h, name) {
  return {
    alwaysOne1: 1, x: h.X ?? 0, y: h.Y ?? 0, isExterior: h.IsExterior ?? 0, unknown1: 0, unknown2: h.Unknown2 ?? 0, alwaysOne2: 1,
    locationId: h.LocationId ?? 0, isInterior: h.IsInterior ?? 0, exteriorLocationId: h.ExteriorLocationId ?? 0, locationName: h.LocationName ?? name ?? '',
  };
}
function dungeonFromJson(d, name) {
  return {
    recordElement: { doorCount: 0, doors: [], header: recordHeaderFromJson(d.RecordElement?.Header ?? {}, name) },
    header: d.Header ? { nullValue1: 0, unknown1: 0, unknown2: 0, blockCount: d.Header.BlockCount ?? (d.Blocks?.length ?? 0), unknown3: null } : null,
    blocks: (d.Blocks ?? []).map((b) => ({ x: b.X ?? 0, z: b.Z ?? 0, isStartingBlock: !!b.IsStartingBlock, blockName: b.BlockName ?? '', blockIndex: b.BlockIndex ?? 0, blockNumber: b.BlockNumber ?? 0, blockCharacter: b.BlockCharacter ?? 0 })),
  };
}
const modelFromJson = (m) => ({
  position: 0, modelIdNum: m.ModelIdNum ?? Number(m.ModelId ?? 0), modelId: String(m.ModelId ?? m.ModelIdNum ?? 0), objectType: m.ObjectType ?? 0,
  unknown1: 0, unknown2: 0, unknown3: 0, xPos1: 0, yPos1: 0, zPos1: 0,
  xPos: m.XPos ?? 0, yPos: m.YPos ?? 0, zPos: m.ZPos ?? 0,
  // A zero (absent) scale means unscaled at the layout; the values are rounded to float32 as in the C# struct.
  xScale: Math.fround(m.XScale ?? 0), yScale: Math.fround(m.YScale ?? 0), zScale: Math.fround(m.ZScale ?? 0),
  nullValue2: 0,
  xRotation: m.XRotation ?? 0, yRotation: m.YRotation ?? 0, zRotation: m.ZRotation ?? 0, unknown4: 0, unknown5: 0,
});
const flatFromJson = (f) => ({
  position: f.Position ?? 0, xPos: f.XPos ?? 0, yPos: f.YPos ?? 0, zPos: f.ZPos ?? 0,
  textureBitfield: (((f.TextureArchive ?? 0) << 7) | ((f.TextureRecord ?? 0) & 0x7f)) & 0xffff,
  textureArchive: f.TextureArchive ?? 0, textureRecord: f.TextureRecord ?? 0, factionID: f.FactionID ?? 0, flags: f.Flags ?? 0,
});
const section3FromJson = (s) => ({ xPos: s.XPos ?? 0, yPos: s.YPos ?? 0, zPos: s.ZPos ?? 0, unknown1: 0, unknown2: 0, unknown3: 0 });
const doorFromJson = (d) => ({ position: d.Position ?? 0, xPos: d.XPos ?? 0, yPos: d.YPos ?? 0, zPos: d.ZPos ?? 0, yRotation: d.YRotation ?? 0, openRotation: d.OpenRotation ?? 0, doorModelIndex: 0, unknown: 0, nullValue1: 0 });
export function rmbBlockDataFromJson(j) {
  const models = (j?.Block3dObjectRecords ?? []).map(modelFromJson);
  const flats = (j?.BlockFlatObjectRecords ?? []).map(flatFromJson);
  const s3 = (j?.BlockSection3Records ?? []).map(section3FromJson);
  const people = (j?.BlockPeopleRecords ?? []).map(flatFromJson);
  const doors = (j?.BlockDoorRecords ?? []).map(doorFromJson);
  const hd = j?.Header ?? {};
  return {
    header: {
      position: 0, num3dObjectRecords: hd.Num3dObjectRecords ?? models.length, numFlatObjectRecords: hd.NumFlatObjectRecords ?? flats.length,
      numSection3Records: hd.NumSection3Records ?? s3.length, numPeopleRecords: hd.NumPeopleRecords ?? people.length, numDoorRecords: hd.NumDoorRecords ?? doors.length,
      unknown1: 0, unknown2: 0, unknown3: 0, unknown4: 0, unknown5: 0, unknown6: 0,
    },
    block3dObjectRecords: models, blockFlatObjectRecords: flats, blockSection3Records: s3, blockPeopleRecords: people, blockDoorRecords: doors,
  };
}
export const rmbSubRecordFromJson = (s) => ({
  xPos: s.XPos ?? 0, zPos: s.ZPos ?? 0, yRotation: s.YRotation ?? 0,
  exterior: rmbBlockDataFromJson(s.Exterior), interior: rmbBlockDataFromJson(s.Interior),
});
export function groundDataFromJson(g) {
  const tiles = Array.from({ length: 16 }, () => new Array(16));
  const scenery = Array.from({ length: 16 }, () => new Array(16));
  const T = g?.GroundTiles ?? [], S = g?.GroundScenery ?? [];
  let i = 0;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++, i++) {
      const t = T[i] ?? {};
      const bitfield = t.TileBitfield ?? 0;
      tiles[x][y] = { tileBitfield: bitfield, textureRecord: t.TextureRecord ?? (bitfield & 0x3f), isRotated: t.IsRotated ?? ((bitfield & 0x40) === 0x40), isFlipped: t.IsFlipped ?? ((bitfield & 0x80) === 0x80) };
      const s = S[i] ?? {};
      const record = s.TextureRecord ?? -1;
      scenery[x][y] = { tileBitfield: record < 0 ? 255 : (record + 1) * 4, unknown1: 0, textureRecord: record };
    }
  }
  return { header: Uint8Array.from(g?.Header ?? new Array(8).fill(0)), groundTiles: tiles, groundScenery: scenery };
}
export function blockFromJson(json, index, servedName = json.Name ?? '') {
  const name = json.Name ?? '';
  const type = enumOf(BLOCK_TYPES, json.Type, name.endsWith('.RMB') ? BLOCK_TYPES.Rmb : name.endsWith('.RDB') ? BLOCK_TYPES.Rdb : name.endsWith('.RDI') ? BLOCK_TYPES.Rdi : BLOCK_TYPES.Unknown);
  if (type === BLOCK_TYPES.Rdb || type === BLOCK_TYPES.Rdi) {
    return {
      position: json.Position ?? 0, index, name, servedName, type, fromWorldData: true,
      rmbBlock: null,
      rdbBlock: type === BLOCK_TYPES.Rdb ? rdbBlockFromJson(json.RdbBlock ?? {}) : null,
      rdiBlock: type === BLOCK_TYPES.Rdi ? { data: json.RdiBlock?.Data ? Uint8Array.from(json.RdiBlock.Data) : null } : null,
    };
  }
  const rmb = json.RmbBlock ?? {};
  const fh = rmb.FldHeader ?? {};
  const subRecords = (rmb.SubRecords ?? []).map(rmbSubRecordFromJson);
  const misc3d = (rmb.Misc3dObjectRecords ?? []).map(modelFromJson);
  const miscFlat = (rmb.MiscFlatObjectRecords ?? []).map(flatFromJson);
  const blockPositions = new Array(32).fill(null).map((_, i) => ({ unknown1: 0, unknown2: 0, xPos: subRecords[i]?.xPos ?? 0, zPos: subRecords[i]?.zPos ?? 0, yRotation: subRecords[i]?.yRotation ?? 0 }));
  const buildingDataList = (fh.BuildingDataList ?? []).map(buildingDataFromJson);
  // Padding slots use BuildingTypes.None (-1), because 0 is Alchemist.
  while (buildingDataList.length < 32) buildingDataList.push({ ...emptyBuildingData(), buildingType: -1 });
  return {
    position: json.Position ?? 0,
    index,
    name,
    type,
    // A pack's JSON can carry a different `Name` than the file it is served under, so curations key on
    // `servedName`.
    fromWorldData: true, servedName,
    rmbBlock: {
      fldHeader: {
        numBlockDataRecords: subRecords.length, numMisc3dObjectRecords: misc3d.length, numMiscFlatObjectRecords: miscFlat.length,
        blockPositions, buildingDataList, section2UnknownData: new Array(32).fill(0), blockDataSizes: new Array(32).fill(0),
        groundData: groundDataFromJson(fh.GroundData), autoMapData: Uint8Array.from(fh.AutoMapData ?? new Array(AUTO_MAP_DATA_SIZE).fill(0)),
        name: fh.Name ?? name, otherNames: Array.isArray(fh.OtherNames) ? [...fh.OtherNames] : null,
      },
      subRecords, misc3dObjectRecords: misc3d, miscFlatObjectRecords: miscFlat,
    },
    rdbBlock: null,
    rdiBlock: null,
  };
}
const RDB_RESOURCE_BY_NAME = Object.freeze({ Model: RDB_RESOURCE_TYPES.Model, Light: RDB_RESOURCE_TYPES.Light, Flat: RDB_RESOURCE_TYPES.Flat });
const actionResourceFromJson = (a) => ({
  position: a?.Position ?? 0, axis: a?.Axis ?? 0, duration: a?.Duration ?? 0, magnitude: a?.Magnitude ?? 0,
  nextObjectOffset: a?.NextObjectOffset ?? 0, flags: a?.Flags ?? 0,
  previousObjectOffset: a?.PreviousObjectOffset ?? 0, nextObjectIndex: a?.NextObjectIndex ?? 0,
});
function rdbResourcesFromJson(r) {
  const m = r?.ModelResource, f = r?.FlatResource, l = r?.LightResource;
  return {
    modelResource: {
      xRotation: m?.XRotation ?? 0, yRotation: m?.YRotation ?? 0, zRotation: m?.ZRotation ?? 0, modelIndex: m?.ModelIndex ?? 0,
      triggerFlagStartingLock: m?.TriggerFlag_StartingLock ?? 0, soundIndex: m?.SoundIndex ?? 0, actionOffset: 0,
      actionResource: actionResourceFromJson(m?.ActionResource),
    },
    flatResource: {
      position: f?.Position ?? 0,
      textureBitfield: (((f?.TextureArchive ?? 0) << 7) | ((f?.TextureRecord ?? 0) & 0x7f)) & 0xffff,
      textureArchive: f?.TextureArchive ?? 0, textureRecord: f?.TextureRecord ?? 0, flags: f?.Flags ?? 0,
      magnitude: f?.Magnitude ?? 0, soundIndex: f?.SoundIndex ?? 0, factionOrMobileId: f?.FactionOrMobileId ?? 0,
      nextObjectOffset: f?.NextObjectOffset ?? 0, action: f?.Action ?? 0,
      // When `isCustomData` is set, the whole `factionOrMobileId` is the marker's mobile type.
      isCustomData: !!f?.IsCustomData,
      editorPerson: f?.BunnyfallPerson ?? null,
    },
    lightResource: { unknown1: l?.Unknown1 ?? 0, unknown2: l?.Unknown2 ?? 0, radius: l?.Radius ?? 0 },
  };
}
export function rdbBlockFromJson(j) {
  return {
    position: 0, header: null, modelDataList: null, objectHeader: null, unknownObjectList: null,
    modelReferenceList: (j.ModelReferenceList ?? []).map((m) => ({ modelId: m.ModelId ?? '', modelIdNum: m.ModelIdNum ?? 0, description: m.Description ?? '' })),
    objectRootList: (j.ObjectRootList ?? []).map((g) => ({
      rootOffset: 0,
      rdbObjects: g?.RdbObjects ? g.RdbObjects.map((o) => ({
        position: o.Position ?? 0, next: 0, previous: 0, index: o.Index ?? 0,
        xPos: o.XPos ?? 0, yPos: o.YPos ?? 0, zPos: o.ZPos ?? 0,
        type: enumOf(RDB_RESOURCE_BY_NAME, o.Type, 0), resourceOffset: 0,
        resources: rdbResourcesFromJson(o.Resources),
      })) : null,
    })),
  };
}

export function buildingReplacementFromJson(json) {
  return {
    factionId: json.FactionId ?? 0,
    buildingType: enumOf(BUILDING_TYPES, json.BuildingType, -1),
    quality: json.Quality ?? 0,
    nameSeed: json.NameSeed ?? 0,
    rmbSubRecord: rmbSubRecordFromJson(json.RmbSubRecord ?? {}),
    autoMapData: json.AutoMapData ? Uint8Array.from(json.AutoMapData) : null,
  };
}
