import { VAMPIRE_CLANS, LYCANTHROPY_TYPES } from './infection.js';
import { MINUTES_PER_DAY, isDayFromMinutes } from '../world/gameDate.js';
import { spellRecordOfIndex } from '../items/loot.js';
import { SKILLS } from '../characters/skills.js';
import { WEAPON_MATERIALS } from '../characters/weapons.js';
import { VAMPIRE_SPELL_TAG, endOldLifeEffects, liveLycanthropy } from './lycanthropy.js';
import { RACES, PLAYABLE_RACE_TEMPLATES, raceById, raceByKey } from '../characters/races.js';
import { raceDisplayName } from '../talk/talkSession.js';
import { EFFECT_BITS, SPECIAL_ABILITY_BITS } from '../characters/specialAdvantages.js';
import { SOUND } from '../audio/soundClips.js';
import { endVampireQuests } from './racialQuests.js';
import { localizedText, localizedTable } from '../ui/textManager.js';
import { cloakState } from '../systems/survival/temperature.js';
import { isEnhanced } from '../ui/uiSkin.js';
import { playerInSunlight, careerSunAverse } from '../characters/passiveSpecials.js';
import { awakenedVampirism, vitaeRound, feedVampire, beastStageNow } from '../systems/vampire/vitae.js';
import { BEAST, ARCHETYPES, qualityOfCreature } from '../systems/vampire/bloodLaw.js';
import { thrallRound } from '../systems/vampire/thralls.js';
import { clanSunMod } from '../systems/vampire/clanLaw.js';
import { masqueradeRound } from '../systems/vampire/masquerade.js';

export const VAMPIRISM_CURSE_KEY = 'Vampirism-Curse';

export const VAMPIRE_STAT_MOD = 20;
// Unlike Daggerfall Unity, the sun lowers the stats instead of burning, and a raised hood only cancels the penalty.
export const vampireStatMod = (clockMinutes, sunAverse = true) => (playerInSunlight(clockMinutes) ? (sunAverse ? -VAMPIRE_STAT_MOD : 0) : VAMPIRE_STAT_MOD);
export const VAMPIRE_SKILL_MOD = 30;
export const VAMPIRE_STATS = Object.freeze(['strength', 'willpower', 'agility', 'endurance', 'personality', 'speed', 'luck']);
export const VAMPIRE_SKILLS = Object.freeze([
  SKILLS.Jumping, SKILLS.Running, SKILLS.Stealth, SKILLS.CriticalStrike,
  SKILLS.Climbing, SKILLS.HandToHand,
]);

export const VAMPIRE_BASE_SPELLS = Object.freeze([4, 90, 91]);
export const VAMPIRE_CLAN_SPELLS = Object.freeze({
  [VAMPIRE_CLANS.Vraseth]: [85],
  [VAMPIRE_CLANS.Khulari]: [50],
  [VAMPIRE_CLANS.Montalion]: [94],
  [VAMPIRE_CLANS.Thrafey]: [64],
  [VAMPIRE_CLANS.Garlythi]: [17],
  [VAMPIRE_CLANS.Selenu]: [11, 12, 13],
  [VAMPIRE_CLANS.Lyrezi]: [23, 6],
  [VAMPIRE_CLANS.Haarvenu]: [20, 33],
});

export const NOT_SATED_TEXT_ID = 36;
export const SUNLIGHT_TRAVEL_TEXT = 'You cannot initiate fast travel during the day.';
export const sunlightTravelText = () => localizedText('sunlightDamageFastTravelDay', SUNLIGHT_TRAVEL_TEXT);
export const VAMPIRE_HOOD_TEXT = 'Raise the hood of a cloak or robe to travel by day. Use Raise hood on its card in your pack.';
export const VAMPIRE_HOOD_TEXT_CLASSIC = 'Use a cloak or robe on your doll until its hood is up.';

// Declared in racialLive.js to avoid an import cycle with combat/formulas.js; re-exported for existing callers.
import { liveVampirism } from './racialLive.js';
export { liveVampirism };

export function createVampirismCurse(entity, clan, { now = 0, restore = false } = {}) {
  if (!entity || liveVampirism(entity) || entity.racialOverride) return null;
  const entry = {
    kind: 'racialOverride',
    // permanent keeps the magic-round clock from pruning the curse; only its cure ends it.
    permanent: true,
    racial: 'vampirism',
    key: VAMPIRISM_CURSE_KEY,
    clan: clan || VAMPIRE_CLANS.Lyrezi,
    lastTimeFed: now,
    hasStartedInitialVampireQuest: false,
    ...(restore ? {} : { turnedAt: now }),
    raceNameOverride: 'Vampire',
    sunDamage: true,
    holyDamage: true,
    immuneParalysis: true,
    statMods: {},
    skillMods: {},
  };
  if (!restore) endOldLifeEffects(entity);
  entity.activeEffects = entity.activeEffects || [];
  entity.activeEffects.push(entry);
  entity.racialOverride = entry;
  delete entity.racialOverridePending;
  grantVampireSpells(entity, entry.clan);
  return entry;
}

