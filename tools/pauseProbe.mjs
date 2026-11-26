// Probe: Escape opens the dungeon pause window, the sound bar writes, N declines the exit, and Escape closes it.
import { chromium } from 'playwright';
import { createServer } from 'vite';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const server = await createServer({ server: { port: 5209, strictPort: true } });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));
await page.goto('http://localhost:5209/play/?nomenu&class=0&novideo&shot&play');
await page.waitForFunction(() => window.__frame > 5, { timeout: 120000 });
const frames = async (n) => {
  const f0 = await page.evaluate(() => window.__frame ?? 0);
  for (let i = 0; i < 100; i++) { await page.waitForTimeout(150); if (await page.evaluate(() => window.__frame ?? 0) >= f0 + n) break; }
};
await frames(5);
const overlay = () => page.evaluate(() => JSON.parse(window.__overlay() ?? 'null'));
const out = { steps: {} };
out.steps.boot = await overlay();
await page.keyboard.press('Escape');
await frames(2);
out.steps.open = await overlay();
// A quarter click writes 0.25, because 0.5 is the default and the store drops writes equal to it.
// The store saves on close.
await page.evaluate(() => window.__overlayClick(85 + 6.15 + 109.1 * 0.25, 40 + 23.2 + 2));
await frames(1);
await page.evaluate(() => window.__overlayClick(85 + 101 + 2, 40 + 4 + 2));
await frames(1);
await page.evaluate(() => window.__overlayKey('KeyN'));
await frames(1);
out.steps.declined = await overlay();
await page.keyboard.press('Escape');
await frames(2);
out.steps.closed = await overlay();
out.steps.sound = await page.evaluate(() => JSON.parse(localStorage.getItem('dagger.settings.v1') ?? '{}').Controls?.SoundVolume ?? null);
await page.keyboard.press('Escape');
await frames(2);
out.steps.reopened = await overlay();
await page.evaluate(() => window.__overlayClick(85 + 5 + 2, 40 + 60 + 2));
await frames(2);
out.steps.controls = await overlay();
await page.evaluate(() => window.__overlayClick(57 + 2, 13 + 2));
await frames(1);
await page.evaluate(() => window.__overlayKey('KeyP'));
await frames(1);
await page.evaluate(() => window.__overlayClick(240 + 2, 190 + 2));
await frames(2);
out.steps.backToPause = await overlay();
out.steps.rebound = await page.evaluate(() => JSON.parse(localStorage.getItem('dagger.keybinds') ?? '{}').actionKeyBinds?.KeyP ?? null);
out.steps.oldGone = await page.evaluate(() => JSON.parse(localStorage.getItem('dagger.keybinds') ?? '{}').actionKeyBinds?.KeyW ?? null);
await page.evaluate(() => window.__overlayClick(85 + 5 + 2, 40 + 60 + 2));
await frames(2);
out.steps.tipShort = await page.evaluate(() => {
  const w = window.__overlayWindow?.();
  w?.hover?.(57 + 2, 13 + 2); w?.tick?.(1);
  return w?.tip?.text ?? null;
});
await page.evaluate(async () => {
  const cc = await import('/src/ui/controlsConfig.js');
  const w = window.__overlayWindow();
  cc.setUnsavedBinding(w.unsaved, 'MoveForwards', 'SomethingVeryLongIndeed');
  w.hover(57 + 2, 13 + 2); w.tick(1);
});
out.steps.tipLong = await page.evaluate(() => window.__overlayWindow()?.tip?.text ?? null);
await page.evaluate(() => { const w = window.__overlayWindow(); w.hover(-1, -1); w.tick(1); });
out.steps.tipGone = await page.evaluate(() => window.__overlayWindow()?.tip?.text ?? null);
await page.keyboard.press('Escape');
await frames(2);
await page.keyboard.press('Escape');
await frames(2);

out.ok = !!(out.steps.boot === null
  && out.steps.open && out.steps.open.kind === 'PauseOptionsWindow'
  && out.steps.sound === '0.25'
  && out.steps.declined && out.steps.declined.kind === 'PauseOptionsWindow'
  && out.steps.closed === null
  && out.steps.reopened && out.steps.reopened.kind === 'PauseOptionsWindow'
  && out.steps.controls && out.steps.controls.kind === 'ControlsWindow'
  && out.steps.backToPause && out.steps.backToPause.kind === 'PauseOptionsWindow'
  && out.steps.rebound === 'MoveForwards'
  && out.steps.oldGone === null
  && out.steps.tipShort === null
  && out.steps.tipLong === 'Something Very Long Indeed'
  && out.steps.tipGone === null
  && errors.length === 0);
out.errors = errors.slice(0, 6);
console.log(JSON.stringify(out, null, 2));
await browser.close(); await server.close();
process.exit(out.ok ? 0 : 1);
