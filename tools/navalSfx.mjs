// Synthesizes the naval combat sounds and bakes them to public/sfx/naval-*.wav at 11025 Hz unsigned 8-bit mono.
// Usage: node tools/navalSfx.mjs [--raw=dir]  (--raw also writes the 44.1 kHz source)
// Every noise comes from a seeded PRNG, so a rerun writes the same bytes.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bake, writeWav8, DF_RATE } from './sndify.mjs';
import { RATE, rng, seconds, buf, decay, attack, biquad, sweepLowpass, noise, mix, softClip, envelope, bandSweep } from './sfxSynth.mjs';

const OUT = 'public/sfx';

function thump(len, from, to, tau, decayTau, attackMs = 1) {
  const out = buf(len);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const f = to + (from - to) * decay(i, tau);
    phase += 2 * Math.PI * f / RATE;
    out[i] = Math.sin(phase) * attack(i, attackMs) * decay(i, decayTau);
  }
  return out;
}
function ticks(out, rand, { count, from, to, lo, hi, tauLo, tauHi, gain }) {
  for (let k = 0; k < count; k++) {
    const at = from + (to - from) * Math.pow(rand(), 1.6);
    const f0 = lo + (hi - lo) * rand();
    const tau = tauLo + (tauHi - tauLo) * rand();
    const t = biquad(noise(seconds(tau * 8), rand), { type: 'bandpass', f0, q: 1.8 });
    envelope(t, (i) => attack(i, 0.2) * decay(i, tau));
    mix(out, t, at, gain * (0.45 + 0.55 * rand()) * (1 - 0.6 * (at - from) / Math.max(1e-6, to - from)));
  }
  return out;
}
function clank(rand, { partials = [1870, 2950, 4100], taus = [0.09, 0.06, 0.035], wood = 200, len = 0.32 } = {}) {
  const out = buf(len);
  const edge = biquad(noise(seconds(0.05), rand), { type: 'bandpass', f0: 2600, q: 2.5 });
  envelope(edge, (i) => attack(i, 0.2) * decay(i, 0.005));
  mix(out, edge, 0, 1);
  partials.forEach((f, k) => {
    const ring = buf(len);
    const ph = rand() * Math.PI * 2;
    for (let i = 0; i < ring.length; i++) ring[i] = Math.sin(ph + 2 * Math.PI * f * i / RATE) * attack(i, 0.3) * decay(i, taus[k]);
    mix(out, ring, 0, 0.42 / (k + 1));
  });
  const knock = buf(len);
  for (let i = 0; i < knock.length; i++) knock[i] = Math.sin(2 * Math.PI * wood * i / RATE) * attack(i, 0.6) * decay(i, 0.028);
  mix(out, knock, 0, 0.6);
  return out;
}

function cannon() {
  const rand = rng(0xca77074);
  const out = buf(1.8);
  const crack = biquad(noise(seconds(0.06), rand), { type: 'bandpass', f0: 1800, q: 0.6 });
  envelope(crack, (i) => attack(i, 0.5) * decay(i, 0.012));
  mix(out, crack, 0, 1.0);
  const body = sweepLowpass(noise(seconds(0.7), rand), 2400, 180, 0.09);
  envelope(body, (i) => attack(i, 1.5) * decay(i, 0.14));
  mix(out, body, 0.002, 1.6);
  mix(out, thump(0.9, 75, 34, 0.08, 0.22), 0, 1.1);
  const roll = biquad(noise(seconds(1.5), rand), { type: 'lowpass', f0: 420, q: 0.7 });
  envelope(roll, (i) => attack(i, 20) * decay(i, 0.45));
  mix(out, roll, 0.03, 0.55);
  mix(out, roll, 0.21, 0.25);
  mix(out, roll, 0.52, 0.12);
  return softClip(out, 2.2);
}

