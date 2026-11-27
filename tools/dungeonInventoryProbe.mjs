// Browser probe: the dungeon opens the classic inventory window, and its info, use, and remove modes work,
// including a ground pile for dropped items. Run: node tools/dungeonInventoryProbe.mjs.
import { createServer } from 'vite';
import { chromium } from 'playwright';

const server = await createServer({ root: '/home/user/project-dagger', server: { port: 5202, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5202/play/?shot&class=0');
await page.waitForFunction(() => window.__frame > 10, null, { timeout: 180000 });
const waitFrames = async (n) => {
  const f = await page.evaluate(() => window.__frame);
  await page.waitForFunction(([f0, k]) => window.__frame > f0 + k, [f, n], { timeout: 60000 });
};

await page.evaluate(() => {
  window.__playerEntity.items = [
    { group: 'Weapons', templateIndex: 118, name: 'Broadsword', material: 1, currentCondition: 30, maxCondition: 60 },
    { group: 'UselessItems2', templateIndex: 247, name: 'Torch', currentCondition: 16, maxCondition: 16 },
    { group: 'Armor', templateIndex: 102, name: 'Iron Cuirass', material: 0x0200 },
  ];
});

// The action map cannot express F6, so the key goes through the real key path as a raw code.
await page.keyboard.press('F6');
await waitFrames(8);
let ov = JSON.parse(await page.evaluate(() => window.__overlay()) ?? 'null');
console.log('overlay:', JSON.stringify(ov));
if (ov?.kind !== 'NativeInventoryWindow') { console.log('THE DUNGEON DID NOT OPEN THE NATIVE WINDOW'); process.exit(1); }
await page.screenshot({ path: '/home/claude/dungeon-inventory.png' });

await page.evaluate(() => window.__overlayClick(230, 43));
await page.evaluate(() => window.__overlayClick(163 + 9 + 25, 48 + 5));
await waitFrames(4);
console.log('info:', JSON.parse(await page.evaluate(() => window.__overlay())).box);
await page.screenshot({ path: '/home/claude/dungeon-inventory-info.png' });
await page.evaluate(() => window.__overlayClick(10, 190));

await page.evaluate(() => window.__overlayClick(163 + 5, 5));
await page.evaluate(() => window.__overlayClick(230, 65));
await page.evaluate(() => window.__overlayClick(163 + 9 + 25, 48 + 5));
await waitFrames(4);
console.log('after equip-click on the torch:', JSON.parse(await page.evaluate(() => window.__overlay())).box,
  'lightSource=', await page.evaluate(() => window.__playerEntity.lightSource?.name ?? null));
await page.evaluate(() => window.__overlayClick(10, 190));

await page.evaluate(() => window.__overlayClick(0 + 5, 5));
await page.evaluate(() => window.__overlayClick(230, 87));
await page.evaluate(() => window.__overlayClick(163 + 9 + 25, 48 + 5));
await waitFrames(4);
ov = JSON.parse(await page.evaluate(() => window.__overlay()));
console.log('after remove:', JSON.stringify(ov));
await page.keyboard.press('Escape');
await waitFrames(8);
console.log('closed:', await page.evaluate(() => window.__overlay()));
console.log('ground piles:', await page.evaluate(() => window.__piles()));
const piles = JSON.parse(await page.evaluate(() => window.__piles()));
if (!piles.length || !piles[0].n) { console.log('THE DROPPED ITEM VANISHED - no ground pile'); process.exit(1); }
await waitFrames(10);
await page.screenshot({ path: '/home/claude/dungeon-pile.png' });

const took = await page.evaluate(() => window.__activate());
await waitFrames(6);
console.log('after activating the pile:', await page.evaluate(() => window.__overlay()), 'activate ->', took);

console.log('OK');
await browser.close();
await server.close();
process.exit(0);
