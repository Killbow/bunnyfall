// @ts-check
import { realmToDungeon, dungeonToRealm } from '../../net/sdBrain.js';
import { faces } from '../gateModel.js';
import { realmIsland, packRealmFaces, SD_REALM_FLOOR_RECORD, SD_REALM_BRASS_RECORD, SD_REALM_ROOT_RECORD, SD_REALM_ARENA_RECORD, SD_REALM_EDGE_RECORD, SD_REALM_PILLAR_RECORD, SD_REALM_COBBLE_RECORD, SD_ISLAND_SIDES, SD_LIP } from '../sdRealm.js';
import { egCircleSpecs, egBandOfCircle, egBandOfHall, EG_TEXT } from '../../net/eliteGates/egLaw.js';
import { EG_FRAGS } from '../../net/eliteGates/egFragLaw.js';
import { egSlagX, EG_SLAG_SPOUTS } from '../../net/eliteGates/egSpanLaw.js';
import { egBandDress, egBandArchive, EG_DRESS } from './egBandArt.js';
import { EG_KIT_RECORDS } from './egKit.js';
import { egKitInto, egDiscFloor, egPassage, egRingArcade, egTierBenches, egLongWalls, egChokeArch, egDoorway, egVignette } from './egGround.js';
import { egAtmosOf } from './egAtmos.js';
import { FIRE_WALLS_ARCHIVE } from '../emissiveTextures.js';
import { egHeroFragInto, egHeroFragCollider, egHeroFragRegistry } from './egHeroFragModel.js';
import { egRoomModelInto, egRoomColliderInto, egClimbZones, egClimbKeep } from './egRoomModel.js';
import { GATE_PART } from '../gateModel.js';
import { egPolyIn, segDist } from '../../net/eliteGates/egShape.js';
import { egRingSideWalls, EG_RING_DOOR } from '../../net/eliteGates/egWalkGraph.js';
import { lightList, lightListView, packLight, copyLights } from '../../render/lightId.js';
import { egRuinColumns, egDiscLamps, egRuinLampTint } from './egRuin.js';

// Must differ from the other made location ids, such as the Hour (0x7ffff200) and the court (0x7ffff000).
export const EG_HALL_LOCATION_ID = 0x7ffff300;
export const EG_HALL_BLOCK = 'SPIRE.RDB';
export const EG_HALL_BLOCK_INDEX = 900300;
const UNITS_PER_M = 40;
export const EG_DOOR = Object.freeze({ halfW: 1.6, post: 0.5, h: 4.2, lintel: 0.6 });
export const EG_LAMP = Object.freeze({ h: 2.6, range: 14, color: Object.freeze([1.0, 0.78, 0.42]), lava: Object.freeze([1.0, 0.45, 0.12]), moon: Object.freeze([0.62, 0.7, 1.0]), pitch: 24 });
export const EG_DROP_LAMP = Object.freeze({ h: 4.5, off: 1.5 });
export const EG_HALL_FOG = egAtmosOf(0).fog;
export const egHallFog = (c) => egAtmosOf(egBandOfCircle(Number.isSafeInteger(c) && c > 0 ? c : 1)).fog;
export const egHallGrade = (c) => egAtmosOf(egBandOfCircle(Number.isSafeInteger(c) && c > 0 ? c : 1)).grade;

/** @param {{ b: string, seed: number, c: number, geo?: number, regionIndex?: number, regionName?: string, climate?: { worldClimate: number, climateType: number } }} o */
export function egHallLocation({ b, seed, c, geo = 0, regionIndex = -1, regionName = '', climate = { worldClimate: 231, climateType: 2 } }) {
  return {
    name: 'The Battlespire', regionIndex, regionName, locationIndex: -1, hasDungeon: true,
    climate: { worldClimate: climate.worldClimate, climateType: climate.climateType },
    mapTableData: { mapId: 0, locationType: -1, dungeonType: 0, longitude: 0, latitude: 0 },
    exterior: { exteriorData: { locationId: EG_HALL_LOCATION_ID } },
    dungeon: {
      recordElement: { header: { locationId: EG_HALL_LOCATION_ID, unknown: 0 } },
      blocks: [{ x: 0, z: 0, blockName: EG_HALL_BLOCK, isStartingBlock: true, blockIndex: 0, blockNumber: 0, blockNumberStartIndexBitfield: 0 }],
    },
    egBreach: b, egSeed: seed >>> 0, egCircle: c, egGeo: geo | 0,
  };
}
export const isEgHall = (loc) => typeof loc?.egBreach === 'string' && Number.isSafeInteger(loc?.egCircle) && loc?.dungeon?.recordElement?.header?.locationId === EG_HALL_LOCATION_ID;
export function egHallBlock() {
  const [x, , z] = realmToDungeon(0, 0, 1.5);
  const marker = {
    type: 0x03, position: 1, index: 0, xPos: Math.round(x * UNITS_PER_M), yPos: 0, zPos: Math.round(z * UNITS_PER_M),
    resources: { flatResource: { textureArchive: 199, textureRecord: 10, flags: 0, magnitude: 0, soundIndex: 0, factionOrMobileId: 0, nextObjectOffset: -1, action: 0, position: 0 } },
  };
  return { name: EG_HALL_BLOCK, position: 0, rdbBlock: { modelReferenceList: [], objectRootList: [{ rdbObjects: [marker] }] } };
}
export function egHallBlocks(real) {
  const block = egHallBlock();
  return {
    getBlockIndex: (name) => (name === EG_HALL_BLOCK ? EG_HALL_BLOCK_INDEX : real ? real.getBlockIndex(name) : -1),
    getBlock: (i) => (i === EG_HALL_BLOCK_INDEX ? block : real ? real.getBlock(i) : null),
  };
}

