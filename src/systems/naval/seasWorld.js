// Sailing in the world: Come Sail Away's boats, helm, waves, sounds, wind widget, cargo, and other
// players' boats, with boarding, deck walking, and caravan visits. It also holds the naval host
// with its crews, plunder, fleet, and captain's log, the Eltheric ports, and their save slots.
import { midScreenText as _wildMidText, setMidScreenText } from '../../ui/midScreenText.js';
import { activeWagonItem, activeWagonKind } from '../../travel/wagonKinds.js';
import { addGold, changeLegalRep, deductGold, lowerRepForCrime, totalGoldAmount } from '../../justice/court.js';
import { addItem, carriedWeight, letterOfCredit } from '../../items/inventory.js';
import { addPileLootExtras, generateItems as generateLootItems } from '../../items/loot.js';
import { adoptLight } from '../../render/lightId.js';
import { alignControllerToGround } from '../../world/groundAlign.js';
import { asleepHour } from './shipWatch.js';
import { assignVariantsToShopItems, cargoLootTarget, mintDeed, mintShelfBoatUids } from './comeSailAwayItems.js';
import { audio, logarithmicRolloff, plainSourceGain } from '../../audio/audio.js';
import { bankCabinCandidates, linkBankCabin } from './boatCabinOwnership.js';
import { BED_MODELS, bedSleepingOn } from '../../mods/rrRealism.js';
import { betterAmbience } from '../../audio/betterAmbience.js';
import { bindings, held, released } from '../../ui/input.js';
import { boardPortAt, seaBears } from '../../world/portSites.js';
import { BOAT_VERB, boatMenuRows, boatMenuStart, boatTriggers, pressBoatVerb } from './csaBoatMenu.js';
import { BUILTIN_COLLIDER_MESHES, raycastColliders } from '../../world/prefabColliders.js';
import { buttonText } from '../../ui/controlsConfig.js';
import { CAPSULE_HEIGHT } from '../../player/motor.js';
import { CAPTAIN_SAVE_VENDOR } from './captainLedger.js';
import {
  CARAVAN_VISIT_TEXT, caravanEntryOf, caravanMayEnter, setDrivenCaravanEntry,
} from '../../travel/caravanVisit.js';
import { caravanRoomOf } from '../../net/privateInterior.js';
import { changeReputation } from '../../guilds/factionRep.js';
import { characterIdOf } from '../../characters/characterId.js';
import { CHART_TEMPLATE } from './treasureCharts.js';
import {
  closeEtherChart, closeNavalPlunder, closeNavalYard, closeShipyard, createNavalPlunderOverlay,
  createNavalYardOverlay, createShipyardOverlay,
} from '../../ui/navalPlunderDoor.js';
import { codeForAction, getBinding, getJoystickUIBinding } from '../../ui/inputActions.js';
import {
  COME_SAIL_AWAY_VENDOR, ACTIVATION_DISTANCE as CSA_ACTIVATION_DISTANCE, NICE_BOAT_TEXT as CSA_NICE_BOAT_TEXT,
  activationModelOf as csaActivationModelOf, customModelOf as csaCustomModelOf,
  windWidgetFrameCount as csaWindWidgetFrameCount,
} from './comeSailAway.js';
import { composePartyFx } from '../../net/partyBuffs.js';
import { CONTAINER_IMAGES } from '../../ui/targetIconPanel.js';
import { controllerLook } from '../../player/lookFilter.js';
import { createCabinHarbours } from './cabinHarbours.js';
import { createCaptainPageHost } from './captainPageHost.js';
import { createCsaParticleLists } from './csaParticleLists.js';
import { createDeckPlanDoor } from './deckPlanDoor.js';
import { createEtherHost } from './etherHost.js';
import { createFleetHost } from './fleetHost.js';
import { createHarbourOffice } from './harbourOffice.js';
import { createNavalCrew, CREW_KEEP, CREW_RANGE } from './navalCrew.js';
import { createNavalFlames } from './navalFlames.js';
import { createNavalHost, NAVAL_SAVE_VENDOR, NAVAL_TAG_RANGE, hullBoxOf as navalHullBoxOf } from './navalHost.js';
import { createPassageHost } from './passageHost.js';
import { createShipFlagHost } from './shipFlagHost.js';
import { createShipyardHost } from './shipyardHost.js';
import {
  CREW_BAR_RANGE, CREW_SAY_RANGE, crewBarPoint, drawCrewBars, drawCrewLines, drawNavalHud, drawNavalTags,
  navalTouchBrace,
} from '../../ui/navalHud.js';
import { crewRoster } from './crewLife.js';
import { CSA_ABOARD_GRACE, deckPose as csaDeckPose, helmWord as csaHelmWordOf } from './comeSailAwayAboard.js';
import { FADE_FLATS as CSA_FADE_FLATS } from './comeSailAwayPool.js';
import {
  HULL_NAMES as CSA_HULL_NAMES, TRIGGER_MODEL as CSA_TRIGGER_MODEL, animatorOf as csaAnimatorOf,
  meshLocalBounds as csaMeshLocalBounds, nodeOf as csaNodeOf,
} from './comeSailAwayBoat.js';
import {
  particleMeshRotation as csaParticleMeshRotation,
} from '../../world/unityParticles.js';
import { horseOffsetHeight as csaHorseOffsetHeight, worldViewportRect } from '../../ui/hudLarge.js';
import { parseHexColor as csaParseHexColor } from '../../ui/toolTip.js';
import {
  quatAngleAxis as csaQuatAngleAxis, quatMultiply as csaQuatMultiply, quatRotate as csaQuatRotate,
} from '../../world/quat.js';
import { csaRecordKey, csaWireRecord } from './comeSailAwayWire.js';
import { toScreenOrder as csaToScreenOrder } from '../../formats/color32Order.js';
import { waveDitherOf as csaWaveDitherOf } from './comeSailAwayWaves.js';
import { windWidgetFrameUrl as csaWindWidgetFrameUrl } from './comeSailAwayModels.js';
import { cursorActive } from '../../player/pointerLock.js';
import { DECK_HEADROOM, DECK_STEP, intoDeck, mainLevel, outOfDeck } from './navalDeck.js';
import { decodePng } from '../../render/textureReplacement.js';
import { DEFAULT_ACTIVATION_DISTANCE, RAY_DISTANCE } from '../../player/activate.js';
import { drawEnhancedHelm, enhancedHelmBar, enhancedHelmMounted, hideEnhancedHelm } from '../../ui/enhancedHelm.js';
import { enhancedHudBottom, enhancedHudQuick, enhancedHudScale } from '../../ui/enhancedHud.js';
import { entityMaxEncumbrance } from '../../combat/formulas.js';
import { ETHER_REGION } from '../../world/etherPlaces.js';
import { etherRisePort } from '../../world/wild/etherWild.js';
import {
  FLEET_SAVE_VENDOR, fleetBook, fleetSaveSlot, fleetShip, forgetShip, setShipPort, titleDeed,
} from './fleet.js';
import { getFloat } from '../../platform/settings.js';
import { getInteractionMode } from '../../player/interactionMode.js';
import { getPixelFromPixelID, longitudeLatitudeToMapPixel, REGION_NAMES } from '../../formats/mapsFile.js';
import { getPref } from '../../ui/uiPrefs.js';
import { giveNavalItems, navalLootWorth } from './navalTransfer.js';
import { hasPortFor, PORT_LOCATION_IDS } from '../../travel/travelPorts.js';
import { hasSailingCabin } from './sailingCabin.js';
import { hdGlyphName } from '../../ui/padGlyphsHD.js';
import { hideEnhancedTextLayer } from '../../ui/enhancedTextLayer.js';
import { holdsCargo } from './holdDoor.js';
import { HOME_ENTRY_WORDS, homeNextEntry } from '../../homes/onlineHomes.js';
import { hourOf, isCityLightsOn, isNight } from '../../world/worldClock.js';
import { hudRenderEnabled } from '../../ui/hudShortcuts.js';
import { hudScale } from '../../ui/hud.js';
import { hullBuild, CROWNS as NAVAL_CROWNS, crownOf as navalCrownOf } from './navalShips.js';
import { hullPassesMyDeck } from './peerHulls.js';
import { inEther, isleAt } from '../../world/ethericSea.js';
import { installNavalSounds } from './navalSounds.js';
import { inventoryDoorReady } from '../../ui/inventoryDoor.js';
import { isBoatEffectBundle } from '../../world/deepWaterSwim.js';
import { isCellRoom } from '../../net/wire.js';
import { isEnhanced, isEnhancedPlus } from '../../ui/uiSkin.js';
import { isPortTownType } from '../../travel/portPlaces.js';
import { isShipmate } from '../../combat/friendlyFire.js';
import { itemLongName } from '../../items/itemInfo.js';
import { listPickerArtLoaded, ListPickerWindow } from '../../ui/listPicker.js';
import { liveStat } from '../../characters/statMods.js';
import { messageBox } from '../../ui/notify.js';
import { mintStores, spendStore, storesIn } from './navalStores.js';
import { MOD_SETTINGS, modSetting } from '../../mods/modSettings.js';
import { mulberry32 } from '../../combat/bloodArt.js';
import { navalRecordKey } from './navalWire.js';
import { NavalRenderer } from '../../render/navalRender.js';
import { orderRows } from './shipCrew.js';
import { ownedLine } from '../../travel/horseCartPool.js';
import { padFamily } from '../../ui/padGlyphs.js';
import { passengerCard } from './passageHelm.js';
import { pileSource, rollLootRarity, stampWonWeapons } from '../../items/lootRarity.js';
import { pixelKeyText } from '../../world/pixelKeys.js';
import { planTake } from '../../items/itemTransfer.js';
import { plaqueActionFor } from '../../items/quickLoot.js';
import { playerEntity, surfacePlayer } from '../../characters/playerEntity.js';
import { PORT_TEXT } from '../../travel/portHost.js';
import { projectToScreen, worldRectPx } from '../../player/tapRay.js';
import { NATIVE_PIXEL as RAID_NATIVE_PIXEL } from './seaRaiders.js';
import { registerItemUseHandler } from '../../items/itemTemplates.js';
import { registerModSaveData } from '../../saves/modSaveData.js';
import { seaZoomReach } from '../../player/seaZoom.js';
import { sellProceeds } from '../../trade/tradeModes.js';
import { setHoldingsProvider, stableProviderFor } from '../../ui/holdingsPages.js';
import { SKILLS, skillValue, tallySkill } from '../../characters/skills.js';
import { tagText } from '../../ui/quickslotTags.js';
import { TERRAIN_SIZE } from '../../world/terrainSampler.js';
import { terrainSampleHeightAt } from '../../world/terrainSurface.js';
import { TRANSPORT_HORSE, TRANSPORT_SMALL_CART } from '../../trade/shopStock.js';
import { locationSummaryAt as travelLocationSummaryAt } from '../../maps/mapDirectory.js';
import { warmAshesOn, raidUnderWay as warmAshesRaidUnderWay } from './warmAshesShips.js';
import { watersOf } from './navalDirector.js';
import { worldMinutes } from '../../world/worldTick.js';
import { worldPlaqueOn } from '../../ui/worldPlaque.js';
import { timeScale as worldTimeScale } from '../../world/timeScale.js';

