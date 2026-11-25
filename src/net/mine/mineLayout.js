// @ts-check
// BUNNYFALL (2026-11-25, caverns): the mine layout law, a cave's shape from its mineId and its weekly reset.
// Shared by the client, the relay and the account service (ruling R2): it hashes with gateHash and imports no client
// module. Pure: the same (mineId, reset) gives the same layout on every machine.
//
// Units are metres, y up. The mouth stands at the origin; the mine winds down from it as a meandering descent of
// sections, each a few chambers on one level (a chamber's floor is at c[1]), each section lower than the last.
// A tunnel's `pts` run along its floor, a point about every 2 m, from a point inside one chamber (or the mouth) to a
// point inside the next. `rails` is the main line, mouth to the deepest chamber, through each chamber's center.
// `mouth.facing` is the heading into the mine, in radians: the way in is [cos(facing), 0, sin(facing)]. A chamber's
// ellipse is axis aligned (rx along x, rz along z). A wall slot stands on that ellipse 1 m above the floor, `n` its
// inward unit normal; a hole stands on the floor, at least 3 m from every wall slot.
import { gateHash } from '../gateLaw.js';

/** Sections a mine has (inclusive). */
export const MINE_SECTIONS = Object.freeze([4, 6]);
/** Chambers a section has, its dead-end pocket counted (inclusive). */
export const MINE_CHAMBERS = Object.freeze([2, 4]);
/** Ore holes a chamber has (inclusive). */
export const MINE_HOLES = Object.freeze([1, 3]);
/** How far each section's floor lies below the last one's (the first section's below the mouth), in metres. */
export const MINE_DROP_M = Object.freeze([6, 12]);
/** A tunnel's radius, in metres. */
export const MINE_TUNNEL_R = Object.freeze([2.2, 3.2]);
/** A chamber's half widths (rx, rz), in metres. */
export const MINE_CHAMBER_R = Object.freeze([6, 11]);
/** A dead-end pocket's half widths, in metres. */
export const MINE_POCKET_R = Object.freeze([5, 6.5]);
/** Share of wall slots that are weak. */
export const MINE_WEAK_SHARE = 0.3;
/** Wall slots a chamber has (inclusive). */
export const MINE_WALLS = Object.freeze([6, 10]);
/** How far one chamber's center steps from the last, in metres (longer when the chambers or the slope need it). */
export const MINE_STEP_M = Object.freeze([18, 30]);
/** The most a main-line heading turns from one chamber to the next. */
export const MINE_TURN = 70 * Math.PI / 180;

const SHALLOW = Object.freeze(['metal:iron', 'metal:copper', 'metal:tin']);
const MIDDLE = Object.freeze([...SHALLOW, 'metal:silver', 'metal:gold']);
const DEEP = Object.freeze([...MIDDLE, 'metal:platinum']);
/** The ores a section's holes hold, by section index (a section past the end holds the last row's). */
export const MINE_ORES_BY_DEPTH = Object.freeze([SHALLOW, SHALLOW, MIDDLE, MIDDLE, DEEP, DEEP]);
/** A rich mine's deepest section holds one of these. */
export const MINE_RICH_ORES = Object.freeze(['ore:mithril', 'ore:ebony', 'ore:orichalcum', 'ore:adamantium']);

/** The ores section `i` holds. */
export const mineOresAt = (/** @type {number} */ i) => MINE_ORES_BY_DEPTH[Math.min(Math.max(0, i), MINE_ORES_BY_DEPTH.length - 1)];
/** One mine in eight is rich (roll 9 of its reset). */
export const mineIsRich = (/** @type {number} */ mineId, /** @type {number} */ reset) => gateHash(mineId, reset, 9) % 8 === 0;

const TAU = Math.PI * 2;
const FIRST_ROLL = 16;        // rolls 0 to 15 are kept for named rolls (9: rich, 10: the rich ore)
const CLEAR_M = 2.5;          // gap kept between two chambers' widest ellipses (the law asks 2)
const MOUTH_CLEAR_M = 4;      // no chamber within this of the mouth, past its own width
const INSET = 0.6;            // a tunnel ends this share of the way from a chamber's center to its rim
const MAX_GRADE = 0.55;       // rise over run a tunnel's chord may have (about 29 degrees; the law allows 35)
const MIN_CHORD_M = 6;        // the shortest tunnel, rim to rim
const SECTION_STEP_M = Object.freeze([0.5, 2]);   // each main chamber within a section lies this much below the last
const WOBBLE_M = 3;           // a tunnel's sideways wobble
const PT_STEP_M = 2;          // spacing of a tunnel's points
const WALL_Y = 1;             // a wall slot's height above its chamber's floor
const POCKET_APART = Math.PI / 3;   // a pocket's tunnel leaves its chamber this far from the chamber's other tunnels
const HOLE_WALL_M = 3;        // a hole keeps this far from every wall slot (veins stand by the walls, 2 m off a hole)

