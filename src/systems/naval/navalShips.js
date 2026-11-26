// @ts-check
import { srand, getSeed, setSeed } from '../../formats/dfRandom.js';
import { fullName, getNameBankOfRegion, GENDERS } from '../../characters/nameHelper.js';
import { REGION_NAMES } from '../../formats/mapsFile.js';
import { mulberry32 } from '../../combat/bloodArt.js';
import { t } from '../../ui/textManager.js';

// Keep in step with HULL_NAMES in comeSailAwayHulls.js.
export const HULL = Object.freeze({ Rowboat: 0, LargeBoat: 1, SmallShip: 2, LargeGalley: 3, Carrack: 4 });

export const GUNS = Object.freeze({
  long: Object.freeze({ speed: 62, minEl: -8, maxEl: 15, reload: 9, yawSpread: 1.6, pitchSpread: 0.9, radius: 0.11, hull: 14, sail: 3, crew: 1 }),
  swivel: Object.freeze({ speed: 55, minEl: -10, maxEl: 14, reload: 4, yawSpread: 1.3, pitchSpread: 0.8, radius: 0.07, hull: 5, sail: 2, crew: 2 }),
  heavy: Object.freeze({ speed: 68, minEl: -6, maxEl: 15, reload: 12, yawSpread: 2.0, pitchSpread: 1.0, radius: 0.15, hull: 30, sail: 4, crew: 2 }),
  chain: Object.freeze({ speed: 58, minEl: -6, maxEl: 16, reload: 7, yawSpread: 2.2, pitchSpread: 1.2, radius: 0.13, hull: 3, sail: 16, crew: 1 }),
  barrel: Object.freeze({ speed: 0, minEl: 0, maxEl: 0, reload: 6, yawSpread: 0, pitchSpread: 0, radius: 0.5, hull: 45, sail: 6, crew: 3 }),
});

export const BARREL = Object.freeze({ life: 90, fuse: 7, burn: 12, burnPerSecond: 2.5, stock: 4 });

export const SIDES = Object.freeze(['starboard', 'port', 'bow', 'stern']);
export const SIDE_DIR = Object.freeze({ starboard: Object.freeze([1, 0, 0]), port: Object.freeze([-1, 0, 0]), bow: Object.freeze([0, 0, 1]), stern: Object.freeze([0, 0, -1]) });

export const SHIP_TOUGHNESS = 1.6;
export const PLAYER_CREW_TOUGHNESS = 2 * SHIP_TOUGHNESS;
const tough = (hp) => Math.round(hp * SHIP_TOUGHNESS);
function rigOf(...boxes) { return Object.freeze(boxes.map((b) => Object.freeze(Object.assign(b.slice(0, 2).map((p) => Object.freeze([...p])), b[2] ?? {})))); }
const onBoom = (k, pivot, min, max, sail, variant = null) => [min, max, { boom: k, pivot: Object.freeze(pivot), sail, ...(variant == null ? {} : { variant }) }];
function pitched(c, h, pitch, sail) {
  const a = pitch * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const p = [c[0] + sx * h[0], c[1] + sy * h[1] * cs - sz * h[2] * sn, c[2] + sy * h[1] * sn + sz * h[2] * cs];
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
  }
  return [min, max, { obb: Object.freeze({ c: Object.freeze(c), h: Object.freeze(h), pitch }), sail }];
}

