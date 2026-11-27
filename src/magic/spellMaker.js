// Spell maker rules, ported from Daggerfall Unity (MIT, Daggerfall Workshop). A made spell is a classic SPELLS.STD
// record with a negative index, so it casts like a stock spell; saves store the whole record (saves/save.js).

import { calculateCastCost, effectCost } from './spellcost.js';
import { skillValue } from '../characters/skills.js';
import { MAGIC_ONLY_KEYS } from './effects.js';
import { totalGoldAmount, deductGold } from '../justice/court.js';
import { localizedText } from '../ui/textManager.js';

export const TARGET_FLAGS = Object.freeze({
  CasterOnly: 1, ByTouch: 2, SingleTargetAtRange: 4, AreaAroundCaster: 8, AreaAtRange: 16,
});
export const ELEMENT_FLAGS = Object.freeze({ Fire: 1, Cold: 2, Poison: 4, Shock: 8, Magic: 16 });
export const TARGET_FLAGS_ALL = 31;
export const TARGET_FLAGS_SELF = 1;
export const TARGET_FLAGS_OTHER = 30;
export const ELEMENT_FLAGS_ALL = 31;
export const ELEMENT_FLAGS_MAGIC_ONLY = 16;
// Target and element indexes follow the enum order, so each index is the bit position of its flag.
export const flagOfIndex = (i) => (1 << i);

const SELF_TARGET_KEYS = new Set([
  '2,255', '6,0', '6,1', '6,2', '14,255', '15,255', '16,255', '17,255', '25,255',
  '29,255', '39,0', '39,1', '39,2', '40,255', '43,255', '44,255',
  '46,255',
  '49,255', '51,255', '52,255', '53,255',
]);
const OTHER_TARGET_KEYS = new Set([
  '0,255', '1,0', '1,1', '1,2', '4,0', '4,1', '4,2', '5,255', '7,0',
  '7,1', '7,2', '7,3', '7,4', '7,5', '7,6', '7,7', '11,0', '11,1',
  '11,2', '11,3', '11,4', '11,5', '11,6', '11,7', '11,8', '11,9', '12,255',
  '33,0', '33,1', '33,2', '33,3', '34,255',
  '47,255', '48,255', '50,255', '54,255',
]);

export const allowedTargetsOf = (type, subType) => {
  const k = `${type},${subType}`;
  if (SELF_TARGET_KEYS.has(k)) return TARGET_FLAGS_SELF;
  if (OTHER_TARGET_KEYS.has(k)) return TARGET_FLAGS_OTHER;
  return TARGET_FLAGS_ALL;
};
export const allowedElementsOf = (type, subType) =>
  (MAGIC_ONLY_KEYS.has(`${type},${subType}`) ? ELEMENT_FLAGS_MAGIC_ONLY : ELEMENT_FLAGS_ALL);

export function updateAllowedButtons(slots) {
  const used = (slots ?? []).filter((sl) => sl && sl.type != null);
  // With no effects, DFU resets the selection to Caster Only and Magic; forced tells the caller to reset.
  if (used.length === 0) {
    return { targets: TARGET_FLAGS_ALL, elements: ELEMENT_FLAGS_MAGIC_ONLY, forced: true };
  }
  let targets = TARGET_FLAGS_ALL;
  let elements = ELEMENT_FLAGS_MAGIC_ONLY;
  for (const sl of used) {
    targets &= allowedTargetsOf(sl.type, sl.subType);
    elements |= allowedElementsOf(sl.type, sl.subType);
  }
  return { targets, elements, forced: false };
}
export const DEFAULT_TARGET_INDEX = 0;
export const DEFAULT_ELEMENT_INDEX = 4;

export const firstAllowedIndex = (flags) => {
  for (let i = 0; i < 5; i++) if (flags & flagOfIndex(i)) return i;
  return -1;
};

export function enforceSelected(index, flags) {
  if (flags & flagOfIndex(index)) return index;
  const first = firstAllowedIndex(flags);
  return first === -1 ? index : first;
}

export function cycleAllowed(index, dir, flags) {
  if (!(flags & (flags - 1))) return firstAllowedIndex(flags) === -1 ? index : firstAllowedIndex(flags);
  let i = index;
  for (let n = 0; n < 5; n++) {
    i = (i + dir + 5) % 5;
    if (flags & flagOfIndex(i)) return i;
  }
  return index;
}