export function grantVampireSpells(entity, clan) {
  const ids = [...VAMPIRE_BASE_SPELLS, ...(VAMPIRE_CLAN_SPELLS[clan] ?? [])];
  let granted = 0;
  entity.spells = entity.spells || [];
  for (const id of ids) {
    const record = spellRecordOfIndex(id);
    if (!record) continue;
    const name = String(record.name ?? record.spellName ?? '').replace(/^!/, '');
    if (entity.spells.some((s) => s.tag === VAMPIRE_SPELL_TAG && s.name === name)) continue;
    // minimumCastingCost sets the minimum cost outright, as in Daggerfall Unity, instead of only flooring it.
    entity.spells.push({ ...record, name, tag: VAMPIRE_SPELL_TAG, custom: true, minimumCastingCost: true });
    granted++;
  }
  if (!granted && !entity.spells.some((s) => s.tag === VAMPIRE_SPELL_TAG)) {
    console.warn('[vampirism] SPELLS.STD unavailable - the clan spells are not granted');
  }
  return granted;
}

export function consumeVampirismPending(entity, { now = 0 } = {}) {
  const pending = entity?.racialOverridePending;
  if (!pending) return null;
  if ((pending.lycanthropy ?? LYCANTHROPY_TYPES.None) !== LYCANTHROPY_TYPES.None) return null;
  if (!pending.clan || pending.clan === VAMPIRE_CLANS.None) return null;
  return createVampirismCurse(entity, pending.clan, { now });
}

export function vampirismMagicRound(entity, { nowMinutes = 0, skyMinutes = nowMinutes, say = () => {} } = {}) {
  const entry = liveVampirism(entity);
  if (!entry) return;
  // The sun mod reads skyMinutes (world time); thirst and upkeep below read nowMinutes (character time).
  const mod = clanSunMod(entry.clan, vampireStatMod(skyMinutes, racialSunAverse(entity)));
  entry.statMods = {};
  for (const stat of VAMPIRE_STATS) entry.statMods[stat] = mod;
  if (entry.clan === VAMPIRE_CLANS.Anthotis) entry.statMods.intelligence = mod;
  entry.skillMods = {};
  for (const skill of VAMPIRE_SKILLS) entry.skillMods[skill] = VAMPIRE_SKILL_MOD;
  entity.minMetalToHit = WEAPON_MATERIALS.Silver;
  vitaeRound(entity, nowMinutes, say);
  thrallRound(entity, nowMinutes, say);
  masqueradeRound(entity, nowMinutes, say);
  entry.satiated = isVampireSatiated(entity, nowMinutes);
}

export function isVampireSatiated(entity, nowMinutes = 0) {
  const entry = liveVampirism(entity);
  if (!entry) return true;
  if (awakenedVampirism(entity)) return beastStageNow(entity, nowMinutes) < BEAST.Starving;
  return nowMinutes - (entry.lastTimeFed ?? 0) <= MINUTES_PER_DAY;
}

export function onVampireHit(entity, nowMinutes = 0, { target = null, isCivilian = false, damage = 0 } = {}) {
  const entry = liveVampirism(entity);
  if (!entry) return;
  if (awakenedVampirism(entity)) {
    if (!isCivilian && damage > 0) feedVampire(entity, { kind: 'wound', type: ARCHETYPES.Beast, quality: qualityOfCreature(target?.level), now: nowMinutes });
    return;
  }
  entry.lastTimeFed = nowMinutes;
}

export function racialRestBlock(entity, nowMinutes = 0) {
  const entry = liveVampirism(entity);
  if (!entry) return null;
  if (isVampireSatiated(entity, nowMinutes)) return null;
  return { textId: NOT_SATED_TEXT_ID };
}

export function racialOverrideHeadArt(entity) {
  const lyc = liveLycanthropy(entity);
  if (lyc?.isTransformed) {
    return { file: lyc.infectionType === LYCANTHROPY_TYPES.Wereboar ? 'WERE00I0.IMG' : 'WERE01I0.IMG', record: 0 };
  }
  if (liveVampirism(entity)) {
    const raceKey = raceByKey(entity?.race)?.artRace ?? entity?.race;
    // entity.race stays the birth race; the curse overrides only the displayed name.
    const raceId = RACES[raceKey] ?? 1;
    return { file: 'VAMP00I0.CIF', record: (entity?.gender === 'female' ? 0 : 8) + raceId - 1 };
  }
  return null;
}

export function racialPaperDollBackground(entity) {
  const lyc = liveLycanthropy(entity);
  if (lyc?.isTransformed) return lyc.infectionType === LYCANTHROPY_TYPES.Wereboar ? 'BOAR00I0.IMG' : 'WOLF00I0.IMG';
  if (liveVampirism(entity)) return 'SCBG08I0.IMG';
  return null;
}

