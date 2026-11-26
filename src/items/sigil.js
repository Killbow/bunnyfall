// @ts-check
// Sigils on weapons and set armor won online: the `{ power, party, xp, set }` record, its five stages, and its
// bonus to blows against enemies. A sigil is dormant offline and before the page knows its Renown.

import { PARTY_MAX } from '../net/wire.js';
import { registerWeaponBlowMod } from '../characters/entityMods.js';
import { setSigilDueling, sigilDueling } from './sigilDuelState.js';
import { blowRoom } from '../characters/powerCeiling.js';

export const SIGIL_BANDS = Object.freeze({
  magic: Object.freeze([2, 5]),
  rare: Object.freeze([4, 8]),
  legendary: Object.freeze([7, 12]),
});
export const SIGIL_POWER_MAX = SIGIL_BANDS.legendary[1];

export const SIGIL_CHANCE_BASE = 200;
export const SIGIL_CHANCE_PER = 40;

export const SIGIL_STAGES = Object.freeze([
  Object.freeze({ xp: 0, renown: 1, name: 'Faint', share: 20 }),
  Object.freeze({ xp: 5000, renown: 10, name: 'Kindled', share: 40 }),
  Object.freeze({ xp: 12500, renown: 20, name: 'Bright', share: 60 }),
  Object.freeze({ xp: 22500, renown: 30, name: 'Radiant', share: 80 }),
  Object.freeze({ xp: 37500, renown: 40, name: 'Ascendant', share: 100 }),
]);
export const SIGIL_XP_MAX = SIGIL_STAGES[SIGIL_STAGES.length - 1].xp;
// The ids and their order match SIGIL_SETS in sigilSets.js.
export const SIGIL_SET_IDS = Object.freeze(['malacath', 'dagon', 'nocturnal', 'mora', 'ruhn', 'oath', 'thieftaker', 'orcsbane', 'coilscale', 'numidium', 'panoply', 'wyrd', 'starspun', 'eltheric']);

const partyOf = (n) => (Number.isFinite(n) ? Math.max(1, Math.min(PARTY_MAX, Math.floor(n))) : 1);
export const sigilParty = partyOf;

const validPower = (p) => Number.isInteger(p) && p >= 1 && p <= SIGIL_POWER_MAX;
export function validSigil(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return false;
  if (!(Number.isInteger(s.party) && s.party >= 1 && s.party <= PARTY_MAX)) return false;
  if (!(Number.isInteger(s.xp) && s.xp >= 0 && s.xp <= SIGIL_XP_MAX)) return false;
  const hasPower = s.power !== undefined, hasSet = s.set !== undefined;
  if (!hasPower && !hasSet) return false;
  if (hasPower && !validPower(s.power)) return false;
  if (hasSet && !SIGIL_SET_IDS.includes(s.set)) return false;
  return true;
}
export const sigilSetId = (s) => (validSigil(s) && typeof s.set === 'string' ? s.set : null);
export const sigilHasBlow = (s) => validSigil(s) && validPower(s.power);

export function sigilRank(sigil) {
  if (!validSigil(sigil)) return 0;
  let r = 0;
  for (let i = 0; i < SIGIL_STAGES.length; i++) if (sigil.xp >= SIGIL_STAGES[i].xp) r = i;
  return r;
}

export function renownSigilStage(renown) {
  if (!Number.isSafeInteger(renown) || renown < 1) return -1;
  let r = 0;
  for (let i = 0; i < SIGIL_STAGES.length; i++) if (renown >= SIGIL_STAGES[i].renown) r = i;
  return r;
}

export function sigilStageIn(sigil, renown) {
  if (!validSigil(sigil)) return -1;
  const cap = renownSigilStage(renown);
  return cap < 0 ? -1 : Math.min(sigilRank(sigil), cap);
}

export function sigilPercent(sigil, renown) {
  if (!sigilHasBlow(sigil)) return 0;
  const st = sigilStageIn(sigil, renown);
  return st < 0 ? 0 : (sigil.power * SIGIL_STAGES[st].share) / 100;
}

export const sigilChance = (party) => SIGIL_CHANCE_BASE + SIGIL_CHANCE_PER * (partyOf(party) - 1);

export function sigilFloor(tier, party) {
  const band = SIGIL_BANDS[tier];
  if (!band) return 0;
  return Math.min(band[1], band[0] + Math.round(((band[1] - band[0]) * (partyOf(party) - 1)) / (PARTY_MAX - 1)));
}

export function rollSigil(tier, party, rolls = Math.random) {
  const band = SIGIL_BANDS[tier];
  if (!band) return null;
  if (rolls() * 1000 >= sigilChance(party)) return null;
  const lo = sigilFloor(tier, party), hi = band[1];
  return { power: lo + Math.floor(rolls() * (hi + 1 - lo)), party: partyOf(party), xp: 0 };
}

