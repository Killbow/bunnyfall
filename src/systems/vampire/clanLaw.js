// @ts-check
// Clan territory, Court seats, and each clan's strength and bane. A strength is withheld while the clan's own Court
// hunts the player (strengthOn); a bane always applies.

import { VAMPIRE_CLANS } from '../../afflictions/infection.js';
import { huntedBy } from './courtLeaf.js';
import { t } from '../../ui/textManager.js';

const C = VAMPIRE_CLANS;
export const CLAN_TERRITORY = Object.freeze({
  [C.Anthotis]: Object.freeze([0, 56, 55, 11, 48]),
  [C.Garlythi]: Object.freeze([32, 38]),
  [C.Haarvenu]: Object.freeze([21, 60, 42]),
  [C.Khulari]: Object.freeze([1, 53, 49, 54, 51]),
  [C.Lyrezi]: Object.freeze([34, 9, 35, 33, 26, 16]),
  [C.Montalion]: Object.freeze([23, 22, 36, 57, 52, 50]),
  [C.Selenu]: Object.freeze([20, 43, 47, 61, 44, 46, 45]),
  [C.Thrafey]: Object.freeze([41, 5, 40, 39]),
  [C.Vraseth]: Object.freeze([17, 18, 19, 59, 37, 58]),
});
export const CLAN_SEATS = Object.freeze({
  [C.Anthotis]: Object.freeze([56, 55, 11, 48, 0]),
  [C.Garlythi]: Object.freeze([32, 38]),
  [C.Haarvenu]: Object.freeze([21, 60, 42]),
  [C.Khulari]: Object.freeze([53, 49, 54, 51, 1]),
  [C.Lyrezi]: Object.freeze([34, 33, 35, 9, 26, 16]),
  [C.Montalion]: Object.freeze([23, 22, 36, 57, 52, 50]),
  [C.Selenu]: Object.freeze([20, 47, 44, 43, 61, 46, 45]),
  [C.Thrafey]: Object.freeze([41, 5, 40, 39]),
  [C.Vraseth]: Object.freeze([17, 18, 19, 58, 37, 59]),
});
export const CLAN_RIVAL = Object.freeze({
  [C.Anthotis]: C.Thrafey, [C.Garlythi]: C.Lyrezi, [C.Haarvenu]: C.Montalion, [C.Khulari]: C.Anthotis, [C.Lyrezi]: C.Garlythi,
  [C.Montalion]: C.Selenu, [C.Selenu]: C.Montalion, [C.Thrafey]: C.Anthotis, [C.Vraseth]: C.Selenu,
});
export const CLANS = Object.freeze(Object.keys(CLAN_TERRITORY).map(Number));

const REGION_CLAN = new Map();
for (const [clan, regions] of Object.entries(CLAN_TERRITORY)) for (const r of regions) REGION_CLAN.set(r, Number(clan));
/** @param {number} regionIndex */
export const clanOfRegion = (regionIndex) => REGION_CLAN.get(regionIndex) ?? null;

/** @param {number} clan */
export function clanName(clan) {
  const n = Object.entries(C).find(([, v]) => v === clan)?.[0] ?? 'Lyrezi';
  return t(`vampire.clan.${n.toLowerCase()}`, n);
}

/**
 * @param {(regionIndex: number) => ({ mapId: number, name: string } | null)} hubOfRegion
 * @returns {Map<number, { clan: number, name: string, regionIndex: number }>}
 */
export function courtSeats(hubOfRegion) {
  const out = new Map();
  for (const [clan, regions] of Object.entries(CLAN_SEATS)) {
    for (const r of regions) {
      const hub = hubOfRegion(r);
      if (!hub) continue;
      out.set(hub.mapId >>> 0, { clan: Number(clan), name: hub.name, regionIndex: r });
      break;
    }
  }
  return out;
}

/** @param {number} clan */
export const strengthOn = (clan) => !huntedBy(clan);

export const GARLYTHI_POOR = 0.6;
export const BANE_FLOOR = 0.5;
/**
 * @param {number} clan
 * @param {string} kind
 * @param {string} type
 * @param {number} quality
 */
