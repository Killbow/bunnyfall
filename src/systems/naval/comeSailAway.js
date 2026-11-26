// @ts-check
import { Boat, setLights, HULL_NAMES, HULL_PRICES, packedHullWeight, CARGO_CONTAINER_IMAGE, TRIGGER_MODEL, goModelName, meshLocalBounds, colliderBounds, animatorOf, nodeOf, AUDIO_CLIPS, SAIL_ANIMATION_SPEED } from './comeSailAwayBoat.js';
import { hullFromMessage } from './comeSailAwayHulls.js';
import { seaHoldShut, seaHoldShutText } from './seaHoldGuard.js';
import { firmStat } from '../../characters/firmamentLive.js';
import { constantCurve, twoConstantsCurve, SPACE } from '../../world/unityParticles.js';
import { quatEuler } from '../../world/unityAnimator.js';
import { quatLookRotation, quatRotate, quatAngleAxis, quatMultiply, quatSlerp } from '../../world/quat.js';
import { transferAll, canHoldAmount } from '../../items/inventory.js';
import { BOAT_PARTS_TEMPLATE, BOAT_DEED_TEMPLATE, mintBoatItem, boatItemName, boatItemMessage, mintDeed } from './comeSailAwayItems.js';
import { NO_WATER_LEVEL } from '../../world/deepWaterSwim.js';
import { invertAffine } from '../../world/prefabColliders.js';
import { buildWaveMesh, stepWaveFrame, waveFrameTimeOf, isDayHour, WAVE_FRAME_COUNT, WAVE_SCALE } from './comeSailAwayWaves.js';
import { monthNames } from '../../world/gameDate.js';
import { HELM_WAY, CARGO_HOLD_MISSING, steerage, isResponsive, pointOfSail, seaWind, SAIL_FREE, sailFreeGain, WIND_RATED } from './helmWay.js';
import { MAP_MARKER_MODE_COLORS, mapRect, guiMouse, mapPixelUnder, guiRectContains, vector2IntDistance, markerLabel, dayOfMonthWithSuffix, mapOverlayDraws, csFloatString, COLOR_RED, COLOR_GREEN, COLOR_BLUE, COLOR_BLACK, DAGGERFALL_DEFAULT_SHADOW_POS } from './comeSailAwayMap.js';
import { noteFirstUse } from '../../ui/tutorials.js';
import { BOAT_ACTIONS } from './comeSailAwayActions.js';
import { peaceShare } from './peaceWay.js';
import { createBoatLives } from './farLife.js';
import { deckPressed } from './peerHulls.js';
import { windStaleOutdoors } from './csaLoadWind.js';
import { downRayNearHull } from './hullRayReach.js';

export const COME_SAIL_AWAY_VENDOR = 'come-sail-away';
// This game carries neither of these mods, so every arm that reads them takes its null branch.
/** @type {null | { Title: string }} */
export const WOD_TERRAIN = null;
/** @type {null | { Title: string }} */
export const ANIMATED_WATER = null;
export const WATER_LEVEL = WOD_TERRAIN != null ? 100 : 34;
export const TERRAIN_EDGE = Math.fround(819.2);
export const LOST_UNDER_M = 2;
export const LOST_CONFIRM_S = 5;
export const PLACE_RAY_DISTANCE = 100;
export const PLACE_CLICK_DELAY = Math.fround(0.2);
export { NO_WATER_LEVEL };
export { BOAT_PARTS_TEMPLATE, BOAT_DEED_TEMPLATE };
export const CONSOLE = Object.freeze({
  giveboat: Object.freeze({ name: 'giveboat', description: "Add a boat deed to the player's inventory", usage: 'giveboat [hull] [variant]; No argument will result in random hull and variant.' }),
  placeboat: Object.freeze({ name: 'placeboat', description: 'place a boat where the player is looking', usage: 'placeboat [hull] [variant]; No argument will result in random hull and variant. WARNING: only hull 0 is available now and variants only go from 0-6' }),
  printboats: Object.freeze({ name: 'printboats', description: 'lists all placed boats', usage: '' }),
  identifyboat: Object.freeze({ name: 'identifyboat', description: 'Get the index of the boat under the crosshair', usage: 'use command while looking at a boat' }),
  purgeboat: Object.freeze({ name: 'purgeboat', description: 'Destroys the boat at the provided index', usage: 'purgeboat [index]' }),
});

const f = Math.fround;
const V_UP = [0, 1, 0];
const V_FORWARD = [0, 0, 1];
const V_BACK = [0, 0, -1];
const V_RIGHT = [1, 0, 0];

export function convertToInt32(s) {
  if (s == null) return 0;
  if (!/^\s*[+-]?\d+\s*$/.test(String(s))) throw new TypeError(`FormatException: Input string was not in a correct format. ("${s}")`);
  const v = Number.parseInt(String(s).trim(), 10);
  if (v > 2147483647 || v < -2147483648) throw new RangeError(`OverflowException: Value was either too large or too small for an Int32. ("${s}")`);
  return v;
}

export function upPlaneRaycast(origin, direction, h) {
  const vdot = f(direction[1]);
  const ndot = f(f(-f(origin[1])) - f(-f(h)));
  if (Math.abs(vdot) < 8 * 1.401298e-45) return null;
  const enter = f(ndot / vdot);
  return enter > 0 ? enter : null;
}

const alongRay = (o, d, t) => [f(f(o[0]) + f(f(d[0]) * f(t))), f(f(o[1]) + f(f(d[1]) * f(t))), f(f(o[2]) + f(f(d[2]) * f(t)))];

export { hullFromMessage };
export const variantFromMessage = (message) => message % 10;

export function tileMapIndexAtPosition(position, terrain) {
  const map = terrain.tileMap;
  if (map == null || map.length === 0) return -1;
  const tp = terrain.position;
  const vx = f(f(position[0]) - f(tp[0])), vz = f(f(position[2]) - f(tp[2]));
  const num2 = f(vx / TERRAIN_EDGE), num3 = f(vz / TERRAIN_EDGE);
  const num4 = Math.min(127, Math.max(0, Math.trunc(f(128 * num2))));
  const num5 = Math.min(127, Math.max(0, Math.trunc(f(128 * num3))));
  return map[num5 * 128 + num4] >> 2;
}

export const ACTIVATION_DISTANCE = f(3.2);
export const ACTIVATIONS = Object.freeze({
  [TRIGGER_MODEL.drive]: 'ActivateRudder', [TRIGGER_MODEL.board]: 'BoardBoat', [TRIGGER_MODEL.cargo]: 'OpenBoatCargo',
  [TRIGGER_MODEL.door]: 'TriggerDoor', [TRIGGER_MODEL.variant]: 'PickVariant', [TRIGGER_MODEL.status]: 'CheckBoatStatus',
  [TRIGGER_MODEL.position]: 'CheckBoatPosition',
});
export function customModelOf(name, ids) {
  let n = String(name ?? '');
  const pos = n.indexOf(']');
  if (pos > 0 && pos < n.length - 1) n = n.slice(0, pos + 1);
  for (const id of ids) if (goModelName(Number(id)) === n) return Number(id);
  return null;
}
export const activationModelOf = (name) => customModelOf(name, Object.keys(ACTIVATIONS));
export function boardPlaceOf(triggerNode) {
  const parent = triggerNode.parent;
  const child = parent.getChild(parent.children.indexOf(triggerNode) - 1);
  return { position: child.position, yaw: yawOfForward(quatRotate(child.rotation, [0, 0, 1])) };
}
export const NICE_BOAT_TEXT = 'Nice Boat!';
export const PASSENGERS_ABOARD_TEXT = 'You cannot pack a boat with passengers aboard!';
export const PARTS_STANDING_TEXT = 'This ship is already afloat. These are its parts.';
export const DEED_NOT_HELD_TEXT = 'You need the ship\'s deed in your pack to pick it up.';
export const PARTS_TOO_HEAVY_TEXT = 'The ship\'s parts are too heavy for you to carry.';
export { BOAT_ACTIONS };
export const BOAT_TIME_ACTIONS = Object.freeze([BOAT_ACTIONS.timeScaleUp, BOAT_ACTIONS.timeScaleDown, BOAT_ACTIONS.timeScaleReset]);
export const PLACE_RAISED_TEXT = 'This water is above sea level. Place the ship on open water.';
export const IRONS_TELL_DEG = 40;
export const IRONS_TELL_WAY = 0.4;
export const CSA_BRAKE_MAX = 20;
export const IRONS_TELL_S = 2;
export const IRONS_TEXT = 'In irons: the wind is dead ahead. Strike sail and row to turn.';
export const OAR_RUNG_TEXT = Object.freeze({ '-1': 'Oars: backing water.', 0: 'Oars: at rest.', 1: 'Oars: pulling ahead.' });
export const OAR_ASTERN_TEXT = 'Already rowing astern.';
export const SAIL_CREST_DEG = 135;
export const sailCrest = (b, sail) => (b.SailsLateen.includes(sail) || b.SailsGaff.includes(sail) || b.SailsStay.includes(sail) ? SAIL_CREST_DEG : 0);
export const HANDLING = Object.freeze({
  moveSpeedOar: 2, moveSpeedSail: 2, moveAccelOar: 1, moveAccelSail: f(0.2),
  turnSpeedOar: 20, turnSpeedSail: 10, turnAccelOar: 10, turnAccelSail: 5,
});
export const OAR_MODE_TIME = 1;
export const OAR_FATIGUE = 11;
export const CARGO_WEIGHTS = Object.freeze({ female: 120, male: 175, horse: 800, cart: 400 });
// The large ship's scenes, not the small ones AssignShipToPlayer made permanent, as the mod has it.
export const TEMPORARY_SHIP_SCENES = Object.freeze(['DaggerfallWorld [mapX=5, mapY=5]', 'DaggerfallInterior [MapID=2102157, BuildingKey=16777216]']);

const K_EPSILON = f(1e-5);
const K_EPSILON_SQ = f(K_EPSILON * K_EPSILON);
const vAdd = (a, b) => [f(f(a[0]) + f(b[0])), f(f(a[1]) + f(b[1])), f(f(a[2]) + f(b[2]))];
const vSub = (a, b) => [f(f(a[0]) - f(b[0])), f(f(a[1]) - f(b[1])), f(f(a[2]) - f(b[2]))];
const vScale = (a, s) => [f(f(a[0]) * f(s)), f(f(a[1]) * f(s)), f(f(a[2]) * f(s))];
const vDot = (a, b) => f(f(f(f(a[0]) * f(b[0])) + f(f(a[1]) * f(b[1]))) + f(f(a[2]) * f(b[2])));
const vSqrMagnitude = (a) => vDot(a, a);
const vMagnitude = (a) => f(Math.sqrt(vSqrMagnitude(a)));
export function vNormalized(a) {
  const m = vMagnitude(a);
  return m > K_EPSILON ? [f(f(a[0]) / m), f(f(a[1]) / m), f(f(a[2]) / m)] : [0, 0, 0];
}
export const vEquals = (a, b) => vSqrMagnitude(vSub(a, b)) < K_EPSILON_SQ;
export function vProjectOnPlane(v, n) {
  const sqrMag = vDot(n, n);
  if (sqrMag < 1.401298e-45) return [f(v[0]), f(v[1]), f(v[2])];
  const d = vDot(v, n);
  return [0, 1, 2].map((i) => f(f(v[i]) - f(f(f(n[i]) * d) / sqrMag)));
}
export function vMoveTowards(current, target, maxDistanceDelta) {
  const to = current.map((c, i) => f(f(target[i]) - f(c)));
  let sqdist = 0;
  for (const t of to) sqdist = f(sqdist + f(t * t));
  const md = f(maxDistanceDelta);
  if (sqdist === 0 || (md >= 0 && sqdist <= f(md * md))) return target.map((t) => f(t));
  const dist = f(Math.sqrt(sqdist));
  return current.map((c, i) => f(f(c) + f(f(to[i] / dist) * md)));
}
export function mathfMoveTowards(current, target, maxDelta) {
  const d = f(f(target) - f(current));
  if (Math.abs(d) <= f(maxDelta)) return f(target);
  return f(f(current) + f((d >= 0 ? 1 : -1) * f(maxDelta)));
}
export function mathfClamp(v, min, max) {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}
export const mathfLerp = (a, b, t) => f(f(a) + f(f(f(b) - f(a)) * mathfClamp(f(t), 0, 1)));
export const mathfLerpUnclamped = (a, b, t) => f(f(a) + f(f(f(b) - f(a)) * f(t)));
const vCross = (a, b) => [
  f(f(f(a[1]) * f(b[2])) - f(f(a[2]) * f(b[1]))), f(f(f(a[2]) * f(b[0])) - f(f(a[0]) * f(b[2]))), f(f(f(a[0]) * f(b[1])) - f(f(a[1]) * f(b[0]))),
];
const RAD2DEG = f(57.29578);
export function vAngle(from, to) {
  const num = f(Math.sqrt(f(vSqrMagnitude(from) * vSqrMagnitude(to))));
  if (num < 1e-15) return 0;
  const num2 = mathfClamp(f(vDot(from, to) / num), -1, 1);
  return f(f(Math.acos(num2)) * RAD2DEG);
}
export function vSignedAngle(from, to, axis) {
  const num = vAngle(from, to);
  const c = vCross(from, to);
  const s = f(f(f(f(axis[0]) * c[0]) + f(f(axis[1]) * c[1])) + f(f(axis[2]) * c[2]));
  return f(num * (s >= 0 ? 1 : -1));
}
export function vRotateTowards(current, target, maxRadiansDelta, maxMagnitudeDelta) {
  const num = vMagnitude(current), num2 = vMagnitude(target);
  if (num > K_EPSILON && num2 > K_EPSILON) {
    const from = vScale(current, f(1 / num)), to = vScale(target, f(1 / num2));
    const num3 = vDot(from, to);
    if (num3 > f(1 - K_EPSILON)) return vMoveTowards(current, target, maxMagnitudeDelta);
    const turned = (axis, radians) => vScale(quatRotate(quatAngleAxis(f(f(radians) * RAD2DEG), axis), from).map(f), clampedMove(num, num2, maxMagnitudeDelta));
    if (num3 < f(-1 + K_EPSILON)) return turned(orthoNormalVectorFast(from), maxRadiansDelta);
    return turned(vNormalized(vCross(from, to)), Math.min(f(maxRadiansDelta), f(Math.acos(num3))));
  }
  return vMoveTowards(current, target, maxMagnitudeDelta);
}
function clampedMove(lhs, rhs, clampedDelta) {
  const delta = f(rhs - lhs);
  return delta > 0 ? f(lhs + Math.min(delta, f(clampedDelta))) : f(lhs - Math.min(f(-delta), f(clampedDelta)));
}
function orthoNormalVectorFast(n) {
  if (Math.abs(n[2]) > f(Math.SQRT1_2)) {
    const k = f(1 / f(Math.sqrt(f(f(n[1] * n[1]) + f(n[2] * n[2])))));
    return [0, f(-n[2] * k), f(n[1] * k)];
  }
  const k = f(1 / f(Math.sqrt(f(f(n[0] * n[0]) + f(n[1] * n[1])))));
  return [f(-n[1] * k), f(n[0] * k), 0];
}
export function quatAngleUnity(a, b) {
  const dot = f(f(f(f(a[0] * b[0]) + f(a[1] * b[1])) + f(a[2] * b[2])) + f(a[3] * b[3]));
  return dot > f(1 - 0.000001) ? 0 : f(f(f(Math.acos(Math.min(Math.abs(dot), 1))) * 2) * RAD2DEG);
}
export function quatRotateTowards(from, to, maxDegreesDelta) {
  const num = quatAngleUnity(from, to);
  if (num === 0) return [...to];
  return quatSlerp(from, to, Math.min(1, f(maxDegreesDelta / num)));
}
const conj = (q) => [-q[0], -q[1], -q[2], q[3]];
const inverseTransformDirection = (node, v) => quatRotate(conj(node.rotation), v).map(f);
function setPositionChecked(node, p, log) {
  if (!p.every(Number.isFinite)) { log?.(`transform.position assign attempt for '${node.name}' is not valid. Input position is { ${p.join(', ')} }.`); return false; }
  node.position = p;
  return true;
}
function setLocalRotationChecked(node, q, log) {
  if (!q.every(Number.isFinite)) { log?.(`transform.localRotation assign attempt for '${node.name}' is not valid. Input rotation is { ${q.join(', ')} }.`); return false; }
  node.localRotation = q;
  return true;
}
export function yawOfForward(v) {
  const d = (Math.atan2(v[0], v[2]) * 180) / Math.PI;
  return d < 0 ? d + 360 : d;
}
export const WIND_WIDGET = Object.freeze({ intervals: Object.freeze([1, 2, 3, 5, 6, 9, 10, 15, 18, 30, 45, 90]), intervalIndex: 7, nativeWidth: 320, nativeHeight: 200 });
export const windWidgetInterval = () => WIND_WIDGET.intervals[WIND_WIDGET.intervalIndex];
export const windWidgetFrameCount = () => 360 / windWidgetInterval();
export const WEATHER_TYPE = Object.freeze({ Sunny: 0, Cloudy: 1, Overcast: 2, Fog: 3, Rain: 4, Thunder: 5, Snow: 6 });
export const TIME_SCALES = Object.freeze([1, 5, 10, 15, 30]);
export const HELM_TIME_LOCKED_TEXT = 'Online, time at sea runs at normal speed.';
const applyMatrix = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];
const applyInverse = (m, p) => applyMatrix(invertAffine(m), p);
export const carriedPoint = (before, after, p) => applyMatrix(after, applyInverse(before, p));
export function yawDelta(before, after) {
  let d = (Math.atan2(after[8], after[10]) - Math.atan2(before[8], before[10])) * 180 / Math.PI;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}
