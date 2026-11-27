// @ts-check
// A placed door is saved as an ordinary piece (a model id and a place), so the account service treats it as one.

import { DOOR_MODEL_BASE_ID, DOOR_MODEL_COUNT } from '../world/interiorLayout.js';
import { DECOR_SCALE_MIN, DECOR_SCALE_MAX } from '../net/decorLaw.js';

export const DOORWAY_WIDTH_MIN = 0.6;
export const DOORWAY_WIDTH_MAX = 2.4;
export const DOORWAY_HEIGHT_MIN = 1.8;
export const DOORWAY_HEIGHT_MAX = 4;
export const DOORWAY_DEPTH_MAX = 1.2;
export const DOORWAY_OPENS = 0.3;
export const DOORWAY_STEP = 0.1;
export const DOORWAY_WAIST = 1;
export const DOORWAY_SAME = 0.5;
export const DOORWAY_NEAR_DOOR = 1.5;
export const DOORWAY_AIM = 1.2;
export const DOORWAY_LINTEL_SIDE = 0.05;
export const DOORWAY_RAYS_A_STEP = 400;
export const DOOR_FIT_GAP = 0.02;
export const DOOR_FILL_SLACK = 0.2;
export const DOORWAY_MARK_HIGH = 2.4;

export const isDoorModel = (model) => Number.isSafeInteger(model) && model >= DOOR_MODEL_BASE_ID && model < DOOR_MODEL_BASE_ID + DOOR_MODEL_COUNT;
export const decorIsDoor = (piece) => !!piece && !piece.item && isDoorModel(piece.model);

const DOWN = Object.freeze([0, -1, 0]);
const UP = Object.freeze([0, 1, 0]);

/**
 * @param {{ raycastHit: (o: number[], d: readonly number[], max: number) => ({ dist: number }|null),
 *   links: { a: number[], b: number[], dir: number[] }[] | null }} o
 */
export function createDecorDoorways({ raycastHit, links }) {
  const all = Array.isArray(links) ? links : [];
  const cast = (o, d, max) => {
    let h = null;
    try { h = raycastHit(o, d, max); } catch { h = null; }
    const dist = h?.dist;
    return typeof dist === 'number' && dist >= 0 ? dist : Infinity;
  };
  const found = [];
  let next = 0;
  /** @type {any[]|null} */
  let list = null;

  const same = (d, c) => d.normal[0] === c.normal[0] && d.normal[2] === c.normal[2]
    && Math.abs((c.center[0] - d.center[0]) * c.normal[2] + (c.center[2] - d.center[2]) * c.normal[0]) < DOORWAY_SAME
    && Math.abs((c.center[0] - d.center[0]) * c.normal[0] + (c.center[2] - d.center[2]) * c.normal[2]) < DOORWAY_DEPTH_MAX / 2
    && Math.abs(c.center[1] - d.center[1]) < DOORWAY_SAME;

  function probe(link) {
    const { a, b, dir } = link;
    const p = [dir[2], 0, dir[0]];
    const h = Math.max(a[1], b[1]) + DOORWAY_WAIST;
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    let rays = 0;
    const along = (u, from = a, sign = 1, max = len) => { rays++; return cast([from[0] + p[0] * u, h, from[2] + p[2] * u], [dir[0] * sign, 0, dir[2] * sign], max); };
    const reach = DOORWAY_WIDTH_MAX / 2 + DOORWAY_STEP;
    if (!Number.isFinite(along(reach)) && !Number.isFinite(along(-reach))) return rays;
    if (Number.isFinite(along(0))) return rays;
    const jamb = (side) => {
      let open = 0;
      for (let u = DOORWAY_STEP; u <= DOORWAY_WIDTH_MAX + 1e-9; u += DOORWAY_STEP) {
        const t = along(side * u);
        if (!Number.isFinite(t)) { open = u; continue; }
        let lo = open, hi = u, at = t;
        for (let i = 0; i < 4; i++) {
          const mid = (lo + hi) / 2;
          const tm = along(side * mid);
          if (Number.isFinite(tm)) { hi = mid; at = tm; } else lo = mid;
        }
        return { u: side * hi, t: at };
      }
      return null;
    };
    const r = jamb(1);
    if (!r) return rays;
    const l = jamb(-1);
    if (!l) return rays;
    const width = r.u - l.u;
    if (width < DOORWAY_WIDTH_MIN || width > DOORWAY_WIDTH_MAX) return rays;
    if (Math.abs(r.t - l.t) > DOORWAY_DEPTH_MAX / 2) return rays;
    const beyond = DOORWAY_OPENS + DOORWAY_STEP;
    const tr = along(r.u + beyond), tl = along(l.u - beyond);
    const cornered = (j, side) => {
      rays++;
      const back = j.t - DOORWAY_STEP;
      return cast([a[0] + p[0] * j.u + dir[0] * back, h, a[2] + p[2] * j.u + dir[2] * back], [p[0] * side, 0, p[2] * side], beyond) < beyond;
    };
    // The wall must go on past both jambs at one depth, or meet a corner; a gap between two objects is no doorway.
    const goesOn = (t, j, side) => Math.abs(t - j.t) <= DOORWAY_STEP * 2 || cornered(j, side);
    if (!goesOn(tr, r, 1) || !goesOn(tl, l, -1)) return rays;
    const near = Math.min(r.t, l.t);
    const past = near + DOORWAY_DEPTH_MAX + DOORWAY_STEP;
    const back = along(r.u + beyond, [a[0] + dir[0] * past, a[1], a[2] + dir[2] * past], -1, past - near);
    const far = Number.isFinite(back) ? past - back : near;
    if (far - near > DOORWAY_DEPTH_MAX || far < near - DOORWAY_STEP) return rays;
    const tc = (near + Math.max(near, far)) / 2;
    const uc = (r.u + l.u) / 2;
    const cx = a[0] + p[0] * uc + dir[0] * tc;
    const cz = a[2] + p[2] * uc + dir[2] * tc;
    rays++;
    const drop = cast([cx, h, cz], DOWN, h - Math.min(a[1], b[1]) + 0.5);
    if (!Number.isFinite(drop)) return rays;
    const floor = h - drop;
    rays += 4;
    // Each side measures the lintel from its own floor, because a step in the doorway would put one ray inside it.
    const lintel = Math.min(...[-1, 1].map((k) => {
      const sx = cx + dir[0] * k * DOORWAY_LINTEL_SIDE, sz = cz + dir[2] * k * DOORWAY_LINTEL_SIDE;
      const sd = cast([sx, h, sz], DOWN, h - Math.min(a[1], b[1]) + 0.5);
      const sideFloor = Number.isFinite(sd) ? h - sd : floor;
      const u = cast([sx, sideFloor + 0.05, sz], UP, DOORWAY_HEIGHT_MAX);
      return Number.isFinite(u) ? sideFloor + 0.05 + u : Infinity;
    }));
    const height = Number.isFinite(lintel) ? lintel - floor : DOORWAY_HEIGHT_MAX;
    if (height < DOORWAY_HEIGHT_MIN) return rays;
    const c = { center: [cx, floor, cz], normal: [dir[0], 0, dir[2]], width, height };
    if (!found.some((d) => same(d, c))) found.push(c);
    return rays;
  }

  function step(budget = DOORWAY_RAYS_A_STEP) {
    if (list) return true;
    let spent = 0;
    while (spent < budget && next < all.length) spent += probe(all[next++]);
    if (next >= all.length) {
      found.sort((x, y) => x.center[1] - y.center[1] || x.center[0] - y.center[0] || x.center[2] - y.center[2]);
      list = found.map((d, i) => Object.freeze({ id: i + 1, center: Object.freeze(d.center), normal: Object.freeze(d.normal), width: d.width, height: d.height }));
    }
    return !!list;
  }

  return {
    step,
    done: () => !!list,
    doorways: () => list,
    progress: () => (list ? 1 : next / Math.max(1, all.length)),
  };
}

