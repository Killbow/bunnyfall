// One magic round is one classic minute. A continuous effect rolls its magnitude and save fresh every round,
// and a CasterOnly spell never rolls a save. Each effect runs its first round at assignment, and a like-kind
// recast renews the incumbent's rounds instead of stacking them, unlike classic.
import { foeDamageMult } from '../world/wild/cromwark.js';
import { savingThrow, rollMagnitude, EFFECT_FLAGS, careerTolerance, isDamageHealthEffect } from './spellcast.js';
import { mentorDamageTakenMult } from '../characters/mentorMode.js';
import { spellPowerMult, spellPierce, schoolMult } from './spellPower.js';
import { castSchool } from './spellcost.js';
import { noteFeudHarm, elementFeudClass } from '../revenants/feudLedger.js';
import { raceById, raceByKey } from '../characters/races.js';
import { STAT_KEYS_ORDER, FATIGUE_MULTIPLIER, maxFatigue, increaseDrainMagnitude, liveStat } from '../characters/statMods.js';
import { dice100 } from '../combat/formulas.js';
import { tryAbsorption, absorbRefund } from './absorption.js';
import { identifyRefund } from './identifyRefund.js';
import { enemyGroupOf, NEARBY } from '../world/nearbyObjects.js';
import { breakNormalPowerConcealment, handleAttackFromSource } from './concealment.js';
import { entityAbsorbsSpells, setEnchantmentEffectDoors } from './enchantments.js';
import { markPlayerHarm } from '../combat/harmMark.js';
import { regenShare } from '../worldEvents/courtRules.js';
import { localizedText, localizedTable, t } from '../ui/textManager.js';
import { HEAL_SPELL_POINTS_KEY } from '../items/potionRecipes.js';
import { isClassEnemyId } from '../characters/enemyBasics.js';

export { breakNormalPowerConcealment, handleAttackFromSource, NORMAL_POWER_CONCEALMENTS } from './concealment.js';

export const SPELL_ABSORBED_TEXT = 'Spell was absorbed.';

export const REGENERATING_TEXT = 'You are regenerating.';
export const FEEL_DRAINED_TEXT = 'You feel drained.';

export { FATIGUE_MULTIPLIER, maxFatigue };

const ELEMENT_EFFECT_FLAG = Object.freeze([EFFECT_FLAGS.Fire, EFFECT_FLAGS.Frost, EFFECT_FLAGS.Poison, EFFECT_FLAGS.Shock, EFFECT_FLAGS.Magic]);

// Types 45 and above are this game's own effects, outside the classic keys.
export const BUFF_KINDS = Object.freeze({
  '25,255': 'slowfall',
  '31,255': 'waterWalking',
  '23,0': 'chameleonNormal',
  '14,255': 'levitate',
  '30,255': 'waterBreathing',
  '13,0': 'invisNormal',
  '13,1': 'invisTrue',
  '24,0': 'shadeNormal',
  '24,1': 'shadeTrue',
  '23,1': 'chameleonTrue',
  '26,255': 'freeAction',
  '27,255': 'jumping',
  '28,255': 'climbing',
  '39,0': 'detectMagic',
  '39,1': 'detectEnemy',
  '39,2': 'detectTreasure',
  '19,255': 'silenced',
  '15,255': 'light',
  '46,255': 'sharedCartography',
  '48,255': 'slowed',
  '49,255': 'clairvoyance',
  '51,255': 'featherweight',
  '52,255': 'wallOfEarth',
  '53,255': 'decoy',
});

export const isInvisible = (en) => hasActiveEffect(en, 'invisNormal') || hasActiveEffect(en, 'invisTrue');
export const isBlending = (en) => hasActiveEffect(en, 'chameleonNormal') || hasActiveEffect(en, 'chameleonTrue') || hasActiveEffect(en, 'decoy');
export const isAShade = (en) => hasActiveEffect(en, 'shadeNormal') || hasActiveEffect(en, 'shadeTrue');
export const isMagicallyConcealed = (en) => isInvisible(en) || isBlending(en) || isAShade(en);

export const concealmentFlags = (en) => ({
  invisible: isInvisible(en), blending: isBlending(en), shade: isAShade(en),
});

// These bits travel in the pose `cv` field (net/wire.js validPose).
export const concealBits = (en) => (isInvisible(en) ? 1 : 0) | (isBlending(en) ? 2 : 0) | (isAShade(en) ? 4 : 0);
// A Decoy hides its caster from enemies as blending does, but the caster's body does not look blended.
export const looksBlending = (en) => hasActiveEffect(en, 'chameleonNormal') || hasActiveEffect(en, 'chameleonTrue');
export const lookConcealmentFlags = (en) => ({ invisible: isInvisible(en), blending: looksBlending(en), shade: isAShade(en) });
export const lookConcealBits = (en) => (isInvisible(en) ? 1 : 0) | (looksBlending(en) ? 2 : 0) | (isAShade(en) ? 4 : 0);
export const concealFlagsOfBits = (bits) => ({ invisible: !!(bits & 1), blending: !!(bits & 2), shade: !!(bits & 4) });

/** @returns {boolean} */
export function applyEnemyMotorEffectFlags(ai, entity) {
  if (!ai) return false;
  ai.levitating = hasActiveEffect(entity, 'levitate');
  ai.slowed = hasActiveEffect(entity, 'slowed');
  return ai.levitating;
}

// Effects that always save as the Magic element, whatever element the spell has, as classic GetElementType decides.
export const MAGIC_ONLY_KEYS = new Set([
  '2,255', '3,0', '3,1', '3,2', '6,0', '6,1', '6,2',
  '8,0', '8,1', '8,2', '8,3', '8,4', '9,0', '9,1',
  '9,2', '9,3', '9,4', '9,5', '9,6', '9,7', '10,0',
  '10,1', '10,2', '10,3', '10,4', '10,5', '10,6', '10,7',
  '10,8', '10,9', '11,0', '11,1', '11,2', '11,3', '11,4',
  '11,5', '11,6', '11,7', '11,8', '11,9', '13,0', '13,1',
  '14,255', '15,255', '16,255', '17,255', '18,255', '20,255', '21,255',
  '22,255', '23,0', '23,1', '24,0', '24,1', '25,255', '26,255',
  '27,255', '28,255', '29,255', '30,255', '31,255', '33,0', '33,1',
  '33,2', '33,3', '35,255', '39,0', '39,1', '39,2', '40,255',
  '43,255', '44,255',
  '46,255',
  '49,255', '50,255', '51,255', '52,255', '53,255', '54,255',
  '55,255', '56,255', '57,255', '58,255', '59,255', '60,255', '61,255', '62,255', '63,255',
]);

