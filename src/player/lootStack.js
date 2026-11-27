// @ts-check
// Loot stack: the bodies on one ray, with one loot window tabbed over all of them.
// The pick still returns the nearest body; it only records the stack for the window and the plaque.

/** @typedef {{ key: string, distance: number, reach: number }} RayPick */
/** @typedef {{ key: string, body?: boolean }} StackTarget */

let _seen = /** @type {string[]|null} */ (null);

const isBody = (t) => !!t && t.body === true;

/**
 * @param {RayPick|null} first
 * @param {StackTarget[]} targets
 * @param {(targets: StackTarget[]) => RayPick|null} nearest
 * @returns {RayPick[]}
 */
export function bodyStack(first, targets, nearest) {
  if (!first) return [];
  const out = [first];
  let rest = targets.filter((t) => isBody(t) && t.key !== first.key);
  while (rest.length) {
    const hit = nearest(rest);
    if (!hit || !(hit.distance <= hit.reach)) break;
    out.push(hit);
    rest = rest.filter((t) => t.key !== hit.key);
  }
  return out;
}

/**
 * @param {RayPick|null} first
 * @param {StackTarget[]} targets
 * @param {(targets: StackTarget[]) => RayPick|null} nearest
 * @returns {RayPick|null}
 */
export function noteBodyStack(first, targets, nearest) {
  if (!Array.isArray(targets) || !targets.some(isBody)) return first;
  const front = first && targets.some((t) => isBody(t) && t.key === first.key) ? first : null;
  const stack = front ? bodyStack(front, targets, nearest) : [];
  _seen = stack.length < 2 ? null : stack.map((h) => h.key);
  return first;
}

export function bodyPile(key) {
  return _seen && _seen[0] === key ? [..._seen] : [key];
}

/**
 * @param {string} key
 * @param {{ keys?: string[]|null, describe: (key: string) => ({ name: string, count: number }|null), open: (key: string, keys: string[]) => void }} o
 * @returns {{ bodies: { key: string, name: string, count: number }[], current: string, open: (key: string) => void }|null}
 */
export function lootPile(key, { keys = null, describe, open }) {
  const all = keys ?? bodyPile(key);
  const bodies = [];
  for (const k of all) {
    const d = describe(k);
    if (d || k === key) bodies.push({ key: k, name: d?.name ?? '', count: d?.count ?? 0 });
  }
  if (bodies.length < 2) return null;
  return { bodies, current: key, open: (k) => { if (k !== key && bodies.some((b) => b.key === k)) open(k, all); } };
}

export function bodyStackMark(key) {
  return _seen && _seen.includes(key) ? { count: _seen.length } : null;
}

// The note is cleared with the host that raised it.
export function resetBodyStack() { _seen = null; }

export const _bodyStackStateForTests = () => ({ seen: _seen ? [..._seen] : null });
