// Enemy melee and bow attacks: the DFU EnemyAttack timing driving the shared weapon state machine.

import { rand } from '../formats/dfRandom.js';
import { tacticsNow } from '../ai/tacticsClock.js';
import { TELL } from '../ai/tells.js';
import {
  createWeaponMachine, machineAttack, machineStep,
  MELEE_NUM_FRAMES, CLASSIC_UPDATE_INTERVAL,
} from './weaponStates.js';
import { STRIKES, ATTACKS_1H, sampleClip } from './anims.js';
import { MELEE_DISTANCE, CLASSIC_MELEE_DISTANCE_VS_AI, withinYaw, MIN_RANGED_DISTANCE, MAX_RANGED_DISTANCE } from './enemyMotor.js';
export const BLOW_SWING_LATE = 0.25;

export const ATTACK_SPEED_FLOOR = 8;
export const ATTACK_YAW_DEG = 22.5;
export const MELEE_TIMER_MIN_MS = 1500;
export const MELEE_TIMER_MAX_MS = 3000;
export const MELEE_TIMER_LEVEL_MS = 50;
export const MELEE_TIMER_REFLEX_MS = 450;
export { MIN_RANGED_DISTANCE, MAX_RANGED_DISTANCE } from './enemyMotor.js';
export const BOW_SHOT_CHANCE = 1 / 32;

export function resetMeleeTimer(playerLevel = 10, reflexes = 2, roll = Math.random()) {
  let t = MELEE_TIMER_MIN_MS + Math.floor(roll * (MELEE_TIMER_MAX_MS + 1 - MELEE_TIMER_MIN_MS));
  t -= MELEE_TIMER_LEVEL_MS * (playerLevel - 10);
  t += MELEE_TIMER_REFLEX_MS * (reflexes - 2);
  if (t < 0) t = 0;
  return t / 980;
}

export function attackRollPasses(liveSpeed, randFn = rand) {
  const speed = Math.max(ATTACK_SPEED_FLOOR, liveSpeed);
  return randFn() % speed >= (speed >> 3) + 6;
}

export class EnemyAttack {
  constructor({ liveSpeed = 50, playerLevel = 10, reflexes = 2, rolls = Math.random } = {}) {
    this.machine = createWeaponMachine(false);
    this._liveSpeed = typeof liveSpeed === 'function' ? liveSpeed : () => liveSpeed;
    this._playerLevel = typeof playerLevel === 'function' ? playerLevel : () => playerLevel;
    this.reflexes = reflexes;
    this.rolls = rolls;
    this.meleeTimer = 0;
    this._classicTimer = 0;
    this.firedRanged = false;
    this.swingSeq = 0;
    this._held = false;
    this._heldStrike = 'Idle';
  }

  get liveSpeed() { return this._liveSpeed(); }

  get playerLevel() { return this._playerLevel(); }

