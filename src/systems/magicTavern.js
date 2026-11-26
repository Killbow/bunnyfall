// @ts-check
// Every client picks the same magical tavern from Daggerfall data alone, so the pick never goes over the wire.
// `MAGIC_ROOM` uses a map id and building key that no real town owns, so players from every town share one relay
// room.

import { contentOn } from '../mods/contentOff.js';

export const magicTavernsOn = () => contentOn('magicTaverns');

export const MAGIC_ROOM = Object.freeze({ mapId: 4_000_000_007, buildingKey: 77_000_001 });

export const MAGIC_HALL_BLOCKS = /^TVRN/i;

export const MAGIC_KEEPER = Object.freeze({ name: 'Nyx', art: 'nyx' });

/** @param {number} n */
export function mixMapId(n) {
  let h = (n >>> 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * @param {number} mapId
 * @param {number[]} tavernKeys
 * @returns {number | null}
 */
export function magicTavernKeyOf(mapId, tavernKeys) {
  const keys = [...new Set(tavernKeys.filter((k) => Number.isSafeInteger(k)))].sort((a, b) => a - b);
  if (keys.length < 2 || !Number.isFinite(mapId) || mapId <= 0) return null;
  return keys[mixMapId(mapId) % keys.length];
}
