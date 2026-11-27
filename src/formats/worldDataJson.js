// Serializes classic blocks and locations in the exact shape the DFU World Data Editor writes, so a vendored diff
// laid on the player's data rebuilds the mod file. Patches check the result by sha256 of its `canonicalJson` form,
// so a field change here breaks them. The vendored files predate `RdbFlatResource.IsCustomData`, so that field is
// not written.

import { BUILDING_TYPES } from '../world/buildingNames.js';
import { BLOCK_TYPES, RDB_RESOURCE_TYPES } from './blocksFile.js';
import { LOCATION_TYPES, DUNGEON_TYPES, CLIMATE_BASE_TYPES } from './mapsFile.js';

const BLOCK_TYPE_NAMES = ['Unknown', 'Rmb', 'Rdb', 'Rdi'];
const RDB_RESOURCE_NAMES = { [RDB_RESOURCE_TYPES.Model]: 'Model', [RDB_RESOURCE_TYPES.Light]: 'Light', [RDB_RESOURCE_TYPES.Flat]: 'Flat' };
// FullSerializer writes an enum by name, and for a value shared by several names that is the first declared, as
// `Enum.GetName` returns.
const BUILDING_TYPE_NAMES = (() => {
  const m = new Map();
  for (const [name, v] of Object.entries(BUILDING_TYPES)) if (!m.has(v)) m.set(v, name);
  return m;
})();
const buildingTypeName = (v) => BUILDING_TYPE_NAMES.get(v) ?? v;

const buildingDataJson = (b) => ({
  NameSeed: b.nameSeed, FactionId: b.factionId, Sector: b.sector, LocationId: b.locationId,
  BuildingType: buildingTypeName(b.buildingType), Quality: b.quality,
});

function modelJson(m) {
  const o = { ModelId: m.modelId, ModelIdNum: m.modelIdNum, ObjectType: m.objectType, XPos: m.xPos, YPos: m.yPos, ZPos: m.zPos };
  if (m.xScale) o.XScale = m.xScale;
  if (m.yScale) o.YScale = m.yScale;
  if (m.zScale) o.ZScale = m.zScale;
  o.XRotation = m.xRotation; o.YRotation = m.yRotation; o.ZRotation = m.zRotation;
  return o;
}
const flatJson = (f) => ({
  Position: f.position, XPos: f.xPos, YPos: f.yPos, ZPos: f.zPos,
  TextureArchive: f.textureArchive, TextureRecord: f.textureRecord, FactionID: f.factionID, Flags: f.flags,
});
const section3Json = (s) => ({ XPos: s.xPos, YPos: s.yPos, ZPos: s.zPos });
const doorJson = (d) => ({
  Position: d.position, XPos: d.xPos, YPos: d.yPos, ZPos: d.zPos,
  YRotation: d.yRotation, OpenRotation: d.openRotation, DoorModelIndex: d.doorModelIndex,
});
export function rmbBlockDataJson(d) {
  const h = d.header;
  return {
    Header: {
      Num3dObjectRecords: h.num3dObjectRecords, NumFlatObjectRecords: h.numFlatObjectRecords,
      NumSection3Records: h.numSection3Records, NumPeopleRecords: h.numPeopleRecords, NumDoorRecords: h.numDoorRecords,
    },
    Block3dObjectRecords: d.block3dObjectRecords.map(modelJson),
    BlockFlatObjectRecords: d.blockFlatObjectRecords.map(flatJson),
    BlockSection3Records: d.blockSection3Records.map(section3Json),
    BlockPeopleRecords: d.blockPeopleRecords.map(flatJson),
    BlockDoorRecords: d.blockDoorRecords.map(doorJson),
  };
}
export const rmbSubRecordJson = (s) => ({
  XPos: s.xPos, ZPos: s.zPos, YRotation: s.yRotation,
  Exterior: rmbBlockDataJson(s.exterior), Interior: rmbBlockDataJson(s.interior),
});

