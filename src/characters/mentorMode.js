import { partyThreatLevel } from './encounterLevel.js';

export const MENTOR_LEVEL_ALLOWANCE = 1;
export const MENTOR_MIN_GAP = 3;
export const MENTOR_SKILL_BASELINE = 30;
export const MENTOR_SKILL_CEILING_SLACK = 10;
export const MENTOR_STAT_BASELINE = 40;
export const AVERAGE_LEVEL_UP_POOL = 5;
export const MENTOR_HP_BASE = 25;
export const MENTOR_MAX_DAMAGE_MULT = 5;
const STAT_KEYS = ['strength', 'intelligence', 'willpower', 'agility', 'endurance', 'personality', 'speed', 'luck'];

export const expectedSkillAt = (level) => 5 * Math.max(1, level) + 30;

export function groupReferenceLevel(levels) {
  const ls = (levels ?? []).map(Number).filter((l) => Number.isFinite(l) && l >= 1);
  if (!ls.length) return null;
  return ls.length / ls.reduce((a, l) => a + 1 / l, 0);
}

export function mentorTargetLevel(realLevel, partnerLevels) {
  const ref = groupReferenceLevel(partnerLevels);
  if (ref == null || !(realLevel >= 1)) return null;
  const t = Math.max(1, Math.min(realLevel, Math.round(ref) + MENTOR_LEVEL_ALLOWANCE));
  return realLevel - t >= MENTOR_MIN_GAP ? t : null;
}

export function mentorProfile(entity, partnerLevels) {
  const r = entity?.level ?? 1;
  const t = mentorTargetLevel(r, partnerLevels);
  if (t == null) return null;
  const skillFactor = Math.sqrt(t / r);
  const skillCeiling = expectedSkillAt(t) + MENTOR_SKILL_CEILING_SLACK;
  const stats = entity.stats ?? {};
  const pool = AVERAGE_LEVEL_UP_POOL * (r - t);
  let excess = 0;
  for (const k of STAT_KEYS) excess += Math.max(0, (stats[k] ?? 0) - MENTOR_STAT_BASELINE);
  const statCut = {};
  for (const k of STAT_KEYS) {
    const ex = Math.max(0, (stats[k] ?? 0) - MENTOR_STAT_BASELINE);
    statCut[k] = excess > 0 ? Math.min(ex, Math.round((pool * ex) / excess)) : 0;
  }
  const rawMax = (entity.rawMaxHealth ?? entity.maxHealth ?? 0) + (Number.isFinite(entity.evenHp) && entity.evenHp > 0 ? entity.evenHp : 0);
  const perLevel = r > 1 ? Math.max(1, (rawMax - MENTOR_HP_BASE) / (r - 1)) : 0;
  const mentoredMax = Math.max(1, rawMax - perLevel * (r - t));
  const damageTakenMult = rawMax > 0 ? Math.min(MENTOR_MAX_DAMAGE_MULT, Math.max(1, rawMax / mentoredMax)) : 1;
  const gearScale = Math.min(1, Math.max(0.5, Math.sqrt(expectedSkillAt(t) / expectedSkillAt(r))));
  return {
    level: t, realLevel: r, skillFactor, skillCeiling, statCut,
    mentoredMaxHealth: Math.round(mentoredMax), damageTakenMult, gearScale,
    reference: groupReferenceLevel(partnerLevels),
  };
}

export function partyLevel(ownLevel, partnerLevels) {
  return partyThreatLevel([ownLevel, ...(partnerLevels ?? [])]);
}

export function refreshMentor(entity, partnerLevels, enabled = true) {
  if (!entity) return null;
  entity._mentor = null;
  const was = entity._partyLevel ?? null;
  const next = enabled ? partyLevel(entity.level ?? 1, partnerLevels) : null;
  entity._partyLevel = next;
  if (next != null && was !== next) return 'on';
  if (was != null && next == null) return 'off';
  return null;
}

export const isMentored = (entity) => !!entity?._mentor;
export const effectiveLevel = (entity) => entity?._partyLevel ?? entity?.level ?? 1;

export function mentoredSkill(entity, raw) {
  const m = entity?._mentor;
  if (!m || !(raw > MENTOR_SKILL_BASELINE)) return raw;
  const scaled = MENTOR_SKILL_BASELINE + (raw - MENTOR_SKILL_BASELINE) * m.skillFactor;
  return Math.max(Math.min(raw, MENTOR_SKILL_BASELINE), Math.min(raw, m.skillCeiling, Math.floor(scaled)));
}

export function mentoredStat(entity, statName, raw) {
  const cut = entity?._mentor?.statCut?.[statName];
  return cut ? raw - cut : raw;
}

export const mentorGearScale = (entity) => entity?._mentor?.gearScale ?? 1;

export function mentorArmorValue(entity, raw) {
  const k = entity?._mentor?.gearScale;
  if (!k || k >= 1 || !(raw < 100)) return raw;
  return Math.round(100 - (100 - raw) * k);
}

export const mentorDamageTakenMult = (entity) => entity?._mentor?.damageTakenMult ?? 1;

export function mentorStatusText(entity) {
  const p = entity?._partyLevel;
  if (p == null) return 'No party level. Enemies and loot are built for your own level.';
  return `Party level ${p}: enemies and loot are built for the party level. Your own character is unchanged.`;
}
