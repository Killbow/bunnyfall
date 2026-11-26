// @ts-check
// Places the card tables in a tavern.

import { SEAT_OUT } from '../player/seatPose.js';
import { trs, transformPoint } from './mat4.js';

export const TAVERN_CARD_TABLES = 2;
export const PLACE_CELL = 0.5;
export const PLACE_GRID_OFF = Object.freeze([1 / 320, 1 / 640]);
export const PLACE_REACH_M = 16;
export const PLACE_FROM_DOOR_M = 3;
export const PLACE_RING_M = SEAT_OUT + 0.4;
export const PLACE_LANE_CELLS = 1;
export const PLACE_ROUND_CELLS = 2;
export const PLACE_BODY_R = 0.2875;
export const PLACE_CLEAR_HEIGHTS = Object.freeze([0.6, 1.5]);
export const PLACE_STOREY_SLACK = 0.2125;
export const PLACE_PROBE_M = 1.9125;
export const PLACE_AVOID_DY = 2.5;

/**
 * @param {{min: readonly number[], max: readonly number[]}} box
 * @param {number[]} start
 * @param {{floor: (x: number, y: number, z: number) => number|null, open: (x: number, y: number, z: number, r: number) => boolean}} probe
 * @param {number[][]} [avoid]
 */
export function placedTableSpot(box, start, probe, avoid = []) {
  const sx = start[0] + PLACE_GRID_OFF[0], sz = start[2] + PLACE_GRID_OFF[1];
  const floor0 = probe.floor(sx, start[1] + 1, sz);
  if (floor0 == null) return null;
  const n = Math.round(PLACE_REACH_M / PLACE_CELL);
  const side = 2 * n + 1;
  const at = (i) => (i - n) * PLACE_CELL;
  const walk = new Int8Array(side * side);
  const floorOf = new Float64Array(side * side);
  const walkable = (i, k) => {
    if (i < 0 || k < 0 || i >= side || k >= side) return false;
    const c = k * side + i;
    if (!walk[c]) {
      const x = sx + at(i), z = sz + at(k);
      const fy = probe.floor(x, floor0 + PLACE_PROBE_M, z);
      const ok = fy != null && Math.abs(fy - floor0) <= PLACE_STOREY_SLACK
        && PLACE_CLEAR_HEIGHTS.every((h) => probe.open(x, floor0 + h, z, PLACE_BODY_R));
      walk[c] = ok ? 1 : -1;
      if (ok) floorOf[c] = fy;
    }
    return walk[c] === 1;
  };
  let first = -1;
  for (let r = 0; r <= 2 && first < 0; r++) {
    for (let dk = -r; dk <= r && first < 0; dk++) for (let di = -r; di <= r && first < 0; di++) {
      if (Math.max(Math.abs(di), Math.abs(dk)) !== r) continue;
      if (walkable(n + di, n + dk)) first = (n + dk) * side + (n + di);
    }
  }
  if (first < 0) return null;
  const dist = new Int32Array(side * side).fill(-1);
  dist[first] = 0;
  const order = [first];
  for (let q = 0; q < order.length; q++) {
    const c = order[q], i = c % side, k = (c - i) / side;
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nk = k + dk;
      if (!walkable(ni, nk)) continue;
      const nc = nk * side + ni;
      if (dist[nc] >= 0) continue;
      dist[nc] = dist[c] + 1;
      order.push(nc);
    }
  }
  const [x0, y0, z0] = box.min, [x1, , z1] = box.max;
  const mid = [(x0 + x1) / 2, (z0 + z1) / 2];
  const ways = [0, 90].map((yawDeg) => {
    const [ax, az] = yawDeg ? [(z1 - z0) / 2, (x1 - x0) / 2] : [(x1 - x0) / 2, (z1 - z0) / 2];
    const hx = ax + PLACE_RING_M, hz = az + PLACE_RING_M;
    const ri = Math.max(0, Math.ceil((hx - PLACE_BODY_R) / PLACE_CELL)), rk = Math.max(0, Math.ceil((hz - PLACE_BODY_R) / PLACE_CELL));
    const ti = Math.floor(ax / PLACE_CELL), tk = Math.floor(az / PLACE_CELL);
    const m = transformPoint(trs(0, 0, 0, 0, yawDeg, 0), mid[0], 0, mid[1]);
    return { yawDeg, hx, hz, ri, rk, ti, tk, mx: m[0], mz: m[2] };
  });
  const near = avoid.filter((a) => Math.abs(a[1] - floor0) <= PLACE_AVOID_DY);
  const fromDoor = Math.ceil(PLACE_FROM_DOOR_M / PLACE_CELL);
  const stood = near.filter((a) => a.length > 4).map(([ax, , az, rx, rz]) => {
    const ri = Math.max(0, Math.ceil((rx - PLACE_BODY_R) / PLACE_CELL)) + PLACE_LANE_CELLS, rk = Math.max(0, Math.ceil((rz - PLACE_BODY_R) / PLACE_CELL)) + PLACE_LANE_CELLS;
    const ai = Math.round((ax - sx) / PLACE_CELL) + n, ak = Math.round((az - sz) / PLACE_CELL) + n;
    return [ai - ri, ai + ri, ak - rk, ak + rk];
  });
  const before = new Int32Array(side * side), after = new Int32Array(side * side), seen = new Int32Array(side * side);
  let stamp = 0;
  const pieces = (lab, i0, i1, k0, k1, out) => {
    stamp++;
    for (let ck = k0; ck <= k1; ck++) for (let ci = i0; ci <= i1; ci++) {
      const c0 = ck * side + ci;
      if (dist[c0] < 0 || seen[c0] === stamp || out(ci, ck)) continue;
      seen[c0] = stamp;
      lab[c0] = c0;
      const q = [c0];
      for (let h = 0; h < q.length; h++) {
        const c = q[h], qi = c % side, qk = (c - qi) / side;
        for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = qi + di, nk = qk + dk;
          if (ni < i0 || nk < k0 || ni > i1 || nk > k1) continue;
          const nc = nk * side + ni;
          if (dist[nc] < 0 || seen[nc] === stamp || out(ni, nk)) continue;
          seen[nc] = stamp;
          lab[nc] = c0;
          q.push(nc);
        }
      }
    }
  };
  const inTheWay = (i, k, w) => {
    const li = w.ri + PLACE_LANE_CELLS, lk = w.rk + PLACE_LANE_CELLS;
    const out = (ci, ck) => Math.abs(ci - i) <= li && Math.abs(ck - k) <= lk;
    const fi = first % side;
    if (out(fi, (first - fi) / side)) return true;
    const m = PLACE_ROUND_CELLS;
    let [i0, i1, k0, k1] = [i - li, i + li, k - lk, k + lk];
    for (const [a0, a1, b0, b1] of stood) {
      if (a0 > i1 + m || a1 < i0 - m || b0 > k1 + m || b1 < k0 - m) continue;
      [i0, i1, k0, k1] = [Math.min(i0, a0), Math.max(i1, a1), Math.min(k0, b0), Math.max(k1, b1)];
    }
    [i0, i1, k0, k1] = [Math.max(0, i0 - m), Math.min(side - 1, i1 + m), Math.max(0, k0 - m), Math.min(side - 1, k1 + m)];
    pieces(before, i0, i1, k0, k1, () => false);
    pieces(after, i0, i1, k0, k1, out);
    const joined = new Map();
    for (let ck = k0; ck <= k1; ck++) for (let ci = i0; ci <= i1; ci++) {
      const c = ck * side + ci;
      if (dist[c] < 0 || out(ci, ck)) continue;
      const was = joined.get(before[c]);
      if (was === undefined) joined.set(before[c], after[c]);
      else if (was !== after[c]) return true;
    }
    return false;
  };
  for (const c of order) {
    if (dist[c] < fromDoor) continue;
    const i = c % side, k = (c - i) / side;
    const cx = sx + at(i), cz = sz + at(k);
    for (const w of ways) {
      let ok = true;
      for (let dk = -w.rk; dk <= w.rk && ok; dk++) for (let di = -w.ri; di <= w.ri && ok; di++) {
        if (i + di < 0 || k + dk < 0 || i + di >= side || k + dk >= side || dist[(k + dk) * side + (i + di)] < 0) ok = false;
      }
      if (!ok) continue;
      if (near.some(([ax, , az, r, rz = r]) => Math.abs(ax - cx) < w.hx + r && Math.abs(az - cz) < w.hz + rz)) continue;
      if (inTheWay(i, k, w)) continue;
      let fy = -Infinity;
      for (let dk = -w.tk; dk <= w.tk; dk++) for (let di = -w.ti; di <= w.ti; di++) fy = Math.max(fy, floorOf[(k + dk) * side + (i + di)]);
      return { x: cx - w.mx, y: fy - y0, z: cz - w.mz, yawDeg: w.yawDeg, cx, cz, hx: w.hx, hz: w.hz };
    }
  }
  return null;
}
