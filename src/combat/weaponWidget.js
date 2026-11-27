// Port of the Weapon Widget 1.6 FPSWeaponClone, which draws the classic weapon sprite through its own modules.
// Timing comes from the weapon state machine. Coroutines are generators: `yield seconds` is WaitForSeconds and
// `yield FRAME` is WaitForEndOfFrame. The Position, Scale, and Offset channels also move the Morrowind arms.
import { poseStrikeRect } from './abilities/strikeMotion.js';

import {
  readWidgetSettings, offsetStep, bobStep, inertiaStep, widgetTransformRect, moveTowards2,
  WINDUP, RECOVERY, RECOIL_CONDITION, MISS_VFX_AT,
} from './weaponWidgetMotion.js';
export {
  WEAPON_WIDGET_VENDOR, WINDUP, RECOVERY, BOB_SHAPE, STEP_CONDITION, RECOIL_CONDITION, MISS_VFX_AT,
  readWidgetSettings, moveTowards, moveTowards2, roundHalfEven, snap,
  offsetStep, bobStep, inertiaStep, widgetTransformRect,
} from './weaponWidgetMotion.js';
import { getBool, getInt } from '../platform/settings.js';
import { liveStat } from '../characters/statMods.js';
import {
  getMeleeWeaponAnimTime, getBowCooldownTime, CLASSIC_UPDATE_INTERVAL, HIT_FRAME_MELEE, HIT_FRAME_BOW, MELEE_NUM_FRAMES, BOW_NUM_FRAMES,
} from '../characters/weaponStates.js';
import { WEAPON_TYPES, STATE_INDEX, ALIGN, NATIVE_W, NATIVE_H, WEAPON_FILE, weaponTypeForItem } from './fpsWeapon.js';
import { weaponOffsetHeight } from '../ui/hudLarge.js';
import { swingSoundFor } from '../audio/soundClips.js';
import { isEnchanted } from '../items/inventory.js';
import { atlasFileName, customTextureNames } from './diverseWeapons.js';
import { customWeaponImage } from './diverseWeaponsAssets.js';
import { widgetMetalName } from './weaponWidgetAssets.js';
import { getItemHands } from '../characters/equip.js';
import { ITEM_HANDS } from '../characters/equipTable.js';
import { mirrorRect } from './twoHands/handsLaw.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const inverseLerp = (a, b, v) => (a === b ? 0 : clamp((v - a) / (b - a), 0, 1));
const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);

export const SHEATHE_CLIP = 417;
export const MISS_VFX = Object.freeze({ archive: 380, record: 2, fps: 20, scale: 2 });
const MIRROR_STATES = Object.freeze([STATE_INDEX.Idle, STATE_INDEX.StrikeDown, STATE_INDEX.StrikeUp]);
const S = STATE_INDEX;
const T = WEAPON_TYPES;
const FRAME = 'frame';

// With Swings on, bow ticks are remapped too, as in the mod. The bow coroutine itself ticks the classic 0.0625.
export function widgetAnimTickTime(weaponType, liveSpeed, swing, ctx = null) {
  let t = CLASSIC_UPDATE_INTERVAL;
  if (weaponType !== T.Bow) t = getMeleeWeaponAnimTime(liveSpeed, ctx);
  if (!swing) return t;
  return lerp(0.045917998999357224, 0.35204100608825684, inverseLerp(0, 2, t / 0.19897900521755219));
}

const weaponFileName = (weaponType) => WEAPON_FILE[weaponType] ?? null;
const numFrames = (isBow, stateName) => (isBow ? BOW_NUM_FRAMES : MELEE_NUM_FRAMES)[stateName] ?? 5;
const STATE_NAMES = Object.keys(STATE_INDEX);

