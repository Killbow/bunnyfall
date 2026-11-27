// Live browser and audio checks for the intro and the title screen; starts its own Vite server.
// Run: node tools/introProbe.mjs [output-directory].
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { chromium, devices } from 'playwright';
import { createServer } from 'vite';
import { TITLE_IMPACT_TIME, TITLE_ENTER_TIME, TITLE_READY_TIME, CREST_TIME, MAP_TIME, INTRO_NARRATION, introTitleAt } from '../src/ui/introCue.js';
import { MENU_THEME_GAIN } from '../src/audio/introTheme.js';

const out = process.argv[2] ?? 'test-harness/intro';
// Read the logo size from its IHDR so a new logo does not fail the size checks.
const LOGO_PNG = readFileSync(new URL('../src/assets/branding/bunnyfall.png', import.meta.url));
const LOGO_W = LOGO_PNG.readUInt32BE(16), LOGO_H = LOGO_PNG.readUInt32BE(20);
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5201, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: [
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
] });
const base = 'http://localhost:5201/play/';
const results = [], errors = [];
const check = (name, ok, detail = null) => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'ok' : 'FAIL'} ${name}`, detail ?? ''); };
// An unbundled dev-server page loads its whole module graph before the intro runs, so every load gets two minutes.
const ready = async (page) => page.waitForFunction(() => !document.querySelector('.intro-begin')?.disabled && window.__intro?.state.landscapeReady !== undefined, null, { timeout: 120000 });
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png` });
const closeAccount = async (page) => {
  const close = page.locator('.px-acctstage button', { hasText: /^close$/i });
  if (await close.count()) { await close.first().click(); await page.waitForSelector('.px-acctstage', { state: 'detached' }); }
};
// A software GPU takes seconds per frame, so every page wait gets three minutes.
const follow = (page) => { page.setDefaultTimeout(180000); page.on('pageerror', e => errors.push(e.message)); };
const seek = async (page, time) => {
  const n = await page.evaluate(t => window.__intro.seek(t), time);
  await page.waitForFunction(({ n, time }) => window.__intro.state.frames > n && window.__intro.state.time === time, { n, time });
};
const seekTitle = async (page) => {
  await page.evaluate(t => window.__intro.seek(t), TITLE_READY_TIME + 2);
  await page.waitForFunction(() => window.__intro.state.phase === 'landed');
};
const settled = async (page) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
};
const doorsLive = (page) => page.waitForFunction(() => {
  const menu = document.querySelector('#enhanced-menu');
  return menu && !menu.inert && menu.querySelector('.px-home.px-title .px-menu button');
});
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage(); follow(page);
  await page.goto(`${base}?introdebug`); await ready(page);
  check('autoplay gate holds at time zero with no source', await page.evaluate(() => !window.__intro.theme.source && window.__intro.theme.time() === 0));
  check('landscape compiled and initialized', await page.evaluate(() => window.__intro.state.landscapeReady));
  await shot(page, '01-begin');
  await page.locator('.intro-begin').click();
  await page.waitForFunction(() => window.__intro.theme.source !== null);
  await page.evaluate(() => {
    window.__sourceBefore = window.__intro.theme.source;
    window.__samples = [];
    const sample = () => {
      const state = window.__intro.state, theme = window.__intro.theme;
      if (state.phase === 'released' || state.phase === 'disposed') return;
      window.__samples.push({ ...state, audioTime: theme.time() });
      if (state.phase !== 'landed') requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.waitForFunction(() => window.__intro.state.phase === 'landed', null, { timeout: 150000 });
  await page.waitForTimeout(800);
  await shot(page, '06-final-title');
  const live = await page.evaluate(() => ({ samples: window.__samples, snapshot: window.__intro.snapshot() }));
  writeFileSync(`${out}/live-timing.json`, JSON.stringify(live, null, 2));
  const before = live.samples.findLast(s => s.time < TITLE_IMPACT_TIME && s.time > TITLE_ENTER_TIME);
  const landed = live.samples.find(s => s.time >= TITLE_IMPACT_TIME);
  // A software GPU may present no frame inside the title approach; the check then reports the gap as unobservable,
  // and the approach is checked on a frozen page below.
  const lastBefore = live.samples.findLast(s => s.time <= TITLE_ENTER_TIME);
  const unobservable = !before && lastBefore && landed && landed.time - lastBefore.time > TITLE_IMPACT_TIME - TITLE_ENTER_TIME;
  const cue = before && introTitleAt(before.time);
  check('logo is still out in front of its landing before the musical attack',
    unobservable || (cue && before.titleScale < 0.95 && before.titleY === 0 && before.titleOpacity > 0
      && Math.abs(before.titleOpacity - cue.opacity) < 1e-9 && Math.abs(before.titleScale - cue.scale) < 1e-9), {
      time: before?.time, opacity: before?.titleOpacity, scale: before?.titleScale, y: before?.titleY, cue,
      ...(unobservable ? { unobservable: `no presentation between ${lastBefore.time.toFixed(2)} s and ${landed.time.toFixed(2)} s` } : {}),
    });
  check('first frame after the attack lands exactly at rest, sharp and centred',
    landed?.titleScale === 1 && landed?.titleBlur === 0 && landed?.titleY === 0 && landed?.titleOpacity === 1, landed?.time);
  // A display presents only on a refresh, so the landing may trail the onset by up to one frame.
  const landingDelay = landed?.time - TITLE_IMPACT_TIME;
  check('logo lands on the first available presentation frame after the measured attack',
    landed && landingDelay >= 0 && landingDelay <= landed.frameMs / 1000 + 0.01,
    { delayMs: landingDelay * 1000, frameMs: landed?.frameMs });
  check('the landed title is the menu\'s landing - the doors on it, the film held under it', live.snapshot.phase === 'landed' && await page.evaluate(() => {
    const intro = document.querySelector('#intro'), menu = document.querySelector('#enhanced-menu');
    return !!intro && !!menu && intro.classList.contains('intro-landed') && document.documentElement.dataset.introTitle === 'held'
      && menu.dataset.overTitle === '' && getComputedStyle(menu).backgroundColor === 'rgba(0, 0, 0, 0)'
      && Number(getComputedStyle(intro).zIndex) < Number(getComputedStyle(menu).zIndex)
      && !!menu.querySelector('.px-home.px-title .doorbtn.door-online') && !menu.querySelector('.px-ground, .px-wordmark');
  }));
  check('the held title draws no frame while it waits', await (async () => {
    const before = await page.evaluate(() => window.__intro.state.frames);
    await page.waitForTimeout(800);
    return await page.evaluate((n) => window.__intro.state.frames === n, before);
  })());
  const beforeMenuTime = live.snapshot.time;
  check('the score keeps the title\'s level until the player presses', await page.evaluate((gain) => window.__intro.theme.level !== gain, MENU_THEME_GAIN));
  await doorsLive(page);
  await page.mouse.click(4, 360);
  check('the first press takes the same source down to the menu\'s level', await page.evaluate(({ time, gain }) => {
    const t = window.__intro.theme;
    return t.source === window.__sourceBefore && t.time() > time && t.level === gain && t.context.state === 'running';
  }, { time: beforeMenuTime, gain: MENU_THEME_GAIN }));
  check('shared supplied logo stands in the landed title', await page.locator('.intro-title .brand-logo').evaluate((img, w) => img.complete && img.naturalWidth === w, LOGO_W));
  await shot(page, '07-main-menu');
  await page.evaluate(async () => { const { setValue } = await import('/src/platform/settings.js'); setValue('Controls', 'MusicVolume', 0); });
  await page.waitForFunction(() => window.__intro.theme.gain.gain.value < 0.001);
  check('menu music obeys live volume settings', true);
  await closeAccount(page);
  await page.locator('#enhanced-menu .px-homelink.door-settings').click();
  check('a section covers the held title with its own ground', await page.evaluate(() => {
    const menu = document.querySelector('#enhanced-menu');
    return !!document.querySelector('#intro') && menu.dataset.overTitle === undefined && getComputedStyle(menu).backgroundColor !== 'rgba(0, 0, 0, 0)' && !!menu.querySelector('.shell .brand-home .brand-logo');
  }));
  await page.locator('#enhanced-menu .railbtn.railhome').click();
  check('the way home is the title again', await page.evaluate(() => !!document.querySelector('#enhanced-menu .px-home.px-title') && document.querySelector('#enhanced-menu').dataset.overTitle === ''));
  if (await page.locator('#enhanced-menu .doorbtn.door-offline').count()) await page.locator('#enhanced-menu .doorbtn.door-offline').click();
  await shot(page, '08-offline-on-title');
  await page.locator('#enhanced-menu .doorbtn.door-new').first().click();
  await page.locator('#enhanced-menu .act.primary', { hasText: 'Begin' }).click();
  await page.waitForSelector('#pick');
  check('starting a game releases audio before the data picker', await page.evaluate(() => window.__intro.theme.disposed && !window.__intro.theme.context && !window.__intro.theme.source && !window.__intro.theme.buffer));
  check('and lets the title go with it', await page.evaluate(() => !document.querySelector('#intro') && document.documentElement.dataset.introTitle === undefined));
  await ctx.close();

  const pausedContext = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const pausedPage = await pausedContext.newPage(); follow(pausedPage);
  await pausedPage.goto(`${base}?introdebug`); await ready(pausedPage);
  await pausedPage.locator('.intro-begin').click();
  await pausedPage.waitForFunction(() => window.__intro.state.time >= 2.4);
  await pausedPage.evaluate(async () => {
    await window.__intro.theme.pause();
    window.__pause = { time: window.__intro.theme.time(), wall: performance.now() };
  });
  await pausedPage.waitForFunction(() => window.__intro.state.phase === 'paused' && performance.now() - window.__pause.wall > 250);
  check('audio suspension freezes the film', await pausedPage.evaluate(() => window.__intro.theme.time() === window.__pause.time));
  // Compare against wall time since the resume press: a software GPU frame takes seconds, so score time passes
  // during the wait.
  const resumedAt = await pausedPage.evaluate(() => performance.now());
  await pausedPage.locator('.intro-begin').click();
  await pausedPage.waitForFunction(() => window.__intro.state.phase === 'playing' && window.__intro.theme.time() > window.__pause.time + 0.05);
  const resumed = await pausedPage.evaluate((at) => ({ advanced: window.__intro.theme.time() - window.__pause.time, sinceResume: (performance.now() - at) / 1000, paused: (at - window.__pause.wall) / 1000 }), resumedAt);
  check('resuming continues the score instead of jumping by wall time', resumed.paused > 0.25 && resumed.advanced <= resumed.sinceResume + 0.15, resumed);
  await pausedContext.close();

  // A browser grants audio once per gesture, so one tap on the gate, clear of Begin and Skip, must unlock and open.
  const touchContext = await browser.newContext({ ...devices['Pixel 5'] });
  const touchPage = await touchContext.newPage(); follow(touchPage);
  await touchPage.goto(`${base}?introdebug`); await touchPage.bringToFront(); await ready(touchPage);
  const spot = await touchPage.evaluate(() => {
    const button = document.querySelector('.intro-begin').getBoundingClientRect();
    return { x: Math.round(innerWidth / 2), y: Math.round(button.top / 2), clear: button.top / 2 < button.top - 40 };
  });
  check('the tap target under test is neither Begin nor Skip', spot.clear, spot);
  await touchPage.touchscreen.tap(spot.x, spot.y);
  // Read the score's own clock: the debug state refreshes on animation frames, which a background page throttles.
  await touchPage.waitForFunction(() => window.__intro.theme.time() > 0.25, null, { timeout: 25000 });
  const opened = await touchPage.evaluate(() => ({
    audio: window.__intro.theme.context?.state, source: !!window.__intro.theme.source,
    score: window.__intro.theme.time(), gateHidden: !!document.querySelector('.intro-gate')?.hidden,
    status: document.querySelector('.intro-status')?.textContent,
  }));
  check('one tap anywhere on the gate unlocks audio and opens the film',
    opened.audio === 'running' && opened.source && opened.score > 0.25 && opened.gateHidden && opened.status === '', opened);
  await touchContext.close();

  for (const [name, options] of [
    ['desktop', { viewport: { width: 1280, height: 720 } }],
    ['phone', { ...devices['Pixel 5'] }],
    ['landscape-phone', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 }],
    ['reduced-motion', { viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' }],
  ]) {
    const c = await browser.newContext(options), p = await c.newPage(); follow(p);
    await p.goto(`${base}?introdebug&introat=0`); await ready(p);
    if (name === 'desktop') {
      for (const [t, label] of [[3, '02-interkarma'], [7, '03-nexus'], [13.5, '04-the-reveal'], [CREST_TIME, '05-the-crest'], [23, '05b-the-wheel'], [30, '05c-the-arena'], [38, '05d-the-ascent'], [47, '05e-tamriel']]) { await seek(p, t); await shot(p, label); }
      await seek(p, (INTRO_NARRATION[1].up + INTRO_NARRATION[1].out) / 2);
      const said = await p.evaluate(() => ({ text: document.querySelector('.intro-narration p')?.textContent, opacity: Number(document.querySelector('.intro-narration').style.opacity) }));
      check('desktop: the narrator\'s line is up while its shot holds, in the catalog\'s words', said.opacity === 1 && said.text === INTRO_NARRATION[1].text, said);
      const mid = (TITLE_ENTER_TIME + TITLE_IMPACT_TIME) / 2;
      await seek(p, mid);
      const flying = await p.evaluate(() => ({ ...window.__intro.state }));
      const want = introTitleAt(mid);
      check('desktop: the logo is out in front of its landing at a frozen time in the approach', flying.titleScale < 0.95 && flying.titleOpacity > 0
        && Math.abs(flying.titleScale - want.scale) < 1e-9 && Math.abs(flying.titleOpacity - want.opacity) < 1e-9 && flying.titleY === 0, { flying: { scale: flying.titleScale, opacity: flying.titleOpacity }, want });
      await seek(p, MAP_TIME + 2);
      const words = await p.evaluate(() => [...document.querySelectorAll('.intro-label[data-kind=province]')].map((n) => { const r = n.firstChild.getBoundingClientRect(); return { name: n.textContent, x: r.x + r.width / 2, y: r.y + r.height / 2, shown: !n.hidden }; }));
      check('desktop: the nine provinces are named over the continent, every one in frame', words.length === 9 && words.every((w) => w.shown && w.x > 0 && w.x < 1280 && w.y > 0 && w.y < 720), words);
    }
    await seekTitle(p);
    await doorsLive(p);
    await closeAccount(p);
    await settled(p);
    const layout = async () => p.evaluate((w) => {
      const logo = document.querySelector('.intro-title img'), doors = [...document.querySelectorAll('#enhanced-menu .px-menu .doorbtn')], foot = document.querySelector('#enhanced-menu .px-foot');
      const a = logo.getBoundingClientRect(), rects = doors.map((d) => d.getBoundingClientRect());
      return { width: innerWidth, height: innerHeight, logo: { x: a.x, y: a.y, width: a.width, height: a.height, bottom: a.bottom, right: a.right }, loaded: logo.naturalWidth === w,
        doors: { top: Math.min(...rects.map((r) => r.top)), bottom: Math.max(...rects.map((r) => r.bottom)), left: Math.min(...rects.map((r) => r.left)), right: Math.max(...rects.map((r) => r.right)), least: Math.min(...rects.map((r) => r.height)), count: rects.length },
        foot: foot.getBoundingClientRect().top };
    }, LOGO_W);
    const fits = (l) => l.loaded && l.logo.x >= 0 && l.logo.right <= l.width + 1 && Math.abs(l.logo.width / l.logo.height - LOGO_W / LOGO_H) < 0.01
      && l.logo.bottom <= l.doors.top + 1 && l.doors.bottom <= l.foot + 1 && l.doors.left >= 0 && l.doors.right <= l.width && l.doors.least >= 44;
    const top = await layout();
    check(`${name}: the mark fits at its natural aspect, the two questions under it and over the foot`, fits(top) && top.doors.count === 2, top);
    await shot(p, `title-${name}`);
    await p.locator('#enhanced-menu .doorbtn.door-offline').click();
    await settled(p);
    const games = await layout();
    check(`${name}: the offline games fit the same band`, fits(games) && games.doors.count === 5, games);
    await shot(p, `title-offline-${name}`);
    await c.close();
  }

  const failure = await browser.newContext(), fp = await failure.newPage(); follow(fp);
  await fp.route('**/theme.mp3*', route => route.abort());
  await fp.goto(`${base}?introdebug`); await ready(fp); await fp.locator('.intro-begin').click();
  await fp.waitForFunction(() => window.__intro.state.phase === 'landed');
  check('missing score lands the title with an explicit message', (await fp.locator('.intro-footer').textContent()).includes('couldn’t load'));
  await doorsLive(fp);
  check('missing score never blocks the menu', await fp.locator('.px-menu button').count() > 0);
  await failure.close();

  const slow = await browser.newContext(), sp = await slow.newPage(); follow(sp);
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  await sp.route('**/theme.mp3*', async route => { await blocked; await route.continue().catch(() => {}); });
  await sp.goto(`${base}?introdebug`); await sp.waitForSelector('.intro-skip', { timeout: 120000 });
  await sp.locator('.intro-skip').click(); await sp.waitForFunction(() => window.__intro.state.phase === 'landed'); await doorsLive(sp);
  check('skip works while audio is still loading - it lands on the title', await sp.locator('.px-home.px-title .px-menu button').count() > 0);
  // Release the blocked recording before the score's 15 s load limit.
  release();
  await sp.waitForFunction(() => window.__intro.theme.source !== null, null, { timeout: 30000 });
  check('late audio joins the menu at the menu level', await sp.evaluate(gain => window.__intro.theme.level === gain, MENU_THEME_GAIN));
  await sp.waitForFunction(() => window.__intro.state.landscapeReady !== undefined && getComputedStyle(document.querySelector('.intro-landscape')).opacity === '1', null, { timeout: 180000 });
  check('the map fades in under a title skipped to before it was built', true);
  await slow.close();

  const pref = await browser.newContext({ viewport: { width: 1280, height: 720 } }), pp = await pref.newPage(); follow(pp);
  await pp.goto(`${base}?introdebug`); await pp.waitForSelector('.intro-skip', { timeout: 120000 });
  await pp.evaluate(async () => { const { setPref } = await import('/src/ui/uiPrefs.js'); setPref('skipStartVideo', true); });
  await pp.reload(); await pp.waitForFunction(() => window.__intro?.state.phase === 'landed', null, { timeout: 120000 }); await doorsLive(pp);
  check('Skip start video opens on the title, no gate and no film before it', await pp.evaluate(() => document.querySelector('.intro-gate').hidden && document.querySelector('.intro-skip').hidden && !!document.querySelector('.px-home.px-title') && !window.__intro.theme.source));
  await pp.mouse.click(4, 360);
  await pp.waitForFunction(() => window.__intro.theme.source !== null, null, { timeout: 30000 });
  check('and its first press starts the score at the menu\'s level', await pp.evaluate(gain => window.__intro.theme.level === gain, MENU_THEME_GAIN));
  await pref.close();
  check('no uncaught page errors', errors.length === 0, errors);
} catch (error) { check('probe completed', false, error.stack); }
finally {
  writeFileSync(`${out}/browser-report.json`, JSON.stringify({ results, errors }, null, 2));
  await browser.close(); await server.close();
}
assert.ok(results.every(r => r.ok), `${results.filter(r => !r.ok).length} cinematic checks failed; see ${out}/browser-report.json`);