function cannonFar() {
  const rand = rng(0xfa7ca77);
  const out = buf(2.2);
  mix(out, thump(1.1, 58, 32, 0.12, 0.3, 25), 0, 1.0);
  mix(out, thump(1.1, 52, 30, 0.12, 0.28, 25), 0.14, 0.7);
  const rumble = biquad(noise(seconds(2.0), rand), { type: 'lowpass', f0: 260, q: 0.7 });
  envelope(rumble, (i) => attack(i, 40) * decay(i, 0.6));
  mix(out, rumble, 0.01, 0.9);
  mix(out, rumble, 0.35, 0.35);
  return softClip(biquad(out, { type: 'lowpass', f0: 500, q: 0.7 }), 1.6);
}

function swivel() {
  const rand = rng(0x5717e1);
  const out = buf(0.75);
  const crack = biquad(noise(seconds(0.04), rand), { type: 'bandpass', f0: 2800, q: 0.8 });
  envelope(crack, (i) => attack(i, 0.3) * decay(i, 0.007));
  mix(out, crack, 0, 1.0);
  const body = sweepLowpass(noise(seconds(0.3), rand), 3200, 500, 0.04);
  envelope(body, (i) => attack(i, 1) * decay(i, 0.06));
  mix(out, body, 0.001, 1.3);
  mix(out, thump(0.3, 140, 70, 0.03, 0.05), 0, 0.7);
  const tail = biquad(noise(seconds(0.6), rand), { type: 'lowpass', f0: 700, q: 0.7 });
  envelope(tail, (i) => attack(i, 8) * decay(i, 0.18));
  mix(out, tail, 0.01, 0.3);
  mix(out, tail, 0.16, 0.12);
  return softClip(out, 1.9);
}

function hit() {
  const rand = rng(0x0a4b17);
  const out = buf(0.95);
  mix(out, thump(0.4, 95, 55, 0.03, 0.07), 0, 1.0);
  const crunch = biquad(noise(seconds(0.12), rand), { type: 'lowpass', f0: 600, q: 0.8 });
  envelope(crunch, (i) => attack(i, 0.5) * decay(i, 0.04));
  mix(out, crunch, 0, 0.9);
  ticks(out, rand, { count: 16, from: 0.004, to: 0.34, lo: 1400, hi: 3400, tauLo: 0.003, tauHi: 0.009, gain: 0.75 });
  const groan = buf(0.6);
  let ph = 0;
  for (let i = 0; i < groan.length; i++) {
    const f = 150 + 18 * Math.sin(2 * Math.PI * 3.1 * i / RATE);
    ph += 2 * Math.PI * f / RATE;
    const tone = Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.25 * Math.sin(3 * ph);
    groan[i] = tone * attack(i, 30) * decay(i, 0.16);
  }
  mix(out, biquad(groan, { type: 'bandpass', f0: 420, q: 0.9 }), 0.11, 0.35);
  return softClip(out, 1.8);
}

function blast() {
  const rand = rng(0xb1a57);
  const out = buf(2.4);
  mix(out, thump(1.4, 60, 28, 0.1, 0.35), 0, 1.3);
  const body = sweepLowpass(noise(seconds(1.6), rand), 1800, 120, 0.18);
  envelope(body, (i) => attack(i, 2) * decay(i, 0.3));
  mix(out, body, 0.003, 1.8);
  ticks(out, rand, { count: 34, from: 0.1, to: 1.4, lo: 800, hi: 2600, tauLo: 0.004, tauHi: 0.012, gain: 0.35 });
  const roll = biquad(noise(seconds(2.2), rand), { type: 'lowpass', f0: 300, q: 0.7 });
  envelope(roll, (i) => attack(i, 30) * decay(i, 0.7));
  mix(out, roll, 0.02, 0.7);
  return softClip(out, 2.6);
}

