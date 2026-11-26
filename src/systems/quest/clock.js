import { QuestResource, matchFirst } from './questResource.js';
import { calculateTravelTime } from '../../travel/travel.js';
import { worldCoordToMapPixel } from '../../formats/mapsFile.js';
import { Symbol as QuestSymbol } from './symbol.js';
import { parseInt as questParseInt } from './parseUtils.js';
import { raisedSince } from './questStamps.js';

const DECL = /(Clock|clock) (?<symbol>[a-zA-Z0-9_.-]+)/;
// The dd.hh:mm separator is an unescaped dot (any character), as in the classic parser.
const OPTIONS = /(?<ddhhmm>\d+.\d+:\d+)|(?<hhmm>\d+:\d+)|(?<mm>\d+)|flag (?<flag>\d+)|range (?<minRange>\d+) (?<maxRange>\d+)/g;
const TIME_VALUE = [
  /(?<days>\d+).(?<hours>\d+):(?<minutes>\d+)/,
  /(?<h2>\d+):(?<m2>\d+)/,
  /(?<m3>\d+)/,
];

const getTimeInSeconds = (days, hours, minutes) => days * 86400 + hours * 3600 + minutes * 60;

const wholeSeconds = (caller) => Math.floor(caller?.nowSeconds?.() ?? 0);

export function travelTimeSeconds(quest, place = null, returnTrip = true) {
  const world = quest?.hooks?.world;
  if (!world) return null;
  if (place === null) {
    const places = [...quest.resources.values()].filter((r) => r.isPlace);
    if (!places.length) {
      console.warn('[quest] Clock wants a travel time but quest has no Place resources.');
      return 0;
    }
    let total = 0;
    for (const p of places) total += travelTimeSeconds(quest, p, false) ?? 0;
    if (returnTrip) total = Math.trunc(total * 2.5);
    return total;
  }
  const sd = place.siteDetails;
  const location = sd ? world.maps.getLocationByName(sd.regionName, sd.locationName) : null;
  if (!location) {
    console.warn(`[quest] Could not find Quest Place ${sd?.regionName}/${sd?.locationName}`);
    return 0;
  }
  const endPos = worldCoordToMapPixel(location.exterior.recordElement.header.x, location.exterior.recordElement.header.y);
  const { minutes } = calculateTravelTime(world.playerPixel(), endPos,
    { speedCautious: true, sleepModeInn: false, travelShip: false, hasHorse: false, hasCart: true },
    (x, y) => world.maps.getClimateIndex(x, y));
  let travelTimeMinutes = minutes;
  if (returnTrip) travelTimeMinutes = Math.trunc(travelTimeMinutes * 2.5);
  if (travelTimeMinutes < 1440) travelTimeMinutes = 1440;
  return getTimeInSeconds(0, 0, travelTimeMinutes);
}

export function matchTimeValue(text) {
  const m = matchFirst(text, TIME_VALUE);
  if (!m) return 0;
  const g = m.groups;
  const days = questParseInt(g.days ?? '');
  const hours = questParseInt(g.hours ?? g.h2 ?? '');
  const minutes = questParseInt(g.minutes ?? g.m2 ?? g.m3 ?? '');
  return getTimeInSeconds(days, hours, minutes);
}

// The most world seconds one played frame charges a quest clock online; a longer gap is time away, not charged.
export const PLAYED_STEP_MAX_SECONDS = 30 * 60;

// True when the end of the clock can change anything: its task runs actions, or another task or condition reads it.
export function clockCounts(quest, clock) {
  const name = clock?.symbol?.name;
  const task = name ? quest?.tasks?.get(name) : null;
  if (!task) return false;
  if (task.actions.some((a) => !a.isTriggerCondition) || task.pendingActionLines?.length) return true;
  for (const t of quest.tasks.values()) {
    if (t.targetSymbol?.name === name) return true;
    for (const a of t.actions) if (a.evaluations?.some((e) => new QuestSymbol(e.task).name === name)) return true;
  }
  return false;
}

