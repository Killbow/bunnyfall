// @ts-check
import { WITNESS_M, GREET_RANGE, GREET_REST_MIN, GREET_S, LINE_RANGE } from './livingTown.js';
import { dealCircles, circleLine, exchangeAt, ROUND_S, GATHER_BEAT_S, SLOT_LINES } from './meetups.js';
import { PERSON_IDLE_DISTANCE } from '../../characters/mobilePerson.js';
import { roomKindOf, minstrelLine } from './lines.js';
import { lwSeed, textSeed } from './seed.js';
import { townClassOf, stillFlatOf } from './looks.js';
import { BUILDING_TYPES } from '../../world/buildingNames.js';

export const INDOOR_TICK_S = 1;
export const INDOOR_REACH_M = 20;
export const INDOOR_CELLS = 400;
export const INDOOR_LEVEL_M = 0.15;
export const ROOM_STEPS = Object.freeze([[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]].map((s) => Object.freeze(s)));
export const INDOOR_APART_M = 1.3;
export const INDOOR_CLEAR_M = 1.1;
export const INDOOR_DOOR_M = 1.8;
export const INDOOR_MAX = 12;
export const INDOOR_FLOOR_M2 = 8;
export const INDOOR_HOLD_MIN = 3;
export const INDOOR_SEEN_M = 14;
export const TABLE_M = 2.2;
export const TABLE_MAX = 3;
export const CROWD_M = 2.5;
export const TABLE_GAP_M = 4;
export const TABLE_SIGHT_M = 1.4;
export const OPEN_M = 6;
export const BED_STEP_M = Object.freeze([0.9, 1.3]);
export const BED_FAN = 8;
export const BED_LEVEL_M = 0.2;
export const BED_DROP_M = 1;
export const INDOOR_STIR_S = Object.freeze([30, 90]);
export const INDOOR_WALK_M = 7;
export const INDOOR_WALK_SPEED = 1.2;
export const ROOMS_KEPT = 32;

// Every input of a room's layout belongs in this key, or a changed room reuses its old layout.
/**
 * @param {number} key
 * @param {readonly number[]} origin
 * @param {any} collider
 * @param {readonly number[][]} staticFeet
 * @param {readonly number[][]} beds
 * @param {readonly number[][]} waysIn
 * @returns {string|null}
 */
export function roomKeyOf(key, origin, collider, staticFeet, beds, waysIn) {
  if (typeof collider?.shapeKey !== 'function') return null;
  const at = (/** @type {readonly number[]} */ p) => p.map((v) => Math.round(v * 1000)).join(',');
  return [key, at(origin), staticFeet.map(at).join(';'), beds.map(at).join(';'), waysIn.map(at).join(';'), collider.shapeKey()].join('|');
}

/**
 * @param {number[]} origin
 * @param {{ move: (feet: number[], dx: number, dy: number, dz: number, height: number) => any }} collider
 * @param {(x: number, y: number, z: number) => (number|null)} floorAt
 * @param {readonly number[][]} [keepClear]
 * @param {readonly number[][]} [waysIn]
 * @returns {number[][]}
 */
