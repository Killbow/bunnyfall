#!/usr/bin/env node
// AI-ROOMS: FILM a walk through rooms in the real game. Like shots.mjs (same temporary patch: `git apply
// tools/aiRoom/shots.patch` first, `git checkout src/scenes/dungeon.js` after), but the camera walks each room's own
// route (first door -> the middle -> the second door, along the cell path the walk test uses) and every frame is kept,
// ready for ffmpeg. Frames land in <SHOTS_DIR>/<block name>/NNNN.jpg with the room's name stamped on them.
//   ARENA2_PATH=<arena2> SHOTS_DIR=/tmp/film node tools/aiRoom/film.mjs <roomOffset> "<Room Title>" ["<Room Title>" ...]
// The offset picks which 12 of the rooms the dungeon holds (0, 12, 24, 28 cover all forty between them).
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { allRooms } from './all.mjs';
import { parseLayer, SIDE, CELL, PORTS } from './shell.mjs';
import { passable, PROP_RADIUS } from './dsl.mjs';

const off = Number(process.argv[2] ?? 0), want = new Set(process.argv.slice(3)), dir = process.env.SHOTS_DIR ?? '/tmp/ai-room-film';
const STEP = Number(process.env.FILM_STEP ?? 0.4);   // metres a frame: a brisk walk at 10 frames a second is 4 m/s
const rooms = new Map(allRooms().map((r) => [r.blockName, r]));

function bfs(cells, from, blocked) {
  const key = (i, j) => j * SIDE + i, prev = new Map([[key(...from), null]]), order = [from], dist = new Map([[key(...from), 0]]);
  for (let q = 0; q < order.length; q++) {
    const [i, j] = order[q];
    for (const [si, sj] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const ni = i + si, nj = j + sj, d = cells[nj]?.[ni];
      if (d && !blocked.has(key(ni, nj)) && !prev.has(key(ni, nj)) && passable(cells[j][i], d, si, sj)) { prev.set(key(ni, nj), key(i, j)); dist.set(key(ni, nj), dist.get(key(i, j)) + 1); order.push([ni, nj]); }
    }
  }
  const to = (t) => { if (!prev.has(key(...t))) return null; const out = []; let k = key(...t); while (k != null) { out.push([k % SIDE, Math.floor(k / SIDE)]); k = prev.get(k); } return out.reverse(); };
  return { to, order };
}

/** The route as camera points [x, floorY, z] (block metres), a cell's middle each, then resampled every STEP metres. */
function route(spec) {
  spec.finish({ shellId: 1, index: 1, blockName: 'X.RDB', position: 1 });   // carves the ports into the grid
  const cells = parseLayer(spec.grid.map((r) => r.join('')), spec.legend), blocked = new Set();
  for (const p of spec.props) for (let j = 0; j < SIDE; j++) for (let i = 0; i < SIDE; i++) if (Math.hypot((i + 0.5 - p.x) * CELL, (j + 0.5 - p.z) * CELL) < (PROP_RADIUS[p.name] ?? 1)) blocked.add(j * SIDE + i);
  const portCell = (p) => { const c = PORTS[p[1]].at / CELL - 1; return p[0] === 'N' ? [c, 0] : p[0] === 'S' ? [c, SIDE - 1] : p[0] === 'W' ? [0, c] : [SIDE - 1, c]; };
  const ports = spec.ports.map(portCell), start = ports[0];
  const a = bfs(cells, start, blocked);
  // the middle: the reachable open cell nearest the block's centre that is not on a prop; the end: the farthest port
  let mid = a.order[0], best = 1e9;
  for (const [i, j] of a.order) { const d = Math.hypot(i - 15.5, j - 15.5); if (d < best) { best = d; mid = [i, j]; } }
  const end = ports.slice(1).sort((p, q) => Math.hypot(q[0] - start[0], q[1] - start[1]) - Math.hypot(p[0] - start[0], p[1] - start[1]))[0] ?? start;
  const b = bfs(cells, mid, blocked);
  const cellPath = [...a.to(mid), ...(b.to(end) ?? []).slice(1)];
  const pts = cellPath.map(([i, j]) => { const c = cells[j][i]; return [(i + 0.5) * CELL, (c.h[0] + c.h[1] + c.h[2] + c.h[3]) / 4, (j + 0.5) * CELL]; });
  // resample, then smooth the sideways wobble of a cell-by-cell path
  const out = [pts[0]];
  for (let k = 1; k < pts.length; k++) { const [x0, y0, z0] = out[out.length - 1], [x1, y1, z1] = pts[k], d = Math.hypot(x1 - x0, z1 - z0); const n = Math.max(1, Math.round(d / STEP)); for (let s = 1; s <= n; s++) out.push([x0 + ((x1 - x0) * s) / n, y0 + ((y1 - y0) * s) / n, z0 + ((z1 - z0) * s) / n]); }
  const sm = out.map((p, k) => { let x = 0, z = 0, n = 0; for (let d = -4; d <= 4; d++) { const q = out[Math.max(0, Math.min(out.length - 1, k + d))]; x += q[0]; z += q[2]; n++; } return [x / n, p[1], z / n]; });
  return sm;
}

