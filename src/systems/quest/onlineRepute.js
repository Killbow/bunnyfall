// Online, the Mages Guild quests listed here are offered only once guild standing reaches the Repute value in their
// quest header. Offline the pool is unchanged.

// Values match the Repute lines in the vendored quest headers.
export const ONLINE_REPUTE_GATES = Object.freeze({ N0B10Y03: 10, N0B20Y02: 20 });

/**
 * @param {Array<{ name: string }> | null} pool
 * @param {number} rep
 * @param {boolean} online
 */
export function reputeGated(pool, rep, online) {
  if (!online || !pool) return pool;
  return pool.filter((q) => !Object.hasOwn(ONLINE_REPUTE_GATES, q.name) || rep >= ONLINE_REPUTE_GATES[q.name]);
}