export const ONLINE_DELAY_SECONDS = 24 * 60;
const PROGRESS = new Set(['GivePc', 'TrainPc', 'StartQuest', 'GetItem']);
const NEGATED = new Set(['whenNot', 'andNot', 'orNot']);

// Clocks a task starts are not followed; each clock is read on its own. With alone, a condition is followed only
// when the end by itself satisfies it, and live also counts the tasks set now.
function reached(quest, name, { conditional = true, alone = false, live = false } = {}) {
  const seen = new Set([name]);
  const queue = [name];
  const types = new Set();
  let lowers = false, settles = false;
  const visit = (next) => { if (next && !seen.has(next)) { seen.add(next); queue.push(next); } };
  while (queue.length) {
    const n = queue.shift();
    for (const a of quest.tasks.get(n)?.actions ?? []) {
      if (a.isTriggerCondition) continue;
      const type = a.constructor?.typeName;
      if (type) types.add(type);
      if ((type === 'ChangeReputeWith' || type === 'LegalRepute') && Number(a.amount) < 0) lowers = true;
      if ((type === 'GivePc' && (a.isNothing || (!a.textId && !a.silently))) || type === 'TrainPc' || type === 'StartQuest') settles = true;
      if (type === 'StartTask') visit(a.taskSymbol?.name);
    }
    if (!conditional) continue;
    for (const [tn, t] of quest.tasks) {
      if (seen.has(tn)) continue;
      const reader = t.actions.find((a) => a.isTriggerCondition && a.evaluations?.some((e) => !NEGATED.has(e.op) && new QuestSymbol(e.task).name === n));
      if (!reader) continue;
      const isSet = (sym) => seen.has(sym.name) || (live && !!quest.tasks.get(sym.name)?.getTriggerValue?.());
      if (alone && !reader._checkEvals?.call({ evaluations: reader.evaluations, _isTaskSet: isSet })) continue;
      visit(tn);
    }
  }
  return { types, lowers, settles };
}

// A clock is a deadline when its end lowers a standing, ends the quest with no progress by itself, or shuts a
// reward that a negated reader pays. Everything else is a delay, which online waits at most ONLINE_DELAY_SECONDS.
function readsAsDeadline(quest, name) {
  if (reached(quest, name, { conditional: false }).lowers) return true;
  const alone = reached(quest, name, { alone: true }).types;
  if (alone.has('EndQuest') && ![...PROGRESS].some((t) => alone.has(t))) return true;
  for (const [tn, t] of quest.tasks) {
    if (!t.actions.some((a) => a.isTriggerCondition && a.evaluations?.some((e) => NEGATED.has(e.op) && new QuestSymbol(e.task).name === name))) continue;
    if (reached(quest, tn, { conditional: false }).settles) return true;
  }
  return false;
}

function startersOf(quest, name) {
  const out = [];
  for (const [tn, t] of quest.tasks) {
    // Numeric task names are the start-up block, which starts lifetime clocks rather than closings.
    if (/^\d+$/.test(tn)) continue;
    if (t.actions.some((a) => a.constructor?.typeName === 'StartStopTimer' && a.isStartTimer && a.targetSymbol?.name === name)) out.push(tn);
  }
  return out;
}

// A clock started by a task that settles the quest, or by a deadline running out, only closes the quest afterward.
function closes(quest, name) {
  for (const tn of startersOf(quest, name)) {
    if (reached(quest, tn, { conditional: false }).settles) return true;
    if (tn !== name && quest.resources?.get?.(tn)?.isClock && readsAsDeadline(quest, tn)) return true;
  }
  return false;
}

const QUIET_CLOSE = new Set(['EndQuest', 'MakePermanent', 'DropAsQuestor']);