/**
 * @typedef {{ k: number, at: number[], ore: string, rich: number }} MineHole
 * @typedef {{ k: number, at: number[], n: number[], weak: boolean }} MineWall
 * @typedef {{ id: string, c: number[], rx: number, rz: number, h: number, holes: MineHole[], walls: MineWall[] }} MineChamber
 * @typedef {{ from: string, to: string, pts: number[][], r: number }} MineTunnel
 * @typedef {{ mineId: number, reset: number, mouth: { at: number[], facing: number },
 *   sections: Array<{ i: number, depth: number, chambers: MineChamber[] }>, tunnels: MineTunnel[], rails: number[][] }} MineLayout
 * @typedef {{ id: string, x: number, y: number, z: number, rx: number, rz: number, h: number, ends: Array<{ ang: number, r: number }> }} Cell
 * @typedef {{ from: string, to: string, a: number[], b: number[], r: number }} Bore
 */

const cm = (/** @type {number} */ v) => Math.round(v * 100) / 100;
const cmAll = (/** @type {number[]} */ p) => p.map(cm);
const widest = (/** @type {{ rx: number, rz: number }} */ c) => Math.max(c.rx, c.rz);
/** Distance from an ellipse's center to its rim along the unit direction (ux, uz). */
const rim = (/** @type {number} */ rx, /** @type {number} */ rz, /** @type {number} */ ux, /** @type {number} */ uz) => 1 / Math.sqrt((ux / rx) ** 2 + (uz / rz) ** 2);
/** The smaller angle between two headings. */
function angleApart(/** @type {number} */ a, /** @type {number} */ b) {
  let d = (a - b) % TAU;
  if (d < 0) d += TAU;
  return Math.min(d, TAU - d);
}
/** Distance from point p to segment ab, on the ground plane. */
function segmentDistance(/** @type {number} */ px, /** @type {number} */ pz, /** @type {number} */ ax, /** @type {number} */ az, /** @type {number} */ bx, /** @type {number} */ bz) {
  const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
/** Points every PT_STEP_M from a to b (a left out), flat or sloped. */
function line(/** @type {number[]} */ a, /** @type {number[]} */ b) {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / PT_STEP_M));
  const out = [];
  for (let q = 1; q <= n; q++) out.push(a.map((v, i) => v + (b[i] - v) * q / n));
  return out;
}
/** @template T @param {T} o @returns {T} */
function freezeDeep(o) {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o)) freezeDeep(v);
    Object.freeze(o);
  }
  return o;
}

/**
 * The shape of a mine for one reset.
 * @param {number} mineId the mine's pixel id (mineSites.js mineIdOf)
 * @param {number} reset the weekly reset's number
 * @returns {Readonly<MineLayout>}
 */
