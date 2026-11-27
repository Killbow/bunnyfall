// The world's online play: the social link, the act and hit sends, the room's enemies and renown,
// and the chat frames. It also holds trade, duels, weddings, and letters with their frames, the
// peers' menus, lights, auras, bodies, and names, and seats. The online session, the chat panel,
// onlineStart and chatStart, and the trade and duel managers stay in the world.
import {
  accountGuilds, accountRefusalText, accountRoll, accountVaultDoor, serviceBase, storedSession,
} from './accountClient.js';
import {
  actFrameFits, cellHaloFor, CHAT_LANGS, chatLangRoom, chatRegionRoom, GATE_BRAIN_V, isCellRoom, isWorldRoom,
  parkKeyOf, POSE_RIDE, POSE_STRIKES, poseHandsOf, relaySupportsCage, relaySupportsRite, seaVaultRoomId, SOCIAL_ROOM,
} from './wire.js';
import { activeMemberships } from '../guilds/guilds.js';
import { addGold, payUndoable, totalGoldAmount } from '../justice/court.js';
import { addItem, carriedWeight } from '../items/inventory.js';
import { allyCastable, allyCastPlaqueLine, allyReachFor, strangerCastable } from '../magic/allyCast.js';
import { announceRenownRise } from '../ui/levelNotice.js';
import { appStorage } from '../platform/appStorage.js';
import { arenaFloorRoomOf } from './arenaLaw.js';
import { audio } from '../audio/audio.js';
import {
  AURA_FORGET_S, AURA_KINDLE_S, auraBeastStep, auraCapeStep, auraLookOf, auraMotionStep, auraSpriteBones,
  auraSpritePosed, auraWearers, auraWingLights, CLOAK_BONES,
} from '../render/auraRing.js';
import { BAND_LIFE_MS, bandWordOf } from '../travel/travelBands.js';
import { BANK_REGION_COUNT, createBankAccounts, goldRegion } from '../trade/banking.js';
import { bindings } from '../ui/input.js';
import { bloodHit } from '../combat/bloodDecals.js';
import {
  BUILD_POLL_MS, buildUpdateSeen, buildUpdateText, liveBuildTag, relayRestartText, relayVersionSeen,
} from './updateNotice.js';
import { BUILD_TAG } from '../buildTag.js';
import { CAMP_CULL_DISTANCE, ENCOUNTER_CULL_DISTANCE } from '../characters/exteriorFoes.js';
import { CAPSULE_HEIGHT, climbPoseOf, RIDE_EYE_HEIGHT } from '../player/motor.js';
import {
  caravanKeyOf, caravanRoomOf, privateBoatRoom, privateInteriorOf, privateInteriorPrefix, privateInteriorRoom,
} from './privateInterior.js';
import { CARD_WAIT_MS } from './profileCard.js';
import {
  CHAN_OLD_RELAY_TEXT, CHAT_REJOIN_MS, EMOTE_OLD_RELAY_TEXT, GUILD_OLD_RELAY_TEXT, LANG_OLD_RELAY_TEXT,
  langJoinedText, nextRegionRoom, NO_GUILD_TEXT, NO_LANG_TEXT, notJoinedText, OPT_CHANNELS, optJoinedSayText,
  optJoinedText, optLeftText, optWaitText, partyNoteTab, regionJoinedText, ROLL_OLD_RELAY_TEXT, tradeChanOldText,
} from './chat.js';
import { channelOf, hubShardsSupported, isChannelShard } from './hubShards.js';
import { characterIdOf } from '../characters/characterId.js';
import { checkpointWhenDue } from '../saves/onlineCheckpoint.js';
import { chooseTable, tableMoveSpeed } from '../player/eotbBillboard.js';
import { combatVisualsOn, peerDraw } from '../combat/combatVisuals.js';
import { composeLook, peerWearsSkin } from './remotePlayers.js';
import { computeEntityMods } from '../characters/entityMods.js';
import { concealBits, hasActiveEffect, lookConcealBits } from '../magic/effects.js';
import { COURT_TEXT, courtArenaAt } from '../world/gateArena.js';
import { createAccountVaultBook } from './accountVaultBook.js';
import { createDuelPrompt } from '../ui/duelPrompt.js';
import { createEmoteWheel } from '../ui/emoteWheel.js';
import { createTouchFx } from '../scenes/touchFx.js';
import { emoteText } from './chatCommands.js';
import { createHeartbeat, whileLive } from './heartbeat.js';
import { createPageWindow, pageView } from '../ui/pageWindow.js';
import { createProfileWindow, profileView } from '../ui/profileWindow.js';
import {
  createRenownTracker, renownAnswer, renownFoeLevel, renownReportSoon, setRenownKillHandler,
} from './renownTracker.js';
import { createRollTracker, rollEntityDoors } from './npcRollTracker.js';
import { createSiegeHud } from '../ui/siegeHud.js';
import { createSocialMenu, plaqueRowFor, socialPlaqueRows } from '../ui/socialMenu.js';
import { createSocialPanel, LETTERS_SIGNED_OUT_TEXT, NO_PARTY_TEXT, TRY_AGAIN_TEXT } from '../ui/socialPanel.js';
import { creditKeptKills, isPrivateQuestFoe, KeptKillLedger } from '../systems/quest/questFoeHost.js';
import { cromwarkPeace } from '../world/wild/cromwark.js';
import { crowdKept, gateCrowdMax } from './gateCrowd.js';
import { deckPose as csaDeckPose, localOf as csaLocalOf } from '../systems/naval/comeSailAwayAboard.js';
import { DeathScreen } from '../ui/deathScreen.js';
import { dfuBlowWear, lowerCondition } from '../characters/equip.js';
import { drawEnhancedStatusLine } from '../ui/enhancedHudText.js';
import { drawText } from '../ui/text.js';
import { drinkWorn, setsDueling, setSetsDueling } from '../items/sigilSets.js';
import { DUEL_RADIUS_M, DUEL_RANGE_M } from './duelSession.js';
import { SIEGE_HIT as DUEL_REF_KIND } from './siegeRef.js';
import {
  duelAttackerOf, duelStandIn, duelSwingOf, duelWeaponOf, duelWearDamage, resolveDuelStrike,
} from '../combat/duelCombat.js';
import { effectVfxBits } from '../magic/effectVisuals.js';
import { egRoomKey } from './eliteGates/egLaw.js';
import { ENEMY_HIT_VOLUME, hitSoundFor, PLAYER_HIT_VOLUME, SOUND } from '../audio/soundClips.js';
import { enhancedHudScale } from '../ui/enhancedHud.js';
import { entityMaxEncumbrance, reportPlayerAttack } from '../combat/formulas.js';
import { flashPlayerDamage } from '../ui/damageFlash.js';
import { FOES_FULL_MS, FOES_MS, FOES_STALE_MS, roomKeyFor } from './online.js';
import { gateRoomKey, isGateRoom } from './gateLaw.js';
import { getPref, setPref } from '../ui/uiPrefs.js';
import { glyphMarks } from '../ui/playerBadge.js';
import { GuildBook } from './guildBook.js';
import { guildRosterSource, localRosterSource, partyRosterSource, placedRosterSource } from './roster.js';
import { hasDaggerfallArrows } from '../combat/fpArm.js';
import { HIT_FLASH_S, hitFlashStrength, setBatchHitFlash } from '../combat/hitFlash.js';
import { horseRigFor } from '../world/horseRig.js';
import { houseLine } from './houseLaw.js';
import { hudScale } from '../ui/hud.js';
import { inTradeRange, TRADE_RANGE_M, tradeDistance } from './tradeSession.js';
import { isEnhanced } from '../ui/uiSkin.js';
import { isRiding, TRANSPORT_MODES } from '../travel/transport.js';
import { isTouchDevice } from '../ui/touchDevice.js';
import { itemLongName } from '../items/itemInfo.js';
import { keepsQuestItem } from '../items/itemTransfer.js';
import {
  keptLetterTokens, keptPageTokens, letterOfPage, PAGE_GONE_TEXT, PAGE_NO_READERS_TEXT, PAGE_UNSUPPORTED_TEXT,
  pageShownText, pageTooFarText,
} from './journalPage.js';
import { legacyOn } from '../systems/legacy/settings.js';
import { liveLycanthropy } from '../afflictions/lycanthropy.js';
import { madeRuleHere } from '../characters/madeLevel.js';
import { MailBox, mailNoticeText } from './mail.js';
import { markFoeStruck } from '../ui/hudFoeTarget.js';
import { materialCountLabel } from '../professions/profItems.js';
import { mergePartyAutomap } from '../maps/automap.js';
import { modSetting } from '../mods/modSettings.js';
import { auraVisualIntensity } from '../magic/spellVisualSettings.js';
import { mwViewBodyBones, mwViewSpriteFacing, mwViewSpriteFigure, mwViewThirdPerson } from '../player/mwView.js';
import { noteFirstUse } from '../ui/tutorials.js';
import { openPeers, peerIdOfKey, peerRelationText, pickPeerInFront, SOCIAL_REACH } from '../player/socialPick.js';
import { ownAura, ownNameAsAt } from '../characters/ownGlyphs.js';
import { packTradeRefusal } from '../trade/tradePack.js';
import { peerBodyYaw } from './peerClimb.js';
import { peerIsWolf } from './peerBodies.js';
import { peerRangeOf } from './peerRange.js';
import { peerTorchLight, torchPoseByte, waistLanternPoseBit } from '../player/playerTorch.js';
import { performingTag } from '../trade/tavernSocial.js';
import { plaqueActionSelection, plaqueLightFirst } from '../items/quickLoot.js';
import { PLAY_HERE_LABEL, SEAT_MID_TEXT, SEAT_NOTICE } from './oneSeat.js';
import { playerEntity } from '../characters/playerEntity.js';
import { playerMeleeCanHit } from '../combat/playerWeapon.js';
import { playerPainVoice, playPlayerVoice } from '../combat/hostCombat.js';
import { playerTradeReady } from '../ui/playerTradeDoor.js';
import { poseFx } from './peerFx.js';
import { PostBox, postNoticeText } from './serverPost.js';
import { projectToScreen } from '../player/tapRay.js';
import {
  questBusyAgain, receiveSharedQuest, sayShareRefusal, shareReceivedLine, shareRefusedLine, shareSomeone,
  syncBaselineAfter,
} from '../systems/quest/questShare.js';
import { quickslotTag } from '../ui/quickslotTags.js';
import { RAIDER_LIFE_MS, raiderWordOf } from '../systems/naval/seaRaiders.js';
import { raidObjWord, raidTownsFor, raidWireWord } from '../worldEvents/raidingParties.js';
import { rayPersonDistance } from '../talk/townTalk.js';
import { realmDoorShut, realmGoldAct } from '../saves/realmSaves.js';
import { realmLetterOfCredit } from './realmGoldLaw.js';
import { RECEIVER_MARKS } from './realmTradeLaw.js';
import { regionChaseWords } from '../travel/regionChase.js';
import { renownKillXp, renownPartyXp, renownQuestXp, renownText } from './renown.js';
import { RESURRECT_HOLD_MS, rezFor, rezSnapshot } from '../magic/resurrect.js';
import { riddenHorseLook } from '../travel/horseCoats.js';
import { RIDE_ASK_TTL_MS, RIDE_TEXT } from '../travel/wagonSeats.js';
import { rollNoticeDoors } from '../guilds/rollNoticeHost.js';
import { sdRoomKey } from './sdLaw.js';
import { seatLinesOf, seatRankAt } from './npcChapterLaw.js';
import { sellProceeds } from '../trade/tradeModes.js';
import { sendRaiseWord } from './raiseWord.js';
import { setFirmamentOnline } from '../characters/firmamentLive.js';
import { setHudRenown } from '../ui/hudRenown.js';
import { setItemFields } from '../items/itemTemplates.js';
import { setMidScreenText } from '../ui/midScreenText.js';
import { setRenownLayer } from '../characters/renownLayer.js';
import { setSigilOnline, setSigilRenown } from '../items/sigil.js';
import { shownSpellName } from '../items/loot.js';
import { SIEGE_DISMOUNT_TEXT, siegeCastClamp, siegeSpellNumbers } from '../combat/siegeCombat.js';
import { SocialState } from './social.js';
import { standsRail } from '../world/arenaFloor.js';
import { starsFor } from './firmament/firmamentLaw.js';
import { startPlayClock } from './playClock.js';
import { travellerDue, travellerMarkOf } from '../travel/travellerMarks.js';
import { tvOwnGrow } from '../player/travelCamera.js';
import { validStaffDestination } from './staffTeleport.js';
import { wedMineText, wedWhyText } from './wedSession.js';
import { wildHere, wildZoneKind } from '../world/wildZone.js';
import { withoutFirmament } from '../characters/firmamentPowers.js';
import { worldCoordToMapPixel } from '../world/streamingWorld.js';
import { worldPlaqueOn } from '../ui/worldPlaque.js';
import { timeScale as worldTimeScale } from '../world/timeScale.js';
import { worldViewportRect } from '../ui/hudLarge.js';
import { YesNoBoxWindow } from '../ui/yesNoBox.js';

