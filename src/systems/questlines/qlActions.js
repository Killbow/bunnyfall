// @ts-check
import { ActionTemplate } from '../quest/actions.js';
import { Symbol as QuestSymbol } from '../quest/symbol.js';
import { GENDERS } from '../../characters/nameHelper.js';
import { isClassEnemyId } from '../../characters/enemyBasics.js';
import { isStamped, isEnding } from './qlLaw.js';
import { sheetFor } from './qlSheets.js';
import { addIntoQuestTables } from '../quest/tables.js';

const SYMBOL = '[a-zA-Z0-9_.]+';

export const ASK_AGAIN_TICKS = 300;

// Latches are keyed by quest, task, and index (a party resync rebuilds every action) and are not saved.
const held = new WeakMap();
const UP = -1;
const heldOf = (quest) => { let m = held.get(quest); if (!m) held.set(quest, (m = new Map())); return m; };

// A received copy synced with a party asks nothing while its sharer is present; the choice comes on the resync.
const awaitsSharer = (quest) => quest?.ql?.received === true && !!quest.hooks?.sharedCopy?.(quest)
  && (quest.hooks?.partySize?.() ?? quest.hooks?.rewardShares?.(quest) ?? 1) > 1 && quest.hooks?.sharerHere?.(quest) !== false;

export class QlAsk extends ActionTemplate {
  static typeName = 'QlAsk';
  get saveShape() { return [['id'], ['choiceIds'], ['choiceTasks', 'symArray']]; }
  constructor(parentQuest) {
    super(parentQuest);
    // As with PromptMulti, an answered ask never re-arms when its task is cleared and set again.
    this.allowRearm = false;
    this.reported = false;
    this.id = 0;
    /** @type {number[]} */
    this.choiceIds = [];
    /** @type {any[]} */
    this.choiceTasks = [];
  }
  get pattern() { return new RegExp(`^\\s*ask (?<id>\\d+) choices (?<rest>(?:\\d+ ${SYMBOL}\\s*){2,4})$`); }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const words = match.groups.rest.trim().split(/\s+/);
    if (words.length % 2 !== 0) return null;
    const action = new QlAsk(parentQuest);
    action.id = Number.parseInt(match.groups.id, 10);
    for (let i = 0; i < words.length; i += 2) {
      action.choiceIds.push(Number.parseInt(words[i], 10));
      action.choiceTasks.push(new QuestSymbol(words[i + 1]));
    }
    return action;
  }
  update(caller) {
    const quest = this.parentQuest;
    const task = caller?.symbol ?? null, at = caller?.actions?.indexOf?.(this) ?? -1;
    const key = `${task?.name ?? ''}#${at}`, latch = heldOf(quest), was = latch.get(key);
    if (was === UP) return;
    if (was > 0) { latch.set(key, was - 1); return; }
    if (awaitsSharer(quest)) return;
    const message = quest.getMessage(this.id) ?? null;
    const offered = this.choiceIds.map((id, i) => ({ id, task: this.choiceTasks[i], message: quest.getMessage(id) ?? null }));
    const choices = offered.filter((c) => c.message);
    if (!this.reported && (!message || choices.length < offered.length)) {
      this.reported = true;
      const missing = [...(message ? [] : [this.id]), ...offered.filter((c) => !c.message).map((c) => c.id)];
      console.error(`[questlines] ${quest.questName}: ask ${this.id} names a message the quest does not have (${missing.join(', ')}) - ${choices.length ? 'asked with what it has' : 'nothing to ask: it waits, unanswered'}`);
    }
    if (!choices.length) return;
    latch.set(key, UP);
    quest.hooks?.showChoice?.(quest, message, choices.map((c) => c.message), (index) => {
      if (latch.get(key) === UP) latch.delete(key);
      const chosen = Number.isInteger(index) ? choices[index] : null;
      if (!chosen) { latch.set(key, ASK_AGAIN_TICKS); return; }
      // The answer goes to the ask now in this place (a resync may rebuild it), and only while no choice is set.
      const live = task ? quest.getTask?.(task)?.actions?.[at] : this;
      if (!(live instanceof QlAsk) || live.id !== this.id || live.isComplete || isEnding(quest) || quest.questTombstoned
        || live.choiceTasks.some((s) => quest.getTask?.(s)?.getTriggerValue?.())) return;
      live.setComplete();
      quest.startTask(chosen.task);
    });
  }
}

export class QlOutcome extends ActionTemplate {
  static typeName = 'QlOutcome';
  constructor(parentQuest) {
    super(parentQuest);
    /** @type {any} */
    this.outcomeSymbol = null;
  }
  get saveShape() { return [['outcomeSymbol', 'sym']]; }
  get pattern() { return new RegExp(`^\\s*outcome (?<name>${SYMBOL})\\s*$`); }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new QlOutcome(parentQuest);
    action.outcomeSymbol = new QuestSymbol(match.groups.name);
    return action;
  }
  update(_caller) {
    const quest = this.parentQuest, name = this.outcomeSymbol?.name;
    if (isStamped(quest) && !quest.ql.outcome && name) {
      const sheet = sheetFor(quest.questName);
      if (!sheet || (sheet.outcomes ?? []).some((o) => o.id === name)) quest.ql.outcome = name;
      else console.warn(`[questlines] ${quest.questName}: outcome ${name} is not one its sheet has - left to the sheet's bindings`);
    }
    this.setComplete();
  }
}

