// @ts-check
// Marks the loot lists a room syncs to other players, so gold drops into them respect the room's stack limit.
// A leaf module so the transfer planner can import it without the room modules. A replaced list loses its mark.

let _carried = new WeakSet();

export const markRoomCarried = (/** @type {any[]} */ list) => {
  if (Array.isArray(list)) _carried.add(list);
  return list;
};

export const isRoomCarried = (/** @type {unknown} */ list) => Array.isArray(list) && _carried.has(list);
