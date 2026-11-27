// BUNNYFALL: AI ROOMS - the law, pure. Twenty rooms (RDB blocks) laid out by an AI from Daggerfall's own pieces and a
// kit of new ones (vendor/bunnyfall-ai-rooms, made by tools/aiRoom) join the random dungeons: some of a dungeon's
// ordinary blocks are laid as one of these instead.
//
// WHICH DUNGEONS: any but the main story's, the editor's own places and the port's own (their blocks are not classic
// names). A dungeon's blocks are drawn first as ever (smaller dungeons' draws are DFU's and are not touched); this is a
// second pass over the result, on a hash of (map id, block place), so it moves no draw and the same dungeon is the same
// every visit and on every client.
// WHICH BLOCKS: never the starting block (it holds the way out); a border block (B...) is swapped for a border room,
// any other for an interior room. A share of the rest (AI_ROOM_SHARE), none in a dungeon of fewer than three blocks.
// WHY IT IS SAFE FOR QUESTS: every room carries foe, loot, quest and quest-item markers like a classic block.
import { hash32 } from './spawnedDungeons.js';

export const AI_ROOMS_VENDOR = 'bunnyfall-ai-rooms';
/** The share of a dungeon's ordinary blocks laid as an AI room. */
export const AI_ROOM_SHARE = 0.3;
export const AI_MIN_BLOCKS = 3;
const SALT = 0x41495230;   // "AIR0"
const CLASSIC_NAME = /^[BNWLSM]\d{7}\.RDB$/i;
export const isBorderBlockName = (name) => /^b/i.test(name);

/** The save-stamp offset a layout with AI rooms adds (world/smallerDungeons.js smallerDungeonsStamp): a save made in
 *  the layout without them stands at the start when loaded in the layout with them, as for the other layout changes. */
export const AI_STAMP_OFFSET = 16;

/**
 * @param {Array<{blockName:string,x:number,z:number,isStartingBlock?:boolean}>} blocks a dungeon's blocks
 * @param {Array<{name:string,kind:'border'|'interior'}>} rooms the AI rooms
 * @param {number} mapId the dungeon's map id (the hash's seed)
 * @returns {{ blocks: Array, swapped: number }} the same blocks (the same array when nothing is swapped)
 */
export function swapAiRooms(blocks, rooms, mapId, share = AI_ROOM_SHARE) {
  if (!Array.isArray(blocks) || blocks.length < AI_MIN_BLOCKS || !rooms?.length) return { blocks, swapped: 0 };
  const border = rooms.filter((r) => r.kind === 'border'), interior = rooms.filter((r) => r.kind !== 'border');
  let swapped = 0;
  const out = blocks.map((b) => {
    if (b.isStartingBlock || !CLASSIC_NAME.test(b.blockName)) return b;
    const pool = isBorderBlockName(b.blockName) ? border : interior;
    if (!pool.length) return b;
    if (hash32(SALT, mapId >>> 0, b.x | 0, b.z | 0, 1) / 4294967296 >= share) return b;
    const room = pool[hash32(SALT, mapId >>> 0, b.x | 0, b.z | 0, 2) % pool.length];
    swapped++;
    return { ...b, blockName: room.name };
  });
  return swapped ? { blocks: out, swapped } : { blocks, swapped: 0 };
}
