// Boots the streaming world on SwiftShader at a one-square view radius and photographs a grass field.
// Run: ARENA2_PATH=... Q='shot&world&class=0' EVAL='...' node tools/grassLookProbe.mjs out.png
// Env: Q, PREFS, EVAL, KEYS, VARIANTS, UNTIL, W, H, PORT (5201), DEBUG. Write renders outside the tree.
import { createServer } from 'vite';
import { chromium } from 'playwright';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const out = process.argv[2];
if (!out) { console.error('usage: node tools/grassLookProbe.mjs out.png'); process.exit(2); }
const port = Number(process.env.PORT || 5201);
// __pose turns the view but leaves the eye at the pixel's origin corner, so photograph what is in view of it.
const query = process.env.Q || 'shot&world&class=0&season=summer&tod=12:00&weather=sunny';
const prefs = JSON.parse(process.env.PREFS || '{}');
const server = await createServer({ root: process.cwd(), configFile: process.cwd() + '/vite.config.js', server: { port, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W || 960), height: Number(process.env.H || 600) } });
const pageErrors = [];
page.on('pageerror', (e) => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
page.on('console', (m) => { const t = m.text(); if ((process.env.DEBUG || m.type() === 'error' || m.type() === 'warning' || /grass|spot/i.test(t)) && !/404|cursor|CERT|GL Driver/.test(t)) console.log(`[page:${m.type()}]`, t.slice(0, 400)); });
await page.addInitScript((p) => {
  localStorage.setItem('dagger.ui.v1', JSON.stringify({ landViewDistance: 1, ...p }));
  localStorage.setItem('dagger.settings.v1', JSON.stringify({ Experimental: { TerrainDistance: '1' } }));
}, prefs);
const frames = async (n) => { const f = await page.evaluate(() => window.__frame); await page.waitForFunction(([f0, k]) => window.__frame >= f0 + k, [f, n], { timeout: 600000, polling: 1000 }); };
const fail = (why) => { console.error('FAIL', why); process.exitCode = 1; };
const t0 = Date.now();
await page.goto(`http://localhost:${port}/play/?${query}`);
await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 900000, polling: 2000 });
console.log('ready in', ((Date.now() - t0) / 1000).toFixed(0), 's');
let posed = null;
if (process.env.EVAL) {
  posed = await page.evaluate(process.env.EVAL);
  console.log('eval ->', JSON.stringify(posed));
  await page.waitForFunction(() => !window.__streamIdle || window.__streamIdle() === true, null, { timeout: 900000, polling: 2000 });
  await frames(4);
}
for (const k of (process.env.KEYS || 'Enter,n,n').split(',').filter(Boolean)) { await page.keyboard.press(k); await page.waitForTimeout(700); }
await frames(3);
if (process.env.UNTIL) { await page.waitForFunction(process.env.UNTIL, null, { timeout: 1800000, polling: 5000 }); await frames(3); }
const variants = process.env.VARIANTS ? JSON.parse(process.env.VARIANTS) : null;
if (!variants) { await page.screenshot({ path: out, timeout: 300000 }); console.log('shot', out); }
else for (const v of variants) {
  await page.evaluate((x) => { if (x.tones !== undefined) window.__grassTones?.(x.tones, x.classic); if (x.eval) (0, eval)(x.eval); }, { ...v, classic: v.classic ?? prefs.enhancedLighting === false });
  await frames(3);
  const file = out.replace(/\.png$/, `_${v.name}.png`);
  await page.screenshot({ path: file, timeout: 300000 }); console.log('shot', file);
}
const grass = await page.evaluate(() => window.__grassStats?.() ?? null);
console.log('grass ->', JSON.stringify(grass && { blades: grass.blades, drawn: grass.drawn?.blades, cells: grass.cells, floor: grass.floor?.drawn?.blades }));
if (pageErrors.length) fail(`${pageErrors.length} page error(s): ${pageErrors[0]}`);
if (process.env.EVAL && posed == null) fail('no field to stand on (EVAL answered nothing)');
if (process.env.EVAL && !((grass?.drawn?.blades ?? 0) + (grass?.floor?.drawn?.blades ?? 0) > 0)) fail('the grass drew no blades');
await browser.close(); await server.close();