  /**
   * @param ai
   * @param playerFeet
   * @returns
   */
  update(dt, ai, playerFeet, paused = false) {
    if (paused) return machineStep(this.machine, dt, this.liveSpeed);
    this.meleeTimer -= dt;
    if (this.meleeTimer < 0) this.meleeTimer = 0;
    const dist = ai._dist;
    this._classicTimer += dt;
    while (this._classicTimer >= CLASSIC_UPDATE_INTERVAL) {
      this._classicTimer -= CLASSIC_UPDATE_INTERVAL;
      // The classic roll draws from the shared DFRandom stream on every tick, even mid-swing.
      const meleePass = attackRollPasses(this.liveSpeed) && this.meleeTimer === 0;
      const oneShot = this.machine.state !== 'Idle';
      const dx = playerFeet[0] - ai.feet[0], dz = playerFeet[2] - ai.feet[2];
      if (ai._blowShot && !ai._blowShot.fired) {
        ai._blowShot.fired = true;
        if (oneShot) { this.machine.state = 'Idle'; this.machine.acc = 0; }
        const strike = STRIKES[Math.floor(this.rolls() * STRIKES.length)];
        if (machineAttack(this.machine, strike)) { this.firedRanged = true; this.swingSeq++; this._held = false; ai._tacShot = (ai._tacShot ?? 0) + 1; }
        continue;
      }
      if (ai._blowWind) {
        ai._blowWind = false;
        if (oneShot) { this.machine.state = 'Idle'; this.machine.acc = 0; }
        const strike = STRIKES[Math.floor(this.rolls() * STRIKES.length)];
        if (machineAttack(this.machine, strike)) { this.firedRanged = false; this.swingSeq++; this._held = true; this._heldStrike = strike; }
        this.meleeTimer = resetMeleeTimer(this.playerLevel, this.reflexes, this.rolls());
        continue;
      }
      if (this._held && ai._blowHold === 'cancel') { this._held = false; this.machine.state = 'Idle'; this.machine.acc = 0; }
      if (ai._blowSwing) {
        ai._blowSwing = false;
        if (ai._blowAt != null && tacticsNow() - ai._blowAt > BLOW_SWING_LATE) { ai._blowVerdict = null; ai._blowMult = undefined; this._held = false; }
        else if (this._held) {
          this._held = false;
          this.machine.state = 'Idle'; this.machine.acc = 0;
          machineAttack(this.machine, this._heldStrike);
          ai._tacSwung = (ai._tacSwung ?? 0) + 1;
          this.meleeTimer = resetMeleeTimer(this.playerLevel, this.reflexes, this.rolls());
          continue;
        } else {
          if (oneShot) { this.machine.state = 'Idle'; this.machine.acc = 0; }
          const strike = STRIKES[Math.floor(this.rolls() * STRIKES.length)];
          if (machineAttack(this.machine, strike)) { this.firedRanged = false; this.swingSeq++; ai._tacSwung = (ai._tacSwung ?? 0) + 1; }
          this.meleeTimer = resetMeleeTimer(this.playerLevel, this.reflexes, this.rolls());
          continue;
        }
      }
      if (this.rangedAttack && ai.canAct !== false && ai.inSight && ai.detected && ai.giveUpTimer > 0
          && dist > MIN_RANGED_DISTANCE && dist < MAX_RANGED_DISTANCE) {
        if (!oneShot && withinYaw(ai.yaw, dx, dz, ATTACK_YAW_DEG) && ai._tacShoot !== false && this.rolls() < BOW_SHOT_CHANCE) {
          if (ai._aimReady === true && this.rolls() < TELL.AIMED_SHARE) { ai._wantAimed = true; continue; }
          const strike = STRIKES[Math.floor(this.rolls() * STRIKES.length)];
          if (machineAttack(this.machine, strike)) { this.firedRanged = true; this.swingSeq++; this._held = false; ai._tacShot = (ai._tacShot ?? 0) + 1; ai._blowShot = null; }
        }
        continue;
      }
      if (!meleePass) continue;
      const known = ai.lastKnownTargetPos;
      if (!ai.inSight || !known || !withinYaw(ai.yaw, known[0] - ai.feet[0], known[2] - ai.feet[2], ATTACK_YAW_DEG)) continue;
      const vsAI = ai._armedTargeting && ai.target && !ai.target.isPlayer;
      if (dist > (vsAI ? CLASSIC_MELEE_DISTANCE_VS_AI : MELEE_DISTANCE)) continue;
      if (ai._tacStrike === false) continue;
      if (!oneShot || this.firedRanged) {
        if (oneShot) { this.machine.state = 'Idle'; this.machine.acc = 0; }
        const strike = STRIKES[Math.floor(this.rolls() * STRIKES.length)];
        if (machineAttack(this.machine, strike)) { this.firedRanged = false; this.swingSeq++; this._held = false; ai._tacSwung = (ai._tacSwung ?? 0) + 1; }
      }
      this.meleeTimer = resetMeleeTimer(this.playerLevel, this.reflexes, this.rolls());
    }
    return machineStep(this.machine, dt, this.liveSpeed);
  }

  pose() {
    const m = this.machine;
    if (m.state === 'Idle') return null;
    const frames = MELEE_NUM_FRAMES[m.state] ?? 5;
    const clip = ATTACKS_1H[m.state];
    if (!clip) return null;
    return sampleClip(clip, Math.min(0.9999, m.frame / (frames - 1)) * clip.dur);
  }
}
