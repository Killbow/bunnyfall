// Checks the landing page, the /play/ front door with no ARENA2, the /play/arena2/ mount, and the support links.
// Starts its own Vite servers. Run: node tools/landingProbe.mjs.
import { createServer } from 'vite';
import { chromium, devices } from 'playwright';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SUPPORT_ASKS } from '../src/ui/supportAsks.js';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const shots = process.env.PROBE_SHOTS ?? '/tmp';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

delete process.env.ARENA2_PATH;
const bare = await createServer({ server: { host: '127.0.0.1', port: 5230, strictPort: true }, logLevel: 'error' });
await bare.listen();
const BASE = 'http://127.0.0.1:5230';

const browser = await chromium.launch();

async function landing(label, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

  const tokens = await page.locator('style#enhanced-tokens').textContent();
  check(`${label}: the skin's token block is on the page`, /--brass:\s*#c08a3e/.test(tokens ?? ''));
  const gem = await page.locator('.rule .gem').first().evaluate((el) => {
    const style = getComputedStyle(el);
    return { core: style.backgroundColor, tips: style.boxShadow };
  });
  check(`${label}: the gem's computed core IS ruby`, gem.core === 'rgb(185, 19, 9)', gem.core);
  check(`${label}: the gem retains four brass tips`,
    (gem.tips.match(/rgb\(192, 138, 62\)/g) ?? []).length === 4, gem.tips);
  const face = await page.locator('h1.wordmark').evaluate((el) => getComputedStyle(el).fontFamily);
  check(`${label}: the wordmark is the MENU's face`, /Jacquard 12/.test(face), face);
  const body = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  check(`${label}: the body is the menu's list face`, /Pixelify Sans/.test(body), body);
  const night = await page.locator('.night').evaluate((el) => {
    const cs = getComputedStyle(el), after = getComputedStyle(el, '::after');
    return { fixed: cs.position === 'fixed', layers: (cs.backgroundImage.match(/gradient/g) || []).length,
      stars: (after.boxShadow.match(/rgb/g) || []).length };
  });
  check(`${label}: the night is the menu's sky, in CSS`, night.fixed && night.layers >= 3 && night.stars >= 90, JSON.stringify(night));
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(`${label}: the ground is the pixel home's base`, bg === 'rgb(10, 12, 17)', bg);
  const fontHref = await page.locator('link[rel=stylesheet][href*="fonts.googleapis.com"]').getAttribute('href') ?? '';
  check(`${label}: one fonts link, and it is the SKIN's own request`,
    (await page.locator('link[rel=stylesheet][href*="fonts.googleapis.com"]').count()) === 1
    && /Jacquard\+12/.test(fontHref) && /Pixelify\+Sans/.test(fontHref));
  const h1Face = await page.locator('h1').evaluate((el) => getComputedStyle(el).fontFamily);
  check(`${label}: the headline is set in the brand face`, /Grenze Gotisch/.test(h1Face), h1Face);
  check(`${label}: ...and the brand face loaded`,
    await page.evaluate(() => document.fonts.check("300 40px 'Grenze Gotisch'")));
  check(`${label}: no script, no canvas on the landing`,
    (await page.locator('script:not([src^="/@vite/"]), canvas, video').count()) === 0);
  const pics = await page.locator('img').evaluateAll((els) => els.map((e) => ({
    alt: e.alt, inWordmark: !!e.closest('h1.wordmark'), loaded: e.complete && e.naturalWidth > 0 && e.naturalWidth === Number(e.getAttribute('width')),
  })));
  check(`${label}: the page's one picture is the logo, as its wordmark, loaded`,
    pics.length === 1 && pics[0].inWordmark && pics[0].loaded && pics[0].alt === 'Bunnyfall', JSON.stringify(pics));
  const strip = await page.locator('.foot .stat').evaluateAll((els) => els.map((e) => e.textContent));
  check(`${label}: the foot carries two figures`, strip.length === 2 && strip.every((t) => /^[\d,]{4,}$/.test(t)), strip.join(' / '));
  const plaques = await page.locator('a.plaque').evaluateAll((els) => els.map((e) => [e.textContent, e.getAttribute('href')]));
  check(`${label}: Play, Install and Discord stand together on the door`,
    plaques.length === 3 && plaques[0][0] === 'Play' && plaques[0][1] === './play/'
    && plaques[1][0] === 'Install' && plaques[1][1] === '#desktop' && plaques[2][0] === 'Discord', JSON.stringify(plaques));
  const downloads = await page.locator('#desktop + dd .dl a').evaluateAll((els) => els.map((e) => [e.textContent, e.getAttribute('href')]));
  check(`${label}: Install lands on three direct downloads`,
    downloads.length === 3 && downloads.every(([, h]) => /\/releases\/latest\/download\/Bunnyfall-[\w-]+\.(exe|dmg|AppImage)$/.test(h)), JSON.stringify(downloads));
  const asks = await page.locator('.asks a.ask').evaluateAll((els) => els.map((e) => {
    const mark = e.querySelector('.supmark'), b = e.getBoundingClientRect(), m = mark?.getBoundingClientRect();
    return { href: e.getAttribute('href'), mark: mark?.className, h: b.height, shadow: mark ? getComputedStyle(mark, '::before').boxShadow : 'none',
      inside: !!m && m.top >= b.top + 2 && m.bottom <= b.bottom - 2 };
  }));
  check(`${label}: the corner asks are Patreon then Ko-fi, at SUPPORT_ASKS' addresses`,
    JSON.stringify(asks.map((a) => a.href)) === JSON.stringify(SUPPORT_ASKS.map((a) => a.url)), JSON.stringify(asks.map((a) => a.href)));
  check(`${label}: each ask's mark is drawn by the injected rules, whole inside its plaque`,
    asks.length === 2 && asks.every((a, i) => a.mark === `supmark supmark-${SUPPORT_ASKS[i].id}` && a.shadow !== 'none' && a.inside), JSON.stringify(asks));
  check(`${label}: each ask is a 44px target`, asks.every((a) => a.h >= 44), asks.map((a) => `${a.h}px`).join(' / '));
  await page.locator('.asks a.ask').nth(1).hover();
  const lit = await page.locator('.asks .supmark-kofi').evaluate((m) => getComputedStyle(m).getPropertyValue('--mk-hi').trim());
  check(`${label}: a mark lights in the classic pair's gold under the pointer`, lit === 'rgb(243,239,44)', lit);
  await page.mouse.move(0, 0);
  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await page.screenshot({ path: `${shots}/landing-${label}.png`, fullPage: true });
  console.log(`  ${shots}/landing-${label}.png`);
  return { ctx, page };
}

const desk = await landing('desktop', { viewport: { width: 1400, height: 900 } });

{
  const page = await browser.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const bad = [];
  for (const w of [320, 360, 375, 390, 412, 430, 480, 600, 768, 860, 861, 1024, 1280, 1366, 1920]) {
    for (const h of [568, 640, 720, 900]) {
      await page.setViewportSize({ width: w, height: h });
      const g = await page.evaluate(() => {
        const r = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
        const asks = [...document.querySelectorAll('.asks a.ask')].map(r);
        const under = [...document.querySelectorAll('.door > :not(.asks):not(.foot)')].map(r);
        return { asks, under };
      });
      const [a, k] = g.asks;
      const row = { t: Math.min(a.t, k.t), b: Math.max(a.b, k.b), l: Math.min(a.l, k.l), r: Math.max(a.r, k.r) };
      if (a.t !== k.t) bad.push(`${w}x${h}: two rows`);
      else if (row.l < 0 || row.r > w) bad.push(`${w}x${h}: off the screen`);
      else if (g.under.some((u) => u.t < row.b && u.l < row.r && row.l < u.r)) bad.push(`${w}x${h}: over the door`);
    }
  }
  check('the asks stand one row, on the screen and clear of the door, at 60 sizes from 320px to 1920px', bad.length === 0, bad.join('; '));
  await page.close();
}
check('desktop: the foot carries build, tests, lines and Source',
  await desk.page.locator('.foot').isVisible()
  && (await desk.page.locator('.foot .stat').count()) === 2);

await desk.page.locator('a.plaque', { hasText: 'Play' }).click();
const skipIntro = desk.page.getByRole('button', { name: 'Skip intro', exact: true });
await skipIntro.waitFor({ state: 'visible', timeout: 90000 });
check('desktop: Play opens the cinematic before the menu', await skipIntro.isVisible());
await skipIntro.click();
await desk.page.waitForSelector('.px-menu button', { timeout: 30000 });
check('desktop: Play opens /play/', new URL(desk.page.url()).pathname.endsWith('/play/'), desk.page.url());
const menuLabels = await desk.page.locator('.px-menu button').evaluateAll((els) => els.map((e) => e.textContent));
check('desktop: the pixel home draws with no ARENA2',
  ['New Game', 'Load Game', 'Settings'].every((core) => menuLabels.some((l) => l.includes(core))), JSON.stringify(menuLabels));
check('desktop: the folder pick has NOT been asked for',
  (await desk.page.locator('#pick').count()) === 0);
await desk.page.screenshot({ path: `${shots}/landing-desktop-play.png` });
console.log(`  ${shots}/landing-desktop-play.png`);
await desk.ctx.close();

const phone = await landing('phone', { ...devices['Pixel 5'] });
check('phone: the foot stacks and still carries its figures',
  await phone.page.locator('.foot').isVisible()
  && (await phone.page.locator('.foot .stat').count()) === 2);
const plaqueBoxes = await Promise.all([
  phone.page.locator('a.plaque', { hasText: 'Play' }).boundingBox(),
  phone.page.locator('a.plaque', { hasText: 'Install' }).boundingBox(),
]);
check('phone: Play and Install are 44px targets',
  plaqueBoxes.every((b) => !!b && b.height >= 44), plaqueBoxes.map((b) => `${b?.height}px`).join(' / '));
await phone.ctx.close();

await browser.close();
await bare.close();

const fake = mkdtempSync(join(tmpdir(), 'fake-arena2-'));
writeFileSync(join(fake, 'ART_PAL.COL'), 'not a palette');
process.env.ARENA2_PATH = fake;
const data = await createServer({ server: { host: '127.0.0.1', port: 5231, strictPort: true }, logLevel: 'error' });
await data.listen();
try {
  for (const path of ['/arena2/ART_PAL.COL', '/play/arena2/ART_PAL.COL', '/play/arena2/art_pal.col']) {
    const r = await fetch(`http://127.0.0.1:5231${path}`);
    check(`dev serves ${path}`, r.status === 200 && (await r.text()) === 'not a palette', `${r.status}`);
  }
  const miss = await fetch('http://127.0.0.1:5231/play/arena2/NOPE.BSA');
  check('dev 404s a missing name under /play/arena2/', miss.status === 404, `${miss.status}`);
} finally {
  await data.close();
  rmSync(fake, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
