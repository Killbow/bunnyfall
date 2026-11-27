// @ts-check
// Blows between players roll on the striker's machine against a neutral stand-in and go out as a number that
// the relay referee clips. The defender's sheet never reaches a roll.
import { calculateAttackDamage, baseDamageMax, damageModifier, WEAPON_MATERIAL_MODIFIER } from './formulas.js';
import { weaponDamageMods } from '../characters/entityMods.js';
import { SWING_MODS, WEAPON_REACH } from './playerWeapon.js';
import { createWeapon } from './enemyEquipment.js';
import { SKILLS, skillValue } from '../characters/skills.js';
import { liveStat } from '../characters/statMods.js';
import { offHandToHit, OFF_HAND_BLOW } from './twoHands/handsLaw.js';
import { STAT_KEYS_ORDER } from '../characters/chargen.js';
import { weaponSkillUsed } from '../characters/weapons.js';
import { armorValuesOf } from '../characters/equip.js';
import { clawMetalDamage, CLAW_METAL_MAX } from './clawMetal.js';
import { breakNormalPowerConcealment } from '../magic/concealment.js';
import { DUEL_LEVEL_MAX, DUEL_STAT_MAX, DUEL_SKILL_MAX, DUEL_RACE_MAX, DUEL_TEMPLATE_MAX, DUEL_MATERIAL_MAX, CARD_VITAL_MAX, CAST_EFFECTS_MAX, DUEL_SWINGS } from '../net/wire.js';

// The order matches the wire's sk array.
export const DUEL_SKILL_SLOTS = Object.freeze(['weapon', SKILLS.HandToHand, SKILLS.CriticalStrike, SKILLS.Backstabbing]);
export const DUEL_MELEE_SLACK_M = 2;
export const DUEL_POS_SLACK_M = 4;
export const DUEL_MELEE_POS_SLACK_M = 3;
export const DUEL_TRAIL_MS = 500;
// Wear is capped at this many times the weapon's top honest roll so a forged damage number cannot break a blade.
export const DUEL_WEAR_MULT = 6;
// Classic effect types Paralyze, Continuous Damage, Damage, Disintegrate, Drain, and Silence.
export const DUEL_SPELL_TYPES = Object.freeze(new Set([0, 1, 4, 5, 7, 19]));

const int = (v) => Math.trunc(Number(v) || 0);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, int(v)));
const u32 = (v) => { const n = Number(v); return Number.isFinite(n) ? (n >>> 0) : 0; };

const skillForTemplate = (t) => (Number.isInteger(t) ? (weaponSkillUsed(t) ?? SKILLS.HandToHand) : SKILLS.HandToHand);

export function duelAttackerOf(entity, weapon = null) {
  const ws = skillForTemplate(weapon?.templateIndex);
  return {
    lv: clamp(entity?.level ?? 1, 1, DUEL_LEVEL_MAX),
    r: clamp(entity?.raceId ?? 0, 0, DUEL_RACE_MAX),
    st: STAT_KEYS_ORDER.map((k) => clamp(liveStat(entity, k), 0, DUEL_STAT_MAX)),
    sk: [ws, SKILLS.HandToHand, SKILLS.CriticalStrike, SKILLS.Backstabbing].map((id) => clamp(skillValue(entity, id), 0, DUEL_SKILL_MAX)),
    cf: [clamp(entity?.career?.attackModifierFlags ?? 0, 0, 255), u32(entity?.career?.weaponArmorShieldsBitfield), u32(entity?.career?.abilityFlagsAndSpellPointsBitfield)],
    h: [clamp(entity?.health ?? 0, 0, CARD_VITAL_MAX), clamp(entity?.maxHealth ?? 1, 1, CARD_VITAL_MAX)],
    cm: clamp(clawMetalDamage(entity), 0, CLAW_METAL_MAX),
  };
}

export function duelWeaponOf(item) {
  if (!item || !Number.isInteger(item.templateIndex) || item.templateIndex < 0 || item.templateIndex > DUEL_TEMPLATE_MAX) return null;
  const max = Number(item.maxCondition), cur = Number(item.currentCondition);
  const c = max > 0 && Number.isFinite(cur) ? clamp(Math.round((100 * cur) / max), 0, 100) : 100;
  return { t: item.templateIndex, m: clamp(item.material ?? 0, 0, DUEL_MATERIAL_MAX), c };
}

export function duelStub(a, w = null) {
  const stats = {};
  STAT_KEYS_ORDER.forEach((k, i) => { stats[k] = a.st[i]; });
  const weapon = w ? createWeapon(w.t, w.m, () => 0.5) : null;
  if (weapon) {
    weapon.poisonType = -1;
    if (Number(weapon.maxCondition) > 0) weapon.currentCondition = Math.max(0, Math.round((weapon.maxCondition * w.c) / 100));
  }
  const skillOverrides = {
    [skillForTemplate(w?.t)]: a.sk[0],
    [SKILLS.HandToHand]: a.sk[1],
    [SKILLS.CriticalStrike]: a.sk[2],
    [SKILLS.Backstabbing]: a.sk[3],
  };
  // Marked peer to silence the HUD report; weapon wear from the formula lands on the fresh weapon copy.
  const stub = {
    isPlayer: true, peer: true,
    level: a.lv, raceId: a.r, stats, skillOverrides,
    career: { attackModifierFlags: a.cf[0], weaponArmorShieldsBitfield: a.cf[1], abilityFlagsAndSpellPointsBitfield: a.cf[2] },
    health: a.h[0], maxHealth: a.h[1],
    activeEffects: [], items: [], equipTable: {},
    clawMetal: clamp(a.cm ?? 0, 0, CLAW_METAL_MAX),
  };
  return { stub, weapon };
}

