// The terrain worker, the other half of terrainGenClient.js. One 'init' message hands it a copy of the WOODS.WLD
// bytes. Each 'job' message runs the pure pixel kernel and sends one reply, with the big arrays transferred back.
// It may import only pure modules: a worker has no DOM and the import graph is evaluated whole.

import { packNature, natureBuffers } from './natureWire.js';
import { WoodsFile } from '../formats/woodsFile.js';
import { groundWoods, dropGroundCache } from './tamrielGround.js';
import { etherWoods } from './ethericSea.js';
import { setTamrielTrace } from './tamrielLand.js';
import { setTamrielFit } from './tamrielFrame.js';
import { generatePixelTerrain, restrideGrid } from './terrainGen.js';
import { buildRoadsFromSettlements } from './roadsProducer.js';
import { cachedNetwork, roadsCacheKey } from './roadsCache.js';

let woods = null;

let roads = null;
let sites = null;
let climates = null;
let pendingRoads = null;
globalThis.onmessage = (ev) => handle(ev.data ?? {});

function handle(m) {
  try {
    if (m.t === 'init') {
      const w = new WoodsFile();
      if (!w.load(m.woodsBytes)) throw new Error('WOODS.WLD failed to load in the terrain worker');
      woods = m.tamriel ? groundWoods(w) : w;
      if (m.ether) woods = etherWoods(woods);
      return;
    }
    if (m.t === 'landform-tables') { sites = m.sites ?? null; climates = m.climates ?? null; return; }
    if (m.t === 'tamriel') { setTamrielTrace(m.trace ?? null); setTamrielFit(m.fit ?? null); dropGroundCache(); return; }
    if (m.t === 'roads') {
      roads = null;
      if (m.net) { roads = { roads: m.net.roads, tracks: m.net.tracks, rivers: m.net.rivers ?? null, streams: m.net.streams ?? null, water: !!m.net.water, smooth: m.net.smooth !== false }; globalThis.postMessage({ t: 'roads', stats: m.stats ?? null, net: null }); return; }
      if (m.settlements && woods) {
        // Jobs and grid builds wait on pendingRoads, so the cached network is in place before they run.
        pendingRoads = cachedNetwork({
          key: roadsCacheKey({ settlements: m.settlements, woodsLength: woods._bytes?.byteLength ?? 0 }),
          build: () => buildRoadsFromSettlements(m.settlements, woods),
        }).then((net) => {
          roads = net ? { roads: net.roads, tracks: net.tracks, ...(m.switches ?? {}) } : null;
          const back = roads ? { roads: roads.roads.slice(), tracks: roads.tracks.slice() } : null;
          const stats = net ? { ...net.stats, cached: !!net.cached } : null;
          globalThis.postMessage({ t: 'roads', stats, net: back }, back ? [back.roads.buffer, back.tracks.buffer] : []);
          pendingRoads = null;
        });
      }
      return;
    }
    if (m.t === 'grid' && m.landform && pendingRoads) { pendingRoads.then(() => handle(m)); return; }
    if (m.t === 'grid') { answerGrid(m); return; }
    if (m.t === 'job' && pendingRoads) { pendingRoads.then(() => handle(m)); return; }
    if (m.t !== 'job') return;
    if (!woods) throw new Error('terrain worker got a job before init');
    // The job crosses whole, as a spread, so a new kernel input cannot be dropped at the wire.
    const out = generatePixelTerrain({ ...m, woods, roads, sites, climates });
    const transfer = [out.samples.buffer, out.tilemap.buffer, out.positions.buffer, out.normals.buffer, out.tilemapBytes.buffer];
    if (out.paths) transfer.push(out.paths.buffer);
    if (out.beach) transfer.push(out.beach.buffer);
    if (out.bed) transfer.push(out.bed.depths.buffer, out.bed.sheetDepths.buffer, out.bed.positions.buffer, out.bed.normals.buffer, ...(out.bed.halo ? [out.bed.halo.bits.buffer] : []));
    out.nature = packNature(out.nature);
    transfer.push(...natureBuffers(out.nature));
    globalThis.postMessage({ t: 'done', ...out }, transfer);
  } catch (e) {
    globalThis.postMessage({ t: 'error', message: e?.message ?? String(e) });
  }
}

function answerGrid(m) {
  try {
    if (!woods) throw new Error('terrain worker got a grid before init');
    const { positions, normals, bed } = restrideGrid({ ...m, woods, roads, sites, climates });
    const transfer = [positions.buffer, normals.buffer];
    if (bed) transfer.push(bed.depths.buffer, bed.sheetDepths.buffer, bed.positions.buffer, bed.normals.buffer, ...(bed.halo ? [bed.halo.bits.buffer] : []));
    globalThis.postMessage({ t: 'grid', id: m.id, positions, normals, bed }, transfer);
  } catch (e) {
    globalThis.postMessage({ t: 'gridError', id: m.id, message: e?.message ?? String(e) });
  }
}
