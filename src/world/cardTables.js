// @ts-check
import { HOLDEM_SEATS_MIN, HOLDEM_SEATS_MAX } from '../net/cardLaw.js';
import { SEATED_EYE_HEIGHT, SEAT_OUT } from '../player/seatPose.js';
import { transformPoint } from './mat4.js';

export const SEAT_SPACING = 0.75;
export const SEAT_SIDE_MIN = 0.6;
export const SEAT_FLOOR_PROBE = 2;
export const SEAT_SURFACE_MAX = 0.55;
export const SEAT_TAKEN_RADIUS = 0.3;

// A probe miss (Infinity) or NaN fails this check, so a seat with no floor is rejected.
export const seatFloorOk = (down) => down >= SEATED_EYE_HEIGHT - SEAT_SURFACE_MAX && down <= SEAT_FLOOR_PROBE;

export const SEAT_STICK_LEAVE = 0.3;
export const leavesSeat = (mv, jump) => !!(mv?.forwards || mv?.backwards || mv?.left || mv?.right || jump
  || (mv?.analog && Math.hypot(Number(mv.analog.x) || 0, Number(mv.analog.y) || 0) > SEAT_STICK_LEAVE));

export const yawToward = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

/**
 * Spots come in a fixed order (+x, -x, +z, then -z side, each from its low end) so a table always numbers its seats
 * the same way.
 * @param {{min: readonly number[], max: readonly number[]}} box
 */
export function seatSpots(box) {
  const [x0, , z0] = box.min;
  const [x1, , z1] = box.max;
  const spots = [];
  const along = (len) => (len < SEAT_SIDE_MIN ? 0 : Math.max(1, Math.floor(len / SEAT_SPACING)));
  const sides = [
    { side: '+x', n: along(z1 - z0), at: (t) => [x1 + SEAT_OUT, z0 + t * (z1 - z0)], nx: -1, nz: 0 },
    { side: '-x', n: along(z1 - z0), at: (t) => [x0 - SEAT_OUT, z0 + t * (z1 - z0)], nx: 1, nz: 0 },
    { side: '+z', n: along(x1 - x0), at: (t) => [x0 + t * (x1 - x0), z1 + SEAT_OUT], nx: 0, nz: -1 },
    { side: '-z', n: along(x1 - x0), at: (t) => [x0 + t * (x1 - x0), z0 - SEAT_OUT], nx: 0, nz: 1 },
  ];
  for (const s of sides) for (let k = 0; k < s.n; k++) {
    const [lx, lz] = s.at((k + 0.5) / s.n);
    spots.push({ lx, lz, nx: s.nx, nz: s.nz, side: s.side });
  }
  return spots;
}

const IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/**
 * @param {{aabb: {min: number[], max: number[]}, box?: {min: number[], max: number[]}, matrix?: ArrayLike<number>}} table
 * @param {(from: number[], to: number[]) => boolean} clear
 */
export function cardTableSeats(table, clear) {
  const { aabb } = table;
  const box = table.box ?? aabb;
  const m = table.matrix ?? IDENTITY;
  const floorY = aabb.min[1], topY = aabb.max[1];
  const midL = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
  const midW = transformPoint(m, midL[0], midL[1], midL[2]);
  const kept = [];
  for (const s of seatSpots(box)) {
    const p = transformPoint(m, s.lx, midL[1], s.lz);
    const q = transformPoint(m, s.lx + s.nx, midL[1], s.lz + s.nz);
    const eye = [p[0], floorY + SEATED_EYE_HEIGHT, p[2]];
    if (!clear([midW[0], eye[1], midW[2]], eye)) continue;
    kept.push({
      x: p[0], z: p[2], floorY, side: s.side,
      feet: [p[0], floorY, p[2]], top: topY - floorY, eye,
      yaw: yawToward(p[0], p[2], q[0], q[2]),
      pitch: Math.atan2(topY - eye[1], Math.hypot(midW[0] - eye[0], midW[2] - eye[2])),
    });
  }
  if (kept.length < HOLDEM_SEATS_MIN) return [];
  if (kept.length <= HOLDEM_SEATS_MAX) return kept;
  const bySide = new Map();
  for (const s of kept) { if (!bySide.has(s.side)) bySide.set(s.side, []); bySide.get(s.side).push(s); }
  const queues = [...bySide.values()];
  const out = [];
  for (let k = 0; out.length < HOLDEM_SEATS_MAX; k++) for (const q of queues) if (q[k] && out.length < HOLDEM_SEATS_MAX) out.push(q[k]);
  return kept.filter((s) => out.includes(s));
}

/** @param {{aabb: {min: number[], max: number[]}, box?: {min: number[], max: number[]}, matrix?: ArrayLike<number>}} table */
export function tableFrame(table) {
  const box = table.box ?? table.aabb, m = table.matrix ?? IDENTITY;
  const mid = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
  const lx = box.max[0] - box.min[0], lz = box.max[2] - box.min[2];
  const c = transformPoint(m, mid[0], mid[1], mid[2]);
  const along = lx >= lz ? transformPoint(m, mid[0] + 1, mid[1], mid[2]) : transformPoint(m, mid[0], mid[1], mid[2] + 1);
  return { centre: [c[0], table.aabb.max[1], c[2]], axisYaw: yawToward(c[0], c[2], along[0], along[2]), halfLong: Math.max(lx, lz) / 2, halfShort: Math.min(lx, lz) / 2 };
}

/**
 * @param {{x: number, z: number}[]} seats
 * @param {number[][]} feet
 */
export const takenSeats = (seats, feet) => seats.flatMap((s, i) => (feet.some((f) => Math.hypot(f[0] - s.x, f[2] - s.z) <= SEAT_TAKEN_RADIUS) ? [i] : []));

/**
 * @param {{x: number, z: number}[]} seats
 * @param {number} x
 * @param {number} z
 * @param {Iterable<number>} [taken]
 */
export function nearestFreeSeat(seats, x, z, taken = []) {
  const busy = new Set(taken);
  let best = -1, bestD = Infinity;
  seats.forEach((s, i) => {
    if (busy.has(i)) return;
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bestD) { best = i; bestD = d; }
  });
  return best;
}
