// Browser probe for the enhanced character sheet and the canvas windows it pushes and pops.
// Run: npx vite --port 5199 & node tools/enhancedSheetProbe.mjs.
import { chromium, devices } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:5199';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
const browser = await chromium.launch();

// A failed boot replaces the whole page body, so a screen opened before it lands is wiped.
// A successful boot never writes the text, so the timeout is the expected outcome.
async function bootSettled(page) {
  await page.waitForFunction(
    () => document.body.textContent.includes('boot failed'), null, { timeout: 15000 },
  ).catch(() => { });
}

async function toGamePage(page) {
  await page.goto(`${BASE}/play/?skin=enhanced`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#enhanced-menu .doorbtn', { timeout: 20000 });
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await page.getByRole('button', { name: 'Begin', exact: true }).click();
  await page.waitForSelector('#enhanced-menu', { state: 'detached', timeout: 20000 });
  await bootSettled(page);
}

async function openSheet(page, withChild = ['inventory', 'spellbook']) {
  await page.evaluate(async (which) => {
    const { createCharSheetWindow } = await import('/src/ui/charSheetDoor.js');
    globalThis.__calls = [];
    globalThis.__child = {
      done: false,
      input: () => globalThis.__calls.push('input'),
      click: () => globalThis.__calls.push('click'),
      wheel: () => globalThis.__calls.push('wheel'),
      hover: () => globalThis.__calls.push('hover'),
      tick: () => globalThis.__calls.push('tick'),
      draw: () => { globalThis.__calls.push('draw'); return 'drew'; },
      dispose: () => globalThis.__calls.push('dispose'),
    };
    const deps = {
      entity: {
        name: 'Aelwyn', race: 'Redguard', level: 4,
        career: { name: 'Spellsword', primarySkills: [0, 1], majorSkills: [2, 3], minorSkills: [4, 5, 6] },
        stats: {
          strength: 50, intelligence: 62, willpower: 40, agility: 55,
          endurance: 48, personality: 33, speed: 51, luck: 44,
        },
        skills: { 0: 41, 1: 38, 2: 27, 3: 22, 4: 15, 5: 11, 6: 9 },
        health: 41, maxHealth: 58, magicka: 20, maxMagicka: 44, fatigue: 3200,
        items: [{ name: 'Gold Pieces', group: 'Currency', stackCount: 1287 }],
      },
    };
    for (const w of which) deps[w] = () => globalThis.__child;
    globalThis.__slot = createCharSheetWindow(deps);
  }, withChild);
  await page.waitForSelector('#enhanced-charsheet .skillrow', { timeout: 20000 });
}

const calls = (page) => page.evaluate(() => globalThis.__calls);
const done = (page) => page.evaluate(() => globalThis.__slot?.done ?? null);
const visible = (page) => page.evaluate(() =>
  getComputedStyle(document.getElementById('enhanced-charsheet')).visibility);

async function run(label, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await toGamePage(page);
  await openSheet(page);

  check(`${label}: F5's screen is the enhanced one`,
    (await page.locator('#enhanced-charsheet').count()) === 1);
  check(`${label}: the host is holding it`, (await done(page)) === false);
  check(`${label}: it names the character`,
    (await page.locator('#enhanced-charsheet .sheet-id h2').textContent()) === 'Aelwyn');
  check(`${label}: eight attributes, every one on a track`,
    (await page.locator('#enhanced-charsheet .sheetcol').first().locator('.meter').count()) === 8);

  const career = await page.locator('#enhanced-charsheet .skillrow').count();
  check(`${label}: the career skills are all on the screen at once`, career === 7, `${career} rows`);
  await page.locator('#enhanced-charsheet button.more').click();
  const all = await page.locator('#enhanced-charsheet .skillrow').count();
  check(`${label}: and the whole catalogue is one press away`, all === 35, `${all} rows`);
  check(`${label}: ...and the press is reversible`,
    (await page.locator('#enhanced-charsheet button.more').textContent()).includes('Hide'));
  await page.locator('#enhanced-charsheet button.more').click();
  check(`${label}: back to the career skills`,
    (await page.locator('#enhanced-charsheet .skillrow').count()) === 7);

  const nav = await page.$$eval('#enhanced-charsheet .sheet-nav button', (ns) => ns.map((n) => n.textContent));
  check(`${label}: the host-specific windows are drawn, the refused one is not`,
    JSON.stringify(nav) === JSON.stringify(['Inventory', 'Spellbook', 'History']), nav.join('/'));
  check(`${label}: ...and History is there whatever the host hands`, nav.includes('History'));
  check(`${label}: ...and the Logbook is not, with no quest source`, !nav.includes('Logbook'));

  await page.locator('#enhanced-charsheet .sheet-nav button', { hasText: 'Inventory' }).click();
  check(`${label}: pushing a canvas child HIDES the opaque sheet`,
    (await visible(page)) === 'hidden',
    'the child draws underneath it - a visible sheet makes the child invisible');
  const forwarded = await page.evaluate(() => {
    const w = globalThis.__slot;
    w.input('back'); w.click(1, 2); w.wheel(1); w.hover(3, 4); w.tick(0.016);
    const drew = w.draw({}, {}, {}, 1);
    return { calls: globalThis.__calls, drew };
  });
  for (const arm of ['input', 'click', 'wheel', 'hover', 'tick', 'draw']) {
    check(`${label}: ${arm} reaches the child`, forwarded.calls.includes(arm),
      forwarded.calls.join(','));
  }
  check(`${label}: draw RETURNS the child's draw - it is the canvas half`,
    forwarded.drew === 'drew');
  check(`${label}: the sheet is still the host's one overlay`, (await done(page)) === false);

  await page.evaluate(() => { globalThis.__child.done = true; globalThis.__slot.tick(0.016); });
  check(`${label}: a finished child pops and the sheet returns`, (await visible(page)) === 'visible');
  check(`${label}: ...and the popped child was disposed`,
    (await calls(page)).includes('dispose'));
  check(`${label}: ...and the sheet is still readable`,
    (await page.locator('#enhanced-charsheet .skillrow').count()) === 7);
  check(`${label}: the host never saw the sheet finish`, (await done(page)) === false);

  await page.evaluate(() => globalThis.__slot.dispose());
  await openSheet(page, ['inventory']);
  const nav2 = await page.$$eval('#enhanced-charsheet .sheet-nav button', (ns) => ns.map((n) => n.textContent));
  check(`${label}: a host that hands no spellbook draws no Spellbook button`,
    !nav2.includes('Spellbook') && nav2.includes('Inventory'), nav2.join('/'));

  await page.keyboard.press('Escape');
  await page.waitForSelector('#enhanced-charsheet', { state: 'detached', timeout: 10000 });
  check(`${label}: Escape closes the sheet`, (await done(page)) === true);
  await openSheet(page);
  await page.keyboard.press('F5');
  await page.waitForSelector('#enhanced-charsheet', { state: 'detached', timeout: 10000 });
  check(`${label}: F5 closes it too - and did NOT reload the page`,
    (await done(page)) === true && (await page.evaluate(() => !!globalThis.__slot)),
    'an unclaimed F5 destroys the session');

  await openSheet(page);
  const small = await page.$$eval('#enhanced-charsheet button', (ns) => ns
    .map((n) => ({ t: (n.textContent ?? '').trim().slice(0, 20), r: n.getBoundingClientRect() }))
    .filter(({ r }) => r.height > 0 && r.height < 44)
    .map(({ t, r }) => `${t}@${Math.round(r.height)}`));
  check(`${label}: every target a finger has to hit is 44px`, small.length === 0, small.join(', '));
  const off = await page.$$eval('#enhanced-charsheet .sheet-nav button', (ns) => ns
    .map((n) => ({ t: (n.textContent ?? '').trim(), r: n.getBoundingClientRect() }))
    .filter(({ r }) => r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.left < -1)
    .map(({ t }) => t));
  check(`${label}: every navigation button is ON the screen`, off.length === 0, off.join(', '));

  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await run('desktop', { viewport: { width: 1280, height: 800 } });
await run('phone', devices['Pixel 5']);

{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await toGamePage(page);
  const bare = await page.evaluate(async () => {
    const { createCharSheetWindow } = await import('/src/ui/charSheetDoor.js');
    const { playerEntity } = await import('/src/characters/playerEntity.js');
    const w = createCharSheetWindow({ entity: playerEntity });
    return !!w && w.done === false;
  });
  await page.waitForSelector('#enhanced-charsheet .sheet-id', { timeout: 20000 });
  check('bare: the real playerEntity opens a sheet rather than throwing', bare);
  check('bare: no page errors', errors.length === 0, errors.join(' | '));
  await page.evaluate(() => document.getElementById('enhanced-charsheet')?.remove());

  // The ?skin= query outranks the stored skin choice, so the classic window needs a page loaded with ?skin=classic.
  await page.goto(`${BASE}/play/?skin=classic`, { waitUntil: 'domcontentloaded' });
  const kind = await page.evaluate(async () => {
    const { createCharSheetWindow } = await import('/src/ui/charSheetDoor.js');
    const w = createCharSheetWindow({ entity: { name: 'x', stats: {} } });
    return { name: w?.constructor?.name, dom: document.querySelectorAll('#enhanced-charsheet').length };
  });
  check('classic: F5 still opens the canvas sheet', kind.name === 'CharSheet', kind.name);
  check('classic: and no enhanced sheet is mounted', kind.dom === 0);
  await ctx.close();
}

await browser.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} checks passed`);
process.exit(bad.length ? 1 : 0);
