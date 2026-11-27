// Vampirism and lycanthropy infections are disease entries with no disease data row, so the daily tick,
// the temple count, and Cure Disease all reach them.
import { turnMayProceed, isClanId, bloodlineNag } from '../systems/vampire/bloodlineLeaf.js';
import { PERMANENT_DISEASE_VALUE, COMPLETED_DISEASE_VALUE, endDisease } from './diseases.js';
import { DUSK_HOUR, SECONDS_PER_WEEK } from '../world/gameDate.js';
import { DUNGEON_TYPES } from '../formats/mapsFile.js';

export const LYCANTHROPY_TYPES = Object.freeze({ None: 0, Werewolf: 1, Wereboar: 2 });

export const VAMPIRE_CLANS = Object.freeze({
  None: 0, Vraseth: 150, Haarvenu: 151, Thrafey: 152, Lyrezi: 153,
  Montalion: 154, Khulari: 155, Garlythi: 156, Anthotis: 157, Selenu: 158,
});
const CLAN_IDS = new Set(Object.values(VAMPIRE_CLANS).filter((v) => v !== 0));

export const INFECTION = Object.freeze({
  Vampirism: 'Vampirism-Infection',
  Werewolf: 'Werewolf-Infection',
  Wereboar: 'Wereboar-Infection',
});
export const LYCANTHROPY_OF = Object.freeze({
  [INFECTION.Werewolf]: LYCANTHROPY_TYPES.Werewolf,
  [INFECTION.Wereboar]: LYCANTHROPY_TYPES.Wereboar,
});
export const isLycanthropyInfection = (key) => key in LYCANTHROPY_OF;

export const LYCANTHROPY_DREAM_VIDEO = 'ANIM0002.VID';
export const VAMPIRE_DREAM_VIDEO = 'ANIM0004.VID';
export const VAMPIRE_DEATH_VIDEO = 'ANIM0012.VID';
export const DEATH_IS_NOT_ETERNAL_TEXT_ID = 401;

// Both gates compare with >, so the dream needs one full day to pass and the turn needs four.
export const DREAM_AFTER_DAYS = 0;
export const TURN_AFTER_DAYS = 3;

export const vampireClanForFaction = (regionFaction) =>
  (CLAN_IDS.has(regionFaction?.vam) ? regionFaction.vam : VAMPIRE_CLANS.Lyrezi);

export function createInfection(key, { day = 0, regionIndex = -1 } = {}) {
  return {
    kind: 'disease',
    // permanent keeps the magic-round clock from pruning the entry before it turns or is cured.
    permanent: true,
    infection: key,
    disease: null,
    daysOfSymptomsLeft: PERMANENT_DISEASE_VALUE,
    statMods: {},
    startingDay: day,
    dreamScheduled: false,
    dreamPlayed: false,
    deathScheduled: false,
    deployed: false,
    // The clan comes from the region where the infection was caught, not where the player is at the turn.
    regionIndex,
  };
}

export function infectionAccepted(entity, key) {
  if (entity?.racialOverride || entity?.racialOverridePending) return false;
  const live = (entity?.activeEffects ?? []).filter((a) => a.infection && !a.ended);
  if (live.some((a) => a.infection === key)) return false;
  if (isLycanthropyInfection(key) && live.some((a) => isLycanthropyInfection(a.infection))) return false;
  return true;
}

export function startInfection(target, key, { day = 0, regionIndex = -1 } = {}) {
  if (!target?.isPlayer || (target.level ?? 0) < 2) return null;
  if (!infectionAccepted(target, key)) return null;
  const entry = createInfection(key, { day, regionIndex });
  target.activeEffects = target.activeEffects || [];
  target.activeEffects.push(entry);
  return entry;
}

export const liveInfection = (entity) =>
  (entity?.activeEffects ?? []).find((a) => a.infection && !a.ended) ?? null;

export const liveInfections = (entity) =>
  (entity?.activeEffects ?? []).filter((a) => a.infection && !a.ended);

