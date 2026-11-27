// @ts-check
// Errands abroad for sworn revenants. Offline an errand runs on the one game clock. Online its due is the world minute
// it returns, so a rest, a Loiter, or a journey (a raise of the character's own clock) never speeds it up.

import { PROVINCES, CITIES } from '../world/tamrielGeography.js';
import { idStream, isDevoted } from './revenantFeud.js';
import { gearPower } from './revenantGear.js';
import { rvnErrandSky, rvnErrandSkyOf } from './revenantStars.js';
import { tieredGear } from '../characters/eliteFoes.js';
import { lootRarityOn } from '../items/lootRarity.js';
import { materialOf } from '../net/professionLaw.js';
import { materialCountLabel } from '../professions/profItems.js';
import { addGoldPieces, addItem } from '../items/inventory.js';
import { giveCarried } from '../professions/materialsBag.js';
import { MINUTES_PER_DAY } from '../world/gameDate.js';
import { ONLINE_MINUTES_PER_MS } from '../net/wire.js';
import { t } from '../ui/textManager.js';

export const ERRAND = Object.freeze({
  MAX: 2,
  WON_LOYALTY: 4,
  GOLD: Object.freeze([10, 18]),
  DANGER_GOLD: 0.25,
  RANK_HAUL: 0.1,
  ODDS: Object.freeze({ BASE: 0.55, PER: 0.1, MIN: 0.3, MAX: 0.95, DEVOTED: 0.05 }),
  HARD_SHARE: 0.5,
  UNITS: Object.freeze({ BASE: 3, PER_DANGER: 2, FINE_TIER: 5, FINE_A_DAY: 1 }),
  TIERS: Object.freeze({ MAGIC: 0.5, RARE: Object.freeze([0.06, 0.03, 0.02]), LEGENDARY: Object.freeze([0.005, 0.004, 0.003]) }),
  STEP_MAX: 30,
});

export const VENTURES = Object.freeze({
  plunder: Object.freeze({ get label() { return t('rvn.errand.venture.plunder', 'Plunder'); }, get blurb() { return t('rvn.errand.venture.plunderBlurb', 'Loot first'); }, gold: 0.4, units: 0.35, items: 'many' }),
  forage: Object.freeze({ get label() { return t('rvn.errand.venture.forage', 'Forage'); }, get blurb() { return t('rvn.errand.venture.forageBlurb', 'Crafting materials first'); }, gold: 0.15, units: 1, items: 0.2 }),
  contract: Object.freeze({ get label() { return t('rvn.errand.venture.contract', 'Sell-sword'); }, get blurb() { return t('rvn.errand.venture.contractBlurb', 'Gold first'); }, gold: 1, units: 0, items: 0.25 }),
});
export const VENTURE_KEYS = Object.freeze(Object.keys(VENTURES));
export const isVenture = (v) => typeof v === 'string' && Object.prototype.hasOwnProperty.call(VENTURES, v);

