// Quests and talk in the world: the quest bridge's hooks for talk, rumors, boxes, rewards, sounds,
// videos, and songs, and the actions of Warm Ashes and Foraging. It also holds the raiding parties'
// hooks, quest enemies online, and the compass marks for quests and traders.
import {
  activeMemberships, guildFactionIdOfGroup, guildInitiationQuestEnded, guildOfFaction, membershipOf,
} from '../../guilds/guilds.js';
import { addEscortFace, dropEscortFace, escortQuestEnded } from '../../ui/hudEscortFaces.js';
import {
  addGold, deductGold, deductGoldPieces, goldAmount, setCrimeCommitted, totalGoldAmount,
} from '../../justice/court.js';
import { addItem, carriedWeight } from '../../items/inventory.js';
import {
  adoptsOrphanQuestFoe, partyQuestFoe, questBehaviourFor, questBoxHoldsFoes, questPrivateTag, questShareTag,
} from './questFoeHost.js';
import { advanceOwnMinutes, ownMinutes, raisedMinutes, sharedClockOn, skyMinutes } from '../../world/worldTick.js';
import { announceQuestFoeSlain, questFoeName } from '../../ui/levelNotice.js';
import { areEnemiesNearby } from '../../characters/encounters.js';
import { assignShipToPlayer, ownsShip, resetShip } from '../../trade/banking.js';
import { audio, QuestAudioSource } from '../../audio/audio.js';
import { buildingSummaries } from '../../world/buildingSummaries.js';
import { bunnyQuestEnded } from '../../guilds/bunnyServices.js';
import { canFindPlace, travelMapPickerData } from '../../ui/travelMapDoor.js';
import { changeReputation, ensureFactionRep, getReputation } from '../../guilds/factionRep.js';
import { characterIdOf } from '../../characters/characterId.js';
import { choiceDoor, createQuestBridge, tokensToRows } from './questBridge.js';
import { createRaidAshore } from '../naval/raidAshore.js';
import { cureLycanthropy, isTransformedLycanthrope } from '../../afflictions/lycanthropy.js';
import { cureVampirism } from '../../afflictions/vampirism.js';
import { dateFromClassicMinutes, dateTimeString, midDateTimeString } from '../../world/gameDate.js';
import { droppedLootHooks } from '../../items/droppedLoot.js';
import { endDisease, startDisease } from '../../afflictions/diseases.js';
import { entityMaxEncumbrance } from '../../combat/formulas.js';
import { FACTION_TYPES } from '../../formats/factionFile.js';
import { fieldOfView } from '../../ui/viewSettings.js';
import { findFactions } from '../../talk/talk.js';
import { getBytes } from '../../scenes/dataSource.js';
import { getLocalizedLocationName, getLocalizedRegionName } from '../../ui/textManager.js';
import { getNameBankOfRegion, fullName as nameHelperFullName } from '../../characters/nameHelper.js';
import { grantStaffSpoils } from '../../worldEvents/staffEventSpoils.js';
import { guildCardRoll, guildNameOfFaction } from '../../cards/cardSources.js';
import { heldQuestRecordIndex, keepsQuestItem, makeHeldQuestItemsPermanent } from '../../items/itemTransfer.js';
import { iliacCardName, mintIliacCard } from '../../cards/iliacItems.js';
import { inEther } from '../../world/ethericSea.js';
import { isArenaUndercroft } from '../../world/arenaCity.js';
import { isEquipped, unequipSlot } from '../../characters/equip.js';
import { LeaveShip, setWarmAshesHost, WA_RAID_QUESTS } from '../naval/warmAshesShips.js';
import { makeVideoQueue } from './videoQueue.js';
import { marksOn } from '../../ui/questMarks.js';
import { mountWindow } from '../../ui/notify.js';
import { music } from '../../audio/music.js';
import { PLAYED_STEP_MAX_SECONDS } from './clock.js';
import { playerEntity, surfacePlayer } from '../../characters/playerEntity.js';
import { playCry as playStaffCry } from '../../tools/staffCries.js';
import { politicClaimed } from '../../worldEvents/gateSite.js';
import { QUEST_INFO_RESOURCE_TYPE } from '../../talk/topicTree.js';
import { questActionsExtensionTemplates } from './questActionsExtension.js';
import { questTracker } from '../../ui/questTracker.js';
import { raceDisplayName } from '../../talk/talkSession.js';
import {
  RAID_SPAWN_MAX_DISTANCE, RAID_SPAWN_MIN_DISTANCE, outOfSight as raidOutOfSight, raidSpawnRange,
  setRaidingPartiesHost,
} from '../../worldEvents/raidingParties.js';
import { REGION_NAMES } from '../../formats/mapsFile.js';
import { regionPriceAdjustment } from '../../trade/shopStock.js';
import { resolveVariantGuild } from '../../guilds/guildVariants.js';
import { revenantHuntEntries } from '../../revenants/revenant.js';
import { RMB_SIDE } from '../../world/locationLayout.js';
import { ServiceFlowWindow } from '../../ui/guildServiceWindows.js';
import { setForagingHost } from '../../professions/foragingInstall.js';
import { spoilsLock } from '../../worldEvents/spoilsPool.js';
import { standLooseFoe } from '../../magic/hostEnchant.js';
import { TERRAIN_SIZE } from '../../world/terrainSampler.js';
import { townBuildingLocal, townTierOn } from './questGuidance.js';
import { vendorWaypoint } from '../../maps/vendorWaypoint.js';

