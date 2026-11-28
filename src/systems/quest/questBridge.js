// Builds the quest machine, lists, offer flow, and notebook over the host's ctx, and gives scenes a small verb set.
// Construction logs the ctx members a host leaves unwired.

import { QuestMachine, TICKS_PER_SECOND, holdsQuestorDoor } from './machine.js';
import { questorRegion } from './questRepute.js';
import { PROVINCIAL_QUEST_REP, rewardProvincialReputation } from '../../guilds/provincialRepute.js';
import { contentOn } from '../../mods/contentOff.js';
import { isEnhanced } from '../../ui/uiSkin.js';
import { clockCounts } from './clock.js';
import { repairActiveQuests, relayOnlineDungeons, relayMovedLayouts, relayBuiltDungeon } from './questRepair.js';
import { t, getLocalizedFactionName, textRevision } from '../../ui/textManager.js';
import { isOnlinePage } from '../../platform/onlineLane.js';
import { isShelved } from './quest.js';
import { WA_RAID_QUESTS } from '../naval/warmAshesShips.js';
import { QuestListsManager, isMainQuestName } from './questLists.js';
import { questHeld } from './mainSpine.js';
import { QuestOfferFlow, ACTIVE_QUESTOR } from './offerFlow.js';
import { localizedQuestDisplayName } from './localizedQuest.js';
import { PlayerNotebook } from '../../ui/notebook.js';
import { GENDERS } from '../../characters/nameHelper.js';
import { ZERO_NPC_DATA, NPC_CONTEXT, raceFromFaction } from '../../characters/staticNpc.js';
import { GUILD_GROUPS } from '../../formats/factionFile.js';
import { expandMacroValues, setMacroWorld } from './questMacros.js';
import { firstName } from '../../talk/talkSession.js';
import { getBool } from '../../platform/settings.js';
import { noteOfferPending, clearPendingOffer } from '../../ui/pendingOffer.js';
import { getTitle } from '../../guilds/guilds.js';
import { addQuestResourceObjects } from './sceneMount.js';
import { SITE_TYPES } from './place.js';
import { QuestLens } from '../../ui/questLens.js';
import { questHerald, heraldOn } from '../../ui/questHerald.js';
import { questTracker, followOn } from '../../ui/questTracker.js';
import { createQuestlines } from '../questlines/qlLayer.js';
import { vampireActionTemplates } from '../vampire/vampireActions.js';
import { questlineActionTemplates } from '../questlines/qlActions.js';
import { setActSink } from '../questlines/qlActs.js';
import { questlineService, serviceReady } from './questlineHost.js';
import { TITLE_TEXT } from '../../ui/playerBadge.js';
import { announceHonour } from '../../ui/lootBanner.js';
import { restackWeirKeys } from '../eliteGates/weirKey.js';
import { retireDisabledLineQuests } from '../questlines/qlLineRunner.js';
import { questlinesOn } from '../questlines/qlLaw.js';
import { ladders as guildLadders } from '../questlines/qlLadders.js';
import { activeMemberships } from '../../guilds/guilds.js';
import { factionsTable } from './tables.js';
import { quietText, clocksNamed } from '../../ui/questLens.js';
import { offerWaitingWords } from '../../ui/questlines/qlJournal.js';
import { createQuestlineOffers, setLineBoard } from './questlineOffers.js';

import { positionHash, staticNpcData, layoutNpcData } from '../../characters/staticNpc.js';
import { festivalQuestEnded } from '../festival/festivalClient.js';
import { effectiveLevel } from '../../characters/mentorMode.js';
import { setEscortQuestAway, setEscortQuestGone } from '../../ui/hudEscortFaces.js';

export { positionHash, staticNpcData, layoutNpcData };

export const SATISFY_QUEST_BY_LEVEL_GROUPS = Object.freeze([GUILD_GROUPS.MagesGuild, GUILD_GROUPS.KnightlyOrder]);

export function offerGuildSurface({ guildGroup, guild, membership, reputation, playerEntity = null }) {
  return {
    isMember: () => membership != null,
    rank: membership?.rank ?? 0,
    deity: guild?.divine ?? '',
    getReputation: () => reputation ?? 0,
    isSatisfyQuestReqByLevel: () => SATISFY_QUEST_BY_LEVEL_GROUPS.includes(guildGroup),
    // The macro engine reads a provider as `{ quest, source }`; with no `source`, %pct shows the player's name.
    source: {
      guildTitle: () => getTitle(membership, playerEntity, guild),
      amount: () => String(guild?.trainingPrice ?? 0),
    },
  };
}

export function tokensToRows(tokens) {
  const rows = [];
  let line = '';
  let sawText = false;
  for (const token of tokens ?? []) {
    if (token.formatting === 'text') { line += token.text; sawText = true; continue; }
    rows.push(line);
    line = '';
    sawText = false;
  }
  if (sawText) rows.push(line);
  return rows;
}

// The pick cannot be dismissed, as PromptMulti's box cannot. The chain waits behind boxes already up, and a pick
// the window cannot show settles null so the ask asks again later.
export function choiceBoxes(q, message, choices, respond) {
  const labels = choices.map((c) => tokensToRows(c.getTextTokens(-1, q.rolls)).join(' ').replace(/\s+/g, ' ').trim());
  let answered = false;
  const answer = (i) => { if (!answered) { answered = true; respond(i); } return []; };
  const question = () => (message ? { rows: tokensToRows(message.getTextTokens(-1, q.rolls)), onClick: () => [pick()] } : pick());
  const pick = () => ({ picker: labels, onPick: (i) => answer(i), onCancel: (why) => (why === 'unshown' ? answer(null) : [question()]) });
  return { ...question(), behind: true };
}