export const egToDungeon = (spec, x, y, z) => realmToDungeon(spec.x0 + x, y, z);
export const egHallCentre = (spec) => realmToDungeon(spec.x0, 0, 0);
export const egFromDungeon = (spec, p) => [p[0] - realmToDungeon(spec.x0, 0, 0)[0], p[1], p[2] - realmToDungeon(0, 0, 0)[2]];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function quadTo(f, rec, a, b, c, d, want, uv = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
  if (dot(cross(sub(b, a), sub(c, a)), want) >= 0) f.quad(rec, a, b, c, d, uv[0], uv[1], uv[2], uv[3]);
  else f.quad(rec, a, d, c, b, uv[0], uv[3], uv[2], uv[1]);
}
function boxD(f, rec, x0, y0, z0, x1, y1, z1, under = true, s = 1) {
  const P = (x, y, z) => [x, y, z];
  const u = (a, b) => [[0, 0], [a * s, 0], [a * s, b * s], [0, b * s]];
  quadTo(f, rec, P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1), [0, 1, 0], u(x1 - x0, z1 - z0));
  if (under) quadTo(f, rec, P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), [0, -1, 0], u(x1 - x0, z1 - z0));
  quadTo(f, rec, P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0), [0, 0, -1], u(x1 - x0, y1 - y0));
  quadTo(f, rec, P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), [0, 0, 1], u(x1 - x0, y1 - y0));
  quadTo(f, rec, P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), [-1, 0, 0], u(z1 - z0, y1 - y0));
  quadTo(f, rec, P(x1, y0, z0), P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0), [1, 0, 0], u(z1 - z0, y1 - y0));
}
function bandModel(f, spec, b) {
  const D = (x, y, z) => egToDungeon(spec, x, y, z);
  const xl = b.x - b.halfW, xr = b.x + b.halfW, y = b.y;
  const rec = b.role === 'walk' ? SD_REALM_COBBLE_RECORD : SD_REALM_FLOOR_RECORD;
  const q = b.role === 'cave' ? spec.caves.find((c) => Math.abs(c.x - b.x) < 1e-6 && b.z0 >= c.z0 - 1e-6 && b.z1 <= c.z1 + 1e-6) : null;
  const fire = !!q && (q.kit === 'caverns' || q.kit === 'deep' || q.kit === 'forge');
  const xs = fire ? [xl, xl + 0.05, xl + 0.35, xr - 0.35, xr - 0.05, xr] : [xl, xr];
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i], c = xs[i + 1], r = fire && (i === 1 || i === 3) ? EG_DRESS.molten : rec;
    quadTo(f, r, D(a, y, b.z0), D(c, y, b.z0), D(c, y, b.z1), D(a, y, b.z1), [0, 1, 0], [[a / 2, b.z0 / 2], [c / 2, b.z0 / 2], [c / 2, b.z1 / 2], [a / 2, b.z1 / 2]]);
  }
  if (b.role === 'cave') return;
  for (const [x0, x1] of [[xl, xl + 0.18], [xr - 0.18, xr]]) { const a = D(x0, y, b.z0), c = D(x1, y + 0.12, b.z1); boxD(f, SD_REALM_BRASS_RECORD, a[0], a[1], a[2], c[0], c[1], c[2], false); }
  for (const x of [xl, xr]) { const a = D(x, y - 0.9, b.z0), c = D(x, y, b.z1); quadTo(f, SD_REALM_ROOT_RECORD, [a[0], a[1], a[2]], [a[0], a[1], c[2]], [a[0], c[1], c[2]], [a[0], c[1], a[2]], [x < b.x ? -1 : 1, 0, 0]); }
  for (const x of [xl - 0.004, xr + 0.004]) { const a = D(x, y + 0.124, b.z0), c = D(x, y + 0.124, b.z1); const s2 = x < b.x ? 0.05 : -0.05; quadTo(f, SD_REALM_EDGE_RECORD, [a[0], a[1], a[2]], [a[0] + s2, a[1], a[2]], [c[0] + s2, c[1], c[2]], [c[0], c[1], c[2]], [0, 1, 0]); }
}
export const egTubeBand = (b) => b.role === 'tube';
export const egIsleDisc = (spec, d) => d.role === 'isle' && spec.kind === 'court';
export const egWallBand = (spec, b) => spec.variant === 'fallingwall' && b.role === 'walk';
const NICHE = Object.freeze({ w: 2.0, d: 2.4, h: 2.6 });
export const egWallFoot = (q) => (q.kit === 'mist' || q.shaft ? 6 : 1.2);
export const EG_SLAG_SPOUT = Object.freeze({ up: 2.6, h: 0.6, d: 0.8, out: 0.7 });
export function egSlagSpouts(spec) {
  const out = [];
  for (const s of spec.steps ?? []) {
    if (s.kind !== 'slag' || egInHeroBox(spec, s.x, s.z)) continue;
    const q = (spec.caves ?? []).find((c) => s.z >= c.z0 && s.z <= c.z1), wall = q ? q.halfW : s.w + s.amp, zN = s.z - s.d / 2;
    for (let k = 0; k < EG_SLAG_SPOUTS; k++) {
      const side = egSlagX(s, k) < s.x ? -1 : 1, xw = (q ? q.x : s.x) + side * wall, xi = xw - side * EG_SLAG_SPOUT.out;
      const a = egToDungeon(spec, Math.min(xw, xi), s.y + EG_SLAG_SPOUT.up, zN - EG_SLAG_SPOUT.d), c = egToDungeon(spec, Math.max(xw, xi), s.y + EG_SLAG_SPOUT.up + EG_SLAG_SPOUT.h, zN);
      out.push({ box: [Math.min(a[0], c[0]), a[1], Math.min(a[2], c[2]), Math.max(a[0], c[0]), c[1], Math.max(a[2], c[2])], side, lip: egToDungeon(spec, xi, s.y + EG_SLAG_SPOUT.up, zN - EG_SLAG_SPOUT.d / 2) });
    }
  }
  return out;
}
function wallRuns(spec, q, side) {
  const cuts = (spec.alcoves ?? []).filter((a) => Math.sign(a.x - q.x) === side && Math.abs(Math.abs(a.x - q.x) - q.halfW) < 3 && a.z > q.z0 && a.z < q.z1).map((a) => [a.z - NICHE.w / 2, a.z + NICHE.w / 2]).sort((a, b) => a[0] - b[0]);
  const out = [];
  let z = q.z0;
  for (const [a, b] of cuts) { if (a > z) out.push([z, a]); z = Math.max(z, b); }
  if (z < q.z1) out.push([z, q.z1]);
  return out;
}
export function egNicheBoxes(spec) {
  const out = [];
  for (const a of spec.alcoves ?? []) {
    const side = a.side ?? 1, hd = egHeroDoor(spec, a), xw = hd ? hd.x : a.x - side * 1.2, xo = xw + side * (NICHE.d + 0.6);
    const p0 = egToDungeon(spec, Math.min(xw, xo), a.y, a.z - NICHE.w / 2), p1 = egToDungeon(spec, Math.max(xw, xo), a.y + NICHE.h, a.z + NICHE.w / 2);
    out.push({ b: [Math.min(p0[0], p1[0]), p0[1], Math.min(p0[2], p1[2]), Math.max(p0[0], p1[0]), p1[1], Math.max(p0[2], p1[2])], side, door: egToDungeon(spec, xw + side * 0.3, a.y, a.z), a, ...(hd ? { along: hd.along } : {}) });
  }
  return out;
}
export const EG_HERO_DOOR_LOOK_M = 8;
export const EG_HERO_DOOR_UNDER_M = 1.0;
/**
 * @param {any} spec
 * @param {any} a
 */
