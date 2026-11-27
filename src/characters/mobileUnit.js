import { rand } from '../formats/dfRandom.js';
import { MOBILE_TYPES } from './mobileTypes.js';

export const MOVE_ANIM_SPEED = 6;
export const FLY_ANIM_SPEED = 10;
export const PRIMARY_ATTACK_ANIM_SPEED = 10;
export const HURT_ANIM_SPEED = 4;
export const IDLE_ANIM_SPEED = 4;

const A = (record, fps, flip, bounce = false) => ({ record, fps, flip, bounce });

export const MOVE_ANIMS = Object.freeze([
  A(0, MOVE_ANIM_SPEED, false), A(1, MOVE_ANIM_SPEED, false), A(2, MOVE_ANIM_SPEED, false), A(3, MOVE_ANIM_SPEED, false),
  A(4, MOVE_ANIM_SPEED, false), A(3, MOVE_ANIM_SPEED, true), A(2, MOVE_ANIM_SPEED, true), A(1, MOVE_ANIM_SPEED, true),
]);
export const PRIMARY_ATTACK_ANIMS = Object.freeze([
  A(5, PRIMARY_ATTACK_ANIM_SPEED, false), A(6, PRIMARY_ATTACK_ANIM_SPEED, false), A(7, PRIMARY_ATTACK_ANIM_SPEED, false), A(8, PRIMARY_ATTACK_ANIM_SPEED, false),
  A(9, PRIMARY_ATTACK_ANIM_SPEED, false), A(8, PRIMARY_ATTACK_ANIM_SPEED, true), A(7, PRIMARY_ATTACK_ANIM_SPEED, true), A(6, PRIMARY_ATTACK_ANIM_SPEED, true),
]);
export const HURT_ANIMS = Object.freeze([
  A(10, HURT_ANIM_SPEED, false), A(11, HURT_ANIM_SPEED, false), A(12, HURT_ANIM_SPEED, false), A(13, HURT_ANIM_SPEED, false),
  A(14, HURT_ANIM_SPEED, false), A(13, HURT_ANIM_SPEED, true), A(12, HURT_ANIM_SPEED, true), A(11, HURT_ANIM_SPEED, true),
]);
export const IDLE_ANIMS = Object.freeze([
  A(15, IDLE_ANIM_SPEED, false), A(16, IDLE_ANIM_SPEED, false), A(17, IDLE_ANIM_SPEED, false), A(18, IDLE_ANIM_SPEED, false),
  A(19, IDLE_ANIM_SPEED, false), A(18, IDLE_ANIM_SPEED, true), A(17, IDLE_ANIM_SPEED, true), A(16, IDLE_ANIM_SPEED, true),
]);
// The rat idle flips frames 16 to 18 on the way up instead of on the way down, as in DFU.
export const RAT_IDLE_ANIMS = Object.freeze([
  A(15, IDLE_ANIM_SPEED, false), A(16, IDLE_ANIM_SPEED, true), A(17, IDLE_ANIM_SPEED, true), A(18, IDLE_ANIM_SPEED, true),
  A(19, IDLE_ANIM_SPEED, false), A(18, IDLE_ANIM_SPEED, false), A(17, IDLE_ANIM_SPEED, false), A(16, IDLE_ANIM_SPEED, false),
]);
export const GHOST_WRAITH_MOVE_ANIMS = Object.freeze([
  A(0, MOVE_ANIM_SPEED, false), A(1, MOVE_ANIM_SPEED, false), A(2, MOVE_ANIM_SPEED, true), A(3, MOVE_ANIM_SPEED, false),
  A(4, MOVE_ANIM_SPEED, false), A(3, MOVE_ANIM_SPEED, true), A(2, MOVE_ANIM_SPEED, false), A(1, MOVE_ANIM_SPEED, true),
]);
export const GHOST_WRAITH_ATTACK_ANIMS = Object.freeze([
  A(5, PRIMARY_ATTACK_ANIM_SPEED, false), A(6, PRIMARY_ATTACK_ANIM_SPEED, false), A(7, PRIMARY_ATTACK_ANIM_SPEED, true), A(8, PRIMARY_ATTACK_ANIM_SPEED, false),
  A(9, PRIMARY_ATTACK_ANIM_SPEED, false), A(8, PRIMARY_ATTACK_ANIM_SPEED, true), A(7, PRIMARY_ATTACK_ANIM_SPEED, false), A(6, PRIMARY_ATTACK_ANIM_SPEED, true),
]);
export const SLAUGHTERFISH_MOVE_ANIMS = Object.freeze([
  A(0, MOVE_ANIM_SPEED, false, true), A(1, MOVE_ANIM_SPEED, false, true), A(2, MOVE_ANIM_SPEED, false, true), A(3, MOVE_ANIM_SPEED, false, true),
  A(4, MOVE_ANIM_SPEED, false, true), A(3, MOVE_ANIM_SPEED, true, true), A(2, MOVE_ANIM_SPEED, true, true), A(1, MOVE_ANIM_SPEED, true, true),
]);
export const RANGED_ATTACK1_ANIM_SPEED = 10;
export const RANGED_ATTACK1_ANIMS = Object.freeze([
  A(20, RANGED_ATTACK1_ANIM_SPEED, false), A(21, RANGED_ATTACK1_ANIM_SPEED, false), A(22, RANGED_ATTACK1_ANIM_SPEED, false), A(23, RANGED_ATTACK1_ANIM_SPEED, false),
  A(24, RANGED_ATTACK1_ANIM_SPEED, false), A(23, RANGED_ATTACK1_ANIM_SPEED, true), A(22, RANGED_ATTACK1_ANIM_SPEED, true), A(21, RANGED_ATTACK1_ANIM_SPEED, true),
]);

