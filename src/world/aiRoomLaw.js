// BUNNYFALL: AI ROOMS - the law, pure. Forty rooms (RDB blocks) laid out by an AI from Daggerfall's own pieces and a kit
// of new ones (vendor/bunnyfall-ai-rooms, made by tools/aiRoom) join the random dungeons: some of a dungeon's ordinary
// blocks are laid as one of these instead.
//
// WHICH DUNGEONS: any but the main story's, the editor's own places and the port's own (their blocks are not classic
// names). A dungeon's blocks are drawn first as ever (smaller dungeons' draws are DFU's and are not touched); this is a
// second pass over the result, on a hash of (map id, block place), so it moves no draw and the same dungeon is the same
// every visit and on every client.
// WHICH BLOCKS: never the starting block (it holds the way out); a border block (B...) is swapped for a border room,
// any other for an interior room. A share of the rest (AI_ROOM_SHARE), none in a dungeon of fewer than three blocks.
// THE WAY THROUGH (the connectivity rule): a classic block has doors on both floors (A, 32.0 m; B, 12.8 m) and a way
// between them, but a room may have only one floor's doors. So a swap is kept only if, afterwards, every block that could
// be reached from the start still can be and the room itself can (`reachable`, over the doors the two sides share). A
// room that would cut the dungeon is passed over for the next room of its pool (all of them are tried, in an order the
// same hash fixes), and for none if none fits.
// WHY IT IS SAFE FOR QUESTS: every room carries foe, loot, quest and quest-item markers like a classic block, and now
// none is laid where the start cannot reach it.
import { hash32 } from './spawnedDungeons.js';
import { RDB_RESOURCE_TYPES } from '../formats/blocksFile.js';
import { rdbObjects } from './rdbLayout.js';

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

const EDGES = Object.freeze({ N: [0, -1, 'S'], S: [0, 1, 'N'], W: [-1, 0, 'E'], E: [1, 0, 'W'] });
const FLOOR_OF_Y = Object.freeze({ '-1280': 'A', '-1279': 'A', '-512': 'B' });   // a classic edge door's raw y: floors 32.0 m and 12.8 m

/**
 * The ways out a CLASSIC block has on its edges, as a Set of 'N:A' ... 'E:B' (edge : floor). A classic block puts its door
 * models on its north and west edges only (the block beyond supplies the other side), so doors alone miss the south and
 * east ports; the stub of corridor that reaches an edge is what shows one. So a port is a model of the block standing
 * within 400 raw units of the edge, within 130 of the port's line (640 for A, 1408 for B), at that floor's height (raw
 * y -1280 or -512). Measured against the real floors of all 187 classic blocks (tools/aiRoom/connect.mjs): 95% of the
 * 1,496 edge-and-floor places are told right (48 said open that are not, 27 missed), and the law's before and after
 * both use it, so what it gets wrong is the same on both sides of every test.
 * @param {object} dfBlock BlocksFile's RDB block
 */
export function portsOfBlock(dfBlock) {
  const out = new Set(), rdb = dfBlock?.rdbBlock;
  if (!rdb) return out;
  for (const o of rdbObjects(rdb)) {
    if (o.type !== RDB_RESOURCE_TYPES.Model) continue;
    const floor = FLOOR_OF_Y[String(o.yPos)];
    if (!floor) continue;
    const line = floor === 'A' ? 640 : 1408;
    if (Math.abs(o.xPos - line) <= 130) { if (o.zPos <= 400) out.add(`N:${floor}`); if (o.zPos >= 1648) out.add(`S:${floor}`); }
    if (Math.abs(o.zPos - line) <= 130) { if (o.xPos <= 400) out.add(`W:${floor}`); if (o.xPos >= 1648) out.add(`E:${floor}`); }
  }
  return out;
}

/**
 * The blocks (by 'x,z') reachable from the starting block through shared doors. `portsOf(name)` answers a block's door
 * Set ('N:A' ...) and `joins(name)` whether it joins its two floors (a classic block does; a room only if it has a stair).
 * Walks (place, floor) pairs: both floors of the start, a door onto the neighbour's matching door, a floor change
 * inside a block that joins them.
 */
export function reachable(blocks, portsOf, joins) {
  const at = new Map(blocks.map((b) => [`${b.x},${b.z}`, b])), start = blocks.find((b) => b.isStartingBlock) ?? blocks[0];
  const seen = new Set(), queue = [];
  const push = (b, f) => { const k = `${b.x},${b.z}:${f}`; if (!seen.has(k)) { seen.add(k); queue.push([b, f]); } };
  if (!start) return new Set();
  push(start, 'A'); push(start, 'B');
  while (queue.length) {
    const [b, f] = queue.pop(), ports = portsOf(b.blockName);
    if (joins(b.blockName)) push(b, f === 'A' ? 'B' : 'A');
    for (const [e, [dx, dz, opposite]] of Object.entries(EDGES)) {
      if (!ports.has(`${e}:${f}`)) continue;
      const nb = at.get(`${b.x + dx},${b.z + dz}`);
      if (nb && portsOf(nb.blockName).has(`${opposite}:${f}`)) push(nb, f);
    }
  }
  return new Set([...seen].map((k) => k.split(':')[0]));
}

/**
 * @param {Array<{blockName:string,x:number,z:number,isStartingBlock?:boolean}>} blocks a dungeon's blocks
 * @param {Array<{name:string,kind:'border'|'interior'}>} rooms the AI rooms
 * @param {number} mapId the dungeon's map id (the hash's seed)
 * @param {{ share?: number, portsOf?: (name:string)=>Set<string>, joins?: (name:string)=>boolean }} [opts] with `portsOf` and
 *   `joins` the connectivity rule applies; without them every drawn swap stands (tools and tests only)
 * @returns {{ blocks: Array, swapped: number }} the same blocks (the same array when nothing is swapped)
 */
export function swapAiRooms(blocks, rooms, mapId, { share = AI_ROOM_SHARE, portsOf = null, joins = null } = {}) {
  if (!Array.isArray(blocks) || blocks.length < AI_MIN_BLOCKS || !rooms?.length) return { blocks, swapped: 0 };
  const border = rooms.filter((r) => r.kind === 'border'), interior = rooms.filter((r) => r.kind !== 'border');
  const safe = typeof portsOf === 'function' && typeof joins === 'function';
  let current = blocks, swapped = 0, held = safe ? reachable(blocks, portsOf, joins) : null;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.isStartingBlock || !CLASSIC_NAME.test(b.blockName)) continue;
    const pool = isBorderBlockName(b.blockName) ? border : interior;
    if (!pool.length) continue;
    if (hash32(SALT, mapId >>> 0, b.x | 0, b.z | 0, 1) / 4294967296 >= share) continue;
    if (safe && !held.has(`${b.x},${b.z}`)) continue;   // a block the start cannot reach is not worth a room
    const first = hash32(SALT, mapId >>> 0, b.x | 0, b.z | 0, 2) % pool.length;
    for (let k = 0; k < pool.length; k++) {
      const room = pool[(first + k) % pool.length];
      const next = current.map((c, j) => (j === i ? { ...c, blockName: room.name } : c));
      if (safe) {
        const after = reachable(next, portsOf, joins);
        let ok = after.has(`${b.x},${b.z}`);
        for (const key of held) if (ok && !after.has(key)) ok = false;
        if (!ok) continue;
        held = after;
      }
      current = next; swapped++;
      break;
    }
  }
  return swapped ? { blocks: current, swapped } : { blocks, swapped: 0 };
}
