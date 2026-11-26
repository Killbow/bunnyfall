// Probe: boots the streaming world at Daggerfall city, asks a townsperson where a building is, and prints it.
import { createServer } from 'vite';
import { chromium } from 'playwright';
const server = await createServer({ root: '/home/user/project-dagger', server: { port: 5199, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
// class=16 skips character creation, whose screen would otherwise take every key press below.
await page.goto('http://localhost:5199/play/?shot&world&play&tod=12:00&class=16');
await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 300000 });
const waitFrames = async (n) => {
  const f = await page.evaluate(() => window.__frame);
  await page.waitForFunction(([f0, k]) => window.__frame > f0 + k, [f, n], { timeout: 60000 });
};
const press = async (code) => { await page.keyboard.down(code); await waitFrames(3); await page.keyboard.up(code); await waitFrames(2); };
const talk = async () => JSON.parse(await page.evaluate(() => window.__talk()));

// The town does not update while an opening quest box is open, so close each one (Escape, then Enter for buttons).
let drained = 0;
for (let i = 0, quiet = 0; i < 30 && quiet < 2; i++) {
  if ((await talk()).overlay) { quiet = 0; drained++; await press('Escape'); await press('Enter'); } else quiet++;
  await waitFrames(1);
}
if ((await talk()).overlay) { console.log('AN OPENING BOX WILL NOT CLOSE - the world stays frozen'); process.exit(1); }
console.log('opening boxes drained:', drained);

const dbg = JSON.parse(await page.evaluate(() => window.__townDebug()));
if (!dbg.pixels.length) { console.log('NO POPULATED PIXELS'); process.exit(1); }
const px0 = dbg.pixels[0];
const center = [px0.origin[0] + px0.navW * 0.8, px0.origin[1] + 2, px0.origin[2] + px0.navH * 0.8];
await page.evaluate(([x, y, z]) => window.__pose(x, y, z, Math.PI, -0.05), center);
console.log('posed at city center; talk:', await page.evaluate(() => window.__talk()));
const readPeople = async () => JSON.parse(await page.evaluate(() => window.__people()) || '[]') ?? [];
let live = null;
for (let i = 0; i < 60 && !live; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  live = (await readPeople()).find((p) => p.visible && p.moves > 0);
}
if (!live) { console.log('NO LIVE WALKER'); process.exit(1); }
const p = (await readPeople()).find((q) => q.visible && q.moves > 0);
await page.evaluate(([x, y, z]) => window.__pose(x, y, z, 0, 0), [p.pos[0], p.pos[1] + 0.1, p.pos[2] - 1.6]);
await waitFrames(12);
await press('KeyE');
const greet = await talk();
console.log('greeting:', JSON.stringify(greet));
if (!greet.overlay) { console.log('NO TALK WINDOW'); process.exit(1); }
await press('KeyW');
const cats = await talk();
console.log('categories:', JSON.stringify({ mode: cats.topicMode, count: cats.topicCount }));
await press('Digit1');
const blds = await talk();
console.log('buildings:', JSON.stringify({ mode: blds.topicMode, count: blds.topicCount }));
await press('Digit1');
const ans = await talk();
console.log('answer:', JSON.stringify(ans));
await page.screenshot({ path: '/home/claude/world-whereis-answer.png' });
if (!ans.overlayText || ans.buildings === 0) { console.log('NO ANSWER'); process.exit(1); }
console.log('STREAMING WHERE-IS OK');
await browser.close(); await server.close();