export function clanFeedMul(clan, kind, type, quality) {
  let m = 1;
  const s = strengthOn(clan);
  switch (clan) {
    case C.Anthotis:
      // A blow's mouthful is always Beast blood, and it must still feed an Anthotis.
      if (type === 'beast' && kind !== 'wound') m *= 0; else if (type !== 'scholar') m *= 0.75;
      if (s && kind === 'vial') m *= 1.35;
      break;
    case C.Garlythi:
      if (quality < 35 || type === 'worker' || type === 'beast') m *= GARLYTHI_POOR;
      break;
    case C.Haarvenu:
      if (s && kind === 'wound') m *= 2;
      break;
    case C.Selenu:
      if (kind === 'tap' || kind === 'vial') m *= 0.5;
      break;
    case C.Thrafey:
      if (kind === 'drain') m *= 0.25;
      break;
    default: break;
  }
  return m;
}
export const clanDrainMul = (clan) => (clan === C.Haarvenu ? 1.2 : 1);
/** @param {number} clan @param {number} cost */
export const clanKissCost = (clan, cost) => (clan === C.Montalion && strengthOn(clan) ? Math.ceil(cost / 2) : cost);
export const clanKissesAwake = (clan) => clan !== C.Khulari;
/** @param {number} clan @param {number} cap */
export const clanStaleCap = (clan, cap) => (clan === C.Anthotis && strengthOn(clan) ? 80 : cap);
/** @param {number} clan @param {{ health?: number, maxHealth?: number }} entity */
export function clanStageShift(clan, entity) {
  if (clan === C.Lyrezi) return 1;
  if (clan === C.Vraseth && Number(entity?.maxHealth) > 0 && Number(entity?.health) < Number(entity.maxHealth) / 2) return 1;
  return 0;
}
/** @param {number} clan @param {number} mod */
export const clanSunMod = (clan, mod) => (clan === C.Selenu && mod < 0 && strengthOn(clan) ? Math.round(mod / 2) : mod);
// Skill 21 is Running and skill 3 is Jumping.
/** @param {number} clan */
export const clanSkillMods = (clan) => (clan === C.Vraseth && strengthOn(clan) ? { 21: 10, 3: 10 } : {});
export const clanExtraSlots = (clan) => (clan === C.Lyrezi && strengthOn(clan) ? 1 : 0);
/** @param {number} clan @param {number} cost */
export const clanSocialUpkeep = (clan, cost) => (clan === C.Lyrezi && strengthOn(clan) ? Math.max(1, cost - 1) : cost);
export const clanFortress = (clan) => clan === C.Garlythi && strengthOn(clan);
export const clanGentle = (clan) => clan === C.Thrafey && strengthOn(clan);
export const clanCaptor = (clan) => clan === C.Khulari && strengthOn(clan);
export const clanStrikeWeight = (clan) => (clan === C.Montalion ? 2 : 1);

/** @param {number} clan */
export function clanIdentityWords(clan) {
  switch (clan) {
    case C.Anthotis: return [t('clan.anthotis.s', 'Strength: your vials store better blood and give you more.'), t('clan.anthotis.b', 'Bane: feeding on beast blood gives you nothing, and any blood other than a Scholar\'s gives less. Blood drawn by your blows still feeds you.')];
    case C.Garlythi: return [t('clan.garlythi.s', 'Strength: your prisoners never escape and despair more slowly.'), t('clan.garlythi.b', 'Bane: Worker blood, Beast blood, and any blood under 35% quality give you only three fifths of the usual Vitae.')];
    case C.Haarvenu: return [t('clan.haarvenu.s', 'Strength: your blows drain twice as much blood.'), t('clan.haarvenu.b', 'Bane: a fever in your veins burns your Vitae faster.')];
    case C.Khulari: return [t('clan.khulari.s', 'Strength: captives arrive healthier and with richer blood.'), t('clan.khulari.b', 'Bane: you cannot give the Kiss to anyone awake.')];
    case C.Lyrezi: return [t('clan.lyrezi.s', 'Strength: you gain one extra Blood Slot, and your enthralled cost less.'), t('clan.lyrezi.b', 'Bane: the Beast shows one stage earlier.')];
    case C.Montalion: return [t('clan.montalion.s', 'Strength: the Kiss costs half as much.'), t('clan.montalion.b', 'Bane: every breach counts twice with the Court.')];
    case C.Selenu: return [t('clan.selenu.s', 'Strength: the sun weakens you only half as much.'), t('clan.selenu.b', 'Bane: stale blood from prisoners and vials gives only half the usual Vitae.')];
    case C.Thrafey: return [t('clan.thrafey.s', 'Strength: your prisoners suffer less, and tending heals them more.'), t('clan.thrafey.b', 'Bane: a killing feed sickens you and gives only half the usual Vitae.')];
    case C.Vraseth: return [t('clan.vraseth.s', 'Strength: Running and Jumping +10.'), t('clan.vraseth.b', 'Bane: the Beast pulls harder when you are below half health.')];
    default: return [];
  }
}
