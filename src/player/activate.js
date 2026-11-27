// Player activation ray and target picking, using Daggerfall Unity's PlayerActivate distances.
import { GLOBAL_SCALE } from '../world/meshReader.js';
import { isActionDoorObject } from '../world/actionSystem.js';
import { noteBodyStack } from './lootStack.js';
import { localizedText } from '../ui/textManager.js';
import { crowdKinHidden } from '../net/gateCrowd.js';
export const PICK_PARDON_M = 0.15;

export { GLOBAL_SCALE };

export const RAY_DISTANCE = 3072 * GLOBAL_SCALE;
export const DEFAULT_ACTIVATION_DISTANCE = 128 * GLOBAL_SCALE;
export const DOOR_ACTIVATION_DISTANCE = 128 * GLOBAL_SCALE;
export const TREASURE_ACTIVATION_DISTANCE = 128 * GLOBAL_SCALE;
export const PICKPOCKET_DISTANCE = 128 * GLOBAL_SCALE;
export const STATIC_NPC_ACTIVATION_DISTANCE = 256 * GLOBAL_SCALE;
export const MOBILE_NPC_ACTIVATION_DISTANCE = 256 * GLOBAL_SCALE;
export const TOO_FAR_AWAY_TEXT = 'You are too far away...';
export const tooFarAwayText = () => localizedText('youAreTooFarAway', TOO_FAR_AWAY_TEXT);
export const YOU_SEE_TEXT = 'You see %s.';
export const presentNpcInfoText = (displayName) => localizedText('youSee', YOU_SEE_TEXT).replaceAll('%s', displayName ?? '');
export const CORPSE_ACTIVATION_DISTANCE = 150 * GLOBAL_SCALE;

export function worldAabb(positions, m) {
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
    if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
    if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
    if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz;
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

export function boxContains(aabb, p, skin = 0) {
  return p[0] >= aabb.min[0] - skin && p[0] <= aabb.max[0] + skin
    && p[1] >= aabb.min[1] - skin && p[1] <= aabb.max[1] + skin
    && p[2] >= aabb.min[2] - skin && p[2] <= aabb.max[2] + skin;
}

const boxVolume = (b) => (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]);

/** @typedef {{ min: number[], max: number[] }} RayBox */
/** @typedef {{ key: string | number, aabb: RayBox, distance?: number, reach?: number }} RayTarget */

export function rayAabb(origin, dir, aabb) {
  let tMin = 0;
  let tMax = Infinity;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(dir[a]) < 1e-9) {
      if (origin[a] < aabb.min[a] || origin[a] > aabb.max[a]) return null;
      continue;
    }
    const inv = 1 / dir[a];
    let t0 = (aabb.min[a] - origin[a]) * inv;
    let t1 = (aabb.max[a] - origin[a]) * inv;
    if (t0 > t1) { const s = t0; t0 = t1; t1 = s; }
    if (t0 > tMin) tMin = t0;
    if (t1 < tMax) tMax = t1;
    if (tMin > tMax) return null;
  }
  return tMin;
}

const _liveBoxes = new WeakMap();

export function objectAabb(o) {
  if (!o) return null;
  if (o.cpu && o.matrix) {
    const memo = _liveBoxes.get(o);
    if (memo && memo.matrix === o.matrix && memo.positions === o.cpu.positions) return memo.box;
    const box = worldAabb(o.cpu.positions, o.matrix);
    _liveBoxes.set(o, { matrix: o.matrix, positions: o.cpu.positions, box });
    return box;
  }
  return o.aabb ?? null;
}

/**
 * @param {Map<string, object>} objects
 * @param {number} distance
 */
export function activationTargets(objects, distance = DOOR_ACTIVATION_DISTANCE) {
  const targets = [];
  for (const o of objects.values()) {
    const aabb = objectAabb(o);
    if (!aabb) continue;
    if (isActionDoorObject(o)) targets.push({ key: o.key, aabb, distance: RAY_DISTANCE, reach: distance, door: true });
    else targets.push({ key: o.key, aabb, distance, meshCollider: hasMeshCollider(o) });
  }
  return targets;
}

export const hasMeshCollider = (o) => !!o && (o.kind === 'action'
  || (o.kind === 'door' && o.special === true)
  || ((o.kind === 'relay' || o.kind === 'effect') && o.modelIdNum != null));

/**
 * @param {Array<object>} foes
 * @returns {object|null}
 */
export function pickQuestFoe(eye, dir, foes, collider, distance = DEFAULT_ACTIVATION_DISTANCE) {
  return pickFoeAlong(eye, dir, foes, collider, distance, (f) => !!f.questBehaviour)?.foe ?? null;
}