export const racialSuppressPaperDollBodyAndItems = (entity) => !!liveLycanthropy(entity)?.isTransformed;

export function vampireAttackVoice(entity, rolls = Math.random) {
  if (!liveVampirism(entity)) return null;
  const bark = Math.floor(rolls() * 100) < 20;
  return entity?.gender === 'female'
    ? (bark ? SOUND.EnemyFemaleVampireBark : SOUND.EnemyFemaleVampireAttack)
    : (bark ? SOUND.EnemyVampireBark : SOUND.EnemyVampireAttack);
}

export function birthRaceTemplate(entity) {
  if (!entity) return null;
  return PLAYABLE_RACE_TEMPLATES.find((r) => r.key === entity.race || r.name === entity.race)
    ?? raceById(entity.raceId)
    ?? null;
}

const OVERRIDE_RACE_NAMES = localizedTable({
  Vampire: ['vampire', 'Vampire'], Werewolf: ['werewolf', 'Werewolf'], Wereboar: ['wereboar', 'Wereboar'],
});
const overrideRaceName = (name) => (Object.hasOwn(OVERRIDE_RACE_NAMES, name) ? OVERRIDE_RACE_NAMES[name] : name);

export function liveRaceName(entity) {
  const t = liveRaceTemplate(entity);
  return t && t !== birthRaceTemplate(entity) ? t.name : raceDisplayName(t?.key ?? entity?.race);
}

export function liveRaceTemplate(entity) {
  const birth = birthRaceTemplate(entity);
  const vamp = liveVampirism(entity);
  const lyc = vamp ? null : liveLycanthropy(entity);
  if (!vamp && !lyc) return birth;
  const base = birth ?? { name: entity?.race ?? 'Breton', resistanceFlags: 0, immunityFlags: 0, lowToleranceFlags: 0, criticalWeaknessFlags: 0, specialAbilities: 0 };
  if (vamp) {
    return Object.freeze({
      ...base,
      name: overrideRaceName(vamp.raceNameOverride ?? 'Vampire'),
      immunityFlags: (base.immunityFlags ?? 0) | EFFECT_BITS.toParalysis | EFFECT_BITS.toDisease,
      specialAbilities: (base.specialAbilities ?? 0) | SPECIAL_ABILITY_BITS.holyDamage,
    });
  }
  return Object.freeze({
    ...base,
    name: lyc.raceNameOverride != null ? overrideRaceName(lyc.raceNameOverride) : base.name,
    immunityFlags: (base.immunityFlags ?? 0) | EFFECT_BITS.toDisease,
  });
}

export { isDayFromMinutes };

export function racialSunAverse(entity) {
  if (!entity?.racialOverride?.sunDamage) return false;
  return !cloakState(entity.equip?.slots ?? null).hood;
}

export function racialFastTravelBlock(entity, nowMinutes = 0) {
  if (!racialSunAverse(entity)) return null;
  if (!isDayFromMinutes(nowMinutes)) return null;
  return { text: sunlightTravelText(), hint: isEnhanced() ? VAMPIRE_HOOD_TEXT : VAMPIRE_HOOD_TEXT_CLASSIC };
}

export function careerFastTravelBlock(entity, nowMinutes = 0) {
  if (!careerSunAverse(entity)) return null;
  if (!isDayFromMinutes(nowMinutes)) return null;
  const hint = isEnhanced() ? VAMPIRE_HOOD_TEXT : VAMPIRE_HOOD_TEXT_CLASSIC;
  return { text: sunlightTravelText(), hint };
}

export function cureVampirism(entity, { advanceMinutes = null } = {}) {
  const entry = liveVampirism(entity);
  if (!entry) return false;
  entry.ended = true;
  entity.racialOverride = null;
  // The clan is remembered after the cure, so its quest line and reputation carry over.
  entity.previousVampireClan = entry.clan;
  entity.minMetalToHit = undefined;
  // Daggerfall Unity calls RaiseTime(60), which is sixty seconds, so the cure advances one minute.
  advanceMinutes?.(1);
  if (entity.spells) entity.spells = entity.spells.filter((s) => s.tag !== VAMPIRE_SPELL_TAG);
  endVampireQuests();
  return true;
}

export const clanRepickLeft = (entity) => { const e = liveVampirism(entity); return !!e && !e.clanRepicked; };
export function changeVampireClan(entity, clan) {
  const entry = liveVampirism(entity);
  if (!entry || entry.clanRepicked || entry.clan === clan || !Object.values(VAMPIRE_CLANS).includes(clan) || clan === VAMPIRE_CLANS.None) return false;
  entry.clan = clan;
  entry.clanRepicked = true;
  if (entity.spells) entity.spells = entity.spells.filter((s) => s.tag !== VAMPIRE_SPELL_TAG);
  grantVampireSpells(entity, clan);
  return true;
}
