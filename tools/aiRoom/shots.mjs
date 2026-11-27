#!/usr/bin/env node
// AI-ROOMS: LOOK at the rooms in the real game. Lays them into a real dungeon in the standalone dungeon scene, flies the
// camera into each and screenshots it. The scene needs a small TEMPORARY patch (never commit it):
//   git apply tools/aiRoom/shots.patch      ... run this ... then      git checkout src/scenes/dungeon.js
// The patch swaps every ordinary block of the dungeon for the next room (from `aioff`), exposes window.__aiBlocks, and
// skips the chargen wizard. Needs ARENA2_PATH, and a browser: PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium by default.
//   ARENA2_PATH=<arena2> SHOTS_DIR=/tmp/shots node tools/aiRoom/shots.mjs [roomOffset=0] [viewsPerRoom=2]
// Run it with offset 0 and 12 to see all twenty. Screenshots show Daggerfall's art: keep them out of the repo.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { allRooms } from './all.mjs';

const off = Number(process.argv[2] ?? 0), views = Number(process.argv[3] ?? 2), dir = process.env.SHOTS_DIR ?? '/tmp/ai-room-shots';
mkdirSync(dir, { recursive: true });
const specs = new Map(allRooms().map((r) => [r.blockName, r.spec]));
const server = await createServer({ root: new URL('../..', import.meta.url).pathname, server: { port: 5232, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:5232/play/?shot&play&class=0&nofoes&region=Daggerfall&dungeon=${encodeURIComponent("Ruins of Old Carololda's Farm")}&aioff=${off}`);
await page.waitForFunction(() => window.__frame > 15 && window.__aiBlocks, null, { timeout: 180000 });
await page.evaluate(() => { document.getElementById('enhanced-chargen')?.remove(); document.getElementById('bf-tutorial-ask')?.remove(); });
const blocks = await page.evaluate(() => window.__aiBlocks);
for (const b of blocks) {
  const spec = specs.get(b.name);
  let best = null;   // the open cell nearest the block's middle
  for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) { const f = spec.floorAt(i, j); if (f == null) continue; const d = Math.hypot(i - 15.5, j - 15.5); if (!best || d < best.d) best = { i, j, f, d }; }
  for (let v = 0; v < views; v++) {
    await page.evaluate(([x, y, z, yaw]) => window.__pose(x, y, z, yaw, -0.12), [b.x * 51.2 + (best.i + 0.5) * 1.6, best.f + 1.6, b.z * 51.2 + (best.j + 0.5) * 1.6, v * Math.PI * 0.5 + 0.4]);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${dir}/${b.name}-${v}.png` });
  }
  console.log(`${b.name} ${spec.name}`);
}
await browser.close(); await server.close();