export function egHeroDoor(spec, a) {
  const H = (spec?.heroes ?? []).find((q) => a.x >= q.box[0] && a.x <= q.box[3] && a.z >= q.box[2] && a.z <= q.box[5]);
  if (!H) return null;
  const side = a.side ?? 1, floors = H.floors.filter((g) => g.y <= a.y + EG_HERO_GROUND_HAND_M && g.y >= a.y - EG_HERO_DOOR_UNDER_M);
  for (let k = 0; k * 0.05 <= EG_HERO_DOOR_LOOK_M; k++) {
    const x = a.x - side * k * 0.05, g = floors.find((f) => egPolyIn(f.poly, x, a.z));
    if (!g) continue;
    let best = null, bd = Infinity;
    for (let i = 0; i < g.poly.length; i++) {
      const p = g.poly[i], q = g.poly[(i + 1) % g.poly.length], d = segDist(x, a.z, p[0], p[1], q[0], q[1]), L = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (L > 0 && d < bd) { bd = d; best = [(q[0] - p[0]) / L, (q[1] - p[1]) / L]; }
    }
    return { x, along: best ?? [0, 1] };
  }
  return null;
}
function wallCuts(spec, q, side) {
  return (spec.alcoves ?? []).filter((a) => Math.sign(a.x - q.x) === side && Math.abs(Math.abs(a.x - q.x) - q.halfW) < 3 && a.z > q.z0 && a.z < q.z1).map((a) => [Math.max(q.z0, a.z - NICHE.w / 2), Math.min(q.z1, a.z + NICHE.w / 2), a.y, a.y + NICHE.h]).sort((a, b) => a[0] - b[0]);
}
function caveModel(f, spec, q, occ = whole, band = spec.band ?? 0) {
  const piece = (build) => occ(() => egKitInto(f, build));
  egPassage(spec, q, { runs: [wallRuns(spec, q, -1), wallRuns(spec, q, 1)], cuts: [wallCuts(spec, q, -1), wallCuts(spec, q, 1)], foot: egWallFoot(q), band, piece });
}
function nicheModel(f, spec, occ = whole) {
  for (const { b: [x0, y0, z0, x1, y1, z1], door, a } of egNicheBoxes(spec)) {
    if (egInHeroBox(spec, a.x, a.z)) continue;
    quadTo(f, SD_REALM_FLOOR_RECORD, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, 1, 0]);
    occ(() => {
      quadTo(f, SD_REALM_ROOT_RECORD, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, -1, 0]);
      quadTo(f, SD_REALM_PILLAR_RECORD, [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, 1]);
      quadTo(f, SD_REALM_PILLAR_RECORD, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, -1]);
      const xb = Math.abs(x0 - door[0]) > Math.abs(x1 - door[0]) ? x0 : x1, inward = xb === x0 ? 1 : -1;
      quadTo(f, SD_REALM_PILLAR_RECORD, [xb, y0, z0], [xb, y0, z1], [xb, y1, z1], [xb, y1, z0], [inward, 0, 0]);
    });
  }
}
function vignetteModel(f, spec, v) {
  egKitInto(f, (kit) => egVignette(kit, spec, v));
}
function archParts(spec, d) {
  const out = [], half = d.w / 2, R = d.r + 1;
  for (const s of [-1, 1]) out.push([d.x + s * half, d.x + s * R, d.z - 0.4, d.z + 0.4, (d.y ?? 0) - 0.5, (d.y ?? 0) + d.h]);
  out.push([d.x - half, d.x + half, d.z - 0.4, d.z + 0.4, (d.y ?? 0) + d.h - 1.0, (d.y ?? 0) + d.h]);
  return out.map(([x0, x1, z0, z1, y0, y1]) => { const a = egToDungeon(spec, Math.min(x0, x1), y0, z0), c = egToDungeon(spec, Math.max(x0, x1), y1, z1); return [Math.min(a[0], c[0]), a[1], Math.min(a[2], c[2]), Math.max(a[0], c[0]), c[1], Math.max(a[2], c[2])]; });
}
function rampCorners(spec, q) {
  const dx = q.bx - q.ax, dz = q.bz - q.az, len = Math.hypot(dx, dz) || 1, nx = -dz / len, nz = dx / len;
  return [egToDungeon(spec, q.ax + nx * q.hw, q.y0, q.az + nz * q.hw), egToDungeon(spec, q.ax - nx * q.hw, q.y0, q.az - nz * q.hw), egToDungeon(spec, q.bx - nx * q.hw, q.y1, q.bz - nz * q.hw), egToDungeon(spec, q.bx + nx * q.hw, q.y1, q.bz + nz * q.hw)];
}
function plateModel(f, spec, d, occ = whole, band = spec.band ?? 0) {
  realmIsland(f, spec.x0 + d.x, d.z, d.r, SD_REALM_FLOOR_RECORD, { y: d.y, teeth: false, floor: false });
  egDiscFloor(f, spec, d, SD_REALM_FLOOR_RECORD, band);
  if (d.role === 'end') egDoorway(spec, d, EG_DOOR, band, (build) => occ(() => egKitInto(f, build)));
}

/**
 * @param {any} spec
 * @param {{ax: number, az: number, bx: number, bz: number, hw: number, y?: number}} l
 */
export function egLaneOpenEnds(spec, l) {
  const dx = l.bx - l.ax, dz = l.bz - l.az, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len, y = l.y ?? 0, H = 0.6;
  const seg = (px, pz, ax, az, bx, bz) => { const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / L2)); return Math.hypot(px - ax - vx * t, pz - az - vz * t); };
  const inPoly = (poly, px, pz) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) c = !c; } return c; };
  const met = (px, pz) => (spec.discs ?? []).some((d) => Math.abs((d.y ?? 0) - y) < H && Math.hypot(px - d.x, pz - d.z) <= d.r)
    || (spec.lanes ?? []).some((q) => q !== l && Math.abs((q.y ?? 0) - y) < H && seg(px, pz, q.ax, q.az, q.bx, q.bz) <= q.hw)
    || (spec.bands ?? []).some((b) => Math.abs((b.y ?? 0) - y) < H && Math.abs(px - b.x) <= b.halfW && pz >= b.z0 && pz <= b.z1)
    || (spec.ramps ?? []).some((q) => y >= Math.min(q.y0, q.y1) - H && y <= Math.max(q.y0, q.y1) + H && seg(px, pz, q.ax, q.az, q.bx, q.bz) <= q.hw)
    || (spec.steps ?? []).some((q) => Math.abs(q.y - y) < H && Math.abs(px - q.x) <= q.w / 2 && Math.abs(pz - q.z) <= q.d / 2)
    || (spec.heroes ?? []).some((q) => (q.floors ?? []).some((f) => Math.abs(f.y - y) < H && inPoly(f.poly, px, pz)) || (!q.room && px >= q.box[0] && px <= q.box[3] && pz >= q.box[2] && pz <= q.box[5] && y >= q.box[1] - H && y <= q.box[4]));
  return (met(l.ax - ux * 0.25, l.az - uz * 0.25) ? 0 : 1) | (met(l.bx + ux * 0.25, l.bz + uz * 0.25) ? 0 : 2);
}
function laneModel(f, spec, l) {
  const dx = l.bx - l.ax, dz = l.bz - l.az, len = Math.hypot(dx, dz) || 1, nx = -dz / len, nz = dx / len, y = l.y ?? 0;
  const P = (x, yy, z) => egToDungeon(spec, x, yy, z);
  const a0 = [l.ax + nx * l.hw, l.az + nz * l.hw], a1 = [l.ax - nx * l.hw, l.az - nz * l.hw], b0 = [l.bx + nx * l.hw, l.bz + nz * l.hw], b1 = [l.bx - nx * l.hw, l.bz - nz * l.hw];
  quadTo(f, SD_REALM_FLOOR_RECORD, P(a0[0], y, a0[1]), P(a1[0], y, a1[1]), P(b1[0], y, b1[1]), P(b0[0], y, b0[1]), [0, 1, 0], [[0, 0], [l.hw, 0], [l.hw, len / 2], [0, len / 2]]);
  for (const [p0, p1, side] of /** @type {[number[], number[], number][]} */ ([[a0, b0, 1], [a1, b1, -1]])) {
    quadTo(f, SD_REALM_ROOT_RECORD, P(p0[0], y - 0.9, p0[1]), P(p1[0], y - 0.9, p1[1]), P(p1[0], y, p1[1]), P(p0[0], y, p0[1]), [nx * side, 0, nz * side]);
    const o = 0.05 * side;
    quadTo(f, SD_REALM_EDGE_RECORD, P(p0[0], y + 0.02, p0[1]), P(p1[0], y + 0.02, p1[1]), P(p1[0] - nx * o, y + 0.02, p1[1] - nz * o), P(p0[0] - nx * o, y + 0.02, p0[1] - nz * o), [0, 1, 0]);
  }
  const open = egLaneOpenEnds(spec, l);
  for (const [on, p0, p1, s] of /** @type {[number, number[], number[], number][]} */ ([[open & 1, a1, a0, -1], [open & 2, b0, b1, 1]])) {
    if (!on) continue;
    const ux = (dx / len) * s, uz = (dz / len) * s, o = 0.05;
    quadTo(f, SD_REALM_ROOT_RECORD, P(p0[0], y - 0.9, p0[1]), P(p1[0], y - 0.9, p1[1]), P(p1[0], y, p1[1]), P(p0[0], y, p0[1]), [ux, 0, uz]);
    quadTo(f, SD_REALM_EDGE_RECORD, P(p0[0], y + 0.02, p0[1]), P(p1[0], y + 0.02, p1[1]), P(p1[0] - ux * o, y + 0.02, p1[1] - uz * o), P(p0[0] - ux * o, y + 0.02, p0[1] - uz * o), [0, 1, 0]);
  }
}
function decoModel(f, spec, d, occ = whole, band = spec.band ?? 0) {
  const P = (x, yy, z) => egToDungeon(spec, x, yy, z), piece = (build) => occ(() => egKitInto(f, build));
  if (d.t === 'wall') egRingArcade(spec, d, band, piece);
  else if (d.t === 'tiers') egTierBenches(spec, d, piece);
  else if (d.t === 'magma') {
    const y = d.y ?? -1.5, r = d.r;
    quadTo(f, EG_DRESS.molten, P(d.x - r, y, d.z - r), P(d.x + r, y, d.z - r), P(d.x + r, y, d.z + r), P(d.x - r, y, d.z + r), [0, 1, 0], [[0, 0], [r / 4, 0], [r / 4, r / 4], [0, r / 4]]);
  } else if (d.t === 'hall') egLongWalls(spec, d, band, piece);
}
let _heroMeshes = /** @type {Readonly<Record<string, any>>|null} */ (null);
export function egHeroMeshSeam(meshes = null) { const was = _heroMeshes; _heroMeshes = meshes; return was; }
const heroMeshes = () => _heroMeshes ?? egHeroFragRegistry();
export const EG_HERO_GROUND_HAND_M = 0.2;
export const egHeroGroundYs = (q) => [...new Set([...q.floors.map((g) => g.y - q.y), ...q.ramps.flatMap((r) => r.poly.map((p) => p[1] - q.y))])];
export const egInHeroBox = (spec, x, z, y = null) => (spec?.heroes ?? []).some((q) => !q.room && x >= q.box[0] && x <= q.box[3] && z >= q.box[2] && z <= q.box[5]
  && (y == null || (y >= q.box[1] && y <= q.box[4])));
