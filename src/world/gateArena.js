// @ts-check
import { COURT_CENTRE, COURT_R, BOSS_REACH_R, COURTS, COURTS_HIS, WALKS, WALK_HALF_W, WALK_LEAD_MS, WALK_FORM_MS, clampToFloor, nightPlan, PLAN_PLAIN } from '../net/gateBrain.js';
import { faces, spike, GATE_ARCHIVE, GATE_STONE_RECORD, ARCH_Y0 } from './gateModel.js';
import { gateYaw, gatePortentsOf } from '../net/gateLaw.js';
import { lightList, packLight, copyLights } from '../render/lightId.js';

export const COURT_ARCHIVE = 38111;
export const COURT_FLOOR_RECORD = 0;
export const COURT_RUNE_RECORD = 1;
export const COURT_LAVA_RECORD = 2;

// Classic block names are eight characters plus `.RDB`, so this name never collides with one.
export const GATE_ARENA_BLOCK = 'GATECOURT.RDB';
// Far past every classic block index, since BLOCKS.BSA holds under 1,300 blocks.
export const GATE_ARENA_BLOCK_INDEX = 900000;
// Above every classic location record id.
export const GATE_ARENA_LOCATION_ID = 0x7ffff000;
// Must equal `RDB_SIDE` in world/rdbLayout.js.
export const GATE_BLOCK_SIDE = 51.2;
const UNITS_PER_M = 40;

export const ARRIVE_Z = COURT_R - 4;
export const WAY_IN_Z = COURT_R - 0.6;
export const planOfDay = (day) => (Number.isSafeInteger(day) ? nightPlan(gatePortentsOf(day)) : PLAN_PLAIN);
export function arrivalOf(plan = PLAN_PLAIN) {
  const [x, z] = COURTS[plan.root] ?? COURTS[0];
  return { at: [x, z + ARRIVE_Z], wayIn: [x, z + WAY_IN_Z] };
}
export const EXIT_HALF_W = 2.2;
export const EXIT_H = 4.6;
export const FLOOR_SIDES = 48;
export const FLOOR_SKIRT = 3;
export const FLOOR_TILE_M = 6;
export const RUNE_HALF_W = 0.45;
export const SPIRES = 10;
export const BRAZIERS = 6;
export const RIM_OUT = COURT_R + 2.2;
export const LAVA_Y = -36;
export const ROOT_SIDES = 12;
export const ROOT_FOOT_R = 5;
export const COURT_FOG = Object.freeze({ mode: 'exp', density: 0.009, color: Object.freeze([0.32, 0.05, 0.02]) });
export const COURT_TEXT = Object.freeze({
  wayHome: 'The way back to Tamriel',
  noRest: 'You cannot rest in the Deadlands.',
  noSave: 'You cannot save in the Deadlands.',
  noMap: 'You cannot map the Deadlands.',
  noMark: 'You cannot set a Mark in the Deadlands.',
  noCompanions: 'Your companions cannot follow you into the Deadlands.',
  castOut: 'You are cast out of the Burning Court.',
  collapse: 'The Burning Court collapses.',
  lost: 'The way to the Burning Court is lost.',
  noUnstuck: 'You cannot find a way free in the Deadlands.',
  portal: 'The way home tears open where he fell.',
});
export const BRAZIER_COLOR = Object.freeze([1.0, 0.45, 0.16]);
export const BRAZIER_RANGE = 14;

export const courtToDungeon = (x, y, z) => [COURT_CENTRE[0] + x, COURT_CENTRE[1] + y, COURT_CENTRE[2] + z];

/** @param {{day: number, near?: string, regionIndex?: number, regionName?: string, climate?: {worldClimate: number, climateType: number}, landing?: object|null}} g */
export function gateArenaLocation({ day, near = '', regionIndex = -1, regionName = '', climate = { worldClimate: 231, climateType: 2 }, landing = null }) {
  return {
    name: 'The Burning Court', regionIndex, regionName, locationIndex: -1, hasDungeon: true,
    climate: { worldClimate: climate.worldClimate, climateType: climate.climateType },
    mapTableData: { mapId: 0, locationType: -1, dungeonType: 0, longitude: 0, latitude: 0 },
    exterior: { exteriorData: { locationId: GATE_ARENA_LOCATION_ID } },
    dungeon: {
      recordElement: { header: { locationId: GATE_ARENA_LOCATION_ID, unknown: 0 } },
      blocks: [{ x: 0, z: 0, blockName: GATE_ARENA_BLOCK, isStartingBlock: true, blockIndex: 0, blockNumber: 0, blockNumberStartIndexBitfield: 0 }],
    },
    gate: day, gateNear: near, gateAt: landing,
  };
}

