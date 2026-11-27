// Collects which pixel keys a season re-skin rebuilds: stale keys by install generation and archive, the whole grid
// for the classic season flip, and snow turns that re-skin in place.

export function createSeasonReskin() {
  const keys = new Set();
  const skins = new Set();
  let reskin = null;
  let all = false;
  return {
    mark(key) { keys.add(key); },
    markStale(seasons, built) {
      for (const [key, p] of built) {
        if (p._seasonsGen !== seasons.generation && p.batches.some((b) => seasons.manages(b.archive))) keys.add(key);
      }
    },
    markAll() { all = true; },
    skin(key) { skins.add(key); },
    get pending() { return all || keys.size > 0 || skins.size > 0; },
    clear() { all = false; keys.clear(); skins.clear(); },
    take(built) {
      const out = all ? [...built.keys()] : [...keys].filter((k) => built.has(k));
      all = false;
      keys.clear();
      for (const k of out) skins.delete(k);
      return out;
    },
    nextSkin(built, at) {
      let best = null, bestD = Infinity;
      for (const k of skins) {
        const p = built.get(k);
        if (!p) { skins.delete(k); continue; }
        const d = Math.hypot(p.px - at.x, p.py - at.y);
        if (d < bestD) { bestD = d; best = k; }
      }
      if (best !== null) skins.delete(best);
      return best;
    },
    skinWith(fn) { reskin = fn; },
    runSkin(built, at) {
      const key = reskin ? this.nextSkin(built, at) : null;
      if (key === null) return null;
      return reskin(key).catch((e) => { console.warn(`[season] re-skin ${key}:`, e?.message ?? e); return false; });
    },
  };
}
