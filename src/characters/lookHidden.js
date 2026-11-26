// @ts-check
const HIDEABLE_GROUPS = new Set(['Armor', 'MensClothing', 'WomensClothing']);

/** @param {any} item */
export const lookHideable = (item) => !!item && typeof item === 'object' && HIDEABLE_GROUPS.has(item.group);

/** @param {any} item */
export const lookHiddenOf = (item) => lookHideable(item) && item.lookHidden === true;

/** @param {any} item */
export function toggleLookHidden(item) {
  if (!lookHideable(item)) return false;
  if (item.lookHidden === true) delete item.lookHidden; else item.lookHidden = true;
  return item.lookHidden === true;
}

/**
 * @template T
 * @param {T[] | null | undefined} table
 * @returns {T[]}
 */
export function shownEquipTable(table) {
  if (!Array.isArray(table)) return /** @type {any} */ (table);
  if (!table.some(lookHiddenOf)) return table;
  return table.map((it) => (lookHiddenOf(it) ? /** @type {any} */ (null) : it));
}
