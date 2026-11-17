// Real-engine smoke test. Supply licensed game data with ARENA2_PATH.
// Optional: --output <absolute PNG path>. No backend or account is required.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

if (!process.env.ARENA2_PATH) throw Error('Set ARENA2_PATH to your Daggerfall ARENA2 directory.');
const root = fileURLToPath(new URL('../', import.meta.url));
const outputIndex = process.argv.indexOf('--output');
const output = outputIndex < 0 ? null : process.argv[outputIndex + 1];
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const url = new URL('play/', server.resolvedUrls.local[0]);
  for (const [key, value] of Object.entries({ world: '', play: '', shot: '', class: '16', region: 'Wrothgarian Mountains', loc: 'Cromwark Hamlet', tod: '12:00', season: 'summer', timescale: '0', weather: 'clear', biomeprecip: 'off', nofoes: '', novideo: '' })) url.searchParams.set(key, value);
  await page.goto(url.href);
  await page.locator('#np-first').waitFor({ state: 'visible', timeout: 180000 });
  await page.locator('#np-first').fill('Aster');
  await page.locator('#np-last').fill('Scout');
  await page.locator('#bf-name-picker button').click();
  await page.waitForFunction(() => window.__cromwarkBarrierState?.().boot && window.__frame > 6, null, { timeout: 180000 });
  const before = await page.evaluate(() => {
    window.__arenaCloseOverlays?.();
    const seal = window.__cromwarkBarrier();
    const height = seal.y - window.__pixelT(823, 35)[1];
    window.__pose(seal.x, seal.y + 2, seal.z, 0, 0);
    return { seal, height };
  });
  await page.waitForFunction(() => {
    const s = window.__cromwarkBarrierState();
    return s.pixel.x === 823 && s.pixel.y === 36 && !s.pending;
  }, null, { timeout: 180000 });
  await page.evaluate(() => window.__look(0, .12));
  const frame = await page.evaluate(() => window.__frame);
  await page.waitForFunction(n => window.__frame > n + 2, frame, { timeout: 120000 });
  const result = await page.evaluate(() => ({
    state: window.__cromwarkBarrierState(), standing: JSON.parse(window.__standing()),
    seal: window.__cromwarkBarrier(), height: window.__cromwarkBarrier().y - window.__pixelT(823, 35)[1],
  }));
  assert.equal(result.state.walkMode, true);
  assert.equal(result.state.playerSpawned, true);
  assert.equal(result.state.mode, 'exterior');
  assert.ok(Math.abs(result.standing.y - result.standing.ground) < .2, 'Relocation must land on actual terrain.');
  assert.ok(Math.abs(result.height - before.height) < .001, 'Dome height must survive unloading/rebasing the city.');
  assert.ok(Math.hypot(result.state.feet[0] - result.seal.x, result.state.feet[2] - result.seal.z) > result.seal.radius);
  assert.deepEqual(errors, []);
  if (output) {
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('div,section,aside')) {
        const r = el.getBoundingClientRect();
        if (r.width < 700 && r.height < 260 && /New quest|NEW QUEST|family.s seat|Enduring line/.test(el.textContent ?? '')) el.style.visibility = 'hidden';
      }
    });
    await page.screenshot({ path: output });
  }
  console.log(JSON.stringify({ ok: true, errors, before, result }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
