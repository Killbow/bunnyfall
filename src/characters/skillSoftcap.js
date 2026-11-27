// Skills past 100: the softcap, the hard cap, the milestones, and the real-use rule. Its one import imports nothing.

import { masterSkillsActive, masterCappedSkill } from './masterSkills.js';

export const SKILL_SOFT_CAP = 100;
export const SKILL_HARD_CAP = 200;
export const OVERCAP_POINT_WEIGHT = 0.25;

export const SOFTCAP_TIERS = Object.freeze([
  Object.freeze({ from: 100, to: 125, mult: 2 }),
  Object.freeze({ from: 125, to: 150, mult: 3 }),
  Object.freeze({ from: 150, to: 200, mult: 4 }),
]);
export const OVERCAP_LEVEL_CAP = 20;

export const SKILL_MILESTONES = Object.freeze([
  Object.freeze({ at: 125, bonus: 2, title: 'Expert' }),
  Object.freeze({ at: 150, bonus: 3, title: 'Master' }),
  Object.freeze({ at: 175, bonus: 4, title: 'Grandmaster' }),
  Object.freeze({ at: 200, bonus: 6, title: 'Legend' }),
]);

export const clampSkill = (v) => Math.max(0, Math.min(SKILL_HARD_CAP, Number.isFinite(v) ? v : 0));

export function softcapCostMultiplier(v) {
  if (!(v >= SKILL_SOFT_CAP)) return 1;
  for (const t of SOFTCAP_TIERS) if (v < t.to) return t.mult;
  return Infinity;
}

export const milestoneAt = (v) => SKILL_MILESTONES.find((m) => m.at === v) ?? null;

export function milestoneBonus(v) {
  let b = 0;
  for (let i = 0; i < SKILL_MILESTONES.length; i++) if (v >= SKILL_MILESTONES[i].at) b += SKILL_MILESTONES[i].bonus;
  return b;
}

export function effectiveSkill(v) {
  if (!(v > SKILL_SOFT_CAP)) return v;
  const c = clampSkill(v);
  return Math.floor(SKILL_SOFT_CAP + (c - SKILL_SOFT_CAP) * OVERCAP_POINT_WEIGHT + milestoneBonus(c));
}

export const EFFECTIVE_SKILL_MAX = effectiveSkill(SKILL_HARD_CAP);

export const CLIMB_OVERCAP_SPEED_PER_POINT = 0.01;
export function overcapClimbSpeed(liveClimbing) {
  const gain = Math.min(EFFECTIVE_SKILL_MAX, liveClimbing) - SKILL_SOFT_CAP;
  return gain > 0 ? 1 + gain * CLIMB_OVERCAP_SPEED_PER_POINT : 1;
}

const COMBAT_SKILL_IDS = new Set([19, 20, 28, 29, 30, 31, 32, 33, 34]);
const MAGIC_SKILL_IDS = new Set([22, 23, 24, 25, 26, 27]);

export const SKILL_CATEGORY = Object.freeze({ combat: 'combat', magic: 'magic', utility: 'utility' });
export const skillCategory = (id) => (COMBAT_SKILL_IDS.has(id) ? SKILL_CATEGORY.combat
  : MAGIC_SKILL_IDS.has(id) ? SKILL_CATEGORY.magic : SKILL_CATEGORY.utility);

export const CHALLENGE_TTL_MS = 6000;
export const UNCHALLENGED_MAGIC_WEIGHT = 0.25;
export const SPAM_HALF_LIFE_MS = 60000;
export const SPAM_FREE_BURST = Object.freeze({ combat: 40, magic: 10, utility: 6 });

export function challengeTier(foe) {
  const lv = Number(foe?.challengeLevel ?? foe?.level);
  return Number.isFinite(lv) && lv > 0 ? lv * 5 + 30 : 0;
}

export function challengeQuality(tier, skill) {
  if (!(tier > 0) || !(skill > 0)) return 0;
  const r = tier / skill;
  if (r < 0.75) return 0;
  if (r < 1) { const x = (r - 0.75) / 0.25; return x * x; }
  return 1 + 0.5 * Math.min(1, (r - 1) / 0.5);
}

