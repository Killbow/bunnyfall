// The player's per-classic-minute tick, shared by every host.

import { updateDiseases } from '../afflictions/diseases.js';
import { runInfections, setRacialCurseDeployer } from '../afflictions/infection.js';
import { consumeRacialOverridePending, lycanthropyMagicRound } from '../afflictions/lycanthropy.js';
import { consumeVampirismPending, vampirismMagicRound } from '../afflictions/vampirism.js';
import { updatePoisons } from '../afflictions/poisons.js';
import { tickActiveEffects } from '../magic/effects.js';
import { skillValue, tallyMovementSkill, SKILLS } from '../characters/skills.js';
import { noteSkippedSpan, dropSkippedAfter } from './skippedTime.js';
import { ENEMY_BASICS } from '../characters/enemyBasics.js';
import { marksBlood } from '../combat/bloodDecals.js';
import { timeScale, timeAccelerated } from './timeScale.js';
import { FATIGUE_LOSS, FATIGUE_DRAIN_SCALE, killIfAnyLiveStatZero } from '../characters/statMods.js';
import { decayEnemyAlert } from '../characters/encounters.js';
import { dice100, setPlayerStruckHook } from '../combat/formulas.js';
import { installPcaao } from '../combat/pcaao.js';
import { installMeanerMonsters } from '../characters/meanerMonsters.js';
import { installUnleveledLoot } from '../items/unleveledLoot.js';
import { onLycanthropeHit } from '../afflictions/lycanthropy.js';
import { onVampireHit } from '../afflictions/vampirism.js';
import { onPlayerStruckByEnemy } from '../items/artifactEffects.js';

/**
 * @param {object} player
 * @param {object} target
 * @param {object} [o]
 * @param {number} [o.nowMinutes]
 * @param {boolean} [o.isCivilian]
 * @param {number|null} [o.mobileType]
 */
export function playerWeaponHitEntity(player, target, { nowMinutes = Math.floor(ownMinutes()), isCivilian = false, mobileType = null, damage = 0 } = {}) {
  if (!player?.racialOverride) return;
  const bleeds = marksBlood(target?.basics?.bloodIndex ?? ENEMY_BASICS[mobileType ?? target?.mobileType]?.bloodIndex);
  onVampireHit(player, nowMinutes, { target, isCivilian, damage: bleeds ? damage : 0 });
  onLycanthropeHit(player, target, { nowMinutes, isCivilian, mobileType: mobileType ?? target?.mobileType ?? null });
}
export const blowFeedDamage = (rec, damage) => (rec?.crystal != null || rec?.warded || rec?.entity?.warded ? 0 : damage);
export function playerWeaponKillReported(player, { nowMinutes = Math.floor(ownMinutes()), isCivilian = false, mobileType = null } = {}) {
  if (!player?.racialOverride) return;
  onLycanthropeHit(player, { health: 0 }, { nowMinutes, isCivilian, mobileType });
}
setRacialCurseDeployer((entity, { now }) => {
  consumeRacialOverridePending(entity, { now });
  consumeVampirismPending(entity, { now });
});
setPlayerStruckHook((attacker, target, damage) => onPlayerStruckByEnemy(attacker, target, damage));
installMeanerMonsters();
installPcaao();
installUnleveledLoot();
installSurvivalIcons();
installSurvivalLoot({ enabled: corpseFoodOn });
import { normalizeReputations, NORMALIZE_INTERVAL_MINUTES, RECOVERY_INTERVAL_MINUTES } from '../justice/court.js';
import { regionPowerUpdate } from '../guilds/regionPower.js';
import { runSurvivalMinutes, clearSurvivalMods, pauseSurvival } from '../systems/survival/needs.js';
import { installSurvivalIcons } from '../systems/survival/items.js';
import '../items/ayleidStones.js';
import '../items/gems.js';
import { installSurvivalLoot } from '../systems/survival/loot.js';
import '../cards/cardSources.js';
import { survivalOn, corpseFoodOn } from '../systems/survival/switch.js';
export const FACTION_POWER_INTERVAL_MINUTES = 10080;
export const REGION_CONDITIONS_INTERVAL_MINUTES = 54720;
import { startRacialOverrideQuest, CURE_QUEST_INTERVAL_MINUTES, ONLINE_RACIAL_INTERVAL_MINUTES, racialArmIdle } from '../afflictions/racialQuests.js';
import { CLASSIC_GAME_START_TIME } from './gameDate.js';
import { RACES } from '../characters/races.js';

