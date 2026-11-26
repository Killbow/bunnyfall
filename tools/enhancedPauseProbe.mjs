// Browser probe for the enhanced pause screen, run with no ARENA2 so the page stops at the data pick.
// Run: npx vite --port 5199 & node tools/enhancedPauseProbe.mjs.
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

// save.js accepts only envelope version 1, so the seeded quicksave says v: 1.
const SAVE = {
  v: 1, name: 'Aelwyn', chargenDone: true,
  career: { name: 'Spellsword' }, level: 4,
  health: 41, maxHealth: 58,
  classicMinutes: 396_000_000 + 60 * 17 + 34,
  items: [{ name: 'Gold Pieces', stackCount: 1287 }],
};

async function toGamePage(page, skin) {
  await page.addInitScript((snap) => {
    try { localStorage.setItem('dagger.quicksave', JSON.stringify(snap)); } catch { }
  }, SAVE);
  await page.goto(`${BASE}/play/?skin=${skin}`, { waitUntil: 'networkidle' });
  if (skin === 'enhanced') {
    await page.waitForSelector('#enhanced-menu .doorbtn', { timeout: 15000 });
    await page.getByRole('button', { name: 'New Game', exact: true }).click();
    await page.getByRole('button', { name: 'Begin', exact: true }).click();
    await page.waitForSelector('#enhanced-menu', { state: 'detached', timeout: 15000 });
    await bootSettled(page);
  }
}

async function openDoor(page, { canSave = true, canLoad = true } = {}) {
  await page.evaluate(async ({ canSave: cs, canLoad: cl }) => {
    globalThis.__log = [];
    const up = () => (document.getElementById('enhanced-pause') ? 'door-up' : 'door-down');
    const { openPauseFlow } = await import('/src/ui/pauseDoor.js');
    const hooks = {
      exitToMenu: () => globalThis.__log.push(`exit:${up()}`),
      textLines: () => null,
    };
    if (cs) hooks.quickSave = () => globalThis.__log.push(`save:${up()}`);
    else hooks.savingPrevented = () => true;
    if (cl) hooks.quickLoad = () => globalThis.__log.push(`load:${up()}`);
    globalThis.__slot = null;
    openPauseFlow((w) => { globalThis.__slot = w; }, hooks);
  }, { canSave, canLoad });
}

const railText = (page) => page.$$eval('#enhanced-pause .railbtn .rk', (ns) => ns.map((n) => n.textContent));
const log = (page) => page.evaluate(() => globalThis.__log);
const done = (page) => page.evaluate(() => globalThis.__slot?.done ?? null);

