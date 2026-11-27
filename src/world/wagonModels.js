// @ts-check
import { WAGON_ARCHIVE, TEX, WAGON_TILE, BANDS, wagonArt, CARAVAN_SIDE_WINDOW_U } from './wagonArt.js';
import { dfLook, lookSeed } from './dfLook.js';
import { paintedReplacement, studioLanded } from '../systems/studioArt/studioArt.js';
import { toColor32 } from '../formats/color32Order.js';
import { MeshBench, prism, box, planarUv, sub, add, dot } from './galleonMesh.js';
import { benchPart } from './galleonModel.js';
import { pointsOf, boxOfPoints } from './shipKit.js';
import { quatAngleAxis, quatRotate, quatMultiply } from './quat.js';
import { NORMAL_GROUND_OFFSET } from '../travel/horseCartLaw.js';
import { CARGO_DEFINITIONS } from '../travel/wagon41214.js';
import { WAGON_KINDS, activeWagonKind, activeWagonItem } from '../travel/wagonKinds.js';
import { wagonLookOf } from '../travel/wagonLooks.js';
import { riddenHorseLook } from '../travel/horseCoats.js';
import { mwViewHorseRig } from '../player/mwView.js';
import { SEATED_HIP_HEIGHT } from '../player/seatPose.js';

export const WAGON_MODEL_URLS = Object.freeze({
  cart: new URL('../assets/wagons/cart.json', import.meta.url).href,
  openWagon: new URL('../assets/wagons/openWagon.json', import.meta.url).href,
  caravan: new URL('../assets/wagons/caravan.json', import.meta.url).href,
});

export const LIFT = NORMAL_GROUND_OFFSET;

export const MEASURED = Object.freeze({
  cart: Object.freeze({ axleY: 0.5445, floorY: 0.69, innerX: 1.0543, sideX: 1.1589, bedZ: Object.freeze([-0.37, 2.2]), frontZ: 3.14, bottomFront: Object.freeze([0.1452, 2.1778]), bottomBack: Object.freeze([0.6201, -0.4852]) }),
  openWagon: Object.freeze({ axleY: 0.7811, floorY: 1.0142, innerX: 1.2, sideX: 1.36, bedZ: Object.freeze([-0.6, 5.0]), frontZ: 5.65, frontAxle: Object.freeze([0, 0.824, 3.8659]), bench: Object.freeze({ y: 1.54, z: 5.28 }) }),
  caravan: Object.freeze({ axleY: 0.7811, floorY: 0.9425, innerX: 1.2, sideX: 1.36, bedZ: Object.freeze([-0.7077, 5.1164]), frontZ: 6.25, frontAxle: Object.freeze([0, 0.824, 3.8659]), rearZ: -0.7077, endTopY: 3.5166, bench: Object.freeze({ y: 2.476, z: 5.49 }) }),
});

export const CART_REST_PITCH_DEG = (() => {
  const { bottomFront: f, bottomBack: b } = MEASURED.cart;
  return (Math.atan2(b[0] - f[0], f[1] - b[1]) * 180) / Math.PI;
})();

const CART_LEVEL = quatAngleAxis(-CART_REST_PITCH_DEG, [1, 0, 0]);
/**
 * @param {number[]} p
 * @param {number} [about]
 */
export function cartLevel(p, about = MEASURED.cart.axleY) {
  const r = quatRotate(CART_LEVEL, [p[0], p[1] - about, p[2]]);
  return [r[0], r[1] + about, r[2]];
}

export function caravanSideU(p, n, tile = WAGON_TILE.caravanSide[0]) {
  const m = MEASURED.caravan, mid = (m.rearZ + m.bedZ[1]) / 2;
  return planarUv([p[0], p[1], p[2] - mid], n, [tile, 1])[0] + 0.5 + CARAVAN_SIDE_WINDOW_U;
}

