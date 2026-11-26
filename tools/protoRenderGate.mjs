// Loads the prototype page in a real browser and fails on a page or console error, an unlinked shader, or a canvas
// that draws one flat color. Start the dev server first: (setsid npx vite --port 5199 --host 127.0.0.1 &)
// Run: node tools/protoRenderGate.mjs [--url ...]

import { chromium } from 'playwright';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const URL = arg('url', 'http://127.0.0.1:5199/grass-proto.html');
const fail = (m) => { console.error(`RENDER GATE FAIL: ${m}`); process.exitCode = 1; };

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await (await browser.newContext({
  viewport: { width: 480, height: 300 }, ignoreHTTPSErrors: true,
})).newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 160)}`); });

page.setDefaultTimeout(120000);
await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(4000);
// A software rasterizer cannot draw the default 1.2 million blades in time, so ask for the lowest density first.
await page.evaluate(() => {
  const d = document.getElementById('density');
  if (d) { d.value = d.min; d.dispatchEvent(new Event('input')); }
}).catch(() => {});
await page.waitForTimeout(6000);

const sample = () => page.evaluate(() => new Promise((res) => requestAnimationFrame(() => {
  const c = document.getElementById('c');
  const gl = c && c.getContext('webgl2');
  if (!gl) { res({ ok: false, why: 'no webgl2 context' }); return; }
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const seen = new Set();
  const px = new Uint8Array(4);
  for (let gy = 1; gy < 6; gy++) {
    for (let gx = 1; gx < 6; gx++) {
      gl.readPixels(Math.floor(w * gx / 7), Math.floor(h * gy / 7), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      seen.add(`${px[0]>>3},${px[1]>>3},${px[2]>>3}`);
    }
  }
  res({ ok: true, colours: seen.size, glError: gl.getError() });
})));

const a = await sample();
await page.waitForTimeout(1200);
const b = await sample();
await browser.close();

for (const e of errors.slice(0, 4)) fail(e);
if (!a.ok) fail(a.why);
else {
  if (a.colours < 3) fail(`the canvas is drawing ${a.colours} colour(s) - a dead frame`);
  if (b.colours < 3) fail(`still ${b.colours} colour(s) a second later`);
  if (a.glError) fail(`glError ${a.glError}`);
}
if (!process.exitCode) console.log(`render gate ok - ${a.colours} distinct colours, no errors`);
