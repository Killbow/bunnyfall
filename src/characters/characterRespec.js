// @ts-check
import { STAT_KEYS_ORDER, MAX_STAT_VALUE, FATIGUE_MULTIPLIER, liveStat, maxBreath } from './statMods.js';
import { SKILLS_RECENTLY_RAISED_WORDS, SKILL_COUNT, SKILL_NAMES, levelUpSkillSum } from './skills.js';
import { SKILL_HARD_CAP } from './skillSoftcap.js';
import {
  CLASS_CAREERS,
  statTotal,
  spellPoints,
  spellPointMultiplier,
  assignStartingSpells,
  healOtherSpell,
  HEAL_OTHER_INDEX,
  defineLiveMaxHealth,
  defineLiveMaxMagicka,
} from './chargen.js';
import {
  FREE_EDIT_MIN,
  HP_MIN,
  HP_MAX,
  DIFFICULTY_MIN,
  DIFFICULTY_MAX,
  difficultyPoints,
  buildCustomCareer,
  classAffinityIndex,
  customSpellSetIndex,
} from './customClass.js';
import {
  ADVANTAGE_KEYS,
  DISADVANTAGE_KEYS,
  secondaryListFor,
  advDisAdjustment,
  totalAdjust,
  parseCareerData,
  cannotAdd,
} from './specialAdvantages.js';
import { MASTERY_SLOTS, normalPracticeHeld } from './masterSkills.js';
import { isPathId, pathFindings } from './arcanePaths.js';
import { isMartialPathId } from './martialPaths.js';
import { evenHpFloor } from './levelEven.js';
import { releaseCapLatch } from './levelCap.js';
import { keepFraction, refreshOnlineLayer, renownHpOf, spireHpOf } from './renownLayer.js';
import { OGHMA_BONUS_POOL } from '../items/artifactEffects.js';
import { checkForLevelUp, levelUpSkillSumAnchor } from './advancement.js';
import { usesVirtueLeveling, checkForVirtueLevelUp, LEVELING_CLASSIC, newCharacterLevelingSystem } from './oblivionLeveling.js';
import {
  EQUIP_SLOTS,
  ITEM_HANDS,
  getItemHands,
  equipTableOf,
  isBrokenItem,
  isForbiddenEquip,
  unequipSlot,
  rebuildEquipState,
} from './equip.js';
import { WEAPONS, WEAPON_MATERIALS } from './weapons.js';
import { addItem } from '../items/inventory.js';
import { mintCondition, setItemFields } from '../items/itemTemplates.js';
import { itemLongName } from '../items/itemInfo.js';
import { quickslotKey } from '../items/quickslots.js';
import { healCurseLift, curseOf } from '../afflictions/healCurse.js';
import { liveInfections } from '../afflictions/infection.js';
import { LYCANTHROPY_SPELL_TAG, VAMPIRE_SPELL_TAG } from '../afflictions/lycanthropy.js';
import { computeEntityMods } from './entityMods.js';
import { computeEnchantmentMods, restartHeldEnchantments } from '../magic/enchantments.js';
import { passiveSpecialsMagicRound } from './passiveSpecials.js';
import { isOnlinePage } from '../platform/onlineLane.js';
import { awakenedVampirism } from '../systems/vampire/vitae.js';
import { returnAllServantKits, rebaseThrallDays } from '../systems/vampire/thralls.js';

export const RESPEC_STAT_MIN = FREE_EDIT_MIN;
export const RESPEC_STAT_MAX = MAX_STAT_VALUE;
export const RESPEC_CONFIRM_WORD = 'RESET';
export const REVERT_CONFIRM_WORD = 'REVERT';
export const PARKED_RESPEC_VERSION = 1;
export const SPELLBOOK_TEMPLATE = 132;
export const SKILL_TIERS = Object.freeze(['primary', 'major', 'minor', 'other']);

const MINUTES_PER_DAY = 1440;

/** @param {any} a */
function cloneEffect(a) {
  if (!a || typeof a !== 'object') return null;
  const c = { ...a };
  if (a.effect && typeof a.effect === 'object') c.effect = { ...a.effect };
  if (a.statMods && typeof a.statMods === 'object') c.statMods = { ...a.statMods };
  if (a.statMaxMods && typeof a.statMaxMods === 'object') c.statMaxMods = { ...a.statMaxMods };
  if (a.skillMods && typeof a.skillMods === 'object') c.skillMods = { ...a.skillMods };
  if (a.blood && typeof a.blood === 'object') c.blood = { ...a.blood };
  if (a.deeds && typeof a.deeds === 'object') c.deeds = { ...a.deeds };
  delete c.caster;
  return c;
}

/** @param {any} career */
function cloneCleanCareer(career) {
  if (!career || typeof career !== 'object') return null;
  const out = {
    ...career,
    hitPointsPerLevel: Math.max(HP_MIN, Math.min(HP_MAX, Math.trunc(Number(career.hitPointsPerLevel) || 8))),
    abilityFlagsAndSpellPointsBitfield: Number.isFinite(career.abilityFlagsAndSpellPointsBitfield)
      ? (career.abilityFlagsAndSpellPointsBitfield | 0)
      : 0x1000,
    primarySkills: Array.isArray(career.primarySkills) ? career.primarySkills.slice(0, 3) : [],
    majorSkills: Array.isArray(career.majorSkills) ? career.majorSkills.slice(0, 3) : [],
    minorSkills: Array.isArray(career.minorSkills) ? career.minorSkills.slice(0, 6) : [],
  };
  delete out.martialMirror;
  delete out.arcaneMirror;
  return out;
}

/**
 * Clamps active attribute drains, diseases, and poisons so lowering a permanent stat
 * during reset or revert can never reduce liveStat to 0 and trigger instant death.
 * @param {any} entity
 */
export function clampActiveStatDrains(entity) {
  const list = entity?.activeEffects;
  if (!Array.isArray(list)) return;
  for (const a of list) {
    if (!a || a.ended) continue;
    if ((a.kind === 'drainAttribute' || a.kind === 'transferAttribute') && typeof a.stat === 'string') {
      const perm = Math.max(1, Math.trunc(Number(entity.stats?.[a.stat]) || 1));
      const nextMag = Math.min(Math.max(0, Number(a.magnitude) || 0), Math.max(0, perm - 1));
      a.magnitude = nextMag;
      if (!(nextMag > 0)) a.ended = true;
    }
  }
  for (const stat of STAT_KEYS_ORDER) {
    if (entity.stats?.[stat] == null || liveStat(entity, stat) >= 1) continue;
    for (const a of list) {
      if (!a || a.ended || (a.kind !== 'disease' && a.kind !== 'poison') || !a.statMods) continue;
      const cur = Number(a.statMods[stat]) || 0;
      if (cur >= 0) continue;
      a.statMods[stat] = 0;
      const raised = liveStat(entity, stat);
      if (raised >= 1) {
        a.statMods[stat] = Math.max(cur, -(raised - 1));
        break;
      }
    }
  }
}

/**
 * @param {any} career
 * @returns {{ primary: number[], major: number[], minor: number[], other: number[] }}
 */
export function careerSkillTiers(career) {
  const primary = Array.isArray(career?.primarySkills) ? career.primarySkills.slice(0, 3) : [];
  const major = Array.isArray(career?.majorSkills) ? career.majorSkills.slice(0, 3) : [];
  const minor = Array.isArray(career?.minorSkills) ? career.minorSkills.slice(0, 6) : [];
  const taken = new Set([...primary, ...major, ...minor]);
  const other = [];
  for (let id = 0; id < SKILL_COUNT; id++) if (!taken.has(id)) other.push(id);
  return { primary, major, minor, other };
}

/**
 * @param {any} career
 * @param {number} id
 * @returns {'primary'|'major'|'minor'|'other'}
 */
export function tierOfSkillInCareer(career, id) {
  if (career?.primarySkills?.includes(id)) return 'primary';
  if (career?.majorSkills?.includes(id)) return 'major';
  if (career?.minorSkills?.includes(id)) return 'minor';
  return 'other';
}

