// Boots the streaming world and takes one screenshot per SHOTS entry. Renders of game data stay outside the tree.
// Usage: `ARENA2_PATH=<dir> SHOTS=<json> node tools/waterLookProbe.mjs <dir>`
// Env: SHOTS (a JSON array of {name, eval?, frames?}), Q, PREFS, SETUP, KEYS (default Enter,n,n), W, H, and PORT.

import { createServer } from 'vite';
import { chromium } from 'playwright';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const out = process.argv[2];
if (!out) { console.error('usage: node tools/waterLookProbe.mjs out-prefix'); process.exit(2); }
const port = Number(process.env.PORT || 5202);
const query = process.env.Q || 'shot&world&class=0&season=summer&tod=12:00&weather=sunny';
const prefs = JSON.parse(process.env.PREFS || '{}');
const shots = JSON.parse(process.env.SHOTS || '[{"name":"view"}]');
const server = await createServer({ root: process.cwd(), configFile: process.cwd() + '/vite.config.js', server: { port, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W || 960), height: Number(process.env.H || 600) } });
const faults = [];
page.on('pageerror', (e) => { faults.push(e.message); console.log('[pageerror]', e.message); });
page.on('console', (m) => {
  const t = m.text();
  if (/shader|compile|link|GL_INVALID|INVALID_OPERATION|water/i.test(t) && (m.type() === 'error' || m.type() === 'warning')) { faults.push(t); console.log(`[page:${m.type()}]`, t.slice(0, 600)); }
});
await page.addInitScript((p) => {
  localStorage.setItem('dagger.ui.v1', JSON.stringify({ landViewDistance: 1, ...p }));
  localStorage.setItem('dagger.settings.v1', JSON.stringify({ Experimental: { TerrainDistance: '1' } }));
}, prefs);
const frames = async (n) => { const f = await page.evaluate(() => window.__frame); await page.waitForFunction(([f0, k]) => window.__frame >= f0 + k, [f, n], { timeout: 600000, polling: 1000 }); };
const idle = () => page.waitForFunction(() => !window.__streamIdle || window.__streamIdle() === true, null, { timeout: 900000, polling: 2000 });
const t0 = Date.now();
await page.goto(`http://localhost:${port}/play/?${query}`);
await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 900000, polling: 2000 });
console.log('ready in', ((Date.now() - t0) / 1000).toFixed(0), 's');
for (const k of (process.env.KEYS || 'Enter,n,n').split(',').filter(Boolean)) { await page.keyboard.press(k); await page.waitForTimeout(700); }
if (process.env.SETUP) console.log('setup ->', JSON.stringify(await page.evaluate(process.env.SETUP)));
await idle();
await frames(4);
for (const s of shots) {
  if (s.eval) console.log(s.name, '->', JSON.stringify(await page.evaluate(s.eval)));
  await frames(s.frames ?? 3);
  const file = `${out}_${s.name}.png`;
  await page.screenshot({ path: file, timeout: 300000 });
  console.log('shot', file);
}
if (faults.length) { console.error('FAIL', faults.length, 'fault(s):', faults[0].slice(0, 400)); process.exitCode = 1; }
await browser.close(); await server.close();
