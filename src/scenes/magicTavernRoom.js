// @ts-check
// MAGICAL TAVERNS - THE HOST-FACING HALF (the law is systems/magicTavern.js; the pictures render/magicTavernLook.js).
//
//   THE TOWN'S PICK   `noteTown` reads a town's blocks as its outside is built (scenes/pixelBuild.js) and keeps which tavern
//                     is its magical one, by the law; `isMagic` answers for a door.
//   THE DOOR          `magicHallEntry` turns the door's hit into the shared hall's: the biggest tavern Daggerfall has in the place
//                     of the tavern's own room, the door, the way back out and the building's record (so a tavern shift, a
//                     save and an exit all still name the tavern the player walked into) left exactly as they were.
//   THE FOLK          `seatMagicFolk` stands the tavern's own people in the hall, its keeper as Nyx.
//   THE ROOM          `magicRoomIdentity` is what the world host names the relay room by, and the offset that takes the
//                     door's town out of every pose (every door is a different place in the scene; the hall is one place).
// A hit with no hall to swap in (the block missing from this install) answers null: the tavern is then the plain one.

import { BUILDING_TYPES } from '../world/buildingNames.js';
import { collectInteriorPeople } from '../characters/interiorPeople.js';
import { blockBuildingCount, makeBuildingKey } from '../talk/talkTopics.js';
import { magicTavernsOn, magicTavernKeyOf, MAGIC_ROOM, MAGIC_HALL_BLOCKS, MAGIC_KEEPER } from '../systems/magicTavern.js';
import { magicGlassRestyle } from '../render/magicTavernLook.js';
import { t } from '../ui/textManager.js';

/** The line said as the portal lets a player in. */
export const magicHallGreeting = () => t('magictavern.enter', 'The portal closes behind you. Stars wheel beyond the windows, and Nyx polishes a glass at the bar.');

/** @type {Map<number, number | null>} a town's map id -> its magical tavern's building key (null: it has none) */
const chosen = new Map();

/** The building keys of a town's taverns, off its blocks (each `{ x, y, dfBlock }`, as the outside is built from). @param {any[]} locBlocks */
export function tavernKeysOf(locBlocks) {
  const out = [];
  for (const b of locBlocks ?? []) {
    const list = b?.dfBlock?.rmbBlock?.fldHeader?.buildingDataList;
    const n = blockBuildingCount(b?.dfBlock) ?? list?.length ?? 0;
    for (let i = 0; i < n; i++) if (list?.[i]?.buildingType === BUILDING_TYPES.Tavern) out.push(makeBuildingKey(b.x ?? 0, b.y ?? 0, i));
  }
  return out;
}

/** Keep the town's pick as its outside is built; answers the magical tavern's key, or null. @param {number} mapId @param {any[]} locBlocks */
export function noteTown(mapId, locBlocks) {
  if (!magicTavernsOn() || !mapId) return null;
  const id = mapId >>> 0;
  if (!chosen.has(id)) chosen.set(id, magicTavernKeyOf(id, tavernKeysOf(locBlocks)));
  return chosen.get(id) ?? null;
}

/** Whether a building of a town is its magical tavern. @param {number} mapId @param {number} buildingKey */
export const isMagic = (mapId, buildingKey) => magicTavernsOn() && !!mapId && chosen.get(mapId >>> 0) === buildingKey;

/** The town's talk directory rows, in place: the magical tavern is named for what it is (as the guild halls are, bunnyHall.js). @param {Array<{ buildingKey?: number, name?: string }>} rows @param {number} mapId */
export function markMagicTavernRows(rows, mapId) {
  for (const r of rows) if (r.buildingKey != null && isMagic(mapId, r.buildingKey)) r.name = t('magictavern.name', 'The Nowhere Tavern');
  return rows;
}

/** @type {{ name: string, record: number } | null | undefined} */
let grandest;
/** The biggest tavern interior in the game's files (see systems/magicTavern.js MAGIC_HALL_BLOCKS), or null: read once. @param {any} blocks */
export function grandestTavern(blocks) {
  if (grandest !== undefined) return grandest;
  grandest = null;
  try {
    let best = -1;
    const names = [];
    for (let i = 0; i < (blocks?.count ?? 0); i++) { const n = blocks.getBlockName(i); if (n && MAGIC_HALL_BLOCKS.test(n)) names.push(n); }
    for (const name of names.sort()) {
      const rmb = blocks.getBlockByName(name)?.rmbBlock;
      const list = rmb?.fldHeader?.buildingDataList;
      for (let r = 0; r < (rmb?.subRecords?.length ?? 0); r++) {
        const inside = rmb.subRecords[r]?.interior;
        if (!inside || list?.[r]?.buildingType !== BUILDING_TYPES.Tavern) continue;
        const size = (inside.block3dObjectRecords?.length ?? 0) + (inside.blockFlatObjectRecords?.length ?? 0);
        if (size > best) { best = size; grandest = { name, record: r }; }
      }
    }
    if (!grandest) console.warn('[magic tavern] no tavern interior found - magical taverns stay plain');
  } catch (e) { console.warn('[magic tavern] the grandest tavern could not be found', e?.message ?? e); }
  return grandest;
}

