// DFU saving throw, magnitude roll, and missile, touch, and area geometry.

import { dice100 } from '../combat/formulas.js';
import { liveStat } from '../characters/statMods.js';
import { entityResistMod } from '../characters/entityMods.js';
import { magicResist } from '../combat/formulas.js';
import { raceById, raceByKey } from '../characters/races.js';
import { getInt } from '../platform/settings.js';
import { CAPSULE_RADIUS } from '../player/motor.js';

export const MISSILE_SPEED = 25.0;
export const ARROW_FLIGHT_SPEED = MISSILE_SPEED * 1.35;
export const MISSILE_COLLIDER_RADIUS = 0.45;
export const MISSILE_LIFESPAN_S = 8;
export const CASTSPELL_COOLDOWN_TICK = 45.454546;
export const missileArchive = (element) => 375 + Math.max(0, Math.min(4, element));

export const EFFECT_FLAGS = Object.freeze({ Paralysis: 1, Magic: 2, Poison: 4, Fire: 8, Frost: 16, Shock: 32, Disease: 64 });
export const ELEMENTS = Object.freeze({ Fire: 0, Frost: 1, DiseaseOrPoison: 2, Shock: 3, Magic: 4 });
const ELEMENT_EFFECT_FLAG = Object.freeze([EFFECT_FLAGS.Fire, EFFECT_FLAGS.Frost, EFFECT_FLAGS.Poison, EFFECT_FLAGS.Shock, EFFECT_FLAGS.Magic]);

// As in DFU GetTolerance, Resistant is tested before Immune, so a career flagged both is only Resistant.
export function careerTolerance(career, flag) {
  const has = (byte) => (byte & flag) === flag;
  if (has(career.resistanceFlags ?? 0)) return 'Resistant';
  if (has(career.immunityFlags ?? 0)) return 'Immune';
  if (has(career.lowToleranceFlags ?? 0)) return 'LowTolerance';
  if (has(career.criticalWeaknessFlags ?? 0)) return 'CriticalWeakness';
  return 'Normal';
}

// As in DFU, the poison clause also masks by the spell's flags, and the paralysis clause ignores the element.
export function spellHasFlags(element, checkFlags, spellEffectFlags) {
  return (element === ELEMENTS.Fire && (checkFlags & EFFECT_FLAGS.Fire) !== 0) ||
    (element === ELEMENTS.Frost && (checkFlags & EFFECT_FLAGS.Frost) !== 0) ||
    (element === ELEMENTS.DiseaseOrPoison && (checkFlags & spellEffectFlags & (EFFECT_FLAGS.Disease | EFFECT_FLAGS.Poison)) !== 0) ||
    (element === ELEMENTS.Shock && (checkFlags & EFFECT_FLAGS.Shock) !== 0) ||
    (element === ELEMENTS.Magic && (checkFlags & EFFECT_FLAGS.Magic) !== 0) ||
    ((spellEffectFlags & EFFECT_FLAGS.Paralysis) !== 0 && (checkFlags & EFFECT_FLAGS.Paralysis) !== 0);
}

const raceTemplateOf = (target) =>
  target.raceTemplate ?? raceById(target.raceId) ?? raceByKey(target.race) ?? null;

export function elementalResistanceChance(target, element) {
  let total = 0;
  for (const a of target?.activeEffects ?? []) {
    if (a.kind === 'elementalResistance' && a.element === element && !a.ended) total += a.chance ?? 0;
  }
  return total;
}

const RESIST_NAMES = Object.freeze([[EFFECT_FLAGS.Fire, 'fire'], [EFFECT_FLAGS.Frost, 'frost'], [EFFECT_FLAGS.Shock, 'shock'], [EFFECT_FLAGS.Poison, 'poison'], [EFFECT_FLAGS.Magic, 'magic']]);

