// Ketch lab probes on Vite's dev server: value (luma per view), flash, shadow, and bill (draw counts per view).
// Run: node tools/ketchLabProbe.mjs <value|flash|shadow|bill> [views...] (env KETCH_Q, KETCH_PORT, KETCH_HOURS).
// Exits 1 on a page error, a frame that drew nothing, or a failed check.
import { existsSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { KT_LADDER } from '../src/world/ketch/ketchLook.js';
import { KT_LAB_BILL } from '../src/tools/ketchLabViews.js';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const extra = process.env.KETCH_Q ?? '';
const VIEWS = ['arrive', 'waist', 'waist-aft', 'gallery', 'landing', 'hold', 'engine', 'lift', 'top-out', 'sailwalk', 'sailwalk-side', 'bridge', 'helm', 'cabin', 'bow', 'side', 'stern', 'below', 'city'];
const HOURS = process.env.KETCH_HOURS ? process.env.KETCH_HOURS.split(',').map(Number) : [5.5, 7, 12, 18.5, 19.5, 2];
const BELOW = ['gallery', 'landing', 'hold', 'engine', 'lift'], DECK = ['arrive', 'waist', 'bridge', 'helm'];
const [mode = 'value', ...rest] = process.argv.slice(2);
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); };

const port = Number(process.env.KETCH_PORT ?? 5261);
const server = await createServer({ server: { port, strictPort: true, watch: { ignored: ['**/.claude/**'] } }, logLevel: 'error' });
await server.listen();
const exe = process.env.KETCH_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.KETCH_W ?? 480), height: Number(process.env.KETCH_H ?? 300) } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
const open = async (q) => {
  errors.length = 0;
  await page.goto(`http://127.0.0.1:${port}/ketch.html?still&nopanel&${q}${extra ? `&${extra}` : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => (window.__frame ?? 0) >= 4, null, { timeout: 240000 });
};
const step = async (t) => {
  const f0 = await page.evaluate((s) => { window.__lab.clock(s); return window.__frame; }, t);
  await page.waitForFunction((f) => window.__frame > f + 1, f0, { timeout: 120000 });
};
const lumaOf = () => page.evaluate(() => {
  const c = document.getElementById('c'), gl = c.getContext('webgl2'), w = c.width, h = c.height, px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const y = new Float32Array(w * h);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) y[j] = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
  return { w, h, y: Array.from(y) };
});
const pct = (arr, p) => { const a = [...arr].sort((x, z) => x - z); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };

try {
  if (mode === 'value') {
    const L = KT_LADDER;
    await open('t=40&hour=12&eye=24');
    for (const view of rest.length ? rest : VIEWS) {
      await page.evaluate((v) => window.__lab.view(v), view);
      for (const hour of HOURS) {
        await page.evaluate((hr) => window.__lab.hour(hr), hour);
        for (let k = 0; k < 3; k++) await step(40);
        const { w, h, y } = await lumaOf();
        const floor = y.slice(0, Math.floor(h * 0.3) * w), fMean = floor.reduce((a, v) => a + v, 0) / floor.length;
        const p50 = pct(y, 0.5), f50 = pct(floor, 0.5), f95 = pct(floor, 0.95);
        const want = [];
        if (BELOW.includes(view)) want.push([`p50 >= ${L.below.p50}`, p50 >= L.below.p50], [`floor p95 <= ${L.below.telegraphFloor}`, f95 <= L.below.telegraphFloor]);
        if (DECK.includes(view) && (hour === 7 || hour === 12)) want.push([`floor p95 <= ${L.deck.noonFloorP95}`, f95 <= L.deck.noonFloorP95]);
        if (DECK.includes(view) && hour === 12) want.push([`floor mean <= ${L.deck.noonFloorMean}`, fMean <= L.deck.noonFloorMean]);
        if (DECK.includes(view) && (hour === 5.5 || hour === 18.5)) want.push([`floor p50 >= ${L.deck.duskP50}`, f50 >= L.deck.duskP50]);
        if (DECK.includes(view) && (hour === 19.5 || hour === 2)) want.push([`floor mean >= ${L.deck.nightMean}`, fMean >= L.deck.nightMean]);
        if (view === 'cabin') want.push([`p50 in ${L.cabin.p50.join('-')}`, p50 >= L.cabin.p50[0] && p50 <= L.cabin.p50[1]]);
        const lit = y.some((v) => v > 0.02), bad = want.filter(([, ok]) => !ok).map(([n]) => n);
        check(`${view} at ${hour}h${want.length ? '' : ' (measured)'}`, lit && !bad.length && !errors.length, `frame p50 ${p50.toFixed(3)} p95 ${pct(y, 0.95).toFixed(3)}, floor p50 ${f50.toFixed(3)} p95 ${f95.toFixed(3)} mean ${fMean.toFixed(3)}${bad.length ? `; wants ${bad.join(', ')}` : ''}${errors.length ? `; ${errors[0]}` : ''}`);
      }
    }
  } else if (mode === 'flash') {
    await open('t=4.8&view=hold&hour=12');
    let prev = null, transitions = 0;
    const T0 = 4.8, N = 240;
    for (let k = 0; k < N; k++) {
      await step(T0 + k / 60);
      const { y } = await lumaOf();
      if (prev) { let changed = 0; for (let i = 0; i < y.length; i++) if (Math.abs(y[i] - prev[i]) > 0.15) changed++; if (changed > y.length * 0.002) transitions++; }
      prev = y;
    }
    const hz = transitions / (N / 60);
    check('a live arc flashes at most 3 times a second', hz <= 3 && !errors.length, `${transitions} transitions in ${N / 60} s (${hz.toFixed(2)} Hz)${errors.length ? `; ${errors[0]}` : ''}`);
  } else if (mode === 'shadow') {
    for (const [name, q, t0, span] of [['the mast-lift riding', 'view=lift&stage=3&hour=12', 0.5, 9], ['the bridge\'s sections warned, falling, rising', 'view=bridge&stage=4&sec=1,2&secAt=45&hour=12', 41, 12]]) {
      await open(`t=${t0}&${q}&bill`);
      let worst = 0, casters = 0;
      for (let k = 0; k <= 24; k++) {
        await step(t0 + (span * k) / 24);
        const b = await page.evaluate(() => window.__lab.bill());
        worst = Math.max(worst, b.moving); casters = b.casters;
      }
      check(`no moving part records a shadow: ${name}`, worst === 0 && !errors.length, `moving casters at most ${worst} of ${casters}${errors.length ? `; ${errors[0]}` : ''}`);
    }
  } else if (mode === 'bill') {
    await open('t=40&hour=12&stage=4&fight=song&lo=7:9,8:9&carry=2&bill');
    for (const view of rest.length ? rest : Object.keys(KT_LAB_BILL)) {
      await page.evaluate((v) => window.__lab.view(v), view);
      for (let k = 0; k < 2; k++) await step(40);
      const b = await page.evaluate(() => window.__lab.bill());
      check(`${view}: the ship's GL draws at most ${KT_LAB_BILL[view]}`, b.gl <= KT_LAB_BILL[view] && !errors.length, `${b.gl} GL draws (${b.draws} meshes, ${b.casters} casters, ${b.lights} lights, ${b.cpuMs.toFixed(2)} ms)${errors.length ? `; ${errors[0]}` : ''}`);
    }
  } else throw new Error(`no such probe: ${mode}`);
} finally {
  await browser.close();
  await server.close();
}
const failed = results.filter((ok) => !ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