const keyOf = (rec) => Object.keys(TEX).find((k) => TEX[k] === rec);
const wheelUv = (pivot, R) => (p) => [0.5 + (p[2] - pivot[2]) / (2 * R), 0.5 + (p[1] - pivot[1]) / (2 * R)];
const endUv = (sign) => (p) => {
  const m = MEASURED.caravan;
  return [0.5 + (sign * p[0]) / (2 * m.sideX), (p[1] - m.floorY) / (m.endTopY - m.floorY)];
};

export function wagonFaceSkin(kind, role, n, c, pivot = null, R = 1) {
  if (kind === 'cart' && !role.startsWith('wheel')) {
    const s = layFace(kind, role, cartLevel(n, 0), cartLevel(c));
    return 'uv' in s ? { rec: s.rec, uv: (p) => s.uv(cartLevel(p)) } : s;
  }
  return layFace(kind, role, n, c, pivot, R);
}

function layFace(kind, role, n, c, pivot = null, R = 1) {
  const tiled = (rec, key = keyOf(rec)) => ({ rec, uv: (p) => planarUv(p, n, WAGON_TILE[key]) });
  const banded = (name) => ({ band: BANDS[name], u: name === 'caravanSide' ? (p) => caravanSideU(p, n) : (p) => planarUv(p, n, [WAGON_TILE[name][0], 1])[0] });
  const up = n[1] > 0.7, down = n[1] < -0.7, side = Math.abs(n[0]) > 0.7, end = Math.abs(n[2]) > 0.7;
  if (role.startsWith('wheel')) return side ? { rec: TEX.wheel, uv: wheelUv(pivot ?? c, R) } : tiled(TEX.tyre);
  if (role.startsWith('axle') || role.startsWith('shaft')) return tiled(TEX.beam);
  if (role === 'bench' || role === 'step') return tiled(up ? TEX.bench : TEX.beam);
  const m = MEASURED[kind];
  const inward = side && dot(n, sub([0, c[1], c[2]], c)) > 0;
  if (kind === 'cart') {
    if (down) return tiled(TEX.beam);
    if (up && c[1] < 1) return tiled(TEX.floor);
    if (up) return tiled(TEX.beam);
    return tiled(inward || (end && c[2] < 0 && n[2] > 0) ? TEX.inner : TEX.side);
  }
  if (kind === 'openWagon') {
    if (down && c[1] < m.floorY + 0.1) return tiled(TEX.beam);
    if (up && c[1] < m.floorY + 0.1) return tiled(TEX.floor);
    if (Math.abs(n[0]) > 0.95 && !inward && c[1] < 2.6) return banded('openSide');
    if (inward || down || (side && c[1] >= 2.6)) return tiled(c[1] < 1.62 && inward ? TEX.inner : TEX.tiltInner);
    if (end) return tiled(c[1] < 2.6 ? TEX.side : TEX.tilt);
    return tiled(TEX.tilt);
  }
  if (down) return tiled(TEX.beam);
  if (end && c[1] > m.floorY) return { rec: n[2] > 0 ? TEX.caravanFront : TEX.caravanRear, uv: endUv(n[2] > 0 ? -1 : 1) };
  if (Math.abs(n[0]) > 0.95) return banded('caravanSide');
  return tiled(TEX.caravanRoof);
}

export function rendererModelOf(g, name = 'Wagon') {
  if (!g) return null;
  const subMeshes = g.subMeshes.map((sm, k) => ({ textureArchive: g.slots[k].archive, textureRecord: g.slots[k].record, startIndex: sm.startIndex, primitiveCount: sm.primitiveCount }));
  return { name, positions: g.positions, normals: g.normals, uvs: g.uvs, indices: g.indices, subMeshes, doors: [] };
}
function lifted(g, dy = -LIFT) {
  if (!g) return g;
  for (let i = 1; i < g.positions.length; i += 3) g.positions[i] += dy;
  g.aabb.center[1] += dy;
  return g;
}

