// @ts-check
// Spell impact sounds, built at runtime from DAGGER.SND voices plus synthesis and baked to the archive rate and
// 8 bits so they match the classic clips. The heal plays public/sfx/spell-heal.wav unbaked; a synthesized chime
// plays until it loads.
import { SAMPLE_RATE as SND_RATE } from '../formats/sndFile.js';
import { APP_ROOT } from '../platform/appRoot.js';
import { addVoice, noise, lowpass } from '../arena/arenaSound.js';
import { seededRng } from '../weather/wind.js';
import { loadEarthWallSounds } from './earthWallSounds.js';
import { loadMeteorSounds } from './meteorSounds.js';
import { BAKED_RATE } from '../audio/soundRemix.js';
import { afterFirstFrame } from '../systems/afterFirstFrame.js';

export const IMPACT_SOUND_RATE = SND_RATE;
export const IMPACT_SOUND_KEYS = Object.freeze({ fire: 'spellfx:fire', frost: 'spellfx:frost', poison: 'spellfx:poison', shock: 'spellfx:shock', magic: 'spellfx:magic', heal: 'spellfx:heal' });
const REMIXED = Object.freeze({
  earthRise: { set: 'earth', level: 0.85 }, earthSettle: { set: 'earth', level: 1 }, earthSlide: { set: 'earth', level: 1 },
  meteorFall: { set: 'meteor', level: 1, ref: 12 }, meteorImpact: { set: 'meteor', level: 1, ref: 10 },
});
// DAGGER.SND record indexes; IMPACT_CAST_IDS below are sound IDs, resolved to indexes at build time.
export const IMPACT_CLIPS = Object.freeze({ ignite: 16, splashSmallLow: 334, splashLarge: 342, lightningShort: 348, burning: 420 });
export const IMPACT_CAST_IDS = Object.freeze({ fire: 352, frost: 353, poison: 350, shock: 351, magic: 349 });
export const IMPACT_SOUND_SECONDS = Object.freeze({ fire: 1.5, frost: 1.3, poison: 1.5, shock: 1.1, magic: 1.3, heal: 1.9 });
export const IMPACT_SOUND_LEVEL = Object.freeze({ fire: 0.85, frost: 0.8, poison: 0.75, shock: 0.85, magic: 0.75, heal: 0.55 });
export const HEAL_SOUND_FILE = 'spell-heal.wav';
export const HEAL_SYNTH_KEY = 'spellfx:heal-synth';
export const HEAL_SYNTH_LEVEL = 0.3;
export const HEAL_PITCH_SPREAD = 0.03;
export const healSoundUrl = () => new URL(`sfx/${HEAL_SOUND_FILE}`, APP_ROOT ?? globalThis.document?.baseURI ?? 'http://localhost/').href;

// Parsed here instead of with decodeAudioData, so the clip can be registered synchronously on its first play.
export function parseWav(bytes) {
  try {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const tag = (o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
    if (b.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
    let fmt = null, data = null;
    for (let o = 12; o + 8 <= b.length;) {
      const id = tag(o), len = v.getUint32(o + 4, true);
      if (id === 'fmt ') fmt = { format: v.getUint16(o + 8, true), ch: v.getUint16(o + 10, true), rate: v.getUint32(o + 12, true), bits: v.getUint16(o + 22, true) };
      else if (id === 'data') data = { at: o + 8, len: Math.min(len, b.length - o - 8) };
      o += 8 + len + (len & 1);
    }
    if (!fmt || !data || (fmt.format !== 1 && fmt.format !== 0xfffe) || !(fmt.ch > 0) || !(fmt.rate > 0)) return null;
    const bps = fmt.bits / 8, frame = bps * fmt.ch, n = Math.floor(data.len / frame);
    if (![1, 2, 3].includes(bps) || !(n > 0)) return null;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let c = 0; c < fmt.ch; c++) {
        const o = data.at + i * frame + c * bps;
        sum += bps === 1 ? (b[o] - 128) / 128 : bps === 2 ? v.getInt16(o, true) / 32768 : (((b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) << 8) >> 8) / 8388608;
      }
      out[i] = sum / fmt.ch;
    }
    return { samples: out, rate: fmt.rate };
  } catch { return null; }
}
export const IMPACT_GAP_MS = 70;
export const IMPACT_SOUND_SEED = 0x5f1c3d;

