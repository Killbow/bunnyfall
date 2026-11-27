// Probe: buys and sells on the classic trade screen by clicking its item lists.
// ?class=16 skips character creation, whose overlay would take every key.
import { createServer } from 'vite';
import { chromium } from 'playwright';
const SHOP_TYPES = new Set([0, 2, 5, 6, 7, 8, 9, 12, 13]);
const server = await createServer({ root: '/home/user/project-dagger', server: { port: 5199, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5199/play/?shot&play&exterior&time=12:00&class=16');
await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 180000 });
await page.evaluate(() => {
  window.__playerEntity.items = window.__playerEntity.items ?? [];
  // Gold is added the game's way, because a hand-built currency item does not stack with the starting gold.
  window.__addGold(20000);
});
const doors = JSON.parse(await page.evaluate(() => JSON.stringify(window.__doors())));
let pick = null;
for (let i = 0; i < doors.length && !pick; i++) {
  const b = JSON.parse(await page.evaluate((j) => window.__buildingAt(j), i));
  if (b && SHOP_TYPES.has(b.buildingType)) pick = { i, b, door: doors[i] };
}
if (!pick) { console.log('NO SHOP DOOR'); process.exit(1); }
console.log('shop:', JSON.stringify(pick.b.name ?? ''), 'type', pick.b.buildingType, 'q', pick.b.quality);
const { pos, normal } = pick.door;
await page.evaluate(([x, y, z, yaw]) => window.__pose(x, y, z, yaw, -0.05),
  [pos[0] + normal[0] * 1.5, pos[1] - 1.2, pos[2] + normal[2] * 1.5, Math.atan2(-normal[0], -normal[2])]);
if (!await page.evaluate(() => window.__enter())) { console.log('ENTER FAILED'); process.exit(1); }
const waitFrames = async (n) => {
  const f = await page.evaluate(() => window.__frame);
  await page.waitForFunction(([f0, k]) => window.__frame > f0 + k, [f, n], { timeout: 60000 });
};
await waitFrames(6);
let o = JSON.parse(await page.evaluate(() => window.__openShelf(0)));
console.log('opened:', JSON.stringify(o));
if (!o?.native) { console.log('NOT THE NATIVE TRADE SCREEN'); process.exit(1); }
await waitFrames(12);
await page.screenshot({ path: '/home/claude/trade-native.png' });
const S = 4, OX = 60, OY = 50;
const click = async (vx, vy) => { await page.mouse.click(OX + vx * S, OY + vy * S); await waitFrames(3); };
const gold = () => page.evaluate(() => window.__playerEntity.items.find((i) => i.group === 'Currency')?.stackCount ?? 0);
const g0 = await gold();
if (o.remote > 0) {
  await click(290, 68);
  o = JSON.parse(await page.evaluate(() => window.__shopOverlay()));
  // A click only stages the item; the mode action button commits it, and a purchase then asks for the haggle offer.
  console.log('after the stage click:', JSON.stringify(o));
  if (!(o.basket > 0 && o.cost > 0 && o.canCommit)) { console.log('STAGE CLICK FAILED'); process.exit(1); }
  await click(226 + 15, 134 + 7);
  o = JSON.parse(await page.evaluate(() => window.__shopOverlay()));
  if (!(o.box?.buttons === 'YesNo')) { console.log('NO HAGGLE OFFER', JSON.stringify(o.box)); process.exit(1); }
  console.log('the offer:', o.box.rows.join(' '));
  await page.keyboard.press('y');
  await waitFrames(4);
  o = JSON.parse(await page.evaluate(() => window.__shopOverlay()));
  const g1 = await gold();
  console.log('after BUY:', JSON.stringify(o), 'gold', g0, '->', g1);
  if (!(g1 < g0)) { console.log('BUY COMMIT FAILED'); process.exit(1); }
  await waitFrames(8);
  await page.screenshot({ path: '/home/claude/trade-native-bought.png' });
  // In Buy mode a click on the local list unstages an item, so selling needs the sell window.
  o = JSON.parse(await page.evaluate(() => window.__openMerchantSell()));
  await waitFrames(8);
  console.log('sell window:', JSON.stringify(o));
  if (o?.mode !== 'Sell') { console.log('SELL MODE DID NOT OPEN'); process.exit(1); }
  if (o.local > 0) {
    await click(192, 68);
    o = JSON.parse(await page.evaluate(() => window.__shopOverlay()));
    console.log('after the stage click:', JSON.stringify(o));
    if (!(o.staged > 0 && o.cost > 0)) { console.log('SELL STAGE FAILED'); process.exit(1); }
    await click(226 + 15, 134 + 7);
    o = JSON.parse(await page.evaluate(() => window.__shopOverlay()));
    if (o.box?.buttons === 'YesNo') { await page.keyboard.press('y'); await waitFrames(4); }
    o = JSON.parse(await page.evaluate(() => window.__shopOverlay()));
    const g2 = await gold();
    console.log('after SELL:', JSON.stringify(o), 'gold', g1, '->', g2);
    if (!(g2 > g1)) { console.log('SELL COMMIT FAILED'); process.exit(1); }
  }
} else {
  console.log('empty shelf (valid stock roll) - the screen rendered');
}
await page.evaluate(() => window.__tradeClick('exit'));
await waitFrames(3);
o = JSON.parse(await page.evaluate(() => window.__shopOverlay()));
console.log('after __tradeClick exit:', o);
if (o) { console.log('THE HOOK DID NOT SWEEP THE CLOSED WINDOW'); process.exit(1); }

o = JSON.parse(await page.evaluate(() => window.__openShelf(0)));
await waitFrames(6);
if (!o?.native) { console.log('REOPEN FAILED'); process.exit(1); }
await click(241, 188);
o = JSON.parse(await page.evaluate(() => window.__shopOverlay()));
console.log('after pointer exit:', o);
if (o) { console.log('DID NOT CLOSE'); process.exit(1); }
console.log('NATIVE TRADE OK');
await browser.close(); await server.close();
