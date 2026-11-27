import {
  LYCANTHROPY_TYPES, INFECTION,
} from './infection.js';
import {
  MINUTES_PER_DAY, DAYS_PER_MONTH, isFullMoonFromMinutes, isFullMoonNightFromMinutes,
} from '../world/gameDate.js';
import { EQUIP_SLOTS, equipTableOf, unequipSlot } from '../characters/equip.js';
import { spellRecordOfIndex } from '../items/loot.js';
import { SKILLS } from '../characters/skills.js';
import { WEAPON_MATERIALS } from '../characters/weapons.js';
import { KNIGHT_CITY_WATCH } from '../characters/mobileTypes.js';

export const MOVE_SOUND_MIN_SECONDS = 4;
export const MOVE_SOUND_MAX_SECONDS = 20;
const initMoveSoundTimer = (rolls) =>
  MOVE_SOUND_MIN_SECONDS + rolls() * (MOVE_SOUND_MAX_SECONDS - MOVE_SOUND_MIN_SECONDS);
import { ENCHANTMENT_TYPES } from '../magic/enchantments.js';
import { cureAllDiseases, cureAllPoisons } from '../magic/effects.js';
import { cureAllAttributes } from '../guilds/guildServiceFlow.js';
import { fillVitalSigns } from '../characters/statMods.js';
import { SOUND } from '../audio/soundClips.js';
import { renownHpOf } from '../characters/renownLayer.js';
import { endLycanthropyQuests } from './racialQuests.js';
import { localizedText } from '../ui/textManager.js';

export const LYCANTHROPY_CURSE_KEY = 'Lycanthropy-Curse';
export const LYCANTHROPY_SPELL_TAG = 'lycanthrope';
export const VAMPIRE_SPELL_TAG = 'vampire';

export const NEED_TO_KILL_HEALTH_LIMIT_MINIMUM = 4;
export const NEED_TO_KILL_PERIOD = MINUTES_PER_DAY * DAYS_PER_MONTH;
export const NEED_TO_KILL_HEALTH_LOSS_PER_MINUTE = 24.0 / MINUTES_PER_DAY;
// Daggerfall Unity nags every 120 real seconds; this nags every 30 magic rounds instead.
export const NEED_TO_KILL_NOTIFY_ROUNDS = 30;
export const LYCANTHROPE_STAT_MOD = 40;
export const LYCANTHROPE_SKILL_MOD = 30;
export const LYCANTHROPE_STATS = Object.freeze(['strength', 'agility', 'endurance', 'speed']);
export const LYCANTHROPE_SKILLS = Object.freeze([
  SKILLS.Swimming, SKILLS.Running, SKILLS.Stealth, SKILLS.CriticalStrike,
  SKILLS.Climbing, SKILLS.HandToHand, SKILLS.Jumping,
]);
export const LYCANTHROPY_SPELL_ID = 92;
export const HIRCINE_RING_SUBTYPE = 3;
export const YOU_DREAM_OF_THE_MOON = 'You dream of the moon.';
export const YOU_NEED_TO_HUNT = 'You need to hunt the innocent.';
export const ONCE_PER_DAY = 'You may only cast this spell once per day.';

export function endOldLifeEffects(entity) {
  cureAllPoisons(entity);
  cureAllDiseases(entity);
  cureAllAttributes(entity);
  // Fill the pools last, after the cures restore the maximums they raise.
  fillVitalSigns(entity);
}

export const liveLycanthropy = (entity) =>
  (entity?.activeEffects ?? []).find((a) => a?.kind === 'racialOverride'
    && a.racial === 'lycanthropy' && !a.ended) ?? null;

export function isWearingHircineRing(entity) {
  const table = equipTableOf(entity);
  for (const slot of [EQUIP_SLOTS.Ring0, EQUIP_SLOTS.Ring1]) {
    const item = table?.[slot];
    if (item?.enchantments?.some((e) => e.type === ENCHANTMENT_TYPES.SpecialArtifactEffect
      && e.param === HIRCINE_RING_SUBTYPE)) return true;
  }
  return false;
}

