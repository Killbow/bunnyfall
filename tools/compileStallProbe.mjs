// Times every shader link wait in a booting scene, split at the first world frame.
// Run: ARENA2_PATH=/path/to/arena2 node tools/compileStallProbe.mjs <scene> | passes.
// Env: TREE, SECONDS, PARALLEL, PORT, and PROFILE.

import { createServer } from 'vite';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { isMain } from './lib/isMain.mjs';
import { SCENES, SWIFTSHADER_ARGS } from './frameProbe.mjs';
import { FIRST_FRAME_MARK, longTasks } from './bootFreezeProbe.mjs';
import { writeFileSync } from 'node:fs';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const ROOT = process.env.TREE || fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT || 5245);
const SECONDS = Number(process.env.SECONDS || 60);
const PROFILE = process.env.PROFILE || null;
const W = Number(process.env.W || 480), H = Number(process.env.H || 270);
export const PARALLEL_ARGS = ['--enable-angle-features=enableParallelCompileAndLink'];

export const GL_WAITS = `(() => {
  const P = WebGL2RenderingContext.prototype;
  const waits = window.__glWaits = [];
  const asked = new WeakSet();
  const siteOf = () => {
    const at = [];
    for (const l of String(new Error().stack).split('\\n').slice(3)) {
      const m = l.match(/at (?:new )?([^ ]+) \\(.*?\\/(src\\/[^?:)]+)[^:)]*:(\\d+)/) || l.match(/at .*?\\/(src\\/[^?:)]+)[^:)]*:(\\d+)/);
      if (!m) continue;
      const [fn, file, line] = m.length === 4 ? [m[1], m[2], m[3]] : ['(anon)', m[1], m[2]];
      if (/glProgram\\.js$/.test(file)) continue;
      at.push(fn + ' ' + file + ':' + line);
      if (at.length === 2) break;   // the pass's own frame, and who asked it - a renderer's _buildProgram names its caller
    }
    return at.join(' < ') || '?';
  };
  const timed = (name, asks) => {
    const f = P[name];
    P[name] = function (...a) {
      if (!asks(this, a)) return f.apply(this, a);
      const t = performance.now();
      const r = f.apply(this, a);
      waits.push({ at: t, kind: name === 'getProgramParameter' ? (a[1] === this.LINK_STATUS ? 'link' : 'done?') : 'uniforms', ms: performance.now() - t, site: siteOf() });
      return r;
    };
  };
  timed('getProgramParameter', (gl, a) => a[1] === gl.LINK_STATUS || a[1] === 0x91B1);
  timed('getUniformLocation', (gl, a) => { if (asked.has(a[0])) return false; asked.add(a[0]); return true; });
})();`;

export function waitsBySite(waits, firstAt) {
  const rows = new Map();
  for (const w of waits) {
    const when = firstAt != null && w.at >= firstAt ? 'after' : 'before';
    const k = `${when}\t${w.kind}\t${w.site}`;
    const r = rows.get(k) ?? { when, kind: w.kind, site: w.site, n: 0, ms: 0, worst: 0 };
    r.n++; r.ms += w.ms; r.worst = Math.max(r.worst, w.ms);
    rows.set(k, r);
  }
  const all = [...rows.values()].sort((a, b) => b.ms - a.ms);
  const sum = (when) => all.filter((r) => r.when === when).reduce((s, r) => s + r.ms, 0);
  return { rows: all, beforeMs: sum('before'), afterMs: sum('after') };
}

async function runScene(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript(FIRST_FRAME_MARK);
  await ctx.addInitScript(GL_WAITS);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cdp = PROFILE ? await ctx.newCDPSession(page) : null;
  if (cdp) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
  const t0 = Date.now();
  await page.goto(`http://localhost:${PORT}${SCENES[name]}`);
  await page.waitForFunction(() => (window.__frame | 0) > 0, null, { timeout: 1200000, polling: 250 });
  console.log(`  [${name}] first world frame after ${((Date.now() - t0) / 1000).toFixed(0)}s; ${SECONDS}s more`);
  await new Promise((r) => setTimeout(r, SECONDS * 1000));
  const got = await page.evaluate(() => ({ waits: window.__glWaits, first: window.__bootFreezeFrames[0] ?? null, frames: window.__frame | 0,
    ext: !!document.createElement('canvas').getContext('webgl2')?.getExtension('KHR_parallel_shader_compile') }));
  const profile = cdp ? (await cdp.send('Profiler.stop')).profile : null;
  if (profile) writeFileSync(PROFILE, JSON.stringify(profile));
  await ctx.close();
  return { name, errors, ...got, ...waitsBySite(got.waits, got.first), tasks: profile ? longTasks(profile).long.filter((k) => k.fromFirstMs >= 0) : null };
}

