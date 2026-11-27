// @ts-check
import { segmentBoxEntry } from './navalBallistics.js';
import { SHIP_STATES } from './navalDamage.js';

export const HULL_CLEAR_M = 6;
export const HULL_LEAD_S = 8;
export const HULL_LEAD_STEP_S = 2;
export const HULL_LEAD_MIN_MPS = 0.5;

export function ledHulls(box, v) {
  if (!box) return [];
  const sp = Math.hypot(v?.[0] ?? 0, v?.[2] ?? 0);
  if (!(sp >= HULL_LEAD_MIN_MPS)) return [box];
  const out = [box];
  for (let t = HULL_LEAD_STEP_S; t <= HULL_LEAD_S + 1e-9; t += HULL_LEAD_STEP_S) out.push({ ...box, c: [box.c[0] + v[0] * t, box.c[1], box.c[2] + v[2] * t] });
  return out;
}

/**
 * @param {number[]} p
 * @param {number} dx
 * @param {number} dz
 * @param {number} far
 * @param {Iterable<{ c: number[], ax: number[], ay: number[], az: number[], h: number[] } | null>} boxes
 */
export function hullAlong(p, dx, dz, far, boxes, clear = HULL_CLEAR_M) {
  let best = Infinity;
  for (const box of boxes) {
    if (!box) continue;
    const r = Math.hypot(box.h[0], box.h[1], box.h[2]) + clear;
    const ox = box.c[0] - p[0], oz = box.c[2] - p[2];
    const along = Math.max(0, Math.min(far, ox * dx + oz * dz));
    if (Math.hypot(ox - dx * along, oz - dz * along) > r) continue;
    const a = [p[0], box.c[1], p[2]], b = [p[0] + dx * far, box.c[1], p[2] + dz * far];
    let hit = segmentBoxEntry(a, b, box, clear);
    // A look starting inside the clearance stops at the hull itself, and one leading away from it is not stopped.
    if (hit && hit.t === 0) hit = segmentBoxEntry(a, b, box, 0);
    if (!hit || hit.t === 0) continue;
    best = Math.min(best, hit.t * far);
  }
  return best;
}

/** @param {{ sea: Map<any, any>, hullBox: (boat: any) => any, velocity: (ship: any) => number[], peerBoats: () => any[], myBoats: () => any[], myBoat: () => any, enabled: () => boolean }} host */
export function createSeaHulls(host) {
  function hulls() {
    if (!host.enabled()) return [];
    const out = [];
    for (const e of host.sea.values()) if (e.boat && e.ship.damage.state !== SHIP_STATES.sunk) out.push([host.hullBox(e.boat), host.velocity(e.ship)]);
    for (const p of host.peerBoats()) if (p?.boat) out.push([host.hullBox(p.boat), p.vel]);
    const mine = host.myBoat();
    for (const b of host.myBoats()) if (b !== mine) out.push([host.hullBox(b), null]);
    return out.filter(([box]) => box);
  }
  function ahead(p, dx, dz, far) {
    let d = Infinity, way = 0;
    for (const [box, v] of hulls()) {
      const t = hullAlong(p, dx, dz, far, ledHulls(box, v));
      if (t < d) { d = t; way = Math.hypot(v?.[0] ?? 0, v?.[2] ?? 0); }
    }
    return { d, way };
  }
  return {
    boxes: () => hulls().map(([box]) => box),
    along: (p, dx, dz, far) => hullAlong(p, dx, dz, far, hulls().flatMap(([box, v]) => (v ? ledHulls(box, v) : [box]))),
    ahead,
  };
}

