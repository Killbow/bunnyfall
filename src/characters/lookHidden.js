// @ts-check
// BUNNYFALL (2026-11-12, a player: "I kinda like the dynamic look of different pieces of gear as I change things out.
// However, there's fashion and then there's reality... Could we have a toggle to hide individual pieces of gear like
// other games do?"; the owner: on the inventory paperdoll, armour and clothing): HIDDEN GEAR. A worn piece of armour,
// clothing or a shield can be hidden: it is still worn - its armour, warmth, enchantments and weight all count - but no
// picture draws it: not the paperdoll, not the Morrowind or sprite body, not the portrait, and not the look other players
// get (net/remotePlayers.js composeLook leaves it out, so no wire or relay change). The switch is the item's own field
// (`lookHidden`, systems/item/itemFields.js), so it rides the save and stays with the piece. Weapons never hide.
// A LEAF: imports nothing, so the renderers can all read it.

/** The groups a piece can be hidden in: what the body draws as armour or clothes (a shield is Armor). */
const HIDEABLE_GROUPS = new Set(['Armor', 'MensClothing', 'WomensClothing']);

/** Whether this piece can be hidden at all. @param {any} item */
export const lookHideable = (item) => !!item && typeof item === 'object' && HIDEABLE_GROUPS.has(item.group);

/** Whether a worn piece is hidden from every picture. @param {any} item */
export const lookHiddenOf = (item) => lookHideable(item) && item.lookHidden === true;

/** Hide it, or show it again. Answers whether it is hidden now. @param {any} item */
export function toggleLookHidden(item) {
  if (!lookHideable(item)) return false;
  if (item.lookHidden === true) delete item.lookHidden; else item.lookHidden = true;
  return item.lookHidden === true;
}

/** An equip table as the pictures read it: a copy with every hidden piece taken out (its slot empty). The table itself is
 *  never changed - the game still reads every piece. @template T @param {T[] | null | undefined} table @returns {T[]} */
export function shownEquipTable(table) {
  if (!Array.isArray(table)) return /** @type {any} */ (table);
  if (!table.some(lookHiddenOf)) return table;
  return table.map((it) => (lookHiddenOf(it) ? /** @type {any} */ (null) : it));
}