export const RANGED_ATTACK2_ANIM_SPEED = 10;
export const RANGED_ATTACK2_ANIMS = Object.freeze([
  A(25, RANGED_ATTACK2_ANIM_SPEED, false), A(26, RANGED_ATTACK2_ANIM_SPEED, false), A(27, RANGED_ATTACK2_ANIM_SPEED, false), A(28, RANGED_ATTACK2_ANIM_SPEED, false),
  A(29, RANGED_ATTACK2_ANIM_SPEED, false), A(28, RANGED_ATTACK2_ANIM_SPEED, true), A(27, RANGED_ATTACK2_ANIM_SPEED, true), A(26, RANGED_ATTACK2_ANIM_SPEED, true),
]);

export const FEMALE_THIEF_IDLE_ANIMS = Object.freeze([
  A(15, IDLE_ANIM_SPEED, false), A(11, IDLE_ANIM_SPEED, false), A(17, IDLE_ANIM_SPEED, false), A(18, IDLE_ANIM_SPEED, false),
  A(19, IDLE_ANIM_SPEED, false), A(18, IDLE_ANIM_SPEED, true), A(17, IDLE_ANIM_SPEED, true), A(11, IDLE_ANIM_SPEED, true),
]);

const SEDUCER_ROW = (record) => Object.freeze(new Array(8).fill(null).map(() => A(record, MOVE_ANIM_SPEED, false)));
export const SEDUCER_TRANSFORM1_ANIMS = SEDUCER_ROW(23);
export const SEDUCER_TRANSFORM2_ANIMS = SEDUCER_ROW(22);
export const SEDUCER_IDLE_MOVE_ANIMS = SEDUCER_ROW(21);
export const SEDUCER_ATTACK_ANIMS = SEDUCER_ROW(20);

export const MOBILE_RAT = MOBILE_TYPES.Rat;
export const MOBILE_SLAUGHTERFISH = MOBILE_TYPES.Slaughterfish;
export const MOBILE_GHOST = MOBILE_TYPES.Ghost;
export const MOBILE_GIANT_SCORPION = MOBILE_TYPES.GiantScorpion;
export const MOBILE_WRAITH = MOBILE_TYPES.Wraith;
export const MOBILE_DAEDRA_SEDUCER = MOBILE_TYPES.DaedraSeducer;