/** @param {any} entity */
export function attributeBudgetOf(entity) {
  const minFloor = STAT_KEYS_ORDER.reduce((lo, k) => {
    const v = Math.trunc(Number(entity?.stats?.[k] ?? RESPEC_STAT_MIN));
    return Math.min(lo, v > 0 ? v : RESPEC_STAT_MIN);
  }, RESPEC_STAT_MIN);
  const floor = Math.min(RESPEC_STAT_MIN, minFloor);
  const currentSum = statTotal(entity?.stats);
  const unspentOghma = entity?.oghmaLevelUp === true ? OGHMA_BONUS_POOL : 0;
  const maxTotal = STAT_KEYS_ORDER.length * RESPEC_STAT_MAX;
  const rawTotal = Math.max(STAT_KEYS_ORDER.length * floor, currentSum + unspentOghma);
  return {
    budget: Math.min(maxTotal, rawTotal),
    currentSum,
    unspentOghma,
    floor,
    ceiling: RESPEC_STAT_MAX,
  };
}

/**
 * @param {any} entity
 * @returns {Record<string, number>}
 */
export function initialRespecStats(entity) {
  const { budget, floor, ceiling } = attributeBudgetOf(entity);
  /** @type {Record<string, number>} */
  const out = {};
  for (const k of STAT_KEYS_ORDER) {
    const raw = Math.trunc(Number(entity?.stats?.[k]) || 50);
    out[k] = Math.max(floor, Math.min(ceiling, raw));
  }
  let diff = budget - statTotal(out);
  while (diff > 0) {
    const pick = STAT_KEYS_ORDER.find((k) => out[k] < ceiling);
    if (!pick) break;
    out[pick] += 1;
    diff -= 1;
  }
  while (diff < 0) {
    const pick = [...STAT_KEYS_ORDER].reverse().find((k) => out[k] > floor);
    if (!pick) break;
    out[pick] -= 1;
    diff += 1;
  }
  return out;
}

/**
 * @param {any} oldCareer
 * @param {number[]} oldSkills
 * @param {any} newCareer
 * @returns {number[]}
 */
export function defaultSkillSlotPlan(oldCareer, oldSkills, newCareer) {
  const oldT = careerSkillTiers(oldCareer);
  const newT = careerSkillTiers(newCareer);
  const plan = new Array(SKILL_COUNT).fill(-1);
  for (const tier of SKILL_TIERS) {
    const fromIds = oldT[tier];
    const toIds = newT[tier];
    const fromSet = new Set(fromIds);
    const usedFrom = new Set();
    const pendingTo = [];
    for (const tid of toIds) {
      if (fromSet.has(tid)) {
        plan[tid] = tid;
        usedFrom.add(tid);
      } else {
        pendingTo.push(tid);
      }
    }
    const remainingFrom = fromIds
      .filter((fid) => !usedFrom.has(fid))
      .sort((a, b) => (Number(oldSkills?.[b] ?? 0) - Number(oldSkills?.[a] ?? 0)) || (a - b));
    for (let i = 0; i < pendingTo.length; i++) {
      plan[pendingTo[i]] = remainingFrom[i] ?? fromIds[i] ?? pendingTo[i];
    }
  }
  return plan;
}

/**
 * @param {number[]} plan
 * @param {any} newCareer
 * @param {number} skillA
 * @param {number} skillB
 * @returns {number[]}
 */
export function swapSkillSlotInPlan(plan, newCareer, skillA, skillB) {
  if (!Array.isArray(plan) || plan.length !== SKILL_COUNT) return plan;
  if (skillA === skillB || skillA < 0 || skillA >= SKILL_COUNT || skillB < 0 || skillB >= SKILL_COUNT) return plan;
  if (tierOfSkillInCareer(newCareer, skillA) !== tierOfSkillInCareer(newCareer, skillB)) return plan;
  const next = [...plan];
  const tmp = next[skillA];
  next[skillA] = next[skillB];
  next[skillB] = tmp;
  return next;
}

/**
 * @param {{ name: string, hp: number, primarySkills: number[], majorSkills: number[], minorSkills: number[],
 *   advantages?: Array<{ primary: string, secondary?: string, difficulty: number }>,
 *   disadvantages?: Array<{ primary: string, secondary?: string, difficulty: number }>,
 *   stats?: Record<string, number> }} spec
 */
export function buildRespecCustomCareer(spec) {
  const cleanName = String(spec?.name ?? '').trim().slice(0, 32);
  if (!cleanName) return { ok: false, error: 'Enter a class name.' };
  const p = spec?.primarySkills ?? [], m = spec?.majorSkills ?? [], n = spec?.minorSkills ?? [];
  const twelve = [...p, ...m, ...n];
  if (p.length !== 3 || m.length !== 3 || n.length !== 6) {
    return { ok: false, error: 'Assign 3 Primary, 3 Major, and 6 Minor skills.' };
  }
  if (twelve.some((id) => !Number.isInteger(id) || id < 0 || id >= SKILL_COUNT) || new Set(twelve).size !== 12) {
    return { ok: false, error: 'Every class skill must be distinct.' };
  }
  const hp = Math.trunc(Number(spec?.hp) || 0);
  if (hp < HP_MIN || hp > HP_MAX) {
    return { ok: false, error: `HP per level must be between ${HP_MIN} and ${HP_MAX}.` };
  }
  const rawAdv = Array.isArray(spec?.advantages) ? spec.advantages : [];
  const rawDis = Array.isArray(spec?.disadvantages) ? spec.disadvantages : [];
  if (rawAdv.length > 7 || rawDis.length > 7) {
    return { ok: false, error: 'At most 7 advantages and 7 disadvantages may be chosen.' };
  }
  const normalizeTrait = (/** @type {any} */ item, /** @type {readonly string[]} */ allowed) => {
    const primary = String(item?.primary ?? '');
    if (!allowed.includes(primary)) return null;
    const secs = secondaryListFor(primary);
    const secondary = String(item?.secondary ?? '');
    if (secs ? !secs.includes(secondary) : secondary !== '') return null;
    return { primary, secondary, difficulty: advDisAdjustment(primary, secondary) };
  };
  const adv = [];
  for (const a of rawAdv) {
    const clean = normalizeTrait(a, ADVANTAGE_KEYS);
    if (!clean) return { ok: false, error: 'Invalid special advantage selection.' };
    adv.push(clean);
  }
  const dis = [];
  for (const d of rawDis) {
    const clean = normalizeTrait(d, DISADVANTAGE_KEYS);
    if (!clean) return { ok: false, error: 'Invalid special disadvantage selection.' };
    dis.push(clean);
  }
  const checked = [];
  for (const item of [...adv, ...dis]) {
    if (cannotAdd(item, checked, checked)) {
      return { ok: false, error: 'Conflicting or duplicate special advantages/disadvantages.' };
    }
    checked.push(item);
  }
  const points = difficultyPoints(hp, totalAdjust(adv), totalAdjust(dis));
  if (points < DIFFICULTY_MIN || points > DIFFICULTY_MAX) {
    return { ok: false, error: 'Class advancement difficulty is outside the legal dagger gauge range.' };
  }
  const baseStats = spec?.stats ?? {
    strength: 50, intelligence: 50, willpower: 50, agility: 50,
    endurance: 50, personality: 50, speed: 50, luck: 50,
  };
  const career = buildCustomCareer({ name: cleanName, hp, skills: twelve, stats: baseStats, points });
  parseCareerData(career, checked.map((s) => ({ ...s })));
  career.swapped = true;
  return { ok: true, career, points };
}