export const EG_HERO_ROCK_CELL_M = 6;
const heroSorter = (ys) => {
  const ground = [], rock = new Map();
  return {
    ground, rock,
    mesh(rec, src, { start = 0, count = src.indices.length / 3 } = {}) {
      const P = src.positions, I = src.indices;
      for (let k = start; k < start + count * 3; k += 3) {
        const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3, top = Math.max(P[a + 1], P[b + 1], P[c + 1]);
        if (ys.some((y) => Math.abs(top - y) <= EG_HERO_GROUND_HAND_M)) { ground.push([rec, src, k]); continue; }
        const key = `${rec}:${Math.floor((P[a] + P[b] + P[c]) / 3 / EG_HERO_ROCK_CELL_M)}:${Math.floor((P[a + 2] + P[b + 2] + P[c + 2]) / 3 / EG_HERO_ROCK_CELL_M)}`;
        let list = rock.get(key);
        if (!list) rock.set(key, list = []);
        list.push([rec, src, k]);
      }
      return this;
    },
  };
};
function heroTrisInto(f, tris, at) {
  for (const [rec, src, k] of tris) {
    let g = f.byRec.get(rec);
    if (!g) f.byRec.set(rec, g = { p: [], n: [], uv: [], parts: [] });
    for (let c = 0; c < 3; c++) {
      const v = src.indices[k + c];
      g.p.push(src.positions[v * 3] + at[0], src.positions[v * 3 + 1] + at[1], src.positions[v * 3 + 2] + at[2]);
      g.n.push(src.normals[v * 3], src.normals[v * 3 + 1], src.normals[v * 3 + 2]);
      g.uv.push(src.uvs[v * 2], src.uvs[v * 2 + 1]);
    }
    g.parts.push(GATE_PART.Stone);
  }
}
function heroModel(f, spec, occ = whole) {
  for (const q of spec.heroes ?? []) {
    const M = heroMeshes();
    if (q.room || !M[q.id]) continue;
    const at = egToDungeon(spec, q.x, q.y, q.z), S = egHeroFragInto(heroSorter(egHeroGroundYs(q)), q.id, at, M);
    heroTrisInto(f, S.ground, at);
    for (const tris of S.rock.values()) occ(() => heroTrisInto(f, tris, at));
  }
}
export function buildEgCircleModel(seed, c, geo = 0) {
  const f = faces(), pieces = [], occ = occluderMarker(f, pieces), band = egBandOfCircle(c);
  for (const spec of egCircleSpecs(seed, c, geo)) {
    for (const d of spec.discs) {
      if (egIsleDisc(spec, d)) continue;
      if (d.role === 'arrive' || d.role === 'end') { plateModel(f, spec, d, occ, band); continue; }
      const rec = d.role === 'court' || d.role === 'isle' || d.role === 'balcony' ? SD_REALM_ARENA_RECORD : SD_REALM_FLOOR_RECORD;
      realmIsland(f, spec.x0 + d.x, d.z, d.r, rec, { y: d.y, teeth: false, floor: false });
      egDiscFloor(f, spec, d, rec, band);
    }
    for (const b of spec.bands) if (!egWallBand(spec, b) && !egTubeBand(b)) bandModel(f, spec, b);
    for (const l of spec.lanes ?? []) laneModel(f, spec, l);
    for (const q of spec.caves) caveModel(f, spec, q, occ, band);
    for (const d of spec.deco ?? []) decoModel(f, spec, d, occ, band);
    nicheModel(f, spec, occ);
    for (const v of spec.vignettes ?? []) occ(() => vignetteModel(f, spec, v));
    for (const d of spec.deco ?? []) if (d.t === 'arch') egChokeArch(spec, d, band, archParts(spec, d), (build) => occ(() => egKitInto(f, build)));
    for (const q of spec.ramps ?? []) { if (egInHeroBox(spec, (q.ax + q.bx) / 2, (q.az + q.bz) / 2, (q.y0 + q.y1) / 2)) continue; const [a, b, c, e] = rampCorners(spec, q); quadTo(f, SD_REALM_FLOOR_RECORD, a, b, c, e, [0, 1, 0]); quadTo(f, SD_REALM_ROOT_RECORD, a, b, [b[0], b[1] - 0.6, b[2]], [a[0], a[1] - 0.6, a[2]], [0, -1, 0]); }
    heroModel(f, spec, occ);
    egRoomModelInto(f, spec, { floor: SD_REALM_FLOOR_RECORD, root: SD_REALM_ROOT_RECORD, wall: SD_REALM_PILLAR_RECORD, rail: SD_REALM_BRASS_RECORD }, occ);
    for (const { box: [x0, y0, z0, x1, y1, z1] } of egSlagSpouts(spec)) occ(() => {
      boxD(f, SD_REALM_BRASS_RECORD, x0, y0, z0, x1, y1, z1, false, 0.5);
      quadTo(f, EG_DRESS.molten, [x0, y0 - 0.002, z0], [x1, y0 - 0.002, z0], [x1, y0 - 0.002, z1], [x0, y0 - 0.002, z1], [0, -1, 0]);
    });
  }
  // Kit records move to the band archive, never the Hour archive, where records from 60 up are the Steps' pictures.
  const model = egBandDress(packRealmFaces(f), band);
  for (const sm of model.subMeshes) if (EG_KIT_RECORDS.includes(sm.textureRecord)) sm.textureArchive = egBandArchive(band);
  model.occluders = egOccluderRuns(model, pieces);
  return model;
}