export const PLACE_NAMES = Object.freeze({
  get HighRock() { return t('rvn.errand.place.highRock', 'High Rock'); }, get Hammerfell() { return t('rvn.errand.place.hammerfell', 'Hammerfell'); },
  get Imperial() { return t('rvn.errand.place.imperial', 'Imperial Province'); }, get Skyrim() { return t('rvn.errand.place.skyrim', 'Skyrim'); },
  get Valenwood() { return t('rvn.errand.place.valenwood', 'Valenwood'); }, get Sumurset() { return t('rvn.errand.place.sumurset', 'Sumurset Isle'); },
  get Elsweyr() { return t('rvn.errand.place.elsweyr', 'Elsweyr'); }, get Morrowind() { return t('rvn.errand.place.morrowind', 'Morrowind'); },
  get BlackMarsh() { return t('rvn.errand.place.blackMarsh', 'Black Marsh'); },
});
const place = (key, days, danger, goods) => {
  const p = PROVINCES.find((x) => x.key === key);
  return Object.freeze({ key, get name() { return PLACE_NAMES[key] ?? p?.name ?? key; }, days, danger, goods: Object.freeze(goods) });
};
export const ERRAND_PLACES = Object.freeze([
  place('HighRock', 1, 1, ['log:oak', 'metal:iron', 'ingot:steel', 'cloth:wool', 'hide:bear', 'gem:jade']),
  place('Hammerfell', 1, 2, ['metal:copper', 'metal:sulphur', 'gem:amber', 'hide:scorpion', 'cloth:linen', 'metal:gold']),
  place('Imperial', 2, 2, ['metal:silver', 'metal:gold', 'cloth:silk', 'log:cherry', 'gem:emerald', 'ingot:steel']),
  place('Skyrim', 2, 3, ['metal:iron', 'ore:orichalcum', 'hide:bear', 'hide:tiger', 'log:pine', 'gem:sapphire']),
  place('Valenwood', 2, 3, ['hide:spider', 'wood:heartwood', 'part:venom', 'hide:bat', 'wood:resin', 'gem:jade']),
  place('Sumurset', 3, 3, ['ore:moonstone', 'ingot:moonstone', 'gem:pearl', 'gem:malachite', 'cloth:silk', 'ingot:mithril']),
  place('Elsweyr', 3, 3, ['cloth:silk', 'gem:amber', 'hide:tiger', 'metal:gold', 'gem:turquoise', 'part:tooth']),
  place('Morrowind', 3, 4, ['ore:ebony', 'ore:dwarven', 'ingot:dwarven', 'hide:dreugh', 'gem:diamond', 'cloth:silk']),
  place('BlackMarsh', 4, 5, ['hide:slaughterfish', 'part:venom', 'part:stinger', 'wood:resin', 'log:ghostwood', 'gem:pearl']),
]);
export const errandPlace = (key) => ERRAND_PLACES.find((p) => p.key === key) ?? null;

const skyOf = (r, e) => e?.sky ?? rvnErrandSky(r);
const roadDays = (p, sky) => p.days * (1 - (sky?.road ?? 0));
export const errandPower = (r, e = null) => Math.max(1, r?.rank | 0) + gearPower(r) + skyOf(r, e).odds;
export const errandMinutes = (r, p) => Math.round((p?.days ?? 0) * MINUTES_PER_DAY * (1 - rvnErrandSky(r).road));
export function errandOdds(r, p, e = null) {
  if (!p) return 0;
  const O = ERRAND.ODDS;
  const odds = O.BASE + O.PER * (errandPower(r, e) - p.danger) + (isDevoted(r?.companion?.loyalty) ? O.DEVOTED : 0);
  return Math.round(Math.max(O.MIN, Math.min(O.MAX, odds)) * 1000) / 1000;
}
export const oddsKind = (odds) => (odds >= 0.75 ? 'good' : odds >= 0.5 ? 'fair' : 'grim');
export function oddsWord(odds) {
  const k = oddsKind(odds);
  return k === 'good' ? t('rvn.errand.odds.good', 'Good odds') : k === 'fair' ? t('rvn.errand.odds.fair', 'Fair odds') : t('rvn.errand.odds.grim', 'Grim odds');
}

export function newErrand(r, key, venture, now, seed, world = NaN) {
  const p = errandPlace(key);
  if (!p || !isVenture(venture) || !Number.isFinite(now)) return null;
  const s = Number.isInteger(seed) && seed >= 0 ? seed >>> 0 : 0;
  const cities = CITIES.filter((c) => c.province === key);
  const city = cities.length ? cities[Math.min(cities.length - 1, Math.floor(idStream(`${r?.id}`, `errand-city:${s}`)() * cities.length))].name : null;
  const sky = rvnErrandSky(r);
  const len = Math.round(roadDays(p, sky) * MINUTES_PER_DAY);
  return { place: key, venture, city, at: Math.floor(now), until: Math.floor(now) + len, seed: s, sky: { ...sky }, ...(Number.isFinite(world) ? { due: Math.floor(world) + len } : {}) };
}
export function sanitizeErrand(e) {
  if (!e || typeof e !== 'object' || !errandPlace(e.place) || !isVenture(e.venture)) return null;
  if (!Number.isInteger(e.at) || !Number.isInteger(e.until) || e.until < e.at) return null;
  const sky = rvnErrandSkyOf(e.sky);
  return { place: e.place, venture: e.venture, city: typeof e.city === 'string' && e.city ? e.city.slice(0, 40) : null, at: e.at, until: e.until, seed: Number.isInteger(e.seed) && e.seed >= 0 ? e.seed >>> 0 : 0, ...(sky ? { sky: { ...sky } } : {}), ...(Number.isInteger(e.due) ? { due: e.due } : {}) };
}
export function errandUntil(e, now) {
  const p = errandPlace(e?.place);
  if (!p || !Number.isFinite(e?.until)) return now;
  const most = Math.round(roadDays(p, e.sky) * MINUTES_PER_DAY);
  return Number.isFinite(now) && e.until - now > most ? now + most : e.until;
}
export function errandStep(own, raised, online) {
  if (!online || !(own > 0)) return 0;
  const lived = Math.min(Math.max(own - (raised > 0 ? raised : 0), 0), ERRAND.STEP_MAX);
  return own - lived;
}