export const isGateArena = (loc) => Number.isSafeInteger(loc?.gate) && loc?.dungeon?.recordElement?.header?.locationId === GATE_ARENA_LOCATION_ID;

// The marker's flat resource has soundIndex 0 and magnitude 0 because rdbLayout.js reads the water and castle flags
// off the first start marker.
export function gateArenaBlock(day = null) {
  const a = arrivalOf(planOfDay(day)).at;
  const [x, , z] = courtToDungeon(a[0], 0, a[1]);
  const marker = {
    type: 0x03, position: 1, index: 0,
    xPos: Math.round(x * UNITS_PER_M), yPos: 0, zPos: Math.round(z * UNITS_PER_M),
    resources: { flatResource: { textureArchive: 199, textureRecord: 10, flags: 0, magnitude: 0, soundIndex: 0, factionOrMobileId: 0, nextObjectOffset: -1, action: 0, position: 0 } },
  };
  return { name: GATE_ARENA_BLOCK, position: 0, rdbBlock: { modelReferenceList: [], objectRootList: [{ rdbObjects: [marker] }] } };
}

/** @param {{getBlockIndex(name: string): number, getBlock(i: number): any}|null} real */
export function gateArenaBlocks(real, day = null) {
  const block = gateArenaBlock(day);
  return {
    getBlockIndex: (name) => (name === GATE_ARENA_BLOCK ? GATE_ARENA_BLOCK_INDEX : real ? real.getBlockIndex(name) : -1),
    getBlock: (i) => (i === GATE_ARENA_BLOCK_INDEX ? block : real ? real.getBlock(i) : null),
  };
}

export function courtOpenings(k, plan = PLAN_PLAIN) {
  const out = [];
  for (const i of plan.walks) {
    const w = WALKS[i];
    if (w.a === k) out.push(Math.atan2(w.uz, w.ux));
    if (w.b === k) out.push(Math.atan2(-w.uz, -w.ux));
  }
  if (k === 0 || k === plan.root) out.push(Math.PI / 2);
  return out;
}
const angleOff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const SPIRE_CLEAR = 0.3, BRAZIER_CLEAR = 0.16, BRIDGE_CLEAR = 0.35;
const clearOf = (k, a, w, plan = PLAN_PLAIN) => courtOpenings(k, plan).every((o, i, all) => angleOff(a, o) > ((k === 0 || k === plan.root) && i === all.length - 1 ? BRIDGE_CLEAR : w));
export const SPIRE_BASE_W = 1.6;
export function courtSpireAxes(k, plan = PLAN_PLAIN) {
  const key = `${k}|${plan.key}`;
  if (_spireAxes.has(key)) return _spireAxes.get(key);
  const [ox, oz] = COURTS[k] ?? COURTS[0], out = [];
  for (let i = 0; i < SPIRES; i++) {
    const a = ((i + 0.5) / SPIRES) * Math.PI * 2;
    if (!clearOf(k, a, SPIRE_CLEAR, plan)) continue;
    const r = RIM_OUT + 1.5 + (i % 3) * 0.8;
    out.push(Object.freeze({ i, b: Object.freeze([ox + Math.cos(a) * r, -14, oz + Math.sin(a) * r]), t: Object.freeze([ox + Math.cos(a) * (r + 3.5), 11 + (i % 4) * 2.5, oz + Math.sin(a) * (r + 3.5)]) }));
  }
  const axes = Object.freeze(out);
  _spireAxes.set(key, axes);
  return axes;
}
const _spireAxes = new Map();

