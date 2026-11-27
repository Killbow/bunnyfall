// The four Quest Actions Extension actions the Foraging quests use: raise time, reduce player fatigue, player
// possesses, and player handsover. One departure: handsover takes the wagon's share from the wagon, where the
// original searched the pack twice.

import { ActionTemplate } from './actions.js';
import { ITEM_GROUPS } from '../../characters/equipRules.js';
import { isSummoned } from '../../items/inventory.js';
import { maxFatigue } from '../../characters/statMods.js';
import { raiseTimeSeconds, reduceFatigueBy } from '../../professions/foragingLaw.js';

const GROUP_NAME_OF = Object.freeze(Object.fromEntries(Object.entries(ITEM_GROUPS).map(([name, n]) => [n, name])));

// .NET Regex.Match over an alternation takes the leftmost match position, then the first alternative there.
// Patterns stay split into alternatives because a JS pattern may not repeat a group name.
function matchAlternatives(alternatives, source) {
  let best = null;
  alternatives.forEach((re, i) => {
    const m = re.exec(source);
    if (m && (!best || m.index < best.m.index)) best = { m, i };
  });
  return best;
}

function searchNonQuest(list, itemClass, itemSubClass) {
  const group = GROUP_NAME_OF[itemClass];
  return (list ?? []).filter((it) => it && it.group === group && it.templateIndex === itemSubClass && !it.questItem);
}
export function lengthOrStackCount(items) {
  let count = 0;
  for (const it of items ?? []) if (!isSummoned(it)) count += (it.stackCount ?? 1) > 1 ? it.stackCount : 1;
  return count;
}
function removeNFromList(storage, items, amount) {
  let removed = 0;
  for (const it of items) {
    if (removed >= amount) break;
    const stack = it.stackCount ?? 1;
    if (stack > 1) {
      if (stack <= amount - removed) {
        const at = storage.indexOf(it);
        if (at >= 0) storage.splice(at, 1);
        removed += stack;
      } else {
        it.stackCount = stack - (amount - removed);
        removed = amount;
      }
    } else {
      const at = storage.indexOf(it);
      if (at >= 0) storage.splice(at, 1);
      removed += 1;
    }
  }
}

function heldCounts(entity, itemClass, itemSubClass) {
  const pack = searchNonQuest(entity?.items, itemClass, itemSubClass);
  const wagon = searchNonQuest(entity?.wagonItems, itemClass, itemSubClass);
  return { pack, wagon, inPack: lengthOrStackCount(pack), inWagon: lengthOrStackCount(wagon) };
}

const RAISE_TIME = Object.freeze([
  // RaiseTime.cs lacks a `|` between its second and third lines, so its pattern has three alternatives, not four.
  /raise time to (?<hoursTo>\d+):(?<minutesTo>\d+) saying (?<sayingID>\d+)/,
  /raise time to (?<hoursTo>\d+):(?<minutesTo>\d+)raise time by (?<hours>\d+):(?<minutes>\d+) saying (?<sayingID>\d+)/,
  /raise time by (?<hours>\d+):(?<minutes>\d+)/,
]);

