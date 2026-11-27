import { registerEnemyDeathHandler } from '../../characters/corpseMarker.js';
import { MOBILE_TYPES } from '../../characters/mobileTypes.js';
import { TEMPLATE } from './food.js';
import { createSurvivalItem, spoilFood } from './items.js';
import { isClassEnemyId } from '../../characters/enemyBasics.js';

export const SURVIVAL_LOOT_HANDLER = 'survival';
export const MEAT_BY_TYPE = Object.freeze({
  [MOBILE_TYPES.Rat]: [1, 1], [MOBILE_TYPES.GiantBat]: [1, 1], [MOBILE_TYPES.GrizzlyBear]: [6, 10],
  [MOBILE_TYPES.SabertoothTiger]: [4, 8], [MOBILE_TYPES.Spider]: [2, 2], [MOBILE_TYPES.GiantScorpion]: [2, 3],
});
export const FISH_BY_TYPE = Object.freeze({ [MOBILE_TYPES.Slaughterfish]: [2, 3] });
export const DEFAULT_ANIMAL_MEAT = Object.freeze([1, 2]);
export const HUMANOID_FOOD_ABOVE = 17;
export const HUMANOID_SECOND_ABOVE = 19;

const luckMod = (luck) => Math.trunc((luck ?? 50) / 10);
const range = (min, max, rolls) => min + Math.floor(rolls() * (max - min + 1));

export const ANIMAL_LOOT_SCALE = 0.5;
export const HUMANOID_FOOD_SCALE = 0.5;
function scaledCount(n, scale, rolls) {
  if (n <= 0) return n;
  const scaled = n * scale;
  const whole = Math.floor(scaled);
  const frac = scaled - whole;
  return frac > 0 && rolls() < frac ? whole + 1 : whole;
}

export const isAnimal = (entity) => entity?.basics?.affinity === 'Animal' || entity?.mobileType === MOBILE_TYPES.Slaughterfish;
export const isHumanoid = (entity) => isClassEnemyId(entity?.mobileType ?? 0) || entity?.basics?.team === 'Orcs' || entity?.basics?.affinity === 'Human' || entity?.mobileType === MOBILE_TYPES.Centaur;

export function corpseFood(entity, { luck = 50, rolls = Math.random } = {}) {
  const out = [];
  if (!entity) return out;
  const lm = luckMod(luck);
  if (isAnimal(entity)) {
    const id = entity.mobileType;
    const fish = FISH_BY_TYPE[id];
    const [min, max] = fish ?? MEAT_BY_TYPE[id] ?? DEFAULT_ANIMAL_MEAT;
    const n = scaledCount(range(min, max + Math.max(0, lm - 5), rolls), ANIMAL_LOOT_SCALE, rolls);
    for (let i = 0; i < n; i++) {
      const item = createSurvivalItem(fish ? TEMPLATE.RawFish : TEMPLATE.RawMeat);
      if (item && rolls() < 0.5) spoilFood(item);
      if (item) out.push(item);
    }
    return out;
  }
  if (isHumanoid(entity)) {
    const roll = range(1, 20, rolls) + lm - 5;
    if (roll > HUMANOID_FOOD_ABOVE) out.push(humanoidFood(rolls));
    if (roll > HUMANOID_SECOND_ABOVE) out.push(humanoidFood(rolls));
    out.length = scaledCount(out.length, HUMANOID_FOOD_SCALE, rolls);
  }
  return out.filter(Boolean);
}

export function humanoidFood(rolls = Math.random) {
  const r = range(1, 10, rolls);
  if (r <= 4) return createSurvivalItem(TEMPLATE.Rations, { stackCount: range(1, 3, rolls) });
  if (r === 5) return createSurvivalItem(TEMPLATE.Meat);
  if (r === 6) return createSurvivalItem(TEMPLATE.CookedFish);
  if (r <= 8) return createSurvivalItem(TEMPLATE.Bread);
  if (r === 9) return createSurvivalItem(rolls() < 0.5 ? TEMPLATE.Apple : TEMPLATE.Orange);
  return createSurvivalItem(TEMPLATE.Waterskin, { water: 1.0 });
}

let _installed = false;
let _enabled = () => false;
export function addCorpseFood(entity, opts = {}) {
  if (!_enabled() || !entity || !Array.isArray(entity.items)) return 0;
  const luck = opts.luck ?? 50;
  const before = entity.items.length;
  for (const item of corpseFood(entity, { luck, rolls: opts.rolls ?? Math.random })) entity.items.push(item);
  return entity.items.length - before;
}
export function installSurvivalLoot({ enabled = () => true } = {}) {
  if (_installed) return false;
  _installed = true;
  _enabled = enabled;
  registerEnemyDeathHandler(SURVIVAL_LOOT_HANDLER, (entity, opts = {}) => { addCorpseFood(entity, opts); });
  return true;
}
export function uninstallSurvivalLoot() { registerEnemyDeathHandler(SURVIVAL_LOOT_HANDLER, null); _installed = false; _enabled = () => false; }
