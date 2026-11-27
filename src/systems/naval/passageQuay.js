// @ts-check
import { dockFor, madeFast, warpStep } from './quays.js';
import { alongside, createWaterGrid, footprintClear } from './shipLife.js';
import { charterRecord } from './passage.js';
import { wrapAngle } from '../../world/mat4.js';
import { hullBuild } from './navalShips.js';
import { HULL_LEAD_MIN_MPS } from './seaClearance.js';

export const BRING_IN_M = 700;
export const TOW_WAY = 4;
export const TOW_SLOW = 1.5;
export const TOW_EASE_M = 60;
export const TOW_TURN = 14 * (Math.PI / 180);
export const TOW_REACH_M = 10;
// Keep inside DOCK_REACH_M in quays.js, so the dock warp takes over from the last point of the way.
export const TOW_LEAD_M = 20;
export const TOW_FOUL_M = 25;
export const TOW_FOUL_S = 40;
export const TOW_WAIT_S = 120;
// The path search is bounded, so a harbor with no way to a berth is asked again only after this delay.
export const TOW_RETRY_S = 10;
export const TOW_CLEAR_M = 3;
export const TOW_SWING = 10 * (Math.PI / 180);
const RING = Array.from({ length: 8 }, (_, k) => [Math.sin((k / 8) * 2 * Math.PI), Math.cos((k / 8) * 2 * Math.PI)]);

export function beamWater(isWater, hull) {
  const r = hullBuild(hull).halfWidth + TOW_CLEAR_M;
  return (x, z, h) => !!isWater(x, z, h) && RING.every(([sx, sz]) => isWater(x + sx * r, z + sz * r, h));
}