function whole(fn) { fn(); }
function occluderMarker(f, pieces) {
  return (fn) => {
    const at = new Map();
    for (const [rec, g] of f.byRec) at.set(rec, g.p.length / 9);
    fn();
    const runs = [];
    for (const [rec, g] of f.byRec) { const a = at.get(rec) ?? 0, n = g.p.length / 9 - a; if (n > 0) runs.push([rec, a, n]); }
    if (runs.length) pieces.push(runs);
  };
}
/**
 * @param {any} model
 * @param {Array<Array<number[]>>} pieces
 */
export function egOccluderRuns(model, pieces) {
  const sub = new Map(model.subMeshes.map((sm, i) => [sm.textureRecord, i])), P = model.positions, I = model.indices;
  return pieces.map((runs) => {
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    const r = runs.map(([rec, a, n]) => {
      const i = sub.get(rec), s = model.subMeshes[i].startIndex + a * 3;
      for (let j = s; j < s + n * 3; j++) for (let k = 0, v = I[j] * 3; k < 3; k++) { const x = P[v + k]; if (x < b[k]) b[k] = x; if (x > b[k + 3]) b[k + 3] = x; }
      return [i, s, n];
    }).sort((x, y) => x[0] - y[0]);
    return { b, r };
  });
}

export const EG_RAISED_ROLES = Object.freeze(['pillar', 'perch', 'balcony']);
export const EG_RAISED_WAY_PAD_M = 0.35;
export function egCircleColliderTris(seed, c, geo = 0) {
  const out = [];
  const tri = (a, b, d) => out.push(a[0], a[1], a[2], b[0], b[1], b[2], d[0], d[1], d[2]);
  const quad = (a, b, d, e) => { tri(a, b, d); tri(a, d, e); };
  const box = (x0, y0, z0, x1, y1, z1) => {
    const P = (x, y, z) => [x, y, z];
    quad(P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)); quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1));
    quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0)); quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1));
    quad(P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0)); quad(P(x1, y0, z0), P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0));
  };
  for (const spec of egCircleSpecs(seed, c, geo)) {
    for (const l of spec.lanes ?? []) {
      const dx = l.bx - l.ax, dz = l.bz - l.az, len = Math.hypot(dx, dz) || 1, nx = -dz / len, nz = dx / len, y = l.y ?? 0;
      quad(egToDungeon(spec, l.ax + nx * l.hw, y, l.az + nz * l.hw), egToDungeon(spec, l.ax - nx * l.hw, y, l.az - nz * l.hw), egToDungeon(spec, l.bx - nx * l.hw, y, l.bz - nz * l.hw), egToDungeon(spec, l.bx + nx * l.hw, y, l.bz + nz * l.hw));
    }
    for (const d of spec.deco ?? []) {
      if (d.t === 'wall') {
        const n = 32, y0 = (d.y ?? 0) - 0.5, y1 = (d.y ?? 0) + d.h;
        for (let k = 0; k < n; k++) {
          const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
          const x0 = d.x + Math.sin(a0) * d.r, z0 = d.z + Math.cos(a0) * d.r, x1 = d.x + Math.sin(a1) * d.r, z1 = d.z + Math.cos(a1) * d.r;
          for (const [t0, t1] of egRingSideWalls(spec, d, k, n)) {
            const p0 = egToDungeon(spec, x0 + (x1 - x0) * t0, y0, z0 + (z1 - z0) * t0), p1 = egToDungeon(spec, x0 + (x1 - x0) * t1, y0, z0 + (z1 - z0) * t1);
            quad(p0, p1, [p1[0], p1[1] + (y1 - y0), p1[2]], [p0[0], p0[1] + (y1 - y0), p0[2]]);
          }
        }
      } else if (d.t === 'hall') {
        for (const sgn of [-1, 1]) { const a = egToDungeon(spec, d.x + sgn * d.hw, (d.y ?? 0) - 0.5, d.z0), b = egToDungeon(spec, d.x + sgn * d.hw, (d.y ?? 0) - 0.5, d.z1); quad(a, b, [b[0], b[1] + d.h + 0.5, b[2]], [a[0], a[1] + d.h + 0.5, a[2]]); }
      }
    }
    for (const d of spec.discs) {
      if (egIsleDisc(spec, d)) continue;
      // A raised floor gets rim faces as deep as `SD_LIP`, except beside a stair top, so a body at its foot hits
      // the face and never walks under the top.
      const way = EG_RAISED_ROLES.includes(d.role) ? (spec.ramps ?? []).filter((q) => Math.abs(q.y1 - d.y) < 0.05 && Math.hypot(q.bx - d.x, q.bz - d.z) <= d.r + 0.5) : null;
      for (let k = 0; k < SD_ISLAND_SIDES; k++) {
        const a0 = (k / SD_ISLAND_SIDES) * Math.PI * 2, a1 = ((k + 1) / SD_ISLAND_SIDES) * Math.PI * 2;
        tri(realmToDungeon(spec.x0 + d.x, d.y, d.z), realmToDungeon(spec.x0 + d.x + Math.cos(a1) * d.r, d.y, d.z + Math.sin(a1) * d.r), realmToDungeon(spec.x0 + d.x + Math.cos(a0) * d.r, d.y, d.z + Math.sin(a0) * d.r));
        if (!way) continue;
        const mx = d.x + Math.cos((a0 + a1) / 2) * d.r, mz = d.z + Math.sin((a0 + a1) / 2) * d.r;
        if (way.some((q) => Math.hypot(mx - q.bx, mz - q.bz) <= q.hw + EG_RAISED_WAY_PAD_M)) continue;
        const p0 = realmToDungeon(spec.x0 + d.x + Math.cos(a0) * d.r, d.y, d.z + Math.sin(a0) * d.r), p1 = realmToDungeon(spec.x0 + d.x + Math.cos(a1) * d.r, d.y, d.z + Math.sin(a1) * d.r);
        quad(p0, p1, [p1[0], p1[1] - SD_LIP, p1[2]], [p0[0], p0[1] - SD_LIP, p0[2]]);
      }
      if (d.role === 'end') {
        for (const s of [-1, 1]) { const a = realmToDungeon(spec.x0 + d.x + s * EG_DOOR.halfW - EG_DOOR.post / 2, d.y, d.z - EG_DOOR.post / 2), e = realmToDungeon(spec.x0 + d.x + s * EG_DOOR.halfW + EG_DOOR.post / 2, d.y + EG_DOOR.h, d.z + EG_DOOR.post / 2); box(a[0], a[1], a[2], e[0], e[1], e[2]); }
      }
    }
    for (const b of spec.bands) if (!egWallBand(spec, b) && !egTubeBand(b)) quad(egToDungeon(spec, b.x - b.halfW, b.y, b.z0), egToDungeon(spec, b.x + b.halfW, b.y, b.z0), egToDungeon(spec, b.x + b.halfW, b.y, b.z1), egToDungeon(spec, b.x - b.halfW, b.y, b.z1));
    for (const q of spec.caves) {
      const yLo = Math.min(q.y, q.yB ?? q.y), yHi = Math.max(q.y, q.yB ?? q.y);
      if (q.open) continue;
      for (const s of [-1, 1]) for (const [z0, z1] of wallRuns(spec, q, s)) { const a = egToDungeon(spec, q.x + s * (q.halfW + 0.6), yLo - egWallFoot(q), z0), e = egToDungeon(spec, q.x + s * q.halfW, yHi + q.height, z1); box(Math.min(a[0], e[0]), a[1], a[2], Math.max(a[0], e[0]), e[1], e[2]); }
      if (q.kit === 'gloam' || q.tube) continue;
      const a = egToDungeon(spec, q.x - q.halfW - 0.6, yHi + q.height, q.z0), e = egToDungeon(spec, q.x + q.halfW + 0.6, yHi + q.height + 1, q.z1);
      box(a[0], a[1], a[2], e[0], e[1], e[2]);
    }
    for (const { b: [x0, y0, z0, x1, y1, z1], door, a } of egNicheBoxes(spec)) {
      if (egInHeroBox(spec, a.x, a.z)) continue;
      quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]); quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]);
      quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]); quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
      const xb = Math.abs(x0 - door[0]) > Math.abs(x1 - door[0]) ? x0 : x1;
      quad([xb, y0, z0], [xb, y0, z1], [xb, y1, z1], [xb, y1, z0]);
    }
    for (const d of spec.deco ?? []) if (d.t === 'arch') for (const [x0, y0, z0, x1, y1, z1] of archParts(spec, d)) box(x0, y0, z0, x1, y1, z1);
    for (const q of spec.ramps ?? []) { if (egInHeroBox(spec, (q.ax + q.bx) / 2, (q.az + q.bz) / 2, (q.y0 + q.y1) / 2)) continue; const [a, b, c, e] = rampCorners(spec, q); quad(a, b, c, e); }
    for (const v of spec.vignettes ?? []) { const a = egToDungeon(spec, v.x - 0.4, v.y, v.z - 1.0), e = egToDungeon(spec, v.x + 0.4, v.y + 1.4, v.z + 1.0); box(Math.min(a[0], e[0]), a[1], Math.min(a[2], e[2]), Math.max(a[0], e[0]), e[1], Math.max(a[2], e[2])); }
    for (const q of spec.heroes ?? []) { const M = heroMeshes(); if (!q.room && M[q.id]) for (const v of egHeroFragCollider(q.id, egToDungeon(spec, q.x, q.y, q.z), M)) out.push(v); }
    egRoomColliderInto(spec, out);
  }
  return new Float32Array(out);
}