// savingThrow and the Stats page both read this, so the chance before the roll stays in one place.
export function savingChance(element, effectFlags, target, modifier = 0, pierce = 0) {
  let saving = 50;
  let biographyMod = 0;
  const career = target.career ?? {};
  // Racial immunity sets 100 instead of adding, so the check below returns immunity.
  if (target.isPlayer) {
    const rt = raceTemplateOf(target) ?? {};
    if (spellHasFlags(element, rt.resistanceFlags ?? 0, effectFlags)) saving += 30;
    if (spellHasFlags(element, rt.immunityFlags ?? 0, effectFlags)) saving = 100;
    if (spellHasFlags(element, rt.lowToleranceFlags ?? 0, effectFlags)) saving -= 25;
    if (spellHasFlags(element, rt.criticalWeaknessFlags ?? 0, effectFlags)) saving -= 50;
  }
  const tolerance = { Immune: 0, CriticalWeakness: 0, LowTolerance: 0, Resistant: 0 };
  const fold = (flag) => { const t = careerTolerance(career, flag); if (t !== 'Normal') tolerance[t] = 1; };
  if (effectFlags & EFFECT_FLAGS.Paralysis) fold(EFFECT_FLAGS.Paralysis);
  if (effectFlags & EFFECT_FLAGS.Magic) {
    fold(EFFECT_FLAGS.Magic);
    if (target.isPlayer) biographyMod += target.biographyResistMagicMod ?? 0;
  }
  if (effectFlags & EFFECT_FLAGS.Poison) {
    fold(EFFECT_FLAGS.Poison);
    if (target.isPlayer) biographyMod += target.biographyResistPoisonMod ?? 0;
  }
  if (effectFlags & EFFECT_FLAGS.Fire) fold(EFFECT_FLAGS.Fire);
  if (effectFlags & EFFECT_FLAGS.Frost) fold(EFFECT_FLAGS.Frost);
  if (effectFlags & EFFECT_FLAGS.Shock) fold(EFFECT_FLAGS.Shock);
  if (effectFlags & EFFECT_FLAGS.Disease) {
    fold(EFFECT_FLAGS.Disease);
    if (target.isPlayer) biographyMod += target.biographyResistDiseaseMod ?? 0;
  }
  if (tolerance.Immune) saving += 50;
  if (tolerance.CriticalWeakness) saving -= 50;
  if (tolerance.LowTolerance) saving -= 25;
  if (tolerance.Resistant) saving += 25;
  saving += biographyMod + modifier;
  saving += entityResistMod(target, RESIST_NAMES.filter(([flag]) => effectFlags & flag).map(([, name]) => name));
  if (saving >= 100) return { immune: true, chance: 100 };
  saving += magicResist(liveStat(target, 'willpower'));
  // Pierce comes after the immunity check, so an immune target stays immune, and before the 5..95 clamp.
  saving -= Math.max(0, Number.isFinite(pierce) ? pierce : 0);
  saving = Math.max(5, Math.min(95, saving));
  return { immune: false, chance: saving };
}

export function savingThrow(element, effectFlags, target, modifier = 0, rolls = Math.random, pierce = 0) {
  // As in DFU, Elemental Resistance is tested first, and a successful roll resists the effect whole.
  const resist = elementalResistanceChance(target, element);
  if (resist > 0 && Math.floor(rolls() * 100) < resist) return 0;
  const sc = savingChance(element, effectFlags, target, modifier, pierce);
  if (sc.immune) return 0;
  const saving = sc.chance;
  let percent = 100;
  const roll = 1 + Math.floor(rolls() * 100);
  if (roll <= saving) {
    percent = saving - 20 <= roll ? 100 - 5 * (saving - roll) : 0;
  }
  return Math.max(0, Math.min(100, percent));
}

export function rollMagnitude(effect, casterLevel, rolls = Math.random) {
  const range = (lo, hi) => lo + Math.floor(rolls() * (hi + 1 - lo));
  const base = range(effect.magnitudeBaseLow, effect.magnitudeBaseHigh);
  const plus = range(effect.magnitudeLevelBase, effect.magnitudeLevelHigh);
  const per = Math.max(1, effect.magnitudePerLevel);
  return base + plus * Math.floor(casterLevel / per);
}

export const isDamageHealthEffect = (e) =>
  (e.type === 4 && e.subType === 0) || (e.type === 1 && e.subType === 0);

export function rangedDamageSpells(spellsByIndex) {
  if (!spellsByIndex) return [];
  const out = [];
  for (const sp of spellsByIndex.values()) {
    if ((sp.rangeType === 2 || sp.rangeType === 4) && sp.effects.some(isDamageHealthEffect)) out.push(sp);
  }
  return out;
}

export const TARGET_TYPES = Object.freeze(['CasterOnly', 'ByTouch', 'SingleTargetAtRange', 'AreaAroundCaster', 'AreaAtRange']);

export const EXPLOSION_RADIUS = 4.0;

export const TOUCH_SPHERE_CAST_RADIUS = 0.25;
export const TOUCH_RANGE = 3.0;
export const TOUCH_STEP = 0.05;

export function pickTouchTarget(eye, dir, foes, losClear = () => true) {
  let best = null, bestT = Infinity;
  for (const f of foes) {
    if (f.dead) continue;
    if (Number.isFinite(f.ai?.radius)) {
      for (let t = 0; t <= TOUCH_RANGE + 1e-9 && t < bestT; t += TOUCH_STEP) {
        const p = [eye[0] + dir[0] * t, eye[1] + dir[1] * t, eye[2] + dir[2] * t];
        if (!sphereOverlapsCapsule(p, TOUCH_SPHERE_CAST_RADIUS, f.ai.feet, f.ai.height, f.ai.radius)) continue;
        if (losClear(p, t)) { best = f; bestT = t; }
        break;
      }
      continue;
    }
    const c = [f.ai.feet[0], f.ai.feet[1] + (f.ai.height ?? 1.8) / 2, f.ai.feet[2]];
    const rx = c[0] - eye[0], ry = c[1] - eye[1], rz = c[2] - eye[2];
    const t = Math.max(0, Math.min(TOUCH_RANGE, rx * dir[0] + ry * dir[1] + rz * dir[2]));
    const d = Math.hypot(rx - dir[0] * t, ry - dir[1] * t, rz - dir[2] * t);
    if (d <= TOUCH_SPHERE_CAST_RADIUS + 0.45 && t < bestT && losClear(c, Math.hypot(rx, ry, rz))) {
      best = f; bestT = t;
    }
  }
  return best;
}

