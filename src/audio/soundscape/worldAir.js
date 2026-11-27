// @ts-check
import { audio as defaultAudio } from '../audio.js';
import { CLIMATES } from '../../formats/mapsTables.js';
import { ensureBed, ensureMade } from './soundJobs.js';
import { TOWN_BED_RATE } from './townBeds.js';
import { SCAPE_SFX } from './soundscapeSfx.js';
import { seaState } from './seaAir.js';
import { PEOPLE_RECORDS } from '../../arena/arenaSound.js';

const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

export const SURF = Object.freeze({ name: 'shore:surf', bed: 'shore:surf', max: 0.3, reach: 220, full: 8, floor: 0.22 });
export const LAP = Object.freeze({ name: 'shore:lap', bed: 'shore:lap', max: 0.16, reach: 14, state: 0.45 });
export const CRASH_REACH = 90;
export const CRASH_PEAK_S = Object.freeze([0.83, 1.0]);
export const BREAKER_PERIOD = Object.freeze([7, 11]);
export const BREAKER_CURL_S = 1.0;
export const BREAKER_RUN = 0.45;

export function surfReach(dist) {
  const d = Number(dist);
  if (!Number.isFinite(d) || d >= SURF.reach) return 0;
  if (d <= SURF.full) return 1;
  const fall = 1 / (1 + Math.pow((d - SURF.full) / 25, 1.5));
  return fall * Math.min(1, (SURF.reach - d) / 40);
}

export function breakerAt(u, period) {
  const t = Math.max(0, Number(u) || 0);
  if (t < BREAKER_CURL_S) return SURF.floor + (1 - SURF.floor) * Math.pow(t / BREAKER_CURL_S, 2);
  const run = Math.max(0.5, period * BREAKER_RUN);
  return SURF.floor + (1 - SURF.floor) * Math.exp(-(t - BREAKER_CURL_S) / (run / 3));
}

export const surfGain = (dist, state, env) => SURF.max * surfReach(dist) * (0.4 + 0.6 * clamp01(state)) * clamp01(env);
export const SURF_REF = 12;
export const surfEdgeGain = (dist, state, env) => (Number(dist) < SURF.reach ? SURF.max * Math.min(1, (SURF.reach - Number(dist)) / 40) * (0.4 + 0.6 * clamp01(state)) * clamp01(env) : 0);
export const lapGain = (dist, state) => (Number(dist) < LAP.reach && clamp01(state) < LAP.state ? LAP.max * (1 - Number(dist) / LAP.reach) * (1 - clamp01(state) / LAP.state) : 0);

/**
 * @typedef {{ kind: 'crow' | 'owl' | 'howl' | 'jackal' | 'frog', gap: readonly number[], dist: readonly number[], lift: readonly number[], volume: readonly number[], chorus?: number, id?: string }} WildVoice
 */
/** @param {WildVoice['kind']} kind @param {number[]} gap @param {number[]} dist @param {number[]} lift @param {number[]} volume @param {number} [chorus] @returns {WildVoice} */
const voice = (kind, gap, dist, lift, volume, chorus = 0) => Object.freeze({ kind, gap: Object.freeze(gap), dist: Object.freeze(dist), lift: Object.freeze(lift), volume: Object.freeze(volume), ...(chorus ? { chorus } : {}) });
const CROW = voice('crow', [25, 70], [20, 60], [8, 20], [0.3, 0.5]);
const CROW_OFTEN = voice('crow', [14, 40], [18, 55], [8, 20], [0.3, 0.5]);
const OWL = voice('owl', [25, 60], [18, 55], [6, 12], [0.2, 0.32]);
const OWL_SELDOM = voice('owl', [60, 150], [25, 60], [6, 12], [0.18, 0.28]);
const WOLF = voice('howl', [90, 240], [160, 420], [10, 30], [0.4, 0.6]);
const WOLF_OFTEN = voice('howl', [45, 120], [140, 380], [10, 30], [0.4, 0.65]);
const JACKAL = voice('jackal', [120, 300], [180, 420], [5, 15], [0.3, 0.45]);
const FROG_DAY = voice('frog', [8, 25], [6, 28], [-0.5, 0], [0.3, 0.5], 1);
const FROG_NIGHT = voice('frog', [1.5, 6], [5, 30], [-0.5, 0], [0.3, 0.55], 3);
const FROG_SELDOM = voice('frog', [10, 30], [8, 30], [-0.5, 0], [0.3, 0.45], 2);