export function noteSkillChallenge(entity, foe, now = Date.now()) {
  if (!entity || !foe || entity === foe) return;
  const tier = challengeTier(foe);
  if (tier > 0) entity._skillChallenge = { tier, at: now };
}

function liveChallenge(entity, now) {
  const c = entity?._skillChallenge;
  return c && now - c.at <= CHALLENGE_TTL_MS ? c : null;
}

function spamWeight(entity, skillId, category, amount, now) {
  const all = (entity._skillSpam ??= {});
  const s = all[skillId] ?? { v: 0, at: now };
  const dt = Math.max(0, now - s.at);
  s.v = s.v * Math.pow(0.5, dt / SPAM_HALF_LIFE_MS) + amount;
  s.at = now;
  all[skillId] = s;
  const free = SPAM_FREE_BURST[category] ?? 6;
  return s.v <= free ? 1 : free / s.v;
}

export function overcapTallyWeight(entity, skillId, amount, skill, now = Date.now()) {
  if (!(amount > 0) || skill >= SKILL_HARD_CAP) return 0;
  const cat = skillCategory(skillId);
  const ch = liveChallenge(entity, now);
  let q;
  if (cat === SKILL_CATEGORY.combat) q = ch ? challengeQuality(ch.tier, skill) : 0;
  else if (cat === SKILL_CATEGORY.magic) q = Math.max(UNCHALLENGED_MAGIC_WEIGHT, ch ? challengeQuality(ch.tier, skill) : 0);
  else q = 1;
  if (q <= 0) return 0;
  return amount * q * spamWeight(entity, skillId, cat, amount * q, now);
}

export const MOVEMENT_SKILLS = Object.freeze({
  3: Object.freeze({ axis: 'h', stride: 1 }),
  17: Object.freeze({ axis: 'hv', stride: 3 }),
  18: Object.freeze({ axis: 'v', stride: 0.5 }),
  21: Object.freeze({ axis: 'h', stride: 1 }),
});
export const MOVE_CREDIT_CAP = 2;

export const isMovementSkill = (id) => Object.prototype.hasOwnProperty.call(MOVEMENT_SKILLS, id);

export function movementTallyWeight(entity, skillId, amount, skill) {
  const law = MOVEMENT_SKILLS[skillId];
  if (!law || !(amount > 0) || skill >= SKILL_HARD_CAP) return 0;
  const odo = entity?._odometer;
  const read = odo ? (law.axis === 'h' ? odo.h : law.axis === 'v' ? odo.v : odo.h + odo.v) : NaN;
  if (!Number.isFinite(read)) return 0;
  const marks = (entity._moveMark ??= {});
  const m = marks[skillId];
  if (!m || m.src !== odo || !(read >= m.at)) { marks[skillId] = { src: odo, at: read, credit: 0 }; return 0; }
  m.credit = Math.min(MOVE_CREDIT_CAP, m.credit + (read - m.at) / law.stride);
  m.at = read;
  const w = Math.min(amount, m.credit);
  m.credit -= w;
  return w;
}

export const EDGE_SKILL_IDS = Object.freeze([...COMBAT_SKILL_IDS, ...MAGIC_SKILL_IDS]);
export const EDGE_TOP_N = 3;
export const ENEMY_SCALING = Object.freeze({
  veteranFrom: 75,
  veteran: Object.freeze({ skill: 10, health: 1.0, damage: 0.25 }),
  overcap: Object.freeze({ skill: 26, health: 1.4, damage: 0.35 }),
});
export const DUNGEON_SHARE = Object.freeze([
  0.88,
  0.88,
  0.22,
  0.44,
  1.00,
  0.11,
  0.11,
  1.00,
  1.00,
  1.00,
  0.44,
  0.22,
  0.22,
  0.88,
  1.00,
  1.00,
  1.00,
  0.44,
  0.22,
]);
export const FOE_SHARE_FLOOR = 4;
export const FOE_SHARE_SPAN = 8;
export const CHALLENGE_LEVELS_PER_SKILL = 0.5;

