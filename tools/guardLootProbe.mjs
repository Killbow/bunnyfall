// Browser probe that kills a city guard through the real death path and loots the corpse.
// Run: ARENA2_PATH=... node tools/guardLootProbe.mjs (starts its own dev server).
import { createServer } from 'vite';
import { chromium } from 'playwright';
const server = await createServer({ root: '/home/user/project-dagger', server: { port: 5199, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
// class=16 skips the character creation wizard, which would otherwise take every key press.
await page.goto('http://localhost:5199/play/?shot&play&exterior&time=12:00&class=16');
await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 180000 });
await new Promise((r) => setTimeout(r, 8000));
await page.evaluate(() => { window.__playerEntity.crimeCommitted = 'Pickpocketing'; window.__crime(); });
await page.waitForFunction(() => JSON.parse(window.__guards()).length > 0, null, { timeout: 60000 });
const before = await page.evaluate(() => (window.__playerEntity.items ?? []).length);
console.log('guards up; player items before:', before);
await page.evaluate(() => window.__guardDamage(0, 9999));
const waitFrames = async (n) => {
  const f = await page.evaluate(() => window.__frame);
  await page.waitForFunction(([f0, k]) => window.__frame > f0 + k, [f, n], { timeout: 60000 });
};
await waitFrames(5);
const g0 = JSON.parse(await page.evaluate(() => window.__guards()))[0];
console.log('corpse:', JSON.stringify(g0));
if (!g0.dead) { console.log('GUARD NOT DEAD'); process.exit(1); }
await page.evaluate(([x, y, z]) => window.__pose(x, y, z, Math.PI, -0.65), [g0.pos[0], g0.pos[1] + 0.1, g0.pos[2] + 1.6]);
await waitFrames(8);
const press = async (code) => { await page.keyboard.down(code); await waitFrames(3); await page.keyboard.up(code); await waitFrames(2); };
await press('KeyE');
const after = await page.evaluate(() => (window.__playerEntity.items ?? []).map((it) => `${it.name ?? it.group}${it.stackCount ? ` x${it.stackCount}` : ''}`));
console.log('player items after E:', JSON.stringify(after));
await page.screenshot({ path: '/home/claude/guard-loot.png' });
await press('KeyE');
const after2 = await page.evaluate(() => (window.__playerEntity.items ?? []).length);
console.log('items after second E:', after2, '(no double takes)');
if (after.length <= before) { console.log('NO LOOT TAKEN'); process.exit(1); }
if (after2 !== after.length) { console.log('DOUBLE TAKE'); process.exit(1); }
console.log('GUARD LOOT OK');
await browser.close(); await server.close();