export const WILD = Object.freeze({
  [CLIMATES.Woodlands]: Object.freeze({ day: [CROW], night: [OWL, WOLF], marsh: false }),
  [CLIMATES.MountainWoods]: Object.freeze({ day: [CROW], night: [OWL, WOLF_OFTEN], marsh: false }),
  [CLIMATES.Mountain]: Object.freeze({ day: [CROW], night: [WOLF_OFTEN, OWL_SELDOM], marsh: false }),
  [CLIMATES.HauntedWoodlands]: Object.freeze({ day: [CROW_OFTEN], night: [OWL, WOLF_OFTEN], marsh: false }),
  [CLIMATES.Swamp]: Object.freeze({ day: [FROG_DAY], night: [FROG_NIGHT, OWL_SELDOM], marsh: true }),
  [CLIMATES.Rainforest]: Object.freeze({ day: [FROG_DAY], night: [FROG_NIGHT, OWL_SELDOM], marsh: true }),
  [CLIMATES.Subtropical]: Object.freeze({ day: [CROW], night: [FROG_SELDOM, OWL_SELDOM], marsh: false }),
  [CLIMATES.Desert]: Object.freeze({ day: [], night: [JACKAL], marsh: false }),
  [CLIMATES.Desert2]: Object.freeze({ day: [], night: [JACKAL], marsh: false }),
});
export const MARSH = Object.freeze({ name: 'wild:marsh', bed: 'wild:marsh', day: 0.08, night: 0.13 });
export const TOWN_WILD_GAP = 3;
export const TOWN_WILD_FAR = 1.6;

/**
 * @param {number} climate
 * @param {{ night: boolean, weather: string, winter: boolean, inTown: boolean, desolate?: boolean }} now
 * @returns {WildVoice[]}
 */
export function wildVoicesFor(climate, { night, weather, winter, inTown, desolate = false }) {
  if (desolate) return [];
  const row = /** @type {Record<number, { day: WildVoice[], night: WildVoice[] }>} */ (WILD)[climate];
  if (!row) return [];
  const out = [];
  for (const [i, v] of (night ? row.night : row.day).entries()) {
    const frog = v.kind === 'frog';
    if (frog && (winter || weather === 'snow')) continue;
    if (!frog && (weather === 'rain' || weather === 'thunder') && v.kind !== 'howl') continue;
    if (weather === 'thunder' && !frog) continue;
    if (inTown && (frog || v.kind === 'howl' || v.kind === 'jackal')) continue;
    const k = (frog && (weather === 'rain' || weather === 'thunder') ? 0.5 : 1) * (inTown ? TOWN_WILD_GAP : 1);
    const far = inTown ? TOWN_WILD_FAR : 1;
    out.push({ ...v, gap: [v.gap[0] * k, v.gap[1] * k], dist: [v.dist[0] * far, v.dist[1] * far], id: `${night ? 'night' : 'day'}:${i}` });
  }
  return out;
}
export function marshGain(climate, { night, weather, winter, inTown }) {
  const row = /** @type {Record<number, { marsh: boolean }>} */ (WILD)[climate];
  if (!row?.marsh || inTown || winter || weather === 'snow') return 0;
  return (night ? MARSH.night : MARSH.day) * (weather === 'thunder' ? 0.4 : 1);
}

