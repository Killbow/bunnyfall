// Player melee, ported from DFU WeaponManager.cs and FormulaHelper.cs: reach, the hit rule, swing modifiers,
// the two hands, and the drag gesture.
import { abilityMayStrike, applyEdgeRitual, localAbilityActor, previewDamage } from './abilities/previewHits.js';
import { createWeaponMachine, machineAttack, machineStep, gestureDirection, strikeTicks, getMeleeWeaponAnimTime, MAX_GESTURE_SECONDS, BOW_DRAWN_HOLD_FRAME, machineCancelBowDraw, CLASSIC_UPDATE_INTERVAL, blowSchedule } from '../characters/weaponStates.js';
import { DIRECTION_TO_STRIKE, ATTACKS_FP, sampleClip } from '../characters/anims.js';
import { combinePose } from '../characters/animate.js';
import { weaponTypeForItem, WEAPON_TYPES } from './fpsWeapon.js';
import { BALLISTA_TEMPLATE, BALLISTA_COOLDOWN_MULT } from '../characters/heavyGearIds.js';
import { CROSSBOW_TEMPLATE, CROSSBOW_COOLDOWN_MULT } from '../characters/crossbowIds.js';
import { WEAPONS, weaponSkillUsed } from '../characters/weapons.js';
import { SKILLS } from '../characters/skills.js';
import { POSES } from '../characters/poses.js';
import { calculateAttackDamage } from './formulas.js';
import { isShieldTemplate } from '../items/armorMaterials.js';
import { equipDelayFor } from '../characters/equip.js';
import { getBool, getFloat, getInt } from '../platform/settings.js';
import { blowReaches, blowMult, scaleBlowDamage, playerBody, tellTechniqueLanded } from './technique/techniqueBlow.js';
import { HANDS_MODE, handsModeOf, strikeHandOf, twoHanded, offHandToHit, OFF_HAND_BLOW, offHandBurden, offHandHold, DUAL } from './twoHands/handsLaw.js';
import { getItemHands } from '../characters/equip.js';
import { readSwing } from './swingLaw.js';
import { liveStat } from '../characters/statMods.js';

export const DEFAULT_WEAPON_REACH = 2.25;
export const SPHERE_CAST_RADIUS = 0.25;
export const WEAPON_REACH = DEFAULT_WEAPON_REACH + SPHERE_CAST_RADIUS;

export const SWING_MODS = Object.freeze({
  StrikeUp: { damage: -4, toHit: 10 },
  StrikeDownRight: { damage: -2, toHit: 5 },
  StrikeDownLeft: { damage: 2, toHit: -5 },
  StrikeDown: { damage: 4, toHit: -10 },
  StrikeLeft: { damage: 0, toHit: 0 },
  StrikeRight: { damage: 0, toHit: 0 },
});

export const INTERIM_WEAPON = Object.freeze({
  name: 'Dagger',
  templateIndex: WEAPONS.Dagger,
  material: 0,
});

import { CLICK_ATTACK_DIRECTIONS } from '../characters/weaponStates.js';
export { CLICK_ATTACK_DIRECTIONS };

export function playerMeleeCanHit(dist, inView, losClear) {
  return dist <= WEAPON_REACH && inView && losClear;
}

import { BOW_SWITCH_DIVISOR, getBowCooldownTime } from '../characters/weaponStates.js';
import { noteFirstUse } from '../ui/tutorials.js';
export { BOW_SWITCH_DIVISOR };

export const USING_RIGHT_HAND_TEXT = 'Using weapon in right hand.';
export const USING_LEFT_HAND_TEXT = 'Using weapon in left hand.';

export const usingRightHandFromSaveVars = (saveVars) => !saveVars?.usingLeftHandWeapon;

/** @typedef {{ weaponDrawn: boolean, usingRightHand: boolean }} WeaponPose */

export const weaponPoseOf = (w) => (w ? { weaponDrawn: !w.sheathed, usingRightHand: w.usingRightHand } : null);

let _poseProbe = null;
export function setWeaponPoseProbe(fn) { _poseProbe = typeof fn === 'function' ? fn : null; }
export const currentWeaponPose = () => _poseProbe?.() ?? null;

