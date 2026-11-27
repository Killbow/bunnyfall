// Synthesizes the shore and wild sounds and bakes them into public/sfx/{shore,wild}-*.wav.
// Usage: node tools/soundscapeSfx.mjs [--measure] [--raw=<dir>]
// Every noise comes from a seeded PRNG, so a rerun writes the same bytes.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bake, writeWav8, DF_RATE } from './sndify.mjs';
import { RATE, rng, seconds, buf, decay, attack, biquad, sweepLowpass, noise, mix, softClip, envelope, unit, knock, grit, modes, burst, groan, splash } from './sfxSynth.mjs';
import { isMain } from './lib/isMain.mjs';

const OUT = 'public/sfx';

function crash(seed, { len = 3.2, curl = 0.85, run = 1.1 } = {}) {
  return () => {
    const rand = rng(seed);
    const out = buf(len);
    const nc = seconds(curl + 0.1);
    const rise = noise(nc, rand);
    envelope(rise, (i) => Math.pow(Math.min(1, i / seconds(curl)), 1.8) * Math.min(1, (nc - i) / seconds(0.1)));
    mix(out, unit(sweepLowpass(rise, 350, 2600, curl * 0.5)), 0, 0.55);
    const nb = seconds(len - curl);
    const hit = noise(nb, rand);
    envelope(hit, (i) => attack(i, 15) * decay(i, run));
    mix(out, unit(sweepLowpass(hit, 5200, 900, run)), curl, 1);
    const boom = biquad(noise(seconds(0.6), rand), { type: 'lowpass', f0: 180, q: 0.8 });
    envelope(boom, (i) => attack(i, 12) * decay(i, 0.14));
    mix(out, unit(boom), curl, 0.6);
    grit(out, rand, { count: 40, from: curl + 0.2, to: len - 0.2, lo: 2400, hi: 4600, gain: 0.08 });
    return softClip(out, 1.15);
  };
}

function hoot(rand, f, dur, { slide = 0.06, trem = 0, tremHz = 0 } = {}) {
  const n = seconds(dur + 0.05);
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / seconds(dur);
    const fi = f * (1 + slide * (0.5 - Math.min(1, u)));
    ph += (2 * Math.PI * fi) / RATE;
    const env = Math.min(1, i / seconds(0.035)) * Math.max(0, Math.min(1, (seconds(dur) - i) / seconds(0.09)));
    const tr = trem ? 1 - trem * (0.5 + 0.5 * Math.sin((2 * Math.PI * tremHz * i) / RATE)) : 1;
    out[i] = (Math.sin(ph) + 0.08 * Math.sin(2 * ph)) * env * tr;
  }
  const breath = biquad(noise(n, rand), { type: 'bandpass', f0: f, q: 6 });
  for (let i = 0; i < n; i++) out[i] += breath[i] * 0.6 * Math.min(1, i / seconds(0.035)) * Math.max(0, Math.min(1, (seconds(dur) - i) / seconds(0.09)));
  return unit(out);
}

function owl(seed, kind) {
  return () => {
    const rand = rng(seed);
    if (kind === 1) {
      const out = buf(2.4);
      mix(out, hoot(rand, 470, 0.55, { slide: 0.05 }), 0.02, 1);
      mix(out, hoot(rand, 440, 0.08, { slide: 0 }), 1.05, 0.55);
      mix(out, hoot(rand, 450, 0.08, { slide: 0 }), 1.2, 0.6);
      mix(out, hoot(rand, 465, 0.95, { slide: 0.03, trem: 0.45, tremHz: 11 }), 1.36, 0.95);
      return softClip(out, 1.1);
    }
    const out = buf(2.1);
    mix(out, hoot(rand, 315, 0.32, { slide: 0.04 }), 0.02, 1);
    mix(out, hoot(rand, 300, 0.32, { slide: 0.04 }), 0.45, 0.85);
    mix(out, hoot(rand, 290, 0.75, { slide: 0.08 }), 1.1, 0.95);
    return softClip(out, 1.1);
  };
}

