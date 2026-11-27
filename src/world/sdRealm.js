// @ts-check
// Builds the Shattered Hour realm: made location, empty block, island floors, colliders, lamps, and edge clamp.
// The frame is net/sdBrain.js: meters, every floor top at y 0, laid along +z.
import { SD_REALM_ORIGIN, SD_THRESHOLD, SD_WALK, SD_ORRERY, SD_ARENA, SD_PILLAR_R, SD_PILLAR_W, SD_PILLAR_H, realmToDungeon } from '../net/sdBrain.js';
import { faces } from './gateModel.js';
import { SD_HALL_GLOW_RECORD } from './sdHallArt.js';
import { pillarVisual } from './sdPillarModel.js';
import { lightList, lightListView, packLight, copyLights } from '../render/lightId.js';

export const SD_REALM_ARCHIVE = 38151;
export const SD_REALM_FLOOR_RECORD = 0;
export const SD_REALM_BRASS_RECORD = 1;
export const SD_REALM_ROOT_RECORD = 2;
export const SD_REALM_DIAL_RECORD = 3;
export const SD_REALM_ARENA_RECORD = 4;
export const SD_REALM_COBBLE_RECORD = 31;
export const SD_REALM_EDGE_RECORD = 32;
export const SD_REALM_PILLAR_RECORD = 56;
export const SD_REALM_BLOCK = 'SDHOUR.RDB';
export const SD_REALM_BLOCK_INDEX = 900200;
export const SD_REALM_LOCATION_ID = 0x7ffff200;
const UNITS_PER_M = 40;
export const SD_ARRIVE_Z = 1;
export const SD_WAY_BACK_Z = -5;
export const SD_WAY_BACK_SIZE = 5;
export const SD_THRESHOLD_RIM = Object.freeze({
  ray(o, d) {
    const c = realmToDungeon(SD_THRESHOLD.x, 0, SD_THRESHOLD.z), ox = o[0] - c[0], oz = o[2] - c[2], b = ox * d[0] + oz * d[2];
    const q = b * b - (ox * ox + oz * oz - SD_THRESHOLD.r * SD_THRESHOLD.r);
    return q < 0 ? 0 : Math.min(1.6 * SD_WAY_BACK_SIZE, Math.max(0, -b + Math.sqrt(q)));
  },
});
export const SD_ISLAND_SIDES = 48;
export const SD_ROOT_DEPTH = 22;
export const SD_LIP = 0.5;
export const SD_RIM_W = 0.35;
export const SD_RIM_H = 0.12;
export const SD_FLOOR_TILE_M = 2;
export const SD_TOOTH_PITCH = 1.2;
export const SD_TOOTH_OUT = 0.22;
export const SD_TOOTH_W = 0.42;
export const SD_TOOTH_FOOT = -0.42;
export const SD_TOOTH_TOP = SD_RIM_H - 0.05;
export const SD_EDGE_LINE = 0.03;
export const SD_INLAY_H = 0.012;
export const SD_COMPASS = Object.freeze({ north: 2.4, cardinal: 1.5, diagonal: 0.95, ring: 0.85 });
export const SD_TIE_EVERY = 3;
export const SD_ARENA_BANDS = 8;
export const SD_KERB_W = 0.25;
export const SD_KERB_H = 0.15;
export const SD_REALM_FOG = Object.freeze({ mode: 'exp', density: 0.0045, color: Object.freeze([0.2, 0.15, 0.07]) });
export const SD_LAMP_COLOR = Object.freeze([1.0, 0.78, 0.4]);
export const SD_LAMP_RANGE = 12;
export const SD_LAMP_H = 2.4;
export const SD_LAMPS = Object.freeze({ threshold: 4, orrery: 8, arena: 8 });
export const SD_LAMP_POST_W = 0.05;
export const SD_LAMP_HEAD = 0.09;
export const SD_REALM_TEXT = Object.freeze({
  wayBack: 'To the Abyss Dungeon',
  noRest: 'You cannot rest in the Shattered Hour.',
  noSave: 'You cannot save in the Shattered Hour.',
  noMap: 'You cannot map the Shattered Hour.',
  noMark: 'You cannot set a Mark in the Shattered Hour.',
  noRecall: 'Nothing answers a Recall in the Shattered Hour.',
  lost: 'The way to the Shattered Hour is lost.',
  died: 'The Shattered Hour casts you out for good. You wake before the Abyss Dungeon\'s door.',
  noCompanions: 'Your companions cannot follow you through the Rift.',
});
export const SD_REALM_FLOORS = Object.freeze([
  Object.freeze({ kind: 'disc', ...SD_THRESHOLD }),
  Object.freeze({ kind: 'band', ...SD_WALK }),
  Object.freeze({ kind: 'disc', ...SD_ORRERY }),
]);