/** @param {any} entity @param {{ career: any, careerIndex?: number, stats: Record<string, number>, skillPlan: number[] }} spec */
export function validateRespecBuild(entity, spec) {
  if (!entity?.career || !Array.isArray(entity?.skills) || entity.skills.length < SKILL_COUNT) {
    return { ok: false, error: 'Character is not ready for a reset.' };
  }
  const c = spec?.career;
  if (!c || typeof c !== 'object') return { ok: false, error: 'Select a valid class.' };
  const twelve = [...(c.primarySkills ?? []), ...(c.majorSkills ?? []), ...(c.minorSkills ?? [])];
  if ((c.primarySkills?.length ?? 0) !== 3 || (c.majorSkills?.length ?? 0) !== 3 || (c.minorSkills?.length ?? 0) !== 6) {
    return { ok: false, error: 'Class must define 3 Primary, 3 Major, and 6 Minor skills.' };
  }
  if (twelve.some((id) => !Number.isInteger(id) || id < 0 || id >= SKILL_COUNT) || new Set(twelve).size !== 12) {
    return { ok: false, error: 'Class skills must be 12 distinct valid skills.' };
  }

  const { budget, floor, ceiling } = attributeBudgetOf(entity);
  const stats = spec?.stats;
  if (!stats || typeof stats !== 'object') return { ok: false, error: 'Allocate your attribute points.' };
  for (const k of STAT_KEYS_ORDER) {
    const v = stats[k];
    if (!Number.isInteger(v) || v < floor || v > ceiling) {
      return { ok: false, error: `Each attribute must be a whole number from ${floor} to ${ceiling}.` };
    }
  }
  const spent = statTotal(stats);
  if (spent !== budget) {
    const rem = budget - spent;
    return {
      ok: false,
      error: rem > 0
        ? `You still have ${rem} attribute ${rem === 1 ? 'point' : 'points'} left to spend.`
        : `You have overspent attributes by ${-rem} ${-rem === 1 ? 'point' : 'points'}.`,
    };
  }

  const plan = spec?.skillPlan;
  if (!Array.isArray(plan) || plan.length !== SKILL_COUNT) {
    return { ok: false, error: 'Assign every skill slot within its tier.' };
  }
  const oldT = careerSkillTiers(entity.career);
  const newT = careerSkillTiers(c);
  for (const tier of SKILL_TIERS) {
    const expectedFrom = new Set(oldT[tier]);
    const seenFrom = new Set();
    for (const targetId of newT[tier]) {
      const sourceId = plan[targetId];
      if (!expectedFrom.has(sourceId) || seenFrom.has(sourceId)) {
        return { ok: false, error: `Skill slots in ${tier} must be a 1-to-1 assignment from your previous ${tier} skills.` };
      }
      seenFrom.add(sourceId);
    }
    if (seenFrom.size !== expectedFrom.size) {
      return { ok: false, error: `Every ${tier} skill slot must be assigned.` };
    }
  }
  return { ok: true };
}

/**
 * @param {any} career
 * @param {number} careerIndex
 */
export function careerCastsSpells(career, careerIndex) {
  if (!career) return false;
  const bitfield = career.abilityFlagsAndSpellPointsBitfield ?? 0x1000;
  const lightUnable = ((bitfield >> 6) & 3) === 1;
  const darkUnable = ((bitfield >> 8) & 3) === 1;
  if (lightUnable && darkUnable) return false;
  if (career.necromancer === true) return true;
  if (Number.isInteger(careerIndex) && careerIndex >= 0 && careerIndex <= 6) return true;
  if (customSpellSetIndex(career) != null) return true;
  return ((bitfield & 0x1c00) >> 8) !== 20;
}

/**
 * @param {any} entity
 * @param {any} newCareer
 * @param {Record<string, number>} newStats
 * @param {number[]} skillPlan
 */
export function previewCharacterRespec(entity, newCareer, newStats, skillPlan) {
  const level = Math.max(1, Math.trunc(Number(entity?.level) || 1));
  const rawMaxHp = evenHpFloor({ career: newCareer, level }, newStats.endurance);
  const rawMaxMp = spellPoints(
    newStats.intelligence,
    spellPointMultiplier(newCareer?.abilityFlagsAndSpellPointsBitfield ?? 0x1000),
  );
  const maxFatigue = (newStats.strength + newStats.endurance) * FATIGUE_MULTIPLIER;

  const unequipped = [];
  const slots = equipTableOf(entity);
  const seen = new Set();
  for (let i = 0; i < slots.length; i++) {
    const it = slots[i];
    if (!it || seen.has(it)) continue;
    if (isForbiddenEquip(newCareer, it)) {
      seen.add(it);
      unequipped.push(itemLongName(it) || it.name || 'Item');
    }
  }

  /** @type {Array<{ fromId: number, fromName: string, toId: number, toName: string, score: number, tier: string }>} */
  const masteryTransfers = [];
  if (Array.isArray(skillPlan) && skillPlan.length === SKILL_COUNT) {
    for (const tier of /** @type {const} */ (['primary', 'major', 'minor'])) {
      const ids = careerSkillTiers(newCareer)[tier];
      for (const toId of ids) {
        const fromId = skillPlan[toId];
        const score = Math.trunc(Number(entity?.skills?.[fromId] ?? 0));
        if (score > 100 && masteryTransfers.filter((m) => m.tier === tier).length < MASTERY_SLOTS[tier]) {
          masteryTransfers.push({
            fromId,
            fromName: SKILL_NAMES[fromId] ?? `Skill ${fromId}`,
            toId,
            toName: SKILL_NAMES[toId] ?? `Skill ${toId}`,
            score,
            tier,
          });
        }
      }
    }
  }

  const curse = curseOf(entity);
  return {
    level,
    rawMaxHp,
    rawMaxMp,
    maxFatigue,
    unequipped,
    masteryTransfers,
    curse: {
      vampire: curse.vampire,
      were: curse.were,
      blood: curse.blood,
      pending: !!entity?.racialOverridePending,
    },
    hadArcanePath: !!entity?.arcanePath,
    hadMartialPath: !!entity?.martialPath,
  };
}

/**
 * Validates and normalizes a serialized parked pre-reset record.
 * @param {any} raw
 */