function standCourtPiece(f, k, STONE, plan = PLAN_PLAIN) {
  const [ox, oz] = COURTS[k];
  const C = (x, y, z) => courtToDungeon(ox + x, y, oz + z);
  const uvFloor = (p) => [(p[0] - COURT_CENTRE[0]) / FLOOR_TILE_M, (p[2] - COURT_CENTRE[2]) / FLOOR_TILE_M];
  for (let i = 0; i < FLOOR_SIDES; i++) {
    const a0 = (i / FLOOR_SIDES) * Math.PI * 2, a1 = ((i + 1) / FLOOR_SIDES) * Math.PI * 2;
    const c = C(0, 0, 0), p0 = C(Math.cos(a0) * COURT_R, 0, Math.sin(a0) * COURT_R), p1 = C(Math.cos(a1) * COURT_R, 0, Math.sin(a1) * COURT_R);
    f.tri(COURT_FLOOR_RECORD, c, p1, p0, uvFloor(c), uvFloor(p1), uvFloor(p0));
    const b0 = [p0[0], -FLOOR_SKIRT, p0[2]], b1 = [p1[0], -FLOOR_SKIRT, p1[2]];
    f.quad(STONE, b0, p0, p1, b1, [0, 0], [0, 1], [1, 1], [1, 0]);
  }
  for (let i = 0; i < ROOT_SIDES; i++) {
    const a0 = (i / ROOT_SIDES) * Math.PI * 2, a1 = ((i + 1) / ROOT_SIDES) * Math.PI * 2;
    const t0 = C(Math.cos(a0) * COURT_R, -FLOOR_SKIRT, Math.sin(a0) * COURT_R), t1 = C(Math.cos(a1) * COURT_R, -FLOOR_SKIRT, Math.sin(a1) * COURT_R);
    const b0 = C(Math.cos(a0 + 0.2) * ROOT_FOOT_R, LAVA_Y - 2, Math.sin(a0 + 0.2) * ROOT_FOOT_R), b1 = C(Math.cos(a1 + 0.2) * ROOT_FOOT_R, LAVA_Y - 2, Math.sin(a1 + 0.2) * ROOT_FOOT_R);
    f.quad(STONE, b0, t0, t1, b1, [0, 0], [0, 8], [2, 8], [2, 0]);
    f.tri(STONE, t0, C(0, -FLOOR_SKIRT, 0), t1, [0, 0], [1, 1], [2, 0]);
  }
  const RING_SIDES = k < COURTS_HIS ? 96 : 0, rr0 = BOSS_REACH_R - RUNE_HALF_W, rr1 = BOSS_REACH_R + RUNE_HALF_W, y = 0.02;
  for (let i = 0; i < RING_SIDES; i++) {
    const a0 = (i / RING_SIDES) * Math.PI * 2, a1 = ((i + 1) / RING_SIDES) * Math.PI * 2;
    const u0 = (i / RING_SIDES) * 24, u1 = ((i + 1) / RING_SIDES) * 24;
    const i0 = C(Math.cos(a0) * rr0, y, Math.sin(a0) * rr0), i1 = C(Math.cos(a1) * rr0, y, Math.sin(a1) * rr0);
    const o0 = C(Math.cos(a0) * rr1, y, Math.sin(a0) * rr1), o1 = C(Math.cos(a1) * rr1, y, Math.sin(a1) * rr1);
    f.quad(COURT_RUNE_RECORD, i0, i1, o1, o0, [u0, 0], [u1, 0], [u1, 1], [u0, 1]);
  }
  for (const sp of courtSpireAxes(k, plan)) spike(f, courtToDungeon(sp.b[0], sp.b[1], sp.b[2]), SPIRE_BASE_W, courtToDungeon(sp.t[0], sp.t[1], sp.t[2]));
  for (const [, p] of courtBraziers(k, plan)) {
    const top = courtToDungeon(p[0], 1.1, p[2]), foot = courtToDungeon(p[0], -10, p[2]);
    const R = 0.55, sides = 6;
    for (let j = 0; j < sides; j++) {
      const a0 = (j / sides) * Math.PI * 2, a1 = ((j + 1) / sides) * Math.PI * 2;
      const t0 = [top[0] + Math.cos(a0) * R, top[1], top[2] + Math.sin(a0) * R], t1 = [top[0] + Math.cos(a1) * R, top[1], top[2] + Math.sin(a1) * R];
      const f0 = [foot[0] + Math.cos(a0) * R, foot[1], foot[2] + Math.sin(a0) * R], f1 = [foot[0] + Math.cos(a1) * R, foot[1], foot[2] + Math.sin(a1) * R];
      f.quad(STONE, f0, t0, t1, f1, [0, 0], [0, 3], [0.3, 3], [0.3, 0]);
      f.tri(COURT_LAVA_RECORD, top, t1, t0, [0.5, 0.5], [0.5 + Math.cos(a1) * 0.1, 0.5 + Math.sin(a1) * 0.1], [0.5 + Math.cos(a0) * 0.1, 0.5 + Math.sin(a0) * 0.1]);
    }
  }
}

