// Boots a scene in a real browser and reports page errors, the crash overlay, and whether music started.
// Run: node tools/bootProbe.mjs [query].

import { createServer } from 'vite';
import { chromium } from 'playwright';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const query = process.argv[2] || 'nomenu&class=1&novideo';
const server = await createServer({ server: { port: 5208, strictPort: true } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const crashes = [];
const notes = [];
page.on('pageerror', (e) => crashes.push(String(e.message)));
// Console errors are notes only: the game logs handled 404s, such as a missing CURSOR.IMG, as errors.
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' || /music|MIDI|unavailable/i.test(t)) notes.push(`[${m.type()}] ${t}`);
});

await page.goto(`http://localhost:5208/play/?${query}`);
await page.waitForTimeout(Number(process.env.BOOT_WAIT ?? 12000));
await page.mouse.click(640, 400);
await page.waitForTimeout(3000);
if (process.env.PROBE_ENTER) {
  const before = await page.evaluate(async () => (await import('/src/audio/music.js')).music.current);
  const what = await page.evaluate(process.env.PROBE_ENTER);
  await page.waitForTimeout(Number(process.env.PROBE_ENTER_WAIT ?? 2500));
  const after = await page.evaluate(async () => (await import('/src/audio/music.js')).music.current);
  console.log(`ENTER[${what}]: ${before} -> ${after} | mode=${await page.evaluate(() => window.__mode?.() ?? 'n/a')}`);
}

const state = await page.evaluate(async () => {
  const mod = await import('/src/audio/music.js');
  const aud = await import('/src/audio/audio.js');
  let probe = 'ok';
  try {
    const { fetchBytes } = await import('/src/scenes/shared.js');
    const b = await fetchBytes('MIDI.BSA');
    probe = `bytes=${b?.length} ctor=${b?.constructor?.name}`;
    const { MidiBsaFile } = await import('/src/formats/hmiFile.js');
    const m2 = new MidiBsaFile(); m2.load(b);
    probe += ` songs=${m2.getSongName(0)}`;
  } catch (e) { probe = 'THREW: ' + (e?.message ?? e); }
  const { fetchBytes: fb } = await import('/src/scenes/shared.js');
  await mod.music.ensure(fb);
  const afterAwait = { enabled: mod.music.enabled, pending: mod.music._pending ?? null, bootError: mod.music.bootError ?? null };
  const crashEl = document.getElementById('crash');
  return { title: document.title, ready: window.__shotReady === true,
           crashOverlay: crashEl ? crashEl.textContent.slice(0, 300) : null,
           music: mod.music.current, playing: !!mod.music.player?.playing,
           enabled: mod.music.enabled, pending: mod.music._pending ?? null,
           ctx: aud.audio.ctx ? aud.audio.ctx.state : 'none', probe, afterAwait };
});
console.log(JSON.stringify({ ...state, crashes: crashes.slice(0, 6), notes: notes.slice(0, 6) }, null, 2));

const verdict = [];
if (state.crashOverlay) verdict.push(`the crash overlay is up: ${state.crashOverlay.split('\n')[1] ?? ''}`);
if (crashes.length) verdict.push(`${crashes.length} uncaught error(s): ${JSON.stringify(crashes.slice(0, 3))}`);
if (state.afterAwait?.bootError) verdict.push(`music boot error: ${state.afterAwait.bootError}`);
if (!/ - .+/.test(state.title ?? '')) verdict.push(`the scene set no status title: ${JSON.stringify(state.title)}`);
if (/shot/.test(query) && !state.ready) verdict.push('shot mode was asked for and __shotReady never came');
if (verdict.length) for (const v of verdict) console.log(`FAIL: ${v}`);
else console.log(`BOOT OK: ${query}`);

await browser.close();
await server.close();
process.exit(verdict.length ? 1 : 0);