const normalizeQ = (q) => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; };

const v3 = (o) => (o ? { x: f(o[0]), y: f(o[1]), z: f(o[2]) } : { x: 0, y: 0, z: 0 });
const arr3 = (o) => [f(o?.x ?? 0), f(o?.y ?? 0), f(o?.z ?? 0)];

// With the mod off, the saved record is written back whole, so its boats and holds wait until the mod returns.
/** @param {{ ship?: { assign?: (type: string) => void, removePermanentScene?: (name: string) => void } }} deps */
export function comeSailAwayCarrier(deps) {
  /** @type {any} */
  let carried;
  return {
    newSaveData: () => undefined,
    getSaveData: () => carried,
    restoreSaveData(/** @type {any} */ rec) {
      carried = rec ?? undefined;
      if (carried?.TemporaryShip) {
        for (const name of TEMPORARY_SHIP_SCENES) deps.ship?.removePermanentScene?.(name);
        deps.ship?.assign?.('None');
      }
      if (carried?.TemporaryShip || carried?.currentBoat >= 0) carried = { ...carried, currentBoat: -1, TemporaryShip: false };
    },
  };
}

export const cargoModWords = (mod) => (mod < 0.5 ? "You're going to need a bigger boat" : mod < 1 ? 'The boat draws a little lower than usual' : null);