export function stateAnims(state, mobileType, hasIdle, hasSpellAnimation = false, femaleThief = false, hasRangedAttack1 = true, hasRangedAttack2 = false, seducerTransformed = false, hasSeducerTransform1 = false, hasSeducerTransform2 = false) {
  const wingedSeducer = mobileType === MOBILE_DAEDRA_SEDUCER && seducerTransformed;
  if (state === 'transform1') return hasSeducerTransform1 ? SEDUCER_TRANSFORM1_ANIMS : null;
  if (state === 'transform2') return hasSeducerTransform2 ? SEDUCER_TRANSFORM2_ANIMS : null;
  if (state === 'move') {
    if (mobileType === MOBILE_GHOST || mobileType === MOBILE_WRAITH) return GHOST_WRAITH_MOVE_ANIMS;
    if (wingedSeducer) return SEDUCER_IDLE_MOVE_ANIMS;
    if (mobileType === MOBILE_SLAUGHTERFISH) return SLAUGHTERFISH_MOVE_ANIMS;
    return MOVE_ANIMS;
  }
  if (state === 'attack') {
    if (mobileType === MOBILE_GHOST || mobileType === MOBILE_WRAITH) return GHOST_WRAITH_ATTACK_ANIMS;
    if (wingedSeducer) return SEDUCER_ATTACK_ANIMS;
    return PRIMARY_ATTACK_ANIMS;
  }
  if (state === 'spell') {
    if (wingedSeducer) return SEDUCER_ATTACK_ANIMS;
    return hasSpellAnimation ? RANGED_ATTACK1_ANIMS : PRIMARY_ATTACK_ANIMS;
  }
  if (state === 'ranged') {
    return (hasRangedAttack1 && !hasRangedAttack2) ? RANGED_ATTACK1_ANIMS : RANGED_ATTACK2_ANIMS;
  }
  if (state === 'hurt') {
    if (wingedSeducer) return SEDUCER_IDLE_MOVE_ANIMS;
    return HURT_ANIMS;
  }
  if (mobileType === MOBILE_GHOST || mobileType === MOBILE_WRAITH) return GHOST_WRAITH_MOVE_ANIMS;
  if (wingedSeducer) return SEDUCER_IDLE_MOVE_ANIMS;
  if (femaleThief) return FEMALE_THIEF_IDLE_ANIMS;
  if (mobileType === MOBILE_RAT) return RAT_IDLE_ANIMS;
  if (mobileType === MOBILE_SLAUGHTERFISH) return SLAUGHTERFISH_MOVE_ANIMS;
  if (!hasIdle) return MOVE_ANIMS;
  return IDLE_ANIMS;
}

export function mobileOrientation(yaw, feet, cameraPos) {
  const dx = cameraPos[0] - feet[0], dz = cameraPos[2] - feet[2];
  const l = Math.hypot(dx, dz) || 1;
  const dirX = dx / l, dirZ = dz / l;
  const fwdX = Math.sin(yaw), fwdZ = Math.cos(yaw);
  const dot = Math.max(-1, Math.min(1, dirX * fwdX + dirZ * fwdZ));
  let angle = (Math.acos(dot) * 180) / Math.PI;
  const crossY = dirZ * fwdX - dirX * fwdZ;
  angle *= -Math.sign(crossY) || 1;
  const orientation = -Math.round(angle / 45);
  return ((orientation % 8) + 8) % 8;
}

