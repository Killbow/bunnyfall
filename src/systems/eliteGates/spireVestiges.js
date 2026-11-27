// @ts-check
// Applies each Vestige through the existing modifier hooks while the breach client passes a holder every frame;
// with no holder every hook returns its neutral value. Vestige values come only from `egVestige.js`.
import { egVOf, EG_SECOND_WIND_UNDER, EG_MOMENTUM_STEP } from '../../net/eliteGates/egVestige.js';
import { egResonance, EG_WEAVE_N } from '../../net/eliteGates/egVestige.js';
import { registerSpellFreeCast } from '../../magic/spellcost.js';
import { registerPlayerCastListener } from '../../magic/playerCasts.js';
import { isDamageHealthEffect } from '../../magic/spellcast.js';
import { HIT_KINDS } from '../../net/gateBrain.js';
import { registerEntityFold, computeEntityMods, newMods, EMPTY_MODS } from '../../characters/entityMods.js';
import { RESIST_ELEMENTS } from '../../items/lootRarity.js';
import { registerSpellCostMod } from '../../magic/spellcost.js';
import { registerPlayerHurtListener, registerShieldSoakMod } from '../../characters/playerEntity.js';
import { registerRunSpeedMod } from '../../player/motor.js';
import { setSpireHp, spireBodyMax } from '../../characters/renownLayer.js';
import { healMine } from '../../player/playerHeal.js';

export const SPIRE_VESTIGES = 'spire-vestiges';

/** @type {{ entity: any, vs: number[][], mast: number, b: string, h: number, ls?: boolean } | null} */
let _held = null;
let _from = null, _fromEntity = null;
export const EG_LONG_STEP_S = 0.5;
let _bane = 0, _wind = '';
let _cried = '', _woven = 0;
const _news = [];

const heldV = (key, entity = _held?.entity) => (_held && entity === _held.entity ? egVOf(_held.vs, key) : 0);

/**
 * @param {any} entity
 * @param {{ vs: number[][], mast: number, b: string, h: number, dn?: number, cry?: boolean, ls?: boolean } | null} holder
 */
export function spireHolderStep(entity, holder) {
  if (holder !== _from || entity !== _fromEntity) { _from = holder; _fromEntity = entity; _held = holder && entity ? { entity, vs: holder.vs ?? [], mast: holder.mast ?? -1, b: holder.b ?? '', h: holder.h | 0, ...(holder.ls === true ? { ls: true } : {}) } : null; }
  if (!_held) _news.length = 0;
  if (_held && holder?.cry === true && holder.dn > 0 && _cried !== `${_held.b}:${_held.h}:${holder.dn}`) {
    _cried = `${_held.b}:${_held.h}:${holder.dn}`;
    if (_wind === `${_held.b}:${_held.h}`) _news.push({ k: 'rallyingCry' });
    _wind = '';
  }
  if (!entity) return;
  const skin = heldV('stoneskin', entity);
  setSpireHp(entity, skin ? Math.round(spireBodyMax(entity) * skin) : 0);
  const bane = heldV('spellbane', entity);
  if (bane !== _bane) { _bane = bane; computeEntityMods(entity); }
}
export function spireRallyingCry() {
  if (!_held) return false;
  const spent = _wind === `${_held.b}:${_held.h}`;
  if (spent) _news.push({ k: 'rallyingCry' });
  _wind = '';
  return spent;
}
export const spireHeld = () => _held;

export const spireCrumbleWait = () => heldV('featherstep') + (_held?.ls ? EG_LONG_STEP_S : 0);

/**
 * Searing Edge is added as flat damage before the multipliers, since Spire bodies on the relay carry no element.
 * @param {number[][]} vs
 * @param {number} d
 * @param {number} r
 * @param {{ stacks?: number, low?: boolean }} [o]
 */
export function egHolderBlow(vs, d, r, { stacks = 0, low = false } = {}) {
  let x = d;
  if (r === HIT_KINDS.Melee) x += egVOf(vs, 'searing');
  x *= 1 + EG_MOMENTUM_STEP * Math.min(stacks, egVOf(vs, 'momentum'));
  if (low) x *= 1 + egVOf(vs, 'bloodied');
  if (r === HIT_KINDS.Spell) x *= 1 + egVOf(vs, 'overcharge');
  return x;
}

function baneFold(entity) {
  const v = heldV('spellbane', entity);
  if (!v) return EMPTY_MODS;
  const m = newMods();
  for (const el of RESIST_ELEMENTS) m.resist[el] = v;
  return m;
}
const focusCost = (entity, sp) => { const v = heldV('focus', entity); return v ? sp * (1 - v) : sp; };
const weaverSoak = (entity, a) => (a?.bundleSelfCast ? 1 + heldV('shieldweaver', entity) : 1);
const fleetRun = () => 1 + heldV('fleetfoot');
function secondWind(entity, { before, after, saved = false }) {
  const v = heldV('secondwind', entity), max = entity?.maxHealth;
  if (!v || saved || !(after > 0) || !(max > 0)) return;
  const line = max * EG_SECOND_WIND_UNDER, hall = `${_held?.b}:${_held?.h}`;
  if (!(before >= line && after < line) || _wind === hall) return;
  _wind = hall;
  const healed = healMine(entity, max * v);
  _news.push({ k: 'secondWind', t: healed > 0 ? healed : 0 });
}

const damageSpell = (spell) => Array.isArray(spell?.effects) && spell.effects.some(isDamageHealthEffect);
const weaves = (entity) => !!_held && entity === _held.entity && egResonance(_held.vs).includes('arcana');
let _weaveB = '';
const weaveFree = (entity, spell) => weaves(entity) && damageSpell(spell) && _weaveB === _held?.b && _woven % EG_WEAVE_N === EG_WEAVE_N - 1;
function weaveCast(entity, spell) {
  if (!weaves(entity) || !damageSpell(spell)) return;
  if (_weaveB !== _held?.b) { _weaveB = _held?.b ?? ''; _woven = 0; }
  if (_woven % EG_WEAVE_N === EG_WEAVE_N - 1) _news.push({ k: 'spellweave' });
  _woven++;
}
// Stand-in Damage Health spell (effect type 4, subtype 0) so the chip asks `weaveFree` the same question as a real
// cast.
const DAMAGE_SPELL = Object.freeze({ effects: Object.freeze([Object.freeze({ type: 4, subType: 0 })]) });
export const spireWeaveReady = () => !!_held && weaveFree(_held.entity, DAMAGE_SPELL);
export const spireVestigeNews = () => _news.splice(0);

registerEntityFold(SPIRE_VESTIGES, baneFold);
registerSpellCostMod(SPIRE_VESTIGES, focusCost);
registerShieldSoakMod(SPIRE_VESTIGES, weaverSoak);
registerRunSpeedMod(SPIRE_VESTIGES, fleetRun);
registerPlayerHurtListener(SPIRE_VESTIGES, secondWind);
registerSpellFreeCast(SPIRE_VESTIGES, weaveFree);
registerPlayerCastListener(SPIRE_VESTIGES, weaveCast);

export function _resetSpireVestigesForTests() { _held = null; _from = null; _fromEntity = null; _bane = 0; _wind = ''; _cried = ''; _woven = 0; _weaveB = ''; _news.length = 0; }
