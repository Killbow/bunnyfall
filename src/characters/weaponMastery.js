// @ts-check
// Weapon skill climb past 100: extra blow strength and swing pace per effective point.

import { SKILLS } from './skills.js';
import { SKILL_SOFT_CAP, climbedSkill } from './skillSoftcap.js';
import { isOnlinePage } from '../platform/onlineLane.js';
import { sigilDueling } from '../items/sigil.js';
import { SCHOOL_POTENCY_PER_POINT } from '../magic/spellPower.js';
import { registerWeaponBlowMod } from './entityMods.js';
import { blowRoom } from './powerCeiling.js';
import { registerSwingPaceMod } from './weaponStates.js';
import { swingFamily } from '../combat/swingLaw.js';
import { techniqueFamily } from '../combat/technique/techniqueRoster.js';
import { healthShare } from '../combat/healthShare.js';

export const WEAPON_POTENCY_PER_POINT = SCHOOL_POTENCY_PER_POINT;
export const WEAPON_HALF_PER_POINT = 2 * WEAPON_POTENCY_PER_POINT;
export const WEAPON_HALF_LINE = 0.5;

const SKILL_OF_FAMILY = Object.freeze({
  longBlade: SKILLS.LongBlade, shortBlade: SKILLS.ShortBlade, axe: SKILLS.Axe, blunt: SKILLS.BluntWeapon,
  archery: SKILLS.Archery, handToHand: SKILLS.HandToHand,
});
export const blowSkillOf = (weapon) => (weapon ? SKILL_OF_FAMILY[techniqueFamily(weapon) ?? ''] ?? null : SKILLS.HandToHand);

export function weaponClimb(entity, skill, { online = isOnlinePage() } = {}) {
  if (!online || !entity?.isPlayer || entity.peer || entity._mentor || entity.isInBeastForm || !Number.isInteger(skill)) return 0;
  const c = climbedSkill(entity, skill);
  return c > SKILL_SOFT_CAP ? c - SKILL_SOFT_CAP : 0;
}

const shareOf = healthShare;
export function weaponPastPct(weapon, attacker, target, opts = {}) {
  const skill = blowSkillOf(weapon);
  const climb = weaponClimb(attacker, skill, opts);
  if (!(climb > 0)) return 0;
  switch (skill) {
    case SKILLS.LongBlade: case SKILLS.Archery: return climb * (WEAPON_POTENCY_PER_POINT * 100);
    case SKILLS.Axe: case SKILLS.BluntWeapon: {
      const share = shareOf(target);
      if (share === null) return climb * (WEAPON_POTENCY_PER_POINT * 100);
      return (skill === SKILLS.Axe ? share < WEAPON_HALF_LINE : share >= WEAPON_HALF_LINE) ? climb * (WEAPON_HALF_PER_POINT * 100) : 0;
    }
    default: return 0;
  }
}

let _carry = new WeakMap();
export function weaponMasteryBlow(weapon, damage, attacker, target, info = null) {
  if (!(damage > 0) || !attacker?.isPlayer || attacker.peer || !target || target.isPlayer || target.warded || sigilDueling()) return damage;
  const pct = blowRoom(weaponPastPct(weapon, attacker, target), 'mastery');
  if (!(pct > 0)) return damage;
  const key = weapon ?? attacker;
  const exact = (damage * pct) / 100 + (_carry.get(key) ?? 0);
  const more = Math.floor(exact + 1e-9);
  if (!info?.estimate) _carry.set(key, Math.max(0, exact - more));
  return damage + more;
}

export function weaponMasteryPace(ctx, w) {
  if (sigilDueling()) return 0;
  const climb = weaponClimb(ctx?.entity, SKILLS.ShortBlade);
  if (!(climb > 0)) return 0;
  return (w ? w.family : swingFamily(ctx)) === 'shortBlade' ? climb * (WEAPON_POTENCY_PER_POINT * 100) : 0;
}

export const WEAPON_MASTERY = 'weaponMastery';
registerWeaponBlowMod(WEAPON_MASTERY, weaponMasteryBlow);
registerSwingPaceMod(WEAPON_MASTERY, weaponMasteryPace);

export function _resetWeaponMasteryForTests() { _carry = new WeakMap(); }
