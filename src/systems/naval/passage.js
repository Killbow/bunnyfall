// @ts-check
import { HULL } from './navalShips.js';
import { calculateTripCost } from '../../travel/travel.js';
import { sceneCompassWord } from '../../ui/compassWords.js';
import { VOYAGE_LANDFALL_PX } from '../../travel/travelRoute.js';
import { t } from '../../ui/textManager.js';

// Never the Rowboat, whose rower tires offshore, or the Large Galley, which never moors.
export const PASSAGE_HULLS = Object.freeze([HULL.LargeBoat, HULL.SmallShip, HULL.Carrack]);
export const PASSAGE_LEAVE_M = 20;
export const PASSAGE_RAY_M = 8;
export const PASSAGE_OFF_S = 1.5;
export const PASSAGE_RESUME_S = 20;
export const PASSAGE_FIRST_S = 2;
export const PASSAGE_RESUMES = 3;
export const PASSAGE_SLOW = 3;

// The longest axis, as classic Daggerfall counts travel steps.
export const passagePixels = (from, to) => Math.max(Math.abs((to.x | 0) - (from.x | 0)), Math.abs((to.y | 0) - (from.y | 0)));

// Classic Daggerfall's ship fare, with every pixel of the voyage counted as sea.
export const passageFare = (from, to) => calculateTripCost(0, Math.max(1, passagePixels(from, to)), { travelShip: true }).totalCost;

export function passageWind(from, to) {
  // Map y runs south, so it is flipped to the scene's north.
  const dx = (to.x | 0) - (from.x | 0), dn = (from.y | 0) - (to.y | 0);
  return dx || dn ? sceneCompassWord(dx, dn) : '';
}

/**
 * @param {readonly any[]} ports
 * @param {{ x: number, y: number }} here
 * @param {{ hereKey?: string | null, known?: (port: any) => boolean }} [opts]
 */
export function passageDestinations(ports, here, { hereKey = null, known = () => true } = {}) {
  const out = [];
  for (const port of ports ?? []) {
    if (!port?.name || port.key === hereKey || !known(port)) continue;
    const to = { x: port.px, y: port.py };
    if (passagePixels(here, to) <= VOYAGE_LANDFALL_PX) continue;
    out.push({ port, fare: passageFare(here, to), bearing: passageWind(here, to), pixels: passagePixels(here, to) });
  }
  return out.sort((a, b) => a.pixels - b.pixels || a.port.name.localeCompare(b.port.name));
}

/**
 * @param {{ x: number, y: number }} from
 * @param {{ x: number, y: number }} to
 * @param {{ kinds: readonly string[] } | null} plan
 */
export function voyageSails(from, to, plan) {
  if (!plan) return false;
  // Near her own port the plan is only the landfall and the walk in, which still counts as sailing.
  return plan.kinds.includes('sea') || passagePixels(from, to) <= VOYAGE_LANDFALL_PX;
}

// The record is saved with the boat, so a record from a save is read through this.
export function charterRecord(x) {
  const to = x?.to;
  if (!to || typeof to.name !== 'string' || !to.name || !Number.isFinite(to.px) || !Number.isFinite(to.py)) return null;
  return {
    to: { name: to.name, px: to.px | 0, py: to.py | 0 },
    ship: typeof x.ship === 'string' ? x.ship : null,
    captain: typeof x.captain === 'string' ? x.captain : null,
    fare: Math.max(0, Math.floor(Number(x.fare) || 0)),
  };
}

const ship = (name) => name ?? t('passage.theShip', 'The ship');
const WIND_TEXT = Object.freeze({
  north: () => t('passage.wind.north', 'north'), 'north-east': () => t('passage.wind.northEast', 'north-east'),
  east: () => t('passage.wind.east', 'east'), 'south-east': () => t('passage.wind.southEast', 'south-east'),
  south: () => t('passage.wind.south', 'south'), 'south-west': () => t('passage.wind.southWest', 'south-west'),
  west: () => t('passage.wind.west', 'west'), 'north-west': () => t('passage.wind.northWest', 'north-west'),
});
const windText = (w) => WIND_TEXT[w]?.() ?? w;
export const PASSAGE_TEXT = Object.freeze({
  hint: (name) => t('passage.hint', '{ship} lies at her berth. Activate to book passage.', { ship: ship(name) }),
  row: (d) => (d.bearing
    ? t('passage.row', '{port}: {wind}, {fare} gold', { port: d.port.name, wind: windText(d.bearing), fare: d.fare })
    : t('passage.rowHere', '{port}: {fare} gold', { port: d.port.name, fare: d.fare })),
  ask: (name, dest, fare, gold) => [
    t('passage.ask', 'Book passage on {ship} to {port}?', { ship: ship(name), port: dest }),
    t('passage.askFare', 'The fare is {fare} gold. You have {gold}.', { fare, gold }),
    t('passage.askRule', 'Her master sails you there. Step off her and the passage ends.'),
  ],
  booked: (name, captain, fare, dest) => (captain
    ? t('passage.bookedCaptain', 'Captain {captain} takes your {fare} gold. {ship} sails for {port}.', { captain, fare, ship: ship(name), port: dest })
    : t('passage.booked', 'Her master takes your {fare} gold. {ship} sails for {port}.', { fare, ship: ship(name), port: dest })),
  poor: (fare) => t('passage.poor', 'You cannot afford the fare of {fare} gold.', { fare }),
  get none() { return t('passage.none', 'Her master knows of no port you have heard of to sail for.'); },
  get noSail() { return t('passage.noSail', 'No ship can carry you while Come Sail Away is off.'); },
  get booking() { return t('passage.booking', 'You have a passage booked already.'); },
  get ether() { return t('passage.ether', 'Her master only sails these isles. The Bay’s ports are beyond the Veil.'); },
  get gone() { return t('passage.gone', 'She has cast off.'); },
  get failed() { return t('passage.failed', 'Her master cannot make ready to sail.'); },
  get noWay() { return t('passage.noWay', 'Her master knows no way there by sea from here.'); },
  helm: (dest) => t('passage.helm', 'Go to her helm to sail on for {port}. Her master steers from there.', { port: dest }),
  stuck: (dest) => t('passage.stuck', 'Her master can’t find a way on toward {port} from here. He’ll try again. Step ashore to end the passage.', { port: dest }),
  holds: (dest) => t('passage.holds', 'Her master holds his course for {port}.', { port: dest }),
  get goods() { return t('passage.goods', 'What you put in her hold is carried off her.'); },
  comesIn: (name, dest) => t('passage.comesIn', '{ship} comes in to {port}\'s quay.', { ship: ship(name), port: dest }),
  madeFast: (name, dest) => t('passage.madeFast', '{ship} is made fast at {port}\'s quay. Take the gangway ashore.', { ship: ship(name), port: dest }),
  get quayFoul() { return t('passage.quayFoul', 'Her way in to the quay is blocked. Her master puts you ashore instead.'); },
  ended: (name) => t('passage.ended', '{ship} stands out to sea.', { ship: ship(name) }),
});
export const passageHintText = (name) => PASSAGE_TEXT.hint(name);