import { MINUTES_PER_DAY, DUSK_HOUR, isDayFromMinutes } from './gameDate.js';
import { enchantmentMagicRound } from '../magic/enchantments.js';
import { computeEntityMods } from '../characters/entityMods.js';
import { claimSyntheticTimeIncrease, resetSyntheticTimeIncrease } from '../magic/effectBroker.js';
import { passiveSpecialsMagicRound } from '../characters/passiveSpecials.js';
import { updateRegionalPrices, setWorldPriceSource, initialRegionPrice, priceWalkStep, applyPriceConditionFlags } from '../trade/shopStock.js';
import { findFactionByTypeAndRegion } from '../talk/talk.js';
import { FACTION_TYPES } from '../formats/factionFile.js';
import { MERCHANTS_FACTION_ID } from '../guilds/guilds.js';
import { REGION_COUNT } from './regionConditions.js';
import { ONLINE_EPOCH_MINUTES, ONLINE_MINUTES_PER_MS } from '../net/wire.js';
import { rollClimateWeathersForDay, evolveClimateWeathers } from '../weather/weatherSim.js';
import { setSkyCalendar } from '../weather/skyCalendar.js';
import { seededRng } from '../weather/wind.js';
import { removeExpiredRooms } from '../trade/tavern.js';
import { removeExpiredItems } from '../items/createItem.js';
import { tickPlayerTorch } from '../player/playerTorch.js';
import { checkOverdueLoans, settleOverdueLoan, callInEmpireDebt, empireCallInLines, calculateMaxBankLoan, bankedGold, empireDrawLines } from '../trade/banking.js';
import { isOnlinePage } from '../platform/onlineLane.js';
import { lowerRepForCrime, deductGold } from '../justice/court.js';
import { REGION_NAMES } from '../formats/mapsFile.js';
import { localizedText, formatText, getLocalizedRegionName } from '../ui/textManager.js';

import { handleStartingCrimeGuildQuests } from '../guilds/crimeGuilds.js';

const SHARED_DAY_SEED = 0x44415953;
export const DAY_SALT = Object.freeze({ prices: 1, powers: 2, priceInit: 3, conditions: 4, raids: 5 });
export const dayRng = (minute, salt = 0) => seededRng(((Math.floor(minute / MINUTES_PER_DAY) * 7919) ^ SHARED_DAY_SEED ^ Math.imul(salt | 0, 0x9E3779B1)) >>> 0);
export const dayRollsFor = (minute, rolls, salt = 0) => (sharedClockOn() ? dayRng(minute, salt) : rolls);

const ECON_EPOCH_DAY = Math.floor(ONLINE_EPOCH_MINUTES / MINUTES_PER_DAY);
let _worldPrices = null;
const CHECKPOINT_DAYS = 512;
const _checkpoints = new Map();
let _worldTilt = null;
export function setWorldPriceTilt(tiltOf) { _worldTilt = typeof tiltOf === 'function' ? tiltOf : null; _worldPrices = null; _checkpoints.clear(); }
export const worldPriceTiltOn = () => _worldTilt !== null;
export const worldPriceCheckpointDays = () => [..._checkpoints.keys()].sort((a, b) => a - b);
export function worldRegionPricesOn(day) {
  const d = Math.floor(Number.isFinite(day) ? day : ECON_EPOCH_DAY);
  if (!_worldPrices || _worldPrices.day > d) {
    let from = null;
    for (const [cd, cp] of _checkpoints) if (cd <= d && (!from || cd > from.day)) from = { day: cd, prices: cp };
    if (from) _worldPrices = { day: from.day, prices: from.prices.slice() };
    else {
      const init = dayRng(ECON_EPOCH_DAY * MINUTES_PER_DAY, DAY_SALT.priceInit);
      const prices = new Array(REGION_COUNT);
      for (let i = 0; i < REGION_COUNT; i++) prices[i] = initialRegionPrice(init());
      _worldPrices = { day: ECON_EPOCH_DAY, prices };
    }
  }
  while (_worldPrices.day < d) {
    const next = _worldPrices.day + 1;
    const gen = dayRng(next * MINUTES_PER_DAY, DAY_SALT.prices);
    const prices = _worldPrices.prices.map((adj, i) => { const roll = gen(); const tilt = _worldTilt ? _worldTilt(i) : 0; return tilt == null ? adj : priceWalkStep(adj, tilt, roll); });
    _worldPrices = { day: next, prices };
    if (next % CHECKPOINT_DAYS === 0 && !_checkpoints.has(next)) _checkpoints.set(next, prices.slice());
  }
  return _worldPrices.prices;
}
export const worldRegionPrice = (regionIndex, minute = worldMinutes()) => worldRegionPricesOn(Math.floor(minute / MINUTES_PER_DAY))[regionIndex | 0] ?? 1000;

export { MINUTES_PER_DAY };

export const CLASSIC_MINUTES_PER_SECOND = 12 / 60;

export const LOAN_REMINDER_HUD_DELAY = 3;

