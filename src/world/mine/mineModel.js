// @ts-check
import { createMeshKit } from '../eliteGates/meshKit.js';
import { gateHash } from '../../net/gateLaw.js';

const WALL = 0, FLOOR = 1, CEILING = 2;
export const MINE_RING_SIDES = 10;
export const MINE_TUNNEL_WOBBLE = 0.15;
// The bulge only goes outward, so a wall slot on the layout ellipse stays just off the rock.
export const MINE_CHAMBER_SIDES = Object.freeze([40, 96]);
export const MINE_WALL_QUAD_M = 0.8;
const sidesOf = (/** @type {any} */ ch) => Math.max(MINE_CHAMBER_SIDES[0], Math.min(MINE_CHAMBER_SIDES[1], Math.ceil((Math.PI * (ch.rx + ch.rz) * (1 + MINE_CHAMBER_BULGE)) / MINE_WALL_QUAD_M)));
export const MINE_CHAMBER_BULGE = 0.12;
const RING_LIFT = 0.5;
const tubeTop = (/** @type {number} */ r) => (RING_LIFT + 1) * r * (1 + MINE_TUNNEL_WOBBLE);
const TUBE_UNDER_M = 0.6, TUBE_MIN_TOP_M = 3.6;
const MOUTH_BACK_M = 1.5;
const STUB_IN = 0.74;
const WALL_ROW_M = 0.6, DOOR_HEAD_M = 0.3;
const WALL_LEAN = 0.025;
const UV = 0.5;

const unit = (/** @type {number[]} */ ...k) => gateHash(0x6d1e, ...k) / 4294967296;

const rimAt = (/** @type {any} */ ch, /** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ s, /** @type {number} */ y) =>
  [ch.c[0] + Math.cos(a) * ch.rx * b * s, ch.c[1] + y, ch.c[2] + Math.sin(a) * ch.rz * b * s];
const inside = (/** @type {any} */ ch, /** @type {number} */ x, /** @type {number} */ z, s = 1) => ((x - ch.c[0]) / (ch.rx * s)) ** 2 + ((z - ch.c[2]) / (ch.rz * s)) ** 2 < 1;

/** @param {any} layout */
function plan(layout) {
  /** @type {Map<string, any>} */
  const chambers = new Map();
  for (const s of layout.sections) for (const ch of s.chambers) chambers.set(ch.id, { ch, doors: [] });
  const tubes = [];
  for (const t of layout.tunnels) {
    let pts = t.pts;
    const hs = [t.from, t.to].map((id) => chambers.get(id)?.ch.h).filter((h) => Number.isFinite(h));
    const room = Math.max(TUBE_MIN_TOP_M, Math.min(...hs, Infinity) - TUBE_UNDER_M - DOOR_HEAD_M);
    const vs = Math.min(1, room / tubeTop(t.r));
    for (const end of [t.from, t.to]) {
      const rec = chambers.get(end);
      if (!rec) continue;
      const ch = rec.ch;
      const atStart = end === t.from;
      const seq = atStart ? pts : [...pts].reverse();
      let first = seq.findIndex((p) => !inside(ch, p[0], p[2], STUB_IN));
      if (first < 0) first = seq.length - 1;
      rec.doors.push({ top: tubeTop(t.r) * vs + DOOR_HEAD_M, tunnel: tubes.length });
      const kept = seq.slice(first);
      if (first > 0) {
        const p = seq[first - 1], q = seq[first];
        let lo2 = 0, hi2 = 1;
        for (let k = 0; k < 20; k++) { const f = (lo2 + hi2) / 2, x = p[0] + (q[0] - p[0]) * f, z = p[2] + (q[2] - p[2]) * f; if (inside(ch, x, z, STUB_IN)) lo2 = f; else hi2 = f; }
        kept.unshift([p[0] + (q[0] - p[0]) * lo2, p[1] + (q[1] - p[1]) * lo2, p[2] + (q[2] - p[2]) * lo2]);
      }
      pts = atStart ? kept : kept.reverse();
    }
    const mouth = t.from === 'mouth';
    if (mouth && pts.length >= 2) {
      const dx = pts[1][0] - pts[0][0], dz = pts[1][2] - pts[0][2], l = Math.hypot(dx, dz) || 1;
      pts = [[pts[0][0] - (dx / l) * MOUTH_BACK_M, pts[0][1], pts[0][2] - (dz / l) * MOUTH_BACK_M], ...pts];
    }
    tubes.push({ t, pts, mouth, vs });
  }
  return { chambers, tubes };
}

function heights(/** @type {any} */ rec) {
  const doorTop = rec.doors.reduce((m, d) => Math.max(m, d.top), 0);
  const wallTop = Math.max(0.55 * rec.ch.h, doorTop);
  return { wallTop, top: Math.max(rec.ch.h, wallTop + 0.9) };
}

