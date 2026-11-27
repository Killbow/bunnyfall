// @ts-check

import {
  WAGON_MODE, HORSE_MODE, INTERIOR_ACCESS, LAST_MOUNT, STORAGE_CONTEXT, HORSE_ACTIVATION, TRANSPORT, ACTIVATE_MODE, MATHF_EPSILON,
  V_FORWARD, V_ZERO, vadd, vsub, vscale, vsqr, vnorm, vdot, vlerp, horizontalForward, horizontalRight, horizontalDistance, isWithinHorizontalDistance,
  sceneToWorld, worldToScene, applyLocalOffsetToWorld, castWorldCoordinate, newSaveData, copySaveData, normalizeSaveData, normalizeHorseName, resolveHorseNameInput,
  reconcileHorseNameOwnership, resolvePersistenceDisabledState, resolvePersistenceEnabledState, isWagonInventoryAccessible, isDungeonExitWagonAccessAllowed,
  interiorAccessRequiresMapPixelMatch, isUsableDungeonEntranceDoorPosition, isHitchedTeamFollowing, isAutonomousHorseFollowing, isDirectHitchedTeamMount,
  isPhysicalTeamWithinMountDistances, isPhysicalTransportStateValid, canRefreshDirectCartTransport, resolveQuickMountMode, resolveHorseActivation,
  isHorseCommandMode, isHorseNamingMode, resolveInteriorEntryMode, isCartInteriorDeployment, shouldDeployIndependentHorseForInterior,
  horseTravelsWithFastTravel, resolveFastTravelDepartureModes, shouldReconcileAfterTravelOptions, clampHorseFollowDistance, clampInteriorWagonAccessDistance,
  isWithinInteriorEntranceDistance, formatHorseSubject, formatHorseAndWagonSubject, horseTargetLabel, HCC_TEXT, pickGround, angleBetween,
  WAGON_FOLLOW_DISTANCE, DEPLOY_CLEARANCE, HORSE_NAME_MAX, DEPLOYED_SPAWN_RETRY_SECONDS, DIRECT_CART_AUDIO_REFRESH_DELAY, HORSE_MENU_MOUNT_DISTANCE, HORSE_WAGON_HITCH_DISTANCE,
  WAGON_INVENTORY_DISTANCE, DEFAULT_HORSE_FOLLOW_DISTANCE, DEFAULT_INTERIOR_ACCESS_DISTANCE, HORSE_DISMOUNT_REAR_OFFSET,
  HITCHED_HORSE_LOCAL_X, HITCHED_HORSE_LOCAL_Z, ACTIVATION_REACH, WAGON_SAVE_VERSION, TOO_FAR_SECONDS, STATIONARY_PROBE_HEIGHT, STATIONARY_PROBE_DISTANCE,
  GROUND_RETRY_SECONDS, POSE_POSITION_TOLERANCE_SQ, POSE_ANGLE_TOLERANCE_DEG, signedLongitudinalTravel, wheelRotationDegrees, wrapWheelAngle, cargoTier,
  stepHorseWalk, freshHorseWalk, hccActionRows,
} from './horseCartLaw.js';
import { HorseFollowController, WagonHitch, hitchedPoseStep, hitchJumpReach, tryFindGround } from './horseFollow.js';
import { thrownTo, horseThrownWith } from './wagonWarden.js';
import { createTrailingPoseCache } from './trailingPoseCache.js';
import { yawed } from './horseFollow.js';
import { quatLookRotation, quatForward, quatFromBasis, quatRotate, UNITY_QUAT_IDENTITY } from '../world/quat.js';
import { noteFirstUse } from '../ui/tutorials.js';

export const HCC_MOUNT_ACTION = 'HorseMount', HCC_SUMMON_ACTION = 'HorseSummon';

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const projectOnPlane = (v, n) => vsub(v, vscale(n, vdot(v, n)));
const normalizeHorizontalHeading = (v) => { const p = [v[0], 0, v[2]]; return vsqr(p) <= MATHF_EPSILON ? [...V_FORWARD] : vnorm(p); };

export class DeployedWagonVisual {
  constructor(parts, position, forward, weight, limit, phys, now) {
    if (!parts) throw new Error('DFU returned no object for vanilla wagon model 41214');
    this.parts = parts; this.phys = phys;
    this.position = [...position]; this.rotation = quatLookRotation(normalizeHorizontalHeading(forward));
    this.grounded = false; this.nextGroundRetryTime = 0; this.groundingFailureLogged = false;
    this.cargoTier = cargoTier(weight, limit);
    this.alive = true;
    this.tryApplyGrounding(position, forward, now);
  }
  get isAlive() { return this.alive; }
  get isGrounded() { return this.grounded; }
  tryGetGroundedPose() {
    if (!this.alive || !this.grounded) return null;
    return { position: [...this.position], forward: normalizeHorizontalHeading(quatForward(this.rotation)) };
  }
  tick(position, forward, weight, limit, now) {
    this.cargoTier = cargoTier(weight, limit);
    if (this.grounded) return;
    if (now < this.nextGroundRetryTime) return;
    if (this.tryApplyGrounding(position, forward, now)) this.groundingFailureLogged = false;
  }
  worldPivot(local) { return vadd(this.position, quatRotate(this.rotation, local)); }
  probeExternalGround(origin) {
    const hits = this.phys.raycastAll(vadd(origin, [0, STATIONARY_PROBE_HEIGHT, 0]), [0, -1, 0], STATIONARY_PROBE_DISTANCE);
    return pickGround(hits, origin[1]);
  }
  tryApplyGrounding(position, forward, now) {
    if (!this.alive || !this.parts) return false;
    this.grounded = false;
    this.position = [...position]; this.rotation = quatLookRotation(normalizeHorizontalHeading(forward));
    const leftHit = this.probeExternalGround(this.worldPivot(this.parts.wheelLeftPivot));
    const rightHit = this.probeExternalGround(this.worldPivot(this.parts.wheelRightPivot));
    let solved = false;
    if (leftHit && rightHit) {
      const wheelMidLocal = vscale(vadd(this.parts.wheelLeftPivot, this.parts.wheelRightPivot), 0.5);
      const s = solveTwoWheelPose(leftHit.point, rightHit.point, normalizeHorizontalHeading(forward), wheelMidLocal, this.parts.wheelRadius);
      if (s) { this.position = s.position; this.rotation = s.rotation; solved = true; }
    } else if (leftHit || rightHit) {
      const pivot = leftHit ? this.parts.wheelLeftPivot : this.parts.wheelRightPivot;
      const hit = leftHit ?? rightHit;
      const pivotY = this.worldPivot(pivot)[1];
      this.position = [this.position[0], this.position[1] + (hit.point[1] + this.parts.wheelRadius) - pivotY, this.position[2]];
      solved = true;
    }
    if (!solved) {
      this.nextGroundRetryTime = now + GROUND_RETRY_SECONDS;
      if (!this.groundingFailureLogged) { this.groundingFailureLogged = true; this.phys.log?.warn?.('[TrailingWagon] deployed wagon grounding found no valid external surface; presentation will retry.'); }
      return false;
    }
    this.grounded = true; this.nextGroundRetryTime = 0;
    return true;
  }
  release() { this.alive = false; this.grounded = false; }
  offset(d) { this.position = vadd(this.position, d); }
}

export function solveTwoWheelPose(leftContact, rightContact, heading, wheelMidLocal, wheelRadius) {
  if (wheelRadius <= MATHF_EPSILON) return null;
  let axle = vsub(rightContact, leftContact);
  if (vsqr(axle) <= MATHF_EPSILON) return null;
  axle = vnorm(axle);
  let fwd = projectOnPlane(heading, axle);
  if (vsqr(fwd) <= MATHF_EPSILON) return null;
  fwd = vnorm(fwd);
  let up = cross(fwd, axle);
  if (vsqr(up) <= MATHF_EPSILON) return null;
  up = vnorm(up);
  if (vdot(up, [0, 1, 0]) <= 0) return null;
  fwd = vnorm(cross(axle, up));
  const rotation = quatFromBasis(axle, up, fwd);
  const axleCenter = vscale(vadd(vadd(leftContact, vscale(up, wheelRadius)), vadd(rightContact, vscale(up, wheelRadius))), 0.5);
  const position = vsub(axleCenter, quatRotate(rotation, wheelMidLocal));
  return { position, rotation };
}

export const wheelsOf = (parts) => parts?.wheels ?? (parts?.wheelLeftPivot ? [{ pivot: parts.wheelLeftPivot, radius: parts.wheelRadius, front: false }, { pivot: parts.wheelRightPivot, radius: parts.wheelRadius, front: false }] : []);
export function steeredLocal(kingpin, local, steer) {
  if (!steer) return local;
  const d = yawed([local[0] - kingpin[0], 0, local[2] - kingpin[2]], steer);
  return [kingpin[0] + d[0], local[1], kingpin[2] + d[2]];
}
export function wheelContacts(parts, position, rotation, steer = 0) {
  const bogie = parts?.bogie ?? null;
  return wheelsOf(parts).map((wh) => {
    const turned = !!(wh.front && bogie);
    const c = [wh.pivot[0], wh.pivot[1] - (wh.radius ?? parts.wheelRadius), wh.pivot[2]];
    const local = turned ? steeredLocal(bogie.kingpin, c, steer) : c;
    return { p: vadd(position, quatRotate(rotation, local)), h: quatRotate(rotation, turned ? yawed(V_FORWARD, steer) : V_FORWARD) };
  });
}
export function rolledAngles(angles, before, now, parts) {
  const list = wheelsOf(parts);
  return now.map((c, i) => {
    const a = angles?.[i] ?? 0, b = before?.[i];
    if (!b) return a;
    return wrapWheelAngle(a + wheelRotationDegrees(signedLongitudinalTravel(vsub(c.p, b.p), b.h, c.h), list[i]?.radius ?? parts.wheelRadius));
  });
}

export class StationaryHorseVisual {
  constructor(hasArt, position, forward, wagonOwner, phys, now) {
    if (!hasArt) throw new Error('horse source textures were unavailable');
    this.phys = phys;
    this.wagonOwner = wagonOwner ?? null;
    this.position = [...position]; this.forward = normalizeHorizontalHeading(forward);
    this.requestedPosition = [...position]; this.requestedForward = [...this.forward]; this.hasRequestedPose = true;
    this.grounded = false; this.nextGroundRetryTime = 0; this.groundingFailureLogged = false;
    this.active = false; this.alive = true;
    this.motionSpeed = 0;
    this.walk = freshHorseWalk();
    this.tryApplyGrounding(now);
  }
  get isAlive() { return this.alive; }
  get isInteractive() { return this.alive && this.grounded && this.active; }
  tryGetGroundedPose() { return this.isInteractive ? { position: [...this.position], forward: normalizeHorizontalHeading(this.forward) } : null; }
  tick(position, forward, wagonOwner, now) {
    if (!this.alive) return;
    this.motionSpeed = 0;
    const f = normalizeHorizontalHeading(forward);
    const ownerChanged = this.wagonOwner !== (wagonOwner ?? null);
    this.wagonOwner = wagonOwner ?? null;
    let needsPose = !this.hasRequestedPose || ownerChanged;
    if (!needsPose) {
      const dx = position[0] - this.requestedPosition[0], dz = position[2] - this.requestedPosition[2];
      if (dx * dx + dz * dz > POSE_POSITION_TOLERANCE_SQ) needsPose = true;
      else if (angleBetween(f, this.requestedForward) > POSE_ANGLE_TOLERANCE_DEG) needsPose = true;
    }
    if (needsPose) { this.requestedPosition = [...position]; this.requestedForward = f; this.hasRequestedPose = true; this.grounded = false; this.nextGroundRetryTime = 0; }
    if (this.grounded) return;
    if (now < this.nextGroundRetryTime) return;
    if (this.tryApplyGrounding(now)) this.groundingFailureLogged = false;
  }
  applyFollowingPose(position, forward, horizontalSpeed) {
    if (!this.alive) return;
    this.wagonOwner = null;
    this.requestedPosition = [...position]; this.requestedForward = normalizeHorizontalHeading(forward); this.hasRequestedPose = true;
    this.grounded = true; this.nextGroundRetryTime = 0;
    this.position = [...position]; this.forward = [...this.requestedForward];
    this.active = true;
    this.motionSpeed = Math.max(0, horizontalSpeed);
  }
  tryApplyGrounding(now) {
    if (!this.alive || !this.hasRequestedPose) return false;
    this.grounded = false; this.active = false;
    this.position = [...this.requestedPosition]; this.forward = [...this.requestedForward];
    const hits = this.phys.raycastAll(vadd(this.requestedPosition, [0, STATIONARY_PROBE_HEIGHT, 0]), [0, -1, 0], STATIONARY_PROBE_DISTANCE);
    const best = pickGround(hits, this.requestedPosition[1]);
    if (!best) {
      this.nextGroundRetryTime = now + GROUND_RETRY_SECONDS;
      if (!this.groundingFailureLogged) { this.groundingFailureLogged = true; this.phys.log?.warn?.('[TrailingWagon] stationary horse grounding found no valid external surface; presentation will retry.'); }
      return false;
    }
    this.position = [this.requestedPosition[0], best.point[1], this.requestedPosition[2]];
    this.grounded = true; this.nextGroundRetryTime = 0; this.active = true;
    return true;
  }
  stepWalk(dt, hasWalkFrames) { this.walk = stepHorseWalk(this.walk, this.motionSpeed, dt, hasWalkFrames); }
  release() { this.alive = false; this.active = false; this.grounded = false; }
  offset(d) { this.position = vadd(this.position, d); this.requestedPosition = vadd(this.requestedPosition, d); }
}

