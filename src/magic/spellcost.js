// Spell casting costs ported from DFU FormulaHelper: per-effect component gold, scaled by (110 - skill), times the
// target multiplier, floored at 5. An effect with no components takes DFU's 60/100/160 fudge.

import { skillValue, SKILLS } from '../characters/skills.js';
import { isOnlinePage } from '../platform/onlineLane.js';
import { pathCastSchool } from '../characters/arcanePaths.js';

export const CAST_COST_FLOOR = 5;

// Online, a skill past 100 prices as 100 scaled by 100 / skill, so bonuses past 110 never make a cost negative.
// Offline, and up to 100, DFU's (110 - skill) term applies.
export const SPELL_COST_SKILL_REFERENCE = 100;
export function skillScaledCost(value, skill, divisor, { online = isOnlinePage() } = {}) {
  const R = SPELL_COST_SKILL_REFERENCE;
  if (online && skill > R) return Math.trunc((value * (110 - R) * R) / (skill * divisor));
  return Math.trunc(value * (110 - skill) / divisor);
}

const FUDGE = { A: 60, B: 100, offset: 160 };

const costs = (A, B, offset = 0) => ({ A, B, offset });
const row = (skill, parts) => Object.freeze({ skill, ...parts });
const family = (type, subTypes, r) =>
  Object.fromEntries(subTypes.map((s) => [`${type},${s}`, r]));
const STATS = [0, 1, 2, 3, 4, 5, 6, 7];

