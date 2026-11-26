import { registerCustomTemplates, templateByIndex, mintCondition, setItemFields, ITEM_TEMPLATES } from '../../items/itemTemplates.js';
import { addVendorTextures, vendorTextureCount } from '../../render/textureReplacement.js';
import { DYE_COLORS } from '../../characters/dyes.js';
// Classic's Dice100 line, defined here because a combat import would close an import cycle through equip.js.
const dice100 = (chance, roll01) => Math.floor(roll01 * 100) < chance;
import {
  TEMPLATE, SURVIVAL_GROUP, FOOD, isFood, foodOf, foodStage, foodName, foodSatiety, eatLaw, sickenFromMeal, rotOnce, dressFood, VENDOR_ICON_FILES,
  isWaterskin, waterIn, waterskinName, drinkFrom, refillSkins, DRINK_RELIEF, WATERSKIN_CAPACITY_KG, FOOD_STAGE,
} from './food.js';
import { survivalOf, NEED } from './needs.js';
import { maxFatigue } from '../../characters/statMods.js';

const TORCH = ITEM_TEMPLATES[247];
export const CAMPFIRE_USES = 8;
export const CAMPING_USES = 50;
export const OFF_MEAL_FULL_MINUTES = 960;

export const SURVIVAL_TEMPLATES = Object.freeze([
  { index: TEMPLATE.CampingEquipment, name: 'Camping Equipment', baseWeight: 5.0, hitPoints: CAMPING_USES, basePrice: 150, rarity: 1, worldTextureArchive: 204, worldTextureRecord: 8 },
  { index: TEMPLATE.Rations, name: 'Rations', baseWeight: 1.0, hitPoints: 10, basePrice: 20, rarity: 1, worldTextureArchive: 205, worldTextureRecord: 17, stackable: true },
  { index: TEMPLATE.Apple, name: 'Apple', baseWeight: 0.1, hitPoints: 90, basePrice: 1, rarity: 3, worldTextureArchive: 213, worldTextureRecord: 1 },
  { index: TEMPLATE.Orange, name: 'Orange', baseWeight: 0.1, hitPoints: 90, basePrice: 2, rarity: 3, worldTextureArchive: 213, worldTextureRecord: 0 },
  { index: TEMPLATE.Bread, name: 'Bread', baseWeight: 1.5, hitPoints: 95, basePrice: 5, rarity: 3, worldTextureArchive: 211, worldTextureRecord: 31 },
  // Cooking's dishes take their weights from these food rows.
  { index: TEMPLATE.RawFish, name: 'Raw Fish', baseWeight: 1.0, hitPoints: 50, basePrice: 4, rarity: 20, worldTextureArchive: 211, worldTextureRecord: 9 },
  { index: TEMPLATE.CookedFish, name: 'Cooked Fish', baseWeight: 0.5, hitPoints: 80, basePrice: 6, rarity: 10, worldTextureArchive: 211, worldTextureRecord: 10 },
  { index: TEMPLATE.Meat, stackable: true, name: 'Meat', baseWeight: 0.5, hitPoints: 90, basePrice: 15, rarity: 20, worldTextureArchive: 211, worldTextureRecord: 40 },
  { index: TEMPLATE.RawMeat, stackable: true, name: 'Raw Meat', baseWeight: 1.0, hitPoints: 60, basePrice: 8, rarity: 40, worldTextureArchive: 538, worldTextureRecord: 2 },
  { index: TEMPLATE.Waterskin, name: 'Waterskin', baseWeight: 0.5, hitPoints: 10, basePrice: 10, rarity: 1, worldTextureArchive: 539, worldTextureRecord: 0 },
  { index: TEMPLATE.Skillet, name: 'Skillet', baseWeight: 5.0, hitPoints: 100, basePrice: 60, rarity: 5, worldTextureArchive: 218, worldTextureRecord: 4 },
  // Its condition is its fuel in nights, never wear, so it cannot be repaired.
  { index: TEMPLATE.Campfire, name: 'Campfire', baseWeight: 3.0, hitPoints: CAMPFIRE_USES, basePrice: 40, rarity: 1, worldTextureArchive: TORCH?.worldTextureArchive ?? 205, worldTextureRecord: TORCH?.worldTextureRecord ?? 17, isNotRepairable: true },
]);
registerCustomTemplates(SURVIVAL_TEMPLATES);

