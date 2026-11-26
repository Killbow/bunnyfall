// @ts-check

// A trade window that stages the player's goods out of the pack registers them here, so a save keeps them.
// The save appends them at the pack's end, so no saved pack index moves.
/** @type {Set<{ entity: any, items: () => any }>} */
const _held = new Set();

export function holdOut(/** @type {any} */ entity, /** @type {() => any} */ items) {
  if (!entity || typeof items !== 'function') return () => {};
  const h = { entity, items };
  _held.add(h);
  return () => { _held.delete(h); };
}

export function heldOutOf(/** @type {any} */ entity) {
  /** @type {any[]} */
  const out = [];
  if (!entity) return out;
  const pack = Array.isArray(entity.items) ? entity.items : [];
  for (const h of _held) {
    if (h.entity !== entity) continue;
    let list = null;
    try { list = h.items(); } catch { list = null; }
    for (const it of Array.isArray(list) ? list : []) if (it && typeof it === 'object' && !pack.includes(it) && !out.includes(it)) out.push(it);
  }
  return out;
}
