// @ts-check

/** @type {Readonly<Record<string, number>>} */
export const WAGON_MODE = Object.freeze({ None: 0, WithPlayer: 1, Deployed: 2, FollowingPlayer: 3 });
/** @type {Readonly<Record<string, number>>} */
export const HORSE_MODE = Object.freeze({ HitchedToWagon: 0, LooseStationary: 1, WithPlayer: 2, None: 3, FollowingPlayer: 4 });
/** @type {Readonly<Record<string, number>>} */
export const INTERIOR_ACCESS = Object.freeze({ None: 0, Building: 1, Dungeon: 2 });
/** @type {Readonly<Record<string, number>>} */
export const LAST_MOUNT = Object.freeze({ None: 0, Horse: 1, Cart: 2 });
/** @type {Readonly<Record<string, number>>} */
export const STORAGE_CONTEXT = Object.freeze({ NormalInventory: 0, Trade: 1, DungeonExitSelection: 2 });
/** @type {Readonly<Record<string, number>>} */
export const HORSE_ACTIVATION = Object.freeze({ None: 0, Ride: 1, Follow: 2, Wait: 3, FollowHitchedTeam: 4, MountHitchedTeam: 5 });
/** @type {Readonly<Record<string, string>>} */
export const TRANSPORT = Object.freeze({ Foot: 'Foot', Horse: 'Horse', Cart: 'Cart', Ship: 'Ship' });
/** @type {Readonly<Record<string, string>>} */
export const ACTIVATE_MODE = Object.freeze({ Steal: 'steal', Grab: 'grab', Info: 'info', Talk: 'dialogue' });

export const MATHF_EPSILON = 1.401298e-45;

export const LOG_PREFIX = '[TrailingWagon]';
export const WAGON_MODEL_ID = 41214;
export const HORSE_NAME_MAX = 31;
export const WAGON_FOLLOW_DISTANCE = 2.5;
// Meters past its own hitch that a freshly placed wagon sits behind the player, so the pole tip and team clear the
// player's capsule.
export const DEPLOY_CLEARANCE = 1.0;
export const SAMPLE_DISTANCE = 0.08;
export const RETAINED_TRAIL_DISTANCE = 7.0;
export const TELEPORT_DISTANCE = 20.0;
export const MAXIMUM_VISUAL_DISTANCE = 30.0;
export const GROUND_RAY_HEIGHT = 8.0;
export const GROUND_RAY_DISTANCE = 40.0;
export const NORMAL_GROUND_OFFSET = 1.0;
export const POSITION_SMOOTHING_RATE = 12.0;
export const ROTATION_SMOOTHING_RATE = 10.0;
export const WHEEL_ROTATION_SIGN = 1.0;
export const DEPLOYED_SPAWN_RETRY_SECONDS = 2.0;
export const DIRECT_CART_AUDIO_REFRESH_DELAY = 0.25;
export const HORSE_MENU_MOUNT_DISTANCE = 3.5;
export const HORSE_WAGON_HITCH_DISTANCE = 3.5;
export const FOLLOWING_TEAM_EMERGENCY_SEPARATION = 15.0;
export const WAGON_INVENTORY_DISTANCE = 5.0;
export const DEFAULT_HORSE_FOLLOW_DISTANCE = 3.0, MIN_HORSE_FOLLOW_DISTANCE = 2.0, MAX_HORSE_FOLLOW_DISTANCE = 8.0;
export const DEFAULT_INTERIOR_ACCESS_DISTANCE = 50.0, MIN_INTERIOR_ACCESS_DISTANCE = 10.0, MAX_INTERIOR_ACCESS_DISTANCE = 100.0;
export const HORSE_DISMOUNT_REAR_OFFSET = 1.0;
export const HITCHED_HORSE_LOCAL_X = 0.0, HITCHED_HORSE_LOCAL_Z = 3.1;
export const LEGACY_LOOSE_HORSE_LOCAL_X = 3.0, LEGACY_LOOSE_HORSE_LOCAL_Z = 0.0;
export const ACTIVATION_REACH = 3.2;
export const DUNGEON_DOOR_USABLE_RADIUS = 3.7;
export const WAGON_SAVE_VERSION = 7;
export const TOO_FAR_SECONDS = 1.5;
export const HORSE_BOX_CENTER = Object.freeze([0, 1.1, 0]);
export const HORSE_BOX_SIZE = Object.freeze([1.1, 2.2, 2.6]);
export const HORSE_SPRITE_WIDTH = 121, HORSE_SPRITE_HEIGHT = 94, HORSE_WALK_SPRITE_HEIGHT = 95;
export const HORSE_VIEWS = 5, HORSE_WALK_FRAMES = 8;
export const STATIONARY_PROBE_HEIGHT = 1000, STATIONARY_PROBE_DISTANCE = 3000, GROUND_RETRY_SECONDS = 1.0;
export const POSE_POSITION_TOLERANCE_SQ = 1e-4, POSE_ANGLE_TOLERANCE_DEG = 0.1;

