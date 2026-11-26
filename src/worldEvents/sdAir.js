// @ts-check
// Events follow the relay-anchored sky clock, so each one plays at the same moment on every client. A frame gap
// longer than `AIR_BACKLOG_S` plays none of the events it skipped.
import { audio as defaultAudio } from '../audio/audio.js';
import { SOUND } from '../audio/soundClips.js';
import { SAMPLE_RATE as SND_RATE } from '../formats/sndFile.js';
import { addVoice, lowpassLoop, level, rms } from '../arena/arenaSound.js';
import { airSourceAt, AIR_BACKLOG_S } from '../audio/deadlandsAir.js';
import { THUNDER_SOURCE_M } from '../weather/distantStorms.js';
import { SD_SKY_PERIOD } from '../render/sdSky.js';
import { SD_ARENA, SD_ORRERY, SD_REALM_ORIGIN, realmToDungeon } from '../net/sdBrain.js';
import { spanAt } from '../world/sdSteps.js';

const CLUNK = 433, GRIND = 68, BELL = 107;
export const SD_AIR_VOID = Object.freeze({ loop: 'sdair:void', clip: 'sd:void', voice: SOUND.AmbientWindMoanDeep, volume: 0.26, pitch: 0.55, breathTurns: 24, depth: 0.4 });
export const SD_AIR_WORKS = Object.freeze({ loop: 'sdair:works', clip: 'sd:works', volume: 0.2, duck: 0.25 });
export const SD_AIR_HUM = Object.freeze({ loop: 'sdair:hum', clip: 'sd:hum', volume: 0.7, refDistance: 8, maxDistance: 50, distanceModel: 'linear' });
export const SD_AIR_GEARS = Object.freeze({ loop: 'sdair:gears', clip: 'sd:gears', voice: GRIND, volume: 0.5, pitch: 0.55, refDistance: 12, maxDistance: 70, distanceModel: 'linear' });
export const SD_AIR_HUM_AT = Object.freeze(realmToDungeon(SD_ORRERY.x, 3, SD_ORRERY.z));
export const SD_AIR_GEARS_AT = Object.freeze(realmToDungeon(SD_ARENA.x, -1, SD_ARENA.z));
// Every `slot` must divide `SD_SKY_PERIOD`, because the period's events are built once and replayed each period.
export const SD_AIR_EVENTS = Object.freeze({
  toll: Object.freeze({ slot: 24, chance: 0.5, clip: BELL, volume: [0.25, 0.45], pitch: [0.38, 0.5], lift: 20 }),
  gear: Object.freeze({ slot: 12, chance: 0.45, clip: CLUNK, volume: [0.2, 0.35], pitch: [0.55, 0.85], lift: -25 }),
  moan: Object.freeze({ slot: 30, chance: 0.4, clip: SOUND.AmbientWindMoanDeep, volume: [0.2, 0.35], pitch: [0.45, 0.6], lift: -15 }),
  grind: Object.freeze({ slot: 36, chance: 0.5, clip: GRIND, volume: [0.15, 0.3], pitch: [0.3, 0.42], lift: 35 }),
});
export const SD_AIR_RATE = 22050;
export const SD_WORKS_SECONDS = 2;
export const SD_HUM_SECONDS = 8;
export const SD_VOID_SECONDS = 23;
export const SD_GEARS_SECONDS = 13;
const WORKS_RMS = 0.05, HUM_RMS = 0.06;
export const SD_WORKS_TICK = Object.freeze([0.8, 0.6]);

