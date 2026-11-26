// @ts-check
import { isFurnishing, ownBackLines } from './decorFurnish.js';
import { applyTransfer } from '../items/itemTransfer.js';
import { addItem } from '../items/inventory.js';
import { t } from '../ui/textManager.js';

// `entity()` is read at each call because a load replaces the player's entity.
/** @param {() => any} entity */
export function createDecorPack(entity) {
  function decorHome(/** @type {any} */ item) {
    if (isFurnishing(item)) return (entity().furnishings ??= []);
    return (entity().items ??= []);
  }
  function decorPackTake(/** @type {any} */ item) {
    if (isFurnishing(item)) {
      const list = decorHome(item);
      const i = list.indexOf(item);
      if (i < 0) return null;
      list.splice(i, 1);
      return item;
    }
    const pack = entity().items ?? [];
    if (!pack.includes(item) || item?.equipSlot != null) return null;
    return applyTransfer(item, { ok: true, amount: 1 }, pack, [], { entity: entity(), fromLocal: true }) ?? null;
  }
  // Returns the record that holds the item now: a given-back candle joins the pack's stack, and an undo takes
  // from that stack.
  function decorPackGive(/** @type {any} */ item) {
    if (isFurnishing(item)) { decorHome(item).push(item); return item; }
    entity().items ??= [];
    return addItem(entity().items, item);
  }
  return { decorHome, decorPackTake, decorPackGive };
}

// Hands back own things a save-backed room keeps under ids it no longer places. This runs before the player is
// inside, so they go to the pack, not the floor.
/**
 * @param {any} room
 * @param {any[]} pieces
 * @param {(item: any) => void} give
 * @param {(line: string) => void} [say]
 */
export function returnUnstood(room, pieces, give, say) {
  const standing = new Set((pieces ?? []).map((p) => p?.id));
  const own = (room.ownIds?.() ?? []).filter((/** @type {string} */ id) => !standing.has(id)).map((/** @type {string} */ id) => room.takeOwn(id)).filter(Boolean);
  const back = [...own, ...(room.takeUnserved?.(pieces) ?? [])];
  for (const it of back) give(it);
  if (back.length) say?.(ownBackLines(back, (n) => t('decor.tool.strayBack', '{n, plural, one {An item from an unsaved piece is back in your pack.} other {# items from unsaved pieces are back in your pack.}}', { n })));
  return back;
}
