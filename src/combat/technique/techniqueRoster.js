// @ts-check
// Weapon technique data: the families that may roll each technique, its multiplier on normal attack damage, and its
// cost. A leaf module, read by both the loot rolls and the technique runtime.

import { weaponSkillUsed } from '../../characters/weapons.js';
import { SKILLS } from '../../characters/skills.js';
import { RRI_CLASSES } from '../../mods/rriItems.js';

export const GAUNTLETS_TEMPLATE = 103;

export const TECHNIQUE_FAMILIES = Object.freeze(['archery', 'longBlade', 'shortBlade', 'axe', 'blunt', 'handToHand']);
const FAMILY_OF_SKILL = new Map([
  [SKILLS.Archery, 'archery'], [SKILLS.LongBlade, 'longBlade'], [SKILLS.ShortBlade, 'shortBlade'],
  [SKILLS.Axe, 'axe'], [SKILLS.BluntWeapon, 'blunt'], [SKILLS.HandToHand, 'handToHand'],
]);

export function techniqueFamily(item) {
  if (!item || typeof item !== 'object') return null;
  if (item.group === 'Armor') return item.templateIndex === GAUNTLETS_TEMPLATE ? 'handToHand' : null;
  if (item.group !== 'Weapons' || !Number.isInteger(item.templateIndex)) return null;
  // A Roleplay & Realism class keeps its family with the mod switched off, so its technique line stays valid.
  const rri = RRI_CLASSES[item.templateIndex];
  const skill = weaponSkillUsed(item.templateIndex) ?? (rri?.group === 'Weapons' && rri.weaponSkillUsed ? SKILLS[rri.weaponSkillUsed] : null);
  return FAMILY_OF_SKILL.get(skill ?? -1) ?? null;
}

export const TECHNIQUE_BANDS = Object.freeze({ magic: Object.freeze([5, 15]), rare: Object.freeze([15, 30]), legendary: Object.freeze([30, 50]) });

export const TECHNIQUE_PER_MILLE = Object.freeze({ magic: 120, rare: 300, legendary: 450 });

// Matches TECH_COLOR in combat/techniques.js; it lives in this leaf so the HUD never imports the technique runtime.
export const TECH_CHIP_COLOUR = '#59c7ff';
export const TECHNIQUE_ACTION = 'WeaponTechnique';

export const techniqueMult = (base, value) => base * (1 + Math.max(0, value | 0) / 100);

