// @ts-check

// Rows and the gem find register at import; every host imports this so the rows exist before a save loads.
import { registerCustomTemplates, templateByIndex, mintCondition, setItemFields } from './itemTemplates.js';
import {
  GEM_IDS, GEM_ROW_GRADES, GEM_GRADES, GEM_NAMES, GEM_GRADE_TEMPLATES, gemId, gemTemplateOf, registerGemFind,
  SOURCE_MULT, luckMult, lootRarityOn,
} from './lootRarity.js';
import { GEM_GRADE_PRICE, gradedGemPrice } from './gemGrades.js';

export { GEM_GRADE_PRICE };
export const GEM_GRADE_RARITY = Object.freeze({ chipped: -2, flawed: -1, plain: 0, flawless: 3, perfect: 6 });
export const GEM_GRADE_ROWS = Object.freeze(GEM_ROW_GRADES.flatMap((grade) => GEM_IDS.map((kind, k) => {
  const dfu = /** @type {any} */ (templateByIndex(k));
  return Object.freeze({
    index: /** @type {number} */ (gemTemplateOf(gemId(kind, grade))),
    name: GEM_NAMES[gemId(kind, grade)],
    baseWeight: dfu.baseWeight,
    hitPoints: dfu.hitPoints,
    basePrice: gradedGemPrice(dfu.basePrice, grade),
    enchantmentPoints: dfu.enchantmentPoints,
    rarity: Math.max(1, Math.min(20, dfu.rarity + GEM_GRADE_RARITY[grade])),
    isIngredient: true,
    worldTextureArchive: dfu.worldTextureArchive,
    worldTextureRecord: dfu.worldTextureRecord,
  });
})));
registerCustomTemplates(GEM_GRADE_ROWS);
export const isGradedGemTemplate = (/** @type {number} */ t) => GEM_GRADE_TEMPLATES.includes(t);

export function mintGem(/** @type {string} */ id) {
  const t = gemTemplateOf(id);
  return t == null ? null : mintCondition(setItemFields({ group: 'Gems', templateIndex: t }));
}

export const GEM_FIND = Object.freeze({ base: 10, perTier: 2, cap: 50 });
export const GEM_GRADE_BANDS = Object.freeze([
  Object.freeze({ tier: 0, weights: Object.freeze([70, 30, 0, 0, 0]) }),
  Object.freeze({ tier: 5, weights: Object.freeze([30, 50, 20, 0, 0]) }),
  Object.freeze({ tier: 10, weights: Object.freeze([0, 30, 45, 25, 0]) }),
  Object.freeze({ tier: 15, weights: Object.freeze([0, 0, 35, 50, 15]) }),
  Object.freeze({ tier: 20, weights: Object.freeze([0, 0, 0, 60, 40]) }),
]);
export const GEM_BOSS_TIERS = 4;
export function gemFindChance({ kind = 'corpse', tier = 0, boss = false, luck = 50 } = {}) {
  if (!lootRarityOn()) return 0;
  const mult = boss ? SOURCE_MULT.boss : (SOURCE_MULT[kind] ?? 1);
  return Math.max(0, Math.min(GEM_FIND.cap, (GEM_FIND.base + GEM_FIND.perTier * Math.max(0, tier)) * mult * luckMult(luck)));
}
export function gemGradeBand({ tier = 0, boss = false } = {}) {
  const t = Math.max(0, tier | 0) + (boss ? GEM_BOSS_TIERS : 0);
  let band = GEM_GRADE_BANDS[0];
  for (const b of GEM_GRADE_BANDS) if (t >= b.tier) band = b;
  return band;
}
export function rollGem(source, rolls = Math.random) {
  const { weights } = gemGradeBand(source);
  const total = weights.reduce((n, w) => n + w, 0);
  let r = rolls() * total, g = 0;
  while (g < weights.length - 1 && r >= weights[g]) { r -= weights[g]; g++; }
  const kind = GEM_IDS[Math.min(GEM_IDS.length - 1, Math.floor(rolls() * GEM_IDS.length))];
  return mintGem(gemId(kind, GEM_GRADES[g]));
}
export function rollGemFind(source, rolls = Math.random) {
  const chance = gemFindChance(source ?? {});
  if (!(chance > 0) || !(rolls() * 1000 < chance)) return [];
  const gem = rollGem(source ?? {}, rolls);
  return gem ? [gem] : [];
}
// The gem find is a door's last draw, so every draw before it keeps its seed.
registerGemFind(rollGemFind);

export const BOSS_GEMS = Object.freeze({ gate: 1, serpent: 1, abyss: 2 });
export const BOSS_GEM_SOURCE = Object.freeze({ tier: 21, boss: true });
export function bossGems(/** @type {string} */ boss, rolls = Math.random) {
  // Boss gems are the spoils' last draws, so skipping them moves nothing before them.
  if (!lootRarityOn()) return [];
  const out = [];
  for (let i = 0; i < (BOSS_GEMS[boss] ?? 0); i++) { const g = rollGem(BOSS_GEM_SOURCE, rolls); if (g) out.push(g); }
  return out;
}