function poleGeometry(bench, kind) {
  const ax = MEASURED[kind].frontAxle, hitch = WAGON_KINDS[kind].hitch;
  const tip = [0, TEAM.yokeY, hitch + TEAM.poleTip], tree = TEAM.tree, tz = hitch - tree.back;
  prism(bench, TEX.beam, [0, ax[1], ax[2]], tip, 0.07, 0.05, 6, { tileV: WAGON_TILE.beam[1] });
  box(bench, TEX.beam, [0, tip[1], tip[2]], [TEAM.side - TEAM.collar[0] - 0.05, 0.025, 0.025], { tile: WAGON_TILE.beam });
  box(bench, TEX.beam, [0, tree.y, tz], [TEAM.side, 0.03, 0.03], { tile: WAGON_TILE.beam });
  for (const s of [-1, 1]) box(bench, TEX.beam, [s * TEAM.side, tree.y, tz - 0.04], [tree.half, 0.025, 0.025], { tile: WAGON_TILE.beam });
  for (const s of [-1, 1]) prism(bench, TEX.beam, [s * 0.7, ax[1], ax[2] - 0.05], [0, 0.88, ax[2] + 1.0], 0.035, 0.035, 5, { tileV: WAGON_TILE.beam[1] });
  prism(bench, TEX.iron, [0, tip[1], tip[2]], [0, tip[1], tip[2] + 0.2], 0.04, 0.025, 6);
}

export const TEAM = Object.freeze({
  side: 0.65,
  collar: Object.freeze([0.24, 1.35, 0.75]),
  bit: Object.freeze([0, 1.7, 1.3]),
  tree: Object.freeze({ back: 1.55, y: 0.92, half: 0.3 }),
  cartTrace: Object.freeze([0.57, 0.62, 2.2]),
  poleTip: 0.5, yokeY: 1.15,
});
export const teamSidesOf = (kind) => (WAGON_KINDS[kind]?.horses === 2 ? [-TEAM.side, TEAM.side] : [0]);
export function driverSeatFor(kind) {
  const b = MEASURED[kind]?.bench;
  if (!b) return null;
  return Object.freeze({ feet: Object.freeze([0, b.y - SEATED_HIP_HEIGHT - LIFT, b.z]), yaw: 0, top: DRIVER_HANDS_TOP });
}
export const DRIVER_HANDS_TOP = SEATED_HIP_HEIGHT + 0.11;
export const SHELL_CLEAR_M = 0.35;
export function traceRootsOf(kind) {
  if (!WAGON_KINDS[kind]) return [];
  const out = [];
  if (kind === 'cart') {
    const [x, y, z] = TEAM.cartTrace;
    for (const s of [-1, 1]) out.push(Object.freeze([0, s, Object.freeze(fromLevel(kind, [s * x, y - LIFT, z])), false]));
    return out;
  }
  const hitch = WAGON_KINDS[kind].hitch, t = TEAM.tree;
  teamSidesOf(kind).forEach((hx, i) => { for (const s of [-1, 1]) out.push(Object.freeze([i, s, Object.freeze([hx + s * t.half, t.y - LIFT, hitch - t.back - 0.04]), true])); });
  return out;
}

const rollRadius = (part, pivot) => { let lo = Infinity; for (let i = 1; i < part.positions.length; i += 3) lo = Math.min(lo, part.positions[i]); return pivot[1] - lo; };

export const BOGIE_ROLES = Object.freeze(['axleFront']);

/**
 * @param {any} bake
 * @param {number[]} kingpin
 */
export function steerLimitOf(bake, kingpin) {
  const walls = bake.parts.filter((p) => !p.role.startsWith('wheel') && !BOGIE_ROLES.includes(p.role)).map((p) => boxOfPoints(pointsOf(p)));
  let lock = 90;
  for (const wheel of bake.parts.filter((p) => p.role.startsWith('wheelFront'))) {
    const pivot = wheel.origin, R = rollRadius(wheel, pivot), dz = pivot[2] - kingpin[2];
    const inner = Math.min(...pointsOf(wheel).map((q) => Math.abs(q[0])));
    for (const { min: lo, max: hi } of walls) {
      const wall = Math.max(Math.abs(lo[0]), Math.abs(hi[0]));
      if (wall >= inner || lo[1] >= pivot[1] + R) continue;
      const c = lo[1] > pivot[1] ? Math.sqrt(R * R - (lo[1] - pivot[1]) ** 2) : R;
      for (const [reach, side] of [[c + dz, 1], [c - dz, -1]]) {
        const a = Math.acos(wall / Math.hypot(inner, reach)) - Math.atan2(reach, inner);
        const z = kingpin[2] + side * (inner * Math.sin(a) + reach * Math.cos(a));
        if (z >= lo[2] && z <= hi[2]) lock = Math.min(lock, (a * 180) / Math.PI);
      }
    }
  }
  return lock;
}

