// Browser probe that measures the rendered height of every Features help note and fails past the ceiling.
// Run: npx vite --port 5199 & node tools/featureRailProbe.mjs.
import { chromium } from 'playwright';
import { FEATURES } from '../src/mods/features.js';

const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:5199';
const SHOTS = process.env.PROBE_SHOTS ?? '/tmp';
const MAX_NOTE_PX = 340;
const TILES = FEATURES.length;

const bad = [];
const check = (name, ok, detail = '') => {
  if (!ok) bad.push(`${name}${detail ? ` - ${detail}` : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${BASE}/play/?nointro`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.px-menu');
  if (await page.locator('.px-acctstage').count()) await page.keyboard.press('Escape');
await page.waitForSelector('.px-menu button');
await page.locator('.px-menu button').filter({ hasText: /Settings/ }).first().click();
await page.waitForSelector('#enhanced-menu .subbtn');

const tabs = await page.locator('#enhanced-menu .subbtn').count();
let tiles = 0;
const rows = [];
for (let t = 0; t < tabs; t++) {
  await page.locator('#enhanced-menu .subbtn').nth(t).click();
  await page.waitForTimeout(60);
  const n = await page.locator('#enhanced-menu .opt-body > .ft-tile').count();
  tiles += n;
  for (let i = 0; i < n; i++) {
    await page.locator('#enhanced-menu .opt-body > .ft-tile').nth(i).locator('.ft-tile-main').click();
    await page.waitForTimeout(40);
    rows.push(await page.evaluate(() => {
      const card = document.querySelector('#enhanced-menu .detail .ft-card');
      const note = card?.querySelector('.ft-rail-note');
      const head = card?.querySelector('h3');
      return {
        title: head?.textContent?.trim() ?? '',
        chars: note?.textContent?.length ?? 0,
        px: note ? Math.round(note.getBoundingClientRect().height) : 0,
      };
    }));
  }
}
await page.locator('#enhanced-menu .subbtn').first().click();
await page.locator('#enhanced-menu .opt-body > .ft-tile').first().locator('.ft-tile-main').click();
await page.screenshot({ path: `${SHOTS}/feature-rail.png` });

rows.sort((a, b) => b.px - a.px);
for (const r of rows) console.log(`${String(r.px).padStart(4)}px ${String(r.chars).padStart(4)}ch  ${r.title}`);
const tall = rows.filter((r) => r.px > MAX_NOTE_PX);
const total = rows.reduce((n, r) => n + r.chars, 0);
console.log(`\n${tiles} tiles, ${total} characters of note, tallest ${rows[0]?.px ?? 0}px (${rows[0]?.title ?? '-'})`);

check('every row in the registry drew a row, on one tab', tiles === TILES, `${tiles} of ${TILES}`);
check('every row answered the help pane', rows.every((r) => r.title && r.chars > 0),
  rows.filter((r) => !r.title || !r.chars).map((r) => r.title || '(no title)').join(', '));
check(`no note is taller than ${MAX_NOTE_PX}px`, tall.length === 0,
  tall.map((r) => `${r.title} ${r.px}px`).join('; '));
check('the panel raised no page error', errors.length === 0, errors.join(' | '));
if (bad.length) throw new Error(`the reading rail failed ${bad.length} check(s): ${bad.join(' | ')}`);
await browser.close();
