// @ts-check
// Picks the one glow a held weapon shows: its strongest elemental line, with ties in PROC_ELEMENTS order. The
// Morrowind hand shows the arcane look on an enchanted weapon with no element. Unidentified items show none.

import { readLines, validAffix, PROC_ELEMENTS, lootRarityOn, rarityKnown } from '../items/lootRarity.js';
import { isEnchanted } from '../items/inventory.js';
import { getPref } from '../ui/uiPrefs.js';
import { pageParam } from '../platform/pageQuery.js';
import { GLOW_SPRITE_WINDOW } from '../render/weaponGlowGlsl.js';

export const WEAPON_GLOW_PREF = 'weaponGlow';

export function weaponGlowOn(search = globalThis.location?.search ?? '', pref = getPref(WEAPON_GLOW_PREF)) {
  if (pageParam('weaponglow', search) === 'off') return false;
  return pref !== false;
}

export const GLOW_LOOKS = Object.freeze(['none', 'fire', 'frost', 'shock', 'arcane']);
// Indexes are the look codes the glow shaders read.
export const GLOW_CODE = Object.freeze(Object.fromEntries(GLOW_LOOKS.map((k, i) => [k, i])));

// Matches the elemental band edges in AFFIX_RANGES.elemental in items/lootRarity.js.
export const GLOW_LEVEL_EDGES = Object.freeze([3, 6]);
export const glowLevel = (total) => (total <= GLOW_LEVEL_EDGES[0] ? 1 : total <= GLOW_LEVEL_EDGES[1] ? 2 : 3);

const _sums = PROC_ELEMENTS.map(() => 0);
let _total = 0;
// Called every frame for the held weapon and every peer's, so it builds no object and leaves the total in _total.
function elementIndex(item, ladder) {
  _total = 0;
  if (!ladder || !item || !Array.isArray(item.affixes) || !rarityKnown(item)) return -1;
  _sums.fill(0);
  for (const a of readLines(item)) {
    if (a?.id !== 'elemental' || !validAffix(a)) continue;
    _sums[PROC_ELEMENTS.indexOf(a.param)] += a.value;
  }
  let best = -1;
  for (let i = 0; i < _sums.length; i++) if (_sums[i] > 0 && (best < 0 || _sums[i] > _sums[best])) best = i;
  if (best >= 0) _total = _sums[best];
  return best;
}

/**
 * @param {any} item
 * @param {{ ladder?: boolean }} [opts]
 */
export function weaponElement(item, { ladder = lootRarityOn() } = {}) {
  const i = elementIndex(item, ladder);
  return i < 0 ? null : { element: PROC_ELEMENTS[i], total: _total };
}

function specOf(item, arcane, on, ladder) {
  if (!item || !(on ?? weaponGlowOn())) return null;
  const i = elementIndex(item, ladder ?? lootRarityOn());
  if (i >= 0) return glowSpec(PROC_ELEMENTS[i], glowLevel(_total));
  return arcane && isEnchanted(item) ? glowSpec('arcane', ARCANE_LEVEL) : null;
}
export const ARCANE_LEVEL = 2;

/**
 * @param {any} item
 * @param {{ arcane?: boolean, on?: boolean, ladder?: boolean }} [opts]
 */
export function weaponGlow(item, { arcane = false, on, ladder } = {}) {
  const s = specOf(item, arcane, on, ladder);
  return s ? { look: s.look, level: s.level } : null;
}

export const GLOW_RAMPS = Object.freeze({
  fire: Object.freeze([[0.45, 0.06, 0.02], [0.88, 0.27, 0.04], [1.0, 0.62, 0.12], [1.0, 0.93, 0.62]]),
  frost: Object.freeze([[0.08, 0.2, 0.52], [0.25, 0.55, 0.92], [0.6, 0.85, 1.0], [0.92, 0.98, 1.0]]),
  shock: Object.freeze([[0.22, 0.1, 0.55], [0.48, 0.32, 1.0], [0.75, 0.7, 1.0], [0.97, 0.95, 1.0]]),
  arcane: Object.freeze([[0.3, 0.26, 0.78], [0.38, 0.5, 1.0], [0.6, 0.76, 1.0], [0.88, 0.94, 1.0]]),
});

export function glowRampFlat(look) {
  const r = Object.hasOwn(GLOW_RAMPS, look) ? GLOW_RAMPS[/** @type {keyof typeof GLOW_RAMPS} */ (look)] : null;
  return r ? new Float32Array(r.flat()) : null;
}

const SPEC_TABLE = (() => {
  /** @type {Record<string, ReadonlyArray<any>>} */
  const table = {};
  for (const look of GLOW_LOOKS.slice(1)) {
    const row = [null, null, null, null];
    for (const level of look === 'arcane' ? [ARCANE_LEVEL] : [1, 2, 3]) {
      row[level] = (Object.freeze({
        look, code: GLOW_CODE[/** @type {keyof typeof GLOW_CODE} */ (look)], level, word: `${look}${level}`,
        ramp: Object.freeze(GLOW_RAMPS[/** @type {keyof typeof GLOW_RAMPS} */ (look)].flat()),
        win: GLOW_SPRITE_WINDOW[/** @type {keyof typeof GLOW_SPRITE_WINDOW} */ (look)],
      }));
    }
    table[look] = Object.freeze(row);
  }
  return Object.freeze(table);
})();
export function glowSpec(look, level) {
  const row = typeof look === 'string' && Object.hasOwn(SPEC_TABLE, look) ? SPEC_TABLE[look] : null;
  return (row && Number.isInteger(level) && row[level]) || null;
}
// The ten words are exactly what LOOK_GLOW_RE in net/wire.js accepts; peers draw the glow from the word, since
// affixes never travel.
const SPEC_BY_WORD = new Map(Object.values(SPEC_TABLE).flatMap((row) => row.filter(Boolean)).map((s) => [s.word, s]));

// When this returns a spec, the rig swings the plain sheet, never the enchanted sheet under an element outline.
/**
 * @param {any} item
 * @param {{ on?: boolean, ladder?: boolean }} [opts]
 */
export const spriteGlow = (item, opts) => specOf(item, false, opts?.on, opts?.ladder);

/**
 * @param {any} item
 * @param {{ on?: boolean, ladder?: boolean }} [opts]
 */
export const meshGlow = (item, opts) => specOf(item, true, opts?.on, opts?.ladder);

export const glowWord = (spec) => spec?.word ?? null;
export const glowFromWord = (word) => (typeof word === 'string' ? SPEC_BY_WORD.get(word) ?? null : null);