/** @returns {{from: number, to: number, rounds: number}} */
export function claimMagicRounds(fromMinute, toMinute) {
  claimSyntheticTimeIncrease();
  const nextFloor = Math.floor(toMinute);
  const here = Math.floor(fromMinute);
  if (_lastMagicRoundMinute === null || here < _lastMagicRoundMinute) _lastMagicRoundMinute = here;
  const from = Math.max(_lastMagicRoundMinute, nextFloor - MAX_CATCHUP_ROUNDS);
  if (nextFloor > _lastMagicRoundMinute) _lastMagicRoundMinute = nextFloor;
  return { from, to: nextFloor, rounds: Math.max(0, nextFloor - from) };
}

/** @returns {number} */
const _roundHooks = new Map();
export function registerMagicRoundHook(name, fn) { if (typeof fn === 'function') _roundHooks.set(name, fn); else _roundHooks.delete(name); }

export function runMagicRoundsFor(entity, from, to, { sinks, rolls = Math.random, say = () => {} , enchantCtx = null, skyMinutes = null } = {}) {
  if (!entity || !(to > from)) return 0;
  let rounds = 0;
  const clockMinutes = to;
  const sky = Number.isFinite(skyMinutes) ? skyMinutes : clockMinutes;
  for (let r = from; r < to; r++) {
    updateDiseases(entity, Math.floor((r + 1) / MINUTES_PER_DAY), sinks, rolls, say);
    runInfections(entity, Math.floor(clockMinutes / MINUTES_PER_DAY), { clockMinutes });
    consumeRacialOverridePending(entity, { now: clockMinutes });
    consumeVampirismPending(entity, { now: clockMinutes });
    lycanthropyMagicRound(entity, { nowMinutes: r + 1, clockMinutes, skyMinutes: sky, moonNight: Number.isFinite(skyMinutes), say });
    vampirismMagicRound(entity, { nowMinutes: clockMinutes, skyMinutes: sky, say });
    updatePoisons(entity, r + 1, sinks, rolls, say);
    tickActiveEffects(entity, sinks);
    enchantmentMagicRound(entity, r + 1, {
      nowMinutes: r + 1,
      ctx: { ...(enchantCtx ?? {}), hurtSelf: (n) => sinks?.hurt?.(n), say },
    });
    computeEntityMods(entity);
    passiveSpecialsMagicRound(entity, { nowMinutes: r + 1, clockMinutes: sky, sinks });
    for (const fn of _roundHooks.values()) fn(entity, { nowMinutes: r + 1, sinks, say });
    rounds++;
  }
  return rounds;
}

/** @returns {number} */
export function runMagicRounds({ entity, fromMinute, toMinute, sinks, rolls = Math.random, say = () => {} } = {}) {
  const { from, to } = claimMagicRounds(fromMinute, toMinute);
  return runMagicRoundsFor(entity, from, to, { sinks, rolls, say });
}

/**
 * @param {object} o
 * @param {object} o.entity
 * @param {number} o.classicMinutes
 * @param {number} o.dt
 * @param {object} o.sinks
 * @param {object} [o.activity]
 * @param {number} [o.fatigueMultiplier]
 * @param {Function} [o.rolls]
 * @param {Function} [o.say]
 * @returns {{ classicMinutes: number, rounds: number, magicRoundWindow: {from:number,to:number,rounds:number} }}
 */
/**
 * @param {number} lastMinutes
 * @returns {{daysPast: number, loanReminders: object[], loanDefaults: number[]}}
 */
