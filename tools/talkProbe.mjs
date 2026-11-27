import { createServer } from 'vite';
import { chromium } from 'playwright';
const server = await createServer({ root: '/home/user/project-dagger', server: { port: 5199, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
// class=16 skips character creation, which otherwise takes every key press below.
await page.goto('http://localhost:5199/play/?shot&play&exterior&time=12:00&class=16');
await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 180000 });
const readPeople = async () => JSON.parse(await page.evaluate(() => window.__people()));
let live = null;
for (let i = 0; i < 60 && !live; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  live = (await readPeople()).find((p) => p.visible && p.moves > 0);
}
if (!live) { console.log('NO LIVE WALKER'); process.exit(1); }
const waitFrames = async (n) => {
  const f = await page.evaluate(() => window.__frame);
  await page.waitForFunction(([f0, k]) => window.__frame > f0 + k, [f, n], { timeout: 60000 });
};
const aimAndUse = async () => {
  const p = (await readPeople()).find((q) => q.visible && q.moves > 0);
  if (!p) return false;
  await page.evaluate(([x, y, z]) => window.__pose(x, y, z, 0, 0), [p.pos[0], p.pos[1] + 0.1, p.pos[2] - 1.6]);
  await waitFrames(12);
  const q = (await readPeople()).find((r) => r.i === p.i);
  const yaw = Math.atan2(q.pos[0] - p.pos[0], q.pos[2] - (p.pos[2] - 1.6));
  await page.evaluate(([x, y, z, yw]) => window.__pose(x, y, z, yw, 0), [p.pos[0], p.pos[1] + 0.1, p.pos[2] - 1.6, yaw]);
  await waitFrames(2);
  // E is held across frames because a bare press can fall between animation frames.
  await page.keyboard.down('KeyE');
  await waitFrames(4);
  await page.keyboard.up('KeyE');
  return true;
};
const die = (why, detail) => {
  console.log(`FAIL: ${why}${detail !== undefined ? ` - ${detail}` : ''}`);
  process.exitCode = 1;
};
console.log('talk state before:', await page.evaluate(() => window.__talk()));
await aimAndUse();
let opened = true;
await page.waitForFunction(() => JSON.parse(window.__talk()).overlay === true, null, { timeout: 30000 })
  .catch(() => { opened = false; });
const after = JSON.parse(await page.evaluate(() => window.__talk()));
console.log('talk state after E:', JSON.stringify(after));
if (!opened) die('E on a townsperson opened no talk window', JSON.stringify(after));
if (opened && !after.native) die('the overlay is not the native talk window', JSON.stringify(after));
if (opened && !after.npcName) die('the talk window names nobody', JSON.stringify(after));
const f1 = await page.evaluate(() => window.__frame);
await page.waitForFunction((n) => window.__frame > n + 3, f1, { timeout: 60000 });
await page.screenshot({ path: '/home/claude/talk-window.png' });
await page.keyboard.press('Escape');
await waitFrames(2);
await page.keyboard.press('F1');
await waitFrames(2);
const mode = JSON.parse(await page.evaluate(() => window.__talk())).mode;
if (mode !== 'steal') die('F1 did not reach STEAL mode', mode);
if (await aimAndUse()) {
  await waitFrames(3);
  await page.screenshot({ path: '/home/claude/talk-pickpocket.png' });
  const t = JSON.parse(await page.evaluate(() => window.__talk()));
  // Whether a pickpocket is noticed is a roll, so the crime is reported, not asserted.
  const crime = await page.evaluate(() => window.__playerEntity?.crimeCommitted ?? null);
  console.log('after pickpocket:', JSON.stringify({ mode: t.mode, overlay: t.overlay, crime }));
  if (t.overlay && t.native) die('E in STEAL mode opened a CONVERSATION', JSON.stringify(t));
} else {
  die('no walker to pickpocket - the steal half never ran');
}
if (!process.exitCode) console.log('\nTALK OK: E converses, F1+E steals, and both were checked');
await browser.close(); await server.close();