function chamberRim(ch, n, i, scale, y) {
  const angle = 2 * Math.PI * i / n;
  const bulge = 1 + MINE_CHAMBER_BULGE * unit(ch.c[0] * 100 | 0, ch.c[2] * 100 | 0, i % n);
  return rimAt(ch, angle, bulge, scale, y);
}

/**
 * @param {any} kit
 * @param {any} rec
 * @param {any[]} tubes
 */
function chamberInto(kit, rec, tubes) {
  const { ch, doors } = rec, { wallTop, top } = heights(rec), n = sidesOf(rec.ch);
  const rim = (i, scale, y) => chamberRim(ch, n, i, scale, y);
  const centre = [ch.c[0], ch.c[1], ch.c[2]];
  for (let i = 0; i < n; i++) {
    const a = rim(i, 1, 0), b = rim(i + 1, 1, 0);
    kit.tri(FLOOR, centre, a, b, [0, 1, 0], true, [centre[0] * UV, centre[2] * UV], [a[0] * UV, a[2] * UV], [b[0] * UV, b[2] * UV]);
  }
  const rows = Math.max(1, Math.ceil(wallTop / WALL_ROW_M));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < rows; j++) {
      const y0 = (wallTop * j) / rows, y1 = (wallTop * (j + 1)) / rows;
      const s0 = 1 - WALL_LEAN * y0, s1 = 1 - WALL_LEAN * y1;
      const p = [rim(i, s0, y0), rim(i + 1, s0, y0), rim(i + 1, s1, y1), rim(i, s1, y1)];
      const m = [(p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2, (p[0][2] + p[2][2]) / 2];
      const scale = (Math.PI * (ch.rx + ch.rz) * UV) / n;
      const u0 = i * scale, u1 = (i + 1) * scale;
      let polygons = [p.map((v, k) => [...v, k === 0 || k === 3 ? u0 : u1, v[1] * UV])];
      for (const door of doors) {
        for (const segment of tubes[door.tunnel].doorSegments) polygons = polygons.flatMap((poly) => subtractVolume(poly, segment));
      }
      const facing = [centre[0] - m[0], 0, centre[2] - m[2]];
      for (const [a, ...rest] of polygons) for (let k = 0; k + 1 < rest.length; k++) {
        const b = rest[k], c = rest[k + 1];
        kit.tri(WALL, a, b, c, facing, true, a.slice(3), b.slice(3), c.slice(3));
      }
    }
  }
  const s = 1 - WALL_LEAN * wallTop;
  const ringsY = [wallTop, wallTop + (top - wallTop) * 0.7, top];
  const ringsS = [s, s * 0.6, 0];
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < n; i++) {
      const a0 = rim(i, ringsS[r], ringsY[r]), b0 = rim(i + 1, ringsS[r], ringsY[r]);
      const a1 = rim(i, ringsS[r + 1], ringsY[r + 1]), b1 = rim(i + 1, ringsS[r + 1], ringsY[r + 1]);
      const look = [ch.c[0], ch.c[1] + wallTop * 0.5, ch.c[2]];
      const uv = [[a0[0] * UV, a0[2] * UV], [b0[0] * UV, b0[2] * UV], [b1[0] * UV, b1[2] * UV], [a1[0] * UV, a1[2] * UV]];
      const m = [(a0[0] + b1[0]) / 2, (a0[1] + b1[1]) / 2, (a0[2] + b1[2]) / 2], into = [look[0] - m[0], look[1] - m[1], look[2] - m[2]];
      if (r === 1) kit.tri(CEILING, a0, b0, a1, into, true, uv[0], uv[1], uv[3]);
      else kit.quad(CEILING, a0, b0, b1, a1, into, true, uv);
    }
  }
}

/**
 * @param {{ t: any, pts: number[][], vs: number }} tube
 * @param {number} seed
 */
function tubeRings(tube, seed) {
  const { t, pts, vs } = tube;
  const n = MINE_RING_SIDES;
  const rings = [], centres = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[2] - a[2];
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const side = [tz, 0, -tx];
    const p = pts[i], c = [p[0], p[1] + RING_LIFT * t.r * vs, p[2]];
    const ring = [];
    for (let k = 0; k < n; k++) {
      const a2 = (2 * Math.PI * k) / n, w = 1 + MINE_TUNNEL_WOBBLE * (2 * unit(seed, i, k) - 1), r = t.r * w;
      const u = Math.cos(a2) * r, v = Math.max(-RING_LIFT * t.r, Math.sin(a2) * r) * vs;
      ring.push([c[0] + side[0] * u, c[1] + v, c[2] + side[2] * u]);
    }
    rings.push(ring); centres.push(c);
  }
  return { rings, centres };
}

