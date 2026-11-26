// Pure rules for the custom-class and reputation windows; ui/chargenArt.js draws the window.

import { SKILL_NAMES, SKILL_COUNT, MAGIC_SKILLS } from './skills.js';
import {
  ADVANTAGE_KEYS, DISADVANTAGE_KEYS, ONLY_ONE_KEYS, MAX_ITEMS, secondaryListFor, advDisAdjustment, cannotAdd,
} from './specialAdvantages.js';
import { localizedStrings } from '../ui/textManager.js';

export const HP_MIN = 4;
export const HP_MAX = 30;
export const HP_DEFAULT = 8;
export const DIFFICULTY_MIN = -12;
export const DIFFICULTY_MAX = 40;

export const FREE_EDIT_MIN = 10;
export const FREE_EDIT_MAX = 75;
export const STAT_DEFAULT = 50;

export function difficultyPoints(hp, advantageAdjust = 0, disadvantageAdjust = 0) {
  const base = hp >= HP_DEFAULT ? hp - HP_DEFAULT : -(2 * (HP_DEFAULT - hp));
  return base + advantageAdjust + disadvantageAdjust;
}

export function advancementMultiplier(points) {
  return 0.3 + (2.7 * (points + 12)) / 52;
}

export const DAGGER_Y_MIN = 46;
export const DAGGER_Y_MAX = 186;
export const DAGGER_Y_DEFAULT = 115;
export function daggerY(points) {
  if (points >= 0) return Math.max(DAGGER_Y_MIN, Math.trunc(DAGGER_Y_DEFAULT - 37 * (points / 40)));
  return Math.min(DAGGER_Y_MAX, Math.trunc(DAGGER_Y_DEFAULT + 41 * (-points / 12)));
}

export const daggerFraction = (points) => (DAGGER_Y_MAX - daggerY(points)) / (DAGGER_Y_MAX - DAGGER_Y_MIN);

export const DAGGER_TRAIL_LINGER_S = 1.0;

export function tickDaggerTrails(state, y, now) {
  state.trails ??= [];
  if (state.lastY == null) state.lastY = y;
  if (y !== state.lastY) {
    state.trails.push({ y, born: now });
    state.lastY = y;
  }
  for (let i = state.trails.length - 1; i >= 0; i--) {
    if (now - state.trails[i].born >= DAGGER_TRAIL_LINGER_S) state.trails.splice(i, 1);
  }
  return state.trails.map((t) => ({ y: t.y, alpha: 1 - (now - t.born) / DAGGER_TRAIL_LINGER_S }));
}

export function availableSkills(assigned) {
  const taken = new Set(assigned.filter((s) => s != null));
  const out = [];
  for (let id = 0; id < SKILL_COUNT; id++) if (!taken.has(id)) out.push(id);
  out.sort((a, b) => SKILL_NAMES[a].localeCompare(SKILL_NAMES[b]));
  return out;
}

export function buildCustomCareer({ name, hp, skills, stats, points = null }) {
  return {
    resistanceFlags: 0, immunityFlags: 0, lowToleranceFlags: 0,
    criticalWeaknessFlags: 0,
    abilityFlagsAndSpellPointsBitfield: 20 << 8,
    rapidHealing: 0, regeneration: 0, unknown1: 0,
    spellAbsorptionFlags: 0, attackModifierFlags: 0,
    forbiddenMaterialsFlags: 0, weaponArmorShieldsBitfield: 0,
    primarySkills: skills.slice(0, 3),
    majorSkills: skills.slice(3, 6),
    minorSkills: skills.slice(6, 12),
    name,
    hitPointsPerLevel: hp,
    advancementMultiplier: advancementMultiplier(points ?? difficultyPoints(hp)),
    strength: stats.strength, intelligence: stats.intelligence,
    willpower: stats.willpower, agility: stats.agility,
    endurance: stats.endurance, personality: stats.personality,
    speed: stats.speed, luck: stats.luck,
  };
}

export function classAffinityIndex(customSkills, careers) {
  let highestAffinity = 0;
  let selectedIndex = 0;
  for (let i = 0; i < careers.length; i++) {
    const c = careers[i].career ?? careers[i];
    const classSkills = new Set([...c.primarySkills, ...c.majorSkills, ...c.minorSkills]);
    let affinity = 0;
    for (const s of customSkills) if (classSkills.has(s)) affinity++;
    if (affinity > highestAffinity) { highestAffinity = affinity; selectedIndex = i; }
  }
  return selectedIndex;
}



