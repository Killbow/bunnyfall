import { ENEMY_BASICS, isClassEnemyId } from './enemyBasics.js';
import { KNIGHT_CITY_WATCH } from './mobileTypes.js';
import { SPECIAL_ABILITY_BITS } from './specialAdvantages.js';
import { entityImprovedAcuteHearing } from '../magic/enchantments.js';

export function acuteHearingMultiplier(playerEntity) {
  const bits = playerEntity?.career?.abilityFlagsAndSpellPointsBitfield ?? 0;
  if ((bits & SPECIAL_ABILITY_BITS.acuteHearing) === 0) return 1;
  return entityImprovedAcuteHearing(playerEntity) ? 1.5 : 1.25;
}

export const ATTRACT_RADIUS = 16;
export const MIN_ATTRACT_DELAY = 3;
export const MAX_ATTRACT_DELAY = 9;
export const MUTE_HUMAN_SOUNDS = true;
export const OCCLUDED_VOLUME_SCALE = 0.25;
export const MOVE_SOUND_THRESHOLD = 0.8;
export const ATTACK_SOUND_THRESHOLD = 0.5;
export const COMPANION_ATTRACT_SCALE = 6;
export const FOE_ATTRACT_SCALE = 2.5;
export const attractStep = (source, dt, companion = false) => (companion || isClassEnemyId(source?.mobileType) ? dt : dt / FOE_ATTRACT_SCALE);

export function ignoreHumanSounds(mobileType) {
  return mobileType !== KNIGHT_CITY_WATCH && isClassEnemyId(mobileType) && MUTE_HUMAN_SOUNDS;
}

export function rollAttractDelay(rolls = Math.random) {
  return MIN_ATTRACT_DELAY + Math.floor(rolls() * (MAX_ATTRACT_DELAY + 1 - MIN_ATTRACT_DELAY));
}

export class EnemySoundSource {
  constructor(mobileType, rolls = Math.random) {
    this.mobileType = mobileType;
    this.rolls = rolls;
    this.muted = ignoreHumanSounds(mobileType);
    // volumeScale persists across sounds: a muffled attract sound keeps later attack sounds quiet.
    this.volumeScale = 1;
    this.waitCounter = 0;
    this.waitTime = rollAttractDelay(rolls);
  }

  tick(dt, dist, isOccluded = () => false, { companion = false } = {}) {
    this.waitCounter += dt > 0 ? dt : 0;
    const inRadius = dist < ATTRACT_RADIUS;
    const wait = companion ? this.waitTime * COMPANION_ATTRACT_SCALE : this.waitTime;
    if (!(this.waitCounter > wait) || !inRadius) return null;
    const out = this._attract(isOccluded);
    this.waitCounter = 0;
    this.waitTime = rollAttractDelay(this.rolls);
    return out;
  }

  _attract(isOccluded) {
    if (this.muted) return null;
    this.volumeScale = isOccluded() ? OCCLUDED_VOLUME_SCALE : 1;
    const row = ENEMY_BASICS[this.mobileType];
    if (!row) return null;
    const clip = this.rolls() > MOVE_SOUND_THRESHOLD ? row.moveSound : row.barkSound;
    return clip == null ? null : { clip, volume: this.volumeScale };
  }

  attack() {
    if (this.muted) return null;
    if (!(this.rolls() > ATTACK_SOUND_THRESHOLD)) return null;
    const clip = ENEMY_BASICS[this.mobileType]?.attackSound;
    return clip == null ? null : { clip, volume: this.volumeScale };
  }
}

export const HALT_GAP_S = 15;

export class WatchVoice {
  constructor() {
    this.since = Infinity;
  }

  /**
   * @template {{ dist: number }} T
   * @param {number} dt
   * @param {readonly T[]} callers
   * @param {{ quiet?: boolean }} [o]
   * @returns {T|null}
   */
  tick(dt, callers, { quiet = false } = {}) {
    this.since += dt > 0 ? dt : 0;
    if (quiet || !callers.length || this.since < HALT_GAP_S) return null;
    let near = callers[0];
    for (const c of callers) if (c.dist < near.dist) near = c;
    this.since = 0;
    return near;
  }

  end() { this.since = Infinity; }
}
