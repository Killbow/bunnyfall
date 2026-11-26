// @ts-check
// Come Sail Away walks hull 4's prefab by node name: the first MeshCollider is the boat's frame, DrivePosition the
// helm, and Booms, Sails, and RudderObject the rig and steering. The frame is Unity's: +x starboard, +y up, +z the
// bow, and the origin on the waterline.
import { CARRACK_ARCHIVE, TEX, CARRACK_TILE, BANDS } from './carrackArt.js';
import { MeshBench, colliderOf, prism, rope, box, planarUv, sub, add, scl, dot, cross, norm } from './galleonMesh.js';
import {
  bakedPartGeometry, benchPart, mastCap, rudderBlade, doorLeafGeometry, gunGeometry, chaserGeometry, wheelGeometry, mergeGeometries,
  GUN as GALLEON_GUN, MEASURED as GALLEON_MEASURED, DOOR_THICK, LID_OPEN_DEG, WHEEL_TURNS, RUDDER_DEG, RUDDER_CLEAR, MANROPE,
} from './galleonModel.js';
import { nodeOf, yaw, clone, findNode, constClip, eulerCurve, pointsOf, partOf, prefabBench, inArchive } from './shipKit.js';
import { buildCarrackRig, CARRACK_RIG } from './carrackRig.js';
import { CAPSULE_HEIGHT } from '../player/motor.js';

export const CARRACK_PREFAB_ID = 112414;
export const CARRACK_HULL_NODE = 'NewCarrack';
const GALLEON_ID = 112412;

export const MEASURED = Object.freeze({
  gunDeckY: 1.9576, mainDeckY: 7.8082, mainDeckUnderY: 7.5086, railY: 8.6343, bowRailY: 9.7475,
  hullOuterX: 6.6951, knuckleY: 3.5587, throatX: 5.8417,
  portZ: Object.freeze([-9.2435, -5.6075, -1.3762, 2.6505, 6.8825]), portHalfW: 0.9604, portSillY: 3.0661, portTopY: 4.0607,
  hatchAft: Object.freeze({ z0: -7.9235, z1: -4.7313, halfX: 1.2232 }), hatchFore: Object.freeze({ z0: 2.6933, z1: 5.8856, halfX: 1.2232 }),
  gangway: Object.freeze({ z0: -1.761, z1: 0.7075, sillY: 7.9378, innerX: 5.8085, outerX: 6.0858 }),
  houseAft: Object.freeze({ x0: -2.9712, x1: 3.0726, z0: -20.6804, z1: -15.8128, ceilingY: 10.6965 }),
  houseMid: Object.freeze({ halfX: 1.508, z0: -8.9014, z1: -4.0346, ceilingY: 10.6965 }),
  houseFore: Object.freeze({ x0: -2.6345, x1: 2.2973, z0: 2.1869, z1: 6.4552, ceilingY: 10.6965 }),
  houseDoor: Object.freeze({ halfX: 1.508, y0: 7.8082, y1: 10.6965, z: -4.1925 }),
  rudderPivotZ: -22.6356,
  sternRail: Object.freeze({ capY: 9.5573, z0: -23.312, z1: -12.448 }),
  beams: Object.freeze({ z: Object.freeze([-15.7895, -8.9955, -3.256, 1.4275, 7.0255, 10.8685]), halfZ: 0.4425, underY: 6.6871, halfX: 5.805 }),
});

// `stand` sits half a capsule over the deck because Come Sail Away places the capsule center, not the feet, at
// DrivePosition.
export const HELM = Object.freeze({ hub: Object.freeze([0, MEASURED.mainDeckY + 0.72, -13.75]), stand: Object.freeze([0, MEASURED.mainDeckY + CAPSULE_HEIGHT / 2, -15.1]), wheelR: 0.4 });
export const DRIVE_TRIGGER_AT = Object.freeze([HELM.hub[0], HELM.hub[1], HELM.hub[2] + 0.25]);

// Each 3 m board trigger cube keeps its inner face 4 cm outside the hull's outer planking, never inside it.
const BOARD_X = MEASURED.hullOuterX + 1.5 + 0.04;
export const LADDER_Z = 0.35;