function ringVolume(a, b, ca, cb, offsets) {
  const middle = ca.map((v, i) => (v + cb[i]) / 2);
  const planes = [];
  const plane = (p, q, r, offset) => {
    const u = q.map((v, i) => v - p[i]), v = r.map((w, i) => w - p[i]);
    let x = u[1] * v[2] - u[2] * v[1], y = u[2] * v[0] - u[0] * v[2], z = u[0] * v[1] - u[1] * v[0];
    const length = Math.hypot(x, y, z);
    if (length < 1e-8) return;
    const sign = x * (middle[0] - p[0]) + y * (middle[1] - p[1]) + z * (middle[2] - p[2]) >= 0 ? 1 : -1;
    const scale = sign / length;
    x *= scale; y *= scale; z *= scale;
    planes.push([x, y, z, x * p[0] + y * p[1] + z * p[2] + offset]);
  };
  const capPoint = a.length === 3 ? 1 : 2, capEnd = a.length === 3 ? 2 : 4;
  plane(a[0], a[capPoint], a[capEnd], offsets.start);
  plane(b[0], b[capPoint], b[capEnd], offsets.end);
  for (let k = 0; k < a.length; k++) {
    const next = (k + 1) % a.length;
    const floor = [a[k], a[next], b[k], b[next]].every((p, i) => p[1] < (i < 2 ? ca : cb)[1] - 0.1);
    const offset = offsets.rim && k === 1 ? offsets.rim : floor ? offsets.floor : offsets.side;
    plane(a[k], a[next], b[next], offset);
    plane(a[k], b[next], b[k], offset);
  }
  return { planes, bounds: volumeBounds([...a, ...b], 0.4) };
}

function volumeBounds(points, pad = 0) {
  return [0, 1, 2].map((i) => {
    const values = points.map((p) => p[i]);
    return [Math.min(...values) - pad, Math.max(...values) + pad];
  });
}
const outsideBounds = (poly, bounds) =>
  bounds.some(([min, max], i) => poly.every((p) => p[i] < min) || poly.every((p) => p[i] > max));

const TUNNEL_CUT = { start: -0.015, end: -0.015, floor: -0.03, side: 0.04 };
const CHAMBER_CUT = { start: 0.14, end: 0, floor: 0, side: 0, rim: 0.16 };

function chamberVolume(rec) {
  const { ch } = rec, { wallTop } = heights(rec), n = sidesOf(ch);
  const at = (i, y) => chamberRim(ch, n, i, 1 - WALL_LEAN * y, y);
  const bottom = ch.c, top = [ch.c[0], ch.c[1] + wallTop, ch.c[2]];
  const wedges = [];
  for (let i = 0; i < n; i++) {
    const a = [bottom, at(i, 0), at(i + 1, 0)], b = [top, at(i, wallTop), at(i + 1, wallTop)];
    const centre = (ring) => ring[0].map((_, j) => (ring[0][j] + ring[1][j] + ring[2][j]) / 3);
    wedges.push(ringVolume(a, b, centre(a), centre(b), CHAMBER_CUT));
  }
  const radiusX = ch.rx * (1 + MINE_CHAMBER_BULGE), radiusZ = ch.rz * (1 + MINE_CHAMBER_BULGE);
  const bounds = [[bottom[0] - radiusX, bottom[0] + radiusX], [bottom[1], top[1]], [bottom[2] - radiusZ, bottom[2] + radiusZ]];
  return { wedges, bounds };
}
function subtractVolume(poly, { planes, bounds }) {
  if (outsideBounds(poly, bounds)) return [poly];
  const distance = ([a, b, c, d], [x, y, z]) => a * x + b * y + c * z - d;
  if (planes.some((plane) => poly.every((p) => distance(plane, p) < 0))) return [poly];
  const pieces = [];
  let inside = poly;
  for (const plane of planes) {
    const next = [], outside = [];
    for (let i = 0; i < inside.length; i++) {
      const a = inside[i], b = inside[(i + 1) % inside.length];
      const da = distance(plane, a), db = distance(plane, b);
      (da >= 0 ? next : outside).push(a);
      if ((da >= 0) !== (db >= 0)) {
        const point = a.map((v, k) => v + (b[k] - v) * da / (da - db));
        next.push(point); outside.push(point);
      }
    }
    if (outside.length >= 3) pieces.push(outside);
    if (next.length < 3) return [poly];
    inside = next;
  }
  return pieces;
}

