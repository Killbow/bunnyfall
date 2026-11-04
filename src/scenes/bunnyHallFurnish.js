// @ts-check
// BUNNY-GUILDS (2026-11-04, the owner: "distinctive interiors that read as established institutions"; asked, "themed per
// guild" and "remove all house furniture"): A HALL'S FURNISHING. A hall is a converted house (systems/guild/bunnyGuilds.js),
// and inside it was a home. Now:
//   - THE HOUSE GOES: every piece of its furniture (the room's prop models, ladders and a mill's workings aside) and
//     every flat that is not a light. The shell, its doors, its lights and its people stay.
//   - THE HALL'S OWN: the guild's arms behind the clerk (bunnyHallDress.js), a brazier either side of them (Daggerfall's
//     brazier torch, which lights the room), the roster board and the stores chest (the crown's hall's own two,
//     systems/crownHall.js crownHallPlan, the chest a house's own), each against a wall.
//   - THE GUILD'S TRADE: pieces Daggerfall itself stands in the matching buildings - a library's shelves for the
//     Cartographers, an armourer's racks for the Adventurers, an alchemist's shelves and a lab's things for the
//     Apothecaries (HALL_SETS) - against the room's walls with their backs to them, and the small things on the tables.
// WHERE is measured in the room's own collider, about the clerk, as the crown's throne room is: the floor the clerk stands
// on is walked out from them (the clerk's storey, the cells a body fits in), each piece takes the wall spot farthest from
// what already stands, and the way from the door to the clerk and every doorway stay clear. A function of the room alone,
// so every client stands the same hall. A room with no clerk, or no wall in reach, gets the house stripped and nothing
// more is lost: what fits stands, what does not is left out.
// The plan is pure (positions in, positions out); `furnishBunnyHall` stands it in a room being built.
import { crownHallPlan } from '../systems/crownHall.js';
import { bunnyGuildOfKey } from '../systems/guild/bunnyGuilds.js';
import { collectInteriorLights } from '../world/interior/interiorLights.js';
import { PROP_MODEL_TYPE } from '../world/interior/interiorLayout.js';
import { LADDER_MODEL_ID } from '../player/enterExit.js';
import { MACHINERY_MODEL_ID } from '../world/windmillMesh.js';

const LIGHTS_ARCHIVE = 210;
/** Daggerfall's brazier torch. */
export const HALL_BRAZIER = Object.freeze({ archive: LIGHTS_ARCHIVE, record: 20 });
/** Metres: how far outside a banner its brazier stands (along the wall), and how far off the wall. */
export const HALL_BRAZIER_SIDE_M = 1.1;
export const HALL_BRAZIER_OFF_M = 0.55;

/** THE HOUSE'S FURNITURE: a prop model that is not the building's workings. */
export const isHouseFurniture = (/** @type {{ objectType: number, modelIdNum: number }} */ p) =>
  p.objectType === PROP_MODEL_TYPE && p.modelIdNum !== LADDER_MODEL_ID && p.modelIdNum !== MACHINERY_MODEL_ID;
/** The house's flats taken out of a hall: all but the lights. In place. @param {{ flats: any[] }} interior */
export function stripHallFlats(interior) {
  interior.flats = interior.flats.filter((f) => f.archive === LIGHTS_ARCHIVE);
}

/** Where a model's back is, in its own frame - measured off Daggerfall's own rooms (the wall a placement stands against,
 *  in every building that stands it): `-z` or `+z`; `free` stands away from a wall (a table, a bench, a crate). */
const BACK = Object.freeze({
  41040: '-z', 41019: '-z', 41018: '-z', 41032: '-z',   // a weapon rack; two library shelves; a cupboard
  41006: '+z', 41046: '+z', 41042: '+z',   // a tavern's shelf; a store's goods shelf; an alchemist's shelf (41046's twin)
  41108: 'free', 41112: 'free', 41109: 'free', 41110: 'free', 41105: 'free', 41100: 'free',   // tables, a bench, a barrel
  41822: 'free', 41826: 'free', 41827: 'free', 41828: 'free', 41829: 'free',   // crates
  41739: '-z', 41812: '+z',   // the roster board (a face each side; its +z one into the room) and the stores chest
});
/** THE HALL'S OWN, every guild's, stood first: the roster board and the stores chest, each against a wall. */
const HALL_BOARD = 41739, HALL_CHEST = 41812;
const TABLES = new Set([41108, 41112, 41109, 41110]);
/** THE GUILDS' TRADES. `wall`: models stood with their backs to a wall, in order (each the next wall spot); `floor`:
 *  free-standing models, a step off the walls; `table`: flats laid on the tables; `ground`: flats stood by a wall. Every
 *  piece is one Daggerfall stands in the buildings named. */
