// @ts-check

export const PERF_EVERY = 120;

export function perfOn(search = globalThis.location?.search ?? '') {
  try { return /[?&]perf\b/.test(search); } catch { return false; }
}

export function perfZones(search = globalThis.location?.search ?? '') {
  try { return /[?&]perf=zones\b/.test(search); } catch { return false; }
}

export function perfCpu(search = globalThis.location?.search ?? '') {
  try { return /[?&]perf=cpu\b/.test(search); } catch { return false; }
}

export function perfLine(gpuMs, counts) {
  const gpu = gpuMs == null ? 'gpu n/a' : `gpu ${gpuMs.toFixed(2)}ms`;
  const c = counts || {};
  const parts = [gpu, `draws ${c.draws ?? 0}`];
  if (c.shadows) parts.push(`sun ${c.shadows.cascadesDrawn ?? 0}c/${c.shadows.sunDraws ?? 0}d`, `lanterns ${c.shadows.casters ?? 0}k/${c.shadows.facesDrawn ?? 0}f/${c.shadows.pointDraws ?? 0}d`, `culled ${c.shadows.culled ?? 0}`, `records ${c.shadows.records ?? 0}`);
  if (c.air) parts.push(`emit ${c.air.emitDraws ?? 0}`, `glares ${c.air.glares ?? 0}`, `shafts ${c.air.shafts ? 1 : 0}`);
  return `[perf] ${parts.join(' | ')}`;
}

export function perfZoneLine(zones, counts, clock = 'gpu') {
  const rows = [...zones.entries()].filter(([, ms]) => ms != null).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return perfLine(null, counts);
  const total = rows.reduce((a, [, ms]) => a + ms, 0);
  const parts = [`${clock} ${total.toFixed(2)}ms`, ...rows.map(([n, ms]) => `${n} ${ms.toFixed(2)}`), `draws ${counts?.draws ?? 0}`];
  return `[perf] ${parts.join(' | ')}`;
}

export class PerfMeter {
  /** @param {WebGL2RenderingContext} gl */
  /**
   * @param {WebGL2RenderingContext} gl
   * @param {boolean} zones
   * @param {boolean} cpu
   */
  constructor(gl, zones = false, cpu = false) {
    this.gl = gl;
    this.ext = gl.getExtension?.('EXT_disjoint_timer_query_webgl2') ?? null;
    this.cpu = !!cpu;
    this.cpuZones = new Map();
    this.cpuOpen = null;
    this.cpuFrames = 0;
    this._now = () => (globalThis.performance?.now?.() ?? Date.now());
    this.queries = [];
    this.active = null;
    this.samples = [];
    this.frames = 0;
    this.zones = !!zones;
    this.zoneQueries = [];
    this.zoneSamples = new Map();
    this.openZone = null;
  }
  // The timer extension allows one elapsed-time query open at a time. Zone mode skips the frame query, and CPU mode
  // runs no GPU query because nothing would drain its samples.
  begin() {
    if (this.cpu) return;
    if (!this.ext || this.active || this.zones) return;
    const q = this.gl.createQuery();
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }
  end() {
    if (!this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.queries.push(this.active);
    this.active = null;
    this.poll();
  }
  // Spans tile: each mark closes the open span and opens the next, so the zones sum to the frame.
  mark(name) {
    if (this.cpu) this._cpuMark(name);
    if (!this.ext || !this.zones) return;
    this._closeZone();
    const q = this.gl.createQuery();
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.openZone = [name, q];
  }
  stop() { if (this.cpu) this._cpuClose(); this._closeZone(); }
  // The host calls this where its script frame ends, so the wait for the next animation frame falls in no span.
  stopCpu() { if (this.cpu) this._cpuClose(); }
  markCpu(name) { if (this.cpu) this._cpuMark(name); }
  addCpu(name, ms) { if (this.cpu && ms > 0) this.cpuZones.set(name, (this.cpuZones.get(name) ?? 0) + ms); }
  _cpuMark(name) {
    this._cpuClose();
    this.cpuOpen = [name, this._now()];
  }
  _cpuClose() {
    if (!this.cpuOpen) return;
    const [name, at] = this.cpuOpen;
    this.cpuOpen = null;
    this.cpuZones.set(name, (this.cpuZones.get(name) ?? 0) + (this._now() - at));
  }
  _closeZone() {
    if (!this.openZone) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.zoneQueries.push(this.openZone);
    this.openZone = null;
  }
  poll() {
    const gl = this.gl;
    while (this.queries.length) {
      const q = this.queries[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
      this.queries.shift();
      gl.deleteQuery(q);
      if (!disjoint) this.samples.push(ns / 1e6);
    }
    while (this.zoneQueries.length) {
      const [name, q] = this.zoneQueries[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
      this.zoneQueries.shift();
      gl.deleteQuery(q);
      if (disjoint) continue;
      const bucket = this.zoneSamples.get(name);
      if (bucket) bucket.push(ns / 1e6);
      else this.zoneSamples.set(name, [ns / 1e6]);
    }
  }
  frame(counts) {
    this.frames++;
    if (this.cpu) {
      this._cpuClose();
      this.cpuFrames++;
      if (this.frames % PERF_EVERY === 0) {
        const means = new Map();
        for (const [name, ms] of this.cpuZones) means.set(name, ms / Math.max(1, this.cpuFrames));
        this.cpuZones.clear(); this.cpuFrames = 0;
        return perfZoneLine(means, counts, 'cpu');
      }
      return null;
    }
    if (this.zones) this.poll();
    if (this.frames % PERF_EVERY !== 0) return null;
    if (this.zones) {
      const means = new Map();
      for (const [name, list] of this.zoneSamples) {
        // Per frame, not per sample: a zone marked twice in one frame reads as that frame's whole time in it.
        means.set(name, list.length ? list.reduce((a, b) => a + b, 0) / PERF_EVERY : null);
        list.length = 0;
      }
      return this.ext ? perfZoneLine(means, counts) : perfLine(null, counts);
    }
    const mean = this.samples.length ? this.samples.reduce((a, b) => a + b, 0) / this.samples.length : null;
    this.samples.length = 0;
    return perfLine(this.ext ? mean : null, counts);
  }
}

// One meter per GL context, so a pass drawn outside the renderer can find it by the context it holds.
const METERS = new WeakMap();
export function setMeter(gl, meter) { if (meter) METERS.set(gl, meter); return meter; }
export function meterFor(gl) { return METERS.get(gl) ?? null; }
