import { isGrappleItem, GRAPPLE_TEMPLATE } from '../characters/heavyGearIds.js';

const RETIRED_TEMPLATES = new Set([560, 561, 562]);

/** Reserved template IDs from older saves. They cannot be used or minted. */
export const isRetiredItem = (item) => RETIRED_TEMPLATES.has(item?.templateIndex);

/** Quickslot keys encode group and template as their first two fields. */
export function retiredItemKey(key) {
  const [group, template, material] = key.split('|', 3);
  return group === 'Weapons' && material !== undefined && RETIRED_TEMPLATES.has(Number(template));
}

/** A Grappling Hook's quickslot key. The hook has its own key, so a load drops it from the swap slot and the bar. */
export function hookItemKey(key) {
  const [group, template, material] = key.split('|', 3);
  return group === 'Weapons' && material !== undefined && Number(template) === GRAPPLE_TEMPLATE;
}

/** Remove retired records from placeable and carried item lists on hydration, and move a hook saved as equipped back
 *  to the pack. */
export function removeRetiredItems(list) {
  for (let i = list.length - 1; i >= 0; i--) {
    if (isRetiredItem(list[i])) list.splice(i, 1);
    else if (isGrappleItem(list[i])) delete list[i].equipSlot;
  }
}