// Sets flags only, as DFU does: the rig's next syncWorn reapplies the weapon and the shield rule.
// A missing field leaves the live value alone, so an older save does not read as sheathed and right-handed.
export function applyWeaponPose(w, pose) {
  if (!w || !pose) return false;
  if (pose.weaponDrawn != null) w.sheathed = !pose.weaponDrawn;
  if (pose.usingRightHand != null) w.usingRightHand = !!pose.usingRightHand;
  return true;
}

// The rig the player holds wins over the host rig, field by field, so a save taken in a shop records the shop rig.
export const mergeWeaponPose = (live, own) => ({
  weaponDrawn: live?.weaponDrawn ?? own?.weaponDrawn,
  usingRightHand: live?.usingRightHand ?? own?.usingRightHand,
});

// MeleeAttackFriendlyProtection: the box pass skips allies and pacified enemies; resolveHit strikes the nearest
// protected one only when nothing else was struck.
export function friendlyProtected(foe, { protection = getBool('MeleeAttacks', 'MeleeAttackFriendlyProtection') } = {}) {
  if (!protection) return false;
  if (foe?.entity?.team === 'PlayerAlly') return true;
  if (foe?.ai && foe.ai.isHostile === false) return true;
  return false;
}

export function handDesc(item) {
  if (!item) return null;
  return { item, type: weaponTypeForItem(item), hands: getItemHands(item), shield: false };
}
const SHIELD_HAND = Object.freeze({ item: true, shield: true });

export class PlayerWeapon {
  toggleSheath() {
    this.sheathed = !this.sheathed;
    if (this.sheathed) return false;
    noteFirstUse('combat');
    const t = weaponTypeForItem(this.weapon);
    return t !== WEAPON_TYPES.Melee && t !== WEAPON_TYPES.None;
  }

  get liveSpeed() { return this._liveSpeed(); }
  set liveSpeed(v) { this._liveSpeed = typeof v === 'function' ? v : () => v; }

  constructor({ liveSpeed = 50, weapon = INTERIM_WEAPON } = {}) {
    this.machine = createWeaponMachine(false);
    this.liveSpeed = liveSpeed;
    this.weapon = weapon;
    this.usingRightHand = true;
    this.holdingShield = false;
    this.currentRightHandWeapon = null;
    this.currentLeftHandWeapon = null;
    this.handsMode = HANDS_MODE.Single;
    this.leftBusy = false;
    this.strike = null;
    this._lastHand = null;
    this._lastEnd = -Infinity;
    this._burdenCarry = 0;
    this.techniqueBlow = null;
    this.animCtx = null;
    this._gpoints = [];
    this._gx = 0; this._gy = 0; this._gtravel = 0; this._gnow = 0; this._tracking = false;
  }

  // A shield in the left hand forces the right hand and blanks the left cache, which also blocks toggleHand.
  updateHands(rightHandItem, leftHandItem) {
    this.holdingShield = false;
    let left = leftHandItem ?? null;
    if (left && isShieldTemplate(left.templateIndex)) {
      this.usingRightHand = true;
      this.holdingShield = true;
      left = null;
    }
    this.currentRightHandWeapon = rightHandItem ?? null;
    this.currentLeftHandWeapon = left;
  }

  followHeldHand() {
    if (this.usingRightHand && !this.currentRightHandWeapon && this.currentLeftHandWeapon) { this.usingRightHand = false; return true; }
    if (!this.usingRightHand && !this.currentLeftHandWeapon && this.currentRightHandWeapon) { this.usingRightHand = true; return true; }
    return false;
  }

  applyWeapon(racialWeapon = null) {
    this.handsMode = racialWeapon ? HANDS_MODE.Single : handsModeOf({
      right: handDesc(this.currentRightHandWeapon),
      left: this.holdingShield ? SHIELD_HAND : handDesc(this.currentLeftHandWeapon),
      leftBusy: this.leftBusy,
    });
    if (racialWeapon) { this.weapon = racialWeapon; return this.weapon; }
    // During a two-hand strike this is the striking hand's item, so skill, sound, and art follow that weapon.
    this.weapon = this.handItem(this.activeHand);
    return this.weapon;
  }