export function mineLayout(mineId, reset) {
  let k = FIRST_ROLL;
  const roll = () => gateHash(mineId, reset, k++) / 4294967296;
  const span = (/** @type {readonly number[]} */ [a, b]) => a + (b - a) * roll();
  const count = (/** @type {readonly number[]} */ [a, b]) => a + Math.floor(roll() * (b - a + 1));

  /** @type {Cell[]} */
  const cells = [];
  /** @type {Bore[]} */
  const bores = [];
  /** @type {Cell[][]} */
  const sectionCells = [];
  /** @type {Bore[]} the main line's tunnels, mouth first */
  const mainBores = [];
  /** @type {Cell[]} the main line's chambers, in order */
  const mainCells = [];

  /** Does a chamber of widest half width `R` fit at (x, z), its tunnel from (ax, az) over floors y0..y1 clear? */
  const fits = (/** @type {number} */ x, /** @type {number} */ z, /** @type {number} */ R, /** @type {number} */ ax, /** @type {number} */ az,
    /** @type {number} */ y0, /** @type {number} */ y1, /** @type {number} */ r, /** @type {Cell|null} */ from, /** @type {boolean} */ path) => {
    if (Math.hypot(x, z) <= R + MOUTH_CLEAR_M) return false;
    for (const c of cells) {
      if (Math.hypot(x - c.x, z - c.z) <= R + widest(c) + CLEAR_M) return false;
      if (path && c !== from && c.y < y1 + 2 * r && c.y + c.h > y0 && segmentDistance(c.x, c.z, ax, az, x, z) <= widest(c) + r + 1) return false;
    }
    return true;
  };

  /**
   * Place a new chamber from `from` (a chamber, or null for the mouth) on a heading near `heading`, and bore the
   * tunnel to it.
   * @param {Cell|null} from
   * @param {{ id: string, y: number, rx: number, rz: number, h: number }} shape
   * @param {number} heading
   * @param {number} turn the most the heading may turn
   * @param {number[]} avoid headings the tunnel should leave `from` away from (a pocket's)
   */
  const place = (from, shape, heading, turn, avoid) => {
    const fx = from ? from.x : 0, fz = from ? from.z : 0, fy = from ? from.y : 0;
    const drop = fy - shape.y, R = widest(shape), r = span(MINE_TUNNEL_R);
    /** @param {number} hd @param {number} step */
    const reach = (hd, step) => {
      const ux = Math.cos(hd), uz = Math.sin(hd);
      const insets = INSET * ((from ? rim(from.rx, from.rz, ux, uz) : 0) + rim(shape.rx, shape.rz, ux, uz));
      return Math.max(step, (from ? widest(from) : 0) + R + CLEAR_M + 0.01, drop / MAX_GRADE + insets, MIN_CHORD_M + insets);
    };
    let pick = null;
    let first = 0;
    for (let a = 0; a < 16 && !pick; a++) {
      const hd = heading + (roll() * 2 - 1) * turn;
      const d = reach(hd, span(MINE_STEP_M));
      if (a === 0) first = hd;
      if (a < 12 && avoid.some((e) => angleApart(e, hd) < POCKET_APART)) continue;
      const x = fx + Math.cos(hd) * d, z = fz + Math.sin(hd) * d;
      if (fits(x, z, R, fx, fz, Math.min(fy, shape.y), Math.max(fy, shape.y), r, from, true)) pick = { hd, x, z };
    }
    // No heading fit: walk out along the first one until the chamber clears every other.
    for (let d = reach(first, MINE_STEP_M[1]); !pick; d += 3) {
      const x = fx + Math.cos(first) * d, z = fz + Math.sin(first) * d;
      if (fits(x, z, R, fx, fz, 0, 0, r, from, false)) pick = { hd: first, x, z };
    }
    const { hd, x, z } = pick;
    const ux = Math.cos(hd), uz = Math.sin(hd);
    /** @type {Cell} */
    const cell = { ...shape, x, z, ends: [{ ang: hd + Math.PI, r }] };
    cells.push(cell);
    const ri = rim(cell.rx, cell.rz, ux, uz);
    const a = from ? [fx + ux * INSET * rim(from.rx, from.rz, ux, uz), fy, fz + uz * INSET * rim(from.rx, from.rz, ux, uz)] : [0, 0, 0];
    if (from) from.ends.push({ ang: hd, r });
    /** @type {Bore} */
    const bore = { from: from ? from.id : 'mouth', to: cell.id, a, b: [x - ux * INSET * ri, shape.y, z - uz * INSET * ri], r };
    bores.push(bore);
    return { cell, bore, hd };
  };

  /** A chamber's shape: a pocket is small, its roof low. */
  const shapeOf = (/** @type {string} */ id, /** @type {number} */ y, /** @type {boolean} */ pocket) => {
    const rx = span(pocket ? MINE_POCKET_R : MINE_CHAMBER_R), rz = span(pocket ? MINE_POCKET_R : MINE_CHAMBER_R);
    const h = pocket ? 4 + roll() : 4.5 + 0.3 * Math.max(rx, rz) + 1.5 * roll();
    return { id, y, rx, rz, h };
  };

  // The main line, section by section, then each section's pocket off one of its chambers.
  const sectionCount = count(MINE_SECTIONS);
  /** @type {Cell|null} */
  let last = null;
  let heading = roll() * TAU;
  let facing = heading;
  for (let i = 0; i < sectionCount; i++) {
    const pocket = roll() < 0.5;
    const n = pocket ? Math.max(3, count(MINE_CHAMBERS)) : count(MINE_CHAMBERS);
    const main = pocket ? n - 1 : n;
    let y = (last ? last.y : 0) - span(MINE_DROP_M);
    /** @type {Cell[]} */
    const here = [];
    for (let j = 0; j < main; j++) {
      if (j > 0) y -= span(SECTION_STEP_M);
      const placed = place(last, shapeOf(`s${i}c${j}`, y, false), heading, last ? MINE_TURN : 0, []);
      if (!last) facing = placed.hd;
      heading = placed.hd;
      last = placed.cell;
      here.push(placed.cell);
      mainCells.push(placed.cell);
      mainBores.push(placed.bore);
    }
    if (pocket) {
      const parent = here[Math.floor(roll() * (main - 1))];
      const placed = place(parent, shapeOf(`s${i}c${main}`, parent.y, true), 0, Math.PI, parent.ends.map((e) => e.ang));
      here.push(placed.cell);
    }
    sectionCells.push(here);
  }

  // The tunnels' floors: a Catmull-Rom curve through wobbling points, a point every 2 m, sloping evenly along its length.
  /** @param {Bore} bore @returns {number[][]} */
  const boreFloor = (bore) => {
    const { a, b } = bore;
    const dx = b[0] - a[0], dz = b[2] - a[2], chord = Math.hypot(dx, dz);
    const nx = -dz / chord, nz = dx / chord;
    const m = Math.floor(chord / 8);
    const ctrl = [[a[0], a[2]]];
    for (let q = 1; q <= m; q++) {
      const f = q / (m + 1), off = (roll() * 2 - 1) * WOBBLE_M;
      ctrl.push([a[0] + dx * f + nx * off, a[2] + dz * f + nz * off]);
    }
    ctrl.push([b[0], b[2]]);
    const p = [
      [2 * ctrl[0][0] - ctrl[1][0], 2 * ctrl[0][1] - ctrl[1][1]], ...ctrl,
      [2 * ctrl[ctrl.length - 1][0] - ctrl[ctrl.length - 2][0], 2 * ctrl[ctrl.length - 1][1] - ctrl[ctrl.length - 2][1]],
    ];
    const dense = [[a[0], a[2]]];
    for (let s = 1; s < p.length - 2; s++) for (let q = 1; q <= 16; q++) {
      const t = q / 16, t2 = t * t, t3 = t2 * t;
      dense.push([0, 1].map((i) => 0.5 * (2 * p[s][i] + (p[s + 1][i] - p[s - 1][i]) * t
        + (2 * p[s - 1][i] - 5 * p[s][i] + 4 * p[s + 1][i] - p[s + 2][i]) * t2
        + (3 * p[s][i] - p[s - 1][i] - 3 * p[s + 1][i] + p[s + 2][i]) * t3)));
    }
    const along = [0];
    for (let q = 1; q < dense.length; q++) along.push(along[q - 1] + Math.hypot(dense[q][0] - dense[q - 1][0], dense[q][1] - dense[q - 1][1]));
    const total = along[along.length - 1];
    const n = Math.max(1, Math.round(total / PT_STEP_M));
    const out = [a.slice()];
    let q = 1;
    for (let s = 1; s < n; s++) {
      const want = total * s / n;
      while (along[q] < want) q++;
      const f = (want - along[q - 1]) / (along[q] - along[q - 1]);
      out.push([dense[q - 1][0] + (dense[q][0] - dense[q - 1][0]) * f, a[1] + (b[1] - a[1]) * want / total, dense[q - 1][1] + (dense[q][1] - dense[q - 1][1]) * f]);
    }
    out.push(b.slice());
    return out.map(cmAll);
  };
  const floors = new Map(bores.map((bore) => [bore, boreFloor(bore)]));

  // Wall slots stand on the rim, out of the tunnels' mouths; holes stand on the floor, off the tunnels' paths.
  const rich = mineIsRich(mineId, reset);
  const richOre = MINE_RICH_ORES[gateHash(mineId, reset, 10) % MINE_RICH_ORES.length];
  /** @param {Cell} c @param {number} i */
  const finish = (c, i) => {
    const open = [];
    for (let s = 0; s < 72; s++) {
      const t = s * TAU / 72, world = Math.atan2(c.rz * Math.sin(t), c.rx * Math.cos(t));
      if (c.ends.every((e) => angleApart(world, e.ang) > Math.atan2(e.r + 2, rim(c.rx, c.rz, Math.cos(e.ang), Math.sin(e.ang))))) open.push(t);
    }
    // Slots stand at least three 5-degree steps apart where the rim has room for six that way.
    const angles = open.length >= MINE_WALLS[0] ? open : Array.from({ length: 72 }, (_, s) => s * TAU / 72);
    const n = Math.max(MINE_WALLS[0], Math.min(count(MINE_WALLS), Math.floor(angles.length / 3)));
    const from = roll() * angles.length / n;
    const walls = [];
    for (let w = 0; w < n; w++) {
      const t = angles[Math.floor(from + w * angles.length / n) % angles.length];
      const ox = Math.cos(t) / c.rx, oz = Math.sin(t) / c.rz, len = Math.hypot(ox, oz);
      walls.push({ k: w, at: cmAll([c.x + c.rx * Math.cos(t), c.y + WALL_Y, c.z + c.rz * Math.sin(t)]), n: [cm(-ox / len), 0, cm(-oz / len)], weak: roll() < MINE_WEAK_SHARE });
    }
    const paths = c.ends.map((e) => { const ri = INSET * rim(c.rx, c.rz, Math.cos(e.ang), Math.sin(e.ang)); return [c.x + Math.cos(e.ang) * ri, c.z + Math.sin(e.ang) * ri]; });
    const ores = rich && i === sectionCount - 1 ? [richOre] : mineOresAt(i);
    const want = count(MINE_HOLES);
    // Floor spots on rings around the center, every one HOLE_WALL_M off the walls, tried from a rolled start; each
    // pass that leaves holes wanting asks less: first off the tunnels' paths and 3 m apart, then 3 m apart, then 2, then 1.
    const spots = [];
    for (let s = 0; s < 24; s++) for (const f of [0.15, 0.25, 0.35, 0.45, 0.55]) {
      const t = s * TAU / 24, x = c.x + f * c.rx * Math.cos(t), z = c.z + f * c.rz * Math.sin(t);
      if (walls.every((w) => Math.hypot(w.at[0] - x, w.at[2] - z) >= HOLE_WALL_M)) spots.push([x, z]);
    }
    const start = Math.floor(roll() * spots.length);
    /** @type {MineHole[]} */
    const holes = [];
    for (const [offPath, apart] of /** @type {Array<[boolean, number]>} */ ([[true, 3], [false, 3], [false, 2], [false, 1]])) {
      for (let s = 0; s < spots.length && holes.length < want; s++) {
        const [x, z] = spots[(start + s) % spots.length];
        if (offPath && !paths.every(([px, pz]) => segmentDistance(x, z, c.x, c.z, px, pz) >= 2)) continue;
        if (!holes.every((h) => Math.hypot(h.at[0] - x, h.at[2] - z) >= apart)) continue;
        holes.push({ k: holes.length, at: cmAll([x, c.y, z]), ore: '', rich: 0 });
      }
    }
    for (const h of holes) {
      h.ore = ores[Math.floor(roll() * ores.length)];
      h.rich = count([1, 3]);
    }
    return { id: c.id, c: cmAll([c.x, c.y, c.z]), rx: cm(c.rx), rz: cm(c.rz), h: cm(c.h), holes, walls };
  };
  const sections = sectionCells.map((here, i) => ({ i, depth: cm(-here[0].y), chambers: here.map((c) => finish(c, i)) }));
  const tunnels = bores.map((bore) => ({ from: bore.from, to: bore.to, pts: /** @type {number[][]} */ (floors.get(bore)), r: cm(bore.r) }));

  // The rails: each main tunnel, then across its chamber's floor through the center to the next tunnel.
  /** @type {number[][]} */
  const rails = [];
  mainBores.forEach((bore, q) => {
    const pts = /** @type {number[][]} */ (floors.get(bore));
    rails.push(...(q === 0 ? pts : pts.slice(1)));
    const c = mainCells[q], center = [c.x, c.y, c.z];
    rails.push(...line(pts[pts.length - 1], center).map(cmAll));
    if (q + 1 < mainBores.length) rails.push(...line(center, mainBores[q + 1].a).map(cmAll));
  });

  return freezeDeep({ mineId, reset, mouth: { at: [0, 0, 0], facing: cm(facing) }, sections, tunnels, rails });
}
