// @ts-check
// How a ship of the Bay sails, keeps off the land and other hulls, and fights. Pure: the host hands in the wind, a
// water test, and the contacts, and gets the ship moved and its volleys back.

import { classById, batteryOf, hullBuild, GUNS, HULL, SHIP_CLASSES, buildsStamp, SHIP_TOUGHNESS, shipBatteryWeight, flatHull, flatGap } from './navalShips.js';
import { mulberry32 } from '../../combat/bloodArt.js';
import { createShipDamage, SHIP_STATES, STRUCK_AT, HOLED_BONUS, WATERLINE_BAND } from './navalDamage.js';
import { createGunDeck, aimSolution, reloadSeconds } from './navalGunnery.js';
import { NAVAL_DEG, rangeAt, SHOT_GRAVITY } from './navalBallistics.js';
import { BERTH_GAP } from './navalBoarding.js';
import { wrapAngle } from '../../world/mat4.js';
import { steerage, HULL_HELM, HELM_WAY, WIND_RATED, WIND_SHARE, windShare } from './helmWay.js';
import { stepErrand, MOOR_EASE_S } from './shipLife.js';
import { nightSight } from './shipWatch.js';
import { legendOfClass, LEGEND_RELOAD_K } from './etherShips.js';
import { shotGun, naturalShot } from './shotKinds.js';

export const OARS_FLOOR = 0.55;
export const LOOKAHEAD_S = 22;
export const LOOKAHEAD_MIN = 70;
export const SCAN_STEP = 6;
export const SCAN_MARGIN = 4;
export const AVOID_SWINGS = Object.freeze([25, -25, 50, -50, 80, -80, 115, -115, 150, -150, 180]);
export const AVOID_HOLD_S = 3;
export const NAV_EVERY_S = 0.25;
export const BEAR_DEG = 13;
export const BOW_BEAR = 11;
export const RUN_OUT_S = 1.3;
export const RUN_OUT_DEG = 30;
export const BOW_RUN_OUT = 24;
export const RUN_IN_DEG = 45;
export const RUN_OUT_WAIT_S = 2.5;
export const RUN_IN_S = 2;
export const RUN_OUT_REACH = 0.92;
export const POINT_BLANK = 0.4;
export const TRACK_TAU = 0.5;
export const TRACK_JUMP = 20;
export const FIRE_EXTENT_K = 0.35;
export const FIRE_EXTENT_SKILL = 0.65;
export const NO_BEAR_S = 90;
export const LAY_ERR = 0.9;
export const AIM_FREEBOARD = 0.4;
export const FRIEND_CLEAR = 6;
export const ENGAGE_RANGE = 750;
export const lookoutOf = (ship) => ship.sight ?? ENGAGE_RANGE;
export const DISENGAGE = 1.35;
export const CHASE_AWAY = 0.5;
export const ABAFT_DEG = 110;
export const CHASE_SHEER = 1.4;
export const CHASE_MARGIN = 0.3;
export const CHASE_MARK_S = 2;
export const FLEE_RANGE = 320;
export const CHASE_GIVE_UP_S = 150;
export const CHASE_GAIN = 0.1;
export const SPARE_S = 300;
export const PIRATE_RUNS_AT = 0.3;
export const GRAPPLE_RANGE = 28;
export const GRAPPLE_GAP = 12;
export const GRAPPLE_HULL = 0.35;
export const GRAPPLE_STILL = 1.2;
export const GRAPPLE_STILL_S = 15;
export const GRAPPLE_CREW = 6;
export const BOARD_SAILS = Object.freeze({ min: 0.3, from: 15 });
export const SWEEP_RANGE = 250;
export const SWEEP_WAY = 1.4;
export const SWEEP_TURN = 10;
export const ROUTE_STEP = 10;
export const ROUTE_EVERY_S = 1;
export const ROUTE_RETRY_S = 5;
export const ROUTE_TURN = 15;
export const ROUTE_DISTS = Object.freeze([60, 120, 200, 320, 480, 700, 1000]);
export const ROUTE_SWITCH = 1.2;
export const ROUTE_SLIP = 50;
export const WRECK_SPARE_S = 30;
export const NAVY_HUNTS = 50;
export const ACCEL = 1;
export const DECEL = 0.6;
export const PROVOKED_S = 300;
export const TEMPERS = Object.freeze({ peaceful: 'peaceful', dutiful: 'dutiful', bold: 'bold', wary: 'wary' });
export const BOLD_SHARE = 0.25;
export const WARY_ODDS = 1.25;
export const PLAYER_GUN_SKILL = 0.6;
export const DUEL_RANGE = 110;
export const TURN_PER_VOLLEY = 90;
export const HEAR_GUNS_M = 1600;
export const HEAR_S = 40;
export const AID_PRIORITY = 0.5;
export const GUNS_SEEN_S = 20;
export const RUN_ON_S = 60;
// Its own salt on the seed, so the temper draw stays apart from the name draw in navalShips.js shipNames.
const TEMPER_SALT = 0x7e3a9e1d;
export { WIND_RATED, WIND_SHARE, windShare };
export const CLOSE_HAULED = 135;
export const TACK_MIN_S = 12;
export const TACK_FLIP = 35;
export const TURN_TAU = Object.freeze([0.5, 0.6, 1.0, 1.5, 1.2]);
export const TURN_FLOOR = 1;
export const OARS_TURN = 6;
export const TURN_SPEED_LOSS = 0.25;
export const HEEL_TURN = 0.15;
export const HEEL_WIND = 2;
export const HEEL_MAX = 12;
export const HEEL_OMEGA = 2.2;
export const HEEL_ZETA = 0.55;
export const AVOID_SHIP_RANGE = 250;
export const AVOID_SHIP_S = 25;
export const AVOID_SHIP_CLEAR = 15;
export const AVOID_SHIP_SWING = 60;
export const AVOID_HEAD_ON = 22.5;
export const TARGET_VEL_TAU = 1;
export const PURSUIT_LEAD_S = 20;
export const RANGE_BEND = 30;
export const PRESENT_SAILS = 0.6;
export const PRESENT_GAIN = 0.08;
export const BEAR_COST_S = 1;
export const SIDE_HOLD_S = 8;
export const WEAR_BELOW = 0.45;
export const TACK_CARRY = 0.8;
export const TACK_FROM = 110;
export const IRONS_DEG = 30;
export const IRONS_WAY = 1;
export const PAYOFF_TURN = 4;
export const BOXED_SAILS = 0.3;
export const FLEE_SPREAD = 60;
export const WAYPOINT_DIST = Object.freeze([900, 2300]);
export const WAYPOINT_REACHED = 120;
export const WAYPOINT_SOUND = 60;
export const WAYPOINT_TRIES = 12;
export const AGROUND_WAY = 0.3;
export const AGROUND_S = 2;
export const ADRIFT_SPEED = 0.35;

const DEG = NAVAL_DEG;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const forwardOfYaw = (yaw) => [Math.sin(yaw), 0, Math.cos(yaw)];
export const quatOfYaw = (yaw) => [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
const headingTo = (from, to) => Math.atan2(to[0] - from[0], to[2] - from[2]);

export function windFactor(offRun) {
  const d = Math.abs(offRun) / DEG;
  const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);
  if (d <= 40) return 0.85;
  if (d <= 100) return lerp(0.85, 1, (d - 40) / 60);
  if (d <= 135) return lerp(1, 0.7, (d - 100) / 35);
  if (d <= 150) return lerp(0.7, 0.35, (d - 135) / 15);
  return lerp(0.35, 0.08, (d - 150) / 30);
}

export function createSeaShip({ id, seed, classId, variant = 0, pos, yaw = 0, names = null, owner = null, temper = null, errand = null }) {
  const cls = classById(classId);
  if (!cls) throw new Error(`navalAI: no ship class '${classId}'`);
  const damage = createShipDamage({ hullHp: cls.hullHp, sailHp: cls.sailHp, crew: cls.crew });
  const ship = {
    id: String(id), seed: seed >>> 0, cls, hull: cls.hull, variant, names, owner,
    pos: [...pos], yaw: wrapAngle(yaw), speed: 0, turnNow: 0, sails: 1, heel: 0, settle: 0,
    yawRate: 0, heelVel: 0, sailsWant: 1, clock: 0,
    mode: 'cruise', target: null, waypoint: null, damage,
    temper: Object.values(TEMPERS).includes(temper) ? temper : temperOf(cls, seed), lashed: null, heard: null, runOn: null,
    sight: null, course: null,
    errand,
    guns: createGunDeck(cls.hull, { crewed: true, crewShare: () => damage.crewShare(), reloadScale: () => (legendOfClass(cls.id)?.trait === 'gunnery' ? LEGEND_RELOAD_K : 1) }),
    provoked: new Map(),
    stillFor: new Map(),
    spare: new Map(),
    avoid: { swing: 0, heading: null, clearFor: 0, at: -Infinity, dir: 0 },
    tack: null, chase: null, tvel: null, present: null, wreck: null, berthSide: 0, aground: 0, turnWay: null,
    approach: null, route: null,
    sweeps: 0,
    wantPrev: null, wantRate: 0,
    runOut: new Map(), runIn: new Map(),
    boarded: false,
    adrift: false,
    volleySeq: 0,
    lastFire: -Infinity,
  };
  return ship;
}

export const velocityOf = (ship) => { const f = forwardOfYaw(ship.yaw); return [f[0] * ship.speed, 0, f[2] * ship.speed]; };

/**
 * @param {any} ship
 * @param {{ kind: string, faction?: string, id: string, notoriety?: (crown: string | null) => number, power?: FighterMeasure | number | null,
 *   hullShare?: number, crippled?: boolean, ship?: any, hull?: number | null }} contact
 * @param {{ notoriety?: (crown: string | null) => number, now?: number }} [opts]
 */