export const EFFECT_COST_TABLE = Object.freeze({
  '0,255':  row(SKILLS.Alteration, { duration: costs(28, 100), chance: costs(28, 100) }),
  ...family(8, [0, 1, 2, 3, 4], row(SKILLS.Alteration, { duration: costs(100, 100), chance: costs(8, 100) })),
  '25,255': row(SKILLS.Alteration, { duration: costs(20, 100) }),
  '27,255': row(SKILLS.Alteration, { duration: costs(20, 8) }),
  '28,255': row(SKILLS.Alteration, { duration: costs(20, 20) }),
  '30,255': row(SKILLS.Alteration, { duration: costs(20, 8) }),
  '35,255': row(SKILLS.Alteration, { duration: costs(28, 8), magnitude: costs(80, 60) }),

  '1,0':    row(SKILLS.Destruction, { duration: costs(28, 8), magnitude: costs(40, 28) }),
  '1,1':    row(SKILLS.Destruction, { duration: costs(20, 8), magnitude: costs(40, 28) }),
  '1,2':    row(SKILLS.Destruction, { duration: costs(40, 8), magnitude: costs(40, 28) }),
  '4,0':    row(SKILLS.Destruction, { magnitude: costs(20, 28) }),
  '4,1':    row(SKILLS.Destruction, { magnitude: costs(20, 28) }),
  '4,2':    row(SKILLS.Destruction, { magnitude: costs(20, 28) }),
  '5,255':  row(SKILLS.Destruction, { chance: costs(80, 140) }),
  ...family(7, STATS, row(SKILLS.Destruction, { magnitude: costs(8, 100, 116) })),
  ...family(11, [...STATS, 8, 9], row(SKILLS.Destruction, { magnitude: costs(60, 100, 40) })),

  '13,0':   row(SKILLS.Illusion, { duration: costs(40, 120) }),
  '13,1':   row(SKILLS.Illusion, { duration: costs(60, 140) }),
  '15,255': row(SKILLS.Illusion, { duration: costs(8, 40) }),
  '23,0':   row(SKILLS.Illusion, { duration: costs(20, 80) }),
  '23,1':   row(SKILLS.Illusion, { duration: costs(40, 120) }),
  '24,0':   row(SKILLS.Illusion, { duration: costs(20, 80) }),
  '24,1':   row(SKILLS.Illusion, { duration: costs(40, 120) }),
  '29,255': row(SKILLS.Illusion, {}),
  '45,255': row(SKILLS.Restoration, {}),

  '2,255':  row(SKILLS.Mysticism, { duration: costs(60, 120) }),
  '6,0':    row(SKILLS.Mysticism, { chance: costs(120, 180) }),
  '6,1':    row(SKILLS.Mysticism, { chance: costs(80, 140) }),
  '6,2':    row(SKILLS.Mysticism, { chance: costs(120, 180) }),
  '12,255': row(SKILLS.Mysticism, { duration: costs(60, 68), chance: costs(40, 68) }),
  '16,255': row(SKILLS.Mysticism, { chance: costs(28, 120, 120) }),
  '17,255': row(SKILLS.Mysticism, { chance: costs(20, 100) }),
  '19,255': row(SKILLS.Mysticism, { duration: costs(20, 100), chance: costs(20, 100) }),
  '43,255': row(SKILLS.Mysticism, {}),
  '46,255': row(SKILLS.Mysticism, { duration: costs(8, 8) }),
  '47,255': row(SKILLS.Destruction, {}),
  '48,255': row(SKILLS.Destruction, { duration: costs(40, 40) }),
  '49,255': row(SKILLS.Mysticism, { duration: costs(20, 20) }),
  '50,255': row(SKILLS.Mysticism, {}),
  '51,255': row(SKILLS.Alteration, { duration: costs(20, 20) }),
  '52,255': row(SKILLS.Alteration, { duration: costs(60, 60) }),
  '53,255': row(SKILLS.Illusion, { duration: costs(40, 60) }),
  '54,255': row(SKILLS.Thaumaturgy, { duration: costs(60, 60) }),
  '55,255': row(SKILLS.Mysticism, { chance: costs(1, 10, 10) }),
  '56,255': row(SKILLS.Mysticism, { chance: costs(1, 10, 10), magnitude: costs(1, 10, 10) }),
  '57,255': row(SKILLS.Mysticism, { chance: costs(10, 100, 10), magnitude: costs(10, 100, 500) }),
  '58,255': row(SKILLS.Mysticism, { chance: costs(3, 6, 10), magnitude: costs(10, 100, 100) }),
  '59,255': row(SKILLS.Mysticism, { chance: costs(10, 100, 50), magnitude: costs(10, 100, 50) }),
  '60,255': row(SKILLS.Mysticism, { chance: costs(10, 100, 10), magnitude: costs(10, 100, 500) }),
  '61,255': row(SKILLS.Mysticism, { chance: costs(10, 100, 100), magnitude: costs(10, 100, 100) }),
  '62,255': row(SKILLS.Mysticism, { chance: costs(10, 100, 250), magnitude: costs(10, 100, 250) }),
  '63,255': row(SKILLS.Mysticism, { chance: costs(10, 100, 500), magnitude: costs(10, 100, 500) }),
  '44,255': row(SKILLS.Mysticism, { duration: costs(60, 68), chance: costs(40, 68) }),

  '3,0':    row(SKILLS.Restoration, { chance: costs(8, 100) }),
  '3,1':    row(SKILLS.Restoration, { chance: costs(8, 100) }),
  '3,2':    row(SKILLS.Restoration, { chance: costs(20, 140) }),
  ...family(9, STATS, row(SKILLS.Restoration, { duration: costs(28, 100), magnitude: costs(40, 120) })),
  ...family(10, STATS, row(SKILLS.Restoration, { magnitude: costs(40, 28) })),
  '10,8':   row(SKILLS.Restoration, { magnitude: costs(20, 28) }),
  '10,9':   row(SKILLS.Restoration, { magnitude: costs(8, 28) }),
  '18,255': row(SKILLS.Restoration, { duration: costs(100, 20), magnitude: costs(8, 8) }),
  '20,255': row(SKILLS.Restoration, { duration: costs(28, 140), chance: costs(28, 140) }),
  '26,255': row(SKILLS.Restoration, { duration: costs(20, 8) }),

  '14,255': row(SKILLS.Thaumaturgy, { duration: costs(60, 100) }),
  '21,255': row(SKILLS.Thaumaturgy, { duration: costs(28, 140), chance: costs(28, 140) }),
  '22,255': row(SKILLS.Thaumaturgy, { duration: costs(20, 100), chance: costs(20, 100) }),
  '31,255': row(SKILLS.Thaumaturgy, { duration: costs(20, 8) }),
  '33,0':   row(SKILLS.Thaumaturgy, { chance: costs(60, 100, 160) }),
  '33,1':   row(SKILLS.Thaumaturgy, { chance: costs(80, 140, 60) }),
  '33,2':   row(SKILLS.Thaumaturgy, { chance: costs(80, 140, 60) }),
  '33,3':   row(SKILLS.Thaumaturgy, { chance: costs(60, 120, 36) }),
  '34,255': row(SKILLS.Thaumaturgy, { chance: costs(40, 60) }),
  '39,0':   row(SKILLS.Thaumaturgy, { duration: costs(20, 8, 200) }),
  '39,1':   row(SKILLS.Thaumaturgy, { duration: costs(20, 8, 200) }),
  '39,2':   row(SKILLS.Thaumaturgy, { duration: costs(20, 8, 160) }),
  '40,255': row(SKILLS.Thaumaturgy, { chance: costs(40, 100, 28) }),
});

