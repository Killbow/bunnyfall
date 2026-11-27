// @ts-check

import { DECOR_BASE_KEY_RE, DECOR_HIDDEN_CAP, decorHiddenOf } from '../net/decorLaw.js';
import { lateSolidsOf } from '../player/lateSolid.js';
import { DEFAULT_ACTIVATION_DISTANCE, RAY_DISTANCE } from '../player/activate.js';
import { LADDER_MODEL_ID } from '../player/enterExit.js';
import { PROP_MODEL_TYPE } from '../world/interiorLayout.js';
import { MACHINERY_MODEL_ID } from '../world/windmillMesh.js';
import { classicModelIdOf } from '../world/customModels.js';
import { TOWN_PAINTINGS } from '../world/townStandIns.js';
import { BUILDING_TYPES } from '../world/buildingNames.js';

// Town packs place much of their furniture (classic ids 41000-43999) and paintings as scenery, not props.
// Ship cabins build decks and walls from the same models, so scenery is furniture only in a house.
export function isBasePieceModel(/** @type {{ objectType: number, modelIdNum: number }} */ p, /** @type {number} */ buildingType) {
  if (p.modelIdNum === LADDER_MODEL_ID || p.modelIdNum === MACHINERY_MODEL_ID) return false;
  if (p.objectType === PROP_MODEL_TYPE) return true;
  const house = buildingType === BUILDING_TYPES.HouseForSale || (buildingType >= BUILDING_TYPES.House1 && buildingType <= BUILDING_TYPES.House6);
  if (!house) return false;
  const id = classicModelIdOf(p.modelIdNum);
  return (id >= 41000 && id <= 43999 && id !== LADDER_MODEL_ID && id !== MACHINERY_MODEL_ID) || Object.hasOwn(TOWN_PAINTINGS, p.modelIdNum);
}

export const baseBucketOf = (key) => `base:${key}`;
export const INTERIOR_SHELL_BUCKET = 'interior';

/** @param {{ drawList: any[], batches: () => any[], lights: () => any[], collider: any }} deps */
export function createBaseRoom({ drawList, batches, lights, collider }) {
  /** @type {Map<string, any>} */
  const pieces = new Map();
  /** @type {Set<string>} */
  const stray = new Set();
  const drop = (list, x) => { const i = list.indexOf(x); if (i >= 0) list.splice(i, 1); };
  const holds = (p) => !!(p?.furniture && Array.isArray(p.furniture.items) && p.furniture.items.length);

  // A piece that holds items cannot be hidden; the host empties it into the owner's pack first.
  function hide(key) {
    const p = pieces.get(key);
    if (!p || p.hidden || holds(p)) return false;
    p.hidden = true;
    if (p.draw) { drop(drawList, p.draw); lateSolidsOf(collider)?.remove(baseBucketOf(key)); }
    // The host's furniture list is keyed by index, so a hidden piece keeps its entry, marked hidden.
    if (p.furniture) p.furniture.hidden = true;
    if (p.batch) drop(batches(), p.batch);
    if (p.light) drop(lights(), p.light);
    return true;
  }
  function show(key) {
    const p = pieces.get(key);
    if (!p || !p.hidden) return false;
    p.hidden = false;
    if (p.draw) {
      drawList.push(p.draw);
      // A piece put back around the player becomes solid only once the player is clear of it.
      if (p.cpu?.positions && p.cpu?.indices) lateSolidsOf(collider)?.add(baseBucketOf(key), p.cpu.positions, p.cpu.indices, p.matrix);
    }
    if (p.furniture) p.furniture.hidden = false;
    if (p.batch) batches().push(p.batch);
    if (p.light) lights().push(p.light);
    return true;
  }

  return {
    addModel(key, { model, draw, cpu, matrix, at, aabb = null }) {
      const bounds = aabb?.min && aabb?.max ? { min: aabb.min.slice(), max: aabb.max.slice() } : null;
      pieces.set(key, { key, model, flat: null, at, bounds, hidden: false, draw, cpu, matrix, furniture: null, batch: null, light: null });
    },
    addFlat(key, { flat, batch, light = null, at }) {
      pieces.set(key, { key, model: null, flat, at, hidden: false, draw: null, cpu: null, matrix: null, furniture: null, batch, light });
    },
    furnish(key, entry) { const p = pieces.get(key); if (p && entry) { p.furniture = entry; entry.baseKey = key; } },
    empty(key) { const p = pieces.get(key); return holds(p) ? p.furniture.items.splice(0) : []; },
    row(key) {
      const p = pieces.get(key);
      if (!p || p.hidden) return null;
      return { key: p.key, model: p.model, flat: p.flat, holds: holds(p) };
    },
    aimTargets() {
      const out = [];
      for (const p of pieces.values()) {
        if (p.hidden) continue;
        const aabb = p.bounds ?? (p.at ? { min: [p.at[0] - 0.4, p.at[1] - 0.4, p.at[2] - 0.4], max: [p.at[0] + 0.4, p.at[1] + 0.4, p.at[2] + 0.4] } : null);
        if (!aabb) continue;
        out.push({ key: baseBucketOf(p.key), aabb, distance: RAY_DISTANCE, reach: DEFAULT_ACTIVATION_DISTANCE, meshCollider: p.model != null, noSurface: p.model == null });
      }
      return out;
    },
    list() {
      return [...pieces.values()].map((p) => ({ key: p.key, model: p.model, flat: p.flat, at: p.at, hidden: p.hidden, holds: holds(p) }));
    },
    hide,
    show,
    hidden() {
      const out = new Set(stray);
      for (const p of pieces.values()) if (p.hidden) out.add(p.key);
      return [...out].sort();
    },
    setHidden(keys) {
      if (!Array.isArray(keys)) return false;
      const named = [...new Set(keys.filter((k) => typeof k === 'string' && DECOR_BASE_KEY_RE.test(k)))].slice(0, DECOR_HIDDEN_CAP);
      const want = decorHiddenOf(named) ?? [];
      const set = new Set(want);
      stray.clear();
      for (const k of set) if (!pieces.has(k)) stray.add(k);
      for (const p of pieces.values()) { if (set.has(p.key)) hide(p.key); else show(p.key); }
      return true;
    },
    outBatches() { return [...pieces.values()].filter((p) => p.hidden && p.batch).map((p) => p.batch); },
  };
}