// Muzzles and boxes are in the boat root's frame (+x starboard, +y up, +z bow); port mirrors starboard.
export const HULL_BUILDS = Object.freeze([
  Object.freeze({
    hull: 0, gun: null, broadside: Object.freeze([]), bow: null, stern: null,
    hullHp: tough(60), sailHp: tough(0), crew: 0, deck: 0.1, beam: 1.0, ram: false, bowZ: 2.94, aftZ: -2.14, halfWidth: 1.08, keel: -0.23, top: 0.78, sailWay: 1,
    rig: Object.freeze([]),
  }),
  Object.freeze({
    hull: 1, gun: 'swivel',
    broadside: Object.freeze([[2.65, 2.62, -2.3], [2.65, 2.62, 0.3], [2.65, 2.62, 2.3]].map(Object.freeze)),
    bow: Object.freeze({ gun: 'swivel', muzzles: Object.freeze([Object.freeze([-0.35, 2.62, 6.25])]) }),
    stern: null,
    hullHp: tough(150), sailHp: tough(60), crew: 0, deck: 0.9, beam: 1.5, ram: false, bowZ: 6.24, aftZ: -6.24, halfWidth: 2.03, keel: -0.62, top: 2.59, sailWay: 1,
    rig: rigOf(
      onBoom(0, [-0.0171, 5.1175, -0.5993], [-1.09, 2.72, -5.04], [0.22, 4.91, 4.5], 0, 0),
      onBoom(0, [-0.0171, 5.1175, -0.5993], [-0.91, 4.91, -5.35], [0.16, 7.35, -0.41], 0, 0),
      onBoom(0, [-0.0171, 3.75, -0.5993], [-1.09, 3.8, -4.2], [1.05, 6.15, -0.93], 0, 1),
      [[-0.59, 2.75, 1.78], [0.57, 4.12, 6.63], { variant: 1, sail: 1 }],
      [[-0.45, 4.12, 0.86], [0.43, 5.49, 3.92], { variant: 1, sail: 1 }],
      onBoom(0, [-0.0171, 3.75, -0.5993], [-1.09, 3.8, -4.2], [1.05, 5.55, -0.93], 0, 2),
      onBoom(1, [-0.0171, 5.75, -0.5993], [-3.32, 3.29, -0.35], [3.28, 5.85, 0.57], 1, 2),
      [[-0.59, 2.75, 1.78], [0.57, 4.12, 6.63], { variant: 2, sail: 2 }],
      [[-0.45, 4.12, 0.86], [0.43, 5.49, 3.92], { variant: 2, sail: 2 }],
      onBoom(0, [-0.0171, 8.8, -0.5993], [-1.77, 7.22, -0.42], [1.73, 8.87, -0.04], 0, 3),
      onBoom(1, [-0.0171, 5.1175, -0.5993], [-1.09, 2.72, -5.04], [0.22, 4.91, 4.5], 1, 3),
      onBoom(1, [-0.0171, 5.1175, -0.5993], [-0.91, 4.91, -5.35], [0.16, 7.35, -0.41], 1, 3),
      [[-0.8, 2.75, 0.86], [0.78, 5.63, 7.24], { variant: 4, sail: 0 }],
      [[-0.61, 5.63, 0.32], [0.58, 8.52, 3.95], { variant: 4, sail: 0 }],
      onBoom(0, [-0.0171, 3.75, -0.5993], [-0.34, 5.87, -3.75], [0.31, 8.7, -0.77], 1, 4),
      onBoom(0, [-0.0171, 3.75, -0.5993], [-1.09, 3.8, -4.2], [1.05, 6.15, -0.93], 2, 4),
      onBoom(0, [-0.0171, 3.75, -0.5993], [-1.09, 3.8, -5], [1.05, 7.75, -0.93], 0, 5),
      onBoom(1, [-0.0171, 8.8, -0.5993], [-1.77, 7.22, -0.42], [1.73, 8.87, -0.04], 1, 5),
      [[-0.59, 2.75, 1.78], [0.57, 4.12, 6.63], { variant: 5, sail: 2 }],
      [[-0.45, 4.12, 0.86], [0.43, 5.49, 3.92], { variant: 5, sail: 2 }],
      onBoom(0, [-0.0171, 5.75, -0.5993], [-3.32, 3.29, -0.35], [3.28, 5.85, 0.57], 0, 6),
      onBoom(1, [-0.0171, 8.8, -0.5993], [-1.77, 7.22, -0.42], [1.73, 8.87, -0.04], 1, 6),
    ),
  }),
  Object.freeze({
    hull: 2, gun: 'long',
    broadside: Object.freeze([[5.949, 2.2435, -7.595], [5.949, 2.2435, -4.417], [5.949, 2.2435, -0.714], [5.949, 2.2435, 2.8105], [5.949, 2.2435, 6.5135]].map(Object.freeze)),
    bow: Object.freeze({ gun: 'chain', muzzles: Object.freeze([Object.freeze([-1.15, 7.45, 19.15]), Object.freeze([1.15, 7.45, 19.15])]) }),
    stern: Object.freeze({ gun: 'barrel', muzzles: Object.freeze([Object.freeze([0, 5.4, -20.6])]) }),
    hullHp: tough(420), sailHp: tough(160), crew: 24, deck: 6.2, beam: 5.4, ram: false, bowZ: 21.93, aftZ: -19.91, halfWidth: 5.86, keel: -4.64, top: 12.3, sailWay: 1,
    rig: rigOf(
      onBoom(1, [0, 16, 8.772], [-5, 12.42, 9.34], [5, 16.17, 10.33], 1),
      onBoom(2, [0, 17.65, -0.191], [-5.2, 13.27, 0.42], [5.2, 17.82, 1.44], 2),
      onBoom(3, [0, 7.75, -0.191], [-1.07, 8.07, -8.2], [1.07, 15.03, -0.79], 3),
      onBoom(0, [0, 12.2, 8.772], [-6.3, 7.67, 9.34], [6.3, 12.37, 11.45], 0),
      pitched([0, 11.92, 17.932], [1.06, 1.06, 9.37], 22.79, 4),
      pitched([0, 12.375, 15.832], [1.03, 0.96, 7.35], 40.93, 4),
      pitched([0, 9.286, 22.488], [1.06, 0.91, 4.54], -10.23, 4),
    ),
  }),
  Object.freeze({
    hull: 3, gun: 'long',
    broadside: Object.freeze([[9.3, 11.1, -20], [9.3, 11.1, -8], [9.3, 11.1, 4], [9.3, 11.1, 16]].map(Object.freeze)),
    bow: Object.freeze({ gun: 'heavy', muzzles: Object.freeze([Object.freeze([-1.6, 8.3, 45.0]), Object.freeze([0, 8.3, 46.0]), Object.freeze([1.6, 8.3, 45.0])]) }),
    stern: null,
    hullHp: tough(520), sailHp: tough(90), crew: 60, deck: 10.25, beam: 8.8, ram: true, bowZ: 51.27, aftZ: -41.89, halfWidth: 11.17, keel: -2.46, top: 14.09, sailWay: 0.5,
    rig: rigOf([[-25, 17, 12.5], [25, 36.9, 17]]),
  }),
  Object.freeze({
    hull: 4, gun: 'long',
    broadside: Object.freeze([[6.785, 3.4982, -9.2435], [6.785, 3.4982, -5.6075], [6.785, 3.4982, -1.3762], [6.785, 3.4982, 2.6505], [6.785, 3.4982, 6.8825]].map(Object.freeze)),
    bow: Object.freeze({ gun: 'chain', muzzles: Object.freeze([Object.freeze([-1.15, 9.95, 20.45]), Object.freeze([1.15, 9.95, 20.45])]) }),
    stern: Object.freeze({ gun: 'barrel', muzzles: Object.freeze([Object.freeze([0, 8.9, -23.6])]) }),
    hullHp: tough(560), sailHp: tough(220), crew: 30, deck: 7.81, beam: 6.0, ram: false, bowZ: 26.14, aftZ: -23.31, halfWidth: 6.7, keel: -4.59, top: 11.55, sailWay: 1,
    rig: rigOf(
      onBoom(0, [0, 9.35, 28.4], [-3.5, 6.17, 28.16], [3.5, 9.52, 29.3], 0),
      onBoom(1, [0, 15.5, 17.2475], [-5.7, 10.77, 17.33], [5.7, 15.67, 19.78], 1),
      onBoom(2, [0, 15.2, 8.9293], [-5.6, 11.27, 9.01], [5.6, 15.37, 11.49], 2),
      onBoom(3, [0, 18.9, 8.9293], [-4.7, 15.47, 9.01], [4.7, 19.07, 10.46], 3),
      onBoom(4, [0, 15.54, -1.279], [-1.95, 12.4, -9.76], [0.21, 16.0, 2.28], 4),
      onBoom(4, [0, 15.54, -1.279], [-1.73, 16.0, -10.08], [0.03, 20.91, -3.87], 4),
    ),
  }),
]);