export const MURMUR = Object.freeze({ name: 'town:murmur', key: 'town:murmur', max: 0.22, open: 6.5, close: 21.5, busy: Object.freeze([10, 17]), blocks: 16 });
export const MURMUR_TWIN = Object.freeze({ name: 'town:murmur:2', pitch: 0.917 });
export const MURMUR_WEATHER = Object.freeze({ rain: 0.45, thunder: 0.2, snow: 0.6 });
export const SMITHY = Object.freeze({ reach: 45, open: 7, close: 19, blows: Object.freeze([3, 9]), beat: Object.freeze([0.55, 0.8]), rest: Object.freeze([5, 16]) });
export const TAVERN = Object.freeze({ name: 'town:tavern', key: 'town:tavern', reach: 35, day: 0.18, night: 0.5, small: 0.03, evening: 17, late: 2, opens: 10, ref: 4 });

const inHours = (h, from, to) => (from <= to ? h >= from && h < to : h >= from || h < to);
export function murmurGain(hour, blocks, weather) {
  const h = ((Number(hour) % 24) + 24) % 24;
  const { max, open, close, busy } = MURMUR;
  if (h < open || h >= close) return 0;
  const busyness = h < busy[0] ? (h - open) / (busy[0] - open) : h <= busy[1] ? 1 : (close - h) / (close - busy[1]);
  const size = Math.sqrt(clamp01((Number(blocks) || 1) / MURMUR.blocks));
  return max * clamp01(busyness) * size * (MURMUR_WEATHER[/** @type {keyof typeof MURMUR_WEATHER} */ (weather)] ?? 1);
}
export const smithAtWork = (hour) => inHours(((Number(hour) % 24) + 24) % 24, SMITHY.open, SMITHY.close);
export function tavernGain(hour) {
  const h = ((Number(hour) % 24) + 24) % 24;
  if (inHours(h, TAVERN.evening, TAVERN.late)) return TAVERN.night;
  return inHours(h, TAVERN.late, TAVERN.opens) ? TAVERN.small : TAVERN.day;
}

/** @param {any} engine */
const peopleOf = (engine) => { const v = PEOPLE_RECORDS.map((i) => engine?.samplesOf?.(i)).filter(Boolean); return v.length ? v : null; };
/**
 * @param {any} engine
 * @param {any} [opts]
 */
export function ensureTownBeds(engine, opts) {
  const job = (/** @type {string} */ kind) => () => { const voices = peopleOf(engine); return voices && { kind, voices }; };
  const murmur = ensureMade(engine, MURMUR.key, job('murmur'), TOWN_BED_RATE, opts);
  const tavern = ensureMade(engine, TAVERN.key, job('tavern'), TOWN_BED_RATE, opts);
  return murmur && tavern;
}

/**
 * @typedef {{ ear: number[], climate: number, night: boolean, hour: number, weather: string, wind: number, winter: boolean, desolate?: boolean,
 *   inTown: boolean, townBlocks: number, shore: { dist: number, dir: number[] | null, at?: number[] } | null, smithies: number[][],
 *   taverns: number[][], paused: boolean }} WorldFrame
 */
export const WORLD_AIR_FAR = 'worldAir';
const WILD_CLIPS = Object.freeze({ crow: SCAPE_SFX.crow, owl: SCAPE_SFX.owl, howl: SCAPE_SFX.howl, jackal: SCAPE_SFX.howl, frog: SCAPE_SFX.frog });
const WILD_PITCH = Object.freeze({ crow: [0.9, 1.1], owl: [0.94, 1.06], howl: [0.9, 1.05], jackal: [1.25, 1.45], frog: [0.85, 1.2] });

/** @param {() => number} rand @param {readonly number[]} r */
const between = (rand, r) => r[0] + (r[1] - r[0]) * rand();
/** @template T @param {() => number} rand @param {ReadonlyArray<T>} list @returns {T} */
const pick = (rand, list) => list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
const near = (ear, list, reach) => {
  let best = null, bd = reach;
  for (const p of list ?? []) { const d = Math.hypot(p[0] - ear[0], p[2] - ear[2]); if (d < bd) { bd = d; best = p; } }
  return best;
};

