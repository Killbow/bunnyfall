// Shared balance and milestones. Only the account service may advance this state.
export const FARM_CROP_TYPES = Object.freeze(['grain', 'mushroom', 'herbs']);
export const FARM_ARGENTS_PER_WEEK = 600;
export const FARM_UPGRADES = Object.freeze({
  tools: Object.freeze([
    { gold: 20000, argents: 25, delivered: 1000, area: 3 },
    { gold: 100000, argents: 150, delivered: 6000, area: 5 },
    { gold: 250000, argents: 350, delivered: 26000, area: 9 },   // a 3x3 block around the bed worked
  ]),
  irrigation: Object.freeze([
    { gold: 40000, argents: 50, delivered: 1000 },
    { gold: 200000, argents: 300, delivered: 26000 },
  ]),
  soil: Object.freeze([
    { gold: 30000, argents: 40, delivered: 1000 },
    { gold: 150000, argents: 200, delivered: 6000 },
    { gold: 300000, argents: 400, delivered: 26000 },
  ]),
});
/** What each soil level does to a newly planted bed: extra items per harvest (the bed's `quality`) and the growth pace (`rate`). Index = level. */
export const FARM_SOIL = Object.freeze([
  { extra: 0, rate: 1 }, { extra: 1, rate: 1 }, { extra: 2, rate: 1.25 }, { extra: 3, rate: 1.5 },
]);
/** Beds one tool click gathers, by tools level (the last is the whole 3x3 block). */
export const FARM_TOOL_AREAS = Object.freeze([1, ...FARM_UPGRADES.tools.map(u => u.area)]);
export const FARM_UPGRADE_MAX = Object.freeze(Object.fromEntries(Object.entries(FARM_UPGRADES).map(([k, v]) => [k, v.length])));
export const FARM_ORDERS = Object.freeze([
  { quantity: 1000, gold: 2000, argents: 10 },
  { quantity: 5000, gold: 12000, argents: 50 },
  { quantity: 20000, gold: 60000, argents: 200 },
]);
const zeros = () => Object.fromEntries(FARM_CROP_TYPES.map(k => [k, 0]));
export const emptyFarmProgress = () => ({ upgrades: { tools: 0, irrigation: 0, soil: 0 }, harvested: zeros(), delivered: zeros(), orders: zeros(), weeks: Object.fromEntries(FARM_CROP_TYPES.map(k => [k, -1])) });
export const farmProgress = (garden) => garden?.progress ?? emptyFarmProgress();
export const farmOrder = (progress, crop) => FARM_ORDERS[Math.min(2, progress.orders[crop] ?? 0)];
export const farmWeek = (nowS) => Math.floor((nowS / 86400 + 3) / 7);
export function validFarmProgress(p) {
  if (p === undefined) return true;
  if (!p || !p.upgrades || !p.harvested || !p.delivered || !p.orders || !p.weeks) return false;
  const int = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
  return Object.keys(FARM_UPGRADES).every(k => int(p.upgrades[k], 0, FARM_UPGRADE_MAX[k])) && FARM_CROP_TYPES.every(k =>
    int(p.harvested[k], 0, 2147483647) && int(p.delivered[k], 0, p.harvested[k]) &&
    int(p.orders[k], 0, 2147483647) && int(p.weeks[k], -1, 2147483647));
}
export const farmToolArea = (garden) => FARM_TOOL_AREAS[farmProgress(garden).upgrades.tools];
export function stepFarmUpgrade(garden, key) {
  if(typeof key!=='string'||!Object.hasOwn(FARM_UPGRADES,key))return{error:'farm-upgrade-max'};
  const next = structuredClone(garden), progress = structuredClone(farmProgress(garden));
  const tier = progress.upgrades[key], price = FARM_UPGRADES[key]?.[tier];
  if (!price) return { error: 'farm-upgrade-max' };
  if (FARM_CROP_TYPES.some(k => progress.delivered[k] < price.delivered)) return { error: 'farm-upgrade-goal' };
  progress.upgrades[key]++; next.progress = progress;
  return { garden: next, price };
}
export function stepFarmDelivery(garden, crop, nowS) {
  if (!FARM_CROP_TYPES.includes(crop)) return { error: 'farm-order-bad' };
  const next = structuredClone(garden), progress = structuredClone(farmProgress(garden)), order = farmOrder(progress, crop), week = farmWeek(nowS);
  if (progress.weeks[crop] === week) return { error: 'farm-order-week' };
  if (progress.harvested[crop] - progress.delivered[crop] < order.quantity) return { error: 'farm-order-grown' };
  progress.delivered[crop] += order.quantity; progress.orders[crop]++; progress.weeks[crop] = week;
  next.progress = progress;
  return { garden: next, order };
}