/** @param {{ s: number, hollow?: { key: string, px: number, py: number, name: string } | null, regionIndex?: number, regionName?: string, climate?: { worldClimate: number, climateType: number } }} o */
export function sdRealmLocation({ s, hollow = null, regionIndex = -1, regionName = '', climate = { worldClimate: 231, climateType: 2 } }) {
  return {
    name: 'The Shattered Hour', regionIndex, regionName, locationIndex: -1, hasDungeon: true,
    climate: { worldClimate: climate.worldClimate, climateType: climate.climateType },
    mapTableData: { mapId: 0, locationType: -1, dungeonType: 0, longitude: 0, latitude: 0 },
    exterior: { exteriorData: { locationId: SD_REALM_LOCATION_ID } },
    dungeon: {
      recordElement: { header: { locationId: SD_REALM_LOCATION_ID, unknown: 0 } },
      blocks: [{ x: 0, z: 0, blockName: SD_REALM_BLOCK, isStartingBlock: true, blockIndex: 0, blockNumber: 0, blockNumberStartIndexBitfield: 0 }],
    },
    sdRealm: s, sdHollow: hollow ? { key: hollow.key, px: hollow.px, py: hollow.py, name: hollow.name } : null,
  };
}

export const isSdRealm = (loc) => Number.isSafeInteger(loc?.sdRealm) && loc?.dungeon?.recordElement?.header?.locationId === SD_REALM_LOCATION_ID;

export function sdRealmBlock() {
  const [x, , z] = realmToDungeon(0, 0, SD_ARRIVE_Z);
  const marker = {
    type: 0x03, position: 1, index: 0,
    xPos: Math.round(x * UNITS_PER_M), yPos: 0, zPos: Math.round(z * UNITS_PER_M),
    resources: { flatResource: { textureArchive: 199, textureRecord: 10, flags: 0, magnitude: 0, soundIndex: 0, factionOrMobileId: 0, nextObjectOffset: -1, action: 0, position: 0 } },
  };
  return { name: SD_REALM_BLOCK, position: 0, rdbBlock: { modelReferenceList: [], objectRootList: [{ rdbObjects: [marker] }] } };
}

export function sdRealmBlocks(real) {
  const block = sdRealmBlock();
  return {
    getBlockIndex: (name) => (name === SD_REALM_BLOCK ? SD_REALM_BLOCK_INDEX : real ? real.getBlockIndex(name) : -1),
    getBlock: (i) => (i === SD_REALM_BLOCK_INDEX ? block : real ? real.getBlock(i) : null),
  };
}

const tileUv = (x, z) => [x / SD_FLOOR_TILE_M, z / SD_FLOOR_TILE_M];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
function quadFacing(f, rec, a, b, c, d, ua, ub, uc, ud, want) {
  const u = sub3(b, a), v = sub3(c, a), n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] >= 0) f.quad(rec, a, b, c, d, ua, ub, uc, ud);
  else f.quad(rec, d, c, b, a, ud, uc, ub, ua);
}
const UP = [0, 1, 0];