/**
 * @param {any} bake
 */
export function wagonGeometry(bake) {
  const kind = bake?.wagon;
  if (!WAGON_KINDS[kind] || !Array.isArray(bake.parts)) throw new Error(`no wagon's bake (${kind})`);
  const statics = new MeshBench(WAGON_ARCHIVE);
  const front = kind !== 'cart' ? new MeshBench(WAGON_ARCHIVE) : null;
  const wheels = [];
  let radius = 0, rear = 0, rearZ = 0, kingpin = null, axleBox = null, shellBox = null;
  for (const part of bake.parts) {
    if (part.role.startsWith('wheel')) {
      const pivot = part.origin;
      const R = rollRadius(part, pivot);
      const bench = new MeshBench(WAGON_ARCHIVE);
      benchPart(bench, part, { offset: pivot, role: part.role, keep: null, skin: (role, n, c) => wagonFaceSkin(kind, role, n, c, pivot, R) });
      wheels.push({ role: part.role, geometry: bench.finish(), pivot: [pivot[0], pivot[1] - LIFT, pivot[2]], radius: R });
      if (part.role.startsWith('wheelRear')) { radius += R; rear++; rearZ += pivot[2] / 2; }
    } else if (front && BOGIE_ROLES.includes(part.role)) {
      benchPart(front, part, { offset: [0, 0, 0], role: part.role, keep: null, skin: (role, n, c) => wagonFaceSkin(kind, role, n, c) });
      kingpin = part.origin;
      axleBox = boxOfPoints(pointsOf(part));
    } else {
      benchPart(statics, part, { offset: [0, 0, 0], role: part.role, keep: null, skin: (role, n, c) => wagonFaceSkin(kind, role, n, c) });
      if (part.role === 'body' && MEASURED[kind]?.bench) shellBox = boxOfPoints(pointsOf(part));
    }
  }
  if (rear !== 2) throw new Error(`the ${kind} has ${rear} rear wheels`);
  if (front && !kingpin) throw new Error(`the ${kind} has no front axle`);
  if (front) poleGeometry(front, kind);
  const reach = axleBox ? { min: [axleBox.min[0], axleBox.min[1] - LIFT, axleBox.min[2]], max: [axleBox.max[0], axleBox.max[1] - LIFT, axleBox.max[2]] } : null;
  const bogie = front ? { geometry: lifted(front.finish()), kingpin: [kingpin[0], kingpin[1] - LIFT, kingpin[2]], wheelbase: kingpin[2] - rearZ, steerLimit: steerLimitOf(bake, kingpin), reach } : null;
  const shell = shellBox ? { min: [shellBox.min[0], shellBox.min[1] - LIFT, shellBox.min[2]], max: [shellBox.max[0], shellBox.max[1] - LIFT, shellBox.max[2]] } : null;
  return { kind, statics: lifted(statics.finish()), wheels, wheelRadius: radius / 2, bogie, shell };
}

function boundsOf(geo) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const take = (p, at) => { for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { const v = p[i + k] + at[k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; } };
  take(geo.statics.positions, [0, 0, 0]);
  if (geo.bogie?.reach) take([...geo.bogie.reach.min, ...geo.bogie.reach.max], [0, 0, 0]);
  for (const w of geo.wheels) take(w.geometry.positions, w.pivot);
  return { min, max, center: [0, 1, 2].map((k) => (min[k] + max[k]) / 2), size: [0, 1, 2].map((k) => max[k] - min[k]) };
}

