// Draws the Collections page on desktop and phone, signed in and out, and checks its filters and keyboard use.
// Run: npx vite --port 5199 & COLL_OUT=<scratch dir> node tools/collectionsProbe.mjs (COLL_LANG=de for German).

import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:5199';
const OUT = process.env.COLL_OUT ?? '/tmp/collections-probe';
const LANG = process.env.COLL_LANG ?? '';
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); };

const WARDROBE_AT_START = () => ({
  titles: ['founder', 'gatebreaker', 'hourbreaker', 'spirewalker', 'kynbane'], title: 'gatebreaker',
  glyphs: ['sprout'], auras: ['dagonfire', 'beaconlight'], aura: 'dagonfire', insignia: ['title:gatebreaker', 'aura:dagonfire'],
  icons: ['twinmoons'], icon: null,
});
let WARDROBE = WARDROBE_AT_START();
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };

async function serve(page) {
  await page.route(/\/v1\/account(\/.*)?$/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET') return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ account: { id: 'a1', name: 'Aelwyn', kind: 'linked' }, wardrobe: WARDROBE }) });
    const body = JSON.parse(req.postData() || '{}');
    if ('title' in body) WARDROBE.title = body.title;
    if ('aura' in body) WARDROBE.aura = body.aura;
    if ('icon' in body) WARDROBE.icon = body.icon;
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(WARDROBE) });
  });
}

