// Terrain generation off the main thread: a module Worker runs the kernel from terrainGen.js.
// With no Worker, a failed factory, a dead worker, or ?terrainthread=off, the same kernel runs on this thread.
// The WOODS bytes are copied to the worker, never transferred; a transfer would detach the reader's buffer.

import { unpackNature } from './natureWire.js';
import { setTamrielTrace } from './tamrielLand.js';
import { setTamrielFit } from './tamrielFrame.js';
import { dropGroundCache } from './tamrielGround.js';
import { generatePixelTerrain, restrideGrid } from './terrainGen.js';
import { buildRoadsFromSettlements } from './roadsProducer.js';

export function terrainThreadDisabled(search = globalThis.location?.search) {
  try { return /[?&]terrainthread=off\b/.test(search ?? ''); }
  catch { return false; }
}

// Vite matches the bare `new Worker(new URL(...))` spelling to bundle the worker entry.
function defaultWorkerFactory() {
  return new Worker(new URL('./terrainGenWorker.js', import.meta.url), { type: 'module' });
}

export class TerrainGenClient {
  /**
   * @param {object} deps
   * @param {object} deps.woods
   * @param {Uint8Array} [deps.woodsBytes]
   * @param {?Function} [deps.workerFactory]
   */
  constructor({ woods, woodsBytes = null, workerFactory = null } = {}) {
    this._woods = woods;
    this._tamriel = !!woods?.isTamrielGround;
    this._ether = !!woods?.isEtherGround;
    this._sites = null;
    this._climates = null;
    this._worker = null;
    this._fifo = [];
    this._grids = new Map();
    this._gridId = 0;
    const factory = workerFactory
      ?? ((terrainThreadDisabled() || typeof Worker === 'undefined' || !woodsBytes)
        ? null : defaultWorkerFactory);
    if (!factory) return;
    let w = null;
    try {
      w = factory();
      w.onerror = (e) => this._down(e?.message ?? 'terrain worker failed');
      w.onmessage = (ev) => {
        const m = ev.data ?? {};
        if (m.t === 'roads') {
          if (m.net) this._roads = { roads: m.net.roads, tracks: m.net.tracks, ...(this._switches ?? {}), source: this._roadsSource ?? 'generated' };
          else if (!this._roads) this._settlements = null;
          if (m.stats && this._roadsStats) this._roadsStats(m.stats);
          return;
        }
        if (m.t === 'grid' || m.t === 'gridError') { this._gridAnswer(m); return; }
        this._answer(m);
      };
      const bytes = woodsBytes.slice();
      w.postMessage({ t: 'init', woodsBytes: bytes, tamriel: this._tamriel, ether: this._ether }, [bytes.buffer]);
      this._worker = w;
    } catch (e) {
      console.warn('[terrain] worker unavailable; generating on the main thread', e);
      try { w?.terminate?.(); } catch { }
      this._worker = null;
    }
  }

  setRoads(settlements, onStats = null, switches = null) {
    this._settlements = settlements ?? null;
    this._roads = null;
    this._roadsStats = onStats;
    this._switches = switches;
    this._roadsSource = 'generated';
    if (this._worker && this._settlements) this._worker.postMessage({ t: 'roads', settlements: this._settlements, switches });
    else if (!this._worker) this._roadsFallback();
  }

  setTamriel({ trace = null, fit = null } = {}) {
    setTamrielTrace(trace);
    setTamrielFit(fit);
    dropGroundCache();
    if (!this._worker) return;
    const t = trace ? { w: trace.w, h: trace.h, land: trace.land.slice(), province: trace.province.slice() } : null;
    this._worker.postMessage({ t: 'tamriel', trace: t, fit: fit ? { ox: fit.ox, oy: fit.oy, ppu: fit.ppu } : null }, t ? [t.land.buffer, t.province.buffer] : []);
  }

  setLandformTables({ sites = null, climates = null } = {}) {
    this._sites = sites;
    this._climates = climates;
    if (!this._worker) return;
    const s = sites ? sites.slice() : null, c = climates ? climates.slice() : null;
    this._worker.postMessage({ t: 'landform-tables', sites: s, climates: c }, [s, c].filter(Boolean).map((a) => a.buffer));
  }

  roads() { return this._roads; }

  get hasRoads() { return !!this._roads || !!this._settlements; }

