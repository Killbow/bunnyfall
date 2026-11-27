// @ts-check

import { lootRarityOn, DUNGEON_FAMILY, FAMILY_IDS } from './lootRarity.js';
import { hasDiscoveredLocationId, discoverLocation } from '../maps/discovery.js';
import { shardsHeld, spendShards } from './reforge.js';
import { totalGoldAmount, deductGold } from '../justice/court.js';
import { cromwarkSettlementRemoved } from '../world/wild/cromwarkSettlements.js';
import { longitudeLatitudeToMapPixel } from '../formats/mapsFile.js';

export const SCRY_PRICE = Object.freeze({ shards: 3, gold: 500 });
export const familyKinds = (/** @type {string} */ family) => DUNGEON_FAMILY.flatMap((f, i) => (f === family ? [i] : []));
export const SCRY_FAMILIES = Object.freeze(FAMILY_IDS.filter((f) => familyKinds(f).length > 0));
export const SCRY_FAMILY_WORDS = Object.freeze({
  undead: 'The undead', daedra: 'The daedra', dragon: 'The dragons', beast: 'The beasts of the wild',
  brute: 'Orcs and giants', caster: 'Mages and witches', rogue: 'Thieves and assassins', warrior: 'Warriors and knights',
});
export const DUNGEON_KIND_WORDS = Object.freeze(['crypts', 'orc strongholds', 'human strongholds', 'prisons', 'desecrated temples',
  'mines', 'natural caves', 'covens', 'vampire haunts', 'laboratories', 'harpy nests', 'ruined castles', 'spider nests',
  'giant strongholds', 'dragon\'s dens', 'barbarian strongholds', 'volcanic caves', 'scorpion nests', 'cemeteries']);
export function familyPlaces(/** @type {string} */ family) {
  const w = familyKinds(family).map((k) => DUNGEON_KIND_WORDS[k]);
  return w.length > 1 ? `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}` : (w[0] ?? '');
}

/** @param {any} region */
export function scryRows(region) {
  if (!region || !Array.isArray(region.mapTable)) return [];
  return region.mapTable.map((row, i) => ({
    mapId: row.mapId, discovered: !!row.discovered, dungeonType: row.dungeonType,
    name: region.mapNames?.[i] ?? '', regionName: region.name ?? '',
    ...longitudeLatitudeToMapPixel(row.longitude, row.latitude),
  })).filter((row) => !cromwarkSettlementRemoved(row.mapId));
}
// As in classic random discovery, skip rows with the baked Discovered flag or in the player's discovery store.
export function nearestHidden(rows, /** @type {string} */ family, at) {
  const kinds = familyKinds(family);
  let best = null, bestD = Infinity;
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!kinds.includes(r?.dungeonType) || r.discovered || hasDiscoveredLocationId(r.mapId)) continue;
    const d = (r.x - at.x) ** 2 + (r.y - at.y) ** 2;
    if (d < bestD || (d === bestD && r.mapId < best.mapId)) { best = r; bestD = d; }
  }
  return best;
}
export function scryRefusal(player, /** @type {string} */ family, where) {
  if (!lootRarityOn()) return 'off';
  if (!SCRY_FAMILIES.includes(family)) return 'family';
  if (!where?.at || !Array.isArray(where.rows) || !where.rows.length) return 'nowhere';
  if (!nearestHidden(where.rows, family, where.at)) return 'none';
  if (shardsHeld(player?.items) < SCRY_PRICE.shards) return 'shards';
  if (totalGoldAmount(player) < SCRY_PRICE.gold) return 'gold';
  return null;
}
export function scryPlace(player, /** @type {string} */ family, where) {
  const why = scryRefusal(player, family, where);
  if (why) return { ok: false, reason: why };
  const place = nearestHidden(where.rows, family, where.at);
  spendShards(player.items, SCRY_PRICE.shards);
  deductGold(player, SCRY_PRICE.gold);
  discoverLocation(place.mapId, { regionName: place.regionName, locationName: place.name });
  return { ok: true, place };
}