export function realmIsland(f, cx, cz, r, rec, { uvOf = tileUv, y: y0 = 0, bands = 0, teeth = true, floor = true } = {}) {
  const C = (x, y, z) => realmToDungeon(cx + x, y0 + y, cz + z);
  const E = (rr, a, y) => C(Math.cos(a) * rr, y, Math.sin(a) * rr);
  for (let k = 0; k < SD_ISLAND_SIDES; k++) {
    const a0 = (k / SD_ISLAND_SIDES) * Math.PI * 2, a1 = ((k + 1) / SD_ISLAND_SIDES) * Math.PI * 2;
    const x0 = Math.cos(a0) * r, z0 = Math.sin(a0) * r, x1 = Math.cos(a1) * r, z1 = Math.sin(a1) * r;
    if (floor && bands > 0) {
      for (let b = 0; b < bands; b++) {
        const r0 = (r * b) / bands, r1 = (r * (b + 1)) / bands, um = (r0 + r1) / 2 / SD_FLOOR_TILE_M, u0 = a0 * um, u1 = a1 * um;
        quadFacing(f, rec, E(r0, a0, 0), E(r0, a1, 0), E(r1, a1, 0), E(r1, a0, 0), [u0, 0], [u1, 0], [u1, 1], [u0, 1], UP);
      }
    } else if (floor) f.tri(rec, C(0, 0, 0), C(x1, 0, z1), C(x0, 0, z0), uvOf(cx, cz), uvOf(cx + x1, cz + z1), uvOf(cx + x0, cz + z0));
    const ri = r - SD_RIM_W, xi0 = Math.cos(a0) * ri, zi0 = Math.sin(a0) * ri, xi1 = Math.cos(a1) * ri, zi1 = Math.sin(a1) * ri;
    f.quad(SD_REALM_BRASS_RECORD, C(xi0, SD_RIM_H, zi0), C(xi1, SD_RIM_H, zi1), C(x1, SD_RIM_H, z1), C(x0, SD_RIM_H, z0), [0, 0], [1, 0], [1, 0.2], [0, 0.2]);
    f.quad(SD_REALM_BRASS_RECORD, C(x0, 0, z0), C(x0, SD_RIM_H, z0), C(x1, SD_RIM_H, z1), C(x1, 0, z1), [0, 0], [0, 0.1], [1, 0.1], [1, 0]);
    f.quad(SD_REALM_BRASS_RECORD, C(xi1, 0, zi1), C(xi1, SD_RIM_H, zi1), C(xi0, SD_RIM_H, zi0), C(xi0, 0, zi0), [0, 0], [0, 0.1], [1, 0.1], [1, 0]);
    f.quad(SD_REALM_ROOT_RECORD, C(x0, -SD_LIP, z0), C(x0, 0, z0), C(x1, 0, z1), C(x1, -SD_LIP, z1), [k / 8, 0.02], [k / 8, 0], [(k + 1) / 8, 0], [(k + 1) / 8, 0.02]);
    const re = r - SD_EDGE_LINE, ro = r + 0.004, ye = SD_RIM_H + 0.004, am = (a0 + a1) / 2;
    quadFacing(f, SD_REALM_EDGE_RECORD, E(re, a0, ye), E(re, a1, ye), E(ro, a1, ye), E(ro, a0, ye), [0, 0], [1, 0], [1, 1], [0, 1], UP);
    quadFacing(f, SD_REALM_EDGE_RECORD, E(ro, a0, ye - SD_EDGE_LINE), E(ro, a1, ye - SD_EDGE_LINE), E(ro, a1, ye), E(ro, a0, ye), [0, 0], [1, 0], [1, 1], [0, 1], sub3(E(r + 1, am, 0), E(r, am, 0)));
  }
  if (!teeth) return;
  const n = Math.round((2 * Math.PI * r) / SD_TOOTH_PITCH);
  for (let k = 0; k < n; k++) {
    const a = ((k + 0.5) / n) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    const at = (out, side, y) => C(ca * out - sa * side, y, sa * out + ca * side);
    for (const [q, want] of toothQuads(r - 0.02, r + SD_TOOTH_OUT, SD_TOOTH_W / 2, at)) quadFacing(f, SD_REALM_BRASS_RECORD, q[0], q[1], q[2], q[3], [0, 0], [0.2, 0], [0.2, 0.2], [0, 0.2], want);
  }
}
function toothQuads(i, o, hw, at) {
  const T = SD_TOOTH_TOP, F = SD_TOOTH_FOOT, mid = at((i + o) / 2, 0, (T + F) / 2);
  const face = (q) => [q, sub3([(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2, (q[0][2] + q[2][2]) / 2], mid)];
  return [
    face([at(i, -hw, T), at(i, hw, T), at(o, hw, T), at(o, -hw, T)]),
    face([at(o, -hw, F), at(o, hw, F), at(o, hw, T), at(o, -hw, T)]),
    face([at(i, -hw, F), at(o, -hw, F), at(o, -hw, T), at(i, -hw, T)]),
    face([at(i, hw, F), at(o, hw, F), at(o, hw, T), at(i, hw, T)]),
    face([at(i, -hw, F), at(i, hw, F), at(o, hw, F), at(o, -hw, F)]),
  ];
}
export const SD_DIAL_INLAY = Object.freeze({ y: 0.006, hour0: 0.86, hour1: 0.97, twelfth: 0.035, hour: 0.02, ring: 0.82, ringW: 0.16, seg0: 0.5, seg1: 0.56, segHalfHours: 0.84, segW: 0.06 });
function dialInlay(f) {
  const D = SD_DIAL_INLAY, R = SD_ORRERY.r, y = +D.y;
  const at = (rr, a, yy = y) => realmToDungeon(SD_ORRERY.x + Math.sin(a) * rr, yy, SD_ORRERY.z + Math.cos(a) * rr);
  const arcStrip = (rec, r0, r1, a0, a1, n, yy = y) => {
    for (let k = 0; k < n; k++) {
      const b0 = a0 + ((a1 - a0) * k) / n, b1 = a0 + ((a1 - a0) * (k + 1)) / n;
      quadFacing(f, rec, at(r0, b0, yy), at(r0, b1, yy), at(r1, b1, yy), at(r1, b0, yy), [0, 0], [1, 0], [1, 0.1], [0, 0.1], UP);
    }
  };
  for (let h = 0; h < 12; h++) {
    const a = (h / 12) * Math.PI * 2, half = (h === 0 ? D.twelfth : D.hour) * R, r0 = D.hour0 * R, r1 = D.hour1 * R;
    const side = [Math.cos(a), -Math.sin(a)];
    const P = (rr, s, yy = y) => realmToDungeon(SD_ORRERY.x + Math.sin(a) * rr + side[0] * s, yy, SD_ORRERY.z + Math.cos(a) * rr + side[1] * s);
    quadFacing(f, SD_REALM_BRASS_RECORD, P(r0, -half), P(r1, -half), P(r1, half), P(r0, half), [0, 0], [1, 0], [1, 0.2], [0, 0.2], UP);
    if (h === 0) quadFacing(f, SD_REALM_EDGE_RECORD, P(r0 + 0.2, -0.03, y + 0.002), P(r1 - 0.2, -0.03, y + 0.002), P(r1 - 0.2, 0.03, y + 0.002), P(r0 + 0.2, 0.03, y + 0.002), [0, 0], [1, 0], [1, 1], [0, 1], UP);
  }
  arcStrip(SD_REALM_BRASS_RECORD, D.ring * R - D.ringW / 2, D.ring * R + D.ringW / 2, 0, Math.PI * 2, 96);
  for (let k = 0; k < 6; k++) {
    const mid = ((2 * k + 1) / 12) * Math.PI * 2, half = (D.segHalfHours / 12) * Math.PI * 2, a0 = mid - half, a1 = mid + half;
    const r0 = D.seg0 * R, r1 = D.seg1 * R, w = D.segW;
    arcStrip(SD_REALM_BRASS_RECORD, r0, r0 + w, a0, a1, 8);
    arcStrip(SD_REALM_BRASS_RECORD, r1 - w, r1, a0, a1, 8);
    for (const a of [a0, a1]) {
      const dw = w / r0;
      arcStrip(SD_REALM_BRASS_RECORD, r0, r1, a === a0 ? a : a - dw, a === a0 ? a + dw : a, 1);
    }
  }
}
function compassRose(f, cx, cz) {
  const H = SD_INLAY_H, C = (x, z, y = H) => realmToDungeon(cx + x, y, cz + z);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, len = k === 0 ? SD_COMPASS.north : k % 2 === 0 ? SD_COMPASS.cardinal : SD_COMPASS.diagonal;
    const w = k % 2 === 0 ? 0.2 : 0.12, sa = Math.sin(a), ca = Math.cos(a);
    const P = (along, side) => C(sa * along + ca * side, ca * along - sa * side);
    quadFacing(f, SD_REALM_BRASS_RECORD, P(0, -w), P(len, 0), P(0, w), P(-w * 0.6, 0), [0, 0], [0.5, 1], [1, 0], [0.5, 0], UP);
  }
  for (let k = 0; k < 32; k++) {
    const a0 = (k / 32) * Math.PI * 2, a1 = ((k + 1) / 32) * Math.PI * 2, r0 = SD_COMPASS.ring - 0.04, r1 = SD_COMPASS.ring + 0.04;
    const P = (rr, a) => C(Math.cos(a) * rr, Math.sin(a) * rr);
    quadFacing(f, SD_REALM_BRASS_RECORD, P(r0, a0), P(r0, a1), P(r1, a1), P(r1, a0), [0, 0], [1, 0], [1, 0.1], [0, 0.1], UP);
  }
  const t = 0.018, y = H + 0.002;
  quadFacing(f, SD_REALM_EDGE_RECORD, C(-t, 0.25, y), C(t, 0.25, y), C(t, SD_COMPASS.north - 0.35, y), C(-t, SD_COMPASS.north - 0.35, y), [0, 0], [1, 0], [1, 1], [0, 1], UP);
}
function islandEdgeZ(cx, cz, r, x, side) {
  for (let k = 0; k < SD_ISLAND_SIDES; k++) {
    const a0 = (k / SD_ISLAND_SIDES) * Math.PI * 2, a1 = ((k + 1) / SD_ISLAND_SIDES) * Math.PI * 2;
    const ax = cx + Math.cos(a0) * r, az = Math.sin(a0) * r, bx = cx + Math.cos(a1) * r, bz = Math.sin(a1) * r;
    if (az * side < -1e-9 || bz * side < -1e-9 || ax === bx || (x - ax) * (x - bx) > 0) continue;
    return cz + az + ((x - ax) / (bx - ax)) * (bz - az);
  }
  return cz + side * Math.sqrt(Math.max(0, r * r - (x - cx) ** 2));
}
function islandEdgeXs(cx, r, side, x0, x1) {
  const out = [];
  for (let k = 0; k < SD_ISLAND_SIDES; k++) {
    const a = (k / SD_ISLAND_SIDES) * Math.PI * 2, x = cx + Math.cos(a) * r;
    if (Math.sin(a) * side > 1e-9 && x > x0 + 1e-9 && x < x1 - 1e-9) out.push(x);
  }
  return out;
}
export const walkNearZ = (x) => islandEdgeZ(SD_THRESHOLD.x, SD_THRESHOLD.z, SD_THRESHOLD.r, x, 1);
export const walkFarZ = (x) => islandEdgeZ(SD_ORRERY.x, SD_ORRERY.z, SD_ORRERY.r, x, -1);
const walkXs = (x0, x1) => [x0, x1, ...islandEdgeXs(SD_THRESHOLD.x, SD_THRESHOLD.r, 1, x0, x1), ...islandEdgeXs(SD_ORRERY.x, SD_ORRERY.r, -1, x0, x1)]
  .sort((a, b) => a - b).filter((x, i, a) => i === 0 || x - a[i - 1] > 1e-6);

