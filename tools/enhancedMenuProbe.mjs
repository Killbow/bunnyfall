// Checks the Enhanced front door with no game data: the menu and settings work, and the folder pick waits
// for a game to start. Run with no ARENA2 on disk: npx vite --port 5199 & node tools/enhancedMenuProbe.mjs.
import { chromium, devices } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:5199';
const shots = process.env.PROBE_SHOTS ?? '/tmp';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();

async function run(label, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`${BASE}/play/?nointro`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.px-menu', { timeout: 60000 });
  if (await page.locator('.px-acctstage').count()) await page.keyboard.press('Escape');
  await page.waitForSelector('.px-menu button', { timeout: 15000 });

  const doors = (await page.locator('.px-menu button').allInnerTexts()).map((t) => t.replace(/\u25c6/g, '').trim().toUpperCase());
  check(`${label}: the menu draws with no ARENA2`, doors.length > 0, `${doors.length} doors`);
  for (const want of ['SETTINGS', 'OVERHAULS']) {
    check(`${label}: the ${want.toLowerCase()} door is on the rail`, doors.includes(want), doors.join(' / '));
  }

  const foot = await page.evaluate(() => {
    const about = document.querySelector('.px-foot .px-about:not(.px-shots)');
    const b = about?.getBoundingClientRect();
    return { toggle: Boolean(document.querySelector('.skinswitch, .skinopt')), right: b ? Math.round(innerWidth - b.right) : null };
  });
  check(`${label}: the foot carries no skin toggle, and About stands at its right`, !foot.toggle && foot.right != null && foot.right <= 24, JSON.stringify(foot));
  check(`${label}: the folder pick has NOT been asked for`,
    (await page.locator('#pick').count()) === 0);

  await page.locator('.px-menu button').filter({ hasText: /Settings/ }).first().click();
  await page.waitForSelector('#enhanced-menu .row');
  await page.locator('#enhanced-menu .subbtn').filter({ hasText: /^Gameplay/ }).first().click();
  await page.waitForTimeout(200);
  const rows = await page.locator('#enhanced-menu .row').count();
  check(`${label}: settings rows render`, rows > 10, `${rows} rows`);

  const before = await page.evaluate(async () => {
    const s = await import('/src/platform/settings.js');
    return s.effectiveSettings().Enhancements.LoiterLimitInHours;
  });
  await page.locator('#enhanced-menu .row', { hasText: 'Maximum Wait Time' })
    .locator('.step').last().click();
  const after = await page.evaluate(async () => {
    const s = await import('/src/platform/settings.js');
    s._resetForTests();
    return s.effectiveSettings().Enhancements.LoiterLimitInHours;
  });
  check(`${label}: a setting changed and PERSISTED`, String(before) !== String(after),
    `${before} -> ${after}`);

  await page.screenshot({ path: `${shots}/door-${label}.png` });

  await page.goto(`${BASE}/play/?nointro`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.px-menu', { timeout: 60000 });
  if (await page.locator('.px-acctstage').count()) await page.keyboard.press('Escape');
  await page.locator('.px-menu button').filter({ hasText: /Settings/ }).first().click();
  await page.waitForSelector('#enhanced-menu .ft-tile', { timeout: 10000 });
  const skyTile = page.locator('#enhanced-menu .ft-tile')
    .filter({ has: page.locator('.ft-tile-name', { hasText: /^Enhanced environments$/ }) });
  const pane = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('#enhanced-menu .ft-tile')];
    const sky = tiles.find((t) => t.querySelector('.ft-tile-name')?.textContent === 'Enhanced environments');
    const pressed = sky?.querySelector('.ft-segb[aria-pressed="true"]');
    return {
      rows: tiles.length,
      sky: pressed ? pressed.textContent : null,
      skyTarget: pressed ? Math.round(pressed.getBoundingClientRect().height) : 0,
      labels: sky ? [...sky.querySelectorAll('.kind')].map((k) => k.textContent) : [],
    };
  });
  check(`${label}: the Graphics tab opens with its Features rows`, pane.rows >= 15 && pane.sky !== null, JSON.stringify(pane));
  check(`${label}: the outdoors read Dynamic Skies by default, wearing both labels`,
    pane.sky === 'Dynamic Skies' && pane.labels.join('+') === 'Enhanced+Mod Authored', JSON.stringify(pane));
  if (label === 'phone') check("phone: the outdoors switch is a thumb's target", pane.skyTarget >= 38, `${pane.skyTarget}px`);
  await skyTile.locator('.ft-segb', { hasText: /^Off/ }).first().click();
  const skyOff = await page.evaluate(async () => {
    const m = await import('/src/ui/uiPrefs.js');
    m._resetForTests();
    return m.getPref('enhancedEnvironments');
  });
  check(`${label}: the outdoors switch PERSISTS`, skyOff === false, String(skyOff));
  await skyTile.locator('.ft-segb', { hasText: /Dynamic Skies/ }).first().click();

  await page.goto(`${BASE}/play/?nointro`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.px-menu', { timeout: 60000 });
  if (await page.locator('.px-acctstage').count()) await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.px-menu button', { timeout: 10000 });
  await page.locator('.px-menu button').filter({ hasText: /New Game/ }).first().click();
  await page.locator('#enhanced-menu .act.primary', { hasText: 'Begin' }).click();
  const picked = await page.waitForSelector('#pick', { timeout: 15000 }).then(() => true, () => false);
  check(`${label}: Begin raises the ARENA2 pick`, picked);
  check(`${label}: the menu is gone`, (await page.locator('#enhanced-menu').count()) === 0);
  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));

  await ctx.close();
}

