// Shared DSP for the synthesized sound tools, which bake to 11025 Hz 8-bit mono through tools/sndify.mjs.
// A change here changes the baked clips of every tool that imports it.

export const RATE = 44100;

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const seconds = (s) => Math.round(s * RATE);
export const buf = (s) => new Float32Array(seconds(s));

export const decay = (i, tau) => Math.exp(-i / (tau * RATE));
export const attack = (i, ms) => Math.min(1, i / Math.max(1, seconds(ms / 1000)));

export function biquad(x, { type, f0, q }) {
  const w = 2 * Math.PI * f0 / RATE, cw = Math.cos(w), sw = Math.sin(w);
  const alpha = sw / (2 * q);
  let b0, b1, b2;
  const a0 = 1 + alpha, a1 = -2 * cw, a2 = 1 - alpha;
  if (type === 'bandpass') { b0 = alpha; b1 = 0; b2 = -alpha; }
  else { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; }
  const out = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = (b0 / a0) * x[i] + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

export function sweepLowpass(x, fromHz, toHz, tau) {
  const out = new Float32Array(x.length);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    const f = toHz + (fromHz - toHz) * decay(i, tau);
    const a = Math.exp(-2 * Math.PI * f / RATE);
    y = (1 - a) * x[i] + a * y;
    out[i] = y;
  }
  return out;
}

export const noise = (len, rand) => {
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = rand() * 2 - 1;
  return out;
};

export function mix(dst, src, at = 0, gain = 1) {
  const o = seconds(at);
  for (let i = 0; i < src.length; i++) {
    const j = o + i;
    if (j >= 0 && j < dst.length) dst[j] += src[i] * gain;
  }
  return dst;
}

export const softClip = (x, drive = 1) => x.map((v) => Math.tanh(v * drive) / Math.tanh(drive));

export const envelope = (x, fn) => { for (let i = 0; i < x.length; i++) x[i] *= fn(i); return x; };

export function unit(x) {
  let max = 0;
  for (const v of x) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < x.length; i++) x[i] /= max;
  return x;
}

export function knock(len, from, to, tau, decayTau, attackMs = 0.6) {
  const out = buf(len);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const f = to + (from - to) * decay(i, tau);
    phase += (2 * Math.PI * f) / RATE;
    out[i] = Math.sin(phase) * attack(i, attackMs) * decay(i, decayTau);
  }
  return out;
}

export function rough(len, rand, hz) {
  const out = new Float32Array(len);
  const step = Math.max(1, Math.round(RATE / hz));
  let a = rand(), b = rand();
  for (let i = 0; i < len; i++) {
    const k = i % step;
    if (k === 0 && i > 0) { a = b; b = rand(); }
    const s = (1 - Math.cos((Math.PI * k) / step)) / 2;
    out[i] = a + (b - a) * s;
  }
  return out;
}

