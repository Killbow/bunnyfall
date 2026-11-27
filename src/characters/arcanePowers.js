// @ts-check

import { SKILLS } from './skills.js';
import { pathAwake, isSignatureSpell, PATH_NUMBERS, PATH_BY_ID } from './arcanePaths.js';
import { sigilDueling } from '../items/sigil.js';
import { registerSpellPowerMod, registerSpellPierceMod, registerSpellLandedListener } from '../magic/spellPower.js';
import { registerSpellCostMod, effectSchool } from '../magic/spellcost.js';
import { registerCastSpeedMod } from '../magic/castSpeed.js';
import { registerEntityFold, newMods, EMPTY_MODS } from './entityMods.js';
import { registerPlayerDamageMod, registerPlayerHurtListener, registerPlayerBlowEvasion, playerEntity } from './playerEntity.js';
import { guardRoom } from './powerCeiling.js';
import { registerPlayerKillListener } from '../player/playerKills.js';
import { registerMagicRoundHook } from '../world/worldTick.js';
import { registerAbsorptionChance } from '../magic/absorption.js';
import { pendingPlayerBlow } from '../items/sigilSetPowers.js';
import { healMine, manaMine } from '../player/playerHeal.js';
import { playerDoor } from '../player/playerDoor.js';
import { isMagicallyConcealed } from '../magic/effects.js';
import { near, foeGroup, elementShare } from '../items/lootPowers.js';
import { KNIGHT_CITY_WATCH } from './mobileTypes.js';
import { healthShare } from '../combat/healthShare.js';
import { hudText } from '../ui/notify.js';
import { t } from '../ui/textManager.js';
import { regenShare } from '../worldEvents/courtRules.js';

const N = PATH_NUMBERS;
const ELEMENT_NAMES = Object.freeze(['fire', 'frost', 'poison', 'shock', 'magic']);

let _now = () => performance.now() / 1000;
let _rand = Math.random;
const fresh = () => ({
  slipReady: 0, absolutionReady: 0,
  conflux: 0, confluxUntil: 0,
  guardUntil: 0, guardOwed: 0,
  wardUntil: 0,
  marks: new WeakMap(),
  stacked: new WeakSet(),
});
let _s = fresh();
let _say = (line) => { hudText(line); };
export function setArcanePowersVoice({ say = null } = {}) { if (typeof say === 'function') _say = say; }
const say = (line) => { try { _say(line); } catch { } };

export function awakePathId(entity) {
  if (sigilDueling()) return null;
  return pathAwake(entity)?.id ?? null;
}
const me = () => playerDoor()?.player?.() ?? playerEntity;
const share = (e) => healthShare(e) ?? 1;
const undeadOrDaedra = (t) => { const g = foeGroup(t); return g === 'undead' || g === 'daedra'; };
const neverCounts = (e) => e?.mobileType === KNIGHT_CITY_WATCH || e?.team === 'PlayerAlly' || e?.mobileTeam === 'PlayerAlly';
const shieldHolds = (e) => (e?.activeEffects ?? []).some((a) => a.kind === 'shield' && !a.ended && (a.shieldRemaining ?? 0) > 0);

const selfBundle = (name, type, subType, rounds, { magnitude = 0, chance = 1 } = {}) => ({
  name, rangeType: 0, element: 4,
  effects: [{
    type, subType, durationBase: Math.max(1, rounds | 0) + 1, durationMod: 0, durationPerLevel: 1,
    chanceBase: chance, chanceMod: 0, chancePerLevel: 1,
    magnitudeBaseLow: magnitude, magnitudeBaseHigh: magnitude, magnitudeLevelBase: 0, magnitudeLevelHigh: 0, magnitudePerLevel: 1,
  }],
});
const spellName = (id) => PATH_BY_ID[id].spell.name;
const castOnMe = (bundle) => { try { playerDoor()?.castOnPlayer?.(bundle, { power: true }); } catch { } };

function foesNear(struck, metres) {
  const door = playerDoor();
  const at = struck?.ai?.feet;
  if (!door || !Array.isArray(at)) return [];
  const flat = (f) => Math.hypot(f.ai.feet[0] - at[0], f.ai.feet[2] - at[2]);
  return near(door, at, metres, struck.entity).filter((f) => f !== struck).sort((a, b) => flat(a) - flat(b));
}
const hurt = (f, n) => { if (f && n >= 1) playerDoor()?.hurtFoe?.(f, n); };
const arcOn = (f, amount, spell) => hurt(f, Math.floor(amount * elementShare(f.entity, ELEMENT_NAMES[spell?.element] ?? 'magic')));

