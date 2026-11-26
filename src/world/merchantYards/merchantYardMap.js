// @ts-check
// Copies the automap bytes of any block a yard touches and never writes in place, because the block bytes also feed
// the navgrid and the next build.
import { NAV_CELL, NAV_CELLS_PER_BLOCK } from '../cityNavigation.js';
import { BUILDING_TYPES } from '../buildingNames.js';
import { yardName, validYardKind } from './merchantYards.js';
import { validPortSite, portPlaceName } from '../../travel/portPlaces.js';

export const YARD_MAP_TYPE = BUILDING_TYPES.GeneralStore;
// An automap byte is the building type plus 1.
export const YARD_MAP_BYTE = YARD_MAP_TYPE + 1;
export const PORT_MAP_TYPE = Object.freeze({ shipyard: BUILDING_TYPES.GeneralStore, lighthouse: BUILDING_TYPES.House2 });
export const YARD_MAP_BLOCK_M = NAV_CELLS_PER_BLOCK * NAV_CELL;

/**
 * Automap rows run against +z, as the navgrid rows do.
 * @param {Array<any>} rows
 * @param {Array<any>|null|undefined} sites
 */
export function yardTownBlocks(rows, sites) {
  if (!Array.isArray(rows) || !sites?.length) return rows;
  const N = NAV_CELLS_PER_BLOCK;
  const out = rows.map((r) => ({ ...r }));
  const copied = new Set();
  const rowAt = (bx, by) => out.find((r) => r.x === bx && r.y === by) ?? null;
  for (const s of sites) {
    const kind = validYardKind(s?.kind) ?? validPortSite(s?.kind);
    if (!kind) continue;
    const type = /** @type {Record<string, number>} */ (PORT_MAP_TYPE)[kind] ?? YARD_MAP_TYPE, byte = type + 1;
    for (let cy = s.gy; cy < s.gy + s.nz; cy++) {
      for (let cx = s.gx; cx < s.gx + s.nx; cx++) {
        const bx = Math.floor(cx / N), by = Math.floor(cy / N);
        const r = rowAt(bx, by);
        if (!r?.autoMap?.length) continue;
        if (!copied.has(r)) { r.autoMap = r.autoMap.slice(); copied.add(r); }
        r.autoMap[(N - 1 - (cy - by * N)) * N + (cx - bx * N)] = byte;
      }
    }
    const bx = Math.floor(s.x / YARD_MAP_BLOCK_M), by = Math.floor(s.z / YARD_MAP_BLOCK_M);
    const r = rowAt(bx, by);
    if (!r) continue;
    const name = validYardKind(kind) ? yardName(kind, s.keeper?.name) : (typeof s.name === 'string' && s.name) || portPlaceName(kind);
    r.places = [...(r.places ?? []), { name, position: [s.x - bx * YARD_MAP_BLOCK_M, 0, s.z - by * YARD_MAP_BLOCK_M], buildingType: type, yard: kind }];
  }
  return out;
}