export function createLycanthropyCurse(entity, infectionType, { now = 0, rolls = Math.random, restore = false } = {}) {
  if (!entity || liveLycanthropy(entity) || entity.racialOverride) return null;
  const entry = {
    kind: 'racialOverride',
    // permanent keeps the magic-round clock from pruning the curse; only its cure ends it.
    permanent: true,
    racial: 'lycanthropy',
    key: LYCANTHROPY_CURSE_KEY,
    infectionType,
    isTransformed: false,
    lastKilledInnocent: now,
    lastCastMorphSelf: 0,
    lastMorphHeal: null,
    wearingHircineRing: false,
    urgeToKillRising: false,
    lastUrgeNotify: 0,
    raceNameOverride: null,
    statMods: {},
    skillMods: {},
    moveSoundTimer: initMoveSoundTimer(rolls),
  };
  // A restored curse skips this: the effects running now belong to the current life.
  if (!restore) endOldLifeEffects(entity);
  entity.activeEffects = entity.activeEffects || [];
  entity.activeEffects.push(entry);
  // racialOverride is not saved; save.js rebuilds it from activeEffects on load.
  entity.racialOverride = entry;
  delete entity.racialOverridePending;
  grantLycanthropySpell(entity);
  return entry;
}

export function grantLycanthropySpell(entity) {
  if ((entity.spells ?? []).some((s) => s.tag === LYCANTHROPY_SPELL_TAG)) return true;
  const record = spellRecordOfIndex(LYCANTHROPY_SPELL_ID);
  if (!record) { console.warn('[lycanthropy] SPELLS.STD 92 unavailable - the free spell is not granted'); return false; }
  const name = String(record.name ?? record.spellName ?? 'Lycanthropy').replace(/^!/, '');
  entity.spells = entity.spells || [];
  // minimumCastingCost sets the minimum cost outright, as in Daggerfall Unity, instead of only flooring it.
  entity.spells.push({ ...record, name, tag: LYCANTHROPY_SPELL_TAG, custom: true, minimumCastingCost: true });
  return true;
}

export function consumeRacialOverridePending(entity, { now = 0 } = {}) {
  const pending = entity?.racialOverridePending;
  if (!pending) return null;
  if (pending.lycanthropy && pending.lycanthropy !== LYCANTHROPY_TYPES.None) {
    return createLycanthropyCurse(entity, pending.lycanthropy, { now });
  }
  return null;
}

export function lycanthropyMagicRound(entity, { nowMinutes = 0, clockMinutes = nowMinutes, skyMinutes = clockMinutes, moonNight = false, say = null, refreshHead = null } = {}) {
  const entry = liveLycanthropy(entity);
  if (!entry) return;
  // clockMinutes drives the kill clock, skyMinutes the moon (world time online), and nowMinutes the nag cadence.
  entry.wearingHircineRing = isWearingHircineRing(entity);

  // The forced change runs before the constant reads below so silver-to-hit does not lag the change by a round.
  const moonForces = moonNight ? isFullMoonNightFromMinutes(skyMinutes) : isFullMoonFromMinutes(skyMinutes);
  if (!entry.wearingHircineRing && moonForces && !entry.isTransformed) {
    say?.(YOU_DREAM_OF_THE_MOON);
    morphSelf(entity, { force: true, nowMinutes: clockMinutes, refreshHead });
  }

  lycanthropeAdvantages(entry);

  entity.minMetalToHit = entry.isTransformed ? WEAPON_MATERIALS.Silver : WEAPON_MATERIALS.Iron;
  entity.isInBeastForm = entry.isTransformed;

  const sinceKill = clockMinutes - (entry.lastKilledInnocent ?? 0);
  entry.urgeToKillRising = !entry.wearingHircineRing && sinceKill > NEED_TO_KILL_PERIOD;
  if (entry.urgeToKillRising) {
    if (nowMinutes - (entry.lastUrgeNotify ?? 0) >= NEED_TO_KILL_NOTIFY_ROUNDS) {
      entry.lastUrgeNotify = nowMinutes;
      say?.(YOU_NEED_TO_HUNT);
    }
    const urgeMinutes = sinceKill - NEED_TO_KILL_PERIOD;
    // Compute from the raw maximum: maxHealth is already limited, so using it would ratchet the limit down.
    let limit = (entity.rawMaxHealth ?? entity.maxHealth ?? 0) - Math.round(urgeMinutes * NEED_TO_KILL_HEALTH_LOSS_PER_MINUTE);
    if (limit < NEED_TO_KILL_HEALTH_LIMIT_MINIMUM) limit = NEED_TO_KILL_HEALTH_LIMIT_MINIMUM;
    entity.maxHealthLimiter = limit;
    const ceiling = limit + renownHpOf(entity);
    if ((entity.health ?? 0) > ceiling) entity.health = ceiling;
  } else {
    entity.maxHealthLimiter = null;
  }
}