const R = IMPACT_SOUND_RATE;
const TAU = Math.PI * 2;

const env = (t, atk, dec) => (t < 0 ? 0 : (atk > 0 ? Math.min(1, t / atk) : 1) * Math.exp(-t / dec));

const voice = (out, src, o) => addVoice(out, R, src, R, { fadeIn: 0.003, fadeOut: 0.15, ...o });

function bandpass(x, hz, q) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0 = 0, b2 = 0, a1 = 0, a2 = 0;
  for (let i = 0; i < x.length; i++) {
    if ((i & 31) === 0) {
      const f = Math.max(40, Math.min(R * 0.45, hz(i / R))), w = (TAU * f) / R, al = Math.sin(w) / (2 * q), a0 = 1 + al;
      b0 = al / a0; b2 = -al / a0; a1 = (-2 * Math.cos(w)) / a0; a2 = (1 - al) / a0;
    }
    const y = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y; x[i] = y;
  }
  return x;
}
function lowCut(x, hz) {
  const a = 1 - Math.exp((-hz * TAU) / R);
  let y = 0;
  for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); x[i] -= y; }
  return x;
}
function addShaped(out, x, e, gain) { for (let i = 0; i < out.length && i < x.length; i++) out[i] += x[i] * e(i / R) * gain; }
function addTone(out, f, e, gain, from = 0, to = Infinity) {
  let ph = 0;
  const a = Math.max(0, Math.floor(from * R)), b = Math.min(out.length, Math.floor(to * R));
  for (let i = a; i < b; i++) { const t = i / R; ph += f(t) / R; const v = Math.sin(TAU * ph); out[i] += v * e(t) * gain; }
}
function addCrackle(out, rng, rate, amp, toneHz, until) {
  const n = Math.min(out.length, Math.floor(until * R));
  for (let i = 0; i < n; i++) {
    const t = i / R;
    if (rng() >= rate(t) / R) continue;
    const len = Math.floor((0.002 + rng() * 0.006) * R), a = amp(t) * (0.4 + 0.6 * rng());
    let ph = rng();
    for (let k = 0; k < len && i + k < out.length; k++) { ph += (toneHz * (0.7 + 0.6 * rng())) / R; const v = Math.sin(TAU * ph); out[i + k] += (rng() * 2 - 1) * 0.6 * a * Math.exp(-k / (len * 0.35)) + v * 0.4 * a * (1 - k / len); }
  }
}

export function finish(out, { soft = false } = {}) {
  lowCut(out, 25);
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = peak > 1e-6 ? 1.15 / peak : 0, sat = Math.tanh(1.3);
  const tail = Math.floor(0.04 * R);
  for (let i = 0; i < out.length; i++) {
    let s = soft ? (out[i] * g / 1.15) * 0.9 : Math.tanh(out[i] * g * 1.3) / sat * 0.9;
    if (i > out.length - tail) s *= (out.length - i) / tail;
    out[i] = Math.round(s * 127) / 127;
  }
  return out;
}

