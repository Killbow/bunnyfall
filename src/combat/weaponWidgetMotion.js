// Weapon Widget 1.6 settings and its Offset, Bob, and Inertia movement math, as pure functions.

import { modSettingsOf } from '../mods/modSettings.js';
import { withDiverseWeaponsPreset } from './diverseWeapons.js';

export const WEAPON_WIDGET_VENDOR = 'weapon-widget';

export const WINDUP = Object.freeze({ Hide: 0, Idle: 1, FirstFrame: 2 });
export const RECOVERY = Object.freeze({ Hide: 0, LastFrame: 1 });
export const BOB_SHAPE = Object.freeze({ U: 0, Sideways8: 1, InvertedU: 2 });
export const STEP_CONDITION = Object.freeze({ SheatheAttackOnly: 0, AllTransforms: 1 });
export const RECOIL_CONDITION = Object.freeze({ HitsOnly: 0, HitsAndParries: 1, ParriesOnly: 2, ParriesAndMisses: 3, MissesOnly: 4, AllAttacks: 5 });
export const MISS_VFX_AT = Object.freeze({ Target: 0, Crosshair: 1 });

// Applies the mod's own multipliers to the stored values. `preset` false skips the Diverse Weapons preset.
export function readWidgetSettings(read = () => modSettingsOf(WEAPON_WIDGET_VENDOR), { preset = true } = {}) {
  const s = preset ? withDiverseWeaponsPreset(read()) : read();
  return {
    enabled: !!s.Enabled,
    swing: !!s['Modules.Swings'], ambidexterity: !!s['Modules.Ambidexterity'], bob: !!s['Modules.Bob'], offset: !!s['Modules.Offset'],
    stepTransforms: !!s['Modules.Step'], inertia: !!s['Modules.Inertia'], doubleScale: !!s['Modules.DoubleScaleTextures'],
    trueSize: !!s['Modules.TrueTextureSize'], recoil: !!s['Modules.Recoil'],
    swingWindup: s['Swings.Windup'] | 0, swingRecovery: s['Swings.Recovery'] | 0, swingSpeed: Number(s['Swings.Speed']),
    swingAlignmentOverride: !!s['Swings.VanillaAlignmentOverride'], swingRecoveryOverride: !!s['Swings.VanillaRecoveryOverride'],
    swingNoDaggerRight: !!s['Swings.NoDaggerMirroredStrikes'],
    offsetSpeed: Number(s['Offset.Speed']) * 10,
    bobLength: (s['Bob.Length'] | 0) / 100, bobOffset: Number(s['Bob.Offset']),
    bobSizeXMod: Number(s['Bob.SizeX']) * 2, bobSizeYMod: Number(s['Bob.SizeY']) * 2,
    moveSmoothSpeed: Number(s['Bob.SpeedMove']) * 4, bobSmoothSpeed: Number(s['Bob.SpeedState']) * 500,
    bobShape: (s['Bob.Shape'] | 0) * 0.5, bobWhileIdle: !!s['Bob.BobWhileIdle'],
    inertiaScale: Number(s['Inertia.Scale']) * 500, inertiaSpeed: Number(s['Inertia.Speed']) * 500,
    inertiaForwardScale: Number(s['Inertia.ForwardDepth']) * 0.2, inertiaForwardSpeed: Number(s['Inertia.ForwardSpeed']) * 0.2,
    stepLength: s['Step.Length'] | 0, stepCondition: s['Step.Condition'] | 0,
    recoilChance: (s['Recoil.Chance'] | 0) / 100, recoilCondition: s['Recoil.Condition'] | 0,
    recoilEnvironment: !!s['Recoil.DetectEnvironment'], playMissVFXEntity: !!s['Recoil.PlayEntityMissEffects'],
    playMissVFXEnvironment: !!s['Recoil.PlayEnvironmentMissEffects'], playMissVFXPos: s['Recoil.MissEffectPlacement'] | 0,
    mirrorBows: !!s['Miscellaneous.MirrorBows'], mirrorTwoHandedSwords: !!s['Miscellaneous.MirrorTwoHandedSwords'],
    mirrorTwoHandedAxes: !!s['Miscellaneous.MirrorTwoHandedAxes'], mirrorTwoHandedBlunts: !!s['Miscellaneous.MirrorTwoHandedBlunts'],
    textureScaleFactor: Math.max(1, s['TrueTextureSize.TextureScaleFactor'] | 0),
  };
}

export const moveTowards = (a, b, maxDelta) => (Math.abs(b - a) <= maxDelta ? b : a + Math.sign(b - a) * maxDelta);
export function moveTowards2(a, b, maxDelta) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const d = Math.hypot(dx, dy);
  if (d <= maxDelta || d === 0) return [b[0], b[1]];
  return [a[0] + dx / d * maxDelta, a[1] + dy / d * maxDelta];
}
// Matches Unity's Mathf.Round, which rounds half to even.
export const roundHalfEven = (v) => { const f = Math.floor(v); const r = v - f; if (r > 0.5) return f + 1; if (r < 0.5) return f; return f % 2 === 0 ? f : f + 1; };
export const snap = (v, interval) => (interval > 0 ? roundHalfEven(v / interval) * interval : v);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// The offset is in sprite-rect units, so [0, 2] is two sprite heights down, off the bottom of the screen.
export function offsetStep({
  offsetCurrent, offsetTarget, animating = false, shown = true, equipCountdown = 0,
  hiddenTarget = [2, 2],
}, dt, offsetSpeedLive) {
  let target = offsetTarget, current = offsetCurrent;
  if (!animating) {
    target = shown ? [0, 0] : hiddenTarget;
    if (equipCountdown > 0) { target = [...hiddenTarget]; current = [...hiddenTarget]; }
  }
  current = moveTowards2(current, target, dt * offsetSpeedLive);
  return { offsetCurrent: current, offsetTarget: target, delta: current };
}