export const choiceDoor = (showQuestBox) => (q, message, choices, respond) => showQuestBox(choiceBoxes(q, message, choices, respond));

// The old tutorial no longer starts. S0000977 starts in its place, as every way out of that tutorial started it.
export const GAME_START_QUESTS = Object.freeze([...(contentOn('curseOfDaggerfall') ? ['S0000977'] : []), ...(contentOn('mainQuest') ? ['_BRISIEN'] : [])]);

export const RETIRED_TUTORIAL_QUEST = '_TUTOR__';
export const RETIRED_TUTORIAL_STARTS = 'S0000977';

// A save still in the old tutorial retires it as its own No would, and starts the curse unless the save holds it.
export function retireDfuTutorial(machine) {
  if (!machine?.quests) return { retired: 0, started: false };
  const live = [...machine.quests.values()].filter((q) => q?.questName === RETIRED_TUTORIAL_QUEST && !q.questComplete && !q.questTombstoned);
  if (!live.length) return { retired: 0, started: false };
  for (const q of live) machine.removeQuest(q);
  const held = [...machine.quests.values()].some((q) => String(q?.questName ?? '').toUpperCase() === RETIRED_TUTORIAL_STARTS);
  let started = false;
  // A start that throws costs the curse, never the load around it.
  if (!held && contentOn('curseOfDaggerfall')) { try { started = !!machine.startQuestByName(RETIRED_TUTORIAL_STARTS); } catch (e) { console.warn('[quest] the curse did not start in the retired tutorial\'s place', e); } }
  return { retired: live.length, started };
}

export function dropDoubledMainQuest(machine) {
  if (!machine?.quests) return 0;
  const scheduled = new Set(machine.questsToInvoke ?? []);
  const copies = new Map();
  for (const q of [...machine.quests.values(), ...scheduled]) {
    const n = String(q?.questName ?? '').toUpperCase();
    // S00005xx quests carry the main-quest prefix but belong to the guilds.
    if (q.questComplete || q.questTombstoned || !isMainQuestName(n) || /^S00005/.test(n)) continue;
    copies.set(n, [...(copies.get(n) ?? []), q]);
  }
  const set = (q) => [...q.tasks.values()].filter((t) => t.triggered).length;
  const reached = (q) => [...q.resources.values()].filter((r) => r.isPlace && r.siteDetails?.reached).length;
  const step = (q) => Math.max(-1, ...q.activeLogMessages.keys());
  const ahead = (a, b) => Number(scheduled.has(a)) - Number(scheduled.has(b)) || set(b) - set(a) || reached(b) - reached(a)
    || step(b) - step(a) || a.uid - b.uid;
  let dropped = 0;
  for (const [n, list] of copies) {
    if (list.length < 2) continue;
    for (const q of list.sort(ahead).slice(1)) {
      if (scheduled.has(q)) machine.questsToInvoke.splice(machine.questsToInvoke.indexOf(q), 1);
      else machine.removeQuest(q);
      dropped++;
    }
    // removeQuest records a main-story step as ended, but the kept copy still runs it.
    if (!scheduled.has(list[0])) machine.storyEnded?.delete(n);
  }
  if (dropped) console.warn(`[quest] ${dropped} doubled main-quest copies removed at load`);
  return dropped;
}

// Keep this list equal to the ctx members the bridge reads, in both directions.
export const QUEST_CTX_CONTRACT = Object.freeze([
  'addDialog', 'addFace', 'addGold', 'addHUDText', 'addProgressRumor',
  'addQuestRumor', 'addQuestTopics', 'addQuestorPostMessage',
  'carriesQuestItem', 'changeLegalRep', 'changeReputation', 'cityName',
  'classicSeconds', 'clearEnemies', 'cureDisease', 'data',
  'dateTimeString', 'deductGold', 'deductGoldPieces', 'dialogLink',
  'dropFace', 'endLycanthropy', 'endVampirism', 'forceTopicListsUpdate',
  'getGoldPieces', 'getGuild', 'getGuildFactionId',
  'getReputation', 'getTotalGold', 'giveItemToPlayer', 'hasQuestTopics',
  'isPlayerInTown', 'isPlayerInsideCastle', 'keepsQuestItem', 'makeEnemiesHostile',
  'makeHeldQuestItemsPermanent', 'makePcDiseased', 'midDateTimeString',
  'noteMinutes', 'notePlace',
  'offerReward', 'onQuestEnded', 'onQuestStarted', 'onQuestlineOffer', 'ownMinutes', 'partyHas', 'partySize', 'playSong',
  'playSound', 'playVideo', 'playerEntity', 'playerHasItem',
  'playerRaceName', 'questClockStepMax', 'questFoeInstances', 'questFoeKilled', 'questWhere',
  'questlineService',
  'raiseTime', 'raisedSeconds', 'regionPriceAdjustment', 'releaseQuestItem',
  'relinkQuestTopics', 'removeItemFromPlayer', 'removeNpcQuestor',
  'removeProgressRumors', 'removeQuestInfoTopics', 'removeQuestRumors',
  'removeQuestorPostMessage', 'setPlayerCrime', 'sharedClock', 'showChoice', 'showPopup',
  'showPrompt', 'showPromptMulti', 'skySeconds', 'spawnCityGuards',
  'undiscoverBuilding', 'waitOnline', 'world', 'worldSeconds',
]);