/** @param {any} shared */
export function createSeasWorld(shared) {
  const {
    _csaBoatIds, _csaBoxes, _csaBuckets, _csaLoops, _csaMapKeys, _csaSeaReach, _csaSourceNodes, _csaTerrains,
    _deckBodies, _dwEyeOffset, _questRegionIndex, _travelUIHolder, built, cam, campToWire, canvas, captainLedger,
    caravanRooms, collider, csa, csaAboard, csaClipKey, csaDrawList, csaFinishBoarding, csaHelmInput, csaJourneyHelm,
    csaOn, csaParticleTextures, csaPassengersOn, csaPeers, csaRaycast, csaRender, csaRuntime, csaSetPlayerPosition,
    csaSounds, csaStandsOn, csaSyncColliders, csaWaveFrames, dwPlayerObjectPosition, etherCrossStep, etherOut,
    etherSea, gamePaused, getTexture, harbourBook, hccOn, hccRuntime, holdDoor, laneShips, livingLinePoints,
    lookFilter, lowerGlass, mapDict, maps, minuteNow, navalIsWater, openSea, packedItemsCodec, pipeline, player,
    playerTicker, playerTravelPixel, renderer, sailingCabins, seaRaidSpend, setTransportModeHere, shipFlagPass,
    shipPortraits, state, surfaceAt, townEcon, townTalk, travelViewCanGo, travelViewRouteTo, tvRaid, tvSeaY, upkeep,
    upkeepPass, uploadRecordFrame, walkMode, waRaidQuest, waterOn, withdrawCrossing, worldMoveBusy,
  } = shared;
  const csaColliderBoats = () => (shared.naval?.enabled ? [...csa.boats, ...shared.naval.collidable()] : csa.boats);
  const navalHostileNear = () => !!shared.naval?.hostileNear();

  const csaTerrainOf = (p) => {
    if (!p) return null;
    let t = _csaTerrains.get(p);
    if (!t) {
      const o = [0, 0, 0];
      t = {
        mapPixelX: p.px, mapPixelY: p.py,
        get position() { return state.pixelTranslation(p.px, p.py, [0, 0, 0]); },
        get tileMap() { return p.tilemapBytes ?? null; },
        sampleHeight: (q) => { state.pixelTranslation(p.px, p.py, o); const c = (v) => Math.max(0, Math.min(TERRAIN_SIZE, v)); return terrainSampleHeightAt(p.samples, c(q[0] - o[0]), c(q[2] - o[2]), p._stride ?? 1); },
      };
      _csaTerrains.set(p, t);
    }
    return t;
  };
  const csaPixelAt = (x, z) => {
    const c = state.compensation;
    return built.get(pixelKeyText(state.mapOrigin.x + Math.floor((x - c[0]) / TERRAIN_SIZE), state.mapOrigin.y - Math.floor((z - c[2]) / TERRAIN_SIZE))) ?? null;
  };
  const csaColliderMesh = (c) => {
    if (c.classicModel != null) { const m = pipeline.cpuModels?.get(c.classicModel); return m ? { positions: m.positions, indices: m.indices } : null; }
    if (c.m_Mesh?.mesh) return csa.models?.geometry(c.m_Mesh.mesh) ?? null;
    if (c.m_Mesh?.builtin) return BUILTIN_COLLIDER_MESHES[c.m_Mesh.builtin] ?? null;
    return null;
  };
  const csaModeCollider = () => { const mode = shared.modes?.mode ?? 'exterior'; return mode === 'exterior' ? collider : mode === 'dungeon' ? shared.modes?.dungeonCtx?.collider : shared.modes?.interiorCollider; };

  let _csaBoatSerial = 0;
  const csaBoatId = (boat) => { let id = _csaBoatIds.get(boat); if (id == null) { id = ++_csaBoatSerial; _csaBoatIds.set(boat, id); } return id; };
  const csaShapeOf = (c) => (c.type === 'BoxCollider'
    ? `${c.m_Center?.x ?? 0},${c.m_Center?.y ?? 0},${c.m_Center?.z ?? 0},${c.m_Size?.x ?? 1},${c.m_Size?.y ?? 1},${c.m_Size?.z ?? 1}`
    : csaColliderMesh(c)?.positions ?? null);
  const CSA_RIGID_EPS = 1e-5;

  function csaActivationPick(eye, dir) {
    if (!csaRuntime || shared.modes?.sailingCabin) return null;
    let best = null;
    for (const boat of csa.boats) {
      if (!boat.GameObject?.activeSelf) continue;
      const hit = raycastColliders(boat.GameObject, eye, dir, RAY_DISTANCE, { triggers: true, geometry: csaColliderMesh });
      if (hit && (!best || hit.distance < best.hit.distance)) best = { boat, hit };
    }
    if (!best) return csaPeerActivationPick(eye, dir);
    const wall = csaModeCollider()?.raycastHit(eye, dir, best.hit.distance, _csaBuckets.size ? { skip: _csaBuckets.keys() } : null);
    if (wall && Number.isFinite(wall.dist) && wall.dist < best.hit.distance) return null;
    const modelId = csaActivationModelOf(best.hit.node?.name);
    const bed = modelId == null && bedSleepingOn() && csaCustomModelOf(best.hit.node?.name, BED_MODELS) != null;
    return {
      key: `csaBoat:${csaBoatId(best.boat)}:${modelId ?? (bed ? 'bed' : 'hull')}${modelId === CSA_TRIGGER_MODEL.drive && getInteractionMode() === 'steal' ? ':steal' : ''}`, distance: best.hit.distance,
      reach: bed ? DEFAULT_ACTIVATION_DISTANCE : CSA_ACTIVATION_DISTANCE,
      modelId, bed, boat: best.boat, hit: { ...best.hit, root: best.boat.GameObject },
    };
  }
  function csaPeerActivationPick(eye, dir) {
    if (!csaOn() || shared.modes?.sailingCabin) return null;
    const p = csaAboard.pick(eye, dir, RAY_DISTANCE);
    if (!p) return null;
    const wall = csaModeCollider()?.raycastHit(eye, dir, p.distance, _csaBuckets.size ? { skip: _csaBuckets.keys() } : null);
    if (wall && Number.isFinite(wall.dist) && wall.dist < p.distance) return null;
    const bed = p.modelId == null && bedSleepingOn() && csaCustomModelOf(p.hit.node?.name, BED_MODELS) != null;
    return {
      key: `csaPeer:${p.owner}:${p.slot}:${p.modelId ?? (bed ? 'bed' : 'hull')}`, distance: p.distance, yields: true, peer: true,
      reach: bed ? DEFAULT_ACTIVATION_DISTANCE : CSA_ACTIVATION_DISTANCE,
      modelId: p.modelId, bed, boat: p.boat, owner: p.owner, slot: p.slot, hit: { ...p.hit, root: p.boat.GameObject },
    };
  }
  const csaSetFacing = (yawDeg, pitchDeg) => { cam.yaw = (yawDeg * Math.PI) / 180; cam.pitch = (pitchDeg * Math.PI) / 180; lookFilter.settle(); };
  function csaBoardPeer(pick) {
    const at = csaAboard.boardPlace(pick.hit);
    csaSetPlayerPosition(at.position);
    csaSetFacing(at.yaw, 0);
    const c = dwPlayerObjectPosition();
    const o = [c[0], c[1] + 0.2, c[2]];
    const ground = csaRaycast(o, [0, -1, 0], 3, { triggers: true });
    const deck = raycastColliders(pick.boat.GameObject, o, [0, -1, 0], 3, { triggers: true, geometry: csaColliderMesh });
    const d = deck && (!ground || deck.distance < ground.distance) ? deck.distance : ground ? ground.distance : null;
    csaSetPlayerPosition([c[0], alignControllerToGround(c[1], d, player.height ?? CAPSULE_HEIGHT, 3), c[2]]);
    csaFinishBoarding();
    if (csaAboard.board(pick.boat, CSA_ABOARD_GRACE)) csaSyncColliders();
    cam.pos = player.eyeAt();
  }
  function csaPeerActivate(pick) {
    if (pick.bed) { csaActivate({ ...pick, peer: false }); return; }
    if (pick.modelId == null || !(pick.distance <= pick.reach)) return;
    switch (pick.modelId) {
      case CSA_TRIGGER_MODEL.board: csaBoardPeer(pick); break;
      case CSA_TRIGGER_MODEL.status: messageBox([CSA_NICE_BOAT_TEXT]); break;
      case CSA_TRIGGER_MODEL.door: csaCall(() => csaRuntime?.turnDoor(pick.hit.node)); break;
      case CSA_TRIGGER_MODEL.position: csaCall(() => csaRuntime?.StartShowBoatPosition(pick.boat)); break;
      default: { const owned = ownedLine(shared.peerName(pick.owner)); townTalk.say(`This ${CSA_HULL_NAMES[pick.boat.hull] ?? 'boat'} - ${owned.charAt(0).toLowerCase()}${owned.slice(1)}.`); }
    }
  }
  const csaBoatOfKey = (key) => {
    const m = typeof key === 'string' ? /^csaBoat:(\d+):([^:]+)(?::steal)?$/.exec(key) : null;
    if (!m) return null;
    const boat = csa.boats.find((b) => _csaBoatIds.get(b) === Number(m[1]));
    return boat ? { boat, part: m[2] } : null;
  };

  const campDeckAt = (pos) => {
    const hit = collider?.surfaceHit?.([pos[0], pos[1] + 0.5, pos[2]], [0, -1, 0], 1.5);
    const boat = typeof hit?.key === 'string' && hit.key.startsWith('csaBoat:') ? _csaBuckets.get(hit.key)?.boat ?? null : null;
    if (!boat?.MeshObject || !(boat.uid > 0)) return null;
    if (csaRuntime?.AllBoats?.includes(boat)) return { ref: { mine: true, uid: boat.uid }, m: boat.MeshObject.worldMatrix() };
    const at = csaPeers.placeOf(boat);
    return at ? { ref: { peer: at.owner, uid: boat.uid }, m: boat.MeshObject.worldMatrix() } : null;
  };
  const campDeckResolve = (ref) => {
    const standing = (boat) => (boat.GameObject?.activeSelf && boat.MeshObject ? { m: boat.MeshObject.worldMatrix() } : { hidden: true });
    if (ref?.mine) {
      const boat = csaRuntime?.AllBoats?.find((b) => b.uid === ref.uid) ?? null;
      if (boat) return standing(boat);
      return !csaRuntime || (!shared._loading && !csaRuntime.pendingRestore) ? { gone: true } : { hidden: true };
    }
    const boat = ref?.peer ? csaPeers.boatByUid(ref.peer, ref.uid) : null;
    if (boat) return standing(boat);
    return ref?.peer && csaPeers.hasBoat(ref.peer, ref.uid) ? { hidden: true } : { gone: true };
  };

  const caravanDoorLanding = (interior) => (interior?.caravanRoom ? caravanRooms.returnToWagon(interior.caravanRoom) : null);
  const caravanEntryWord = () => {
    if (!shared.onlineOn || activeWagonKind(playerEntity.items ?? []) !== 'caravan') return null;
    const entry = caravanEntryOf(activeWagonItem(playerEntity.items ?? []));
    return { entry, guild: entry === 'guild' ? shared.myGuildTag() : null };
  };
  const caravanEntryRow = () => { const w = caravanEntryWord(); return w ? CARAVAN_VISIT_TEXT.entryRow(HOME_ENTRY_WORDS[w.entry]) : null; };
  const caravanEntryTurn = () => {
    const w = caravanEntryWord();
    const next = w ? setDrivenCaravanEntry(playerEntity.items ?? [], homeNextEntry(w.entry)) : null;
    if (!next) return null;
    shared._hccDirty = true;
    return CARAVAN_VISIT_TEXT.entryLine(HOME_ENTRY_WORDS[next]);
  };
  const caravanDoorOpen = (t) => caravanMayEnter(t, { partyNames: (shared.social?.others?.() ?? []).map((m) => m.name).filter((n) => typeof n === 'string' && n.length > 0), guild: shared.myGuildTag() });
  const caravanVisitMay = (t) => !!shared.online?.caravanOk && shared.online.status === 'open' && (shared.modes?.mode ?? 'exterior') === 'exterior' && caravanDoorOpen(t)
    && !shared.wagonRiders?.seated();
  const caravanVisitEnter = (t) => {
    const room = caravanRoomOf(t?.k);
    if (!room || !caravanVisitMay(t)) { townTalk.say(CARAVAN_VISIT_TEXT.shut(t?.owner || 'another player')); return false; }
    return caravanRooms.visit(t, room);
  };

  const legacyCabinItems = () => [...(playerEntity.items ?? []), ...(playerEntity.wagonItems ?? []), ...fleetBook()];
  const ensureBankCabinLink = (chosenUid = null) => csaRuntime?.state.TemporaryShip ? { status: 'unmatched' }
    : linkBankCabin(playerEntity, csaRuntime?.AllBoats ?? [], legacyCabinItems(), chosenUid);
  const csaBoatMenu = (boat) => {
    let c = _csaBoxes.get(boat);
    if (!c || c.root !== boat.GameObject || c.variant !== boat.variant) _csaBoxes.set(boat, (c = { root: boat.GameObject, variant: boat.variant, boxes: boatTriggers(boat.GameObject, csaActivationModelOf, CSA_TRIGGER_MODEL) }));
    const boxes = c.boxes;
    const sailingThis = !!csaRuntime?.isSailing() && csaRuntime.state.CurrentBoat === boat;
    const rows = boatMenuRows({
      boxes, packable: !!boat.packable, sailingThis, sailing: !!csaRuntime?.isSailing(), aboard: csaStandsOn(boat),
      passengers: csaPassengersOn(boat), variants: boat.VariantObject != null && boat.GetVariantCount >= 1,
      naval: navalOn(), crewed: !!boat.crewed, companions: !!boat.uid,
      noDeed: !!csaRuntime?.deedMissing?.(boat), tooHeavy: !!csaRuntime?.partsTooHeavy?.(boat),
      cabin: hasSailingCabin(boat), cabinWhy: hasSailingCabin(boat) ? sailingCabins.reason(boat) : null,
    });
    const legacy = ensureBankCabinLink();
    if (!['linked', 'unmatched'].includes(legacy.status) && bankCabinCandidates(playerEntity.ownedShip, [boat], []).length) {
      rows.push({ id: 'linkCabin', label: 'Link existing bank cabin', ...(legacy.status === 'conflict' ? { disabled: true, why: 'both cabins contain saved contents' } : {}) });
    }
    return { boxes, rows };
  };
  const csaBoatVerb = (pick, verb) => {
    if (!csaRuntime) return;
    if (verb === 'linkCabin') {
      if (pick.distance > CSA_ACTIVATION_DISTANCE || worldMoveBusy() || !csaRuntime.AllBoats.includes(pick.boat)) return;
      const result = ensureBankCabinLink(pick.boat.uid);
      townTalk.say(result.status === 'linked' ? 'Your existing bank cabin is linked to this ship.' : 'The cabins could not be linked without replacing saved contents.');
      return;
    }
    if (verb === BOAT_VERB.cabin) {
      if (pick.distance <= CSA_ACTIVATION_DISTANCE) { ensureBankCabinLink(); void sailingCabins.enter(pick.boat); }
      return;
    }
    if (verb === BOAT_VERB.crew || verb === BOAT_VERB.orders || verb === BOAT_VERB.companions) {
      if (pick.distance <= CSA_ACTIVATION_DISTANCE) {
        if (verb === BOAT_VERB.crew) shared.navalCrewCard(pick.boat);
        else if (verb === BOAT_VERB.orders) navalOrders(pick.boat);
        else shared.navalCompanions(pick.boat);
      }
      return;
    }
    const { boxes, rows } = csaBoatMenu(pick.boat);
    pressBoatVerb({
      boxes, rows, verb, distance: pick.distance, reach: CSA_ACTIVATION_DISTANCE, at: dwPlayerObjectPosition(), posOf: (n) => n.position, aimed: pick.hit?.node ?? null,
      hit: pick.hit, mode: getInteractionMode(), models: CSA_TRIGGER_MODEL,
      activate: (model, hit, mode) => csaCall(() => csaRuntime.activate(model, hit, mode)), say: (l) => setMidScreenText(l),
    });
  };
  const csaActivate = (pick) => {
    if (shared.modes?.sailingCabin) return; if (pick?.peer) { csaPeerActivate(pick); return; }
    if (pick?.bed) {
      if (pick.distance <= DEFAULT_ACTIVATION_DISTANCE) { if ((shared.modes?.mode ?? 'exterior') === 'exterior') { shared._restFromBed = true; try { shared.toggleRest(); } finally { shared._restFromBed = false; } } else shared.modes?.restFromBed?.(); }
      return;
    }
    const verb = plaqueActionFor(pick?.key);
    if (verb && pick.boat) { csaBoatVerb(pick, verb); return; }
    if (pick?.modelId === CSA_TRIGGER_MODEL.door && hasSailingCabin(pick.boat) && !csaRuntime?.isSailing()
      && pick.distance <= CSA_ACTIVATION_DISTANCE && (shared.modes?.mode ?? 'exterior') === 'exterior') { csaOpenBoatMenu(pick); return; }
    if (pick?.modelId != null) { csaCall(() => csaRuntime.activate(pick.modelId, pick.hit, getInteractionMode())); return; }
    if (pick?.boat && (!worldPlaqueOn() || (shared.modes?.mode ?? 'exterior') !== 'exterior') && !csaRuntime?.isSailing() && pick.distance <= CSA_ACTIVATION_DISTANCE) csaOpenBoatMenu(pick);
  };
  const csaOpenBoatMenu = (pick) => {
    const { rows } = csaBoatMenu(pick.boat);
    if (!rows.length) return;
    csaOpenListPicker(rows.map((r) => (r.disabled ? `${r.label} (${r.why})` : r.label)), (i) => {
      if (shared._csaPicker) { shared.modes?.closeWindow?.(shared._csaPicker); shared._csaPicker = null; }
      csaBoatVerb(pick, rows[i]?.id);
    });
  };
  const csaHoverName = (key) => {
    const peer = typeof key === 'string' ? /^csaPeer:(.+):(\d+):[^:]+$/.exec(key) : null;
    if (peer) {
      const boat = csaPeers.boatAt(peer[1], Number(peer[2]));
      if (!boat) return null;
      const hullName = CSA_HULL_NAMES[boat.hull] ?? 'Boat', named = csaPeers.nameAt?.(peer[1], Number(peer[2])) ?? '';
      return { title: named || hullName, subs: [...(named ? [hullName] : []), ownedLine(shared.peerName(peer[1]))] };
    }
    const mine = csaBoatOfKey(key);
    if (!mine) return null;
    const title = shared.fleetHost?.nameOf(mine.boat) || (CSA_HULL_NAMES[mine.boat.hull] ?? 'Boat');
    if (mine.part === 'bed' || csaRuntime?.isSailing()) return { title };
    const { rows } = csaBoatMenu(mine.boat);
    if (!rows.length) return { title };
    const box = Object.keys(CSA_TRIGGER_MODEL).find((k) => String(CSA_TRIGGER_MODEL[k]) === mine.part) ?? null;
    if (box == null) return { title, actions: rows, actionsUnlit: true };
    const start = boatMenuStart(box, rows, getInteractionMode());
    return start < 0 ? { title } : { title, actions: rows, actionsStart: start };
  };

  const csaHelmPress = (action, withHeld = null) => { if (typeof action !== 'string') return; csaHelmInput.edges.add(action); if (typeof withHeld === 'string') csaHelmInput.chord.add(withHeld); };
  const csaHelmHold = (action, on) => { if (typeof action !== 'string') return; if (on) csaHelmInput.held.add(action); else csaHelmInput.held.delete(action); };

  let _csaHour = null;

  const csaInputFrame = () => { const k = _csaMapKeys; const d = k.downFrame, u = k.upFrame; k.downFrame = k.down; k.upFrame = k.up; d.clear(); u.clear(); k.down = d; k.up = u; };
  const csaKeyCode = (k) => (/^Alpha\d$/.test(k) ? `Digit${k.slice(5)}` : k === 'LeftShift' ? 'ShiftLeft' : k);

  const CSA_MAP_TEXT_LAYER = 'enhanced-csa-map-text';

  let shipyardHost = null;

  const csaCall = (fn) => { try { fn(); } catch (e) { console.error('[come-sail-away]', e); } };

  let _csaUidCount = 0;
  const csaNewItemUid = () => Date.now() * 1000 + (_csaUidCount++ % 1000);
  const etherPortAt = (x, y) => {
    if (!etherSea || !inEther(x, y)) return null;
    const i = isleAt(x, y);
    return i && i.kind === 'port' && i.px === x && i.py === y ? i : null;
  };
  const etherPortNear = (x, y) => {
    let best = null, bd = Infinity;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const i = etherPortAt(x + dx, y + dy); const d = Math.abs(dx) + Math.abs(dy); if (i && d < bd) { bd = d; best = i; } }
    return best;
  };
  const etherPortOf = (i) => ({ key: `${i.px},${i.py}`, name: i.name, px: i.px, py: i.py, region: ETHER_REGION, crown: null, ether: true });
  const csaIsPortTown = (x, y) => {
    if (etherSea && inEther(x, y)) return !!etherPortAt(x, y);
    const summary = travelLocationSummaryAt(mapDict, x, y);
    if (!summary) return false;
    if (hasPortFor(summary.id)) return true;
    const loc = maps.getLocation(summary.regionIndex, summary.locationIndex ?? summary.mapIndex);
    return !!loc && (loc.exterior?.exteriorData?.portTownAndUnknown ?? 0) !== 0;
  };
  const COMPASS_WAYS = ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'];
  const csaNearestPort = () => {
    const here = playerTravelPixel();
    if (etherSea && inEther(here.x, here.y)) {
      const isle = etherRisePort(here.x, here.y);
      const turn = Math.atan2(here.y - isle.py, isle.px - here.x) / (Math.PI / 4);
      return { name: isle.name, way: COMPASS_WAYS[((Math.round(turn) % 8) + 8) % 8], ether: true };
    }
    let best = null, bestD = Infinity;
    for (const id of PORT_LOCATION_IDS) {
      const summary = mapDict?.get(id & 0x000fffff);
      if (!summary) continue;
      const at = getPixelFromPixelID(summary.id);
      const d = Math.hypot(at.x - here.x, at.y - here.y);
      if (d < bestD) { bestD = d; best = { summary, at }; }
    }
    const name = best ? maps.getRegion(best.summary.regionIndex)?.mapNames?.[best.summary.mapIndex] : null;
    if (!name) return null;
    const turn = Math.atan2(here.y - best.at.y, best.at.x - here.x) / (Math.PI / 4);
    return { name, way: COMPASS_WAYS[((Math.round(turn) % 8) + 8) % 8] };
  };
  const csaOpenCargo = (cargo) => {
    if (!inventoryDoorReady()) return;
    const w = shared.makeInventoryWindow({ loot: cargoLootTarget(cargo) });
    if (w && !shared.modes?.mountWindow?.(w)) (w.dispose?.bind(w) ?? w._closeSilently?.bind(w))?.();
  };

  const csaOpenListPicker = (rows, onPick) => {
    if (!listPickerArtLoaded()) return;
    const win = new ListPickerWindow({ items: rows, backdrop: 'none', onPick: (i) => onPick(i), onCancel: () => { shared.modes?.closeWindow?.(win); shared._csaPicker = null; } });
    if (shared.modes?.mountWindow?.(win)) shared._csaPicker = win;
  };
  const csaShelfStocked = (items) => { if (csaOn() && Array.isArray(items)) assignVariantsToShopItems(mintShelfBoatUids(items, csaNewItemUid), (min, max) => min + Math.floor(Math.random() * (max - min))); return items; };

  const csaModLoadFailed = (vendor) => townTalk.say(`Failed to load mod data for \`${MOD_SETTINGS[vendor]?.title ?? vendor}\`. Check log for errors.`, 3);
  const csaOnTransition = () => { if (csaRuntime) csaCall(() => csaRuntime.OnTransition()); };
  const csaHoldsTimeScale = () => (csaRuntime?.state.timeScaleIndex ?? 0) > 0;
  const csaBoatUnderMe = () => (csaRuntime?.isSailing() ? csaRuntime.state.CurrentBoat : null) ?? csaAboard.aboard?.boat ?? null;
  const helmTurnKeys = () => !!csaRuntime?.isSailing() && !shared.travelView?.active;
  const csaBoatYaw = (boat) => { const fw = csaQuatRotate(boat.GameObject.rotation, [0, 0, 1]); return Math.atan2(fw[0], fw[2]); };
  const csaOnTeleport = () => { if (csaRuntime) csaCall(() => csaRuntime.OnTeleportToCoordinates()); };
  const csaPreJump = () => { if (csaRuntime) csaCall(() => csaRuntime.OnPreJump()); };

  const csaParticleLists = createCsaParticleLists({
    boats: () => csaRuntime.AllBoats, seaBoats: () => (shared.naval?.enabled ? shared.naval.boats() : null),
    fadeFlats: CSA_FADE_FLATS, flies: (boat) => shipFlags.flies(boat),
  });
  let _csaParticleFrame = null;
  function csaDrawParticlesOpaque() {
    if (!csaRender) return;
    csaCall(() => {
      _csaParticleFrame = csaParticleLists();
      if (!csaRender.hasParticleTexture('Default-Particle')) { csaParticleTextures(); return; }
      csaRender.drawParticlesOpaque(_csaParticleFrame, csaParticleMeshRotation);
    });
  }
  function csaDrawParticlesBlended() {
    if (!csaRender || !_csaParticleFrame) return;
    csaCall(() => csaRender.drawParticlesBlended(_csaParticleFrame.drops));
  }
  function csaDrawWaves() {
    if (!csaRender || waterOn) return;
    csaCall(() => {
      const w = csaRuntime.waves();
      if (!w.mesh) return;
      if (!csaRender.hasWaveFrames) { csaWaveFrames(); return; }
      const set = (k, d) => { try { const v = modSetting(COME_SAIL_AWAY_VENDOR, k); return v ?? d; } catch { return d; } };
      csaRender.drawWaves(w, csaWaveDitherOf(set('Waves.Length', 1.5), set('Waves.Fade', 0.8)));
    });
  }
  function csaUpdate(dt) {
    if (!shared._csaMapWindow) hideEnhancedTextLayer(CSA_MAP_TEXT_LAYER);
    if (!csaRuntime) return;
    const paused = gamePaused() || shared._loading || shared._partyArrivalPending || shared._etherCrossing;
    shared._csaDt = paused ? 0 : dt * worldTimeScale();
    if (!paused) shared._csaTime += shared._csaDt;
    shared._csaMovedPlayer = false;
    const hour = Math.floor(minuteNow() / 60);
    if (_csaHour !== null && hour !== _csaHour) csaCall(() => csaRuntime.OnNewHour());
    _csaHour = hour;
    csaCall(() => {
      csaRuntime.endOfFrame();
      csaRuntime.fixedUpdate({ paused });
      csaRuntime.tick();
      csaRuntime.update({ paused });
      csaRuntime.lateUpdate({ paused, activateComplete: released(shared.latch.edge, shared.keys, 'ActivateCenterObject') || shared._tapClick });
    });
    csaHelmInput.edges.clear(); csaHelmInput.chord.clear(); csaJourneyHelm.edges.clear();
    csaSyncColliders();
    csaPeersFrame(dt);
    if (shared._csaMovedPlayer) cam.pos = player.eyeAt();
    csaCall(() => csaRuntime.checkSettings());
    csaAudioFrame();
  }
  const csaUnityGain = (v) => plainSourceGain(v, getFloat('Controls', 'SoundVolume', 0, 1));

  function csaAudioFrame() {
    if (!csaRuntime) return;
    const seen = new Set();
    csaCall(() => {
      const ear = audio.listenerPosition();
      for (const boat of csaRuntime.AllBoats) {
        for (const src of [boat.AudioSourceSlow, boat.AudioSourceFast]) {
          if (!src) continue;
          let node = _csaSourceNodes.get(src);
          if (!node) { node = csaNodeOf(boat.GameObject, src); if (node) _csaSourceNodes.set(src, node); }
          let ch = _csaLoops.get(src);
          if (!src.isPlaying || !node?.activeInHierarchy) { if (ch) { ch.handle?.stop(); _csaLoops.delete(src); } continue; }
          seen.add(src);
          if (ch && ch.plays !== src.plays) { ch.handle?.stop(); _csaLoops.delete(src); ch = null; }
          if (!ch) { ch = { plays: src.plays, handle: null }; _csaLoops.set(src, ch); csaSounds(); }
          const pos = [...node.position];
          ch.handle ??= audio.loop3d(csaClipKey(src.clip), pos, 0, { refDistance: src.minDistance, maxDistance: src.maxDistance, distanceModel: 'inverse', rolloffFactor: 0 });
          if (!ch.handle) continue;
          ch.handle.move(pos);
          const d = Math.hypot(pos[0] - ear[0], pos[1] - ear[1], pos[2] - ear[2]);
          ch.handle.setVolume(csaUnityGain(src.volume * logarithmicRolloff(d, src.minDistance, src.maxDistance)));
        }
      }
    });
    for (const [src, ch] of _csaLoops) if (!seen.has(src)) { ch.handle?.stop(); _csaLoops.delete(src); }
  }
  const _csaWidgetFrames = [];
  let _csaWidgetLoad = null;
  function csaWindWidgetFrames() {
    _csaWidgetLoad ??= Promise.all(Array.from({ length: csaWindWidgetFrameCount() }, async (_, i) => {
      const r = await fetch(csaWindWidgetFrameUrl(i));
      if (!r.ok) throw new Error(`112395_1-${i}.png: ${r.status}`);
      return decodePng(new Uint8Array(await r.arrayBuffer()));
    })).then((imgs) => {
      _csaWidgetFrames.push(...imgs.map((img, i) => ({ tex: renderer.uploadTexture('img', `csa-wind:${i}`, csaToScreenOrder(img)), w: img.width, h: img.height })));
    }).catch((e) => console.warn('[come-sail-away] the wind widget\'s pictures did not load', e));
    return _csaWidgetFrames;
  }
  function csaDrawWindWidget() {
    if (!csaRuntime) return;
    let w = null;
    csaCall(() => {
      if (!csaRuntime.isSailing()) return;
      const frames = csaWindWidgetFrames();
      w = csaRuntime.windWidget({ screenRect: { x: 0, y: 0, width: canvas.width, height: canvas.height }, textureSize: frames[0] ? [frames[0].w, frames[0].h] : [128, 128],
        largeHudHeight: csaHorseOffsetHeight(), paused: gamePaused() });
      if (w && frames[w.frame]) renderer.drawScreenQuad(frames[w.frame].tex, w.rect, undefined, csaParseHexColor(String(w.color).replace(/^#/, ''), [1, 1, 1, 1]));
      const values = csaRuntime.debugValues({ paused: gamePaused() });
      if (values) csaDrawList(values);
    });
  }
  let _csaPeersPosed = false;
  const deckMayCarry = () => walkMode && shared.playerSpawned && !shared._teleporting && !shared._traveling && (shared.modes?.mode ?? 'exterior') === 'exterior' && !(playerEntity.health <= 0 || shared.modes?.deathUp?.());
  const deckGround = (b) => (!player.grounded ? (hullPassesMyDeck(b) ? 'other' : null) : typeof player.groundKey === 'string' && player.groundKey.startsWith(`csaBoat:${csaBoatId(b)}:`) ? 'boat' : 'other');
  const deckCarry = (d, yawDeg) => { player.carryBy(d[0], d[1], d[2]); cam.yaw += (yawDeg * Math.PI) / 180; player.carryTurn?.((yawDeg * Math.PI) / 180); shared._csaMovedPlayer = true; };
  function csaPeersFrame(dt) {
    if (_csaPeersPosed) return;
    _csaPeersPosed = true;
    csaPeers.setEnabled(csaOn());
    if (csaOn()) csaPeers.frame(dt);
    const boat = csaAboard.frame({
      allowed: csaOn() && !!shared.online && deckMayCarry(),
      feet: () => player.pos, height: player.height ?? CAPSULE_HEIGHT, swimming: !!player.isPlayerSwimming,
      ground: deckGround,
      carry: deckCarry,
    });
    if (boat || _csaBuckets.size) csaSyncColliders();
  }
  function csaPoolFrame(dt) {
    csaPeersFrame(dt);
    _csaPeersPosed = false;
    if (csaOn()) csa.frame(gamePaused() ? 0 : dt * worldTimeScale(), { cityLightsOn: isCityLightsOn(minuteNow()), playerPosition: player.pos });
  }
  const csaHelmLeft = (modData) => {
    const rec = modData?.[COME_SAIL_AWAY_VENDOR];
    return rec && rec.currentBoat >= 0 ? { ...modData, [COME_SAIL_AWAY_VENDOR]: { ...rec, currentBoat: -1 } } : modData;
  };
  let _csaWordKey = null;
  function csaWord(frame, full) {
    if (!csaRuntime || !csaOn()) { if (!_csaWordKey) return false; if (frame) { frame.sa = null; _csaWordKey = ''; } return true; }
    const way = csaRuntime.helmMotion?.() ?? null;
    const scale = way ? (gamePaused() ? 0 : worldTimeScale()) : 0;
    const view = csaRuntime.AllBoats.filter((b) => b.GameObject?.activeSelf).map((b) => ({
      uid: b.uid, hull: b.hull, variant: b.variant, position: b.GameObject.position, rotation: b.GameObject.rotation,
      sails: b.Sails.reduce((m, sail, k) => (csaAnimatorOf(sail) && !csaAnimatorOf(sail).GetBool('Stowed') ? m | (1 << k) : m), 0),
      helm: csaRuntime.isSailing() && b === csaRuntime.state.CurrentBoat, light: !!b.LightOn,
      ...(way && way.boat === b ? { velocity: way.velocity.map((v) => v * scale), turn: way.turn * scale } : null),
      name: shared.fleetHost?.nameOf(b) ?? '',
      flag: shipFlags.wireFlag(b),
      livery: b.uid ? fleetShip(b.uid)?.livery ?? null : null, fittings: b.uid ? fleetShip(b.uid)?.deck ?? [] : [],
      plaque: !!(b.uid && fleetShip(b.uid)?.plaque),
    }));
    const rec = csaWireRecord(view, campToWire);
    if (rec && shared.modes?.sailingCabin) rec.cabin = 1;
    const key = csaRecordKey(rec);
    if (!full && key === _csaWordKey) return false;
    if (frame) { frame.sa = rec; _csaWordKey = key; }
    return true;
  }
  let _csaAboardKey = '';
  function csaHelmWord() {
    const boat = csaRuntime?.isSailing() ? csaRuntime.state.CurrentBoat : null;
    const id = shared.online?.id ?? null;
    if (!boat || !id) return null;
    const slot = csaRuntime.AllBoats.filter((b) => b.GameObject?.activeSelf).indexOf(boat);
    return slot < 0 ? null : csaHelmWordOf(id, slot, boat, player.height);
  }
  const csaDeckWord = () => (csaOn() ? (csaAboard.word(player.pos) ?? csaHelmWord() ?? shared.naval?.deckWord?.(player.pos) ?? null) : null);
  function csaAboardWord(frame, full) {
    const w = csaDeckWord();
    const key = w ? JSON.stringify(w) : '';
    if (!full && key === _csaAboardKey) return false;
    if (frame) { frame.ab = w; _csaAboardKey = key; }
    return true;
  }
  function csaPoseAhead(owner, slot, dt) {
    if (owner === (shared.online?.id ?? null)) {
      const boat = csaRuntime?.AllBoats.filter((b) => b.GameObject?.activeSelf)[slot];
      if (!boat) return null;
      const pose = { position: boat.GameObject.position, rotation: boat.GameObject.rotation };
      const way = csaRuntime.helmMotion?.();
      if (!way || way.boat !== boat) return csaDeckPose(boat, pose);
      const gdt = gamePaused() ? 0 : dt * worldTimeScale();
      return csaDeckPose(boat, { position: pose.position.map((v, k) => v + way.velocity[k] * gdt), rotation: csaQuatMultiply(pose.rotation, csaQuatAngleAxis(way.turn * gdt, [0, 1, 0])) });
    }
    const boat = csaPeers.boatAt(owner, slot);
    return boat ? csaDeckPose(boat, csaPeers.poseAhead(boat, dt) ?? { position: boat.GameObject.position, rotation: boat.GameObject.rotation }) : null;
  }
  function csaFrame(dt) { csaUpdate(dt); csaPoolFrame(dt); }

  function csaSeaReach(boat) {
    let r = _csaSeaReach.get(boat);
    if (r == null) {
      const e = csaMeshLocalBounds({ models: csa.models }, boat.MeshCollider?.m_Mesh)?.extent;
      r = e ? seaZoomReach(Math.max(Math.abs(e[0]), Math.abs(e[1]), Math.abs(e[2]))) : 0;
      _csaSeaReach.set(boat, r);
    }
    return r;
  }
  let _csaCamFilter = null, _csaCamFor = null, _csaCamSize = -1;
  function csaCameraFilter(boat) {
    if (_csaCamFor !== boat || _csaCamSize !== _csaBuckets.size) {
      const skip = [];
      for (const [key, b] of _csaBuckets) if (b.boat === boat) skip.push(key);
      _csaCamFilter = skip.length ? { skip } : null; _csaCamFor = boat; _csaCamSize = _csaBuckets.size;
    }
    return _csaCamFilter;
  }
  const navalOn = () => !!csaRuntime && csaOn() && getPref('naval') !== false;
  const navalKeyName = (action) => { const c = codeForAction(bindings(), action); return c && !/^Joystick/.test(c) ? buttonText(c, true) : null; };
  const actKeyWord = (action) => {
    const padHeld = controllerLook() ? padFamily() : null;
    const pad = padHeld ? getBinding(bindings(), action, false) : null;
    if (pad && /^Joystick/.test(pad)) return hdGlyphName(padHeld, pad);
    const c = getBinding(bindings(), action);
    return c ? tagText(c) : null;
  };

  let _navalCapitals = null;
  const navalCapitals = () => (_navalCapitals ??= NAVAL_CROWNS.map((c) => {
    try {
      const loc = maps.getLocationByName(REGION_NAMES[c.region], c.name);
      if (!loc?.mapTableData) return null;
      const px = longitudeLatitudeToMapPixel(loc.mapTableData.longitude, loc.mapTableData.latitude);
      return { region: c.region, x: px.x, y: px.y };
    } catch { return null; }
  }).filter(Boolean));
  let _navalPortAt = null;
  const navalNearPort = () => {
    const p = playerTravelPixel();
    const key = `${p.x},${p.y}`;
    if (_navalPortAt?.key !== key) {
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) near = csaIsPortTown(p.x + dx, p.y + dy);
      _navalPortAt = { key, near };
    }
    return _navalPortAt.near;
  };
  let _navalPorts = null, _navalPortPxAt = null;
  const navalPortPx = () => {
    if (!mapDict) return null;
    const p = playerTravelPixel(), key = `${p.x},${p.y}`;
    if (_navalPortPxAt?.key === key) return _navalPortPxAt.d;
    _navalPorts ??= [...new Set(PORT_LOCATION_IDS)].map((id) => mapDict.get(id & 0x000fffff)).filter(Boolean).map((s) => getPixelFromPixelID(s.id));
    let d = Infinity;
    for (const q of _navalPorts) d = Math.min(d, Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)));
    _navalPortPxAt = { key, d: Number.isFinite(d) ? d : null };
    return _navalPortPxAt.d;
  };
  let _navalPortList = null;
  const navalPortList = () => {
    if (!mapDict) return [];
    if (_navalPortList) return _navalPortList;
    const out = new Map();
    for (const id of new Set(PORT_LOCATION_IDS)) {
      const s = mapDict.get(id & 0x000fffff);
      if (!s || !isPortTownType(s.locationType)) continue;
      const at = getPixelFromPixelID(s.id);
      if (!seaBears(at.x, at.y, openSea)) continue;
      const name = maps.getRegion(s.regionIndex)?.mapNames?.[s.mapIndex];
      const key = `${at.x},${at.y}`;
      if (!name || out.has(key)) continue;
      out.set(key, { key, name, px: at.x, py: at.y, region: s.regionIndex, crown: navalCrownOf(at.x, at.y, navalCapitals(), s.regionIndex).name });
    }
    _navalPortList = [...out.values()];
    return _navalPortList;
  };
  let _navalPortHereAt = null;
  const navalPortHere = () => {
    const p = playerTravelPixel(), key = `${p.x},${p.y}`;
    if (_navalPortHereAt?.key === key) return _navalPortHereAt.port;
    if (etherSea && inEther(p.x, p.y)) {
      const isle = etherPortNear(p.x, p.y);
      _navalPortHereAt = { key, port: isle ? etherPortOf(isle) : null };
      return _navalPortHereAt.port;
    }
    const port = boardPortAt(navalPortList(), p.x, p.y);
    _navalPortHereAt = { key, port };
    return port;
  };
  const navalSitePoint = (px, py, seed) => {
    const r = mulberry32((seed >>> 0) ^ 0x517e);
    for (let i = 0; i < 9; i++) {
      const fx = i === 0 ? 0.35 + r() * 0.3 : r(), fz = i === 0 ? 0.35 + r() * 0.3 : r();
      const [x, z] = state.localFromWorld((px + fx) * RAID_NATIVE_PIXEL, (499 - py + fz) * RAID_NATIVE_PIXEL);
      if (Number.isFinite(x) && Number.isFinite(z) && navalIsWater(x, z, 0)) return [x, tvSeaY(), z];
    }
    return null;
  };

  const navalDeckToWorld = (boat, p, out) => outOfDeck(boat.MeshObject.worldMatrix(), p, out);
  const navalWorldToDeck = (boat, p, out) => intoDeck(boat.MeshObject.worldMatrix(), p, out);

  const navalDeckBody = (f, boat) => { if (!f || !boat) return; f.deckBoat = boat; f.deckLocal = null; _deckBodies.add(f); };
  const navalHullStands = (boat) => !!boat?.GameObject?.activeSelf && !!(csa.seaBoats?.includes(boat) || csa.boats?.includes(boat) || csa.peerBoats?.includes(boat));
  const _leashLocal = [0, 0, 0];
  function navalLeash() {
    for (const f of _deckBodies) {
      const boat = f.deckBoat;
      if (f.dead) { if (!f.corpse) { f.deckBoat = f.deckLocal = null; _deckBodies.delete(f); } continue; }
      if (!boat?.GameObject?.activeSelf || !shared.exteriorFoes.foes.includes(f)) { _deckBodies.delete(f); continue; }
      const feet = f.ai?.feet;
      const deck = boat.MeshObject && csa.deckOf?.(boat.hull, boat.variant ?? 0);
      if (!feet || !deck?.count) continue;
      const local = navalWorldToDeck(boat, feet, _leashLocal);
      const floor = deck.heightAt(local[0], local[2], local[1]);
      if (!(Math.abs(local[1] - floor) <= DECK_STEP) && !(Math.abs(local[1] - deck.ajarAt(local[0], local[2], local[1])) <= DECK_STEP)) {
        const was = f.deckLocal, piece = was ? deck.pieceAt(was[0], was[2], was[1], DECK_STEP) : 0;
        deck.keep(local[0], local[2], was ? was[1] : local[1], piece, local);
        navalDeckToWorld(boat, local, feet);
      }
      const kept = f.deckLocal ??= [0, 0, 0];
      kept[0] = local[0]; kept[1] = local[1]; kept[2] = local[2];
    }
  }
  function navalCarry() {
    for (const f of _deckBodies) {
      const boat = f.deckBoat, kept = f.deckLocal, feet = f.ai?.feet;
      if (f.dead) {
        if (f.corpse && navalHullStands(boat)) { if (kept && f.corpseMarker) shared.exteriorFoes.moveCorpse(f, navalDeckToWorld(boat, kept, _leashLocal)); continue; }
        if (f.corpse) shared.exteriorFoes.removeCorpse(f);
        f.deckBoat = f.deckLocal = null;
        _deckBodies.delete(f);
        continue;
      }
      if (!kept || !feet || !boat?.MeshObject || !boat.GameObject?.activeSelf) continue;
      navalDeckToWorld(boat, kept, feet);
    }
  }
  const NAVAL_DECK_BODY_R = 0.45;
  const NAVAL_RAIL_GAP = 1.3;
  function navalDeckSpots(boat, n = 8) {
    if (!boat?.GameObject) return [];
    const deck = boat.MeshObject && csa.deckOf?.(boat.hull, boat.variant ?? 0);
    if (deck?.count) {
      const mid = deck.nearest(0, 0);
      const out = [];
      for (const at of deck.spots(n, mainLevel(deck))) {
        const w = navalDeckToWorld(boat, at);
        const hit = raycastColliders(boat.GameObject, [w[0], w[1] + DECK_HEADROOM - 0.1, w[2]], [0, -1, 0], DECK_HEADROOM + 2.9, { triggers: false, geometry: csaColliderMesh });
        const c = mid ? navalDeckToWorld(boat, mid) : w;
        out.push([[w[0], (hit ? hit.point[1] : w[1]) + 0.05, w[2]], Math.atan2(c[0] - w[0], c[2] - w[2])]);
      }
      return out;
    }
    const box = navalHullBoxOf(boat, csa.models);
    if (!box) return [];
    const out = [];
    const cols = Math.max(2, Math.ceil(Math.sqrt(n * 3))), rows = Math.max(2, Math.ceil(n / cols) + 1);
    for (let i = 0; i < cols && out.length < n * 2; i++) {
      for (let j = 0; j < rows; j++) {
        const u = (i + 0.5) / cols * 2 - 1, v = (j + 0.5) / rows * 2 - 1;
        const x = box.c[0] + box.az[0] * u * box.h[2] * 0.8 + box.ax[0] * v * box.h[0] * 0.6;
        const z = box.c[2] + box.az[2] * u * box.h[2] * 0.8 + box.ax[2] * v * box.h[0] * 0.6;
        const top = box.c[1] + box.h[1] + 6;
        const hit = raycastColliders(boat.GameObject, [x, top, z], [0, -1, 0], box.h[1] * 2 + 12, { triggers: false, geometry: csaColliderMesh });
        if (!hit || hit.point[1] < tvSeaY() + 0.2) continue;
        out.push([[hit.point[0], hit.point[1] + 0.05, hit.point[2]], Math.atan2(box.c[0] - x, box.c[2] - z)]);
      }
    }
    return [...out.filter((_, k) => k % 2 === 0), ...out.filter((_, k) => k % 2 === 1)].slice(0, n);
  }
  function navalDeckPoint(boat, deck, at) {
    const w = navalDeckToWorld(boat, at);
    const hit = raycastColliders(boat.GameObject, [w[0], w[1] + DECK_HEADROOM - 0.1, w[2]], [0, -1, 0], DECK_HEADROOM + 2.9, { triggers: false, geometry: csaColliderMesh });
    const c = navalDeckToWorld(boat, deck.nearest(0, 0));
    return [[w[0], (hit ? hit.point[1] : w[1]) + 0.05, w[2]], Math.atan2(c[0] - w[0], c[2] - w[2])];
  }
  function navalDeckLanding(boat, feet) {
    const deck = boat?.MeshObject && csa.deckOf?.(boat.hull, boat.variant ?? 0);
    if (!deck?.count || !feet) return null;
    const local = navalWorldToDeck(boat, feet);
    return navalDeckPoint(boat, deck, deck.land(local[0], local[2], local[1]));
  }
  function navalRailSpots(boat, toward, n) {
    const deck = boat?.MeshObject && csa.deckOf?.(boat.hull, boat.variant ?? 0);
    if (!deck?.count || !toward || !(n >= 1)) return [];
    const t = navalWorldToDeck(boat, toward), side = t[0] >= 0 ? 1 : -1, k = Math.floor(n), out = [], taken = new Set();
    for (let i = 0; i < k; i++) {
      const at = deck.rail(side, t[2] + (i - (k - 1) / 2) * NAVAL_RAIL_GAP, undefined, mainLevel(deck)), cell = `${at[0]},${at[2]}`;
      if (taken.has(cell)) continue;
      taken.add(cell);
      out.push(navalDeckPoint(boat, deck, at));
    }
    return out;
  }
  const navalSpawnFoe = (mobile, feet, yaw, side, { name = null, team = null, boat = null, gender = null } = {}) => {
    const handle = { foe: null, gone: false, yielded: false };
    shared.exteriorFoes.spawnFoe(mobile, feet, { yaw, feetGiven: true, loose: true, transient: true, allied: side === 'ally', team: side === 'ally' ? null : team, ...(gender ? { gender } : {}) })
      .then((f) => {
        if (!f) return;
        if (handle.gone) { shared.exteriorFoes.removeFoe(f); return; }
        handle.foe = f;
        navalDeckBody(f, boat);
        if (name && f.entity) f.entity.name = name;
        if (handle.yielded) navalStandDown(handle);
      })
      .catch((e) => console.warn('[naval] a boarder would not stand', e?.message ?? e));
    return handle;
  };
  const navalStandDown = (handle) => {
    if (!handle) return;
    handle.yielded = true;
    if (handle.foe?.ai && !handle.foe.dead) handle.foe.ai.isHostile = false;
  };
  const navalGiveItems = (items, boat, { force = false } = {}) => {
    const result = giveNavalItems(items, boat, playerEntity, { force });
    surfacePlayer();
    return result;
  };
  function navalOpenPlunder(model) {
    let why = 'close', hold = null;
    const win = createNavalPlunderOverlay({
      model, nameOf: (item) => itemLongName(item),
      prepareHold: () => {
        if (!inventoryDoorReady()) return 'Inventory is still loading. Please try again.';
        hold = shared.makeInventoryWindow({ loot: { items: () => model.items, containerImage: () => CONTAINER_IMAGES.Chest, playerOwned: false } });
        return hold ? null : 'The hold could not be opened.';
      },
      onClose: (reason) => { why = reason; if (reason !== 'hold' && model.raid && !model.fated()) model.fate('sail'); if (reason === 'leave') model.leave?.(); },
    });
    if (!win) return false;
    townTalk.showOverlay(win, () => { if (why === 'hold') navalOpenHold(model, hold); });
    return true;
  }

  function navalOpenYard(model) {
    if (model.atQuay) model.office = () => {
      const port = navalPortHere();
      if (port?.ether) { const o = etherHost.office(port); return o ? { ...o, rumours: [...o.rumours, ...shared.seaVentures.rumours(port)], ...shared.seaVentures.office(), buyChart: () => { const r = etherHost.buyChart(port); captainSay(); return r; } } : null; }
      return harbourOffice.model({ uid: model.uid ?? null });
    };
    if (model.atQuay) model.exchange = () => harbourOffice.exchange(model);
    const win = createNavalYardOverlay({ model });
    if (!win) return false;
    townTalk.showOverlay(win);
    return true;
  }
  // Reuse the inventory prepared before closing plunder; it owns the loot window's setup.
  function navalOpenHold(model, inv) {
    if (!inv) { townTalk.say('The hold could not be opened. Please try again.', 4); navalOpenPlunder(model); return; }
    townTalk.showOverlay(inv, () => { if (!model.fated()) navalOpenPlunder(model); });
  }
  const navalFlames = createNavalFlames({ renderer, getTexture, uploadRecordFrame });
  const navalCrew = createNavalCrew({ renderer, getTexture, uploadRecordFrame });
  const navalRender = new NavalRenderer(renderer);
  const _rankLines = [];
  const captainSay = () => {
    const groups = new Map();
    for (const c of captainLedger.takeRankChanges()) {
      const up = c.to.rank > c.from.rank, title = up ? c.to.title : c.from.title, key = `${up}:${title}`;
      if (!groups.has(key)) groups.set(key, { up, title, crowns: [] });
      groups.get(key).crowns.push(c.crown);
    }
    for (const g of groups.values()) {
      const who = g.crowns.length === 1 ? `The crown of ${g.crowns[0]}` : `The crowns of ${g.crowns.slice(0, -1).join(', ')} and ${g.crowns.at(-1)}`;
      _rankLines.push(g.up ? `${who} ${g.crowns.length === 1 ? 'names' : 'name'} you ${g.title}!` : `${who} no longer ${g.crowns.length === 1 ? 'counts' : 'count'} you ${g.title}.`);
    }
  };
  const captainSayFlush = () => { if (_rankLines.length && _wildMidText.timer === -1) setMidScreenText(_rankLines.shift(), 4); };
  const harbourOffice = createHarbourOffice({
    ledger: captainLedger,
    now: () => Math.floor(playerTicker.ownMinutes),
    day: () => Math.floor(worldMinutes() / 1440),
    level: () => playerEntity.level ?? 1,
    gold: () => totalGoldAmount(playerEntity),
    pay: (n) => { deductGold(playerEntity, n); surfacePlayer(); },
    credit: (n) => { addGold(playerEntity, n); surfacePlayer(); },
    say: (text, s) => townTalk.say(text, s),
    mid: (text, s) => setMidScreenText(text, s),
    notorietyOf: (crown) => shared.naval?.notorietyOf?.(crown) ?? 0,
    port: () => navalPortHere(),
    ports: () => navalPortList(),
    seaAt: openSea,
    waters: () => { const p = playerTravelPixel(); return etherSea && inEther(p.x, p.y) ? null : navalCrownOf(p.x, p.y, navalCapitals(), _questRegionIndex()).name; },
    carrack: (price, port) => { const deed = mintDeed(4, 0, csaNewItemUid(), price); return !!titleDeed(deed, { port: { name: port.name } }); },
    stow: (hold, item) => addItem(hold, item),
    etherGoods: () => etherOut, town: townEcon,
  });
  const etherHost = createEtherHost({
    ledger: captainLedger,
    day: () => Math.floor(worldMinutes() / 1440),
    gold: () => totalGoldAmount(playerEntity),
    pay: (n) => { deductGold(playerEntity, n); surfacePlayer(); },
    credit: (n) => { addGold(playerEntity, n); surfacePlayer(); },
    say: (text, s) => townTalk.say(text, s),
    mid: (text, s) => setMidScreenText(text, s),
  });
  const etherWatersHere = () => { if (!etherSea) return null; const p = playerTravelPixel(); return etherHost.waters(p.x, p.y); };
  registerItemUseHandler(CHART_TEMPLATE, (item, collection) => {
    const r = harbourOffice.readChart(item);
    const i = r.ok && Array.isArray(collection) ? collection.indexOf(item) : -1;
    if (i >= 0) collection.splice(i, 1);
    return { kind: 'treasureChart', text: r.text };
  });
  const captainDeps = {
    deed: (act, cls, o) => { const r = captainLedger.deed(act, cls, o); captainSay(); return r; },
    regard: (crown, n) => { const r = captainLedger.regard(crown, n); captainSay(); return r; },
    note: (field, n) => captainLedger.note(field, n),
    stats: () => captainLedger.stats(),
    sailed: (m) => captainLedger.sailed(m),
    prize: (name, worth) => captainLedger.prize(name, worth),
    marque: () => captainLedger.marque(Math.floor(playerTicker.ownMinutes)),
    tearMarque: () => captainLedger.tearMarque(),
    event: (ev) => { const r = harbourOffice.event(ev); captainSay(); return r; },
    sites: () => { const p = playerTravelPixel(); return etherSea && inEther(p.x, p.y) ? [...harbourOffice.sites(), ...etherHost.sites(p.x, p.y), ...shared.seaVentures.wrackSites(p.x, p.y)] : harbourOffice.sites(); },
    yardDiscount: () => harbourOffice.perksHere().yard,
    seasonedHires: () => { const port = navalPortHere(); return !!port && harbourOffice.perksAt(port.crown).seasoned; },
    reliefSure: (crown) => harbourOffice.perksAt(crown).relief,
    chartFor: (cls, seed, deep) => harbourOffice.chartFor(cls, seed, deep),
    raiseCache: (id) => harbourOffice.raiseCache(id),
  };
  shared.naval = createNavalHost({
    captain: captainDeps,
    ether: etherSea ? {
      legendHere: (px, py, o) => etherHost.legendHere(px, py, o),
      legendEnded: (id, act) => { const r = etherHost.legendEnded(id, act); captainSay(); return r; },
      papers: (cls, seed, px, py) => etherHost.papers(cls, seed, px, py),
      gather: (siteId) => shared.seaVentures.gather(siteId) ?? etherHost.gather(siteId),
      fleetEnded: (n, act) => shared.seaVentures.fleetEnded(n, act),
    } : null,
    bountyOf: (e) => (e?.bounty ? harbourOffice.bountyWords(e.bounty) : null),
    sitePoint: (px, py, seed) => navalSitePoint(px, py, seed),
    sightBlocked: (id, point) => shared.glassSight.blocked(player.collider, [cam.pos[0] + _dwEyeOffset[0], cam.pos[1] + _dwEyeOffset[1], cam.pos[2] + _dwEyeOffset[2]], id, point),
    worth: (items) => navalLootWorth(items),
    packedItems: packedItemsCodec,
    pool: csa,
    csa: () => (navalOn() ? csaRuntime : null),
    seaY: () => tvSeaY(),
    isWater: navalIsWater,
    harbourBook,
    shipName: (boat) => shared.fleetHost?.nameOf(boat) ?? '',
    passage: (ship) => passage?.offer(ship), passageCrosses: (h) => shared.tvSeaCrosses(csa.hullRig?.(h)),
    quayLaid: (key, index) => shared.quays?.laid(key, index) ?? true,
    dockedPort: (boat, port) => { const r = boat?.uid ? fleetShip(boat.uid) : null; if (r && (r.port?.name ?? null) !== port) setShipPort(boat.uid, port == null ? null : { name: port }); },
    groundY: (x, z) => surfaceAt(x, z),
    feet: () => player.feetAt(),
    look: () => ({
      origin: [cam.pos[0] + _dwEyeOffset[0], cam.pos[1] + _dwEyeOffset[1], cam.pos[2] + _dwEyeOffset[2]],
      dir: [Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)],
    }),
    level: () => playerEntity.level ?? 1,
    where: () => { const p = playerTravelPixel(); const nearPort = navalNearPort(); const ether = etherWatersHere(); return { px: p.x, py: p.y, region: _questRegionIndex(), day: Math.floor(worldMinutes() / 1440), nearPort, port: navalPortHere(), waters: ether ? 'ether' : watersOf({ nearPort, portPx: navalPortPx() }), ether, capitals: navalCapitals(), cityLights: isCityLightsOn(minuteNow()), night: isNight(minuteNow()) }; },
    say: (text, seconds) => townTalk.say(text, seconds),
    mid: (text, seconds) => setMidScreenText(text, seconds),
    shake: (amount) => betterAmbience.weaponKick(amount),
    audio: { play3d: (k, p, v, o) => audio.play3d(k, p, v, o), loop3d: (k, p, v, o) => audio.loop3d(k, p, v, o) },
    flame: (pos) => navalFlames.flame(pos),
    law: {
      crime: (region, crime) => { lowerRepForCrime(playerEntity, region, crime); surfacePlayer(); },
      legal: (region, n) => { changeLegalRep(playerEntity, region, n); surfacePlayer(); },
      faction: (id, n) => { if (playerEntity.factionRep) changeReputation(playerEntity.factionRep, id, n, true); },
    },
    // The sea poses its ships after the eye is placed, so a deck carry places the eye again.
    deck: { allowed: deckMayCarry, ground: deckGround, carry: (d, yawDeg) => { deckCarry(d, yawDeg); cam.pos = player.eyeAt(); } },
    board: {
      leaveHelm: () => { if (csaRuntime?.isSailing?.()) csaCall(() => csaRuntime.StopSailing?.()); },
      placePlayer: (feet, yaw) => { player.spawn(feet[0], feet[1], feet[2]); cam.yaw = yaw; lookFilter.settle(); },
      deckSpots: (boat, n) => navalDeckSpots(boat, n),
      crewOf: (boat, n, opts) => navalCrew.takeByBoat(boat, n, opts),
      landing: (boat, feet) => navalDeckLanding(boat, feet),
      railSpots: (boat, toward, n) => navalRailSpots(boat, toward, n),
      spawnFoe: navalSpawnFoe,
      foeDown: (h) => !!h?.foe?.dead,
      removeFoe: (h) => { if (!h) return; h.gone = true; if (h.foe && !h.foe.dead) shared.exteriorFoes.removeFoe(h.foe); },
      standDown: navalStandDown,
      takeHelm: (boat) => { if (boat && csaRuntime) csaCall(() => csaRuntime.StartSailing(boat)); },
      startRaid: (name) => {
        if (warmAshesRaidUnderWay()) return null;
        const q = waRaidQuest(name);
        if (!q) return null;
        try { shared.questBridge.machine.startQuestImmediate(q); } catch (e) { console.warn('[naval] the raid would not start', e); return null; }
        return q;
      },
      endRaid: (quest, { withdraw = false, won = false, crew = false } = {}) => {
        if (!quest || !shared.questBridge) return;
        if (won) { shared.raidAshore.won(quest); return; }
        if (crew) shared.raidAshore.crew(quest);
        if (withdraw) for (const f of [...shared.exteriorFoes.foes]) if (!f.dead && f.questBehaviour?.questUID === quest.uid) shared.exteriorFoes.removeFoe(f);
        if (quest.questTombstoned) return;
        try { shared.questBridge.machine.tombstoneQuest(quest); } catch (e) { console.warn('[naval] the raid would not end', e); }
      },
      openPlunder: (model) => navalOpenPlunder(model),
      giveItems: navalGiveItems,
      mintUid: () => csaNewItemUid(),
      packDeed: (item) => { titleDeed(item, { port: null }); return () => fleetBook(); },
      forgetDeed: (item) => forgetShip(item?.UID),
      terrainAt: (p) => csaTerrainOf(csaPixelAt(p[0], p[2])),
      redeck: (from, to) => { for (const f of _deckBodies) if (f.deckBoat === from) f.deckBoat = to; },
    },
    gold: () => totalGoldAmount(playerEntity),
    pay: (n) => { deductGold(playerEntity, n); surfacePlayer(); },
    openYard: (model) => navalOpenYard(model),
    stores: {
      count: (boat) => storesIn(boat?.Cargo?.Items),
      spend: (boat) => spendStore(boat?.Cargo?.Items),
      add: (boat, n) => { if (!boat?.Cargo?.Items) return false; addItem(boat.Cargo.Items, mintStores(n)); return true; },
    },
    crewSeed: (boat) => _crewSeedOf(boat),
    hold: (key, tier) => {
      const items = generateLootItems(key, { level: playerEntity.level, gender: playerEntity.gender });
      addPileLootExtras(items, key, undefined, { level: playerEntity.level });
      rollLootRarity(items, pileSource(tier), { luck: liveStat(playerEntity, 'luck') });
      stampWonWeapons(items, 1);
      return items;
    },
    get online() {
      if (!shared.online || shared.online.status !== 'open' || !isCellRoom(shared.online.room)) return null;
      return { id: () => shared.online?.id ?? null, peers: () => shared.peersNear() ?? [] };
    },
    sendHit: (data) => shared.hitSend(data),
    peerBoats: () => csaPeers.helmBoats(),
    aboardPeer: () => csaAboard.aboard?.boat ?? null,
    swimming: () => walkMode && shared.playerSpawned && !!player.isPlayerSwimming,
    warmAshesOn: () => warmAshesOn(),
    raiderSpent: (id) => { seaRaidSpend(id); tvRaid.chase.delete(id); },
    setting: (key) => (key === 'ShipsAtSea' ? getPref('naval-ships') : key === 'RaidPrize' ? getPref('naval-raid-prize') !== false : key === 'Boarders' ? getPref('naval-boarders') !== false
      : key === 'AimCamera' ? getPref('naval-aim-camera') !== false : key === 'AutoRepair' ? getPref('naval-auto-repair') !== false : undefined),
    random: Math.random,
    refit: (boat) => shared.fleetHost?.refit(boat) ?? null,
    get serpent() { return shared.serpentHost; },
  });
  shared.naval.setEnabled(navalOn());
  registerModSaveData(NAVAL_SAVE_VENDOR, shared.naval);
  registerModSaveData(CAPTAIN_SAVE_VENDOR, { ...captainLedger, restoreSaveData: (r) => { _rankLines.length = 0; captainLedger.restoreSaveData(r); } });
  // Registered even with Come Sail Away off, so such a boot never drops the fleet record.
  registerModSaveData(FLEET_SAVE_VENDOR, fleetSaveSlot);
  const csaPortRange = () => { try { return Number(modSetting(COME_SAIL_AWAY_VENDOR, 'Controls.PortLocationSearchRange') ?? 3) | 0; } catch { return 3; } };
  shared.fleetHost = csaRuntime ? createFleetHost({
    csa: () => (csaOn() ? csaRuntime : null),
    naval: () => (navalOn() ? shared.naval : null),
    pack: () => (playerEntity.items ??= []),
    gold: () => totalGoldAmount(playerEntity),
    pay: (n) => { deductGold(playerEntity, n); surfacePlayer(); },
    accounts: () => playerEntity.bankAccounts ?? [],
    regionName: (i) => REGION_NAMES[i] ?? null,
    where: () => { const px = playerTravelPixel(); return { inside: (shared.modes?.mode ?? 'exterior') !== 'exterior', pixel: { X: px.x, Y: px.y }, feet: dwPlayerObjectPosition(), sea: !!shared.online?.wildOk && !!etherSea }; },
    nearPort: () => !!csaRuntime.IsNearPort(csaPortRange()),
    nearestPort: () => csaNearestPort(),
    terrainAt: (p) => csaTerrainOf(csaPixelAt(p[0], p[2])),
    passengersAboard: (boat) => csaPassengersOn(boat),
    veilApart: (rec, boat) => { const p = playerTravelPixel(); const hers = boat?.MapPixel ? inEther(boat.MapPixel.X, boat.MapPixel.Y) : !!rec?.port?.ether; return etherSea && inEther(p.x, p.y) !== hers; },
    changed: () => surfacePlayer(),
    openHold: (uid) => holdDoor.openShip(uid),
    guildArms: () => shared.guildBook?.guild?.heraldry ?? null,
    captain: () => captainLedger,
    openDeck: (uid) => deckPlan(uid),
  }) : null;
  const deckPlan = createDeckPlanDoor({ pool: csa, pipeline, act: (uid, verb, arg) => shared.fleetHost.act(uid, verb, arg), show: (w) => townTalk.showOverlay(w), say: (l) => townTalk.say(l) });
  const shipFlags = createShipFlagHost({
    myBoats: () => (shipFlagPass && csaRuntime && csaOn() ? csaRuntime.AllBoats : []),
    coloursOf: (uid) => fleetShip(uid)?.colours ?? null,
    guildArms: () => shared.guildBook?.guild?.heraldry ?? null,
    peerFlags: () => (shipFlagPass ? csaPeers?.flagged?.() ?? [] : []),
    seaFlags: () => (shipFlagPass && navalOn() ? shared.naval?.seaFlags?.() ?? [] : []),
    shown: () => !!shipFlagPass && shared._mode() === 'exterior',
  });
  shipyardHost = csaRuntime ? createShipyardHost({
    fleet: () => shared.fleetHost,
    naval: () => (navalOn() ? shared.naval : null),
    csa: () => (csaOn() ? csaRuntime : null),
    pack: () => (playerEntity.items ??= []),
    addToPack: (item) => { addItem((playerEntity.items ??= []), item); surfacePlayer(); },
    gold: () => totalGoldAmount(playerEntity),
    pay: (n) => { deductGold(playerEntity, n); surfacePlayer(); },
    credit: (n) => {
      if (sellProceeds(n, { carriedWeightKg: carriedWeight(playerEntity), maxEncumbranceKg: entityMaxEncumbrance(playerEntity) }).kind === 'letterOfCredit') (playerEntity.items ??= []).unshift(letterOfCredit(n));
      else addGold(playerEntity, n);
      surfacePlayer();
    },
    canCarry: (item) => planTake(item, { bag: (playerEntity.items ??= []), entity: playerEntity, dryRun: true }).ok,
    ashore: (uid) => shared.naval?.handsAshore?.(uid) ?? 0,
    forgetBoat: (uid) => shared.naval?.forgetBoat?.(uid),
    skills: () => ({ mercantile: skillValue(playerEntity, SKILLS.Mercantile), personality: playerEntity.stats?.personality == null ? 50 : liveStat(playerEntity, 'personality') }),
    traded: () => tallySkill(playerEntity, SKILLS.Mercantile, 1),
    mintUid: () => csaNewItemUid(),
    day: () => Math.floor(worldMinutes() / 1440),
    changed: () => surfacePlayer(),
    cabinHolds: (uid) => shared.modes?.cabinHolds?.(uid) ?? 0,
    cabinSold: (uid, region) => shared.modes?.cabinSold?.(uid, region),
    passengersAboard: (boat) => csaPassengersOn(boat),
    online: () => shared._onlineWorldSession() && characterIdOf(playerEntity),
  }) : null;
  function openShipyard(site, page) {
    if (!site) return false;
    if (!shipyardHost) { setMidScreenText(PORT_TEXT.noSail); return true; }
    let door = null;
    const win = createShipyardOverlay({
      page,
      model: (view) => shipyardHost.model(site, view),
      act: (verb, a, b) => shipyardHost.act(site, verb, a, b),
      onDoor: (fn) => { door = typeof fn === 'function' ? fn : null; },
      picture: (hull, where) => shipPortraits.picture(hull, where),
    });
    if (!win) return false;
    townTalk.showOverlay(win, () => { const fn = door; door = null; if (fn && fn() === false) openShipyard(site, 'fleet'); });
    return true;
  }
  const captainPage = createCaptainPageHost({ ledger: captainLedger, naval: () => shared.naval, office: () => harbourOffice, minutes: () => playerTicker.ownMinutes,
    show: (w) => townTalk.showOverlay(w), changed: () => { shared.fleetHost?.restat(); surfacePlayer(); } });
  const passage = createPassageHost({ naval: () => shared.naval, csa: () => (csaRuntime && csaOn() ? csaRuntime : null), ports: navalPortList, here: navalPortHere, pixel: playerTravelPixel,
    ether: (p) => !!etherSea && inEther(p.x, p.y), place: (p) => shared.tvPlaceSummary(p.px, p.py), canGo: travelViewCanGo, route: travelViewRouteTo, travel: () => shared.travelOptions,
    journeyTo: () => shared.tvTrip.plan?.summary?.pixel ?? (shared.tvTrip.plan ? 'spot' : null), standsOn: csaStandsOn, busy: worldMoveBusy, player, remount: setTransportModeHere, talk: townTalk, isWater: navalIsWater });
  setHoldingsProvider({
    ...stableProviderFor({ runtime: hccRuntime, on: hccOn, hasHorse: () => shared.hasTransport(TRANSPORT_HORSE), hasCart: () => shared.hasTransport(TRANSPORT_SMALL_CART), wagonKind: () => activeWagonKind(playerEntity.items ?? []), items: () => playerEntity.items ?? [], onPainted: () => { shared._hccDirty = true; },
      upkeep, pass: upkeepPass }),
    fleet: shared.fleetHost ? { model: () => shared.fleetHost.model(), offer: (uid) => shared.fleetHost.offer(uid), act: (uid, verb, arg) => shared.fleetHost.act(uid, verb, arg) } : null,
    captain: shared.fleetHost ? { model: () => captainPage.model(), openStars: () => captainPage.openStars(), stars: () => captainPage.stars() } : null,
  });
  const navalClear = () => { shared.naval?.clear(); navalFlames.clear(); navalCrew.clear(); closeNavalPlunder(); closeShipyard(); closeNavalYard(); closeEtherChart(); drawNavalHud(null); drawNavalTags([]); drawCrewBars([]); drawCrewLines([]); lowerGlass(); };
  const cabinHarbours = createCabinHarbours({ clear: () => harbourBook.clear(), place: (uid) => ({ pixel: [state.current.x, state.current.y],
    origin: [state.mapOrigin.x, state.mapOrigin.y, ...state.compensation], boat: csaRuntime?.AllBoats?.find((b) => b.uid === uid)?.GameObject.position ?? null }) });
  const navalTransition = (door = null) => { cabinHarbours.transition(door); navalClear(); withdrawCrossing(); };
  // Stow before a transition empties the sea, but never on a load: the loaded save's hold wins.
  const navalStow = () => { if (!shared._loading) shared.naval?.stowPlunder?.(); };

  let _navalWasOn = null;

  function navalFrame(dt) {
    if (!gamePaused() && !shared._loading) captainSayFlush();
    shared._officeTickT -= dt;
    if (shared._officeTickT <= 0 && !gamePaused() && !shared._loading) {
      shared._officeTickT = 2; harbourOffice.tick(); captainSay();
      if (etherSea && shared._mode() === 'exterior') { const p = playerTravelPixel(); if (inEther(p.x, p.y)) { etherHost.sight(p.x, p.y); captainSay(); } }
    }
    if (!gamePaused() && !shared._loading) { etherCrossStep(dt); shared.veilParty.step(dt); }
    passage.frame(dt, gamePaused() || shared._loading);
    const on = navalOn();
    if (on !== _navalWasOn) { _navalWasOn = on; shared.naval.setEnabled(on); if (!on) { navalFlames.clear(); closeNavalPlunder(); closeNavalYard(); drawNavalHud(null); drawNavalTags([]); } }
    if (!on) return;
    if (csa.seaBoats.length || csaRuntime.isSailing()) installNavalSounds(audio);
    if (shared._mode() === 'exterior' && !gamePaused() && !shared._loading) { laneShips(); shared.seaVentures.step(shared.lightning?.strikes ?? 0); }
    shared.naval.frame(dt * worldTimeScale(), { paused: gamePaused() || shared._loading, outdoors: shared._mode() === 'exterior', brace: csaRuntime.isSailing() && (held(shared.keys, 'Crouch') || navalTouchBrace()) });
    // The mod's own collider sync runs before the sea poses its ships, so sync again here.
    if (shared.naval.collidable().length) csaSyncColliders();
    navalFlames.tick(gamePaused() ? 0 : dt);
  }

  function navalRelease() {
    if (!shared.naval?.aiming) return;
    if (townTalk.overlayActive || gamePaused() || shared.modeNow() !== 'exterior') shared.naval.cancelAim();
    else shared.naval.attackInput(false);
  }
  const navalPadCodes = () => {
    const b = bindings();
    return { aim: getBinding(b, 'SwingWeapon', false) ?? getJoystickUIBinding(b, 'RightClick'), board: getJoystickUIBinding(b, 'LeftClick'), brace: getBinding(b, 'Crouch', false) };
  };
  const classicCompassBox = () => {
    const s = hudScale(canvas.width, canvas.height), k = canvas.width > 0 && canvas.clientWidth > 0 ? canvas.clientWidth / canvas.width : 1;
    return { w: shared.hudArt.compassBox.w * s * k, h: shared.hudArt.compassBox.h * s * k };
  };

  function navalTags(proj, view, eye) {
    if (!navalOn() || typeof document === 'undefined') return;
    const covered = townTalk.overlayActive || gamePaused() || !!townTalk.hudHidden || shared._mode() !== 'exterior' || !!shared.travelView?.active;
    const { w, h } = shared._canvasSize(), rect = worldViewportRect(w, h);
    const points = [];
    for (const t of covered ? [] : shared.naval.tags()) {
      const at = projectToScreen(t.point, w, h, proj, view, rect);
      if (!at.front || at.x < -60 || at.x > w + 60 || at.y < -40 || at.y > h + 40) continue;
      if (shared.glassCuts(at)) continue;
      if (shared.shipSight.blocked(player.collider, eye, t.id, t.point)) continue;
      points.push({ ...t, x: at.x, y: at.y });
    }
    const r = worldRectPx(rect, w, h);
    drawNavalTags(points, { covered, scale: enhancedHudScale(), reach: NAVAL_TAG_RANGE, focus: { x: r.x + r.w / 2, y: r.y + r.h / 2 } });
  }

  let _crewKey = 0;
  function navalCrewBars(proj, view, eye) {
    if (typeof document === 'undefined') return;
    shared.touchFxFrame?.(proj, view);
    const covered = townTalk.overlayActive || gamePaused() || !!townTalk.hudHidden || !!shared.travelView?.active;
    const points = [];
    if (!covered) {
      const { w, h } = shared._canvasSize(), rect = worldViewportRect(w, h);
      for (const f of shared._mode() === 'exterior' ? shared.exteriorFoes.foes : shared._insidePool()) {
        const feet = f.ai?.feet;
        if (!isShipmate(f) || !feet || !f.entity) continue;
        const d = Math.hypot(feet[0] - eye[0], feet[1] - eye[1], feet[2] - eye[2]);
        if (d > CREW_BAR_RANGE) continue;
        const head = crewBarPoint(feet, f.ai.height ?? CAPSULE_HEIGHT, player.collider);
        const at = projectToScreen(head, w, h, proj, view, rect);
        if (!at.front || at.x < -40 || at.x > w + 40 || at.y < -20 || at.y > h + 20) continue;
        if (shared.glassCuts(at)) continue;
        let key = shared._crewKeys.get(f);
        if (key == null) { key = `crew:${++_crewKey}`; shared._crewKeys.set(f, key); }
        if (shared.crewSight.blocked(player.collider, eye, key, head)) continue;
        const max = f.entity.maxHealth;
        const mate = f.companion != null;
        points.push({ x: at.x, y: at.y, share: max > 0 ? Math.max(0, f.entity.health) / max : 1, distance: d,
          ...(mate ? (f.puppet ? { name: f.companionName || 'Companion', fx: [] } : { name: f.entity.name || 'Companion', hp: f.entity.health, hpMax: max, fx: composePartyFx(f.entity) }) : {}) });
      }
    }
    drawCrewBars(points, { covered, scale: enhancedHudScale() });
  }
  let _crewBoarding = null;
  const navalMyRoster = (boat, seed, crew) => {
    const hands = shared.naval?.crewOf?.(boat)?.hands ?? [];
    return crewRoster({ hull: boat.hull, seed, crew }).map((r, i) => (hands[i] ? { mobile: hands[i].mobile, gender: hands[i].gender === 'female' ? 'female' : 'male' } : r));
  };

  const _crewCtx = { battle: false, struck: false, muster: 0, way: null, avoid: null, order: null, sings: true, line: null, asleep: false, work: 0, call: null, roles: null, lookout: -1 }, _crewMe = [0, 0, 0], _crewThem = [0, 0, 0];
  const _crewSeed = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193); return h >>> 0; };
  const _crewSeedOf = (boat) => {
    const id = shared.online?.id ?? null;
    if (id && csaRuntime) { let n = 0; for (const x of csaRuntime.AllBoats) { if (x === boat) return _crewSeed(`${id}:${n}`); if (x.GameObject?.activeSelf) n++; } }
    return (boat.uid ?? 1) >>> 0;
  };
  const _crewOwner = (boat) => { const k = boat.peerKey ?? ''; return k.slice(0, k.lastIndexOf(':')); };
  function navalCrewFrame(dt) {
    if (!navalOn() || !csa?.deckOf || (shared.modes?.mode ?? 'exterior') !== 'exterior') { navalCrew.clear(); return; }
    const b = shared.naval?.boarding ?? null;
    if (_crewBoarding && !b) for (const boat of csa.boats) navalCrew.reset(boat);
    _crewBoarding = b;
    const eye = cam.pos, list = [];
    const near = (key, pos) => !!pos && Math.hypot(pos[0] - eye[0], pos[2] - eye[2]) < (navalCrew.has(key) ? CREW_KEEP : CREW_RANGE);
    for (const boat of csa.boats) {
      if (!boat?.crewed || !boat.GameObject?.activeSelf || !near(boat, boat.GameObject.position)) continue;
      const mine = shared.naval?.myCrew?.(boat) ?? null, crew = mine?.crew ?? hullBuild(boat.hull).crew, seed = _crewSeedOf(boat);
      const raid = !!b?.quest && b.boat === boat;
      list.push({ key: boat, boat, deck: csa.deckOf(boat.hull, boat.variant ?? 0), count: shared.crewCount({ hull: boat.hull, crew }), rosterOf: () => navalMyRoster(boat, seed, crew), seed, faction: null, battle: !!mine?.battle, way: mine?.way ?? null, toward: mine?.toward ?? null, hold: raid, mine, away: shared.naval?.awayOf?.(boat) ?? shared.NO_HANDS_AWAY });
    }
    for (const boat of csa.peerBoats) {
      if (!boat?.crewed || !boat.GameObject?.activeSelf || !near(boat, boat.GameObject.position)) continue;
      const word = shared.naval?.peerBoat?.(_crewOwner(boat)) ?? null;
      const crew = Math.round(hullBuild(boat.hull).crew * (word?.crewShare ?? 1)), seed = _crewSeed(boat.peerKey ?? '');
      list.push({ key: boat, boat, deck: csa.deckOf(boat.hull, boat.variant ?? 0), count: shared.crewCount({ hull: boat.hull, crew }), rosterOf: () => crewRoster({ hull: boat.hull, seed, crew }), seed, faction: null, battle: !!word?.battle, work: word?.work ?? 0 });
    }
    for (const s of shared.naval?.crewShips?.() ?? []) {
      if (!near(s.key, s.pos)) continue;
      list.push({ key: s.key, boat: s.boat, deck: csa.deckOf(s.boat.hull, s.boat.variant ?? 0), count: shared.crewCount({ hull: s.boat.hull, shipClass: s.shipClass, crewShare: s.crewShare }), rosterOf: () => crewRoster({ hull: s.boat.hull, seed: s.seed, shipClass: s.shipClass, crewShare: s.crewShare }), seed: s.seed, faction: s.faction, battle: s.battle, struck: s.struck, way: s.way ?? null, toward: s.toward, hold: s.hold, work: s.work ?? 0 });
    }
    navalCrew.sync(list);
    const grapple = b?.phase === 'grapple' ? b : null;
    const asleep = asleepHour(hourOf(minuteNow()));
    navalCrew.frame(dt, eye, (key, ship) => {
      const m = ship.boat.MeshObject.worldMatrix();
      _crewCtx.battle = ship.battle; _crewCtx.struck = ship.struck; _crewCtx.muster = 0; _crewCtx.way = null; _crewCtx.avoid = null;
      _crewCtx.order = ship.mine?.order ?? null; _crewCtx.sings = ship.mine?.sings ?? true; _crewCtx.line = ship.mine?.line ?? null;
      _crewCtx.asleep = asleep; _crewCtx.work = ship.mine ? ship.mine.work ?? 0 : ship.work ?? 0;
      _crewCtx.call = ship.mine?.call ?? null;
      if (ship.mine) ship.mine.call = null;
      _crewCtx.lookout = ship.mine?.lookout ?? -1;
      _crewCtx.roles = ship.mine?.roles ?? null;
      if (walkMode && shared.playerSpawned) {
        intoDeck(m, player.pos, _crewMe);
        if (Math.abs(_crewMe[1] - (ship.deck.heightAt(_crewMe[0], _crewMe[2]) || 0)) < 2) _crewCtx.avoid = _crewMe;
      }
      const other = grapple ? (key === grapple.shipId ? grapple.boat : key === grapple.boat ? shared.naval.boatOf(grapple.shipId) : null) : null;
      const toward = other?.GameObject ? other.GameObject.position : ship.toward;
      if (toward) { intoDeck(m, toward, _crewThem); _crewCtx.muster = _crewThem[0] >= 0 ? 1 : -1; }
      if (toward) _crewCtx.way = other ? (key === grapple.shipId ? (grapple.kind === 'board' ? 'repel' : 'board') : grapple.kind) : ship.way ?? null;
      return _crewCtx;
    });
  }

  let _sayKey = 0;
  function navalCrewLines(proj, view, eye, dt = 0) {
    if (typeof document === 'undefined') return;
    const covered = townTalk.overlayActive || gamePaused() || !!townTalk.hudHidden || shared._mode() !== 'exterior' || !!shared.travelView?.active;
    const points = [];
    if (!covered) {
      const { w, h } = shared._canvasSize(), rect = worldViewportRect(w, h);
      for (const l of navalCrew.speech()) {
        const d = Math.hypot(l.head[0] - eye[0], l.head[1] - eye[1], l.head[2] - eye[2]);
        if (d > CREW_SAY_RANGE) continue;
        const at = projectToScreen(l.head, w, h, proj, view, rect);
        if (!at.front || at.x < -80 || at.x > w + 80 || at.y < -40 || at.y > h + 40) continue;
        if (shared.glassCuts(at)) continue;
        let key = shared._sayKeys.get(l.member);
        if (key == null) { key = `say:${++_sayKey}`; shared._sayKeys.set(l.member, key); }
        if (shared.crewSight.blocked(player.collider, eye, key, l.head)) continue;
        const name = csa.boats.includes(l.key) ? shared.naval?.crewName?.(l.key, l.member.i) : null;
        points.push({ x: at.x, y: at.y, text: l.text, name: name ? name.split(' ')[0] : null, who: key, kind: l.kind, distance: d });
      }
      livingLinePoints(points, w, h, rect, proj, view, eye);
    }
    drawCrewLines(points, { covered, scale: enhancedHudScale(), dt: gamePaused() ? 0 : dt });
  }

  function navalHud(dt = 0) {
    if (!navalOn()) return;
    const model = shared._mode() === 'exterior' ? shared.naval.hudModel() : null;
    const covered = townTalk.overlayActive || gamePaused() || !!townTalk.hudHidden || !!shared.travelView?.active;
    if (!model || covered) { drawNavalHud(model, { dt: gamePaused() ? 0 : dt, covered }); return; }
    const family = controllerLook() ? padFamily() : null;
    const pad = family ? navalPadCodes() : null;
    drawNavalHud(model, {
      dt: gamePaused() ? 0 : dt,
      covered,
      keys: pad ? { aim: pad.aim ? hdGlyphName(family, pad.aim) : null, board: pad.board ? hdGlyphName(family, pad.board) : null, brace: pad.brace ? hdGlyphName(family, pad.brace) : null }
        : { aim: navalKeyName('SwingWeapon'), board: navalKeyName('Interact'), brace: navalKeyName('Crouch') },
      scale: enhancedHudScale(),
      under: enhancedHelmBar(),
      vitals: enhancedHudBottom(), quick: enhancedHudQuick(),
      compass: !isEnhanced() && shared.hudArt?.compassBox ? classicCompassBox() : null,
      touch: !!shared.touch,
      glassUp: shared.spyglass.up,
    });
  }
  let _navalWordKey = null;
  let _navalWordMade = null;
  function navalWord(frame, full) {
    if (!navalOn()) { if (!_navalWordKey) return false; if (frame) { frame.nv = null; _navalWordKey = ''; } return true; }
    if (_navalWordMade?.at !== shared._foesSentAt) { const made = shared.naval.word(campToWire); _navalWordMade = { at: shared._foesSentAt, rec: made, key: navalRecordKey(made) }; }
    const { rec, key } = _navalWordMade;
    if (!full && key === _navalWordKey) return false;
    if (frame) { frame.nv = rec; _navalWordKey = key; }
    return true;
  }
  const csaKeyLabel = (action) => { const b = bindings(); const c = getBinding(b, action) ?? getBinding(b, action, false); return c && !/^Joystick/.test(c) ? buttonText(c) : ''; };

  const csaHelmHooks = {
    press: (action, withHeld) => csaHelmPress(action, withHeld),
    hold: (action, on) => csaHelmHold(action, on),
    position: () => csaCall(() => { const b = csaRuntime?.state?.CurrentBoat; if (b) csaRuntime.StartShowBoatPosition(b); }),
    orders: () => { const b = csaRuntime?.state?.CurrentBoat; if (b) navalOrders(b); },
    cargo: () => { const b = csaRuntime?.state?.CurrentBoat; if (b) holdDoor.openBoat(b); },
    shot: () => { shared.naval?.cycleShot?.(1); },
  };
  function navalOrders(boat) {
    if (!navalOn() || !shared.naval || !boat) return false;
    const c = shared.naval.crewOf?.(boat);
    if (!c) return false;
    const rows = orderRows({ crewed: c.crewed, order: c.order });
    csaOpenListPicker(rows.map((r) => r.label), (i) => {
      if (shared._csaPicker) { shared.modes?.closeWindow?.(shared._csaPicker); shared._csaPicker = null; }
      if (rows[i]) shared.naval.giveOrder?.(boat, rows[i].id);
    });
    return true;
  }

  function csaDrawHelmPanel() {
    if (!csaRuntime || !csaOn() || !isEnhancedPlus() || typeof document === 'undefined' || !walkMode) { if (enhancedHelmMounted()) hideEnhancedHelm(); csaHelmInput.held.clear(); return; }
    let helm = null;
    csaCall(() => { helm = csaRuntime.helmPanelState(); });
    const card = passengerCard(csaRuntime.state?.CurrentBoat, csaJourneyHelm, helm);
    if (helm) helm = card ? null : { ...helm, orders: navalOn(), cargo: holdsCargo(helm.hull), shot: navalOn() ? shared.naval?.shotLabel?.() ?? null : null };
    if (!helm) csaHelmInput.held.clear();
    const ab = helm ? null : card ?? csaAboard.aboard;
    if (!helm && !ab) { drawEnhancedHelm({ helm: null, aboard: null }, csaHelmHooks); return; }
    drawEnhancedHelm({
      helm, aboard: ab?.passage ? ab : ab ? { hull: ab.boat.hull, owner: shared.peerName(ab.owner) } : null,
      covered: townTalk.hudCovered || (shared.modes?.hudCovered ?? false) || gamePaused() || !hudRenderEnabled() || !!shared.travelView?.active || !!_travelUIHolder.ui?.isShowing,
      touch: !!shared.touch, mouseFree: cursorActive() || shared.pointerSurfaces.size > 0 || !document.pointerLockElement,
      freeKey: csaKeyLabel('FreeMouse'), keyOf: csaKeyLabel,
    }, csaHelmHooks);
  }
  const playerAfloat = () => !!csaRuntime?.isSailing?.() || (playerEntity.activeEffects ?? []).some((e) => isBoatEffectBundle(e?.bundleName))
    || !!csaAboard.aboard?.boat || !!shared.naval?.aboard?.() || (walkMode && shared.playerSpawned && !!player.isPlayerSwimming);

  const _csaFill = (from, lights) => {
    let n = from;
    for (const l of lights) {
      const e = shared._sceneLights[n] ?? (shared._sceneLights[n] = { x: 0, y: 0, z: 0 });
      e.x = l.x; e.y = l.y; e.z = l.z; e.wodRange = l.range; e.wodColor = l.color;
      adoptLight(e, l);
      n++;
    }
    return n;
  };
  return {
    CSA_MAP_TEXT_LAYER, CSA_RIGID_EPS, NAVAL_DECK_BODY_R, _csaFill, _csaWidgetFrames, actKeyWord, cabinHarbours, campDeckAt,
    campDeckResolve, captainSay, caravanDoorLanding, caravanDoorOpen, caravanEntryRow, caravanEntryTurn,
    caravanEntryWord, caravanVisitEnter, caravanVisitMay, csaAboardWord, csaActivate, csaActivationPick, csaBoatId,
    csaBoatUnderMe, csaBoatYaw, csaCall, csaCameraFilter, csaColliderBoats, csaColliderMesh, csaDeckWord,
    csaDrawHelmPanel, csaDrawParticlesBlended, csaDrawParticlesOpaque, csaDrawWaves, csaDrawWindWidget, csaFrame,
    csaHelmHold, csaHelmLeft, csaHelmPress, csaHoldsTimeScale, csaHoverName, csaInputFrame, csaIsPortTown, csaKeyCode,
    csaKeyLabel, csaModLoadFailed, csaModeCollider, csaNearestPort, csaNewItemUid, csaOnTeleport, csaOnTransition,
    csaOpenCargo, csaOpenListPicker, csaPixelAt, csaPoolFrame, csaPoseAhead, csaPreJump, csaSeaReach, csaSetFacing,
    csaShapeOf, csaShelfStocked, csaTerrainOf, csaUnityGain, csaUpdate, csaWord, ensureBankCabinLink, etherHost,
    etherPortNear, helmTurnKeys, legacyCabinItems, navalCapitals, navalCarry, navalCrew, navalCrewBars,
    navalCrewFrame, navalCrewLines, navalDeckBody, navalFlames, navalFrame, navalHostileNear, navalHud, navalKeyName,
    navalLeash, navalOn, navalPadCodes, navalRelease, navalRender, navalStow, navalTags, navalTransition, navalWord,
    openShipyard, passage, playerAfloat, shipFlags,
  };
}
