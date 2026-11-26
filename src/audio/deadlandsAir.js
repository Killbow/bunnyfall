// @ts-check
import { audio as defaultAudio } from './audio.js';
import { SOUND } from './soundClips.js';
import { AMBIENT_SOUNDS } from './ambientEffects.js';
import { SPEED_OF_SOUND, THUNDER_SOURCE_M } from '../weather/distantStorms.js';
import { DEAD_CLOCK_PERIOD, FLASH_SLOT_S, FLASH_DIST, LIFE_BRAZIERS_MAX, deadClock, flashOfSlot } from '../render/deadlands.js';

const [, CLIP_THUNDER, CLIP_ROLL] = AMBIENT_SOUNDS.storm;
export const CLIP_ROAR = 73;

export const AIR_WIND = Object.freeze({ loop: 'deadlands:wind', clip: SOUND.AmbientWindMoanDeep, volume: 0.3, pitch: 0.74, breathTurns: 20, depth: 0.35 });
export const AIR_SEA = Object.freeze({ loop: 'deadlands:sea', clip: SOUND.Burning, volume: 0.26, pitch: 0.42 });
export const AIR_BRAZIER = Object.freeze({ loop: 'deadlands:brazier:', clip: SOUND.Burning, volume: 0.6, pitch: 0.9, refDistance: 1.5, maxDistance: 12, distanceModel: 'linear' });
export const THUNDER_CRACK_NEAR_M = 1100;
export const THUNDER_VOLUME = Object.freeze([1.05, 0.5]);
export const THUNDER_PITCH = 0.86;
export const ROAR_SLOT_S = 30;
export const ROAR_CHANCE = 0.55;
export const PLOP_SLOT_S = 4;
export const PLOP_CHANCE = 0.5;
export const AIR_BACKLOG_S = 2;

const hash01 = (n) => { let x = Math.imul((n | 0) ^ 0x2545f491, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };

function slotsOver(from, to, slotS, late) {
  const n = Math.round(DEAD_CLOCK_PERIOD / slotS);
  const out = [];
  for (let k = Math.floor((from - late) / slotS); k <= Math.floor(to / slotS); k++) out.push([k * slotS, ((k % n) + n) % n]);
  return out;
}

export function deadlandsAirEvents(from, to) {
  const out = [];
  if (!(to > from) || !Number.isFinite(from) || !Number.isFinite(to)) return out;
  const lateMax = FLASH_DIST[1] / SPEED_OF_SOUND + FLASH_SLOT_S;
  for (const [base, s] of slotsOver(from, to, FLASH_SLOT_S, lateMax)) {
    // Thunder reads the sky's own strikes, never a roll of its own, so each strike and its thunder match.
    const f = flashOfSlot(s);
    if (!f) continue;
    const t = base + (f.at - s * FLASH_SLOT_S) + f.dist / SPEED_OF_SOUND;
    if (!(t > from && t <= to)) continue;
    const far = (f.dist - FLASH_DIST[0]) / (FLASH_DIST[1] - FLASH_DIST[0]);
    out.push({ t, kind: 'thunder', clip: f.dist < THUNDER_CRACK_NEAR_M ? CLIP_THUNDER : CLIP_ROLL, volume: THUNDER_VOLUME[0] + (THUNDER_VOLUME[1] - THUNDER_VOLUME[0]) * far, pitch: THUNDER_PITCH, az: f.az, lift: 6 });
  }
  for (const [base, s] of slotsOver(from, to, ROAR_SLOT_S, ROAR_SLOT_S)) {
    if (hash01(s * 5 + 1) >= ROAR_CHANCE) continue;
    const t = base + hash01(s * 5 + 2) * (ROAR_SLOT_S - 6);
    if (!(t > from && t <= to)) continue;
    out.push({ t, kind: 'roar', clip: CLIP_ROAR, volume: 0.3 + hash01(s * 5 + 3) * 0.3, pitch: 0.5 + hash01(s * 5 + 4) * 0.22, az: (hash01(s * 5 + 5) * 2 - 1) * Math.PI, lift: 2 });
  }
  for (const [base, s] of slotsOver(from, to, PLOP_SLOT_S, PLOP_SLOT_S)) {
    if (hash01(s * 7 + 11) >= PLOP_CHANCE) continue;
    const t = base + hash01(s * 7 + 12) * PLOP_SLOT_S;
    if (!(t > from && t <= to)) continue;
    out.push({ t, kind: 'plop', clip: SOUND.SplashLarge, volume: 0.1 + hash01(s * 7 + 13) * 0.16, pitch: 0.34 + hash01(s * 7 + 14) * 0.2, az: (hash01(s * 7 + 15) * 2 - 1) * Math.PI, lift: -8 });
  }
  return out.sort((a, b) => a.t - b.t);
}

export function airSourceAt(ear, az, lift) {
  return [ear[0] + Math.sin(az) * THUNDER_SOURCE_M, ear[1] + lift, ear[2] - Math.cos(az) * THUNDER_SOURCE_M];
}

export function airWindGain(seconds) {
  const u = (deadClock(seconds) / DEAD_CLOCK_PERIOD) * AIR_WIND.breathTurns * 2 * Math.PI;
  return AIR_WIND.volume * (1 - AIR_WIND.depth * (0.5 - 0.5 * Math.sin(u)));
}

let _heard = null;
export const AIR_FAR = 'deadlandsAir';

export function createDeadlandsAir(engine = defaultAudio) {
  let last = null;
  let on = false;
  let beds = 0;
  // A load from the court's pause menu boots a new host without stopping the old one, so the newest air
  // silences the last.
  _heard?.stop();
  return _heard = {
    get on() { return on; },
    frame(seconds, ear, braziers = []) {
      if (!Number.isFinite(seconds) || !Array.isArray(ear) || ear.length !== 3) return;
      try {
        engine.setBed(AIR_WIND.loop, AIR_WIND.clip, { volume: airWindGain(seconds), pitch: AIR_WIND.pitch });
        engine.setBed(AIR_SEA.loop, AIR_SEA.clip, { volume: AIR_SEA.volume, pitch: AIR_SEA.pitch });
        const lit = (Array.isArray(braziers) ? braziers : []).filter((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite)).slice(0, LIFE_BRAZIERS_MAX);
        lit.forEach((p, i) => engine.setBed3d(AIR_BRAZIER.loop + i, AIR_BRAZIER.clip, p, { volume: AIR_BRAZIER.volume, pitch: AIR_BRAZIER.pitch, refDistance: AIR_BRAZIER.refDistance, maxDistance: AIR_BRAZIER.maxDistance, distanceModel: AIR_BRAZIER.distanceModel }));
        for (let i = lit.length; i < beds; i++) engine.setBed3d(AIR_BRAZIER.loop + i, null, null);
        beds = lit.length;
        on = true;
        if (last != null && seconds > last && seconds - last <= AIR_BACKLOG_S) {
          for (const e of deadlandsAirEvents(last, seconds)) engine.play3d(e.clip, airSourceAt(ear, e.az, e.lift), e.volume, { refDistance: THUNDER_SOURCE_M, pitch: e.pitch, far: AIR_FAR });
        }
      } catch { }
      last = seconds;
    },
    stop() {
      last = null;
      if (!on) return;
      on = false;
      try {
        engine.setBed(AIR_WIND.loop, null);
        engine.setBed(AIR_SEA.loop, null);
        for (let i = 0; i < beds; i++) engine.setBed3d(AIR_BRAZIER.loop + i, null, null);
        engine.fadeFar?.(AIR_FAR);
      } catch { }
      beds = 0;
    },
  };
}

