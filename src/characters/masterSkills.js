export const MASTER_SKILLS_NAME = 'Master Skills';

export const MASTER_SKILLS_OFFER_ROWS = Object.freeze([
  'You have mastered a skill.',
  'Activate Master Skills?',
  '',
  'You can master 3 primary, 2 major and 1 minor',
  'skill once each reaches 100. A mastered skill',
  'can climb past 100, up to 200.',
  'Each point past 100 is much slower to earn',
  'and gives a smaller boost.',
  'Past 100 a skill only learns from tough foes;',
  'weak ones and repeating it will not help.',
  'Below 100, skills rise as before.',
  'Dangerous dungeons send stronger enemies.',
  'Values may change during development.',
  '',
  'You can turn it off in your skill screen.',
  'Your progress is always kept.',
]);

export const MASTER_SKILLS_ABOUT = Object.freeze([
  'Every skill can reach 100. You can master 3 primary, 2 major and 1 minor skill once each reaches 100, and only mastered skills climb past 100, up to 200. A mastery can never be undone. Miscellaneous skills stop at 100.',
  'Each point past 100 is much slower to earn and gives 25% of the boost of a point below 100, with milestone bonuses at 125, 150, 175 and 200.',
  'Past 100 a skill only improves against enemies that are tough for it. Weak enemies and repetition do not help. Below 100, skills rise as before, and mastering a primary skill no longer holds your other skills at 95.',
  'Dangerous dungeons send stronger enemies as your skills pass 100. Easy dungeons, towns and the wilds stay as they are.',
  'It is always on when playing online. Offline you can turn it off and keep your progress: skills above 100 count as 100 until you turn it back on. It cannot be changed inside a dungeon. Values may change during development.',
]);

export const MASTER_SKILLS_ONLINE_TEXT = 'Master Skills is always on when playing online.';
export const MASTER_SKILLS_DUNGEON_TEXT = 'Master Skills cannot be changed inside a dungeon.';
export const MASTER_SKILLS_DECLINED_TEXT = 'You can activate Master Skills later in your skill screen.';
export const MASTER_SKILLS_ON_TEXT = 'Master Skills activated: skills can pass 100.';
export const MASTER_SKILLS_OFF_TEXT = 'Master Skills off. Your progress is kept.';

export const MASTER_SKILLS_INFO_ROWS = Object.freeze([
  'You have mastered a skill.',
  'Master Skills',
  '',
  'You can now master 3 primary, 2 major and',
  '1 minor skill once each reaches 100. A mastered',
  'skill can climb past 100, up to 200.',
  'Each point past 100 is much slower to earn',
  'and gives a smaller boost.',
  'Past 100 a skill only learns from tough foes;',
  'weak ones and repeating it will not help.',
  'Below 100, skills rise as before.',
  'Dangerous dungeons send stronger enemies.',
  'Values may change during development.',
]);

export const MASTER_SKILLS_INTRO_ROWS = Object.freeze([
  'Master Skills',
  'Past 100 a skill learns only from tough foes,',
  'and each point is much slower to earn.',
  'Dangerous dungeons send stronger enemies.',
  '',
]);

export const masterSkillsActive = (entity) => (entity?._online === true ? true : entity?.masterSkills === true);

export const MASTERY_SLOTS = Object.freeze({ primary: 3, major: 2, minor: 1 });
export const MASTERY_GROUP_NAMES = Object.freeze({ primary: 'Primary', major: 'Major', minor: 'Minor' });

export function careerGroupOf(entity, id) {
  const c = entity?.career;
  if (c?.primarySkills?.includes(id)) return 'primary';
  if (c?.majorSkills?.includes(id)) return 'major';
  if (c?.minorSkills?.includes(id)) return 'minor';
  return null;
}

export const masteredSkills = (entity) => (Array.isArray(entity?.masteredSkills) ? entity.masteredSkills : []);
export const isMasteredSkill = (entity, id) => masteredSkills(entity).includes(id);

export function masterableCount(entity, ids) {
  let n = 0;
  for (const g of /** @type {const} */ (['primary', 'major', 'minor'])) {
    const mine = ids.filter((id) => careerGroupOf(entity, id) === g);
    const have = mine.filter((id) => isMasteredSkill(entity, id)).length;
    n += have + Math.min(masterySlots(entity, g).left, mine.length - have);
  }
  return n;
}
export function masterySlots(entity, group) {
  const max = MASTERY_SLOTS[group] ?? 0;
  const used = masteredSkills(entity).filter((id) => careerGroupOf(entity, id) === group).length;
  return { used, max, left: Math.max(0, max - used) };
}

export const skillCanPassCap = (entity, id) => masterSkillsActive(entity) && isMasteredSkill(entity, id);

export function masteryRefusal(entity, id) {
  if (!masterSkillsActive(entity)) return 'Master Skills is off.';
  const g = careerGroupOf(entity, id);
  if (!g) return 'Only primary, major and minor skills can be mastered.';
  if (isMasteredSkill(entity, id)) return 'Already mastered.';
  if (!((entity.skills?.[id] ?? 0) >= 100)) return 'A skill can be mastered once it reaches 100.';
  if (masterySlots(entity, g).left <= 0) return `All ${MASTERY_SLOTS[g]} ${g} masteries are chosen.`;
  return null;
}