const SILL_TO_FOOT = (MEASURED.portSillY - (MEASURED.portTopY + 0.07 - 1.78)) / 8;
export const LID = Object.freeze({
  rows: Object.freeze([MEASURED.portTopY + 0.07, MEASURED.knuckleY, ...[2, 1].map((k) => MEASURED.portSillY + k * (MEASURED.knuckleY - MEASURED.portSillY) / 3), MEASURED.portSillY, ...[1, 2, 3, 4, 5, 6, 7].map((k) => MEASURED.portSillY - k * SILL_TO_FOOT), MEASURED.portTopY + 0.07 - 1.78]),
  cols: Object.freeze([-8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => k * 0.1755625)),
  thick: 0.11, gap: 0.003, eyeR: 0.045, eyesZ: Object.freeze([-0.95, 0.95]),
});
export const LID_SILL_ROW = LID.rows.indexOf(MEASURED.portSillY);

const AXIS_OVER_FOOT = GALLEON_GUN.axisY - GALLEON_MEASURED.gunDeckY;
const PLATFORM_RISE = 0.38;
export const GUN = Object.freeze({
  axisY: MEASURED.gunDeckY + PLATFORM_RISE + AXIS_OVER_FOOT,
  platformY: MEASURED.gunDeckY + PLATFORM_RISE,
  runOutX: MEASURED.hullOuterX + 0.09 - GALLEON_GUN.muzzleX, runInX: MEASURED.hullOuterX + 0.09 - GALLEON_GUN.muzzleX - 1.1,
  muzzleX: GALLEON_GUN.muzzleX, chaserY: 9.95, chaserZ: 19.5,
});
export const PLATFORM = Object.freeze({ x0: 2.95, halfZ: 0.85 });
export const CARRACK_BATTERIES = Object.freeze({
  broadside: Object.freeze(MEASURED.portZ.map((z) => Object.freeze([MEASURED.hullOuterX + 0.09, GUN.axisY, z]))),
  bow: Object.freeze([Object.freeze([-1.15, GUN.chaserY, GUN.chaserZ + 0.95]), Object.freeze([1.15, GUN.chaserY, GUN.chaserZ + 0.95])]),
  stern: Object.freeze([Object.freeze([0, 8.9, -23.6])]),
});

function faceSkin(role, n, c) {
  const tiled = (rec, key = keyOf(rec)) => ({ rec, uv: (p) => planarUv(p, n, CARRACK_TILE[key]) });
  const banded = (name) => ({ band: BANDS[name], u: (p) => planarUv(p, n, [CARRACK_TILE[name][0], 1])[0] });
  const up = n[1] > 0.7, down = n[1] < -0.7;
  switch (role) {
    case 'hull': {
      if (c[1] > 2.9 && c[1] < 4.2 && Math.abs(c[0]) > 5.7 && Math.abs(c[0]) < 6.8 && Math.abs(n[0]) < 0.3) return tiled(TEX.dark);
      if (up) return tiled(c[1] > 7.9 ? TEX.trim : TEX.hullInner);
      const core = [0, c[1], Math.max(-17, Math.min(18, c[2]))];
      if (dot(n, sub(core, c)) > 0) return tiled(TEX.hullInner);
      if (n[1] < -0.55) return tiled(TEX.hullBottom);
      if (n[2] < -0.6 && c[1] > BANDS.transom.y0) return banded('transom');
      return banded('hullSide');
    }
    case 'rudder': return tiled(TEX.hullBottom);
    case 'deckBeam': return { rec: TEX.trim, uv: (p) => [p[0] / CARRACK_TILE.trim[0], (Math.abs(n[1]) > 0.7 ? p[2] : p[1]) / CARRACK_TILE.trim[1]] };
    case 'gunDeck': return tiled(TEX.deck);
    case 'mainDeck': return tiled(up ? TEX.deck : down ? TEX.underDeck : TEX.trim);
    case 'houseAft': case 'houseMid': case 'houseFore': {
      const mid = HOUSE_MID[role];
      if (n[1] > 0.9 && c[1] > 10.8) return tiled(TEX.roof);
      if (down) return tiled(TEX.underDeck);
      const along = role === 'houseFore' ? 0 : 2;
      if (Math.abs(n[along]) > 0.9) return tiled(TEX.trim);
      return dot(n, sub(c, mid)) > 0 ? banded('house') : tiled(TEX.hullInner);
    }
    case 'sternRail': {
      const out = dot(n, sub(c, [0, c[1], -14.5])) > 0;
      if (up || down) return tiled(TEX.trim);
      return out ? banded('quarterRail') : tiled(TEX.trim);
    }
    case 'foreMast': case 'mainMast': case 'mizzenMast': case 'bowsprit': return tiled(TEX.spar);
    default: return tiled(TEX.trim);
  }
}
const keyOf = (rec) => Object.keys(TEX).find((k) => TEX[k] === rec);
const HOUSE_MID = Object.freeze({
  houseAft: Object.freeze([0.0507, 9.2, -18.2466]), houseMid: Object.freeze([0, 9.2, -6.468]), houseFore: Object.freeze([-0.1686, 9.2, 4.3211]),
});
const drawn = (part, opts = {}) => bakedPartGeometry(part, { ...opts, skin: faceSkin, archive: CARRACK_ARCHIVE });