mkdirSync(dir, { recursive: true });
const server = await createServer({ root: new URL('../..', import.meta.url).pathname, server: { port: Number(process.env.FILM_PORT ?? 5236), strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.FILM_W ?? 960), height: Number(process.env.FILM_H ?? 540) } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${process.env.FILM_PORT ?? 5236}/play/?shot&play&class=0&nofoes&region=Daggerfall&dungeon=${encodeURIComponent("Ruins of Old Carololda's Farm")}&aioff=${off}`);
await page.waitForFunction(() => window.__frame > 15 && window.__aiBlocks, null, { timeout: 180000 });
await page.evaluate(() => { document.getElementById('enhanced-chargen')?.remove(); document.getElementById('bf-tutorial-ask')?.remove(); const d = document.createElement('div'); d.id = 'film-title'; d.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:99999;font:600 22px Georgia,serif;color:#f4e6c1;text-shadow:0 2px 4px #000,0 0 8px #000;background:rgba(0,0,0,.35);padding:6px 12px;border-radius:6px'; document.body.appendChild(d); });
const blocks = await page.evaluate(() => window.__aiBlocks);
for (const b of blocks) {
  const r = rooms.get(b.name);
  if (!r || (want.size && !want.has(r.spec.name))) continue;
  const pts = route(r.spec), folder = `${dir}/${b.name}`;
  mkdirSync(folder, { recursive: true });
  await page.evaluate(([t]) => { document.getElementById('film-title').textContent = t; }, [`${r.spec.name}  -  ${b.name}`]);
  let yaw = null;
  for (let k = 0; k < pts.length; k++) {
    const ahead = pts[Math.min(pts.length - 1, k + 9)], [x, y, z] = pts[k];
    let want_ = Math.atan2(ahead[0] - x, ahead[2] - z);
    if (Math.hypot(ahead[0] - x, ahead[2] - z) < 0.2) want_ = yaw ?? 0;
    if (yaw == null) yaw = want_; else { let d = want_ - yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; yaw += d * 0.22; }
    await page.evaluate(([px, py, pz, yw]) => window.__pose(px, py, pz, yw, -0.06), [b.x * 51.2 + x, y + 1.6, b.z * 51.2 + z, yaw]);
    const t0 = Date.now(), f = await page.evaluate(() => window.__frame);
    await page.waitForFunction((f0) => window.__frame > f0 + 1, f, { timeout: 60000, polling: 'raf' });
    const t1 = Date.now();
    await page.screenshot({ path: `${folder}/${String(k).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 82 });
    if (process.env.FILM_TIMING && k < 6) console.log(`frame ${k}: wait ${t1 - t0} ms, screenshot ${Date.now() - t1} ms`);
  }
  console.log(`${b.name} ${r.spec.name}: ${pts.length} frames`);
}
await browser.close(); await server.close();