export const DAY_ARMS = Object.freeze({ all: 'all', world: 'world', own: 'own' });
export function runDayChange({ entity, lastMinutes, nowMinutes, rolls = Math.random, say = () => {}, arms = DAY_ARMS.all } = {}) {
  const none = { daysPast: 0, loanReminders: [], loanDefaults: [] };
  if (!entity) return none;
  const worldHalf = arms !== DAY_ARMS.own, ownHalf = arms !== DAY_ARMS.world;
  const daysPast = Math.floor(nowMinutes / MINUTES_PER_DAY) - Math.floor(lastMinutes / MINUTES_PER_DAY);
  if (!(daysPast > 0)) return none;
  if (worldHalf && sharedClockOn()) {
    const firstDay = Math.floor(lastMinutes / MINUTES_PER_DAY) + 1, lastDay = Math.floor(nowMinutes / MINUTES_PER_DAY);
    const dict = entity.factionRep?.dict ?? null, merchants = dict?.get(MERCHANTS_FACTION_ID) ?? null;
    for (let d = firstDay; d <= lastDay && merchants; d++) {
      const prices = worldRegionPricesOn(d), flagRolls = dayRng(d * MINUTES_PER_DAY, DAY_SALT.conditions);
      for (let i = 0; i < REGION_COUNT; i++) if (findFactionByTypeAndRegion(dict, FACTION_TYPES.Province, i)) applyPriceConditionFlags(entity.regionConditions ?? null, i, prices[i], flagRolls);
    }
  } else if (worldHalf) updateRegionalPrices(entity, entity.factionRep?.dict ?? null, daysPast, rolls, entity.regionConditions ?? null);

  if (worldHalf) rollClimateWeathersForDay(nowMinutes, rolls);
  if (!ownHalf) return { daysPast, loanReminders: [], loanDefaults: [] };

  if (entity.rentedRooms?.length) {
    entity.rentedRooms = removeExpiredRooms(entity.rentedRooms, nowMinutes, entity.sceneCache ?? null);
  }

  const loanReminders = [];
  const loanDefaults = [];
  if (entity.bankAccounts?.length) {
    const { reminders, overdue } = checkOverdueLoans(entity.bankAccounts, lastMinutes, nowMinutes);
    for (const r of reminders) {
      say(formatText(localizedText('loanReminder', 'You have a loan of {0} gold pieces due in'), r.owed), LOAN_REMINDER_HUD_DELAY);
      say(formatText(localizedText('loanReminder2', 'less than {0} months in {1}'), r.months,
        getLocalizedRegionName(r.regionIndex, (i) => REGION_NAMES[i] ?? '')), LOAN_REMINDER_HUD_DELAY);
      loanReminders.push(r);
    }
    for (const regionIndex of overdue) {
      const outcome = settleSaid(entity, regionIndex, say);
      if (outcome.kind !== 'defaulted') continue;
      lowerRepForCrime(entity, regionIndex, outcome.crime);
      loanDefaults.push(regionIndex);
    }
  }
  return { daysPast, loanReminders, loanDefaults };
}

function settleSaid(entity, regionIndex, say) {
  const banked = bankedGold(entity.bankAccounts);
  const outcome = settleOverdueLoan(entity.bankAccounts, regionIndex, entity);
  if (isOnlinePage()) for (const line of empireDrawLines(banked - bankedGold(entity.bankAccounts), REGION_NAMES[regionIndex] ?? '')) say(line, LOAN_REMINDER_HUD_DELAY);
  return outcome;
}

export function empireJoin({ entity, nowMinutes, say = () => {} } = {}) {
  const accounts = entity?.bankAccounts;
  if (!accounts?.length) return null;
  const now = Math.floor(nowMinutes);
  for (let r = 0; r < accounts.length; r++) {
    const due = accounts[r]?.loanDueDate;
    if (!(accounts[r]?.loanTotal > 0) || !due || due > now) continue;
    const outcome = settleSaid(entity, r, say);
    if (outcome.kind === 'defaulted') lowerRepForCrime(entity, r, outcome.crime);
  }
  const call = callInEmpireDebt(accounts, { deductGold: (n) => deductGold(entity, n) }, { cap: calculateMaxBankLoan(entity.level ?? 1), nowMinutes: now });
  for (const regionIndex of call.unpaid) {
    const outcome = settleSaid(entity, regionIndex, say);
    if (outcome.kind === 'defaulted') lowerRepForCrime(entity, regionIndex, outcome.crime);
  }
  for (const line of empireCallInLines(call)) say(line, LOAN_REMINDER_HUD_DELAY);
  return call;
}