const clamp01 = (x) => Math.max(0, Math.min(1, x));

export const climbedSkill = (entity, id) => effectiveSkill(masterCappedSkill(entity, entity?.skills?.[id] ?? 0, id));

export function combatEdge(entity) {
  if (!Array.isArray(entity?.skills) || entity._mentor || !masterSkillsActive(entity)) return 0;
  const gains = EDGE_SKILL_IDS.map((id) => Math.max(0, climbedSkill(entity, id) - SKILL_SOFT_CAP))
    .sort((a, b) => b - a).slice(0, EDGE_TOP_N);
  return gains.reduce((a, g) => a + g, 0) / EDGE_TOP_N;
}

export const WILDERNESS_SHARE = Object.freeze({ day: 0.22, night: 0.44 });
export const wildernessShare = (night) => (night ? WILDERNESS_SHARE.night : WILDERNESS_SHARE.day);

export const dungeonShare = (dungeonType) => (Number.isInteger(dungeonType) ? DUNGEON_SHARE[dungeonType] ?? 0 : 0);
export const foeShare = (baseLevel, isClass) => (isClass ? 1 : clamp01(((baseLevel ?? 0) - FOE_SHARE_FLOOR) / FOE_SHARE_SPAN));

export function rawSkillForEffective(target) {
  if (!(target > SKILL_SOFT_CAP)) return Math.max(0, Math.round(target));
  for (let v = SKILL_SOFT_CAP; v <= SKILL_HARD_CAP; v++) if (effectiveSkill(v) >= target) return v;
  return SKILL_HARD_CAP;
}

export function veteranProgress(entity) {
  if (!Array.isArray(entity?.skills) || entity._mentor || !masterSkillsActive(entity)) return 0;
  const from = ENEMY_SCALING.veteranFrom, span = SKILL_SOFT_CAP - from;
  const parts = EDGE_SKILL_IDS.map((id) => clamp01((Math.min(SKILL_SOFT_CAP, entity.skills[id] ?? 0) - from) / span))
    .sort((a, b) => b - a).slice(0, EDGE_TOP_N);
  return parts.reduce((a, g) => a + g, 0) / EDGE_TOP_N;
}

export const combatStanding = (entity) => ({ veteran: veteranProgress(entity), edge: combatEdge(entity) });

export const PLACE_THREAT = Object.freeze({ from: 4, full: 18, wilderness: Object.freeze({ day: 5, night: 7 }) });
export const placeVeteran = (tier) => (Number.isFinite(tier) ? clamp01((tier - PLACE_THREAT.from) / (PLACE_THREAT.full - PLACE_THREAT.from)) : 0);
export const wildernessThreat = (night) => (night ? PLACE_THREAT.wilderness.night : PLACE_THREAT.wilderness.day);

export function progressionScaling(standing, dShare, fShare, place = 0, hero = null) {
  const share = clamp01(dShare) * clamp01(fShare);
  const v = clamp01(standing?.veteran ?? 0);
  const p = clamp01(place);
  const o = clamp01((standing?.edge ?? 0) / (EFFECTIVE_SKILL_MAX - SKILL_SOFT_CAP));
  const vet = Math.max(clamp01(fShare) * p, share * v);
  const over = share * o;
  const hd = hero?.damage > 1 ? hero.damage : 1, hh = hero?.health > 1 ? hero.health : 1;
  if (!(vet > 0 || over > 0 || hd > 1 || hh > 1)) return null;
  const { veteran: V, overcap: O } = ENEMY_SCALING;
  const skillGain = V.skill * vet + O.skill * over;
  return {
    share, veteran: v, place: p, edge: standing?.edge ?? 0,
    skillGain,
    healthMult: (1 + V.health * vet + O.health * over) * hh,
    damageMult: (1 + V.damage * vet + O.damage * over) * hd,
    heroHealth: hh, heroDamage: hd,
    challengeLevels: Math.round(skillGain * CHALLENGE_LEVELS_PER_SKILL),
  };
}
