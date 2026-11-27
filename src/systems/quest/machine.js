// Port of the Daggerfall Unity quest machine; the host paces tick() by TICKS_PER_SECOND. Without deps.world, every
// Place leaves its site pending. deps.nowSeconds is classic minutes times 60 from the classic epoch, so only the
// year needs the epoch added back (questMacros nowDate).

import { Parser } from './parser.js';
import { globalVarsTable } from './tables.js';
import { spineOwed, spineRecord, openersOwed, SPINE, SPINE_OPENER, SPINE_CURSE, SPINE_CHECK_TICKS } from './mainSpine.js';
import { defaultActionTemplates, heldPromptPlaces } from './actions.js';
import { receivedState, mergeSharedState, freshState, QL_STAMP } from '../questlines/qlState.js';
import { QuestResourceBehaviour } from './resourceBehaviour.js';
import { FACTION_TYPES } from '../../formats/factionFile.js';
import { SECONDS_PER_WEEK } from '../../world/gameDate.js';
import { Quest, nextUid, isShelved } from './quest.js';
import { localizedQuestDisplayName } from './localizedQuest.js';
import { Task, TaskType } from './task.js';
import { isGoldPieces } from '../../items/inventory.js';
import { Person } from './person.js';
import { Place, SITE_TYPES } from './place.js';
import { Item } from './item.js';
import { Foe } from './foe.js';
import { Clock } from './clock.js';
import { questDataOnThisClock, shiftQuestStamps } from './questStamps.js';
import { BUILDING_TYPES } from '../../world/buildingNames.js';
import { adoptLinkedDungeonSize } from '../../world/smallerDungeons.js';

const HOUSE1 = BUILDING_TYPES.House1, HOUSE6 = BUILDING_TYPES.House6;

const RESOURCE_TYPES = Object.freeze({ Person, Place, Item, Foe, Clock });

export { QUEST_MESSAGES } from './quest.js';

