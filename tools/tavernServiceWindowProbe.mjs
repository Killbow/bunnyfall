// Real-browser regression check of the counter, recipe book, and host wiring; no ARENA2 or live realm needed.

import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
let browser;
try {
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : process.platform === 'win32' ? { channel: 'chrome' } : {});
  const page = await browser.newPage({ viewport: { width: 1122, height: 883 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/__tavern_window_probe', (route) => route.fulfill({ contentType: 'text/html', body: '<html><head></head><body style="margin:0;background:radial-gradient(ellipse at 50% 20%,#514333,#15110c 85%)"><button id="focus-return">Tavern</button></body></html>' }));
  await page.goto(server.resolvedUrls.local[0] + '__tavern_window_probe');
  await page.evaluate(async () => {
    const { createTavernServiceHost } = await import('/src/scenes/tavernServiceHost.js');
    const { createTavernShift, stepTavernShift } = await import('/src/net/tavernServiceLaw.js');
    const { overlayOpen } = await import('/src/ui/enhancedOverlays.js');
    const keeper = { key: 'keeper' }, guest = { key: 'guest' };
    const p = window.probe = { state: null, version: 0, requests: [], current: null, hold: false, overlayOpen };
    p.host = createTavernServiceHost({
      entity: () => ({ goldPieces: 0 }), online: () => true, where: () => '17:42', buildingKey: () => 42,
      people: () => [keeper, guest], npcId: (pn) => pn.key, name: () => 'Mordane Wicksly', patron: (pn) => pn === guest,
      now: () => 100, plaque: () => true, say: () => {}, choose: () => { throw new Error('Counter must use its own window'); },
      showWindow: (view) => { p.current?.dispose(); p.current = view; },
      act: async (body, apply) => {
        p.requests.push(body);
        if (body.op === 'read') {
          await new Promise((resolve) => { p.finishRoomRead = resolve; });
          return { ok: true, data: { state: p.state, version: p.version } };
        }
        if (body.op === 'pour' && p.hold) await new Promise((r) => { p.release = r; });
        const result = body.op === 'start' ? { state: createTavernShift({ ...body, seed: 1, nowS: 100 }) } : stepTavernShift(p.state, body, 100);
        if (result.error) return { ok: false, error: result.error };
        p.state = result.state; const reply = { ok: true, data: { ...result, version: ++p.version } }; apply(reply); return reply;
      },
    });
    p.openMix = () => p.host.activate(keeper, 'tservice:mix');
    p.openBook = () => p.host.activate(keeper, 'tservice:book');
    p.host.frame(true, false);
    p.host.innRows(keeper)[0].action();
    await Promise.resolve();
    if (!p.host.activate(keeper)) throw new Error('Inn services reopened while starting a shift');
    p.finishRoomRead();
    await new Promise((r) => setTimeout(r, 0));
    const actions = p.host.personHover(keeper).actions.map((a) => a.id);
    if (!actions.includes('tservice:mix') || actions.includes('tservice:wine')) throw new Error('Old dose menu still present');
    document.querySelector('#focus-return').focus(); p.openMix();
  });
  const wine = page.getByRole('button', { name: 'Pour one dose: Wine', exact: true });
  const cream = page.getByRole('button', { name: 'Pour one dose: Cream', exact: true });
  const beer = page.getByRole('button', { name: 'Pour one dose: Beer', exact: true });
  await page.evaluate(() => { window.probe.hold = true; const b = document.querySelector('.ts-point'); b.click(); b.click(); });
  assert.equal(await page.evaluate(() => window.probe.requests.filter((r) => r.op === 'pour').length), 1, 'Double click sent two transactions');
  assert.ok(await wine.isDisabled());
  await page.evaluate(() => { window.probe.hold = false; window.probe.release(); });
  await page.waitForFunction(() => document.querySelector('.ts-point small').textContent === '1 in cup');
  await cream.click(); await beer.click();
  await page.waitForFunction(() => window.probe.state.mix.beer === 1);
  assert.equal(await page.evaluate(() => window.probe.state.phase), 'carry');
  assert.equal(await page.locator('.ts-dose-slots .ts-dose.ts-fresh').count(), 1, 'Only the newest dose drops in');
  await page.waitForFunction(() => !document.querySelector('.ts-window'));
  assert.equal(await page.evaluate(() => window.probe.overlayOpen()), false);
  assert.equal(await page.evaluate(() => window.probe.requests.filter((r) => r.op === 'carry').length), 0, 'No separate carry action');
  await page.evaluate(() => window.probe.openMix());
  assert.equal(await page.locator('.ts-point:disabled').count(), 3);
  assert.equal(await page.locator('.ts-dose-slots .ts-dose').count(), 3);
  const pourCount = await page.evaluate(() => window.probe.requests.filter((r) => r.op === 'pour').length);
  await page.keyboard.press('1');
  assert.equal(await page.evaluate(() => window.probe.requests.filter((r) => r.op === 'pour').length), pourCount, 'Fourth dose was sent');
  await page.getByRole('button', { name: 'Discard the mixture', exact: true }).click();
  await page.waitForFunction(() => window.probe.state.mix.wine === 0);
  assert.equal(await page.getByRole('button', { name: 'Take the prepared cup', exact: true }).count(), 0);
  await wine.click();
  for (const [width, height] of [[360, 800], [736, 414]]) {
    await page.setViewportSize({ width, height });
    assert.ok(await page.evaluate(() => {
      const b = document.querySelector('.ts-counter').getBoundingClientRect();
      return b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight;
    }), `Counter overflow at ${width}x${height}`);
    await cream.click();
    await page.getByRole('button', { name: 'Discard the mixture', exact: true }).click();
    await page.waitForFunction(() => window.probe.state.mix.wine === 0);
    await wine.click();
  }
  await page.setViewportSize({ width: 1122, height: 883 });
  if (process.env.SHOTS_DIR) {
    await mkdir(process.env.SHOTS_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.SHOTS_DIR, 'tavern-counter.png') });
  }
  await page.getByRole('button', { name: 'Read the recipe book', exact: true }).click();
  assert.equal(await page.locator('.ts-window').count(), 1);
  const names = [];
  for (let i = 0; i < 3; i++) {
    names.push(...await page.locator('.ts-recipe h2').allTextContents());
    assert.equal(await page.locator('.ts-recipe-doses .ts-dose').count(), 9);
    assert.equal(await page.locator('.ts-recipe .ts-note').count(), 3);
    if (i < 2) await page.getByRole('button', { name: 'Next page', exact: true }).click();
  }
  assert.equal(new Set(names).size, 9);
  assert.ok(await page.getByRole('button', { name: 'Next page', exact: true }).isDisabled());
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  assert.ok(await page.getByRole('button', { name: 'Previous page', exact: true }).isDisabled());
  for (const [width, height] of [[1122, 883], [360, 800], [736, 414]]) {
    await page.setViewportSize({ width, height });
    assert.ok(await page.evaluate(() => {
      const b = document.querySelector('.ts-book').getBoundingClientRect();
      return b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight;
    }), `Book overflow at ${width}x${height}`);
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    await page.getByRole('button', { name: 'Previous page', exact: true }).click();
  }
  await page.setViewportSize({ width: 1122, height: 883 });
  if (process.env.SHOTS_DIR) await page.screenshot({ path: join(process.env.SHOTS_DIR, 'tavern-recipe-book.png') });
  await page.getByRole('button', { name: 'Back to mixing', exact: true }).click();
  assert.equal(await page.locator('.ts-point small').first().textContent(), '1 in cup');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('.ts-window').count(), 0);
  await page.evaluate(() => window.probe.openMix());
  await page.keyboard.press('2'); await page.waitForFunction(() => window.probe.state.mix.cream === 1);
  await page.keyboard.press('3'); await page.waitForFunction(() => window.probe.state.mix.beer === 1);
  await page.waitForFunction(() => !document.querySelector('.ts-window'));
  assert.equal(await page.evaluate(() => window.probe.state.phase), 'carry');
  assert.equal(await page.evaluate(() => window.probe.overlayOpen()), false);
  await page.evaluate(() => { document.querySelector('#focus-return').focus(); window.probe.openBook(); });
  await page.keyboard.press('Escape'); assert.equal(await page.locator('.ts-window').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'focus-return');
  await page.evaluate(() => { window.probe.openMix(); window.probe.host.frame(false, false); });
  assert.equal(await page.locator('.ts-window').count(), 0, 'Leaving the room leaked the overlay');
  assert.equal(await page.evaluate(() => window.probe.overlayOpen()), false);
  await page.evaluate(() => window.probe.host.dispose());
  assert.deepEqual(errors, []);
  console.log('PASS: host wiring, single-dose clicks, pending/double-click guard, full cup, discard, carry, auto-carry, all nine recipes and their notes, paging, keyboard, focus, responsive layout and room-exit cleanup.');
} finally { await browser?.close(); await server.close(); }
