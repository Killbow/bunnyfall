// @ts-check
import { laneAt, NATIVE_PER_M } from './trips.js';
import { lwSeed, textSeed } from './seed.js';
import { HITCHED_HORSE_LOCAL_Z, HORSE_BOX_SIZE, wheelRotationDegrees, wrapWheelAngle } from '../../travel/horseCartLaw.js';
import { MEASURED } from '../../world/wagonModels.js';

export const GREAT_HOUSE_BLOCKS = 36;
export const WALK_GAP_N = 72;
export const LEAD_N = 40;
export const HITCH_N = HITCHED_HORSE_LOCAL_Z * NATIVE_PER_M;
export const WAGON_TAIL_N = 110;
export const CARGO_FULL = 90, CARGO_SOLD = 50, CARGO_BOUGHT = 75, CARGO_ROBBED = 25;
export const CAMP_PARK_N = 120;
export const CAMP_HORSE_SIDE_N = 70;

/**
 * @typedef {{ wagons: number, packs: number }} Team
 * @typedef {{ key: string, x: number, z: number, yaw: number, moving: boolean }} HorsePlace
 * @typedef {{ key: string, x: number, z: number, yaw: number, moving: boolean, tier: number, s: number, hitched: boolean }} WagonPlace
 */

/**
 * @param {any} trip
 * @returns {Team}
 */
export function teamOf(trip) {
  if (trip.kind === 'merchant') return { wagons: (trip.from?.blocks | 0) >= GREAT_HOUSE_BLOCKS ? 2 : 1, packs: 0 };
  if (trip.kind === 'noble') return { wagons: 1, packs: 0 };
  if (trip.kind === 'pedlar' || trip.kind === 'carter') return { wagons: 0, packs: 1 };
  return { wagons: 0, packs: 0 };
}

/**
 * @param {any} trip
 * @param {number} t
 */
export function cargoOf(trip, t) {
  if (trip.robbed && t >= trip.robbed.t) return CARGO_ROBBED;
  if (t < trip.backT0) return CARGO_FULL;
  return lwSeed(textSeed(trip.id), 0x63617267) % 2 ? CARGO_SOLD : CARGO_BOUGHT;
}

export const LANE_N = 80;

/**
 * @param {(s: number) => { x: number, z: number }} at
 * @param {number} s0
 * @param {number} dir
 * @param {number} dist
 */
export function chordBehind(at, s0, dir, dist) {
  const p0 = at(s0);
  const far = (/** @type {number} */ k) => { const q = at(s0 - dir * k); return Math.hypot(q.x - p0.x, q.z - p0.z); };
  if (Math.abs(far(dist) - dist) < 1e-9) return s0 - dir * dist;
  // Take the first point back at that distance: on a lane outside a corner a later point can be just as far. The
  // search steps out in eighths, then bisects.
  const step = dist / 8;
  let lo = 0, hi = step;
  while (far(hi) < dist) { lo = hi; hi += step; if (hi > dist * 3) return s0 - dir * dist; }
  for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2; if (far(mid) < dist) lo = mid; else hi = mid; }
  return s0 - dir * hi;
}

/**
 * @param {any} trip
 * @param {any} at
 * @param {any[]} members
 * @param {number} t
 * @param {number} [hitchN]
 * @param {number} [lane]
 * @returns {{ people: { res: any, x: number, z: number, yaw: number, moving: boolean }[], horses: HorsePlace[], wagons: WagonPlace[] }}
 */
export function trainOf(trip, at, members, t, hitchN = HITCH_N, lane = 0) {
  const team = teamOf(trip);
  const back = at.phase === 'back';
  const dir = back ? -1 : 1;
  const moving = !at.halt && !at.camp;
  const place = (/** @type {number} */ s, side = 0) => {
    const p = laneAt(trip.way, s, dir * lane + side);
    return { x: p.x, z: p.z, yaw: back ? p.yaw + Math.PI : p.yaw };
  };
  const line = (/** @type {number} */ s) => laneAt(trip.way, s, dir * lane);
  const leader = members.find((m) => m.id === trip.leader.id) ?? null;
  const others = members.filter((m) => m !== leader);
  const armed = others.filter((m) => m.cls != null);
  const van = armed.slice(0, Math.ceil(armed.length / 2));
  const rear = others.filter((m) => !van.includes(m));
  const s0 = /** @type {number} */ (at.s);
  /** @type {{ res: any, x: number, z: number, yaw: number, moving: boolean }[]} */
  const people = [];
  van.forEach((m, i) => people.push({ res: m, ...place(s0 + dir * (van.length - i) * WALK_GAP_N, (i % 2 ? 1 : -1) * 22), moving }));
  if (leader) people.push({ res: leader, ...place(s0, 30), moving });
  /** @type {HorsePlace[]} */
  const horses = [];
  /** @type {WagonPlace[]} */
  const wagons = [];
  let s = s0 - dir * LEAD_N;
  const teams = team.wagons + team.packs;
  for (let i = 0; i < teams; i++) {
    const horse = place(s);
    horses.push({ key: `${trip.id}:h${i}`, ...horse, moving });
    if (i < team.wagons) {
      const axle = chordBehind(line, s, dir, hitchN);
      const a = place(axle);
      const yaw = Math.hypot(horse.x - a.x, horse.z - a.z) > 1e-6 ? Math.atan2(horse.x - a.x, horse.z - a.z) : a.yaw;
      // On the way home the wheel distance counts from the far end of the way, so it grows in the direction the
      // wagon faces and the wheels never spin backward.
      wagons.push({ key: `${trip.id}:w${i}`, x: a.x, z: a.z, yaw, moving, tier: cargoOf(trip, t), s: back ? trip.way.len - axle : axle, hitched: true });
      s = chordBehind(line, axle, dir, WAGON_TAIL_N);
    } else s -= dir * WALK_GAP_N;
  }
  rear.forEach((m, i) => people.push({ res: m, ...place(s - dir * (i + 1) * WALK_GAP_N, (i % 2 ? 1 : -1) * 22), moving }));
  return { people, horses, wagons };
}