export const TARGET_COST_MULT = Object.freeze({ 0: 1.0, 1: 1.0, 2: 1.5, 3: 2.0, 4: 2.5 });

const component = (c, starting, increase, per) =>
  Math.trunc(c.offset + c.A * starting + c.B * Math.trunc(increase / Math.max(1, per)));

export function effectSchool(e) {
  return EFFECT_COST_TABLE[`${e.type},${e.subType & 0xff}`]?.skill ?? 22;
}
// The cost, the skill tally in hostMagic.js, and effects.js all read this, so they agree on the school.
export const castSchool = (entity, spell, e) => pathCastSchool(entity, spell, effectSchool(e));

export function effectCost(e, casterSkillOf, { online = isOnlinePage() } = {}) {
  // Records store no subtype as -1, so the key folds it to a byte as DFU MakeClassicKey does.
  const entry = EFFECT_COST_TABLE[`${e.type},${e.subType & 0xff}`];
  // DFU drops an effect with no effect class from the bundle, so it costs nothing.
  if (!entry) return { gold: 0, sp: 0 };
  const skill = casterSkillOf(entry.skill);
  let gold = 0;
  let activeComponents = false;
  if (entry.duration) {
    activeComponents = true;
    gold += component(entry.duration, e.durationBase, e.durationMod, e.durationPerLevel);
  }
  if (entry.chance) {
    activeComponents = true;
    gold += component(entry.chance, e.chanceBase, e.chanceMod, e.chancePerLevel);
  }
  if (entry.magnitude) {
    activeComponents = true;
    const base = Math.trunc((e.magnitudeBaseLow + e.magnitudeBaseHigh) / 2);
    const plus = Math.trunc((e.magnitudeLevelBase + e.magnitudeLevelHigh) / 2);
    gold += component(entry.magnitude, base, plus, e.magnitudePerLevel);
  }
  if (!activeComponents) gold += component(FUDGE, 1, 1, 1);
  return { gold, sp: skillScaledCost(gold, skill, 400, { online }) };
}

// Cost modifiers apply only to a player's cast, after DFU's floor, and never go under 1 (enemy casts skip them).
const _costMods = new Map();
export function registerSpellCostMod(name, fn) { if (typeof fn === 'function') _costMods.set(name, fn); else _costMods.delete(name); }
// A free cast that returns true prices the player's cast at 0, the only cost under the modifiers' floor of 1.
const _freeCasts = new Map();
export function registerSpellFreeCast(name, fn) { if (typeof fn === 'function') _freeCasts.set(name, fn); else _freeCasts.delete(name); }

export function calculateCastCost(spell, casterEntity, { portMods = true, online = isOnlinePage() } = {}) {
  const skillOf = (id) => skillValue(casterEntity, pathCastSchool(casterEntity, spell, id));
  let gold = 0, sp = 0;
  for (const e of spell.effects) {
    if (e.type <= -1) continue;
    const c = effectCost(e, skillOf, { online });
    gold += c.gold;
    sp += c.sp;
  }
  const m = TARGET_COST_MULT[spell.rangeType] ?? 1.0;
  gold = Math.trunc(gold * m);
  sp = Math.trunc(sp * m);
  // As in DFU, MinimumCastingCost sets the cost to exactly 5 however much the effects price.
  if (spell.minimumCastingCost) sp = CAST_COST_FLOOR;
  if (sp < CAST_COST_FLOOR) sp = CAST_COST_FLOOR;
  if (portMods && casterEntity?.isPlayer && _costMods.size) {
    for (const fn of _costMods.values()) {
      try { const n = fn(casterEntity, sp, spell); if (Number.isFinite(n)) sp = Math.max(1, Math.round(n)); } catch {}
    }
  }
  if (portMods && casterEntity?.isPlayer) for (const fn of _freeCasts.values()) { try { if (fn(casterEntity, spell) === true) { sp = 0; break; } } catch {} }
  return { gold, sp };
}

