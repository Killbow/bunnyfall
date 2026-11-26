// @ts-check

import { trs } from '../world/mat4.js';
import { transformedAabb } from '../render/frustum.js';
import { decorPieceOf, decorPrice, decorMountFrame, decorIsFigure, DECOR_SCALE_MIN, DECOR_SCALE_MAX, DECOR_MOUNT_LIFT } from '../net/decorLaw.js';

export const DECOR_TURN_STEP = 15;
export const DECOR_TURN_FINE = 1;
export const DECOR_RAISE_STEP = 0.05;
export const DECOR_RAISE_FINE = 0.01;
export const DECOR_RAISE_MAX = 3;
export const DECOR_RAISE_MIN = -1;
export const DECOR_SCALE_STEP = 1.1;
export const DECOR_GRID = 0.25;
export const DECOR_NUDGE_STEP = 0.1;
export const DECOR_NUDGE_FINE = 0.02;
export const DECOR_NUDGE_MAX = 4;
export const DECOR_HANG_NY = 0.5;
export const DECOR_WALL_GAP = 0.02;
export const DECOR_WALL_CLIP = 0.05;
export function decorWallOffset(reach, { door = false } = {}) {
  if (door || !(reach > 0)) return reach + DECOR_WALL_GAP;
  return reach - Math.min(DECOR_WALL_CLIP, reach * 0.5);
}

export function wrapTurn(deg) {
  const d = ((((deg + 180) % 360) + 360) % 360) - 180;
  return d === -180 ? 180 : d;
}
const round = (v, places) => { const k = 10 ** places; return Math.round(v * k) / k; };
const snapTo = (v, step) => round(Math.round(v / step) * step, 3);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const DEG = 180 / Math.PI;

export const decorEntrySized = (entry) => !decorIsFigure(entry);

