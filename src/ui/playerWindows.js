// Player windows in the world: the inventory, character sheet, spellbook, and journal, the quick
// slots and their hold, and body loot. It also holds the party quest share and its sync, the town
// watch frame, where the stores are reached, and a follower's rest cancel.
import { calculateCastCost } from '../magic/spellcost.js';
import { cancelRequestFor, memberPresent } from '../party/partyRestLaw.js';
import { canFindPlace } from './travelMapDoor.js';
import { charSheetDoorReady, createCharSheetWindow } from './charSheetDoor.js';
import { containerDropPos } from '../items/droppedLoot.js';
import { createChronicleWindow } from './chronicleDoor.js';
import { createInventoryWindow, inventoryDoorReady } from './inventoryDoor.js';
import { createSpellbookWindow } from './spellbookDoor.js';
import { createTownWatch, runTownWatchFrame } from '../justice/townWatch.js';
import { fetchBytes } from '../scenes/shared.js';
import { getPref } from './uiPrefs.js';
import { held } from './input.js';
import { isEnchanted } from '../items/inventory.js';
import { isInLocationRect, locationWorldRect } from '../world/streamingWorld.js';
import { isPlayerInTown } from '../world/nearbyObjects.js';
import { isTransformedLycanthrope } from '../afflictions/lycanthropy.js';
import { livingWorldOn } from '../systems/livingWorld/livingSwitch.js';
import { lootPile } from '../player/lootStack.js';
import {
  offHandOffersSwap, offHandQuickslot, spellQuickslotPress, swapQuickslot, tickQuickslotHold, useQuickslot,
} from '../items/quickslots.js';
import { peoplePage } from '../systems/livingWorld/people.js';
import { playerEntity } from '../characters/playerEntity.js';
import { preloadQuestJournalArt } from './questJournal.js';
import {
  prepareQuestShare, prepareShareData, SHARE_REFUSAL_TEXT, shareSentLine, shareSignature,
} from '../systems/quest/questShare.js';
import { quickLootTake } from '../items/quickLoot.js';
import { quickslotHand } from './quickslotTags.js';
import { raidDefendingHere } from '../worldEvents/raidingParties.js';
import { scryRows } from '../items/lootScry.js';
import { setMidScreenText } from './midScreenText.js';
import { showPickups } from './pickupFeed.js';
import { t } from './textManager.js';
import { useItem } from '../items/useItem.js';