export const ERRAND_WORLD_SLACK = 1;
// Caps the world reading at the last relay reading plus monotonic time since, so a machine clock set forward gains
// nothing. The due minute is absolute, so time a sleeping machine missed is paid at the next welcome.
export function errandWorldMinute(world, heard, perf) {
  if (!Number.isFinite(world) || !Number.isFinite(heard?.world) || !Number.isFinite(heard?.perf) || !Number.isFinite(perf)) return NaN;
  return Math.min(world, heard.world + Math.max(0, perf - heard.perf) * ONLINE_MINUTES_PER_MS + ERRAND_WORLD_SLACK);
}
export function errandOnWorld(e, own, world) {
  const p = errandPlace(e?.place), w = Math.floor(world);
  const most = p ? Math.round(roadDays(p, e.sky) * MINUTES_PER_DAY) : 0;
  const due = Math.min(Number.isInteger(e?.due) ? e.due : w + Math.max(0, e.until - Math.floor(own)), w + most);
  return { due, until: Math.max(e.at, Math.floor(own) + Math.max(0, due - w)) };
}

const goodsTier = (key) => materialOf(key, () => 1)?.tier ?? 1;
const goodsWeight = (key) => 1 / Math.max(1, goodsTier(key));
function drawGoods(goods, rolls) {
  const weights = goods.map(goodsWeight), total = weights.reduce((a, b) => a + b, 0);
  let x = rolls() * total;
  for (let j = 0; j < goods.length; j++) { if ((x -= weights[j]) < 0) return goods[j]; }
  return goods[goods.length - 1];
}
function pieceTier(danger, rank, rolls) {
  const T = ERRAND.TIERS, x = rolls(), up = Math.max(0, rank - 1);
  const leg = T.LEGENDARY[0] + T.LEGENDARY[1] * danger + T.LEGENDARY[2] * up;
  const rare = T.RARE[0] + T.RARE[1] * danger + T.RARE[2] * up;
  if (x < leg) return 'legendary';
  if (x < leg + rare) return 'rare';
  return x < leg + rare + T.MAGIC ? 'magic' : 'common';
}

