// @ts-check
import { SOUND } from '../../audio/soundClips.js';
import { SPEED_OF_SOUND } from '../../weather/distantStorms.js';

const cue = (clip, pitch, volume, refDistance = 0, maxDistance = 0) => Object.freeze({ clip, pitch, volume, refDistance, maxDistance });

export const STAR_SOUNDS = Object.freeze({
  omen: cue(SOUND.AmbientWindMoan, 1.7, 0.55),
  fall: cue(SOUND.Burning, 0.42, 0.9),
  impact: cue(SOUND.SpellImpactFire, 0.38, 2.4, 40, 1600),
  hum: cue(SOUND.AmbientWindMoanDeep, 1.35, 0.35, 6, 40),
  blow: cue(SOUND.SpellImpactMagic, 1.45, 0.7, 8, 70),
  master: cue(SOUND.SpookyMid, 0.6, 1.8, 30, 900),
  circle: cue(SOUND.SpellImpactMagic, 0.75, 1.3, 20, 400),
  held: cue(SOUND.Burning, 1.25, 1.4, 20, 600),
  dark: cue(SOUND.AmbientWindMoanDeep, 0.5, 1.6, 30, 900),
});

// The storms' speed of sound, so the stone's strike arrives with its thunder and never with its flash.
export const starHeardAfterMs = (/** @type {number} */ d) => (Math.max(0, Number.isFinite(d) ? d : 0) / SPEED_OF_SOUND) * 1000;

export function playStarSound(audio, key, pos = null, vol = 1) {
  const c = STAR_SOUNDS[/** @type {keyof typeof STAR_SOUNDS} */ (key)];
  if (!c || !audio) return false;
  try {
    if (!c.maxDistance || !pos) { if (!audio.playOneShot) return false; audio.playOneShot(c.clip, c.volume * vol, c.pitch); }
    else { if (!audio.play3d) return false; audio.play3d(c.clip, pos, c.volume * vol, { refDistance: c.refDistance, maxDistance: c.maxDistance, pitch: c.pitch }); }
  } catch { return false; }
  return true;
}