function dropPlainPractice(entity, id) {
  if ((entity?.skills?.[id] ?? 0) >= 100 && Array.isArray(entity.skillUses) && id < entity.skillUses.length) entity.skillUses[id] = 0;
}

export function normalPracticeHeld(held) {
  if (!held || typeof held !== 'object') return null;
  const out = {};
  for (const [k, n] of Object.entries(held)) if (/^\d+$/.test(k) && Number.isFinite(n) && n > 0) out[k] = n;
  return Object.keys(out).length ? out : null;
}
function holdMasterPractice(entity) {
  const held = {};
  for (const id of masteredSkills(entity)) if ((entity.skills?.[id] ?? 0) >= 100) held[id] = entity.skillUses?.[id];
  entity.masterPracticeHeld = normalPracticeHeld(held);
}
function returnMasterPractice(entity) {
  const held = normalPracticeHeld(entity.masterPracticeHeld);
  entity.masterPracticeHeld = null;
  if (!held || !Array.isArray(entity.skillUses)) return;
  for (const [k, n] of Object.entries(held)) if (Number(k) < entity.skillUses.length) entity.skillUses[Number(k)] = n;
}

export function masterSkill(entity, id, names = null) {
  const why = masteryRefusal(entity, id);
  if (why) return { ok: false, text: why };
  entity.masteredSkills = [...masteredSkills(entity), id];
  dropPlainPractice(entity, id);
  const n = names?.[id] ?? 'The skill';
  return { ok: true, text: `${n} mastered: it can now pass 100.` };
}

export function masteryCandidates(entity) {
  const c = entity?.career;
  return [...(c?.primarySkills ?? []), ...(c?.majorSkills ?? []), ...(c?.minorSkills ?? [])]
    .filter((id) => masteryRefusal(entity, id) == null);
}

export function nextMasteryChoice(entity) {
  const asked = Array.isArray(entity?.masteryPrompted) ? entity.masteryPrompted : [];
  return masteryCandidates(entity).find((id) => !asked.includes(id)) ?? null;
}

export function masteryChoiceRows(entity, id, names = {}) {
  const g = careerGroupOf(entity, id);
  const { max, left } = masterySlots(entity, g);
  const name = names[id] ?? 'this skill';
  const after = left - 1;
  return [
    `Master ${name}?`,
    '',
    `${name} has reached 100. If you master it,`,
    'it can climb past 100, up to 200.',
    '',
    'This decision cannot be undone.',
    `${MASTERY_GROUP_NAMES[g]} skills: you can master ${max}.`,
    after > 0 ? `After this: ${after} ${g} ${after === 1 ? 'mastery' : 'masteries'} left.` : `This would be your last ${g} mastery.`,
  ];
}

export function masterCappedSkill(entity, raw, id = null) {
  if (!entity?.isPlayer || !(raw > 100)) return raw;
  if (masterSkillsActive(entity) && (id == null || isMasteredSkill(entity, id))) return raw;
  return 100;
}

let _gate = null;
export function setMasterSkillsGate(fn) { _gate = typeof fn === 'function' ? fn : null; }

export const masterSkillsSwitchable = (entity) => entity?._online !== true;

export function masterSkillsBlockReason(entity) {
  if (!masterSkillsSwitchable(entity)) return MASTER_SKILLS_ONLINE_TEXT;
  try { return _gate?.(entity) ?? null; } catch { return null; }
}

export function setMasterSkills(entity, on) {
  const reason = masterSkillsBlockReason(entity);
  if (reason) return { ok: false, text: reason };
  const was = masterSkillsActive(entity);
  entity.masterSkills = !!on;
  if (was && !masterSkillsActive(entity)) holdMasterPractice(entity);
  if (!was && masterSkillsActive(entity)) { for (const id of masteredSkills(entity)) dropPlainPractice(entity, id); returnMasterPractice(entity); }
  entity.masterSkillsAsked = true;
  return { ok: true, text: on ? MASTER_SKILLS_ON_TEXT : MASTER_SKILLS_OFF_TEXT };
}

const masteredPrimary = (entity) => Array.isArray(entity?.skills)
  && (entity.career?.primarySkills ?? []).some((id) => (entity.skills[id] ?? 0) >= 100);

export function masterSkillsBoxDue(entity) {
  if (!entity || !masteredPrimary(entity)) return null;
  if (entity._online === true) return entity.masterSkillsInfoSeen ? null : 'info';
  if (entity.masterSkills === true || entity.masterSkillsAsked) return null;
  return masterSkillsBlockReason(entity) == null ? 'offer' : null;
}

export function masterSkillsStatusText(entity) {
  if (entity?._online === true) return `${MASTER_SKILLS_NAME}: On`;
  return `${MASTER_SKILLS_NAME}: ${entity?.masterSkills === true ? 'On' : 'Off'}`;
}
