// Daggerfall city keeps its MapId and its LocationId (50026) so quest places stay valid. The undercroft carries its
// own location id and map id, so a save made there re-enters it and no castle quest resolves there.

import { registerPortBlock, registerLocationEdit, installWorldDataReplacement } from '../formats/worldDataReplacement.js';
import { drawNamedBuildings } from '../talk/talkTopics.js';
import { configureLayoutPins, layoutLocationKeyOfMapId } from './layoutPins.js';
import { LOCATION_TYPES, DUNGEON_TYPES } from '../formats/mapsFile.js';
import { registerCustomModel } from './customModels.js';
import { ARENA_TEXT } from '../arena/arenaText.js';
import { ARENA_MODEL_ID, buildArenaModel, withStairRamps, sealArenaSeams, sealArenaSeamsSliced } from './arenaModel.js';
import { registerArenaPlaques } from './arenaPlaques.js';
import { ARENA_GROUND_MODEL, arenaGroundModel, SAND_R } from './arenaFloor.js';
import { BUILDING_TYPES } from './buildingNames.js';
import ARENA_BLOCK_JSON from '../../vendor/daggerfall-arena/Arena/ARENADAG.RMB.json' with { type: 'json' };
import UNDERCROFT_JSON from '../../vendor/daggerfall-arena/Arena/undercroft.json' with { type: 'json' };
import ARENA_MODEL_INDEX from '../../vendor/daggerfall-arena/Models/864102.json' with { type: 'json' };

export const ARENA_REGION = 17;
export const ARENA_LOCATION = 1231;
export const ARENA_LOCATION_KEY = ARENA_LOCATION * 100 + ARENA_REGION;
export const ARENA_CELL = Object.freeze([4, 3]);
// Port block indices start at 900000, past every BSA block; gateArena.js holds 900000, so each port block needs its
// own index.
export const ARENA_BLOCK = 'ARENADAG.RMB';
export const ARENA_BLOCK_INDEX = 900100;
export const UNDERCROFT_LOCATION_ID = 55398;
export const UNDERCROFT_MAP_ID = 211207;

// DFU building keys pack `(x << 16) + (y << 8) + record`.
export const inArenaCell = (buildingKey) => buildingKey > 0 && (buildingKey >> 16) === ARENA_CELL[0] && ((buildingKey >> 8) & 0xff) === ARENA_CELL[1];
export const isArenaCity = (loc) => loc?.regionIndex === ARENA_REGION && loc?.locationIndex === ARENA_LOCATION;

// Each `position` is the flat's identity and its StaticNPC name seed, so hosts find each person by it. Coordinates
// are RMB units with z negative into the block.
export const ARENA_GATE_PEOPLE = Object.freeze([
  Object.freeze({ role: 'herald', archive: 183, record: 5, faction: 595, x: 2025, z: -200, position: 0x41524e01 }),
  Object.freeze({ role: 'warden', archive: 183, record: 2, faction: 372, x: 1930, z: -232, position: 0x41524e02 }),
  Object.freeze({ role: 'warden', archive: 183, record: 3, faction: 372, x: 2120, z: -232, position: 0x41524e03 }),
  Object.freeze({ role: 'redRecruiter', archive: 182, record: 25, faction: 518, x: 1740, z: -160, position: 0x41524e04 }),
  Object.freeze({ role: 'blueRecruiter', archive: 182, record: 28, faction: 518, x: 2310, z: -160, position: 0x41524e05 }),
  Object.freeze({ role: 'bookmaker', archive: 182, record: 24, faction: 518, x: 2440, z: -120, position: 0x41524e06 }),
]);
export function arenaGatePersonOf(pn) {
  if (!pn) return null;
  return ARENA_GATE_PEOPLE.find((p) => p.position === pn.position && p.archive === pn.textureArchive && p.record === pn.textureRecord) ?? null;
}
export function arenaGatePersonName(pn, names = ARENA_TEXT.gateNames) {
  const p = arenaGatePersonOf(pn);
  return p ? names?.[p.role] ?? null : null;
}

