// Measures RMS on the shared AudioContext output in a minimal page to check that the music layer makes sound.
// Run: node tools/musicProbe.mjs.
import { createServer } from 'vite';
import { chromium } from 'playwright';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const server = await createServer({ server: { port: 5206, strictPort: true } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => { const t = m.text(); if (/music|MIDI|song|error/i.test(t)) console.log('[page]', t); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.route('**/', (route) => route.fulfill({
  status: 200,
  contentType: 'text/html',
  body: '<!doctype html><meta charset="utf-8"><title>music probe</title><body><canvas id="c"></canvas>',
}));
await page.goto('http://localhost:5206/play/');
await page.mouse.click(200, 200);

const result = await page.evaluate(async () => {
  const mod = await import('/src/audio/music.js');
  const aud = await import('/src/audio/audio.js');
  const { DUNGEON_SONGS } = await import('/src/audio/songManager.js');
  const { fetchBytes } = await import('/src/scenes/shared.js');

  await aud.audio.ensure(fetchBytes);
  await mod.music.ensure(fetchBytes);
  if (!mod.music.enabled) return { error: 'MIDI.BSA did not load' };

  aud.audio._ensureCtx();
  const ctx = aud.audio.ctx;
  if (!ctx) return { error: 'no AudioContext' };
  if (ctx.state === 'suspended') await ctx.resume();

  const started = mod.music.playFrom(DUNGEON_SONGS, { gameDays: 0 });
  const player = mod.music.player;
  if (!player) return { error: 'no player', started, ctxState: ctx.state };

  const an = ctx.createAnalyser();
  an.fftSize = 2048;
  player._master.connect(an);

  const buf = new Float32Array(an.fftSize);
  const samples = [];
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 150));
    an.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let j = 0; j < buf.length; j++) sum += buf[j] * buf[j];
    samples.push(Math.sqrt(sum / buf.length));
  }
  return {
    ctxState: ctx.state,
    started,
    current: mod.music.current,
    playing: !!player.playing,
    songSeconds: player.song?.durationSeconds,
    events: player.song?.events?.length,
    peakRms: Math.max(...samples),
    meanRms: samples.reduce((a, b) => a + b, 0) / samples.length,
    audibleFrames: samples.filter((s) => s > 0.001).length,
    frames: samples.length,
  };
});
console.log(JSON.stringify(result, null, 2));

// A majority of the forty frames must clear the 0.001 audibility floor, since one click is not music.
const verdict = [];
if (result.error) verdict.push(result.error);
else {
  if (!result.playing) verdict.push('the player is not playing');
  if (!(result.peakRms > 0.001)) verdict.push(`silence: peakRms ${result.peakRms}`);
  if (!(result.audibleFrames > result.frames / 2)) {
    verdict.push(`mostly silent: ${result.audibleFrames}/${result.frames} frames above the floor`);
  }
}
if (verdict.length) for (const v of verdict) console.log(`FAIL: ${v}`);
else console.log(`MUSIC AUDIBLE: peak ${result.peakRms.toFixed(4)}, ${result.audibleFrames}/${result.frames} frames`);

await browser.close();
await server.close();
process.exit(verdict.length ? 1 : 0);