/**
 * The shared hall's entry for a tavern door, or null (not the magical tavern; the feature off; no hall to be had).
 * `hit` the door's hit as the host built it; the answer is a hit of the hall: its block and record, a table with the star
 * glass, and the door the player came through (its matrix is the room's frame, as for any building) - the host keeps the
 * original as the way back.
 * @param {{ hit: any, building: any, blocks: any, mapId: number }} p
 */
export function magicHallEntry({ hit, building, blocks, mapId }) {
  if (!building || building.buildingType !== BUILDING_TYPES.Tavern || !isMagic(mapId, building.buildingKey)) return null;
  try {
    const pick = grandestTavern(blocks);
    const dfBlock = pick ? blocks.getBlockByName(pick.name) : null;
    if (!pick || !dfBlock?.rmbBlock?.subRecords?.[pick.record]?.interior) return null;
    const origin = hit?.dfBlock?.rmbBlock?.subRecords?.[hit.recordIndex];
    const folk = origin?.interior ? collectInteriorPeople(origin) : [];
    // The hall stands at the door's place but never turned with the building: every door of every town is a different place and
    // a different way round, and the pose can only take a place off (`magicRoomIdentity`), not a turn.
    const m = Array.from(hit.door.matrix);
    const door = { ...hit.door, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, m[12], m[13], m[14], 1] };
    return { hit: { ...hit, door, dfBlock, recordIndex: pick.record, season: 0, restyle: magicGlassRestyle(), roomModels: undefined }, folk };
  } catch (e) { console.warn('[magic tavern] the hall would not open', e?.message ?? e); return null; }
}

/**
 * Stand the tavern's own people in the hall, in place: the hall's own people go (they are the Guild's, and a tavern has no
 * use of them), the tavern's come in their stead on the hall's spots - the keeper first, as Nyx - all at every hour.
 * `isKeeper(factionID)` says which of them keeps the house (the tavern route's: a Merchants faction inside a tavern).
 * @param {any[]} people the hall's people as the room built them (parent frame)
 * @param {Array<any>} folk the tavern's own, as its record lists them
 * @param {Array<[number, number, number]>} spots the room's floor spots (parent frame), used past the hall's own people
 * @param {(factionID: number) => boolean} isKeeper
 */
export function seatMagicFolk(people, folk, spots, isKeeper) {
  const seats = [...people.map((p) => /** @type {[number, number, number]} */ ([p.x, p.y, p.z])), ...spots];
  if (!seats.length || !folk.length) return;
  const keeper = folk.find((f) => isKeeper(f.factionID)) ?? folk[0];
  const order = [keeper, ...folk.filter((f) => f !== keeper)].slice(0, seats.length);
  people.length = 0;
  order.forEach((f, i) => {
    const [x, y, z] = seats[i];
    const nyx = f === keeper;
    people.push({
      ...f, x, y, z, active: true, questBehaviour: null,
      ...(nyx ? { guildClerkArt: MAGIC_KEEPER.art, _mwLook: null, editorPerson: { name: MAGIC_KEEPER.name, lines: [] }, magicKeeper: true } : {}),
    });
  });
}

/**
 * What the world host names the relay room by while the player stands in the shared hall: the room's own map id and
 * building key (`interior:m<mapId>.<key>`, the relay's ordinary building room, so every magical tavern is one room), and
 * the door's place in the scene (`origin`), which the pose takes off and puts back so two players who came through doors
 * in two towns stand in the same place of the same hall.
 * @param {number[] | null} doorOrigin the translation of the matrix the hall is parented at
 */
export const magicRoomIdentity = (doorOrigin) => ({
  buildingKey: MAGIC_ROOM.buildingKey, layout: null, sharedMapId: MAGIC_ROOM.mapId, sharedOrigin: doorOrigin ? [doorOrigin[0], doorOrigin[1], doorOrigin[2]] : [0, 0, 0],
});