// DFU's second cost formula, CalculateCastingCost, prices a raw classic record from its settings bytes.
// Enchantment point costs and the cast-when-held durability bill use it.
const CLASSIC_INDEX_ROWS = [
  [0x00],
  [0x01, 0x02, 0x03],
  [0x04],
  [0x05, 0x05, 0x06],
  [0x07, 0x07, 0x07],
  [0x08],
  [0x09, 0x08, 0x09],
  [0x0A, 0x0A, 0x0A, 0x0A, 0x0A, 0x0A, 0x0A, 0x0A],
  [0x0B, 0x0B, 0x0B, 0x0B, 0x0B],
  [0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C],
  [0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x07, 0x0E],
  [0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F],
  [0x26],
  [0x10, 0x11],
  [0x12],
  [0x13],
  [0x14],
  [0x28],
  [0x15],
  [0x16],
  [0x17],
  [0x17],
  [0x16],
  [0x18, 0x10],
  [0x18, 0x10],
  [0x14],
  [0x02],
  [0x02],
  [0x19],
  [0x1A, 0x1A, 0x1A, 0x1A, 0x1A, 0x1A, 0x1A],
  [0x02],
  [0x02],
  [0x1B],
  [0x1A, 0x1C, 0x1C, 0x1D],
  [0x1E],
  [0x1F],
  [0x27],
  [0x20],
  [0x20],
  [0x21, 0x21, 0x22],
  [0x23],
  [0x24],
  [0x07],
  [0x25],
  [0x29],
  [0x2A],
  [0x2A],
  [0x2A],
  [0x2A],
  [0x2A],
  [0x2A],
];
const CLASSIC_EFFECT_INDICES = CLASSIC_INDEX_ROWS.map((r) => Object.assign(new Array(12).fill(0), r));

const CLASSIC_COEFFICIENTS = [
  [0x07, 0x19, 0x07, 0x19],
  [0x07, 0x02, 0x0A, 0x07],
  [0x05, 0x02, 0x0A, 0x07],
  [0x0A, 0x02, 0x0A, 0x07],
  [0x0F, 0x1E, 0x00, 0x00],
  [0x02, 0x19, 0x00, 0x00],
  [0x05, 0x23, 0x00, 0x00],
  [0x05, 0x07, 0x00, 0x00],
  [0x14, 0x23, 0x00, 0x00],
  [0x1E, 0x2D, 0x00, 0x00],
  [0x04, 0x19, 0x02, 0x19],
  [0x19, 0x19, 0x02, 0x19],
  [0x07, 0x19, 0x0A, 0x1E],
  [0x0A, 0x07, 0x00, 0x00],
  [0x02, 0x07, 0x00, 0x00],
  [0x05, 0x05, 0x0F, 0x19],
  [0x0A, 0x1E, 0x00, 0x00],
  [0x0F, 0x23, 0x00, 0x00],
  [0x0F, 0x19, 0x00, 0x00],
  [0x02, 0x0A, 0x00, 0x00],
  [0x05, 0x19, 0x07, 0x1E],
  [0x19, 0x05, 0x02, 0x02],
  [0x05, 0x19, 0x05, 0x19],
  [0x07, 0x23, 0x07, 0x23],
  [0x05, 0x14, 0x00, 0x00],
  [0x05, 0x05, 0x00, 0x00],
  [0x0F, 0x19, 0x0F, 0x19],
  [0x0A, 0x14, 0x14, 0x28],
  [0x0A, 0x05, 0x14, 0x23],
  [0x07, 0x02, 0x0F, 0x1E],
  [0x05, 0x02, 0x0A, 0x0F],
  [0x07, 0x02, 0x14, 0x0F],
  [0x23, 0x02, 0x0A, 0x19],
  [0x05, 0x02, 0x14, 0x1E],
  [0x05, 0x02, 0x0F, 0x19],
  [0x05, 0x02, 0x0A, 0x19],
  [0x07, 0x0C, 0x05, 0x05],
  [0x23, 0x2D, 0x00, 0x00],
  [0x0F, 0x11, 0x0A, 0x11],
  [0x14, 0x11, 0x19, 0x23],
  [0x05, 0x19, 0x00, 0x00],
  [0x0F, 0x11, 0x0A, 0x11],
  [0x0F, 0x0F, 0x05, 0x05],
];