export const IDLE_BREATH = Object.freeze({ rate: 0.1, size: 0.4 });

export function bobStep({ moveSmooth, bobSmooth, time, screenRect, doubleScaleIdle = false }, s, m, dt) {
  const shape = s.bobShape;
  const moveMul = m.grounded === false ? 0 : 1;
  const nextMove = moveTowards(moveSmooth, moveMul, dt * s.moveSmoothSpeed);
  let sp = Number.isFinite(m.speedRatio) ? m.speedRatio : 1;
  if (m.crouching) sp *= 0.5;
  if (m.riding) sp *= 0.5;
  // Standing still, the weapon breathes at the mod's slow idle tempo but at a visible size (IDLE_BREATH).
  let reach = sp;
  if (m.standing) { sp = s.bobWhileIdle ? IDLE_BREATH.rate : 0; reach = s.bobWhileIdle ? IDLE_BREATH.size : 0; }
  const baseSpeed = Number.isFinite(m.baseSpeed) ? m.baseSpeed : 1;
  const rate = baseSpeed * 1.25 * sp * s.bobLength;
  const rate2 = rate * 2;
  const amp = 0.01;
  const size = [screenRect.width * amp * reach * s.bobSizeXMod, screenRect.height * amp * reach * s.bobSizeYMod];
  let xMin = -1, yMax = 1;
  if (doubleScaleIdle) { xMin = 0; yMax = 0; }
  const target = [
    (xMin + Math.sin(s.bobOffset + time * rate)) * -size[0],
    (yMax - Math.sin(s.bobOffset + shape + time * rate2)) * size[1],
  ];
  const eased = moveTowards2(bobSmooth, target, dt * s.bobSmoothSpeed);
  const next = [eased[0] * nextMove, eased[1] * nextMove];
  return { moveSmooth: nextMove, bobSmooth: next, delta: next };
}

export function inertiaStep({
  inertiaCurrent, inertiaTarget, inertiaForwardCurrent, inertiaForwardTarget,
  screenRect, flip = false, look = [0, 0], cursorActive = false, swingHeld = false,
}, s, m, dt) {
  const lv = m.localVel ?? [0, 0, 0];
  const mx = clamp(lv[0] / 10, -1, 1);
  const my = m.grounded === false ? clamp(lv[1] / 10, -1, 1) : 0;
  const mz = clamp(lv[2] / 10, -1, 1);
  const sign = flip ? -1 : 1;
  let target;
  if (!cursorActive && swingHeld) target = [-mx * 0.5 * s.inertiaScale, 0];
  else target = [(look[0] + mx) * sign * 0.5 * -s.inertiaScale, (look[1] + my) * 0.5 * s.inertiaScale];
  const speedMod = s.inertiaScale > 0 ? Math.hypot(inertiaCurrent[0] - target[0], inertiaCurrent[1] - target[1]) / s.inertiaScale : 0;
  let speedMul = (target[0] !== 0 || target[1] !== 0) ? 3 : 1;
  const current = moveTowards2(inertiaCurrent, target, dt * s.inertiaSpeed * speedMod * speedMul);
  speedMul = (inertiaForwardTarget[0] !== 0 || inertiaForwardTarget[1] !== 0) ? 3 : 1;
  const fwdTarget = [mz * s.inertiaForwardScale, mz * s.inertiaForwardScale];
  const fwdCurrent = moveTowards2(inertiaForwardCurrent, fwdTarget, dt * s.inertiaForwardSpeed * speedMul);
  const k = screenRect.width * 0.25;
  return {
    inertiaCurrent: current, inertiaTarget: target, inertiaSpeedMod: speedMod,
    inertiaForwardCurrent: fwdCurrent, inertiaForwardTarget: fwdTarget,
    delta: [current[0] - fwdCurrent[0] * k, current[1] - fwdCurrent[1] * k],
    scale: fwdCurrent,
  };
}

export function widgetTransformRect(base, {
  position = [0, 0], scale = [1, 1], offset = [0, 0],
  flip = false, scaleIt = true, withOffset = true,
  stepInterval = 0, screenHeight, weaponOffsetHeight: offH = 0,
} = {}) {
  const r = { x: base.x, y: base.y, w: base.w, h: base.h };
  if (flip) r.x -= position[0]; else r.x += position[0];
  r.y += position[1];
  if (scaleIt) { r.w *= scale[0]; r.h *= scale[1]; }
  if (withOffset) {
    if (flip) r.x -= r.w * offset[0]; else r.x += r.w * offset[0];
    r.y += r.h * offset[1];
  }
  if (stepInterval > 0) {
    r.x = snap(r.x, stepInterval);
    r.y = snap(r.y, stepInterval);
  }
  r.y = clamp(r.y, screenHeight - r.h - offH, screenHeight);
  return r;
}

