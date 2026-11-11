// @ts-check

// The asset catalogue in the editor: loaded once, searched in memory, with the builder's own favourites,
// recent items and collections kept in the browser's storage.

/** @typedef {{ id: string, namespace: string, name: string, category: string, subcategory?: string, tags: string[], dimensionMode: string, [k: string]: any }} Asset */

/** Entries with the fields a namespace shares put back. @param {any} json */
export function hydrate(json) {
  const shared = json.shared ?? {};
  return json.entries.map((/** @type {any} */ e) => ({ ...(shared[e.namespace] ?? {}), ...e }));
}

const words = (s) => String(s).toLowerCase().split(/[^a-z0-9.]+/).filter(Boolean);

export function createCatalogue(/** @type {any} */ json) {
  /** @type {Asset[]} */
  const assets = hydrate(json);
  const byId = new Map(assets.map((a) => [a.id, a]));
  const dup = new Set(json.duplicates ?? []);
  const missing = new Set((json.missingReferences ?? []).map((m) => m.what));
  const hay = assets.map((a) => `${a.name} ${a.id} ${a.namespace} ${a.category} ${a.subcategory ?? ''} ${(a.tags ?? []).join(' ')}`.toLowerCase());

  /** Facets for the filter panel: namespace, category and tag counts over everything. */
  const facets = () => {
    const f = { namespace: new Map(), category: new Map(), tag: new Map() };
    for (const a of assets) {
      f.namespace.set(a.namespace, (f.namespace.get(a.namespace) ?? 0) + 1);
      f.category.set(a.category, (f.category.get(a.category) ?? 0) + 1);
      for (const t of a.tags ?? []) f.tag.set(t, (f.tag.get(t) ?? 0) + 1);
    }
    return f;
  };

  /**
   * Assets matching every word of `q` and every filter, in catalogue order. `ids` limits the search to a set (favourites, a collection).
   * @param {{ q?: string, namespace?: string | null, category?: string | null, subcategory?: string | null, tag?: string | null, ids?: Set<string> | null }} [f]
   */
  function search({ q = '', namespace = null, category = null, subcategory = null, tag = null, ids = null } = {}) {
    const ws = words(q);
    const out = [];
    for (let i = 0; i < assets.length; i++) {
      const a = assets[i];
      if (namespace && a.namespace !== namespace) continue;
      if (category && a.category !== category) continue;
      if (subcategory && a.subcategory !== subcategory) continue;
      if (tag && !(a.tags ?? []).includes(tag)) continue;
      if (ids && !ids.has(a.id)) continue;
      if (ws.length && !ws.every((w) => hay[i].includes(w))) continue;
      out.push(a);
    }
    return out;
  }

  return {
    assets, byId, facets, search,
    has: (/** @type {string} */ id) => byId.has(id),
    get: (/** @type {string} */ id) => byId.get(id) ?? null,
    /** Indicators for a card: an id the archive repeats, or one with a reference the audit could not find. */
    flags: (/** @type {Asset} */ a) => ({ duplicate: dup.has(a.id), missing: missing.has(a.id) || missing.has(a.id.replace(/^[a-z0-9-]+:/, '')) || (a.namespace === 'paperdoll-item' && missing.has(`item ${a.template}`)) }),
  };
}

const PREFS_KEY = 'bunnyfall.worldbuilder.assets';
const RECENT_MAX = 40;

/** The builder's favourites, recents and collections. `storage` is `localStorage` or anything with getItem and setItem. */
export function createAssetPrefs(storage) {
  let p = { favourites: /** @type {string[]} */ ([]), recent: /** @type {string[]} */ ([]), collections: /** @type {Record<string, string[]>} */ ({}) };
  try {
    const raw = JSON.parse(storage?.getItem(PREFS_KEY) ?? 'null');
    if (raw && typeof raw === 'object') p = { favourites: raw.favourites?.filter?.((x) => typeof x === 'string') ?? [], recent: raw.recent?.filter?.((x) => typeof x === 'string') ?? [], collections: Object.fromEntries(Object.entries(raw.collections ?? {}).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.filter((x) => typeof x === 'string')])) };
  } catch { /* unreadable storage: start empty */ }
  const save = () => { try { storage?.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* storage full or blocked: this session only */ } };
  return {
    favourites: () => new Set(p.favourites),
    isFavourite: (id) => p.favourites.includes(id),
    toggleFavourite(id) { const i = p.favourites.indexOf(id); if (i < 0) p.favourites.push(id); else p.favourites.splice(i, 1); save(); return i < 0; },
    recent: () => [...p.recent],
    noteUsed(id) { p.recent = [id, ...p.recent.filter((x) => x !== id)].slice(0, RECENT_MAX); save(); },
    collections: () => Object.keys(p.collections),
    collection: (name) => new Set(p.collections[name] ?? []),
    addToCollection(name, id) { const n = String(name).trim().slice(0, 40); if (!n) return false; (p.collections[n] ??= []); if (!p.collections[n].includes(id)) p.collections[n].push(id); save(); return true; },
    removeFromCollection(name, id) { if (p.collections[name]) { p.collections[name] = p.collections[name].filter((x) => x !== id); save(); } },
    deleteCollection(name) { delete p.collections[name]; save(); },
  };
}

/** The slice of a sorted list a virtual grid draws: rows `[first, last)` for a scroll position. */
export function visibleRows(total, perRow, rowH, scrollTop, viewH, overscan = 2) {
  const rows = Math.ceil(total / perRow);
  const first = Math.max(0, Math.floor(scrollTop / rowH) - overscan);
  const last = Math.min(rows, Math.ceil((scrollTop + viewH) / rowH) + overscan);
  return { first, last, from: first * perRow, to: Math.min(total, last * perRow), height: rows * rowH };
}
