// Where an enemy's sprite and capsule sit relative to the position DFU gives it. DFU's transform is the sprite
// center, while this game's motor tracks the feet and its billboard shader anchors at the bottom.
import { mobileBillboardSize } from '../world/rmbFlats.js';

export function enemyControllerHeight(idleH, behaviour) {
  let h = idleH;
  if (behaviour === 'Flying') h = h / 2;
  if (h < 1.6) h = 1.6;
  return h;
}

export function idleSpriteHeight(t) {
  return mobileBillboardSize(t, 0).h;
}

export function feetFromCentre(pos, idleH) {
  return [pos[0], pos[1] - idleH / 2, pos[2]];
}

export function flyerSpawnFeet(centre, idleH, floorY = null) {
  const feet = feetFromCentre(centre, idleH);
  if (Number.isFinite(floorY) && floorY <= centre[1] && feet[1] < floorY) feet[1] = floorY;
  return feet;
}

export function floorUnderHang(collider, at, idleH) {
  const d = collider.raycast([at[0], at[1] + 0.2, at[2]], [0, -1, 0], idleH / 2 + 0.4);
  return Number.isFinite(d) ? at[1] + 0.2 - d : null;
}

export function flyerStandFeet(collider, at, idleH, feetGiven = false) {
  return feetGiven ? [at[0], at[1], at[2]] : flyerSpawnFeet(at, idleH, floorUnderHang(collider, at, idleH));
}

export function centreFromFeet(feet, idleH) {
  return [feet[0], feet[1] + idleH / 2, feet[2]];
}

export function keepRebuiltSpawn(sf, feet, idleH, behaviour, marker = null) {
  if (sf.anchor != null || !sf.feet) return false;
  const eps = 1e-3;
  // A spectral never grounds by gravity, so an un-stamped ghost still at its raw marker keeps the floor-landed rebuild.
  if (behaviour === 'Spectral') {
    return !!marker && Math.abs(sf.feet[0] - marker[0]) < eps && Math.abs(sf.feet[1] - marker[1]) < eps && Math.abs(sf.feet[2] - marker[2]) < eps;
  }
  if (behaviour !== 'Flying' || idleH === undefined) return false;
  return Math.abs(sf.feet[0] - feet[0]) < eps && Math.abs(sf.feet[2] - feet[2]) < eps
    && Math.abs(sf.feet[1] - (feet[1] + idleH / 2)) < eps;
}

export function spriteOriginY(feetY, idleH, recordH, behaviour) {
  return (behaviour === 'Flying' || behaviour === 'Aquatic') ? feetY + (idleH - recordH) / 2 : feetY;
}
