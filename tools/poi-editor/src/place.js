// @ts-check

// Placing a catalogue asset in a document: which row it becomes, or why it cannot be placed yet.
// A kind of asset that has no working path to the game says so plainly and stays unplaceable.

import { ITEM_GROUPS } from '../../../src/characters/equipRules.js';
import { POI_V2_PINS as P, POI_V2_LIMITS } from '../../../src/poi/poiLawV2.js';
import { freshKey } from './scene.js';

const TROPHY_TEMPLATE = P.trophyTemplate ?? 0;

/** Why an asset cannot be placed in this milestone, or null when it can. @param {any} a */
export function whyNotPlaceable(a) {
  if (a.namespace === 'df-arch3d') return null;
  if (a.namespace === 'df-flat') return a.archive < 172 ? 'This picture wraps models and walls. It is not a standing picture.' : null;
  if (a.namespace === 'paperdoll-item') return a.template === undefined ? 'This item has no template.' : null;
  if (a.namespace === 'entity') return a.id.startsWith('entity:foe-') ? 'Creatures are placed in encounters, which come with the DM tools.' : 'House stations belong to house decoration, not to a POI.';
  if (a.namespace === 'repo-3d') return 'Vendored models need a mesh import, which is not built yet.';
  return 'This kind of asset is not placeable.';
}

const base = (key, name, at) => ({ key, name, t: at.map((c) => Math.round(c * 1000) / 1000) });

/**
 * Put an asset into the document at `at` (the POI's frame). Answers `{ id }` for the new node or `{ refused }`.
 * @param {any} doc @param {any} a a catalogue asset @param {number[]} at @param {string | null} [group]
 */
export function placeAsset(doc, a, at, group = null) {
  const why = whyNotPlaceable(a);
  if (why) return { refused: why };
  const withGroup = (row) => { if (group && (doc.groups ?? []).some((g) => g.key === group)) row.group = group; return row; };
  if (a.namespace === 'df-arch3d') {
    doc.parts ??= [];
    if (doc.parts.length >= 128) return { refused: 'A POI holds at most 128 parts.' };
    const key = freshKey(`model-${a.modelId}`, new Set(doc.parts.map((p) => p.key)));
    doc.parts.push(withGroup({ ...base(key, a.name, at), arch3d: a.modelId, r: [0, 0, 0, 1], s: [1, 1, 1], collide: 'mesh', shadow: true }));
    return { id: `part:${key}` };
  }
  doc.flats ??= [];
  if (doc.flats.length >= POI_V2_LIMITS.flats) return { refused: `A POI holds at most ${POI_V2_LIMITS.flats} flat pictures.` };
  const key = freshKey(a.namespace === 'df-flat' ? `flat-${a.archive}-${a.record}` : `item-${a.template}`, new Set(doc.flats.map((f) => f.key)));
  /** @type {any} */
  let row;
  if (a.namespace === 'df-flat') row = { ...base(key, a.name, at), kind: 'billboard', flat: [a.archive, a.record], rot: [0, 0, 0], scale: 1, layer: 0, collide: false };
  else {
    const g = ITEM_GROUPS[/** @type {keyof typeof ITEM_GROUPS} */ (a.category)];
    const item = { t: a.template, ...(Number.isInteger(g) && g >= 0 ? { g } : {}) };
    const mount = item.t === TROPHY_TEMPLATE || (g === P.decorWeaponsGroup && item.t !== P.decorArrowTemplate) || g === P.decorArmorGroup;
    row = { ...base(key, a.name, at), kind: mount ? 'mount' : 'paperdoll', item, rot: [0, 0, 0], scale: 1, layer: 0, collide: false };
  }
  doc.flats.push(withGroup(row));
  return { id: `flat:${key}` };
}
