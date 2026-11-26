// Moves a house deed the arena displaced to a free house of the same type. The pick is seeded by the map id and the
// old key, so a save always gets the same house. The old scene is emptied into the new house.

import { inArenaCell, arenaRecordDisplaced, ARENA_REGION } from '../world/arenaCity.js';
import { interiorSceneName, cacheScene, containsPermanentScene, addPermanentScene, removePermanentScene } from '../world/sceneCache.js';
import { stampLayout } from '../world/layoutPins.js';
import { isResidence } from '../world/buildingNames.js';
import { templateByIndex } from '../items/itemTemplates.js';
import { homeCandidate } from '../homes/onlineHomes.js';

function pick(n, mapId, oldKey) {
  let seed = ((mapId * 0x9e3779b1) ^ (oldKey + 1)) >>> 0 || 1;
  // Several steps: market seeds differ in their high bits (a map id) and these differ in their low bits (a key).
  for (let i = 0; i < 4; i++) {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5; seed >>>= 0;
  }
  return Math.floor((seed / 0x100000000) * n);
}

export function arenaHouseFor({ mapId, oldKey, oldType }, summaries, { held = new Set(), isActiveQuestBuilding = null } = {}) {
  const free = (summaries ?? []).filter((s) => s.buildingKey > 0 && !inArenaCell(s.buildingKey) && !held.has(s.buildingKey)
    && !(isActiveQuestBuilding?.(s) ?? false)).sort((a, b) => a.buildingKey - b.buildingKey);
  let list = free.filter((s) => s.buildingType === oldType);
  if (!list.length) list = free.filter((s) => isResidence(s.buildingType));
  return list.length ? list[pick(list.length, mapId, oldKey)] : null;
}

export function arenaHomeFor(o, summaries, opts = {}) {
  // Online homes exclude buildings an online home cannot be and rooms with no interior to lay out.
  return arenaHouseFor(o, (summaries ?? []).filter((s) => homeCandidate(s) && s.hasInterior !== false), opts);
}

// Matches the container:i keys that restoreInteriorScene in worldModes.js gives a scene's containers.
export const ARENA_CRATE_KEY = 'container:0';
const copyItem = (it) => ({ ...it });
// Keep in sync with GROUP_FOR in items/droppedTorches.js and SECONDS_PER_CONDITION in items/handheldTorches.js.
const LIGHT_GROUPS = Object.freeze({ 247: 'UselessItems2', 253: 'UselessItems2', 269: 'ReligiousItems' });
const LIGHT_SECONDS_PER_CONDITION = 20;
export function droppedLightItem(t) {
  const template = t?.itemTemplateIndex | 0;
  const group = LIGHT_GROUPS[template];
  if (!group) return null;
  return { group, templateIndex: template, maxCondition: templateByIndex(template)?.hitPoints ?? 0, currentCondition: Math.max(1, Math.ceil((Number(t.time) || 0) / LIGHT_SECONDS_PER_CONDITION)) };
}
export function emptyArenaScene(cache, from, to, { layout = null } = {}) {
  const out = { own: [], refund: 0, crate: [], pieces: 0, hidden: 0, lights: 0 };
  if (!cache?.scenes) return out;
  const moved = (name) => name === from || name.startsWith(`${from}|`);
  let permanent = false;
  for (const [name, d] of [...cache.scenes]) {
    if (!moved(name)) continue;
    cache.scenes.delete(name);
    for (const item of Object.values(d?.decorOwn ?? {})) if (item) out.own.push(copyItem(item));
    for (const p of d?.decor ?? []) { if (p?.item) continue; out.pieces++; out.refund += Number.isSafeInteger(p?.paid) && p.paid > 0 ? p.paid : 0; }
    out.hidden += Array.isArray(d?.hiddenBase) ? d.hiddenBase.length : 0;
    for (const c of d?.lootContainers ?? []) if (Array.isArray(c?.items) && !String(c.key ?? '').startsWith('shelf')) out.crate.push(...c.items.map(copyItem));
    for (const list of Object.values(d?.decorItems ?? {})) if (Array.isArray(list)) out.crate.push(...list.map(copyItem));
    for (const pile of d?.droppedPiles ?? []) if (Array.isArray(pile?.items)) out.crate.push(...pile.items.map(copyItem));
    for (const t of d?.droppedTorches ?? []) { const it = droppedLightItem(t); if (it) { out.crate.push(it); out.lights++; } }
  }
  for (const name of [...cache.permanent]) if (moved(name)) { permanent = true; cache.permanent.delete(name); }
  removePermanentScene(cache, from);
  // Never overwrite a permanent target scene: an online move can run again at each boot until it is marked read.
  // Carried items join its first container and nothing else in it changes.
  const kept = containsPermanentScene(cache, to) ? cache.scenes.get(to) ?? null : null;
  if (kept) {
    if (out.crate.length) {
      const lc = kept.lootContainers;
      const chest = lc.find((c) => c?.key === ARENA_CRATE_KEY);
      if (chest) { chest.items = [...(Array.isArray(chest.items) ? chest.items : []), ...out.crate.map(copyItem)]; chest.crate = true; }
      else lc.push({ key: ARENA_CRATE_KEY, items: out.crate.map(copyItem), crate: true, stockedDate: 0 });
    }
  } else if (out.crate.length || permanent) {
    // Stamp the layout the town is visited in, or the next visit holds the record back as another layout's.
    cacheScene(cache, to, stampLayout({ lootContainers: out.crate.length ? [{ key: ARENA_CRATE_KEY, items: out.crate.map(copyItem), crate: true, stockedDate: 0 }] : [], frame: 'building' }, layout));
  }
  if (permanent) addPermanentScene(cache, to);
  return out;
}

export function moveArenaRecords({ houses, summaries, oldTypeOf, held = new Set(), isActiveQuestBuilding = null, scenes = null, displaced = arenaRecordDisplaced } = {}, hooks = {}) {
  const slot = houses?.[ARENA_REGION];
  if (!slot || !(slot.buildingKey > 0) || !displaced(slot)) return null;
  const from = slot.buildingKey;
  const to = arenaHouseFor({ mapId: slot.mapId, oldKey: from, oldType: oldTypeOf?.(from) ?? null }, summaries, { held, isActiveQuestBuilding });
  if (!to) return null;
  const emptied = scenes ? emptyArenaScene(scenes, interiorSceneName(slot.mapId, from), interiorSceneName(slot.mapId, to.buildingKey), { layout: slot.layout ?? null }) : { own: [], refund: 0, crate: [] };
  slot.buildingKey = to.buildingKey;
  if (emptied.own.length) hooks.giveOwn?.(emptied.own);
  if (emptied.refund > 0) hooks.refund?.(emptied.refund);
  hooks.undiscoverCell?.();
  hooks.discover?.(to);
  hooks.addNote?.(to);
  hooks.notice?.(to);
  return { from, to: to.buildingKey, name: to.name ?? '', own: emptied.own.length, refund: emptied.refund, crate: emptied.crate.length };
}
