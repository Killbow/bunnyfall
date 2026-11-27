// @ts-check
import { LOCATION_TYPES } from '../formats/mapsFile.js';

export const TV_FAR_RANGE = 24;
export const TV_FAR_MAX = 10;
export const PIXEL_KM = 0.8192;
export const TV_FAR_TYPES = Object.freeze(new Set([LOCATION_TYPES.TownCity, LOCATION_TYPES.TownHamlet, LOCATION_TYPES.TownVillage]));

export function farDistanceText(km) {
  if (!Number.isFinite(km) || km < 0) return '';
  return km < 10 ? `${(Math.round(km * 10) / 10).toFixed(1)} km` : `${Math.round(km)} km`;
}

/** @param {Map<string, any>} index */
export function settlementPixels(index) {
  const out = [];
  for (const [key, loc] of index ?? []) {
    if (!loc?.name || !TV_FAR_TYPES.has(loc.mapTableData?.locationType)) continue;
    const c = key.indexOf(',');
    out.push({ x: Number(key.slice(0, c)), y: Number(key.slice(c + 1)), loc });
  }
  return out;
}

/** @param {{ at: {x:number,y:number}, near: number, settlements: Array<{x:number,y:number}>, summaryOf: (x:number, y:number) => any, range?: number, max?: number }} q */
export function farPlaces({ at, near, settlements, summaryOf, range = TV_FAR_RANGE, max = TV_FAR_MAX }) {
  const found = [];
  for (const s of settlements ?? []) {
    const dx = s.x - at.x, dy = s.y - at.y;
    const cheb = Math.max(Math.abs(dx), Math.abs(dy));
    if (cheb <= near || Math.hypot(dx, dy) > range) continue;
    const summary = summaryOf(s.x, s.y);
    if (!summary) continue;
    found.push({ key: `far:${summary.mapId}`, summary, x: s.x, y: s.y, d: Math.hypot(dx, dy) });
  }
  found.sort((a, b) => a.d - b.d || a.key.localeCompare(b.key));
  return found.slice(0, max);
}