export function buildImpactSound(kind, voices = {}, seed = IMPACT_SOUND_SEED) {
  const rng = seededRng(seed ^ (FX_INDEX[kind] ?? 4) * 0x9e3779b1);
  const sec = IMPACT_SOUND_SECONDS[kind] ?? 1.3;
  const out = new Float32Array(Math.floor(sec * R));
  const r = (a, b) => a + rng() * (b - a);
  const V = voices ?? {};
  switch (kind) {
    case 'fire': {
      addTone(out, (t) => 38 + 75 * Math.exp(-t / 0.07), (t) => env(t, 0.004, 0.28), 0.75);
      addShaped(out, bandpass(noise(out.length, rng), (t) => 300 + 1900 * Math.exp(-t / 0.25), 0.8), (t) => env(t, 0.008, 0.42), 0.9);
      addCrackle(out, rng, (t) => 140 * Math.exp(-t / 0.35) + 10, (t) => 0.32 * Math.exp(-t / 0.7), 2600, sec - 0.05);
      voice(out, V.ignite, { ratio: 0.82, gain: 0.55, take: 1.0, fadeOut: 0.5 });
      voice(out, V.cast, { ratio: 0.7, gain: 0.35, take: 0.8, fadeOut: 0.4 });
      voice(out, V.burning, { ratio: 1, offset: 0.15, gain: 0.3, take: 1.2, fadeIn: 0.2, fadeOut: 0.6 });
      break;
    }
    case 'frost': {
      if (V.splashLarge) voice(out, V.splashLarge, { ratio: 1.08, gain: 0.85, take: 1.1, fadeOut: 0.4 });
      else addShaped(out, bandpass(noise(out.length, rng), () => 1400, 1.1), (t) => env(t, 0.003, 0.22), 0.9);
      addTone(out, (t) => 50 + 50 * Math.exp(-t / 0.05), (t) => env(t, 0.003, 0.12), 0.4);
      addShaped(out, lowCut(noise(out.length, rng), 2500), (t) => env(t, 0.01, 0.38), 0.22);
      for (let i = 0; i < 10; i++) {
        const t0 = r(0.02, 0.6), f = r(1400, 3900), d = r(0.04, 0.11), a = r(0.06, 0.16);
        addTone(out, () => f, (t) => env(t - t0, 0.001, d), a, t0, t0 + d * 6);
        if (f * 1.38 < R * 0.45) addTone(out, () => f * 1.38, (t) => env(t - t0, 0.001, d * 0.6), a * 0.4, t0, t0 + d * 4);
      }
      voice(out, V.cast, { ratio: 0.85, gain: 0.22, take: 0.6, fadeOut: 0.3 });
      break;
    }
    case 'poison': {
      voice(out, V.splashSmallLow, { ratio: 0.72, gain: 0.65, take: 0.9, fadeOut: 0.35 });
      addShaped(out, bandpass(noise(out.length, rng), (t) => 220 + 900 * Math.exp(-t / 0.12), 4), (t) => env(t, 0.005, 0.22), 1.1);
      for (let i = 0; i < 11; i++) {
        const t0 = r(0.05, 1.1), f0 = r(220, 600), d = r(0.04, 0.08), a = r(0.08, 0.2);
        addTone(out, (t) => f0 * (1 + 1.2 * Math.min(1, (t - t0) / d)), (t) => (t < t0 || t > t0 + d ? 0 : Math.sin((Math.PI * (t - t0)) / d) ** 2), a, t0, t0 + d);
      }
      addShaped(out, lowCut(noise(out.length, rng), 3000), (t) => env(t, 0.08, 0.7) * (0.6 + 0.4 * Math.sin(t * 90)), 0.12);
      voice(out, V.cast, { ratio: 0.7, gain: 0.22, take: 0.7, fadeOut: 0.3 });
      break;
    }
    case 'shock': {
      addShaped(out, noise(out.length, rng), (t) => env(t, 0.0005, 0.012), 1.0);
      if (V.lightningShort) voice(out, V.lightningShort, { ratio: 1.25, gain: 0.8, take: 0.85, fadeOut: 0.55 });
      else addShaped(out, bandpass(noise(out.length, rng), () => 2000, 0.7), (t) => env(t, 0.001, 0.12), 0.9);
      {
        const n = Math.min(out.length, Math.floor(0.75 * R));
        let ph = 0, f = 90, hop = 0, on = 1;
        const nz = noise(n, rng), buzz = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          if (i >= hop) { f = r(55, 140); on = rng() < 0.72 ? 1 : 0; hop = i + Math.floor(r(0.012, 0.03) * R); }
          ph += f / R;
          const s = (Math.sin(TAU * ph) >= 0 ? 1 : -1) * 0.7 + nz[i] * 0.3;
          buzz[i] = Math.round(s * on * env(i / R, 0.002, 0.3) * 7) / 7;
        }
        lowpass(buzz, R, 2500);
        for (let i = 0; i < n; i++) out[i] += buzz[i] * 0.4;
      }
      addCrackle(out, rng, (t) => 260 * Math.exp(-t / 0.2), (t) => 0.3 * Math.exp(-t / 0.4), 3200, sec - 0.05);
      voice(out, V.cast, { ratio: 1.15, gain: 0.25, take: 0.6, fadeOut: 0.3 });
      break;
    }
    case 'heal': {
      const notes = [440, 554.37, 659.25, 880, 1108.73, 1318.51];
      notes.forEach((f, i) => {
        const t0 = 0.04 + i * 0.085, a = 0.17 * (1 - i * 0.09);
        const e = (t) => env(t - t0, 0.035, 0.7);
        const vib = (t) => 1 + 0.003 * Math.sin(TAU * 5 * t);
        addTone(out, (t) => f * vib(t), e, a, t0);
        addTone(out, (t) => 2 * f * vib(t), e, a * 0.12, t0);
      });
      addTone(out, () => 220, (t) => Math.min(1, t / 0.25) * Math.exp(-Math.max(0, t - 0.25) / 0.6), 0.1);
      addTone(out, () => 330, (t) => Math.min(1, t / 0.3) * Math.exp(-Math.max(0, t - 0.3) / 0.55), 0.07);
      addShaped(out, bandpass(noise(out.length, rng), (t) => 500 + 1500 * Math.min(1, t / 1.0), 1.5), (t) => Math.min(1, t / 0.35) * Math.exp(-Math.max(0, t - 0.35) / 0.5), 0.08);
      voice(out, V.cast, { ratio: 1.35, gain: 0.08, take: 0.6, fadeIn: 0.08, fadeOut: 0.35 });
      lowpass(lowpass(out, R, 2600), R, 2600);
      return finish(out, { soft: true });
    }
    default: {
      addTone(out, (t) => 70 + 110 * Math.exp(-t / 0.09), (t) => env(t, 0.004, 0.4), 0.6);
      addTone(out, (t) => 1.5 * (70 + 110 * Math.exp(-t / 0.09)), (t) => env(t, 0.004, 0.3), 0.3);
      for (let i = 0; i < 5; i++) {
        const f = r(700, 1700), tr = r(9, 14);
        addTone(out, () => f, (t) => env(t, 0.02, 0.6) * (0.7 + 0.3 * Math.sin(TAU * tr * t)), 0.07);
      }
      addShaped(out, bandpass(noise(out.length, rng), (t) => 500 + 2600 * Math.exp(-t / 0.2), 1.2), (t) => env(t, 0.01, 0.3), 0.45);
      voice(out, V.cast, { ratio: 0.78, gain: 0.4, take: 0.9, fadeOut: 0.4 });
    }
  }
  return finish(out);
}
const FX_INDEX = Object.freeze({ fire: 0, frost: 1, poison: 2, shock: 3, magic: 4, heal: 5 });

