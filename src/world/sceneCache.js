// The scene cache and permanent set: SerializableStateManager's scene half (MIT, Daggerfall Workshop),
// plus the two GetSceneName formats that key it.

export const interiorSceneName = (mapId, buildingKey) =>
  `DaggerfallInterior [MapID=${mapId}, BuildingKey=${buildingKey}]`;
export const worldSceneName = (mapPixelX, mapPixelY) =>
  `DaggerfallWorld [mapX=${mapPixelX}, mapY=${mapPixelY}]`;

export const LOOT_CONTAINER_TYPES = Object.freeze({
  Nothing: 0, RandomTreasure: 1, CorpseMarker: 2,
  DroppedLoot: 3, ShopShelves: 4, HouseContainers: 5,
});

export function createSceneCache() {
  return { scenes: new Map(), permanent: new Set() };
}

export const addPermanentScene = (cache, sceneName) => { cache.permanent.add(sceneName); };
export const containsPermanentScene = (cache, sceneName) => cache.permanent.has(sceneName);
export const removePermanentScene = (cache, sceneName) => {
  cache.permanent.delete(sceneName);
  for (const n of [...cache.permanent]) if (n.startsWith(`${sceneName}|`)) cache.permanent.delete(n);
};
export const layoutSceneName = (sceneName, layout) => `${sceneName}|${layout || 'classic'}`;

const copyPiles = (piles) => piles.map((p) => ({
  ...p,
  pos: [...p.pos],
  items: (p.items ?? []).map((it) => ({ ...it })),
}));

const copySceneEntry = (d) => ({
  lootContainers: (d.lootContainers ?? []).map((c) => ({ ...c })),
  actionDoors: (d.actionDoors ?? []).map((x) => ({ ...x })),
  droppedPiles: copyPiles(d.droppedPiles ?? []),
  droppedTorches: (d.droppedTorches ?? []).map((t) => ({ ...t, position: [...(t.position ?? [])] })),
  camps: (d.camps ?? []).map((c) => ({ ...c, pos: [...(c.pos ?? [])] })),
  decor: (d.decor ?? []).map((p) => ({
    ...p, pos: [...(p.pos ?? [])], rot: [...(p.rot ?? [])], flat: p.flat ? [...p.flat] : null,
    light: p.light ? { ...p.light, color: [...(p.light.color ?? [])] } : null,
  })),
  decorItems: Object.fromEntries(Object.entries(d.decorItems ?? {}).map(([id, list]) => [id, (list ?? []).map((it) => ({ ...it }))])),
  decorOwn: Object.fromEntries(Object.entries(d.decorOwn ?? {}).map(([id, item]) => [id, { ...item }])),
  hiddenBase: (Array.isArray(d.hiddenBase) ? d.hiddenBase : []).filter((k) => typeof k === 'string'),
  guildShelves: Object.fromEntries(Object.entries(d.guildShelves ?? {})
    .filter(([, s]) => s && Number.isFinite(s.day) && Array.isArray(s.items))
    .map(([service, s]) => [service, { day: s.day, items: s.items.map((it) => ({ ...it })) }])),
  frame: d.frame ?? null, terrainScale: d.terrainScale ?? null,
  ...(typeof d.layout === 'string' && d.layout ? { layout: d.layout } : {}),
});

export function cacheScene(cache, sceneName, entry = {}) {
  cache.scenes.set(sceneName, copySceneEntry(entry));
}

export function restoreCachedScene(cache, sceneName) {
  const data = cache.scenes.get(sceneName) ?? null;
  cache.scenes.delete(sceneName);
  return data;
}

export function foldLayoutCopies(cache, sceneName) {
  const copies = [...cache.scenes.keys()].filter((n) => n.startsWith(`${sceneName}|`));
  for (const n of [...cache.permanent].filter((k) => k.startsWith(`${sceneName}|`))) cache.permanent.delete(n);
  if (!copies.length) return 0;
  const base = copySceneEntry(cache.scenes.get(sceneName) ?? {});
  for (const n of copies) {
    const c = copySceneEntry(cache.scenes.get(n));
    cache.scenes.delete(n);
    const ids = new Set(base.decor.map((pc) => pc.id)), added = new Set();
    for (const pc of c.decor) if (!ids.has(pc.id)) { base.decor.push(pc); ids.add(pc.id); added.add(String(pc.id)); }
    for (const [id, list] of Object.entries(c.decorItems)) if (added.has(id)) base.decorItems[id] = list;
    for (const [id, item] of Object.entries(c.decorOwn)) if (!(id in base.decorOwn)) base.decorOwn[id] = item;
    base.droppedPiles.push(...c.droppedPiles); base.droppedTorches.push(...c.droppedTorches); base.camps.push(...c.camps);
    for (const k of c.hiddenBase) if (!base.hiddenBase.includes(k)) base.hiddenBase.push(k);
  }
  cache.scenes.set(sceneName, base);
  return copies.length;
}

export function takeSceneDecor(cache, sceneName) {
  const d = cache.scenes.get(sceneName);
  if (!d?.decor?.length) return [];
  const pieces = d.decor;
  d.decor = [];
  return pieces;
}

export function clearSceneHidden(cache, sceneName) {
  const d = cache.scenes.get(sceneName);
  const n = d?.hiddenBase?.length ?? 0;
  if (d) d.hiddenBase = [];
  return n;
}

export function takeSceneOwn(cache, sceneName) {
  const d = cache.scenes.get(sceneName);
  const items = Object.values(d?.decorOwn ?? {});
  if (d) d.decorOwn = {};
  return items;
}

export function clearSceneCache(cache, { start = true } = {}) {
  if (start) {
    cache.scenes.clear();
    cache.permanent.clear();
    return;
  }
  const kept = new Map();
  for (const sceneName of cache.permanent) {
    const data = cache.scenes.get(sceneName);
    if (!data) continue;
    kept.set(sceneName, {
      ...data,
      lootContainers: data.lootContainers.filter(
        (c) => c.containerType !== LOOT_CONTAINER_TYPES.CorpseMarker,
      ),
    });
  }
  cache.scenes = kept;
}

export function graftPermanentScene(cache, snap, sceneName) {
  let n = 0;
  for (const e of Array.isArray(snap?.scenes) ? snap.scenes : []) {
    const name = String(e?.sceneName ?? '');
    if (name !== sceneName && !name.startsWith(`${sceneName}|`)) continue;
    const d = copySceneEntry(e);
    d.lootContainers = d.lootContainers.filter((c) => c.containerType !== LOOT_CONTAINER_TYPES.CorpseMarker);
    cache.scenes.set(name, d);
    cache.permanent.add(name);
    n++;
  }
  cache.permanent.add(sceneName);
  return n;
}

export function snapshotSceneCache(cache) {
  return {
    permanentScenes: [...cache.permanent],
    scenes: [...cache.scenes.entries()].map(([sceneName, d]) => ({ sceneName, ...copySceneEntry(d) })),
  };
}
export function restoreSceneCache(cache, snap) {
  cache.scenes = new Map((snap?.scenes ?? []).map((e) => [e.sceneName, copySceneEntry(e)]));
  cache.permanent = new Set(snap?.permanentScenes ?? []);
  return cache;
}