  get leadHand() { return this.usingRightHand ? 'R' : 'L'; }
  get activeHand() {
    return twoHanded(this.handsMode) && this.strike && this.machine.state !== 'Idle' ? this.strike.hand : this.leadHand;
  }
  handItem(hand) { return (hand === 'L' ? this.currentLeftHandWeapon : this.currentRightHandWeapon) ?? null; }
  get offStrike() { return !!(this.handsMode === HANDS_MODE.Dual && this.strike && this.machine.state !== 'Idle' && this.strike.off); }
  get restingWeapon() { return twoHanded(this.handsMode) && !this.weapon?.werecreatureClaws ? this.handItem(this.leadHand) : this.weapon; }
  get blowWeight() { return this.offStrike ? OFF_HAND_BLOW.blowWeight : 1; }
  // A shot lands after its strike ends, so the item that fired it says whose shot it was.
  isOffHandItem(item) { return !!item && this.handsMode === HANDS_MODE.Dual && item === this.handItem(this.leadHand === 'L' ? 'R' : 'L'); }
  get pairedShortBlade() {
    if (this.handsMode !== HANDS_MODE.Dual) return null;
    const item = this.handItem(this.leadHand === 'L' ? 'R' : 'L');
    return item && weaponSkillUsed(item.templateIndex) === SKILLS.ShortBlade ? item : null;
  }
  get strikeInFlight() { return this.machine.state !== 'Idle' ? this.strike : null; }

  _nextStrike() {
    return strikeHandOf({ mode: this.handsMode, lead: this.leadHand, last: this._lastHand, sinceLast: this.machine.now - this._lastEnd });
  }

  _attack(state, { lead = false } = {}) {
    return this._swing(state, lead ? { hand: this.leadHand, flurry: false, off: false } : this._nextStrike());
  }

  _swing(state, s) {
    if (!machineAttack(this.machine, state)) return false;
    this.strike = s;
    if (twoHanded(this.handsMode) && !this.weapon?.werecreatureClaws) this.weapon = this.handItem(s.hand);
    if (s.flurry) this.machine.frame = DUAL.FLURRY_FROM_FRAME;
    if (this.offStrike) {
      const ctx = this.animCtx?.() ?? null;
      const w = ctx ? readSwing(ctx) : null;
      if (w) {
        const tick = this.machine.tick ?? getMeleeWeaponAnimTime(this.liveSpeed, ctx);
        const owed = offHandHold({ burden: offHandBurden(w.weight, w.strength), ticks: strikeTicks(this.machine), tick, carry: this._burdenCarry });
        this.machine.hold = owed.hold; this._burdenCarry = owed.carry;
      }
    }
    return true;
  }

  swingCtx(entity) {
    return { entity, weaponType: weaponTypeForItem(this.weapon), usingRightHand: this.activeHand === 'R' };
  }

  get strikingWeapon() {
    if (!this.weapon?.werecreatureClaws) return this.weapon;
    return this.handItem(this.activeHand);
  }

  toggleHand({
    bowSwitching = getBool('Enhancements', 'BowLeftHandWithSwitching'),
    entity = null,
    apply = true,
  } = {}) {
    if (this.usingRightHand && this.holdingShield) return null;
    this.usingRightHand = !this.usingRightHand;
    const message = this.usingRightHand ? USING_RIGHT_HAND_TEXT : USING_LEFT_HAND_TEXT;
    // With both hands up, H picks the lead and ends the exchange, so the next blow opens a new one.
    if (twoHanded(this.handsMode)) { this._lastHand = null; this._lastEnd = -Infinity; }
    if (bowSwitching && !twoHanded(this.handsMode)) {
      let switchDelay = 0;
      if (this.currentRightHandWeapon) switchDelay += equipDelayFor(this.currentRightHandWeapon) - 500;
      if (this.currentLeftHandWeapon) switchDelay += equipDelayFor(this.currentLeftHandWeapon) - 500;
      if (switchDelay > 0 && entity) entity.equipCountdown = (entity.equipCountdown ?? 0) + switchDelay / BOW_SWITCH_DIVISOR;
    }
    if (apply) this.applyWeapon(this.weapon?.werecreatureClaws ? this.weapon : null);
    return message;
  }

