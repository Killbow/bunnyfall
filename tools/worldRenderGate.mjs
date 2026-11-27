// Boots the exterior against local ARENA2 data in headless Chromium and fails on a page error, no frames, or a dark
// or flat ground, terrain, or sky. It starts its own vite server on port 5223 (or GATE_PORT).
// Run: ARENA2_PATH=/path/to/ARENA2 node tools/worldRenderGate.mjs [--minutes N] [--mode classic|enhanced] [--world]
// [--weather <type>] [--grass off] [--season <name>] [--rain <n>] [--small] [--save].
import { createServer } from 'vite';
import { chromium } from 'playwright';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const MINUTES = Number(arg('minutes', 720));
const MODE = arg('mode', 'enhanced');
// Each knob below sets a URL parameter the page reads; do not add a knob the page ignores.
const WEATHER = arg('weather', null);
const WORLD = process.argv.includes('--world');
const GRASS = arg('grass', null);
const SEASON = arg('season', null);
const RAIN = arg('rain', null);
const PORT = Number(process.env.GATE_PORT ?? 5223);

const fails = [];
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok   ${name}`);
  else { console.error(`  FAIL ${name}${detail ? ` - ${detail}` : ''}`); fails.push(name); }
};

const server = await createServer({ server: { port: PORT, strictPort: true } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
// --small halves the frame because grass is slow under a software rasterizer; the checks use frame ratios.
const SMALL = process.argv.includes('--small');
const page = await browser.newPage({ viewport: SMALL ? { width: 480, height: 300 } : { width: 960, height: 600 } });
page.setDefaultTimeout(300000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));

// The skin parameter is ?skin=classic; a bare ?classic selects the classic start location instead.
const skin = MODE === 'classic' ? '&skin=classic' : '';
const dials = (WEATHER ? `&weather=${WEATHER}` : '') + (GRASS ? `&grass=${GRASS}` : '') + (SEASON ? `&season=${SEASON}` : '') + (RAIN ? `&rain=${RAIN}` : '');
await page.goto(`http://localhost:${PORT}/play/?${WORLD ? 'world' : 'exterior'}&shot&novideo&nofoes${skin}${dials}`);

const until = Date.now() + 150000;
let frames = 0;
while (Date.now() < until) {
  frames = await page.evaluate(() => (typeof window.__frame === 'number' ? window.__frame : 0));
  if (frames > 30) break;
  await page.waitForTimeout(1000);
}
check('the exterior boots and renders frames', frames > 30, `frames=${frames}`);
check('no page error', errors.length === 0, errors.slice(0, 2).join(' | '));

if (MINUTES !== null) {
  await page.evaluate((m) => { if (window.__setWorldMinutes) window.__setWorldMinutes(m); }, MINUTES);
  await page.waitForTimeout(1500);
}

// The canvas is captured as a screenshot because the default framebuffer is cleared after each present.
const canvas = await page.$('canvas');
const png = await canvas.screenshot({ type: 'png', timeout: 180000 });
const { PNG } = await import('pngjs');
const img = PNG.sync.read(png);
const { width: w, height: h, data: px } = img;
const stats = (y0, y1) => {
  let sum = 0, n = 0; const seen = new Set();
  for (let y = y0; y < y1; y += 3) {
    for (let x = 0; x < w; x += 3) {
      const o = (y * w + x) * 4;
      const r = px[o], g = px[o + 1], b = px[o + 2];
      sum += (r + g + b) / 3; n++;
      seen.add(`${r >> 4},${g >> 4},${b >> 4}`);
    }
  }
  return { mean: sum / n, colours: seen.size };
};
// PNG rows run top-down, so the sky is in the low rows.
const sample = { sky: stats(0, Math.floor(h * 0.4)), ground: stats(Math.floor(h * 0.55), h) };
check(`the lower half is lit (mean ${sample.ground.mean.toFixed(1)} > 20)`, sample.ground.mean > 20);
check(`the lower half has detail (${sample.ground.colours} colours > 8)`, sample.ground.colours > 8);
// The street band is a fixed region of the boot view with no buildings in it, so it moves if the boot view changes.
// It uses the median because falling snow adds bright specks that lift the mean.
const street = (() => {
  const vals = [];
  const y0 = Math.floor(h * 0.78), y1 = Math.floor(h * 0.83);
  const x0 = Math.floor(w * 0.25), x1 = Math.floor(w * 0.44);
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const o = (y * w + x) * 4; vals.push((px[o] + px[o + 1] + px[o + 2]) / 3);
  }
  vals.sort((a, b) => a - b);
  return vals[vals.length >> 1];
})();
check(`the TERRAIN is lit (street band median ${street.toFixed(1)} > 12)`, street > 12);
// At night the sky must be dark but still show stars and the moon.
const NIGHT = MINUTES < 300 || MINUTES > 1260;
if (NIGHT) {
  check(`the night sky is dark (mean ${sample.sky.mean.toFixed(1)} < 70)`, sample.sky.mean < 70);
  check(`...but drawn, with lights in it (${sample.sky.colours} colours > 3)`, sample.sky.colours > 3);
} else {
  check(`the sky is drawn (mean ${sample.sky.mean.toFixed(1)} > 20)`, sample.sky.mean > 20);
}
if (process.argv.includes('--save')) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync('/tmp/worldGate.png', png);
}

await browser.close();
await server.close();
if (fails.length) { console.error(`\nworld render gate: ${fails.length} failure(s)`); process.exit(1); }
console.log(`\nworld render gate ok (${MODE}, ${MINUTES} min)`);