export const MOD_LARGE_BOAT_BUILD = Object.freeze({
  hull: 1, gun: 'swivel',
  broadside: Object.freeze([[1.8, 1.3, -2.3], [2.05, 1.3, 0.3], [1.8, 1.3, 2.3]].map(Object.freeze)),
  bow: Object.freeze({ gun: 'swivel', muzzles: Object.freeze([Object.freeze([0, 1.6, 5.9])]) }),
  stern: null,
  hullHp: tough(150), sailHp: tough(60), crew: 0, deck: 0.1, beam: 1.9, ram: false, bowZ: 6.51, aftZ: -5.99, halfWidth: 2.15, keel: -0.64, top: 1.59, sailWay: 1,
  rig: rigOf([[-1.7, 1.59, -5.44], [1.7, 9.27, 6.71]]),
});

export const MOD_CARRACK_BUILD = Object.freeze({
  hull: 4, gun: 'long',
  broadside: Object.freeze([[6.3, 4.5, -16], [7.0, 4.5, -12], [7.7, 4.5, -8], [7.9, 4.5, -4.2], [7.4, 4.5, 0], [7.1, 4.5, 4.2], [5.8, 4.5, 8.4]].map(Object.freeze)),
  bow: Object.freeze({ gun: 'chain', muzzles: Object.freeze([Object.freeze([-1.2, 10.1, 19.5]), Object.freeze([1.2, 10.1, 19.5])]) }),
  stern: Object.freeze({ gun: 'barrel', muzzles: Object.freeze([Object.freeze([0, 7.6, -27.5])]) }),
  hullHp: tough(560), sailHp: tough(220), crew: 30, deck: 3.64, beam: 7.4, ram: false, bowZ: 23.71, aftZ: -28.24, halfWidth: 8.43, keel: -3.35, top: 11.82, sailWay: 1,
  rig: rigOf([[-13.8, 20, 14], [13.8, 39.6, 18.5]], [[-10.5, 26, -5], [10.5, 45.3, -1.5]], [[-3, 17, -31], [3, 39.7, -10.7]]),
});

export const MOD_SMALL_SHIP_BUILD = Object.freeze({
  hull: 2, gun: 'long',
  broadside: Object.freeze([[7.2, 4.5, -12], [7.8, 4.5, -8], [8.1, 4.5, -4.5], [7.8, 4.5, -1], [7.4, 4.5, 2.5], [7.0, 4.5, 6]].map(Object.freeze)),
  bow: Object.freeze({ gun: 'chain', muzzles: Object.freeze([Object.freeze([-1.4, 7.6, 16.0]), Object.freeze([1.4, 7.6, 16.0])]) }),
  stern: Object.freeze({ gun: 'barrel', muzzles: Object.freeze([Object.freeze([0, 7.6, -23.0])]) }),
  hullHp: tough(420), sailHp: tough(160), crew: 24, deck: 3.64, beam: 7.4, ram: false, bowZ: 19.88, aftZ: -24.25, halfWidth: 8.43, keel: -3.35, top: 10.92, sailWay: 1,
  rig: rigOf([[-3.5, 10.92, -20.1], [3.5, 34, 26]]),
});
// A hull falls back to the mod's own build while its model does not load, never to no ship.
export const MOD_BUILDS = Object.freeze({ 1: MOD_LARGE_BOAT_BUILD, 2: MOD_SMALL_SHIP_BUILD, 4: MOD_CARRACK_BUILD });
const standing = { 1: true, 2: true, 4: true };
let stamp = 0;
// Each switch bumps buildsStamp, which invalidates anything reckoned off the builds.
export function setShipStanding(hull, on) { if (standing[hull] !== !!on) stamp++; standing[hull] = !!on; }
export function setGalleonStanding(on) { setShipStanding(2, on); }
export const buildsStamp = () => stamp;
export const hullBuild = (hull) => (MOD_BUILDS[hull] && !standing[hull] ? MOD_BUILDS[hull] : HULL_BUILDS[hull] ?? HULL_BUILDS[0]);
export const hullMid = (b) => (b.bowZ + b.aftZ) / 2;
export function flatHull(pos, yaw, hull) {
  const b = hullBuild(hull);
  const f = [Math.sin(yaw), Math.cos(yaw)];
  const mid = hullMid(b);
  return { c: [pos[0] + f[0] * mid, pos[2] + f[1] * mid], f, r: [f[1], -f[0]], hl: (b.bowZ - b.aftZ) / 2, hw: b.halfWidth };
}
export function hullOverlap(A, B) {
  const d = [B.c[0] - A.c[0], B.c[1] - A.c[1]];
  let best = null, least = Infinity;
  for (const u of [A.f, A.r, B.f, B.r]) {
    const ra = A.hl * Math.abs(A.f[0] * u[0] + A.f[1] * u[1]) + A.hw * Math.abs(A.r[0] * u[0] + A.r[1] * u[1]);
    const rb = B.hl * Math.abs(B.f[0] * u[0] + B.f[1] * u[1]) + B.hw * Math.abs(B.r[0] * u[0] + B.r[1] * u[1]);
    const dd = d[0] * u[0] + d[1] * u[1];
    const o = ra + rb - Math.abs(dd);
    if (o <= 0) return null;
    if (o < least) { least = o; best = [-Math.sign(dd || 1) * u[0] * o, -Math.sign(dd || 1) * u[1] * o]; }
  }
  return best;
}
export function flatGap(A, B) {
  const d = [B.c[0] - A.c[0], B.c[1] - A.c[1]];
  let gap = -Infinity;
  for (const u of [A.f, A.r, B.f, B.r]) {
    const ra = A.hl * Math.abs(A.f[0] * u[0] + A.f[1] * u[1]) + A.hw * Math.abs(A.r[0] * u[0] + A.r[1] * u[1]);
    const rb = B.hl * Math.abs(B.f[0] * u[0] + B.f[1] * u[1]) + B.hw * Math.abs(B.r[0] * u[0] + B.r[1] * u[1]);
    gap = Math.max(gap, Math.abs(d[0] * u[0] + d[1] * u[1]) - ra - rb);
  }
  return gap;
}
// Saves from before the toughening measured hurts against these points.
export function firstBuildOf(hull) {
  const b = hullBuild(hull);
  return { hullHp: Math.round(b.hullHp / SHIP_TOUGHNESS), sailHp: Math.round(b.sailHp / SHIP_TOUGHNESS) };
}