export function buildCourtModel(pt = null) {
  const plan = nightPlan(pt);
  const f = faces();
  const byArchive = new Map();
  const C = (x, y, z) => courtToDungeon(x, y, z);
  const STONE = GATE_STONE_RECORD + 1000;
  byArchive.set(STONE, [GATE_ARCHIVE, GATE_STONE_RECORD]);
  for (const rec of [COURT_FLOOR_RECORD, COURT_RUNE_RECORD, COURT_LAVA_RECORD]) byArchive.set(rec, [COURT_ARCHIVE, rec]);
  for (const k of plan.floors) standCourtPiece(f, k, STONE, plan);
  {
    const w = 3, z0 = COURT_R - 0.5, z1 = COURT_R + 9, t = 1.2;
    const q = (x, yy, z) => C(x, yy, z);
    const uv = (p) => [(p[0] - COURT_CENTRE[0]) / FLOOR_TILE_M, (p[2] - COURT_CENTRE[2]) / FLOOR_TILE_M];
    const tl = q(-w, 0, z0), tr = q(w, 0, z0), fr = q(w, 0, z1 - 1.5), fl = q(-w, 0, z1);
    f.quad(COURT_FLOOR_RECORD, tl, fl, fr, tr, uv(tl), uv(fl), uv(fr), uv(tr));
    const d = (p) => [p[0], p[1] - t, p[2]];
    f.quad(STONE, d(tl), tl, tr, d(tr), [0, 0], [0, 0.3], [1, 0.3], [1, 0]);
    f.quad(STONE, d(tr), tr, fr, d(fr), [0, 0], [0, 0.3], [1, 0.3], [1, 0]);
    f.quad(STONE, d(fr), fr, fl, d(fl), [0, 0], [0, 0.3], [1, 0.3], [1, 0]);
    f.quad(STONE, d(fl), fl, tl, d(tl), [0, 0], [0, 0.3], [1, 0.3], [1, 0]);
  }
  return packFaces(f, byArchive);
}

function packFaces(f, byArchive) {
  const recs = [...f.byRec.keys()].sort((x, yy) => x - yy);
  const count = recs.reduce((n, r) => n + f.byRec.get(r).p.length / 3, 0);
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), uvs = new Float32Array(count * 2);
  // The renderer takes only 32-bit indices, and a Uint16Array draws nothing.
  const indices = new Uint32Array(count);
  const subMeshes = [];
  let v = 0;
  for (const rec of recs) {
    const g = f.byRec.get(rec);
    const n = g.p.length / 3;
    positions.set(g.p, v * 3); normals.set(g.n, v * 3); uvs.set(g.uv, v * 2);
    for (let i = 0; i < n; i++) indices[v + i] = v + i;
    const [textureArchive, textureRecord] = byArchive.get(rec);
    subMeshes.push({ textureArchive, textureRecord, startIndex: v, primitiveCount: n / 3 });
    v += n;
  }
  return { positions, normals, uvs, indices, subMeshes };
}

export function courtBraziers(k = 0, plan = PLAN_PLAIN) {
  const out = [];
  const [ox, oz] = COURTS[k] ?? COURTS[0];
  for (let i = 0; i < BRAZIERS; i++) {
    const a = (i / BRAZIERS) * Math.PI * 2 - Math.PI / 2;
    if (!clearOf(k, a, BRAZIER_CLEAR, plan)) continue;
    out.push([k * BRAZIERS + i, [ox + Math.cos(a) * (COURT_R + 1.2), 0, oz + Math.sin(a) * (COURT_R + 1.2)]]);
  }
  return out;
}
export function allCourtBraziers(plan = PLAN_PLAIN) {
  let b = _allBraziers.get(plan.key);
  if (!b) { b = Object.freeze(plan.floors.flatMap((k) => courtBraziers(k, plan))); _allBraziers.set(plan.key, b); }
  return b;
}
const _allBraziers = new Map();

