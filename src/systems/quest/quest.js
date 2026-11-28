// Port of the Daggerfall Unity Quest. Online, nowSeconds is the character clock and skySeconds the sky clock,
// and worldSeconds is the event clock that stamps journal dates. Offline all three are one clock.

import { travelTimeSeconds } from './clock.js';
import { Message, Formatting } from './message.js';
import { localizedQuestMessage } from './localizedQuest.js';
import { symbolToSaveData, symbolFromSaveData } from './symbol.js';
import { smallerDungeonsStateNow } from '../../world/smallerDungeons.js';
import { askAgain } from './noAsksAgain.js';
import { isInstanceEpoch } from '../../net/instanceRoom.js';
import { QUEST_SUCCESS_REP, QUEST_FAILURE_REP } from './questRepute.js';
import { readState, writeState } from '../questlines/qlState.js';

// As in Daggerfall Unity, the 23rd line both ends a chunk and opens the next one.
export function chunkMessageTokens(tokens, chunkSize = 22) {
  const chunks = [];
  let currentChunk = [];
  let lineCount = 0;
  for (const token of tokens) {
    currentChunk.push(token);
    // Daggerfall Unity also counts JustifyLeft, which quest messages never contain.
    if (token.formatting === Formatting.JustifyCenter
      || token.formatting === Formatting.Nothing) {
      if (++lineCount > chunkSize) {
        chunks.push(currentChunk);
        currentChunk = [];
        lineCount = 0;
      }
    }
  }
  if (currentChunk.length > 0) chunks.push(currentChunk);
  return chunks;
}

export { QUEST_SUCCESS_REP, QUEST_FAILURE_REP };

// Defined here and re-exported by machine.js, because importing machine.js here would form an import cycle.
export const QUEST_MESSAGES = Object.freeze({
  QuestorOffer: 1000,
  RefuseQuest: 1001,
  AcceptQuest: 1002,
  QuestFail: 1003,
  QuestComplete: 1004,
  RumorsDuringQuest: 1005,
  RumorsPostFailure: 1006,
  RumorsPostSuccess: 1007,
  QuestorPostSuccess: 1008,
  QuestorPostFailure: 1009,
});

let _uid = 0;
export function nextUid() { return ++_uid; }
export function ensureUidAtLeast(uid) { if (uid > _uid) _uid = uid; }
export function resetUid() { _uid = 0; }

export const isShelved = (quest) => quest?.shelvedAt != null;

export class Quest {
  constructor({ rolls = Math.random, nowSeconds = null, skySeconds = null, worldSeconds = null, raisedSeconds = null, hooks = null, actionFactory = null, questClockStepMax = null } = {}) {
    this.uid = nextUid();
    this.questName = '';
    this.displayName = null;
    this.ownDisplayName = undefined;
    this.factionId = 0;
    this.messages = new Map();
    this.tasks = new Map();
    this.resources = new Map();
    this.rolls = rolls;
    this.nowSeconds = nowSeconds;
    this.skySeconds = skySeconds ?? nowSeconds;
    this.worldSeconds = worldSeconds ?? nowSeconds;
    // Online a countdown charges none of raisedSeconds, and questClockStepMax caps what one frame charges a Clock.
    this.raisedSeconds = raisedSeconds;
    this.questClockStepMax = questClockStepMax;
    this.hooks = hooks;
    this.actionFactory = actionFactory;
    this.travelSeconds = () => (this.hooks?.world ? travelTimeSeconds(this) : null);
    this.travelSecondsTo = (place) => (this.hooks?.world ? travelTimeSeconds(this, place, false) : null);

    this.questComplete = false;
    this.questSuccess = false;
    this.questBreak = false;
    this.questTombstoned = false;
    this.questTombstoneTime = 0;
    this.questStartTime = 0;
    this.smallerDungeonsState = 0;
    this.ticksToEnd = 0;
    this.activeLogMessages = new Map();
    this.oneTimeDisplayedMessages = new Set();
    this.lastResourceReferenced = null;
    this.lastPlaceReferenced = null;
    this.externalMCP = null;
    this.currentLogMessageId = -1;
    this.pendingPopups = [];
    this.pendingClickRearms = [];
    this.questors = new Map();
    this.oneTime = false;
    // Set-aside time on the character clock, or null; shelvedSites lists the Places whose links return on reclaim.
    this.shelvedAt = null;
    this.shelvedSites = null;
    this.shelvedItems = null;
    this.instanceEpoch = null;
    this.ql = null;
    // The party level at acceptance, which its enemies are built at; null for an older quest.
    this.qlv = null;
  }

