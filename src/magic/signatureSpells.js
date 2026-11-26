// @ts-check
// signatureSpell builds a fresh record on each call, because buying a spell copies the record shallowly.

import { buildCustomSpell } from './spellMaker.js';
import { PATH_BY_ID, pathHeld } from '../characters/arcanePaths.js';

export function signatureSpell(id) {
  const p = PATH_BY_ID[id];
  if (!p) return null;
  const s = p.spell;
  // The record keeps the English name; the name is translated only when shown.
  return { ...buildCustomSpell({ slots: s.slots.map((x) => ({ ...x, settings: { ...x.settings } })), rangeType: s.rangeType, element: s.element, name: s.nameEn, icon: s.icon, index: s.index }), path: p.id };
}

export function signatureOffers(entity) {
  const p = pathHeld(entity);
  const sp = p ? signatureSpell(p.id) : null;
  return sp ? [sp] : [];
}