export function soundRoom(origin, collider, floorAt, keepClear = [], waysIn = []) {
  const far = (p, list, d) => list.every((q) => Math.hypot(p[0] - q[0], p[2] - q[2]) >= d);
  const y0 = floorAt(origin[0], origin[1] + 0.5, origin[2]);
  const start = [origin[0], y0 != null && Number.isFinite(y0) ? y0 : origin[1], origin[2]];
  const cellOf = (/** @type {number} */ x, /** @type {number} */ z) => `${Math.round((x - start[0]) / INDOOR_APART_M)},${Math.round((z - start[2]) / INDOOR_APART_M)}`;
  const cells = [start];
  const lifted = new Set();
  const seen = new Set([cellOf(start[0], start[2])]);
  for (let h = 0; h < cells.length && cells.length < INDOOR_CELLS; h++) {
    const p = cells[h];
    for (const [di, dj] of ROOM_STEPS) {
      const tx = p[0] + di * INDOOR_APART_M, tz = p[2] + dj * INDOOR_APART_M;
      if (seen.has(cellOf(tx, tz)) || Math.hypot(tx - start[0], tz - start[2]) > INDOOR_REACH_M) continue;
      const q = [p[0], p[1] + 0.05, p[2]];
      try { collider.move(q, tx - p[0], 0, tz - p[2], 1.8); } catch { continue; }
      const key = cellOf(q[0], q[2]);
      if (seen.has(key) || Math.hypot(q[0] - start[0], q[2] - start[2]) > INDOOR_REACH_M) continue;
      const y = floorAt(q[0], q[1] + 0.5, q[2]);
      if (y == null || !Number.isFinite(y) || Math.abs(y - p[1]) > INDOOR_LEVEL_M || Math.abs(y - start[1]) > 1.2) continue;
      seen.add(key);
      if (q[1] - y > INDOOR_LEVEL_M) lifted.add(cells.length);
      cells.push([q[0], y, q[2]]);
      if (cells.length >= INDOOR_CELLS) break;
    }
  }
  const spots = [];
  for (const [k, p] of cells.entries()) {
    if (lifted.has(k)) continue;
    if (Math.hypot(p[0] - origin[0], p[2] - origin[2]) < INDOOR_DOOR_M) continue;
    // The 1 cm slack lets lattice neighbors pass, since summed steps round slightly below `INDOOR_APART_M`.
    if (!far(p, spots, INDOOR_APART_M - 0.01) || !far(p, keepClear, INDOOR_CLEAR_M) || !far(p, waysIn, INDOOR_DOOR_M)) continue;
    spots.push(p);
  }
  return spots;
}

/**
 * @param {readonly number[]} bed
 * @param {{ move: (feet: number[], dx: number, dy: number, dz: number, height: number) => any }} collider
 * @param {(x: number, y: number, z: number) => (number|null)} floorAt
 * @returns {{ feet: number[], yaw: number }}
 */
export function bedStand(bed, collider, floorAt) {
  const y0 = floorAt(bed[0], bed[1] + 1, bed[2]);
  const at = [bed[0], y0 ?? bed[1], bed[2]];
  /** @type {{ feet: number[], dy: number }[]} */
  const ways = [];
  for (const dist of BED_STEP_M) {
    for (let i = 0; i < BED_FAN; i++) {
      const a = (i / BED_FAN) * Math.PI * 2;
      const q = [at[0], at[1] + 0.05, at[2]];
      try { collider.move(q, Math.sin(a) * dist, 0, Math.cos(a) * dist, 1.8); } catch { continue; }
      if (Math.hypot(q[0] - at[0], q[2] - at[2]) < dist * 0.75) continue;
      const y = floorAt(q[0], q[1] + 0.5, q[2]);
      if (y == null || !Number.isFinite(y)) continue;
      const dy = y - at[1];
      if (dy > BED_LEVEL_M || dy < -BED_DROP_M) continue;
      ways.push({ feet: [q[0], y, q[2]], dy });
    }
  }
  const pick = ways.find((w) => w.dy < -BED_LEVEL_M) ?? ways.find((w) => Math.abs(w.dy) <= BED_LEVEL_M);
  return pick ? { feet: pick.feet, yaw: Math.atan2(at[0] - pick.feet[0], at[2] - pick.feet[2]) } : { feet: at, yaw: 0 };
}

/**
 * @param {readonly string[]} ids
 * @param {number} beds
 * @param {number} key
 * @param {number} [rented]
 * @returns {Map<string, number>}
 */
export function bedsOf(ids, beds, key, rented = -1) {
  /** @type {Map<string, number>} */
  const out = new Map();
  const taken = new Set();
  for (const id of ids) {
    if (taken.size >= beds) break;
    let i = lwSeed(textSeed(id), key >>> 0, 0x626564) % beds;
    while (taken.has(i)) i = (i + 1) % beds;
    taken.add(i);
    out.set(id, i);
  }
  const who = rented >= 0 ? [...out].find(([, b]) => b === rented)?.[0] : undefined;
  if (who != null) {
    out.delete(who);
    for (let k = 1; k < beds; k++) { const i = (rented + k) % beds; if (!taken.has(i)) { out.set(who, i); break; } }
  }
  return out;
}

