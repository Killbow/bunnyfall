// @ts-check
// Compares two revisions of a POI for the history panel, returning the diff codes from poiDiff.js (formatted by
// poiText.js diffText). Any revision whose state can be resolved in `h.revs` can be picked: a document revision
// resolves to its document, a rollback resolves to the target revision's document, and a retirement resolves to no POI
// (`doc: null`). Pure (no DOM).

import { poiDiff } from './poiDiff.js';

/** Resolves the document state for revision `rev`: returns `{ doc }` (`{ doc: null }` for a retirement), or null
 *  when the history cannot resolve it (for example, a rollback to a revision not in `h.revs`). @param {any} h @param
 *  {any} rev */
function standsFor(h, rev) {
  const seen = new Set();
  for (let r = rev; r && !seen.has(r.rev); r = (h.revs ?? []).find((x) => x?.rev === r.base)) {
    seen.add(r.rev);
    if (r.kind === 'retire') return { doc: null };
    if (r.kind !== 'rollback') return r.doc ? { doc: r.doc } : null;
  }
  return null;
}

/** Returns the revisions in a history (`poiHistory` output) that can be compared, oldest first. @param {any} h */
export const comparableRevs = (h) => (Array.isArray(h?.revs) ? h.revs.filter((x) => x && Number.isInteger(x.rev) && standsFor(h, x)) : []);

/** Returns the default revision pair `{ from, to }` to compare (the second-newest and newest comparable revisions), or
 *  null when fewer than two revisions can be compared.
 *  @param {any} h @returns {{ from: number, to: number } | null} */
export function defaultPair(h) {
  const revs = comparableRevs(h);
  return revs.length < 2 ? null : { from: revs.at(-2).rev, to: revs.at(-1).rev };
}

/**
 * Returns the change codes from revision `from` to revision `to` (empty when nothing differs, including when both
 * resolve to no POI), or null when either revision cannot be compared.
 * @param {any} h @param {number} from @param {number} to
 * @returns {{ code: string, [arg: string]: any }[] | null}
 */
export function compareRevisions(h, from, to) {
  const revs = comparableRevs(h);
  const a = revs.find((x) => x.rev === from), b = revs.find((x) => x.rev === to);
  if (!a || !b) return null;
  const da = standsFor(h, a)?.doc ?? null, db = standsFor(h, b)?.doc ?? null;
  if (!da && !db) return [];
  return poiDiff(da, db);
}
