// Times the card table lab's frames with and without cards, at desktop size and as a throttled phone.
// Run: node tools/cardsPhoneProbe.mjs (PROBE_ONLY=gambit runs one game).

import { createServer } from 'vite';
import { chromium } from 'playwright';
import { loadavg, cpus } from 'node:os';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const server = await createServer({ server: { port: 5242, strictPort: true }, logLevel: 'error' });
await server.listen();
const BASE = 'http://127.0.0.1:5242';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
let failed = 0;
const rows = [];
const FRAMES = 30, REPS = 7, PHONE_THROTTLE = 4;
const load = () => `load ${loadavg().map((x) => x.toFixed(1)).join(' ')} on ${cpus().length} cores`;
console.log(`start: ${load()}`);
for (const [label, viewport, throttle, mobile] of [['desktop 1100x640', { width: 1100, height: 640 }, 1, false], ['phone 390x844, CPU /4', { width: 390, height: 844 }, PHONE_THROTTLE, true]]) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 3 : 1 });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  for (const [game, q] of [['holdem', 't=14&cam=seat&nohud&patrons=5&split'], ['holdem, no chips', 't=14&cam=seat&nohud&patrons=5&chips=0'], ['holdem from above (no hand held)', 't=14&cam=over&nohud&patrons=5'], ['iliac', 't=30&cam=seat&nohud&game=iliac'], ['gambit, leaning, mid-motion', 'cam=lean&nohud&game=gambit&steps=16&dt=150']]) {
    if (process.env.PROBE_ONLY && !game.startsWith(process.env.PROBE_ONLY)) continue;
    await page.goto(`${BASE}/cards.html?${q}&bench=${FRAMES}&reps=${REPS}`, { waitUntil: 'commit', timeout: 1800000 });
    await page.waitForFunction(() => window.__cardsReady === true, null, { timeout: 1800000, polling: 2000 });
    const b = await page.evaluate(() => window.__cardsBench);
    if (!b || !Number.isFinite(b.cardsMs) || !Number.isFinite(b.bareMs)) { failed++; console.log(`FAIL ${label} ${game}: no timing`); continue; }
    rows.push({ label, game, ...b });
    console.log(`${label} ${game}: ${b.width}x${b.height}, ${b.plates} plates, ${b.chips} chips - the room ${b.bareMs.toFixed(2)} ms, with the cards ${b.cardsMs.toFixed(2)} ms: the cards cost ${b.costMs.toFixed(2)} ms a frame (${load()})`);
    if (b.split) console.log(`   alone: the held hand ${b.split.held.toFixed(2)} ms, the cloth's cards ${b.split.clothcards.toFixed(2)} ms, the chips ${b.split.chips.toFixed(2)} ms, the cloth's cards and chips ${b.split.cloth.toFixed(2)} ms`);
  }
  await context.close();
}
if (errors.length) { failed++; console.log('FAIL errors:\n' + errors.join('\n')); }
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
