// Real-browser check of the sweep and clear-the-table chores: keys, pads, visible progress, one finish, and the mess
// restored when a chore is left unfinished. No ARENA2 or live realm needed. SHOTS_DIR=... saves screenshots.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } });
await server.listen();
let browser;
try {
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : process.platform === 'win32' ? { channel: 'chrome' } : {});
  const page = await browser.newPage({ viewport: { width: 1122, height: 760 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/__tavern_chore_probe', (route) => route.fulfill({ contentType: 'text/html',
    body: '<html><head></head><body style="margin:0;background:radial-gradient(ellipse at 50% 30%,#5a4630,#1a120b 70%);height:100vh"></body></html>' }));
  await page.goto(server.resolvedUrls.local[0] + '__tavern_chore_probe');
  await page.evaluate(async () => {
    const { createTavernChoreWindow } = await import('/src/ui/tavernChoreWindow.js');
    const p = window.probe = { log: [], finishes: 0, restores: 0, view: null, ok: true };
    p.open = (kind) => {
      p.log = []; p.view = createTavernChoreWindow({ kind, who: 'Marek the Cooper',
        progress: (x) => p.log.push(x), restore: () => { p.restores++; },
        finish: async () => { p.finishes++; return p.ok; } });
    };
  });
  const shots = process.env.SHOTS_DIR; if (shots) await mkdir(shots, { recursive: true });

  // Sweeping: the same side twice does nothing; eight alternating strokes finish it once.
  await page.evaluate(() => window.probe.open('spill'));
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(() => window.probe.log.length), 1, 'a repeated side must not count');
  await page.keyboard.press('KeyD'); await page.keyboard.press('ArrowLeft');
  if (shots) { await page.waitForTimeout(600); await page.screenshot({ path: join(shots, 'tavern-chore-sweep.png') }); }
  for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowRight'); await page.keyboard.press('KeyA'); }
  const sweep = await page.evaluate(() => ({ log: window.probe.log, finishes: window.probe.finishes }));
  assert.equal(sweep.finishes, 1); assert.equal(sweep.log.length, 8);
  assert.ok(sweep.log.at(-1).scale < sweep.log[0].scale, 'the mess shrinks as it is swept');
  await page.waitForFunction(() => !document.querySelector('.ts-chore'));
  assert.equal(await page.evaluate(() => window.probe.restores), 0, 'a finished chore is not put back');

  // Clearing a table: Space gathers the three cups (never twice from one press), then two clockwise circles wipe it.
  await page.evaluate(() => window.probe.open('table'));
  for (let i = 0; i < 3; i++) await page.keyboard.press('Space');
  assert.deepEqual(await page.evaluate(() => window.probe.log.map((x) => x.taken)), [1, 2, 3]);
  if (shots) { await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(600); await page.screenshot({ path: join(shots, 'tavern-chore-table.png') }); }
  else { await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowRight'); }
  await page.keyboard.press('ArrowLeft');   // out of turn: the rag slips, nothing counts
  for (const key of ['ArrowDown', 'ArrowLeft', 'KeyW', 'KeyD', 'KeyS', 'KeyA']) await page.keyboard.press(key);
  assert.equal(await page.evaluate(() => window.probe.finishes), 2);
  await page.waitForFunction(() => !document.querySelector('.ts-chore'));

  // Left unfinished (Escape or Tab): the mess goes back as it was.
  await page.evaluate(() => window.probe.open('spill'));
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Escape');
  await page.evaluate(() => window.probe.open('table'));
  await page.keyboard.press('Space'); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => window.probe.restores), 2);
  assert.equal(await page.locator('.ts-chore').count(), 0);

  // A refused finish keeps the panel open for another try.
  await page.evaluate(() => { window.probe.ok = false; window.probe.open('spill'); });
  for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowRight'); }
  await page.waitForFunction(() => /did not go through/.test(document.querySelector('.ts-chore .ts-status')?.textContent ?? ''));
  await page.evaluate(() => { window.probe.ok = true; });
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => !document.querySelector('.ts-chore'));

  for (const [width, height] of [[360, 740], [736, 414]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.probe.open('table'));
    assert.ok(await page.evaluate(() => { const b = document.querySelector('.ts-chore').getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth && b.bottom <= innerHeight; }), `Chore panel overflow at ${width}x${height}`);
    await page.keyboard.press('Escape');
  }
  assert.deepEqual(errors, []);
  console.log('PASS: sweep alternation and shrink, table gather and circular wipe, single finish, retry after refusal, restore on Escape/Tab, phone and landscape layout.');
} finally { await browser?.close(); await server.close(); }