export function rollAttackFrames(basics, roll100) {
  let r = roll100;
  if (r <= (basics.chanceForAttack2 ?? 0) && basics.primaryAttackAnimFrames2) return basics.primaryAttackAnimFrames2;
  r -= basics.chanceForAttack2 ?? 0;
  if (r <= (basics.chanceForAttack3 ?? 0) && basics.primaryAttackAnimFrames3) return basics.primaryAttackAnimFrames3;
  r -= basics.chanceForAttack3 ?? 0;
  if (r <= (basics.chanceForAttack4 ?? 0) && basics.primaryAttackAnimFrames4) return basics.primaryAttackAnimFrames4;
  r -= basics.chanceForAttack4 ?? 0;
  if (r <= (basics.chanceForAttack5 ?? 0) && basics.primaryAttackAnimFrames5) return basics.primaryAttackAnimFrames5;
  return basics.primaryAttackAnimFrames ?? [0, 1, 2, 3, 4];
}

const _forcedGenders = [];
export function registerForcedGender(fn) {
  if (typeof fn !== 'function') throw new Error('registerForcedGender: a function of (mobileType)');
  _forcedGenders.push(fn);
}
export function _resetForcedGenders() { _forcedGenders.length = 0; }

/** @param frameCount */
export class MobileUnit {
  static resolveGender(gender, basics, mobileType = null) {
    let resolved = 'unspecified';
    if (gender && gender !== 'unspecified') resolved = gender;
    else if (basics?.affinity === 'Human') resolved = rand() % 2 === 0 ? 'male' : 'female';
    for (const fn of _forcedGenders) {
      const forced = fn(mobileType);
      if (forced) return forced;
    }
    return resolved;
  }

  constructor(mobileType, basics, frameCount, rolls = Math.random, gender = 'male') {
    this.mobileType = mobileType;
    this.basics = basics;
    this._sharedBasics = basics;
    this.gender = gender;
    this.frameCount = frameCount;
    this.rolls = rolls;
    this.state = 'idle';
    this.orientation = 0;
    this.frame = 0;
    this._timer = 0;
    this._reversed = false;
    this._attackFrames = null;
    this._iter = 0;
    this.doMeleeDamage = false;
    this.meleeSeq = 0;
    this._hold = false;
    this._underHold = false;
    this._heldSwing = false;
    this._struck = false;
    this.shootArrow = false;
    this.specialTransformationCompleted = false;
    this._basicsOwned = false;
  }

  _ownBasics() {
    if (!this._basicsOwned) { this.basics = { ...this.basics }; this._basicsOwned = true; }
    return this.basics;
  }

  setSpecialTransformationCompleted() {
    if (this.mobileType === MOBILE_DAEDRA_SEDUCER) {
      const e = this._ownBasics();
      e.behaviour = 'Flying';
      e.corpseTexture = { archive: 400, record: 5 };
      e.hasIdle = false;
      e.hasSpellAnimation = true;
      e.spellAnimFrames = [0, 1, 2, 3];
    }
    this.specialTransformationCompleted = true;
  }

  clearSpecialTransformationCompleted() {
    this.basics = this._sharedBasics;
    this._basicsOwned = false;
    this.specialTransformationCompleted = false;
    if (this.state === 'transform1' || this.state === 'transform2') this._change('idle');
  }

  isPlayingOneShot() {
    return this.state === 'hurt' || this.state === 'attack' || this.state === 'ranged'
      || this.state === 'spell' || this.state === 'transform1' || this.state === 'transform2';
  }

  oneShotPauseActionsWhilePlaying() {
    return this.state === 'transform1' || this.state === 'transform2';
  }

  heldPose(state, frame, yaw, feet, cameraPos) {
    const was = this.state;
    this.state = state;
    try {
      const anims = this._anims();
      const a = anims[mobileOrientation(yaw, feet, cameraPos)] ?? anims[0];
      const n = Math.max(1, this.frameCount(a.record) | 0);
      const fr = frame < 0 ? n + frame : frame;
      const flip = this.mobileType === MOBILE_GIANT_SCORPION ? !a.flip : a.flip;
      return { record: a.record, frame: Math.max(0, Math.min(n - 1, fr)), flip: !!flip };
    } finally { this.state = was; }
  }