// True for a start-up clock whose end only closes the quest quietly; isDeadline drops it once the quest succeeds.
function closesStartUp(quest, name) {
  const startUp = [...(quest.tasks?.keys() ?? [])].filter((tn) => /^\d+$/.test(tn));
  const starts = (tn) => quest.tasks.get(tn)?.actions.some((a) => a.constructor?.typeName === 'StartStopTimer' && a.isStartTimer && a.targetSymbol?.name === name);
  if (!startUp.some(starts)) return false;
  if (startUp.some((tn) => reached(quest, tn, { conditional: false }).settles)) return false;
  const end = reached(quest, name, { alone: true, live: true });
  return end.types.has('EndQuest') && !end.lowers && [...end.types].every((t) => QUIET_CLOSE.has(t));
}

export function clockIsDeadline(quest, clock) {
  const name = clock?.symbol?.name;
  if (!name || !quest?.tasks) return false;
  return readsAsDeadline(quest, name) && !closes(quest, name);
}

export function waveIsAwaited(quest, foeName) {
  if (!foeName || !quest?.tasks) return false;
  for (const [tn, t] of quest.tasks) {
    if (!t.actions.some((a) => a.isTriggerCondition && a.constructor?.typeName === 'KilledFoe' && a.foeSymbol?.name === foeName)) continue;
    const r = reached(quest, tn);
    if (r.settles || r.types.has('Prompt')) return true;
  }
  return false;
}

// Clocks the reading calls delays whose text sets a time limit or whose end sends a penalty. An entry here stays a
// deadline through the quest's success.
export const ONLINE_DEADLINES = Object.freeze({
  $CUREWER: Object.freeze(['huntstart']),
  $CUREVAM: Object.freeze(['huntstart']),
  U0C00Y00: Object.freeze(['escapetime']),
  M0B11Y18: Object.freeze(['S.05']),
  _BRISIEN: Object.freeze(['remindpc']),
  N0B00Y17: Object.freeze(['time2']),
  K0C30Y03: Object.freeze(['S.13']),
  B0B81Y02: Object.freeze(['S.30']),
  S0000011: Object.freeze(['S.01']),
  O0B00Y12: Object.freeze(['S.01']),
  K0C00Y07: Object.freeze(['2ransom']),
  B0B71Y03: Object.freeze(['finddaughter']),
  N0B20Y02: Object.freeze(['S.12']),
});

export const questWaitsShort = (quest) => !!quest?.hooks?.sharedClock?.();

// Flag 16, or flag 1 with a range and a zero time, arms the travel time; restores reuse this for older saves.
const travelArmed = (flag, maxRange, seconds) => (flag & 16) === 16 || ((flag & 1) === 1 && maxRange > 0 && seconds === 0);

export class Clock extends QuestResource {
  constructor(parentQuest, line = null) {
    super(parentQuest);
    this.flag = 0;
    this.minRange = 0;
    this.maxRange = 0;
    this.startingTimeInSeconds = 0;
    this.remainingTimeInSeconds = 0;
    this.clockEnabled = false;
    this.clockFinished = false;
    this._lastWorldTimeSample = 0;
    this._lastRaisedSample = null;
    this.travelTimePending = false;
    this._deadline = null;
    this._closesOnSuccess = false;
    this.declaredAtOnce = false;
    this.startedAfterSuccess = false;
    if (line !== null) this.setResource(line);
  }

