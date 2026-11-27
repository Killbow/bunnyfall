// Boots the game and logs the FPS counter's numbers for a city, the open road, a dungeon, and the jungle.
// Usage: ARENA2_PATH=<dir> npm run perf. Other settings come from environment variables.
// Headless runs use software GL, so their numbers are only relative; HEADED=1 uses the machine's GPU.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { appendFileSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT || 5237);
const SECONDS = Math.max(3, Number(process.env.SECONDS || 8));
const HEADED = process.env.HEADED === '1';
const WANT = (process.env.SCENES || 'city,road,dungeon').split(',').map((s) => s.trim()).filter(Boolean);
const GROUND = process.env.GROUND ? `&ground=${encodeURIComponent(process.env.GROUND)}` : '';
const TREES = process.env.TREES === 'off' ? '&trees=off' : '';
const JUNGLE = process.env.JUNGLE === 'off' ? '&jungle=off' : '';

const SCENES = {
  city: `/play/?world&region=Daggerfall&loc=Daggerfall&class=1&novideo&shot&fps`,
  road: `/play/?world&spawn=random&class=1&novideo&shot&fps`,
  dungeon: `/play/?shot&class=0&fps`,
  jungle: `/play/?world&region=Satakalaam&loc=${encodeURIComponent(process.env.LOC || 'Satakalaam')}&class=1&novideo&shot&fps`,
};

const server = await createServer({ root: ROOT, server: { port: PORT, strictPort: true, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch(HEADED
  ? { headless: false }
  : { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const rows = [];
for (const name of WANT) {
  const url = SCENES[name] && `${SCENES[name]}${TREES}${JUNGLE}`;
  if (!url) { console.warn(`perf: no scene "${name}"`); continue; }
  await page.goto(`http://localhost:${PORT}${url}${GROUND}`);
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 300000 });
  // The first second after settling is the stream's tail, so it is not sampled.
  await page.waitForTimeout(1000);
  const samples = [];
  for (let s = 0; s < SECONDS; s++) {
    await page.waitForTimeout(1000);
    const st = await page.evaluate(() => (window.__fpsStats ? window.__fpsStats() : null));
    if (st) samples.push(st);
  }
  const mean = (k) => { const v = samples.map((s) => s[k]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const worst = (k) => { const v = samples.map((s) => s[k]).filter((x) => x != null); return v.length ? Math.max(...v) : null; };
  const row = {
    scene: name, gpu: HEADED ? 'machine' : 'swiftshader', seconds: samples.length,
    fps: mean('fps'), frameMs: mean('meanMs'), frameWorstMs: worst('worstMs'),
    scriptMs: mean('scriptMs'), scriptWorstMs: worst('scriptWorstMs'),
    draws: mean('draws'), binds: mean('binds'),
    errors: errors.splice(0).length,
  };
  rows.push(row);
  const f = (x, d = 1) => (x == null ? '-' : Number(x).toFixed(d));
  console.log(`${name.padEnd(8)} ${f(row.fps, 0).padStart(4)} fps  frame ${f(row.frameMs)} ms (worst ${f(row.frameWorstMs, 0)})  script ${f(row.scriptMs)} ms (worst ${f(row.scriptWorstMs, 0)})  draws ${f(row.draws, 0)}  binds ${f(row.binds, 0)}${row.errors ? `  errors ${row.errors}` : ''}`);
}
if (process.env.OUT) appendFileSync(process.env.OUT, rows.map((r) => JSON.stringify({ at: new Date().toISOString(), ...r })).join('\n') + '\n');
await browser.close();
await server.close();
const bad = rows.filter((r) => !r.seconds || r.errors || !(r.fps > 0)).map((r) => r.scene);
if (bad.length || rows.length !== WANT.length) throw new Error(`perf: no measurement for ${bad.join(', ') || 'a scene'}`);
