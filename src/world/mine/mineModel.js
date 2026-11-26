// @ts-check
// Chamber walls and flattened tunnels meet at open doorways.
// The render faces point inward. The mesh and collider share the same cave geometry.
import { createMeshKit } from '../eliteGates/meshKit.js';
import { gateHash } from '../../net/gateLaw.js';

/** Buckets in the kit, remapped to their textures at the pack. */
const WALL = 0, FLOOR = 1, CEILING = 2;
/** A tunnel ring's sides, and how much its radius wobbles (a share either way). */
export const MINE_RING_SIDES = 10;
export const MINE_TUNNEL_WOBBLE = 0.15;
/** A chamber's rim: its sides round, and how far it bulges past the layout's ellipse (a share, out only, so a wall slot
 *  on the ellipse stands just off the rock). */
export const MINE_CHAMBER_SIDES = Object.freeze([40, 96]);
/** How wide a chamber wall's quad stands (m): fine enough that a doorway's cut follows its tunnel. */
export const MINE_WALL_QUAD_M = 0.8;
/** A chamber's sides round: its perimeter over MINE_WALL_QUAD_M, in MINE_CHAMBER_SIDES. */
const sidesOf = (/** @type {any} */ ch) => Math.max(MINE_CHAMBER_SIDES[0], Math.min(MINE_CHAMBER_SIDES[1], Math.ceil((Math.PI * (ch.rx + ch.rz) * (1 + MINE_CHAMBER_BULGE)) / MINE_WALL_QUAD_M)));
export const MINE_CHAMBER_BULGE = 0.12;
/** A tunnel ring's centre stands this share of its radius over the floor, so the floor is a flat strip. */
const RING_LIFT = 0.5;
/** A tunnel's top: the ring's centre and its radius. */
const tubeTop = (/** @type {number} */ r) => (RING_LIFT + 1) * r * (1 + MINE_TUNNEL_WOBBLE);
/** The headroom a tunnel keeps under its lower chamber's height (its doorway's head and the wall over it), and the
 *  least headroom a squashed tunnel keeps over its floor (m). */
const TUBE_UNDER_M = 0.6, TUBE_MIN_TOP_M = 3.6;
/** How far behind the mouth (m) the mouth's tunnel is closed, so the floor runs under the way out. */
const MOUTH_BACK_M = 1.5;
/** Where a tube begins inside a chamber, as a share of its radius. */
const STUB_IN = 0.74;
/** The wall's rows (m) and the gap over a doorway's top. */
const WALL_ROW_M = 0.6, DOOR_HEAD_M = 0.3;
/** How far a chamber's wall leans in, a share of its radius each metre it rises. */
const WALL_LEAN = 0.025;
/** Texels a metre: a 64-pixel tile every two metres. */
const UV = 0.5;

const unit = (/** @type {number[]} */ ...k) => gateHash(0x6d1e, ...k) / 4294967296;

/** A point of chamber `ch`'s rim at angle `a`, bulged by `b`, at height `y` over its floor. */
const rimAt = (/** @type {any} */ ch, /** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ s, /** @type {number} */ y) =>
  [ch.c[0] + Math.cos(a) * ch.rx * b * s, ch.c[1] + y, ch.c[2] + Math.sin(a) * ch.rz * b * s];
/** Whether (x, z) lies inside chamber `ch`'s ellipse (scaled by `s`). */
const inside = (/** @type {any} */ ch, /** @type {number} */ x, /** @type {number} */ z, s = 1) => ((x - ch.c[0]) / (ch.rx * s)) ** 2 + ((z - ch.c[2]) / (ch.rz * s)) ** 2 < 1;

/**
 * Every chamber by id, and the tunnel runs opening into each chamber.
 * @param {any} layout
 */
function plan(layout) {
  /** @type {Map<string, any>} */
  const chambers = new Map();
  for (const s of layout.sections) for (const ch of s.chambers) chambers.set(ch.id, { ch, doors: [] });
  const tubes = [];
  for (const t of layout.tunnels) {
    let pts = t.pts;
    // a tunnel is squashed (its rings flattened top to bottom) to stand under the lower of the chambers it joins
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
      // Extend the open end into the chamber, behind the leaning wall.
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
    if (mouth && pts.length >= 2) {   // the closing wall a little behind the way out
      const dx = pts[1][0] - pts[0][0], dz = pts[1][2] - pts[0][2], l = Math.hypot(dx, dz) || 1;
      pts = [[pts[0][0] - (dx / l) * MOUTH_BACK_M, pts[0][1], pts[0][2] - (dz / l) * MOUTH_BACK_M], ...pts];
    }
    tubes.push({ t, pts, mouth, vs });
  }
  return { chambers, tubes };
}

/** A chamber's wall top and its ceiling's height over its floor, room left for its doorways. */
function heights(/** @type {any} */ rec) {
  const doorTop = rec.doors.reduce((m, d) => Math.max(m, d.top), 0);
  const wallTop = Math.max(0.55 * rec.ch.h, doorTop);
  return { wallTop, top: Math.max(rec.ch.h, wallTop + 0.9) };
}