export function sideAt(hull, y, z, s = 1) {
  const P = pointsOf(hull);
  let best = null;
  for (let t = 0; t < hull.triangles.length; t += 3) {
    const a = P[hull.triangles[t]], b = P[hull.triangles[t + 1]], c = P[hull.triangles[t + 2]];
    const d = (b[1] - a[1]) * (c[2] - a[2]) - (c[1] - a[1]) * (b[2] - a[2]);
    if (Math.abs(d) < 1e-12) continue;
    const u = ((y - a[1]) * (c[2] - a[2]) - (c[1] - a[1]) * (z - a[2])) / d;
    const v = ((b[1] - a[1]) * (z - a[2]) - (y - a[1]) * (b[2] - a[2])) / d;
    if (u < -1e-9 || v < -1e-9 || u + v > 1 + 1e-9) continue;
    const x = a[0] + u * (b[0] - a[0]) + v * (c[0] - a[0]);
    if (x * s <= 0) continue;
    if (best == null || x * s > best) best = x * s;
  }
  return best;
}

export function lidFitOf(hull, s = 1) {
  return MEASURED.portZ.map((zc) => LID.rows.map((y, r) => {
    const yy = r === LID_SILL_ROW ? y - 0.001 : y;
    const at = LID.cols.map((dz) => sideAt(hull, yy, zc + dz, s));
    const K = at.length, a = at[0], b = at[K - 1];
    return at.map((x, k) => (x != null ? x : a + (b - a) * (k / (K - 1))));
  }));
}

function lidGeometry(s, fit) {
  const bench = new MeshBench(CARRACK_ARCHIVE);
  const R = LID.rows.length, K = LID.cols.length, t = LID.thick;
  const xh = Math.max(...fit[0]);
  const inner = LID.rows.map((y, r) => LID.cols.map((dz, k) => [s * (fit[r][k] + LID.gap - xh), y - LID.rows[0], dz]));
  const quadN = (r, k) => { const n = norm(cross(sub(inner[r + 1][k + 1], inner[r][k]), sub(inner[r][k + 1], inner[r + 1][k]))); return n[0] * s < 0 ? scl(n, -1) : n; };
  const outer = inner.map((row, r) => row.map((p, k) => {
    let n = [0, 0, 0];
    for (const [rr, kk] of [[r - 1, k - 1], [r - 1, k], [r, k - 1], [r, k]]) if (rr >= 0 && kk >= 0 && rr < R - 1 && kk < K - 1) n = add(n, quadN(rr, kk));
    return add(p, scl(norm(n), t));
  }));
  const uv = (r, k) => [s > 0 ? k / (K - 1) : 1 - k / (K - 1), (LID.rows[r] - LID.rows[R - 1]) / (LID.rows[0] - LID.rows[R - 1])];
  for (let r = 0; r < R - 1; r++) for (let k = 0; k < K - 1; k++) {
    const n = quadN(r, k), at = [[r, k], [r, k + 1], [r + 1, k + 1], [r + 1, k]];
    bench.quad(TEX.lid, ...at.map(([a, b]) => outer[a][b]), at.map(([a, b]) => uv(a, b)), n);
    bench.quad(TEX.lid, ...at.map(([a, b]) => inner[a][b]), at.map(([a, b]) => uv(a, b)), scl(n, -1));
  }
  const edge = (a, b, c, d, out) => bench.quad(TEX.lid, a, b, c, d, [[0, 0], [0.1, 0], [0.1, 0.1], [0, 0.1]], out);
  for (let k = 0; k < K - 1; k++) {
    edge(inner[0][k], inner[0][k + 1], outer[0][k + 1], outer[0][k], sub(inner[0][k], inner[1][k]));
    edge(inner[R - 1][k], inner[R - 1][k + 1], outer[R - 1][k + 1], outer[R - 1][k], sub(inner[R - 1][k], inner[R - 2][k]));
  }
  for (let r = 0; r < R - 1; r++) {
    edge(inner[r][0], inner[r + 1][0], outer[r + 1][0], outer[r][0], sub(inner[r][0], inner[r][1]));
    edge(inner[r][K - 1], inner[r + 1][K - 1], outer[r + 1][K - 1], outer[r][K - 1], sub(inner[r][K - 1], inner[r][K - 2]));
  }
  for (const z of LID.eyesZ) prism(bench, TEX.iron, [0, 0, z - 0.08], [0, 0, z + 0.08], LID.eyeR, LID.eyeR, 6);
  const solid = new MeshBench(CARRACK_ARCHIVE);
  for (let r = 0; r < LID_SILL_ROW; r++) for (let k = 0; k < K - 1; k++) {
    const n = quadN(r, k), at = [[r, k], [r, k + 1], [r + 1, k + 1], [r + 1, k]];
    solid.quad(TEX.lid, ...at.map(([a, b]) => outer[a][b]), at.map(() => [0, 0]), n);
    solid.quad(TEX.lid, ...at.map(([a, b]) => inner[a][b]), at.map(() => [0, 0]), scl(n, -1));
  }
  return { geometry: bench.finish(), xh, collider: solid.finish() };
}