/** @param {any} shared */
export function createQuestsWorld(shared) {
  const {
    _foeInTownRect, _isPlayerInTownStrict, _makeEnemiesHostile, _mode, _musicInLocationRect, _musicLocationType,
    _questRegionIndex, _spawnGuards, _townOfMapId, actKeyWord, built, cam, cityGuards, collider, dropFeet,
    droppedLoot, duelEnemyNear, enchantFeet, etherSea, exteriorFoePool, exteriorFoes, foragingWait, keptBox,
    locationIndex, lockOn, makeInventoryWindow, mapDict, maps, npcSession, player, playerTicker, playerTravelPixel,
    profBook, questPack, questPlacePixel, questWorld, renderer, revealMemberGuildHalls, rumorHere, rumorMill,
    shipPermanentScenes, shipTransportMode, state, topicTree, townTalk, undiscoverBuildingHere, waRaidQuest,
  } = shared;
  const _questStore = () => townTalk.factionDict ? ensureFactionRep(playerEntity, townTalk.factionDict) : null;

  const _questLoc = () => {
    const under = shared.modes?.mode === 'dungeon' ? shared.modes?.dungeonLocation : null;
    if (isArenaUndercroft(under)) return under;
    const px = playerTravelPixel();
    const key = `${px.x},${px.y}`;
    const loc = locationIndex.get(key) ?? null;
    const r = shared._ohGpsName;
    if (!loc || !r || r.key !== key) return loc;
    if (shared._ohGpsLoc?.of !== loc || shared._ohGpsLoc.name !== r.name || shared._ohGpsLoc.mapId !== r.mapId) {
      shared._ohGpsLoc = { of: loc, name: r.name, mapId: r.mapId, loc: { ...loc, name: r.name, mapTableData: { ...loc.mapTableData, mapId: r.mapId } } };
    }
    return shared._ohGpsLoc.loc;
  };

  const _regionFaction = () => {
    const dict = _questStore()?.dict ?? null;
    if (!dict) return null;
    return findFactions(dict, { type: FACTION_TYPES.Province, region: _questRegionIndex() })[0] ?? null;
  };
  let _questBoxWin = null;

  const giveReward = (dfItem) => {
    // undefined means this host mints the pile; null means the mode owned the ground and could not.
    let open = shared.modes?.mintRewardPile?.(dfItem);
    if (open === undefined) {
      open = () => {
        const pile = droppedLoot.dropPile([dfItem], dropFeet(), `${playerTravelPixel().x},${playerTravelPixel().y}`);
        if (!pile) return;
        const w = makeInventoryWindow({
          onClose: () => droppedLoot.releaseEmptied(),
          loot: droppedLootHooks(pile),
        });
        if (w) townTalk.showOverlay(w);
      };
    }
    if (open && _questBoxWin && !_questBoxWin.done && _liveQuestOverlay(_questBoxWin)) _onQuestBoxClosed = open;
    else open?.();
  };
  let _onQuestBoxClosed = null;
  const questChatLine = (text) => {
    const line = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!line) return;
    // A box raised during boot runs before the chat log exists, so the read stays in the try.
    try { if (shared.chatLog) shared.chatLog.push(shared.chatLog.active, { text: `Quest: ${line}`, system: true }); } catch {}
  };
  const showQuestBox = (box) => {
    if (foragingWait.holds()) { foragingWait.hold(() => showQuestBox(box), keptBox(box)); return; }
    if (_questBoxWin && !_questBoxWin.done && _liveQuestOverlay(_questBoxWin)) {
      _questBoxWin.push([box]);
      return;
    }
    const win = new ServiceFlowWindow([box], {
      graceMs: 600,
      onClose: () => {
        if (_questBoxWin === win) _questBoxWin = null;
        const fire = _onQuestBoxClosed; _onQuestBoxClosed = null; fire?.();
      },
    });
    _questBoxWin = win;
    mountWindow(win);
  };
  const _liveQuestOverlay = (win) =>
    (shared.modes?.questOverlay ?? null) === win || (townTalk?.overlay ?? null) === win;
  const _questBoxHoldsFoes = () => questBoxHoldsFoes(_questBoxWin, { online: shared.onlineOn, onTop: _liveQuestOverlay });

  const talkFullName = (gender) => nameHelperFullName(getNameBankOfRegion(_questRegionIndex()), gender);

  const cardQuestPaid = new Set();
  const cardQuestEnded = (q) => {
    if (!q?.questSuccess || !(q.factionId > 0)) return;
    const quest = String(q.uid ?? q.questName ?? '');
    // Key by character too: an offline load restores another character with the same quest uids.
    const key = `${playerEntity.characterId ?? ''}|${quest}`;
    if (!quest || cardQuestPaid.has(key)) return;
    cardQuestPaid.add(key);
    const dict = townTalk.factionDict ?? null;
    const name = guildNameOfFaction(q.factionId, dict);
    const rank = Object.values(activeMemberships(playerEntity)).find((m) => m?.guild === name)?.rank ?? 0;
    const id = guildCardRoll(q.factionId, rank, Math.random, dict);
    const card = id ? mintIliacCard(id) : null;
    if (!card) return;
    addItem(playerEntity.items, card);
    try { townTalk.say(`The guild adds a card to your reward: ${iliacCardName(card).replace(/^Card: /, '')}.`); } catch {}
  };
  const _heldItemIndex = (dfItem, clones = true) => heldQuestRecordIndex(playerEntity.items, dfItem, { clones });
  const _questVideos = makeVideoQueue(async (name) => {
    try {
      const { playVideo } = await import('../../ui/videoPlayer.js');
      const played = await playVideo(renderer.canvas, renderer, await getBytes(name), { endOnAnyKey: false });
      if (typeof window !== 'undefined') (window.__questVideos ??= []).push({ name, played });
    } catch (e) {
      console.warn(`[quest] ${name} unavailable - skipping the video:`, e?.message ?? e);
    }
  });
  const questAudioSource = new QuestAudioSource(audio);
  const raidAshore = createRaidAshore({ pools: () => {
    const inner = shared.modes?.interiorPool?.();
    return [{ foes: () => exteriorFoes.foes, remove: (f) => exteriorFoes.removeFoe(f) }, inner ? { foes: () => inner.foes, remove: (f) => inner.removeFoe(f) } : null];
  } });
  shared.questBridge = createQuestBridge({
    data: questPack,
    world: questWorld,
    questWhere: { canFindPlace: (regionName, name) => canFindPlace(maps, mapDict, regionName, name, questPlacePixel), currentLocationName: () => _questLoc()?.name ?? '' },
    addQuestTopics: (quest) => topicTree.addQuestTopicsForQuest(quest),
    hasQuestTopics: (quest) => topicTree.dictQuestInfo.has(quest.uid),
    relinkQuestTopics: (quest) => topicTree.relinkQuestResources(quest),
    dialogLink: (uid, name, type, name2, type2) => topicTree.dialogLinkForQuestInfoResource(uid, name, type, name2 ?? null, type2 ?? QUEST_INFO_RESOURCE_TYPE.NotSet),
    addDialog: (uid, name, type, instantRebuild) => topicTree.addDialogForQuestInfoResource(uid, name, type, instantRebuild),
    removeQuestInfoTopics: (uid) => topicTree.removeQuestInfoTopicsForSpecificQuest(uid),
    undiscoverBuilding: undiscoverBuildingHere,
    forceTopicListsUpdate: () => topicTree.forceTopicListsUpdate(),
    addFace: (r) => addEscortFace(r),
    dropFace: (r) => dropEscortFace(r),
    onQuestEnded: (q) => {
      const initiated = guildInitiationQuestEnded(activeMemberships(playerEntity), q?.questName ?? '',
        !!q?.questSuccess, dateFromClassicMinutes(playerTicker.ownMinutes), _questStore());
      if (initiated.length) revealMemberGuildHalls();
      escortQuestEnded(q);
      shared.renownQuestEnded?.(q);
      bunnyQuestEnded(q, playerEntity);
      cardQuestEnded(q);
      shared.naval?.raidEnded(q);
      raidAshore.questEnded(q);
    },
    addQuestRumor: (uid, m) => rumorMill.addQuestRumorToRumorMill(uid, m),
    addProgressRumor: (uid, m) => rumorMill.addOrReplaceQuestProgressRumor(uid, m),
    addQuestorPostMessage: (uid, m) => rumorMill.addQuestorPostQuestMessage(uid, m),
    removeProgressRumors: (uid) => rumorMill.removeQuestProgressRumorsFromRumorMill(uid),
    removeQuestorPostMessage: (uid) => rumorMill.removeQuestorPostQuestMessage(uid),
    removeQuestRumors: (uid) => rumorMill.removeQuestRumorsFromRumorMill(uid),
    classicSeconds: () => playerTicker.ownMinutes * 60,
    skySeconds: () => skyMinutes() * 60,
    worldSeconds: () => playerTicker.classicMinutes * 60,
    raisedSeconds: () => raisedMinutes() * 60,
    questClockStepMax: () => (sharedClockOn() ? PLAYED_STEP_MAX_SECONDS : Infinity),
    sharedClock: () => sharedClockOn(),
    playerEntity,
    removeNpcQuestor: (seed) => npcSession.removeNpcQuestor(seed),
    makePcDiseased: (diseaseType) => { startDisease(playerEntity, diseaseType, Math.floor(ownMinutes() / 1440)); surfacePlayer(); },
    cureDisease: (diseaseType) => {
      for (const a of playerEntity.activeEffects ?? []) {
        if (a.kind === 'disease' && a.disease === diseaseType && !a.ended) endDisease(a);
      }
      surfacePlayer();
    },
    endVampirism: () => {
      if (cureVampirism(playerEntity, { advanceMinutes: (m) => advanceOwnMinutes(m) })) surfacePlayer();
    },
    endLycanthropy: () => {
      if (cureLycanthropy(playerEntity, {
        nowMinutes: Math.floor(ownMinutes()),
        advanceMinutes: (m) => advanceOwnMinutes(m),
      })) surfacePlayer();
    },
    setPlayerCrime: (crime) => setCrimeCommitted(playerEntity, crime),
    getGoldPieces: () => goldAmount(playerEntity),
    deductGoldPieces: (n) => deductGoldPieces(playerEntity, n),
    raiseTime: (seconds) => advanceOwnMinutes(seconds / 60),
    waitOnline: (seconds, quest) => { foragingWait.add(seconds, quest?.displayName ?? null); },
    ownMinutes: () => ownMinutes(),
    spawnCityGuards: (immediate) => _spawnGuards(!!immediate),
    makeEnemiesHostile: _makeEnemiesHostile,
    clearEnemies: () => {
      for (const f of [...exteriorFoes.foes]) { if (!f.dead) exteriorFoes.removeFoe(f); }
      lockOn.unlock();
    },
    questFoeInstances: (symbol) => {
      const want = symbol?.name ?? null;
      if (want == null) return [];
      return [...exteriorFoes.foes, ...cityGuards.guards, ...(shared.modes?.liveQuestFoes?.() ?? [])].filter((f) =>
        !f.dead && f.questBehaviour && f.questBehaviour.targetSymbol?.name === want);
    },
    playerRaceName: () => (playerEntity.race ? raceDisplayName(playerEntity.race) : null),
    getReputation: (fid) => { const s = _questStore(); return s ? getReputation(s, fid) : 0; },
    changeReputation: (fid, amount, propagate) => { const s = _questStore(); if (s) changeReputation(s, fid, amount, propagate); },
    changeLegalRep: (amount) => questWorld.changeLegalRep(amount),
    getTotalGold: () => totalGoldAmount(playerEntity),
    deductGold: (n) => deductGold(playerEntity, n),
    addGold: (n) => addGold(playerEntity, n),
    addHUDText: (t) => townTalk.say(t),
    showPopup: (_q, tokens) => {
      const rows = tokensToRows(tokens);
      if (!rows.length) return;
      showQuestBox({ rows });
      questChatLine(rows.join(' '));
    },
    questFoeKilled: (q, foe) => {
      const who = questFoeName(foe);
      const quest = q?.displayName || null;
      const of = Math.max(1, foe?.spawnCount | 0), done = Math.max(0, foe?.killCount | 0);
      announceQuestFoeSlain({ who, quest, done, of, key: `${q?.uid}|${foe?.symbol?.name ?? who}` }, { say: (t) => townTalk.say(t) });
      questChatLine(`${who} slain${of > 1 ? ` (${Math.min(done, of)}/${of})` : ''}.`);
    },
    showPrompt: (q, message, respond) => showQuestBox({
      rows: tokensToRows(message.getTextTokens(-1, q.rolls)),
      buttons: 'YesNo',
      onYes: () => { respond(true); return []; },
      onNo: () => { respond(false); return []; },
    }),
    showPromptMulti: (q, message, buttons, respond) => showQuestBox({
      rows: tokensToRows(message.getTextTokens(-1, q.rolls)),
      buttonsMulti: buttons,
      onButton: (b) => { respond(b); return []; },
    }),
    showChoice: choiceDoor(showQuestBox),
    playVideo: (name) => { _questVideos(name); },
    playSound: (id) => questAudioSource.playQuestSound(id),
    playSong: (name) => music.playSong(name),
    giveItemToPlayer: (dfItem, front = false) => { playerEntity.items = playerEntity.items || []; addItem(playerEntity.items, dfItem, front ? 'front' : 'back'); surfacePlayer(); },
    removeItemFromPlayer: (dfItem) => {
      const items = playerEntity.items ?? [];
      const i = _heldItemIndex(dfItem);
      if (i < 0) return;
      if (isEquipped(items[i])) unequipSlot(playerEntity, items[i].equipSlot);
      items.splice(i, 1);
      surfacePlayer();
    },
    playerHasItem: (dfItem) => _heldItemIndex(dfItem, false) >= 0,
    carriesQuestItem: (res) => (playerEntity.items ?? []).some((it) =>
      it.questItem && it.questUID === res.parentQuest?.uid && it.questSymbol?.name === res.symbol?.name),
    keepsQuestItem: (res) => keepsQuestItem(playerEntity, res),
    releaseQuestItem: (uid, res) => {
      const items = playerEntity.items ?? [];
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (!(it.questItem && it.questUID === uid && it.questSymbol?.name === res.symbol?.name)) continue;
        if (isEquipped(it)) unequipSlot(playerEntity, it.equipSlot);
        items.splice(i, 1);
      }
      surfacePlayer();
    },
    makeHeldQuestItemsPermanent: (uid, sym) => makeHeldQuestItemsPermanent(playerEntity, uid, sym),
    offerReward: (q, dfItem) => {
      if (foragingWait.holds()) foragingWait.hold(() => giveReward(dfItem), { reward: dfItem });
      else giveReward(dfItem);
    },
    isPlayerInTown: () => _isPlayerInTownStrict(),
    partySize: () => shared.social?.party?.members?.length ?? 1,
    partyHas: (acct) => !!shared.social?.inMyParty(acct),
    getGuild: (fid) => {
      const dict = townTalk.factionDict ?? null;
      const g = guildOfFaction(fid, resolveVariantGuild(dict), dict);
      if (!g) return null;
      const m = membershipOf(activeMemberships(playerEntity), g);
      return { guildGroup: g.guildGroup, rank: m?.rank ?? 0, power: _questStore()?.dict.get(g.factionId)?.power ?? 0, isNonMember: !m };
    },
    regionPriceAdjustment: () => regionPriceAdjustment(playerEntity, _questLoc()?.regionIndex ?? 0),
    isPlayerInsideCastle: () => shared.modes?.insideDungeonCastle ?? false,
    getGuildFactionId: (g) => guildFactionIdOfGroup(g),
    dateTimeString: () => dateTimeString(dateFromClassicMinutes(skyMinutes())),
    midDateTimeString: () => midDateTimeString(dateFromClassicMinutes(skyMinutes())),
    cityName: () => { const loc = _questLoc(); return loc?.name != null ? getLocalizedLocationName(loc.mapTableData?.mapId, loc.name) : getLocalizedRegionName(_questRegionIndex(), () => questWorld.currentRegionName()); },
    noteMinutes: () => skyMinutes(),
    notePlace: () => { const loc = _questLoc(); return loc?.name != null ? { mapId: loc.mapTableData?.mapId ?? null, name: loc.name } : { region: _questRegionIndex(), name: questWorld.currentRegionName() }; },
  }, { label: 'world.js' });
  // Register before any save's quests restore; a restored Leave Ship resolves through the registry.
  shared.questBridge.machine.registerAction(new LeaveShip(null));
  for (const t of questActionsExtensionTemplates()) shared.questBridge.machine.registerAction(t);
  setForagingHost({
    world: () => {
      const m = _mode();
      const wm = skyMinutes();
      const px = playerTravelPixel();
      const exterior = m === 'exterior';
      return {
        inside: !exterior, insideDungeon: m === 'dungeon', insideCastle: false,
        locationType: _musicLocationType(), inLocationRect: !!_musicInLocationRect(),
        hour: Math.floor((((wm % 1440) + 1440) % 1440) / 60),
        climate: maps.getClimateIndex(px.x, px.y), region: _questRegionIndex(),
        enemiesNear: exterior ? (duelEnemyNear() || areEnemiesNearby(exteriorFoePool(), { resting: true })) : areEnemiesNearby(shared.modes?.insideFoes?.() ?? [], { resting: true }),
        carriedWeight: carriedWeight(playerEntity), maxEncumbrance: entityMaxEncumbrance(playerEntity),
        swimming: exterior && !!(player.isPlayerSwimming || player.swimming),
        exteriorWater: exterior ? (player.onExteriorWaterMethod ?? 'None') : 'None',
      };
    },
    monthValue: () => dateFromClassicMinutes(skyMinutes()).month,
    entity: () => playerEntity,
    startQuest: (name) => {
      const quest = shared.questBridge.questLists.getQuest(name, 0);
      if (quest) shared.questBridge.machine.startQuestImmediate(quest);
      return !!quest;
    },
    professionsOpen: () => profBook?.state.open === true,
    keyLabel: (a) => actKeyWord(a),
    professionUse: (t) => shared.gatherHost?.useTool(t) ?? false,
  });
  setWarmAshesHost({
    random: Math.random,
    ownsShip: () => ownsShip(playerEntity),
    assignShip: (shipType) => assignShipToPlayer(playerEntity, shipType, { addPermanentScene: shipPermanentScenes }),
    resetShip: () => resetShip(playerEntity),
    getQuest: (name, factionId) => waRaidQuest(name, factionId),
    startQuest: (quest) => shared.questBridge.machine.startQuestImmediate(quest),
    setTransportModeShip: () => shipTransportMode(),
    currentRegionIndex: () => _questRegionIndex(),
    leaveShipGate: (quest) => shared.naval?.leaveShipGate(quest) ?? 'proceed',
    raidAshore: (quest) => raidAshore.over(quest),
    raidRunning: () => [...shared.questBridge.machine.quests.values()].some((q) => WA_RAID_QUESTS.includes(q.questName) && !q.questComplete && !q.questTombstoned),
  });
  {
    const baseQuestLog = shared.questBridge.questLog.bind(shared.questBridge);
    shared.questBridge.questLog = (o) => {
      const log = baseQuestLog(o);
      const extra = [...(shared.bountyHost?.questLogEntries?.() ?? []), ...revenantHuntEntries(rumorHere()), ...(shared.legacyHost?.questLogEntries() ?? [])];
      return extra.length ? { ...log, active: [...(log?.active ?? []), ...extra] } : log;
    };
  }
  setRaidingPartiesHost({
    random: Math.random,
    maps: () => maps,
    picker: () => travelMapPickerData(),
    regionIndex: () => { const px = playerTravelPixel(); return !(etherSea && inEther(px.x, px.y)) && politicClaimed(maps.getPoliticIndex(px.x, px.y)) ? _questRegionIndex() : -1; },
    regionName: (r) => REGION_NAMES[r] ?? String(r),
    townHere: (outdoors) => ((shared.modes?.mode ?? 'exterior') !== 'exterior' ? null : outdoors || (_musicInLocationRect() ? _questLoc() : null)),
    playerPixel: () => playerTravelPixel(),
    standRaider: (mobileType, at) => standLooseFoe({
      collider, feet: at?.at ?? at?.near ?? enchantFeet(), yawRad: cam.yaw, fovDegrees: fieldOfView() * 180 / Math.PI, foes: exteriorFoePool(),
      spawn: (mt, pos, o) => exteriorFoes.spawnFoe(mt, pos, { yaw: o.yawRad, loose: true, transient: true }),
    }, mobileType, raidSpawnRange(at)),
    standDefender: (threats) => cityGuards.standDefender({
      playerFeet: [...enchantFeet()], playerFwd: [Math.sin(cam.yaw), 0, Math.cos(cam.yaw)], threats,
      minDistance: RAID_SPAWN_MIN_DISTANCE, maxDistance: RAID_SPAWN_MAX_DISTANCE,
    }),
    defenderCount: () => cityGuards.defenderCount(),
    defendersAllowed: () => !playerEntity.crimeCommitted && !isTransformedLycanthrope(playerEntity),
    removeFoe: (f) => exteriorFoes.removeFoe(f),
    outOfSight: (f) => raidOutOfSight(f.ai?.feet, cam.pos, cam.yaw, fieldOfView() * 180 / Math.PI, (shared.modes?.mode ?? 'exterior') === 'exterior'),
    reputation: () => ({ player: playerEntity, store: _questStore() }),
    selfId: () => shared.online?.id ?? null,
    wallNow: () => performance.now(),
    peersInTown: () => (shared.peersNear() ?? []).filter((p) => _foeInTownRect({ ai: { feet: p.feet } })).map((p) => p.id),
    eventFoot: (raid) => shared.eventPillar.footOf(raid),
    cry: (kind, raid) => { try { playStaffCry(audio, kind, shared.eventPillar.footOf(raid) ?? [...enchantFeet()]); } catch (e) { console.warn('[event] cry', e?.message ?? e); } },
    sites: () => shared.raidSites,
    peerFeetInTown: () => [[shared.online?.id ?? '', player.feetAt(), playerEntity.level ?? 1], ...(shared.peersNear() ?? []).filter((p) => _foeInTownRect({ ai: { feet: p.feet } })).map((p) => [p.id, p.feet, shared.online?.peers.get(p.id)?.lv ?? 0])],
    raidPuppets: () => exteriorFoes.foes.filter((f) => f.puppet && f._pupRaid),
    ownRaidFoes: () => exteriorFoes.foes.filter((f) => !f.puppet && f.raidKey && !f.dead),
    relayRaids: () => !!shared.online?.raidOk,
    sendRaid: (w, cell) => !!shared.online?.sendRaid(w, cell),
    onRaidReceipt: (r, c, held) => { (c?.v ? (grantStaffSpoils(shared.raidSpoils, spoilsLock, c, playerEntity?.level ?? 1), shared.claimStaffEventSilver(r, c)) : shared.raidClaims?.add(r, characterIdOf(playerEntity), typeof playerEntity?.name === 'string' ? playerEntity.name : null, playerEntity?.level ?? 1, held === true)); },
  });

  const questShareSeam = {
    tagOf: (f) => questShareTag(shared.questBridge?.machine, f, !!shared.social?.party) ?? questPrivateTag(shared.questBridge?.machine, f),
    accepts: () => true,
    partyPeer: (id) => !!shared.social?.isPartyPeer(id),
    peerMayHit: (peerId, f) => f.entity?.team !== 'PlayerAlly',
    onPuppetHurt: (tag, from) => { if (from == null || shared.social?.isPartyPeer(from)) partyQuestFoe(shared.questBridge?.machine, tag)?.setInjured?.(); },
    onPuppetDied: (tag, from, i) => {
      if (from != null && !shared.social?.isPartyPeer(from)) return;
      const foe = partyQuestFoe(shared.questBridge?.machine, tag);
      if (!foe) return;
      const owner = from != null ? (shared.social?.accountOfPeer?.(from) ?? null) : null;
      if (owner && Number.isInteger(i) && !shared.keptKills.credit(owner, tag.q, tag.s, i, Date.now())) return;
      foe.creditPartnerKill?.(owner);
    },
    onKeptDied: (tag, i) => { shared.keptKills.said(tag, i, Date.now()); },
    behaviourFor: (tag) => questBehaviourFor(shared.questBridge?.machine, tag),
    adoptsOrphan: (from, f) => !!shared.social?.party && adoptsOrphanQuestFoe({ myId: shared.online?.id ?? null, myFeet: player.feetAt(), foeFeet: f.ai?.feet, partyPeers: (shared.peersNear() ?? []).filter((p) => p.id !== from && shared.social.isPartyPeer(p.id)) }),
  };

  const questPixel = (find) => questPlacePixel(maps, find?.regionName ?? '', find?.locationName ?? '');
  const vendorCompassMark = () => {
    const wp = vendorWaypoint();
    if (!wp || (shared.modes?.mode ?? 'exterior') !== 'exterior') return null;
    const t = _townOfMapId.get(wp.map);
    const here = playerTravelPixel();
    if (!t || (here && here.x === t.px && here.y === t.py)) return null;
    const tr = state.pixelTranslation(t.px, t.py);
    return [tr[0] + TERRAIN_SIZE / 2, tr[2] + TERRAIN_SIZE / 2];
  };
  const questCompassMark = () => {
    if (!marksOn() || (shared.modes?.mode ?? 'exterior') !== 'exterior') return null;
    const find = questTracker.shown()?.target?.find;
    const p = find ? questPixel(find) : null;
    if (!p) return null;
    const t = state.pixelTranslation(p.x, p.y);
    return [t[0] + TERRAIN_SIZE / 2, t[2] + TERRAIN_SIZE / 2];
  };
  let _townQuestAt = { key: '', at: null };
  const townQuestCompassMark = () => {
    if (!townTierOn() || (shared.modes?.mode ?? 'exterior') !== 'exterior') return null;
    const bld = questTracker.tracked()?.target?.building;
    if (!bld) return null;
    const px = playerTravelPixel();
    const key = `${px.x},${px.y}`;
    const dfLoc = locationIndex.get(key), b = built.get(key);
    if (!dfLoc || !b?.locBlocks || !b.locOrigin || ((dfLoc.mapTableData?.mapId ?? -1) >>> 0) !== (Number(bld.mapId) >>> 0)) return null;
    const ck = `${key}|${bld.buildingKey}`;
    if (_townQuestAt.key !== ck) {
      const s = buildingSummaries(dfLoc.exterior?.buildings ?? [], b.locBlocks, { locationName: dfLoc.name, regionName: maps.getRegionName(dfLoc.regionIndex), locationIndex: dfLoc.locationIndex ?? 0 })
        .find((x) => x.buildingKey === bld.buildingKey);
      _townQuestAt = { key: ck, at: s ? townBuildingLocal(s, RMB_SIDE) : null };
    }
    if (!_townQuestAt.at) return null;
    const t = state.pixelTranslation(px.x, px.y);
    return [_townQuestAt.at[0] + t[0] + b.locOrigin[0], _townQuestAt.at[1] + t[2] + b.locOrigin[2]];
  };
  return {
    _questBoxHoldsFoes, _questLoc, _questStore, _regionFaction, giveReward, questCompassMark, questPixel,
    questShareSeam, raidAshore, showQuestBox, talkFullName, townQuestCompassMark, vendorCompassMark,
  };
}