/**
 * One chamber into the kit: its floor, its wall (open at its doorways), its cap.
 * @param {any} kit
 * @param {any} rec
 * @param {any[]} tubes
 */
function chamberInto(kit, rec, tubes) {
  const { ch, doors } = rec, { wallTop, top } = heights(rec), n = sidesOf(rec.ch);
  const bulge = (/** @type {number} */ i) => 1 + MINE_CHAMBER_BULGE * unit(ch.c[0] * 100 | 0, ch.c[2] * 100 | 0, i % n);
  const ang = (/** @type {number} */ i) => (2 * Math.PI * i) / n;
  const centre = [ch.c[0], ch.c[1], ch.c[2]];
  // the floor: a fan from the centre, its rim the wall's foot
  for (let i = 0; i < n; i++) {
    const a = rimAt(ch, ang(i), bulge(i), 1, 0), b = rimAt(ch, ang(i + 1), bulge(i + 1), 1, 0);
    kit.tri(FLOOR, centre, a, b, [0, 1, 0], true, [centre[0] * UV, centre[2] * UV], [a[0] * UV, a[2] * UV], [b[0] * UV, b[2] * UV]);
  }
  // the wall: rows of quads up to wallTop, each looking at the chamber's upright axis; a quad in a doorway's span below
  // its top is left out
  const rows = Math.max(1, Math.ceil(wallTop / WALL_ROW_M));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < rows; j++) {
      const y0 = (wallTop * j) / rows, y1 = (wallTop * (j + 1)) / rows;
      const s0 = 1 - WALL_LEAN * y0, s1 = 1 - WALL_LEAN * y1;   // the wall leans in as it rises
      const p = [rimAt(ch, ang(i), bulge(i), s0, y0), rimAt(ch, ang(i + 1), bulge(i + 1), s0, y0), rimAt(ch, ang(i + 1), bulge(i + 1), s1, y1), rimAt(ch, ang(i), bulge(i), s1, y1)];
      const m = [(p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2, (p[0][2] + p[2][2]) / 2];
      const scale = (Math.PI * (ch.rx + ch.rz) * UV) / n;
      const u0 = i * scale, u1 = (i + 1) * scale;
      let polygons = [p.map((v, k) => [...v, k === 0 || k === 3 ? u0 : u1, v[1] * UV])];
      for (const door of doors) {
        for (const segment of tubes[door.tunnel].doorSegments) polygons = polygons.flatMap((poly) => cutTunnel(poly, segment));
      }
      const facing = [centre[0] - m[0], 0, centre[2] - m[2]];
      for (const [a, ...rest] of polygons) for (let k = 0; k + 1 < rest.length; k++) {
        const b = rest[k], c = rest[k + 1];
        kit.tri(WALL, a, b, c, facing, true, a.slice(3), b.slice(3), c.slice(3));
      }
    }
  }
  // the cap: from the wall's top in to the crown, two rings
  const s = 1 - WALL_LEAN * wallTop;
  const ringsY = [wallTop, wallTop + (top - wallTop) * 0.7, top];
  const ringsS = [s, s * 0.6, 0];
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < n; i++) {
      const a0 = rimAt(ch, ang(i), bulge(i), ringsS[r], ringsY[r]), b0 = rimAt(ch, ang(i + 1), bulge(i + 1), ringsS[r], ringsY[r]);
      const a1 = rimAt(ch, ang(i), bulge(i), ringsS[r + 1], ringsY[r + 1]), b1 = rimAt(ch, ang(i + 1), bulge(i + 1), ringsS[r + 1], ringsY[r + 1]);
      const look = [ch.c[0], ch.c[1] + wallTop * 0.5, ch.c[2]];
      const uv = [[a0[0] * UV, a0[2] * UV], [b0[0] * UV, b0[2] * UV], [b1[0] * UV, b1[2] * UV], [a1[0] * UV, a1[2] * UV]];
      const m = [(a0[0] + b1[0]) / 2, (a0[1] + b1[1]) / 2, (a0[2] + b1[2]) / 2], into = [look[0] - m[0], look[1] - m[1], look[2] - m[2]];   // facing into the chamber
      if (r === 1) kit.tri(CEILING, a0, b0, a1, into, true, uv[0], uv[1], uv[3]);
      else kit.quad(CEILING, a0, b0, b1, a1, into, true, uv);
    }
  }
}