export function impactVoices(audio, kind) {
  const at = (i) => { try { return audio?.samplesOf?.(i) ?? null; } catch { return null; } };
  const castId = IMPACT_CAST_IDS[kind === 'heal' ? 'magic' : kind] ?? IMPACT_CAST_IDS.magic;
  let castIx = -1;
  try { castIx = audio?.soundIndexForId?.(castId) ?? -1; } catch { castIx = -1; }
  return {
    cast: castIx >= 0 ? at(castIx) : null,
    ignite: kind === 'fire' ? at(IMPACT_CLIPS.ignite) : null,
    burning: kind === 'fire' ? at(IMPACT_CLIPS.burning) : null,
    splashLarge: kind === 'frost' ? at(IMPACT_CLIPS.splashLarge) : null,
    splashSmallLow: kind === 'poison' ? at(IMPACT_CLIPS.splashSmallLow) : null,
    lightningShort: kind === 'shock' ? at(IMPACT_CLIPS.lightningShort) : null,
  };
}

export function createSpellImpactSounds(audio, { now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), fetchBytes = null, earthWall = loadEarthWallSounds, meteor = loadMeteorSounds } = {}) {
  const built = new Map();
  const registered = new Set();
  const last = new Map();
  const builders = { earth: earthWall, meteor };
  const sets = {};
  function buildSet(name) {
    if (sets[name] || !builders[name] || !audio?.samplesOf || audio.snd == null) return;
    sets[name] = 'building';
    new Promise((go) => afterFirstFrame(() => go(null))).then(() => builders[name]({ samplesOf: (i) => audio.samplesOf(i) })).then((s) => { sets[name] = s ?? 'failed'; }, () => { sets[name] = 'failed'; });
  }
  for (const name of Object.keys(builders)) { try { buildSet(name); } catch {} }
  /** @type {'pending' | 'failed' | { samples: Float32Array, rate: number }} */
  let healClip = 'pending';
  const load = fetchBytes ?? (typeof fetch === 'function' && globalThis.document
    ? async () => { const r = await fetch(healSoundUrl()); if (!r.ok) throw new Error(`${HEAL_SOUND_FILE}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()); }
    : null);
  if (load) Promise.resolve().then(load).then((bytes) => { healClip = parseWav(bytes) ?? 'failed'; }, () => { healClip = 'failed'; });
  else healClip = 'failed';
  function healKey() {
    if (registered.has('heal')) return IMPACT_SOUND_KEYS.heal;
    if (healClip && typeof healClip === 'object') {
      if (audio.registerSamples(IMPACT_SOUND_KEYS.heal, healClip.samples, healClip.rate)) { registered.add('heal'); return IMPACT_SOUND_KEYS.heal; }
      return null;
    }
    if (!registered.has('heal-synth')) {
      if (audio.snd == null && audio.samplesOf) return null;
      if (!audio.registerSamples(HEAL_SYNTH_KEY, buildImpactSound('heal', impactVoices(audio, 'heal')), IMPACT_SOUND_RATE)) return null;
      registered.add('heal-synth');
    }
    return HEAL_SYNTH_KEY;
  }
  function ensure(kind) {
    if (registered.has(kind)) return true;
    if (!audio?.registerSamples) return false;
    let x = built.get(kind);
    if (!x) {
      if (audio.snd == null && audio.samplesOf) { return false; }
      x = buildImpactSound(kind, impactVoices(audio, kind));
      built.set(kind, x);
    }
    if (!audio.registerSamples(IMPACT_SOUND_KEYS[kind], x, IMPACT_SOUND_RATE)) return false;
    registered.add(kind);
    return true;
  }
  return {
    play(kind, pos, { volume = 1, heard = 40 } = {}) {
      const k = IMPACT_SOUND_KEYS[kind] || REMIXED[kind] ? kind : 'magic';
      if (!Array.isArray(pos) || !pos.every(Number.isFinite)) return false;
      const t = now();
      if (t - (last.get(k) ?? -Infinity) < IMPACT_GAP_MS) return false;
      last.set(k, t);
      try {
        if (!audio?.registerSamples) return false;
        if (k === 'heal') {
          const key = healKey();
          if (!key) return false;
          const file = key === IMPACT_SOUND_KEYS.heal;
          audio.play3d(key, pos, volume * (file ? IMPACT_SOUND_LEVEL.heal : HEAL_SYNTH_LEVEL), { refDistance: 2.5, maxDistance: heard, pitch: 1 + (Math.random() * 2 - 1) * HEAL_PITCH_SPREAD });
          return true;
        }
        const rx = REMIXED[k];
        if (rx) {
          buildSet(rx.set);
          const key = `spellfx:${k}`, s = sets[rx.set]?.[k];
          if (!registered.has(key)) {
            if (!(s instanceof Float32Array) || !audio.registerSamples(key, s, BAKED_RATE)) return false;
            registered.add(key);
          }
          audio.play3d(key, pos, volume * rx.level, { refDistance: rx.ref ?? 2.5, maxDistance: heard, pitch: 0.94 + Math.random() * 0.12 });
          return true;
        }
        if (!ensure(k)) return false;
        audio.play3d(IMPACT_SOUND_KEYS[k], pos, volume * (IMPACT_SOUND_LEVEL[k] ?? 0.8), { refDistance: 2.5, maxDistance: heard, pitch: 0.94 + Math.random() * 0.12 });
        return true;
      } catch { return false; }
    },
  };
}