export const BUFF_START_TEXT = localizedTable({
  invisNormal: ['youAreInvisible', 'You are invisible.'], invisTrue: ['youAreInvisible', 'You are invisible.'],
  chameleonNormal: ['youAreBlending', 'You are blending.'], chameleonTrue: ['youAreBlending', 'You are blending.'],
  shadeNormal: ['youAreAShade', 'You are a shade.'], shadeTrue: ['youAreAShade', 'You are a shade.'],
  silenced: ['youAreSilenced', 'You are silenced.'],
  sharedCartography: () => 'Your map is shared with your party.',
  clairvoyance: () => t('spell.bunny.clairvoyance', 'Your senses reach far.'),
  featherweight: () => t('spell.bunny.featherweight', 'Your burden feels light.'),
  decoy: () => t('spell.bunny.decoy', 'A double of you appears.'),
});
export const CONCEALMENT_START_TEXT = BUFF_START_TEXT;
// SPELLS.STD stores subType 255 as a signed byte (-1), so every 255-keyed check must mask it.
export const classicSub = (e) => e.subType & 0xff;
export const buffKind = (e) => BUFF_KINDS[`${e.type},${classicSub(e)}`] ?? null;
const CONCEALMENT_KINDS = new Set(['invisNormal', 'invisTrue', 'chameleonNormal', 'chameleonTrue', 'shadeNormal', 'shadeTrue']);
export const isSoulTrapEffect = (e) => e.type === 12 && classicSub(e) === 255;
export const DISPEL_GROUP = Object.freeze({
  1: NEARBY.Undead,
  2: NEARBY.Daedra,
});
export const isDispelCreature = (e) => e.type === 6 && DISPEL_GROUP[classicSub(e)] != null;
export const isDispelMagic = (e) => e.type === 6 && classicSub(e) === 0;
let _bundleSeq = 0;
export const seedBundleSeq = (n) => { _bundleSeq = Math.max(_bundleSeq, n | 0); };
export const PACIFY_GROUP = Object.freeze({
  0: NEARBY.Animal,
  1: NEARBY.Undead,
  2: NEARBY.Humanoid,
  3: NEARBY.Daedra,
});
export const isPacifyEffect = (e) => e.type === 33 && PACIFY_GROUP[classicSub(e)] != null;
export const isCharmEffect = (e) => e.type === 34 && classicSub(e) === 255;
export const spellSways = (sp) => (sp?.effects ?? []).some((e) => e && (isPacifyEffect(e) || isCharmEffect(e)));
export const isIdentifyEffect = (e) => e.type === 40 && classicSub(e) === 255;
export const hasActiveEffect = (entity, kind) =>
  !!entity?.activeEffects?.some((a) => a.kind === kind && !a.ended);
export const WATER_WALKING_SILENT_KIND = 'waterWalkingSilent';
export const isEntityWaterWalking = (entity) => hasActiveEffect(entity, 'waterWalking') || hasActiveEffect(entity, WATER_WALKING_SILENT_KIND);
const _modEffectKinds = new Map();
export function registerModEffectKind(kind, loaded) { _modEffectKinds.set(kind, loaded); }
export const effectKindLoaded = (kind) => !_modEffectKinds.has(kind) || !!_modEffectKinds.get(kind)();

export const isImmuneToParalysis = (entity) => hasActiveEffect(entity, 'freeAction') || !!entity?.staffBoss;

export function isEntityImmuneToParalysis(entity) {
  if (careerTolerance(entity.career ?? {}, EFFECT_FLAGS.Paralysis) === 'Immune' || isImmuneToParalysis(entity)) return true;
  if (entity.racialOverride?.immuneParalysis && !entity.racialOverride.ended) return true;
  if (entity.isPlayer) {
    const rt = entity.raceTemplate ?? raceById(entity.raceId) ?? raceByKey(entity.race) ?? null;
    if (((rt?.immunityFlags ?? 0) & EFFECT_FLAGS.Paralysis) !== 0) {
      const t = careerTolerance(entity.career ?? {}, EFFECT_FLAGS.Paralysis);
      return t !== 'LowTolerance' && t !== 'CriticalWeakness';
    }
  }
  return false;
}
export function isEntityImmuneToDisease(entity) {
  if (!entity) return false;
  if (careerTolerance(entity.career ?? {}, EFFECT_FLAGS.Disease) === 'Immune') return true;
  // A pending curse counts, since the turn is already irreversible.
  if ((entity.racialOverride && !entity.racialOverride.ended) || entity.racialOverridePending) return true;
  if (entity.isPlayer) {
    const rt = entity.raceTemplate ?? raceById(entity.raceId) ?? raceByKey(entity.race) ?? null;
    if (((rt?.immunityFlags ?? 0) & EFFECT_FLAGS.Disease) !== 0) {
      const t = careerTolerance(entity.career ?? {}, EFFECT_FLAGS.Disease);
      return t !== 'LowTolerance' && t !== 'CriticalWeakness';
    }
  }
  return false;
}

export const isSilencedEffect = (entity) => hasActiveEffect(entity, 'silenced');
// Immunity folds in at read time, so a paralysis resumes if Free Action ends first.
export const entityIsParalyzed = (entity) =>
  hasActiveEffect(entity, 'paralyze') && !isImmuneToParalysis(entity);

export const isHealHealth = (e) => e.type === 10 && e.subType === 8;
export const isDamageHealth = (e) => e.type === 4 && e.subType === 0;
export const isContinuousDamage = (e) => e.type === 1 && e.subType === 0;
const DUEL_SOURCE = Object.freeze({ bundleDuel: true });
export const isFortifyAttribute = (e) => e.type === 9 && e.subType >= 0 && e.subType <= 7;

export const isDamageSpellPoints = (e) => e.type === 4 && e.subType === 2;
export const isContinuousDamageSpellPoints = (e) => e.type === 1 && e.subType === 2;