export function egGateParts(spec) {
  if (!spec.gate) return null;
  const g = spec.gate, f = faces(), tris = [];
  const n = Math.max(4, Math.round((g.halfW * 2) / 0.55));
  for (let k = 0; k <= n; k++) {
    const x = -g.halfW + (k / n) * g.halfW * 2;
    const a = egToDungeon(spec, x - 0.07, 0, g.z - 0.07), c = egToDungeon(spec, x + 0.07, 4.2, g.z + 0.07);
    boxD(f, SD_REALM_BRASS_RECORD, a[0], a[1], a[2], c[0], c[1], c[2], false, 0.5);
  }
  for (const yb of [1.2, 2.6, 4.0]) { const a = egToDungeon(spec, -g.halfW, yb, g.z - 0.09), c = egToDungeon(spec, g.halfW, yb + 0.16, g.z + 0.09); boxD(f, SD_REALM_PILLAR_RECORD, a[0], a[1], a[2], c[0], c[1], c[2], true, 0.5); }
  const a = egToDungeon(spec, -g.halfW, 0, g.z - 0.15), c = egToDungeon(spec, g.halfW, 4.2, g.z + 0.15);
  const P = (x, y, z) => [x, y, z];
  for (const z of [a[2], c[2]]) tris.push(...P(a[0], 0, z), ...P(c[0], 0, z), ...P(c[0], 4.2, z), ...P(a[0], 0, z), ...P(c[0], 4.2, z), ...P(a[0], 4.2, z));
  return { model: egBandDress(packRealmFaces(f), spec.band ?? 0), tris: new Float32Array(tris) };
}

// Caps the lamps near any lamp below the 16 point lights the renderer uploads, so no lamp near the camera is cut or
// pops.
export const EG_LAMP_BUDGET = Object.freeze({ n: 12, r: 40 });
const spreadRank = (k, n) => { const order = [0]; for (let step = n; order.length < n; step = Math.ceil(step / 2)) for (let j = 0; j < n; j += step) if (!order.includes(j)) order.push(j); return order.indexOf(k); };