function sanguinePct(e) {
  if (!(e?.maxHealth > 0) || !Number.isFinite(e.health)) return 0;
  return Math.max(0, Math.floor((100 * (e.maxHealth - e.health)) / (e.maxHealth * N.sanguine.perMissing)));
}
export function pathSpellPower(caster, target) {
  switch (awakePathId(caster)) {
    case 'battlemage': return shieldHolds(caster) ? N.spellsteel.pct : 0;
    case 'shadowcaster': return isMagicallyConcealed(caster) ? N.unseenStrike.pct : 0;
    case 'bloodmage': return Math.min(N.sanguine.most, sanguinePct(caster));
    case 'elementalist': return _now() < _s.confluxUntil ? N.conflux.pct * _s.conflux : 0;
    case 'lightbringer': return undeadOrDaedra(target) ? N.dawnsWard.pct : 0;
    default: return 0;
  }
}
export function pathSpellPierce(caster, target) {
  switch (awakePathId(caster)) {
    case 'spellbreaker': return N.sunder.points;
    case 'seer': return target && _now() < (_s.marks.get(target) ?? 0) ? N.psychicLance.points : 0;
    default: return 0;
  }
}
export function pathCastCost(entity, sp, spell = null) {
  if (awakePathId(entity) !== 'wardwright') return sp;
  const fx = (spell?.effects ?? []).filter((e) => e && e.type > -1);
  if (!fx.length || !fx.every((e) => effectSchool(e) === SKILLS.Alteration || effectSchool(e) === SKILLS.Thaumaturgy)) return sp;
  return (sp * (100 - N.attunedWards.pct)) / 100;
}
export const pathCastSpeed = (entity) => (awakePathId(entity) === 'riftwalker' ? N.betweenMoments.pct : 0);
export function pathFold(entity) {
  if (awakePathId(entity) !== 'enchanter') return EMPTY_MODS;
  const mods = newMods();
  mods.stats.personality = N.glamour.personality;
  mods.skills[SKILLS.Etiquette] = N.glamour.etiquette;
  mods.skills[SKILLS.Streetwise] = N.glamour.streetwise;
  return mods;
}
export function pathEvade(entity) {
  if (awakePathId(entity) !== 'seer' || !pendingPlayerBlow()) return false;
  if (!(_rand() < 1 / N.foresight.oneIn)) return false;
  say(t('schools.say.foresight', 'Foresight: you saw the blow coming.'));
  return true;
}
export function pathDamageMod(entity, dmg) {
  if (awakePathId(entity) !== 'warden' || !pendingPlayerBlow() || !(_now() < _s.guardUntil)) return dmg;
  const owed = (dmg * guardRoom(N.livingAegis.lighter, 'arcane')) / 100 + _s.guardOwed;
  const cut = Math.floor(owed + 1e-9);
  _s.guardOwed = owed - cut;
  return Math.max(0, dmg - cut);
}
/**
 * @param {any} entity
 * @param {{ before?: number, after?: number, saved?: boolean }} [hurt]
 */
export function pathHurt(entity, { before = 0, after = 0, saved = false } = {}) {
  const id = awakePathId(entity);
  if (!id || saved || !(after > 0) || !(entity.maxHealth > 0)) return;
  const crossed = (line) => after < entity.maxHealth * line && before >= entity.maxHealth * line;
  const now = _now();
  if (id === 'trickster' && crossed(N.slipAway.below) && now >= _s.slipReady) {
    _s.slipReady = now + N.slipAway.recover;
    castOnMe(selfBundle(PATH_BY_ID.trickster.passive.name, 13, 0, N.slipAway.rounds));
    say(t('schools.say.slipAway', 'Slip Away: you fade from sight.'));
  } else if (id === 'hierophant' && crossed(N.absolution.below) && now >= _s.absolutionReady) {
    _s.absolutionReady = now + N.absolution.recover;
    healMine(entity, (entity.maxHealth * N.absolution.heal) / 100);
    say(t('schools.say.absolution', 'Absolution: your wounds close.'));
  }
}
export function pathRound(entity) {
  if (awakePathId(entity) !== 'warden' || !shieldHolds(entity)) return;
  if (entity.health > 0 && entity.health < entity.maxHealth) { const held = regenShare((entity.maxHealth * N.steadfast.pct) / 100, 'steadfast', entity); if (held > 0) healMine(entity, held); }
}
export function pathKill(foe) {
  if (!foe || neverCounts(foe)) return;
  const m = me();
  const id = awakePathId(m);
  if (id === 'necromancer') {
    healMine(m, (m.maxHealth * N.deathsDue.health) / 100);
    manaMine(m, (m.maxMagicka * N.deathsDue.magicka) / 100);
  } else if (id === 'soulbinder') {
    const trapped = (foe.activeEffects ?? []).some((a) => a.kind === 'soulTrap' && !a.ended && !a.by);
    manaMine(m, (m.maxMagicka * (trapped ? N.soulWell.trapped : N.soulWell.magicka)) / 100);
  }
}
export const pathAbsorbChance = (target) => (awakePathId(target) === 'wardwright' && _now() < _s.wardUntil ? N.prismaticWard.chance : 0);