export const ARENA_PAVING = 46;
export function arenaGroundTiles() {
  const out = [];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
    const rot = (h >> 3) & 1, flip = (h >> 7) & 1;
    out.push({ TileBitfield: ARENA_PAVING | (rot ? 0x40 : 0) | (flip ? 0x80 : 0), TextureRecord: ARENA_PAVING, IsRotated: !!rot, IsFlipped: !!flip });
  }
  return out;
}
const rmbX = (m) => Math.round(m / 0.025);
const rmbZ = (m) => Math.round(m / 0.025) - 4096;
export const ARENA_PLAZA_FLATS = Object.freeze([
  Object.freeze({ archive: 210, record: 29, at: [6.9, 43.3] }), Object.freeze({ archive: 210, record: 29, at: [6.9, 59.3] }),
  Object.freeze({ archive: 212, record: 6, at: [1.6, 43.8] }),
  Object.freeze({ archive: 210, record: 29, at: [94.9, 43.3] }), Object.freeze({ archive: 210, record: 29, at: [94.9, 59.3] }),
  Object.freeze({ archive: 212, record: 6, at: [100.2, 58.6] }),
  Object.freeze({ archive: 210, record: 29, at: [42.9, 3.4] }), Object.freeze({ archive: 210, record: 29, at: [58.4, 3.4] }),
]);
// Rows are `[model, x, z, turn, y]`, with `turn` in DF units of 512 per quarter turn.
export const ARENA_PLAZA_MODELS = Object.freeze([
  Object.freeze([41105, 11.7, 51.8, 512, -18]), Object.freeze([41106, 11.7, 62.8, 512, -17]), Object.freeze([41105, 11.7, 29.8, 512, -18]),
  Object.freeze([41832, 11.4, 20.4, 0, -30]), Object.freeze([41832, 11.5, 22.1, 88, -30]), Object.freeze([41822, 10.2, 21.2, 264, -19]),
  Object.freeze([41105, 90.1, 51.8, 512, -18]), Object.freeze([41106, 90.1, 62.8, 512, -17]), Object.freeze([41105, 90.1, 29.8, 512, -18]),
  Object.freeze([41832, 90.4, 20.4, 0, -30]), Object.freeze([41832, 90.3, 22.1, -88, -30]), Object.freeze([41822, 91.6, 21.2, -80, -19]),
  Object.freeze([41105, 36.9, 6.0, 0, -18]), Object.freeze([41106, 64.4, 6.0, 0, -17]),
]);

export function arenaBlockJson(vendored = ARENA_BLOCK_JSON) {
  const rmb = vendored.RmbBlock;
  const fld = { ...rmb.FldHeader, AutoMapData: arenaAutoMap(rmb.FldHeader.AutoMapData, rmb) };
  return {
    ...vendored,
    RmbBlock: {
      ...rmb,
      FldHeader: { ...fld, GroundData: { ...fld.GroundData, GroundTiles: arenaGroundTiles() } },
      Misc3dObjectRecords: [
        ...rmb.Misc3dObjectRecords,
        ...ARENA_PLAZA_MODELS.map(([model, x, z, turn, y]) => ({
          ModelId: String(model), ModelIdNum: model, ObjectType: 0, XPos: rmbX(x), YPos: y, ZPos: rmbZ(z),
          XScale: 1, YScale: 1, ZScale: 1, XRotation: 0, YRotation: turn, ZRotation: 0,
        })),
      ],
      MiscFlatObjectRecords: [
        ...rmb.MiscFlatObjectRecords,
        ...ARENA_GATE_PEOPLE.map((p) => ({ Position: p.position, XPos: p.x, YPos: 0, ZPos: p.z, TextureArchive: p.archive, TextureRecord: p.record, FactionID: p.faction, Flags: 0 })),
        ...ARENA_PLAZA_FLATS.map((f, i) => ({ Position: 0x41525100 + i, XPos: rmbX(f.at[0]), YPos: -4, ZPos: rmbZ(f.at[1]), TextureArchive: f.archive, TextureRecord: f.record, FactionID: 0, Flags: 0 })),
      ],
    },
  };
}