const CLASSIC_MAGIC_SCHOOLS = [
  0, 2, 3, 1, 2, 2, 3, 2, 0, 1,
  1, 2, 3, 5, 4, 5, 3, 3, 1, 3,
  1, 4, 4, 5, 5, 0, 1, 0, 0, 5,
  0, 4, 0, 4, 4, 0, 3, 3, 0, 4,
  4, 4, 5, 3, 3, 0, 0, 4, 4, 4,
  4];
const CLASSIC_MAGIC_SKILLS = [SKILLS.Alteration, SKILLS.Restoration, SKILLS.Destruction, SKILLS.Mysticism, SKILLS.Thaumaturgy, SKILLS.Illusion];

const CLASSIC_SETTINGS_TYPES = [
  1, 2, 3, 4, 5, 4, 4, 2, 1, 6,
  5, 6, 1, 3, 3, 3, 1, 4, 2, 1,
  1, 1, 1, 3, 3, 3, 3, 3, 3, 1,
  3, 3, 1, 1, 1, 2, 2, 1, 1, 1,
  1, 1, 3, 4, 1, 2, 2, 2, 2, 2,
  2];
const CLASSIC_RANGE_MODIFIERS = [2, 2, 3, 4, 5];

// The `|| 1` guard is this game's own: DFU throws on a zero per-level byte, which duration-only records hold.
const cdiv = (a, b) => Math.trunc(a / (b || 1));

function classicCostFromSettings(settingsType, e, c) {
  const magBase = Math.trunc((e.magnitudeBaseLow + e.magnitudeBaseHigh) / 2);
  const magPlus = Math.trunc((e.magnitudeLevelBase + e.magnitudeLevelHigh) / 2);
  switch (settingsType) {
    case 1: return c[0] * e.durationBase + cdiv(e.durationMod, e.durationPerLevel) * c[1]
      + c[2] * e.chanceBase + cdiv(e.chanceMod, e.chancePerLevel) * c[3];
    case 2: return c[0] * e.durationBase + cdiv(e.durationMod, e.durationPerLevel) * c[1]
      + magBase * c[2] + cdiv(magPlus, e.magnitudePerLevel) * c[3];
    case 3: return c[0] * e.durationBase + cdiv(e.durationMod, e.durationPerLevel) * c[1];
    case 4: return c[0] * e.chanceBase + cdiv(e.chanceMod, e.chancePerLevel) * c[1];
    case 5: return c[0] * magBase + cdiv(magPlus, e.magnitudePerLevel) * c[1];
    case 6: return c[0] * e.durationBase + cdiv(c[1] * e.durationMod, e.durationPerLevel)
      + magBase * c[2] + cdiv(c[3], e.magnitudePerLevel) * magPlus;
    case 7: return magBase * c[0]
      + cdiv(cdiv(cdiv(c[1] * (e.magnitudeLevelBase + e.magnitudeLevelHigh), 2), e.magnitudePerLevel) * e.durationBase, e.durationMod);
    default: return 0;
  }
}

export function classicCastingCost(spell, skillOf = null, { online = isOnlinePage() } = {}) {
  let cost = 0;
  for (let i = 0; i < 3; i++) {
    const e = spell.effects?.[i];
    if (!e || e.type === -1 || e.type == null) continue;
    const sub = e.subType === -1 || e.subType == null ? 0 : e.subType;
    const coef = CLASSIC_COEFFICIENTS[CLASSIC_EFFECT_INDICES[e.type]?.[sub] ?? 0] ?? CLASSIC_COEFFICIENTS[0];
    const skill = skillOf ? skillOf(CLASSIC_MAGIC_SKILLS[CLASSIC_MAGIC_SCHOOLS[e.type] ?? 0]) : 50;
    cost += skillScaledCost(classicCostFromSettings(CLASSIC_SETTINGS_TYPES[e.type] ?? 0, e, coef), skill, 100, { online });
  }
  cost = (cost * (CLASSIC_RANGE_MODIFIERS[spell.rangeType] ?? 2)) >> 1;
  return cost < 5 ? 5 : cost;
}