export function hostile(ship, contact, { notoriety = () => 0, now = 0 } = {}) {
  const f = ship.cls.faction;
  if ((ship.provoked.get(contact.id) ?? -Infinity) > now - PROVOKED_S) return true;
  if (contact.kind === 'player') {
    if (f === 'pirate') return takesPrize(ship, contact);
    if (f === 'navy') return (contact.notoriety ?? notoriety)(ship.names?.crown ?? null) >= NAVY_HUNTS;
    return false;
  }
  const g = contact.faction;
  if (f === 'pirate') return (g === 'merchant' || g === 'navy') && takesPrize(ship, contact);
  if (f === 'navy') return g === 'pirate';
  return false;
}

function takesPrize(ship, contact) {
  if (ship.temper !== TEMPERS.wary) return true;
  const share = contact.hullShare ?? contact.ship?.damage?.hullShare?.() ?? 1;
  if (contact.crippled || share < GRAPPLE_HULL) return true;
  const theirs = sizeUp(contact);
  return theirs != null && odds(shipPower(ship), theirs) >= WARY_ODDS;
}

export function outguns(threat, ship) {
  const theirs = sizeUp(threat);
  return theirs != null && odds(theirs, shipPower(ship)) > 1;
}
function sizeUp(c) {
  const p = c.power ?? (c.ship ? shipPower(c.ship) : null);
  if (typeof p !== 'number') return p;
  return c.hull == null ? null : fightingPower({ hull: c.hull, hullHp: hullBuild(c.hull).hullHp, hullShare: c.hullShare ?? 1, player: true });
}

/** @param {{ faction: string, flagship?: boolean }} cls @param {number} seed @param {{ bold?: number }} [o] */
export function temperOf(cls, seed, { bold = BOLD_SHARE } = {}) {
  if (cls.faction === 'merchant') return TEMPERS.peaceful;
  if (cls.faction === 'navy') return TEMPERS.dutiful;
  if (cls.flagship) return TEMPERS.bold;
  // One draw for every bold share, so a pirate bold on the coast is bold in the deep too.
  return mulberry32(((seed >>> 0) ^ TEMPER_SALT) >>> 0)() < bold ? TEMPERS.bold : TEMPERS.wary;
}

/**
 * @typedef {Readonly<{ hull: number, hullHp: number, hullShare: number, crewShare: number, crew: number, strikes: boolean,
 *   skill: number, range: number, turn: number, crewed: boolean, tactic: string, player: boolean }>} FighterMeasure
 */
/**
 * @param {{ hull: number, hullHp: number, hullShare?: number, crewShare?: number, crew?: number, strikes?: boolean,
 *   skill?: number, range?: number | null, turn?: number | null, crewed?: boolean, tactic?: string, player?: boolean }} o
 */
export function fightingPower({ hull, hullHp, hullShare = 1, crewShare = 1, crew = 0, strikes = false, skill = PLAYER_GUN_SKILL, range = null, turn = null, crewed = true, tactic = null, player = false }) {
  return Object.freeze({
    hull, hullHp: Math.max(0, hullHp), hullShare: clamp(hullShare, 0, 1), crewShare: clamp(crewShare, 0, 1), crew: Math.max(0, crew), strikes: !!strikes,
    skill, range: range ?? rangeOfHull(hull), turn: turn ?? turnOfHull(hull), crewed: !!crewed, tactic: tactic ?? (hull === HULL.LargeGalley ? 'bow' : 'broadside'),
    player: !!player,
  });
}
export const shipPower = (ship) => fightingPower({
  hull: ship.hull, hullHp: ship.damage.maxHull, hullShare: ship.damage.hullShare(), crewShare: ship.damage.crewShare(), crew: ship.damage.crew,
  strikes: ship.damage.maxCrew > 0, skill: ship.cls.skill, range: ship.cls.range, turn: turnRateAt(ship, ship.cls.speed) / DEG, tactic: ship.cls.tactic,
});
export const classPower = (cls) => fightingPower({
  hull: cls.hull, hullHp: cls.hullHp, crew: cls.crew, strikes: cls.crew > 0, skill: cls.skill, range: cls.range,
  turn: turnRateAt({ hull: cls.hull, cls }, cls.speed) / DEG, tactic: cls.tactic,
});
export const rangeOfHull = (hull) => { const on = SHIP_CLASSES.filter((c) => c.hull === hull); return Math.min(...(on.length ? on : SHIP_CLASSES).map((c) => c.range)); };
export const turnOfHull = (hull) => Math.max(hull === HULL.LargeGalley ? OARS_TURN : TURN_FLOOR, (HULL_HELM[hull] ?? 1) * steerage(HELM_WAY.steerPeakV));
/** @param {FighterMeasure} a @param {FighterMeasure} b */
export function strikeTime(a, b) {
  const sides = a.tactic === 'bow' ? ['bow', 'starboard'] : ['starboard'];
  let hull = 0, men = 0;
  for (const side of sides) {
    const bat = batteryOf(a.hull, side);
    if (!bat || layMin(a.hull, side, b.hull) > b.range) continue;
    const g = GUNS[bat.gun];
    const balls = bat.muzzles.length / sides.length / (reloadSeconds(bat.gun, a.crewShare, a.crewed) + TURN_PER_VOLLEY / Math.max(1, a.turn));
    const hits = balls * hitShare(bat, a.skill, b.hull);
    const w = shipBatteryWeight(a.hull, side, !!a.player);
    hull += hits * g.hull * w * (1 + HOLED_BONUS * Math.min(1, WATERLINE_BAND / hullBuild(b.hull).top));
    men += (hits * g.crew) / SHIP_TOUGHNESS;
  }
  const byHull = hull > 0 ? b.hullHp * Math.max(0, b.hullShare - STRUCK_AT) / hull : Infinity;
  const byMen = b.strikes && men > 0 ? b.crew / men : Infinity;
  return Math.min(byHull, byMen);
}
export function odds(a, b) {
  const mine = strikeTime(a, b), theirs = strikeTime(b, a);
  if (mine === theirs) return 1;
  return mine === 0 || theirs === Infinity ? Infinity : theirs / mine;
}
export function hitShare(bat, skill, targetHull) {
  buildsKept();
  const key = `${bat.gun}:${bat.muzzles[0][1]}:${skill}:${targetHull}`;
  let s = HIT_SHARE.get(key);
  if (s !== undefined) return s;
  const g = GUNS[bat.gun], b = hullBuild(targetHull), k = clamp(1.5 - skill, 0.4, 1.5), R = DUEL_RANGE;
  const t = R / g.speed, aimY = b.top * AIM_FREEBOARD;
  const fall = Math.max(0.02, (0.5 * SHOT_GRAVITY * t + (bat.muzzles[0][1] - aimY) / t) / g.speed);
  const deep = b.top / fall + 2 * b.halfWidth;
  const err = R * Math.hypot(0.5 * LAY_ERR * (1 - skill), Math.tan(g.pitchSpread * k * DEG) / fall);
  const halfLen = (b.bowZ - b.aftZ) / 2;
  const across = R * Math.tan(g.yawSpread * k * DEG) + halfLen * (FIRE_EXTENT_K + FIRE_EXTENT_SKILL * (1 - skill));
  s = Math.min(1, deep / (2 * err)) * Math.min(1, halfLen / across);
  HIT_SHARE.set(key, s);
  return s;
}
const HIT_SHARE = new Map();
let keptFor = -1;
// Both caches hold values for the hull builds as they stand, and empty when a build switches.
function buildsKept() { if (keptFor !== buildsStamp()) { keptFor = buildsStamp(); HIT_SHARE.clear(); LAY_MIN.clear(); } }

export function provoke(ship, by, now) { if (by != null) ship.provoked.set(String(by), now); }

export const hullLength = (hull) => { const b = hullBuild(hull); return b.bowZ - b.aftZ; };
export function turnRateAt(ship, v) {
  const floor = (ship.hull === HULL.LargeGalley ? OARS_TURN : TURN_FLOOR) * DEG;
  return Math.min(ship.cls.turn * DEG, Math.max(floor, (HULL_HELM[ship.hull] ?? 1) * steerage(v) * DEG));
}
export const maxTurnRate = (ship) => turnRateAt(ship, ship.speed);
export const turnRadius = (ship) => Math.max(hullLength(ship.hull) * 0.5, ship.cls.speed / turnRateAt(ship, ship.cls.speed));

/**
 * @param {number[]} pos
 * @param {number} yaw
 * @param {number} dist
 * @param {(x: number, z: number) => boolean} isWater
 * @param {{ half?: number, from?: number, near?: number, step?: number }} [opts]
 */
export function courseClear(pos, yaw, dist, isWater, { half = 10, from = 0, near = Infinity, step = SCAN_STEP } = {}) {
  // A reach that is not a number would step the soundings forever.
  if (!Number.isFinite(dist) || !Number.isFinite(from) || !(step > 0)) return false;
  const f = forwardOfYaw(yaw), r = [f[2], 0, -f[0]];
  let s = Math.max(0, from);
  for (;;) {
    const x = pos[0] + f[0] * s, z = pos[2] + f[2] * s;
    if (!isWater(x, z) || !isWater(x + r[0] * half, z + r[2] * half) || !isWater(x - r[0] * half, z - r[2] * half)) return false;
    if (s >= dist) return true;
    s = Math.min(dist, s + (s < near ? step : step * 2));
  }
}

function lookout(ship) {
  const b = hullBuild(ship.hull);
  const rTurn = turnRadius(ship);
  return { from: b.bowZ * 0.5, near: b.bowZ + rTurn, dist: b.bowZ + rTurn + Math.max(LOOKAHEAD_MIN, ship.speed * LOOKAHEAD_S), half: b.halfWidth + SCAN_MARGIN };
}
const soundCourse = (ship, yaw, isWater) => { const l = lookout(ship); return courseClear(ship.pos, yaw, l.dist, isWater, { half: l.half, from: l.from, near: l.near }); };

