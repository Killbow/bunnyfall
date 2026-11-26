// Browser probe for the Settings tabs that hold the feature registry: rows, filters, presets, and search.
// Run: npx vite --port 5199 & node tools/featuresProbe.mjs.
import { chromium } from 'playwright';
import { FEATURES } from '../src/mods/features.js';

const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:5199';
const SHOTS = process.env.PROBE_SHOTS ?? null;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${BASE}/play/?nointro`, { waitUntil: 'networkidle' });
await page.waitForSelector('.px-menu button', { timeout: 15000 });
if (await page.locator('.px-acctstage').count()) await page.keyboard.press('Escape');
check('ORG2: no Features door - its rows are Settings\' tabs', (await page.locator('.px-menu .door-features').count()) === 0);
await page.locator(':is(.px-menu, .px-foot) .door-settings').click();
await page.waitForSelector('#enhanced-menu .subbtn', { timeout: 10000 });

const tabNames = await page.$$eval('#enhanced-menu .subbtn', (bs) => bs.map((b) => b.firstChild.textContent.trim()));
check('the rail is the nine tabs, Graphics first', tabNames.join('|') === 'Graphics|Gameplay|Combat|World|Interface|Audio|Controls|Accessibility|Mods & files', tabNames.join('|'));
const pressTab = async (name) => { await page.locator('#enhanced-menu .subbtn').filter({ hasText: new RegExp(`^${name.replace(/[&]/g, '\\$&')}`) }).first().click(); await page.waitForTimeout(150); };

const drawn = new Map();
for (const name of tabNames) {
  await pressTab(name);
  const tab = await page.evaluate(() => {
    const body = document.querySelector('#enhanced-menu .opt-body');
    const tiles = [...body.querySelectorAll(':scope > .ft-tile')];
    const rows = body.querySelectorAll(':scope > .row:not([data-live="0"]):not(.opt-link), :scope > .ft-tile').length;
    const on = document.querySelector('#enhanced-menu .subbtn.on .count');
    return { ids: tiles.map((t) => t.dataset.fid), labelled: tiles.every((t) => t.querySelector('.kind')), rows, count: Number(on?.textContent) };
  });
  for (const id of tab.ids) drawn.set(id, (drawn.get(id) ?? 0) + 1);
  check(`${name}: every row wears a label`, tab.labelled);
  check(`${name}: the rail counts what the tab draws`, tab.count === tab.rows, `${tab.count} on the rail, ${tab.rows} drawn`);
}
const missing = FEATURES.filter((f) => !drawn.has(f.id)).map((f) => f.id);
check('every registry row is drawn on a tab', missing.length === 0, missing.join(', '));
check('...and only once', [...drawn.values()].every((n) => n === 1));

await pressTab('World');
await page.locator('#enhanced-menu .opt-filters .chip.mod').click(); await page.waitForTimeout(150);
const worldMods = await page.$$eval('#enhanced-menu .opt-body > .ft-tile', (ts) => ts.map((t) => [...t.querySelectorAll('.kind')].map((k) => k.className)));
check('the Mods filter keeps the mods\' rows alone', worldMods.length > 0 && worldMods.every((ks) => ks.some((c) => /\bmod\b/.test(c))), `${worldMods.length} rows`);
await page.locator('#enhanced-menu .opt-filters .chip').first().click(); await page.waitForTimeout(150);

await pressTab('Graphics');
const preset = () => page.$$eval('#enhanced-menu .opt-preset .ft-segb', (bs) => bs.map((b) => `${b.textContent}${b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-current') === 'true' ? '*' : ''}`).join(' '));
check('a fresh shelf reads High - how the game ships', (await preset()) === 'Low Medium High* Ultra', await preset());
await page.locator('#enhanced-menu .opt-preset .ft-segb', { hasText: /^Low$/ }).click(); await page.waitForTimeout(150);
const stores = await page.evaluate(async () => {
  const p = await import('/src/ui/uiPrefs.js'); p._resetForTests();
  const s = await import('/src/platform/settings.js'); s._resetForTests();
  return { view: p.getPref('landViewDistance'), ini: s.getInt('Experimental', 'TerrainDistance', 1, 4), grass: p.getPref('grassDensity'), water: p.getPref('waterQuality') };
});
check('Low wrote every row it sets, the view distance in BOTH stores', stores.view === 3 && stores.ini === 3 && stores.grass === 0.25 && stores.water === 'simple', JSON.stringify(stores));
check('...and the bar reads Low', (await preset()) === 'Low* Medium High Ultra', await preset());
if (SHOTS) await page.screenshot({ path: `${SHOTS}/options-graphics.png` });
await page.locator('#enhanced-menu .ft-tile', { hasText: 'Water quality' }).locator('.ft-segb', { hasText: /^Full/ }).click(); await page.waitForTimeout(150);
check('a row moved off the preset reads Custom', /Custom\*/.test(await preset()), await preset());
await page.locator('#enhanced-menu .opt-preset .ft-segb', { hasText: /^High$/ }).click(); await page.waitForTimeout(150);
check('High puts them back', (await preset()) === 'Low Medium High* Ultra', await preset());

await page.locator('#enhanced-menu .opt-search').fill('footsteps'); await page.waitForTimeout(150);
const found = await page.$$eval('#enhanced-menu .opt-body .sec-head h3', (hs) => hs.map((h) => h.textContent));
check('the search finds a row on another tab, under its Tab > Section head', found.some((t) => /^Audio › Sounds$/.test(t)), found.join(' | '));
check('...and the rail lights no tab while it reads them all', (await page.locator('#enhanced-menu .subbtn.on').count()) === 0);
await page.locator('#enhanced-menu .opt-search').fill(''); await page.waitForTimeout(150);

await pressTab('Gameplay');
const smaller = await page.evaluate(() => [...document.querySelectorAll('#enhanced-menu .opt-body .row-name, #enhanced-menu .opt-body .ft-tile-name')].filter((n) => /Smaller dungeons/i.test(n.textContent)).map((n) => n.className));
check('FT13: Smaller dungeons is drawn once, by its Features row - not a second switch, not a pointer', smaller.length === 1 && smaller[0] === 'ft-tile-name' && (await page.locator('#enhanced-menu .row.moved').count()) === 0, JSON.stringify(smaller));

await page.locator('#enhanced-menu .railbtn', { hasText: 'Test Room' }).click(); await page.waitForTimeout(200);
check('FT12: the Test Room carries the outdoors test door', (await page.locator('#enhanced-menu .row-name', { hasText: 'Test the outdoors' }).count()) === 1);
check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
