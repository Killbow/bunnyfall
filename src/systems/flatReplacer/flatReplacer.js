import { parseFlatRecords, indexFlatRecords, chooseFlatReplacement, flatPortrait, flatNameBank, LOCATION } from './flatReplacerLaw.js';
import { getPref, setPref } from '../../ui/uiPrefs.js';
import { textureReplacementEnabled } from '../../render/textureReplacement.js';

export const DIBELLAN_PREF = 'weeberfallDibellan';

// Drops one Dibellan Degeneracy record (the flat drawn as 21869_27) and any record whose description matches this
// pattern; the game never carries them.
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
// Rooms built before a bump keep their old pictures until they are entered again.
export const flatReplacerGeneration = () => _gen;

export const dibellanOn = () => getPref(DIBELLAN_PREF) === true;
export function setDibellanOn(on) {
  const saved = setPref(DIBELLAN_PREF, !!on);
  rebuild();
  return saved;
}

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

export const flatReplacerPortrait = (pn, factionData = null) => flatPortrait(pn?.flatSwap ?? null, factionData);
export const flatReplacerNameBank = (pn) => flatNameBank(pn?.flatSwap ?? null);

export function _resetFlatReplacer() { _base = []; _addon = []; _index = null; _errors = []; _gen++; }