/**
 * @param {readonly number[][]} spots
 * @param {readonly number[]} order
 * @param {(i: number, j: number) => boolean} [sees]
 * @returns {number[][]}
 */
export function tablesOf(spots, order, sees = () => true) {
  const at = new Int32Array(spots.length).fill(-1);
  /** @type {number[][]} */
  const tables = [];
  const apart = (/** @type {number} */ i, /** @type {number} */ j) => Math.hypot(spots[i][0] - spots[j][0], spots[i][2] - spots[j][2]);
  for (const i of order) {
    if (at[i] >= 0) continue;
    const table = [i];
    at[i] = tables.length;
    const near = order.filter((j) => at[j] < 0 && apart(i, j) <= TABLE_M).sort((a, b) => apart(i, a) - apart(i, b) || a - b);
    for (const j of near) {
      if (table.length >= TABLE_MAX) break;
      if (!table.every((k) => apart(j, k) <= TABLE_M && sees(j, k))) continue;
      table.push(j);
      at[j] = tables.length;
    }
    tables.push(table);
  }
  return tables;
}

/**
 * @param {{ raycast?: (origin: number[], dir: number[], maxDist: number) => (number|null) } | null} collider
 * @param {readonly number[]} a
 * @param {readonly number[]} b
 */
export function inSight(collider, a, b) {
  const d = Math.hypot(b[0] - a[0], b[2] - a[2]);
  if (!collider?.raycast || !(d > 0)) return true;
  const hit = collider.raycast([a[0], a[1] + TABLE_SIGHT_M, a[2]], [(b[0] - a[0]) / d, 0, (b[2] - a[2]) / d], d);
  return !(hit != null && Number.isFinite(hit));
}

/**
 * @param {{ raycast?: (origin: number[], dir: number[], maxDist: number) => (number|null) } | null} collider
 * @param {readonly number[]} eye
 * @param {readonly number[]} p
 */
export function inView(collider, eye, p) {
  const to = [p[0] - eye[0], p[1] + TABLE_SIGHT_M - eye[1], p[2] - eye[2]];
  const d = Math.hypot(to[0], to[1], to[2]);
  if (!collider?.raycast || !(d > 0)) return true;
  const hit = collider.raycast([eye[0], eye[1], eye[2]], [to[0] / d, to[1] / d, to[2] / d], d);
  return !(hit != null && Number.isFinite(hit));
}

/**
 * @param {readonly number[][]} spots
 * @param {readonly number[]} table
 * @param {number} i
 * @param {{ raycast?: (origin: number[], dir: number[], maxDist: number) => (number|null) } | null} collider
 * @returns {number[]}
 */
export function faceOf(spots, table, i, collider) {
  const p = spots[i];
  if (table.length > 1) return [table.reduce((a, k) => a + spots[k][0], 0) / table.length, p[1], table.reduce((a, k) => a + spots[k][2], 0) / table.length];
  let best = null, far = -1;
  for (const [dx, dz] of ROOM_STEPS) {
    const n = Math.hypot(dx, dz);
    const hit = collider?.raycast ? collider.raycast([p[0], p[1] + TABLE_SIGHT_M, p[2]], [dx / n, 0, dz / n], OPEN_M) : null;
    const d = hit != null && Number.isFinite(hit) ? hit : OPEN_M;
    if (d > far + 1e-9) { far = d; best = [dx / n, dz / n]; }
  }
  return [p[0] + (best?.[0] ?? 0), p[1], p[2] + (best?.[1] ?? 1)];
}

/**
 * @param {readonly number[][]} spots
 * @param {readonly number[][]} tables
 * @returns {number[][]}
 */
export function spreadTables(spots, tables) {
  const left = tables.map((tb) => ({ tb, x: tb.reduce((s, i) => s + spots[i][0], 0) / tb.length, z: tb.reduce((s, i) => s + spots[i][2], 0) / tb.length }));
  /** @type {typeof left} */
  const out = [];
  for (;;) {
    const k = left.findIndex((a) => out.every((b) => Math.hypot(a.x - b.x, a.z - b.z) >= TABLE_GAP_M));
    if (k < 0) break;
    out.push(...left.splice(k, 1));
  }
  return [...out, ...left].map((a) => a.tb);
}

