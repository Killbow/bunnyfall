// Chooses the Morrowind visuals for a Daggerfall spell from its MGEF records, following OpenMW's cast, bolt, hit,
// area, and hand rules. The effect mapping only picks visuals and never changes what a spell does.

import { SKILLS } from '../characters/skills.js';

export const MW_EFFECT = Object.freeze({
  WaterBreathing: 0, WaterWalking: 2, Shield: 3, Feather: 8, Jump: 9, Levitate: 10, SlowFall: 11, Lock: 12, Open: 13,
  FireDamage: 14, ShockDamage: 15, FrostDamage: 16, DrainAttribute: 17, DamageHealth: 23, DamageMagicka: 24,
  DamageFatigue: 25, Poison: 27, DisintegrateWeapon: 37, Invisibility: 39, Chameleon: 40, Light: 41, Charm: 44,
  Paralyze: 45, Silence: 46, Sound: 48, CalmHumanoid: 49, CalmCreature: 50, Dispel: 57, Soultrap: 58, Mark: 60, Recall: 61,
  DetectAnimal: 64, DetectEnchantment: 65, DetectKey: 66, SpellAbsorption: 67, Reflect: 68, CureCommonDisease: 69,
  CurePoison: 72, CureParalyzation: 73, RestoreAttribute: 74, RestoreHealth: 75, RestoreFatigue: 77,
  FortifyAttribute: 79, AbsorbAttribute: 85, AbsorbHealth: 86, AbsorbFatigue: 88, ResistFire: 90, ResistFrost: 91,
  ResistShock: 92, ResistMagicka: 93, ResistPoison: 97, ResistParalysis: 99, TurnUndead: 101, BoundDagger: 120,
});
const E = MW_EFFECT;

export const ELEMENT_DAMAGE = Object.freeze([E.FireDamage, E.FrostDamage, E.Poison, E.ShockDamage, E.DamageHealth]);

const ELEMENTAL = new Set([1, 4, 5, 7, 11]);

const DF_TO_MW = Object.freeze({
  '0,*': E.Paralyze,
  '1,0': E.DamageHealth, '1,1': E.DamageFatigue, '1,2': E.DamageMagicka,
  '2,*': E.BoundDagger,
  '3,0': E.CureCommonDisease, '3,1': E.CurePoison, '3,2': E.CureParalyzation,
  '4,0': E.DamageHealth, '4,1': E.DamageFatigue, '4,2': E.DamageMagicka,
  '5,*': E.DisintegrateWeapon,
  '6,0': E.Dispel, '6,1': E.TurnUndead, '6,2': E.Dispel,
  '7,*': E.DrainAttribute,
  '8,0': E.ResistFire, '8,1': E.ResistFrost, '8,2': E.ResistPoison, '8,3': E.ResistShock, '8,4': E.ResistMagicka,
  '9,*': E.FortifyAttribute,
  '10,8': E.RestoreHealth, '10,9': E.RestoreFatigue, '10,*': E.RestoreAttribute,
  '11,8': E.AbsorbHealth, '11,9': E.AbsorbFatigue, '11,*': E.AbsorbAttribute,
  '12,*': E.Soultrap, '13,*': E.Invisibility, '14,*': E.Levitate, '15,*': E.Light, '16,*': E.Lock, '17,*': E.Open,
  '18,*': E.RestoreHealth,
  '19,*': E.Silence, '20,*': E.SpellAbsorption, '21,*': E.Reflect, '22,*': E.ResistMagicka,
  '23,*': E.Chameleon, '24,*': E.Chameleon,
  '25,*': E.SlowFall, '26,*': E.ResistParalysis, '27,*': E.Jump, '28,*': E.Feather,
  '30,*': E.WaterBreathing, '31,*': E.WaterWalking,
  '33,2': E.CalmHumanoid, '33,*': E.CalmCreature,
  '34,*': E.Charm, '35,*': E.Shield,
  '39,0': E.DetectEnchantment, '39,1': E.DetectAnimal, '39,2': E.DetectKey,
  '40,*': E.DetectEnchantment,
  '43,*': E.Recall,
  '44,*': E.Sound,
  '45,*': E.RestoreHealth,
  '46,*': E.Mark,
});

const SCHOOL_FALLBACK = Object.freeze({
  [SKILLS.Destruction]: E.DamageHealth, [SKILLS.Restoration]: E.RestoreHealth, [SKILLS.Illusion]: E.Light,
  [SKILLS.Alteration]: E.Shield, [SKILLS.Thaumaturgy]: E.Dispel, [SKILLS.Mysticism]: E.Dispel,
});

export function mwEffectOf(effect, element = 4, school = SKILLS.Destruction) {
  const type = effect?.type | 0;
  const sub = (effect?.subType ?? 255) & 0xff;
  if (ELEMENTAL.has(type) && Number.isInteger(element) && element >= 0 && element <= 3) return ELEMENT_DAMAGE[element];
  return DF_TO_MW[`${type},${sub}`] ?? DF_TO_MW[`${type},*`] ?? SCHOOL_FALLBACK[school] ?? E.DamageHealth;
}