export function sanitizeParkedRespec(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.v !== PARKED_RESPEC_VERSION) return null;
  const rid = typeof raw.rid === 'string' && raw.rid.length >= 4 && raw.rid.length <= 80 ? raw.rid : null;
  if (!rid) return null;
  const st = raw.state;
  if (!st || typeof st !== 'object' || Array.isArray(st)) return null;
  const career = cloneCleanCareer(st.career);
  if (!career) return null;
  const twelve = [...career.primarySkills, ...career.majorSkills, ...career.minorSkills];
  if (career.primarySkills.length !== 3 || career.majorSkills.length !== 3 || career.minorSkills.length !== 6) return null;
  if (twelve.some((id) => !Number.isInteger(id) || id < 0 || id >= SKILL_COUNT) || new Set(twelve).size !== 12) return null;

  const level = Math.trunc(Number(st.level) || 0);
  if (level < 1 || level > 1000) return null;
  if (!st.stats || typeof st.stats !== 'object') return null;
  /** @type {Record<string, number>} */
  const stats = {};
  for (const k of STAT_KEYS_ORDER) {
    const v = Math.trunc(Number(st.stats[k]));
    if (!Number.isFinite(v) || v < 0 || v > MAX_STAT_VALUE) return null;
    stats[k] = v;
  }
  if (!Array.isArray(st.skills) || st.skills.length < SKILL_COUNT) return null;
  const skills = new Array(SKILL_COUNT);
  for (let i = 0; i < SKILL_COUNT; i++) {
    const v = Number(st.skills[i]);
    if (!Number.isFinite(v) || v < 0 || v > SKILL_HARD_CAP) return null;
    skills[i] = Math.trunc(v);
  }
  const skillUses = new Array(SKILL_COUNT);
  for (let i = 0; i < SKILL_COUNT; i++) {
    const u = Number(st.skillUses?.[i] ?? 0);
    skillUses[i] = Number.isFinite(u) && u >= 0 ? u : 0;
  }
  const skillUseFrac = Array.isArray(st.skillUseFrac) && st.skillUseFrac.length >= SKILL_COUNT
    ? Array.from({ length: SKILL_COUNT }, (_, i) => (Number.isFinite(st.skillUseFrac[i]) && st.skillUseFrac[i] >= 0 ? Number(st.skillUseFrac[i]) : 0))
    : null;
  const skillProgress = Array.isArray(st.skillProgress) && st.skillProgress.length >= SKILL_COUNT
    ? Array.from({ length: SKILL_COUNT }, (_, i) => (Number.isFinite(st.skillProgress[i]) && st.skillProgress[i] >= 0 ? Number(st.skillProgress[i]) : 0))
    : null;
  const skillsRecentlyRaised = Array.isArray(st.skillsRecentlyRaised) && st.skillsRecentlyRaised.length === SKILLS_RECENTLY_RAISED_WORDS
    ? st.skillsRecentlyRaised.map((w) => (Number.isFinite(w) ? (w | 0) : 0))
    : new Array(SKILLS_RECENTLY_RAISED_WORDS).fill(0);

  const classSet = new Set(twelve);
  const masteredSkills = Array.isArray(st.masteredSkills)
    ? [...new Set(st.masteredSkills.filter((id) => Number.isInteger(id) && classSet.has(id)))]
    : [];
  const masteryPrompted = Array.isArray(st.masteryPrompted)
    ? [...new Set(st.masteryPrompted.filter((id) => Number.isInteger(id) && id >= 0 && id < SKILL_COUNT))]
    : [...masteredSkills];
  const arcanePath = isPathId(st.arcanePath) && !pathFindings({ arcanePath: st.arcanePath, masteredSkills }).length
    ? st.arcanePath
    : null;
  const martialPath = isMartialPathId(st.martialPath) ? st.martialPath : null;
  const maxLawfulHp = 125 + level * (HP_MAX + 25);
  const rawMaxHealth = Math.max(1, Math.min(maxLawfulHp, Math.trunc(Number(st.rawMaxHealth) || 25)));

  const rawCurse = st.curse && typeof st.curse === 'object' ? st.curse : {};
  let racialOverride = cloneEffect(rawCurse.racialOverride);
  if (racialOverride && racialOverride.kind !== 'racialOverride') racialOverride = null;
  if (racialOverride) {
    racialOverride.ended = false;
    racialOverride.permanent = true;
    racialOverride.isTransformed = false;
    if (racialOverride.racial === 'lycanthropy') {
      racialOverride.raceNameOverride = null;
      racialOverride.statMods = {};
      racialOverride.skillMods = {};
    }
  }
  const bloodInfections = Array.isArray(rawCurse.bloodInfections)
    ? rawCurse.bloodInfections.slice(0, 8).map(cloneEffect).filter((e) => e && e.infection)
    : [];
  const curseSpells = Array.isArray(rawCurse.curseSpells)
    ? rawCurse.curseSpells
      .slice(0, 16)
      .filter((s) => s && typeof s === 'object' && (s.tag === VAMPIRE_SPELL_TAG || s.tag === LYCANTHROPY_SPELL_TAG))
      .map((s) => JSON.parse(JSON.stringify(s)))
    : [];

  const wornLoadout = Array.isArray(st.wornLoadout)
    ? st.wornLoadout
      .slice(0, 32)
      .filter((w) => w && Number.isInteger(w.slot) && w.slot >= 0 && w.slot < 32)
      .map((w) => ({
        slot: w.slot,
        uid: typeof w.uid === 'string' && w.uid.length <= 64 ? w.uid : null,
        provenance: typeof w.provenance === 'string' && w.provenance.length <= 64 ? w.provenance : null,
        key: typeof w.key === 'string' && w.key.length <= 512 ? w.key : null,
      }))
    : [];

  return {
    v: PARKED_RESPEC_VERSION,
    rid,
    parkedAtMinutes: Number.isFinite(raw.parkedAtMinutes) ? Math.max(0, Math.floor(raw.parkedAtMinutes)) : 0,
    grantedSpellbook: raw.grantedSpellbook === true,
    grantedSpellIds: Array.isArray(raw.grantedSpellIds)
      ? [...new Set(raw.grantedSpellIds.filter((id) => Number.isInteger(id)).slice(0, 64))]
      : [],
    state: {
      level,
      career,
      careerIndex: Number.isInteger(st.careerIndex) ? st.careerIndex : 0,
      stats,
      skills,
      skillUses,
      skillUseFrac,
      skillProgress,
      skillsRecentlyRaised,
      startingLevelUpSkillSum: Number.isFinite(st.startingLevelUpSkillSum) ? Number(st.startingLevelUpSkillSum) : null,
      currentLevelUpSkillSum: Number.isFinite(st.currentLevelUpSkillSum) ? Number(st.currentLevelUpSkillSum) : null,
      readyToLevelUp: st.readyToLevelUp === true,
      hadOghmaPending: st.hadOghmaPending === true,
      pendingLevel: Number.isInteger(st.pendingLevel) ? st.pendingLevel : null,
      pendingBonusPool: Number.isInteger(st.pendingBonusPool) ? st.pendingBonusPool : null,
      levelingSystem: typeof st.levelingSystem === 'string' && st.levelingSystem.length <= 24 ? st.levelingSystem : null,
      levelProgress: Number.isFinite(st.levelProgress) ? Math.max(0, Number(st.levelProgress)) : 0,
      levelRollUp: Number.isFinite(st.levelRollUp) ? Math.max(0, Number(st.levelRollUp)) : 0,
      masterSkills: st.masterSkills === true,
      masteredSkills,
      masteryPrompted,
      masterPracticeHeld: normalPracticeHeld(st.masterPracticeHeld),
      arcanePath,
      pathPrompted: st.pathPrompted === true,
      martialPath,
      martialPrompted: st.martialPrompted === true,
      rawMaxHealth,
      hadSpellbook: st.hadSpellbook === true,
      knownSpellKeys: Array.isArray(st.knownSpellKeys)
        ? [...new Set(st.knownSpellKeys.filter((id) => Number.isInteger(id)).slice(0, 256))]
        : [],
      wornLoadout,
      curse: {
        racialOverride,
        bloodInfections,
        racialOverridePending: rawCurse.racialOverridePending && typeof rawCurse.racialOverridePending === 'object'
          ? { ...rawCurse.racialOverridePending }
          : null,
        previousVampireClan: Number.isInteger(rawCurse.previousVampireClan) ? rawCurse.previousVampireClan : 0,
        timeToBecomeVampireOrWerebeast: Number.isFinite(rawCurse.timeToBecomeVampireOrWerebeast)
          ? Math.max(0, Math.trunc(rawCurse.timeToBecomeVampireOrWerebeast))
          : 0,
        minMetalToHit: Number.isInteger(rawCurse.minMetalToHit) ? rawCurse.minMetalToHit : null,
        curseSpells,
      },
    },
  };
}

/** @param {any} entity */
export function hasParkedRespec(entity) {
  return sanitizeParkedRespec(entity?.parkedRespec) !== null;
}

/**
 * Captures the exact pre-reset character build and status before a Psijic Seal reset runs.
 * @param {any} entity
 * @param {{ rid: string, nowMinutes?: number }} opts
 */
