// BUNNYFALL: ability autoaim, one soft lock onto the enemy the player is looking at. Every targeted ability shares it.
// Melee swings turn toward it, dashes and leaps land at it, and shots and arrow rain bend toward it. Tune it here.
import { rayHit } from '../../player/groundRay.js';
import { playerDoor } from '../../player/playerDoor.js';
import { bodyRadius } from '../technique/techniqueBlow.js';
import { CANNOT_LEAP_TEXT, DASH_APEX, NO_ROOM_TEXT, OUT_OF_REACH_TEXT, TECH_DROP_MAX, TECH_RISE_MAX,
  flightApex, floorUnder } from '../techniques.js';
import { abilityMayStrike } from './previewHits.js';

export const AUTOAIM = Object.freeze({
  coneRad: 0.26,        // half-angle around the crosshair an enemy may sit in (about 15 degrees)
  closeConeRad: 0.55,   // the wider cone for an enemy within closeM, so melee feels sticky
  closeM: 3,
  meleeSlackM: 1,       // a swing reaches a locked enemy this far past its own reach
  leapSlackM: 2.5,      // a dash or leap locks an enemy this far past its own length
  landReachM: 1.6,      // after landing, a locked enemy this far past the strike's reach still takes it
  rangedM: 45,          // the farthest a shot or arrow rain locks an enemy
  chestShare: 0.62,     // where on the enemy's height a shot aims
  distanceWeight: 0.012, // among enemies at the same angle, the nearer wins
  sideGapM: 0.35,       // how far beside an enemy a side hop lands, past its body
  minTravelM: 1,        // a locked landing closer than this is refused, and the unlocked aim runs instead
});

