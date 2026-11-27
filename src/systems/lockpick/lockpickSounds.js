// @ts-check
import { APP_ROOT } from '../../platform/appRoot.js';
import { enhancedSoundsOn } from '../../audio/enhancedSounds.js';
import { SOUND } from '../../audio/soundClips.js';

export const LOCK_SFX = Object.freeze({
  tick: Object.freeze(['lock:tick-1', 'lock:tick-2']),
  spring: Object.freeze(['lock:spring']),
  set: Object.freeze(['lock:set']),
  false: Object.freeze(['lock:false']),
  slip: Object.freeze(['lock:slip']),
  snap: Object.freeze(['lock:snap']),
});
export const LOCK_SFX_FILES = Object.freeze(Object.fromEntries(
  Object.values(LOCK_SFX).flat().map((key) => [key, `${key.replace(':', '-')}.wav`]),
));
export const LOCK_CUES = Object.freeze({
  lift: Object.freeze(['tick', 0.55]), springy: Object.freeze(['spring', 0.5]), set: Object.freeze(['set', 0.75]),
  open: Object.freeze(['set', 0.8]), 'false-set': Object.freeze(['false', 0.7]), slip: Object.freeze(['slip', 0.6]),
  break: Object.freeze(['snap', 0.85]), already: Object.freeze(['tick', 0.3]),
});
export const LOCK_CLASSIC_CUES = Object.freeze({
  set: SOUND.ButtonClick, open: SOUND.ButtonClick, 'false-set': SOUND.ButtonClick, break: SOUND.Parry6, slip: SOUND.EquipShortBlade,
});
export const LOCK_PITCH_JITTER = 0.05;

export const lockSfxUrl = (file) => new URL(`sfx/${file}`, APP_ROOT ?? globalThis.document?.baseURI ?? 'http://localhost/').href;
let _install = null;
export function installLockSounds(audio, { fetchBytes = null } = {}) {
  if (!audio?.registerSound) return Promise.resolve(0);
  return (_install ??= (async () => {
    const load = fetchBytes ?? (async (file) => {
      const r = await fetch(lockSfxUrl(file));
      if (!r.ok) throw new Error(`${file}: ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    });
    let n = 0;
    for (const [key, file] of Object.entries(LOCK_SFX_FILES)) {
      try { if (await audio.registerSound(key, await load(file))) n++; } catch { }
    }
    return n;
  })());
}
export function _resetLockSounds() { _install = null; }

/** @param {{ audio?: any, on?: () => boolean, rand?: () => number }} [o] */
export function createLockEar({ audio = null, on = enhancedSoundsOn, rand = Math.random } = {}) {
  let prev = null;
  if (audio && on()) installLockSounds(audio);
  return {
    /** @param {string|null} answer */
    cue(answer) {
      if (!audio || !answer) return null;
      if (!on()) {
        const clip = LOCK_CLASSIC_CUES[/** @type {keyof typeof LOCK_CLASSIC_CUES} */ (answer)];
        if (clip == null) return null;
        audio.playOneShot?.(clip, 0.6);
        return clip;
      }
      const c = LOCK_CUES[/** @type {keyof typeof LOCK_CUES} */ (answer)];
      if (!c) return null;
      installLockSounds(audio);
      const keys = LOCK_SFX[/** @type {keyof typeof LOCK_SFX} */ (c[0])];
      let key = keys[Math.floor(rand() * keys.length) % keys.length];
      if (keys.length > 1 && key === prev) key = keys[(keys.indexOf(key) + 1) % keys.length];
      prev = key;
      audio.playOneShot?.(key, c[1], 1 + LOCK_PITCH_JITTER * (2 * rand() - 1));
      return key;
    },
  };
}
