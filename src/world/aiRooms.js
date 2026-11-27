// BUNNYFALL: AI ROOMS - the install and the hook (the law is aiRoomLaw.js). The rooms are vendor/bunnyfall-ai-rooms:
// `Rooms/<NAME>.RDB.json` (each a block, DFU world-data JSON), `rooms.json` (their list) and `Models/<id>.json` (the new
// pieces and each room's shell, registered by world/editorModels.js behind the same switch). Made by tools/aiRoom; the
// folder's `dungeon-editor.mod.json` gives the mod its one switch, `Enabled`, its Features row and its online room key
// (mods/editorMods.js), and like every world-data mod it also needs Replace Game Artwork offline.
//
// The blocks are the port's own (registerPortBlock, fixed indexes from 910001, past any BSA and the other port blocks),
// so the layout reads them by name like any block. The hook is `withAiRooms`, the last step of dungeonLocationFor.
import { registerPortBlock, installWorldDataReplacement, worldDataDoorOpen, boundWorldDataBlocks } from '../formats/worldDataReplacement.js';
import { modSetting } from '../mods/modSettings.js';
import { isMainStoryDungeon } from './dungeonTextures.js';
import { AI_ROOMS_VENDOR, swapAiRooms, portsOfBlock } from './aiRoomLaw.js';

// BROWSER-ONLY globs (as mods/modWorldData.js): in node the list is empty, so no room is served
const globRooms = () => import.meta.glob('../../vendor/bunnyfall-ai-rooms/Rooms/*.json', { import: 'default' });
const globList = () => import.meta.glob('../../vendor/bunnyfall-ai-rooms/rooms.json', { eager: true, import: 'default' });

let _rooms = [];
let _installed = null;
/** Once: every room's block onto the door. Resolves to the number served. */
export function installAiRooms() {
  _installed ??= (async () => {
    installWorldDataReplacement();
    const list = Object.values(globList())[0] ?? [];
    const files = globRooms();
    const served = [];
    await Promise.all(list.map(async (room) => {
      const path = Object.keys(files).find((p) => p.endsWith(`/${room.name}.json`));
      if (!path) { console.warn(`[ai rooms] ${room.name}: no file - skipped`); return; }
      const json = await files[path]();
      if (registerPortBlock(room.name, json, room.index)) served.push({ name: room.name, kind: room.kind, ports: new Set((room.ports ?? []).map((p) => `${p[0]}:${p[1]}`)), joins: room.joins === true });
    }));
    _rooms = served.sort((a, b) => a.name.localeCompare(b.name));
    return _rooms.length;
  })();
  return _installed;
}

/** Is the mod on (its switch, and the world-data door it shares with every such mod)? Never throws. */
export function aiRoomsOn() {
  try { return _rooms.length > 0 && worldDataDoorOpen() && modSetting(AI_ROOMS_VENDOR, 'Enabled') === true; } catch { return false; }
}

const _classicPorts = new Map();   // a classic block's doors, read from its own objects once
/** A block's doors ('N:A' ...): a room's from its list, a classic block's from the game's own block (none, and so no swap,
 *  when the block file is not bound or the block does not read). */
function portsOf(name) {
  const room = _rooms.find((r) => r.name === name);
  if (room) return room.ports;
  if (!_classicPorts.has(name)) {
    let ports = new Set();
    try { const blocks = boundWorldDataBlocks(); ports = portsOfBlock(blocks?.getBlockByName(name)); } catch { /* unreadable: no doors */ }
    _classicPorts.set(name, ports);
  }
  return _classicPorts.get(name);
}
const joins = (name) => _rooms.find((r) => r.name === name)?.joins ?? true;   // a classic block joins its floors; a room only with a stair

const _laid = new Map();   // 'mapId:names' -> the blocks laid, so a location asked again (the map's labels, a quest's lookups) costs one look
/** The location to build: its blocks laid again with AI rooms among them, or the location itself. Non-mutating. */
export function withAiRooms(dfLocation) {
  const blocks = dfLocation?.dungeon?.blocks;
  if (!blocks || !aiRoomsOn()) return dfLocation;
  const mapId = dfLocation.mapTableData?.mapId;
  if (!Number.isFinite(mapId) || isMainStoryDungeon(mapId) || dfLocation.editorDungeon) return dfLocation;
  const key = `${mapId}:${blocks.map((b) => `${b.blockName}@${b.x},${b.z}${b.isStartingBlock ? '*' : ''}`).join('|')}`;
  let laid = _laid.get(key);
  if (!laid) {
    laid = swapAiRooms(blocks, _rooms, mapId, { portsOf, joins });
    if (_laid.size > 4000) _laid.clear();
    _laid.set(key, laid);
  }
  return laid.swapped ? { ...dfLocation, dungeon: { ...dfLocation.dungeon, blocks: laid.blocks, aiRooms: true } } : dfLocation;
}

/** Did this build lay AI rooms? */
export const hasAiRooms = (dfLocation) => dfLocation?.dungeon?.aiRooms === true;
