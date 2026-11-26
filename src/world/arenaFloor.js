// @ts-check
// An RMB misc model sits at (X, -Y - 4, Z + 4096) x GLOBAL_SCALE and a dungeon model at (x, -y, z) x GLOBAL_SCALE.
// The made block therefore shifts every piece by y + 4 and z + 4096.

import ARENA_BLOCK_JSON from '../../vendor/daggerfall-arena/Arena/ARENADAG.RMB.json' with { type: 'json' };
import { ARENA_MODEL_ID } from './arenaModel.js';
import { GLOBAL_SCALE } from './meshReader.js';

export const ARENA_FLOOR_BLOCK = 'ARENAFLR.RDB';
export const ARENA_FLOOR_BLOCK_INDEX = 900101;
export const ARENA_FLOOR_LOCATION_ID = 0x7ffff100;
const RMB_SIDE = 4096;
const PROPS_Y = -4, FLATS_Y = -6;
const GROUND_Y = -1;
export const SAND_Y_MODEL = -4.68;
export const SAND_R = 19.2;
export const RING_R = 14;
export const TERRACE_UP = 6.9;
export const SEAT_UP_MIN = 5;
export const SEAT_UP_MAX = 14.5;
export const SEAT_R_MIN = 20.6;
export const SEAT_R_MAX = 37;
// An RDB flat is placed by its center and an RMB flat by its base, so each moved flat rises by its half height.
const FLAT_HALF_H = Object.freeze({ '210:15': 0.95, '210:17': 0.62, '210:19': 1.17, '210:27': 0.48 });
const FLAT_LIGHT_R = Object.freeze({ '210:15': 160, '210:17': 150, '210:19': 260, '210:27': 170 });

export const KAMER_BANNERS = Object.freeze([42512, 42513, 42514]);
export const ARENA_BANNER_MODEL = Object.freeze({ red: 42557, blue: 42558 });
export const HANG_HALF_M = 6;

const colosseumRecord = (block = ARENA_BLOCK_JSON) => block.RmbBlock.Misc3dObjectRecords.find((o) => Number(o.ModelIdNum) === ARENA_MODEL_ID);
export function floorCentre(block = ARENA_BLOCK_JSON) {
  const c = colosseumRecord(block);
  return Object.freeze([c.XPos * GLOBAL_SCALE, (-c.YPos + PROPS_Y) * GLOBAL_SCALE + SAND_Y_MODEL, (c.ZPos + RMB_SIDE) * GLOBAL_SCALE]);
}
export const cityFloorCentre = floorCentre;
export const CITY_GROUND_UP = GROUND_Y * GLOBAL_SCALE - floorCentre()[1];
export const GATE_MOUTH = Object.freeze({ x0: -2.8, x1: 3.66, z: 51.94 });
export const ARENA_GROUND_MODEL = 864103;
export const ARENA_GROUND_ARCHIVE = 302;

export const floorPoint = (x, z, up = 0, c = floorCentre()) => [c[0] + x, c[1] + up, c[2] + z];

export const arenaRing = (c = floorCentre()) => ({ centre: [c[0], c[1], c[2]], radius: RING_R });

export const ARRIVE = Object.freeze({
  ladder: Object.freeze({ at: Object.freeze([-6, 0, 0]), yaw: Math.PI / 2 }),
  rival: Object.freeze({ at: Object.freeze([6, 0, 0]), yaw: -Math.PI / 2 }),
  watch: Object.freeze({ at: Object.freeze([0, -21.8, TERRACE_UP]), yaw: 0 }),
});
export const WAYS_OUT = Object.freeze([
  Object.freeze({ at: Object.freeze([0, 18.6, 0]), normal: Object.freeze([0, 0, -1]) }),
  Object.freeze({ at: Object.freeze([0, -23.4, TERRACE_UP]), normal: Object.freeze([0, 0, 1]) }),
  Object.freeze({ at: Object.freeze([(GATE_MOUTH.x0 + GATE_MOUTH.x1) / 2, GATE_MOUTH.z - 0.5, CITY_GROUND_UP]), normal: Object.freeze([0, 0, -1]) }),
]);
export const ARENA_EXIT_W = 3.2;
export const ARENA_EXIT_H = 3.6;