export function snapshotPreRespecState(entity, { rid, nowMinutes = 0 }) {
  const slots = equipTableOf(entity);
  const wornLoadout = [];
  const seenItems = new Set();
  for (let slot = 0; slot < slots.length; slot++) {
    const it = slots[slot];
    if (!it || seenItems.has(it)) continue;
    seenItems.add(it);
    wornLoadout.push({
      slot,
      uid: typeof it.uid === 'string' ? it.uid : null,
      provenance: typeof it.provenance === 'string' ? it.provenance : null,
      key: quickslotKey(it),
    });
  }

  const activeOverride = entity?.racialOverride && !entity.racialOverride.ended
    ? cloneEffect(entity.racialOverride)
    : (Array.isArray(entity?.activeEffects)
      ? cloneEffect(entity.activeEffects.find((a) => a?.kind === 'racialOverride' && !a.ended))
      : null);
  const bloodInfections = liveInfections(entity)
    .filter((e) => /vamp|lycan|were/i.test(String(e.key ?? e.infection ?? '')))
    .map(cloneEffect)
    .filter(Boolean);
  const curseSpells = (entity?.spells ?? [])
    .filter((s) => s?.tag === VAMPIRE_SPELL_TAG || s?.tag === LYCANTHROPY_SPELL_TAG)
    .map((s) => JSON.parse(JSON.stringify(s)));
  const knownSpellKeys = (entity?.spells ?? [])
    .filter((s) => s && s.tag !== VAMPIRE_SPELL_TAG && s.tag !== LYCANTHROPY_SPELL_TAG && Number.isInteger(s.index))
    .map((s) => s.index);

  const rawHp = Number.isFinite(entity?.rawMaxHealth)
    ? Math.trunc(entity.rawMaxHealth)
    : Math.max(1, Math.trunc((Number(entity?.maxHealth) || 25) - renownHpOf(entity) - spireHpOf(entity)));

  return sanitizeParkedRespec({
    v: PARKED_RESPEC_VERSION,
    rid: String(rid || 'respec_parked'),
    parkedAtMinutes: Math.max(0, Math.floor(Number(nowMinutes) || 0)),
    grantedSpellbook: false,
    grantedSpellIds: [],
    state: {
      level: Math.max(1, Math.trunc(Number(entity?.level) || 1)),
      career: cloneCleanCareer(entity?.career),
      careerIndex: Number.isInteger(entity?.careerIndex) ? entity.careerIndex : 0,
      stats: Object.fromEntries(STAT_KEYS_ORDER.map((k) => [k, Math.max(0, Math.min(MAX_STAT_VALUE, Math.trunc(Number(entity?.stats?.[k]) || 50)))])),
      skills: Array.from({ length: SKILL_COUNT }, (_, i) => Math.max(0, Math.min(SKILL_HARD_CAP, Math.trunc(Number(entity?.skills?.[i]) || 0)))),
      skillUses: Array.from({ length: SKILL_COUNT }, (_, i) => Number(entity?.skillUses?.[i] ?? 0)),
      skillUseFrac: Array.isArray(entity?.skillUseFrac) ? [...entity.skillUseFrac] : null,
      skillProgress: Array.isArray(entity?.skillProgress) ? [...entity.skillProgress] : null,
      skillsRecentlyRaised: Array.isArray(entity?.skillsRecentlyRaised) ? [...entity.skillsRecentlyRaised] : [0, 0],
      startingLevelUpSkillSum: Number.isFinite(entity?.startingLevelUpSkillSum) ? entity.startingLevelUpSkillSum : null,
      currentLevelUpSkillSum: Number.isFinite(entity?.currentLevelUpSkillSum) ? entity.currentLevelUpSkillSum : null,
      readyToLevelUp: entity?.readyToLevelUp === true,
      hadOghmaPending: entity?.oghmaLevelUp === true,
      pendingLevel: Number.isInteger(entity?.pendingLevel) ? entity.pendingLevel : null,
      pendingBonusPool: Number.isInteger(entity?.pendingBonusPool) ? entity.pendingBonusPool : null,
      levelingSystem: typeof entity?.levelingSystem === 'string' ? entity.levelingSystem : null,
      levelProgress: Number.isFinite(entity?.levelProgress) ? entity.levelProgress : 0,
      levelRollUp: Number.isFinite(entity?.levelRollUp) ? entity.levelRollUp : 0,
      masterSkills: entity?.masterSkills === true,
      masteredSkills: Array.isArray(entity?.masteredSkills) ? [...entity.masteredSkills] : [],
      masteryPrompted: Array.isArray(entity?.masteryPrompted) ? [...entity.masteryPrompted] : [],
      masterPracticeHeld: normalPracticeHeld(entity?.masterPracticeHeld),
      arcanePath: entity?.arcanePath ?? null,
      pathPrompted: entity?.pathPrompted === true,
      martialPath: entity?.martialPath ?? null,
      martialPrompted: entity?.martialPrompted === true,
      rawMaxHealth: Math.max(1, rawHp),
      hadSpellbook: Boolean((entity?.items ?? []).some((it) => it?.group === 'MiscItems' && it?.templateIndex === SPELLBOOK_TEMPLATE)),
      knownSpellKeys,
      wornLoadout,
      curse: {
        racialOverride: activeOverride,
        bloodInfections,
        racialOverridePending: entity?.racialOverridePending ? { ...entity.racialOverridePending } : null,
        previousVampireClan: entity?.previousVampireClan ?? 0,
        timeToBecomeVampireOrWerebeast: entity?.timeToBecomeVampireOrWerebeast ?? 0,
        minMetalToHit: Number.isInteger(entity?.minMetalToHit) ? entity.minMetalToHit : null,
        curseSpells,
      },
    },
  });
}

/**
 * Matches a parked worn-loadout entry against items currently in entity.items.
 * @param {any[]} items
 * @param {{ slot: number, uid: string|null, provenance: string|null, key: string|null }} entry
 * @param {Set<any>} used
 * @param {boolean} [allowEquipped]
 */
function findLoadoutMatch(items, entry, used, allowEquipped = false) {
  for (const it of items) {
    if (!it || used.has(it) || (!allowEquipped && it.equipSlot != null)) continue;
    if (entry.uid) {
      if (it.uid === entry.uid) return it;
      continue;
    }
    if (entry.provenance) {
      if (it.provenance === entry.provenance) return it;
      continue;
    }
    if (entry.key && !it.uid && !it.provenance && quickslotKey(it) === entry.key) return it;
  }
  return null;
}

/** @param {any} entity */
export function parkedRespecSummary(entity) {
  const parked = sanitizeParkedRespec(entity?.parkedRespec);
  if (!parked) return null;
  const { state } = parked;
  const rawMaxMagicka = spellPoints(
    state.stats.intelligence,
    spellPointMultiplier(state.career.abilityFlagsAndSpellPointsBitfield ?? 0x1000),
  );
  const items = Array.isArray(entity?.items) ? entity.items : [];
  const used = new Set();
  let reEquippableCount = 0;
  for (const w of state.wornLoadout) {
    const real = findLoadoutMatch(items, w, used, true);
    if (real && !isBrokenItem(real) && !isForbiddenEquip(state.career, real)) {
      used.add(real);
      reEquippableCount += 1;
    }
  }
  const bankedBudget = statTotal(state.stats) + (state.hadOghmaPending ? OGHMA_BONUS_POOL : 0);
  const currentBudget = attributeBudgetOf(entity).budget;
  return {
    rid: parked.rid,
    level: state.level,
    className: String(state.career.name || 'Adventurer'),
    career: state.career,
    stats: { ...state.stats },
    skills: [...state.skills],
    masteredSkills: [...state.masteredSkills],
    arcanePath: state.arcanePath,
    martialPath: state.martialPath,
    rawMaxHealth: state.rawMaxHealth,
    rawMaxMagicka,
    hadOghmaPending: state.hadOghmaPending,
    curse: {
      vampire: state.curse.racialOverride?.racial === 'vampirism',
      were: state.curse.racialOverride?.racial === 'lycanthropy',
      blood: state.curse.bloodInfections.length,
      pending: !!state.curse.racialOverridePending,
    },
    wornSavedCount: state.wornLoadout.length,
    reEquippableCount,
    levelChanged: Math.trunc(Number(entity?.level) || 1) !== state.level,
    statBudgetChanged: currentBudget !== bankedBudget,
  };
}

/**
 * @param {any} entity
 * @param {{ career: any, careerIndex?: number, stockCareers?: any[], stats: Record<string, number>, skillPlan: number[], rid?: string, bankPolicy?: 'replace' | 'keep' }} spec
 * @param {{ spellsByIndex?: any, nowMinutes?: number, advanceMinutes?: ((n: number) => void) | null, refreshHead?: (() => void) | null }} [deps]
 */