  addMessage(messageID, message) {
    if (this.messages.has(messageID)) throw new Error(`Duplicate message id: ${messageID}`);
    this.messages.set(messageID, message);
  }

  addResource(resource) {
    if (!resource.symbol || !resource.symbol.name) {
      throw new Error('QuestResource must have a named symbol.');
    }
    if (this.resources.has(resource.symbol.name)) {
      throw new Error(`Duplicate QuestResource symbol name found: ${resource.symbol.original}`);
    }
    this.resources.set(resource.symbol.name, resource);
    if (resource.isPerson && resource.isQuestor) this.addQuestor(resource.symbol);
  }

  addTask(task) {
    const existing = this.tasks.get(task.symbol.name);
    if (!existing) this.tasks.set(task.symbol.name, task);
    else existing.copyQuestActions(task);
  }

  getMessage(messageID) {
    const result = this.messages.get(messageID) ?? null;
    if (!result) return null;
    const lines = localizedQuestMessage(this.questName, messageID);
    if (lines) result.localize(lines);
    else result.ownText();
    return result;
  }

  localizeDisplayName(name) {
    if (this.ownDisplayName === undefined) this.ownDisplayName = this.displayName;
    this.displayName = name || this.ownDisplayName;
  }
  getTask(symbol) { return (symbol && this.tasks.get(symbol.name)) ?? null; }
  getResource(symbol) { return (symbol && this.resources.get(symbol.name)) ?? null; }
  getClock(symbol) { const r = this.getResource(symbol); return r?.isClock ? r : null; }
  getPlace(symbol) { const r = this.getResource(symbol); return r?.isPlace ? r : null; }
  getPerson(symbol) { const r = this.getResource(symbol); return r?.isPerson ? r : null; }

  getQuestors() { return [...this.questors.values()].map((q) => q.symbol); }
  getItem(symbol) { const r = this.getResource(symbol); return r?.isItem ? r : null; }
  getFoe(symbol) { const r = this.getResource(symbol); return r?.isFoe ? r : null; }

  start() {
    this.questStartTime = this.worldSeconds?.() ?? 0;
    // The setting is frozen at start, so the dungeon a quest points at keeps the size it compiled with.
    this.smallerDungeonsState = smallerDungeonsStateNow();
  }

  update() {
    if (this.questComplete) return;

    if (this.ticksToEnd > 0) {
      if (--this.ticksToEnd === 0) this.questComplete = true;
    }

    for (const resource of this.resources.values()) resource.tick(this);

    askAgain(this);

    for (const task of this.tasks.values()) {
      if (task.dropped) continue;
      if (this.questBreak || this.questComplete) {
        this.questBreak = false;
        return;
      }
      task.update();
      this._showPendingTaskMessages();
      // Rearms run after each task, so the first task to handle a click owns it.
      this._clearPendingClickRearms();
    }

    this._showPendingTaskMessages();

    for (const resource of this.resources.values()) resource.postTick(this);
  }

  scheduleClickRearm(resource) { this.pendingClickRearms.push(resource); }

  _clearPendingClickRearms() {
    for (const resource of this.pendingClickRearms) resource.rearmPlayerClick();
    this.pendingClickRearms.length = 0;
  }

  addQuestor(personSymbol) {
    if (!personSymbol || !personSymbol.name) {
      throw new Error('AddQuestor() must receive a named symbol.');
    }
    if (this.questors.has(personSymbol.name)) {
      console.warn(`[quest] Person ${personSymbol.original} is already a questor for quest ${this.uid} [${this.displayName ?? ''}]`);
      return;
    }
    const person = this.getPerson(personSymbol);
    if (!person) {
      console.warn(`[quest] Could not find matching Person resource to add questor ${personSymbol.original}`);
      return;
    }
    person.isQuestor = true;
    this.questors.set(personSymbol.name, { symbol: personSymbol.clone(), name: person.displayName });
    if (person.isIndividualNPC) {
      const factionId = person.factionData?.id ?? null;
      if (factionId != null) {
        for (const behaviour of this.hooks?.staticNpcQuestBehaviours?.() ?? []) {
          if (behaviour?.host?.staticNpcFactionId !== factionId) continue;
          behaviour.assignResource(person);
          person.questResourceBehaviour = behaviour;
        }
      }
    }
  }

  dropQuestor(personSymbol) {
    if (!personSymbol || !personSymbol.name) {
      throw new Error('DropQuestor() must receive a named symbol.');
    }
    this.questors.delete(personSymbol.name);
    const person = this.getPerson(personSymbol);
    const behaviour = person?.questResourceBehaviour ?? null;
    if (behaviour && !person.isIndividualNPC) behaviour.destroyComponent();
  }

