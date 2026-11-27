// @ts-check
import { classLookOf } from '../../world/travellerSprites.js';
import { lwRng, textSeed } from './seed.js';
import { generateItems as generateLootItems, enemyLootTableKey, createRandomWeapon, createRandomArmor } from '../../items/loot.js';
import { setItemFields, mintCondition, isAmmunition } from '../../items/itemTemplates.js';
import { goldStack } from '../../items/inventory.js';
import { mintKeepsake } from './keepsake.js';

export function livingRemainsLay(d, res, feet, key = res.id) {
  const look = classLookOf(res);
  const corpse = look?.basics?.corpseTexture;
  if (!corpse) return null;
  const level = Math.max(1, res.level | 0);
  // Seeded by the remains key so the same goods are laid each time, never rerolled.
  const rolls = lwRng(textSeed(key), 0x676f6f64);
  const items = generateLootItems(enemyLootTableKey(res.cls, look.basics.lootTableKey ?? '-'), { level, gender: res.sex ?? 'male' }, rolls);
  for (const raw of [createRandomWeapon(level, rolls), createRandomArmor(level, rolls)]) if (raw && !isAmmunition(raw)) items.push(mintCondition(setItemFields(raw)));
  items.push(goldStack(5 + Math.floor(rolls() * 20 * level)));
  items.push(mintKeepsake(res));
  return d.layRemains(items, feet, { archive: corpse.archive, record: corpse.record }, key);
}
