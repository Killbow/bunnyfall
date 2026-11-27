// @ts-check

import { V_FORWARD, TELEPORT_DISTANCE } from './horseCartLaw.js';

/** @typedef {{ wx: number, wz: number, heading: number[] }} DeploymentPose */

/** @param {{ now: () => number, log: { warn?: (line: string) => void }, playerWorld: () => number[], ratio: () => number }} deps */
export function createTrailingPoseCache({ now, log, playerWorld, ratio }) {
  let movingWorldX = 0, movingWorldZ = 0, movingWorldHeading = [...V_FORWARD], hasMovingWorldPose = false;
  let movingWorldPoseAt = 0;

  /**
   * @param {number[]} world
   * @param {number[]} heading
   */
  function store([wx, wz], heading) {
    movingWorldX = wx; movingWorldZ = wz;
    movingWorldHeading = heading; hasMovingWorldPose = true; movingWorldPoseAt = now();
  }
  function forget() { hasMovingWorldPose = false; }
  /**
   * @param {() => DeploymentPose} behindPlayer
   * @returns {DeploymentPose}
   */
  function captureBestAvailableDeploymentPose(behindPlayer) {
    if (hasMovingWorldPose) return { wx: movingWorldX, wz: movingWorldZ, heading: [...movingWorldHeading] };
    return behindPlayer();
  }
  /**
   * @param {() => DeploymentPose} behindPlayer
   * @returns {DeploymentPose}
   */
  function dismountPose(behindPlayer) {
    const cachedAt = hasMovingWorldPose ? movingWorldPoseAt : null;
    const p = captureBestAvailableDeploymentPose(behindPlayer);
    warnIfParkedFar(p, cachedAt);
    return p;
  }
  /**
   * @param {DeploymentPose} p
   * @param {number | null} cachedAt
   */
  function warnIfParkedFar(p, cachedAt) {
    const [px, pz] = playerWorld();
    const metres = Math.hypot(p.wx - px, p.wz - pz) / ratio();
    if (!(metres > TELEPORT_DISTANCE)) return;
    const from = cachedAt === null ? 'behind the player' : `at the trailing pose cached ${(now() - cachedAt).toFixed(1)} s earlier`;
    log.warn?.(`[TrailingWagon] A dismount parked the wagon ${metres.toFixed(1)} m from the player, ${from}.`);
  }

  return { store, forget, captureBestAvailableDeploymentPose, dismountPose };
}