export function platformGeometry(s, z) {
  const bench = new MeshBench(CARRACK_ARCHIVE);
  const x0 = PLATFORM.x0, x1 = MEASURED.throatX - 0.01, y0 = MEASURED.gunDeckY, y1 = GUN.platformY;
  box(bench, TEX.deck, [s * (x0 + x1) / 2, (y0 + y1) / 2, z], [(x1 - x0) / 2, (y1 - y0) / 2, PLATFORM.halfZ], { tile: CARRACK_TILE.deck, skip: [0, 1, 4, 5] });
  box(bench, TEX.trim, [s * (x0 + x1) / 2, (y0 + y1) / 2, z], [(x1 - x0) / 2, (y1 - y0) / 2, PLATFORM.halfZ], { tile: CARRACK_TILE.trim, skip: [2, 3] });
  return bench.finish();
}

function companionGeometry(topZ, dir, halfX = 0.8, pitch = 48) {
  const bench = new MeshBench(CARRACK_ARCHIVE);
  const top = MEASURED.mainDeckY, bottom = MEASURED.gunDeckY;
  const rise = 0.3, steps = Math.round((top - bottom) / rise);
  const r = (top - bottom) / steps, run = r / Math.tan((pitch * Math.PI) / 180);
  for (let i = 1; i <= steps; i++) {
    const y = top - i * r, z0 = topZ + dir * (i - 1) * run, z1 = topZ + dir * i * run;
    box(bench, TEX.deck, [0, y - 0.04, (z0 + z1) / 2], [halfX, 0.04, Math.abs(z1 - z0) / 2 + 0.02], { tile: CARRACK_TILE.deck });
  }
  const zEnd = topZ + dir * steps * run;
  for (const s of [-1, 1]) {
    const a = [s * (halfX + 0.05), top - 0.1, topZ], b = [s * (halfX + 0.05), bottom + 0.1, zEnd];
    prism(bench, TEX.trim, a, b, 0.09, 0.09, 4, { tileV: 2, twist: Math.PI / 4 });
    const foot = add(b, [0, 0.95, 0]), head = [a[0], top + 0.95, topZ];
    rope(bench, TEX.rope, [foot, head, [s * MEASURED.hatchAft.halfX, top + 0.02, topZ]], MANROPE.r);
  }
  return { geometry: bench.finish(), bottomZ: zEnd, steps, rise: r, run };
}