/** @param {any} deps */
export function createComeSailAwayRuntime(deps) {
  const random = deps.random ?? { range: (min, max) => min + Math.floor(Math.random() * (max - min)) };
  const rangeFloat = (min, max) => (random.rangeFloat ? random.rangeFloat(min, max) : min + Math.random() * (max - min));
  const log = (s) => deps.log?.(s);

  const state = {
    /** @type {(Boat & { lostAt?: number | null })[]} */ AllBoats: [],
    /** @type {Boat|null} */ CurrentBoat: null,
    disembarking: null,
    placing: false,
    placeTime: 0,
    /** @type {any} */ placeItem: null,
    /** @type {any[]|(() => any[])|null} */ placeItemCollection: null,
    /** @type {Map<any, any[]>} */ PackedCargoes: new Map(),
    /** @type {{ position:number[], label:string, color:any }[]} */ mapMarkers: [],
    TemporaryShip: false,
    sailPosition: 0,
    oarThrottle: 0,
    sailWay: 0,
    MoveVectorCurrent: [0, 0, 0],
    MoveVectorTarget: [0, 0, 0],
    windVectorTarget: [0, 0, 1],
    windVectorCurrent: [0, 0, 1],
    currentVectorPrevious: [0, 0, 0],
    wasPaused: false,
    TurnTarget: 0,
    TurnCurrent: 0,
    velocityTarget: [0, 0, 0],
    velocityCurrent: [0, 0, 0],
    CollisionVector: [0, 0, 0],
    /** @type {number[][]} */ collisionDirections: [],
    lastBoatPosition: [0, 0, 0],
    lastBoatDirection: [0, 0, 0],
    inputCurrent: [0, 0],
    oarModeTimer: 0,
    boatCargoMod: 1,
    lastWeight: 0,
    currentVector: [0, 0, 0],
    waveObject: { position: [f(409.6), f(34.1), f(409.6)], scale: WAVE_SCALE, /** @type {any} */ mesh: null },
    waveFrameIndex: 0,
    waveFrameTimer: 0,
    /** @type {boolean[][] | null} */ currentNeighbors: null,
    /** @type {Boat|null} */ variantBoatTarget: null,
    timeScaleIndex: 0,
    gale: null,
    isTravelling: false,
    wasTravelling: false,
    trimAngle: 0,
    trimAngleSquare: 0,
    ironsFor: 0,
    ironsTold: false,
    windWidgetFrame: 0,
    /** @type {Map<any, { enemy:any, boat:Boat }>} */
    parentedObjects: new Map(),
    mapShowing: false,
    mapShowingPosition: false,
    /** @type {any} */ showingBoatPosition: null,
    mapMarkerMode: 0,
  };
  let playerParent = null;
  const events = { OnUpdateSailing: [], OnUpdateWind: [], OnUpdateCurrent: [] };
  const raise = (name, v) => { for (const fn of events[name]) fn(Array.isArray(v) ? [...v] : v); };
  /** @type {(() => boolean)[]} */
  let endOfFrameQueue = [];
  /** @type {{ at:number, step:() => void }[]} */
  let delayedCalls = [];
  let pendingRestore = null;

  {
    const num = 15 * random.range(-12, 12);
    const v = quatRotate(quatAngleAxis(num, V_UP), V_FORWARD);
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    state.windVectorTarget = [v[0] / l, v[1] / l, v[2] / l];
    state.windVectorCurrent = [...state.windVectorTarget];
  }

  const isSailing = () => state.CurrentBoat != null && state.disembarking == null;
  const rudderOf = (boat) => boat?.RudderAnimator?.animator ?? null;
  const playerRight = () => quatRotate(deps.player().rotation, [1, 0, 0]);
  // The host hands the same terrain object for a pixel every time, so identity matches Unity's `==`.
  const sameTerrain = (a, b) => a === b;
  // Unlike the mod, the sea's top follows the vertical compensation, so it stays right after a recenter.
  const seaTop = () => f(WATER_LEVEL + f(deps.worldCompensation?.()?.[1] ?? 0));
  // A hit below the sea surface, such as a ray from a swimmer reaching the seabed, floats the boat above it.
  function afloatAt(hit, origin, direction) {
    const top = seaTop();
    if (!(hit.point[1] < top)) return [...hit.point];
    const t = upPlaneRaycast(origin, direction, top);
    return t != null && t <= hit.distance ? alongRay(origin, direction, t) : [hit.point[0], top, hit.point[2]];
  }

  const setting = (key, fallback) => { const v = deps.setting?.(key); return v === undefined || v === null ? fallback : v; };
  const handlingMod = (key) => f(Number(setting(`Handling.${key}`, 1)));
  const has = (action) => !!deps.input?.has(action);
  const dt = () => f(deps.dt?.() ?? 0);
  const cur = () => state.CurrentBoat;
  const lives = createBoatLives({ eye: () => deps.pool?.lifeEye?.() ?? null });

  function moveSpeed() {
    const b = cur();
    const hurt = wayHurt(state.sailPosition !== 0);
    return state.sailPosition === 0 ? oarSpeed(b, hurt) : sailSpeed(b, hurt);
  }
  const wayHurt = (underSail) => f(Math.max(0, Math.min(1, Number(deps.wayScale?.(underSail) ?? 1))));
  const peace = () => f(peaceShare(deps.peaceWay?.() ?? 1));
  const oarSpeed = (b, hurt) => f(f(f(f(f(f(HANDLING.moveSpeedOar * handlingMod('OarMoveSpeed')) * state.boatCargoMod) * f(b.modifierMoveSpeedOar)) * hurt) * rigOf(b, 'oars')) * peace());
  const sailSpeed = (b, hurt) => f(f(f(f(f(f(HANDLING.moveSpeedSail * handlingMod('SailMoveSpeed')) * state.boatCargoMod) * f(b.modifierMoveSpeedSail)) * hurt) * rigOf(b)) * peace());
  // Refits scale rates where they are read and are never written into the prefab's modifiers.
  const refitOf = (b) => (b ? deps.refit?.(b) ?? null : null);
  const rigOf = (b, key = 'speed') => { const k = Number(refitOf(b)?.[key]); return Number.isFinite(k) && k > 0 ? f(k) : 1; };
  const handed = () => !!deps.handling && isResponsive(deps.handling());
  // Ship handling is taken once per helm session, so a settings change applies at the next helm.
  let helmHanded = null;
  const responsive = () => helmHanded ?? handed();
  function moveAccel() {
    const brake = Number(deps.brake?.() ?? 0);
    return brake > 0 ? f(Math.min(CSA_BRAKE_MAX, brake)) : moveAccelOwn();
  }
  function moveAccelOwn() {
    const b = cur();
    if (state.sailPosition === 0 && (state.oarThrottle !== 0 || !!deps.input?.toggleAutorun || (has('Run') && (has('MoveRight') || has('MoveLeft'))))) {
      const oar = f(f(f(f(HANDLING.moveAccelOar * handlingMod('OarMoveAcceleration')) * state.boatCargoMod) * f(b.modifierMoveAccelerationOar)) * peace());
      if (responsive() && vMagnitude(state.MoveVectorCurrent) > vMagnitude(state.velocityTarget ?? [0, 0, 0])) return Math.max(oar, coastAccel(b));
      return oar;
    }
    if (state.sailPosition === 1) {
      const wind = responsive() ? f(galeWind(seaWind(vMagnitude(state.windVectorCurrent)))) : vMagnitude(state.windVectorCurrent);
      const rate = f(f(f(f(f(f(f(HANDLING.moveAccelSail * handlingMod('SailMoveAcceleration')) * wind) * state.boatCargoMod) * f(b.modifierMoveAccelerationSail)) * (responsive() ? HELM_WAY.sailAccel : 1)) * rigOf(b)) * peace());
      return responsive() ? f(rate * f(sailFreeGain(b))) : rate;
    }
    return coastAccel(b);
  }
  function coastAccel(b) {
    const coast = f(f(f(f(HANDLING.moveAccelSail * handlingMod('SailMoveAcceleration')) * state.boatCargoMod) * f(b.modifierMoveAccelerationSail)) * (responsive() ? HELM_WAY.coast : 1));
    const way = vMagnitude(state.MoveVectorCurrent), share = way > 0 ? Math.min(1, state.sailWay / way) : 0;
    if (!responsive() || !(share > 0)) return coast;
    return share >= 1 ? f(coast * f(sailFreeGain(b))) : f(coast * f(1 + (sailFreeGain(b) - 1) * share));
  }
  function turnSpeed() {
    const b = cur();
    if (state.sailPosition === 0) return f(f(f(f(HANDLING.turnSpeedOar * handlingMod('OarTurnSpeed')) * state.boatCargoMod) * f(b.modifierTurnSpeedOar)) * rigOf(b, 'turn'));
    return f(f(f(f(f(HANDLING.turnSpeedSail * handlingMod('SailTurnSpeed')) * state.boatCargoMod) * f(b.modifierTurnSpeedSail)) * galeTurn()) * rigOf(b, 'turn'));
  }
  const galeWind = (wind) => (state.gale ? Math.max(wind, WIND_RATED * state.gale.wind) : wind);
  const galeTurn = () => (state.gale ? state.gale.turn : 1);
  function turnAccel() {
    const b = cur();
    if (state.sailPosition === 0 && (has('MoveRight') || has('MoveLeft'))) {
      return f(f(f(HANDLING.turnAccelOar * handlingMod('OarTurnAcceleration')) * state.boatCargoMod) * f(b.modifierTurnAccelerationOar));
    }
    return f(f(f(f(f(HANDLING.turnAccelSail * handlingMod('SailTurnAcceleration')) * state.boatCargoMod) * f(b.modifierTurnAccelerationSail)) * (responsive() ? HELM_WAY.turnAccelSail : 1)) * galeTurn());
  }
  const wakeThreshold = () => f(HANDLING.moveSpeedSail * f(0.25));
  const hasInput = () => state.oarThrottle !== 0 || f(deps.input?.horizontal?.() ?? 0) !== 0 || !!deps.input?.toggleAutorun;
  function inputTarget() {
    if (!hasInput()) return [0, 0];
    const h = f(deps.input?.horizontal?.() ?? 0);
    return deps.input?.toggleAutorun ? [h, 1] : [h, state.oarThrottle];
  }
  function combinedCollisionDirection() {
    let v = [0, 0, 0];
    for (const d of state.collisionDirections) v = vAdd(v, d);
    return v;
  }
  function CanTurnLeft(boat) {
    const fwd = quatRotate(boat.GameObject.rotation, [0, 0, 1]), right = quatRotate(boat.GameObject.rotation, [1, 0, 0]);
    for (const c of state.collisionDirections) {
      const num = vDot(fwd, c), num2 = vDot(right, c);
      if ((num >= 0 && num2 < 0) || (num < 0 && num2 >= 0)) return false;
    }
    return true;
  }
  function CanTurnRight(boat) {
    const fwd = quatRotate(boat.GameObject.rotation, [0, 0, 1]), right = quatRotate(boat.GameObject.rotation, [1, 0, 0]);
    for (const c of state.collisionDirections) {
      const num = vDot(fwd, c), num2 = vDot(right, c);
      if ((num >= 0 && num2 >= 0) || (num < 0 && num2 < 0)) return false;
    }
    return true;
  }
  const CanSail = (boat) => boat.NodeTileMapIndices.every((v) => v === 0);
  function IsBeached(boat) {
    let num = 0;
    for (const v of boat.NodeTileMapIndices) {
      if (v !== 0) num++;
      if (num > 3) return true;
    }
    return false;
  }
  const IsNodeOnWater = (boat, index) => boat.NodeTileMapIndices[index] === 0;

  function UpdateCurrentBoatNodes() {
    if (isSailing()) {
      UpdateBoatNodes(state.CurrentBoat);
      CheckCollision(state.CurrentBoat);
    }
  }
  function CheckCollision(boat) {
    state.collisionDirections.length = 0;
    const ctx = { models: deps.pool.models };
    const local = meshLocalBounds(ctx, boat.MeshCollider.m_Mesh);
    const world = colliderBounds(ctx, boat.MeshObject, boat.MeshCollider);
    const center = world.center.map(f);
    const x = f(local.extent[0]);
    const val = vScale(quatRotate(boat.MeshObject.rotation, [0, 0, 1]), f(f(local.extent[2]) - x));
    const val2 = vAdd(center, val), val3 = vSub(center, val);
    const val4 = vSub(val2, val3);
    const reach = vMagnitude(val);
    const m = boat.MeshObject.worldMatrix();
    const footY = f(local.center[1] - local.extent[1]);
    const opts = { keelY: f(f(f(f(m[1] * local.center[0]) + f(m[5] * footY)) + f(m[9] * local.center[2])) + m[13]), boat };
    // Each sweep reaches only to the hull's own end, a departure from the mod. The first sweep keeps a zero
    // hit point as the mod does, and a start overlap pushes the hull off from its center.
    const sweep = (dir, zeroPointOk) => {
      for (const hit of deps.sphereCastAll?.(center, x, vNormalized(dir), reach, opts) ?? []) {
        if (hit.root === boat.GameObject || hit.terrain || hit.entity) continue;
        if (!zeroPointOk && (hit.start || vEquals(hit.point, [0, 0, 0]))) continue;
        const off = vNormalized(vProjectOnPlane(vSub(hit.start ? center : boat.GameObject.position, hit.point), V_UP));
        if (hit.start && vEquals(off, [0, 0, 0])) continue;
        log(`COME SAIL AWAY - BOAT COLLIDED WITH ${hit.name}`);
        state.collisionDirections.push(off);
      }
    };
    sweep(vSub(val2, val3), true);
    sweep(vSub(val3, val2), false);
    if (state.collisionDirections.length > 0) {
      if (state.timeScaleIndex > 0) ResetTimeScale();
      state.CollisionVector = vNormalized(inverseTransformDirection(boat.GameObject, combinedCollisionDirection()));
    } else state.CollisionVector = [0, 0, 0];
  }
  function IncreaseTimeScale() {
    if (deps.enemiesNearby?.()) deps.midScreenText('There are enemies nearby...', f(1.5));
    else if (state.timeScaleIndex < TIME_SCALES.length - 1) {
      state.timeScaleIndex++;
      SetTimeScale(TIME_SCALES[state.timeScaleIndex]);
    }
  }
  function DecreaseTimeScale() {
    if (state.timeScaleIndex > 0) {
      state.timeScaleIndex--;
      SetTimeScale(TIME_SCALES[state.timeScaleIndex]);
    }
  }
  function ResetTimeScale(message = true) {
    if (state.timeScaleIndex !== 0 || f(deps.timeScale?.() ?? 1) !== 1) {
      state.timeScaleIndex = 0;
      SetTimeScale(TIME_SCALES[state.timeScaleIndex], message);
    }
  }
  function SetTimeScale(scale, message = true) {
    deps.setTimeScale?.(scale);
    if (message) deps.midScreenText(`Time scale set to ${scale}.`, f(3 * scale));
  }

  /**
   * @param {string} message
   * @param {any} data
   * @param {((message:string, data:any) => void) | null} [callBack]
   */
  function MessageReceiver(message, data, callBack = null) {
    switch (message) {
      case 'GetWind': callBack?.('GetWind', [...state.windVectorCurrent]); break;
      case 'GetCurrent': callBack?.('GetCurrent', [...state.currentVector]); break;
      case 'OnUpdateWind': if (typeof data === 'function') events.OnUpdateWind.push(data); break;
      case 'OnUpdateCurrent': if (typeof data === 'function') events.OnUpdateCurrent.push(data); break;
      case 'OnUpdateSailing': if (typeof data === 'function') events.OnUpdateSailing.push(data); break;
      case 'ResetTimeScale': ResetTimeScale(); break;
      case 'StopSailing': StopSailingDelayed(); break;
      case 'IsPlayerSailing': callBack?.('IsPlayerSailing', isSailing()); break;
      case 'GetBoatGameObject': callBack?.('GetBoatGameObject', state.CurrentBoat.GameObject); break;
      case 'GetBoatMeshObject': callBack?.('GetBoatMeshObject', state.CurrentBoat.MeshObject); break;
      default: (deps.logError ?? deps.log)?.(`${MOD_OBJECT_NAME}: unknown message received (${message}).`); break;
    }
  }

  function cargoLoad(boat) {
    let num = f(deps.cargoWeight?.(boat.Cargo.Items) ?? 0);
    if (setting('Cargo.PlayerWeight', true)) num = f(num + (deps.entity?.isFemale?.() ? CARGO_WEIGHTS.female : CARGO_WEIGHTS.male));
    if (setting('Cargo.PlayerCarriedWeight', true)) num = f(num + f(deps.entity?.carriedWeight?.() ?? 0));
    if (setting('Cargo.CartCarriedWeight', true)) num = f(num + f(deps.entity?.wagonWeight?.() ?? 0));
    if (setting('Cargo.HorseItem', false) && deps.transport?.hasHorse?.()) num = f(num + CARGO_WEIGHTS.horse);
    if (setting('Cargo.CartItem', false) && deps.transport?.hasCart?.()) num = f(num + CARGO_WEIGHTS.cart);
    // The Carrack has no Cargo modifier: the classic helm divides by zero as the mod does, and the
    // responsive helm uses the largest hold instead.
    const hold = !(boat.modifierCargoThreshold > 0) && responsive() ? CARGO_HOLD_MISSING : boat.modifierCargoThreshold;
    const holdK = Number(refitOf(boat)?.cargo);
    return { load: num, threshold: f(f(f(Number(setting('Cargo.CargoThreshold', 500))) * f(hold)) * (Number.isFinite(holdK) && holdK > 0 ? f(holdK) : 1)) };
  }
  function UpdateBoatCargoMod(boat) {
    const { load: num, threshold } = cargoLoad(boat);
    state.boatCargoMod = mathfClamp(f(2 - f(num / threshold)), 0, 1);
    if (state.lastWeight !== num) {
      state.lastWeight = num;
      const words = cargoModWords(state.boatCargoMod);
      if (words) deps.midScreenText(words, 3);
    }
  }

  function carryChildren(boat, before) {
    const after = boat.GameObject.worldMatrix();
    if (playerParent === boat) {
      deps.helm.setPlayerPosition(carriedPoint(before, after, deps.player().position));
      deps.helm.turnPlayer(yawDelta(before, after));
    }
    for (const { enemy, boat: b } of state.parentedObjects.values()) {
      if (b !== boat) continue;
      enemy.setPosition(carriedPoint(before, after, enemy.position()));
      enemy.turn?.(yawDelta(before, after));
    }
  }

  function StartSailing(boat) {
    deps.hudText('You control the boat!');
    state.CurrentBoat = boat;
    state.oarThrottle = 0;
    state.sailWay = 0;
    if (!deps.transport?.isFoot?.()) deps.transport?.setFoot?.();
    if (boat.crewed && !deps.ship?.owns?.()) {
      state.TemporaryShip = true;
      deps.ship?.assign?.('Small');
    }
    boat.WakeEmitter.stop();
    playerParent = boat;
    deps.helm.setFacing(yawOfForward(quatRotate(boat.GameObject.rotation, [0, 0, 1])), 0);
    deps.helm.setPlayerPosition(boat.DrivePosition.position);
    boat.MapPixel = deps.currentMapPixel();
    helmHanded = handed();
    UpdateBoatCargoMod(boat);
    UpdateCurrentBoatNodes();
    boat.IdleObject?.setActive(false);
    boat.ActiveObject?.setActive(true);
    deps.helm.footsteps?.(false);
    if (state.CurrentBoat.RudderEmitters.length > 0 && !DisableParticles()) for (const rudderEmitter of state.CurrentBoat.RudderEmitters) rudderEmitter.play();
    rudderOf(state.CurrentBoat)?.CrossFade('Rowing', 1);
    raise('OnUpdateSailing', true);
  }
  function stopSailingHead() {
    if (deps.input?.toggleAutorun) deps.input.toggleAutorun = false;
    if (state.TemporaryShip) ReturnTemporaryShip();
    const boat = state.CurrentBoat;
    deps.hudText('You stop controlling the boat!');
    if (state.sailPosition > 0) LowerSails();
    boat.WakeEmitter.stop();
    state.sailPosition = 0;
    state.MoveVectorTarget = [0, 0, 0];
    state.MoveVectorCurrent = [0, 0, 0];
    state.TurnCurrent = 0;
    state.TurnTarget = 0;
    state.lastWeight = 0;
    helmHanded = null;
    boat.MapPixel = deps.currentMapPixel();
    ResetTimeScale();
    boat.ActiveObject?.setActive(false);
    boat.IdleObject?.setActive(true);
    deps.helm.footsteps?.(true);
    rudderOf(boat)?.CrossFade('Disembarked', 1);
    if (boat.RudderEmitters.length > 0) for (const rudderEmitter of boat.RudderEmitters) rudderEmitter.stop();
    return boat;
  }
  function ReturnTemporaryShip() {
    for (const scene of TEMPORARY_SHIP_SCENES) deps.ship?.removePermanentScene?.(scene);
    deps.ship?.assign?.('None');
    state.TemporaryShip = false;
  }
  function unparentPlayer() {
    const forward = deps.player().forward ?? quatRotate(deps.player().rotation, [0, 0, 1]);
    playerParent = null;
    deps.helm.setFacing(yawOfForward(forward), 0);
  }
  function StopSailing() {
    stopSailingTail(stopSailingHead());
  }
  function stopSailingTail(currentBoat) {
    state.CurrentBoat = null;
    currentBoat.way = 0;
    state.gale = null;
    state.oarThrottle = 0;
    unparentPlayer();
    deps.helm.setPlayerPosition(currentBoat.DrivePosition.position);
    deps.helm.freeze(0);
    raise('OnUpdateSailing', false);
  }
  function StopSailingDelayed() {
    if (state.disembarking != null) return;
    const co = { boatlast: null, phase: 'head' };
    state.disembarking = co;
    co.boatlast = stopSailingHead();
    co.phase = 'unparent';
    endOfFrameQueue.push(() => resumeStopSailing(co));
  }
  function resumeStopSailing(co) {
    if (state.disembarking !== co) return false;
    if (co.phase === 'unparent') {
      state.CurrentBoat = null;
      state.gale = null;
      unparentPlayer();
      co.phase = 'hold';
    }
    if (co.phase === 'hold') {
      if (deps.helm.frozen()) {
        // A boat destroyed under the coroutine ends it silently, as Unity's coroutine dies with its transform.
        if (!state.AllBoats.includes(co.boatlast)) { state.disembarking = null; return false; }
        deps.helm.setPlayerPosition(co.boatlast.DrivePosition.position);
        return true;
      }
      raise('OnUpdateSailing', false);
      if (state.disembarking === co) state.disembarking = null;
    }
    return false;
  }
  function endOfFrame() {
    const q = endOfFrameQueue;
    endOfFrameQueue = [];
    for (const step of q) if (step()) endOfFrameQueue.push(step);
  }

  const windDirectionWidget = () => !!setting('WindDirectionWidget.Enable', true);
  const playerForward = () => (deps.player().forward ?? quatRotate(deps.player().rotation, V_FORWARD)).map(f);
  function windWidgetFrameOf(num2) {
    const interval = windWidgetInterval(), count = windWidgetFrameCount();
    let num = Math.trunc(f(f(360 - f(f(num2 / interval) * interval)) / interval));
    if (num2 < 0) num = Math.trunc(f(f(f(f(0 - num2) / interval) * interval) / interval));
    num = mathfClamp(num, 0, count);
    if (num === 0) num = count;
    return count - num;
  }
  /**
   * @param {{ screenRect: { x?: number, y?: number, width: number, height: number }, textureSize?: number[],
   *            largeHudHeight?: number, paused?: boolean, loading?: boolean }} opts
   */
  function windWidget({ screenRect, textureSize = [128, 128], largeHudHeight = 0, paused = false, loading = false }) {
    if (paused || loading || !isSailing() || !windDirectionWidget()) return null;
    const [screenScaleX, screenScaleY] = screenScaleOf(screenRect);
    const offset = setting('WindDirectionWidget.Position', [0.5, 0.5]);
    const scale = f(Number(setting('WindDirectionWidget.Scale', 1)));
    const at = [f(f(screenRect.x ?? 0) + f(screenRect.width * f(offset[0]))), f(f(f(screenRect.y ?? 0) + f(screenRect.height * f(offset[1]))) - largeHudHeight)];
    const size = [f(f(f(textureSize[0]) * screenScaleX) * scale), f(f(f(textureSize[1]) * screenScaleY) * scale)];
    return { frame: state.windWidgetFrame, rect: { x: f(at[0] - f(size[0] * f(0.5))), y: f(at[1] - f(size[1] * f(0.5))), w: size[0], h: size[1] }, color: setting('WindDirectionWidget.Color', '#ffffffff') };
  }

  function screenScaleOf(screenRect) {
    const mode = Number(setting('WindDirectionWidget.ScalingMode', 0));
    let screenScaleX = 1, screenScaleY = 1;
    if (mode === 2) { screenScaleY = f(screenRect.height / WIND_WIDGET.nativeHeight); screenScaleX = f(screenRect.width / WIND_WIDGET.nativeWidth); }
    else if (mode === 1) { screenScaleY = f(screenRect.height / WIND_WIDGET.nativeHeight); screenScaleX = screenScaleY; }
    return [screenScaleX, screenScaleY];
  }

  const trimAuto = () => responsive() || !!setting('SailingAssist.AutoTrimming', true);
  const trimAutoSquareUpwind = () => !!setting('SailingAssist.AutoStowSquareSails', true);
  const flat = (v) => vProjectOnPlane(v, V_UP);
  const forwardOf = (node) => quatRotate(node.rotation, V_FORWARD).map(f);
  function GetSailPower(at = null, all = false) {
    let num = 0;
    const b = state.CurrentBoat;
    if (b.Sails.length < 1) return num;
    for (const sail of b.Sails) {
      if (!all && animatorOf(sail).GetBool('Stowed')) continue;
      let num2 = 0;
      // The mod computes the hull's angle to each sail and discards it; the call stays for parity.
      vAngle(flat(forwardOf(b.GameObject)), flat(forwardOf(sail)));
      const num3 = at ? at(b, sail) : vAngle(flat(state.windVectorCurrent), flat(forwardOf(sail)));
      if (b.SailsLateen.includes(sail)) {
        num2 = num3 <= 135 ? f(mathfLerp(50, 100, f(num3 / 135)) / 100) : !(num3 <= 165) ? 0 : f(mathfLerp(100, 50, f(f(num3 - 135) / 30)) / 100);
        if (!at && vSignedAngle(forwardOf(sail), state.windVectorCurrent, V_UP) > 0) num2 = f(num2 * f(0.85));
        if (num2 < 0) num2 = f(num2 * f(0.5));
      } else if (b.SailsGaff.includes(sail)) {
        num2 = !(num3 <= 135) ? f(mathfLerpUnclamped(100, 0, f(f(num3 - 135) / 15)) / 100) : f(mathfLerpUnclamped(50, 100, f(num3 / 135)) / 100);
        if (num2 < 0) num2 = f(num2 * f(0.25));
      } else if (b.SailsStay.includes(sail)) {
        num2 = !(num3 <= 135) ? f(mathfLerpUnclamped(80, 0, f(f(num3 - 135) / 15)) / 100) : f(mathfLerpUnclamped(20, 80, f(num3 / 135)) / 100);
        if (num2 < 0) num2 = f(num2 * f(0.25));
      } else {
        num2 = f(mathfLerpUnclamped(100, 0, f(num3 / 90)) / 100);
        if (num2 < 0) num2 = f(num2 * 2);
      }
      if (b.SailsSmall.includes(sail)) num2 = b.SailsGaff.includes(sail) ? f(num2 * f(0.5)) : !b.SailsStay.includes(sail) ? f(num2 * f(0.4)) : f(num2 * f(0.3));
      else if (b.SailsLarge.includes(sail)) num2 = f(num2 * f(1.5));
      num = f(num + num2);
    }
    return num;
  }
  const canvasPull = () => GetSailPower(sailCrest);
  function sailDrive(boat) { return freeDrive(canvasPull(), boat); }
  const firmSail = () => 1 + firmStat('sailSpeed') / 100;
  function freeDrive(canvas, boat) {
    const offRun = Math.abs(vSignedAngle(flat(forwardOf(boat.GameObject)), flat(state.windVectorCurrent), V_UP));
    return f(f(f(canvas * f(state.gale ? 1 : pointOfSail(offRun))) * f(galeWind(seaWind(vMagnitude(state.windVectorCurrent))))) * f(SAIL_FREE.pace * firmSail()));
  }
  function sailWayOf(boat) {
    if (!boat || boat !== state.CurrentBoat || boat.Sails.length < 1) return 0;
    const drive = responsive() ? freeDrive(GetSailPower(sailCrest, true), boat) : f(f(GetSailPower(null, true) * vMagnitude(state.windVectorCurrent)) * f(firmSail()));
    return f(drive * sailSpeed(boat, wayHurt(true)));
  }
  const oarWayOf = (boat) => (boat && boat === state.CurrentBoat ? oarSpeed(boat, wayHurt(false)) : 0);
  function ToggleSails() {
    if (state.CurrentBoat.Sails.length < 1) deps.hudText('Boat does not have any sail.');
    else if (state.sailPosition === 0) RaiseSails();
    else LowerSails();
  }
  function RaiseSails() {
    const b = state.CurrentBoat;
    const refused = deps.sailRefused?.() ?? null;
    if (refused) {
      deps.hudText(refused);
      return;
    }
    if (!CanSail(b)) {
      deps.hudText('Unable to raise sail. Boat is obstructed.');
      return;
    }
    deps.hudText('Sail raised!');
    const flag = Math.abs(vSignedAngle(flat(forwardOf(b.GameObject)), flat(state.windVectorCurrent), V_UP)) > 90;
    if (b.Sails.length > 0) {
      for (const sail of b.Sails) {
        if (!b.SailsSquare.includes(sail) || !trimAutoSquareUpwind() || !flag || responsive()) {
          const component = animatorOf(sail);
          if (component != null) stow(component, false);
        }
      }
    }
    state.sailPosition = 1;
    state.oarThrottle = 0;
    deps.audio?.dfOneShot?.(nodeOf(b.GameObject, b.DFAudioSource), 380, 1, loopVolume());
    rudderOf(b)?.SetBool('Sailing', true);
  }
  function LowerSails() {
    const b = state.CurrentBoat;
    deps.hudText('Sail lowered!');
    if (b.Sails.length > 0) {
      for (const sail of b.Sails) {
        const component = animatorOf(sail);
        if (component != null) stow(component, true);
      }
    }
    state.sailPosition = 0;
    deps.audio?.dfOneShot?.(nodeOf(b.GameObject, b.DFAudioSource), 381, 1, loopVolume());
    rudderOf(b)?.SetBool('Sailing', false);
  }
  function HasLargeSquareSailWithGaff(boat) {
    let flag = false;
    if (boat.SailsSquare.length > 0) {
      for (const item of boat.SailsSquare) {
        if (!boat.SailsSmall.includes(item)) { flag = true; break; }
      }
    }
    if (flag) return boat.SailsGaff.length > 0;
    return false;
  }
  function ToggleSquareSails() {
    const b = state.CurrentBoat;
    if (b.SailsSquare.length <= 0) return;
    if (animatorOf(b.SailsSquare[0]).GetBool('Stowed')) {
      deps.hudText('Square sails raised!');
      for (const item of b.SailsSquare) { const component = animatorOf(item); if (component != null) stow(component, false); }
      return;
    }
    deps.hudText('Square sails lowered!');
    for (const item2 of b.SailsSquare) { const component2 = animatorOf(item2); if (component2 != null) stow(component2, true); }
  }
  const squareHandled = (b) => b.SailsSquare.length > 0 && (b.SailsLateen.length > 0 || b.SailsGaff.length > 0) && !trimAutoSquareUpwind();
  const squareStowed = (b) => animatorOf(b.SailsSquare[0])?.GetBool('Stowed') !== false;
  function MoreSail(b) {
    if (b.Sails.length < 1) { deps.hudText('Boat does not have any sail.'); return; }
    if (state.sailPosition === 0) { RaiseSails(); return; }
    if (squareHandled(b) && squareStowed(b)) { ToggleSquareSails(); return; }
    deps.hudText('All sail is set.');
  }
  function LessSail(b) {
    if (b.Sails.length < 1) { deps.hudText('Boat does not have any sail.'); return; }
    if (state.sailPosition === 0) { deps.hudText('The sails are stowed.'); return; }
    if (squareHandled(b) && !squareStowed(b)) { ToggleSquareSails(); return; }
    LowerSails();
  }
  function ladderUp(b) {
    if (state.sailPosition > 0) { MoreSail(b); return; }
    if (state.oarThrottle < 1) { state.oarThrottle += 1; deps.hudText(OAR_RUNG_TEXT[state.oarThrottle]); return; }
    MoreSail(b);
  }
  function ladderDown(b) {
    if (state.sailPosition > 0) {
      LessSail(b);
      if (state.sailPosition === 0) { state.oarThrottle = 1; deps.hudText(OAR_RUNG_TEXT[1]); }
      return;
    }
    if (state.oarThrottle > -1) { state.oarThrottle -= 1; deps.hudText(OAR_RUNG_TEXT[state.oarThrottle]); return; }
    deps.hudText(OAR_ASTERN_TEXT);
  }
  function inIrons(b) {
    if (state.sailPosition === 0 || b.Sails.length < 1 || responsive()) return false;
    const toWind = Math.abs(vSignedAngle(flat(forwardOf(b.GameObject)), flat(state.windVectorCurrent), V_UP));
    // MoveVectorCurrent is her way ahead in her own frame, so the current never hides irons and sternway counts.
    return toWind >= 180 - IRONS_TELL_DEG && state.MoveVectorCurrent[2] < IRONS_TELL_WAY;
  }
  function manualTrim(boat) {
    const squareOnly = boat.SailsLateen.length < 1 && boat.SailsGaff.length < 1;
    if (has(BOAT_ACTIONS.trimRight)) {
      if (has(BOAT_ACTIONS.trimModifier) || squareOnly) {
        if (state.trimAngleSquare < 45) state.trimAngleSquare = f(state.trimAngleSquare + f(15 * dt()));
      } else if (state.trimAngle < 90) state.trimAngle = f(state.trimAngle + f(15 * dt()));
    }
    if (has(BOAT_ACTIONS.trimLeft)) {
      if (has(BOAT_ACTIONS.trimModifier) || squareOnly) {
        if (state.trimAngleSquare > -45) state.trimAngleSquare = f(state.trimAngleSquare - f(15 * dt()));
      } else if (state.trimAngle > -90) state.trimAngle = f(state.trimAngle - f(15 * dt()));
    }
    for (const boom of boat.Booms) boom.localRotation = quatAngleAxis(boom.name.includes('Square') ? state.trimAngleSquare : state.trimAngle, V_UP);
  }
  function sailWind(boat, sail, num9) {
    const between = (a, b, t) => mathfLerp(a, b, t);
    if (boat.SailsSquare.includes(sail)) {
      if (num9 > 0 && num9 <= 90) return between(1, 0, f(num9 / 90));
      if (num9 > 90 && num9 <= 180) return between(0, -1, f(f(num9 - 90) / 90));
      if (num9 <= 0 && num9 > -90) return between(1, 0, f(num9 / -90));
      if (num9 <= -90 && num9 > -180) return between(0, -1, f(f(num9 + 90) / -90));
    } else if (boat.SailsLateen.includes(sail)) {
      if (num9 > 0 && num9 <= 90) return between(0, -1, f(num9 / 90));
      if (num9 > 90 && num9 <= 180) return between(-1, 0, f(f(num9 - 90) / 90));
      if (num9 <= 0 && num9 > -90) return between(0, 1, f(num9 / -90));
      if (num9 <= -90 && num9 > -180) return between(1, 0, f(f(num9 + 90) / -90));
    } else if (boat.SailsGaff.includes(sail)) {
      if (num9 > 0 && num9 <= 90) return between(0, 1, f(num9 / 90));
      if (num9 > 90 && num9 <= 180) return between(1, 0, f(f(num9 - 90) / 90));
      if (num9 <= 0 && num9 > -90) return between(0, -1, f(num9 / -90));
      if (num9 <= -90 && num9 > -180) return between(-1, 0, f(f(num9 + 90) / -90));
    } else if (boat.SailsStay.includes(sail)) {
      if (num9 > 0 && num9 <= 90) return between(1, f(0.25), f(num9 / 90));
      if (num9 > 90 && num9 <= 180) return between(f(0.25), 0, f(f(num9 - 90) / 90));
      if (num9 <= 0 && num9 > -90) return between(-1, f(-0.25), f(num9 / -90));
      if (num9 <= -90 && num9 > -180) return between(f(-0.25), 0, f(f(num9 + 90) / -90));
    }
    return 0;
  }
  function updateSails(boat) {
    if (!CanSail(boat)) {
      LowerSails();
      state.MoveVectorCurrent = [0, 0, 0];
      state.MoveVectorTarget = [0, 0, 0];
      ResetTimeScale();
    }
    const free = responsive();
    if (boat.Sails.length > 0) {
      const num6 = vSignedAngle(flat(forwardOf(boat.GameObject)), flat(state.windVectorCurrent), V_UP);
      const flag = Math.abs(num6) > 90;
      let num7 = 0;
      for (const sail of boat.Sails) {
        const num9 = vSignedAngle(flat(forwardOf(sail)), flat(state.windVectorCurrent), V_UP);
        const num8 = sailWind(boat, sail, num9);
        const component = animatorOf(sail);
        if (component != null) {
          let wind = component.GetFloat('Wind');
          const lateen = boat.SailsLateen.includes(sail);
          if (!free && !boat.SailsSquare.includes(sail) && ((!lateen && (num9 > 150 || num9 < -150)) || (lateen && (num9 > 165 || num9 < -165)))) {
            const num10 = f(f(Math.sin(f(f(f(deps.time()) + num7) * 2))) * f(0.25));
            wind = mathfMoveTowards(wind, num10, dt());
          } else {
            const num11 = f((num8 >= 0 ? 1 : -1) * vMagnitude(state.windVectorCurrent));
            if (free) wind = mathfMoveTowards(wind, boat.SailsSquare.includes(sail) ? f(Math.abs(num11)) : num11, dt());
            else wind = !boat.SailsStay.includes(sail) ? mathfMoveTowards(wind, num11, dt()) : mathfMoveTowards(wind, num8, dt());
          }
          component.SetFloat('Wind', wind);
        }
        if (!free && trimAutoSquareUpwind() && boat.SailsSquare.includes(sail) && component != null) {
          const bool = component.GetBool('Stowed');
          if (flag && !bool) stow(component, true);
          else if (!flag && bool) stow(component, false);
        }
        num7++;
      }
      if (trimAuto()) autoTrim(boat, num6);
    }
    const num17 = f(f(GetSailPower() * vMagnitude(state.windVectorCurrent)) * f(firmSail()));
    let num18 = 0;
    if (has('MoveRight')) num18 = 1;
    else if (has('MoveLeft')) num18 = -1;
    const way = vMagnitude(state.MoveVectorCurrent);
    state.TurnTarget = f(num18 * f(f(f(responsive() ? steerage(way / sailFreeGain(boat)) : way) * f(boat.modifierRudder)) / 10));
    state.MoveVectorTarget = vScale(V_FORWARD, free ? sailDrive(boat) : num17);
    if ((state.TurnTarget > 0 && !CanTurnRight(boat)) || (state.TurnTarget < 0 && !CanTurnLeft(boat))) {
      state.TurnTarget = 0 - num18;
      state.TurnCurrent = state.TurnTarget;
    }
    rudderOf(boat)?.SetFloat('TurnAngle', state.inputCurrent[0]);
  }
  function autoTrim(boat, num6) {
    let num12 = mathfClamp(num6, -45, 45);
    let num13 = 0, num14 = 0;
    if (num6 > 0 && num6 <= 90) { num14 = mathfLerp(-90, -45, f(num6 / 90)); num13 = num14; }
    else if (num6 > 90 && num6 <= 180) { num14 = mathfLerp(-45, 0, f(f(num6 - 90) / 60)); num13 = mathfLerp(-45, 0, f(f(num6 - 90) / 75)); }
    else if (num6 <= 0 && num6 > -90) { num14 = mathfLerp(90, 45, f(num6 / -90)); num13 = num14; }
    else if (num6 <= -90 && num6 > -180) { num14 = mathfLerp(45, 0, f(f(num6 + 90) / -60)); num13 = mathfLerp(45, 0, f(f(num6 + 90) / -75)); }
    if (HasLargeSquareSailWithGaff(boat)) {
      if (num14 > 30) num14 = 30;
      if (num14 < -30) num14 = -30;
      if (num12 > 30) num12 = 30;
      if (num12 < -30) num12 = -30;
    }
    const step = f(100 * dt());
    for (const boom2 of boat.Booms) {
      let flag2 = true;
      let val = null;
      for (let i = 0; i < boom2.childCount; i++) {
        const child = boom2.getChild(i);
        if (child.activeSelf) { val = animatorOf(child); break; }
      }
      if (val != null) flag2 = val.GetBool('Stowed');
      if (boom2.name.includes('Square')) {
        boom2.localRotation = quatRotateTowards(boom2.localRotation, quatAngleAxis(flag2 ? 0 : num12, V_UP), step);
      } else if (boom2.name.includes('Lateen')) {
        boom2.localRotation = quatRotateTowards(boom2.localRotation, quatAngleAxis(flag2 ? 0 : num13, V_UP), step);
      } else {
        if (!boom2.name.includes('Gaff')) continue;
        if (flag2) {
          boom2.localRotation = quatRotateTowards(boom2.localRotation, quatAngleAxis(0, V_UP), step);
          continue;
        }
        let num15 = 100;
        const num16 = vSignedAngle(forwardOf(boom2), forwardOf(boat.GameObject), quatRotate(boat.GameObject.rotation, V_UP).map(f));
        if ((num16 < 0 && num16 < num14) || (num16 > 0 && num16 > num14)) num15 = 300;
        boom2.localRotation = quatRotateTowards(boom2.localRotation, quatAngleAxis(num14, V_UP), f(num15 * dt()));
      }
    }
  }

  function updateSailing() {
    const boat = state.CurrentBoat;
    state.gale = responsive() ? deps.gale?.(boat) ?? null : null;
    deps.helm.stopRunning?.();
    if (!deps.transport?.isFoot?.()) deps.transport?.setFoot?.();
    if (IsBeached(boat) && vSqrMagnitude(state.MoveVectorCurrent) > 0) {
      state.MoveVectorCurrent = [0, 0, 0];
      state.MoveVectorTarget = [0, 0, 0];
      ResetTimeScale();
    }
    if (state.timeScaleIndex !== 0 && deps.enemiesNearby?.()) {
      deps.midScreenText('There are enemies nearby...', f(1.5));
      ResetTimeScale(false);
    }
    // The ladder is read before the stroke, so a press takes effect in its own frame.
    if (deps.input?.started?.('MoveForwards') || deps.input?.started?.(BOAT_ACTIONS.sailUp)) ladderUp(boat);
    else if (deps.input?.started?.('MoveBackwards') || deps.input?.started?.(BOAT_ACTIONS.sailDown)) ladderDown(boat);
    state.inputCurrent = vMoveTowards(state.inputCurrent, inputTarget(), f(f(boat.modifierAnimation) * f(1 * dt())));
    if (windDirectionWidget()) state.windWidgetFrame = windWidgetFrameOf(vSignedAngle(playerForward(), state.windVectorCurrent, V_UP));
    const drive = boat.DrivePosition.position;
    if (!vEquals(deps.player().position, drive)) deps.helm.setPlayerPosition(drive);
    deps.helm.freeze(1);
    if (deps.input?.started?.(BOAT_ACTIONS.toggleSail)) {
      if (state.sailPosition > 0 && boat.SailsSquare.length > 0 && !trimAutoSquareUpwind() && has(BOAT_ACTIONS.trimModifier) && (boat.SailsLateen.length > 0 || boat.SailsGaff.length > 0)) ToggleSquareSails();
      else ToggleSails();
    }
    const irons = inIrons(boat);
    state.ironsFor = irons ? f(state.ironsFor + dt()) : 0;
    if (state.ironsFor >= IRONS_TELL_S && !state.ironsTold) { state.ironsTold = true; deps.hudText(IRONS_TEXT); }
    else if (!irons) state.ironsTold = false;
    if (deps.input?.started?.(BOAT_ACTIONS.disembark) || deps.input?.started?.('Transport')) StopSailingDelayed();
    if (deps.input?.started?.(BOAT_ACTIONS.toggleLight)) setLights(boat, !boat.LightOn);
    if (!trimAuto()) manualTrim(boat);
    if (state.sailPosition === 0) {
      if (!boat.crewed && (vSqrMagnitude(state.MoveVectorTarget) > 0 || state.TurnTarget > 0)) {
        if (state.oarModeTimer >= OAR_MODE_TIME) {
          state.oarModeTimer = 0;
          deps.entity?.decreaseFatigue?.(OAR_FATIGUE);
        } else state.oarModeTimer = f(state.oarModeTimer + dt());
      }
      let num3 = 0, num4 = 0, num5 = 0;
      // While the autorun rows she has no rung, so letting it go leaves her oars at rest.
      if (deps.input?.toggleAutorun) state.oarThrottle = 0;
      // As in the mod, ahead reads node 0 and the turns read nodes 2 and 3; astern reads the stern, not the bow.
      if ((state.oarThrottle > 0 || deps.input?.toggleAutorun) && IsNodeOnWater(boat, 0)) num3 = 1;
      else if (state.oarThrottle < 0 && IsNodeOnWater(boat, 2)) num3 = -1;
      if (has('Run')) {
        if (has('MoveRight') && IsNodeOnWater(boat, 2)) num4 = 0.5;
        else if (has('MoveLeft') && IsNodeOnWater(boat, 3)) num4 = -0.5;
      } else if (state.oarThrottle < 0) {
        if (has('MoveRight')) num5 = -1;
        else if (has('MoveLeft')) num5 = 1;
      } else if (has('MoveRight')) num5 = 1;
      else if (has('MoveLeft')) num5 = -1;
      state.TurnTarget = num5;
      state.MoveVectorTarget = vAdd(vScale([0, 0, 1], num3), vScale([1, 0, 0], num4));
      if ((state.TurnTarget > 0 && !CanTurnRight(boat)) || (state.TurnTarget < 0 && !CanTurnLeft(boat))) {
        state.TurnTarget = 0 - num5;
        state.TurnCurrent = state.TurnTarget;
      }
      const rudder = rudderOf(boat);
      if (rudder != null) {
        rudder.SetFloat('RowZ', state.inputCurrent[1]);
        rudder.SetFloat('RowX', state.inputCurrent[0]);
        rudder.SetFloat('RowSpeed', mathfClamp(f(vMagnitude(state.MoveVectorCurrent) / 20), f(0.2), 2));
      }
    } else {
      updateSails(boat);
    }
    state.TurnCurrent = mathfMoveTowards(state.TurnCurrent, f(state.TurnTarget * turnSpeed()), f(turnAccel() * dt()));
    state.velocityTarget = vScale(state.MoveVectorTarget, moveSpeed());
    const was = vMagnitude(state.MoveVectorCurrent);
    state.sailWay = Math.min(state.sailWay, was);
    state.MoveVectorCurrent = vMoveTowards(state.MoveVectorCurrent, state.velocityTarget, f(moveAccel() * dt()));
    const way = vMagnitude(state.MoveVectorCurrent);
    state.sailWay = way < was ? state.sailWay * (way / was) : state.sailPosition === 1 ? state.sailWay + (way - was) : state.sailWay;
    const speed = vMagnitude(state.MoveVectorCurrent);
    if (speed >= wakeThreshold() && !boat.AudioSourceFast.isPlaying) {
      if (!DisableParticles()) boat.WakeEmitter.play();
      PlayFast(boat, true);
    } else if (speed < wakeThreshold() && !boat.AudioSourceSlow.isPlaying) {
      boat.WakeEmitter.stop();
      PlaySlow(boat, true);
    }
    const wakeScale = f(boat.WakeObject.localScale[0]);
    boat.WakeEmitterMain.startLifetimeMultiplier = mathfClamp(f(f(f(speed * f(0.2)) / HANDLING.moveSpeedSail) * wakeScale), 1, 10);
    boat.WakeEmitterMain.startSize = constantCurve(f(f(speed * f(0.2)) / HANDLING.moveSpeedSail));
    const forceOverLifetime = boat.WakeEmitter.forceOverLifetime;
    forceOverLifetime.space = SPACE.World;
    forceOverLifetime.x = constantCurve(f(f(f(state.currentVector[0]) * f(0.1)) / wakeScale));
    forceOverLifetime.z = constantCurve(f(f(f(state.currentVector[2]) * f(0.1)) / wakeScale));
    if (deps.timeLocked?.()) {
      if (BOAT_TIME_ACTIONS.some((a) => deps.input.started(a))) deps.midScreenText(HELM_TIME_LOCKED_TEXT, f(1.5));
      return;
    }
    if (deps.input.started(BOAT_ACTIONS.timeScaleUp)) IncreaseTimeScale();
    if (deps.input.started(BOAT_ACTIONS.timeScaleDown)) DecreaseTimeScale();
    if (deps.input.started(BOAT_ACTIONS.timeScaleReset)) ResetTimeScale();
  }

  function lateUpdateSailing() {
    const boat = state.CurrentBoat;
    const t = boat.GameObject;
    const fwd = quatRotate(t.rotation, [0, 0, 1]);
    // Unlike the mod, a beached boat rereads its nodes every frame, so ground fixed since can free her.
    if (!vEquals(state.lastBoatPosition, t.position) || !vEquals(state.lastBoatDirection, fwd)) {
      state.lastBoatPosition = t.position.map(f);
      state.lastBoatDirection = fwd.map(f);
      UpdateCurrentBoatNodes();
    } else if (IsBeached(boat) && deps.playerTerrain() != null) {
      UpdateBoatNodes(boat);
      if (!IsBeached(boat)) CheckCollision(boat);
    }
    boat.way = 0;
    if (!IsBeached(boat)) {
      const w = deps.warp?.(boat, { struck: state.sailPosition === 0, oars: vSqrMagnitude(state.MoveVectorTarget) > 0 || state.TurnTarget !== 0, dt: dt() }) ?? null;
      if (w) {
        state.MoveVectorCurrent = [0, 0, 0];
        state.velocityCurrent = [0, 0, 0];
        state.TurnCurrent = 0;
        const before = t.worldMatrix();
        setPositionChecked(t, [f(w.pos[0]), t.position[1], f(w.pos[1])], log);
        setLocalRotationChecked(t, normalizeQ(w.rotation), log);
        carryChildren(boat, before);
        return;
      }
      const drift = deps.drift?.(boat) ?? null;
      let val = inverseTransformDirection(t, drift ? vAdd(state.currentVector, drift) : state.currentVector);
      // Only way into an obstacle is taken off, a departure from the mod, so a hull moving away keeps her way.
      if (!vEquals(state.CollisionVector, [0, 0, 0])) {
        if (vDot(state.MoveVectorCurrent, state.CollisionVector) <= 0) state.MoveVectorCurrent = vAdd(vProjectOnPlane(state.MoveVectorCurrent, state.CollisionVector), state.CollisionVector);
        if (vDot(val, state.CollisionVector) < 0) val = vProjectOnPlane(val, state.CollisionVector);
      }
      state.velocityCurrent = vAdd(state.MoveVectorCurrent, val);
      boat.way = vMagnitude(state.velocityCurrent);
      const before = t.worldMatrix();
      const step = vScale(state.velocityCurrent, dt());
      setPositionChecked(t, vAdd(t.position, quatRotate(t.rotation, step).map(f)), log);
      setLocalRotationChecked(t, normalizeQ(quatMultiply(t.localRotation, quatAngleAxis(f(f(state.TurnCurrent) * dt()), V_UP))), log);
      carryChildren(boat, before);
    }
  }

  function animate() {
    lives.animate(state.AllBoats, dt());
  }
  function update({ paused = false } = {}) {
    updateBody(paused);
    runDelayedCalls();
  }
  function updateBody(paused) {
    if (paused) { state.wasPaused = true; return; }
    // A journey begun in the pause had no LateUpdate to latch it, so it is latched here before the reset reads it.
    if (state.wasPaused) latchTravelling();
    if (state.wasPaused && f(deps.timeScale?.() ?? 1) !== 1 && !state.isTravelling) ResetTimeScale();
    state.wasPaused = false;
    recoverLostBoats();
    if (isSailing() && state.CurrentBoat != null) updateSailing();
    if (!waveOn() || animatedWaterWaves()) return;
    const step = stepWaveFrame(state.waveFrameIndex, state.waveFrameTimer, waveFrameTimeOf(setting('Waves.Speed', 100)), dt(), WAVE_FRAME_COUNT, isDayHour(deps.hour?.() ?? 12));
    state.waveFrameIndex = step.index;
    state.waveFrameTimer = step.timer;
  }
  function recoverLostBoats() {
    if (state.AllBoats.length < 1 || deps.isPlayerInside()) return;
    const t0 = deps.playerTerrain?.();
    if (t0 == null) return;
    for (const boat of [...state.AllBoats]) {
      if (boat.groundAsked || boat.inside || boat === state.CurrentBoat || !boat.GameObject?.activeSelf) continue;
      const p = boat.GameObject.position, o = t0.position;
      // Only boats near the player are judged: a Recall moves the scene frame, and a far boat would read as buried.
      if (Math.abs(p[0] - o[0]) > 2 * TERRAIN_EDGE || Math.abs(p[2] - o[2]) > 2 * TERRAIN_EDGE) { boat.lostAt = null; continue; }
      const t = deps.terrainAt(t0.mapPixelX + Math.floor((p[0] - o[0]) / TERRAIN_EDGE), t0.mapPixelY - Math.floor((p[2] - o[2]) / TERRAIN_EDGE));
      if (t == null) continue;
      const ground = f(f(t.position[1]) + f(t.sampleHeight(p)));
      const lost = ground > p[1] + LOST_UNDER_M || p[1] < seaTop() - LOST_UNDER_M;
      if (!lost || boat.crewed) { boat.groundAsked = true; boat.lostAt = null; continue; }
      const now = f(deps.time());
      // A lost reading must hold LOST_CONFIRM_S of game time, so a passing frame never packs a hull.
      boat.lostAt ??= now;
      if (now - boat.lostAt < LOST_CONFIRM_S) continue;
      boat.groundAsked = true;
      deps.hudText('A boat of yours was lost where no one could reach it');
      PackBoat(boat, true, true);
    }
  }
  function latchTravelling() {
    const travelling = deps.travelOptionsActive?.();
    if (travelling != null) {
      state.isTravelling = !!travelling;
      if (state.isTravelling && !state.wasTravelling) state.wasTravelling = state.isTravelling;
      if (!state.isTravelling && state.wasTravelling) state.wasTravelling = state.isTravelling;
    }
  }
  function runDelayedCalls() {
    if (!delayedCalls.length) return;
    const now = f(deps.time());
    const due = delayedCalls.filter((c) => now >= c.at);
    if (!due.length) return;
    delayedCalls = delayedCalls.filter((c) => now < c.at);
    for (const c of due) c.step();
  }
  function lateUpdate({ paused = false, activateComplete = false } = {}) {
    animate();
    simulateParticles();
    if (paused) return;
    latchTravelling();
    if (isSailing()) lateUpdateSailing();
    else if (state.placing && activateComplete && f(f(deps.time()) - f(state.placeTime)) > PLACE_CLICK_DELAY && !holdsItem(state.placeItemCollection, state.placeItem)) {
      StopPlacing();
    } else if (state.placing && activateComplete && f(f(deps.time()) - f(state.placeTime)) > PLACE_CLICK_DELAY) {
      const hullFromMessage_ = hullFromMessage(state.placeItem.message);
      const variantFromMessage_ = variantFromMessage(state.placeItem.message);
      log(`COME SAIL AWAY - ITEM HULL IS ${hullFromMessage_}`);
      log(`COME SAIL AWAY - ITEM VARIANT IS ${variantFromMessage_}`);
      PlaceBoatAtRayHit(hullFromMessage_, variantFromMessage_);
    }
    lateUpdateBoats();
  }
  function simulateParticles() {
    lives.particles(state.AllBoats);
  }
  function lateUpdateBoats() {
    let flag = false;
    const ctx = { models: deps.pool.models };
    for (let i = 0; i < state.AllBoats.length; i++) {
      const boat = state.AllBoats[i];
      if (!boat.GameObject.activeSelf) continue;
      const bounds = meshLocalBounds(ctx, boat.MeshCollider.m_Mesh);
      const val2 = boat.MeshObject.inverseTransformPoint(deps.player().position).map(f);
      if (!deps.iliacPuddleNoMore()) val2[1] = f(bounds.center[1]);
      if (boundsContains(bounds, val2)) flag = true;
      if (!IsBeached(boat)) {
        const magnitude = vMagnitude(state.windVectorCurrent);
        let num = 0;
        if (boat === state.CurrentBoat) {
          const m = vMagnitude(state.MoveVectorCurrent);
          num = m < wakeThreshold() ? 0 : f(f(state.TurnCurrent / HANDLING.turnSpeedSail) * f(f(m * f(0.1)) / HANDLING.moveSpeedSail));
        }
        let num2 = f(f(deps.time()) + i);
        num2 = f(num2 / TIME_SCALES[state.timeScaleIndex]);
        // The roll is not scaled by modifierAnimation, as the mod's operator precedence has it.
        const roll = f(mathfClamp(f(f(0 - num) * 5), -30, 30) + f(f(Math.sin(f(f(num2 * f(0.5)) * magnitude))) * magnitude));
        const pitch = f(f(f(Math.sin(f(num2 * magnitude))) * magnitude) * f(boat.modifierAnimation));
        boat.MeshObject.localRotation = quatEuler(pitch, 0, roll);
      }
      if (boat.FlagObject != null) {
        const val6 = vAdd(state.windVectorCurrent, vScale(quatRotate(boat.GameObject.rotation, vScale(state.MoveVectorCurrent, -1)).map(f), f(0.1)));
        boat.FlagObject.rotation = quatLookRotation(vNormalized(val6));
        boat.FlagEmitterMain.startSpeed = constantCurve(f(vMagnitude(val6) * f(0.5)));
      }
    }
    const walking = !!deps.effects?.isWaterWalking();
    if (flag && !walking) StartWaterwalking();
    else if (!flag && walking) EndWaterwalking();
  }
  function fixedUpdate({ paused = false } = {}) {
    if (paused) return;
    if (state.AllBoats.length > 0) {
      const enemies = deps.enemies?.() ?? [];
      const live = new Set(enemies.map((e) => e.key));
      for (const k of [...state.parentedObjects.keys()]) if (!live.has(k)) state.parentedObjects.delete(k);
      const ctx = { models: deps.pool?.models };
      const hulls = state.AllBoats.map((b) => (ctx.models && b.MeshObject && b.MeshCollider ? colliderBounds(ctx, b.MeshObject, b.MeshCollider) : null));
      for (const enemy of enemies) {
        if (!enemy.hasController) continue;
        const at = enemy.position(), reach = f(enemy.height);
        const hit = downRayNearHull(hulls, at, reach) ? deps.raycast(at, [0, -1, 0], reach, { triggers: true }) : null;
        const parent = state.parentedObjects.get(enemy.key)?.boat ?? null;
        if (hit) {
          let boat = null;
          for (const allBoat of state.AllBoats) {
            if (hit.node != null && hit.node === allBoat.MeshObject && hit.collider === allBoat.MeshCollider) { boat = allBoat; break; }
          }
          if (boat != null && enemy.grounded()) {
            if (parent !== boat) state.parentedObjects.set(enemy.key, { enemy, boat });
          } else if (parent != null) state.parentedObjects.delete(enemy.key);
        } else if (parent != null) state.parentedObjects.delete(enemy.key);
        if (state.parentedObjects.has(enemy.key)) state.parentedObjects.get(enemy.key).enemy = enemy;
      }
    }
    if (!waveOn() || animatedWaterWaves()) return;
    const night = !isDayHour(deps.hour?.() ?? 12);
    const N = state.currentNeighbors;
    // N is the last water pixel's neighbors, as in the mod.
    if (N != null) {
      const position = deps.player().position;
      let num = f(state.windVectorCurrent[0]);
      if (position[0] > f(614.4) && N[2][1]) num = 1;
      else if (position[0] < f(204.8) && N[0][1]) num = -1;
      let num2 = f(state.windVectorCurrent[2]);
      if (position[2] > f(614.4) && N[1][0]) num2 = 1;
      else if (position[2] < f(204.8) && N[1][2]) num2 = -1;
      state.currentVector = vScale(vScale(vNormalized([num, 0, num2]), vMagnitude(state.windVectorCurrent)), f(0.5));
      if (N[1][1]) state.currentVector = vScale(state.currentVector, -1);
      if (night) state.currentVector = vScale(state.currentVector, -1);
    } else if (deps.blockWaterLevel() !== NO_WATER_LEVEL) state.currentVector = [0, 0, 0];
    else state.currentVector = vScale(state.windVectorCurrent, f(0.5));
    if (!vEquals(state.currentVector, state.currentVectorPrevious)) {
      raise('OnUpdateCurrent', [...state.currentVector]);
      state.currentVectorPrevious = [...state.currentVector];
    }
  }

  const boatOfHit = (hit) => state.AllBoats.find((b) => hit?.root != null && hit.root === b.GameObject) ?? null;
  function ActivateRudder(hit, mode) {
    const boat = boatOfHit(hit);
    if (boat == null) return;
    if (mode === 'steal') {
      if (boat.packable) {
        if (state.CurrentBoat != null && state.CurrentBoat === boat) deps.midScreenText('You cannot pack a boat you are driving!', 1.5);
        else if ((deps.passengersAboard?.(boat) ?? 0) > 0) deps.midScreenText(PASSENGERS_ABOARD_TEXT, 1.5);
        else if (deedMissing(boat)) deps.midScreenText(DEED_NOT_HELD_TEXT, 1.5);
        else if (partsTooHeavy(boat)) deps.midScreenText(PARTS_TOO_HEAVY_TEXT, 1.5);
        else PackBoat(boat, true);
      }
    } else if (isSailing() && boat === state.CurrentBoat) StopSailingDelayed();
    else StartSailing(boat);
  }
  function BoardBoat(hit) {
    const boat = boatOfHit(hit);
    if (boat == null) return;
    const at = boardPlaceOf(hit.node);
    deps.helm.setPlayerPosition(at.position);
    deps.helm.setFacing(at.yaw, 0);
    deps.helm.alignToGround?.(3);
    // The ladder must not carry fall or air momentum onto the deck.
    deps.helm.finishBoarding?.();
    deckPressed(boat);
  }
  function TriggerDoor(hit) {
    const boat = boatOfHit(hit);
    if (boat == null) return;
    turnDoor(hit.node);
  }
  function turnDoor(triggerNode) {
    const component = animatorOf(triggerNode.parent);
    if (component != null) {
      const bool = component.GetBool('Opened');
      component.SetBool('Opened', !bool);
      deps.audio?.dfClipAtPoint?.(bool ? 93 : 94, [...triggerNode.position], 1);
    }
  }
  function CheckBoatStatus(hit) {
    if (boatOfHit(hit) != null) deps.messageBox?.(NICE_BOAT_TEXT);
  }
  function activate(modelId, hit, mode) {
    if (hit?.distance <= ACTIVATION_DISTANCE) noteFirstUse('ships');
    if (!(hit.distance <= ACTIVATION_DISTANCE)) return false;
    switch (ACTIVATIONS[modelId]) {
      case 'ActivateRudder': ActivateRudder(hit, mode); break;
      case 'BoardBoat': BoardBoat(hit); break;
      case 'CheckBoatStatus': CheckBoatStatus(hit); break;
      case 'TriggerDoor': TriggerDoor(hit); break;
      case 'OpenBoatCargo': OpenBoatCargo(hit); break;
      case 'PickVariant': PickVariant(hit); break;
      case 'CheckBoatPosition': CheckBoatPosition(hit); break;
      default: break;
    }
    return true;
  }

  const portSearchRange = () => Number(setting('Controls.PortLocationSearchRange', 3)) | 0;
  // The square is centered on the player, a departure from the mod's loops, which fell short east and south.
  function IsNearPort(range = 3) {
    const currentMapPixel = deps.currentMapPixel();
    for (let i = currentMapPixel.X - range; i <= currentMapPixel.X + range; i++) {
      for (let j = currentMapPixel.Y - range; j <= currentMapPixel.Y + range; j++) {
        if (deps.isPortTown?.(i, j)) return true;
      }
    }
    return false;
  }
  function sayNoPort(text) {
    const near = deps.nearestPort?.() ?? null;
    if (near) deps.midScreenText(`${text}. The nearest port is ${near.name}, to the ${near.way}`, f(4));
    else deps.midScreenText(text, f(1.5));
  }
  function PackBoat(boat, item = false, lost = false) {
    if (item && boat?.charter) return false;
    if (!lost && seaHoldShut(boat?.uid)) { deps.messageBox?.(seaHoldShutText()); return false; }
    if (item) {
      const deed = boat.crewed && boat.uid ? deedInPack(boat.uid) : null;
      if (boat.crewed && boat.uid && deed == null) return false;
      // A lost boat packs whatever it weighs: left, no one could ever reach it.
      if (!lost && partsTooHeavy(boat)) return false;
      deps.hudText('You store the boat in your inventory');
      const val = deps.items.create(BOAT_PARTS_TEMPLATE);
      // The parts keep the boat's UID (the mod mints a new one), so her naval state and crew return with her.
      if (boat.uid) val.UID = boat.uid;
      val.message = boatItemMessage(boat.hull, boat.variant);
      val.value = Number.isFinite(boat.itemValue) ? boat.itemValue : HULL_PRICES[boat.hull];
      // The hold's weight is never added to the parts, a departure from the mod, so the parts stay liftable.
      val.weightInKg = packedHullWeight(boat.hull);
      val.name = boatItemName(val.name, boat.hull, boat.variant);
      if (boat.Cargo.Items.length > 0) {
        const key = cargoKey(val.UID);
        // Checked before the hold moves; an emptied entry under her own UID may be refilled.
        if (state.PackedCargoes.has(key) && !(boat.uid && state.PackedCargoes.get(key).length === 0)) throw new Error(`ArgumentException: An item with the same key has already been added. (${key})`);
        const val3 = [];
        transferAll(boat.Cargo.Items, val3);
        state.PackedCargoes.set(key, val3);
      }
      if (deed) removeExact(inBook(deed) ? deps.items.titles() : deps.items.player(), deed);
      deps.items.addToPlayer(val);
    }
    boat.MapPixel = null;
    deps.pool.remove(boat);
    const i = state.AllBoats.indexOf(boat);
    if (i >= 0) state.AllBoats.splice(i, 1);
    return true;
  }
  const deedInPack = (uid) => (deps.items?.player?.() ?? []).find((it) => it?.templateIndex === BOAT_DEED_TEMPLATE && it.UID === uid)
    ?? (deps.items?.titles?.() ?? []).find((it) => it?.templateIndex === BOAT_DEED_TEMPLATE && it.UID === uid) ?? null;
  const inBook = (deed) => (deps.items?.titles?.() ?? []).includes(deed);
  const deedMissing = (boat) => !!boat?.crewed && !!boat.uid && deedInPack(boat.uid) == null;
  function partsTooHeavy(boat) {
    const most = deps.entity?.maxEncumbrance?.();
    if (!Number.isFinite(most)) return false;
    return canHoldAmount(1, packedHullWeight(boat.hull), most, 0) <= 0;
  }
  function OpenCargo(boat) { if (seaHoldShut(boat?.uid)) { deps.messageBox?.(seaHoldShutText()); return; } deps.openCargo?.(boat.Cargo); }
  function OpenBoatCargo(hit) { OpenCargo(boatOfHit(hit)); }
  function PickVariant(hit) {
    const boat = boatOfHit(hit);
    if (boat != null && !isSailing()) OpenBoatVariantPicker(boat);
  }
  function OpenBoatVariantPicker(boat) {
    if (boat.VariantObject == null || boat.GetVariantCount < 1) { deps.midScreenText('This boat has no variants', f(1.5)); return; }
    if (!IsNearPort(portSearchRange())) { sayNoPort('There is no port nearby'); return; }
    state.variantBoatTarget = boat;
    const rows = [];
    for (let i = 0; i < boat.GetVariantCount; i++) rows.push(String(i));
    deps.openListPicker?.(rows, (index) => OpenBoatVariantPicker_OnItemPicked(index));
  }
  function OpenBoatVariantPicker_OnItemPicked(index) {
    deps.audio?.uiOneShot?.(360);
    deps.popWindow?.();
    deps.pool.setVariant(state.variantBoatTarget, index);
    state.variantBoatTarget = null;
  }
  function useBoatParts(item, collection) {
    deps.log('COME SAIL AWAY - USING BOAT PARTS!');
    if (deps.isPlayerInside() && deps.blockWaterLevel() === NO_WATER_LEVEL) return false;
    deps.closeInventory?.();
    StartPlacing(item, collection);
    return true;
  }
  function useBoatDeed(item, collection) {
    deps.log('COME SAIL AWAY - USING BOAT PARTS!');
    if (deps.isPlayerInside()) return false;
    deps.closeInventory?.();
    const placedBoatWithUID = GetPlacedBoatWithUID(item.UID);
    if (placedBoatWithUID != null) {
      const here = deps.currentMapPixel();
      if ((placedBoatWithUID.MapPixel?.X !== here.X || placedBoatWithUID.MapPixel?.Y !== here.Y) && !IsNearPort(portSearchRange())) {
        sayNoPort('There is no port nearby or ship is in another location');
        return false;
      }
    } else if (!IsNearPort(portSearchRange())) {
      sayNoPort('There is no port nearby');
      return false;
    }
    StartPlacing(item, collection);
    return true;
  }
  const mapRestrictTime = () => setting('Map.RestrictPositionReadingTime', true) !== false;
  const mapRestrictWeather = () => setting('Map.RestrictPositionReadingWeather', true) !== false;
  const mapMarkerClickRange = () => Number(setting('Map.ClickRangeThreshold', 5));
  const mapLineThickness = () => Number(setting('Map.PositionLineThickness', 2));
  const mapMarkerThickness = () => Number(setting('Map.MarkerThickness', 2));
  const mapMarkerOutlineThickness = () => Number(setting('Map.MarkerOutlineThickness', 2));
  const mapBackdropOpacity = () => f(Number(setting('Map.BackdropOpacity', 50)) * f(0.01));
  const debugShow = () => !!setting('Debug.ShowValues', false);
  const thicknessFinal = (v) => (deps.input?.key?.('LeftShift') ? 0 : v);
  function CheckBoatPosition(hit) {
    const boat = boatOfHit(hit);
    if (boat != null) StartShowBoatPosition(boat);
  }
  function StartShowBoatPosition(boat) {
    if (state.showingBoatPosition == null) {
      state.showingBoatPosition = ShowBoatPositionCoroutine(boat);
      startCoroutine(state.showingBoatPosition);
    }
  }
  function ShowBoatPositionCoroutine(boat) {
    let phase = 'start';
    return () => {
      for (;;) {
        switch (phase) {
          case 'start':
            deps.messageBox('According to my instruments...');
            phase = 'box';
            return true;
          case 'box':
            if (deps.topWindowIsMessageBox()) return true;
            phase = 'read';
            return true;
          case 'read': {
            const weather = deps.weatherType?.() ?? WEATHER_TYPE.Sunny;
            const hour = deps.hour?.() ?? 12;
            if ((!mapRestrictWeather() || weather < WEATHER_TYPE.Overcast) && (!mapRestrictTime() || (hour > 10 && hour < 13) || hour > 22 || hour < 1)) {
              state.mapShowingPosition = true;
              phase = 'show';
              return true;
            }
            state.mapShowingPosition = false;
            deps.messageBox("...no good. I can't get a reading at this time.");
            phase = 'noGood';
            return true;
          }
          case 'noGood':
            if (deps.topWindowIsMessageBox()) return true;
            phase = 'show';
            continue;
          case 'show':
            state.mapShowing = true;
            phase = 'loop';
            return true;
          case 'loop':
            if (!state.mapShowing) {
              delayedCalls.push({ at: f(f(deps.time()) + 1), step: () => { state.showingBoatPosition = null; } });
              return false;
            }
            mapShowingFrame();
            return true;
          default:
            return false;
        }
      }
    };
  }
  function mapShowingFrame() {
    if (!deps.gamePaused()) deps.map.open();
    for (let k = 0; k < 8; k++) if (deps.input.keyDown(`Alpha${k + 1}`)) state.mapMarkerMode = k;
    if (deps.input.keyDown('Mouse0')) LeftClickOnMap();
    if (deps.input.keyDown('Mouse1')) RightClickOnMap();
    if (deps.input.keyUp('Escape')) {
      deps.map.close();
      StopShowBoatPosition();
    }
  }
  const IsPositionMarked = (pos) => state.mapMarkers.some((m) => m.position[0] === pos[0] && m.position[1] === pos[1]);
  function mapUnderMouse() {
    const sr = deps.screenRect();
    const r = mapRect(sr, screenScaleOf(sr));
    const val2 = guiMouse(sr, deps.mousePosition());
    return guiRectContains(r, val2) ? mapPixelUnder(r, val2) : null;
  }
  function LeftClickOnMap() {
    const val3 = mapUnderMouse();
    if (!val3) return;
    log(`COME SAIL AWAY - MOUSE IS OVER MAP PIXEL (${val3[0]}, ${val3[1]})`);
    if (!IsPositionMarked(val3)) {
      const d = deps.date();
      const newLabel = markerLabel(val3, dayOfMonthWithSuffix(d.day), monthNames()[d.month]);
      state.mapMarkers.push({ position: val3, label: newLabel, color: { ...MAP_MARKER_MODE_COLORS[state.mapMarkerMode] } });
    }
  }
  function RightClickOnMap() {
    const val3 = mapUnderMouse();
    if (!val3) return;
    log(`COME SAIL AWAY - MOUSE IS OVER MAP PIXEL (${val3[0]}, ${val3[1]})`);
    let num4 = Infinity;
    let num5 = -1;
    // Walked from the last marker, as in the mod, so of two equally near the later one goes.
    for (let num6 = state.mapMarkers.length - 1; num6 > -1; num6--) {
      const num3 = vector2IntDistance(state.mapMarkers[num6].position, val3);
      if (num3 <= mapMarkerClickRange() && num3 < num4) { num4 = num3; num5 = num6; }
    }
    if (num5 !== -1) state.mapMarkers.splice(num5, 1);
  }
  function StopShowBoatPosition() { state.mapShowing = false; }
  /** @param {{ screenRect: { x?: number, y?: number, width: number, height: number }, screen: number[], unscaledTime: number }} o */
  function mapOverlay({ screenRect, screen, unscaledTime }) {
    if (!state.mapShowing) return null;
    const here = deps.currentMapPixel();
    return mapOverlayDraws({
      screenRect, screen, scale: screenScaleOf(screenRect), mouse: guiMouse(screenRect, deps.mousePosition()), unscaledTime,
      showingPosition: state.mapShowingPosition, pixel: [here.X, here.Y], markers: state.mapMarkers, markerMode: state.mapMarkerMode,
      opacity: mapBackdropOpacity(), lineThickness: thicknessFinal(mapLineThickness()), markerThickness: thicknessFinal(mapMarkerThickness()),
      outlineThickness: thicknessFinal(mapMarkerOutlineThickness()), markerThicknessRaw: mapMarkerThickness(), clickRange: mapMarkerClickRange(),
    });
  }
  function debugValues({ paused = false, loading = false } = {}) {
    if (paused || loading || !isSailing() || !debugShow()) return null;
    const shadowPos = [DAGGERFALL_DEFAULT_SHADOW_POS[0] * 2, DAGGERFALL_DEFAULT_SHADOW_POS[1] * 2];
    const text = (v, x, y, color) => ({ kind: 'text', text: csFloatString(vMagnitude(v)), x, y, scale: 5, color, shadow: COLOR_BLACK, shadowPos });
    return [text(state.velocityCurrent, 0, 0, COLOR_RED), text(state.velocityTarget, 500, 0, COLOR_GREEN), text(state.windVectorCurrent, 0, 50, COLOR_BLUE)];
  }
  function StartWaterwalking() {
    const fx = deps.effects;
    if (!fx) return;
    if (fx.bundleNames().includes(BOAT_EFFECT_BUNDLE)) return;
    fx.assignBundle({ name: BOAT_EFFECT_BUNDLE, bundleType: 'Spell', targetType: 'CasterOnly', effectKey: WATER_WALKING_SILENT,
      durationBase: 90000, durationPlus: 0, durationPerLevel: 1, bypassSavingThrows: true });
  }
  function EndWaterwalking() {
    const fx = deps.effects;
    if (!fx) return;
    const name = fx.bundleNames().find((n) => n === BOAT_EFFECT_BUNDLE || n === JESUS_MODE_BUNDLE);
    if (name != null) fx.removeBundle(name);
  }
  function consoleGiveBoat(args) {
    const text = "Boat deed added to player's inventory";
    let num = 0;
    let num2 = 0;
    if (args.length === 0) {
      num = random.range(0, 4);
      if (num === 1) num2 = random.range(0, 7);
    } else if (args.length === 1) {
      num = convertToInt32(args[0]);
      if (num === 1) num2 = random.range(0, 7);
    } else if (args.length === 2) {
      num = convertToInt32(args[0]);
      num2 = convertToInt32(args[1]);
    }
    const val = deps.items.create(BOAT_DEED_TEMPLATE);
    val.message = boatItemMessage(num, num2);
    val.name = boatItemName(val.name, num, num2);
    deps.items.addToPlayer(val);
    return text;
  }

  // A disembark in flight ends with the load's start, or it would hold the loaded player at a destroyed boat.
  function OnStartLoad() {
    state.parentedObjects.clear();
    if (isSailing()) StopSailing();
    else if (state.disembarking != null) EndDisembark();
    else ResetTimeScale(false);
  }
  function EndDisembark() {
    const co = state.disembarking;
    state.disembarking = null;
    stopSailingTail(co.boatlast);
  }
  function OnPreFastTravel() {
    if (state.placing) StopPlacing();
    if (isSailing()) {
      const currentBoat = state.CurrentBoat;
      StopSailing();
      if (currentBoat.packable) PackBoat(currentBoat, true);
    } else ResetTimeScale(false);
  }
  // The mod hears no Recall or other teleport, so each leaves the helm as a fast travel does.
  function OnPreJump() {
    if (state.disembarking != null) EndDisembark();
    OnPreFastTravel();
  }
  function OnPostFastTravel() {
    ResetTimeScale(false);
  }
  function OnPlayerDeath() {
    if (isSailing()) StopSailing();
    else ResetTimeScale(false);
  }
  function OnNewMagicRound() {
    if (isSailing()) UpdateBoatCargoMod(state.CurrentBoat);
  }

  function StartPlacing(item, itemCollection) {
    if (partsStanding(item)) { deps.midScreenText(PARTS_STANDING_TEXT, 3); return; }
    if (!state.placing) {
      state.placing = true;
      state.placeTime = deps.time();
      state.placeItem = item;
      state.placeItemCollection = itemCollection;
      deps.midScreenText('Place the boat in water', 3);
    }
  }
  function StopPlacing() {
    state.placing = false;
    state.placeItem = null;
  }
  // Parts whose boat is already placed never place a second boat of the same number.
  const partsStanding = (item) => item?.templateIndex === BOAT_PARTS_TEMPLATE && !!item.UID && GetPlacedBoatWithUID(item.UID) != null;

  function SpawnBoat(boat) {
    const p = deps.player();
    const spawned = deps.pool.spawnNow(boat, { position: [...p.position], rotation: [...p.rotation] });
    const listener = boat.RudderObject?.getComponent?.('RudderAnimationEventListener');
    if (listener) {
      listener.OarEvent_In = () => OarEvent_In();
      listener.OarEvent_Sweep = () => OarEvent_Sweep();
      listener.OarEvent_Out = () => OarEvent_Out();
    }
    return spawned;
  }
  // A loop resumes only if it played as its object went inactive, a departure from Unity's playOnAwake.
  function setBoatActive(boat, on) {
    boat.GameObject.setActive(on);
    for (const src of [boat.AudioSourceSlow, boat.AudioSourceFast]) {
      if (!src) continue;
      if (on) { if (src.playOnAwake !== false && (src.awake ?? src === boat.AudioSourceSlow) && src.clip != null) audioPlay(src); }
      else { src.awake = src.isPlaying; if (src.isPlaying) audioStop(src); }
    }
  }

  function PlaceBoat(position, direction, hull = 0, variant = 0, terrain = null) {
    const boat = new Boat(hull, variant);
    SpawnBoat(boat);
    state.AllBoats.push(boat);
    SetBoatPositionAndDirection(boat, position, direction, terrain);
    PlaySlow(boat);
    return boat;
  }
  function LaunchFromParts(item, itemCollection, position, direction, terrain = null) {
    if (item?.templateIndex !== BOAT_PARTS_TEMPLATE || partsStanding(item)) return null;
    if (state.placing) StopPlacing();
    state.placeItem = item;
    state.placeItemCollection = itemCollection;
    deps.hudText('Boat placed!');
    const boat = PlaceBoat([...position], [...direction], hullFromMessage(item.message), variantFromMessage(item.message), terrain);
    takePlaceItem(boat);
    StopPlacing();
    return boat;
  }
  function LaunchFromDeed(deed, itemCollection, position, direction, terrain = null) {
    if (deed?.templateIndex !== BOAT_DEED_TEMPLATE || GetPlacedBoatWithUID(deed.UID) != null) return null;
    state.placeItem = deed;
    state.placeItemCollection = itemCollection;
    const placed = PlaceBoat([...position], [...direction], hullFromMessage(deed.message), variantFromMessage(deed.message), terrain);
    takePlaceItem(placed);
    StopPlacing();
    return placed;
  }
  function SummonBoat(uid, title, titles, position, direction, terrain = null) {
    const boat = GetPlacedBoatWithUID(uid);
    if (boat) {
      if (boat === state.CurrentBoat || (deps.passengersAboard?.(boat) ?? 0) > 0) return null;
      if (state.placing) StopPlacing();
      boat.inside = false;
      RepositionBoat(boat, [...position], [...direction], terrain);
      return boat;
    }
    if (state.placing) StopPlacing();
    return title ? LaunchFromDeed(title, titles, position, direction, terrain) : null;
  }
  function LayUpBoat(boat) {
    if (!boat?.uid || boat === state.CurrentBoat || (deps.passengersAboard?.(boat) ?? 0) > 0) return false;
    if (seaHoldShut(boat.uid)) { deps.messageBox?.(seaHoldShutText()); return false; }
    if (boat.Cargo.Items.length > 0) {
      const key = cargoKey(boat.uid);
      const kept = state.PackedCargoes.get(key) ?? [];
      transferAll(boat.Cargo.Items, kept);
      state.PackedCargoes.set(key, kept);
    }
    boat.MapPixel = null;
    deps.pool.remove(boat);
    const i = state.AllBoats.indexOf(boat);
    if (i >= 0) state.AllBoats.splice(i, 1);
    return true;
  }
  const laidUpHold = (uid) => {
    const key = cargoKey(uid);
    if (!state.PackedCargoes.has(key)) state.PackedCargoes.set(key, []);
    return state.PackedCargoes.get(key);
  };
  const forgetHold = (uid) => {
    const key = cargoKey(uid), held = state.PackedCargoes.get(key);
    if (held?.length) return false;
    return state.PackedCargoes.delete(key);
  };
  function PlaceBoatOnTerrain(newBoat, position, direction, terrain = null) {
    SpawnBoat(newBoat);
    SetBoatPositionAndDirection(newBoat, position, direction, terrain);
    PlaySlow(newBoat);
  }
  function PlaceBoatAtMapPixel(newBoat, position, direction, mapPixel = null) {
    SpawnBoat(newBoat);
    SetBoatPositionAndDirectionAtMapPixel(newBoat, position, direction, mapPixel);
    PlaySlow(newBoat);
  }
  function RepositionBoat(boat, position, direction, terrain = null) {
    SetBoatPositionAndDirection(boat, position, direction, terrain);
    UpdateBoatVisibilityOf(boat);
    PlaySlow(boat);
  }
  function RepositionBoatAtMapPixel(boat, position, direction, mapPixel = null) {
    SetBoatPositionAndDirectionAtMapPixel(boat, position, direction, mapPixel);
    UpdateBoatVisibilityOf(boat);
    PlaySlow(boat);
  }

  function takePlaceItem(boat) {
    if (state.placeItem != null) {
      boat.uid = state.placeItem.UID;
      if (Number.isFinite(state.placeItem.value)) boat.itemValue = state.placeItem.value;
      if (state.PackedCargoes.has(cargoKey(state.placeItem.UID))) {
        const value = state.PackedCargoes.get(cargoKey(state.placeItem.UID));
        transferAll(value, boat.Cargo.Items);
      }
      if (!boat.crewed) removeItem(state.placeItemCollection, state.placeItem);
      else if (state.placeItem.templateIndex === BOAT_PARTS_TEMPLATE) {
        if (deps.items?.retitle?.(boat, state.placeItem)) removeExact(state.placeItemCollection, state.placeItem);
        else swapItem(state.placeItemCollection, state.placeItem, mintDeed(boat.hull, boat.variant, state.placeItem.UID, state.placeItem.value));
      }
    }
  }

  function PlaceBoatAtRayHitArgs(args) {
    let num = 0;
    let variant = 0;
    if (args.length === 0) variant = random.range(0, 7);
    else if (args.length === 1) {
      num = convertToInt32(args[0]);
      if (num === 0) variant = random.range(0, 7);
    } else if (args.length === 2) {
      num = convertToInt32(args[0]);
      variant = convertToInt32(args[1]);
    }
    PlaceBoatAtRayHit(num, variant);
  }

  function PlaceBoatAtRayHit(hull = 0, variant = 0) {
    if (!deps.pool.ready()) {
      log('[come-sail-away] the boats\' models have not loaded yet - placement aborted');
      StopPlacing();
      return;
    }
    const cam = deps.camera();
    const origin = [...cam.position];
    const l = Math.hypot(cam.forward[0], cam.forward[1], cam.forward[2]) || 1;
    const direction = [cam.forward[0] / l, cam.forward[1] / l, cam.forward[2] / l];
    const val2 = deps.raycast(origin, direction, PLACE_RAY_DISTANCE, { triggers: true });
    const ipnm = !!deps.iliacPuddleNoMore();
    if (val2) {
      if (ipnm && String(val2.name).includes('DeepWaters')) {
        deps.hudText('Boat placed!');
        const at = afloatAt(val2, origin, direction);
        let boat = null;
        let terrain = null;
        const val5 = deps.raycast(at, [0, -1, 0], PLACE_RAY_DISTANCE, { triggers: false });
        if (val5) terrain = val5.terrain ?? null;
        if (state.placeItem != null && state.placeItem.templateIndex === BOAT_DEED_TEMPLATE) boat = GetPlacedBoatWithUID(state.placeItem.UID);
        if (boat == null) boat = PlaceBoat(at, playerRight(), hull, variant, terrain);
        else RepositionBoat(boat, at, playerRight(), terrain);
        takePlaceItem(boat);
        StopPlacing();
        return;
      }
      if (deps.blockWaterLevel() !== NO_WATER_LEVEL) {
        const num = f(f(f(deps.blockWaterLevel()) * -1) * f(0.025));
        log(`COME SAIL AWAY - PLACING BOAT IN DUNGEON WITH WATER LEVEL AT ${num}`);
        const num2 = upPlaneRaycast(origin, direction, num);
        if (num2 == null) {
          log('COME SAIL AWAY - PLACEMENT DOES NOT INTERSECT WITH PLANE');
          StopPlacing();
          return;
        }
        if (num2 > PLACE_RAY_DISTANCE) {
          log(`COME SAIL AWAY - INTERSECTION WITH WATER PLANE IS TOO FAR AT ${num2}`);
          StopPlacing();
          return;
        }
        if (val2.distance > num2) {
          deps.hudText('Boat placed!');
          const boat2 = PlaceBoat(alongRay(origin, direction, num2), playerRight(), hull, variant);
          boat2.inside = true;
          takePlaceItem(boat2);
          StopPlacing();
          return;
        }
      }
      if (val2.terrain != null && tileMapIndexAtPosition(val2.point, val2.terrain) === 0) {
        // A water tile above the sea's line (a harbor basin) is refused: placed there she would lie beached.
        if (ipnm && nodeReadingAt(val2.point, val2.terrain) !== 0) {
          deps.midScreenText(PLACE_RAISED_TEXT, 3);
          StopPlacing();
          return;
        }
        deps.hudText('Boat placed!');
        let boat3 = null;
        if (state.placeItem != null && state.placeItem.templateIndex === BOAT_DEED_TEMPLATE) boat3 = GetPlacedBoatWithUID(state.placeItem.UID);
        if (boat3 == null) boat3 = PlaceBoat([...val2.point], playerRight(), hull, variant, val2.terrain);
        else RepositionBoat(boat3, [...val2.point], playerRight(), val2.terrain);
        takePlaceItem(boat3);
        StopPlacing();
      } else {
        deps.midScreenText('Boat can only be placed on water!', 3);
        StopPlacing();
      }
    } else if (ipnm) {
      const num3 = upPlaneRaycast(origin, direction, seaTop());
      // Unlike the mod, the sea plane must be met within the placing ray's reach.
      if (num3 != null && num3 > PLACE_RAY_DISTANCE) {
        log(`COME SAIL AWAY - INTERSECTION WITH WATER PLANE IS TOO FAR AT ${num3}`);
        deps.hudText('Placement aborted!', 3);
        StopPlacing();
      } else if (num3 != null) {
        deps.hudText('Boat placed!');
        let boat4 = null;
        if (state.placeItem != null && state.placeItem.templateIndex === BOAT_DEED_TEMPLATE) boat4 = GetPlacedBoatWithUID(state.placeItem.UID);
        if (boat4 == null) boat4 = PlaceBoat(alongRay(origin, direction, num3), playerRight(), hull, variant);
        else RepositionBoat(boat4, alongRay(origin, direction, num3), playerRight(), null);
        takePlaceItem(boat4);
        StopPlacing();
      } else {
        log('COME SAIL AWAY - PLACEMENT DOES NOT INTERSECT WITH PLANE');
        StopPlacing();
      }
    } else {
      deps.hudText('Placement aborted!', 3);
      StopPlacing();
    }
  }

  function SetBoatPositionAndDirection(boat, position, direction, terrain = null) {
    boat.WakeEmitter.stop();
    boat.GameObject.position = [...position];
    boat.GameObject.rotation = quatLookRotation(direction);
    boat.MapPixel = deps.currentMapPixel();
    if (terrain != null && !sameTerrain(terrain, deps.playerTerrain())) boat.MapPixel = GetMapPixelFromTerrain(terrain);
    UpdateBoatNodes(boat, terrain);
  }
  function GetMapPixelFromTerrain(terrain) {
    for (const val of deps.terrains()) {
      if (val === terrain) return { X: val.mapPixelX, Y: val.mapPixelY };
    }
    return null;
  }
  function SetBoatPositionAndDirectionAtMapPixel(boat, position, direction, mapPixel = null) {
    boat.WakeEmitter.stop();
    boat.GameObject.position = [...position];
    boat.GameObject.rotation = quatLookRotation(direction);
    boat.MapPixel = mapPixel;
    UpdateBoatNodesAtMapPixel(boat, mapPixel);
  }

  const nodeReadingAt = (point, terrain) => (deps.iliacPuddleNoMore() ? (terrain.sampleHeight(point) < WATER_LEVEL ? 0 : 1) : tileMapIndexAtPosition(point, terrain));
  function readNodes(boat, terrain) {
    for (let j = 0; j < boat.NodeTileMapIndices.length; j++) boat.NodeTileMapIndices[j] = nodeReadingAt(boat.Nodes[j].position, terrain);
  }
  function nodesInside(boat) {
    if (!deps.isPlayerInside()) return false;
    if (deps.blockWaterLevel() !== NO_WATER_LEVEL) boat.NodeTileMapIndices.fill(0);
    return true;
  }
  function UpdateBoatNodes(boat, terrain = null) {
    if (nodesInside(boat)) return;
    let val = deps.playerTerrain();
    if (terrain != null) val = terrain;
    readNodes(boat, val);
  }
  function UpdateBoatNodesAtMapPixel(boat, mapPixel) {
    if (nodesInside(boat)) return;
    const terrainTransform = deps.terrainAt(mapPixel.X, mapPixel.Y);
    if (terrainTransform == null) return;
    readNodes(boat, terrainTransform);
  }
  // Left as the mod has it: nothing calls it, and the pixel compare is between two references, never equal.
  function UpdateAllBoatsNodes() {
    if (state.AllBoats.length < 1 || deps.isPlayerInside()) return;
    for (const allBoat of state.AllBoats) {
      if (allBoat.MapPixel === deps.currentMapPixel()) UpdateBoatNodes(allBoat);
    }
  }

  const pixelsApart = (a, b) => Math.max(Math.abs(a.X - b.X), Math.abs(a.Y - b.Y));
  // A boat placed underground shows only in a dungeon; the mod showed it in any interior on its pixel.
  const inDungeon = () => deps.isPlayerInsideDungeon?.() ?? true;
  function UpdateBoatVisibility() {
    if (state.AllBoats.length < 1) return;
    if (deps.isPlayerInside() && !deps.keepExteriorBoats?.()) {
      for (const allBoat of state.AllBoats) {
        const cur = deps.currentMapPixel();
        if (allBoat.inside && inDungeon() && allBoat.MapPixel.X === cur.X && allBoat.MapPixel.Y === cur.Y) {
          if (!allBoat.GameObject.activeSelf) setBoatActive(allBoat, true);
        } else if (allBoat.GameObject.activeSelf) setBoatActive(allBoat, false);
      }
      return;
    }
    const list = [];
    for (const allBoat2 of state.AllBoats) {
      if (allBoat2.inside || (allBoat2.MapPixel != null && pixelsApart(deps.currentMapPixel(), allBoat2.MapPixel) > 1)) {
        if (allBoat2.inside && !deps.persistentDungeonBoats()) list.push(allBoat2);
        if (allBoat2.GameObject.activeSelf) setBoatActive(allBoat2, false);
      } else {
        if (!allBoat2.GameObject.activeSelf) setBoatActive(allBoat2, true);
        UpdateBoatNodesAtMapPixel(allBoat2, allBoat2.MapPixel);
      }
    }
    if (list.length <= 0) return;
    for (const item of list) {
      state.AllBoats.splice(state.AllBoats.indexOf(item), 1);
      deps.pool.remove(item);
    }
  }
  function UpdateBoatVisibilityOf(boat) {
    if (boat == null) return;
    if (deps.isPlayerInside() && !deps.keepExteriorBoats?.()) {
      const cur = deps.currentMapPixel();
      if (boat.inside && inDungeon() && boat.MapPixel.X === cur.X && boat.MapPixel.Y === cur.Y) {
        if (!boat.GameObject.activeSelf) setBoatActive(boat, true);
      } else if (boat.GameObject.activeSelf) setBoatActive(boat, false);
      return;
    }
    if (boat.inside || (boat.MapPixel != null && pixelsApart(deps.currentMapPixel(), boat.MapPixel) > 1)) {
      if (boat.GameObject.activeSelf) setBoatActive(boat, false);
    } else if (!boat.GameObject.activeSelf) setBoatActive(boat, true);
    UpdateBoatNodesAtMapPixel(boat, boat.MapPixel);
  }

  function OnPositionUpdate(offset) {
    UpdateWaveMesh();
    if (state.AllBoats.length < 1) return;
    for (const allBoat of state.AllBoats) {
      if (ridesTheWorld(allBoat)) OnPositionUpdateBoat(allBoat, offset);
      UpdateBoatVisibilityOf(allBoat);
    }
  }
  // Every boat follows an origin shift, seen or not, except a hidden dungeon boat, which keeps the dungeon frame.
  const ridesTheWorld = (boat) => !boat.inside || boat.GameObject.activeSelf;
  function OnWorldReanchored(offset) {
    if (state.AllBoats.length < 1) return;
    for (const boat of state.AllBoats) {
      if (ridesTheWorld(boat)) shiftBoat(boat, offset);
      UpdateBoatVisibilityOf(boat);
    }
  }
  function OnPositionUpdateBoat(boat, offset) {
    shiftBoat(boat, offset);
    if (boat === state.CurrentBoat) {
      deps.helm.setPlayerPosition(boat.DrivePosition.position);
      boat.MapPixel = deps.currentMapPixel();
      if (vMagnitude(state.MoveVectorCurrent) >= wakeThreshold() && !DisableParticles()) boat.WakeEmitter.play();
    }
  }
  // The rudder's splashes are not moved, as in the mod.
  function shiftBoat(boat, offset) {
    boat.WakeEmitter.stop();
    const p = boat.GameObject.position;
    boat.GameObject.position = [f(f(p[0]) + f(offset[0])), f(f(p[1]) + f(offset[1])), f(f(p[2]) + f(offset[2]))];
    const shift = (system) => { if (system.particleCount > 0) system.setParticles(system.getParticles().map((q) => ({ ...q, position: vAdd(q.position, offset) }))); };
    shift(boat.WakeEmitter);
    if (boat.OarParticles.length > 0) for (const oarParticle of boat.OarParticles) shift(oarParticle.subEmitters[0].system);
  }

  function OnLoad() {
    UpdateBoatVisibility();
    UpdateWaveMesh();
    if (windStaleOutdoors(deps.isPlayerInside(), state.windVectorCurrent)) UpdateWind(deps.weatherType?.() ?? WEATHER_TYPE.Sunny);
  }
  function OnTransition() {
    ResetTimeScale(false);
    UpdateBoatVisibility();
    UpdateWind(deps.weatherType?.() ?? WEATHER_TYPE.Sunny);
    UpdateWaveMesh();
  }
  function OnTeleportToCoordinates() { UpdateWaveMeshDelayed(); }

  const waveOn = () => !!setting('Waves.Enable', true);
  const animatedWaterWaves = () => ANIMATED_WATER != null && !!setting('Compatibility.AnimatedWaterVertexWaves', false);
  function UpdateWaveMesh() {
    state.waveObject.mesh = null;
    if (!waveOn() || animatedWaterWaves() || deps.isPlayerInside() || deps.transport?.isOnShip?.()) return;
    const r = buildWaveMesh({
      heightMapValue: deps.heightMapValue,
      raycast: (origin, direction, maxDistance) => deps.raycast(origin, direction, maxDistance, { triggers: true }),
      mapPixel: deps.currentMapPixel(),
      worldCompensation: deps.worldCompensation(),
      waveDistance: Math.trunc(Number(setting('Waves.Distance', 2))),
      waterLevel: WATER_LEVEL,
    });
    state.waveObject.position = r.position;
    if (r.neighbors !== undefined) state.currentNeighbors = r.neighbors;
    state.waveObject.mesh = r.mesh;
  }
  let fading = null;
  const DisableParticles = () => animatedWaterWaves();
  const loopVolume = () => f(f(deps.soundVolume?.() ?? 1) * f(setting('Audio.SoundVolume', 1)));
  // Unlike Unity's Play, a source already playing is not restarted, so a crossfade never cuts its loop.
  const audioPlay = (src) => { if (!src.isPlaying) src.plays = (src.plays ?? 0) + 1; src.isPlaying = true; deps.audio?.play?.(src); };
  const audioStop = (src) => { src.isPlaying = false; deps.audio?.stop?.(src); };
  function UpdateAudioSource() {
    if (state.AllBoats.length < 1) return;
    for (const allBoat of state.AllBoats) {
      if (allBoat.AudioSourceSlow.volume > 0) allBoat.AudioSourceSlow.volume = loopVolume();
      if (allBoat.AudioSourceFast.volume > 0) allBoat.AudioSourceFast.volume = loopVolume();
    }
  }
  let lastLoopVolume = loopVolume();
  // Unlike the mod, a change of the game's Sound Volume also updates the loops already playing.
  function checkSettings() {
    const v = loopVolume();
    if (v === lastLoopVolume) return;
    lastLoopVolume = v;
    UpdateAudioSource();
  }
  function OarEvent_In() { oarEvent(f(0.4), 2); }
  function OarEvent_Sweep() { oarEvent(0, 3); }
  function OarEvent_Out() { oarEvent(f(0.1), 4); }
  function oarEvent(startDelay, clip) {
    if (!isSailing()) return;
    const boat = state.CurrentBoat;
    if (boat.OarParticles.length > 0 && !DisableParticles()) {
      for (const oarParticle of boat.OarParticles) {
        oarParticle.main.startDelay = constantCurve(startDelay);
        oarParticle.play();
      }
    }
    if (state.timeScaleIndex === 0) {
      const component = boat.RudderObject?.getComponent?.('AudioSource');
      if (component != null) deps.audio?.oneShot?.(component, nodeOf(boat.GameObject, component), AUDIO_CLIPS[clip], loopVolume());
    }
  }
  function PlaySlow(boat, crossfade = false) {
    if (crossfade) { CrossfadeAudioSource(boat.AudioSourceFast, boat.AudioSourceSlow); return; }
    audioStop(boat.AudioSourceFast);
    FadeAudioSource(boat.AudioSourceSlow, 0, loopVolume());
  }
  function PlayFast(boat, crossfade = false) {
    if (crossfade) { CrossfadeAudioSource(boat.AudioSourceSlow, boat.AudioSourceFast); return; }
    audioStop(boat.AudioSourceSlow);
    FadeAudioSource(boat.AudioSourceFast, 0, loopVolume());
  }
  function startFading(body, settle = null) {
    const h = { stopped: false, settle };
    fading = h;
    startCoroutine(() => !h.stopped && body(h));
    return h;
  }
  // One fade handle serves every boat, so a stopped fade lands where it was going.
  function FadeAudioSource(target, from, to, duration = 1) {
    if (fading != null) { fading.stopped = true; fading.settle?.(); }
    startFading(FadeAudioSourceCoroutine(target, from, to, duration), () => {
      if (to === 0) audioStop(target);
      else { audioPlay(target); target.volume = to; }
    });
  }
  function CrossfadeAudioSource(from, to, duration = 2) {
    if (fading == null) startFading(CrossfadeAudioSourceCoroutine(from, to, duration), () => { audioStop(from); audioPlay(to); to.volume = loopVolume(); });
  }
  function FadeAudioSourceCoroutine(target, from, to, duration) {
    let time = 0, begun = false;
    return (h) => {
      if (!begun) { begun = true; audioPlay(target); }
      if (time < duration) {
        target.volume = mathfLerp(from, to, f(time / duration));
        time = f(time + dt());
        return true;
      }
      if (to === 0) audioStop(target);
      if (fading === h) fading = null;
      return false;
    };
  }
  function CrossfadeAudioSourceCoroutine(from, to, duration) {
    let time = 0, begun = false;
    return (h) => {
      if (!begun) { begun = true; audioPlay(from); audioPlay(to); }
      if (time < duration) {
        const num = f(time / duration);
        from.volume = mathfLerp(loopVolume(), 0, num);
        to.volume = mathfLerp(0, loopVolume(), num);
        time = f(time + dt());
        return true;
      }
      audioStop(from);
      if (fading === h) fading = null;
      return false;
    };
  }

  function UpdateWaveMeshDelayed(delay = 0.1) {
    delayedCalls.push({ at: f(f(deps.time()) + f(delay)), step: UpdateWaveMesh });
  }

  function UpdateWind(weather) {
    if (deps.isPlayerInside()) {
      state.windVectorTarget = [0, 0, 0];
      state.windVectorCurrent = [0, 0, 0];
      return;
    }
    let num = f(rangeFloat(1, 2));
    if (weather === WEATHER_TYPE.Fog) num = f(num * f(0.1));
    else if (weather === WEATHER_TYPE.Rain) num = f(num * f(1.5));
    else if (weather === WEATHER_TYPE.Thunder) num = f(num * 2);
    const hour = deps.hour?.() ?? 12;
    let right = hour <= 6 || hour >= 18 ? vAdd(V_RIGHT, V_FORWARD) : vAdd(V_RIGHT, V_BACK);
    if (deps.currentMapPixel().Y > 250) right = vScale(right, -1);
    const num2 = f(15 * random.range(-4, 4));
    const val = quatRotate(quatAngleAxis(num2, V_UP), right).map(f);
    state.windVectorTarget = vScale(vNormalized(val), num);
    // Each call starts another RotateWind, so two running turn the wind twice as fast, as in the mod.
    startCoroutine(RotateWind);
  }
  function RotateWind() {
    if (!vEquals(state.windVectorCurrent, state.windVectorTarget)) {
      state.windVectorCurrent = vRotateTowards(state.windVectorCurrent, state.windVectorTarget, f(f(0.1) * dt()), 1);
      const [wx, , wz] = state.windVectorCurrent;
      deps.precipitationForce?.({
        rain: { x: twoConstantsCurve(f(wx * 10), f(wx * 50)), z: twoConstantsCurve(f(wz * 10), f(wz * 50)) },
        snow: { x: twoConstantsCurve(f(wx * 5), f(wx * 25)), z: twoConstantsCurve(f(wz * 5), f(wz * 25)) },
      });
      return true;
    }
    raise('OnUpdateWind', [...state.windVectorCurrent]);
    return false;
  }
  function startCoroutine(step) {
    if (step()) endOfFrameQueue.push(step);
  }
  function OnNewHour() { UpdateWind(deps.weatherType?.() ?? WEATHER_TYPE.Sunny); }
  function OnWeatherChange(next) { UpdateWind(next); }

  function GetPlacedBoatWithUID(UID) {
    if (state.AllBoats.length < 1) return null;
    let result = null;
    for (const allBoat of state.AllBoats) {
      if (allBoat.uid === UID) { result = allBoat; break; }
    }
    return result;
  }
  function GetHitBoatIndex(hit) {
    let result = -1;
    for (let i = 0; i < state.AllBoats.length; i++) {
      if (hit?.root != null && hit.root === state.AllBoats[i].GameObject) { result = i; break; }
    }
    return result;
  }

  function consolePlaceBoat(args) {
    if (args.length > 2) return 'Error - Too many arguments, check the usage notes.';
    PlaceBoatAtRayHitArgs(args);
    return 'Attempting to place boat';
  }
  function consolePrintBoats() {
    if (state.AllBoats.length < 1) return 'No placed boats!';
    let text = '';
    for (let i = 0; i < state.AllBoats.length; i++) {
      const boat = state.AllBoats[i];
      text = `${text}${i} - ${HULL_NAMES[boat.hull]} at ${boat.MapPixel.X}, ${boat.MapPixel.Y}\n`;
    }
    return text;
  }
  function consoleIdentifyBoat() {
    const cam = deps.camera();
    const l = Math.hypot(cam.forward[0], cam.forward[1], cam.forward[2]) || 1;
    const hit = deps.raycast([...cam.position], [cam.forward[0] / l, cam.forward[1] / l, cam.forward[2] / l], PLACE_RAY_DISTANCE, { triggers: true });
    if (hit) {
      const num = GetHitBoatIndex(hit);
      if (num === -1) return 'Hit object is not a boat!';
      return `Hit object is a boat with index ${num}`;
    }
    return 'Nothing was hit!';
  }
  function consolePurgeBoat(args) {
    if (args.length < 1) return 'Error - No arguments provided, check the usage notes.';
    if (args.length > 1) return 'Error - Too many arguments, check the usage notes.';
    const num = convertToInt32(args[0]);
    if (num >= state.AllBoats.length) return 'Error - Index is out of range';
    const boat = state.AllBoats[num];
    if (boat === undefined) throw new RangeError(`ArgumentOutOfRangeException: Index was out of range. (${num})`);
    state.AllBoats.splice(num, 1);
    deps.pool.remove(boat);
    return `Boat at index ${num} was purged.`;
  }

  function newSaveData() {
    return {
      worldCompensation: { x: 0, y: 0, z: 0 },
      placedBoats: [],
      placedMapMarkers: [],
      currentBoat: -1,
      TemporaryShip: false,
      sailPosition: 0,
      moveVectorCurrent: { x: 0, y: 0, z: 0 },
      moveVectorTarget: { x: 0, y: 0, z: 0 },
      windVector: { x: 0, y: 0, z: 1 },
      packedCargoes: {},
    };
  }
  function getSaveData() {
    if (pendingRestore) return JSON.parse(JSON.stringify(pendingRestore));
    const data = newSaveData();
    data.worldCompensation = v3(deps.worldCompensation());
    let num = -1;
    if (state.AllBoats.length > 0) {
      for (let i = 0; i < state.AllBoats.length; i++) {
        const b = state.AllBoats[i];
        data.placedBoats.push({
          UID: b.uid,
          Hull: b.hull,
          Variant: b.variant,
          MapPixel: b.MapPixel ? { X: b.MapPixel.X, Y: b.MapPixel.Y } : null,
          Position: v3(b.GameObject.position),
          Direction: v3(quatRotate(b.GameObject.rotation, V_FORWARD)),
          Items: deps.packedItems.serialize(b.Cargo.Items),
          lights: b.LightOn,
          inside: b.inside,
          ...(Number.isFinite(b.itemValue) ? { Value: b.itemValue } : {}),
          ...(b.charter ? { Charter: JSON.parse(JSON.stringify(b.charter)) } : {}),
        });
        if (state.CurrentBoat === b) num = i;
      }
    }
    if (state.mapMarkers.length > 0) {
      log('COME SAIL AWAY - SAVING MAP MARKERS!');
      for (const m of state.mapMarkers) data.placedMapMarkers.push({ position: { x: m.position[0], y: m.position[1] }, label: m.label, color: m.color });
    }
    data.currentBoat = num;
    data.TemporaryShip = state.TemporaryShip;
    data.sailPosition = state.sailPosition;
    data.moveVectorCurrent = v3(state.MoveVectorCurrent);
    data.moveVectorTarget = v3(state.MoveVectorTarget);
    if (state.sailWay > 0) data.sailWay = state.sailWay;
    data.windVector = v3(state.windVectorCurrent);
    if (state.PackedCargoes.size > 0) {
      data.packedCargoes = {};
      for (const [uid, items] of state.PackedCargoes) data.packedCargoes[uid] = deps.packedItems.serialize(items);
    }
    return data;
  }
  function restoreSaveData(dataIn) {
    if (!deps.pool.ready()) { pendingRestore = dataIn; return; }
    pendingRestore = null;
    applySaveData(dataIn);
  }
  function applySaveData(dataIn) {
    if (isSailing()) StopSailing();
    if (state.AllBoats.length > 0) {
      for (const allBoat of state.AllBoats) deps.pool.remove(allBoat);
      state.AllBoats.length = 0;
    }
    state.mapMarkers.length = 0;
    // A field the record lacks keeps its default, as the mod's serializer leaves it.
    const data = { ...newSaveData(), ...dataIn };
    const num = f(f(deps.worldCompensation()[1]) - f(data.worldCompensation?.y ?? 0));
    if (data.placedBoats != null && data.placedBoats.length > 0) {
      for (const placedBoat of data.placedBoats) {
        const boat = new Boat(placedBoat.Hull, placedBoat.Variant);
        boat.uid = placedBoat.UID;
        const p = arr3(placedBoat.Position);
        boat.Position = [p[0], f(p[1] + num), p[2]];
        boat.Direction = arr3(placedBoat.Direction);
        boat.MapPixel = placedBoat.MapPixel ? { X: placedBoat.MapPixel.X, Y: placedBoat.MapPixel.Y } : null;
        boat.inside = !!placedBoat.inside;
        if (Number.isFinite(placedBoat.Value)) boat.itemValue = placedBoat.Value;
        if (placedBoat.Charter && typeof placedBoat.Charter === 'object') boat.charter = placedBoat.Charter;
        state.AllBoats.push(boat);
        PlaceBoatAtMapPixel(boat, boat.Position, boat.Direction, boat.MapPixel);
        boat.Cargo.Items = deps.packedItems.deserialize(placedBoat.Items ?? []);
        boat.Cargo.ContainerImage = CARGO_CONTAINER_IMAGE;
        setLights(boat, !!placedBoat.lights);
      }
    }
    if (data.placedMapMarkers.length > 0) {
      log('COME SAIL AWAY - LOADED SAVE HAS MAP MARKERS!');
      for (const m of data.placedMapMarkers) {
        AddMapMarker([roundToInt(m.position.x), roundToInt(m.position.y)], m.color, m.label);
      }
    }
    if (state.AllBoats.length > 0 && data.currentBoat !== -1) {
      state.TemporaryShip = !!data.TemporaryShip;
      const boat = state.AllBoats[data.currentBoat];
      if (boat === undefined) throw new RangeError(`ArgumentOutOfRangeException: Index was out of range. (${data.currentBoat})`);
      StartSailing(boat);
      // The sails go up before the saved wind is restored, so the pre-load wind decides the stow, as in the mod.
      if (data.sailPosition > 0) RaiseSails();
      state.MoveVectorCurrent = arr3(data.moveVectorCurrent);
      state.MoveVectorTarget = arr3(data.moveVectorTarget);
      state.sailWay = Math.min(Number(data.sailWay) || 0, vMagnitude(state.MoveVectorCurrent));
    }
    state.windVectorCurrent = arr3(data.windVector);
    state.PackedCargoes = new Map();
    for (const [uid, items] of Object.entries(data.packedCargoes ?? {})) state.PackedCargoes.set(cargoKey(uid), deps.packedItems.deserialize(items));
    RunOnUpdateEvents();
  }
  function RunOnUpdateEvents() {
    raise('OnUpdateWind', [...state.windVectorCurrent]);
    state.currentVectorPrevious = [0, 0, 0];
  }
  function AddMapMarker(mapPixel, color, label = '') {
    if (!state.mapMarkers.some((m) => m.position[0] === mapPixel[0] && m.position[1] === mapPixel[1])) state.mapMarkers.push({ position: mapPixel, label, color });
  }

  function tick() {
    if (pendingRestore && deps.pool.ready()) {
      const data = pendingRestore;
      pendingRestore = null;
      applySaveData(data);
      OnLoad();
    }
  }

  return {
    state,
    get AllBoats() { return state.AllBoats; },
    get placing() { return state.placing; },
    get pendingRestore() { return pendingRestore; },
    isSailing,
    cargoRoom(boat) {
      if (!boat?.Cargo) return null;
      const { load, threshold } = cargoLoad(boat);
      return { load, slows: threshold, stops: 2 * threshold };
    },
    helmMotion() {
      const boat = state.CurrentBoat;
      if (!isSailing() || boat == null || IsBeached(boat)) return null;
      return { boat, velocity: quatRotate(boat.GameObject.rotation, state.velocityCurrent), turn: state.TurnCurrent };
    },
    helmPanelState() {
      const boat = state.CurrentBoat;
      if (!isSailing() || boat == null) return null;
      const foreAft = boat.SailsLateen.length > 0 || boat.SailsGaff.length > 0;
      const squareRaised = boat.SailsSquare.length > 0 && boat.SailsSquare.some((sq) => animatorOf(sq)?.GetBool('Stowed') === false);
      return {
        hull: boat.hull, hasSails: boat.Sails.length > 0, sailsUp: state.sailPosition !== 0,
        hasSquare: boat.SailsSquare.length > 0,
        squareToggle: state.sailPosition !== 0 && boat.SailsSquare.length > 0 && foreAft && !trimAutoSquareUpwind(), squareUp: squareRaised,
        light: !!boat.LightOn, timeScaleIndex: state.timeScaleIndex, timeScale: TIME_SCALES[state.timeScaleIndex], timeScaleMax: TIME_SCALES.length - 1,
        timeDial: !deps.timeLocked?.(),
        manualTrim: !trimAuto(), squareOnly: !foreAft,
        moreSail: boat.Sails.length > 0 && (state.sailPosition === 0 || (squareHandled(boat) && squareStowed(boat))), inIrons: inIrons(boat) && state.ironsFor >= IRONS_TELL_S,
        way: vMagnitude(state.MoveVectorCurrent),
      };
    },
    helmResponsive: () => responsive(),
    StartPlacing, StopPlacing,
    PlaceBoat, PlaceBoatOnTerrain, PlaceBoatAtMapPixel, RepositionBoat, RepositionBoatAtMapPixel,
    PlaceBoatAtRayHit, PlaceBoatAtRayHitArgs,
    SetBoatPositionAndDirection, SetBoatPositionAndDirectionAtMapPixel, GetMapPixelFromTerrain,
    UpdateBoatNodes, UpdateBoatNodesAtMapPixel, UpdateAllBoatsNodes, UpdateBoatVisibility, UpdateBoatVisibilityOf,
    OnPositionUpdate, OnPositionUpdateBoat, OnWorldReanchored, OnLoad, OnTransition, OnTeleportToCoordinates,
    IncreaseTimeScale, DecreaseTimeScale, SetTimeScale, UpdateAudioSource, checkSettings, OarEvent_In, OarEvent_Sweep, OarEvent_Out,
    UpdateWaveMesh, UpdateWaveMeshDelayed,
    waves: () => ({ position: state.waveObject.position, scale: state.waveObject.scale, mesh: state.waveObject.mesh, frame: state.waveFrameIndex }),
    GetPlacedBoatWithUID, GetHitBoatIndex, AddMapMarker,
    update, lateUpdate, fixedUpdate, endOfFrame, tick,
    StartSailing, StopSailing, StopSailingDelayed, ReturnTemporaryShip, UpdateCurrentBoatNodes, CheckCollision, UpdateBoatCargoMod,
    turnDoor,
    CanSail, IsBeached, IsNodeOnWater, CanTurnLeft, CanTurnRight, ResetTimeScale,
    LaunchFromParts, nodeReadingAt,
    sailWayOf, oarWayOf,
    LaunchFromDeed,
    SummonBoat, LayUpBoat, laidUpHold, forgetHold,
    activate, OnStartLoad, OnPreFastTravel, OnPreJump, OnPostFastTravel, OnPlayerDeath, OnNewMagicRound,
    UpdateWind, OnNewHour, OnWeatherChange,
    GetSailPower, ToggleSails, RaiseSails, LowerSails, ToggleSquareSails, HasLargeSquareSailWithGaff,
    windWidget, windWidgetFrameOf,
    get playerParent() { return playerParent; },
    on: (name, fn) => { events[name]?.push(fn); },
    properties: { moveSpeed, moveAccel, turnSpeed, turnAccel, wakeThreshold, hasInput, inputTarget },
    console: { giveboat: consoleGiveBoat, placeboat: consolePlaceBoat, printboats: consolePrintBoats, identifyboat: consoleIdentifyBoat, purgeboat: consolePurgeBoat },
    IsNearPort, PackBoat, deedMissing, partsTooHeavy, OpenCargo, OpenBoatVariantPicker, OpenBoatVariantPicker_OnItemPicked, useBoatParts, useBoatDeed,
    CheckBoatPosition, StartShowBoatPosition, StopShowBoatPosition, IsPositionMarked, LeftClickOnMap, RightClickOnMap,
    mapOverlay, debugValues, StartWaterwalking, EndWaterwalking,
    MessageReceiver,
    newSaveData, getSaveData, restoreSaveData,
    // A new game keeps Start's rolled wind, where the mod's NewSaveData would turn it due north.
    newGame() {},
  };
}