// The tent reskins override two records of real archives (TEXTURE.050 and TEXTURE.067), so they register without
// `standIn` and the rest of each archive still loads.
export const VENDOR_TENT_FILES = Object.freeze(['50_7-0', '67_10-0']);
export const vendorIconUrl = (name) => new URL(`../../../vendor/climates-calories/Textures/${name}.png`, import.meta.url).href;
let _iconsInstalled = false;
const vendorEntry = (f, load, standIn) => { const m = /^(\d+)_(\d+)-(\d+)$/.exec(f); return { archive: Number(m[1]), record: Number(m[2]), frame: Number(m[3]), fileName: f, standIn, load: () => load(f) }; };
export function installSurvivalIcons({ fetchBytes = null } = {}) {
  if (_iconsInstalled && vendorTextureCount() > 0) return 0;
  _iconsInstalled = true;
  const load = fetchBytes ?? (async (name) => { const r = await fetch(vendorIconUrl(name)); if (!r.ok) throw new Error(`${name}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()); });
  return addVendorTextures([
    ...VENDOR_ICON_FILES.map((f) => vendorEntry(f, load, true)),
    ...VENDOR_TENT_FILES.map((f) => vendorEntry(f, load, false)),
  ]);
}

export const isSurvivalItem = (item) => !!item && item.templateIndex >= TEMPLATE.CampingEquipment && item.templateIndex <= TEMPLATE.Campfire && (item.group == null || item.group === SURVIVAL_GROUP);
export const isCampingEquipment = (item) => !!item && item.templateIndex === TEMPLATE.CampingEquipment;
export const isCampfireKit = (item) => !!item && item.templateIndex === TEMPLATE.Campfire;
export const isSkillet = (item) => !!item && item.templateIndex === TEMPLATE.Skillet;

export function createSurvivalItem(templateIndex, { stackCount = 1, water = null, foodStage: stage = 0, condition = null } = {}) {
  const t = templateByIndex(templateIndex);
  if (!t?.custom) return null;
  const item = mintCondition(setItemFields({ group: SURVIVAL_GROUP, templateIndex, material: 0, flags: 0, variant: 0, message: 0, stackCount: t.stackable ? Math.max(1, stackCount) : 1 }));
  if (condition != null) item.currentCondition = Math.max(0, Math.min(item.maxCondition ?? condition, condition));
  if (isWaterskin(item)) {
    item.water = water == null ? WATERSKIN_CAPACITY_KG : Math.max(0, Math.min(WATERSKIN_CAPACITY_KG, water));
    item.name = waterskinName(item);
  }
  if (isFood(item) && stage > 0) { for (let i = 0; i < stage; i++) spoilFood(item); }
  return item;
}

export const spoilFood = rotOnce;

export const SURVIVAL_USE_TEXT = Object.freeze({
  ate: (name) => `You eat the ${name}.`,
  feel: (feel) => `You feel ${feel} by the meal.`,
  notHungry: (name) => `You are not hungry enough to eat the ${name} right now.`,
  putrid: (name) => `This ${name} is too disgusting to force down.`,
  rations: 'You eat some rations.',
  emptySack: 'You empty your sack of rations.',
  drank: 'You drink from your waterskin.',
  drankLow: 'Your waterskin is nearly empty.',
  drained: 'You drain your waterskin.',
  emptySkin: 'Your waterskin is empty. Find a fountain, a well or a trough.',
  skillet: 'Cooking at a campfire goes twice as fast with a skillet.',
  fullSkin: 'Your waterskin is already full.',
  campingIndoors: 'You cannot set up camp in here.',
  campingTown: 'It is illegal to camp in town.',
  campingFoes: 'There are enemies nearby.',
  refilled: 'You refill your water.',
  quenched: 'You quench your thirst.',
  noSkins: 'You have no waterskins to fill.',
});

export function useSurvivalItem(item, collection, { entity = null, now = 0, rolls = Math.random, currentDay = 0, onContract = null, inflict = null, rules = undefined, offMeal = false } = {}) {
  if (!isSurvivalItem(item)) return null;
  if (isFood(item)) return eatFood(item, collection, { entity, now, rolls, currentDay, onContract, inflict, rules, offMeal });
  if (isWaterskin(item)) {
    const r = drinkFrom(item);
    if (!r.ok) return { kind: 'empty', text: SURVIVAL_USE_TEXT.emptySkin };
    item.name = waterskinName(item);
    if (entity) {
      const s = survivalOf(entity, now);
      s.thirst = Math.max(0, s.thirst - DRINK_RELIEF);
    }
    return { kind: 'drank', text: r.empty ? SURVIVAL_USE_TEXT.drained : r.low ? SURVIVAL_USE_TEXT.drankLow : SURVIVAL_USE_TEXT.drank, left: r.left };
  }
  if (isCampingEquipment(item)) return { kind: 'pitchCamp', item };
  if (isCampfireKit(item)) return { kind: 'placeFire', item };
  if (isSkillet(item)) return { kind: 'info', text: SURVIVAL_USE_TEXT.skillet };
  return { kind: 'none' };
}

export function eatFood(item, collection, { entity = null, now = 0, rolls = Math.random, currentDay = 0, onContract = null, inflict = null, rules = undefined, offMeal = false } = {}) {
  if (!isFood(item)) return null;
  const list = Array.isArray(collection) ? collection : null;
  // With the arc off there is no hunger: a meal is eaten unless putrid, never sickens, and restores stamina.
  if (offMeal) {
    const name = foodName(item);
    if (foodStage(item) >= FOOD_STAGE.Putrid) return { kind: 'notEaten', text: SURVIVAL_USE_TEXT.putrid(name) };
    if (list) {
      if ((item.stackCount ?? 1) > 1) item.stackCount -= 1;
      else { const i = list.indexOf(item); if (i >= 0) list.splice(i, 1); }
    }
    let gave = 0;
    if (entity) {
      const pool = maxFatigue(entity);
      gave = Math.min(Math.max(0, pool - (entity.fatigue ?? 0)), Math.round(pool * Math.min(1, foodSatiety(item) / OFF_MEAL_FULL_MINUTES)));
      entity.fatigue = (entity.fatigue ?? 0) + gave;
    }
    const rations = item.templateIndex === TEMPLATE.Rations;
    const text = rations ? (list && !list.includes(item) ? `${SURVIVAL_USE_TEXT.rations} ${SURVIVAL_USE_TEXT.emptySack}` : SURVIVAL_USE_TEXT.rations) : SURVIVAL_USE_TEXT.ate(name);
    return { kind: 'ate', text: gave > 0 ? `${text} You feel your strength returning.` : text, satiety: foodSatiety(item), sick: null, stamina: gave };
  }
  const s = entity ? survivalOf(entity, now) : { lastAte: now - 10000, thirst: 0, notes: {} };
  const luck = entity?.stats?.luck ?? 50;
  const r = eatLaw(item, { lastAte: s.lastAte, now, luck, rolls, rules });
  const name = foodName(item);
  if (!r.ok) return { kind: 'notEaten', text: r.reason === 'putrid' ? SURVIVAL_USE_TEXT.putrid(name) : r.reason === 'not hungry' ? SURVIVAL_USE_TEXT.notHungry(name) : 'Nothing happens.' };
  s.lastAte = r.lastAte;
  s.thirst = Math.max(0, (s.thirst ?? 0) - (r.thirstRelief ?? 0));
  if (list) {
    if ((item.stackCount ?? 1) > 1) item.stackCount -= 1;
    else { const i = list.indexOf(item); if (i >= 0) list.splice(i, 1); }
  }
  if (entity && r.sick) sickenFromMeal(entity, r.sick, { inflict, rolls, currentDay, onContract });
  const rations = item.templateIndex === TEMPLATE.Rations;
  const text = rations ? (list && !list.includes(item) ? `${SURVIVAL_USE_TEXT.rations} ${SURVIVAL_USE_TEXT.emptySack}` : SURVIVAL_USE_TEXT.rations) : `${SURVIVAL_USE_TEXT.ate(name)} ${SURVIVAL_USE_TEXT.feel(r.feel)}`;
  return { kind: 'ate', text, satiety: r.satiety, sick: r.sick };
}

export function drinkAtSource(entity, now, { kg = Infinity } = {}) {
  const items = entity.items ?? [];
  const s = survivalOf(entity, now);
  const r = refillSkins(items, kg);
  for (const i of items) if (isWaterskin(i)) i.name = waterskinName(i);
  const lines = [];
  if (s.thirst > 0) { s.thirst = 0; lines.push(SURVIVAL_USE_TEXT.quenched); }
  if (r.skins === 0) lines.push(SURVIVAL_USE_TEXT.noSkins);
  else if (r.filled === 0) lines.push(SURVIVAL_USE_TEXT.fullSkin);
  else lines.push(SURVIVAL_USE_TEXT.refilled);
  return { ...r, text: lines.join(' ') };
}

// The mod's own list: fountains and wells as town flats, three trough models, and the dry fountain (212, 3).
export const WATER_SOURCE_FLATS = Object.freeze({ 212: Object.freeze([0, 2, 8, 9]), 85: Object.freeze([0]) });
export const DRY_SOURCE_FLATS = Object.freeze({ 212: Object.freeze([3]) });
export const WATER_SOURCE_MODELS = Object.freeze([41220, 41221, 41222]);
export const DRY_SOURCE_TEXT = 'This fountain is dry as dust.';

export const WATER_SOURCE_NAME = 'Water Source';
export const waterSourceHoverName = (dry) => ({ title: WATER_SOURCE_NAME, subs: dry ? [DRY_SOURCE_TEXT] : [] });
export const isWaterSourceFlat = (archive, record) => (WATER_SOURCE_FLATS[archive] ?? []).includes(record);
export const isDrySourceFlat = (archive, record) => (DRY_SOURCE_FLATS[archive] ?? []).includes(record);

export function provisionsStock(quality = 5, rolls = Math.random, { campfires = true } = {}) {
  const n = (min, max) => min + Math.floor(rolls() * (max - min + 1));
  const out = [];
  out.push(createSurvivalItem(TEMPLATE.Rations, { stackCount: n(2, 5) }));
  for (let i = n(1, 3); i > 0; i--) out.push(createSurvivalItem(TEMPLATE.Bread));
  for (let i = n(1, 3); i > 0; i--) out.push(createSurvivalItem(rolls() < 0.5 ? TEMPLATE.Apple : TEMPLATE.Orange));
  for (let i = n(1, 2); i > 0; i--) out.push(createSurvivalItem(TEMPLATE.Waterskin, { water: 0 }));
  // Drawn on every shelf, so each shelf's later draws stay its own.
  const fires = n(2, 4);
  if (campfires) for (let i = fires; i > 0; i--) out.push(createSurvivalItem(TEMPLATE.Campfire));
  if (quality >= 5 || dice100(30, rolls())) out.push(createSurvivalItem(TEMPLATE.CampingEquipment));
  if (quality >= 8 || dice100(20, rolls())) out.push(createSurvivalItem(TEMPLATE.Skillet));
  return out.filter(Boolean);
}

const START_SHOES = Object.freeze({ male: 147, female: 186 });
const START_CLOAK = Object.freeze({ male: 155, female: 192 });
function wornStartClothing(female, templateIndex, variant) {
  const item = mintCondition(setItemFields({ group: female ? 'WomensClothing' : 'MensClothing', templateIndex, variant, dye: DYE_COLORS.Blue }));
  // Worn to a quarter of its condition with integer division, as the mod does.
  item.currentCondition = Math.trunc(item.currentCondition / 4);
  return item;
}

export function startingProvisions(entity = null) {
  const female = entity?.gender === 'female';
  return [
    createSurvivalItem(TEMPLATE.Rations, { stackCount: 2 }),
    createSurvivalItem(TEMPLATE.Waterskin),
    // The cloak's variant 1 is its hood up; the Shoes have no variants.
    wornStartClothing(female, female ? START_CLOAK.female : START_CLOAK.male, 1),
    wornStartClothing(female, female ? START_SHOES.female : START_SHOES.male, 0),
    createSurvivalItem(TEMPLATE.CampingEquipment, { condition: Math.trunc(CAMPING_USES / 2) }),
    createSurvivalItem(TEMPLATE.Campfire),
  ];
}

export function campfireStock(rolls = Math.random, lo = 2, hi = 4) {
  const out = [];
  for (let i = lo + Math.floor(rolls() * (hi - lo + 1)); i > 0; i--) out.push(createSurvivalItem(TEMPLATE.Campfire));
  return out.filter(Boolean);
}
export const startingCampfire = () => createSurvivalItem(TEMPLATE.Campfire);
export const ENDLESS_RATIONS_STACK = 99;
export function ensureEndlessProvisions(items) {
  if (!Array.isArray(items)) return items;
  // A kit is not stackable (its uses are its condition), so only a fresh one counts as the shelf's.
  const fresh = (i) => i?.templateIndex === TEMPLATE.Campfire && isSurvivalItem(i) && (i.currentCondition ?? CAMPFIRE_USES) >= (i.maxCondition ?? CAMPFIRE_USES);
  if (!items.some(fresh)) items.push(createSurvivalItem(TEMPLATE.Campfire));
  const rations = items.find((i) => i?.templateIndex === TEMPLATE.Rations && isSurvivalItem(i));
  if (!rations) items.push(createSurvivalItem(TEMPLATE.Rations, { stackCount: ENDLESS_RATIONS_STACK }));
  else if ((rations.stackCount ?? 1) < ENDLESS_RATIONS_STACK) rations.stackCount = ENDLESS_RATIONS_STACK;
  return items;
}

export { TEMPLATE, FOOD, foodOf, foodSatiety, isFood, isWaterskin, waterIn, NEED, dressFood, VENDOR_ICON_FILES };