export function customSpellSetIndex(career) {
  const six = [...career.primarySkills, ...career.majorSkills];
  return six.some((s) => MAGIC_SKILLS.includes(s)) ? 1 : null;
}

const HELP_TITLES = localizedStrings({
  helpAttributes: 'Attributes', helpClassName: 'Class Name', helpGeneral: 'General',
  helpReputations: 'Reputations', helpSkillAdvancement: 'Skill Advancement', helpSkills: 'Skills',
  helpSpecialAdvantages: 'Special Advantages', helpSpecialDisadvantages: 'Special Disadvantages',
});
const helpTopic = (key, id) => Object.freeze(Object.defineProperty([key, id], 0, { get: () => HELP_TITLES[key] }));
export const HELP_TOPICS = Object.freeze([
  helpTopic('helpAttributes', 2402), helpTopic('helpClassName', 2401), helpTopic('helpGeneral', 2400),
  helpTopic('helpReputations', 2406), helpTopic('helpSkillAdvancement', 2407), helpTopic('helpSkills', 2403),
  helpTopic('helpSpecialAdvantages', 2404), helpTopic('helpSpecialDisadvantages', 2405),
]);

export const REP_BAR_TOP = 24, REP_BAR_BOTTOM = 128, REP_BAR_MIDDLE = 76;
export const REP_GREEN = [0.388, 0.549, 0.223, 1];
export const REP_RED = [0.580, 0.031, 0, 1];
export const REP_EXIT = Object.freeze([129, 165, 33, 14]);
export const REP_GROUPS = Object.freeze(['merchants', 'peasants', 'scholars', 'nobility', 'underworld']);
export const REP_MAX = 10;
export function repStep(reps, group, dir) {
  if (!REP_GROUPS.includes(group)) return null;
  const next = Math.max(-REP_MAX, Math.min(REP_MAX, (reps?.[group] ?? 0) + (dir < 0 ? -1 : 1)));
  return next || 0;
}

// DFU's rounding quirk: a remainder of exactly 4 rounds up, 1 to 3 round down, capped at the bar's 50px.
export function roundNearestBarHeight(number) {
  const ret = number % 5 > 3 ? 5 * Math.trunc((number + 4) / 5) : 5 * Math.trunc(number / 5);
  return ret > 50 ? 50 : ret;
}

export function repClick(x, y) {
  if (y < REP_BAR_TOP || y > REP_BAR_BOTTOM) return null;
  const group = x >= 134 ? 'underworld' : x >= 101 ? 'nobility' : x >= 68 ? 'scholars' : x >= 35 ? 'peasants' : 'merchants';
  // A click exactly on the middle line sets the group to zero, as in DFU.
  const nearestHeight = roundNearestBarHeight(Math.trunc(Math.abs(REP_BAR_MIDDLE - y)));
  const sign = y < REP_BAR_MIDDLE ? 1 : -1;
  // `|| 0` turns JS's negative zero into zero, which C#'s short cannot hold.
  return { group, value: sign * (nearestHeight / 5) || 0 };
}

export function repPointsToDistribute(reps) {
  return -REP_GROUPS.reduce((a, g) => a + (reps[g] ?? 0), 0) || 0;
}

export const CLASS_FILE_FORMAT = 'daggerfall-enhanced/custom-class';
export const CLASS_FILE_VERSION = 1;
const SKILL_GROUP_SIZES = Object.freeze([['primary', 3], ['major', 3], ['minor', 6]]);

export function customClassDoc(c) {
  const skillName = (id) => (id == null ? null : (SKILL_NAMES[id] ?? null));
  let at = 0;
  const skills = {};
  for (const [group, n] of SKILL_GROUP_SIZES) { skills[group] = c.skills.slice(at, at + n).map(skillName); at += n; }
  const picks = (list) => list.map(({ primary, secondary }) => (secondary ? { primary, secondary } : { primary }));
  return {
    format: CLASS_FILE_FORMAT,
    version: CLASS_FILE_VERSION,
    name: c.className,
    hitPointsPerLevel: c.hp,
    skills,
    attributes: { ...c.stats },
    advantages: picks(c.advantages),
    disadvantages: picks(c.disadvantages),
    reputations: Object.fromEntries(REP_GROUPS.map((g) => [g, c.reps?.[g] ?? 0])),
  };
}