export function avoidLand(ship, want, isWater, wind = null) {
  const a = ship.avoid;
  if (ship.clock - a.at < NAV_EVERY_S) return a.heading != null ? a.heading : wrapAngle(want + a.swing * DEG);
  const since = Number.isFinite(a.at) ? ship.clock - a.at : 0;
  a.at = ship.clock;
  const out = avoidLandSounded(ship, want, isWater, wind, since);
  const turn = wrapAngle(out - ship.yaw);
  if (Math.abs(turn) > 120 * DEG && !a.dir) {
    const r = roomEither(ship, isWater);
    a.dir = r.right === r.left ? 0 : r.right > r.left ? 1 : -1;
  } else if (Math.abs(turn) <= 120 * DEG) a.dir = 0;
  return out;
}
function roomEither(ship, isWater) {
  const l = lookout(ship);
  const count = (side) => { let n = 0; for (const k of [45, 90, 135]) if (courseClear(ship.pos, wrapAngle(ship.yaw + side * k * DEG), l.near, isWater, { half: l.half, from: l.from })) n++; return n; };
  return { right: count(1), left: count(-1) };
}
function avoidLandSounded(ship, want, isWater, wind, since) {
  const a = ship.avoid;
  const wantClear = soundCourse(ship, want, isWater);
  if (a.heading == null && a.swing === 0) {
    if (wantClear) return want;
  } else {
    a.clearFor = wantClear ? a.clearFor + since : 0;
    if (a.clearFor >= AVOID_HOLD_S) { a.swing = 0; a.heading = null; a.clearFor = 0; return want; }
    if (a.heading == null && soundCourse(ship, wrapAngle(want + a.swing * DEG), isWater)) return wrapAngle(want + a.swing * DEG);
    if (wantClear) { a.swing = 0; a.heading = null; a.clearFor = 0; return want; }
  }
  for (const any of [false, true]) {
    for (const s of AVOID_SWINGS) {
      const y = wrapAngle(want + s * DEG);
      if (!any && wind && sailable(ship, y, wind) !== y) continue;
      if (soundCourse(ship, y, isWater)) { a.swing = s; a.heading = null; a.clearFor = 0; return y; }
    }
  }
  const r = roomEither(ship, isWater);
  const side = r.right >= r.left ? 1 : -1;
  a.swing = 0; a.clearFor = 0;
  a.heading = wrapAngle(ship.yaw + side * (Math.PI - 1e-3));
  return a.heading;
}

export function bearingTo(ship, p) {
  const dx = p[0] - ship.pos[0], dz = p[2] - ship.pos[2];
  return { bearing: wrapAngle(Math.atan2(dx, dz) - ship.yaw), dist: Math.hypot(dx, dz) };
}

export function leadPoint(from, target, rel, speed) {
  let p = [...target];
  for (let i = 0; i < 3; i++) {
    const d = Math.hypot(p[0] - from[0], p[2] - from[2]);
    // The ball's way along the flat: the cosine of a laid gun is about 0.97.
    const t = d / Math.max(1, speed * 0.97);
    p = [target[0] + rel[0] * t, target[1], target[2] + rel[2] * t];
  }
  return p;
}

export function intercept(from, speed, target, vel) {
  const P = [target[0] - from[0], target[2] - from[2]], V = [vel?.[0] ?? 0, vel?.[2] ?? 0];
  const s = Math.max(0.5, speed);
  const a = V[0] * V[0] + V[1] * V[1] - s * s, b = 2 * (P[0] * V[0] + P[1] * V[1]), c = P[0] * P[0] + P[1] * P[1];
  let t = null;
  if (Math.abs(a) < 1e-9) t = b < 0 ? -c / b : null;
  else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const q = Math.sqrt(disc);
      const roots = [(-b - q) / (2 * a), (-b + q) / (2 * a)].filter((r) => r > 0);
      t = roots.length ? Math.min(...roots) : null;
    }
  }
  if (t == null) t = Math.min(PURSUIT_LEAD_S, Math.sqrt(c) / s);
  const point = [target[0] + V[0] * t, target[1] ?? 0, target[2] + V[1] * t];
  return { heading: headingTo(from, point), point, t };
}

function offRunOf(yaw, wind) {
  const wl = Math.hypot(wind?.[0] ?? 0, wind?.[2] ?? 0);
  if (wl < 1e-6) return Math.PI / 2;
  return Math.abs(wrapAngle(yaw - Math.atan2(wind[0], wind[2])));
}

export function tackCourse(ship, want, goal, wind) {
  const wl = Math.hypot(wind?.[0] ?? 0, wind?.[2] ?? 0);
  if (ship.hull === HULL.Rowboat) { ship.tack = null; return want; }
  if (ship.hull === HULL.LargeGalley || wl < 1e-6 || offRunOf(want, wind) <= CLOSE_HAULED * DEG) { ship.tack = null; return want; }
  const eye = wrapAngle(Math.atan2(wind[0], wind[2]) + Math.PI);
  const g = goal ?? [ship.pos[0] + Math.sin(want) * 1000, 0, ship.pos[2] + Math.cos(want) * 1000];
  const a = wrapAngle(headingTo(ship.pos, g) - eye);
  const flip = TACK_FLIP * DEG;
  if (!ship.tack) {
    const side = Math.abs(a) > flip ? Math.sign(a) : (wrapAngle(ship.yaw - eye) >= 0 ? 1 : -1);
    ship.tack = { side, since: ship.clock };
  } else if (ship.clock - ship.tack.since >= TACK_MIN_S && ((ship.tack.side > 0 && a < -flip) || (ship.tack.side < 0 && a > flip))) {
    ship.tack = { side: -ship.tack.side, since: ship.clock };
  }
  return wrapAngle(eye + ship.tack.side * (180 - CLOSE_HAULED) * DEG);
}

export function sailable(ship, want, wind) {
  const wl = Math.hypot(wind?.[0] ?? 0, wind?.[2] ?? 0);
  if (ship.hull === HULL.Rowboat) return want;
  if (ship.hull === HULL.LargeGalley || wl < 1e-6 || offRunOf(want, wind) <= CLOSE_HAULED * DEG) return want;
  const eye = wrapAngle(Math.atan2(wind[0], wind[2]) + Math.PI);
  return wrapAngle(eye + (wrapAngle(want - eye) >= 0 ? 1 : -1) * (180 - CLOSE_HAULED) * DEG);
}

const passReach = (hull) => { const b = hullBuild(hull); return 0.5 * (b.halfWidth + (b.bowZ - b.aftZ) / 2); };

export function trafficCourse(ship, want, contacts, except = null) {
  const my = velocityOf(ship);
  const mine = passReach(ship.hull);
  let bend = 0;
  for (const c of contacts ?? []) {
    if (c.id === ship.id || c.id === except || c.gone || c.hull == null) continue;
    const p = [c.pos[0] - ship.pos[0], c.pos[2] - ship.pos[2]];
    if (Math.hypot(p[0], p[1]) > AVOID_SHIP_RANGE) continue;
    const v = [(c.vel?.[0] ?? 0) - my[0], (c.vel?.[2] ?? 0) - my[2]];
    const vv = v[0] * v[0] + v[1] * v[1];
    const tca = vv > 1e-6 ? Math.max(0, -(p[0] * v[0] + p[1] * v[1]) / vv) : 0;
    if (tca > AVOID_SHIP_S) continue;
    const dca = Math.hypot(p[0] + v[0] * tca, p[1] + v[1] * tca);
    const reach = mine + passReach(c.hull) + AVOID_SHIP_CLEAR;
    if (dca >= reach) continue;
    const urgency = (1 - dca / reach) * (1 - tca / AVOID_SHIP_S);
    const brg = wrapAngle(Math.atan2(p[0], p[1]) - ship.yaw);
    const side = wrapAngle(Math.atan2(p[0] + v[0] * tca, p[1] + v[1] * tca) - ship.yaw);
    const dir = Math.abs(brg) < AVOID_HEAD_ON * DEG ? 1 : side > 0 ? -1 : 1;
    bend += dir * urgency * AVOID_SHIP_SWING * DEG;
  }
  return wrapAngle(want + clamp(bend, -AVOID_SHIP_SWING * DEG, AVOID_SHIP_SWING * DEG));
}

