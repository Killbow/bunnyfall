#!/usr/bin/env node
// Writes src/poi/poiItemChoices.js with the items the POI editors offer in their item pickers, computed from the item
// law as the account service loads it. Because the browser registers extra templates (such as Humanoid Corpse) that
// the service does not know, the list is generated here and verified by tools/poiItemChoices.test.mjs. An item is
// included when staffGive.js mintGift mints it without findings, poiTradeProblems accepts it, and it has a name and a
// non-Currency item group (leaving out bound items and gold).
//   node tools/poiItemChoices.mjs           write the file
//   node tools/poiItemChoices.mjs --check   exit 1 when the file differs from what the law gives now
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../src/poi/poiItemChoices.js', import.meta.url));

/** Returns the `[template, group, name]` rows allowed by the item and trade laws, sorted by group and name. */
export async function lawItemChoices() {
  const { lawTemplate, templateGroups } = await import('../src/systems/item/itemLaw.js');
  const { ITEM_TEMPLATES } = await import('../src/systems/item/itemTemplates.js');
  const { POI_V2_PINS } = await import('../src/poi/poiLawV2.js');
  const { mintGift } = await import('../server-account/src/staffGive.js');
  const { poiTradeProblems } = await import('../src/poi/poiTradeLaw.js');
  const rows = [];
  for (let i = 0; i <= POI_V2_PINS.decorTemplateMax; i++) {
    const row = lawTemplate(i);
    const name = ITEM_TEMPLATES[i]?.name ?? row?.name;
    if (!row || row.bound || !name) continue;
    const group = templateGroups(i)[0];
    if (!group || group === 'Currency') continue;
    const gift = mintGift({ template: i, group });
    if (gift.error || gift.findings.length) continue;
    const doc = { v: 2, events: [{ key: 'e', name: 'E', trigger: { k: 'chained' }, then: [{ k: 'give_item', item: { template: i, count: 1 } }] }] };
    if (poiTradeProblems(doc).length) continue;
    rows.push([i, group, name]);
  }
  return rows.sort((a, b) => a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]));
}

/** Formats the generated module source for `rows`. */
export function moduleText(rows) {
  return `// @ts-check
// Written by tools/poiItemChoices.mjs; do not edit. Lists the items the POI editors offer in their item pickers as
// [template, item group, name], sorted by group and name, covering the items the account service mints as POI gifts.

/** @type {ReadonlyArray<[number, string, string]>} */
export const POI_ITEM_CHOICES = Object.freeze(/** @type {[number, string, string][]} */ ([
${rows.map((r) => `  [${r[0]}, ${JSON.stringify(r[1])}, ${JSON.stringify(r[2])}],`).join('\n')}
]));
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const text = moduleText(await lawItemChoices());
  if (process.argv.includes('--check')) {
    const same = readFileSync(OUT, 'utf8') === text;
    console.log(same ? 'poiItemChoices.js matches the item law' : 'poiItemChoices.js differs from the item law: run node tools/poiItemChoices.mjs');
    process.exit(same ? 0 : 1);
  }
  writeFileSync(OUT, text);
  console.log(`wrote ${OUT}`);
}