export function batteryOf(hull, side) {
  const b = hullBuild(hull);
  if (side === 'starboard' || side === 'port') {
    if (!b.gun || !b.broadside.length) return null;
    const s = side === 'port' ? -1 : 1;
    return { side, gun: b.gun, muzzles: b.broadside.map((m) => [m[0] * s, m[1], m[2]]) };
  }
  const k = side === 'bow' ? b.bow : side === 'stern' ? b.stern : null;
  return k ? { side, gun: k.gun, muzzles: k.muzzles.map((m) => [...m]) } : null;
}
// Each ball of a player broadside weighs what the mod build fired, so fewer gunports keep the same broadside.
export const playerBatteryWeight = (hull, side) => (MOD_BUILDS[hull] && (side === 'starboard' || side === 'port')
  ? MOD_BUILDS[hull].broadside.length / Math.max(1, hullBuild(hull).broadside.length) : 1);
// Captain galleons keep the broadside their duels were tuned with; captain carracks throw the mod broadside.
export const shipBatteryWeight = (hull, side, player) => (player || hull === HULL.Carrack ? playerBatteryWeight(hull, side) : 1);
export const batteriesOf = (hull) => SIDES.map((s) => batteryOf(hull, s)).filter(Boolean);

export const NAVAL_FACTIONS = Object.freeze({
  pirate: Object.freeze({ id: 'pirate', title: 'Pirates', hostile: true, lawful: false, flees: false, flag: Object.freeze([0.1, 0.09, 0.08]) }),
  merchant: Object.freeze({ id: 'merchant', title: 'Merchantman', hostile: false, lawful: true, flees: true, flag: Object.freeze([0.92, 0.82, 0.3]) }),
  navy: Object.freeze({ id: 'navy', title: 'Navy', hostile: false, lawful: true, flees: false, flag: Object.freeze([0.62, 0.1, 0.09]) }),
});
export const FACTION_IDS = Object.freeze(Object.keys(NAVAL_FACTIONS));