export function courtLights(plan = PLAN_PLAIN) {
  let L = _courtLights.get(plan.key);
  if (!L) { L = Object.freeze(allCourtBraziers(plan).map(([, p]) => { const [x, y, z] = courtToDungeon(p[0], 2.2, p[2]); return Object.freeze({ x, y, z, range: BRAZIER_RANGE, color: BRAZIER_COLOR }); })); _courtLights.set(plan.key, L); }
  return L;
}
const _courtLights = new Map();
/**
 * Sorted nearest first because the renderer has sixteen light slots and its cap drops lights from the end of the
 * list.
 * @param {ArrayLike<number>|null} eye
 */
export function courtLightsNear(eye, plan = PLAN_PLAIN) {
  let L = _courtLightsNear.get(plan.key);
  if (!L) { L = [...courtLights(plan)]; _courtLightsNear.set(plan.key, L); }
  if (eye) L.sort((a, b) => ((a.x - eye[0]) ** 2 + (a.z - eye[2]) ** 2) - ((b.x - eye[0]) ** 2 + (b.z - eye[2]) ** 2));
  return L;
}
const _courtLightsNear = new Map();

/**
 * Braziers go after the existing lights so the player's lights keep their slots and masks, and the renderer cap
 * drops a brazier first.
 * @param {{ data: Float32Array & { carried?: Uint8Array }, colors: Float32Array }} lit
 * @param {Array<{ x: number, y: number, z: number, range: number, color: readonly number[], carried?: boolean }>} lights
 */
export function withCourtLights(lit, lights) {
  const n = lit.data.length / 4, k = lights.length;
  const data = lightList(n + k);
  const colors = new Float32Array((n + k) * 3), carried = new Uint8Array(n + k);
  copyLights(data, 0, lit.data, 0, n);
  colors.set(lit.colors.subarray(0, n * 3));
  if (lit.data.carried) carried.set(lit.data.carried.subarray(0, n));
  lights.forEach((l, i) => { packLight(data, n + i, l); colors.set(l.color, (n + i) * 3); if (l.carried) carried[n + i] = 1; });
  data.carried = carried;
  return { data, colors, carried };
}

export function courtFloorTris(pt = null) {
  const out = [], plan = nightPlan(pt);
  const C = (x, z) => courtToDungeon(x, 0, z);
  for (const [ox, oz] of plan.floors.map((k) => COURTS[k])) {
    for (let k = 0; k < FLOOR_SIDES; k++) {
      const a0 = (k / FLOOR_SIDES) * Math.PI * 2, a1 = ((k + 1) / FLOOR_SIDES) * Math.PI * 2;
      out.push(...C(ox, oz), ...C(ox + Math.cos(a1) * COURT_R, oz + Math.sin(a1) * COURT_R), ...C(ox + Math.cos(a0) * COURT_R, oz + Math.sin(a0) * COURT_R));
    }
  }
  for (const w of plan.walks.map((i) => WALKS[i])) {
    const nx = w.uz, nz = -w.ux, h = WALK_HALF_W;
    const a0 = C(w.ax + nx * h, w.az + nz * h), a1 = C(w.ax - nx * h, w.az - nz * h), b0 = C(w.bx + nx * h, w.bz + nz * h), b1 = C(w.bx - nx * h, w.bz - nz * h);
    out.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1);
  }
  return new Float32Array(out);
}

export const COURT_DOOR_DEPTH = 0.3;
// The press box is the fire's own opening, because a press from inside a padded door box counts only where a
// collider meets the ray, and fire has no collider.
export function courtDoorAabb(door) {
  const m = door.matrix;
  const c = [m[12] + door.centre.x, m[13] + door.centre.y, m[14] + door.centre.z];
  const faceZ = Math.abs(door.normal.z) >= Math.abs(door.normal.x);
  const hx = faceZ ? EXIT_HALF_W : COURT_DOOR_DEPTH, hz = faceZ ? COURT_DOOR_DEPTH : EXIT_HALF_W, hy = EXIT_H / 2;
  return { min: [c[0] - hx, c[1] - hy, c[2] - hz], max: [c[0] + hx, c[1] + hy, c[2] + hz] };
}

