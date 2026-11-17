import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chooseCromwarkSettlements, CIVILIAN_TYPES, CROMWARK_HAMLET_ID, settlementInventory } from './cromwarkSettlementPlan.mjs';
import { CROMWARK_REMOVED_SETTLEMENT_IDS, cromwarkSettlementRemoved, filterCromwarkSettlementLookups } from '../src/systems/wild/cromwarkSettlements.js';
import { MapsFile } from '../src/formats/mapsFile.js';
import { buildMapDict, hasLocation } from '../src/systems/map/mapDirectory.js';
import { settlementsOf } from '../src/world/roadsProducer.js';
import { scryRows } from '../src/systems/loot/lootScry.js';
import { nearestSafeLocation } from '../src/systems/deathRespawn.js';
import { nearestTown, townAt } from '../src/systems/legacy/places.js';

test('selection keeps one third of each civilian kind and never removes outside locations or dungeons', () => {
  const rows = [...CIVILIAN_TYPES].flatMap((type) => Array.from({ length: 12 }, (_, i) => ({
    mapId: type * 100 + i, type, x: i % 4, y: Math.floor(i / 4), inside: true,
  })));
  rows.push({ mapId: 99991, type: 0, inside: false }, { mapId: 99992, type: 4, inside: true });
  const plan = chooseCromwarkSettlements(rows);
  assert.equal(plan.kept.length, CIVILIAN_TYPES.size * 4);
  assert.equal(plan.removed.length, CIVILIAN_TYPES.size * 8);
  assert.equal(plan.removed.some((l) => l.mapId >= 99991), false);
  assert.deepEqual(plan.kept.map((l) => l.mapId).sort(), chooseCromwarkSettlements([...rows].reverse()).kept.map((l) => l.mapId).sort());
});

test('Cromwark Hamlet stays and spatial selection reaches distant corners', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ mapId: i ? i : CROMWARK_HAMLET_ID, type: 0, x: i * 10, y: 0, inside: true }));
  const plan = chooseCromwarkSettlements(rows);
  assert.ok(plan.kept.some((l) => l.mapId === CROMWARK_HAMLET_ID));
  assert.ok(plan.kept.some((l) => l.x === 110));
  assert.ok(plan.kept.some((l) => l.x >= 40 && l.x <= 70));
});

test('name pruning preserves archive indices and a retained duplicate name', () => {
  const gone = CROMWARK_REMOVED_SETTLEMENT_IDS[0];
  const region = { locationCount: 2, mapNames: ['Same name', 'Same name'],
    mapTable: [{ mapId: gone }, { mapId: CROMWARK_HAMLET_ID }],
    mapNameLookup: new Map([['Same name', 0]]), mapIdLookup: new Map([[gone, 0], [CROMWARK_HAMLET_ID, 1]]) };
  filterCromwarkSettlementLookups(region);
  assert.equal(region.locationCount, 2); assert.equal(region.mapTable.length, 2);
  assert.equal(region.mapNameLookup.get('Same name'), 1);
  assert.equal(region.mapIdLookup.has(gone), false);
  filterCromwarkSettlementLookups(region); assert.equal(region.mapNameLookup.get('Same name'), 1);
  region.mapNames.push('Added town'); region.mapTable.push({ mapId: 99999 }); region.locationCount++;
  filterCromwarkSettlementLookups(region); assert.equal(region.mapNameLookup.get('Added town'), 2);
});

test('the map directory omits removed destinations even though raw archive rows remain', () => {
  const gone = CROMWARK_REMOVED_SETTLEMENT_IDS[0], live = CROMWARK_HAMLET_ID;
  const rows = [{ mapId: gone, locationType: 0 }, { mapId: live, locationType: 0 }];
  const dict = buildMapDict({ regionCount: 1, getRegion: () => ({ locationCount: rows.length, mapTable: rows }) });
  assert.equal(dict.has(gone & 0xfffff), false); assert.equal(dict.has(live & 0xfffff), true);
});

test('road destinations and scrying keep correct names after pruning; respawn chooses a surviving site', () => {
  const gone = CROMWARK_REMOVED_SETTLEMENT_IDS[0];
  const region = { name: 'Wrothgarian Mountains', locationCount: 2, mapNames: ['Vanished town', 'Retained town'],
    mapTable: [{ mapId: gone, locationType: 0, longitude: 128, latitude: 498 * 128 },
      { mapId: 123456, locationType: 0, longitude: 20 * 128, latitude: 498 * 128 }] };
  const roads = settlementsOf({ regionCount: 1, getRegion: () => region });
  assert.equal(roads.length, 1); assert.equal(roads[0].name, 'Retained town'); assert.equal(roads[0].x, 20);
  const scry = scryRows(region); assert.equal(scry.length, 1); assert.equal(scry[0].name, 'Retained town');
  assert.equal(nearestSafeLocation(region.mapTable, { x: 0, y: 1 }).locationIndex, 1);
  assert.equal(nearestTown(region, region.name, { x: 0, y: 1 }).loc, 'Retained town');
  assert.equal(townAt(region, region.name, { x: 1, y: 1 }), null);
});

test('real ARENA2: the manifest, visible map and world loaders agree; all other locations survive', { skip: !process.env.ARENA2_PATH }, () => {
  const maps = new MapsFile();
  maps.load(...['MAPS.BSA', 'CLIMATE.PAK', 'POLITIC.PAK'].map((n) => new Uint8Array(readFileSync(resolve(process.env.ARENA2_PATH, n)))));
  const inventory = settlementInventory(maps), plan = chooseCromwarkSettlements(inventory), dict = buildMapDict(maps);
  assert.equal(plan.kept.length, 101); assert.equal(plan.removed.length, 203);
  assert.deepEqual([...CROMWARK_REMOVED_SETTLEMENT_IDS].sort((a, b) => a - b), plan.removed.map((l) => l.mapId).sort((a, b) => a - b));
  const retained = inventory.filter((l) => !cromwarkSettlementRemoved(l.mapId));
  const roadNodes = new Set(settlementsOf(maps).map((l) => `${l.x},${l.y}`));
  for (const l of plan.removed) {
    assert.equal(maps.getLocation(l.region, l.index), null, l.name);
    assert.equal(hasLocation(dict, l.x, l.y), false, l.name);
    assert.equal(maps.readLocationIdFast(l.region, l.index), 0, l.name);
    assert.equal(maps.getRegion(l.region).mapIdLookup.has(l.mapId), false);
    assert.equal(roadNodes.has(`${l.x},${l.y}`), false, l.name);
  }
  for (const l of retained) {
    assert.ok(maps.getLocation(l.region, l.index)?.loaded, l.name);
    assert.equal(hasLocation(dict, l.x, l.y), true, l.name);
  }
  assert.equal(inventory.filter((l) => l.inside && !CIVILIAN_TYPES.has(l.type)).length, 178);
  assert.ok(maps.getLocationByName('Wrothgarian Mountains', 'Cromwark Hamlet')?.loaded);
  // Cache eviction and reloading cannot resurrect suppressed names or models.
  maps.discardRegion(16);
  for (const l of plan.removed) assert.equal(maps.getLocation(l.region, l.index), null);
});
