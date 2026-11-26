// @ts-check
// The account server imports this module, so it stays pure. A revival stamp names the `died.at` it takes back, so a
// later death of the same person is unaffected.

// Half a minute longer than the longest online death screen (`WILD_DEATH_HOLD_S`). The page and the account server
// share it, and the server clock starts later, so the page window closes first.
export const REZ_HOLD_S = 150;

/**
 * @param {any} p
 * @returns {number[]}
 */
export const revivedOf = (p) => (Array.isArray(p?.revived) ? p.revived.filter((n) => Number.isFinite(n)) : []);

/**
 * @param {any} person
 * @param {number} diedAt
 */
export function stampRevived(person, diedAt) {
  if (!person || !Number.isFinite(diedAt)) return;
  const had = revivedOf(person);
  if (!had.includes(diedAt)) person.revived = [...had, diedAt];
}

/** @param {any} family */
export function dropRevived(family) {
  const back = new Map();
  for (const p of family?.people ?? []) {
    const at = revivedOf(p);
    if (at.length) back.set(p.id, at);
  }
  if (!back.size) return false;
  let n = 0;
  for (const p of family.people) {
    if (p.died && back.get(p.id)?.includes(Number(p.died.at))) { p.died = null; n++; }
  }
  if (Array.isArray(family.remains)) {
    const kept = family.remains.filter((r) => !back.get(r?.of)?.includes(Number(r?.at)));
    n += family.remains.length - kept.length;
    family.remains = kept;
  }
  if (family.pending && back.get(family.pending.fallenId)?.includes(Number(family.pending.at))) { family.pending = null; n++; }
  return n > 0;
}

/**
 * @param {any} mine
 * @param {any} other
 */
export function takeRevived(mine, other) {
  if (!mine) return false;
  const byId = new Map((mine.people ?? []).map((p) => [p.id, p]));
  for (const o of other?.people ?? []) {
    const p = byId.get(o?.id);
    if (p) for (const at of revivedOf(o)) stampRevived(p, at);
  }
  return dropRevived(mine);
}
