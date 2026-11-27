// Pure placement from layout data and collider answers, so every client of a dungeon places the same fires and
// nothing goes over the wire.

import { hash32 } from './spawnedDungeons.js';
import { GLOBAL_SCALE } from './meshReader.js';
import { RDB_SIDE } from './rdbLayout.js';
import { isDungeonExitDoor } from './dungeonLayout.js';
import { transformPoint } from './mat4.js';

export const DUNGEON_FIRE_FLAT = Object.freeze({ archive: 210, record: 1 });
export const FIRE_MARKER_RECORDS = Object.freeze([10, 8, 19, 11, 18]);
export const ENEMY_MARKER_RECORDS = Object.freeze([15, 16]);
export const FIXED_TREASURE_ARCHIVE = 216;
export const DFIRE = Object.freeze({
  floorM: 4,
  flatNy: 0.99,
  levelR: 0.5,
  levelM: 0.05,
  roomM: 1.5,
  reachR: 1.4,
  itemM: 1.5,
  ringM: 2,
  dryM: 0.5,
  doorM: 3,
  enemyM: 8,
  entranceM: 25,
  spacingM: 80,
  storeyM: 6,
  wardM: 15,
  ceilingM: 10,
  enclosedM: 30,
  enclosedRays: 4,
  min: 2, max: 7, perBlocks: 3,
});
const WATER_NONE = 10000;

export const isBorderBlock = (name) => /^B/i.test(String(name ?? ''));

export function dungeonFireCount(blocks, elite = false) {
  const n = Math.max(DFIRE.min, Math.min(DFIRE.max, Math.round((Math.max(0, blocks | 0)) / DFIRE.perBlocks)));
  return elite ? Math.max(1, Math.floor(n / 2)) : n;
}

const isFireMarker = (m) => m && (m.archive === FIXED_TREASURE_ARCHIVE || (m.archive == null && FIRE_MARKER_RECORDS.includes(m.record)));
const isEnemyMarker = (m) => m && m.archive == null && ENEMY_MARKER_RECORDS.includes(m.record);
const half = RDB_SIDE / 2;

export function fireCandidates(blocks) {
  const out = [];
  (blocks ?? []).forEach((b, bi) => {
    const lay = b?.layout;
    if (!lay || lay.castleBlock) return;
    const water = Number.isFinite(lay.waterLevel) && lay.waterLevel !== WATER_NONE ? -lay.waterLevel * GLOBAL_SCALE : -Infinity;
    for (const m of lay.markers ?? []) {
      if (!isFireMarker(m)) continue;
      out.push({ pos: [m.x + b.originX, m.y, m.z + b.originZ], block: bi, start: !!b.isStartingBlock, water, marker: true });
    }
    if (!isBorderBlock(b.name)) {
      const y0 = (lay.markers ?? []).find((m) => m && m.archive == null)?.y ?? 0;
      out.push({ pos: [b.originX + half, y0, b.originZ + half], block: bi, start: !!b.isStartingBlock, water, centre: true });
    }
  });
  return out;
}

export function dungeonStart(blocks) {
  for (const b of blocks ?? []) {
    if (!b?.isStartingBlock) continue;
    const m = (b.layout?.startMarkers ?? [])[0];
    if (m) return [m.x + b.originX, m.y, m.z + b.originZ];
  }
  return null;
}

export const enemyMarks = (blocks) => (blocks ?? []).flatMap((b) => (b?.layout?.markers ?? []).filter(isEnemyMarker).map((m) => [m.x + b.originX, m.y, m.z + b.originZ]));
export const itemMarks = (blocks) => (blocks ?? []).flatMap((b) => (b?.layout?.markers ?? []).filter(isFireMarker).map((m) => [m.x + b.originX, m.y, m.z + b.originZ]));

export const isPalaceLayout = (blocks) => (blocks ?? []).some((b) => !!b?.layout?.castleBlock);
export function layoutFireCount(blocks, elite = false) {
  if (isPalaceLayout(blocks)) return 0;
  return dungeonFireCount((blocks ?? []).filter((b) => !isBorderBlock(b?.name)).length, elite);
}

export function fireLayoutInputs(blocks, hearths) {
  const at = (b, d) => {
    const p = d.centre ? transformPoint(d.matrix, d.centre.x, d.centre.y, d.centre.z) : [d.matrix[12], d.matrix[13], d.matrix[14]];
    return [p[0] + b.originX, p[1], p[2] + b.originZ];
  };
  const doors = (blocks ?? []).flatMap((b) => [
    ...(b?.layout?.actionDoors ?? []).map((d) => at(b, d)),
    ...(b?.layout?.exitDoors ?? []).filter(isDungeonExitDoor).map((d) => at(b, d)),
  ]);
  // Uses the classic flat height, never a texture mod scale, because mods differ between clients and the plan must
  // match.
  const existing = (hearths ?? []).filter((h) => h && !h.placed).map((h) => [h.x, h.lawFoot ?? h.foot ?? h.y, h.z]);
  return { doors, existing };
}