function grapple() {
  const rand = rng(0x96a991e);
  const out = buf(1.3);
  const whoosh = sweepLowpass(noise(seconds(0.34), rand), 300, 1800, 0.12);
  envelope(whoosh, (i) => attack(i, 120) * decay(i, 0.06));
  mix(out, biquad(whoosh, { type: 'bandpass', f0: 900, q: 0.7 }), 0, 1.4);
  mix(out, clank(rand), 0.28, 1.0);
  mix(out, clank(rand, { partials: [2140, 3310, 4600], taus: [0.07, 0.05, 0.03], wood: 230 }), 0.37, 0.7);
  for (const [at, g] of [[0.5, 0.45], [0.72, 0.38], [0.95, 0.3]]) {
    const creak = buf(0.16);
    let next = 0;
    for (let i = 0; i < creak.length; i++) {
      if (i >= next) { creak[i] = 1; next = i + seconds((1 / 90) * (0.85 + 0.3 * rand())); }
    }
    envelope(creak, (i) => attack(i, 25) * decay(i, 0.07));
    mix(out, biquad(creak, { type: 'bandpass', f0: 700, q: 1.4 }), at, g * 8);
  }
  return softClip(out, 1.7);
}

function runout() {
  const rand = rng(0x7a0c0de);
  const out = buf(1.45);
  for (let g = 0; g < 4; g++) {
    const at = 0.02 + g * 0.11 + rand() * 0.04;
    const len = 0.78 + rand() * 0.12;
    const roll = biquad(noise(seconds(len), rand), { type: 'lowpass', f0: 230 + rand() * 60, q: 0.9 });
    const seam = 11 + rand() * 4;
    const ph = rand() * Math.PI * 2;
    envelope(roll, (i) => {
      const t = i / RATE;
      const beat = 0.55 + 0.45 * Math.max(0, Math.sin(ph + 2 * Math.PI * seam * t * (1 + 0.35 * t)));
      return attack(i, 90) * Math.min(1, (len - t) / 0.06) * beat;
    });
    mix(out, roll, at, 0.85 - g * 0.08);
    const knockAt = at + len - 0.02;
    mix(out, thump(0.3, 120, 68, 0.03, 0.05, 1), knockAt, 0.9 - g * 0.1);
    const clack = biquad(noise(seconds(0.05), rand), { type: 'bandpass', f0: 520 + rand() * 120, q: 1.6 });
    envelope(clack, (i) => attack(i, 0.3) * decay(i, 0.012));
    mix(out, clack, knockAt, 0.5);
  }
  for (const [at, g] of [[0.12, 0.3], [0.38, 0.26], [0.61, 0.22]]) {
    const creak = buf(0.2);
    let next = 0;
    for (let i = 0; i < creak.length; i++) {
      if (i >= next) { creak[i] = 1; next = i + seconds((1 / 70) * (0.8 + 0.4 * rand())); }
    }
    envelope(creak, (i) => attack(i, 30) * decay(i, 0.08));
    mix(out, biquad(creak, { type: 'bandpass', f0: 620, q: 1.5 }), at, g * 8);
  }
  return softClip(out, 1.8);
}

function ready() {
  const rand = rng(0x4ead1ed);
  const out = buf(0.55);
  for (const [at, g] of [[0, 0.9], [0.11, 0.75]]) {
    mix(out, thump(0.12, 420, 260, 0.01, 0.02, 0.3), at, g);
    const rap = biquad(noise(seconds(0.04), rand), { type: 'bandpass', f0: 900 + rand() * 200, q: 1.8 });
    envelope(rap, (i) => attack(i, 0.2) * decay(i, 0.008));
    mix(out, rap, at, g * 0.8);
  }
  mix(out, clank(rand, { partials: [2350, 3500, 4800], taus: [0.07, 0.045, 0.03], wood: 300, len: 0.3 }), 0.24, 0.55);
  return softClip(out, 1.6);
}