/** @param {any} shared */
export function createOnlineWorld(shared) {
  const {
    _actPend, _actTooBig, _bandChase, _bandSpentAt, _castSeen, _duelRings, _entryHold, _foesQuiet, _hiddenPeers,
    _hits, _mode, _partyBodies, _peerMapPoses, _questLoc, _questRefusalSaid, _questRegionIndex, _questSharer,
    _questSyncSeen, _storesReached, _veils, arenaBouts, arrows, bandNowMs, bandWord, battleFoeBodies, battleNowMs,
    cam, camps, campToScene, campToWire, canvas, caravanDecorTick, caravanDoorLanding, channelLinkRoom, chatSafety,
    collider, crowdDrawnHere, csaAboard, csaAboardWord, csaBoatUnderMe, csaBoatYaw, csaOn, csaPeers, csaPoseAhead,
    csaRuntime, csaWord, doorToken, dungeonHoldFrame, ejectFromCourt, enchantFeet, exteriorFoes, firmBook,
    FRAME_LIVE_MS, gamePaused, gateCrowd, glassCuts, hcc, hccOn, hccParkTick, hitEffects, hourRezOpen,
    hubShardsSeenKey, inSiegeRoom, isPartyMate, legacyUnionsRead, magic, makePartyPanel, maps, marksBook, navalWord,
    nodeMarksAt, noticeBook, noticeCountPoints, ONLINE_MOVE_HOLD_MS, onlineCheckpoint, onlineHomes, onlineOn,
    overworldLedgerFrame, pageOffers, peerInSight, peerRange, player, playerFestivals, playerTravelPixel, portalWord,
    profBook, raidNowMs, realmLost, realmSession, renderer, renownAccount, rescueLink, resurrectInPlace, saveSoon,
    sdArenaHeld, sdConcordHere, sdFrame, seaRaidHeld, seaRaidWord, searchPartyFrame, seatClock, seatEdicts,
    setTransportModeHere, siegeHealOut, siegeMeleeHit, siegeSpellOut, siegeStrikeOut, spectatorFrame, state,
    surfaceClose, surfaceOpen, tavernSocial, townTalk, travelControlUI, travellerBook, travellerSent, tvRaid, veilOf,
    walkMode, weaponRig, worldMoveBusy, worldPublish, writBook,
  } = shared;
  /** COATS3D: a peer on a HORSE rides the 3D horse in their Morrowind body (net/peer/peerBodies.js) where this lane builds
   *  one, its rig is up and their body is not refused - the rider layer yields them (a beast stays the layer's). */
  const peerRidesIn3d = (d) => !!shared.peerBodies?.enabled() && horseRigFor(renderer).ready() && d.shown?.rd === POSE_RIDE.Horse && !d.shown?.wb && !shared.peerBodies.failureOf(d.look, d.shown, d.glyphs);

  let _hsLatch = false;   // AUDIT DISC7 B2: the motor's half-speed flag off the last frame that MOVED - a stop reads it true (standing), and the move hold must not send that as a slow trot

  const seatOut = () => shared._seatOut || !!shared.online?.superseded || !!shared.chatLinks?.get('world')?.superseded;

  const socialLink = () => { const tab = shared.chatLog?.tabs.find((t) => t.room === SOCIAL_ROOM); return tab ? (shared.chatLinks?.get(tab.id) ?? null) : null; };

  /** RAID-ROLL: the hub asked for the towns table by its operator's pinned hash - this world's, when it hashes to it
   *  (net/raid/raidLaw.js; a data-modded world's is its own and is never sent). The travel map's picker may still be loading
   *  at the hello, so a table not ready is asked for again a few times, ten seconds apart; once a session. */
  let _raidTownsSent = false;
  const offerRaidTowns = (link, h, tries = 3) => {
    if (_raidTownsSent) return;
    void raidTownsFor(h).then((text) => {
      if (text) { if (link.sendRaidTowns(h, text)) _raidTownsSent = true; return; }
      if (tries > 1) setTimeout(() => offerRaidTowns(link, h, tries - 1), 10_000);
    }).catch((e) => console.warn('[raid] towns table', e?.message ?? e));
  };
  /** GUILD1c: a room took my guild off (a removal the hub heard, a disbanding, my own leave's echo) - the book looks
   *  again, and a membership that moved goes to every room I hold (net/guild/guildBook.js onOrders). */
  const guildGone = () => { shared.guildBook?.refresh(); };
  /** GUILD1c: my guild's tag as the hub knows it - the Guild tab's word on whether I am in one. */
  const myGuildTag = () => socialLink()?.gt ?? null;

  /** GUILD1c: the Guild tab on a relay from before the guild's channel - the World link's welcome said so. */
  const guildOld = () => { const world = shared.chatLinks?.get('world'); return world?.status === 'open' && !world.guildOk; };
  /** SOC3 (Mac: "invite friends or other individuals"): what a click on a chat ROSTER ROW offers for that peer. The
   *  roster is the one place a stranger has a name, so it is the one place "other individuals" can be acted on -
   *  and every answer here is net/social.js's (actionsFor), including the reason a refused one carries. An act by
   *  PEER id, because a stranger has no account I can name. AUDIT SOC C15: REMOVE IS NOT HERE - it was the one
   *  destructive act on a one-click row, while the panel's own Remove arms on one click and fires on the second
   *  (ui/socialPanel.js); a friend is removed from the list that shows them, behind that confirm. */
  const socialRowActions = (peerId) => {
    if (!shared.social || !peerId) return [];
    const a = shared.social.actionsFor(peerId);
    return [
      { label: 'Add friend', enabled: a.canFriend, why: a.whyNotFriend, run: () => socialLink()?.sendSocial({ k: 'friend.request', peer: peerId }) ?? false },
      { label: 'Invite to party', enabled: a.canInvite, why: a.whyNotInvite, run: () => socialLink()?.sendSocial({ k: 'party.invite', peer: peerId }) ?? false },
    ];
  };

  let peerAct = null;   // ACT-MENU: the chosen act's door (set with the menu, over the same link and chat tab)
  let peerNote = null;   // AUDIT DISC7 A4: and a refused row's reason, on the same tab

  let _duelRingSaid = null;   // DUEL1: the id of the ring my foes frame last said I stand in (null: none)

  const DUEL_RING_STALE_MS = 6000;

  const foesStream = (now) => {
    if (!shared.online || shared.online.status !== 'open') return false;
    // WORLD6b: in a CELL everyone streams their own foes; in a world room the host alone
    const cell = isCellRoom(shared.online.room);
    if (!cell && (!shared.online.isHost() || !isWorldRoom(shared.online.room))) return false;
    // SCALE2b (Scale-Arc "Rooms that never sleep"): NOBODY TO HEAR, NOTHING SAID. A full frame went every FOES_FULL_MS
    // to a room with nobody else in it, and the relay fanned it to no one - but the frame woke the object, so a room
    // with one player never slept. Alone, the stream is quiet and its next frame is owed FULL, so the first one after
    // a joiner's arrival (their join makes them a member here, FOES_MS before the next tick) carries every foe - well
    // inside their FOES_STALE_MS of patience. Nothing is spent: an unbuilt frame commits no delta.
    if (shared.online.othersHere === 0) { shared._foesFullAt = -Infinity; return false; }
    if (now - shared._foesSentAt < FOES_MS) return false;
    shared._foesSentAt = now;   // AUDIT WORLD2 B11: the clock re-arms whether or not anything changed - a quiet room asked every frame
    const full = now - shared._foesFullAt >= FOES_FULL_MS;
    const csaMoved = cell && csaWord(null, full);   // AUDIT PRE-MERGE 0928 O2: my boats' moved word asks for a frame, as the team's does - a quiet sea built none, and a sailing boat rode the full frames alone
    const csaAboardMoved = cell && csaAboardWord(null, full);   // CSA-K: and my place aboard another's boat, as it moves on their deck
    const bandMoved = cell && bandWord(null, full);   // TV7b: a chase moves every frame, and asks for one
    const navalMoved = cell && navalWord(null, full);   // NAV-G: a volley is news at once - the sea's changed word asks for a frame
    const seaRaidMoved = cell && seaRaidWord(null, full);   // OW6: and a raider's at sea
    const frame = cell ? ((shared.modes?.mode ?? 'exterior') === 'exterior' ? exteriorFoes.foesFrame(full, shared._hccDirty || csaMoved || csaAboardMoved || bandMoved || navalMoved || seaRaidMoved) : null) : shared.modes?.dungeonFoesFrame?.(full);
    if (!frame) return false;
    if (cell && full) frame.c = camps.wireRecords(campToWire); if (cell && (full || shared._hccDirty)) { frame.hv = hcc.wireRecord(campToWire); shared._hccDirty = false; } if (cell) duelRingWord(frame, full); if (cell) csaWord(frame, full); if (cell) csaAboardWord(frame, full); if (cell) bandWord(frame, full); if (cell) navalWord(frame, full); if (cell) seaRaidWord(frame, full); if (cell) { const rk = raidWireWord(), ro = raidObjWord(); if (rk) frame.rk = rk; if (ro) frame.ro = ro; } if (cell) portalWord(frame, full); if (cell && frame.hv !== undefined) frame.wr = shared.wagonRiders?.word() ?? null;   // HCC-ONLINE: my horse and wagon as shown (null: none stand) ride beside the camps - on every full frame, and on a moved word between them   // AUDIT SURV B: an empty list says "none stand" - the last camp packed reaches the peers   // SURV3: my camps ride my full frame - a shared world object in the cell's own way; RAID2: my word on the raids I run or fought - my share of their deaths, and my claim; PORTAL1: my portal, on every full frame while it stands and I stand near it; WAGONS1: my ask for a seat in another's wagon, or the seat I sit in - beside my team's word, on its clock (sent whenever `hv` is)
    // SCALE2c: A FULL FRAME THAT SAYS NOTHING IS SAID ONCE (net/foesQuiet.js) - in a cell, after one that said the same
    const said = { full, cell, room: shared.online.room };
    if (_foesQuiet.skip(frame, said)) { shared._foesFullAt = now; return false; }
    if (!shared.online.sendFoes(frame)) { shared._foesFullAt = -Infinity; _foesQuiet.sent(frame, said, false); return false; }   // AUDIT WORLD2 A9: a refused frame's deltas were already committed - the next frame carries every foe
    if (full) shared._foesFullAt = now;
    _foesQuiet.sent(frame, said);
    return true;
  };
  /** QUEST-PARTY phase 3b/3c (Mac: "Dungeons and buildings"): MY OWN FOES IN A WORLD ROOM, on the room's own lane (OWN1)
   *  - a building's, and a dungeon's shared quest's - every FOES_MS (every one FOES_FULL_MS apart), beside the host's
   *  stream and whoever hosts; only through a relay that carries the lane. */
  const ownStream = (now) => {
    if (!shared.online || shared.online.status !== 'open' || !shared.online.ownOk || !isWorldRoom(shared.online.room)) return false;
    const m = shared.modes?.mode ?? 'exterior';
    if (m !== 'interior' && m !== 'dungeon') return false;
    if (shared.online.othersHere === 0) { shared._ownFullAt = -Infinity; return false; }   // SCALE2b: nobody to hear - the foes stream's law
    if (now - shared._ownSentAt < FOES_MS) return false;
    shared._ownSentAt = now;
    const full = now - shared._ownFullAt >= FOES_FULL_MS;
    const frame = shared.modes?.ownFoesFrame?.(full);
    if (!frame) return false;
    if (!shared.online.sendOwnFoes(frame)) { shared._ownFullAt = -Infinity; return false; }   // AUDIT WORLD2 A9's law: the next frame carries every foe
    if (full) shared._ownFullAt = now;
    return true;
  };

  const _actLive = () => !!(shared.online && shared.online.status === 'open' && isWorldRoom(shared.online.room));
  // D-ONLINE1 (2026-09-17, a player: "when i die i just end up at the title menu"): `_actLive` is not "am I
  // online" - `isWorldRoom` matches only a dungeon or a building interior room (net/wire.js's WORLD_ROOM, the
  // rooms with host-authoritative save state); the open EXTERIOR is a CELL room (`isCellRoom`, a spawner-owned
  // streamed area), which `_actLive` has never counted. A death OUTDOORS - where a camp or a pack lives - read
  // as "not live" and fell straight to endRunToTitleMenu. This is the predicate the death screen needs: any
  // real streamed play space, dungeon, interior or the open world alike.
  // ONLINE-DEATH-FIX: an online PAGE is an online death, whatever the socket is doing at that instant. The old test
  // asked for an OPEN socket in a world/cell room, which a dungeon's room does not always satisfy (a room named by slug
  // rather than map id, a socket mid-reconnect), so the death fell through to the death video and the title menu.
  // (`onlineOn` is the URL flag; worldQuickLoad's own header rejects it for the LOAD gate, which is a different
  // question - a boot load runs before any session exists. A DEATH only happens in play, where the flag is the truth.)
  const _onlineWorldSession = () => onlineOn || !!(shared.online && shared.online.status === 'open' && (isWorldRoom(shared.online.room) || isCellRoom(shared.online.room)));
  // AUDIT WORLD34 C3: a refused act was CLEARED whenever the socket was not open - a reconnect's second or a room hold
  // lost every door touched inside it for good (the seam is a delta, nothing re-sends). The pending set now outlives
  // the socket and is flushed when it comes back; it is cleared only when the room is no world room at all
  const _actRoom = () => !!(shared.online && (isWorldRoom(shared.online.room) || isWorldRoom(shared._onlineKey)));   // AUDIT WORLD6a A7 (B8 for buildings): the room the mode NAMES counts while the socket is still held in the cell's - the act pends for the socket's arrival instead of being dropped, and every shop door is a room change now

  const actTooBig = (keys) => { for (const k of keys) if (!_actTooBig.has(k)) { _actTooBig.add(k); console.warn(`[online] act frame too large to send, dropped: ${k}`); } };
  const actSend = (data) => {
    if (!_actRoom()) { _actPend.clear(); return false; }
    if (!_actLive()) { for (const k of [...((data?.a ?? []).map((r) => r.key)), ...((data?.l ?? []).map((r) => r.k))]) _actPend.add(k); return false; }   // AUDIT WORLD34 C3: kept for the socket's return
    // WORLD4: the frame carries the doors (`a`, keyed by the action object) and the room's loot (`l`, keyed by the
    // container) - either half or both, and the pending set holds whichever keys the wire refused
    // SURV3: a CAMP frame stands alone (the dungeon says every camp it stands, in one word) - it goes now or not at
    // all: the next change says them all again, and the room's memory carries them for a joiner, so the pending set
    // that heals a door's delta has nothing to heal here
    if (Array.isArray(data?.c) && !(data?.a?.length) && !(data?.l?.length)) return actFrameFits(data) ? shared.online.sendAct(data) : false;
    // REST-SYNC: a rest's ASK stands alone too (the dungeon's `rs`) - the host stands the encounter from it or it goes
    // unasked: the ask is the rest's own hour, and the next hour rolls again
    if (data?.rs && !(data?.a?.length) && !(data?.l?.length)) return actFrameFits(data) ? shared.online.sendAct(data) : false;
    const keys = [...((data?.a ?? []).map((r) => r.key)), ...((data?.l ?? []).map((r) => r.k))];
    if (!keys.length) return false;
    let out = _actPend.size ? (shared.modes?.placeActionRecords?.([...new Set([..._actPend, ...keys])]) ?? data) : data;
    if (out !== data && !actFrameFits(out)) out = data;   // AUDIT WORLD4 A1: shed the union first - the healing keys wait for the flush, this act goes now
    if (!actFrameFits(out)) { actTooBig(keys); return false; }
    if (!shared.online.sendAct(out)) { for (const k of keys) _actPend.add(k); return false; }
    _actPend.clear();
    return true;
  };

  const hitSend = (hit, fate = null) => _hits.send(hit, fate);   // LOOT-DUP: a caller holding something irreversible learns ITS OWN frame's fate, not the queue's
  const hitFlush = (now) => _hits.flush(now);
  const actFlush = () => {
    if (!_actPend.size) return false;
    if (!_actRoom()) { _actPend.clear(); return false; }
    if (!_actLive()) return false;   // AUDIT WORLD34 C3: the socket is away - the keys wait
    const data = shared.modes?.placeActionRecords?.([..._actPend]);
    if (!data) { _actPend.clear(); return false; }
    if (!actFrameFits(data)) { actTooBig([..._actPend]); _actPend.clear(); return false; }   // AUDIT WORLD4 A1: never a live-lock
    if (!shared.online.sendAct(data)) return false;
    _actPend.clear();
    return true;
  };
  /** Who runs my dungeon's layout foes: me, unless a world room's socket is open, another holds the seat, and that
   *  seat is ALIVE - its stream, or its word in the welcome, heard within FOES_STALE_MS (AUDIT WORLD2 C2/C5: a dead
   *  socket, a terminal close or a silent host left a joiner's dungeon frozen with every blow dropped). Read every
   *  frame, not on a host change alone. */
  const dungeonAuthority = (now = performance.now()) => !(shared.online?.room && isWorldRoom(shared.online.room) && shared.online.status === 'open' && shared.online.host && !shared.online.isHost() && seatClock.live(now));

  const ROOM_HOLD_MS = 500;   // AUDIT ONLINE D11: a room key holds this long before the socket moves - a cell edge is not a churn
  const ONLINE_LOOK_CHECK_MS = 1000;   // PROFILE2: how often my look is re-composed and compared with what the rooms were told

  // ACC1d: ONE minter, shared by the presence session and every channel
  // link - it holds no token and caches nothing, so a shared minter is
  // still a FRESH token per socket, which is what the relay's spend-once
  // rule (bible ACC1d D4) requires. Built once because reading the store
  // is the only work it does before a call.
  // NAME-ADOPT: every mint's answer says who this device IS, and every
  // live session takes it in - the presence session AND each chat link,
  // because the chat roster draws my own row from whichever link its
  // tab holds. `chatLinks` is read at the moment of the answer, not
  // captured here: the links are built after this and rebuilt on rejoin.
  // ═══ RENOWN1 - THE RENOWN (Mac: "What if the leveling system was something seperate unique to online but
  // compatible"; the health and magicka "On top", a "Grind", offline earning "No") ═══════════════════════════════════
  // The level this page knows for its character (RENOWN-CHAR, Mac: "Can we make renown per character again" - RENOWN-ACCOUNT made it the account's for a day):
  // the token's word at each mint (the minter names the character, and the service signs its level in) and the service's after each report - ONLY
  // EVER UPWARD, because a total never falls and a token minted a moment before a rise must not take it back. Each rise puts the layer on at the new
  // level (systems/renownLayer.js: on top of Daggerfall's own maximums, never saved). Offline, none of this runs.
  let renownNow = null;

  const renownXpAdopt = (xp) => {
    if (onlineOn && Number.isSafeInteger(xp) && xp >= 0 && (shared.renownXp === null || xp > shared.renownXp)) shared.renownXp = xp;
  };
  const renownAdopt = (level) => {
    if (!onlineOn || !Number.isSafeInteger(level) || level < 1) return renownNow;
    if (renownNow !== null && level <= renownNow) return renownNow;
    renownNow = level;
    firmBook?.read().catch(() => {});   // FIRM1: a Renown level is a Star - the purses read again (and the tree, the first time)
    if (!seatOut()) setRenownLayer(playerEntity, level);   // AUDIT ONESEAT H3: a tab out of the seat is offline - its layer waits for Play online here
    setSigilRenown(level);   // SIGIL1: my Renown wakes the sigils - offline, and online until it is known, they sleep
    computeEntityMods(playerEntity);   // SET3: a set's stat tier wakes, or rises a stage, with my Renown - now, not at the next round
    return renownNow;
  };

  /** NAME-AS (2026-10-12): A NAME CHOSEN ON THIS DEVICE REACHES THE ROOM AT ONCE. The account card stamps the stored
   *  session when the service has taken a new choice (ui/accountFlow.js chooseName, `nameAsAt`); a stamp this page has
   *  not acted on says hello again in every room I hold - the presence session's and every chat channel's, since a line's
   *  name and the roster's are the channel's own - on a fresh token, which signs the new name (AURA-LIVE's door,
   *  net/online.js rehello). Never on a mint's word: a mint already in flight when the choice landed answers the old
   *  name, and the stamp is not its to move - so a late answer can neither hide a choice nor loop one, and a choice made
   *  on another device (no stamp moved here) is simply what every later mint signs. A stamp from before this page is
   *  read once and is no news. */
  let _nameAsAtSeen;
  const nameAsFrame = () => {
    const at = ownNameAsAt();
    if (at === _nameAsAtSeen) return;
    const first = _nameAsAtSeen === undefined;
    _nameAsAtSeen = at;
    if (first || !shared.online) return;
    shared.online.rehello?.();
    for (const link of shared.chatLinks?.values?.() ?? []) link.rehello?.();
  };
  /** STAFF1: MY GLYPHS AS THE ACCOUNT SERVICE LAST ISSUED THEM (never the device's stored copy, which is only a cache). */
  const staffGlyphs = () => shared._staffGlyphs;
  let _privateSource = null, _privatePrefix = null;
  function privateRoomHere(identity) {
    if (shared.modes?.caravanRoom) {
      if (caravanRelayOk()) return caravanRoomHere(identity);   // WAGONS2-VISIT: a caravan's own room - mine, or the one I visit
      if (caravanKeyOf(identity?.privateRoom)) return null;   // a visit at an older relay keeps no caravan's room (none is entered there)
    }   // WAGONS2-VISIT (AUDIT): and my own caravan at an older relay - the owned room, as before it (it left me in none)
    // Old relays accept arbitrary room names without this room's owner gate.
    // Never advertise personal presence through one of those relays.
    if (!shared.chatLinks.get('world')?.staffTeleportOk || !shared.social?.acct || !realmSession?.id) return null;
    if (identity?.privateRoom) return identity.privateRoom;
    const source = `${shared.social.acct}:${realmSession.id}`;
    if (_privateSource !== source) {
      _privateSource = source; _privatePrefix = null;
      privateInteriorPrefix(shared.social.acct, realmSession.id).then((prefix) => {
        if (_privateSource === source) _privatePrefix = prefix;
      }).catch(() => { if (_privateSource === source) _privateSource = null; });
    }
    if (identity?.boatUid) return privateBoatRoom(_privatePrefix, identity.boatUid);
    return privateInteriorRoom(_privatePrefix, _questLoc()?.mapTableData?.mapId, identity?.buildingKey);
  }
  // WAGONS2-VISIT: THE CARAVAN'S ROOM ON THE RELAY (net/privateInterior.js caravanRoomOf) - `caravan:<k>`, `k` its owner's
  // park key (net/wire.js parkKeyOf: the account the token verified and the character - the key the cell's record of the
  // parked caravan carries). Mine is worked out once an account and character (the digest is async: no room until it
  // lands); a visit's is the one its record named (the identity's `privateRoom`). An older relay keeps no caravan's room,
  // and is asked for none. WAGONS2's caravan room had none at all in the wilderness (no town's map id) and a town
  // building's (`owned:...:<map>.<key>`) in a town - its party lost it either way, and no visitor could find it.
  let _caravanKeyFor = null, _caravanKey = null;
  /** My character's park key, or null while it is worked out (WARDEN1: a throw the cell names is mine by it). */
  function myParkKey() {
    const c = characterIdOf(playerEntity);
    if (!shared.social?.acct || !c) return null;
    const source = `${shared.social.acct}\n${c}`;
    if (_caravanKeyFor !== source) {
      _caravanKeyFor = source; _caravanKey = null;
      parkKeyOf(shared.social.acct, c).then((k) => { if (_caravanKeyFor === source) _caravanKey = k; }).catch(() => { if (_caravanKeyFor === source) _caravanKeyFor = null; });
    }
    return _caravanKey;
  }
  function myCaravanRoom() { return caravanRoomOf(myParkKey()); }
  // WAGONS2-VISIT (FINAL AUDIT): a fresh session (a load inside my caravan, online turned on in it) has had no welcome
  // to say its relay - and with no room it is never welcomed - so the world channel's word stands for it, as the owned
  // rooms' staffTeleportOk does; the frame itself still waits for the primary's own (online.js sendCaravan)
  const caravanRelayOk = () => !!(shared.online?.caravanOk || shared.chatLinks?.get('world')?.caravanOk);
  function caravanRoomHere(identity) {   // its one caller asks the relay first (privateRoomHere's caravanRelayOk)
    return caravanKeyOf(identity?.privateRoom) ? identity.privateRoom : myCaravanRoom();
  }
  /** STAFF-TP: x/z are native world coordinates outdoors/in buildings;
   * dungeon/court positions are local to that exact instance. y never grounds. */
  function staffDestination() {
    if (!walkMode || !shared.playerSpawned || worldMoveBusy() || shared.modes?.transitioning || seatOut() || !(playerEntity.health > 0)) return { error: 'busy' };
    if (shared.siegeSession?.active() || shared.royalSession?.active()) return { error: 'battle' };
    const mode = shared.modes?.mode ?? 'exterior';
    const identity = shared.modes?.roomIdentity?.();
    if (identity?.kind === 'arena') return { error: 'battle' };
    // WAGONS2 (FINAL AUDIT): a caravan's room is no building a door of the street walks into (staff sent there were told
    // the instance could not be entered) - staff land behind its rear door, outside, where its owner steps out
    const caravanRoom = mode === 'interior' ? shared.modes?.caravanRoom ?? null : null;
    const caravanOut = caravanRoom ? caravanDoorLanding({ caravanRoom }) : null;
    if (caravanRoom && !caravanOut) return { error: 'private' };
    const privateRoom = identity?.private && !caravanOut ? privateRoomHere(identity) : null;
    if (mode === 'interior' && !caravanOut && (!identity?.buildingKey || (identity.private && !privateRoom))) return { error: 'private' };
    const inside = shared.modes?.anchorContext?.();
    const inDungeon = mode === 'dungeon';
    const wc = inDungeon ? null : state.worldCoords(player.pos);
    const pixel = inDungeon ? { ...state.current } : playerTravelPixel();
    let dest = {
      kind: mode, pixel, ...(inDungeon ? inside?.dungeon ?? {} : {}),   // ONLINE-PUBLIC: a dungeon's layout (`whole`, a legacy save's) - a gate's and an Abyss's law keeps neither
      pos: inDungeon ? [...player.pos] : [wc.x, player.pos[1] - state.compensation[1], wc.z],
      yaw: cam.yaw, pitch: cam.pitch,
    };
    if (caravanOut) {
      const c = state.worldCoords(caravanOut.position);
      dest = { ...dest, kind: 'exterior', pos: [c.x, caravanOut.position[1] - state.compensation[1], c.z], yaw: caravanOut.yaw };
    } else if (mode === 'interior') {
      const door = inside?.interior?.door;
      dest.door = door && { ...door, buildingKey: door.buildingKey >>> 0 };
      dest.layout = identity?.layout ?? 'classic';
      if (privateRoom) dest.privateRoom = privateRoom;   // ONLINE-PUBLIC: a private home is its own room; no instance word is recorded
      if (shared.modes?.sailingCabin) { dest.sailingCabin = shared.modes?.sailingCabin; dest.cabinOwner = shared.modes?.cabinOwner ?? shared.online?.id; }
    }
    if (inDungeon) {
      const gate = shared.modes?.gateArenaGate?.();
      if (gate) dest = { ...dest, kind: 'gate', gate: shared.gateLink?.withCourt?.(gate) ?? gate };   // AUDIT GATE-COURTS C6: and the court I stand in
      else if (shared.ohAbyss?.active) dest = { ...dest, kind: 'abyss', abyss: shared.ohAbyss.data };
      else {
        const loc = shared.modes?.dungeonLocation, id = loc?.mapTableData?.mapId;
        dest.mapId = Number.isInteger(id) ? id >>> 0 : null;
        const dungeonId = loc?.dungeon?.recordElement?.header?.locationId;
        if (Number.isInteger(dungeonId) && dungeonId >= 0) dest.locationKey = `dungeon:${dungeonId}`;
      }
    }
    if (mode === 'exterior' && csaOn()) {
      const ab = csaAboard.aboard;
      const boat = ab?.boat ?? (csaRuntime?.isSailing() ? csaRuntime.state.CurrentBoat : null);
      if (boat) {
        const owner = ab?.owner ?? shared.online?.id;
        const slot = ab?.slot ?? csaRuntime.AllBoats.filter((b) => b.GameObject?.activeSelf).indexOf(boat);
        // The ordinary aboard word rounds to centimetres. A staff landing does not.
        const local = csaLocalOf(csaDeckPose(boat), player.pos);
        dest.boat = { owner, slot, local, ...(boat.uid ? { uid: boat.uid } : {}) };
      }
    }
    dest = validStaffDestination(dest);
    return dest ? { dest } : { error: 'unavailable' };
  }

  let _renownCapHour = null;
  // AUDIT SET D7: the hour the service's bound counts is ITS clock hour - read on the shared clock (the relay's), as the
  // gate and the Broker read theirs; this machine's own clock, minutes off, ended the page's hour before or after the
  // service's, so the sigils drank in an hour that paid nothing or starved in one that paid again
  const renownHour = () => Math.floor((Date.now() + shared._sharedOffsetMs) / 3_600_000);
  // AUDIT SCALE II C-4: what is left of that hour - in its last minute a report goes at the minute's pace, so what is
  // earned in it is credited by its own hour's window, not held into the next (renownReportSoon `hourLeftMs`)
  const renownHourLeftMs = () => (renownHour() + 1) * 3_600_000 - (Date.now() + shared._sharedOffsetMs);
  // AUDIT SCALE II C-3: the hour the report in flight was SENT in (the tracker sends one at a time) - a `capped` answer
  // speaks of that hour, whenever it arrives
  let _renownSentHour = null;

  /** FIRM1: A RENOWN LEVEL, SAID AS AN ASCEND IS (the lead dev: "when leveling up a renown give the player the same
   *  message as he would ascend") - the level's fanfare and the strip's gold row (ui/levelUp/levelNotice.js announceRenownRise),
   *  with the Stars it brought for the Firmament. */
  const renownRose = (level) => {
    const was = shared.renownSaid ?? level - 1;
    shared.renownSaid = level;
    announceRenownRise(level, { stars: starsFor(level) - starsFor(was), say: (t) => townTalk.say(t) });
  };
  // SCALE4h: what the hour's bound still takes, as the last report's answer said it - with the hour and the total it was
  // said at, so another hour, or a total another door moved (a raid's, a serpent's, a writ's, a siege's), is a room not
  // known, and the next report goes at the minute's pace to learn it (net/renownTracker.js renownReportSoon)
  let _renownRoom = null;
  const renownTracker = onlineOn ? createRenownTracker({
    report: (c, xp, name, rid, region) => { _renownSentHour = renownHour(); return renownAccount.report(c, xp, name, rid, region); },   // AUDIT SCALE II C-3: the hour it goes in
    leave: (c, xp, name, rid, region) => renownAccount.leave(c, xp, name, rid, region),   // AUDIT RENOWN1 GAME-8: the page's last word, finished by the browser
    character: () => characterIdOf(playerEntity),
    region: () => { const px = playerTravelPixel(); const r = maps.getRegionIndexAt(px.x, px.y); return Number.isSafeInteger(r) ? r : null; },   // SEAT1b: where the XP was earned - a pledged seat's region counts it (Seats-Arc 4.2)
    name: () => (typeof playerEntity?.name === 'string' ? playerEntity.name : null),
    earning: () => !!shared.online && !seatOut() && _renownCapHour !== renownHour(),   // ONE-SEAT: a tab another took the seat from earns nothing - its character is not online. SCALE4h: nor does an hour the bound has spent - the service credits nothing in it, the sigils drink nothing and the bar draws no ghost (each as the page last heard it), so it is no longer reported every minute to be credited nothing
    onAnswer: (data, sent) => {
      const a = renownAnswer(data, sent, shared.renownSaid);   // AUDIT RENOWN1: one pure plan (net/renownTracker.js), pinned there
      renownXpAdopt(a.xp);   // RENOWN4: the track's total, for my bar
      if (a.room !== null) _renownRoom = { room: a.room, hour: renownHour(), xp: shared.renownXp };   // SCALE4h
      renownAdopt(a.level);
      if (a.order) shared.online?.sendRenownOrder?.(a.order, a.level);   // the rooms I am in hear it now - and again until each answers
      if (a.announce !== null) renownRose(a.announce);   // FIRM1: said as a level is
      // AUDIT SCALE II C-3: THE CAP IS THE SENT HOUR'S. A report sent at 10:59:59.7 and answered capped at 11:00:00.3 spoke
      // of hour 10 - stamped with the hour it ARRIVED in, it marked hour 11 spent, and `earning` then kept nothing for the
      // whole of hour 11. A cap is kept only while the hour it was sent in is still the page's
      if (a.capped) {
        const hour = renownHour();
        if (_renownSentHour === hour && _renownCapHour !== hour) { _renownCapHour = hour; tradeSay('You have earned the most Renown allowed this hour. Fighting still raises your skills.'); }
      }
    },
    // AUDIT RENOWN1 UI-4: a refusal that ends reporting is SAID - the sentences were written and nothing ever showed them
    onStop: (error) => tradeSay(`${accountRefusalText(error)} This character is earning no Renown.`),
    // SCALE4h: at the minute's pace only while the answer says what the page cannot - a rise, the hour's bound, a total or
    // a room not known; else every RENOWN_COALESCE_MS, what waits drawn as the bar's ghost
    soon: () => renownReportSoon({ xp: shared.renownXp, pending: renownTracker?.pending() ?? 0, capped: _renownCapHour === renownHour(), hourLeftMs: renownHourLeftMs(),
      room: _renownRoom && _renownRoom.hour === renownHour() && _renownRoom.xp === shared.renownXp ? _renownRoom.room : null }),
  }) : null;
  // CHAP1 (bible/11-Multiplayer/Chapters-Arc.md 3; Mac: "Server-owned"): THE ROLL - online, this realm character's
  // standing with Daggerfall's guilds (the twenty-two guild factions and its memberships) is the account service's. Read
  // as it comes online - the save's standing its seed, taken once - and written over the save's; then what DFU's own law
  // moves here is claimed back, and the service's answer adopted (net/npcRollTracker.js). Built only online and only for
  // a realm character, as the Renown tracker is; offline, and while CHAPTERS_OPEN keeps the account out, the save keeps
  // it exactly as DFU does.
  // AUDIT CHAP: the glue is the tracker module's own (rollEntityDoors), so it is pinned there; what was never claimed
  // rides the save (`rollKept`, above) - the page's going sends nothing (C1/T1: the lease is given up first)
  const rollTracker = onlineOn && realmSession ? createRollTracker({
    io: accountRoll({ fetch: (u, i) => globalThis.fetch(u, i), storage: appStorage() }),
    character: () => realmSession.id,
    lease: () => realmSession.lease,
    ...rollEntityDoors(() => playerEntity),
    kept: () => shared.rollKept,
    keep: (k) => { shared.rollKept = k; },
    // CHAP4b: ranks 8 and 9 are seats - the book held at 7 said once a hold, the seats as they stand and as they move
    ...rollNoticeDoors({ entityOf: () => playerEntity, say: (text) => chatNotice(text) }),   // SEAT-WORDS / STANDING-WORDS: the hold (and the Chapters page), and what the Roll moved
    onSeats: (seats, before) => { for (const line of seatLinesOf(before, seats)) chatNotice(line); },
    // shut: the save keeps it, quietly - AUDIT CHAP3 C9: a build too old for the service says so, as Renown's stop does
    onStop: (error) => {
      if (error === 'roll-seed' || error === 'roll-claim') chatNotice(accountRefusalText(error));
      else if (error !== 'chapters-closed') console.warn('[roll] the Roll stopped:', error);
    },
  }) : null;
  // CHAP4b: the rank the playing character's seat gives it at a hall of `faction` where it stands - the politic region,
  // as the chapter sheet's (AUDIT CHAP3 C6) - null offline, before the Roll's first word, or with no seat here
  const seatRankHere = (/** @type {number} */ faction) => {
    if (!rollTracker?.held || rollTracker.stopped) return null;
    const px = playerTravelPixel();
    const region = (() => { try { return maps.getRegionIndexAt(px.x, px.y); } catch { return null; } })();
    return seatRankAt(rollTracker.seats, faction, region);
  };
  // SIGIL1: THE DRINK - the weapon in my hand takes every point of Renown XP I earn with it (a kill, a quest), and a
  // rise to a new stage is said (systems/sigil/sigil.js drinkSigil: nothing while my Renown is unknown). Past the hour's cap
  // the service keeps nothing, and the sigil drinks nothing either - as the page last heard it.
  // SET4: and so does every set piece I wear, each once - a rise said once a set, the weapon's own line unless its set
  // just said one (systems/sigil/sigilSets.js drinkWorn) - and a set that rose has its tiers' numbers folded at once.
  const sigilDrinks = (xp) => {
    if (_renownCapHour === renownHour()) return;
    const held = (shared.modes?.liveArm?.()?.rig ?? weaponRig).playerWeapon?.strikingWeapon ?? null;   // AUDIT SET D1: the MODE's rig - indoors and underground world.js's own is never readied, so the weapon I fought with there never drank
    const drank = drinkWorn(playerEntity, held, xp, itemLongName);
    for (const line of drank.lines) townTalk.say(line);
    if (drank.rose) computeEntityMods(playerEntity);
  };
  if (renownTracker) {
    // RENOWN4 (Mac: "why is there no way to view my renown ingame?" and "Plus XP bar"): MY RENOWN ON MY HUD - the level,
    // the total as the service last said it, and what is earned and not yet answered (drawn faint after the fill; none
    // in an hour the bound has spent, since nothing earned then counts). Built only online, like the tracker.
    setHudRenown(() => ({ level: renownNow, xp: shared.renownXp, pending: _renownCapHour === renownHour() ? 0 : renownTracker.pending() }));
    globalThis.addEventListener?.('pagehide', () => { renownTracker.leave(); });   // RENOWN1: what was earned since the last report goes as the page does. AUDIT RENOWN1 GAME-8: by `keepalive`, under the report's own id
    setRenownKillHandler((foe) => { const party = 1 + (shared.partyNear()?.length ?? 0); const xp = renownPartyXp(renownKillXp(renownFoeLevel(foe), renownNow), Number.isInteger(foe?._fightN) ? Math.min(party, foe._fightN) : party); renownTracker.earn(xp); sigilDrinks(xp); seatEdicts.campCleared(foe?.site).catch(() => {}); });   // AUDIT PSCALE1 PLAY-4: a shared foe's bonus counts the partymates who FOUGHT it (its fighters, systems/party/partyScale.js) - a partymate idling in the cell pads nothing   // RENOWN3: read against my Renown, never above it by more than RENOWN_OVER_MAX
    const paid = new Set();
    shared.renownQuestEnded = (q) => {
      if (!q?.questSuccess) return;
      const key = String(q.uid ?? q.questName ?? '');
      if (!key || paid.has(key)) return;   // a quest pays once, however its end is heard again
      paid.add(key);
      const xp = renownQuestXp(playerEntity.level, renownNow);   // RENOWN3: the quest's level read against my Renown too
      renownTracker.earn(xp);
      sigilDrinks(xp);   // SIGIL1
    };
  }
  // ACC4 (Mac: "time played to the icon profile"): THE WORLD IS WHERE
  // TIME IS PLAYED, so the clock starts here and not at the menu - once,
  // because bootWorld runs once per page. Online or not: a signed-in
  // player in a single-player world is still playing. A hidden page
  // does not knock, so a tab left in the background is not time played.
  // SCALE4c (Mac: "Do 1 2 and 3"): ONE HEARTBEAT FOR THE TAB'S THREE CLOCKS - the beat rides it (or goes alone when
  // nothing will ride with it, a single-player world's case), the town's board and the letterbox join it below, each at
  // its own pace and each answered as its own route answers (net/heartbeat.js, server-account/src/heartbeat.js). The
  // FOUR HOSTS: this host alone keeps any of the three - exterior.js (the fixed city), worldModes.js (interiors, this
  // host's own modes) and dungeonContext.js (the standalone dungeon) start no play clock, read no board and keep no box.
  const heartbeat = createHeartbeat({
    fetch: (u, i) => globalThis.fetch(u, i), storage: appStorage(),
    visible: () => globalThis.document?.visibilityState !== 'hidden',
  });
  // AUDIT SCALE B1: the hide seen at once, not at the next tick - a knock waiting as the page hides goes with it, kept
  // alive past the page (a tab closed), where a second's tick may never come
  globalThis.document?.addEventListener?.('visibilitychange', () => { heartbeat.tick(); });
  startPlayClock({
    beat: () => heartbeat.beat(),
    visible: () => globalThis.document?.visibilityState !== 'hidden',
  });
  // the town's board, read where and while the street frame finds the player in a town (the frame stamps it each second)
  let emoteWheel = null;
  heartbeat.add('festivals', shared.playerFestivals.heartbeatPart());
  if (noticeBook) heartbeat.add('board', noticeBook.heartbeatPart(() => (shared._noticeTown && performance.now() - shared._noticeTown.at < FRAME_LIVE_MS ? shared._noticeTown.mapId : null)));
  /** QUEST-PARTY (2026-09-26, Mac: "Party shares them"): THE PARTY'S LAW FOR A POOL'S QUEST FOES - one home for the
   *  open air's pool (onlineStart) and each building's (worldModes' interior pool, QUEST-PARTY phase 3b). A quest shared
   *  with the party streams its foes to the party, a member stands a party peer's, a peer's blow and a quest foe's hunt
   *  reach only the party (a quest's own allies take no blow), and my copy of the quest counts the injury and the kill it
   *  sees on a partner's foe. */
  const keptKills = new KeptKillLedger();   // KEPT-KILL: the kills of foes I kept on a partner's word, and the kills my copies counted

  /** SOC2: the social picture over the hub link - the hub's frames into net/social.js, its notes and refusals onto the
   *  world tab as system lines (SRV-N's flag: a line nobody sent). The panels and the HUD are made here too, over the
   *  same state - SOC3 the friends and party panel beside the chat, SOC4 the party HUD - so a reload of the picture
   *  (a reconnect's fresh state frame) is one repaint through `onChange`, never a rebuild. */
  const socialStart = () => {
    const link = socialLink();
    if (!link) return;   // no hub tab: the social arms do not exist
    const tab = shared.chatLog.tabs.find((t) => t.room === SOCIAL_ROOM);
    if (!link.acct) {   // AUDIT SOC B10: no account to be anyone by - the browser keeps no storage (net/social.js accountId is null rather than a fresh permanent record per load); the chat stands, the social arms do not, and the player is told once, on the tab whose button would have answered
      if (!_noAccountSaid) { _noAccountSaid = true; shared.chatLog.push(tab.id, { text: NO_ACCOUNT_TEXT, system: true }); }
      return;
    }
    shared.social = new SocialState({ acct: [storedSession(appStorage())?.id, link.acct].filter(Boolean) });   // FRIENDS-SYNC: the hub keys the picture by the signed-in player (the token's subject), the profile id before it
    chatSafety.adoptSocial();   // SAFE1: and a blocked account's requests and invites never land
    link.onSocial = (f) => { shared.social.apply(f); };
    link.onParty = (acct, p) => {
      shared.social.applyParty(acct, p);
      shared.partyPing?.hear(acct, p);   // PARTY-PING: a mate's point, in this place
      // KEPT-KILL: a member's kills of foes they kept on a partner's word - my copy of that quest counts each, once
      if (p?.qk && shared.social.inMyParty(acct)) creditKeptKills(shared.questBridge?.machine, keptKills, acct, p.qk, Date.now());
    };
    // PARTY-MAP: a mate's Shared Cartography rows - a seat in my party alone (applyParty's own rule), merged only when I
    // stand in that same dungeon, as revealed and nothing more (automap.js mergePartyAutomap)
    link.onAmap = (acct, _name, k, r) => { if (shared.social.inMyParty(acct)) mergePartyAutomap(k, r); };
    // QUEST1: a party member's shared quest lands here - the three receiver gates (already active, already
    // done/tombstoned, the guild membership the quest assumes) all run inside receiveSharedQuest, never here; this
    // reads only the result and says it in a word, success or refusal, the same as sendQuest's own send-side note.
    link.onQuestShared = (acct, name, quest) => {
      if (!shared.social.inMyParty(acct)) return;   // AUDIT 68 S14-quest-inbound-ungated: a seat in my party alone, applyParty's own rule - the relay is the player's choice
      const who = name || shareSomeone();   // QUEST-AUDIT III SHARE-WORDS (questShare.js)
      const result = receiveSharedQuest(shared.questBridge?.machine, shared.questBridge?.questLists, quest.questName, quest.data, {
        memberships: activeMemberships(playerEntity),
        // AUDIT SD III (D5): the copy laid on this world's sizes - a quest item I carry never laid again
        carriesQuestItem: (res) => keepsQuestItem(playerEntity, res),   // QUEST-AUDIT III SHELF-TWIN: every keeping (itemTransfer.js)
        from: acct,   // QUEST-AUDIT III GOLD-HOLDERS: the sender holds this copy (questShare.js receiveSharedQuest)
      });
      const label = quest.displayName || quest.questName;
      if (result.ok) {
        if (!result.resync && acct) _questSharer.set(quest.questName, acct);   // QUEST-PARTY: the sharer's copy stands its foes near me
        // QUEST1 LIVE SYNC: a resync (this quest was already kept in
        // step with the party) stays quiet - it can fire every couple
        // of seconds while someone actively plays through it, and a
        // background sync is not a deliberate share. Only the FIRST,
        // fresh receipt gets the on-screen note.
        if (!result.resync) setMidScreenText(shareReceivedLine(who, label));
        // AUDIT PARTY8 (2026-09-23): THE ECHO. A resync restores the sender's log, which changes MY log's length, and
        // questSyncTick read that as my own progress and shared the quest straight back - every receiver, once,
        // on its next tick: one log line became eight hub acts and fifty-six deliveries at eight seats, and the
        // room's whole quest burst (QUEST_ROOM_HZ_MAX) for one party. What I just received is what I have seen.
        const q = shared.questBridge?.machine?.sharedCandidateNamed(quest.questName);
        if (q) _questSyncSeen.set(quest.questName, syncBaselineAfter(q, result, _questSyncSeen.get(quest.questName)));   // DISC28-I: the whole signature, the sync's own measure; QUEST-AUDIT III PROGRESS-KEPT / GOLD-HOLDERS (questShare.js)
        if (quest.data?.final === 1) _questSharer.delete(quest.questName);   // DISC28-I: the copy that stood its foes has ended - mine ends with it
        return;
      }
      if (result.reason === 'finished') return;   // DISC28-I: a partner's finish of a quest I never had - nothing to say
      // QUEST-SHELF: a copy I set aside - the party's step is not mine while it is away; its audit: a DELIBERATE share is
      // answered (RECEIVER_REFUSAL_TEXT 'shelved', below), only the background sync is quiet
      if (result.reason === 'shelved' && quest.data?.sync === 1) return;
      // AUDIT DISC28 QS-3: nor any refusal of a FINAL - a partner's finish is no offer: to a member who ended the copy
      // already (both delivered; a timer that ran out in every world on the same tick), holds one of their own, or never
      // took it, it is news of nothing - and a sync's 'done' is a copy I finished myself. Said, it told a party that had
      // just finished together "... tried to share it, but you have already done this quest".
      if (quest.data?.final === 1 || (quest.data?.sync === 1 && result.reason === 'done')) return;
      // SHARE-MEND: a sync's refusal is said once (sayShareRefusal), and one that says the copies disagree names a build skew
      if (!sayShareRefusal(_questRefusalSaid, acct, quest.questName, result, quest.data?.sync === 1, `${quest.data?.shareId ?? ''}|${quest.data?.build ?? ''}`)) return;
      setMidScreenText(shareRefusedLine(result, who, label, quest.data?.build ?? null));   // DISC25-D: a guild refusal names the guild; QUEST-AUDIT III SHARE-WORDS: the line in the player's language (questShare.js)
    };
    // AUDIT DISC28 QS-1: the hub refused my last share as 'busy' (net/online.js onQuestBusy) - a FINAL goes back on the
    // machine's pending finals and questSyncTick sends it when the floor opens. An ordinary sync never does: sent as a
    // final it would end the party's copies on the state before the end; the next change carries it, as it always did
    link.onQuestBusy = (quest) => { questBusyAgain(shared.questBridge?.machine, quest, _questSyncSeen); };   // AUDIT DISC28 QS-1 and QUEST-AUDIT III BUSY-SYNC (questShare.js)
    shared.social.onNote = (note, text) => { if (text) shared.chatLog.push(partyNoteTab(note, shared.social, tab.id), { text, system: true }); };   // CHAT-CHAN: a party's own news on the Party tab, beside its conversation
    shared.social.onError = (text) => { shared.chatLog.push(tab.id, { text: `Social: ${text}`, system: true }); };
    // SOC3: the social button and the friends + party panel are made here, over `social`, `link` and `chatPanel`
    // (Mac: "A social button next to the chat UI, that when tapped opens the new friends list + party interface").
    // The BUTTON is the chat panel's - it was built with the `social` option above and its onToggle is the line
    // below's `socialPanel` - so there is one control and no second floating widget to keep out of the HUD's way.
    // The panel is a POINTER SURFACE and takes the chat's own three doors, word for word: no opening under a
    // window or the pause door, the cursor freed inside the opening gesture and taken back inside the closing one.
    // MAIL1 (Addison Knox: "An in-game mail system where players can send messages to offline players (e.g. notes,
    // contracts, invitations)"): THE LETTERBOX, over the ACCOUNT SERVICE and not the hub - a letter is for someone
    // who is not here, and the service is what outlives a session. Its io is read from the store at EACH call, so a
    // sign-in or sign-out between two looks is simply the box's next answer. A look that finds letters says so on the
    // world tab, a line nobody spoke; the panel's Letters tab draws the box, and onlineFrame polls it.
    shared.mail = new MailBox({
      ioOf: () => {
        const st = appStorage();
        const s = storedSession(st);
        return s ? { fetch: (u, i) => globalThis.fetch(u, i), base: serviceBase(st), secret: s.secret, storage: st } : null;
      },
      onLetter: (event) => { shared.chatLog.push(tab.id, { text: mailNoticeText(event), system: true }); },
    });
    // SCALE4c: its looks ride the heartbeat - while the online lane runs, as its poll there ran
    heartbeat.add('mail', whileLive(shared.mail.heartbeatPart(), () => performance.now() - shared._mailFrameAt < FRAME_LIVE_MS));
    // SERVER-POST (2026-10-08, Mac: "an ingame server mailbox that goes next to the hourglass in the pause menu. It should
    // show notifications whenever players have a message. First use is to utilize it for players being granted items"):
    // THE SERVER'S POST - the developers' messages, looked at on the letterbox's clock (riding the heartbeat while the
    // online lane runs), a new one said on the world tab as a letter is; the pause face's envelope counts what waits
    // (pauseDoorHooks `post`). An item is claimed into the realm character being played: the service writes it into the
    // record and the pack takes it on the answer - the guild vault's take (realmGoldAct, the answer needed)
    shared.postBox = new PostBox({
      ioOf: () => {
        const st = appStorage();
        const s = storedSession(st);
        return s ? { fetch: (u, i) => globalThis.fetch(u, i), base: serviceBase(st), secret: s.secret, storage: st } : null;
      },
      onPost: (event) => { shared.chatLog.push(tab.id, { text: postNoticeText(event), system: true }); },
      character: () => characterIdOf(playerEntity),
      realm: realmSession && { act: (o) => realmGoldAct({ session: realmSession, checkpoint: () => onlineCheckpoint(), ...o }), abandon: (why) => realmSession.abandon(why) },   // offline, none: no claim
      pack: { add: (rec) => { playerEntity.items ??= []; shared.takeGateSpoil({ kind: 'item', item: setItemFields(rec) }); }, changed: () => { saveSoon.changed(); } },   // LOST-SPOILS: a spoil's own door - a first ember from the Lost and Found brings its book
    });
    heartbeat.add('post', whileLive(shared.postBox.heartbeatPart(), () => performance.now() - shared._mailFrameAt < FRAME_LIVE_MS));
    // GUILD1b: THE CHARACTER'S GUILD, over the account service (GUILD1a's door). Its gold is the save's: the purse first,
    // then the bank account of the region the player stands in - HOME1's order (worldModes homeAccount), and the
    // account minted on first use as the bank window mints it.
    shared.guildBook = new GuildBook({
      door: accountGuilds({ fetch: (u, i) => globalThis.fetch(u, i), storage: appStorage() }),
      // GUILD2b (bible/11-Multiplayer/Guild-Overhaul.md): the pack a vault's piece leaves and arrives in - the item made
      // whole as the save's loader makes one (setItemFields), added as DFU's AddItem adds; the one checkpoint asked
      pack: { items: () => (playerEntity.items ??= []), add: (rec) => { const it = { ...rec }; for (const k of RECEIVER_MARKS) delete it[k]; addItem((playerEntity.items ??= []), setItemFields(it), 'back'); }, changed: () => { saveSoon.changed(); },   // WAGONS2-VISIT (AUDIT): a piece from the vault comes without the last owner's marks (a caravan's door among them)
        reach: () => _storesReached(), refuses: (it) => packTradeRefusal(it, playerEntity) },   // GUILD2b: the vault is reached in a town, as the Stores are (BAG1); WAGONS2 (AUDIT): what the pack keeps - the loaded wagon
      marks: marksBook,   // MARKS1: the guild's Marks treasury moves through the account's Marks
      // PROF6: the guild Stores and the Officers' writ budget, through the writs' book, while the professions are this
      // account's
      profStores: writBook ? {
        writs: writBook, open: () => profBook?.state.open === true, mine: () => profBook?.state.stores ?? new Map(), name: materialCountLabel,
        character: () => characterIdOf(playerEntity),   // AUDIT 31 H2: the guild Stores read are this character's
      } : null,
      character: () => characterIdOf(playerEntity),
      // GUILD1c: what the service signed, to the rooms - my guild now down every socket I hold (the tag beside my name,
      // the hub's guild chat), and a member removed or a guild disbanded to the hub, where it reaches them
      onOrders: ({ order, outOrder }) => {
        if (outOrder) socialLink()?.sendGuildOut(outOrder);
        if (order) { shared.online?.sendGuildOrder(order); for (const link of shared.chatLinks?.values?.() ?? []) link.sendGuildOrder(order); }
      },
      wallet: () => {
        playerEntity.bankAccounts ??= createBankAccounts(BANK_REGION_COUNT);
        const account = playerEntity.bankAccounts[goldRegion(playerEntity.bankAccounts, _questRegionIndex() ?? 0)] ?? null;   // EMPIRE-ACCOUNT: the Empire's account
        return {
          gold: () => totalGoldAmount(playerEntity) + (account?.accountGold ?? 0),
          pay: (n) => payUndoable(playerEntity, n, account),   // MARKET-AUDIT: answering the undo of exactly what it took
          // GUILD-LETTER (FIELD BUGS 2026-09-30): a withdrawal the pack cannot carry as coin is paid as a letter of credit -
          // the trade window's test on the live pack and ceiling (sellProceeds; the bank's weight gate reads the same two),
          // and the letter the service writes on a realm record, at the front of the pack as the game puts one
          credit: (n, { letter = false } = {}) => { if (letter) (playerEntity.items ??= []).unshift(realmLetterOfCredit(n)); else addGold(playerEntity, n); },
          paper: (n) => sellProceeds(n, { carriedWeightKg: carriedWeight(playerEntity), maxEncumbranceKg: entityMaxEncumbrance(playerEntity) }).kind === 'letterOfCredit',
          region: () => _questRegionIndex() ?? 0,   // REALM P2.2: the account the record pays from is this one
        };
      },
      // REALM P2.2: a realm character's founding, deposit and withdrawal move its record's gold on the service, in the
      // guild's own batch - the purse checkpointed first, the hold standing until the answer (realmSaves.js realmGoldAct)
      // AUDIT2 GUILD2 K1: and the session given up where an answer the act needs is missing (a vault take's piece)
      realm: realmSession ? { act: (o) => realmGoldAct({ session: realmSession, checkpoint: () => onlineCheckpoint(), ...o }), abandon: (why) => realmSession.abandon(why) } : null,
      onHall: (mapId) => { onlineHomes?.ensure?.(mapId, { force: true }); },   // GUILD1d: the hall's town read again - its door and banners
      // AUDIT GUILD-YARD C3, AUDIT PROF-541 G1: a rank moved (a keeper made or unmade), found by whichever look, reads the
      // town again, as onHall does - its halls' `keeper` was the town's answer's, believed a minute
      onRank: () => { onlineHomes?.bump?.(); onlineHomes?.ensure?.(shared._musicLoc?.mapTableData?.mapId, { force: true })?.catch?.(() => {}); },
    });
    // BUNNYFALL (Phase 5): THE ACCOUNT VAULT - a shelf and a purse every character of the account reaches at a bank (the
    // guild vault's own machinery, one owner; opened from the bank window, ui/accountVaultWindow.js). A realm character's alone.
    shared.accountVault = realmSession ? createAccountVaultBook({
      door: accountVaultDoor({ fetch: (u, i) => globalThis.fetch(u, i), storage: appStorage() }),
      character: () => characterIdOf(playerEntity),
      realm: { act: (o) => realmGoldAct({ session: realmSession, checkpoint: () => onlineCheckpoint(), ...o }), abandon: (why) => realmSession.abandon(why) },
      pack: { items: () => (playerEntity.items ??= []), add: (rec) => { const it = { ...rec }; for (const k of RECEIVER_MARKS) delete it[k]; addItem((playerEntity.items ??= []), setItemFields(it), 'back'); }, changed: () => { saveSoon.changed(); }, refuses: (it) => !!packTradeRefusal(it, playerEntity) },
      wallet: () => shared.guildBook.wallet(),
    }) : null;
    shared.socialPanel = createSocialPanel({
      social: shared.social,
      mail: shared.mail,
      guild: shared.guildBook,
      territory: () => shared.companyTerritory,   // BUNNYFALL COMPANIES: the City Charter on the Company page (systems/companyTerritory.js)
      garrison: () => shared.garrisonBook,   // BUNNYFALL COMPANIES: the Garrison page (systems/garrisonBook.js)
      farms: () => shared.farmBook,   // BUNNYFALL COMPANIES: the Farms page (systems/farmBook.js)
      send: (act) => socialLink()?.sendSocial(act) ?? false,   // false is the rate gate's answer: the panel keeps the button and says "try again"
      keepLetter: (letter) => keepLetterInJournal(letter),   // JOURNAL1: a letter kept in my journal, as a page is
      journey: () => shared.partyTravel,   // PARTY-UI: the Party tab's Journey - the session is made later in this host, so it is read when drawn
      canLead: () => !!socialLink()?.partyLeadOk,   // PARTY-LEAD: Make leader, through a hub that knows the act
      canOpen: () => !gamePaused() && !(townTalk.hudCovered || (shared.modes?.hudCovered ?? false)),
      onOpen: () => surfaceOpen('social'),   // AUDIT SOC B6: counted with the chat's and the F-menu's - the first up frees the mouse, the last down takes it back
      onClose: () => surfaceClose('social'),
      above: () => !!(shared.socialMenu?.isOpen?.() || shared.profileWin?.isOpen?.() || shared.pageWin?.isOpen?.()),   // AUDIT SOC C2/C14: the F-menu stands over the panel - its Escape is the menu's; INSPECT1: and the profile opened from it; JOURNAL1: and a page read from it
    });
    // AUDIT SOC B14/D11: `hudCtx.openSocial` stood here as a second door to the panel; nothing dispatched through it
    // (SOC5's key reaches the panel through socialInteract's nobody-in-front arm), and a door nothing opens is a
    // second truth to keep - so it is gone.
    // SOC4: the party HUD (portraits, health / stamina / magicka) is made here, over `social`
    // The art pair is the ESCORT FACES' own (initEscortFaces above): one fetch door and one palette for every
    // classic record this host reads, so a portrait is the same CIF the paper doll draws and nothing is loaded twice.
    // PARTY8-B: `here` is the pose partyFrame last SENT - the HUD draws a seat's place only when it is not mine,
    // and reads the composed pose rather than composing one (AUDIT SOC B18: that read is twice a second, not per frame)
    shared.partyPanel?.destroy?.();   // COMPANION-KIT: the offline panel my companions stood gives way to the party's
    makePartyPanel(shared.social);
    // SOC5 (Mac: "which should show options to add as a friend or invite to a party"): the F-menu, over the same
    // picture and the same link. Its acts leave through `socialLink()` and not the `link` captured above, because a
    // reconnect replaces the session object and a captured one would send into a closed socket for the rest of the
    // session. The line that says so lands on the world tab beside every other social note (SRV-N's flag: a line
    // nobody spoke), and a refused send says so in the same place rather than silently.
    shared.socialMenu = createSocialMenu({
      doc: document, win: globalThis,
      canOpen: socialMenuCanOpen,
      onOpen: () => surfaceOpen('menu'),   // AUDIT CHAT C2's law: the card is a pointer surface - the mouse is freed inside the gesture that opened it (AUDIT SOC B6: counted with the chat's and the panel's)
      onClose: () => surfaceClose('menu'),   // and taken back inside the one that closed (MAC1's rule, ui/pauseDoor.js) - by the last surface down
      onAct: (act) => peerAct(act),
    });
    // AUDIT DISC7 A4: a refused row's reason, where the act's own line would have gone
    peerNote = (text) => { if (text) shared.chatLog.push(tab.id, { text, system: true }); };
    // ACT-MENU: the one door a chosen act leaves by - the F-card's rows and the plaque's (plaquePeerAct) alike
    peerAct = (act) => {
      if (act.k === 'emote.wheel') { emoteWheel?.show({ peerId: act.peer, name: peerName(act.peer) ?? 'Someone' }); return; }
      if (act.k === 'page.read') { readPage(act.peer); return; }   // JOURNAL1: not a hub act - a page they hold out to me, read
      if (act.k === 'profile.inspect') { inspectPeer(act.peer); return; }   // INSPECT1: not a hub act - a look at someone standing here, and a card asked of them
      if (act.k === 'duel.accept') { const r = shared.duelMgr.accept(act.peer); if (!r.ok) tradeSay(r.why === 'try again' ? TRY_AGAIN_TEXT : `You cannot accept: ${r.why}.`); return; }   // DUEL1: not hub acts - the duel's own law
      if (act.k === 'duel.decline') { shared.duelMgr.decline(act.peer); return; }
      if (act.k === 'duel.yield') { shared.duelMgr.yieldDuel(); return; }
      if (act.k === 'trade.request') {   // TRADE1: not a hub act - two players in one room, so the host routes it to the trade manager (or, if they had asked first, accepts)
        const r = shared.tradeMgr.request(act.peer);
        if (!r.ok) tradeSay(r.why === 'try again' ? TRY_AGAIN_TEXT : `You cannot trade with them: ${r.why}.`);
        return;
      }
      const who = peerName(act.peer) ?? shared.social?.friends.get(act.acct)?.name ?? 'them';
      // false is the session's honest answer - no socket, or over SOCIAL_HZ_MAX (net/online.js sendSocial). A player
      // who pressed a button is owed a word either way - AUDIT SOC B17: the RIGHT word: "try again" when the gate
      // refused (the panel's own sentence, so the two surfaces agree), and "not connected" when there is no link open
      // to try again on, which "try again" would have lied about
      const hub = socialLink();
      const went = hub?.sendSocial(act) === true;
      shared.chatLog.push(tab.id, { text: went ? socialActText(act.k, who) : (hub?.status === 'open' ? TRY_AGAIN_TEXT : NOT_CONNECTED_TEXT), system: true });
    };
    // INSPECT1 (kurkku: "a profile page that you can bring up when you're near them"; Mac: "a new enhanced UI element for
    // the player inspect interaction"): the profile, made beside the F-menu it opens from and under its gate - the same
    // kind of pointer surface. Nothing stands over it: F with the profile up closes it (socialInteract), as a second F
    // closes the F-menu, so the two are never up at once.
    shared.touchFx ??= createTouchFx({
      doc: document, enhanced: () => isEnhanced(),
      play: (verb, involvesMe) => {
        const warm = ['hug', 'embrace', 'cuddle', 'hold', 'nuzzle', 'comfort', 'kiss', 'handkiss'], brisk = ['highfive', 'handshake', 'fistbump', 'bump', 'pat', 'headpat', 'poke', 'tickle', 'clap'];
        const v = involvesMe ? 0.5 : 0.22;
        if (warm.includes(verb)) audio.playOneShot(SOUND.MakePotion, v, verb === 'kiss' || verb === 'handkiss' ? 1.25 : 0.95);
        else if (brisk.includes(verb)) audio.playOneShot(SOUND.ButtonClick, v, 1);
        else if (verb === 'toast' || verb === 'cheer') audio.playOneShot(SOUND.GoldPieces, v, 1);
      },
    });
    emoteWheel = createEmoteWheel({
      doc: document, win: globalThis,
      canOpen: socialMenuCanOpen,
      onOpen: () => surfaceOpen('wheel'),
      onClose: () => surfaceClose('wheel'),
      onPick: (verb, peerId) => {
        const who = peerName(peerId);
        if (!who) { peerNote?.('They are no longer here.'); return; }
        chatSend('local', emoteText(verb, who) ?? '', 'local', { me: true });
      },
    });
    shared.profileWin = createProfileWindow({
      doc: document, win: globalThis,
      canOpen: socialMenuCanOpen,
      onOpen: () => surfaceOpen('profile'),
      onClose: () => { surfaceClose('profile'); shared._profileAsk = null; shared._profileSub = null; shared._profileView = null; },   // a card closed is a card no longer waited on
      onDuel: (peerId) => duelChallenge(peerId),   // DUEL1: the Challenge button (Mac: "When inspecting a player, they should be able to send an invite to duel")
      onWed: (peerId) => wedPropose(peerId),   // LEGACY7 part three: the Propose button
    });
    // DUEL1: the challenge at me - the newest standing one, with Accept and Decline (the F-menu's rows are the other way)
    shared.duelPrompt = createDuelPrompt({
      asks: () => { const a = shared.duelMgr.asks(); if (a?.length) noteFirstUse('duel'); return a; }, now: () => performance.now(), name: (id) => peerName(id) ?? 'Someone', touch: isTouchDevice(), doc: document,
      accept: (id) => { const r = shared.duelMgr.accept(id); if (!r.ok) tradeSay(r.why === 'try again' ? TRY_AGAIN_TEXT : `You cannot accept: ${r.why}.`); },
      decline: (id) => { shared.duelMgr.decline(id); },
    });
    // WAGONS1: a rider's ask for a seat in my wagon's back - the duel's strip, its own words
    shared.ridePrompt = createDuelPrompt({
      asks: () => shared.wagonRiders?.asks() ?? [], now: () => performance.now(), name: (id) => peerName(id) ?? 'Someone', touch: isTouchDevice(), doc: document,
      accept: (id) => { shared.wagonRiders?.accept(id); shared._hccDirty = true; }, decline: (id) => { shared.wagonRiders?.decline(id); shared._hccDirty = true; },
      line: (_peer, who) => RIDE_TEXT.asked(who), ttlMs: RIDE_ASK_TTL_MS, second: true,   // WAGONS2 (FINAL AUDIT): below the duel's strip, never over it
    });
    // JOURNAL1: the page window, beside the profile and under the same gate - the F-menu's 'Read their page' opens it
    // over a page held out to me (pageOffers), and F again puts it away (socialInteract). Keep files the page it shows
    // in my journal (keepPage).
    shared.pageWin = createPageWindow({
      doc: document, win: globalThis,
      canOpen: socialMenuCanOpen,
      onOpen: () => surfaceOpen('page'),
      onClose: () => surfaceClose('page'),
      onKeep: (peerId, view) => keepPage(peerId, view),
    });
  };
  let _noAccountSaid = false;   // AUDIT SOC B10: the no-account line goes on the tab once
  /** SOC5: the host's word on whether a menu may stand - the chat's own gate (chatStart's `canOpen`), because the two
   *  are the same kind of surface: a window over the HUD or a pause owns the keys and the mouse, and a card that
   *  opened under one would take clicks the window is owed. */
  const socialMenuCanOpen = () => !gamePaused() && !(townTalk.hudCovered || (shared.modes?.hudCovered ?? false));
  /** SOC5: a peer's name as the room knows it (net/online.js `peers`), or null - the card's heading and the chat
   *  line's subject. A peer with no name yet (the roster's `who` still in flight) is not nameless in the sentence:
   *  the caller falls back to the account's name and then to a word. */
  const peerName = (peerId) => (peerId ? (shared.online?.peers.get(peerId)?.name || null) : null);
  // TRADE1 (2026-09-21): PLAYER-TO-PLAYER TRADE. F on a body offers Trade beside Add friend and Invite to party; the peer
  // presses F on the asker to accept (the row reads 'Accept trade'), and a window in the enhanced skin opens for both.
  // Everything decisive lives in net/tradeSession.js (the state machine and the no-duplication law) and
  // systems/tradePack.js (the real pack); this block only connects them to this scene's socket, chat, overlay slot and peers.
  /** A trade line goes where every other social note goes - the hub's tab - or, with no chat up, on the screen. */
  const tradeSay = (text) => {
    const t = shared.chatLog?.tabs.find((x) => x.room === SOCIAL_ROOM);
    if (t) shared.chatLog.push(t.id, { text, system: true }); else townTalk.say(text);
  };
  /** TRADE RANGE IS METRES BETWEEN TWO BODIES (net/tradeSession.js TRADE_RANGE_M = 5), never a map pixel and never a relay
   *  room. `peersNear()` hands each peer's feet in THIS scene's frame in every mode (`onlineToScene`: the overworld's
   *  local frame, the interior's, the dungeon's own), and `player.feetAt()` is my own feet in the same frame (the reading the
   *  party-rest 15 m rule, distanceToPartyAccount, uses) - so the straight line between them is the answer wherever the two of us stand. A peer this host cannot
   *  place (no fresh pose, not in the roster) is NOT near: the measurement fails closed. */
  const tradeNear = (peerId) => {
    const p = peersNear()?.find((x) => x.id === peerId);
    return !!p && inTradeRange(player.feetAt(), p.feet, TRADE_RANGE_M);   // feetAt(): the same interpolated feet PARTY_REST_RADIUS's distanceToPartyAccount measures from - the port's one "where am I, in metres"
  };

  /** What the F-menu says about trading with this peer: nothing at all when the skin cannot draw the window. */
  const tradeActionsFor = (peerId) => {
    if (!shared.online || !playerTradeReady()) return {};
    if (!shared.online.tradeOk) return { canTrade: false, whyNotTrade: 'relay not updated' };   // an older relay closes the socket on a trade frame - it is never sent one
    if (!shared.online.reachesPeer(peerId)) return { canTrade: false, whyNotTrade: 'no link to them' };   // no open socket of mine reports them: the frame has nowhere to go (NOT a distance - metres are judged below)
    const far = { canTrade: false, whyNotTrade: `too far away (max ${TRADE_RANGE_M} m)` };
    switch (shared.tradeMgr.stateFor(peerId)) {
      case 'incoming': return tradeNear(peerId) ? { canTrade: true, tradeLabel: 'Accept trade' } : far;
      case 'outgoing': return { canTrade: false, whyNotTrade: 'request sent' };
      case 'active': return { canTrade: false, whyNotTrade: 'already trading' };
      case 'busy': return { canTrade: false, whyNotTrade: 'you are trading' };
      default: return tradeNear(peerId) ? { canTrade: true } : far;
    }
  };
  /** MERGE (INSPECT1 x ACT-MENU): ONE BAG OF ACTS FOR A PLAYER - what the hub says (friend, party), what the trade
   *  manager says, and the look (INSPECT1: a player standing in front of you can always be looked at). The F-card's
   *  rows, the plaque's verbs and the plaque's press all read this one bag, so the two surfaces offer the same rows
   *  through the one door (`peerAct`) - main's ACT-MENU law, which a bag built three times would drift from. */
  const peerActsFor = (peerId) => ({ ...shared.social.actionsFor(peerId), ...tradeActionsFor(peerId), canInspect: true, canReadPage: !!pageOffers.get(peerId), canEmote: !!emoteWheel, ...duelActionsFor(peerId) });   // DUEL1: and a challenge from them to answer, or our duel to yield   // JOURNAL1: and a page they hold out to me, while it waits
  /** The trade's frame: retries and timeouts, and the two things that end a live trade for free - the peer leaving (no open
   *  socket of mine reports them any more) and, inside tick(), the peer stepping past TRADE_RANGE_M metres (`near`). The
   *  range rule holds in the overworld, an interior and a dungeon alike now - the old overworld-only guard is gone with the
   *  pixel-shaped reach it measured. Runs before the death return so a dead player's trade is ended too. */
  const tradeFrame = () => {
    const s = shared.tradeMgr.session;
    if (s && (!shared.online || !shared.online.reachesPeer(s.peer))) shared.tradeMgr.peerGone(s.peer, 'left');
    shared.tradeMgr.tick();
  };

  /** A peer's body in THIS scene (peersNear's { id, feet, height }), or null. */
  const duelBody = (peerId) => (peerId ? (peersNear()?.find((x) => x.id === peerId) ?? shared.siegeNpcs?.body(peerId) ?? null) : null);   // SEAT2b part two (c): or one of a siege's relay-run fighters
  /** AUDIT SEATS-3 C3: duelBody's answer over a peer list the caller read ONCE (peersNear walks the room and mints a body
   *  per peer) - a battle's sweeps ask it per foe, every frame. */
  const duelBodyIn = (near, peerId) => (peerId ? (near?.find((x) => x.id === peerId) ?? shared.siegeNpcs?.body(peerId) ?? null) : null);
  /** A peer's feet in the WORLD frame - their pose's own (net/online.js `shown`) - or null. */
  const duelWorldOf = (peerId) => { const q = peerId ? shared.online?.peers.get(peerId)?.shown : null; return q && Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z) ? [q.x, q.y, q.z] : null; };
  /** Can I duel now: null, or the wire's word for why not. OUTDOORS ONLY (Mac's answer): the streaming world's exterior,
   *  never a building or a dungeon; alive; on a relay that carries the frame. */
  const duelCan = () => {
    if (playerEntity.health <= 0 || shared.modes?.deathUp?.()) return 'dead';
    if ((shared.modes?.mode ?? 'exterior') !== 'exterior') return 'outdoors';
    if (!shared.online || shared.online.status !== 'open' || !shared.online.duelOk) return 'busy';
    return null;
  };
  /** DUEL_RANGE_M between two BODIES, the trade's own measure (metres, never a pixel or a room). */
  const duelNear = (peerId) => { const b = duelBody(peerId); return !!b && tradeDistance(player.feetAt(), b.feet) <= DUEL_RANGE_M; };

  let _duelLastWeapon = null;    // INT8: the weapon of my last strike - the referee's word on it names no number

  // AUDIT LEGACY III W3: and never while lying dead - an Enduring death in the temple, its rise still to come, wed (the
  // duel's own law, duelCan's 'dead'; a wedding has no word of its own for it, so 'busy')
  // FIELD BUGS 2026-10-08 (Sahh: two Enduring or two Bloodlines characters "cannot seem to marry each other" - the
  // button grey everywhere): wedRefusal answers NULL when the one played may wed, and `?? 'house'` read that null as
  // no house - every character refused, at every temple, and every proposal and answer with it. 'house' only for no host.
  const wedCan = () => (playerEntity.health <= 0 || shared.modes?.deathUp?.() ? 'busy'
    : shared.online?.status === 'open' && shared.online.wedOk ? (shared.legacyHost ? shared.legacyHost.wedRefusal() : 'house') : 'busy');
  /** The proposal at me on the town's Yes/No box (the window it stands for, so a proposal taken back closes it). */
  let _wedBox = null;
  let _wedBoxPeer = null;
  const wedAsk = (peerId) => {
    // under another window: the card's button answers it - the street's, AUDIT LEGACY III W3: or the building's own (the
    // temple's pause, its death, its windows - `modes.overlayHeld`), as a notice waits (showNotice)
    if ((townTalk.overlayActive && !townTalk.overlayDone) || (shared.modes?.overlayHeld ?? false) || (shared.modes?.deathUp?.() ?? false)) return false;
    const p = shared.online?.peers.get(peerId);
    const house = p?.house ? houseLine(p.house) : null;
    _wedBoxPeer = peerId;
    _wedBox = new YesNoBoxWindow({
      rows: [`${peerName(peerId) ?? 'Someone'}${house ? `, ${house},` : ''} asks for your hand,`, 'here before the gods. Be wed?'],
      onYes: () => { _wedBox = null; _wedBoxPeer = null; shared.wedMgr.accept(peerId).then((r) => { if (!r.ok && r.why === 'gone') tradeSay('That proposal no longer stands.'); }); },
      onNo: () => { _wedBox = null; _wedBoxPeer = null; shared.wedMgr.decline(peerId); },
    });
    townTalk.showOverlay(_wedBox);
    return true;
  };
  const wedUnask = (peerId) => {
    if (_wedBoxPeer !== peerId || !_wedBox) return;
    townTalk.closeOverlay(_wedBox);
    _wedBox = null; _wedBoxPeer = null;
  };

  /** The Inspect card's Propose button, as the law says it now - shown only to a realm character playing a house. */
  const wedButtonFor = (peerId) => {
    if (!shared.online || !peerId || !realmSession || !legacyOn()) return null;
    const label = 'Propose marriage';
    if (!shared.online.wedOk) return { label, enabled: false, why: 'The server does not support weddings yet.' };
    const st = shared.wedMgr.stateFor(peerId);
    if (st === 'incoming') return { label: 'Answer their proposal', enabled: true };
    if (st === 'outgoing') return { label: 'Proposal sent', enabled: false, why: 'Waiting for their answer.' };
    if (st === 'waiting') return { label: 'Before the altar', enabled: false, why: 'The temple\'s book is being written.' };
    if (st === 'busy') return { label, enabled: false, why: 'Another proposal stands.' };
    const no = wedCan();
    if (no) return { label, enabled: false, why: wedMineText(no) };
    if (!shared.online.peers.get(peerId)?.house) return { label, enabled: false, why: wedWhyText('house') };
    if (!shared.online.reachesPeer(peerId)) return { label, enabled: false, why: 'No link to them.' };
    return { label, enabled: true };
  };
  /** The card's press: their proposal answered on its box, or mine sent - the law asked again first. */
  const wedPropose = (peerId) => {
    if (shared.wedMgr.stateFor(peerId) === 'incoming') { shared.profileWin?.hide(); if (!wedAsk(peerId)) tradeSay('Close the window you have open, then answer.'); return; }
    const r = shared.wedMgr.request(peerId);
    if (!r.ok) tradeSay(r.why === 'link' ? TRY_AGAIN_TEXT : r.why === 'sent' ? 'Your proposal stands. Wait for their answer.' : wedMineText(r.why));
    shared.repaintDuelProfile();
  };

  /** The wedding's frame: the handshake's clock, a proposal with a player whose row is gone dropped, the unions read. */
  const wedFrame = () => {
    shared.wedMgr.tick();
    for (const p of shared.wedMgr.peers()) if (!shared.online?.reachesPeer(p)) shared.wedMgr.gone(p);
    if (performance.now() - shared._unionsAt > shared.UNIONS_READ_MS) legacyUnionsRead();
  };
  /** INT8: THE DUEL'S HUD - the referee's vitality (net/duel/duelRef.js: the Royal Tourney's, never my save's health), mine
   *  over theirs, drawn on the battles' readout (ui/siegeHud.js) for the duel's life; its Leave is my yield. */
  let _duelHud = null;
  const duelHudSay = (d) => {
    if (!d) { _duelHud?.hide(); return; }
    _duelHud ??= createSiegeHud(document, { onLeave: () => shared.duelMgr.yieldDuel() });
    const me = shared.online?.id ?? '', h = d.h ?? [];
    const mine = h.find((x) => x[0] === me), theirs = h.find((x) => x[0] !== me);
    const name = peerName(d.peer) ?? 'your opponent';
    _duelHud.update({ bar: [`Duel with ${name}`, theirs ? `${name}: ${theirs[1]} / ${theirs[2]}` : 'The referee sets the bout...'], sides: '', self: mine ? [`Your vitality: ${mine[1]} / ${mine[2]}`] : [], works: '', arms: null, card: null });
  };
  /** THE ATTACKER: my blow out - INT8: rolled on my own sheet against the neutral stand-in (AUDIT C&C H5: a body of my
   *  own sheet cancelled every attribute I brought and charged me for my own luck; the target's sheet is not mine to
   *  read), the number sent for the RELAY to referee (net/duel/duelRef.js clips it to the weapon my look holds and the arms
   *  my token signs). A swing that rolled nothing is a miss, said here; the referee's word on one that landed comes
   *  back as `duelHpIn`. */
  const duelStrikeOut = (by, weapon, swing, drawMs = 0, to = null, { off = false } = {}) => {   // TWO-HANDS (AUDIT): `off` - the striking rig's off-hand blow
    if (!shared.duelMgr.fighting) return siegeStrikeOut(to, by, weapon, swing, drawMs, { off });   // AUDIT-SEATS G5: outside a duel, my shaft on a battle's foe (`to`)
    const a = withoutFirmament(playerEntity, () => duelAttackerOf(playerEntity, weapon)), w = duelWeaponOf(weapon), sw = duelSwingOf(swing);
    const at = drawMs > 0 ? { at: Math.min(60000, Math.trunc(drawMs)) } : {};
    const r = resolveDuelStrike({ by, a, ...(w ? { w } : {}), ...(sw ? { sw } : {}), ...at, ...(off ? { off } : {}) }, duelStandIn(playerEntity));
    if (!(r.dmg > 0)) { reportPlayerAttack({ hit: false, damage: 0, critical: false, backstab: false, ineffective: false }); return true; }
    const n = shared.duelMgr.blow('strike', { by, p: campToWire(player.feetAt()), d: Math.trunc(r.dmg), ...(w ? { w } : {}), ...(sw ? { sw } : {}), ...at });
    if (n) { shared._duelSent.set(n, { kind: 'strike', weapon }); _duelLastWeapon = weapon ?? null; if (shared._duelSent.size > 64) shared._duelSent.delete(shared._duelSent.keys().next().value); }
    return !!n;
  };
  /** My spell reached my opponent (the cast engine's duel marks, scenes/hostMagic.js): INT8 - its harm counted on the
   *  neutral stand-in (combat/siegeCombat.js siegeSpellNumbers, a siege's way - AUDIT C&C H5), to the referee as a cast. */
  const duelSpellOut = (peerId, sp) => {
    if (!shared.duelMgr.fighting) return siegeSpellOut(peerId, sp);   // AUDIT-SEATS G5: outside a duel, my spell on a siege's foe
    if (peerId !== shared.duelMgr.opponent) return false;
    const { harm } = withoutFirmament(playerEntity, () => siegeSpellNumbers(sp, Math.max(1, Math.trunc(playerEntity.level || 1)), duelStandIn(), playerEntity));
    if (!(harm > 0)) return false;
    const n = shared.duelMgr.blow('spell', { p: campToWire(player.feetAt()), d: siegeCastClamp(harm, false) });
    if (n) { shared._duelSent.set(n, { kind: 'spell', weapon: null }); if (shared._duelSent.size > 64) shared._duelSent.delete(shared._duelSent.keys().next().value); }
    return !!n;
  };
  /** The melee arm, offered my swing BEFORE the ladder's pools: my opponent's capsule within a weapon's reach, in view
   *  and in sight - the foes' own test (exteriorFoes.js resolvePlayerHit's canSee). True when the strike left. */
  const duelMeleeHit = (eye, inViewFn) => {
    if (!shared.duelMgr.fighting) return siegeMeleeHit(eye, inViewFn);   // SEAT2a part four: outside a duel, a siege's foe takes the arm's place
    const b = duelBody(shared.duelMgr.opponent);
    if (!b) return false;
    const c = [b.feet[0], b.feet[1] + (b.height ?? CAPSULE_HEIGHT) / 2, b.feet[2]];
    const dx = c[0] - eye[0], dy = c[1] - eye[1], dz = c[2] - eye[2];
    const dist = Math.hypot(dx, dy, dz), l = dist || 1;
    const wall = collider.raycast(eye, [dx / l, dy / l, dz / l], dist);
    if (!playerMeleeCanHit(dist, !!inViewFn?.(c), !Number.isFinite(wall) || wall >= dist - 1e-3)) return false;
    return duelStrikeOut('melee', weaponRig.playerWeapon.strikingWeapon, weaponRig.playerWeapon.machine?.state, 0, null, { off: weaponRig.playerWeapon.offStrike });
  };

  /** My opponent's body as the arrows' target list takes one (arrowFlight.js foeTargets) - [] outside a fight.
   *  AUDIT-SEATS G5: outside a duel, a battle's foes - each marked a duel's, so a foe's shaft stops on them dealing
   *  nothing and mine is a blow to the referee (`id`, through duelStrikeOut). */
  const duelArrowTargets = () => {
    if (!shared.duelMgr.fighting) {
      const bodies = battleFoeBodies(shared.royalSession?.active() ? shared.royalSession : shared.siegeSession);
      return bodies.length ? bodies.map((b) => ({ feet: b.feet, ref: { duel: true, id: b.id, dead: false, ai: { feet: b.feet, height: b.height ?? CAPSULE_HEIGHT } } })) : shared.wildArrowTargets();   // WILD1: no battle - the open zone's fair players
    }
    const b = duelBody(shared.duelMgr.opponent);
    return b ? [{ feet: b.feet, ref: { duel: true, id: b.id, dead: false, ai: { feet: b.feet, height: b.height ?? CAPSULE_HEIGHT } } }] : [];
  };

  /** INT8: THE REFEREE'S WORD THAT A BLOW LANDED (`dref` `hp`) - the bout's vitality on the HUD and my opponent's on the
   *  target bar; a blow of mine: the HUD's number (HN1's seam), and for a strike the sound, the blood and my weapon's wear
   *  (FormulaHelper's DamageEquipment attacker half, on what the referee let land, never past what this weapon could
   *  deal); a blow on me: its flash, its sound and my voice - my save's health untouched (a duel is the referee's bar). */
  const duelHpIn = (g) => {
    const d = shared.duelMgr.duel;
    if (!d) return;
    duelHudSay(d);
    const theirs = (g.h ?? []).find((x) => x[0] === d.peer);
    if (shared._duelFoe && theirs) { shared._duelFoe.entity.health = theirs[1]; shared._duelFoe.entity.maxHealth = theirs[2]; }
    const mine = g.by === (shared.online?.id ?? '');
    if (mine) {
      if (shared._duelFoe) markFoeStruck(shared._duelFoe);
      reportPlayerAttack({ hit: true, damage: g.d, critical: false, backstab: false, ineffective: false });
      const b = duelBody(d.peer);
      if (g.r !== DUEL_REF_KIND.Spell && b) {
        audio.play3d(hitSoundFor(_duelLastWeapon), b.feet, ENEMY_HIT_VOLUME, { maxDistance: 16 });
        (shared.modes?.liveHitEffects?.() ?? hitEffects).showBloodSplash(0, [b.feet[0], b.feet[1] + (b.height ?? CAPSULE_HEIGHT) / 2, b.feet[2]], null, bloodHit(g.d, { maxHealth: theirs?.[2] ?? 1 }, { fromPlayer: true, weapon: _duelLastWeapon }));   // PVP-BLOOD: the pool I stand in, as a peer's blow
      }
      if (g.r !== DUEL_REF_KIND.Spell && _duelLastWeapon) {
        let amount = Math.trunc((10 * duelWearDamage(g.d, _duelLastWeapon, playerEntity) + 50) / 100);   // AUDIT DUEL1 A2: never past what this weapon could deal
        if (amount === 0 && Math.random() < 0.2) amount = 1;
        if (amount > 0) lowerCondition(_duelLastWeapon, dfuBlowWear(amount), playerEntity, (l) => townTalk.say(l));   // BALANCE1: a duel's blow wears on the port's scale too; WEAR-TWICE: twice DFU's, WEAR-ONE: DFU's again
      }
      return;
    }
    if (g.to === (shared.online?.id ?? '') && g.d > 0) {
      if (g.r !== DUEL_REF_KIND.Spell) audio.playOneShot(hitSoundFor(null), PLAYER_HIT_VOLUME);
      flashPlayerDamage(g.d);
      playPlayerVoice(audio, playerPainVoice(playerEntity, g.d));
    }
  };
  /** The duel is over here. The ring comes down (the wall fades), the target bar and the HUD go, and the Inspect card, if it
   *  stands for either of us, reads the record again - INT8: the record is the relay's receipt (onReceipt), never a loss of
   *  mine reported. */
  const duelEnded = (duel) => {
    if (shared._duelWall) shared._duelWall.live = false;
    if (shared._duelFoe) { shared._duelFoe.dead = true; shared._duelFoe = null; }
    duelHudSay(null);
    if (duel.sub) shared.duelRecords.forget(duel.sub);
    shared.repaintDuelProfile();
  };

  /** AUDIT DUEL1 D5: the player is leaving the game - every duel state ends here (duelSession.js reset: a live duel as
   *  `left`, my asks taken back, the asks at me refused). INT8: no heal - a duel never touched the save's health. */
  const duelLeaveNow = () => { shared.duelMgr.reset(); };

  /** The duel's rows on a peer (ui/socialMenu.js): 'Accept duel' + 'Decline duel' while their challenge waits, 'Yield the
   *  duel' while we fight - nothing else (the challenge itself is the Inspect card's). */
  const duelActionsFor = (peerId) => {
    if (!shared.online) return {};
    const st = shared.duelMgr.stateFor(peerId);
    if (st === 'incoming') {
      const why = duelCan() === 'outdoors' ? 'a duel is fought outdoors' : !duelNear(peerId) ? `too far away (max ${DUEL_RANGE_M} m)` : null;
      return { duelRow: { label: 'Accept duel', k: 'duel.accept', enabled: !why && !duelCan(), why: why ?? 'not now' }, canDeclineDuel: true };
    }
    if (st === 'live') return { duelRow: { label: 'Yield the duel', k: 'duel.yield', enabled: true } };
    return {};
  };
  /** The Inspect card's Challenge button, as the law says it now: the label and whether it can go (and why not). */
  const duelButtonFor = (peerId) => {
    if (!shared.online || !peerId) return null;
    if (!shared.online.duelOk) return { label: 'Challenge to a duel', enabled: false, why: 'The server does not support duels yet.' };
    const st = shared.duelMgr.stateFor(peerId);
    if (st === 'incoming') return { label: 'Accept duel', enabled: !duelCan() && duelNear(peerId), why: duelCan() === 'outdoors' ? 'A duel is fought outdoors.' : `Stand within ${DUEL_RANGE_M} m of them.` };
    if (st === 'outgoing') return { label: 'Challenge sent', enabled: false, why: 'Waiting for their answer.' };
    if (st === 'live' || st === 'waiting') return { label: 'Duelling', enabled: false, why: null };
    if (st === 'busy') return { label: 'Challenge to a duel', enabled: false, why: 'You are already in a duel.' };
    const no = duelCan();
    if (no === 'outdoors') return { label: 'Challenge to a duel', enabled: false, why: 'A duel is fought outdoors.' };
    if (no === 'dead') return { label: 'Challenge to a duel', enabled: false, why: 'You have fallen.' };
    if (no) return { label: 'Challenge to a duel', enabled: false, why: 'Not connected.' };
    if (!shared.online.reachesPeer(peerId)) return { label: 'Challenge to a duel', enabled: false, why: 'No link to them.' };
    if (!duelNear(peerId)) return { label: 'Challenge to a duel', enabled: false, why: `Stand within ${DUEL_RANGE_M} m of them.` };
    return { label: 'Challenge to a duel', enabled: true };
  };
  /** The Inspect card's press: the law asks again before anything is sent (the button may be a moment old). */
  const duelChallenge = (peerId) => {
    // CROWN1 part two: in a Royal Tourney the card's Challenge is the tourney's - an accept where they challenged me first
    if (shared.royalSession?.active()) { if (!shared.royalSession.challenge(peerId)) tradeSay('You cannot challenge them now.'); shared.repaintDuelProfile(); return; }
    const r = shared.duelMgr.request(peerId);
    if (!r.ok) tradeSay(r.why === 'try again' ? TRY_AGAIN_TEXT : `You cannot duel them: ${r.why}.`);
    shared.repaintDuelProfile();
  };

  /** The duel's frame: the law's lapses, retries and ends, then the ring - the motor's clamp for my own body while a
   *  duel is live, in THIS scene's frame from the world frame every frame (a floating-origin shift moves the scene, not
   *  the ring) - and the prompt's countdown. Runs before the death return, so a dead duellist's duel ends. */
  const duelFrame = () => {
    shared.duelMgr.tick();
    if (shared.duelClaims.due()) shared.duelClaims.offer();   // INT8: a bout's receipt the service has not settled yet, offered again on its wait
    const setsWere = setsDueling();
    setSetsDueling(!!shared.duelMgr.live || shared.arenaPvpLive());   // SET2: a duel (its countdown too) - every set sleeps while it stands (systems/sigil/sigilSets.js); AUDIT 625 P2: and a bout between players
    if (setsDueling() !== setsWere) computeEntityMods(playerEntity);   // SET3: the stat tiers leave with the duel's first frame and return with its last
    // my ring rose or fell: the onlookers hear it on the next frame - in a CELL room, the only one whose foes frame carries
    // it (AUDIT DUEL1 C1: a duel ended in a dungeon left every one of that room's frames forced full)
    if (shared.online && isCellRoom(shared.online.room) && (shared.duelMgr.live?.s ?? null) !== _duelRingSaid) shared._foesFullAt = -Infinity;
    const live = shared.duelMgr.live;
    player.arena = live && (shared.modes?.mode ?? 'exterior') === 'exterior' ? { centre: campToScene(live.c), radius: DUEL_RADIUS_M } : null;
    // CROWN1 part two: a Royal Tourney's bout holds me in its ring (the relay pulls a step past it back as well)
    const royalRing = !player.arena && (shared.modes?.mode ?? 'exterior') === 'exterior' ? shared.royalSession?.ring() : null;
    if (royalRing) player.arena = { centre: campToScene([royalRing.centre[0], campToWire(player.feetAt())[1], royalRing.centre[1]]), radius: royalRing.radius };
    // WB3b: the court's floor is a ring the body cannot leave - WB9b: the three courts' floor, as far as the walkways
    // between them are laid (one arena, its crossings and clock refilled each frame)
    if (!player.arena && shared.modes?.gateArenaDay?.() != null) player.arena = courtArenaAt(shared._courtArena, shared.gateLink?.state()?.xa ?? shared._gateFloor.none, Date.now() + shared._sharedOffsetMs, shared.modes?.gateArenaDay?.());   // WB9b: the one arena refilled a frame; WB14b: and the night whose plan holds me (world/gate/gateArena.js courtArenaAt)
    if (!player.arena && shared.modes?.sdRealmSlot?.() != null) player.arena = sdArenaHeld() ? shared._realmArenaHeld : sdConcordHere() ? shared._realmArenaBridged : shared._realmArena;   // AUDIT SD III (F2): standing in it, joined to its living fight, the arena's rim holds me   // SD5a: the Hour's floors are an edge the body cannot leave - the void under them; SD6c: with the Concord, the bridge and the first step among them
    if (!player.arena) player.arena = arenaBouts.ring(); if (!player.arena) { const s = shared.arenaOnline?.session?.(); player.arena = standsRail(shared.modes?.arenaFloorStage?.()?.centre?.() ?? null, player.feetAt()[1], !!s && (s.state ? s.state.h === 1 : !!s.host)); }   // ARENA2: my bout's ring on the arena's sand (the duel's clamp); HOTFIX 1003i: else the stands' rail - no watcher jumps down onto the sand (the session's host may)
    shared.duelPrompt?.render();
  };
  /** DUEL1: THE RING I DUEL IN, FOR THE ONLOOKERS, on my foes frame (validRingRecord's shape): on every FULL frame while it
   *  stands (a joiner learns it within FOES_FULL_MS) and once more, as null, when it comes down; a frame without it leaves
   *  the last word standing (the HCC's law). A change forces the next frame full (duelFrame). */
  const duelRingWord = (frame, full) => {
    const d = shared.duelMgr.live;
    const key = d?.s ?? null;
    if (!full || (key === null && _duelRingSaid === null)) return;
    frame.du = d ? { s: d.s, c: d.c, p: d.peer } : null;
    _duelRingSaid = key;
  };
  /** The rings to draw this frame, in THIS scene's frame (the wall's uniforms): my own - rising in over 0.6 s from the
   *  start, dying away over 1.2 s from the end - and the others' still fresh, each duel once. */
  const duelRingsNow = (dt) => {
    const out = [], seen = new Set();
    const w = shared._duelWall;
    if (w) {
      w.alpha = w.live ? Math.min(1, w.alpha + dt / 0.6) : Math.max(0, w.alpha - dt / 1.2);
      if (!w.live && w.alpha <= 0) shared._duelWall = null;
      else { out.push({ centre: campToScene(w.c), radius: DUEL_RADIUS_M, alpha: w.alpha }); seen.add(w.s); }
    }
    const t = performance.now();
    for (const [id, e] of _duelRings) {
      if (t - e.at > DUEL_RING_STALE_MS) { _duelRings.delete(id); continue; }
      if (seen.has(e.rec.s)) continue;
      seen.add(e.rec.s);
      out.push({ centre: campToScene(e.rec.c), radius: DUEL_RADIUS_M, alpha: 0.85 });
    }
    // CROWN1 part two: a Royal Tourney's ring, while I am entered - before the castle, at my own feet's height
    const rc = shared.royalSession?.ringCentre();
    if (rc) out.push({ centre: campToScene([rc[0], campToWire(player.feetAt())[1], rc[1]]), radius: DUEL_RADIUS_M, alpha: 0.85 });
    return out;
  };
  /** SOC5: the line that goes on the world tab when an act LEFT. The hub writes no chat line (SOC1); the client puts
   *  words to what it did, exactly as net/social.js noteText does for what it was told. */
  /** AUDIT SOC B17: the F-menu's word when no link is open to act on - "try again" would have promised a second try. */
  const NOT_CONNECTED_TEXT = 'You are not connected';
  /** AUDIT SOC B10: the line on the world tab when there is no account to be anyone by. */
  const NO_ACCOUNT_TEXT = 'Friends and parties are off because this browser keeps no storage';
  const socialActText = (k, who) => (k === 'friend.request' ? `Friend request sent to ${who}`
    : k === 'party.invite' ? `Party invite sent to ${who}`
      : k === 'friend.remove' ? `${who} is no longer your friend` : 'Sent');

  // AUDIT (the pre-merge audit, P1): never the DEEP's (`managed`) - the sea's foes are its spawner's, released with
  // their pixel; an heir took them as plain foes nothing counted, stood its own full sea beside them once elected, and
  // a third player saw only a plain foe's allowance of them. They stay the stander's, as a watchman goes with his own.
  // (AUDIT pre-merge Q3: a quest's foe kept on a partner's word goes to the party alone, as the quest's own does.)
  // AUDIT NAV2 F12: nor a body on a deck - a boarding's, shared with the room now, goes with its boarder (all three
  // handovers): an heir stood her men as plain foes on a deck with no leash and no boarding
  const handOverFoes = () => {
    const near = shared.online?.room && isCellRoom(shared.online.room) && (shared.modes?.mode ?? 'exterior') === 'exterior' ? (peersNear() ?? []) : [];
    if (!near.length) return 0;
    const heirOf = (f) => { if (f.entity?.team === 'PlayerAlly' || f.managed || f.deckBoat != null) return null; const at = f.ai?.feet; if (!at) return null; let id = null, best = f.site ? CAMP_CULL_DISTANCE : Infinity; for (const q of near) { if ((isPrivateQuestFoe(f) || f._keptTag) && !shared.social?.isPartyPeer(q.id)) continue; const d = Math.hypot(at[0] - q.feet[0], at[2] - q.feet[2]); if (d < best) { best = d; id = q.id; } } return id; };   // QUEST-PARTY phase 2: a shared quest's foe goes to a party member alone (CURSE-SYNC: a world quest's to anyone, as an encounter's); SUMMON-SYNC: and my ALLY to nobody - it goes with its summoner (the record carries no side, so an heir stood it as everyone's foe); AUDIT WB12d (C3): a site's foe (a shared camp's, the faithful) to a player within a camp's cull distance of it alone - a far heir took a camp it stood nowhere near
    return exteriorFoes.handOver(heirOf, (frame) => shared.online.sendFoes(frame));
  };
  /** AUDIT WB12d (C2): A SITE'S FOES OUTLIVE ITS OWNER'S TELEPORT - a shared camp's and the faithful's (WOD7's `site`) go to
   *  the player nearest each, within a camp's cull distance of it, on one last own frame before a teleport's sweep or
   *  the page's going takes my pools down (the door's and the death's handover, handOverFoes, for these alone). What
   *  nobody near takes goes with me; a circle stands its survivors again for whoever comes (scenes/riteHost.js).
   *  Answers how many went. */
  const handOverSiteFoes = () => {
    try {
      const near = shared.online?.room && isCellRoom(shared.online.room) && (shared.modes?.mode ?? 'exterior') === 'exterior' ? (peersNear() ?? []) : [];
      if (!near.length) return 0;
      const heirOf = (f) => {
        if (!f.site || f.puppet || f.dead || f.managed || f.deckBoat != null || f.entity?.team === 'PlayerAlly') return null;
        const at = f.ai?.feet;
        if (!at) return null;
        let id = null, best = CAMP_CULL_DISTANCE;
        for (const q of near) { const d = Math.hypot(at[0] - q.feet[0], at[2] - q.feet[2]); if (d < best) { best = d; id = q.id; } }
        return id;
      };
      if (!exteriorFoes.foes.some((f) => heirOf(f))) return 0;
      const n = exteriorFoes.handOver(heirOf, (frame) => shared.online.sendFoes(frame));
      if (n) console.info(`[foes] handed ${n} camp foe(s) on leaving`);
      return n;
    } catch (e) { console.warn('[foes] the camps\' handover', e?.message ?? e); return 0; }   // the sweep, or the leave, goes on
  };
  // OW6 (2026-09-29, the player: "Everything needs that persistence between players in the overworld"): A FOE ITS OWNER
  // WALKS AWAY FROM GOES TO THE PLAYER BESIDE IT. A camp stood by me and fought by a friend stood until I was its cull
  // distance off (DROPS-AUDIT CAMP-CULL: 200 m, a wanderer 120) - then it was culled from under them, and gone for
  // everyone, its mark with it. Past three quarters of that from me, with a player nearer it than I am, it is handed to
  // them - the door's own handover (PDEATH-FOES: the heir named on my frame, taken there), foe by foe - and they stream it
  // from there, a camp still a camp (world/campShared.js). Nobody nearer, the cull takes it as it always did. Never my
  // ally, a mod's placed or managed foe, or a quest's (a quest's foe is handed at the door, to its party alone).
  const FOE_WALK_AWAY_MS = 500;
  const FOE_WALK_AWAY_SHARE = 0.75;

  const foeWalkAwayM = (f) => FOE_WALK_AWAY_SHARE * (f.campId != null ? CAMP_CULL_DISTANCE : ENCOUNTER_CULL_DISTANCE);
  function handOverWalkedAway(now) {
    if (now - shared._walkAwayAt < FOE_WALK_AWAY_MS) return 0;
    shared._walkAwayAt = now;
    if (!shared.online?.room || !isCellRoom(shared.online.room) || (shared.modes?.mode ?? 'exterior') !== 'exterior' || !shared.playerSpawned) return 0;
    const near = peersNear() ?? [];
    if (!near.length) return 0;
    const me = player.feetAt();
    const heirOf = (f) => {
      if (f.puppet || f.dead || f.placed || f.managed || f.deckBoat != null || f.entity?.team === 'PlayerAlly' || isPrivateQuestFoe(f) || f._keptTag) return null;
      const at = f.ai?.feet;
      if (!at) return null;
      const mine = Math.hypot(at[0] - me[0], at[2] - me[2]);
      if (mine < foeWalkAwayM(f)) return null;
      let id = null, best = mine;
      for (const q of near) { const d = Math.hypot(at[0] - q.feet[0], at[2] - q.feet[2]); if (d < best) { best = d; id = q.id; } }
      return id;
    };
    if (!exteriorFoes.foes.some((f) => heirOf(f))) return 0;
    return exteriorFoes.handOver(heirOf, (frame) => shared.online.sendFoes(frame));
  }
  /** QUEST-PARTY phase 3b/3c: AUDIT CONTRIB P1's handover in a world room - at a building's or a dungeon's door out and
   *  at a death in it, my live own foes there go to the players who stay (a shared quest's to a party member alone),
   *  named on one last own frame; what nobody took goes with me, as the room's teardown takes it. Answers how many went. */
  const handOverRoomFoes = () => {
    const m = shared.modes?.mode ?? 'exterior';
    const near = shared.online?.room && isWorldRoom(shared.online.room) && shared.online.ownOk && (m === 'interior' || m === 'dungeon') ? (peersNear() ?? []) : [];
    if (!near.length) return 0;
    const heirOf = (f) => { if (f.entity?.team === 'PlayerAlly' || f.deckBoat != null) return null; const at = f.ai?.feet; if (!at) return null; let id = null, best = Infinity; for (const q of near) { if ((isPrivateQuestFoe(f) || f._keptTag) && !shared.social?.isPartyPeer(q.id)) continue; const d = Math.hypot(at[0] - q.feet[0], at[2] - q.feet[2]); if (d < best) { best = d; id = q.id; } } return id; };   // SUMMON-SYNC: my ally goes with me, as outside
    const frame = shared.modes?.ownHandOverFrame?.(heirOf);
    return frame && shared.online.sendOwnFoes(frame) ? (shared.modes?.dropOwnHanded?.() ?? 0) : 0;
  };

  // SRV-N (Mac: "a server restart notice whenever we push server
  // updates. Like a notice that pushes in the chat window"): A NOTICE
  // GOES ON EVERY TAB. A relay restart and a new build are not a room's
  // events - they happened to the whole game - so a player reading the
  // one tab they had open must not have to guess which channel the news
  // landed on. Today that is the World tab alone; a later row in
  // CHAT_TABS gets it for free, which is the point of iterating.
  const chatNotice = (text) => {
    // Not a dead guard, and the distinction is one this port paid for two
    // days ago (AUDIT-MACL, `pauseOpts`): nothing nulls `chatLog` today,
    // but the build poll's arm fires from a `.then` MINUTES later, and a
    // throw there is an unhandled rejection - which main.js turns into
    // the red crash overlay. The relay's arm is contained by
    // `_deliver`; this one is not, so it carries its own door.
    if (!shared.chatLog) return;
    shared.chatLog.pushAll({ text });   // CHAT-CHAN: ONE line kept on every tab - peeked once, counted once (net/chat.js pushAll)
  };
  // PARTY-REST15 (2026-09-22): `broadcastPartyRestVote` (Updates 11-14) used to live here, sending the tally
  // over `link.sendChat` - removed after confirmed live testing showed this made the message play as a real
  // chat line, including `ui/nameLayer.js`'s BUBBLE1 speech-bubble treatment over the sender's own character.
  // See `_partyRestVoteTrackTick`'s own doc comment (this file, above) for the replacement: every near
  // member's own client now watches the shared pose data and pushes its own local, bubble-free `chatNotice`.
  // AUDIT SCALE II C-2: A RELAY THAT KEEPS NO SHARDS (rolled back, or one before them) refuses a shard's key at its door, so
  // every channel link standing on one - a page that remembered the shards, or a link whose relay just went back - goes
  // to its channel now, which keeps it, rather than waiting out two misses (or, before the miss read the socket's own
  // word, for ever in a browser). A link its own shard has welcomed stays: its own relay keeps them
  const channelLinksOffShards = () => { for (const link of shared.chatLinks?.values?.() ?? []) if (isChannelShard(link.room) && !link.welcomed) link.join(channelOf(link.room)); };
  // SCALE5c: and whether the relay keeps the hub's shards, remembered for the next page (`channelLinkRoom`) - AUDIT SCALE II
  // C-2: under this relay's own key, and a relay without them takes the links off their shards
  const onRelayVersion = (v) => { const keeps = hubShardsSupported(v); try { appStorage()?.setItem?.(hubShardsSeenKey(), keeps ? '1' : '0'); } catch { /* storage refused: the hub itself says it again */ } if (!keeps) channelLinksOffShards(); shared._relayKeepsRite = relaySupportsRite(v); shared._relayKeepsCage = relaySupportsCage(v); if (relayVersionSeen(v) === 'changed') chatNotice(relayRestartText()); };   // AUDIT BROKER-CAGE C4, C6: and whether it keeps the rite and the cage
  // SRV-N: THE BUILD POLL. The relay moves by hand and rarely; the client
  // moves on every merge, which is what "whenever we push" actually is
  // for this project. Nothing tells a tab held open across a deploy that
  // it is now running code we have replaced - it finds out when a lazy
  // chunk 404s and systems/staleChunk.js reloads it out from under the
  // player. So ask the site, on the site's own rhythm rather than the
  // frame's, and let the player choose the moment.
  let _buildPolledAt = 0;
  const buildPoll = (now) => {
    // The FIRST poll waits a full interval too, measured from the PAGE's
    // load (`performance.now()`'s origin) rather than the chat's start: a
    // tab that has only just loaded is by definition current, and asking
    // at boot would put every player's page load on the CDN twice for an
    // answer we already know.
    //
    // AUDIT-SRVN F3: there was a second `_buildPolling` boolean here, and
    // it was BOTH redundant and a hazard. Redundant because the stamp is
    // taken when the poll STARTS, so this line already refuses a second
    // one for a full interval; a hazard because a request that never
    // settles left the flag raised and the poll dead for the rest of the
    // session. One gate that heals itself beats two where the spare can
    // latch - and the fetch is cancelled on a deadline now besides.
    if (now - _buildPolledAt < BUILD_POLL_MS) return;
    _buildPolledAt = now;
    const href = globalThis.location?.href ?? '';
    liveBuildTag(href).then((tag) => {
      if (buildUpdateSeen(tag, BUILD_TAG) === 'changed') chatNotice(buildUpdateText());
    }, () => {});   // `liveBuildTag` swallows its own throws; this is the belt for a rejection it cannot see
  };
  // ═══ CHAT-CHAN - THE FOUR CHANNELS, AT THE HOST ═══════════════════
  //
  // kurkku: "Global chat that everyone everywhere sees / regional chat
  // that everyone in the region can see ... / party chat"; Addison Knox:
  // "Roleplay chat channels (IC/OOC)". The law is net/chat.js's (the tabs,
  // earshot, the region's step, the aside's mark), net/chatCommands.js's
  // (what a typed line is) and the relay's (the region rooms, the party's
  // line); what stands here is which SESSION each tab rides.
  /** CHAT-CHAN: the session a tab's lines, badges and strip come from - the World and Region tabs their own links, the
   *  Party tab the hub's (the World tab's link: the hub names everyone online), the Local tab the presence session. */
  const chatSessionOf = (tabId) => (tabId === 'local' ? shared.online : tabId === 'party' || tabId === 'guild' ? shared.chatLinks?.get('world') : shared.chatLinks?.get(tabId)) ?? shared.online ?? null;   // GUILD1c: the Guild tab the hub's too
  /** CHAT-CHAN: the roster a tab shows - its channel's members (ROSTER-G) for the World tab, and for the Region tab under
   *  the region's name; the party's seats online; those in earshot. */
  const chatRosterOf = (tabId) => {
    const s = chatSessionOf(tabId);   // CHAT-FIT: the session the lines' badges are read off - one session answers both
    if (tabId === 'party') return partyRosterSource(shared.social?.party, s, shared.social?.acct ?? null);
    if (tabId === 'guild') { s?.sendGuildWho?.(); return guildRosterSource(s, myGuildTag()); }   // GUILD1c: the hub's peers wearing my guild's tag; SCALE5c: and the guild on every other shard, asked while the tab is drawn (the session's own clock bounds it)
    if (tabId === 'local') return localRosterSource(s, openPeers(peersNear(), isPartyMate), player.feetAt());   // AUDIT (pre-merge) I-F: a concealed player is not listed near - the F key's law (INVIS-NET; CONCEAL-MATE: a mate is)
    if (tabId === 'world' || tabId === 'region') s?.sendHubWho?.();   // SCALE5c: on a shard, everyone online asked of the bus while the channel is small (the session's own clock bounds it); part two: a region's too
    const place = shared.chatLog?.tab(tabId)?.place ?? null;
    return place && s ? placedRosterSource(s, place) : s;   // GUILD1c: my own row wears my tag; HIDDEN-UNCOUNTED: and my hidden mark (net/roster.js)
  };
  /** CHAT-CHAN: the Party and Region tabs on a relay from before the channels - the World link's welcome said so. */
  const chanOld = () => { const world = shared.chatLinks?.get('world'); return world?.status === 'open' && !world.chanOk; };
  /** CHAT-LANG: the language channel the player chose (`chatLang`), or null for none. */
  const chatLangCode = () => (chatLangRoom(getPref('chatLang')) ? getPref('chatLang') : null);
  /** CHAT-LANG: the Language tab on a relay from before the language channels - the World link's welcome said so. */
  const langOld = () => { const world = shared.chatLinks?.get('world'); return world?.status === 'open' && !world.langOk; };
  /** CHAT-TRADE: the Trade and LFG tabs on a relay from before them - the World link's welcome said so. */
  const tradeChanOld = () => { const world = shared.chatLinks?.get('world'); return world?.status === 'open' && !world.tradeChanOk; };
  /** CHAT-TRADE: has the player joined this channel (`chatTrade`, `chatLfg`) - false for a tab that is not one. */
  const optJoined = (tabId) => (Object.hasOwn(OPT_CHANNELS, tabId) ? getPref(OPT_CHANNELS[tabId].pref) === true : false);
  /** CHAT-TRADE: why a Trade or LFG tab cannot talk yet - not joined, or a relay from before them; null when it can. */
  const optWhy = (tabId) => (!Object.hasOwn(OPT_CHANNELS, tabId) || shared.chatLog?.tab(tabId)?.room ? null : tradeChanOld() ? tradeChanOldText() : optJoined(tabId) ? null : notJoinedText(tabId));
  /** CHAT-CHAN: the strip under the chat - why the ACTIVE tab cannot talk, when it cannot: the tab's own reason (a relay
   *  from before the channels, no party), else the socket it rides (connecting, reconnecting, refused: the session's
   *  own line, labelled with the tab - AUDIT CHAT B5). The Region tab before its first region reads the World link's,
   *  whose welcome is what it waits on. */
  const chatStatus = (tabId) => {
    const tab = shared.chatLog?.tab(tabId);
    if ((tabId === 'party' || tabId === 'region') && chanOld()) return CHAN_OLD_RELAY_TEXT;
    if (tabId === 'party' && !shared.social?.party) return NO_PARTY_TEXT;
    if (tabId === 'guild' && guildOld()) return GUILD_OLD_RELAY_TEXT;   // GUILD1c
    if (tabId === 'guild' && !myGuildTag()) return NO_GUILD_TEXT;
    if (tabId === 'lang' && !tab?.room) return langOld() ? LANG_OLD_RELAY_TEXT : chatLangCode() ? null : NO_LANG_TEXT;   // CHAT-LANG: before its channel
    if ((tabId === 'trade' || tabId === 'lfg') && !tab?.room) return optWhy(tabId);   // CHAT-TRADE: before its channel
    const s = tabId === 'region' && !tab?.room ? shared.chatLinks?.get('world') : chatSessionOf(tabId);
    return s?.statusLine(tab?.label ?? 'chat') ?? null;
  };
  /** CHAT-CHAN: a typed line said on `tabId` - each tab's own door. False keeps the line in the field (AUDIT CHAT B2):
   *  nothing went. A reason is said as a line on the tab the line was typed on (`from`): the strip speaks for the
   *  active tab alone, and `/p` is typed on another. */
  /** CHAT-POST (2026-09-27, Discord - Tabitha: "Link in chat / Post in chat"): an item's line and its record
   *  (itemChatText + the piece) said on the chat's open tab - chatSend's own door, so every tab's reasons hold
   *  (no party, an older relay); none offline. A hearing client draws a coloured [Name] and the pack's hover card. */
  const canPostItemInChat = () => !!(shared.chatLog?.active && shared.chatPanel);
  const postItemInChat = (text, item) => (canPostItemInChat() ? chatSend(shared.chatLog.active, text, shared.chatLog.active, { item }) === true : false);
  /** CHAT-POST: insert the piece into the chat field as `[Label]` - the player finishes the line and sends. */
  const linkItemInChat = (item) => (canPostItemInChat() ? shared.chatPanel.linkItem?.(item) === true : false);
  const chatSend = (tabId, text, from = tabId, { me = false, item = null, items = null, vol = null } = {}) => {
    const why = (line) => { shared.chatLog.push(from, { text: line, system: true }); return false; };
    if ((tabId === 'party' || tabId === 'region') && chanOld()) return why(CHAN_OLD_RELAY_TEXT);
    if (tabId === 'guild' && guildOld()) return why(GUILD_OLD_RELAY_TEXT);   // GUILD1c
    if (tabId === 'lang' && !shared.chatLog.tab('lang')?.room) return why(langOld() ? LANG_OLD_RELAY_TEXT : NO_LANG_TEXT);   // CHAT-LANG: no channel yet
    if ((tabId === 'trade' || tabId === 'lfg') && !shared.chatLog.tab(tabId)?.room) return why(optWhy(tabId) ?? optWaitText(tabId));   // CHAT-TRADE: not joined, an older relay, or the channel not open yet
    if (tabId === 'tavern') return !item && !items?.length && !me && (shared.tavernBridge?.send(text, from) ?? false);
    // EMOTE1: an action only down a session whose relay carries one - an older one would say the words bare
    const s = tabId === 'local' ? shared.online : tabId === 'party' || tabId === 'guild' ? socialLink() : shared.chatLinks.get(tabId);
    if (me && s?.status === 'open' && !s.emoteOk) return why(EMOTE_OLD_RELAY_TEXT);
    if (tabId === 'local') return shared.online?.sendChat(text, { me, item, items, vol }) ?? false;
    if (tabId === 'party') {
      if (!shared.social?.party) return why(NO_PARTY_TEXT);
      return socialLink()?.sendChat(text, { ch: 'party', me, item, items }) ?? false;   // the relay fans it to the party's members alone - my own tabs too: the echo is the receipt
    }
    if (tabId === 'guild') {
      // GUILD1c: the relay fans it to the sockets wearing my guild alone - my own tabs too: the echo is the receipt
      if (!myGuildTag()) return why(NO_GUILD_TEXT);
      return socialLink()?.sendChat(text, { ch: 'guild', me, item, items }) ?? false;
    }
    return shared.chatLinks.get(tabId)?.sendChat(text, { me, item, items }) ?? false;
  };
  /** DICE1 (Addison Knox: "Chat dice-rolling"): a roll ASKED on `tabId`'s channel - the relay rolls it (net/dice.js) and
   *  says it back to the channel, this player included. The tab's own door, chatSend's: the same session, the same
   *  reasons it cannot (an older relay, no party). False keeps the line in the field. */
  const chatRoll = (tabId, spec) => {
    const why = (line) => { shared.chatLog.push(tabId, { text: line, system: true }); return false; };
    if ((tabId === 'party' || tabId === 'region') && chanOld()) return why(CHAN_OLD_RELAY_TEXT);
    if (tabId === 'guild' && guildOld()) return why(GUILD_OLD_RELAY_TEXT);   // GUILD1c
    if (tabId === 'lang' && !shared.chatLog.tab('lang')?.room) return why(langOld() ? LANG_OLD_RELAY_TEXT : NO_LANG_TEXT);   // CHAT-LANG
    if ((tabId === 'trade' || tabId === 'lfg') && !shared.chatLog.tab(tabId)?.room) return why(optWhy(tabId) ?? optWaitText(tabId));   // CHAT-TRADE
    const s = tabId === 'local' ? shared.online : tabId === 'party' || tabId === 'guild' ? socialLink() : shared.chatLinks.get(tabId);
    if (s?.status === 'open' && !s.rollOk) return why(ROLL_OLD_RELAY_TEXT);
    if (tabId === 'party' && !shared.social?.party) return why(NO_PARTY_TEXT);
    if (tabId === 'guild' && !myGuildTag()) return why(NO_GUILD_TEXT);
    return s?.sendRoll(spec, tabId === 'party' || tabId === 'guild' ? { ch: tabId } : {}) ?? false;
  };
  /** CHAT-CHAN (kurkku: "players in Wayrest see messages from other players in Wayrest and so on"): THE REGION TAB
   *  FOLLOWS THE PLAYER - into the channel of the region they stand in (PlayerGPS.CurrentRegionIndex: the POLITIC map's
   *  word, _questRegionIndex), once a new region has held CHAT_REGION_HOLD_MS (net/chat.js nextRegionRoom), and never
   *  before the World link's welcome says the relay opens region rooms (an older one refuses the key). The region's
   *  name rides the tab (setRoom's `place`) and a line says where the channel is now. */
  const _regionHold = { room: null, since: 0 };
  const chatRegionFrame = (now) => {
    if (seatOut()) return;   // ONE-SEAT: a tab out of the seat joins no channel and says no region
    const link = shared.chatLinks?.get('region');
    if (!link || !shared.chatLinks.get('world')?.chanOk) return;
    const index = _questRegionIndex();
    const room = nextRegionRoom(_regionHold, chatRegionRoom(index), shared.chatLog.tab('region').room, now);
    if (!room) return;
    const place = maps.getRegionName(index) || 'this region';
    shared.chatLog.setRoom('region', room, place);
    link.join(channelLinkRoom(room));   // SCALE5c part two: the region's shard of this account's
    shared.chatLog.push('region', { text: regionJoinedText(place), system: true });
  };
  /** CHAT-LANG (2026-10-11, the players: "More chat channels per-language"): THE LANGUAGE TAB FOLLOWS THE PLAYER'S
   *  CHOICE - on the bar while one is chosen (`chatLang`), its link in that language's channel once the World link's
   *  welcome says the relay opens them (an older one refuses the key), out of it when the choice is taken back. The
   *  language's name rides the tab (setRoom's `place`), and a line says which channel it is now. */
  const chatLangFrame = () => {
    if (seatOut()) return;   // ONE-SEAT: a tab out of the seat joins no channel
    const link = shared.chatLinks?.get('lang');
    if (!link) return;
    const code = chatLangCode();
    shared.chatLog.setShown('lang', !!code);
    const room = code ? chatLangRoom(code) : null;
    const tab = shared.chatLog.tab('lang');
    if (room === tab.room) return;
    if (!room) { shared.chatLog.setRoom('lang', null, null); link.leave(); return; }
    if (!shared.chatLinks.get('world')?.langOk) return;
    shared.chatLog.setRoom('lang', room, CHAT_LANGS[code]);
    link.join(room);
    shared.chatLog.push('lang', { text: langJoinedText(CHAT_LANGS[code]), system: true });
  };
  /** CHAT-TRADE (2026-10-14, Mac: "New channels: Trading, LFG" - "without introducing clutter"): THE TRADE AND LFG TABS
   *  FOLLOW THE PLAYER'S CHOICE - the Language tab's law twice over: on the bar while joined (`chatTrade`, `chatLfg`; /join,
   *  /leave, the Settings' Chat card), each link in its channel once the World link's welcome says the relay opens them
   *  (an older one refuses the key), out of it when the choice is taken back. A player who never joins holds no socket
   *  for either and sees no tab. The join's line is the command's (a page load back into a channel says nothing). */
  const chatOptFrame = () => {
    if (seatOut()) return;   // ONE-SEAT: a tab out of the seat joins no channel
    for (const id in OPT_CHANNELS) {   // AUDIT CHAT-TRADE A6: a frame's walk allocates nothing
      const c = OPT_CHANNELS[id], link = shared.chatLinks?.get(id);
      if (!link) continue;
      const joined = optJoined(id);
      shared.chatLog.setShown(id, joined);
      const room = joined ? c.room : null;
      if (room === shared.chatLog.tab(id).room) continue;
      if (!room) { shared.chatLog.setRoom(id, null, null); link.leave(); continue; }
      if (!shared.chatLinks.get('world')?.tradeChanOk) continue;
      shared.chatLog.setRoom(id, room, c.name);
      link.join(room);
    }
  };
  /** CHAT-TRADE: A CHANNEL JOINED OR LEFT - the one door, for `/join` and `/leave`, a line said to a channel not joined
   *  (`say`: its line waits in the field) and the chat's channel picker (ui/chatPanel.js `channels`). The choice is kept
   *  (`chatTrade`, `chatLfg`) and the frame moves the tab at once; a tab joined comes to the front with its line, and a
   *  tab left goes from the bar with the chat's front tab saying so. */
  const optSet = (id, on, { say = false } = {}) => {
    const c = OPT_CHANNELS[id];
    if (!c || !shared.chatLog) return;
    setPref(c.pref, !!on);
    chatOptFrame();
    if (on) { shared.chatLog.select(id); shared.chatLog.push(id, { text: tradeChanOld() ? tradeChanOldText() : say ? optJoinedSayText(id) : optJoinedText(id), system: true }); }
    else shared.chatLog.push(shared.chatLog.active, { text: optLeftText(id), system: true });
  };

  const chatPingFrame = (now) => {
    shared.chatLog.self = shared.online?.name ?? '';
    // BUNNYFALL CHAT-CHIME (2026-11-06, the owner: "a little chime when a new chat message is typed so people dont miss
    // them"): another player's line, a soft page's turn, once for a burst; a ping's own chime below stands over it
    if ((shared.chatLog.heardSeq ?? 0) > shared._chimeHeard) {
      shared._chimeHeard = shared.chatLog.heardSeq;
      if (shared.chatLog.pingSeq <= shared._pingHeard && getPref('chatChimeSound') !== false && now - shared._chimeAt >= 2000 && now - shared._pingRangAt >= 2000) { shared._chimeAt = now; audio.playOneShot(SOUND.PageTurn, 0.35); }
    }
    if (shared.chatLog.pingSeq <= shared._pingHeard) return;
    shared._pingHeard = shared.chatLog.pingSeq;
    if (getPref('chatPingSound') === false || now - shared._pingRangAt < 2500) return;
    shared._pingRangAt = now;
    audio.playOneShot(SOUND.MakeItem, 0.6);
  };
  /** TV3: my mark, when it is due - on the Region tab's own link, through a relay that knows the frame. */
  const travellerFrame = (now) => {
    const link = shared.chatLinks?.get('region');
    if (!link?.travOk || seatOut()) return;
    if (link.room !== travellerSent.room) { travellerSent.room = link.room; travellerSent.last = null; travellerSent.at = 0; travellerBook.clear(); }   // a new room holds nothing of mine - AUDIT DEEP2 C4: nor the old room's travellers (its leaves and clears can no longer reach this link; a refused hello there left them drawn five minutes)
    const outdoors = (shared.modes?.mode ?? 'exterior') === 'exterior' && walkMode && shared.playerSpawned && (playerEntity.health ?? 0) > 0;
    // AUDIT TV C4: and never into the region I just LEFT - the Region link holds the old room for CHAT_REGION_HOLD_MS after a
    // crossing (a fast travel's arrival would be told to the region it left); held, a mark it holds is taken out instead
    // AUDIT DEEP X-4: and only on the enhanced interface - the classic one draws no traveller and has no switch to say no
    // AUDIT NAMES N2-3: and never while I am concealed (invisible, blending, a shade) - within the pose range the others
    // mark no concealed player (`_hiddenPeers`/`_veils`), and the region's mark would name me to all of them; the clear
    // is sent the frame the concealment takes
    // WILD1: in or near the open zone my mark is for my guild alone - a player with none sends none (my party has its own
    // poses), and the maps of everyone else hide one they hear anyway (wildHidesPlayer)
    const wildHidden = outdoors && !myGuildTag() && shared.wildAtWire(campToWire(player.feetAt()), true);
    const shown = outdoors && isEnhanced() && getPref('showToTravellers') !== false && channelOf(link.room) === chatRegionRoom(_questRegionIndex()) && !concealBits(playerEntity);   // SCALE5c part two: the region's channel, on whichever of its shards
    const n = shown && !wildHidden ? state.worldCoords(player.pos) : null;
    // OWS1: at a helm or aboard, the region sees a ship, headed as its bow (a changed way is sent at once - travellerDue)
    const ship = n ? csaBoatUnderMe() : null;
    const mark = n ? travellerMarkOf({ x: n.x, z: n.z, yaw: ship ? csaBoatYaw(ship) : cam.yaw, mode: ship ? TRANSPORT_MODES.Ship : player.transportMode, journey: !!travelControlUI?.isShowing }) : null;
    if (mark) Object.assign(mark, regionChaseWords(bandWordOf(_bandChase, _bandSpentAt), raiderWordOf(seaRaidHeld(), tvRaid.spentAt), Math.floor(bandNowMs() / BAND_LIFE_MS), Math.floor(raidNowMs() / RAIDER_LIFE_MS)));   // OW-CHASE-RANGE: my chases, region-wide, beside the mark (systems/travel/regionChase.js)
    const due = travellerDue(travellerSent, { now, mark, alone: link.othersHere === 0, shown, chasing: _bandChase.size > 0 || tvRaid.chase.size > 0 });   // WILD1: no mark (wildHidden) is a clear; AUDIT OW-REVISITED L4-8: refreshed while a chase runs, never for a ship that only stands
    if (due === 'send' && link.sendTraveller(mark)) { travellerSent.last = mark; travellerSent.at = now; }
    else if (due === 'clear' && link.sendTraveller(null)) { travellerSent.last = null; travellerSent.at = now; }
  };
  const chatFrame = () => {
    if (!shared.chatLinks) return;
    buildPoll(performance.now());
    shared.chatLog.setShown('party', !!shared.social?.party);   // CHAT-P (Mac: "Party chat should only show if in a party"): the tab is on the bar while a party is
    shared.chatLog.setShown('guild', !!myGuildTag());   // GUILD1c: and the Guild tab while the character is in a guild
    shared.tavernBridge?.frame(performance.now());
    chatRegionFrame(performance.now());   // CHAT-CHAN: before the rejoin - a region crossed moves the link, a rejoin takes it back to where it is
    travellerFrame(performance.now());   // TV3: and my mark in it, when due
    chatLangFrame();   // CHAT-LANG: and the language channel chosen, or left - before the rejoin too
    chatOptFrame();   // CHAT-TRADE: and the Trade and LFG channels joined, or left - before the rejoin too
    chatPingFrame(performance.now());   // PING1: a line naming me, chimed
    for (const [tabId, link] of shared.chatLinks) {
      const room = shared.chatLog.tab(tabId).room;   // CHAT-CHAN: a tab whose channel is not known yet (the Region tab, before its first region) has nothing to rejoin
      if (room) link.rejoin(room, CHAT_REJOIN_MS);   // AUDIT CHAT A6/B4/B6: the page's goodbye and a terminal close both get a way back
      link.tick();   // the retry and the heartbeat, on the session's own clock
    }
    shared.chatPanel.render({
      // AUDIT-CHATR F1: `covered` is the HOST's word - a window over the
      // HUD - and never the player's `hidden` (the Hide button). While
      // the two shared a name the panel's frame wrote this one into the
      // player's slot and undid the button on the next tick.
      covered: townTalk.hudCovered || (shared.modes?.hudCovered ?? false) || gamePaused(),   // a window over the HUD covers the chat too, and closes it
      status: chatStatus(shared.chatLog.active),   // connecting, reconnecting, refused - the session's own line (D12; AUDIT CHAT B5); CHAT-CHAN: or the tab's own reason
      here: seatOut() ? { label: PLAY_HERE_LABEL, run: takeSeat } : null,   // ONE-SEAT: the way back, while another tab or window has the seat
    });
    // JOURNAL1: A PAGE SENT AS A LETTER opens the letters on it the first frame the panel may stand - the chronicle it was
    // sent from is a window over the HUD, and it is down only once its host has seen it close. The same draft is handed
    // again each frame until then (openLetters answers whether the panel stood); a panel that cannot stand within a
    // minute - a pause left up, another window - is said, and the page stays in the journal. Before the panel's own render
    // below, so the frame that opens it draws it (and ahead of the party's run, which SOC3/SOC4 pin as renders alone).
    if (shared._letterPending) {
      if (shared.socialPanel?.openLetters({ draft: shared._letterPending.draft })) shared._letterPending = null;
      else if (performance.now() - shared._letterPending.at > LETTER_PENDING_MS) { tradeSay(shared._letterPending.lost ?? 'Your letters could not be opened. The page is still in your journal.'); shared._letterPending = null; }   // AUDIT 28 N1: a note's letter says the note's words
    }
    shared.partyTravel?.tick();   // PARTY-TRAVEL: the party's journey - throttled inside to PARTY_TRIP_TICK_MS
    shared.partyRestFollowTick();   // PARTY-REST1: every frame, not throttled to the send cadence - a few property reads, and a follower's own countdown should start and end as promptly as the leader's does
    shared.partyFrame(performance.now());   // SOC2: my party pose rides the chat frame - before the dead return with it, so a dead member's card says so as their vitals read zero
    // SOC3: and the friends + party panel repaints on the same frame, under the same covering rule as the chat -
    // its body only when the picture moved, its countdowns and its invite toast every time (ui/socialPanel.js).
    shared.socialPanel?.render({ covered: townTalk.hudCovered || (shared.modes?.hudCovered ?? false) || gamePaused() });
    shared.profileWin?.render({ covered: townTalk.hudCovered || (shared.modes?.hudCovered ?? false) || gamePaused() });   // INSPECT1: the F-menu's own covering word
    shared.pageWin?.render({ covered: townTalk.hudCovered || (shared.modes?.hudCovered ?? false) || gamePaused() });   // JOURNAL1: and the page read from it
    shared.socialMenu?.render({ covered: townTalk.hudCovered || (shared.modes?.hudCovered ?? false) || gamePaused() });   // SOC5: a window over the HUD takes the F-menu with it, the same word the chat's own `covered` carries - a card left over a window would take the clicks the window is owed
    // SOC4: and the party HUD is drawn from the same frame, under the SAME `covered` word the chat panel takes - a
    // window over the HUD covers both. The panel itself costs one version compare on a frame where nothing moved.
    shared.partyPanel?.render({ covered: townTalk.hudCovered || (shared.modes?.hudCovered ?? false) || gamePaused() });
  };

  /** CARDS2b (AUDIT CARDS B3): the seated feet of the players in my room I can see, in this room's scene - the card
   *  tables' taken seats. peersNear's own walk and gates; its row is pinned whole, so the seat reads the peers itself. */
  const seatedPeerFeet = () => {
    if (!shared.online || !shared.online.room || shared.online.status !== 'open') return [];
    const out = [];
    for (const p of shared.online.peers.values()) if (p.shown?.st && shared.online.visible(p)) out.push(shared.onlineToScene(p.shown));
    return out;
  };
  const peerIdByName = (name) => {
    const q = String(name ?? '').toLowerCase().trim();
    if (!q || !shared.online) return null;
    let part = null;
    for (const [id, p] of shared.online.peers) { const n = String(p.name ?? '').toLowerCase(); if (n === q) return id; if (n.startsWith(q)) part = part ?? id; }
    return part;
  };
  function touchFxFrame(proj, view) {
    if (!shared.touchFx) return;
    const covered = townTalk.overlayActive || gamePaused() || !!townTalk.hudHidden || !!shared.travelView?.active;
    const heads = new Map();
    if (!covered) {
      const { w, h } = shared._canvasSize(), rect = worldViewportRect(w, h);
      for (const p of peersNear() ?? []) {
        if (!p.feet) continue;
        const at = projectToScreen([p.feet[0], p.feet[1] + (p.height || 1.8) + 0.15, p.feet[2]], w, h, proj, view, rect);
        if (at.front) heads.set(p.id, at);
      }
    }
    shared.touchFx.frame(performance.now(), (id) => heads.get(id) ?? null, covered ? { w: 0, h: 0 } : shared._canvasSize());
  }
  const peersNear = ({ presenceOnly = false } = {}) => {
    if (!shared.online || !shared.online.room || shared.online.status !== 'open') return null;
    const out = [];
    for (const p of shared.online.peers.values()) {
      if (!presenceOnly && !shared.modes?.sailingCabin && csaPeers.isBelowDeck(p.id)) continue;
      if (!shared.online.visible(p, undefined, true)) continue;   // BUNNYFALL /vanish: the vanished counted here (rolls, owners), flagged `vn` below - AUDIT PSCALE1 NET-2: on the session's OWN clock (steadyNow, AUDIT ONLINE 3 F2) - performance.now() against its stamps never timed a silent peer out
      const h = shared.peerBodies?.heightOf(p.id) || 0;
      if (h > 0) shared._peerHeights.set(p.id, h);
      out.push({ id: p.id, feet: shared.onlineToScene(p.shown), height: shared._peerHeights.get(p.id), cv: p.shown?.cv | 0, ...(p.vn ? { vn: true } : {}) });   // BUNNYFALL /vanish: no foe's quarry, nobody's pick   // INVIS-NET: and the peer's concealment, for the foes' senses
    }
    // SLAM4 (2026-09-16, the 30th-anniversary slam): AND THE REMEMBERED HEIGHTS GO WITH THE PEERS. This map only
    // ever grew: every id that has ever stood in the room stayed in it for the life of the session. A twenty-minute
    // test never notices; a four-hour stream with hundreds of people coming and going is the case it was written
    // for. The session's own roster is the truth about who exists, so anything not in it is not a peer any more.
    if (shared._peerHeights.size > shared.online.peers.size) for (const id of [...shared._peerHeights.keys()]) if (!shared.online.peers.has(id)) shared._peerHeights.delete(id);
    return out;
  };
  /**
   * SOC5 (2026-09-16, Mac: "Players should be able to interact with others in the world upon encountering them by
   * pressing F on their body, which should show options to add as a friend or invite to a party"): THE F DOOR.
   *
   * It sits here because the thing it needs is directly above: `peersNear()` is the only list of other players with
   * their feet in THIS scene's frame, and "on their body" is a ray against those feet. The ray is the ACTIVATION
   * ray, read exactly as the activation site reads it (`cam.pos` and the camera's own forward), measured with the
   * port's one ray-vs-person cylinder (`rayPersonDistance` - radius 0.45, height 1.8) and raced by one pure law
   * (player/socialPick.js): nearest in front wins, behind is not in the race at all, past SOCIAL_REACH is nobody.
   * SOCIAL_REACH is the game's own person reach (PlayerActivate MobileNpcActivationDistance, 6.4) - the same
   * distance a conversation refuses past, so "close enough to talk to" and "close enough to friend" never disagree.
   *
   * THREE ANSWERS, and the third is the one that matters to the ladder:
   *   - a peer under the ray: the card, over the picture's word on them (net/social.js actionsFor). ACT-MENU (DISC7):
   *     where the World Tooltips plaque stands the choosing is the plaque's - F presses the verb the wheel lit, or
   *     lights the first on an unlit list; the card answers where the plaque cannot (touch, the classic skin, a player
   *     a nearer thing hid from the plaque's race).
   *   - nobody under the ray: SOC3's friends-and-party panel toggles. F is "the social key"; with nobody in front of
   *     you the social thing to do is the list. Optional calls throughout, so this arm is correct before SOC3 lands.
   *   - no `social` at all (offline, or a page with no account): FALSE, and the ladder falls through. The key is not
   *     the port's to eat on a page where it can do nothing.
   * The card open is itself an answer: a second F closes it, which is why this arm runs FIRST - a menu standing over
   * a peer who has since walked out of reach must still close on the key that opened it.
   */
  /** ALLY-CAST's plaque line for a player - "Cast Heal on Bran" - when the LIVE engine's readied spell would land on
   *  exactly them at its reach (AUDIT ALLY-CAST A3/A5: the dungeon runs its own engine), else null. SPELL-GIFT: a
   *  stranger's too, for a spell on the stranger's list. */
  function castPlaqueLine(id) {
    const underground = shared.modes?.mode === 'dungeon';
    const sp = (underground ? shared.modes?.dungeonCtx?.readiedSpell?.() : magic?.readied?.()) ?? null;
    const giftable = sp && (shared.social?.isPartyPeer(id) ? allyCastable(sp) : strangerCastable(sp));
    const reach = giftable ? allyReachFor(sp.rangeType) : null;
    const pick = reach !== null ? (underground ? shared.modes?.dungeonCtx?.allyInReach?.(cam.pos, socialFwd(), reach) : magic?.allyInReach?.(cam.pos, socialFwd(), reach)) ?? null : null;
    const name = pick?.id === id ? peerName(id) : null;
    return name ? allyCastPlaqueLine(shownSpellName(sp), name) : null;   // L10N3e: my readied spell, as the book shows it
  }
  /** PEER-PLAQUE1: the plaque's word for `peer:<id>` - the session's own name for them (peerName: the chat's and
   *  the name layer's), the badge's text marks after it (ui/playerBadge.js glyphMarks - the classic face's own
   *  plain-text glyphs, since the plaque is text), and under it the relation and - ACT-MENU - the acts the F-menu
   *  would open with THIS moment as the plaque's rows (peerActsFor: net/social.js actionsFor, tradeActionsFor and the
   *  look - the one bag the menu reads, through ui/socialMenu.js socialPlaqueRows - unlit until the wheel or F lights one, AUDIT DISC7 A2). Null for a key that is not a peer's, and for a peer the session no
   *  longer names (they left between the pick and the paint): a key with no word draws nothing (resolveHover). */
  const peerHoverName = (key) => {
    const id = peerIdOfKey(key);
    if (!id) return null;
    // PEERMENU1b (the player: "there should be NO popup when hovering over a player"): NOTHING ON THE LOOK. The plaque
    // stays shut over a player until their menu is opened on them (hold E / hold A - openPeerMenu); only then does it
    // stand, with their name and their verbs.
    // SPELL-GIFT (2026-09-27, Tabitha: "the feedback for buffing other players is non-existent"): ...BUT A READIED SPELL
    // AIMED AT THEM IS NO LOOK - it is a cast about to land, and the plaque says where: their name and "Cast Heal on
    // Bran", nothing else (no verbs, no relation). Without the menu, nothing more.
    if (shared.peerMenuFor !== id) {
      const cast = castPlaqueLine(id);
      const name = cast ? peerName(id) : null;
      return name ? { title: name, renown: null, subs: [cast], actions: [], actionsUnlit: true } : null;
    }
    const name = peerName(id);
    if (!name) return null;
    const badge = shared.online?.badgeOf?.(id) ?? null;
    const marks = badge ? glyphMarks(badge) : '';
    // ACT-MENU: the F-menu's own bag (both halves and the look) - its enabled acts are the plaque's ROWS (the wheel lights one, the
    // activate key or F presses it: plaquePeerAct) and the relation stands under the name
    const acts = shared.social ? peerActsFor(id) : null;
    // ALLY-CAST: a castable spell readied and a party mate under the crosshair - the plaque says where it will land.
    // AUDIT ALLY-CAST A3/A5: the spell is the LIVE engine's (the dungeon runs its own createPlayerMagic; the surface
    // one's ready is stale there) and the line is said only when that engine's own allyInReach - the reach the
    // spell's range type asks, its collider's line of sight, a member some socket reaches - names THIS peer: the
    // plaque never promises a cast the click would not make.
    const cast = castPlaqueLine(id);
    const renown = shared.online?.renownOf?.(id) ?? null;   // RENOWN1: their Renown, boxed left of the name as over their head (the plaque draws the box)
    return { title: marks ? `${name} ${marks}` : name, renown, subs: [cast, peerRelationText(acts)].filter(Boolean), actions: acts ? socialPlaqueRows(id, acts) : [], actionsUnlit: !acts };   // PEERMENU1: open on this peer (the gate above) - the verbs, the first lit
  };
  /** ALLY-CAST: THE PARTY MATE UNDER THE CROSSHAIR - the F key's own pick (player/socialPick.js pickPeerInFront over
   *  peersNear(), the ray the social menu casts) at the reach the spell's range type asks (systems/allyCast.js), a
   *  party member alone (social.isPartyPeer - a party is invite-only, and that is the whole trust), and one some
   *  socket of mine can reach (online.reachesPeer). Null in every other case, and the cast goes the ordinary way.
   *  The distance rides so the cast engine can run its line-of-sight rule over it (hostMagic allyInReach, AUDIT
   *  ALLY-CAST A2). One pick for both engines: the surface one takes it as a dep, the dungeon's through the host
   *  object worldModes hands buildDungeonContext (A3). */
  /** RESURRECT1: THE FALLEN PARTY MEMBER'S BODY under the crosshair - the corpses remotePlayers keeps (PCORPSE1), a
   *  party member's alone, through the social pick's own ray. The account is what the call names. */
  const fallenTargetPick = (eye, dir, reach) => {
    // RESURRECT2: every fallen party member's body in reach, named - the cast engine picks the one the crosshair
    // means (systems/resurrect.js pickFallenBody), against its own floor
    if (!shared.social?.party || !shared.remotePlayers) return null;
    const at = eye ?? cam.pos;
    const out = [];
    for (const c of shared.remotePlayers.corpseMarks(shared.onlineToScene)) {
      const cAcct = c.acct ?? (c.id ? shared.social.accountOfPeer(c.id) : null);   // PCORPSE3: a party-told body carries its account
      const mate = cAcct ? shared.social.others().find((m) => m.acct === cAcct) : null; if (!mate) continue;
      if (Math.hypot(c.feet[0] - at[0], c.feet[1] - at[1], c.feet[2] - at[2]) > reach + 1) continue;
      const acct = cAcct;
      out.push({ id: c.id, acct, feet: c.feet, name: (c.id && peerName(c.id)) || shared.social.party.members.find((m) => m.acct === acct)?.name || null, gone: mate.p?.fg === 1 });   // REZ-BLOODLINE: fallen for good, their own pose says (composePartyPose `fg`) - the cast refuses before a point is spent
    }
    return out;
  };

  /** RESURRECT1: the call out - onto my party pose for RESURRECT_HOLD_MS, sent at once. */
  const raiseFallenDoor = (f) => {
    if (!shared.social?.party || !f?.acct) return false;
    shared._rezOut = { to: f.acct, at: Date.now(), until: performance.now() + RESURRECT_HOLD_MS };
    shared._partyComposedAt = -Infinity;
    sendRaiseWord(shared.online, f.acct);   // AUDIT WORLD-EVENTS L1-1, L1-4: and to the room that keeps the death, which records the raise (net/raiseWord.js)
    return true;
  };
  // SPELL-GIFT (2026-09-27, Tabitha: "Allow casting of buffs on players outside party"): a spell whose every effect is
  // on the stranger's list (systems/allyCast.js strangerCastable - her safe list) may be aimed at ANY player some socket
  // of mine reaches, party or not; anything else stays the party's. The receiver decides again on its side.
  const allyTargetPick = (eye, dir, reach, sp = null) => {
    if (!shared.online) return null;
    const strangers = !!sp && strangerCastable(sp);
    if (!shared.social?.party && !strangers) return null;
    const hit = pickPeerInFront(eye ?? cam.pos, dir ?? socialFwd(), giftablePeers(peersNear()), reach, rayPersonDistance);   // AUDIT SPELL-GIFT B1/B3
    if (!hit || !shared.online.reachesPeer?.(hit.peer.id)) return null;
    const mate = !!shared.social?.party && shared.social.isPartyPeer(hit.peer.id);
    if (!mate && !strangers) return null;
    return { id: hit.peer.id, name: peerName(hit.peer.id) ?? (mate ? 'a party member' : 'another player'), distance: hit.distance };
  };
  /** AID1 onto ALLY-CAST: THE PARTY MATES' BODIES, for the cast engine's touch, missile and blast - the peers standing in
   *  this scene that the crosshair pick would accept (a party mate some socket of mine reaches), with their names. Null
   *  offline or on a relay that cannot carry the cast frame, so nothing is aimed at a door that is shut. */
  const allyMarksNear = (sp = null) => {
    if (!shared.online?.castOk) return null;
    const strangers = !!sp && strangerCastable(sp);   // SPELL-GIFT: and the strangers a stranger-castable spell may reach
    if (!shared.social?.party && !strangers) return null;
    const near = peersNear();
    if (!near) return null;
    const mateOf = (id) => !!shared.social?.party && shared.social.isPartyPeer(id);
    // AUDIT SPELL-GIFT B2/B5: each mark says whether it is a MATE (the ready's arm counts mates alone - hostMagic
    // allyNear), and the mates come FIRST: an area gift's burst (CAST_BURST, net/wire.js) went to the room's first
    // strangers and a mate in the blast was given nothing, unsaid
    const marks = giftablePeers(near).filter((p) => shared.online.reachesPeer?.(p.id) && (mateOf(p.id) || strangers))
      .map((p) => ({ ...p, mate: mateOf(p.id), name: peerName(p.id) ?? (mateOf(p.id) ? 'a party member' : 'another player') }));
    return [...marks.filter((m) => m.mate), ...marks.filter((m) => !m.mate)];
  };
  /** AUDIT SPELL-GIFT B1/B3: the players a gift may land on at all - never the opponent of the duel I am fighting (a
   *  duel's beneficial spell stays home, net/duelCombat.js; a caster-only Heal armed beside them went to them, the
   *  crosshair always on them), and never a CONCEALED stranger (INVIS-NET: the F key's pick does not see them - a
   *  gift named them aloud). A concealed mate is still a mate, as the party's own reads keep them (player/socialPick.js
   *  openPeers - CONCEAL-MATE's one law for every social door). */
  const giftablePeers = (list) => openPeers(list, isPartyMate).filter((p) => !(shared.duelMgr.fighting && p.id === shared.duelMgr.opponent) && crowdDrawnHere(p));
  /** ...and the door the cast leaves through: the link's own directed frame (net/online.js sendCast), which answers
   *  whether it went - a refusal (the gate, the socket gone, a relay too old to route it) lets the release fall
   *  through to the ordinary arm. */
  const castAtAllyDoor = (id, frame) => siegeHealOut(id, frame) || !!shared.online?.sendCast?.(frame);   // AUDIT-SEATS G5: a heal on a siege's side-mate is the referee's
  /** SOC5's own forward - the camera's yaw and pitch, the ray the F key casts; PEER-PLAQUE1's modal pick casts the same one (AUDIT DROPS E3). */
  const socialFwd = () => [Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)];
  /** INSPECT1: THE PROFILE OF THE PLAYER THE F KEY FOUND. It stands at once from what the room already knows - their
   *  name, the badge the relay read off their token, the look they last said hello in - and asks them for their card
   *  (their sheet, and what they wear now), which lands a frame later through `online.onCard`. With a relay that
   *  cannot carry a card it says so and stays as it stood; one that can carries the ask, retried each frame until it
   *  leaves (profileFrame), and a card that does not come in CARD_WAIT_MS is said not to have come. */
  const inspectPeer = (peerId) => {
    const p = shared.online?.peers.get(peerId) ?? null;
    if (!p || !shared.profileWin) return false;
    const can = !!shared.online?.cardOk;
    shared._profileAsk = can ? { peerId, at: performance.now(), sent: false } : null;
    if (shared._profileAsk) shared._profileAsk.sent = shared.online.sendCard({ to: peerId, ask: true }) === true;
    shared._profileSub = null;   // DUEL1: no stamp until their card answers
    return shared.profileWin.show(peerId, shared.withDuel(peerId, profileView({ name: peerName(peerId), peer: p, look: p.look ?? null, state: can ? 'asking' : 'unsupported' })));
  };
  /** INSPECT1: the profile's frame - an ask the gate held back goes when it can, and a wait that ran out is said. */
  const profileFrame = () => {
    // AUDIT RENOWN1 UI-3: a card open on a player whose Renown ROSE is re-drawn with it - the box over their head moves
    // on the renown frame, and the card kept the level it was opened with
    if (shared._profileView && shared.profileWin?.isOpen()) { const lv = renownText(shared.online?.renownOf?.(shared.profileWin.peerId()) ?? null); if (lv && lv !== shared._profileView.level) shared.repaintDuelProfile(); }
    if (!shared._profileAsk) return;
    if (!shared._profileAsk.sent) shared._profileAsk.sent = shared.online?.sendCard({ to: shared._profileAsk.peerId, ask: true }) === true;
    if (performance.now() - shared._profileAsk.at < CARD_WAIT_MS) return;
    const id = shared._profileAsk.peerId;
    shared._profileAsk = null;
    const p = shared.online?.peers.get(id) ?? null;
    shared.profileWin?.update(id, shared.withDuel(id, profileView({ name: peerName(id), peer: p, look: p?.look ?? null, state: 'silent' })));
  };
  // ═══ JOURNAL1 - A PAGE OF MY JOURNAL, SHOWN; AND ONE SHOWN TO ME, READ AND KEPT ═══════════════════════════════════
  // Addison Knox: "Player journals ... shared in-world for storytelling". The journal is DFU's notebook, which the
  // chronicle draws; net/journalPage.js is the shapes and the words, and this block connects them to this scene's
  // socket, peers, notebook, social tab, F-menu and letters.
  /** How long a page sent as a letter waits for the letters to stand before it is said they could not - a minute, since
   *  a chronicle opened from the pause window comes down onto the pause, and the letters stand once the player is back. */
  const LETTER_PENDING_MS = 60000;
  /** How a reader turns to a writer to read their page, in the notice: the F-menu's own key, named off the live bindings
   *  (a rebound key is the key the line names), or the phone's own F (ui/touch/touch.js's social button) where a finger points;
   *  null for an unbound key, which the line says as "turn to them". */
  const pageReadHow = () => {
    if (isTouchDevice()) return 'face them and press \u263a';
    const tag = quickslotTag('SocialInteract', { bindings: bindings() });
    return tag?.kind === 'key' ? `press ${tag.text} on them` : null;
  };
  /** WHO A PAGE CAN BE HELD OUT TO: the players standing within the reach a talk has (player/socialPick.js SOCIAL_REACH,
   *  DFU's own distance for a person - the F-menu's), in metres between two bodies (net/tradeSession.js tradeDistance,
   *  the trade's one measure), that a socket of mine reports, nearest first. Nobody where the relay cannot carry a page. */
  const pageReaders = () => {
    if (!shared.online?.pageOk) return [];
    const near = peersNear();
    if (!near) return [];
    const me = player.feetAt();
    return openPeers(near, isPartyMate).filter(crowdDrawnHere).map((p) => ({ id: p.id, name: peerName(p.id) ?? 'Someone', d: tradeDistance(me, p.feet) }))   // AUDIT (pre-merge) I-F: nor handed a page (CONCEAL-MATE: a mate is); AUDIT CROWD-WIDE B5: nor one the crowd's count leaves undrawn
      .filter((p) => p.d <= SOCIAL_REACH && shared.online.reachesPeer(p.id))
      .sort((a, b) => a.d - b.d)
      .map(({ id, name }) => ({ id, name }));
  };
  /** Hold a page out to one reader - measured again at the press, because the list was drawn a moment ago and they may
   *  have walked on. The sentence that says what happened, for the chronicle to say under the note. */
  const showPage = (id, page) => {
    const name = peerName(id);
    if (!shared.online || shared.online.status !== 'open') return `${NOT_CONNECTED_TEXT}.`;
    if (!shared.online.pageOk) return PAGE_UNSUPPORTED_TEXT;
    if (!pageReaders().some((p) => p.id === id)) return pageTooFarText(name);
    return shared.online.sendPage({ to: id, page }) ? pageShownText(name) : `${TRY_AGAIN_TEXT}.`;
  };
  /** A page sent as a letter: true when the letters will open on it once the chronicle is down (the frame's
   *  `_letterPending`), or the sentence that says why they cannot - the Letters tab's own words. */
  const letterPage = (page) => {
    if (!shared.mail || !shared.socialPanel) return accountRefusalText('mail-needs-account');
    if (shared.mail.state === 'signed-out') return LETTERS_SIGNED_OUT_TEXT;
    if (shared.mail.state === 'guest') return accountRefusalText('mail-needs-account');
    shared._letterPending = { draft: letterOfPage(page), at: performance.now() };
    return true;
  };
  /** THE CHRONICLE'S SHARE (ui/chronicleDoor.js `pageShare` says the shape): null with no online layer at all - no Share
   *  is drawn - else who a page can be held out to now, why nobody can, and the two doors. */
  const pageShareHere = () => {
    if (!shared.online && !shared.mail) return null;
    const readers = pageReaders();
    const why = readers.length ? null
      : (!shared.online || shared.online.status !== 'open') ? `${NOT_CONNECTED_TEXT}.`
        : (!shared.online.pageOk ? PAGE_UNSUPPORTED_TEXT : PAGE_NO_READERS_TEXT);
    return { readers, why, show: showPage, letter: shared.mail ? letterPage : null };
  };
  /** The F-menu's 'Read their page': the page they hold out, in the window - if it still waits. */
  const readPage = (peerId) => {
    const o = pageOffers.get(peerId);
    if (!o || !shared.pageWin) { tradeSay(PAGE_GONE_TEXT); return false; }
    return shared.pageWin.show(peerId, pageView({ name: o.name ?? peerName(peerId), page: o.page, kept: o.kept, canKeep: !!shared.questBridge?.notebook }));
  };
  /** A page KEPT: the page the window shows, into my journal - the notebook's own AddNote(tokens), dated where and when I
   *  keep it, under the name the window shows (net/journalPage.js keptPageTokens) - and the offer marked, so reading it
   *  again offers no second copy. False with no journal to keep it in. */
  const keepPage = (peerId, view) => {
    const nb = shared.questBridge?.notebook;
    if (!nb || !view?.page) return false;
    nb.addNoteTokens(keptPageTokens(view.name, view.page));
    pageOffers.markKept(peerId, view.page);
    return true;
  };
  /** A LETTER KEPT (the Letters tab's Keep): the same, for a letter (keptLetterTokens). */
  const keepLetterInJournal = (letter) => {
    const nb = shared.questBridge?.notebook;
    if (!nb || !letter) return false;
    nb.addNoteTokens(keptLetterTokens(letter));
    return true;
  };
  /** The frame: a page whose writer is not in the room any more goes with them; no link, no pages. Nothing is made on a
   *  frame: the session's own peer map is what is asked. */
  const pageFrame = () => {
    if (!pageOffers.held.size) return;
    if (!shared.online) { pageOffers.clear(); return; }
    pageOffers.keepOnly(shared.online.peers);
  };
  /** ACT-MENU: THE PRESS ON A PLAYER. The plaque's race named them (the nearest thing under the ray - WORLD-HOVER H2)
   *  and the wheel (or F) lit a verb; this presses it through the F-menu's own door (`peerAct`). AUDIT DISC7:
   *  - nothing lit, nothing pressed: a player's list starts unlit (A2), so a plain click on them goes on to the
   *    ladder - the door, the chest, the NPC behind them - as it did before the plaque listed verbs;
   *  - the player is picked again on the PRESS's own ray (A9), walls and all (A6): the lit verb is for the one under
   *    the crosshair now, not the one the last frame painted;
   *  - the row is re-read from the card's own rows at the press (`plaqueRowFor`): a refused one says its reason in
   *    the card's words (A4) instead of sending, and a gone one does nothing.
   *  True when the press was the player's, so no door behind them takes it. */
  const plaquePeerAct = (eye = cam.pos, dir = socialFwd()) => {
    const sel = plaqueActionSelection();
    const id = sel?.id != null ? peerIdOfKey(sel.key) : null;
    if (!id || !shared.social) return false;
    if (peerInSight(eye, dir)?.peer?.id !== id) return false;
    const row = plaqueRowFor(sel.id, id, peerActsFor(id));
    if (!row) return false;
    if (row.act) { peerAct?.(row.act); shared.peerMenuFor = null; }   // PEERMENU1: a verb sent puts the menu away
    else peerNote?.(row.refusal);
    return true;
  };

  const PEER_FLINCH_S = 0.25;   // HITFLASH1: the flash's own length is hitFlash.js's HIT_FLASH_S (0.12 s was about seven frames)
  const peerHurtAge = (id) => { const t = shared.peerHurtAt.get(id); return t == null ? Infinity : performance.now() / 1000 - t; };
  /** HITFLASH1: a peer's flash now (0..1) - the foes' curve, one home. */
  const peerFlashOf = (id) => hitFlashStrength(peerHurtAge(id));
  /** PEERFX3 / HITFLASH1: the flash on whichever layer draws the peer (doll, class body, walker, rider) - its own
   *  batch value now, not the concealed phase: the Enhanced Lighting lane never drew mode 5, and a flash no longer
   *  clears a concealment the layer set. A Morrowind body takes it through its sprite quad (drawPeerBodies). */
  const peerFlashFrame = () => {
    for (const id of [...shared.peerHurtAt.keys()]) {
      const age = peerHurtAge(id);
      const k = hitFlashStrength(age);
      for (const layer of [shared.remotePlayers, shared.peerRiders, shared.peerWalkers]) setBatchHitFlash(layer?.batchOf?.(id), k);
      if (age > PEER_FLINCH_S && age > HIT_FLASH_S) shared.peerHurtAt.delete(id);
    }
  };

  // PEERFX2: what a blow on me cost, as a share of my health - the drop since the last frame (the ring plays inside the
  // blow, before or after the health moves, so the larger of the two readings), or unknown
  let _peerFxHp = null;
  const peerFxHurtShare = () => {
    const max = playerEntity?.maxHealth, now = playerEntity?.health;
    if (!(max > 0) || !Number.isFinite(now) || !Number.isFinite(_peerFxHp)) return null;
    const lost = _peerFxHp - now;
    return lost > 0 ? lost / max : null;
  };
  /** PEERLIGHT1: THE OTHERS' TORCHES - a point light at the hand of each player I can see whose pose says a light
   *  burns (systems/playerTorch.js peerTorchLight), the nearest PEER_LIGHTS_MAX within PEER_LIGHT_RANGE of my eye.
   *  They join my own torch at the head of the light list (withPlayerLights), so the scene's lamps give way first. */
  const PEER_LIGHTS_MAX = 4, PEER_LIGHT_RANGE = 64;

  const peerCandlesFrame = (list, dt) => {
    const want = [];
    if (shared.online && cam?.pos) {
      for (const p of list ?? []) {
        const s = p?.shown;
        if (!s?.lc || s.dd || !shared.online.visible(p)) continue;
        const feet = shared.onlineToScene(s);
        if (!feet) continue;
        const cp = Math.cos(s.pitch || 0);
        const d = Math.hypot(feet[0] - cam.pos[0], feet[1] - cam.pos[1], feet[2] - cam.pos[2]);
        if (d > PEER_LIGHT_RANGE + 15) continue;
        want.push({ id: p.id, feet, height: shared.peerBodies?.heightOf(p.id) || CAPSULE_HEIGHT, forward: [Math.sin(s.yaw) * cp, Math.sin(s.pitch || 0), Math.cos(s.yaw) * cp], _d: d });
      }
      if (want.length > PEER_LIGHTS_MAX) { want.sort((a, b) => a._d - b._d); want.length = PEER_LIGHTS_MAX; }
    }
    const dc = shared.modes?.mode === 'dungeon' ? shared.modes?.dungeonCtx : null;
    try {
      if (dc?.peerCandles) { magic.peerCandles?.([], dt); shared._peerCandleLights = dc.peerCandles(want, dt) ?? []; }
      else shared._peerCandleLights = magic.peerCandles?.(want, dt) ?? [];
    } catch (err) { shared._peerCandleLights = []; console.warn(`[online] a peer's candle threw: ${err?.message ?? err}`); }
  };
  const _peerLights = [];

  const peerTorchLights = ({ torches = true } = {}) => {   // AUDIT PRE-MERGE 0928 M4: `torches` false - the abyss's torchOff: their candles alone
    _peerLights.length = 0;
    if (!shared.online || !cam?.pos) return _peerLights;
    const now = performance.now() / 1000;
    for (const p of torches ? shared.online.peers.values() : []) {
      if (!(p?.shown?.lt > 1) || !shared.online.visible(p) || p.shown.dd || !gateCrowd.shows(p.id)) continue;   // AUDIT CROWD-WIDE B3: no torch's light walking the walls with nobody under it
      const feet = shared.onlineToScene(p.shown);
      if (!feet) continue;
      let ph = shared._peerLightPhase.get(p.id);
      if (ph == null) { ph = Math.random() * 6.283; shared._peerLightPhase.set(p.id, ph); }
      const l = peerTorchLight(p.shown, feet, now + ph);
      if (!l) continue;
      const d = Math.hypot(l.x - cam.pos[0], l.y - cam.pos[1], l.z - cam.pos[2]);
      if (d > PEER_LIGHT_RANGE + l.range) continue;
      l._d = d;
      _peerLights.push(l);
    }
    if (_peerLights.length > PEER_LIGHTS_MAX) { _peerLights.sort((a, b) => a._d - b._d); _peerLights.length = PEER_LIGHTS_MAX; }
    for (const l of shared._peerCandleLights) _peerLights.push(l);   // PEERLIGHT2: and their Light spells' candles
    if (shared._peerLightPhase.size > 64) shared._peerLightPhase.clear();
    for (const l of auraWingLights(shared._auraWearers, cam.pos, shared._auraLights, auraVisualIntensity(mwViewThirdPerson()))) _peerLights.push(l); return _peerLights;   // SERAPH-WINGS: and the gold of the nearest wings, in every host's light list
  };
  const peerFxFrame = () => {
    _peerFxHp = playerEntity?.health ?? null;
    if (!shared.online) return;
    for (const p of shared.online.peers.values()) {
      if (!p?.shown || !shared.online.visible(p) || !gateCrowd.shows(p.id) || !peerRange.shows(p.id)) { shared.peerFxPlayer.forget(p?.id); continue; }   // GATE-CROWD: no spark nor cry from a player the crowd's count leaves undrawn; PEER-RANGE: nor from one past the distance
      shared.peerFxPlayer.update(p.id, p.shown, shared.onlineToScene(p.shown), shared.peerBodies?.heightOf?.(p.id) || 0);
    }
    shared.peerFxPlayer.frame();
  };
  /** PEERMENU1: THE BIND, PRESSED. The player under the crosshair (the plaque's own reach and wall rule) gets their
   *  menu - on the plaque where it stands, else the F-card; the same player again puts it away. Nobody there: nothing. */
  const openPeerMenu = () => {
    if (!shared.social || gamePaused() || !socialMenuCanOpen()) return false;
    const hit = peerInSight(cam.pos, socialFwd());
    if (!hit) return false;
    const id = hit.peer.id;
    if (worldPlaqueOn()) { shared.peerMenuFor = shared.peerMenuFor === id ? null : id; return true; }
    if (shared.socialMenu?.isOpen()) { shared.socialMenu.hide(); return true; }
    return shared.socialMenu?.show({ name: peerName(id) ?? 'Someone', peerId: id, actions: peerActsFor(id) }) === true;
  };

  /** PEERMENU1: once a frame - a hold's timer, and the menu put away when the crosshair leaves its player. */
  const peerMenuFrame = () => {
    shared.peerMenuReader?.frame();
    if (shared.peerMenuFor && (!shared.social || peerInSight(cam.pos, socialFwd())?.peer?.id !== shared.peerMenuFor)) shared.peerMenuFor = null;
  };
  const socialInteract = () => {
    if (!shared.social) return false;
    if (shared.profileWin?.isOpen()) { shared.profileWin.hide(); return true; }   // INSPECT1: F again closes the profile, as it closes the F-menu
    if (shared.pageWin?.isOpen()) { shared.pageWin.hide(); return true; }   // JOURNAL1: and the page read from it
    if (shared.socialMenu?.isOpen()) { shared.socialMenu.hide(); return true; }
    // ACT-MENU: where the plaque stands, the choosing is ITS - F presses the lit verb as the activate key does, and on
    // a player whose list is still unlit F lights its first row (AUDIT DISC7 A2: the keyboard's way onto the list, as
    // the wheel's first notch is). The card (a toggle over the world) is left to what the plaque cannot serve: a phone
    // (the tap's own ray), the classic skin, and a player the plaque does not name because a nearer thing won its race.
    if (worldPlaqueOn()) {
      if (plaquePeerAct()) return true;
      // PEERMENU1: F on a player whose menu is not up opens it, as the bind does
      const inFront = peerInSight(cam.pos, socialFwd());
      if (inFront && shared.peerMenuFor !== inFront.peer.id) { shared.peerMenuFor = inFront.peer.id; return true; }
      const lit = plaqueActionSelection();
      if (lit && lit.id == null && peerIdOfKey(lit.key) && plaqueLightFirst(lit.key)) return true;
    }
    // TI1's reading, minus the tap: the F-menu is a keyboard gesture and has no touch ray of its own.
    const hit = peerInSight(cam.pos, socialFwd());   // AUDIT DISC7 A6: not through a wall
    if (!hit) { shared.socialPanel?.toggle?.(); return true; }   // SOC3 owns `socialPanel`; until it lands this is a no-op that still consumes the key
    return shared.socialMenu?.show({ name: peerName(hit.peer.id) ?? 'Someone', peerId: hit.peer.id, actions: peerActsFor(hit.peer.id) }) === true;   // INSPECT1: the one bag - a player standing in front of you can always be looked at
  };

  /** ONE-SEAT: THIS TAB GIVES THE SEAT UP - the network's half, ONCE and AT ONCE: from the hub's close or the browser's
   *  word as it arrives (a hidden tab draws no frame, and its character must not stand in the room until its player
   *  comes back), and from the frame as a backstop. My foes to whoever stays and the room's last word first, as a fall's
   *  are (PDEATH-FOES, D12); then every session out and MARKED, so nothing joins, rejoins or retries (net/online.js
   *  supersede). The court and the words are the frame's (below). */
  const leaveSeat = (now) => {
    if (shared._seatLeft) return;
    shared._seatLeft = true;
    // AUDIT ONESEAT H2: THE SUPERSEDES ARE NOT BEHIND THE LAST WORD. `worldPublish` reaches collectWorld - deep game code,
    // in an event handler (AUDIT ONCRASH1 A7's own failure) - and a throw here skipped every session below: the tab kept
    // its rooms and its heartbeat while it said "offline", no frame asked again, and Play online here wedged the sessions
    if (shared.online?.room) {
      try {
        const handed = handOverFoes() || handOverRoomFoes();
        if (handed) console.info(`[foes] handed ${handed} foe(s) to the room - another tab has the seat`);
        worldPublish(now, true);
      } catch (e) { console.error('[online] the seat\'s last word could not be said - leaving anyway:', e); }
    }
    // AUDIT ONESEAT H6: a duel in play ends as `left` while the socket still stands (the opponent told now, not after
    // DUEL_GONE_MS), and its heal runs - as the page's exit does
    try { duelLeaveNow(); } catch { /* no duel built, none to end */ }
    shared.staffTeleportClient?.cancel();
    shared.cabinLink.close();
    shared.online?.supersede();
    for (const link of shared.chatLinks?.values?.() ?? []) link.supersede();
    // AUDIT PRE-MERGE 1003 O9: and the arena's own rooms (scenes/arena/arenaOnline.js leaveAll) - its hall's socket kept this tab
    // in the relay's queue, showed it the offer and sent it to the sand offline; its exhibition's and its verdict's too
    try { shared.arenaOnline?.leaveAll(); } catch (e) { console.warn('[online] leaving the arena\'s rooms', e?.message ?? e); }
    travellerBook.clear(); travellerSent.last = null;   // AUDIT TV C5: offline, nobody is seen travelling - and the next seat's room holds nothing of mine
    exteriorFoes.clearPuppets(); shared.modes?.clearOwnPuppets?.(); shared._foesRoom = null;
    // AUDIT ONESEAT H5: and the others' camps and their cells' kept teams, which the frame's tail prunes - a frame this
    // tab no longer reaches while out
    camps.sweepOwners(new Set(), now); hcc.pruneKept([], now);
    // AUDIT ONESEAT H3: offline now - the sigil in hand drinks nothing and a weapon won here is won offline (SIGIL1), and
    // the Renown layer is off, as it is for every offline character (RENOWN1); Play online here puts both back
    setFirmamentOnline(false);   // FIRM1: the sky sleeps offline, as the sigils do
    setSigilOnline(false); setRenownLayer(playerEntity, null); computeEntityMods(playerEntity);   // SET3 (main's, at the merge): the sets sleep with the sigils - their stat tiers folded out now, as a Renown rise folds them in
    shared.wagonRiders?.clear();   // WAGONS2 (FINAL AUDIT): offline, nobody rides with me nor I with anyone - my riders' seats were kept for the gone, my companions walking at heel and every journey waiting GO_LEAD_MS on them
    shared.caravanVisitLink.close();   // WAGONS2-VISIT: and the visited caravan's listener goes with the seat
    shared.seatLock?.release();
    console.info('[online] another tab, window or device has the seat - this one is offline');
  };
  /** ONE-SEAT: the word that the seat is gone - the hub's close, the browser's, a room's - acted on as it arrives. */
  const seatLostNow = () => {
    shared._seatOut = true;
    try { leaveSeat(performance.now()); } catch (e) { console.warn('[online] leaving the seat', e?.message ?? e); }
  };
  /** ONE-SEAT: THE PLAYER TAKES THE SEAT BACK - "Play online here". Every session may join again and the hub link's next
   *  hello claims (the other tab goes offline in turn), the browser's other tabs are told, and the rooms are joined as a
   *  page's first are: each channel now, by its tab's room, and the presence session on the next frame, by its key. */
  const takeSeat = () => {
    if (!seatOut()) return;
    shared._seatOut = false; shared._seatLeft = false; shared._seatSaid = false;
    setFirmamentOnline(true);   // FIRM1: and the sky wakes with them
    firmBook?.read().catch(() => {});   // AUDIT UICALM-FIRM1 L1 L3: as the service holds it now - another tab may have respecced or refunded while this one sat out
    setSigilOnline(true); setSigilRenown(renownNow); setRenownLayer(playerEntity, renownNow); computeEntityMods(playerEntity);   // AUDIT ONESEAT H3: online again (SET3: the sets' tiers with it)
    shared.online?.resume();
    for (const [tabId, link] of shared.chatLinks ?? []) {
      const room = shared.chatLog?.tab(tabId)?.room ?? null;
      link.resume({ claim: room === SOCIAL_ROOM });
      if (room) link.join(channelLinkRoom(room));   // SCALE5c: a channel's link to its own shard
    }
    shared.seatLock?.claim();
  };
  const onlineFrame = (now, dt) => {
    dungeonHoldFrame(now);   // ENTRY-HOLD: first, so no early return below keeps a dungeon's enemies held
    if (!shared.modes?.sailingCabin || seatOut() || playerEntity.health <= 0 || shared.modes?.deathUp?.()) shared.cabinLink.close();
    chatFrame();   // CHAT1: before the dead return, so the channels keep their heartbeat and their reconnect while the death screen is up (the panel itself is paused away like any HUD - AUDIT CHAT B7)
    tradeFrame();   // TRADE1: retries, timeouts, a peer gone or out of reach - before the dead return, as the chat's is
    duelFrame(); shared.wildFrame();   // DUEL1: the duel's law, and the ring my body is kept in - before the dead return, so a fall ends the duel; WILD1: wildFrame - the open zone's (where I stand, the fights' clocks, the bodies, the room's remains: the dead's too, my body's offer is answered while it lies)
    wedFrame();   // LEGACY7 part three: the wedding's clock, and the account's unions read again
    profileFrame();   // INSPECT1: the card's ask retried and its wait timed - the trade's own kind of work, beside it
    pageFrame();   // JOURNAL1: a page whose writer left the room goes with them
    shared._mailFrameAt = performance.now();   // MAIL1: the letterbox looks while this lane runs - SCALE4c: on the heartbeat (its part, above), before the dead return as the chat's heartbeat is
    shared.gateFrame();   // WB1: the Oblivion Gate's omen - its line when a new moment comes, before the dead return (the omen speaks to the dead too)
    shared.serpentFrame();   // SERPENT1: the sea serpent's sighting (to the dead too), and on the street its fight and its bar
    sdFrame();   // SD2b: the Hollow stood or taken down, its find, its lines - SD2d: in every mode, so its end reaches a player inside it
    shared.egFrame();   // EG-PLAY: an Elite Breach - its call, its halls, its fight, its tracker, its receipts - in every mode
    try { shared.ketch?.frame(); } catch (e) { console.warn('[kt] frame', e?.message ?? e); }   // KETCH: the voyage's words, the sky, the ship aboard, the receipts - in every mode
    try { shared.mines?.frame(); } catch (e) { console.warn('[mine] frame', e?.message ?? e); }   // BUNNYFALL (2026-11-25, caverns): mine mouths
    renownTracker?.tick();   // RENOWN1: what this character earned, to the account service when a report is due
    rollTracker?.tick();   // CHAP1: this character's standing with the guilds - read once, then what moved claimed when due
    peerMenuFrame();   // PEERMENU1: the bind's hold timer
    peerFxFrame();   // PEERFX1: the others' blows and hurts, played
    nameAsFrame();   // NAME-AS: a name chosen on this device said again in every room I hold - before the dead return, as the chat's channels keep theirs
    // REALM-DOOR: the relay shut its door on this tab's token as naming no realm character of its account - the character
    // deleted elsewhere, or the account signed out and another in: the realm's own end, to the Online door with the realm's
    // word (the relay's words are for a build from before the realm), before anything else this frame draws over it
    if (realmSession && !realmSession.lost && realmDoorShut(shared.online)) { realmLost('no-realm-character'); return; }
    // ONE-SEAT (Mac: "the player can only have one character only at a time"): another tab or window of this player has
    // the seat - out of every room once, then nobody drawn and nothing sent, the dead's own law (D12), until the player
    // presses Play online here
    if (seatOut()) {
      if (!shared._seatLeft) leaveSeat(now);
      if (!shared._seatSaid) {   // the frame's half: a court's fighter cast out (the court is online's alone), and the player told
        shared._seatSaid = true;
        if (shared.modes?.gateArenaDay?.() != null) ejectFromCourt(COURT_TEXT.lost);
        chatNotice(SEAT_NOTICE);
        setMidScreenText(SEAT_MID_TEXT);
      }
      // out of the seat a realm character still saves as it plays: the service's lease, not the seat, decides whose save lands
      checkpointWhenDue(now, shared._checkpointAt, realmSession, () => onlineCheckpoint());
      shared.peerBodies.destroy(); shared.remotePlayers.sync([], shared.onlineToScene); shared.peerRiders?.destroy(); shared.peerWalkers?.destroy(); peerCandlesFrame([], dt); return;
    }
    // AUDIT ONLINE D12: the dead broadcast nothing and see no one
    if (townTalk.overlay instanceof DeathScreen || shared.modes?.deathUp?.()) {
      if (shared._deathWasOnline == null) shared._deathWasOnline = _onlineWorldSession();   // D-ONLINE1: the modal hosts' deaths (a dungeon's, a building's) are captured here, BEFORE the leave below clears online.room
      { const hourSlot = shared.modes?.sdRealmSlot?.() ?? null; if (hourSlot != null) shared._sdFallen.add(hourSlot); }   // SD-ONELIFE: a death in the Hour is final for its Hollow (AUDIT SD III: under D-ONLINE1's capture, the block's first statement as AUDIT WORLD B6 and MWBODY1 hold it)
      if (shared._wildGhost && shared.online.room) shared.online.tick();   // WILD1: the ghost's socket kept alive (its pings, its reconnect) - it sends no pose
      if (shared._wildGhost && shared._wildGhostEndAt != null && Date.now() >= shared._wildGhostEndAt && !shared._wildDeposits.length) shared.wildGhostLeave();   // AUDIT INT9: a hall's or a building's ghost, its deposit gone
      if (shared.online.room && !shared._wildGhost) {
        // PCORPSE1: the body is left where it fell - one last pose, flagged, before the leave below takes the living figure
        shared._deadMark = shared.online._pose ? { k: shared.online.room, x: shared.online._pose.x, y: shared.online._pose.y, z: shared.online._pose.z, at: Date.now() } : null;
        shared._partyComposedAt = -Infinity;
        // PDEATH-FOES, AUDIT CONTRIB P1: my foes are the survivors' now (handOverFoes), named on my last frame BEFORE the
        // death pose; what nobody took stays mine
        const _handed = handOverFoes() || handOverRoomFoes();   // QUEST-PARTY phase 3b: or my building's
        if (_handed) console.info(`[foes] handed ${_handed} foe(s) to the survivors`);
        shared.online.sendDeath?.();
        // WILD1: a death in the open zone - at another player's hand (FOE-KEEPS: a foe's drops nothing) the bag and the
        // cart dropped to the room's remains while the room is still mine, and my worn gear offered to them: then my socket stays in the cell (a cell has
        // no host to hand over) while my body lies, so their pick reaches me (wildDeathBegin sets _wildGhost)
        shared.wildDeathBegin();
      }
      if (shared.online.room && !shared._wildGhost) { worldPublish(now, true); shared.online.leave(); exteriorFoes.clearPuppets(); shared.modes?.clearOwnPuppets?.(); shared._foesRoom = null; }
      // RESURRECT1: a party member's call, new since I fell - I rise where I lie. AUDIT CONTRIB A6: only while DEAD -
      // an outdoor respawn's teleport keeps this screen up for its whole await with the player already healed, and a
      // snapshot taken then outlived the respawn: the next death read an old call (cast at the old body, still on the
      // caster's pose) as new, and rose the instant it fell
      if (!shared._respawning) {
        if (!shared._rezSeen) shared._rezSeen = rezSnapshot(shared.social?.others() ?? []);
        const rez = shared.social?.acct && madeRuleHere('resurrect') !== 'refused' && hourRezOpen() ? rezFor(shared.social.others(), shared.social.acct, shared._rezSeen) ?? shared.legacyHost?.raised() ?? null : null;   // SD-ONELIFE: no Resurrect in the Hour - one life; EG-H2: nor in the Spire (the made level's law); EVENT-RULES (the owner: "Resurrect allowed"): no level refuses it now, and in the Hour only inside the realm's window (SD-REZ, systems/superDungeon/sdSlots.js mayRise) (AUDIT SD III: asked of the call, so the rise stays MWBODY1's `if (rez)`); REZ-BLOODLINE AUDIT R1: or the call the realm let go, the caster's pose done carrying it
        if (rez && shared.legacyHost?.raise(rez) !== false) { resurrectInPlace(rez); return; }   // REZ-BLOODLINE (FIELD BUGS 2026-10-16b): a Bloodline death held for it is let go; one decided for good stays down (legacyHost.js raise); AUDIT R1: the realm asked first - down until it answers
      }
      shared.peerBodies.destroy(); shared.remotePlayers.sync([], shared.onlineToScene); shared.peerRiders?.destroy(); shared.peerWalkers?.destroy(); peerCandlesFrame([], dt); return;   // PEERLIGHT2: and no candle hangs over the dead; AUDIT RIDE: and no rider stands frozen over it either
    }   // AUDIT WORLD B6: the dungeon's and the building's death screens stand in the mode's slot   // AUDIT MWBODY B7: and no body stands frozen over the death screen
    shared._rezSeen = null;   // AUDIT CONTRIB A6: alive - the next death takes its own snapshot of what the party's poses say
    tavernSocial.frame();   // TAVERN-SOCIAL: a round near me, a tip to me
    playerFestivals.frame();   // PLAYER-FESTIVALS: the registry read, the buff in a festival's town
    rescueLink.frame();   // BUNNY-SPELLS: a party member's Rescue naming me brings me to them
    checkpointWhenDue(now, shared._checkpointAt, realmSession, () => onlineCheckpoint());   // SCALE2b: the periodic one may be answered by the save the service holds (realmSaves.js idle)   // REALM P0.5: every ONLINE_CHECKPOINT_MS (five real minutes, CHECKPOINT-5), alive and in the seat (the first such frame persists the join's call-in)
    const mode = shared.modes?.mode ?? 'exterior';   // audit24_wave37: guarded on the OBJECT above its own declaration (the frame runs after it)
    const cabin = shared.modes?.sailingCabin;
    const overworld = mode === 'exterior';
    const wc = state.worldCoords(player.pos);
    let key;
    const mp = overworld ? worldCoordToMapPixel(wc.x, wc.z) : null;
    if (overworld) key = shared.siegeSession?.room() ?? shared.royalSession?.room() ?? roomKeyFor({ host: 'world', mode: 'exterior', mapPixel: mp });   // SEAT2a part four: a battle entered stands in its own room (CROWN1 part two: a Royal Tourney too)
    else if (shared.modes?.roomIdentity?.()?.kind === 'gate') key = (shared.gateLink?.room ?? gateRoomKey)(shared.modes?.roomIdentity?.()?.day);   // WB3b: the court's room is its gate's own - GATE-COURTS: the court the night's book seats me in
    else if (shared.modes?.roomIdentity?.()?.kind === 'sd') key = sdRoomKey(shared.modes?.roomIdentity?.()?.s);   // SD5a: the Hour's room is the relay's realm (SD3's _sdAdmit asks the Rift's law of its hello)
    else if (shared.modes?.roomIdentity?.()?.kind === 'eg') key = egRoomKey(shared.modes?.roomIdentity?.()?.b);   // EG-PLAY: an Elite Breach's room is the relay's breach (its hello asks the company's law)
    else if (shared.modes?.roomIdentity?.()?.kind === 'kt') key = shared.modes?.roomIdentity?.()?.key;   // KETCH: a crew's ship's room is the relay's `kt:<voyage>.<captain>` (its hello asks the crew's law)
    else if (shared.modes?.roomIdentity?.()?.kind === 'arena') key = arenaFloorRoomOf(shared.modes?.roomIdentity?.()?.o);   // ARENA4: a relay's bout's floor is its room (ARENA4b: the hour's exhibition's, `x<hour>`, its own)
    else {
      const ident = shared.modes?.roomIdentity?.();
      const loc = _questLoc();   // the location under the player: an interior's room is named by it
      key = ident?.private ? privateRoomHere(ident) : roomKeyFor({
        host: 'world', mode,
        mapId: ident?.kind === 'dungeon' ? seaVaultRoomId(ident.mapId ?? null, shared._wdunInside?.h ?? shared.seaVentures.vaultHere()?.key) : (ident?.sharedMapId ?? loc?.mapTableData?.mapId ?? null),   // AUDIT SEA VENTURES D7, D8: a vault of the deep's room its own lane (net/wire.js seaVaultRoomId) - the vault the gate let me into, or the day's I stand in
        regionIndex: ident?.kind === 'dungeon' ? ident.regionIndex : (loc?.regionIndex ?? -1),
        locationName: ident?.kind === 'dungeon' ? ident.name : (loc?.name ?? ''),
        buildingKey: ident?.buildingKey ?? 0,
        layout: ident?.layout ?? null,   // WD3 (AUDIT WD3 B3): an interior's room is its layout's
        size: ident?.kind === 'dungeon' ? (ident.size ?? null) : null,   // SD-ONLINE: and a dungeon's (`dungeon:m<id>.m` or `.s`, re-laid medium or small)
      });
    }
    // the pose: MapsFile's frame in the overworld (the floating origin's
    // inverse); a modal mode's own scene - the interior rides the
    // exterior's frame (P8), so its height sheds the origin's vertical
    // shift too (AUDIT ONLINE D7), the dungeon's frame is its own
    const shedY = overworld || mode === 'interior';
    const nativeFrame = overworld || !!privateInteriorOf(key);
    const pose = nativeFrame
      ? { x: wc.x, y: player.pos[1] - state.compensation[1], z: wc.z, yaw: cam.yaw, pitch: cam.pitch, mv: 0 }
      : { x: player.pos[0], y: shedY ? player.pos[1] - state.compensation[1] : player.pos[1], z: player.pos[2], yaw: cam.yaw, pitch: cam.pitch, mv: 0 };
    shared.onlineToScene = nativeFrame
      ? (p) => { const l = state.localFromWorld(p.x, p.z); return [l[0], p.y + state.compensation[1], l[1]]; }
      : (p) => [p.x, shedY ? p.y + state.compensation[1] : p.y, p.z];
    shared.sceneToOnline = nativeFrame ? campToWire : (q) => [q[0], shedY ? q[1] - state.compensation[1] : q[1], q[2]];   // AUDIT MERGE-PLUS B1
    const _hallAt = shared.modes?.roomIdentity?.()?.sharedOrigin ?? null;
    if (_hallAt) { pose.x = player.pos[0] - _hallAt[0]; pose.y = player.pos[1] - _hallAt[1]; pose.z = player.pos[2] - _hallAt[2]; shared.onlineToScene = (p) => [p.x + _hallAt[0], p.y + _hallAt[1], p.z + _hallAt[2]]; shared.sceneToOnline = (q) => [q[0] - _hallAt[0], q[1] - _hallAt[1], q[2] - _hallAt[2]]; }
    // CARDS2b: seated at a card table, the pose is the SEAT's - the feet and the facing the body is drawn at (the capsule
    // stands where it sat down from), in the room's frame like any point; `st` rides the arm below
    const seated = shared.modes?.seatPose?.() ?? null;
    if (seated) { const w = shared.sceneToOnline(seated.feet); pose.x = w[0]; pose.y = w[1]; pose.z = w[2]; pose.yaw = seated.yaw; }
    // ONLINE-MVFLICKER1 (Discord, 2026-09-18: "walking animation doesn't
    // complete, comes through only halfway"): `moved` used to be this
    // single frame's own delta, sent whichever frame the throttle below
    // (sendPose's own POSE_HZ gate) happened to let through - and a
    // receiving peer's mobile sprite (net/remotePlayers.js
    // _syncMobilePeer -> MobileUnit._change) resets to frame 0 on every
    // idle<->move edge, unconditionally, for any class with an idle
    // table of its own (characters/mobile/mobileUnit.js). One stray sampled
    // frame with a near-zero delta - a physics sub-step that had not
    // advanced yet, a single frame stalled on a collision, anything
    // that briefly reads as "did not move" while a player is plainly
    // still holding a direction - got sent as `mv:0` on whichever throw
    // of the dice landed on the actual wire send, and the very next
    // real "moving" packet started the walk cycle over from 0. Held
    // instead: once real movement is seen, "moving" reads true for
    // ONLINE_MOVE_HOLD_MS after the LAST frame that moved, so a single
    // unlucky sample can no longer flip the sent bit mid-stride. A
    // quarter second of lag on the transition TO idle is not
    // perceptible walking to a stop; a walk cycle restarting every few
    // packets is.
    // FIELD BUGS 2026-09-29 (the sea) #1: MOVED ON WHAT CARRIES ME - a deck I stand aboard (another's boat) or the one I
    // sail - never by its way: the helmsman pinned at the wheel and a passenger standing on a ship under way were sent as
    // walking, and the others drew a walk on a still body. Measured in that boat's frame as her bob carries it
    // (scenes/comeSailAway/comeSailAwayAboard.js deckPose), at the body's centre - the transform the helm pins; a new carrier (aboard,
    // ashore, a boat changed) measures from the next frame
    const carrier = csaOn() ? (csaAboard.aboard?.boat ?? (csaRuntime?.isSailing() ? csaRuntime.state.CurrentBoat : null) ?? shared.naval?.deckBoat?.() ?? null) : null;   // SEA-DECK: or a ship of the sea's
    const here = (carrier && csaLocalOf(csaDeckPose(carrier), [player.pos[0], player.pos[1] + player.height / 2, player.pos[2]])) || player.pos;
    const movedThisFrame = shared._onlineLast && shared._onlineLastOn === carrier ? (here[0] - shared._onlineLast[0]) ** 2 + (here[2] - shared._onlineLast[2]) ** 2 > 1e-6 : false;
    if (movedThisFrame) { shared._onlineMovingUntil = now + ONLINE_MOVE_HOLD_MS; _hsLatch = player.slowRide; }   // HORSE-WALK: the slow ride - under half its base, or walked (motor.js slowRide) - the slow clop theirs as mine
    const moved = now < shared._onlineMovingUntil;
    shared._onlineLast = [here[0], here[1], here[2]]; shared._onlineLastOn = carrier;
    if (key !== shared._onlineKey) { shared._onlineKey = key; shared._onlineKeySince = now; }
    // PROFILE2 (Mac: "make the profile icon visible somehow on the pause menu and allow changes"): MY LOOK, KEPT CURRENT.
    // A skin chosen on the pause screen or a coat put on is a look changed mid-session, and the look rode the hello
    // alone - the others drew the old one until the next room. Re-composed once a second (the equip table and one
    // store read) and handed to the session, which says it again only when it changed (net/online.js setLook).
    if (now - shared._onlineLookAt >= ONLINE_LOOK_CHECK_MS) { shared._onlineLookAt = now; shared.online.setLook(composeLook(playerEntity)); }
    // AUDIT RIDE: in the saddle the run bit is the GALLOP, and the motor never runs a mount (canRunUnlessRiding) - so
    // the bit is what the rider's own sprite shows: EOTB's chooseTable over the same motion bag (a speed past
    // GALLOP_SPEED), and the others draw the table this player sees
    const riding = (shared.modes?.mode ?? 'exterior') === 'exterior' && isRiding(player.transportMode);
    const mv = !moved ? 0 : riding ? (chooseTable({ riding: true, stopped: false, moveSpeed: tableMoveSpeed(player.moveForward, player.moveStrafe, player.moveSpeed) }) === 'GallopHorse' ? 2 : 1) : (player.isRunning ? 2 : 1);
    // MAC7 #1 (Mac: "no weapons"): the drawn flag and the swing ride the pose - the peers' bodies draw and swing off them;
    // MAC7 #2: the bow's hold (wd 2 while the machine sits in StrikeUp - BowDrawback's draw), the arrow, the spell stance, the cast
    // AUDIT WORLD C1: the MODE's rig - world.js's own is never stepped indoors or underground, so a peer in a
    // dungeon stood with the street's sheath flag and never swung; the mode machine names the live one
    const live = shared.modes?.liveArm?.() ?? null;
    const rig = live?.rig ?? weaponRig;
    const wm = rig.playerWeapon.machine;
    const arm = {
      mv,
      fk: (shared.modes?.mode ?? 'exterior') === 'exterior' ? shared._lastFootstepKind : (shared.modes?.footstepKind ?? 0),   // PEER-FS1: what peers should hear underfoot - see the cache's own header; AUDIT DROPS E2: indoors and underground the MODE's stride answers (wood, stone, the water arms), not the last outdoor surface
      wd: rig.playerWeapon.sheathed ? 0 : (wm?.isBow && wm.state === 'StrikeUp' ? 2 : 1),
      an: rig.swing.n, as: Math.max(0, POSE_STRIKES.indexOf(rig.swing.strike)),
      am: hasDaggerfallArrows(playerEntity.items) ? 1 : 0, sr: (live ? live.armed : magic.spellArmed()) ? 1 : 0,
      cn: rig.cast.n, cr: rig.cast.rangeType | 0, ce: rig.cast.element ?? 4,   // SPELLFX1: and its element, so the peers draw the right missile
      ar: rig.shot?.n ?? 0,   // SPELLFX1: and the arrows loosed, so the peers draw the shafts
      ...(rig.shot?.bl ? { bl: 1 } : {}),
      // RIDE: the mount - the horse or the cart, outdoors (a door dismounts), and which of Eye Of The Beholder's five
      // mounted sprite sets this player chose, so the others draw the rider they drew themselves
      rd: !riding ? 0 : player.transportMode === TRANSPORT_MODES.Cart ? 2 : 1,
      rv: Math.max(0, Math.min(4, (() => { try { return modSetting('eye-of-the-beholder', 'Graphics.OnHorse') | 0; } catch { return 0; } })())),   // AUDIT RIDE: the one key, not the mod's whole settings object every frame
      rc: riding ? riddenHorseLook(playerEntity.items ?? []) || undefined : undefined,   // COATS1: the look the horse under them wears (wire.js rideOf) - absent for the bay as drawn
      hs: riding && moved && _hsLatch ? 1 : undefined,   // DISC7: the motor's half-speed flag, the one fact the peers' clop swaps on (wire.js rideOf) - latched off a moving frame (AUDIT DISC7 B2), and absent rather than 0 (B8: the wire omits it at 0)
      // DISC12: the hand in use (the look carries both hands' weapons; the others drew the right one always, so a
      // left-handed fighter was a fist to them) and the beast form (LycanthropyEffect's isTransformed - the others saw
      // the person). Both absent rather than 0, the wire's omission law.
      ...poseHandsOf(rig.playerWeapon.usingRightHand, rig.swing.hand),   // AUDIT MIXED-PAIR L4-3: and `ah`, the hand a pair's last strike was (net/wire.js poseHandsOf)
      wb: (() => { const l = liveLycanthropy(playerEntity); return l?.isTransformed ? (l.infectionType | 0) || undefined : undefined; })(),
      ...tavernSocial.poseField(),   // TAVERN-SOCIAL: my rounds, my playing, my last tip
      ef: effectVfxBits(playerEntity) || undefined,   // BUNNYFALL SPELL VISUALS: what burns, freezes or bubbles on me, for the others to draw
      cv: lookConcealBits(playerEntity) || undefined,   // (how I look: a Decoy's caster is not drawn blended)   // INVIS-NET: my magical concealment (1 invisible, 2 blending, 4 a shade), so the others draw me as DFU draws every concealed entity that is not the player - absent when none, the wire's omission law
      hl: waistLanternPoseBit(playerEntity.lightSource),   // HT-WAIST-NET: a lit lantern hung at the waist, so the others' Morrowind bodies hang it at the hip - absent otherwise, the wire's omission law
      lc: hasActiveEffect(playerEntity, 'light') ? 1 : undefined,   // PEERLIGHT2: my Light spell burns, so the others hang its candle before me - absent otherwise
      lt: torchPoseByte(playerEntity),   // PEERLIGHT1: my lit torch/lantern/candle, so it lights the others' world around me - absent while nothing burns
      ...(shared.gatherHost?.poseAct() ?? {}),   // PEER-ACTS: my gathering act and its beats (scenes/gatherHost.js poseAct), so the others see me swing, kneel and throw and hear each beat - absent until I gather
      ...climbPoseOf(player),   // CLIMB5: my climb and the way my body faces on it, so the others turn me to the wall, pose me off the ground and hear me climb - absent off the wall
      ...shared.peerConjured.out(),
    };   // the wire's move bit: 1 walking, 2 running (the peers' bodies pick the clip off it)
    if (seated) arm.st = seated.st;   // CARDS2b: seated, and the table's top above the feet - absent standing, the wire's omission law
    shared.staffCommands?.tick(Date.now(), (line) => chatNotice(line));   // BUNNYFALL: a staff member's /greed for me, taken
    shared.staffDock?.frame();   // BUNNYFALL: the staff panel's button, staff only
    if (shared.staffFollow.frame()) key = null;   // STAFF-PANEL5-FOLLOW: a follow's body stands in no room - the hook's hidden links watch (above HALO-THIN's word, which stands over WAGONS2-VISIT's close and the join: test/net/halothin.test.js, test/systems/wagons2_visit.test.js)
    shared.online.haloWhole = !!shared.duelMgr.duel || shared._serpentFight;   // HALO-THIN (net/online.js haloPoseDue): a halo hears my pose when it is due - every pose while a referee may stand in one (a duel's bout is refereed in the room my opponent is heard through, a serpent's trail in the fight's); never the open zone's - its referee holds me by the zone word, which my own cell's socket alone says (AUDIT B F4)
    if (!shared.modes?.caravanVisit) shared.caravanVisitLink.close();   // WAGONS2-VISIT: no visit, no listener - closed before my primary joins the cell it heard (never replaced by my own id)
    if (!key) { if (shared.online.room) shared.online.leave(); }   // AUDIT ONLINE D4: a place the host cannot name is no room, not the old one in the wrong frame
    // AUDIT WORLD2 C8: a world room's edge is never a churn - the hold delayed every handover and let one dungeon's stream land in another
    // AUDIT WORLD6b-iii(b) B1/B8: a cell crossing is joined the moment the cell is HELD (the halo's socket promotes in
    // place - the hold bought nothing but a 500 ms strip with no socket in the cell I stood in); HALO-WAIT: and so is one
    // whose halo is still connecting (net/online.js `crossesNow` - the join waits for it, my pose sent meanwhile, where
    // the hold sent none); otherwise the hold
    else if (key !== shared.online.room) { if (!shared.online.room || isWorldRoom(key) || isWorldRoom(shared.online.room) || (isGateRoom(key) && isGateRoom(shared.online.room)) || (isCellRoom(key) && shared.online.crossesNow(key)) || now - shared._onlineKeySince >= ROOM_HOLD_MS) { shared.online.setLook(composeLook(playerEntity)); shared.online.layerHint = shared.partyLayerAt(key); shared.online.join(key, { ...pose, ...arm }); } }   // the look re-composed: the next room's hello carries the gear worn now (PROFILE2: through setLook, so a halo the join PROMOTES - no hello of its own - is told too)
    else shared.online.sendPose(pose, arm, poseFx);   // PEERFX1: and my landed blows and the blows I took
    shared.siegeSession?.tick();   // SEAT2a part four: the battle's pass, its `in`, its HUD, its window
    if (shared.siegeNpcs) { if (inSiegeRoom()) shared.siegeNpcs.frame(shared.siegeSession.npcs(), battleNowMs()); else shared.siegeNpcs.leave(); }   // SEAT2b part two (c): the relay's own fighters, in its room alone
    shared.royalSession?.tick();   // CROWN1 part two: the tourney's pass, its `in`, its HUD, its week
    // AUDIT-SEATS G5 (Seats-Arc 6.1: "Horses are dismounted on entry"): no rider in a siege's room - set on foot, said
    if (inSiegeRoom() && isRiding(player.transportMode)) { setTransportModeHere(TRANSPORT_MODES.Foot); townTalk.say(SIEGE_DISMOUNT_TEXT); }
    spectatorFrame();   // AUDIT-SEATS G4: a spectator's free camera begun - or, its watching over, set back where it stood
    // WB3b: THE COURT'S ROOM HEARS MY LEVEL CLAIM once per welcome (net/gate/gateBrain.js - the health I bring into the fight
    // and the bucket I may deal from); a reconnect's welcome says it again, and the relay keeps my first
    if (shared.gateLink && shared.online.gateOk && isGateRoom(shared.online.room) && (shared.online.welcomes !== shared._gateInFor || shared.gateCourt?.askAgain()) && shared.online.sendGate({ k: 'in', lv: Math.max(1, playerEntity.level | 0), bv: GATE_BRAIN_V })) shared._gateInFor = shared.online.welcomes;
    // PERF11 (2026-09-19, Mac: "Online mode needs further performance
    // improvements"): ONE peersNear() A FRAME. The owner sweeps below -
    // the foes' prune and the camps' - each built the list from scratch
    // and then a Set of its ids from scratch, twice a frame, for the
    // same answer: peersNear() walks every peer in the room and mints an
    // object and a scene triple apiece, so a busy room paid all of it
    // and then paid it again. The memo is per frame and lazy, so a room
    // that is not a cell room still builds nothing.
    let _ownerIds;
    const ownerIds = () => {
      if (_ownerIds !== undefined) return _ownerIds;
      const near = peersNear({ presenceOnly: true });
      _ownerIds = near ? new Set(near.map((p) => p.id)) : null;
      return _ownerIds;
    };
    // WORLD6b-iii(b) THE CELL SEAM: the neighbouring cells within the relay's range are held as a HALO - hello'd and
    // posed into, so a peer a pixel across the edge is in my room and I in theirs (D9); a crossing promotes the halo
    const wantHalo = mp && isCellRoom(shared.online.room) ? cellHaloFor(mp.x, mp.y, { current: shared.online.haloRooms() }) : [];
    if (mp && isCellRoom(shared.online.room) && isCellRoom(key) && key !== shared.online.room) wantHalo.push(key);   // AUDIT WORLD6b-iii(b) B1: the cell I STAND in, until the join promotes it - the list is the new pixel's, which names neither the old cell (my own) nor the new one (the pixel's), so the crossing frame CLOSED the halo the promotion was for
    if (wantHalo.some((r) => !shared.online.haloRooms().includes(r))) shared.online.setLook(composeLook(playerEntity));   // AUDIT WORLD6b-iii(b) C5: a halo about to open hellos with the gear worn NOW (a promotion sends no hello of its own)
    shared.online.setHalo(wantHalo);
    shared.online.tick();
    if (cabin && key) shared.cabinLink.tick(shared.online, cabin, worldCoordToMapPixel(cabin.origin[0], cabin.origin[2]), now);
    // WORLD6b: a room change leaves every puppet in the old cell; a peer gone from the room takes its puppets with it.
    // WORLD6b-iii(b): a cell crossing is no room change to the puppets - their owners' cells are still held (the
    // halo) and the prune below takes back any whose owner the hunt no longer sees
    if (shared.online.room !== shared._foesRoom) { const seam = isCellRoom(shared.online.room) && isCellRoom(shared._foesRoom); shared._foesRoom = shared.online.room; shared._foesFullAt = -Infinity; shared._ownFullAt = -Infinity; if (!seam) { exteriorFoes.clearPuppets(); shared.modes?.clearOwnPuppets?.(); } }   // AUDIT WORLD6b C7: a new room hears every foe of mine at once; QUEST-PARTY phase 3b: the own lane too
    if (isCellRoom(shared.online.room)) { const ids = ownerIds(); if (ids) exteriorFoes.pruneOwners(ids, now); } else if (isWorldRoom(shared.online.room)) { const ids = ownerIds(); if (ids) shared.modes?.pruneOwnOwners?.(ids, now, FOES_STALE_MS); }   // QUEST-PARTY phase 3b/3c: a world room's owners go as a cell's do   // PERF11: the one list   // AUDIT WORLD6b-iii(b) C3/B5: no answer (the socket not open) is not "nobody" - it pruned every owner while the halos kept feeding frames, a spawn-and-discard loop per frame   // AUDIT WORLD6b-ii C2: ONE liveness for the owner - the peers the hunt reads (visible: a pose, in range, inside the timeout) are the peers whose puppets stand
    worldPublish(now);   // WORLD1: the room's memory, every WORLD_PUBLISH_MS while this player hosts a dungeon
    if (shared._wodSprungChanged) { shared._wodSprungChanged = false; shared._foesFullAt = -Infinity; }   // WOD7: a marker I just sprang goes out whole
    foesStream(now);   // WORLD2: the host's changed foes, every FOES_MS; WORLD6b: mine, in a cell
    ownStream(now);    // QUEST-PARTY phase 3b: mine in a building, on the room's own lane
    actFlush();        // AUDIT WORLD3 A3: an act the wire refused, re-read and re-sent
    hitFlush(now);     // AUDIT FOES FOE2: and a BLOW the wire refused - a joiner applies none locally, so a lost frame is a lost blow
    seatClock.frame(now); shared.modes?.setDungeonAuthority?.(!_entryHold.held && dungeonAuthority(now));   // SEAT-LIVE: this frame told the clock first (a gap is the page away, not the seat); AUDIT WORLD2 C2: the seat re-read every frame - a dead socket, a terminal close or a silent host hands the foes back
    hccParkTick(now); doorToken.frame();   // HCC-PARK: my parked team's word to the cell it stands in, when it changed   // DOOR-TOKEN: the way out approached - its token minted on the walk to the door
    overworldLedgerFrame(now); searchPartyFrame(now);   // OW6L: what I spent and my spawns' clocks, to the cell that keeps them; GRAVE-PARTY: and the stones I searched
    caravanDecorTick(now);   // WAGONS2-VISIT: what I placed in my caravan, to its room, when it changed
    shared.caravanVisitLink.tick(key ? shared.online : null, shared.modes?.caravanVisit ?? null);   // WAGONS2-VISIT: the visited caravan's cell, heard from inside it (after my primary's own join and tick)
    if (isCellRoom(shared.online.room)) { const ids = ownerIds(); if (ids) camps.sweepOwners(ids, now, FOES_STALE_MS); }   // PERF11: the same list   // SURV3: a peer's camps go as their puppets do - the same liveness, the same answer-gate   // AUDIT WORLD6b-iii(b) C3/B5: no answer (the socket not open) is not "nobody" - it pruned every owner while the halos kept feeding frames, a spawn-and-discard loop per frame   // AUDIT WORLD6b-ii C2: ONE liveness for the owner - the peers the hunt reads (visible: a pose, in range, inside the timeout) are the peers whose puppets stand
    if (isCellRoom(shared.online.room)) { const ids = ownerIds(); if (ids) hcc.sweepOwners(ids, now, FOES_STALE_MS); }   // HCC-ONLINE: a peer's team goes as their puppets and camps do - the same memoised list, the same liveness   // PERF11: the same list   // SURV3: a peer's camps go as their puppets do - the same liveness, the same answer-gate   // AUDIT WORLD6b-iii(b) C3/B5: no answer (the socket not open) is not "nobody" - it pruned every owner while the halos kept feeding frames, a spawn-and-discard loop per frame   // AUDIT WORLD6b-ii C2: ONE liveness for the owner - the peers the hunt reads (visible: a pose, in range, inside the timeout) are the peers whose puppets stand
    if (isCellRoom(shared.online.room)) { const ids = ownerIds(); if (ids) csaPeers.sweepOwners(ids, now, FOES_STALE_MS); }   // CSA-J: a peer's boats go as their team does - the same memoised list, the same liveness
    if (isCellRoom(shared.online.room)) { const ids = ownerIds(); if (ids) shared.wagonRiders?.sweep(ids); }   // WAGONS1: a rider of mine gone from the room gets down with them
    if (isCellRoom(shared.online.room)) { const ids = ownerIds(); if (ids) csaAboard.sweepRiders(ids, now, FOES_STALE_MS); }   // CSA-K: and their place aboard a boat
    hcc.pruneKept(isCellRoom(shared.online.room) ? [shared.online.room, ...shared.online.haloRooms()] : [], now);   // HCC-PARK: a kept team is its CELL's - it stands while I hold that cell's socket (mine or a halo's), and its welcome brings it back
    // INVIS-NET (2026-09-27, Mac relaying reports: "Other player's still see other players who are suppose to be
    // invisible"): a peer MAGICALLY CONCEALED (the pose's `cv` - invisible, blending, a shade) is drawn as DFU draws every
    // concealed entity that is not the player (EntityConcealmentBehaviour: the renderer off) - no rider, no body, no
    // walker, no sprite and no name. Its cast is still seen (a missile leaves an invisible caster's hand in DFU too).
    // INVIS-LOOK (2026-09-27, Mac: "Give invisibility the same invisibility we give enemies in enhanced AI. That
    // transparent look"): that is the CLASSIC law now. Under Enhanced Combat Visuals (combatVisualsOn - the switch a
    // concealed foe's look takes) a concealed peer is drawn in the look a concealed foe is - translucent, shimmering,
    // a shade dark - in whatever stands for them (the rider, the Morrowind body, the walker, the sprite, the doll), and
    // an invisible one takes the shimmer (systems/combatVisuals.js peerDraw). Still no name.
    // AUDIT DEEP2 D6: under the travel view the riders and the walkers take the VIEW's eye and its right, as R-11 gave the
    // dolls - their 8-way picture, their sprite's offset and their lantern were the traveller's, edge-on as the view orbited
    const peerYaw = shared.travelView?.active && shared.travelView.camera ? shared.travelView.camera.yaw : cam.yaw;
    const peerEye = shared.travelView?.eye ?? cam.pos, peerRight = [Math.cos(peerYaw), 0, -Math.sin(peerYaw)];
    const tvGrow = shared.travelView?.active ? peerGrow : null;   // OW-PEERS: the others grown under the Overworld, as the traveller is
    const drawable = isCellRoom(shared.online.room) && csaOn() ? csaAboard.glue(shared.staffFollow.drawable(), { poseOf: (o, i) => csaPoseAhead(o, i, dt) ?? shared.naval?.deckAhead?.(o, gamePaused() ? 0 : dt * worldTimeScale()) ?? null, toWire: campToWire, dt }) : shared.staffFollow.drawable(); if (hccOn()) hcc.seatGlue(drawable, { toWire: campToWire });   // WAGONS2: the others seated in a wagon's back drawn on its seats as it is drawn here   // CSA-K: a peer aboard a boat stands on its deck as it is drawn here - its owner's (mine among them) or the one led here - never a stride behind it
    _peerMapPoses.clear();
    for (const d of drawable) if (d?.shown) _peerMapPoses.set(d.id, d.shown);
    if (hccOn()) hcc.driverGlue(drawable, { toWire: campToWire });   // WAGONS3: a driver on their bench, drawn seated there - after the map's poses, where `peerAnchor` reads the puller their wagon hangs from
    const ranged = peerRange.cut(cabin ? drawable : drawable.filter((d) => !csaPeers.isBelowDeck(d.id)), { on: !shared.travelView?.active, me: player.pos, at: (d) => shared.onlineToScene(d.shown), range: peerRangeOf(getPref('peerRange')), mate: (id) => !!shared.social?.isPartyPeer(id) || id === shared.duelMgr.opponent || shared.online?.peers?.get?.(id)?.shown?.bp === 1 });   // BUNNYFALL: a bard performing is never cut by distance; PEER-RANGE (2026-10-10, the owner: "the rendering of players far out is contributing to poor performance"): past the distance on the Other players card a player stands nowhere on this screen - GATE-CROWD's cut by distance (net/peer/peerRange.js): my party and the one I duel always, nobody cut under the travel view (OW-PEERS grows them to be seen from overhead); their map marks, above, are kept
    const visiblePeers = gateCrowd.cut(ranged, { on: shared.modes?.gateArenaDay?.() != null || !(shared.travelView?.active || (wildHere() && !cromwarkPeace(wildZoneKind())) || shared.siegeSession?.active() || shared.royalSession?.active() || shared.modes?.roomIdentity?.()?.kind === 'arena'), me: player.pos, at: (d) => shared.onlineToScene(d.shown), max: gateCrowdMax(getPref('gateCrowd')), mate: crowdKept(shared.social?.partyPeers?.(), [shared.duelMgr.opponent, shared.tradeMgr.session?.peer], shared.wagonRiders?.ridingWithMe(), csaAboard.shipmates(), _duelRings.keys()) });   // GATE-CROWD (2026-10-07, Mac: "some type of filter when there are too many people"): past the count on the Other players card only the nearest are drawn, my party always (net/gate/gateCrowd.js) - the rest stand nowhere on this screen this frame: no body, sprite, name, light, cast or step (their map marks, above, are kept); CROWD-WIDE (2026-10-23, the owner: "implement the player toggle we have for the oblivion gate into the entire game"): everywhere, not the court alone - but never where a stranger can fight me (the open zone, a battle, an arena's room) nor under the travel view; AUDIT CROWD-WIDE A2: never cut, those I fight, trade, ride or sail with and a duel's two fighters (net/gate/gateCrowd.js crowdKept)
    shared.peerConjured.frame(drawable, dt);
    peerCastVisuals(visiblePeers);   // SPELLFX1: a peer's new cast, drawn once
    if (shared.modes?.gateArenaDay?.() != null) shared.gateCourt?.stepsIn(drawable, (d) => (d?.shown ? shared.onlineToScene(d.shown) : null));   // AUDIT GATE-FBX C3: a player stepping out of the court's way in opens it - every one in the room, the crowd's cut or not (the fire is the court's, not a body this screen draws)
    shared._veilT += dt > 0 ? dt : 0;
    _veils.clear(); _hiddenPeers.clear();
    for (const d of drawable) if (!cabin && csaPeers.isBelowDeck(d.id)) _hiddenPeers.add(d.id);
    const veilOn = combatVisualsOn();   // ECV1: once per frame
    const seen = [];
    for (const d of visiblePeers) {
      const look = peerDraw(d.shown?.cv | 0, veilOn, shared._veilT, d.id);
      if (look.kind === 'hidden') { _hiddenPeers.add(d.id); continue; }   // INVIS-NET: the classic lane - the concealed stand nowhere here
      const veil = look.kind === 'conceal' ? look.visual : shared.egClient?.allyVeil(shared.social?.accountOfPeer?.(d.id), d.shown, shared.onlineToScene) ?? null; if (veil) _veils.set(d.id, veil);   // AUDIT EG V (h; Elite-Gates.md section 8.2): an ally on the Spire's traversal ground at 60% (scenes/eliteGates/egClient.js allyVeil)
      seen.push(d);
    }
    peerCandlesFrame(seen, dt);   // PEERLIGHT2: the others' Light spells - candle and light, in the live mode's engine; INVIS-NET x PEERLIGHT2 (the merge): hung only before a player drawn here, so the classic lane's concealed carry no candle to give them away
    // RIDE (2026-09-23, Mac: "ensure over people see others riding on horses"): a peer in the saddle is drawn as the
    // rider FIRST, so the body and the doll below stand nothing for them and their name rides over the rider
    // PR-WW1 (2026-09-24, player report: "Werewolf morrowind sprite not showing online"): and a peer in BEAST FORM the
    // same way - Eye Of The Beholder's lycanthrope, the one the transformed player sees on themselves (net/peer/peerRiders.js).
    // `cam.pos` is the live eye in every mode: worldModes shares this `cam` and sets it each modal frame
    // WEREWOLF1: a werewolf on foot whose Morrowind wolf stands here (Bloodmoon attached) is the body's, not the rider
    // layer's - and it goes to the bodies either way, so its wolf is built (and kept) while the rider layer's lycanthrope
    // stands for it; the wereboar has no Morrowind form and stays the rider layer's alone. AUDIT E4: the rider layer
    // DEFERS the werewolf on foot and settles it after the bodies have synced - whether its wolf stands is THIS frame's
    // answer, so the frame a peer transforms, its wolf first stands or walks out of range draws it once
    // COATS3D: and a peer on a HORSE, on the lane that builds them a Morrowind body, rides the 3D horse in it - the rider
    // layer yields them (peerRidesIn3d), so they are the bodies' (net/peer/peerBodies.js) as a peer afoot is
    const skinnedPeer = (d) => !(d.shown?.wb | 0) && peerWearsSkin(d);   // BUNNYFALL: a custom paperdoll's wearer is the doll alone (net/remotePlayers.js) - no body, rider or set
    const bare = seen.filter((d) => !skinnedPeer(d));
    shared.peerRiders.sync(bare, shared.onlineToScene, { eye: peerEye, right: peerRight, dt, defer: (d) => peerIsWolf(d.shown), yields: peerRidesIn3d, conceal: veilOf, grow: tvGrow });
    const afoot = bare.filter((d) => (peerRidesIn3d(d) || !shared.peerRiders.isRiding(d.id)) && !d.shown?.wb || (peerIsWolf(d.shown) && !d.shown.rd));   // COATS3D (AUDIT A3): a rider on the 3D horse the bodies' whether or not its sprite stood in for it last frame   // DISC12: a beast wears no Morrowind body; PR-WW1: it stands as EOTB's lycanthrope (peerRiders), or - while that art is not up - as the beast's enemy sprite (remotePlayers); WEREWOLF1: but a werewolf on foot does, Bloodmoon's
    shared.peerBodies.sync(afoot, shared.onlineToScene, dt, player.pos, { priority: (id) => !!shared.social?.isPartyPeer(id), conceal: veilOf });   // the nearest first, the far ones asleep; AUDIT PARTY8: a party mate before a stranger
    // DISC23-B: a peer on foot who stands in no Morrowind body here stands as the Eye Of The Beholder set they chose -
    // after the bodies (a Morrowind player's own choice for everyone they meet), before the class sprite and the doll
    shared.peerWalkers.sync(bare, shared.onlineToScene, { eye: peerEye, right: peerRight, dt, skip: (id) => shared.peerBodies.heightOf(id) > 0, hurt: (id) => peerHurtAge(id) < PEER_FLINCH_S, conceal: veilOf, grow: tvGrow });   // PEERFX3: a class skin's hurt pose
    shared.peerRiders.settle((id) => shared.peerBodies.wolfStands(id), (id) => shared.peerBodies.has(id));   // COATS3D (AUDIT A3): a rider on the 3D horse whose body did not stand is drawn as the sprite rider   // WEREWOLF1 (AUDIT E4): the deferred werewolves, now the bodies have stood - before anything reads the riders
    auraFrame(seen); shared.effectVfx.peers(seen);   // BUNNYFALL SPELL VISUALS: the drawn peers' effects too   // WB9g: the auras at the feet - mine and the drawn peers' - gathered with the rest
    // PCORPSE1: a body heard in a room this scene has left for another KIND of space (a dungeon's local frame, the
    // street's world frame) is not this scene's to draw; one heard anywhere in the overworld's cells still is
    // PCORPSE3: a party member's body their party pose tells of, that the death pose never brought me (I was between
    // sockets - a resurrection's rejoin - or I came after); and the body of one who got up, taken away
    if (shared.social?.party) {
      const others = shared.social.others();
      for (const m of others) {
        const dd = m.p?.dd;
        if (!dd) { if (_partyBodies.delete(m.acct)) shared.remotePlayers.partyRose(m.acct); continue; }
        _partyBodies.add(m.acct);
        const id = m.peers?.[0] ?? null;
        const here = dd.k === shared.online.room || (isCellRoom(dd.k) && isCellRoom(shared.online.room));
        shared.remotePlayers.partyBody(m.acct, id, (id && (shared.online.peers.get(id)?.look ?? shared.online._known?.get?.(id)?.look)) ?? null, dd, here);
      }
      for (const acct of [..._partyBodies]) if (!others.some((m) => m.acct === acct)) { _partyBodies.delete(acct); shared.remotePlayers.partyForget(acct); }
    }
    if (shared.online.room) shared.remotePlayers.keepCorpses((r) => r === shared.online.room || ((isWorldRoom(r) || isCellRoom(r)) && (isWorldRoom(shared.online.room) || isCellRoom(shared.online.room))));   // PCORPSE2: never judged while between rooms (a cell crossing's gap) - no room is not another space
    shared.remotePlayers.sync(visiblePeers, shared.onlineToScene, { bodyHeight: (id) => shared.peerRiders.heightOf(id) || shared.peerBodies.heightOf(id) || shared.peerWalkers.heightOf(id), dt, eye: shared.travelView?.eye ?? player.pos, poseAgeMs: (p) => shared.online.poseAgeMs(p), conceal: veilOf, hidden: (id) => _hiddenPeers.has(id), grow: tvGrow, room: drawable });   // AUDIT PEER-RANGE A L1/L6: the room's whole list - a rise past the draw distance is seen, and a cut peer keeps its sprite's bundle   // AUDIT (pre-merge) I-G: every peer HEARD (a concealed one's steps, swings and hooves - sound is no renderer), the classic lane's concealed drawn nowhere   // 2026-09-17: dt drives the class-enemy billboard path's own animation clock; eye is the local player's own position, needed for mobileOrientation's facing calculation (see remotePlayers.js _syncMobilePeer)   // AUDIT DEEP R-11: under the travel view, the view's own eye - the picture each peer shows is the one the camera sees
    peerFlashFrame();   // PEERFX3: after every layer has (re)made its sprites this frame
  };
  /** SPELLFX1 (the Unity co-op's RpcPlayPlayerSpellCastVisual): EVERY PEER'S CAST, DRAWN. The pose already carries the
   *  cast count, its range and now its element; a count that moves on a peer I could see last frame is one cast, and
   *  it goes to the live mode's engine as a visual - a missile from the peer's eye along their aim, or a flash for a
   *  touch, self or area cast. A peer I could not see (new, far, back from a gap) is re-read silently, so a cast out
   *  of sight is not replayed on arrival. It lands nothing: a blow travels by the hit frame and a gift by ALLY-CAST's cast frame. */
  function peerCastVisuals(list) {
    shared._castFrame++;
    const dc = shared.modes?.mode === 'dungeon' ? shared.modes?.dungeonCtx : null;
    const fx = dc?.spellVisual ?? magic.spellVisual;
    for (const p of list) {
      const s = p?.shown;
      if (!s) continue;
      const cn = s.cn | 0, ar = s.ar | 0, was = _castSeen.get(p.id);
      _castSeen.set(p.id, { cn, ar, frame: shared._castFrame });
      if (!was || was.frame !== shared._castFrame - 1 || (was.cn === cn && was.ar === ar)) continue;
      const feet = shared.onlineToScene(s), h = shared.peerBodies?.heightOf(p.id) || CAPSULE_HEIGHT;
      const eye = [feet[0], feet[1] + (s.rd ? RIDE_EYE_HEIGHT : h - 0.2), feet[2]];   // AUDIT RIDE: a rider's eye is the saddle's (PlayerHeightChanger's ride height), not a standing body's
      const dir = [Math.sin(s.yaw) * Math.cos(s.pitch), Math.sin(s.pitch), Math.cos(s.yaw) * Math.cos(s.pitch)];   // socialFwd's own formula - the pose's yaw/pitch ARE the sender's cam
      if (was.cn !== cn) {
        try { fx({ from: eye, dir, element: s.ce ?? 4, rangeType: s.cr | 0, casterId: p.id }); } catch (err) { console.warn(`[online] a peer's cast visual threw: ${err?.message ?? err}`); }
      }
      // SPELLFX1: and their ARROW - a shaft from their eye along their aim, in the live mode's own arrow pool
      if (was.ar !== ar) {
        const from = [eye[0] + dir[0] * 0.6, eye[1] + dir[1] * 0.6, eye[2] + dir[2] * 0.6];   // clear of their own body
        try { if (!shared.modes?.visualArrow?.(from, dir, !!s.bl)) arrows.fire(from, dir, { visual: true, peerBolt: !!s.bl }); } catch (err) { console.warn(`[online] a peer's arrow visual threw: ${err?.message ?? err}`); }
      }
    }
    if (_castSeen.size > (shared.online?.peers.size ?? 0) + 16) for (const [id, v] of _castSeen) if (v.frame !== shared._castFrame) _castSeen.delete(id);
  }
  /** OW-PEERS (FIELD BUGS 2026-10-01 #11, "you cannot see other player's sprites"): under the Overworld the traveller's
   *  own body is drawn grown with the eye's distance (OW-BIG, tvOwnGrow) and every other player was drawn at its own
   *  size - a speck at 330 m under the name that stood over it. Each is grown by the same law at its own feet; 1 off
   *  the view. */
  const peerGrow = (f) => { const e = shared.travelView?.active ? shared.travelView.eye : null; return e ? tvOwnGrow(Math.hypot(e[0] - f[0], e[1] - f[1], e[2] - f[2])) : 1; };
  const drawPeerBodies = (proj, view, eye, face = null) => { if (shared.peerBodies) shared.peerBodies.draw(canvas, { proj, view, eye, flashOf: peerFlashOf, grow: face ? peerGrow : null, up: face?.up ?? null }); shared.peerWalkers?.drawLanterns(); (_mode() === 'interior' ? shared.familyRoom : _mode() === 'exterior' ? shared.familyStreet : null)?.draw(canvas, { proj, view, eye }); };   // LEGACY7 part four: and the line's own bodies, in the place they stood   // OW-PEERS: under the Overworld the bodies grown and leaned as the traveller's own   // HT-WAIST-BACK: the walkers' lanterns, each on its own tilted basis, beside the bodies - every mode's pass calls this after the player's own body (the exterior here, the dungeon and the interior through host.drawPeerBodies)

  const drawVeiledPeerBodies = () => { shared.peerBodies?.drawVeiled(); drawAuras(); shared.effectVfx.draw(); shared.nodeGlintPass.draw(shared.travelView?.active ? null : nodeMarksAt(enchantFeet())); shared.partyPing?.draw(renderer); };   // WB9g: and the auras, after the opaque world as the veiled are; NODE-MARKS: and the nodes' light - NODE-GLINT's glints, the glow a node with no picture

  const _auraSelf = { id: 'self', at: [0, 0, 0], aura: null, seed: 0.37, kindle: 1, since: 0, yaw: 0 };   // SHADOW-CLOAK: `yaw` the facing the cloak's opening faces

  const auraSeedOf = (id) => { let h = 2166136261; for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return ((h >>> 0) % 997) / 997; };
  function auraFrame(seen) {
    shared._auraWearers.length = 0;
    if (!shared.online || shared.travelView?.active) return;
    if (shared.egClient?.quiet?.()) return;   // EG-E2 (Elite-Gates.md section 25.4, THE QUIET COMPANY): no cosmetic aura during a Spire's trial
    const t = performance.now() / 1000;
    const mine = ownAura(); if (shared._auraHeard !== undefined && mine !== shared._auraHeard && shared.online.rehello?.()) shared._auraHeard = mine;   // the service's last word on my own - a mint's, a wear's from any door; AURA-LIVE: one the room's token did not say (a wear since) is said again, so the room sees it now
    if (!auraVisualIntensity(mwViewThirdPerson())) return;
    if (mine && shared.playerSpawned) {
      const f = player.feetAt();
      if (_auraSelf.aura !== mine) _auraSelf.since = t;
      _auraSelf.at[0] = f[0]; _auraSelf.at[1] = f[1]; _auraSelf.at[2] = f[2]; _auraSelf.aura = mine; _auraSelf.yaw = mwViewSpriteFacing()?.yaw ?? player.bodyYawFor(cam.yaw); auraBeastStep(_auraSelf, !!liveLycanthropy(playerEntity)?.isTransformed, t);   // SHADOW-CLOAK: the body's own facing, as its third person is drawn (SPRITE-FACE: a sprite's, as its picture faces); turned beast, the cloak torn
      _auraSelf.kindle = Math.min(1, (t - _auraSelf.since) / AURA_KINDLE_S); _auraSelf.mounted = !!player.riding;   // SHADOW-CLOAK: a rider's cape folded away
      shared._auraWearers.push(_auraSelf);
    } else _auraSelf.aura = null;
    for (const d of seen) {
      if (_veils.has(d.id) || !d.shown) continue;   // a concealed peer's fire is concealed with them
      const au = shared.online.auraOf?.(d.id) ?? null;
      if (!au) { shared._auraPool.delete(d.id); continue; }
      let w = shared._auraPool.get(d.id);
      if (!w || w.aura !== au) { w = { id: d.id, at: [0, 0, 0], aura: au, seed: auraSeedOf(d.id), kindle: 0, since: t }; shared._auraPool.set(d.id, w); }
      const p = shared.onlineToScene(d.shown);
      w.at[0] = p[0]; w.at[1] = p[1]; w.at[2] = p[2]; w.yaw = (shared.peerWalkers?.faceOf?.(d.id) ?? shared.peerRiders?.faceOf?.(d.id))?.yaw ?? peerBodyYaw(d.shown) ?? 0; auraBeastStep(w, !!d.shown.wb, t);   // SHADOW-CLOAK: the peer's facing (to the wall on a climb) - SPRITE-FACE: a sprite's as its picture is drawn this frame (the layers synced above), so its wings' light stands where its wings do; turned beast (the pose's `wb`), the cloak torn
      w.kindle = Math.min(1, (t - w.since) / AURA_KINDLE_S); w.seen = t; w.mounted = !!d.shown.rd;   // SHADOW-CLOAK: a rider's (a horse, a cart) cape folded away
      shared._auraWearers.push(w);
    }
    if (shared._auraPool.size) for (const [id, w] of shared._auraPool) if (t - w.seen > AURA_FORGET_S) shared._auraPool.delete(id);   // the gone forget their kindling - AUDIT 3: the gone, not the blinked (AURA_FORGET_S)
  }
  function drawAuras() {
    if (!shared._auraWearers.length) return;
    const proj = renderer._proj, view = renderer._view, eye = renderer._camPos;   // the frame's camera, the world's own
    if (proj && view && eye && auraWearers(shared._auraWearers, eye, shared._auraDraw).length) {
      const _auraPass = shared.auraPassOf();   // AURA-STALL: null while its program compiles - the capes still hang and swing below
      const auraNow = performance.now() / 1000; for (const w of shared._auraDraw) if (auraLookOf(w.aura).mesh) { auraCapeStep(w, w === _auraSelf ? { feet: player.bodyFeetAt(), yaw: mwViewSpriteFacing()?.yaw ?? player.bodyYawFor(cam.yaw), turn: mwViewSpriteFacing()?.turn, bones: mwViewBodyBones(CLOAK_BONES) ?? auraSpriteBones(mwViewSpriteFigure()) } : shared.peerBodies?.bonesOf(w.id, CLOAK_BONES) ?? auraSpritePosed(w, shared.peerWalkers?.figureOf(w.id) ?? shared.peerRiders?.figureOf?.(w.id), shared.peerWalkers?.faceOf?.(w.id) ?? shared.peerRiders?.faceOf?.(w.id)), w === _auraSelf ? player.height / CAPSULE_HEIGHT : 1); auraMotionStep(w, auraNow); } _auraPass?.draw(shared._auraDraw, proj, view, eye, auraNow, { mode: renderer._fogMode, density: renderer._fogDensity, range: renderer._fogRange, camPos: renderer._camPos, focus: renderer._focus, haze: renderer._haze }, auraVisualIntensity(mwViewThirdPerson()));   // SHADOW-CLOAK: each cape hung on its body as drawn this frame - its bones posed by now (mine, or a peer's), else at rest, crouched with a crouch - and swung by how it moves where it is drawn; SPRITE-FACE (Mac: "The sprite rotation on character input is a little finicky and make the aura misallign"): a sprite's faced as its PICTURE is (the eight-way view drawn, mine after the mod's delayed repaint has landed - mwViewSpriteFacing, a peer's faceOf), in the saddle too, and swung by the way the body turns (`turn`)
      if (_auraPass?.drawn) renderer.markForeignPass();
    }
    shared._auraWearers.length = 0;   // this frame's, drawn once: a frame that gathers none (the seat left, death, offline) draws none
  }
  /** FONT1 (2026-09-16, Mac: "Especially the new online interfaces font use our enhanced font"): THE SOCKET'S OWN
   *  WORD, IN THE SKIN'S FACE. The online lane is the enhanced lane whole (systems/online/onlineLane.js), so this line -
   *  connecting, reconnecting, refused - was the one online surface still drawn in the classic bitmap font while
   *  the chat, the roster, the party HUD and the friends panel beside it wear the pixel stack. Under the enhanced
   *  skin it is a DOM strip (ui/enhanced/enhancedHudText.js); under the classic one it is the same drawText it always was.
   *  A DOM strip stays painted unless it is told otherwise (AUDIT 64 F37), so EVERY path that draws no name says
   *  so with a null rather than simply returning. */
  const sayNetStatus = (line) => {
    if (isEnhanced() && typeof document !== 'undefined') { drawEnhancedStatusLine(line ?? ''); return; }
    if (!line || !townTalk.font) return;
    const scale = hudScale(canvas.width, canvas.height);
    drawText(renderer, townTalk.font, line, Math.round(8 * scale), Math.round(8 * scale), scale, [1, 0.85, 0.6, 1]);
  };
  const drawPeerNames = (proj, view, eye) => {
    if (!shared.remotePlayers) { sayNetStatus(null); return; }
    const covered = townTalk.hudCovered || (shared.modes?.hudCovered ?? false);   // a window over the HUD covers the names too, and the status line with them
    // OVERWORLD NAMES: under the travel view the names over the heads stand down - the readout's marks name the players,
    // as they read in play (travelViewMarks); drawn both, a player near the traveller wore two names
    const namesOff = covered || !!shared.travelView?.active;
    shared.staffView.frame(proj, view, eye, covered);   // STAFF-VIEW1: the staff tags - through walls, past the names' reach (a player's page: one boolean)
    // NAME1 (Mac: "...are able to be seen through walls"): THE SIGHT TEST, over `player.collider` - the LIVE one.
    // worldModes re-points that field at every door (the street's, the building's, the dungeon's), so this is the
    // same triangles the player cannot walk through and the same raycast the activation ladder rejects a target
    // behind a wall with (player/activate.js pickActivatableHit). The arithmetic is net/remotePlayers.js
    // sightBlockedBy's, so a test can drive it with two points and a wall.
    // AUDIT NAME1 F2/F5: through the session's cache - one ray a peer every NAME_SIGHT_MS, and a name taken away
    // only once the ray has said "blocked" for NAME_SIGHT_HOLD_MS, so a railing crossing the line for a frame
    // does not strobe the name (and rebuild its element) on the way past.
    const blocked = (head, id) => glassCuts(projectToScreen(head, 1, 1, proj, view)) || shared.nameSight.blocked(player.collider, eye, id, head);   // GLASS-CLEAR: a player the glass's focus cut from its view, nameless in it
    // the docked HUD's viewport rect (E5), so the name lands over the head the world pass drew (AUDIT ONLINE C6/D3)
    // SOC4 (Mac: "the players name who are in a party together should turn green"): `colorOf` is the party's colour
    // for a peer - net/social.js colorOf answers PARTY_GREEN for my party's other tabs and null for everyone else,
    // so a stranger's name is the white (in the DOM face, the bone) it always was.
    const scale = hudScale(canvas.width, canvas.height);
    // AUDIT NAME1 F1/F14: ONE call, and the pass itself lives in net/remotePlayers.js nameFrame where a pin can
    // drive it. ONE FACE A FRAME, so the pixels are that face's own: CSS for the DOM layer (a style attribute is
    // measured in them), the drawing buffer's for the bitmap pass, which pays hudScale for the difference.
    shared.remotePlayers.nameFrame({
      proj, view, eye, toScene: shared.onlineToScene, covered: namesOff,
      w: shared.nameLayer ? shared._canvasSize().w : canvas.width,
      h: shared.nameLayer ? shared._canvasSize().h : canvas.height,
      rect: worldViewportRect(shared._canvasSize().w, shared._canvasSize().h),
      layer: shared.nameLayer, log: shared.chatLog, colorOf: (id) => shared.social?.colorOf(id) ?? null, blocked,
      renderer, font: townTalk.font, scale, hudScale: enhancedHudScale(),
      extra: noticeCountPoints,   // NOTICE1: "3 new" over a Notice Board, in the names' own face and law
      mask: (p) => { const q = shared.wildNameMask(p); return q ? performingTag(q, (id) => shared.online?.peers?.get(id)?.shown ?? null) : q; },   // BUNNYFALL: a bard performing says so over their head; WILD3: in the open zone no name but my party's and my guild's - the rest are Strangers, in red
    });
    if (covered) { sayNetStatus(null); return; }
    sayNetStatus(shared.online?.statusLine());   // AUDIT ONLINE D12/E11: connecting, reconnecting, refused, replaced - said, not silent (FONT1: in the enhanced face)
  };
  return {
    _onlineWorldSession, actSend, allyMarksNear, allyTargetPick, canPostItemInChat, castAtAllyDoor, chatLangFrame,
    chatNotice, chatRoll, chatRosterOf, chatSend, chatSessionOf, drawPeerBodies, drawPeerNames, drawVeiledPeerBodies,
    duelArrowTargets, duelBody, duelBodyIn, duelButtonFor, duelCan, duelChallenge, duelEnded, duelHpIn, duelHudSay,
    duelLeaveNow, duelMeleeHit, duelNear, duelRingsNow, duelSpellOut, duelStrikeOut, duelWorldOf, dungeonAuthority,
    fallenTargetPick, guildGone, handOverFoes, handOverRoomFoes, handOverSiteFoes, handOverWalkedAway, heartbeat, hitSend,
    keptKills, langOld, linkItemInChat, myGuildTag, myParkKey, offerRaidTowns, onRelayVersion, onlineFrame,
    openPeerMenu, optJoined, optSet, pageReadHow, pageShareHere, peerCandlesFrame, peerFxHurtShare, peerGrow,
    peerHoverName, peerIdByName, peerName, peerTorchLights, peersNear, plaquePeerAct, postItemInChat, raiseFallenDoor, renownAdopt,
    renownRose, renownXpAdopt, rollTracker, seatLostNow, seatOut, seatRankHere, seatedPeerFeet, socialFwd,
    socialInteract, socialLink, socialMenuCanOpen, socialRowActions, socialStart, staffDestination, staffGlyphs,
    touchFxFrame, tradeNear, tradeSay, wedAsk, wedButtonFor, wedCan, wedUnask,
  };
}