export function bandSweep(x, f0, q) {
  const out = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let b0 = 0, b2 = 0, a1 = 0, a2 = 0;
  for (let i = 0; i < x.length; i++) {
    if (i % 32 === 0) {
      const w = (2 * Math.PI * Math.min(f0(i / RATE), RATE * 0.45)) / RATE, cw = Math.cos(w), sw = Math.sin(w);
      const alpha = sw / (2 * q), a0 = 1 + alpha;
      b0 = alpha / a0; b2 = -alpha / a0; a1 = (-2 * cw) / a0; a2 = (1 - alpha) / a0;
    }
    const y = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

export function rub(rand, len, { f0 = 1800, q = 1.5, hz = 120, inMs = 10, tau = 0.04, depth = 0.85 } = {}) {
  const n = seconds(len);
  const x = biquad(noise(n, rand), { type: 'bandpass', f0, q });
  const r = rough(n, rand, hz);
  for (let i = 0; i < n; i++) x[i] *= (1 - depth + depth * r[i]) * attack(i, inMs) * decay(i, tau);
  return unit(x);
}

export function grit(out, rand, { count, from, to, lo = 2200, hi = 4400, tauLo = 0.0015, tauHi = 0.004, gain = 0.3, q = 1.8 }) {
  for (let k = 0; k < count; k++) {
    const at = from + (to - from) * Math.pow(rand(), 1.5);
    const f0 = lo + (hi - lo) * rand();
    const tau = tauLo + (tauHi - tauLo) * rand();
    const t = biquad(noise(seconds(tau * 8), rand), { type: 'bandpass', f0, q });
    envelope(t, (i) => attack(i, 0.15) * decay(i, tau));
    mix(out, unit(t), at, gain * (0.4 + 0.6 * rand()) * (1 - 0.55 * (at - from) / Math.max(1e-6, to - from)));
  }
  return out;
}

export const TOP_HZ = 4800;

export function modes(len, list, { attackMs = 0.4 } = {}) {
  const out = buf(len);
  const fade = seconds(0.012);
  for (const [f, tau, g] of list) {
    if (f > TOP_HZ) continue;
    const w = (2 * Math.PI * f) / RATE;
    for (let i = 0; i < out.length; i++) out[i] += g * Math.sin(w * i) * attack(i, attackMs) * decay(i, tau) * Math.min(1, (out.length - i) / fade);
  }
  return out;
}

export function burst(rand, { f0, q = 1, tau, attackMs = 0.2 }) {
  const x = biquad(noise(seconds(tau * 9 + 0.004), rand), { type: 'bandpass', f0, q });
  envelope(x, (i) => attack(i, attackMs) * decay(i, tau));
  return unit(x);
}

export function bubble(len, from, to, rise, tau, attackMs = 0.5) {
  const out = buf(len);
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const f = to - (to - from) * Math.exp(-i / (rise * RATE));
    ph += (2 * Math.PI * f) / RATE;
    out[i] = Math.sin(ph) * attack(i, attackMs) * decay(i, tau);
  }
  return out;
}

export function leaves(out, rand, { count, from, to, lo = 1800, hi = 4200, tauLo = 0.0005, tauHi = 0.002, gain = 0.4, q = 1.4, env = () => 1 }) {
  for (let k = 0; k < count; k++) {
    const u = rand();
    const f0 = lo + (hi - lo) * rand();
    const tau = tauLo + (tauHi - tauLo) * rand();
    const g = biquad(noise(seconds(tau * 8), rand), { type: 'bandpass', f0, q });
    envelope(g, (i) => attack(i, 0.1) * decay(i, tau));
    const crackle = rand() < 0.15 ? 1.7 : 1;
    mix(out, unit(g), from + (to - from) * u, gain * crackle * (0.25 + 0.75 * rand()) * env(u));
  }
  return out;
}

export function groan(rand, len, { rate, jitter = 0.25, bands, env, noiseGain = 0.12 }) {
  const n = seconds(len);
  const pulses = new Float32Array(n);
  for (let t = 0.002; t < len;) {
    const i = Math.round(t * RATE);
    if (i < n) pulses[i] += (0.6 + 0.4 * rand()) * env(t / len);
    t += (1 / Math.max(4, rate(t / len))) * (1 + jitter * (2 * rand() - 1));
  }
  const out = new Float32Array(n);
  for (const [f0, q, g] of bands) {
    const y = biquad(pulses, { type: 'bandpass', f0, q });
    for (let i = 0; i < n; i++) out[i] += y[i] * g;
  }
  unit(out);
  const breath = unit(biquad(noise(n, rand), { type: 'bandpass', f0: 900, q: 0.9 }));
  for (let i = 0; i < n; i++) out[i] += breath[i] * noiseGain * env(i / n);
  return unit(out);
}

export function splash(rand, { len = 0.35, from = 4200, to = 500, tau = 0.05, body = 0.5, drops = 6, dropsTo = 0.3 } = {}) {
  const out = buf(len);
  const n = seconds(len);
  const x = noise(n, rand);
  envelope(x, (i) => attack(i, 1.2) * decay(i, tau));
  mix(out, unit(sweepLowpass(x, from, to, tau * 1.4)), 0, 1);
  const b = biquad(noise(n, rand), { type: 'lowpass', f0: 380, q: 0.8 });
  envelope(b, (i) => attack(i, 2) * decay(i, tau * 0.8));
  mix(out, unit(b), 0, body);
  for (let k = 0; k < drops; k++) {
    const at = 0.03 + (dropsTo - 0.03) * Math.pow(rand(), 0.8);
    const f = 900 + 1400 * rand();
    mix(out, bubble(0.05, f, f * 1.5, 0.01, 0.008), at, 0.18 * (0.4 + 0.6 * rand()));
  }
  return unit(out);
}

export function bellNote(f, tau, len = tau * 5) {
  return unit(modes(len, [[f, tau, 1], [f * 1.0035, tau * 0.9, 0.3], [f * 2, tau * 0.45, 0.24], [f * 2.76, tau * 0.25, 0.1]], { attackMs: 1.5 }));
}
