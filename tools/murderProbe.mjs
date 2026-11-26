import { createServer } from 'vite';
import { chromium } from 'playwright';
const server = await createServer({ root: '/home/user/project-dagger', server: { port: 5199, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
// class=16 skips the character-creation wizard, which would otherwise take every key press below.
await page.goto('http://localhost:5199/play/?shot&play&exterior&time=12:00&class=16');
await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 180000 });
const readPeople = async () => JSON.parse(await page.evaluate(() => window.__people()));
let live = null;
for (let i = 0; i < 60 && !live; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  live = (await readPeople()).find((p) => p.visible && p.moves > 0 && !p.guard);
}
if (!live) { console.log('NO LIVE WALKER'); process.exit(1); }
const waitFrames = async (n) => {
  const f = await page.evaluate(() => window.__frame);
  await page.waitForFunction(([f0, k]) => window.__frame > f0 + k, [f, n], { timeout: 60000 });
};
const press = async (code) => { await page.keyboard.down(code); await waitFrames(3); await page.keyboard.up(code); await waitFrames(2); };
await press('KeyZ');
// Re-pose into reach before each click, since the target wanders during slow frames.
let crime = 0;
for (let i = 0; i < 10 && !crime; i++) {
  const p = (await readPeople()).find((q) => q.visible && q.moves > 0);
  if (!p) break;
  await page.evaluate(([x, y, z]) => window.__pose(x, y, z, Math.PI, 0), [p.pos[0], p.pos[1] + 0.1, p.pos[2] + 1.2]);
  await waitFrames(2);
  await page.evaluate(() => window.__attack());
  await waitFrames(20);
  crime = await page.evaluate(() => window.__playerEntity.crimeCommitted ?? 0);
  console.log(`swing ${i}: crime = ${crime}`);
}
if (crime !== 5) { console.log('NO MURDER CRIME'); process.exit(1); }
await page.waitForFunction(() => JSON.parse(window.__guards()).length > 0, null, { timeout: 60000 });
console.log('murder registered; the watch:', await page.evaluate(() => window.__guards()));
await page.screenshot({ path: '/home/claude/murder-response.png' });
console.log('MURDER OK');
await browser.close(); await server.close();
