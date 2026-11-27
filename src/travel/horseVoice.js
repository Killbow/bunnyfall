// @ts-check

import { SOUND } from '../audio/soundClips.js';
import { FOOTSTEP_KIND } from '../audio/footsteps.js';
import { RIDING_SOUND } from './riding.js';
import { APP_ROOT } from '../platform/appRoot.js';
import { createClipInstaller, CLIP_RETRY_MS } from '../audio/soundscape/clipInstall.js';

export const HORSE_SFX = Object.freeze({
  snort: Object.freeze(['horse:snort-1', 'horse:snort-2', 'horse:snort-3']),
  blow: Object.freeze(['horse:blow-1', 'horse:blow-2']),
  breath: Object.freeze(['horse:breath-1', 'horse:breath-2', 'horse:breath-3']),
  spook: 'horse:spook',
  hooves: Object.freeze({
    soft: Object.freeze({ slow: 'horse:soft-slow', fast: 'horse:soft-fast' }),
    snow: Object.freeze({ slow: 'horse:snow-slow', fast: 'horse:snow-fast' }),
    water: Object.freeze({ slow: 'horse:water-slow', fast: 'horse:water-fast' }),
  }),
});
export const HORSE_SFX_FILES = Object.freeze(Object.fromEntries([
  ...HORSE_SFX.snort, ...HORSE_SFX.blow, ...HORSE_SFX.breath, HORSE_SFX.spook,
  ...Object.values(HORSE_SFX.hooves).flatMap((g) => [g.slow, g.fast]),
].map((key) => [key, `${key.replace(':', '-')}.wav`])));

export const NEIGH_PITCHES = Object.freeze([0.94, 1, 1.05, 1.1]);
export const MOUNT_WHINNY_PITCH = 1.08;
export const SPOOK_NEIGH_PITCH = 1.14;
export const SPOOK_NEIGH_LAG_S = 0.38;
export const SPOOK_COOLDOWN_S = 30;
export const FOE_SAMPLE_S = 0.25;
export const GALLOP_BREATH_AFTER_S = 8;
export const GALLOP_BREATH_S = 0.52;
export const GALLOP_BREATH_JITTER = 0.06;
export const GALLOP_EFFORT_S = 20;
export const GALLOP_BREATH_GAIN = Object.freeze([0.45, 0.8]);
export const BREATH_TIRED = 0.4;
export const RECOVER_SHARE = 0.4;
export const RECOVER_MAX_S = 14;
export const TIRED_BREATH_S = Object.freeze([2.2, 3.4]);
export const TIRED_BREATH_GAIN = 0.62;
export const BLOW_EVERY = 3;
export const VOICE_GAIN = Object.freeze({ neigh: 1, snort: 0.85, blow: 0.8, spook: 1 });
export const HORSE_MOODS = Object.freeze({
  alarm: Object.freeze({ neigh: 0.5, snort: 0.5 }),
  tired: Object.freeze({ blow: 0.5, snort: 0.3, neigh: 0.2 }),
  gallop: Object.freeze({ neigh: 0.35, snort: 0.45, blow: 0.2 }),
  calm: Object.freeze({ snort: 0.45, blow: 0.35, neigh: 0.2 }),
  ride: Object.freeze({ neigh: 0.4, snort: 0.4, blow: 0.2 }),
});
export const ALARM_SNORT_PITCH = 1.08;

export function hoofSurface(kind) {
  if (kind === FOOTSTEP_KIND.Outside) return 'soft';
  if (kind === FOOTSTEP_KIND.Snow) return 'snow';
  if (kind === FOOTSTEP_KIND.Submerged || kind === FOOTSTEP_KIND.Shallow) return 'water';
  return 'hard';
}

export const horseSoundReady = (key) => _installer.has(key) || !!_testInstaller?.has(key);

