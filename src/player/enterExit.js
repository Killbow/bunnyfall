// Building enter and exit spawn math, following Daggerfall Unity PlayerEnterExit and DaggerfallStaticDoors.
import { CAPSULE_RADIUS, CAPSULE_HEIGHT } from './motor.js';
import { t } from '../ui/textManager.js';

export const ENTER_DOOR_OFFSET = CAPSULE_RADIUS + 0.4;
export const EXIT_DOOR_OFFSET = CAPSULE_RADIUS * 3;
export const MARKER_UP_OFFSET = CAPSULE_HEIGHT * 0.6;
export const DUNGEON_EXIT_OFFSET = CAPSULE_RADIUS + 0.1;

export function doorWorldPosition(door) {
  const m = door.matrix;
  const x = door.centre.x;
  const y = door.centre.y;
  const z = door.centre.z;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

export function doorWorldNormal(door) {
  const m = door.matrix;
  const nx = door.normal.x;
  const ny = door.normal.y;
  const nz = door.normal.z;
  const x = m[0] * nx + m[4] * ny + m[8] * nz;
  const y = m[1] * nx + m[5] * ny + m[9] * nz;
  const z = m[2] * nx + m[6] * ny + m[10] * nz;
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

export function doorWorldAabb(door) {
  const c = doorWorldPosition(door);
  const h = [
    door.size.x / 2 + 0.25,
    door.size.y / 2 + 0.25,
    door.size.z / 2 + 0.25,
  ];
  const e = Math.max(h[0], h[2]);
  return {
    min: [c[0] - e, c[1] - h[1], c[2] - e],
    max: [c[0] + e, c[1] + h[1], c[2] + e],
  };
}

function closest(points, p) {
  let best = null;
  let bestD = Infinity;
  for (const point of points) {
    const dx = point.pos[0] - p[0];
    const dy = point.pos[1] - p[1];
    const dz = point.pos[2] - p[2];
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestD) { bestD = d; best = point; }
  }
  return best;
}

function byDistance(points, p) {
  return points.map((point) => {
    const dx = point.pos[0] - p[0];
    const dy = point.pos[1] - p[1];
    const dz = point.pos[2] - p[2];
    return { point, d: dx * dx + dy * dy + dz * dz };
  }).sort((a, b) => a.d - b.d).map((e) => e.point);
}

export const NOTHING_OF_VALUE_TEXT = 'This house has nothing of value.';
export const INTERIOR_VOID_TEXT = 'There was no floor beneath you. You are back at the door.';
export const INTERIOR_VOID_DROP = 10;
export const DUNGEON_VOID_TEXT = 'There was no floor beneath you. You are back at the entrance.';
export const dungeonVoidText = () => t('player.dungeonVoid', DUNGEON_VOID_TEXT);

/**
 * @param {Array<[x,y,z]>} enterMarkers
 * @param {Array} interiorDoors
 * @param {((p:[number,number,number]) => boolean)|null} standsAt
 * @returns {[x,y,z]|null}
 */
export function interiorLanding(exteriorDoorPos, enterMarkers, interiorDoors, standsAt = null) {
  let check = exteriorDoorPos;
  const markers = enterMarkers.map((m) => ({ pos: m }));
  const marker = closest(markers, check);
  if (marker) check = marker.pos;
  const doors = interiorDoors.map((d) => ({
    pos: doorWorldPosition(d),
    normal: doorWorldNormal(d),
  }));
  if (standsAt) {
    for (const d of byDistance(doors, check)) {
      const at = [d.pos[0] + d.normal[0] * ENTER_DOOR_OFFSET, d.pos[1] + d.normal[1] * ENTER_DOOR_OFFSET, d.pos[2] + d.normal[2] * ENTER_DOOR_OFFSET];
      if (standsAt(at)) return at;
    }
    for (const m of byDistance(markers, exteriorDoorPos)) {
      const at = [m.pos[0], m.pos[1] + MARKER_UP_OFFSET, m.pos[2]];
      if (standsAt(at)) return at;
    }
    return null;
  }
  const door = closest(doors, check);
  if (door) {
    return [
      door.pos[0] + door.normal[0] * ENTER_DOOR_OFFSET,
      door.pos[1] + door.normal[1] * ENTER_DOOR_OFFSET,
      door.pos[2] + door.normal[2] * ENTER_DOOR_OFFSET,
    ];
  }
  if (marker) {
    return [marker.pos[0], marker.pos[1] + MARKER_UP_OFFSET, marker.pos[2]];
  }
  return null;
}

/** @returns {{pos:[x,y,z], normal:[x,y,z], index:number}|null} */
export function closestDoorTo(pos, doors) {
  let best = null;
  let minDistance = Infinity;
  (doors ?? []).forEach((door, i) => {
    const c = doorWorldPosition(door);
    const d = Math.hypot(c[0] - pos[0], c[1] - pos[1], c[2] - pos[2]);
    if (d < minDistance) { minDistance = d; best = { pos: c, normal: doorWorldNormal(door), index: i }; }
  });
  return best;
}

/**
 * @param {Array} doors
 * @param {[number,number,number]} interiorOrigin
 * @returns {{pos:[x,y,z], normal:[x,y,z], index:number}|null}
 */
export function findLowestOuterInteriorDoor(doors, interiorOrigin = [0, 0, 0]) {
  let best = null;
  let lowestY = Infinity;
  let farthestDist = 0;
  (doors ?? []).forEach((door, i) => {
    const c = doorWorldPosition(door);
    const dist = Math.hypot(c[0] - interiorOrigin[0], c[2] - interiorOrigin[2]);
    if (c[1] <= lowestY && dist > farthestDist) {
      best = { pos: c, normal: doorWorldNormal(door), index: i };
      lowestY = c[1];
      farthestDist = dist;
    }
  });
  return best;
}

/** @returns {{pos:[x,y,z], normal:[x,y,z]}|null} */
export function dungeonEntranceLanding(entranceDoors) {
  let best = null;
  let bestY = Infinity;
  for (const door of entranceDoors) {
    const p = doorWorldPosition(door);
    if (p[1] < bestY) {
      bestY = p[1];
      best = { pos: p, normal: doorWorldNormal(door) };
    }
  }
  if (!best) return null;
  return {
    pos: [
      best.pos[0] + best.normal[0] * DUNGEON_EXIT_OFFSET,
      best.pos[1] + best.normal[1] * DUNGEON_EXIT_OFFSET,
      best.pos[2] + best.normal[2] * DUNGEON_EXIT_OFFSET,
    ],
    normal: best.normal,
  };
}

export function repositionFeetY(terrainY, centreY, height = CAPSULE_HEIGHT) {
  const minFeet = (Number.isFinite(terrainY) ? terrainY : -Infinity) + 0.15;
  return Math.max(minFeet, centreY - height / 2);
}

export const LADDER_MODEL_ID = 41409;

/** @returns {[x,y,z]|null} */
export function climbLadder(playerPos, markers, markerTypes) {
  const closestOf = (type) => {
    let best = null;
    let bestD = Infinity;
    for (const m of markers) {
      if (m.type !== type) continue;
      const dx = m.x - playerPos[0];
      const dy = m.y - playerPos[1];
      const dz = m.z - playerPos[2];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) { bestD = d; best = m; }
    }
    return best;
  };
  const top = closestOf(markerTypes.LADDER_TOP);
  const bottom = closestOf(markerTypes.LADDER_BOTTOM);
  if (top && playerPos[1] < top.y) return [top.x, top.y, top.z];
  if (bottom && playerPos[1] > bottom.y) return [bottom.x, bottom.y, bottom.z];
  return null;
}