// Edits the location in place once. Without a blocks file nothing is edited, because the strip cannot be drawn and
// renaming the grid alone would rename every building after the cell.
export function standArenaInLocation(dfLocation, maps, blocksFile) {
  if (!isArenaCity(dfLocation)) return null;
  const ed = dfLocation.exterior?.exteriorData;
  if (!ed?.blockNames || !Array.isArray(dfLocation.exterior.buildings) || !blocksFile) return null;
  const [cx, cy] = ARENA_CELL;
  if (cx >= ed.width || cy >= ed.height) return null;
  const at = cy * ed.width + cx;
  if (ed.blockNames[at] === ARENA_BLOCK) return { block: ARENA_BLOCK, stripped: 0, already: true };
  // Blocks are read in the same order as every reader (y outer, x inner) and only up to the cell, since later
  // blocks do not change its draw.
  const list = [];
  let cell = null;
  for (let y = 0; y < ed.height && !cell; y++) {
    for (let x = 0; x < ed.width; x++) {
      const name = maps?.getRmbBlockName ? maps.getRmbBlockName(dfLocation, x, y) : ed.blockNames[y * ed.width + x];
      const dfBlock = blocksFile.getBlockByName(name);
      const b = { dfBlock, x, y };
      if (dfBlock) list.push(b);
      if (x === cx && y === cy) { cell = b; break; }
    }
  }
  const { drawn } = drawNamedBuildings(dfLocation.exterior.buildings, list, { locationIndex: dfLocation.locationIndex ?? 0 });
  const strip = new Set(drawn.get(cell) ?? []);
  const old = ed.blockNames[at];
  dfLocation.exterior.buildings = dfLocation.exterior.buildings.filter((b) => !strip.has(b));
  dfLocation.exterior.buildingCount = dfLocation.exterior.buildings.length;
  ed.blockNames = ed.blockNames.slice();
  ed.blockNames[at] = ARENA_BLOCK;
  // `arenaCityNow` in world.js reads a moved deed's old house type from `arenaTook` for arenaMove.js.
  ed.arenaTook = old;
  return { block: old, stripped: strip.size };
}

export function undercroftLocation(city, spec = UNDERCROFT_JSON) {
  const name = spec.Name;
  const letters = ['N', 'W', 'L', 'S', 'B', 'M'];
  const header = (isInterior) => ({
    alwaysOne1: 1, x: city.exterior?.recordElement?.header?.x ?? 0, y: city.exterior?.recordElement?.header?.y ?? 0,
    isExterior: isInterior ? 0 : 32768, unknown1: 0, unknown2: isInterior ? spec.Unknown2 ?? 0 : 0, alwaysOne2: 1,
    locationId: spec.LocationId, isInterior: isInterior ? 1 : 0, exteriorLocationId: isInterior ? spec.LocationId : 0, locationName: name,
  });
  return {
    loaded: true, regionName: city.regionName, name: ARENA_TEXT.undercroft.name, regionIndex: city.regionIndex, locationIndex: city.locationIndex,
    hasDungeon: true, politic: city.politic, climate: city.climate,
    mapTableData: { ...city.mapTableData, mapId: UNDERCROFT_MAP_ID, locationType: LOCATION_TYPES.DungeonKeep, dungeonType: DUNGEON_TYPES[spec.DungeonType] ?? DUNGEON_TYPES.HumanStronghold, discovered: true, key: 0, locationId: spec.LocationId },
    exterior: city.exterior,
    dungeon: {
      recordElement: { doorCount: 0, doors: [], header: header(true) },
      header: { nullValue1: 0, unknown1: 0, unknown2: 0, blockCount: spec.Blocks.length, unknown3: null },
      blocks: spec.Blocks.map((b) => ({
        x: b.X, z: b.Z, isStartingBlock: !!b.IsStartingBlock, blockName: b.BlockName,
        blockIndex: Math.max(0, letters.indexOf(b.BlockName[0])), blockNumber: Number(b.BlockName.slice(1, 8)) || 0,
      })),
    },
    arenaUndercroft: true,
  };
}
export const isArenaUndercroft = (loc) => !!loc?.arenaUndercroft && loc?.dungeon?.recordElement?.header?.locationId === UNDERCROFT_LOCATION_ID;
export const isUndercroftDoor = (e, dungeonEntranceType) => e?.dfBlock?.name === ARENA_BLOCK && e?.door?.doorType === dungeonEntranceType;

