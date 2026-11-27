// @ts-check
// Shield Widget 1.6 (RedRoryOTheGlen), ported from the mod's compiled IL: draws the classic shield sprite in
// first person while a shield is in the left hand. Its coroutines are generators: yield seconds or FRAME.

import { modSettingsOf } from '../mods/modSettings.js';
import { getInt } from '../platform/settings.js';
import { liveStat } from '../characters/statMods.js';
import { IDLE_BREATH, moveTowards, moveTowards2, snap, STEP_CONDITION } from './weaponWidgetMotion.js';
export { STEP_CONDITION };
import { shieldProtectedBodyParts } from './enemyEquipment.js';
import { NATIVE_W, NATIVE_H } from './fpsWeapon.js';
// Read here, not in weaponRig.js: importing hudLarge.js there reorders the module graph and breaks the rig's boot.
import { weaponOffsetHeight } from '../ui/hudLarge.js';

export const SHIELD_WIDGET_VENDOR = 'shield-widget';

export const SHIELD_POSE = Object.freeze({ Hide: 0, OffScreen: 1, Corner: 2, Ready: 3 });
export const ANIM_DIRECTION = Object.freeze({ Both: 0, ForwardOnly: 1, ReverseOnly: 2 });
export const SHIELD_RECOIL_CONDITION = Object.freeze({
  HitOnShield: 0, MissOnShield: 1, AttackOnShield: 2, AnyHit: 3, AnyMiss: 4, AnyAttack: 5,
});

export const SHIELD_TEMPLATES = Object.freeze({ Buckler: 109, Round: 110, Kite: 111, Tower: 112 });
export const SHIELD_ARCHIVE_FIRST = 112360;
export const SHIELD_FRAMES = 5;
export const SHIELD_RECORDS = 30;
export const SHIELD_TEXTURE_COUNT = 600;

export const PARRY_CLIP_FIRST = 428;
export const PARRY_CLIP_COUNT = 9;

const FRAME = 'frame';

export function readShieldWidgetSettings(read = () => modSettingsOf(SHIELD_WIDGET_VENDOR)) {
  const s = read();
  const num = (k, d = 0) => { const v = Number(s[k]); return Number.isFinite(v) ? v : d; };
  return {
    enabled: !!s.Enabled,
    offsetX: num('Shield.OffsetHorizontal', 0.5), offsetY: num('Shield.OffsetVertical', 0.5),
    scale: num('Shield.Scale', 1), offsetSpeed: num('Shield.Speed', 1) * 5000,
    whenSheathed: s['Shield.WhenSheathed'] | 0, whenAttacking: s['Shield.WhenAttacking'] | 0,
    whenCasting: s['Shield.WhenCasting'] | 0, lockAspectRatio: !!s['Shield.LockAspectRatio'],
    conditionThresholdUpper: s['Shield.ConditionThresholdUpper'] | 0,
    conditionThresholdLower: s['Shield.ConditionThresholdLower'] | 0,
    bob: !!s['Modules.Bob'], inertia: !!s['Modules.Inertia'], animated: !!s['Modules.Animation'],
    stepTransforms: !!s['Modules.Step'], recoil: !!s['Modules.Recoil'],
    bobLength: (s['Bob.Length'] | 0) / 100, bobOffset: num('Bob.Offset'),
    bobSizeXMod: num('Bob.SizeX', 1) * 2, bobSizeYMod: num('Bob.SizeY', 1) * 2,
    moveSmoothSpeed: num('Bob.SpeedMove', 1) * 4, bobSmoothSpeed: num('Bob.SpeedState', 1) * 500,
    bobShape: (s['Bob.Shape'] | 0) * 0.5, bobWhileIdle: !!s['Bob.BobWhileIdle'],
    inertiaScale: num('Inertia.Scale', 1) * 500, inertiaSpeed: num('Inertia.Speed', 1) * 500,
    inertiaForwardScale: num('Inertia.ForwardDepth', 1) * 0.2, inertiaForwardSpeed: num('Inertia.ForwardSpeed', 1) * 0.2,
    // Animation.Speed is inverted: a bigger number is a shorter animation.
    animationTime: 1 - num('Animation.Speed', 1) * 0.5, animationDirection: s['Animation.Direction'] | 0,
    stepLength: s['Step.Length'] | 0, stepCondition: s['Step.Condition'] | 0,
    recoilScale: num('Recoil.Scale', 1) * 2, recoilOffset: !!s['Recoil.Offset'],
    recoilSpeed: num('Recoil.Speed', 1) * 0.5, recoilCondition: s['Recoil.Condition'] | 0,
    scaleTextureFactor: Math.max(1, s['Compatibility.TextureScaleFactor'] | 0),
  };
}

