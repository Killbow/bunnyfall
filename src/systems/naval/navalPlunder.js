// @ts-check
import { mulberry32 } from '../../combat/bloodArt.js';
import { NOTORIETY } from './navalLaw.js';
import { HULL_PRICES } from './comeSailAwayBoat.js';
import { hullBuild } from './navalShips.js';
import { STORE_POINTS } from './navalYard.js';

export const HOLD_KEYS = Object.freeze({
  pirate: Object.freeze(['S', 'E', 'Q']),
  merchant: Object.freeze(['Q', 'N', 'P', 'J']),
  navy: Object.freeze(['T', 'F', 'J']),
});
export const STRONGBOX_KEY = 'J';
export const LEGEND_STRONGBOXES = 2;
export const strongboxesOf = (shipClass) => (shipClass?.legend ? LEGEND_STRONGBOXES : shipClass?.flagship ? 1 : 0);
// A cask's lot goes on the wire as its index here, so the order of HOLD_KEYS and this list must not change.
export const LOT_KEYS = Object.freeze([...new Set([...Object.values(HOLD_KEYS).flat(), STRONGBOX_KEY])]);
/** @type {readonly ('repair'|'powder'|'press'|'papers')[]} */
export const CHOICES = Object.freeze(['repair', 'powder', 'press', 'papers']);
export const PAPERS_NOTORIETY = NOTORIETY.board;
export const REPAIR_SHARE = 0.4;
export const PRESS_SHARE = 0.6;
export const FLOTSAM_OF = 0.5;
export const PRIZE_DEED_SHARE = 0.25;
export const prizeDeedValue = (hull) => Math.round(HULL_PRICES[hull] * PRIZE_DEED_SHARE);
export const HOLD_RARITY_TIER = Object.freeze({ merchant: 5, pirate: 6, navy: 8 });
export const STRONGBOX_RARITY_TIER = 11;
export const holdTier = (shipClass, strongbox = false) => (strongbox ? STRONGBOX_RARITY_TIER : HOLD_RARITY_TIER[shipClass?.faction] ?? HOLD_RARITY_TIER.merchant);

export function holdKeys(shipClass, seed) {
  const keys = HOLD_KEYS[shipClass.faction] ?? HOLD_KEYS.merchant;
  // Drawn from the ship's seed, so the hold is the same whoever takes her.
  const rng = mulberry32((seed ^ 0x401d) >>> 0);
  const lots = Math.max(1, Math.min(4, shipClass.cargo | 0));
  const out = [];
  for (let i = 0; i < lots; i++) out.push(keys[Math.floor(rng() * keys.length) % keys.length]);
  for (let i = Math.max(0, lots - strongboxesOf(shipClass)); i < lots; i++) out[i] = STRONGBOX_KEY;
  return out;
}

// Never one of LOT_KEYS; the wire carries it on a key of its own.
export const SALVAGE_LOT = 'salvage';
export const SALVAGE_SHARE = 0.4;
export const SALVAGE_BARRELS = 2;
export const isSalvage = (lot) => lot === SALVAGE_LOT;
export function salvageOf(shipClass) {
  if (!shipClass) return { stores: 0, barrels: 0 };
  return {
    stores: Math.max(1, Math.round((shipClass.hullHp * SALVAGE_SHARE) / STORE_POINTS)),
    barrels: hullBuild(shipClass.hull).gun ? SALVAGE_BARRELS : 0,
  };
}

export function flotsamKeys(shipClass, seed) {
  if (shipClass?.fisher) return [];
  const keys = holdKeys(shipClass, seed);
  return keys.slice(0, Math.max(1, Math.round(keys.length * FLOTSAM_OF)));
}

export function drawHold(shipClass, seed, generate) {
  const items = [];
  const keys = holdKeys(shipClass, seed), boxes = strongboxesOf(shipClass);
  keys.forEach((key, i) => {
    const strongbox = i >= keys.length - boxes;
    for (const it of generate(key, holdTier(shipClass, strongbox)) ?? []) items.push(it);
  });
  return items;
}

