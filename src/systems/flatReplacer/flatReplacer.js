// BUNNYFALL WEEB1: FLAT REPLACER, RUNNING - the records the attached Weeberfall carries, and the switch for its
// Dibellan Degeneracy add-on. The law is flatReplacerLaw.js; the stand of the chosen picture is
// scenes/flatReplacerStand.js; the store that feeds this is systems/modPacks/modPacks.js.
//
// Two groups of files: Weeberfall's own (always read while it is attached) and the add-on's (read only while its switch
// is on - the add-on is "settings the mod uses": records over Weeberfall's own pictures).
//
// ONE RECORD IS NEVER READ. Dibellan Degeneracy's third entry, which its author describes as a "Loli Prostitute
// Trainer" (flat 184_32 drawn as 21869_27, portrait 820). Bunnyfall does not carry it; the add-on's other records
// stand, among them the Nord trainer over the same flat.

import { parseFlatRecords, indexFlatRecords, chooseFlatReplacement, flatPortrait, flatNameBank, LOCATION } from './flatReplacerLaw.js';
import { getPref, setPref } from '../../ui/uiPrefs.js';
import { textureReplacementEnabled } from '../../render/textureReplacement.js';

export const DIBELLAN_PREF = 'weeberfallDibellan';

/** The record Bunnyfall leaves out (see the head of the file). */
export const isExcludedFlatRecord = (r) => (r.replaceArchive === 21869 && r.replaceRecord === 27) || /\bloli\b/i.test(r.description ?? '');

let _base = [];
let _addon = [];
let _index = null;
let _gen = 0;
let _errors = [];

const rebuild = () => {
  const list = dibellanOn() ? [..._base, ..._addon] : _base;
  _index = list.length ? indexFlatRecords(list) : null;
  _gen++;
};

/** Load the files: `{ base: [{ name, text }], addon: [{ name, text }] }`. A file that will not read is skipped and kept
 *  in `flatReplacerErrors()`. Answers how many records stand. */
export function setFlatReplacerSources({ base = [], addon = [] } = {}) {
  _errors = [];
  const read = (files) => files.flatMap(({ name, text }) => {
    try { return parseFlatRecords(text).filter((r) => !isExcludedFlatRecord(r)); } catch (e) { _errors.push(`${name}: ${e?.message ?? e}`); return []; }
  });
  _base = read(base);
  _addon = read(addon);
  rebuild();
  return _base.length + _addon.length;
}
export const flatReplacerErrors = () => [..._errors];
export const flatReplacerCounts = () => ({ base: _base.length, addon: _addon.length });
/** Bumps when the records or the switch change - a room built before draws its old pictures until it is entered again. */
export const flatReplacerGeneration = () => _gen;

/** The add-on's switch: off until the player turns it on. */
export const dibellanOn = () => getPref(DIBELLAN_PREF) === true;
export function setDibellanOn(on) {
  const saved = setPref(DIBELLAN_PREF, !!on);
  rebuild();
  return saved;
}

/** The record an interior NPC wears, or null. `pn` is a collectInteriorPeople person (its drawn flat), `place` is
 *  { region, building: { factionId, buildingType, quality }, socialGroup, nameSeed, dungeon }. Behind Replace Game
 *  Artwork, as every mod picture is. */
export function flatReplacementFor(pn, place = {}) {
  if (!_index || !pn || !textureReplacementEnabled()) return null;
  return chooseFlatReplacement(_index, {
    archive: pn.drawArchive ?? pn.textureArchive, record: pn.drawRecord ?? pn.textureRecord,
    factionId: pn.factionID ?? 0, nameSeed: place.nameSeed ?? 0, isQuestNpc: !!pn.questBehaviour,
  }, {
    location: place.dungeon ? LOCATION.Dungeon : LOCATION.Building,
    region: place.region ?? -1, building: place.building ?? null, socialGroup: place.socialGroup ?? -1,
  });
}

/** The talk window's portrait for a person standing as a replacement, or null to keep the usual one. */
export const flatReplacerPortrait = (pn, factionData = null) => flatPortrait(pn?.flatSwap ?? null, factionData);
/** The name bank a replacement gives its person, or null. */
export const flatReplacerNameBank = (pn) => flatNameBank(pn?.flatSwap ?? null);

/** Test seam. */
export function _resetFlatReplacer() { _base = []; _addon = []; _index = null; _errors = []; _gen++; }
