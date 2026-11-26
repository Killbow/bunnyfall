// Tavern menus, meals, drinks, and the blackout, following the Climates & Calories mod's tavern window.
import { NEED, heartyMeal } from './needs.js';
import { HARD_RULES } from './difficulty.js';
import { isWaterskin, waterIn, WATERSKIN_CAPACITY_KG } from './food.js';
import { drinkAtSource } from './items.js';
import { CLIMATES, REGION_NAMES } from '../../formats/mapsFile.js';
import { essentialPrice } from '../../trade/shopStock.js';
import { getHolidayId, HOLIDAYS } from '../../world/holidays.js';
import { maxFatigue, FATIGUE_MULTIPLIER } from '../../characters/statMods.js';

const REGION_MENU = Object.freeze({
  n: ['Anticlere', 'Betony', 'Bhoriane', 'Daenia', 'Daggerfall', 'Dwynnen', 'Glenpoint', 'Glenumbra Moors', 'Ilessan Hills', 'Kambria', 'Northmoor', 'Phrygias', 'Shalgora', 'Tulune', 'Urvaius', 'Ykalon'],
  ne: ['Alcaire', 'Gavaudon', 'Koegria', 'Menevia', 'Wayrest'],
  se: ['Kozanset', 'Lainlyn', 'Mournoth', 'Satakalaam', 'Totambu'],
  s: ['Abibon-Gora', "Alik'r Desert", 'Antiphyllos', 'Ayasofya', 'Bergama', 'Cybiades', "Dak'fron", 'Dragontail Mountains', 'Ephesus', 'Kairou', 'Myrkwasa', 'Pothago', 'Santaki', 'Sentinel', 'Tigonus'],
  b: ['Isle of Balfiera'],
  o: ['Orsinium Area', 'Wrothgarian Mountains'],
});
export const MENU_KEY_BY_REGION = Object.freeze(Object.fromEntries(Object.entries(REGION_MENU).flatMap(([key, names]) => names.map((n) => [REGION_NAMES.indexOf(n), key]))));
// Keyed by climate names, never numbers: the climate indices start at 223.
export const MENU_KEY_BY_CLIMATE = Object.freeze({
  [CLIMATES.Desert2]: 's', [CLIMATES.Desert]: 's', [CLIMATES.Subtropical]: 's', [CLIMATES.Rainforest]: 'se', [CLIMATES.Swamp]: 'se',
  [CLIMATES.Woodlands]: 'n', [CLIMATES.HauntedWoodlands]: 'n', [CLIMATES.MountainWoods]: 'n', [CLIMATES.Mountain]: 'n',
});
export const menuKeyFor = (climateIndex) => MENU_KEY_BY_CLIMATE[climateIndex] ?? 'n';
// The region key wins; the climate picks the key only for a region the mod's table leaves out.
export const regionMenuDay = (regionIndex, climateIndex) => MENU_KEY_BY_REGION[regionIndex] ?? menuKeyFor(climateIndex);
export const menuTier = (quality) => (quality < 5 ? 'low' : quality < 13 ? 'mid' : 'high');
export const BREAKFAST_FROM = 6, BREAKFAST_UNTIL = 10, KITCHEN_CLOSED_HOUR = 5;
export const breakfastHours = (hour) => hour >= BREAKFAST_FROM && hour <= BREAKFAST_UNTIL;
export const kitchenClosed = (hour) => hour < BREAKFAST_FROM;
export const MEAL_WORTH = 240;
export const MEAL_MINUTES = 30, DRINK_MINUTES = 15;

