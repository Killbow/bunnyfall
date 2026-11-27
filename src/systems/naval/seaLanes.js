// @ts-check
import { hash32 } from '../../world/spawnedDungeons.js';
import { mulberry32 } from '../../combat/bloodArt.js';
import { classFor, HULL } from './navalShips.js';
import { nativeOfPixel, NATIVE_PIXEL } from './seaRaiders.js';

export const ROADSTEAD_PX = 3;
export const LANE_NEIGHBOURS = 2;
export const LANE_MAX_PX = 30;
export const LANE_PATH_PX = 60;
export const LANE_SEARCH = 20000;
export const LANE_STRAIGHT_STEPS = 4;
export const LANE_CRUISE = 0.7;
export const LANE_DWELL_S = 600;
export const LANE_HEADWAY_S = 1800;
export const LANE_NAVY = 0.25;
// One level for every player, so a lane's ship class never depends on who reads it.
export const LANE_LEVEL = 10;
export const LANE_SALT = 0x1a4e5;
export const LANE_LINEAGE = 24;
const M_PER_NATIVE = 819.2 / NATIVE_PIXEL;

export function lanePixels(from, to, water) {
  const W = 1000, H = 500;
  if (!water(from.x, from.y) || !water(to.x, to.y)) return null;
  const key = (x, y) => y * W + x;
  const g = new Map([[key(from.x, from.y), 0]]), came = new Map(), shut = new Set();
  const h = (x, y) => Math.hypot(x - to.x, y - to.y);
  const heap = [[h(from.x, from.y), from.x, from.y]];
  const push = (n) => { heap.push(n); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top;
  };
  let expanded = 0;
  while (heap.length && expanded < LANE_SEARCH) {
    const [, x, y] = pop();
    const k = key(x, y);
    if (shut.has(k)) continue;
    shut.add(k);
    const gk = g.get(k);
    if (x === to.x && y === to.y) {
      const path = [{ x, y }];
      for (let c = came.get(k); c != null; c = came.get(c)) path.push({ x: c % W, y: Math.floor(c / W) });
      return path.reverse();
    }
    expanded++;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || !water(nx, ny)) continue;
        if (dx && dy && (!water(x + dx, y) || !water(x, y + dy))) continue;
        const ng = gk + (dx && dy ? Math.SQRT2 : 1);
        const nk = key(nx, ny);
        if (ng >= (g.get(nk) ?? Infinity) || ng > LANE_PATH_PX) continue;
        g.set(nk, ng); came.set(nk, k);
        push([ng + h(nx, ny), nx, ny]);
      }
    }
  }
  return null;
}

const centreOf = (p) => { const o = nativeOfPixel(p.x, p.y); return { x: o.x + NATIVE_PIXEL / 2, z: o.z + NATIVE_PIXEL / 2 }; };
function holds(a, b, waterNative) {
  const n = Math.max(1, Math.ceil((Math.hypot(b.x - a.x, b.z - a.z) / NATIVE_PIXEL) * LANE_STRAIGHT_STEPS));
  for (let i = 1; i < n; i++) if (!waterNative(a.x + ((b.x - a.x) * i) / n, a.z + ((b.z - a.z) * i) / n)) return false;
  return true;
}
export function straighten(pixels, waterNative) {
  const pts = pixels.map(centreOf);
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !holds(pts[i], pts[j], waterNative)) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

export function roadsteadOf(port, open) {
  for (let r = 1; r <= ROADSTEAD_PX; r++) {
    let best = null, bd = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = port.px + dx, y = port.py + dy;
        if (!open(x, y)) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = { x, y }; }
      }
    }
    if (best) return best;
  }
  return null;
}

export function laneNetwork(ports, open) {
  // Sorted by id and paired lower id first, so every client builds the same lanes.
  const sea = [...ports].sort((p, q) => p.id - q.id).map((p) => ({ ...p, road: roadsteadOf(p, open) })).filter((p) => p.road);
  const pairs = new Map();
  for (const p of sea) {
    const near = sea.filter((q) => q !== p).map((q) => ({ q, d: Math.hypot(q.road.x - p.road.x, q.road.y - p.road.y) }))
      .filter((x) => x.d > 0 && x.d <= LANE_MAX_PX).sort((x, y) => x.d - y.d || x.q.id - y.q.id).slice(0, LANE_NEIGHBOURS);
    for (const { q } of near) {
      const [a, b] = p.id < q.id ? [p, q] : [q, p];
      const key = `${a.id}-${b.id}`;
      if (!pairs.has(key)) pairs.set(key, { key, a, b });
    }
  }
  return [...pairs.values()];
}

export function laneWay(lane, water, waterNative) {
  const px = lanePixels(lane.a.road, lane.b.road, water);
  if (!px) return null;
  const pts = straighten(px, waterNative);
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z) * M_PER_NATIVE;
  return { pts, len };
}

