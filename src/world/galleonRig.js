// @ts-check
import { MeshBench, prism, rope, box, sub, add, scl, len, norm, lerp3, sagging } from './galleonMesh.js';
import { TEX, GALLEON_TILE } from './galleonArt.js';
import { nodeOf, constClip, posCurve } from './shipKit.js';
import { FIX_DEFORMATIONS_INTERVAL } from './skinnedBake.js';

export const RIG = Object.freeze({
  mainZ: -0.191, foreZ: 8.772,
  deckY: 6.202, mainTopY: 18.683, foreTopY: 16.939, nestFloorY: 18.767, nestTopY: 19.782,
  mastFootY: 0.771, mainFootR: 0.7, mainHeadR: 0.538, foreFootR: 0.7, foreHeadR: 0.448,
  mainR: 0.55, foreR: 0.5,
  railY: 6.925,
  bowspritEnd: Object.freeze([0, 9.1, 27.55]),
  bowspritUnder: Object.freeze([0, 8.473, 27.5]),
  stem: Object.freeze([0, 2.1, 21.735]),
});

export function mastRadius(mast, y) {
  const [r0, r1, top] = mast === 'fore' ? [RIG.foreFootR, RIG.foreHeadR, RIG.foreTopY] : [RIG.mainFootR, RIG.mainHeadR, RIG.mainTopY];
  return r0 + (r1 - r0) * (y - RIG.mastFootY) / (top - RIG.mastFootY);
}
export function mastSideFace(mast, y, s) {
  const r = mastRadius(mast, y), z = mast === 'fore' ? RIG.foreZ : RIG.mainZ;
  return [s * 0.7694 * r, y, z - 0.25 * r];
}

export const SAILS = Object.freeze([
  Object.freeze({ key: 'ForeCourse', kind: 'square', size: '', mast: 'fore', yardY: 12.2, drop: 4.35, headW: 11.0, footW: 12.6, yardSpan: 12.4, belly: 0.15 }),
  Object.freeze({ key: 'ForeTopsail', kind: 'square', size: 'Small', mast: 'fore', yardY: 16.0, drop: 3.4, headW: 8.0, footW: 10.0, yardSpan: 9.4, belly: 0.075 }),
  Object.freeze({ key: 'MainTopsail', kind: 'square', size: 'Small', mast: 'main', yardY: 17.65, drop: 4.2, headW: 8.6, footW: 10.4, yardSpan: 10.0, belly: 0.075 }),
  Object.freeze({ key: 'MainGaff', kind: 'gaff', size: 'Large', mast: 'main', boomY: 7.75, throatY: 12.75, peak: Object.freeze([7.2, -6.9]), clewZ: -8.0, boomLen: 8.6 }),
  Object.freeze({ key: 'Jib', kind: 'stay', size: 'Large' }),
]);
export const GRID = Object.freeze({ square: Object.freeze([9, 8]), gaff: Object.freeze([8, 7]), stay: Object.freeze([8, 7]), lateen: Object.freeze([9, 7]) });
export const SAIL_CLIP_S = 1;
export const YARD_R = Object.freeze([0.17, 0.08]);
export const HEAD_OFF = 0.02;
export const HEAD_TURN = 20 * Math.PI / 180;
export const FURL_R = 0.13;

// Running rope bakes every frame. Each canvas bakes on its own offset into the fix-deformations interval, so the
// sails bake on different frames.
export const BAKE = Object.freeze({ rope: Object.freeze({ everyFrame: true }), canvasTimer: (k) => Math.fround(k * FIX_DEFORMATIONS_INTERVAL / SAILS.length) });
const bakeCadence = (o) => ({ type: 'BakeCadence', ...o });


export function yardRadius(sail, x) {
  const R = sail.yardR ?? YARD_R;
  return R[0] + (R[1] - R[0]) * Math.min(1, Math.abs(x) / (sail.yardSpan / 2));
}
export const yardOffset = (sail) => (sail.mast === 'fore' ? RIG.foreR : RIG.mainR) + 0.24;