export class QlAct extends ActionTemplate {
  static typeName = 'QlAct';
  get saveShape() { return [['kind'], ['count'], ['from']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.isTriggerCondition = true;
    this.kind = '';
    this.count = 1;
    /** @type {number|null} */
    this.from = null;
  }
  get pattern() { return /^\s*ql act (?<kind>[a-z][a-z0-9-]{0,39}) (?<n>\d+)\s*$/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new QlAct(parentQuest);
    action.kind = match.groups.kind;
    action.count = Math.max(1, Number.parseInt(match.groups.n, 10));
    return action;
  }
  checkTrigger(_caller) {
    const quest = this.parentQuest;
    if (!isStamped(quest)) return false;
    const heard = quest.ql.acts?.[this.kind] ?? 0;
    if (this.from == null) this.from = heard;
    return heard - this.from >= this.count;
  }
}

export class QlPaid extends ActionTemplate {
  static typeName = 'QlPaid';
  get pattern() { return /^\s*ql paid\s*$/; }
  createNew(source, parentQuest) {
    return this.test(source) ? new QlPaid(parentQuest) : null;
  }
  update(_caller) {
    const quest = this.parentQuest;
    quest.hooks?.questReward?.(quest, null);
    quest.questSuccess = true;
    this.setComplete();
  }
}

export class QlName extends ActionTemplate {
  static typeName = 'QlName';
  constructor(parentQuest) {
    super(parentQuest);
    /** @type {any} */
    this.personSymbol = null;
    this.given = '';
    this.gender = '';
  }
  get saveShape() { return [['personSymbol', 'sym'], ['given'], ['gender']]; }
  get pattern() { return /^\s*ql name (?<sym>_[a-zA-Z0-9_.]+_) (?<given>[A-Za-z][A-Za-z'_-]{0,47})(?: (?<gender>female|male))?\s*$/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new QlName(parentQuest);
    action.personSymbol = new QuestSymbol(match.groups.sym);
    action.given = match.groups.given.replace(/_/g, ' ');
    action.gender = match.groups.gender ?? '';
    return action;
  }
  update(_caller) {
    const sym = this.personSymbol?.original ?? this.personSymbol?.name;
    const person = this.parentQuest.getPerson?.(this.personSymbol);
    const foe = person ? null : this.parentQuest.getFoe?.(this.personSymbol) ?? null;
    if (person) person.displayName = this.given;
    if (foe) {
      foe.displayName = this.given;
      foe.namePending = false;
      if (this.gender && isClassEnemyId(foe.foeType)) foe.humanoidGender = this.gender === 'female' ? GENDERS.Female : GENDERS.Male;
    }
    if (!person && !foe) console.warn(`[questlines] ql name: no person ${sym}`);
    else if (this.gender && !(foe && isClassEnemyId(foe.foeType))) console.warn(`[questlines] ql name: ${sym} takes no gender here`);
    this.setComplete();
  }
}

export class QlGone extends ActionTemplate {
  static typeName = 'QlGone';
  constructor(parentQuest) {
    super(parentQuest);
    this.isTriggerCondition = true;
    /** @type {any[]} */
    this.foeSymbols = [];
    this.seen = false;
  }
  get saveShape() { return [['foeSymbols', 'symArray'], ['seen']]; }
  get pattern() { return /^\s*ql gone((?: _[a-zA-Z0-9_.]+_){1,4})\s*$/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new QlGone(parentQuest);
    action.foeSymbols = match[1].trim().split(/\s+/).map((s) => new QuestSymbol(s));
    return action;
  }
  checkTrigger(_caller) {
    const quest = this.parentQuest;
    const stands = quest?.hooks?.questFoeStands;
    const foes = this.foeSymbols.map((s) => quest?.getFoe?.(s)).filter(Boolean);
    if (typeof stands !== 'function' || !foes.length) return false;
    if (foes.some((f) => stands(quest, f))) { this.seen = true; return false; }
    if (!this.seen || foes[0].killCount >= Math.max(1, foes[0].spawnCount)) return false;
    this.seen = false;
    return true;
  }
}

export const QL_PLACE_ROWS = Object.freeze(['templeArkay,        0, 14, 21']);
addIntoQuestTables({ places: QL_PLACE_ROWS.map((line) => ({ line, unlessKey: line.split(',')[0].trim() })) });

export const questlineActionTemplates = () => [new QlAsk(null), new QlOutcome(null), new QlAct(null), new QlPaid(null), new QlName(null), new QlGone(null)];