export function applyCharacterRespec(entity, spec, deps = {}) {
  const valid = validateRespecBuild(entity, spec);
  if (!valid.ok) return valid;

  const nowMin = Math.max(0, Math.floor(Number(deps.nowMinutes) || 0));
  const rid = typeof spec.rid === 'string' && spec.rid.length >= 4 ? spec.rid : `respec_${Date.now().toString(36)}`;
  const existingParked = sanitizeParkedRespec(entity.parkedRespec);
  const keepExistingBank = spec.bankPolicy === 'keep' && existingParked !== null;
  const freshBank = keepExistingBank ? null : snapshotPreRespecState(entity, { rid, nowMinutes: nowMin });

  const newCareer = cloneCleanCareer(spec.career);
  if (!newCareer) return { ok: false, error: 'Select a valid class.' };
  const twelve = [...newCareer.primarySkills, ...newCareer.majorSkills, ...newCareer.minorSkills];
  const isStock = Number.isInteger(spec.careerIndex)
    && /** @type {number} */ (spec.careerIndex) >= 0
    && /** @type {number} */ (spec.careerIndex) < CLASS_CAREERS.length
    && !newCareer.necromancer
    && newCareer.swapped !== true
    && newCareer.name === CLASS_CAREERS[/** @type {number} */ (spec.careerIndex)];

  const resolvedCareerIndex = isStock
    ? /** @type {number} */ (spec.careerIndex)
    : (Array.isArray(spec.stockCareers) && spec.stockCareers.length
      ? classAffinityIndex(twelve, spec.stockCareers)
      : 0);
  if (!isStock) newCareer.swapped = true;
  for (const k of STAT_KEYS_ORDER) newCareer[k] = spec.stats[k];

  // 1. Lift active Vampirism, Lycanthropy, and incubating blood infections without advancing modal clock.
  const wasAwakenedVampire = !!awakenedVampirism(entity);
  const lifted = healCurseLift(entity, {
    nowMinutes: nowMin,
    advanceMinutes: null,
    refreshHead: deps.refreshHead ?? null,
  });
  if (wasAwakenedVampire) returnAllServantKits(entity);
  entity.racialOverridePending = null;
  entity.previousVampireClan = 0;
  entity.timeToBecomeVampireOrWerebeast = 0;
  if (Array.isArray(entity.spells)) {
    entity.spells = entity.spells.filter((s) => s?.tag !== VAMPIRE_SPELL_TAG && s?.tag !== LYCANTHROPY_SPELL_TAG);
  }

  // 2. Permute skills, tallies, and held tough-foe practice 1-to-1 within each tier.
  const oldSkills = [...entity.skills];
  const oldUses = Array.isArray(entity.skillUses) ? [...entity.skillUses] : new Array(SKILL_COUNT).fill(0);
  const oldFrac = Array.isArray(entity.skillUseFrac) ? [...entity.skillUseFrac] : null;
  const oldProg = Array.isArray(entity.skillProgress) ? [...entity.skillProgress] : null;
  const oldPracticeHeld = normalPracticeHeld(entity.masterPracticeHeld);

  const nextSkills = new Array(SKILL_COUNT).fill(0);
  const nextUses = new Array(SKILL_COUNT).fill(0);
  const nextFrac = oldFrac ? new Array(SKILL_COUNT).fill(0) : null;
  const nextProg = oldProg ? new Array(SKILL_COUNT).fill(0) : null;
  for (let toId = 0; toId < SKILL_COUNT; toId++) {
    const fromId = spec.skillPlan[toId];
    nextSkills[toId] = Math.trunc(Number(oldSkills[fromId] ?? 0));
    nextUses[toId] = Number(oldUses[fromId] ?? 0);
    if (nextFrac && oldFrac) nextFrac[toId] = Number(oldFrac[fromId] ?? 0);
    if (nextProg && oldProg) nextProg[toId] = Number(oldProg[fromId] ?? 0);
  }

  const nextMastered = [];
  for (const tier of /** @type {const} */ (['primary', 'major', 'minor'])) {
    const ids = careerSkillTiers(newCareer)[tier];
    for (const toId of ids) {
      if (nextSkills[toId] > 100 && nextMastered.filter((id) => ids.includes(id)).length < MASTERY_SLOTS[tier]) {
        nextMastered.push(toId);
      }
    }
  }
  /** @type {Record<number, number>} */
  const remappedHeld = {};
  if (oldPracticeHeld) {
    for (const toId of nextMastered) {
      const fromId = spec.skillPlan[toId];
      const heldVal = oldPracticeHeld[fromId];
      if (Number.isFinite(heldVal) && heldVal > 0) remappedHeld[toId] = heldVal;
    }
  }

  // 3. Clear Arcane/Martial specializations and open non-overcap mastery slots.
  entity.arcanePath = null;
  entity.pathPrompted = true;
  entity.martialPath = null;
  entity.martialPrompted = true;
  entity.masteredSkills = nextMastered;
  entity.masteryPrompted = [...nextMastered];
  entity.masterPracticeHeld = normalPracticeHeld(remappedHeld);
  entity.skillsRecentlyRaised = new Array(SKILLS_RECENTLY_RAISED_WORDS).fill(0);

  // 4. Apply career, attributes, Oghma latch cleanup, and level-up sums.
  const oldHpMax = Math.max(1, Number(entity.maxHealth) || 1);
  const oldHp = Math.max(1, Number(entity.health) || oldHpMax);
  const oldMpMax = Math.max(0, Number(entity.maxMagicka) || 0);
  const oldMp = Math.max(0, Number(entity.magicka) || 0);

  const level = Math.max(1, Math.trunc(Number(entity.level) || 1));
  const hadOghmaPending = entity.oghmaLevelUp === true;
  entity.career = newCareer;
  entity.careerIndex = resolvedCareerIndex;
  entity.stats = { ...spec.stats };
  entity.skills = nextSkills;
  entity.skillUses = nextUses;
  if (nextFrac) entity.skillUseFrac = nextFrac;
  if (nextProg) entity.skillProgress = nextProg;

  if (hadOghmaPending) {
    entity.oghmaLevelUp = false;
    entity.readyToLevelUp = false;
    entity.pendingLevel = null;
    entity.pendingBonusPool = null;
  }

  const liveSum = levelUpSkillSum(entity);
  if (!Number.isFinite(entity.startingLevelUpSkillSum)) {
    entity.startingLevelUpSkillSum = levelUpSkillSumAnchor(liveSum, level);
  }
  if (!Number.isFinite(entity.currentLevelUpSkillSum) || entity.currentLevelUpSkillSum < liveSum) {
    const rise = Math.max(0, liveSum - (Number(entity.currentLevelUpSkillSum) || liveSum));
    entity.startingLevelUpSkillSum += rise;
    entity.currentLevelUpSkillSum = liveSum;
  }
  if (hadOghmaPending) {
    if (usesVirtueLeveling(entity)) checkForVirtueLevelUp(entity);
    else checkForLevelUp(entity);
  }
  releaseCapLatch(entity);

  // 5. Unequip worn items forbidden by the new class back into the pack.
  const unequipped = [];
  const slots = equipTableOf(entity);
  for (let slot = 0; slot < slots.length; slot++) {
    const worn = slots[slot];
    if (worn && isForbiddenEquip(newCareer, worn)) {
      const name = itemLongName(worn) || worn.name || 'Item';
      unequipSlot(entity, slot);
      unequipped.push(name);
    }
  }

  // 6. Ensure Spellbook and basic starting spells for spellcasting builds.
  if (!Array.isArray(entity.items)) entity.items = [];
  if (!Array.isArray(entity.spells)) entity.spells = [];
  const casts = careerCastsSpells(newCareer, isStock ? resolvedCareerIndex : -1);
  let grantedSpellbook = false;
  let grantedSpells = 0;
  /** @type {number[]} */
  const addedSpellIds = [];
  if (casts) {
    const hasBook = entity.items.some((it) => it?.group === 'MiscItems' && it?.templateIndex === SPELLBOOK_TEMPLATE);
    if (!hasBook) {
      addItem(entity.items, mintCondition(setItemFields({ group: 'MiscItems', templateIndex: SPELLBOOK_TEMPLATE })));
      grantedSpellbook = true;
    }
    if (deps.spellsByIndex) {
      const spellSetIdx = isStock && resolvedCareerIndex <= 6
        ? resolvedCareerIndex
        : customSpellSetIndex(newCareer);
      if (spellSetIdx != null) {
        const starters = assignStartingSpells(spellSetIdx, deps.spellsByIndex, newCareer);
        const existingIds = new Set(entity.spells.map((s) => s?.index).filter((x) => x != null));
        for (const sp of starters) {
          if (sp && !existingIds.has(sp.index)) {
            entity.spells.push(sp);
            existingIds.add(sp.index);
            grantedSpells += 1;
            if (Number.isInteger(sp.index)) addedSpellIds.push(sp.index);
          }
        }
      }
    }
  }

  // 7. Store or update the single banked pre-reset snapshot.
  if (keepExistingBank && existingParked) {
    const origKnown = new Set(existingParked.state.knownSpellKeys);
    const mergedSpells = new Set(existingParked.grantedSpellIds);
    for (const id of addedSpellIds) if (!origKnown.has(id)) mergedSpells.add(id);
    existingParked.grantedSpellbook = Boolean(
      existingParked.grantedSpellbook || (!existingParked.state.hadSpellbook && grantedSpellbook),
    );
    existingParked.grantedSpellIds = [...mergedSpells];
    entity.parkedRespec = existingParked;
  } else if (freshBank) {
    freshBank.grantedSpellbook = Boolean(!freshBank.state.hadSpellbook && grantedSpellbook);
    freshBank.grantedSpellIds = [...addedSpellIds];
    entity.parkedRespec = freshBank;
  }
  entity.lastRespecRid = rid;

  // 8. Clamp active drains, recompute enchant/passive modifiers, and scale vitals.
  defineLiveMaxMagicka(entity);
  defineLiveMaxHealth(entity);
  const rawMaxHp = evenHpFloor({ career: newCareer, level }, spec.stats.endurance);
  const rawMaxMp = spellPoints(
    spec.stats.intelligence,
    spellPointMultiplier(newCareer.abilityFlagsAndSpellPointsBitfield ?? 0x1000),
  );
  entity.maxHealth = rawMaxHp;
  entity.maxMagicka = rawMaxMp;
  clampActiveStatDrains(entity);
  computeEntityMods(entity);
  computeEnchantmentMods(entity, null, { clampMagicka: false });
  passiveSpecialsMagicRound(entity, { nowMinutes: nowMin, clockMinutes: nowMin, sinks: null });
  refreshOnlineLayer(entity, { keepHealth: false });

  const nextHpMax = Math.max(1, Number(entity.maxHealth) || rawMaxHp);
  entity.health = keepFraction(oldHp, oldHpMax, nextHpMax);
  const nextMpMax = Math.max(0, Number(entity.maxMagicka) || 0);
  entity.magicka = oldMpMax > 0
    ? keepFraction(oldMp, oldMpMax, nextMpMax)
    : nextMpMax;
  const nextMaxFatigue = (spec.stats.strength + spec.stats.endurance) * FATIGUE_MULTIPLIER;
  entity.fatigue = Math.max(1, Math.min(nextMaxFatigue, Number(entity.fatigue) || nextMaxFatigue));
  if (Number.isFinite(entity.currentBreath) && entity.currentBreath > 0) {
    entity.currentBreath = Math.min(entity.currentBreath, Math.max(0, maxBreath(entity)));
  }

  return {
    ok: true,
    unequipped,
    lifted,
    curseChanged: Boolean(lifted.vampire || lifted.were || lifted.blood > 0),
    masteredSkills: [...entity.masteredSkills],
    grantedSpellbook,
    grantedSpells,
    bankPolicyUsed: keepExistingBank ? 'keep' : 'replace',
    maxHealth: entity.maxHealth,
    maxMagicka: entity.maxMagicka,
  };
}