/**
 * @param {{ spots: number[][], tableOf: number[] }} room
 * @param {readonly { id: string, spot: number, walking: boolean }[]} standing
 * @param {string} id
 * @param {number} spot
 * @param {number} stirs
 * @param {(a: number[], b: number[]) => boolean} walkable
 * @returns {number}
 */
export function stirPlace(room, standing, id, spot, stirs, walkable) {
  const at = room.spots[spot];
  const taken = new Set(standing.map((x) => x.spot));
  taken.add(spot);
  const free = room.spots.map((_, i) => i).filter((i) => !taken.has(i) && Math.hypot(room.spots[i][0] - at[0], room.spots[i][2] - at[2]) <= INDOOR_WALK_M);
  /** @type {Map<number, number>} */
  const alone = new Map();
  for (const x of standing) if (x.id !== id && !x.walking) alone.set(room.tableOf[x.spot], (alone.get(room.tableOf[x.spot]) ?? 0) + 1);
  const theirs = standing.filter((x) => x.id !== id && x.spot >= 0);
  const apart = (/** @type {number} */ i, /** @type {number[]} */ p) => Math.hypot(room.spots[i][0] - p[0], room.spots[i][2] - p[2]);
  const company = free.filter((i) => room.tableOf[i] !== room.tableOf[spot] && alone.get(room.tableOf[i]) === 1
    && theirs.every((x) => room.tableOf[x.spot] === room.tableOf[i] || apart(i, room.spots[x.spot]) >= CROWD_M))
    .sort((a, b) => apart(a, at) - apart(b, at) || a - b);
  for (const i of company) if (walkable(at, room.spots[i])) return i;
  const clear = new Map(free.map((i) => [i, Math.min(Infinity, ...theirs.map((x) => apart(i, room.spots[x.spot])))]));
  const first = [...free].sort((a, b) => (clear.get(b) ?? 0) - (clear.get(a) ?? 0) || a - b).find((i) => walkable(at, room.spots[i]));
  if (first == null) return -1;
  const own = free.filter((i) => (clear.get(i) ?? 0) >= Math.min(TABLE_GAP_M, clear.get(first) ?? 0));
  const roll = lwSeed(textSeed(id), stirs, 0x67) % own.length;
  for (let k = 0; k < own.length; k++) { const i = own[(roll + k) % own.length]; if (i === first || walkable(at, room.spots[i])) return i; }
  return first;
}

