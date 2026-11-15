// @ts-check
// Builds spell sounds at runtime from the player's own DAGGER.SND and the MP3 clips Bunnyfall ships, so no Daggerfall
// audio is stored in the repository. The filters port ffmpeg's and the 8-bit bake ports tools/sndify.mjs: keep their
// arithmetic and rounding as they are, or the approved sounds change. remixSounds builds once per `spec` object.
import { defaultFetchClip } from './immersiveFootsteps.js';

export const WORK_RATE = 44100;
export const BAKED_RATE = 11025;
const SR = WORK_RATE;

function besselI0(x) {
  let s = 1, t = 1;
  const q = (x * x) / 4;
  for (let k = 1; k < 50; k++) { t *= q / (k * k); s += t; if (t < s * 1e-17) break; }
  return s;
}
const PHASES = 1024, KERNELS = new Map();
function kernel(factor, taps) {
  const key = `${factor}:${taps}`;
  let tab = KERNELS.get(key);
  if (tab) return tab;
  tab = new Float64Array((PHASES + 1) * taps);
  const center = (taps - 1) >> 1;
  for (let ph = 0; ph <= PHASES; ph++) {
    let norm = 0;
    for (let i = 0; i < taps; i++) {
      const d = i - center - ph / PHASES, x = Math.PI * d * factor, w = (2 * d) / taps;
      const y = (x === 0 ? 1 : Math.sin(x) / x) * besselI0(9 * Math.sqrt(Math.max(1 - w * w, 0)));
      tab[ph * taps + i] = y;
      norm += y;
    }
    for (let i = 0; i < taps; i++) tab[ph * taps + i] /= norm;
  }
  KERNELS.set(key, tab);
  return tab;
}
function resample(x, inRate, outRate) {
  if (inRate === outRate) return Float32Array.from(x);
  const factor = Math.min((outRate * 0.97) / inRate, 1), taps = Math.max(1, Math.ceil(32 / factor)), center = (taps - 1) >> 1;
  const tab = kernel(factor, taps), L = x.length, n = Math.ceil((L * outRate) / inRate), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const pos = (i * inRate) / outRate, base = Math.floor(pos), fp = (pos - base) * PHASES, ph = Math.floor(fp), w = fp - ph;
    const r0 = ph * taps, r1 = r0 + taps, j0 = base - center;
    let acc = 0;
    for (let k = 0; k < taps; k++) { const j = j0 + k; if (j >= 0 && j < L) acc += x[j] * (tab[r0 + k] * (1 - w) + tab[r1 + k] * w); }
    out[i] = acc;
  }
  return out;
}
function biquad(x, type, f) {
  const w0 = (2 * Math.PI * f) / SR, c = Math.cos(w0), alpha = Math.sin(w0) / (2 * 0.707);
  const a0 = 1 + alpha, a1 = (-2 * c) / a0, a2 = (1 - alpha) / a0, lp = type === 'lowpass';
  const b0 = (lp ? (1 - c) / 2 : (1 + c) / 2) / a0, b1 = (lp ? 1 - c : -(1 + c)) / a0, b2 = b0;
  let i1 = 0, i2 = 0, o1 = 0, o2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i], o = b0 * v + b1 * i1 + b2 * i2 - a1 * o1 - a2 * o2;
    i2 = i1; i1 = v; o2 = o1; o1 = o; x[i] = o;
  }
}
function afade(x, { t = 'in', st = 0, d = 0, curve = 'tri' }) {
  const s0 = Math.round(st * SR), nb = Math.max(1, Math.round(d * SR));
  for (let i = 0; i < x.length; i++) {
    if (t === 'out' && i < s0) continue;
    const g = Math.min(1, Math.max(0, (t === 'in' ? i - s0 : s0 + nb - i) / nb));
    x[i] *= curve === 'qsin' ? Math.sin((g * Math.PI) / 2) : g;
  }
}
function acompressor(x, { threshold, ratio, attack, release, makeup }) {
  const knee = 2.82843, thres = Math.log(threshold);
  const linKneeStart = threshold / Math.sqrt(knee), adjKneeStart = linKneeStart * linKneeStart;
  const kneeStart = Math.log(linKneeStart), kneeStop = Math.log(threshold * Math.sqrt(knee));
  const compressedKneeStop = (kneeStop - thres) / ratio + thres;
  const ac = Math.min(1, 1 / ((attack * SR) / 4000)), rc = Math.min(1, 1 / ((release * SR) / 4000));
  const hermite = (v, x0, x1, p0, p1, m0, m1) => {
    const width = x1 - x0, t = (v - x0) / width, t2 = t * t, t3 = t2 * t;
    m0 *= width; m1 *= width;
    return (2 * p0 + m0 - 2 * p1 + m1) * t3 + (-3 * p0 - 2 * m0 + 3 * p1 - m1) * t2 + m0 * t + p0;
  };
  let slopeLin = 0;
  for (let i = 0; i < x.length; i++) {
    const s = x[i] * x[i];
    slopeLin += (s - slopeLin) * (s > slopeLin ? ac : rc);
    let gain = 1;
    if (slopeLin > 0 && slopeLin > adjKneeStart) {
      const slope = 0.5 * Math.log(slopeLin);
      const g = slope < kneeStop ? hermite(slope, kneeStart, kneeStop, kneeStart, compressedKneeStop, 1, 1 / ratio) : (slope - thres) / ratio + thres;
      gain = Math.exp(g - slope);
    }
    x[i] *= gain * makeup;
  }
}
const opts = (s) => Object.fromEntries(s.split(':').map((kv) => kv.split('=')).map(([k, v]) => [k, Number.isNaN(Number(v)) ? v : Number(v)]));
function runChain(x, chain) {
  let y = x;
  for (const f of chain.split(',')) {
    const [name, args = ''] = f.split(/=(.*)/s);
    if (name === 'atrim') { const [a, b] = args.split(':').map(Number); y = y.slice(Math.round(a * SR), Math.round(b * SR)); }
    else if (name === 'asetrate') y = resample(y, Number(args), SR);
    else if (name === 'lowpass' || name === 'highpass') biquad(y, name, opts(args).f);
    else if (name === 'afade') afade(y, /** @type {any} */ (opts(args)));
    else if (name === 'acompressor') acompressor(y, /** @type {any} */ (opts(args)));
    else throw new Error(`soundRemix: unsupported filter ${name}`);
  }
  return y;
}
function bake8(x, peak) {
  const a = Math.exp((-2 * Math.PI * BAKED_RATE * 0.45) / SR);
  const f = new Float32Array(x.length);
  let y = 0;
  for (let i = 0; i < x.length; i++) { y = (1 - a) * x[i] + a * y; f[i] = y; }
  y = 0;
  for (let i = x.length - 1; i >= 0; i--) { y = (1 - a) * f[i] + a * y; f[i] = y; }
  const n = Math.max(1, Math.round((x.length * BAKED_RATE) / SR)), r = new Float32Array(n), step = (x.length - 1) / Math.max(1, n - 1);
  for (let i = 0; i < n; i++) { const p = i * step, j = Math.floor(p), t = p - j; r[i] = f[j] + (f[Math.min(j + 1, f.length - 1)] - f[j]) * t; }
  let max = 0;
  for (const v of r) max = Math.max(max, Math.abs(v));
  const g = max > 0 ? peak / max : 1, out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.max(0, Math.min(255, Math.round(Math.max(-1, Math.min(1, r[i] * g)) * 127 + 128)));
  return out;
}

