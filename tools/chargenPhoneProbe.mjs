// Checks that every row, stepper, and primary button of the character wizard can be reached at phone sizes.
// Run: node tools/chargenPhoneProbe.mjs (STATES=all for every stage; SIZES and FACEH override the defaults).

import { createServer } from 'vite';
import { chromium } from 'playwright';
import { createServer as netServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const ROOT = process.env.ROOT ?? fileURLToPath(new URL('..', import.meta.url));
const FACEH = Number(process.env.FACEH ?? 128);

const SIZES = [
  ['390x664', 390, 664, true],
  ['390x844', 390, 844, true],
  ['844x390', 844, 390, true],
  ['844x340', 844, 340, true],
  ['932x430', 932, 430, true],
  ['430x740', 430, 740, true],
  ['1180x820', 1180, 820, true],
  ['820x1180', 820, 1180, true],
  ['1280x720', 1280, 720, false],
  ['1280x480', 1280, 480, false],
];
const ALL_ONLY = new Set(['820x1180', '1280x480']);
const PROBE_STATES = ['race', 'raceconfirm', 'class', 'classconfirm', 'stats', 'review'];
const ALL_STATES = ['race', 'raceconfirm', 'gender', 'classMethod', 'class', 'classconfirm', 'name', 'face',
  'stats', 'skills', 'reflexes', 'review', 'reviewpool'];
const ALL = process.env.STATES === 'all';
const states = ALL ? ALL_STATES : (process.env.STATES ? process.env.STATES.split(',') : PROBE_STATES);
const sizes = SIZES.filter(([n]) => (process.env.SIZES ? process.env.SIZES.split(',').includes(n) : (ALL || !ALL_ONLY.has(n))));
const AT_LEAST = { race: { province: 8 }, class: { row: 19 }, stats: { stepper: 16, row: 8 }, skills: { stepper: 24 },
  review: { stepper: 40 } };
const NO_PRIMARY = new Set(['race', 'gender', 'classMethod']);
const AT_REST = new Set(['class']);
// Matches the short-screen query in enhancedStyle.js, (max-height: 500px).
const SHORT = 500;

const PAGE = '<!doctype html><html lang="en"><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
  + '<title>chargenPhoneProbe</title></head><body></body></html>';

// Playwright ships this function's source to the page, so nothing here may close over the module.
async function setup() {
  const { ChargenFlow } = await import('/src/ui/chargen.js');
  const { mountEnhancedChargen } = await import('/src/ui/enhancedChargen.js');
  const { RACE_TEMPLATES } = await import('/src/characters/races.js');
  window.__errors = [];
  addEventListener('error', (e) => window.__errors.push(String(e.message)));
  addEventListener('unhandledrejection', (e) => window.__errors.push(`rejection: ${e.reason}`));
  const CAREER = { hitPointsPerLevel: 8, strength: 40, intelligence: 60, willpower: 72, agility: 48, endurance: 52,
    personality: 55, speed: 48, luck: 57, primarySkills: [0, 1, 2], majorSkills: [3, 4, 5], minorSkills: [6, 7, 8, 9, 10, 11] };
  const NAMES = ['Mage', 'Spellsword', 'Battlemage', 'Sorcerer', 'Healer', 'Nightblade', 'Bard', 'Burglar', 'Rogue',
    'Acrobat', 'Thief', 'Assassin', 'Monk', 'Archer', 'Ranger', 'Barbarian', 'Warrior', 'Knight'];
  const LINES = Array.from({ length: 18 }, (_, i) => (i === 9 ? '' : `A stand-in line ${i + 1} of a description, as long as TEXT.RSC's own.`));
  const W = 320, H = 200, data = new Uint8Array(W * H);
  RACE_TEMPLATES.forEach((r, i) => {
    const x0 = 10 + (i % 4) * 75, y0 = 20 + Math.floor(i / 4) * 85;
    for (let y = y0; y < y0 + 70; y++) for (let x = x0; x < x0 + 65; x++) data[y * W + x] = r.id;
  });
  const walk = (f, target) => {
    for (let g = 0; g < 200 && f.state !== target; g++) {
      const s = f.state;
      if (s === 'race') { if (f.raceConfirm) f.applyHit({ confirmRace: true }); else f.input('confirm'); }
      else if (s === 'gender') f.input('char:m');
      else if (s === 'class') { if (f.classConfirm) f.applyHit({ confirmClass: true }); else f.useClass(); }
      else if (s === 'name') { for (const ch of 'Ayla') f.input(`char:${ch}`); f.input('confirm'); }
      else if (s === 'stats') {
        for (let i = 0; f.statPool > 0 && i < 400; i++) { f.applyHit({ setStatCursor: i % 8 }); f.applyHit({ statStep: 1 }); }
        f.input('confirm');
      } else if (s === 'skills') {
        let at = 0;
        for (const [group, ids] of f.skillRows()) {
          for (let guard = 0; (f.pools?.[group] ?? 0) > 0 && guard < 50; guard++) {
            for (let k = 0; k < ids.length && (f.pools?.[group] ?? 0) > 0; k++) {
              f.applyHit({ setSkillCursor: at + k }); f.applyHit({ skillStep: 1, group });
            }
          }
          at += ids.length;
        }
        f.input('confirm');
      } else f.input('confirm');
    }
    if (f.state !== target) throw new Error(`the walk stopped at ${f.state}, short of ${target}`);
  };
  let view = null;
  window.__mount = async (state, faceH) => {
    view?.unmount();
    document.getElementById('enhanced-chargen')?.remove();
    const f = new ChargenFlow(NAMES.map((name) => ({ name, career: { ...CAREER, name } })), () => 0.5);
    f.describeRace = () => LINES;
    f.describeClass = () => LINES;
    f.bonusPointsRows = () => ['You must distribute all of your bonus points', 'before you continue.'];
    const to = { raceconfirm: 'race', classconfirm: 'class', review: 'summary', reviewpool: 'summary' }[state] ?? state;
    if (to !== 'race') walk(f, to);
    if (state === 'raceconfirm') f.applyHit({ setRace: RACE_TEMPLATES[2].key, describe: LINES });
    if (state === 'classconfirm') { f.applyHit({ setClass: 4 }); f.useClass(); }
    if (state === 'reviewpool') { f.applyHit({ setStatCursor: 0 }); f.applyHit({ statStep: -1 }); f.confirmSummary(); }
    const host = document.createElement('div');
    host.id = 'enhanced-chargen';
    host.style.cssText = 'position:fixed;inset:0;z-index:14;background:#0e1013;overflow:hidden';
    document.body.append(host);
    const heads = async () => Array.from({ length: 10 }, (_, i) => {
      const c = document.createElement('canvas');
      c.width = 128; c.height = faceH;
      const g = c.getContext('2d');
      g.fillStyle = `hsl(${i * 36},45%,45%)`; g.fillRect(8, 8, 112, faceH - 16);
      return c;
    });
    view = mountEnhancedChargen(host, { flow: f, picker: { width: W, height: H, data }, loadFaces: heads, onExit: () => {} });
    await new Promise((r) => setTimeout(r, 40));
    view.repaint();
    return [f.state, f.raceConfirm && 'raceConfirm', f.classConfirm && 'classConfirm', f.poolBox && 'poolBox'].filter(Boolean).join('+');
  };
  window.__ready = true;
}

function measure() {
  const cs = (e) => getComputedStyle(e);
  const clips = (s) => s.overflowX !== 'visible' || s.overflowY !== 'visible';
  const sheet = [...document.querySelectorAll('.stagebody > .detail')].find((d) => cs(d).position === 'fixed');
  const scope = sheet ?? document.querySelector('#enhanced-chargen .pane');
  const label = (el) => {
    if (el.matches('path')) return `province ${[...document.querySelectorAll('path.prov:not(.inert)')].indexOf(el) + 1}`;
    const row = el.closest('.row');
    const name = row?.querySelector('.row-name')?.textContent;
    if (el.classList.contains('step')) return `${name}${el.textContent}`;
    return (el.value || el.textContent || el.className).trim().replace(/\s+/g, ' ').slice(0, 28);
  };
  const kindOf = (el) => (el.matches('path') ? 'province' : el.classList.contains('step') ? 'stepper'
    : el.classList.contains('row-main') ? 'row' : el.classList.contains('primary') ? 'primary'
      : el.classList.contains('sheet-close') ? 'close' : 'other');
  const THUMB = 44;
  const shows = (el) => {
    const clippers = [];
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const s = cs(a);
      if (clips(s)) clippers.push(a);
      if (s.position === 'fixed') break;
    }
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth) return false;
    for (const a of clippers) {
      const q = a.getBoundingClientRect();
      if (r.top < q.top - 0.5 || r.bottom > q.bottom + 0.5 || r.left < q.left - 0.5 || r.right > q.right + 0.5) return false;
    }
    const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    return hit === el || el.contains(hit);
  };
  const reach = (el, slice) => {
    const clippers = [];
    let scroller = null;
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const s = cs(a);
      if (clips(s)) clippers.push(a);
      if (!scroller && /(auto|scroll)/.test(s.overflowY) && a.scrollHeight > a.clientHeight + 1) scroller = a;
      if (s.position === 'fixed') break;
    }
    if (clippers.some((a) => el.getBoundingClientRect().height > a.clientHeight)) slice = true;
    const fits = () => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      let t = Math.max(r.top, 0), b = Math.min(r.bottom, innerHeight), l = Math.max(r.left, 0), rt = Math.min(r.right, innerWidth);
      for (const a of clippers) {
        const q = a.getBoundingClientRect();
        t = Math.max(t, q.top); b = Math.min(b, q.bottom); l = Math.max(l, q.left); rt = Math.min(rt, q.right);
      }
      if (slice ? (b - t < THUMB || rt - l < THUMB)
        : (t > r.top + 0.5 || b < r.bottom - 0.5 || l > r.left + 0.5 || rt < r.right - 0.5)) return false;
      const mine = (hit) => hit === el || el.contains(hit) || (el.matches('path') && !!el.dataset.prov && hit?.dataset?.prov === el.dataset.prov);
      if (!el.matches('path')) return mine(document.elementFromPoint((l + rt) / 2, (t + b) / 2));
      for (const fy of [0.5, 0.3, 0.7, 0.15, 0.85]) for (const fx of [0.5, 0.3, 0.7, 0.15, 0.85]) {
        if (mine(document.elementFromPoint(l + (rt - l) * fx, t + (b - t) * fy))) return true;
      }
      return false;
    };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    if (fits()) return null;
    if (scroller) {
      const r = el.getBoundingClientRect(), q = scroller.getBoundingClientRect();
      const top = scroller.scrollTop + (r.top - q.top), max = scroller.scrollHeight - scroller.clientHeight;
      const lo = Math.max(0, Math.floor(top - scroller.clientHeight));
      const hi = Math.min(max, Math.ceil(top + r.height));
      for (let s = hi; s >= lo; s -= 2) { scroller.scrollTop = s; if (fits()) return null; }
      el.scrollIntoView({ block: 'center', inline: 'center' });
    }
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return 'no size';
    if (slice && (r.height < THUMB || r.width < THUMB)) return `drawn at ${Math.round(r.width)}x${Math.round(r.height)}px`;
    for (const a of clippers) {
      const q = a.getBoundingClientRect();
      if (r.top < q.top - 0.5 || r.bottom > q.bottom + 0.5) return `clipped by .${String(a.className?.baseVal ?? a.className).trim().split(/\s+/).join('.')} (${Math.round(q.height)}px)`;
    }
    if (r.top < 0 || r.bottom > innerHeight) return `off screen at y ${Math.round(r.top)}`;
    const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    return `under ${hit ? `${hit.tagName.toLowerCase()}.${String(hit.className?.baseVal ?? hit.className).trim().split(/\s+/).join('.')}` : 'nothing'}`;
  };
  const saved = [...document.querySelectorAll('#enhanced-chargen *')].filter((e) => e.scrollTop || e.scrollLeft).map((e) => [e, e.scrollTop, e.scrollLeft]);
  const counts = {}, bad = [];
  const controls = [...scope.querySelectorAll('button, input, path.prov:not(.inert)')].filter((el) => !el.closest('.rail'));
  const atRest = controls.some((el) => kindOf(el) === 'primary' && shows(el));
  for (const el of controls) {
    const kind = kindOf(el);
    const hidden = cs(el).display === 'none' || cs(el).visibility === 'hidden' || el.closest('[hidden]');
    if (hidden && !(sheet && kind === 'close')) continue;
    const c = (counts[kind] ??= [0, 0]);
    c[1]++;
    const why = hidden ? 'hidden' : reach(el, kind === 'province');
    if (why) bad.push(`${label(el)}: ${why}`); else c[0]++;
  }
  for (const e of document.querySelectorAll('#enhanced-chargen *')) { e.scrollTop = 0; e.scrollLeft = 0; }
  for (const [e, t, l] of saved) { e.scrollTop = t; e.scrollLeft = l; }
  return { counts, bad, atRest, sheet: !!sheet, coarse: matchMedia('(pointer: coarse)').matches, errors: window.__errors.splice(0) };
}