export function tickPlayerMinutes(args = {}) {
  _tickDepth++;
  try { return tickPlayerMinutesOnce(args); } finally { _tickDepth--; }
}
function tickPlayerMinutesOnce({
  entity,
  classicMinutes,
  dt,
  sinks,
  activity = { running: false, runningTally: false, swimming: false },
  fatigueMultiplier = 1,
  rolls = Math.random,
  say = () => {},
  inside = false,
  realSeconds = dt,
  survival = null,
  raiseMinutes = 0,
} = {}) {
  let worldFrom = null, worldTo = null;
  if (_sharedClock) {
    const reading = _sharedClock();
    worldFrom = _sharedLastTick ?? reading;
    if (reading < worldFrom) worldFrom = reading;
    worldTo = Math.max(worldFrom, reading);
    _sharedLastTick = worldTo;
    classicMinutes = _ownMinutes ?? worldFrom;
    _ownMinutes = classicMinutes + (worldTo - worldFrom) + (raiseMinutes > 0 ? raiseMinutes : 0);
    if (raiseMinutes > 0) _raisedMinutes += raiseMinutes;
    if (raiseMinutes > 0) noteSkippedSpan(_ownMinutes - raiseMinutes, _ownMinutes);
  }
  const worldPieces = _sharedClock ? worldArmsPieces(Math.floor(worldFrom), Math.floor(worldTo)) : null;
  const next = _sharedClock ? _ownMinutes : classicMinutes + dt * CLASSIC_MINUTES_PER_SECOND;
  if (!_sharedClock && timeAccelerated()) noteSkippedSpan(classicMinutes, next);
  const clockAtEntry = worldMinutes();

  const magicRoundWindow = claimMagicRounds(classicMinutes, next);
  const rounds = runMagicRoundsFor(entity, magicRoundWindow.from, magicRoundWindow.to, { sinks, rolls, say, skyMinutes: _sharedClock ? skyMinutes() : null });

  const lastMinutes = Number.isFinite(entity.lastGameMinutes) ? entity.lastGameMinutes : Math.floor(classicMinutes);
  const nowMinutes = Math.floor(next);
  if (!Number.isFinite(entity.lastGameMinutes) || nowMinutes > entity.lastGameMinutes) {
    entity.lastGameMinutes = nowMinutes;
  }

  decayEnemyAlert(entity, nowMinutes);

  if (activity.odometer) entity._odometer = activity.odometer;
  const pace = Math.max(1, timeScale());
  if (activity.jumped) {
    sinks.drainFatigue?.(Math.trunc(FATIGUE_LOSS.Jumping * fatigueMultiplier * FATIGUE_DRAIN_SCALE));
    entity._jumpTallyAcc = (entity._jumpTallyAcc ?? 0) + 1 / pace;
    if (entity._jumpTallyAcc >= 1) { entity._jumpTallyAcc -= 1; tallyMovementSkill(entity, SKILLS.Jumping); }
  }
  for (const kind of [].concat(activity.parkoured || [])) {
    const exertion = FATIGUE_LOSS.Jumping;
    sinks.drainFatigue?.(Math.trunc(exertion * fatigueMultiplier * FATIGUE_DRAIN_SCALE));
    tallyMovementSkill(entity, kind === 'vault' || kind === 'leap' ? SKILLS.Jumping : SKILLS.Climbing);
  }

  if (activity.runningTally && pace <= 1) {
    entity._runTallyAcc = (entity._runTallyAcc ?? 0) + dt / pace;
    while (entity._runTallyAcc >= 0.25) {
      entity._runTallyAcc -= 0.25;
      tallyMovementSkill(entity, SKILLS.Running);
    }
  }

  if (Math.floor(next) !== Math.floor(classicMinutes)) {
    let loss = activity.standing && !activity.swimming ? 0 : FATIGUE_LOSS.Default;
    if (activity.climbing) loss = FATIGUE_LOSS.Climbing;
    else if (activity.running) loss = FATIGUE_LOSS.Running;
    else if (activity.swimming) {
      if (entity.raceId !== RACES.Argonian
        && !dice100(skillValue(entity, SKILLS.Swimming), rolls())) loss = FATIGUE_LOSS.Swimming;
      tallyMovementSkill(entity, SKILLS.Swimming);
    }
    if (!entity.isResting) sinks.drainFatigue?.(Math.trunc(loss * fatigueMultiplier * FATIGUE_DRAIN_SCALE));

    removeExpiredItems(entity, Math.floor(next));
  }

  tickPlayerTorch(entity, realSeconds, { say, rolls });

  if (_sharedClock) {
    for (const [s, e] of worldPieces) runDayChange({ entity, lastMinutes: s, nowMinutes: e, rolls, say, arms: DAY_ARMS.world });
    rollWorldZonesAcross(worldFrom, worldTo);
    runDayChange({ entity, lastMinutes, nowMinutes, rolls, say, arms: DAY_ARMS.own });
  } else runDayChange({ entity, lastMinutes, nowMinutes, rolls, say });
  evolveClimateWeathers(_sharedClock ? Math.floor(worldTo) : nowMinutes);

  if (_sharedClock) {
    runCalendarArms(entity, lastMinutes, nowMinutes, { rolls, arms: DAY_ARMS.own });
    for (const [s, e] of worldPieces) runCalendarArms(entity, s, e, { rolls, arms: DAY_ARMS.world });
  } else runCalendarArms(entity, lastMinutes, nowMinutes, { rolls });

  if (entity.preventNormalizingReputations) entity.preventNormalizingReputations = false;

  handleStartingCrimeGuildQuests(entity, { nowClassicMinutes: next, inside, online: sharedClockOn() });

  let felt = null;
  if (survival && nowMinutes > lastMinutes) {
    felt = runSurvivalMinutes(entity, lastMinutes, nowMinutes, survival.env ?? {}, { ...(survival.deps ?? {}), sinks: survival.deps?.sinks ?? sinks, rolls, skyFollows: !_sharedClock });
  } else if (!survival) {
    clearSurvivalMods(entity);
    if (!survivalOn() && nowMinutes > lastMinutes) pauseSurvival(entity, lastMinutes, nowMinutes);
  }

  killIfAnyLiveStatZero(entity, sinks, realSeconds);

  if (_sharedClock) return { classicMinutes: ownMinutes(), rounds, magicRoundWindow, felt };
  const jumped = worldMinutes() - clockAtEntry;
  return { classicMinutes: jumped > 0 ? next + jumped : next, rounds, magicRoundWindow, felt };
}