export function hoofClipFor(clip, kind, ready = horseSoundReady) {
  const surface = hoofSurface(kind);
  const gait = clip === RIDING_SOUND.horseSlow ? 'slow' : clip === RIDING_SOUND.horseFast ? 'fast' : null;
  const key = surface === 'hard' || !gait ? null : HORSE_SFX.hooves[surface][gait];
  return key && ready(key) ? key : SOUND[/** @type {keyof typeof SOUND} */ (clip)];
}

export function horseMood({ alarm = false, tired = false, galloping = false, slow = false, moving = true } = {}) {
  if (alarm) return 'alarm';
  if (tired) return 'tired';
  if (galloping) return 'gallop';
  if (slow || !moving) return 'calm';
  return 'ride';
}

export function pickOther(list, last, roll) {
  const pool = list.length > 1 ? list.filter((x) => x !== last) : list;
  return pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))];
}

/**
 * @param {string} mood
 * @param {number} roll
 * @param {(kind: string) => boolean} [has]
 */
export function pickKind(mood, roll, has = () => true) {
  const weights = Object.entries(HORSE_MOODS[mood] ?? HORSE_MOODS.ride).filter(([k]) => k === 'neigh' || has(k));
  const sum = weights.reduce((a, [, w]) => a + w, 0);
  let at = roll * sum;
  for (const [k, w] of weights) { if (at < w) return k; at -= w; }
  return weights[weights.length - 1][0];
}

