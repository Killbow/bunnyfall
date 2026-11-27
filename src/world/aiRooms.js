// BUNNYFALL: AI ROOMS - the install and the hook (the law is aiRoomLaw.js). The rooms are vendor/bunnyfall-ai-rooms:
// `Rooms/<NAME>.RDB.json` (each a block, DFU world-data JSON), `rooms.json` (their list) and `Models/<id>.json` (the new
// pieces and each room's shell, registered by world/editorModels.js behind the same switch). Made by tools/aiRoom; the
// folder's `dungeon-editor.mod.json` gives the mod its one switch, `Enabled`, its Features row and its online room key
// (mods/editorMods.js), and like every world-data mod it also needs Replace Game Artwork offline.
//
// The blocks are the port's own (registerPortBlock, fixed indexes from 910001, past any BSA and the other port blocks),
// so the layout reads them by name like any block. The hook is `withAiRooms`, the last step of dungeonLocationFor.
import { registerPortBlock, installWorldDataReplacement, worldDataDoorOpen } from '../formats/worldDataReplacement.js';
import { modSetting } from '../mods/modSettings.js';
import { isMainStoryDungeon } from './dungeonTextures.js';
import { AI_ROOMS_VENDOR, swapAiRooms } from './aiRoomLaw.js';

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
      if (registerPortBlock(room.name, json, room.index)) served.push({ name: room.name, kind: room.kind });
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

/** The location to build: its blocks laid again with AI rooms among them, or the location itself. Non-mutating. */
export function withAiRooms(dfLocation) {
  const blocks = dfLocation?.dungeon?.blocks;
  if (!blocks || !aiRoomsOn()) return dfLocation;
  const mapId = dfLocation.mapTableData?.mapId;
  if (!Number.isFinite(mapId) || isMainStoryDungeon(mapId) || dfLocation.editorDungeon) return dfLocation;
  const { blocks: laid, swapped } = swapAiRooms(blocks, _rooms, mapId);
  return swapped ? { ...dfLocation, dungeon: { ...dfLocation.dungeon, blocks: laid, aiRooms: true } } : dfLocation;
}

/** Did this build lay AI rooms? */
export const hasAiRooms = (dfLocation) => dfLocation?.dungeon?.aiRooms === true;
