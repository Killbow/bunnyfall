// @ts-check
import { ENEMY_BASICS } from '../characters/enemyBasics.js';
import { NAVAL_CLASSIC } from '../systems/naval/navalSounds.js';

// Rows 41 and 42 of `ENEMY_BASICS` are the Dreugh and the Lamia, whose classic sound records the serpent reuses.
export const SERPENT_VOICE_ROWS = Object.freeze({ dreugh: 41, lamia: 42 });
const DREUGH = ENEMY_BASICS[SERPENT_VOICE_ROWS.dreugh], LAMIA = ENEMY_BASICS[SERPENT_VOICE_ROWS.lamia];
const cue = (clip, pitch, volume, refDistance, maxDistance) => Object.freeze({ clip, pitch, volume, refDistance, maxDistance });

export const SERPENT_SOUNDS = Object.freeze({
  roar: cue(DREUGH.barkSound, 0.42, 2.2, 60, 3200),
  hiss: cue(LAMIA.attackSound, 0.55, 1.6, 30, 1400),
  bubbles: cue(NAVAL_CLASSIC.bubbles, 0.55, 1.8, 30, 1400),
  breach: cue(NAVAL_CLASSIC.splashLarge, 0.48, 2.3, 50, 2400),
  lash: cue(NAVAL_CLASSIC.splashLarge, 0.68, 1.9, 40, 1800),
  splash: cue(NAVAL_CLASSIC.splashSmall, 0.8, 1.3, 14, 700),
  death: cue(DREUGH.barkSound, 0.3, 2.6, 90, 4200),
});

export function playSerpentSound(audio, key, pos, vol = 1) {
  const c = SERPENT_SOUNDS[/** @type {keyof typeof SERPENT_SOUNDS} */ (key)];
  if (!c || !audio?.play3d || !pos) return false;
  try { audio.play3d(c.clip, pos, c.volume * vol, { refDistance: c.refDistance, maxDistance: c.maxDistance, pitch: c.pitch }); } catch { return false; }
  return true;
}
