// @ts-check
// Port towns have no dock data, so harbors, berths, and sea paths are found from the terrain.

import { hash32 } from '../../world/spawnedDungeons.js';
import { mulberry32 } from '../../combat/bloodArt.js';
import { hullBuild, MOD_CARRACK_BUILD } from './navalShips.js';
import { stepFishing, fishingHeld } from './fishingBoats.js';

export const HARBOUR_REACH = 420;
export const SHORE_STEP = 12;
export const BERTH_MARGIN = 4;
export const BERTH_SPACING = 1.25;
export const HARBOUR_BERTHS = 6;
export const MOUTH_CLEAR = 60;
export const MOUTH_REACH = 900;
export const BERTH_HULL = 4;
// Every hull but the galley berths; a berth is sounded for the deepest keel among them.
export const BERTH_HULLS = Object.freeze([0, 1, 2, 4]);
export const HULL_DRAFT = Object.freeze([0.8, 1.4, null, 2.8, 3.2]);
export const DRAFT_SPARE = 0.06;
export const draftOf = (hull) => {
  const h = Math.min(HULL_DRAFT.length - 1, Math.max(0, hull | 0));
  // Hull 2, and hull 4 when its own model replaces the mod's carrack, take the draft from the keel in hullBuild.
  if (h === 4 && hullBuild(4) !== MOD_CARRACK_BUILD) return DRAFT_SPARE - hullBuild(4).keel;
  return h === 2 ? DRAFT_SPARE - hullBuild(2).keel : /** @type {number} */ (HULL_DRAFT[h]);
};
export const deepestBerther = () => BERTH_HULLS.reduce((a, h) => (draftOf(h) > draftOf(a) ? h : a));
export const WATER_CELL = 20;
export const WATER_CLEAR = 0.6;
// The path search is bounded: a way not found within PATH_NODES expansions counts as none.
export const PATH_NODES = 6000;
export const LEG_MARGIN = 45;
export const LEG_END_M = 60;
export const REACH_M = 35;
export const APPROACH_LENGTHS = 1.2;
export const APPROACH_OUT = 70;
export const BERTH_SNAP_M = 18;
export const BERTH_WAY = 3;
export const ARRIVE_EASE_M = 220;
export const ARRIVE_SAILS = 0.18;
export const MOOR_EASE_S = 4;
export const DWELL_S = Object.freeze([180, 540]);
export const VOYAGE_DIST = 2600;
export const PATROL_R = 450;
export const PATROL_POINTS = 5;
export const PATROL_S = 420;
export const LURK_R = 650;
export const LURK_RING = 140;
export const LURK_SAILS = 0.5;
export const NIGHT_LURK_K = 0.5;
export const STALL_WAY = 0.5;
export const STALL_S = 15;
export const DETOUR_M = 70;
export const VOYAGE_REACH = 6000;
export const ERRAND_SALT = 0x5b1f;
export const ERRANDS = Object.freeze(['moored', 'depart', 'voyage', 'arrive', 'patrol', 'lurk']);

const TAU = Math.PI * 2;
const wrap = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; else if (a < -Math.PI) a += TAU; return a; };
const heading = (from, to) => Math.atan2(to[0] - from[0], to[1] - from[1]);
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const flat = (p) => [p[0], p[2]];

export function hullSize(hull) {
  const b = hullBuild(hull);
  return { length: b.bowZ - b.aftZ, halfWidth: b.halfWidth, bowZ: b.bowZ, aftZ: b.aftZ };
}
// Berths are sized for the mod's carrack whatever model is BERTH_HULL, so berths and quays stay put.
export const BERTH_TEMPLATE = MOD_CARRACK_BUILD;
export function berthSize(hull) {
  if (hull !== BERTH_HULL) return hullSize(hull);
  const b = BERTH_TEMPLATE;
  return { length: b.bowZ - b.aftZ, halfWidth: b.halfWidth, bowZ: b.bowZ, aftZ: b.aftZ };
}

export function alongside(berth, hull, harbourHull = BERTH_HULL) {
  const off = hullSize(hull).halfWidth - berthSize(harbourHull).halfWidth;
  return [berth.pos[0] + berth.normal[0] * off, berth.pos[1] + berth.normal[1] * off];
}

