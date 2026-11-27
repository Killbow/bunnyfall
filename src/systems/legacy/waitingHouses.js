// @ts-check
import { MODELS, isAlive, personOf, fullNameOf, setCurrent, touch, newbornAllowed, addChild, rollSiblings } from './family.js';
import { loadFamily, storeFamily, leaveBirth } from './store.js';
import { t } from '../../ui/textManager.js';

export const DEFAULT_BIRTH_PLACE = Object.freeze({ region: 'Daggerfall', loc: 'Daggerfall' });

/**
 * @param {any[]} families
 * @param {{ played?: (characterId: string) => boolean, settings?: any }} [opts]
 */
export function waitingHouses(families, { played = () => false, settings = null } = {}) {
  const out = [];
  for (const family of Array.isArray(families) ? families : []) {
    const pend = family?.pending;
    if (!pend || family.ended != null || !Array.isArray(family.people)) continue;
    const heirs = family.people
      .filter((p) => isAlive(p) && (p.kind ?? 'member') === 'member' && p.retired == null && p.id !== pend.fallenId)
      .filter((p) => !(p.characterId && played(String(p.characterId))))
      .sort((a, b) => (a.gen | 0) - (b.gen | 0) || a.id - b.id);
    const fallen = personOf(family, pend.fallenId);
    const newborn = newbornOffered(family, fallen, settings);
    if (heirs.length || newborn) out.push({ family, fallen, heirs, newborn });
  }
  return out;
}

export const houseWaitsTitle = (family) => `The house of ${family?.surname || 'your family'} waits`;
export function houseWaitsLine(family, fallen) {
  const who = fallen ? fullNameOf(fallen.given, fallen.surname) : 'Its last member';
  return `${who} ${family?.model === MODELS.enduring ? 'has died of their years' : 'has fallen'}, and the house's Succession was never answered. Choose who carries the line on.`;
}
export const heirButtonLabel = (p) => `Carry on as ${fullNameOf(p.given, p.surname)}${p.minor ? ' (comes of age)' : ''}`;
export const newbornButtonLabel = (fallen) => t('legacy.houseWaits.newborn', 'Raise a child of {name} as your heir', { name: fallen?.given || fallen?.surname || '' });
const newbornOffered = (family, fallen, settings) => !!fallen && (fallen.retired != null || newbornAllowed(family, fallen, settings));

/** @param {{ storage: any, tab: any, familyId: string, personId: number | null, now?: number, newborn?: boolean, settings?: any, rng?: () => number }} a */
export function takeUpLine({ storage, tab, familyId, personId, now = Date.now(), newborn = false, settings = null, rng = Math.random }) {
  const family = loadFamily(storage, familyId);
  if (!family) return { ok: false, why: 'That house is not on this device. Play any character on this account online once, then try again.' };
  // Read before `touch` bumps the rev, so `storeFamily` judges staleness against the rev this copy was loaded at.
  const base = family.rev;
  let heir = null;
  if (newborn) {
    const fallen = personOf(family, family.pending?.fallenId);
    if (!family.pending || !newbornOffered(family, fallen, settings)) return { ok: false, why: t('legacy.houseWaits.noNewborn', 'No heir can be raised for that house.') };
    const at = family.pending.at ?? 0;
    heir = addChild(family, fallen.id, { rng, at, settings }).person;
    rollSiblings(family, heir.id, { rng, at, settings });
  } else heir = personOf(family, personId);
  if (!heir || !isAlive(heir) || (heir.kind ?? 'member') !== 'member' || heir.retired != null || heir.id === family.pending?.fallenId) {
    return { ok: false, why: 'That member of the family cannot take up the line.' };
  }
  heir.minor = false;
  // A null `characterId` makes `takeUpLine` hand `takeBorn` a birth at the boot instead of a save to load.
  heir.characterId = null;
  setCurrent(family, heir.id);
  touch(family);
  if (!storeFamily(storage, family, base)) return { ok: false, why: 'The family record could not be saved on this device. Free some space and try again.' };
  const place = family.seat?.region && family.seat?.loc ? family.seat : DEFAULT_BIRTH_PLACE;
  if (!leaveBirth(tab, { familyId: family.id, personId: heir.id, region: place.region, loc: place.loc, estate: 0, ...(newborn ? { newborn: true } : {}) }, now)) {
    return { ok: false, why: 'The new heir could not be saved in this window. Try again.' };
  }
  return { ok: true, family, heirId: heir.id, place: { region: place.region, loc: place.loc } };
}