function sinking() {
  const rand = rng(0x51c4ed0);
  const LEN = 4, JOIN = 0.3;
  const out = buf(LEN + JOIN);
  const rush = biquad(noise(out.length, rand), { type: 'lowpass', f0: 380, q: 0.7 });
  envelope(rush, (i) => 0.55 + 0.45 * Math.sin((2 * Math.PI * i) / seconds(LEN)));
  mix(out, rush, 0, 0.55);
  for (const [at, f0, len] of [[0.25, 96, 1.6], [2.2, 82, 1.45]]) {
    const g = buf(len);
    let ph = 0;
    for (let i = 0; i < g.length; i++) {
      const t = i / RATE;
      ph += (f0 * (1 - 0.18 * (t / len)) * (1 + 0.025 * Math.sin(2 * Math.PI * 5 * t))) / RATE;
      g[i] = 2 * (ph % 1) - 1;
    }
    envelope(g, (i) => attack(i, 200) * Math.min(1, (len - i / RATE) / 0.35));
    mix(out, biquad(g, { type: 'bandpass', f0: 330, q: 2.2 }), at, 0.75);
  }
  for (let k = 0; k < 18; k++) {
    const at = rand() * (LEN - 0.1), f0 = 180 + rand() * 380, len = 0.03 + rand() * 0.05;
    const b = buf(len);
    let ph = 0;
    for (let i = 0; i < b.length; i++) { ph += (2 * Math.PI * f0 * (1 + (1.8 * i) / b.length)) / RATE; b[i] = Math.sin(ph) * decay(i, len / 3); }
    mix(out, b, at, 0.22 + rand() * 0.2);
  }
  const n = seconds(LEN), j = seconds(JOIN);
  for (let i = 0; i < j; i++) out[i] = out[i] * (i / j) + out[n + i] * (1 - i / j);
  return softClip(out.slice(0, n), 1.5);
}

function whistle() {
  const rand = rng(0x5ba11b7);
  const LEN = 1, PASS = 0.55;
  const f = (t) => 1060 + 440 * Math.tanh(-(t - PASS) / 0.07);
  const swell = (i) => { const t = i / RATE; return attack(i, 30) / (1 + ((t - PASS) / (t < PASS ? 0.16 : 0.09)) ** 2); };
  const rush = envelope(bandSweep(noise(seconds(LEN), rand), f, 4.5), swell);
  const out = buf(LEN);
  mix(out, rush, 0, 1);
  mix(out, envelope(biquad(noise(seconds(LEN), rand), { type: 'lowpass', f0: 900, q: 0.7 }), swell), 0, 0.35);
  const tone = buf(LEN);
  let ph = 0;
  for (let i = 0; i < tone.length; i++) { ph += (2 * Math.PI * f(i / RATE) * 0.9) / RATE; tone[i] = Math.sin(ph) * swell(i); }
  mix(out, tone, 0, 0.12);
  return softClip(out, 1.3);
}

export const CLIPS = [
  ['naval-cannon', cannon, 0.95],
  ['naval-cannon-far', cannonFar, 0.82],
  ['naval-swivel', swivel, 0.88],
  ['naval-hit', hit, 0.9],
  ['naval-blast', blast, 0.95],
  ['naval-grapple', grapple, 0.85],
  ['naval-runout', runout, 0.82],
  ['naval-ready', ready, 0.8],
  ['naval-sinking', sinking, 0.8],
  ['naval-whistle', whistle, 0.8],
];

const rawDir = process.argv.find((a) => a.startsWith('--raw='))?.split('=')[1] ?? null;
mkdirSync(OUT, { recursive: true });
if (rawDir) mkdirSync(rawDir, { recursive: true });

for (const [name, make, peak] of CLIPS) {
  const mono = make();
  const pcm = bake(mono, RATE, { peak });
  writeFileSync(join(OUT, `${name}.wav`), writeWav8(pcm));
  if (rawDir) writeFileSync(join(rawDir, `${name}-44k.wav`), writeWav8(bakeRaw(mono), RATE));
  console.log(`${name}.wav  ${DF_RATE}Hz 8-bit mono  ${pcm.length} samples  ${(pcm.length / DF_RATE).toFixed(3)}s  ${(44 + pcm.length)} bytes`);
}

function bakeRaw(mono) {
  let max = 0;
  for (const v of mono) max = Math.max(max, Math.abs(v));
  const g = max > 0 ? 0.92 / max : 1;
  const out = new Uint8Array(mono.length);
  for (let i = 0; i < mono.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(Math.max(-1, Math.min(1, mono[i] * g)) * 127 + 128)));
  return out;
}