const d = (name, price) => Object.freeze({ name, price });
const list = (...dishes) => Object.freeze(dishes);
// Each row charges its listed price; the mod charges two rows a different price, which is not copied.
export const TAVERN_DISHES = Object.freeze({
  breakLow: list(d('Leftovers', 1)),
  breakMid: list(d('Gruel', 2), d('Bread and Cheese', 5)),
  breakHigh: list(d('Oatmeal with Berries', 5), d('Artisinal Pastries', 8), d('Royal Breakfast Plate', 10)),
  nLow: list(d('Baked Apples', 6), d('Mystery Sausage', 8), d('Grilled Hare', 10)),
  nMid: list(d('Breton Pork Sausage', 7), d('Cheese Pork Schnitzel', 10), d('Hare in Garlic Sauce', 12), d('Highland Rabbit Stew', 15)),
  nHigh: list(d('Gorapple Cheesecake', 10), d('Apple Cobbler Supreme', 13), d('Peacock Pie', 15), d('Rabbit Gnocchi Ragu', 18), d('Salmon Steak Supreme', 22)),
  neLow: list(d('Velothis Cabbage Soup', 6), d('Beetle-Cheese Poutine', 8), d('Eidar Radish Salad', 10)),
  neMid: list(d('Cabbage Biscuits', 7), d('Potato Porridge', 10), d('Dunmeri Jerked Horse Haunch', 12), d('Solstheim Elk and Scuttle', 15)),
  neHigh: list(d('Indoril Radish Tartlets', 10), d('Vvardenfell Ash Yam Loaf', 13), d('Kwama Egg Quiche', 15), d('Millet-Stuffed Pork Loin', 18), d('Akaviri Pork Fried Rice', 22)),
  sLow: list(d('Cantaloupe Bread', 6), d('Fishy Stick', 8), d('Roasted Corn', 10)),
  sMid: list(d('Beets With Goat Cheese', 7), d('Venison Pie', 10), d('Antelope Stew', 12), d('Parmesan Eels in Watermelon', 15)),
  sHigh: list(d('Roast Anteloupe', 10), d('Melon-Chevre Salad', 13), d('Pork Fried Rice', 15), d('Chili Cheese Corn', 18), d('Supreme Jambalaya', 22)),
  seLow: list(d('Banana Surprise', 6), d('Green Bananas With Garlic', 8), d('Banana Cornbread', 10)),
  seMid: list(d('Banana Millet Muffin', 7), d('Baked Sole With Bananas', 10), d('Chicken-and-Coconut Fried Rice', 12), d('Mistral Banana-Bunny Hash', 15)),
  seHigh: list(d("Clan Mother's Banana Pilaf", 10), d('Stuffed Banana Leaves', 13), d('Jungle Snake Curry', 15), d('Banana-Radish Vichyssoise', 18), d('Spicy Grilled Lizard', 22)),
  balHigh: list(d('Summerset Rainbow Pie', 10), d('Old Aldmeri Gruel', 13), d('Pickled Fish Bowl', 25), d('Direnni Rabbit Bisque', 18), d('Lillandril Summer Sausage', 22)),
  woMid: list(d('Potato Porridge', 7), d('Orcish Bratwurst On Bun', 10), d('Jerall Carrot Cake', 12), d('Bruma Jugged Rabbit', 15)),
});
export const FOOD_MENUS = Object.freeze({
  low: Object.freeze({ n: 'nLow', ne: 'neLow', se: 'seLow', s: 'sLow', b: 'neLow', o: 'neLow' }),
  mid: Object.freeze({ n: 'nMid', ne: 'neMid', se: 'seMid', s: 'sMid', b: 'neMid', o: 'woMid' }),
  high: Object.freeze({ n: 'nHigh', ne: 'neHigh', se: 'seHigh', s: 'sHigh', b: 'balHigh', o: 'neHigh' }),
});
export const BREAKFAST_MENUS = Object.freeze({ low: 'breakLow', mid: 'breakMid', high: 'breakHigh' });
export const TAVERN_DRINKS = Object.freeze({
  nLow: list(d('Goats Milk', 1), d('Spruce Tea', 2), d('Apple Cider', 2), d('Ale', 3), d('Moonshine', 4)),
  nMid: list(d('Cows Milk', 2), d('Herbal Tea', 4), d('Ale', 4), d('Bitter', 6), d('Mulled Wine', 8), d('Red Wine', 12), d('Rye Liquor', 14)),
  nHigh: list(d('Berry Juice', 3), d('Herbal Tea', 6), d('Mint Tea', 6), d('Ale', 9), d('Bitter', 12), d('Port', 18), d('Mulled Wine', 21), d('Red Wine', 24), d('Nereid Wine', 30)),
  neLow: list(d('Goats Milk', 1), d('Berry Juice', 2), d('Pear Cider', 2), d('Ale', 3), d('Morrowind Mazte', 4)),
  neMid: list(d('Fruit Juice', 2), d('Mint Tea', 4), d('Ale', 4), d('Weat Beer', 6), d('Bitter', 8), d('Acai Mazte', 12), d('Vvrdenfell Flin', 14)),
  neHigh: list(d('Fruit Juice', 3), d('Herbal Tea', 6), d('Mint Tea', 6), d('Golden Ale', 9), d('Stout', 12), d('Mulled Wine', 18), d('Port Wine', 21), d('Nereid Wine', 24), d('Cyrodiil Brandy', 30)),
  sLow: list(d('Camel Milk', 1), d('Coffee', 2), d('Beer', 2), d('Stout', 3), d('Rum', 4)),
  sMid: list(d('Fruit Juice', 2), d('Coffee', 4), d('Beer', 4), d('Stout', 6), d('Bitter', 8), d('Wine', 12), d('Rum', 14)),
  sHigh: list(d('Fruit Juice', 3), d('Coffee', 6), d('Chai Tea', 6), d('Weat Beer', 9), d('Beer', 12), d('Stout', 18), d('Bitter', 21), d('Wine', 24), d('Summerset Wine', 30)),
  woLow: list(d('Goats Milk', 1), d('Berry Juice', 2), d('Ale', 2), d('Mead', 3), d('Orc Grog', 4)),
  woMid: list(d('Berry Juice', 2), d('Mint Tea', 4), d('Ale', 4), d('Mead', 6), d('Mulled Wine', 18), d('Red Wine', 12), d('Pine Rye', 14)),
});
export const DRINK_MENUS = Object.freeze({
  low: Object.freeze({ n: 'nLow', ne: 'neLow', se: 'sLow', s: 'sLow', b: 'neLow', o: 'woLow' }),
  mid: Object.freeze({ n: 'nMid', ne: 'neMid', se: 'sMid', s: 'sMid', b: 'neMid', o: 'woMid' }),
  high: Object.freeze({ n: 'nHigh', ne: 'neHigh', se: 'sHigh', s: 'sHigh', b: 'neHigh', o: 'neHigh' }),
});
// Alcohol is read by row position in the tier list, as the mod reads it, not by the drink name.
export const DRINK_ALCOHOL = Object.freeze({
  low: list(0, 0, 10, 12, 25),
  mid: list(0, 0, 10, 12, 15, 20, 30),
  high: list(0, 0, 0, 10, 12, 15, 20, 20, 40),
});
export const FREE_DRINK_HOLIDAYS = Object.freeze([HOLIDAYS.Harvest_End, HOLIDAYS.New_Life]);
export const FREE_DRINK_FROM = 5, FREE_DRINK_OVER = 10;

