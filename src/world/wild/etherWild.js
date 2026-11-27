// @ts-check
import { BANDS, ETHER_WORD, inEther, inVeil, etherBandAt, veilhaven, islesNear } from '../ethericSea.js';
import { WILD_RINGS, wildRingAt, wildRingLoot, registerZoneWords } from '../wildZone.js';
import { t } from '../../ui/textManager.js';

export const ETHER_KIND = 'ether';
export const ETHER_PEACE_PX = 12;

export const ETHER_RISE_PX = 60;
export function etherRisePort(x, y) {
  const h = veilhaven(), far = Math.hypot(h.px - x, h.py - y);
  if (!Number.isFinite(far)) return h;
  if (etherInPeace(x, y)) return h;
  for (let r = ETHER_RISE_PX; ; r *= 2) {
    const port = islesNear(x, y, Math.min(r, far + 1)).find((i) => i.kind === 'port' && Math.hypot(i.px - x, i.py - y) <= r);
    if (port) return port;
    if (r > far) return h;
  }
}
export function etherRiseSite(x, y) {
  const port = etherRisePort(x, y);
  return { mapPixel: { x: port.px, y: port.py }, kind: 'city' };
}

export function etherInPeace(x, y) {
  if (inVeil(x, y)) return true;
  const h = veilhaven();
  if (Math.hypot(x - h.px, y - h.py) <= ETHER_PEACE_PX) return true;
  return inEther(x, y) && x >= h.px && Math.abs(y - h.py) <= ETHER_PEACE_PX;
}

export function etherWildRingAt(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !inEther(x, y) || etherInPeace(x, y)) return 0;
  return Math.max(1, Math.min(WILD_RINGS, BANDS.indexOf(etherBandAt(x)) + 1));
}

export function wildRingAtPlace(loc) {
  const at = loc?.mapTableData;
  if (!Number.isFinite(at?.longitude) || !Number.isFinite(at?.latitude)) return 0;
  const px = Math.trunc(at.longitude / 128), py = 499 - Math.trunc(at.latitude / 128);
  return loc?.ether ? etherWildRingAt(px, py) : wildRingAt(px, py);
}

export const etherRingName = (ring) => BAND_NAMES[BANDS[Math.max(1, Math.min(WILD_RINGS, ring | 0 || WILD_RINGS)) - 1].id]();
const BAND_NAMES = Object.freeze({
  shallows: () => t('sea.wild.band.shallows', 'The Shallows'),
  reaches: () => t('sea.wild.band.reaches', 'The Reaches'),
  deep: () => t('sea.wild.band.deep', 'The Deep Aether'),
  abyss: () => t('sea.wild.band.abyss', 'The Abyss'),
});

export const etherRingBonus = (/** @type {number} */ ring) => t('sea.wild.bonus', '+{pct}% loot', { pct: Math.round((wildRingLoot(ring) - 1) * 100) });
const WAY_WORDS = Object.freeze({
  north: () => t('sea.way.n', 'north'), 'north-north-east': () => t('sea.way.nne', 'north-north-east'), 'north-east': () => t('sea.way.ne', 'north-east'), 'east-north-east': () => t('sea.way.ene', 'east-north-east'),
  east: () => t('sea.way.e', 'east'), 'east-south-east': () => t('sea.way.ese', 'east-south-east'), 'south-east': () => t('sea.way.se', 'south-east'), 'south-south-east': () => t('sea.way.sse', 'south-south-east'),
  south: () => t('sea.way.s', 'south'), 'south-south-west': () => t('sea.way.ssw', 'south-south-west'), 'south-west': () => t('sea.way.sw', 'south-west'), 'west-south-west': () => t('sea.way.wsw', 'west-south-west'),
  west: () => t('sea.way.w', 'west'), 'west-north-west': () => t('sea.way.wnw', 'west-north-west'), 'north-west': () => t('sea.way.nw', 'north-west'), 'north-north-west': () => t('sea.way.nnw', 'north-north-west'),
});
export const etherWayWord = (/** @type {string | null | undefined} */ point) => (point ? WAY_WORDS[/** @type {keyof typeof WAY_WORDS} */ (point)]?.() ?? point : '');

