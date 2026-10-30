// @ts-check
// BUNNY-GUILDS (2026-10-30, the owner: "the new guilds arent blue on the map"): A HALL DRAWN AS A GUILD HALL ON THE
// TOWN'S MAP. Bunnyfall's halls are converted houses (systems/guild/bunnyGuilds.js), and the town map colours a building
// by its block's automap bytes (BuildingType + 1, ui/town/townQuarters.js), which still say house. Here each hall's
// pixels - the run of house bytes about the building's place in its block - are written as Daggerfall's Guild Hall
// byte, on a copy of the block's bytes, so both maps colour it as every guild's hall is coloured.

import { isBunnyHall } from '../../systems/guild/bunnyGuilds.js';
import { RMB_DIMENSION } from '../../formats/blocksFile.js';
import { HOUSE_SET } from './townQuarters.js';

const PX = 64;
/** DFLocation.BuildingTypes.GuildHall (11), as its automap byte. */
export const GUILD_HALL_BYTE = 12;
/** How far from the building's place its pixels are looked for, and the most a hall's run may hold. */
const SEEK = 4, MOST = 900;
const HOUSE = new Set(HOUSE_SET);

/**
 * The town's block rows with each hall's pixels written as a guild hall's. `blocks` as the town map takes them
 * ([{ x, y, autoMap }]), `buildings` the town's building summaries (world/buildingSummaries.js). Answers `blocks` itself
 * when no hall stands.
 * @param {any[]} blocks @param {any[]} buildings @param {number} [scale] the scene's metres per Daggerfall unit
 */
export function withHallBytes(blocks, buildings, scale = 0.025) {
  const halls = (buildings ?? []).filter((b) => isBunnyHall(b) && Array.isArray(b.position));
  if (!halls.length || !blocks?.length) return blocks;
  const copies = new Map();
  const div = RMB_DIMENSION * scale;
  for (const h of halls) {
    const bl = blocks.find((b) => (b.x ?? 0) === (h.blockX ?? 0) && (b.y ?? 0) === (h.blockY ?? 0));
    if (!bl?.autoMap) continue;
    let data = copies.get(bl);
    if (!data) { data = Uint8Array.from(bl.autoMap); copies.set(bl, data); }
    const cx = Math.trunc((h.position[0] / div) * PX), cy = PX - 1 - Math.trunc((h.position[2] / div) * PX);
    // the nearest house pixel to the building's place
    let start = -1, best = Infinity;
    for (let dy = -SEEK; dy <= SEEK; dy++) {
      for (let dx = -SEEK; dx <= SEEK; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= PX || y >= PX || !HOUSE.has(data[y * PX + x])) continue;
        const d = dx * dx + dy * dy;
        if (d < best) { best = d; start = y * PX + x; }
      }
    }
    if (start < 0) continue;
    const byte = data[start];
    const todo = [start];
    let n = 0;
    data[start] = GUILD_HALL_BYTE;
    while (todo.length && n < MOST) {
      const p = /** @type {number} */ (todo.pop());
      n++;
      const x = p % PX, y = (p / PX) | 0;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= PX || ny >= PX) continue;
        const q = ny * PX + nx;
        if (data[q] === byte) { data[q] = GUILD_HALL_BYTE; todo.push(q); }
      }
    }
  }
  return blocks.map((b) => (copies.has(b) ? { ...b, autoMap: copies.get(b) } : b));
}
