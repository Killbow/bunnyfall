// 565 the grappling hook, an item until 2026-11-25: it is a tool every character carries now (combat/grapple/grapple.js)
const RETIRED_TEMPLATES = new Set([560, 561, 562, 565]);

/** Reserved template IDs from older saves. They cannot be used or minted. */
export const isRetiredItem = (item) => RETIRED_TEMPLATES.has(item?.templateIndex);

/** Quickslot keys encode group and template as their first two fields. */
export function retiredItemKey(key) {
  const [group, template, material] = key.split('|', 3);
  return group === 'Weapons' && material !== undefined && RETIRED_TEMPLATES.has(Number(template));
}

/** Remove retired records from placeable and carried item lists on hydration. */
export function removeRetiredItems(list) {
  for (let i = list.length - 1; i >= 0; i--) {
    if (isRetiredItem(list[i])) list.splice(i, 1);
  }
}
