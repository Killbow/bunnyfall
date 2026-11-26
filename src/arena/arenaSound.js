// @ts-check

// DAGGER.SND has no cheer, boo, or applause. The crowd is built at runtime from the player's own AmbientPeople1-10
// records (441-450) and filtered noise, so no archive audio ships in the tree.

import { SAMPLE_RATE as SND_RATE } from '../formats/sndFile.js';
import { seededRng } from './arenaLadder.js';

export const PEOPLE_RECORDS = Object.freeze([441, 442, 443, 444, 445, 446, 447, 448, 449, 450]);
export const ARENA_CLIPS = Object.freeze({ maleGasp: 386, femaleGasp: 387, groan: 458, drums: 28, drumsCall: 374, bell: 107, fanfare: 32, title: 33 });
export const ARENA_SOUND_KEYS = Object.freeze({ bed: 'arena:bed', cheer: 'arena:cheer', roar: 'arena:roar', boo: 'arena:boo', applause: 'arena:applause' });
export const ARENA_SOUND_RATE = 22050;
export const ARENA_SOUND_SECONDS = Object.freeze({ bed: 8, cheer: 2.6, roar: 3.6, boo: 2.8, applause: 3.4 });
export const ARENA_SOUND_RMS = Object.freeze({ bed: 0.05, cheer: 0.11, roar: 0.15, boo: 0.1, applause: 0.09 });
// Cues play at this share of full volume so the applause, fanfare, music, and roar together do not clip.
export const ARENA_CUE_TRIM = 0.8;
export const BED_FADE_S = 0.4;
// Shouts are low-passed here because the layered 8-bit voices hiss above it.
export const SHOUT_TOP_HZ = 3400;
export const ARENA_SOUND_SEED = 0x43524f57;

export function addVoice(out, rate, src, srcRate, { ratio = 1, offset = 0, gain = 1, wrap = false, env = null, take = Infinity, fadeIn = 0, fadeOut = 0 } = {}) {
  if (!src?.length) return out;
  const step = (srcRate / rate) * ratio;
  const len = Math.min(Math.floor(src.length / step), Math.floor(take * rate));
  const start = Math.floor(offset * rate);
  const faded = fadeIn > 0 || fadeOut > 0, fi = Math.max(1, fadeIn * rate), fo = Math.max(1, fadeOut * rate);
  for (let i = 0; i < len; i++) {
    let j = start + i;
    if (wrap) j = ((j % out.length) + out.length) % out.length;
    else if (j < 0 || j >= out.length) continue;
    const p = i * step, k = Math.floor(p), f = p - k;
    const s = (src[k] ?? 0) * (1 - f) + (src[k + 1] ?? src[k] ?? 0) * f;
    out[j] += s * gain * (env ? env(j / out.length) : 1) * (faded ? Math.min(1, i / fi, (len - i) / fo) : 1);
  }
  return out;
}

export function noise(n, rng) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rng() * 2 - 1;
  return out;
}
export function lowpass(x, rate, hz) {
  const a = 1 - Math.exp(-hz * 2 * Math.PI / rate);
  let y = 0;
  for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); x[i] = y; }
  return x;
}
// The first pass only warms the filter, so the loop's start continues from the state its end leaves and
// the seam does not click.
export function lowpassLoop(x, rate, hz) {
  const a = 1 - Math.exp(-hz * 2 * Math.PI / rate);
  let y = 0;
  for (let i = 0; i < x.length; i++) y += a * (x[i] - y);
  for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); x[i] = y; }
  return x;
}
export function highpass(x, rate, hz) {
  const a = Math.exp(-hz * 2 * Math.PI / rate);
  let px = 0, y = 0;
  for (let i = 0; i < x.length; i++) { y = a * (y + x[i] - px); px = x[i]; x[i] = y; }
  return x;
}
export const band = (n, rate, rng, lo, hi) => lowpass(highpass(noise(n, rng), rate, lo), rate, hi);
export function rms(x) { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return x.length ? Math.sqrt(s / x.length) : 0; }
export function level(x, target) {
  const r = rms(x);
  const k = r > 1e-9 ? target / r : 0;
  for (let i = 0; i < x.length; i++) { const v = x[i] * k; x[i] = Math.abs(v) < 0.7 ? v : Math.sign(v) * (0.7 + 0.28 * Math.tanh((Math.abs(v) - 0.7) / 0.28)); }
  return x;
}
export const swell = (a, r) => (t) => (t < a ? t / a : t > 1 - r ? Math.max(0, (1 - t) / r) : 1);