/**
 * @param {'repair'|'powder'|'press'|'papers'} choice
 * @param {{ maxHull: number, hull: number, maxSail: number, sail: number, maxCrew: number, crew: number }} mine
 * @param {{ barrelStock?: number, notoriety?: number }} [armament]
 */
export function choiceEffect(choice, mine, { barrelStock = 0, notoriety = 0 } = {}) {
  if (choice === 'repair') return { repair: { hull: Math.round(mine.maxHull * REPAIR_SHARE), sail: Math.round(mine.maxSail * REPAIR_SHARE) } };
  if (choice === 'powder') return { barrels: barrelStock, reload: true };
  if (choice === 'press') return { crew: Math.ceil((mine.maxCrew - mine.crew) * PRESS_SHARE) };
  if (choice === 'papers') return { notoriety: -Math.min(Math.max(0, notoriety), PAPERS_NOTORIETY) };
  return {};
}

export const CHOICE_TITLES = Object.freeze({ repair: 'Timber and cordage', powder: 'Powder and shot', press: 'Press the crew', papers: 'Burn the papers' });
export const PIRATE_PAPERS_TITLE = 'Hand the crew to the crown';

/**
 * @param {'repair'|'powder'|'press'|'papers'} choice
 * @param {{ maxHull: number, hull: number, maxSail: number, sail: number, maxCrew: number, crew: number }} mine
 * @param {{ barrelStock?: number, barrels?: number, barrelGuns?: boolean, loaded?: boolean, guns?: boolean }} [armament]
 * @param {{ notoriety?: number, lawful?: boolean, crown?: string }} [law]
 */
export function choiceOffer(choice, mine, { barrelStock = 0, barrels = 0, barrelGuns = false, loaded = false, guns = true } = {}, { notoriety = 0, lawful = true, crown = '' } = {}) {
  const fx = choiceEffect(choice, mine, { barrelStock, notoriety });
  const title = choice === 'papers' && !lawful ? PIRATE_PAPERS_TITLE : CHOICE_TITLES[choice] ?? choice;
  if (choice === 'repair') {
    const hull = Math.max(0, Math.min(fx.repair.hull, Math.round(mine.maxHull - mine.hull)));
    const sail = Math.max(0, Math.min(fx.repair.sail, Math.round(mine.maxSail - mine.sail)));
    const useful = hull > 0 || sail > 0;
    return { id: choice, title, useful, detail: useful ? `Mend ${[hull > 0 ? `${hull} of hull` : null, sail > 0 ? `${sail} of canvas` : null].filter(Boolean).join(' and ')}` : 'Your ship is sound' };
  }
  if (choice === 'powder') {
    if (!guns) return { id: choice, title, useful: false, detail: 'No guns aboard' };
    const topUp = barrelGuns && barrels < barrelStock;
    const useful = !loaded || topUp;
    return { id: choice, title, useful, detail: useful ? `Every gun loaded${barrelGuns ? `, fire barrels to ${barrelStock}` : ''}` : 'Your guns are loaded' };
  }
  if (choice === 'press') {
    const n = Math.max(0, fx.crew | 0);
    return { id: choice, title, useful: n > 0, detail: mine.maxCrew <= 0 ? 'No berths for them' : n > 0 ? `${n} ${n === 1 ? 'hand' : 'hands'} to your guns` : 'Your crew is whole' };
  }
  if (choice === 'papers') {
    const n = -(fx.notoriety ?? 0);
    const waters = crown ? `${crown}'s waters` : 'these waters';
    return { id: choice, title, useful: n > 0, detail: n > 0 ? `Your notoriety in ${waters} falls by ${n}` : `No one hunts you in ${waters}` };
  }
  return { id: choice, title, useful: false, detail: '' };
}