export function sweepFoes(pos, radius, foes) {
  const out = [];
  for (const f of foes) {
    if (f.dead) continue;
    if (sphereOverlapsCapsule(pos, radius, f.ai?.feet, f.ai?.height, f.ai?.radius)) out.push(f);
  }
  return out;
}

// Enemy controller radius 0.4 plus its 0.05 skin width; the player uses its own narrower PLAYER_BODY_RADIUS.
export const BODY_CAPSULE_RADIUS = 0.45;
export const PLAYER_BODY_RADIUS = CAPSULE_RADIUS;

export function missileHitsCapsule(pos, feet, height, bodyRadius = BODY_CAPSULE_RADIUS) {
  return sphereOverlapsCapsule(pos, MISSILE_COLLIDER_RADIUS, feet, height, bodyRadius);
}

// A sphere meets a capsule within `radius + bodyRadius` of its inner axis, which is a point when height < 2r.
export function sphereOverlapsCapsule(pos, radius, feet, height, bodyRadius = BODY_CAPSULE_RADIUS) {
  if (!feet) return false;
  const h = height ?? 1.8;
  const half = Math.min(bodyRadius, h / 2);
  const y = Math.min(Math.max(pos[1], feet[1] + half), feet[1] + h - half);
  return Math.hypot(feet[0] - pos[0], y - pos[1], feet[2] - pos[2]) <= radius + bodyRadius;
}

// DFU's crouch dip can leave `dir` longer than 1, so the reach scales with its length.
export function missileReach(dir, step) {
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  return { unit: len === 1 ? dir : [dir[0] / len, dir[1] / len, dir[2] / len], reach: step * len + MISSILE_COLLIDER_RADIUS };
}

export function missileHitsFoe(pos, foe) {
  return missileHitsCapsule(pos, foe?.ai?.feet, foe?.ai?.height, foe?.ai?.radius);
}

export const PLAYER_ARROW_DOWN = 0.11;
export const PLAYER_ARROW_SIDE = 0.15;

// DFU GetAimPosition: 0.11 down along the camera's up and 0.15 toward the bow hand, mirrored for Handedness 1.
const bowHandFlipped = () => getInt('Controls', 'Handedness', 0, 3) === 1;

export function playerArrowOrigin(eye, lookDir, flipHorizontal = bowHandFlipped()) {
  const fl = Math.hypot(lookDir[0], lookDir[1], lookDir[2]) || 1;
  const f = [lookDir[0] / fl, lookDir[1] / fl, lookDir[2] / fl];
  let rx = f[2], rz = -f[0];
  const rl = Math.hypot(rx, rz);
  if (rl < 1e-6) { rx = 1; rz = 0; } else { rx /= rl; rz /= rl; }
  const ux = f[1] * rz, uy = f[2] * rx - f[0] * rz, uz = -f[1] * rx;
  const side = flipHorizontal ? -PLAYER_ARROW_SIDE : PLAYER_ARROW_SIDE;
  return [
    eye[0] - ux * PLAYER_ARROW_DOWN + rx * side,
    eye[1] - uy * PLAYER_ARROW_DOWN,
    eye[2] - uz * PLAYER_ARROW_DOWN + rz * side,
  ];
}

// A camera-space `muzzle` is already mirrored for handedness, so unlike the bow-hand offset it is not flipped here.
export function playerShotOrigin(eye, lookDir, muzzle) {
  if (muzzle?.world) return [...muzzle.world];
  return muzzle ? playerMuzzleOrigin(eye, lookDir, muzzle) : playerArrowOrigin(eye, lookDir);
}

export function playerMuzzleOrigin(eye, lookDir, muzzle) {
  const fl = Math.hypot(lookDir[0], lookDir[1], lookDir[2]) || 1;
  const f = [lookDir[0] / fl, lookDir[1] / fl, lookDir[2] / fl];
  let rx = f[2], rz = -f[0];
  const rl = Math.hypot(rx, rz);
  if (rl < 1e-6) { rx = 1; rz = 0; } else { rx /= rl; rz /= rl; }
  const ux = f[1] * rz, uy = f[2] * rx - f[0] * rz, uz = -f[1] * rx;
  const r = muzzle?.right ?? 0, u = muzzle?.up ?? 0, d = muzzle?.forward ?? 0;
  return [
    eye[0] + rx * r + ux * u + f[0] * d,
    eye[1] + uy * u + f[1] * d,
    eye[2] + rz * r + uz * u + f[2] * d,
  ];
}