export function buildRealmModel() {
  const f = faces();
  realmIsland(f, SD_THRESHOLD.x, SD_THRESHOLD.z, SD_THRESHOLD.r, SD_REALM_COBBLE_RECORD);
  compassRose(f, SD_THRESHOLD.x, SD_ARRIVE_Z);
  {
    const { x, halfW: h } = SD_WALK, t = 0.8;
    const C = (xx, y, zz) => realmToDungeon(xx, y, zz);
    const xs = walkXs(x - h, x + h);
    for (let k = 0; k + 1 < xs.length; k++) {
      const xa = xs[k], xb = xs[k + 1], na = walkNearZ(xa), fa = walkFarZ(xa), nb = walkNearZ(xb), fb = walkFarZ(xb);
      f.quad(SD_REALM_FLOOR_RECORD, C(xa, 0, na), C(xa, 0, fa), C(xb, 0, fb), C(xb, 0, nb), tileUv(xa, na), tileUv(xa, fa), tileUv(xb, fb), tileUv(xb, nb));
    }
    const zn = walkNearZ(x + h), zf = walkFarZ(x + h);
    const a = C(x - h, 0, zn), b = C(x - h, 0, zf), c = C(x + h, 0, zf), d = C(x + h, 0, zn);
    const down = (p) => [p[0], p[1] - t, p[2]];
    f.quad(SD_REALM_ROOT_RECORD, down(b), b, a, down(a), [0, 0], [0, 0.2], [4, 0.2], [4, 0]);
    f.quad(SD_REALM_ROOT_RECORD, down(d), d, c, down(c), [0, 0], [0, 0.2], [4, 0.2], [4, 0]);
    f.quad(SD_REALM_ROOT_RECORD, down(d), down(c), down(b), down(a), [0, 0], [0, 4], [1, 4], [1, 0]);
    for (const sd of [-1, 1]) {
      const xo = x + sd * h, xi = x + sd * (h - SD_KERB_W), xa = Math.min(xi, xo), xb = Math.max(xi, xo);
      const P = (xx, y, near) => C(xx, y, near ? walkNearZ(xx) : walkFarZ(xx));
      const H = SD_KERB_H;
      f.quad(SD_REALM_BRASS_RECORD, P(xa, H, true), P(xa, H, false), P(xb, H, false), P(xb, H, true), [0, 0], [4, 0], [4, 0.1], [0, 0.1]);
      f.quad(SD_REALM_BRASS_RECORD, P(xa, 0, false), P(xa, H, false), P(xa, H, true), P(xa, 0, true), [0, 0], [0, 0.1], [4, 0.1], [4, 0]);
      f.quad(SD_REALM_BRASS_RECORD, P(xb, 0, true), P(xb, H, true), P(xb, H, false), P(xb, 0, false), [0, 0], [0, 0.1], [4, 0.1], [4, 0]);
      f.quad(SD_REALM_BRASS_RECORD, P(xa, 0, true), P(xa, H, true), P(xb, H, true), P(xb, 0, true), [0, 0], [0, 0.1], [0.1, 0.1], [0.1, 0]);
      f.quad(SD_REALM_BRASS_RECORD, P(xb, 0, false), P(xb, H, false), P(xa, H, false), P(xa, 0, false), [0, 0], [0, 0.1], [0.1, 0.1], [0.1, 0]);
      const xl = Math.min(xo - sd * SD_EDGE_LINE, xo + sd * 0.004), xr = Math.max(xo - sd * SD_EDGE_LINE, xo + sd * 0.004), Y = H + 0.004;
      quadFacing(f, SD_REALM_EDGE_RECORD, P(xl, Y, true), P(xl, Y, false), P(xr, Y, false), P(xr, Y, true), [0, 0], [0, 1], [1, 1], [1, 0], UP);
    }
    const z0 = walkNearZ(x), z1 = walkFarZ(x), hi = h - SD_KERB_W;
    for (let zz = z0 + SD_TIE_EVERY / 2; zz < z1 - 0.5; zz += SD_TIE_EVERY) {
      quadFacing(f, SD_REALM_BRASS_RECORD, C(x - hi, SD_INLAY_H, zz - 0.09), C(x + hi, SD_INLAY_H, zz - 0.09), C(x + hi, SD_INLAY_H, zz + 0.09), C(x - hi, SD_INLAY_H, zz + 0.09), [0, 0], [1, 0], [1, 0.1], [0, 0.1], UP);
    }
  }
  const R = SD_ORRERY.r;
  realmIsland(f, SD_ORRERY.x, SD_ORRERY.z, R, SD_REALM_DIAL_RECORD, { uvOf: (x, z) => [0.5 + (x - SD_ORRERY.x) / (2 * R), 0.5 + (z - SD_ORRERY.z) / (2 * R)] });
  dialInlay(f);
  realmIsland(f, SD_ARENA.x, SD_ARENA.z, SD_ARENA.r, SD_REALM_ARENA_RECORD, { bands: SD_ARENA_BANDS });
  for (let k = 0; k < 4; k++) pillarVisual(f, k, PILLAR_RECORDS);
  for (const p of realmLampFeet()) {
    lampBoxQuads(p, SD_LAMP_POST_W, 0, SD_LAMP_H - SD_LAMP_HEAD).forEach((q, i) => f.quad(SD_REALM_BRASS_RECORD, q[0], q[1], q[2], q[3], ...(i < 4 ? LAMP_SIDE_UV : PILLAR_TOP_UV)));
    lampBoxQuads(p, SD_LAMP_HEAD, SD_LAMP_H - SD_LAMP_HEAD, SD_LAMP_H + SD_LAMP_HEAD, true).forEach((q) => f.quad(SD_HALL_GLOW_RECORD.brass, q[0], q[1], q[2], q[3], ...PILLAR_TOP_UV));
    lampBoxQuads(p, SD_LAMP_HEAD, SD_LAMP_H + SD_LAMP_HEAD, SD_LAMP_H + SD_LAMP_HEAD + 0.03).forEach((q) => f.quad(SD_REALM_BRASS_RECORD, q[0], q[1], q[2], q[3], ...PILLAR_TOP_UV));
  }
  return packRealmFaces(f);
}
const PILLAR_RECORDS = Object.freeze({ stone: SD_REALM_PILLAR_RECORD, brass: SD_REALM_BRASS_RECORD });
const PILLAR_TOP_UV = [[0, 0], [0, 1], [1, 1], [1, 0]];
const LAMP_SIDE_UV = [[0, 0], [0, SD_LAMP_H / 3], [0.1, SD_LAMP_H / 3], [0.1, 0]];
function lampBoxQuads(p, w, y0, y1, under = false) {
  const C = (dx, y, dz) => realmToDungeon(p[0] + dx, y, p[2] + dz);
  const corners = [[-w, -w], [w, -w], [w, w], [-w, w]];
  const out = [];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
    out.push([C(ax, y0, az), C(ax, y1, az), C(bx, y1, bz), C(bx, y0, bz)]);
  }
  out.push([C(-w, y1, -w), C(-w, y1, w), C(w, y1, w), C(w, y1, -w)]);
  if (under) out.push([C(-w, y0, -w), C(w, y0, -w), C(w, y0, w), C(-w, y0, w)]);
  return out;
}
function pillarQuads(k) {
  const a = Math.PI / 4 + (k * Math.PI) / 2;
  const px = SD_ARENA.x + Math.cos(a) * SD_PILLAR_R, pz = SD_ARENA.z + Math.sin(a) * SD_PILLAR_R, w = SD_PILLAR_W / 2;
  const C = (dx, y, dz) => realmToDungeon(px + dx, y, pz + dz);
  const corners = [[-w, -w], [w, -w], [w, w], [-w, w]];
  const out = [];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
    out.push([C(ax, 0, az), C(ax, SD_PILLAR_H, az), C(bx, SD_PILLAR_H, bz), C(bx, 0, bz)]);
  }
  out.push([C(-w, SD_PILLAR_H, -w), C(-w, SD_PILLAR_H, w), C(w, SD_PILLAR_H, w), C(w, SD_PILLAR_H, -w)]);
  return out;
}

