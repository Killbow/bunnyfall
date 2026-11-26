import { createServer } from 'vite';
import { chromium } from 'playwright';
const server = await createServer({ root: '/home/user/project-dagger', server: { port: 5199, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
// class=16 skips the character-creation wizard, which would otherwise own the overlay and every key press.
await page.goto('http://localhost:5199/play/?shot&play&exterior&class=16&time=12:00');
await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 180000 });
const readPeople = async () => JSON.parse(await page.evaluate(() => window.__people()));
let live = null;
for (let i = 0; i < 120 && !live; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const arr = await readPeople();
  live = arr.find((p) => p.visible && !p.pend);
  if (!live && i % 6 === 5) {
    const dbg = await page.evaluate(() => window.__townDebug ? window.__townDebug() : '{}');
    console.log(`t+${(i + 1) * 5}s pool=${arr.length} visible=${arr.filter((p) => p.visible).length} dbg=${dbg}`);
  }
}
if (!live) { console.log('NO TOWNSPERSON'); process.exit(1); }
const waitFrames = async (n) => {
  const f = await page.evaluate(() => window.__frame);
  await page.waitForFunction(([f0, k]) => window.__frame > f0 + k, [f, n], { timeout: 60000 });
};
const press = async (code) => { await page.keyboard.down(code); await waitFrames(3); await page.keyboard.up(code); await waitFrames(2); };
const talk = async () => JSON.parse(await page.evaluate(() => window.__talk()));
const p = (await readPeople()).find((q) => q.visible && !q.pend);
await page.evaluate(([x, y, z]) => window.__pose(x, y, z, 0, 0), [p.pos[0], p.pos[1] + 0.1, p.pos[2] - 1.6]);
await waitFrames(12);
await press('KeyE');
console.log('greeting:', JSON.stringify(await talk()));
let revealed = null, directions = 0;
for (let ask = 0; ask < 15 && !revealed; ask++) {
  await press('KeyW');
  await press('Digit1');
  await press('Digit1');
  const ans = await talk();
  const o = ans.overlayText;
  const text = typeof o === 'string' ? o : (o?.text ?? '');
  console.log(`ask ${ask}:`, JSON.stringify(text));
  if (/map/i.test(text)) revealed = text;
  else directions++;
}
await page.screenshot({ path: '/home/claude/map-reveal-answer.png' });
if (!revealed) { console.log(`NO REVEAL in 15 asks (${directions} direction answers) - P ~0.2%, re-run`); process.exit(1); }
console.log('REVEALED:', JSON.stringify(revealed));
console.log(`(direction answers before the reveal: ${directions})`);
await browser.close(); await server.close();
process.exit(0);
