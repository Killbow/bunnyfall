// Drives the enhanced level-up window in levelup.html across lanes, viewports, pointer, and keyboard.
// Run against a dev server: npx vite --port 5199 & node tools/levelUpProbe.mjs.
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:5199';
const shots = process.env.PROBE_SHOTS ?? '/tmp';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();

async function open(lane, viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/levelup.html?lane=${lane}`, { waitUntil: 'load' });
  await page.waitForSelector('.lv-star', { timeout: 20000 });
  await page.waitForTimeout(250);
  return { ctx, page, errors };
}

const model = (page) => page.evaluate(() => globalThis.__lv.view.model());
const stats = (page) => page.evaluate(() => ({ ...globalThis.__lv.entity.stats }));
const entity = (page) => page.evaluate(() => {
  const e = globalThis.__lv.entity;
  return { level: e.level, maxHealth: e.maxHealth, ready: !!e.readyToLevelUp, oghma: !!e.oghmaLevelUp };
});

async function boxes(page) {
  return page.evaluate(() => {
    const r = (s) => { const n = document.querySelector(s); if (!n) return null; const b = n.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
    const stars = [...document.querySelectorAll('.lv-star')].map((n) => { const b = n.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; });
    return {
      vw: window.innerWidth, vh: window.innerHeight,
      crown: r('.lv-crown'), plate: r('.lv-plate'), figure: r('.lv-figure'),
      pick: r('.lv-pick'), ribbon: r('.lv-ribbonwrap'), foot: r('.lv-foot'),
      ok: r('.lv-ok'), stars,
      scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight,
    };
  });
}

{
  const { ctx, page, errors } = await open('classic', { width: 1400, height: 900 });
  const m = await model(page);
  check('classic: the window draws with no ARENA2', (await page.locator('.lv-star').count()) === 8, `${m.rows.length} rows`);
  check('classic: the pool is FormulaHelper.BonusPool, 4..6', m.pool >= 4 && m.pool <= 6, `pool ${m.pool}`);
  check('classic: no page errors', errors.length === 0, errors.join(' | '));
  check('classic: the crown names the level it is offering', m.crown.to === m.crown.from + 1, `${m.crown.from} -> ${m.crown.to}`);
  check('classic: the ribbon leads with a skill that actually rose', m.ribbon[0]?.risen === true, m.ribbon[0]?.name);
  const primary = m.ribbon.find((s) => s.group === 'Primary');
  check('classic: a primary skill says it counts', /counts toward your next level/.test(primary?.note ?? ''), primary?.name);

  const b = await boxes(page);
  check('geometry: nothing is drawn past the right edge', b.scrollW <= b.vw + 1, `scrollW ${b.scrollW} vs ${b.vw}`);
  check('geometry: nothing is drawn past the bottom edge', b.scrollH <= b.vh + 1, `scrollH ${b.scrollH} vs ${b.vh}`);
  for (const [name, box] of Object.entries({ crown: b.crown, plate: b.plate, figure: b.figure, pick: b.pick, ribbon: b.ribbon, foot: b.foot, ok: b.ok })) {
    check(`geometry: ${name} is on screen`, box && box.x >= 0 && box.r <= b.vw + 1 && box.y >= 0 && box.b <= b.vh + 1,
      box ? `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.w)}x${Math.round(box.h)}` : 'missing');
  }
  check('geometry: the Ascend button is a thumb target', b.ok.h >= 44, `${Math.round(b.ok.h)}px tall`);
  check('geometry: every star is a thumb target', b.stars.every((s) => s.h >= 44), b.stars.map((s) => Math.round(s.h)).join(','));
  const overlap = b.stars.some((a, i) => b.stars.some((c, j) => j > i && a.x < c.r && c.x < a.r && a.y < c.b && c.y < a.b));
  check('geometry: no two stars overlap', !overlap);

  const before = await model(page);
  await page.locator('.lv-star').nth(0).click();
  const after = await model(page);
  check('press: a click on a star spends one point', after.pool === before.pool - 1 && after.rows[0].delta === 1, `${before.pool} -> ${after.pool}`);
  check('press: and the star says so', (await page.locator('.lv-star.raised').count()) === 1);
  check('press: the stats are NOT written until the commit',
    (await stats(page)).strength === before.rows[0].base, 'the law writes at confirm, never at a press');
  await page.locator('.lv-press').first().click();
  check('press: the minus takes it back', (await model(page)).pool === before.pool);

  check('refuse: the Ascend button is pressable while it refuses',
    (await page.locator('.lv-ok').isEnabled()) && (await page.locator('.lv-ok.notyet').count()) === 1);
  check('refuse: ...and carries the reason before it is pressed',
    /distribute all bonus points/i.test((await page.getAttribute('.lv-ok', 'title')) ?? ''),
    await page.getAttribute('.lv-ok', 'title'));
  await page.locator('.lv-ok').click();
  check('refuse: Ascend with points left keeps the window up', (await page.locator('.lv-star').count()) === 8);
  check('refuse: ...and SAYS why', /distribute all bonus points/i.test((await page.textContent('.lv-refuse')) ?? ''),
    await page.textContent('.lv-refuse'));
  await page.keyboard.press('Escape');
  check('refuse: Escape is the same refusal, not an exit', (await page.locator('.lv-star').count()) === 8);
  await page.keyboard.press('Tab');
  check('refuse: PX28 Tab cannot put a level-up away', (await page.locator('.lv-star').count()) === 8);
  await page.keyboard.press('Tab');
  check('refuse: ...and Tab still cannot, twice (the registry put itself back)', (await page.locator('.lv-star').count()) === 8);

  await page.screenshot({ path: `${shots}/levelup-classic.png` });

  const start = await entity(page);
  const m2 = await model(page);
  const spend = m2.pool;
  for (let i = 0; i < spend; i++) await page.locator('.lv-star').nth(i % 8).click();
  const full = await model(page);
  check('commit: the pool spends to zero', full.pool === 0 && full.canAscend, `pool ${full.pool}`);
  check('commit: and the button stops saying not-yet', (await page.locator('.lv-ok.notyet').count()) === 0);
  check('commit: the deltas add up to the pool the law rolled',
    full.rows.reduce((a, r) => a + r.delta, 0) === spend, `${full.rows.map((r) => r.delta).join(',')} vs ${spend}`);
  await page.locator('.lv-ok').click();
  await page.waitForTimeout(150);
  const end = await entity(page);
  check('commit: the window is gone', (await page.locator('.lv-star').count()) === 0);
  check('commit: ONE level, never a jump', end.level === start.level + 1, `${start.level} -> ${end.level}`);
  check('commit: the health roll landed', end.maxHealth > start.maxHealth, `${start.maxHealth} -> ${end.maxHealth}`);
  check('commit: readyToLevelUp is cleared', end.ready === false);
  const st = await stats(page);
  check('commit: and the points are in the stats',
    Object.keys(st).reduce((a, k) => a + st[k], 0) === Object.values(m2.rows).reduce((a, r) => a + r.base, 0) + spend,
    JSON.stringify(st));
  await ctx.close();
}

{
  const { ctx, page, errors } = await open('oghma', { width: 1400, height: 900 });
  const m = await model(page);
  check('oghma: the book’s pool is a fixed thirty', m.pool === 30, `pool ${m.pool}`);
  check('oghma: the crown does NOT promise a level', m.crown.to === m.crown.from && /Oghma/.test(await page.textContent('.lv-jump')));
  const start = await entity(page);
  for (let i = 0; i < 30; i++) await page.locator('.lv-star').nth(i % 8).click();
  check('oghma: thirty points spend', (await model(page)).pool === 0);
  await page.locator('.lv-ok').click();
  await page.waitForTimeout(150);
  const end = await entity(page);
  check('oghma: no Level++', end.level === start.level, `${start.level} -> ${end.level}`);
  check('oghma: no health roll', end.maxHealth === start.maxHealth);
  check('oghma: both flags clear together', end.ready === false && end.oghma === false);
  check('oghma: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

{
  const { ctx, page, errors } = await open('virtue', { width: 1400, height: 900 });
  const m = await model(page);
  check('virtue: the purse is counted in the mod’s own words', /virtue/i.test(m.poolLabel), m.poolLabel);
  check('virtue: the window is the mod’s lane', m.lane === 'virtue');
  const luck = m.rows.find((r) => r.key === 'luck');
  check('virtue: Luck carries its own price', luck.cost >= 1, `${luck.cost} per point`);
  await page.screenshot({ path: `${shots}/levelup-virtue.png` });
  for (let i = 0; i < 40; i++) {
    const cur = await model(page);
    if (cur.pool === 0) break;
    const row = cur.rows.find((r) => r.canRaise);
    if (!row) break;
    await page.locator('.lv-star').nth(row.index).click();
  }
  const spent = await model(page);
  check('virtue: the purse spends to zero under the mod’s caps', spent.pool === 0, `left ${spent.pool}`);
  const raised = spent.rows.filter((r) => r.delta > 0).length;
  check('virtue: at most the mod’s number of attributes moved', raised > 0 && raised <= 3, `${raised} attributes`);
  const start = await entity(page);
  await page.locator('.lv-ok').click();
  await page.waitForTimeout(150);
  const end = await entity(page);
  check('virtue: the commit is the mod’s commit', end.level === start.level + 1 && end.ready === false, `${start.level} -> ${end.level}`);
  check('virtue: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

{
  const { ctx, page } = await open('classic', { width: 1400, height: 900 });
  const m = await model(page);
  await page.keyboard.press('ArrowRight');
  check('keys: an arrow moves the focus', (await model(page)).focus !== m.focus);
  for (let i = 0; i < m.pool; i++) { await page.keyboard.press('Equal'); await page.keyboard.press('ArrowRight'); }
  check('keys: the pool spends from the keyboard', (await model(page)).pool === 0);
  await page.keyboard.press('ArrowDown');
  check('keys: up and down walk the ribbon', (await page.locator('.lv-sk.on').count()) === 1);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  check('keys: Enter commits when the pool is spent', (await page.locator('.lv-star').count()) === 0);
  await ctx.close();
}

for (const [label, viewport] of [
  ['phone', { width: 390, height: 844 }],
  ['short laptop', { width: 1024, height: 600 }],
  ['classic 4:3', { width: 800, height: 600 }],
]) {
  const { ctx, page, errors } = await open('classic', viewport);
  const b = await boxes(page);
  check(`${label}: no horizontal overflow`, b.scrollW <= b.vw + 1, `scrollW ${b.scrollW} vs ${b.vw}`);
  check(`${label}: no vertical overflow`, b.scrollH <= b.vh + 1, `scrollH ${b.scrollH} vs ${b.vh}`);
  check(`${label}: the Ascend button is on screen`, b.ok && b.ok.b <= b.vh + 1 && b.ok.r <= b.vw + 1,
    b.ok ? `${Math.round(b.ok.x)},${Math.round(b.ok.y)}` : 'missing');
  check(`${label}: the presses stay thumb-sized`, b.ok.h >= 44 && b.stars.every((s) => s.h >= 44));
  const overlap = b.stars.some((a, i) => b.stars.some((c, j) => j > i && a.x < c.r && c.x < a.r && a.y < c.b && c.y < a.b));
  check(`${label}: no two stars overlap`, !overlap);
  const before = await model(page);
  await page.locator('.lv-star').nth(3).click();
  check(`${label}: a star still takes a point`, (await model(page)).pool === before.pool - 1);
  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await page.screenshot({ path: `${shots}/levelup-${label.replace(/\W+/g, '-')}.png` });
  await ctx.close();
}

// Classic Daggerfall ends leveling when the pool is empty or every attribute is at its maximum.
{
  const { ctx, page, errors } = await open('allmax', { width: 1400, height: 900 });
  const m = await model(page);
  check('all-max: the pool is real and NOTHING can take it', m.pool > 0 && m.rows.every((r) => !r.canRaise), `pool ${m.pool}`);
  check('all-max: the window says so rather than telling them to take a point back',
    /maximum/i.test((await page.textContent('.lv-hint')) ?? ''), await page.textContent('.lv-hint'));
  check('all-max: the way out is OPEN', m.canAscend && (await page.locator('.lv-ok.notyet').count()) === 0);
  const start = await entity(page);
  await page.locator('.lv-ok').click();
  await page.waitForTimeout(150);
  const end = await entity(page);
  check('all-max: it closes', (await page.locator('.lv-star').count()) === 0);
  check('all-max: and the level still lands - the points are voided, not the level-up',
    end.level === start.level + 1 && end.ready === false, `${start.level} -> ${end.level}`);
  const st = await stats(page);
  check('all-max: no stat was pushed past the ceiling', Object.values(st).every((v) => v === 100), JSON.stringify(st));
  check('all-max: no page errors', errors.length === 0, errors.join(' | '));
  await page.screenshot({ path: `${shots}/levelup-allmax.png` });
  await ctx.close();
}

{
  const { ctx, page } = await open('classic', { width: 1400, height: 900 });
  await page.locator('.lv-star').nth(3).click();
  await page.keyboard.press('ArrowRight');
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
  const m = await model(page);
  check('focus: the ring follows the selection, so the keyboard and the reader agree',
    focused.toLowerCase().startsWith(m.focus), `${m.focus} vs "${focused}"`);
  check('focus: and a star is not announced as a toggle',
    (await page.locator('.lv-star[aria-pressed]').count()) === 0);
  await ctx.close();
}

{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/enhancedLevelUp.js*', async (route) => {
    await new Promise((r) => setTimeout(r, 900));
    await route.continue();
  });
  await page.goto(`${BASE}/levelup.html?lane=door`, { waitUntil: 'commit' });
  const waited = await page.waitForSelector('#levelup-wait', { timeout: 5000 }).then(() => true, () => false);
  check('door: a paused game is never blank - the wait is drawn while the chunk is in flight', waited);
  if (waited) {
    const said = (await page.textContent('#levelup-wait'))?.trim();
    check('door: and it says what happened', /risen/i.test(said ?? ''), said);
  }
  await page.waitForSelector('.lv-star', { timeout: 20000 });
  check('door: the window arrives and the wait is gone', (await page.locator('#levelup-wait').count()) === 0);
  check('door: the door built the window the skin asks for', (await page.locator('#enhanced-levelup .lv-sky').count()) === 1);
  const arms = await page.evaluate(() => {
    const w = globalThis.__lv.door;
    return { done: w.done, isChoice: w.isChoiceWindow === true, marker: w.isEnhancedLevelUp === true,
      has: ['input', 'click', 'wheel', 'hover', 'tick', 'draw', 'close', 'dispose', 'destroy', 'spendRemainingHeadless']
        .filter((k) => typeof w[k] === 'function') };
  });
  check('door: the overlay answers every arm a host calls unguarded', arms.has.length === 10, arms.has.join(','));
  check('door: and is not done while its DOM is up', arms.done === false && arms.isChoice && arms.marker);
  check('door: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

{
  const { ctx, page, errors } = await open('classic', { width: 1400, height: 900 });
  await page.evaluate(async () => {
    const { createCharSheetWindow } = await import('/src/ui/charSheetDoor.js');
    globalThis.__lv.view.destroy();
    globalThis.__warm = createCharSheetWindow({ entity: globalThis.__lv.entity });
  });
  // 300 ms is more than twice LEVELUP_WAIT_MS.
  await page.waitForTimeout(300);
  check('warm: the wait is never drawn when the chunk is already in hand',
    (await page.locator('#levelup-wait').count()) === 0);
  check('warm: and the window is up', (await page.locator('#enhanced-levelup .lv-star').count()) === 8);
  check('warm: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

for (const [label, viewport, hudScale] of [
  ['notice', { width: 1400, height: 900 }, 1],
  ['notice phone', { width: 390, height: 844 }, 1],
  ['notice hudscale2', { width: 1400, height: 900 }, 2],
]) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/levelup.html?lane=notice`, { waitUntil: 'load' });
  await page.waitForSelector('#enhanced-levelnotice .lv-note', { timeout: 20000 });
  await page.evaluate((scale) => {
    document.querySelector('.hud')?.style.setProperty('--hud-scale', String(scale));
    const br = document.querySelector('.hud-breath');
    if (br) { br.classList.add('on'); br.innerHTML = '<span class="hud-breathlabel">Breath</span><span class="hud-track"><i class="hud-fill" style="width:60%"></i></span>'; }
  }, hudScale);
  await page.waitForTimeout(80);
  const rows = (await page.locator('.lv-note').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());
  check(`${label}: all three events are on the strip`, rows.length === 4, rows.join(' / '));
  check(`${label}: the level's row is LAST - nearest the vitals, where the eye is`,
    /risen/i.test(rows.at(-1) ?? ''), rows.at(-1));
  check(`${label}: and it names the key that opens the window`,
    (await page.locator('.lv-note-level .lv-note-key').innerText()).trim().length > 0,
    await page.locator('.lv-note-level .lv-note-key').innerText());
  check(`${label}: a skill row carries no key - a line that reports is not an instruction`,
    (await page.locator('.lv-note-skill .lv-note-key').count()) === 0);

  const geo = await page.evaluate(() => {
    const r = (s) => { const n = document.querySelector(s); if (!n) return null; const b = n.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
    const strip = r('#enhanced-levelnotice');
    return { vw: window.innerWidth, vh: window.innerHeight, strip, bottom: r('.hud-bottom'), top: r('.hud-top'),
      home: strip ? (document.querySelector('.hud-bottom')?.firstElementChild?.id ?? '') : '',
      firstRow: r('.hud-breath.on') ?? r('.hud-bars'),
      events: strip ? getComputedStyle(document.querySelector('#enhanced-levelnotice')).pointerEvents : null,
      scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight };
  });
  check(`${label}: the strip is on screen`, geo.strip && geo.strip.x >= 0 && geo.strip.r <= geo.vw + 1 && geo.strip.y >= 0 && geo.strip.b <= geo.vh + 1,
    geo.strip ? `${Math.round(geo.strip.x)},${Math.round(geo.strip.y)} ${Math.round(geo.strip.w)}x${Math.round(geo.strip.h)}` : 'missing');
  check(`${label}: it hangs in the HUD's own bottom column, above every row it carries`,
    geo.home === 'enhanced-levelnotice', geo.home || '(on the body)');
  const clear = !geo.firstRow || geo.strip.b <= geo.firstRow.y + 1;
  check(`${label}: it clears the vitals and the quickslots`, clear,
    `strip bottom ${Math.round(geo.strip.b)} vs first HUD row ${Math.round(geo.firstRow?.y ?? 0)}`);
  check(`${label}: and the compass`, !geo.top || geo.strip.y >= geo.top.b,
    `strip top ${Math.round(geo.strip.y)} vs compass bottom ${Math.round(geo.top?.b ?? 0)}`);
  check(`${label}: no overflow`, geo.scrollW <= geo.vw + 1 && geo.scrollH <= geo.vh + 1,
    `${geo.scrollW}x${geo.scrollH} vs ${geo.vw}x${geo.vh}`);
  check(`${label}: it is pointer-transparent, like the rest of the HUD`, geo.events === 'none', geo.events);
  await page.screenshot({ path: `${shots}/levelnotice-${label.replace(/\W+/g, '-')}.png` });

  // ANNOUNCE_MS is 4500, but the fold runs on the HUD tick, which can run late under load, so wait for the fold.
  await page.waitForFunction(() => document.querySelectorAll('.lv-note').length <= 1, null, { timeout: 15000 })
    .catch(() => {});
  const after = (await page.locator('.lv-note').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());
  check(`${label}: the chatter expires`, after.length === 1, after.join(' / '));
  check(`${label}: and the level folds to a standing reminder, in different words`,
    /awaits/i.test(after[0] ?? '') && (await page.locator('.lv-note.lv-standing').count()) === 1, after[0]);

  await page.evaluate(() => globalThis.__lv.spend());
  await page.waitForFunction(() => !document.querySelector('#enhanced-levelnotice'), null, { timeout: 5000 })
    .catch(() => {});
  check(`${label}: spending the level takes the reminder with it`,
    (await page.locator('#enhanced-levelnotice').count()) === 0);
  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