  gesture(dx, dy, held, dt, longestDim, {
    attackThreshold = getFloat('Controls', 'WeaponAttackThreshold', 0.001, 1.0),
    swingMode = getInt('Controls', 'WeaponSwingMode', 0, 2),
    bowDrawback = getBool('Controls', 'BowDrawback'),
    cancelHeld = false,
    rolls = Math.random,
  } = {}) {
    if (this.machine.isBow) {
      const rise = held && !this._bowHeld;
      this._bowHeld = held;
      const m = this.machine;
      if (bowDrawback) {
        if (m.state === 'StrikeUp' && m.frame === BOW_DRAWN_HOLD_FRAME) {
          if (cancelHeld) { machineCancelBowDraw(m, this.liveSpeed); return null; }
          if (!held && machineAttack(m, 'StrikeDown')) {
            this.lastDrawMs = this._bowAnimTimeMs();
            return 'StrikeDown';
          }
          return null;
        }
        if (rise && m.state !== 'StrikeUp' && machineAttack(m, 'StrikeUp')) return 'StrikeUp';
        return null;
      }
      // A departure from DFU: with BowDrawback off, a held button repeats the instant shot at the machine's rate.
      if (held && machineAttack(m, 'StrikeDown')) { this.lastDrawMs = this._bowAnimTimeMs(); return 'StrikeDown'; }
      return null;
    }
    this._bowHeld = false;
    if (swingMode !== 0) {
      const rise = held && !this._clickHeld;
      this._clickHeld = held;
      if (!held) { this._gestureClear(); return null; }
      if (!(rise || swingMode === 2)) { this._gestureClear(); return null; }
      const strike = this._rollClickStrike(rolls);
      return this._attack(strike) ? strike : null;
    }
    this._clickHeld = false;
    if (!held) { this._tracking = false; this._gestureClear(); return null; }
    if (!this._tracking) { this._tracking = true; this._gestureClear(); }
    const sum = this._gestureAdd(dx, dy, dt);
    // The threshold uses the travel along the trail, not the summed vector's length, because the trail may bend.
    if (this._gtravel / longestDim < attackThreshold) return null;
    const angle = Math.atan2(-sum[1], sum[0]) * 180 / Math.PI;
    const strike = DIRECTION_TO_STRIKE[gestureDirection(angle)];
    this._gestureClear();
    if (strike && this._attack(strike)) return strike;
    return null;
  }

  _rollClickStrike(rolls) {
    return DIRECTION_TO_STRIKE[CLICK_ATTACK_DIRECTIONS[Math.floor(rolls() * CLICK_ATTACK_DIRECTIONS.length)]];
  }

  // Game time: ticks count only while the machine steps, so a pause mid-draw adds nothing.
  _bowAnimTimeMs() {
    const m = this.machine;
    return Math.trunc(m.ticks * (m.tick ?? CLASSIC_UPDATE_INTERVAL) * 1000);
  }

  cancelHold() {
    this._bowHeld = false;
    this._clickHeld = false;
    this._tracking = false;
    this._gestureClear();
    machineCancelBowDraw(this.machine, this.liveSpeed);
  }

  _gestureClear() {
    this._gpoints.length = 0;
    this._gx = 0; this._gy = 0; this._gtravel = 0;
  }

  // MaxGestureSeconds is a sliding window: TrimOld drops only the points older than it.
  _gestureAdd(dx, dy, dt) {
    this._gnow += dt;
    let old = 0;
    for (const p of this._gpoints) {
      if (this._gnow - p.t <= MAX_GESTURE_SECONDS) continue;
      old++;
      this._gx -= p.dx; this._gy -= p.dy;
      this._gtravel -= p.mag;
    }
    if (old) this._gpoints.splice(0, old);
    const mag = Math.hypot(dx, dy);
    this._gpoints.push({ t: this._gnow, dx, dy, mag });
    this._gx += dx; this._gy += dy; this._gtravel += mag;
    return [this._gx, this._gy];
  }

