// @ts-check
// Town decorations for the Witches' Festival, by climate and region, and the Wyrd Sister at a tavern door.

import { FESTIVAL_ARCHIVE, FESTIVAL_ART } from './festivalArt.js';
import { festivalOpen } from '../net/festivalLaw.js';
import { CLIMATES, REGION_RACES } from '../formats/mapsTables.js';
import { isResidence } from './buildingNames.js';
import { homeCandidate } from '../homes/onlineHomes.js';
import { doorFace } from '../worldEvents/siegeField.js';
import { RMB_SIDE } from './locationLayout.js';
import { tileWeight } from './cityNavigation.js';

export const WYRD_SISTER_FLAT = Object.freeze({ archive: 179, record: 2 });

const piece = (/** @type {number} */ archive, /** @type {number} */ record, r = 0.35) => Object.freeze({ archive, record, r });
const TURNIP = piece(FESTIVAL_ARCHIVE, FESTIVAL_ART.turnip, 0.3);
const EFFIGY = piece(FESTIVAL_ARCHIVE, FESTIVAL_ART.effigy, 0.45);
const WARD_STAFF = piece(FESTIVAL_ARCHIVE, FESTIVAL_ART.wardStaff, 0.3);
const BOWL_OF_FIRE = piece(210, 0, 0.55);
const BONFIRE = piece(210, 1, 0.65);
const SKULL_CANDLE = piece(210, 2, 0.25);
const POLE_TORCH = piece(210, 20, 0.25);
const STANDING_CANDLE = piece(210, 21, 0.25);
const HORNED_SKULL = piece(100, 9, 0.55);
const SKULL_PILE = piece(100, 17, 0.75);
const RIBCAGE = piece(100, 18, 0.7);
const WHITE_SKULL = piece(100, 23, 0.2);
const SKULL_STAKE = piece(100, 24, 0.3);
const at = (/** @type {any} */ p, /** @type {number} */ along, /** @type {number} */ out) => Object.freeze({ ...p, along, out });

export const WITCH_KITS = Object.freeze({
  breton: Object.freeze({
    door: TURNIP, temple: STANDING_CANDLE,
    show: Object.freeze([at(EFFIGY, 0, 0), at(TURNIP, 0.8, 0.5), at(TURNIP, -0.8, 0.5)]),
    step: Object.freeze([[TURNIP, 0.32], [SKULL_CANDLE, 0.08]]),
  }),
  redguard: Object.freeze({
    door: STANDING_CANDLE, temple: POLE_TORCH,
    show: Object.freeze([at(BOWL_OF_FIRE, 0, 0), at(SKULL_CANDLE, 0.9, 0.4), at(SKULL_CANDLE, -0.9, 0.4)]),
    step: Object.freeze([[STANDING_CANDLE, 0.3]]),
  }),
  highland: Object.freeze({
    door: POLE_TORCH, temple: POLE_TORCH,
    show: Object.freeze([at(BONFIRE, 0, 0.3), at(EFFIGY, 1.2, -0.1), at(HORNED_SKULL, -1.3, 0.1)]),
    step: Object.freeze([[SKULL_STAKE, 0.28], [TURNIP, 0.1]]),
  }),
  fen: Object.freeze({
    door: WARD_STAFF, temple: STANDING_CANDLE,
    show: Object.freeze([at(BOWL_OF_FIRE, 0, 0), at(WARD_STAFF, 1.0, 0), at(WARD_STAFF, -1.0, 0)]),
    step: Object.freeze([[WARD_STAFF, 0.3], [SKULL_CANDLE, 0.08]]),
  }),
  haunted: Object.freeze({
    door: SKULL_CANDLE, temple: STANDING_CANDLE,
    show: Object.freeze([at(EFFIGY, 0, 0), at(SKULL_PILE, 1.3, 0.4), at(SKULL_STAKE, -1.0, 0)]),
    step: Object.freeze([[TURNIP, 0.3], [WHITE_SKULL, 0.15], [RIBCAGE, 0.08]]),
  }),
});

export function witchCulture(/** @type {number|null|undefined} */ climateIndex, /** @type {number|null|undefined} */ region) {
  if (climateIndex === CLIMATES.HauntedWoodlands) return 'haunted';
  if (climateIndex === CLIMATES.Mountain || climateIndex === CLIMATES.MountainWoods) return 'highland';
  if (climateIndex === CLIMATES.Swamp) return 'fen';
  if (REGION_RACES[region ?? -1] === 1 || climateIndex === CLIMATES.Desert || climateIndex === CLIMATES.Desert2) return 'redguard';
  if (climateIndex === CLIMATES.Rainforest || climateIndex === CLIMATES.Subtropical) return 'fen';
  return 'breton';
}