// Comparisons use squared distances in plain arithmetic: `Math.hypot` can differ in the last bit between engines,
// and the hash tie-break needs identical ties on every client.
const d2 = (a, b) => { const x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return x * x + y * y + z * z; };
const deep = (a, b) => { const x = a[0] - b[0], y = 2 * (a[1] - b[1]), z = a[2] - b[2]; return x * x + y * y + z * z; };
const SQ = (m) => m * m;

// A closed door has a collider bucket only while it is shut, so the rays skip door and platform buckets.
const ONLY_DUNGEON = Object.freeze({ only: Object.freeze(['dungeon']) });
const DUNGEON_BUCKET = 'dungeon';
// Literals and one IEEE product, never sine or cosine, so every client samples the same points in the same order.
const ringOf = (r) => { const d = r * Math.SQRT1_2; return Object.freeze([[r, 0], [-r, 0], [0, r], [0, -r], [d, d], [d, -d], [-d, d], [-d, -d]].map(Object.freeze)); };
const ROOM_RAYS = ringOf(1);
// The collider turns a hit normal to face the ray, so the roof of a closed room reads as a floor unless `hit.back`
// rejects it.
export function colliderFireProbe(collider) {
  return {
    // Accepts a floor only when the first surface below is the dungeon mesh, so a lift platform never counts. The
    // plan runs once at build, after movers and doors are hung and before a save restore moves them.
    floor: (p) => {
      const from = [p[0], p[1] + 1, p[2]];
      const hit = collider.raycastHit(from, [0, -1, 0], DFIRE.floorM + 1);
      return Number.isFinite(hit?.dist) && hit.normal && !hit.back && hit.key === DUNGEON_BUCKET ? { y: from[1] - hit.dist, ny: hit.normal[1] } : null;
    },
    room: (p) => {
      if (!Number.isFinite(collider.raycast([p[0], p[1] + 0.2, p[2]], [0, 1, 0], DFIRE.ceilingM, ONLY_DUNGEON))) return false;
      let walls = 0;
      for (const [dx, dz] of ROOM_RAYS) {
        const d = collider.raycast([p[0], p[1] + 0.9, p[2]], [dx, 0, dz], DFIRE.enclosedM, ONLY_DUNGEON);
        if (d < DFIRE.roomM) return false;
        if (Number.isFinite(d)) walls++;
      }
      return walls >= DFIRE.enclosedRays && collider.penetrationAt([p[0], p[1] + 0.05, p[2]]) < 0.03;
    },
  };
}

const LEVEL_RINGS = Object.freeze([...ringOf(DFIRE.levelR), ...ringOf(DFIRE.reachR)]);
const MARKER_RING = ringOf(DFIRE.ringM);
function levelRound(probe, pos) {
  for (const [dx, dz] of LEVEL_RINGS) {
    const g = probe.floor([pos[0] + dx, pos[1], pos[2] + dz]);
    if (!g || !(g.ny > DFIRE.flatNy) || !(Math.abs(g.y - pos[1]) <= DFIRE.levelM)) return false;
  }
  return true;
}

function candidateSpots(cands) {
  const out = [];
  for (const c of cands ?? []) {
    if (!c?.marker) { out.push({ c, at: c.pos }); continue; }
    for (const [dx, dz] of MARKER_RING) out.push({ c, at: [c.pos[0] + dx, c.pos[1], c.pos[2] + dz] });
  }
  return out;
}

export function landCandidates(cands, { probe, doors = [], enemies = [], items = [] } = {}) {
  const out = [];
  let landed = null;
  for (const { c, at } of candidateSpots(cands)) {
    if (c === landed) continue;
    const f = probe?.floor?.(at);
    if (!f || !Number.isFinite(f.y) || !(f.ny > DFIRE.flatNy)) continue;
    const pos = [at[0], f.y, at[2]];
    if (pos[1] < c.water + DFIRE.dryM) continue;
    if (doors.some((d) => d2(d, pos) < SQ(DFIRE.doorM))) continue;
    if (enemies.some((e) => SQ(e[0] - pos[0]) + SQ(e[2] - pos[2]) < SQ(DFIRE.enemyM) && Math.abs(e[1] - pos[1]) < DFIRE.storeyM)) continue;
    if (items.some((m) => SQ(m[0] - pos[0]) + SQ(m[2] - pos[2]) < SQ(DFIRE.itemM) && Math.abs(m[1] - pos[1]) < DFIRE.storeyM)) continue;
    if (!levelRound(probe, pos)) continue;
    if (!probe?.room?.(pos)) continue;
    out.push({ ...c, pos });
    landed = c;
  }
  return out;
}