const port = await new Promise((resolve, reject) => {
  const s = netServer();
  s.unref();
  s.on('error', reject);
  s.listen(0, '127.0.0.1', () => { const { port: p } = s.address(); s.close(() => resolve(p)); });
});
const cacheDir = mkdtempSync(join(tmpdir(), 'chargenPhoneProbe-'));
// No config file and a cache of its own, so the site's vite.config.js and any running dev server are untouched.
const server = await createServer({ root: ROOT, configFile: false, cacheDir, logLevel: 'error', clearScreen: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { host: '127.0.0.1', port, strictPort: true, hmr: false } });
await server.listen();
const BASE = `http://127.0.0.1:${port}`;
const browser = await chromium.launch();
console.log(`chargenPhoneProbe: ${ROOT} on ${BASE}, heads ${FACEH}px`);
let failed = 0, lines = 0;
try {
  for (const [size, W, H, touch] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: touch ? 2 : 1, isMobile: touch, hasTouch: touch });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.route(`${BASE}/__chargenPhoneProbe.html`, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE }));
    await page.goto(`${BASE}/__chargenPhoneProbe.html`, { waitUntil: 'load' });
    await page.evaluate(setup);
    for (const state of states) {
      const drawn = await page.evaluate(([s, fh]) => window.__mount(s, fh), [state, FACEH]);
      await page.waitForTimeout(60);
      const m = await page.evaluate(measure);
      const problems = [...m.bad];
      if (m.coarse !== touch) problems.push(`pointer is ${m.coarse ? 'coarse' : 'fine'} - the probe is not on the device it names`);
      for (const [kind, n] of Object.entries(AT_LEAST[state] ?? {})) {
        if ((m.counts[kind]?.[1] ?? 0) < n) problems.push(`drew ${m.counts[kind]?.[1] ?? 0} ${kind}s of ${n}`);
      }
      if (!NO_PRIMARY.has(state) && !(m.counts.primary?.[1] > 0)) problems.push('no primary');
      if (AT_REST.has(state) && H > SHORT && !m.atRest) problems.push('the primary is not on screen until the stage is scrolled');
      if (m.sheet && !(m.counts.close?.[1] > 0)) problems.push('a sheet with no close');
      for (const e of [...m.errors, ...pageErrors.splice(0)]) problems.push(`threw: ${e}`);
      const NAME = { province: 'provinces', row: 'rows', stepper: 'steppers', primary: 'primary', close: 'close', other: 'others' };
      const tally = Object.keys(NAME).filter((k) => m.counts[k]).map((k) => `${NAME[k]} ${m.counts[k][0]}/${m.counts[k][1]}`).join('  ');
      const where = `${drawn}${m.sheet ? ' (sheet)' : ''}`;
      console.log(`${state.padEnd(12)} ${size.padEnd(9)} ${where.padEnd(28)} ${tally.padEnd(56)} ${problems.length ? `FAIL ${problems.length}: ${problems.slice(0, 4).join(' | ')}${problems.length > 4 ? ' | ...' : ''}` : 'ok'}`);
      lines++;
      if (problems.length) failed++;
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.close();
  rmSync(cacheDir, { recursive: true, force: true });
}
console.log(failed ? `FAIL: ${failed} of ${lines} stage x size cannot reach every control` : `OK: every row, stepper and primary reachable (${lines} stage x size)`);
process.exit(failed ? 1 : 0);