export const V_FORWARD = Object.freeze([0, 0, 1]);
export const V_ZERO = Object.freeze([0, 0, 0]);
const sqrMag = (v) => v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
const normalized = (v) => { const l = Math.sqrt(sqrMag(v)); return l > 0 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 0]; };
export const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vscale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vlerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const vdist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export { sqrMag as vsqr, normalized as vnorm };

export function horizontalForward(v) {
  const p = [v[0], 0, v[2]];
  if (sqrMag(p) <= MATHF_EPSILON) return [...V_FORWARD];
  return normalized(p);
}
export function horizontalRight(forward) {
  const f = horizontalForward(forward);
  return [f[2], 0, -f[0]];
}
export const horizontalDistance = (a, b) => Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[2] - b[2]) * (a[2] - b[2]));
export function isWithinHorizontalDistance(a, b, max) {
  if (!(max >= 0)) return false;
  return !(horizontalDistance(a, b) > max) && Number.isFinite(horizontalDistance(a, b));
}
export function normalizeHeading(h) {
  if (!Number.isFinite(h[0]) || !Number.isFinite(h[2])) return [...V_FORWARD];
  if (sqrMag(h) <= MATHF_EPSILON) return [...V_FORWARD];
  return normalized(h);
}
export function angleBetween(a, b) {
  const d = Math.sqrt(sqrMag(a) * sqrMag(b));
  if (!(d > 1e-15)) return 0;
  return Math.acos(Math.max(-1, Math.min(1, vdot(a, b) / d))) * 180 / Math.PI;
}

export function castWorldCoordinate(v) {
  if (Number.isNaN(v)) throw new RangeError('value');
  if (v > 2147483647) return 2147483647;
  if (v < -2147483648) return -2147483648;
  return Math.trunc(v);
}
const ratioGuard = (r) => { if (!(r > 0) || !Number.isFinite(r)) throw new RangeError('sceneMapRatio'); };
export function sceneToWorld(scenePos, playerScenePos, playerWorldX, playerWorldZ, ratio) {
  ratioGuard(ratio);
  const dx = (scenePos[0] - playerScenePos[0]) * ratio, dz = (scenePos[2] - playerScenePos[2]) * ratio;
  return [castWorldCoordinate(playerWorldX + dx), castWorldCoordinate(playerWorldZ + dz)];
}
export function worldToScene(worldX, worldZ, playerWorldX, playerWorldZ, playerScenePos, ratio) {
  ratioGuard(ratio);
  return [playerScenePos[0] + (worldX - playerWorldX) / ratio, playerScenePos[2] + (worldZ - playerWorldZ) / ratio];
}
export function applyLocalOffsetToWorld(originX, originZ, forward, localX, localZ, ratio) {
  const f = horizontalForward(forward);
  const r = horizontalRight(f);
  const off = [r[0] * localX + f[0] * localZ, 0, r[2] * localX + f[2] * localZ];
  return [castWorldCoordinate(originX + off[0] * ratio), castWorldCoordinate(originZ + off[2] * ratio)];
}

// The save's `modData` key for the wagon record; src/world/wild/wildDropLaw.js `wildCartRecordOf` reads the record
// under the same name.
export const HCC_VENDOR = 'horse-cart-and-cargo';

