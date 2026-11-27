// Browser probe that measures every enhanced menu and wizard target against the 44 CSS px tap floor.
// Run: npx vite --port 5199 & node tools/enhancedTapProbe.mjs.
import { chromium, devices } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:5199';
const FLOOR = 44;

// A target's size includes any ::after the design uses to grow it past the drawn pill.
const MEASURE = (floor) => {
  const bad = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('#enhanced-menu button, #app button, #app input')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    let w = r.width;
    let h = r.height;
    const a = getComputedStyle(el, '::after');
    if (a.content && a.content !== 'none') {
      w = Math.max(w, parseFloat(a.width) || 0);
      h = Math.max(h, parseFloat(a.height) || 0);
    }
    if (w < floor || h < floor) {
      const key = `${el.className}|${Math.round(w)}x${Math.round(h)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      bad.push({ cls: el.className, w: Math.round(w), h: Math.round(h),
        text: el.textContent.trim().slice(0, 22) });
    }
  }
  return bad;
};

const browser = await chromium.launch();
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

for (const [label, opts] of [
  ['phone', { ...devices['Pixel 5'] }],
  ['phone-landscape', { ...devices['Pixel 5 landscape'] }],
]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/play/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#enhanced-menu .px-home');
  {
    const bad = await page.evaluate(MEASURE, FLOOR);
    check(`${label}: pixel home`, bad.length === 0, JSON.stringify(bad));
  }
  await page.locator('#enhanced-menu .px-menu button', { hasText: 'Load Game' }).click();
  await page.waitForSelector('#enhanced-menu .doorbtn');

  for (const pane of ['Continue', 'New Game', 'Load Game', 'Mods', 'About']) {
    await page.locator('#enhanced-menu .doorbtn', { hasText: pane }).click();
    const bad = await page.evaluate(MEASURE, FLOOR);
    check(`${label}: ${pane}`, bad.length === 0, JSON.stringify(bad));
  }

  await page.locator('#enhanced-menu .doorbtn', { hasText: 'Settings' }).click();
  await page.waitForSelector('#enhanced-menu .row');
  const cats = await page.locator('#enhanced-menu .subbtn').count();
  for (let i = 0; i < cats; i++) {
    const name = await page.locator('#enhanced-menu .subbtn').nth(i).textContent();
    // The sheet's close bar stays display:block while the sheet is off screen, so the open class is the state.
    if (await page.locator('#enhanced-menu .detail.open').count()) {
      await page.locator('#enhanced-menu .sheet-close').click();
      await page.waitForTimeout(280);
    }
    await page.locator('#enhanced-menu .subbtn').nth(i).click();
    await page.waitForTimeout(60);
    const bad = await page.evaluate(MEASURE, FLOOR);
    check(`${label}: Settings / ${name.trim()}`, bad.length === 0, JSON.stringify(bad));
  }
  await ctx.close();
}

for (const [label, opts] of [['phone', { ...devices['Pixel 5'] }]]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/chargen.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.prov', { timeout: 20000 });
  const at = async (name) => {
    const bad = await page.evaluate(MEASURE, FLOOR);
    check(`${label}: chargen / ${name}`, bad.length === 0, JSON.stringify(bad));
  };
  const primary = () => page.locator('.act.primary');
  await at('homeland');
  await page.evaluate(() => [...document.querySelectorAll('.prov:not(.inert)')][1]
    .dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(150);
  await at('homeland sheet');
  await primary().click();
  await at('sex');
  await page.locator('.bigbtn', { hasText: 'Woman' }).click();
  await at('class method');
  await page.locator('.bigbtn', { hasText: 'Choose from a list' }).click();
  await at('class list');
  await page.locator('.row-main').nth(1).click();
  await primary().click();
  await page.waitForTimeout(150);
  await at('class description');
  await primary().click();
  await at('history method');
  await page.locator('.bigbtn', { hasText: 'Answer twelve' }).click();
  await at('biography');
  for (let i = 0; i < 14; i++) {
    if (!(await page.locator('.answer').count())) break;
    await page.locator('.answer').first().click();
    await page.waitForTimeout(40);
  }
  await at('reputation box');
  if (await page.locator('.repbox').count()) await primary().click();
  await page.waitForTimeout(150);
  await at('name');
  await page.locator('.act', { hasText: 'Suggest one' }).click();
  await primary().click();
  await page.waitForTimeout(800);
  await at('face');
  await primary().click();
  await page.waitForTimeout(200);
  await at('attributes');
  for (let i = 0; i < 40; i++) {
    if (!(await primary().isDisabled())) break;
    await page.locator('.row .step').last().click();
  }
  await primary().click();
  await page.waitForTimeout(200);
  await at('skills');
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} surfaces clear of sub-${FLOOR}px targets`);
if (failed) process.exit(1);
