// Actual browser check of the shared Enhanced Plus themes and Classic bitmap-rendering path. No ARENA2 required.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/__tavern_ui_probe*', (route) => route.fulfill({ contentType: 'text/html', body: '<main></main>' }));
  await page.goto(server.resolvedUrls.local[0] + '__tavern_ui_probe?nofonts');
  await page.evaluate(async () => {
    const { createTavernServiceHud } = await import('/src/ui/tavernServiceHud.js');
    const { createTavernShift } = await import('/src/net/tavernServiceLaw.js');
    const { setUiSkin } = await import('/src/ui/uiSkin.js');
    const { setPlusTheme } = await import('/src/ui/enhancedPlusStyle.js');
    const state = createTavernShift({ keeper: 'keeper', patrons: ['guest'], where: '17:42', seed: 1, nowS: 100 });
    state.orders[0].recipe = 'dibella'; state.mix.cream = 1;
    const hud = createTavernServiceHud();
    window.tavernUiProbe = { hud, state, setUiSkin, setPlusTheme, frame: () => hud.frame(state, () => 'Traveller', false) };
    window.tavernUiProbe.frame();
  });
  const colours = new Set();
  for (const width of [360, 736, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    for (const theme of ['slate', 'stone', 'iron', 'ember', 'forest', 'night']) {
      const result = await page.evaluate((theme) => {
        const p = window.tavernUiProbe; p.setPlusTheme(theme); p.frame();
        const n = document.querySelector('.tavern-service-hud'), style = getComputedStyle(n), box = n.getBoundingClientRect();
        return { text: n.textContent, font: style.fontFamily, bg: style.backgroundColor, left: box.left, right: box.right, visible: style.display !== 'none', customStyle: !!n.querySelector('style') };
      }, theme);
      assert.ok(result.visible); assert.ok(result.left >= 0 && result.right <= width, JSON.stringify(result));
      assert.match(result.text, /Dibella's Veil/); assert.match(result.text, /Cream 1/);
      assert.equal(result.customStyle, false); colours.add(result.bg);
    }
  }
  assert.ok(colours.size >= 5, 'The panel must inherit the live Enhanced Plus theme.');
  const classic = await page.evaluate(() => {
    const p = window.tavernUiProbe; p.setUiSkin('classic'); p.frame();
    let glyphs = 0, rectangles = 0;
    p.hud.draw({ drawScreenQuad: (texture) => { if (texture === 'font') glyphs++; else rectangles++; } }, { width: 960, height: 600 },
      { tex: 'font', fnt: { fixedHeight: 8, fixedWidth: 5, glyphWidth: () => 4 } });
    return { glyphs, rectangles, hidden: getComputedStyle(document.querySelector('.tavern-service-hud')).display === 'none' };
  });
  assert.ok(classic.glyphs > 0); assert.ok(classic.rectangles > 0); assert.ok(classic.hidden);
  const enhancedAgain = await page.evaluate(() => {
    const p = window.tavernUiProbe; p.setUiSkin('enhanced'); p.frame();
    return document.querySelectorAll('.tavern-service-hud.on').length;
  });
  assert.equal(enhancedAgain, 1);
  await page.evaluate(() => window.tavernUiProbe.hud.dispose());
  assert.equal(await page.locator('.tavern-service-hud').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: English text; six Enhanced Plus themes at 360/736/1280px; Classic native text; live skin switching; cleanup.');
} finally { await browser?.close(); await server.close(); }