function fromLevel(kind, p) {
  if (kind !== 'cart') return p;
  const pivotY = MEASURED.cart.axleY - LIFT;
  const q = quatAngleAxis(CART_REST_PITCH_DEG, [1, 0, 0]);
  const r = quatRotate(q, [p[0], p[1] - pivotY, p[2]]);
  return [r[0], r[1] + pivotY, r[2]];
}

export function cargoFor(kind) {
  if (kind === 'caravan') return [];
  const m = MEASURED[kind];
  const floor = m.floorY - LIFT, classicMid = -0.79, classicFloor = -0.0175;
  const [z0, z1] = kind === 'openWagon' ? [2.1, 4.6] : m.bedZ;
  const mid = (z0 + z1) / 2, stretch = kind === 'openWagon' ? 1.6 : 1.3;
  const tilt = kind === 'cart' ? quatAngleAxis(CART_REST_PITCH_DEG, [1, 0, 0]) : null;
  return CARGO_DEFINITIONS.map((d) => Object.freeze({
    threshold: d.threshold, modelId: d.modelId, scale: d.scale,
    position: fromLevel(kind, [d.position[0] * (m.innerX / 0.95), floor + (d.position[1] - classicFloor), mid + (d.position[2] - classicMid) * stretch]),
    rotation: tilt ? quatMultiply(tilt, d.rotation) : d.rotation,
  }));
}

export function seatsFor(kind) {
  const n = WAGON_KINDS[kind]?.seats ?? 0;
  if (!n) return [];
  const m = MEASURED[kind], y = m.floorY - LIFT, x = m.innerX - 0.38;
  const at = [[-x, 0.1, 90], [x, 0.1, -90], [-x, 1.2, 90], [x, 1.2, -90]];
  return at.slice(0, n).map(([sx, z, yaw]) => Object.freeze({ feet: Object.freeze([sx, y, z]), yaw }));
}

export function doorFor(kind) {
  if (kind !== 'caravan') return null;
  const m = MEASURED.caravan;
  return Object.freeze({ step: Object.freeze([0, -LIFT, m.rearZ - 1.1]), yaw: 180 });
}

export const RIG_READ_M = 4;
export const rigLengthOf = (kind, hitch = null) => { const k = WAGON_KINDS[kind] ? kind : 'cart'; return (Number.isFinite(hitch) && hitch > 0 ? hitch : WAGON_KINDS[k].hitch) + 1.3 + (k === 'cart' ? 0.57 : 0.8); };
export const rigGrowOf = (g, kind, hitch = null) => (g > 1 ? Math.max(1, g * Math.min(1, RIG_READ_M / rigLengthOf(kind, hitch))) : 1);

export function buildBakedWagonParts(geo, make = rendererModelOf) {
  const wheels = geo.wheels.map((w) => ({ role: w.role, model: make(w.geometry, `Wagon_${w.role}`), pivot: w.pivot, radius: w.radius, front: !!geo.bogie && w.role.startsWith('wheelFront') }));
  const rearLeft = wheels.find((w) => w.role === 'wheelRearLeft'), rearRight = wheels.find((w) => w.role === 'wheelRearRight');
  return {
    kind: geo.kind,
    body: make(geo.statics, `Wagon_${geo.kind}`), shaftLeft: null, shaftRight: null,
    wheelLeft: rearLeft.model, wheelRight: rearRight.model,
    wheelLeftPivot: rearLeft.pivot, wheelRightPivot: rearRight.pivot,
    wheels, wheelRadius: geo.wheelRadius,
    bounds: boundsOf(geo),
    hitchPitch: geo.kind === 'cart' ? CART_REST_PITCH_DEG : 0,
    axlePivot: [0, (rearLeft.pivot[1] + rearRight.pivot[1]) / 2, (rearLeft.pivot[2] + rearRight.pivot[2]) / 2],
    cargo: cargoFor(geo.kind), seats: seatsFor(geo.kind), door: doorFor(geo.kind), driver: driverSeatFor(geo.kind), traces: traceRootsOf(geo.kind), shell: geo.shell ?? null,
    bogie: geo.bogie ? { model: make(geo.bogie.geometry, `Wagon_${geo.kind}_bogie`), kingpin: geo.bogie.kingpin, wheelbase: geo.bogie.wheelbase, steerLimit: geo.bogie.steerLimit } : null,
  };
}

