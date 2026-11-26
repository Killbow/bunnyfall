// @ts-check
// Builds the Rift sound at runtime from the player's own DAGGER.SND records, so no Daggerfall audio ships in the
// repository.

import { SAMPLE_RATE as SND_RATE } from '../formats/sndFile.js';
import { addVoice, lowpassLoop, level } from '../arena/arenaSound.js';

export const RIFT_BELL_KEY = 'sd:riftBell';
export const RIFT_BELL_RECORDS = Object.freeze({ bell: 107, bubbles: 114 });
export const RIFT_BELL_RATE = 22050;
export const RIFT_BELL_SECONDS = 6.5;
export const RIFT_BELL_RMS = 0.07;
export const RIFT_BELL_RANGE = Object.freeze({ refDistance: 3, maxDistance: 40 });
export const RIFT_BELL_LOWPASS_HZ = 900;
export const RIFT_BELL_SHAPE = Object.freeze({ ratio: 0.62, echoS: 0.33, echo: 0.35, swellHz: 0.45, swell: 0.3, darkHz: 1100 });

/**
 * @param {Float32Array | null | undefined} bell
 * @param {Float32Array | null | undefined} bubbles
 */
export function buildRiftBell(bell, bubbles, { srcRate = SND_RATE, rate = RIFT_BELL_RATE, seconds = RIFT_BELL_SECONDS } = {}) {
  const out = new Float32Array(Math.round(rate * seconds));
  const S = RIFT_BELL_SHAPE;
  if (bell?.length) {
    addVoice(out, rate, bell, srcRate, { ratio: S.ratio, offset: 0.05, gain: 1, wrap: true });
    addVoice(out, rate, bell, srcRate, { ratio: S.ratio * 0.995, offset: 0.05 + S.echoS, gain: S.echo, wrap: true });
  }
  if (bubbles?.length) addVoice(out, rate, bubbles, srcRate, { ratio: 0.8, offset: seconds * 0.45, gain: 0.18, wrap: true });
  lowpassLoop(out, rate, S.darkHz);
  // Uses a whole number of swell waves per loop so the loop end matches its start with no seam.
  const waves = Math.max(1, Math.round(S.swellHz * seconds));
  for (let i = 0; i < out.length; i++) out[i] *= 1 - S.swell * 0.5 * (1 - Math.cos((2 * Math.PI * waves * i) / out.length));
  return level(out, RIFT_BELL_RMS);
}

/**
 * @param {any} audio
 * @param {number[]} at
 */
export function startRiftBell(audio, at) {
  if (!audio?.loop3d || !at) return null;
  try {
    if (!bellOn(audio)) return null;
    return audio.loop3d(RIFT_BELL_KEY, at, 1, { ...RIFT_BELL_RANGE, distanceModel: 'linear', lowpass: RIFT_BELL_LOWPASS_HZ }) ?? null;
  } catch { return null; }
}

const _built = new WeakMap();
function bellOn(audio) {
  if (!audio?.registerSamples || !audio?.samplesOf) return false;
  let samples = _built.get(audio);
  if (!samples) {
    const bell = audio.samplesOf(RIFT_BELL_RECORDS.bell);
    if (!bell) return false;
    samples = buildRiftBell(bell, audio.samplesOf(RIFT_BELL_RECORDS.bubbles));
    _built.set(audio, samples);
  }
  return !!audio.registerSamples(RIFT_BELL_KEY, samples, RIFT_BELL_RATE);
}

export const SD_HOME_TOLL = Object.freeze({ pitch: 4 / 3, refDistance: 6, maxDistance: 70 });

/**
 * @param {any} audio
 * @param {number[]} at
 */
export function tollRiftBell(audio, at) {
  if (!audio?.play3d || !at) return false;
  try {
    if (!bellOn(audio)) return false;
    const T = SD_HOME_TOLL;
    return audio.play3d(RIFT_BELL_KEY, at, 1, { refDistance: T.refDistance, maxDistance: T.maxDistance, distanceModel: 'linear', pitch: T.pitch }) != null;
  } catch { return false; }
}
