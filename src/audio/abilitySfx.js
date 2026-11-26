// BUNNYFALL: ability sounds made in code with Web Audio, with no sound files. Each art material has a voice, such as
// steel rings or stone thuds, and each cast moment a shape: wind-up swell, release whoosh, impact accent, self chime,
// and landing thump. Quiet by design, through the game's sound volume bus, and only with Enhanced Sounds on.
import { audio } from './audio.js';
import { enhancedSoundsOn } from './enhancedSounds.js';
import { abilityArt } from '../combat/abilities/abilityArt.js';

export const ABILITY_SFX_LEVEL = 0.22;
// One accent per moment per 50 ms, so a sweep through five enemies plays one sound.
const MIN_GAP_S = 0.05;

// Each voice: a pitch, a noise color (bandpass center), a ring (sine partial ratios), and a body (low thud).
export const VOICES = Object.freeze({
  steel: { pitch: 880, band: 3200, ring: [1, 2.76, 5.4], ringDecay: .32, body: 0, air: .7 },
  shadow: { pitch: 220, band: 900, ring: [], ringDecay: .2, body: .25, air: .9 },
  gold: { pitch: 660, band: 2400, ring: [1, 2, 3.01], ringDecay: .6, body: 0, air: .35 },
  moon: { pitch: 990, band: 4200, ring: [1, 1.5, 2.5], ringDecay: .45, body: 0, air: .6 },
  stone: { pitch: 110, band: 500, ring: [], ringDecay: .2, body: 1, air: .5 },
  ember: { pitch: 300, band: 1800, ring: [], ringDecay: .2, body: .3, air: .8, crackle: true },
  leaf: { pitch: 520, band: 1500, ring: [1, 2.2], ringDecay: .18, body: .15, air: .6 },
  wind: { pitch: 400, band: 1100, ring: [], ringDecay: .2, body: .1, air: 1 },
  tide: { pitch: 330, band: 700, ring: [1], ringDecay: .3, body: .3, air: .5, wobble: true },
});

let noise = null;
const last = new Map();

function noiseBuffer(c) {
  if (noise?.sampleRate === c.sampleRate) return noise;
  const length = Math.floor(c.sampleRate * .6);
  noise = c.createBuffer(1, length, c.sampleRate);
  const data = noise.getChannelData(0);
  let seed = 22222;
  for (let i = 0; i < length; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    data[i] = seed / 2147483648 - 1;
  }
  return noise;
}

function envelope(c, node, at, peak, attack, decay) {
  node.gain.setValueAtTime(0.0001, at);
  node.gain.exponentialRampToValueAtTime(Math.max(.0002, peak), at + attack);
  node.gain.exponentialRampToValueAtTime(.0001, at + attack + decay);
}

function whoosh(c, out, at, voice, { level, length, from, to }) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(voice.band * from, at);
  filter.frequency.exponentialRampToValueAtTime(voice.band * to, at + length);
  const gain = c.createGain();
  envelope(c, gain, at, level * voice.air, length * .35, length * .65);
  src.connect(filter).connect(gain).connect(out);
  src.start(at, Math.random() * .2, length + .05);
}

function ring(c, out, at, voice, level, decay) {
  for (const [i, ratio] of voice.ring.entries()) {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(voice.pitch * ratio, at);
    if (voice.wobble) osc.frequency.linearRampToValueAtTime(voice.pitch * ratio * .82, at + decay);
    const gain = c.createGain();
    envelope(c, gain, at, level / (i + 1.5), .004, decay / (1 + i * .4));
    osc.connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + decay + .05);
  }
}

function thud(c, out, at, voice, level, length = .22) {
  if (!voice.body) return;
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(voice.pitch * 1.4, at);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, voice.pitch * .45), at + length);
  const gain = c.createGain();
  envelope(c, gain, at, level * voice.body, .005, length);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + length + .05);
}

function crackle(c, out, at, voice, level) {
  for (let i = 0; i < 4; i++) whoosh(c, out, at + i * .035 + Math.random() * .02, voice, { level: level * .5, length: .03, from: 1.4, to: 1 });
}

/** The shapes of a cast's moments, as plain data (tests read this). */
export const MOMENTS = Object.freeze({
  'wind-up': { whoosh: { level: .35, length: .32, from: .5, to: 1.1 } },
  release: { whoosh: { level: .8, length: .2, from: 1.3, to: .6 } },
  impact: { ring: .5, ringScale: 1, thud: .9, crackle: .6, whoosh: { level: .35, length: .08, from: 1.6, to: 1 } },
  self: { ring: .45, ringScale: 2, whoosh: { level: .3, length: .45, from: .6, to: 1.4 } },
  land: { thud: 1.1, whoosh: { level: .4, length: .14, from: .7, to: .4 } },
});

export function abilityVoice(id) {
  return VOICES[abilityArt(id)?.material] ?? VOICES.steel;
}

/** Play `moment` of ability `id`. Silent with no audio context (headless, before the first click), volume off, or
 *  Enhanced Sounds off. */
export function playAbilitySfx(id, moment) {
  const c = audio.ctx;
  const shape = MOMENTS[moment];
  if (!c || !shape || c.state !== 'running' || !audio.enabled || !enhancedSoundsOn()) return false;
  const bus = audio._out?.();
  if (!bus) return false;
  const now = c.currentTime;
  const key = id + moment;
  if (now - (last.get(key) ?? -1) < MIN_GAP_S) return false;
  last.set(key, now);
  const out = c.createGain();
  out.gain.value = ABILITY_SFX_LEVEL;
  out.connect(bus);
  const voice = abilityVoice(id);
  if (shape.whoosh) whoosh(c, out, now, voice, shape.whoosh);
  if (shape.ring && voice.ring.length) ring(c, out, now + .005, voice, shape.ring, voice.ringDecay * shape.ringScale);
  if (shape.thud) thud(c, out, now, voice, shape.thud);
  if (shape.crackle && voice.crackle) crackle(c, out, now, voice, shape.crackle);
  setTimeout(() => { try { out.disconnect(); } catch { /* already gone */ } }, 1500);
  return true;
}
