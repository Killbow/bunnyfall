// Bakes a WAV into the classic sound format: 11025 Hz unsigned 8-bit mono. Convert mp3 or ogg to WAV first.
// Usage: node tools/sndify.mjs in.wav out.wav [--gain=1] [--peak=0.89] [--max=0] [--no-trim]

import { readFileSync, writeFileSync } from 'node:fs';
import { isMain } from './lib/isMain.mjs';

export const DF_RATE = 11025;

export function readWav(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a RIFF/WAVE file');
  let fmt = null, dataAt = -1, dataLen = 0;
  for (let p = 12; p + 8 <= bytes.length;) {
    const id = tag(p), size = dv.getUint32(p + 4, true);
    if (id === 'fmt ') {
      fmt = {
        format: dv.getUint16(p + 8, true),
        channels: dv.getUint16(p + 10, true),
        rate: dv.getUint32(p + 12, true),
        bits: dv.getUint16(p + 22, true),
      };
    } else if (id === 'data') { dataAt = p + 8; dataLen = size; }
    p += 8 + size + (size & 1);
  }
  if (!fmt || dataAt < 0) throw new Error('WAVE is missing fmt or data');
  const { channels, bits, format } = fmt;
  const bytesPer = bits >> 3;
  const frames = Math.floor(dataLen / (bytesPer * channels));
  const out = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < channels; c++) {
      const o = dataAt + (f * channels + c) * bytesPer;
      let v;
      if (format === 3 && bits === 32) v = dv.getFloat32(o, true);
      else if (bits === 8) v = (bytes[o] - 128) / 128;
      else if (bits === 16) v = dv.getInt16(o, true) / 32768;
      else if (bits === 24) v = ((bytes[o] | (bytes[o + 1] << 8) | (dv.getInt8(o + 2) << 16))) / 8388608;
      else if (bits === 32) v = dv.getInt32(o, true) / 2147483648;
      else throw new Error(`unsupported sample width ${bits}`);
      out[c][f] = v;
    }
  }
  return { rate: fmt.rate, channels, data: out };
}

export function writeWav8(samples, rate = DF_RATE) {
  const n = samples.length;
  const buf = new Uint8Array(44 + n);
  const dv = new DataView(buf.buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + n, true); str(8, 'WAVE');
  str(12, 'fmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true);
  dv.setUint32(28, rate, true);
  dv.setUint16(32, 1, true);
  dv.setUint16(34, 8, true);
  str(36, 'data'); dv.setUint32(40, n, true);
  buf.set(samples, 44);
  return buf;
}

export const toMono = (channels) => {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const c of channels) s += c[i];
    out[i] = s / channels.length;
  }
  return out;
};

export function lowpass(x, cutoff, rate) {
  const a = Math.exp(-2 * Math.PI * cutoff / rate);
  const out = new Float32Array(x.length);
  let y = 0;
  for (let i = 0; i < x.length; i++) { y = (1 - a) * x[i] + a * y; out[i] = y; }
  y = 0;
  for (let i = x.length - 1; i >= 0; i--) { y = (1 - a) * out[i] + a * y; out[i] = y; }
  return out;
}

export function resample(x, from, to) {
  if (from === to) return x;
  const n = Math.max(1, Math.round(x.length * to / from));
  const out = new Float32Array(n);
  const step = (x.length - 1) / Math.max(1, n - 1);
  for (let i = 0; i < n; i++) {
    const p = i * step, j = Math.floor(p), t = p - j;
    out[i] = x[j] + (x[Math.min(j + 1, x.length - 1)] - x[j]) * t;
  }
  return out;
}

// There is no dither on purpose: the quantization noise matches the texture of the classic effects.
export function quantise8(x, peak = 0.89) {
  let max = 0;
  for (const v of x) max = Math.max(max, Math.abs(v));
  const g = max > 0 ? peak / max : 1;
  const out = new Uint8Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const v = Math.max(-1, Math.min(1, x[i] * g));
    out[i] = Math.max(0, Math.min(255, Math.round(v * 127 + 128)));
  }
  return out;
}

export function trimSilence(x, rate, { threshold = 0.004, head = 0.002, tail = 0.01 } = {}) {
  let a = 0, b = x.length - 1;
  while (a < x.length && Math.abs(x[a]) < threshold) a++;
  while (b > a && Math.abs(x[b]) < threshold) b--;
  if (a >= b) return x;
  a = Math.max(0, a - Math.round(head * rate));
  b = Math.min(x.length - 1, b + Math.round(tail * rate));
  return x.subarray(a, b + 1);
}

export function bake(mono, rate, { gain = 1, peak = 0.89, trim = true, maxSeconds = 0, edges = null } = {}) {
  let x = trim ? trimSilence(mono, rate) : mono;
  if (maxSeconds > 0 && x.length > maxSeconds * rate) {
    const n = Math.round(maxSeconds * rate);
    const cut = new Float32Array(x.subarray(0, n));
    const fade = Math.min(n, Math.round(0.03 * rate));
    for (let i = 0; i < fade; i++) cut[n - fade + i] *= 1 - i / fade;
    x = cut;
  }
  if (edges) {
    const out = x === mono ? new Float32Array(x) : x;
    const a = Math.min(out.length, Math.round(edges[0] * rate)), b = Math.min(out.length, Math.round(edges[1] * rate));
    for (let i = 0; i < a; i++) out[i] *= i / a;
    for (let i = 0; i < b; i++) out[out.length - 1 - i] *= i / b;
    x = out;
  }
  const gained = gain === 1 ? x : x.map((v) => v * gain);
  const filtered = lowpass(gained, DF_RATE * 0.45, rate);
  return quantise8(resample(filtered, rate, DF_RATE), peak);
}

export function bakeFile(inPath, outPath, opts = {}) {
  const wav = readWav(readFileSync(inPath));
  const pcm = bake(toMono(wav.data), wav.rate, opts);
  writeFileSync(outPath, writeWav8(pcm));
  return { frames: pcm.length, seconds: pcm.length / DF_RATE, from: wav.rate, channels: wav.channels };
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const files = args.filter((a) => !a.startsWith('--'));
  const opt = (k, d) => {
    const hit = args.find((a) => a.startsWith(`--${k}=`));
    return hit ? Number(hit.split('=')[1]) : d;
  };
  if (files.length !== 2) {
    console.error('usage: node tools/sndify.mjs in.wav out.wav [--gain=1] [--peak=0.89]');
    process.exit(2);
  }
  const r = bakeFile(files[0], files[1], {
    gain: opt('gain', 1), peak: opt('peak', 0.89),
    maxSeconds: opt('max', 0), trim: !args.includes('--no-trim'),
  });
  console.log(`${files[0]} (${r.from}Hz x${r.channels}) -> ${files[1]}  ${DF_RATE}Hz 8-bit mono, ${r.frames} samples, ${r.seconds.toFixed(3)}s`);
}