export function footprintClear(pos, yaw, hull, isWater) {
  const { halfWidth, bowZ, aftZ } = berthSize(hull);
  const fx = Math.sin(yaw), fz = Math.cos(yaw), sx = fz, sz = -fx;
  for (let z = aftZ; z <= bowZ + 1e-6; z += Math.max(4, (bowZ - aftZ) / 8)) {
    for (const s of [-halfWidth, 0, halfWidth]) {
      if (!isWater(pos[0] + fx * z + sx * s, pos[1] + fz * z + sz * s, hull)) return false;
    }
  }
  return true;
}

export const BERTH_QUAY_IN = 5.3;
export const BERTH_QUAY_ENDS = 3;
export function quayBox(pos, yaw, normal, hull = BERTH_HULL) {
  const { halfWidth, bowZ, aftZ } = berthSize(hull);
  const fx = Math.sin(yaw), fz = Math.cos(yaw), lx = -normal[0], lz = -normal[1];
  return [[aftZ - BERTH_QUAY_ENDS, -halfWidth], [bowZ + BERTH_QUAY_ENDS, -halfWidth], [bowZ + BERTH_QUAY_ENDS, halfWidth + BERTH_QUAY_IN], [aftZ - BERTH_QUAY_ENDS, halfWidth + BERTH_QUAY_IN]]
    .map(([z, x]) => [pos[0] + fx * z + lx * x, pos[1] + fz * z + lz * x]);
}
export function boxesMeet(a, b) {
  for (const box of [a, b]) {
    for (let i = 0; i < 4; i++) {
      const [px, pz] = box[i], [qx, qz] = box[(i + 1) % 4], ax = pz - qz, az = qx - px;
      const span = (q) => q.map(([x, z]) => x * ax + z * az);
      const sa = span(a), sb = span(b);
      if (Math.max(...sa) <= Math.min(...sb) || Math.max(...sb) <= Math.min(...sa)) return false;
    }
  }
  return true;
}

