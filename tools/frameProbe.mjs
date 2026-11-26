// Measures what a frame of the real game costs: a GL call census, a CPU profile, and a heap profile per scene.
// Run: ARENA2_PATH=... node tools/frameProbe.mjs <scene...>; env such as TREE, TAG, OUT, FRAMES, PORT, JSFLAGS.
// Run A/B arms one after the other with nothing else running: SwiftShader takes most of the cores.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isMain } from './lib/isMain.mjs';

const ROOT = process.env.TREE || fileURLToPath(new URL('..', import.meta.url));
export const FRAME_PROBE_OUT = process.env.OUT || join(tmpdir(), 'frameProbe');
const OUT = FRAME_PROBE_OUT;
const PORT = Number(process.env.PORT || 5241);
const FRAMES = Number(process.env.FRAMES || 60);
const W = Number(process.env.W || 480), H = Number(process.env.H || 270);
const EXTRA = process.env.EXTRA || '';
const TUNING = process.env.TUNING ? JSON.parse(process.env.TUNING) : null;

export const SCENES = {
  town: '/play/?world&region=Daggerfall&loc=Daggerfall&class=1&novideo&shot&play&fps&tod=15:00',
  townrain: '/play/?world&region=Wayrest&loc=Knightstale&class=1&novideo&shot&play&fps&tod=15:00&weather=rain',
  knight: '/play/?world&region=Wayrest&loc=Knightstale&class=1&novideo&shot&play&fps&tod=15:00',
  coast: '/play/?world&region=Sentinel&loc=Bubumbaret&class=1&novideo&shot&play&fps&tod=12:00',
  night: '/play/?world&region=Wayrest&loc=Knightstale&class=1&novideo&shot&play&fps&tod=22:00',
  dungeon: '/play/?world&classic&class=1&novideo&shot&play&fps',
};

export const FRAME_PROBE_EDITS = Object.freeze([
  { file: 'src/platform/buildBreather.js', edits: [['export const BUILD_SLICE_MS = 6;', 'export const BUILD_SLICE_MS = 250;'], ['export const BUILD_SLICE_FLOOR_MS = 3;', 'export const BUILD_SLICE_FLOOR_MS = 250;']] },
  { file: 'src/render/labGrass.js', edits: [['range = LAB_GRASS.range, perFrame = 2,', 'range = LAB_GRASS.range, perFrame = 1000,']] },
]);
export const editsPlugin = (name, table) => ({
  name,
  enforce: 'pre',
  transform(code, id) {
    const p = id.split('?')[0];
    const row = table.find((t) => p.endsWith(`/${t.file}`));
    if (!row) return null;
    let a = code;
    for (const [needle, by] of row.edits) {
      // Each needle must match once: a second copy (a quoting comment, a base tree) would edit only the first.
      const n = a.split(needle).length - 1;
      if (n !== 1) throw new Error(`${name}: ${row.file} needle ${n ? `found ${n} times` : 'missed'}: ${needle.slice(0, 80)}`);
      a = a.replace(needle, by);
    }
    return a;
  },
});
export const probeTransforms = () => ({
  name: 'probe-transforms',
  enforce: 'pre',
  transform(code, id) {
    const p = id.split('?')[0];
    const edited = editsPlugin('probe-transforms', FRAME_PROBE_EDITS).transform(code, id);
    if (edited != null) return edited;
    if (process.env.INSTR === 'shadow' && p.endsWith('/src/render/shadowPass.js')) {
      return code + `
;(() => {
  const P = ShadowPass.prototype;
  const S = globalThis.__shStats = { frames: 0, byKind: {}, records: 0, batches: 0, renderMs: 0 };
  const now = () => performance.now();
  const wrap = (name, kindOf) => { const o = P[name]; P[name] = function (...a) { const t = now(); const r = o.apply(this, a); const e = now() - t; const k = kindOf ? kindOf(a) : name; const s = S.byKind[k] ??= { n: 0, ms: 0, draws: 0 }; s.n++; s.ms += e; if (kindOf && typeof r === 'number') s.draws += r; return r; }; };
  wrap('replay', (a) => (a[2] ? 'pt' : (a[5] > 0 ? 'sun' : 'cam')) + ':' + ['all','static','dyn','lo'][a[6] ?? 0]);
  wrap('_dynamicNear'); wrap('_staticSignatures'); wrap('_blitSlot');
  wrap('_sunCandidates'); wrap('_casterCandidates');   // AUDIT PERF-ON4 (sun lens 4): the walks the replays now read their lists from, timed beside them
  const r = P.render; P.render = function (f) { const t = now(); r.call(this, f); S.renderMs += now() - t; S.frames++; let nb = 0; for (let i = 0; i < this.count; i++) { const rec = this.records[i]; if (rec.kind === 2) nb += rec.batches?.length ?? 0; } S.records += this.count; S.batches += nb; };
})();
`;
    }
    return null;
  },
});