export function squareSailPose(sail, d, mastR, pose) {
  const [NU, NV] = GRID.square;
  const out = [];
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const u = i / (NU - 1), v = j / (NV - 1);
    const w = sail.headW + (sail.footW - sail.headW) * v;
    const x0 = (u - 0.5) * w;
    const rh = yardRadius(sail, x0) + HEAD_OFF;
    let x = x0, y = -rh * Math.cos(HEAD_TURN) - v * sail.drop, z = d + rh * Math.sin(HEAD_TURN);
    const arch = Math.sin(Math.PI * u);
    if (pose === 'center') z -= 0.1 * arch * v;
    else if (pose === 'full') {
      const belly = sail.belly * sail.footW * arch * Math.sin(0.8 * Math.PI * v);
      z += belly; y += 0.07 * sail.drop * arch * v; x *= 1 - 0.035 * Math.sin(Math.PI * v);
    } else if (pose === 'aback') {
      z -= (sail.aback ?? Math.min(0.1 * sail.footW, d - mastR - 0.06)) * arch * Math.sin(Math.PI * v) + 0.04 * v;
    } else if (pose === 'stowed') {
      const xr = (u - 0.5) * (sail.headW - 0.2);
      const D = yardRadius(sail, xr) + HEAD_OFF + FURL_R;
      const ny = -Math.cos(HEAD_TURN + 0.35), nz = Math.sin(HEAD_TURN + 0.35);
      const phi = j * 1.25 + u * 0.4;
      x = xr;
      y = D * ny - FURL_R * (Math.cos(phi) * ny + Math.sin(phi) * nz);
      z = d + D * nz - FURL_R * (Math.cos(phi) * nz - Math.sin(phi) * ny);
    }
    out.push([x, y, z]);
  }
  return out;
}

export function gaffSailPose(sail, mastR, pose) {
  const [NU, NV] = GRID.gaff;
  const luffZ = -(mastR + 0.12);
  const tack = [0, 0.32, luffZ], clew = [0, 0.32, sail.clewZ];
  const throat = [0, sail.throatY - sail.boomY - 0.15, luffZ], peak = [0, sail.peak[0] - 0.12, sail.peak[1]];
  const out = [];
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const u = i / (NU - 1), v = 1 - j / (NV - 1);
    const foot = lerp3(tack, clew, u), head = lerp3(throat, peak, u);
    let p = lerp3(foot, head, v);
    const arch = Math.sin(Math.PI * u) * Math.sin(Math.PI * (0.1 + 0.85 * v));
    if (pose === 'port') p[0] -= 1.1 * arch;
    else if (pose === 'starboard') p[0] += 1.1 * arch;
    else if (pose === 'center') p[0] += 0.12 * arch;
    else if (pose === 'stowed') {
      const luff = lerp3(tack, throat, v);
      const k = 0.07 + 0.05 * Math.sin(u * Math.PI * 3);
      p = lerp3(luff, p, k);
      p[0] += 0.18 * Math.sin(u * 7 + v * 3);
    }
    out.push(p);
  }
  return out;
}

export const JIB = Object.freeze({ headDown: 0.35, tackUp: 0.45, luffOff: 0.075, top: 0.985, clew: Object.freeze([0, 7.85, 19.6]) });
export function jibCorners() {
  const { head: sh, foot: sf } = stayLines().forestay;
  const along = norm(sub(sf, sh)), L = len(sub(sf, sh));
  const under = [0, -along[2], along[1]];
  const onLuff = (s) => add(add(sh, scl(along, s)), scl(under, JIB.luffOff));
  return { tack: onLuff(L - JIB.tackUp), clew: [...JIB.clew], head: onLuff(JIB.headDown) };
}
export function jibPose(pose, k = 1) {
  return staysailPose(jibCorners(), pose, k);
}
export function staysailPose({ tack, clew, head }, pose, k = 1, top = JIB.top, belly = 1.0) {
  const [NU, NV] = GRID.stay;
  const out = [];
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const u = i / (NU - 1), v = 1 - j / (NV - 1);
    const foot = lerp3(tack, clew, u);
    let p = lerp3(foot, head, v * top);
    const arch = Math.sin(Math.PI * u) * (1 - v) * 1.6 * Math.sin(Math.PI * (0.2 + 0.6 * (1 - v)));
    if (pose === 'port') p[0] -= belly * k * arch;
    else if (pose === 'starboard') p[0] += belly * k * arch;
    else if (pose === 'center') p[0] += 0.1 * arch;
    else if (pose === 'stowed') {
      const stay = lerp3(tack, head, Math.min(1, v * 0.97 + u * 0.03));
      p = [stay[0] + 0.12 * Math.sin(u * 6 + j), stay[1] - 0.12, stay[2] + 0.06 * Math.cos(u * 5)];
    }
    out.push(p);
  }
  return out;
}