export function newSaveData() {
  return {
    Version: WAGON_SAVE_VERSION, Mode: WAGON_MODE.None, WorldX: 0, WorldZ: 0, HeadingX: 0, HeadingZ: 1,
    HorseMode: HORSE_MODE.None, HorseWorldX: 0, HorseWorldZ: 0, HorseHeadingX: 0, HorseHeadingZ: 1,
    InteriorAccessMode: INTERIOR_ACCESS.None, InteriorAccessId: 0, HorseName: '', LastMount: LAST_MOUNT.None,
    WagonStabled: false, HorseStabled: false,
  };
}
const SAVE_FIELDS = Object.freeze(Object.keys(newSaveData()));
export function copySaveData(d) {
  const out = newSaveData();
  for (const k of SAVE_FIELDS) if (d && d[k] !== undefined) out[k] = d[k];
  return out;
}
const isEnumValue = (table, v) => Number.isInteger(v) && Object.values(table).includes(v);

export function normalizeHorseName(s) {
  if (typeof s !== 'string') return '';
  const t = s.trim();
  return t.length > HORSE_NAME_MAX ? t.slice(0, HORSE_NAME_MAX) : t;
}
export function resolveHorseNameInput(current, input) {
  const n = normalizeHorseName(input);
  return n ? n : normalizeHorseName(current);
}
export const reconcileHorseNameOwnership = (name, hasHorse) => (hasHorse ? normalizeHorseName(name) : '');

export function normalizeSaveData(source, ratio) {
  const d = source ? copySaveData(source) : newSaveData();
  const version = d.Version;
  d.HorseName = normalizeHorseName(d.HorseName);
  if (!isEnumValue(WAGON_MODE, d.Mode)) d.Mode = WAGON_MODE.None;
  if (!isEnumValue(HORSE_MODE, d.HorseMode)) d.HorseMode = HORSE_MODE.None;
  if (!isEnumValue(LAST_MOUNT, d.LastMount)) d.LastMount = LAST_MOUNT.None;
  if (!isEnumValue(INTERIOR_ACCESS, d.InteriorAccessMode)) { d.InteriorAccessMode = INTERIOR_ACCESS.None; d.InteriorAccessId = 0; }
  const heading = normalizeHeading([Number(d.HeadingX) || 0, 0, Number(d.HeadingZ) || 0]);
  d.HeadingX = heading[0]; d.HeadingZ = heading[2];
  if (!(version >= 2)) {
    d.HorseMode = d.Mode === WAGON_MODE.Deployed ? HORSE_MODE.HitchedToWagon : HORSE_MODE.WithPlayer;
  } else if (version === 2) {
    if (d.HorseMode === HORSE_MODE.LooseStationary) {
      const [hx, hz] = applyLocalOffsetToWorld(d.WorldX | 0, d.WorldZ | 0, heading, LEGACY_LOOSE_HORSE_LOCAL_X, LEGACY_LOOSE_HORSE_LOCAL_Z, ratio);
      d.HorseWorldX = hx; d.HorseWorldZ = hz; d.HorseHeadingX = heading[0]; d.HorseHeadingZ = heading[2];
    } else if (d.Mode !== WAGON_MODE.Deployed) d.HorseMode = HORSE_MODE.WithPlayer;
  }
  const hh = normalizeHeading([Number(d.HorseHeadingX) || 0, 0, Number(d.HorseHeadingZ) || 0]);
  d.HorseHeadingX = hh[0]; d.HorseHeadingZ = hh[2];
  if (d.Mode !== WAGON_MODE.Deployed && d.Mode !== WAGON_MODE.FollowingPlayer) { d.InteriorAccessMode = INTERIOR_ACCESS.None; d.InteriorAccessId = 0; }
  if (d.Mode === WAGON_MODE.FollowingPlayer && d.HorseMode !== HORSE_MODE.HitchedToWagon) d.Mode = WAGON_MODE.Deployed;
  for (const k of ['WorldX', 'WorldZ', 'HorseWorldX', 'HorseWorldZ', 'InteriorAccessId']) d[k] = Number.isFinite(d[k]) ? Math.trunc(d[k]) : 0;
  d.WagonStabled = d.WagonStabled === true; d.HorseStabled = d.HorseStabled === true;
  d.Version = WAGON_SAVE_VERSION;
  return d;
}