export const currentMaxHealth = (entity) =>
  Math.min(entity?.maxHealth ?? 0, (entity?.maxHealthLimiter ?? Infinity) + renownHpOf(entity));

// Unlike Daggerfall Unity, the stat and skill advantages apply only in beast form.
export function lycanthropeAdvantages(entry) {
  entry.statMods = {};
  entry.skillMods = {};
  if (!entry.isTransformed) return;
  for (const stat of LYCANTHROPE_STATS) entry.statMods[stat] = LYCANTHROPE_STAT_MOD;
  for (const skill of LYCANTHROPE_SKILLS) entry.skillMods[skill] = LYCANTHROPE_SKILL_MOD;
}

// Only one change a day heals, whichever way it goes; the Hircine Ring lifts the change limit, not this one.
export const morphHeals = (entry, nowMinutes = 0) => nowMinutes - (entry.lastMorphHeal ?? -Infinity) > MINUTES_PER_DAY;

export function morphSelf(entity, { force = false, nowMinutes = 0, refreshHead = null, say = null, rolls = Math.random } = {}) {
  const entry = liveLycanthropy(entity);
  if (!entry) return { ok: false, refused: 'not a lycanthrope' };
  if (!entry.isTransformed) {
    const canCast = entry.wearingHircineRing
      || nowMinutes - (entry.lastCastMorphSelf ?? 0) > MINUTES_PER_DAY;
    if (!canCast && !force) {
      say?.(ONCE_PER_DAY);
      return { ok: false, refused: ONCE_PER_DAY };
    }
    entry.isTransformed = true;
    unequipSlot(entity, EQUIP_SLOTS.RightHand);
    unequipSlot(entity, EQUIP_SLOTS.LeftHand);
    entry.raceNameOverride = entry.infectionType === LYCANTHROPY_TYPES.Wereboar ? 'Wereboar' : 'Werewolf';
    entry.moveSoundTimer = initMoveSoundTimer(rolls);
  } else {
    entry.isTransformed = false;
    entry.raceNameOverride = null;
  }
  entity.isInBeastForm = entry.isTransformed;
  lycanthropeAdvantages(entry);
  if (morphHeals(entry, nowMinutes)) {
    entity.health = currentMaxHealth(entity);
    entry.lastMorphHeal = nowMinutes;
  }
  entry.lastCastMorphSelf = nowMinutes;
  refreshHead?.();
  return { ok: true };
}

export function updateSatiation(entity, nowMinutes = 0) {
  const entry = liveLycanthropy(entity);
  if (!entry) return;
  entry.lastKilledInnocent = nowMinutes;
  entry.lastUrgeNotify = 0;
  entry.urgeToKillRising = false;
  entity.maxHealthLimiter = null;
}

export function killedInnocent(target, { isCivilian = false, mobileType = null } = {}) {
  if (!target) return false;
  const innocent = isCivilian || mobileType === KNIGHT_CITY_WATCH;
  return innocent && (target.health ?? target.hp ?? 0) <= 0;
}

export function onLycanthropeHit(entity, target, { nowMinutes = 0, isCivilian = false, mobileType = null } = {}) {
  if (!liveLycanthropy(entity)) return;
  if (killedInnocent(target, { isCivilian, mobileType })) updateSatiation(entity, nowMinutes);
}

const isTransformedNow = (entity) => !!liveLycanthropy(entity)?.isTransformed;
export const isTransformedLycanthrope = (entity) => isTransformedNow(entity);