export function stepCaptain(ship, world) {
  const out = { volleys: [], barrels: [], grapple: null, runOuts: [] };
  const dt = Math.max(0, world.dt);
  ship.clock += dt;
  const st = ship.damage.state;
  const isWater = (x, z) => world.isWater(x, z, ship.hull);
  ship.guns.step(dt);
  if (st !== SHIP_STATES.afloat || ship.boarded) {
    ship.runOut.clear();
    ship.target = null; ship.berthSide = 0; ship.present = null; ship.chase = null; ship.approach = null; ship.route = null;
  }
  if (st === SHIP_STATES.sinking || st === SHIP_STATES.sunk) {
    ship.speed = Math.max(0, ship.speed - DECEL * dt);
    ship.sails = Math.max(0, ship.sails - dt * 0.5);
    helm(ship, ship.yaw, dt, world, 0);
    moveShip(ship, dt, null);
    return out;
  }
  if (st === SHIP_STATES.struck || st === SHIP_STATES.prize || ship.boarded) {
    ship.mode = st === SHIP_STATES.prize ? 'prize' : ship.boarded ? 'boarded' : 'struck';
    ship.sails = Math.max(0, ship.sails - dt * 0.5);
    ship.speed = Math.max(0, ship.speed - DECEL * 0.6 * dt);
    helm(ship, ship.yaw, dt, world, 0);
    moveShip(ship, dt, isWater);
    if (ship.adrift && st === SHIP_STATES.prize) drift(ship, dt, world.wind, isWater);
    return out;
  }
  if (ship.lashed) {
    ship.mode = 'board';
    ship.target = ship.lashed.id;
    ship.runOut.clear();
    ship.sweeps = 0;
    ship.sails = Math.max(0, ship.sails - dt * 0.5);
    ship.speed = Math.max(0, ship.speed - DECEL * 2 * dt);
    helm(ship, ship.yaw, dt, world, 0);
    moveShip(ship, dt, isWater);
    return out;
  }

  const sight = lookoutOf(ship);
  let enemy = null, enemyD = Infinity, threat = null, threatD = Infinity, prize = null, prizeD = Infinity;
  const aids = standsBy(ship, world);
  const flashed = world.night ? new Set((world.gunfire ?? []).filter((g) => world.now - g.at <= GUNS_SEEN_S).map((g) => g.by)) : null;
  for (const c of world.contacts ?? []) {
    if (c.id === ship.id || c.gone) continue;
    const { dist } = bearingTo(ship, c.pos);
    if (c.struck) { if (c.struckTo === ship.id && dist < prizeD && !((ship.spare.get(c.id) ?? -Infinity) > ship.clock)) { prize = c; prizeD = dist; } continue; }
    const held = c.id === ship.target && (ship.mode === 'engage' || ship.mode === 'board');
    const lit = !!c.lit || !!flashed?.has(c.id);
    // Sight is checked before `hostile`, which is costly, and neither changes any state.
    const see = nightSight(sight, { night: !!world.night, lit });
    if (dist < (held ? see * DISENGAGE : see) && hostile(ship, c, world) && !((ship.spare.get(c.id) ?? -Infinity) > ship.clock)) {
      const rank = (held ? dist * 0.8 : dist) * (aids && fightsAny(c, aids) ? AID_PRIORITY : 1);
      if (rank < enemyD) { enemy = c; enemyD = rank; }
    }
    if (dist < threatD && dist < nightSight(FLEE_RANGE, { night: !!world.night, lit })
      && (c.kind === 'ship' ? c.ship && hostile(c.ship, { kind: 'ship', faction: ship.cls.faction, id: ship.id, ship }, world) : (ship.provoked.get(c.id) ?? -Infinity) > world.now - PROVOKED_S)) { threat = c; threatD = dist; }
  }
  if (enemy) enemyD = bearingTo(ship, enemy.pos).dist;
  for (const c of world.contacts ?? []) {
    if (c.kind !== 'player') continue;
    ship.stillFor.set(c.id, (c.speed ?? 0) < GRAPPLE_STILL ? (ship.stillFor.get(c.id) ?? 0) + dt : 0);
  }
  enemy = chaseOrGiveUp(ship, enemy, enemyD);
  if (!enemy) enemyD = Infinity;
  const boards = !!enemy && boardsHer(ship, enemy, world);
  enemy = leaveTheWreck(ship, enemy, boards);
  if (!enemy) enemyD = Infinity;

  const runs = (ship.cls.faction === 'merchant' && (threat || enemy))
    || (ship.cls.faction === 'pirate' && !ship.cls.flagship && ship.damage.hullShare() < PIRATE_RUNS_AT && (threat || enemy))
    || (ship.cls.faction === 'pirate' && ship.temper === TEMPERS.wary && !!threat && outguns(threat, ship));
  if (ship.runOn && !(world.night && world.now < ship.runOn.until)) ship.runOn = null;
  let plan;
  if (runs) {
    const from = threat ?? enemy;
    ship.mode = 'flee';
    ship.target = from.id;
    ship.runOn = { id: from.id, pos: [from.pos[0], from.pos[1], from.pos[2]], until: world.now + RUN_ON_S };
    plan = fleeCourse(ship, from, world.wind);
  } else if (ship.runOn && !enemy) {
    ship.mode = 'flee';
    ship.target = ship.runOn.id;
    plan = fleeCourse(ship, ship.runOn, world.wind);
  } else if (enemy && ship.cls.faction !== 'merchant') {
    trackTarget(ship, enemy, dt);
    ship.target = enemy.id;
    if (boards) {
      ship.mode = 'board';
      plan = boardCourse(ship, enemy, world.wind, isWater);
      if (!plan) { plan = giveUp(ship, enemy); enemy = null; }
    } else { ship.mode = 'engage'; ship.berthSide = 0; plan = engageCourse(ship, enemy, enemyD, world, isWater); }
  } else if (prize && ship.damage.crew > 0 && ship.cls.faction !== 'merchant') {
    ship.mode = 'board';
    ship.target = prize.id;
    plan = boardCourse(ship, prize, world.wind, isWater);
    if (!plan) { plan = giveUp(ship, prize); prize = null; }
  } else {
    ship.target = null;
    ship.berthSide = 0;
    ship.heard = ship.cls.faction === 'navy' ? heardGuns(ship, world) : null;
    if (ship.heard) {
      ship.mode = 'answer';
      plan = { want: headingTo(ship.pos, ship.heard.pos), goal: [ship.heard.pos[0], 0, ship.heard.pos[2]], sails: 1 };
    } else {
      if (ship.mode !== 'cruise' && ship.errand) ship.errand.path = null;
      ship.mode = 'cruise';
      const life = ship.errand && !ship.course && world.life ? stepErrand(ship, dt, world.life) : null;
      if (life?.hold) return moor(ship, life.hold, dt, out);
      if (life && (ship.errand?.kind === 'arrive' || ship.errand?.kind === 'depart') && sailable(ship, life.want, world.wind) !== life.want) { life.sweeps = SWEEP_WAY; life.sailable = true; }
      plan = life ?? { want: cruiseCourse(ship, world.wind, isWater, world.random ?? Math.random), goal: ship.course ? [ship.course[0], 0, ship.course[1]] : ship.waypoint ? [ship.waypoint[0], 0, ship.waypoint[1]] : null, sails: 1 };
    }
  }
  if (ship.mode !== 'board') { ship.approach = null; ship.route = null; }
  ship.sweeps = plan.sweeps ?? 0;
  if (ship.hull === HULL.Rowboat) ship.sweeps = Math.max(ship.sweeps, ship.cls.speed * plan.sails * ship.damage.wayShare());
  let want = plan.sailable ? plan.want : tackCourse(ship, plan.want, plan.goal, world.wind);
  want = trafficCourse(ship, want, world.contacts, ship.mode === 'board' ? ship.target : null);
  if (!plan.berthing) want = avoidLand(ship, want, isWater, world.wind);

  ship.sailsWant = ship.avoid.heading != null ? Math.min(plan.sails, BOXED_SAILS) : plan.sails;
  ship.sails = clamp(ship.sails + clamp(ship.sailsWant - ship.sails, -0.5 * dt, 0.4 * dt), 0, 1);
  helm(ship, want, dt, world, 1, plan.track ? trackRate(ship, want, dt) : (ship.wantPrev = null, ship.wantRate = 0));
  moveShip(ship, dt, isWater);

  captainLoads(ship, enemy);
  if (!ship.guns.braced && !(enemy?.crippled && enemy.kind === 'player')) {
    gunnery(ship, world, enemy ?? (ship.cls.faction === 'merchant' ? threat : null), out, { broadsides: boarderBroadsides(ship) });
  } else ship.runOut.clear();

  if (ship.mode === 'board') {
    const q = enemy ?? prize;
    const close = q.hull != null && Number.isFinite(q.yaw) ? hullGap(ship.pos, ship.yaw, ship.hull, q.pos, q.yaw, q.hull) <= GRAPPLE_GAP : bearingTo(ship, q.pos).dist <= GRAPPLE_RANGE;
    if (close) out.grapple = q.id;
  }
  return out;
}

export const GRAPE_CLOSE_M = 120;
export const GRAPE_KEEP = 1.5;
const CAPTAIN_GROUPS = Object.freeze(['starboard', 'bow']);
export function captainLoads(ship, enemy = null) {
  const d = enemy?.pos ? Math.hypot(enemy.pos[0] - ship.pos[0], enemy.pos[2] - ship.pos[2]) : Infinity;
  const boards = ship.cls.faction === 'pirate' && ship.mode === 'board';
  const done = !(ship.mode === 'engage' || ship.mode === 'board') || (ship.mode === 'engage' && d > GRAPE_CLOSE_M * GRAPE_KEEP);
  for (const side of CAPTAIN_GROUPS) {
    const bat = batteryOf(ship.hull, side);
    if (!bat || bat.gun === 'barrel') continue;
    if (boards) ship.guns.setLoad(side, 'grape');
    else if (done) ship.guns.setLoad(side, naturalShot(bat.gun));
  }
}
export const boarderBroadsides = (ship) => ship.mode !== 'board' || ship.guns.load('starboard') === 'grape';

function standsBy(ship, world) {
  if (ship.cls.faction !== 'navy') return null;
  let ids = null;
  for (const c of world.contacts ?? []) if (c.kind === 'player' && !hostile(ship, c, world)) (ids ??= new Set()).add(c.id);
  return ids;
}
export const fightsAny = (c, ids) => c.kind === 'ship' && !!c.ship && ids.has(c.ship.target) && (c.ship.mode === 'engage' || c.ship.mode === 'board');

function moor(ship, hold, dt, out) {
  const k = Math.min(1, dt / MOOR_EASE_S);
  ship.pos[0] += (hold.pos[0] - ship.pos[0]) * k;
  ship.pos[2] += (hold.pos[1] - ship.pos[2]) * k;
  ship.yaw = wrapAngle(ship.yaw + wrapAngle(hold.yaw - ship.yaw) * k);
  ship.speed = 0; ship.turnNow = 0; ship.yawRate = 0; ship.sweeps = 0;
  ship.sailsWant = 0;
  ship.sails = Math.max(0, ship.sails - dt * 0.5);
  ship.runOut.clear();
  ship.target = null;
  return out;
}

function heardGuns(ship, world) {
  const near = nightSight(lookoutOf(ship), { night: !!world.night, lit: false }) * 0.5;
  let best = null, bestD = Infinity;
  for (const g of world.gunfire ?? []) {
    if (g.by === ship.id || !(world.now - g.at <= HEAR_S)) continue;
    const d = Math.hypot(g.pos[0] - ship.pos[0], g.pos[2] - ship.pos[2]);
    if (d > HEAR_GUNS_M || d < near || d >= bestD) continue;
    best = g; bestD = d;
  }
  return best;
}

