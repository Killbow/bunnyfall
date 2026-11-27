// Synthesizes the horse sound clips and bakes them to DAGGER.SND's 11025 Hz unsigned 8-bit mono at set loudness.
// Run: node tools/horseSfx.mjs [--measure]; it writes public/sfx/horse-*.wav.
// Every noise is a seeded PRNG so a rerun writes the same bytes; public/sfx/SOURCES.md records provenance.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bake, writeWav8, DF_RATE } from './sndify.mjs';
import { RATE, rng, seconds, buf, decay, attack, biquad, noise, mix, softClip, envelope, unit, knock, rough, grit, leaves, groan, splash } from './sfxSynth.mjs';
import { isMain } from './lib/isMain.mjs';

const OUT = 'public/sfx';

function nasal(rand, len, { body = 300, hiss = 1600, top = 2600, hissGain = 0.55, topGain = 0.2, flutter = 32, depth = 0.45, inMs = 12, hold = 0.12, tau = 0.08 } = {}) {
  const n = seconds(len);
  const out = new Float32Array(n);
  const src = noise(n, rand);
  for (const [f0, q, g] of [[body, 1.2, 1], [hiss, 1, hissGain], [top, 1.5, topGain]]) {
    const y = unit(biquad(src, { type: 'bandpass', f0, q }));
    for (let i = 0; i < n; i++) out[i] += y[i] * g;
  }
  const wob = rough(n, rand, flutter * 0.25);
  let ph = rand() * Math.PI * 2;
  const holdN = seconds(hold);
  for (let i = 0; i < n; i++) {
    ph += (2 * Math.PI * flutter * (0.9 + 0.2 * wob[i])) / RATE;
    const s = Math.sin(ph);
    out[i] *= (1 - depth + depth * s * s) * attack(i, inMs) * (i < holdN ? 1 : decay(i - holdN, tau));
  }
  return unit(out);
}

function softFall(rand) {
  const out = buf(0.2);
  mix(out, unit(knock(0.16, 150 + 20 * rand(), 62, 0.008, 0.03, 0.8)), 0, 1);
  const earth = biquad(noise(seconds(0.12), rand), { type: 'lowpass', f0: 650 + 150 * rand(), q: 0.7 });
  envelope(earth, (i) => attack(i, 0.6) * decay(i, 0.018));
  mix(out, unit(earth), 0, 0.7);
  leaves(out, rand, { count: 14, from: 0.002, to: 0.07, lo: 1900, hi: 3800, gain: 0.16, env: (u) => 1 - u });
  grit(out, rand, { count: 3, from: 0.03, to: 0.16, lo: 700, hi: 1600, tauLo: 0.002, tauHi: 0.005, gain: 0.14, q: 1.2 });
  return out;
}

function snowFall(rand) {
  const out = buf(0.22);
  mix(out, unit(knock(0.14, 115 + 15 * rand(), 55, 0.01, 0.028, 1.2)), 0, 0.75);
  grit(out, rand, { count: 34, from: 0.0, to: 0.09, lo: 1200, hi: 3500, tauLo: 0.0006, tauHi: 0.0022, gain: 0.55, q: 1.6 });
  const pack = biquad(noise(seconds(0.12), rand), { type: 'bandpass', f0: 1800, q: 0.8 });
  envelope(pack, (i) => attack(i, 3) * decay(i, 0.035));
  mix(out, unit(pack), 0.004, 0.3);
  return out;
}

function waterFall(rand) {
  const out = buf(0.42);
  mix(out, splash(rand, { len: 0.4, from: 3400, to: 450, tau: 0.045, body: 0.6, drops: 5, dropsTo: 0.34 }), 0, 1);
  mix(out, unit(knock(0.18, 95, 48, 0.012, 0.045, 1.5)), 0, 0.5);
  return out;
}

export const HOOF_CADENCE = Object.freeze({
  slow: Object.freeze({ len: 1.508, falls: Object.freeze([[0.37, 0.22], [0.65, 0.45], [1.09, 1], [1.39, 0.68]]) }),
  fast: Object.freeze({
    len: 2.606,
    falls: Object.freeze([[0.03, 0.85], [0.09, 0.2], [0.3, 0.83], [0.56, 0.9], [0.82, 0.88], [1.07, 0.76], [1.12, 0.21], [1.32, 0.89], [1.37, 0.25], [1.59, 0.8], [1.87, 1], [2.13, 0.63], [2.38, 0.82]]),
  }),
});

function hooves(seed, fall, gait) {
  return () => {
    const rand = rng(seed);
    const { len, falls } = HOOF_CADENCE[gait];
    const out = buf(len);
    for (const [at, accent] of falls) {
      const hoof = fall(rand);
      const room = seconds(len) - seconds(at);
      mix(out, hoof.length > room ? hoof.subarray(0, room) : hoof, at, accent * (0.9 + 0.1 * rand()));
    }
    // The loop restarts from its first sample, so the last 8 ms fade out to avoid a click.
    const fade = seconds(0.008);
    for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
    return softClip(out, 1.2);
  };
}

function snort(seed, { body = 300, hiss = 1600, flutter = 32, len = 0.45 } = {}) {
  return () => {
    const rand = rng(seed);
    const out = buf(len + 0.05);
    mix(out, nasal(rand, len, { body, hiss, flutter, depth: 0.5, inMs: 10, hold: len * 0.3, tau: len * 0.18 }), 0, 1);
    mix(out, nasal(rand, 0.09, { body: body * 0.8, hiss: hiss * 0.8, flutter: 0, depth: 0, inMs: 4, hold: 0.01, tau: 0.02, hissGain: 0.3 }), 0, 0.4);
    return softClip(out, 1.5);
  };
}

