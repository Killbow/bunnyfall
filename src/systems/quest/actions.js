// Quest actions ported from Daggerfall Unity. The registry tests each task line against every pattern in order.
// Patterns keep the C# alternative order but number repeated group names, which JavaScript cannot reuse.
import { Symbol as QuestSymbol, symbolToSaveData, symbolFromSaveData } from './symbol.js';
import { parseInt as questParseInt } from './parseUtils.js';
import { staticMessagesTable, soundsTable, placesTable, spellsTable, diseasesTable } from './tables.js';
import { dateFromSeconds, SEASON_NAMES, seasonValue } from '../../world/gameDate.js';
import { SKILLS, skillValue, tallySkill } from '../../characters/skills.js';
import { SKILL_ADVANCEMENT_MULTIPLIER } from '../../characters/advancement.js';
import { liveStat, FATIGUE_LOSS } from '../../characters/statMods.js';
import { CRIMES } from '../../justice/court.js';
import { makeItemPermanent } from './item.js';
import { isGoldPieces } from '../../items/inventory.js';
import { QUEST_MESSAGES } from './quest.js';
import { customParseInt, isPlayerAtBuildingType, isPlayerAtDungeonType, MARKER_PREFERENCE } from './place.js';
import { getIndividualFactionID, getFactionDataOrThrow } from './person.js';
import { markerScenePosition } from './sceneMount.js';
import { isSongFileDefined, songFileToRecordName } from '../../audio/songFiles.js';
import { MOBILE_TEAMS } from '../../characters/enemyTargets.js';
import { dfuEffectKeyOf } from '../../magic/spellEffects.js';
import { setLocationVariant, setNewLocationVariant, setBlockVariant, setBuildingVariant, makeLocationKey, NO_VARIANT } from '../../world/worldDataVariants.js';
import { ONLINE_GUARD_WINDOWS, guardWindowStep } from './onlineGuard.js';
import { localizedText } from '../../ui/textManager.js';
import { raisedSince } from './questStamps.js';
import { waveIsAwaited, questWaitsShort, ONLINE_DELAY_SECONDS } from './clock.js';
import { stringHash } from '../../formats/netRuntime.js';
import { seededFirst } from '../../weather/wind.js';
const skySecondsOf = (quest) => (quest?.skySeconds ?? quest?.nowSeconds)?.() ?? 0;

export const QUEST_INFO_RESOURCE_TYPE = Object.freeze({
  NotSet: 0, Location: 1, Person: 2, Thing: 3,
});

export class ActionTemplate {
  constructor(parentQuest) {
    this.parentQuest = parentQuest;
    this.isComplete = false;
    this.isTriggerCondition = false;
    this.isAlwaysOnTriggerCondition = false;
    this.debugSource = '';
    this.allowRearm = true;
  }

  get pattern() { return null; }

  test(source) { return this.pattern.exec(source); }

  initialiseOnSet() {}
  update(_caller) {}
  checkTrigger(_caller) { return false; }
  setComplete() { this.isComplete = true; }
  rearmAction() { if (this.isComplete && this.allowRearm) this.isComplete = false; }
  dispose() {}

  // Each class sets typeName explicitly so a minifying build cannot rename the saved type.
  get typeName() { return this.constructor.typeName ?? this.constructor.name; }

  // Fields left out of saveShape are not saved, so they reset on load as in the C# save data.
  get saveShape() { return []; }

  getSaveData() {
    const shape = this.saveShape;
    if (!shape.length) return null;
    const data = {};
    for (const [field, kind = 'raw', savedName = field] of shape) {
      const v = this[field];
      if (kind === 'sym') data[savedName] = symbolToSaveData(v);
      else if (kind === 'symArray') data[savedName] = v ? v.map(symbolToSaveData) : null;
      else data[savedName] = (v && typeof v === 'object') ? structuredClone(v) : v;
    }
    return data;
  }

  restoreSaveData(dataIn) {
    if (dataIn == null) return;
    for (const [field, kind = 'raw', savedName = field] of this.saveShape) {
      const v = dataIn[savedName];
      if (kind === 'sym') this[field] = symbolFromSaveData(v);
      else if (kind === 'symArray') this[field] = v ? v.map(symbolFromSaveData) : null;
      else this[field] = (v && typeof v === 'object') ? structuredClone(v) : v;
    }
  }

  getActionSaveData() {
    return {
      type: this.typeName,
      isComplete: this.isComplete,
      isTriggerCondition: this.isTriggerCondition,
      isAlwaysOnTriggerCondition: this.isAlwaysOnTriggerCondition,
      debugSource: this.debugSource,
      actionSpecific: this.getSaveData(),
    };
  }

  restoreActionSaveData(data) {
    this.isComplete = data.isComplete;
    this.isTriggerCondition = data.isTriggerCondition;
    this.isAlwaysOnTriggerCondition = data.isAlwaysOnTriggerCondition;
    this.debugSource = data.debugSource;
    this.restoreSaveData(data.actionSpecific);
  }
}

