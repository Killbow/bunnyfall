// The world's save and load: the quick save and quick load, the boot load and classic load, and
// the pose and overworld reset on load. It also holds the exit autosave, the online and realm
// checkpoints, and a realm character's birth, legacy creation, and first save.

import { applyWeaponPose, mergeWeaponPose, weaponPoseOf } from '../combat/playerWeapon.js';
import { assignShipToPlayer, SHIP_INTERIOR_MAP_IDS } from '../trade/banking.js';
import { autoBuildArms } from '../combat/weaponRig.js';
import { bankCabinCandidates, readBankCabinLink } from '../systems/naval/boatCabinOwnership.js';
import { betterAmbience } from '../audio/betterAmbience.js';
import { BOOT_DOOR_KEYS, isOnlinePage } from '../platform/onlineLane.js';
import { bootLoadPlan } from '../saves/bootLoadPlan.js';
import { cabinSceneName, savedCabinBoat } from '../systems/naval/sailingCabin.js';
import { CAMP_TEXT, packSavedFires } from '../systems/survival/camp.js';
import { savedLanding, LANDING_TEXT } from '../saves/mineSaveLanding.js';
import { CARAVAN_TEXT } from '../travel/caravanRoom.js';
import { checkpointAllowed } from '../saves/onlineCheckpoint.js';
import { classicSaveToSnapshot, peekPendingClassicSave, takePendingClassicSave } from '../saves/classicSave.js';
import { closeShipyard } from '../ui/navalPlunderDoor.js';
import { COME_SAIL_AWAY_VENDOR } from '../systems/naval/comeSailAway.js';
import {
  composeSessionState, dungeonPixelFor, restorePlayer, restoreSessionState, snapshotPlayer,
} from '../saves/save.js';
import { DeathScreen } from '../ui/deathScreen.js';
import { flushStateChange as dwFlushStateChange } from '../underwater/deepWaterPlayer.js';
import { loadFinished as dwLoadFinished, loadStarted as dwLoadStarted } from './deepWaterRuntime.js';
import {
  exitAutosaveNames, loadSlot, mostRecentRestorable, QUICK_SAVE_NAME, quickLoadSlot, requestScreenshot, saveSlot,
  slotLoaded,
} from '../saves/saveSlots.js';
import { fetchBytes, realmSaveSink } from '../scenes/shared.js';
import { floorLanding } from '../player/enterExit.js';
import { getInt } from '../platform/settings.js';
import { importClimateWeathers } from '../weather/weatherSim.js';
import { inEther } from './ethericSea.js';
import { layoutStampOfPixel, stampLayout } from './layoutPins.js';
import { legacyOn } from '../systems/legacy/settings.js';
import { loadSpellIndex } from '../characters/chargenSession.js';
import { localizedText, t } from '../ui/textManager.js';
import { longitudeLatitudeToMapPixel } from '../formats/mapsFile.js';
import { messageBox } from '../ui/notify.js';
import { modSaveRecords, restoreModSaveRecords } from '../saves/modSaveData.js';
import { mwViewLoadPose, mwViewSaveCamera } from '../player/mwView.js';
import { OCEAN_HOLES_VENDOR } from './oceanHoles.js';
import { offlineExitSave } from '../saves/exitSave.js';
import { ownWalkWaiting, setWorldMinutes, worldMinutes } from './worldTick.js';
import { parkedCaravanAt } from '../travel/caravanRoomHost.js';
import { playerEntity, surfacePlayer } from '../characters/playerEntity.js';
import { readTokens as readRscTokens, RSC } from '../formats/textRsc.js';
import { realmBootSearch, realmCreate, realmPut, realmSummaryOf, sayRealmSave } from '../saves/realmSaves.js';
import { releaseUnloadGuard } from '../platform/unloadGuard.js';
import { reportModCompatibilityIssues } from '../audio/immersiveFootsteps.js';
import { REPOSITION } from '../systems/naval/ship.js';
import { resetTimeScale, timeScale as worldTimeScale } from './timeScale.js';
import { resetVitalsDetector } from '../ui/hudVitals.js';
import { reviveQuestBehaviour } from '../systems/quest/questFoeHost.js';
import { stakedSaveRefusal } from '../ui/gambitTableWords.js';
import { stampItemIds } from '../items/itemIds.js';
import { STREAMING_TERRAIN_SCALE } from './terrainSampler.js';
import { successionOpen } from '../ui/legacyDoor.js';
import { undergroundWakeSpot, undergroundWakeText } from '../player/deathRespawn.js';
import { worldCoordToMapPixel } from './streamingWorld.js';
import { wrapAngle } from './mat4.js';