// Attributes at the clamp's middle and level 1 make every stat - 50 and level / 2 term of both cores read zero.
export const DUEL_STAND_IN = Object.freeze({
  lv: 1, r: 0,
  st: Object.freeze(STAT_KEYS_ORDER.map(() => DUEL_STAT_MAX / 2)),
  sk: Object.freeze([0, 0, 0, 0]),
  cf: Object.freeze([0, 0, 0]),
  h: Object.freeze([CARD_VITAL_MAX, CARD_VITAL_MAX]),
});
export function duelStandIn(striker = null) {
  const { stub } = duelStub(DUEL_STAND_IN);
  // With no armor table the stock core reads 0, which beats any armor, so the stand-in takes the unarmored values.
  armorValuesOf(stub);
  if (striker) stub.struckBy = striker;
  return stub;
}

export function resolveDuelStrike(d, target, { rolls = Math.random, backFacing = false } = {}) {
  const { stub, weapon } = duelStub(d.a, d.w ?? null);
  const swing = SWING_MODS[d.sw ?? (d.by === 'arrow' ? 'StrikeDown' : '')] ?? { damage: 0, toHit: 0 };
  const off = (d.by === 'melee' || d.by === 'arrow') && d.off === true;
  const dmg = calculateAttackDamage(stub, target, {
    weapon, damageMod: swing.damage, toHitMod: swing.toHit + (off ? offHandToHit(stub.stats.agility) : 0),
    ...(off ? OFF_HAND_BLOW : {}),
    backstabChance: backFacing ? stub.skillOverrides[SKILLS.Backstabbing] : 0,
    weaponAnimTime: d.at ?? 0, rolls, say: null, onInflictPoison: null,
  });
  const n = Math.max(0, int(dmg));
  // The formula breaks concealment on the stub, so the real striker loses it here.
  if (n > 0 && target?.struckBy) breakNormalPowerConcealment(target.struckBy);
  return { hit: n > 0, dmg: n };
}

const NATIVES_PER_M = 40;
const worldApart = (a, b) => ({ ground: Math.hypot(a[0] - b[0], a[2] - b[2]) / NATIVES_PER_M, up: Math.abs(a[1] - b[1]) });

export function duelBlowPlausible(d, mine, seen, ringRadius) {
  const mines = Array.isArray(mine?.[0]) ? mine.filter((m) => Array.isArray(m)) : [mine];
  if (!Array.isArray(d?.p) || !Array.isArray(mines.at(-1)) || !Array.isArray(seen)) return false;
  const melee = d.k === 'strike' && d.by === 'melee';
  const claim = worldApart(d.p, seen);
  const slack = melee ? DUEL_MELEE_POS_SLACK_M : DUEL_POS_SLACK_M;
  if (claim.ground > slack || claim.up > DUEL_POS_SLACK_M) return false;
  if (melee) return mines.some((m) => { const me = worldApart(d.p, m); return me.ground <= WEAPON_REACH + DUEL_MELEE_SLACK_M && me.up <= 3; });
  return worldApart(d.p, mines.at(-1)).ground <= 2 * ringRadius + DUEL_POS_SLACK_M;
}

export function duelWearDamage(dmg, weapon, attacker) {
  const d = Number.isFinite(dmg) && dmg > 0 ? Math.trunc(dmg) : 0;
  if (!weapon || !d) return 0;
  const top = weaponDamageMods(weapon, baseDamageMax(weapon)) + damageModifier(liveStat(attacker, 'strength'))
    + (WEAPON_MATERIAL_MODIFIER[weapon.material] ?? 0);
  return Math.min(d, Math.max(1, top) * DUEL_WEAR_MULT);
}

export function duelSpellOf(spell) {
  const fx = (Array.isArray(spell?.effects) ? spell.effects : []).filter((e) => e && Number.isInteger(e.type) && DUEL_SPELL_TYPES.has(e.type)).slice(0, CAST_EFFECTS_MAX);
  if (!fx.length) return null;
  return {
    name: String(spell?.name ?? ''),
    element: Number.isInteger(spell?.element) ? spell.element : 4,
    rangeType: spell?.rangeType >= 1 && spell.rangeType <= 4 ? spell.rangeType : 1,
    icon: Number.isInteger(spell?.icon) && spell.icon >= 0 ? spell.icon : 0,
    effects: fx,
  };
}

export function duelSpellFromWire(sp) {
  if (!sp || !Array.isArray(sp.effects)) return null;
  const effects = sp.effects.filter((e) => e && DUEL_SPELL_TYPES.has(e.type)).slice(0, CAST_EFFECTS_MAX);
  if (!effects.length) return null;
  return { name: typeof sp.name === 'string' ? sp.name : '', element: sp.element ?? 4, rangeType: sp.rangeType >= 1 && sp.rangeType <= 4 ? sp.rangeType : 1, effects, icon: Number.isInteger(sp.icon) ? sp.icon : 0, index: -1, custom: true };
}

export const duelSwingOf = (state) => (DUEL_SWINGS.includes(state) ? state : undefined);