// Past any captain's level, so no draw by level ever finds a legend or a fishing boat.
export const LEGEND_LEVEL = 999;
export const FISHER_LEVEL = LEGEND_LEVEL;
export const FISH_OAR_MPS = 1.8;
// The wire sends a class by row, and older builds know only the first NAVAL_WIRE_OLD_CLASSES, so add classes last.
export const SHIP_CLASSES = Object.freeze([
  cls('pirateSloop', 'pirate', HULL.LargeBoat, 'Pirate Sloop', { hullHp: 1.1, sailHp: 1, crew: 10, speed: 4.6, turn: 16, skill: 0.45, range: 50, cargo: 1, minLevel: 1, weight: 5, boarders: 8 }),
  cls('pirateBrig', 'pirate', HULL.SmallShip, 'Pirate Brigantine', { hullHp: 0.9, sailHp: 0.9, crew: 22, speed: 7.6, turn: 9, skill: 0.55, range: 95, cargo: 2, minLevel: 4, weight: 4, boarders: 13 }),
  cls('pirateGalley', 'pirate', HULL.LargeGalley, 'Corsair Galley', { hullHp: 0.85, sailHp: 1, crew: 40, speed: 6.6, turn: 8, skill: 0.5, range: 80, cargo: 2, minLevel: 7, weight: 2, boarders: 13, tactic: 'bow' }),
  cls('pirateFlagship', 'pirate', HULL.Carrack, 'Pirate Flagship', { hullHp: 1.15, sailHp: 1, crew: 34, speed: 6.4, turn: 6, skill: 0.7, range: 110, cargo: 4, minLevel: 9, weight: 1, boarders: 20, flagship: true }),
  cls('merchantCoaster', 'merchant', HULL.LargeBoat, 'Coasting Trader', { hullHp: 0.9, sailHp: 1, crew: 5, speed: 4.0, turn: 13, skill: 0.25, range: 60, cargo: 1, minLevel: 1, weight: 5, boarders: 5 }),
  cls('merchantGalleon', 'merchant', HULL.SmallShip, 'Merchant Galleon', { hullHp: 0.8, sailHp: 0.9, crew: 14, speed: 6.5, turn: 8, skill: 0.3, range: 110, cargo: 3, minLevel: 3, weight: 3, boarders: 9 }),
  cls('merchantCarrack', 'merchant', HULL.Carrack, 'Merchant Carrack', { hullHp: 0.9, sailHp: 0.9, crew: 18, speed: 5.4, turn: 5, skill: 0.3, range: 120, cargo: 4, minLevel: 5, weight: 2, boarders: 11 }),
  cls('navyCutter', 'navy', HULL.SmallShip, 'Navy Cutter', { hullHp: 1, sailHp: 1, crew: 26, speed: 8.0, turn: 10, skill: 0.75, range: 90, cargo: 2, minLevel: 1, weight: 3, boarders: 14 }),
  cls('navyGalley', 'navy', HULL.LargeGalley, 'War Galley', { hullHp: 1, sailHp: 1, crew: 60, speed: 6.8, turn: 9, skill: 0.7, range: 70, cargo: 2, minLevel: 6, weight: 2, boarders: 18, tactic: 'bow' }),
  cls('legendWake', 'pirate', HULL.SmallShip, 'Legendary Brigantine', { hullHp: 1.8, sailHp: 1.4, crew: 34, speed: 9.4, turn: 12, skill: 0.85, range: 95, cargo: 4, minLevel: LEGEND_LEVEL, weight: 0, boarders: 22, legend: true }),
  cls('legendQueen', 'pirate', HULL.Carrack, 'Legendary Carrack', { hullHp: 2.4, sailHp: 1.3, crew: 48, speed: 6.6, turn: 6, skill: 0.8, range: 115, cargo: 4, minLevel: LEGEND_LEVEL, weight: 0, boarders: 30, legend: true }),
  cls('legendHunger', 'pirate', HULL.LargeGalley, 'Legendary War Galley', { hullHp: 2, sailHp: 1.3, crew: 120, speed: 7.2, turn: 9, skill: 0.75, range: 75, cargo: 4, minLevel: LEGEND_LEVEL, weight: 0, boarders: 45, tactic: 'bow', legend: true }),
  cls('legendLantern', 'pirate', HULL.SmallShip, 'Legendary Brigantine', { hullHp: 2, sailHp: 1.5, crew: 40, speed: 8.8, turn: 11, skill: 0.9, range: 100, cargo: 4, minLevel: LEGEND_LEVEL, weight: 0, boarders: 26, legend: true }),
  cls('legendRegent', 'pirate', HULL.Carrack, 'Legendary Carrack', { hullHp: 3.2, sailHp: 1.6, crew: 60, speed: 6.8, turn: 6, skill: 0.95, range: 125, cargo: 4, minLevel: LEGEND_LEVEL, weight: 0, boarders: 36, legend: true }),
  cls('legendStarless', 'pirate', HULL.Carrack, 'Legendary Carrack', { hullHp: 3.6, sailHp: 1.8, crew: 70, speed: 7.4, turn: 7, skill: 0.92, range: 120, cargo: 4, minLevel: LEGEND_LEVEL, weight: 0, boarders: 40, legend: true }),
  cls('fishingSkiff', 'merchant', HULL.Rowboat, () => t('naval.class.fishingSkiff', 'Fishing Skiff'), { hullHp: 0.8, sailHp: 1, crew: 2, speed: FISH_OAR_MPS, turn: 24, skill: 0.1, range: 50, cargo: 1, minLevel: FISHER_LEVEL, weight: 0, boarders: 2, fisher: true }),
  cls('fishingSmack', 'merchant', HULL.LargeBoat, () => t('naval.class.fishingSmack', 'Fishing Smack'), { hullHp: 0.8, sailHp: 0.9, crew: 4, speed: 3.6, turn: 14, skill: 0.15, range: 50, cargo: 1, minLevel: FISHER_LEVEL, weight: 0, boarders: 3, fisher: true }),
]);

function cls(id, faction, hull, title, o) {
  const b = hullBuild(hull);
  return Object.freeze({
    id, faction, hull,
    get title() { return typeof title === 'function' ? title() : title; },
    hullHp: Math.round(b.hullHp * o.hullHp), sailHp: Math.round(b.sailHp * o.sailHp), crew: o.crew,
    speed: o.speed, turn: o.turn, skill: o.skill, range: o.range, cargo: o.cargo, minLevel: o.minLevel,
    weight: o.weight, boarders: o.boarders, flagship: !!o.flagship, tactic: o.tactic ?? 'broadside', legend: !!o.legend, fisher: !!o.fisher,
  });
}
export const classById = (id) => SHIP_CLASSES.find((c) => c.id === id) ?? null;

export function classFor(faction, level, r) {
  const pool = SHIP_CLASSES.filter((c) => c.faction === faction && c.minLevel <= Math.max(1, level | 0));
  const list = pool.length ? pool : SHIP_CLASSES.filter((c) => c.faction === faction).slice(0, 1);
  const total = list.reduce((s, c) => s + c.weight, 0);
  let x = Math.max(0, Math.min(0.999999, r)) * total;
  for (const c of list) { if ((x -= c.weight) < 0) return c; }
  return list[list.length - 1] ?? null;
}

export const CROWNS = Object.freeze([
  Object.freeze({ region: 17, name: 'Daggerfall', ruler: 'Gothryd', ships: Object.freeze(["Gothryd's Resolve", 'King Lysandus', "Mynisera's Grace", 'Daggerfall Vigilant', 'Stalwart', 'Breton Crown']) }),
  Object.freeze({ region: 23, name: 'Wayrest', ruler: 'Eadwyre', ships: Object.freeze(["Eadwyre's Vigil", 'Queen Barenziah', 'Wayrest Sentinel', 'Illessan Guard', 'Loyalty', 'Iliac Warden']) }),
  Object.freeze({ region: 20, name: 'Sentinel', ruler: 'Akorithi', ships: Object.freeze(["Akorithi's Justice", 'Prince Lhotun', 'Sentinel Sun', 'Desert Falcon', 'Crowned Serpent', 'Hammerfell Pride']) }),
]);

export const PIRATE_NAMES = Object.freeze([
  'Black Kraken', "Dreugh's Maw", 'Sea Hag', 'Red Wake', 'Gallows Wind', "Dagon's Tooth", 'Rotting Oar',
  'Salt Reaver', 'Stormcrow', "Hircine's Grin", 'Bloody Gull', 'Drowned King', 'Iliac Wraith', 'Slaughterfish',
  'Scourge of Betony', 'Night Tide', 'Widowmaker', 'Crimson Gannet',
]);
export const MERCHANT_NAMES = Object.freeze([
  'Wayrest Trader', 'Pride of Camlorn', 'Gilded Cog', 'Daggerfall Merchant', 'Abibon-Gora Spice', 'Bountiful',
  'Lady of Anticlere', 'Northmoor Wool', 'Honest Scale', 'Orsinium Iron', 'Bay Pilgrim', 'Glenpoint Lass',
  'Menevian Rose', 'Kambria Barley', 'Satakalaam Silk', 'Fair Winds of Tulune',
]);