export const TAVERN_MENU_TEXT = Object.freeze({
  closed: 'Sorry, breakfast starts at dawn.',
  closedNight: 'Sorry, the kitchen is closed for the night.',
  tooFull: 'You are too full to finish your meal. The rest goes to waste.',
  invigorated: 'You feel invigorated by the meal. You are well fed.',
  fortified: 'The drink fortifies you.',
  refreshed: 'The drink refreshes you.',
  gettingDrunk: 'You are getting drunk...',
  veryDrunk: 'You are very drunk...',
  blackout: 'The room spins. You black out.',
  woke: 'You wake on the tavern floor at dawn, stiff and sore.',
  wokeNoDawn: 'You wake on the tavern floor, stiff and sore.',
  cutOff: 'The barkeep shakes their head: that one would put you on the floor.',
  fullForMeal: 'You are too full to eat a meal yet.',
  noGold: 'You do not have enough gold.',
  drinksHeader: '--- Drinks ---',
  water: 'Fill your waterskins',
  noSkin: 'You carry no waterskin.',
  skinsFull: 'Your waterskins are full.',
});

export function innWaterPrice(drinks) {
  const soft = drinks.filter((k) => !((k.strength | 0) > 0));
  return Math.min(...(soft.length ? soft : drinks).map((k) => k.price));
}

export function tavernMenu({ climateIndex = 232, regionIndex = -1, quality = 5, hour = 12, minutes = null, online = undefined } = {}) {
  const cost = (p) => essentialPrice(p, { online });
  const key = regionMenuDay(regionIndex, climateIndex), tier = menuTier(quality);
  const closed = kitchenClosed(hour);
  const closedText = closed ? (hour === KITCHEN_CLOSED_HOUR ? TAVERN_MENU_TEXT.closed : TAVERN_MENU_TEXT.closedNight) : null;
  const list = breakfastHours(hour) ? BREAKFAST_MENUS[tier] : FOOD_MENUS[tier][key];
  const rows = [];
  if (!closed) for (const f of TAVERN_DISHES[list]) rows.push({ text: `${String(cost(f.price)).padStart(2)} gold   ${f.name}`, kind: 'food', name: f.name, price: cost(f.price), worth: MEAL_WORTH });
  rows.push({ text: TAVERN_MENU_TEXT.drinksHeader, kind: 'header', name: null, price: 0 });
  const drinks = TAVERN_DRINKS[DRINK_MENUS[tier][key]].map((k, i) => ({ ...k, strength: DRINK_ALCOHOL[tier][i] }));
  const water = innWaterPrice(drinks);
  rows.push({ text: `${String(cost(water)).padStart(2)} gold   ${TAVERN_MENU_TEXT.water}`, kind: 'water', name: TAVERN_MENU_TEXT.water, price: cost(water) });
  const holiday = Number.isFinite(minutes) && FREE_DRINK_HOLIDAYS.includes(getHolidayId(minutes, regionIndex));
  for (const [i, k] of drinks.entries()) {
    const price = holiday && i >= FREE_DRINK_FROM && k.price > FREE_DRINK_OVER ? 0 : k.price;
    rows.push({ text: `${String(cost(price)).padStart(2)} gold   ${k.name}`, kind: 'drink', name: k.name, price: cost(price), strength: k.strength });
  }
  return { rows, closed, closedText, key, tier, list };
}

