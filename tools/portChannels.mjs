// PORT-CHANNELS (2026-11-04, the owner: "carve a river or inlet but make sure you dont touch any important land"): FINDS
// EACH INLAND PORT A SHORT WATER WAY TO THE OPEN SEA, and writes it as data (src/world/portChannelData.js).
//
// A port settlement (tools/portAudit.mjs) with no open sea within SEA_RING gets a channel of map pixels from the open sea
// (or a lake that is already water - costing nothing, so a river runs on through it) to within SEA_RING of the town. The way
// is Dijkstra's over the 8-neighbours, cheapest through LOW ground (each land pixel costs 1 + its height byte / 8) and
// never over IMPORTANT LAND: a pixel holding any location (a town, a keep, a temple, a dungeon: every one but the port's
// own), a pixel next to one (it costs LOCATION_NEAR_COST more, and is refused outright beside a town of 40+ houses'
// kind - any non-dungeon location), mountain climate, or a pixel the town's own map holds the port's block in. A town
// whose way would carve more than MAX_CARVE pixels is left as it is (its far capitals: Dragontail, Wrothgaria... stand
// no shipyard, as INLAND-PORTS made them).
//
// Writes src/world/portChannelData.js. Usage: ARENA2_PATH=/path/to/arena2 node tools/portChannels.mjs [--dry]
import { readFileSync, writeFileSync } from 'node:fs';
import { isMain } from './lib/isMain.mjs';
import { MapsFile, longitudeLatitudeToMapPixel, CLIMATES } from '../src/formats/mapsFile.js';
import { WoodsFile, MAP_WIDTH, MAP_HEIGHT } from '../src/formats/woodsFile.js';
import { isWaterPixel } from '../src/ui/overworldModel.js';
import { openSeaOf } from '../src/world/portSites.js';
import { SEA_RING } from '../src/net/fortLaw.js';
import { auditPorts } from './portAudit.mjs';

export const MAX_CARVE = 10;
const LOCATION_NEAR_COST = 6;

class Heap {
  constructor() { this.a = []; }
  push(c, v) { const a = this.a; a.push([c, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; }
}

/** Every location's pixel -> its kind, so a way keeps off them. */
function locationPixels(maps) {
  const at = new Map();
  for (let r = 0; r < maps.regionCount; r++) {
    const region = maps.getRegion(r);
    if (!region) continue;
    for (let l = 0; l < region.locationCount; l++) {
      const loc = maps.getLocation(r, l);
      const t = loc?.mapTableData;
      if (!t) continue;
      const p = longitudeLatitudeToMapPixel(t.longitude, t.latitude);
      at.set(p.y * MAP_WIDTH + p.x, t.mapId);
    }
  }
  return at;
}

/** The channel for one port: the land pixels to make water, or null where none is short enough / clear enough. */
export function channelFor(port, ctx) {
  const { seaPixel, sea, locAt, climateAt } = ctx;
  const start = port.py * MAP_WIDTH + port.px;
  const dist = new Float64Array(MAP_WIDTH * MAP_HEIGHT).fill(Infinity), prev = new Int32Array(MAP_WIDTH * MAP_HEIGHT).fill(-1);
  const heap = new Heap();
  dist[start] = 0; heap.push(0, start);
  let goal = -1;
  while (heap.size) {
    const [d, i] = heap.pop();
    if (d > dist[i]) continue;
    const x = i % MAP_WIDTH, y = (i - x) / MAP_WIDTH;
    if (sea[i] === 1 && i !== start) { goal = i; break; }
    if (d > 60) break;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= MAP_WIDTH - 1 || ny >= MAP_HEIGHT - 1) continue;
        const j = ny * MAP_WIDTH + nx;
        let c;
        if (seaPixel(nx, ny)) c = 0.05;   // water already: a lake or the sea itself
        else {
          const other = locAt.get(j);
          if (other !== undefined && other !== port.mapId) continue;   // important land: never
          if (climateAt(nx, ny) === CLIMATES.Mountain) continue;
          let near = 0;
          for (let ey = -1; ey <= 1; ey++) for (let ex = -1; ex <= 1; ex++) { const o = locAt.get((ny + ey) * MAP_WIDTH + nx + ex); if (o !== undefined && o !== port.mapId) near++; }
          if (near > 1) continue;   // hemmed in by other places
          c = 1 + ctx.height(nx, ny) / 8 + near * LOCATION_NEAR_COST;
          if (dx && dy) c *= 1.41;
        }
        if (d + c < dist[j]) { dist[j] = d + c; prev[j] = i; heap.push(d + c, j); }
      }
    }
  }
  if (goal < 0) return null;
  const path = [];
  for (let i = goal; i !== -1; i = prev[i]) path.push(i);   // sea ... town
  path.reverse();   // town ... sea
  const keep = [];
  for (const i of path) {
    const x = i % MAP_WIDTH, y = (i - x) / MAP_WIDTH;
    if (Math.max(Math.abs(x - port.px), Math.abs(y - port.py)) <= SEA_RING - 1) continue;   // the town's own ground stays: the channel stops a pixel short of its ring
    if (!seaPixel(x, y)) keep.push([x, y]);
  }
  if (keep.length === 0 || keep.length > MAX_CARVE) return null;
  return keep;
}

