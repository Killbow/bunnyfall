// Lists every town seat from ARENA2 with its bulletin board tally, plus the totals.
// Usage: ARENA2_PATH=<dir> node tools/seatCount.mjs [--json]

import { readFileSync } from 'node:fs';
import { isMain } from './lib/isMain.mjs';
import { BlocksFile } from '../src/formats/blocksFile.js';
import { MapsFile } from '../src/formats/mapsFile.js';
import { layoutLocation } from '../src/world/locationLayout.js';
import { pickRegionHubs } from '../src/world/regionHubs.js';
import { deriveTownSeats, seatTotals } from '../src/guilds/townSeats.js';
import { boardTally } from './boardCount.mjs';

export function baseRows(maps) {
  const rows = [];
  for (let r = 0; r < maps.regionCount; r++) {
    const region = maps.getRegion(r);
    if (!region) continue;
    const base = maps.baseLocationCount(r);
    for (let l = 0; l < Math.min(base, region.locationCount); l++) {
      const loc = maps.getLocation(r, l);
      if (loc?.exterior?.exteriorData) rows.push(loc);
    }
  }
  return rows;
}

export function countSeats(rows, { regionNameOf, layout = null } = {}) {
  const hubs = pickRegionHubs(rows, { regionNameOf });
  const seats = deriveTownSeats(rows, { regionNameOf, isHub: (k) => hubs.byMapId.has(k) });
  const byKey = new Map(rows.map((loc) => [loc.mapTableData?.mapId >>> 0, loc]));
  const out = seats.list.map((s) => {
    // A board count of -1 means the seat was not laid out.
    let tally = { boards: -1, bounty: 0, rumour: 0 };
    try { if (layout) tally = boardTally(layout(byKey.get(s.key)).blocks); } catch { }
    return { ...s, regionName: regionNameOf ? regionNameOf(s.region) : String(s.region), ...tally };
  });
  return { seats: out, totals: seatTotals(seats.list) };
}

if (isMain(import.meta.url)) {
  const A2 = process.env.ARENA2_PATH;
  if (!A2) { console.error('ARENA2_PATH is not set - point it at your own arena2 folder.'); process.exit(2); }
  const bytes = (n) => new Uint8Array(readFileSync(`${A2}/${n}`));
  const blocks = new BlocksFile(); blocks.load(bytes('BLOCKS.BSA'));
  const maps = new MapsFile(); maps.load(bytes('MAPS.BSA'), bytes('CLIMATE.PAK'), bytes('POLITIC.PAK'));
  const { seats, totals } = countSeats(baseRows(maps), {
    regionNameOf: (r) => maps.getRegionName(r),
    layout: (loc) => layoutLocation(loc, maps, blocks, { enhanced: false, windmills: false }),
  });
  if (process.argv.includes('--json')) { console.log(JSON.stringify({ seats, totals }, null, 2)); process.exit(0); }
  for (const s of seats) {
    console.log(`${s.regionName.padEnd(20)} ${String(s.kingdom ?? '-').padEnd(10)} ${s.name.padEnd(24)} ${s.tier.padEnd(6)} ${s.isHub ? 'hub' : '   '}  (${s.pixel[0]},${s.pixel[1]})  boards ${String(s.boards).padStart(2)} rumour ${s.rumour}${s.boards < 0 ? '   (layout failed - not measured)' : s.rumour ? '' : '   <- NO NOTICE BOARD'}`);
  }
  const none = seats.filter((s) => s.boards === 0);
  console.log(`\n${totals.seats} seats: ${totals.crown} crown, ${totals.palace} palace; ${totals.hubs} of them hubs. By kingdom: ${Object.entries(totals.kingdoms).map(([k, n]) => `${k} ${n}`).join(', ')}.`);
  console.log(`${none.length} with no Notice Board${none.length ? `: ${none.map((s) => s.name).join(', ')}` : ''}.`);
}