export function ropeLadderGeometry(s = 1) {
  const bench = new MeshBench(CARRACK_ARCHIVE);
  const g = MEASURED.gangway, k = MEASURED.knuckleY, xk = MEASURED.hullOuterX + 0.03;
  const path = (dz) => [[s * (g.innerX + 0.1), g.sillY + 0.15, LADDER_Z + dz], [s * (g.outerX + 0.03), g.sillY - 0.05, LADDER_Z + dz], [s * xk, k, LADDER_Z + dz], [s * xk, 0.05, LADDER_Z + dz]];
  for (const dz of [-0.24, 0.24]) rope(bench, TEX.rope, path(dz), 0.03);
  const xAt = (y) => (y > k ? g.outerX + 0.03 + ((g.sillY - 0.05 - y) / (g.sillY - 0.05 - k)) * (xk - g.outerX - 0.03) : xk);
  for (let y = 0.35; y < g.sillY - 0.3; y += 0.34) box(bench, TEX.trim, [s * (xAt(y) + 0.04), y, LADDER_Z], [0.03, 0.025, 0.25], { tile: CARRACK_TILE.trim });
  return bench.finish();
}

export function mirroredX(g) {
  const positions = Float32Array.from(g.positions), normals = Float32Array.from(g.normals), indices = Uint32Array.from(g.indices);
  for (let i = 0; i < positions.length; i += 3) { positions[i] = -positions[i]; normals[i] = -normals[i]; }
  for (let i = 0; i < indices.length; i += 3) { const t = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = t; }
  return { ...g, positions, normals, indices, aabb: { center: [-g.aabb.center[0], g.aabb.center[1], g.aabb.center[2]], extent: [...g.aabb.extent] } };
}

function helmPedestalGeometry() {
  const bench = new MeshBench(CARRACK_ARCHIVE);
  const [hx, hy, hz] = HELM.hub, y0 = MEASURED.mainDeckY;
  box(bench, TEX.trim, [hx, y0 + 0.48, hz + 0.42], [0.26, 0.48, 0.22], { tile: CARRACK_TILE.trim });
  box(bench, TEX.gilt, [hx, y0 + 0.99, hz + 0.42], [0.28, 0.03, 0.24], { tile: CARRACK_TILE.gilt });
  prism(bench, TEX.iron, [hx, hy, hz + 0.2], [hx, hy, hz + 0.05], 0.05, 0.05, 6, { smooth: true });
  prism(bench, TEX.gilt, [hx, y0 + 1.02, hz + 0.42], [hx, y0 + 1.3, hz + 0.42], 0.16, 0.06, 8, { smooth: true });
  return bench.finish();
}

export function carrackClips() {
  const clips = {}, overrides = {};
  const pair = (ov, closed, opened) => {
    clips[`${ov} Closed`] = constClip(`${ov} Closed`, [eulerCurve('', closed)]);
    clips[`${ov} Opened`] = constClip(`${ov} Opened`, [eulerCurve('', opened)]);
    overrides[ov] = { base: 'Door Controller', clips: [['Door Closed', `${ov} Closed`], ['Door Opened', `${ov} Opened`]] };
  };
  pair('carrack2/Gunport', [0, 0, 0], [0, 0, LID_OPEN_DEG]);
  pair('carrack2/GunportPort', [0, 0, 0], [0, 0, -LID_OPEN_DEG]);
  // The mod's Door Controller opens a leaf to +90 with its +x aft; this leaf has -x aft, so its open clip turns to
  // -90.
  pair('carrack2/DoorStarboard', [0, 0, 0], [0, -90, 0]);
  const swaps = [];
  for (const [side, sign] of /** @type {const} */ ([['Left', -1], ['Right', 1]])) {
    for (let i = 0; i < 5; i++) {
      const t = sign * (0.2 + 0.2 * i);
      const name = `carrack2/Rudder Sailing ${side} ${i}`;
      clips[name] = constClip(name, [eulerCurve('HelmWheel', [0, 0, -t * WHEEL_TURNS * 360]), eulerCurve('HelmRudder', [0, -t * RUDDER_DEG, 0])]);
      swaps.push([`Rudder Wheel Sailing ${side} ${i}`, name]);
    }
  }
  overrides['carrack2/Rudder'] = { base: 'Rudder Wheel Controller', clips: swaps };
  return { clips, overrides };
}