function boardsHer(ship, enemy, world) {
  if (ship.cls.faction !== 'pirate' || enemy.kind !== 'player' || (enemy.peer ? enemy.boarders === false : world.boarders === false)) return false;
  if (ship.damage.crew < GRAPPLE_CREW || ship.damage.hullShare() < PIRATE_RUNS_AT) return false;
  return !!enemy.crippled || (enemy.hullShare ?? 1) < GRAPPLE_HULL || (ship.stillFor.get(enemy.id) ?? 0) >= GRAPPLE_STILL_S;
}

function leaveTheWreck(ship, enemy, boards) {
  if (!enemy || boards || !(enemy.crippled && enemy.kind === 'player')) { if (!enemy || ship.wreck?.id !== enemy.id) ship.wreck = null; return enemy; }
  if (ship.wreck?.id !== enemy.id) ship.wreck = { id: enemy.id, since: ship.clock };
  if (ship.clock - ship.wreck.since < WRECK_SPARE_S) return enemy;
  ship.spare.set(enemy.id, ship.clock + SPARE_S);
  ship.wreck = null;
  return null;
}

function chaseOrGiveUp(ship, enemy, d) {
  if (!enemy) { ship.chase = null; return null; }
  if (ship.chase?.id !== enemy.id) ship.chase = { id: enemy.id, since: ship.clock, marks: [] };
  const c = ship.chase;
  if (!c.marks.length || ship.clock - c.marks[c.marks.length - 1][0] >= CHASE_MARK_S) c.marks.push([ship.clock, d]);
  while (c.marks.length > 1 && ship.clock - c.marks[0][0] > CHASE_GIVE_UP_S) c.marks.shift();
  const far = c.marks.reduce((m, k) => Math.max(m, k[1]), d);
  if (d < far * (1 - CHASE_GAIN) || d <= ship.cls.range * CLOSE_FROM) c.since = ship.clock;
  if (ship.clock - ship.chase.since > CHASE_GIVE_UP_S && d > ship.cls.range * CLOSE_FROM) {
    ship.spare.set(enemy.id, ship.clock + SPARE_S);
    ship.chase = null;
    return null;
  }
  return enemy;
}

function trackTarget(ship, enemy, dt) {
  const v = enemy.vel ?? [0, 0, 0];
  if (ship.tvel?.id !== enemy.id) { ship.tvel = { id: enemy.id, v: [v[0], 0, v[2]] }; return; }
  const k = 1 - Math.exp(-dt / TARGET_VEL_TAU);
  ship.tvel.v[0] += (v[0] - ship.tvel.v[0]) * k;
  ship.tvel.v[2] += (v[2] - ship.tvel.v[2]) * k;
}

function trackRate(ship, want, dt) {
  if (ship.wantPrev == null || !(dt > 0)) { ship.wantPrev = want; ship.wantRate = 0; return 0; }
  const step = wrapAngle(want - ship.wantPrev);
  ship.wantPrev = want;
  if (Math.abs(step) > TRACK_JUMP * DEG) { ship.wantRate = 0; return 0; }
  ship.wantRate += (step / dt - ship.wantRate) * (1 - Math.exp(-dt / TRACK_TAU));
  return ship.wantRate;
}

function helm(ship, want, dt, world, power, lead = 0) {
  let maxRate = maxTurnRate(ship);
  const tau = TURN_TAU[ship.hull] ?? 1;
  let err = wrapAngle(want - ship.yaw);
  const wind = world.wind;
  const wl0 = Math.hypot(wind?.[0] ?? 0, wind?.[2] ?? 0);
  if (power > 0 && ship.hull !== HULL.LargeGalley && !ship.sweeps && wl0 > 1e-6) {
    const toEye = wrapAngle(Math.atan2(wind[0], wind[2]) + Math.PI - ship.yaw);
    const through = Math.sign(toEye) === Math.sign(err) && Math.abs(toEye) < Math.abs(err);
    const off = offRunOf(ship.yaw, wind);
    // A turn through the wind's eye is decided once, as it begins, and held to its end.
    if (ship.turnWay && (Math.abs(err) < 20 * DEG || (!through && ship.turnWay.kind === 'tack' && off <= CLOSE_HAULED * DEG))) ship.turnWay = null;
    if (!ship.turnWay && through) {
      ship.turnWay = ship.speed >= WEAR_BELOW * paceOf(ship, wind) && off >= TACK_FROM * DEG ? { kind: 'tack', rate: maxRate } : { kind: 'wear' };
    }
    if (ship.turnWay?.kind === 'wear' && through) err -= Math.sign(err) * 2 * Math.PI;
    if (ship.turnWay?.kind === 'tack') maxRate = Math.max(maxRate, Math.min(ship.cls.turn * DEG, TACK_CARRY * ship.turnWay.rate));
    if (Math.abs(toEye) < IRONS_DEG * DEG && ship.speed < IRONS_WAY) maxRate = Math.max(maxRate, PAYOFF_TURN * DEG);
  } else ship.turnWay = null;
  if (ship.avoid.heading != null || ship.aground > 0) {
    maxRate = Math.max(maxRate, PAYOFF_TURN * DEG);
    ship.turnWay = null;
  }
  if (power > 0 && ship.sweeps > 0) maxRate = Math.max(maxRate, SWEEP_TURN * DEG);
  if (ship.avoid.dir) {
    if (Math.abs(err) < 30 * DEG) ship.avoid.dir = 0;
    else if (Math.sign(err) !== ship.avoid.dir && Math.abs(err) > 90 * DEG) err -= Math.sign(err) * 2 * Math.PI;
  }
  const cmd = clamp(err / (4 * tau) + lead, -maxRate, maxRate);
  if (dt > 0) ship.yawRate += (cmd - ship.yawRate) * (1 - Math.exp(-dt / tau));
  ship.yawRate = clamp(ship.yawRate, -maxRate, maxRate);
  ship.yaw = wrapAngle(ship.yaw + ship.yawRate * dt);
  ship.turnNow = ship.yawRate;
  if (power > 0) {
    const wl = wl0;
    let best = ship.cls.speed * windFactor(offRunOf(ship.yaw, wind)) * windShare(wl) * ship.damage.wayShare();
    if (ship.hull === HULL.LargeGalley) best = Math.max(best, ship.cls.speed * OARS_FLOOR);
    if (ship.hull === HULL.Rowboat) best = 0;
    const helmShare = maxRate > 0 ? Math.min(1, Math.abs(ship.yawRate) / maxRate) : 0;
    const sailed = best * ship.sails * (1 - TURN_SPEED_LOSS * helmShare);
    const target = Math.max(sailed, ship.sweeps) * (ship.aground > 0 ? AGROUND_WAY : 1);
    const way = wayOf(ship);
    ship.speed = ship.speed < target ? Math.min(target, ship.speed + ACCEL * way * dt) : Math.max(target, ship.speed - DECEL * way * dt);
  }
  ship.aground = Math.max(0, ship.aground - dt);
  // Positive when the wind blows to starboard.
  const cross = (wind?.[0] ?? 0) * Math.cos(ship.yaw) - (wind?.[2] ?? 0) * Math.sin(ship.yaw);
  const want2 = clamp(-HEEL_TURN * ship.speed * (ship.yawRate / DEG) + HEEL_WIND * (cross / WIND_RATED) * ship.sails, -HEEL_MAX, HEEL_MAX);
  for (let t = dt; t > 1e-9;) {
    const h = Math.min(t, 0.05);
    ship.heelVel += (HEEL_OMEGA * HEEL_OMEGA * (want2 - ship.heel) - 2 * HEEL_ZETA * HEEL_OMEGA * ship.heelVel) * h;
    ship.heel += ship.heelVel * h;
    t -= h;
  }
}

function moveShip(ship, dt, isWater) {
  const f = forwardOfYaw(ship.yaw);
  const step = ship.speed * dt;
  if (isWater && step > 0) {
    const b = hullBuild(ship.hull);
    const nx = ship.pos[0] + f[0] * step, nz = ship.pos[2] + f[2] * step;
    const r = [f[2], -f[0]];
    const sh = b.bowZ * 0.55, w = b.halfWidth;
    const clear = isWater(nx + f[0] * b.bowZ, nz + f[2] * b.bowZ)
      && isWater(nx + f[0] * sh + r[0] * w, nz + f[2] * sh + r[1] * w)
      && isWater(nx + f[0] * sh - r[0] * w, nz + f[2] * sh - r[1] * w);
    if (!clear) {
      ship.speed = Math.min(ship.speed, AGROUND_WAY * ship.cls.speed);
      ship.aground = AGROUND_S;
      ship.avoid.at = -Infinity;
      return;
    }
  }
  ship.pos[0] += f[0] * step;
  ship.pos[2] += f[2] * step;
}

function drift(ship, dt, wind, isWater) {
  const wl = Math.hypot(wind?.[0] ?? 0, wind?.[2] ?? 0);
  if (wl < 1e-6) return;
  const s = ADRIFT_SPEED * dt / wl;
  const x = ship.pos[0] + wind[0] * s, z = ship.pos[2] + wind[2] * s;
  if (isWater(x, z)) { ship.pos[0] = x; ship.pos[2] = z; }
}