function groundDataJson(g) {
  if (!g?.header) return {};
  const tiles = [], scenery = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const t = g.groundTiles[x][y];
      tiles.push({ TileBitfield: t.tileBitfield, TextureRecord: t.textureRecord, IsRotated: t.isRotated, IsFlipped: t.isFlipped });
    }
  }
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) scenery.push({ TextureRecord: g.groundScenery[x][y].textureRecord });
  return { Header: [...g.header], GroundTiles: tiles, GroundScenery: scenery };
}

const EMPTY_RMB = () => ({
  FldHeader: {
    NumBlockDataRecords: 0, NumMisc3dObjectRecords: 0, NumMiscFlatObjectRecords: 0,
    BlockPositions: null, BuildingDataList: null, BlockDataSizes: null, GroundData: {},
    AutoMapData: null, Name: null, OtherNames: null,
  },
  SubRecords: null, Misc3dObjectRecords: null, MiscFlatObjectRecords: null,
});

function rmbJson(rmb) {
  const h = rmb.fldHeader;
  return {
    FldHeader: {
      NumBlockDataRecords: h.numBlockDataRecords, NumMisc3dObjectRecords: h.numMisc3dObjectRecords, NumMiscFlatObjectRecords: h.numMiscFlatObjectRecords,
      BlockPositions: h.blockPositions?.map((p) => ({ XPos: p.xPos, ZPos: p.zPos, YRotation: p.yRotation })) ?? null,
      BuildingDataList: h.buildingDataList?.map(buildingDataJson) ?? null,
      BlockDataSizes: h.blockDataSizes ? [...h.blockDataSizes] : null,
      GroundData: groundDataJson(h.groundData),
      AutoMapData: h.autoMapData ? [...h.autoMapData] : null,
      Name: h.name ?? null,
      OtherNames: h.otherNames ? [...h.otherNames] : null,
    },
    SubRecords: rmb.subRecords.map(rmbSubRecordJson),
    Misc3dObjectRecords: rmb.misc3dObjectRecords.map(modelJson),
    MiscFlatObjectRecords: rmb.miscFlatObjectRecords.map(flatJson),
  };
}

const UNUSED_REFERENCE = '���';
function rdbObjectJson(o) {
  const r = o.resources;
  const resources = {};
  if (o.type === RDB_RESOURCE_TYPES.Model) {
    const m = r.modelResource, a = m.actionResource;
    resources.ModelResource = {
      XRotation: m.xRotation, YRotation: m.yRotation, ZRotation: m.zRotation, ModelIndex: m.modelIndex,
      TriggerFlag_StartingLock: m.triggerFlagStartingLock, SoundIndex: m.soundIndex,
      ActionResource: {
        Position: a.position, Axis: a.axis, Duration: a.duration, Magnitude: a.magnitude,
        NextObjectOffset: a.nextObjectOffset, PreviousObjectOffset: a.previousObjectOffset, NextObjectIndex: a.nextObjectIndex, Flags: a.flags,
      },
    };
  } else if (o.type === RDB_RESOURCE_TYPES.Light) {
    const l = r.lightResource;
    resources.LightResource = { Unknown1: l.unknown1, Unknown2: l.unknown2, Radius: l.radius };
  } else if (o.type === RDB_RESOURCE_TYPES.Flat) {
    const f = r.flatResource;
    resources.FlatResource = {
      Position: f.position, TextureArchive: f.textureArchive, TextureRecord: f.textureRecord, Flags: f.flags,
      Magnitude: f.magnitude, SoundIndex: f.soundIndex, FactionOrMobileId: f.factionOrMobileId,
      NextObjectOffset: f.nextObjectOffset, Action: f.action,
    };
  }
  return { Position: o.position, Index: o.index, XPos: o.xPos, YPos: o.yPos, ZPos: o.zPos, Type: RDB_RESOURCE_NAMES[o.type] ?? o.type, Resources: resources };
}
function rdbJson(rdb) {
  const refs = [];
  for (const m of rdb.modelReferenceList) {
    if (m.description === UNUSED_REFERENCE) break;
    refs.push({ ModelId: m.modelId, ModelIdNum: m.modelIdNum, Description: m.description });
  }
  return {
    ModelReferenceList: refs,
    ObjectRootList: rdb.objectRootList.map((g) => ({ RdbObjects: g.rdbObjects ? g.rdbObjects.map(rdbObjectJson) : null })),
  };
}