export const HALL_SETS = Object.freeze({
  adventurers: { wall: [41040, 41040, 41019], floor: [41108, 41105], table: [[207, 12], [207, 9]], ground: [[207, 10], [207, 11], [207, 13], [207, 14]] },   // an armourer's and a weaponsmith's
  bards: { wall: [41006, 41006], floor: [41110, 41105, 41105], table: [[210, 5], [210, 21]], ground: [] },   // a tavern's
  cartographers: { wall: [41019, 41018, 41019, 41018], floor: [41109], table: [[209, 15], [209, 0], [209, 6]], ground: [] },   // a library's
  merchants: { wall: [41046, 41046], floor: [41822, 41826, 41827, 41828, 41100], table: [], ground: [[205, 0]] },   // a general store's
  hunters: { wall: [41040, 41006], floor: [41108, 41105, 41827, 41100], table: [[207, 9]], ground: [[207, 10], [207, 13]] },   // a weaponsmith's and a tavern's
  apothecaries: { wall: [41042, 41042, 41018], floor: [41108, 41112], table: [[208, 2], [208, 6], [205, 5], [205, 12]], ground: [] },   // an alchemist's and a mages' guild's
  artisans: { wall: [41046, 41040], floor: [41109, 41827, 41828], table: [[211, 51], [205, 31]], ground: [] },   // a weaponsmith's and a store's
});

/** The walk: its cell, how far out from the clerk it looks, the storey's slack, a body's clear radius and heights. */
const CELL_M = 0.5;
const REACH_M = 14;
const STOREY_M = 0.35;
const BODY_R = 0.25;
const BODY_HEIGHTS = [0.5, 1.2];
/** Kept clear: a doorway, the way in, the clerk; between pieces. */
const DOOR_CLEAR_M = 1.4;
const AISLE_CLEAR_M = 0.9;
const CLERK_CLEAR_M = 1.6;
const PIECE_GAP_M = 0.25;
/** A free-standing piece keeps this much off a wall, so the room is walked round it. */
const FREE_WALL_M = 0.8;

/**
 * THE HALL'S PLAN about its clerk. `room`: `{ people, key, ray(o, d, max), open(p, r), axes: [[ax, az], [bx, bz]],
 * avoid: [[x, y, z, r]], way: [[x, y, z]] (the way in's points), box(model) -> { mn, mx } }`, all in one frame.
 * Answers `{ braziers: [{x,y,z}], pieces: [{ model, pos, yawDeg, k }], flats: [{ archive, record, x, y, z }] }`, or null.
 * @param {any} room
 */