export const MAX_EFFECTS_PER_SPELL = 3;
export const DEFAULT_SPELL_ICON = 1;
export const SPELL_ICON_COUNT = 69;
// The added icon pack (public/art/spell-icons/pack.png) follows the classic icons, so index 69 is its first.
export const SPELL_ICON_PACK_COUNT = 154;
export const SPELL_ICON_TOTAL = SPELL_ICON_COUNT + SPELL_ICON_PACK_COUNT;
export const MAX_SPELL_NAME = 31;

export const SPINNER_RANGES = Object.freeze({
  durationBase: [1, 60], durationMod: [1, 60], durationPerLevel: [1, 20],
  chanceBase: [1, 100], chanceMod: [1, 100], chancePerLevel: [1, 20],
  magnitudeBaseLow: [1, 100], magnitudeBaseHigh: [1, 100],
  magnitudeLevelBase: [1, 100], magnitudeLevelHigh: [1, 100], magnitudePerLevel: [1, 20],
});

export function blankEffectSettings() {
  const s = {};
  for (const k of Object.keys(SPINNER_RANGES)) s[k] = 1;
  return s;
}

// A made Spell Absorption caps its chanceBase at 50, the same cap absorption.js puts on the live chance.
export const SPELL_ABSORPTION_KEY = '20,255';
export const SPELL_ABSORPTION_CHANCE_BASE_MAX = 50;
export function spinnerRange(field, effectKey = null) {
  const r = SPINNER_RANGES[field];
  if (r && field === 'chanceBase' && effectKey === SPELL_ABSORPTION_KEY) return [r[0], SPELL_ABSORPTION_CHANCE_BASE_MAX];
  return r;
}

export const clampSetting = (field, v, effectKey = null) => {
  const r = spinnerRange(field, effectKey);
  if (!r) return v;
  return Math.max(r[0], Math.min(r[1], Math.trunc(v)));
};

export function applyPairRules(settings, changed) {
  if (changed === 'magnitudeBaseLow' && settings.magnitudeBaseLow > settings.magnitudeBaseHigh) {
    settings.magnitudeBaseHigh = settings.magnitudeBaseLow;
  } else if (changed === 'magnitudeBaseHigh' && settings.magnitudeBaseHigh < settings.magnitudeBaseLow) {
    settings.magnitudeBaseLow = settings.magnitudeBaseHigh;
  } else if (changed === 'magnitudeLevelBase' && settings.magnitudeLevelBase > settings.magnitudeLevelHigh) {
    settings.magnitudeLevelHigh = settings.magnitudeLevelBase;
  } else if (changed === 'magnitudeLevelHigh' && settings.magnitudeLevelHigh < settings.magnitudeLevelBase) {
    settings.magnitudeLevelBase = settings.magnitudeLevelHigh;
  }
  return settings;
}

export function stepSetting(settings, field, delta, effectKey = null) {
  const next = { ...settings };
  next[field] = clampSetting(field, (next[field] ?? 1) + delta, effectKey);
  return applyPairRules(next, field);
}

export function setSetting(settings, field, value, effectKey = null) {
  const next = { ...settings };
  next[field] = clampSetting(field, Number(value), effectKey);
  return applyPairRules(next, field);
}

let _nextCustomIndex = -1;
// Ready-made spells sold in shops use indexes at or below this ceiling, and made spells never do. The seed skips
// ready-made indexes, so a restored save never mints a made spell onto one.
export const READY_MADE_INDEX_CEILING = -45000;
export const isReadyMadeSpellIndex = (i) => Number.isInteger(i) && i <= READY_MADE_INDEX_CEILING;
export function mintCustomSpellIndex() { return _nextCustomIndex--; }
export function seedCustomSpellIndex(spells) {
  for (const sp of spells ?? []) {
    if (typeof sp?.index === 'number' && !isReadyMadeSpellIndex(sp.index) && sp.index <= _nextCustomIndex) _nextCustomIndex = sp.index - 1;
  }
}
export function _resetCustomIndexForTests() { _nextCustomIndex = -1; }

