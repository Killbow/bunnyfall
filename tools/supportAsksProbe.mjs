// Checks the title screen's support links and that its corner marks never cover the logo at 192 viewport sizes.
// Usage: start `npx vite --port 5199` (or set PROBE_BASE), then run `node tools/supportAsksProbe.mjs`

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { OUTSET } from '../src/ui/enhancedFrame.js';
import { SUPPORT_ASKS } from '../src/ui/supportAsks.js';

const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:5199';
const LONG_NAME = 'Wolfgangheimer';
const LONG_LINE = 'Wolfgangheimer the Nightblade · level 30';
const logo = PNG.sync.read(readFileSync(new URL('../src/assets/branding/bunnyfall.png', import.meta.url)));
const opaque = (x, y) => logo.data[(y * logo.width + x) * 4 + 3] > 40;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const SIZES = [];
for (const w of [320, 360, 375, 390, 412, 430, 480, 540, 600, 700, 768, 800, 900, 1007, 1008, 1024, 1280, 1366, 1920]) for (const h of [568, 640, 667, 720, 768, 844, 900, 1080]) SIZES.push([w, h]);
for (const w of [568, 640, 667, 740, 812, 851, 915, 932]) for (const h of [320, 360, 375, 393, 414]) SIZES.push([w, h]);

function logoUnder(img, box, outset) {
  const b = { l: box.l - outset, t: box.t - outset, r: box.r + outset, b: box.b + outset };
  const sx = (img.r - img.l) / logo.width, sy = (img.b - img.t) / logo.height;
  const x0 = Math.max(0, Math.floor((b.l - img.l) / sx)), x1 = Math.min(logo.width - 1, Math.ceil((b.r - img.l) / sx));
  const y0 = Math.max(0, Math.floor((b.t - img.t) / sy)), y1 = Math.min(logo.height - 1, Math.ceil((b.b - img.t) / sy));
  let n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (opaque(x, y)) n++;
  return Math.round(n * sx * sy);
}
const meets = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

const browser = await chromium.launch();

