// Opens the held map (M for the town plan, V for the travel map) in the world host and reads its layout.
// Run: ARENA2_PATH=/path/to/arena2 node tools/mapLaneProbe.mjs (VIEW=WxH sets the viewport).
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const SHOTS = process.env.SHOTS ?? 'maplane-shots';
mkdirSync(SHOTS, { recursive: true });
process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';

const server = await createServer({ root: process.cwd(), server: { port: 5233, strictPort: true, hmr: false, watch: null } });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const [VW, VH] = (process.env.VIEW ?? '1280x800').split('x').map(Number);
const page = await browser.newPage({ viewport: { width: VW, height: VH } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.stack ?? e.message)));
page.on('console', (m) => { if (m.type() === 'error' && !/CURSOR\.IMG|status of 404|ERR_CERT/.test(m.text())) errors.push(`[console] ${m.text()}`); });
const ev = (fn, ...args) => page.evaluate(fn, ...args);
const shot = async (name) => { try { await page.screenshot({ path: `${SHOTS}/${name}`, timeout: 120000 }); console.log(`shot ${name}`); } catch (e) { console.log(`(screenshot ${name} skipped: ${e.message.split('\n')[0]})`); } };
const skin = process.env.SKIN ?? 'enhanced';
await page.goto(`http://localhost:5233/play/?world&shot&play&region=Daggerfall&loc=Daggerfall&class=1&novideo&tod=12:00&skin=${skin}`);
let mode = null;
for (const until = Date.now() + 240000; Date.now() < until;) {
  mode = await ev(() => (window.__mode ? window.__mode() : null));
  const idle = await ev(() => (window.__streamIdle ? window.__streamIdle() : false));
  if (mode && idle) break;
  await page.waitForTimeout(1000);
}
console.log(`booted: mode=${mode}`);
await page.waitForTimeout(3000);
let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) fails++; return !!ok; };
for (let i = 0; i < 60; i++) {
  const t = JSON.parse(await ev(() => window.__talk()));
  if (!t.overlay) break;
  await page.keyboard.press(/tutorial/i.test(t.overlayBox ?? '') ? 'KeyN' : 'Space');
  await page.waitForTimeout(300);
}
check(!JSON.parse(await ev(() => window.__talk())).overlay, 'the street is clear of boxes before a map key is pressed');
const state = () => ev(() => (globalThis.__heldMap ? JSON.stringify(globalThis.__heldMap()) : null));
const rig = () => ev(() => JSON.stringify(window.__weaponDebug ? JSON.parse(window.__weaponDebug()) : null));
for (const key of ['KeyM', 'KeyV']) {
  await page.keyboard.press(key);
  for (let i = 0; i < 12; i++) { await page.waitForTimeout(500); if (await state()) break; }
  await page.waitForTimeout(2500);
  const s = await state();
  console.log(`${key}: heldMap=${s}`);
  console.log(`${key}: rig=${await rig()}`);
  console.log(`${key}: chrome=${await ev(() => { const r = document.querySelector('.hmroot, [class*="hm"]'); const st = r ? document.querySelector('[class*="hmstage"], .hmstage') : null; const ink = document.querySelector('canvas[class*="hmink"], .hmink'); const rect = (el) => el ? JSON.stringify(el.getBoundingClientRect()) : null; return JSON.stringify({ root: r?.className ?? null, stage: rect(st), stageTransform: st?.style?.transform ?? null, ink: rect(ink), inkOpacity: ink?.style?.opacity ?? null, inkTransform: (ink?.style?.transform ?? '').slice(0, 60) }); })}`);
  await shot(`${key}-${VW}x${VH}.png`);
  const st = s ? JSON.parse(s) : null;
  check(!!st, `${key} opened the held map`);
  check(st?.lane === 'hands' && st?.placed === true, `${key}: the sheet is in the Morrowind hands (lane ${st?.lane}, placed ${st?.placed})`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
}
check(errors.length === 0, errors.length ? `page errors: ${errors.slice(0, 3).join(' | ')}` : 'zero page errors');
await browser.close();
await server.close();
console.log(fails === 0 ? 'MAP LANE PROBE: ALL GREEN' : `MAP LANE PROBE: ${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