export function createDecorPlacer(entry, { radius = null, box = null, from = null, free = false, flat = null } = {}) {
  let measured = radius;
  const mount = !!entry.mount;
  const s = { yaw: from ? wrapTurn((mount ? from.rot?.[2] : from.rot?.[0]) ?? 0) : 0, raise: 0, scale: from?.scale ?? 1, snap: false, nudge: [0, 0] };
  const figure = !decorEntrySized(entry);
  if (figure) s.scale = 1;

  // A model's origin is not its base, so its turned and scaled box sets how high the origin sits. The record
  // stores the origin, so a stand-in rebuilt about another origin moves the pieces placed with it.
  function lift() {
    if (entry.model == null || !box) return 0;
    const b = transformedAabb(box, trs(0, 0, 0, 0, s.yaw, 0, s.scale, s.scale, s.scale));
    return -b[1];
  }
  function drop() {
    if (entry.model == null || !box) return 0;
    const b = transformedAabb(box, trs(0, 0, 0, 0, s.yaw, 0, s.scale, s.scale, s.scale));
    return -b[4];
  }

  function reach(n) {
    if (entry.model == null) return flat && flat.w > 0 ? flat.w * s.scale / 2 : 0;
    if (!box) return 0;
    const b = transformedAabb(box, trs(0, 0, 0, 0, s.yaw, 0, s.scale, s.scale, s.scale));
    return Math.max(0, Math.max(-n[0] * b[0], -n[0] * b[3]) + Math.max(-n[1] * b[2], -n[1] * b[5]));
  }

  function mountAt(hit, origin, id, normal, camYaw, paid) {
    const len = normal ? Math.hypot(normal[0], normal[1], normal[2]) : 0;
    if (!(len > 0)) return null;
    const n = [normal[0] / len, normal[1] / len, normal[2] / len];
    const level = Math.hypot(n[0], n[2]) > 1e-3;
    const heading = level ? Math.atan2(n[0], n[2]) : (Number.isFinite(camYaw) ? camYaw : 0) + Math.PI;
    const rot = [wrapTurn(round(heading * DEG, 1)), round(Math.asin(Math.max(-1, Math.min(1, n[1]))) * DEG, 1), s.yaw];
    const { right, up } = decorMountFrame([rot[0], rot[1], 0]);
    let p = [hit[0] - origin[0], hit[1] - origin[1], hit[2] - origin[2]];
    if (s.snap) {
      const a = snapTo(dot(p, right), DECOR_GRID);
      const b = snapTo(dot(p, up), DECOR_GRID);
      const c = dot(p, n);
      p = [0, 1, 2].map((i) => right[i] * a + up[i] * b + n[i] * c);
    }
    p = [0, 1, 2].map((i) => p[i] + up[i] * s.raise + n[i] * DECOR_MOUNT_LIFT);
    return decorPieceOf({
      id, model: null, flat: [entry.flat[0], entry.flat[1]], item: entry.item ?? null, pos: p, rot, scale: s.scale,
      light: entry.light ? { ...entry.light, color: [...entry.light.color] } : null, storage: false, paid,
    });
  }

  return {
    entry,
    state: () => ({ ...s, nudge: [...s.nudge] }),
    nudge(dir, fine = false, room = Infinity) {
      const step = s.snap ? DECOR_GRID : fine ? DECOR_NUDGE_FINE : DECOR_NUDGE_STEP;
      const d = Math.max(0, Math.min(step, room));
      s.nudge = [0, 1].map((i) => round(Math.max(-DECOR_NUDGE_MAX, Math.min(DECOR_NUDGE_MAX, s.nudge[i] + dir[i] * d)), 3));
      return d;
    },
    reachToward(dir) { return reach([-dir[0], -dir[1]]); },
    turn(deg) { s.yaw = wrapTurn(round(s.yaw + deg, 1)); },
    raise(d) { s.raise = round(Math.min(DECOR_RAISE_MAX, Math.max(DECOR_RAISE_MIN, s.raise + d)), 3); },
    rescale(up) {
      if (figure) return;
      const next = up ? s.scale * DECOR_SCALE_STEP : s.scale / DECOR_SCALE_STEP;
      s.scale = round(Math.min(DECOR_SCALE_MAX, Math.max(DECOR_SCALE_MIN, next)), 3);
    },
    toggleSnap() { s.snap = !s.snap; return s.snap; },
    price() {
      if (free) return 0;
      return measured != null && measured > 0 ? decorPrice(measured, s.scale) : null;
    },
    setRadius(r) { if (r > 0) measured = r; },
    /**
     * @param {number[]} hit
     * @param {number[]} origin
     * @param {string} id
     * @param {number[]|null} [normal]
     * @param {number} [camYaw]
     */
    pieceAt(hit, origin, id, normal = null, camYaw = 0) {
      const paid = this.price();
      if (paid == null || !hit || !origin) return null;
      if (mount) return mountAt(hit, origin, id, normal, camYaw, paid);
      const nl = normal ? Math.hypot(normal[0], normal[1], normal[2]) : 0;
      // A face that looks down is hung from, the model's top at the face, and a hung piece is only lowered, never
      // raised into the face. A flat cannot hang.
      const hang = nl > 0 && normal[1] / nl < -DECOR_HANG_NY;
      if (hang && entry.model == null) return null;
      if (hang && s.raise > 0) s.raise = 0;
      const up = hang ? drop() + s.raise : lift() + s.raise;
      let x = hit[0] - origin[0];
      let z = hit[2] - origin[2];
      const hl = nl > 0 ? Math.hypot(normal[0], normal[2]) : 0;
      const wall = !hang && hl > 0 && Math.abs(normal[1] / nl) < DECOR_HANG_NY;
      if (wall) {
        const n = [normal[0] / hl, normal[2] / hl];
        if (s.snap) {
          const a = snapTo(x * -n[1] + z * n[0], DECOR_GRID);
          const c = x * n[0] + z * n[1];
          x = -n[1] * a + n[0] * c;
          z = n[0] * a + n[1] * c;
        }
        const out = decorWallOffset(reach(n), { door: entry.kind === 'door' });
        x = round(x + n[0] * out, 3);
        z = round(z + n[1] * out, 3);
      } else if (s.snap) { x = snapTo(x, DECOR_GRID); z = snapTo(z, DECOR_GRID); }
      x = round(x + s.nudge[0], 3);
      z = round(z + s.nudge[1], 3);
      return decorPieceOf({
        id, model: entry.model ?? null, flat: entry.flat ? [entry.flat[0], entry.flat[1]] : null, item: entry.item ?? null,
        pos: [x, hit[1] - origin[1] + up, z], rot: [s.yaw, 0, 0], scale: s.scale,
        light: entry.light ? { ...entry.light, color: [...entry.light.color] } : null,
        storage: !!entry.storage, paid, ...(entry.station ? { station: entry.station } : {}),
      });
    },
  };
}
