// @ts-check
import { berthPose, berthHull, haulBrake } from './navalBoarding.js';
import { CSA_BRAKE_MAX } from './comeSailAway.js';

/**
 * @param {{ csa: () => any, myBoat: () => any, boatPose: (boat: any) => { position: number[], rotation: number[], velocity: number[] },
 *   yawOfRot: (rot: number[]) => number }} deps
 */
export function createNavalHaul({ csa, myBoat, boatPose, yawOfRot }) {
  const anchorOf = (boat) => { const p = boatPose(boat); return { pos: p.position, yaw: yawOfRot(p.rotation), hull: boat.hull }; };
  const berth = (boat, at, hull, lie = null) => { const a = anchorOf(boat); return berthPose(berthHull(a.pos, a.yaw, a.hull), berthHull(at.pos, at.yaw, hull), lie); };
  const hauling = (b) => !!b && b.phase === 'grapple' && !!b.boat && b.boat === myBoat();
  return {
    berth: (boat, at, hull) => berth(boat, at, hull),
    start(b, to) {
      b.lie = to.side ? { side: to.side, same: to.same } : null;
      if (!b.boat || b.boat !== myBoat()) return;
      const v = boatPose(b.boat).velocity;
      b.brake = haulBrake(Math.hypot(v[0], v[2]), CSA_BRAKE_MAX);
      if (csa()?.state?.sailPosition > 0) csa().LowerSails?.();
    },
    step(b, hull, dt) {
      if (!b.boat?.GameObject) return b.haul(b.to, null, dt);
      return b.haul(berth(b.boat, b.from, hull, b.lie), anchorOf(b.boat), dt);
    },
    hauling,
    brake: (b) => (hauling(b) ? b.brake ?? 0 : 0),
  };
}