// Hunger is read at the meal's end: the mod passes the half hour before it reads the clock.
export const mealHunger = (s, now) => now + MEAL_MINUTES - (s?.lastAte ?? now + MEAL_MINUTES);
export function tavernEat(s, now, worth) {
  const end = now + MEAL_MINUTES, hunger = mealHunger(s, now);
  // Too full still charges and leaves the eater fed, as the mod does.
  if (hunger < worth) { s.lastAte = end; return { ok: false, text: TAVERN_MENU_TEXT.tooFull, minutes: MEAL_MINUTES }; }
  if (hunger > worth + NEED.PECKISH_AT) s.lastAte = end - NEED.PECKISH_AT;
  s.lastAte += worth;
  heartyMeal(s, end);
  return { ok: true, text: TAVERN_MENU_TEXT.invigorated, minutes: MEAL_MINUTES };
}
export function tavernPour(s, strength, { endurance = 50, rules = HARD_RULES } = {}) {
  if ((rules ?? HARD_RULES).blackout || !((strength | 0) > 0)) return { ok: true };
  if ((s?.drunk ?? 0) + (strength | 0) > endurance) return { ok: false, text: TAVERN_MENU_TEXT.cutOff };
  return { ok: true };
}
// Both windows ask this after the gold check and before the coin changes hands, so a refusal costs nothing.
export function tavernOrder(s, now, row, { endurance = 50, rules = HARD_RULES, items = null } = {}) {
  if (row?.kind === 'drink') return tavernPour(s, row.strength, { endurance, rules });
  if (row?.kind === 'water') return innWaterOrder(items);
  if (row?.kind === 'food' && !(rules ?? HARD_RULES).wastedMeal && mealHunger(s, now) < (row.worth ?? 0)) return { ok: false, text: TAVERN_MENU_TEXT.fullForMeal };
  return { ok: true };
}
function innWaterOrder(items) {
  const skins = (items ?? []).filter(isWaterskin);
  if (!skins.length) return { ok: false, text: TAVERN_MENU_TEXT.noSkin };
  if (skins.every((i) => WATERSKIN_CAPACITY_KG - waterIn(i) <= 0)) return { ok: false, text: TAVERN_MENU_TEXT.skinsFull };
  return { ok: true };
}
export function tavernWater(entity, now) {
  return { text: drinkAtSource(entity, now).text, minutes: 0 };
}
export const SOFT_DRINK_FATIGUE = 5;
export function tavernDrink(s, strength, { endurance = 50, rules = HARD_RULES } = {}) {
  s.thirst = 0;
  s.drunk = (s.drunk ?? 0) + (strength | 0);
  if (s.drunk > endurance && (rules ?? HARD_RULES).blackout) return { text: TAVERN_MENU_TEXT.blackout, blackout: true, minutes: DRINK_MINUTES };
  if (s.drunk > endurance / 2) return { text: s.drunk > endurance - 10 ? TAVERN_MENU_TEXT.veryDrunk : TAVERN_MENU_TEXT.gettingDrunk, blackout: false, minutes: DRINK_MINUTES };
  if ((strength | 0) > 0) return { text: TAVERN_MENU_TEXT.fortified, blackout: false, minutes: DRINK_MINUTES, fatigue: strength | 0, magicka: strength | 0 };
  return { text: TAVERN_MENU_TEXT.refreshed, blackout: false, minutes: DRINK_MINUTES, fatigue: SOFT_DRINK_FATIGUE, magicka: 0 };
}
// Both windows call this after the drink's quarter hour passes, as the mod passes the time first.
export function tavernRefresh(entity, r) {
  if (r?.fatigue > 0) entity.fatigue = Math.min(maxFatigue(entity), (entity.fatigue ?? 0) + r.fatigue * FATIGUE_MULTIPLIER);
  if (r?.magicka > 0) entity.magicka = Math.min(entity.maxMagicka ?? Infinity, (entity.magicka ?? 0) + r.magicka);
}
export const BLACKOUT_WAKE_HOUR = 6;
// `sky` is the minute on the world sky, not on the character clock, so the night runs to the next six o'clock there.
export function blackout(s, sky, { endurance = 50 } = {}) {
  s.drunk = Math.trunc(endurance / 4);
  const minute = ((sky % 1440) + 1440) % 1440, wake = BLACKOUT_WAKE_HOUR * 60;
  return { minutes: wake - minute + (minute >= wake ? 1440 : 0) };
}
export const blackoutWaking = (sky) => (Math.trunc((((sky % 1440) + 1440) % 1440) / 60) === BLACKOUT_WAKE_HOUR ? TAVERN_MENU_TEXT.woke : TAVERN_MENU_TEXT.wokeNoDawn);
