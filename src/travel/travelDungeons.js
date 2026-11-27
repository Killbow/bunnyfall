// @ts-check
import { LOCATION_TYPES, getPixelFromPixelID, MAX_MAP_PIXEL_X, MAX_MAP_PIXEL_Y } from '../formats/mapsFile.js';
import { TV_FAR_RANGE } from './travelFarPlaces.js';
import { ARRIVAL_BUFFER } from './travelAutopilot.js';

export const TV_DUNGEON_TYPES = Object.freeze(new Set([LOCATION_TYPES.DungeonLabyrinth, LOCATION_TYPES.DungeonKeep,
  LOCATION_TYPES.DungeonRuin, LOCATION_TYPES.Graveyard, LOCATION_TYPES.Coven]));
export const TV_DUNGEON_MAX = 12;
export const TV_DUNGEON_FIND_M = 1000;
export const NATIVE_PER_M = 32768 / 819.2;

export const dungeonFoundText = (name) => `You have found ${name}.`;

/** @param {Map<number, any>} mapDict */
export function dungeonRows(mapDict) {
  const out = [];
  for (const row of mapDict?.values() ?? []) {
    if (!row || !TV_DUNGEON_TYPES.has(row.locationType)) continue;
    const p = getPixelFromPixelID(row.id);
    out.push({ x: p.x, y: p.y, row });
  }
  return out;
}

/** @param {Map<string, any>} index */
export function spawnedPixels(index) {
  const out = [];
  for (const [key, loc] of index ?? []) {
    if (!loc?.spawned) continue;
    const c = key.indexOf(',');
    out.push({ x: Number(key.slice(0, c)), y: Number(key.slice(c + 1)), loc });
  }
  return out;
}

/** @param {{ at: {x:number,y:number}, dungeons: Array<{x:number,y:number,row:any}>, locAt: (x:number, y:number) => any, isFound: (x:number, y:number) => boolean, spawns?: Array<{x:number,y:number,loc:any}>, spawnKnown?: (s:any) => boolean, spawnFound?: (s:any) => boolean, spawnGone?: (s:any) => boolean, grid?: number, range?: number, max?: number }} q */
export function nearDungeons({ at, dungeons, locAt, isFound, spawns = [], spawnKnown = () => false, spawnFound = () => false,
  spawnGone = () => false, grid = -1, range = TV_FAR_RANGE, max = TV_DUNGEON_MAX }) {
  const out = [];
  for (const g of dungeons ?? []) {
    const d = Math.hypot(g.x - at.x, g.y - at.y);
    if (d > range) continue;
    const loc = locAt(g.x, g.y);
    if (!loc?.name || loc.spawned) continue;
    const found = !!isFound(g.x, g.y);
    if (found && Math.max(Math.abs(g.x - at.x), Math.abs(g.y - at.y)) <= grid) continue;
    out.push({ key: `dng:${g.row.mapID}`, x: g.x, y: g.y, loc, row: g.row, d, found, spawn: false });
  }
  for (const s of spawns ?? []) {
    const d = Math.hypot(s.x - at.x, s.y - at.y);
    if (d > range || !s.loc?.name || !spawnKnown(s)) continue;
    if (spawnGone(s)) continue;
    out.push({ key: `spawn:${s.loc.mapTableData?.mapId}`, x: s.x, y: s.y, loc: s.loc, row: null, d, found: !!spawnFound(s), spawn: true });
  }
  const nearer = (a, b) => a.d - b.d || a.x - b.x || a.y - b.y;
  const inGrid = (g) => !g.found && Math.max(Math.abs(g.x - at.x), Math.abs(g.y - at.y)) <= grid;
  const rest = out.filter((g) => !inGrid(g));
  rest.sort((a, b) => (b.found ? 1 : 0) - (a.found ? 1 : 0) || nearer(a, b));
  return [...out.filter(inGrid), ...rest.slice(0, max)].sort(nearer);
}

/**
 * The index holds a spawn only after its pixel builds, so found spawns past the streamed pixels are rebuilt from
 * their roll. `stand` must be side-effect free.
 * @param {{ at: {x:number,y:number}, rolls: (x:number, y:number) => boolean, filed: (x:number, y:number) => boolean, indexed: (x:number, y:number) => boolean, stand: (x:number, y:number) => any, range?: number }} q
 */
export function filedSpawns({ at, rolls, filed, indexed, stand, range = TV_FAR_RANGE }) {
  const out = [], r = Math.floor(range);
  for (let y = Math.max(0, at.y - r); y <= Math.min(MAX_MAP_PIXEL_Y - 1, at.y + r); y++) {
    for (let x = Math.max(0, at.x - r); x <= Math.min(MAX_MAP_PIXEL_X - 1, at.x + r); x++) {
      if (Math.hypot(x - at.x, y - at.y) > range || !rolls(x, y) || !filed(x, y) || indexed(x, y)) continue;
      const loc = stand(x, y);
      if (loc) out.push({ x, y, loc });
    }
  }
  return out;
}

/**
 * The walk to a spawn door faces this point, so a route that comes round from the far side does not cross the
 * exterior walls.
 * @param {Array<{x:number, y:number, at?:{x:number,z:number}}>} legs
 * @param {{x:number, z:number}} feet
 * @param {(leg: {x:number,y:number}) => number[]} centre
 */
export function lastLegStart(legs, feet, centre) {
  const prev = legs?.length > 1 ? legs[legs.length - 2] : null;
  if (!prev) return { x: feet.x, z: feet.z };
  if (prev.at) return { x: prev.at.x, z: prev.at.z };
  const [x, z] = centre(prev);
  return { x, z };
}

/**
 * @param {{minX:number, maxX:number, minZ:number, maxZ:number}} rect
 * @param {{x:number, z:number}} feet
 */
export function dungeonApproach(rect, feet, grow = ARRIVAL_BUFFER, within = null) {
  const x = Math.min(Math.max(feet.x, rect.minX - grow), rect.maxX + grow);
  const z = Math.min(Math.max(feet.z, rect.minZ - grow), rect.maxZ + grow);
  if (!within) return { x, z };
  // Clamped inside the pixel, because a spot arrival is tested only inside its own pixel.
  return { x: Math.min(Math.max(x, within.minX), within.maxX), z: Math.min(Math.max(z, within.minZ), within.maxZ) };
}
export function pixelBox(px, py, inset = 256) {
  const x0 = px * 32768, z0 = (499 - py) * 32768;
  return { minX: x0 + inset, maxX: x0 + 32768 - inset, minZ: z0 + inset, maxZ: z0 + 32768 - inset };
}

/**
 * Spawns are skipped because the spawned dungeon feature announces its own on pixel entry.
 * @param {{ feet: {x:number,z:number}, list: Array<any>, mid: (g:any) => ({x:number,z:number}|null) }} q
 */
export function dungeonToFind({ feet, list, mid }) {
  let best = null, bestD = TV_DUNGEON_FIND_M * NATIVE_PER_M;
  for (const g of list ?? []) {
    if (g.found || g.spawn) continue;
    const m = mid(g);
    if (!m) continue;
    const d = Math.hypot(m.x - feet.x, m.z - feet.z);
    if (d <= bestD) { best = g; bestD = d; }
  }
  return best;
}
