// @ts-check
// Tows a booked ship off her berth before the journey takes the helm. Her crew warps her to the berth's approach
// without turning her, then turns her toward open water (passageQuay.js in reverse).
//   host = { harbours() -> [{ key, name, harbour }], isWater(x, z, hull) }
import { alongside, createWaterGrid, footprintClear } from '../../systems/naval/shipLife.js';
import { quatOfYaw } from '../../systems/naval/navalAI.js';
import { quatRotate } from '../../world/quat.js';
import { wrapAngle } from '../../world/mat4.js';
import { beamWater, TOW_WAY, TOW_SLOW, TOW_EASE_M, TOW_TURN, TOW_LEAD_M } from './passageQuay.js';

/** @param {any} host */
export function createPassageCastOff(host) {
  /** @type {{ boat: any, key: string, i: number, path: number[][], idx: number } | null} */
  let tow = null;
  const berthOf = (t) => host.harbours().find((h) => h.key === t.key)?.harbour?.berths?.[t.i] ?? null;

  /** @returns {boolean} */
  function begin(boat) {
    tow = null;
    const p = boat?.GameObject?.position;
    if (!p) return false;
    for (const h of host.harbours()) {
      for (const [i, b] of (h.harbour?.berths ?? []).entries()) {
        const at = alongside(b, boat.hull, h.harbour.hull);
        if (Math.hypot(at[0] - p[0], at[1] - p[2]) > 1) continue;
        const lead = [at[0] + b.normal[0] * TOW_LEAD_M, at[1] + b.normal[1] * TOW_LEAD_M];
        const way = createWaterGrid({ isWater: beamWater(host.isWater, boat.hull), hull: boat.hull }).path(lead, b.approach);
        if (!way) return false;
        // Store points relative to the berth: the harbour book moves its berths with the floating origin.
        tow = { boat, key: h.key, i, path: [at, ...way].map((q) => [q[0] - b.pos[0], q[1] - b.pos[1]]), idx: 1 };
        return true;
      }
    }
    return false;
  }

  /** @returns {{ pos: number[], rotation: number[] } | null} */
  function step(boat, dt) {
    if (!tow || tow.boat !== boat) return null;
    const b = berthOf(tow);
    if (!b) { tow = null; return null; }
    const p = boat.GameObject.position, f = quatRotate(boat.GameObject.rotation, [0, 0, 1]), yaw = Math.atan2(f[0], f[2]);
    if (tow.idx < tow.path.length) {
      const dx = b.pos[0] + tow.path[tow.idx][0] - p[0], dz = b.pos[1] + tow.path[tow.idx][1] - p[2], d = Math.hypot(dx, dz);
      const left = Math.hypot(b.pos[0] - p[0], b.pos[1] - p[2]);
      const s = Math.min(d, (left > TOW_EASE_M ? TOW_WAY : TOW_SLOW + (TOW_WAY - TOW_SLOW) * (left / TOW_EASE_M)) * dt);
      if (s >= d) tow.idx++;
      const k = d > 1e-6 ? s / d : 0;
      return { pos: [p[0] + dx * k, p[2] + dz * k], rotation: quatOfYaw(yaw) };
    }
    const turn = Math.max(-TOW_TURN * dt, Math.min(TOW_TURN * dt, wrapAngle(Math.atan2(b.normal[0], b.normal[1]) - yaw)));
    const head = wrapAngle(yaw + turn);
    if (Math.abs(turn) < 1e-4 || !footprintClear([p[0], p[2]], head, boat.hull, host.isWater)) { tow = null; return null; }
    return { pos: [p[0], p[2]], rotation: quatOfYaw(head) };
  }

  function forget(boat = null) { if (boat == null || tow?.boat === boat) tow = null; }
  return { begin, step, forget };
}