export function findHarbour({ rect, isWater: own, hull = BERTH_HULL, deep = deepestBerther(), max = HARBOUR_BERTHS, reach = HARBOUR_REACH, square = false }) {
  const { length, halfWidth } = berthSize(hull);
  const isWater = (x, z, h) => !!own(x, z, h) && (h === deep || !!own(x, z, deep));
  const water = (x, z) => isWater(x, z, hull);
  const cx = (rect.minX + rect.maxX) / 2, cz = (rect.minZ + rect.maxZ) / 2;
  const x0 = rect.minX - reach, x1 = rect.maxX + reach, z0 = rect.minZ - reach, z1 = rect.maxZ + reach;
  const cands = [];
  for (let x = x0; x <= x1; x += SHORE_STEP) {
    for (let z = z0; z <= z1; z += SHORE_STEP) {
      if (!water(x, z)) continue;
      if (water(x + SHORE_STEP, z) && water(x - SHORE_STEP, z) && water(x, z + SHORE_STEP) && water(x, z - SHORE_STEP)) continue;
      let nx = 0, nz = 0;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * TAU, dx = Math.sin(a), dz = Math.cos(a);
        if (water(x + dx * SHORE_STEP * 2, z + dz * SHORE_STEP * 2)) { nx += dx; nz += dz; }
      }
      const n = Math.hypot(nx, nz);
      if (n < 1.5) continue;
      nx /= n; nz /= n;
      const off = halfWidth + BERTH_MARGIN;
      const pos = [x + nx * off, z + nz * off];
      const dx = Math.max(rect.minX - pos[0], 0, pos[0] - rect.maxX), dz = Math.max(rect.minZ - pos[1], 0, pos[1] - rect.maxZ);
      if ((square ? Math.max(dx, dz) : Math.hypot(dx, dz)) > reach) continue;
      cands.push({ pos, normal: [nx, nz], d: Math.hypot(pos[0] - cx, pos[1] - cz) });
    }
  }
  cands.sort((a, b) => a.d - b.d || a.pos[0] - b.pos[0] || a.pos[1] - b.pos[1]);
  const berths = [], boxes = [];
  for (const c of cands) {
    if (berths.length >= max) break;
    if (berths.some((b) => dist2(b.pos, c.pos) < length * BERTH_SPACING)) continue;
    const along = Math.atan2(c.normal[0], c.normal[1]) + Math.PI / 2;
    for (const yaw of [wrap(along), wrap(along + Math.PI)]) {
      if (!footprintClear(c.pos, yaw, hull, isWater)) continue;
      const back = length * APPROACH_LENGTHS;
      const approach = [c.pos[0] - Math.sin(yaw) * back + c.normal[0] * APPROACH_OUT, c.pos[1] - Math.cos(yaw) * back + c.normal[1] * APPROACH_OUT];
      if (!footprintClear(approach, yaw, hull, isWater)) continue;
      const box = quayBox(c.pos, yaw, c.normal, hull);
      if (boxes.some((o) => boxesMeet(o, box))) continue;
      boxes.push(box);
      berths.push({ pos: c.pos, yaw, normal: c.normal, approach });
      break;
    }
  }
  if (!berths.length) return null;
  let mx = 0, mz = 0, px = 0, pz = 0;
  for (const b of berths) { mx += b.normal[0]; mz += b.normal[1]; px += b.pos[0]; pz += b.pos[1]; }
  let m = Math.hypot(mx, mz);
  // Shores facing apart cancel the mean normal, so the mouth is then sought from the nearest berth instead.
  if (m < berths.length * MOUTH_AGREE) { [mx, mz] = berths[0].normal; [px, pz] = berths[0].pos; m = 1; }
  else { px /= berths.length; pz /= berths.length; }
  mx /= m; mz /= m;
  let mouth = null;
  for (let d = 0; d <= MOUTH_REACH && !mouth; d += SHORE_STEP) {
    const p = [px + mx * d, pz + mz * d];
    if (!water(p[0], p[1])) continue;
    let open = true;
    for (let k = 0; k < 12 && open; k++) { const a = (k / 12) * TAU; open = water(p[0] + Math.sin(a) * MOUTH_CLEAR, p[1] + Math.cos(a) * MOUTH_CLEAR); }
    if (open) mouth = p;
  }
  if (!mouth) return null;
  const grid = createWaterGrid({ isWater, hull });
  const reached = berths.filter((b) => grid.clear(b.approach, mouth) || grid.path(b.approach, mouth) != null);
  return reached.length ? { berths: reached, mouth, hull } : null;
}
// Coarser sampling lets a straightened leg clip the corner of a narrow spit.
export const CLEAR_STEP = 0.25;
export const DETOUR_GIVEUP = 3;
export const MOUTH_AGREE = 0.35;