export const WITCH_SPOTS = Object.freeze({
  pairAlong: 0.45, pairOut: 0.5, sisterAlong: 1.3, sisterOut: 1.6, showAlong: 2.6, showOut: 1.7, stepAlong: 0.45, stepOut: 0.45,
  offeringAlong: 0.55, offeringOut: 0.55, offeringFarOut: 1.4, offeringR: 0.5,
  rayFrom: 0.35, rayHeights: Object.freeze([0.5, 1.2]), downFrom: 1.2, lip: 0.08, clear: 0.35, near: 0.1,
});

const TAKEN_R = 0.3;
const SISTER_R = 0.5;
const GRID_M = 4;

function seeded(/** @type {number[]} */ ...ns) {
  let h = 0x811c9dc5;
  for (const n of ns) { h ^= n >>> 0; h = Math.imul(h, 0x01000193); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; }
  return (h >>> 0) / 4294967296;
}

export const witchStepSide = (/** @type {number} */ mapId, /** @type {number} */ key) => (seeded(mapId, key, 3) < 0.5 ? -1 : 1);

export function offeringSpot(/** @type {any} */ frame, /** @type {number} */ mapId, /** @type {number} */ key, far = false) {
  const front = doorFront(frame);
  if (!front) return null;
  const side = witchStepSide(mapId, key) * (far ? 1 : -1);
  return front.spot(side * (front.half + WITCH_SPOTS.offeringAlong), far ? WITCH_SPOTS.offeringFarOut : WITCH_SPOTS.offeringOut);
}

/** @param {any} frame */
export function doorFront(frame) {
  const f = doorFace(frame);
  if (!f) return null;
  const d = frame.door;
  const half = Math.hypot(d.b[0] - d.a[0], d.b[2] - d.a[2]) / 2;
  const out = [f.out[0] + 0, f.out[1] + 0], along = [0 - out[1], out[0] + 0];
  return { c: f.at, foot: Math.min(d.a[1], d.b[1]), out, along, half, spot: (/** @type {number} */ s, /** @type {number} */ o) => [f.at[0] + along[0] * s + out[0] * o, f.at[1] + along[1] * s + out[1] * o] };
}

/**
 * @param {{ raycast: (o: number[], d: number[], l: number) => number }} collider
 * @param {{ pixelTranslation: (x: number, y: number, out?: number[]) => ArrayLike<number> }} state
 * @param {number} px
 * @param {number} py
 */
export function colliderBlocked(collider, state, px, py) {
  const t = [0, 0, 0];
  return (/** @type {number[]} */ a, /** @type {number[]} */ b) => {
    state.pixelTranslation(px, py, t);
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(d[0], d[1], d[2]);
    return l > 1e-6 && collider.raycast([a[0] + t[0], a[1] + t[1], a[2] + t[2]], [d[0] / l, d[1] / l, d[2] / l], l) < l;
  };
}

const TILE_M = RMB_SIDE / 16;
/**
 * @param {any[]} blocks
 * @param {ArrayLike<number>} origin
 */
export function dryGround(blocks, origin) {
  const at = new Map((blocks ?? []).map((b) => [`${b.x},${b.y}`, b]));
  return (/** @type {number} */ x, /** @type {number} */ z) => {
    const lx = x - origin[0], lz = z - origin[2];
    const bx = Math.floor(lx / RMB_SIDE), by = Math.floor(lz / RMB_SIDE);
    const tiles = at.get(`${bx},${by}`)?.dfBlock?.rmbBlock?.fldHeader?.groundData?.groundTiles;
    if (!tiles) return false;
    const tx = Math.floor((lx - bx * RMB_SIDE) / TILE_M), ty = 15 - Math.floor((lz - by * RMB_SIDE) / TILE_M);
    return tileWeight((tiles[tx]?.[ty]?.textureRecord ?? 0) & 0x3f) !== 0;
  };
}

/** @param {DressedTown} town */
export function witchesDressing(town) {
  const steps = dressTown(town);
  let r = steps.next();
  while (!r.done) r = steps.next();
  return r.value;
}
export async function witchesDressingBreathing(/** @type {DressedTown} */ town, /** @type {() => Promise<unknown>} */ breathe) {
  const steps = dressTown(town);
  let r = steps.next();
  while (!r.done) { await breathe(); r = steps.next(); }
  return r.value;
}
/**
 * @typedef {{ frames: Map<number, any>|null, taverns?: number[], temples?: number[], mapId?: number, climateIndex?: number|null,
 *   region?: number|null, floorY?: number, nowMs?: number, blocked?: (a: number[], b: number[]) => boolean,
 *   ground?: (x: number, z: number) => boolean, taken?: Iterable<ArrayLike<number>> }} DressedTown
 */
