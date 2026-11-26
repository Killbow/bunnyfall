import { isGrappleItem, GRAPPLE_TEMPLATE } from '../characters/heavyGearIds.js';

// Retired weapon template indexes that older saves can still hold.
const RETIRED_TEMPLATES = new Set([560, 561, 562]);

export const isRetiredItem = (item) => RETIRED_TEMPLATES.has(item?.templateIndex);

export function retiredItemKey(key) {
  const [group, template, material] = key.split('|', 3);
  return group === 'Weapons' && material !== undefined && RETIRED_TEMPLATES.has(Number(template));
}

export function hookItemKey(key) {
  const [group, template, material] = key.split('|', 3);
  return group === 'Weapons' && material !== undefined && Number(template) === GRAPPLE_TEMPLATE;
}

export function removeRetiredItems(list) {
  for (let i = list.length - 1; i >= 0; i--) {
    if (isRetiredItem(list[i])) list.splice(i, 1);
    else if (isGrappleItem(list[i])) delete list[i].equipSlot;
  }
}