function tubeInto(kit, { t, pts, mouth, rings, centres, portalVolumes }) {
  if (pts.length < 2) return;
  const n = MINE_RING_SIDES;
  const trim = (polygons, volumes) => {
    for (const volume of volumes) {
      if (!volume) continue;
      if (polygons.every((poly) => outsideBounds(poly, volume.bounds))) continue;
      for (const wedge of volume.wedges) polygons = polygons.flatMap((poly) => subtractVolume(poly, wedge));
    }
    return polygons;
  };
  const emit = (polygons, record, facing) => {
    for (const [a, ...rest] of polygons) for (let j = 0; j + 1 < rest.length; j++) {
      const b = rest[j], c = rest[j + 1];
      kit.tri(record, a, b, c, facing, true, a.slice(3), b.slice(3), c.slice(3));
    }
  };
  let along = 0;
  for (let i = 0; i + 1 < rings.length; i++) {
    const A = rings[i], B = rings[i + 1], len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], pts[i + 1][2] - pts[i][2]);
    const cm = [(centres[i][0] + centres[i + 1][0]) / 2, (centres[i][1] + centres[i + 1][1]) / 2, (centres[i][2] + centres[i + 1][2]) / 2];
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n, q = [A[k], A[k1], B[k1], B[k]];
      const m = [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2, (q[0][2] + q[2][2]) / 2];
      const floor = m[1] <= pts[i][1] + 0.05 * t.r + (pts[i + 1][1] - pts[i][1]) / 2;
      const uv = floor ? q.map((p) => [p[0] * UV, p[2] * UV]) :
        q.map((p, j) => [(along + (j < 2 ? 0 : len)) * UV + (j === 0 || j === 3 ? k : k + 1) * 0.15, p[1] * UV]);
      const facing = floor ? [0, 1, 0] : cm.map((v, j) => v - m[j]);
      const vertices = q.map((p, j) => [...p, ...uv[j]]);
      const triangles = [[vertices[0], vertices[1], vertices[2]], [vertices[0], vertices[2], vertices[3]]];
      const polygons = floor ? triangles : trim(triangles, portalVolumes);
      emit(polygons, floor ? FLOOR : WALL, facing);
    }
    along += len;
  }
  for (const [end, chamber] of portalVolumes.entries()) {
    if (!chamber && !(mouth && end === 0)) continue;
    const i = end === 0 ? 0 : rings.length - 1, j = end === 0 ? 1 : i - 1;
    const ring = rings[i], centre = centres[i];
    const facing = centres[j].map((v, axis) => v - centre[axis]);
    for (let k = 0; k < n; k++) {
      const poly = [centre, ring[k], ring[(k + 1) % n]].map((p) => [...p, p[0] * UV + p[2] * UV, p[1] * UV]);
      emit(trim([poly], [chamber]), WALL, facing);
    }
  }
}

function caveKit(/** @type {any} */ layout) {
  const kit = createMeshKit({ start: 4096 });
  const { chambers, tubes } = plan(layout);
  const portalVolumes = new Map([...chambers].map(([id, rec]) => [id, chamberVolume(rec)]));
  const meshTubes = tubes.map((tube, i) => {
    const { rings, centres } = tubeRings(tube, gateHash(layout.mineId, layout.reset, 0x7b, i));
    const doorSegments = [];
    for (let j = 0; j + 1 < rings.length; j++) {
      if (j < 3 || j >= rings.length - 4) doorSegments.push(ringVolume(rings[j], rings[j + 1], centres[j], centres[j + 1], TUNNEL_CUT));
    }
    const portals = [tube.t.from, tube.t.to].map((id) => portalVolumes.get(id));
    return { ...tube, rings, centres, doorSegments, portalVolumes: portals };
  });
  for (const rec of chambers.values()) chamberInto(kit, rec, meshTubes);
  for (const tube of meshTubes) tubeInto(kit, tube);
  return kit;
}

/**
 * @param {any} layout
 * @param {{ archive: number, wall: number, floor: number, ceiling: number }} tex
 */
export function buildMineModel(layout, tex) {
  const model = caveKit(layout).pack(0);
  const rec = [tex.wall, tex.floor, tex.ceiling];
  model.subMeshes = model.subMeshes.map((s) => ({ ...s, textureArchive: tex.archive, textureRecord: rec[s.textureRecord] }));
  return model;
}

/**
 * @param {any} layout
 * @returns {Float32Array}
 */
export function mineColliderTris(layout) {
  return caveKit(layout).pack(0).positions;
}

// Callers use this and not the layout `h`, because doorways can lift the ceiling past it.
export function mineChamberTop(/** @type {any} */ layout, /** @type {string} */ id) {
  const rec = plan(layout).chambers.get(id);
  return rec ? heights(rec).top : 0;
}