/** @param {{ engine?: any, rand?: () => number }} [opts] */
export function createWorldAir({ engine = defaultAudio, rand = Math.random } = {}) {
  let on = false, waveT = 0, period = BREAKER_PERIOD[0];
  /** @type {Map<string, number>} */
  let wildIn = new Map();
  let anvil = { blowsLeft: 0, next: 0 };
  /** @type {Array<{ at: number, play: () => void, kind?: string }>} */
  let due = [];
  let t = 0;
  const play3d = (clip, pos, volume, { pitch = 1, ref = 10, max = 500 } = {}) => {
    try { engine.play3d(clip, pos, volume, { refDistance: ref, maxDistance: max, pitch, far: WORLD_AIR_FAR }); } catch { }
  };
  const bed = (name, clip, volume, pitch = 1) => {
    try { engine.setBed(name, volume > 0.002 ? clip : null, { volume, pitch }); } catch { }
  };
  const bed3d = (name, clip, pos, volume, ref, max) => {
    try { engine.setBed3d(name, volume > 0.002 && pos ? clip : null, pos, { volume, refDistance: ref, maxDistance: max }); } catch { }
  };
  return {
    get on() { return on; },
    /** @param {number} dt @param {WorldFrame} w */
    frame(dt, w) {
      if (!w || !Array.isArray(w.ear) || w.ear.length !== 3) return;
      const step = Math.max(0, Math.min(0.25, Number(dt) || 0));
      // The clock for queued calls stops while paused, so calls queued before a pause do not all play on unpause.
      if (!w.paused) t += step;
      on = true;
      const state = seaState(w.wind, w.weather);
      const shore = w.shore && Number.isFinite(w.shore.dist) ? w.shore : null;
      if (shore && surfReach(shore.dist) > 0) {
        if (!w.paused) waveT += step;
        const edge = shore.at ?? (shore.dir ? [w.ear[0] + shore.dir[0] * shore.dist, w.ear[1] - 1, w.ear[2] + shore.dir[1] * shore.dist] : null);
        const dist = shore.at ? Math.hypot(shore.at[0] - w.ear[0], shore.at[2] - w.ear[2]) : shore.dist;
        if (waveT >= period) {
          waveT -= period;
          period = between(rand, BREAKER_PERIOD) * (1 - 0.33 * state);
          if (dist < CRASH_REACH && edge) {
            const k = Math.min(SCAPE_SFX.shoreCrash.length - 1, Math.floor(rand() * SCAPE_SFX.shoreCrash.length)), at = edge;
            // Each crash take starts early by its own peak time (CRASH_PEAK_S), so it peaks on the bed's crash.
            due.push({ at: t + Math.max(0, BREAKER_CURL_S - CRASH_PEAK_S[k]), play: () => play3d(SCAPE_SFX.shoreCrash[k], at, 0.35 + 0.5 * state, { pitch: between(rand, [0.94, 1.06]), ref: 12, max: 260 }) });
          }
        }
        if (ensureBed(engine, SURF.bed)) {
          const env = breakerAt(waveT, period);
          // At a known edge the panner applies the distance falloff, so the flat bed stays silent and the gain
          // never applies it twice.
          bed3d(SURF.name, SURF.bed, edge, edge ? surfEdgeGain(dist, state, env) : 0, SURF_REF, SURF.reach + 60);
          bed(SURF.name, SURF.bed, edge ? 0 : surfGain(dist, state, env));
        }
        if (ensureBed(engine, LAP.bed)) bed(LAP.name, LAP.bed, lapGain(dist, state));
      } else { bed(SURF.name, SURF.bed, 0); bed3d(SURF.name, SURF.bed, null, 0, 1, 1); bed(LAP.name, LAP.bed, 0); }
      const now = { night: !!w.night, weather: w.weather, winter: !!w.winter, inTown: !!w.inTown, desolate: !!w.desolate };
      const voices = wildVoicesFor(w.climate, now);
      const keep = new Map();
      for (const v of voices) {
        const id = `${w.climate}|${v.id}`;
        let left = wildIn.get(id) ?? between(rand, [v.gap[0] * 0.3, v.gap[0]]);
        if (!w.paused) left -= step;
        if (left <= 0) {
          const az = between(rand, [-Math.PI, Math.PI]), d = between(rand, v.dist), lift = between(rand, v.lift);
          const pos = [w.ear[0] + Math.sin(az) * d, w.ear[1] + lift, w.ear[2] + Math.cos(az) * d];
          const calls = v.chorus ? 1 + Math.floor(rand() * v.chorus) : 1;
          for (let k = 0; k < calls; k++) {
            const clip = pick(rand, WILD_CLIPS[v.kind]), pitch = between(rand, WILD_PITCH[v.kind]), vol = between(rand, v.volume);
            const p = k === 0 ? pos : [pos[0] + between(rand, [-6, 6]), pos[1], pos[2] + between(rand, [-6, 6])];
            if (k === 0) play3d(clip, p, vol, { pitch, ref: v.kind === 'howl' || v.kind === 'jackal' ? 60 : 10, max: 900 });
            else due.push({ at: t + between(rand, [0.15, 0.9]) * k, play: () => play3d(clip, p, vol * 0.85, { pitch, ref: 10, max: 900 }) });
          }
          left = between(rand, v.gap);
        }
        keep.set(id, left);
      }
      wildIn = keep;
      const marsh = w.desolate ? 0 : marshGain(w.climate, now);
      if (marsh > 0 ? ensureBed(engine, MARSH.bed) : true) bed(MARSH.name, MARSH.bed, marsh);
      const towned = !!w.inTown && ensureTownBeds(engine);
      const murmur = towned ? murmurGain(w.hour, w.townBlocks, w.weather) * Math.SQRT1_2 : 0;
      bed(MURMUR.name, MURMUR.key, murmur);
      // The murmur plays as two copies of one bed at different pitches, so their loop seams rarely line up.
      bed(MURMUR_TWIN.name, MURMUR.key, murmur, MURMUR_TWIN.pitch);
      const tavern = towned ? near(w.ear, w.taverns, TAVERN.reach) : null;
      bed3d(TAVERN.name, TAVERN.key, tavern ? [tavern[0], tavern[1] + 1, tavern[2]] : null, tavern ? tavernGain(w.hour) * (w.weather === 'thunder' ? 0.7 : 1) : 0, TAVERN.ref, TAVERN.reach + 15);
      const smithy = w.inTown && smithAtWork(w.hour) ? near(w.ear, w.smithies, SMITHY.reach) : null;
      if (smithy && !w.paused) {
        if ((anvil.next -= step) <= 0) {
          if (anvil.blowsLeft <= 0) anvil.blowsLeft = Math.round(between(rand, SMITHY.blows));
          play3d(SCAPE_SFX.anvil[0], [smithy[0], smithy[1] + 1, smithy[2]], between(rand, [0.45, 0.65]), { pitch: between(rand, [0.96, 1.04]), ref: 6, max: SMITHY.reach + 30 });
          anvil.blowsLeft--;
          anvil.next = anvil.blowsLeft > 0 ? between(rand, SMITHY.beat) : between(rand, SMITHY.rest);
          if (anvil.blowsLeft <= 0 && rand() < 0.25) due.push({ kind: 'anvil', at: t + between(rand, SMITHY.rest) * 0.5, play: () => play3d(SCAPE_SFX.anvil[1], [smithy[0], smithy[1] + 1, smithy[2]], 0.5, { ref: 6, max: SMITHY.reach + 30 }) });
        }
      } else if (!smithy) { anvil = { blowsLeft: 0, next: between(rand, [0.5, 3]) }; if (due.length) due = due.filter((d) => d.kind !== 'anvil'); }
      if (due.length) {
        const ready = due.filter((d) => d.at <= t);
        if (ready.length) { due = due.filter((d) => d.at > t); for (const d of ready) d.play(); }
      }
    },
    stop() {
      wildIn = new Map();
      due = [];
      anvil = { blowsLeft: 0, next: 0 };
      if (!on) return;
      on = false;
      try {
        for (const name of [SURF.name, LAP.name, MARSH.name, MURMUR.name, MURMUR_TWIN.name]) engine.setBed(name, null);
        for (const name of [SURF.name, TAVERN.name]) engine.setBed3d(name, null, null);
        engine.fadeFar?.(WORLD_AIR_FAR);
      } catch { }
    },
  };
}