  techniqueStrike(strike, offhand = false) {
    const started = offhand ? this.pairedShortBlade && this._swing(strike, {
      hand: this.leadHand === 'L' ? 'R' : 'L', flurry: false, off: true,
    }) : this._attack(strike, { lead: true });
    if (!started) return false;
    if (this.machine.isBow) this.lastDrawMs = this._bowAnimTimeMs();
    return true;
  }

  clickAttack(rolls = Math.random) {
    if (this.machine.isBow) {
      if (!machineAttack(this.machine, 'StrikeDown')) return null;
      this.lastDrawMs = this._bowAnimTimeMs();
      return 'StrikeDown';
    }
    const strike = this._rollClickStrike(rolls);
    return this._attack(strike) ? strike : null;
  }

  // Read every step because syncWorn swaps the weapon whenever the player sheathes.
  update(dt) {
    const t = weaponTypeForItem(this.weapon);
    this.machine.isUnarmed = t === WEAPON_TYPES.Melee || t === WEAPON_TYPES.Werecreature;
    this.machine.isBow = t === WEAPON_TYPES.Bow;
    this.machine.bowIdleDrawn = this.machine.isBow && !getBool('Controls', 'BowDrawback');
    this._tuneClassic(t, this.weapon);
    const evs = machineStep(this.machine, dt, this.liveSpeed, this.animCtx?.() ?? null, this.techniqueBlow?.tempo);
    if (evs.includes('done')) { this._lastHand = this.strike?.hand ?? this.leadHand; this._lastEnd = this.machine.now; this.strike = null; }
    return evs;
  }

  _tuneClassic(t, held = null) {
    this.machine.ranged = t === WEAPON_TYPES.Bow;
    this.machine.cooldown = t === WEAPON_TYPES.Bow && held?.templateIndex === BALLISTA_TEMPLATE
      ? getBowCooldownTime(this.liveSpeed) * BALLISTA_COOLDOWN_MULT
      : t === WEAPON_TYPES.Bow && held?.templateIndex === CROSSBOW_TEMPLATE ? getBowCooldownTime(this.liveSpeed) * CROSSBOW_COOLDOWN_MULT
      : null;
  }

  strikeSchedule(dt = 0) {
    return blowSchedule(this.machine, this.liveSpeed, this.animCtx?.() ?? null, dt, this.techniqueBlow?.tempo);
  }

  pose() {
    const base = POSES.fpMelee1H;
    const m = this.machine;
    if (m.state === 'Idle') return base;
    const clip = ATTACKS_FP[m.state];
    if (!clip) return base;
    const frames = 5;
    // sampleClip takes seconds, so the frame phase maps through clip.dur.
    return combinePose(base, sampleClip(clip, Math.min(0.9999, m.frame / (frames - 1)) * clip.dur));
  }

