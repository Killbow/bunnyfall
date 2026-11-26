// Browser probe for bare-handed swings in the dungeon host, including the strike frame with nothing in reach.
// Run: ARENA2_PATH=... node tools/fistProbe.mjs (starts its own dev server).
import { createServer } from 'vite';
import { chromium } from 'playwright';
const server = await createServer({ root: '/home/user/project-dagger', server: { port: 5199, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', (e.stack ?? e.message).split('\n').slice(0, 3).join(' | ')); });
await page.goto('http://localhost:5199/play/?shot&class=16&nofoes');
await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 240000 });
const waitFrames = async (n) => {
  const f = await page.evaluate(() => window.__frame);
  await page.waitForFunction(([f0, k]) => window.__frame > f0 + k, [f, n], { timeout: 60000 });
};
const boot = await page.evaluate(async () => {
  const { EQUIP_SLOTS } = await import('/src/characters/equip.js');
  const p = window.__playerEntity;
  return { hand: p.equip?.slots?.[EQUIP_SLOTS.RightHand]?.name ?? null };
});
console.log('right hand at boot:', JSON.stringify(boot.hand), '(null = bare hands, the default)');
if (boot.hand !== null) { console.log('EXPECTED BARE HANDS AT BOOT'); process.exit(1); }
await page.evaluate(() => { window.__combat.toggleSheath(); window.__combat.clickAttack(); });
await waitFrames(40);
await page.evaluate(() => window.__combat.clickAttack());
await waitFrames(10);
await page.screenshot({ path: '/home/claude/fist-swing.png' });
await waitFrames(30);
console.log('fist swing errors:', errors.length);
if (errors.length) { console.log('FIST SWING STILL THROWS'); process.exit(1); }
console.log('FIST SWING OK');
await browser.close(); await server.close();
