import { ActionTextBox } from '../../ui/actionText.js';
import { allocateHouseToPlayer, BANK_REGION_COUNT, createHouses } from '../../trade/banking.js';
import { applyDeathPenalty, deathPenaltyText, statedDeathLoss, stateDeathLoss } from '../../player/deathPenalty.js';
import { BOOT_DOOR_KEYS, isOnlinePage } from '../../platform/onlineLane.js';
import { builtDungeonSize } from '../../world/smallerDungeons.js';
import { CONTAINER_IMAGES } from '../../ui/targetIconPanel.js';
import { COURT_TEXT } from '../../world/gateArena.js';
import { createKinOverlay, createSuccessionOverlay, successionOpen } from '../../ui/legacyDoor.js';
import { createSceneCache, graftPermanentScene, interiorSceneName } from '../../world/sceneCache.js';
import { CRIMES, setCrimeCommitted } from '../../justice/court.js';
import { dateFromClassicMinutes, monthNames } from '../../world/gameDate.js';
import { DeathScreen } from '../../ui/deathScreen.js';
import { discoverBuilding } from '../../maps/discovery.js';
import { EG_TEXT } from '../../net/eliteGates/egLaw.js';
import { endPlayerFights } from '../../combat/harmMark.js';
import { endRunToTitleMenu, exitToTitleMenu } from '../../scenes/shared.js';
import { enumerateSaves, loadSlot } from '../../saves/saveSlots.js';
import { etherRisePort } from '../../world/wild/etherWild.js';
import { floorLanding } from '../../player/enterExit.js';
import { forgetLastSlew, revenantTakes } from '../../revenants/revenant.js';
import { getInt } from '../../platform/settings.js';
import { HOME_RETRY_MS, homeSceneName } from '../../homes/onlineHomes.js';
import { houseWord } from './houseName.js';
import { identityLine } from '../../ui/familyPages.js';
import { inEther } from '../../world/ethericSea.js';
import { LEGACY_TEXT, REMAINS_FLAT } from './legacyHost.js';
import { liveStat } from '../../characters/statMods.js';
import { longitudeLatitudeToMapPixel, REGION_NAMES } from '../../formats/mapsFile.js';
import { madeRuleHere } from '../../characters/madeLevel.js';
import {
  nearestSafeLocation, nearestSafeLocationAnywhere, respawnFlavorText, reviveForPlay,
} from '../../player/deathRespawn.js';
import { newestSaveOf } from './store.js';
import { playerEntity, surfacePlayer } from '../../characters/playerEntity.js';
import { randomCemeteryLocationIndex } from '../../afflictions/infection.js';
import { REALM_EXIT_WAIT_MS, realmBootSearch, realmFetch, realmUnions } from '../../saves/realmSaves.js';
import { releaseUnloadGuard } from '../../platform/unloadGuard.js';
import { REPOSITION } from '../naval/ship.js';
import { RESURRECT_HEALTH_PCT, RESURRECT_TEXT } from '../../magic/resurrect.js';
import { setLootMarksLive } from '../../items/lootLines.js';
import { SKILLS, skillValue } from '../../characters/skills.js';
import { stampLayout } from '../../world/layoutPins.js';
import { STREAMING_TERRAIN_SCALE } from '../../world/terrainSampler.js';
import { BUILDING_TYPES as TALK_BUILDING_TYPES } from '../../world/buildingNames.js';
import { weatherRespawn } from '../../weather/weatherSim.js';
import { wildDeath, wildDeathKill } from '../../world/wildZone.js';

