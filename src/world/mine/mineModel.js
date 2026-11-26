// @ts-check
// BUNNYFALL (2026-11-25, caverns): THE MINE'S ROCK - a layout (net/mine/mineLayout.js) made into one mesh and one collider
// soup, drawn with Daggerfall's own cave textures.
//
// A CHAMBER is a lumpy dome: an ellipse of floor, a near-upright wall rising to `wallTop`, then a cap closing at its
// height. A TUNNEL is a tube of irregular rings along its floor points, its lower rings flattened into a walkable floor,
// clipped where it enters a chamber - and the chamber's wall is left open there, so the two meet in a doorway. The mouth's
// tunnel is closed by a flat wall at the mouth, where the way out stands. Every face looks into the cave (the world pass
// culls the back), so from inside it is rock all round and from outside nothing.
//
// The textures: archive 22 (Daggerfall's temperate cave set - record 0 rough rock, record 1 dirt) and, under the
// mountains, 322 (the darker mountain rock). Three sub-meshes: wall, floor, ceiling.
import { createMeshKit } from '../eliteGates/meshKit.js';
import { gateHash } from '../../net/gateLaw.js';
import { CLIMATES } from '../../formats/mapsTables.js';

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
/** Where a tube begins inside a chamber: this share of the rim's radius from the centre (just inside the wall). */
const STUB_IN = 0.94;
/** The wall's rows (m) and the gap over a doorway's top. */
const WALL_ROW_M = 0.6, DOOR_HEAD_M = 0.3;
/** How far a chamber's wall leans in, a share of its radius each metre it rises. */
const WALL_LEAN = 0.025;
/** Texels a metre: a 64-pixel tile every two metres. */
const UV = 0.5;

/**
 * The cave textures for a climate.
 * @param {number} worldClimate
 * @returns {{ archive: number, wall: number, floor: number, ceiling: number }}
 */
export function mineTextures(worldClimate) {
  if (worldClimate === CLIMATES.Mountain || worldClimate === CLIMATES.MountainWoods) return { archive: 322, wall: 0, floor: 2, ceiling: 1 };
  return { archive: 22, wall: 0, floor: 1, ceiling: 0 };
}

const unit = (/** @type {number[]} */ ...k) => gateHash(0x6d1e, ...k) / 4294967296;

/** A point of chamber `ch`'s rim at angle `a`, bulged by `b`, at height `y` over its floor. */
const rimAt = (/** @type {any} */ ch, /** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ s, /** @type {number} */ y) =>
  [ch.c[0] + Math.cos(a) * ch.rx * b * s, ch.c[1] + y, ch.c[2] + Math.sin(a) * ch.rz * b * s];
/** Whether (x, z) lies inside chamber `ch`'s ellipse (scaled by `s`). */
const inside = (/** @type {any} */ ch, /** @type {number} */ x, /** @type {number} */ z, s = 1) => ((x - ch.c[0]) / (ch.rx * s)) ** 2 + ((z - ch.c[2]) / (ch.rz * s)) ** 2 < 1;

