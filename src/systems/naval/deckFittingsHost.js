// @ts-check
import { PrefabNode } from '../../world/prefabNode.js';
import { quatAngleAxis } from '../../world/quat.js';
import { createDaggerfallMeshGameObject } from './comeSailAwayBoat.js';
import { fittingsKey, yawDegrees } from './deckFittings.js';

export const DECK_FITTINGS_NODE = 'DeckFittings';
const UP = Object.freeze([0, 1, 0]);

/**
 * @param {any} boat
 * @param {{ m: number, x: number, z: number, yaw: number }[]} list
 * @param {{ ctx: any, deck: any }} o
 */
export function standFittings(boat, list, { ctx, deck }) {
  const frame = boat?.MeshObject;
  if (!frame) return false;
  const old = frame.children.find((c) => c.name === DECK_FITTINGS_NODE);
  if (old) old.setParent(null);
  if (!list.length) return true;
  const root = new PrefabNode(DECK_FITTINGS_NODE).setParent(frame);
  let all = true;
  for (const f of list) {
    const b = ctx.modelBounds?.(f.m);
    if (!b) { all = false; continue; }
    const y = deck?.heightAt?.(f.x, f.z);
    if (!Number.isFinite(y)) continue;
    const node = new PrefabNode(`Fitting-${f.m}`, { position: [f.x, y, f.z], rotation: quatAngleAxis(yawDegrees(f.yaw), UP) }).setParent(root);
    const mesh = createDaggerfallMeshGameObject(ctx, f.m, node);
    mesh.localPosition = [-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2];
    mesh.localRotation = [0, 0, 0, 1];
    mesh.localScale = [1, 1, 1];
  }
  return all;
}

/** @type {any[]} */
const NO_FITTINGS = /** @type {any} */ (Object.freeze([]));
/**
 * @param {any[]} boats
 * @param {(boat: any) => any[] | null | undefined} fittingsOf
 * @param {{ ctx: any, deckOf: (hull: number) => any, load: (model: number) => void }} o
 */
export function fitBoats(boats, fittingsOf, { ctx, deckOf, load }) {
  for (const boat of boats) {
    const list = fittingsOf(boat) ?? NO_FITTINGS;
    if (!list.length) {
      if (boat._fitted == null || boat._fitted === '') { boat._fitted = ''; continue; }
    } else if (list === boat._fitList && boat._fitted === boat._fitKey) continue;
    const key = list === boat._fitList ? boat._fitKey : fittingsKey(list);
    boat._fitList = list; boat._fitKey = key;
    if (boat._fitted === key) continue;
    let loaded = 0;
    // Each model is requested, loaded or not: the request pins it, so a house releasing its hold never frees it.
    for (const f of list) { load(f.m); if (ctx.modelBounds?.(f.m)) loaded++; }
    const stage = `${key}#${loaded}`;
    // While a model loads, the boat is fitted again only when another model arrives, never every frame.
    if (boat._fitStage === stage) continue;
    const deck = list.length ? deckOf(boat.hull) : null;
    if (list.length && !deck) continue;
    boat._fitStage = stage;
    if (standFittings(boat, list, { ctx, deck })) boat._fitted = key;
  }
}