export function blockToDfuJson(dfBlock) {
  const isRmb = dfBlock.type === BLOCK_TYPES.Rmb, isRdb = dfBlock.type === BLOCK_TYPES.Rdb;
  return {
    Position: dfBlock.position,
    Index: dfBlock.index,
    Name: dfBlock.name,
    Type: BLOCK_TYPE_NAMES[dfBlock.type] ?? 'Unknown',
    RmbBlock: isRmb ? rmbJson(dfBlock.rmbBlock) : EMPTY_RMB(),
    RdbBlock: isRdb ? rdbJson(dfBlock.rdbBlock) : { ModelReferenceList: null, ObjectRootList: null },
    RdiBlock: { Data: dfBlock.rdiBlock?.data ? [...dfBlock.rdiBlock.data] : null },
  };
}

const LOCATION_TYPE_NAMES = new Map(Object.entries(LOCATION_TYPES).map(([k, v]) => [v, k]));
const DUNGEON_TYPE_NAMES = new Map(Object.entries(DUNGEON_TYPES).map(([k, v]) => [v, k]));
const CLIMATE_TYPE_NAMES = new Map(Object.entries(CLIMATE_BASE_TYPES).map(([k, v]) => [v, k]));
const NATURE_SET_NAMES = Object.freeze({
  500: 'Nature_RainForest', 501: 'Nature_SubTropical', 502: 'Nature_Swamp', 503: 'Nature_Desert',
  504: 'Nature_TemperateWoodland', 505: 'Nature_TemperateWoodland_Snow', 506: 'Nature_WoodlandHills', 507: 'Nature_WoodlandHills_Snow',
  508: 'Nature_HauntedWoodlands', 509: 'Nature_HauntedWoodlands_Snow', 510: 'Nature_Mountains', 511: 'Nature_Mountains_Snow',
});
const FACTION_RACE_NAMES = Object.freeze({ [-1]: 'None', 0: 'Nord', 1: 'Khajiit', 2: 'Redguard', 3: 'Breton', 4: 'Argonian', 5: 'WoodElf', 6: 'HighElf', 7: 'DarkElf', 11: 'Skakmat', 17: 'Orc', 18: 'Vampire', 19: 'Fey' });
const enumName = (table, v) => (table instanceof Map ? table.get(v) : table[v]) ?? v;

const recordHeaderJson = (h) => (h
  ? { X: h.x, Y: h.y, IsExterior: h.isExterior, Unknown2: h.unknown2, LocationId: h.locationId, IsInterior: h.isInterior, ExteriorLocationId: h.exteriorLocationId, LocationName: h.locationName }
  : { X: 0, Y: 0, IsExterior: 0, Unknown2: 0, LocationId: 0, IsInterior: 0, ExteriorLocationId: 0, LocationName: null });

