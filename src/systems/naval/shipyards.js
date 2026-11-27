// @ts-check
import { HULL_NAMES, HULL_PRICES } from './comeSailAwayHulls.js';
import { mintDeed, mintParts, BOAT_PARTS_TEMPLATE, BOAT_DEED_TEMPLATE } from './comeSailAwayItems.js';
import { YARD_QUALITY, YARD_PRICE_INDEX } from '../../world/merchantYards/merchantYards.js';
import { calculateCost } from '../../trade/shopStock.js';
import { getTradePrice } from '../../trade/tradeModes.js';
import { upgradeCost, UPGRADE_LINES, UPGRADE_TIERS } from './fleet.js';
import { hullBuild, batteriesOf } from './navalShips.js';
import { playerCrewCount } from './crewLife.js';

// Hull indices, cheapest first.
export const SHIPYARD_HULLS = Object.freeze([0, 1, 2, 4, 3]);
export const PARTS_HULLS = Object.freeze([0]);
// Every shipyard uses one quality and price index, so no town is cheaper to buy in and dearer to sell in.
export const SHIPYARD_QUALITY = YARD_QUALITY;
export const SHIPYARD_PRICE_INDEX = YARD_PRICE_INDEX;
export const REFIT_RESALE = 0.5;
export const SALE_FLOOR = 0.6;

// Indexed by hull in HULL_NAMES order.
export const HULL_LINES = Object.freeze([
  'A rowboat with a pair of oars and room for two. Sold as parts: launch it from your pack anywhere there is water.',
  'A single-masted boat with a small cabin. Quick and easy to handle, with no crew to feed. The deed goes to your Fleet ledger.',
  'A galleon with two decks, ten gunports, a full crew and a captain\'s cabin.',
  'A great war galley with sixty oars, a ram on the bow and a huge crew. Too big for any quay.',
  'A three-masted carrack with high castles fore and aft, a deep hold and guns along its sides.',
]);

export function shipSpec(hull) {
  const b = hullBuild(hull);
  let guns = 0, barrels = false;
  for (const bt of batteriesOf(hull)) { if (bt.gun === 'barrel') barrels = true; else guns += bt.muzzles.length; }
  return {
    hull, name: HULL_NAMES[hull] ?? 'Boat', length: Math.round((b.bowZ - b.aftZ) * 10) / 10, beam: Math.round(b.halfWidth * 20) / 10,
    crew: b.crew, hands: playerCrewCount(hull, b.crew), guns, barrels, hullHp: b.hullHp, sailHp: b.sailHp, ram: !!b.ram,
    parts: PARTS_HULLS.includes(hull), price: HULL_PRICES[hull] ?? 0, line: HULL_LINES[hull] ?? '',
  };
}

export const shipyardItem = (hull, uid) => (PARTS_HULLS.includes(hull) ? mintParts(hull, 0, uid) : mintDeed(hull, 0, uid, HULL_PRICES[hull]));

export const isBoatItem = (it) => it?.templateIndex === BOAT_PARTS_TEMPLATE || it?.templateIndex === BOAT_DEED_TEMPLATE;

export function refitGold(rec) {
  let gold = 0;
  for (const l of UPGRADE_LINES) {
    const tier = Math.max(0, Math.min(UPGRADE_TIERS, rec?.upgrades?.[l.id] | 0));
    for (let t = 0; t < tier; t++) gold += upgradeCost(rec.hull, l.id, t)?.gold ?? 0;
  }
  return gold;
}
export function shipWorth(rec, hullShare = 1) {
  const whole = HULL_PRICES[rec?.hull] ?? 0;
  // A saved value is capped at the hull's price; past a few million the 32-bit haggle turns an offer negative.
  const value = Number.isFinite(rec?.value) ? Math.max(0, Math.min(whole || rec.value, rec.value)) : whole;
  const k = SALE_FLOOR + (1 - SALE_FLOOR) * Math.max(0, Math.min(1, Number.isFinite(hullShare) ? hullShare : 1));
  return Math.max(1, Math.round((value + refitGold(rec) * REFIT_RESALE) * k));
}

export function shipBuyPrice(value, skills) {
  const pieces = 1;
  return getTradePrice('Buy', calculateCost(Math.max(0, value), SHIPYARD_QUALITY, SHIPYARD_PRICE_INDEX), SHIPYARD_QUALITY, skills, pieces);
}
export function shipSalePrice(worth, skills) {
  const pieces = 1;
  return Math.max(0, getTradePrice('Sell', calculateCost(Math.max(0, worth), SHIPYARD_QUALITY, SHIPYARD_PRICE_INDEX), SHIPYARD_QUALITY, skills, pieces));
}

/** @param {{ where: string, hold?: number, ashore?: number, fighting?: boolean, aboard?: number, atPort?: boolean, crossed?: boolean }} o */
export function saleRefusal({ where, hold = 0, ashore = 0, fighting = false, aboard = 0, atPort = true, crossed = false }) {
  if (!atPort) return SHIPYARD_TEXT.notPort;
  if (crossed) return SHIPYARD_TEXT.crossed;
  if (where === 'sailing') return 'Step away from the helm first.';
  if (where === 'away') return 'Bring the ship to this port first. The shipmaster buys only what he can see.';
  if (where !== 'here' && where !== 'laidup' && where !== 'packed') return 'No such ship of yours here.';
  if (fighting) return 'Not while the ship is in combat.';
  if (aboard > 0) return 'Another player is aboard.';
  if (ashore > 0) return 'Some of the crew are ashore with you. Send them back aboard first.';
  if (hold > 0) return 'Empty the hold first. The shipmaster does not buy cargo.';
  return null;
}

export const SHIPYARD_TEXT = Object.freeze({
  bought: (name, port) => `${name} is yours, laid up at ${port || 'this port'}. Press Bring here to have it brought to the quay.`,
  boughtParts: (name) => `${name} are in your pack. Use them by the water to launch the ship.`,
  heavy: (name) => `${name} weigh more than you can carry. Lighten your pack first.`,
  crossed: 'This ship came in through customs, so the shipmaster won\'t buy it. It stays yours.',
  sold: (name, gold) => `The shipmaster buys ${name} for ${Math.round(gold).toLocaleString('en-US')} gold.`,
  short: (gold) => `The shipmaster asks ${Math.round(gold).toLocaleString('en-US')} gold. You don't have enough.`,
  notPort: 'The shipmaster deals in ships at his own yard.',
  noSail: 'Turn on Come Sail Away in the mod settings and reload to buy a ship here.',
  steal: 'The shipmaster never takes an eye off his yard.',
});

export { BOAT_PARTS_TEMPLATE, BOAT_DEED_TEMPLATE };