export function decorDoorwaysFree(doorways, doors) {
  const at = Array.isArray(doors) ? doors.filter((d) => Array.isArray(d) && d.length >= 3) : [];
  return (doorways ?? []).filter((w) => !at.some((d) => Math.hypot(d[0] - w.center[0], d[2] - w.center[2]) < DOORWAY_NEAR_DOOR
    && Math.abs(d[1] - w.center[1]) < DOORWAY_HEIGHT_MIN));
}

export function decorDoorwayAimed(doorways, eye, dir, reach, seen = null) {
  let best = null;
  let bestD = Infinity;
  for (const w of doorways ?? []) {
    const m = [w.center[0], w.center[1] + Math.min(w.height, DOORWAY_MARK_HIGH) / 2, w.center[2]];
    const v = [m[0] - eye[0], m[1] - eye[1], m[2] - eye[2]];
    const t = v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2];
    if (!(t > 0) || t > reach) continue;
    const off = Math.hypot(v[0] - dir[0] * t, v[1] - dir[1] * t, v[2] - dir[2] * t);
    if (off > Math.max(DOORWAY_AIM, w.width / 2) || off >= bestD) continue;
    if (seen && !seen(m, Math.hypot(v[0], v[1], v[2]))) continue;
    bestD = off;
    best = w;
  }
  return best;
}

export function decorDoorFit(doorway, box, flip = false) {
  if (!doorway || !Array.isArray(box) || box.length < 6) return null;
  const [x0, y0, z0, x1, y1, z1] = box;
  const wx = x1 - x0, wz = z1 - z0, high = y1 - y0;
  if (!(high > 0) || !(Math.max(wx, wz) > 0)) return null;
  const n = doorway.normal;
  const alongX = wx >= wz;
  let yaw = alongX ? Math.atan2(n[0], n[2]) : Math.atan2(-n[2], n[0]);
  if (flip) yaw += Math.PI;
  const wide = alongX ? wx : wz;
  const fit = Math.min(doorway.width / wide, (doorway.height - DOOR_FIT_GAP) / high);
  const scale = Math.min(DECOR_SCALE_MAX, Math.max(DECOR_SCALE_MIN, fit));
  const mx = ((x0 + x1) / 2) * scale, mz = ((z0 + z1) / 2) * scale;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  let deg = (yaw * 180) / Math.PI;
  while (deg > 180) deg -= 360;
  while (deg <= -180) deg += 360;
  return {
    pos: [doorway.center[0] - (c * mx + s * mz), doorway.center[1] - y0 * scale, doorway.center[2] - (-s * mx + c * mz)],
    // Adding 0 turns -0 into 0.
    yaw: Math.round(deg * 10) / 10 + 0,
    scale,
    fills: doorway.width - wide * scale <= DOOR_FILL_SLACK,
  };
}

export function decorDoorwayQuad(w) {
  const high = Math.min(w.height, DOORWAY_MARK_HIGH);
  return {
    pos: [w.center[0], w.center[1] + high / 2, w.center[2]],
    size: high,
    stretch: w.width / high,
    right: [w.normal[2], 0, w.normal[0]],
    up: [0, 1, 0],
  };
}