export function lateenBoomY(sail, mast) {
  return sail.fore[1] + (sail.aft[1] - sail.fore[1]) * (sail.fore[2] - mast.z) / (sail.fore[2] - sail.aft[2]);
}
export function lateenYard(sail, mast) {
  const y0 = lateenBoomY(sail, mast);
  const at = (p) => [-sail.side, p[1] - y0, p[2] - mast.z];
  return { fore: at(sail.fore), aft: at(sail.aft) };
}
export function lateenSailPose(sail, mast, pose) {
  const [NU, NV] = GRID.lateen;
  const { fore, aft } = lateenYard(sail, mast);
  const y0 = lateenBoomY(sail, mast);
  const along = norm(sub(aft, fore)), L = len(sub(aft, fore));
  const under = [0, along[2], -along[1]];
  const onYard = (s) => add(add(fore, scl(along, s)), scl(under, sail.yardR[0] + HEAD_OFF));
  const throat = onYard(sail.throat), peak = onYard(L - sail.peakIn);
  const tack = [-sail.side, sail.footY - y0, throat[2] - 0.15 * (sail.throat / 1.2)], clew = [-sail.side, (sail.clewY ?? sail.footY) - y0, sail.clewZ - mast.z];
  const out = [];
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const u = i / (NU - 1), v = 1 - j / (NV - 1);
    const footAt = lerp3(tack, clew, u), headAt = lerp3(throat, peak, u);
    let p = lerp3(footAt, headAt, v);
    const arch = Math.sin(Math.PI * u) * Math.sin(Math.PI * (0.1 + 0.85 * v));
    if (pose === 'right') p[0] -= sail.belly * arch;
    else if (pose === 'center') p[0] -= 0.11 * sail.belly * arch;
    else if (pose === 'left') p[0] += sail.belly * arch * Math.min(1, Math.max(0, (Math.abs(p[2]) - sail.pin * 0.3) / sail.pin));
    else if (pose === 'stowed') {
      const k = 0.06 + 0.05 * Math.sin(u * Math.PI * 3);
      p = lerp3(headAt, p, k);
      p[0] -= sail.yardR[0] * 0.7 + 0.1 * Math.sin(u * 9 + v * 2) * (sail.yardR[0] / 0.19);
    }
    out.push(p);
  }
  return out;
}
export function lateenSparsGeometry(sail, mast, archive = undefined) {
  const bench = new MeshBench(archive);
  const { fore, aft } = lateenYard(sail, mast);
  const y0 = lateenBoomY(sail, mast);
  const slings = [-sail.side, 0, 0];
  prism(bench, TEX.spar, slings, fore, sail.yardR[0], sail.yardR[1], 8, { smooth: true, tileV: GALLEON_TILE.spar[1] });
  prism(bench, TEX.spar, slings, aft, sail.yardR[0], sail.yardR[1], 8, { smooth: true, tileV: GALLEON_TILE.spar[1] });
  const along = norm(sub(aft, fore)), band = sail.yardR[0] * 0.42;
  prism(bench, TEX.iron, sub(slings, scl(along, band)), add(slings, scl(along, band)), sail.yardR[0] * 1.13, sail.yardR[0] * 1.13, 8, { smooth: true });
  const r = mast.radius(y0) + sail.yardR[0] * 0.26, N = 10, rr = Math.max(0.018, sail.yardR[0] * 0.18), dy = -sail.yardR[0] * 0.63;
  const ring = [];
  for (let k = 0; k <= N; k++) { const a = Math.PI / 2 + (k / N) * Math.PI * 2; ring.push([Math.sin(a) * -r, dy, Math.cos(a) * r]); }
  rope(bench, TEX.rope, ring, rr);
  rope(bench, TEX.rope, [[-r, dy, 0], [slings[0] + sail.yardR[0] * 0.7, -sail.yardR[0] * 0.26, 0]], rr);
  rope(bench, TEX.rope, [add(slings, [0, sail.yardR[0], 0]), [-(mast.radius(mast.top - 0.15) + rr), mast.top - 0.15 - y0, 0]], rr * 0.86);
  return bench.finish();
}