export const QUEST_CTX_REQUIRED = Object.freeze(['data']);

export const QUEST_CTX_OPTIONAL_BY_DESIGN = Object.freeze(['onQuestStarted', 'hasQuestTopics', 'onQuestlineOffer', 'questlineService']);

const refuseRaid = (q) => (WA_RAID_QUESTS.includes(q.questName) ? 'raid' : null);
export function shelfRefusalText(reason) {
  switch (reason) {
    case 'gone': return t('pause.journal.restartGone', 'That quest is over.');
    case 'shelved': return t('pause.journal.shelfShelved', 'That quest is already abandoned.');
    case 'running': return t('pause.journal.shelfRunning', 'That quest is not abandoned.');
    case 'ending': return t('pause.journal.restartEnding', 'That quest is ending.');
    case 'protected': return t('pause.journal.shelfProtected', 'That quest can’t be abandoned.');
    case 'raid': return t('pause.journal.restartRaid', 'You can’t do that during a raid.');
    case 'twin': return t('pause.journal.shelfTwin', 'You already have an active copy of that quest. Finish or abandon it first.');
    default: return t('pause.journal.restartRefused', 'You can’t do that right now.');
  }
}
export function questorBusyRows(quest) {
  const name = quest?.displayName || '';
  return [{ text: name ? t('quest.offer.questorBusy', 'You have not finished the work you were given here: {quest}.', { quest: name })
    : t('quest.offer.questorBusyUnnamed', 'You have not finished the work you were given here.'), center: true },
  { text: isEnhanced() ? t('quest.offer.questorBusyAbandon', 'If you cannot finish it, you can abandon it from the Quests tab of the pause menu.')
    : t('quest.offer.questorBusyAbandonClassic', 'If you cannot finish it, you can abandon it: in the pause menu, press Controls, then Escape, and choose it under Quests.'), center: true }];
}
export function restartRefusalText(reason) {
  switch (reason) {
    case 'gone': return t('pause.journal.restartGone', 'That quest is over.');
    case 'shelved': return t('pause.journal.restartShelved', 'That quest is abandoned. Reclaim it first.');
    case 'ending': return t('pause.journal.restartEnding', 'That quest is ending.');
    case 'protected': return t('pause.journal.restartProtected', 'That quest can’t be restarted.');
    case 'questor': return t('pause.journal.restartQuestor', 'Someone gave you that quest. Abandon it and ask them again.');
    case 'paid': return t('pause.journal.restartPaid', 'That quest already paid you, so it can’t be started again.');
    case 'child': return t('pause.journal.restartChild', 'Another quest depends on this one, so it can’t be restarted.');
    case 'started': return t('pause.journal.restartStarted', 'That quest has already started another quest, so restarting it would start that one twice.');   // AUDIT QA3 B1
    case 'raid': return t('pause.journal.restartRaid', 'You can’t do that during a raid.');
    case 'unparsed': return t('pause.journal.restartUnparsed', 'That quest can’t be restarted here.');
    case 'failed': return t('pause.journal.restartFailed', 'That quest couldn’t be restarted.');
    default: return t('pause.journal.restartRefused', 'You can’t do that right now.');
  }
}

export function reportUnwiredSeams(ctx, contract, label = 'host') {
  const absent = contract.filter((k) => ctx?.[k] == null && !QUEST_CTX_OPTIONAL_BY_DESIGN.includes(k));
  const missingRequired = QUEST_CTX_REQUIRED.filter((k) => ctx?.[k] == null);
  if (missingRequired.length) {
    console.error(`[quest] ${label} wired NO ${missingRequired.join(', ')} - the bridge cannot read quest source without it`);
  }
  if (absent.length) {
    console.warn(`[quest] ${label} wired ${contract.length - absent.length}/${contract.length} seams; `
      + `absent (these quest verbs will idle): ${absent.join(', ')}`);
  }
  return absent;
}