export function locationToDfuJson(loc) {
  const mt = loc.mapTableData, ext = loc.exterior, ed = ext.exteriorData, c = loc.climate;
  const dungeon = loc.dungeon ?? {};
  return {
    Loaded: !!loc.loaded,
    Name: loc.name,
    RegionName: loc.regionName,
    HasDungeon: !!loc.hasDungeon,
    MapTableData: {
      MapId: mt.mapId, Latitude: mt.latitude, Longitude: mt.longitude,
      LocationType: enumName(LOCATION_TYPE_NAMES, mt.locationType), DungeonType: enumName(DUNGEON_TYPE_NAMES, mt.dungeonType),
      Discovered: !!mt.discovered, Key: mt.key,
    },
    Exterior: {
      RecordElement: { Header: recordHeaderJson(ext.recordElement?.header) },
      BuildingCount: ext.buildingCount,
      Buildings: (ext.buildings ?? []).map(buildingDataJson),
      ExteriorData: {
        AnotherName: ed.anotherName, MapId: ed.mapId, LocationId: ed.locationId, Width: ed.width, Height: ed.height,
        PortTownAndUnknown: ed.portTownAndUnknown, BlockNames: [...ed.blockNames],
      },
    },
    Dungeon: {
      RecordElement: { Header: recordHeaderJson(dungeon.recordElement?.header) },
      Header: { BlockCount: dungeon.header?.blockCount ?? 0 },
      // DFU's `MapsFile.ReadMapDItem` never sets `WaterLevel` or `CastleBlock`, so they serialize as their
      // defaults.
      Blocks: dungeon.blocks ? dungeon.blocks.map((b) => ({ X: b.x, Z: b.z, IsStartingBlock: !!b.isStartingBlock, BlockName: b.blockName, WaterLevel: 0, CastleBlock: false })) : null,
    },
    Climate: {
      WorldClimate: c.worldClimate, ClimateType: enumName(CLIMATE_TYPE_NAMES, c.climateType), NatureSet: enumName(NATURE_SET_NAMES, c.natureArchive),
      GroundArchive: c.groundArchive, NatureArchive: c.natureArchive, SkyBase: c.skyBase,
      People: enumName(FACTION_RACE_NAMES, c.people),
      // DFU's `GetWorldClimateSettings` never sets `Names`, so it serializes as the struct default, Nord.
      Names: enumName(FACTION_RACE_NAMES, c.names ?? 0),
    },
    Politic: loc.politic,
    RegionIndex: loc.regionIndex,
    LocationIndex: loc.locationIndex,
  };
}

export function buildingToDfuJson(dfBlock, recordIndex) {
  const b = dfBlock.rmbBlock.fldHeader.buildingDataList[recordIndex];
  return {
    FactionId: b.factionId, BuildingType: b.buildingType, Quality: b.quality, NameSeed: b.nameSeed,
    RmbSubRecord: rmbSubRecordJson(dfBlock.rmbBlock.subRecords[recordIndex]),
    AutoMapData: null,
  };
}

// Patch ops run in order, each path read against the document the earlier ops left. The ops are `s` set, `d` delete
// a key, `i` insert, `r` remove, and `ci` or `cs` for a copied classic node.

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

export function diffJson(a, b) {
  const ops = [];
  diffInto(a, b, [], ops, new Map());
  return ops;
}

function diffInto(a, b, path, ops, memo) {
  if (a === b) return;
  if (isObj(a) && isObj(b)) {
    for (const k of Object.keys(a)) if (!(k in b)) ops.push(['d', [...path, k]]);
    for (const k of Object.keys(b)) {
      if (!(k in a)) ops.push(['s', [...path, k], b[k]]);
      else diffInto(a[k], b[k], [...path, k], ops, memo);
    }
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) { diffArray(a, b, path, ops, memo); return; }
  if (canon(a, memo) !== canon(b, memo)) ops.push(['s', path, b]);
}

function canon(v, memo) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  let s = memo.get(v);
  if (s === undefined) { s = canonicalJson(v); memo.set(v, s); }
  return s;
}

const MAX_EDITS = 1500;
function lcsPairs(ka, kb) {
  const n = ka.length, m = kb.length, max = n + m;
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace = [];
  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    if (d > MAX_EDITS) return null;
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && ka[x] === kb[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= n && y >= m) { found = true; break; }
    }
  }
  const pairs = [];
  let x = n, y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const vv = trace[d];
    const k = x - y;
    const prevK = (k === -d || (k !== d && vv[off + k - 1] < vv[off + k + 1])) ? k + 1 : k - 1;
    const prevX = vv[off + prevK], prevY = prevX - prevK;
    while (x > prevX && y > prevY) { x--; y--; pairs.push([x, y]); }
    if (d > 0) { x = prevX; y = prevY; }
  }
  return pairs.reverse();
}