export function createWeaponWidget({
  settings = readWidgetSettings, audio = null, rolls = Math.random, missEffect = null, envHit = null,
  handedness = () => getInt('Controls', 'Handedness', 0, 3) === 1, bowDrawback = () => getBool('Controls', 'BowDrawback'),
  hidden = false,
} = {}) {
  const w = {
    showWeapon: true,
    position: [0, 0], scale: [1, 1], offset: [0, 0],
    weaponState: S.Idle, currentFrame: 0, currentWeaponType: T.None, currentMetalType: -1, currentTemplateIndex: -1,
    weaponPosition: { x: 0, y: 0, w: 0, h: 0 }, curAnimRect: { u0: 0, v0: 0, u1: 1, v1: 1 },
    weaponOffsetHeight: 0, screenRect: { x: 0, y: 0, width: NATIVE_W, height: NATIVE_H },
    weaponScaleX: 1, weaponScaleY: 1, animTickTime: 0,
    lastSheathed: null, lastDoubleScale: false, lastEnchanted: false,
    curCustomTexture: null, curCustomSize: null,
    animating: null, animatingCancel: false, hasCurrentAttackHit: false,
    // A hidden clone starts at the hidden end of the Offset slide, so a new pair's left hand slides in.
    offsetCurrent: hidden ? [2, 2] : [0, 0], offsetTarget: hidden ? [2, 2] : [0, 0],
    swayDx: { bob: 0, inertia: 0 },
    born: hidden,
    moveSmooth: 0, bobSmooth: [0, 0], inertiaCurrent: [0, 0], inertiaTarget: [0, 0], inertiaSpeedMod: 1,
    armsPosition: [0, 0], armsMoveSmooth: 0, armsBobSmooth: [0, 0],
    inertiaForwardCurrent: [0, 0], inertiaForwardTarget: [0, 0],
    leftHanded: false, flipHorizontal: false, isInThirdPerson: false, time: 0,
    specificWeapon: null, art: null, s: settings(),
  };
  let ctx = null;
  const machineStateIndex = () => STATE_INDEX[ctx?.machine?.state ?? 'Idle'] ?? 0;
  const machineIsAttacking = () => !!ctx?.machine && ctx.machine.state !== 'Idle';
  const machineFrame = () => ctx?.machine?.frame ?? 0;
  const hitFrame = () => (ctx?.machine?.isBow ? HIT_FRAME_BOW : HIT_FRAME_MELEE);
  const liveSpeed = () => (ctx?.entity ? liveStat(ctx.entity, 'speed') : 50);
  const animCtx = () => ctx?.animCtx?.() ?? ({ entity: ctx?.entity ?? null, weaponType: w.currentWeaponType, usingRightHand: usingRightHand() });
  const anims = () => w.art?.anims ?? null;
  const usingRightHand = () => ctx?.usingRightHand !== false;
  const sheathed = () => !!ctx?.sheathed;

  const offsetSpeedLive = () => liveSpeed() / 100 * w.s.offsetSpeed;

  function overrideAlignment() {
    if (!w.s.swingAlignmentOverride || !w.specificWeapon) return false;
    if (w.weaponState !== S.StrikeDown && w.weaponState !== S.StrikeUp) return false;
    const t = w.currentWeaponType;
    return !(t === T.Bow || t === T.Melee || t === T.Dagger || t === T.Dagger_Magic || t === T.Warhammer || t === T.Warhammer_Magic);
  }
  function mirrorOverride() {
    if (!w.specificWeapon) return false;
    // The mod tests `GetItemHands() == 2`, which is Both in the classic ItemHands enum.
    if (getItemHands(w.specificWeapon) !== ITEM_HANDS.Both) return false;
    const t = w.currentWeaponType;
    if (w.s.mirrorTwoHandedSwords && (t === T.LongBlade || t === T.LongBlade_Magic)) return true;
    if (w.s.mirrorTwoHandedAxes && (t === T.Battleaxe || t === T.Battleaxe_Magic)) return true;
    if (w.s.mirrorTwoHandedBlunts && (t === T.Staff || t === T.Staff_Magic || t === T.Warhammer || t === T.Warhammer_Magic || t === T.Flail || t === T.Flail_Magic)) return true;
    return false;
  }
  const offsetOverride = () => !(w.currentWeaponType === T.Melee || w.currentWeaponType === T.Werecreature);
  const recoveryOverride = () => w.weaponState === S.StrikeUp && !(w.currentWeaponType === T.Dagger || w.currentWeaponType === T.Dagger_Magic);

  function playSheatheSound() { audio?.playOneShot?.(SHEATHE_CLIP, 1, 1); }
  function playSwingSound() { audio?.playOneShot?.(swingSoundFor(w.specificWeapon), 1.1, 1); }

  function changeWeaponState(state) {
    w.weaponState = state;
    if (ctx?.weaponType === T.Bow && state === S.Idle) w.currentFrame = 0;
    // Idle must hold a drawable frame: the machine publishes none for Idle, and a Hide recovery leaves frame -1.
    else if (state === S.Idle && w.currentFrame < 0) w.currentFrame = 0;
    if (state !== S.Idle) { w.offsetCurrent = [0, 0]; w.offsetTarget = [0, 0]; }
    updateWeapon();
  }

  function loadWeaponAtlas() {
    w.currentWeaponType = ctx.weaponType;
    w.currentMetalType = ctx.material;
    w.currentTemplateIndex = w.specificWeapon?.templateIndex ?? -1;
    w.animTickTime = widgetAnimTickTime(w.currentWeaponType, liveSpeed(), w.s.swing, animCtx());
    w.customCache = new Map();
    w.customMisses = new Set();
  }
  function customTexture(record, frame) {
    const classic = weaponFileName(w.currentWeaponType);
    if (!classic || !ctx?.renderer) return null;
    const file = atlasFileName(w.specificWeapon, classic, undefined, ctx?.glow ? false : undefined);
    const metal = widgetMetalName(w.currentMetalType);
    const cache = (w.customCache ??= new Map());
    const misses = (w.customMisses ??= new Set());
    for (const name of customTextureNames(file, record, frame, metal, w.s.doubleScale)) {
      if (misses.has(name)) continue;
      if (!cache.has(name)) {
        cache.set(name, null);
        customWeaponImage(name).then((img) => {
          if (!img) { misses.add(name); return; }
          const tex = ctx.renderer.uploadTexture('img', `ww:${name}`, img);
          // Only a `w_` texture is double size, so the hit records which name answered.
          cache.set(name, { tex, width: img.width, height: img.height, doubled: name.startsWith('w_') });
        }).catch((e) => { misses.add(name); console.warn('[weapon widget] texture load failed', name, e); });
      }
      return cache.get(name);
    }
    return null;
  }

  function updateWeapon() {
    const art = w.art, a = anims();
    if (!art || !a || !ctx) return;
    if (ctx.weaponType === T.None) { w.weaponState = S.Idle; w.currentFrame = 0; }
    const isBow = ctx.weaponType === T.Bow;
    const record = isBow ? 0 : a[w.weaponState].Record;
    const rec = art.records[record];
    if (!rec) return;
    const custom = customTexture(record, Math.max(0, w.currentFrame));
    w.curCustomTexture = custom;
    const mirrored = w.flipHorizontal && MIRROR_STATES.includes(w.weaponState);
    w.curAnimRect = mirrored ? { u0: 1, v0: 0, u1: 0, v1: 1 } : { u0: 0, v0: 0, u1: 1, v1: 1 };
    const anim = { ...a[w.weaponState] };
    if (overrideAlignment()) anim.Alignment = ALIGN.Center;
    let width = rec.width, height = rec.height;
    if (custom) {
      if (w.s.trueSize) { width = custom.width / w.s.textureScaleFactor; height = custom.height / w.s.textureScaleFactor; }
      else if (w.s.doubleScale && custom.doubled !== false) {
        if (w.currentWeaponType === T.Bow) { if (w.currentFrame === 0) { width *= 2; height *= 2; } }
        else if (w.weaponState === S.Idle) { width *= 2; height *= 2; }
      }
    }
    w.weaponScaleX = w.screenRect.width / NATIVE_W;
    w.weaponScaleY = w.screenRect.height / NATIVE_H;
    // The mod's 1.01 filter fudge is absent on purpose: these textures bind NEAREST, so nothing shrinks.
    switch (anim.Alignment) {
      case ALIGN.Left: alignLeft(anim, width, height); break;
      case ALIGN.Center: alignCenter(anim, width, height); break;
      case ALIGN.Right: alignRight(anim, width, height); break;
      default: break;
    }
    w.animTickTime = widgetAnimTickTime(w.currentWeaponType, liveSpeed(), w.s.swing, animCtx());
  }
  const bottomY = (height) => w.screenRect.y + w.screenRect.height - height * w.weaponScaleY - w.weaponOffsetHeight;
  function alignLeft(anim, width, height) {
    w.weaponPosition = { x: w.screenRect.x + w.screenRect.width * anim.Offset, y: bottomY(height), w: width * w.weaponScaleX, h: height * w.weaponScaleY };
  }
  function alignCenter(anim, width, height) {
    const mid = w.screenRect.x + w.screenRect.width / 2;
    let x;
    if (overrideAlignment()) x = w.flipHorizontal ? mid - width * w.weaponScaleX : mid;
    else x = mid - width * w.weaponScaleX / 2;
    w.weaponPosition = { x, y: bottomY(height), w: width * w.weaponScaleX, h: height * w.weaponScaleY };
  }
  function alignRight(anim, width, height) {
    if (w.flipHorizontal && MIRROR_STATES.includes(w.weaponState)) return alignLeft(anim, width, height);
    w.weaponPosition = { x: w.screenRect.x + w.screenRect.width * (1 - anim.Offset) - width * w.weaponScaleX, y: bottomY(height), w: width * w.weaponScaleX, h: height * w.weaponScaleY };
  }

  function transformRect(base, { flip = w.flipHorizontal, scaleIt = w.currentWeaponType !== T.Werecreature, withOffset = true, position = w.position } = {}) {
    return widgetTransformRect(base, {
      position, scale: w.scale, offset: w.offset, flip, scaleIt, withOffset,
      stepInterval: w.s.stepTransforms ? w.s.stepLength * (w.screenRect.height / 64) : 0,
      screenHeight: w.screenRect.height, weaponOffsetHeight: w.weaponOffsetHeight,
    });
  }
  const getWeaponRect = () => transformRect(w.weaponPosition);
  const lastSettledHidden = () => !w.animating && (!w.s.offset || (w.offsetCurrent[0] >= 2 && w.offsetCurrent[1] >= 2));
  // For a mirrored pair hand, Bob goes outward like a mirror of the right hand while Inertia keeps the screen's
  // direction, so both hands lag the look as one body.
  const pairRect = (mirror) => (mirror ? transformRect(w.weaponPosition, { position: [w.swayDx.bob - w.swayDx.inertia, w.position[1]] }) : getWeaponRect());

  function onAttackDamageCalculated({ damage = 0, parrySounds = false, pos = null, isEnemy = true } = {}) {
    if (!w.s.recoil) return;
    const r = rolls();
    const c = w.s.recoilCondition, R = RECOIL_CONDITION;
    if (damage > 0) {
      if (r < w.s.recoilChance && (c === R.HitsOnly || c === R.HitsAndParries || c === R.AllAttacks)) w.hasCurrentAttackHit = true;
      return;
    }
    if (!isEnemy) return;
    if (parrySounds) {
      if (r < w.s.recoilChance && (c === R.HitsAndParries || c === R.ParriesOnly || c === R.ParriesAndMisses || c === R.AllAttacks)) w.hasCurrentAttackHit = true;
      if (w.s.playMissVFXEntity && pos) doClang(pos);
    } else {
      if (r < w.s.recoilChance && (c === R.ParriesAndMisses || c === R.MissesOnly || c === R.AllAttacks)) w.hasCurrentAttackHit = true;
      if (w.s.playMissVFXEntity && pos) doThud(pos);
    }
  }
  function vfxAt(pos) {
    const cam = ctx?.camera?.();
    if (!cam?.pos) return pos;
    const d = [cam.pos[0] - pos[0], cam.pos[1] - pos[1], cam.pos[2] - pos[2]];
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    if (w.s.playMissVFXPos === MISS_VFX_AT.Crosshair && cam.forward) {
      const k = len * 0.75;
      return [cam.pos[0] + cam.forward[0] * k, cam.pos[1] + cam.forward[1] * k, cam.pos[2] + cam.forward[2] * k];
    }
    return [pos[0] + d[0] / len * 0.75, pos[1] + d[1] / len * 0.75, pos[2] + d[2] / len * 0.75];
  }
  const doClang = (pos) => missEffect?.('CLANG', vfxAt(pos), { ...MISS_VFX, emissive: true });
  const doThud = (pos) => missEffect?.('THUD', vfxAt(pos), { ...MISS_VFX, emissive: false });
  function checkForEnvDamage() {
    if (!envHit) return false;
    let reach = ctx?.reach ?? 2.5;
    if (w.weaponState === S.StrikeUp) reach *= 1.25;
    const point = envHit(reach);
    if (!point) return false;
    if (w.s.playMissVFXEnvironment) doThud(point);
    return true;
  }

  function* playWeaponAnimation(state) {
    w.hasCurrentAttackHit = false;
    w.animatingCancel = false;
    let tickTime = widgetAnimTickTime(w.currentWeaponType, liveSpeed(), w.s.swing, animCtx()) / 5 / (w.s.swingSpeed || 1e-6);
    if (w.s.swingWindup === WINDUP.FirstFrame) changeWeaponState(state); else changeWeaponState(S.Idle);
    if (w.s.swingRecoveryOverride && recoveryOverride()) tickTime *= 0.5;
    while (machineIsAttacking() && machineFrame() < hitFrame()) {
      if (w.s.swingWindup === WINDUP.FirstFrame) w.currentFrame = 0;
      else if (w.s.swingWindup === WINDUP.Idle) {
        if (offsetOverride()) w.offsetTarget = leanFor(state, w.flipHorizontal);
        else w.offsetTarget = [0, 1];
      } else w.currentFrame = -1;
      yield FRAME;
    }
    // A pair hand's strike can end before its hit frame when the pair breaks, so the wind-up cannot wait forever.
    if (!machineIsAttacking()) { finishSwing(state); return; }
    changeWeaponState(state);
    playSwingSound();
    if (w.s.recoil && w.s.recoilEnvironment && checkForEnvDamage()) w.hasCurrentAttackHit = true;
    yield FRAME;
    if (w.hasCurrentAttackHit) {
      const hf = hitFrame();
      while (w.currentFrame < hf) { w.offsetTarget = [0, 0]; w.offsetCurrent = [0, 0]; w.currentFrame += 1; updateWeapon(); yield tickTime; }
      yield tickTime * 3;
    } else {
      while (w.currentFrame < numFrames(ctx?.machine?.isBow, STATE_NAMES[w.weaponState]) - 1) { w.offsetTarget = [0, 0]; w.offsetCurrent = [0, 0]; w.currentFrame += 1; updateWeapon(); yield tickTime; }
    }
    w.animatingCancel = true;
    const recover = w.s.swingRecoveryOverride && recoveryOverride();
    // The reverse runs once per swing, or Recovery = Last Frame would replay it on every lap of this loop.
    let reversed = false;
    while (machineIsAttacking()) {
      if (!reversed && (recover || w.hasCurrentAttackHit)) {
        reversed = true;
        while (w.currentFrame > 0) { w.offsetCurrent = [0, 0]; w.offsetTarget = [0, 0]; w.currentFrame -= 1; updateWeapon(); yield tickTime; }
        continue;
      }
      w.currentFrame = w.s.swingRecovery === RECOVERY.LastFrame ? numFrames(ctx?.machine?.isBow, STATE_NAMES[w.weaponState]) - 1 : -1;
      yield FRAME;
    }
    finishSwing(state);
  }
  function leanFor(state, flip) {
    if (flip) {
      if (state === S.StrikeUp) return [-1, 1];
      if (state === S.StrikeDownLeft || state === S.StrikeLeft) return [-1, 1];
      if (state === S.StrikeDown || state === S.StrikeDownRight) return [1, -1];
      if (state === S.StrikeRight) return [1, 0];
      return [0, 1];
    }
    if (state === S.StrikeUp) return [-1, 1];
    if (state === S.StrikeRight || state === S.StrikeDownRight) return [-1, 1];
    if (state === S.StrikeDown || state === S.StrikeDownLeft) return [1, -1];
    if (state === S.StrikeLeft) return [1, 0];
    return [0, 1];
  }
  function finishSwing(state) {
    changeWeaponState(S.Idle);
    let x = 1;
    if (!offsetOverride()) x = 0;
    else if (state === S.StrikeDown || state === S.StrikeUp) x = 0;
    else if (state === S.StrikeLeft || state === S.StrikeDownLeft) x = -1;
    w.offsetCurrent = [x, 1];
    w.hasCurrentAttackHit = false;
    w.animating = null;
  }
  function* playVanillaWeaponAnimation(state) {
    w.hasCurrentAttackHit = false;
    w.animatingCancel = false;
    const tickTime = widgetAnimTickTime(w.currentWeaponType, liveSpeed(), w.s.swing, animCtx());
    changeWeaponState(state);
    const last = () => numFrames(ctx?.machine?.isBow, STATE_NAMES[w.weaponState]) - 1;
    while (w.currentFrame < last() && !w.hasCurrentAttackHit) {
      w.offsetTarget = [0, 0]; w.offsetCurrent = [0, 0];
      w.currentFrame += 1; updateWeapon();
      if (w.currentFrame === hitFrame()) {
        playSwingSound();
        if (w.s.recoil && w.s.recoilEnvironment && checkForEnvDamage()) w.hasCurrentAttackHit = true;
      }
      yield tickTime;
    }
    while (w.currentFrame > 0 && w.hasCurrentAttackHit) {
      w.offsetTarget = [0, 0]; w.offsetCurrent = [0, 0];
      w.currentFrame -= 1; updateWeapon();
      if (w.currentFrame === hitFrame()) w.animatingCancel = true;
      yield tickTime;
    }
    while (machineIsAttacking()) {
      w.currentFrame = w.s.swingRecovery === RECOVERY.LastFrame ? last() : -1;
      yield FRAME;
    }
    finishSwing(state);
    w.animatingCancel = true;
  }
  function* playBowAnimation() {
    let cooldownTime = 0;
    const tick = CLASSIC_UPDATE_INTERVAL;
    if (bowDrawback()) {
      w.currentFrame = 0; changeWeaponState(S.StrikeUp); updateWeapon();
      const drawTime = 12; let drawTimer = 0;
      while (machineStateIndex() === S.StrikeUp) {
        let hold = drawTimer > drawTime || !!ctx?.activateStarted?.();
        if (!hold) {
          w.offsetTarget = [0, 0]; w.offsetCurrent = [0, 0];
          if (w.currentFrame < 3) { w.currentFrame += 1; updateWeapon(); drawTimer += tick; yield tick; continue; }
          hold = true;
        }
        drawTimer += ctx?.dt ?? 0;
        yield FRAME;
      }
      if (machineStateIndex() === S.StrikeDown) {
        // Silent on release: the machine's `bowSound` is the only sound for the shot.
        changeWeaponState(S.StrikeDown); updateWeapon();
        yield tick;
        while (machineStateIndex() === S.StrikeDown && w.currentFrame < BOW_NUM_FRAMES.StrikeDown - 1) {
          w.offsetTarget = [0, 0]; w.offsetCurrent = [0, 0];
          if (w.currentFrame === hitFrame()) cooldownTime = w.time + getBowCooldownTime(liveSpeed());
          w.currentFrame += 1; updateWeapon();
          yield tick;
        }
      } else {
        while (w.currentFrame > 0) { w.offsetTarget = [0, 0]; w.offsetCurrent = [0, 0]; w.currentFrame -= 1; updateWeapon(); yield tick; }
      }
      do { w.offsetTarget = [0, 1]; yield FRAME; } while (w.time < cooldownTime);
      changeWeaponState(S.Idle); w.currentFrame = 0; updateWeapon();
    } else {
      w.currentFrame = 3; changeWeaponState(S.StrikeDown); updateWeapon();
      yield tick;
      // The mod plays a swing sound here; it is skipped because the machine's `bowSound` already plays.
      cooldownTime = w.time + getBowCooldownTime(liveSpeed());
      yield tick;
      while (w.currentFrame < BOW_NUM_FRAMES.StrikeDown - 1) { w.offsetTarget = [0, 0]; w.offsetCurrent = [0, 0]; w.currentFrame += 1; updateWeapon(); yield tick; }
      do { w.offsetTarget = [0, 1]; yield FRAME; } while (w.time < cooldownTime);
      w.currentFrame = 3; changeWeaponState(S.StrikeDown); updateWeapon();
    }
    w.offsetCurrent = [0, 1];
    w.animating = null;
  }
  function playAttackAnimation(state) {
    if (w.animating && !w.animatingCancel) return;
    w.animating = null;
    let gen;
    if (w.currentWeaponType === T.Bow) gen = playBowAnimation();
    else if (w.s.swing) gen = playWeaponAnimation(state);
    else gen = playVanillaWeaponAnimation(state);
    const a = { gen, wait: 0 };
    w.animating = a;
    w.hasCurrentAttackHit = false;
    resume(a);
  }
  function resume(a) {
    let r;
    try { r = a.gen.next(); } catch (e) { console.warn('[weapon widget] a swing threw', e); if (w.animating === a) w.animating = null; return; }
    if (r.done) { if (w.animating === a) w.animating = null; return; }
    a.wait = r.value === FRAME ? FRAME : Math.max(0, Number(r.value) || 0);
  }
  // A `yield seconds` wait does not carry its remainder into the next wait, as in Unity.
  function stepSecondsWaits(dt) {
    const a = w.animating;
    if (!a || a.wait === FRAME) return;
    a.wait -= dt;
    if (a.wait > 0) return;
    a.wait = 0;
    resume(a);
  }
  function endOfFrame() {
    const a = w.animating;
    if (!a || a.wait !== FRAME) return;
    a.wait = 0;
    resume(a);
  }

  function doubledIdleNow() {
    if (!w.s.doubleScale || w.s.trueSize || !w.art) return false;
    const record = w.currentWeaponType === T.Bow ? 0 : anims()?.[w.weaponState]?.Record;
    return record != null && !!customTexture(record, Math.max(0, w.currentFrame))?.doubled;
  }

  /**
   * @param dt
   * @param c
   */
  function lateUpdate(dt, c) {
    ctx = c;
    c.dt = dt;
    w.s = settings();
    // The left hand of a pair uses the right hand's clock, so both hands bob in phase.
    if (c.clockOf) {
      const k = c.clockOf.clock;
      if (lastSettledHidden()) { w.moveSmooth = k.moveSmooth; w.bobSmooth = [...k.bobSmooth]; }
      w.time = k.time;
    } else w.time += dt;
    if (w.born) { w.born = false; if (c.shown) { w.offsetCurrent = [0, 0]; w.offsetTarget = [0, 0]; } }
    stepSecondsWaits(dt);
    w.screenRect = { x: 0, y: 0, width: c.canvas?.width ?? NATIVE_W, height: c.canvas?.height ?? NATIVE_H };
    w.leftHanded = !!handedness();
    w.art = c.art ?? null;
    w.position = [0, 0]; w.scale = [1, 1]; w.offset = [0, 0]; w.armsPosition = [0, 0];
    w.swayDx = { bob: 0, inertia: 0 };
    if (c.weapon !== w.specificWeapon) {
      if (c.weapon) {
        w.specificWeapon = c.weapon;
        if (!bowDrawback() && weaponTypeForItem(c.weapon) === T.Bow) { w.currentFrame = 3; changeWeaponState(S.StrikeDown); }
        else changeWeaponState(S.Idle);
      } else { w.specificWeapon = null; changeWeaponState(S.Idle); }
    }
    const enchanted = !!(w.specificWeapon && isEnchanted(w.specificWeapon));
    if (c.weaponType !== w.currentWeaponType || c.material !== w.currentMetalType
      || (w.specificWeapon?.templateIndex ?? -1) !== w.currentTemplateIndex || enchanted !== w.lastEnchanted || w.s.doubleScale !== w.lastDoubleScale) {
      loadWeaponAtlas();
      w.lastEnchanted = enchanted; w.lastDoubleScale = w.s.doubleScale;
    }
    w.weaponOffsetHeight = weaponOffsetHeight();
    if (w.lastSheathed === null) w.lastSheathed = c.sheathed;
    if (c.sheathed !== w.lastSheathed) { if (c.sheathed) playSheatheSound(); w.lastSheathed = c.sheathed; }
    // A pair hand is never flipped here: the rig mirrors the left one whole instead.
    if (c.pairHand) {
      if (w.flipHorizontal) { w.flipHorizontal = false; changeWeaponState(S.Idle); }
    } else if (w.s.ambidexterity && !c.sheathed) {
      let want;
      if (c.weaponType === T.Bow) want = w.s.mirrorBows ? !w.leftHanded : w.leftHanded;
      else if (!usingRightHand()) want = !w.leftHanded;
      else want = mirrorOverride() ? !w.leftHanded : w.leftHanded;
      if (w.flipHorizontal !== want) { w.flipHorizontal = want; changeWeaponState(S.Idle); }
    } else if (!w.s.ambidexterity && w.flipHorizontal !== w.leftHanded) {
      w.flipHorizontal = w.leftHanded;
      changeWeaponState(S.Idle);
    }
    if (machineIsAttacking() && !w.animating) {
      const st = machineStateIndex();
      let play = st;
      if (w.s.swingNoDaggerRight && (w.currentWeaponType === T.Dagger || w.currentWeaponType === T.Dagger_Magic)) {
        if (w.flipHorizontal) { if (st === S.StrikeLeft) play = S.StrikeRight; else if (st === S.StrikeDownLeft) play = S.StrikeDownRight; }
        else if (st === S.StrikeRight) play = S.StrikeLeft; else if (st === S.StrikeDownRight) play = S.StrikeDownLeft;
      }
      if (c.fromBelow && w.s.offset) w.offsetCurrent = [0, 1];
      playAttackAnimation(play);
    }
    const m = c.motion ?? {};
    const speedRatio = Number.isFinite(m.speedRatio) ? m.speedRatio : 1;
    const animating = !!w.animating;
    const flip = w.flipHorizontal;
    if (w.s.offset) {
      const o = offsetStep({
        offsetCurrent: w.offsetCurrent, offsetTarget: w.offsetTarget,
        animating, shown: c.shown, equipCountdown: c.equipCountdown ?? 0,
      }, dt, offsetSpeedLive());
      w.offsetCurrent = o.offsetCurrent; w.offsetTarget = o.offsetTarget;
      w.offset = [w.offset[0] + o.delta[0], w.offset[1] + o.delta[1]];
    }
    let bobbing = machineStateIndex() === S.Idle;
    if (!bobbing && w.currentWeaponType === T.Bow && (w.weaponState === S.StrikeUp || w.weaponState === S.StrikeDown)) bobbing = true;
    if (w.s.bob && bobbing) {
      // The sprite takes the centered doubled bob only with a doubled `w_` hit; the arms always use the plain bob.
      const b = bobStep({
        moveSmooth: w.moveSmooth, bobSmooth: w.bobSmooth, time: w.time, screenRect: w.screenRect,
        doubleScaleIdle: w.weaponState === S.Idle && doubledIdleNow(),
      }, w.s, { ...m, speedRatio }, dt);
      w.moveSmooth = b.moveSmooth; w.bobSmooth = b.bobSmooth;
      w.position = [w.position[0] + b.delta[0], w.position[1] + b.delta[1]];
      w.swayDx.bob += b.delta[0];
      const ba = bobStep({
        moveSmooth: w.armsMoveSmooth, bobSmooth: w.armsBobSmooth, time: w.time, screenRect: w.screenRect, doubleScaleIdle: false,
      }, w.s, { ...m, speedRatio }, dt);
      w.armsMoveSmooth = ba.moveSmooth; w.armsBobSmooth = ba.bobSmooth;
      w.armsPosition = [w.armsPosition[0] + ba.delta[0], w.armsPosition[1] + ba.delta[1]];
    } else if (w.s.bob) {
      // Out of the idle the bob eases back to rest, like the shield bob, so a swing never starts with a jump.
      w.bobSmooth = moveTowards2(w.bobSmooth, [0, 0], dt * w.s.bobSmoothSpeed);
      w.armsBobSmooth = moveTowards2(w.armsBobSmooth, [0, 0], dt * w.s.bobSmoothSpeed);
      w.position = [w.position[0] + w.bobSmooth[0], w.position[1] + w.bobSmooth[1]];
      w.armsPosition = [w.armsPosition[0] + w.armsBobSmooth[0], w.armsPosition[1] + w.armsBobSmooth[1]];
      w.swayDx.bob += w.bobSmooth[0];
    }
    if (w.s.inertia && w.weaponState === S.Idle) {
      const i = inertiaStep({
        inertiaCurrent: w.inertiaCurrent, inertiaTarget: w.inertiaTarget,
        inertiaForwardCurrent: w.inertiaForwardCurrent, inertiaForwardTarget: w.inertiaForwardTarget,
        screenRect: w.screenRect, flip, look: c.look ?? [0, 0], cursorActive: c.cursorActive, swingHeld: c.swingHeld,
      }, w.s, m, dt);
      w.inertiaTarget = i.inertiaTarget; w.inertiaSpeedMod = i.inertiaSpeedMod;
      w.inertiaCurrent = i.inertiaCurrent;
      w.inertiaForwardTarget = i.inertiaForwardTarget; w.inertiaForwardCurrent = i.inertiaForwardCurrent;
      w.scale = [w.scale[0] + i.scale[0], w.scale[1] + i.scale[1]];
      w.position = [w.position[0] + i.delta[0], w.position[1] + i.delta[1]];
      w.swayDx.inertia += i.delta[0];
      w.armsPosition = [w.armsPosition[0] + i.delta[0], w.armsPosition[1] + i.delta[1]];
    }
    // The half-size shift belongs to the doubled `w_` box only; on any other box it pushes the sprite off screen.
    if ((w.weaponState === S.Idle || (w.currentWeaponType === T.Bow && w.currentFrame === 0)) && doubledIdleNow()) {
      w.offset = w.currentWeaponType === T.Werecreature ? [w.offset[0], w.offset[1] + 0.5] : [w.offset[0] + 0.5, w.offset[1] + 0.5];
    }
    updateWeapon();
  }

  function draw(renderer, canvas, tint = null, { transform = null, mirror = false, pose = null } = {}) {
    if (!ctx || !w.art || !renderer || !canvas) return false;
    if (ctx.weaponType === T.None) return false;
    // Returns true while the clone chooses to draw nothing, so the rig does not fall back to the classic sprite.
    // Only a missing context, art, animation, record, or texture returns false.
    if (w.currentFrame === -1 || !w.showWeapon || ctx.thirdPerson) return true;
    if (!w.s.offset && !ctx.shown) return true;
    const a = anims();
    if (!a) return false;
    const record = ctx.weaponType === T.Bow ? 0 : a[w.weaponState].Record;
    const rec = w.art.records[record];
    if (!rec) return false;
    const tex = w.curCustomTexture?.tex ?? rec.frames[Math.min(Math.max(0, w.currentFrame), rec.frames.length - 1)];
    if (!tex) return false;
    if (!transform && !mirror && !pose) {
      renderer.drawScreenQuad(tex, getWeaponRect(), w.curAnimRect, tint ?? undefined);
      if (ctx.glow) renderer.drawScreenQuadGlow?.(tex, getWeaponRect(), w.curAnimRect, ctx.glow, { art: [rec.width, rec.height], view: [canvas.width, canvas.height] });
      return true;
    }
    let rect = pairRect(mirror);
    if (transform) rect = transform(rect);
    if (mirror) rect = mirrorRect(rect, w.screenRect.width, w.screenRect.x);
    rect = poseStrikeRect(rect, pose, canvas.height, mirror);
    const uv = mirror ? { u0: w.curAnimRect.u1, v0: w.curAnimRect.v0, u1: w.curAnimRect.u0, v1: w.curAnimRect.v1 } : w.curAnimRect;
    renderer.drawScreenQuad(tex, rect, uv, tint ?? undefined);
    if (ctx.glow) renderer.drawScreenQuadGlow?.(tex, rect, uv, ctx.glow, { art: [rec.width, rec.height], view: [canvas.width, canvas.height] });
    return true;
  }
  // True even while the clone draws nothing, so the flip and the spell hand side hold through a Hide wind-up.
  function applies() { return !!ctx && !!w.art && ctx.weaponType !== T.None; }
  function drawing() {
    if (!applies()) return false;
    if (w.currentFrame === -1 || !w.showWeapon || ctx.thirdPerson) return false;
    return !!(w.s.offset || ctx.shown);
  }

  // The arms skip the Offset slide; they sheathe with their own clips.
  function armsTransform(base) {
    return transformRect(base, { flip: false, scaleIt: true, withOffset: false, position: w.armsPosition });
  }

  return {
    lateUpdate, draw, drawing, applies, endOfFrame, onAttackDamageCalculated, armsTransform, transformRect, pairRect,
    setShowWeapon(v) { w.showWeapon = !!v; },
    setThirdPerson(v) { w.isInThirdPerson = !!v; },
    get position() { return [w.position[0], w.position[1]]; },
    get scale() { return [w.scale[0], w.scale[1]]; },
    get offset() { return [w.offset[0], w.offset[1]]; },
    get settledHidden() { return lastSettledHidden(); },
    get clock() { return { time: w.time, moveSmooth: w.moveSmooth, bobSmooth: [w.bobSmooth[0], w.bobSmooth[1]] }; },
    get state() { return w.weaponState; },
    get frame() { return w.currentFrame; },
    get flipHorizontal() { return w.flipHorizontal; },
    get animating() { return !!w.animating; },
    get hasCurrentAttackHit() { return w.hasCurrentAttackHit; },
    get rect() { return getWeaponRect(); },
    get weaponPosition() { return { ...w.weaponPosition }; },
    get settings() { return w.s; },
    _w: w,
  };
}