// Set by the world host for the session and never saved.
let _online = false;
let _renown = null;
// The duel flag also covers arena bouts between players, where the opponent is a stand-in not flagged as a player.
export { setSigilDueling, sigilDueling };
export function setSigilOnline(on) { _online = !!on; if (!_online) _renown = null; }
export function setSigilRenown(level) { _renown = _online && Number.isSafeInteger(level) && level >= 1 ? level : null; }
export const sigilOnline = () => _online;
export const sigilRenown = () => _renown;
/** @param {number} min @param {{ online?: boolean, renown?: number|null }} [o] */
export const renownOpens = (min, { online = _online, renown = _renown } = {}) => !online || (Number.isSafeInteger(renown) && /** @type {number} */ (renown) >= min);

// Writes a new sigil object, because save and stream copies of the item share the old one.
export function drinkSigil(item, xp) {
  if (_renown == null || !item || !validSigil(item.sigil) || !(xp > 0)) return null;
  const was = sigilRank(item.sigil);
  item.sigil = { ...item.sigil, xp: Math.min(SIGIL_XP_MAX, item.sigil.xp + Math.floor(xp)) };
  const now = sigilRank(item.sigil);
  return now > was ? now : null;
}

export function sigilRiseLine(name, rank) {
  const stage = SIGIL_STAGES[rank];
  if (!stage) return null;
  const line = `The sigil on your ${name} brightens: ${stage.name}.`;
  const cap = renownSigilStage(_renown);
  if (cap < 0 || cap >= rank) return line;
  return `${line} Your Renown limits it to ${SIGIL_STAGES[cap].name} until Renown ${SIGIL_STAGES[cap + 1].renown}.`;
}

/** @type {WeakMap<object, number>} */
let _carry = new WeakMap();
export function sigilBlow(weapon, damage, attacker, target, info = null) {
  if (!(damage > 0) || !weapon || !attacker?.isPlayer || attacker.peer || !target || target.isPlayer || sigilDueling()) return damage;
  const pct = blowRoom(sigilPercent(weapon.sigil, _renown), 'sigil');
  if (!(pct > 0)) return damage;
  const exact = (damage * pct) / 100 + (_carry.get(weapon) ?? 0);
  const more = Math.floor(exact + 1e-9);
  if (!info?.estimate) _carry.set(weapon, Math.max(0, exact - more));
  return damage + more;
}
registerWeaponBlowMod('sigil', sigilBlow);

const pctText = (p) => (Number.isInteger(p) ? `${p}` : p.toFixed(1));
export function sigilLines(item) {
  const s = item?.sigil;
  if (!validSigil(s)) return [];
  const rank = sigilRank(s);
  const blow = sigilHasBlow(s);
  const full = blow ? `: +${s.power}% at Ascendant` : '';
  if (_renown == null) return [`Sigil (Dormant: works online only)${full}`];
  const st = sigilStageIn(s, _renown);
  const out = [blow ? `Sigil (${SIGIL_STAGES[st].name}): +${pctText(sigilPercent(s, _renown))}% damage, +${s.power}% at Ascendant` : `Sigil (${SIGIL_STAGES[st].name})`];
  const next = SIGIL_STAGES[rank + 1];
  if (rank > st) out.push(`Limited to ${SIGIL_STAGES[st].name} by your Renown (${SIGIL_STAGES[st + 1].name} at Renown ${SIGIL_STAGES[st + 1].renown})`);
  else if (next) out.push(`${SIGIL_STAGES[rank].name}: ${s.xp.toLocaleString('en-US')} / ${next.xp.toLocaleString('en-US')} to ${next.name}`);
  if (s.party > 1) out.push(`Won in a fight of ${s.party}`);
  return out;
}

/**
 * @returns {null | { rank: number, stage: number, dormant: boolean, held: boolean, name: string, pct: number,
 *   full: number|null, xp: number, from: number, to: number|null, next: string|null, frac: number, party: number,
 *   unlock: number|null, stages: Array<{ name: string, grown: boolean, awake: boolean }>, blow: boolean,
 *   set: string|null }}
 */
export function sigilView(item) {
  const s = item?.sigil;
  if (!validSigil(s)) return null;
  const rank = sigilRank(s);
  const stage = sigilStageIn(s, _renown);
  const dormant = stage < 0;
  const next = SIGIL_STAGES[rank + 1] ?? null;
  const from = SIGIL_STAGES[rank].xp;
  const held = !dormant && rank > stage;
  return {
    rank, stage, dormant, held,
    name: dormant ? 'Dormant' : SIGIL_STAGES[stage].name,
    pct: sigilPercent(s, _renown), full: sigilHasBlow(s) ? s.power : null,
    xp: s.xp, from, to: next ? next.xp : null, next: next ? next.name : null,
    frac: next ? Math.max(0, Math.min(1, (s.xp - from) / (next.xp - from))) : 1,
    party: s.party,
    unlock: held ? SIGIL_STAGES[stage + 1].renown : null,
    stages: SIGIL_STAGES.map((st, i) => ({ name: st.name, grown: i <= rank, awake: !dormant && i <= stage })),
    blow: sigilHasBlow(s), set: sigilSetId(s),
  };
}
export function sigilProgressText(v) {
  if (!v) return '';
  if (v.to == null) return 'Fully grown';
  return `${v.xp.toLocaleString('en-US')} / ${v.to.toLocaleString('en-US')} to ${v.next}`;
}

export function _resetSigilForTests() { _online = false; _renown = null; setSigilDueling(false); _carry = new WeakMap(); }