/** @param {any} r @param {any} e @param {{ level?: number, rarity?: boolean }} [o] */
export function errandHaul(r, e, { level = 1, rarity = lootRarityOn() } = {}) {
  const p = errandPlace(e?.place), v = VENTURES[e?.venture];
  if (!p || !v) return { won: false, gold: 0, units: [], items: [] };
  // Drawn on the errand's own seed, so a reload of a save made abroad draws the same haul.
  const rolls = idStream(`${r?.id}`, `errand:${e.seed >>> 0}`);
  const rank = Math.max(1, Math.min(5, r?.rank | 0)), lv = Math.max(1, level | 0);
  const sky = skyOf(r, e), road = roadDays(p, sky);
  const whole = Math.floor(road + 1e-9), days = whole + (road - whole > 1e-9 && idStream(`${r?.id}`, `errand-part:${e.seed >>> 0}`)() < road - whole ? 1 : 0);
  const won = rolls() < errandOdds(r, p, e);
  const share = won ? 1 : sky.bold ? 0 : ERRAND.HARD_SHARE;
  const more = 1 + Math.max(0, sky.haul);
  const scale = (1 + ERRAND.DANGER_GOLD * (p.danger - 1)) * (1 + ERRAND.RANK_HAUL * (rank - 1));
  const [lo, hi] = ERRAND.GOLD;
  const gold = Math.floor(lv * p.days * (lo + rolls() * (hi - lo)) * scale * v.gold * share * more);
  const U = ERRAND.UNITS;
  const goods = (U.BASE + U.PER_DANGER * p.danger) * p.days * v.units * share;
  const cheap = p.goods.filter((k) => goodsTier(k) < U.FINE_TIER);
  let fine = Math.floor(U.FINE_A_DAY * days);
  /** @type {Map<string, number>} */
  const counts = new Map();
  const draw = (n) => {
    for (let i = 0; i < n; i++) {
      let k = drawGoods(p.goods, rolls);
      if (goodsTier(k) >= U.FINE_TIER && fine-- <= 0) { if (!cheap.length) continue; k = drawGoods(cheap, rolls); }
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  };
  draw(Math.floor(goods));
  const want = v.items === 'many' ? days : rolls() < Number(v.items) ? 1 : 0;
  const pieces = Math.round(want * share);
  const items = [];
  for (let i = 0; i < pieces; i++) {
    const tier = rarity ? pieceTier(p.danger, rank, rolls) : 'common';
    const it = tieredGear(lv, tier, rolls);
    if (it) items.push(it);
  }
  // The extra goods from the stars draw after the pieces, so stars never move a piece's dice.
  draw(Math.floor(goods * more) - Math.floor(goods));
  return { won, gold, units: [...counts.entries()], items };
}

export function deliverHaul(player, haul) {
  if (!player || !haul) return haul;
  if (haul.gold > 0) addGoldPieces(player, haul.gold);
  player.items ??= [];
  for (const it of haul.items ?? []) addItem(player.items, it);
  for (const [key, n] of haul.units ?? []) { try { giveCarried(player, key, n); } catch { } }
  return haul;
}

export function errandHaulWords(haul) {
  const parts = [];
  if (haul?.gold > 0) parts.push(t('rvn.errand.haul.gold', '{n} gold', { n: haul.gold }));
  for (const [key, n] of haul?.units ?? []) parts.push(t('rvn.errand.haul.goods', '{n} {what}', { n, what: materialCountLabel(key, n) }));
  const k = haul?.items?.length ?? 0;
  if (k) parts.push(t('rvn.errand.haul.pieces', '{k, plural, one {a piece of gear} other {# pieces of gear}}', { k }));
  if (!parts.length) return t('rvn.errand.haul.nothing', 'nothing');
  return parts.length === 1 ? parts[0] : t('rvn.errand.haul.list', '{most} and {last}', { most: parts.slice(0, -1).join(', '), last: parts[parts.length - 1] });
}
export const ERRAND_REAL_HOURS_A_DAY = MINUTES_PER_DAY / (ONLINE_MINUTES_PER_MS * 3_600_000);
export function errandLeftWords(until, now, real = false) {
  if (real) {
    const m = Math.max(1, Math.ceil(Math.max(0, until - now) / (ONLINE_MINUTES_PER_MS * 60_000)));
    if (m < 60) return t('rvn.errand.left.realMinutes', 'back in about {m, plural, one {# real minute} other {# real minutes}}', { m });
    return t('rvn.errand.left.realHours', 'back in about {h, plural, one {# real hour} other {# real hours}}', { h: Math.round(m / 60) });
  }
  const h = Math.ceil(Math.max(0, until - now) / 60);
  if (h <= 1) return t('rvn.errand.left.hour', 'back within the hour');
  if (h < 48) return t('rvn.errand.left.hours', 'back in about {h} hours', { h });
  return t('rvn.errand.left.days', 'back in about {d} days', { d: Math.round(h / 24) });
}
export function errandWords(e, now, real = false) {
  const p = errandPlace(e?.place);
  if (!p) return t('rvn.errand.abroad', 'Abroad');
  const where = e.city ? t('rvn.errand.cityOf', '{city}, {province}', { city: e.city, province: p.name }) : p.name;
  return t('rvn.errand.where', 'In {where} ({venture}), {left}', { where, venture: VENTURES[e.venture]?.label ?? e.venture, left: errandLeftWords(errandUntil(e, now), now, real) });
}
