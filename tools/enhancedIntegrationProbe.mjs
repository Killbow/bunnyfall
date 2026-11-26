// Checks that the running game mounts the Enhanced character creation wizard after New Game, and the classic skin
// does not. Run: ARENA2_PATH=... npx vite --port 5199 & node tools/enhancedIntegrationProbe.mjs.
import { chromium, devices } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:5199';
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();

for (const [label, opts] of [
  ['desktop', { viewport: { width: 1400, height: 900 } }],
  ['phone', { ...devices['Pixel 5'] }],
]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${BASE}/play/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#enhanced-menu .doorbtn', { timeout: 30000 });
  if (await page.locator('#enhanced-menu .doorbtn.door-offline').count()) await page.locator('#enhanced-menu .doorbtn.door-offline').click();
  await page.locator('#enhanced-menu .doorbtn.door-new').click();
  await page.locator('#enhanced-menu .act.primary', { hasText: 'Begin' }).click();

  // The world keeps rendering behind the overlay at seconds per frame in software, so the timeouts are long.
  const mounted = await page.waitForSelector('#enhanced-chargen .prov', { timeout: 180000 })
    .then(() => true, () => false);
  check(`${label}: New Game mounts the ENHANCED wizard`, mounted);
  if (mounted) {
    const provs = await page.locator('#enhanced-chargen .prov').count();
    check(`${label}: the map traced from the game's ARENA2`, provs === 9, `${provs} regions`);
    const st = JSON.parse(await page.evaluate(() => window.__chargen()));
    check(`${label}: the wizard starts on Homeland`, st.state === 'race', st.state);
  }
  check(`${label}: no page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/play/?skin=classic`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(20000);
  const dom = await page.evaluate(() => !!document.querySelector('#enhanced-chargen'));
  check('classic: the DOM wizard never mounts', !dom);
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
if (failed) process.exit(1);