export function createHorseVoice({ rolls = Math.random } = {}) {
  let now = 0, whinnyDue = false, gallopFor = 0, recover = 0, breathAt = 0, tiredAt = 0, tiredCount = 0;
  let foes = false, foeAskAt = 0, spookAt = -Infinity, held = false, quiet = false;
  /** @type {Record<string, any>} */
  const last = {};
  /** @type {{ at: number, clip: any, volume: number, pitch: number }[]} */
  let queue = [];
  const say = (out, clip, volume, pitch = 1) => out.push({ clip, volume, pitch });
  const one = (role, ready) => {
    const list = /** @type {readonly string[]} */ (/** @type {any} */ (HORSE_SFX)[role]).filter((k) => ready(k));
    if (!list.length) return null;
    const k = pickOther(list, last[role], rolls());
    last[role] = k;
    return k;
  };
  return {
    get now() { return now; },
    get gallopFor() { return gallopFor; },
    get recover() { return recover; },
    get pending() { return queue.length; },
    mount(riding = true) {
      whinnyDue = !!riding;
      gallopFor = 0; recover = 0; tiredCount = 0;
      foes = false; foeAskAt = 0; held = false;
      if (queue.length) queue = [];
    },
    hush() {
      if (quiet) return;
      quiet = true;
      this.mount(false);
    },
    update(dt, { neigh = false, clip = null, moving = false, running = false, pitch = 1, paused = false, breath = null, winded = false, foesNear = null, ready = horseSoundReady } = {}) {
      /** @type {{ clip: any, volume: number, pitch: number }[]} */
      const out = [];
      quiet = false;
      // A neigh due during a pause is held and played on the first unpaused frame.
      if (paused) { held ||= !!neigh; return out; }
      neigh = !!neigh || held;
      held = false;
      now += Math.max(0, Number(dt) || 0);
      if (queue.length) {
        for (const e of queue) if (e.at <= now) say(out, e.clip, e.volume, e.pitch);
        queue = queue.filter((e) => e.at > now);
      }
      const galloping = !!moving && !!running && clip === RIDING_SOUND.horseFast;
      if (galloping) { if (gallopFor === 0) breathAt = now + GALLOP_BREATH_S / (Number(pitch) > 0 ? pitch : 1); gallopFor += dt; recover = 0; }
      else {
        if (gallopFor >= GALLOP_BREATH_AFTER_S) { recover = Math.min(RECOVER_MAX_S, gallopFor * RECOVER_SHARE); tiredAt = now + TIRED_BREATH_S[0]; }
        gallopFor = 0;
        recover = Math.max(0, recover - dt);
      }
      const short = breath != null && (!!winded || breath < BREATH_TIRED);
      const tired = short || recover > 0;
      if (typeof foesNear === 'function' && now >= foeAskAt) {
        foeAskAt = now + FOE_SAMPLE_S;
        const seen = !!foesNear();
        if (seen && !foes && now - spookAt >= SPOOK_COOLDOWN_S && ready(HORSE_SFX.spook)) {
          spookAt = now;
          say(out, HORSE_SFX.spook, VOICE_GAIN.spook);
          queue.push({ at: now + SPOOK_NEIGH_LAG_S, clip: SOUND.AnimalHorse, volume: VOICE_GAIN.neigh * 0.9, pitch: SPOOK_NEIGH_PITCH });
        }
        foes = seen;
      }
      if (galloping && (gallopFor >= GALLOP_BREATH_AFTER_S || short) && now >= breathAt) {
        breathAt = now + (GALLOP_BREATH_S / (Number(pitch) > 0 ? pitch : 1)) * (1 + GALLOP_BREATH_JITTER * (2 * rolls() - 1));
        const effort = Math.min(1, Math.max(Math.max(0, gallopFor - GALLOP_BREATH_AFTER_S) / GALLOP_EFFORT_S, breath != null ? 1 - breath : 0));
        const k = one('breath', ready);
        if (k) say(out, k, GALLOP_BREATH_GAIN[0] + (GALLOP_BREATH_GAIN[1] - GALLOP_BREATH_GAIN[0]) * effort);
      }
      if (!galloping && tired && now >= tiredAt) {
        tiredAt = now + TIRED_BREATH_S[0] + (TIRED_BREATH_S[1] - TIRED_BREATH_S[0]) * rolls();
        tiredCount++;
        const k = tiredCount % BLOW_EVERY === 0 ? one('blow', ready) : one('breath', ready);
        if (k) say(out, k, TIRED_BREATH_GAIN, 0.92);
      }
      if (neigh) {
        if (whinnyDue) { whinnyDue = false; say(out, SOUND.AnimalHorse, VOICE_GAIN.neigh, MOUNT_WHINNY_PITCH); }
        else {
          const mood = horseMood({ alarm: foes, tired, galloping, slow: clip === RIDING_SOUND.horseSlow, moving });
          const kind = pickKind(mood, rolls(), (k) => /** @type {readonly string[]} */ (/** @type {any} */ (HORSE_SFX)[k] ?? []).some((key) => ready(key)));
          if (kind === 'neigh') {
            const p = mood === 'alarm' ? NEIGH_PITCHES[NEIGH_PITCHES.length - 1] : pickOther(NEIGH_PITCHES, last.neigh, rolls());
            last.neigh = p;
            say(out, SOUND.AnimalHorse, VOICE_GAIN.neigh, p);
          } else {
            const k = one(kind, ready);
            if (k) say(out, k, /** @type {any} */ (VOICE_GAIN)[kind], mood === 'alarm' && kind === 'snort' ? ALARM_SNORT_PITCH : 1);
          }
        }
      }
      return out;
    },
  };
}

export const horseSfxUrl = (file) => new URL(`sfx/${file}`, APP_ROOT ?? globalThis.document?.baseURI ?? 'http://localhost/').href;

export const INSTALL_RETRY_MS = CLIP_RETRY_MS[0];
const _installer = createClipInstaller(HORSE_SFX_FILES, { urlOf: horseSfxUrl });
/** @type {ReturnType<typeof createClipInstaller> | null} */
let _testInstaller = null;
export function installHorseSounds(audio, { fetchBytes = null, now = null } = {}) {
  if (!fetchBytes && !now) return _installer.install(audio);
  _testInstaller ??= createClipInstaller(HORSE_SFX_FILES, { urlOf: horseSfxUrl, fetchBytes, now: now ?? (() => Date.now()) });
  return _testInstaller.install(audio);
}
export function _resetHorseSounds() { _installer._reset(); _testInstaller = null; }
