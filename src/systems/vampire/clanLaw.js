// @ts-check
// BUNNYFALL VAMPIRE EXPANSION, PHASE 3 (2026-11-20, the owner's blueprint section 5): THE NINE BLOODLINES' LAW. Pure, but
// for the one leaf it reads (whose Courts hunt the player, courtLeaf.js - a leaf, so this stays importable everywhere).
//
// TERRITORY: each clan holds the Iliac Bay regions the blueprint gives it (CLAN_TERRITORY, region indices of
// formats/mapsFile.js REGION_NAMES); a region in none answers no clan. Its COURT sits in its SEAT - the hub city
// (systems/region/regionHubs.js) of the first of CLAN_SEATS' regions that has one.
// IDENTITY: each clan has a STRENGTH and a BANE, applied where the rule they bend lives.
//   Anthotis   + vials keep better blood and give more        - beast blood in a feed gives nothing (a blow's mouthful still feeds), any not Scholar's 3/4.
//   Garlythi   + prisoners never escape, despair slower         - poor (<35%), Worker, or Beast blood gives 3/5.
//   Haarvenu   + a blow drinks twice the blood                  - the Vitae burns away a fifth faster.
//   Khulari    + captives come in healthier, their blood richer - no Kiss on anyone awake, so no taking after it.
//   Lyrezi     + a Blood Slot more, social thralls cheaper      - the Beast's tells show a stage early.
//   Montalion  + the Kiss costs half                            - a breach counts twice with the Court.
//   Selenu     + the sun takes half                             - stale blood (a prisoner, a vial) gives half.
//   Thrafey    + prisoners suffer half, tending heals more      - a lethal drain gives half (revulsion).
//   Vraseth    + Running and Jumping +10                         - wounded below half, the Beast reads a stage worse.
// A clan's own Court hunting the player (a Blood Hunt) WITHHOLDS its strength until the penance is done; the bane
// stays.

import { VAMPIRE_CLANS } from '../../afflictions/infection.js';
import { huntedBy } from './courtLeaf.js';
import { t } from '../../ui/textManager.js';

const C = VAMPIRE_CLANS;
/** The regions each clan holds (blueprint section 5). */
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
/** Where each Court sits: the first of these regions with a hub city. */
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
/** Each clan's sworn enemy (the blueprint's rivalries; Vraseth's enemy is no clan, so its Court sends it after the Selenu). */
export const CLAN_RIVAL = Object.freeze({
  [C.Anthotis]: C.Thrafey, [C.Garlythi]: C.Lyrezi, [C.Haarvenu]: C.Montalion, [C.Khulari]: C.Anthotis, [C.Lyrezi]: C.Garlythi,
  [C.Montalion]: C.Selenu, [C.Selenu]: C.Montalion, [C.Thrafey]: C.Anthotis, [C.Vraseth]: C.Selenu,
});
/** Every clan id. */
export const CLANS = Object.freeze(Object.keys(CLAN_TERRITORY).map(Number));

const REGION_CLAN = new Map();
for (const [clan, regions] of Object.entries(CLAN_TERRITORY)) for (const r of regions) REGION_CLAN.set(r, Number(clan));
/** The clan that holds a region, or null. @param {number} regionIndex */
export const clanOfRegion = (regionIndex) => REGION_CLAN.get(regionIndex) ?? null;

/** A clan's name. @param {number} clan */
export function clanName(clan) {
  const n = Object.entries(C).find(([, v]) => v === clan)?.[0] ?? 'Lyrezi';
  return t(`vampire.clan.${n.toLowerCase()}`, n);
}

/**
 * The Courts' cities: mapId -> clan, each clan's seat the hub of the first of its seat regions with one.
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

/** Whether a clan's strength is with the vampire: not while its own Court hunts them. @param {number} clan */
export const strengthOn = (clan) => !huntedBy(clan);

// ── the rules each clan bends ─────────────────────────────────────────────────────────
/** The share of a feed that Worker blood, Beast blood, or blood under 35% quality gives a Garlythi. */
export const GARLYTHI_POOR = 0.6;
/** The least share of a feed of 10 or more Vitae that a bane leaves, unless the bane gives nothing (Anthotis on beast
 *  blood). */
export const BANE_FLOOR = 0.5;
/**
 * A feed's Vitae, by the clan: `kind` a FEEDS key, `type` the blood, `quality` its %. Answers the multiplier.
 * @param {number} clan @param {string} kind @param {string} type @param {number} quality
 */