async function toPause(page, signedIn) {
  await page.addInitScript((on) => {
    try {
      localStorage.setItem('dagger.quicksave', JSON.stringify({ v: 1, name: 'Aelwyn', chargenDone: true, career: { name: 'Spellsword' }, level: 4, items: [] }));
      if (on) localStorage.setItem('dagger.account.session', JSON.stringify({ id: 'a1', name: 'Aelwyn', kind: 'linked', sessionId: 's1', secret: 'probe-secret' }));
    } catch { }
  }, signedIn);
  await page.goto(`${BASE}/play/?nointro${LANG ? `&lang=${LANG}` : ''}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.px-menu', { timeout: 120000 });
  if (await page.locator('.px-acctstage').count()) await page.keyboard.press('Escape');
  await page.evaluate(async () => {
    const { openPauseFlow } = await import('/src/ui/pauseDoor.js');
    openPauseFlow(() => {}, { at: 'collections', exitToMenu: () => {}, textLines: () => null });
  });
  await page.waitForSelector('.coll-parts', { timeout: 15000 });
}

const browser = await chromium.launch();
for (const [label, opts] of [['desktop', { viewport: { width: 1280, height: 860 } }], ['phone', devices['iPhone 13']]]) {
  for (const signedIn of [true, false]) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    WARDROBE = WARDROBE_AT_START();
    if (signedIn) await serve(page);
    await toPause(page, signedIn);
    const tag = `${LANG ? `${LANG}-` : ''}${label}-${signedIn ? 'in' : 'out'}`;
    if (signedIn) await page.waitForFunction(() => /\d+ \/ \d+/.test(document.querySelector('.coll-part')?.textContent ?? ''), null, { timeout: 10000 }).catch(() => {});
    const tiles = await page.$$eval('.coll-part', (ns) => ns.map((n) => n.textContent));
    check(`${tag}: the parts' tiles`, tiles.length >= 4, tiles.join(' | '));
    check(`${tag}: the titles' count`, signedIn ? new RegExp(`(^|\\D)${WARDROBE.titles.length} / \\d+`).test(tiles[0]) : /– \//.test(tiles[0]), tiles[0]);
    await page.screenshot({ path: `${OUT}/${tag}-titles.png` });
    if (signedIn) {
      await page.locator('[data-focus="coll-filter-held"]').click();
      const held = await page.locator('.coll-row').count();
      check(`${tag}: Held lists what is held`, held === WARDROBE.titles.length, `${held} rows`);
      await page.screenshot({ path: `${OUT}/${tag}-held.png` });
      await page.locator('[data-focus="coll-filter-all"]').click();
    } else check(`${tag}: no Held filter unread`, (await page.locator('[data-focus="coll-filter-held"]').count()) === 0);
    await page.locator('[data-wardrobe="title:gatebreaker"]').click();
    await page.locator('.coll-whole').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/${tag}-opened.png` });
    check(`${tag}: a row opens whole`, (await page.locator('.coll-whole').count()) === 1);
    if (signedIn) {
      check(`${tag}: a held row offers its press`, (await page.locator('.coll-wear').count()) === 1);
      const reached = await page.evaluate(async () => {
        const { spatialStep } = await import('/src/ui/plusPad.js');
        const r = document.querySelector('[data-wardrobe="title:gatebreaker"]').getBoundingClientRect();
        const to = spatialStep([r.left + r.width / 2, r.top + r.height / 2], 'down');
        const w = document.querySelector('.coll-wear').getBoundingClientRect();
        return !!to && to[0] >= w.left && to[0] <= w.right && to[1] >= w.top && to[1] <= w.bottom;
      });
      check(`${tag}: the pad steps from the row to its press`, reached);
      await page.locator('.coll-wear').focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => !document.querySelector('[data-wardrobe="title:gatebreaker"] .is-worn'), null, { timeout: 10000 }).catch(() => {});
      const after = await page.evaluate(() => ({ worn: !!document.querySelector('[data-wardrobe="title:gatebreaker"] .is-worn'), focus: document.activeElement?.getAttribute('data-focus') ?? document.activeElement?.tagName }));
      check(`${tag}: Take off answered`, !after.worn && WARDROBE.title === null, JSON.stringify({ ...after, served: WARDROBE.title }));
      check(`${tag}: the keyboard kept on the press`, after.focus === 'coll-wear-title-gatebreaker', String(after.focus));
      await page.locator('[data-wardrobe="title:kynbane"]').click();
      await page.locator('[data-focus="coll-with-aura-beaconlight"]').click();
      await page.waitForFunction(() => document.activeElement?.getAttribute('data-focus') === 'coll-row-aura-beaconlight', null, { timeout: 5000 }).catch(() => {});
      const landed = await page.evaluate(() => {
        const row = document.querySelector('[data-wardrobe="aura:beaconlight"]');
        const pane = document.querySelector('.px-qdetail');
        const r = row?.getBoundingClientRect(), p = pane?.getBoundingClientRect();
        return { part: document.querySelector('[data-focus="coll-part-auras"]')?.classList.contains('on'), open: row?.classList.contains('on'), inView: !!(r && p && r.top >= p.top - 1 && r.bottom <= p.bottom + 1), focus: document.activeElement?.getAttribute('data-focus') };
      });
      check(`${tag}: a "comes with" lands its row in view, focused`, landed.part && landed.open && landed.inView && landed.focus === 'coll-row-aura-beaconlight', JSON.stringify(landed));
      await page.screenshot({ path: `${OUT}/${tag}-comes-with.png` });
    }
    for (const part of ['auras', 'icons', 'glyphs']) {
      await page.locator(`[data-focus="coll-part-${part}"]`).click();
      await page.locator('.coll-parts').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${OUT}/${tag}-${part}.png` });
    }
    await page.locator('[data-focus="coll-part-auras"]').click();
    await page.locator('[data-wardrobe="aura:witchfire"]').click();
    await page.locator('.coll-whole').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/${tag}-aura-opened.png` });
    const wide = await page.evaluate(() => { const d = document.querySelector('.px-qdetail'); return d ? [d.scrollWidth, d.clientWidth] : [0, 0]; });
    check(`${tag}: nothing wider than the pane`, wide[0] <= wide[1] + 1, `${wide[0]} in ${wide[1]}`);
    check(`${tag}: no page error`, errors.length === 0, errors.join(' / '));
    await ctx.close();
  }
}
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed} of ${results.length} - frames in ${OUT}`);
process.exit(failed ? 1 : 0);