export const isDrainAttribute = (e) => e.type === 7 && e.subType >= 0 && e.subType <= 7;
export const isHealAttribute = (e) => e.type === 10 && e.subType >= 0 && e.subType <= 7;
export const isTransferAttribute = (e) => e.type === 11 && e.subType >= 0 && e.subType <= 7;
export const isTransferHealth = (e) => e.type === 11 && e.subType === 8;
export const isTransferFatigue = (e) => e.type === 11 && e.subType === 9;
export const isHealFatigue = (e) => e.type === 10 && e.subType === 9;
export { HEAL_SPELL_POINTS_KEY };
export const isHealSpellPoints = (e) => e.key === HEAL_SPELL_POINTS_KEY;
export const isDamageFatigue = (e) => e.type === 4 && e.subType === 1;
export const isContinuousDamageFatigue = (e) => e.type === 1 && e.subType === 1;
export const isRegenerate = (e) => e.type === 18 && classicSub(e) === 255;
export const isLockSpell = (e) => e.type === 16 && classicSub(e) === 255;
export const isOpenSpell = (e) => e.type === 17 && classicSub(e) === 255;
export const isElementalResistance = (e) => e.type === 8 && e.subType >= 0 && e.subType <= 4;
export const isSpellAbsorptionEffect = (e) => e.type === 20 && classicSub(e) === 255;
export const isSpellResistanceEffect = (e) => e.type === 22 && classicSub(e) === 255;
export const isShieldEffect = (e) => e.type === 35 && classicSub(e) === 255;
// The best live instance, not a sum, since a party gift or an item bundle never merges with the target's own.
export function bestLiveChance(target, kind) {
  let best = 0;
  for (const a of target?.activeEffects ?? []) if (a.kind === kind && !a.ended && (a.chance ?? 0) > best) best = a.chance;
  return best;
}
export function spellResistanceChance(target) { return bestLiveChance(target, 'spellResistance'); }
export const isSpellReflectionEffect = (e) => e.type === 21 && classicSub(e) === 255;
export function spellReflectionChance(target) { return bestLiveChance(target, 'spellReflection'); }
export const SPELL_REFLECTED_TEXT = 'Spell was reflected.';
export const spellReflectedText = () => localizedText('spellReflected', SPELL_REFLECTED_TEXT);

export const isComprehendLanguages = (e) => e.type === 44 && classicSub(e) === 255;
export function comprehendLanguagesChance(target) { return bestLiveChance(target, 'comprehendLanguages'); }

export const isDisintegrate = (e) => e.type === 5 && classicSub(e) === 255;

export const isCreateItem = (e) => e.type === 2 && classicSub(e) === 255;
export const isParalyze = (e) => e.type === 0 && classicSub(e) === 255;

// Unlike duration, the chance has no minimum level multiplier of 1, as in classic.
export const chanceValue = (e, casterLevel) =>
  e.chanceBase + e.chanceMod * Math.floor(casterLevel / Math.max(1, e.chancePerLevel));

export const isCureDisease = (e) => e.type === 3 && e.subType === 0;
export const isCurePoison = (e) => e.type === 3 && e.subType === 1;
export const isCureParalyzation = (e) => e.type === 3 && e.subType === 2;
export const CURE_KINDS = Object.freeze(['disease', 'poison', 'paralyze']);

export function cureAllOfKind(target, kind, keepInfections = false) {
  if (target?.activeEffects) target.activeEffects = target.activeEffects.filter((a) => a.kind !== kind || (keepInfections && !!a.infection));
}
export const cureAllDiseases = (t) => cureAllOfKind(t, 'disease');
export const plainDiseaseLive = (t) => (t?.activeEffects ?? []).some((a) => a.kind === 'disease' && !a.ended && !a.infection);
export const cureDiseasesInfectionsLast = (t) => cureAllOfKind(t, 'disease', plainDiseaseLive(t));
export const cureAllPoisons = (t) => cureAllOfKind(t, 'poison');
export const cureParalyzation = (t) => cureAllOfKind(t, 'paralyze');
const CURE_MARKER_KINDS = Object.freeze(['cureDisease', 'curePoison', 'cureParalyzation']);

export function rollDuration(effect, casterLevel) {
  const per = Math.max(1, effect.durationPerLevel);
  let mult = Math.floor(casterLevel / per);
  if (mult < 1) mult = 1;
  return effect.durationBase + effect.durationMod * mult;
}

// Every like-kind recast merges here, topping the incumbent up to a fresh cast's rounds and never shortening it.
export function renewRounds(inc, fresh) {
  if (fresh > inc.roundsRemaining) inc.roundsRemaining = fresh;
}

export const settingsKeyOf = (e) => [
  e.durationBase, e.durationMod, e.durationPerLevel,
  e.chanceBase, e.chanceMod, e.chancePerLevel,
  e.magnitudeBaseLow, e.magnitudeBaseHigh, e.magnitudeLevelBase,
  e.magnitudeLevelHigh, e.magnitudePerLevel,
].join(',');

function effectMagnitude(e, casterLevel, saveScaled, element, flag, target, rolls, caster = null, recordSave = null) {
  let n = rollMagnitude(e, casterLevel, rolls);
  if (saveScaled) {
    const percent = savingThrow(element, flag, target, 0, rolls, isDamageHealthEffect(e) ? spellPierce(caster, target) : 0);
    if (recordSave && typeof recordSave === 'function') recordSave(percent);
    n = Math.trunc(n * percent / 100);
  }
  return n;
}

export function healAttributeDamage(entity, stat, amount) {
  if (amount < 0) return;
  let remaining = amount;
  for (const a of entity.activeEffects ?? []) {
    if (a.kind === 'disease' || a.kind === 'poison') {
      const mod = a.statMods?.[stat] ?? 0;
      if (mod >= 0) continue;
      const healed = Math.min(remaining, -mod);
      a.statMods[stat] = mod + healed;
      remaining -= healed;
      if (remaining === 0) return;
      continue;
    }
    if (a.kind !== 'drainAttribute' && a.kind !== 'transferAttribute') continue;
    if (a.stat !== stat || a.magnitude <= 0) continue;
    const damage = a.magnitude;
    if (remaining > damage) {
      a.magnitude = 0;
      remaining -= damage;
    } else {
      a.magnitude -= remaining;
      remaining = 0;
    }
    if (a.magnitude === 0) a.ended = true;
    if (remaining === 0) return;
  }
}

const casterScaledOnly = (n, ent) => {
  const v = n > 0 && ent && !ent.isPlayer && Number.isFinite(ent.damageScale) && ent.damageScale !== 1 ? Math.max(1, Math.round(n * ent.damageScale)) : n;
  return v > 0 && ent && !ent.isPlayer && foeDamageMult() > 1 ? Math.max(1, Math.round(v * foeDamageMult())) : v;
};
export const casterDamageScaled = (n, ent, target = null, school = null) => {
  let v = casterScaledOnly(n, ent);
  if (v > 0 && target?.isPlayer && !target.peer && !ent?.isPlayer) {
    const m = mentorDamageTakenMult(target);
    if (m > 1) v = Math.max(1, Math.round(v * m));
  }
  if (v > 0) {
    const p = spellPowerMult(ent, target, school == null ? {} : { school });
    if (p !== 1) v = Math.max(1, Math.round(v * p));
  }
  return v;
};

