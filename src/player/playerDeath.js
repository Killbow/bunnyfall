import { EYE_HEIGHT, CAPSULE_HEIGHT } from './motor.js';
import { SOUND } from '../audio/soundClips.js';
import { RACES } from '../characters/races.js';
import { combatVoicesEnabled } from '../combat/combatVoices.js';

export const DEATH_FALL_SPEED = 2.5;
export const DEATH_TIME_BEFORE_RESET = 3;
export const DEATH_FADE_DURATION = 2;
export const CLASSIC_PLAYER_DEATH_SOUND = SOUND.WoodElfMalePain1;

const PAIN3 = Object.freeze({
  [RACES.Breton]: [SOUND.BretonMalePain3, SOUND.BretonFemalePain3],
  [RACES.Redguard]: [SOUND.RedguardMalePain3, SOUND.RedguardFemalePain3],
  [RACES.Nord]: [SOUND.NordMalePain3, SOUND.NordFemalePain3],
  [RACES.DarkElf]: [SOUND.DarkElfMalePain3, SOUND.DarkElfFemalePain3],
  [RACES.HighElf]: [SOUND.HighElfMalePain3, SOUND.HighElfFemalePain3],
  [RACES.WoodElf]: [SOUND.WoodElfMalePain3, SOUND.WoodElfFemalePain3],
  [RACES.Khajiit]: [SOUND.KhajiitMalePain3, SOUND.KhajiitFemalePain3],
  [RACES.Argonian]: [SOUND.ArgonianMalePain3, SOUND.ArgonianFemalePain3],
});
export const raceGenderPain3Sound = (race, gender) =>
  PAIN3[race]?.[gender === 'male' ? 0 : 1] ?? -1;

export function playerDeathSound(race, gender, voices = combatVoicesEnabled) {
  if (!voices()) return CLASSIC_PLAYER_DEATH_SOUND;
  const clip = raceGenderPain3Sound(race, gender);
  return clip >= 0 ? clip : CLASSIC_PLAYER_DEATH_SOUND;
}

export const deathCameraTarget = (capsuleHeight = CAPSULE_HEIGHT) =>
  capsuleHeight - capsuleHeight * 1.25;

export class PlayerDeathSequence {
  /**
   * @param {object} [deps]
   * @param {number} [deps.eyeHeight]
   * @param {number} [deps.capsuleHeight]
   * @param {function(number):void} [deps.playSound]
   * @param {function():void} [deps.onReset]
   * @param {number} [deps.race]
   * @param {string} [deps.gender]
   * @param {function():boolean} [deps.voices]
   */
  constructor({ eyeHeight = EYE_HEIGHT, capsuleHeight = CAPSULE_HEIGHT, playSound = null, onReset = null,
    race = null, gender = null, voices = combatVoicesEnabled } = {}) {
    this.startCameraHeight = eyeHeight;
    this.targetCameraHeight = deathCameraTarget(capsuleHeight);
    this.currentCameraHeight = eyeHeight;
    this.elapsed = 0;
    this.reset = false;
    this._onReset = onReset;
    this.deathSound = race == null
      ? CLASSIC_PLAYER_DEATH_SOUND
      : playerDeathSound(race, gender, voices);
    playSound?.(this.deathSound);
  }

  tick(dt) {
    if (this.reset) return;
    this.elapsed += dt;
    if (this.currentCameraHeight > this.targetCameraHeight) {
      this.currentCameraHeight -= DEATH_FALL_SPEED * dt;
      if (this.currentCameraHeight < this.targetCameraHeight) {
        this.currentCameraHeight = this.targetCameraHeight;
      }
    }
    if (this.elapsed > DEATH_TIME_BEFORE_RESET) {
      this.reset = true;
      this._onReset?.();
    }
  }

  get drop() { return this.startCameraHeight - this.currentCameraHeight; }

  get fade() { return Math.min(1, this.elapsed / DEATH_FADE_DURATION); }
}