  setResource(line) {
    super.setResource(line);
    const match = DECL.exec(line);
    if (!match) return;
    this.symbol = new QuestSymbol(match.groups.symbol);
    const optionsLine = line.slice(match.index + match[0].length);

    let timeValue0 = -1, timeValue1 = -1, currentTimeValue = 0;
    for (const option of optionsLine.matchAll(OPTIONS)) {
      const g = option.groups;
      if (g.ddhhmm != null || g.hhmm != null || g.mm != null) {
        const timeValue = matchTimeValue(option[0]);
        if (currentTimeValue === 0) { timeValue0 = timeValue; currentTimeValue++; }
        else if (currentTimeValue === 1) { timeValue1 = timeValue; currentTimeValue++; }
        else throw new Error('Clock cannot specify more than 2 time values.');
      }
      if (g.flag != null) this.flag = questParseInt(g.flag);
      if (g.minRange != null) this.minRange = questParseInt(g.minRange);
      if (g.maxRange != null) this.maxRange = questParseInt(g.maxRange);
    }

    const roll = this.parentQuest?.rolls ?? Math.random;
    const fromRange = (min, max) => min + Math.floor(roll() * (max + 1 - min));

    // A clock declared at an explicit zero with no travel arm means at once and is not a deadline, unless
    // ONLINE_DEADLINES names it or its symbol starts with `_2`.
    this.declaredAtOnce = (currentTimeValue === 1 && timeValue0 === 0) || (currentTimeValue === 2 && timeValue0 === 0 && timeValue1 <= 0);
    let clockTimeInSeconds = 0;
    if (currentTimeValue === 0) {
      clockTimeInSeconds = fromRange(getTimeInSeconds(0, 0, 1), getTimeInSeconds(7, 0, 0));
    } else if (currentTimeValue === 1) {
      clockTimeInSeconds = timeValue0;
    } else if (currentTimeValue === 2) {
      clockTimeInSeconds = timeValue1 > timeValue0 ? fromRange(timeValue0, timeValue1) : timeValue0;
    }

    if (travelArmed(this.flag, this.maxRange, clockTimeInSeconds)) {
      this.declaredAtOnce = false;
      const travel = this.parentQuest?.travelSeconds?.();
      if (travel != null) clockTimeInSeconds = travel;
      else { this.travelTimePending = true; clockTimeInSeconds = 0; }
    }

    this.startingTimeInSeconds = clockTimeInSeconds;
    this.remainingTimeInSeconds = clockTimeInSeconds;
  }

  get isClock() { return true; }

  // The script reading is cached; the success checks run on every call because the quest's success changes later.
  get isDeadline() {
    const q = this.parentQuest;
    if (this._deadline == null) {
      const name = this.symbol?.name;
      const atOnce = this.declaredAtOnce && !/^_2.*_$/.test(this.symbol?.original ?? '');
      this._deadline = (ONLINE_DEADLINES[q?.questName] ?? []).includes(name)
        || (!atOnce && clockIsDeadline(q, this));
      this._closesOnSuccess = this._deadline && !(ONLINE_DEADLINES[q?.questName] ?? []).includes(name)
        && !!q?.tasks && startersOf(q, name).length > 0;
    }
    if (this._deadline && !this._closesOnSuccess && q?.questSuccess
      && !(ONLINE_DEADLINES[q?.questName] ?? []).includes(this.symbol?.name) && closesStartUp(q, this.symbol?.name)) return false;
    return this._deadline && !(this._closesOnSuccess && q?.questSuccess && !this.startedAfterSuccess);
  }

  get waitsShort() { return questWaitsShort(this.parentQuest) && !this.isDeadline; }

  expandMacro(macroType) {
    if (macroType !== 5) return false;
    if (this.waitsShort) return 'a few';
    const secs = this.parentQuest?.hooks?.world?.showClocksAsCountdown?.()
      ? this.remainingTimeInSeconds : this.startingTimeInSeconds;
    return String(Math.ceil(secs / 86400));
  }

  // Online only the lived step is charged, never raised time. tick and liveRemainingSeconds must share this charge.
  chargeSeconds(caller) {
    const now = wholeSeconds(caller);
    const step = caller.questClockStepMax?.() ?? Infinity;
    const raw = now - this._lastWorldTimeSample;
    if (!Number.isFinite(step)) return Math.trunc(raw);
    const raised = raisedSince(caller.raisedSeconds?.(), this._lastRaisedSample);
    return Math.trunc(Math.min(Math.max(raw - raised, 0), step));
  }

  liveRemainingSeconds(caller) {
    if (!this.clockEnabled || this.clockFinished) return this.remainingTimeInSeconds;
    if (this.waitsShort) return Math.max(0, Math.min(this.remainingTimeInSeconds, ONLINE_DELAY_SECONDS) - this.chargeSeconds(caller));
    return Math.max(0, this.remainingTimeInSeconds - this.chargeSeconds(caller));
  }