export const CLOSE_FROM = 1.8;
export const PRESENT_WITHIN = 0.92;
export const BOW_SWING = 60;
export function batteryReach(ship, side, seaY = 0) {
  const bat = batteryOf(ship.hull, side);
  if (!bat || bat.gun === 'barrel') return 0;
  const g = shotGun(bat.gun, GUNS[bat.gun], ship.guns?.load?.(side) ?? null);
  return rangeAt(g.maxEl * DEG, g.speed, bat.muzzles[0][1] + (ship.pos[1] - seaY));
}
export const broadsideReach = (ship, seaY = 0) => batteryReach(ship, 'starboard', seaY);
/** @param {number} hull @param {string} side @param {number} [targetHull] */
export function layMin(hull, side, targetHull = HULL.LargeBoat) {
  buildsKept();
  const key = `${hull}:${side}:${targetHull}`;
  let m = LAY_MIN.get(key);
  if (m !== undefined) return m;
  m = 0;
  const bat = batteryOf(hull, side);
  if (bat && bat.gun !== 'barrel') {
    const build = hullBuild(targetHull);
    const rig = bat.gun === 'chain' && build.rig.length ? rigBand(build) : null;
    const band = rig ?? [0, build.top];
    const aimY = rig ? (rig[0] + rig[1]) / 2 : build.top * AIM_FREEBOARD;
    const g = GUNS[bat.gun];
    const reach = rangeAt(g.maxEl * DEG, g.speed, bat.muzzles[0][1]);
    const dir = side === 'starboard' ? [1, 0] : side === 'port' ? [-1, 0] : side === 'bow' ? [0, 1] : [0, -1];
    const pose = { position: [0, 0, 0], rotation: quatOfYaw(0), velocity: [0, 0, 0], hull };
    m = reach;
    for (let r = LAY_MIN_STEP; r < reach; r += LAY_MIN_STEP) {
      const at = [dir[0] * r, 0, dir[1] * r];
      const sol = aimSolution(pose, /** @type {'starboard'|'port'|'bow'|'stern'} */ (side), null, 0, { target: at, targetY: aimY });
      if (sol && layPasses(sol, at, band)) { m = r; break; }
    }
  }
  LAY_MIN.set(key, m);
  return m;
}
const LAY_MIN = new Map();
export const LAY_MIN_STEP = 1;

const paceOf = (ship, wind) => ship.cls.speed * windShare(Math.hypot(wind?.[0] ?? 0, wind?.[2] ?? 0)) * ship.damage.wayShare();
const wayOf = (ship) => hullBuild(ship.hull).sailWay ?? 1;

function engageCourse(ship, enemy, d, world, isWater) {
  const eh = enemy.hull ?? HULL.LargeBoat;
  // Inside a battery's dead zone the carriage cannot depress onto the hull, so the fighting range stays outside it.
  const deadZone = layMin(ship.hull, 'starboard', eh);
  const range = Math.max(ship.cls.range, deadZone, ship.cls.tactic === 'bow' ? layMin(ship.hull, 'bow', eh) : 0);
  const reach = broadsideReach(ship, world.seaY);
  const vel = ship.tvel?.v ?? enemy.vel ?? [0, 0, 0];
  const own = paceOf(ship, world.wind);
  if (d > Math.max(range * CLOSE_FROM, reach)) {
    const i = intercept(ship.pos, own, enemy.pos, vel);
    ship.present = null;
    return { want: i.heading, goal: i.point, sails: 1 };
  }
  const { bearing } = bearingTo(ship, enemy.pos);
  const my = velocityOf(ship);
  const rel = [vel[0] - my[0], 0, vel[2] - my[2]];
  const away = (vel[0] * (enemy.pos[0] - ship.pos[0]) + vel[2] * (enemy.pos[2] - ship.pos[2])) / Math.max(1e-6, d);
  const ev = Math.hypot(vel[0], vel[2]);
  if (ev > 0.3) {
    const eYaw = Math.atan2(vel[0], vel[2]);
    const offBow = Math.abs(wrapAngle(headingTo(enemy.pos, ship.pos) - eYaw));
    if (((enemy.ship?.mode === 'flee' && away > 0) || away > CHASE_AWAY * own) && offBow > ABAFT_DEG * DEG) {
      const f = forwardOfYaw(eYaw), r = [f[2], 0, -f[0]];
      const onSide = ((ship.pos[0] - enemy.pos[0]) * r[0] + (ship.pos[2] - enemy.pos[2]) * r[2]) >= 0 ? 1 : -1;
      const out = d > range * CHASE_SHEER ? 0 : range;
      ship.present = null;
      const chasers = out ? null : chaserLead(ship, enemy, rel, eh, world.seaY);
      if (chasers) return { want: headingTo(ship.pos, chasers), goal: chasers, sails: 1 };
      const berth = [enemy.pos[0] + r[0] * onSide * out, enemy.pos[1] ?? 0, enemy.pos[2] + r[2] * onSide * out];
      const i = intercept(ship.pos, own, berth, vel);
      return { want: i.heading, goal: i.point, sails: 1 };
    }
  }
  const bowReach = batteryReach(ship, 'bow', world.seaY);
  if (ship.cls.tactic === 'bow' && ship.guns.ready('bow') && d <= bowReach * PRESENT_WITHIN && Math.abs(bearing) <= BOW_SWING * DEG) {
    const bow = batteryOf(ship.hull, 'bow');
    const lead = leadPoint(ship.pos, enemy.pos, rel, GUNS[bow.gun].speed);
    if (Math.hypot(lead[0] - ship.pos[0], lead[2] - ship.pos[2]) >= layMin(ship.hull, 'bow', eh)) {
      ship.present = null;
      return { want: headingTo(ship.pos, lead), goal: lead, sails: 1 };
    }
  }
  const holdsLead = (side) => {
    const l = leadPoint(ship.pos, enemy.pos, rel, GUNS[batteryOf(ship.hull, side).gun].speed);
    const ld = Math.hypot(l[0] - ship.pos[0], l[2] - ship.pos[2]);
    if (ship.present?.side === side && ship.present.lays) return ld <= reach * RUN_OUT_REACH;
    const abeam = wrapAngle(headingTo(ship.pos, l) - (side === 'starboard' ? 1 : -1) * 90 * DEG);
    const round = Math.abs(wrapAngle(abeam - ship.yaw)) / Math.max(maxTurnRate(ship), TURN_FLOOR * DEG) + 4 * (TURN_TAU[ship.hull] ?? 1) + RUN_OUT_S;
    return ld + Math.max(0, away) * round <= reach * RUN_OUT_REACH;
  };
  const closeIn = away > 0 ? Math.asin(clamp((away + CHASE_MARGIN * own) / Math.max(0.5, ship.speed), 0, 1)) : 0;
  const bendOf = (side) => {
    if (ship.guns.ready(side) && d <= reach * PRESENT_WITHIN && d >= Math.max(range * POINT_BLANK, deadZone) && holdsLead(side)) return 0;
    if (d < deadZone) return -2 * RANGE_BEND * DEG;
    const b = clamp((d - range) / range, -1, 1) * RANGE_BEND * DEG;
    return d > range ? Math.max(b, closeIn) : b;
  };
  const headingFor = (side) => {
    const bat = batteryOf(ship.hull, side);
    const lead = leadPoint(ship.pos, enemy.pos, rel, GUNS[bat.gun].speed);
    const sign = side === 'starboard' ? 1 : -1;
    return wrapAngle(headingTo(ship.pos, lead) - sign * (90 * DEG - bendOf(side)));
  };
  const sides = ['starboard', 'port'].filter((s) => { const b = batteryOf(ship.hull, s); return b && b.gun !== 'barrel'; });
  if (!sides.length) { ship.present = null; return { want: headingTo(ship.pos, enemy.pos), goal: enemy.pos, sails: 1 }; }
  if (!ship.present || ship.clock - ship.present.at >= NAV_EVERY_S || !sides.includes(ship.present.side)) {
    const rate = Math.max(maxTurnRate(ship), TURN_FLOOR * DEG);
    const l = lookout(ship);
    const cost = {};
    for (const side of sides) {
      const ideal = headingFor(side);
      const h = sailable(ship, ideal, world.wind);
      const turnS = Math.abs(wrapAngle(h - ship.yaw)) / rate;
      const off = Math.abs(wrapAngle(ideal - h)) / DEG;
      const bat = batteryOf(ship.hull, side);
      const noBear = off > fireWindow(ship, enemy, leadPoint(ship.pos, enemy.pos, rel, GUNS[bat.gun].speed), bat.gun, BEAR_DEG) ? NO_BEAR_S : 0;
      const foul = courseClear(ship.pos, h, l.near, isWater, { half: l.half, from: l.from }) ? 0 : 1e4;
      cost[side] = Math.max(turnS, ship.guns.left(side)) + off * BEAR_COST_S + noBear + foul;
    }
    const held = ship.present && sides.includes(ship.present.side) ? ship.present.side : null;
    let best = held ?? sides[0];
    for (const side of sides) if (cost[side] + (side === held ? 0 : held ? SIDE_HOLD_S : 0) < cost[best] + (best === held ? 0 : held ? SIDE_HOLD_S : 0)) best = side;
    ship.present = { side: best, at: ship.clock, lays: best === held && !!ship.present?.lays };
  }
  const side = ship.present.side;
  const ideal = headingFor(side);
  ship.present.lays = bendOf(side) === 0;
  const want = sailable(ship, ideal, world.wind);
  const bat = batteryOf(ship.hull, side);
  const lead = leadPoint(ship.pos, enemy.pos, rel, GUNS[bat.gun].speed);
  const presented = ship.guns.ready(side) && d <= reach * PRESENT_WITHIN && Math.abs(wrapAngle(want - ship.yaw)) < 30 * DEG
    && Math.abs(wrapAngle(ideal - want)) / DEG <= fireWindow(ship, enemy, lead, bat.gun, BEAR_DEG);
  if (!presented) return { want, goal: null, sails: 1, sailable: true, track: true };
  const f = forwardOfYaw(ship.yaw);
  const pace = (vel[0] * f[0] + vel[2] * f[2]) + PRESENT_GAIN * ((lead[0] - ship.pos[0]) * f[0] + (lead[2] - ship.pos[2]) * f[2]);
  const best = Math.max(0.5, paceOf(ship, world.wind) * windFactor(offRunOf(ship.yaw, world.wind)));
  return { want, goal: null, sails: clamp(pace / best, PRESENT_SAILS, 1), sailable: true, track: true };
}

