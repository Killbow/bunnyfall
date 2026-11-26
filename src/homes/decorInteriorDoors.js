// @ts-check

import { worldAabb, RAY_DISTANCE } from '../player/activate.js';

export const INTERIOR_DOOR_PREFIX = 'intdoor:';

export const interiorDoorKey = (index) => `${INTERIOR_DOOR_PREFIX}${index}`;

export function interiorDoorIndex(key) {
  if (typeof key !== 'string' || !key.startsWith(INTERIOR_DOOR_PREFIX)) return null;
  const n = Number(key.slice(INTERIOR_DOOR_PREFIX.length));
  return Number.isSafeInteger(n) && n >= 0 && n < 500 ? n : null;
}

export function interiorDoorKeys(list) {
  const out = [];
  const seen = new Set();
  for (const key of list ?? []) {
    const index = interiorDoorIndex(key);
    if (index == null || seen.has(index)) continue;
    seen.add(index);
    out.push(interiorDoorKey(index));
  }
  return out;
}

// Quest, teleport, and dungeon doors carry a flag, load id, trigger, or next object and stay. A sealed door
// stays too, because without it the opening would lead into nothing.
/** @param {any} object */
export function isRemovableInteriorDoor(object) {
  return !!object && object.kind === 'door' && !object.special && !object.sealed
    && (object.actionFlag ?? 0) === 0 && (object.loadID ?? 0) === 0
    && (object.triggerFlag ?? 0) === 0 && (object.nextKey ?? -1) === -1
    && typeof object.key === 'string' && object.key.startsWith('door:');
}

/** @param {{ draws: any[], addDoor: (cpu: any, matrix: any) => any, removeDoor: (key: string) => boolean }} deps */
export function createInteriorDoors({ draws, addDoor, removeDoor }) {
  /** @type {any[]} */
  const recs = [];
  const recOf = (index) => recs.find((r) => r.index === index) ?? null;

  function adopt(index, cpu, draw) {
    const object = draw?.object;
    if (!isRemovableInteriorDoor(object) || recOf(index)) return false;
    object.roomDoor = true;
    object.roomIndex = index;
    recs.push({
      index, key: interiorDoorKey(index), cpu, matrix: object.matrix,
      at: [object.matrix[12], object.matrix[13], object.matrix[14]],
      object, draw, hidden: false,
    });
    return true;
  }
  function hide(index) {
    const rec = recOf(index);
    if (!rec || rec.hidden) return false;
    if (!removeDoor(rec.object.key)) return false;
    const at = draws.indexOf(rec.draw);
    if (at >= 0) draws.splice(at, 1);
    rec.object = null;
    rec.hidden = true;
    return true;
  }
  function show(index) {
    const rec = recOf(index);
    if (!rec?.hidden) return false;
    const object = addDoor(rec.cpu, rec.matrix);
    if (!isRemovableInteriorDoor(object)) return false;
    object.roomDoor = true;
    object.roomIndex = index;
    rec.object = object;
    rec.draw.object = object;
    draws.push(rec.draw);
    rec.hidden = false;
    return true;
  }
  function apply(list) {
    let n = 0;
    for (const key of interiorDoorKeys(list)) if (hide(interiorDoorIndex(key))) n += 1;
    return n;
  }

  return {
    adopt,
    hide,
    show,
    apply,
    hidden: () => recs.filter((r) => r.hidden).map((r) => r.key),
    list: () => recs.map((r) => ({ key: r.key, at: r.at, hidden: r.hidden, holds: false, door: true })),
    targets() {
      return recs.filter((r) => !r.hidden && r.object && r.cpu?.positions).map((r) => ({
        key: r.key,
        aabb: worldAabb(r.cpu.positions, r.object.matrix ?? r.matrix),
        distance: RAY_DISTANCE,
        meshCollider: true,
      }));
    },
  };
}