function recordGain(samples) {
  let m = 0;
  for (const v of samples) m = Math.max(m, Math.abs(v));
  return Math.fround(10 ** ((-1 - Math.round(20 * Math.log10(Math.max(m, 1e-9)) * 10) / 10) / 20));
}
async function render(r, src, pause) {
  const n = Math.round(r.len * SR), mix = new Float64Array(n);
  for (let k = 0; k < r.layers.length; k++) {
    const [name, delayMs, gain, chain] = r.layers[k], y = runChain(src[name], chain), at = Math.floor((delayMs * SR) / 1000);
    for (let i = 0; i < y.length && at + i < n; i++) mix[at + i] += y[i] * gain;
    if (pause && k % 8 === 7) await pause();
  }
  if (r.synth) for (let i = 0; i < n; i++) mix[i] += r.synth(i / SR);
  const out = runChain(Float32Array.from(mix), r.post);
  for (let i = 0; i < n; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(out[i] * 32768))) / 32768;
  return bake8(out, r.peak);
}
async function decodeClipBytes(bytes) {
  const buf = await new globalThis.OfflineAudioContext(1, 1, SR).decodeAudioData(bytes.slice().buffer);
  const out = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < out.length; i++) out[i] += d[i] / buf.numberOfChannels; }
  return out;
}
async function build(spec, samplesOf, fetchClip, decodeClip, pause) {
  const src = {};
  for (const [name, index] of Object.entries(spec.records)) {
    const raw = samplesOf(index);
    if (!raw?.length) return null;
    const g = recordGain(raw);
    src[name] = resample(raw, BAKED_RATE, SR).map((v) => v * g);
  }
  const names = Object.keys(spec.clips);
  const clips = await Promise.all(names.map(async (name) => {
    const bytes = await fetchClip(spec.clips[name][0]);
    return bytes?.length ? decodeClip(bytes) : null;
  }));
  for (const [i, name] of names.entries()) {
    if (!clips[i]?.length) return null;
    const g = Math.fround(10 ** (spec.clips[name][1] / 20));
    src[name] = Float32Array.from(clips[i], (v) => v * g);
  }
  const out = /** @type {Record<string, Float32Array>} */ ({});
  for (const [kind, r] of Object.entries(spec.recipes)) out[kind] = Float32Array.from(await render(r, src, pause), (b) => (b - 128) / 128);
  return out;
}

const SESSIONS = new Map();
export function remixSounds(spec, { samplesOf, fetchClip = defaultFetchClip, decodeClip = decodeClipBytes, pause = () => new Promise((r) => setTimeout(r, 0)) }) {
  if (!SESSIONS.has(spec)) SESSIONS.set(spec, build(spec, samplesOf, fetchClip, decodeClip, pause).catch(() => null).then((s) => { if (!s) SESSIONS.delete(spec); return s; }));
  return SESSIONS.get(spec);
}