/**
 * Every chamber by id, and each tunnel's run outside the chambers it joins (the doorway's angle and half width on each).
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
      let first = seq.findIndex((p) => !inside(ch, p[0], p[2]));
      if (first < 0) first = seq.length - 1;
      // where the tube crosses the rim (between the last point inside and the first outside), not the first point outside:
      // a curving tunnel can leave a metre or two along the wall from it
      let exit = seq[first], along = [0, 0];
      if (first > 0) along = [seq[first][0] - seq[first - 1][0], seq[first][2] - seq[first - 1][2]];
      if (first > 0) {
        const p = seq[first - 1], q = seq[first];
        let lo3 = 0, hi3 = 1;
        for (let k = 0; k < 20; k++) { const f = (lo3 + hi3) / 2; if (inside(ch, p[0] + (q[0] - p[0]) * f, p[2] + (q[2] - p[2]) * f)) lo3 = f; else hi3 = f; }
        exit = [p[0] + (q[0] - p[0]) * hi3, p[1], p[2] + (q[2] - p[2]) * hi3];
      }
      const a = Math.atan2((exit[2] - ch.c[2]) / ch.rz, (exit[0] - ch.c[0]) / ch.rx);
      const rim = Math.hypot(Math.cos(a) * ch.rx, Math.sin(a) * ch.rz);
      // a doorway: where the tube meets the wall - its heading, the rim's radius there, and the tube's narrowest
      // cross-section (its wobble taken in), so only wall wholly inside the tube is cut and no gap opens round it
      const lo = 1 - MINE_TUNNEL_WOBBLE;
      const speed = Math.hypot(Math.sin(a) * ch.rx, Math.cos(a) * ch.rz);   // metres of rim per radian of the ellipse's angle there
      // a tube meeting the wall aslant cuts it wider: its width over the cosine of the angle it meets the wall's normal at
      const nx = Math.cos(a) / ch.rx, nz = Math.sin(a) / ch.rz, nl = Math.hypot(nx, nz), al = Math.hypot(along[0], along[1]);
      const slant = al > 1e-6 ? Math.max(0.5, Math.abs(along[0] * nx + along[1] * nz) / (al * nl)) : 1;
      rec.doors.push({ a, rim, speed, hw: (t.r * lo) / slant, hh: t.r * vs * lo, yc: RING_LIFT * t.r * vs, top: tubeTop(t.r) * vs + DOOR_HEAD_M });
      // the run starts just inside the rim (its share STUB_IN of the way in), not at the last point inside, so the tube
      // stands no stub in the chamber for a body coming at the doorway aslant to meet
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

/** The angular distance between two angles. */
const angGap = (/** @type {number} */ a, /** @type {number} */ b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/**
 * One chamber into the kit: its floor, its wall (open at its doorways), its cap.
 * @param {any} kit
 * @param {any} rec
 */
function chamberInto(kit, rec) {
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
      if (doors.some((d) => [[ang(i), y0], [ang(i + 1), y0], [ang(i + 1), y1], [ang(i), y1]].every(([q, y]) => {
        const L = angGap(q, d.a) * d.speed;   // across the doorway, along the rim
        return (L / d.hw) ** 2 + ((y - d.yc) / d.hh) ** 2 <= 1;
      }))) continue;
      const s0 = 1 - WALL_LEAN * y0, s1 = 1 - WALL_LEAN * y1;   // the wall leans in as it rises
      const p = [rimAt(ch, ang(i), bulge(i), s0, y0), rimAt(ch, ang(i + 1), bulge(i + 1), s0, y0), rimAt(ch, ang(i + 1), bulge(i + 1), s1, y1), rimAt(ch, ang(i), bulge(i), s1, y1)];
      const m = [(p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2, (p[0][2] + p[2][2]) / 2];
      const arc = Math.hypot(p[1][0] - p[0][0], p[1][2] - p[0][2]) * UV;
      kit.quad(WALL, p[0], p[1], p[2], p[3], [centre[0] - m[0], 0, centre[2] - m[2]], true, [[i * arc, y0 * UV], [(i + 1) * arc, y0 * UV], [(i + 1) * arc, y1 * UV], [i * arc, y1 * UV]]);
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
 * @param {any} kit
 * @param {{ t: any, pts: number[][], mouth: boolean, vs: number }} tube
 * @param {number} seed
 */
function tubeInto(kit, { t, pts, mouth, vs }, seed) {
  if (pts.length < 2) return;
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
  let along = 0;
  for (let i = 0; i + 1 < rings.length; i++) {
    const A = rings[i], B = rings[i + 1], len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], pts[i + 1][2] - pts[i][2]);
    const cm = [(centres[i][0] + centres[i + 1][0]) / 2, (centres[i][1] + centres[i + 1][1]) / 2, (centres[i][2] + centres[i + 1][2]) / 2];
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n, q = [A[k], A[k1], B[k1], B[k]];
      const m = [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2, (q[0][2] + q[2][2]) / 2];
      const floor = m[1] <= pts[i][1] + 0.05 * t.r + (pts[i + 1][1] - pts[i][1]) / 2;
      const uv = [[k * UV * 1.5, along * UV], [(k + 1) * UV * 1.5, along * UV], [(k + 1) * UV * 1.5, (along + len) * UV], [k * UV * 1.5, (along + len) * UV]];
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
  for (const rec of chambers.values()) chamberInto(kit, rec);
  tubes.forEach((tube, i) => tubeInto(kit, tube, gateHash(layout.mineId, layout.reset, 0x7b, i)));
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