export const TICKS_PER_SECOND = 10;
// A cull, teleport, or load stops driving a behavior without telling it, so a quest enemy counts as present only
// while driven within this many ticks.
export const FOE_STANDS_TICKS = 5 * 60 * TICKS_PER_SECOND;
export { SECONDS_PER_WEEK };
// Unique across every machine in a room, so a receiver can tell a finished copy from a new one.
export function mintShareId() {
  const r = globalThis.crypto?.randomUUID?.();
  return r ?? `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
export const PROTECTED_QUESTS = Object.freeze(['S0000999', 'S0000977', '_BRISIEN']);
export const questNameIn = (list, name) => { const n = (name ?? '').toLowerCase(); return list.some((x) => x.toLowerCase() === n); };
const isProtectedQuest = (quest) => questNameIn(PROTECTED_QUESTS, quest.questName);
// S group main story quests, without the protected quests, the S00001xx aftermath, or the S00005xx guild series.
export const isMainStoryQuest = (name) => /^S\d{7}$/i.test(name ?? '') && !/^S0000[15]\d\d$/i.test(name) && !questNameIn(PROTECTED_QUESTS, name);
// Only a trainer lesson or an item handed over for good counts as paid; quest items, gold, and standing do not.
export function questPaidOut(quest) {
  for (const task of quest?.tasks?.values?.() ?? []) {
    for (const a of task.actions ?? []) {
      if (!a?.isComplete) continue;
      if (a.typeName === 'TrainPc') return true;
      if (!((a.typeName === 'GivePc' && !a.isNothing) || a.typeName === 'GetItem')) continue;
      const it = a.itemSymbol ? quest.getItem?.(a.itemSymbol) : null;
      const df = it?.daggerfallUnityItem;
      if (it && !(df && isGoldPieces(df)) && (it.madePermanent || (df && !df.questItem))) return true;
    }
  }
  return false;
}
const endQuestRan = (quest) => [...quest.tasks.values()].some((t) => t.actions?.some((a) => a?.typeName === 'EndQuest' && a.isComplete));
const boundByClick = (person) => { const d = person.questorData; return !!(d && (d.hash || d.nameSeed || d.mapID || d.buildingKey)); };
export const holdsQuestorDoor = (quest) => [...(quest?.resources?.values?.() ?? [])].some((r) => r?.isPerson && r.isQuestor && boundByClick(r));
export function storySuccessors(lines) {
  const out = new Set();
  for (const line of lines ?? []) {
    const m = /^\s*start quest (?:(\d+) \d+|(\w+))/i.exec(line);
    if (m) out.add(m[1] ? `S${m[1].padStart(7, '0')}` : m[2].toUpperCase());
  }
  return [...out];
}
const LINK_TRIGGER = /^(when|toting|clicked|have|pc at|repute with|killed|injured|daily from|level)\b/i;
const LINK_WORK = /^(start quest|give pc|get item|train pc|end quest|make \S+ permanent|change repute with \S+ by \+?\d)/i;
export function storyShape(lines) {
  let i = (lines ?? []).findIndex((l) => /^\s*QBN:/i.test(l));
  const qbn = i < 0 ? [] : lines.slice(i + 1);
  const table = globalVarsTable();
  const sets = new Set(), replays = new Set(), links = [];
  for (i = 0; i < qbn.length; i++) {
    const m = /^([A-Za-z][A-Za-z0-9_]*) (_[A-Za-z0-9_.]+_)\s*$/.exec(qbn[i]);
    if (!m || !table.hasValue(m[1])) continue;
    const id = parseInt(table.getValue('id', m[1]));
    const body = [];
    for (let j = i + 1; j < qbn.length && /^\s+\S/.test(qbn[j]); j++) body.push(qbn[j].trim());
    links.push({ id, symbol: m[2] });
    if (body.length && LINK_TRIGGER.test(body[0])) sets.add(id);
    if (body.some((l) => LINK_WORK.test(l))) replays.add(id);
  }
  const started = new Set(qbn.map((l) => /^\s*(?:start task|setvar) (\S+)\s*$/i.exec(l)?.[1]).filter(Boolean));
  for (const { id, symbol } of links) if (started.has(symbol)) sets.add(id);
  return { next: storySuccessors(qbn).filter(isMainStoryQuest), sets: [...sets], replays: [...replays] };
}
// A partner envelope is never trusted with a shelf, and a copy set aside is never handed on.
const NO_SHELF = Object.freeze({ shelvedAt: null, shelvedSites: null });
const NO_INSTANCE = Object.freeze({ instanceEpoch: null });

// A load never replays actions, but a receiver must run these self-contained one-time actions again.
// PayMoney and GiveItem stay out: a fee would charge the receiver, and a GiveItem target may not be the player.
const REPLAYABLE_ONE_TIME_ACTIONS = new Set(['TeleportPc', 'GivePc', 'TrainPc', 'GetItem', 'RevealLocation']);

const BEHAVIOUR_SWEEP_MIN = 64;

function localizeDisplayName(quest) {
  if (quest) quest.localizeDisplayName(localizedQuestDisplayName(quest.questName));
  return quest;
}

// A local site taken in another town is revealed at quest start, so the lens, map, and compass can point at it.
export function revealNearSites(quest) {
  const world = quest?.hooks?.world;
  if (!world?.discoverLocation) return 0;
  let n = 0;
  for (const r of quest.resources?.values?.() ?? []) {
    const sd = r?.isPlace ? r.siteDetails : null;
    if (!sd?.nearSite) continue;
    try { world.discoverLocation(sd.regionName, sd.locationName); n++; } catch { }
  }
  return n;
}

export class QuestMachine {
  constructor(deps = {}) {
    this.deps = deps;
    this.quests = new Map();
    this.mountByName = false;
    this._behaviourRefs = new Set();
    this._behaviourSweepAt = BEHAVIOUR_SWEEP_MIN;
    this.beat = 0;
    this.questsToInvoke = [];
    this.unrestored = [];
    // Only names in sharedQuestNames take a resync, so a quest the player got on their own is never overwritten.
    this.sharedQuestNames = new Set();
    // Finished shared copies refuse a later share or resync, so a partner who is behind cannot replay them.
    this.finishedSharedQuestNames = new Set();
    this.finishedShareIds = new Set();
    // Final envelopes of finished shared copies wait here for the host, because the tombstone removes the name from
    // sharedQuestNames in the same tick.
    this._finishedShares = [];
    this.storyStarted = new Set();
    this.storyEnded = new Set();
    this.storyLegacy = false;
    this.spine = { opened: false, ran: false, cursed: false };
    this.actionTemplates = [];
    this.globalVars = new Map();
    this.siteLinks = [];
    this.factionListeners = new Map();
    this.lastNPCClicked = null;
    this.parser = new Parser();
    for (const template of defaultActionTemplates()) this.registerAction(template);
    this._actionFactory = (line, quest) => {
      const template = this.getActionTemplate(line);
      return template ? template.createNew(line, quest) : null;
    };
  }

  registerAction(actionTemplate) { this.actionTemplates.push(actionTemplate); }

  getActionTemplate(source) {
    for (const action of this.actionTemplates) {
      if (action.test(source)) return action;
    }
    return null;
  }

  macroContext() {
    return { nowSeconds: () => this.deps.nowSeconds?.() ?? 0, hooks: this._buildHooks() };
  }

  _questClocks() {
    const nowSeconds = () => this.deps.nowSeconds?.() ?? 0;
    return {
      nowSeconds,
      skySeconds: () => this.deps.skySeconds?.() ?? nowSeconds(),
      worldSeconds: () => this.deps.worldSeconds?.() ?? nowSeconds(),
      raisedSeconds: () => this.deps.raisedSeconds?.() ?? null,
    };
  }

  // Built before the parse, because the Item mint reads player, guild, and region facts when it is created.
  _buildHooks() {
    return {
      showPopup: (q, tokens) => this.deps.showPopup?.(q, tokens),
      questFoeKilled: (q, foe, n) => this.deps.questFoeKilled?.(q, foe, n),
      questFoeStands: (q, foe) => this._liveBehaviours(q?.uid).some((b) => b.targetSymbol?.name === foe?.symbol?.name && !b.isFoeDead && this.beat - (b.beat ?? 0) <= FOE_STANDS_TICKS),
      showPrompt: (q, message, respond) => (this.deps.showPrompt ? this.deps.showPrompt(q, message, respond) ?? true : false),
      showPromptMulti: (q, message, buttons, respond) => (this.deps.showPromptMulti ? this.deps.showPromptMulti(q, message, buttons, respond) ?? true : false),
      showChoice: (q, message, choices, respond) => this.deps.showChoice?.(q, message, choices, respond),
      changeReputation: (fid, amount, propagate) => this.deps.changeReputation?.(fid, amount, propagate),
      changeLegalRep: (amount) => this.deps.changeLegalRep?.(amount),
      playerLevel: () => this.deps.playerLevel?.() ?? 0,
      playerGender: () => this.deps.playerGender?.() ?? 'male',
      getTotalGold: () => this.deps.getTotalGold?.() ?? 0,
      deductGold: (amount) => this.deps.deductGold?.(amount),
      addGold: (amount) => this.deps.addGold?.(amount),
      addHUDText: (text) => this.deps.addHUDText?.(text),
      playVideo: (name) => this.deps.playVideo?.(name),
      playSound: (soundId) => this.deps.playSound?.(soundId),
      playSong: (name) => this.deps.playSong?.(name),
      dialogLink: (...args) => this.deps.dialogLink?.(...args),
      addDialog: (...args) => this.deps.addDialog?.(...args),
      addQuestRumor: (uid, message) => this.deps.addQuestRumor?.(uid, message),
      addProgressRumor: (uid, message) => this.deps.addProgressRumor?.(uid, message),
      addQuestorPostMessage: (uid, message) => this.deps.addQuestorPostMessage?.(uid, message),
      removeProgressRumors: (uid) => this.deps.removeProgressRumors?.(uid),
      removeQuestorPostMessage: (uid) => this.deps.removeQuestorPostMessage?.(uid),
      removeQuestRumors: (uid) => this.deps.removeQuestRumors?.(uid),
      removeQuestInfoTopics: (uid) => this.deps.removeQuestInfoTopics?.(uid),
      staticNpcQuestBehaviours: () => this.deps.world?.staticNpcQuestBehaviours?.() ?? [],
      undiscoverBuilding: (buildingKey, buildingName) => this.deps.undiscoverBuilding?.(buildingKey, buildingName),
      addFace: (resource) => this.deps.addFace?.(resource),
      dropFace: (resource) => this.deps.dropFace?.(resource),
      addFinishedQuest: (messages) => this.deps.addFinishedQuest?.(messages),
      getGuild: (factionId) => this.deps.getGuild?.(factionId) ?? null,
      regionPriceAdjustment: () => this.deps.regionPriceAdjustment?.() ?? 0,
      giveItemToPlayer: (dfItem, front) => this.deps.giveItemToPlayer?.(dfItem, front),
      removeItemFromPlayer: (dfItem) => this.deps.removeItemFromPlayer?.(dfItem),
      playerHasItem: (dfItem) => this.deps.playerHasItem?.(dfItem) ?? false,
      carriesQuestItem: (itemResource) => this.deps.carriesQuestItem?.(itemResource) ?? false,
      releaseQuestItem: (questUID, itemResource) => this.deps.releaseQuestItem?.(questUID, itemResource),
      makeHeldQuestItemsPermanent: (questUID, symbol) => this.deps.makeHeldQuestItemsPermanent?.(questUID, symbol),
      offerReward: (q, dfItem) => this.deps.offerReward?.(q, dfItem),
      questReward: (q, dfItem, resource) => this.deps.questReward?.(q, dfItem, resource),
      questEnding: (q) => this.deps.questEnding?.(q),
      rewardShares: (quest) => (this.sharedQuestNames.has(quest?.questName) ? Math.max(1, Math.min(Math.trunc(this.deps.partySize?.() ?? 1) || 1, 1 + (quest?._holdersHeard?.size ?? 0))) : 1), sharedCopy: (quest) => !!quest && this.sharedQuestNames.has(quest.questName) && this.sharedCandidateNamed(quest.questName) === quest,
      sharerHere: (quest) => !quest?._sentBy || (this.deps.partyHas?.(quest._sentBy) ?? true),
      partySize: () => Math.max(1, Math.trunc(this.deps.partySize?.() ?? 1) || 1),
      isPlayerInTown: () => this.deps.isPlayerInTown?.() ?? false,
      onOfferPending: (givePc) => this.deps.onOfferPending?.(givePc),
      startQuest: (questName) => this.scheduleQuestByName(questName),
      globalVars: this.globalVars,
      world: this.deps.world ?? null,
      sharedClock: () => !!this.deps.sharedClock?.(),
      lastNPCClicked: () => this.getLastNPCClicked(),
      // Hosts create a fresh NPCData for every click, so identity uses the four isNPCDataEqual fields.
      isNPCDataEqual: (a, b) => this.isNPCDataEqual(a, b),
      playerName: () => this.deps.playerName?.() ?? null,
      playerRaceName: () => this.deps.playerRaceName?.() ?? null,
      playerEntity: () => this.deps.playerEntity ?? null,
      nowSeconds: () => this.deps.nowSeconds?.() ?? null,
      skySeconds: () => this.deps.skySeconds?.() ?? this.deps.nowSeconds?.() ?? null,
      ownMinutes: () => this.deps.ownMinutes?.() ?? null,
      setPlayerCrime: (crime) => this.deps.setPlayerCrime?.(crime),
      getGoldPieces: () => this.deps.getGoldPieces?.() ?? 0,
      deductGoldPieces: (n) => this.deps.deductGoldPieces?.(n),
      raiseTime: (seconds) => this.deps.raiseTime?.(seconds),
      waitOnline: (seconds, quest) => this.deps.waitOnline?.(seconds, quest),
      spawnCityGuards: (immediate) => this.deps.spawnCityGuards?.(immediate),
      makeEnemiesHostile: () => this.deps.makeEnemiesHostile?.(),
      clearEnemies: () => this.deps.clearEnemies?.(),
      questFoeInstances: (symbol) => this.deps.questFoeInstances?.(symbol) ?? [],
      getQuest: (uid) => this.getQuest(uid),
      tombstoneQuest: (quest) => this.tombstoneQuest(quest),
      addFactionListener: (factionID, owner) => this.addFactionListener(factionID, owner),
      removeFactionListener: (factionID) => this.removeFactionListener(factionID),
      activeFactionPersons: (factionID) => this.activeFactionPersons(factionID),
      makePcDiseased: (diseaseType) => this.deps.makePcDiseased?.(diseaseType),
      cureDisease: (diseaseType) => this.deps.cureDisease?.(diseaseType),
      endVampirism: () => this.deps.endVampirism?.(),
      endLycanthropy: () => this.deps.endLycanthropy?.(),
      getReputation: (factionId) => this.deps.getReputation?.(factionId) ?? 0,
      forceTopicListsUpdate: () => this.deps.forceTopicListsUpdate?.(),
      getAllActiveQuestSites: () => this.getAllActiveQuestSites(),
      cullResourceTarget: (resource, newPlaceSymbol) => this.cullResourceTarget(resource, newPlaceSymbol),
      hasSiteLink: (quest, placeSymbol) => this.hasSiteLink(quest, placeSymbol),
      createSiteLink: (quest, placeSymbol) => this.createSiteLink(quest, placeSymbol),
    };
  }

  scheduleQuest(sourceLines, factionId = 0, { rolls } = {}) {
    const { nowSeconds, skySeconds, worldSeconds, raisedSeconds } = this._questClocks();
    const quest = this.parser.parse(sourceLines, factionId,
      { rolls, actionFactory: this._actionFactory, nowSeconds, skySeconds, worldSeconds, raisedSeconds, hooks: this._buildHooks(), questClockStepMax: () => this.deps.questClockStepMax?.() ?? Infinity });
    localizeDisplayName(quest);
    this.questsToInvoke.push(quest);
    return quest;
  }

  startQuestByName(questName, factionId = 0, opts = {}) {
    const lines = this.deps.getQuestSourceLines?.(questName);
    if (!lines) { console.warn(`[quest] no source for quest ${questName}`); return null; }
    const quest = this.parseQuestForLists(lines, factionId, opts);
    if (!quest) return null;
    this.startQuestImmediate(quest);
    return quest;
  }

  scheduleQuestByName(questName, factionId = 0, opts = {}) {
    const lines = this.deps.getQuestSourceLines?.(questName);
    if (!lines) { console.warn(`[quest] no source for quest ${questName}`); return null; }
    // Under the ParseQuest catch, as in Daggerfall Unity, so a child quest whose setup throws spares the parent.
    try {
      return this.scheduleQuest(lines, factionId, opts);
    } catch (ex) {
      console.warn(`[quest] Parsing quest ${questName} FAILED!\r\n${ex?.message ?? ex}`);
      return null;
    }
  }

  // Assigns the questor behavior at the tail, as C# does, so actions such as hide npc reach the questor.
  startQuestImmediate(quest) {
    quest.start();
    adoptLinkedDungeonSize(quest, this);
    this.deps.addQuestTopics?.(quest);
    if (quest.ql == null) quest.ql = this.deps.questlinesStamp?.(quest) ?? null;
    if (quest.qlv == null) quest.qlv = this.deps.questLevel?.() ?? null;
    // A uid already on the live table throws, as Dictionary.Add does, so no later quest replaces a restored one.
    if (this.quests.has(quest.uid)) throw new Error('An item with the same key has already been added.');
    this.quests.set(quest.uid, quest);
    if (isMainStoryQuest(quest.questName)) { const n = quest.questName.toUpperCase(); this.storyStarted.add(n); this.storyEnded.delete(n); }
    if (questNameIn([SPINE], quest.questName)) this.spine.ran = true; else if (questNameIn([SPINE_OPENER], quest.questName)) this.spine.opened = true;
    if (questNameIn([SPINE_CURSE], quest.questName)) this.spine.cursed = true;
    this.deps.onQuestStarted?.(quest);
    revealNearSites(quest);
    if (this.lastNPCClicked != null) {
      this.assignQuestResourceBehaviour(this.lastNPCClickedHost ?? null, this.lastNPCClicked);
    }
    return quest;
  }

  parseQuestForLists(lines, factionId = 0, { rolls, partialParse = false, headless = false } = {}) {
    const { nowSeconds, skySeconds, worldSeconds, raisedSeconds } = this._questClocks();
    // headless parses with no world, so the quest has only the shape of its script.
    const hooks = headless ? { ...this._buildHooks(), world: null } : this._buildHooks();
    // Wrapped in a catch like ParseQuest, so one broken row drops only itself from a guild quest list.
    try {
      return localizeDisplayName(this.parser.parse(lines, factionId,
        { partialParse, rolls, actionFactory: this._actionFactory, nowSeconds, skySeconds, worldSeconds, raisedSeconds, hooks, questClockStepMax: () => this.deps.questClockStepMax?.() ?? Infinity }));
    } catch (ex) {
      console.warn(`[quest] Parsing quest FAILED!\r\n${ex?.message ?? ex}`);
      return null;
    }
  }

  getQuest(uid) { return this.quests.get(uid) ?? null; }

  getLastNPCClicked() { return this.lastNPCClicked ?? this.deps.lastNPCClicked?.() ?? null; }

  setLastNPCClicked(npcData, host = null) {
    this.lastNPCClicked = npcData;
    this.lastNPCClickedHost = host;
    for (const quest of this.quests.values()) {
      if (isShelved(quest)) continue;
      for (const resource of quest.resources.values()) {
        if (resource.isPerson && this.isNPCDataEqual(resource.questorData, npcData)) {
          resource.setPlayerClicked();
        }
      }
    }
  }

  // As in C#, a later quest's questor overwrites an earlier match.
  activeQuestor(npcData) {
    let found = null;
    for (const quest of this.quests.values()) {
      if (isShelved(quest)) continue;
      const questorSymbols = quest.getQuestors();
      if (!questorSymbols || questorSymbols.length === 0) continue;
      for (const symbol of questorSymbols) {
        const person = quest.getPerson(symbol);
        if (!person) continue;
        if (this.isNPCDataEqual(npcData, person.questorData)) { found = person; break; }
      }
    }
    return found;
  }

  assignQuestResourceBehaviour(host, npcData) {
    const questorPerson = this.activeQuestor(npcData);
    if (questorPerson == null) return null;
    if (host?.questBehaviour) return null;
    const behaviour = new QuestResourceBehaviour(this, host ?? null);
    behaviour.questorHost = true;
    behaviour.assignResource(questorPerson);
    behaviour.start();
    if (host) host.questBehaviour = behaviour;
    console.log(`[quest] Added new QuestResourceBehaviour and assigned Questor Person resource ${questorPerson.displayName}`);
    return behaviour;
  }

  isNPCDataEqual(person1, person2) {
    return (person1?.hash ?? 0) === (person2?.hash ?? 0)
      && (person1?.mapID ?? 0) === (person2?.mapID ?? 0)
      && (person1?.nameSeed ?? 0) === (person2?.nameSeed ?? 0)
      && (person1?.buildingKey ?? 0) === (person2?.buildingKey ?? 0);
  }

  isLastNPCClickedAnActiveQuestor(mcp = null) {
    const hit = this.lastNPCClickedQuestorOf();
    if (!hit) return false;
    console.log(`[quest] This person is used in quest as Person ${hit.person.symbol?.original}`);
    if (mcp != null) hit.quest.externalMCP = mcp;
    return true;
  }

  lastNPCClickedQuestorOf() {
    const clicked = this.getLastNPCClicked();
    for (const quest of this.quests.values()) {
      if (quest.questComplete) continue;
      if (isShelved(quest)) continue;
      for (const resource of quest.resources.values()) {
        if (!resource.isPerson || !resource.isQuestor) continue;
        if (this.isNPCDataEqual(resource.questorData, clicked)) return { quest, person: resource };
      }
    }
    return null;
  }

  createMessagePrompt(quest, id) {
    const message = quest.getMessage(id);
    if (!message) return null;
    return {
      tokens: message.getTextTokens(-1, quest.rolls),
      buttons: 'YesNo',
      clickAnywhereToClose: false,
      allowCancel: false,
    };
  }

  isIndividualNPC(factionID) {
    const factionData = this.deps.world?.getFactionData?.(factionID) ?? null;
    return factionData != null && factionData.type === FACTION_TYPES.Individual;
  }

  isIndividualQuestNPCAtSiteLink(factionID) {
    if (!this.isIndividualNPC(factionID)) return false;
    for (const link of this.siteLinks) {
      const quest = this.getQuest(link.questUID);
      if (!quest) continue;
      const place = quest.getPlace(link.placeSymbol);
      if (!place) continue;
      const marker = place.siteDetails.selectedMarker;
      if (!marker?.targetResources) {
        console.log('[quest] IsIndividualQuestNPCAtSiteLink() found a SiteLink with no targetResources assigned.');
        continue;
      }
      for (const target of marker.targetResources) {
        const resource = quest.getResource(target);
        if (!resource) continue;
        if (!resource.isPerson) continue;
        if (!resource.isIndividualNPC || resource.isIndividualAtHome) continue;
        if (resource.factionData?.id === factionID) return true;
      }
    }
    return false;
  }

  setupIndividualStaticNPC(host, factionID) {
    if (this.isIndividualNPC(factionID)) {
      if (this.isIndividualQuestNPCAtSiteLink(factionID)) {
        host?.setActive?.(false);
        return false;
      }
      const behaviour = new QuestResourceBehaviour(this, host);
      behaviour.individualHome = true;
      const activePersonResources = this.activeFactionPersons(factionID);
      if (activePersonResources && activePersonResources.length > 0) {
        const person = activePersonResources[0];
        behaviour.assignResource(person);
        person.questResourceBehaviour = behaviour;
      }
      behaviour.start();
      return behaviour;
    }
    return true;
  }

  notifyExteriorTransition() {
    this._forEachAction((action) => action.onTransitionExterior?.());
  }

  notifyInitWorld() {
    this._forEachAction((action) => action.onInitWorld?.());
  }

  notifyNewReadySpell(spell) {
    this._forEachAction((action) => action.onNewReadySpell?.(spell));
  }

  notifyCastReadySpell(spell) {
    this._forEachAction((action) => action.onCastReadySpell?.(spell));
  }

  _forEachAction(fn) {
    for (const list of [this.quests.values(), this.questsToInvoke]) {
      for (const quest of list) {
        if (isShelved(quest)) continue;
        for (const task of quest.tasks?.values?.() ?? []) {
          for (const action of task.actions) fn(action);
        }
      }
    }
  }

  getAllQuestLogMessages() {
    const questMessages = [];
    for (const quest of this.quests.values()) {
      if (isShelved(quest)) continue;
      const logEntries = quest.getLogMessages();
      if (!logEntries || logEntries.length === 0) continue;
      for (const logEntry of logEntries) {
        const message = quest.getMessage(logEntry.messageID);
        if (message) questMessages.push(message);
      }
    }
    return questMessages;
  }

  getSaveData() {
    return {
      siteLinks: this.siteLinks.map((l) => structuredClone(l)),
      quests: [...this.quests.values()].map((q) => q.getSaveData()),
      globalVars: [...this.globalVars.entries()],
      storyStarted: [...this.storyStarted],
      storyEnded: [...this.storyEnded],
      // Scheduled child quests not yet started are saved, so a box that holds the tick cannot lose them.
      ...(this.questsToInvoke.length ? { toInvoke: this.questsToInvoke.map((q) => q.getSaveData()) } : {}),
      ...(this.unrestored.length ? { unrestored: this.unrestored.map((q) => structuredClone(q)) } : {}),
      ...this._spineData(),
      ...this._shareMemoryData(),
    };
  }

  _shareMemoryData() {
    const holders = [], sharers = [];
    for (const q of this.quests.values()) {
      if (q._holdersHeard?.size) holders.push([q.uid, [...q._holdersHeard]]);
      if (q._sentBy != null) sharers.push([q.uid, q._sentBy]);
    }
    if (!this.sharedQuestNames.size && !this.finishedShareIds.size && !this.finishedSharedQuestNames.size && !holders.length && !sharers.length
      && ![...this.quests.values()].some((q) => typeof q.shareId === 'string' && q.shareId)) return {};
    return { shareMemory: { inStep: [...this.sharedQuestNames], finishedIds: [...this.finishedShareIds], finishedNames: [...this.finishedSharedQuestNames], holders, sharers } };
  }

  // Each quest restores under its own catch; one that fails is kept as saved and tried again at the next load.
  clearState() {
    this.quests.clear();
    this.siteLinks = [];
    this.sharedQuestNames.clear();
    this.finishedSharedQuestNames.clear();
    this.finishedShareIds.clear();
    this._finishedShares = [];
    this.storyStarted.clear();
    this.storyEnded.clear();
    this.questsToInvoke = [];
    this.unrestored = [];
    this.lastNPCClicked = null;
    this.lastNPCClickedHost = null;
  }

  restoreSaveData(data) {
    this.siteLinks = (data.siteLinks ?? []).map((l) => structuredClone(l));
    if (data.globalVars) this.globalVars = new Map(data.globalVars);
    this.spine = spineRecord(data.spine, (data.quests ?? []).map((q) => q?.questName));
    const clocks = this._questClocks();
    this.unrestored = [];
    for (const questData of [...(Array.isArray(data.unrestored) ? data.unrestored : []), ...(data.quests ?? [])]) {
      try {
        const quest = new Quest({ ...clocks, actionFactory: this._actionFactory, hooks: this._buildHooks(), questClockStepMax: () => this.deps.questClockStepMax?.() ?? Infinity });
        quest.restoreSaveData(questData, this._saveResolvers());
        // The envelope has no ticksToEnd, so a quest saved inside the end quest grace enters its grace again.
        if (!quest.questComplete && endQuestRan(quest)) quest.ticksToEnd = 2;
        localizeDisplayName(quest);
        if (this.quests.has(quest.uid)) throw new Error('An item with the same key has already been added.');
        this.quests.set(quest.uid, quest);
      } catch (e) {
        const dn = questData.displayName ?? '';
        console.warn(`[quest] Failed to load quest data for '${dn} [${questData.questName}]' with UID ${questData.uid}. This is expected after removing a mod with custom quest actions. Exception message is '${e?.message ?? e}'`);
        this.unrestored.push(structuredClone(questData));
        this.deps.addHUDText?.(`Quest '${dn} [${questData.questName}]' could not be loaded and was set aside with its progress kept. It is tried again at the next load.`);
      }
    }
    for (const questData of Array.isArray(data.toInvoke) ? data.toInvoke : []) {
      try {
        const quest = new Quest({ ...clocks, actionFactory: this._actionFactory, hooks: this._buildHooks(), questClockStepMax: () => this.deps.questClockStepMax?.() ?? Infinity });
        quest.restoreSaveData(questData, this._saveResolvers());
        localizeDisplayName(quest);
        if (!this.quests.has(quest.uid) && !this.questsToInvoke.some((q) => q.uid === quest.uid)) this.questsToInvoke.push(quest);
      } catch (e) {
        console.warn(`[quest] Failed to load scheduled quest '${questData?.questName ?? ''}': ${e?.message ?? e}`);
      }
    }
    this.removeStaleSiteLinks();
    const memory = data.shareMemory && typeof data.shareMemory === 'object' ? data.shareMemory : null;
    if (memory) {
      for (const id of Array.isArray(memory.finishedIds) ? memory.finishedIds : []) if (typeof id === 'string' && id) this.finishedShareIds.add(id);
      for (const n of Array.isArray(memory.finishedNames) ? memory.finishedNames : []) if (typeof n === 'string') this.finishedSharedQuestNames.add(n);
      for (const n of Array.isArray(memory.inStep) ? memory.inStep : []) if (typeof n === 'string' && this.sharedCandidateNamed(n) && !isShelved(this.sharedCandidateNamed(n))) this.sharedQuestNames.add(n);
      for (const [uid, accts] of Array.isArray(memory.holders) ? memory.holders : []) { const q = this.quests.get(Number(uid)); if (q && Array.isArray(accts)) q._holdersHeard = new Set(accts.map(String)); }
      for (const [uid, acct] of Array.isArray(memory.sharers) ? memory.sharers : []) { const q = this.quests.get(Number(uid)); if (q && acct != null) q._sentBy = String(acct); }
    } else for (const q of this.quests.values()) {
      if (typeof q.shareId !== 'string' || !q.shareId) continue;
      if (q.questComplete || q.questTombstoned) this.finishedShareIds.add(q.shareId);
      else if (!isShelved(q)) this.sharedQuestNames.add(q.questName);
      if (q.ql?.received) q.ql.received = false;
    }
    for (const n of data.storyStarted ?? []) if (isMainStoryQuest(n)) this.storyStarted.add(String(n).toUpperCase());
    for (const n of data.storyEnded ?? []) if (isMainStoryQuest(n)) this.storyEnded.add(String(n).toUpperCase());
    this.storyLegacy = !Array.isArray(data.storyStarted);
    if (!this.storyLegacy) return;
    for (const q of this.quests.values()) {
      if (!isMainStoryQuest(q.questName)) continue;
      const n = q.questName.toUpperCase();
      this.storyStarted.add(n);
      if (q.questTombstoned) this.storyEnded.add(n);
    }
    for (const q of this.quests.values()) if (!q.questTombstoned && isMainStoryQuest(q.questName)) this.storyEnded.delete(q.questName.toUpperCase());
  }

  removeStaleSiteLinks() {
    const stale = this.siteLinks.filter((link) => !this.getQuest(link.questUID));
    for (const link of stale) {
      console.warn(`[quest] Removing stale SiteLink ${link.placeSymbol?.original}. Quest UID ${link.questUID} not present.`);
      this.siteLinks.splice(this.siteLinks.indexOf(link), 1);
    }
  }

  hasActiveQuestNamed(questName) { return this.sharedCandidateNamed(questName) !== null; }

  sharedCandidateNamed(questName) {
    let away = null;
    for (const quest of this.quests.values()) {
      if (quest.questName !== questName || quest.questTombstoned) continue;
      if (!isShelved(quest)) return quest;
      away ??= quest;
    }
    return away;
  }

  getShareableQuestData(uid) {
    const quest = this.quests.get(Number(uid));
    if (!quest || isShelved(quest)) return null;
    quest.shareId ??= mintShareId();
    const data = quest.getSaveData();
    // A prompt whose box is up goes out complete, so a partner's copy does not ask the same question again.
    const order = [...quest.tasks.values()].map((t) => t.symbol?.name);
    for (const place of heldPromptPlaces(quest)) {
      const at = place.lastIndexOf('#');
      const action = data.tasks?.[order.indexOf(place.slice(0, at))]?.actions?.[Number(place.slice(at + 1))];
      if (action) action.isComplete = true;
    }
    return data;
  }

  _snapshotActionCompletion(quest) {
    const map = new Map();
    let t = 0;
    for (const task of quest.tasks.values()) {
      let a = 0;
      for (const action of task.actions) { map.set(`${t}:${a}`, action.isComplete); a++; }
      t++;
    }
    return map;
  }

  // Only actions that newly turned complete since before are armed, so a reward never fires twice.
  // Position is a stable identity because one restore rebuilds the actions from the same quest source.
  _rearmNewlyCompletedEffects(quest, before) {
    let t = 0;
    for (const task of quest.tasks.values()) {
      let a = 0;
      for (const action of task.actions) {
        const was = before ? (before.get(`${t}:${a}`) ?? false) : false;
        if (!was && action.isComplete && REPLAYABLE_ONE_TIME_ACTIONS.has(action.typeName)) action.isComplete = false;
        a++;
      }
      t++;
    }
  }

  // The uid is minted here, never the sender's, and site links are made again from each Place's own siteDetails.
  receiveSharedQuest(questData) {
    questData = { ...this._onThisClock(questData), ...NO_SHELF, ...NO_INSTANCE, ql: receivedState(questData.ql) };
    const quest = this._newQuest();
    const uid = nextUid();
    // An envelope the restore cannot read is refused, never left as half a quest on the live table.
    try { quest.restoreSaveData({ ...questData, uid }, this._saveResolvers()); } catch (e) { console.warn(`[quest] shared quest refused: ${e?.message ?? e}`); return null; }
    if (quest.ql) quest.ql.tier = this.deps.questlinesStamp?.(quest)?.tier ?? 1;
    for (const r of quest.resources.values()) if (r.isItem) r.goldPaid = false;
    this._relinkQuestItems(quest);
    this.deps.addQuestTopics?.(quest);
    this.sharedQuestNames.add(quest.questName);
    this.quests.set(quest.uid, quest); this._reseatArrived(quest);
    for (const resource of quest.resources.values()) {
      if (resource.isPlace && resource.siteDetails) this.createSiteLink(quest, resource.symbol);
    }
    this._rearmNewlyCompletedEffects(quest, null);
    return quest;
  }

  hasSharedQuestNamed(questName) { return this.sharedQuestNames.has(questName); }

  noteShareHolder(questName, account) {
    const quest = this.sharedCandidateNamed(questName);
    if (!quest || account == null || account === '') return;
    (quest._holdersHeard ??= new Set()).add(String(account));
  }

  markQuestShared(questName) {
    this.sharedQuestNames.add(questName);
  }

  nextFinishedShare() { return this._finishedShares[0] ?? null; }
  settleFinishedShare(data) {
    const i = this._finishedShares.indexOf(data);
    if (i >= 0) this._finishedShares.splice(i, 1);
  }
  pendFinishedShare(data) {
    if (data && this.finishedSharedQuestNames.has(data.questName) && !this._finishedShares.includes(data)) this._finishedShares.unshift(data);
  }

  _registerBehaviour(b) {
    if (typeof WeakRef !== 'function') return;
    if (this._behaviourRefs.size >= this._behaviourSweepAt) {
      this._pruneBehaviours();
      this._behaviourSweepAt = Math.max(BEHAVIOUR_SWEEP_MIN, this._behaviourRefs.size * 2);
    }
    this._behaviourRefs.add(new WeakRef(b));
  }
  _pruneBehaviours() {
    for (const ref of this._behaviourRefs) {
      const b = ref.deref();
      if (!b || b.isComponentDestroyed) this._behaviourRefs.delete(ref);
    }
  }
  _liveBehaviours(uid) {
    this._pruneBehaviours();
    const out = [];
    for (const ref of this._behaviourRefs) {
      const b = ref.deref();
      if (b?.questUID === uid) out.push(b);
    }
    return out;
  }
  _relinkQuestItems(quest) {
    for (const r of quest.resources.values()) {
      const it = r.isItem ? r.daggerfallUnityItem : null;
      if (!it?.questItem) continue;
      it.questUID = quest.uid;
      it.questSymbol = r.symbol?.clone() ?? null;
    }
  }
  updateSharedQuest(questName, questData, { from = null } = {}) {
    from = from == null ? '' : String(from);
    const quest = this.sharedCandidateNamed(questName);
    if (!quest) return null;
    if (isShelved(quest)) return null;
    if (quest.questComplete || quest.questTombstoned) return null;
    // A copy already inside the end quest grace takes no envelope, or the end would pay twice.
    if (quest.ticksToEnd > 0) return quest;
    // Dry run on a scratch Quest first, because restoreSaveData clears as it goes.
    // A finished envelope restores as running and then ends here, so its re-armed rewards run once.
    const finishing = questData.questComplete === true;
    if (finishing) questData = { ...questData, questComplete: false, questTombstoned: false };
    questData = { ...this._onThisClock(questData), ...NO_SHELF };
    const scratch = this._newQuest();
    const uid = quest.uid;
    try { scratch.restoreSaveData({ ...questData, uid }, this._saveResolvers()); } catch (e) { console.warn(`[quest] shared quest resync refused: ${e?.message ?? e}`); return null; }
    const before = this._snapshotActionCompletion(quest);
    // State from this world survives a resync: task flags, journal steps, enemy counters, queues, and items.
    const tasksBefore = new Map(), logsBefore = [...quest.activeLogMessages.values()].map((e) => ({ ...e }));
    for (const task of quest.tasks.values()) {
      if (task.type === TaskType.Standard || task.type === TaskType.Variable) tasksBefore.set(task.symbol?.name, { triggered: !!task.triggered, prev: !!task.prevTriggered });
    }
    const foesBefore = new Map();
    for (const r of quest.resources.values()) if (r.isFoe) foesBefore.set(r.symbol?.name ?? String(r.symbol), { killCount: r.killCount | 0, injured: !!r.injuredTrigger, dying: !!r.deathTrigger, spellQueue: r.spellQueue ?? null, itemQueue: r.itemQueue ?? null, learned: new Map(r.learnedKills ?? []) });
    const itemsBefore = new Map();
    for (const r of quest.resources.values()) if (r.isItem && r.daggerfallUnityItem) itemsBefore.set(r.symbol?.name, r.daggerfallUnityItem);
    const paidBefore = new Map([...quest.resources.values()].filter((r) => r.isItem).map((r) => [r.symbol?.name, !!r.goldPaid]));
    const actsBefore = new Map();
    for (const r of quest.resources.values()) {
      const hidden = !!(r.isItem && r.isHidden);
      if (r.hasPlayerClicked || hidden) actsBefore.set(r.symbol?.name, { clicked: !!r.hasPlayerClicked, hidden });
    }
    const standing = this._liveBehaviours(uid);
    // Each copy's clocks belong to its holder: a clock running in both keeps this copy's remainder.
    // A clock that ran out here stays run out.
    const clocksBefore = new Map(), finishedBefore = new Map(), wavesBefore = new Map();
    for (const r of quest.resources.values()) {
      if (r.isClock && r.clockEnabled && !r.clockFinished) clocksBefore.set(r.symbol?.name, { remaining: r.remainingTimeInSeconds, sample: r._lastWorldTimeSample, raised: r._lastRaisedSample });
      if (r.isClock && r.clockFinished) { const tk = quest.getTask?.(r.symbol); finishedBefore.set(r.symbol?.name, tk ? { triggered: tk.triggered, prev: tk.prevTriggered } : null); }
    }
    { let t = 0; for (const task of quest.tasks.values()) { let a = 0; for (const action of task.actions) { if (action.typeName === 'CreateFoe') wavesBefore.set(`${t}:${a}`, { last: action.lastSpawnTime, tick: action._lastTick, raised: action._lastRaised, count: action.spawnCounter }); a++; } t++; } }
    const sitesBefore = new Map();
    for (const r of quest.resources.values()) if (r.isPlace && r.siteDetails) sitesBefore.set(r.symbol?.name, structuredClone(r.siteDetails));
    const qlBefore = quest.ql;
    quest.restoreSaveData({ ...questData, uid, instanceEpoch: quest.instanceEpoch ?? null }, this._saveResolvers());
    quest.ql = mergeSharedState(qlBefore, questData.ql);
    for (const r of quest.resources.values()) if (r.isPlace && sitesBefore.has(r.symbol?.name)) r.keepOwnSite?.(sitesBefore.get(r.symbol?.name));
    for (const r of quest.resources.values()) {
      if (r.isClock && !r.clockFinished && finishedBefore.has(r.symbol?.name)) {
        r.clockEnabled = false; r.clockFinished = true; r.remainingTimeInSeconds = 0;
        const task = quest.getTask?.(r.symbol), was = finishedBefore.get(r.symbol?.name);
        if (task && was?.triggered) { task.triggered = true; task.prevTriggered = was.prev; }
        continue;
      }
      const was = r.isClock && r.clockEnabled && !r.clockFinished ? clocksBefore.get(r.symbol?.name) : null;
      if (!was) continue;
      r.remainingTimeInSeconds = was.remaining;
      r._lastWorldTimeSample = was.sample;
      r._lastRaisedSample = was.raised;
    }
    { let t = 0; for (const task of quest.tasks.values()) { let a = 0; for (const action of task.actions) { const w = action.typeName === 'CreateFoe' ? wavesBefore.get(`${t}:${a}`) : null; if (w && w.last) { action.lastSpawnTime = w.last; action._lastTick = w.tick; action._lastRaised = w.raised; action.spawnCounter = w.count | 0; } a++; } t++; } }
    for (const r of quest.resources.values()) if (r.isItem && itemsBefore.has(r.symbol?.name)) r.daggerfallUnityItem = itemsBefore.get(r.symbol?.name);
    for (const r of quest.resources.values()) if (r.isItem) r.goldPaid = paidBefore.get(r.symbol?.name) ?? false;
    for (const r of quest.resources.values()) {
      const was = actsBefore.get(r.symbol?.name);
      if (was?.clicked && !r.hasPlayerClicked) r.setPlayerClicked();
      if (was?.hidden && r.isItem) r.isHidden = true;
    }
    this._relinkQuestItems(quest);
    for (const r of quest.resources.values()) {
      const was = r.isFoe ? foesBefore.get(r.symbol?.name ?? String(r.symbol)) : null;
      if (!was) continue;
      const brought = r.killCount | 0;
      r.killCount = Math.max(brought, was.killCount);
      r.learnedKills = was.learned;
      if (brought > was.killCount) r.learnedKills.set(from, (r.learnedKills.get(from) ?? 0) + brought - was.killCount);
      // restrained is not kept, because restraint is set and cleared by quest actions the partner's copy carries.
      if (was.injured) r.injuredTrigger = true;
      if (was.dying) r.deathTrigger = true;
      if ((was.spellQueue?.length ?? 0) > (r.spellQueue?.length ?? 0)) r.spellQueue = was.spellQueue;
      if ((was.itemQueue?.length ?? 0) > (r.itemQueue?.length ?? 0)) r.itemQueue = was.itemQueue;
    }
    // Completion is monotonic, so an action already seen complete never runs again from an older copy.
    let t = 0;
    for (const task of quest.tasks.values()) {
      let a = 0;
      for (const action of task.actions) { if (before.get(`${t}:${a}`) === true && !action.isComplete) action.isComplete = true; a++; }
      t++;
    }
    const cleared = new Set(), unlogged = new Set();
    t = 0;
    for (const task of quest.tasks.values()) {
      let a = 0;
      for (const action of task.actions) {
        if (before.get(`${t}:${a}`) !== true && action.isComplete) {
          if (action.typeName === 'ClearTask' || action.typeName === 'UnsetTask') for (const sym of action.taskSymbols ?? []) cleared.add(sym?.name);
          if (action.typeName === 'RemoveLogMessage') unlogged.add(action.stepID);
        }
        a++;
      }
      t++;
    }
    let kept = 0;
    for (const task of quest.tasks.values()) {
      const was = tasksBefore.get(task.symbol?.name);
      if (!was?.triggered || task.triggered || task.dropped || cleared.has(task.symbol?.name)) continue;
      // Set directly, because setTriggerValue would rearm the task.
      task.triggered = true; task.prevTriggered = was.prev;
      kept++;
    }
    for (const log of logsBefore) {
      if (quest.activeLogMessages.has(log.stepID) || unlogged.has(log.stepID)) continue;
      quest.activeLogMessages.set(log.stepID, log);
      kept++;
    }
    quest._keptLocal = kept;
    this._reseatArrived(quest);
    // Each Place link is made again, never added again, so links do not pile up across resyncs.
    this.siteLinks = this.siteLinks.filter((link) => link.questUID !== quest.uid);
    for (const resource of quest.resources.values()) {
      if (resource.isPlace && resource.siteDetails) this.createSiteLink(quest, resource.symbol);
    }
    for (const b of standing) b.relinkToLiveQuest?.();
    this.deps.relinkQuestTopics?.(quest);
    this._rearmNewlyCompletedEffects(quest, before);
    if (finishing) { quest._finishedBySync = true; quest.endQuest(); }
    return quest;
  }

  _onThisClock(questData) {
    const { nowSeconds, worldSeconds } = this._questClocks();
    return questDataOnThisClock(questData, nowSeconds(), worldSeconds());
  }

  _newQuest() {
    return new Quest({ ...this._questClocks(), actionFactory: this._actionFactory, hooks: this._buildHooks(), questClockStepMax: () => this.deps.questClockStepMax?.() ?? Infinity });
  }

  // Parses headless with the script the copy was read with, so the shape is the script's, not the receiver's world.
  parseQuestShape(questName, factionId = 0, { questlines = undefined } = {}) {
    const lines = this.deps.getQuestSourceLines?.(questName, questlines);
    if (!lines) return null;
    return this.parseQuestForLists(lines, Number(factionId) || 0, { headless: true });
  }

  hasFinishedSharedQuestNamed(questName) { return this.finishedSharedQuestNames.has(questName); }
  hasFinishedSharedCopy(questName, shareId) {
    return typeof shareId === 'string' && shareId ? this.finishedShareIds.has(shareId) : this.finishedSharedQuestNames.has(questName);
  }

  _saveResolvers() {
    const actionTypeMap = new Map(this.actionTemplates.map((t) => [t.typeName, t.constructor]));
    return {
      Task,
      resolveResourceType: (name) => RESOURCE_TYPES[name] ?? null,
      resolveActionType: (name) => actionTypeMap.get(name) ?? null,
    };
  }

  tick() {
    this.beat++;
    // Before the invoke loop, so a start lands this tick.
    if (this.beat % SPINE_CHECK_TICKS === 0) this.keepSpine();
    if (this.beat % SPINE_CHECK_TICKS === 0) this.keepOpeners();
    for (const quest of this.questsToInvoke) {
      try {
        this.startQuestImmediate(quest);
        // As in C#, Tick raises OnQuestStarted again for every scheduled quest, so it fires twice.
        this.deps.onQuestStarted?.(quest);
      } catch (e) {
        console.warn(`[quest] QuestMachine failed to start quest ${quest.questName}: ${e?.message ?? e}`);
      }
    }
    this.questsToInvoke.length = 0;

    // A faulting quest is collected here and removed after the other updates and the tombstone pass, as in C#.
    const questsToTombstone = [], questsToRemove = [];
    for (const quest of this.quests.values()) {
      try {
        if (!quest.questComplete && !isShelved(quest)) quest.update();
      } catch (e) {
        console.warn(`[quest] QuestMachine encountered an exception in quest ${quest.questName}: ${e?.message ?? e}`);
        if (!isProtectedQuest(quest)) questsToRemove.push(quest);
      }
      if (quest.questComplete && !quest.questTombstoned) questsToTombstone.push(quest);
      if (quest.questTombstoned
        && (this.deps.nowSeconds?.() ?? 0) - quest.questTombstoneTime > SECONDS_PER_WEEK) {
        questsToRemove.push(quest);
      }
    }

    for (const quest of questsToTombstone) this.tombstoneQuest(quest);
    for (const quest of questsToRemove) this.removeQuest(quest);
  }

  keepSpine() {
    if (!spineOwed(this)) return false;
    const lines = this.deps.getQuestSourceLines?.(SPINE);
    let quest = null, why = 'no source';
    if (lines) try { quest = this.scheduleQuest(lines); } catch (ex) { why = ex?.message ?? String(ex); }
    this.spineTries = (this.spineTries ?? 0) + 1;
    if (quest && !this.spineSaid) { this.spineSaid = true; console.warn(`[quest] ${SPINE} (the main quest's backbone) was owed - scheduled (try ${this.spineTries})`); }
    else if (this.spineTries === 1) console.warn(`[quest] ${SPINE} (the main quest's backbone) is owed and did not start (${why}) - asked again every ${SPINE_CHECK_TICKS} quest ticks`);
    return !!quest;
  }

  keepOpeners() {
    let n = 0;
    for (const name of openersOwed(this)) {
      try { if (this.startQuestByName(name)) { n++; console.warn(`[quest] ${name} was never begun in this game - started now`); } } catch (e) { console.warn(`[quest] ${name} did not start`, e?.message ?? e); }
    }
    return n;
  }

  seedSpine(entries) {
    if ((entries ?? []).some((e) => e?.kind === 'quest' && questNameIn([SPINE_OPENER], String(e.quest ?? '')))) this.spine.opened = true;
  }

  _spineData() {
    const spine = spineRecord(this.spine, [...this.quests.values()].map((q) => q.questName));
    return spine.opened || spine.ran || spine.cursed ? { spine } : {};
  }

  // Abandon sets the quest aside whole, never a tombstone, and its sites stay reserved until it is reclaimed.
  shelveQuest(uid, { refuse = null } = {}) {
    const why = this.shelveRefusal(uid, { refuse });
    if (why) return { ok: false, reason: why };
    const quest = this.quests.get(Number(uid));
    if (this.sharedCandidateNamed(quest.questName) === quest) this.sharedQuestNames.delete(quest.questName);
    const now = Math.floor(this.deps.nowSeconds?.() ?? 0);
    // 0 reads as never set aside.
    quest.shelvedAt = now !== 0 ? now : 1;
    quest.shelvedSites = [...new Set(this.siteLinks.filter((l) => l.questUID === quest.uid).map((l) => l.placeSymbol?.name).filter(Boolean))];
    quest.shelvedItems = [...quest.resources.values()].filter((r) => r?.isItem && !r.madePermanent && this.deps.carriesQuestItem?.(r)).map((r) => r.symbol.name);
    this.siteLinks = this.siteLinks.filter((l) => l.questUID !== quest.uid);
    for (const [factionID, owner] of [...this.factionListeners]) if (owner?.parentQuest === quest) this.factionListeners.delete(factionID);
    for (const task of quest.tasks.values()) {
      for (const action of task.actions) if (action?.typeName === 'CreateFoe') { action.pendingFoes = null; action.spawnInProgress = false; }
    }
    this.deps.forceTopicListsUpdate?.();
    return { ok: true, quest };
  }

  shelveRefusal(uid, { refuse = null } = {}) {
    const quest = this.quests.get(Number(uid));
    if (!quest || quest.questComplete || quest.questTombstoned) return 'gone';
    if (isShelved(quest)) return 'shelved';
    if (quest.ticksToEnd > 0) return 'ending';
    if (isProtectedQuest(quest)) return 'protected';
    return refuse?.(quest) ?? null;
  }

  // Reclaim moves the quest clock stamps on by the time it was away, so no deadline runs down meanwhile.
  reclaimQuest(uid) {
    const quest = this.quests.get(Number(uid));
    if (!quest || quest.questTombstoned) return { ok: false, reason: 'gone' };
    if (!isShelved(quest)) return { ok: false, reason: 'running' };
    if (!isShelved(this.sharedCandidateNamed(quest.questName))) return { ok: false, reason: 'twin' };
    const now = Math.floor(this.deps.nowSeconds?.() ?? 0);
    const away = Math.max(0, now - quest.shelvedAt);
    const sites = quest.shelvedSites ?? [];
    const carried = quest.shelvedItems ?? [];
    const data = JSON.parse(JSON.stringify(quest.getSaveData()));
    data.shelvedAt = null;
    data.shelvedSites = null;
    data.shelvedItems = null;
    shiftQuestStamps(data, away, { own: true });
    const standing = this._liveBehaviours(quest.uid);
    quest.restoreSaveData({ ...data, uid: quest.uid }, this._saveResolvers());
    for (const name of sites) {
      const place = quest.getPlace?.({ name });
      if (place?.siteDetails && !this.siteLinks.some((l) => l.questUID === quest.uid && l.placeSymbol?.name === name)) this.createSiteLink(quest, place.symbol);
    }
    for (const b of standing) b.relinkToLiveQuest?.();
    this.deps.relinkQuestTopics?.(quest);
    let returned = 0;
    for (const name of carried) {
      const res = quest.getItem?.({ name });
      if (!res?.daggerfallUnityItem || (this.deps.keepsQuestItem ?? this.deps.carriesQuestItem)?.(res)) continue;
      this.deps.giveItemToPlayer?.(structuredClone(res.daggerfallUnityItem));
      returned++;
    }
    this.deps.forceTopicListsUpdate?.();
    return { ok: true, quest, returned };
  }

  // The new copy is parsed first, while the old one still holds its sites, so its Places choose afresh.
  restartQuest(uid, { refuse = null } = {}) {
    const why = this.restartRefusal(uid, { refuse });
    if (why) return { ok: false, reason: why };
    const old = this.quests.get(Number(uid));
    const stamped = old.ql?.stamp === QL_STAMP;
    const lines = this.deps.getQuestSourceLines?.(old.questName, stamped || undefined);
    const fresh = lines ? this.parseQuestForLists(lines, old.factionId) : null;
    if (!fresh) return { ok: false, reason: 'unparsed' };
    if (stamped) fresh.ql = this.deps.questlinesStamp?.(fresh) ?? { ...freshState(), tier: old.ql.tier };
    for (const [key, r] of old.resources) if (r?.isItem && r.goldPaid && fresh.resources.get(key)?.isItem) fresh.resources.get(key).goldPaid = true;
    if (this.sharedCandidateNamed(old.questName) === old) this.sharedQuestNames.delete(old.questName);
    this.removeQuest(old);
    try {
      this.startQuestImmediate(fresh);
    } catch (e) {
      console.warn(`[quest] QuestMachine failed to restart quest ${fresh.questName}: ${e?.message ?? e}`);
      return { ok: false, reason: 'failed' };
    }
    this.deps.forceTopicListsUpdate?.();
    return { ok: true, quest: fresh };
  }

  restartRefusal(uid, { refuse = null } = {}) {
    const why = this.shelveRefusal(uid);
    if (why) return why;
    const quest = this.quests.get(Number(uid));
    if (holdsQuestorDoor(quest)) return 'questor';
    if (questPaidOut(quest)) return 'paid';
    if ([...quest.tasks.values()].some((t) => t.actions?.some((a) => a?.typeName === 'StartQuest' && a.isComplete))) return 'started';
    for (const parent of this.quests.values()) {
      if (parent === quest || parent.questComplete || parent.questTombstoned) continue;
      for (const task of parent.tasks.values()) {
        if (task.actions?.some((a) => a?.typeName === 'RunQuest' && !a.isComplete && a.questUId === quest.uid)) return 'child';
      }
    }
    return refuse ? refuse(quest) ?? null : null;
  }

  // A failed main story step can start again unless the story went on past it or its own work would rerun at once.
  storyAgainRefusal(questName) {
    const name = String(questName ?? '').toUpperCase();
    if (!isMainStoryQuest(name)) return 'protected';
    const live = (n) => [...this.quests.values()].some((q) => !q.questTombstoned && q.questName?.toUpperCase() === n)
      || this.questsToInvoke.some((q) => q.questName?.toUpperCase() === n);
    if (live(name)) return 'running';
    if (!this.storyEnded.has(name)) return 'gone';
    const shapes = new Map();
    const shapeOf = (n) => {
      if (!shapes.has(n)) { const l = this.deps.getQuestSourceLines?.(n); shapes.set(n, l ? storyShape(l) : null); }
      return shapes.get(n);
    };
    const own = shapeOf(name);
    if (!own) return 'unparsed';
    const needs = (n, seen = new Set()) => {
      const sh = shapeOf(n);
      if (!sh || seen.has(n)) return false;
      seen.add(n);
      return sh.sets.length > 0 || sh.next.some((x) => needs(x, seen));
    };
    if (!needs(name)) return 'needless';
    const began = (n, seen = new Set()) => {
      if (seen.has(n)) return false;
      seen.add(n);
      return this.storyStarted.has(n) || live(n) || (shapeOf(n)?.next ?? []).some((x) => needs(x) && began(x, seen));
    };
    const next = own.next.filter((n) => n !== name && needs(n));
    if (next.length ? next.some((n) => began(n)) : own.sets.some((id) => this.globalVars.get(id))) return 'carried';
    if (own.replays.some((id) => this.globalVars.get(id))) return 'carried';
    return null;
  }

  storyAgainQuests() { return [...this.storyEnded].filter((n) => this.storyAgainRefusal(n) === null); }

  startStoryAgain(questName) {
    const why = this.storyAgainRefusal(questName);
    if (why) return { ok: false, reason: why };
    const quest = this.startQuestByName(String(questName).toUpperCase());
    if (!quest) return { ok: false, reason: 'unparsed' };
    this.deps.forceTopicListsUpdate?.();
    return { ok: true, quest };
  }

  seedStory(entries) {
    if (!this.storyLegacy) return;
    for (const e of entries ?? []) {
      const n = String(e?.quest ?? '').toUpperCase();
      if (!isMainStoryQuest(n)) continue;
      this.storyStarted.add(n);
      if (![...this.quests.values()].some((q) => q.questName?.toUpperCase() === n && !q.questTombstoned)) this.storyEnded.add(n);
    }
    this.storyLegacy = false;
  }

  tombstoneQuest(quest, { ended = false } = {}) {
    if (ended && !quest.questComplete && !quest.questTombstoned) quest.hooks?.questEnding?.(quest);
    // A shared copy that ended takes its final envelope now, before the dispose below.
    if (quest.questComplete && !quest.questTombstoned && !quest._finishedBySync && this.sharedQuestNames.has(quest.questName)) {
      const data = this.getShareableQuestData(quest.uid);
      if (data) this._finishedShares.push(data);
    }
    if (this.sharedQuestNames.has(quest.questName)) { this.sharedQuestNames.delete(quest.questName); this.finishedSharedQuestNames.add(quest.questName); }
    if (quest.shareId) this.finishedShareIds.add(quest.shareId);
    if (isMainStoryQuest(quest.questName)) this.storyEnded.add(quest.questName.toUpperCase());
    for (const resource of quest.resources.values()) resource.dispose();
    for (const task of quest.tasks.values()) task.disposeActions();
    // Site links die with the quest, or hasSiteLink would mislead the next quest at the same site.
    this.siteLinks = this.siteLinks.filter((link) => link.questUID !== quest.uid);
    quest.tombstone();
    this.deps.onQuestEnded?.(quest);
  }

  removeQuest(quest) {
    if (!quest) return false;
    if (!quest.questTombstoned) this.tombstoneQuest(quest);
    this.quests.delete(quest.uid);
    // The post-quest rumor leaves with its quest, or its next telling would show unexpanded placeholders.
    this.deps.removeProgressRumors?.(quest.uid);
    return true;
  }

  addSiteLink(siteLink) { this.siteLinks.push(siteLink); }

  getSiteLinks(siteType, mapId, buildingKey = 0, magicNumberIndex = 0) {
    return this.siteLinks.filter((link) =>
      link.siteType === siteType && link.mapId === mapId
      && (buildingKey === 0 || link.buildingKey === buildingKey)
      && (magicNumberIndex === 0 || link.magicNumberIndex === magicNumberIndex));
  }

  hasSiteLink(parentQuest, placeSymbol) {
    const place = parentQuest.getPlace(placeSymbol);
    if (!place) throw new Error(`HasSiteLink() could not find Place symbol ${placeSymbol?.name}`);
    return this.getSiteLinks(place.siteDetails?.siteType, place.siteDetails?.mapId,
      place.siteDetails?.buildingKey ?? 0, place.siteDetails?.magicNumberIndex ?? 0)
      .some((link) => link.questUID === parentQuest.uid && link.placeSymbol?.name === place.symbol?.name);
  }

  createSiteLink(parentQuest, placeSymbol) {
    const place = parentQuest.getPlace(placeSymbol);
    if (!place) throw new Error(`Attempted to add SiteLink for invalid Place symbol ${placeSymbol?.name}`);
    this.addSiteLink({ questUID: parentQuest.uid, placeSymbol: placeSymbol.clone(), ...linkSiteOf(place) });
  }

  getAllActiveQuestSites() {
    const sites = [];
    for (const quest of this.quests.values()) {
      if (quest.questComplete) continue;
      for (const resource of quest.resources.values()) {
        if (resource.isPlace && resource.siteDetails) sites.push(resource.siteDetails);
      }
    }
    return sites;
  }

  reseatMovedSites(world = this.deps.world ?? null) {
    if (!world) return 0;
    let moved = 0;
    for (const quest of this.quests.values()) moved += this._reseatMovedOf(quest, world, 'typed');
    for (const quest of this.quests.values()) moved += this._reseatMovedOf(quest, world, 'wild');
    return moved;
  }
  _reseatMovedOf(quest, world, pass = null) {
    if (!world || quest.questComplete) return 0;
    let moved = 0;
    const follow = (place) => this._followSite(quest, place);
    const typed = (place) => (place.declaredSiteLaw?.()?.p2 ?? -1) >= 0;
    for (const resource of pass === 'wild' ? [] : quest.resources.values()) {
      if (!resource.isPerson || !resource.reseatMovedQuestor?.(world)) continue;
      moved++;
      const hall = resource.homePlaceSymbol ? quest.getPlace(resource.homePlaceSymbol) : null;
      if (hall?.siteDetails) follow(hall);
    }
    for (const resource of quest.resources.values()) {
      if (resource.isPlace && pass && typed(resource) !== (pass === 'typed')) continue;
      if (!resource.isPlace || !resource.reseatMovedSite?.(world)) continue;
      moved++;
      follow(resource);
      resource.fitSiteToBuild?.(world);
    }
    if (pass === 'typed') return moved;
    for (const resource of quest.resources.values()) if (resource.isPlace) resource.mendCuratedMarkers?.(world);
    for (const resource of quest.resources.values()) if (resource.isPlace) resource.nameSiteAgain?.(world);
    return moved;
  }
  _followSite(quest, place) {
    for (const link of this.siteLinks) {
      if (link.questUID === quest.uid && link.placeSymbol?.name === place.symbol?.name) Object.assign(link, linkSiteOf(place));
    }
  }

  reseatHomedSites(world = this.deps.world ?? null) {
    if (!world?.isPlayerHome) return 0;
    let moved = 0;
    for (const quest of this.quests.values()) {
      if (quest.questComplete || isShelved(quest)) continue;
      for (const resource of quest.resources.values()) {
        if (!resource.isPlace) continue;
        const was = resource.siteDetails;
        if (!resource.repickHomedSite?.(world)) continue;
        moved++;
        this._followSite(quest, resource);
        try { world.questSiteMoved?.(quest, resource, was); } catch (e) { console.error('[quest] a homed site\'s map and talk:', e?.message ?? e); }
      }
    }
    return moved;
  }

  noteSiteReached(mapId, buildingKey) {
    if (!(buildingKey > 0)) return 0;
    let n = 0;
    for (const quest of this.quests.values()) {
      if (quest.questComplete) continue;
      for (const resource of quest.resources.values()) {
        const sd = resource.isPlace ? resource.siteDetails : null;
        if (sd?.siteType !== SITE_TYPES.Building || sd.mapId !== mapId || sd.buildingKey !== buildingKey || sd.reached) continue;
        sd.reached = true;
        n++;
      }
    }
    return n;
  }

  _reseatArrived(quest) {
    const world = this.deps.world ?? null;
    if (!world || world.townLayoutsKnown?.() === false) return 0;
    return this._reseatMovedOf(quest, world);
  }

  movedQuestorName(npcData) {
    const person = this.activeQuestor(npcData);
    return person && person.nameSeed !== npcData?.nameSeed ? person.displayName : null;
  }

  getAllActiveQuestors() {
    const out = [];
    for (const quest of this.quests.values()) {
      if (quest.questComplete) continue;
      for (const resource of quest.resources.values()) {
        if (resource.isPerson && resource.isQuestor && resource.questorData?.buildingKey > 0) out.push(resource.questorData);
      }
    }
    return out;
  }

  isActiveQuestBuilding(mapId, buildingKey, buildingType, residencesOnly = true) {
    if (residencesOnly && !(buildingType >= HOUSE1 && buildingType <= HOUSE6)) return false;
    return this.getAllActiveQuestSites().some((site) => site.buildingKey === buildingKey && site.mapId === mapId);
  }

  activeFactionPersons(factionID) {
    const found = [];
    for (const quest of this.quests.values()) {
      if (quest.questComplete || isShelved(quest)) continue;
      for (const resource of quest.resources.values()) {
        if (resource.isPerson && resource.factionId === factionID) found.push(resource);
      }
    }
    return found;
  }

  addFactionListener(factionID, owner) {
    if (!this.factionListeners.has(factionID)) this.factionListeners.set(factionID, owner);
  }

  removeFactionListener(factionID) {
    this.factionListeners.delete(factionID);
  }

  cullResourceTarget(resource, _newPlaceSymbol) {
    if (!resource) return;
    for (const link of this.siteLinks) {
      if (link.questUID !== resource.parentQuest.uid) continue;
      const quest = this.quests.get(link.questUID);
      if (!quest) { console.warn(`[quest] CullResourceTarget() could not find active quest for UID ${link.questUID}`); return; }
      const place = quest.getPlace(link.placeSymbol);
      if (!place) { console.warn(`[quest] CullResourceTarget() could not find Place symbol ${link.placeSymbol?.name} in quest UID ${link.questUID}`); return; }
      const selected = place.siteDetails?.selectedMarker;
      if (selected?.targetResources) {
        const i = selected.targetResources.findIndex((s) =>
          quest.getResource(s) != null
          && s.name === resource.symbol.name && s.original === resource.symbol.original);
        if (i !== -1) selected.targetResources.splice(i, 1);
      }
    }
  }
}

// One derivation for a new link and a re-seated one, so a moved site's link follows it to another town.
export const linkSiteOf = (place) => ({
  siteType: place.siteDetails?.siteType,
  mapId: place.siteDetails?.mapId,
  buildingKey: place.siteDetails?.buildingKey ?? 0,
  magicNumberIndex: place.siteDetails?.magicNumberIndex ?? 0,
});