export function canvasGeometry(rest, [NU, NV]) {
  const nGrid = NU * NV;
  const positions = new Float32Array(nGrid * 2 * 3), normals = new Float32Array(nGrid * 2 * 3), uvs = new Float32Array(nGrid * 2 * 2);
  const blendIndices = new Uint16Array(nGrid * 2);
  for (let side = 0; side < 2; side++) for (let k = 0; k < nGrid; k++) {
    const v = side * nGrid + k;
    positions.set(rest[k], v * 3);
    const i = k % NU, j = Math.floor(k / NU);
    uvs[v * 2] = side ? 1 - i / (NU - 1) : i / (NU - 1);
    uvs[v * 2 + 1] = 1 - j / (NV - 1);
    blendIndices[v] = k;
  }
  const idx = [];
  for (let j = 0; j + 1 < NV; j++) for (let i = 0; i + 1 < NU; i++) {
    const a = j * NU + i, b = a + 1, c = a + NU, d = c + 1;
    idx.push(a, b, d, a, d, c);
    idx.push(nGrid + a, nGrid + d, nGrid + b, nGrid + a, nGrid + c, nGrid + d);
  }
  const indices = Uint32Array.from(idx);
  const bindPoses = rest.map((p) => translation(scl(p, -1)));
  return { vertexCount: nGrid * 2, positions, normals, uvs, indices, subMeshes: [{ startIndex: 0, primitiveCount: indices.length / 3 }], blendIndices, bindPoses, aabb: boxOf(rest) };
}

export function ropeGeometry(a, b, r = 0.03, sides = 4) {
  const bench = new MeshBench();
  prism(bench, TEX.rope, a, b, r, r, sides, { caps: [false, false], smooth: true, tileV: GALLEON_TILE.rope[1] });
  const g = bench.finish();
  const blendIndices = new Uint16Array(g.vertexCount);
  const ab = sub(b, a), L2 = Math.max(1e-9, ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2]);
  for (let v = 0; v < g.vertexCount; v++) {
    const p = [g.positions[v * 3], g.positions[v * 3 + 1], g.positions[v * 3 + 2]];
    const t = ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / L2;
    blendIndices[v] = t > 0.5 ? 1 : 0;
  }
  return { ...g, slots: undefined, blendIndices, bindPoses: [translation(scl(a, -1)), translation(scl(b, -1))] };
}

export function translation(t) {
  const m = new Float32Array(16);
  m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1; m[12] = t[0]; m[13] = t[1]; m[14] = t[2];
  return m;
}
const boxOf = (pts) => {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) { if (p[k] < min[k]) min[k] = p[k]; if (p[k] > max[k]) max[k] = p[k]; }
  return { center: [0, 1, 2].map((k) => (min[k] + max[k]) / 2), extent: [0, 1, 2].map((k) => (max[k] - min[k]) / 2) };
};

export function liftHead(sail) {
  return [0, (sail.mast === 'fore' ? RIG.foreTopY - 0.12 : RIG.nestFloorY - 0.17) - sail.yardY, 0];
}
export function yardGeometry(span, d, liftTo, { r = YARD_R, footropes = true } = {}) {
  const bench = new MeshBench();
  const half = span / 2;
  prism(bench, TEX.spar, [0, 0, d], [half, 0, d], r[0], r[1], 8, { tileV: GALLEON_TILE.spar[1], smooth: true });
  prism(bench, TEX.spar, [0, 0, d], [-half, 0, d], r[0], r[1], 8, { tileV: GALLEON_TILE.spar[1], smooth: true });
  for (const x of [-half * 0.5, half * 0.5]) prism(bench, TEX.iron, [x - 0.06, 0, d], [x + 0.06, 0, d], r[0] - 0.01, r[0] - 0.01, 8, { smooth: true });
  box(bench, TEX.trim, [0, 0, d * 0.55], [r[0] + 0.05, r[0] - 0.01, d * 0.45], { tile: GALLEON_TILE.trim });
  for (const s of [-1, 1]) {
    if (footropes) rope(bench, TEX.rope, sagging([s * 0.25, -0.1, d - 0.22], [s * (half - 0.15), -0.06, d - 0.16], 0.45, 6), 0.022);
    rope(bench, TEX.rope, [[s * (half - 0.2), 0.05, d], liftTo], 0.024);
  }
  return bench.finish();
}