export function resolvePersistenceDisabledState(mode, hasCart, hasHorse) {
  let m = mode;
  if ((m === TRANSPORT.Horse && !hasHorse) || (m === TRANSPORT.Cart && !hasCart)) m = TRANSPORT.Foot;
  return { WagonMode: hasCart ? WAGON_MODE.WithPlayer : WAGON_MODE.None, HorseMode: hasHorse ? HORSE_MODE.WithPlayer : HORSE_MODE.None, TransportMode: m, RequiresHorseMessage: false };
}
export function resolvePersistenceEnabledState(mode, hasCart, hasHorse) {
  const r = { WagonMode: hasCart ? WAGON_MODE.WithPlayer : WAGON_MODE.None, HorseMode: hasHorse ? HORSE_MODE.WithPlayer : HORSE_MODE.None, TransportMode: mode, RequiresHorseMessage: false };
  if (mode === TRANSPORT.Horse && !hasHorse) r.TransportMode = TRANSPORT.Foot;
  else if (mode === TRANSPORT.Cart) {
    if (!hasCart) r.TransportMode = TRANSPORT.Foot;
    else if (hasHorse) r.HorseMode = HORSE_MODE.HitchedToWagon;
    else { r.TransportMode = TRANSPORT.Foot; r.RequiresHorseMessage = true; }
  }
  return r;
}
export const isHorseTransportAvailable = (persistence, hasHorse, horseReachable) => hasHorse && (!persistence || horseReachable);
export const isCartTransportAvailable = (persistence, hasCart, hasHorse, teamReachable) => (!hasCart ? false : !persistence ? true : hasHorse && teamReachable);
export const isWagonInventoryAccessible = (persistence, hasCart, physicallyReachable) => hasCart && (!persistence || physicallyReachable);
export const isDungeonExitWagonAccessAllowed = (persistence, hasCart, insideDungeon, entranceMatch) => hasCart && insideDungeon && (!persistence || entranceMatch);
export const interiorAccessRequiresMapPixelMatch = (m) => m === INTERIOR_ACCESS.Building;
export function isUsableDungeonEntranceDoorPosition(playerPos, doorPos) {
  if (!doorPos || !doorPos.every(Number.isFinite)) return false;
  return horizontalDistance(playerPos, doorPos) <= DUNGEON_DOOR_USABLE_RADIUS;
}
export const isHitchedTeamFollowing = (wagonMode, horseMode) => wagonMode === WAGON_MODE.FollowingPlayer && horseMode === HORSE_MODE.HitchedToWagon;
export const isAutonomousHorseFollowing = (s) => s.HorseMode === HORSE_MODE.FollowingPlayer || isHitchedTeamFollowing(s.Mode, s.HorseMode);
export const isDirectHitchedTeamMount = (wagonMode, horseMode, ownsCart) => ownsCart && (wagonMode === WAGON_MODE.Deployed || wagonMode === WAGON_MODE.FollowingPlayer) && horseMode === HORSE_MODE.HitchedToWagon;
export const isPhysicalTeamWithinMountDistances = (player, wagon, horse, nearest = null) =>
  isWithinHorizontalDistance(player, nearest ? nearest(player) : wagon, WAGON_INVENTORY_DISTANCE) && isWithinHorizontalDistance(player, horse, HORSE_MENU_MOUNT_DISTANCE) && isWithinHorizontalDistance(horse, nearest ? nearest(horse) : wagon, HORSE_WAGON_HITCH_DISTANCE);