// Stays at or under ARENA_SPEED_MAX in net/arenaLaw.js, or the arena referee refuses the technique's poses.
export const TECHNIQUE_MAX_SPEED = 12;
const DEG = Math.PI / 180;
export const TECHNIQUES = Object.freeze({
  // Six arrows over 1.35 s land 0.27 s apart, under the arena referee's ARENA_HIT_HZ_MAX.
  volley: Object.freeze({ name: 'Volley', families: Object.freeze(['archery']), mech: 'rain', aim: 'ground', base: 0.5, fatigue: 6, cooldown: 16,
    arrows: 6, radius: 3.5, range: Object.freeze([6, 28]), height: 16, delay: 0.55, spread: 1.35 }),
  pierce: Object.freeze({ name: 'Piercing Shot', families: Object.freeze(['archery']), mech: 'pierce', aim: 'lane', base: 1.2, fatigue: 4, cooldown: 10,
    through: 5, length: 30, speed: 1.6 }),
  leap: Object.freeze({ name: 'Leap Strike', families: Object.freeze(['longBlade']), mech: 'leap', aim: 'target', base: 1.4, fatigue: 5, cooldown: 12,
    range: Object.freeze([3, 9]), apex: 1.6, radius: 2.5, strike: 'StrikeDown', toHit: 20 }),
  whirlwind: Object.freeze({ name: 'Whirlwind', families: Object.freeze(['longBlade']), mech: 'swing', aim: null, base: 1.0, fatigue: 5, cooldown: 10,
    reach: 3.0, arc: 'all', strike: 'StrikeLeft', toHit: 15 }),
  shadowstep: Object.freeze({ name: 'Shadowstep', families: Object.freeze(['shortBlade']), mech: 'dash', aim: 'foe', base: 1.2, fatigue: 4, cooldown: 9,
    range: Object.freeze([2, 8]), behind: 1.0, reach: 2.2, arc: 'view', strike: 'StrikeRight', toHit: 20 }),
  lunge: Object.freeze({ name: 'Lunge', families: Object.freeze(['shortBlade']), mech: 'dash', aim: 'lane', base: 1.1, fatigue: 4, cooldown: 8,
    length: 5, halfW: 0.9, strike: 'StrikeDown', toHit: 15 }),
  cleave: Object.freeze({ name: 'Cleave', families: Object.freeze(['axe']), mech: 'swing', aim: null, base: 1.2, fatigue: 5, cooldown: 9,
    reach: 3.2, arc: 80 * DEG, strike: 'StrikeRight', toHit: 15 }),
  execute: Object.freeze({ name: "Headsman's Chop", families: Object.freeze(['axe']), mech: 'swing', aim: null, base: 1.2, fatigue: 5, cooldown: 11,
    reach: 2.5, arc: 'view', wounded: 1.0, strike: 'StrikeDown', toHit: 20 }),
  slam: Object.freeze({ name: 'Ground Slam', families: Object.freeze(['blunt']), mech: 'swing', aim: null, base: 0.9, fatigue: 6, cooldown: 12,
    reach: 3.5, arc: 'all', strike: 'StrikeDown', toHit: 15 }),
  crush: Object.freeze({ name: 'Skull Crack', families: Object.freeze(['blunt']), mech: 'swing', aim: null, base: 1.6, fatigue: 5, cooldown: 10,
    reach: 2.5, arc: 'view', single: true, strike: 'StrikeDown', toHit: 30 }),
  kick: Object.freeze({ name: 'Flying Kick', families: Object.freeze(['handToHand']), mech: 'leap', aim: 'target', base: 1.3, fatigue: 4, cooldown: 10,
    range: Object.freeze([2, 6]), apex: 1.2, radius: 2.0, strike: 'StrikeDown', toHit: 20, airborne: true }),
  haymaker: Object.freeze({ name: 'Haymaker', families: Object.freeze(['handToHand']), mech: 'swing', aim: null, base: 1.8, fatigue: 4, cooldown: 9,
    reach: 2.5, arc: 'view', single: true, strike: 'StrikeRight', toHit: 30 }),
});
export const TECHNIQUE_IDS = Object.freeze(Object.keys(TECHNIQUES));
export const techniqueById = (id) => (typeof id === 'string' && Object.hasOwn(TECHNIQUES, id) ? TECHNIQUES[id] : null);

export function techniquesFor(item) {
  const fam = techniqueFamily(item);
  return fam ? TECHNIQUE_IDS.filter((id) => TECHNIQUES[id].families.includes(fam)) : [];
}
export const techniqueFits = (id, item) => techniquesFor(item).includes(id);

const pct = (x) => `${Math.round(x * 100)}%`;
export function techniqueParts(id, value) {
  const t = techniqueById(id);
  if (!t) return null;
  const m = techniqueMult(t.base, value);
  const what = (() => {
    switch (id) {
      case 'volley': return `Aim: ${t.arrows} arrows rain down within ${t.radius} m, ${pct(m)} each`;
      case 'pierce': return `Aim: a shot through ${t.through} foes, ${pct(m)} each`;
      case 'leap': return `Aim: leap ${t.range[1]} m, strike all in ${t.radius} m, ${pct(m)}`;
      case 'kick': return `Bare-handed, aim: leap ${t.range[1]} m, strike all in ${t.radius} m, ${pct(m)}`;
      case 'shadowstep': return `Aim a foe: dash behind it and strike, ${pct(m)}`;
      case 'lunge': return `Dash ${t.length} m, striking all you pass, ${pct(m)}`;
      case 'whirlwind': case 'slam': return `Strike all within ${t.reach} m, ${pct(m)}`;
      case 'cleave': return `Strike all in a wide arc, ${pct(m)}`;
      case 'execute': return `Strike for ${pct(m)}, to ${pct(m + (t.wounded ?? 0))} on the wounded`;
      case 'crush': return `One heavy blow, ${pct(m)}, +${t.toHit} to hit`;
      case 'haymaker': return `Bare-handed: one heavy blow, ${pct(m)}, +${t.toHit} to hit`;
      default: return `${pct(m)}`;
    }
  })();
  return { what, mult: m, fatigue: t.fatigue, cooldown: t.cooldown, aims: t.aim != null };
}
export function techniqueBrief(id, value) {
  const p = techniqueParts(id, value);
  return p ? `${p.what}. ${p.fatigue} fatigue, ${p.cooldown}s` : '';
}