export function clanFeedMul(clan, kind, type, quality) {
  let m = 1;
  const s = strengthOn(clan);
  switch (clan) {
    case C.Anthotis:
      if (type === 'beast' && kind !== 'wound') m *= 0; else if (type !== 'scholar') m *= 0.75;   // a blow's mouthful is always Beast blood: it must still feed an Anthotis
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
/** The Vitae's day's drain, by the clan (Haarvenu's fever). */
export const clanDrainMul = (clan) => (clan === C.Haarvenu ? 1.2 : 1);
/** The Kiss's price (Montalion's half). @param {number} clan @param {number} cost */
export const clanKissCost = (clan, cost) => (clan === C.Montalion && strengthOn(clan) ? Math.ceil(cost / 2) : cost);
/** Whether the Kiss can be given to one awake (Khulari's bane). */
export const clanKissesAwake = (clan) => clan !== C.Khulari;
/** Stale blood's ceiling (Anthotis keep it better). @param {number} clan @param {number} cap */
export const clanStaleCap = (clan, cap) => (clan === C.Anthotis && strengthOn(clan) ? 80 : cap);
/** How many stages worse the Beast reads for its tells and impulses. @param {number} clan @param {{ health?: number, maxHealth?: number }} entity */
export function clanStageShift(clan, entity) {
  if (clan === C.Lyrezi) return 1;
  if (clan === C.Vraseth && Number(entity?.maxHealth) > 0 && Number(entity?.health) < Number(entity.maxHealth) / 2) return 1;
  return 0;
}
/** The sun's share by day (Selenu take half). @param {number} clan @param {number} mod */
export const clanSunMod = (clan, mod) => (clan === C.Selenu && mod < 0 && strengthOn(clan) ? Math.round(mod / 2) : mod);
/** Skill gifts (Vraseth). @param {number} clan */
export const clanSkillMods = (clan) => (clan === C.Vraseth && strengthOn(clan) ? { 21: 10, 3: 10 } : {});   // Running, Jumping
/** Extra Blood Slots (Lyrezi). */
export const clanExtraSlots = (clan) => (clan === C.Lyrezi && strengthOn(clan) ? 1 : 0);
/** A social thrall's daily Vitae (Lyrezi pay less). @param {number} clan @param {number} cost */
export const clanSocialUpkeep = (clan, cost) => (clan === C.Lyrezi && strengthOn(clan) ? Math.max(1, cost - 1) : cost);
/** Prisoners never escape (Garlythi), and despair slower. */
export const clanFortress = (clan) => clan === C.Garlythi && strengthOn(clan);
/** A prisoner's suffering under the knife, and the tending's healing, by the clan (Thrafey). */
export const clanGentle = (clan) => clan === C.Thrafey && strengthOn(clan);
/** A captive's coming (Khulari: healthier, richer). */
export const clanCaptor = (clan) => clan === C.Khulari && strengthOn(clan);
/** How many strikes a breach counts with a Court (Montalion: two). */
export const clanStrikeWeight = (clan) => (clan === C.Montalion ? 2 : 1);

/** The strength's and the bane's words, for the Court window. @param {number} clan */
export function clanIdentityWords(clan) {
  switch (clan) {
    case C.Anthotis: return [t('clan.anthotis.s', 'Strength: your vials keep better blood and give more.'), t('clan.anthotis.b', 'Bane: beast blood gives you nothing in a feed, and any but a Scholar\'s less. A blow\'s mouthful still feeds you.')];
    case C.Garlythi: return [t('clan.garlythi.s', 'Strength: your prisoners never escape, and despair slower.'), t('clan.garlythi.b', 'Bane: Worker blood, Beast blood, and any blood under 35% quality give you only three fifths of the usual Vitae.')];
    case C.Haarvenu: return [t('clan.haarvenu.s', 'Strength: your blows drink twice the blood.'), t('clan.haarvenu.b', 'Bane: a fever in your veins burns your Vitae faster.')];
    case C.Khulari: return [t('clan.khulari.s', 'Strength: captives come in healthier, their blood richer.'), t('clan.khulari.b', 'Bane: you cannot give the Kiss to anyone awake.')];
    case C.Lyrezi: return [t('clan.lyrezi.s', 'Strength: one more Blood Slot, and your enthralled cost less.'), t('clan.lyrezi.b', 'Bane: the Beast shows in you a stage early.')];
    case C.Montalion: return [t('clan.montalion.s', 'Strength: the Kiss costs you half.'), t('clan.montalion.b', 'Bane: every breach counts twice with the Court.')];
    case C.Selenu: return [t('clan.selenu.s', 'Strength: the sun takes only half from you.'), t('clan.selenu.b', 'Bane: stale blood, from prisoners and vials, gives you half.')];
    case C.Thrafey: return [t('clan.thrafey.s', 'Strength: your prisoners suffer less, and tending heals them more.'), t('clan.thrafey.b', 'Bane: a killing feed sickens you, and gives only half the usual Vitae.')];
    case C.Vraseth: return [t('clan.vraseth.s', 'Strength: Running and Jumping +10.'), t('clan.vraseth.b', 'Bane: wounded below half, the Beast pulls harder.')];
    default: return [];
  }
}
