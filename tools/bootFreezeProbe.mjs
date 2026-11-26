// Boots a scene under one CPU profile and ranks the main thread's long tasks around the first world frame.
// Run: ARENA2_PATH=/path/to/arena2 node tools/bootFreezeProbe.mjs <scene> (env: TREE, TAG, OUT, FRAMES, PORT).

import { createServer } from 'vite';
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isMain } from './lib/isMain.mjs';
import { SCENES, SWIFTSHADER_ARGS } from './frameProbe.mjs';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const ROOT = process.env.TREE || fileURLToPath(new URL('..', import.meta.url));
const OUT = process.env.OUT || join(tmpdir(), 'bootFreeze');
const PORT = Number(process.env.PORT || 5243);
const FRAMES = Number(process.env.FRAMES || 20);
const MAX_S = Number(process.env.MAX_S || 600);
const MIN_TASK_MS = Number(process.env.MIN_TASK_MS || 50);
const IDLE_GAP_MS = Number(process.env.IDLE_GAP_MS || 4);
const TOP = Number(process.env.TOP || 12);
const W = Number(process.env.W || 480), H = Number(process.env.H || 270);

export const FIRST_FRAME_MARK = `(() => {
  let f;
  const at = window.__bootFreezeFrames = [];
  function __bootFreezeFirstFrame() { const t = performance.now(); while (performance.now() - t < 3); }
  Object.defineProperty(window, '__frame', { configurable: true, get: () => f,
    set: (x) => { if (!(f > 0) && x > 0) __bootFreezeFirstFrame(); if (x > 0) at.push(performance.now()); f = x; } });
})();`;

const GENERIC = new Set(['(root)', '(program)', '(idle)', '(garbage collector)']);

/** @param {{ nodes: any[], samples: number[], timeDeltas: number[], startTime: number }} profile */
export function longTasks(profile, { minTaskMs = MIN_TASK_MS, idleGapMs = IDLE_GAP_MS, top = TOP } = {}) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const keyOf = (n) => { const cf = n.callFrame; const f = (cf.url || '').replace(/^.*?\/(src|tools|vendor|node_modules)\//, '$1/').replace(/\?.*$/, ''); return f ? `${cf.functionName || '(anon)'} ${f}:${cf.lineNumber + 1}` : (cf.functionName || '(anon)'); };
  const ts = [];
  let t = profile.startTime;
  for (let i = 0; i < profile.samples.length; i++) { t += profile.timeDeltas[i] ?? 0; ts.push(t); }
  const dt = (i) => Math.max(0, ((ts[i + 1] ?? ts[i]) - ts[i]) / 1000);
  let firstAt = null;
  const tasks = [];
  let cur = null;
  for (let i = 0; i < profile.samples.length; i++) {
    const n = byId.get(profile.samples[i]);
    const fn = n.callFrame.functionName;
    if (firstAt === null) for (let c = n.id; c != null; c = parent.get(c)) if (byId.get(c).callFrame.functionName === '__bootFreezeFirstFrame') { firstAt = ts[i]; break; }
    if (fn === '(idle)') continue;
    if (!cur || (ts[i] - cur.end) / 1000 > idleGapMs) { cur = { start: ts[i], end: ts[i], idx: [] }; tasks.push(cur); }
    cur.end = ts[i] + dt(i) * 1000;
    cur.idx.push(i);
  }
  const t0 = profile.startTime;
  const attribute = (idx) => {
    const incl = new Map(), self = new Map();
    let ms = 0;
    for (const i of idx) {
      const w = dt(i);
      ms += w;
      const n = byId.get(profile.samples[i]);
      const sk = keyOf(n);
      self.set(sk, (self.get(sk) || 0) + w);
      const seen = new Set();
      for (let c = n.id; c != null; c = parent.get(c)) {
        const k = keyOf(byId.get(c));
        if (GENERIC.has(k) || seen.has(k)) continue;
        seen.add(k);
        incl.set(k, (incl.get(k) || 0) + w);
      }
    }
    const rank = (m) => [...m].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, v]) => [k, +v.toFixed(1)]);
    return { busyMs: +ms.toFixed(1), inclusive: rank(incl), self: rank(self) };
  };
  const long = tasks.filter((k) => (k.end - k.start) / 1000 >= minTaskMs).map((k) => ({
    atMs: +((k.start - t0) / 1000).toFixed(0),
    fromFirstMs: firstAt === null ? null : +((k.start - firstAt) / 1000).toFixed(0),
    ms: +((k.end - k.start) / 1000).toFixed(1),
    ...attribute(k.idx),
  }));
  const phase = (pred) => attribute(profile.samples.map((_, i) => i).filter((i) => byId.get(profile.samples[i]).callFrame.functionName !== '(idle)' && pred(ts[i])));
  return {
    firstFrameAtMs: firstAt === null ? null : +((firstAt - t0) / 1000).toFixed(0),
    long,
    boot: phase((x) => firstAt === null || x < firstAt),
    afterFirst: firstAt === null ? null : phase((x) => x >= firstAt),
    frozenAfterFirstMs: firstAt === null ? null : +long.filter((k) => k.fromFirstMs >= 0).reduce((s, k) => s + k.ms, 0).toFixed(0),
  };
}