export const CENSUS = `(() => {
  const C = window.__census = { on: false, counts: new Map(), frames: 0, undo: [] };
  window.__censusOff = () => { for (const f of C.undo.splice(0)) f(); };
  const bump = (k) => { if (C.on) C.counts.set(k, (C.counts.get(k) || 0) + 1); };
  for (const proto of [WebGL2RenderingContext.prototype]) {
    for (const k of Object.getOwnPropertyNames(proto)) {
      const d = Object.getOwnPropertyDescriptor(proto, k);
      if (!d || typeof d.value !== 'function' || k === 'constructor') continue;
      const f = d.value;
      proto[k] = function (...a) { bump('gl.' + k); return f.apply(this, a); };
      C.undo.push(() => { proto[k] = f; });
    }
  }
  const U = window.URLSearchParams;
  window.URLSearchParams = class extends U { constructor(...a) { super(...a); bump('URLSearchParams'); } };
  C.undo.push(() => { window.URLSearchParams = U; });
  const gi = Storage.prototype.getItem; Storage.prototype.getItem = function (k) { bump('storage.getItem'); return gi.call(this, k); };
  C.undo.push(() => { Storage.prototype.getItem = gi; });
  const si = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { bump('storage.setItem'); return si.call(this, k, v); };
  C.undo.push(() => { Storage.prototype.setItem = si; });
  const ce = Document.prototype.createElement; Document.prototype.createElement = function (...a) { bump('dom.createElement'); return ce.apply(this, a); };
  C.undo.push(() => { Document.prototype.createElement = ce; });
  const gbcr = Element.prototype.getBoundingClientRect; Element.prototype.getBoundingClientRect = function () { bump('dom.getBoundingClientRect'); return gbcr.call(this); };
  C.undo.push(() => { Element.prototype.getBoundingClientRect = gbcr; });
  const gcs = window.getComputedStyle; window.getComputedStyle = function (...a) { bump('dom.getComputedStyle'); return gcs.apply(this, a); };
  C.undo.push(() => { window.getComputedStyle = gcs; });
  const raf = window.requestAnimationFrame; window.requestAnimationFrame = function (fn) { bump('raf'); return raf.call(this, fn); };
  C.undo.push(() => { window.requestAnimationFrame = raf; });
  const st = window.setTimeout; window.setTimeout = function (...a) { bump('setTimeout'); return st.apply(this, a); };
  C.undo.push(() => { window.setTimeout = st; });
  const jp = JSON.parse; JSON.parse = function (...a) { bump('JSON.parse'); return jp.apply(this, a); };
  C.undo.push(() => { JSON.parse = jp; });
  const js = JSON.stringify; JSON.stringify = function (...a) { bump('JSON.stringify'); return js.apply(this, a); };
  C.undo.push(() => { JSON.stringify = js; });
})();`;

export async function waitFrames(page, n, timeout = 900000) {
  const f0 = await page.evaluate(() => window.__frame | 0);
  await page.waitForFunction((t) => (window.__frame | 0) >= t, f0 + n, { timeout, polling: 100 });
  return f0;
}

