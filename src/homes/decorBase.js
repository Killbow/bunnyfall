// @ts-check
// ═══════════════════════════════════════════════════════════════════
// BASE-HIDE (2026-09-26) — THE ROOM'S OWN FURNITURE, ONE PIECE AT A TIME.
//
// Mac: "Remove bought houses decor - the base game decor isnt easy to
// decorate around when u want more in depth house". What Daggerfall
// furnished a room with is its furniture models and flats. A room is
// normally built from them in one merge (one static batch, one collider
// bucket, the flats grouped by picture - scenes/interiorContext.js). A
// room its owner may furnish is built piece by piece instead. Each
// furniture model gets its own draw and collider bucket (`base:<key>`),
// and each flat its own batch and light. The pieces are handed in here,
// so the owner can take one out and put it back while in the room.
// Every visit and every visitor builds the room the same way, from the
// list of what is out (the save's, or the account service's).
//
// A piece is named by the layout (net/decorLaw.js DECOR_BASE_KEY_RE):
// `m<placement>:<model>`, `f<flat>:<archive>.<record>`. Taking one out
// removes its draw, its collider, and its light. A piece the player can
// use, such as a cupboard, a bed, or a chair, also leaves the room's
// targets. The host lists are keyed by index, so its entry stays, marked
// `hidden`. hide() refuses a piece that holds anything, so the caller
// empties it into the owner's pack first.
// ═══════════════════════════════════════════════════════════════════

import { DECOR_BASE_KEY_RE, DECOR_HIDDEN_CAP, decorHiddenOf } from '../net/decorLaw.js';
import { lateSolidsOf } from '../player/lateSolid.js';   // DECOR-CLEAR: a piece put back round the body is withheld until it is clear
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

/** A built-in model's collider bucket - its own, so a piece taken out is nothing to walk into. */
export const baseBucketOf = (key) => `base:${key}`;
/** The collider bucket the room's own shell stands in - its walls, floors and ceilings (interiorContext.js); HOME-DOORS
 *  looks for doorways in it alone. */
export const INTERIOR_SHELL_BUCKET = 'interior';

/**
 * THE ROOM'S OWN PIECES. `drawList` - the room's draw list; `batches()`, `lights()` - its billboard batches and its
 * lights (the host draws and lights from all three every frame; the last two are built after the models, so they are
 * read when asked); `collider` - the room's collider (addMesh / removeBucket). DECOR-CLEAR: a model put back goes into
 * the collider through its one gate (player/lateSolid.js) - put back round the player, it draws and is solid only once
 * they are clear of it; the gate's body, and its asking every frame, are the room's placed pieces' draw over the same
 * collider (decorRoom.js draw, the host's `body`).
 * @param {{ drawList: any[], batches: () => any[], lights: () => any[], collider: any }} deps
 */
export function createBaseRoom({ drawList, batches, lights, collider }) {
  /** @type {Map<string, any>} */
  const pieces = new Map();
  /** names the room was told to keep out that it does not have (a layout its data set lays otherwise): kept, unread */
  /** @type {Set<string>} */
  const stray = new Set();
  const drop = (list, x) => { const i = list.indexOf(x); if (i >= 0) list.splice(i, 1); };
  const holds = (p) => !!(p?.furniture && Array.isArray(p.furniture.items) && p.furniture.items.length);

  function hide(key) {
    const p = pieces.get(key);
    if (!p || p.hidden || holds(p)) return false;
    p.hidden = true;
    if (p.draw) { drop(drawList, p.draw); lateSolidsOf(collider)?.remove(baseBucketOf(key)); }   // DECOR-CLEAR: or its triangles withheld
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
      // DECOR-CLEAR: through the collider's gate - put back round the body it guards, solid once the body is clear of it
      if (p.cpu?.positions && p.cpu?.indices) lateSolidsOf(collider)?.add(baseBucketOf(key), p.cpu.positions, p.cpu.indices, p.matrix);
    }
    if (p.furniture) p.furniture.hidden = false;
    if (p.batch) batches().push(p.batch);
    if (p.light) lights().push(p.light);
    return true;
  }

  return {
    /** A model as the build placed it: its draw entry (never the merge), its geometry, where it is. */
    addModel(key, { model, draw, cpu, matrix, at, aabb = null }) {
      const bounds = aabb?.min && aabb?.max ? { min: aabb.min.slice(), max: aabb.max.slice() } : null;
      pieces.set(key, { key, model, flat: null, at, bounds, hidden: false, draw, cpu, matrix, furniture: null, batch: null, light: null });
    },
    /** A flat as the build stood it: its own batch, and the light it gives (null: none). */
    addFlat(key, { flat, batch, light = null, at }) {
      pieces.set(key, { key, model: null, flat, at, hidden: false, draw: null, cpu: null, matrix: null, furniture: null, batch, light });
    },
    /** The cupboard, the shelf or the bed a model is - the entry in the host's index-keyed list. */
    furnish(key, entry) { const p = pieces.get(key); if (p && entry) { p.furniture = entry; entry.baseKey = key; } },
    /** BUNNYFALL (2026-11-04, the owner: "Some default house furniture couldn't be removed"): what a piece holds, taken
     *  out of it (its list left empty) - the host hands it to the owner's pack, and the piece can then be taken out. */
    empty(key) { const p = pieces.get(key); return holds(p) ? p.furniture.items.splice(0) : []; },
    /** One piece the crosshair can name, or null once it is out of the room. */
    row(key) {
      const p = pieces.get(key);
      if (!p || p.hidden) return null;
      return { key: p.key, model: p.model, flat: p.flat, holds: holds(p) };
    },
    /** The eye's targets while decorating: each piece still in the room, under its own collider bucket. */
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
    /** Every piece, in the layout's order: its name, what it is, where it stands, whether it is out, whether it holds. */
    list() {
      return [...pieces.values()].map((p) => ({ key: p.key, model: p.model, flat: p.flat, at: p.at, hidden: p.hidden, holds: holds(p) }));
    },
    hide,
    show,
    /** The list the room keeps taken out - every piece out, and the names it was told to keep that it does not have. */
    hidden() {
      const out = new Set(stray);
      for (const p of pieces.values()) if (p.hidden) out.add(p.key);
      return [...out].sort();
    },
    /** The room as the save or the account service keeps it: every named piece out, every other back - a name the law
     *  does not take is no name, and no more than the cap is kept. Anything but a list changes nothing. */
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
    /** The batches of the flats taken out - out of the room's list, so its teardown does not see them. */
    outBatches() { return [...pieces.values()].filter((p) => p.hidden && p.batch).map((p) => p.batch); },
  };
}
