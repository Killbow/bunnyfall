// Presses the Climates and Calories tier bar in Settings and checks each tier's stored value.
// Usage: start `npx vite --port 5199` (or set PROBE_BASE), then run node tools/survTierProbe.mjs
// PROBE_SHOTS=<dir> also saves the tile's three states as PNGs.

import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:5199';
const SHOTS = process.env.PROBE_SHOTS ?? null;
const KEY = 'dagger.ui.v1';
const bad = [];
const check = (name, ok, detail = '') => { if (!ok) bad.push(name); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); };

const browser = await chromium.launch();
const open = async (shelf = null) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (shelf) await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} }, [KEY, JSON.stringify(shelf)]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/play/?nointro`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.px-menu button');
  if (await page.locator('.px-acctstage').count()) {
    await page.locator('.px-acctstage').click({ position: { x: 5, y: 5 } });
    await page.waitForSelector('.px-acctstage', { state: 'detached' });
  }
  await page.locator(':is(.doorbtn, .px-homelink).door-settings').first().click();
  await page.locator('#enhanced-menu .subbtn').filter({ hasText: /^Gameplay/ }).first().click();
  await page.waitForSelector('.ft-tile');
  const tile = page.locator('.ft-tile').filter({ hasText: 'Climates & Calories' }).first();
  return { ctx, page, tile, errors };
};
const segs = async (tile) => tile.locator('.ft-segb').evaluateAll((bs) => bs.map((b) => ({ label: b.textContent.trim(), pressed: b.getAttribute('aria-pressed') === 'true' })));
const stored = (page) => page.evaluate((k) => { const shelf = JSON.parse(localStorage.getItem(k) ?? '{}'); return Object.hasOwn(shelf, 'survival') ? shelf.survival : '(nothing)'; }, KEY);
const shot = async (tile, name) => { if (SHOTS) await tile.screenshot({ path: `${SHOTS}/${name}.png` }); };

{
  const { ctx, page, tile, errors } = await open();
  const s = await segs(tile);
  check('three segments, in order', JSON.stringify(s.map((x) => x.label)) === JSON.stringify(['Off', 'Casual', 'Hard']), s.map((x) => x.label).join(' | '));
  check('Casual is pressed on a fresh shelf', s.find((x) => x.pressed)?.label === 'Casual');
  check('the tile reads on', (await tile.getAttribute('data-on')) === '1');
  await tile.locator('.ft-tile-main').click();
  await page.waitForTimeout(60);
  const note = await page.evaluate(() => document.querySelector('.detail .ft-card .ft-rail-note')?.textContent ?? '');
  check('the help pane says what each tier costs', /On Casual, unmet needs only drain some stamina/.test(note) && /comes back once you\u2019ve seen to them/.test(note) && /on Hard they cost attributes and health/.test(note) && /Off is the classic game/.test(note), note.slice(0, 160));
  await shot(tile, 'surv-tier-casual');
  await tile.locator('.ft-segb').filter({ hasText: 'Hard' }).click();
  check('pressing Hard stores the tier by name', (await stored(page)) === 'hard', String(await stored(page)));
  check('...and the bar follows', (await segs(tile)).find((x) => x.pressed)?.label === 'Hard');
  await shot(tile, 'surv-tier-hard');
  await tile.locator('.ft-segb').filter({ hasText: 'Off' }).click();
  check('pressing Off stores the old switch\'s own false', (await stored(page)) === false, String(await stored(page)));
  check('the tile reads off', (await tile.getAttribute('data-on')) === '0');
  await shot(tile, 'surv-tier-off');
  await tile.locator('.ft-segb').filter({ hasText: 'Casual' }).click();
  check('back to Casual stores nothing (the default is not a choice)', (await stored(page)) === '(nothing)');
  check('no page error', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
{
  const { ctx, page, tile, errors } = await open({ survival: false, _rev: 1, open: {} });
  const s = await segs(tile);
  check('an old Off shelf opens on Off', s.find((x) => x.pressed)?.label === 'Off', s.map((x) => `${x.label}${x.pressed ? '*' : ''}`).join(' | '));
  check('no page error (old shelf)', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
{
  const { ctx, page, tile, errors } = await open({ survival: 'false', _rev: 1, open: {} });
  const s = await segs(tile);
  check('a hand-edited "false" string opens on the default, not Off', s.find((x) => x.pressed)?.label === 'Casual', s.map((x) => `${x.label}${x.pressed ? '*' : ''}`).join(' | '));
  check('no page error (junk shelf)', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close();
if (bad.length) { console.log(`\n${bad.length} FAILED`); process.exit(1); }
console.log('\nall checks passed');
