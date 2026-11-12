// @ts-check
// Safe `localStorage` accessor for the in-game POI editor: returns null when `localStorage` is missing or throws (for
// example, in private browsing or when site data is blocked) so the editor still opens without persistence.

/** Returns the page's `localStorage`, or null when unavailable. */
export function pageStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
