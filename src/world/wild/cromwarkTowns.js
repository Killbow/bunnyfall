// @ts-check
import { wildMaskOf, wildInside } from '../wildZone.js';
import { CROMWARK_ON } from './cromwark.js';
import { t } from '../../ui/textManager.js';

let _maps = null;
export const setCromwarkMaps = (/** @type {any} */ maps) => { _maps = maps ?? null; };
export const cromwarkDesolateAt = (/** @type {any} */ maps, /** @type {number} */ px, /** @type {number} */ py) =>
  CROMWARK_ON && Number.isFinite(px) && Number.isFinite(py) && wildInside(wildMaskOf(maps ?? _maps), px, py);

export function locationPixel(/** @type {any} */ dfLocation) {
  const m = dfLocation?.mapTableData;
  if (!m || !Number.isFinite(m.longitude) || !Number.isFinite(m.latitude)) return null;
  return { x: Math.trunc(m.longitude / 128), y: 499 - Math.trunc(m.latitude / 128) };
}
export function cromwarkDesolateLocation(/** @type {any} */ maps, /** @type {any} */ dfLocation) {
  const p = locationPixel(dfLocation);
  return !!p && cromwarkDesolateAt(maps, p.x, p.y);
}

export function cromwarkDoor(/** @type {any} */ maps, /** @type {any} */ dfLocation, /** @type {number} */ blockIndex, /** @type {number} */ recordIndex) {
  if (!cromwarkDesolateLocation(maps, dfLocation)) return null;
  let h = 0x811c9dc5;
  for (const v of [dfLocation?.mapTableData?.mapId ?? 0, blockIndex | 0, recordIndex | 0]) { h ^= v >>> 0; h = Math.imul(h, 0x01000193) >>> 0; h ^= h >>> 13; }
  return (h & 1) ? 'boarded' : 'looted';
}

export const cromwarkTownText = (/** @type {'boarded' | 'looted'} */ k) => (k === 'boarded'
  ? t('cromwark.door.boarded', 'The door is boarded up. Nobody has lived here since Cromwark fell.')
  : t('cromwark.door.looted', 'The house is open. Almost everything here was taken long ago.'));

export function cromwarkLooted(/** @type {any} */ bd) {
  const region = bd?.townMapId != null ? _maps?.getRegion?.(bd.regionIndex ?? -1) : null;
  const i = region?.mapIdLookup?.get(bd.townMapId);
  return i != null && cromwarkDesolateLocation(null, { mapTableData: region.mapTable[i] });
}
export const CROMWARK_SCRAP_ODDS = 12;
export function cromwarkLeftovers(/** @type {any[]} */ items, /** @type {any} */ bd, /** @type {string} */ key, /** @type {number} */ day) {
  if (!cromwarkLooted(bd)) return items;
  let h = 0x811c9dc5;
  for (const c of `${bd.townMapId}:${bd.buildingKey}:${key}:${day}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
  const worth = (/** @type {any} */ it) => (it.value ?? 0) * (it.stackCount ?? 1);
  return !items?.length || h % CROMWARK_SCRAP_ODDS ? [] : [items.reduce((a, b) => (worth(b) < worth(a) ? b : a))];
}