/**
 * One tunnel's run into the kit: rings of MINE_RING_SIDES about its floor points, their lower points flattened onto the
 * floor; the mouth's run closed by a flat wall at its first ring.
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
    const side = [tz, 0, -tx];   // horizontal, across the way
    const p = pts[i], c = [p[0], p[1] + RING_LIFT * t.r * vs, p[2]];
    const ring = [];
    for (let k = 0; k < n; k++) {
      const a2 = (2 * Math.PI * k) / n, w = 1 + MINE_TUNNEL_WOBBLE * (2 * unit(seed, i, k) - 1), r = t.r * w;
      const u = Math.cos(a2) * r, v = Math.max(-RING_LIFT * t.r, Math.sin(a2) * r) * vs;   // flattened: never under the floor
      ring.push([c[0] + side[0] * u, c[1] + v, c[2] + side[2] * u]);
    }
    rings.push(ring); centres.push(c);
  }
  return { rings, centres };
}

/** Planes of a tunnel segment, oriented toward the inside. */
function tunnelSegment(a, b, ca, cb) {
  const middle = ca.map((v, i) => (v + cb[i]) / 2);
  const planes = [];
  const plane = (p, q, r, offset = 0) => {
    const u = q.map((v, i) => v - p[i]), v = r.map((w, i) => w - p[i]);
    let x = u[1] * v[2] - u[2] * v[1], y = u[2] * v[0] - u[0] * v[2], z = u[0] * v[1] - u[1] * v[0];
    const length = Math.hypot(x, y, z);
    if (length < 1e-8) return;
    const sign = x * (middle[0] - p[0]) + y * (middle[1] - p[1]) + z * (middle[2] - p[2]) >= 0 ? 1 : -1;
    const scale = sign / length;
    x *= scale; y *= scale; z *= scale;
    planes.push([x, y, z, x * p[0] + y * p[1] + z * p[2] + offset]);
  };
  plane(a[0], a[2], a[4], -0.015);
  plane(b[0], b[2], b[4], -0.015);
  for (let k = 0; k < a.length; k++) {
    const next = (k + 1) % a.length;
    const floor = [a[k], a[next], b[k], b[next]].every((p, i) => p[1] < (i < 2 ? ca : cb)[1] - 0.1);
    plane(a[k], a[next], b[next], floor ? -0.03 : 0.04);
    plane(a[k], b[next], b[k], floor ? -0.03 : 0.04);
  }
  const points = [...a, ...b];
  const bounds = [0, 1, 2].map((i) => {
    const values = points.map((p) => p[i]);
    return [Math.min(...values) - 0.4, Math.max(...values) + 0.4];
  });
  return { planes, bounds };
}
/** Keep the pieces of the wall outside the tunnel's actual cross-section. */
function cutTunnel(poly, { planes, bounds }) {
  if (bounds.some(([min, max], i) => poly.every((p) => p[i] < min) || poly.every((p) => p[i] > max))) return [poly];
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

function tubeInto(kit, { t, pts, mouth, rings, centres }) {
  if (pts.length < 2) return;
  const n = MINE_RING_SIDES;
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
      kit.quad(floor ? FLOOR : WALL, q[0], q[1], q[2], q[3], [cm[0] - m[0], cm[1] - m[1], cm[2] - m[2]], true, uv);
    }
    along += len;
  }
  if (mouth) {
    const ring = rings[0], c = centres[0], into = [pts[1][0] - pts[0][0], 0, pts[1][2] - pts[0][2]];
    for (let k = 0; k < n; k++) kit.tri(WALL, c, ring[k], ring[(k + 1) % n], into, true);
  }
}

/** The whole cave into a fresh kit. */
function caveKit(/** @type {any} */ layout) {
  const kit = createMeshKit({ start: 4096 });
  const { chambers, tubes } = plan(layout);
  const meshTubes = tubes.map((tube, i) => {
    const { rings, centres } = tubeRings(tube, gateHash(layout.mineId, layout.reset, 0x7b, i));
    const doorSegments = [];
    for (let j = 0; j + 1 < rings.length; j++) {
      if (j < 3 || j >= rings.length - 4) doorSegments.push(tunnelSegment(rings[j], rings[j + 1], centres[j], centres[j + 1]));
    }
    return { ...tube, rings, centres, doorSegments };
  });
  for (const rec of chambers.values()) chamberInto(kit, rec, meshTubes);
  for (const tube of meshTubes) tubeInto(kit, tube);
  return kit;
}

/**
 * THE CAVE'S MESH: renderer.createMesh's model, three sub-meshes (wall, floor, ceiling) under their cave textures.
 * @param {any} layout a MineLayout
 * @param {{ archive: number, wall: number, floor: number, ceiling: number }} tex
 */
export function buildMineModel(layout, tex) {
  const model = caveKit(layout).pack(0);
  const rec = [tex.wall, tex.floor, tex.ceiling];
  model.subMeshes = model.subMeshes.map((s) => ({ ...s, textureArchive: tex.archive, textureRecord: rec[s.textureRecord] }));
  return model;
}

/**
 * THE CAVE'S SOLIDS: every triangle the mesh draws, as xyz triples (collider.addMesh's soup).
 * @param {any} layout a MineLayout
 * @returns {Float32Array}
 */
export function mineColliderTris(layout) {
  return caveKit(layout).pack(0).positions;
}

/** A chamber's ceiling height over its floor as the mesh stands it (its doorways may lift it past the layout's `h`). */
export function mineChamberTop(/** @type {any} */ layout, /** @type {string} */ id) {
  const rec = plan(layout).chambers.get(id);
  return rec ? heights(rec).top : 0;
}
