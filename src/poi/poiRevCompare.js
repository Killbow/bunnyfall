// @ts-check
// Compares two revisions of a POI for the history panel and returns the diff codes from poiDiff.js.

import { poiDiff } from './poiDiff.js';

/**
 * @param {any} h
 * @param {any} rev
 */
function standsFor(h, rev) {
  const seen = new Set();
  for (let r = rev; r && !seen.has(r.rev); r = (h.revs ?? []).find((x) => x?.rev === r.base)) {
    seen.add(r.rev);
    if (r.kind === 'retire') return { doc: null };
    if (r.kind !== 'rollback') return r.doc ? { doc: r.doc } : null;
  }
  return null;
}

/** @param {any} h */
export const comparableRevs = (h) => (Array.isArray(h?.revs) ? h.revs.filter((x) => x && Number.isInteger(x.rev) && standsFor(h, x)) : []);

/**
 * @param {any} h
 * @returns {{ from: number, to: number } | null}
 */
export function defaultPair(h) {
  const revs = comparableRevs(h);
  return revs.length < 2 ? null : { from: revs.at(-2).rev, to: revs.at(-1).rev };
}

/**
 * @param {any} h
 * @param {number} from
 * @param {number} to
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
