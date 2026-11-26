import { LANTERN_TEMPLATE, lanternAtWaist } from '../player/playerTorch.js';

// There is no equip slot for a light: the belt slot is a beltLantern flag on the item, saved with it.
export const isLanternItem = (item) => !!item && item.templateIndex === LANTERN_TEMPLATE;

export function beltLanternOf(entity) {
  for (const it of entity?.items ?? []) if (it?.beltLantern === true && isLanternItem(it)) return it;
  return null;
}

export function waistLanternOf(entity) {
  const lit = entity?.lightSource;
  return lanternAtWaist(lit) ? lit : beltLanternOf(entity);
}

export function hangBeltLantern(entity, item) {
  if (!isLanternItem(item) || !(entity?.items ?? []).includes(item)) return false;
  for (const it of entity.items) if (it !== item && it?.beltLantern) delete it.beltLantern;
  item.beltLantern = true;
  return true;
}

export function unhangBeltLantern(item) {
  if (!item?.beltLantern) return false;
  delete item.beltLantern;
  return true;
}