function howl(seed, { lo = 360, hi = 640, end = 420, dur = 2.6, len = 3.8 } = {}) {
  return () => {
    const rand = rng(seed);
    const n = seconds(dur), N = seconds(len);
    const voice = new Float32Array(N);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const glide = u < 0.22 ? lo + (hi - lo) * Math.sin((Math.PI / 2) * (u / 0.22)) : u < 0.7 ? hi : hi + (end - hi) * Math.pow((u - 0.7) / 0.3, 1.4);
      const f = glide + 9 * Math.sin((2 * Math.PI * 5.2 * i) / RATE) * Math.min(1, u / 0.3);
      ph += (2 * Math.PI * f) / RATE;
      const env = Math.min(1, u / 0.08) * Math.min(1, (1 - u) / 0.18);
      voice[i] = (Math.sin(ph) + 0.28 * Math.sin(2 * ph) + 0.1 * Math.sin(3 * ph)) * env;
    }
    const breath = biquad(noise(N, rand), { type: 'bandpass', f0: 900, q: 1.4 });
    for (let i = 0; i < n; i++) voice[i] += breath[i] * 0.25 * Math.min(1, i / (n * 0.08)) * Math.min(1, (n - i) / (n * 0.18));
    const far = biquad(biquad(unit(voice), { type: 'lowpass', f0: 2200, q: 0.7 }), { type: 'lowpass', f0: 2200, q: 0.7 });
    const out = new Float32Array(N);
    mix(out, far, 0, 1);
    mix(out, biquad(far, { type: 'lowpass', f0: 1100, q: 0.7 }), 0.21, 0.32);
    mix(out, biquad(far, { type: 'lowpass', f0: 800, q: 0.7 }), 0.47, 0.16);
    return softClip(unit(out), 1.05);
  };
}

export const CLIPS = [
  ['shore-crash-1', crash(0xc4a5001), 0.88],
  ['shore-crash-2', crash(0xc4a5002, { len: 3.6, curl: 1.05, run: 1.3 }), 0.88],
  ['wild-owl-1', owl(0x0b1001, 1), 0.8],
  ['wild-owl-2', owl(0x0b1002, 2), 0.8],
  ['wild-howl-1', howl(0xb0b1001), 0.82],
  ['wild-howl-2', howl(0xb0b1002, { lo: 330, hi: 590, end: 380, dur: 2.9, len: 4.1 }), 0.82],
];

function bakeRaw(mono) {
  let max = 0;
  for (const v of mono) max = Math.max(max, Math.abs(v));
  const g = max > 0 ? 0.92 / max : 1;
  const out = new Uint8Array(mono.length);
  for (let i = 0; i < mono.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(Math.max(-1, Math.min(1, mono[i] * g)) * 127 + 128)));
  return out;
}

if (isMain(import.meta.url)) {
  const rawDir = process.argv.find((a) => a.startsWith('--raw='))?.split('=')[1] ?? null;
  const measuring = process.argv.includes('--measure');
  const { measure, measureLine } = measuring ? await import('./sfxBake.mjs') : {};
  mkdirSync(OUT, { recursive: true });
  if (rawDir) mkdirSync(rawDir, { recursive: true });
  for (const [name, make, peak] of CLIPS) {
    const mono = make();
    const pcm = bake(mono, RATE, { peak });
    writeFileSync(join(OUT, `${name}.wav`), writeWav8(pcm));
    if (rawDir) writeFileSync(join(rawDir, `${name}-44k.wav`), writeWav8(bakeRaw(mono), RATE));
    if (measuring) console.log(measureLine(`${name}.wav`, measure(pcm)));
    else console.log(`${name}.wav  ${DF_RATE}Hz 8-bit mono  ${pcm.length} samples  ${(pcm.length / DF_RATE).toFixed(3)}s  ${(44 + pcm.length)} bytes`);
  }
}
