// @ts-check
import { setItemFields, mintCondition } from '../../items/itemTemplates.js';
import { ENEMY_BASICS, enemyDisplayName } from '../../characters/enemyBasics.js';
import { getLocalizedEnemyName, t } from '../../ui/textManager.js';
import { TROPHY_TEMPLATE, trophyFoeOf, trophyNameIndexOf } from '../../net/trophyLaw.js';
import { HUNT_MARK_NAMES } from '../../net/huntLaw.js';
import { hideOfFoe, HIDES, HIGH_HIDE_TIER } from '../../net/professionLaw.js';
import { BOUNTY_TIERS } from '../../guilds/bountyBoard.js';
import { noteGathered } from './gatheredLog.js';
import { addItem } from '../../items/inventory.js';

// Must stay `UselessItems2`: the item law assigns that group to every custom template index it does not name.
export const TROPHY_GROUP = 'UselessItems2';

export function trophyArchiveOf(/** @type {number} */ foe) {
  const own = Number(/** @type {any} */ (ENEMY_BASICS)[foe]?.maleTexture);
  if (Number.isSafeInteger(own) && own > 0) return own;
  const kin = hideOfFoe(foe)?.foes?.find((f) => Number.isSafeInteger(/** @type {any} */ (ENEMY_BASICS)[f]?.maleTexture));
  return kin == null ? null : Number(/** @type {any} */ (ENEMY_BASICS)[kin].maleTexture);
}
export const TROPHY_BEASTS = Object.freeze([...new Set([...BOUNTY_TIERS.flatMap((t) => t.foes),
  ...HIDES.filter((h) => h.tier >= HIGH_HIDE_TIER).flatMap((h) => h.foes)])].filter((f) => /** @type {any} */ (ENEMY_BASICS)[f] && trophyArchiveOf(f) != null));
export const trophyBeastName = (/** @type {number} */ foe) => getLocalizedEnemyName(foe, enemyDisplayName(foe) ?? '?');
export function trophyTitle(/** @type {number} */ foe, /** @type {number|null} */ nameIndex = null) {
  const beast = trophyBeastName(foe);
  const name = nameIndex == null ? null : HUNT_MARK_NAMES[nameIndex];
  return name ? t('hunt.mark.title', '{name} the {beast}', { name, beast }) : beast;
}
export const trophyItemName = (/** @type {number} */ foe, /** @type {number|null} */ nameIndex = null) => t('hunt.trophy.item', 'Trophy: {beast}', { beast: trophyTitle(foe, nameIndex) });
export const trophyTitleOf = (/** @type {any} */ item) => { const foe = trophyFoeOf(item); return foe == null ? null : trophyTitle(foe, trophyNameIndexOf(item)); };

/**
 * `message` holds the beast and `variant` holds the mark name index plus one (0 for none), as `trophyLaw.js` reads
 * them.
 * @param {number} foe
 * @param {{ nameIndex?: number|null, day?: number|null }} [o]
 */
export function mintTrophy(foe, { nameIndex = null, day = null } = {}) {
  const archive = trophyArchiveOf(foe);
  if (archive == null || !Number.isSafeInteger(foe) || foe < 0) return null;
  const named = Number.isSafeInteger(nameIndex) && /** @type {number} */ (nameIndex) >= 0 && /** @type {number} */ (nameIndex) < HUNT_MARK_NAMES.length;
  const item = mintCondition(setItemFields({
    group: TROPHY_GROUP, templateIndex: TROPHY_TEMPLATE, material: 0, flags: 0, variant: named ? /** @type {number} */ (nameIndex) + 1 : 0, message: foe,
    stackCount: 1, worldTextureArchive: archive, worldTextureRecord: 0, name: trophyItemName(foe, named ? nameIndex : null),
  }));
  if (Number.isSafeInteger(day)) noteGathered('trophies', foe, /** @type {number} */ (day));
  return item;
}
export function giveTrophy(/** @type {any} */ entity, /** @type {number} */ foe, /** @type {{ nameIndex?: number|null, day?: number|null }} */ o = {}) {
  const item = mintTrophy(foe, o);
  if (!item || !entity) return null;
  addItem((entity.items ??= []), item);
  return item;
}
export function giveTrophySaved(/** @type {any} */ entity, /** @type {number} */ foe, /** @type {() => void} */ saved, /** @type {{ nameIndex?: number|null }} */ o = {}) {
  const item = giveTrophy(entity, foe, { ...o, day: Math.floor(Date.now() / 86_400_000) });
  if (item) saved?.();
  return !!item;
}
export const trophyDoor = (/** @type {{ changed: () => void }} */ saveSoon) => (/** @type {number} */ foe, /** @type {any} */ entity) => giveTrophySaved(entity, foe, () => saveSoon.changed());