export function createHorseCartRuntime(deps) {
  const log = deps.log ?? console;
  const phys = { ...deps.phys, log };
  const now = () => deps.now();

  let wagonState = newSaveData();
  const hitch = new WagonHitch();
  let hitchSeed = null;
  let hitchSeedForward = null;
  const horseFollower = new HorseFollowController();
  let pendingInteriorHeading = [...V_FORWARD], pendingInteriorHorseHeading = [...V_FORWARD];
  let pendingInteriorEntranceDistance = Infinity;
  let physicalPersistenceEnabled = true, showTrailingWagon = true, horseFollowDistance = DEFAULT_HORSE_FOLLOW_DISTANCE, avoidCombat = true;
  let interiorWagonAccessDistance = DEFAULT_INTERIOR_ACCESS_DISTANCE, followingTransportFastTravels = true;
  let settingsInitialized = false, pendingPersistenceSettingTransition = false, pendingPersistenceNormalization = false;
  let wagonVisual = null;
  let restWheels = null;
  let hasLastValidGroundState = false;
  let followingWagonFailureLogged = false, nextFollowingWagonSpawnRetryTime = 0, horseRecoveredThisFrame = false;
  let spawnFailureLogged = false, cargoFailureLogged = false;
  let deployedVisual = null, stationaryHorseVisual = null;
  let nextDeployedSpawnRetryTime = 0, deployedSpawnFailureLogged = false, nextHorseSpawnRetryTime = 0, horseSpawnFailureLogged = false;
  let pendingInteriorWorldX = 0, pendingInteriorWorldZ = 0, pendingInteriorHorseWorldX = 0, pendingInteriorHorseWorldZ = 0;
  let pendingInteriorTransportMode = TRANSPORT.Foot, hasPendingInteriorDeployment = false, hasPendingInteriorHorseDeployment = false, pendingInteriorEntranceEligible = false;
  let previousTransportMode = TRANSPORT.Foot, lastValidNonCartTransportMode = TRANSPORT.Foot, hasObservedTransportMode = false;
  let pendingTransportModeRefresh = TRANSPORT.Foot, pendingTransportModeRefreshTime = 0, hasPendingTransportModeRefresh = false;
  let followingTransitionSuspended = false, fastTravelFollowingSuspended = false, pendingFastTravelHorseRelocation = false;
  let travelOptionsWasActive = false, travelOptionsQueryFailed = false;
  let selectWagonOnNextInventoryOpen = false;
  let horseNameInputBox = null;

  const tm = () => deps.transport;
  const pee = () => deps.enterExit;
  const gps = () => deps.gps;
  const ratio = () => deps.streaming.ratio();
  const say = (s) => deps.say?.(s);
  const tooFar = () => deps.setMidScreenText?.(deps.tooFarText?.() ?? 'You are too far away...', TOO_FAR_SECONDS);
  const ready = () => !!deps.ready?.();
  const playerPosition = () => deps.player.position();
  const movement = () => deps.player.movement?.() ?? { position: deps.player.position(), forward: deps.player.forward() };
  const toWorld = (scenePos) => sceneToWorld(scenePos, gps().scenePosition(), gps().worldX(), gps().worldZ(), ratio());
  const toScene = (wx, wz) => { const p = gps().scenePosition(); const [sx, sz] = worldToScene(wx, wz, gps().worldX(), gps().worldZ(), p, ratio()); return [sx, p[1], sz]; };
  const changed = () => deps.presentation?.onChanged?.();
  const trailingPose = createTrailingPoseCache({ now, log, playerWorld: () => [gps().worldX(), gps().worldZ()], ratio });

  const horseName = () => normalizeHorseName(wagonState.HorseName);
  const hasHorseName = () => !!horseName();
  const horseSubject = (cap) => formatHorseSubject(wagonState.HorseName, cap);
  const horseAndWagonSubject = (cap) => formatHorseAndWagonSubject(wagonState.HorseName, cap);
  const horseObject = () => horseSubject(false);
  const savedHeading = () => horizontalForward([wagonState.HeadingX, 0, wagonState.HeadingZ]);
  const savedHorseHeading = () => horizontalForward([wagonState.HorseHeadingX, 0, wagonState.HorseHeadingZ]);
  const isTeamFollowing = () => isHitchedTeamFollowing(wagonState.Mode, wagonState.HorseMode);
  const isHorseFollowing = () => isAutonomousHorseFollowing(wagonState);

  function handleSettingsChanged() {
    const s = deps.settings?.() ?? {};
    const persistence = s.physicalPersistence !== false;
    const showTrailing = s.showTrailingWagon !== false;
    const followDist = clampHorseFollowDistance(s.horseFollowDistance ?? DEFAULT_HORSE_FOLLOW_DISTANCE);
    const avoid = s.avoidCombat !== false;
    const followFT = s.followFastTravel !== false;
    const interiorDist = clampInteriorWagonAccessDistance(s.interiorAccessDistance ?? DEFAULT_INTERIOR_ACCESS_DISTANCE);
    const assign = () => { physicalPersistenceEnabled = persistence; showTrailingWagon = showTrailing; horseFollowDistance = followDist; avoidCombat = avoid; interiorWagonAccessDistance = interiorDist; followingTransportFastTravels = followFT; };
    if (!settingsInitialized) { assign(); settingsInitialized = true; pendingPersistenceNormalization = !persistence; return; }
    const persistenceChanged = persistence !== physicalPersistenceEnabled;
    const avoidChanged = avoid !== avoidCombat;
    assign();
    if (avoidChanged && !avoidCombat) horseFollower.clearCombatEvasion(phys);
    if (!persistenceChanged) return;
    pendingPersistenceSettingTransition = true; pendingPersistenceNormalization = false;
  }
  handleSettingsChanged();

  function hitchZ() { const z = deps.presentation?.hitchOf?.(); return Number.isFinite(z) && z > 0 ? z : HITCHED_HORSE_LOCAL_Z; }
  function deploySetback() { const z = hitchZ(); return z > HITCHED_HORSE_LOCAL_Z ? z + DEPLOY_CLEARANCE : WAGON_FOLLOW_DISTANCE; }
  function hitchSetback() { const z = hitchZ(); return z > HITCHED_HORSE_LOCAL_Z ? z : WAGON_FOLLOW_DISTANCE; }
  const teamShort = () => deps.teamShort?.() ?? null;
  const refuseShortTeam = () => { const t = teamShort(); if (t) say(t); return !!t; };
  const drivableCart = () => tm().hasCart() && !teamShort();
  function reconcileTeam() {
    const short = teamShort();
    if (!short) return;
    if (!physicalPersistenceEnabled) { if (tm().get() === TRANSPORT.Cart) { setTransportMode(TRANSPORT.Foot); say(short); } return; }
    if (isTeamFollowing()) {
      const live = tryGetLiveFollowingWagonPose();
      if (live) { const [wx, wz] = toWorld(live.position); commitDeployment(wx, wz, live.heading, HORSE_MODE.HitchedToWagon); say(short); }
      return;
    }
    if (tm().get() === TRANSPORT.Cart && previousTransportMode === TRANSPORT.Cart && wagonState.Mode === WAGON_MODE.WithPlayer && !pee().isPlayerInside()) { deployFromBestAvailablePose(HORSE_MODE.HitchedToWagon); setTransportMode(TRANSPORT.Foot); say(short); }
  }
  // Reach checks measure to the nearest point of the wagon's run: from the rear-axle anchor forward by as much as
  // its hitch is longer than the mod's. The classic wagon's run is the anchor alone.
  function nearestOnWagon(anchor, forward, to) {
    const run = hitchZ() - HITCHED_HORSE_LOCAL_Z;
    const fl = forward ? Math.hypot(forward[0], forward[2]) : 0;
    if (!(run > 0) || !(fl > 0) || !to) return anchor;
    const fx = forward[0] / fl, fz = forward[2] / fl;
    const t = Math.min(run, Math.max(0, (to[0] - anchor[0]) * fx + (to[2] - anchor[2]) * fz));
    return [anchor[0] + fx * t, anchor[1], anchor[2] + fz * t];
  }
  function poleEnd(at, forward) {
    const bogie = deps.presentation?.wagonParts?.()?.bogie ?? null, steer = restWheels?.steer ?? 0;
    const pole = hitchZ() - (bogie?.wheelbase ?? 0);
    if (!bogie || !steer || !(pole > 0)) return { at, forward };
    const f = horizontalForward(forward), s = yawed(f, steer);
    return { at: vadd(at, vscale(vsub(s, f), pole)), forward: s };
  }

  function createWagonVisual() {
    const parts = deps.presentation?.wagonParts?.() ?? null;
    if (!parts) {
      if (!spawnFailureLogged) { spawnFailureLogged = true; log.error?.('[TrailingWagon] could not create the temporary wagon visual: DFU returned no object for vanilla wagon model 41214.'); }
      return false;
    }
    wagonVisual = {
      parts,
      pose: { position: [...V_ZERO], rotation: [...UNITY_QUAT_IDENTITY], active: false, lastValidPosition: [...V_ZERO], lastValidRotation: [...UNITY_QUAT_IDENTITY], hasLastValid: false, up: [0, 1, 0], hitch: null, axle: null },
      wheel: { has: false, prevPos: [...V_ZERO], prevFwd: [...V_FORWARD], angle: 0, angles: [...(restWheels?.angles ?? [])], contacts: null },
      cargoTier: 0, interaction: false,
    };
    cargoFailureLogged = false;
    resetWheelMotionState();
    spawnFailureLogged = false;
    return true;
  }
  function refreshWagonParts() {
    const parts = deps.presentation?.wagonParts?.() ?? null;
    if (!parts) return;
    if (wagonVisual && wagonVisual.parts !== parts) {
      wagonVisual.parts = parts;
      wagonVisual.wheel.angles = []; wagonVisual.wheel.contacts = null;
      wagonVisual.pose.steer = 0;
    }
    if (deployedVisual && deployedVisual.parts !== parts) { deployedVisual.parts = parts; deployedVisual.grounded = false; deployedVisual.nextGroundRetryTime = 0; restWheels = null; changed(); }
  }
  function clearMovingPresentation() {
    const had = !!wagonVisual;
    if (had) restWheels = { angle: wagonVisual.wheel.angle, angles: [...(wagonVisual.wheel.angles ?? [])], steer: wagonVisual.pose.steer ?? 0 };
    wagonVisual = null;
    hitch.clear(); hitchSeed = null; hitchSeedForward = null;
    followingWagonFailureLogged = false; horseRecoveredThisFrame = false; nextFollowingWagonSpawnRetryTime = 0;
    hasLastValidGroundState = false;
    spawnFailureLogged = false; cargoFailureLogged = false;
    // Call `changed()` only when something was torn down, because lateUpdate runs this every frame that no wagon
    // trails.
    if (had) changed();
  }
  function resetWheelMotionState() { if (wagonVisual) wagonVisual.wheel = { has: false, prevPos: [...V_ZERO], prevFwd: [...V_FORWARD], angle: 0, angles: wagonVisual.wheel?.angles ?? [], contacts: null }; }
  const wagonActive = () => !!wagonVisual?.pose.active;
  const wagonPosition = () => wagonVisual.pose.position;
  const wagonAxle = () => wagonVisual.pose.axle ?? wagonVisual.pose.position;
  const wagonForward = () => quatForward(wagonVisual.pose.rotation);
  function destroyDeployedWagonPresentation() { if (deployedVisual) { deployedVisual.release(); deployedVisual = null; changed(); } nextDeployedSpawnRetryTime = 0; deployedSpawnFailureLogged = false; }
  function destroyStationaryHorsePresentation() { if (stationaryHorseVisual) { stationaryHorseVisual.release(); stationaryHorseVisual = null; changed(); } nextHorseSpawnRetryTime = 0; horseSpawnFailureLogged = false; horseFollower.resetTransient(); }
  function destroyAllStationaryPresentations() { destroyDeployedWagonPresentation(); destroyStationaryHorsePresentation(); }
  function ownsStationaryHorseActivator(a) { return physicalPersistenceEnabled && !!stationaryHorseVisual && stationaryHorseVisual === a; }

  // `WagonStabled` and `HorseStabled` are set only by `sendTransportAway` and cleared by every setter that resets
  // or places the pair, and by a mount. A stabled wagon is WithPlayer that no door parks.
  function setHorseLoose(wx, wz, heading) { const h = horizontalForward(heading); wagonState.Version = WAGON_SAVE_VERSION; wagonState.HorseMode = HORSE_MODE.LooseStationary; wagonState.HorseWorldX = wx; wagonState.HorseWorldZ = wz; wagonState.HorseHeadingX = h[0]; wagonState.HorseHeadingZ = h[2]; wagonState.HorseStabled = false; changed(); }
  function setHorseFollowing(wx, wz, heading) { const h = horizontalForward(heading); wagonState.Version = WAGON_SAVE_VERSION; wagonState.HorseMode = HORSE_MODE.FollowingPlayer; wagonState.HorseWorldX = wx; wagonState.HorseWorldZ = wz; wagonState.HorseHeadingX = h[0]; wagonState.HorseHeadingZ = h[2]; changed(); }
  const zeroHorse = (mode) => { wagonState.Version = WAGON_SAVE_VERSION; wagonState.HorseMode = mode; wagonState.HorseWorldX = 0; wagonState.HorseWorldZ = 0; wagonState.HorseHeadingX = 0; wagonState.HorseHeadingZ = 1; wagonState.HorseStabled = false; };
  function setHorseWithPlayer() { zeroHorse(HORSE_MODE.WithPlayer); destroyStationaryHorsePresentation(); horseFollower.resetTransient(); changed(); }
  function setHorseHitchedToWagon() { zeroHorse(HORSE_MODE.HitchedToWagon); destroyStationaryHorsePresentation(); horseFollower.resetTransient(); changed(); }
  function setHorseNone() { zeroHorse(HORSE_MODE.None); horseFollower.resetTransient(); changed(); }
  function setHorseLooseAtWagonHitch() {
    const pose = stationaryHorseVisual?.tryGetGroundedPose();
    if (pose) { const [wx, wz] = toWorld(pose.position); setHorseLoose(wx, wz, pose.forward); return; }
    const heading = savedHeading();
    const [hx, hz] = applyLocalOffsetToWorld(wagonState.WorldX, wagonState.WorldZ, heading, HITCHED_HORSE_LOCAL_X, hitchZ(), ratio());
    setHorseLoose(hx, hz, heading);
  }
  function resetWagonState(mode) { wagonState.Version = WAGON_SAVE_VERSION; wagonState.Mode = mode; wagonState.WorldX = 0; wagonState.WorldZ = 0; wagonState.HeadingX = 0; wagonState.HeadingZ = 1; wagonState.InteriorAccessMode = INTERIOR_ACCESS.None; wagonState.InteriorAccessId = 0; wagonState.WagonStabled = false; changed(); }
  function clearInteriorAccess() { wagonState.InteriorAccessMode = INTERIOR_ACCESS.None; wagonState.InteriorAccessId = 0; }
  function clearPendingInteriorState() {
    hasPendingInteriorDeployment = false; hasPendingInteriorHorseDeployment = false; pendingInteriorEntranceEligible = false; pendingInteriorEntranceDistance = Infinity;
    pendingInteriorWorldX = 0; pendingInteriorWorldZ = 0; pendingInteriorHeading = [...V_FORWARD];
    pendingInteriorHorseWorldX = 0; pendingInteriorHorseWorldZ = 0; pendingInteriorHorseHeading = [...V_FORWARD];
    pendingInteriorTransportMode = TRANSPORT.Foot;
  }
  function commitDeployment(wx, wz, heading, deployedHorseMode) {
    const h = horizontalForward(heading);
    wagonState.Version = WAGON_SAVE_VERSION; wagonState.Mode = WAGON_MODE.Deployed; wagonState.WorldX = wx; wagonState.WorldZ = wz; wagonState.HeadingX = h[0]; wagonState.HeadingZ = h[2]; wagonState.HorseMode = deployedHorseMode;
    if (deployedHorseMode !== HORSE_MODE.LooseStationary && deployedHorseMode !== HORSE_MODE.FollowingPlayer) { wagonState.HorseWorldX = 0; wagonState.HorseWorldZ = 0; wagonState.HorseHeadingX = 0; wagonState.HorseHeadingZ = 1; }
    wagonState.WagonStabled = false;
    if (deployedHorseMode !== HORSE_MODE.WithPlayer) wagonState.HorseStabled = false;
    clearPendingInteriorState(); trailingPose.forget(); clearMovingPresentation(); destroyDeployedWagonPresentation();
  }
  function deploymentPoseBehindPlayer() {
    const heading = horizontalForward(deps.player.forward());
    const [wx, wz] = toWorld(vsub(playerPosition(), vscale(heading, deploySetback())));
    return { wx, wz, heading };
  }
  function deployFromBestAvailablePose(horseMode) { const p = trailingPose.dismountPose(deploymentPoseBehindPlayer); commitDeployment(p.wx, p.wz, p.heading, horseMode); }
  function captureHorseBehindPlayerPose() { const heading = horizontalForward(deps.player.forward()); const [wx, wz] = toWorld(vsub(playerPosition(), vscale(heading, HORSE_DISMOUNT_REAR_OFFSET))); return { wx, wz, heading }; }
  function deployHorseBehindPlayer() { const p = captureHorseBehindPlayerPose(); setHorseLoose(p.wx, p.wz, p.heading); }
  function deployWagonBeforeHorseTravel() { if (wagonState.Mode === WAGON_MODE.WithPlayer && tm().hasCart() && !pee().isPlayerInside() && !hasPendingInteriorDeployment && !wagonState.WagonStabled) deployFromBestAvailablePose(HORSE_MODE.WithPlayer); }

  function rememberLastMount(mode) { if (mode === TRANSPORT.Horse) wagonState.LastMount = LAST_MOUNT.Horse; else if (mode === TRANSPORT.Cart) wagonState.LastMount = LAST_MOUNT.Cart; }
  function leaveStable(mode) {
    if (mode === TRANSPORT.Cart) { wagonState.WagonStabled = false; wagonState.HorseStabled = false; }
    else if (mode === TRANSPORT.Horse) wagonState.HorseStabled = false;
  }
  function clearPendingTransportModeRefresh() { hasPendingTransportModeRefresh = false; pendingTransportModeRefresh = TRANSPORT.Foot; pendingTransportModeRefreshTime = 0; }
  function setTransportMode(mode) {
    if (hasPendingTransportModeRefresh && mode !== pendingTransportModeRefresh) clearPendingTransportModeRefresh();
    tm().set(mode);
    hasObservedTransportMode = true; previousTransportMode = mode;
    if (mode === TRANSPORT.Foot || mode === TRANSPORT.Horse) lastValidNonCartTransportMode = mode;
    rememberLastMount(mode);
    leaveStable(mode);
  }
  function rememberValidNonCartMode(mode) { if (mode === TRANSPORT.Foot) { lastValidNonCartTransportMode = TRANSPORT.Foot; return; } if (mode === TRANSPORT.Horse && tm().hasHorse()) lastValidNonCartTransportMode = TRANSPORT.Horse; }
  function rejectTransportChange(fallback, message) {
    let m = fallback;
    if (m === TRANSPORT.Horse && !tm().hasHorse()) m = TRANSPORT.Foot;
    if (m === TRANSPORT.Cart || m === TRANSPORT.Ship) m = (lastValidNonCartTransportMode === TRANSPORT.Horse && tm().hasHorse()) ? TRANSPORT.Horse : TRANSPORT.Foot;
    setTransportMode(m); lastValidNonCartTransportMode = m; say(message);
  }
  function scheduleDirectCartTransportRefresh() { pendingTransportModeRefresh = TRANSPORT.Cart; pendingTransportModeRefreshTime = now() + DIRECT_CART_AUDIO_REFRESH_DELAY; hasPendingTransportModeRefresh = true; }
  function updatePendingTransportModeRefresh() {
    if (!hasPendingTransportModeRefresh) return;
    if (!canRefreshDirectCartTransport(tm().get(), tm().hasCart(), tm().hasHorse(), wagonState.Mode, wagonState.HorseMode)) { clearPendingTransportModeRefresh(); return; }
    if (now() < pendingTransportModeRefreshTime) return;
    const mode = pendingTransportModeRefresh; clearPendingTransportModeRefresh();
    tm().set(mode);
    hasObservedTransportMode = true; previousTransportMode = mode;
  }
  function hitchDeployedWagon() {
    if (refuseShortTeam()) return;
    // Read the grounded pose before the teardown below, which forgets it, so the team drives off from where the
    // wagon stood.
    const gp = deployedVisual?.tryGetGroundedPose();
    const seed = gp ? [...gp.position] : (wagonVisual && wagonActive() ? [...wagonPosition()] : (tryGetRelevantDeployedScene()?.anchor ?? null));
    const seedForward = gp ? [...gp.forward] : (wagonVisual && wagonActive() ? wagonForward() : (tryGetRelevantDeployedScene()?.heading ?? null));
    resetWagonState(WAGON_MODE.WithPlayer);
    wagonState.HorseMode = HORSE_MODE.HitchedToWagon; wagonState.HorseWorldX = 0; wagonState.HorseWorldZ = 0; wagonState.HorseHeadingX = 0; wagonState.HorseHeadingZ = 1;
    clearPendingInteriorState(); trailingPose.forget(); clearMovingPresentation(); destroyAllStationaryPresentations();
    hitchSeed = seed; hitchSeedForward = seed ? seedForward : null;
    setTransportMode(TRANSPORT.Cart); scheduleDirectCartTransportRefresh();
  }
  function beginRidingHorse() { setHorseWithPlayer(); setTransportMode(TRANSPORT.Horse); }

  function tryGetRelevantSavedWorldScene(wx, wz) {
    if (pee().isPlayerInside() || tm().isOnShip() || hasPendingInteriorDeployment || hasPendingInteriorHorseDeployment) return null;
    if (deps.fadeInProgress?.()) return null;
    const sw = deps.streaming;
    if (!sw.isReady() || sw.isInit()) return null;
    const pixel = deps.worldCoordToMapPixel(wx, wz), cur = gps().currentMapPixel();
    if (pixel.x !== cur.x || pixel.y !== cur.y || pixel.x !== sw.mapPixelX() || pixel.y !== sw.mapPixelY()) return null;
    return toScene(wx, wz);
  }
  function tryGetRelevantDeployedScene() {
    if (wagonState.Mode !== WAGON_MODE.Deployed) return null;
    const anchor = tryGetRelevantSavedWorldScene(wagonState.WorldX, wagonState.WorldZ);
    return anchor ? { anchor, heading: savedHeading() } : null;
  }
  function tryGetLiveFollowingWagonPose() {
    if (!isTeamFollowing() || !wagonVisual || !wagonActive() || !hasLastValidGroundState) return null;
    return { position: [...wagonAxle()], heading: horizontalForward(wagonForward()) };
  }
  function tryGetPhysicalWagonScene() {
    if (wagonState.Mode === WAGON_MODE.Deployed) return tryGetRelevantDeployedScene();
    if (!isTeamFollowing()) return null;
    const live = tryGetLiveFollowingWagonPose();
    if (live) return { anchor: live.position, heading: live.heading };
    const anchor = tryGetRelevantSavedWorldScene(wagonState.WorldX, wagonState.WorldZ);
    return anchor ? { anchor, heading: savedHeading() } : null;
  }
  function tryGetFollowingHorseScene() {
    if (pee().isPlayerInside() || tm().isOnShip()) return null;
    if (deps.fadeInProgress?.()) return null;
    const sw = deps.streaming;
    if (!sw.isReady() || sw.isInit()) return null;
    const pose = stationaryHorseVisual?.tryGetGroundedPose();
    if (pose) return { position: pose.position, heading: pose.forward };
    return { position: toScene(wagonState.HorseWorldX, wagonState.HorseWorldZ), heading: savedHorseHeading() };
  }
  function tryGetHorseScenePosition() {
    if (isHorseFollowing()) { const pose = stationaryHorseVisual?.tryGetGroundedPose(); if (pose) return pose.position; }
    if (wagonState.HorseMode === HORSE_MODE.LooseStationary || isHorseFollowing()) return tryGetRelevantSavedWorldScene(wagonState.HorseWorldX, wagonState.HorseWorldZ);
    if (wagonState.HorseMode === HORSE_MODE.HitchedToWagon && wagonState.Mode === WAGON_MODE.Deployed) {
      const d = tryGetRelevantDeployedScene();
      if (!d) return null;
      let pos = d.anchor, heading = d.heading;
      const gp = deployedVisual?.tryGetGroundedPose();
      if (gp) { pos = gp.position; heading = gp.forward; }
      return poleEnd(vadd(vadd(pos, vscale(horizontalRight(heading), HITCHED_HORSE_LOCAL_X)), vscale(heading, hitchZ())), heading).at;
    }
    return null;
  }

  function cacheMovingWorldPose() {
    if (!wagonVisual || !wagonActive() || !hasLastValidGroundState || pee().isPlayerInside()) return;
    trailingPose.store(toWorld(wagonAxle()), horizontalForward(wagonForward()));
  }
  function cacheFollowingWagonWorldPose() {
    if (!wagonVisual || !wagonActive() || !hasLastValidGroundState || !isTeamFollowing()) return;
    [wagonState.WorldX, wagonState.WorldZ] = toWorld(wagonAxle());
    const h = horizontalForward(wagonForward()); wagonState.HeadingX = h[0]; wagonState.HeadingZ = h[2]; wagonState.Version = WAGON_SAVE_VERSION;
  }
  function cacheFollowingHorseWorldPose() {
    if (!isHorseFollowing() || !stationaryHorseVisual) return;
    const pose = stationaryHorseVisual.tryGetGroundedPose();
    if (!pose) return;
    const [wx, wz] = toWorld(pose.position);
    wagonState.Version = WAGON_SAVE_VERSION; wagonState.HorseWorldX = wx; wagonState.HorseWorldZ = wz; wagonState.HorseHeadingX = pose.forward[0]; wagonState.HorseHeadingZ = pose.forward[2];
  }

  function clearPhysicalPersistenceTransientState() {
    destroyAllStationaryPresentations(); clearPendingInteriorState(); clearInteriorAccess(); clearPendingTransportModeRefresh();
    selectWagonOnNextInventoryOpen = false; followingTransitionSuspended = false; fastTravelFollowingSuspended = false; pendingFastTravelHorseRelocation = false;
    travelOptionsWasActive = false; horseFollower.resetTransient(); trailingPose.forget();
  }
  function applyPersistenceResolution(r, force) {
    if (force || wagonState.Mode !== r.WagonMode) resetWagonState(r.WagonMode); else clearInteriorAccess();
    if (force || wagonState.HorseMode !== r.HorseMode) {
      if (r.HorseMode === HORSE_MODE.WithPlayer) setHorseWithPlayer();
      else if (r.HorseMode === HORSE_MODE.HitchedToWagon) setHorseHitchedToWagon();
      else setHorseNone();
    }
    if (tm().get() !== r.TransportMode) { setTransportMode(r.TransportMode); return; }
    hasObservedTransportMode = true; previousTransportMode = r.TransportMode;
  }
  const disabledResolution = () => resolvePersistenceDisabledState(tm().get(), tm().hasCart(), tm().hasHorse());
  function applyPendingPersistenceWork() {
    if (pendingPersistenceSettingTransition) {
      pendingPersistenceSettingTransition = false;
      if (physicalPersistenceEnabled) {
        clearPhysicalPersistenceTransientState();
        const r = resolvePersistenceEnabledState(tm().get(), tm().hasCart(), tm().hasHorse());
        applyPersistenceResolution(r, true);
        if (r.RequiresHorseMessage) say(HCC_TEXT.needHorseWhilePersistence);
      } else { clearPhysicalPersistenceTransientState(); applyPersistenceResolution(disabledResolution(), true); }
      return;
    }
    if (!physicalPersistenceEnabled && pendingPersistenceNormalization) {
      pendingPersistenceNormalization = false;
      applyPersistenceResolution(disabledResolution(), true);
      clearPhysicalPersistenceTransientState();
      log.info?.('[TrailingWagon] loaded state normalized for disabled physical persistence.');
    }
  }

  function reconcileCartOwnership(hasCart, hasHorse) {
    if (!physicalPersistenceEnabled) {
      const r = disabledResolution();
      if (wagonState.Mode === r.WagonMode && wagonState.HorseMode === r.HorseMode && tm().get() === r.TransportMode) return;
      applyPersistenceResolution(r, false); return;
    }
    if (hasCart) { if (wagonState.Mode === WAGON_MODE.None) resetWagonState(WAGON_MODE.WithPlayer); return; }
    if (wagonState.Mode === WAGON_MODE.None) {
      if (wagonState.HorseMode === HORSE_MODE.HitchedToWagon) { if (hasHorse) setHorseWithPlayer(); else setHorseNone(); }
      if (tm().get() === TRANSPORT.Cart) setTransportMode(TRANSPORT.Foot);
      return;
    }
    if (hasHorse && isTeamFollowing()) { cacheFollowingHorseWorldPose(); wagonState.HorseMode = HORSE_MODE.FollowingPlayer; horseFollower.resetTransient(); }
    else if (hasHorse && wagonState.HorseMode === HORSE_MODE.HitchedToWagon) { if (wagonState.Mode === WAGON_MODE.Deployed) setHorseLooseAtWagonHitch(); else setHorseWithPlayer(); }
    else if (!hasHorse) setHorseNone();
    resetWagonState(WAGON_MODE.None); clearPendingInteriorState(); trailingPose.forget(); clearMovingPresentation(); destroyDeployedWagonPresentation();
    if (tm().get() === TRANSPORT.Cart) setTransportMode(TRANSPORT.Foot);
  }
  function reconcileHorseOwnership(hasHorse) {
    wagonState.HorseName = reconcileHorseNameOwnership(wagonState.HorseName, hasHorse);
    if (!physicalPersistenceEnabled) return;
    if (hasHorse) { if (wagonState.HorseMode === HORSE_MODE.None) setHorseWithPlayer(); return; }
    if (isTeamFollowing()) {
      const live = tryGetLiveFollowingWagonPose();
      if (live) { const [wx, wz] = toWorld(live.position); commitDeployment(wx, wz, live.heading, HORSE_MODE.None); }
      else { wagonState.Mode = WAGON_MODE.Deployed; wagonState.HorseMode = HORSE_MODE.None; clearMovingPresentation(); }
    }
    if (wagonState.HorseMode !== HORSE_MODE.None) setHorseNone();
    destroyStationaryHorsePresentation();
    const mode = tm().get();
    if (mode === TRANSPORT.Horse || mode === TRANSPORT.Cart) {
      if (mode === TRANSPORT.Cart && wagonState.Mode === WAGON_MODE.WithPlayer && !pee().isPlayerInside()) deployFromBestAvailablePose(HORSE_MODE.None);
      setTransportMode(TRANSPORT.Foot);
    }
  }

  function tryPrepareCartMount() {
    if (isTeamFollowing() && canMountNearbyDeployedCart()) { hitchDeployedWagon(); return true; }
    if (!(tm().hasCart() && tm().hasHorse() && wagonState.Mode === WAGON_MODE.WithPlayer && (wagonState.HorseMode === HORSE_MODE.WithPlayer || wagonState.HorseMode === HORSE_MODE.HitchedToWagon))) return false;
    wagonState.HorseMode = HORSE_MODE.HitchedToWagon; wagonState.HorseWorldX = 0; wagonState.HorseWorldZ = 0; wagonState.HorseHeadingX = 0; wagonState.HorseHeadingZ = 1;
    return isPhysicalTransportStateValid(true, true, wagonState.Mode, wagonState.HorseMode, TRANSPORT.Cart);
  }
  function tryPrepareHorseMount(maxDistance) {
    if (!tm().hasHorse()) return false;
    if (isTeamFollowing()) return false;
    if (tm().get() === TRANSPORT.Cart && wagonState.Mode === WAGON_MODE.WithPlayer && wagonState.HorseMode === HORSE_MODE.HitchedToWagon) return true;
    if (wagonState.HorseMode === HORSE_MODE.WithPlayer) return true;
    if (pee().isPlayerInside() || tm().isOnShip()) return false;
    const pos = tryGetHorseScenePosition();
    if (!pos) return false;
    if (!isWithinHorizontalDistance(playerPosition(), pos, maxDistance)) return false;
    setHorseWithPlayer(); destroyStationaryHorsePresentation();
    return true;
  }
  function canMountNearbyDeployedCart() {
    if (!ready()) return false;
    if (wagonState.Mode !== WAGON_MODE.Deployed && wagonState.Mode !== WAGON_MODE.FollowingPlayer) return false;
    if (pee().isPlayerInside() || tm().isOnShip()) return false;
    const w = tryGetPhysicalWagonScene();
    if (!w) return false;
    let wagonPos = w.anchor ?? w.position;
    const gp = deployedVisual?.tryGetGroundedPose();
    if (gp) wagonPos = gp.position;
    let horsePos;
    if (wagonState.HorseMode === HORSE_MODE.WithPlayer && tm().get() === TRANSPORT.Horse) horsePos = playerPosition();
    else { horsePos = tryGetHorseScenePosition(); if (!horsePos) return false; }
    const way = gp?.forward ?? w.heading;
    return isPhysicalTeamWithinMountDistances(playerPosition(), wagonPos, horsePos, (to) => nearestOnWagon(wagonPos, way, to));
  }
  function isHorseCloseEnoughToHitch() {
    const horsePos = tryGetHorseScenePosition();
    if (!horsePos) return false;
    const d = tryGetRelevantDeployedScene();
    if (!d) return false;
    let wagonPos = d.anchor;
    const gp = deployedVisual?.tryGetGroundedPose();
    if (gp) wagonPos = gp.position;
    return isWithinHorizontalDistance(horsePos, nearestOnWagon(wagonPos, gp?.forward ?? d.heading, horsePos), HORSE_WAGON_HITCH_DISTANCE);
  }
  function detachFollowingTeamAndRideHorse() {
    const live = tryGetLiveFollowingWagonPose();
    if (!live) return false;
    const [wx, wz] = toWorld(live.position);
    commitDeployment(wx, wz, live.heading, HORSE_MODE.WithPlayer);
    beginRidingHorse();
    return true;
  }
  const allow = () => ({ allowed: true, denialMessage: '' });
  const deny = (m) => ({ allowed: false, denialMessage: m ?? '' });
  const success = () => ({ handled: true, succeeded: true, denialMessage: '' });
  const denied = (m) => ({ handled: true, succeeded: false, denialMessage: m ?? '' });
  const unsupported = (m) => ({ handled: false, succeeded: false, denialMessage: m ?? '' });
  const denyTransportAction = (m) => { say(m); return denied(m); };
  function canUseHorseTransport() {
    if (!ready() || !tm().hasHorse()) return deny(HCC_TEXT.doNotOwnHorse);
    if (!physicalPersistenceEnabled) return allow();
    if (wagonState.HorseMode === HORSE_MODE.WithPlayer) return allow();
    if (tm().get() === TRANSPORT.Cart && wagonState.Mode === WAGON_MODE.WithPlayer && wagonState.HorseMode === HORSE_MODE.HitchedToWagon) return allow();
    const pos = tryGetHorseScenePosition();
    const near = !!pos && isWithinHorizontalDistance(playerPosition(), pos, HORSE_MENU_MOUNT_DISTANCE);
    return near ? allow() : deny(`${horseSubject(true)} is not close enough.`);
  }
  function tryUseHorseTransport() {
    if (!ready()) return unsupported(HCC_TEXT.notReady);
    if (!physicalPersistenceEnabled) { if (tm().hasHorse()) { setTransportMode(TRANSPORT.Horse); return success(); } return denyTransportAction(HCC_TEXT.doNotOwnHorse); }
    if (isTeamFollowing()) {
      if (!canMountHorseFromTransportWindow()) return denyTransportAction(`${horseSubject(true)} is not close enough.`);
      if (!detachFollowingTeamAndRideHorse()) return denyTransportAction(HCC_TEXT.wagonNotReadyToUnhitch);
      return success();
    }
    if (tm().get() === TRANSPORT.Horse) { deployWagonBeforeHorseTravel(); setTransportMode(TRANSPORT.Horse); return success(); }
    if (tm().get() === TRANSPORT.Cart && wagonState.Mode === WAGON_MODE.WithPlayer && wagonState.HorseMode === HORSE_MODE.HitchedToWagon) { deployFromBestAvailablePose(HORSE_MODE.WithPlayer); setTransportMode(TRANSPORT.Horse); return success(); }
    if (!tryPrepareHorseMount(HORSE_MENU_MOUNT_DISTANCE)) return denyTransportAction(`${horseSubject(true)} is not close enough.`);
    deployWagonBeforeHorseTravel(); beginRidingHorse();
    return success();
  }
  function canUseCartTransport() {
    if (!ready() || !tm().hasCart()) return deny(HCC_TEXT.doNotOwnWagon);
    if (teamShort()) return deny(teamShort());
    if (!physicalPersistenceEnabled) return allow();
    if (!tm().hasHorse()) return deny(HCC_TEXT.needHorseToPull);
    if (wagonState.Mode === WAGON_MODE.WithPlayer && (wagonState.HorseMode === HORSE_MODE.WithPlayer || wagonState.HorseMode === HORSE_MODE.HitchedToWagon)) return allow();
    if (!canMountNearbyDeployedCart()) return deny(HCC_TEXT.wagonAndHorseMustBeWithYou);
    return allow();
  }
  function tryUseCartTransport() {
    if (!ready()) return unsupported(HCC_TEXT.notReady);
    if (teamShort()) return denyTransportAction(teamShort());
    if (!physicalPersistenceEnabled) { if (tm().hasCart()) { setTransportMode(TRANSPORT.Cart); return success(); } return denyTransportAction(HCC_TEXT.doNotOwnWagon); }
    if (canMountNearbyDeployedCart()) { hitchDeployedWagon(); return success(); }
    if (!tryPrepareCartMount()) return denyTransportAction(HCC_TEXT.wagonAndHorseMustBeWithYou);
    setTransportMode(TRANSPORT.Cart);
    return success();
  }
  function canUseTransport(mode) { if (mode === TRANSPORT.Horse) return canUseHorseTransport(); if (mode === TRANSPORT.Cart) return canUseCartTransport(); return deny(HCC_TEXT.onlyHorseAndCart); }
  function tryUseTransport(mode) { if (mode === TRANSPORT.Horse) return tryUseHorseTransport(); if (mode === TRANSPORT.Cart) return tryUseCartTransport(); return unsupported(HCC_TEXT.onlyHorseAndCart); }
  const canMountHorseFromTransportWindow = () => canUseTransport(TRANSPORT.Horse).allowed;
  const canUseCartFromTransportWindow = () => canUseTransport(TRANSPORT.Cart).allowed;

  function observeTransportMode() {
    if (!physicalPersistenceEnabled) {
      const r = disabledResolution();
      if (tm().get() !== r.TransportMode) setTransportMode(r.TransportMode);
      clearPendingTransportModeRefresh(); hasObservedTransportMode = true; previousTransportMode = r.TransportMode; rememberLastMount(r.TransportMode);
      if (r.TransportMode !== TRANSPORT.Cart) rememberValidNonCartMode(r.TransportMode);
      return;
    }
    const mode = tm().get();
    if (!hasObservedTransportMode) {
      hasObservedTransportMode = true; previousTransportMode = mode; rememberLastMount(mode);
      if (mode !== TRANSPORT.Cart) rememberValidNonCartMode(mode);
      if (mode === TRANSPORT.Cart && teamShort()) { rejectTransportChange(TRANSPORT.Foot, teamShort()); return; }
      if (mode === TRANSPORT.Cart && !tryPrepareCartMount()) { rejectTransportChange(TRANSPORT.Foot, HCC_TEXT.wagonNotWithYou); return; }
      if (mode === TRANSPORT.Horse && !tryPrepareHorseMount(HORSE_MENU_MOUNT_DISTANCE)) { rejectTransportChange(TRANSPORT.Foot, `${horseSubject(true)} is not close enough.`); return; }
      leaveStable(mode);
      if (mode === TRANSPORT.Horse) deployWagonBeforeHorseTravel();
      return;
    }
    if (mode === previousTransportMode) return;
    const prev = previousTransportMode;
    if (mode === TRANSPORT.Cart && teamShort()) { rejectTransportChange(prev, teamShort()); return; }
    if (mode === TRANSPORT.Cart && !tryPrepareCartMount()) { rejectTransportChange(prev, HCC_TEXT.wagonNotWithYou); return; }
    if (mode === TRANSPORT.Horse && prev !== TRANSPORT.Cart && !tryPrepareHorseMount(HORSE_MENU_MOUNT_DISTANCE)) { rejectTransportChange(prev, `${horseSubject(true)} is not close enough.`); return; }
    leaveStable(mode);
    if (mode === TRANSPORT.Horse && prev !== TRANSPORT.Cart) deployWagonBeforeHorseTravel();
    if (prev === TRANSPORT.Cart && wagonState.Mode === WAGON_MODE.WithPlayer && !pee().isPlayerInside() && !hasPendingInteriorDeployment) {
      const hm = mode === TRANSPORT.Horse ? HORSE_MODE.WithPlayer : (tm().hasHorse() ? HORSE_MODE.HitchedToWagon : HORSE_MODE.None);
      deployFromBestAvailablePose(hm);
    } else if (prev === TRANSPORT.Horse && mode === TRANSPORT.Foot && wagonState.HorseMode === HORSE_MODE.WithPlayer && !pee().isPlayerInside() && !hasPendingInteriorHorseDeployment) {
      deployHorseBehindPlayer();
    }
    if (mode !== TRANSPORT.Cart) rememberValidNonCartMode(mode);
    rememberLastMount(mode); previousTransportMode = mode;
  }

  function handleConfiguredHotkeys() {
    if (!deps.actionPressed) return;
    if (deps.actionPressed(HCC_MOUNT_ACTION)) { handleQuickMountOrDismount(); return; }
    if (deps.actionPressed(HCC_SUMMON_ACTION)) { handleSummonTransport(); }
  }
  function handleQuickMountOrDismount() {
    noteFirstUse('horse');
    const mode = tm().get();
    // ObserveTransportMode picks up this direct set on the next frame.
    if (mode === TRANSPORT.Horse || mode === TRANSPORT.Cart) { tm().set(TRANSPORT.Foot); return; }
    if (mode !== TRANSPORT.Foot) { say(HCC_TEXT.quickMountUnavailable); return; }
    if (pee().isPlayerInside() || tm().isOnShip()) { say(HCC_TEXT.mountOutdoorsOnly); return; }
    const target = resolveQuickMountMode(wagonState.LastMount, tm().hasHorse(), drivableCart());
    if (target === TRANSPORT.Foot) { say(HCC_TEXT.doNotOwnHorseOrWagon); return; }
    tryUseTransport(target);
  }
  function handleSummonTransport() { say(summonTransport().text); }
  function summonTransport() {
    if (pee().isPlayerInside() || tm().isOnShip()) return { ok: false, text: HCC_TEXT.summonOutdoorsOnly };
    const hasHorse = tm().hasHorse(), hasCart = tm().hasCart();
    if (!hasHorse && !hasCart) return { ok: false, text: HCC_TEXT.doNotOwnHorseOrWagon };
    if (!physicalPersistenceEnabled) return { ok: false, text: HCC_TEXT.alreadyWithYou };
    const mode = tm().get();
    if (mode === TRANSPORT.Cart || (mode === TRANSPORT.Horse && !hasCart)) return { ok: false, text: HCC_TEXT.alreadyWithYou };
    const fwd = horizontalForward(deps.player.forward());
    if (hasCart) {
      const [wx, wz] = toWorld(vsub(playerPosition(), vscale(fwd, deploySetback())));
      const hm = hasHorse ? (mode === TRANSPORT.Horse ? HORSE_MODE.WithPlayer : HORSE_MODE.HitchedToWagon) : HORSE_MODE.None;
      commitDeployment(wx, wz, fwd, hm); destroyStationaryHorsePresentation();
    } else { deployHorseBehindPlayer(); destroyStationaryHorsePresentation(); }
    return { ok: true, text: hasCart && hasHorse ? HCC_TEXT.summonedBoth : hasCart ? HCC_TEXT.summonedWagon : HCC_TEXT.summonedHorse };
  }
  const transportOut = () => wagonState.Mode === WAGON_MODE.Deployed || wagonState.Mode === WAGON_MODE.FollowingPlayer
    || wagonState.HorseMode === HORSE_MODE.LooseStationary || wagonState.HorseMode === HORSE_MODE.FollowingPlayer
    || (tm().get() === TRANSPORT.Foot && ((tm().hasCart() && wagonState.Mode === WAGON_MODE.WithPlayer && !wagonState.WagonStabled)
      || (tm().hasHorse() && wagonState.HorseMode === HORSE_MODE.WithPlayer && !wagonState.HorseStabled)));
  function sendTransportAway() {
    if (pee().isPlayerInside() || tm().isOnShip()) return { ok: false, text: HCC_TEXT.sendAwayOutdoorsOnly };
    const hasHorse = tm().hasHorse(), hasCart = tm().hasCart();
    if (!hasHorse && !hasCart) return { ok: false, text: HCC_TEXT.doNotOwnHorseOrWagon };
    if (!physicalPersistenceEnabled) return { ok: false, text: HCC_TEXT.notInTheWorld };
    if (tm().get() !== TRANSPORT.Foot) return { ok: false, text: HCC_TEXT.sendAwayDismount };
    if (!transportOut()) return { ok: false, text: HCC_TEXT.alreadyAway };
    const r = resolvePersistenceEnabledState(TRANSPORT.Foot, hasCart, hasHorse);
    resetWagonState(r.WagonMode);
    zeroHorse(r.HorseMode);
    wagonState.WagonStabled = hasCart; wagonState.HorseStabled = hasHorse;
    clearPendingInteriorState(); trailingPose.forget(); followingTransitionSuspended = false;
    clearMovingPresentation(); destroyAllStationaryPresentations(); horseFollower.resetTransient();
    changed();
    return { ok: true, text: hasCart && hasHorse ? HCC_TEXT.sentBoth : hasCart ? HCC_TEXT.sentWagon : HCC_TEXT.sentHorse };
  }
  function adoptYeet(from, to) {
    if (!physicalPersistenceEnabled || wagonState.Mode !== WAGON_MODE.Deployed) return false;
    const at = thrownTo([wagonState.WorldX, wagonState.WorldZ], from, to);
    if (!at) return false;
    const dx = at[0] - wagonState.WorldX, dz = at[1] - wagonState.WorldZ;
    const hm = wagonState.HorseMode;
    const loose = hm === HORSE_MODE.LooseStationary && horseThrownWith([wagonState.WorldX, wagonState.WorldZ], [wagonState.HorseWorldX, wagonState.HorseWorldZ]);
    const hx = wagonState.HorseWorldX + dx, hz = wagonState.HorseWorldZ + dz, hh = savedHorseHeading();
    commitDeployment(castWorldCoordinate(at[0]), castWorldCoordinate(at[1]), savedHeading(), hm);
    if (loose) setHorseLoose(castWorldCoordinate(hx), castWorldCoordinate(hz), hh);
    clearInteriorAccess();
    destroyAllStationaryPresentations();
    changed();
    return true;
  }
  function renameHorse(input) {
    if (!tm().hasHorse()) return null;
    wagonState.HorseName = resolveHorseNameInput(horseName(), input);
    changed();
    return horseName();
  }
  function stableView() {
    const at = (wx, wz) => { const s = tryGetRelevantSavedWorldScene(wx, wz); return s ? Math.round(horizontalDistance(playerPosition(), s)) : null; };
    const st = wagonState;
    return {
      persistence: physicalPersistenceEnabled, transport: tm().get(), hasHorse: tm().hasHorse(), hasCart: tm().hasCart(),
      horseName: horseName(), wagonMode: st.Mode, horseMode: st.HorseMode, wagonStabled: !!st.WagonStabled, horseStabled: !!st.HorseStabled,
      wagonAt: st.Mode === WAGON_MODE.Deployed ? at(st.WorldX, st.WorldZ) : null,
      horseAt: st.HorseMode === HORSE_MODE.LooseStationary ? at(st.HorseWorldX, st.HorseWorldZ) : null,
      out: transportOut(), inside: !!pee().isPlayerInside(), onShip: !!tm().isOnShip(),
      kg: deps.entity?.wagonWeight?.() ?? 0, limit: deps.entity?.wagonKgLimit?.() ?? 0,
    };
  }

  function tryGetWagonScenePositionForEntrance() {
    let wx, wz;
    if (hasPendingInteriorDeployment) { wx = pendingInteriorWorldX; wz = pendingInteriorWorldZ; }
    else if (wagonState.Mode === WAGON_MODE.Deployed) {
      const gp = deployedVisual?.tryGetGroundedPose();
      if (gp) return gp.position;
      wx = wagonState.WorldX; wz = wagonState.WorldZ;
    } else if (isTeamFollowing()) {
      const live = tryGetLiveFollowingWagonPose();
      if (live) return live.position;
      wx = wagonState.WorldX; wz = wagonState.WorldZ;
    } else return null;
    return toScene(wx, wz);
  }
  function handlePreTransition(args) {
    if (!args || (args.type !== 'ToBuildingInterior' && args.type !== 'ToDungeonInterior')) return;
    if (!physicalPersistenceEnabled) { clearPhysicalPersistenceTransientState(); return; }
    if (!ready()) return;
    if (isHorseFollowing()) { cacheFollowingHorseWorldPose(); followingTransitionSuspended = true; horseFollower.resetTransient(); }
    clearPendingInteriorState();
    pendingInteriorTransportMode = resolveInteriorEntryMode(tm().get(), hasObservedTransportMode, previousTransportMode, wagonState.Mode === WAGON_MODE.WithPlayer, tm().hasCart(), tm().hasHorse(), wagonState.HorseMode);
    leaveStable(pendingInteriorTransportMode);
    if (wagonState.Mode === WAGON_MODE.WithPlayer && tm().hasCart() && !wagonState.WagonStabled) {
      const p = trailingPose.captureBestAvailableDeploymentPose(deploymentPoseBehindPlayer);
      pendingInteriorWorldX = p.wx; pendingInteriorWorldZ = p.wz; pendingInteriorHeading = p.heading; hasPendingInteriorDeployment = true;
    }
    if (!wagonState.HorseStabled && shouldDeployIndependentHorseForInterior(hasPendingInteriorDeployment, pendingInteriorTransportMode, wagonState.HorseMode, tm().hasHorse())) {
      const p = captureHorseBehindPlayerPose();
      pendingInteriorHorseWorldX = p.wx; pendingInteriorHorseWorldZ = p.wz; pendingInteriorHorseHeading = p.heading; hasPendingInteriorHorseDeployment = true;
    }
    const wagonScenePos = tryGetWagonScenePositionForEntrance();
    if (!wagonScenePos) return;
    let door = args.door ?? playerPosition();
    if (args.type === 'ToDungeonInterior' && !isUsableDungeonEntranceDoorPosition(playerPosition(), door)) door = playerPosition();
    pendingInteriorEntranceDistance = horizontalDistance(wagonScenePos, door);
    pendingInteriorEntranceEligible = isWithinInteriorEntranceDistance(pendingInteriorEntranceDistance, interiorWagonAccessDistance);
  }
  function setInteriorAccessFromTransition(args) {
    if (args && args.type === 'ToBuildingInterior') { wagonState.InteriorAccessMode = INTERIOR_ACCESS.Building; wagonState.InteriorAccessId = args.buildingKey | 0; return; }
    if (args && args.type === 'ToDungeonInterior' && args.dungeonId != null) { wagonState.InteriorAccessMode = INTERIOR_ACCESS.Dungeon; wagonState.InteriorAccessId = args.dungeonId | 0; return; }
    clearInteriorAccess();
  }
  function handleSuccessfulInteriorTransition(args) {
    if (!physicalPersistenceEnabled) { clearPhysicalPersistenceTransientState(); return; }
    if (isTeamFollowing()) clearMovingPresentation();
    destroyAllStationaryPresentations();
    const hadWagon = hasPendingInteriorDeployment, hadHorse = hasPendingInteriorHorseDeployment, eligible = pendingInteriorEntranceEligible;
    const wx = pendingInteriorWorldX, wz = pendingInteriorWorldZ, heading = pendingInteriorHeading;
    const hx = pendingInteriorHorseWorldX, hz = pendingInteriorHorseWorldZ, hheading = pendingInteriorHorseHeading;
    const entryMode = pendingInteriorTransportMode;
    if (hadWagon) {
      const hm = (entryMode === TRANSPORT.Cart && wagonState.HorseMode !== HORSE_MODE.None) ? HORSE_MODE.HitchedToWagon : wagonState.HorseMode;
      commitDeployment(wx, wz, heading, hm);
    }
    if (hadHorse && !isCartInteriorDeployment(hadWagon, entryMode)) setHorseLoose(hx, hz, hheading);
    if (eligible && (wagonState.Mode === WAGON_MODE.Deployed || isTeamFollowing())) setInteriorAccessFromTransition(args); else clearInteriorAccess();
    clearPendingInteriorState();
    if (ready()) { hasObservedTransportMode = true; previousTransportMode = tm().get(); }
  }
  function handleFailedTransition(args) {
    if (!physicalPersistenceEnabled) { clearPhysicalPersistenceTransientState(); return; }
    if (!hasPendingInteriorDeployment && !hasPendingInteriorHorseDeployment && !pendingInteriorEntranceEligible && !followingTransitionSuspended) return;
    if (args && args.type !== 'ToBuildingInterior' && args.type !== 'ToDungeonInterior') return;
    const hadWagon = hasPendingInteriorDeployment, hadHorse = hasPendingInteriorHorseDeployment, entryMode = pendingInteriorTransportMode;
    clearPendingInteriorState();
    if (isHorseFollowing()) { followingTransitionSuspended = false; horseFollower.resetTransient(); }
    if (hadWagon) resetWagonState(WAGON_MODE.WithPlayer);
    if (hadHorse) setHorseWithPlayer();
    if (ready() && !pee().isPlayerInside()) {
      if (entryMode === TRANSPORT.Cart && tm().hasCart() && tm().hasHorse() && !teamShort()) { wagonState.HorseMode = HORSE_MODE.HitchedToWagon; wagonState.HorseWorldX = 0; wagonState.HorseWorldZ = 0; wagonState.HorseHeadingX = 0; wagonState.HorseHeadingZ = 1; setTransportMode(TRANSPORT.Cart); }
      else if (entryMode === TRANSPORT.Horse && tm().hasHorse()) { setHorseWithPlayer(); setTransportMode(TRANSPORT.Horse); }
    }
    log.info?.('[TrailingWagon] failed interior transition rolled back pending physical deployments.');
  }
  function handleExteriorTransition() {
    if (!physicalPersistenceEnabled) { clearPhysicalPersistenceTransientState(); return; }
    clearInteriorAccess(); clearPendingInteriorState();
    if (isHorseFollowing()) { followingTransitionSuspended = false; horseFollower.resetTransient(); }
  }
  function isWagonAtPlayerMapPixel() { const mp = deps.worldCoordToMapPixel(wagonState.WorldX, wagonState.WorldZ), cur = gps().currentMapPixel(); return mp.x === cur.x && mp.y === cur.y; }
  function validateInteriorAccessContext() {
    if (!physicalPersistenceEnabled) { clearInteriorAccess(); return; }
    if (wagonState.Mode !== WAGON_MODE.Deployed && !isTeamFollowing()) { clearInteriorAccess(); return; }
    if (!pee().isPlayerInside()) { clearInteriorAccess(); return; }
    if (interiorAccessRequiresMapPixelMatch(wagonState.InteriorAccessMode) && !isWagonAtPlayerMapPixel()) { clearInteriorAccess(); return; }
    let valid = false;
    if (pee().isPlayerInsideBuilding() && wagonState.InteriorAccessMode === INTERIOR_ACCESS.Building) valid = (pee().buildingKey() | 0) === wagonState.InteriorAccessId;
    else if (pee().isPlayerInsideDungeon() && wagonState.InteriorAccessMode === INTERIOR_ACCESS.Dungeon && pee().dungeonId() != null) valid = (pee().dungeonId() | 0) === wagonState.InteriorAccessId;
    if (!valid) clearInteriorAccess();
  }

  function canAccessWagonInventoryCore() {
    let denial = HCC_TEXT.notAccessibleFromHere;
    if (!ready() || !tm().hasCart()) return { ok: false, denial };
    if (!physicalPersistenceEnabled) return { ok: isWagonInventoryAccessible(false, true, false), denial };
    if (wagonState.Mode === WAGON_MODE.None) return { ok: false, denial };
    if (!pee().isPlayerInside()) {
      if (wagonState.Mode === WAGON_MODE.WithPlayer) return { ok: true, denial };
      const w = tryGetPhysicalWagonScene();
      if (w) {
        let pos = w.anchor;
        const gp = deployedVisual?.tryGetGroundedPose();
        if (gp) pos = gp.position;
        else if (isTeamFollowing() && wagonVisual && wagonActive()) pos = wagonPosition();
        if (isWithinHorizontalDistance(playerPosition(), nearestOnWagon(pos, gp?.forward ?? w.heading, playerPosition()), WAGON_INVENTORY_DISTANCE)) return { ok: true, denial };
      }
      return { ok: false, denial: HCC_TEXT.within5m };
    }
    if (pee().isPlayerInsideDungeon()) return { ok: false, denial: HCC_TEXT.dungeonExitAccess };
    if (wagonState.Mode !== WAGON_MODE.Deployed && !isTeamFollowing()) return { ok: false, denial };
    if (pee().isPlayerInsideBuilding() && wagonState.InteriorAccessMode === INTERIOR_ACCESS.Building && (pee().buildingKey() | 0) === wagonState.InteriorAccessId && isWagonAtPlayerMapPixel()) return { ok: true, denial };
    return { ok: false, denial };
  }
  function canAccessWagonFromDungeonExitCore() {
    const denial = HCC_TEXT.tooFarFromEntrance;
    if (!ready()) return { ok: false, denial };
    const entranceMatch = (wagonState.Mode === WAGON_MODE.Deployed || isTeamFollowing()) && wagonState.InteriorAccessMode === INTERIOR_ACCESS.Dungeon && pee().dungeonId() != null && (pee().dungeonId() | 0) === wagonState.InteriorAccessId;
    return { ok: isDungeonExitWagonAccessAllowed(physicalPersistenceEnabled, tm().hasCart(), pee().isPlayerInsideDungeon(), entranceMatch), denial };
  }
  function canAccessWagonStorage(ctx) {
    let r;
    if (ctx === STORAGE_CONTEXT.NormalInventory || ctx === STORAGE_CONTEXT.Trade) r = canAccessWagonInventoryCore();
    else if (ctx === STORAGE_CONTEXT.DungeonExitSelection) r = canAccessWagonFromDungeonExitCore();
    else return deny(HCC_TEXT.unknownStorageContext);
    return r.ok ? allow() : deny(r.denial);
  }
  const canAccessWagonInventory = () => canAccessWagonStorage(STORAGE_CONTEXT.NormalInventory);
  const canAccessWagonFromDungeonExit = () => canAccessWagonStorage(STORAGE_CONTEXT.DungeonExitSelection);
  function consumeWagonSelectionRequest() { const r = selectWagonOnNextInventoryOpen; selectWagonOnNextInventoryOpen = false; return r; }
  function openWagonInventoryFromPhysicalActivation() { selectWagonOnNextInventoryOpen = true; deps.openInventoryWithWagon?.(); }
  function openWagonCargo() {
    const a = canAccessWagonInventory();
    if (!a.allowed) { say(a.denialMessage); return false; }
    openWagonInventoryFromPhysicalActivation();
    return true;
  }

  function refreshHorseNameInputState() { if (horseNameInputBox && !horseNameInputBox.isOpen()) horseNameInputBox = null; }
  function openHorseNamePrompt() {
    refreshHorseNameInputState();
    if (horseNameInputBox) return;
    const box = deps.openNamePrompt?.({
      label: HCC_TEXT.nameYourHorse, value: horseName(), maxCharacters: HORSE_NAME_MAX,
      onSubmit: (input) => {
        if (horseNameInputBox === box) horseNameInputBox = null;
        const resolved = resolveHorseNameInput(horseName(), input);
        if (!ready() || !tm().hasHorse()) return;
        wagonState.HorseName = resolved; changed();
      },
    });
    horseNameInputBox = box ?? null;
  }
  function closeHorseNameInput() { if (!horseNameInputBox) return; const box = horseNameInputBox; horseNameInputBox = null; box.close?.(); }

  function handleDeployedWagonActivation(distance, mode = null) {
    if (!physicalPersistenceEnabled) return false;
    if (!ready() || wagonState.Mode !== WAGON_MODE.Deployed || !deployedVisual) return false;
    if (distance > ACTIVATION_REACH) { tooFar(); return true; }
    if (!tm().hasCart()) { say(HCC_TEXT.noLongerOwnWagon); return true; }
    if (pee().isPlayerInside()) return true;
    if ((mode ?? deps.activateMode()) === ACTIVATE_MODE.Steal) { openWagonInventoryFromPhysicalActivation(); return true; }
    if (!tm().hasHorse()) { say(HCC_TEXT.needHorseToPull); return true; }
    if (isHorseFollowing()) {
      if (!isHorseCloseEnoughToHitch()) { say(`${horseSubject(true)} is too far from the wagon to hitch.`); return true; }
      hitchDeployedWagon(); return true;
    }
    if (wagonState.HorseMode === HORSE_MODE.LooseStationary) { say(`Ride ${horseObject()} to the wagon first.`); return true; }
    if (wagonState.HorseMode === HORSE_MODE.WithPlayer && tm().get() !== TRANSPORT.Horse) { say(`Mount ${horseObject()} first.`); return true; }
    hitchDeployedWagon();
    return true;
  }
  function handleFollowingWagonActivation(distance, mode = null) {
    if (!physicalPersistenceEnabled) return false;
    if (!ready() || !isTeamFollowing() || !wagonVisual?.interaction) return false;
    if (distance > ACTIVATION_REACH) { tooFar(); return true; }
    if (!tm().hasCart() || !tm().hasHorse()) { say(HCC_TEXT.noLongerOwnTeam); return true; }
    if ((mode ?? deps.activateMode()) === ACTIVATE_MODE.Steal) { openWagonInventoryFromPhysicalActivation(); return true; }
    if (!canMountNearbyDeployedCart()) { say(`${horseAndWagonSubject(true)} must both be close enough.`); return true; }
    hitchDeployedWagon();
    return true;
  }
  function handleStationaryHorseActivation(distance, mode = null) {
    if (!physicalPersistenceEnabled) return false;
    if (!ready() || !stationaryHorseVisual) return false;
    if (distance > ACTIVATION_REACH) { tooFar(); return true; }
    if (!tm().hasHorse()) { say(HCC_TEXT.noLongerOwnHorse); return true; }
    if (pee().isPlayerInside()) return true;
    const activate = mode ?? deps.activateMode();
    if (isHorseNamingMode(activate)) { openHorseNamePrompt(); return true; }
    const decision = resolveHorseActivation(wagonState.Mode, wagonState.HorseMode, drivableCart(), isHorseCommandMode(activate));
    switch (decision) {
      case HORSE_ACTIVATION.Follow: startFollowingHorse(); return true;
      case HORSE_ACTIVATION.Wait: stopFollowingHorse(); return true;
      case HORSE_ACTIVATION.FollowHitchedTeam: startFollowingHitchedTeam(); return true;
      case HORSE_ACTIVATION.MountHitchedTeam: hitchDeployedWagon(); return true;
      case HORSE_ACTIVATION.Ride: beginRidingHorse(); return true;
      default: say(`This is ${horseObject()}.`); return true;
    }
  }
  function actionRows(target) {
    if (!physicalPersistenceEnabled || !ready()) return [];
    return hccActionRows(target, { wagonMode: wagonState.Mode, horseMode: wagonState.HorseMode, ownsCart: drivableCart() });
  }
  function startFollowingHorse() {
    const pose = stationaryHorseVisual?.tryGetGroundedPose();
    if (!pose) { say(`${horseSubject(true)} is not ready to move yet.`); return; }
    const [wx, wz] = toWorld(pose.position);
    setHorseFollowing(wx, wz, pose.forward);
    const m = movement(); horseFollower.begin(phys, pose.position, pose.forward, m.position, m.forward);
    say(`${horseSubject(true)} follows you.`);
  }
  function stopFollowingHorse() {
    if (isTeamFollowing()) { stopFollowingHitchedTeam(); return; }
    const pose = stationaryHorseVisual?.tryGetGroundedPose();
    if (!pose) { say(`${horseSubject(true)} is not ready to wait yet.`); return; }
    const [wx, wz] = toWorld(pose.position);
    setHorseLoose(wx, wz, pose.forward);
    horseFollower.resetTransient();
    stationaryHorseVisual.tick(pose.position, pose.forward, null, now());
    say(`${horseSubject(true)} waits here.`);
  }
  function startFollowingHitchedTeam() {
    if (refuseShortTeam()) return;
    const hp = stationaryHorseVisual?.tryGetGroundedPose(), wp = deployedVisual?.tryGetGroundedPose();
    if (!hp || !wp) { say(`${horseAndWagonSubject(true)} are not ready to move yet.`); return; }
    [wagonState.WorldX, wagonState.WorldZ] = toWorld(wp.position);
    [wagonState.HorseWorldX, wagonState.HorseWorldZ] = toWorld(hp.position);
    const wf = horizontalForward(wp.forward), hf = horizontalForward(hp.forward);
    wagonState.Version = WAGON_SAVE_VERSION; wagonState.Mode = WAGON_MODE.FollowingPlayer; wagonState.HeadingX = wf[0]; wagonState.HeadingZ = wf[2];
    wagonState.HorseMode = HORSE_MODE.HitchedToWagon; wagonState.HorseHeadingX = hf[0]; wagonState.HorseHeadingZ = hf[2];
    clearInteriorAccess(); destroyAllStationaryPresentations();
    hitch.clear();
    say(`${horseAndWagonSubject(true)} follow you.`);
  }
  function stopFollowingHitchedTeam() {
    const live = tryGetLiveFollowingWagonPose();
    if (!live) { say(HCC_TEXT.wagonNotReadyToWait); return; }
    const [wx, wz] = toWorld(live.position);
    commitDeployment(wx, wz, live.heading, HORSE_MODE.HitchedToWagon);
    horseFollower.resetTransient();
    say(`${horseAndWagonSubject(true)} wait here.`);
  }

  function callTeamToFollow() {
    if (wagonState.Mode === WAGON_MODE.Deployed && wagonState.HorseMode === HORSE_MODE.HitchedToWagon) wagonState.Mode = WAGON_MODE.FollowingPlayer;
    else if (wagonState.HorseMode === HORSE_MODE.LooseStationary) wagonState.HorseMode = HORSE_MODE.FollowingPlayer;
    else return;
    wagonState.Version = WAGON_SAVE_VERSION;
    clearInteriorAccess(); destroyAllStationaryPresentations(); changed();
  }
  let forceNextJourney = false;
  function forceNextFastTravel() { forceNextJourney = true; }
  function handlePreFastTravel({ force = forceNextJourney } = {}) {
    if (!physicalPersistenceEnabled) { fastTravelFollowingSuspended = false; pendingFastTravelHorseRelocation = false; return; }
    if (force) callTeamToFollow();
    if (!horseTravelsWithFastTravel(wagonState.Mode, wagonState.HorseMode, true)) return;
    if (!followingTransportFastTravels && !force) { convertFollowingTransportToWaitAtDeparture(); return; }
    const isTeam = isTeamFollowing();
    if (ready()) { cacheFollowingHorseWorldPose(); if (isTeam) cacheFollowingWagonWorldPose(); }
    fastTravelFollowingSuspended = true; pendingFastTravelHorseRelocation = false; horseFollower.resetTransient(); destroyStationaryHorsePresentation();
    if (isTeam) clearMovingPresentation();
  }
  function handlePostFastTravel({ force = forceNextJourney } = {}) {
    forceNextJourney = false;
    if (!physicalPersistenceEnabled) { fastTravelFollowingSuspended = false; pendingFastTravelHorseRelocation = false; return; }
    if (!horseTravelsWithFastTravel(wagonState.Mode, wagonState.HorseMode, followingTransportFastTravels || force)) { fastTravelFollowingSuspended = false; pendingFastTravelHorseRelocation = false; return; }
    fastTravelFollowingSuspended = true; pendingFastTravelHorseRelocation = true;
  }
  function wagonGoesOnJourney() {
    if (wagonState.Mode === WAGON_MODE.WithPlayer) return !wagonState.WagonStabled;
    return physicalPersistenceEnabled && (followingTransportFastTravels || forceNextJourney) && isTeamFollowing();
  }
  function convertFollowingTransportToWaitAtDeparture() {
    const isTeam = isTeamFollowing();
    if (ready()) { if (isTeam) cacheFollowingWagonWorldPose(); else cacheFollowingHorseWorldPose(); }
    const r = resolveFastTravelDepartureModes(wagonState.Mode, wagonState.HorseMode, false);
    wagonState.Version = WAGON_SAVE_VERSION; wagonState.Mode = r.wagonMode; wagonState.HorseMode = r.horseMode;
    if (isTeam) { wagonState.HorseWorldX = 0; wagonState.HorseWorldZ = 0; wagonState.HorseHeadingX = 0; wagonState.HorseHeadingZ = 1; }
    clearInteriorAccess(); followingTransitionSuspended = false; fastTravelFollowingSuspended = false; pendingFastTravelHorseRelocation = false; trailingPose.forget();
    horseFollower.resetTransient(); destroyStationaryHorsePresentation();
    if (isTeam) clearMovingPresentation();
  }
  function tryCompleteFastTravelHorseRelocation() {
    if (!pendingFastTravelHorseRelocation) return;
    if (!isHorseFollowing()) { pendingFastTravelHorseRelocation = false; fastTravelFollowingSuspended = false; return; }
    if (pee().isPlayerInside() || tm().isOnShip() || !deps.streaming.isReady() || deps.streaming.isInit()) return;
    const m = movement(); const fwd = horizontalForward(m.forward);
    const grounded = tryFindGround(phys, vsub(m.position, vscale(fwd, horseFollowDistance)));
    if (!grounded) return;
    const [hx, hz] = toWorld(grounded);
    const wasTeam = isTeamFollowing();
    wagonState.HorseWorldX = hx; wagonState.HorseWorldZ = hz; wagonState.HorseHeadingX = fwd[0]; wagonState.HorseHeadingZ = fwd[2];
    if (!wasTeam) wagonState.HorseMode = HORSE_MODE.FollowingPlayer;
    else {
      const wg = tryFindGround(phys, vsub(grounded, vscale(fwd, hitchSetback())));
      // The flags stay set, so this retries next frame with the horse fields already written.
      if (!wg) return;
      [wagonState.WorldX, wagonState.WorldZ] = toWorld(wg);
      wagonState.HeadingX = fwd[0]; wagonState.HeadingZ = fwd[2];
    }
    wagonState.Version = WAGON_SAVE_VERSION; pendingFastTravelHorseRelocation = false; fastTravelFollowingSuspended = false; destroyStationaryHorsePresentation();
  }
  function updateTravelOptionsCompatibility() {
    if (travelOptionsQueryFailed) return;
    let isActive;
    try { isActive = deps.travelOptionsActive?.(); } catch (e) { travelOptionsQueryFailed = true; log.warn?.(`[TrailingWagon] Travel Options compatibility was disabled after its active-travel query failed: ${e?.message ?? e}`); return; }
    if (isActive === null || isActive === undefined) return;
    if (typeof isActive !== 'boolean') { travelOptionsQueryFailed = true; log.warn?.('[TrailingWagon] Travel Options compatibility was disabled because isTravelActive did not return a Boolean response.'); return; }
    const should = shouldReconcileAfterTravelOptions(travelOptionsWasActive, isActive, physicalPersistenceEnabled, wagonState.Mode, wagonState.HorseMode);
    travelOptionsWasActive = isActive;
    if (!should) return;
    fastTravelFollowingSuspended = true; pendingFastTravelHorseRelocation = true; horseFollower.resetTransient(); destroyStationaryHorsePresentation();
    if (isTeamFollowing()) clearMovingPresentation();
  }

  function ensureHorseTextures() { return !!deps.presentation?.horseArt?.ensureStationary?.(); }
  function ensureHorseWalkTextures() { deps.presentation?.horseArt?.ensureWalk?.(); }
  function shouldShowMovingWagon() {
    if (!showTrailingWagon) return false;
    const teamOk = physicalPersistenceEnabled ? (wagonState.HorseMode === HORSE_MODE.HitchedToWagon && tm().hasHorse()) : tm().hasCart();
    if (wagonState.Mode !== WAGON_MODE.WithPlayer || !teamOk || tm().get() !== TRANSPORT.Cart || tm().isOnShip() || pee().isPlayerInside()) return false;
    return !deps.fadeInProgress?.();
  }
  function applyHitchedPose(hitchPoint, forward, dt, seed = null, seedForward = null) {
    const next = hitchedPoseStep(phys, wagonVisual.pose, hitchPoint, forward, hitchZ(), dt, seed, wagonVisual.parts?.bogie ?? null, seedForward);
    wagonVisual.pose = next;
    if (next.hasLastValid) hasLastValidGroundState = true; else resetWheelMotionState();
  }
  // The single mod angle is still updated because the wire carries it; the drawn wheels use the per-wheel angles.
  function updateWheelAnimation() {
    if (!wagonVisual || !wagonActive() || !wagonVisual.parts) { resetWheelMotionState(); return; }
    const pos = wagonPosition(), fwd = wagonForward();
    const w = wagonVisual.wheel;
    const contacts = wheelContacts(wagonVisual.parts, pos, wagonVisual.pose.rotation, wagonVisual.pose.steer ?? 0);
    w.angles = rolledAngles(w.angles, w.contacts, contacts, wagonVisual.parts); w.contacts = contacts;
    if (!w.has) { w.prevPos = [...pos]; w.prevFwd = [...fwd]; w.has = true; return; }
    const deg = wheelRotationDegrees(signedLongitudinalTravel(vsub(pos, w.prevPos), w.prevFwd, fwd), wagonVisual.parts.wheelRadius);
    w.angle = wrapWheelAngle(w.angle + deg);
    w.prevPos = [...pos]; w.prevFwd = [...fwd];
  }
  function updateCargoFullness(weight, limit) { if (wagonVisual) wagonVisual.cargoTier = cargoTier(weight, limit); }
  function relayHitch() {
    hasLastValidGroundState = false; trailingPose.forget(); resetWheelMotionState();
    if (wagonVisual) { wagonVisual.pose.active = false; wagonVisual.pose.hasLastValid = false; }
  }
  function updateMovingPresentation(weight, limit, dt) {
    const m = movement();
    // The seed is cleared whether or not a visual exists, so a stale seed never applies later.
    const seed = wagonVisual ? null : hitchSeed;
    const seedForward = wagonVisual ? null : hitchSeedForward;
    hitchSeed = null; hitchSeedForward = null;
    if (!wagonVisual && !createWagonVisual()) return;
    refreshWagonParts();
    updateCargoFullness(weight, limit);
    if (hitch.observe(m.position, hitchJumpReach(dt))) relayHitch();
    applyHitchedPose(m.position, m.forward, dt, seed, seedForward);
    updateWheelAnimation();
    cacheMovingWorldPose();
  }
  function updateFollowingWagonPresentation(weight, limit, dt) {
    if (followingTransitionSuspended || fastTravelFollowingSuspended || pendingFastTravelHorseRelocation || pee().isPlayerInside() || tm().isOnShip() || !stationaryHorseVisual) { clearMovingPresentation(); return; }
    const horse = stationaryHorseVisual.tryGetGroundedPose();
    if (!horse) { clearMovingPresentation(); return; }
    let seed = null, seedForward = null;
    if (!wagonVisual) {
      seed = tryGetRelevantSavedWorldScene(wagonState.WorldX, wagonState.WorldZ);
      seedForward = savedHeading();
      if (!seed) { clearMovingPresentation(); return; }
      if (now() < nextFollowingWagonSpawnRetryTime) return;
      if (!createWagonVisual()) {
        nextFollowingWagonSpawnRetryTime = now() + DEPLOYED_SPAWN_RETRY_SECONDS;
        if (!followingWagonFailureLogged) { followingWagonFailureLogged = true; log.error?.('[TrailingWagon] hitched-team wagon presentation failed; persistent follow intent was retained.'); }
        return;
      }
      wagonVisual.interaction = true;
      hasLastValidGroundState = false; hitch.clear();
      followingWagonFailureLogged = false; nextFollowingWagonSpawnRetryTime = 0;
    }
    refreshWagonParts();
    updateCargoFullness(weight, limit);
    const jumped = hitch.observe(horse.position, hitchJumpReach(dt));
    if (!seed && (jumped || (!horseFollower.isCombatEvading && horseRecoveredThisFrame))) {
      seed = wagonActive() ? [...wagonPosition()] : null;
      seedForward = seed ? wagonForward() : null;
      wagonVisual.pose.active = false; wagonVisual.pose.hasLastValid = false; hasLastValidGroundState = false; resetWheelMotionState();
    }
    applyHitchedPose(horse.position, horse.forward, dt, seed, seedForward);
    updateWheelAnimation();
    cacheFollowingWagonWorldPose();
  }
  function updateDeployedPresentation(weight, limit) {
    const d = tryGetRelevantDeployedScene();
    if (!d) { destroyDeployedWagonPresentation(); return; }
    if (deployedVisual && !deployedVisual.isAlive) { deployedVisual.release(); deployedVisual = null; }
    if (!deployedVisual) {
      if (now() < nextDeployedSpawnRetryTime) return;
      try { deployedVisual = new DeployedWagonVisual(deps.presentation?.wagonParts?.() ?? null, d.anchor, d.heading, weight, limit, phys, now()); changed(); }
      catch (e) {
        deployedVisual = null; nextDeployedSpawnRetryTime = now() + DEPLOYED_SPAWN_RETRY_SECONDS;
        if (!deployedSpawnFailureLogged) { deployedSpawnFailureLogged = true; log.error?.(`[TrailingWagon] could not create the deployed wagon presentation: ${e?.message ?? e}`); }
        return;
      }
      deployedSpawnFailureLogged = false; nextDeployedSpawnRetryTime = 0;
    }
    refreshWagonParts();
    deployedVisual.tick(d.anchor, d.heading, weight, limit, now());
  }
  function updateStationaryHorsePresentation(dt) {
    if (pendingFastTravelHorseRelocation) tryCompleteFastTravelHorseRelocation();
    let pos, fwd, deployedWagon = null;
    if (isHorseFollowing()) {
      if (followingTransitionSuspended || fastTravelFollowingSuspended || pendingFastTravelHorseRelocation) { destroyStationaryHorsePresentation(); return; }
      const s = tryGetFollowingHorseScene();
      if (!s) { destroyStationaryHorsePresentation(); return; }
      pos = s.position; fwd = s.heading;
    } else if (wagonState.HorseMode === HORSE_MODE.LooseStationary) {
      pos = tryGetRelevantSavedWorldScene(wagonState.HorseWorldX, wagonState.HorseWorldZ);
      if (!pos) { destroyStationaryHorsePresentation(); return; }
      fwd = savedHorseHeading();
    } else if (wagonState.HorseMode === HORSE_MODE.HitchedToWagon && wagonState.Mode === WAGON_MODE.Deployed) {
      const d = tryGetRelevantDeployedScene();
      if (!d) { destroyStationaryHorsePresentation(); return; }
      pos = d.anchor; fwd = d.heading;
      const gp = deployedVisual?.tryGetGroundedPose();
      if (gp) { pos = gp.position; fwd = gp.forward; deployedWagon = deployedVisual; }
      pos = vadd(vadd(pos, vscale(horizontalRight(fwd), HITCHED_HORSE_LOCAL_X)), vscale(fwd, hitchZ()));
      ({ at: pos, forward: fwd } = poleEnd(pos, fwd));
    } else { destroyStationaryHorsePresentation(); return; }
    if (!ensureHorseTextures()) { destroyStationaryHorsePresentation(); return; }
    ensureHorseWalkTextures();
    if (stationaryHorseVisual && !stationaryHorseVisual.isAlive) { stationaryHorseVisual.release(); stationaryHorseVisual = null; }
    if (!stationaryHorseVisual) {
      if (now() < nextHorseSpawnRetryTime) return;
      try { stationaryHorseVisual = new StationaryHorseVisual(true, pos, fwd, deployedWagon, phys, now()); changed(); }
      catch (e) {
        stationaryHorseVisual = null; nextHorseSpawnRetryTime = now() + DEPLOYED_SPAWN_RETRY_SECONDS;
        if (!horseSpawnFailureLogged) { horseSpawnFailureLogged = true; log.error?.(`[TrailingWagon] could not create the stationary horse presentation: ${e?.message ?? e}`); }
        return;
      }
      horseSpawnFailureLogged = false; nextHorseSpawnRetryTime = 0;
    }
    if (isHorseFollowing()) { updateFollowingHorse(pos, fwd, dt); }
    else stationaryHorseVisual.tick(pos, fwd, deployedWagon, now());
    stationaryHorseVisual.stepWalk(dt, !!deps.presentation?.horseArt?.hasWalk?.());
  }
  function updateFollowingHorse(savedScenePosition, savedHeading, dt) {
    horseRecoveredThisFrame = false;
    if (!stationaryHorseVisual.isInteractive) { stationaryHorseVisual.tick(savedScenePosition, savedHeading, null, now()); return; }
    const m = movement();
    if (!horseFollower.isInitialized) {
      const pose = stationaryHorseVisual.tryGetGroundedPose();
      if (!pose) return;
      horseFollower.begin(phys, pose.position, pose.forward, m.position, m.forward);
    }
    if (!horseFollower.tick(phys, m, stationaryHorseVisual, horseFollowDistance, avoidCombat, travelOptionsWasActive, dt)) return;
    cacheFollowingHorseWorldPose();
    if (horseFollower.recoveredThisTick) horseRecoveredThisFrame = true;
  }

  function lateUpdate(dt) {
    // Forget the cached pose here: `ready()` is also false through teleports and fast travel, and
    // ObserveTransportMode runs before the presentation, so a stale pose would park the wagon far behind.
    if (!ready()) { clearPendingTransportModeRefresh(); clearMovingPresentation(); trailingPose.forget(); destroyAllStationaryPresentations(); return; }
    refreshHorseNameInputState();
    applyPendingPersistenceWork();
    const ownsCart = tm().hasCart(), ownsHorse = tm().hasHorse();
    reconcileCartOwnership(ownsCart, ownsHorse); reconcileHorseOwnership(ownsHorse); reconcileTeam();
    observeTransportMode(); updatePendingTransportModeRefresh(); handleConfiguredHotkeys();
    validateInteriorAccessContext(); updateTravelOptionsCompatibility();
    const weight = deps.entity?.wagonWeight?.() ?? 0, limit = deps.entity?.wagonKgLimit?.() ?? 750;
    if (isTeamFollowing()) {
      destroyDeployedWagonPresentation();
      updateStationaryHorsePresentation(dt);
      updateFollowingWagonPresentation(weight, limit, dt);
      return;
    }
    if (wagonState.Mode === WAGON_MODE.Deployed) { clearMovingPresentation(); updateDeployedPresentation(weight, limit); }
    else {
      destroyDeployedWagonPresentation();
      // A wagon driven but not drawn travels with the player, so its last drawn pose is no place to park it. A
      // dismount keeps the pose for the next ObserveTransportMode.
      if (!shouldShowMovingWagon()) { clearMovingPresentation(); if (tm().get() === TRANSPORT.Cart) trailingPose.forget(); }
      else updateMovingPresentation(weight, limit, dt);
    }
    if (physicalPersistenceEnabled) updateStationaryHorsePresentation(dt); else destroyStationaryHorsePresentation();
  }

  function clearAllTransientState() {
    closeHorseNameInput(); clearMovingPresentation(); destroyAllStationaryPresentations(); clearPendingInteriorState();
    trailingPose.forget(); hasObservedTransportMode = false; previousTransportMode = TRANSPORT.Foot; lastValidNonCartTransportMode = TRANSPORT.Foot;
    clearPendingTransportModeRefresh(); selectWagonOnNextInventoryOpen = false; followingTransitionSuspended = false; fastTravelFollowingSuspended = false;
    pendingFastTravelHorseRelocation = false; travelOptionsWasActive = false; horseFollower.resetTransient();
    restWheels = null;
  }
  // Every scene-space point the machine holds is shifted here when the floating origin moves. The save record is in
  // natives and does not move.
  function rebase(d) {
    if (wagonVisual) {
      const p = wagonVisual.pose;
      p.position = vadd(p.position, d); p.lastValidPosition = vadd(p.lastValidPosition, d);
      if (p.hitch) p.hitch = vadd(p.hitch, d);
      if (p.axle) p.axle = vadd(p.axle, d);
      if (wagonVisual.wheel.has) wagonVisual.wheel.prevPos = vadd(wagonVisual.wheel.prevPos, d);
      for (const c of wagonVisual.wheel.contacts ?? []) c.p = vadd(c.p, d);
    }
    deployedVisual?.offset(d); stationaryHorseVisual?.offset(d);
    hitch.offset(d); if (hitchSeed) hitchSeed = vadd(hitchSeed, d); horseFollower.offset(d);
  }
  /**
   * The mod grounds a parked wagon and a waiting horse once, but the ground can be rebuilt under them, so they are
   * grounded again on the next frame.
   * @param {(position: number[]) => boolean} [within]
   */
  function regroundStanding(within = () => true) {
    if (deployedVisual?.isAlive && within(deployedVisual.position)) { deployedVisual.grounded = false; deployedVisual.nextGroundRetryTime = 0; }
    if (stationaryHorseVisual?.isAlive && !isHorseFollowing() && within(stationaryHorseVisual.position)) stationaryHorseVisual.hasRequestedPose = false;
  }
  function handleStartLoad() { wagonState = newSaveData(); clearAllTransientState(); pendingPersistenceNormalization = !physicalPersistenceEnabled; }
  function handleNewGame() { wagonState = newSaveData(); clearAllTransientState(); pendingPersistenceNormalization = !physicalPersistenceEnabled; }
  function getSaveData() {
    if (!physicalPersistenceEnabled && ready()) applyPersistenceResolution(disabledResolution(), true);
    return copySaveData(wagonState);
  }
  function restoreSaveData(data, { elsewhere = false } = {}) {
    clearAllTransientState();
    wagonState = normalizeSaveData(data, ratio());
    pendingPersistenceNormalization = !physicalPersistenceEnabled;
    changed();
    if (elsewhere) callTeamToLanding();
  }
  // A load that lands away from its save calls a waiting or following horse and a hitched team to the player, as
  // the online respawn does. A wagon parked alone stays.
  function callTeamToLanding() {
    forceNextFastTravel();
    handlePreFastTravel();
    handlePostFastTravel();
  }
  // Turning the mod off drops all transient state but keeps the record. Turned on again, it observes the current
  // transport state instead of rejecting changes made meanwhile.
  function suspend() { clearAllTransientState(); }

  return {
    lateUpdate, rebase, regroundStanding, handleSettingsChanged,
    handleStartLoad, handleNewGame, getSaveData, restoreSaveData, newSaveData, suspend,
    handlePreTransition, handleSuccessfulInteriorTransition, handleFailedTransition, handleExteriorTransition,
    handlePreFastTravel, handlePostFastTravel, forceNextFastTravel, wagonGoesOnJourney,
    canUseTransport, tryUseTransport, canMountHorseFromTransportWindow, canUseCartFromTransportWindow,
    handleHorseTransportButton: () => { tryUseTransport(TRANSPORT.Horse); }, handleCartTransportButton: () => { tryUseTransport(TRANSPORT.Cart); },
    handleQuickMountOrDismount, handleSummonTransport,
    summonTransport, sendTransportAway, renameHorse, stableView,
    adoptYeet,
    canAccessWagonStorage, canAccessWagonInventory, canAccessWagonFromDungeonExit, consumeWagonSelectionRequest, openWagonCargo,
    handleDeployedWagonActivation, handleFollowingWagonActivation, handleStationaryHorseActivation, openHorseNamePrompt, actionRows,
    ownsStationaryHorseActivator,
    get physicalPersistenceEnabled() { return physicalPersistenceEnabled; },
    get horseName() { return horseName(); }, get hasHorseName() { return hasHorseName(); }, get horseTargetLabel() { return horseTargetLabel(wagonState.HorseName); },
    get horseFollowDistance() { return horseFollowDistance; }, get showTrailingWagon() { return showTrailingWagon; },
    horseSubject, horseAndWagonSubject,
    view: () => ({
      state: wagonState, moving: wagonVisual, deployed: deployedVisual, horse: stationaryHorseVisual,
      teamFollowing: isTeamFollowing(), horseFollowing: isHorseFollowing(), persistence: physicalPersistenceEnabled,
      rest: restWheels,
    }),
    _state: () => wagonState, _follower: () => horseFollower, _hitch: () => hitch,
  };
}