/** @returns {object|null} */
export function pickFoe(eye, dir, foes, collider, distance = DEFAULT_ACTIVATION_DISTANCE) {
  return pickFoeAlong(eye, dir, foes, collider, distance, () => true)?.foe ?? null;
}

/** @returns {{foe: object, distance: number}|null} */
export function pickFoeHit(eye, dir, foes, collider, distance = DEFAULT_ACTIVATION_DISTANCE) {
  return pickFoeAlong(eye, dir, foes, collider, distance, () => true);
}

export function foeAabb(f) {
  const feet = f?.ai?.feet;
  if (!feet || crowdKinHidden(f)) return null;
  const h = f.ai?.height ?? 1.8;
  const half = 0.45;
  return {
    min: [feet[0] - half, feet[1], feet[2] - half],
    max: [feet[0] + half, feet[1] + h, feet[2] + half],
  };
}

export function liveFoeTargets(foes, keyPrefix, { idOf = null } = {}) {
  const targets = [];
  let i = -1;
  for (const f of foes ?? []) {
    i += 1;
    if (!f || f.dead) continue;
    const aabb = foeAabb(f);
    if (!aabb) continue;
    targets.push({
      key: `${keyPrefix}:${idOf ? idOf(f) : i}`,
      aabb,
      distance: RAY_DISTANCE,
      reach: MOBILE_NPC_ACTIVATION_DISTANCE,
      ...(f.ai && !(f.puppet ? f._pupMine : f.ai.isHostile) && f.companion == null ? { peaceful: true } : {}),
      ...(isCompanion(f) ? { ally: true } : {}),
    });
  }
  return targets;
}

export function doorDistanceOf(eye, dir, targets, collider) {
  const doors = (targets ?? []).filter((t) => t?.door === true);
  return doors.length ? (pickActivatableHit(eye, dir, doors, collider)?.distance ?? Infinity) : Infinity;
}

export function peacefulFoePass(foeHit, targets, doorBehind, mode = null) {
  if (foeHit && targets.find((t) => t.key === foeHit.key)?.ally === true) return { ...foeHit, ally: true };
  if (!foeHit || mode === 'steal' || !targets.find((t) => t.key === foeHit.key)?.peaceful) return foeHit;
  const door = typeof doorBehind === 'function' ? doorBehind() : doorBehind;
  return Number.isFinite(door) && door <= DOOR_ACTIVATION_DISTANCE ? null : foeHit;
}

export function liveFoeFor(foes, key, keyPrefix, { idOf = null } = {}) {
  if (typeof key !== 'string' || !key.startsWith(`${keyPrefix}:`)) return null;
  let i = -1;
  for (const f of foes ?? []) {
    i += 1;
    if (!f || f.dead) continue;
    if (`${keyPrefix}:${idOf ? idOf(f) : i}` === key) return f;
  }
  return null;
}

function pickFoeAlong(eye, dir, foes, collider, distance, accept) {
  let best = null;
  let bestD = Infinity;
  for (const f of foes ?? []) {
    if (!f || f.dead || !accept(f)) continue;
    const aabb = foeAabb(f);
    if (!aabb) continue;
    const d = rayAabb(eye, dir, aabb);
    if (d === null || d > distance || d >= bestD) continue;
    const wall = collider?.raycast?.(eye, dir, d) ?? Infinity;
    if (Number.isFinite(wall) && wall < d - 0.05) continue;
    best = f;
    bestD = d;
  }
  return best ? { foe: best, distance: bestD } : null;
}

/**
 * @param {Array<{key:string, aabb:{min,max}, distance?:number, reach?:number, yields?:boolean}>} targets
 * @returns {string|null}
 */
export function pickActivatable(eye, dir, targets, collider) {
  return pickActivatableHit(eye, dir, targets, collider)?.key ?? null;
}

export function rayObb(origin, dir, m, box) {
  const rx = origin[0] - m[12], ry = origin[1] - m[13], rz = origin[2] - m[14];
  const o = [rx * m[0] + ry * m[1] + rz * m[2], rx * m[4] + ry * m[5] + rz * m[6], rx * m[8] + ry * m[9] + rz * m[10]];
  const d = [dir[0] * m[0] + dir[1] * m[1] + dir[2] * m[2], dir[0] * m[4] + dir[1] * m[5] + dir[2] * m[6], dir[0] * m[8] + dir[1] * m[9] + dir[2] * m[10]];
  return rayAabb(o, d, { min: [box[0], box[1], box[2]], max: [box[3], box[4], box[5]] });
}

