// No combat or disease import: both sit on an import cycle through equip.js, which mints the starting kit through
// items.js.
import { HARD_RULES } from './difficulty.js';
const dice100 = (chance, roll01) => Math.floor(roll01 * 100) < chance;
export const DISEASE_STOMACH_ROT = 3, DISEASE_SWAMP_ROT = 6, DISEASE_YELLOW_FEVER = 2;

// The mod's own template indices (unused above classic's 288), so a save that carried them elsewhere reads here.
// 541 is the game's own Campfire.
export const TEMPLATE = Object.freeze({
  CampingEquipment: 530, Rations: 531, Apple: 532, Orange: 533, Bread: 534, RawFish: 535, CookedFish: 536,
  Meat: 537, RawMeat: 538, Waterskin: 539, Skillet: 540, Campfire: 541,
});
export const SURVIVAL_GROUP = 'UselessItems2';

export const FOOD = Object.freeze({
  [TEMPLATE.Rations]: Object.freeze({ name: 'Rations', satiety: 240, keeps: null, raw: false, thirst: 0, stack: true }),
  [TEMPLATE.Apple]: Object.freeze({ name: 'Apple', satiety: 60, keeps: 90, raw: false, thirst: 10, stale: 'Soft' }),
  [TEMPLATE.Orange]: Object.freeze({ name: 'Orange', satiety: 60, keeps: 90, raw: false, thirst: 10, stale: 'Soft' }),
  [TEMPLATE.Bread]: Object.freeze({ name: 'Bread', satiety: 180, keeps: 95, raw: false, thirst: 0, stale: 'Stale' }),
  [TEMPLATE.RawFish]: Object.freeze({ name: 'Raw Fish', satiety: 90, keeps: 50, raw: true, thirst: 0, stale: 'Smelly', cooks: TEMPLATE.CookedFish }),
  [TEMPLATE.CookedFish]: Object.freeze({ name: 'Cooked Fish', satiety: 200, keeps: 80, raw: false, thirst: 0, stale: 'Smelly' }),
  [TEMPLATE.Meat]: Object.freeze({ name: 'Meat', satiety: 240, keeps: 90, raw: false, thirst: 0, stale: 'Smelly' }),
  [TEMPLATE.RawMeat]: Object.freeze({ name: 'Raw Meat', satiety: 100, keeps: 60, raw: true, thirst: 0, stale: 'Smelly', cooks: TEMPLATE.Meat }),
});
export const FOOD_STAGE = Object.freeze({ Fresh: 0, Stale: 1, Mouldy: 2, Rotten: 3, Putrid: 4 });
export const STAGE_WORDS = Object.freeze(['', 'Stale', 'Mouldy', 'Rotten', 'Putrid']);
export const FULL_AHEAD_MINUTES = 240;
export const WATERSKIN_CAPACITY_KG = 2.0;
export const DRINK_KG = 0.1;
export const DRINK_RELIEF = 40;

const MORE_FOOD = new Map();
export function registerFoods(rows) {
  for (const [t, row] of Object.entries(rows ?? {})) if (FOOD[t] == null && row) MORE_FOOD.set(Number(t), Object.freeze({ ...row }));
}
export const isFood = (item) => !!item && (FOOD[item.templateIndex] ?? MORE_FOOD.get(item.templateIndex)) != null && (item.group == null || item.group === SURVIVAL_GROUP);
export const foodOf = (item) => (item ? FOOD[item.templateIndex] ?? MORE_FOOD.get(item.templateIndex) ?? null : null);
export const foodStage = (item) => Math.min(FOOD_STAGE.Putrid, Math.max(0, item?.foodStage ?? 0));
// Spoiling writes the stage word into a pot dish's name, so the word comes off before the current one goes back.
// A Provisioning dish name must never start with one of these words.
const STAGE_PREFIX = new RegExp(`^(?:${[...new Set([...STAGE_WORDS.filter(Boolean), ...Object.values(FOOD).map((f) => f.stale).filter(Boolean)])].join('|')}) `);
export const freshFoodName = (/** @type {string} */ name) => String(name).replace(STAGE_PREFIX, '');
export function foodName(item) {
  const own = item?.prov && typeof item.name === 'string' ? freshFoodName(item.name) : null;
  const f = foodOf(item);
  if (!f) return own ?? item?.name ?? '';
  const s = foodStage(item);
  if (s === 0) return own ?? f.name;
  const word = s === FOOD_STAGE.Stale ? (f.stale ?? 'Stale') : STAGE_WORDS[s];
  return `${word} ${own ?? f.name}`;
}
export const foodSatiety = (item) => Math.trunc((foodOf(item)?.satiety ?? 0) / (foodStage(item) + 1));

export const VENDOR_ICON_FILES = Object.freeze([
  '532_0-0', '532_1-0', '533_0-0', '533_1-0', '534_0-0', '534_1-0', '535_0-0', '535_1-0',
  '536_0-0', '536_1-0', '537_0-0', '537_1-0', '538_0-0', '538_1-0', '538_2-0', '539_0-0',
]);
export function dressFood(item) {
  if (!isFood(item)) return item;
  item.name = foodName(item);
  const s = foodStage(item);
  if (s >= FOOD_STAGE.Mouldy && VENDOR_ICON_FILES.includes(`${item.templateIndex}_${s === FOOD_STAGE.Mouldy ? 0 : 1}-0`)) {
    item.worldTextureArchive = item.templateIndex;
    item.worldTextureRecord = s === FOOD_STAGE.Mouldy ? 0 : 1;
  } else {
    delete item.worldTextureArchive; delete item.worldTextureRecord;
  }
  return item;
}

