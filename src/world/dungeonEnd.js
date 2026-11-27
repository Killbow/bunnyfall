// @ts-check
// Pure and deterministic: a tie keeps the first marker in list order, so every client picks the same end.

/**
 * @template {{ x: number, z: number }} M
 * @param {{ x: number, z: number } | null | undefined} from
 * @param {M[] | null | undefined} marks
 * @returns {M | null}
 */
export function dungeonEndOf(from, marks) {
  const list = Array.isArray(marks) ? marks.filter((m) => Number.isFinite(m?.x) && Number.isFinite(m?.z)) : [];
  if (!list.length) return null;
  if (!from) return list[0];
  const d = (/** @type {M} */ m) => Math.hypot(m.x - from.x, m.z - from.z);
  return list.reduce((a, m) => (d(m) > d(a) ? m : a));
}

export const LAIR_WALK_WAIT_MS = 20000;
/**
 * @template {{ x: number, z: number }} M
 * @param {{ x: number, z: number } | null | undefined} from
 * @param {M[] | null | undefined} marks
 * @param {((m: M) => boolean) | null} [reaches]
 * @returns {M | null}
 */
export function reachableEndOf(from, marks, reaches = null) {
  if (typeof reaches !== 'function') return dungeonEndOf(from, marks);
  const list = Array.isArray(marks) ? marks.filter((m) => Number.isFinite(m?.x) && Number.isFinite(m?.z)) : [];
  const d = (/** @type {M} */ m) => (from ? Math.hypot(m.x - from.x, m.z - from.z) : 0);
  return list.map((m, i) => ({ m, i, d: d(m) })).sort((a, b) => b.d - a.d || a.i - b.i).find(({ m }) => reaches(m))?.m ?? null;
}