function runEffectRound(a, target, sinks, rolls) {
  if (a.kind === 'continuousDamage') {
    const n = casterDamageScaled(effectMagnitude(a.effect, a.casterLevel, a.saveScaled ?? true, a.element, a.flag, target, rolls, a.caster), a.caster, target, a.school);
    if (n > 0 && target?.isPlayer && a.caster && !a.caster.isPlayer) markPlayerHarm(a.caster);
    if (n > 0 && sinks.hurt) sinks.hurt(n, { fromPlayer: !a.caster || !!a.caster.isPlayer, bundleDuel: !!a.bundleDuel, round: true, element: a.element ?? null });
    if (n > 0 && target && !target.isPlayer && (!a.caster || (a.caster.isPlayer && !a.caster.peer))) noteFeudHarm(target, elementFeudClass(a.element), n);
    handleAttackFromSource(a.caster);
  } else if (a.kind === 'continuousDamageSpellPoints') {
    const n = effectMagnitude(a.effect, a.casterLevel, a.saveScaled ?? true, a.element, a.flag, target, rolls);
    if (n > 0 && sinks.drainMagicka) sinks.drainMagicka(n);
    handleAttackFromSource(a.caster);
  } else if (a.kind === 'continuousDamageFatigue') {
    const n = effectMagnitude(a.effect, a.casterLevel, a.saveScaled ?? true, a.element, a.flag, target, rolls);
    if (n > 0 && sinks.drainFatigue) sinks.drainFatigue(n * FATIGUE_MULTIPLIER, a);
    handleAttackFromSource(a.caster);
  } else if (a.kind === 'regenerate') {
    let n = effectMagnitude(a.effect, a.casterLevel, a.saveScaled ?? false, a.element, a.flag, target, rolls);
    if (n > 0 && a.school != null && !a.heldItem) {
      const k = schoolMult(a.caster, target, a.school, { self: true });
      if (k !== 1) n = Math.max(1, Math.round(n * k));
    }
    if (n > 0 && sinks.heal) { const held = regenShare(n, 'spell', target); if (held > 0) sinks.heal(held); }
  }
}

// An incumbent renewed on its last round runs that round here, so renewing never gives fewer ticks than recasting.
function renewActing(inc, rounds, target, sinks, rolls) {
  if (inc.roundsRemaining <= 0) runEffectRound(inc, target, sinks, rolls);
  renewRounds(inc, rounds - 1);
}

function pushActive(target, entry, sinks, rolls) {
  target.activeEffects = target.activeEffects || [];
  target.activeEffects.push(entry);
  runEffectRound(entry, target, sinks, rolls);
  entry.roundsRemaining--;
}

export function assignModBundle(target, { name, kind, rounds, bundleType = 'Spell', sinks = {}, rolls = Math.random }) {
  const entry = { kind, roundsRemaining: rounds, bundleId: ++_bundleSeq, bundleName: name, bundleType, bundleIcon: 0, bundleSelfCast: true };
  pushActive(target, entry, sinks, rolls);
  return entry;
}
export function removeBundleNamed(target, name) {
  const list = target?.activeEffects ?? [];
  const first = list.find((a) => a.bundleId != null && !a.ended && a.bundleName === name);
  if (!first) return false;
  target.activeEffects = list.filter((a) => a.bundleId !== first.bundleId);
  return true;
}

function pushPermanent(target, entry) {
  target.activeEffects = target.activeEffects || [];
  target.activeEffects.push(entry);
}

// Classic keeps an instant effect on the target until the next magic round, which enemy spell picks read, so a
// 0-round marker stands in for it.
function pushInstantMarker(target, kind, effect = null, stat = null) {
  target.activeEffects = target.activeEffects || [];
  const entry = { kind, instant: true, roundsRemaining: 0 };
  if (stat) entry.stat = stat;
  // Non-enumerable, so copies, saves, and deep-equal checks see the same entry fields.
  if (effect) Object.defineProperty(entry, 'effect', { value: effect, enumerable: false, writable: true, configurable: true });
  target.activeEffects.push(entry);
}