  setRoadsData(net, onStats = null) {
    this._settlements = null;
    this._switches = { water: !!net.water, smooth: net.smooth !== false };
    this._roadsSource = net.source ?? 'basic-roads';
    this._roads = { roads: net.roads, tracks: net.tracks, rivers: net.rivers ?? null, streams: net.streams ?? null, water: !!net.water, smooth: net.smooth !== false, source: this._roadsSource };
    this._roadsStats = onStats;
    if (this._worker) {
      const copy = { roads: net.roads.slice(), tracks: net.tracks.slice(), rivers: net.rivers ? net.rivers.slice() : null, streams: net.streams ? net.streams.slice() : null, water: !!net.water, smooth: net.smooth !== false };
      const xfer = [copy.roads.buffer, copy.tracks.buffer]; if (copy.rivers) xfer.push(copy.rivers.buffer); if (copy.streams) xfer.push(copy.streams.buffer);
      this._worker.postMessage({ t: 'roads', net: copy, stats: net.stats ?? null }, xfer);
    } else if (onStats) onStats(net.stats ?? { source: 'basic-roads' });
  }

  _roadsFallback() {
    if (this._roads || !this._settlements) return;
    const net = buildRoadsFromSettlements(this._settlements, this._woods);
    this._roads = net ? { roads: net.roads, tracks: net.tracks, ...(this._switches ?? {}), source: this._roadsSource ?? 'generated' } : null;
    if (!net) this._settlements = null;
    if (net && this._roadsStats) this._roadsStats(net.stats);
  }

  generate(job) {
    if (!this._worker) {
      this._roadsFallback();
      return Promise.resolve(generatePixelTerrain({ woods: this._woods, roads: this._roads ?? null, sites: this._sites, climates: this._climates, ...job }));
    }
    return new Promise((resolve) => {
      this._fifo.push({ job, resolve });
      this._worker.postMessage({ t: 'job', ...job });
    });
  }

  get threaded() { return !!this._worker; }

  /**
   * @param {{ px: number, py: number, stride: number, samples: Float32Array, bed?: ?Uint8Array }} job
   * @returns {Promise<{ positions: Float32Array, normals: Float32Array, bed: ?object }>}
   */
  grid(job) {
    if (!this._worker) return Promise.resolve(restrideGrid({ woods: this._woods, roads: this._roads ?? null, sites: this._sites, climates: this._climates, ...job }));
    const id = ++this._gridId;
    return new Promise((resolve) => {
      this._grids.set(id, { job, resolve });
      this._worker.postMessage({ t: 'grid', id, ...job });
    });
  }

  _gridAnswer(m) {
    const g = this._grids.get(m.id);
    if (!g) return;
    this._grids.delete(m.id);
    if (m.t === 'gridError') {
      console.warn('[terrain] worker grid failed; building it on the main thread -', m.message);
      g.resolve(restrideGrid({ woods: this._woods, roads: this._roads ?? null, sites: this._sites, climates: this._climates, ...g.job }));
      return;
    }
    g.resolve({ positions: m.positions, normals: m.normals, bed: m.bed ?? null });
  }

  _answer(m) {
    if (m.t !== 'done' && m.t !== 'error') return;
    const p = this._fifo.shift();
    if (!p) return;
    if (m.t === 'error') {
      console.warn('[terrain] worker job failed; generating on the main thread -', m.message);
      this._roadsFallback();
      p.resolve(generatePixelTerrain({ woods: this._woods, roads: this._roads ?? null, sites: this._sites, climates: this._climates, ...p.job }));
      return;
    }
    const { t: _tag, ...out } = m;
    out.nature = unpackNature(out.nature);
    p.resolve(out);
  }

  _down(message) {
    console.warn('[terrain] worker died; generating on the main thread -', message);
    const pending = this._fifo;
    this._fifo = [];
    try { this._worker?.terminate?.(); } catch { }
    this._worker = null;
    this._roadsFallback();
    for (const p of pending) p.resolve(generatePixelTerrain({ woods: this._woods, roads: this._roads ?? null, sites: this._sites, climates: this._climates, ...p.job }));
    const grids = [...this._grids.values()];
    this._grids.clear();
    for (const g of grids) g.resolve(restrideGrid({ woods: this._woods, roads: this._roads ?? null, sites: this._sites, climates: this._climates, ...g.job }));
  }
}