async function run(label, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await toGamePage(page, 'enhanced');

  await openDoor(page);
  await page.waitForSelector('#enhanced-pause .railbtn', { timeout: 15000 });
  check(`${label}: Escape's screen is the enhanced one`,
    (await page.locator('#enhanced-pause').count()) === 1);
  const box = await page.$eval('#enhanced-pause', (n) => {
    const s = getComputedStyle(n);
    return { pos: s.position, z: s.zIndex, bg: s.backgroundColor };
  });
  check(`${label}: it is fixed, opaque and above the boot overlays`,
    box.pos === 'fixed' && box.z === '13' && !/rgba\(0, 0, 0, 0\)/.test(box.bg),
    `${box.pos} z${box.z} ${box.bg}`);
  check(`${label}: the host is holding it - which is what stops the motor and the clock`,
    (await done(page)) === false);

  const rail = await railText(page);
  check(`${label}: the rail asks the in-game questions`,
    JSON.stringify(rail) === JSON.stringify(
      ['Resume', 'Save Game', 'Load Game', 'Settings', 'Mods', 'About', 'Exit']),
    rail.join('/'));
  check(`${label}: it opens on Save Game`,
    (await page.locator('#enhanced-pause .head h2').textContent()) === 'Save Game');

  const offscreen = await page.$$eval('#enhanced-pause .railbtn', (ns) => ns
    .map((n) => ({ t: (n.textContent ?? '').trim(), r: n.getBoundingClientRect() }))
    .filter(({ r }) => r.right > innerWidth + 1 || r.bottom > innerHeight + 1
      || r.left < -1 || r.top < -1)
    .map(({ t }) => t));
  check(`${label}: every rail destination is ON the screen`,
    offscreen.length === 0, offscreen.join(', '));

  const saveCard = await page.locator('#enhanced-pause .card').first().textContent();
  check(`${label}: the Save card names what the press replaces`,
    saveCard.includes('Overwrites') && saveCard.includes('Aelwyn')
    && /Health/i.test(saveCard) && /Gold/i.test(saveCard),
    saveCard.replace(/\s+/g, ' ').slice(0, 90));

  await page.locator('#enhanced-pause .railbtn', { hasText: 'Settings' }).click();
  await page.waitForSelector('#enhanced-pause .row', { timeout: 10000 });
  const rows = await page.locator('#enhanced-pause .row').count();
  check(`${label}: settings are reachable from inside a game at last`, rows > 0, `${rows} rows`);

  await page.locator('#enhanced-pause .railbtn', { hasText: 'Save Game' }).click();
  check(`${label}: a save-capable host gets a Save button`,
    (await page.locator('#enhanced-pause .acts button', { hasText: 'Save' }).count()) === 1);

  await page.locator('#enhanced-pause .acts button', { hasText: 'Save' }).click();
  await page.waitForSelector('#enhanced-pause', { state: 'detached', timeout: 10000 });
  check(`${label}: Save closed the door first, then wrote`,
    JSON.stringify(await log(page)) === JSON.stringify(['save:door-down']),
    (await log(page)).join(','));
  check(`${label}: ...and the overlay reports done, so the host frees its slot`,
    (await done(page)) === true);

  await openDoor(page, { canSave: false, canLoad: false });
  await page.waitForSelector('#enhanced-pause .railbtn', { timeout: 15000 });
  check(`${label}: a host that cannot save draws no Save button`,
    (await page.locator('#enhanced-pause .acts button', { hasText: 'Save' }).count()) === 0);
  check(`${label}: ...and says so in the game's own words`,
    (await page.locator('#enhanced-pause').textContent()).includes('You cannot save now.'));
  check(`${label}: the refused rows stay ON the rail`,
    (await railText(page)).includes('Save Game'));

  await page.locator('#enhanced-pause .railbtn', { hasText: 'Exit' }).click();
  await page.locator('#enhanced-pause .acts button', { hasText: 'Leave this game' }).click();
  check(`${label}: leaving a game asks before it throws it away`,
    (await page.locator('#enhanced-pause .card p.meta').first().textContent()).length > 0
    && (await page.locator('#enhanced-pause').textContent()).includes('Cancel'));
  check(`${label}: ...and the confirm does not repeat the heading it replaced`,
    (await page.locator('#enhanced-pause .card h3').first().textContent()) === 'Leave this game',
    'the confirm echoes the BUTTON, and the card heading says where you go');
  check(`${label}: ...and Cancel means cancel`,
    await page.locator('#enhanced-pause .acts button', { hasText: 'Cancel' }).count() === 1);
  await page.locator('#enhanced-pause .acts button', { hasText: 'Cancel' }).click();
  check(`${label}: the door is still up after Cancel`,
    (await page.locator('#enhanced-pause').count()) === 1 && (await log(page)).length === 0);

  await page.locator('#enhanced-pause .railbtn', { hasText: 'Exit' }).click();
  await page.locator('#enhanced-pause .acts button', { hasText: 'Leave this game' }).click();
  await page.keyboard.press('Escape');
  check(`${label}: Escape cancels the confirm before it closes the screen`,
    (await page.locator('#enhanced-pause').count()) === 1
    && !(await page.locator('#enhanced-pause').textContent()).includes('Cancel'));
  await page.keyboard.press('Escape');
  await page.waitForSelector('#enhanced-pause', { state: 'detached', timeout: 10000 });
  check(`${label}: Escape then closes the pause door`, (await done(page)) === true);
  check(`${label}: ...and resuming fired no host hook`, (await log(page)).length === 0);

  await openDoor(page);
  await page.waitForSelector('#enhanced-pause .railbtn', { timeout: 15000 });
  await page.keyboard.press('Escape');
  await page.waitForSelector('#enhanced-pause', { state: 'detached', timeout: 10000 });
  check(`${label}: the door reopens and closes again - no orphaned listener`,
    (await done(page)) === true);

  await openDoor(page);
  await page.waitForSelector('#enhanced-pause .railbtn', { timeout: 15000 });
  const small = await page.$$eval('#enhanced-pause button', (ns) => ns
    .map((n) => ({ t: (n.textContent ?? '').trim().slice(0, 24), h: n.getBoundingClientRect().height }))
    .filter((b) => b.h > 0 && b.h < 44));
  check(`${label}: every target a finger has to hit is 44px`,
    small.length === 0, small.map((b) => `${b.t}@${Math.round(b.h)}`).join(', '));

  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await run('desktop', { viewport: { width: 1280, height: 800 } });
await run('phone', devices['Pixel 5']);

{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await toGamePage(page, 'classic');
  const kind = await page.evaluate(async () => {
    const { openPauseFlow, pauseDoorReady } = await import('/src/ui/pauseDoor.js');
    const w = openPauseFlow(() => {}, {});
    return { name: w?.constructor?.name, ready: pauseDoorReady() };
  });
  check('classic: Escape still opens the canvas window', kind.name === 'PauseOptionsWindow', kind.name);
  check('classic: and no enhanced screen is mounted',
    (await page.locator('#enhanced-pause').count()) === 0);
  check('classic: the door stays gated on OPTN00I0, which never loaded here',
    kind.ready === false);
  await ctx.close();
}

await browser.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} checks passed`);
process.exit(bad.length ? 1 : 0);