const emptyEffect = () => ({
  type: -1, subType: -1,
  durationBase: 0, durationMod: 0, durationPerLevel: 0,
  chanceBase: 0, chanceMod: 0, chancePerLevel: 0,
  magnitudeBaseLow: 0, magnitudeBaseHigh: 0, magnitudeLevelBase: 0, magnitudeLevelHigh: 0, magnitudePerLevel: 0,
});

export function buildCustomSpell({ slots, rangeType = 0, element = 4, name = '', icon = DEFAULT_SPELL_ICON, index = null }) {
  const effects = [];
  for (const s of slots ?? []) {
    if (!s || s.type == null || s.type < 0) continue;
    const st = { ...blankEffectSettings(), ...(s.settings ?? {}) };
    if (`${s.type},${s.subType ?? -1}` === SPELL_ABSORPTION_KEY && st.chanceBase > SPELL_ABSORPTION_CHANCE_BASE_MAX) st.chanceBase = SPELL_ABSORPTION_CHANCE_BASE_MAX;
    effects.push({
      type: s.type, subType: s.subType ?? -1,
      durationBase: st.durationBase, durationMod: st.durationMod, durationPerLevel: st.durationPerLevel,
      chanceBase: st.chanceBase, chanceMod: st.chanceMod, chancePerLevel: st.chancePerLevel,
      magnitudeBaseLow: st.magnitudeBaseLow, magnitudeBaseHigh: st.magnitudeBaseHigh,
      magnitudeLevelBase: st.magnitudeLevelBase, magnitudeLevelHigh: st.magnitudeLevelHigh,
      magnitudePerLevel: st.magnitudePerLevel,
    });
    if (effects.length >= MAX_EFFECTS_PER_SPELL) break;
  }
  while (effects.length < MAX_EFFECTS_PER_SPELL) effects.push(emptyEffect());
  return {
    effects, element, rangeType, name,
    icon: ((icon % SPELL_ICON_TOTAL) + SPELL_ICON_TOTAL) % SPELL_ICON_TOTAL,
    cost: 0,
    index: index ?? mintCustomSpellIndex(),
    custom: true,
  };
}

export function spellMakerCost(spell, entity) { return calculateCastCost(spell, entity); }

// DFU's per-effect label has no target multiplier or 5-point floor, so it can read lower than the spell's total.
export function editedEffectCost(slot, entity) {
  if (!slot || slot.type == null || slot.type < 0) return { gold: 0, sp: 0 };
  const st = { ...blankEffectSettings(), ...(slot.settings ?? {}) };
  return effectCost({ type: slot.type, subType: slot.subType ?? -1, ...st }, (id) => skillValue(entity, id));
}

export const SPELLBOOK_TEMPLATE_INDEX = 132;
export const NO_SPELLBOOK_ID = 1703;
export const SPELLMAKER_NOT_ENOUGH_GOLD_ID = 1702;
export const MUST_CHOOSE_NAME_ID = 1704;
export const SPELL_INSCRIBED_ID = 1705;
export const NO_EFFECTS_TEXT = 'You must add at least one effect to this spell.';
export const noEffectsText = () => localizedText('noEffectsError', NO_EFFECTS_TEXT);

export const hasSpellbook = (entity) => (entity?.items ?? []).some(
  (it) => it.group === 'MiscItems' && it.templateIndex === SPELLBOOK_TEMPLATE_INDEX);

// DFU's order: spellbook, effects, gold, then name, so a name is asked for only when everything else passes.
export function validateSpellPurchase({ entity, slots, goldCost, name }) {
  if (!hasSpellbook(entity)) return { ok: false, textId: NO_SPELLBOOK_ID };
  const used = (slots ?? []).filter((s) => s && s.type != null && s.type >= 0);
  if (!used.length) return { ok: false, text: noEffectsText() };
  // Counts coins plus letters of credit (DFU GetGoldAmount); the window's gold label shows coins only, as in DFU.
  if (totalGoldAmount(entity) < goldCost) return { ok: false, textId: SPELLMAKER_NOT_ENOUGH_GOLD_ID };
  if (!name || !String(name).trim()) return { ok: false, textId: MUST_CHOOSE_NAME_ID };
  return { ok: true };
}

export function purchaseSpell(entity, spell, goldCost) {
  deductGold(entity, goldCost);
  entity.spells = entity.spells ?? [];
  entity.spells.push(spell);
  return spell;
}