/** @param {any} shared */
export function createLegacyWorld(shared) {
  const {
    _questRegionIndex, _teleportToPixel, _townOfMapId, applyWeather, climateAt, egLandAt, etherSea, fieldXZ, homesApi,
    landBeforeGate, LEGACY_REMAINS_NEAR, legacyOnlineHomesRead, legacyRealmLine, locationIndex, maps,
    ohTeleportToWorld, playerTravelPixel, realmCreateLegacy, realmFirstSave, realmIoNow, realmLost, realmSession,
    renderer, shownWeather, weatherOverride, worldMoveBusy,
  } = shared;
  const LEGACY_REMAINS_NEAR_DUNGEON = 6;

  const legacyReady = new Promise((res) => { shared._legacyMade = res; });

  async function _respawnAtSite(loc) {
    shared.modes?.forceExitToExterior();
    const px = longitudeLatitudeToMapPixel(loc.mapTableData.longitude, loc.mapTableData.latitude);
    await _teleportToPixel(px.x, px.y);
    if (!weatherOverride && weatherRespawn(Math.floor(shared.playerTicker.classicMinutes), maps.getClimateIndex(px.x, px.y), Math.random, fieldXZ(), climateAt)) {
      applyWeather(shownWeather());
    }
    const entered = await shared.modes?.startInDungeon();
    if (!entered) console.warn('[quest] respawn: no dungeon entrance at site - exterior landing (the C# fallback arm)');
    shared.ohAbyss?.onRespawnerComplete();
    surfacePlayer();
  }

  function transferToCemeteryArm() {
    { const p = playerTravelPixel(); if (etherSea && inEther(p.x, p.y)) { console.warn('[infection] past the Veil - no cemetery a crossing away; the transfer is skipped'); return; } }
    const mapTable = maps.getRegion(_questRegionIndex())?.mapTable ?? [];
    const idx = randomCemeteryLocationIndex(mapTable);
    if (idx == null) {
      console.warn('[infection] no cemetery in this region - the transfer is skipped (DFU throws here)');
      return;
    }
    const pos = longitudeLatitudeToMapPixel(mapTable[idx].longitude, mapTable[idx].latitude);
    shared.modes?.forceExitToExterior();
    Promise.resolve().then(async () => {
      shared._wodInside = true;
      await _teleportToPixel(pos.x, pos.y);
      shared._lastEncMinutes = Math.floor(shared.playerTicker.ownMinutes);
      const entered = await (shared.modes?.startInDungeon?.() ?? false);
      if (!entered) shared._wodInside = false;
      if (!entered) console.warn('[infection] the cemetery has no dungeon to wake in - the vampire wakes at its exterior');
    });
  }
  function cancelRestArm() {
    const w = shared.townTalk.overlay;
    if (w?.isRestWindow) w.dispose?.();
  }

  function resurrectInPlace(rez) {
    if (shared._respawning) return;
    const spared = wildDeathKill() ? 0 : statedDeathLoss() ?? 0;
    shared.wildGhostEnd();
    shared._rezSeen = null;
    shared._sdFallen.rise(shared.modes?.sdRealmSlot?.());
    shared._deadMark = null; shared._partyComposedAt = -Infinity;
    reviveForPlay(playerEntity, { force: true });
    forgetLastSlew();
    playerEntity.health = Math.max(1, Math.round((playerEntity.maxHealth ?? playerEntity.health) * RESURRECT_HEALTH_PCT / 100));
    shared.player.stopAutorun();
    shared._deathWasOnline = null;
    stateDeathLoss(null);
    closeDeathScreen();
    shared.townTalk.say(RESURRECT_TEXT.raised(rez.name));
    if (spared > 0) shared.townTalk.say(RESURRECT_TEXT.spared(spared));
  }

  function closeDeathScreen() {
    const ov = shared.townTalk.overlay;
    if (ov instanceof DeathScreen) { ov.restoreView(); shared.townTalk.closeOverlay(ov); }
    else shared.modes?.clearDeath?.();
  }

  function legacyDeathReset() {
    const out = shared.legacyHost?.deathOutcome() ?? { kind: 'none' };
    if (out.kind === 'rise') {
      if (!(shared._deathWasOnline ?? shared._onlineWorldSession())) forgetLastSlew();
      respawnOnlinePlayer();
      shared.townTalk.say(out.line);
      return true;
    }
    if (out.kind !== 'fall') return false;
    openLegacySuccession(out);
    return true;
  }
  function openLegacySuccession(out, past = null) {
    if (successionOpen()) return;
    if ((shared.modes?.mode ?? 'exterior') !== 'exterior') shared.modes?.forceExitToExterior();
    const fam = shared.legacyHost?.family;
    const fallen = out.fallen;
    const choices = out.choices.map((p) => ({
      key: `p${p.id}`, who: p, name: legacyFullName(p),
      sub: `${legacyIdentity(p)} - ${p.characterId ? 'they pick up where they left off' : 'sets out from the family seat'}`,
      act: `Carry on as ${p.given}`,
    }));
    if (out.newborn) choices.push({ key: 'newborn', who: null, name: `A child of ${fallen.given}`, sub: `Born of the blood and raised in ${legacyHouse(fam)}, a new heir comes of age`, act: 'Raise an heir' });
    const retired = !fallen.died;
    const final = retired ? `${legacyFullName(fallen)} retires to keep the house` : fallen.died.cause === 'years' ? `${legacyFullName(fallen)} has died of their years` : `${legacyFullName(fallen)} has fallen`;
    const lines = [
      ...(past && past.id !== fallen.id ? [past.died ? LEGACY_TEXT.deadLoad(legacyFullName(past)) : LEGACY_TEXT.retiredLoad(legacyFullName(past))] : []),
      retired ? `${fallen.given} has carried the house long enough. The mantle passes on.` : out.newborn ? LEGACY_TEXT.heir : choices.length ? LEGACY_TEXT.kin : LEGACY_TEXT.noHeir,
      choices.length ? `${legacyHouse(fam, 'The')} goes on. Who carries the line now?` : `There is no one left of ${legacyHouse(fam)}. The line ends here, and its tree is kept in the Hall of Ancestors.`];
    if (out.estate > 0 && choices.length) lines.push(`The estate of ${out.estate} gold passes to whoever takes up the name.`);
    const ov = createSuccessionOverlay({
      title: final, lines, choices, faces: shared.legacyFaces,
      choose: (key) => {
        const ok = key === 'newborn' ? shared.legacyHost?.succeed({ newborn: true }) : shared.legacyHost?.succeed({ personId: Number(key.slice(1)) });
        return ok ? { ok: true } : { ok: false, why: 'That one cannot take up the name now.' };
      },
      end: { label: choices.length ? 'Let the line end' : 'The line ends', ask: 'Yes, let the line end', act: () => { shared.legacyHost?.endLine(); releaseUnloadGuard(); endRunToTitleMenu(renderer); } },
    });
    if (ov) shared.townTalk.showOverlay(ov);
    else { shared.legacyHost?.endLine(); endRunToTitleMenu(renderer); }
  }
  function legacyPassMantle() {
    const out = shared.legacyHost?.passMantle() ?? null;
    if (!out?.ok) return { ok: false, why: out?.why ?? 'Not now.' };
    openLegacySuccession(out.outcome);
    return { ok: true };
  }
  function openLegacyDeadLoad({ past, fall }) {
    if (successionOpen()) return;
    if (fall) { openLegacySuccession(fall, past); return; }
    const fam = shared.legacyHost?.family;
    const cur = fam ? fam.people.find((p) => p.id === fam.currentId && !p.died && p.retired == null) : null;
    const ov = createSuccessionOverlay({
      title: past.died ? LEGACY_TEXT.deadLoad(legacyFullName(past)) : LEGACY_TEXT.retiredLoad(legacyFullName(past)),
      lines: [cur ? `${legacyHouse(fam, 'The')} is carried by ${legacyFullName(cur)} now.` : `${legacyHouse(fam, 'The')} has ended. Its tree is kept in the Hall of Ancestors.`],
      choices: cur ? [{ key: `p${cur.id}`, who: cur, name: legacyFullName(cur), sub: legacyIdentity(cur), act: `Play as ${cur.given}` }] : [],
      faces: shared.legacyFaces,
      choose: (key) => ({ ok: !!shared.legacyHost?.succeed({ personId: Number(key.slice(1)) }) }),
      end: { label: 'Return to the menu', ask: 'Return to the menu', act: () => { releaseUnloadGuard(); exitToTitleMenu(); } },
    });
    if (ov) shared.townTalk.showOverlay(ov);
  }
  const legacyFullName = (p) => (p.surname ? `${p.given} ${p.surname}` : p.given); const legacyHouse = (fam, the = 'the') => `${the} house${houseWord(fam?.surname) ? ` of ${houseWord(fam.surname)}` : ''}`;
  const legacyIdentity = (p) => identityLine(p);
  function legacyTopicRows(person) {
    const res = person?.living?.res;
    if (!res || !shared.legacyHost) return [];
    const day = shared.livingRegardDay();
    return shared.legacyHost.topicRows(res, {
      regard: shared.livingRegardOf(res, day), personality: liveStat(playerEntity, 'personality'),
      etiquette: skillValue(playerEntity, SKILLS.Etiquette), townName: _townOfMapId.get(res.town >>> 0)?.name ?? '',
    });
  }
  function legacyMeetKin(person, talk) {
    const kin = shared.legacyHost?.kinOfResident(person?.living?.res) ?? null;
    if (!kin) return false;
    const resId = person.living.res.id;
    const ov = createKinOverlay({
      title: kin.name, lines: [kin.is, ...kin.lines], who: kin.person, name: kin.name, sub: legacyIdentity(kin.person),
      act: LEGACY_TEXT.playAs(kin.person.given), why: kin.refusal, faces: shared.legacyFaces,
      play: () => shared.legacyHost?.switchTo(kin.person.id, { here: true }) ?? { ok: false, why: LEGACY_TEXT.notSaved },
      talk: () => { if (person.living?.res?.id === resId) talk(); else shared.townTalk.say(`${kin.person.given} has gone on their way.`); },
    });
    if (!ov) return false;
    shared.townTalk.showOverlay(ov);
    return true;
  }
  function legacyDateText(minutes) {
    const d = dateFromClassicMinutes(Math.max(0, Math.floor(minutes)));
    return `${d.day + 1} ${monthNames()[d.month]}, 3E ${d.year}`;
  }
  let _legacyT = 0;
  function legacyStep(dt) {
    _legacyT -= dt;
    if (_legacyT > 0 || !shared.legacyHost) return;
    // A load replaces the record lists after its awaits, so the tick waits while the world moves.
    if (worldMoveBusy()) return;
    _legacyT = 1;
    const said = shared.legacyHost.tick();
    setLootMarksLive(shared.legacyRemainsStand.frame(shared.legacyHost.remainsToStand()) > 0, 'legacy');
    if (!said || successionOpen() || (shared.townTalk.overlayActive && !shared.townTalk.overlayDone) || shared.modes?.deathUp?.()) return;
    if (said.past) openLegacyDeadLoad(said);
    else if (said.fall) openLegacySuccession(said.fall);
  }
  function respawnOnlinePlayer() {
    shared._rezSeen = null;
    shared._deadMark = null; shared._partyComposedAt = -Infinity;
    if (shared._respawning) return;
    shared._respawning = true;
    endPlayerFights();
    shared.wagonRiders?.leave();
    const wildRise = !!wildDeath() || wildDeathKill(), wildKilled = wildDeathKill();
    shared.wildGhostEnd();
    // Heal before any await: a dead player with no death screen raises death again.
    reviveForPlay(playerEntity, { force: true });
    surfacePlayer();
    shared.player.stopAutorun();
    const goldLost = wildKilled || madeRuleHere('deathPenalty') === 'none' ? 0 : applyDeathPenalty(playerEntity);
    setCrimeCommitted(playerEntity, CRIMES.None);
    shared.arrestFlow.abandon();
    const took = revenantTakes(playerEntity, { online: true });
    shared._deathWasOnline = null;
    const mode = shared.modes?.mode ?? 'exterior';
    const wasInDungeon = mode === 'dungeon';
    const diedInHour = madeRuleHere('death') === 'final';
    const diedInSpire = madeRuleHere('death') === 'fall';
    const spireBack = diedInSpire ? shared.modes?.egHallReturn?.() ?? null : null;
    const ohReturn = wasInDungeon ? shared.ohAbyss?.returnPoint() ?? null : null;
    // Read the pixel while the mode is mounted; after the exit it reads through the world origin.
    const px = ohReturn?.pixel ?? playerTravelPixel();
    const courtGate = shared.modes?.gateArenaGate?.() ?? null;
    Promise.resolve().then(async () => {
      if (courtGate) {
        shared.modes?.forceExitToExterior();
        if (landBeforeGate(courtGate)) { shared.gateVeil?.flash(); shared.townTalk.showOverlay(new ActionTextBox([COURT_TEXT.castOut])); return; }
      }
      if (diedInSpire) {
        shared.modes?.forceExitToExterior();
        if (spireBack && egLandAt(spireBack)) { shared.gateVeil?.flash('hourCast'); shared.townTalk.showOverlay(new ActionTextBox([EG_TEXT.fallen, deathPenaltyText(goldLost), took?.line].filter((t) => !!t))); return; }
      }
      if (mode !== 'exterior') shared.modes?.forceExitToExterior();
      const isPrivateersHold = wasInDungeon
        && px.x === getInt('Startup', 'StartCellX') && px.y === getInt('Startup', 'StartCellY');
      let kind, land = px;
      const wildSite = wildRise ? shared.wildRiseSite(px, wasInDungeon, wildKilled) : null;
      if (wildSite) { land = wildSite.mapPixel; kind = wildSite.kind; }
      else if (wasInDungeon && !isPrivateersHold) kind = 'dungeon';
      else if (etherSea && inEther(px.x, px.y)) {
        const port = etherRisePort(px.x, px.y);
        land = { x: port.px, y: port.py }; kind = 'city';
      } else {
        const mapTable = maps.getRegion(_questRegionIndex())?.mapTable ?? [];
        const safe = nearestSafeLocation(mapTable, px) ?? nearestSafeLocationAnywhere(maps, px);
        if (safe) { land = safe.mapPixel; kind = safe.kind; }
        else kind = 'city';
      }
      if (wildRise) shared.hccRuntimeOn()?.forceNextFastTravel?.();
      shared.hccRuntimeOn()?.handlePreFastTravel();
      try {
        if (ohReturn) { await ohTeleportToWorld(ohReturn.worldX, ohReturn.worldZ); await shared.ohAbyss.standAtPit(ohReturn); }
        else await _teleportToPixel(land.x, land.y, null, { reposition: REPOSITION.RandomStartMarker });
      } finally { shared.hccRuntimeOn()?.handlePostFastTravel(); }
      if (wildRise) shared.wildClearSpawn();
      shared._lastEncMinutes = Math.floor(shared.playerTicker.ownMinutes);
      if (!(playerEntity.health > 0)) { reviveForPlay(playerEntity); surfacePlayer(); }
      shared.ohAbyss?.onRespawnerComplete();
      if (diedInHour) { shared.gateVeil?.flash('hourCast'); kind = 'hour'; }
      shared.townTalk.showOverlay(new ActionTextBox([respawnFlavorText(kind), deathPenaltyText(goldLost), took?.line].filter(Boolean)));
    }).catch((e) => {
      // The heal already ran, so a failed respawn still closes the death screen.
      console.error('[respawn] failed - the player stands where they fell:', e?.message ?? e);
      closeDeathScreen();
    }).finally(() => { shared._respawning = false; });
  }

  async function legacyRealmBirth(host) {
    const io = realmIoNow();
    if (!io) { realmLost('signed-out'); return; }
    for (let i = 0; !shared.playerSpawned && i < 240; i++) await new Promise((r) => { setTimeout(r, 250); });
    const made = await realmCreateLegacy(io);
    if (!made.ok) { realmLost(made.error); return; }
    let refused = 'server';
    shared.legacyFirstSave = () => realmFirstSave(io, made).then((r) => { if (!r.ok) refused = r.error; return !!r.ok; });
    const ok = await Promise.resolve(host.onBorn()).finally(() => { shared.legacyFirstSave = null; });
    if (!ok) { realmLost(refused); return; }
    await legacyRealmLine?.flush();
    releaseUnloadGuard();
    location.replace(`${location.pathname}${realmBootSearch(location.search, made.data.id, BOOT_DOOR_KEYS)}`);
  }
  async function legacyBoot(search) {
    if (legacyRealmLine) {
      const wait = () => new Promise((r) => { setTimeout(r, REALM_EXIT_WAIT_MS); });
      await Promise.race([legacyRealmLine.flush(), wait()]);
      if (realmSession && !realmSession.lost) await Promise.race([realmSession.leave(), wait()]);
    }
    releaseUnloadGuard();
    location.replace(`${location.pathname}${search}`);
  }

  const legacyUnionsRead = () => {
    if (!shared._bootLoaded || !legacyRealmLine || !realmSession || realmSession.lost || shared._unionsAsking) return;
    shared._unionsAsking = true;
    shared._unionsAt = performance.now();
    realmUnions(realmIoNow()).then((r) => { if (r.ok) shared.legacyHost?.unionsHeard(r.unions); }).catch(() => {}).finally(() => { shared._unionsAsking = false; });
  };

  const legacyHere = ({ height = false } = {}) => {
    const px = playerTravelPixel();
    const r = maps.getRegionIndexAt(px.x, px.y);
    const loc = locationIndex.get(`${px.x},${px.y}`) ?? null;
    const mode = shared.modes?.mode ?? 'exterior';
    const pos = shared.walkMode && shared.playerSpawned ? [shared.player.pos[0], shared.player.pos[1], shared.player.pos[2]] : [shared.cam.pos[0], shared.cam.pos[1], shared.cam.pos[2]];
    const dl = mode === 'dungeon' ? shared.modes?.dungeonCtx?.abyss?.location?.() ?? null : null;
    return {
      pixel: { x: px.x, y: px.y }, regionIndex: r, region: REGION_NAMES[r] ?? '', mode, loc: loc?.name ?? null, locationType: loc?.mapTableData?.locationType ?? null,
      mapId: loc?.mapTableData?.mapId != null ? loc.mapTableData.mapId >>> 0 : null,
      dungeon: dl ? { regionIndex: dl.regionIndex, locationIndex: dl.locationIndex, key: shared.modes?.dungeonCtx?.locationKey?.() ?? null, size: builtDungeonSize(shared.modes?.dungeonLocation) } : null,
      pos: mode === 'dungeon' ? pos : null,
      world: mode === 'exterior' ? { ...shared.state.worldCoords(pos), ...(height ? { y: shared.groundFrameHeight(pos[1] - shared.state.compensation[1], pos[0], pos[2]), terrainScale: STREAMING_TERRAIN_SCALE } : {}) } : null,
    };
  };
  const legacyInDungeonOf = (h, place) => h.mode === 'dungeon' && !!place?.dungeon && h.pixel?.x === place.pixel?.x && h.pixel?.y === place.pixel?.y && h.dungeon?.regionIndex === place.dungeon.regionIndex && h.dungeon?.locationIndex === place.dungeon.locationIndex && (place.dungeon.key == null || h.dungeon?.key === place.dungeon.key) && (place.dungeon.size == null || h.dungeon?.size === place.dungeon.size);
  const legacyAtPlace = (place) => {
    if (!place || !shared.playerSpawned) return false;
    const h = legacyHere();
    if (place.mode === 'dungeon') return legacyInDungeonOf(h, place)
      && (!place.pos || !h.pos || Math.hypot(h.pos[0] - place.pos[0], h.pos[1] - place.pos[1], h.pos[2] - place.pos[2]) <= LEGACY_REMAINS_NEAR_DUNGEON);
    if (h.mode !== 'exterior' || h.pixel.x !== place.pixel?.x || h.pixel.y !== place.pixel?.y) return false;
    if (place.mode !== 'exterior' || !place.world) return true;
    return Math.hypot(h.world.x - place.world.x, h.world.z - place.world.z) <= LEGACY_REMAINS_NEAR;
  };
  const legacyOpenRemains = (rec, items) => {
    if (shared.townTalk.overlayActive && !shared.townTalk.overlayDone) return false;
    const hooks = {
      items: () => items, playerOwned: false, textureArchive: REMAINS_FLAT.archive, textureRecord: REMAINS_FLAT.record,
      containerImage: () => CONTAINER_IMAGES.Corpse1, pos: [...(shared.walkMode && shared.playerSpawned ? shared.player.pos : shared.cam.pos)],
    };
    const mode = shared.modes?.mode ?? 'exterior';
    if (mode !== 'exterior') return !!shared.modes?.openLootList?.(items, hooks);
    const w = shared.makeInventoryWindow({ loot: hooks });
    if (w) shared.townTalk.showOverlay(w);
    return !!w;
  };
  const legacyRemainsFeet = (place) => {
    if (!place || !shared.playerSpawned) return null;
    const mode = shared.modes?.mode ?? 'exterior';
    if (place.mode === 'dungeon') {
      if (mode !== 'dungeon' || !Array.isArray(place.pos) || !legacyInDungeonOf(legacyHere(), place)) return null;
      return shared.modes?.dungeonCtx?.floorAt?.(place.pos[0], place.pos[1], place.pos[2]) ?? [place.pos[0], place.pos[1], place.pos[2]];
    }
    if (mode !== 'exterior' || place.mode !== 'exterior' || !place.world) return null;
    const [x, z] = shared.state.localFromWorld(place.world.x, place.world.z);
    const ground = shared.heightAt(x, z);
    if (!Number.isFinite(ground)) return null;
    const y = Number.isFinite(place.world.y) ? shared.anchorLanding({ nativeX: place.world.x, nativeZ: place.world.z, y: place.world.y, terrainScale: place.world.terrainScale })[1] : ground;
    return floorLanding(shared.collider, [x, Math.max(y, ground) + 0.5, z]);
  };

  const legacyCarried = () => [...(playerEntity.items ?? []), ...(playerEntity.wagonItems ?? []), ...(playerEntity.bagItems ?? [])];
  const legacyAtRest = () => {
    if (!shared.playerSpawned) return false;
    const b = (shared.modes?.mode ?? 'exterior') === 'interior' ? shared.modes?.interiorBuilding : null;
    if (b?.buildingType === TALK_BUILDING_TYPES.Temple) return true;
    const seat = shared.legacyHost?.family?.seat;
    const h = legacyHere();
    return !!seat && h.mode !== 'dungeon' && h.loc === seat.loc && h.region === seat.region;
  };

  const legacyInheritDeed = (row, scenes) => {
    const region = row.regionIndex | 0;
    if (!playerEntity.houses?.length) playerEntity.houses = createHouses(BANK_REGION_COUNT);
    const slot = playerEntity.houses[region];
    if (!slot) return null;
    if ((slot.buildingKey | 0) > 0) return (slot.mapId >>> 0) === (row.mapId >>> 0) && (slot.buildingKey | 0) === (row.buildingKey | 0) ? 'given' : 'waits';
    allocateHouseToPlayer(playerEntity.houses, region, { buildingKey: row.buildingKey | 0, mapId: row.mapId, location: row.location ?? '' }, {
      discoverBuilding: (key, name) => { if (row.location) discoverBuilding(`${region}:${row.location}`, { buildingKey: key, buildingType: TALK_BUILDING_TYPES.House1 }, name); },
      addPermanentScene: () => {},
      addNote: (text) => shared.questBridge?.notebook?.addNote?.(text),
      playerName: playerEntity.name ?? '', regionName: REGION_NAMES[region] ?? '',
    });
    if (typeof row.layout === 'string') stampLayout(slot, row.layout);
    graftPermanentScene(playerEntity.sceneCache ??= createSceneCache(), scenes(), interiorSceneName(row.mapId, row.buildingKey | 0));
    return 'given';
  };

  const legacyInheritOnline = (row, fallen) => {
    if (!homesApi || !realmSession || !fallen?.characterId) return null;
    const key = `${row.mapId >>> 0}:${row.buildingKey | 0}`;
    const st = shared._legacyInheriting.get(key);
    if (st === 'given' || st === 'waits' || st === 'gone') { shared._legacyInheriting.delete(key); return st; }
    if (st === 'asking' || (typeof st === 'number' && Date.now() - st < HOME_RETRY_MS)) return 'asking';
    shared._legacyInheriting.set(key, 'asking');
    const me = realmSession.id, from = String(fallen.characterId);
    const same = (h) => (h?.mapId >>> 0) === (row.mapId >>> 0) && (h?.buildingKey | 0) === (row.buildingKey | 0);
    (async () => {
      const all = await homesApi.mine();
      if (!all?.ok || !Array.isArray(all.data?.homes)) throw new Error('homes');
      const mine = all.data.homes.find((h) => same(h) && h.character === me) ?? null;
      const theirs = all.data.homes.find((h) => same(h) && h.character === from) ?? null;
      if (!mine && !theirs) return 'gone';
      const deed = (mine ?? theirs).deed === true;
      const slot = playerEntity.houses?.[row.regionIndex | 0];
      if (deed && (slot?.buildingKey | 0) > 0 && !((slot.mapId >>> 0) === (row.mapId >>> 0) && (slot.buildingKey | 0) === (row.buildingKey | 0))) return 'waits';
      if (!mine) {
        const r = await homesApi.inherit({ mapId: row.mapId >>> 0, buildingKey: row.buildingKey | 0, character: me, from });
        if (!r?.ok) { if (r?.error === 'no-home') return 'gone'; throw new Error(r?.error ?? 'offline'); }
      }
      const rec = await realmFetch(realmIoNow(), from);
      if (!rec.ok && rec.error !== 'no-data') throw new Error(rec.error ?? 'offline');
      let snap = null;
      try { snap = rec.ok ? JSON.parse(rec.text) : null; } catch { snap = null; }
      const scenes = snap?.sceneCache ?? null;
      const homeScene = homeSceneName(row.mapId, row.buildingKey | 0);
      if (deed) legacyInheritDeed(row, () => scenes);
      if (!deed || (scenes?.permanentScenes ?? []).includes(homeScene)) graftPermanentScene(playerEntity.sceneCache ??= createSceneCache(), scenes, homeScene);
      if (shared._legacyOnlineHomes && !shared._legacyOnlineHomes.some(same)) shared._legacyOnlineHomes = [...shared._legacyOnlineHomes, { regionIndex: row.regionIndex | 0, mapId: row.mapId >>> 0, buildingKey: row.buildingKey | 0, location: row.location ?? '' }];
      legacyOnlineHomesRead();
      return 'given';
    })().then((r) => { shared._legacyInheriting.set(key, r); }, () => { shared._legacyInheriting.set(key, Date.now()); });
    return 'asking';
  };
  const legacyInheritHouse = (row, fallen) => {
    if (isOnlinePage()) return legacyInheritOnline(row, fallen);
    const at = fallen?.characterId ? newestSaveOf(enumerateSaves().info, fallen.characterId) : -1;
    return legacyInheritDeed(row, () => (at >= 0 ? loadSlot(at)?.sceneCache ?? null : null));
  };

  const legacySaid = (r) => { if (!r?.ok && r?.why) shared.townTalk.say(r.why); return r; };
  return {
    _respawnAtSite, cancelRestArm, closeDeathScreen, legacyAtPlace, legacyAtRest, legacyBoot, legacyCarried,
    legacyDateText, legacyDeathReset, legacyHere, legacyInheritHouse, legacyMeetKin, legacyOpenRemains,
    legacyPassMantle, legacyReady, legacyRealmBirth, legacyRemainsFeet, legacySaid, legacyStep, legacyTopicRows,
    legacyUnionsRead, respawnOnlinePlayer, resurrectInPlace, transferToCemeteryArm,
  };
}