export function pickActivatableHit(eye, dir, targets, collider) {
  const nearest = (list) => nearestActivatableHit(eye, dir, list, collider);
  return noteBodyStack(firmFirst(targets, nearest), targets, nearest);
}

export const yieldsRay = (t) => !!t && t.yields === true;

export function firmFirst(entrants, nearest) {
  if (!entrants.some(yieldsRay)) return nearest(entrants);
  return nearest(entrants.filter((e) => !yieldsRay(e))) ?? nearest(entrants.filter(yieldsRay));
}

export const isCompanion = (f) => !!f && f.companion != null;
export const answersPress = (p) => !!p && !yieldsRay(p) && p.distance <= p.reach;
export const allyYields = (foe, behind) => isCompanion(foe) && answersPress(behind);

function nearestActivatableHit(eye, dir, targets, collider) {
  let bestKey = null;
  let bestDist = Infinity;
  let bestAabb = null;
  let bestReach = DEFAULT_ACTIVATION_DISTANCE;
  let bestNoSurface = false;
  let bestYields = false;
  let targetKeys = null;
  let firstHit;
  for (const target of targets) {
    let d = target.obb ? rayObb(eye, dir, target.obb.m, target.obb.box) : rayAabb(eye, dir, target.aabb);
    if (d === null) continue;
    if (d === 0 && boxContains(target.aabb, eye)) {
      if (target.noSurface === true) continue;
      const reach = target.distance ?? DEFAULT_ACTIVATION_DISTANCE;
      const hit = collider.raycastHit ? collider.raycastHit(eye, dir, reach) : { dist: collider.raycast(eye, dir, reach), key: null };
      if (!Number.isFinite(hit.dist)) continue;
      if (hit.key != null && hit.key !== target.key) {
        targetKeys ??= new Set(targets.map((t) => t.key));
        if (targetKeys.has(hit.key)) continue;
      }
      if (!boxContains(target.aabb, [eye[0] + dir[0] * hit.dist, eye[1] + dir[1] * hit.dist, eye[2] + dir[2] * hit.dist], PICK_PARDON_M)) continue;
      d = hit.dist;
    } else if (target.meshCollider === true && collider.raycastHit) {
      firstHit ??= collider.raycastHit(eye, dir, RAY_DISTANCE);
      if (firstHit.key != null && firstHit.key !== target.key) {
        targetKeys ??= new Set(targets.map((t) => t.key));
        if (targetKeys.has(firstHit.key) && (boxContains(target.aabb, [eye[0] + dir[0] * firstHit.dist, eye[1] + dir[1] * firstHit.dist, eye[2] + dir[2] * firstHit.dist], PICK_PARDON_M) || !(firstHit.dist > d))) continue;
      }
      if (firstHit.key === target.key) d = Math.max(d, firstHit.dist);
    } else if (target.surface === true && collider.raycastHit && d <= bestDist) {
      firstHit ??= collider.raycastHit(eye, dir, RAY_DISTANCE);
      if (!Number.isFinite(firstHit.dist)) continue;
      if (!boxContains(target.aabb, [eye[0] + dir[0] * firstHit.dist, eye[1] + dir[1] * firstHit.dist, eye[2] + dir[2] * firstHit.dist], PICK_PARDON_M)) continue;
      d = Math.max(d, firstHit.dist);
    }
    if (d > bestDist) continue;
    if (d === bestDist && (bestAabb === null || boxVolume(target.aabb) >= boxVolume(bestAabb))) continue;
    if (d > (target.distance ?? DEFAULT_ACTIVATION_DISTANCE)) continue;
    bestKey = target.key;
    bestDist = d;
    bestAabb = target.aabb;
    bestReach = target.reach ?? target.distance ?? DEFAULT_ACTIVATION_DISTANCE;
    bestNoSurface = target.noSurface === true;
    bestYields = yieldsRay(target);
  }
  if (bestKey === null) return null;
  const wall = collider.raycast(eye, dir, bestDist - 0.05);
  if (wall < bestDist - 0.05) {
    if (bestNoSurface) return null;
    const hx = eye[0] + dir[0] * wall;
    const hy = eye[1] + dir[1] * wall;
    const hz = eye[2] + dir[2] * wall;
    const b = bestAabb;
    const skin = PICK_PARDON_M;
    const inside = hx >= b.min[0] - skin && hx <= b.max[0] + skin
      && hy >= b.min[1] - skin && hy <= b.max[1] + skin
      && hz >= b.min[2] - skin && hz <= b.max[2] + skin;
    if (!inside) return null;
  }
  return bestYields ? { key: bestKey, distance: bestDist, reach: bestReach, yields: true } : { key: bestKey, distance: bestDist, reach: bestReach };
}
