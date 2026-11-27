// Browser probe for the classic inventory's equip and remove modes on the paperdoll.
// Run: ARENA2_PATH=... node tools/equipProbe.mjs (starts its own dev server).
import { createServer } from 'vite';
import { chromium } from 'playwright';
const server = await createServer({ root: '/home/user/project-dagger', server: { port: 5199, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5199/play/?shot&play&exterior&time=12:00&class=16');
await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 180000 });
const waitFrames = async (n) => {
  const f = await page.evaluate(() => window.__frame);
  await page.waitForFunction(([f0, k]) => window.__frame > f0 + k, [f, n], { timeout: 60000 });
};
const press = async (code) => { await page.keyboard.down(code); await waitFrames(3); await page.keyboard.up(code); await waitFrames(2); };
let lastY = null;
for (;;) {
  await waitFrames(10);
  const y = (await page.evaluate(() => window.__player.pos))[1];
  if (lastY !== null && Math.abs(y - lastY) < 1e-4) break;
  lastY = y;
}
const S = 4, OX = 60, OY = 50;
const click = async (vx, vy) => { await page.mouse.click(OX + vx * S, OY + vy * S); await waitFrames(4); };
await page.evaluate(() => {
  window.__playerEntity.equip = null;
  window.__playerEntity.armorValues = null;
  window.__playerEntity.items = [
    { group: 'Armor', templateIndex: 102, material: 0x0200, variant: 1, name: 'Iron Cuirass' },
    { group: 'Weapons', templateIndex: 120, material: 0, name: 'Longsword' },
    { group: 'MensClothing', templateIndex: 151, variant: 0, dye: 2, name: 'Casual Pants' },
  ];
});
await press('F6');
const worn = () => page.evaluate(() => (window.__playerEntity.equip?.slots ?? []).filter(Boolean).map((i) => i.name));
await click(163 + 9 + 25, 48 + 19);
await click(163 + 9 + 25, 48 + 19);
console.log('worn after weapon-tab equips:', JSON.stringify(await worn()));
await click(208, 5);
await click(163 + 9 + 25, 48 + 19);
await waitFrames(10);
const w1 = await worn();
console.log('worn after pants:', JSON.stringify(w1));
if (w1.length !== 3) { console.log('EQUIP FAILED'); process.exit(1); }
await page.screenshot({ path: '/home/claude/equip-worn.png' });
// In DFU a paperdoll click in Remove mode does nothing; Equip mode is the one that unequips.
await click(226 + 15, 80 + 7);
await click(49 + 55, 13 + 70);
await waitFrames(6);
const inert = await worn();
console.log('worn after REMOVE-mode doll click (must be unchanged):', JSON.stringify(inert));
if (!inert.includes('Iron Cuirass')) { console.log('REMOVE-MODE DOLL CLICK SHOULD BE INERT'); process.exit(1); }
await click(226 + 15, 58 + 7);
await click(49 + 55, 13 + 70);
await waitFrames(10);
const w2 = await worn();
console.log('worn after EQUIP-mode doll click:', JSON.stringify(w2));
if (w2.includes('Iron Cuirass')) { console.log('UNEQUIP FAILED'); process.exit(1); }
await page.screenshot({ path: '/home/claude/equip-removed.png' });
await press('Escape');
await press('KeyZ');
await waitFrames(6);
await page.screenshot({ path: '/home/claude/equip-fp.png' });
console.log('EQUIP OK');
await browser.close(); await server.close();
