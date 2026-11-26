// @ts-check
// BUNNYFALL (2026-11-26, caverns): WHERE A SAVE TAKEN IN A MINE LANDS. A mine is a made level, so its location has no
// map-table longitude or latitude: the dungeon envelope's pixel was the world's corner (0,499), an ocean, and a load put
// the character there. The envelope now names the mine's own pixel (`dungeonHomeOf`), and a load reads a mine save, or any
// save already stranded at the corner, as "land at this pixel, outside" (`savedLanding`): a mine's mouth, or the start cell.
import { MINE_SALT } from '../net/mine/mineSites.js';

/** The made location's id every mine shares (world/mine/mineLocation.js MINE_LOCATION_ID, kept equal by the test). */
export const MINE_LOCATION_KEY = 'dungeon:2147480832';
/** The corner pixel a mine's missing longitude and latitude read as. */
export const CORNER_PIXEL = Object.freeze({ x: 0, y: 499 });
const MAP_W = 1000, MAP_H = 500;

/** The words a landing says. */
export const LANDING_TEXT = Object.freeze({
  mine: 'You fell asleep in the mine and wake at its mouth. Someone carried you out while you were away.',
  'lost-mine': 'The mine you saved in could not be found, so you wake at the start of the realm.',
  stranded: 'Your last position was lost in the far corner of the sea, so you wake at the start of the realm.',
});

const pixelOk = (/** @type {any} */ p) => !!p && Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.x < MAP_W && p.y >= 0 && p.y < MAP_H;
const isCorner = (/** @type {any} */ p) => !pixelOk(p) || (p.x === CORNER_PIXEL.x && p.y === CORNER_PIXEL.y);

/** A mine's pixel from its map id (net/mine/mineSites.js mineMapId: the salt over `py * 1000 + px`), or null. */
export function mineSiteOfMapId(/** @type {unknown} */ mapId) {
  if (!Number.isSafeInteger(mapId) || /** @type {number} */ (mapId) < 0) return null;
  const n = /** @type {number} */ (mapId) >>> 0;
  if (n >>> 20 !== MINE_SALT) return null;
  const id = n & 0xfffff, p = { x: id % 1000, y: Math.floor(id / 1000) };
  return pixelOk(p) ? p : null;
}

/** The dungeon envelope's `dungeon` half for a location: a mine names its own pixel, any other its map-table longitude and latitude. */
export function dungeonHomeOf(/** @type {any} */ loc, /** @type {(lon: number, lat: number) => { x: number, y: number }} */ toPixel) {
  const m = loc?.mine;
  if (m && pixelOk({ x: m.px, y: m.py })) return { pixel: { x: m.px, y: m.py }, mapId: loc.mapTableData?.mapId ?? null, mine: true };
  const mt = loc?.mapTableData;
  if (!mt || !Number.isFinite(mt.longitude) || !Number.isFinite(mt.latitude)) return null;
  const p = toPixel(mt.longitude, mt.latitude);
  return { pixel: { x: p.x, y: p.y }, mapId: mt.mapId ?? null };
}

/**
 * Whether a loaded envelope lands outside at a pixel of its own choosing instead of where it stood.
 * @param {any} extras the loaded envelope (`locationKey`, `dungeon`, `world`)
 * @param {{ startCell: { x: number, y: number } }} o
 * @returns {{ pixel: { x: number, y: number }, why: 'mine' | 'lost-mine' | 'stranded' } | null}
 */
export function savedLanding(extras, { startCell }) {
  const key = String(extras?.locationKey ?? '');
  const d = extras?.dungeon;
  const site = mineSiteOfMapId(d?.mapId);
  if (key === MINE_LOCATION_KEY || (key.startsWith('dungeon:') && site)) {
    if (site) return { pixel: site, why: 'mine' };
    return { pixel: { x: startCell.x, y: startCell.y }, why: 'lost-mine' };
  }
  if (key.startsWith('dungeon:') && d?.pixel && isCorner(d.pixel)) return { pixel: { x: startCell.x, y: startCell.y }, why: 'stranded' };
  const w = extras?.world;
  if (key === 'world' && w && (isCorner(w.pixel) || !Number.isFinite(w.nativeX) || !Number.isFinite(w.nativeZ))) return { pixel: { x: startCell.x, y: startCell.y }, why: 'stranded' };
  return null;
}