export function wagonIconModel(geo) {
  const parts = [geo.statics, ...(geo.bogie ? [geo.bogie.geometry] : []), ...geo.wheels.map((w) => ({ ...w.geometry, positions: w.geometry.positions.map((v, i) => v + w.pivot[i % 3]) }))];
  const groups = new Map();
  for (const g of parts) g.subMeshes.forEach((sm, k) => {
    const rec = g.slots[k].record;
    const out = groups.get(rec) ?? { p: [], n: [], uv: [] };
    for (let i = sm.startIndex; i < sm.startIndex + sm.primitiveCount * 3; i++) {
      const v = g.indices[i];
      out.p.push(g.positions[v * 3], g.positions[v * 3 + 1], g.positions[v * 3 + 2]);
      out.n.push(g.normals[v * 3], g.normals[v * 3 + 1], g.normals[v * 3 + 2]);
      out.uv.push(g.uvs[v * 2], g.uvs[v * 2 + 1]);
    }
    groups.set(rec, out);
  });
  const recs = [...groups.keys()].sort((a, b) => a - b);
  const positions = [], normals = [], uvs = [], indices = [], subMeshes = [];
  for (const rec of recs) {
    const g = groups.get(rec), start = indices.length, base = positions.length / 3;
    positions.push(...g.p); normals.push(...g.n); uvs.push(...g.uv);
    for (let i = 0; i < g.p.length / 3; i++) indices.push(base + i);
    subMeshes.push({ textureArchive: WAGON_ARCHIVE, textureRecord: rec, startIndex: start, primitiveCount: (indices.length - start) / 3 });
  }
  return { positions: Float32Array.from(positions), normals: Float32Array.from(normals), uvs: Float32Array.from(uvs), indices: Uint32Array.from(indices), subMeshes, doors: [] };
}

export function pitchedPoint(parts, p, pitch) {
  if (!pitch) return p;
  const a = parts.axlePivot, q = quatAngleAxis(-pitch, [1, 0, 0]);
  const r = quatRotate(q, sub(p, a));
  return add(r, a);
}

export function wagonPoolDeps(items, fetchFn = (u) => globalThis.fetch(u)) {
  const loads = new Map();
  return {
    wagonKind: () => activeWagonKind(items()) ?? 'cart',
    wagonLook: () => wagonLookOf(activeWagonItem(items())),
    horseLook: () => riddenHorseLook(items()),
    horses3d: () => mwViewHorseRig(),
    bakedWagon: (kind) => {
      if (!loads.has(kind)) loads.set(kind, Promise.resolve(fetchFn(WAGON_MODEL_URLS[kind])).then((r) => { if (!r?.ok) throw new Error(`HTTP ${r?.status}`); return r.json(); }));
      return loads.get(kind);
    },
  };
}

export async function wagonIconSource(kind, fetchFn = (u) => globalThis.fetch(u)) {
  const r = await fetchFn(WAGON_MODEL_URLS[kind]);
  if (!r?.ok) throw new Error(`the ${kind}'s model: HTTP ${r?.status}`);
  const model = wagonIconModel(wagonGeometry(await r.json()));
  await studioLanded();
  const pics = new Map(wagonArt().map(([rec, pic]) => [rec, paintedReplacement(WAGON_ARCHIVE, rec) ?? toColor32(dfLook(pic, lookSeed(WAGON_ARCHIVE, rec)))]));
  return { model, texels: (arc, rec) => (arc === WAGON_ARCHIVE ? pics.get(rec) ?? null : null) };
}