const STAT_KEYS = Object.freeze(['strength', 'intelligence', 'willpower', 'agility', 'endurance', 'personality', 'speed', 'luck']);

export function parseCustomClassDoc(input) {
  const fail = (error) => ({ ok: false, error });
  let doc = input;
  if (typeof input === 'string') {
    try { doc = JSON.parse(input); } catch { return fail('That is not a class file. It could not be read.'); }
  }
  if (!doc || typeof doc !== 'object' || doc.format !== CLASS_FILE_FORMAT) return fail('That is not a Bunnyfall class file.');
  if (!Number.isInteger(doc.version) || doc.version < 1) return fail('That class file has no valid version number.');
  if (doc.version > CLASS_FILE_VERSION) return fail('That class file was made by a newer version of the game.');
  // The name box types printable characters alone; a file could carry a line break or a bidi override.
  const name = typeof doc.name === 'string' ? doc.name.replace(/[\p{Cc}\p{Cf}]/gu, '').trim() : '';
  const hp = doc.hitPointsPerLevel;
  if (!Number.isInteger(hp) || hp < HP_MIN || hp > HP_MAX) return fail(`Hit points per level must be a whole number from ${HP_MIN} to ${HP_MAX}.`);
  const byName = new Map(SKILL_NAMES.map((n, i) => [String(n).toLowerCase(), i]));
  const skillId = (v) => (Number.isInteger(v) && v >= 0 && v < SKILL_COUNT ? v
    : typeof v === 'string' && byName.has(v.trim().toLowerCase()) ? byName.get(v.trim().toLowerCase()) : undefined);
  const skills = [];
  for (const [group, n] of SKILL_GROUP_SIZES) {
    const row = doc.skills?.[group];
    if (!Array.isArray(row) || row.length !== n) return fail(`A class has ${n} ${group} skills.`);
    for (const v of row) {
      if (v == null) { skills.push(null); continue; }
      const id = skillId(v);
      if (id === undefined) return fail(`"${v}" is not a skill.`);
      skills.push(id);
    }
  }
  const chosen = skills.filter((id) => id != null);
  if (new Set(chosen).size !== chosen.length) return fail('A skill can only be chosen once.');
  const stats = {};
  for (const k of STAT_KEYS) {
    const v = doc.attributes?.[k];
    if (!Number.isInteger(v) || v < FREE_EDIT_MIN || v > FREE_EDIT_MAX) return fail(`${k[0].toUpperCase()}${k.slice(1)} must be a whole number from ${FREE_EDIT_MIN} to ${FREE_EDIT_MAX}.`);
    stats[k] = v;
  }
  const reps = {};
  for (const g of REP_GROUPS) {
    const v = doc.reputations?.[g] ?? 0;
    if (!Number.isInteger(v) || Math.abs(v) > REP_MAX) return fail(`A reputation is a whole number from -${REP_MAX} to ${REP_MAX}.`);
    reps[g] = v || 0;
  }
  const skipped = [];
  const advantages = [], disadvantages = [];
  const take = (entries, keys, list, other) => {
    for (const e of Array.isArray(entries) ? entries : []) {
      const primary = e?.primary;
      const secondary = typeof e?.secondary === 'string' ? e.secondary : '';
      const second = keys.includes(primary) ? secondaryListFor(primary) : null;
      const valid = keys.includes(primary) && (second ? second.includes(secondary) : secondary === '');
      const item = valid ? { primary, secondary, difficulty: advDisAdjustment(primary, secondary) } : null;
      if (!item || list.length >= MAX_ITEMS
        || (ONLY_ONE_KEYS.includes(primary) && list.some((x) => x.primary === primary))
        || cannotAdd(item, list, other)) { skipped.push(e); continue; }
      list.push(item);
    }
  };
  take(doc.advantages, ADVANTAGE_KEYS, advantages, disadvantages);
  take(doc.disadvantages, DISADVANTAGE_KEYS, disadvantages, advantages);
  return { ok: true, value: { name, hp, skills, stats, reps, advantages, disadvantages }, skipped };
}