export function createWaterGrid({ isWater, hull = 0, cell = WATER_CELL, nodeCap = PATH_NODES }) {
  const cache = new Map();
  const key = (i, k) => `${i},${k}`;
  const centre = (i, k) => [(i + 0.5) * cell, (k + 0.5) * cell];
  const water = (x, z) => !!isWater(x, z, hull);
  let expansions = 0;
  function open(i, k) {
    const kk = key(i, k);
    let v = cache.get(kk);
    if (v !== undefined) return v;
    const [x, z] = centre(i, k);
    v = water(x, z);
    for (let a = 0; v && a < 8; a++) { const t = (a / 8) * TAU; v = water(x + Math.sin(t) * cell * WATER_CLEAR, z + Math.cos(t) * cell * WATER_CLEAR); }
    cache.set(kk, v);
    return v;
  }
  function clear(a, b) {
    const d = dist2(a, b), n = Math.max(1, Math.ceil(d / (cell * CLEAR_STEP)));
    const sx = d > 0 ? (b[1] - a[1]) / d : 0, sz = d > 0 ? -(b[0] - a[0]) / d : 0;
    for (let s = 0; s <= n; s++) {
      const t = s / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      if (!water(x, z)) return false;
      if (Math.min(t, 1 - t) * d > LEG_END_M && !(water(x + sx * LEG_MARGIN, z + sz * LEG_MARGIN) && water(x - sx * LEG_MARGIN, z - sz * LEG_MARGIN))) return false;
    }
    return true;
  }
  function wet(a, b) {
    const d = dist2(a, b), n = Math.max(1, Math.ceil(d / (cell * 0.25)));
    for (let s = 0; s <= n; s++) { const t = s / n; if (!water(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false; }
    return true;
  }
  function nearestOpen(p) {
    const i0 = Math.floor(p[0] / cell), k0 = Math.floor(p[1] / cell);
    let best = null, bestD = Infinity;
    for (let r = 0; r <= 3 && !best; r++) {
      for (let i = i0 - r; i <= i0 + r; i++) for (let k = k0 - r; k <= k0 + r; k++) {
        // The nearest open cell must join the point through water, never across a spit.
        if (Math.max(Math.abs(i - i0), Math.abs(k - k0)) !== r || !open(i, k) || !wet(p, centre(i, k))) continue;
        const d = dist2(centre(i, k), p);
        if (d < bestD) { bestD = d; best = [i, k]; }
      }
    }
    return best;
  }
  function path(from, to) {
    expansions = 0;
    if (clear(from, to)) return [[from[0], from[1]], [to[0], to[1]]];
    const s = nearestOpen(from), g = nearestOpen(to);
    if (!s || !g) return null;
    const gk = key(g[0], g[1]);
    const cost = new Map([[key(s[0], s[1]), 0]]), prev = new Map(), shut = new Set();
    const heap = [[dist2(centre(s[0], s[1]), centre(g[0], g[1])), s[0], s[1]]];
    const push = (e) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    let found = false;
    while (heap.length) {
      const [, i, k] = pop();
      const kk = key(i, k);
      if (shut.has(kk)) continue;
      shut.add(kk);
      if (kk === gk) { found = true; break; }
      if (++expansions > nodeCap) return null;
      const c0 = cost.get(kk);
      for (let di = -1; di <= 1; di++) for (let dk = -1; dk <= 1; dk++) {
        if (!di && !dk) continue;
        const ni = i + di, nk = k + dk, nkey = key(ni, nk);
        if (shut.has(nkey) || !open(ni, nk)) continue;
        if (di && dk && !(open(i + di, k) && open(i, k + dk))) continue;
        const c = c0 + (di && dk ? Math.SQRT2 : 1) * cell;
        if (c < (cost.get(nkey) ?? Infinity)) { cost.set(nkey, c); prev.set(nkey, kk); push([c + dist2(centre(ni, nk), centre(g[0], g[1])), ni, nk]); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let kk = gk; kk; kk = prev.get(kk)) { const [i, k] = kk.split(',').map(Number); cells.push(centre(i, k)); }
    cells.reverse();
    const raw = [[from[0], from[1]], ...cells, [to[0], to[1]]];
    const out = [raw[0]];
    let at = 0;
    while (at < raw.length - 1) {
      let next = at + 1;
      for (let q = raw.length - 1; q > at + 1; q--) if (clear(raw[at], raw[q])) { next = q; break; }
      out.push(raw[next]);
      at = next;
    }
    return out;
  }
  return { path, clear, open, get expansions() { return expansions; }, cell };
}

// Errands draw only from the ship's seed, so a client that takes a ship over draws the same errand; errands
// never go over the wire.
export const errandRng = (seed) => mulberry32(hash32(seed >>> 0, ERRAND_SALT));

export const dwellOf = (r) => DWELL_S[0] + r() * (DWELL_S[1] - DWELL_S[0]);

export function errandFor({ seed, faction, hull, pos, speed = 0, clock = 0, harbours = [], clear = null }) {
  const r = errandRng(seed);
  const here = flat(pos);
  if (hull !== 3 && speed < BERTH_WAY) {
    for (const h of harbours) {
      const i = h.harbour.berths.findIndex((b) => dist2(b.pos, here) <= BERTH_SNAP_M);
      if (i >= 0) return { kind: 'moored', harbour: h.key, berth: i, until: clock + dwellOf(r), path: null, i: 0 };
    }
  }
  const near = harbours.map((h) => ({ h, d: dist2(h.harbour.mouth, here) })).filter((x) => x.d <= VOYAGE_REACH).sort((a, b) => a.d - b.d);
  if (faction === 'merchant') {
    for (const { h } of near) {
      const berth = hull === 3 ? -1 : h.harbour.berths.findIndex((_, i) => h.free?.(i) ?? true);
      if (berth >= 0) return { kind: 'arrive', harbour: h.key, berth, path: null, i: 0 };
    }
    return outbound(r, here, clear);
  }
  if (faction === 'navy') {
    if (near.length) return { kind: 'patrol', harbour: near[0].h.key, since: clock, path: null, i: 0, spin: r() };
    return outbound(r, here, clear);
  }
  if (faction === 'pirate' && near.length) {
    const m = near[0].h.harbour.mouth;
    let at = null;
    for (let k = 0; k < OUTBOUND_TRIES && !at; k++) {
      const a = r() * TAU, q = [m[0] + Math.sin(a) * LURK_R, m[1] + Math.cos(a) * LURK_R];
      if (!clear || clear(m, q)) at = q;
    }
    return { kind: 'lurk', harbour: near[0].h.key, at: at ?? [m[0], m[1]], path: null, i: 0, spin: r() };
  }
  return null;
}
export const OUTBOUND_TRIES = 12;
export const OUTBOUND_OPEN = 800;
function outbound(r, here, clear = null) {
  let a = r() * TAU;
  for (let k = 0; clear && k < OUTBOUND_TRIES; k++) {
    const b = k ? r() * TAU : a;
    if (clear(here, [here[0] + Math.sin(b) * OUTBOUND_OPEN, here[1] + Math.cos(b) * OUTBOUND_OPEN])) { a = b; break; }
  }
  return { kind: 'voyage', harbour: null, to: [here[0] + Math.sin(a) * VOYAGE_DIST, here[1] + Math.cos(a) * VOYAGE_DIST], path: null, i: 0 };
}

function follow(ship, e) {
  const here = flat(ship.pos);
  while (e.i < e.path.length - 1 && dist2(here, e.path[e.i]) <= REACH_M) e.i++;
  return e.path[e.i];
}
function remaining(ship, e) {
  let d = dist2(flat(ship.pos), e.path[e.i]);
  for (let q = e.i; q < e.path.length - 1; q++) d += dist2(e.path[q], e.path[q + 1]);
  return d;
}

export function stepErrand(ship, dt, ctx) {
  const e = ship.errand;
  if (!e) return null;
  const hb = e.harbour != null ? ctx.harbour(e.harbour) : null;
  const here = flat(ship.pos);
  const plan = (goal, sails = 1) => ({ want: heading(here, goal), goal: [goal[0], 0, goal[1]], sails });
  if (e.kind !== 'moored' && !fishingHeld(e)) {
    e.stall = ship.speed < STALL_WAY ? (e.stall ?? 0) + dt : 0;
    if (e.stall >= STALL_S) {
      e.stall = 0;
      e.detours = (e.detours ?? 0) + 1;
      if (e.detours > DETOUR_GIVEUP) {
        const other = e.kind === 'arrive' && hb && ship.hull !== 3 ? hb.berths.findIndex((_, i) => i !== e.berth && (ctx.free?.(e.harbour, i) ?? true)) : -1;
        ship.errand = other >= 0 ? { kind: 'arrive', harbour: e.harbour, berth: other, path: null, i: 0 }
          : e.kind === 'arrive' ? outbound(errandRng(ship.seed ^ Math.floor(ship.clock)), here, ctx.grid(ship.hull).clear) : null;
        return stepErrand(ship, dt, ctx);
      }
      const clear = ctx.grid(ship.hull).clear;
      const sides = e.detour ? [-(e.side ?? 1), e.side ?? 1] : [1, -1];
      e.detour = null;
      for (const side of sides) {
        const a = ship.yaw + side * Math.PI / 2, q = [here[0] + Math.sin(a) * DETOUR_M, here[1] + Math.cos(a) * DETOUR_M];
        if (clear(here, q)) { e.detour = q; e.side = side; break; }
      }
    }
    if (e.detour) {
      if (dist2(here, e.detour) > REACH_M) return plan(e.detour, 0.6);
      e.detour = null; e.path = null;
    }
  }
  const way = (to, via = null) => {
    if (!e.path) {
      const grid = ctx.grid(ship.hull);
      const a = grid.path(here, via ?? to), b = via ? grid.path(via, to) : null;
      if (!a || (via && !b)) return null;
      e.path = [...a, ...(b ? b.slice(1) : [])].map((q) => [q[0], q[1]]); e.i = 0;
    }
    return follow(ship, e);
  };
  const giveUp = () => { ship.errand = null; return null; };
  switch (e.kind) {
    case 'moored': {
      const b = hb?.berths[e.berth];
      if (!b) { ship.errand = null; return null; }
      if (dist2(here, b.pos) > BERTH_SNAP_M * 2) { ship.errand = { kind: 'arrive', harbour: e.harbour, berth: e.berth, path: null, i: 0 }; return stepErrand(ship, dt, ctx); }
      if (ship.clock >= e.until && !(ctx.night && ship.cls?.faction === 'merchant')) {
        ship.errand = { kind: 'depart', harbour: e.harbour, berth: e.berth, path: null, i: 0 };
        return stepErrand(ship, dt, ctx);
      }
      return { hold: { pos: alongside(b, ship.hull, hb.hull), yaw: b.yaw } };
    }
    case 'depart': {
      if (!hb) { ship.errand = null; return null; }
      const b = hb.berths[e.berth];
      const p = way(hb.mouth, b ? [b.pos[0] + b.normal[0] * (hullSize(ship.hull).halfWidth * 3 + 20), b.pos[1] + b.normal[1] * (hullSize(ship.hull).halfWidth * 3 + 20)] : null);
      if (!p) return giveUp();
      if (dist2(here, hb.mouth) <= REACH_M * 1.5) {
        const r = errandRng(ship.seed ^ Math.floor(ship.clock));
        if (ship.cls?.faction === 'navy') ship.errand = { kind: 'patrol', harbour: e.harbour, since: ship.clock, path: null, i: 0, spin: r() };
        else {
          const other = (ctx.harbours?.() ?? []).filter((x) => x.key !== e.harbour && dist2(x.harbour.mouth, here) <= VOYAGE_REACH).sort((a, c) => dist2(a.harbour.mouth, here) - dist2(c.harbour.mouth, here))[0];
          ship.errand = other ? { kind: 'voyage', harbour: other.key, to: null, path: null, i: 0 } : outbound(r, here, ctx.grid(ship.hull).clear);
        }
        return stepErrand(ship, dt, ctx);
      }
      return plan(p, 0.8);
    }
    case 'voyage': {
      const to = hb ? hb.mouth : e.to;
      if (!to) { ship.errand = null; return null; }
      const p = hb ? way(to) : to;
      if (!p) return giveUp();
      if (dist2(here, to) <= REACH_M * 1.5) {
        if (hb) {
          const berth = hb.berths.findIndex((_, i) => ctx.free?.(e.harbour, i) ?? true);
          ship.errand = berth >= 0 && ship.hull !== 3 ? { kind: 'arrive', harbour: e.harbour, berth, path: null, i: 0 } : outbound(errandRng(ship.seed ^ 0x77), here, ctx.grid(ship.hull).clear);
        } else ship.errand = outbound(errandRng(ship.seed ^ Math.floor(ship.clock)), here, ctx.grid(ship.hull).clear);
        return stepErrand(ship, dt, ctx);
      }
      return plan(p, 1);
    }
    case 'arrive': {
      const b = hb?.berths[e.berth];
      if (!b) { ship.errand = null; return null; }
      // The berth is checked on every step, since a player's ship can take it after this ship chose it.
      if (ctx.free && !ctx.free(e.harbour, e.berth, ship)) {
        const other = hb.berths.findIndex((_, i) => i !== e.berth && ctx.free(e.harbour, i, ship));
        ship.errand = other >= 0 && ship.hull !== 3 ? { kind: 'arrive', harbour: e.harbour, berth: other, path: null, i: 0 } : outbound(errandRng(ship.seed ^ Math.floor(ship.clock)), here, ctx.grid(ship.hull).clear);
        return stepErrand(ship, dt, ctx);
      }
      const p = way(b.pos, b.approach);
      if (!p) return giveUp();
      const left = remaining(ship, e);
      if (dist2(here, b.pos) <= BERTH_SNAP_M && ship.speed <= BERTH_WAY) {
        ship.errand = { kind: 'moored', harbour: e.harbour, berth: e.berth, until: ship.clock + dwellOf(errandRng(ship.seed ^ Math.floor(ship.clock))), path: null, i: 0 };
        return { hold: { pos: alongside(b, ship.hull, hb.hull), yaw: b.yaw } };
      }
      const sails = left >= ARRIVE_EASE_M ? 1 : Math.max(ARRIVE_SAILS, left / ARRIVE_EASE_M);
      return { ...plan(p, sails), berthing: e.i === e.path.length - 1 };
    }
    case 'patrol': {
      if (!hb) { ship.errand = null; return null; }
      if (ship.clock - e.since >= PATROL_S) { ship.errand = outbound(errandRng(ship.seed ^ Math.floor(ship.clock)), here, ctx.grid(ship.hull).clear); return stepErrand(ship, dt, ctx); }
      if (!e.path) {
        const grid = ctx.grid(ship.hull), ring = [];
        for (let k = 0; k < PATROL_POINTS; k++) {
          const a = (e.spin ?? 0) * TAU + (k / PATROL_POINTS) * TAU;
          const q = [hb.mouth[0] + Math.sin(a) * PATROL_R, hb.mouth[1] + Math.cos(a) * PATROL_R];
          if (grid.clear(hb.mouth, q)) ring.push(q);
        }
        e.path = ringOver(ring, [hb.mouth[0], hb.mouth[1]], grid.clear); e.i = 0;
      }
      if (dist2(here, e.path[e.i]) <= REACH_M) e.i = (e.i + 1) % e.path.length;
      return plan(e.path[e.i], 0.7);
    }
    case 'lurk': {
      const night = !!ctx.night && !!hb;
      if (e.night !== night) { e.night = night; e.path = null; }
      const at = night ? [hb.mouth[0] + (e.at[0] - hb.mouth[0]) * NIGHT_LURK_K, hb.mouth[1] + (e.at[1] - hb.mouth[1]) * NIGHT_LURK_K] : e.at;
      if (!e.path) {
        const clear = ctx.grid(ship.hull).clear, ring = [];
        for (let k = 0; k < 4; k++) {
          const a = (e.spin ?? 0) * TAU + (k / 4) * TAU, q = [at[0] + Math.sin(a) * LURK_RING, at[1] + Math.cos(a) * LURK_RING];
          if (clear(at, q)) ring.push(q);
        }
        e.path = ringOver(ring, [at[0], at[1]], clear); e.i = 0;
      }
      if (dist2(here, e.path[e.i]) <= REACH_M) e.i = (e.i + 1) % e.path.length;
      return plan(e.path[e.i], dist2(here, at) > LURK_R * 0.5 ? 1 : LURK_SAILS);
    }
    case 'anchor': case 'fish': case 'home':
      return stepFishing(ship, dt, ctx, { here, plan, way });
    default:
      ship.errand = null;
      return null;
  }
}

function ringOver(ring, hub, clear) {
  if (!ring.length) return [hub];
  const out = [];
  for (const q of ring) { if (out.length && !clear(out[out.length - 1], q)) out.push([hub[0], hub[1]]); out.push(q); }
  if (out.length > 1 && !clear(out[out.length - 1], out[0])) out.push([hub[0], hub[1]]);
  return out;
}

export function offsetErrand(e, o) {
  if (!e) return;
  const mv = (p) => { if (p) { p[0] += o[0]; p[1] += o[2]; } };
  mv(e.to); mv(e.at); mv(e.detour);
  for (const p of e.path ?? []) mv(p);
}
export function offsetHarbour(h, o) {
  if (!h) return;
  const mv = (p) => { p[0] += o[0]; p[1] += o[2]; };
  mv(h.mouth);
  for (const b of h.berths) { mv(b.pos); mv(b.approach); }
}