export const INVENTORY_WHILE_SHAPECHANGED_TEXT = 'You cannot access the inventory while shapechanged...';
export const NO_RESPONSE_TEXT = 'You get no response.';
export function racialSuppressInventory(entity) {
  return isTransformedNow(entity) ? { text: localizedText('inventoryWhileShapechanged', INVENTORY_WHILE_SHAPECHANGED_TEXT) } : null;
}
export function racialSuppressTalk(entity) {
  return isTransformedNow(entity) ? { text: localizedText('youGetNoResponse', NO_RESPONSE_TEXT) } : null;
}
export const racialSuppressCrime = (entity) => isTransformedNow(entity);
export const racialSuppressPopulationSpawns = (entity) => isTransformedNow(entity);

export const FRIGHTEN_BASE_CHANCE = 50;
export const FRIGHTEN_CHANCE_PER_LEVEL = 5;
export const FRIGHTEN_MIN_CHANCE = 10;
export const FRIGHTEN_MAX_CHANCE = 90;
export function frightenChance(playerLevel, guardLevel = playerLevel) {
  const p = Number.isFinite(playerLevel) ? playerLevel : 1;
  const g = Number.isFinite(guardLevel) ? guardLevel : p;
  return Math.min(FRIGHTEN_MAX_CHANCE, Math.max(FRIGHTEN_MIN_CHANCE, FRIGHTEN_BASE_CHANCE + FRIGHTEN_CHANCE_PER_LEVEL * (p - g)));
}
export function frightenRoar(entity) {
  const entry = liveLycanthropy(entity);
  if (!entry?.isTransformed) return null;
  return entry.infectionType === LYCANTHROPY_TYPES.Wereboar ? SOUND.EnemyWereboarBark : SOUND.EnemyWerewolfBark;
}

export function lycanthropeAttackVoice(entity, rolls = Math.random) {
  const entry = liveLycanthropy(entity);
  if (!entry?.isTransformed) return null;
  const boar = entry.infectionType === LYCANTHROPY_TYPES.Wereboar;
  if (Math.floor(rolls() * 100) < 10) return boar ? SOUND.EnemyWereboarAttack : SOUND.EnemyWerewolfAttack;
  if (Math.floor(rolls() * 100) < 20) return boar ? SOUND.EnemyWereboarBark : SOUND.EnemyWerewolfBark;
  return null;
}

// dt is real seconds, as in Daggerfall Unity, so resting or fast travel never queues move sounds.
export function lycanthropeMoveSound(entity, dt, rolls = Math.random) {
  const entry = liveLycanthropy(entity);
  if (!entry?.isTransformed) return null;
  // Curses from older saves carry no timer; arm it this frame instead of counting down from NaN.
  if (entry.moveSoundTimer == null) { entry.moveSoundTimer = initMoveSoundTimer(rolls); return null; }
  entry.moveSoundTimer -= dt;
  if (entry.moveSoundTimer >= 0) return null;
  entry.moveSoundTimer = initMoveSoundTimer(rolls);
  return entry.infectionType === LYCANTHROPY_TYPES.Wereboar
    ? SOUND.EnemyWereboarMove : SOUND.EnemyWerewolfMove;
}
export const WERECLAWS_ITEM = Object.freeze({ werecreatureClaws: true, material: 0 });
export function racialFpsWeapon(entity) {
  return isTransformedNow(entity) ? WERECLAWS_ITEM : null;
}

export function cureLycanthropy(entity, { nowMinutes = 0, advanceMinutes = null, refreshHead = null } = {}) {
  const entry = liveLycanthropy(entity);
  if (!entry) return false;
  if (entry.isTransformed) morphSelf(entity, { force: true, nowMinutes, refreshHead });
  entry.ended = true;
  entity.racialOverride = null;
  entity.isInBeastForm = false;
  entity.maxHealthLimiter = null;
  entity.minMetalToHit = undefined;
  entity.health = (entity.rawMaxHealth ?? entity.maxHealth ?? entity.health) + renownHpOf(entity);
  // Daggerfall Unity calls RaiseTime(60), which is sixty seconds, so the cure advances one minute.
  advanceMinutes?.(1);
  if (entity.spells) entity.spells = entity.spells.filter((s) => s.tag !== LYCANTHROPY_SPELL_TAG);
  endLycanthropyQuests();
  return true;
}
