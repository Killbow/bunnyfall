// Lists every port settlement and whether it is on the open sea coast, with the distance to sea and to any water.
// Run: ARENA2_PATH=/path/to/arena2 node tools/portAudit.mjs [--json] [--carved] (--carved lays the channels first).

import { readFileSync } from 'node:fs';
import { isMain } from './lib/isMain.mjs';
import { MapsFile, longitudeLatitudeToMapPixel } from '../src/formats/mapsFile.js';
import { WoodsFile, MAP_WIDTH, MAP_HEIGHT } from '../src/formats/woodsFile.js';
import { isWaterPixel } from '../src/ui/overworldModel.js';
import { openSeaOf, portTownOnSea } from '../src/world/portSites.js';
import { portTownByData, isPortTownType } from '../src/travel/portPlaces.js';
import { hasPort } from '../src/travel/travelPorts.js';
import { LOCATION_TYPES } from '../src/formats/mapsFile.js';

const TYPE_NAME = Object.fromEntries(Object.entries(LOCATION_TYPES).map(([k, v]) => [v, k]));

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
  WoodsFile.portChannels = process.argv.includes('--carved');
  const woods = new WoodsFile(); if (!woods.load(bytes('WOODS.WLD'))) throw new Error('WOODS.WLD failed to load');
  const rows = auditPorts(maps, woods);
  if (process.argv.includes('--json')) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }
  const f = (n) => (n ? `${n.d.toFixed(1)}px` : 'none<80');
  for (const x of rows) console.log(`${x.coast ? 'COAST ' : 'INLAND'} ${x.region.padEnd(18)} ${x.name.padEnd(26)} ${String(x.type).padEnd(11)} byte=0x${x.byte.toString(16).padStart(2, '0')} TO=${x.travelOptions ? 'y' : 'n'}${x.coast ? '' : `  sea ${f(x.nearestSea)}  water ${f(x.nearestWater)}`}`);
  const inland = rows.filter((x) => !x.coast);
  console.log(`\n${rows.length} port settlements; ${rows.length - inland.length} on the coast; ${inland.length} inland`);
}