function diffArray(a, b, path, ops, memo) {
  const ka = a.map((v) => canon(v, memo)), kb = b.map((v) => canon(v, memo));
  if (a.length === b.length) {
    const pos = [];
    for (let i = 0; i < a.length; i++) if (ka[i] !== kb[i]) diffInto(a[i], b[i], [...path, i], pos, memo);
    const lcs = [];
    diffArrayLcs(a, b, ka, kb, path, lcs, memo);
    ops.push(...(JSON.stringify(pos).length <= JSON.stringify(lcs).length ? pos : lcs));
    return;
  }
  diffArrayLcs(a, b, ka, kb, path, ops, memo);
}

function diffArrayLcs(a, b, ka, kb, path, ops, memo) {
  const pairs = lcsPairs(ka, kb) ?? [];
  const hunks = [];
  let pa = 0, pb = 0;
  for (const [ia, ib] of [...pairs, [a.length, b.length]]) {
    if (ia > pa || ib > pb) hunks.push([pa, ia, pb, ib]);
    pa = ia + 1; pb = ib + 1;
  }
  // Hunks emit right to left so each op's index still matches the document when it applies.
  for (let h = hunks.length - 1; h >= 0; h--) {
    const [a0, a1, b0, b1] = hunks[h];
    const k = a1 - a0, mm = b1 - b0, paired = Math.min(k, mm);
    for (let t = 0; t < paired; t++) {
      const sub = [];
      diffInto(a[a0 + t], b[b0 + t], [...path, a0 + t], sub, memo);
      const whole = ['s', [...path, a0 + t], b[b0 + t]];
      if (JSON.stringify(sub).length < JSON.stringify(whole).length) ops.push(...sub);
      else ops.push(whole);
    }
    for (let t = k - 1; t >= paired; t--) ops.push(['r', [...path, a0 + t]]);
    for (let t = paired; t < mm; t++) ops.push(['i', [...path, a0 + t], b[b0 + t]]);
  }
}

// Copies as a JSON round trip would: -0 becomes 0, a non-finite number null, and undefined is dropped from objects
// and null in arrays. Anything not plain falls back to the real round trip.
const COPY_DEPTH = 1000;
const NOT_PLAIN = Symbol('not plain JSON');
/**
 * @param {any} x
 * @param {number} depth
 * @returns {any}
 */
function copiedValue(x, depth) {
  switch (typeof x) {
    case 'string': case 'boolean': return x;
    case 'number': return Number.isFinite(x) ? (x === 0 ? 0 : x) : null;
    case 'object': return x === null ? null : copiedTree(x, depth + 1);
    case 'bigint': return NOT_PLAIN;
    default: return undefined;
  }
}
/**
 * @param {object} v
 * @param {number} depth
 * @returns {any}
 */
function copiedTree(v, depth) {
  if (depth > COPY_DEPTH || typeof v.toJSON === 'function') return NOT_PLAIN;
  if (Array.isArray(v)) {
    const n = v.length, out = new Array(n);
    for (let i = 0; i < n; i++) {
      const x = copiedValue(v[i], depth);
      if (x === NOT_PLAIN) return NOT_PLAIN;
      out[i] = x === undefined ? null : x;
    }
    return out;
  }
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) return NOT_PLAIN;
  const out = {};
  for (const k of Object.keys(v)) {
    if (k === '__proto__') return NOT_PLAIN;
    const x = copiedValue(v[k], depth);
    if (x === NOT_PLAIN) return NOT_PLAIN;
    if (x !== undefined) out[k] = x;
  }
  return out;
}
const clone = (v) => {
  if (v === null || typeof v !== 'object') return v;
  const c = copiedTree(v, 0);
  return c === NOT_PLAIN ? JSON.parse(JSON.stringify(v)) : c;
};

