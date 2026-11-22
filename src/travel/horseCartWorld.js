// The Horse Cart and Cargo mod in the world: the wagon pool, its settings and hotkeys, the
// per-frame tick, and the parked wagon record. Also camp position converters and Field Cook checks.
import { birthHorses } from './horseCoats.js';
import { CAPSULE_RADIUS } from '../player/motor.js';
import { cellRoomOfWire } from '../net/wire.js';
import { characterIdOf } from '../characters/characterId.js';
import { COOK_FIRE } from '../net/professionLaw.js';
import { createHorseCartPool } from './horseCartPool.js';
import { horseCountOf } from './wagonKinds.js';
import { horseNameTooltip } from '../ui/horseNameTooltip.js';
import { isLocalPlayerTarget } from '../characters/enemyTargets.js';
import { isQualifyingThreatState } from './horseFollow.js';
import { modSetting, modSettingsOf } from '../mods/modSettings.js';
import { playerEntity } from '../characters/playerEntity.js';
import { pressed } from '../ui/input.js';
import { wagonPoolDeps } from '../world/wagonModels.js';
import { worldPlaqueOn } from '../ui/worldPlaque.js';
import { timeScale as worldTimeScale } from '../world/timeScale.js';

/** @param {any} shared */
export function createHorseCartWorld(shared) {
  const {
    cam, camps, collider, cpuModels, gamePaused, getGpuMesh, groundFrameHeight, player, profBook, renderer, state,
    walkMode,
  } = shared;
  const fieldCookNow = () => profBook?.state?.open === true && profBook.track('cooking')?.specs?.[50] === 'field-cook';

  const cookFireHere = () => (shared._mode() === 'exterior'
    ? (camps.fireNear(walkMode && shared.playerSpawned ? player.pos : cam.pos) ? COOK_FIRE : null)
    : shared.modes?.cookFireHere?.() ?? null);
  const campToNatives = (pos) => { const wc = state.worldCoords(pos); return [wc.x, pos[1] - state.compensation[1], wc.z]; };
  const campFromNatives = (p) => { const [lx, lz] = state.localFromWorld(p[0], p[2]); return [lx, p[1] + state.compensation[1], lz]; };
  const campToRecord = (pos) => { const n = campToNatives(pos); return [n[0], groundFrameHeight(n[1], pos[0], pos[2]), n[2]]; };

  const HCC_VENDOR = 'horse-cart-and-cargo';
  const hccOn = () => { try { return modSetting(HCC_VENDOR, 'Enabled') !== false; } catch { return false; } };
  const hccSettings = () => {
    const m = modSettingsOf(HCC_VENDOR);
    return {
      physicalPersistence: m['Persistence.PhysicalPersistence'], showTrailingWagon: m['Presentation.ShowTrailingWagon'],
      horseFollowDistance: m['Following.HorseFollowDistance'], avoidCombat: m['Following.AvoidCombat'], followFastTravel: m['Following.FollowFastTravel'],
      interiorAccessDistance: m['WagonAccess.InteriorAccessDistance'],
    };
  };

  const hccActionPressed = (action) => !gamePaused() && !shared.pointerSurfaces.size && !shared._loading && pressed(shared.latch.edge, shared.keys, action);
  const hccPlayerCentre = () => [player.pos[0], player.pos[1] + (Number.isFinite(player.height) ? player.height : 1.8) / 2, player.pos[2]];
  const hccForward = () => [Math.sin(cam.yaw), 0, Math.cos(cam.yaw)];
  const hccRuntimeOn = () => (hccOn() ? shared.hccRuntime : null);
  const hccThreats = () => shared.exteriorFoePool().filter((f) => !f.dead && f.ai?.feet && isQualifyingThreatState(true, !!f.ai.isHostile, f.entity?.team === 'PlayerAlly', isLocalPlayerTarget(f.ai.target), !!f.ai.detected)).map((f) => [f.ai.feet[0], f.ai.feet[1], f.ai.feet[2]]);

  const hcc = createHorseCartPool({
    riders: { passengers: () => shared.wagonRiders?.passengers() ?? [], go: () => shared.wagonRiders?.go() ?? null, declined: () => shared.wagonRiders?.declined() ?? [], acts: (o, k, kept) => shared.wagonRiders?.acts(o, k, kept) ?? [], press: (o, id, d) => shared.wagonRiders?.press(o, id, d) ?? false, sitsIn: (p, o, k) => shared.wagonRiders?.sitsIn(p, o, k) ?? false },
    renderer, meshes: { getGpuMesh, cpuModels }, collider: () => collider, now: () => performance.now() / 1000,
    threats: hccThreats, selfId: () => shared.online?.id ?? null, peerName: (id) => shared.peerName(id),
    onChanged: () => { shared._hccDirty = true; }, toWire: (p) => campToWire(p), log: console, ...wagonPoolDeps(() => playerEntity.items ?? []), enterCaravan: () => shared.caravanRooms.enter(),
    wagonEntry: () => shared.caravanEntryWord(),
    caravanEntry: { row: () => shared.caravanEntryRow(), turn: () => shared.caravanEntryTurn() },
    visit: { may: (t) => shared.caravanVisitMay(t), enter: (t) => shared.caravanVisitEnter(t) },
    horses: () => horseCountOf(playerEntity.items ?? []),
    playerCapsule: () => (walkMode && shared.playerSpawned ? { feet: player.pos, height: player.height, radius: CAPSULE_RADIUS } : null),
    bodyCapsules: () => [...shared.crewAshore.capsules(), ...shared.revenantAshore.capsules(), ...shared.necro.capsules(), ...shared.thralls.capsules()],
    renderShift: () => { if (!walkMode || !shared.playerSpawned) return null; const f = player.feetAt(); return [f[0] - player.pos[0], 0, f[2] - player.pos[2]]; },
    peerAnchor: (id) => { const sh = shared._peerMapPoses.get(id); return sh && (sh.rd | 0) === 2 ? shared.onlineToScene(sh) : null; },
  });
  hcc.setPeerLook((id) => (shared._hiddenPeers.has(id) || !shared.gateCrowd.shows(id) ? 'hidden' : (shared._veils.get(id) ?? null)));
  shared.hccGroundMoved = hcc.groundMoved;

  // Runs once a frame in every mode, after the motor and recenter, before the wagon is drawn.
  const hccTick = (dt, nowMs) => {
    birthHorses(playerEntity.items);
    hcc.setEnabled(hccOn()); if (hcc.enabled) hccPollSettings(nowMs); hcc.frame(dt, cam.pos, gamePaused() ? 0 : dt * worldTimeScale());
    const tipOn = hcc.enabled && walkMode && shared._mode() === 'exterior' && !worldPlaqueOn() && !gamePaused() && !shared.pointerSurfaces.size;
    horseNameTooltip.set(tipOn ? hcc.tooltipText(cam.pos, [Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)], collider) : '');
    if (shared._mode() === 'exterior') shared.wagonRiders?.frame();
    if (shared._mode() !== 'exterior' || !(playerEntity.health > 0)) shared.wagonRiders?.leave();
    if (shared._mode() !== 'exterior') { shared._driverSeat = null; shared._driverBodySeat = null; }
  };
  // Mod settings have no change event, so the keys are read again once a second.
  const hccPollSettings = (nowMs) => {
    if (nowMs - shared._hccSettingsAt < 1000) return;
    shared._hccSettingsAt = nowMs;
    const k = JSON.stringify(hccSettings());
    if (k === shared._hccSettingsKey) return;
    if (shared._hccSettingsKey !== null) shared.hccRuntime.handleSettingsChanged();
    shared._hccSettingsKey = k;
  };

  const campToWire = (p) => { const wc = state.worldCoords(p); return [wc.x, p[1] - state.compensation[1], wc.z]; };
  const campToScene = (p) => { const l = state.localFromWorld(p[0], p[2]); return [l[0], p[1] + state.compensation[1], l[1]]; };

  const hccParkTick = (now) => {
    if (!shared.online || shared.online.status !== 'open' || !shared.online.parkOk) return;
    const c = characterIdOf(playerEntity);
    if (!c) return;
    const word = hcc.parkWord(campToWire);
    const data = word ? { c, ...word } : { c };
    const key = JSON.stringify(data);
    const rejoin = shared.online.room !== shared._parkRoom || shared.online.welcomes !== shared._parkWelcomes;
    const cell = word ? cellRoomOfWire(word.a[0], word.a[1]) : null;
    // A record sent as the anchor alone, before the cell socket opened, goes again once it is.
    const owed = !!word?.r && shared._parkSent?.via === 'room' && shared.online.inRoom(cell);
    if (!rejoin && !owed && key === shared._parkSent?.key) return;
    if (!rejoin && word && !word.r && shared._parkSent?.c === c && shared._parkSent?.word?.r && shared._parkSent.word.a[0] === word.a[0] && shared._parkSent.word.a[1] === word.a[1]) return;
    if (!rejoin && now - shared._parkSentAt < 1000) return;
    const via = shared.online.sendPark(data, cell);
    if (!via) return;
    shared._parkSent = { key, word, via, c }; shared._parkSentAt = now; shared._parkRoom = shared.online.room; shared._parkWelcomes = shared.online.welcomes;
  };
  return {
    HCC_VENDOR, campFromNatives, campToNatives, campToRecord, campToScene, campToWire, cookFireHere, fieldCookNow,
    hcc, hccActionPressed, hccForward, hccOn, hccParkTick, hccPlayerCentre, hccRuntimeOn, hccSettings, hccThreats,
    hccTick,
  };
}