  _dropAllQuestors() {
    for (const key of [...this.questors.keys()]) this.dropQuestor({ name: key });
  }

  endQuest() {
    // A second end quest inside the grace only extends it and pays nothing more.
    if (this.ticksToEnd > 0) { this.ticksToEnd = 2; return; }
    this.ticksToEnd = 2;
    // A stamped quest settles its outcome here, before the notebook files the entry.
    this.hooks?.questEnding?.(this);
    this.hooks?.removeProgressRumors?.(this.uid);
    this.hooks?.removeQuestorPostMessage?.(this.uid);
    // Online a failed quest costs no reputation, because its countdowns run on the character's own clock.
    const failureFree = !this.questSuccess && !!this.hooks?.sharedClock?.();
    if (this.factionId > 0 && !failureFree) {
      const repChange = this.questSuccess ? QUEST_SUCCESS_REP : QUEST_FAILURE_REP;
      this.hooks?.changeReputation?.(this.factionId, repChange, true);
    }
    if (this.questSuccess) this.hooks?.rewardProvincialQuest?.(this);
    const logEntries = this.getLogMessages();
    if (logEntries && logEntries.length > 0) {
      const questMessages = [];
      for (const logEntry of logEntries) {
        const message = this.getMessage(logEntry.messageID);
        if (message) questMessages.push(message);
      }
      this.hooks?.addFinishedQuest?.(questMessages);
    }
  }

  getCurrentLogMessageTime() {
    for (const log of this.activeLogMessages.values()) {
      if (log.messageID === this.currentLogMessageId && log.time != null) return log.time;
    }
    return this.questStartTime;
  }

  tombstone() {
    this.questTombstoned = true;
    this.questComplete = true;
    this.questTombstoneTime = this.nowSeconds?.() ?? 0;
    const messageRumors = this.getMessage(this.questSuccess
      ? QUEST_MESSAGES.RumorsPostSuccess : QUEST_MESSAGES.RumorsPostFailure);
    const messageQuestor = this.getMessage(this.questSuccess
      ? QUEST_MESSAGES.QuestorPostSuccess : QUEST_MESSAGES.QuestorPostFailure);
    if (messageRumors) this.hooks?.addProgressRumor?.(this.uid, messageRumors);
    if (messageQuestor) this.hooks?.addQuestorPostMessage?.(this.uid, messageQuestor);
    this.hooks?.removeQuestRumors?.(this.uid);
    this.hooks?.removeQuestInfoTopics?.(this.uid);
    // Every Place goes through unfiltered; a null name fallback, not '', skips the undiscoverBuilding name check.
    for (const r of this.resources.values()) {
      if (!r.isPlace) continue;
      this.hooks?.undiscoverBuilding?.(r.siteDetails?.buildingKey ?? 0, r.siteDetails?.buildingName ?? null);
    }
    this._dropAllQuestors();
  }

  startTask(symbol) { this.getTask(symbol)?.start(); }
  clearTask(symbol) { this.getTask(symbol)?.clear(); }

  addLogStep(stepID, messageID) {
    this.activeLogMessages.set(stepID, { stepID, messageID, time: this.worldSeconds?.() ?? 0 });
  }

  removeLogStep(stepID) { this.activeLogMessages.delete(stepID); }

  getLogMessages() {
    if (this.questComplete) return null;
    return [...this.activeLogMessages.values()];
  }

  showMessagePopup(id, immediate = false, oncePerQuest = false) {
    const message = this.getMessage(id);
    if (!message) return null;
    // Tokens are read at queue time, as in C#, so draws and macros use the state when the task showed it.
    const tokens = message.getTextTokens(-1, this.rolls);
    if (!tokens || tokens.length === 0) return null;
    if (oncePerQuest && this.oneTimeDisplayedMessages.has(id)) return null;
    for (const chunk of chunkMessageTokens(tokens)) this.pendingPopups.push(chunk);
    if (oncePerQuest) this.oneTimeDisplayedMessages.add(id);
    if (immediate) {
      this.questBreak = true;
      this._showPendingTaskMessages();
      return null;
    }
    return this.pendingPopups[this.pendingPopups.length - 1] ?? null;
  }

  _showPendingTaskMessages() {
    while (this.pendingPopups.length) {
      const tokens = this.pendingPopups.pop();
      // The host stacks each popped box on top, so the first queued message ends up in front.
      this.hooks?.showPopup?.(this, tokens);
    }
  }