// With `owned` the base is patched in place. With `shared` only the containers an op passes through are copied, and
// the result shares the rest with `base`, so nothing may write to it.
export function patchJson(base, ops, resolve = null, { owned = false, shared = false } = {}) {
  if (shared) return patchShared(base, ops);
  let root = owned ? base : clone(base);
  for (let op of ops) {
    if (op[0] === 'ci' || op[0] === 'cs') {
      if (!resolve) throw new Error('world-data patch: a copy op and no resolver');
      const v = resolve(op[2]);
      if (v === undefined) throw new Error(`world-data patch: copy source ${JSON.stringify(op[2])} not found`);
      op = [op[0] === 'ci' ? 'i' : 's', op[1], v];
    }
    const [kind, path] = op;
    if (path.length === 0) {
      if (kind !== 's') throw new Error(`world-data patch: '${kind}' at the root`);
      root = clone(op[2]);
      continue;
    }
    let parent = root;
    for (let i = 0; i < path.length - 1; i++) {
      parent = parent?.[path[i]];
      if (parent === null || typeof parent !== 'object') throw new Error(`world-data patch: ${JSON.stringify(path)} does not reach a container`);
    }
    const key = path[path.length - 1];
    if (kind === 's') {
      if (Array.isArray(parent) && !(key >= 0 && key < parent.length)) throw new Error(`world-data patch: set past the end at ${JSON.stringify(path)}`);
      parent[key] = clone(op[2]);
    } else if (kind === 'd') {
      if (!isObj(parent) || !(key in parent)) throw new Error(`world-data patch: no key at ${JSON.stringify(path)}`);
      delete parent[key];
    } else if (kind === 'i') {
      if (!Array.isArray(parent) || key < 0 || key > parent.length) throw new Error(`world-data patch: insert outside the array at ${JSON.stringify(path)}`);
      parent.splice(key, 0, clone(op[2]));
    } else if (kind === 'r') {
      if (!Array.isArray(parent) || key < 0 || key >= parent.length) throw new Error(`world-data patch: remove outside the array at ${JSON.stringify(path)}`);
      parent.splice(key, 1);
    } else throw new Error(`world-data patch: unknown op '${kind}'`);
  }
  return root;
}

function patchShared(base, ops) {
  const mine = new Set();
  const own = (v) => {
    if (mine.has(v)) return v;
    const c = Array.isArray(v) ? v.slice() : { ...v };
    mine.add(c);
    return c;
  };
  let root = base;
  for (const op of ops) {
    const [kind, path] = op;
    if (kind === 'ci' || kind === 'cs') throw new Error('world-data patch: a copy op and no resolver');
    if (path.length === 0) {
      if (kind !== 's') throw new Error(`world-data patch: '${kind}' at the root`);
      root = op[2];
      continue;
    }
    if (root === null || typeof root !== 'object') throw new Error(`world-data patch: ${JSON.stringify(path)} does not reach a container`);
    root = own(root);
    let parent = root;
    for (let i = 0; i < path.length - 1; i++) {
      const next = parent[path[i]];
      if (next === null || typeof next !== 'object') throw new Error(`world-data patch: ${JSON.stringify(path)} does not reach a container`);
      parent = parent[path[i]] = own(next);
    }
    const key = path[path.length - 1];
    if (kind === 's') {
      if (Array.isArray(parent) && !(key >= 0 && key < parent.length)) throw new Error(`world-data patch: set past the end at ${JSON.stringify(path)}`);
      parent[key] = op[2];
    } else if (kind === 'd') {
      if (!isObj(parent) || !(key in parent)) throw new Error(`world-data patch: no key at ${JSON.stringify(path)}`);
      delete parent[key];
    } else if (kind === 'i') {
      if (!Array.isArray(parent) || key < 0 || key > parent.length) throw new Error(`world-data patch: insert outside the array at ${JSON.stringify(path)}`);
      parent.splice(key, 0, op[2]);
    } else if (kind === 'r') {
      if (!Array.isArray(parent) || key < 0 || key >= parent.length) throw new Error(`world-data patch: remove outside the array at ${JSON.stringify(path)}`);
      parent.splice(key, 1);
    } else throw new Error(`world-data patch: unknown op '${kind}'`);
  }
  return root;
}

export function jsonAt(root, path) {
  let v = root;
  for (const k of path) { if (v === null || typeof v !== 'object') return undefined; v = v[k]; }
  return v;
}