const PASSES = `async (started) => {
  const { startPrograms } = await import('/src/render/glProgram.js');
  if (started && !startPrograms) return { none: 'this tree has no startPrograms' };
  const out = {};
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const build = async (name, programsOf, make) => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const from = window.__glWaits.length, t = performance.now();
    let frames = 0;
    if (started) { const ready = startPrograms(gl, programsOf()); while (!ready()) { frames++; await frame(); } }
    make(gl);
    const waits = window.__glWaits.slice(from);
    out[name] = { waitMs: +waits.reduce((s, w) => s + w.ms, 0).toFixed(1), worstMs: +Math.max(0, ...waits.map((w) => w.ms)).toFixed(1), frames, wallMs: +(performance.now() - t).toFixed(0) };
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
  const gp = await import('/src/render/gatePass.js'), gm = await import('/src/world/gateModel.js');
  const gt = await import('/src/render/gateTelegraph.js'), gf = await import('/src/render/gateFx.js');
  const gv = await import('/src/render/gateVeil.js'), no = await import('/src/render/nodeGlint.js');
  const profile = gm.gateArchProfile(gm.buildGateModel());
  await build('gate fire', () => gp.GATE_PASS_PROGRAMS, (gl) => new gp.GatePassRenderer(gl, profile));
  await build('gate telegraph', () => gt.telegraphPrograms(false), (gl) => new gt.GateTelegraphRenderer(gl));
  await build('spire telegraph', () => gt.telegraphPrograms(true), (gl) => new gt.GateTelegraphRenderer(gl, { spire: true }));
  await build('gate blows', () => gf.GATE_FX_PROGRAMS, (gl) => new gf.GateFxRenderer(gl));
  await build('gate veil', () => gv.GATE_VEIL_PROGRAMS, (gl) => new gv.GateVeilRenderer(gl));
  await build('node glint', () => no.NODE_GLINT_PROGRAMS, (gl) => new no.NodeGlintRenderer(gl));
  return out;
}`;

async function runPasses(browser) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript(GL_WAITS);
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/src/render/glProgram.js`);
  const r = {};
  for (const started of [false, true]) r[started ? 'started' : 'new'] = await page.evaluate(`(${PASSES})(${started})`);
  r.ext = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2')?.getExtension('KHR_parallel_shader_compile'));
  await ctx.close();
  return r;
}

if (isMain(import.meta.url)) {
  const names = process.argv.slice(2);
  if (!names.length || names.some((n) => n !== 'passes' && !SCENES[n])) throw new Error(`compileStallProbe: name passes, or scenes of ${Object.keys(SCENES).join(', ')}`);
  const server = await createServer({ root: ROOT, configFile: `${ROOT}/vite.config.js`, server: { port: PORT, strictPort: true, hmr: false, watch: null }, logLevel: 'error' });
  await server.listen();
  const browser = await chromium.launch({ args: [...SWIFTSHADER_ARGS, ...(process.env.PARALLEL === '0' ? [] : PARALLEL_ARGS)] });
  const failed = [];
  try {
    for (const name of names) {
      if (name === 'passes') {
        const r = await runPasses(browser);
        console.log(`== passes (KHR_parallel_shader_compile ${r.ext ? 'on' : 'off'})`);
        for (const [arm, rows] of Object.entries(r)) {
          if (arm === 'ext') continue;
          if (rows.none) { console.log(`  ${arm}: ${rows.none}`); continue; }
          for (const [pass, x] of Object.entries(rows)) console.log(`  ${arm.padEnd(7)} ${pass.padEnd(16)} the main thread waited ${String(x.waitMs).padStart(8)} ms (worst ${x.worstMs}), ${x.frames} frames polled, ${x.wallMs} ms to built`);
        }
        continue;
      }
      const r = await runScene(browser, name);
      console.log(`== ${name} (KHR_parallel_shader_compile ${r.ext ? 'on' : 'off'}): ${r.frames} frames; the main thread waited on programs ${r.beforeMs.toFixed(0)} ms before the first world frame, ${r.afterMs.toFixed(0)} ms after; errors ${r.errors.length}`);
      for (const k of r.tasks ?? []) console.log(`  task ${k.fromFirstMs} ms after the first frame: ${k.ms} ms - ${k.self.slice(0, 4).map(([f, ms]) => `${f} ${ms}`).join('; ')}`);
      for (const x of r.rows.filter((x) => x.ms >= 5)) console.log(`  ${x.when.padEnd(6)} ${x.kind.padEnd(8)} ${x.ms.toFixed(0).padStart(7)} ms in ${String(x.n).padStart(3)} (worst ${x.worst.toFixed(0)})  ${x.site}`);
      const why = r.first == null ? 'no world frame' : r.errors[0] ?? null;
      if (why) failed.push(`${name} (${why})`);
    }
  } finally { await browser.close(); await server.close(); }
  if (failed.length) throw new Error(`compileStallProbe: no measurement for ${failed.join('; ')}`);
}