  // As in DFU, every entity in the attack box that passes the view and line-of-sight checks is struck.
  resolveHit(foes, playerCombat, canSee, rolls = Math.random, backstabOf = () => 0, say = null, onPoison = null, { protection } = {}) {
    const results = [];
    const protectedInReach = [];
    const tb = this.techniqueBlow;
    if (tb?.ability && (tb.cancelled || tb.didHit || tb.weapon !== this.strikingWeapon || playerCombat !== tb.actor
      || !localAbilityActor(playerCombat, tb.load))) return results;
    const techOn = (foe) => !!tb && !playerBody(foe);
    const ordered = [];
    const off = this.offStrike;
    const offToHit = off ? offHandToHit(playerCombat ? liveStat(playerCombat, 'agility') : 50) : 0;
    const strike = (foe, distance) => {
      const secondary = (tb?.struck?.size ?? 0) > 0;
      if (tb?.ability) {
        if (tb.struck) tb.struck.add(foe.entity);
        else {
          tb.didHit = true;
          if (!tb.redirect) tb.chain.target = foe.entity;
        }
      }
      const opts = playerAttackOptions(this.strikingWeapon, this.machine.state, backstabOf(foe), rolls);
      if (off) { opts.toHitMod += offToHit; Object.assign(opts, OFF_HAND_BLOW); }
      if (techOn(foe) && Number.isFinite(tb.toHit)) opts.toHitMod += tb.toHit;
      if (tb?.ability && tb.damageMod) opts.damageMod += tb.damageMod;
      const unaware = foeUnaware(foe);
      const rolled = calculateAttackDamage(playerCombat, foe.entity, {
        ...opts, say,
        armorPierce: tb?.ability ? tb.armorPierce : undefined,
        unaware,
        // The formulas clear the weapon's poison either way, so without this hook the dose would be lost.
        onInflictPoison: onPoison ? (att, tgt, pt) => onPoison(foe, pt) : null,
      });
      const blow = tb?.ability ? previewDamage(tb, rolled, foe, { distance, secondary, unaware })
        : techOn(foe) ? scaleBlowDamage(rolled, blowMult(tb, foe)) : rolled;
      if (!tb?.ability && techOn(foe)) tellTechniqueLanded(tb, foe, blow);
      const damage = applyEdgeRitual(playerCombat, this.strikingWeapon, foe, blow);
      if (damage > 0) tb?.noteDamage?.(foe);
      results.push({ foe, damage });
      this.onAttackResult?.({ foe, damage });
    };
    for (const foe of foes) {
      if (foe.dead || !foe.entity) continue;
      if (tb?.ability && (!abilityMayStrike(foe) || tb.struck?.has(foe.entity)
        || (!tb.redirect && tb.chain.target && foe.entity !== tb.chain.target))) continue;
      const sight = canSee(foe);
      const { dist, inView, losClear } = sight;
      if (!(techOn(foe) ? blowReaches(tb, foe, sight) : playerMeleeCanHit(dist, inView, losClear))) continue;
      // The fallback stands in for DFU's look ray, so a technique's all-round reach never widens it.
      if (friendlyProtected(foe, protection === undefined ? {} : { protection })) { if (!techOn(foe) || playerMeleeCanHit(dist, inView, losClear)) protectedInReach.push({ foe, dist }); continue; }
      if ((tb?.single || tb?.targetCap) && techOn(foe)) {
        const along = tb.targetCap && tb.lane && foe.ai?.feet
          ? (foe.ai.feet[0] - tb.lane.from[0]) * tb.lane.dir[0] + (foe.ai.feet[2] - tb.lane.from[1]) * tb.lane.dir[1]
          : dist;
        ordered.push({ foe, dist, along });
        continue;
      }
      strike(foe);
    }
    if (ordered.length) {
      let slots = tb.targetCap ? tb.targetCap - tb.struck.size : 1;
      ordered.sort((a, b) => a.along - b.along);
      for (const { foe, dist } of ordered) {
        if (slots <= 0) break;
        if (tb.struck?.has(foe.entity)) continue;
        strike(foe, dist);
        slots--;
      }
    }
    if (!tb?.ability && results.length === 0 && protectedInReach.length) {
      protectedInReach.sort((a, b) => a.dist - b.dist);
      strike(protectedInReach[0].foe);
    }
    for (const fn of _swingListeners.values()) { try { fn(results.length); } catch { } }
    return results;
  }
}

const _swingListeners = new Map();
export function registerPlayerSwingListener(name, fn) { if (typeof fn === 'function') _swingListeners.set(name, fn); else _swingListeners.delete(name); }

export const foeUnaware = (foe) => !!foe?.ai && !foe.puppet && foe.ai.detected === false && foe.entity?.revenant?.edge?.watchful !== true;

// CalculateAttackDamage takes the same player entry for a swing and a loosed arrow, so swing mods and backstab
// apply to bow shots too; a bow release resolves as StrikeDown.
export function playerAttackOptions(weapon, machineState, backstabChance = 0, rolls = Math.random) {
  const swing = SWING_MODS[machineState] ?? { damage: 0, toHit: 0 };
  return { weapon, damageMod: swing.damage, toHitMod: swing.toHit, backstabChance, rolls };
}