export function runCalendarArms(entity, lastMinutes, nowMinutes, { rolls = Math.random, arms = DAY_ARMS.all } = {}) {
  if (!entity) return;
  const worldArms = arms !== DAY_ARMS.own, ownArms = arms !== DAY_ARMS.world;
  const shortWaits = sharedClockOn();
  for (let i = lastMinutes; i < nowMinutes; i++) {
    if (ownArms && i % NORMALIZE_INTERVAL_MINUTES === 0 && !entity.preventNormalizingReputations) {
      normalizeReputations(entity, entity.factionRep ?? null, { recoveryOnly: true });
    } else if (ownArms && i % RECOVERY_INTERVAL_MINUTES === 0 && !entity.preventNormalizingReputations) {
      normalizeReputations(entity, entity.factionRep ?? null, { recoveryOnly: true });
    }
    const powerMinute = worldArms && i % FACTION_POWER_INTERVAL_MINUTES === 0;
    const conditionMinute = i % REGION_CONDITIONS_INTERVAL_MINUTES === 0;
    const dayRolls = powerMinute || (worldArms && conditionMinute) ? dayRollsFor(i, rolls, DAY_SALT.powers) : null;
    if (powerMinute) {
      regionPowerUpdate(entity.factionRep ?? null, { rumorMill: entity.rumorMill ?? null, rolls: dayRolls });
    }
    if (conditionMinute) {
      if (worldArms) {
        regionPowerUpdate(entity.factionRep ?? null, {
          rumorMill: entity.rumorMill ?? null, rolls: dayRolls,
          updateConditions: true, regionConditions: entity.regionConditions ?? null,
        });
      }
      if (ownArms && !shortWaits) startRacialOverrideQuest(entity, false, { rolls });
    }
    if (ownArms && !shortWaits && i % CURE_QUEST_INTERVAL_MINUTES === 0) {
      startRacialOverrideQuest(entity, true, { rolls });
    }
    if (ownArms && shortWaits && i % ONLINE_RACIAL_INTERVAL_MINUTES === 0) {
      if (racialArmIdle(false)) startRacialOverrideQuest(entity, false, { rolls });
      if (racialArmIdle(true)) startRacialOverrideQuest(entity, true, { rolls });
    }
  }
}

export { CLASSIC_GAME_START_TIME as CLASSIC_GAME_START_MINUTES } from './gameDate.js';

let _worldMinutes = CLASSIC_GAME_START_TIME;

let _sharedClock = null;
let _sharedLastTick = null;
let _skySource = null;
let _skyWall = null;
let _worldWalked = [];
const WORLD_WALKED_SPANS = 8;
export function worldArmsPieces(from, to) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || !(to > from)) return [];
  const pieces = [];
  let s = from;
  for (const [a, b] of _worldWalked) {
    if (a >= to) break;
    if (b <= s) continue;
    if (a > s) pieces.push([s, a]);
    s = Math.max(s, b);
  }
  if (s < to) pieces.push([s, to]);
  let lo = from, hi = to;
  const spans = [];
  for (const [a, b] of _worldWalked) {
    if (b < lo || a > hi) spans.push([a, b]);
    else { lo = Math.min(lo, a); hi = Math.max(hi, b); }
  }
  spans.push([lo, hi]);
  spans.sort((x, y) => x[0] - y[0]);
  while (spans.length > WORLD_WALKED_SPANS) spans.splice(0, 2, [spans[0][0], spans[1][1]]);
  _worldWalked = spans;
  return pieces;
}
function rollWorldZonesAcross(from, to) {
  if (Math.floor(Math.floor(to) / MINUTES_PER_DAY) > Math.floor(Math.floor(from) / MINUTES_PER_DAY)) rollClimateWeathersForDay(Math.floor(to));
}
let _sharedClockHeard = false;
let _absenceWaiting = null;
export const sharedClockHeard = () => _sharedClockHeard;
export const trustedWorldMinutes = () => (_sharedClock && !_sharedClockHeard ? NaN : worldMinutes());
export function payAbsenceWhenHeard(left, pay) {
  if (!_sharedClock || !Number.isFinite(left) || typeof pay !== 'function') return false;
  _absenceWaiting = { left: Math.floor(left), pay };
  if (_sharedClockHeard) settleAbsence();
  return true;
}
function settleAbsence() {
  const waiting = _absenceWaiting;
  _absenceWaiting = null;
  if (waiting) waiting.pay(worldMinutes());
}
let _heardMark = null;
export const sharedClockHeardMark = () => _heardMark;
const monotonicMs = () => (typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now());
export function hearSharedClock(perf = monotonicMs()) {
  if (!_sharedClock) return false;
  _sharedClockHeard = true;
  _heardMark = Object.freeze({ world: worldMinutes(), perf, n: (_heardMark?.n ?? 0) + 1 });
  settleAbsence();
  return true;
}
export const worldMinutesToSave = () => (_absenceWaiting ? _absenceWaiting.left : Math.floor(worldMinutes()));
let _tickDepth = 0;
export const tickInFlight = () => _tickDepth > 0;
export function setSharedClock(source, wallOf = null, { sky = null, skyWall = null } = {}) {
  _sharedClock = typeof source === 'function' ? source : null;
  _sharedWall = _sharedClock && typeof wallOf === 'function' ? wallOf : null;
  _skySource = _sharedClock && typeof sky === 'function' ? sky : null;
  _skyWall = _skySource && typeof skyWall === 'function' ? skyWall : null;
  setSkyCalendar(!!_skySource);
  _sharedLastTick = null;
  _worldWalked = [];
  _sharedClockHeard = false;
  _heardMark = null;
  _absenceWaiting = null;
  _ownMinutes = null;
  _raisedMinutes = 0;
  setWorldPriceSource(_sharedClock ? (regionIndex) => worldRegionPrice(regionIndex, _sharedClock()) : null);
}
export const sharedClockOn = () => _sharedClock !== null;