const hash01 = (n) => { let x = Math.imul((n | 0) ^ 0x51ed270b, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
/**
 * @param {number[]} r
 * @param {number} u
 */
const span = (r, u) => r[0] + (r[1] - r[0]) * u;

/**
 * @param {Float32Array | null | undefined} clunk
 * @param {Float32Array | null | undefined} grind
 */
export function buildHourWorks(clunk, grind, { srcRate = SND_RATE, rate = SD_AIR_RATE, seconds = SD_WORKS_SECONDS } = {}) {
  const out = new Float32Array(Math.round(rate * seconds));
  if (clunk?.length) {
    addVoice(out, rate, clunk, srcRate, { ratio: SD_WORKS_TICK[0], offset: 0, gain: 1, wrap: true });
    addVoice(out, rate, clunk, srcRate, { ratio: SD_WORKS_TICK[1], offset: seconds / 2, gain: 0.8, wrap: true });
  }
  if (grind?.length) addVoice(out, rate, grind, srcRate, { ratio: 0.5, offset: seconds * 0.3, gain: 0.12, wrap: true });
  lowpassLoop(out, rate, 2500);
  return level(out, WORKS_RMS);
}

/** @param {Float32Array | null | undefined} bell */
export function buildOrreryHum(bell, { srcRate = SND_RATE, rate = SD_AIR_RATE, seconds = SD_HUM_SECONDS } = {}) {
  const out = new Float32Array(Math.round(rate * seconds));
  if (bell?.length) {
    addVoice(out, rate, bell, srcRate, { ratio: 0.25, offset: 0, gain: 1, wrap: true });
    addVoice(out, rate, bell, srcRate, { ratio: 0.375, offset: seconds * 0.34, gain: 0.6, wrap: true });
    addVoice(out, rate, bell, srcRate, { ratio: 0.5, offset: seconds * 0.64, gain: 0.4, wrap: true });
  }
  lowpassLoop(out, rate, 700);
  for (let i = 0; i < out.length; i++) out[i] *= 1 - 0.25 * (0.5 - 0.5 * Math.cos((2 * Math.PI * 2 * i) / out.length));
  return level(out, HUM_RMS);
}

export function layBed(voice, { srcRate, rate, seconds, n, pitch, spread, seed, hz, fade = 0.4 }) {
  const out = new Float32Array(Math.round(rate * seconds));
  if (!voice?.length) return out;
  for (let i = 0; i < n; i++) {
    const ratio = pitch * (1 + spread * (hash01(seed + i * 7) * 2 - 1)), len = voice.length / srcRate / ratio;
    addVoice(out, rate, voice, srcRate, { ratio, offset: ((i + hash01(seed + i * 7 + 3)) / n) * seconds, gain: 0.6 + 0.4 * hash01(seed + i * 7 + 5), wrap: true, fadeIn: len * fade, fadeOut: len * fade });
  }
  lowpassLoop(out, rate, hz);
  return level(out, rms(voice));
}
/** @param {Float32Array | null | undefined} moan */
export function buildVoidWind(moan, { srcRate = SND_RATE, rate = SD_AIR_RATE, seconds = SD_VOID_SECONDS } = {}) {
  return layBed(moan, { srcRate, rate, seconds, n: 12, pitch: SD_AIR_VOID.pitch, spread: 0.12, seed: 0x766f6964, hz: 900 });
}
/** @param {Float32Array | null | undefined} grind */
export function buildArenaGears(grind, { srcRate = SND_RATE, rate = SD_AIR_RATE, seconds = SD_GEARS_SECONDS } = {}) {
  return layBed(grind, { srcRate, rate, seconds, n: 9, pitch: SD_AIR_GEARS.pitch, spread: 0.08, seed: 0x67656172, hz: 1400 });
}

function slotsOver(from, to, slotS) {
  const n = Math.round(SD_SKY_PERIOD / slotS), out = [];
  for (let k = Math.floor((from - slotS) / slotS); k <= Math.floor(to / slotS); k++) out.push([k * slotS, ((k % n) + n) % n]);
  return out;
}

export function sdAirEvents(from, to) {
  const out = [];
  if (!(to > from) || !Number.isFinite(from) || !Number.isFinite(to)) return out;
  let salt = 0;
  for (const [kind, E] of Object.entries(SD_AIR_EVENTS)) {
    salt += 1;
    for (const [base, s] of slotsOver(from, to, E.slot)) {
      const h = (j) => hash01(s * 97 + salt * 13 + j);
      if (h(0) >= E.chance) continue;
      const t = base + h(1) * (E.slot - 2);
      if (!(t > from && t <= to)) continue;
      out.push({ t, kind, clip: E.clip, volume: span(E.volume, h(2)), pitch: span(E.pitch, h(3)), az: (h(4) * 2 - 1) * Math.PI, lift: E.lift });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

export function sdAirWindGain(seconds) {
  const u = ((((seconds % SD_SKY_PERIOD) + SD_SKY_PERIOD) % SD_SKY_PERIOD) / SD_SKY_PERIOD) * SD_AIR_VOID.breathTurns * 2 * Math.PI;
  return SD_AIR_VOID.volume * (1 - SD_AIR_VOID.depth * (0.5 - 0.5 * Math.sin(u)));
}

let _heard = null;
export const SD_AIR_FAR = 'sdAir';
let _period = null;
const periodEvents = () => (_period ??= Object.freeze(sdAirEvents(0, SD_SKY_PERIOD)));

export function createSdAir(engine = defaultAudio) {
  let last = null, on = false, made = false, duck = 1;
  let built = null;
  _heard?.stop();
  const make = () => {
    if (made || !engine?.registerSamples || !engine?.samplesOf) return made;
    try {
      if (!built) {
        const clunk = engine.samplesOf(CLUNK), bell = engine.samplesOf(BELL), grind = engine.samplesOf(GRIND), moan = engine.samplesOf(SD_AIR_VOID.voice);
        if (!clunk || !bell || !grind || !moan) return false;
        built = [[SD_AIR_WORKS.clip, buildHourWorks(clunk, grind)], [SD_AIR_HUM.clip, buildOrreryHum(bell)], [SD_AIR_VOID.clip, buildVoidWind(moan)], [SD_AIR_GEARS.clip, buildArenaGears(grind)]];
      }
      made = true;
      for (const [key, samples] of built) made = made && !!engine.registerSamples(key, samples, SD_AIR_RATE);
      if (made) built = null;
    } catch { made = false; }
    return made;
  };
  return _heard = {
    get on() { return on; },
    frame(seconds, ear) {
      if (!Number.isFinite(seconds) || !Array.isArray(ear) || ear.length !== 3) return;
      try {
        if (make()) {
          const dt = last != null && seconds > last ? Math.min(1, seconds - last) : 1;
          duck += ((spanAt(ear[2] - SD_REALM_ORIGIN[2]) === 1 ? SD_AIR_WORKS.duck : 1) - duck) * Math.min(1, dt * 3);
          engine.setBed(SD_AIR_VOID.loop, SD_AIR_VOID.clip, { volume: sdAirWindGain(seconds) });
          engine.setBed(SD_AIR_WORKS.loop, SD_AIR_WORKS.clip, { volume: SD_AIR_WORKS.volume * duck });
          engine.setBed3d(SD_AIR_HUM.loop, SD_AIR_HUM.clip, SD_AIR_HUM_AT, { volume: SD_AIR_HUM.volume, refDistance: SD_AIR_HUM.refDistance, maxDistance: SD_AIR_HUM.maxDistance, distanceModel: SD_AIR_HUM.distanceModel });
          engine.setBed3d(SD_AIR_GEARS.loop, SD_AIR_GEARS.clip, SD_AIR_GEARS_AT, { volume: SD_AIR_GEARS.volume, refDistance: SD_AIR_GEARS.refDistance, maxDistance: SD_AIR_GEARS.maxDistance, distanceModel: SD_AIR_GEARS.distanceModel });
        }
        on = true;
        if (last != null && seconds > last && seconds - last <= AIR_BACKLOG_S) {
          // This relies on `AIR_BACKLOG_S` being shorter than `SD_SKY_PERIOD`, so no event plays twice in one
          // frame.
          const E = periodEvents(), P = SD_SKY_PERIOD, from = last - Math.floor(last / P) * P, to = from + (seconds - last);
          for (let i = 0; i < E.length; i++) {
            const e = E[i];
            if ((e.t > from && e.t <= to) || (e.t + P > from && e.t + P <= to)) engine.play3d(e.clip, airSourceAt(ear, e.az, e.lift), e.volume, { refDistance: THUNDER_SOURCE_M, pitch: e.pitch, far: SD_AIR_FAR });
          }
        }
      } catch { }
      last = seconds;
    },
    stop() {
      last = null;
      if (!on) return;
      on = false;
      duck = 1;
      try {
        engine.setBed(SD_AIR_VOID.loop, null);
        engine.setBed(SD_AIR_WORKS.loop, null);
        engine.setBed3d(SD_AIR_HUM.loop, null, null);
        engine.setBed3d(SD_AIR_GEARS.loop, null, null);
        engine.fadeFar?.(SD_AIR_FAR);
      } catch { }
    },
  };
}