/**
 * @param {any} bake
 * @param {{ prefabs: Record<string, any>, components: any[] }} csa
 * @param {number} [base]
 */
export function carrackPrefab(bake, csa, base = csa.components.length) {
  const { comp, mesh, renderer, meshNode, boxCollider, animator, skinned, finish, meshes } = prefabBench(base, 'carrack');
  const cx = { archive: CARRACK_ARCHIVE, mesh, comp, skinned };
  const part = (role) => partOf(bake, role, 'carrack');
  const own = (geometry) => inArchive(geometry, CARRACK_ARCHIVE);
  const baked = (role, name, extra = null) => {
    const plain = drawn(part(role));
    if (!extra) return meshNode(name, `carrack:${role}`, plain, { collider: true });
    const bench = new MeshBench(CARRACK_ARCHIVE);
    benchPart(bench, part(role), { offset: [0, 0, 0], role, keep: null, skin: faceSkin });
    extra(bench, part(role));
    return meshNode(name, `carrack:${role}`, bench.finish(), { collider: true, colliderGeometry: plain });
  };
  const fromPrefab = (id, ship) => (name, at = {}) => {
    const n = clone(findNode(csa.prefabs[String(id)], name));
    if (!n) throw new Error(`carrack: Come Sail Away's ${ship} has no ${name}`);
    if (at.p) n.position = [...at.p];
    if (at.r) n.rotation = [...at.r];
    if (at.name) n.name = at.name;
    if (at.active !== undefined) n.active = at.active;
    return n;
  };
  const fromCarrack = fromPrefab(CARRACK_PREFAB_ID, 'carrack'), fromGalleon = fromPrefab(GALLEON_ID, 'galleon');
  const M = MEASURED;
  const kids = [];
  const hull = part('hull');

  // Board triggers go before door triggers: the walk files door triggers under BoardTriggers too, and
  // BoardTriggers[0] must be a gangway's.
  for (const s of [1, -1]) {
    const t = [s * BOARD_X, 2.4, LADDER_Z];
    const stand = [s * (M.gangway.innerX - 1.0), M.mainDeckY + 0.05, LADDER_Z];
    kids.push(nodeOf('BoardTrigger', { p: t, s: [3, 3, 3], kids: [nodeOf('BoardPosition', { p: scl(sub(stand, t), 1 / 3), r: yaw(s > 0 ? -90 : 90), s: [1 / 3, 1 / 3, 1 / 3] })] }));
  }
  kids.push(nodeOf('DriveTrigger', { p: DRIVE_TRIGGER_AT }));
  kids.push(nodeOf('DrivePosition', { p: HELM.stand }));

  for (const [role, name] of [['houseAft', 'HouseAft'], ['houseMid', 'HouseMid'], ['houseFore', 'HouseFore'], ['sternRail', 'QuarterRail']]) kids.push(meshNode(name, `carrack:${role}`, drawn(part(role))));
  const extras = { foreMast: (b, p) => mastCap(b, p, faceSkin), mainMast: (b, p) => mastCap(b, p, faceSkin), mizzenMast: (b, p) => mastCap(b, p, faceSkin) };
  for (const [role, name] of [['gunDeck', 'GunDeck'], ['mainDeck', 'MainDeck'],
    ['foreMast', 'ForeMast'], ['forePartner', 'ForePartner'], ['foreStep', 'ForeStep'],
    ['mainMast', 'MainMast'], ['mainPartner', 'MainPartner'], ['mainStep', 'MainStep'],
    ['mizzenMast', 'MizzenMast'], ['mizzenPartner', 'MizzenPartner'], ['mizzenStep', 'MizzenStep'],
    ['aftStep', 'AftStep'], ['bowsprit', 'Bowsprit']]) kids.push(baked(role, name, extras[role] ?? null));
  const beamParts = bake.parts.filter((x) => x.role === 'deckBeam');
  if (beamParts.length !== 6) throw new Error(`carrack: the bake has ${beamParts.length} deck beams where Mac drew six`);
  kids.push(meshNode('DeckBeams', 'carrack:deckBeams', drawn(beamParts), { collider: true }));

  kids.push(meshNode('CompanionAft', 'carrack:companionAft', companionGeometry(M.hatchAft.z1, -1).geometry, { collider: true }));
  kids.push(meshNode('CompanionFore', 'carrack:companionFore', companionGeometry(M.hatchFore.z1, -1).geometry, { collider: true }));

  const d = M.houseDoor;
  const foot = d.y0 + 0.01, leafW = d.halfX - 0.03, leafH = d.y1 - 0.01 - foot;
  for (const [s, side] of /** @type {const} */ ([[-1, 'Port'], [1, 'Starboard']])) {
    const leaf = own(s < 0 ? doorLeafGeometry(leafW, leafH) : mirroredX(doorLeafGeometry(leafW, leafH)));
    kids.push(meshNode(`HouseDoor${side}`, `carrack:door${side}`, leaf, { collider: true, p: [s * (d.halfX - 0.02), foot, d.z - DOOR_THICK / 2], c: [animator(s < 0 ? 'Door Controller' : 'carrack2/DoorStarboard')], kids: [nodeOf('DoorTrigger')] }));
  }

  const fits = { [1]: lidFitOf(hull, 1), [-1]: lidFitOf(hull, -1) };
  const lidXh = { [1]: [], [-1]: [] };
  M.portZ.forEach((z, i) => {
    for (const [s, suffix] of [[1, ''], [-1, 'Port']]) {
      const lid = lidGeometry(s, fits[s][i]);
      mesh(`carrack:gunportLid${suffix}${i}`, lid.geometry);
      mesh(`carrack:gunportLid${suffix}${i}:collider`, colliderOf(lid.collider));
      lidXh[s][i] = lid.xh;
    }
  });
  mesh('carrack:gun', own(gunGeometry()));
  const lidComps = (key) => [comp({ type: 'MeshFilter', m_Mesh: { mesh: key } }), renderer(meshes[key]), comp({ type: 'MeshCollider', m_Enabled: true, m_IsTrigger: false, m_Convex: false, m_Mesh: { mesh: `${key}:collider` } })];
  for (const [sideName, s] of /** @type {const} */ ([['Starboard', 1], ['Port', -1]])) {
    M.portZ.forEach((z, i) => {
      kids.push(nodeOf(`Gunport${sideName}${i}`, { p: [s * lidXh[s][i], LID.rows[0], z], c: [...lidComps(s > 0 ? `carrack:gunportLid${i}` : `carrack:gunportLidPort${i}`), animator(s > 0 ? 'carrack2/Gunport' : 'carrack2/GunportPort')] }));
      kids.push(meshNode(`GunPlatform${sideName}${i}`, `carrack:gunPlatform${sideName}${i}`, platformGeometry(s, z), { collider: true }));
      kids.push(nodeOf(`Gun${sideName}${i}`, { p: [s * GUN.runInX, GUN.platformY, z], r: yaw(s > 0 ? 0 : 180), c: [comp({ type: 'MeshFilter', m_Mesh: { mesh: 'carrack:gun' } }), renderer(meshes['carrack:gun']), boxCollider([-0.05, 0.55, 0], [1.25, 1.1, 0.8]), comp({ type: 'GunCarriage', runInX: GUN.runInX, runOutX: GUN.runOutX })] }));
    });
  }
  mesh('carrack:chaser', own(chaserGeometry(GUN.chaserY - M.mainDeckY)));
  for (const [i, m] of CARRACK_BATTERIES.bow.entries()) kids.push(nodeOf(`BowChaser${i}`, { p: [m[0], M.mainDeckY, m[2] - 0.95], c: [comp({ type: 'MeshFilter', m_Mesh: { mesh: 'carrack:chaser' } }), renderer(meshes['carrack:chaser'])] }));

  kids.push(meshNode('HelmPedestal', 'carrack:helmPedestal', helmPedestalGeometry(), { c: [boxCollider([0, M.mainDeckY + 0.6, HELM.hub[2] + 0.42], [0.6, 1.2, 0.5])] }));
  mesh('carrack:wheel', own(wheelGeometry(HELM.wheelR)));
  const rudderPivot = [0, 0, M.rudderPivotZ];
  mesh('carrack:rudder', drawn(rudderBlade(part('rudder'), M.rudderPivotZ - RUDDER_CLEAR), { offset: rudderPivot }));
  kids.push(nodeOf('RudderObject', {
    c: [animator('carrack2/Rudder')],
    kids: [
      nodeOf('HelmWheel', { p: HELM.hub, c: [comp({ type: 'MeshFilter', m_Mesh: { mesh: 'carrack:wheel' } }), renderer(meshes['carrack:wheel'])] }),
      nodeOf('HelmRudder', { p: rudderPivot, c: [comp({ type: 'MeshFilter', m_Mesh: { mesh: 'carrack:rudder' } }), renderer(meshes['carrack:rudder'])] }),
    ],
  }));

  const rig = buildCarrackRig(cx);
  kids.push(...rig.kids);

  const D = M.mainDeckY, G = M.gunDeckY;
  kids.push(nodeOf('ActiveObject', { kids: [fromCarrack('CarrackAnchor', { p: ANCHOR.weighed, r: yaw(ANCHOR.yawDeg) })] }));
  kids.push(nodeOf('IdleObject', { kids: [
    fromCarrack('CarrackAnchorDeployed', { p: ANCHOR.letGo, r: yaw(ANCHOR.yawDeg) }),
    meshNode('RopeLadderStarboard', 'carrack:ladderStarboard', ropeLadderGeometry(1)),
    meshNode('RopeLadderPort', 'carrack:ladderPort', ropeLadderGeometry(-1)),
  ] }));
  kids.push(fromGalleon('GalleonCargo', { p: [-3.2, G, 12.6], r: yaw(-90), name: 'CarrackCargo' }));
  kids.push(nodeOf('CargoTrigger', { p: [-3.2, G + 0.85, 12.6] }));
  kids.push(fromCarrack('FireObject'), fromCarrack('BedObject'));
  const lanternFlat = () => nodeOf('BillboardHelper-210_027:2');
  const pole = fromGalleon('LanternHookStandPoleShort');
  for (const s of [-1, 1]) kids.push({ ...clone(pole), position: [s * QUARTER_POLES.x, M.sternRail.capY + 0.003, QUARTER_POLES.z], rotation: yaw(s * QUARTER_POLES.yawDeg) });
  kids.push(fromGalleon('LanternHookStandPlank', { p: [0, M.sternRail.capY, TAFFRAIL_Z], r: yaw(180), name: 'LanternHookStandTaffrail' }));
  kids.push(nodeOf('LanternHanging (3)', { p: [0.05, M.houseAft.ceilingY - 0.05, -18.2], kids: [lanternFlat()] }));
  for (const [i, k] of [1, 2, 4].entries()) kids.push(nodeOf(i ? `LanternHanging (${i})` : 'LanternHanging', { p: [0, M.beams.underY - 0.01, M.beams.z[k]], kids: [lanternFlat()] }));
  kids.push(fromGalleon('FlagObject', { p: [0, CARRACK_RIG.flagY, CARRACK_RIG.masts.main.z] }));

  // One merged collider covers the hull, houses, and quarter rail, so a shot into a house strikes the hull.
  const hullGeometry = drawn(hull);
  mesh('carrack:hull:collider', colliderOf(mergeGeometries([hullGeometry, meshes['carrack:houseAft'], meshes['carrack:houseMid'], meshes['carrack:houseFore'], meshes['carrack:sternRail']])));
  const hullNode = meshNode(CARRACK_HULL_NODE, 'carrack:hull', hullGeometry, { kids, c: [comp({ type: 'MeshCollider', m_Enabled: true, m_IsTrigger: false, m_Convex: false, m_Mesh: { mesh: 'carrack:hull:collider' } })] });
  const root = nodeOf(String(CARRACK_PREFAB_ID), { kids: [fromCarrack('WakeObject'), hullNode, fromCarrack('Modifiers')] });

  const { components } = finish(root);
  const ownClips = carrackClips();
  return {
    prefab: root, components, meshes,
    animation: { clips: { ...ownClips.clips, ...rig.clips }, overrides: { ...ownClips.overrides, ...rig.overrides } },
  };
}

export const QUARTER_POLES = Object.freeze({ x: 5.0, z: -21.0, yawDeg: 135 });
export const TAFFRAIL_Z = -23.05;

export const ANCHOR = Object.freeze({ yawDeg: -150, weighed: Object.freeze([4.334, 7.2, 18.2]), letGo: Object.freeze([4.244, 7.2, 18.2]) });