  isAttacking() {
    return this.state === 'attack' || this.state === 'ranged';
  }

  startTransformation() {
    this._change('transform1');
  }

  _nextStateAfterOneShot() {
    if (this.state === 'transform1') return 'transform2';
    if (this.state === 'transform2') { this.setSpecialTransformationCompleted(); return 'idle'; }
    return 'idle';
  }

  _anims() {
    const femaleThief = this.basics.femaleTexture === 483 && this.gender === 'female';
    return stateAnims(this.state, this.mobileType, this.basics.hasIdle ?? false, this.basics.hasSpellAnimation ?? false, femaleThief, this.basics.hasRangedAttack1 ?? true, this.basics.hasRangedAttack2 ?? false,
      this.specialTransformationCompleted, this.basics.hasSeducerTransform1 ?? false, this.basics.hasSeducerTransform2 ?? false);
  }

  _change(state) {
    const pair = (a, b) => (this.state === a && state === b) || (this.state === b && state === a);
    const keepFrame = !(this.basics.hasIdle ?? false) && pair('idle', 'move');
    this.state = state;
    if (!keepFrame) { this.frame = 0; this._reversed = false; }
    if (state === 'attack') {
      this._attackFrames = rollAttackFrames(this.basics, Math.floor(this.rolls() * 100) + 1);
      this.frame = this._attackFrames[0];
      this._iter = 1;
      if (this.frame === -1) {
        if (this._hold === true) { this.frame = 0; this._iter = 0; }
        else {
          this.doMeleeDamage = true;
          this.meleeSeq++;
          this.frame = this._iter < this._attackFrames.length ? this._attackFrames[this._iter++] : 0;
        }
      }
      this._underHold = this._hold === true;
      this._heldSwing = this._underHold; this._struck = false;
    }
    if (state === 'spell') {
      this._attackFrames = this.basics.spellAnimFrames ?? [0];
      this.frame = Math.max(0, this._attackFrames[0]);
      this._iter = 1;
      this._reversed = false;
    }
    if (state === 'ranged') {
      this._attackFrames = this.basics.rangedAttackAnimFrames ?? [0];
      this.frame = Math.max(0, this._attackFrames[0]);
      this._iter = 1;
    }
    if (state === 'transform1' || state === 'transform2') {
      this._ownBasics().behaviour = state === 'transform1' ? 'Flying' : 'General';
      this._attackFrames = (state === 'transform1'
        ? this.basics.seducerTransform1Frames : this.basics.seducerTransform2Frames) ?? [0];
      this.frame = Math.max(0, this._attackFrames[0]);
      this._iter = 1;
      this._reversed = false;
    }
    if (this._anims() == null) {
      this.state = 'idle';
      this.frame = 0;
      this._reversed = false;
    }
  }

  update(dt, { moving = false, striking = false, hurting = false, casting = false, rangedStriking = false, hold = false } = {}, yaw, feet, cameraPos) {
    if (this._heldSwing && this._struck && this.state === 'attack' && this._hold === 'spent' && hold !== 'spent') { this._heldSwing = false; this._change('idle'); }
    this._hold = hold;
    if (this._underHold && this.state === 'attack' && hold === 'cancel') { this._underHold = false; this._change('idle'); }
    if (this.isPlayingOneShot() && this.oneShotPauseActionsWhilePlaying()) {
    } else if (striking && (this.state !== 'attack' || (hold === true && !this._underHold))) this._change('attack');
    else if (rangedStriking && this.state !== 'ranged' && this.state !== 'attack') this._change('ranged');
    else if (casting && this.state !== 'spell' && this.state !== 'attack') this._change('spell');
    else if (hurting && this.state !== 'hurt' && this.state !== 'attack') this._change('hurt');
    else if (this.state === 'idle' || this.state === 'move') {
      const want = moving ? 'move' : 'idle';
      if (want !== this.state) this._change(want);
    }

    const anims = this._anims();
    const o = mobileOrientation(yaw, feet, cameraPos);
    if (o !== this.orientation) {
      const oldN = this.frameCount(anims[this.orientation].record);
      const n = this.frameCount(anims[o].record);
      if (oldN > 0) this.frame = Math.floor((this.frame * n) / oldN);
      this.orientation = o;
    }

    let a = anims[this.orientation];
    let fps = (this.basics.behaviour === 'Flying' && (this.state === 'move' || this.state === 'idle'))
      ? FLY_ANIM_SPEED : a.fps;
    const div = this.frameSpeedDivisor ?? 1;
    if (div > 1) { fps = fps / div; if (fps < 4) fps = 4; }
    this._timer += dt;
    const stepEvery = 1 / fps;
    while (this._timer >= stepEvery) {
      this._timer -= stepEvery;
      const before = this.state;
      this._stepFrame(a);
      if (this.state !== before) a = this._anims()[this.orientation];
    }
    const flip = this.mobileType === MOBILE_GIANT_SCORPION ? !a.flip : a.flip;
    return { record: a.record, frame: this.frame, flip };
  }