// Another player spell arrives over the wire with an element and no effects, so a spell without effects is drawn as
// damage of that element.
export function mwEffectsOfSpell(sp, schoolOf = () => SKILLS.Destruction) {
  const element = Number.isInteger(sp?.element) && sp.element >= 0 && sp.element <= 4 ? sp.element : 4;
  const list = (sp?.effects ?? []).filter(Boolean);
  if (!list.length) return [ELEMENT_DAMAGE[element]];
  return list.map((e) => mwEffectOf(e, element, schoolOf(e)));
}

export const VFX_DEFAULT = Object.freeze({ cast: 'vfx_defaultcast', bolt: 'vfx_defaultbolt', hit: 'vfx_defaulthit', area: 'vfx_defaultarea', hands: 'vfx_hands' });
export const MGEF_FLAG = Object.freeze({ ContinuousVfx: 0x20, NegativeLight: 0x800 });

export function mgefColour(mgef) {
  const c = (mgef?.color ?? [255, 255, 255]).map((v) => v / 255);
  return (mgef?.flags ?? 0) & MGEF_FLAG.NegativeLight ? c.map((v) => 1 - v) : c;
}

// OpenMW spawns the area visual at twice the area in feet, at 64/3 Morrowind units per foot.
export const MW_UNITS_PER_FOOT = 64 / 3;
export const areaVisualScale = (radiusMetres, unitsPerMetre) => 2 * (radiusMetres * unitsPerMetre) / MW_UNITS_PER_FOOT;

export function actorFxTransform(height, radius, unitsPerMetre) {
  const z = height * unitsPerMetre, xy = 2 * radius * unitsPerMetre;
  const ratio = Math.max(xy, xy, z / 2) / 64;
  let offset = 0;
  if (z < 128) offset = z - 128;
  else if (z < xy + xy) offset = 128 - z;
  return { scale: ratio > 1 ? ratio : 1, offset: offset * ratio };
}

// A visual whose id resolves to no mesh is left out, although OpenMW would refuse the whole cast.
export function spellFxPlan(sp, mgefs, modelOf, { schoolOf } = {}) {
  const ids = mwEffectsOfSpell(sp, schoolOf);
  const effects = ids.map((i) => mgefs?.get?.(i) ?? null);
  const visual = (mgef, slot) => {
    const id = (mgef?.[slot === 'cast' ? 'casting' : slot] || VFX_DEFAULT[slot]).toLowerCase();
    const model = modelOf(id);
    return model ? { id, model, texture: mgef?.particle || null } : null;
  };
  const unique = (list) => {
    const seen = new Set();
    return list.filter((v) => { if (!v) return false; const k = `${v.model}|${v.texture ?? ''}`; if (seen.has(k)) return false; seen.add(k); return true; });
  };
  const ranged = sp?.rangeType === 2 || sp?.rangeType === 4;
  let bolt = null;
  if (ranged) {
    const first = visual(effects[0], 'bolt');
    if (first) {
      const colours = effects.map(mgefColour);
      bolt = {
        ...first,
        // As in OpenMW, the bolt wears a particle texture only when the spell has exactly one effect.
        texture: effects.length === 1 ? effects[0]?.particle || null : null,
        colour: [0, 1, 2].map((k) => colours.reduce((a, c) => a + c[k], 0) / colours.length),
      };
    }
  }
  const last = effects[effects.length - 1];
  const handsModel = modelOf(VFX_DEFAULT.hands);
  return {
    effects: ids,
    cast: effects.map((m) => visual(m, 'cast')).filter((v, i, all) => v && all.findIndex((w) => w && w.model === v.model) === i),
    bolt,
    hit: unique(effects.map((m) => visual(m, 'hit'))),
    area: unique(effects.map((m) => visual(m, 'area'))),
    hands: handsModel ? { id: VFX_DEFAULT.hands, model: handsModel, texture: last?.particle || null } : null,
  };
}

// Matches OpenMW's launchMagicBolt: pitch about -X, then yaw about -Z, so the mesh's +Y points along `dir`.
export function boltAttitude(dir) {
  const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const d = [dir[0] / l, dir[1] / l, dir[2] / l];
  const yaw = Math.atan2(d[0], d[1]);
  const pitch = -Math.asin(Math.max(-1, Math.min(1, d[2])));
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const rz = [cy, sy, 0, -sy, cy, 0, 0, 0, 1];
  const rx = [1, 0, 0, 0, cp, sp, 0, -sp, cp];
  const o = new Float32Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = rz[r * 3] * rx[c] + rz[r * 3 + 1] * rx[3 + c] + rz[r * 3 + 2] * rx[6 + c];
  return o;
}

export const BOLT_SPIN_PER_S = Math.PI * 2;
export function boltSpin(seconds) {
  const a = -seconds * BOLT_SPIN_PER_S;
  const c = Math.cos(a), s = Math.sin(a);
  return Float32Array.from([c, 0, s, 0, 1, 0, -s, 0, c]);
}