export class StartTask extends ActionTemplate {
  static typeName = 'StartTask';
  get saveShape() { return [['taskSymbol', 'sym']]; }
  get pattern() { return /start task (?<taskName>[a-zA-Z0-9_.]+)|setvar (?<setvarName>[a-zA-Z0-9_.]+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new StartTask(parentQuest);
    action.taskSymbol = new QuestSymbol(match.groups.taskName ?? match.groups.setvarName);
    return action;
  }
  update(_caller) {
    this.parentQuest.startTask(this.taskSymbol);
    this.setComplete();
  }
}

export class ClearTask extends ActionTemplate {
  static typeName = 'ClearTask';
  get saveShape() { return [['taskSymbols', 'symArray']]; }
  get pattern() { return /clear [a-zA-Z0-9_.]+/; }
  createNew(source, parentQuest) {
    if (!this.test(source)) return null;
    const action = new ClearTask(parentQuest);
    action.taskSymbols = source.trimEnd().split(/\s+/).slice(1).map((t) => new QuestSymbol(t));
    return action;
  }
  update(_caller) {
    this.setComplete();
    for (const s of this.taskSymbols) this.parentQuest.getTask(s)?.clear();
  }
}

export class UnsetTask extends ActionTemplate {
  static typeName = 'UnsetTask';
  get saveShape() { return [['taskSymbols', 'symArray']]; }
  get pattern() { return /unset [a-zA-Z0-9_.]+/; }
  createNew(source, parentQuest) {
    if (!this.test(source)) return null;
    const action = new UnsetTask(parentQuest);
    action.taskSymbols = source.trimEnd().split(/\s+/).slice(1).map((t) => new QuestSymbol(t));
    return action;
  }
  update(_caller) {
    this.setComplete();
    for (const s of this.taskSymbols) this.parentQuest.getTask(s)?.drop();
  }
}

export class EndQuest extends ActionTemplate {
  static typeName = 'EndQuest';
  get saveShape() { return [['textId']]; }
  constructor(parentQuest) { super(parentQuest); this.allowRearm = false; }
  get pattern() { return /end quest saying (?<id>\d+)|end quest/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new EndQuest(parentQuest);
    action.textId = questParseInt(match.groups?.id ?? '');
    return action;
  }
  update(_caller) {
    if (this.textId !== 0) this.parentQuest.showMessagePopup(this.textId);
    this.parentQuest.questBreak = true;
    this.parentQuest.endQuest();
    this.setComplete();
  }
}

export class WhenTask extends ActionTemplate {
  static typeName = 'WhenTask';
  get saveShape() { return [['evaluations']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.isTriggerCondition = true;
    this.isAlwaysOnTriggerCondition = true;
    this.evaluations = [];
  }
  get pattern() { return /when not (?<notName>[a-zA-Z0-9_.]+)|when (?<taskName>[a-zA-Z0-9_.]+)/; }
  createNew(source, parentQuest) {
    const FULL = /when not (?<n1>[a-zA-Z0-9_.]+)|when (?<n2>[a-zA-Z0-9_.]+)|and not (?<n3>[a-zA-Z0-9_.]+)|and (?<n4>[a-zA-Z0-9_.]+)|or not (?<n5>[a-zA-Z0-9_.]+)|or (?<n6>[a-zA-Z0-9_.]+)/g;
    const matches = [...source.matchAll(FULL)];
    if (!matches.length) return null;
    const condition = new WhenTask(parentQuest);
    for (const m of matches) {
      const g = m.groups;
      const task = g.n1 ?? g.n2 ?? g.n3 ?? g.n4 ?? g.n5 ?? g.n6;
      const v = m[0];
      let op;
      if (v.includes('when not')) op = 'whenNot';
      else if (v.includes('and not')) op = 'andNot';
      else if (v.includes('or not')) op = 'orNot';
      else if (v.includes('when')) op = 'when';
      else if (v.includes('and')) op = 'and';
      else if (v.includes('or')) op = 'or';
      else throw new Error('Operator not found in WhenTask condition.');
      condition.evaluations.push({ op, task });
    }
    return condition;
  }
  checkTrigger(_caller) { return this._checkEvals(); }
  _isTaskSet(symbol) {
    const task = this.parentQuest.getTask(symbol);
    if (!task) { console.warn(`[quest] Task/Variable not found '${symbol.name}'`); return false; }
    return task.getTriggerValue();
  }
  _checkEvals() {
    if (!this.evaluations.length) throw new Error('WhenTask condition has no evaluations.');
    let left = false, right = false;
    for (let i = 0; i < this.evaluations.length; i++) {
      const { op, task } = this.evaluations[i];
      const symbol = new QuestSymbol(task);
      right = (op === 'when' || op === 'and' || op === 'or')
        ? this._isTaskSet(symbol)
        : !this._isTaskSet(symbol);
      switch (op) {
        case 'when': case 'whenNot':
          if (this.evaluations.length === 1 && !right) return false;
          break;
        case 'and': case 'andNot':
          if (!left || !right) {
            if (i < this.evaluations.length - 1) right = false;
            else return false;
          } else {
            right = true;
          }
          if (right === true && i < this.evaluations.length - 1) {
            const next = this.evaluations[i + 1].op;
            if (next === 'or' || next === 'orNot') return true;
          }
          break;
        case 'or': case 'orNot':
          if (!left && !right) {
            if (i < this.evaluations.length - 1) right = false;
            else return false;
          } else {
            right = true;
          }
          break;
        default:
          return false;
      }
      left = right;
    }
    return true;
  }
}

export class StartStopTimer extends ActionTemplate {
  static typeName = 'StartStopTimer';
  get saveShape() { return [['isStartTimer'], ['targetSymbol', 'sym']]; }
  get pattern() { return /(?<start>start) timer (?<symbol>[a-zA-Z0-9_.-]+)|stop timer (?<sym2>[a-zA-Z0-9_.-]+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new StartStopTimer(parentQuest);
    action.targetSymbol = new QuestSymbol(match.groups.symbol ?? match.groups.sym2);
    action.isStartTimer = !!match.groups.start;
    return action;
  }
  update(_caller) {
    const targetClock = this.parentQuest.getClock(this.targetSymbol);
    if (!targetClock) {
      console.warn(`[quest] start timer was unable to find clock symbol ${this.targetSymbol.name}`);
      return;
    }
    if (this.isStartTimer) targetClock.startTimer();
    else targetClock.stopTimer();
    this.setComplete();
  }
}

export class Say extends ActionTemplate {
  static typeName = 'Say';
  get saveShape() { return [['id']]; }
  constructor(parentQuest) { super(parentQuest); this.allowRearm = false; }
  get pattern() { return /say (?<id>\d+)|say (?<idName>\w+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new Say(parentQuest);
    action.id = questParseInt(match.groups.id ?? '');
    const idName = match.groups.idName;
    if (action.id === 0 && idName) {
      action.id = questParseInt(staticMessagesTable().getValue('id', idName));
    }
    return action;
  }
  update(_caller) {
    this.parentQuest.showMessagePopup(this.id, true);
    this.setComplete();
  }
}

export class LogMessage extends ActionTemplate {
  static typeName = 'LogMessage';
  get saveShape() { return [['messageID'], ['stepID']]; }
  get pattern() { return /log (?<id>\d+)( step)? (?<step>\d+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new LogMessage(parentQuest);
    action.messageID = questParseInt(match.groups.id);
    action.stepID = questParseInt(match.groups.step);
    return action;
  }
  update(_caller) {
    this.parentQuest.addLogStep(this.stepID, this.messageID);
    this.setComplete();
  }
}

export class RemoveLogMessage extends ActionTemplate {
  static typeName = 'RemoveLogMessage';
  get saveShape() { return [['stepID']]; }
  get pattern() { return /remove log step (?<step>\d+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new RemoveLogMessage(parentQuest);
    action.stepID = questParseInt(match.groups.step);
    return action;
  }
  update(_caller) {
    this.parentQuest.removeLogStep(this.stepID);
    this.setComplete();
  }
}

// A copy shared with the party draws a seeded pick, so every copy starts the same task.
export const sharedPickRoll =(shareId, taskName, index) => seededFirst(stringHash(`${shareId}|${taskName}|${index}`));

export class PickOneOf extends ActionTemplate {
  static typeName = 'PickOneOf';
  get saveShape() { return [['taskSymbols', 'symArray']]; }
  get pattern() { return /pick one of [a-zA-Z0-9_.]+/; }
  createNew(source, parentQuest) {
    if (!this.test(source)) return null;
    const splits = source.trim().split(/\s+/);
    if (splits.length < 4) return null;
    const symbols = splits.slice(3).filter((s) => s).map((s) => new QuestSymbol(s));
    if (!symbols.length) return null;
    const action = new PickOneOf(parentQuest);
    action.taskSymbols = symbols;
    return action;
  }
  update(caller) {
    const quest = this.parentQuest;
    const u = quest.shareId && quest.hooks?.sharedCopy?.(quest)
      ? sharedPickRoll(quest.shareId, caller?.symbol?.name ?? '', caller?.actions?.indexOf(this) ?? 0)
      : (quest.rolls ?? Math.random)();
    const selected = this.taskSymbols[Math.floor(u * this.taskSymbols.length)];
    const task = this.parentQuest.getTask(selected);
    if (task) task.start();
    else console.warn(`[quest] PickOneOf could not find task ${selected?.name}`);
    this.setComplete();
  }
}

export class ClickedNpc extends ActionTemplate {
  static typeName = 'ClickedNpc';
  get saveShape() { return [['npcSymbol', 'sym'], ['id'], ['goldAmount'], ['taskSymbol', 'sym']]; }
  constructor(parentQuest) { super(parentQuest); this.isTriggerCondition = true; }
  get pattern() {
    return /clicked (?<anNPC>[a-zA-Z0-9_.-]+) and at least (?<goldAmount>\d+) gold otherwise do (?<taskName>[a-zA-Z0-9_.]+)|clicked npc (?<anNPC2>[a-zA-Z0-9_.-]+) say (?<id>\d+)|clicked npc (?<anNPC3>[a-zA-Z0-9_.-]+) say (?<idName>\w+)|clicked npc (?<anNPC4>[a-zA-Z0-9_.-]+)/;
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new ClickedNpc(parentQuest);
    action.npcSymbol = new QuestSymbol(g.anNPC ?? g.anNPC2 ?? g.anNPC3 ?? g.anNPC4);
    action.id = questParseInt(g.id ?? '');
    const idName = g.idName;
    if (action.id === 0 && idName) {
      action.id = questParseInt(staticMessagesTable().getValue('id', idName));
    }
    action.goldAmount = questParseInt(g.goldAmount ?? '');
    action.taskSymbol = new QuestSymbol(g.taskName ?? '');
    return action;
  }
  checkTrigger(caller) {
    if (caller.getTriggerValue()) return true;
    const person = this.parentQuest.getPerson(this.npcSymbol);
    if (!person) return false;
    if (person.hasPlayerClicked) {
      if (this.goldAmount > 0 && this.taskSymbol && this.taskSymbol.name) {
        if ((this.parentQuest.hooks?.getGoldPieces?.() ?? 0) >= this.goldAmount) {
          this.parentQuest.hooks?.deductGoldPieces?.(this.goldAmount);
        } else {
          this.parentQuest.startTask(this.taskSymbol);
          return false;
        }
      }
      if (this.id !== 0) this.parentQuest.showMessagePopup(this.id);
      this.parentQuest.scheduleClickRearm(person);
      return true;
    }
    return false;
  }
}

export class ClickedItem extends ActionTemplate {
  static typeName = 'ClickedItem';
  get saveShape() { return [['itemSymbol', 'sym'], ['id']]; }
  constructor(parentQuest) { super(parentQuest); this.isTriggerCondition = true; }
  get pattern() {
    return /clicked item (?<anItem>[a-zA-Z0-9_.-]+) say (?<id>\d+)|clicked item (?<anItem2>[a-zA-Z0-9_.-]+) say (?<idName>\w+)|clicked item (?<anItem3>[a-zA-Z0-9_.-]+)/;
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new ClickedItem(parentQuest);
    action.itemSymbol = new QuestSymbol(g.anItem ?? g.anItem2 ?? g.anItem3);
    action.id = questParseInt(g.id ?? '');
    if (action.id === 0 && g.idName) {
      action.id = questParseInt(staticMessagesTable().getValue('id', g.idName));
    }
    return action;
  }
  checkTrigger(caller) {
    if (caller.getTriggerValue()) return true;
    const item = this.parentQuest.getItem(this.itemSymbol);
    if (!item) return false;
    if (item.hasPlayerClicked) {
      if (this.id !== 0) this.parentQuest.showMessagePopup(this.id);
      return true;
    }
    return false;
  }
}

// Say registers first and patterns are unanchored, so a clicked-enemy line that ends in `say N` parses as Say.
export class ClickedFoe extends ActionTemplate {
  static typeName = 'ClickedFoe';
  get saveShape() { return [['npcSymbol', 'sym'], ['id'], ['goldAmount'], ['taskSymbol', 'sym']]; }
  constructor(parentQuest) { super(parentQuest); this.isTriggerCondition = true; }
  get pattern() {
    return /clicked foe (?<aFoe>[a-zA-Z0-9_.-]+) and at least (?<goldAmount>\d+) gold otherwise do (?<taskName>[a-zA-Z0-9_.]+)|clicked foe (?<aFoe2>[a-zA-Z0-9_.-]+) say (?<id>\d+)|clicked foe (?<aFoe3>[a-zA-Z0-9_.-]+) say (?<idName>\w+)|clicked foe (?<aFoe4>[a-zA-Z0-9_.-]+)/;
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new ClickedFoe(parentQuest);
    action.npcSymbol = new QuestSymbol(g.aFoe ?? g.aFoe2 ?? g.aFoe3 ?? g.aFoe4);
    action.id = questParseInt(g.id ?? '');
    if (action.id === 0 && g.idName) {
      action.id = questParseInt(staticMessagesTable().getValue('id', g.idName));
    }
    action.goldAmount = questParseInt(g.goldAmount ?? '');
    action.taskSymbol = new QuestSymbol(g.taskName ?? '');
    return action;
  }
  checkTrigger(caller) {
    if (caller.getTriggerValue()) return true;
    const foe = this.parentQuest.getFoe(this.npcSymbol);
    if (!foe) return false;
    if (foe.hasPlayerClicked) {
      if (this.goldAmount > 0 && this.taskSymbol && this.taskSymbol.name) {
        if ((this.parentQuest.hooks?.getGoldPieces?.() ?? 0) >= this.goldAmount) {
          this.parentQuest.hooks?.deductGoldPieces?.(this.goldAmount);
        } else {
          this.parentQuest.startTask(this.taskSymbol);
          return false;
        }
      }
      if (this.id !== 0) this.parentQuest.showMessagePopup(this.id);
      this.parentQuest.scheduleClickRearm(foe);
      return true;
    }
    return false;
  }
}

export class KilledFoe extends ActionTemplate {
  static typeName = 'KilledFoe';
  get saveShape() { return [['foeSymbol', 'sym'], ['killsRequired'], ['sayingID']]; }
  constructor(parentQuest) { super(parentQuest); this.isTriggerCondition = true; }
  get pattern() {
    return /killed (?<kills>\d+) (?<aFoe>[a-zA-Z0-9_.-]+) (saying (?<sayingID>\d+))|killed (?<kills2>\d+) (?<aFoe2>[a-zA-Z0-9_.-]+)|killed (?<aFoe3>[a-zA-Z0-9_.-]+)/;
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new KilledFoe(parentQuest);
    action.foeSymbol = new QuestSymbol(g.aFoe ?? g.aFoe2 ?? g.aFoe3);
    action.killsRequired = questParseInt(g.kills ?? g.kills2 ?? '');
    action.sayingID = questParseInt(g.sayingID ?? '');
    if (action.killsRequired < 1) action.killsRequired = 1;
    return action;
  }
  checkTrigger(_caller) {
    const foe = this.parentQuest.getFoe(this.foeSymbol);
    if (!foe) return false;
    if (foe.killCount >= this.killsRequired) {
      if (this.sayingID !== 0) this.parentQuest.showMessagePopup(this.sayingID);
      return true;
    }
    return false;
  }
}

export class InjuredFoe extends ActionTemplate {
  static typeName = 'InjuredFoe';
  get saveShape() { return [['foeSymbol', 'sym'], ['textID']]; }
  constructor(parentQuest) { super(parentQuest); this.isTriggerCondition = true; }
  get pattern() {
    return /injured (?<aFoe>[a-zA-Z0-9_.-]+) saying (?<textID>\d+)|injured (?<aFoe2>[a-zA-Z0-9_.-]+)/;
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new InjuredFoe(parentQuest);
    action.foeSymbol = new QuestSymbol(g.aFoe ?? g.aFoe2);
    action.textID = questParseInt(g.textID ?? '');
    return action;
  }
  checkTrigger(_caller) {
    const foe = this.parentQuest.getFoe(this.foeSymbol);
    if (!foe) return false;
    if (foe.injuredTrigger) {
      if (this.textID !== 0) this.parentQuest.showMessagePopup(this.textID);
      return true;
    }
    return false;
  }
}

export class LevelCompleted extends ActionTemplate {
  static typeName = 'LevelCompleted';
  get saveShape() { return [['minLevelValue']]; }
  constructor(parentQuest) { super(parentQuest); this.isTriggerCondition = true; }
  get pattern() { return /level (?<minLevelValue>\d+) completed/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new LevelCompleted(parentQuest);
    action.minLevelValue = questParseInt(match.groups.minLevelValue);
    return action;
  }
  checkTrigger(_caller) {
    return (this.parentQuest.hooks?.playerLevel?.() ?? 0) >= this.minLevelValue;
  }
}

export class DailyFrom extends ActionTemplate {
  static typeName = 'DailyFrom';
  get saveShape() { return [['minDailySeconds'], ['maxDailySeconds'], ['guardAnchor'], ['guardAway']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.isTriggerCondition = true;
    this.isAlwaysOnTriggerCondition = true;
    this.guardAnchor = null;
    this.guardAway = false;
  }
  get pattern() { return /daily from (?<hours1>\d+):(?<minutes1>\d+) to (?<hours2>\d+):(?<minutes2>\d+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new DailyFrom(parentQuest);
    action.minDailySeconds = questParseInt(g.hours1) * 3600 + questParseInt(g.minutes1) * 60;
    action.maxDailySeconds = questParseInt(g.hours2) * 3600 + questParseInt(g.minutes2) * 60;
    return action;
  }
  checkTrigger(_caller) {
    // Online, a guarded quest's window starts when the player arrives at the watched place, not at an hour of day.
    const win = this.parentQuest.hooks?.sharedClock?.() ? ONLINE_GUARD_WINDOWS[this.parentQuest.questName] ?? null : null;
    if (win) {
      const place = this.parentQuest.getPlace?.(new QuestSymbol(`_${win.place}_`)) ?? null;
      return guardWindowStep(this, !!place?.isPlayerHere?.(), this.parentQuest.nowSeconds?.() ?? 0, win);
    }
    const now = dateFromSeconds(skySecondsOf(this.parentQuest));
    const currentDailySeconds = now.hour * 3600 + now.minute * 60;
    return currentDailySeconds >= this.minDailySeconds && currentDailySeconds <= this.maxDailySeconds;
  }
}

// A prompt completes on its answer, not when shown, so a load forgets the hold and asks again.
// Shared copies mark held places as asked, so a party member never asks a question this player's box holds.
const promptsUp = new WeakMap();
const promptPlace = (action, caller) => `${caller?.symbol?.name ?? ''}#${caller?.actions?.indexOf?.(action) ?? -1}`;
const promptUp = (action, caller) => promptsUp.get(action.parentQuest)?.has(promptPlace(action, caller)) ?? false;
export const heldPromptPlaces = (quest) => [...(promptsUp.get(quest) ?? [])];
function holdPrompt(action, caller) {
  const quest = action.parentQuest, key = promptPlace(action, caller);
  let up = promptsUp.get(quest);
  if (!up) promptsUp.set(quest, (up = new Set()));
  up.add(key);
  const taskSymbol = caller?.symbol ?? null, at = caller?.actions?.indexOf?.(action) ?? -1;
  return () => {
    up.delete(key);
    action.setComplete();
    const now = taskSymbol && at >= 0 ? quest.getTask?.(taskSymbol)?.actions?.[at] : null;
    if (now && now !== action && now.typeName === action.typeName) now.setComplete();
  };
}

export class Prompt extends ActionTemplate {
  static typeName = 'Prompt';
  get saveShape() { return [['id'], ['yesTaskSymbol', 'sym'], ['noTaskSymbol', 'sym']]; }
  constructor(parentQuest) { super(parentQuest); this.allowRearm = false; }
  get pattern() {
    return /prompt (?<id>\d+) yes (?<yesTaskName>[a-zA-Z0-9_.]+) no (?<noTaskName>[a-zA-Z0-9_.]+)|prompt (?<idName>\w+) yes (?<yesTaskName2>[a-zA-Z0-9_.]+) no (?<noTaskName2>[a-zA-Z0-9_.]+)/;
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const prompt = new Prompt(parentQuest);
    prompt.id = questParseInt(g.id ?? '');
    prompt.yesTaskSymbol = new QuestSymbol(g.yesTaskName ?? g.yesTaskName2);
    prompt.noTaskSymbol = new QuestSymbol(g.noTaskName ?? g.noTaskName2);
    if (prompt.id === 0 && g.idName) {
      prompt.id = questParseInt(staticMessagesTable().getValue('id', g.idName));
    }
    return prompt;
  }
  update(caller) {
    if (promptUp(this, caller)) return;
    const message = this.parentQuest.getMessage(this.id);
    const show = this.parentQuest.hooks?.showPrompt;
    if (!message || !show) { this.setComplete(); return; }
    const answered = holdPrompt(this, caller);
    const shown = show(this.parentQuest, message, (isYes) => {
      answered();
      this.parentQuest.startTask(isYes ? this.yesTaskSymbol : this.noTaskSymbol);
    });
    if (shown === false) answered();
  }
}

export class PromptMulti extends ActionTemplate {
  static typeName = 'PromptMulti';
  get saveShape() {
    return [['id'], ['opt1button'], ['opt2button'], ['opt3button'], ['opt4button'],
      ['opt1TaskSymbol', 'sym'], ['opt2TaskSymbol', 'sym'],
      ['opt3TaskSymbol', 'sym'], ['opt4TaskSymbol', 'sym']];
  }
  constructor(parentQuest) {
    super(parentQuest);
    this.allowRearm = false;
    this.id = 0;
    this.opt1button = 0; this.opt2button = 0; this.opt3button = 0; this.opt4button = 0;
    this.opt1TaskSymbol = null; this.opt2TaskSymbol = null;
    this.opt3TaskSymbol = null; this.opt4TaskSymbol = null;
  }
  get pattern() {
    return /promptmulti (?<id>\d+) (?<opt1>[0-9]+)(:[a-zA-Z0-9]+)? (?<opt1TaskName>[a-zA-Z0-9_.]+) (?<opt2>[0-9]+)(:[a-zA-Z0-9]+)? (?<opt2TaskName>[a-zA-Z0-9_.]+) (?<opt3>[0-9]+)(:[a-zA-Z0-9]+)? (?<opt3TaskName>[a-zA-Z0-9_.]+) (?<opt4>[0-9]+)(:[a-zA-Z0-9]+)? (?<opt4TaskName>[a-zA-Z0-9_.]+)|promptmulti (?<id2>\d+) (?<opt1b>[0-9]+)(:[a-zA-Z0-9]+)? (?<opt1TaskName2>[a-zA-Z0-9_.]+) (?<opt2b>[0-9]+)(:[a-zA-Z0-9]+)? (?<opt2TaskName2>[a-zA-Z0-9_.]+) (?<opt3b>[0-9]+)(:[a-zA-Z0-9]+)? (?<opt3TaskName2>[a-zA-Z0-9_.]+)|promptmulti (?<id3>\d+) (?<opt1c>[0-9]+)(:[a-zA-Z0-9]+)? (?<opt1TaskName3>[a-zA-Z0-9_.]+) (?<opt2c>[0-9]+)(:[a-zA-Z0-9]+)? (?<opt2TaskName3>[a-zA-Z0-9_.]+)/;
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const prompt = new PromptMulti(parentQuest);
    prompt.id = questParseInt(g.id ?? g.id2 ?? g.id3);
    prompt.opt1button = questParseInt(g.opt1 ?? g.opt1b ?? g.opt1c);
    prompt.opt1TaskSymbol = new QuestSymbol(g.opt1TaskName ?? g.opt1TaskName2 ?? g.opt1TaskName3);
    prompt.opt2button = questParseInt(g.opt2 ?? g.opt2b ?? g.opt2c);
    prompt.opt2TaskSymbol = new QuestSymbol(g.opt2TaskName ?? g.opt2TaskName2 ?? g.opt2TaskName3);
    const opt3Name = g.opt3TaskName ?? g.opt3TaskName2;
    if (opt3Name) {
      prompt.opt3button = questParseInt(g.opt3 ?? g.opt3b);
      prompt.opt3TaskSymbol = new QuestSymbol(opt3Name);
    }
    if (g.opt4TaskName) {
      prompt.opt4button = questParseInt(g.opt4);
      prompt.opt4TaskSymbol = new QuestSymbol(g.opt4TaskName);
    }
    return prompt;
  }
  update(caller) {
    if (promptUp(this, caller)) return;
    const message = this.parentQuest.getMessage(this.id);
    const show = this.parentQuest.hooks?.showPromptMulti;
    if (!message || !show) { this.setComplete(); return; }
    {
      const buttons = [this.opt1button, this.opt2button];
      if (this.opt3TaskSymbol) buttons.push(this.opt3button);
      if (this.opt4TaskSymbol) buttons.push(this.opt4button);
      const answered = holdPrompt(this, caller);
      const shown = show(this.parentQuest, message, buttons, (button) => {
        answered();
        if (button === this.opt1button) this.parentQuest.startTask(this.opt1TaskSymbol);
        else if (button === this.opt2button) this.parentQuest.startTask(this.opt2TaskSymbol);
        else if (button === this.opt3button) this.parentQuest.startTask(this.opt3TaskSymbol);
        else if (button === this.opt4button) this.parentQuest.startTask(this.opt4TaskSymbol);
      });
      if (shown === false) answered();
    }
  }
}

export class PlaySound extends ActionTemplate {
  static typeName = 'PlaySound';
  get saveShape() { return [['soundName'], ['soundId', 'raw', 'soundIndex'], ['interval'], ['count'], ['unknown'], ['lastTimePlayed']]; }
  constructor(parentQuest) {
    super(parentQuest);
    // timesPlayed is not saved, so a restored action needs this default.
    this.timesPlayed = 0;
  }
  get pattern() {
    return /play sound (?<sound>\w+) every (?<n1>\d+) minutes (?<count>\d+) times|play sound (?<sound2>\w+) (?<n1b>\d+) (?<n2>\d+)/;
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new PlaySound(parentQuest);
    try {
      action.soundName = g.sound ?? g.sound2;
      action.interval = questParseInt(g.n1 ?? g.n1b) * 60;
      action.unknown = questParseInt(g.n2 ?? '');
      action.count = questParseInt(g.count ?? '');
      action.lastTimePlayed = parentQuest?.nowSeconds?.() ?? 0;
      action.soundId = soundsTable().getInt('id', action.soundName);
      action.timesPlayed = 0;
    } catch (e) {
      console.warn(`[quest] PlaySound.Create() failed with exception: ${e?.message ?? e}`);
      return null;
    }
    return action;
  }
  update(_caller) {
    const gameSeconds = this.parentQuest.nowSeconds?.() ?? 0;
    if (this.lastTimePlayed + this.interval <= gameSeconds) {
      this.timesPlayed++;
      if (this.count === 0 || (this.count > 0 && this.timesPlayed <= this.count)) {
        if (this.parentQuest.hooks?.playSound?.(this.soundId)) {
          this.lastTimePlayed = gameSeconds;
        }
      }
    }
  }
  rearmAction() {
    super.rearmAction();
    this.timesPlayed = 0;
    this.lastTimePlayed = this.parentQuest?.nowSeconds?.() ?? 0;
  }
}

export class PlayVideo extends ActionTemplate {
  static typeName = 'PlayVideo';
  get saveShape() { return [['videoName']]; }
  get pattern() { return /play video (?<vidNum>\d+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const num = match.groups.vidNum;
    if (!num || num.length > 4) return null;
    const action = new PlayVideo(parentQuest);
    action.videoName = `ANIM${'0'.repeat(4 - num.length)}${num}.VID`;
    return action;
  }
  update(_caller) {
    this.parentQuest.hooks?.playVideo?.(this.videoName);
    this.setComplete();
  }
}

export class PlaySong extends ActionTemplate {
  static typeName = 'PlaySong';
  get saveShape() { return [['songFile', 'raw', 'song']]; }
  get pattern() { return /play song (?<song>[a-zA-Z0-9_-]+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new PlaySong(parentQuest);
    const song = match.groups.song;
    if (!isSongFileDefined(song)) {
      // Completing the template is a no-op kept from C#; the throw drops the whole quest at parse.
      this.setComplete();
      throw new Error(`PlaySong: Song file ${song} is not a known song from MIDI.BSA`);
    }
    action.songFile = song;
    return action;
  }
  update(_caller) {
    this.parentQuest.hooks?.playSong?.(songFileToRecordName(this.songFile));
    this.setComplete();
  }
}

export class HideNpc extends ActionTemplate {
  static typeName = 'HideNpc';
  get saveShape() { return [['npcSymbol', 'sym']]; }
  get pattern() { return /hide npc (?<anNPC>[a-zA-Z0-9_.-]+)|hide (?<anNPC2>[a-zA-Z0-9_.-]+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new HideNpc(parentQuest);
    action.npcSymbol = new QuestSymbol(match.groups.anNPC ?? match.groups.anNPC2);
    return action;
  }
  update(_caller) {
    const person = this.parentQuest.getPerson(this.npcSymbol);
    if (!person) return;
    person.isHidden = true;
    this.setComplete();
  }
}

export class RestoreNpc extends ActionTemplate {
  static typeName = 'RestoreNpc';
  get saveShape() { return [['npcSymbol', 'sym']]; }
  get pattern() { return /restore npc (?<anNPC>[a-zA-Z0-9_.-]+)|restore (?<anNPC2>[a-zA-Z0-9_.-]+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new RestoreNpc(parentQuest);
    action.npcSymbol = new QuestSymbol(match.groups.anNPC ?? match.groups.anNPC2);
    return action;
  }
  update(_caller) {
    const person = this.parentQuest.getPerson(this.npcSymbol);
    if (!person) return;
    person.isHidden = false;
    this.setComplete();
  }
}

export class MuteNpc extends ActionTemplate {
  static typeName = 'MuteNpc';
  get saveShape() { return [['npcSymbol', 'sym']]; }
  get pattern() { return /mute npc (?<anNPC>[a-zA-Z0-9_.-]+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new MuteNpc(parentQuest);
    action.npcSymbol = new QuestSymbol(match.groups.anNPC);
    return action;
  }
  update(_caller) {
    const person = this.parentQuest.getPerson(this.npcSymbol);
    if (!person) { this.setComplete(); return; }
    person.isMuted = true;
    this.setComplete();
  }
  rearmAction({ persist = false } = {}) {
    super.rearmAction();
    const person = this.parentQuest.getPerson(this.npcSymbol);
    if (!person) { this.setComplete(); return; }
    // A persisting re-arm keeps the mute, so an `until ... performed:` body stays muted between ticks.
    if (!persist) person.isMuted = false;
  }
}

export class DestroyNpc extends ActionTemplate {
  static typeName = 'DestroyNpc';
  get saveShape() { return [['npcSymbol', 'sym']]; }
  get pattern() { return /destroy npc (?<anNPC>[a-zA-Z0-9_.-]+)|destroy (?<anNPC2>[a-zA-Z0-9_.-]+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new DestroyNpc(parentQuest);
    action.npcSymbol = new QuestSymbol(match.groups.anNPC ?? match.groups.anNPC2);
    return action;
  }
  update(_caller) {
    const person = this.parentQuest.getPerson(this.npcSymbol);
    if (!person) { this.setComplete(); return; }
    person.destroyNPC();
    this.setComplete();
  }
}

export class RestrainFoe extends ActionTemplate {
  static typeName = 'RestrainFoe';
  get saveShape() { return [['foeSymbol', 'sym']]; }
  get pattern() { return /restrain foe (?<aFoe>[a-zA-Z0-9_.-]+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new RestrainFoe(parentQuest);
    action.foeSymbol = new QuestSymbol(match.groups.aFoe);
    return action;
  }
  update(_caller) {
    const foe = this.parentQuest.getFoe(this.foeSymbol);
    if (!foe) return;
    foe.setRestrained();
    this.setComplete();
  }
}

export class RemoveFoe extends ActionTemplate {
  static typeName = 'RemoveFoe';
  get saveShape() { return [['foeSymbol', 'sym']]; }
  get pattern() { return /remove foe (?<aFoe>[a-zA-Z0-9_.-]+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new RemoveFoe(parentQuest);
    action.foeSymbol = new QuestSymbol(match.groups.aFoe);
    return action;
  }
  update(_caller) {
    const foe = this.parentQuest.getFoe(this.foeSymbol);
    if (!foe) {
      this.setComplete();
      throw new Error(`Could not find Foe resource symbol ${this.foeSymbol?.name}`);
    }
    foe.isHidden = true;
    this.setComplete();
  }
}

export class AddAsQuestor extends ActionTemplate {
  static typeName = 'AddAsQuestor';
  get saveShape() { return [['target', 'sym']]; }
  get pattern() { return /add (?<target>[a-zA-Z0-9_.-]+) as questor/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new AddAsQuestor(parentQuest);
    action.target = new QuestSymbol(match.groups.target);
    return action;
  }
  update(_caller) {
    this.parentQuest.addQuestor(this.target);
    this.setComplete();
  }
}

export class DropAsQuestor extends ActionTemplate {
  static typeName = 'DropAsQuestor';
  get saveShape() { return [['target', 'sym']]; }
  get pattern() { return /drop (?<target>[a-zA-Z0-9_.-]+) as questor/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new DropAsQuestor(parentQuest);
    action.target = new QuestSymbol(match.groups.target);
    return action;
  }
  update(_caller) {
    this.parentQuest.dropQuestor(this.target);
    this.setComplete();
  }
}

export class AddFace extends ActionTemplate {
  static typeName = 'AddFace';
  get saveShape() { return [['personSymbol', 'sym'], ['foeSymbol', 'sym'], ['sayingID']]; }
  constructor(parentQuest) { super(parentQuest); this.allowRearm = false; }
  get pattern() {
    return /add (?<anNPC>[a-zA-Z0-9_.-]+) face saying (?<sayingID>\d+)|add (?<anNPC2>[a-zA-Z0-9_.-]+) face|add foe (?<aFoe>[a-zA-Z0-9_.-]+) face saying (?<sayingID2>\d+)|add foe (?<aFoe2>[a-zA-Z0-9_.-]+) face/;
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new AddFace(parentQuest);
    action.personSymbol = new QuestSymbol(g.anNPC ?? g.anNPC2 ?? '');
    action.foeSymbol = new QuestSymbol(g.aFoe ?? g.aFoe2 ?? '');
    action.sayingID = questParseInt(g.sayingID ?? g.sayingID2 ?? '');
    return action;
  }
  update(_caller) {
    if (this.sayingID !== 0) this.parentQuest.showMessagePopup(this.sayingID, true);
    if (this.personSymbol && this.personSymbol.name) {
      const person = this.parentQuest.getPerson(this.personSymbol);
      if (person) this.parentQuest.hooks?.addFace?.(person);
    } else if (this.foeSymbol && this.foeSymbol.name) {
      const foe = this.parentQuest.getFoe(this.foeSymbol);
      if (foe) this.parentQuest.hooks?.addFace?.(foe);
    }
    this.setComplete();
  }
}

export class DropFace extends ActionTemplate {
  static typeName = 'DropFace';
  get saveShape() { return [['personSymbol', 'sym'], ['foeSymbol', 'sym']]; }
  get pattern() {
    return /drop (?<anNPC>[a-zA-Z0-9_.-]+) face|drop foe (?<aFoe>[a-zA-Z0-9_.-]+) face/;
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new DropFace(parentQuest);
    action.personSymbol = new QuestSymbol(g.anNPC ?? '');
    action.foeSymbol = new QuestSymbol(g.aFoe ?? '');
    return action;
  }
  update(_caller) {
    if (this.personSymbol && this.personSymbol.name) {
      const person = this.parentQuest.getPerson(this.personSymbol);
      if (person) this.parentQuest.hooks?.dropFace?.(person);
    } else if (this.foeSymbol && this.foeSymbol.name) {
      const foe = this.parentQuest.getFoe(this.foeSymbol);
      if (foe) this.parentQuest.hooks?.dropFace?.(foe);
    }
    this.setComplete();
  }
}

export class ItemUsedDo extends ActionTemplate {
  static typeName = 'ItemUsedDo';
  get saveShape() { return [['itemSymbol', 'sym'], ['taskSymbol', 'sym'], ['textID']]; }
  get pattern() {
    return /(?<anItem>[a-zA-Z0-9_.-]+) used do (?<aTask>[a-zA-Z0-9_.-]+)|(?<anItem2>[a-zA-Z0-9_.-]+) used saying (?<textID>\d+) do (?<aTask2>[a-zA-Z0-9_.-]+)/;
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new ItemUsedDo(parentQuest);
    action.itemSymbol = new QuestSymbol(g.anItem ?? g.anItem2);
    action.taskSymbol = new QuestSymbol(g.aTask ?? g.aTask2);
    action.textID = questParseInt(g.textID ?? '');
    return action;
  }
  update(_caller) {
    const item = this.parentQuest.getItem(this.itemSymbol);
    if (!item) return;
    item.actionWatching = true;
    if (item.useClicked) {
      if (this.textID !== 0) this.parentQuest.showMessagePopup(this.textID);
      this.parentQuest.startTask(this.taskSymbol);
      item.actionWatching = false;
      this.setComplete();
    }
  }
}

export class DialogLink extends ActionTemplate {
  static typeName = 'DialogLink';
  get saveShape() { return [['placeSymbol', 'sym'], ['npcSymbol', 'sym'], ['itemSymbol', 'sym']]; }
  get pattern() {
    return /dialog link for location (?<aSite>[a-zA-Z0-9_.-]+) person (?<anNPC>[a-zA-Z0-9_.-]+) item (?<anItem>[a-zA-Z0-9_.-]+)|dialog link for location (?<aSite2>[a-zA-Z0-9_.-]+) person (?<anNPC2>[a-zA-Z0-9_.-]+)|dialog link for location (?<aSite3>[a-zA-Z0-9_.-]+) item (?<anItem3>[a-zA-Z0-9_.-]+)|dialog link for location (?<aSite4>[a-zA-Z0-9_.-]+)|dialog link for person (?<anNPC5>[a-zA-Z0-9_.-]+) item (?<anItem5>[a-zA-Z0-9_.-]+)|dialog link for person (?<anNPC6>[a-zA-Z0-9_.-]+)|dialog link for item (?<anItem7>[a-zA-Z0-9_.-]+)/;
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new DialogLink(parentQuest);
    const site = g.aSite ?? g.aSite2 ?? g.aSite3 ?? g.aSite4;
    const npc = g.anNPC ?? g.anNPC2 ?? g.anNPC5 ?? g.anNPC6;
    const item = g.anItem ?? g.anItem3 ?? g.anItem5 ?? g.anItem7;
    if (site) action.placeSymbol = new QuestSymbol(site);
    if (npc) action.npcSymbol = new QuestSymbol(npc);
    if (item) action.itemSymbol = new QuestSymbol(item);
    return action;
  }
  update(_caller) {
    const T = QUEST_INFO_RESOURCE_TYPE;
    const hooks = this.parentQuest.hooks;
    const uid = this.parentQuest.uid;
    const place = this.parentQuest.getPlace(this.placeSymbol ?? null);
    const person = this.parentQuest.getPerson(this.npcSymbol ?? null);
    const item = this.parentQuest.getItem(this.itemSymbol ?? null);
    // C# never assigns the place name, so place pair links carry an empty name.
    let namePlace = '', namePerson = '', nameItem = '';
    if (place) {
      hooks?.dialogLink?.(uid, place.symbol.name, T.Location);
    }
    if (person) {
      namePerson = person.displayName;
      hooks?.dialogLink?.(uid, person.symbol.name, T.Person);
    }
    if (item) {
      nameItem = item.daggerfallUnityItem?.itemName ?? '';
      hooks?.dialogLink?.(uid, item.symbol.name, T.Thing);
    }
    if (place && person) {
      hooks?.dialogLink?.(uid, namePlace, T.Location, namePerson, T.Person);
      hooks?.dialogLink?.(uid, namePerson, T.Person, namePlace, T.Location);
    }
    if (place && item) {
      hooks?.dialogLink?.(uid, namePlace, T.Location, nameItem, T.Thing);
      hooks?.dialogLink?.(uid, nameItem, T.Thing, namePlace, T.Location);
    }
    if (person && item) {
      hooks?.dialogLink?.(uid, namePerson, T.Person, nameItem, T.Thing);
      hooks?.dialogLink?.(uid, nameItem, T.Thing, namePerson, T.Person);
    }
    this.setComplete();
  }
}

export class AddDialog extends ActionTemplate {
  static typeName = 'AddDialog';
  get saveShape() { return [['placeSymbol', 'sym'], ['npcSymbol', 'sym'], ['itemSymbol', 'sym']]; }
  get pattern() {
    return /add dialog for location (?<aPlace>[a-zA-Z0-9_.-]+) person (?<anNPC>[a-zA-Z0-9_.-]+) item (?<anItem>[a-zA-Z0-9_.-]+)|add dialog for person (?<anNPC2>[a-zA-Z0-9_.-]+) item (?<anItem2>[a-zA-Z0-9_.-]+)|add dialog for location (?<aPlace3>[a-zA-Z0-9_.-]+) person (?<anNPC3>[a-zA-Z0-9_.-]+)|add dialog for location (?<aPlace4>[a-zA-Z0-9_.-]+) item (?<anItem4>[a-zA-Z0-9_.-]+)|add dialog for location (?<aPlace5>[a-zA-Z0-9_.-]+)|add dialog for person (?<anNPC6>[a-zA-Z0-9_.-]+)|add dialog for item (?<anItem7>[a-zA-Z0-9_.-]+)/;
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new AddDialog(parentQuest);
    const place = g.aPlace ?? g.aPlace3 ?? g.aPlace4 ?? g.aPlace5;
    const npc = g.anNPC ?? g.anNPC2 ?? g.anNPC3 ?? g.anNPC6;
    const item = g.anItem ?? g.anItem2 ?? g.anItem4 ?? g.anItem7;
    if (place) action.placeSymbol = new QuestSymbol(place);
    if (npc) action.npcSymbol = new QuestSymbol(npc);
    if (item) action.itemSymbol = new QuestSymbol(item);
    return action;
  }
  update(_caller) {
    const T = QUEST_INFO_RESOURCE_TYPE;
    const hooks = this.parentQuest.hooks;
    const uid = this.parentQuest.uid;
    const place = this.parentQuest.getPlace(this.placeSymbol ?? null);
    const person = this.parentQuest.getPerson(this.npcSymbol ?? null);
    const item = this.parentQuest.getItem(this.itemSymbol ?? null);
    if (place) hooks?.addDialog?.(uid, place.symbol.name, T.Location, false);
    if (person) hooks?.addDialog?.(uid, person.symbol.name, T.Person, false);
    if (item) hooks?.addDialog?.(uid, item.symbol.name, T.Thing, false);
    this.setComplete();
  }
}

export class RumorMill extends ActionTemplate {
  static typeName = 'RumorMill';
  get saveShape() { return [['id']]; }
  get pattern() { return /rumor mill (?<id>\d+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new RumorMill(parentQuest);
    action.id = questParseInt(match.groups.id);
    return action;
  }
  update(_caller) {
    const message = this.parentQuest.getMessage(this.id);
    this.parentQuest.hooks?.addQuestRumor?.(this.parentQuest.uid, message);
    this.setComplete();
  }
}

export class LegalRepute extends ActionTemplate {
  static typeName = 'LegalRepute';
  get saveShape() { return [['amount']]; }
  get pattern() { return /legal repute (?<amount>[+-]?\d+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new LegalRepute(parentQuest);
    action.amount = questParseInt(match.groups.amount);
    return action;
  }
  update(_caller) {
    this.parentQuest.hooks?.changeLegalRep?.(this.amount);
    this.setComplete();
  }
}

export class StartQuest extends ActionTemplate {
  static typeName = 'StartQuest';
  get saveShape() { return [['questIndex1'], ['questIndex2'], ['questName']]; }
  constructor(parentQuest) { super(parentQuest); this.allowRearm = false; }
  get pattern() { return /start quest (?<questIndex1>\d+) (?<questIndex2>\d+)|start quest (?<questName>\w+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new StartQuest(parentQuest);
    action.questIndex1 = questParseInt(g.questIndex1 ?? '');
    action.questIndex2 = questParseInt(g.questIndex2 ?? '');
    action.questName = g.questName ?? '';
    return action;
  }
  update(_caller) {
    if (!this.questName && this.questIndex1 > 0) {
      this.questName = `S${String(this.questIndex1).padStart(7, '0')}`;
    }
    this.parentQuest.hooks?.startQuest?.(this.questName);
    this.setComplete();
  }
}

export const YOU_RECEIVE_GOLD_PIECES = 'You receive %s gold pieces.';

// Each partner's copy pays its own reward, so a shared quest pays gold in shares of the party size.
export function shareQuestGold(quest, dfItem) {
  const shares = quest?.hooks?.rewardShares?.(quest) ?? 1;
  if (!(shares > 1) || !isGoldPieces(dfItem)) return false;
  dfItem.stackCount = Math.max(1, Math.floor((dfItem.stackCount ?? 0) / shares));
  quest.hooks?.addHUDText?.(`Your share of the party's reward: ${dfItem.stackCount} gold.`);
  return true;
}

export class GivePc extends ActionTemplate {
  static typeName = 'GivePc';
  get saveShape() { return [['itemSymbol', 'sym'], ['textId'], ['isNothing'], ['silently']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.allowRearm = false;
    this.offerImmediately = false;
    this.waitingForTown = false;
    this.ticksUntilFire = 0;
  }
  get pattern() {
    return /give pc (?<nothing>nothing)|give pc (?<anItem>[a-zA-Z0-9_.]+) notify (?<id>\d+)|give pc (?<anItem2>[a-zA-Z0-9_.]+) (?<silently>silently)|give pc (?<anItem3>[a-zA-Z0-9_.]+)/;
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new GivePc(parentQuest);
    action.itemSymbol = new QuestSymbol(g.anItem ?? g.anItem2 ?? g.anItem3 ?? '');
    action.textId = questParseInt(g.id ?? '');
    action.isNothing = !!g.nothing;
    action.silently = !!g.silently;
    return action;
  }
  update(_caller) {
    const minHour = 7, maxHour = 18, minDelay = 40, maxDelay = 500;
    const hooks = this.parentQuest.hooks;

    if ((this.textId !== 0 || this.silently) && !this.offerImmediately) {
      const now = dateFromSeconds(skySecondsOf(this.parentQuest));
      if (!hooks?.isPlayerInTown?.() || now.hour < minHour || now.hour > maxHour) {
        this.waitingForTown = true;
        this.ticksUntilFire = 0;
        return;
      }
      if (this.waitingForTown) {
        const roll = this.parentQuest.rolls ?? Math.random;
        this.ticksUntilFire = minDelay + Math.floor(roll() * (maxDelay + 1 - minDelay));
        this.waitingForTown = false;
        // A pending offer lets the next rest or fast travel press hand the item over at once.
        hooks?.onOfferPending?.(this);
      }
    }
    if (this.ticksUntilFire > 0) { this.ticksUntilFire--; return; }

    if (this.isNothing) {
      this.parentQuest.hooks?.questReward?.(this.parentQuest, null);
      this._offerWithQuestComplete(null);
      this.setComplete();
      return;
    }
    const item = this.parentQuest.getItem(this.itemSymbol);
    if (!item) {
      console.warn(`[quest] Could not find Item resource symbol ${this.itemSymbol?.name}`);
      return;
    }
    if (item.goldPaid && isGoldPieces(item.daggerfallUnityItem)) {
      this.parentQuest.hooks?.questReward?.(this.parentQuest, null);
      this._offerWithQuestComplete(null);
      this.offerImmediately = false;
      this.setComplete();
      return;
    }
    if (isGoldPieces(item.daggerfallUnityItem)) item.goldPaid = true;
    // The reward hook scales the gold before the party split, so the HUD names a share of the scaled amount.
    this.parentQuest.hooks?.questReward?.(this.parentQuest, item.daggerfallUnityItem, item);
    shareQuestGold(this.parentQuest, item.daggerfallUnityItem);
    if (this.textId !== 0) {
      this.parentQuest.hooks?.giveItemToPlayer?.(item.daggerfallUnityItem, true);
      this.parentQuest.showMessagePopup(this.textId);
    } else if (this.silently) {
      this.parentQuest.hooks?.giveItemToPlayer?.(item.daggerfallUnityItem, true);
    } else {
      this._offerWithQuestComplete(item);
    }
    this.offerImmediately = false;
    this.setComplete();
  }
  offerImmediatelyNow() {
    this.waitingForTown = false;
    this.ticksUntilFire = 0;
    this.offerImmediately = true;
  }
  _offerWithQuestComplete(item) {
    this.parentQuest.questSuccess = true;
    this.parentQuest.showMessagePopup(QUEST_MESSAGES.QuestComplete);
    if (!item) return;
    makeItemPermanent(item.daggerfallUnityItem);
    this.parentQuest.hooks?.releaseQuestItem?.(this.parentQuest.uid, item);
    this.parentQuest.hooks?.offerReward?.(this.parentQuest, item.daggerfallUnityItem);
  }
}

export class GetItem extends ActionTemplate {
  static typeName = 'GetItem';
  get saveShape() { return [['itemSymbol', 'sym'], ['textId']]; }
  get pattern() {
    return /get item (?<anItem>[a-zA-Z0-9_.]+) saying (?<id>\d+)|get item (?<anItem2>[a-zA-Z0-9_.]+)/;
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new GetItem(parentQuest);
    action.itemSymbol = new QuestSymbol(g.anItem ?? g.anItem2);
    action.textId = questParseInt(g.id ?? '');
    return action;
  }
  update(_caller) {
    const item = this.parentQuest.getItem(this.itemSymbol);
    if (!item) {
      console.warn(`[quest] Could not find Item resource symbol ${this.itemSymbol?.name}`);
      return;
    }
    const hooks = this.parentQuest.hooks;
    hooks?.releaseQuestItem?.(this.parentQuest.uid, item);
    const dfItem = item.daggerfallUnityItem;
    if (dfItem && isGoldPieces(dfItem)) {
      // A quest's gold item pays once, since GetItem re-arms with its task and GivePc may hand over the same pile.
      if (!item.goldPaid) {
        item.goldPaid = true;
        // Only gold that a `give pc` also hands over is scaled as the quest's reward.
        const theReward = [...this.parentQuest.tasks.values()].some((t) => t.actions?.some((a) => a?.typeName === 'GivePc' && a.itemSymbol?.name === this.itemSymbol?.name));
        if (theReward) hooks?.questReward?.(this.parentQuest, dfItem, item);
        const amount = dfItem.stackCount ?? 0;
        hooks?.addGold?.(amount);
        hooks?.addHUDText?.(localizedText('youReceiveGoldPieces', YOU_RECEIVE_GOLD_PIECES).replaceAll('%s', String(amount)));
      }
    } else {
      hooks?.giveItemToPlayer?.(dfItem, true);
    }
    if (this.textId !== 0) this.parentQuest.showMessagePopup(this.textId);
    this.setComplete();
  }
}

export class TakeItem extends ActionTemplate {
  static typeName = 'TakeItem';
  get saveShape() { return [['itemSymbol', 'sym'], ['textId']]; }
  get pattern() {
    return /take (?<anItem>[a-zA-Z0-9_.]+) from pc saying (?<id>\d+)|take (?<anItem2>[a-zA-Z0-9_.]+) from pc/;
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new TakeItem(parentQuest);
    action.itemSymbol = new QuestSymbol(g.anItem ?? g.anItem2);
    action.textId = questParseInt(g.id ?? '');
    return action;
  }
  update(_caller) {
    const item = this.parentQuest.getItem(this.itemSymbol);
    if (!item) {
      console.warn(`[quest] Could not find Item resource symbol ${this.itemSymbol?.name}`);
      return;
    }
    this.parentQuest.hooks?.releaseQuestItem?.(this.parentQuest.uid, item);
    if (this.textId !== 0) this.parentQuest.showMessagePopup(this.textId);
    this.setComplete();
  }
}

export class HaveItem extends ActionTemplate {
  static typeName = 'HaveItem';
  get saveShape() { return [['targetItem', 'sym'], ['targetTask', 'sym']]; }
  get pattern() { return /have (?<targetItem>[a-zA-Z0-9_.-]+) set (?<targetTask>[a-zA-Z0-9_.-]+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new HaveItem(parentQuest);
    action.targetItem = new QuestSymbol(match.groups.targetItem);
    action.targetTask = new QuestSymbol(match.groups.targetTask);
    return action;
  }
  update(_caller) {
    const item = this.parentQuest.getItem(this.targetItem);
    if (!item) {
      this.setComplete();
      throw new Error(`Could not find Item resource symbol ${this.targetItem?.name}`);
    }
    // The carry branch never completes, so the task restarts every tick while the item is carried, as in C#.
    if (this.parentQuest.hooks?.carriesQuestItem?.(item)) {
      this.parentQuest.startTask(this.targetTask);
    }
  }
}

export class TotingItemAndClickedNpc extends ActionTemplate {
  static typeName = 'TotingItemAndClickedNpc';
  get saveShape() { return [['itemSymbol', 'sym'], ['npcSymbol', 'sym'], ['id']]; }
  constructor(parentQuest) { super(parentQuest); this.isTriggerCondition = true; }
  get pattern() {
    return /toting (?<anItem>[a-zA-Z0-9_.]+) and (?<anNPC>[a-zA-Z0-9_.-]+) clicked saying (?<id>\d+)|toting (?<anItem2>[a-zA-Z0-9_.]+) and (?<anNPC2>[a-zA-Z0-9_.-]+) clicked saying (?<idName>\w+)|toting (?<anItem3>[a-zA-Z0-9_.]+) and (?<anNPC3>[a-zA-Z0-9_.-]+) clicked/;
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new TotingItemAndClickedNpc(parentQuest);
    action.itemSymbol = new QuestSymbol(g.anItem ?? g.anItem2 ?? g.anItem3);
    action.npcSymbol = new QuestSymbol(g.anNPC ?? g.anNPC2 ?? g.anNPC3);
    action.id = questParseInt(g.id ?? '');
    if (action.id === 0 && g.idName) {
      action.id = questParseInt(staticMessagesTable().getValue('id', g.idName));
    }
    return action;
  }
  checkTrigger(caller) {
    if (caller.getTriggerValue()) return true;
    const person = this.parentQuest.getPerson(this.npcSymbol);
    if (!person) return false;
    const item = this.parentQuest.getItem(this.itemSymbol);
    if (!item) return false;
    if (person.hasPlayerClicked) {
      if (this.parentQuest.hooks?.carriesQuestItem?.(item)) {
        this.parentQuest.scheduleClickRearm(person);
        this.parentQuest.showMessagePopup(this.id);
        this.parentQuest.hooks?.releaseQuestItem?.(this.parentQuest.uid, item);
        return true;
      }
    }
    return false;
  }
}

export class GiveItem extends ActionTemplate {
  static typeName = 'GiveItem';
  get saveShape() { return [['itemSymbol', 'sym'], ['targetSymbol', 'sym']]; }
  get pattern() { return /give item (?<anItem>[a-zA-Z0-9_.]+) to (?<aResource>[a-zA-Z0-9_.]+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new GiveItem(parentQuest);
    action.itemSymbol = new QuestSymbol(match.groups.anItem);
    action.targetSymbol = new QuestSymbol(match.groups.aResource);
    return action;
  }
  update(_caller) {
    const item = this.parentQuest.getItem(this.itemSymbol);
    if (!item) {
      this.setComplete();
      throw new Error(`Could not find Item resource symbol ${this.itemSymbol?.name}`);
    }
    const target = this.parentQuest.getResource(this.targetSymbol);
    if (!target) {
      this.setComplete();
      throw new Error(`Could not find target resource symbol ${this.targetSymbol?.name}`);
    }
    if (target.isFoe) {
      target.queueItem(item.daggerfallUnityItem);
    } else {
      if (!target.questResourceBehaviour) return;
    }
    const hooks = this.parentQuest.hooks;
    if (hooks?.playerHasItem?.(item.daggerfallUnityItem)) {
      hooks?.removeItemFromPlayer?.(item.daggerfallUnityItem);
    }
    this.setComplete();
  }
}

export class MakePermanent extends ActionTemplate {
  static typeName = 'MakePermanent';
  get saveShape() { return [['target', 'sym']]; }
  get pattern() { return /make (?<target>[a-zA-Z0-9_.-]+) permanent/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new MakePermanent(parentQuest);
    action.target = new QuestSymbol(match.groups.target);
    return action;
  }
  update(_caller) {
    const item = this.parentQuest.getItem(this.target);
    if (!item) {
      this.setComplete();
      throw new Error(`Could not find Item resource symbol ${this.target?.name}`);
    }
    item.makePermanent();
    this.setComplete();
  }
}

export class PlaceNpc extends ActionTemplate {
  static typeName = 'PlaceNpc';
  get saveShape() { return [['npcSymbol', 'sym'], ['placeSymbol', 'sym'], ['marker']]; }
  get pattern() {
    return /place npc (?<anNPC>[a-zA-Z0-9_.-]+) at (?<aPlace>[a-zA-Z0-9_.-]+) marker (?<marker>\d+)|place npc (?<anNPC2>[a-zA-Z0-9_.-]+) at (?<aPlace2>[a-zA-Z0-9_.-]+)/;
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new PlaceNpc(parentQuest);
    action.npcSymbol = new QuestSymbol(g.anNPC ?? g.anNPC2);
    action.placeSymbol = new QuestSymbol(g.aPlace ?? g.aPlace2);
    action.marker = g.marker != null ? questParseInt(g.marker) : -1;
    return action;
  }
  update(_caller) {
    const hooks = this.parentQuest.hooks;
    if (!hooks?.hasSiteLink?.(this.parentQuest, this.placeSymbol)) {
      hooks?.createSiteLink?.(this.parentQuest, this.placeSymbol);
    }
    const person = this.parentQuest.getPerson(this.npcSymbol);
    if (!person) {
      this.setComplete();
      throw new Error(`Could not find Person resource symbol ${this.npcSymbol?.name}`);
    }
    if (person.isDestroyed) { this.setComplete(); return; }
    const place = this.parentQuest.getPlace(this.placeSymbol);
    if (!place) {
      this.setComplete();
      throw new Error(`Could not find Place resource symbol ${this.placeSymbol?.name}`);
    }
    if (person.isIndividualNPC && person.isIndividualAtHome) {
      console.warn(`[quest] Quest tried to place Person ${person.displayName} [_${person.symbol.name}_] at Place _${place.symbol.name}_ but they are supposed to be atHome`);
      this.setComplete();
      return;
    }
    place.assignQuestResource(person.symbol, this.marker);
    person.setAssignedPlaceSymbol(this.placeSymbol);
    person.isHidden = false;
    hooks?.forceTopicListsUpdate?.();
    this.setComplete();
  }
}

export class PlaceItem extends ActionTemplate {
  static typeName = 'PlaceItem';
  get saveShape() { return [['itemSymbol', 'sym'], ['placeSymbol', 'sym'], ['marker'], ['markerPreference']]; }
  get pattern() {
    return /place item (?<anItem>[a-zA-Z0-9_.-]+) at (?<aPlace>[a-zA-Z0-9_.-]+) marker (?<marker>\d+)|place item (?<anItem2>[a-zA-Z0-9_.-]+) at (?<aPlace2>[a-zA-Z0-9_.-]+) questmarker (?<questmarker>\d+)|place item (?<anItem3>[a-zA-Z0-9_.-]+) at (?<aPlace3>[a-zA-Z0-9_.-]+) (?<anymarker>anymarker)|place item (?<anItem4>[a-zA-Z0-9_.-]+) at (?<aPlace4>[a-zA-Z0-9_.-]+)/;
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new PlaceItem(parentQuest);
    action.itemSymbol = new QuestSymbol(g.anItem ?? g.anItem2 ?? g.anItem3 ?? g.anItem4);
    action.placeSymbol = new QuestSymbol(g.aPlace ?? g.aPlace2 ?? g.aPlace3 ?? g.aPlace4);
    action.marker = -1;
    action.markerPreference = MARKER_PREFERENCE.Default;
    if (g.marker != null) action.marker = questParseInt(g.marker);
    if (g.questmarker != null) {
      action.marker = questParseInt(g.questmarker);
      action.markerPreference = MARKER_PREFERENCE.UseQuestMarker;
    }
    if (g.anymarker != null) action.markerPreference = MARKER_PREFERENCE.AnyMarker;
    return action;
  }
  update(_caller) {
    const hooks = this.parentQuest.hooks;
    if (!hooks?.hasSiteLink?.(this.parentQuest, this.placeSymbol)) {
      hooks?.createSiteLink?.(this.parentQuest, this.placeSymbol);
    }
    const item = this.parentQuest.getItem(this.itemSymbol);
    if (!item) {
      this.setComplete();
      throw new Error(`Could not find Item resource symbol ${this.itemSymbol?.name}`);
    }
    const place = this.parentQuest.getPlace(this.placeSymbol);
    if (!place) {
      this.setComplete();
      throw new Error(`Could not find Place resource symbol ${this.placeSymbol?.name}`);
    }
    place.assignQuestResource(item.symbol, this.marker, this.markerPreference);
    this.setComplete();
  }
}

export class PlaceFoe extends ActionTemplate {
  static typeName = 'PlaceFoe';
  get saveShape() { return [['foeSymbol', 'sym'], ['placeSymbol', 'sym'], ['marker']]; }
  get pattern() {
    return /place foe (?<aFoe>[a-zA-Z0-9_.-]+) at (?<aPlace>[a-zA-Z0-9_.-]+) marker (?<marker>\d+)|place foe (?<aFoe2>[a-zA-Z0-9_.-]+) at (?<aPlace2>[a-zA-Z0-9_.-]+)/;
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new PlaceFoe(parentQuest);
    action.foeSymbol = new QuestSymbol(g.aFoe ?? g.aFoe2);
    action.placeSymbol = new QuestSymbol(g.aPlace ?? g.aPlace2);
    action.marker = g.marker != null ? questParseInt(g.marker) : -1;
    return action;
  }
  update(_caller) {
    const hooks = this.parentQuest.hooks;
    if (!hooks?.hasSiteLink?.(this.parentQuest, this.placeSymbol)) {
      hooks?.createSiteLink?.(this.parentQuest, this.placeSymbol);
    }
    const foe = this.parentQuest.getFoe(this.foeSymbol);
    if (!foe) {
      this.setComplete();
      throw new Error(`Could not find Foe resource symbol ${this.foeSymbol?.name}`);
    }
    const place = this.parentQuest.getPlace(this.placeSymbol);
    if (!place) {
      this.setComplete();
      throw new Error(`Could not find Place resource symbol ${this.placeSymbol?.name}`);
    }
    place.assignQuestResource(foe.symbol, this.marker);
    this.setComplete();
  }
}

export class PcAt extends ActionTemplate {
  static typeName = 'PcAt';
  get saveShape() { return [['placeSymbol', 'sym'], ['taskSymbol', 'sym'], ['textId'], ['textShown'], ['p1'], ['p2'], ['p3']]; }
  get pattern() {
    return /pc at (?<aPlace>[a-zA-Z0-9_.-]+) set (?<aTask>[a-zA-Z0-9_.]+) saying (?<id>\d+)|pc at (?<aPlace2>[a-zA-Z0-9_.-]+) set (?<aTask2>[a-zA-Z0-9_.]+)|pc at (?<aPlace3>[a-zA-Z0-9_.-]+) do (?<aTask3>[a-zA-Z0-9_.]+) saying (?<id2>\d+)|pc at (?<aPlace4>[a-zA-Z0-9_.-]+) do (?<aTask4>[a-zA-Z0-9_.]+)|pc at any (?<placeType>\w+) set (?<aTask5>[a-zA-Z0-9_.]+) saying (?<id3>\d+)|pc at any (?<placeType2>\w+) set (?<aTask6>[a-zA-Z0-9_.]+)|pc at any (?<placeType3>\w+) do (?<aTask7>[a-zA-Z0-9_.]+) saying (?<id4>\d+)|pc at any (?<placeType4>\w+) do (?<aTask8>[a-zA-Z0-9_.]+)/;
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new PcAt(parentQuest);
    const placeType = g.placeType ?? g.placeType2 ?? g.placeType3 ?? g.placeType4;
    if (!placeType) {
      action.placeSymbol = new QuestSymbol(g.aPlace ?? g.aPlace2 ?? g.aPlace3 ?? g.aPlace4);
    } else {
      const table = placesTable();
      if (!table.hasValue(placeType)) throw new Error(`PcAt: Could not find place type name in data table: '${placeType}'`);
      const p1 = customParseInt(table.getValue('p1', placeType));
      if (p1 !== 0 && p1 !== 1) {
        throw new Error('PcAt: This trigger condition can only be used with building types (p1=0) and dungeon types (p1=1) in Quests-Places table.');
      }
      action.p1 = p1;
      action.p2 = customParseInt(table.getValue('p2', placeType));
      action.p3 = customParseInt(table.getValue('p3', placeType));
      action.placeSymbol = null;
    }
    action.taskSymbol = new QuestSymbol(g.aTask ?? g.aTask2 ?? g.aTask3 ?? g.aTask4 ?? g.aTask5 ?? g.aTask6 ?? g.aTask7 ?? g.aTask8);
    action.textId = questParseInt(g.id ?? g.id2 ?? g.id3 ?? g.id4 ?? '');
    action.textShown = false;
    return action;
  }
  update(_caller) {
    let result;
    if (this.placeSymbol !== null) {
      const place = this.parentQuest.getPlace(this.placeSymbol);
      if (!place) return;
      result = place.isPlayerHere();
    } else {
      const world = this.parentQuest.hooks?.world;
      result = this.p1 === 1 ? isPlayerAtDungeonType(world, this.p2) : isPlayerAtBuildingType(world, this.p2, this.p3);
    }
    if (result) {
      if (this.textId !== 0 && !this.textShown) {
        this.parentQuest.showMessagePopup(this.textId);
        this.textShown = true;
      }
      this.parentQuest.startTask(this.taskSymbol);
    } else {
      this.parentQuest.clearTask(this.taskSymbol);
    }
  }
}

export class RevealLocation extends ActionTemplate {
  static typeName = 'RevealLocation';
  get saveShape() { return [['placeSymbol', 'sym'], ['readMap']]; }
  get pattern() { return /reveal (?<aPlace>[a-zA-Z0-9_.-]+) (?<readMap>readmap)|reveal (?<aPlace2>[a-zA-Z0-9_.-]+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new RevealLocation(parentQuest);
    action.placeSymbol = new QuestSymbol(g.aPlace ?? g.aPlace2);
    action.readMap = !!g.readMap;
    return action;
  }
  update(_caller) {
    const place = this.parentQuest.getPlace(this.placeSymbol);
    if (!place) return;
    const world = this.parentQuest.hooks?.world;
    world?.discoverLocation?.(place.siteDetails?.regionName, place.siteDetails?.locationName);
    if (this.readMap) {
      world?.addNote?.(localizedText('readMap', READ_MAP_NOTE).replaceAll('%map', place.siteDetails?.locationName ?? ''));
    }
    this.setComplete();
  }
}

export class TeleportPc extends ActionTemplate {
  static typeName = 'TeleportPc';
  get saveShape() { return [['targetPlace', 'sym'], ['targetMarker']]; }
  constructor(parentQuest) {
    super(parentQuest);
    // The resume fields are not saved, so a teleport in flight runs again whole after a load.
    this.resumePending = false;
    this.resumePosition = null;
  }
  get pattern() {
    return /teleport pc to (?<aPlace>[a-zA-Z0-9_.-]+)|transfer pc inside (?<aPlace2>[a-zA-Z0-9_.-]+) marker (?<marker>\d+)/;
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new TeleportPc(parentQuest);
    action.targetPlace = new QuestSymbol(g.aPlace ?? g.aPlace2);
    action.targetMarker = g.marker != null ? questParseInt(g.marker) : -1;
    return action;
  }
  rearmAction() {
    super.rearmAction();
    this.resumePending = false;
  }
  update(_caller) {
    const hooks = this.parentQuest.hooks;
    const world = hooks?.world;
    if (world?.isRespawning?.()) return;
    if (this.resumePending) {
      world.setPlayerScenePosition?.(this.resumePosition);
      this.resumePending = false;
      this.setComplete();
      return;
    }
    // The site link is written before the transport check, because other actions read it even with no transport.
    if (!hooks?.hasSiteLink?.(this.parentQuest, this.targetPlace)) {
      hooks?.createSiteLink?.(this.parentQuest, this.targetPlace);
    }
    const place = this.parentQuest.getPlace(this.targetPlace);
    if (!place) return;
    let usingMarker = false;
    let marker = null;
    // The marker array is read unguarded as in C#, so a site without markers throws before any respawn begins.
    if (this.targetMarker >= 0 && this.targetMarker < place.siteDetails.questSpawnMarkers.length) {
      marker = place.siteDetails.questSpawnMarkers[this.targetMarker];
      usingMarker = true;
    }
    if (!world?.respawnPlayerAtSite) return;
    if (!world.respawnPlayerAtSite(place)) return;
    if (!usingMarker) marker = place.siteDetails.questSpawnMarkers[0];
    this.resumePosition = markerScenePosition(marker);
    this.resumePending = true;
  }
}

export class DroppedItemAtPlace extends ActionTemplate {
  static typeName = 'DroppedItemAtPlace';
  get saveShape() { return [['itemSymbol', 'sym'], ['placeSymbol', 'sym'], ['textId'], ['textShown']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.isTriggerCondition = true;
    this.isAlwaysOnTriggerCondition = true;
  }
  get pattern() {
    return /dropped (?<anItem>[a-zA-Z0-9_.-]+) at (?<aPlace>[a-zA-Z0-9_.-]+) saying (?<id>\d+)|dropped (?<anItem2>[a-zA-Z0-9_.-]+) at (?<aPlace2>[a-zA-Z0-9_.-]+)/;
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new DroppedItemAtPlace(parentQuest);
    action.itemSymbol = new QuestSymbol(g.anItem ?? g.anItem2);
    action.placeSymbol = new QuestSymbol(g.aPlace ?? g.aPlace2);
    action.textId = questParseInt(g.id ?? '');
    action.textShown = false;
    return action;
  }
  checkTrigger(caller) {
    if (caller.getTriggerValue()) return true;
    const item = this.parentQuest.getItem(this.itemSymbol);
    if (!item) return false;
    const place = this.parentQuest.getPlace(this.placeSymbol);
    if (!place) return false;
    item.actionWatching = true;
    if (place.isPlayerHere()) {
      item.allowDrop = true;
    } else {
      item.allowDrop = false;
      return false;
    }
    if (item.playerDropped) {
      if (this.textId !== 0 && !this.textShown) {
        this.parentQuest.showMessagePopup(this.textId);
        this.textShown = true;
      }
      this.setComplete();
      return true;
    }
    return false;
  }
}

export class ChangeReputeWith extends ActionTemplate {
  static typeName = 'ChangeReputeWith';
  get saveShape() { return [['target', 'sym'], ['amount']]; }
  constructor(parentQuest) { super(parentQuest); this.allowRearm = false; }
  get pattern() { return /change repute with (?<target>[a-zA-Z0-9_.-]+) by (?<sign>[+-])(?<amount>\d+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new ChangeReputeWith(parentQuest);
    action.target = new QuestSymbol(g.target);
    action.amount = (g.sign === '-' ? -1 : 1) * questParseInt(g.amount);
    return action;
  }
  update(_caller) {
    const person = this.parentQuest.getPerson(this.target);
    if (!person) { this.setComplete(); return; }
    this.parentQuest.hooks?.changeReputation?.(person.factionId, this.amount, true);
    this.setComplete();
  }
}

export class ReputeExceedsDo extends ActionTemplate {
  static typeName = 'ReputeExceedsDo';
  get saveShape() { return [['npcSymbol', 'sym'], ['taskSymbol', 'sym'], ['minReputation']]; }
  get pattern() { return /repute with (?<npcSymbol>[a-zA-Z0-9_.-]+) exceeds (?<minReputation>\d+) do (?<taskSymbol>[a-zA-Z0-9_.]+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new ReputeExceedsDo(parentQuest);
    action.npcSymbol = new QuestSymbol(g.npcSymbol);
    action.minReputation = questParseInt(g.minReputation);
    action.taskSymbol = new QuestSymbol(g.taskSymbol);
    return action;
  }
  update(_caller) {
    const person = this.parentQuest.getPerson(this.npcSymbol);
    if (!person) return;
    if ((this.parentQuest.hooks?.getReputation?.(person.factionId) ?? 0) < this.minReputation) return;
    this.parentQuest.startTask(this.taskSymbol);
    this.setComplete();
  }
}

export class CreateNpc extends ActionTemplate {
  static typeName = 'CreateNpc';
  get saveShape() { return [['npcSymbol', 'sym']]; }
  get pattern() { return /create npc (?<anNPC>[a-zA-Z0-9_.-]+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new CreateNpc(parentQuest);
    action.npcSymbol = new QuestSymbol(match.groups.anNPC);
    return action;
  }
  update(_caller) {
    const person = this.parentQuest.getPerson(this.npcSymbol);
    if (!person) {
      this.setComplete();
      throw new Error(`Could not find Person resource symbol ${this.npcSymbol?.name}`);
    }
    person.placeAtHome();
    this.setComplete();
  }
}

export class CreateFoe extends ActionTemplate {
  static typeName = 'CreateFoe';
  get saveShape() { return [['foeSymbol', 'sym'], ['lastSpawnTime'], ['spawnInterval'], ['spawnMaxTimes'], ['spawnChance'], ['spawnCounter'], ['isSendAction'], ['msgMessageID']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.foeSymbol = null;
    this.spawnInterval = 0;
    this.spawnMaxTimes = -1;
    this.spawnChance = 0;
    this.msgMessageID = -1;
    this.lastSpawnTime = 0;
    this.spawnCounter = 0;
    this.isSendAction = false;
    // The fields below are not saved, so a load loses a wave in flight as C# does.
    this._lastTick = null;
    this._lastRaised = null;
    this._awaited = null;
    this._arrived = false;
    this.spawnInProgress = false;
    this.pendingFoes = null;
    this.pendingFoesSpawned = 0;
  }

  get pattern() {
    return new RegExp(
      'create foe (?<symbol>[a-zA-Z0-9_.-]+) every (?<minutes>\\d+) minutes (?<infinite>indefinitely) with (?<percent>\\d+)% success'
      + '|create foe (?<symbol2>[a-zA-Z0-9_.-]+) every (?<minutes2>\\d+) minutes (?<count>\\d+) times with (?<percent2>\\d+)% success'
      + '|(?<send>send) (?<symbol3>[a-zA-Z0-9_.-]+) every (?<minutes3>\\d+) minutes (?<count2>\\d+) times with (?<percent3>\\d+)% success'
      + '|(?<send2>send) (?<symbol4>[a-zA-Z0-9_.-]+) every (?<minutes4>\\d+) minutes with (?<percent4>\\d+)% success');
  }

  initialiseOnSet() {
    this.lastSpawnTime = 0;
    this.spawnCounter = 0;
  }

  onTransitionExterior() {
    this.pendingFoes = null;
    this.spawnInProgress = false;
  }

  onInitWorld() {
    this.pendingFoes = null;
    this.spawnInProgress = false;
  }

  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new CreateFoe(parentQuest);
    action.foeSymbol = new QuestSymbol(g.symbol ?? g.symbol2 ?? g.symbol3 ?? g.symbol4);
    action.spawnInterval = questParseInt(g.minutes ?? g.minutes2 ?? g.minutes3 ?? g.minutes4) * 60;
    const count = g.count ?? g.count2;
    action.spawnMaxTimes = count != null ? questParseInt(count) : 0;
    action.spawnChance = questParseInt(g.percent ?? g.percent2 ?? g.percent3 ?? g.percent4);
    if (g.infinite != null) action.spawnMaxTimes = -1;
    if ((g.send ?? g.send2) != null) {
      action.isSendAction = true;
      if (action.spawnMaxTimes === 0) action.spawnMaxTimes = -1;
    }
    // Options are sliced by match length as in C#, and a later `msg` option replaces an earlier one.
    for (const msg of source.slice(match[0].length).matchAll(/msg (?<msgId>\d+)/g)) {
      action.msgMessageID = questParseInt(msg.groups.msgId);
    }
    return action;
  }

  // The draw is taken even for a zero interval, so the quest's roll stream matches C#.
  _range(n) { return Math.floor((this.parentQuest?.rolls ?? Math.random)() * n); }

  // Online, a wave the quest waits on first arrives within the short wait instead of a full interval.
  // `_arrived` survives a re-set, so a re-armed wave that has already come is not a first arrival again.
  _firstArrivalSeconds() {
    if (this.spawnCounter > 0 || this._arrived || !questWaitsShort(this.parentQuest)) return this.spawnInterval;
    this._awaited ??= waveIsAwaited(this.parentQuest, this.foeSymbol?.name);
    if (!this._awaited || (this.parentQuest.getFoe(this.foeSymbol)?.killCount ?? 0) > 0) return this.spawnInterval;
    return Math.min(this.spawnInterval, ONLINE_DELAY_SECONDS);
  }

  update(_caller) {
    const world = this.parentQuest.hooks?.world;
    if (!world?.createFoeGameObjects) return;

    const gameSeconds = this.parentQuest.nowSeconds?.() ?? 0;
    const step = this.parentQuest.questClockStepMax?.() ?? Infinity;
    const raisedNow = this.parentQuest.raisedSeconds?.() ?? null;
    const first = this._firstArrivalSeconds();
    // Online the interval counts played time as the quest clock does, so raised time and long gaps are forgiven.
    if (this.lastSpawnTime === 0) { this.lastSpawnTime = gameSeconds - (this.spawnInterval - first) - this._range(first); this._lastTick = gameSeconds; }
    else if (this._lastTick == null) { if (Number.isFinite(step) && (gameSeconds - this.lastSpawnTime > step || gameSeconds < this.lastSpawnTime)) this.lastSpawnTime = gameSeconds; this._lastTick = gameSeconds; }
    else if (Number.isFinite(step) && gameSeconds < this._lastTick) { this.lastSpawnTime = gameSeconds; this._lastTick = gameSeconds; }
    else { const raised = Number.isFinite(step) ? Math.min(raisedSince(raisedNow, this._lastRaised), gameSeconds - this._lastTick) : 0; const forgiven = Math.max(0, gameSeconds - this._lastTick - raised - step) + raised; if (forgiven > 0) this.lastSpawnTime += forgiven; this._lastTick = gameSeconds; }
    if (first < this.spawnInterval && !this.spawnInProgress) this.lastSpawnTime = Math.min(this.lastSpawnTime, gameSeconds - (this.spawnInterval - first));
    this._lastRaised = raisedNow;

    if (this.spawnCounter >= this.spawnMaxTimes && this.spawnMaxTimes !== -1) return;

    if (this.spawnInProgress && this.pendingFoesSpawned >= this.pendingFoes.length) {
      this.spawnInProgress = false;
      this.spawnCounter++;
      this._arrived = true;
      return;
    }

    if (gameSeconds >= this.lastSpawnTime + this.spawnInterval && !this.spawnInProgress) {
      // The interval is spent before the chance roll, so a failed roll waits a full cycle.
      this.lastSpawnTime = gameSeconds;
      if (this._range(100) >= this.spawnChance) return;
      const foe = this.parentQuest.getFoe(this.foeSymbol);
      if (!foe) {
        this.setComplete();
        // `this.symbol` is never assigned, matching C#; the quest error-terminates either way.
        throw new Error(`create foe could not find Foe with symbol name ${this.symbol?.name}`);
      }
      // A hidden or kept-off wave spends its interval and leaves no wave pending, so it raises no encounter.
      if (foe.isHidden) return;
      if (world.foeKeptOff?.(foe)) return;
      this._createPendingFoeSpawn(world, foe);
    }

    if (this.spawnInProgress) {
      // A send wave waiting for a town raises no encounter, so it does not break rests or travel.
      if (this.isSendAction && !world.isPlayerInLocationRect?.()) return;
      this._tryPlacement(world);
      world.raiseOnEncounterEvent?.();
    }
  }

  restoreSaveData(dataIn) {
    super.restoreSaveData(dataIn);
    if (dataIn == null) return;
    // As in C#, a zero spawn time is stamped now on load, so the first wave waits a full interval with no draw.
    if (this.lastSpawnTime === 0) this.lastSpawnTime = this.parentQuest?.nowSeconds?.() ?? 0;
  }

  _createPendingFoeSpawn(world, foe) {
    this.pendingFoes = world.createFoeGameObjects(foe, foe.spawnCount) ?? null;
    if (!this.pendingFoes || this.pendingFoes.length !== foe.spawnCount) {
      this.setComplete();
      throw new Error(`create foe attempted to create ${foe.spawnCount}x${foe.foeType} GameObjects and failed.`);
    }
    this.spawnInProgress = true;
    this.pendingFoesSpawned = 0;
  }

  _tryPlacement(world) {
    if (this.isSendAction && !world.isPlayerInLocationRect?.()) return;
    if (!world.tryPlaceFoe?.(this.pendingFoes[this.pendingFoesSpawned])) return;
    if (this.msgMessageID !== -1) {
      this.parentQuest.showMessagePopup(this.msgMessageID, false, true);
      this.msgMessageID = -1;
    }
    this.pendingFoesSpawned++;
  }
}

export class CastSpellOnFoe extends ActionTemplate {
  static typeName = 'CastSpellOnFoe';
  get saveShape() { return [['spell'], ['foeSymbol', 'sym']]; }
  get pattern() {
    return /cast (?<aSpell>[a-zA-Z0-9'_.-]+) spell on (?<aFoe>[a-zA-Z0-9_.-]+)|cast (?<aCustomSpell>[a-zA-Z0-9_.-]+) custom spell on (?<aFoe2>[a-zA-Z0-9_.-]+)/;
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new CastSpellOnFoe(parentQuest);
    action.foeSymbol = new QuestSymbol(g.aFoe ?? g.aFoe2 ?? '');
    action.spell = { classicId: 0, customKey: g.aCustomSpell ?? '' };
    if (!action.spell.customKey) {
      const table = spellsTable();
      if (table.hasValue(g.aSpell)) {
        action.spell.classicId = questParseInt(table.getValue('id', g.aSpell));
      } else {
        console.warn(`[quest] CastSpellOnFoe could not resolve classic spell '${g.aSpell}' in Quests-Spells data table`);
        // C# completes the template here, not the action, so the line still mints an action with spell id 0.
        this.setComplete();
      }
    }
    return action;
  }
  update(_caller) {
    const foe = this.parentQuest.getFoe(this.foeSymbol);
    if (!foe) {
      this.setComplete();
      throw new Error(`CastSpellOnFoe could not find Foe with symbol name ${this.symbol?.name}`);
    }
    foe.queueSpell(this.spell);
    this.setComplete();
  }
}

// The value is saved, so it keeps the C# sentinel 0xffff rather than -1.
const LOCATION_TYPE_NONE = 0xffff;

export class WhenPcEntersExits extends ActionTemplate {
  static typeName = 'WhenPcEntersExits';
  get saveShape() { return [['onEnter'], ['sourceExteriorType'], ['indexExteriorType'], ['currentLocationType'], ['previousLocationType']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.isTriggerCondition = true;
    this.onEnter = true;
    this.sourceExteriorType = '';
    this.indexExteriorType = -1;
    this.currentLocationType = LOCATION_TYPE_NONE;
    this.previousLocationType = LOCATION_TYPE_NONE;
    this._wasInRect = false;
  }
  get pattern() { return /when pc (?<enters>enters) (?<exteriorType>\w+)|when pc (?<exits>exits) (?<exteriorType2>\w+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const action = new WhenPcEntersExits(parentQuest);
    if (g.enters != null) action.onEnter = true;
    else if (g.exits != null) action.onEnter = false;
    else throw new Error("WhenPcEntersExits: Syntax is 'when pc enters exteriorType | when pc exits exteriorType");
    action.sourceExteriorType = g.exteriorType ?? g.exteriorType2;
    const table = placesTable();
    if (table.getInt('p1', action.sourceExteriorType) !== 2) {
      throw new Error('WhenPcEntersExits: This trigger condition can only be used with exterior types of p1=2 in Quests-Places table.');
    }
    action.indexExteriorType = table.getInt('p2', action.sourceExteriorType);
    const world = parentQuest?.hooks?.world;
    const loc = world?.currentLocation?.();
    // Seeding the flag here keeps a quest started inside a town from reading a false enter edge.
    action._wasInRect = Boolean(world?.isPlayerInLocationRect?.());
    if (action._wasInRect && loc?.loaded) {
      action.currentLocationType = loc.mapTableData.locationType;
    }
    return action;
  }
  // Types shift on edges of the rect flag, as the C# enter and exit events do, so a walk into a nearby town exits.
  _poll() {
    const world = this.parentQuest?.hooks?.world;
    const inRect = Boolean(world?.isPlayerInLocationRect?.());
    if (inRect === this._wasInRect) return;
    this._wasInRect = inRect;
    this.previousLocationType = this.currentLocationType;
    if (!inRect) {
      this.currentLocationType = LOCATION_TYPE_NONE;
      return;
    }
    const loc = world?.currentLocation?.();
    this.currentLocationType = loc?.loaded ? loc.mapTableData.locationType : LOCATION_TYPE_NONE;
  }
  _hasEnteredTarget() {
    if (!this.onEnter || this.currentLocationType === LOCATION_TYPE_NONE) return false;
    if (this.indexExteriorType === -1) return true;
    return this.indexExteriorType === this.currentLocationType;
  }
  _hasExitedTarget() {
    if (this.onEnter || this.previousLocationType === LOCATION_TYPE_NONE) return false;
    if (this.indexExteriorType === -1) return true;
    return this.indexExteriorType === this.previousLocationType;
  }
  checkTrigger(_caller) {
    this._poll();
    return this._hasEnteredTarget() || this._hasExitedTarget();
  }
}

export class WhenNpcIsAvailable extends ActionTemplate {
  static typeName = 'WhenNpcIsAvailable';
  get saveShape() { return [['npcName'], ['npcFactionID']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.isTriggerCondition = true;
    this.isAlwaysOnTriggerCondition = true;
    this.npcName = '';
    this.npcFactionID = -1;
    this.clickMemory = null;
  }
  get pattern() { return /when (?<individualNPCName>[a-zA-Z0-9_.-]+) is available/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new WhenNpcIsAvailable(parentQuest);
    const name = match.groups.individualNPCName;
    const factionID = getIndividualFactionID(name);
    const world = parentQuest?.hooks?.world;
    if (factionID !== -1 && world) {
      const factionData = getFactionDataOrThrow(world, factionID);
      if (factionData.type !== 4) {
        this.setComplete();
        throw new Error(`WhenNpcIsAvailable: NPC ${name} with FactionID ${factionID} is not an individual NPC`);
      }
    }
    action.npcName = name;
    action.npcFactionID = factionID;
    return action;
  }
  checkTrigger(_caller) {
    const hooks = this.parentQuest?.hooks;
    hooks?.addFactionListener?.(this.npcFactionID, this);
    const lastClicked = hooks?.lastNPCClicked?.() ?? null;
    if (!lastClicked) return false;
    // Hosts build a new NPC object per click, so the same NPC is matched by its data, not by reference.
    const sameNPC = hooks?.isNPCDataEqual
      ? hooks.isNPCDataEqual(lastClicked, this.clickMemory)
      : lastClicked === this.clickMemory;
    if (this.clickMemory && sameNPC) return false;
    this.clickMemory = null;
    if (lastClicked.factionID !== this.npcFactionID) return false;
    const foundActive = hooks?.activeFactionPersons?.(this.npcFactionID) ?? [];
    if (foundActive.length === 0) {
      this.clickMemory = lastClicked;
      return true;
    }
    return false;
  }
  dispose() {
    super.dispose();
    this.parentQuest?.hooks?.removeFactionListener?.(this.npcFactionID);
  }
}

export class WhenReputeWith extends ActionTemplate {
  static typeName = 'WhenReputeWith';
  get saveShape() { return [['npcName'], ['npcFactionID'], ['minRepValue']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.isTriggerCondition = true;
    this.isAlwaysOnTriggerCondition = true;
    this.npcName = '';
    this.npcFactionID = -1;
    this.minRepValue = 0;
  }
  get pattern() { return /when repute with (?<individualNPCName>[a-zA-Z0-9_.-]+) is at least (?<minRepValue>\d+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new WhenReputeWith(parentQuest);
    const name = match.groups.individualNPCName;
    const factionID = getIndividualFactionID(name);
    const world = parentQuest?.hooks?.world;
    if (factionID !== -1 && world) {
      const factionData = getFactionDataOrThrow(world, factionID);
      if (factionData.type !== 4) {
        throw new Error(`WhenReputeWith: NPC ${name} with FactionID ${factionID} is not an individual NPC`);
      }
    }
    action.npcName = name;
    action.npcFactionID = factionID;
    action.minRepValue = questParseInt(match.groups.minRepValue);
    return action;
  }
  checkTrigger(_caller) {
    const record = this.parentQuest?.hooks?.world?.getFactionData?.(this.npcFactionID);
    if (!record) return false;
    return record.rep >= this.minRepValue;
  }
}

export class MakePcDiseased extends ActionTemplate {
  static typeName = 'MakePcDiseased';
  // textId is saved only when set, because a share or sync with fields an older copy lacks is refused as forged.
  get saveShape() { return this.textId ? [['diseaseType'], ['textId']] : [['diseaseType']]; }
  constructor(parentQuest) { super(parentQuest); this.diseaseType = -1; this.textId = 0; }
  restoreSaveData(dataIn) {
    super.restoreSaveData(dataIn);
    if (dataIn?.textId) this.textId = dataIn.textId;
  }
  get pattern() { return /make pc ill with (?<aDisease>[a-zA-Z0-9_.']+)(?: saying (?<id>\d+))?/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const name = match.groups.aDisease;
    const table = diseasesTable();
    if (!table.hasValue(name)) {
      throw new Error(`make pc ill with <aDisease> could not find disease matching '${name}'. See 'Quests-Diseases' table for valid disease names.`);
    }
    const action = new MakePcDiseased(parentQuest);
    action.diseaseType = questParseInt(table.getValue('id', name));
    action.textId = questParseInt(match.groups.id ?? '');
    return action;
  }
  update(_caller) {
    if (this.diseaseType !== -1) {
      this.parentQuest.hooks?.makePcDiseased?.(this.diseaseType);
    }
    if (this.textId) this.parentQuest.showMessagePopup(this.textId);
    this.setComplete();
  }
}

export class CurePcDisease extends ActionTemplate {
  static typeName = 'CurePcDisease';
  get saveShape() { return [['diseaseType'], ['isCureVampirism'], ['isCureLycanthropy']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.diseaseType = -1;
    this.isCureVampirism = false;
    this.isCureLycanthropy = false;
  }
  get pattern() { return /cure vampirism|cure lycanthropy|cure (?<aDisease>[a-zA-Z0-9_.']+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new CurePcDisease(parentQuest);
    const matched = match[0].toLowerCase();
    if (matched === 'cure vampirism') action.isCureVampirism = true;
    else if (matched === 'cure lycanthropy') action.isCureLycanthropy = true;
    else {
      const name = match.groups.aDisease;
      const table = diseasesTable();
      if (!table.hasValue(name)) {
        throw new Error(`cure <aDisease> could not find disease matching '${name}'. See 'Quests-Diseases' table for valid disease names.`);
      }
      action.diseaseType = questParseInt(table.getValue('id', name));
    }
    return action;
  }
  update(_caller) {
    const hooks = this.parentQuest.hooks;
    if (this.diseaseType !== -1) hooks?.cureDisease?.(this.diseaseType);
    else if (this.isCureVampirism) hooks?.endVampirism?.();
    else if (this.isCureLycanthropy) hooks?.endLycanthropy?.();
    this.setComplete();
  }
}

export class CastSpellDo extends ActionTemplate {
  static typeName = 'CastSpellDo';
  get saveShape() { return [['spellID'], ['classicEffects'], ['taskSymbol', 'sym']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.spellID = -1;
    this.classicEffects = null;
    this.taskSymbol = null;
    this.lastReadySpell = null;
    this._eventsBound = true;
  }
  get pattern() { return /cast (?<aSpell>[a-zA-Z0-9'_.-]+) spell do (?<aTask>[a-zA-Z0-9_.-]+)/; }

  // The ready-spell latch is action state: a cast clears it, and an aborted ready leaves it set.
  onNewReadySpell(spell) { if (this._eventsBound) this.lastReadySpell = spell ?? null; }

  onCastReadySpell(_spell) { if (this._eventsBound) this.lastReadySpell = null; }

  // Completing unbinds the ready-spell events and a rearm never binds them again, as in C#.
  setComplete() {
    super.setComplete();
    this._eventsBound = false;
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new CastSpellDo(parentQuest);
    const sourceSpellName = match.groups.aSpell;
    action.taskSymbol = new QuestSymbol(match.groups.aTask);
    const table = spellsTable();
    if (table.hasValue(sourceSpellName)) {
      action.spellID = questParseInt(table.getValue('id', sourceSpellName));
      const effects = parentQuest?.hooks?.world?.getClassicSpellEffects?.(action.spellID) ?? null;
      if (effects) {
        action.classicEffects = effects;
      } else {
        console.warn(`[quest] CastSpellDo could not find spell matching spellID '${this.spellID}' from spell '${sourceSpellName}'`);
        this.setComplete();
      }
    } else {
      console.warn(`[quest] CastSpellDo could not resolve spell '${sourceSpellName}' in Quests-Spells data table`);
      this.setComplete();
    }
    return action;
  }
  update(_caller) {
    const world = this.parentQuest.hooks?.world;
    // A shared copy read without a world holds no effects, so they load here from this world's spell records.
    if (this.spellID !== -1 && !this.classicEffects) this.classicEffects = world?.getClassicSpellEffects?.(this.spellID) ?? null;
    if (this.spellID === -1 || !this.classicEffects?.length || !this.taskSymbol || !this.lastReadySpell) {
      this.lastReadySpell = null;
      return;
    }
    // A mismatch consumes the latch, so each readied spell is checked once.
    let foundEffects = 0;
    for (const effect of this.classicEffects) {
      if (effect.type === -1) continue;
      foundEffects++;
      if (!world?.spellHasMatchForClassicEffect?.(this.lastReadySpell, effect)) {
        this.lastReadySpell = null;
        return;
      }
    }
    if (foundEffects === 0) {
      this.setComplete();
      return;
    }
    this.parentQuest.startTask(this.taskSymbol);
    this.setComplete();
  }
}

export class CastEffectDo extends ActionTemplate {
  static typeName = 'CastEffectDo';
  get saveShape() { return [['effectKey'], ['taskSymbol', 'sym']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.effectKey = null;
    this.taskSymbol = null;
    this.lastReadySpell = null;
    this._eventsBound = true;
  }
  get pattern() { return /cast (?<effectKey>[a-zA-Z0-9_.-]+) effect do (?<aTask>[a-zA-Z0-9_.-]+)/; }

  onNewReadySpell(spell) { if (this._eventsBound) this.lastReadySpell = spell ?? null; }

  onCastReadySpell(_spell) { if (this._eventsBound) this.lastReadySpell = null; }

  setComplete() {
    super.setComplete();
    this._eventsBound = false;
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new CastEffectDo(parentQuest);
    action.effectKey = match.groups.effectKey;
    action.taskSymbol = new QuestSymbol(match.groups.aTask);
    return action;
  }
  update(_caller) {
    if (!this.effectKey || !this.taskSymbol || !this.lastReadySpell) {
      this.lastReadySpell = null;
      return;
    }
    // Unlike CastSpellDo, a spell without the effect keeps the latch and is checked again each tick, as in C#.
    for (const effect of this.lastReadySpell.effects ?? []) {
      if (dfuEffectKeyOf(effect.type, effect.subType) === this.effectKey) {
        this.parentQuest.startTask(this.taskSymbol);
        this.setComplete();
        break;
      }
    }
  }
}

export class CreateNpcAt extends ActionTemplate {
  static typeName = 'CreateNpcAt';
  get saveShape() { return [['placeSymbol', 'sym']]; }
  get pattern() { return /create npc at (?<aPlace>[a-zA-Z0-9_.-]+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new CreateNpcAt(parentQuest);
    action.placeSymbol = new QuestSymbol(match.groups.aPlace);
    return action;
  }
  update(_caller) { this.setComplete(); }
}

export const READ_MAP_NOTE = 'Discovered the location of %map after studying a map.';

export class WhenSkillLevel extends ActionTemplate {
  static typeName = 'WhenSkillLevel';
  get saveShape() { return [['skill'], ['minSkillValue']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.isTriggerCondition = true;
    this.skill = -1;
    this.minSkillValue = 0;
  }
  get pattern() { return /when skill (?<skillName>\w+) is at least (?<minSkillValue>\d+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new WhenSkillLevel(parentQuest);
    const name = match.groups.skillName;
    if (!(name in SKILLS)) {
      this.setComplete();
      throw new Error(`SkillLevel: Skill name ${name} is not a known Daggerfall skill`);
    }
    action.skill = SKILLS[name];
    action.minSkillValue = questParseInt(match.groups.minSkillValue);
    return action;
  }
  checkTrigger(_caller) {
    const e = this.parentQuest.hooks?.playerEntity?.();
    return !!e && skillValue(e, this.skill) >= this.minSkillValue;
  }
}

export class WhenAttributeLevel extends ActionTemplate {
  static typeName = 'WhenAttributeLevel';
  get saveShape() { return [['attribute'], ['minAttributeValue']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.isTriggerCondition = true;
    this.attribute = '';
    this.minAttributeValue = 0;
  }
  get pattern() { return /when attribute (?<attributeName>\w+) is at least (?<minAttributeValue>\d+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new WhenAttributeLevel(parentQuest);
    const name = match.groups.attributeName;
    if (!STAT_KEYS_BY_ENUM[name]) {
      this.setComplete();
      throw new Error(`WhenAttributeLevel: Attribute name ${name} is not a known Daggerfall attribute`);
    }
    action.attribute = STAT_KEYS_BY_ENUM[name];
    action.minAttributeValue = questParseInt(match.groups.minAttributeValue);
    return action;
  }
  checkTrigger(_caller) {
    const e = this.parentQuest.hooks?.playerEntity?.();
    return !!e && liveStat(e, this.attribute) >= this.minAttributeValue;
  }
}
const STAT_KEYS_BY_ENUM = Object.freeze({
  Strength: 'strength', Intelligence: 'intelligence', Willpower: 'willpower',
  Agility: 'agility', Endurance: 'endurance', Personality: 'personality',
  Speed: 'speed', Luck: 'luck',
});

export class SeasonCondition extends ActionTemplate {
  static typeName = 'Season';
  get saveShape() { return [['season']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.isTriggerCondition = true;
    this.isAlwaysOnTriggerCondition = true;
    this.season = '';
  }
  get pattern() { return /season (?<season>fall|summer|spring|winter)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new SeasonCondition(parentQuest);
    action.season = match.groups.season;
    return action;
  }
  checkTrigger(_caller) {
    const hooks = this.parentQuest.hooks;
    const sec = (hooks?.skySeconds ?? hooks?.nowSeconds)?.();
    if (sec == null) return false;
    return SEASON_NAMES[seasonValue(dateFromSeconds(sec))]?.toLowerCase() === this.season;
  }
}

export class WeatherCondition extends ActionTemplate {
  static typeName = 'Weather';
  get saveShape() { return [['weather']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.isTriggerCondition = true;
    this.isAlwaysOnTriggerCondition = true;
    this.weather = '';
  }
  get pattern() { return /weather (?<weather>sunny|cloudy|overcast|fog|rain|thunder|snow)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new WeatherCondition(parentQuest);
    action.weather = match.groups.weather;
    return action;
  }
  checkTrigger(_caller) {
    return this.parentQuest.hooks?.world?.currentWeatherKey?.() === this.weather;
  }
}

export class ClimateCondition extends ActionTemplate {
  static typeName = 'Climate';
  get saveShape() { return [['climate'], ['climateBase']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.isTriggerCondition = true;
    this.isAlwaysOnTriggerCondition = true;
    this.climate = -1;
    this.climateBase = '';
  }
  // Longer climate names come first so `desert2` and `mountainwoods` match their own climates, unlike C#.
  get pattern() {
    return /climate (?<climate>desert2|desert|mountainwoods|mountain|rainforest|ocean|swamp|subtropical|hauntedwoodlands|woodlands)|climate (?<base>base) (?<climatebase>desert|mountain|temperate|swamp)/;
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new ClimateCondition(parentQuest);
    if (match.groups.base) {
      action.climateBase = match.groups.climatebase;
    } else {
      action.climate = QUEST_CLIMATES[match.groups.climate];
      if (action.climate == null) throw new Error("Climate: Syntax is 'climate desert|desert2|mountain|mountainwoods|rainforest|ocean|swamp|subtropical|woodlands|hauntedwoodlands'");
    }
    return action;
  }
  checkTrigger(_caller) {
    const idx = this.parentQuest.hooks?.world?.currentClimateIndex?.();
    if (idx == null) return false;
    if (this.climate !== -1) return idx === this.climate;
    return CLIMATE_BASE_OF[idx] === this.climateBase;
  }
}
const QUEST_CLIMATES = Object.freeze({
  ocean: 223, desert: 224, desert2: 225, mountain: 226, rainforest: 227,
  swamp: 228, subtropical: 229, mountainwoods: 230, woodlands: 231,
  hauntedwoodlands: 232,
});
const CLIMATE_BASE_OF = Object.freeze({
  223: 'temperate', 224: 'desert', 225: 'desert', 226: 'mountain',
  227: 'swamp', 228: 'swamp', 229: 'desert', 230: 'mountain',
  231: 'temperate', 232: 'temperate',
});

export class SetPlayerCrimeAction extends ActionTemplate {
  static typeName = 'SetPlayerCrime';
  get saveShape() { return [['playerCrime']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.playerCrime = 0;
  }
  get pattern() { return /setplayercrime (?<crime>[a-zA-Z_]+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new SetPlayerCrimeAction(parentQuest);
    const crime = match.groups.crime;
    if (!(crime in CRIMES)) {
      this.setComplete();
      throw new Error(`SetPlayerCrime: Crime ${crime} is not a known crime from PlayerEntity.Crimes enum.`);
    }
    action.playerCrime = CRIMES[crime];
    return action;
  }
  update(_caller) {
    this.parentQuest.hooks?.setPlayerCrime?.(this.playerCrime);
    this.setComplete();
  }
}

export class PayMoney extends ActionTemplate {
  static typeName = 'PayMoney';
  get saveShape() { return [['paidTaskSymbol', 'sym'], ['notTaskSymbol', 'sym'], ['amount'], ['goldOnly']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.paidTaskSymbol = null;
    this.notTaskSymbol = null;
    this.amount = 0;
    this.goldOnly = false;
  }
  get pattern() { return /pay (?<amount>\d+) (?<type>money|gold) do (?<paidTaskName>[a-zA-Z0-9_.]+) otherwise do (?<notTaskName>[a-zA-Z0-9_.]+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new PayMoney(parentQuest);
    action.amount = questParseInt(match.groups.amount);
    action.goldOnly = match.groups.type === 'gold';
    action.paidTaskSymbol = new QuestSymbol(match.groups.paidTaskName);
    action.notTaskSymbol = new QuestSymbol(match.groups.notTaskName);
    return action;
  }
  update(_caller) {
    const hooks = this.parentQuest.hooks;
    if (this.amount > 0) {
      const held = this.goldOnly ? (hooks?.getGoldPieces?.() ?? 0) : (hooks?.getTotalGold?.() ?? 0);
      if (held >= this.amount) {
        if (this.goldOnly) hooks?.deductGoldPieces?.(this.amount);
        else hooks?.deductGold?.(this.amount);
        this.parentQuest.startTask(this.paidTaskSymbol);
      } else {
        this.parentQuest.startTask(this.notTaskSymbol);
      }
    }
    this.setComplete();
  }
}

export class JournalNote extends ActionTemplate {
  static typeName = 'JournalNote';
  get saveShape() { return [['id']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.allowRearm = false;
    this.id = 0;
  }
  get pattern() { return /journal note (?<id>\d+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const note = new JournalNote(parentQuest);
    note.id = questParseInt(match.groups.id);
    return note;
  }
  update(_caller) {
    const message = this.parentQuest.getMessage(this.id);
    if (message) this.parentQuest.hooks?.world?.addNoteTokens?.(message.getTextTokens(-1, this.parentQuest.rolls));
    this.setComplete();
  }
}

export class TrainPc extends ActionTemplate {
  static typeName = 'TrainPc';
  get saveShape() { return [['skill']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.allowRearm = false;
    this.skill = -1;
  }
  get pattern() { return /train pc (?<skillName>\w+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new TrainPc(parentQuest);
    const name = match.groups.skillName;
    if (!(name in SKILLS)) {
      this.setComplete();
      throw new Error(`TrainPc: Skill name ${name} is not a known Daggerfall skill`);
    }
    action.skill = SKILLS[name];
    return action;
  }
  update(_caller) {
    const q = this.parentQuest;
    const hooks = q.hooks;
    q.questSuccess = true;
    q.showMessagePopup(QUEST_MESSAGES.QuestComplete);
    const e = hooks?.playerEntity?.();
    if (e) {
      // The stamp is in classic minutes on the character clock, which the guild's training gate reads.
      const own = hooks?.ownMinutes?.();
      e.timeOfLastSkillTraining = Number.isFinite(own) ? Math.floor(own) : Math.floor((hooks?.nowSeconds?.() ?? 0) / 60);
      hooks?.raiseTime?.(3 * 3600);
      e.fatigue = Math.max(0, (e.fatigue ?? 0) - FATIGUE_LOSS.Default * 180);
      const tally = (10 + Math.floor((q.rolls ?? Math.random)() * 11)) * (SKILL_ADVANCEMENT_MULTIPLIER[this.skill] ?? 1);
      tallySkill(e, this.skill, tally);
    }
    this.setComplete();
  }
}

export class KillFoeAction extends ActionTemplate {
  static typeName = 'KillFoe';
  get saveShape() { return [['foeSymbol', 'sym']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.foeSymbol = null;
  }
  get pattern() { return /kill foe (?<aFoe>[a-zA-Z0-9_.-]+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new KillFoeAction(parentQuest);
    action.foeSymbol = new QuestSymbol(match.groups.aFoe);
    return action;
  }
  update(_caller) {
    const foe = this.parentQuest.getFoe(this.foeSymbol);
    if (!foe) {
      this.setComplete();
      throw new Error(`Could not find Foe resource symbol ${this.foeSymbol?.name}`);
    }
    foe.kill();
    this.setComplete();
  }
}

export class UnrestrainFoe extends ActionTemplate {
  static typeName = 'UnrestrainFoe';
  get saveShape() { return [['foeSymbol', 'sym']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.foeSymbol = null;
  }
  get pattern() { return /unrestrain foe (?<aFoe>[a-zA-Z0-9_.-]+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new UnrestrainFoe(parentQuest);
    action.foeSymbol = new QuestSymbol(match.groups.aFoe);
    return action;
  }
  update(_caller) {
    const foe = this.parentQuest.getFoe(this.foeSymbol);
    if (!foe) return;
    foe.clearRestrained();
    this.setComplete();
  }
}

export class RunQuest extends ActionTemplate {
  static typeName = 'RunQuest';
  get saveShape() { return [['questName'], ['successSymbol', 'sym'], ['failureSymbol', 'sym'], ['questStarted'], ['questUId']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.allowRearm = false;
    this.questName = '';
    this.successSymbol = null;
    this.failureSymbol = null;
    this.questStarted = false;
    this.questUId = null;
    this._quest = null;
  }
  get pattern() { return /run quest (?<questName>\w+) then (?<successTask>[a-zA-Z0-9_.]+) or (?<failureTask>[a-zA-Z0-9_.]+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new RunQuest(parentQuest);
    action.questName = match.groups.questName;
    action.successSymbol = new QuestSymbol(match.groups.successTask);
    action.failureSymbol = new QuestSymbol(match.groups.failureTask);
    return action;
  }
  update(_caller) {
    const hooks = this.parentQuest.hooks;
    if (!this.questStarted) {
      this._quest = hooks?.startQuest?.(this.questName) ?? null;
      this.questUId = this._quest?.uid ?? null;
      this.questStarted = true;
    }
    if (!this._quest) {
      if (this.questUId != null) this._quest = hooks?.getQuest?.(this.questUId) ?? null;
      if (!this._quest) {
        this.parentQuest.startTask(this.failureSymbol);
        this.setComplete();
        return;
      }
    }
    if (this._quest.questComplete) {
      this.parentQuest.startTask(this._quest.questSuccess ? this.successSymbol : this.failureSymbol);
      this.setComplete();
      this._quest = null;
    }
  }
  // A child quest still running when the parent ends is tombstoned too, so its links and enemies do not linger.
  dispose() {
    super.dispose();
    if (this._quest && !this._quest.questComplete) {
      this.parentQuest.hooks?.tombstoneQuest?.(this._quest);
      this._quest = null;
    }
  }
}

export class SpawnCityGuardsAction extends ActionTemplate {
  static typeName = 'SpawnCityGuards';
  get saveShape() { return [['immediateSpawn']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.immediateSpawn = false;
  }
  // The space before `immediate` is required, and C# counts pattern groups, so every matching line spawns at once.
  get pattern() { return /spawncityguards (immediate)?/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new SpawnCityGuardsAction(parentQuest);
    action.immediateSpawn = true;
    return action;
  }
  update(_caller) {
    this.parentQuest.hooks?.spawnCityGuards?.(this.immediateSpawn);
    this.setComplete();
  }
}

export class EnemiesAction extends ActionTemplate {
  static typeName = 'Enemies';
  get saveShape() { return [['clear']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.clear = false;
  }
  get pattern() { return /enemies (?<op>makehostile|clear)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new EnemiesAction(parentQuest);
    action.clear = match.groups.op === 'clear';
    return action;
  }
  update(_caller) {
    const hooks = this.parentQuest.hooks;
    if (this.clear) hooks?.clearEnemies?.();
    else hooks?.makeEnemiesHostile?.();
    this.setComplete();
  }
}

// Matches C#'s Convert.ToBoolean: anything but true or false throws, which drops the whole quest at parse.
function convertToBoolean(text, who) {
  const s = String(text ?? '').trim().toLowerCase();
  if (s === 'true') return true;
  if (s === 'false') return false;
  throw new Error(`${who}: '${text}' was not recognized as a valid Boolean`);
}

export class ChangeFoeInfighting extends ActionTemplate {
  static typeName = 'ChangeFoeInfighting';
  get saveShape() { return [['npcSymbol', 'sym'], ['isAttackableByAI']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.npcSymbol = null;
    this.isAttackableByAI = false;
  }
  get pattern() { return /change foe (?<anNPC>[a-zA-Z0-9_.-]+) infighting (?<isAttackableByAI>[a-zA-Z]+)/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new ChangeFoeInfighting(parentQuest);
    action.npcSymbol = new QuestSymbol(match.groups.anNPC);
    action.isAttackableByAI = convertToBoolean(match.groups.isAttackableByAI, 'ChangeFoeInfighting');
    return action;
  }
  update(_caller) {
    const foe = this.parentQuest.getFoe(this.npcSymbol);
    if (!foe) return;
    // Completing inside the loop, as C# does, leaves the action live until an instance exists.
    for (const inst of this.parentQuest.hooks?.questFoeInstances?.(this.npcSymbol) ?? []) {
      // Host enemy records keep it as `questBehaviour`; only spawn handles name it `behaviour`.
      const qrb = inst?.questBehaviour;
      if (qrb) qrb.isAttackableByAI = this.isAttackableByAI;
      this.setComplete();
    }
  }
}

export class ChangeFoeTeam extends ActionTemplate {
  static typeName = 'ChangeFoeTeam';
  get saveShape() { return [['npcSymbol', 'sym'], ['teamNumber']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.npcSymbol = null;
    this.teamNumber = 0;
  }
  get pattern() {
    return /change foe (?<anNPC>[a-zA-Z0-9_.-]+) team (?<teamNumber>\d+)|change foe (?<anNPC2>[a-zA-Z0-9_.-]+) team (?<teamName>\w+)/;
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new ChangeFoeTeam(parentQuest);
    const g = match.groups;
    action.npcSymbol = new QuestSymbol(g.anNPC ?? g.anNPC2);
    if (g.teamNumber != null) {
      action.teamNumber = questParseInt(g.teamNumber);
    } else {
      const idx = MOBILE_TEAMS.indexOf(g.teamName);
      if (idx === -1) {
        this.setComplete();
        throw new Error(`ChangeFoeTeam: Team ${g.teamName} is not a known team from MobileTeams enum.`);
      }
      action.teamNumber = idx;
    }
    return action;
  }
  update(_caller) {
    const foe = this.parentQuest.getFoe(this.npcSymbol);
    if (!foe) return;
    const team = MOBILE_TEAMS[this.teamNumber];
    // Completing inside the loop, as C# does, leaves the action live until an instance exists.
    for (const inst of this.parentQuest.hooks?.questFoeInstances?.(this.npcSymbol) ?? []) {
      if (inst?.entity) inst.entity.team = team;
      this.setComplete();
    }
  }
}

class PendingTrigger extends ActionTemplate {
  constructor(parentQuest, pattern) { super(parentQuest); this._pattern = pattern; }
  get pattern() { return this._pattern; }
  createNew() { return null; }
}

// Every action is ported, so this is empty; a guard's pattern would pend matching lines at its registry slot.
const GUARD_PATTERNS = Object.freeze({
});
const guard = (name) => new PendingTrigger(null, GUARD_PATTERNS[name]);

export class WorldUpdate extends ActionTemplate {
  static typeName = 'WorldUpdate';
  get saveShape() { return [['type'], ['regionIndex'], ['locationIndex'], ['locationName'], ['blockName'], ['recordIndex'], ['variant']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.type = ''; this.regionIndex = 0; this.locationIndex = 0; this.locationName = ''; this.blockName = ''; this.recordIndex = 0; this.variant = '';
  }
  get pattern() {
    return new RegExp(
      'worldupdate (?<type1>location) at (?<locationIndex1>\\d+) in region (?<regionIndex1>\\d+) variant (?<variant1>[a-zA-Z0-9_.-]+)|'
      + 'worldupdate (?<type2>locationnew) named (?<locationName2>.+) in region (?<regionIndex2>\\d+) variant (?<variant2>[a-zA-Z0-9_.-]+)|'
      + 'worldupdate (?<type3>block) (?<blockName3>[a-zA-Z0-9_.-]+) at (?<locationIndex3>\\d+) in region (?<regionIndex3>\\d+) variant (?<variant3>[a-zA-Z0-9_.-]+)|'
      + 'worldupdate (?<type4>blockAll) (?<blockName4>[a-zA-Z0-9_.-]+) variant (?<variant4>[a-zA-Z0-9_.-]+)|'
      + 'worldupdate (?<type5>building) (?<blockName5>[a-zA-Z0-9_.-]+) (?<recordIndex5>\\d+) at (?<locationIndex5>\\d+) in region (?<regionIndex5>\\d+) variant (?<variant5>[a-zA-Z0-9_.-]+)|'
      + 'worldupdate (?<type6>buildingAll) (?<blockName6>[a-zA-Z0-9_.-]+) (?<recordIndex6>\\d+) variant (?<variant6>[a-zA-Z0-9_.-]+)',
    );
  }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups;
    const pick = (stem) => { for (let i = 1; i <= 6; i++) if (g[`${stem}${i}`] !== undefined) return g[`${stem}${i}`]; return undefined; };
    const action = new WorldUpdate(parentQuest);
    action.type = pick('type');
    action.variant = pick('variant');
    const regionIndex = pick('regionIndex'); if (regionIndex !== undefined) action.regionIndex = questParseInt(regionIndex);
    const locationIndex = pick('locationIndex'); if (locationIndex !== undefined) action.locationIndex = questParseInt(locationIndex);
    const locationName = pick('locationName'); if (locationName !== undefined) action.locationName = locationName;
    const blockName = pick('blockName'); if (blockName !== undefined) action.blockName = blockName;
    const recordIndex = pick('recordIndex'); if (recordIndex !== undefined) action.recordIndex = questParseInt(recordIndex);
    return action;
  }
  update(caller) {
    super.update(caller);
    if (this.variant === '-') this.variant = NO_VARIANT;
    switch (this.type) {
      case 'location': setLocationVariant(this.regionIndex, this.locationIndex, this.variant); break;
      case 'locationnew': setNewLocationVariant(this.regionIndex, this.locationName, this.variant); break;
      case 'block': setBlockVariant(this.blockName, this.variant, makeLocationKey(this.regionIndex, this.locationIndex)); break;
      case 'blockAll': setBlockVariant(this.blockName, this.variant); break;
      case 'building': setBuildingVariant(this.blockName, this.recordIndex, this.variant, makeLocationKey(this.regionIndex, this.locationIndex)); break;
      case 'buildingAll': setBuildingVariant(this.blockName, this.recordIndex, this.variant); break;
      default: break;
    }
    this.setComplete();
  }
}

// The order is Daggerfall Unity's registration order, because the first unanchored match wins.
export function defaultActionTemplates() {
  return [
    new WhenPcEntersExits(null),
    new WhenNpcIsAvailable(null),
    new WhenReputeWith(null),
    new WhenSkillLevel(null),
    new WhenAttributeLevel(null),
    new WhenTask(null),
    new ClickedNpc(null),
    new ClickedItem(null),
    new LevelCompleted(null),
    new InjuredFoe(null),
    new KilledFoe(null),
    new TotingItemAndClickedNpc(null),
    new DailyFrom(null),
    new DroppedItemAtPlace(null),
    new SeasonCondition(null),
    new WeatherCondition(null),
    new ClimateCondition(null),
    new EndQuest(null),
    new Prompt(null),
    new Say(null),
    new PlaySound(null),
    new StartTask(null),
    new ClearTask(null),
    new LogMessage(null),
    new PickOneOf(null),
    new RemoveLogMessage(null),
    new PlayVideo(null),
    new PcAt(null),
    new CreateNpcAt(null),
    new CreateNpc(null),
    new PlaceNpc(null),
    new PlaceItem(null),
    new GivePc(null),
    new GiveItem(null),
    new StartStopTimer(null),
    new CreateFoe(null),
    new PlaceFoe(null),
    new HideNpc(null),
    new RestoreNpc(null),
    new AddFace(null),
    new DropFace(null),
    new GetItem(null),
    new StartQuest(null),
    new RunQuest(null),
    new UnsetTask(null),
    new ChangeReputeWith(null),
    new ReputeExceedsDo(null),
    new RevealLocation(null),
    new RestrainFoe(null),
    new MakePermanent(null),
    new HaveItem(null),
    new AddAsQuestor(null),
    new DropAsQuestor(null),
    new ItemUsedDo(null),
    new TakeItem(null),
    new TeleportPc(null),
    new DialogLink(null),
    new AddDialog(null),
    new RumorMill(null),
    new MakePcDiseased(null),
    new CurePcDisease(null),
    new CastSpellDo(null),
    new CastEffectDo(null),
    new CastSpellOnFoe(null),
    new RemoveFoe(null),
    new LegalRepute(null),
    new MuteNpc(null),
    new DestroyNpc(null),
    new WorldUpdate(null),
    new EnemiesAction(null),
    new ClickedFoe(null),
    new KillFoeAction(null),
    new PayMoney(null),
    new JournalNote(null),
    new ChangeFoeInfighting(null),
    new ChangeFoeTeam(null),
    new PlaySong(null),
    new SetPlayerCrimeAction(null),
    new SpawnCityGuardsAction(null),
    new UnrestrainFoe(null),
    new TrainPc(null),
    new PromptMulti(null),
  ];
}