/**
 * The map table row carries map id 0 so no world room keys off it; bout rooms use `arena:<id>`.
 * @param {{ kind?: string, city?: any, bout?: string|null }} o
 */
export function arenaFloorLocation({ kind = 'ladder', city = null, bout = null } = {}) {
  return {
    name: 'The Arena of Daggerfall', regionIndex: city?.regionIndex ?? 17, regionName: city?.regionName ?? 'Daggerfall', locationIndex: -1, hasDungeon: true,
    climate: { worldClimate: city?.climate?.worldClimate ?? 227, climateType: city?.climate?.climateType ?? 2 },
    mapTableData: { mapId: 0, locationType: -1, dungeonType: 0, longitude: 0, latitude: 0 },
    exterior: { exteriorData: { locationId: ARENA_FLOOR_LOCATION_ID } },
    dungeon: {
      recordElement: { header: { locationId: ARENA_FLOOR_LOCATION_ID, unknown: 0 } },
      blocks: [{ x: 0, z: 0, blockName: ARENA_FLOOR_BLOCK, isStartingBlock: true, blockIndex: 0, blockNumber: 0, blockNumberStartIndexBitfield: 0 }],
    },
    arenaFloor: kind,
    ...(bout ? { arenaBout: bout } : {}),
  };
}
export const isArenaFloor = (loc) => typeof loc?.arenaFloor === 'string' && loc?.dungeon?.recordElement?.header?.locationId === ARENA_FLOOR_LOCATION_ID;

const action0 = () => ({ flags: 0, nextObjectOffset: -1, previousObjectOffset: -1, axis: 0, duration: 0, magnitude: 0 });
const NO_MODEL = { xRotation: 0, yRotation: 0, zRotation: 0, modelIndex: 0, triggerFlagStartingLock: 0, soundIndex: 0, actionOffset: 0 };
const NO_FLAT = { position: 0, textureBitfield: 0, textureArchive: 0, textureRecord: 0, flags: 0, magnitude: 0, soundIndex: 0, factionOrMobileId: 0, nextObjectOffset: -1, action: 0 };
const res = (o = {}) => ({ modelResource: { ...NO_MODEL, actionResource: action0() }, flatResource: { ...NO_FLAT }, lightResource: { unknown1: 0, unknown2: 0, radius: 0 }, ...o });

export function hangingModel(o, banners, block = ARENA_BLOCK_JSON) {
  const id = Number(o.ModelIdNum);
  if (!banners || !KAMER_BANNERS.includes(id)) return id;
  const dx = (o.XPos - colosseumRecord(block).XPos) * GLOBAL_SCALE;
  const b = dx <= -HANG_HALF_M ? banners.west : dx >= HANG_HALF_M ? banners.east : null;
  return b === 'red' || b === 'blue' ? ARENA_BANNER_MODEL[b] : id;
}

