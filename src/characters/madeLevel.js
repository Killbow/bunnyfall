// @ts-check
import { isGateArena, COURT_TEXT } from '../world/gateArena.js';
import { isSdRealm, SD_REALM_TEXT } from '../world/sdRealm.js';
import { isEgHall } from '../world/eliteGates/egHall.js';
import { EG_TEXT } from '../net/eliteGates/egLaw.js';
import { isKetchShip } from '../world/ketch/ketchShip.js';
import { KT_WORDS } from '../systems/ketch/ketchWords.js';

export const MADE_LEVELS = Object.freeze(['court', 'hour', 'spire', 'ketch']);

/**
 * @param {any} loc
 * @returns {'court'|'hour'|'spire'|'ketch'|null}
 */
export const madeLevelOf = (loc) => (isGateArena(loc) ? 'court' : isSdRealm(loc) ? 'hour' : isEgHall(loc) ? 'spire' : isKetchShip(loc) ? 'ketch' : null);

export const EG_JUMP_BUFFER_S = 0.12;
export const EG_LATE_PRESS_S = 0.12;
export const EG_NO_FLIGHT_TEXT = 'The Spire\'s spans are walked, not flown.';

export const MADE_LEVEL_RULE_KEYS = Object.freeze(['save', 'rest', 'automap', 'mark', 'recall', 'portalStone', 'companions', 'regen', 'potions', 'levitate', 'slowfall',
  'techFlight', 'jumpBuffer', 'latePress', 'runLeap', 'resurrect', 'avoidDeath', 'death', 'deathPenalty', 'unstuck', 'says']);
const NONE_IS_ZERO = new Set(['jumpBuffer', 'latePress']);
const row = (o) => Object.freeze(Object.fromEntries(MADE_LEVEL_RULE_KEYS.map((k) => [k, o[k] ?? (NONE_IS_ZERO.has(k) ? 0 : null)])));
export const MADE_LEVEL_RULES = Object.freeze({
  court: row({ save: 'refused', rest: 'refused', automap: 'off', mark: 'refused', portalStone: 'refused', companions: 'out', regen: 'held', death: 'castOut', unstuck: 'refused', says: 'mid' }),
  hour: row({ save: 'refused', rest: 'refused', automap: 'off', mark: 'refused', recall: 'refused', portalStone: 'refused', companions: 'out', regen: 'held', levitate: 'banned',
    runLeap: 'refused', death: 'final', unstuck: 'wayHome', says: 'hour' }),
  spire: row({ save: 'refused', rest: 'refused', automap: 'off', mark: 'refused', recall: 'refused', portalStone: 'refused', companions: 'out', regen: 'held', potions: 'counted',
    levitate: 'banned', slowfall: 'banned', techFlight: 'refused', jumpBuffer: EG_JUMP_BUFFER_S, latePress: EG_LATE_PRESS_S, runLeap: 'refused', avoidDeath: 'refused', death: 'fall',
    deathPenalty: 'none', unstuck: 'refused', says: 'mid' }),
  ketch: row({ save: 'refused', rest: 'refused', automap: 'off', mark: 'refused', recall: 'refused', portalStone: 'refused', companions: 'out', regen: 'held', levitate: 'banned',
    slowfall: 'banned', techFlight: 'refused', runLeap: 'refused', avoidDeath: 'refused', death: 'fall', deathPenalty: 'none', unstuck: 'refused', says: 'mid' }),
});
export const MADE_LEVEL_TEXT = Object.freeze({
  court: Object.freeze({ save: COURT_TEXT.noSave, rest: COURT_TEXT.noRest, automap: COURT_TEXT.noMap, mark: COURT_TEXT.noMark, unstuck: COURT_TEXT.noUnstuck }),
  hour: Object.freeze({ save: SD_REALM_TEXT.noSave, rest: SD_REALM_TEXT.noRest, automap: SD_REALM_TEXT.noMap, mark: SD_REALM_TEXT.noMark, recall: SD_REALM_TEXT.noRecall }),
  spire: Object.freeze({ save: EG_TEXT.noSave, rest: EG_TEXT.noRest, automap: EG_TEXT.noMap, mark: EG_TEXT.noRecall, recall: EG_TEXT.noRecall,
    unstuck: `${EG_TEXT.noRecall} The way home stands at a Redoubt.`, techFlight: EG_NO_FLIGHT_TEXT }),
  ketch: Object.freeze({
    get save() { return KT_WORDS.noSave; }, get rest() { return KT_WORDS.noRest; }, get automap() { return KT_WORDS.noMap; }, get mark() { return KT_WORDS.noMark; },
    get recall() { return KT_WORDS.noRecall; }, get unstuck() { return KT_WORDS.noUnstuck; }, get techFlight() { return KT_WORDS.noFlight; },
  }),
});

/**
 * @param {string|null|undefined} level
 * @param {string} rule
 */
export function madeLevelRule(level, rule) {
  const r = level ? MADE_LEVEL_RULES[/** @type {'court'|'hour'|'spire'|'ketch'} */ (level)] : null;
  if (r && Object.hasOwn(r, rule)) return r[rule];
  return NONE_IS_ZERO.has(rule) ? 0 : null;
}
/**
 * @param {string|null|undefined} level
 * @param {string} rule
 */
export function madeLevelSays(level, rule) {
  const t = level ? MADE_LEVEL_TEXT[/** @type {'court'|'hour'|'spire'|'ketch'} */ (level)] : null;
  return (t && Object.hasOwn(t, rule) ? t[rule] : '') ?? '';
}

/** @type {(() => any) | null} */
let _here = null;
/** @type {(() => any) | null} */
let _traverse = null;
/**
 * @param {(() => any) | null} here
 * @param {(() => any) | null} [traverse]
 */
export function registerMadeLevelHere(here, traverse = null) {
  _here = typeof here === 'function' ? here : null;
  _traverse = typeof traverse === 'function' ? traverse : null;
}
export function madeLevelHere() {
  try { const v = _here?.() ?? null; return MADE_LEVELS.includes(v) ? /** @type {'court'|'hour'|'spire'|'ketch'} */ (v) : null; } catch { return null; }
}
export const madeRuleHere = (/** @type {string} */ rule) => madeLevelRule(madeLevelHere(), rule);
export const madeSaysHere = (/** @type {string} */ rule) => madeLevelSays(madeLevelHere(), rule);
export function madeOnTraverse() {
  try { return !!_traverse?.(); } catch { return false; }
}