const nearestOf = (list, p) => list.reduce((best, q) => {
  if (!best) return q;
  const a = d2(q, p), b = d2(best, p);
  return a < b || (a === b && (q[0] < best[0] || (q[0] === best[0] && (q[1] < best[1] || (q[1] === best[1] && q[2] < best[2]))))) ? q : best;
}, null);

export function chooseFirePlan(valid, { seed = 0, existing = [], start = null, count = DFIRE.min } = {}) {
  const pool = (valid ?? []).map((c, i) => ({ ...c, tie: hash32(seed >>> 0, i, 0x0f1e) }));
  const chosen = [];
  if (!pool.length || count <= 0) return { fires: [], doorFire: null };
  const better = (a, b, sa, sb) => (sa !== sb ? sa > sb : a.tie < b.tie);
  const take = (c) => { chosen.push(c); pool.splice(pool.indexOf(c), 1); };
  const clearOf = (p, list, m) => list.every((q) => d2(q, p) >= SQ(m));
  const from = start ?? pool.find((c) => c.start)?.pos ?? pool[0].pos;
  const near = (list) => list.reduce((best, c) => (!best || better(c, best, -d2(c.pos, from), -d2(best.pos, from)) ? c : best), null);
  const clear = pool.filter((c) => clearOf(c.pos, existing, DFIRE.entranceM));
  const inReach = clear.filter((c) => d2(c.pos, from) <= SQ(DFIRE.entranceM));
  const first = near(inReach.length ? inReach : clear.filter((c) => c.start)) ?? near(clear);
  const reach = Math.max(SQ(DFIRE.entranceM), first ? d2(first.pos, from) : Infinity);
  const doorFire = existing.some((q) => d2(q, from) < reach);
  const adopted = doorFire ? nearestOf(existing, from) : null;
  // `first` is non-null here: with no clear candidate, some layout fire is nearer than Infinity, so `doorFire` is
  // true.
  if (!doorFire) take(first);
  const want = doorFire ? count - 1 : count;
  const anchors = () => [...existing, ...chosen.map((c) => c.pos)];
  const anchorFrom = chosen[0]?.pos ?? from;
  if (chosen.length < want) {
    const far = pool.filter((c) => clearOf(c.pos, anchors(), DFIRE.spacingM))
      .reduce((best, c) => (!best || better(c, best, deep(c.pos, anchorFrom), deep(best.pos, anchorFrom)) ? c : best), null);
    if (far) take(far);
  }
  const band = (p) => Math.floor(p[1] / DFIRE.storeyM);
  while (chosen.length < want) {
    const open = pool.filter((c) => clearOf(c.pos, anchors(), DFIRE.spacingM));
    if (!open.length) break;
    const lit = new Set([...existing, ...chosen.map((c) => c.pos)].map(band));
    const unserved = open.filter((c) => !lit.has(band(c.pos)));
    const from2 = unserved.length ? unserved : open;
    const score = (c) => Math.min(...anchors().map((q) => d2(q, c.pos)));
    take(from2.reduce((best, c) => (!best || better(c, best, score(c), score(best)) ? c : best), null));
  }
  return { fires: chosen.map((c) => c.pos), doorFire: adopted && [adopted[0], adopted[1], adopted[2]] };
}
export const chooseFires = (valid, opts) => chooseFirePlan(valid, opts).fires;

export const inFireWard = (fires, spot) => !!spot && (fires ?? []).some((q) => SQ(q[0] - spot.x) + SQ(q[1] - spot.y) + SQ(q[2] - spot.z) < SQ(DFIRE.wardM));

export function dungeonFirePlan({ blocks, probe, doors = [], existing = [], seed = 0, elite = false, cold = false } = {}) {
  if (cold) return { fires: [], doorFire: null, candidates: 0, valid: 0 };
  const count = layoutFireCount(blocks, elite);
  const cands = fireCandidates(blocks);
  const valid = count > 0 ? landCandidates(cands, { probe, doors, enemies: enemyMarks(blocks), items: itemMarks(blocks) }) : [];
  const { fires, doorFire } = chooseFirePlan(valid, { seed, existing, start: dungeonStart(blocks), count });
  return { fires, doorFire, candidates: cands.length, valid: valid.length };
}
export const placeDungeonFires = (o) => dungeonFirePlan(o).fires;