let _ownMinutes = null;
let _raisedMinutes = 0;
export const raisedMinutes = () => _raisedMinutes;
export const ownMinutes = () => (_sharedClock ? (_ownMinutes ?? _sharedClock()) : _worldMinutes);
export function setOwnMinutes(v) {
  if (!_sharedClock) return setWorldMinutes(v);
  if (v < ownMinutes()) dropSkippedAfter(v);
  _ownMinutes = Number.isFinite(v) ? v : _sharedClock();
  return _ownMinutes;
}
export function advanceOwnMinutes(delta) {
  const d = Number(delta) || 0;
  if (d > 0) noteSkippedSpan(ownMinutes(), ownMinutes() + d);
  if (!_sharedClock) return setWorldMinutes(_worldMinutes + d);
  if (!Number.isFinite(d)) return ownMinutes();
  _ownMinutes = ownMinutes() + d;
  if (d > 0) _raisedMinutes += d;
  return _ownMinutes;
}
export const ownWalkWaiting = (entity) => !!_sharedClock && Number.isFinite(entity?.lastGameMinutes) && Math.floor(ownMinutes()) > entity.lastGameMinutes;

let _sharedWall = null;
export const sharedWallMs = (classicMinutes) => (_sharedWall && Number.isFinite(classicMinutes) ? _sharedWall(classicMinutes) : null);
export function worldSpanRealWords(eventMinutes) {
  if (!_sharedClock || !Number.isFinite(eventMinutes) || eventMinutes <= 0) return null;
  const real = Math.max(1, Math.ceil(eventMinutes / ONLINE_MINUTES_PER_MS / 60000));
  return real >= 120 ? `about ${Math.ceil(real / 60)} real hours` : `about ${real} real minute${real === 1 ? '' : 's'}`;
}
export function worldNightfallText() {
  if (!_sharedClock) return null;
  const sky = skyMinutes();
  const now = Math.floor(sky);
  if (!isDayFromMinutes(now)) return null;
  const dusk = Math.floor(now / MINUTES_PER_DAY) * MINUTES_PER_DAY + DUSK_HOUR * 60;
  const ms = _skyWall ? _skyWall(dusk) - _skyWall(sky) : (dusk - sky) / ONLINE_MINUTES_PER_MS;
  const real = Math.max(1, Math.ceil(ms / 60000));
  return `Online, resting does not move the sun. Night falls in about ${real} minute${real === 1 ? '' : 's'}.`;
}
export function ownTimeLeftText(untilMinutes) {
  if (!_sharedClock || !Number.isFinite(untilMinutes)) return null;
  const left = Math.max(0, Math.ceil(untilMinutes - ownMinutes()));
  const n = (v, unit) => `${v} ${unit}${v === 1 ? '' : 's'}`;
  const days = Math.floor(left / MINUTES_PER_DAY), hours = Math.floor((left % MINUTES_PER_DAY) / 60);
  const own = days > 0 ? n(days, 'day') + (hours > 0 ? ` ${n(hours, 'hour')}` : '') : hours > 0 ? n(hours, 'hour') : n(left % 60, 'minute');
  const playMinutes = Math.ceil(left / ONLINE_MINUTES_PER_MS / 60000);
  const play = playMinutes >= 2880 ? `${Math.ceil(playMinutes / 60)} hours`
    : playMinutes >= 60 ? `${Math.floor(playMinutes / 60)}h${playMinutes % 60 ? ` ${playMinutes % 60}m` : ''}` : `${playMinutes}m`;
  return `${own} of your time (${play} of play)`;
}
export function ownTimeLeftShort(untilMinutes) {
  if (!_sharedClock || !Number.isFinite(untilMinutes)) return null;
  const left = Math.ceil(untilMinutes - ownMinutes());
  if (left <= 0) return 'now';
  const n = (v, unit) => `${v} ${unit}${v === 1 ? '' : 's'}`;
  return left >= MINUTES_PER_DAY ? n(Math.floor(left / MINUTES_PER_DAY), 'day') : left >= 60 ? n(Math.floor(left / 60), 'hour') : n(left, 'minute');
}

