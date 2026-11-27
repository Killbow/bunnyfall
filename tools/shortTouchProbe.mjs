// Checks that each title screen pane and its first button fit on short landscape touch screens.
// Usage: start `npx vite --port 5199` (or set PROBE_BASE), then run `node tools/shortTouchProbe.mjs`

import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:5199';
const PANE_FLOOR = 200;
const SCREENS = [
  ['AYN Thor top screen (1920x1080 @ 2.625)', 731, 411],
  ['short handheld (1920x1080 @ 2.75)', 698, 393],
  ['Pixel 5 landscape', 851, 393],
  ['ASUS ROG Xbox Ally X (1920x1080 @ 1.5) - TALL-TOUCH', 1280, 720],
  ['Ally X at 2.25 (a narrowed page)', 853, 480],
  ['handheld with the toolbar showing', 731, 355],
];
const DOORS = ['Continue', 'New Game', 'Load Game', 'Online', 'Test Room', 'Settings'];

const browser = await chromium.launch();
let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

for (const [label, width, height] of SCREENS) {
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/play/?nointro`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#enhanced-menu .px-home');
  const win = page.locator('#enhanced-menu .px-acctwin');
  if (await win.count()) {
    const r = await win.boundingBox();
    check(`${label}: the sign-in window fits`, !!r && r.y >= 0 && r.y + r.height <= height + 1, JSON.stringify(r));
    await page.mouse.click(4, height - 4);
  }
  await page.locator('#enhanced-menu .px-menu button', { hasText: 'Load Game' }).click();
  await page.waitForSelector('#enhanced-menu .shell');
  for (const door of DOORS) {
    const btn = page.locator('#enhanced-menu .rail .railbtn', { hasText: door }).first();
    if (!(await btn.count())) { check(`${label}: ${door}`, false, 'no rail entry'); continue; }
    await btn.scrollIntoViewIfNeeded();
    const rb = await btn.boundingBox();
    check(`${label}: the ${door} rail entry is on the screen`, !!rb && rb.y >= 0 && rb.y + rb.height <= height + 1, JSON.stringify(rb));
    await btn.click();
    await page.waitForTimeout(80);
    const pane = await page.locator('#enhanced-menu .shell > .pane').boundingBox();
    const shown = pane ? Math.max(0, Math.min(pane.y + pane.height, height) - Math.max(pane.y, 0)) : 0;
    check(`${label}: the ${door} pane shows ${Math.round(shown)} px`, shown >= PANE_FLOOR);
    const first = page.locator('#enhanced-menu .shell > .pane .body button, #enhanced-menu .shell > .pane .list button').first();
    if (await first.count()) {
      await first.scrollIntoViewIfNeeded().catch(() => {});
      const fb = await first.boundingBox();
      check(`${label}: the ${door} pane's first button can be reached`, !!fb && fb.height > 0 && fb.y >= 0 && fb.y + fb.height <= height + 1, JSON.stringify(fb));
    }
  }
  await ctx.close();
}
await browser.close();
console.log(failed ? `${failed} check(s) FAILED` : 'every door can be seen and pressed');
process.exit(failed ? 1 : 0);