export function attribute(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const count = new Map();
  for (const s of profile.samples) count.set(s, (count.get(s) || 0) + 1);
  const total = profile.samples.length;
  const deltas = profile.timeDeltas.slice(1).sort((a, b) => a - b);
  const median = deltas[Math.floor(deltas.length / 2)] / 1000;
  const self = new Map(), inclusive = new Map(), byFile = new Map();
  const key = (n) => { const cf = n.callFrame; const f = (cf.url || '').replace(/^.*\/src\//, 'src/').replace(/\?.*$/, ''); return `${cf.functionName || '(anon)'} ${f}:${cf.lineNumber + 1}`; };
  for (const [id, c] of count) {
    const n = byId.get(id);
    const k = key(n);
    self.set(k, (self.get(k) || 0) + c);
    const f = (n.callFrame.url || n.callFrame.functionName).replace(/^.*\/src\//, 'src/').replace(/\?.*$/, '');
    byFile.set(f, (byFile.get(f) || 0) + c);
    const seen = new Set();
    let cur = id;
    while (cur != null) { const nk = key(byId.get(cur)); if (!seen.has(nk)) { seen.add(nk); inclusive.set(nk, (inclusive.get(nk) || 0) + c); } cur = parent.get(cur); }
  }
  return { total, median, self, inclusive, byFile };
}

async function runScene(browser, name) {
  const url = SCENES[name] + EXTRA;
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript(CENSUS);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_CERT/.test(m.text())) errors.push(m.text().slice(0, 300)); });
  const t0 = Date.now();
  await page.goto(`http://localhost:${PORT}${url}`);
  // Indoors the modal frame returns before __shotReady is set, so the mode and the stream decide readiness.
  await page.waitForFunction(() => window.__shotReady === true || (typeof window.__mode === 'function' && window.__mode() !== 'exterior' && typeof window.__streamIdle === 'function' && window.__streamIdle() && (window.__frame | 0) > 5), null, { timeout: 1200000, polling: 500 });
  const tReady = Date.now();
  console.log(`  [${name}] ready after ${((tReady - t0) / 1000).toFixed(0)}s`);
  if (TUNING) console.log(`  [${name}] tuning ${JSON.stringify(await page.evaluate((t) => { const T = window.__DF_SHADOW_TUNING; if (!T) throw new Error('no __DF_SHADOW_TUNING on the page'); Object.assign(T, t); return T; }, TUNING))}`);
  await settle(page);
  await waitFrames(page, 10);
  const r = await measure(ctx, page, { name, url, bootS: (tReady - t0) / 1000, errors });
  await ctx.close();
  return r;
}

export async function settle(page) {
  let lastCells = -1, stable = 0;
  for (let i = 0; i < 60 && stable < 2; i++) {
    await waitFrames(page, 5);
    const g = await page.evaluate(() => (window.__grassStats ? window.__grassStats().cells : -2));
    if (g === lastCells) stable++; else stable = 0;
    lastCells = g;
  }
}

export async function measure(ctx, page, { name, url, bootS, errors, extra = null }) {
  mkdirSync(OUT, { recursive: true });
  const cdp = await ctx.newCDPSession(page);
  try { return await windows(cdp, page, { name, url, bootS, errors, extra }); } finally { await cdp.detach().catch(() => {}); }
}
async function windows(cdp, page, { name, url, bootS, errors, extra }) {
  await page.evaluate(() => { window.__census.counts.clear(); window.__census.on = true; });
  const cf0 = await waitFrames(page, FRAMES);
  const census = await page.evaluate((f0) => { window.__census.on = false; const n = (window.__frame | 0) - f0; return { frames: n, counts: [...window.__census.counts.entries()] }; }, cf0);
  if (process.env.KEEP_CENSUS !== '1') await page.evaluate(() => window.__censusOff?.());
  await waitFrames(page, 3);
  console.log(`  [${name}] census done`);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await page.evaluate(() => { const S = globalThis.__shStats; if (S) { S.frames = 0; S.byKind = {}; S.records = 0; S.batches = 0; S.renderMs = 0; } });
  await cdp.send('Profiler.start');
  const pf0 = await waitFrames(page, FRAMES);
  const { profile } = await cdp.send('Profiler.stop');
  const shStats = await page.evaluate(() => globalThis.__shStats ? JSON.parse(JSON.stringify(globalThis.__shStats)) : null);
  const pframes = (await page.evaluate(() => window.__frame | 0)) - pf0;
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  const hf0 = await waitFrames(page, FRAMES);
  const { profile: heap } = await cdp.send('HeapProfiler.stopSampling');
  const hframes = (await page.evaluate(() => window.__frame | 0)) - hf0;
  const stats = await page.evaluate(() => (window.__fpsStats ? window.__fpsStats() : null));
  const grass = await page.evaluate(() => (window.__grassStats ? window.__grassStats() : null));
  const nodes = await page.evaluate(() => document.getElementsByTagName('*').length);
  const tag = name + (process.env.TAG ? '.' + process.env.TAG : '');
  writeFileSync(`${OUT}/${tag}.cpuprofile`, JSON.stringify(profile));
  writeFileSync(`${OUT}/${tag}.heapprofile`, JSON.stringify(heap));
  const a = attribute(profile);
  const heapSelf = new Map();
  const walk = (n) => { const cf = n.callFrame; const k = `${cf.functionName || '(anon)'} ${(cf.url || '').replace(/^.*\/src\//, 'src/').replace(/\?.*$/, '')}:${cf.lineNumber + 1}`; heapSelf.set(k, (heapSelf.get(k) || 0) + n.selfSize); for (const c of n.children || []) walk(c); };
  walk(heap.head);
  const res = {
    name, url, bootS, shStats, ...(extra ? { extra: await extra() } : {}), errors: errors.slice(0, 20), stats, grass: grass && { cells: grass.cells, slots: grass.slots, blades: grass.blades }, domNodes: nodes,
    census: { frames: census.frames, perFrame: Object.fromEntries(census.counts.map(([k, v]) => [k, +(v / census.frames).toFixed(2)]).sort((x, y) => y[1] - x[1])) },
    cpu: { frames: pframes, samples: a.total, medianIntervalMs: a.median, msPerFrameBySamples: (a.total * a.median) / pframes,
      self: [...a.self].sort((x, y) => y[1] - x[1]).slice(0, 60).map(([k, v]) => [k, +((v * a.median) / pframes).toFixed(3)]),
      inclusive: [...a.inclusive].sort((x, y) => y[1] - x[1]).slice(0, 120).map(([k, v]) => [k, +((v * a.median) / pframes).toFixed(3)]),
      byFile: [...a.byFile].sort((x, y) => y[1] - x[1]).slice(0, 40).map(([k, v]) => [k, +((v * a.median) / pframes).toFixed(3)]) },
    heap: { frames: hframes, bytesPerFrame: Math.round([...heapSelf.values()].reduce((s, v) => s + v, 0) / Math.max(1, hframes)),
      top: [...heapSelf].sort((x, y) => y[1] - x[1]).slice(0, 40).map(([k, v]) => [k, Math.round(v / Math.max(1, hframes))]) },
  };
  writeFileSync(`${OUT}/${tag}.json`, JSON.stringify(res, null, 1));
  return res;
}