function* dressTown(/** @type {DressedTown} */ { frames, taverns = [], temples = [], mapId = 0, climateIndex = null, region = null, floorY = 0, nowMs = Date.now(), blocked = () => false, ground = () => true, taken = [] }) {
  if (!frames?.size || !festivalOpen(nowMs)) return null;
  const kit = WITCH_KITS[witchCulture(climateIndex, region)];
  const S = WITCH_SPOTS;
  /** @type {Map<string, number[][]>} */
  const grid = new Map();
  const cell = (/** @type {number} */ x, /** @type {number} */ z) => `${Math.floor(x / GRID_M)},${Math.floor(z / GRID_M)}`;
  const file = (/** @type {number} */ x, /** @type {number} */ z, /** @type {number} */ r, /** @type {number} */ room = S.near) => {
    const k = cell(x, z);
    let list = grid.get(k);
    if (!list) grid.set(k, (list = []));
    list.push([x, z, r, room]);
  };
  for (const p of taken) if (p && Number.isFinite(p[0]) && Number.isFinite(p[2])) file(p[0], p[2], TAKEN_R, S.clear);
  const flats = [], sisters = [];
  const clear = (/** @type {any} */ front, /** @type {number[]} */ xz, /** @type {number} */ r) => {
    if (!ground(xz[0], xz[1])) return false;
    const gx = Math.floor(xz[0] / GRID_M), gz = Math.floor(xz[1] / GRID_M);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const [x, z, q, room] of grid.get(`${gx + i},${gz + j}`) ?? []) if (Math.hypot(xz[0] - x, xz[1] - z) < r + q + room) return false;
      }
    }
    const from = front.spot(0, S.rayFrom), fromY = Math.max(floorY, Number.isFinite(front.foot) ? front.foot : floorY);
    const dx = xz[0] - from[0], dz = xz[1] - from[1], l = Math.hypot(dx, dz) || 1;
    for (const h of S.rayHeights) if (blocked([from[0], fromY + h, from[1]], [xz[0] + (dx / l) * r, floorY + h, xz[1] + (dz / l) * r])) return false;
    const tx = front.c[0] - xz[0], tz = front.c[1] - xz[1], tl = Math.hypot(tx, tz) || 1;
    for (const [x, z] of [xz, [xz[0] + (tx / tl) * r, xz[1] + (tz / tl) * r]]) if (blocked([x, floorY + S.downFrom, z], [x, floorY + S.lip, z])) return false;
    return true;
  };
  const stand = (/** @type {any} */ front, /** @type {any} */ p, /** @type {number} */ s, /** @type {number} */ o) => {
    const xz = front.spot(s, o);
    if (!clear(front, xz, p.r)) return false;
    file(xz[0], xz[1], p.r);
    flats.push({ archive: p.archive, record: p.record, c: [xz[0], floorY, xz[1]] });
    return true;
  };
  const pair = (/** @type {any} */ front, /** @type {any} */ p) => { for (const s of [-1, 1]) stand(front, p, s * (front.half + S.pairAlong), S.pairOut); };
  for (const key of taverns) {
    const front = doorFront(frames.get(key));
    if (!front) continue;
    pair(front, kit.door);
    const first = seeded(mapId, key, 1) < 0.5 ? -1 : 1;
    let side = 0;
    for (const s of [first, -first]) {
      const xz = front.spot(s * (front.half + S.sisterAlong), S.sisterOut);
      if (!clear(front, xz, SISTER_R)) continue;
      file(xz[0], xz[1], SISTER_R);
      sisters.push({
        archive: WYRD_SISTER_FLAT.archive, record: WYRD_SISTER_FLAT.record, x: xz[0], y: floorY, z: xz[1],
        factionID: 0, flags: 0, rawX: 0, rawY: 0, rawZ: 0, recordPosition: key, witch: Object.freeze({ key }),
      });
      side = s;
      break;
    }
    for (const s of side ? [-side] : [first, -first]) {
      const base = s * (front.half + S.showAlong);
      let any = false;
      for (const p of kit.show) any = stand(front, p, base + s * p.along, S.showOut + p.out) || any;
      if (any) break;
    }
    yield;
  }
  for (const key of temples) {
    const front = doorFront(frames.get(key));
    if (front) pair(front, kit.temple);
    yield;
  }
  /** @type {Map<number, number[]>} */
  const homes = new Map();
  for (const [key, f] of frames) {
    if (!homeCandidate({ buildingType: f?.type, factionId: f?.faction ?? 0, buildingKey: key })) continue;
    const front = doorFront(f);
    for (const far of front ? [false, true] : []) {
      const xz = offeringSpot(f, mapId, key, far);
      if (!xz || !clear(front, xz, S.offeringR)) continue;
      file(xz[0], xz[1], S.offeringR);
      homes.set(key, [xz[0], floorY, xz[1]]);
      break;
    }
    yield;
  }
  for (const [key, f] of frames) {
    if (!isResidence(f?.type)) continue;
    const roll = seeded(mapId, key, 2);
    let edge = 0;
    const p = kit.step.find((pick) => roll < (edge += /** @type {number} */ (pick[1])))?.[0];
    const front = p ? doorFront(f) : null;
    if (front) { stand(front, p, witchStepSide(mapId, key) * (front.half + S.stepAlong), S.stepOut); yield; }
  }
  return { flats, sisters, homes };
}