export const courtRing = () => ({ centre: [...COURT_CENTRE], radius: COURT_R });
/**
 * @param {ReadonlyArray<number>} xa
 * @param {number} now
 */
export function courtArena(xa, now, day = null) {
  const [cx, , cz] = COURT_CENTRE;
  const a = {
    centre: [...COURT_CENTRE], radius: COURT_R, xa, now, day,
    clamp: (pos, inset = 0) => { const to = clampToFloor(pos[0] - cx, pos[2] - cz, a.xa, a.now, inset, planOfDay(a.day)); return to ? [to[0] + cx, to[1] + cz] : null; },
  };
  return a;
}
export function courtArenaAt(a, xa, now, day) {
  a.xa = xa; a.now = now; a.day = day;
  return a;
}

export const SLAB_LEN_M = 2.3;
export const SLAB_THICK_M = 1.2;
export const SLAB_ROOT_M = 7;
export const SLAB_RISE_MS = 1500;
export function walkSlabs(pt = null) {
  const plan = nightPlan(pt);
  if (_slabs.has(plan.key)) return _slabs.get(plan.key);
  const out = [];
  for (const w of plan.walks.map((i) => WALKS[i])) {
    const n = Math.max(1, Math.ceil(w.len / SLAB_LEN_M)), len = w.len / n;
    for (let j = 0; j < n; j++) {
      const t = (j + 0.5) * len;
      out.push(Object.freeze({ walk: w.k, j, n, x: w.ax + w.ux * t, z: w.az + w.uz * t, yaw: Math.atan2(w.ux, w.uz), len }));
    }
  }
  const slabs = Object.freeze(out);
  _slabs.set(plan.key, slabs);
  return slabs;
}
const _slabs = new Map();
// Uses the same timing as `walkFormed` in gateBrain.js, so each slab is whole before the floor reaches it.
export function slabRise(slab, xa, now) {
  const at = Array.isArray(xa) ? xa[slab.walk] : null;
  if (!Number.isFinite(at)) return 0;
  const done = at + WALK_LEAD_MS + (slab.j / slab.n) * WALK_FORM_MS, from = Math.max(at, done - SLAB_RISE_MS);
  return done <= from ? (now >= done ? 1 : 0) : Math.max(0, Math.min(1, (now - from) / (done - from)));
}
/**
 * @param {ReturnType<typeof walkSlabs>[number]} slab
 * @param {ReadonlyArray<number>} xa
 * @param {number} now
 */