export function gaffSparsGeometry(sail, mastR) {
  const bench = new MeshBench();
  const z0 = -(mastR + 0.05);
  prism(bench, TEX.spar, [0, 0.18, z0], [0, 0.18, -sail.boomLen], 0.16, 0.11, 8, { tileV: GALLEON_TILE.spar[1], smooth: true });
  const throat = [0, sail.throatY - sail.boomY, z0], peak = [0, sail.peak[0], sail.peak[1]];
  prism(bench, TEX.spar, throat, peak, 0.13, 0.08, 8, { tileV: GALLEON_TILE.spar[1], smooth: true });
  for (const y of [0.18, throat[1]]) box(bench, TEX.trim, [0, y, -mastR * 0.4], [mastR + 0.08, 0.1, mastR * 0.5], { tile: GALLEON_TILE.trim });
  rope(bench, TEX.rope, [peak, [0, RIG.mainTopY - 0.7 - sail.boomY, 0]], 0.025);
  return bench.finish();
}

export const CHANNELS = Object.freeze({
  main: Object.freeze({ feet: Object.freeze([-5.3, -4.9, -4.5, -4.1]), headY: 18.02, inX: Object.freeze([5.325, 5.325]), plateX: Object.freeze([5.387, 5.387]) }),
  fore: Object.freeze({ feet: Object.freeze([2.75, 3.4, 4.05]), headY: 16.09, inX: Object.freeze([5.325, 5.325]), plateX: Object.freeze([5.376, 5.376]) }),
  topY: 6.7, thick: 0.14, width: 0.52, deadeyeR: 0.11, deadeyeH: 0.22, chainDrop: 0.42,
});
export function shroudLines() {
  const lines = [];
  const C = CHANNELS;
  for (const s of [-1, 1]) {
    for (const mast of /** @type {const} */ (['main', 'fore'])) {
      const k = s > 0 ? 1 : 0, xd = C[mast].inX[k] + C.width - C.deadeyeR;
      for (const z of C[mast].feet) {
        const deadeye = [s * xd, C.topY, z];
        lines.push({ mast, side: s, head: mastSideFace(mast, C[mast].headY, s), foot: [s * xd, C.topY + C.deadeyeH, z], deadeye, plate: [s * C[mast].plateX[k], C.topY - C.thick - C.chainDrop, z] });
      }
    }
  }
  return lines;
}
export function ratlineLines() {
  const out = [];
  const lines = shroudLines();
  for (const mast of ['main', 'fore']) for (const s of [-1, 1]) {
    const set = lines.filter((l) => l.mast === mast && l.side === s);
    for (let k = 0; k + 1 < set.length; k++) {
      const a = set[k], b = set[k + 1];
      const at = (l, y) => lerp3(l.foot, l.head, (y - l.foot[1]) / (l.head[1] - l.foot[1]));
      for (let y = 7.25; y < Math.min(a.head[1], b.head[1]) - 1.6; y += 0.42) out.push({ mast, side: s, a: at(a, y), b: at(b, y) });
    }
  }
  return out;
}
export function stayLines() {
  const foreHead = 16.8, mainHead = 18.6, mainFoot = 13.2;
  return {
    forestay: { head: [0, foreHead, RIG.foreZ + mastRadius('fore', foreHead)], foot: [...RIG.bowspritEnd], r: 0.045 },
    mainstay: { head: [0, mainHead, RIG.mainZ + mastRadius('main', mainHead)], foot: [0, mainFoot, RIG.foreZ - 0.809 * mastRadius('fore', mainFoot)], r: 0.05 },
    bobstay: { head: [...RIG.bowspritUnder], foot: [...RIG.stem], r: 0.04 },
  };
}
export function backstayLines() {
  const out = [];
  for (const s of [-1, 1]) {
    out.push({ mast: 'main', side: s, head: [s * 0.35, RIG.nestFloorY - 0.55, RIG.mainZ - 0.3], foot: [s * 5.07, 12.297, -11.2], r: 0.035 });
    out.push({ mast: 'fore', side: s, head: [s * 0.3, RIG.foreTopY - 0.6, RIG.foreZ - 0.25], foot: [s * 5.2, RIG.railY, 2.1], r: 0.032 });
  }
  return out;
}