/** @param {any} shared */
export function createPlayerWindows(shared) {
  const {
    _guardPool, _musicInLocationRect, _musicLocationType, cam, cityGuards, dropFeet, droppedLoot, exteriorFoes,
    gamePaused, getTexture, hccRuntimeOn, livingRegardDay, livingTownOfId, magic, mapDict, maps, packDoors, palette,
    player, playerTicker, playerTravelPixel, renderer, state, townTalk, uploadRecord, useHooks, walkMode, weaponRig,
  } = shared;
  const quickslotHooks = (rig = weaponRig) => ({
    ...useHooks,
    isEnchanted,
    nowMinute: () => Math.floor(playerTicker.ownMinutes ?? 0),
    rows: (id, pick) => townTalk.lines(id, pick),
    hand: () => quickslotHand(rig),
    ...packDoors,
  });
  const quickUse = (n, rig = weaponRig) => {
    useQuickslot(n === 1 ? 'c1' : 'c2', {
      entity: playerEntity, items: playerEntity.items ?? [], hooks: quickslotHooks(rig), say: (l) => townTalk.say(l),
    });
    return true;
  };
  const quickSwap = (rig = weaponRig) => {
    swapQuickslot({ entity: playerEntity, say: (l) => townTalk.say(l), rows: (id, pick) => townTalk.lines(id, pick), hand: rig.handDoor() });
    weaponRig.refreshWorn();
    return true;
  };
  const quickSpell = () => {
    spellQuickslotPress({ entity: playerEntity, magic, say: (l) => townTalk.say(l) });
    return true;
  };
  const quickOffHand = () => {
    if (offHandOffersSwap(playerEntity)) return quickSwap();
    offHandQuickslot({ entity: playerEntity, say: (l) => townTalk.say(l), switchHand: () => weaponRig.switchHand(), toggleLight: () => weaponRig.toggleLight() });
    return true;
  };
  const quickSwitchHand = () => { weaponRig.switchHand(); return true; };
  const tickQuickHold = (dt) => tickQuickslotHold(dt, {
    isHeld: (a) => held(shared.keys, a),
    blocked: gamePaused(),
    entity: playerEntity,
    onTap: (slot) => (slot === 'spell' ? quickSpell() : quickUse(slot === 'c1' ? 1 : 2)),
  });

  const useMagicItem = (item) => {
    const r = useItem(item, playerEntity.items ?? [], {
      ...useHooks,
      entity: playerEntity,
      localItems: playerEntity.items ?? [],
      spellCount: () => playerEntity.spells?.length ?? 0,
      isEnchanted,
      nowMinute: Math.floor(playerTicker.ownMinutes ?? 0),
    });
    if (r?.text) townTalk.say(r.text);
  };

  const makeInventoryWindow = (extra = {}) => createInventoryWindow({
    dropRefusal: () => shared.poiTest?.dropRefusal() ?? null, storeRefusal: () => shared.poiTest?.storeRefusal() ?? null,
    ...packDoors,
    postItem: (text, item) => shared.postItemInChat(text, item), linkItem: (item) => shared.linkItemInChat(item), canPostItem: () => shared.canPostItemInChat(),
    say: (l) => townTalk.say(l),
    items: () => (playerEntity.items ??= []),
    wagonItems: () => (playerEntity.wagonItems ??= []),
    bagItems: () => (playerEntity.bagItems ??= []),
    horseCart: hccRuntimeOn,
    entity: playerEntity,
    icons: { getTexture, uploadRecord, textures: renderer.textures },
    rows: (id, pick) => townTalk.lines(id, pick),
    usingRightHand: () => (shared.modes?.liveArm?.()?.rig ?? weaponRig).playerWeapon.usingRightHand, handArm: () => (shared.modes?.liveArm?.()?.rig ?? weaponRig).handArm?.(),
    openCharSheet: () => { if (charSheetDoorReady()) townTalk.showOverlay(makeCharSheetWindow()); },
    ...useHooks,
    nowMinute: () => Math.floor(playerTicker.ownMinutes),
    onDrop: (items, icon = null, at = null) => droppedLoot.dropPile(
      items, containerDropPos(at, dropFeet()), `${playerTravelPixel().x},${playerTravelPixel().y}`, icon),
    physicalDropOn: () => droppedLoot.physical.on(),
    physicalDrop: (items) => droppedLoot.dropPhysical(items, dropFeet(), [Math.sin(cam.yaw), 0, Math.cos(cam.yaw)], `${playerTravelPixel().x},${playerTravelPixel().y}`),
    ...extra,
  });
  const bodyPool = (lootKey) => (lootKey.startsWith('foeCorpse:') ? exteriorFoes : cityGuards);
  const openBodyLoot = (lootKey, pileKeys = null) => {
    bodyPool(lootKey).takeLoot(lootKey, (l) => townTalk.say(l),
      inventoryDoorReady() ? (loot) => {
        if (!pileKeys && quickLootTake(lootKey, loot, playerEntity, (l) => townTalk.say(l), { getQuest: (uid) => shared.questBridge?.machine.getQuest(uid) ?? null, took: showPickups })) return true;
        const pile = lootPile(lootKey, { keys: pileKeys, describe: (k) => bodyPool(k).pileBody(k), open: openBodyLoot });
        const w = makeInventoryWindow({ loot: pile ? { ...loot, pile } : loot });
        if (w) townTalk.showOverlay(w);
        // The corpse door rolls the body's silver on this result: true only when the window opened.
        return !!w;
      } : null);
  };

  const scryWhere = () => {
    const at = playerTravelPixel();
    const region = maps.getRegion(maps.getRegionIndexAt(at.x, at.y));
    return region ? { rows: scryRows(region), at: { x: at.x, y: at.y } } : null;
  };

  const makeSpellbookWindow = () => (shared._spellbook = createSpellbookWindow({
    entity: playerEntity,
    magic,
    castCost: (sp) => calculateCastCost(sp, playerEntity).sp,
    rows: (id, pick) => townTalk.lines(id, pick),
  }));
  const toggleSpellbook = () => {
    if (townTalk.overlayActive) return;
    const w = makeSpellbookWindow();
    if (!w) { townTalk.say('(the spellbook art is unavailable)'); return; }
    townTalk.showOverlay(w);
  };
  const makeCharSheetWindow = ({ inventory = null, pause = null } = {}) => createCharSheetWindow({
    entity: playerEntity,
    artDeps: { renderer, fetchBytes, palette },
    rows: (id, pick) => townTalk.lines(id, pick),
    inventory: inventory ?? (() => (inventoryDoorReady() ? makeInventoryWindow() : null)),
    spellbook: makeSpellbookWindow,
    pause: pause ?? (() => shared.pauseDoorHooks()),
    questMessages: () => shared.questBridge?.machine.getAllQuestLogMessages() ?? [],
    notebook: () => shared.questBridge?.notebook ?? null,
    currentLocationName: () => shared._questLoc()?.name ?? '',
    canFindPlace: (regionName, name) => canFindPlace(maps, mapDict, regionName, name),
    gotoPlace: (place) => shared.toggleTravelMap(place),
  });
  const partyMembersHere = () => shared.social?.others() ?? [];
  const _questSyncSeen = new Map();
  let _questSyncCheckAt = -Infinity;
  const QUEST_SYNC_CHECK_MS = 2000;
  const questSyncTick = () => {
    const machine = shared.questBridge?.machine;
    if (!machine) return;
    for (let data = machine.nextFinishedShare?.() ?? null; data; data = machine.nextFinishedShare()) {
      if (partyMembersHere().length) {
        const prepared = prepareShareData(data);
        // A final the send floor refuses stays queued for the next frame; settle it only once sent.
        if (prepared.ok && !shared.socialLink()?.shareQuest({ questName: prepared.questName, displayName: prepared.displayName, data: { ...prepared.data, sync: 1, final: 1 } })) break;
      }
      machine.settleFinishedShare(data);
      _questSyncSeen.delete(data.questName);
    }
    if (!machine.sharedQuestNames.size) return;
    const now = performance.now();
    if (now - _questSyncCheckAt < QUEST_SYNC_CHECK_MS) return;
    _questSyncCheckAt = now;
    if (!partyMembersHere().length) return;
    for (const questName of machine.sharedQuestNames) {
      const quest = machine.sharedCandidateNamed(questName);
      if (!quest) { _questSyncSeen.delete(questName); continue; }
      if (quest.ticksToEnd > 0) continue;
      const count = shareSignature(quest);
      const seen = _questSyncSeen.get(questName);
      if (seen === undefined) { _questSyncSeen.set(questName, count); continue; }
      if (count === seen) continue;
      const prepared = prepareQuestShare(machine, quest.uid);
      if (prepared.ok && shared.socialLink()?.shareQuest({ questName: prepared.questName, displayName: prepared.displayName, data: { ...prepared.data, sync: 1 } })) _questSyncSeen.set(questName, count);
    }
  };
  const shareQuestWithParty = (uid, questName, displayName) => {
    const prepared = prepareQuestShare(shared.questBridge?.machine, uid);
    if (!prepared.ok) { setMidScreenText(SHARE_REFUSAL_TEXT[prepared.reason] ?? t('quest.share.failed', 'Could not share that quest.')); return; }
    const link = shared.socialLink();
    const sent = link?.shareQuest({ questName: prepared.questName, displayName: prepared.displayName || displayName || questName, data: prepared.data });
    if (sent) {
      shared.questBridge?.machine.markQuestShared(prepared.questName);
      _questSyncSeen.set(prepared.questName, shareSignature(shared.questBridge.machine.getQuest(uid)));
    }
    setMidScreenText(shareSentLine(sent, prepared.displayName || displayName || questName));
  };
  const makeJournalWindow = (mode) => {
    preloadQuestJournalArt({ renderer, fetchBytes, palette });
    return createChronicleWindow({
      entity: playerEntity,
      questLog: () => shared.questBridge?.questLog() ?? { active: [], finished: [] },
      section: mode === 'messages' ? 'messages'
        : (mode === 'notebook' ? 'notes' : 'quests'),
      questMessages: () => shared.questBridge?.machine.getAllQuestLogMessages() ?? [],
      notebook: () => shared.questBridge?.notebook ?? null,
      shelfDoor: () => shared.questBridge?.journalClean ?? null,
      partyMembers: partyMembersHere,
      shareQuest: shareQuestWithParty,
      pageShare: () => shared.pageShareHere(),
      mode,
      currentLocationName: () => shared._questLoc()?.name ?? '',
      canFindPlace: (regionName, name) => canFindPlace(maps, mapDict, regionName, name),
      gotoPlace: (place) => shared.toggleTravelMap(place),
      showQuestPlace: (shared.modes?.mode ?? 'exterior') === 'exterior' ? (find) => shared.showQuestPlace(find) : undefined,
      people: livingWorldOn() ? () => peoplePage(shared.livingRelations, livingRegardDay(), livingTownOfId) : undefined,
    });
  };
  const _isPlayerInTownStrict = () => _musicInLocationRect()
    && isPlayerInTown(_musicLocationType(), {
      mustBeInLocationRect: true, mustBeOutside: true,
      inLocationRect: true, inside: (shared.modes?.mode ?? 'exterior') !== 'exterior',
    });
  const _storesReached = () => (shared.modes?.mode ?? 'exterior') !== 'dungeon' && _musicInLocationRect()
    && isPlayerInTown(_musicLocationType(), { mustBeInLocationRect: true, mustBeOutside: false, inLocationRect: true, inside: (shared.modes?.mode ?? 'exterior') !== 'exterior' });
  const townWatch = createTownWatch();
  const _foeInTownRect = (f) => {
    if (!shared._musicLoc || !f?.ai?.feet) return false;
    const px = playerTravelPixel();
    const wc = state.worldCoords(f.ai.feet);
    return isInLocationRect(wc.x, wc.z, locationWorldRect(shared._musicLoc, px.x, px.y));
  };
  function _townWatchFrame(dt) {
    const px = playerTravelPixel();
    const feet = walkMode && shared.playerSpawned ? player.pos : cam.pos;
    runTownWatchFrame(townWatch, dt, {
      enabled: (getPref('townWatch') !== false || raidDefendingHere()) && !isTransformedLycanthrope(playerEntity),
      inTown: _isPlayerInTownStrict(), crime: !!playerEntity.crimeCommitted, locationKey: `${px.x},${px.y}`,
      foes: exteriorFoes.foes, inTownRect: _foeInTownRect, guards: cityGuards,
      playerFeet: [...feet], playerFwd: [Math.sin(cam.yaw), 0, Math.cos(cam.yaw)], pool: _guardPool,
    });
  }

  const checkCanceledByFollower = () => {
    const me = shared.social?.acct;
    // With no hub id yet, a null would match every member's null restCancelFor.
    if (!me) return false;
    const asking = shared.social ? shared.social.others().filter((m) => m.p?.restCancelFor === me && memberPresent(m) && shared.nearAccount(m.acct, m.p)) : [];
    return !!cancelRequestFor(asking, me, shared._cancelSeen);
  };
  return {
    _foeInTownRect, _isPlayerInTownStrict, _questSyncSeen, _storesReached, _townWatchFrame, checkCanceledByFollower,
    makeCharSheetWindow, makeInventoryWindow, makeJournalWindow, makeSpellbookWindow, openBodyLoot, partyMembersHere,
    questSyncTick, quickOffHand, quickSpell, quickSwap, quickSwitchHand, quickUse, scryWhere, shareQuestWithParty,
    tickQuickHold, toggleSpellbook, useMagicItem,
  };
}