function blow(seed, { len = 1.1, from = 27, to = 21, body = 240 } = {}) {
  return () => {
    const rand = rng(seed);
    const out = buf(len + 0.05);
    mix(out, groan(rand, len, {
      rate: (u) => from + (to - from) * u,
      jitter: 0.12,
      bands: [[body, 3, 1], [body * 2.2, 2.5, 0.7], [1250, 2, 0.35], [2300, 2.5, 0.12]],
      env: (u) => Math.min(1, u / 0.06) * Math.pow(1 - u, 0.8),
      noiseGain: 0.55,
    }), 0, 1);
    mix(out, nasal(rand, len, { body: body * 1.3, hiss: 1400, flutter: 0, depth: 0, inMs: 40, hold: len * 0.2, tau: len * 0.35, hissGain: 0.4 }), 0, 0.35);
    return softClip(out, 1.3);
  };
}

function breath(seed, { band = 520, hiss = 1500, len = 0.24 } = {}) {
  return () => {
    const rand = rng(seed);
    const out = buf(len + 0.04);
    mix(out, nasal(rand, len, { body: band, hiss, flutter: 18, depth: 0.25, inMs: 8, hold: len * 0.2, tau: len * 0.25, hissGain: 0.6, topGain: 0.1 }), 0, 1);
    mix(out, unit(knock(0.14, 125, 88, 0.03, 0.04, 6)), 0.004, 0.3);
    return softClip(out, 1.3);
  };
}

function spook() {
  const rand = rng(0x5900c1);
  const out = buf(0.62);
  mix(out, nasal(rand, 0.16, { body: 420, hiss: 2100, top: 3000, flutter: 40, depth: 0.55, inMs: 4, hold: 0.04, tau: 0.035, hissGain: 0.7, topGain: 0.3 }), 0, 0.8);
  mix(out, nasal(rand, 0.42, { body: 380, hiss: 2000, top: 2900, flutter: 42, depth: 0.6, inMs: 6, hold: 0.12, tau: 0.08, hissGain: 0.75, topGain: 0.3 }), 0.14, 1);
  return softClip(out, 1.7);
}

export const CLIPS = [
  ['horse-snort-1', snort(0x5a0e01), -12],
  ['horse-snort-2', snort(0x5a0e02, { body: 270, hiss: 1450, flutter: 29, len: 0.5 }), -12],
  ['horse-snort-3', snort(0x5a0e03, { body: 340, hiss: 1750, flutter: 35, len: 0.38 }), -13],
  ['horse-blow-1', blow(0xb10e01), -15],
  ['horse-blow-2', blow(0xb10e02, { len: 0.9, from: 30, to: 23, body: 270 }), -15],
  ['horse-breath-1', breath(0xb2ea01), -19],
  ['horse-breath-2', breath(0xb2ea02, { band: 470, hiss: 1350, len: 0.27 }), -19],
  ['horse-breath-3', breath(0xb2ea03, { band: 580, hiss: 1650, len: 0.21 }), -20],
  ['horse-spook', spook, -10],
  ['horse-soft-slow', hooves(0x50f701, softFall, 'slow'), -21],
  ['horse-soft-fast', hooves(0x50f702, softFall, 'fast'), -14],
  ['horse-snow-slow', hooves(0x5e0701, snowFall, 'slow'), -21],
  ['horse-snow-fast', hooves(0x5e0702, snowFall, 'fast'), -14],
  ['horse-water-slow', hooves(0xa7e701, waterFall, 'slow'), -18],
  ['horse-water-fast', hooves(0xa7e702, waterFall, 'fast'), -11],
];

export function loudest50(pcm) {
  const w = Math.round(DF_RATE * 0.05), hop = Math.round(w / 5);
  let best = 0;
  for (let i = 0; i + w <= pcm.length; i += hop) {
    let a = 0;
    for (let j = 0; j < w; j++) { const v = (pcm[i + j] - 128) / 128; a += v * v; }
    best = Math.max(best, Math.sqrt(a / w));
  }
  return best > 0 ? 20 * Math.log10(best) : -Infinity;
}

// The trim stays off: a hoof loop's silence before its first fall is part of its cadence.
export function bakeTo(mono, target) {
  let peak = 0.89;
  let pcm = bake(mono, RATE, { peak, trim: false });
  for (let k = 0; k < 4; k++) {
    const l = loudest50(pcm);
    if (!Number.isFinite(l) || Math.abs(l - target) < 0.15) break;
    peak = Math.min(0.97, peak * 10 ** ((target - l) / 20));
    pcm = bake(mono, RATE, { peak, trim: false });
  }
  return pcm;
}

if (isMain(import.meta.url)) {
  const report = process.argv.includes('--measure');
  mkdirSync(OUT, { recursive: true });
  for (const [name, make, target] of CLIPS) {
    const pcm = bakeTo(make(), target);
    writeFileSync(join(OUT, `${name}.wav`), writeWav8(pcm));
    console.log(`${name}.wav  ${DF_RATE}Hz 8-bit mono  ${(pcm.length / DF_RATE).toFixed(3)}s  ${44 + pcm.length} bytes${report ? `  loudest 50 ms ${loudest50(pcm).toFixed(1)} dBFS (target ${target})` : ''}`);
  }
}