export function standingRiggingGeometry() {
  const lines = shroudLines(), rungs = ratlineLines();
  const C = CHANNELS;
  const shrouds = (mast) => {
    const bench = new MeshBench();
    const own = lines.filter((l) => l.mast === mast);
    for (const l of own) {
      rope(bench, TEX.rope, [l.foot, l.head], 0.032);
      prism(bench, TEX.trim, l.deadeye, l.foot, C.deadeyeR, C.deadeyeR, 6, { smooth: true });
      prism(bench, TEX.iron, add(l.deadeye, [0, 0.05, 0]), l.plate, 0.03, 0.03, 4);
    }
    for (const r of rungs.filter((q) => q.mast === mast)) rope(bench, TEX.rope, [r.a, r.b], 0.014, { sides: 3 });
    const feet = C[mast].feet, z0 = Math.min(...feet) - 0.35, z1 = Math.max(...feet) + 0.35;
    for (const s of [-1, 1]) box(bench, TEX.trim, [s * (C[mast].inX[s > 0 ? 1 : 0] + C.width / 2), C.topY - C.thick / 2, (z0 + z1) / 2], [C.width / 2, C.thick / 2, (z1 - z0) / 2], { tile: GALLEON_TILE.trim });
    return bench.finish();
  };
  const S = stayLines();
  const stays = new MeshBench();
  for (const k of ['forestay', 'mainstay', 'bobstay']) rope(stays, TEX.rope, [S[k].head, S[k].foot], S[k].r);
  const backstays = new MeshBench();
  for (const b of backstayLines()) rope(backstays, TEX.rope, [b.head, b.foot], b.r);
  const flagstaff = new MeshBench();
  prism(flagstaff, TEX.spar, [0, RIG.nestFloorY, RIG.mainZ + 0.05], [0, RIG.nestTopY + 1.6, RIG.mainZ + 0.05], 0.09, 0.05, 6, { smooth: true, tileV: 2 });
  return { mainShrouds: shrouds('main'), foreShrouds: shrouds('fore'), stays: stays.finish(), backstays: backstays.finish(), flagstaff: flagstaff.finish() };
}

export const BELAYS = Object.freeze({
  foreBrace: Object.freeze([5.3, RIG.railY, -0.7]),
  mainBrace: Object.freeze([5.15, 12.297, -17.0]),
  courseSheet: Object.freeze([5.2, RIG.railY, 5.4]),
  jibSheet: Object.freeze([4.7, 6.959, 13.6]),
  mainSheet: Object.freeze([1.3, RIG.deckY, -9.8]),
});