export function slabMatrix(slab, xa, now, out = new Float32Array(16)) {
  const p = slabRise(slab, xa, now);
  const sm = (x) => x * x * (3 - 2 * x);
  const e = p >= 1 ? 1 : p < 0.8 ? 1.04 * sm(p / 0.8) : 1.04 - 0.04 * sm((p - 0.8) / 0.2);
  const y = p <= 0 ? LAVA_Y - SLAB_ROOT_M - 4 : LAVA_Y + (0 - LAVA_Y) * e;
  const tilt = p >= 1 ? 0 : 0.18 * (1 - p) * Math.sin(slab.j * 1.7 + 0.5);
  const cy = Math.cos(slab.yaw), sy = Math.sin(slab.yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
  const k = slab.len / SLAB_LEN_M;
  const [px, , pz] = courtToDungeon(slab.x, 0, slab.z);
  out[0] = cy * ct; out[1] = st; out[2] = -sy * ct; out[3] = 0;
  out[4] = -cy * st; out[5] = ct; out[6] = sy * st; out[7] = 0;
  out[8] = sy * k; out[9] = 0; out[10] = cy * k; out[11] = 0;
  out[12] = px; out[13] = y; out[14] = pz; out[15] = 1;
  return out;
}
export function buildWalkSlabModel() {
  const f = faces();
  const STONE = GATE_STONE_RECORD + 1000;
  const byArchive = new Map([[STONE, [GATE_ARCHIVE, GATE_STONE_RECORD]], [COURT_FLOOR_RECORD, [COURT_ARCHIVE, COURT_FLOOR_RECORD]]]);
  const hw = WALK_HALF_W, hl = SLAB_LEN_M / 2 - 0.04, t = SLAB_THICK_M;
  const tl = [-hw, 0, -hl], tr = [hw, 0, -hl], br = [hw, 0, hl], bl = [-hw, 0, hl];
  const uv = (p) => [p[0] / FLOOR_TILE_M, p[2] / FLOOR_TILE_M];
  f.quad(COURT_FLOOR_RECORD, tl, bl, br, tr, uv(tl), uv(bl), uv(br), uv(tr));
  const d = (p) => [p[0], p[1] - t, p[2]];
  f.quad(STONE, d(tl), tl, tr, d(tr), [0, 0], [0, 0.3], [1, 0.3], [1, 0]);
  f.quad(STONE, d(tr), tr, br, d(br), [0, 0], [0, 0.3], [0.4, 0.3], [0.4, 0]);
  f.quad(STONE, d(br), br, bl, d(bl), [0, 0], [0, 0.3], [1, 0.3], [1, 0]);
  f.quad(STONE, d(bl), bl, tl, d(tl), [0, 0], [0, 0.3], [0.4, 0.3], [0.4, 0]);
  const tip = [0.4, -t - SLAB_ROOT_M, 0.1], ring = [d(tl), d(tr), d(br), d(bl)];
  for (let i = 0; i < 4; i++) f.tri(STONE, ring[(i + 1) % 4], ring[i], tip, [1, 0], [0, 0], [0.5, 3]);
  return packFaces(f, byArchive);
}

export const PORTAL_AFTER_MS = 2600;
export const PORTAL_RISE_MS = 1500;
export const PORTAL_CLOSE_MS = 1500;
export function portalFade(t, fellAt, endAt) {
  const rise = Math.min(1, Math.max(0, (t - fellAt - PORTAL_AFTER_MS) / PORTAL_RISE_MS));
  const close = Math.min(1, Math.max(0, (endAt - t) / PORTAL_CLOSE_MS));
  return Math.min(rise, close);
}
export const WAY_IN_HOLD_MS = 3000;
export const WAY_IN_OPEN_MS = 600;
export const WAY_IN_NEAR_M = 6;
// Must stay well above the 5 s interval at which the relay sends full state while a fighter is in the court.
export const COURT_SILENT_MS = 20000;
export const COURT_DOOR_WAIT_MS = 60000;
export const COURT_FRAME_GAP_MS = 2000;
export function wayInStep(open, dtMs, held) {
  const o = Math.max(0, Math.min(1, Number.isFinite(open) ? open : 0)), dt = Math.max(0, Number.isFinite(dtMs) ? dtMs : 0);
  return held ? Math.min(1, o + dt / WAY_IN_OPEN_MS) : Math.max(0, o - dt / PORTAL_CLOSE_MS);
}
export const PORTAL_DROP = ARCH_Y0;
export function portalDoor(at) {
  const [x, y, z] = courtToDungeon(at[0], 0, at[1]);
  return {
    matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1],
    centre: { x: 0, y: EXIT_H / 2, z: 0 },
    size: { x: EXIT_HALF_W * 2, y: EXIT_H, z: 1 },
    normal: { x: 0, y: 0, z: 1 },
    court: true,
  };
}

export const GATE_LANDING_M = 10;
/**
 * @param {{day?: number, yaw?: number, px: number, py: number, spot: number[]}} g
 * @param {{pixelTranslation: (px: number, py: number) => number[], heightAt: (x: number, z: number) => number}} at
 */
export function gateLandingFor(g, { pixelTranslation, heightAt }, out = GATE_LANDING_M) {
  if (!g || !Array.isArray(g.spot)) return null;
  const yaw = Number.isSafeInteger(g.day) ? gateYaw(g.day) : Number.isFinite(g.yaw) ? g.yaw : null;
  if (yaw == null) return null;
  const t = pixelTranslation(g.px, g.py);
  const dx = Math.sin(yaw), dz = Math.cos(yaw);
  const x = t[0] + g.spot[0] + dx * out, z = t[2] + g.spot[1] + dz * out;
  const y = heightAt(x, z);
  return Number.isFinite(y) ? { pos: [x, y, z], normal: [dx, 0, dz] } : null;
}