export function isPhysicalTransportStateValid(hasCart, hasHorse, wm, hm, tmode) {
  if (wm === WAGON_MODE.FollowingPlayer) return hasCart && hasHorse && hm === HORSE_MODE.HitchedToWagon && tmode === TRANSPORT.Foot;
  if (!hasHorse) return hm === HORSE_MODE.None && tmode !== TRANSPORT.Horse && tmode !== TRANSPORT.Cart;
  if (hm === HORSE_MODE.None) return false;
  if (hm === HORSE_MODE.HitchedToWagon) {
    if (!hasCart) return false;
    if (wm !== WAGON_MODE.WithPlayer && wm !== WAGON_MODE.Deployed && wm !== WAGON_MODE.FollowingPlayer) return false;
  }
  if (tmode === TRANSPORT.Cart) return hasCart && hasHorse && wm === WAGON_MODE.WithPlayer && hm === HORSE_MODE.HitchedToWagon;
  if (tmode === TRANSPORT.Horse) return hasHorse && hm === HORSE_MODE.WithPlayer;
  return true;
}
export const canRefreshDirectCartTransport = (mode, hasCart, hasHorse, wm, hm) => mode === TRANSPORT.Cart && hasCart && hasHorse && wm === WAGON_MODE.WithPlayer && hm === HORSE_MODE.HitchedToWagon;
export function resolveQuickMountMode(last, hasHorse, hasCart) {
  if (last === LAST_MOUNT.Cart && hasCart) return TRANSPORT.Cart;
  if (last === LAST_MOUNT.Horse && hasHorse) return TRANSPORT.Horse;
  if (hasHorse) return TRANSPORT.Horse;
  if (hasCart) return TRANSPORT.Cart;
  return TRANSPORT.Foot;
}
export function resolveHorseActivation(wagonMode, horseMode, ownsCart, talkMode) {
  if (talkMode) {
    if (horseMode === HORSE_MODE.LooseStationary) return HORSE_ACTIVATION.Follow;
    if (horseMode === HORSE_MODE.FollowingPlayer) return HORSE_ACTIVATION.Wait;
    if (isHitchedTeamFollowing(wagonMode, horseMode)) return HORSE_ACTIVATION.Wait;
    if (isDirectHitchedTeamMount(wagonMode, horseMode, ownsCart)) return HORSE_ACTIVATION.FollowHitchedTeam;
    return HORSE_ACTIVATION.None;
  }
  return isDirectHitchedTeamMount(wagonMode, horseMode, ownsCart) ? HORSE_ACTIVATION.MountHitchedTeam : HORSE_ACTIVATION.Ride;
}
/**
 * @param {string} target
 * @param {{wagonMode?: number, horseMode?: number, ownsCart?: boolean}} [state]
 * @returns {{id: string, label: string}[]}
 */