/** @param {{ caster?: any, target?: any, foe?: any, spell?: any, r?: any, self?: boolean, reflected?: boolean, took?: number, cast?: any }} [landing] */
export function pathLanded({ caster = null, target = null, foe = null, spell = null, r = null, self = false, reflected = false, took = null, cast = null } = {}) {
  const id = awakePathId(caster);
  if (!id || !r || reflected || target?.warded) return;
  const landed = Number.isFinite(took) ? took : Number.isFinite(r.damage) ? r.damage : 0;
  const paid = Number.isFinite(cast?.cost) ? cast.cost : 0;
  const now = _now();
  if (id === 'elementalist' && !self && landed > 0 && target && !target.isPlayer && !(cast && _s.stacked.has(cast))) {
    if (cast) _s.stacked.add(cast);
    _s.conflux = Math.min(N.conflux.stacks, (now < _s.confluxUntil ? _s.conflux : 0) + 1);
    _s.confluxUntil = now + N.conflux.seconds;
  }
  if (!isSignatureSpell(spell) || spell.path !== id) return;
  if (self) { if (spell.rangeType === 0) selfRider(id, caster, r, now); return; }
  if (!target || target.isPlayer) return;
  switch (id) {
    case 'battlemage':
      if (landed > 0) castOnMe(selfBundle(spellName('battlemage'), 35, 255, N.aegisBolt.rounds, { magnitude: Math.max(1, Math.min(landed * N.aegisBolt.times, Math.round((caster.maxHealth * N.aegisBolt.most) / 100))) }));
      break;
    case 'trickster':
      if (r.paralyzed > 0) castOnMe(selfBundle(spellName('trickster'), 23, 0, N.fleetingHold.rounds));
      break;
    case 'riftwalker':
      if (landed > 0) for (const f of foesNear(foe, N.riftLance.metres)) arcOn(f, landed * N.riftLance.share, spell);
      break;
    case 'shadowcaster':
      if (landed > 0) castOnMe(selfBundle(spellName('shadowcaster'), 24, 0, N.shadowBolt.rounds));
      break;
    case 'spellbreaker':
      if (landed > 0) manaMine(caster, paid * N.unravel.back);
      break;
    case 'bloodmage':
      if (landed > 0 && target.health > 0 && share(target) < N.bloodBoil.below) hurt(foe, landed);
      break;
    case 'elementalist':
      if (landed > 0) for (const f of foesNear(foe, N.chainLightning.metres).slice(0, N.chainLightning.foes)) arcOn(f, landed * N.chainLightning.share, spell);
      break;
    case 'seer':
      if (landed > 0) _s.marks.set(target, now + N.psychicLance.seconds);
      break;
    case 'lightbringer':
      if (landed > 0) {
        healMine(caster, landed * N.dawnbolt.heal);
        if (undeadOrDaedra(target) && target.health > 0) hurt(foe, Math.round(landed * N.dawnbolt.burn));
      }
      break;
    case 'enchanter':
      if (r.pacify && foe?.ai && foe.ai.isHostile !== false) manaMine(caster, paid);
      break;
    case 'necromancer':
      if (landed > 0) healMine(caster, landed * N.siphonLife.share);
      break;
    case 'soulbinder':
      if (landed > 0) manaMine(caster, landed * N.soulLance.share);
      break;
    default: break;
  }
}
function selfRider(id, caster, r, now) {
  if (r.chanceFailed) return;
  if (id === 'warden') _s.guardUntil = now + N.livingAegis.seconds;
  else if (id === 'wardwright') _s.wardUntil = now + N.prismaticWard.seconds;
  else if (id === 'hierophant') castOnMe(selfBundle(spellName('hierophant'), 22, 255, N.sanctify.rounds, { chance: N.sanctify.chance }));
}

export const ARCANE_POWERS = 'arcanePowers';
registerSpellPowerMod(ARCANE_POWERS, pathSpellPower);
registerSpellPierceMod(ARCANE_POWERS, pathSpellPierce);
registerSpellCostMod(ARCANE_POWERS, pathCastCost);
registerCastSpeedMod(ARCANE_POWERS, pathCastSpeed);
registerEntityFold(ARCANE_POWERS, pathFold);
registerPlayerDamageMod(ARCANE_POWERS, pathDamageMod);
registerPlayerBlowEvasion(ARCANE_POWERS, pathEvade);
registerPlayerHurtListener(ARCANE_POWERS, pathHurt);
registerMagicRoundHook(ARCANE_POWERS, pathRound);
registerPlayerKillListener(ARCANE_POWERS, pathKill);
registerAbsorptionChance(ARCANE_POWERS, pathAbsorbChance);
registerSpellLandedListener(ARCANE_POWERS, pathLanded);

export function _resetArcanePowersForTests() { _s = fresh(); _say = (line) => { hudText(line); }; }
export function _setArcanePowersClockForTests(fn) { _now = typeof fn === 'function' ? fn : () => performance.now() / 1000; }
export function _setArcanePowersRandForTests(fn) { _rand = typeof fn === 'function' ? fn : Math.random; }
