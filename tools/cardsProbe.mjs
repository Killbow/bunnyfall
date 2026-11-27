// Shoots the card table lab at moments of a seeded evening and checks that the cards and chips draw.
// Run: node tools/cardsProbe.mjs (PROBE_SHOTS sets the shots folder).

import { createServer } from 'vite';
import { chromium } from 'playwright';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const shots = process.env.PROBE_SHOTS ?? '/tmp';
const server = await createServer({ server: { port: 5241, strictPort: true }, logLevel: 'error' });
await server.listen();
const BASE = 'http://127.0.0.1:5241';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const MIN_CARD_PIXELS = 300, MIN_FACE_PIXELS = 150;
for (const [label, q] of [['deal-air', 't=0.25&cam=over&nohud'], ['dealt-seat', 't=2.2&cam=seat'], ['dealt-over', 't=2.2&cam=over&nohud'], ['later-seat', 't=14&cam=seat'], ['later-over', 't=14&cam=over&nohud'], ['near-hand', 't=9&cam=near&nohud&seed=6&patrons=2'], ['board-turn', 't=6.4&cam=board&nohud&seed=4&patrons=2'], ['turn-seat', 't=6.4&cam=seat&seed=4&patrons=2'], ['riffle', 't=0.4&cam=near&nohud'], ['held-seat', 't=4&cam=seat&nohud'], ['peek-seat', 't=4&cam=seat&nohud&peek=1'], ['squeeze-seat', 't=4&cam=seat&nohud&peek=1&squeeze=1']]) {
  await page.goto(`${BASE}/cards.html?${q}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__cardsReady === true, null, { timeout: 120000 });
  const state = await page.evaluate(() => window.__cardsState);
  await page.screenshot({ path: `${shots}/cards-${label}.png` });
  console.log(`${label}: street ${state.street} cards ${state.cards} (${state.faceUp} face up) chips ${state.chips} pixels ${state.cardPixels} (face ${state.facePixels}) - ${shots}/cards-${label}.png`);
  if (!(state.chips > 0)) { failed++; console.log('FAIL no chips'); }
  if (!(state.cardPixels >= MIN_CARD_PIXELS)) { failed++; console.log('FAIL the cards changed too little of the frame'); }
  if (state.faceUp > 0 && !(state.facePixels >= MIN_FACE_PIXELS * state.faceUp)) { failed++; console.log('FAIL face-up cards paint no faces'); }
}
if (errors.length) { failed++; console.log('FAIL errors:\n' + errors.join('\n')); }
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
