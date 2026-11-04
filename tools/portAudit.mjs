// PORT-AUDIT (2026-11-04, the owner: "Audit settlements designated as ports and give each a plausible water connection,
// either a coastline or a river leading to the ocean"): EVERY SETTLEMENT THE GAME CALLS A PORT, AND WHAT WATER IT STANDS BY.
// A port by its own data (systems/portPlaces.js portTownByData - Travel Options' list or Daggerfall's PortTownAndUnknown
// byte) is read against the map's open sea (world/portSites.js openSeaOf, the flood of the water that reaches the map's
// border) with the coast law's own test (net/fortLaw.js seaBears): ON THE COAST (the open sea within SEA_RING), or INLAND
// - with how far the nearest open sea and the nearest water of any kind are, in map pixels.
//
// Writes nothing to the tree. Usage: ARENA2_PATH=/path/to/arena2 node tools/portAudit.mjs [--json] [--carved]
// (--carved reads the map with world/portChannelData.js's channels laid: the check that each carved port now stands on the sea.)
import { readFileSync } from 'node:fs';
import { isMain } from './lib/isMain.mjs';
import { MapsFile, longitudeLatitudeToMapPixel } from '../src/formats/mapsFile.js';
import { WoodsFile, MAP_WIDTH, MAP_HEIGHT } from '../src/formats/woodsFile.js';
import { isWaterPixel } from '../src/ui/overworldModel.js';
import { openSeaOf, portTownOnSea } from '../src/world/portSites.js';
import { portTownByData, isPortTownType } from '../src/systems/portPlaces.js';
import { hasPort } from '../src/systems/travel/travelPorts.js';
import { LOCATION_TYPES } from '../src/formats/mapsFile.js';

const TYPE_NAME = Object.fromEntries(Object.entries(LOCATION_TYPES).map(([k, v]) => [v, k]));

/** The nearest pixel (Euclidean, to `limit`) for which `test` holds, or null. */
export function nearest(px, py, test, limit = 80) {
  let best = null;
  for (let dy = -limit; dy <= limit; dy++) {
    for (let dx = -limit; dx <= limit; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > limit || (best && d >= best.d)) continue;
      const x = px + dx, y = py + dy;
      if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) continue;
      if (test(x, y)) best = { x, y, d };
    }
  }
  return best;
}

export function auditPorts(maps, woods) {
  const seaPixel = (x, y) => isWaterPixel(maps.getClimateIndex(x, y), woods.getHeightMapValue(x, y));
  const sea = openSeaOf(seaPixel, MAP_WIDTH, MAP_HEIGHT);
  const openSea = (x, y) => x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT && sea[y * MAP_WIDTH + x] === 1;
  const rows = [];
  for (let r = 0; r < maps.regionCount; r++) {
    const region = maps.getRegion(r);
    if (!region) continue;
    const base = maps.baseLocationCount(r);
    for (let l = 0; l < Math.min(base, region.locationCount); l++) {
      const loc = maps.getLocation(r, l);
      const t = loc?.mapTableData;
      if (!t || !isPortTownType(t.locationType) || !portTownByData(loc, hasPort)) continue;
      const p = longitudeLatitudeToMapPixel(t.longitude, t.latitude);
      const coast = portTownOnSea(loc, hasPort, openSea);
      const row = { region: maps.getRegionName(r), name: loc.name, type: TYPE_NAME[t.locationType], mapId: t.mapId, px: p.x, py: p.y, coast, byte: loc.exterior?.exteriorData?.portTownAndUnknown ?? 0, travelOptions: hasPort(t.mapId) };
      if (!coast) {
        row.nearestSea = nearest(p.x, p.y, openSea);
        row.nearestWater = nearest(p.x, p.y, seaPixel);
      }
      rows.push(row);
    }
  }
  return rows;
}

if (isMain(import.meta.url)) {
  const A2 = process.env.ARENA2_PATH;
  if (!A2) { console.error('ARENA2_PATH is not set - point it at your own arena2 folder.'); process.exit(2); }
  const bytes = (n) => new Uint8Array(readFileSync(`${A2}/${n}`));
  const maps = new MapsFile(); maps.load(bytes('MAPS.BSA'), bytes('CLIMATE.PAK'), bytes('POLITIC.PAK'));
  WoodsFile.portChannels = process.argv.includes('--carved');   // the map as the game made it, unless asked to read it with the channels laid
  const woods = new WoodsFile(); if (!woods.load(bytes('WOODS.WLD'))) throw new Error('WOODS.WLD failed to load');
  const rows = auditPorts(maps, woods);
  if (process.argv.includes('--json')) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }
  const f = (n) => (n ? `${n.d.toFixed(1)}px` : 'none<80');
  for (const x of rows) console.log(`${x.coast ? 'COAST ' : 'INLAND'} ${x.region.padEnd(18)} ${x.name.padEnd(26)} ${String(x.type).padEnd(11)} byte=0x${x.byte.toString(16).padStart(2, '0')} TO=${x.travelOptions ? 'y' : 'n'}${x.coast ? '' : `  sea ${f(x.nearestSea)}  water ${f(x.nearestWater)}`}`);
  const inland = rows.filter((x) => !x.coast);
  console.log(`\n${rows.length} port settlements; ${rows.length - inland.length} on the coast; ${inland.length} inland`);
}
