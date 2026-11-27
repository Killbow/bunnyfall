import { needsRestock } from '../trade/shopStock.js';

export function containerPreviewItems(key, containers, { owned = false, shut = false, hall = false, today = 0, unborn = false } = {}) {
  if (typeof key !== 'string' || !key.startsWith('container:')) return null;
  // An online stranger's cupboard this client has not opened holds an unconfirmed roll, so it lists nothing.
  if (shut || hall || unborn) return null;
  const c = containers?.[Number(key.slice('container:'.length))];
  if (!c || !Array.isArray(c.items)) return null;
  // Owned storage keeps stockedDate 1, which needsRestock treats as stale, so it skips the restock test.
  if (!owned && needsRestock(c, today)) return null;
  return c.items;
}

export function decorPreviewItems(key, { pieceOf = null, itemsOf = null, shut = false, hall = false } = {}) {
  if (typeof key !== 'string' || !key.startsWith('decor:')) return null;
  const id = key.slice('decor:'.length);
  const piece = pieceOf?.(id);
  if (!piece?.storage) return null;
  if (hall || shut) return null;
  const items = itemsOf?.(id);
  return Array.isArray(items) ? items : null;
}

export function interiorHeldPreview(key, bag = {}) {
  if (typeof key !== 'string') return null;
  if (key.startsWith('container:')) return containerPreviewItems(key, bag.containers, bag);
  if (key.startsWith('decor:')) return decorPreviewItems(key, bag);
  return null;
}

export function createInteriorPeek({ containers, decor, owned, shut, hall, today, unborn = () => false }) {
  return (key) => {
    if (typeof key !== 'string' || (!key.startsWith('container:') && !key.startsWith('decor:'))) return null;
    const inHall = !!hall();
    return interiorHeldPreview(key, {
      containers: containers(), pieceOf: (id) => decor()?.pieceOf(id), itemsOf: (id) => decor()?.itemsOf(id),
      owned: owned(), shut: shut(), hall: inHall, today: today(), unborn: !owned() && !!unborn(key),
    });
  };
}