export const arenaRecordDisplaced = (rec, keyOfMapId = layoutLocationKeyOfMapId) =>
  !!rec && inArenaCell(rec.buildingKey) && keyOfMapId(rec.mapId ?? rec.mapID) === ARENA_LOCATION_KEY;

export const arenaDrawnModel = (built) => withStairRamps(sealArenaSeams(built));
export const arenaDrawnModelSliced = async (built, breathe) => withStairRamps(await sealArenaSeamsSliced(built, breathe));

export const ARENA_MODEL_BIN_URL = new URL('../../vendor/daggerfall-arena/Models/864102.bin', import.meta.url).href;

let _installed = null;
export function installArena({ readBin = null, log = console } = {}) {
  if (_installed) return _installed;
  installWorldDataReplacement();
  registerPortBlock(ARENA_BLOCK, arenaBlockJson(), ARENA_BLOCK_INDEX);
  registerLocationEdit(standArenaInLocation);
  configureLayoutPins({ recordDisplaced: (rec) => arenaRecordDisplaced(rec) });
  registerArenaPlaques();
  registerCustomModel(ARENA_GROUND_MODEL, () => arenaGroundModel(arenaGroundTiles()));
  const read = readBin ?? (async () => {
    const r = await globalThis.fetch(ARENA_MODEL_BIN_URL);
    if (!r?.ok) throw new Error(`${ARENA_MODEL_BIN_URL}: ${r?.status ?? 'no answer'}`);
    return new Uint8Array(await r.arrayBuffer());
  });
  _installed = (async () => {
    try {
      const bin = await read();
      registerCustomModel(ARENA_MODEL_ID, (ctx) => arenaDrawnModel(buildArenaModel(ARENA_MODEL_INDEX, bin, (id) => ctx?.classicModel?.(id) ?? null)), () => true,
        { climateFree: true, needs: [...new Set(ARENA_MODEL_INDEX.pieces.map((p) => p.model))],
          buildSliced: (ctx, breathe) => arenaDrawnModelSliced(buildArenaModel(ARENA_MODEL_INDEX, bin, (id) => ctx?.classicModel?.(id) ?? null), breathe) });
      return true;
    } catch (e) {
      log?.warn?.('[arena] the colosseum\'s model did not load - its block stands without it', e?.message ?? e);
      return false;
    }
  })();
  return _installed;
}
export function _resetArena() { _installed = null; }

// Bowl pixels inside the colosseum box and off the sand take a guild hall byte so both town maps draw the walls.
// The city navgrid reads only nonzero, so walking is unchanged.
export const ARENA_MAP_BYTE = BUILDING_TYPES.GuildHall + 1;
export const ARENA_MAP_NAME = 'Arena';
const ARENA_BOWL_BYTE = BUILDING_TYPES.Special1 + 1;
const MAP_PX = (4096 * 0.025) / 64;
export function arenaColosseumAt(rmb = ARENA_BLOCK_JSON.RmbBlock) {
  const c = rmb.Misc3dObjectRecords.find((o) => Number(o.ModelIdNum) === ARENA_MODEL_ID);
  return [c.XPos * 0.025, 0, (c.ZPos + 4096) * 0.025];
}
export function arenaAutoMap(bytes, rmb = ARENA_BLOCK_JSON.RmbBlock, box = ARENA_MODEL_INDEX.source.aabb) {
  if (!bytes?.length) return bytes;
  const [cx, , cz] = arenaColosseumAt(rmb);
  return Array.from(bytes, (v, i) => {
    if (v !== ARENA_BOWL_BYTE) return v;
    // Automap rows run against +z, the same flip the navgrid uses.
    const x = ((i % 64) + 0.5) * MAP_PX - cx, z = (63 - Math.floor(i / 64) + 0.5) * MAP_PX - cz;
    const inBox = Math.abs(x - box.center[0]) <= box.extent[0] + MAP_PX / 2 && Math.abs(z - box.center[2]) <= box.extent[2] + MAP_PX / 2;
    return inBox && x * x + z * z > SAND_R * SAND_R ? ARENA_MAP_BYTE : v;
  });
}
export const arenaTownLandmark = (dfBlock) => (dfBlock?.name === ARENA_BLOCK
  ? { name: ARENA_MAP_NAME, position: arenaColosseumAt(), buildingType: BUILDING_TYPES.GuildHall } : null);