  tick(caller) {
    if (!this.clockEnabled || this.clockFinished) return;
    const now = wholeSeconds(caller);
    if (this.waitsShort) this.remainingTimeInSeconds = Math.min(this.remainingTimeInSeconds, ONLINE_DELAY_SECONDS);
    this.remainingTimeInSeconds -= this.chargeSeconds(caller);
    if (this.remainingTimeInSeconds <= 0) {
      this._triggerTask(caller);
      this.clockEnabled = false;
      this.clockFinished = true;
      this.remainingTimeInSeconds = 0;
    }
    this._lastWorldTimeSample = now;
    this._lastRaisedSample = caller.raisedSeconds?.() ?? null;
  }

  startTimer() {
    if (this.clockEnabled) return;
    if (this.symbol.original.startsWith('_2') && this.symbol.original.endsWith('_') && this.startingTimeInSeconds === 0) {
      const inner = this.symbol.original.slice(2, -1);
      const targetPlace = this.parentQuest.getPlace?.(new QuestSymbol(inner));
      if (targetPlace) {
        const travel = this.parentQuest.travelSecondsTo?.(targetPlace);
        if (travel != null) {
          this.startingTimeInSeconds = travel;
          this.remainingTimeInSeconds = travel;
        } else {
          this.travelTimePending = true;
        }
      }
    }
    // A travel clock with no travel time yet stays held; armed at zero it would end the quest on the first tick.
    if (this.travelTimePending && this.startingTimeInSeconds === 0) {
      console.warn(`[quest] clock ${this.symbol?.name}: travel-time arm pends Q3; timer held`);
      return;
    }
    if (!this.clockFinished) {
      this.clockEnabled = true;
      this.startedAfterSuccess = !!this.parentQuest?.questSuccess;
      this._lastWorldTimeSample = wholeSeconds(this.parentQuest);
      this._lastRaisedSample = this.parentQuest.raisedSeconds?.() ?? null;
    }
  }

  stopTimer() {
    if (!this.clockFinished) this.clockEnabled = false;
  }

  _triggerTask(caller) {
    const task = caller.getTask(this.symbol);
    if (task) task.start();
    else console.warn(`[quest] Clock timer ${this.symbol.name} completed but could not find a task with same name.`);
  }

  getSaveData() {
    return {
      lastWorldTimeSample: this._lastWorldTimeSample,
      startingTimeInSeconds: this.startingTimeInSeconds,
      remainingTimeInSeconds: this.remainingTimeInSeconds,
      flag: this.flag,
      minRange: this.minRange,
      maxRange: this.maxRange,
      clockEnabled: this.clockEnabled,
      clockFinished: this.clockFinished,
      startedAfterSuccess: this.startedAfterSuccess,
      declaredAtOnce: this.declaredAtOnce,
    };
  }

  restoreSaveData(dataIn) {
    if (dataIn == null) return;
    this._lastWorldTimeSample = Number.isFinite(dataIn.lastWorldTimeSample) ? dataIn.lastWorldTimeSample : wholeSeconds(this.parentQuest);
    // A restore is a resume, so raised time from before it is never charged.
    this._lastRaisedSample = this.parentQuest?.raisedSeconds?.() ?? null;
    this.startingTimeInSeconds = dataIn.startingTimeInSeconds;
    this.remainingTimeInSeconds = dataIn.remainingTimeInSeconds;
    this.flag = dataIn.flag;
    this.minRange = dataIn.minRange;
    this.maxRange = dataIn.maxRange;
    this.clockEnabled = dataIn.clockEnabled;
    this.clockFinished = dataIn.clockFinished;
    this.startedAfterSuccess = dataIn.startedAfterSuccess === true;
    this.declaredAtOnce = typeof dataIn.declaredAtOnce === 'boolean' ? dataIn.declaredAtOnce
      : this.startingTimeInSeconds === 0 && !travelArmed(this.flag, this.maxRange, 0);
    this.travelTimePending = false;
  }
}