export function exteriorLanding(playerPos, buildingDoors) {
  const doors = buildingDoors.map((d) => ({
    pos: doorWorldPosition(d),
    normal: doorWorldNormal(d),
  }));
  const door = closest(doors, playerPos);
  if (!door) return null;
  return [
    door.pos[0] + door.normal[0] * EXIT_DOOR_OFFSET,
    door.pos[1] + door.normal[1] * EXIT_DOOR_OFFSET,
    door.pos[2] + door.normal[2] * EXIT_DOOR_OFFSET,
  ];
}

export function floorLanding(collider, pos, maxDist = 10, extraHeight = 0) {
  pos = [pos[0], pos[1] + extraHeight, pos[2]];
  const bestFloorY = footprintFloorY(collider, pos, maxDist);
  if (bestFloorY === -Infinity) {
    const ground = collider.heightAt?.(pos[0], pos[2]);
    if (Number.isFinite(ground)) return [pos[0], ground, pos[2]];
    return pos;
  }
  return [pos[0], bestFloorY, pos[2]];
}

export const OPEN_GROUND_RINGS = Object.freeze([0, 4, 8, 16, 32, 64, 128, 256]);
export const OPEN_GROUND_STEP = 8;
export function openGroundNear(collider, x, z, { rings = OPEN_GROUND_RINGS, step = OPEN_GROUND_STEP, dry = null } = {}) {
  for (const r of rings) {
    const n = r === 0 ? 1 : Math.max(8, Math.round((2 * Math.PI * r) / step));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI;
      const px = x + r * Math.cos(a), pz = z + r * Math.sin(a);
      const h = collider.heightAt?.(px, pz);
      if (!Number.isFinite(h) || (dry && !dry(h))) continue;
      if (heldInSolid(collider, [px, h, pz])) continue;
      if (collider.sphereOverlaps([px, h + CAPSULE_HEIGHT / 2, pz], CAPSULE_RADIUS)) continue;
      return [px, h, pz];
    }
  }
  return null;
}
export function heldInSolid(collider, feet, height = CAPSULE_HEIGHT) {
  return collider.insideSolid([feet[0], feet[1] + CAPSULE_RADIUS, feet[2]]) || collider.insideSolid([feet[0], feet[1] + height - CAPSULE_RADIUS, feet[2]]);
}

function footprintFloorY(collider, pos, maxDist) {
  const R = 0.18;
  const offs = [[0, 0], [R, 0], [-R, 0], [0, R], [0, -R]];
  let bestFloorY = -Infinity;
  for (const [ox, oz] of offs) {
    const origin = [pos[0] + ox, pos[1] + 0.2, pos[2] + oz];
    const d = collider.raycast(origin, [0, -1, 0], maxDist + 0.2);
    if (Number.isFinite(d)) bestFloorY = Math.max(bestFloorY, origin[1] - d);
  }
  return bestFloorY;
}

export function standsOnFloor(collider, pos, maxDist = 10) {
  return footprintFloorY(collider, pos, maxDist) > -Infinity || Number.isFinite(collider.heightAt?.(pos[0], pos[2]));
}

export function interiorVoidRescue(collider, at) {
  const box = collider.bounds();
  return box ? { at, belowY: box.min[1] - INTERIOR_VOID_DROP } : null;
}

export function dungeonVoidRescue(collider, at, ownsVoid = false) {
  let rescue;
  return () => {
    if (rescue === undefined) { const spot = ownsVoid ? null : at(); rescue = spot ? interiorVoidRescue(collider, spot) : null; }
    return rescue;
  };
}

export function standFromVoid(rescue, player) {
  if (!rescue || !(player.pos[1] < rescue.belowY)) return false;
  player.spawn(rescue.at[0], rescue.at[1], rescue.at[2]);
  return true;
}