async function runScene(browser, name) {
  const url = SCENES[name] + (process.env.EXTRA || '');
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript(FIRST_FRAME_MARK);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
  await cdp.send('Profiler.start');
  const t0 = Date.now();
  await page.goto(`http://localhost:${PORT}${url}`);
  await page.waitForFunction(() => (window.__frame | 0) > 0, null, { timeout: 1200000, polling: 250 });
  const bootS = (Date.now() - t0) / 1000;
  console.log(`  [${name}] first world frame after ${bootS.toFixed(0)}s`);
  const t1 = Date.now();
  let idleFrom = null, last = -1;
  for (;;) {
    const s = await page.evaluate(() => ({ f: window.__frame | 0, idle: typeof window.__streamIdle === 'function' ? window.__streamIdle() : true }));
    if (s.f !== last && (s.f % 10 === 0 || !idleFrom)) console.log(`  [${name}] +${((Date.now() - t1) / 1000).toFixed(0)}s frame ${s.f}${s.idle ? ' (stream idle)' : ''}`);
    last = s.f;
    if (!s.idle) idleFrom = null; else idleFrom ??= s.f;
    if ((idleFrom !== null && s.f - idleFrom >= FRAMES) || Date.now() - t1 > MAX_S * 1000) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  const frameTimes = await page.evaluate(() => window.__bootFreezeFrames.slice());
  const { profile } = await cdp.send('Profiler.stop');
  await cdp.detach().catch(() => {});
  await ctx.close();
  mkdirSync(OUT, { recursive: true });
  const tag = name + (process.env.TAG ? '.' + process.env.TAG : '');
  writeFileSync(`${OUT}/${tag}.cpuprofile`, JSON.stringify(profile));
  const gaps = frameTimes.slice(1).map((t, i) => +(t - frameTimes[i]).toFixed(1));
  const r = { name, url, bootS, frames: frameTimes.length, frameGapsMs: gaps, errors: errors.slice(0, 20), ...longTasks(profile) };
  writeFileSync(`${OUT}/${tag}.json`, JSON.stringify(r, null, 1));
  return r;
}

if (isMain(import.meta.url)) {
  const names = process.argv.slice(2);
  if (!names.length || names.some((n) => !SCENES[n])) throw new Error(`bootFreezeProbe: name one or more scenes of ${Object.keys(SCENES).join(', ')}`);
  const server = await createServer({ root: ROOT, configFile: `${ROOT}/vite.config.js`, server: { port: PORT, strictPort: true, hmr: false, watch: null }, logLevel: 'error' });
  await server.listen();
  const browser = await chromium.launch({ args: SWIFTSHADER_ARGS });
  const failed = [];
  try {
    for (const name of names) {
      const r = await runScene(browser, name);
      console.log(`== ${name}: first frame at ${r.firstFrameAtMs} ms of the profile, ${r.frames} frames, frozen after it ${r.frozenAfterFirstMs} ms in ${r.long.filter((k) => k.fromFirstMs >= 0).length} long tasks, errors ${r.errors.length}`);
      for (const k of r.long) {
        console.log(`  task at ${k.atMs} ms (${k.fromFirstMs ?? '?'} from the first frame): ${k.ms} ms, busy ${k.busyMs}`);
        for (const [f, ms] of k.inclusive.slice(0, TOP)) console.log(`      ${String(ms).padStart(8)}  ${f}`);
      }
      const why = r.firstFrameAtMs === null ? 'the first world frame is not in the profile' : r.errors[0] ?? null;
      if (why) failed.push(`${name} (${why})`);
    }
  } finally { await browser.close(); await server.close(); }
  if (failed.length) throw new Error(`bootFreezeProbe: no measurement for ${failed.join('; ')}`);
}