/** @param {any} host */
export function createPassageQuay(host) {
  /** @type {{ boat: any, key: string, i: number, path: number[][], idx: number, foul: number, held: number, fast: boolean, gaveUp?: boolean } | null} */
  let tow = null;
  const refused = new Set(), noWay = new Map();

  function berthFor(boat, rec, at) {
    for (const h of host.harbours.values()) {
      const hb = h.harbour;
      if (!hb?.berths?.length || h.name !== rec.to.name || refused.has(h.key)) continue;
      if (host.now() - (noWay.get(h.key) ?? -Infinity) < TOW_RETRY_S) continue;
      if (Math.hypot(hb.mouth[0] - at[0], hb.mouth[1] - at[2]) > BRING_IN_M) continue;
      const i = hb.berths.findIndex((_, k) => host.dockFree(h.key, k, boat));
      if (i >= 0) return { h, i };
    }
    return null;
  }

  function begin(boat) {
    const rec = charterRecord(boat?.charter);
    if (!host.enabled() || !rec || !boat?.GameObject || tow?.boat === boat) return false;
    const at = boat.GameObject.position;
    const found = berthFor(boat, rec, at);
    if (!found) return false;
    const { h, i } = found, b = h.harbour.berths[i], grid = createWaterGrid({ isWater: beamWater(host.isWater, boat.hull), hull: boat.hull });
    const side = alongside(b, boat.hull, h.harbour.hull), end = [side[0] + b.normal[0] * TOW_LEAD_M, side[1] + b.normal[1] * TOW_LEAD_M];
    const a = grid.path([at[0], at[2]], b.approach), c = a ? grid.path(b.approach, end) : null;
    if (!a || !c) { noWay.set(h.key, host.now()); return false; }
    tow = { boat, key: h.key, i, path: [...a, ...c.slice(1)].map((q) => [q[0], q[1]]), idx: 0, foul: 0, held: 0, fast: false };
    host.putOff(h.key, i);
    return true;
  }

  function step(boat, dt) {
    if (!tow || tow.boat !== boat || !host.enabled()) return null;
    const pose = host.boatPose(boat), p = pose.position, yaw = host.yawOf(pose.rotation);
    const h = host.harbours.get(tow.key), b = h?.harbour?.berths?.[tow.i];
    if (!b) { tow = null; return null; }
    const dock = dockFor({ pos: p, yaw, hull: boat.hull }, [{ key: tow.key, index: tow.i, berth: b, hull: h.harbour.hull, name: h.name ?? null, free: true }]);
    if (dock && (tow.fast || tow.idx >= tow.path.length - 1)) {
      if (madeFast({ pos: p, yaw }, dock)) tow.fast = true;
      const st = warpStep([p[0], p[2]], yaw, dock, dt);
      return { pos: st.pos, yaw: st.yaw };
    }
    if (tow.fast) { tow = null; return null; }
    while (tow.idx < tow.path.length - 1 && Math.hypot(tow.path[tow.idx][0] - p[0], tow.path[tow.idx][1] - p[2]) <= TOW_REACH_M) tow.idx++;
    const q = tow.path[tow.idx], dx = q[0] - p[0], dz = q[1] - p[2], d = Math.hypot(dx, dz);
    const there = tow.idx >= tow.path.length - 1 && d <= TOW_REACH_M;
    const line = Math.abs(wrapAngle(b.yaw - yaw)) <= Math.PI / 2 ? b.yaw : wrapAngle(b.yaw + Math.PI);
    const want = there ? line : d > 1e-6 ? Math.atan2(dx, dz) : yaw;
    const turn = Math.max(-TOW_TURN * dt, Math.min(TOW_TURN * dt, wrapAngle(want - yaw)));
    const head = wrapAngle(yaw + turn), fx = Math.sin(head), fz = Math.cos(head);
    const bow = hullBuild(boat.hull).bowZ;
    const held = (y, clearing = false) => {
      if (!clearing) tow.foul += dt;
      tow.held += dt;
      if (tow.foul >= TOW_FOUL_S || tow.held >= TOW_WAIT_S) { refused.add(tow.key); tow = { ...tow, gaveUp: true }; return null; }
      return { pos: [p[0], p[2]], yaw: y };
    };
    const hull = host.ahead([p[0] + fx * bow, p[1], p[2] + fz * bow], fx, fz, TOW_FOUL_M);
    // A hull under way is clearing her path, so it runs only the total wait, never the foul clock.
    if (hull.d < TOW_FOUL_M) return held(head, hull.way >= HULL_LEAD_MIN_MPS);
    const left = Math.hypot(b.pos[0] - p[0], b.pos[1] - p[2]);
    const way = left > TOW_EASE_M ? TOW_WAY : TOW_SLOW + (TOW_WAY - TOW_SLOW) * (left / TOW_EASE_M);
    const s = there ? Math.min(d, TOW_SLOW * dt) : Math.abs(wrapAngle(want - head)) <= TOW_SWING ? Math.min(d, way * dt) : 0;
    const k = d > 1e-6 ? s / d : 0;
    const next = { pos: [p[0] + dx * k, p[2] + dz * k], yaw: head };
    const fits = (q, y) => footprintClear(q, y, boat.hull, host.isWater);
    // A step that would lay her over land is held, unless she already lies over land.
    if (!fits(next.pos, head) && fits([p[0], p[2]], yaw)) return held(fits([p[0], p[2]], head) ? head : yaw);
    tow.foul = 0; tow.held = 0;
    return next;
  }

  function state(boat) {
    if (!tow || tow.boat !== boat) return null;
    if (tow.gaveUp) { tow = null; return 'foul'; }
    return tow.fast ? 'fast' : 'in';
  }
  // The floating origin moved, so the planned path moves with it.
  function offset(o) { for (const q of tow?.path ?? []) { q[0] += o[0]; q[1] += o[2]; } }
  function forget(boat = null) {
    if (boat != null && tow?.boat !== boat && !(tow?.boat?.uid != null && tow.boat.uid === boat)) return;
    tow = null; refused.clear(); noWay.clear();
  }
  return { begin, step, state, offset, forget };
}