const usable = (voices) => (voices ?? []).filter((v) => v && v.length > 32);

export function synthBed(voices, { rate = ARENA_SOUND_RATE, srcRate = SND_RATE, seed = ARENA_SOUND_SEED } = {}) {
  const rng = seededRng(seed);
  const n = Math.round(ARENA_SOUND_SECONDS.bed * rate);
  const out = band(n, rate, rng, 180, 900);
  for (let i = 0; i < n; i++) out[i] *= usable(voices).length ? 0 : 0.06;
  // The last 50 ms of the noise fade into the first, so the loop has no click at its seam.
  const fade = Math.round(0.05 * rate);
  for (let i = 0; i < fade; i++) { const t = i / fade; out[i] = out[i] * t + out[n - fade + i] * (1 - t); }
  const vs = usable(voices);
  for (let layer = 0; layer < vs.length * 2; layer++) {
    const v = vs[layer % vs.length];
    addVoice(out, rate, v, srcRate, { ratio: 0.88 + rng() * 0.24, offset: rng() * ARENA_SOUND_SECONDS.bed, gain: 0.55 + rng() * 0.3, wrap: true });
  }
  return level(out, ARENA_SOUND_RMS.bed);
}

function shout(voices, { rate, srcRate, seed, seconds, count, pitch, spread, noiseLo, noiseHi, noiseGain, env, target }) {
  const rng = seededRng(seed);
  const n = Math.round(seconds * rate);
  const out = band(n, rate, rng, noiseLo, noiseHi);
  const hiss = usable(voices).length ? 0 : 1; for (let i = 0; i < n; i++) out[i] *= noiseGain * hiss * env(i / n);
  const vs = usable(voices);
  for (let k = 0; k < (vs.length ? count : 0); k++) {
    const v = vs[Math.floor(rng() * vs.length)];
    addVoice(out, rate, v, srcRate, { ratio: pitch * (1 - spread + rng() * spread * 2), offset: rng() * seconds * 0.35 - 0.2, gain: 0.5 + rng() * 0.5, env });
  }
  return level(lowpass(out, rate, SHOUT_TOP_HZ), target);
}
export const synthCheer = (voices, { rate = ARENA_SOUND_RATE, srcRate = SND_RATE, seed = ARENA_SOUND_SEED + 1 } = {}) => shout(voices, {
  rate, srcRate, seed, seconds: ARENA_SOUND_SECONDS.cheer, count: 14, pitch: 1.22, spread: 0.12, noiseLo: 500, noiseHi: 3200, noiseGain: 0.15, env: swell(0.12, 0.45), target: ARENA_SOUND_RMS.cheer,
});
export const synthRoar = (voices, { rate = ARENA_SOUND_RATE, srcRate = SND_RATE, seed = ARENA_SOUND_SEED + 2 } = {}) => shout(voices, {
  rate, srcRate, seed, seconds: ARENA_SOUND_SECONDS.roar, count: 26, pitch: 1.15, spread: 0.16, noiseLo: 350, noiseHi: 3600, noiseGain: 0.22, env: swell(0.08, 0.55), target: ARENA_SOUND_RMS.roar,
});
export const synthBoo = (voices, { rate = ARENA_SOUND_RATE, srcRate = SND_RATE, seed = ARENA_SOUND_SEED + 3 } = {}) => shout(voices, {
  rate, srcRate, seed, seconds: ARENA_SOUND_SECONDS.boo, count: 16, pitch: 0.66, spread: 0.08, noiseLo: 90, noiseHi: 520, noiseGain: 0.18, env: swell(0.18, 0.5), target: ARENA_SOUND_RMS.boo,
});
export function synthApplause(voices, { rate = ARENA_SOUND_RATE, srcRate = SND_RATE, seed = ARENA_SOUND_SEED + 4 } = {}) {
  const rng = seededRng(seed);
  const n = Math.round(ARENA_SOUND_SECONDS.applause * rate);
  const out = new Float32Array(n);
  const env = swell(0.15, 0.55);
  const claps = 2200;
  for (let c = 0; c < claps; c++) {
    let t = rng();
    for (let tries = 0; tries < 4 && rng() > env(t); tries++) t = rng();
    const at = Math.floor(t * n), len = Math.floor((0.008 + rng() * 0.014) * rate), g = 0.4 + rng() * 0.6;
    const hp = 900 + rng() * 1400;
    let y = 0, px = 0;
    const a = Math.exp(-hp * 2 * Math.PI / rate);
    for (let i = 0; i < len && at + i < n; i++) {
      const x = (rng() * 2 - 1) * Math.exp(-i / (len * 0.35));
      y = a * (y + x - px); px = x;
      out[at + i] += y * g;
    }
  }
  const vs = usable(voices);
  for (let k = 0; k < (vs.length ? 5 : 0); k++) addVoice(out, rate, vs[Math.floor(rng() * vs.length)], srcRate, { ratio: 1.1, offset: rng() * 1.5, gain: 0.25, env });
  return level(out, ARENA_SOUND_RMS.applause);
}