// An unknown template answers 0, as the mod's switch default does, so a modded shield draws as a buckler.
export function shieldArchiveBase(templateIndex) {
  switch (templateIndex) {
    case SHIELD_TEMPLATES.Buckler: return 0;
    case SHIELD_TEMPLATES.Round: return 150;
    case SHIELD_TEMPLATES.Kite: return 300;
    case SHIELD_TEMPLATES.Tower: return 450;
    default: return 0;
  }
}

// Leather, chain, and silver share group 0 in the mod's table, so a silver shield draws the leather art.
export function shieldMaterialOffset(nativeMaterialValue) {
  switch (nativeMaterialValue) {
    case 0: return 0;
    case 256: return 0;
    case 512: return 5;
    case 513: return 10;
    case 514: return 0;
    case 515: return 15;
    case 516: return 20;
    case 517: return 25;
    case 518: return 30;
    case 519: return 35;
    case 520: return 40;
    case 521: return 45;
    default: return 0;
  }
}

export function shieldConditionOffset(conditionPercentage, upper, lower) {
  if (conditionPercentage <= lower) return 100;
  if (conditionPercentage <= upper) return 50;
  return 0;
}

export function shieldTextureIndex(item, upper, lower) {
  return shieldArchiveBase(item?.templateIndex ?? -1)
    + shieldMaterialOffset(item?.nativeMaterialValue ?? 0)
    + shieldConditionOffset(item?.conditionPercentage ?? 100, upper, lower);
}

export function shieldTextureName(index) {
  const archive = SHIELD_ARCHIVE_FIRST + Math.floor(index / (SHIELD_RECORDS * SHIELD_FRAMES));
  const within = index % (SHIELD_RECORDS * SHIELD_FRAMES);
  return { archive, record: Math.floor(within / SHIELD_FRAMES), frame: within % SHIELD_FRAMES };
}

export function isPartShielded(item, bodyPart) {
  const parts = shieldProtectedBodyParts(item?.coverTemplate ?? item?.templateIndex ?? -1);
  for (let i = 0; i < parts.length; i++) if (parts[i] === bodyPart) return true;
  return false;
}

export function shieldAnimationGroup(item) {
  if (!item) return 'Unarmed_';
  const t = item.templateIndex;
  if (t === SHIELD_TEMPLATES.Buckler) return 'ShieldHand_';
  if (t - SHIELD_TEMPLATES.Round <= 2 && t >= SHIELD_TEMPLATES.Round) return 'ShieldArm_';
  return 'Unarmed_';
}

const v2 = (x, y) => [x, y];
const add2 = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul2 = (a, k) => [a[0] * k, a[1] * k];
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mag2 = (a) => Math.hypot(a[0], a[1]);
const nonZero2 = (a) => a[0] !== 0 || a[1] !== 0;
const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));
const rectEq = (a, b) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

// The mod has one component but every rig here has its own, and only the rig on screen steps.
// A widget that missed a shared step marks itself stale and rereads its sprite, since the shield may have changed.
let _widgetSteps = 0;