const flat = (a, b) => Math.hypot(b[0] - a[0], b[2] - a[2]);
const heightOf = foe => foe?.ai?.height ?? 1.7;
const pointOn = (foe, share) => [foe.ai.feet[0], foe.ai.feet[1] + heightOf(foe) * share, foe.ai.feet[2]];
const lookOf = cam => {
  const yaw = cam?.yaw ?? 0, pitch = cam?.pitch ?? 0;
  return [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
};
function nearLook(eye, look, foe) {
  const f = foe.ai.feet, along = Math.hypot(f[0] - eye[0], f[2] - eye[2]);
  const y = eye[1] + along * look[1] / Math.max(Math.hypot(look[0], look[2]), 1e-6);
  return [f[0], Math.min(f[1] + heightOf(foe), Math.max(f[1], y)), f[2]];
}

/** The enemies an ability may strike now (the running host's door). */
export function huntableFoes(filter = null) {
  return (playerDoor()?.foes?.() ?? []).filter(foe => abilityMayStrike(foe) && foe.ai?.feet && (!filter || filter(foe)));
}

/** The enemy nearest the crosshair within `rangeM` (flat meters to the edge of its body), in sight, or null. */
export function autoaimFoe(cam, collider, rangeM, foes = huntableFoes()) {
  if (!cam?.pos || !cam.feet || !(rangeM > 0)) return null;
  const eye = cam.pos, look = lookOf(cam);
  let best = null, score = Infinity;
  for (const foe of foes) {
    if (!abilityMayStrike(foe) || !foe.ai?.feet) continue;
    const reachTo = flat(cam.feet, foe.ai.feet) - bodyRadius(foe);
    if (reachTo > rangeM) continue;
    const c = nearLook(eye, look, foe);
    const v = [c[0] - eye[0], c[1] - eye[1], c[2] - eye[2]];
    const dist = Math.hypot(v[0], v[1], v[2]);
    if (!(dist > 0.05)) continue;
    const cos = (v[0] * look[0] + v[1] * look[1] + v[2] * look[2]) / dist;
    const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
    const cone = (reachTo <= AUTOAIM.closeM ? AUTOAIM.closeConeRad : AUTOAIM.coneRad) + Math.atan2(bodyRadius(foe), dist);
    if (angle > cone) continue;
    const wall = rayHit(eye, [v[0] / dist, v[1] / dist, v[2] / dist], dist, collider);
    if (Number.isFinite(wall) && wall < dist - 0.4) continue;
    const s = angle + dist * AUTOAIM.distanceWeight;
    if (s < score) { score = s; best = foe; }
  }
  return best;
}

/** The yaw from `from` toward the enemy's feet. */
export const yawToward = (from, foe) => Math.atan2(foe.ai.feet[0] - from[0], foe.ai.feet[2] - from[2]);

/** The camera turned to look at a share of the enemy's height (0 its feet, chestShare for a shot). */
export function camToward(cam, foe, share = AUTOAIM.chestShare) {
  const p = pointOn(foe, share);
  const dx = p[0] - cam.pos[0], dy = p[1] - cam.pos[1], dz = p[2] - cam.pos[2];
  return { ...cam, yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

/** How far an advance carries the body before slack. */
export const advanceReach = advance => advance.length ?? advance.range?.[1] ?? 4;

function flight(advance, feet, bodyH, point, collider, lane, foe) {
  const rise = point[1] - feet[1];
  if (rise < -TECH_DROP_MAX || rise > TECH_RISE_MAX) return { ok: false, why: CANNOT_LEAP_TEXT };
  const apex = flightApex(feet, point, advance.mech === 'leap' ? advance.apex : (advance.apex ?? DASH_APEX), bodyH, collider);
  if (apex == null) return { ok: false, why: NO_ROOM_TEXT };
  return { ok: true, point, apex, lane, foe };
}

function spotClear(from, spot, collider) {
  const dir = [spot[0] - from[0], 0, spot[2] - from[2]], d = Math.hypot(dir[0], dir[2]);
  if (d < 1e-6) return true;
  const wall = rayHit([from[0], from[1] + 1, from[2]], [dir[0] / d, 0, dir[2] / d], d + 0.4, collider);
  return !(Number.isFinite(wall) && wall < d + 0.35);
}

/**
 * A dash or leap that lands at a locked enemy: in front of it (`side` 0) or beside it (`side` 1 right, -1 left).
 * A wall on one side tries the other. `toward` fixes the approach, so the second hop of a chain lands on the far side.
 * Its lane runs from the feet through the enemy, so a lane ability still strikes whoever is on the way.
 */
export function lockedLanding(advance, cam, collider, foe, side = 0, toward = null) {
  const feet = cam.feet, f = foe.ai.feet, bodyH = Math.max(1, cam.pos[1] - feet[1] + 0.15);
  const d = flat(feet, f);
  toward ??= d > 1e-6 ? [(f[0] - feet[0]) / d, 0, (f[2] - feet[2]) / d] : [Math.sin(cam.yaw ?? 0), 0, Math.cos(cam.yaw ?? 0)];
  const r = bodyRadius(foe) + 0.55;
  const sides = side ? [side, -side] : [0];
  let failed = { ok: false, foe, why: OUT_OF_REACH_TEXT };
  for (const s of sides) {
    const across = [toward[2] * s, 0, -toward[0] * s];
    const gap = s ? bodyRadius(foe) + AUTOAIM.sideGapM + 0.3 : 0;
    const back = s ? r * 0.4 : r;
    const spot = [f[0] - toward[0] * back + across[0] * gap, f[1], f[2] - toward[2] * back + across[2] * gap];
    if (!spotClear(f, spot, collider)) continue;
    const y = floorUnder([spot[0], f[1] + 0.8, spot[2]], collider);
    if (y == null) continue;
    const point = [spot[0], y, spot[2]];
    const travel = flat(feet, point);
    if (travel > advanceReach(advance) + AUTOAIM.leapSlackM || travel < AUTOAIM.minTravelM) {
      failed = { ok: false, foe, why: OUT_OF_REACH_TEXT };
      continue;
    }
    const lane = { from: [feet[0], feet[2]], dir: [toward[0], toward[2]], len: d + 0.3, halfW: advance.halfW ?? 0.6,
      yaw: Math.atan2(toward[0], toward[2]), y: feet[1] };
    const result = flight(advance, feet, bodyH, point, collider, lane, foe);
    if (result.ok) return { ...result, toward };
    failed = { ...result, foe };
  }
  return failed;
}

/** A side hop with no enemy locked: sideways from the view by the advance's length, alternating sides. */
export function sideHop(advance, cam, collider, side) {
  const feet = cam.feet, yaw = cam.yaw ?? 0, bodyH = Math.max(1, cam.pos[1] - feet[1] + 0.15);
  for (const s of [side, -side]) {
    const across = [Math.cos(yaw) * s, 0, -Math.sin(yaw) * s];
    const chest = [feet[0], feet[1] + 1, feet[2]];
    let len = advance.length;
    const wall = rayHit(chest, across, len + 0.6, collider);
    if (Number.isFinite(wall)) len = wall - 0.6;
    if (len < 1) continue;
    const end = [feet[0] + across[0] * len, feet[1], feet[2] + across[2] * len];
    const y = floorUnder([end[0], feet[1] + 0.6, end[2]], collider);
    if (y == null) continue;
    const result = flight(advance, feet, bodyH, [end[0], y, end[2]], collider, null, null);
    if (result.ok) return result;
  }
  return { ok: false, why: CANNOT_LEAP_TEXT };
}

/** Which way a side hop goes on this beat of a chain: its own side, else alternating from the right. */
export const sideOf = (advance, beat = 0) => (advance.side === -1 || advance.side === 1 ? advance.side : (beat % 2 ? -1 : 1));

/** The reach a locked melee swing needs to land on `foe` from the eye, never more than its own plus the slack. */
export function lockedReach(cam, foe, reach, slack = AUTOAIM.meleeSlackM) {
  // The hit test measures to the mid-height point, so the reach does too (nearLook is for the aim angle only).
  const c = pointOn(foe, 0.5);
  const dist = Math.hypot(c[0] - cam.pos[0], c[1] - cam.pos[1], c[2] - cam.pos[2]);
  return dist <= reach + slack ? Math.max(reach, dist + 0.15) : reach;
}