export function applySpell(spell, casterLevel, target, sinks, rolls = Math.random, caster = null, ctx = {}) {
  const flag = ELEMENT_EFFECT_FLAG[spell.element] ?? EFFECT_FLAGS.Magic;
  const saveScaled = spell.rangeType !== 0;
  // bypassSavingThrows skips only the assign-time checks (reflection, resistance, and the no-magnitude save).
  const assignSave = saveScaled && ctx.bypassSavingThrows !== true;
  const savesAsMagic = (e) => MAGIC_ONLY_KEYS.has(`${e.type},${classicSub(e)}`);
  const saveElement = (e) => (savesAsMagic(e) ? 4 : spell.element);
  // Magic-only effects save as the Magic element, but the flag still follows the spell's element, as in classic.
  const saveFlag = () => flag;
  const isDirectDamage = (e) => isDamageHealth(e) || isDamageFatigue(e) || isDamageSpellPoints(e);
  const saveFeedback = { saved: 0 };
  const magnitude = (e) => effectMagnitude(e, casterLevel, saveScaled, saveElement(e), saveFlag(e), target, rolls, caster?.entity ?? null, isDirectDamage(e) ? (p) => { if (p <= 0) saveFeedback.saved++; } : null);
  const schoolOf = (e) => castSchool(caster?.entity ?? null, spell, e);
  const noSchool = ctx.heldItem != null || (ctx.reflectedCount ?? 0) > 0;
  const potencyOf = (e, self) => (noSchool ? 1 : schoolMult(caster?.entity ?? null, target, schoolOf(e), { self }));
  const selfSchoolCaster = () => (noSchool ? null : caster?.entity ?? null);
  const chanceOf = (e, self) => {
    const ch = chanceValue(e, casterLevel);
    const k = potencyOf(e, self);
    return k !== 1 ? Math.min(100, Math.round(ch * k)) : ch;
  };
  const out = { damage: 0, healed: 0, continuous: 0, skipped: 0 };
  const heldItem = ctx.heldItem ?? null;
  // Track this cast's entries by identity, since a Cure in the same spell rebuilds the list.
  const prior = new Set(target.activeEffects ?? []);
  const ownEntries = () => (target.activeEffects ?? []).filter((a) => !prior.has(a));
  const allyCast = ctx.allyCast === true;
  const duelCast = ctx.duelCast === true;
  // Entries from a worn item, a party member, or a duel opponent never merge with the target's own entries.
  const findInc = (pred) => (heldItem ? undefined : target.activeEffects?.find((a) => !a.heldItem && (!prior.has(a) || (!!a.bundleAlly === allyCast && !!a.bundleDuel === duelCast)) && pred(a)));
  const powerCast = ctx.powerCast === true;
  // When either side of a merge is a power's bundle, the Shield pool and the ward chance take the larger value.
  const powerMerge = (inc) => powerCast || inc?.bundlePower === true;
  let totalAbsorbed = 0;
  let reflectedCount = ctx.reflectedCount ?? 0;
  for (const e of spell.effects) {
    // A string-keyed entry has type -1; any other -1 is an empty classic slot.
    if (e.type <= -1 && !e.key) continue;
    // Paralysis immunity drops the effect before absorption, reflection, and resistance, as in classic.
    if (isParalyze(e) && isEntityImmuneToParalysis(target)) continue;
    // A worn item's bundle is not a spell bundle, so it skips absorption, reflection, and resistance.
    if (caster && !heldItem) {
      const sp = tryAbsorption(e, spell.rangeType ?? 0, target, { ...ctx, absorbing: ctx?.absorbing ?? entityAbsorbsSpells(target), rolls, paid: caster.entity === target ? (caster.cast?.cost ?? 0) : 0 });
      if (sp > 0) {
        totalAbsorbed += sp;
        out.absorbed = (out.absorbed ?? 0) + sp;
        continue;
      }
      // Classic counts reflection per bundle, so only the first effect reflects (the caller sends the spell back)
      // and the rest still land here.
      if (ctx.bypassSavingThrows !== true && reflectedCount === 0 && caster.entity !== target) {
        const fc = spellReflectionChance(target);
        if (fc > 0 && dice100(fc, rolls())) {
          reflectedCount++;
          out.reflected = (out.reflected ?? 0) + 1;
          continue;
        }
      }
      if ((spell.rangeType ?? 0) !== 0 && ctx.bypassSavingThrows !== true) {
        const rc = spellResistanceChance(target);
        if (rc > 0 && Math.floor(rolls() * 100) < rc) {
          out.resisted = (out.resisted ?? 0) + 1;
          continue;
        }
      }
    }
    if (e.type === 43 && classicSub(e) === 255) {
      if ((spell.rangeType ?? 0) === 0) out.teleport = true;
      continue;
    }
    if (e.type === 29 && classicSub(e) === 255) {
      ctx.morphSelf?.();
      pushInstantMarker(target, 'morphSelf', e);
      continue;
    }
    if (isHealHealth(e)) {
      let n = magnitude(e);
      const k = n > 0 ? potencyOf(e, true) : 1;
      if (k !== 1) n = Math.max(1, Math.round(n * k));
      out.healed += n;
      if (n > 0 && sinks.heal) sinks.heal(n);
      pushInstantMarker(target, 'healHealth', e);
      continue;
    }
    if (isDamageHealth(e)) {
      const n = casterDamageScaled(magnitude(e), caster?.entity, target, schoolOf(e));
      out.damage += n;
      if (n > 0 && sinks.hurt) sinks.hurt(n, { element: spell.element ?? null });
      handleAttackFromSource(caster?.entity ?? null);
      pushInstantMarker(target, 'damageHealth', e);
      continue;
    }
    if (isContinuousDamage(e)) {
      const rounds = rollDuration(e, casterLevel);
      if (rounds > 0) {
        const inc = findInc((a) => a.kind === 'continuousDamage');
        if (inc) renewActing(inc, rounds, target, sinks, rolls);
        else pushActive(target, { kind: 'continuousDamage', effect: e, casterLevel, caster: caster?.entity ?? null, element: spell.element, flag, saveScaled, school: schoolOf(e), roundsRemaining: rounds }, sinks, rolls);
        out.continuous++;
      }
      continue;
    }
    if (isDisintegrate(e)) {
      if (!dice100(chanceValue(e, casterLevel), rolls())) { out.chanceFailed = (out.chanceFailed ?? 0) + 1; continue; }
      if (assignSave && savingThrow(saveElement(e), saveFlag(e), target, 0, rolls) === 0) {
        out.saved = (out.saved ?? 0) + 1;
        continue;
      }
      const left = target?.health ?? 0;
      out.disintegrated = (out.disintegrated ?? 0) + 1;
      if (left > 0 && sinks.hurt) { out.damage += left; sinks.hurt(left, { whole: true }); }
      continue;
    }
    if (isFortifyAttribute(e)) {
      const rounds = rollDuration(e, casterLevel);
      if (rounds > 0) {
        const stat = STAT_KEYS_ORDER[e.subType];
        const sKey = settingsKeyOf(e);
        const inc = findInc((a) => a.kind === 'fortifyAttribute' && a.stat === stat && a.settingsKey === sKey);
        if (inc) renewRounds(inc, rounds - 1);
        else pushActive(target, { kind: 'fortifyAttribute', stat, settingsKey: sKey, magnitude: magnitude(e), roundsRemaining: rounds }, sinks, rolls);
        out.fortified = (out.fortified ?? 0) + 1;
      }
      continue;
    }
    if (isDrainAttribute(e) || isTransferAttribute(e)) {
      handleAttackFromSource(caster?.entity ?? null);
      const kind = isDrainAttribute(e) ? 'drainAttribute' : 'transferAttribute';
      const stat = STAT_KEYS_ORDER[e.subType];
      let amt = magnitude(e);
      // A duel's drain leaves the live stat at 1, since a stat at 0 kills.
      if (duelCast && amt > 0) amt = Math.min(amt, Math.max(0, liveStat(target, stat) - 1));
      if (amt > 0) {
        // As in classic, a drain incumbent takes an incoming transfer of its stat, but not the reverse.
        let entry = findInc((a) => !a.ended && a.stat === stat &&
          (kind === 'transferAttribute'
            ? (a.kind === 'drainAttribute' || a.kind === 'transferAttribute')
            : a.kind === 'drainAttribute'));
        if (!entry) {
          entry = { kind, stat, magnitude: 0, permanent: true };
          pushPermanent(target, entry);
        }
        increaseDrainMagnitude(target, entry, amt);
        sinks?.say?.(localizedText('youFeelDrained', FEEL_DRAINED_TEXT));
        if (kind === 'transferAttribute' && caster?.entity) healAttributeDamage(caster.entity, stat, amt);
        out.drained = (out.drained ?? 0) + 1;
      }
      continue;
    }
    if (isHealAttribute(e)) {
      const n = magnitude(e);
      if (n > 0) healAttributeDamage(target, STAT_KEYS_ORDER[e.subType], n);
      pushInstantMarker(target, 'healAttribute', e, STAT_KEYS_ORDER[e.subType]);
      out.attrHealed = (out.attrHealed ?? 0) + 1;
      continue;
    }
    if (isTransferHealth(e)) {
      handleAttackFromSource(caster?.entity ?? null);
      if (caster?.entity) {
        const n = magnitude(e);
        out.damage += n;
        if (n > 0) {
          if (sinks.hurt) sinks.hurt(n);
          if (caster.sinks?.heal) caster.sinks.heal(n);
        }
      }
      pushInstantMarker(target, 'transferHealth', e);
      continue;
    }
    if (isTransferFatigue(e)) {
      handleAttackFromSource(caster?.entity ?? null);
      if (caster?.entity) {
        const n = magnitude(e);
        if (n > 0) {
          if (sinks.drainFatigue) sinks.drainFatigue(n * FATIGUE_MULTIPLIER);
          if (caster.sinks?.restoreFatigue) caster.sinks.restoreFatigue(n * FATIGUE_MULTIPLIER);
          out.fatigueDrained = (out.fatigueDrained ?? 0) + 1;
        }
      }
      pushInstantMarker(target, 'transferFatigue', e);
      continue;
    }
    if (isHealFatigue(e)) {
      const n = magnitude(e);
      if (n > 0 && sinks.restoreFatigue) sinks.restoreFatigue(n * FATIGUE_MULTIPLIER);
      pushInstantMarker(target, 'healFatigue', e);
      out.fatigueHealed = (out.fatigueHealed ?? 0) + 1;
      continue;
    }
    if (isHealSpellPoints(e)) {
      const n = magnitude(e);
      if (n > 0 && sinks.restoreMagicka) sinks.restoreMagicka(n);
      pushInstantMarker(target, 'healSpellPoints', e);
      out.magickaHealed = (out.magickaHealed ?? 0) + n;
      continue;
    }
    if (isDamageFatigue(e)) {
      const n = magnitude(e);
      if (n > 0 && sinks.drainFatigue) sinks.drainFatigue(n * FATIGUE_MULTIPLIER, duelCast ? DUEL_SOURCE : undefined);
      handleAttackFromSource(caster?.entity ?? null);
      pushInstantMarker(target, 'damageFatigue', e);
      out.fatigueDrained = (out.fatigueDrained ?? 0) + 1;
      continue;
    }
    if (isContinuousDamageFatigue(e)) {
      const rounds = rollDuration(e, casterLevel);
      if (rounds > 0) {
        const inc = findInc((a) => a.kind === 'continuousDamageFatigue');
        if (inc) renewActing(inc, rounds, target, sinks, rolls);
        else pushActive(target, { kind: 'continuousDamageFatigue', effect: e, casterLevel, caster: caster?.entity ?? null, element: spell.element, flag, saveScaled, roundsRemaining: rounds }, sinks, rolls);
        out.continuous++;
      }
      continue;
    }
    if (isDamageSpellPoints(e)) {
      const n = magnitude(e);
      out.magickaDrained = (out.magickaDrained ?? 0) + n;
      if (n > 0 && sinks.drainMagicka) sinks.drainMagicka(n);
      handleAttackFromSource(caster?.entity ?? null);
      pushInstantMarker(target, 'damageSpellPoints', e);
      continue;
    }
    if (isContinuousDamageSpellPoints(e)) {
      const rounds = rollDuration(e, casterLevel);
      if (rounds > 0) {
        const inc = findInc((a) => a.kind === 'continuousDamageSpellPoints');
        if (inc) renewActing(inc, rounds, target, sinks, rolls);
        else pushActive(target, { kind: 'continuousDamageSpellPoints', effect: e, casterLevel, caster: caster?.entity ?? null, element: spell.element, flag, saveScaled, roundsRemaining: rounds }, sinks, rolls);
        out.continuous++;
      }
      continue;
    }
    if (isRegenerate(e)) {
      const rounds = rollDuration(e, casterLevel);
      if (rounds > 0) {
        const sKey = settingsKeyOf(e);
        const inc = findInc((a) => a.kind === 'regenerate' && a.settingsKey === sKey);
        if (inc) renewActing(inc, rounds, target, sinks, rolls);
        else pushActive(target, { kind: 'regenerate', effect: e, casterLevel, element: saveElement(e), flag: saveFlag(e), saveScaled, settingsKey: sKey, caster: selfSchoolCaster(), school: schoolOf(e), roundsRemaining: rounds }, sinks, rolls);
        sinks?.say?.(localizedText('youAreRegenerating', REGENERATING_TEXT));
        out.continuous++;
      }
      continue;
    }
    if (isParalyze(e)) {
      handleAttackFromSource(caster?.entity ?? null);
      const rounds = rollDuration(e, casterLevel);
      const chanceOk = ctx.bypassChance === true || dice100(chanceValue(e, casterLevel), rolls());
      if (!chanceOk) out.chanceFailed = (out.chanceFailed ?? 0) + 1;
      if (rounds > 0) {
        // As in classic, a recast renews an incumbent before the chance and save gates, so it always renews.
        const inc = findInc((a) => a.kind === 'paralyze');
        if (inc) renewRounds(inc, rounds - 1);
        else if (chanceOk) {
          if (!assignSave || savingThrow(spell.element, EFFECT_FLAGS.Paralysis | flag, target, 0, rolls) !== 0) {
            pushActive(target, { kind: 'paralyze', roundsRemaining: rounds }, sinks, rolls);
            out.paralyzed = (out.paralyzed ?? 0) + 1;
          } else {
            out.saved = (out.saved ?? 0) + 1;
          }
        }
      }
      continue;
    }
    if (isCureDisease(e) || isCurePoison(e) || isCureParalyzation(e)) {
      const chanceOk = ctx.bypassChance === true || dice100(chanceValue(e, casterLevel), rolls());
      if (!chanceOk) { out.chanceFailed = (out.chanceFailed ?? 0) + 1; continue; }
      if (assignSave && savingThrow(saveElement(e), saveFlag(e), target, 0, rolls) === 0) {
        out.saved = (out.saved ?? 0) + 1;
        continue;
      }
      // A stranger's cure, or any cure while a plain disease runs, leaves a curse infection in place.
      cureAllOfKind(target, CURE_KINDS[e.subType], ctx?.strangerCast === true || plainDiseaseLive(target));
      pushInstantMarker(target, CURE_MARKER_KINDS[e.subType], e);
      out.cured = (out.cured ?? 0) + 1;
      continue;
    }
    if (isShieldEffect(e)) {
      const rounds = rollDuration(e, casterLevel);
      let pool = magnitude(e);
      const k = pool > 0 ? potencyOf(e, true) : 1;
      if (k !== 1) pool = Math.max(1, Math.round(pool * k));
      if (rounds > 0 && pool > 0) {
        const inc = findInc((a) => a.kind === 'shield' && !a.ended);
        if (inc) {
          if (powerMerge(inc) && pool > inc.startingShield) inc.startingShield = pool;
          renewRounds(inc, rounds - 1);
          inc.shieldRemaining = Math.min(inc.startingShield, inc.shieldRemaining + pool);
        } else {
          pushActive(target, { kind: 'shield', startingShield: pool, shieldRemaining: pool, roundsRemaining: rounds }, sinks, rolls);
        }
        out.buffs = (out.buffs ?? 0) + 1;
      }
      continue;
    }
    if (isSpellAbsorptionEffect(e) || isSpellResistanceEffect(e)
      || isSpellReflectionEffect(e) || isComprehendLanguages(e)) {
      if (assignSave && savingThrow(saveElement(e), saveFlag(e), target, 0, rolls) === 0) {
        out.saved = (out.saved ?? 0) + 1;
        continue;
      }
      const rounds = rollDuration(e, casterLevel);
      if (rounds > 0) {
        const k = isSpellAbsorptionEffect(e) ? 'spellAbsorption'
          : isSpellReflectionEffect(e) ? 'spellReflection'
            : isComprehendLanguages(e) ? 'comprehendLanguages' : 'spellResistance';
        const inc = findInc((a) => a.kind === k);
        if (inc) {
          renewRounds(inc, rounds - 1);
          if (k !== 'spellAbsorption' && powerMerge(inc)) {
            const chance = k === 'comprehendLanguages' ? chanceValue(e, casterLevel) : chanceOf(e, true);
            if (chance > (inc.chance ?? 0)) inc.chance = chance;
          }
        }
        else {
          // Absorption keeps its chance settings, since classic rolls it from the target's level at absorb time.
          const entry = k === 'spellAbsorption'
            ? { kind: k, chanceBase: e.chanceBase, chanceMod: e.chanceMod, chancePerLevel: e.chancePerLevel, roundsRemaining: rounds }
            : { kind: k, chance: k === 'comprehendLanguages' ? chanceValue(e, casterLevel) : chanceOf(e, true), roundsRemaining: rounds };
          pushActive(target, entry, sinks, rolls);
        }
        out.buffs = (out.buffs ?? 0) + 1;
      }
      continue;
    }
    if (isElementalResistance(e)) {
      if (assignSave && savingThrow(saveElement(e), saveFlag(e), target, 0, rolls) === 0) {
        out.saved = (out.saved ?? 0) + 1;
        continue;
      }
      const rounds = rollDuration(e, casterLevel);
      if (rounds > 0) {
        const chance = chanceValue(e, casterLevel);
        const inc = findInc((a) => a.kind === 'elementalResistance' && a.element === e.subType);
        if (inc) renewRounds(inc, rounds - 1);
        else pushActive(target, { kind: 'elementalResistance', element: e.subType, chance, roundsRemaining: rounds }, sinks, rolls);
        out.buffs = (out.buffs ?? 0) + 1;
      }
      continue;
    }
    if (isOpenSpell(e) || isLockSpell(e)) {
      const opening = isOpenSpell(e);
      const chanceOk = ctx.bypassChance === true || dice100(chanceValue(e, casterLevel), rolls());
      if (!chanceOk) { out.chanceFailed = (out.chanceFailed ?? 0) + 1; continue; }
      const armedKind = opening ? 'openArmed' : 'lockArmed';
      const inc = findInc((a) => a.kind === armedKind);
      if (!inc) pushPermanent(target, { kind: armedKind, permanent: true, castByItem: ctx.castByItem ?? null });
      out.armed = armedKind;
      continue;
    }
    if (isDispelMagic(e)) {
      if (target?.mobileType != null) continue;
      out.dispelMagic = { chance: chanceValue(e, casterLevel) };
      continue;
    }
    if (isDispelCreature(e)) {
      out.dispel = {
        group: DISPEL_GROUP[classicSub(e)],
        chance: chanceOf(e, true),
      };
      continue;
    }
    // Pacify and Charm have no duration, so they act once at cast and last until the target is attacked.
    if (isPacifyEffect(e) || isCharmEffect(e)) {
      const mt = target?.mobileType;
      if (mt == null) continue;
      if (target.pacifyImmune) { out.swayRefused = (out.swayRefused ?? 0) + 1; continue; }
      const matches = isCharmEffect(e)
        ? isClassEnemyId(mt)
        : enemyGroupOf(mt) === PACIFY_GROUP[classicSub(e)];
      if (!matches) continue;
      if (!dice100(chanceValue(e, casterLevel), rolls())) { out.chanceFailed = (out.chanceFailed ?? 0) + 1; continue; }
      if (assignSave && savingThrow(saveElement(e), saveFlag(e), target, 0, rolls) === 0) {
        out.saved = (out.saved ?? 0) + 1;
        continue;
      }
      out.pacify = true;
      continue;
    }
    if (isCreateItem(e)) {
      if (target?.mobileType != null) continue;
      // The conjured item's lifetime is the duration minus the initial round, as in classic.
      out.createItem = { rounds: Math.max(0, rollDuration(e, casterLevel) - 1) };
      continue;
    }
    if (isIdentifyEffect(e)) {
      if (target?.mobileType != null) continue;
      out.identify = {
        chance: chanceValue(e, casterLevel),
        refund: identifyRefund(spell, e, caster?.entity ?? target),
      };
      continue;
    }
    if (isSoulTrapEffect(e)) {
      const rounds = rollDuration(e, casterLevel);
      const mt = target?.mobileType;
      if (mt == null) continue;
      if (isClassEnemyId(mt)) { out.trapAlert = 'trapHumanoid'; continue; }
      if (rounds > 0) {
        const inc = findInc((a) => a.kind === 'soulTrap' && !a.ended);
        if (inc) renewRounds(inc, rounds - 1);
        else {
          if (assignSave && savingThrow(saveElement(e), saveFlag(e), target, 0, rolls) === 0) {
            out.saved = (out.saved ?? 0) + 1;
            continue;
          }
          // Soul Trap always attaches; its chance is saved on the entry for the roll at the kill.
          pushActive(target, { kind: 'soulTrap', chance: chanceOf(e, false), roundsRemaining: rounds }, sinks, rolls);
          out.trapAlert = 'trapActive';
        }
        out.buffs = (out.buffs ?? 0) + 1;
      }
      continue;
    }
    const kind = buffKind(e);
    if (kind) {
      const rounds = CONCEALMENT_KINDS.has(kind) ? Math.round(rollDuration(e, casterLevel) * potencyOf(e, true)) : rollDuration(e, casterLevel);
      if (kind === 'silenced') handleAttackFromSource(caster?.entity ?? null);
      if (rounds > 0) {
        const inc = findInc((a) => a.kind === kind);
        if (inc) renewRounds(inc, rounds - 1);
        const chanceOk = kind !== 'silenced' || ctx.bypassChance === true || dice100(chanceOf(e, false), rolls());
        if (!chanceOk) { out.chanceFailed = (out.chanceFailed ?? 0) + 1; continue; }
        if (!inc) {
          if (assignSave && savingThrow(saveElement(e), saveFlag(e), target, 0, rolls) === 0) {
            out.saved = (out.saved ?? 0) + 1;
            continue;
          }
          pushActive(target, { kind, roundsRemaining: rounds }, sinks, rolls);
          const msg = BUFF_START_TEXT[kind];
          // Only the player hears a landing alert, since an enemy's say sink writes to the same HUD channel.
          if (msg && target?.isPlayer) sinks?.say?.(msg);
        }
        out.buffs = (out.buffs ?? 0) + 1;
      }
      continue;
    }
    out.skipped++;
  }
  // Classic ticks a worn item's effects every round, so its instant effects keep a refire copy and run again.
  if (heldItem && ctx.refire !== true) {
    for (const a of ownEntries()) {
      a.heldItem = heldItem;
      if (a.instant && a.effect) {
        a.refire = { spell: { ...spell, effects: [a.effect] }, casterLevel, caster, heldItem };
      }
    }
  }
  {
    // A bundle is the entries one cast pushed, so a recast that merges into an incumbent adds none, unlike classic.
    const list = ownEntries();
    if (list.length) {
      const id = ++_bundleSeq;
      const name = spell?.name ?? '';
      const type = heldItem ? 'HeldMagicItem' : 'Spell';
      const icon = spell?.icon ?? 0;
      const selfCast = !!caster?.entity && caster.entity === target;
      const spellIndex = Number.isInteger(spell?.index) ? spell.index : null;
      for (let i = 0; i < list.length; i++) {
        if (list[i].instant) continue;
        list[i].bundleId = id;
        list[i].bundleName = name;
        list[i].bundleSpellIndex = spellIndex;
        list[i].bundleType = type;
        list[i].bundleIcon = icon;
        list[i].bundleSelfCast = selfCast;
        list[i].bundleAlly = allyCast;
        if (duelCast) list[i].bundleDuel = true;
        if (powerCast) list[i].bundlePower = true;
      }
    }
  }
  if (totalAbsorbed > 0) {
    const selfCastCost = ctx.selfCastCost ?? 0;
    // A self-cast refund cannot exceed the spell's cost, since absorption is tallied per effect.
    if (caster?.entity === target && selfCastCost > 0 && totalAbsorbed > selfCastCost) totalAbsorbed = selfCastCost;
    out.absorbed = totalAbsorbed;
    if (target.maxMagicka != null) {
      target.magicka = Math.min(target.maxMagicka, (target.magicka ?? 0) + absorbRefund(totalAbsorbed));
    }
    sinks?.say?.(localizedText('spellAbsorbed', SPELL_ABSORBED_TEXT));
  }
  if (saveFeedback.saved > 0) out.damageSaved = saveFeedback.saved;
  return out;
}

