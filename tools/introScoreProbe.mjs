// Renders the intro theme through the game's song player in a browser and checks level, clipping, cues, and tone.
// Run: node tools/introScoreProbe.mjs [--wav <file>] [--seconds <n>].
import { chromium } from 'playwright';
import http from 'node:http';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLOUD_REVEAL_TIME, CREST_TIME as TITLE_IMPACT_TIME } from '../src/ui/introCue.js';
import { introThemeSong, INTRO_CHANNELS, INTRO_SECONDS_PER_TICK } from '../src/audio/introScore.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const wavAt = arg('--wav');
const SECONDS = Number(arg('--seconds') ?? 170);
const out = []; const check = (n, ok, d = '') => { out.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ` - ${d}` : ''}`); };

// The replaced intro recording's loudness, measured before it was removed: stereo RMS from 24 s to 160 s at the
// intro's 0.82 gain and MusicVolume 0.5.
const RECORDING_DB = -22.4;

const PAGE = `<!doctype html><html><body><script type=module>
import { SongPlayer } from '/src/audio/songPlayer.js';
import { introThemeSong, INTRO_PRESS } from '/src/audio/introScore.js';
import { INTRO_THEME_GAIN } from '/src/audio/introTheme.js';
const RATE = 44100;
window.render = async (seconds) => {
  const song = introThemeSong();
  const secs = Math.min(seconds, song.durationTicks * song.secondsPerTick + 0.06);   // one pass: the loop's seam is not the song
  const real = new OfflineAudioContext(2, Math.ceil(RATE * secs), RATE);
  // the player's clock, carried by hand: it reads ctx.currentTime, which an offline context holds at 0 until it renders
  let now = 0;
  const ctx = new Proxy(real, { get(t, k) { if (k === 'currentTime') return now; const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
  // the intro's own gain under the player's master (INTRO-REVERT: the film plays the recording again, and the INTRO3b
  // hall left with the player that wired it - the kept score renders dry)
  const gain = real.createGain(); gain.gain.value = INTRO_THEME_GAIN; gain.connect(real.destination);
  const p = new SongPlayer(ctx, gain, null);
  p.play(song);
  clearInterval(p._timer);
  const origin = p._originTime;
  // INTRO3c: THE PUMP JUST IN TIME - the context suspended every 0.1 s (under the player's LOOKAHEAD, so no window is
  // skipped as a stall) and the player pumped there, so each window's nodes are made as the render reaches it. Pumping
  // the whole song before the first sample put every note's nodes in the graph from the start, and the render paid for
  // all of them at every quantum: 8 minutes for the song, over 30 with the vibrato's and the breath's nodes; just in
  // time it pays for the notes that sound. The loop stays on through the pumps as before (one pass: the seam is not the
  // song) and is turned off after the last.
  const STEP = 0.1, stops = [];
  for (let t = STEP; t < secs; t += STEP) stops.push(real.suspend(t).then(() => { now = t; p._pump(); return real.resume(); }));
  now = 0; p._pump();
  const rendering = real.startRendering();
  await Promise.all(stops);
  p.loop = false;
  const buf = await rendering;
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  let peak = 0, nan = 0;
  const rms = [];
  for (let s = 0; s < Math.floor(secs); s++) {
    let acc = 0;
    for (let i = s * RATE; i < (s + 1) * RATE; i++) { const a = L[i], b = R[i]; if (!Number.isFinite(a) || !Number.isFinite(b)) { nan++; continue; } acc += a * a + b * b; peak = Math.max(peak, Math.abs(a), Math.abs(b)); }
    rms.push(Math.sqrt(acc / (2 * RATE)));
  }
  // mono at 12 kHz for the onset measure (tools/introAudioCheck.mjs's method), from the song's own tick 0
  const step = RATE / 12000, mono = [];
  for (let i = Math.round(origin * RATE); i < L.length; i += step) { const j = Math.floor(i); mono.push((L[j] + R[j]) / 2); }
  // INTRO3b: how alike the two channels are - the correlation of L and R over the sounding part (from 1 s), 1 is mono
  let sl = 0, sr = 0, sll = 0, srr = 0, slr = 0, cn = 0;
  for (let i = RATE; i < L.length; i++) { const a = L[i], b = R[i]; sl += a; sr += b; sll += a * a; srr += b * b; slr += a * b; cn++; }
  const ml = sl / cn, mr = sr / cn, corr = (slr / cn - ml * mr) / Math.sqrt(Math.max(1e-18, (sll / cn - ml * ml) * (srr / cn - mr * mr)));
  const k = peak > 0 ? 0.89 / peak : 1, from = Math.round(origin * RATE);
  const pcm = new Int16Array((L.length - from) * 2);
  for (let i = from; i < L.length; i++) { const o = 2 * (i - from); pcm[o] = Math.max(-32767, Math.min(32767, Math.round(L[i] * k * 32767))); pcm[o + 1] = Math.max(-32767, Math.min(32767, Math.round(R[i] * k * 32767))); }
  const bytes = new Uint8Array(pcm.buffer);
  let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { secs, origin, peak, nan, rms, corr, ceiling: INTRO_PRESS.ceiling, gain: INTRO_THEME_GAIN, mono: Array.from(mono), pcm: btoa(bin), rate: RATE };
};
window.ready = true;
</script></body></html>`;

function wav(pcmB64, rate) {
  const data = Buffer.from(pcmB64, 'base64');
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

function onsets(pcm, rate = 12000, size = 1024, hop = 128) {
  const count = 1 + Math.floor((pcm.length - size) / hop), flux = new Float64Array(count);
  let previous = null;
  for (let i = 0; i < count; i++) {
    const real = new Float64Array(size), imag = new Float64Array(size);
    for (let n = 0; n < size; n++) real[n] = pcm[i * hop + n] * (0.5 - 0.5 * Math.cos(2 * Math.PI * n / (size - 1)));
    for (let a = 1, j = 0; a < size; a++) { let bit = size >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (a < j) { [real[a], real[j]] = [real[j], real[a]]; [imag[a], imag[j]] = [imag[j], imag[a]]; } }
    for (let n = 2; n <= size; n <<= 1) {
      const angle = -2 * Math.PI / n;
      for (let a = 0; a < size; a += n) for (let j = 0; j < n / 2; j++) {
        const x = a + j, y = x + n / 2, c = Math.cos(angle * j), s = Math.sin(angle * j);
        const r = real[y] * c - imag[y] * s, v = real[y] * s + imag[y] * c;
        real[y] = real[x] - r; imag[y] = imag[x] - v; real[x] += r; imag[x] += v;
      }
    }
    const m = new Float64Array(size / 2 + 1); for (let b = 0; b <= size / 2; b++) m[b] = Math.hypot(real[b], imag[b]);
    if (previous) for (let b = 0; b < m.length; b++) flux[i] += Math.max(0, m[b] - previous[b]);
    previous = m;
  }
  const radius = Math.floor(0.5 * rate / hop);
  const norm = flux.map((f, i) => { let sum = 0; for (let j = Math.max(0, i - radius); j <= Math.min(count - 1, i + radius); j++) sum += flux[j]; return f / Math.max(1e-9, sum / (radius * 2 + 1)); });
  const peakBetween = (from, to) => { let best = -1; for (let i = 0; i < count; i++) { const t = (i * hop + size / 2) / rate; if (t >= from && t <= to && (best < 0 || norm[i] > norm[best])) best = i; } return { time: (best * hop + size / 2) / rate, strength: norm[best] }; };
  return { peakBetween };
}

function fft(real, imag) {
  const size = real.length;
  for (let a = 1, j = 0; a < size; a++) { let bit = size >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (a < j) { [real[a], real[j]] = [real[j], real[a]]; [imag[a], imag[j]] = [imag[j], imag[a]]; } }
  for (let n = 2; n <= size; n <<= 1) {
    const angle = -2 * Math.PI / n;
    for (let a = 0; a < size; a += n) for (let j = 0; j < n / 2; j++) {
      const x = a + j, y = x + n / 2, c = Math.cos(angle * j), s = Math.sin(angle * j);
      const r = real[y] * c - imag[y] * s, v = real[y] * s + imag[y] * c;
      real[y] = real[x] - r; imag[y] = imag[x] - v; real[x] += r; imag[x] += v;
    }
  }
}

function spectrum(pcm, rate = 12000, from = 1, size = 4096, hop = 2048) {
  const power = new Float64Array(size / 2 + 1);
  let frames = 0;
  for (let start = Math.round(from * rate); start + size <= pcm.length; start += hop) {
    const real = new Float64Array(size), imag = new Float64Array(size);
    for (let n = 0; n < size; n++) real[n] = pcm[start + n] * (0.5 - 0.5 * Math.cos(2 * Math.PI * n / (size - 1)));
    fft(real, imag);
    for (let b = 0; b <= size / 2; b++) power[b] += real[b] * real[b] + imag[b] * imag[b];
    frames++;
  }
  let total = 0, weighted = 0, high = 0;
  for (let b = 1; b <= size / 2; b++) {
    const hz = (b * rate) / size;
    if (hz < 20) continue;
    total += power[b]; weighted += power[b] * hz;
    if (hz >= 2000) high += power[b];
  }
  return { frames, centroid: total > 0 ? weighted / total : 0, presenceDb: total > 0 ? 10 * Math.log10(Math.max(1e-18, high / total)) : -Infinity };
}

function chordShape(pcm, rate = 12000, size = 4096, hop = 1024) {
  const song = introThemeSong();
  const first = song.events.find((e) => e.type === 'noteOn' && e.channel === INTRO_CHANNELS.strings && e.tick * INTRO_SECONDS_PER_TICK >= 2);
  const chord = song.events.filter((e) => e.type === 'noteOn' && e.channel === INTRO_CHANNELS.strings && e.tick === first.tick);
  const top = Math.max(...chord.map((e) => e.note)), hz = 440 * Math.pow(2, (top - 69) / 12);
  const from = first.tick * INTRO_SECONDS_PER_TICK + 0.1, to = (first.tick + first.duration) * INTRO_SECONDS_PER_TICK - 0.1;
  const half = size / 2, power = new Float64Array(half + 1);
  let frames = 0;
  for (let start = Math.round(from * rate); start + size <= Math.min(pcm.length, Math.round(to * rate)); start += hop) {
    const real = new Float64Array(size), imag = new Float64Array(size);
    for (let n = 0; n < size; n++) real[n] = pcm[start + n] * (0.5 - 0.5 * Math.cos(2 * Math.PI * n / (size - 1)));
    fft(real, imag);
    for (let b = 0; b <= half; b++) power[b] += real[b] * real[b] + imag[b] * imag[b];
    frames++;
  }
  const db = (b) => 10 * Math.log10(power[b] / Math.max(1, frames) + 1e-18);
  const levels = [], widths = [];
  for (let n = 1; n <= 9; n++) {
    const lo = Math.round((hz * n * 0.97) * size / rate), hi = Math.min(half, Math.round((hz * n * 1.03) * size / rate));
    let peak = lo;
    for (let b = lo; b <= hi; b++) if (power[b] > power[peak]) peak = b;
    const top6 = db(peak) - 6;
    let a = peak, z = peak;
    while (a > 1 && db(a) > top6) a--;
    while (z < half - 1 && db(z) > top6) z++;
    levels.push(db(peak)); widths.push(1200 * Math.log2(z / a));
  }
  const loudest = Math.max(...levels);
  return { note: top, from, to, frames, levels: levels.map((l) => l - loudest), widths, isolated: Math.max(...levels.slice(3)) - loudest, meanWidth: widths.slice(2, 6).reduce((x, y) => x + y, 0) / 4 };
}

function riserShape(pcm, impactAt, rate = 12000, size = 2048, hop = 512) {
  const beat = 60 / introThemeSong().beatsPerMinute, from = impactAt - 4 * beat + 0.05, to = impactAt - 0.05;
  const half = size / 2, power = new Float64Array(half + 1);
  let frames = 0;
  for (let start = Math.round(from * rate); start + size <= Math.min(pcm.length, Math.round(to * rate)); start += hop) {
    const real = new Float64Array(size), imag = new Float64Array(size);
    for (let n = 0; n < size; n++) real[n] = pcm[start + n] * (0.5 - 0.5 * Math.cos(2 * Math.PI * n / (size - 1)));
    fft(real, imag);
    for (let b = 0; b <= half; b++) power[b] += real[b] * real[b] + imag[b] * imag[b];
    frames++;
  }
  const radius = Math.round(300 * size / rate);
  let worst = -Infinity, hz = 0;
  for (let b = Math.round(2500 * size / rate); b < half - 1; b++) {
    if (power[b] < power[b - 1] || power[b] < power[b + 1]) continue;
    let sum = 0, n = 0;
    for (let k = Math.max(1, b - radius); k <= Math.min(half, b + radius); k++) { sum += power[k]; n++; }
    const prom = 10 * Math.log10((power[b] + 1e-18) / (sum / n + 1e-18));
    if (prom > worst) { worst = prom; hz = b * rate / size; }
  }
  return { from, to, frames, worst, hz };
}

function bassShape(pcm, from, to, rate = 12000, size = 4096, hop = 1024, lo = 40, hi = 120) {
  const half = size / 2, levels = [];
  let bass = 0, total = 0;
  for (let start = Math.round(from * rate); start + size <= Math.min(pcm.length, Math.round(to * rate)); start += hop) {
    const real = new Float64Array(size), imag = new Float64Array(size);
    for (let n = 0; n < size; n++) real[n] = pcm[start + n] * (0.5 - 0.5 * Math.cos(2 * Math.PI * n / (size - 1)));
    fft(real, imag);
    let b = 0, t = 0;
    for (let k = 1; k <= half; k++) { const hz = k * rate / size, p = real[k] * real[k] + imag[k] * imag[k]; if (hz >= 20) t += p; if (hz >= lo && hz <= hi) b += p; }
    bass += b; total += t; levels.push(10 * Math.log10(b + 1e-18));
  }
  const sorted = [...levels].sort((a, c) => a - c), median = sorted[Math.floor(sorted.length / 2)];
  const p = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { frames: levels.length, shareDb: 10 * Math.log10((bass + 1e-18) / (total + 1e-18)), spreadDb: p(0.9) - p(0.1), still: levels.filter((l) => Math.abs(l - median) < 1.5).length / levels.length };
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/probe/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE); return; }
  const f = join(ROOT, url);
  if (!f.startsWith(ROOT) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': extname(f) === '.js' ? 'text/javascript' : extname(f) === '.json' ? 'application/json' : 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/probe/`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
  const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
  const r = await page.evaluate((s) => window.render(s), SECONDS);
  if (wavAt) writeFileSync(wavAt, wav(r.pcm, r.rate));
  const body = r.rms.slice(24, 160), meanDb = body.length ? db(body.reduce((a, b) => a + b, 0) / body.length) : -Infinity;
  console.log(`     ${r.secs.toFixed(1)} s, peak ${db(r.peak).toFixed(1)} dBFS, loudness ${meanDb.toFixed(1)} dBFS (24-160 s) at MusicVolume 0.5 and the intro's ${r.gain}`);
  check('it plays - every second of it sounding, no NaN', r.nan === 0 && r.rms.slice(1, Math.floor(r.secs) - 1).every((x) => x > 1e-4), r.rms.map((x) => db(x).toFixed(0)).join(' '));
  // The highest MusicVolume is twice this render's 0.5, which adds 6 dB.
  check(`never clipping, under its ceiling of ${r.ceiling} dBFS even at the highest MusicVolume`, db(r.peak) + 6.02 <= r.ceiling + 0.05, `${(db(r.peak) + 6.02).toFixed(2)} dBFS at full volume`);
  if (r.rms.length >= 160) check(`as loud as the recording it replaced (${RECORDING_DB} dBFS, within 2 dB)`, Math.abs(meanDb - RECORDING_DB) <= 2, `${meanDb.toFixed(1)} dBFS`);
  else console.log(`     (the loudness against the recording needs 160 s rendered; this render is ${r.secs.toFixed(0)} s)`);
  check('the opening swells from quiet', r.rms[1] < r.rms[7] * 0.5, r.rms.slice(0, 9).map((x) => db(x).toFixed(0)).join(' '));
  const { peakBetween } = onsets(Float32Array.from(r.mono));
  for (const [name, at] of [['cloud break', CLOUD_REVEAL_TIME], ['impact', TITLE_IMPACT_TIME]]) {
    const near = peakBetween(at - 0.25, at + 0.25), wide = peakBetween(at - 2, at + 1);
    check(`the ${name} is heard on its cue (${at.toFixed(3)} s): the strongest onset from 2 s before it, within 25 ms`, Math.abs(near.time - at) <= 0.025 && Math.abs(wide.time - near.time) < 1e-9, `onset at ${near.time.toFixed(3)} s, ${((near.time - at) * 1000).toFixed(1)} ms, strength ${near.strength.toFixed(2)}`);
  }
  const sp = spectrum(Float32Array.from(r.mono)), shape = chordShape(Float32Array.from(r.mono));
  check('wide: the two channels are not one (L/R correlation under 0.8)', r.corr < 0.8, `correlation ${r.corr.toFixed(3)}`);
  check('present: the spectrum’s centre of weight over 400 Hz and its share from 2 kHz up over -18 dB', sp.centroid > 400 && sp.presenceDb > -18, `centroid ${sp.centroid.toFixed(0)} Hz, 2 kHz up ${sp.presenceDb.toFixed(1)} dB over ${sp.frames} frames`);
  check('no whine: over the opening’s first held chord no harmonic of its top note above the third stands within 8 dB of the loudest, and its partials are bands, not lines (the 3rd to the 6th 12 cents wide or more, the mean)', shape.isolated <= -8 && shape.meanWidth >= 12, `note ${shape.note} over ${shape.from.toFixed(2)}-${shape.to.toFixed(2)} s: harmonics ${shape.levels.map((l) => l.toFixed(0)).join(' ')} dB, widths ${shape.widths.map((w) => w.toFixed(0)).join(' ')} cents - isolated ${shape.isolated.toFixed(1)} dB, mean width ${shape.meanWidth.toFixed(1)} cents`);
  const riser = riserShape(Float32Array.from(r.mono), TITLE_IMPACT_TIME);
  check('no whine in the build-up: over the four beats before the impact no narrow peak from 2.5 kHz up stands more than 13 dB over its surroundings', riser.worst < 13, `the worst ${riser.hz.toFixed(0)} Hz at +${riser.worst.toFixed(1)} dB over ${riser.from.toFixed(2)}-${riser.to.toFixed(2)} s (${riser.frames} frames)`);
  const bassOpen = bassShape(Float32Array.from(r.mono), 0.5, CLOUD_REVEAL_TIME), bassBody = bassShape(Float32Array.from(r.mono), CLOUD_REVEAL_TIME, Math.min(27, r.secs));
  check('no hum: the bass sits where the recording’s does and moves as it does - its share of the whole over the body within 2.5 dB of the recording’s -5.9 dB and under -6 dB over the opening, and within 1.5 dB of its median in under 40% of the body’s frames', Math.abs(bassBody.shareDb + 5.9) <= 2.5 && bassOpen.shareDb <= -6 && bassBody.still < 0.4, `opening ${bassOpen.shareDb.toFixed(1)} dB (still ${(100 * bassOpen.still).toFixed(0)}%), body ${bassBody.shareDb.toFixed(1)} dB, spread ${bassBody.spreadDb.toFixed(1)} dB, still ${(100 * bassBody.still).toFixed(0)}% of ${bassBody.frames} frames`);
  check('no page error', errs.length === 0, errs.join('; '));
} finally {
  await browser.close();
  server.close();
}
const failed = out.filter((o) => !o).length;
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