export function rigBench(cx, { ship, clipPrefix, timerOf }) {
  const clips = {}, overrides = {};
  const meshNode = (name, key, geometry, opts = {}) => {
    cx.mesh(key, geometry);
    return nodeOf(name, { ...opts, c: [cx.comp({ type: 'MeshFilter', m_Mesh: { mesh: key } }), cx.comp({ type: 'MeshRenderer', m_Enabled: true, materials: geometry.slots.map((s) => ({ ...s })) })] });
  };
  const sailNode = (sailName, poses, grid, base, sailKey) => {
    const bonesName = `${sailKey}SailBones`, meshName = `${sailKey}SailMesh`;
    const rest = poses.center;
    const bones = rest.map((p, k) => nodeOf(`B${k}`, { p }));
    const bonesNode = nodeOf(bonesName, { kids: bones });
    const geometry = canvasGeometry(rest, grid);
    const key = `${ship}:sail:${sailKey}`;
    cx.mesh(key, geometry);
    const texChild = nodeOf(`${cx.archive}_${TEX.canvas}`);
    const meshNode = nodeOf(meshName, { c: [cx.comp(bakeCadence({ timer: timerOf(sailKey) }))], kids: [texChild] });
    cx.skinned(meshNode, key, bones, bonesNode, [{ material: `${ship}-canvas` }]);
    const clipName = (pose) => `${clipPrefix}/${sailKey} ${pose}`;
    const curvesOf = (grid2) => grid2.map((p, k) => posCurve(`${bonesName}/B${k}`, p));
    const ovName = `${clipPrefix}/${sailKey}`;
    if (base === 'Staysail Controller') {
      clips[clipName('Stowed')] = constClip(clipName('Stowed'), curvesOf(poses.stowed), SAIL_CLIP_S, false);
      for (const [slot, g] of [['Left', poses.left], ['Center Left', poses.centerLeft], ['Center', poses.center], ['Center Right', poses.centerRight], ['Right', poses.right]]) {
        clips[clipName(slot)] = constClip(clipName(slot), curvesOf(g), SAIL_CLIP_S, false);
      }
      overrides[ovName] = { base, clips: [['Sail Stowed', clipName('Stowed')], ['Staysail Unstowed Left', clipName('Left')], ['Staysail Unstowed Center Left', clipName('Center Left')], ['Staysail Unstowed Center', clipName('Center')], ['Staysail Unstowed Center Right', clipName('Center Right')], ['Staysail Unstowed Right', clipName('Right')]] };
    } else {
      for (const [slot, g] of [['Stowed', poses.stowed], ['Left', poses.left], ['Center', poses.center], ['Right', poses.right]]) clips[clipName(slot)] = constClip(clipName(slot), curvesOf(g), SAIL_CLIP_S, false);
      overrides[ovName] = { base, clips: [['Sail Stowed', clipName('Stowed')], ['Sail Unstowed Left', clipName('Left')], ['Sail Unstowed Center', clipName('Center')], ['Sail Unstowed Right', clipName('Right')]] };
    }
    const sail = nodeOf(sailName, { c: [cx.comp({ type: 'Animator', m_Enabled: true, m_Controller: { controller: ovName }, m_ApplyRootMotion: false })], kids: [bonesNode, meshNode] });
    return { sail, bones, bonesNode };
  };
  const running = (name, a, b, at = [0, 0, 0]) => {
    const meshName = `${name}Line`;
    const key = `${ship}:rope:${name}`;
    const geometry = ropeGeometry(sub(a.world, at), sub(b.world, at), 0.028);
    cx.mesh(key, geometry);
    const meshNode = nodeOf(meshName, { c: [cx.comp(bakeCadence({ ...BAKE.rope }))], kids: [nodeOf(`${cx.archive}_${TEX.rope}`)] });
    cx.skinned(meshNode, key, [a.bone, b.bone], null, [{ material: `${ship}-rope` }], true);
    return meshNode;
  };
  return { clips, overrides, meshNode, sailNode, running };
}