export function bunnyHallPlan(room) {
  const { people, key, ray } = room;
  const guild = key ? bunnyGuildOfKey(key) : null;
  const clerk = guild ? (people ?? []).find((pn) => pn?.bunnyClerk === key) : null;
  if (!clerk) return null;
  const crown = crownHallPlan(clerk, ray);
  if (!crown) return null;
  const floor0 = crown.floor;
  const braziers = hallBraziers(crown, ray);
  const pieces = [];
  const set = HALL_SETS[/** @type {keyof typeof HALL_SETS} */ (key)];
  const flats = [];
  if (!set || !room.open || !room.box || !room.axes) return { braziers, pieces, flats };

  // what already stands, as circles on the floor: the clerk and the arms' braziers; and what is kept clear: the doors, the way in
  /** @type {Array<[number, number, number]>} */
  const taken = [[clerk.x, clerk.z, CLERK_CLEAR_M]];
  for (const b of braziers) taken.push([b.x, b.z, 0.5]);
  // the way in: from each of its points (the room's entrance) straight to the clerk, kept clear its whole length
  const aisle = [];
  for (const w of room.way ?? []) {
    const len = Math.hypot(clerk.x - w[0], clerk.z - w[2]);
    for (let t = 0; t <= len; t += 0.5) aisle.push([w[0] + ((clerk.x - w[0]) * t) / (len || 1), w[2] + ((clerk.z - w[2]) * t) / (len || 1), AISLE_CLEAR_M]);
  }
  const keep = [...(room.avoid ?? []).map((a) => [a[0], a[2], Math.max(a[3], DOOR_CLEAR_M)]), ...aisle];
  const clearOf = (x, z, r) => keep.every(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) >= kr + r) && taken.every(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) >= tr + r);

  // THE WALK: the clerk's storey, out from the clerk, the cells a body fits in and a step joins
  const [A, B] = room.axes;
  const floorAt = (x, z) => { const d = ray([x, floor0 + 1, z], [0, -1, 0], 1 + STOREY_M); return Number.isFinite(d) && Math.abs(1 - d) <= STOREY_M ? floor0 + 1 - d : null; };
  const fits = (x, z) => floorAt(x, z) != null && BODY_HEIGHTS.every((h) => room.open([x, floor0 + h, z], BODY_R));
  const at = (i, k) => [clerk.x + A[0] * i * CELL_M + B[0] * k * CELL_M, clerk.z + A[1] * i * CELL_M + B[1] * k * CELL_M];
  const n = Math.round(REACH_M / CELL_M);
  const seen = new Set(), cells = [];
  const start = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].find(([i, k]) => fits(...at(i, k)));
  if (start) {
    const q = [start];
    seen.add(start.join(','));
    while (q.length) {
      const [i, k] = /** @type {[number, number]} */ (q.shift());
      cells.push([i, k]);
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nk = k + dk, id = `${ni},${nk}`;
        if (seen.has(id) || Math.abs(ni) > n || Math.abs(nk) > n) continue;
        seen.add(id);
        const [x0, z0] = at(i, k), [x1, z1] = at(ni, nk);
        if (!fits(x1, z1)) continue;
        const step = ray([x0, floor0 + 0.6, z0], [x1 - x0, 0, z1 - z0].map((v) => v / CELL_M), CELL_M);
        if (step < CELL_M) continue;   // a wall between them
        q.push([ni, nk]);
      }
    }
  }
  const dirs = [A, [-A[0], -A[1]], B, [-B[0], -B[1]]];

  /** A piece's footprint circles at `c` facing `u` (its back's way), its half width and half depth. */
  const footprint = (cx, cz, u, hw, hd) => {
    const side = [u[1], -u[0]];
    const r = Math.max(0.15, Math.min(hd, 0.45));
    const m = Math.max(1, Math.ceil((2 * hw) / (2 * r)));
    const out = [];
    for (let s = 0; s <= m; s++) {
      const t = -hw + r + ((2 * hw - 2 * r) * s) / m;
      out.push([cx + side[0] * t, cz + side[1] * t, r]);
    }
    return out;
  };
  const stands = (circles) => circles.every(([x, z, r]) => clearOf(x, z, r) && floorAt(x, z) != null && BODY_HEIGHTS.every((h) => room.open([x, floor0 + h, z], r - 0.02)));
  /** A box's four corners, a hand inside them, each on the storey's floor and in no solid (a circle can leave a corner
   *  over a stairwell or in a wall's thickness). */
  const cornersStand = (cx, cz, u, hw, hd) => {
    const side = [u[1], -u[0]];
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      const x = cx + side[0] * a * (hw - 0.05) + u[0] * b * (hd - 0.03), z = cz + side[1] * a * (hw - 0.05) + u[1] * b * (hd - 0.03);
      if (floorAt(x, z) == null || !room.open([x, floor0 + 0.5, z], 0.03)) return false;
    }
    return true;
  };
  /** The spot farthest from what stands, among `tries`; ties to the nearer to the clerk. */
  const best = (tries) => {
    let pick = null, score = -Infinity;
    for (const t of tries) {
      const far = Math.min(...taken.map(([x, z, r]) => Math.hypot(t.x - x, t.z - z) - r));
      const s = far - 0.01 * Math.hypot(t.x - clerk.x, t.z - clerk.z);
      if (s > score) { score = s; pick = t; }
    }
    return pick;
  };
  const place = (model, wall) => {
    const bx = room.box(model);
    if (!bx) return null;
    const hw = (bx.mx[0] - bx.mn[0]) / 2, cxl = (bx.mx[0] + bx.mn[0]) / 2, czl = (bx.mx[2] + bx.mn[2]) / 2;
    const back = BACK[/** @type {keyof typeof BACK} */ (model)] ?? 'free';
    const backReach = back === '+z' ? bx.mx[2] - czl : czl - bx.mn[2], hd = (bx.mx[2] - bx.mn[2]) / 2;
    const tries = [];
    for (const [i, k] of cells) {
      const [x, z] = at(i, k);
      for (const u of dirs) {
        const dw = ray([x, floor0 + 1, z], [u[0], 0, u[1]], 4);
        if (!Number.isFinite(dw)) continue;
        const off = wall ? dw - backReach - 0.03 : dw - FREE_WALL_M - hd;   // the box's middle, its back on the wall / a walk off it
        if (off < 0 || off > CELL_M) continue;   // this cell is the one beside the wall
        const cx = x + u[0] * off, cz = z + u[1] * off;
        const circles = footprint(cx, cz, u, hw, hd);
        if (!stands(circles) || !cornersStand(cx, cz, u, hw, hd)) continue;
        tries.push({ x: cx, z: cz, u, circles });
      }
    }
    const t = best(tries);
    if (!t) return null;
    // the model's frame: its back's axis along `u`, its box's middle on the spot
    const face = back === '+z' ? t.u : [-t.u[0], -t.u[1]];   // where local +z points
    const yawDeg = (Math.atan2(face[0], face[1]) * 180) / Math.PI;
    const c = Math.cos((yawDeg * Math.PI) / 180), s = Math.sin((yawDeg * Math.PI) / 180);
    const ox = cxl * c + czl * s, oz = -cxl * s + czl * c;   // the box's middle off the model's origin, turned
    for (const [x, z, r] of t.circles) taken.push([x, z, r + PIECE_GAP_M]);
    return { model, pos: [t.x - ox, floor0 - bx.mn[1], t.z - oz], yawDeg, top: floor0 + (bx.mx[1] - bx.mn[1]), at: [t.x, t.z], u: t.u, hw };
  };
  const made = [];
  const own = [[HALL_BOARD, 'board'], [HALL_CHEST, 'chest']].map(([m, k]) => { const p = place(m, true); return p ? { ...p, k } : null; }).filter(Boolean);
  for (const m of set.wall) { const p = place(m, true); if (p) made.push(p); }
  for (const m of set.floor) { const p = place(m, false); if (p) made.push(p); }
  for (const p of own) pieces.push({ model: p.model, pos: p.pos, yawDeg: p.yawDeg, k: p.k });
  made.forEach((p, i) => pieces.push({ model: p.model, pos: p.pos, yawDeg: p.yawDeg, k: `trade${i}` }));
  // the small things: on the tables, along each table's length; by a wall, a flat's own spot
  const tables = made.filter((p) => TABLES.has(p.model));
  set.table.forEach(([archive, record], i) => {
    const tb = tables[i % Math.max(1, tables.length)];
    if (!tb) return;
    const side = [tb.u[1], -tb.u[0]], slot = Math.floor(i / Math.max(1, tables.length)), along = (slot % 2 ? 1 : -1) * Math.min(0.5, tb.hw - 0.2) * (1 + Math.floor(slot / 2) * 0.5);
    flats.push({ archive, record, x: tb.at[0] + side[0] * along, y: tb.top, z: tb.at[1] + side[1] * along });
  });
  for (const [archive, record] of set.ground) {
    const p = place(-1, true);   // no model: a flat's own small spot (box below)
    if (p) flats.push({ archive, record, x: p.at[0], y: floor0, z: p.at[1] });
  }
  return { braziers, pieces, flats };
}