/**
 * @param {any} trip
 * @param {number} n
 * @param {number} [hitchN]
 * @param {number} [gap]
 */
export function fileSpan(trip, n, hitchN = HITCH_N, gap = WALK_GAP_N) {
  const team = teamOf(trip);
  if (team.wagons + team.packs === 0) return { ahead: 0, behind: Math.max(0, n - 1) * gap };
  const armed = (trip.party ?? []).filter((/** @type {any} */ m) => m.id !== trip.leader?.id && m.cls != null).length;
  const van = Math.ceil(armed / 2);
  const rear = Math.max(0, n - 1 - van);
  return { ahead: van * WALK_GAP_N, behind: LEAD_N + team.wagons * (hitchN + WAGON_TAIL_N) + team.packs * WALK_GAP_N + rear * WALK_GAP_N };
}

export const CAMP_TEAM_ARC_N = 200;

/**
 * @param {any} trip
 * @param {number} cx
 * @param {number} cz
 * @param {number} r
 * @param {number} t
 * @param {{ k0: number, n: number, turn: number } | null} [slots]
 * @returns {{ horses: HorsePlace[], wagons: WagonPlace[] }}
 */
export function campTeam(trip, cx, cz, r, t, slots = null) {
  const team = teamOf(trip);
  const turn = slots ? slots.turn : campTurn(trip);
  /** @type {HorsePlace[]} */
  const horses = [];
  /** @type {WagonPlace[]} */
  const wagons = [];
  const n = team.wagons + team.packs;
  const all = slots ? Math.max(slots.n, n) : n, k0 = slots ? slots.k0 : 0;
  const d = Math.max(r + CAMP_PARK_N, slots ? (all * CAMP_TEAM_ARC_N) / (Math.PI * 2) : 0);
  for (let i = 0; i < n; i++) {
    const a = turn + ((k0 + i) / Math.max(1, all)) * Math.PI * 2;
    const x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d;
    const face = Math.atan2(cx - x, cz - z);
    if (i < team.wagons) {
      wagons.push({ key: `${trip.id}:w${i}`, x, z, yaw: face, moving: false, tier: cargoOf(trip, t), s: 0, hitched: false });
      horses.push({ key: `${trip.id}:h${i}`, x: x + Math.cos(face) * CAMP_HORSE_SIDE_N, z: z - Math.sin(face) * CAMP_HORSE_SIDE_N, yaw: face, moving: false });
    } else horses.push({ key: `${trip.id}:h${i}`, x, z, yaw: face + Math.PI / 2, moving: false });
  }
  return { horses, wagons };
}

/** @param {any} trip */
export const campTurn = (trip) => (lwSeed(textSeed(trip.id), 0x7061726b) % 628) / 100;

export const CART_FOOT_N = Object.freeze({
  back: -MEASURED.cart.bottomBack[1] * NATIVE_PER_M, front: MEASURED.cart.frontZ * NATIVE_PER_M, half: MEASURED.cart.sideX * NATIVE_PER_M,
});
export const HORSE_FOOT_N = Object.freeze({ half: (HORSE_BOX_SIZE[2] / 2) * NATIVE_PER_M, side: (HORSE_BOX_SIZE[0] / 2) * NATIVE_PER_M });
export const BODY_CLEAR_N = 14;

/**
 * @param {number} x
 * @param {number} z
 * @param {{ wagons: { x: number, z: number, yaw: number }[], horses: { x: number, z: number, yaw: number }[] }} team
 * @param {{ back: number, front: number, half: number }} [foot]
 */
export function clearOfTeam(x, z, team, foot = CART_FOOT_N) {
  const boxes = [
    ...team.wagons.map((w) => ({ c: w, back: foot.back, front: foot.front, half: foot.half })),
    ...team.horses.map((h) => ({ c: h, back: HORSE_FOOT_N.half, front: HORSE_FOOT_N.half, half: HORSE_FOOT_N.side })),
  ];
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const b of boxes) {
      const fx = Math.sin(b.c.yaw), fz = Math.cos(b.c.yaw);
      const dx = x - b.c.x, dz = z - b.c.z;
      const f = dx * fx + dz * fz, r = dx * fz - dz * fx;
      const back = b.back + BODY_CLEAR_N, front = b.front + BODY_CLEAR_N, half = b.half + BODY_CLEAR_N;
      if (f <= -back || f >= front || Math.abs(r) >= half) continue;
      const out = [[front - f, 'f'], [f + back, 'b'], [half - Math.abs(r), 'r']].sort((p, q) => /** @type {number} */ (p[0]) - /** @type {number} */ (q[0]))[0][1];
      let nf = f, nr = r;
      if (out === 'f') nf = front; else if (out === 'b') nf = -back; else nr = (r < 0 ? -1 : 1) * half;
      x = b.c.x + nf * fx + nr * fz; z = b.c.z + nf * fz - nr * fx;
      moved = true;
    }
    if (!moved) break;
  }
  return { x, z };
}

/**
 * @param {number} s
 * @param {number} wheelRadius
 */
export const wheelAngleAt = (s, wheelRadius) => wrapWheelAngle(wheelRotationDegrees(s / NATIVE_PER_M, wheelRadius));