export function createQuestBridge(ctx, { label = 'host' } = {}) {
  reportUnwiredSeams(ctx, QUEST_CTX_CONTRACT, label);
  const notebook = new PlayerNotebook({
    dateTimeString: () => ctx.dateTimeString?.() ?? '',
    midDateTimeString: () => ctx.midDateTimeString?.() ?? '',
    cityName: () => ctx.cityName?.() ?? '',
    nowMinutes: () => ctx.noteMinutes?.(),
    place: () => ctx.notePlace?.() ?? null,
  });

  let questLists = null;
  // Declared before the machine, so a dep called before the layer exists reads null, not the temporal dead zone.
  /** @type {any} */ let questlines = null;
  const machine = new QuestMachine({
    world: ctx.world ?? null,
    nowSeconds: () => ctx.classicSeconds?.() ?? 0,
    skySeconds: () => ctx.skySeconds?.() ?? null,
    worldSeconds: () => ctx.worldSeconds?.() ?? null,
    raisedSeconds: () => ctx.raisedSeconds?.() ?? null,
    // The deps are listed key by key, so a new ctx member reaches the machine only when it is added here.
    ownMinutes: () => ctx.ownMinutes?.() ?? null,
    questClockStepMax: () => ctx.questClockStepMax?.() ?? Infinity,
    sharedClock: () => !!ctx.sharedClock?.(),
    getQuestSourceLines: (name, questlines) => ctx.data.getQuestSourceLines(name, questlines),
    playerLevel: () => ctx.playerEntity?.level ?? 0,
    questLevel: () => (ctx.playerEntity ? effectiveLevel(ctx.playerEntity) : null),
    playerGender: () => ctx.playerEntity?.gender ?? 'male',
    playerName: () => ctx.playerEntity?.name ?? null,
    playerRaceName: () => ctx.playerRaceName?.() ?? null,
    playerEntity: ctx.playerEntity ?? null,
    setPlayerCrime: (crime) => ctx.setPlayerCrime?.(crime),
    getGoldPieces: () => ctx.getGoldPieces?.() ?? 0,
    deductGoldPieces: (n) => ctx.deductGoldPieces?.(n),
    raiseTime: (seconds) => ctx.raiseTime?.(seconds),
    waitOnline: (seconds, quest) => ctx.waitOnline?.(seconds, quest),
    spawnCityGuards: (immediate) => ctx.spawnCityGuards?.(immediate),
    makeEnemiesHostile: () => ctx.makeEnemiesHostile?.(),
    clearEnemies: () => ctx.clearEnemies?.(),
    questFoeInstances: (symbol) => ctx.questFoeInstances?.(symbol) ?? [],
    getReputation: (fid) => ctx.getReputation?.(fid) ?? 0,
    getTotalGold: () => ctx.getTotalGold?.() ?? 0,
    deductGold: (n) => ctx.deductGold?.(n),
    addGold: (n) => ctx.addGold?.(n),
    addHUDText: (t) => ctx.addHUDText?.(t),
    showPopup: (q, tokens) => ctx.showPopup?.(q, tokens),
    questFoeKilled: (q, foe, n) => ctx.questFoeKilled?.(q, foe, n),
    showPrompt: (q, message, respond) => (ctx.showPrompt ? ctx.showPrompt(q, message, respond) ?? true : false),
    // PromptMulti's box: the click returns the record number, and the action routes by value.
    showPromptMulti: (q, message, buttons, respond) => (ctx.showPromptMulti ? ctx.showPromptMulti(q, message, buttons, respond) ?? true : false),
    showChoice: (q, message, choices, respond) => ctx.showChoice?.(q, message, choices, respond),
    playVideo: (name) => ctx.playVideo?.(name),
    playSound: (id) => ctx.playSound?.(id),
    playSong: (name) => ctx.playSong?.(name),
    giveItemToPlayer: (item, front) => ctx.giveItemToPlayer?.(item, front),
    removeItemFromPlayer: (item) => ctx.removeItemFromPlayer?.(item),
    playerHasItem: (item) => ctx.playerHasItem?.(item) ?? false,
    carriesQuestItem: (item) => ctx.carriesQuestItem?.(item) ?? false,
    keepsQuestItem: (item) => (ctx.keepsQuestItem ?? ctx.carriesQuestItem)?.(item) ?? false,
    releaseQuestItem: (uid, item) => ctx.releaseQuestItem?.(uid, item),
    makeHeldQuestItemsPermanent: (uid, sym) => ctx.makeHeldQuestItemsPermanent?.(uid, sym),
    offerReward: (q, item) => ctx.offerReward?.(q, item),
    questlinesStamp: (q) => questlines?.stamp(q) ?? null,
    questReward: (q, item, resource) => questlines?.reward(q, item, resource) ?? null,
    questEnding: (q) => questlines?.ending(q) ?? null,
    rewardProvincialQuest: (q) => rewardProvincialReputation(
      ctx.playerEntity, questorRegion(q), PROVINCIAL_QUEST_REP, (text) => ctx.addHUDText?.(text)),
    isPlayerInTown: () => ctx.isPlayerInTown?.() ?? false,
    partySize: () => ctx.partySize?.() ?? 1,
    partyHas: (acct) => ctx.partyHas?.(acct) ?? true,
    onOfferPending: (givePc) => noteOfferPending(givePc),
    getGuild: (fid) => ctx.getGuild?.(fid) ?? null,
    regionPriceAdjustment: () => ctx.regionPriceAdjustment?.() ?? 0,
    changeReputation: (fid, amount, propagate) => ctx.changeReputation?.(fid, amount, propagate),
    changeLegalRep: (amount) => ctx.changeLegalRep?.(amount),
    makePcDiseased: (t) => ctx.makePcDiseased?.(t),
    cureDisease: (t) => ctx.cureDisease?.(t),
    endVampirism: () => ctx.endVampirism?.(),
    endLycanthropy: () => ctx.endLycanthropy?.(),
    addQuestTopics: (q) => ctx.addQuestTopics?.(q),
    relinkQuestTopics: (q) => ctx.relinkQuestTopics?.(q),
    dialogLink: (...a) => ctx.dialogLink?.(...a),
    addDialog: (...a) => ctx.addDialog?.(...a),
    addQuestRumor: (uid, m) => ctx.addQuestRumor?.(uid, m),
    addProgressRumor: (uid, m) => ctx.addProgressRumor?.(uid, m),
    addQuestorPostMessage: (uid, m) => ctx.addQuestorPostMessage?.(uid, m),
    removeProgressRumors: (uid) => ctx.removeProgressRumors?.(uid),
    removeQuestorPostMessage: (uid) => ctx.removeQuestorPostMessage?.(uid),
    removeQuestRumors: (uid) => ctx.removeQuestRumors?.(uid),
    removeQuestInfoTopics: (uid) => ctx.removeQuestInfoTopics?.(uid),
    undiscoverBuilding: (buildingKey, buildingName) => ctx.undiscoverBuilding?.(buildingKey, buildingName),
    forceTopicListsUpdate: () => ctx.forceTopicListsUpdate?.(),
    addFace: (r) => ctx.addFace?.(r),
    dropFace: (r) => ctx.dropFace?.(r),
    addFinishedQuest: (messages) => {
      notebook.addFinishedQuest(messages);
      const line = questlines?.outcomeLine(messages?.[0]?.parentQuest, quietText);
      if (line) notebook.fileFinishedOutcome?.(line);
    },
    onQuestStarted: (q) => { questLists.noteQuestStarted(q); ctx.onQuestStarted?.(q); },
    onQuestEnded: (q) => { questlines?.runner?.dropped?.(q); festivalQuestEnded(q); ctx.onQuestEnded?.(q); },
  });
  // Registered here, so every host's machine has them before a save or script that names them is read.
  for (const template of questlineActionTemplates()) machine.registerAction(template);
  for (const template of vampireActionTemplates()) machine.registerAction(template);
  // This machine's hooks serve every macro walk that has no context of its own.
  setMacroWorld(() => machine.macroContext());
  setEscortQuestAway((uid) => isShelved(machine.getQuest(uid)));
  setEscortQuestGone((uid) => !machine.getQuest(uid));

  questLists = new QuestListsManager({
    readListTable: (name) => ctx.data.readListTable(name),
    getQuestSourceLines: (name) => ctx.data.getQuestSourceLines(name),
    parseQuest: (lines, factionId, partialParse) =>
      machine.parseQuestForLists(lines, factionId, { partialParse }),
    // A getter, because C# reads the setting at the point of use and the consumer reads `deps.playerNudity`.
    get playerNudity() { return getBool('ChildGuard', 'PlayerNudity'); },
  });

  const offerFlow = new QuestOfferFlow(machine, questLists, {
    isPlayerInsideCastle: () => ctx.isPlayerInsideCastle?.() ?? false,
    removeNpcQuestor: (seed) => ctx.removeNpcQuestor?.(seed),
    getGuildFactionId: (g) => ctx.getGuildFactionId?.(g) ?? 0,
    get guildQuestListBox() { return getBool('Enhancements', 'GuildQuestListBox'); },
    getLocalizedQuestDisplayName: (questName) => localizedQuestDisplayName(questName),
    sharedClock: () => !!ctx.sharedClock?.(),
  });

  const qlService = ctx.questlineService !== undefined ? ctx.questlineService : questlineService();
  questlines = createQuestlines({
    machine, questLists, service: qlService,
    ctx: {
      carriesQuestItem: (r) => ctx.carriesQuestItem?.(r) ?? false,
      get playerEntity() { return ctx.playerEntity ?? null; },
      changeReputation: (fid, amount, propagate) => ctx.changeReputation?.(fid, amount, propagate),
      changeLegalRep: (amount) => ctx.changeLegalRep?.(amount),
      get offerReward() { return typeof ctx.offerReward === 'function' ? (q, item) => ctx.offerReward(q, item) : undefined; },
      onQuestlineOffer: (offer) => {
        ctx.addHUDText?.(offerWaitingWords(offer));
        ctx.onQuestlineOffer?.(offer);
      },
      onOfferDropped: (offer) => ctx.addHUDText?.(t('ql.reward.dropped', 'Too many rewards wait: the one for {title} is gone.', { title: offer.title })),
      nowSeconds: () => ctx.classicSeconds?.() ?? 0,
      online: () => serviceReady(qlService),
      expand: (q, text, key) => quietText(q, text, key),
      onHonour: ({ title, key, keys, keyHeld }) => {
        if (title) { announceHonour('title', title); ctx.addHUDText?.(t('ql.line.honourTitle', 'You have earned the title {title}.', { title: TITLE_TEXT[title] ?? title })); }
        if (key) ctx.addHUDText?.(t('ql.line.honourKey', 'A Weir Key is yours: it waits with your keys.'));
        if (keyHeld && !key) ctx.addHUDText?.(t('ql.line.honourKeyHeld', 'The Covens\u2019 Hoard gives one Weir Key to an account, and yours was given already.'));
        if (key && Number.isSafeInteger(keys) && ctx.playerEntity?.items) restackWeirKeys(ctx.playerEntity.items, keys);
      },
    },
  });

  const lineOffers = createQuestlineOffers({
    machine, questlines, rowsOf: tokensToRows,
    ctx: {
      say: (text) => ctx.addHUDText?.(text), nowSeconds: () => ctx.classicSeconds?.() ?? 0,
      isPlayerInsideCastle: () => ctx.isPlayerInsideCastle?.() ?? false, removeNpcQuestor: (seed) => ctx.removeNpcQuestor?.(seed),
    },
  });
  setLineBoard(() => lineOffers.board());

  const ladderTitles = new Map();
  let ladderTitlesAt = -1;
  const questTitle = (name) => {
    if (ladderTitlesAt !== textRevision()) { ladderTitles.clear(); ladderTitlesAt = textRevision(); }
    if (!ladderTitles.has(name)) {
      const lines = ctx.data?.getQuestSourceLines?.(name) ?? [];
      const shipped = (lines.find((l) => /^\s*DisplayName:/i.test(l)) ?? '').replace(/^\s*DisplayName:\s*/i, '').trim();
      ladderTitles.set(name, localizedQuestDisplayName(name) || shipped || name);
    }
    return ladderTitles.get(name);
  };
  const factionWords = (fid) => {
    let name = '';
    try { name = String(factionsTable().getKeyForValue('p3', String(fid)) ?? '').replace(/_/g, ' '); } catch { }
    return getLocalizedFactionName(fid, name || String(fid));
  };
  function ladderRows() {
    return guildLadders({ memberships: activeMemberships(ctx.playerEntity ?? null), pools: questLists.guilds, history: questlines.history(), level: ctx.playerEntity?.level ?? 1, adult: getBool('ChildGuard', 'PlayerNudity') })
      .map((l) => ({ ...l, name: factionWords(l.factionId), rungs: l.rungs.map((r) => ({ ...r, quests: r.quests.map((q) => ({ ...q, title: questTitle(q.name) })) })) }));
  }

  setActSink((kind, n) => questlines.act(kind, n));

  // Ticks at TICKS_PER_SECOND of real time; the timer resets to zero on fire, dropping the excess, as in C#.
  let updateTimer = 0;
  function tick(dtSeconds) {
    updateTimer += dtSeconds;
    if (updateTimer < 1 / TICKS_PER_SECOND) return false;
    machine.tick();
    updateTimer = 0;
    questlines.look();
    news();
    return true;
  }

  // Each tick's lens look runs only while the herald or tracker listens; a throw costs the news, never the frame.
  let newsWarned = false, lookedLast = false, textHour = null;
  const warnNewsOnce = (err) => {
    if (newsWarned) return;
    newsWarned = true;
    console.warn(`[quest herald] the lens could not look (${err?.message ?? err}); the news is silent, the machine is not`);
  };
  function news() {
    const herald = heraldOn(), follow = followOn();
    // Let the tracked quest go once it is gone, so no save carries a uid a later quest could reuse.
    if (questTracker.pinned != null) {
      const q = machine.quests.get(Number(questTracker.pinned));
      if (!q || q.questComplete || isShelved(q)) questTracker.pinned = null;
    }
    if (!follow && (questTracker.views.length || questTracker.follow != null)) questTracker.forget();
    if (!herald && !follow) { lookedLast = false; return; }
    // A look after a gap is a baseline, not a diff against the look before it.
    if (!lookedLast) lens.reset();
    lookedLast = true;
    const hour = `${Math.floor((ctx.classicSeconds?.() ?? 0) / 3600)}|${Math.floor((ctx.skySeconds?.() ?? 0) / 3600)}`;
    if (textHour !== hour) { if (textHour != null) lens.rereadText(); textHour = hour; }
    try {
      const seen = lens.look(ctx.questWhere ?? {});
      if (follow) questTracker.hear(seen);
      if (herald) questHerald.hear(seen);
    } catch (err) { warnNewsOnce(err); }
  }

  const npcRaceLookups = () => ({
    getFaction: (id) => ctx.world?.getFactionData?.(id) ?? null,
    raceOfCurrentRegion: () => ctx.world?.currentRegionRace?.() ?? 0,
  });

  // A load resets the lens, so the loaded game's quests are its baseline.
  const lens = new QuestLens({ questLog: () => bridge.questLog({ windows: false }) });

  const bridge = {
    machine, questLists, offerFlow, notebook, lens, questlines, lineOffers,
    tick,

    questLog({ windows = true } = {}) {
      const active = [];
      const ended = [];
      const shelved = [];
      const unlogged = [];
      for (const q of machine.quests.values()) {
        if (q.questComplete) {
          notebook?.unhideQuest?.(q.uid);
          ended.push({ id: String(q.uid), name: q.displayName || null, questName: q.questName || '', success: !!q.questSuccess, ql: questlines.rowOf(q, quietText) });
          continue;
        }
        const les = q.getLogMessages();
        if (!les?.length) {
          const ql = questlines.rowOf(q, quietText);
          if (!ql?.objectives?.length && !holdsQuestorDoor(q)) continue;
          const row = { id: String(q.uid), name: q.displayName || null, questName: q.questName || '', ql };
          if (isShelved(q)) shelved.push({ ...row, clockSeconds: null, clocks: [], messages: [], steps: [] });
          else unlogged.push(row);
          continue;
        }
        const messages = [], steps = [];
        for (const le of les) {
          const message = q.getMessage(le.messageID);
          if (!message) continue;
          messages.push(message);
          steps.push({ stepID: le.stepID, messageID: le.messageID, time: le.time ?? null });
        }
        if (!messages.length) continue;
        let clockSeconds = null;
        const clocks = [];
        // Online a delay lands on the short wait, so the walk skips it; a deadline still counts down.
        for (const r of q.resources.values()) {
          if (r.waitsShort) continue;
          if (r.clockEnabled && !r.clockFinished && Number.isFinite(r.remainingTimeInSeconds) && clockCounts(q, r)) {
            const left = isShelved(q) ? r.remainingTimeInSeconds : r.liveRemainingSeconds(q);
            clockSeconds = clockSeconds == null ? left : Math.min(clockSeconds, left);
            clocks.push({ name: r.symbol?.name ?? '', seconds: left });
          }
        }
        if (windows) {
          const named = new Set();
          for (const m of messages) for (const c of clocksNamed(m)) named.add(c);
          const told = clocks.filter((c) => named.has(c.name)).map((c) => c.seconds);
          if (told.length) clockSeconds = Math.min(...told);
        }
        (isShelved(q) ? shelved : active).push({ id: String(q.uid), name: q.displayName || null, questName: q.questName || '', clockSeconds, clocks, messages, steps, ql: questlines.rowOf(q, quietText) });
      }
      // Hidden rows stay in `active` for the lens, the tracker, and the marks; the journal rail leaves them out.
      notebook?.pruneHiddenQuests?.([...machine.quests.values()].filter((q) => !q.questComplete).map((q) => q.uid));
      return { active, finished: notebook?.getFinishedQuests() ?? [], ended, hidden: notebook?.getHiddenQuests?.() ?? [], shelved, unlogged, lines: windows && questlinesOn() ? questlines.lineRows() : [], ladders: windows && questlinesOn() ? ladderRows() : [] };
    },

    journalClean: {
      removeFinished(i) {
        if (!notebook || !Number.isInteger(i) || i < 0 || i >= notebook.getFinishedQuests().length) return false;
        notebook.removeFinishedQuest(i);
        return true;
      },
      clearFinished() {
        const n = notebook?.getFinishedQuests().length ?? 0;
        notebook?.clearFinishedQuests();
        return n;
      },
      hide: (id) => notebook?.hideQuest(id) ?? false,
      unhide: (id) => notebook?.unhideQuest(id) ?? false,
      abandon(id) {
        const r = machine.shelveQuest(Number(id), { refuse: refuseRaid });
        if (r.ok && questTracker.pinned != null && Number(questTracker.pinned) === Number(id)) questTracker.pinned = null;
        // QUEST-AUDIT III SHELF-WORDS: in the player's language, and the door named that both journals can say it beside
        // (the chronicle has no Reclaim of its own)
        return { ...r, quest: undefined, text: r.ok ? `${t('pause.journal.abandonedSaid', 'Abandoned: {name}. You can reclaim it from the Quests tab.', { name: r.quest.displayName || r.quest.questName })}${r.quest.shelvedItems?.length ? ` ${t('pause.journal.shelfItemsFree', 'You can discard its items now. They return if you reclaim the quest.')}` : ''}` : shelfRefusalText(r.reason) };
      },
      reclaim(id) {
        const r = machine.reclaimQuest(Number(id));
        if (r.ok) notebook?.unhideQuest?.(id);
        return { ...r, quest: undefined, text: r.ok ? `${t('pause.journal.reclaimed', 'Reclaimed: {name}.', { name: r.quest.displayName || r.quest.questName })}${r.returned ? ` ${t('pause.journal.shelfItemsBack', '{n, plural, one {Its item is back in your pack.} other {Its items are back in your pack.}}', { n: r.returned })}` : ''}` : shelfRefusalText(r.reason) };
      },
      canAbandon: (id) => machine.shelveRefusal(Number(id), { refuse: refuseRaid }) === null,
      restart(id) {
        const r = machine.restartQuest(Number(id), { refuse: refuseRaid });
        if (r.ok && questTracker.pinned != null && Number(questTracker.pinned) === Number(id)) questTracker.pinned = String(r.quest.uid);
        return { ok: r.ok, reason: r.reason, uid: r.quest?.uid, text: r.ok ? t('pause.journal.restarted', 'Restarted: {name}. It starts over from the first step.', { name: r.quest.displayName || r.quest.questName }) : restartRefusalText(r.reason) };
      },
      canRestart: (id) => machine.restartRefusal(Number(id), { refuse: refuseRaid }) === null,
      storyAgain: () => machine.storyAgainQuests().map((n) => ({ questName: n, title: questTitle(n) || n })),
      startStoryAgain(questName) {
        const r = machine.startStoryAgain(questName);
        return { ok: r.ok, reason: r.reason, uid: r.quest?.uid, text: r.ok ? t('quest.story.againDone', '{name} begins again from its first step. The main story can go on.', { name: questTitle(r.quest.questName) || r.quest.displayName || r.quest.questName }) : restartRefusalText(r.reason) };
      },
      offers: () => questlines.offers().map((o) => ({ ...o, title: questTitle(o.questName) || o.title })),
      takeOffer: (id, index) => questlines.take(id, index),
      takeLine: (id) => lineOffers.takeUp(id),
    },

    layoutNpcData(fields) { return layoutNpcData({ ...fields, ...npcRaceLookups() }); },

    clickNpc(pn, sceneCtx) {
      const data = staticNpcData(pn, { ...sceneCtx, ...npcRaceLookups() });
      machine.setLastNPCClicked(data, pn ?? null);
      return data;
    },

    offerDaedricQuest(questName, summonerFactionId) {
      return offerFlow.offerNamedQuest(questName, summonerFactionId);
    },
    offerCovenQuest(factionId, reputation = 0) {
      return offerFlow.offerCovenQuest(factionId, reputation);
    },
    offerSocialQuest(npcData, socialGroup, menu = false, tavern = false) {
      return (tavern ? lineOffers.atTavern(npcData) : null) ?? offerFlow.offerSocialQuest(npcData, socialGroup, menu);
    },

    offerGuildQuest({ guildGroup, guild, membership, reputation, buildingFactionId = 0 }) {
      return lineOffers.atGuild(guildGroup) ?? offerFlow.offerGuildQuest({
        guildGroup,
        guild: offerGuildSurface({ guildGroup, guild, membership, reputation, playerEntity: ctx.playerEntity ?? null }),
        buildingFactionId,
      });
    },

    offerBoxes(step, rows) {
      if (!step) return [];
      switch (step.kind) {
        case 'close': return step.reason === ACTIVE_QUESTOR ? [{ rows: questorBusyRows(step.quest) }] : [];
        case 'fail': return [{ rows: rows?.(step.textId) ?? [] }];
        case 'offer': return [{
          rows: tokensToRows(step.prompt.tokens),
          buttons: 'YesNo',
          onYes: () => this.offerBoxes(step.respond(true), rows),
          onNo: () => this.offerBoxes(step.respond(false), rows),
        }];
        case 'accepted':
        case 'refused':
          return step.popup ? [{ rows: tokensToRows(step.popup.tokens) }] : [];
        case 'gettingQuests': return [{
          rows: step.textLines.map((line) => expandMacroValues(line, { pcf: firstName(ctx.playerEntity?.name ?? '') })),
          onClick: () => this.offerBoxes(step.onClose(), rows),
        }];
        case 'pickQuest': return [{
          picker: step.entries,
          onPick: (index) => this.offerBoxes(step.onPick(index), rows),
          onCancel: () => [],
        }];
        default: return [];
      }
    },

    mountScene(adapter, siteType, buildingKey = 0) {
      if (siteType === SITE_TYPES.Building) machine.noteSiteReached(adapter.currentMapId?.() ?? 0, buildingKey);
      addQuestResourceObjects(machine, adapter, siteType, buildingKey);
    },

    relayBuiltDungeon(location, mapId) {
      return relayBuiltDungeon(machine, location, { carriesQuestItem: (item) => ctx.carriesQuestItem?.(item) ?? false }, mapId);
    },

    repair() {
      const world = ctx.world ?? null;
      return repairActiveQuests(machine, {
        discoverLocation: (region, location) => world?.discoverLocation?.(region, location),
        hasQuestTopics: ctx.hasQuestTopics ? (q) => ctx.hasQuestTopics(q) : null,
        addQuestTopics: ctx.addQuestTopics ? (q) => ctx.addQuestTopics(q) : null,
        carriesQuestItem: (item) => ctx.carriesQuestItem?.(item) ?? false,
        mountCurrentSite: () => world?.mountCurrentSiteQuestResources?.(),
      });
    },

    initAtGameStart() {
      for (const name of GAME_START_QUESTS) if (!questHeld(machine, name)) machine.startQuestByName(name);
      questLists.initAtGameStartQuests((q) => machine.startQuestImmediate(q));
    },

    onExteriorTransition() { machine.notifyExteriorTransition(); },
    onInitWorld() { machine.notifyInitWorld(); },

    snapshot() {
      return {
        machine: machine.getSaveData(),
        notebook: notebook.getSaveData(),
        oneTimeQuestsAccepted: questLists.oneTimeQuestsAccepted ? [...questLists.oneTimeQuestsAccepted] : null,
        questlines: questlines.snapshot(),
      };
    },
    restore(data) {
      if (!data) return;
      machine.clearState();
      offerFlow.reset();
      lineOffers.reset();
      clearPendingOffer();
      machine.restoreSaveData(data.machine ?? { siteLinks: [], quests: [] });
      retireDisabledLineQuests(machine);
      // Re-lay dungeon markers before anything mounts.
      if (isOnlinePage()) relayOnlineDungeons(machine, { carriesQuestItem: (item) => ctx.carriesQuestItem?.(item) ?? false });
      relayMovedLayouts(machine, { carriesQuestItem: (item) => ctx.carriesQuestItem?.(item) ?? false });
      retireDfuTutorial(machine);
      dropDoubledMainQuest(machine);
      // The notebook restores only when the save carries one, as Daggerfall Unity does.
      if (data.notebook) notebook.restoreSaveData(data.notebook);
      machine.seedStory(notebook.getFinishedQuests().map((e) => e[0]?.render).filter((r) => r?.kind === 'quest'));
      machine.seedSpine(notebook.getFinishedQuests().map((e) => e[0]?.render));
      // Prune at load, before any new quest can take a uid a stale hidden id names.
      notebook?.pruneHiddenQuests?.([...machine.quests.values()].filter((q) => !q.questComplete).map((q) => q.uid));
      questLists.oneTimeQuestsAccepted = data.oneTimeQuestsAccepted ? [...data.oneTimeQuestsAccepted] : null;
      questlines.restore(data.questlines);
      lens.reset();
      questTracker.forget();
      questHerald.clear();
    },
  };
  return bridge;
}