export function hccActionRows(target, { wagonMode, horseMode, ownsCart } = {}) {
  if (target === 'deployedWagon') return [{ id: ACTIVATE_MODE.Grab, label: horseMode === HORSE_MODE.HitchedToWagon ? HCC_ACTION_TEXT.drive : HCC_ACTION_TEXT.hitch }, { id: ACTIVATE_MODE.Steal, label: HCC_ACTION_TEXT.openWagon }];
  if (target === 'followingWagon') return [{ id: ACTIVATE_MODE.Grab, label: HCC_ACTION_TEXT.drive }, { id: ACTIVATE_MODE.Steal, label: HCC_ACTION_TEXT.openWagon }];
  if (target !== 'horse') return [];
  const rows = [];
  const ride = resolveHorseActivation(wagonMode, horseMode, ownsCart, false);
  rows.push({ id: ACTIVATE_MODE.Grab, label: ride === HORSE_ACTIVATION.MountHitchedTeam ? HCC_ACTION_TEXT.drive : HCC_ACTION_TEXT.ride });
  const cmd = resolveHorseActivation(wagonMode, horseMode, ownsCart, true);
  const cmdLabel = cmd === HORSE_ACTIVATION.Follow ? HCC_ACTION_TEXT.follow
    : cmd === HORSE_ACTIVATION.FollowHitchedTeam ? HCC_ACTION_TEXT.followTeam
      : cmd === HORSE_ACTIVATION.Wait ? HCC_ACTION_TEXT.wait : null;
  if (cmdLabel) rows.push({ id: ACTIVATE_MODE.Talk, label: cmdLabel });
  rows.push({ id: ACTIVATE_MODE.Info, label: HCC_ACTION_TEXT.name });
  return rows;
}
export const HCC_ACTION_TEXT = Object.freeze({
  ride: 'Ride', drive: 'Drive the wagon', hitch: 'Hitch up', openWagon: 'Open the wagon',
  follow: 'Follow me', followTeam: 'Follow me with the wagon', wait: 'Wait here', name: 'Name',
});
export const isHorseCommandMode = (m) => m === ACTIVATE_MODE.Talk;
export const isHorseNamingMode = (m) => m === ACTIVATE_MODE.Info;
export function resolveInteriorEntryMode(mode, hasObserved, previous, wagonWithPlayer, hasCart, hasHorse, hm) {
  const resolved = mode !== TRANSPORT.Foot ? mode : (hasObserved ? previous : TRANSPORT.Foot);
  if (wagonWithPlayer && hasCart && hasHorse) {
    if (resolved === TRANSPORT.Cart) return TRANSPORT.Cart;
    if (hm === HORSE_MODE.HitchedToWagon) return TRANSPORT.Cart;
  }
  return resolved;
}
export const isCartInteriorDeployment = (hasPendingWagon, entryMode) => hasPendingWagon && entryMode === TRANSPORT.Cart;
export const shouldDeployIndependentHorseForInterior = (hasPendingWagon, entryMode, hm, hasHorse) => hasHorse && hm === HORSE_MODE.WithPlayer && !isCartInteriorDeployment(hasPendingWagon, entryMode);
export const horseTravelsWithFastTravel = (wm, hm, followingTravels) => followingTravels && (hm === HORSE_MODE.FollowingPlayer || isHitchedTeamFollowing(wm, hm));
export function resolveFastTravelDepartureModes(wm, hm, travels) {
  if (travels) return { wagonMode: wm, horseMode: hm };
  if (isHitchedTeamFollowing(wm, hm)) return { wagonMode: WAGON_MODE.Deployed, horseMode: hm };
  if (hm === HORSE_MODE.FollowingPlayer) return { wagonMode: wm, horseMode: HORSE_MODE.LooseStationary };
  return { wagonMode: wm, horseMode: hm };
}
export const shouldReconcileAfterTravelOptions = (wasActive, isActive, persistence, wm, hm) => wasActive && !isActive && persistence && horseTravelsWithFastTravel(wm, hm, true);
export const shouldMigrateLegacySaveFile = (legacyExists, canonicalExists) => legacyExists && !canonicalExists;

export const clampHorseFollowDistance = (v) => Math.max(MIN_HORSE_FOLLOW_DISTANCE, Math.min(MAX_HORSE_FOLLOW_DISTANCE, Number(v) || 0));
export const clampInteriorWagonAccessDistance = (v) => Math.max(MIN_INTERIOR_ACCESS_DISTANCE, Math.min(MAX_INTERIOR_ACCESS_DISTANCE, Number(v) || 0));
export const isWithinInteriorEntranceDistance = (distance, configured) => !(distance > clampInteriorWagonAccessDistance(configured)) && !Number.isNaN(distance);