// Names draw on their own stream, so a peer's copy with the same seed and region has the same name.
export const SHIP_NAME_SALT = 0x4e414d45;
export const CROWN_LORE = Object.freeze({
  Daggerfall: Object.freeze({ royals: Object.freeze(['Gothryd', 'Lysandus', 'Mynisera', 'Aubk-i', 'Nulfaga', 'Joile']),
    places: Object.freeze(['Daggerfall', 'Glenpoint', 'Kambria', 'Betony', 'Tulune', 'Glenumbra', 'Ilessan Hills', 'Daenia']) }),
  Wayrest: Object.freeze({ royals: Object.freeze(['Eadwyre', 'Barenziah', 'Helseth', 'Elysana', 'Morgiah', 'Emeric']),
    places: Object.freeze(['Wayrest', 'Menevia', 'Gavaudon', 'Anticlere', 'Northmoor', 'Evermor', 'Mournoth', 'Lainlyn']) }),
  Sentinel: Object.freeze({ royals: Object.freeze(['Akorithi', 'Camaron', 'Lhotun', 'Greklith', 'Aubk-i', 'Hunding']),
    places: Object.freeze(['Sentinel', 'Satakalaam', 'Abibon-Gora', 'Antiphyllos', 'Ayasofya', 'Cybiades', 'Bergama', 'Kozanset']) }),
});
export const NAME_WORDS = Object.freeze({
  virtues: Object.freeze(['Resolve', 'Vigil', 'Grace', 'Justice', 'Valor', 'Honor', 'Constancy', 'Fortitude', 'Wrath', 'Shield', 'Lance', 'Sword',
    'Herald', 'Pride', 'Triumph', 'Glory', 'Majesty', 'Defiance', 'Promise', 'Mercy', 'Faith', 'Oath', 'Banner', 'Bulwark', 'Gauntlet', 'Hammer',
    'Torch', 'Sceptre', 'Courage', 'Fury', 'Answer', 'Will', 'Word', 'Reach', 'Watch', 'Ward', 'Claim', 'Right', 'Command', 'Victory']),
  martial: Object.freeze(['Vigilant', 'Defiant', 'Intrepid', 'Invincible', 'Resolute', 'Indomitable', 'Dauntless', 'Valiant', 'Implacable', 'Steadfast',
    'Triumphant', 'Victorious', 'Formidable', 'Relentless', 'Unyielding', 'Gallant', 'Swiftsure', 'Audacious', 'Fearless', 'Glorious', 'Illustrious',
    'Magnificent', 'Majestic', 'Superb', 'Thunderer', 'Vengeance', 'Warden', 'Guardian', 'Avenger', 'Champion', 'Conqueror', 'Crusader', 'Defender',
    'Enforcer', 'Harrier', 'Lancer', 'Protector', 'Ranger', 'Paladin', 'Sovereign']),
  divines: Object.freeze(['Akatosh', 'Arkay', 'Dibella', 'Julianos', 'Kynareth', 'Mara', 'Stendarr', 'Zenithar']),
  favours: Object.freeze(['Wing', 'Shield', 'Mercy', 'Blessing', 'Grace', 'Wisdom', 'Hand', 'Light', 'Truth', 'Breath', 'Gift', 'Promise', 'Justice',
    'Peace', 'Ward', 'Flame', 'Eye', 'Favour', 'Hammer', 'Anvil', 'Lantern', 'Heart']),
  emblems: Object.freeze(['Pride', 'Glory', 'Shield', 'Sword', 'Star', 'Lion', 'Eagle', 'Hawk', 'Rose', 'Lily', 'Crown', 'Heart', 'Hope', 'Rampart', 'Banner',
    'Gryphon', 'Stag', 'Dragon']),
  ports: Object.freeze(['Daggerfall', 'Wayrest', 'Sentinel', 'Camlorn', 'Anticlere', 'Glenpoint', 'Menevia', 'Northmoor', 'Kambria', 'Betony', 'Tulune',
    'Gavaudon', 'Alcaire', 'Lainlyn', 'Daenia', 'Ykalon', 'Dwynnen', 'Urvaius', 'Satakalaam', 'Abibon-Gora', 'Antiphyllos', 'Ayasofya', 'Bergama',
    'Kozanset', 'Myrkwasa', 'Totambu', 'Tigonus', 'Cybiades', 'Bhoriane', 'Phrygias', 'Mournoth', 'Shalgora', 'Ephesus', 'Santaki', 'Pothago',
    'Kairou', 'Koegria', 'Evermor', 'Shornhelm', 'Jehanna', 'Farrun', 'Balfiera', 'Orsinium', 'Glenumbra']),
  callings: Object.freeze(['Trader', 'Merchant', 'Packet', 'Venture', 'Fortune', 'Lass', 'Belle', 'Maid', 'Rose', 'Pride', 'Star', 'Dawn', 'Courier',
    'Carrier', 'Gull', 'Swan', 'Heron', 'Wren', 'Queen', 'Duchess', 'Countess', 'Lady', 'Bride', 'Daughter', 'Promise', 'Bounty']),
  fair: Object.freeze(['Gilded', 'Honest', 'Bountiful', 'Fair', 'Laden', 'Thrifty', 'Prosperous', 'Golden', 'Silver', 'Merry', 'Fortunate', 'Steady',
    'Plump', 'Patient', 'Faithful', 'Wandering', 'Weathered', 'Lucky', 'Bonny', 'Sturdy', 'Swift', 'Gentle', 'Generous', 'Humble', 'Jolly', 'Kindly',
    'Quiet', 'Rosy', 'Sunny', 'Tidy', 'Willing', 'Bright', 'Copper', 'Amber', 'Ivory', 'Velvet', 'Spiced', 'Salted', 'Homeward', 'Outward']),
  wares: Object.freeze(['Cog', 'Scale', 'Purse', 'Ledger', 'Barrel', 'Cask', 'Bale', 'Bushel', 'Coin', 'Septim', 'Ingot', 'Wheel', 'Lantern', 'Compass',
    'Anchor', 'Gull', 'Heron', 'Cormorant', 'Pelican', 'Swan', 'Dove', 'Wren', 'Lark', 'Swallow', 'Goose', 'Otter', 'Seal', 'Mare', 'Bell', 'Hearth',
    'Harvest', 'Vintage', 'Venture', 'Bargain', 'Errand', 'Return', 'Welcome', 'Tidings', 'Penny', 'Fortune']),
  goods: Object.freeze(['Wool', 'Iron', 'Barley', 'Silk', 'Spice', 'Wine', 'Salt', 'Timber', 'Amber', 'Copper', 'Linen', 'Pearl', 'Dyes', 'Glass',
    'Honey', 'Cheese', 'Ale', 'Mead', 'Salmon', 'Olive', 'Pitch', 'Tallow', 'Leather', 'Fur', 'Grain', 'Oats', 'Hops', 'Rum', 'Saffron', 'Cinnamon',
    'Indigo', 'Cotton', 'Marble', 'Silver', 'Tin', 'Cloth', 'Rope', 'Cider', 'Brandy', 'Figs']),
  titles: Object.freeze(['Lady', 'Maid', 'Pride', 'Star', 'Rose', 'Lily', 'Pearl', 'Belle', 'Jewel', 'Daughter', 'Mother', 'Grace', 'Hope', 'Joy',
    'Glory', 'Fortune', 'Promise', 'Spirit', 'Wonder', 'Light', 'Queen', 'Swan', 'Dove', 'Treasure', 'Bounty']),
  dark: Object.freeze(['Black', 'Red', 'Bloody', 'Crimson', 'Grim', 'Cruel', 'Hungry', 'Drowned', 'Rotten', 'Salt', 'Storm', 'Night', 'Dread', 'Mad',
    'Howling', 'Wicked', 'Savage', 'Ragged', 'Rusted', 'Scarlet', 'Ashen', 'Ghostly', 'Cursed', 'Damned', 'Shrieking', 'Laughing', 'Gutted', 'Hanged',
    'Burning', 'Sunken', 'Blind', 'Broken', 'Bitter', 'Shadow', 'Iron', 'Bone', 'Grey', 'Wailing', 'Starving', 'Feral']),
  beasts: Object.freeze(['Kraken', 'Wake', 'Gull', 'Tide', 'Gannet', 'Wraith', 'Hag', 'Reaver', 'Crow', 'Slaughterfish', 'Dreugh', 'Wolf', 'Serpent',
    'Viper', 'Jackal', 'Hound', 'Raven', 'Harpy', 'Banshee', 'Skull', 'Cutlass', 'Blade', 'Hook', 'Fang', 'Claw', 'Maw', 'Grin', 'Noose', 'Gallows',
    'Corsair', 'Reaper', 'Revenant', 'Lamia', 'Spriggan', 'Imp', 'Daedroth', 'Dremora', 'Wereboar', 'Shark', 'Eel', 'Squall', 'Gale', 'Tempest',
    'Rogue', 'Marauder', 'Butcher', 'Widow', 'Orphan', 'Beggar', 'Jester']),
  princes: Object.freeze(['Dagon', 'Hircine', 'Sheogorath', 'Molag Bal', 'Namira', 'Peryite', 'Boethiah', 'Clavicus', 'Malacath', 'Mephala', 'Nocturnal',
    'Sanguine', 'Vaermina', 'Azura', 'Meridia', 'Hermaeus Mora']),
  boons: Object.freeze(['Tooth', 'Grin', 'Maw', 'Kiss', 'Bargain', 'Due', 'Debt', 'Hunger', 'Laughter', 'Whisper', 'Shadow', 'Blade', 'Thorn', 'Wager',
    'Revenge', 'Folly', 'Feast', 'Plague', 'Embrace', 'Gift', 'Jest', 'Bane', 'Claw', 'Curse', 'Dream', 'Eye', 'Hand', 'Mark', 'Price', 'Prize',
    'Rage', 'Ruin', 'Sting', 'Tithe', 'Touch', 'Wrath']),
  heads: Object.freeze(['Widow', 'Throat', 'Gold', 'Soul', 'Bone', 'Skull', 'Heart', 'Hull', 'Blood', 'Gut', 'Neck', 'Coin', 'Wreck', 'Grave', 'Corpse',
    'Purse', 'Spine', 'Rib', 'Tongue', 'Wrist']),
  deeds: Object.freeze(['maker', 'taker', 'breaker', 'cutter', 'eater', 'render', 'splitter', 'drinker', 'reaver', 'grinder', 'biter', 'ripper',
    'snatcher', 'slicer', 'gnawer', 'crusher', 'stealer', 'burner', 'sinker', 'seeker']),
  scourges: Object.freeze(['Scourge', 'Terror', 'Bane', 'Plague', 'Curse', 'Dread', 'Shame', 'Ruin', 'Doom', 'Nightmare', 'Butcher', 'Wolf', 'Reaper',
    'Widowmaker']),
});
export const FISHER_WORDS = Object.freeze({
  catches: Object.freeze(['Herring', 'Mackerel', 'Cod', 'Haddock', 'Pilchard', 'Sprat', 'Eel', 'Crab', 'Lobster', 'Oyster', 'Mussel', 'Skate',
    'Plaice', 'Sole', 'Bream', 'Salmon', 'Shrimp', 'Whelk', 'Cockle', 'Ling', 'Hake', 'Turbot', 'Mullet', 'Gurnard', 'Dogfish', 'Slaughterfish']),
  gear: Object.freeze(['Net', 'Line', 'Creel', 'Hook', 'Float', 'Keel', 'Oar', 'Shoal', 'Catch', 'Haul', 'Morning', 'Evening', 'Tide', 'Trawl']),
});
export function fisherNameOf(r) {
  const W = NAME_WORDS, F = FISHER_WORDS;
  const pick = (words) => words[Math.floor(r() * words.length) % words.length];
  /** @type {[number, () => string][]} */
  const forms = [
    [5, () => `The ${pick(W.fair)} ${pick(F.catches)}`],
    [4, () => `The ${pick(F.catches)} ${pick(W.callings)}`],
    [3, () => `The ${pick(W.ports)} ${pick(F.catches)}`],
    [3, () => `The ${pick(W.fair)} ${pick(F.gear)}`],
  ];
  let x = r() * 15;
  for (const [weight, make] of forms) { if ((x -= weight) < 0) return make(); }
  return forms[forms.length - 1][1]();
}
export function shipNameOf(faction, r, crown = null) {
  const W = NAME_WORDS;
  const pick = (list) => list[Math.floor(r() * list.length) % list.length];
  const the = (n) => `The ${n}`;
  const c = crown ?? CROWNS[0], lore = CROWN_LORE[c.name] ?? CROWN_LORE.Daggerfall;
  /** @type {[number, () => string][]} */
  const forms = faction === 'navy'
    ? [
      [3, () => the(pick(c.ships)).replace(/^The (\S+'s )/, '$1')],
      [5, () => `${pick(lore.royals)}'s ${pick(W.virtues)}`],
      [5, () => the(`${c.name} ${pick(W.martial)}`)],
      [3, () => `${pick(W.divines)}'s ${pick(W.favours)}`],
      [3, () => the(`${pick(W.emblems)} of ${pick(lore.places)}`)],
      [3, () => the(pick(W.martial))],
    ]
    : faction === 'pirate'
      ? [
        [2, () => the(pick(PIRATE_NAMES)).replace(/^The (\S+'s )/, '$1')],
        [6, () => the(`${pick(W.dark)} ${pick(W.beasts)}`)],
        [4, () => `${pick(W.princes)}'s ${pick(W.boons)}`],
        [3, () => { const h = pick(W.heads), d = pick(W.deeds); return the(h.slice(-1).toLowerCase() === d[0] ? `${h}-${d}` : `${h}${d}`); }],
        [3, () => the(`${pick(W.scourges)} of ${pick(W.ports)}`)],
      ]
      : [
        [2, () => the(pick(MERCHANT_NAMES))],
        [5, () => the(`${pick(W.ports)} ${pick(W.callings)}`)],
        [5, () => the(`${pick(W.fair)} ${pick(W.wares)}`)],
        [4, () => the(`${pick(W.ports)} ${pick(W.goods)}`)],
        [4, () => the(`${pick(W.titles)} of ${pick(W.ports)}`)],
      ];
  const total = forms.reduce((sum, [w]) => sum + w, 0);
  let x = r() * total;
  for (const [w, make] of forms) { if ((x -= w) < 0) return make(); }
  return forms[forms.length - 1][1]();
}

export function crownOf(px, py, capitals = null, regionIndex = -1) {
  let best = null, bd = Infinity;
  for (const c of capitals ?? []) {
    const crown = CROWNS.find((k) => k.region === c.region);
    if (!crown || !Number.isFinite(c.x) || !Number.isFinite(c.y)) continue;
    const d = (c.x - px) ** 2 + (c.y - py) ** 2;
    if (d < bd) { bd = d; best = crown; }
  }
  return best ?? CROWNS.find((k) => k.region === regionIndex) ?? CROWNS[0];
}

/**
 * @param {any} shipClass
 * @param {number} seed
 * @param {{ regionIndex?: number, crown?: any }} [where]
 */
export function shipNames(shipClass, seed, { regionIndex = 17, crown: crownIn = null } = {}) {
  const rng = mulberry32((seed ^ 0x5eaf00d) >>> 0);
  // The first draw takes the old name draw's place, so the captain's draws stay as they always were.
  rng();
  const crown = shipClass.faction === 'navy' ? crownIn ?? crownOf(0, 0, null, regionIndex) : null;
  const named = mulberry32(((seed >>> 0) ^ SHIP_NAME_SALT) >>> 0);
  const name = shipClass.fisher ? fisherNameOf(named) : shipNameOf(shipClass.faction, named, crown);
  // The classic name generator draws on the global stream, so it is put back and naming moves no other rolls.
  const saved = getSeed();
  let captain;
  try {
    srand((seed >>> 0) || 1);
    const bank = getNameBankOfRegion(regionIndex >= 0 && regionIndex < REGION_NAMES.length ? regionIndex : 17);
    captain = fullName(bank, rng() < 0.5 ? GENDERS.Male : GENDERS.Female);
  } finally { setSeed(saved); }
  return { name, captain, crown: crown?.name ?? null };
}

export const FLAG_HOME_SHARE = 0.6;
// Flags draw on their own stream, so a ship's names and other draws stay as they were.
export const FLAG_SALT = 0xf1a6;
export function flagOf(shipClass, seed, region = -1) {
  if (!shipClass) return null;
  if (shipClass.faction === 'navy') return crownOf(0, 0, null, region).name;
  if (shipClass.faction !== 'merchant') return null;
  const r = mulberry32(((seed >>> 0) ^ FLAG_SALT) >>> 0);
  const home = CROWNS.find((c) => c.region === region) ?? null;
  if (home && r() < FLAG_HOME_SHARE) return home.name;
  return CROWNS[Math.floor(r() * CROWNS.length) % CROWNS.length].name;
}

export const classLine = (shipClass, crown = null) => (shipClass.faction === 'navy' && crown ? `${crown} ${shipClass.title}` : shipClass.title);