export const summaryLine = (r) => `boot ${r.bootS}s, cpu ${r.cpu.msPerFrameBySamples.toFixed(2)} ms/frame (${r.cpu.samples} samples, ${r.cpu.frames} frames), gl calls/frame ${Object.entries(r.census.perFrame).filter(([k]) => k.startsWith('gl.')).reduce((s, [, v]) => s + v, 0).toFixed(0)}, draws ${(r.census.perFrame['gl.drawElements'] || 0) + (r.census.perFrame['gl.drawArrays'] || 0) + (r.census.perFrame['gl.drawArraysInstanced'] || 0) + (r.census.perFrame['gl.drawElementsInstanced'] || 0)}, heap ${r.heap.bytesPerFrame} B/frame, dom ${r.domNodes}, errors ${r.errors.length}`;
export const measured = (r) => r.cpu.frames > 0 && r.cpu.samples > 0 && r.census.frames > 0 && r.heap.frames > 0 && !r.errors.length;

export const SWIFTSHADER_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...(process.env.JSFLAGS ? [`--js-flags=${process.env.JSFLAGS}`] : [])];

if (isMain(import.meta.url)) {
  const names = process.argv.slice(2);
  if (!names.length || names.some((n) => !SCENES[n])) throw new Error(`frameProbe: name one or more scenes of ${Object.keys(SCENES).join(', ')}`);
  const server = await createServer({ root: ROOT, configFile: `${ROOT}/vite.config.js`, plugins: [probeTransforms()], server: { port: PORT, strictPort: true, hmr: false, watch: null }, logLevel: 'error' });
  await server.listen();
  const browser = await chromium.launch({ args: SWIFTSHADER_ARGS });
  const failed = [];
  try {
    for (const name of names) {
      const t = Date.now();
      try {
        const r = await runScene(browser, name);
        console.log(`== ${name}: ${summaryLine(r)} (${((Date.now() - t) / 1000).toFixed(0)}s)`);
        if (!measured(r)) failed.push(`${name} (${r.errors[0] ?? 'an empty window'})`);
      } catch (e) { failed.push(`${name} (${e.message})`); }
    }
  } finally { await browser.close(); await server.close(); }
  if (failed.length) throw new Error(`frameProbe: no measurement for ${failed.join('; ')}`);
}