export function packRealmFaces(f) {
  const recs = [...f.byRec.keys()].sort((a, b) => a - b);
  const count = recs.reduce((n, r) => n + f.byRec.get(r).p.length / 3, 0);
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), uvs = new Float32Array(count * 2);
  const indices = new Uint32Array(count);
  const subMeshes = [];
  let v = 0;
  for (const rec of recs) {
    const g = f.byRec.get(rec);
    const n = g.p.length / 3;
    positions.set(g.p, v * 3); normals.set(g.n, v * 3); uvs.set(g.uv, v * 2);
    for (let i = 0; i < n; i++) indices[v + i] = v + i;
    subMeshes.push({ textureArchive: SD_REALM_ARCHIVE, textureRecord: rec, startIndex: v, primitiveCount: n / 3 });
    v += n;
  }
  return { positions, normals, uvs, indices, subMeshes };
}

export function realmFloorTris() {
  const out = [];
  const disc = ({ x: cx, z: cz, r }) => {
    for (let k = 0; k < SD_ISLAND_SIDES; k++) {
      const a0 = (k / SD_ISLAND_SIDES) * Math.PI * 2, a1 = ((k + 1) / SD_ISLAND_SIDES) * Math.PI * 2;
      out.push(...realmToDungeon(cx, 0, cz), ...realmToDungeon(cx + Math.cos(a1) * r, 0, cz + Math.sin(a1) * r), ...realmToDungeon(cx + Math.cos(a0) * r, 0, cz + Math.sin(a0) * r));
    }
  };
  disc(SD_THRESHOLD);
  disc(SD_ORRERY);
  disc(SD_ARENA);
  const { x, z0, z1, halfW: h } = SD_WALK;
  const a = realmToDungeon(x - h, 0, z0), b = realmToDungeon(x - h, 0, z1), c = realmToDungeon(x + h, 0, z1), d = realmToDungeon(x + h, 0, z0);
  out.push(...a, ...b, ...c, ...a, ...c, ...d);
  return new Float32Array(out);
}

