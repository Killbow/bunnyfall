import { isGrappleItem } from '../characters/heavyGearIds.js';

const RETIRED_TEMPLATES = new Set([560, 561, 562]);

/** Reserved template IDs from older saves. They cannot be used or minted. */
export const isRetiredItem = (item) => RETIRED_TEMPLATES.has(item?.templateIndex);

/** Quickslot keys encode group and template as their first two fields. */
export function retiredItemKey(key) {
  const [group, template, material] = key.split('|', 3);
  return group === 'Weapons' && material !== undefined && RETIRED_TEMPLATES.has(Number(template));
}

/** Remove retired records from placeable and carried item lists on hydration. A Grappling Hook saved as held (it was a
 *  held weapon until 2026-11-25, a carried tool now) is put back in the pack. */
export function removeRetiredItems(list) {
  for (let i = list.length - 1; i >= 0; i--) {
    if (isRetiredItem(list[i])) list.splice(i, 1);
    else if (isGrappleItem(list[i])) delete list[i].equipSlot;
  }
}