export function egCircleLights(seed, c, geo = 0) {
  const out = [], rank = [];
  const lamp = (p, color = EG_LAMP.color, range = Number(EG_LAMP.range), pr = 0) => { out.push({ x: p[0], y: p[1], z: p[2], range, color: [...color] }); rank.push(pr); };
  for (const spec of egCircleSpecs(seed, c, geo)) {
    const ruin = egRuinColumns(spec), tint = egRuinLampTint(egBandOfHall(spec.h));
    spec.discs.forEach((d, i) => {
      const n = egDiscLamps(d);
      for (let k = 0; k < n; k++) {
        const on = ruin.lamp(i, k), a = (k / n) * Math.PI * 2 + Math.PI / 4;
        lamp(on ? egToDungeon(spec, on.at[0], on.at[1], on.at[2]) : egToDungeon(spec, d.x + Math.cos(a) * (d.r - 1), d.y + EG_LAMP.h, d.z + Math.sin(a) * (d.r - 1)), on ? egRuinLampTint(on.band) : tint, Number(EG_LAMP.range), 1 + spreadRank(k, n));
      }
    });
    if (spec.walk) for (let z = spec.walk.z0 + 8; z < spec.walk.z1; z += EG_LAMP.pitch) for (const s of [-1, 1]) lamp(egToDungeon(spec, s * (spec.walk.halfW + 0.3), EG_LAMP.h, z), tint, Number(EG_LAMP.range), 7);
    for (const s of spec.steps) if (s.kind === 'drop') lamp(egToDungeon(spec, s.x, s.y + EG_DROP_LAMP.h, s.z + s.d / 2 - EG_DROP_LAMP.off));
    for (const [x, y, z, kind] of spec.lights ?? []) {
      const kit = (spec.frags ?? []).find((q) => z >= q.z0 - 1 && z <= q.z1 + 1)?.kit;
      lamp(egToDungeon(spec, x, y, z), kind === 'lava' ? EG_LAMP.lava : kind === 'moon' ? EG_LAMP.moon : EG_FRAGS[kit]?.light ?? EG_LAMP.color, kind === 'moon' ? 18 : 10);
    }
  }
  const { n: N, r: R } = EG_LAMP_BUDGET, order = out.map((_, i) => i).sort((a, b) => rank[a] - rank[b] || a - b);
  const kept = [], near = new Map();
  for (const i of order) {
    const L = out[i], by = kept.filter((j) => Math.hypot(out[j].x - L.x, out[j].y - L.y, out[j].z - L.z) <= R);
    if (by.length + 1 > N || by.some((j) => near.get(j) + 1 > N)) continue;
    for (const j of by) near.set(j, near.get(j) + 1);
    near.set(i, by.length + 1);
    kept.push(i);
  }
  return out.filter((_, i) => near.has(i));
}
const _egLit = { cap: 0, data: lightList(0), colors: new Float32Array(0), carried: new Uint8Array(0), views: new Map() };
export function egLightsWith(lit, extra, lamps, eye) {
  const n = lit.data.length / 4, H = _egLit;
  if (eye && lamps.length > 1) {
    const ex = eye[0], ez = eye[2];
    for (let i = 1; i < lamps.length; i++) {
      const l = lamps[i], dl = (l.x - ex) ** 2 + (l.z - ez) ** 2;
      let j = i - 1;
      while (j >= 0 && (lamps[j].x - ex) ** 2 + (lamps[j].z - ez) ** 2 > dl) { lamps[j + 1] = lamps[j]; j--; }
      lamps[j + 1] = l;
    }
  }
  const m = n + extra.length + Math.min(lamps.length, 24);
  if (m > H.cap) { H.cap = Math.max(m, H.cap * 2, 32); H.data = lightList(H.cap); H.colors = new Float32Array(H.cap * 3); H.carried = new Uint8Array(H.cap); H.views.clear(); }
  copyLights(H.data, 0, lit.data, 0, n);
  for (let j = 0; j < n * 3; j++) H.colors[j] = lit.colors[j];
  const lc = lit.data.carried;
  for (let j = 0; j < m; j++) H.carried[j] = j < n && lc ? lc[j] : 0;
  for (let i = n; i < m; i++) {
    const q = i - n, l = q < extra.length ? extra[q] : lamps[q - extra.length];
    packLight(H.data, i, l);
    if (l.carried) H.carried[i] = 1;
    H.colors[i * 3] = l.color[0]; H.colors[i * 3 + 1] = l.color[1]; H.colors[i * 3 + 2] = l.color[2];
  }
  let v = H.views.get(m);
  if (!v) {
    /** @type {Float32Array & { carried?: Uint8Array }} */
    const data = lightListView(H.data, m), carried = H.carried.subarray(0, m);
    data.carried = carried;
    v = { data, colors: H.colors.subarray(0, m * 3), carried };
    H.views.set(m, v);
  }
  return v;
}
const _egLight = [0, 1, 2, 3].map((b) => Object.freeze({ tri: egAtmosOf(b).tri, key: egAtmosOf(b).key }));
export const egHallLighting = (c = 1) => _egLight[egBandOfCircle(Number.isSafeInteger(c) && c > 0 ? c : 1)];
export const EG_HALL_TEXT = Object.freeze({ noSave: EG_TEXT.noSave, noMap: EG_TEXT.noMap, noRest: EG_TEXT.noRest });

// Fire falls use TEXTURE.356 record 0 read from the player's ARENA2 at runtime; the texture is never shipped.
export const EG_FIRE_FALL = Object.freeze({ archive: FIRE_WALLS_ARCHIVE, record: 0, w: 2, h: 4 });
/**
 * @param {any} spec
 * @param {any} hz
 */
export function egFireFallFlames(spec, hz) {
  if (hz?.kind !== 'fall' || !Array.isArray(hz.sh) || hz.sh.length < 4) return null;
  const [x0, z0, x1, z1] = hz.sh, len = Math.hypot(x1 - x0, z1 - z0);
  const cave = (spec.caves ?? []).find((q) => Math.abs(q.x - (x0 + x1) / 2) <= q.halfW + 0.5 && (z0 + z1) / 2 >= q.z0 && (z0 + z1) / 2 <= q.z1);
  const n = Math.max(1, Math.round(len / EG_FIRE_FALL.w));
  const at = [];
  for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; at.push([x0 + (x1 - x0) * t, hz.y ?? 0, z0 + (z1 - z0) * t]); }
  return { at, w: len / n, h: cave ? cave.height : EG_FIRE_FALL.h };
}