export function realmPillarTris() {
  const out = [];
  for (let k = 0; k < 4; k++) for (const [a, b, c, d] of pillarQuads(k)) out.push(...a, ...b, ...c, ...a, ...c, ...d);
  return new Float32Array(out);
}
export function realmColliderTris() {
  const floors = realmFloorTris(), pillars = realmPillarTris(), lamps = realmLampTris(), out = new Float32Array(floors.length + pillars.length + lamps.length);
  out.set(floors);
  out.set(pillars, floors.length);
  out.set(lamps, floors.length + pillars.length);
  return out;
}

export function realmClamp(pos, inset = 0, floors = SD_REALM_FLOORS) {
  const x = pos[0] - SD_REALM_ORIGIN[0], z = pos[2] - SD_REALM_ORIGIN[2];
  let best = null, bestD = Infinity;
  for (const fl of floors) {
    let to;
    if (fl.kind === 'disc') {
      const dx = x - fl.x, dz = z - fl.z, d = Math.hypot(dx, dz), rr = Math.max(0, fl.r - inset);
      if (d <= rr) return null;
      to = d > 1e-9 ? [fl.x + (dx / d) * rr, fl.z + (dz / d) * rr] : [fl.x + rr, fl.z];
    } else {
      const hw = Math.max(0, fl.halfW - inset);
      const cx = Math.max(fl.x - hw, Math.min(fl.x + hw, x)), cz = Math.max(fl.z0, Math.min(fl.z1, z));
      if (cx === x && cz === z) return null;
      to = [cx, cz];
    }
    const d = Math.hypot(to[0] - x, to[1] - z);
    if (d < bestD) { bestD = d; best = to; }
  }
  return best ? [best[0] + SD_REALM_ORIGIN[0], best[1] + SD_REALM_ORIGIN[2]] : null;
}