export function effectActiveIdentity(e) {
  if (isContinuousDamage(e)) return { kind: 'continuousDamage' };
  if (isContinuousDamageFatigue(e)) return { kind: 'continuousDamageFatigue' };
  if (isContinuousDamageSpellPoints(e)) return { kind: 'continuousDamageSpellPoints' };
  if (isFortifyAttribute(e)) return { kind: 'fortifyAttribute', stat: STAT_KEYS_ORDER[e.subType] };
  if (isDrainAttribute(e)) return { kind: 'drainAttribute', stat: STAT_KEYS_ORDER[e.subType] };
  if (isTransferAttribute(e)) return { kind: 'transferAttribute', stat: STAT_KEYS_ORDER[e.subType] };
  if (isRegenerate(e)) return { kind: 'regenerate' };
  if (isParalyze(e)) return { kind: 'paralyze' };
  if (isDamageHealth(e)) return { kind: 'damageHealth' };
  if (isDamageFatigue(e)) return { kind: 'damageFatigue' };
  if (isDamageSpellPoints(e)) return { kind: 'damageSpellPoints' };
  if (isHealHealth(e)) return { kind: 'healHealth' };
  if (isHealFatigue(e)) return { kind: 'healFatigue' };
  if (isHealSpellPoints(e)) return { kind: 'healSpellPoints' };
  if (isHealAttribute(e)) return { kind: 'healAttribute', stat: STAT_KEYS_ORDER[e.subType] };
  if (isTransferHealth(e)) return { kind: 'transferHealth' };
  if (isTransferFatigue(e)) return { kind: 'transferFatigue' };
  if (isCureDisease(e) || isCurePoison(e) || isCureParalyzation(e)) return { kind: CURE_MARKER_KINDS[e.subType] };
  const b = buffKind(e);
  return b ? { kind: b } : null;
}