/** A brazier either side of the arms, outside the banners, on the room's floor and against its wall. */
function hallBraziers(crown, ray) {
  const out = [];
  const [a, b] = crown.banners;
  if (!a || !b) return out;
  const mid = [(a.top[0] + b.top[0]) / 2, (a.top[2] + b.top[2]) / 2];
  for (const bn of crown.banners) {
    let dx = bn.top[0] - mid[0], dz = bn.top[2] - mid[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const x = bn.top[0] + dx * HALL_BRAZIER_SIDE_M + bn.out[0] * HALL_BRAZIER_OFF_M;
    const z = bn.top[2] + dz * HALL_BRAZIER_SIDE_M + bn.out[2] * HALL_BRAZIER_OFF_M;
    const under = ray([x, crown.floor + 1.2, z], [0, -1, 0], 1.5);
    if (!Number.isFinite(under) || Math.abs(1.2 - under) > STOREY_M) continue;
    const back = ray([x, crown.floor + 1.2, z], [-bn.out[0], 0, -bn.out[2]], HALL_BRAZIER_OFF_M + 0.4);
    if (!Number.isFinite(back)) continue;
    out.push({ x, y: crown.floor + 1.2 - under, z });
  }
  return out;
}

/** A flat's own spot by a wall: a small box, its back on the wall. */
const FLAT_BOX = Object.freeze({ mn: [-0.3, 0, -0.15], mx: [0.3, 1, 0.15] });

/**
 * Stand the plan in a room being built. `env`: `key`, `people`, `collider`, `origin` (the room's matrix, or null),
 * `avoid` ([[x, y, z, r]] - doors), `way` ([[x, y, z]] - the way in), and the room's seams - `renderer`, `getTexture`,
 * `uploadRecord(archive, record)`, `billboardSize(texture, record)`, `getGpuMesh(id)`, `cpuModels`, `drawList`,
 * `billboardBatches`, `lights` (pushed to), `trs`, `worldAabb`. Everything in the room's (parent) frame.
 * @param {any} env
 */
export async function furnishBunnyHall(env) {
  const set = HALL_SETS[/** @type {keyof typeof HALL_SETS} */ (env.key)];
  const models = [...new Set([...(set ? [...set.wall, ...set.floor] : []), HALL_BOARD, HALL_CHEST])];
  await Promise.all(models.map((m) => env.getGpuMesh(m)));
  const boxes = new Map();
  const box = (/** @type {number} */ m) => {
    if (m === -1) return FLAT_BOX;
    if (!boxes.has(m)) {
      const cpu = env.cpuModels.get(m);
      let b = null;
      if (cpu?.positions?.length) {
        const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < cpu.positions.length; i += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], cpu.positions[i + a]); mx[a] = Math.max(mx[a], cpu.positions[i + a]); }
        b = { mn, mx };
      }
      boxes.set(m, b);
    }
    return boxes.get(m);
  };
  const o = env.origin;
  const norm = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
  const axes = o ? [norm(o[0], o[2]), norm(o[8], o[10])] : [[1, 0], [0, 1]];   // the room's own axes, turned with the building
  const plan = bunnyHallPlan({
    people: env.people, key: env.key, ray: (p, d, m) => env.collider.raycast(p, d, m), open: (p, r) => !env.collider.sphereOverlaps(p, r),
    axes, avoid: env.avoid, way: env.way, box,
  });
  if (!plan) return;
  // the flats: the braziers and the trade's small things, a batch a picture, the lights among them lighting the room
  const flats = [...plan.braziers.map((p) => ({ ...HALL_BRAZIER, ...p })), ...plan.flats];
  const groups = new Map();
  for (const f of flats) { const k = `${f.archive}_${f.record}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); }
  for (const [, fs] of groups) {
    const { archive, record } = fs[0];
    const t = await env.getTexture(archive);
    if (!t || record >= t.recordCount) continue;
    env.uploadRecord(archive, record);
    const size = env.billboardSize(t, record);
    env.billboardBatches.push(env.renderer.createBillboardBatch(archive, record, size, fs.map((f) => [f.x, f.y, f.z])));
    if (archive === LIGHTS_ARCHIVE) env.lights.push(...collectInteriorLights(fs, () => size));   // already in the room's frame
  }
  for (const p of plan.pieces) {
    const gpu = await env.getGpuMesh(p.model);
    const cpu = env.cpuModels.get(p.model);
    if (!gpu || !cpu) continue;
    const matrix = env.trs(p.pos[0], p.pos[1], p.pos[2], 0, p.yawDeg, 0);
    env.drawList.push({ mesh: gpu, matrix, key: `int:bunny:${p.k}`, aabb: env.worldAabb(cpu.positions, matrix) });
    env.collider.addMesh('interior', cpu.positions, cpu.indices, matrix);
  }
}
