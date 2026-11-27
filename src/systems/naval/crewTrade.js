// @ts-check
import { CREW, exchangeOf } from './tradeGoods.js';
import { yardOffer } from './navalYard.js';
import { playerCrewCount } from './crewLife.js';
import { FIRST_MATE, serviceOf } from './shipCrew.js';
import { t } from '../../ui/textManager.js';

export const CREW_LEAST = 1;

export const yardHandPrice = (discount = 0) => yardOffer({ hull: 1, maxHull: 1, sail: 1, maxSail: 1, crew: 0, maxCrew: 1 }, 0, 0, { discount }).rows.find((r) => r.id === 'crew')?.price ?? 0;
// One gold under the shipwright's price, so hiring at the yard and selling at the exchange never makes a profit.
export const crewPayMost = (discount = 0) => Math.max(1, Math.ceil(yardHandPrice(discount) - 1e-9) - 1);

/**
 * @param {{ key: string, crown?: string|null, ether?: boolean }} port
 * @param {number} day
 * @param {{ dealt?: { sold?: any, bought?: any }, edge?: number, town?: { ask: number, pay: number } | null, discount?: number }} [o]
 */
export function crewRowOf(port, day, { dealt = {}, edge = 0, town = null, discount = 0 } = {}) {
  const r = exchangeOf(port, day, dealt, edge, town, true)[0];
  return { ...r, buy: Math.min(r.buy, crewPayMost(discount)) };
}

/** @param {{ hull: number, crew: number, hands?: readonly { name: string }[], away?: { has: (name: string) => boolean } | null, crossed?: boolean }} o */
export function crewSpare({ hull, crew, hands = [], away = null, crossed = false }) {
  // A ship that came into the realm through customs keeps all of her crew.
  if (crossed) return { n: 0, why: CREW_TRADE_TEXT.crossed };
  const now = Math.max(0, Math.floor(Number(crew) || 0));
  const party = hands.filter((h) => away?.has?.(h?.name));
  // The shore party's places, plus one named hand aboard beside them.
  const need = party.length ? party.length + 1 : 0;
  let least = CREW_LEAST;
  while (least < now && playerCrewCount(hull, least) < need) least++;
  const n = Math.max(0, now - least);
  return { n, why: n > 0 ? null : now > CREW_LEAST && party.length ? CREW_TRADE_TEXT.ashore(party.at(-1).name) : CREW_TRADE_TEXT.lastMan };
}
/** @param {readonly any[]} hands @param {{ has: (name: string) => boolean } | null} [away] */
export function signOffOrder(hands, away = null) {
  const worth = (h, i) => [h.role === FIRST_MATE ? 1 : 0, h.role !== 'Deckhand' ? 1 : 0, h.hall ? 1 : 0, serviceOf(h), -i];
  const before = (a, b) => { for (let j = 0; j < a.length; j++) if (a[j] !== b[j]) return a[j] - b[j]; return 0; };
  return hands.map((h, i) => ({ h, w: worth(h, i) })).filter(({ h }) => !away?.has?.(h.name)).sort((a, b) => before(a.w, b.w)).map(({ h }) => h);
}
/** @param {readonly { name: string, role: string }[]} hands */
export const handsNamed = (hands) => hands.map((h) => `${h.name} (${h.role})`).join(', ');
/** @param {{ crew: number, maxCrew: number }} d */
export const crewRoom = (d) => Math.max(0, Math.floor((Number(d?.maxCrew) || 0) - (Number(d?.crew) || 0)));

export const CREW_TRADE_TEXT = Object.freeze({
  bought: (n, gold) => t('sea.crew.bought', 'Signed on {n, plural, one {# man} other {# men}} for {gold, number} gold.', { n, gold }),
  sold: (n, gold) => t('sea.crew.sold', 'Signed off {n, plural, one {# man} other {# men}} for {gold, number} gold.', { n, gold }),
  short: (gold) => t('sea.crew.short', 'Not enough gold. It costs {gold, number} gold a man.', { gold }),
  get noneToday() { return t('sea.crew.noneToday', 'The exchange has no more sailors to sign on today.'); },
  get noneWanted() { return t('sea.crew.noneWanted', 'The exchange will take no more crew today.'); },
  get full() { return t('sea.crew.full', 'The ship has her whole crew aboard.'); },
  get noCrew() { return t('sea.crew.noCrew', 'This ship carries no crew.'); },
  get crossed() { return t('sea.crew.crossed', 'This ship came through customs with her crew. The exchange will not take them.'); },
  ashore: (who) => t('sea.crew.ashore', '{who} is in your shore party. Send them back aboard first.', { who }),   // AUDIT CREW-TRADE H2: on deck at the helm, his place kept for the shore
  signedOn: (names) => t('sea.crew.signedOn', 'Signed on: {names}.', { names }),   // AUDIT CREW-TRADE H3
  paidOff: (names) => t('sea.crew.paidOff', 'Paid off: {names}.', { names }),   // AUDIT CREW-TRADE H1
  get fighting() { return t('sea.crew.fighting', 'Not while the ship is in combat.'); },
  get lastMan() { return t('sea.crew.lastMan', 'That is your last crew member. The ship would have nobody aboard.'); },
  get charter() { return t('sea.crew.charter', 'The crew belongs to the captain. You only booked passage.'); },   // AUDIT CREW-TRADE E1
  get title() { return t('sea.crew.title', 'Crew'); },
  buyAt: (gold, left) => t('sea.crew.buyAt', 'buy at {gold, number} gold a man ({left} left today)', { gold, left }),
  sellAt: (gold, wanted) => t('sea.crew.sellAt', 'sell at {gold, number} gold ({wanted} wanted)', { gold, wanted }),
  get noneToBuy() { return t('sea.crew.noneToBuy', 'none to sign on today'); },
  get noneTaken() { return t('sea.crew.noneTaken', 'none wanted today'); },
});