export const ETHER_WILD_TEXT = Object.freeze({
  enter: () => t('sea.wild.enter', 'You sail out of Veilhaven\'s peace onto the open {word} Ocean, an open PvP zone. Foes here are four times as strong. If another player kills you, you drop what you carry.', { word: ETHER_WORD }),   // FOE-KEEPS
  leave: () => t('sea.wild.leave', 'You are in Veilhaven\'s peace. No player may attack you here.'),
  ring: (r) => t('sea.wild.ring', '{band}: {bonus}.', { band: etherRingName(r), bonus: etherRingBonus(r) }),
  ringCross: (r, deeper) => (deeper
    ? t('sea.wild.deeper', 'Deeper. {band}: {bonus}.', { band: etherRingName(r), bonus: etherRingBonus(r) })
    : t('sea.wild.shallower', 'Back toward the Veil. {band}: {bonus}.', { band: etherRingName(r), bonus: etherRingBonus(r) })),
  chipTip: () => t('sea.wild.chipTip', 'The {word} Ocean past Veilhaven\'s peace: other players may attack you. Foes are four times as strong and drop up to twice the loot (25% more in the Shallows, twice in the Abyss). If another player kills you, you drop what you carry.', { word: ETHER_WORD }),
  deathHold: () => t('sea.wild.deathHold', 'Past the Veil the dead wait two minutes.'),
  teleport: () => t('sea.wild.teleport', 'You cannot teleport into, out of or about the open {word} Ocean. Sail.', { word: ETHER_WORD }),
  walkInto: () => t('sea.wild.walkInto', 'It leads onto the open {word} Ocean past Veilhaven\'s peace, an open PvP zone. Other players may kill you there and take what you carry.', { word: ETHER_WORD }),
  quiet: () => t('sea.wild.quiet', 'You are out of the open {word} Ocean\'s PvP zone. No player may attack you here.', { word: ETHER_WORD }),
  truce: () => t('sea.wild.truce', 'No longer in your party. On the open {word} Ocean you and they cannot fight for ten minutes. Then you are strangers.', { word: ETHER_WORD }),
  dropLate: () => t('sea.wild.dropLate', 'What you dropped when you died at sea has left your pack. It lies where you fell.'),
  burntLate: () => t('sea.wild.burntLate', 'What you dropped when you died at sea has left your pack. This character\'s trading is frozen, so it was lost.'),
  unstuckOut: () => t('sea.wild.unstuckOut', '/unstuck does not work outdoors on the open {word} Ocean.', { word: ETHER_WORD }),
  revenantOne: () => t('sea.wild.revenantOne', 'Only one revenant may walk at your side on the open {word} Ocean.', { word: ETHER_WORD }),
});

registerZoneWords(ETHER_KIND, {
  name: `${ETHER_WORD} Ocean`,
  ringName: etherRingName,
  get enter() { return ETHER_WILD_TEXT.enter(); },
  get leave() { return ETHER_WILD_TEXT.leave(); },
  ring: ETHER_WILD_TEXT.ring,
  ringCross: ETHER_WILD_TEXT.ringCross,
  get chipTip() { return ETHER_WILD_TEXT.chipTip(); },
  get deathHold() { return ETHER_WILD_TEXT.deathHold(); },
  get walkInto() { return ETHER_WILD_TEXT.walkInto(); },
  get quiet() { return ETHER_WILD_TEXT.quiet(); },
  get truce() { return ETHER_WILD_TEXT.truce(); },
  get dropLate() { return ETHER_WILD_TEXT.dropLate(); },
  burntLate: ETHER_WILD_TEXT.burntLate,
  get unstuckOut() { return ETHER_WILD_TEXT.unstuckOut(); },
  get revenantOne() { return ETHER_WILD_TEXT.revenantOne(); },
});