await run('desktop', { viewport: { width: 1400, height: 900 } });
await run('phone', { ...devices['Pixel 5'] });

{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/play/?skin=classic&nointro`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.px-menu', { timeout: 60000 });
  if (await page.locator('.px-acctstage').count()) await page.keyboard.press('Escape');
  await page.waitForSelector('.px-menu button', { timeout: 20000 });
  const st = await page.evaluate(() => JSON.parse(window.__menu()));
  check('classic: the enhanced door mounts with the classic rail', JSON.stringify(st.sections) === JSON.stringify(['begin', 'online', 'settings', 'overhauls', 'screenshots', 'about']), JSON.stringify(st.sections));
  if (await page.locator('.px-acctstage').count()) await page.keyboard.press('Escape');
  await page.locator('.px-menu .door-begin').click();
  await page.locator('#enhanced-menu .act.primary', { hasText: 'Begin' }).click();
  const picked = await page.waitForSelector('#pick', { timeout: 15000 }).then(() => true, () => false);
  check('classic: Begin gates the data before its own start sequence', picked);
  await ctx.close();
}

{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/play/?nointro`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.px-menu', { timeout: 60000 });
  if (await page.locator('.px-acctstage').count()) await page.keyboard.press('Escape');
  await page.waitForSelector('.px-menu button', { timeout: 20000 });
  await page.locator('.px-menu button').filter({ hasText: /Overhauls/ }).first().click();
  const ui = page.locator('.look-panel[data-panel="ui"]');
  await ui.waitFor({ timeout: 20000 });
  for (let i = 0; i < 3 && (await ui.locator('.look-name').innerText()).trim() !== 'Classic'; i++) await ui.locator('.look-arrow').last().click();
  await ui.locator('.look-use').click();
  await page.waitForSelector('.px-menu .door-begin', { timeout: 60000 });
  if (await page.locator('.px-acctstage').count()) await page.keyboard.press('Escape');
  await page.locator('.px-menu .door-begin').click();
  await page.locator('#enhanced-menu .act.primary', { hasText: 'Begin' }).click();
  const picked = await page.waitForSelector('#pick', { timeout: 15000 }).then(() => true, () => false);
  check('use Classic on the UI card: the classic door opens, data first', picked && (await page.locator('#enhanced-menu').count()) === 0);
  check('use Classic: the URL carries no override - the choice is STORED', !new URL(page.url()).searchParams.has('skin'));
  const stored = await page.evaluate(async () => { const { uiSkin } = await import('/src/ui/uiSkin.js'); return uiSkin(''); });
  check('use Classic: uiSkin reads classic with no URL at all', stored === 'classic');
  await page.evaluate(() => localStorage.clear());
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