export class RaiseTime extends ActionTemplate {
  static typeName = 'RaiseTime';
  get saveShape() { return [['hours'], ['minutes'], ['hoursTo'], ['minutesTo'], ['sayingID']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.hours = 0; this.minutes = 0; this.hoursTo = 0; this.minutesTo = 0; this.sayingID = 0;
  }
  get pattern() { return RAISE_TIME[2]; }
  test(source) { return matchAlternatives(RAISE_TIME, source)?.m ?? null; }
  createNew(source, parentQuest) {
    const m = this.test(source);
    if (!m) return null;
    const g = m.groups ?? {};
    const a = new RaiseTime(parentQuest);
    a.hours = g.hours != null ? Math.max(Number(g.hours), 0) : 0;
    a.minutes = g.minutes != null ? Math.max(Number(g.minutes), 0) : 0;
    a.hoursTo = g.hoursTo != null ? Math.min(Math.max(Number(g.hoursTo), 0), 23) : 0;
    a.minutesTo = g.minutesTo != null ? Math.min(Math.max(Number(g.minutesTo), 0), 59) : 0;
    a.sayingID = g.sayingID != null ? Number(g.sayingID) : 0;
    if (a.hours + a.minutes + a.hoursTo + a.minutesTo === 0) return null;
    return a;
  }
  update(_caller) {
    const hooks = this.parentQuest?.hooks;
    let seconds = 0;
    if (this.minutes + this.hours > 0) {
      seconds = raiseTimeSeconds(this.hours, this.minutes);
    } else if (this.minutesTo + this.hoursTo > 0) {
      const now = Math.floor(((hooks?.skySeconds ?? hooks?.nowSeconds)?.() ?? 0) / 60);
      const current = 60 * (now % 60) + 3600 * (Math.floor(now / 60) % 24);
      const desired = 60 * this.minutesTo + 3600 * this.hoursTo;
      seconds = desired >= current ? desired - current : desired - current + 86400;
    }
    // Online the shared clock cannot move, so the host waits instead; the character's clock advances either way.
    if (seconds > 0) {
      if (hooks?.sharedClock?.()) hooks?.waitOnline?.(seconds, this.parentQuest);
      hooks?.raiseTime?.(seconds);
    }
    if (this.sayingID > 0) this.parentQuest.showMessagePopup(this.sayingID);
    this.setComplete();
  }
}

const REDUCE_FATIGUE = Object.freeze([/reduce player fatigue by (?<percent>\d+)/, /reduce player fatigue on (?<amount>\d+)/]);

export class ReducePlayerFatigue extends ActionTemplate {
  static typeName = 'ReducePlayerFatigue';
  get saveShape() { return [['percent'], ['amount']]; }
  constructor(parentQuest) { super(parentQuest); this.percent = 0; this.amount = 0; }
  get pattern() { return REDUCE_FATIGUE[0]; }
  test(source) { return matchAlternatives(REDUCE_FATIGUE, source)?.m ?? null; }
  createNew(source, parentQuest) {
    const m = this.test(source);
    if (!m) return null;
    const a = new ReducePlayerFatigue(parentQuest);
    a.percent = m.groups?.percent != null ? Number(m.groups.percent) : 0;
    a.amount = m.groups?.amount != null ? Number(m.groups.amount) : 0;
    return a;
  }
  update(_caller) {
    const e = this.parentQuest?.hooks?.playerEntity?.();
    if (e) {
      const current = e.fatigue ?? 0;
      let fatigue = 0;
      if (this.percent > 0) fatigue = reduceFatigueBy(current, maxFatigue(e), this.percent);
      if (this.amount > 0) fatigue = current - this.amount;
      e.fatigue = Math.min(maxFatigue(e), Math.max(1, fatigue));
    }
    this.setComplete();
  }
}

const POSSESSES = /player possesses (?<numberOfItems>\d+) items class (?<itemClass>\d+) subclass (?<itemSubClass>\d+)/;
const HANDSOVER = /player handsover (?<numberOfItems>\d+) items class (?<itemClass>\d+) subclass (?<itemSubClass>\d+)/;
const itemFields = (a, m) => {
  a.numberOfItems = Number(m.groups.numberOfItems);
  a.itemClass = Number(m.groups.itemClass);
  a.itemSubClass = Number(m.groups.itemSubClass);
  return a;
};

export class PlayerPossesses extends ActionTemplate {
  static typeName = 'PlayerPossesses';
  get saveShape() { return [['numberOfItems'], ['itemClass'], ['itemSubClass']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.isTriggerCondition = true;
    this.isAlwaysOnTriggerCondition = true;
    this.numberOfItems = 0; this.itemClass = 0; this.itemSubClass = 0;
  }
  get pattern() { return POSSESSES; }
  createNew(source, parentQuest) {
    const m = this.test(source);
    return m ? itemFields(new PlayerPossesses(parentQuest), m) : null;
  }
  checkTrigger(_caller) {
    const e = this.parentQuest?.hooks?.playerEntity?.();
    if (!e) return false;
    const { inPack, inWagon } = heldCounts(e, this.itemClass, this.itemSubClass);
    return inPack + inWagon >= this.numberOfItems;
  }
}

export class PlayerHandsover extends ActionTemplate {
  static typeName = 'PlayerHandsover';
  get saveShape() { return [['numberOfItems'], ['itemClass'], ['itemSubClass']]; }
  constructor(parentQuest) { super(parentQuest); this.numberOfItems = 0; this.itemClass = 0; this.itemSubClass = 0; }
  get pattern() { return HANDSOVER; }
  createNew(source, parentQuest) {
    const m = this.test(source);
    return m ? itemFields(new PlayerHandsover(parentQuest), m) : null;
  }
  update(_caller) {
    const e = this.parentQuest?.hooks?.playerEntity?.();
    if (!e) return;
    const { pack, wagon, inPack, inWagon } = heldCounts(e, this.itemClass, this.itemSubClass);
    if (inPack + inWagon < this.numberOfItems) return;
    const fromPack = Math.min(this.numberOfItems, inPack);
    const fromWagon = this.numberOfItems - fromPack;
    if (fromPack > 0) removeNFromList(e.items, pack, fromPack);
    if (fromWagon > 0) removeNFromList(e.wagonItems, wagon, fromWagon);
    this.setComplete();
  }
}

export const questActionsExtensionTemplates = () => [new RaiseTime(null), new ReducePlayerFatigue(null), new PlayerPossesses(null), new PlayerHandsover(null)];