export function formatHorseSubject(name, sentenceStart) {
  const n = normalizeHorseName(name);
  return n ? n : (sentenceStart ? 'Your horse' : 'your horse');
}
export function formatHorseAndWagonSubject(name, sentenceStart) {
  const n = normalizeHorseName(name);
  return n ? `${n} and your wagon` : (sentenceStart ? 'Your horse and wagon' : 'your horse and wagon');
}
export const horseTargetLabel = (name) => (normalizeHorseName(name) ? normalizeHorseName(name) : 'Horse');
export const HCC_TEXT = Object.freeze({
  noLongerOwnHorse: 'You no longer own a horse.',
  noLongerOwnWagon: 'You no longer own a wagon.',
  noLongerOwnTeam: 'You no longer own this horse-and-wagon team.',
  needHorseToPull: 'You need a horse to pull the wagon.',
  needHorseWhilePersistence: 'You need a horse to pull the wagon while physical persistence is enabled.',
  notAccessibleFromHere: 'Your wagon is not accessible from here.',
  within5m: 'You must be within 5 metres of your wagon.',
  dungeonExitAccess: 'Access your wagon by activating the dungeon exit with your wagon parked nearby.',
  tooFarFromEntrance: 'Your wagon is too far from the entrance.',
  wagonNotWithYou: 'Your wagon is not with you.',
  wagonAndHorseMustBeWithYou: 'Your wagon and horse must both be with you.',
  wagonNotReadyToUnhitch: 'Your wagon is not ready to unhitch yet.',
  wagonNotReadyToWait: 'Your wagon is not ready to wait yet.',
  doNotOwnHorse: 'You do not own a horse.',
  doNotOwnWagon: 'You do not own a wagon.',
  doNotOwnHorseOrWagon: 'You do not own a horse or wagon.',
  onlyHorseAndCart: 'Only Horse and Cart are supported by Horse Cart and Cargo.',
  onlyHorseAndCartShort: 'Only Horse and Cart are supported.',
  notReady: 'Horse Cart and Cargo is not ready.',
  unknownStorageContext: 'Unknown wagon-storage context.',
  quickMountUnavailable: 'Quick mount is unavailable from this transport mode.',
  mountOutdoorsOnly: 'You can only mount your horse or wagon outdoors.',
  summonOutdoorsOnly: 'You can only summon your horse and wagon outdoors.',
  alreadyWithYou: 'Your owned transport is already with you.',
  summonedBoth: 'Your horse and wagon have been summoned.',
  summonedWagon: 'Your wagon has been summoned.',
  summonedHorse: 'Your horse has been summoned.',
  sendAwayOutdoorsOnly: 'You can only send your horse and wagon away from outdoors.',
  sendAwayDismount: 'Dismount before you send them away.',
  notInTheWorld: 'Your horse and wagon travel with you while physical persistence is off.',
  alreadyAway: 'Your horse and wagon are already stabled.',
  sentBoth: 'Your horse and wagon go back to the stable.',
  sentWagon: 'Your wagon goes back to the stable.',
  sentHorse: 'Your horse goes back to the stable.',
  inventoryUnavailable: 'The inventory window is not available.',
  nameYourHorse: 'Name your horse:',
  horseDefaultLabel: 'Horse',
});

export function isPreferredGround(originY, candidateY, candidateDistance, hasBest, bestY, bestDistance) {
  if (!hasBest) return true;
  const dCand = Math.abs(candidateY - originY), dBest = Math.abs(bestY - originY);
  if (dCand < dBest - 0.001) return true;
  if (Math.abs(dCand - dBest) <= 0.001) return candidateDistance < bestDistance;
  return false;
}
export function pickGround(hits, referenceY, reject = null) {
  let best = null, bestY = 0, bestDist = Infinity;
  for (const h of hits ?? []) {
    if (!h || !h.point) continue;
    if (reject && reject(h)) continue;
    if (!isPreferredGround(referenceY, h.point[1], h.distance, best !== null, bestY, bestDist)) continue;
    best = h; bestY = h.point[1]; bestDist = h.distance;
  }
  return best;
}

export const ORIENTATION_COUNT = 8, DEGREES_PER_ORIENTATION = 45;
export const BASELINE_FPS = 6, MIN_MOVING_FPS = 4, MAX_MOVING_FPS = 9, IDLE_FPS = 2, IDLE_FRAME_A = 5, IDLE_FRAME_B = 6;
export const BASELINE_MOVEMENT_SPEED = 2.8, START_WALKING_SPEED = 0.08, STOP_WALKING_SPEED = 0.03;

