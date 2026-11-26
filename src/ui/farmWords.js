// BUNNYFALL FARM EXPANSION: the farm's words - the improvements' names and effects, said by the fixtures that show them
// (docs/FARM-EXPANSION.md section 3.6). Kept from the old Progress & orders sidebar, which the farm itself replaced.
import { t } from './textManager.js';

export const farmUpgradeName = (key, tier) => ({
  tools: [t('farm.progress.tools1', 'Tempered tools'), t('farm.progress.tools2', 'Masterwork tools'), t('farm.progress.tools3', 'Legendary tools')],
  irrigation: [t('farm.progress.water1', 'Irrigation channels'), t('farm.progress.water2', 'Living irrigation')],
  soil: [t('farm.progress.soil1', 'Compost beds'), t('farm.progress.soil2', 'Rich loam'), t('farm.progress.soil3', 'Black earth')],
})[key]?.[tier];
export const farmUpgradeEffect = (key, tier) => ({
  tools: [t('farm.progress.area3', 'Work up to 3 nearby beds per click.'), t('farm.progress.area5', 'Work up to 5 nearby beds per click.'), t('farm.progress.area9', 'Work a whole 3x3 block of beds per click, 9 at most.')],
  irrigation: [t('farm.progress.autoWater', 'New seeds are watered automatically.'), t('farm.progress.autoPlant', 'Harvest replants and waters the same crop.')],
  soil: [t('farm.progress.yield1', 'New crops yield 1 extra item.'), t('farm.progress.yield2', 'New crops yield 2 extra items and grow 25% faster.'), t('farm.progress.yield3', 'New crops yield 3 extra items and grow 50% faster.')],
})[key]?.[tier];