export const EG_CLAMP_SLACK_M = 1.5;
// Must equal `CAPSULE_HEIGHT` in `player/motor.js`, so a zone's ceiling keeps the head under it.
const CLAMP_BODY_M = 1.8;
// Climb zones come first, so `egFragZoneAt` matches a climber to its climb face before the room walls.
export function egFragZones(spec) {
  const out = egClimbZones(spec);
  for (const q of spec.caves ?? []) out.push({ t: 'passage', x: q.x, z0: q.z0, z1: q.z1, halfW: q.halfW, y: Math.min(q.y, q.yB ?? q.y), ceil: Math.max(q.y, q.yB ?? q.y) + q.height, open: q.open ? 1 : 0, shaft: q.shaft ? 1 : 0, zB: q.zB ?? q.z1, yB: q.yB ?? q.y });
  for (const d of spec.deco ?? []) if (d.t === 'wall' && d.kit) out.push({ t: 'chamber', x: d.x, z: d.z, r: d.r, y: d.y ?? 0, ceil: (d.y ?? 0) + d.h });
  for (const h of spec.heroes ?? []) { const o = h.sockets.out[h.exit]; out.push({ t: 'hero', h, box: h.box, y: h.box[1], ceil: h.box[4], shaft: h.cls === 'shaft' ? 1 : 0, zB: o.z, yB: o.y }); }
  return out;
}
export function egHeroFloorAt(H, x, y, z) {
  let k = -1;
  for (const [i, f] of H.floors.entries()) if ((!Number.isFinite(y) || (y >= f.y - 0.5 && y <= f.y + 3)) && egPolyIn(f.poly, x, z) && (k < 0 || f.y > H.floors[k].y)) k = i;
  return k;
}
export function egHeroCeilAt(H, x, z, y) {
  let best = null;
  for (const c of H.ceil ?? []) if (c.y > y && (best === null || c.y < best) && egPolyIn(c.poly, x, z)) best = c.y;
  return best;
}
export function egFragZoneAt(zones, x, y, z) {
  for (const q of zones) {
    if (y < q.y - 3 || y > q.ceil + 3) continue;
    if (q.t === 'climb') { if (x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1 && y >= q.y && y <= q.ceil) return q; continue; }
    if (q.t === 'hero' ? z >= q.box[2] && z <= q.box[5] && x >= q.box[0] - EG_CLAMP_SLACK_M && x <= q.box[3] + EG_CLAMP_SLACK_M
      : q.t === 'passage' ? z >= q.z0 && z <= q.z1 && Math.abs(x - q.x) <= q.halfW + EG_CLAMP_SLACK_M : Math.hypot(x - q.x, z - q.z) <= q.r + EG_CLAMP_SLACK_M) return q;
  }
  return null;
}
function heroKeep(q, x, z, r, y) {
  const H = q.h, open = new Set(H.open.map((e) => `${e[0]}:${e[1]}`));
  for (const rp of H.ramps) { const ys = rp.poly.map((p) => p[1]); if (egPolyIn(rp.poly.map((p) => [p[0], p[2]]), x, z, 0.05) && (!Number.isFinite(y) || (y >= Math.min(...ys) - 0.5 && y <= Math.max(...ys) + 3))) return null; }
  const inside = (f, e, px, pz) => {
    const a = f.poly[e], b = f.poly[(e + 1) % f.poly.length], ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez || 1, L = Math.sqrt(L2);
    const t = Math.max(0, Math.min(1, ((px - a[0]) * ex + (pz - a[1]) * ez) / L2));
    return [a[0] + ex * t - (ez / L) * r, a[1] + ez * t + (ex / L) * r];
  };
  const fi = egHeroFloorAt(H, x, y, z);
  if (fi >= 0) {
    const f = H.floors[fi];
    let px = x, pz = z, moved = false;
    for (let pass = 0; pass < 2; pass++) for (let e = 0; e < f.poly.length; e++) {
      if (open.has(`${fi}:${e}`)) continue;
      const a = f.poly[e], b = f.poly[(e + 1) % f.poly.length];
      if (segDist(px, pz, a[0], a[1], b[0], b[1]) < r - 1e-6) { [px, pz] = inside(f, e, px, pz); moved = true; }
    }
    return moved ? [px, pz] : null;
  }
  let best = null, bd = EG_CLAMP_SLACK_M;
  for (const [i, f] of H.floors.entries()) {
    if (Number.isFinite(y) && !(y >= f.y - 0.5 && y <= f.y + 3)) continue;
    for (let e = 0; e < f.poly.length; e++) { const a = f.poly[e], b = f.poly[(e + 1) % f.poly.length], d = segDist(x, z, a[0], a[1], b[0], b[1]); if (d < bd) { bd = d; best = [i, e]; } }
  }
  if (!best || open.has(`${best[0]}:${best[1]}`)) return null;
  return inside(H.floors[best[0]], best[1], x, z);
}
// Must match the 0.2 gap rule in `egRingSideWalls` (`net/eliteGates/egWalkGraph.js`) and `ringGapSide`
// (`egGround.js`).
const ringGap = (dx, dz) => { const d = Math.hypot(dx, dz); return d > 1e-9 && Math.abs(dx / d) < 0.2; };
export function egFragKeep(q, x, z, r, spec = null, y = NaN) {
  if (!q) return null;
  if (q.t === 'hero') return heroKeep(q, x, z, r, y);
  if (q.t === 'climb') return egClimbKeep(q, x, z, r);
  if (q.t === 'passage') {
    if (q.open || z < q.z0 || z > q.z1) return null;
    const dx = x - q.x, lim = q.halfW - r;
    if (Math.abs(dx) <= lim) return null;
    const side = Math.sign(dx);
    const door = (spec?.alcoves ?? []).some((a) => Math.sign(a.x - q.x) === side && Math.abs(a.z - z) <= NICHE.w / 2 && a.z > q.z0 && a.z < q.z1);
    return door ? null : [q.x + side * lim, z];
  }
  const dx = x - q.x, dz = z - q.z, d = Math.hypot(dx, dz), lim = q.r - r;
  if (d <= lim || d > q.r + EG_CLAMP_SLACK_M || ringGap(dx, dz)) return null;
  const doorOf = (a) => { const ax = a.x - q.x, az = a.z - q.z, al = Math.hypot(ax, az) || 1; return Math.abs((x - a.x) * (az / al) - (z - a.z) * (ax / al)) <= EG_RING_DOOR.w / 2 - r && Math.abs((x - a.x) * (ax / al) + (z - a.z) * (az / al)) <= NICHE.d; };
  if ((spec?.law ?? spec?.v ?? 0) >= 10 && (spec?.alcoves ?? []).some((a) => Math.abs((a.y ?? 0) - (q.y ?? 0)) < 1 && doorOf(a))) return null;
  return [q.x + (dx / d) * lim, q.z + (dz / d) * lim];
}
/**
 * @param {any} spec
 * @param {number[]} pos
 */
export function egFragArena(spec, pos) {
  if (!spec || !Array.isArray(pos)) return null;
  const [rx, y, z] = dungeonToRealm(pos[0], pos[1], pos[2]), x = rx - spec.x0;
  const q = egFragZoneAt(egFragZones(spec), x, y, z);
  if (!q) return null;
  if (q.t === 'climb') {
    return {
      centre: egToDungeon(spec, (q.c.x0 + q.c.x1) / 2, q.c.y0, (q.c.z0 + q.c.z1) / 2), radius: 1, ceilAbove: Infinity, zone: q,
      clamp: (p, r) => {
        const [px, , pz] = dungeonToRealm(p[0], p[1], p[2]);
        const to = egClimbKeep(q, px - spec.x0, pz, r);
        return to ? [egToDungeon(spec, to[0], 0, to[1])[0], egToDungeon(spec, to[0], 0, to[1])[2]] : null;
      },
    };
  }
  if (q.t === 'hero') {
    const fi = egHeroFloorAt(q.h, x, y, z), fy = fi >= 0 ? q.h.floors[fi].y : q.y, top = egHeroCeilAt(q.h, x, z, fy);
    return {
      centre: egToDungeon(spec, x, fy, z), radius: 1, ceilAbove: top === null ? Infinity : Math.max(0.5, top - fy - CLAMP_BODY_M), zone: q,
      clamp: (p, r) => {
        const [px, py, pz] = dungeonToRealm(p[0], p[1], p[2]);
        const to = egFragKeep(q, px - spec.x0, pz, r, spec, py);
        return to ? [egToDungeon(spec, to[0], 0, to[1])[0], egToDungeon(spec, to[0], 0, to[1])[2]] : null;
      },
    };
  }
  const c = egToDungeon(spec, q.x, q.y, q.t === 'passage' ? (q.z0 + q.z1) / 2 : q.z);
  return {
    centre: c, radius: 1, ceilAbove: Math.max(0.5, q.ceil - q.y - CLAMP_BODY_M), zone: q,
    clamp: (p, r) => {
      const [px, , pz] = dungeonToRealm(p[0], p[1], p[2]);
      const to = egFragKeep(q, px - spec.x0, pz, r, spec);
      return to ? [egToDungeon(spec, to[0], 0, to[1])[0], egToDungeon(spec, to[0], 0, to[1])[2]] : null;
    },
  };
}

export const EG_SHAFT_LEDGE_M = 0.5;
export const EG_SHAFT_WAY = Object.freeze([0, 1]);
/**
 * @param {any} spec
 * @param {number[]} pos
 */
export function egShaftLedgeAt(spec, pos) {
  if (!spec || !Array.isArray(pos)) return null;
  const [rx, y, z] = dungeonToRealm(pos[0], pos[1], pos[2]);
  const q = egFragZoneAt(egFragZones(spec), rx - spec.x0, y, z);
  return q?.shaft && z < q.zB && y >= q.yB + EG_SHAFT_LEDGE_M ? EG_SHAFT_WAY : null;
}