export function infectionStep(entry, currentDay) {
  if (!entry || entry.ended) return { kind: 'idle' };
  if (entry.daysOfSymptomsLeft === COMPLETED_DISEASE_VALUE) return { kind: 'idle' };
  const daysPast = currentDay - entry.startingDay;
  if (daysPast > DREAM_AFTER_DAYS && !entry.dreamScheduled && !entry.dreamPlayed) {
    return {
      kind: 'dream',
      video: entry.infection === INFECTION.Vampirism ? VAMPIRE_DREAM_VIDEO : LYCANTHROPY_DREAM_VIDEO,
    };
  }
  // The turn waits until the dream video closes, as in Daggerfall Unity, however many days have passed.
  if (daysPast > TURN_AFTER_DAYS && entry.dreamPlayed) {
    if (entry.infection === INFECTION.Vampirism) {
      if (!entry.deathScheduled && turnMayProceed(entry)) return { kind: 'death', video: VAMPIRE_DEATH_VIDEO };
    } else if (!entry.deployed) {
      return { kind: 'deploy' };
    }
  }
  return { kind: 'idle' };
}

export const markDreamPlayed = (entry) => { if (entry) entry.dreamPlayed = true; };

export function deployInfection(entry, entity, { hourNow = () => 0, raiseTime = null, messageBox = null, clanOf = null, transferToCemetery = null, cancelRest = null, nowMinutes = null } = {}) {
  if (!entry || entry.deployed) return null;
  entry.deployed = true;
  const key = entry.infection;
  const pending = { key, lycanthropy: LYCANTHROPY_OF[key] ?? LYCANTHROPY_TYPES.None, clan: VAMPIRE_CLANS.None };
  if (key === INFECTION.Vampirism) {
    // Order matches Daggerfall Unity: cancel rest, pick the clan, raise the clock, then move to a cemetery.
    cancelRest?.();
    pending.clan = isClanId(entry.chosenClan) ? entry.chosenClan : clanOf ? clanOf(entry.regionIndex, entity) : VAMPIRE_CLANS.Lyrezi;
    // Set before the clock raise so the catch-up over the skipped two weeks spawns no enemies.
    if (entity) entity.preventEnemySpawns = true;
    raiseTime?.(vampireTurnRaiseSeconds(hourNow()));
    transferToCemetery?.();
  }
  if (entity) entity.racialOverridePending = pending;
  const now = nowMinutes?.();
  if (entity && _curseDeployer && Number.isFinite(now)) _curseDeployer(entity, { now: Math.floor(now) });
  if (key === INFECTION.Vampirism) messageBox?.(DEATH_IS_NOT_ETERNAL_TEXT_ID);
  // endDisease runs last, so the disease stays curable until the moment the player turns.
  endDisease(entry);
  return pending;
}

// worldTick.js registers the curse mint here because both curse modules import this module.
let _curseDeployer = null;
export function setRacialCurseDeployer(fn) { const prev = _curseDeployer; _curseDeployer = typeof fn === 'function' ? fn : null; return prev; }

let _host = null;
export function setInfectionHost(host) { const prev = _host; _host = host ?? null; return prev; }

export function runInfections(entity, currentDay, opts = {}) {
  const entries = liveInfections(entity);
  if (!entries.length) return { kind: 'idle' };
  const o = { ..._host, ...opts };
  const playVideo = o.playVideo ?? ((name, onClose) => onClose());
  // A lycanthrope turns inside the magic round at the round's clock. A vampire turns when the death video closes,
  // at the live clock.
  const syncOpts = Number.isFinite(opts.clockMinutes) ? { ...o, nowMinutes: () => opts.clockMinutes } : o;
  let first = null;
  for (const entry of entries) {
    const step = infectionStep(entry, currentDay);
    if (entry.infection === INFECTION.Vampirism) bloodlineNag(entry, currentDay, currentDay - entry.startingDay > TURN_AFTER_DAYS);
    if (step.kind === 'dream') {
      entry.dreamScheduled = true;
      playVideo(step.video, () => markDreamPlayed(entry));
    } else if (step.kind === 'death') {
      entry.deathScheduled = true;
      playVideo(step.video, () => deployInfection(entry, entity, o));
    } else if (step.kind === 'deploy') {
      deployInfection(entry, entity, syncOpts);
    }
    if (step.kind !== 'idle' && !first) first = step;
  }
  return first ?? { kind: 'idle' };
}

export function randomCemeteryLocationIndex(mapTable, roll = Math.random) {
  const found = [];
  for (let i = 0; i < (mapTable?.length ?? 0); i++) {
    if (mapTable[i]?.dungeonType === DUNGEON_TYPES.Cemetery) found.push(i);
  }
  if (!found.length) return null;
  return found[Math.min(found.length - 1, Math.floor(roll() * found.length))];
}

// The hour term is signed, so every turn lands at one hour past dusk two weeks later, whatever hour it began.
export const vampireTurnRaiseSeconds = (hour) =>
  (2 * SECONDS_PER_WEEK) + (DUSK_HOUR + 1 - hour) * 3600;