export function synthArenaSounds(voices, o = {}) {
  return {
    [ARENA_SOUND_KEYS.bed]: synthBed(voices, o),
    [ARENA_SOUND_KEYS.cheer]: synthCheer(voices, o),
    [ARENA_SOUND_KEYS.roar]: synthRoar(voices, o),
    [ARENA_SOUND_KEYS.boo]: synthBoo(voices, o),
    [ARENA_SOUND_KEYS.applause]: synthApplause(voices, o),
  };
}

export const BED_GAIN = 0.55;
export const bedGain = (mood, near = 1) => Math.max(0, Math.min(1, near)) * BED_GAIN * (0.55 + 0.45 * Math.min(1, Math.abs(mood) * 1.4));

export function createArenaSound(audio) {
  let made = false, bedLoop = null;
  const flip = { v: false };
  return {
    ensure() {
      if (made) return true;
      if (!audio?.samplesOf || !audio?.registerSamples) return false;
      const voices = PEOPLE_RECORDS.map((i) => audio.samplesOf(i)).filter(Boolean);
      if (!voices.length) return false;
      const all = synthArenaSounds(voices);
      for (const [k, x] of Object.entries(all)) if (!audio.registerSamples(k, x, ARENA_SOUND_RATE)) return false;
      made = true;
      return true;
    },
    cue(list, near = 1) {
      if (!(near > 0) || !list?.length) return;
      for (const { s, v } of list) {
        const vol = Math.max(0, Math.min(1, v * near)) * ARENA_CUE_TRIM;
        switch (s) {
          case 'cheer': case 'roar': case 'boo': case 'applause':
            if (this.ensure()) audio.playOneShot(ARENA_SOUND_KEYS[s], vol, 0.94 + Math.random() * 0.12);
            break;
          case 'gasp': flip.v = !flip.v; audio.playOneShot(flip.v ? ARENA_CLIPS.maleGasp : ARENA_CLIPS.femaleGasp, vol); break;
          case 'groan': audio.playOneShot(ARENA_CLIPS.groan, vol); break;
          case 'drums': audio.playOneShot(ARENA_CLIPS.drums, vol); break;
          case 'drumsCall': audio.playOneShot(ARENA_CLIPS.drumsCall, vol); break;
          case 'bell': audio.playOneShot(ARENA_CLIPS.bell, vol); break;
          case 'fanfare': audio.playOneShot(ARENA_CLIPS.fanfare, vol); break;
          case 'title': audio.playOneShot(ARENA_CLIPS.title, vol); break;
          default: break;
        }
      }
    },
    bed(mood, near = 1) {
      if (!(near > 0)) { this.stop(); return; }
      if (!this.ensure()) return;
      if (!bedLoop) bedLoop = audio.loop?.(ARENA_SOUND_KEYS.bed, 0) ?? null;
      bedLoop?.setVolume?.(bedGain(mood, near));
    },
    // The bed fades out rather than stopping, because a bed cut at its level pops.
    stop() { if (bedLoop) { if (bedLoop.fadeStop) bedLoop.fadeStop(BED_FADE_S); else bedLoop.stop(); bedLoop = null; } },
    get made() { return made; },
  };
}