export function effectsAlreadyOnTarget(spell, target) {
  const list = target.activeEffects ?? [];
  for (const e of spell.effects) {
    if (e.type <= -1) continue;
    const id = effectActiveIdentity(e);
    const found = !!id && list.some((a) => a.kind === id.kind && (id.stat == null || a.stat === id.stat));
    if (!found) return false;
  }
  return true;
}

export function tickActiveEffects(entity, sinks, rolls = Math.random) {
  const list = entity.activeEffects;
  if (!list || !list.length) return;
  // An entry found at 0 rounds ends without acting; one that reaches 0 stays through this pass, as in classic.
  const refires = [];
  entity.activeEffects = list.filter((a) => {
    if (a.heldItem) {
      if (a.heldItem.equipSlot == null || (a.heldItem.currentCondition ?? 1) <= 0) return false;
      if (a.refire) refires.push(a.refire);
      runEffectRound(a, entity, sinks, rolls);
      if (a.roundsRemaining > 0) a.roundsRemaining--;
      return true;
    }
    if (a.permanent) return !a.ended;
    if (a.roundsRemaining <= 0) return false;
    runEffectRound(a, entity, sinks, rolls);
    a.roundsRemaining--;
    return true;
  });
  // Refires run after the filter, since applySpell pushes onto the list the filter is still building.
  for (const r of refires) {
    applySpell(r.spell, r.casterLevel, entity, sinks, rolls, r.caster,
      { bypassSavingThrows: true, heldItem: r.heldItem, refire: true });
  }
}

export function removeItemPinnedEffects(entity, item) {
  const list = entity?.activeEffects;
  if (!list?.length) return;
  entity.activeEffects = list.filter((a) => a.heldItem !== item);
}

setEnchantmentEffectDoors({ applySpell, removeItemPinnedEffects });