/** @param {any} shared */
export function createWorldSaveLoad(shared) {
  const {
    _teleportToPixel, closeWindowsForLoad, enterLinkedBankCabin, legacyRealmLine, params, playerTravelPixel,
    portFrame, realmBoot, realmIoNow, realmLost, realmSession, standSavedOuterCamps, worldMoveBusy,
  } = shared;
  const bootLoadPick = !params.has('load') || (params.has('classicload') && peekPendingClassicSave()) ? null
    : realmBoot ? { realm: true }
    : params.has('loadkey')
      ? { key: Number(params.get('loadkey')) }
      : { mostRecent: true };

  const bootSnap = () => (shared.bootSnapRead === undefined ? (shared.bootSnapRead = pickedSaveSnap(bootLoadPick ?? {})) : shared.bootSnapRead);
  let _bootLoad = null;
  // The first call, with the deps, makes the boot's load plan; later calls return that plan.
  const bootLoad = (deps) => (_bootLoad ??= bootLoadPlan(bootLoadPick ? bootSnap() : null, deps));

  function worldQuickSave(saveName = QUICK_SAVE_NAME, { quiet = false, sink = null } = {}) {
    if (shared.ohAbyss?.entering) { if (!quiet) shared.townTalk.say('You cannot save now.'); return false; }
    if (shared._traveling) { if (!quiet) shared.townTalk.say('You cannot save now.'); return false; }
    if (shared.poiTest?.active()) { if (!quiet) shared.townTalk.say(t('poi.test.noSave', 'You cannot save while testing a POI.')); return false; }
    if (shared.naval?.saveRefused?.()) { if (!quiet) shared.townTalk.say('You cannot save now.'); return false; }
    if (shared.modes?.cardTableLive?.()) { if (!quiet) shared.townTalk.say('You cannot save with chips on the table.'); return false; }
    if (shared.modes?.iliacStaked?.()) { if (!quiet) shared.townTalk.say('You cannot save with a card staked on the table.'); return false; }
    if (shared.modes?.gambitStaked?.()) { if (!quiet) shared.townTalk.say(stakedSaveRefusal()); return false; }
    const pf = shared.walkMode && shared.playerSpawned ? shared.player.pos : shared.cam.pos;
    const wc = shared.state.worldCoords(pf);
    const interior = shared.modes?.interiorSaveData?.() ?? null;
    if (interior) { const at = playerTravelPixel(); stampLayout(interior, layoutStampOfPixel(at.x, at.y)); }
    const interiorPools = shared.modes?.interiorPoolSnapshot?.((pos) => shared.state.worldCoords(pos)) ?? null;
    if (interior && interiorPools) {
      const shed = (rows) => (rows ?? []).map((r) => ({ ...r, y: shared.groundFrameNative(r.nativeX, r.nativeZ, r.y - shared.state.compensation[1]) }));
      interior.foes = shed(interiorPools.foes);
      interior.guards = shed(interiorPools.guards);
    }
    const wp = shared.modes?.weaponPose?.() ?? null;
    const snap = snapshotPlayer(playerEntity, {
      interior,
      classicMinutes: Math.floor(shared.playerTicker.ownMinutes),
      readiedSpellIndex: shared.magic.readiedIndex(),
      ...composeSessionState({ questBridge: shared.questBridge, talk: { mill: shared.rumorMill, tree: shared.topicTree, session: shared.npcSession }, spawnLedger: shared._spawnLedger }),
      pose: { yaw: shared.cam.yaw, pitch: shared.cam.pitch, crouching: !!shared.player.crouching, ...mergeWeaponPose(wp, weaponPoseOf(shared.weaponRig.playerWeapon)), camera: mwViewSaveCamera(), transport: shared.player.transportMode, fall: shared.player.fallSnapshot() },
      modData: { [shared.HCC_VENDOR]: shared.hccRuntime.getSaveData(), ...modSaveRecords() },
      locationKey: 'world',
      world: {
        pixel: playerTravelPixel(), nativeX: wc.x, nativeZ: wc.z, y: shared.groundFrameHeight(pf[1] - shared.state.compensation[1], pf[0], pf[2]),
        piles: shared.droppedLoot.snapshotWorld((pos) => shared.state.worldCoords(pos)).map((sp) => ({ ...sp, y: shared.groundFrameNative(sp.nativeX, sp.nativeZ, sp.y - shared.state.compensation[1]) })),
        droppedTorches: shared.droppedTorches.snapshot((pos) => { const wc = shared.state.worldCoords(pos); return [wc.x, shared.groundFrameHeight(pos[1] - shared.state.compensation[1], pos[0], pos[2]), wc.z]; }),
        camps: shared.camps.snapshot(shared.campToRecord),
        foes: shared.exteriorFoes.snapshotWorld((pos) => shared.state.worldCoords(pos)).map((sf) => ({ ...sf, y: shared.groundFrameNative(sf.nativeX, sf.nativeZ, sf.y - shared.state.compensation[1]) })),
        guards: shared.cityGuards.snapshotWorld((pos) => shared.state.worldCoords(pos)).map((sg) => ({ ...sg, y: shared.groundFrameNative(sg.nativeX, sg.nativeZ, sg.y - shared.state.compensation[1]) })),
      },
    });
    const into = sink ?? realmSaveSink();
    if (into) { const said = into(snap); if (!quiet) sayRealmSave(said, (t) => shared.townTalk.say(t)); return true; }
    const r = saveSlot(playerEntity.name, saveName, snap);
    if (r.ok && !quiet) requestScreenshot(r.key);
    if (!r.ok || !quiet) shared.townTalk.say(r.ok ? localizedText('gameSaved', 'Game saved.') : 'Save failed (storage full or disabled).');
    return r.ok;
  }
  const _reviveQuestBehaviour = (data) => reviveQuestBehaviour(shared.questBridge?.machine ?? null, data);

  function pickedSaveSnap({ key = null, mostRecent = false } = {}) {
    return key != null ? loadSlot(key) : mostRecent ? (mostRecentRestorable()?.snap ?? null) : null;
  }

  async function worldQuickLoad({ mostRecent = false, key = null, snap: picked = null } = {}) {
    if (shared._loading) return;
    if (worldMoveBusy()) { shared.townTalk.say('Loading is disabled while traveling.'); return; }
    if (shared.online) { shared.townTalk.say('Loading is disabled during online play.'); return; }
    shared.travelOptions?.clearTravelDestination();
    if (worldTimeScale() !== 1) resetTimeScale();
    shared.crewAshore.clear();
    shared.clearSworn();
    shared._loading = true;
    try {
      const snap = picked ?? (key != null || mostRecent ? pickedSaveSnap({ key, mostRecent })
        : quickLoadSlot(playerEntity.name, undefined, playerEntity.characterId ?? null));
      if (!snap) { shared.townTalk.say('No saved game.'); return; }
      closeWindowsForLoad();
      if (!shared.spellsByIndex) await shared._magicRegistries.catch(() => null);
      await shared.townTalk.ensureLoaded?.().catch(() => null);
      shared.modes?.abortTransition?.();
      await shared.modes?.transitionSettled?.();
      closeWindowsForLoad();
      if (shared.csaRuntime) shared.csaCall(() => shared.csaRuntime.OnStartLoad());
      const extras = restorePlayer(playerEntity, snap, shared.spellsByIndex);
      if (!extras) { shared.townTalk.say('Save version mismatch.'); return; }
      autoBuildArms(playerEntity);
      shared.hccRuntime.handleStartLoad();
      shared.wagonRiders?.clear();
      shared.upkeep.reset();
      shared.cameraRecoiler.reset();
      resetVitalsDetector();
      shared.player.stopAutorun();
      shared.climbFeel.reset();
      dwLoadStarted();
      if (shared.dwPlayer) { shared.dwPlayer.saveLoad(shared.player); dwFlushStateChange(); }
      shared.arrestFlow.abandon();
      shared.closeDeathScreen();
      shared._deathWasOnline = null;
      if ((shared.modes?.mode ?? 'exterior') !== 'exterior') shared.modes?.forceExitToExterior({ cacheScene: false, load: true });
      setWorldMinutes(extras.classicMinutes ?? worldMinutes());
      shared.magic.setReadiedByIndex(extras.readiedSpellIndex ?? null, shared.spellsByIndex);
      if (restoreSessionState(extras, { questBridge: shared.questBridge, talk: { mill: shared.rumorMill, tree: shared.topicTree, session: shared.npcSession }, entity: playerEntity, spawnLedger: shared._spawnLedger })) shared._questStarted = true;
      await shared.applyLayoutPins(extras);
      let csaElsewhere = false;
      const landing = savedLanding(extras, { startCell: { x: getInt('Startup', 'StartCellX'), y: getInt('Startup', 'StartCellY') } });
      if (landing) {
        shared._wodInside = false;
        await _teleportToPixel(landing.pixel.x, landing.pixel.y, null, { modEvent: 'load' });
        { const s = shared.walkMode && shared.playerSpawned; const f = s ? shared.player.pos : shared.cam.pos; shared.wodOnLoad([f[0], f[1] + (s ? shared.player.height / 2 : 0), f[2]]); }
        shared.townTalk.say(LANDING_TEXT[landing.why]);
        csaElsewhere = true;
        standSavedOuterCamps(extras);
        const carried = packSavedFires(extras.world?.camps);
        if (carried.length) (playerEntity.items ??= []).push(...carried);
      } else if (extras.locationKey === 'world' && extras.world?.pixel) {
        const w = extras.world;
        shared._wodInside = !!extras.interior;
        await _teleportToPixel(w.pixel.x, w.pixel.y, null, { modEvent: 'load' });
        const was = shared.scaleOf(extras.terrainScale);
        const today = was === STREAMING_TERRAIN_SCALE && !shared.landform;
        const restandNative = (nx, nz, y) => { const [x, z] = shared.state.localFromWorld(nx, nz); return shared.restandHeight(y, x, z, was); };
        const restandRows = (rows) => (today || !Array.isArray(rows) ? rows : rows.map((r) => (r ? { ...r, y: restandNative(r.nativeX, r.nativeZ, r.y) } : r)));
        const restandAt = (key) => (rows) => (today || !Array.isArray(rows) ? rows : rows.map((r) => { const p = r?.[key]; return Array.isArray(p) ? { ...r, [key]: [p[0], restandNative(p[0], p[2], p[1]), p[2]] } : r; }));
        if (extras.interior) { extras.interior.foes = restandRows(extras.interior.foes); extras.interior.guards = restandRows(extras.interior.guards); }
        const [lx, lz] = shared.state.localFromWorld(w.nativeX, w.nativeZ);
        const ly = shared.restandHeight(w.y ?? 2, lx, lz, was) + shared.state.compensation[1];
        if (extras.interior?.caravanRoom) extras.interior = { ...extras.interior, caravanAt: parkedCaravanAt(extras.modData?.[shared.HCC_VENDOR] ?? null) };
        const inside = extras.interior
          ? await (shared.modes?.restoreInterior?.(extras.interior, [lx, ly, lz], {
            fromNative: (nx, nz) => shared.state.localFromWorld(nx, nz), yOffset: shared.state.compensation[1],
            sailingBoat: savedCabinBoat(extras.interior.sailingCabin, extras.modData?.[COME_SAIL_AWAY_VENDOR]),
          }) ?? false)
          : false;
        if (!inside) shared._wodInside = false;
        if (inside) {
          shared.playerSpawned = true;
          shared.cam.pos = [lx, ly, lz];
        } else if (extras.interior) {
          const out = shared.caravanDoorLanding(extras.interior);
          if (!out) shared.townTalk.say('Building has no exterior doors. Repositioning player.');
          else {
            shared.townTalk.say(CARAVAN_TEXT.outside);
            const [x, y, z] = out.position;
            if (shared.walkMode) { shared.player.spawn(x, y, z); shared.playerSpawned = true; }
            shared.cam.pos = [x, y + (shared.walkMode ? 0 : 40), z];
          }
        } else {
          if (shared.walkMode) { shared.player.spawn(lx, ly, lz); shared.playerSpawned = true; }
          shared.cam.pos = [lx, ly + (shared.walkMode ? 0 : 40), lz];
        }
        if (shared.walkMode && (inside || !extras.interior)) shared.player.restoreFall(extras.pose?.fall);
        shared.droppedLoot.restoreWorld(restandRows(w.piles), (nx, nz) => shared.state.localFromWorld(nx, nz), shared.state.compensation[1]);
        shared.droppedTorches.restore(restandAt('position')(w.droppedTorches), (p) => { const [lx, lz] = shared.state.localFromWorld(p[0], p[2]); return [lx, p[1] + shared.state.compensation[1], lz]; });
        shared.bountyFarms?.destroyAll();
        shared.quays?.destroyAll();
        shared.lefay?.destroyAll();
        shared.poiHost?.destroyAll();
        shared.merchantYards?.destroyAll();
        shared.portHost?.destroyAll(); closeShipyard();
        portFrame();
        shared.wardenShows?.destroyAll();
        shared.camps.dropOwn();
        shared.camps.restore(restandAt('pos')(w.camps), shared.campFromNatives);
        shared.exteriorFoes.restoreWorld(restandRows(w.foes), (nx, nz) => shared.state.localFromWorld(nx, nz), shared.state.compensation[1],
          { reviveQuestBehaviour: _reviveQuestBehaviour });
        shared.cityGuards.restoreWorld(restandRows(w.guards), (nx, nz) => shared.state.localFromWorld(nx, nz), shared.state.compensation[1]);
        { const s = shared.walkMode && shared.playerSpawned; const f = s ? shared.player.pos : shared.cam.pos; shared.wodOnLoad([f[0], f[1] + (s ? shared.player.height / 2 : 0), f[2]]); }
      } else if (String(extras.locationKey ?? '').startsWith('dungeon:')) {
        const standOuterCamps = () => standSavedOuterCamps(extras);
        const carrySavedFires = () => {
          const items = packSavedFires(extras.world?.camps);
          if (!items.length) return;
          (playerEntity.items ??= []).push(...items);
          shared.townTalk.say(CAMP_TEXT.carriedOut);
        };
        const pixel = extras.dungeon?.pixel ?? dungeonPixelFor(extras.locationKey, shared.locationIndex.values(), (mt) => longitudeLatitudeToMapPixel(mt.longitude, mt.latitude));
        csaElsewhere = !pixel;
        if (!pixel) shared.townTalk.say('(the dungeon you saved in couldn’t be found. Your character is restored, so travel there yourself)');
        else if (shared.onlineOn && !(pixel.x === getInt('Startup', 'StartCellX') && pixel.y === getInt('Startup', 'StartCellY'))) {
          const ohSaved = extras.modData?.[OCEAN_HOLES_VENDOR];
          const from = ohSaved?.Active && Number.isFinite(ohSaved.PitMapX) && Number.isFinite(ohSaved.PitMapY) ? { x: ohSaved.PitMapX, y: ohSaved.PitMapY } : pixel;
          const wake = inEther(from.x, from.y) ? { kind: 'dungeon', mapPixel: { x: from.x, y: from.y } } : undergroundWakeSpot(shared.maps.getRegion(shared.maps.getRegionIndexAt(from.x, from.y))?.mapTable ?? [], from);
          await _teleportToPixel(wake.mapPixel.x, wake.mapPixel.y, null, { modEvent: 'load', reposition: REPOSITION.RandomStartMarker });
          { const s = shared.walkMode && shared.playerSpawned; const f = s ? shared.player.pos : shared.cam.pos; shared.wodOnLoad([f[0], f[1] + (s ? shared.player.height / 2 : 0), f[2]]); }
          shared.townTalk.say(undergroundWakeText(wake.kind));
          csaElsewhere = true;
          standOuterCamps(); carrySavedFires();
        } else {
          shared._wodInside = true;
          await _teleportToPixel(pixel.x, pixel.y, null, { modEvent: 'load' });
          const entered = await (shared.modes?.startInDungeon?.({ locationKey: extras.locationKey, fromLoad: true, recorded: extras.dungeon ?? {} }) ?? false);
          if (entered) { shared.playerSpawned = true; await shared.modes?.restoreDungeonSave?.(extras); }
          else { shared._wodInside = false; shared.townTalk.say('(the dungeon could not be entered. Your character is restored at its door)'); }
          if (!entered) csaElsewhere = true;
          if (!entered) carrySavedFires();
          standOuterCamps();
        }
        if (!pixel) { standOuterCamps(); carrySavedFires(); }
      } else if (extras.locationKey && extras.locationKey !== 'world') {
        shared.townTalk.say('(saved somewhere else. Your character is restored, so travel there yourself)');
        csaElsewhere = true;
      }
      shared.ohAbyss?.onRespawnerComplete();
      if (shared.csaRuntime) await shared.csa.preload();
      if (csaElsewhere) extras.modData = shared.csaHelmLeft(extras.modData);
      const hccRecord = extras.modData?.[shared.HCC_VENDOR] ?? null;
      if (hccRecord) shared.hccRuntime.restoreSaveData(hccRecord, { elsewhere: csaElsewhere });
      restoreModSaveRecords(extras.modData, shared.csaModLoadFailed);
      if (csaElsewhere && shared.csaRuntime && extras.modData?.[COME_SAIL_AWAY_VENDOR]?.TemporaryShip) shared.csaCall(() => shared.csaRuntime.ReturnTemporaryShip());
      applyPose(extras.pose);
      shared._lastEncMinutes = Math.floor(shared.playerTicker.ownMinutes);
      surfacePlayer();
      if (shared.csaOn() && shared.csaRuntime && !shared.csaRuntime.state.TemporaryShip) {
        const oldBankType = SHIP_INTERIOR_MAP_IDS.indexOf(shared._questLoc()?.mapTableData?.mapId);
        if (shared.modes?.mode === 'interior' && oldBankType >= 0 && oldBankType === playerEntity.ownedShip && !shared.modes?.roomIdentity?.()?.privateRoom) {
          // The restored room is live, not in the cache; leave it only when the launched cabin has no cached scene.
          const prior = readBankCabinLink(playerEntity.boatCabinLink);
          const choices = bankCabinCandidates(oldBankType, shared.csaRuntime.AllBoats, shared.legacyCabinItems());
          const choice = prior?.type === oldBankType ? prior : choices.length === 1 ? choices[0] : null;
          const launched = choice && shared.csaRuntime.AllBoats.some((b) => b.uid === choice.uid && b.hull === choice.hull && !b.inside && b.MapPixel);
          if (launched && !playerEntity.sceneCache?.scenes.has(cabinSceneName(choice.uid))) {
            shared.modes?.forceExitToExterior();
            await enterLinkedBankCabin({ loading: true });
          }
        } else if (shared.modes?.mode === 'exterior') shared.ensureBankCabinLink();
      }
      shared.townTalk.say(localizedText('gameLoaded', 'Game loaded.'));
      slotLoaded(playerEntity.characterId ?? null);
      betterAmbience.onLoad();
      reportModCompatibilityIssues({ showText: (lines) => messageBox(lines) });
      dwLoadFinished(performance.now() / 1000);
      if (shared.dwPlayer) { shared.dwPlayer.saveLoad(shared.player); dwFlushStateChange(); }
      shared.oceanHoles?.saveLoaded();
      if (shared.csaRuntime) shared.csaCall(() => shared.csaRuntime.OnLoad());
    } finally {
      shared._loading = false;
    }
  }
  function overworldLoadReset() {
    shared.reachEvents.reset(); shared.sealHost.clearSafe();
    shared.tvRaid.chase.clear(); shared.tvRaid.spent.clear(); shared.tvRaid.list = []; shared.tvRaid.at = -Infinity; shared.tvRaid.peer.clear(); shared.tvRaid.spentAt.length = 0;
    shared.csaJourneyHelm.held.clear(); shared.csaJourneyHelm.row = false; shared.tvSea.means = null; shared.tvSea.phase = null; shared.tvSea.boat = null; shared.tvSea.wasLive = shared.csaJourneyHelm.live = false;
    shared.tvPlates = { at: null, list: [] };
    shared.tvFar = { at: null, near: -1, list: [] };
    shared.tvDng = { at: null, dg: -1, list: [] };
    shared.tvFind = { at: null, dg: -1, n: -1, list: [] };
    shared.tvBandSeen = { at: null, life: -1, list: [] }; shared._bandChase.clear(); shared._bandSpent.clear(); shared._bandMake.clear(); shared._bandPos.clear(); shared._bandPeer.clear(); shared._bandSpentAt.length = 0; shared.wildBands.prune(() => false);
    shared.travelView?.exit('load', true);
    shared._owSay.sp.clear(); shared._owSay.dg.clear();
    shared.tvDngModels = { at: null, dg: -1, n: -1, list: [] }; for (const e of shared._tvDngModel.values()) e.hold.release(); shared._tvDngModel.clear();
    shared._announcedSpawnPixels.clear();
  }
  function applyPose(pose) {
    overworldLoadReset();
    if (!pose) return;
    if (Number.isFinite(pose.yaw)) shared.cam.yaw = wrapAngle(pose.yaw);
    shared.cam.pitch = pose.pitch ?? shared.cam.pitch;
    if (pose.crouching != null) shared.player.crouching = !!pose.crouching;
    applyWeaponPose(shared.weaponRig.playerWeapon, pose);
    shared.modes?.applyWeaponPose?.(pose);
    if (pose.transport != null) shared.setTransportModeHere(pose.transport);
    mwViewLoadPose(pose.camera, (shared.modes?.mode ?? 'exterior') !== 'exterior');
  }
  async function classicLoadBoot() {
    const saveGames = takePendingClassicSave();
    if (!saveGames) return false;
    if (!shared.spellsByIndex) shared.spellsByIndex = await loadSpellIndex(fetchBytes);
    await shared.townTalk.ensureFactions?.();
    let bundle;
    try {
      bundle = classicSaveToSnapshot(saveGames, {
        spellsByIndex: shared.spellsByIndex, online: isOnlinePage(),
        factionStore: shared.townTalk.factionDict ? { dict: shared.townTalk.factionDict } : null,
        resolveLocation: (regionIndex, locationIndex) => {
          const region = shared.maps.getRegion(regionIndex);
          const row = region?.mapTable?.[locationIndex];
          if (!row) return null;
          return {
            mapId: row.mapId,
            regionName: shared.maps.getRegionName(regionIndex) ?? '',
            locationName: region.mapNames?.[locationIndex] ?? '',
          };
        },
        regionLocationCounts: Array.from({ length: 62 }, (_, i) => shared.maps.getRegion(i)?.locationCount ?? 0),
      });
    } catch (e) {
      console.warn('[world] classic save import failed:', e?.message ?? e);
      shared.townTalk.say('Could not import the classic save.');
      return false;
    }
    const extras = restorePlayer(playerEntity, bundle.snap, shared.spellsByIndex);
    if (!extras) return false;
    autoBuildArms(playerEntity);
    assignShipToPlayer(playerEntity, playerEntity.ownedShip, { addPermanentScene: shared.shipPermanentScenes });
    setWorldMinutes(extras.classicMinutes ?? worldMinutes());
    if (shared.questBridge?.machine?.globalVars) {
      for (const [i, v] of bundle.globalVars) shared.questBridge.machine.globalVars.set(i, v);
    }
    importClimateWeathers(bundle.climateWeathers);
    for (const rumor of saveGames.rumorFile?.rumors ?? []) {
      shared.rumorMill.importClassicRumor(rumor, (bytes) => readRscTokens(bytes, 0, RSC.EndOfRecord));
    }
    if (bundle.position) {
      const px = worldCoordToMapPixel(bundle.position.worldX, bundle.position.worldZ);
      await _teleportToPixel(px.x, px.y, null, { modEvent: 'load' });
      const [lx, lz] = shared.state.localFromWorld(bundle.position.worldX, bundle.position.worldZ);
      const raw = [lx, 2 + shared.state.compensation[1], lz];
      const ly = shared.walkMode ? floorLanding(shared.collider, raw)[1] : raw[1];
      if (shared.walkMode) { shared.player.spawn(lx, ly, lz); shared.playerSpawned = true; }
      shared.cam.pos = [lx, ly + (shared.walkMode ? 0 : 40), lz];
      shared.wodOnLoad(shared.walkMode ? [lx, ly + shared.player.height / 2, lz] : shared.cam.pos);
    }
    applyPose(bundle.snap.pose);
    shared._lastEncMinutes = Math.floor(shared.playerTicker.ownMinutes);
    surfacePlayer();
    shared.townTalk.say(`Loaded classic save: ${bundle.saveName || bundle.snap.name}.`);
    return true;
  }

  const exitAutosave = () => {
    if (!shared.playerSpawned || shared.seatOut()) return;
    if (shared.poiTest?.active()) shared.poiEditorLeave?.('back');
    if (!shared.online) return void offlineExitSave(playerEntity, shared.townTalk.overlay instanceof DeathScreen || !!shared.modes?.deathUp?.() || successionOpen(), (n, o) => (shared.modes ? shared.modes?.quickSaveNow(n, o) : worldQuickSave(n, o)));
    try { shared.duelLeaveNow(); } catch { }
    if (realmSession) return;
    const save = (saveName) => (shared.modes ? shared.modes?.quickSaveNow(saveName) : worldQuickSave(saveName));
    for (const saveName of exitAutosaveNames(playerEntity, { deathUp: shared.townTalk.overlay instanceof DeathScreen || !!shared.modes?.deathUp?.() || successionOpen() })) save(saveName);
  };

  const checkpointGateOpen = () => checkpointAllowed({ online: !!shared.online, spawned: shared.playerSpawned, seatOut: shared.seatOut(), duel: !!shared.duelMgr?.duel, walkWaiting: ownWalkWaiting(playerEntity), realm: !!realmSession });
  const onlineCheckpoint = ({ sink = null } = {}) => {
    if (!checkpointGateOpen()) return false;
    shared._checkpointAt = performance.now();
    try {
      if (realmSession) return realmCheckpoint({ sink });
      const names = exitAutosaveNames(playerEntity, { deathUp: shared.townTalk.overlay instanceof DeathScreen || !!shared.modes?.deathUp?.() || successionOpen() });
      for (const saveName of names) {
        if (shared.modes) shared.modes?.quickSaveNow(saveName, { quiet: true });
        else worldQuickSave(saveName, { quiet: true });
      }
      return names.length > 0;
    } catch (e) { console.error('[online] checkpoint failed', e); return false; }
  };
  function realmCheckpoint({ sink = null } = {}) {
    if (!realmSession || realmSession.lost) return false;
    if (shared.townTalk.overlay instanceof DeathScreen || shared.modes?.deathUp?.() || !(playerEntity.health > 0)) return false;
    stampItemIds(playerEntity);
    const opts = sink ? { quiet: true, sink } : { quiet: true };
    return !!(shared.modes ? shared.modes?.quickSaveNow(QUICK_SAVE_NAME, opts) : worldQuickSave(QUICK_SAVE_NAME, opts));
  }
  const onlineCheckpointLanded = () => {
    const into = realmSession ? realmSaveSink() : null;
    if (!into) return onlineCheckpoint();
    let put = null;
    if (!onlineCheckpoint({ sink: (snap) => { put = into(snap); return put; } })) return false;
    return put ?? false;
  };

  async function realmBirth() {
    const io = realmIoNow();
    if (!io) { realmLost('signed-out'); return; }
    for (let i = 0; !shared.playerSpawned && i < 240; i++) await new Promise((r) => { setTimeout(r, 250); });
    const made = await realmCreateLegacy(io);
    if (!made.ok) { realmLost(made.error); return; }
    const put = await realmFirstSave(io, made);
    if (!put.ok) { realmLost(put.error); return; }
    releaseUnloadGuard();
    location.replace(`${location.pathname}${realmBootSearch(location.search, made.data.id, BOOT_DOOR_KEYS)}`);
  }
  async function realmCreateLegacy(io) {
    await legacyRealmLine?.flush();
    const fam = shared.legacyHost?.family ?? null;
    const me = shared.legacyHost?.current() ?? null;
    const born = fam && me && legacyOn() ? { lineage: fam.id, person: me.id } : null;
    for (let i = 0; born && legacyRealmLine?.unwrittenOf(fam.id) && !legacyRealmLine.refusalOf(fam.id) && i < 2; i++) {
      await new Promise((r) => { setTimeout(r, 2000 * (i + 1)); });
      await legacyRealmLine.flush();
    }
    const unwritten = born ? legacyRealmLine?.unwrittenOf(fam.id) ?? null : null;
    if (unwritten) return { ok: false, error: unwritten };
    let made = null;
    for (let i = 0; i < 3; i++) {
      made = await realmCreate(io, playerEntity.name || 'Traveller', realmSummaryOf(playerEntity), born);
      if (made.ok || !['offline', 'server'].includes(made.error)) break;
      await new Promise((r) => { setTimeout(r, 2000 * (i + 1)); });
    }
    if (!made?.ok) return made ?? { ok: false, error: 'server' };
    const was = playerEntity.characterId;
    playerEntity.characterId = made.data.id;
    shared.legacyHost?.rebind(was, made.data.id);
    await legacyRealmLine?.flush();
    return made;
  }
  async function realmFirstSave(io, made) {
    let text = null;
    const sink = (snap) => { text = JSON.stringify(snap); };
    if (shared.modes) shared.modes?.quickSaveNow(QUICK_SAVE_NAME, { quiet: true, sink });
    else worldQuickSave(QUICK_SAVE_NAME, { quiet: true, sink });
    if (!text) return { ok: false, error: 'server' };
    return realmPut(io, made.data.id, { lease: made.data.lease, seq: 1, summary: realmSummaryOf(playerEntity) }, text, { gzip: made.data.gzip === true });
  }
  return {
    bootLoad, bootLoadPick, bootSnap, checkpointGateOpen, classicLoadBoot, exitAutosave, onlineCheckpoint,
    onlineCheckpointLanded, realmBirth, realmCreateLegacy, realmFirstSave, worldQuickLoad, worldQuickSave,
  };
}