// Returns 0 with the camera straight ahead of the horse and 4 with it straight behind.
export function calculateHorseOrientation(cameraPos, horsePos, horseForward) {
  const toCamera = [cameraPos[0] - horsePos[0], 0, cameraPos[2] - horsePos[2]];
  const fwd = [horseForward[0], 0, horseForward[2]];
  if (sqrMag(toCamera) <= MATHF_EPSILON) return 0;
  if (sqrMag(fwd) <= MATHF_EPSILON) return 0;
  const tc = normalized(toCamera), f = normalized(fwd);
  let angle = angleBetween(tc, f);
  const crossY = tc[2] * f[0] - tc[0] * f[2];
  if (Math.abs(crossY) > MATHF_EPSILON) angle = angle * -Math.sign(crossY);
  else if (vdot(tc, f) < 0) angle = 180;
  return (-Math.round(angle / DEGREES_PER_ORIENTATION) + ORIENTATION_COUNT) % ORIENTATION_COUNT;
}
export function horseViewFor(orientation) {
  switch (orientation) {
    case 0: return { view: 0, flip: false };
    case 1: return { view: 1, flip: false };
    case 2: return { view: 2, flip: false };
    case 3: return { view: 3, flip: false };
    case 4: return { view: 4, flip: false };
    case 5: return { view: 3, flip: true };
    case 6: return { view: 2, flip: true };
    case 7: return { view: 1, flip: true };
    default: return null;
  }
}
export const walkFramesPerSecond = (speed) => Math.max(MIN_MOVING_FPS, Math.min(MAX_MOVING_FPS, BASELINE_FPS * Math.max(0, speed) / BASELINE_MOVEMENT_SPEED));
export const idleFrame = (idleSeconds) => ((Math.floor(Math.max(0, idleSeconds) * IDLE_FPS) & 1) !== 0 ? IDLE_FRAME_B : IDLE_FRAME_A);

export function stepHorseWalk(s, speed, dt, hasWalkFrames = true) {
  const wasWalking = s.walking;
  const walking = wasWalking ? speed > STOP_WALKING_SPEED : speed > START_WALKING_SPEED;
  let { animationAccumulator, idleAccumulator, animationFrame } = s;
  if (hasWalkFrames) {
    if (walking) {
      if (!wasWalking) { animationAccumulator = 0; animationFrame = 0; idleAccumulator = 0; }
      const frameDuration = 1 / walkFramesPerSecond(speed);
      animationAccumulator += dt;
      while (animationAccumulator >= frameDuration) { animationAccumulator -= frameDuration; animationFrame = (animationFrame + 1) % HORSE_WALK_FRAMES; }
    } else {
      animationAccumulator = 0;
      if (wasWalking) idleAccumulator = 0; else idleAccumulator += dt;
      animationFrame = idleFrame(idleAccumulator);
    }
  }
  return { walking, animationAccumulator, idleAccumulator, animationFrame };
}
export const freshHorseWalk = () => ({ walking: false, animationAccumulator: 0, idleAccumulator: 0, animationFrame: 0 });

export function signedLongitudinalTravel(displacement, previousForward, currentForward) {
  let axis = vadd(previousForward, currentForward);
  if (sqrMag(axis) <= MATHF_EPSILON) axis = sqrMag(currentForward) > MATHF_EPSILON ? currentForward : previousForward;
  if (sqrMag(axis) <= MATHF_EPSILON) return 0;
  return vdot(displacement, normalized(axis));
}
export const wheelRotationDegrees = (signedDistance, wheelRadius) => (wheelRadius <= MATHF_EPSILON ? 0 : (WHEEL_ROTATION_SIGN * signedDistance / wheelRadius) * (180 / Math.PI));
export const wrapWheelAngle = (a) => { const r = a + 180; return (r - Math.floor(r / 360) * 360) - 180; };
export const wheelRadiusOf = (leftSize, rightSize) => (((leftSize[1] + leftSize[2]) * 0.25) + ((rightSize[1] + rightSize[2]) * 0.25)) * 0.5;

export const CARGO_TIERS = Object.freeze([25, 50, 75, 90]);
export function cargoTier(weight, limit) {
  if (!(limit > 0) || Number.isNaN(weight)) return 0;
  const f = Math.max(0, Math.min(1, weight / limit));
  if (f >= 0.9) return 90;
  if (f >= 0.75) return 75;
  if (f >= 0.5) return 50;
  if (f >= 0.25) return 25;
  return 0;
}