export function realmLampFeet() {
  const out = [];
  const ring = ({ x: cx, z: cz, r }, n, from = 0) => {
    for (let i = 0; i < n; i++) {
      const a = from + (i / n) * Math.PI * 2;
      out.push([cx + Math.cos(a) * (r - 1), 0, cz + Math.sin(a) * (r - 1)]);
    }
  };
  ring(SD_THRESHOLD, SD_LAMPS.threshold, Math.PI / 4);
  ring(SD_ORRERY, SD_LAMPS.orrery, Math.PI / 8);
  ring(SD_ARENA, SD_LAMPS.arena, Math.PI / 8);
  return out;
}
export function realmLights() {
  return realmLampFeet().map((p) => {
    const [x, y, z] = realmToDungeon(p[0], SD_LAMP_H, p[2]);
    return { x, y, z, range: SD_LAMP_RANGE, color: [...SD_LAMP_COLOR] };
  });
}
export function realmLampTris() {
  const out = [];
  for (const p of realmLampFeet()) for (const [a, b, c, d] of lampBoxQuads(p, SD_LAMP_POST_W, 0, SD_LAMP_H - SD_LAMP_HEAD)) out.push(...a, ...b, ...c, ...a, ...c, ...d);
  return new Float32Array(out);
}

export const SD_REALM_TRILIGHT = Object.freeze({
  sky: Object.freeze([0.2, 0.17, 0.13]),
  equator: Object.freeze([0.16, 0.12, 0.08]),
  ground: Object.freeze([0.34, 0.2, 0.08]),
});
export const SD_REALM_KEY_LIGHT = Object.freeze({
  scale: 0.65,
  dir: Object.freeze((() => { const d = [0, 0.62, 1], l = Math.hypot(d[0], d[1], d[2]); return d.map((v) => v / l); })()),
  color: Object.freeze([0.95, 0.9, 0.78]),
});
const _realmLight = {
  tri: { sky: [0, 0, 0], equator: [0, 0, 0], ground: [0, 0, 0] },
  key: { scale: 0, dir: [0, 0, 0], color: [0, 0, 0] },
};
export const realmLighting = () => {
  const { tri, key } = _realmLight;
  for (let k = 0; k < 3; k++) {
    tri.sky[k] = SD_REALM_TRILIGHT.sky[k]; tri.equator[k] = SD_REALM_TRILIGHT.equator[k]; tri.ground[k] = SD_REALM_TRILIGHT.ground[k];
    key.dir[k] = SD_REALM_KEY_LIGHT.dir[k]; key.color[k] = SD_REALM_KEY_LIGHT.color[k];
  }
  key.scale = SD_REALM_KEY_LIGHT.scale;
  return _realmLight;
};
let _lampsNear = null;
export function realmLightsNear(eye) {
  const L = (_lampsNear ??= realmLights());
  if (!eye) return L;
  const ex = eye[0], ez = eye[2];
  for (let i = 1; i < L.length; i++) {
    const l = L[i], dl = (l.x - ex) ** 2 + (l.z - ez) ** 2;
    let j = i - 1;
    while (j >= 0 && (L[j].x - ex) ** 2 + (L[j].z - ez) ** 2 > dl) { L[j + 1] = L[j]; j--; }
    L[j + 1] = l;
  }
  return L;
}
const _hourLit = { cap: 0, data: lightList(0), colors: new Float32Array(0), carried: new Uint8Array(0), views: new Map() };
export const SD_LIGHTS_CAP = 16;
const _litKey = new Float64Array(64), _litIdx = new Int32Array(64);
const ARENA_X = SD_REALM_ORIGIN[0] + SD_ARENA.x, ARENA_Z = SD_REALM_ORIGIN[2] + SD_ARENA.z;
export const arenaLamp = (l) => (l.x - ARENA_X) * (l.x - ARENA_X) + (l.z - ARENA_Z) * (l.z - ARENA_Z) < SD_ARENA.r * SD_ARENA.r;
export function realmLightsWith(lit, extra, eye, dim = null) {
  const dk = dim ? dim[0] : 1, n = lit.data.length / 4, lamps = realmLightsNear(eye), m = n + extra.length + lamps.length, H = _hourLit;
  if (m > H.cap) {
    H.cap = Math.max(m, H.cap * 2, 32);
    H.data = lightList(H.cap); H.colors = new Float32Array(H.cap * 3); H.carried = new Uint8Array(H.cap);
    H.views.clear();
  }
  copyLights(H.data, 0, lit.data, 0, n);
  for (let j = 0; j < n * 3; j++) H.colors[j] = lit.colors[j];
  const lc = lit.data.carried;
  for (let j = 0; j < m; j++) H.carried[j] = j < n && lc ? lc[j] : 0;
  const k = m - n, sorted = !!eye && m > SD_LIGHTS_CAP && k <= _litIdx.length;
  if (sorted) {
    for (let i = 0; i < k; i++) {
      const l = i < extra.length ? extra[i] : lamps[i - extra.length], dx = l.x - eye[0], dy = l.y - eye[1], dz = l.z - eye[2];
      const key = Math.max(0, Math.sqrt(dx * dx + dy * dy + dz * dz) - l.range);
      let j = i - 1;
      while (j >= 0 && _litKey[j] > key) { _litKey[j + 1] = _litKey[j]; _litIdx[j + 1] = _litIdx[j]; j--; }
      _litKey[j + 1] = key; _litIdx[j + 1] = i;
    }
  }
  for (let i = n; i < m; i++) {
    const q = sorted ? _litIdx[i - n] : i - n;
    const l = q < extra.length ? extra[q] : lamps[q - extra.length];
    packLight(H.data, i, l);
    const k = dk < 1 && q >= extra.length && arenaLamp(l) ? dk : 1;
    H.colors[i * 3] = l.color[0] * k; H.colors[i * 3 + 1] = l.color[1] * k; H.colors[i * 3 + 2] = l.color[2] * k;
  }
  let v = H.views.get(m);
  if (!v) {
    const data = lightListView(H.data, m), carried = H.carried.subarray(0, m);
    data.carried = carried;
    v = { data, colors: H.colors.subarray(0, m * 3), carried };
    H.views.set(m, v);
  }
  return v;
}

export const realmArena = (floors = SD_REALM_FLOORS) => ({ centre: [...SD_REALM_ORIGIN], radius: SD_ARENA.z + SD_ARENA.r, clamp: (pos, inset = 0) => realmClamp(pos, inset, floors) });
export const SD_ARENA_FLOORS = Object.freeze([Object.freeze({ kind: 'disc', ...SD_ARENA })]);
export const arenaHolds = (joined, x, z) => !!joined && Number.isFinite(x) && Number.isFinite(z) && Math.hypot(x - SD_ARENA.x, z - SD_ARENA.z) <= SD_ARENA.r;