export const laneSeed = (lane) => hash32(lane.a.id >>> 0, lane.b.id >>> 0, LANE_SALT);
export function packetOf(lane, k = 0, count = 1) {
  const seed = hash32(laneSeed(lane), k >>> 0, LANE_SALT);
  const r = mulberry32(seed);
  const faction = r() < LANE_NAVY ? 'navy' : 'merchant';
  let cls = classFor(faction, LANE_LEVEL, r());
  // Never a galley: a packet must moor.
  if (cls?.hull === HULL.LargeGalley) cls = classFor(faction, 1, r());
  return { seed, cls, speed: (cls?.speed ?? 4) * LANE_CRUISE, phase: (mulberry32(laneSeed(lane))() + k / Math.max(1, count)) % 1 };
}

function along(pts, s) {
  let left = Math.max(0, s);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const seg = Math.hypot(b.x - a.x, b.z - a.z) * M_PER_NATIVE;
    if (left <= seg || i === pts.length - 1) {
      const k = seg > 0 ? Math.min(1, left / seg) : 1;
      return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, dx: b.x - a.x, dz: b.z - a.z };
    }
    left -= seg;
  }
  const p = pts[pts.length - 1];
  return { x: p.x, z: p.z, dx: 0, dz: 0 };
}

export function packetsAt(lane, way, ms) {
  const first = packetOf(lane);
  const leg = way.len / Math.max(0.1, first.speed);
  const count = Math.max(1, Math.round((2 * (leg + LANE_DWELL_S)) / LANE_HEADWAY_S));
  const out = [];
  for (let k = 0; k < count; k++) out.push(packetAt(lane, way, ms, k, count));
  return out;
}
// A packet's place is a function of the shared clock alone, so every player sees her in the same water.
export function packetAt(lane, way, ms, k = 0, count = 1) {
  const p = packetOf(lane, k, count);
  const leg = way.len / Math.max(0.1, p.speed);
  const period = 2 * (leg + LANE_DWELL_S);
  const t = ms / 1000 + p.phase * period;
  const voyage = Math.floor(t / period);
  const tau = t - voyage * period;
  const seeds = [];
  // A ship still afloat at her voyage's end sails the next as herself, so any of these seeds names this packet.
  for (let j = 0; j < LANE_LINEAGE; j++) seeds.push(hash32(p.seed, (voyage - j) >>> 0, LANE_SALT));
  const base = { id: `L${lane.key}.${k}.${voyage}`, lane: lane.key, k, voyage, seed: seeds[0], seeds, cls: p.cls, region: lane.a.region ?? -1 };
  const rev = [...way.pts].reverse();
  const sailing = (pts, s, from, to) => {
    const here = along(pts, s);
    return { ...base, phase: 'sail', from, to, port: null, at: { x: here.x, z: here.z }, dir: { x: here.dx, z: here.dz }, leg: pts, until: null };
  };
  const end = (pts) => pts[pts.length - 1];
  const start = voyage * period - p.phase * period;
  if (tau < leg) return sailing(way.pts, tau * p.speed, lane.a, lane.b);
  if (tau < leg + LANE_DWELL_S) {
    const e = end(way.pts);
    return { ...base, phase: 'dwell', from: lane.a, to: lane.a, port: lane.b, at: { x: e.x, z: e.z }, dir: { x: 0, z: 0 }, leg: way.pts, until: start + leg + LANE_DWELL_S };
  }
  if (tau < 2 * leg + LANE_DWELL_S) return sailing(rev, (tau - leg - LANE_DWELL_S) * p.speed, lane.b, lane.a);
  const e = end(rev);
  return { ...base, phase: 'dwell', from: lane.b, to: lane.b, port: lane.a, at: { x: e.x, z: e.z }, dir: { x: 0, z: 0 }, leg: rev, until: start + period };
}

// Steer along the leg from where she is, never for her place on the clock, which cuts across land at bends.
export function pursue(leg, x, z, ahead) {
  if (!leg?.length) return null;
  if (leg.length === 1) return { x: leg[0][0], z: leg[0][1], left: 0 };
  const len = (i) => Math.hypot(leg[i][0] - leg[i - 1][0], leg[i][1] - leg[i - 1][1]);
  let best = Infinity, seg = 1, t = 0;
  for (let i = 1; i < leg.length; i++) {
    const ax = leg[i - 1][0], az = leg[i - 1][1], dx = leg[i][0] - ax, dz = leg[i][1] - az, l2 = dx * dx + dz * dz;
    const k = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    const d = (x - (ax + dx * k)) ** 2 + (z - (az + dz * k)) ** 2;
    if (d < best) { best = d; seg = i; t = k; }
  }
  let left = len(seg) * (1 - t);
  for (let i = seg + 1; i < leg.length; i++) left += len(i);
  let need = Math.max(0, ahead);
  for (let i = seg, k = t; i < leg.length; i++, k = 0) {
    const L = len(i), rest = L * (1 - k);
    if (L > 0 && need <= rest) {
      const kk = k + need / L;
      return { x: leg[i - 1][0] + (leg[i][0] - leg[i - 1][0]) * kk, z: leg[i - 1][1] + (leg[i][1] - leg[i - 1][1]) * kk, left };
    }
    need -= rest;
  }
  const e = leg[leg.length - 1];
  return { x: e[0], z: e[1], left };
}
