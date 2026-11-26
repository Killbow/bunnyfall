// @ts-check

import { ARROW_TEMPLATE, isSummoned, addItem } from '../items/inventory.js';

export const QUIVER_TEMPLATES = Object.freeze([ARROW_TEMPLATE]);

/** @param {any} it @param {number} template */
const counted = (it, template) => it?.templateIndex === template && !isSummoned(it) && !it.questItem;

/** @param {any[] | null | undefined} items */
export function markQuiver(items) {
  const mark = [];
  for (const template of QUIVER_TEMPLATES) {
    let count = 0, proto = null;
    for (const it of items ?? []) if (counted(it, template)) { count += Math.max(0, it.stackCount ?? 1); proto ??= it; }
    if (count > 0) mark.push({ template, count, proto: { ...proto } });
  }
  return mark;
}

/**
 * @param {any[] | null | undefined} items
 * @param {{ template: number, count: number, proto: any }[] | null | undefined} mark
 * @param {Map<number, number> | null | undefined} loosed
 */
export function refundQuiver(items, mark, loosed) {
  if (!Array.isArray(items) || !Array.isArray(mark)) return 0;
  let back = 0;
  for (const m of mark) {
    let now = 0;
    for (const it of items) if (counted(it, m.template)) now += Math.max(0, it.stackCount ?? 1);
    const owed = Math.min(m.count - now, loosed?.get(m.template) ?? 0);
    if (!(owed > 0)) continue;
    addItem(items, { ...m.proto, stackCount: owed });
    back += owed;
  }
  return back;
}