// PackedCargoes keys are UID strings, as the save's JSON object keys are.
const cargoKey = (uid) => String(uid);
export const BOAT_EFFECT_BUNDLE = "I'm On A Boat";
export const MOD_OBJECT_NAME = 'Come Sail Away (ComeSailAwayMod.ComeSailAway)';
export const WATER_WALKING_SILENT = 'WaterWalkingSilent';
const JESUS_MODE_BUNDLE = 'Jesus Mode';
function stow(component, stowed) {
  component.CrossFade(stowed ? 'Stowed' : 'Unstowed', SAIL_ANIMATION_SPEED);
  component.SetBool('Stowed', stowed);
}
export { stow as stowSail };
export function boundsContains(b, p) {
  for (let k = 0; k < 3; k++) if (p[k] < f(b.center[k] - b.extent[k]) || p[k] > f(b.center[k] + b.extent[k])) return false;
  return true;
}
function roundToInt(v) {
  const fl = Math.floor(v);
  const r = v - fl;
  return r > 0.5 ? fl + 1 : r < 0.5 ? fl : (fl % 2 === 0 ? fl : fl + 1);
}
function swapItem(list, item, by) {
  const l = typeof list === 'function' ? list() : list;
  if (!l) return;
  let i = l.indexOf(item);
  if (i < 0 && item?.UID != null) i = l.findIndex((it) => it?.UID === item.UID && it?.templateIndex === item.templateIndex);
  if (i >= 0) l.splice(i, 1, by);
}
function holdsItem(list, item) {
  const l = typeof list === 'function' ? list() : list;
  if (!l || !item) return !!item;
  return l.includes(item) || (item.UID != null && l.some((it) => it?.UID === item.UID && it?.templateIndex === item.templateIndex));
}
// A ship's parts and deed share her UID, so the template must match too.
function removeExact(list, item) {
  const l = typeof list === 'function' ? list() : list;
  if (!l) return;
  let i = l.indexOf(item);
  if (i < 0 && item?.UID != null) i = l.findIndex((it) => it?.UID === item.UID && it?.templateIndex === item.templateIndex);
  if (i >= 0) l.splice(i, 1);
}
// `list` may be a getter read at the spend, so a load in between spends the loaded pack's copy.
function removeItem(list, item) {
  const l = typeof list === 'function' ? list() : list;
  if (!l) return;
  let i = item?.UID != null ? l.findIndex((it) => it?.UID === item.UID) : -1;
  if (i < 0) i = l.indexOf(item);
  if (i >= 0) l.splice(i, 1);
}