export function arenaFloorBlock(kind = 'ladder', block = ARENA_BLOCK_JSON, banners = null) {
  const rmb = block.RmbBlock;
  /** @type {any[]} */
  const modelReferenceList = [];
  const refOf = new Map();
  const objects = [];
  let pos = 1;
  for (const o of rmb.Misc3dObjectRecords) {
    const id = hangingModel(o, banners, block);
    if (id === 43600) continue;
    if (!refOf.has(id)) { refOf.set(id, modelReferenceList.length); modelReferenceList.push({ modelId: String(id), modelIdNum: id, description: 'ARN' }); }
    objects.push({
      type: 0x01, position: pos++, index: objects.length, xPos: o.XPos, yPos: o.YPos - PROPS_Y, zPos: o.ZPos + RMB_SIDE,
      resources: res({ modelResource: { ...NO_MODEL, xRotation: o.XRotation | 0, yRotation: o.YRotation | 0, zRotation: o.ZRotation | 0, modelIndex: refOf.get(id), actionResource: action0() } }),
    });
  }
  for (const f of rmb.MiscFlatObjectRecords) {
    const key = `${f.TextureArchive}:${f.TextureRecord}`;
    if (f.TextureArchive !== 210) continue;
    const half = FLAT_HALF_H[key] ?? 0.6;
    const base = (-f.YPos + FLATS_Y) * GLOBAL_SCALE, centre = base + half;
    const yPos = Math.round(-centre / GLOBAL_SCALE);
    objects.push({
      type: 0x03, position: pos++, index: objects.length, xPos: f.XPos, yPos, zPos: f.ZPos + RMB_SIDE,
      resources: res({ flatResource: { ...NO_FLAT, textureArchive: 210, textureRecord: f.TextureRecord } }),
    });
    objects.push({
      type: 0x02, position: pos++, index: objects.length, xPos: f.XPos, yPos: yPos - 20, zPos: f.ZPos + RMB_SIDE,
      resources: res({ lightResource: { unknown1: 0, unknown2: 0, radius: FLAT_LIGHT_R[key] ?? 160 } }),
    });
  }
  // The start marker is editor flat 199.10; soundIndex 0 means no water and magnitude 0 means no castle.
  const arrive = ARRIVE[kind] ?? ARRIVE.ladder;
  const [mx, my, mz] = floorPoint(arrive.at[0], arrive.at[1], arrive.at[2] + 0.4, floorCentre(block));
  objects.push({
    type: 0x03, position: pos++, index: objects.length, xPos: Math.round(mx / GLOBAL_SCALE), yPos: Math.round(-my / GLOBAL_SCALE), zPos: Math.round(mz / GLOBAL_SCALE),
    resources: res({ flatResource: { ...NO_FLAT, textureArchive: 199, textureRecord: 10 } }),
  });
  // The ground goes last so no earlier record's position or index shifts.
  modelReferenceList.push({ modelId: String(ARENA_GROUND_MODEL), modelIdNum: ARENA_GROUND_MODEL, description: 'ARN' });
  objects.push({
    type: 0x01, position: pos++, index: objects.length, xPos: 0, yPos: -GROUND_Y, zPos: 0,
    resources: res({ modelResource: { ...NO_MODEL, modelIndex: modelReferenceList.length - 1, actionResource: action0() } }),
  });
  return { name: ARENA_FLOOR_BLOCK, position: 0, rdbBlock: { modelReferenceList, objectRootList: [{ rdbObjects: objects }] } };
}

/**
 * The made level has no terrain, so this ground is its only floor outside the colosseum mesh. Tile (x, y) north of
 * the south edge is `tiles[(15 - y) * 16 + x]`.
 * @param {Array<{ TextureRecord: number, IsRotated?: boolean, IsFlipped?: boolean }>} tiles
 */