  _stepFrame(a) {
    const n = Math.max(1, this.frameCount(a.record));
    if (this.state === 'attack' || this.state === 'ranged') {
      if (this.state === 'attack' && this._heldSwing && this._struck && this._hold === 'spent') return;
      if (this._iter >= this._attackFrames.length) { this._underHold = false; this._heldSwing = false; this._change('idle'); return; }
      if (this.state === 'attack' && this._underHold && this._hold === true && this._attackFrames[this._iter] === -1) return;
      let f = this._attackFrames[this._iter++];
      if (f === -1) {
        if (this.state === 'ranged') this.shootArrow = true;
        else { this.doMeleeDamage = true; this.meleeSeq++; this._underHold = false; this._struck = this._heldSwing; }
        if (this._iter < this._attackFrames.length) f = this._attackFrames[this._iter++];
        else { this._change('idle'); return; }
      }
      this.frame = Math.min(f, n - 1);
      return;
    }
    this.frame = this._reversed ? this.frame - 1 : this.frame + 1;
    if (this.frame >= n || (this._reversed && this.frame <= 0)) {
      if (this.state === 'hurt' || this.state === 'spell'
        || this.state === 'transform1' || this.state === 'transform2') {
        this._change(this._nextStateAfterOneShot());
        return;
      }
      if (a.bounce && !this._reversed) {
        this.frame = Math.max(0, n - 2);
        this._reversed = true;
      } else {
        this.frame = 0;
        this._reversed = false;
      }
    }
  }
}

export const SECONDS_TO_TRANSFORM = 8.0;

export class SeducerTransformBehaviour {
  constructor(mobile, entity) {
    this.mobile = mobile;
    this.entity = entity;
    this.transformCountdown = SECONDS_TO_TRANSFORM;
    this.transformStarted = false;
  }

  startTransformation() {
    this.transformCountdown = 0;
    this.mobile.startTransformation();
    this.transformStarted = true;
  }

  rewind() {
    this.mobile.clearSpecialTransformationCompleted();
    this.transformCountdown = SECONDS_TO_TRANSFORM;
    this.transformStarted = false;
    this.entity.suppressInfighting = false;
  }

  update(dt, targetIsPlayer = false) {
    const m = this.mobile;
    if (!m || !this.entity) return;
    if (m.specialTransformationCompleted) {
      this.entity.suppressInfighting = true;
      return;
    }
    if (this.transformStarted && m.state !== 'transform1' && m.state !== 'transform2') {
      this.startTransformation();
      return;
    }
    if (targetIsPlayer && this.transformCountdown > 0) {
      const isHurt = (this.entity.health ?? 0) < (this.entity.maxHealth ?? 0);
      this.transformCountdown -= dt;
      if (isHurt || this.transformCountdown <= 0) this.startTransformation();
    }
  }
}