export function buildRig(cx) {
  const kids = [];
  const mastOf = (m) => (m === 'fore' ? { z: RIG.foreZ, r: RIG.foreR } : { z: RIG.mainZ, r: RIG.mainR });
  const { clips, overrides, meshNode, sailNode, running } = rigBench(cx, { ship: 'galleon', clipPrefix: 'galleon2', timerOf: (sailKey) => BAKE.canvasTimer(SAILS.findIndex((x) => x.key === sailKey)) });

  const squareSails = {};
  for (const s of SAILS.filter((x) => x.kind === 'square')) {
    const m = mastOf(s.mast);
    const d = yardOffset(s);
    const boomName = `${s.key}SquareBoom`;
    const poses = {
      stowed: squareSailPose(s, d, m.r, 'stowed'), left: squareSailPose(s, d, m.r, 'aback'),
      center: squareSailPose(s, d, m.r, 'center'), right: squareSailPose(s, d, m.r, 'full'),
    };
    const { sail, bones } = sailNode(`${s.key}Square${s.size}Sail`, poses, GRID.square, 'Sail Controller', s.key);
    const yard = meshNode(`${s.key}Yard`, `galleon:yard:${s.key}`, yardGeometry(s.yardSpan, d, liftHead(s)));
    const armP = nodeOf(`${s.key}YardArmPort`, { p: [-(s.yardSpan / 2 - 0.2), 0, d] });
    const armS = nodeOf(`${s.key}YardArmStarboard`, { p: [s.yardSpan / 2 - 0.2, 0, d] });
    // The sail must be the boom's first child, because the auto-trim reads the first child.
    const boom = nodeOf(boomName, { p: [0, s.yardY, m.z], kids: [sail, yard, armP, armS] });
    kids.push(boom);
    squareSails[s.key] = { s, boom, sail, bones, armP, armS, d };
  }
  const g = SAILS.find((x) => x.kind === 'gaff');
  const mm = mastOf(g.mast);
  const gPoses = { stowed: gaffSailPose(g, mm.r, 'stowed'), left: gaffSailPose(g, mm.r, 'port'), center: gaffSailPose(g, mm.r, 'center'), right: gaffSailPose(g, mm.r, 'starboard') };
  const gSail = sailNode(`${g.key}${g.size}Sail`, gPoses, GRID.gaff, 'Sail Controller', g.key);
  const gSpars = meshNode(`${g.key}Spars`, 'galleon:gaff', gaffSparsGeometry(g, mm.r));
  const gEnd = nodeOf(`${g.key}SheetBlock`, { p: [0, 0.18, -g.boomLen + 0.3] });
  // The node name must contain 'Gaff' and 'Boom' for the auto-trim's gaff arm to turn it.
  const gBoom = nodeOf(`${g.key}Boom`, { p: [0, g.boomY, mm.z], kids: [gSail.sail, gSpars, gEnd] });
  kids.push(gBoom);
  const jPoses = { stowed: jibPose('stowed'), left: jibPose('port'), centerLeft: jibPose('port', 0.5), center: jibPose('center'), centerRight: jibPose('starboard', 0.5), right: jibPose('starboard') };
  const jib = sailNode('JibStayLargeSail', jPoses, GRID.stay, 'Staysail Controller', 'Jib');
  kids.push(jib.sail);

  const standing = standingRiggingGeometry();
  for (const [name, key] of [['MainShrouds', 'mainShrouds'], ['ForeShrouds', 'foreShrouds'], ['Stays', 'stays'], ['Backstays', 'backstays'], ['Flagstaff', 'flagstaff']]) {
    kids.push(meshNode(name, `galleon:rigging:${key}`, standing[key]));
  }

  const deckBone = (name, p) => { const n = nodeOf(name, { p }); kids.push(n); return { bone: n, world: p }; };
  const local = (boomNode, child) => add(boomNode.position, child.position);
  const sided = (p, s) => [s * p[0], p[1], p[2]];
  for (const { s, boom, armP, armS } of Object.values(squareSails)) {
    const belay = s.mast === 'fore' ? BELAYS.foreBrace : BELAYS.mainBrace;
    for (const [arm, side] of [[armP, -1], [armS, 1]]) {
      const foot = deckBone(`${s.key}BraceBelay${side > 0 ? 'Starboard' : 'Port'}`, sided(belay, side));
      kids.push(running(`${s.key}Brace${side > 0 ? 'Starboard' : 'Port'}`, { bone: arm, world: local(boom, arm) }, foot));
    }
  }
  // Each sheet hangs under the node of its sail, so hiding the sail hides the sheets.
  {
    const { boom, sail, bones } = squareSails.ForeCourse;
    const [NU, NV] = GRID.square;
    for (const [k, side] of [[(NV - 1) * NU, -1], [NV * NU - 1, 1]]) {
      const foot = deckBone(`ForeCourseSheetBelay${side > 0 ? 'Starboard' : 'Port'}`, sided(BELAYS.courseSheet, side));
      sail.children.push(running(`ForeCourseSheet${side > 0 ? 'Starboard' : 'Port'}`, { bone: bones[k], world: add(boom.position, bones[k].position) }, foot, boom.position));
    }
  }
  kids.push(running('MainGaffSheet', { bone: gEnd, world: local(gBoom, gEnd) }, deckBone('MainGaffSheetBelay', [...BELAYS.mainSheet])));
  // The jib sheets hang under the jib's node, so hiding the jib hides them.
  {
    const [NU, NV] = GRID.stay;
    const clewBone = jib.bones[NV * NU - 1];
    for (const side of [-1, 1]) jib.sail.children.push(running(`JibSheet${side > 0 ? 'Starboard' : 'Port'}`, { bone: clewBone, world: clewBone.position }, deckBone(`JibSheetBelay${side > 0 ? 'Starboard' : 'Port'}`, sided(BELAYS.jibSheet, side))));
  }
  return { kids, clips, overrides };
}

export { len, norm };