function chaserLead(ship, enemy, rel, eh, seaY) {
  const bow = batteryOf(ship.hull, 'bow');
  if (!bow || bow.gun === 'barrel' || !ship.guns.ready('bow')) return null;
  const lead = leadPoint(ship.pos, enemy.pos, rel, GUNS[bow.gun].speed);
  const ld = Math.hypot(lead[0] - ship.pos[0], lead[2] - ship.pos[2]);
  return ld <= batteryReach(ship, 'bow', seaY) * RUN_OUT_REACH && ld >= layMin(ship.hull, 'bow', eh) ? lead : null;
}

function boardCourse(ship, enemy, wind, isWater) {
  const v = enemy.vel ?? [0, 0, 0];
  const eYaw = Number.isFinite(enemy.yaw) ? enemy.yaw : Math.hypot(v[0], v[2]) > 0.3 ? Math.atan2(v[0], v[2]) : ship.yaw;
  const f = forwardOfYaw(eYaw), r = [f[2], 0, -f[0]];
  if (!ship.berthSide) ship.berthSide = ((ship.pos[0] - enemy.pos[0]) * r[0] + (ship.pos[2] - enemy.pos[2]) * r[2]) >= 0 ? 1 : -1;
  const gap = hullBuild(ship.hull).halfWidth + hullBuild(enemy.hull ?? HULL.LargeBoat).halfWidth + BERTH_GAP;
  const berthOn = (side) => [enemy.pos[0] + r[0] * side * gap, 0, enemy.pos[2] + r[2] * side * gap];
  if (!berthOpen(ship, berthOn(ship.berthSide), f, r, ship.berthSide, isWater) && berthOpen(ship, berthOn(-ship.berthSide), f, r, -ship.berthSide, isWater)) ship.berthSide = -ship.berthSide;
  const berth = berthOn(ship.berthSide);
  const wp = routeTo(ship, berth, isWater);
  const d = wp ? Math.hypot(wp[0] - ship.pos[0], wp[2] - ship.pos[2]) + Math.hypot(berth[0] - wp[0], berth[2] - wp[2]) : Math.hypot(berth[0] - ship.pos[0], berth[2] - ship.pos[2]);
  if (boardingGivenUp(ship, enemy.id, d)) return null;
  const along = Math.max(0, v[0] * f[0] + v[2] * f[2]);
  const pace = Math.sqrt(2 * DECEL * wayOf(ship) * Math.max(0, d - BOARD_SAILS.from)) + along;
  const best = Math.max(0.5, paceOf(ship, wind));
  const sails = clamp(pace / best, BOARD_SAILS.min, 1);
  const still = Math.hypot(v[0], v[2]) < GRAPPLE_STILL;
  const sweeps = still && d <= SWEEP_RANGE ? Math.min(SWEEP_WAY, pace) : 0;
  if (wp) return { want: headingTo(ship.pos, wp), goal: wp, sails, sweeps, sailable: sweeps > 0 };
  const berthing = still && !ship.route?.lost && berthOpen(ship, berth, f, r, ship.berthSide, isWater) && d <= lookout(ship).dist;
  if (d < 8) return { want: eYaw, goal: berth, sails, sweeps, sailable: sweeps > 0, berthing };
  const lead = still ? 0 : Math.min(60, d) * 0.8, ahead = Math.min(10, d / Math.max(1, ship.speed));
  const aim = [berth[0] - f[0] * lead + v[0] * ahead, 0, berth[2] - f[2] * lead + v[2] * ahead];
  return { want: headingTo(ship.pos, aim), goal: aim, sails, sweeps, sailable: sweeps > 0, berthing };
}
export const __boardCourse = boardCourse;

function berthOpen(ship, berth, f, r, side, isWater) {
  const b = hullBuild(ship.hull);
  for (const z of [b.bowZ, 0, b.aftZ]) {
    for (const x of [0, b.halfWidth + SCAN_MARGIN]) if (!isWater(berth[0] + f[0] * z + r[0] * side * x, berth[2] + f[2] * z + r[2] * side * x)) return false;
  }
  return true;
}

function legClear(ship, a, b, isWater) {
  const d = Math.hypot(b[0] - a[0], b[2] - a[2]);
  return d < 1 || courseClear(a, headingTo(a, b), d, isWater, { half: hullBuild(ship.hull).halfWidth + SCAN_MARGIN, step: ROUTE_STEP });
}

function routeTo(ship, goal, isWater) {
  const r = ship.route;
  if (r && Math.hypot(r.goal[0] - goal[0], r.goal[2] - goal[2]) < ROUTE_SLIP && ship.clock - r.at < (r.lost ? ROUTE_RETRY_S : ROUTE_EVERY_S)) return r.wp;
  const open = legClear(ship, ship.pos, goal, isWater);
  const wp = open ? null : wayRound(ship, goal, isWater, r?.wp ?? null);
  ship.route = { goal: [goal[0], 0, goal[2]], wp, at: ship.clock, lost: !open && !wp };
  return wp;
}

function wayRound(ship, goal, isWater, was) {
  const toward = headingTo(ship.pos, goal);
  const sideOf = (p) => Math.sign(Math.sin(headingTo(ship.pos, p) - toward));
  const keep = was ? sideOf(was) : 0;
  const ways = was ? [{ p: was, cost: Math.hypot(was[0] - ship.pos[0], was[2] - ship.pos[2]) + Math.hypot(goal[0] - was[0], goal[2] - was[2]) }] : [];
  for (const [o, from] of [[ship.pos, toward], [goal, toward + Math.PI]]) {
    for (const dist of ROUTE_DISTS) {
      for (let k = -180 + ROUTE_TURN; k <= 180; k += ROUTE_TURN) {
        const a = from + k * DEG;
        const p = [o[0] + Math.sin(a) * dist, 0, o[2] + Math.cos(a) * dist];
        const cost = Math.hypot(p[0] - ship.pos[0], p[2] - ship.pos[2]) + Math.hypot(goal[0] - p[0], goal[2] - p[2]);
        ways.push({ p, cost: keep && sideOf(p) !== keep ? cost * ROUTE_SWITCH : cost });
      }
    }
  }
  ways.sort((x, y) => x.cost - y.cost);
  for (const w of ways) if (isWater(w.p[0], w.p[2]) && legClear(ship, w.p, goal, isWater) && legClear(ship, ship.pos, w.p, isWater)) return w.p;
  return null;
}

function boardingGivenUp(ship, id, way) {
  const a = ship.approach;
  if (a?.id !== id) { ship.approach = { id, since: ship.clock, best: way }; return false; }
  if (way < a.best * (1 - CHASE_GAIN)) { a.best = way; a.since = ship.clock; }
  return ship.clock - a.since > CHASE_GIVE_UP_S;
}

function giveUp(ship, target) {
  ship.spare.set(target.id, ship.clock + SPARE_S);
  ship.mode = 'cruise'; ship.target = null; ship.berthSide = 0; ship.approach = null; ship.route = null;
  return { want: ship.yaw, goal: null, sails: 1 };
}

export function hullGap(aPos, aYaw, aHull, bPos, bYaw, bHull) {
  return flatGap(flatHull(aPos, aYaw, aHull ?? HULL.LargeBoat), flatHull(bPos, bYaw ?? 0, bHull ?? HULL.LargeBoat));
}

function fleeCourse(ship, from, wind) {
  const away = headingTo(from.pos, ship.pos);
  let best = away, bestV = -Infinity;
  for (let k = -FLEE_SPREAD; k <= FLEE_SPREAD; k += 15) {
    const h = wrapAngle(away + k * DEG);
    const v = windFactor(offRunOf(h, wind)) * Math.cos(k * DEG);
    if (v > bestV + 1e-9) { bestV = v; best = h; }
  }
  return { want: best, goal: null, sails: 1 };
}

function cruiseCourse(ship, wind, isWater, r) {
  if (ship.course) return Math.atan2(ship.course[0] - ship.pos[0], ship.course[1] - ship.pos[2]);
  const wp = ship.waypoint;
  if (!wp || Math.hypot(wp[0] - ship.pos[0], wp[1] - ship.pos[2]) < WAYPOINT_REACHED || !isWater(wp[0], wp[1])) {
    ship.waypoint = null;
    for (let i = 0; i < WAYPOINT_TRIES; i++) {
      const a = r() * Math.PI * 2;
      const dist = WAYPOINT_DIST[0] + r() * (WAYPOINT_DIST[1] - WAYPOINT_DIST[0]);
      if (ship.hull !== HULL.LargeGalley && offRunOf(a, wind) > CLOSE_HAULED * DEG) continue;
      const p = [ship.pos[0] + Math.sin(a) * dist, ship.pos[2] + Math.cos(a) * dist];
      let clear = true;
      for (let s = WAYPOINT_SOUND; s < dist && clear; s += WAYPOINT_SOUND) clear = isWater(ship.pos[0] + Math.sin(a) * s, ship.pos[2] + Math.cos(a) * s);
      if (clear && isWater(p[0], p[1])) { ship.waypoint = p; break; }
    }
    if (!ship.waypoint) {
      const a = wrapAngle(ship.yaw + Math.PI);
      let s = 0;
      while (s + WAYPOINT_SOUND <= WAYPOINT_DIST[0] && isWater(ship.pos[0] + Math.sin(a) * (s + WAYPOINT_SOUND), ship.pos[2] + Math.cos(a) * (s + WAYPOINT_SOUND))) s += WAYPOINT_SOUND;
      if (s >= WAYPOINT_REACHED * 2) ship.waypoint = [ship.pos[0] + Math.sin(a) * s, ship.pos[2] + Math.cos(a) * s];
    }
  }
  if (!ship.waypoint) return ship.yaw;
  return Math.atan2(ship.waypoint[0] - ship.pos[0], ship.waypoint[1] - ship.pos[2]);
}