/** @param {{ sprites: ReturnType<typeof import('../../world/travellerSprites.js').createTravellerSprites>, building: () => ({ key: number, town: any, only?: (res: any) => boolean } | null), collider: () => any, floorAt: (x: number, y: number, z: number) => (number|null), origin: () => (number[] | null), staticFeet: () => number[][], waysIn?: () => number[][], clock: () => number, ready?: () => boolean, beds?: () => number[][], rented?: () => number, doorsShut?: <T>(fn: () => T) => T, questFeet?: () => number[][], }} deps */
export function createLivingIndoors(deps) {
  /** @type {{ key: number, spots: number[][], face: number[][], order: number[], tableOf: number[], beds: { feet: number[], yaw: number }[], holds: number } | null} */
  let room = null;
  /** @type {Map<string, { res: any, spot: number, bed: number, next: number, stirs: number, walk: { from: number[], to: number[], t: number, dur: number } | null, flat?: { archive: number, record: number } | null }>} */
  const stood = new Map();
  /** @type {{ res: any, e?: any }[]} */
  let inside = [];
  /** @type {Map<string, number>} */
  let bedOf = new Map();
  /** @type {Map<string, number>} */
  const tableAt = new Map();
  let timer = Infinity;
  let arriving = true;
  /** @type {any[]} */
  const list = [];
  /** @type {any[]} */
  let circles = [];
  const inCircle = new Set();
  const staying = new Set();
  /** @type {Map<number, { ids: string, since: number, carry: any, circle: any }>} */
  const company = new Map();
  /** @type {Map<string, any>} */
  const scripts = new Map();
  /** @type {Map<string, { text: string, until: number }>} */
  const words = new Map();
  /** @type {Map<string, { t: number, said: boolean }>} */
  const greeted = new Map();
  /** @type {Map<string, { spots: number[][], groups: number[][], tableOf: number[], face: number[][], beds: { feet: number[], yaw: number }[] }>} */
  const rooms = new Map();
  let realNow = 0;
  /** @type {number[]|null} */
  let lastFeet = null;

  const dealOf = (key, n) => {
    const order = Array.from({ length: n }, (_, i) => i);
    let h = (key * 2654435761) >>> 0;
    for (let i = n - 1; i > 0; i--) { h = (Math.imul(h ^ (h >>> 15), 2246822519) + i) >>> 0; const j = h % (i + 1); [order[i], order[j]] = [order[j], order[i]]; }
    return order;
  };

  function clear() {
    deps.sprites.clear();
    stood.clear();
    inside = [];
    room = null;
    timer = Infinity;
    arriving = true;
    list.length = 0;
    bedOf = new Map();
    tableAt.clear();
    circles = [];
    inCircle.clear();
    staying.clear();
    company.clear();
    scripts.clear();
    words.clear();
    lastFeet = null;
  }

  const questHeld = (/** @type {readonly number[]} */ p, /** @type {readonly number[][]} */ quest) => quest.some((q) => Math.hypot(p[0] - q[0], p[2] - q[2]) < INDOOR_CLEAR_M);
  const freeSpot = (/** @type {(i: number) => boolean} */ ok = () => true) => {
    const taken = new Set([...stood.values()].map((s) => s.spot));
    return room?.order.find((i) => !taken.has(i) && ok(i)) ?? -1;
  };

  /**
   * @param {string} id
   * @param {number} n
   */
  const stirWait = (id, n) => INDOOR_STIR_S[0] + (lwSeed(textSeed(id), n, 0x73746972) % 1000) / 1000 * (INDOOR_STIR_S[1] - INDOOR_STIR_S[0]);
  const walkable = (a, b) => {
    const collider = deps.collider();
    if (!collider) return false;
    const q = [a[0], a[1] + 0.05, a[2]];
    try { collider.move(q, b[0] - a[0], 0, b[2] - a[2], 1.8); } catch { return false; }
    return Math.hypot(q[0] - b[0], q[2] - b[2]) < 0.25;
  };

  return {
    /**
     * @param {number} dt
     * @param {number[]} feet
     * @param {number} viewYaw
     * @param {number[]} eye
     */
    frame(dt, feet, viewYaw, eye) {
      const b = deps.building();
      if (!b?.town || deps.ready?.() === false) { if (room || stood.size) clear(); return; }
      if (!room || room.key !== b.key) {
        clear();
        const origin = deps.origin() ?? feet;
        const collider = deps.collider();
        // Measure the room with every door shut; an open door is no wall to the collider and lets the walk leak
        // into other rooms.
        const lay = () => {
          const beds = collider ? (deps.beds?.() ?? []).map((m) => bedStand(m, collider, deps.floorAt)) : [];
          const spots = collider ? soundRoom(origin, collider, deps.floorAt, [...deps.staticFeet(), ...beds.map((x) => x.feet)], deps.waysIn?.() ?? []) : [];
          const groups = spreadTables(spots, tablesOf(spots, dealOf(b.key, spots.length), (i, j) => inSight(collider, spots[i], spots[j])));
          const tableOf = new Array(spots.length).fill(-1);
          groups.forEach((tb, ti) => { for (const i of tb) tableOf[i] = ti; });
          const face = spots.map((_, i) => faceOf(spots, groups[tableOf[i]], i, collider));
          return { spots, groups, tableOf, face, beds };
        };
        const cached = () => {
          const sig = roomKeyOf(b.key, origin, collider, deps.staticFeet(), deps.beds?.() ?? [], deps.waysIn?.() ?? []);
          const was = sig === null ? undefined : rooms.get(sig);
          if (sig !== null && was) { rooms.delete(sig); rooms.set(sig, was); return was; }
          const made = lay();
          if (sig !== null) { rooms.set(sig, made); if (rooms.size > ROOMS_KEPT) rooms.delete(rooms.keys().next().value); }
          return made;
        };
        const { spots, groups, tableOf, face, beds } = collider && deps.doorsShut ? deps.doorsShut(cached) : cached();
        const holds = Math.max(INDOOR_HOLD_MIN, Math.ceil((spots.length * INDOOR_APART_M ** 2) / INDOOR_FLOOR_M2));
        room = { key: b.key, spots, face, order: groups.flat(), tableOf, beds, holds };
      }
      timer += dt;
      realNow += dt;
      const bedFor = (/** @type {{ res: any, e?: any }} */ x) => (x.e?.kind === 'home' ? bedOf.get(x.res.id) ?? -1 : -1);
      if (timer >= INDOOR_TICK_S) {
        timer = 0;
        const lodgers = room.beds.length ? b.town.lodgersAt?.(b.key, b.town.dayOf(deps.clock())) ?? [] : [];
        bedOf = bedsOf(lodgers.map((r) => r.id), room.beds.length, b.key, deps.rented?.() ?? -1);
        inside = [];
        let onFloor = 0;
        for (const x of b.town.insideAt(b.key, deps.clock()).filter((x) => !b.only || b.only(x.res))) {
          if (inside.length >= INDOOR_MAX) break;
          if (bedFor(x) < 0 && onFloor++ >= room.holds) continue;
          inside.push(x);
        }
      }
      const unseen = (p) => {
        const dx = p[0] - feet[0], dz = p[2] - feet[2];
        return arriving || dx * Math.sin(viewYaw) + dz * Math.cos(viewYaw) <= 0 || (Math.hypot(dx, dz) > INDOOR_SEEN_M && !inView(deps.collider(), eye, p));
      };
      const quest = deps.questFeet?.() ?? [];
      const placeOf = (s) => (s.bed >= 0 ? room.beds[s.bed].feet : s.walk ? [s.walk.from[0] + (s.walk.to[0] - s.walk.from[0]) * (s.walk.t / s.walk.dur), s.walk.to[1], s.walk.from[2] + (s.walk.to[2] - s.walk.from[2]) * (s.walk.t / s.walk.dur)] : room.spots[s.spot]);
      const want = new Map(inside.map((x) => [x.res.id, bedFor(x)]));
      for (const [id, s] of [...stood]) if ((!want.has(id) || (want.get(id) ?? -1) !== s.bed) && unseen(placeOf(s))) stood.delete(id);
      for (const x of inside) {
        const res = x.res;
        if (stood.has(res.id)) continue;
        const bed = bedFor(x);
        if (bed >= 0) {
          if (unseen(room.beds[bed].feet)) stood.set(res.id, { res: { ...res, cls: townClassOf(res) }, spot: -1, bed, next: realNow + stirWait(res.id, 0), stirs: 0, walk: null });
          continue;
        }
        const spot = freeSpot((i) => !questHeld(room.spots[i], quest));
        if (spot < 0) break;
        if (!unseen(room.spots[spot])) continue;
        stood.set(res.id, { res: { ...res, cls: townClassOf(res) }, spot, bed: -1, next: realNow + stirWait(res.id, 0), stirs: 0, walk: null });
      }
      for (const [id, s] of stood) {
        if (s.bed >= 0) continue;
        if (s.walk) {
          s.walk.t += dt;
          if (s.walk.t >= s.walk.dur) { s.walk = null; s.next = realNow + stirWait(id, s.stirs); }
          continue;
        }
        if (staying.has(id) || realNow < s.next) continue;
        s.stirs++;
        const to = stirPlace(room, [...stood].map(([oid, x]) => ({ id: oid, spot: x.spot, walking: !!x.walk })), id, s.spot, s.stirs, (a, q) => !questHeld(q, quest) && walkable(a, q));
        if (to < 0) { s.next = realNow + stirWait(id, s.stirs); continue; }
        const from = room.spots[s.spot];
        s.walk = { from, to: room.spots[to], t: 0, dur: Math.hypot(room.spots[to][0] - from[0], room.spots[to][2] - from[2]) / INDOOR_WALK_SPEED };
        // Reserve the destination at departure so `freeSpot` and other walkers never pick it.
        s.spot = to;
      }
      /** @type {Map<number, { id: string, res: any, spot: number }[]>} */
      const tables = new Map();
      tableAt.clear();
      for (const [id, s] of stood) {
        if (s.walk || s.bed >= 0) continue;
        const ti = room.tableOf[s.spot];
        const at = tables.get(ti) ?? [];
        at.push({ id, res: s.res, spot: s.spot });
        tables.set(ti, at);
        tableAt.set(id, ti);
      }
      const t = deps.clock();
      const beat = b.town.talkBeat?.();
      circles = [];
      inCircle.clear();
      staying.clear();
      for (const ti of [...company.keys()]) if (!tables.has(ti)) company.delete(ti);
      for (const [ti, at] of tables) {
        if (!beat || at.length < 2) { company.delete(ti); continue; }
        const ids = at.map((m) => m.id).sort().join(',');
        let co = company.get(ti);
        if (!co || co.ids !== ids) {
          // A newcomer to a table mid-exchange waits for its last line, since a talk is never re-dealt mid-script;
          // one leaving ends it at once.
          const was = co?.circle && co.circle.members.every((m) => at.some((x) => x.id === m.id)) ? exchangeAt(co.circle, t, beat.lineMin) : null;
          company.set(ti, co = { ids, since: was ? was.s + SLOT_LINES * beat.lineMin : t, carry: was ? co.circle : null, circle: null });
        }
        if (co.carry && t < co.since) {
          circles.push(co.carry);
          for (const m of co.carry.members) { inCircle.add(m.id); staying.add(m.id); }
          continue;
        }
        co.carry = null;
        const round = Math.max(0, Math.floor((t - co.since) / beat.roundMin));
        const start = co.since + round * beat.roundMin;
        co.circle = null;
        for (const c of dealCircles(`in:${b.key}:${ti}:${co.since}`, at.map((m) => m.res), round, start, start + beat.roundMin, GATHER_BEAT_S * beat.roundMin / ROUND_S)) {
          circles.push(c);
          co.circle ??= c;
          const on = t - co.since < beat.roundMin || exchangeAt(c, t, beat.lineMin) != null;
          for (const m of c.members) { inCircle.add(m.id); if (on) staying.add(m.id); }
        }
      }
      const court = b.town.typeOf?.(b.key) === BUILDING_TYPES.Palace;
      for (const [id, s] of stood) {
        const want = court && s.res.job === 'courtier' && s.bed < 0 && !s.walk && !inCircle.has(id) ? stillFlatOf(s.res, 'court') : null;
        if ((want?.archive ?? -1) === (s.flat?.archive ?? -1) && (want?.record ?? -1) === (s.flat?.record ?? -1)) continue;
        if (!want || unseen(placeOf(s))) s.flat = want;
      }
      arriving = false;
      list.length = 0;
      for (const [id, s] of stood) {
        if (s.bed >= 0) {
          const st = room.beds[s.bed];
          list.push({ key: `in:${id}`, res: s.res, feet: st.feet, yaw: st.yaw, moving: false, distM: Math.hypot(st.feet[0] - feet[0], st.feet[2] - feet[2]) });
          continue;
        }
        if (s.walk) {
          const p = placeOf(s);
          list.push({ key: `in:${id}`, res: s.res, feet: p, yaw: Math.atan2(s.walk.to[0] - s.walk.from[0], s.walk.to[2] - s.walk.from[2]), moving: true, distM: Math.hypot(p[0] - feet[0], p[2] - feet[2]) });
          continue;
        }
        const p = room.spots[s.spot];
        const mates = tables.get(room.tableOf[s.spot]) ?? [];
        const toward = mates.length > 1
          ? [mates.reduce((a, m) => a + room.spots[m.spot][0], 0) / mates.length, 0, mates.reduce((a, m) => a + room.spots[m.spot][2], 0) / mates.length]
          : room.face[s.spot];
        list.push({ key: `in:${id}`, res: s.res, feet: p, yaw: Math.atan2(toward[0] - p[0], toward[2] - p[2]), moving: false, distM: Math.hypot(p[0] - feet[0], p[2] - feet[2]), flat: s.flat ?? null });
      }
      deps.sprites.sync(list, { dt, eye, ground: true });
      const still = lastFeet != null && Math.hypot(feet[0] - lastFeet[0], feet[2] - lastFeet[2]) < 1e-3;
      lastFeet = [feet[0], feet[1], feet[2]];
      for (const [id, s] of stood) {
        const p = placeOf(s);
        const dist = Math.hypot(p[0] - feet[0], p[2] - feet[2]);
        if (inCircle.has(id) || dist > GREET_RANGE || Math.abs(p[1] - feet[1]) > 1.2 || !inView(deps.collider(), eye, p)) continue;
        const stopped = still && dist <= PERSON_IDLE_DISTANCE;
        const last = greeted.get(id);
        // The `t >= last.t` check drops the greeting rest when the clock goes back on a load.
        if (last && t >= last.t && t - last.t < GREET_REST_MIN && (last.said || !stopped)) continue;
        const text = b.town.greetingFor?.(s.res, t, stopped) ?? null;
        greeted.set(id, { t, said: text != null });
        if (text != null) words.set(id, { text, until: realNow + GREET_S });
      }
      if (greeted.size > 512) for (const [id, at] of greeted) if (t - at.t >= GREET_REST_MIN) greeted.delete(id);
    },
    /**
     * @param {number[]} eye
     * @returns {{ person: any, text: string, kind: 'talk' }[]}
     */
    speech(eye) {
      const b = deps.building();
      const out = [];
      if (!b?.town || !room || !stood.size) return out;
      const t = deps.clock();
      const seats = deps.sprites.persons();
      const heard = (id) => {
        const seat = seats.find((x) => x.person?.living?.id === id);
        return seat && Math.hypot(seat.pos[0] - eye[0], seat.pos[2] - eye[2]) <= LINE_RANGE ? seat : null;
      };
      if (circles.length) {
        const beat = b.town.talkBeat();
        const ctx = { ...b.town.lineCtx(t), room: roomKindOf(b.town.typeOf(b.key)) };
        if (scripts.size > 2048) scripts.clear();
        for (const c of circles) {
          const line = circleLine(c, t, beat.lineMin, ctx, scripts);
          const seat = line ? heard(line.who.id) : null;
          if (line && seat) out.push({ person: seat.person, text: line.text, kind: /** @type {'talk'} */ ('talk') });
        }
      }
      for (const [id, st] of stood) {
        if (st.res.job !== 'minstrel' || inCircle.has(id) || st.walk || st.bed >= 0) continue;
        const text = minstrelLine(st.res, t, b.town.lineCtx?.(t) ?? {});
        const seat = text ? heard(id) : null;
        if (text && seat) out.push({ person: seat.person, text, kind: /** @type {'talk'} */ ('talk') });
      }
      for (const [id, w] of [...words]) {
        if (!(w.until > realNow)) { words.delete(id); continue; }
        const seat = heard(id);
        if (seat) out.push({ person: seat.person, text: w.text, kind: /** @type {'talk'} */ ('talk') });
      }
      return out;
    },
    seats: () => deps.sprites.persons(),
    batches: () => deps.sprites.batches(),
    drawBodies(canvas, proj, view, eye, dt) { deps.sprites.drawBodies?.(canvas, proj, view, eye, dt); },
    town: () => deps.building()?.town ?? null,
    /** @param {any} person */
    caught(person) {
      const id = person?.living?.id;
      const town = deps.building()?.town;
      if (!id || !town) return null;
      const rel = town.o?.relations?.();
      const day = town.dayOf(deps.clock());
      rel?.note(id, 'crime', day);
      const at = person.pos;
      for (const seat of deps.sprites.persons()) {
        const w = seat.person?.living?.id;
        if (!w || w === id || !at || Math.hypot(seat.pos[0] - at[0], seat.pos[2] - at[2]) > WITNESS_M) continue;
        rel?.note(w, 'crime', day);
      }
      return id;
    },
    stood: () => [...stood.entries()].map(([id, s]) => ({ id, res: s.res, at: s.bed >= 0 ? room?.beds[s.bed].feet ?? null : room?.spots[s.spot] ?? null, table: tableAt.has(id) ? tableAt.get(id) : s.bed >= 0 ? -1 : room?.tableOf[s.spot] ?? -1, walking: !!s.walk, bed: s.bed, flat: s.flat ?? null })),
    beds: () => room?.beds ?? [],
    spots: () => room?.spots ?? [],
    tableOf: () => room?.tableOf ?? [],
    clear,
    get size() { return stood.size; },
  };
}