/**
 * @param {any} entity
 * @param {{ spellsByIndex?: any, nowMinutes?: number, refreshHead?: (() => void) | null }} [deps]
 */
export function revertCharacterRespec(entity, deps = {}) {
  const parked = sanitizeParkedRespec(entity?.parkedRespec);
  if (!parked) {
    return { ok: false, error: 'No banked pre-reset build is available to restore.' };
  }
  const s = parked.state;
  const nowMin = Math.max(0, Math.floor(Number(deps.nowMinutes) || 0));
  const dtMin = Math.max(0, nowMin - parked.parkedAtMinutes);
  const dtDays = Math.floor(dtMin / MINUTES_PER_DAY);

  const oldHpMax = Math.max(1, Number(entity.maxHealth) || 1);
  const oldHp = Math.max(1, Number(entity.health) || oldHpMax);
  const oldMpMax = Math.max(0, Number(entity.maxMagicka) || 0);
  const oldMp = Math.max(0, Number(entity.magicka) || 0);
  const preRevertLevel = Math.max(1, Math.trunc(Number(entity.level) || 1));
  const preRevertStatSum = STAT_KEYS_ORDER.reduce(
    (sum, k) => sum + Math.max(0, Math.trunc(Number(entity.stats?.[k]) || 0)),
    0,
  ) + (entity.oghmaLevelUp === true ? OGHMA_BONUS_POOL : 0);
  const wasAwakenedNow = !!awakenedVampirism(entity);

  // 1. Clear post-reset curses and restore banked curse state if any existed.
  const clearedPost = healCurseLift(entity, {
    nowMinutes: nowMin,
    advanceMinutes: null,
    refreshHead: deps.refreshHead ?? null,
  });
  if (wasAwakenedNow && s.curse.racialOverride?.racial !== 'vampirism') {
    returnAllServantKits(entity);
  }
  if (!Array.isArray(entity.spells)) entity.spells = [];
  entity.spells = entity.spells.filter((sp) => sp?.tag !== VAMPIRE_SPELL_TAG && sp?.tag !== LYCANTHROPY_SPELL_TAG);
  if (!Array.isArray(entity.activeEffects)) entity.activeEffects = [];

  entity.previousVampireClan = s.curse.previousVampireClan ?? 0;
  entity.timeToBecomeVampireOrWerebeast = s.curse.timeToBecomeVampireOrWerebeast > 0
    ? s.curse.timeToBecomeVampireOrWerebeast + dtMin
    : 0;
  entity.racialOverridePending = s.curse.racialOverridePending ? { ...s.curse.racialOverridePending } : null;

  let restoredCurse = false;
  for (const inf of s.curse.bloodInfections) {
    const copy = cloneEffect(inf);
    if (!copy) continue;
    copy.ended = false;
    copy.permanent = true;
    if (Number.isFinite(copy.startingDay)) copy.startingDay += dtDays;
    if (Number.isFinite(copy.lastDay)) copy.lastDay += dtDays;
    entity.activeEffects.push(copy);
    restoredCurse = true;
  }
  if (s.curse.racialOverride) {
    const ro = cloneEffect(s.curse.racialOverride);
    if (ro) {
      ro.ended = false;
      ro.permanent = true;
      ro.isTransformed = false;
      if (ro.racial === 'vampirism') {
        if (Number.isFinite(ro.lastTimeFed)) ro.lastTimeFed += dtMin;
        if (Number.isFinite(ro.vitaeAt)) ro.vitaeAt += dtMin;
        if (Number.isFinite(ro.turnedAt)) ro.turnedAt += dtMin;
        if (dtDays > 0) rebaseThrallDays(dtDays);
        entity.minMetalToHit = WEAPON_MATERIALS.Silver;
      } else if (ro.racial === 'lycanthropy') {
        ro.raceNameOverride = null;
        ro.statMods = {};
        ro.skillMods = {};
        if (Number.isFinite(ro.lastKilledInnocent)) ro.lastKilledInnocent += dtMin;
        entity.minMetalToHit = undefined;
      }
      entity.activeEffects.push(ro);
      entity.racialOverride = ro;
      entity.isInBeastForm = false;
      entity.maxHealthLimiter = null;
      restoredCurse = true;
    }
  } else {
    entity.racialOverride = null;
    entity.isInBeastForm = false;
    entity.maxHealthLimiter = null;
    entity.minMetalToHit = s.curse.minMetalToHit ?? undefined;
  }

  for (const csp of s.curse.curseSpells) {
    entity.spells.push(JSON.parse(JSON.stringify(csp)));
  }

  // 2. Restore class, level, stats (preserving Oghma +30 points), skills, advancement counters, masteries, and paths.
  const restoredStats = { ...s.stats };
  const bankedBaseSum = STAT_KEYS_ORDER.reduce((sum, k) => sum + (s.stats[k] ?? 0), 0);
  const maxNormalLevelGain = Math.max(0, preRevertLevel - s.level) * 6;
  const postRespecOghma = !s.hadOghmaPending && (preRevertStatSum - bankedBaseSum >= OGHMA_BONUS_POOL + maxNormalLevelGain);
  let oghmaOwed = (s.hadOghmaPending === true ? OGHMA_BONUS_POOL : 0) + (postRespecOghma ? OGHMA_BONUS_POOL : 0);
  if (oghmaOwed > 0) {
    const order = [...STAT_KEYS_ORDER].sort((a, b) => (restoredStats[b] ?? 0) - (restoredStats[a] ?? 0));
    for (const k of order) {
      if (oghmaOwed <= 0) break;
      const room = Math.max(0, MAX_STAT_VALUE - (restoredStats[k] ?? 0));
      const add = Math.min(oghmaOwed, room);
      if (add > 0) {
        restoredStats[k] += add;
        oghmaOwed -= add;
      }
    }
  }

  entity.level = s.level;
  entity.career = cloneCleanCareer(s.career);
  entity.careerIndex = s.careerIndex;
  entity.stats = restoredStats;
  entity.skills = [...s.skills];
  entity.skillUses = [...s.skillUses];
  entity.skillUseFrac = s.skillUseFrac ? [...s.skillUseFrac] : null;
  entity.skillProgress = s.skillProgress ? [...s.skillProgress] : null;
  entity.skillsRecentlyRaised = s.skillsRecentlyRaised
    ? [...s.skillsRecentlyRaised]
    : new Array(SKILLS_RECENTLY_RAISED_WORDS).fill(0);

  const liveSum = levelUpSkillSum(entity);
  entity.startingLevelUpSkillSum = Number.isFinite(s.startingLevelUpSkillSum)
    ? s.startingLevelUpSkillSum
    : levelUpSkillSumAnchor(liveSum, s.level);
  entity.currentLevelUpSkillSum = Number.isFinite(s.currentLevelUpSkillSum)
    ? s.currentLevelUpSkillSum
    : liveSum;
  const rawSys = s.levelingSystem ?? entity.levelingSystem ?? LEVELING_CLASSIC;
  const nextSys = newCharacterLevelingSystem(rawSys, { online: isOnlinePage() });
  entity.levelingSystem = nextSys;
  entity.levelProgress = nextSys === rawSys ? (s.levelProgress ?? 0) : 0;
  entity.levelRollUp = nextSys === rawSys ? (s.levelRollUp ?? 0) : 0;
  entity.oghmaLevelUp = false;
  entity.readyToLevelUp = s.readyToLevelUp === true;
  entity.pendingLevel = s.pendingLevel ?? null;
  entity.pendingBonusPool = s.pendingBonusPool ?? null;
  releaseCapLatch(entity);
  if (nextSys !== rawSys) {
    const targetLvl = entity.readyToLevelUp === true ? s.level + 1 : s.level;
    entity.startingLevelUpSkillSum = levelUpSkillSumAnchor(entity.currentLevelUpSkillSum, targetLvl);
  }

  entity.masterSkills = s.masterSkills === true;
  entity.masteredSkills = [...s.masteredSkills];
  entity.masteryPrompted = [...s.masteryPrompted];
  entity.masterPracticeHeld = normalPracticeHeld(s.masterPracticeHeld);
  entity.arcanePath = isPathId(s.arcanePath)
    && !pathFindings({ arcanePath: s.arcanePath, masteredSkills: entity.masteredSkills }).length
    ? s.arcanePath
    : null;
  entity.pathPrompted = s.pathPrompted === true;
  entity.martialPath = isMartialPathId(s.martialPath) ? s.martialPath : null;
  entity.martialPrompted = s.martialPrompted === true;

  // 3. Drop respec starter spells not originally known, restore missing stock spells, and tidy free Spellbook.
  const origKnownSet = new Set(s.knownSpellKeys);
  const stripSet = new Set(parked.grantedSpellIds.filter((id) => !origKnownSet.has(id)));
  if (stripSet.size > 0) {
    entity.spells = entity.spells.filter((sp) => {
      if (!sp || sp.tag === VAMPIRE_SPELL_TAG || sp.tag === LYCANTHROPY_SPELL_TAG) return true;
      return !stripSet.has(sp.index);
    });
  }
  if (deps.spellsByIndex) {
    const presentIds = new Set(entity.spells.map((sp) => sp?.index).filter((x) => x != null));
    for (const id of s.knownSpellKeys) {
      if (presentIds.has(id)) continue;
      if (id === HEAL_OTHER_INDEX) {
        const touch = healOtherSpell(deps.spellsByIndex);
        if (touch) { entity.spells.push(touch); presentIds.add(id); }
      } else if (id >= 0) {
        const stock = deps.spellsByIndex.get?.(id);
        if (stock) { entity.spells.push(stock); presentIds.add(id); }
      }
    }
  }

  if (!Array.isArray(entity.items)) entity.items = [];
  let removedFreeBook = false;
  const nonCurseSpellsLeft = entity.spells.some((sp) => sp && sp.tag !== VAMPIRE_SPELL_TAG && sp.tag !== LYCANTHROPY_SPELL_TAG);
  if (parked.grantedSpellbook && !s.hadSpellbook && !nonCurseSpellsLeft) {
    for (let i = entity.items.length - 1; i >= 0; i--) {
      const it = entity.items[i];
      if (
        it?.group === 'MiscItems'
        && it.templateIndex === SPELLBOOK_TEMPLATE
        && it.equipSlot == null
        && !it.uid
        && !it.provenance
        && !it.enchantments?.length
        && !it.customEnchantments?.length
        && !it.affixes?.length
        && entity.lightSource !== it
      ) {
        entity.items.splice(i, 1);
        removedFreeBook = true;
        break;
      }
    }
  }

  // 4. Re-equip pre-reset worn items still in pack without billing Cast-When-Held durability or duplicating items.
  const slots = equipTableOf(entity);
  for (let slot = 0; slot < slots.length; slot++) {
    if (slots[slot]) unequipSlot(entity, slot);
  }
  const usedItems = new Set();
  const reEquipped = [];
  const occupiedSlots = new Set();
  let twoHandedRight = false;
  for (const w of s.wornLoadout) {
    if (occupiedSlots.has(w.slot)) continue;
    let candidate = findLoadoutMatch(entity.items, w, usedItems);
    if (!candidate) continue;
    if (candidate.group === 'Weapons' && candidate.templateIndex === WEAPONS.Arrow) continue;
    if (isBrokenItem(candidate) || isForbiddenEquip(entity.career, candidate)) continue;
    const hands = getItemHands(candidate);
    if (hands === ITEM_HANDS.Both) {
      if (w.slot !== EQUIP_SLOTS.RightHand || occupiedSlots.has(EQUIP_SLOTS.LeftHand)) continue;
      twoHandedRight = true;
    } else if (w.slot === EQUIP_SLOTS.LeftHand && twoHandedRight) {
      continue;
    }
    if ((candidate.stackCount ?? 1) > 1) {
      candidate.stackCount -= 1;
      candidate = { ...candidate, stackCount: 1 };
      entity.items.push(candidate);
    }
    usedItems.add(candidate);
    occupiedSlots.add(w.slot);
    candidate.equipSlot = w.slot;
    reEquipped.push(itemLongName(candidate) || candidate.name || 'Item');
  }
  rebuildEquipState(entity);
  restartHeldEnchantments(entity);

  // 5. Consume the one-time banked save and recalculate vitals and modifiers.
  entity.parkedRespec = null;

  defineLiveMaxMagicka(entity);
  defineLiveMaxHealth(entity);
  const rawMaxMp = spellPoints(
    entity.stats.intelligence,
    spellPointMultiplier(entity.career.abilityFlagsAndSpellPointsBitfield ?? 0x1000),
  );
  entity.maxHealth = Math.max(s.rawMaxHealth, evenHpFloor({ career: entity.career, level: s.level }, entity.stats.endurance));
  entity.maxMagicka = rawMaxMp;
  clampActiveStatDrains(entity);
  computeEntityMods(entity);
  computeEnchantmentMods(entity, null, { clampMagicka: false });
  passiveSpecialsMagicRound(entity, { nowMinutes: nowMin, clockMinutes: nowMin, sinks: null });
  refreshOnlineLayer(entity, { keepHealth: false });

  const nextHpMax = Math.max(1, Number(entity.maxHealth) || s.rawMaxHealth);
  entity.health = keepFraction(oldHp, oldHpMax, nextHpMax);
  const nextMpMax = Math.max(0, Number(entity.maxMagicka) || 0);
  entity.magicka = oldMpMax > 0
    ? keepFraction(oldMp, oldMpMax, nextMpMax)
    : nextMpMax;
  const nextMaxFatigue = (entity.stats.strength + entity.stats.endurance) * FATIGUE_MULTIPLIER;
  entity.fatigue = Math.max(1, Math.min(nextMaxFatigue, Number(entity.fatigue) || nextMaxFatigue));
  if (Number.isFinite(entity.currentBreath) && entity.currentBreath > 0) {
    entity.currentBreath = Math.min(entity.currentBreath, Math.max(0, maxBreath(entity)));
  }

  return {
    ok: true,
    reverted: true,
    reEquipped,
    removedFreeBook,
    curseChanged: Boolean(clearedPost.vampire || clearedPost.were || clearedPost.blood > 0 || restoredCurse),
    lifted: clearedPost,
    maxHealth: entity.maxHealth,
    maxMagicka: entity.maxMagicka,
  };
}