export const MAX_CATCHUP_ROUNDS = 2880;

let _lastMagicRoundMinute = null;

export const worldMinutes = () => (_sharedClock ? _sharedClock() : _worldMinutes);
export const skyMinutes = () => (_sharedClock ? (_skySource ? _skySource() : _sharedClock()) : _worldMinutes);

export function setWorldMinutes(v) {
  if (_sharedClock) return _sharedClock();
  if (v < _worldMinutes) dropSkippedAfter(v);
  _worldMinutes = Number.isFinite(v) ? v : 0;
  return _worldMinutes;
}

export function alignEntityClocks(entity, nowMinutes, { worldLeft = null } = {}) {
  if (!entity || !Number.isFinite(nowMinutes)) return false;
  const now = Math.floor(nowMinutes);
  if (Number.isFinite(worldLeft) && now > Math.floor(worldLeft)) normalizeAcross(entity, Math.floor(worldLeft), now);
  if (!Number.isFinite(entity.lastGameMinutes)) entity.lastGameMinutes = Math.floor(ownMinutes());
  _sharedLastTick = _sharedClock ? nowMinutes : null;
  return true;
}

export const NORMALIZE_ACROSS_MAX = 200;
export function normalizeAcross(entity, from, to) {
  if (!entity || !Number.isFinite(from) || !Number.isFinite(to)) return 0;
  const a = Math.floor(from), b = Math.floor(to);
  if (!(b > a)) return 0;
  const n = Math.floor((b - 1) / RECOVERY_INTERVAL_MINUTES) - Math.floor((a - 1) / RECOVERY_INTERVAL_MINUTES);
  if (n <= 0 || entity.preventNormalizingReputations) return 0;
  const steps = Math.min(n, NORMALIZE_ACROSS_MAX);
  for (let k = 0; k < steps; k++) normalizeReputations(entity, entity.factionRep ?? null, { recoveryOnly: true });
  if (!entity.factionRep && Array.isArray(entity.savedFactionRep?.rep)) {
    entity.savedFactionRep = {
      ...entity.savedFactionRep,
      rep: entity.savedFactionRep.rep.map((v) => v < 0 ? Math.min(0, Math.max(-100, v + 1) + steps - 1) : v),
    };
  }
  return n;
}

export function skipDeadMinutes(entity, nowMinutes, { rolls = Math.random, say = () => {} } = {}) {
  if (!entity || !Number.isFinite(nowMinutes)) return false;
  const now = Math.floor(nowMinutes);
  const from = _sharedClock && Number.isFinite(_sharedLastTick) ? Math.floor(_sharedLastTick) : null;
  const pieces = from === null ? [] : worldArmsPieces(from, now);
  if (_sharedClock) _sharedLastTick = nowMinutes;
  entity.preventEnemySpawns = true;
  for (const [s, e] of pieces) {
    runDayChange({ entity, lastMinutes: s, nowMinutes: e, rolls, say, arms: DAY_ARMS.world });
    runCalendarArms(entity, s, e, { rolls, arms: DAY_ARMS.world });
  }
  if (from !== null) rollWorldZonesAcross(from, now);
  return true;
}

export function resetMagicRoundMarker(v = null) {
  _lastMagicRoundMinute = v === null || !Number.isFinite(Number(v)) ? null : Math.floor(Number(v));
  resetSyntheticTimeIncrease();
  return _lastMagicRoundMinute;
}

export function advanceWorldMinutes(delta) {
  if (_sharedClock) return _sharedClock();
  return setWorldMinutes(_worldMinutes + (Number(delta) || 0));
}

export const worldClockAdvances = () => !_sharedClock;
