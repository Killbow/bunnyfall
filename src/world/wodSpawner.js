// World of Daggerfall spawn points.

import { rangeInt } from '../items/unleveledLoot.js';
import { MOBILE_TYPES } from '../characters/mobileTypes.js';
import { WOD_SPAWN_TYPE, WOD_ENEMY_ID } from './wodLocationObjects.js';

export const WOD_SPAWN_RADIUS = 100;
export const WOD_STAND_DOWN_RADIUS = 300;
export const FOE_MALE_CHANCE = 0.55;
export const createFoeGender = (rolls) => (rolls() < FOE_MALE_CHANCE ? 'male' : 'female');

const THIEF_ARMS = Object.freeze([MOBILE_TYPES.Thief, MOBILE_TYPES.Rogue, MOBILE_TYPES.Barbarian]);
const WARRIOR_ARMS = Object.freeze([
  MOBILE_TYPES.Warrior, MOBILE_TYPES.Sorcerer, MOBILE_TYPES.Ranger, MOBILE_TYPES.Mage, MOBILE_TYPES.Knight, MOBILE_TYPES.Healer,
]);

export class WodSpawner {
  /** @param {{spawnType:number, enemyID:number, questID:number}} spec */
  constructor({ spawnType, enemyID = 0, questID = 0 }) {
    this.spawnType = spawnType;
    this.enemyID = enemyID;
    this.questID = questID;
    this.spawnFinished = false;
    this.active = true;
    this.started = false;
  }

  /** @param {number} dist */
  onLoad(dist) {
    if (dist <= WOD_STAND_DOWN_RADIUS) this.active = false;
  }

  /**
   * @param {number} dist
   * @param {() => number} rolls
   */
  tick(dist, rolls = Math.random) {
    if (!this.active) return null;
    if (!this.started) {
      this.started = true;
      if (dist <= WOD_STAND_DOWN_RADIUS) { this.active = false; return null; }
    }
    if (!(dist <= WOD_SPAWN_RADIUS)) return null;
    switch (this.spawnType) {
      case WOD_SPAWN_TYPE.Quest: return this._quest(rolls);
      case WOD_SPAWN_TYPE.Enemy:
        if (this.enemyID === WOD_ENEMY_ID.Bandits) return this._thieves(rolls, true);
        if (this.enemyID === WOD_ENEMY_ID.Bears) return this._bears(rolls);
        if (this.enemyID === WOD_ENEMY_ID.Warriors) return this._warriors(rolls);
        return null;
      case WOD_SPAWN_TYPE.Good:
        if (this.enemyID === WOD_ENEMY_ID.Bandits) return this._thieves(rolls, false);
        return null;
      case WOD_SPAWN_TYPE.Loot: return this._loot(rolls);
      default: return null;
    }
  }

  _foe(mobileType, hostile, rolls) {
    // Gender rolls before facing, as in DFU's CreateFoeGameObjects, so a seeded spawn matches on every client.
    const gender = createFoeGender(rolls);
    const yawDeg = rangeInt(0, 180, rolls);
    return { kind: 'foe', mobileType, hostile, allied: !hostile, gender, yawDeg };
  }

  _thieves(rolls, hostile) {
    const enemyType = rangeInt(1, 3, rolls);
    const spawnTrue = rangeInt(1, 100, rolls);
    let out = null;
    if (!this.spawnFinished && spawnTrue >= 50) out = this._foe(THIEF_ARMS[enemyType - 1], hostile, rolls);
    this.spawnFinished = true;
    this.active = false;
    return out;
  }

  _bears(rolls) {
    const spawnTrue = rangeInt(1, 100, rolls);
    let out = null;
    if (!this.spawnFinished && spawnTrue >= 40) out = this._foe(MOBILE_TYPES.GrizzlyBear, true, rolls);
    this.spawnFinished = true;
    this.active = false;
    return out;
  }

  _warriors(rolls) {
    const enemyType = rangeInt(1, 6, rolls);
    const spawnTrue = rangeInt(1, 100, rolls);
    let out = null;
    if (!this.spawnFinished && spawnTrue >= 50) out = this._foe(WARRIOR_ARMS[enemyType - 1], true, rolls);
    this.spawnFinished = true;
    this.active = false;
    return out;
  }

  _loot(rolls) {
    const spawnTrue = rangeInt(1, 100, rolls);
    const out = spawnTrue <= 50 ? { kind: 'loot', record: rangeInt(0, 47, rolls) } : null;
    this.active = false;
    return out;
  }

  _quest(rolls) {
    const spawnTrue = rangeInt(1, 40, rolls);
    let out = null;
    if (this.questID === 0) {
      if (spawnTrue < 11) out = { kind: 'billboard', archive: 357, record: 6 };
      if (spawnTrue > 19 && spawnTrue < 30) out = { kind: 'billboard', archive: 182, record: 0 };
      if (spawnTrue > 29 && spawnTrue < 40) out = { kind: 'billboard', archive: 184, record: 31 };
    }
    this.active = false;
    return out;
  }
}

export const WOD_LOOT_LOCATION_INDEX = 3;

export const WOD_LOOT_ALIGN = Object.freeze({ sizeY: 1, distance: 2 });