export function arenaGroundModel(tiles, c = floorCentre()) {
  const S = RMB_SIDE * GLOBAL_SCALE, T = S / 16;
  const pos = [], nor = [], uv = [];
  /** @type {Map<number, number[]>} */
  const byRecord = new Map();
  for (let ty = 0; ty < 16; ty++) for (let tx = 0; tx < 16; tx++) {
    const tile = tiles[(15 - ty) * 16 + tx];
    const lay = (tile.IsRotated ? 1 : 0) + (tile.IsFlipped ? 2 : 0);
    const base = pos.length / 3;
    for (const [s, t] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const [u, v] = LAY[lay](s, t);
      pos.push((tx + s) * T, 0, (ty + t) * T); nor.push(0, 1, 0); uv.push(u, v - 1);
    }
    if (!byRecord.has(tile.TextureRecord)) byRecord.set(tile.TextureRecord, []);
    // Wound so cross(b - a, c - a) points up, the front face.
    byRecord.get(tile.TextureRecord)?.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  const idx = [], subMeshes = [];
  for (const [record, list] of byRecord) { subMeshes.push({ textureArchive: ARENA_GROUND_ARCHIVE, textureRecord: record, startIndex: idx.length, primitiveCount: list.length / 3 }); idx.push(...list); }
  const colliderOnlyFrom = idx.length;
  const wall = (a, b, h) => {
    const base = pos.length / 3;
    for (const [x, z, y] of [[a[0], a[1], -1], [b[0], b[1], -1], [b[0], b[1], h], [a[0], a[1], h]]) { pos.push(x, y, z); nor.push(0, 1, 0); uv.push(0, 0); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  wall([c[0] + GATE_MOUTH.x0 - 3, c[2] + GATE_MOUTH.z], [c[0] + GATE_MOUTH.x1 + 3, c[2] + GATE_MOUTH.z], 12);
  wall([0, 0], [S, 0], 40); wall([S, 0], [S, S], 40); wall([S, S], [0, S], 40); wall([0, S], [0, 0], 40);
  return { positions: Float32Array.from(pos), normals: Float32Array.from(nor), uvs: Float32Array.from(uv), indices: Uint32Array.from(idx), subMeshes, doors: [], colliderOnlyFrom };
}
// Must match the terrain shader's ROT and TRANS tables in render/renderer.js, indexed by rotated + 2 x flipped.
const LAY = Object.freeze([(s, t) => [s, t], (s, t) => [t, 1 - s], (s, t) => [1 - s, 1 - t], (s, t) => [1 - t, s]]);

export function arenaFloorBlocks(real, kind = 'ladder', banners = null) {
  const made = arenaFloorBlock(kind, ARENA_BLOCK_JSON, banners);
  return {
    getBlockIndex: (name) => (name === ARENA_FLOOR_BLOCK ? ARENA_FLOOR_BLOCK_INDEX : real ? real.getBlockIndex(name) : -1),
    getBlock: (i) => (i === ARENA_FLOOR_BLOCK_INDEX ? made : real ? real.getBlock(i) : null),
  };
}

export function arenaExitDoors(c = floorCentre()) {
  return WAYS_OUT.map((w) => {
    const [x, y, z] = floorPoint(w.at[0], w.at[1], w.at[2], c);
    return {
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1],
      centre: { x: 0, y: ARENA_EXIT_H / 2, z: 0 }, size: { x: ARENA_EXIT_W, y: ARENA_EXIT_H, z: 1 },
      normal: { x: w.normal[0], y: w.normal[1], z: w.normal[2] },
      arena: true,
    };
  });
}

/** @param {(x: number, z: number) => number|null} heightAt */
export function crowdSeats(heightAt, { step = 1.15 } = {}) {
  const out = [];
  for (let r = SEAT_R_MIN; r <= SEAT_R_MAX; r += step) {
    const n = Math.max(8, Math.floor((2 * Math.PI * r) / step));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (r * 0.37);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = heightAt(x, z);
      if (!Number.isFinite(h)) continue;
      if (h < SEAT_UP_MIN || h > SEAT_UP_MAX) continue;
      if (!seatFooting(heightAt, x, z, a, /** @type {number} */ (h))) continue;
      const best = Math.abs(Math.sin(a)) > 0.86 && r < SEAT_R_MIN + 6;
      out.push({ x, y: /** @type {number} */ (h), z, best });
    }
  }
  return out;
}
export const SEAT_FOOT_M = 0.35;
export const SEAT_LEVEL_M = 0.15;
function seatFooting(heightAt, x, z, a, h) {
  const c = Math.cos(a) * SEAT_FOOT_M, s = Math.sin(a) * SEAT_FOOT_M;
  for (const [dx, dz] of [[c, s], [-c, -s], [-s, c], [s, -c]]) {
    const g = heightAt(x + dx, z + dz);
    if (!Number.isFinite(g) || Math.abs(/** @type {number} */ (g) - h) > SEAT_LEVEL_M) return false;
  }
  return true;
}
export function pickSeats(seats, n, rng) {
  const a = seats.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, Math.max(0, Math.min(a.length, n | 0)));
}

export const STANDS_RAIL_UP = 2;
export function standsRail(centre, feetY, free = false) {
  if (free || !centre || !(feetY > centre[1] + STANDS_RAIL_UP)) return null;
  return {
    centre, radius: SAND_R,
    clamp: (pos, rad = 0) => {
      const dx = pos[0] - centre[0], dz = pos[2] - centre[2];
      const d = Math.hypot(dx, dz), R = SAND_R + rad;
      if (d >= R) return null;
      return d > 1e-6 ? [centre[0] + (dx / d) * R, centre[2] + (dz / d) * R] : [centre[0], centre[2] - R];
    },
  };
}