export function createShieldWidget({
  settings = readShieldWidgetSettings, textures = null, audio = null, rolls = Math.random,
  handedness = () => getInt('Controls', 'Handedness', 0, 3) === 1,
} = {}) {
  const w = {
    shieldTexture: 0, indexCurrent: 0, frameCurrent: 0,
    shieldPositionCurrent: { x: 0, y: 0, width: 0, height: 0 },
    shieldPositionTarget: { x: 0, y: 0, width: 0, height: 0 },
    curAnimRect: { u0: 0, v0: 0, u1: 1, v1: 1 },
    screenRect: { x: 0, y: 0, width: NATIVE_W, height: NATIVE_H },
    screenRectLast: { x: 0, y: 0, width: NATIVE_W, height: NATIVE_H },
    weaponScaleX: 1, weaponScaleY: 1, weaponOffsetHeight: 0, weaponOffsetHeightLast: 0,
    position: [0, 0], offset: [0, 0], scale: [1, 1],
    moveSmooth: 0, bobSmooth: [0, 0],
    inertiaCurrent: [0, 0], inertiaTarget: [0, 0], inertiaSpeedMod: 1,
    inertiaForwardCurrent: [0, 0], inertiaForwardTarget: [0, 0],
    recoilCurrent: [0, 0], recoiling: null, animating: null,
    attacked: false, sheathed: false, spelled: false,
    lastTemplate: -1, flipped: false, conditionPrevious: 0,
    lastStep: -1, stale: false,
    attackDelayTimer: 0, attackDelayTime: 0.1, isInThirdPerson: false,
    started: false, awoke: false, s: settings(),
  };
  let ctx = null;

  const texSize = (i) => (textures?.size ? textures.size(i) : null);
  const texW = () => texSize(w.shieldTexture)?.width ?? 0;
  const texH = () => texSize(w.shieldTexture)?.height ?? 0;
  const haveTexture = () => w.shieldTexture >= 0 && !!texSize(w.shieldTexture);
  const liveSpeed = () => (ctx?.entity ? liveStat(ctx.entity, 'speed') : 50);

  const offsetSpeedLive = () => liveSpeed() / 100 * w.s.offsetSpeed;
  const animationTimeLive = () => w.s.animationTime / (liveSpeed() / 50);

  const spriteW = () => texW() * w.s.scale * w.weaponScaleX / w.s.scaleTextureFactor;
  const spriteH = () => texH() * w.s.scale * w.weaponScaleY / w.s.scaleTextureFactor;
  function measure() {
    w.weaponScaleX = w.screenRect.width / NATIVE_W;
    w.weaponScaleY = w.s.lockAspectRatio ? w.weaponScaleX : w.screenRect.height / NATIVE_H;
  }

  function playImpactSound() {
    const clip = PARRY_CLIP_FIRST + Math.floor(rolls() * PARRY_CLIP_COUNT);
    // The IL passes (clip, spatialBlend 0, volumeScale 1.1); this playOneShot takes (clip, volume, pitch).
    audio?.playOneShot?.(clip, 1.1, 1);
  }

  function* animateShield(start, end, time) {
    const interval = time / 5;
    w.frameCurrent = start;
    while (w.frameCurrent !== end) {
      if (start > end) w.frameCurrent--; else w.frameCurrent++;
      w.shieldTexture = w.indexCurrent + w.frameCurrent;
      yield interval;
    }
    w.animating = null;
  }
  function* blockCoroutine(magnitude) {
    setBlock();
    while (!rectEq(w.shieldPositionCurrent, w.shieldPositionTarget)) yield FRAME;
    w.recoilCurrent = add2(w.recoilCurrent, [magnitude, magnitude]);
    playImpactSound();
    yield 0.5;
    if (w.attacked || ctx?.sheathed) setAttack(); else setGuard();
  }

  function startAnimating(gen) { w.animating = { gen, wait: 0 }; resume(w.animating); }
  function startRecoiling(gen) { w.recoiling = { gen, wait: 0 }; resume(w.recoiling); }
  function resume(a) {
    let r;
    try { r = a.gen.next(); } catch (e) {
      console.warn('[shield widget] a coroutine threw', e);
      if (w.animating === a) w.animating = null;
      if (w.recoiling === a) w.recoiling = null;
      return;
    }
    if (r.done) {
      if (w.animating === a) w.animating = null;
      if (w.recoiling === a) w.recoiling = null;
      return;
    }
    a.wait = r.value === FRAME ? FRAME : Math.max(0, Number(r.value) || 0);
  }
  function stepSecondsWaits(dt) {
    for (const a of [w.animating, w.recoiling]) {
      if (!a || a.wait === FRAME) continue;
      a.wait -= dt;
      if (a.wait > 0) continue;
      a.wait = 0;
      resume(a);
    }
  }
  function endOfFrame() {
    for (const a of [w.animating, w.recoiling]) {
      if (!a || a.wait !== FRAME) continue;
      a.wait = 0;
      resume(a);
    }
  }

  function setGuard() {
    measure();
    if (w.s.animated) {
      if (w.frameCurrent !== 0) {
        if (w.s.animationDirection === ANIM_DIRECTION.ForwardOnly) {
          w.frameCurrent = 0;
          w.shieldTexture = w.indexCurrent + w.frameCurrent;
        } else {
          startAnimating(animateShield(4, 0, animationTimeLive()));
        }
      }
    } else if (w.frameCurrent !== 0) {
      w.frameCurrent = 0;
      w.shieldTexture = w.indexCurrent + w.frameCurrent;
    }
    const r = w.screenRect;
    w.shieldPositionTarget = {
      x: w.flipped ? r.x + r.width - r.width * 0.5 * w.s.offsetX : r.x + r.width * 0.5 * w.s.offsetX,
      y: r.y + r.height - w.weaponOffsetHeight - r.height * 0.25 * w.s.offsetY,
      width: spriteW(), height: spriteH(),
    };
  }

  function setAttack() {
    measure();
    const r = w.screenRect;
    if (w.s.animated) {
      if (w.frameCurrent !== 4) {
        if (w.s.animationDirection === ANIM_DIRECTION.ReverseOnly) {
          w.frameCurrent = 4;
          w.shieldTexture = w.indexCurrent + w.frameCurrent;
        } else {
          startAnimating(animateShield(0, 4, animationTimeLive()));
        }
      }
      w.shieldPositionTarget = {
        x: w.flipped ? r.x + r.width - r.width * 0.5 * w.s.offsetX : r.x + r.width * 0.5 * w.s.offsetX,
        y: r.y + r.height - w.weaponOffsetHeight - r.height * 0.25 * w.s.offsetY,
        width: spriteW(), height: spriteH(),
      };
      return;
    }
    if (w.frameCurrent !== 0) {
      w.frameCurrent = 0;
      w.shieldTexture = w.indexCurrent + w.frameCurrent;
    }
    // Poses follow the DLL's order: sheathed, then casting, then attacking.
    const poseFor = (mode) => (!w.spelled && !w.attacked && w.s.whenSheathed === mode)
      || (w.spelled && w.s.whenCasting === mode)
      || (w.attacked && w.s.whenAttacking === mode);
    const width = spriteW(), height = spriteH();
    if (poseFor(SHIELD_POSE.Corner)) {
      w.shieldPositionTarget = {
        x: w.flipped ? r.x + r.width : r.x,
        y: r.y + r.height - w.weaponOffsetHeight,
        width, height,
      };
      return;
    }
    if (poseFor(SHIELD_POSE.OffScreen)) {
      w.shieldPositionTarget = {
        x: w.flipped ? r.x + r.width + width : r.x - width,
        y: r.y + r.height - w.weaponOffsetHeight + height,
        width, height,
      };
    }
  }

  function setBlock() {
    measure();
    if (w.s.animated) {
      if (w.frameCurrent !== 0) {
        if (w.s.animationDirection === ANIM_DIRECTION.ForwardOnly) {
          w.frameCurrent = 0;
          w.shieldTexture = w.indexCurrent + w.frameCurrent;
        } else {
          startAnimating(animateShield(4, 0, animationTimeLive()));
        }
      }
    } else if (w.frameCurrent !== 0) {
      w.frameCurrent = 0;
      w.shieldTexture = w.indexCurrent + w.frameCurrent;
    }
    const r = w.screenRect;
    const rect = {
      x: w.flipped ? r.x + r.width - r.width * 0.5 * 1.0 : r.x + r.width * 0.5 * 1.0,
      y: r.y + r.height - w.weaponOffsetHeight - r.height * 0.25 * 0.8,
      width: spriteW(), height: spriteH(),
    };
    // Kept from the mod: this branch writes the current position, so a left-handed animated block snaps.
    if (w.s.animated && w.flipped) w.shieldPositionCurrent = rect;
    else w.shieldPositionTarget = rect;
  }

  function refreshShield() {
    if (ctx?.sheathed || ctx?.attacking) setAttack(); else setGuard();
  }

  function updateShieldTextures(item) {
    w.conditionPrevious = item?.conditionPercentage ?? 0;
    w.indexCurrent = shieldTextureIndex(item, w.s.conditionThresholdUpper, w.s.conditionThresholdLower);
    w.shieldTexture = w.indexCurrent + w.frameCurrent;
  }

  // The condition check fires on a downward crossing of either threshold and repoints the sheet.
  function hitShield(damage, item) {
    if (!w.s.recoil) return;
    const c = w.s.recoilCondition;
    let kick;
    if (c === SHIELD_RECOIL_CONDITION.HitOnShield || c === SHIELD_RECOIL_CONDITION.AnyHit) kick = damage > 0;
    else if (c === SHIELD_RECOIL_CONDITION.MissOnShield || c === SHIELD_RECOIL_CONDITION.AnyMiss) kick = damage < 1;
    else kick = true;
    if (kick) {
      const magnitude = 0.1 + damage * 0.01;
      if (w.s.recoilOffset && !w.attacked) {
        startRecoiling(blockCoroutine(magnitude));
      } else {
        w.recoilCurrent = add2(w.recoilCurrent, [magnitude, magnitude]);
        playImpactSound();
      }
    }
    const cond = item?.conditionPercentage ?? 0;
    const upper = w.s.conditionThresholdUpper, lower = w.s.conditionThresholdLower;
    if ((cond <= upper && w.conditionPrevious > upper) || (cond <= lower && w.conditionPrevious > lower)) {
      updateShieldTextures(item);
      return;
    }
    w.conditionPrevious = cond;
  }

  function onAttackDamageCalculated({ targetIsPlayer = false, bodyPart = -1, damage = 0, item = null } = {}) {
    if (!targetIsPlayer || !w.s.recoil) return;
    if (!item || !item.isShield) return;
    if (w.s.recoilCondition > SHIELD_RECOIL_CONDITION.AttackOnShield) { hitShield(damage, item); return; }
    if (isPartShielded(item, bodyPart)) hitShield(damage, item);
  }

  function getShieldRect() {
    const r = { ...w.shieldPositionCurrent };
    r.x += w.position[0];
    r.y += w.position[1];
    r.width += r.width * w.scale[0];
    r.height += r.height * w.scale[1];
    r.x -= r.width * 0.5;
    r.y -= r.height * 0.5;
    r.x += r.width * w.offset[0];
    r.y += r.height * w.offset[1];
    const hud = w.weaponOffsetHeight;
    const sr = w.screenRect;
    r.y = clamp(r.y, sr.height - r.height - hud, sr.height);
    if (w.s.animated) {
      r.x = w.flipped
        ? clamp(r.x, sr.x + sr.width - r.width, sr.x + sr.width)
        : clamp(r.x, -r.width, 0);
    }
    if (w.s.stepTransforms) {
      const step = w.s.stepLength * (sr.height / 64);
      r.x = snap(r.x, step);
      r.y = snap(r.y, step);
    }
    return r;
  }

  function lateUpdate(next) {
    const step = ++_widgetSteps;
    if (w.lastStep !== step - 1) w.stale = true;
    w.lastStep = step;
    ctx = next || null;
    w.s = settings();
    const dt = Math.max(0, Number(ctx?.dt) || 0);
    stepSecondsWaits(dt);
    if (!w.started) { w.flipped = !!handedness(); w.curAnimRect = w.flipped ? { u0: 1, v0: 0, u1: 0, v1: 1 } : { u0: 0, v0: 0, u1: 1, v1: 1 }; w.started = true; }

    w.position = [0, 0]; w.offset = [0, 0]; w.scale = [0, 0];
    if (!haveTexture() || !ctx?.entity) return;

    const attacking = !!ctx.attacking;
    const item = ctx.item ?? null;
    if (!item || !item.isShield) { w.lastTemplate = -1; return; }
    if ((Number(ctx.equipCountdownLeftHand) || 0) > 0 || ctx.isClimbing || ctx.isPaused || ctx.loadInProgress) return;

    const sr = ctx.screenRect ?? { x: 0, y: 0, width: NATIVE_W, height: NATIVE_H };
    w.screenRect = { x: sr.x ?? 0, y: sr.y ?? 0, width: sr.width ?? NATIVE_W, height: sr.height ?? NATIVE_H };
    w.weaponOffsetHeight = Math.trunc(Number(ctx.largeHudHeight ?? weaponOffsetHeight()) || 0);
    if (!rectEq(w.screenRect, w.screenRectLast) || w.weaponOffsetHeight !== w.weaponOffsetHeightLast) refreshShield();
    w.screenRectLast = { ...w.screenRect };
    w.weaponOffsetHeightLast = w.weaponOffsetHeight;

    // The mod keys on template + material, and those sums collide, so this keys on the pair.
    const template = (item.templateIndex | 0) * 1024 + (item.nativeMaterialValue | 0);
    if (w.lastTemplate !== template) {
      updateShieldTextures(item);
      refreshShield();
      w.lastTemplate = template;
      w.attacked = false; w.sheathed = false; w.spelled = false;
    } else if (w.stale) updateShieldTextures(item);
    w.stale = false;
    // The shield opens in its stance instead of sliding in from the screen origin.
    if (!w.awoke) { w.awoke = true; w.shieldPositionCurrent = { ...w.shieldPositionTarget }; }

    const away = (mode) => mode === SHIELD_POSE.OffScreen || mode === SHIELD_POSE.Corner;
    if (attacking) {
      if (!w.attacked) {
        w.attacked = true;
        if (away(w.s.whenAttacking)) setAttack(); else setGuard();
        w.attackDelayTimer = 0;
      }
    } else if (w.attacked) {
      if (w.attackDelayTimer > w.attackDelayTime) { w.attacked = false; refreshShield(); }
      else w.attackDelayTimer += dt;
    }

    const casting = !!ctx.castingAnim || !!ctx.hasReadySpell;
    if (casting && !attacking) {
      if (!w.spelled) {
        w.spelled = true;
        if (away(w.s.whenCasting)) setAttack(); else setGuard();
      }
    } else if (!attacking && w.spelled) { w.spelled = false; refreshShield(); }

    if (ctx.sheathed && !casting) {
      if (!w.sheathed) {
        w.sheathed = true;
        if (away(w.s.whenSheathed)) setAttack(); else setGuard();
      }
    } else if (!casting && w.sheathed) { w.sheathed = false; refreshShield(); }

    const eased = moveTowards2(
      [w.shieldPositionCurrent.x, w.shieldPositionCurrent.y],
      [w.shieldPositionTarget.x, w.shieldPositionTarget.y],
      dt * offsetSpeedLive());
    w.shieldPositionCurrent = {
      x: eased[0], y: eased[1],
      width: w.shieldPositionTarget.width, height: w.shieldPositionTarget.height,
    };

    const motor = ctx.motor ?? {};
    const baseSpeed = Number(motor.baseSpeed) || 1;
    const speedRatio = (Number(motor.speed) || 0) / baseSpeed;
    const settled = !attacking && rectEq(w.shieldPositionCurrent, w.shieldPositionTarget) && !w.animating;

    if (w.s.bob) {
      let bobTarget = [0, 0];
      if (settled) {
        const grounded = motor.isGrounded ? 1 : 0;
        w.moveSmooth = moveTowards(w.moveSmooth, grounded, dt * w.s.moveSmoothSpeed);
        let s = speedRatio;
        if (motor.isCrouching) s *= 0.5;
        if (motor.isRiding) s *= 0.5;
        let reach = s;
        if (motor.isStandingStill) { s = w.s.bobWhileIdle ? IDLE_BREATH.rate : 0; reach = w.s.bobWhileIdle ? IDLE_BREATH.size : 0; }
        const freq = baseSpeed * 1.25 * s * w.s.bobLength;
        const freq2 = freq * 2;
        const amp = 0.01;
        const size = [w.screenRect.width * amp * reach * w.s.bobSizeXMod, w.screenRect.height * amp * reach * w.s.bobSizeYMod];
        let sx = 1; const sy = 1;
        if (w.flipped) sx *= -1;
        if (w.s.inertia && !w.s.animated) sx = 0;
        const time = Number(ctx.time) || 0;
        bobTarget = [
          (sx + Math.sin(w.s.bobOffset + time * freq)) * -size[0],
          (sy - Math.sin(w.s.bobOffset + w.s.bobShape + time * freq2)) * size[1],
        ];
      }
      w.bobSmooth = mul2(moveTowards2(w.bobSmooth, bobTarget, dt * w.s.bobSmoothSpeed), w.moveSmooth);
      w.position = add2(w.position, w.bobSmooth);
    }

    if (w.s.inertia) {
      if (!settled || w.frameCurrent !== 0) {
        w.inertiaCurrent = [0, 0]; w.inertiaTarget = [0, 0];
        w.inertiaForwardCurrent = [0, 0]; w.inertiaForwardTarget = [0, 0];
      } else {
        const md = motor.moveDirectionLocal ?? [0, 0, 0];
        const mx = clamp((md[0] ?? 0) / 10, -1, 1);
        const my = motor.isGrounded ? 0 : clamp((md[1] ?? 0) / 10, -1, 1);
        const mz = clamp((md[2] ?? 0) / 10, -1, 1);
        const look = ctx.look ?? {};
        // While the mouse draws a swing, its motion is the swing and not the view, so it leaves the lean out.
        if (look.cursorActive || look.swingAction) {
          w.inertiaTarget = [-mx * 0.5 * w.s.inertiaScale, 0];
        } else {
          w.inertiaTarget = [
            ((Number(look.x) || 0) + mx) * -0.5 * w.s.inertiaScale,
            ((Number(look.y) || 0) + my) * 0.5 * w.s.inertiaScale,
          ];
        }
        w.inertiaSpeedMod = dist2(w.inertiaCurrent, w.inertiaTarget) / (w.s.inertiaScale || 1e-6);
        const mult = nonZero2(w.inertiaTarget) ? 3 : 1;
        w.inertiaCurrent = moveTowards2(w.inertiaCurrent, w.inertiaTarget, dt * w.s.inertiaSpeed * w.inertiaSpeedMod * mult);
        w.position = add2(w.position, w.inertiaCurrent);

        // The forward lean reads the old target for its multiplier and then overwrites it, in the mod's order.
        const fmult = nonZero2(w.inertiaForwardTarget) ? 3 : 1;
        w.inertiaForwardTarget = [mz * w.s.inertiaForwardScale, mz * w.s.inertiaForwardScale];
        w.inertiaForwardCurrent = moveTowards2(w.inertiaForwardCurrent, w.inertiaForwardTarget, dt * w.s.inertiaForwardSpeed * fmult);
        w.scale = add2(w.scale, w.inertiaForwardCurrent);
      }
    }

    if (w.s.recoil) {
      if (!settled || w.frameCurrent !== 0) { w.recoilCurrent = [0, 0]; return; }
      if (nonZero2(w.recoilCurrent)) {
        const mag = mag2(w.recoilCurrent) / 0.5;
        w.recoilCurrent = moveTowards2(w.recoilCurrent, [0, 0], dt * w.s.recoilSpeed * mag);
      }
      const v = mul2(w.recoilCurrent, w.s.recoilScale);
      w.scale = add2(w.scale, [clamp(v[0], 0, 0.5), clamp(v[1], 0, 0.5)]);
    }
  }

  // Gates run in the DLL's order; the sheathed rung yields to casting and attacking.
  function drawRect() {
    if (!haveTexture() || !ctx?.entity || w.isInThirdPerson) return null;
    const item = ctx.item ?? null;
    if (!item || !item.isShield) return null;
    if ((Number(ctx.equipCountdownLeftHand) || 0) > 0) return null;
    if (ctx.isClimbing || ctx.isPaused || ctx.loadInProgress) return null;

    const a = w.s.animated, animating = !!w.animating;
    const hidden = (mode) => (a ? (mode === SHIELD_POSE.Hide || mode === SHIELD_POSE.OffScreen) && !animating
      : mode === SHIELD_POSE.Hide);
    if (w.sheathed && !w.attacked && !w.spelled && hidden(w.s.whenSheathed)) return null;
    if (w.attacked && hidden(w.s.whenAttacking)) return null;
    if (w.spelled && hidden(w.s.whenCasting)) return null;
    return getShieldRect();
  }

  function draw(paint) {
    const r = drawRect();
    if (!r || typeof paint !== 'function') return false;
    paint(w.shieldTexture, r, w.curAnimRect);
    return true;
  }

  // A frame with the widget switched off still counts as a shared step, so the sprite rereads when it comes back.
  function offFrame() { ++_widgetSteps; }

  return {
    lateUpdate, draw, drawRect, endOfFrame, onAttackDamageCalculated, offFrame,
    setThirdPerson(v) { w.isInThirdPerson = !!v; },
    get position() { return [w.position[0], w.position[1]]; },
    get scale() { return [w.scale[0], w.scale[1]]; },
    get offset() { return [w.offset[0], w.offset[1]]; },
    get textureIndex() { return w.shieldTexture; },
    get frame() { return w.frameCurrent; },
    get indexCurrent() { return w.indexCurrent; },
    get flipped() { return w.flipped; },
    get animating() { return !!w.animating; },
    get recoiling() { return !!w.recoiling; },
    get rect() { return { ...w.shieldPositionCurrent }; },
    get target() { return { ...w.shieldPositionTarget }; },
    get settings() { return w.s; },
    _w: w,
  };
}