export function rotOnce(item) {
  const f = foodOf(item);
  if (!f || f.keeps == null) return false;
  const s = foodStage(item);
  if (s >= FOOD_STAGE.Putrid) return false;
  item.foodStage = s + 1;
  item.value = 0;
  dressFood(item);
  return true;
}

export function rotRoll(item, daysKept = 0, rolls = Math.random) {
  const f = foodOf(item);
  if (!f || f.keeps == null) return false;
  const roll = 1 + Math.floor(rolls() * 100) + Math.trunc(daysKept / 2);
  return roll > f.keeps ? rotOnce(item) : false;
}

export function rotFoodDay(collections, rotDay = 0, rolls = Math.random) {
  let n = 0;
  for (const list of collections) for (const item of list ?? []) {
    if (!foodOf(item) || foodOf(item).keeps == null) continue;
    // An item ages from the rot day it was first seen here, not from the world's first day.
    if (!Number.isFinite(item.rotDay)) item.rotDay = rotDay;
    const kept = Math.max(0, rotDay - item.rotDay);
    // Asked before slowRot: meat can carry both marks, and never spoiling outranks half the pace.
    if (item.noRot === true) continue;
    if (item.slowRot === true) { if (kept % 2 === 1) continue; if (rotRoll(item, Math.floor(kept / 2), rolls)) n++; continue; }
    if (rotRoll(item, kept, rolls)) n++;
  }
  for (const list of collections) removePutridFood(list);
  return n;
}

export function removePutridFood(list) {
  if (!Array.isArray(list)) return 0;
  let n = 0;
  for (let i = list.length - 1; i >= 0; i--) if (isFood(list[i]) && foodStage(list[i]) >= FOOD_STAGE.Putrid) { n += list[i].stackCount ?? 1; list.splice(i, 1); }
  return n;
}

// Minutes weighted by the natural temperature; each 720 is one rot day.
export const ROT_DAY_MINUTES = 720;
export function rotWeight(natural) {
  if (natural <= -30) return 0;
  if (natural > 50) return 3;
  if (natural > 20) return 2;
  return 1;
}

export function eatLaw(item, { lastAte, now, luck = 50, rolls = Math.random, rules = HARD_RULES } = {}) {
  const f = foodOf(item);
  if (!f) return { ok: false, reason: 'not food' };
  const stage = foodStage(item);
  if (stage >= FOOD_STAGE.Putrid) return { ok: false, reason: 'putrid' };
  const satiety = foodSatiety(item);
  const hunger = now - (lastAte ?? now);
  if (hunger < satiety) return { ok: false, reason: 'not hungry' };
  let base = lastAte ?? now;
  if (hunger > satiety + FULL_AHEAD_MINUTES) base = now - FULL_AHEAD_MINUTES;
  // Never a meal in the future: a marker ahead of the clock reads as a fresh start at load.
  const newLastAte = Math.min(now, base + satiety);
  let sick = null;
  if ((f.raw || stage > 0) && (rules ?? HARD_RULES).sickness) {
    const lucky = dice100(luck, rolls());
    if (!lucky) sick = stage >= FOOD_STAGE.Mouldy ? 'foul' : 'mild';
  }
  return { ok: true, lastAte: newLastAte, satiety, thirstRelief: f.thirst, sick, feel: sick ? (sick === 'foul' ? 'disgusted' : 'nauseated') : 'invigorated' };
}

export const MILD_MEAL_DISEASES = Object.freeze([DISEASE_STOMACH_ROT]);
export const FOUL_MEAL_DISEASES = Object.freeze([DISEASE_STOMACH_ROT, DISEASE_SWAMP_ROT, DISEASE_YELLOW_FEVER]);

export function sickenFromMeal(entity, sick, { inflict = null, rolls = Math.random, currentDay = 0, onContract = null } = {}) {
  if (!sick || typeof inflict !== 'function') return false;
  return inflict(entity, sick === 'foul' ? FOUL_MEAL_DISEASES : MILD_MEAL_DISEASES, { rolls, currentDay, onContract });
}

export const isWaterskin = (item) => !!item && item.templateIndex === TEMPLATE.Waterskin;
export const waterIn = (item) => Math.max(0, Math.min(WATERSKIN_CAPACITY_KG, item?.water ?? 0));
export const waterskinName = (item) => (waterIn(item) < DRINK_KG ? 'Empty Waterskin' : 'Waterskin');
export const findDrink = (items) => (items ?? []).find((i) => isWaterskin(i) && waterIn(i) >= DRINK_KG) ?? null;
export function drinkFrom(skin) {
  const w = waterIn(skin);
  if (w < DRINK_KG) return { ok: false, reason: 'empty' };
  skin.water = Math.max(0, Math.round((w - DRINK_KG) * 100) / 100);
  return { ok: true, left: skin.water, empty: skin.water < DRINK_KG, low: skin.water < 0.3 };
}
export function refillSkins(items, kg = Infinity) {
  let poured = 0, filled = 0;
  for (const i of items ?? []) {
    if (!isWaterskin(i)) continue;
    const room = WATERSKIN_CAPACITY_KG - waterIn(i);
    if (room <= 0) continue;
    const give = Math.min(room, kg - poured);
    if (give <= 0) break;
    i.water = Math.round((waterIn(i) + give) * 100) / 100;
    poured += give; filled++;
  }
  return { poured, filled, skins: (items ?? []).filter(isWaterskin).length };
}