  getSaveData() {
    return {
      uid: this.uid,
      questComplete: this.questComplete,
      questSuccess: this.questSuccess,
      questName: this.questName,
      displayName: this.ownDisplayName !== undefined ? this.ownDisplayName : this.displayName,
      factionId: this.factionId,
      questStartTime: this.questStartTime,
      questTombstoned: this.questTombstoned,
      questTombstoneTime: this.questTombstoneTime,
      smallerDungeonsState: this.smallerDungeonsState ?? 0,
      compiledByVersion: '',
      activeLogMessages: [...this.activeLogMessages.values()].map((e) => ({ ...e })),
      messages: [...this.messages.values()].map((m) => m.getSaveData()),
      resources: [...this.resources.values()].map((r) => r.getResourceSaveData()),
      questors: [...this.questors.entries()].map(([name, q]) => ({ name, symbol: symbolToSaveData(q.symbol), displayName: q.name })),
      tasks: [...this.tasks.values()].map((t) => t.getSaveData()),
      oneTimeDisplayedMessages: [...this.oneTimeDisplayedMessages],
      shareId: this.shareId ?? null,
      instanceEpoch: this.instanceEpoch ?? null,
      shelvedAt: this.shelvedAt ?? null,
      shelvedSites: this.shelvedSites ? [...this.shelvedSites] : null,
      shelvedItems: this.shelvedItems ? [...this.shelvedItems] : null,
      qlv: this.qlv ?? null,
      ql: writeState(this.ql),
      // The holder clock at save; a party copy shifts its countdowns by the difference (quest/questStamps.js).
      ownSecondsAt: Number.isFinite(this.nowSeconds?.()) ? Math.floor(this.nowSeconds()) : null,
    };
  }

  restoreSaveData(data, resolvers = {}) {
    this.uid = data.uid;
    ensureUidAtLeast(data.uid);
    this.shareId = typeof data.shareId === 'string' && data.shareId ? data.shareId : null;
    this.instanceEpoch = isInstanceEpoch(data.instanceEpoch) ? data.instanceEpoch : null;
    this.shelvedAt = Number.isFinite(data.shelvedAt) && data.shelvedAt !== 0 ? data.shelvedAt : null;
    this.shelvedSites = this.shelvedAt != null && Array.isArray(data.shelvedSites) ? data.shelvedSites.filter((n) => typeof n === 'string') : null;
    this.shelvedItems = this.shelvedAt != null && Array.isArray(data.shelvedItems) ? data.shelvedItems.filter((n) => typeof n === 'string') : null;
    this.qlv = Number.isFinite(data.qlv) && data.qlv >= 1 ? data.qlv : null;
    this.ql = readState(data.ql);
    this.questComplete = data.questComplete;
    this.questSuccess = data.questSuccess;
    this.questName = data.questName;
    this.displayName = data.displayName ?? null;
    this.ownDisplayName = undefined;
    this.factionId = data.factionId;
    this.questStartTime = data.questStartTime;
    this.questTombstoned = data.questTombstoned;
    this.questTombstoneTime = data.questTombstoneTime;
    this.smallerDungeonsState = data.smallerDungeonsState ?? 0;
    this.activeLogMessages.clear();
    for (const logEntry of data.activeLogMessages) {
      this.activeLogMessages.set(logEntry.stepID, { ...logEntry });
    }
    this.messages.clear();
    for (const messageData of data.messages) {
      const message = new Message(this);
      message.restoreSaveData(messageData);
      this.messages.set(message.id, message);
    }
    this.resources.clear();
    for (const resourceData of data.resources) {
      const ResourceCtor = resolvers.resolveResourceType?.(resourceData.type);
      if (!ResourceCtor) throw new Error(`Could not restore resource type ${resourceData.type}`);
      const resource = new ResourceCtor(this);
      resource.restoreResourceSaveData(resourceData);
      this.resources.set(resource.symbol.name, resource);
    }
    this.questors.clear();
    for (const q of data.questors ?? []) {
      this.questors.set(q.name, { symbol: symbolFromSaveData(q.symbol), name: q.displayName });
    }
    this.tasks.clear();
    for (const taskData of data.tasks) {
      const task = new resolvers.Task(this);
      task.restoreSaveData(taskData, resolvers.resolveActionType);
      this.tasks.set(task.symbol.name, task);
    }
    this.oneTimeDisplayedMessages.clear();
    for (const id of data.oneTimeDisplayedMessages ?? []) this.oneTimeDisplayedMessages.add(id);
    askAgain(this);
  }

}