function gunnery(ship, world, enemy, out, { broadsides = true } = {}) {
  if (!enemy) { ship.runOut.clear(); return; }
  const { bearing, dist } = bearingTo(ship, enemy.pos);
  const deg = bearing / DEG;
  const pose = { position: ship.pos, rotation: quatOfYaw(ship.yaw), velocity: velocityOf(ship), hull: ship.hull };
  const skill = ship.cls.skill;
  const r = world.random ?? Math.random;
  const my = velocityOf(ship);
  const rel = [(enemy.vel?.[0] ?? 0) - my[0], 0, (enemy.vel?.[2] ?? 0) - my[2]];
  const build = hullBuild(enemy.hull ?? HULL.LargeBoat);
  const battery = (side, bearingWant, arc, bear) => {
    const bat = batteryOf(ship.hull, side);
    if (!bat || bat.gun === 'barrel' || (!broadsides && (side === 'starboard' || side === 'port'))) { ship.runOut.delete(side); return; }
    const shot = ship.guns.load(side);
    const g = shotGun(bat.gun, GUNS[bat.gun], shot);
    const lead = leadPoint(ship.pos, enemy.pos, rel, g.speed);
    const toLead = bearingTo(ship, lead);
    const err = Math.abs(wrapAngle(toLead.bearing - bearingWant * DEG)) / DEG;
    const loaded = ship.guns.ready(side);
    const reach = batteryReach(ship, side, world.seaY);
    const inReach = toLead.dist <= reach * 1.02;
    const rig = shot === 'chain' && build.rig.length ? rigBand(build).map((y) => world.seaY + y) : null;
    const band = rig ?? [world.seaY, world.seaY + build.top];
    const aimY = rig ? (rig[0] + rig[1]) / 2 : world.seaY + build.top * AIM_FREEBOARD;
    const lay = (k) => aimSolution(pose, side, null, world.seaY, { target: [ship.pos[0] + (lead[0] - ship.pos[0]) * k, lead[1], ship.pos[2] + (lead[2] - ship.pos[2]) * k], targetY: aimY, shot });
    const clear = !lineFoul(ship, bat, lead, enemy, world);
    const strikes = () => { const sol = lay(1); return !!sol && layPasses(sol, lead, band); };
    const window = fireWindow(ship, enemy, lead, bat.gun, bear);
    const since = ship.runOut.get(side);
    if (since == null) {
      if ((ship.runIn.get(side) ?? -Infinity) > ship.clock - RUN_IN_S) return;
      const soon = err <= window || bearsWithin(ship, lead, enemy, side === 'bow' ? 0 : bearingWant, window) <= RUN_OUT_S;
      if (loaded && toLead.dist <= reach * RUN_OUT_REACH && err <= arc && soon && clear && strikes()) { ship.runOut.set(side, ship.clock); out.runOuts.push(side); }
      return;
    }
    if (!loaded || !inReach || err > RUN_IN_DEG || !clear || ship.clock - since > RUN_OUT_S + RUN_OUT_WAIT_S) {
      ship.runOut.delete(side);
      ship.runIn.set(side, ship.clock);
      return;
    }
    if (ship.clock - since < RUN_OUT_S || err > window) return;
    if (!strikes()) return;
    const solution = lay(1 + (r() - 0.5) * LAY_ERR * (1 - skill));
    if (!solution) return;
    out.volleys.push({ side, solution });
    ship.guns.fired(side);
    ship.runOut.delete(side);
    ship.lastFire = world.now;
  };
  battery('starboard', 90, RUN_OUT_DEG, BEAR_DEG);
  battery('port', -90, RUN_OUT_DEG, BEAR_DEG);
  battery('bow', 0, BOW_RUN_OUT, BOW_BEAR);
  if (Math.abs(deg) > 160 && dist < 45 && ship.guns.ready('stern')) {
    const bat = batteryOf(ship.hull, 'stern');
    if (bat?.gun === 'barrel') {
      const solution = aimSolution(pose, 'stern', null, world.seaY);
      if (solution) { out.barrels.push(solution); ship.guns.fired('stern'); }
    }
  }
}

export function fireWindow(ship, enemy, at, gun, bear) {
  const b = hullBuild(enemy.hull ?? HULL.LargeBoat);
  const los = Math.atan2(at[0] - ship.pos[0], at[2] - ship.pos[2]);
  const dist = Math.max(1, Math.hypot(at[0] - ship.pos[0], at[2] - ship.pos[2]));
  const v = enemy.vel ?? [0, 0, 0];
  const eyaw = Number.isFinite(enemy.yaw) ? enemy.yaw : Math.hypot(v[0], v[2]) > 0.3 ? Math.atan2(v[0], v[2]) : null;
  const halfLen = (b.bowZ - b.aftZ) / 2;
  const extent = eyaw == null ? (halfLen + b.halfWidth) * 2 / Math.PI : halfLen * Math.abs(Math.sin(eyaw - los)) + b.halfWidth * Math.abs(Math.cos(eyaw - los));
  const miss = extent * (FIRE_EXTENT_K + FIRE_EXTENT_SKILL * (1 - ship.cls.skill));
  const spread = (GUNS[gun]?.yawSpread ?? 1) * clamp(1.5 - ship.cls.skill, 0.4, 1.5);
  return Math.min(bear, Math.max(spread, Math.asin(Math.min(1, miss / dist)) / DEG));
}

export function bearsWithin(ship, lead, enemy, want, window) {
  const dx = lead[0] - ship.pos[0], dz = lead[2] - ship.pos[2];
  const d2 = dx * dx + dz * dz;
  if (d2 < 1) return 0;
  const err = wrapAngle(Math.atan2(dx, dz) - ship.yaw - want * DEG) / DEG;
  if (Math.abs(err) <= window) return 0;
  const v = ship.tvel?.id === enemy.id ? ship.tvel.v : enemy.vel ?? [0, 0, 0];
  const my = velocityOf(ship);
  const rx = v[0] - my[0], rz = v[2] - my[2];
  // The rate of the world bearing, atan2(dx, dz), less her own yaw rate.
  const rate = ((dz * rx - dx * rz) / d2 - (ship.yawRate ?? 0)) / DEG;
  if (Math.sign(rate) === Math.sign(err) || Math.abs(rate) < 1e-6) return Infinity;
  return (Math.abs(err) - window) / Math.abs(rate);
}

export function rigBand(build) {
  let lo = Infinity, hi = -Infinity;
  for (const [mn, mx] of build.rig) { lo = Math.min(lo, mn[1]); hi = Math.max(hi, mx[1]); }
  return [Math.max(lo, build.top), hi];
}

export function layPasses(solution, at, band) {
  const l = solution.launches[solution.launches.length >> 1];
  if (!l) return false;
  const along = l.v0[0] * solution.dir[0] + l.v0[2] * solution.dir[2];
  const x = (at[0] - l.p0[0]) * solution.dir[0] + (at[2] - l.p0[2]) * solution.dir[2];
  if (!(along > 1e-6) || !(x > 0)) return false;
  const t = x / along;
  const y = l.p0[1] + l.v0[1] * t - 0.5 * SHOT_GRAVITY * t * t;
  return y >= band[0] - 0.25 && y <= band[1];
}

export function lineFoul(ship, bat, lead, enemy, world) {
  const f = forwardOfYaw(ship.yaw), rr = [f[2], 0, -f[0]];
  const m = bat.muzzles[bat.muzzles.length >> 1];
  const a = [ship.pos[0] + rr[0] * m[0] + f[0] * m[2], 0, ship.pos[2] + rr[2] * m[0] + f[2] * m[2]];
  const len = Math.hypot(lead[0] - a[0], lead[2] - a[2]);
  if (len < 1e-6) return false;
  const over = hullLength(enemy.hull ?? HULL.LargeBoat) / 2;
  const b = [a[0] + (lead[0] - a[0]) / len * (len + over), 0, a[2] + (lead[2] - a[2]) / len * (len + over)];
  for (const c of world.contacts ?? []) {
    if (c.id === ship.id || c.id === enemy.id || c.gone || hostile(ship, c, world)) continue;
    const hb = hullBuild(c.hull ?? HULL.LargeBoat);
    const yaw = Number.isFinite(c.yaw) ? c.yaw : 0;
    const cf = [Math.sin(yaw), Math.cos(yaw)], cr = [cf[1], -cf[0]];
    const mid = (hb.bowZ + hb.aftZ) / 2;
    const cc = [c.pos[0] + cf[0] * mid, c.pos[2] + cf[1] * mid];
    const hl = (hb.bowZ - hb.aftZ) / 2 + FRIEND_CLEAR, hw = hb.halfWidth + FRIEND_CLEAR;
    const to = (p) => { const d = [p[0] - cc[0], p[2] - cc[1]]; return [d[0] * cr[0] + d[1] * cr[1], d[0] * cf[0] + d[1] * cf[1]]; };
    const pa = to(a), pb = to(b);
    let t0 = 0, t1 = 1, crosses = true;
    for (const [i, h] of [[0, hw], [1, hl]]) {
      const d = pb[i] - pa[i];
      if (Math.abs(d) < 1e-9) { if (Math.abs(pa[i]) > h) { crosses = false; break; } continue; }
      let u = (-h - pa[i]) / d, w = (h - pa[i]) / d;
      if (u > w) [u, w] = [w, u];
      t0 = Math.max(t0, u); t1 = Math.min(t1, w);
      if (t0 > t1) { crosses = false; break; }
    }
    if (crosses) return true;
  }
  return false;
}

// A sea ship lives in a room, not a save: this is the wire state, and no save keeps it.
export function shipWireState(ship) {
  return {
    id: ship.id, seed: ship.seed, cls: ship.cls.id, variant: ship.variant,
    pos: ship.pos, yaw: ship.yaw, speed: ship.speed, sails: ship.sails, heel: ship.heel,
    mode: ship.mode, damage: ship.damage.snapshot(),
  };
}