if (isMain(import.meta.url)) {
  const A2 = process.env.ARENA2_PATH;
  if (!A2) { console.error('ARENA2_PATH is not set'); process.exit(2); }
  const bytes = (n) => new Uint8Array(readFileSync(`${A2}/${n}`));
  const maps = new MapsFile(); maps.load(bytes('MAPS.BSA'), bytes('CLIMATE.PAK'), bytes('POLITIC.PAK'));
  WoodsFile.portChannels = false;   // the map as the game made it
  const woods = new WoodsFile(); woods.load(bytes('WOODS.WLD'));
  const seaPixel = (x, y) => isWaterPixel(maps.getClimateIndex(x, y), woods.getHeightMapValue(x, y));
  const sea = openSeaOf(seaPixel, MAP_WIDTH, MAP_HEIGHT);
  const ctx = { seaPixel, sea, locAt: locationPixels(maps), climateAt: (x, y) => maps.getClimateIndex(x, y), height: (x, y) => woods.getHeightMapValue(x, y) };
  const inland = auditPorts(maps, woods).filter((r) => !r.coast);
  const out = [], skipped = [];
  for (const port of inland) {
    const keep = channelFor(port, ctx);
    if (keep) out.push({ mapId: port.mapId, region: port.region, name: port.name, pixels: keep });
    else skipped.push(`${port.region}/${port.name}`);
  }
  console.log(`channels for ${out.length} of ${inland.length} inland ports; pixels carved: ${out.reduce((n, c) => n + c.pixels.length, 0)}`);
  for (const c of out) console.log(`  ${c.region} / ${c.name}: ${c.pixels.length} px ${JSON.stringify(c.pixels)}`);
  console.log(`left as they are (${skipped.length}): ${skipped.join(', ')}`);
  if (!process.argv.includes('--dry')) {
    const body = `// @ts-check
// BUNNYFALL (PORT-CHANNELS, 2026-11-04): GENERATED by tools/portChannels.mjs from the player's own ARENA2 - do not edit by hand.
// The map pixels made water so an inland port (a Travel Options harbour with no open sea within SEA_RING) has a short river
// or inlet to the sea: each pixel's height byte goes to PORT_CHANNEL_BYTE (world/portChannels.js applies it to the height
// map as WOODS.WLD loads, in every thread that reads it). Never a pixel holding a location or beside one, never mountain.
export const PORT_CHANNEL_BYTE = 2;
/** @type {ReadonlyArray<{ mapId: number, region: string, name: string, pixels: ReadonlyArray<readonly [number, number]> }>} */
export const PORT_CHANNELS = Object.freeze(${JSON.stringify(out.map((c) => ({ ...c, pixels: c.pixels })), null, 1).replace(/\n\s*/g, ' ')});
`;
    writeFileSync(new URL('../src/world/portChannelData.js', import.meta.url), body);
    console.log('wrote src/world/portChannelData.js');
  }
}
