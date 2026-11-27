import { Symbol as QuestSymbol, symbolToSaveData, symbolFromSaveData } from './symbol.js';
import { matchFirst } from './questResource.js';
import { nextUid } from './quest.js';

export const TaskType = Object.freeze({
  Headless: 'headless',
  Standard: 'standard',
  PersistUntil: 'persistUntil',
  Variable: 'variable',
  GlobalVarLink: 'globalVarLink',
});

// Tried in order by matchFirst, since one alternation would need repeated named groups.
const TASK_HEADER = [
  /(?<symbol>[a-zA-Z0-9_.]+) (?<task>task):/,
  /until (?<sym2>[a-zA-Z0-9_.]+) (?<persist>performed:)/,
  /(?<variable>variable) (?<sym3>[a-zA-Z0-9_.]+)/,
];
const GLOBAL_VAR_HEADER = /(?<globalVarName>[a-zA-Z0-9_.]+) (?<symbol>[a-zA-Z0-9_.]+)/;

export class Task {
  constructor(parentQuest, lines = null, globalVar = -1) {
    this.parentQuest = parentQuest;
    this.symbol = null;
    this.targetSymbol = null;
    this.triggered = false;
    this.prevTriggered = false;
    this.type = TaskType.Standard;
    this.dropped = false;
    this.globalVarName = '';
    this.globalVarLink = -1;
    this.hasTriggerConditions = false;
    this.actions = [];
    this.pendingActionLines = [];
    if (lines !== null) this.setTask(lines, globalVar);
  }

  setTask(lines, globalVar = -1) {
    let i = 0;
    if (globalVar !== -1) {
      this._readGlobalVarTaskHeader(lines[i++]);
      this.type = TaskType.GlobalVarLink;
      this.targetSymbol = null;
      this.globalVarLink = globalVar;
      this._readTaskLines(lines, i);
      return;
    }
    if (this._readTaskHeader(lines[i])) {
      i++;
    } else {
      this.type = TaskType.Headless;
      this.targetSymbol = null;
      this.triggered = true;
      this.symbol = new QuestSymbol(nextUid().toString());
    }
    this._readTaskLines(lines, i);
  }

  start() { this.setTriggerValue(true); }
  clear() { this.setTriggerValue(false); }
  drop() { this.dropped = true; this.setTriggerValue(false); }

  getTriggerValue() {
    const globals = this.parentQuest?.hooks?.globalVars;
    if (this.globalVarLink !== -1 && globals) {
      this.triggered = globals.get(this.globalVarLink) ?? false;
    }
    return this.triggered;
  }

  setTriggerValue(value) {
    const globals = this.parentQuest?.hooks?.globalVars;
    if (this.globalVarLink !== -1 && globals) globals.set(this.globalVarLink, value);
    this.triggered = value;
    // A dropped task never changes state, and clearing a live task rearms its actions so a restart runs them again.
    if (this.dropped) { this.triggered = false; return; }
    if (value === false) this._rearmActions();
  }

  // As in classic, the first always-on trigger can start and stop the task; later ones can only start it.
  update() {
    let ranPrimaryAlwaysOnTrigger = false;
    for (const action of this.actions) {
      if (action.isComplete) continue;

      if ((action.isTriggerCondition && !this.getTriggerValue()) || action.isAlwaysOnTriggerCondition) {
        if (action.isAlwaysOnTriggerCondition && !ranPrimaryAlwaysOnTrigger) {
          this.setTriggerValue(action.checkTrigger(this));
          ranPrimaryAlwaysOnTrigger = true;
        } else if (action.isAlwaysOnTriggerCondition && ranPrimaryAlwaysOnTrigger) {
          if (action.checkTrigger(this)) this.setTriggerValue(true);
        } else {
          this.setTriggerValue(action.checkTrigger(this));
        }
      }

      if (this.getTriggerValue() && !action.isTriggerCondition) {
        if (!this.prevTriggered) action.initialiseOnSet();
        action.update(this);
        if (this.parentQuest.questBreak) return;
      }
    }

    if (this.type === TaskType.PersistUntil) {
      // A missing target task throws, so the machine ends the quest with an error as classic does.
      const targetTask = this.parentQuest.getTask(this.targetSymbol);
      if (targetTask.getTriggerValue()) this.clear();
      else this._rearmActions({ persist: true });
    }

    this.prevTriggered = this.getTriggerValue();
  }

  _rearmActions(opts) {
    for (const action of this.actions) action.rearmAction(opts);
  }

  disposeActions() {
    for (const action of this.actions) action.dispose();
  }

  _readGlobalVarTaskHeader(line) {
    const match = GLOBAL_VAR_HEADER.exec(line);
    if (match) {
      this.globalVarName = match.groups.globalVarName;
      this.symbol = new QuestSymbol(match.groups.symbol);
      return true;
    }
    return false;
  }

  _readTaskHeader(line) {
    const match = matchFirst(line, TASK_HEADER);
    if (!match) return false;
    const g = match.groups;
    if (g.task) {
      this.type = TaskType.Standard;
      this.targetSymbol = null;
      this.symbol = new QuestSymbol(g.symbol);
    } else if (g.persist) {
      this.type = TaskType.PersistUntil;
      this.targetSymbol = new QuestSymbol(g.sym2);
      this.triggered = true;
      this.symbol = new QuestSymbol(nextUid().toString());
    } else if (g.variable) {
      this.type = TaskType.Variable;
      this.targetSymbol = null;
      this.triggered = false;
      this.symbol = new QuestSymbol(g.sym3);
    }
    return true;
  }

  _readTaskLines(lines, startLine) {
    const factory = this.parentQuest?.actionFactory ?? null;
    for (let i = startLine; i < lines.length; i++) {
      const action = factory?.(lines[i], this.parentQuest) ?? null;
      if (action) {
        this.actions.push(action);
        if (action.isTriggerCondition) this.hasTriggerConditions = true;
      } else {
        this.pendingActionLines.push(lines[i]);
      }
    }
  }

  copyQuestActions(other) {
    this.actions.push(...other.actions);
    this.pendingActionLines.push(...other.pendingActionLines);
  }

  getSaveData() {
    return {
      symbol: symbolToSaveData(this.symbol),
      targetSymbol: symbolToSaveData(this.targetSymbol),
      triggered: this.triggered,
      prevTriggered: this.prevTriggered,
      type: this.type,
      dropped: this.dropped,
      globalVarName: this.globalVarName,
      globalVarLink: this.globalVarLink,
      hasTriggerConditions: this.hasTriggerConditions,
      actions: this.actions.map((a) => a.getActionSaveData()),
    };
  }

  // Classic order: on a fresh task the trigger is set while globalVarLink is -1 and dropped is false.
  // Actions restore last.
  restoreSaveData(data, resolveActionType) {
    this.symbol = symbolFromSaveData(data.symbol);
    this.targetSymbol = symbolFromSaveData(data.targetSymbol);
    this.setTriggerValue(data.triggered);
    this.prevTriggered = data.prevTriggered;
    this.type = data.type;
    this.dropped = data.dropped;
    this.globalVarName = data.globalVarName;
    this.globalVarLink = data.globalVarLink;
    this.hasTriggerConditions = data.hasTriggerConditions;
    this.actions.length = 0;
    for (const actionData of data.actions) {
      const ActionCtor = resolveActionType?.(actionData.type);
      if (!ActionCtor) throw new Error(`Could not restore action type ${actionData.type}`);
      const action = new ActionCtor(this.parentQuest);
      action.restoreActionSaveData(actionData);
      this.actions.push(action);
    }
  }
}
