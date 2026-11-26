// Decodes audio files in headless Chromium (no ffmpeg needed), writes an 11025 Hz 8-bit mono WAV beside each,
// and prints its attack, crest, tail, and brightness. Usage: node tools/sfxBake.mjs [dir]

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';
import { bake, writeWav8, DF_RATE } from './sndify.mjs';
import { isMain } from './lib/isMain.mjs';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';

export const AUDIO_EXT = ['.mp3', '.ogg', '.wav', '.flac', '.m4a'];

export function findAudio(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) findAudio(p, out);
    else if (AUDIO_EXT.includes(extname(p).toLowerCase())) out.push(p);
  }
  return out;
}

export async function decodeAudio(page, path) {
  const b64 = readFileSync(path).toString('base64');
  const { rate, mono } = await page.evaluate(async (data) => {
    const bin = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const decoded = await ctx.decodeAudioData(bin.buffer);
    const n = decoded.length;
    const out = new Float32Array(n);
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      const ch = decoded.getChannelData(c);
      for (let i = 0; i < n; i++) out[i] += ch[i] / decoded.numberOfChannels;
    }
    return { rate: decoded.sampleRate, mono: Array.from(out) };
  }, b64);
  return { rate, mono: Float32Array.from(mono) };
}

export async function withDecoder(fn) {
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  try {
    const page = await browser.newPage();
    await page.goto('about:blank');
    return await fn(page);
  } finally { await browser.close(); }
}

function attackMs(x, rate) {
  let peak = 0, at = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > peak) { peak = Math.abs(x[i]); at = i; }
  const want = peak * 0.9;
  for (let i = 0; i <= at; i++) if (Math.abs(x[i]) >= want) return (i / rate) * 1000;
  return (at / rate) * 1000;
}

function tailMs(x, rate) {
  let peak = 0, at = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > peak) { peak = Math.abs(x[i]); at = i; }
  const floor = peak * 0.01;
  const win = Math.max(1, Math.round(rate * 0.01));
  let acc = 0;
  for (let i = at; i < x.length; i++) {
    acc += Math.abs(x[i]);
    if (i - at >= win) {
      acc -= Math.abs(x[i - win]);
      if (acc / win < floor) return ((i - at) / rate) * 1000;
    }
  }
  return ((x.length - at) / rate) * 1000;
}

const crestDb = (x) => {
  let peak = 0, sum = 0;
  for (const v of x) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
  const rms = Math.sqrt(sum / x.length);
  return rms > 0 ? 20 * Math.log10(peak / rms) : 0;
};

function centroid(x, rate) {
  let num = 0, den = 0;
  for (let f = 120; f < rate / 2; f *= 1.18) {
    let re = 0, im = 0;
    const step = Math.max(1, Math.floor(x.length / 4096));
    for (let i = 0; i < x.length; i += step) {
      const w = 2 * Math.PI * f * i / rate;
      re += x[i] * Math.cos(w); im += x[i] * Math.sin(w);
    }
    const mag = Math.hypot(re, im);
    num += mag * f; den += mag;
  }
  return den > 0 ? num / den : 0;
}

export function measure(pcm) {
  const baked = Float32Array.from(pcm, (v) => (v - 128) / 128);
  return {
    seconds: baked.length / DF_RATE,
    attack: attackMs(baked, DF_RATE),
    crest: crestDb(baked),
    tail: tailMs(baked, DF_RATE),
    bright: centroid(baked, DF_RATE),
  };
}

export const measureLine = (name, m) => [
  name.padEnd(52),
  m.seconds.toFixed(2).padStart(6),
  `${m.attack.toFixed(1)}ms`.padStart(8),
  `${m.crest.toFixed(1)}dB`.padStart(7),
  `${m.tail.toFixed(0)}ms`.padStart(7),
  `${m.bright.toFixed(0)}Hz`.padStart(8),
].join(' ');

if (isMain(import.meta.url)) {
  const root = process.argv[2] ?? 'scratch/gun-sounds';
  const files = findAudio(root).filter((f) => extname(f).toLowerCase() !== '.wav');
  if (!files.length) { console.error(`nothing to bake under ${root}`); process.exit(1); }
  console.log('file'.padEnd(52), 'secs'.padStart(6), 'attack'.padStart(8), 'crest'.padStart(7), 'tail'.padStart(7), 'bright'.padStart(8));
  const rows = await withDecoder(async (page) => {
    const out = [];
    for (const f of files) {
      const { rate, mono } = await decodeAudio(page, f);
      const pcm = bake(mono, rate);
      writeFileSync(f.replace(/\.[a-z0-9]+$/i, '.wav'), writeWav8(pcm));
      const row = { file: f.slice(root.length + 1), ...measure(pcm) };
      out.push(row);
      console.log(measureLine(row.file, row));
    }
    return out;
  });
  writeFileSync(join(root, 'measured.json'), JSON.stringify(rows, null, 1));
}