{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  // The linked pages are answered locally, so the check covers the press and never reaches the network.
  await ctx.route(/patreon\.com|ko-fi\.com/, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>ask</title>' }));
  await page.goto(`${BASE}/play/?nointro`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.px-menu button', { timeout: 90000 });
  if (await page.locator('.px-acctstage').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  const links = await page.locator('.px-support a.px-supportlink').evaluateAll((els) => els.map((a) => ({ href: a.href, target: a.target, label: a.getAttribute('aria-label') })));
  check('the door carries the asks, Patreon then Ko-fi, at SUPPORT_ASKS\' addresses, each opening a new page',
    JSON.stringify(links) === JSON.stringify(SUPPORT_ASKS.map((a) => ({ href: a.url, target: '_blank', label: a.label }))), JSON.stringify(links));
  for (const ask of SUPPORT_ASKS) {
    const [opened] = await Promise.all([ctx.waitForEvent('page', { timeout: 15000 }).catch(() => null), page.locator(`.px-support-${ask.id}`).click()]);
    check(`a press on ${ask.name} opens ${ask.url}`, opened?.url() === ask.url, opened?.url() ?? 'no page opened');
    await opened?.close();
  }
  check('the door is still the door after both presses', (await page.locator('.px-menu button').count()) > 0 && (await page.locator('.px-support').count()) === 1);
  await ctx.close();
}

for (const [skin, query, outset] of [['plus', '', OUTSET], ['classic', '&skin=classic', 0]]) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/play/?nointro${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.px-menu button', { timeout: 90000 });
  if (await page.locator('.px-acctstage').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  await page.waitForFunction(() => document.querySelector('.px-wordmark img')?.complete);
  const onLogo = { support: [], profile: [], profileLong: [] };
  const covers = [], small = [], cut = [], moved = [], wide = [];
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const g = await page.evaluate(([longName, longLine]) => {
      const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
      const stage = document.querySelector('.px-home:not(.px-over) > .px-stage:not(.px-acctstage)');
      const rows = [...document.querySelectorAll('.px-menu button')];
      const out = { img: r(document.querySelector('.px-wordmark img')), support: r(document.querySelector('.px-support')),
        profile: r(document.querySelector('.px-profile')), foot: [...document.querySelectorAll('.px-foot .px-about')].map(r),
        links: [...document.querySelectorAll('.px-supportlink')].map(r), rows: rows.map(r) };
      out.wordmarkTop = document.querySelector('.px-wordmark').getBoundingClientRect().top;
      const cs = getComputedStyle(stage), sb = stage.getBoundingClientRect();
      out.fits = stage.scrollHeight <= stage.clientHeight;
      out.over = stage.firstElementChild.getBoundingClientRect().top - (sb.top + parseFloat(cs.paddingTop));
      out.under = (sb.bottom - parseFloat(cs.paddingBottom)) - stage.lastElementChild.getBoundingClientRect().bottom;
      stage.scrollTop = stage.scrollHeight;
      const last = rows.at(-1).getBoundingClientRect();
      const hit = document.elementFromPoint(last.left + last.width / 2, Math.min(last.top + last.height / 2, innerHeight - 1));
      out.lastPressed = !!hit && rows.at(-1).contains(hit);
      out.lastWhole = last.bottom <= innerHeight && last.top >= 0;
      stage.scrollTop = 0;
      const name = document.querySelector('.px-profilename'), line = document.querySelector('.px-profilesub');
      const was = [name?.textContent, line?.textContent];
      if (name && line) {
        name.textContent = longName; line.textContent = longLine;
        out.profileLong = r(document.querySelector('.px-profile'));
        out.captionLong = document.querySelector('.px-profiletext').getBoundingClientRect().width;
        name.textContent = was[0]; line.textContent = was[1];
      }
      return out;
    }, [LONG_NAME, LONG_LINE]);
    const at = `${w}x${h}`;
    const s = logoUnder(g.img, g.support, outset);
    if (s) onLogo.support.push(`${at}(${s}px²)`);
    const p = logoUnder(g.img, g.profile, outset);
    if (p) onLogo.profile.push(`${at}(${p}px²)`);
    if (g.profileLong) {
      const q = logoUnder(g.img, g.profileLong, outset);
      if (q) onLogo.profileLong.push(`${at}(${q}px²)`);
      if (w > 480 && g.captionLong > 140.5) wide.push(`${at}: ${g.captionLong.toFixed(1)}px`);
    }
    for (const [name, box] of [['the profile', g.profile], ...g.foot.map((b, i) => [`foot plaque ${i + 1}`, b]), ...g.rows.map((b, i) => [`row ${i + 1}`, b])]) {
      if (meets(g.support, box)) covers.push(`${at}: ${name}`);
    }
    for (const l of g.links) if (l.r - l.l < 44 || l.b - l.t < 44) small.push(`${at}: ${Math.round(l.r - l.l)}x${Math.round(l.b - l.t)}`);
    if (g.wordmarkTop < 0 || !g.lastWhole || !g.lastPressed) cut.push(`${at}(${g.wordmarkTop < 0 ? 'top ' : ''}${!g.lastWhole ? 'last row not whole ' : ''}${!g.lastPressed ? 'last row not pressed' : ''})`.replace(' )', ')'));
    if (w > 480 && g.fits && Math.abs(g.over - g.under) > 1) moved.push(`${at}: ${Math.round(g.over)} over, ${Math.round(g.under)} under`);
  }
  check(`${skin}: the asks stand on no opaque pixel of the logo, at ${SIZES.length} sizes`, onLogo.support.length === 0, onLogo.support.join(' '));
  check(`${skin}: nor does the profile mark, as a new player sees it`, onLogo.profile.length === 0, onLogo.profile.join(' '));
  check(`${skin}: nor with its caption at its bound - a long name, a long line`, onLogo.profileLong.length === 0, onLogo.profileLong.join(' '));
  check(`${skin}: the door's caption is held to 140px however long its line`, wide.length === 0, wide.slice(0, 8).join('; '));
  check(`${skin}: the asks cover no menu row, no foot plaque and no profile mark`, covers.length === 0, covers.slice(0, 8).join('; '));
  check(`${skin}: each ask is a 44px target`, small.length === 0, small.slice(0, 8).join('; '));
  check(`${skin}: DOOR-FIT - the wordmark's top on the screen, and the last row whole and pressed scrolled to the end, at every size`, cut.length === 0, cut.join(' '));
  check(`${skin}: DOOR-FIT - where the door fits it is centred, the room over it the room under it`, moved.length === 0, moved.slice(0, 8).join('; '));
  check(`${skin}: no page error`, errors.length === 0, errors.join(' | '));
  await page.close();
}
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
