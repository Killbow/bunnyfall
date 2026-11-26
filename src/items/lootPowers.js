// @ts-check
// Loot affix and Legendary powers, registered at import on the combat, cast, kill, and magic round hooks.
// They act only for the local player's entity and never on a blow at a player; Legendary powers sleep in a duel.

import { registerWeaponBlowMod, registerEntityFold, newMods, EMPTY_MODS } from '../characters/entityMods.js';
import { blowRoom, guardRoom } from '../characters/powerCeiling.js';
import { effectSchool } from '../magic/spellcost.js';
import { hoodUp } from '../systems/survival/temperature.js';
import { registerPlayerStrikeListener, enemyEntityGroup, ENEMY_GROUPS } from '../combat/formulas.js';
import { registerSpellCostMod } from '../magic/spellcost.js';
import { registerCastSpeedMod } from '../magic/castSpeed.js';
import { registerSpellPowerMod, registerSpellPierceMod } from '../magic/spellPower.js';
import { hasSpecialAbility, SPECIAL_ABILITY, restIgnoresNoRegen } from '../player/rest.js';
import { registerPlayerBlowLanded, pendingPlayerBlow, REACH_RISE_M, registerSpireRedoubt, spireRoomNow } from './sigilSetPowers.js';
import { registerRollerLevel } from './lootLevelGate.js';
import { effectiveLevel } from '../characters/mentorMode.js';
import { playerDoor, paidBack, oweFoe } from '../player/playerDoor.js';
import { showFollowUp } from '../ui/hitNumbers.js';
import { careerTolerance, EFFECT_FLAGS } from '../magic/spellcast.js';
import { lootRarityOn, validAffix, powerOf, registerLegendaryFind, readLines } from './lootRarity.js';
import { equipTableOf } from '../characters/equip.js';
import { registerPlayerDamageMod, registerPlayerDeathSave, registerPlayerHurtListener, playerEntity } from '../characters/playerEntity.js';
import { registerPlayerKillListener } from '../player/playerKills.js';
import { registerAbsorptionChance } from '../magic/absorption.js';
import { registerMagicRoundHook, skyMinutes } from '../world/worldTick.js';
import { setsDueling } from './sigilSets.js';
import { addGoldPieces, addItem } from './inventory.js';
import { bowDamageArrow } from '../combat/enemyEquipment.js';
import { isNight } from '../world/worldClock.js';
import { hudText } from '../ui/notify.js';
// Heals live in playerHeal.js so sigilSetPowers.js, which this file imports, can share them.
import { healMine, manaMine, _resetPlayerHealForTests } from '../player/playerHeal.js';
import { weaponSkillUsed } from '../characters/weapons.js';
import { SKILLS } from '../characters/skills.js';
import { friendlyProtected } from '../combat/playerWeapon.js';
import { KNIGHT_CITY_WATCH } from '../characters/mobileTypes.js';
import { healthShare } from '../combat/healthShare.js';
import { regenShare } from '../worldEvents/courtRules.js';

export const THORNS_CAP = 10;
export const FOCUS_CAP = 30;
export const SPELL_CUT_MOST = 50;
export const CAST_SPEED_CAP = 30;
export const LEECH_CAP = 10;
export const POTENCY_CAP = 30;
export const SPELL_POWER_MOST = 50;
export const WELLSPRING_CAP = 10;

const mine = (e) => !!e?.isPlayer && !e.peer;
export function linesOf(item, id) {
  if (!lootRarityOn() || !Array.isArray(item?.affixes)) return [];
  return readLines(item).filter((a) => a?.id === id && validAffix(a));
}
export const wornPieces = (entity) => (entity ? equipTableOf(entity).filter(Boolean) : []);
export const wornSum = (entity, id) => wornPieces(entity).reduce((n, it) => n + linesOf(it, id).reduce((m, a) => m + a.value, 0), 0);

export function foeGroup(target) {
  if (!target || target.isPlayer) return null;
  if (target.affinity === 'Human') return 'humanoid';
  const g = enemyEntityGroup(target.careerIndex);
  return g === ENEMY_GROUPS.Undead ? 'undead' : g === ENEMY_GROUPS.Daedra ? 'daedra' : g === ENEMY_GROUPS.Humanoid ? 'humanoid'
    : g === ENEMY_GROUPS.Animals ? 'animal' : null;
}
const ELEMENT_FLAG = Object.freeze({ fire: EFFECT_FLAGS.Fire, frost: EFFECT_FLAGS.Frost, shock: EFFECT_FLAGS.Shock, poison: EFFECT_FLAGS.Poison, magic: EFFECT_FLAGS.Magic });
export function elementShare(target, element) {
  const t = careerTolerance(target?.career ?? {}, ELEMENT_FLAG[element] ?? 0);
  return t === 'Immune' ? 0 : t === 'Resistant' ? 0.5 : 1;
}

/** @type {WeakMap<object, number>} */
let _carry = new WeakMap();
function shareOf(key, damage, pct, keep = true) {
  const exact = (damage * pct) / 100 + (_carry.get(key) ?? 0);
  const more = Math.floor(exact + 1e-9);
  if (keep) _carry.set(key, Math.max(0, exact - more));
  return more;
}

let _now = () => performance.now() / 1000;
let _rand = Math.random;
const freshState = () => ({
  flow: 0, flowUntil: 0,
  bedrock: 0, bedrockUntil: 0,
  charges: 0,
  vigilReady: 0, graceReady: 0, hasteReady: 0, graceHeal: 0,
  spireHeld: new Map(),
  recovering: new Set(),
});
let _s = freshState();
/** @type {WeakMap<object, number>} */
let _hexed = new WeakMap();
/** @type {WeakMap<object, number>} */
let _tolls = new WeakMap();
/** @type {{ foe: object, at: number, weapon?: any } | null} */
let _lastToll = null;
/** @type {WeakSet<object>} */
let _struck = new WeakSet();
/** @type {WeakMap<object, { n: number, until: number, at: number }>} */
let _undertow = new WeakMap();
const undertowStacks = (foe, now) => { const u = _undertow.get(foe); return u && now < u.until ? u.n : 0; };
// Shots are counted at the strike, after the blow, so the toll is due when the count is one short.
const tollDue = (weapon, p) => !!weapon && (_tolls.get(weapon) ?? 0) === p.every - 1;
// A kill is reported on the frame health runs out, which is the strike frame or the next one.
export const TOLL_REFUND_S = 1;
let _say = (line) => { hudText(line); };
export function setLootPowersVoice({ say = null } = {}) { if (typeof say === 'function') _say = say; }
const say = (line) => { try { _say(line); } catch { } };

const powerIds = (it) => [it?.rarity === 'legendary' ? it.legendary : null, it?.rarity === 'rare' ? it.imprint : null, it?.rarity === 'gilded' ? it.gilded : null];
export function wornPowers(entity) {
  if (!mine(entity) || !lootRarityOn() || setsDueling()) return [];
  const out = [];
  const seen = new Set();
  for (const it of wornPieces(entity)) {
    for (const id of powerIds(it)) {
      if (typeof id !== 'string' || seen.has(id)) continue;
      const power = powerOf(id);
      if (!power) continue;
      seen.add(id);
      out.push({ id, power, item: it });
    }
  }
  return out;
}
export const powerKind = (entity, kind) => wornPowers(entity).find((p) => p.power.kind === kind)?.power ?? null;
const isWeapon = (it) => it?.group === 'Weapons';
const blowPowers = (entity, weapon) => wornPowers(entity).filter((p) => !isWeapon(p.item) || p.item === weapon || (!!weapon && powerIds(weapon).includes(p.id)));
const share = (e) => healthShare(e) ?? 1;
const ranged = (w) => !!w && weaponSkillUsed(w.templateIndex) === SKILLS.Archery;
export const flowStacks = (now = _now()) => (now < _s.flowUntil ? _s.flow : 0);
export const bedrockStacks = (now = _now()) => (now < _s.bedrockUntil ? _s.bedrock : 0);
const hexed = (foe, now = _now()) => !!foe && now < (_hexed.get(foe) ?? 0);
const gainMana = manaMine;

export function lootBlow(weapon, damage, attacker, target, info) {
  if (!(damage > 0) || !mine(attacker) || !target || target.isPlayer || target.warded) return damage;
  let out = damage;
  const group = foeGroup(target);
  let pct = 0, flat = 0;
  for (const a of linesOf(weapon, 'slayer')) if (a.param === group) pct += a.value;
  for (const a of linesOf(weapon, 'elemental')) flat += Math.floor(a.value * elementShare(target, a.param));
  const now = _now();
  for (const { power: p } of blowPowers(attacker, weapon)) {
    switch (p.kind) {
      case 'bane': if (target.affinity !== 'Human' && p.foes.includes(target.careerIndex)) pct += p.pct; break;
      case 'cromwark': if (target.wildFoe) pct += p.pct; break;
      case 'unaware': if (info?.unaware) pct += p.pct; break;
      case 'sanctified': if (group === p.group) pct += p.pct; break;
      case 'flow': pct += p.pct * flowStacks(now); break;
      case 'venom': flat += Math.floor(p.flat * (share(target) < 0.5 ? 2 : 1) * elementShare(target, 'poison')); break;
      case 'moon': if (isNight(skyMinutes())) pct += p.pct + (group === 'animal' ? p.beast : 0); break;
      case 'rage': if (share(attacker) < p.below / 100) pct += p.pct; break;
      case 'execute': if (share(target) < p.below / 100) pct += p.pct; break;
      case 'firstblood': if (!_struck.has(target)) pct += p.pct; break;
      case 'toll': if (tollDue(weapon, p)) pct += p.pct; break;
      case 'undertow': pct += p.pct * undertowStacks(target, now); break;
      default: break;
    }
  }
  if (pct > 0) pct = blowRoom(pct, 'loot');
  if (pct > 0) out += shareOf(weapon ?? attacker, damage, pct, !info?.estimate);
  return out + flat;
}

export function lootStrike(attacker, target, damage, weapon, info = null) {
  // A melee strike is reported before the ward turns it, so a warded target is refused here too.
  if (!mine(attacker) || !(damage > 0) || !target || target.isPlayer || target.warded) return;
  let pct = 0;
  for (const a of linesOf(weapon, 'leech')) pct += a.value;
  pct = Math.min(LEECH_CAP, pct);
  if (pct > 0) healMine(attacker, (damage * pct) / 100);
  const now = _now();
  // Per-blow charges come only from blows that count whole, so a dual-wield pair charges by its damage edge.
  const whole = info?.blow !== false;
  for (const { power: p } of blowPowers(attacker, weapon)) {
    switch (p.kind) {
      case 'chain': if (ranged(weapon)) arc(target, (damage * p.share) / 100, p.metres, p.name); break;
      case 'quake': if (weapon && !ranged(weapon)) quake(target, (damage * p.share) / 100, p.metres, p.name); break;
      case 'echo': if (_rand() * 100 < p.chance) again(target, damage, p.name); break;
      case 'fists': if (!weapon) again(target, (damage * p.share) / 100, p.name); break;
      case 'conduit': if (whole) gainMana(attacker, p.mana); break;
      case 'flow': if (whole) { _s.flow = Math.min(p.max, flowStacks(now) + 1); _s.flowUntil = now + p.seconds; } break;
      case 'toll': if (weapon) { _tolls.set(weapon, ((_tolls.get(weapon) ?? 0) + 1) % p.every); _lastToll = { foe: target, at: now, weapon }; } break;
      case 'dragonfire': if (weapon && foeGroup(target) === p.group) dragonfire(target, (damage * p.share) / 100, p.metres, p.group, p.name); break;
      case 'undertow': if (weapon && whole) _undertow.set(target, { n: Math.min(p.max, undertowStacks(target, now) + 1), until: now + p.seconds, at: now }); break;
      default: break;
    }
  }
  _struck.add(target);
}

const flat2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const rise = (a, b) => Math.abs((a[1] ?? 0) - (b[1] ?? 0));
export function near(door, feet, metres, except) {
  return door.foes().filter((f) => f.entity !== except && !f.dead && f.ai?.feet && !friendlyProtected(f, { protection: true })
    && rise(f.ai.feet, feet) <= REACH_RISE_M && flat2(f.ai.feet, feet) <= metres && (!door.clear || door.clear(feet, f.ai.feet)));
}
const recordOf = (door, entity) => door?.foes().find((f) => f.entity === entity) ?? null;
function again(target, damage, word) {
  const door = playerDoor();
  const f = recordOf(door, target);
  const n = Math.max(1, Math.round(damage));
  if (!f?.dead) showFollowUp(n, word, target);
  if (f) { if (!f.dead) door.hurtFoe(f, n); return; }
  oweFoe(target, n);
}
// The pool door runs no formula, so the hit-number hook never sees this damage; show it here.
function reachOn(door, f, n, word) {
  showFollowUp(n, word);
  door.hurtFoe(f, n);
}
function arc(target, amount, metres, word) {
  const door = playerDoor();
  const struck = recordOf(door, target);
  if (!struck?.ai?.feet || !(amount > 0)) return;
  let best = null, bestD = metres;
  for (const f of near(door, struck.ai.feet, metres, target)) { const d = flat2(f.ai.feet, struck.ai.feet); if (d <= bestD) { best = f; bestD = d; } }
  const n = best ? Math.floor(amount * elementShare(best.entity, 'shock')) : 0;
  if (best && n > 0) reachOn(door, best, n, word);
}
function dragonfire(target, amount, metres, group, word) {
  if (!(amount > 0)) return;
  again(target, amount, word);
  const door = playerDoor();
  const struck = recordOf(door, target);
  if (!struck?.ai?.feet) return;
  for (const f of near(door, struck.ai.feet, metres, target)) if (foeGroup(f.entity) === group) reachOn(door, f, Math.max(1, Math.round(amount)), word);
}
function quake(target, amount, metres, word) {
  const door = playerDoor();
  const struck = recordOf(door, target);
  if (!struck?.ai?.feet || !(amount > 0)) return;
  for (const f of near(door, struck.ai.feet, metres, target)) reachOn(door, f, Math.max(1, Math.round(amount)), word);
}

export function lootLanded(entity, attacker, took) {
  if (!mine(entity) || !(took > 0) || !attacker || attacker.isPlayer) return;
  const now = _now();
  for (const { power: p } of wornPowers(entity)) {
    if (p.kind === 'dawnward') _s.charges = Math.min(p.charges, _s.charges + 1);
    else if (p.kind === 'bedrock') { _s.bedrock = Math.min(p.max, bedrockStacks(now) + 1); _s.bedrockUntil = now + p.seconds; }
    else if (p.kind === 'hex') _hexed.set(attacker, now + p.seconds);
  }
  const n = Math.min(THORNS_CAP, wornSum(entity, 'thorns'));
  if (n <= 0) return;
  const door = playerDoor();
  const f = door?.foes().find((x) => x.entity === attacker);
  const back = f && !f.dead ? paidBack(f, n) : 0;
  if (back > 0) door.hurtFoe(f, back);
}

export function lootDamageMod(entity, dmg) {
  if (!mine(entity) || !(dmg > 0)) return dmg;
  const powers = wornPowers(entity);
  if (!powers.length) return dmg;
  const blow = pendingPlayerBlow();
  const now = _now();
  const kind = (k) => powers.find((p) => p.power.kind === k)?.power ?? null;
  if (blow) {
    const dawn = kind('dawnward');
    if (dawn && _s.charges >= dawn.charges) { _s.charges = 0; say('Dawnward turns the blow aside.'); return 0; }
    const raven = kind('evade');
    if (raven && _rand() * 100 < raven.chance) { say('You evade the blow.'); return 0; }
  }
  let d = dmg;
  const hex = kind('hex');
  if (blow && hex && hexed(blow.attacker, now)) d *= 1 - guardRoom(hex.less, 'loot') / 100;
  const bed = kind('bedrock');
  if (blow && bed) d *= 1 - guardRoom(bed.less * bedrockStacks(now), 'loot') / 100;
  const wall = kind('bulwark');
  if (blow && wall) d = Math.max(1, d - wall.less);
  const last = kind('laststand');
  if (last && share(entity) < last.below / 100) d *= 1 - guardRoom(last.less, 'loot') / 100;
  const titan = kind('unyielding');
  if (titan && entity.maxHealth > 0) d = Math.min(d, Math.max(1, Math.ceil((entity.maxHealth * titan.most) / 100)));
  return Math.max(dmg > 0 && d > 0 ? 1 : 0, Math.round(d));
}
export const LOOT_SPIRE_SAVES = Object.freeze({ grace: 'graceReady', vigil: 'vigilReady' });
function lootSpireHold(k) { const room = spireRoomNow(); if (room != null) _s.spireHeld.set(k, room); else _s.spireHeld.delete(k); }
export function lootSpireHeld(k) { const room = _s.spireHeld.get(k); return room !== undefined && room === spireRoomNow(); }
function lootRedoubtTaken() {
  for (const field of Object.values(LOOT_SPIRE_SAVES)) _s[field] = 0;
  _s.spireHeld.clear();
}

export function lootDeathSave(entity) {
  const p = powerKind(entity, 'grace');
  if (!p) return false;
  const now = _now();
  if (now < _s.graceReady || lootSpireHeld('grace')) return false;
  _s.graceReady = now + p.recover;
  _s.graceHeal = p.heal;
  _s.recovering.add('grace');
  lootSpireHold('grace');
  say('Divine Grace! The Nine will not let you fall.');
  return true;
}
export function lootHurt(entity, { before, after, saved = false }) {
  if (!mine(entity)) return;
  const max = entity.maxHealth;
  if (_s.graceHeal > 0) { healMine(entity, (max * _s.graceHeal) / 100); _s.graceHeal = 0; }
  const v = powerKind(entity, 'vigil');
  if (!v || !(max > 0) || !(after > 0) || saved) return;
  const line = (max * v.below) / 100;
  if (!(before >= line && after < line)) return;
  const now = _now();
  if (now < _s.vigilReady || lootSpireHeld('vigil')) return;
  _s.vigilReady = now + v.recover;
  _s.recovering.add('vigil');
  lootSpireHold('vigil');
  healMine(entity, (max * v.heal) / 100);
  say("The Ghost-King's Vigil. You are not alone on the field.");
}

const neverCounts = (e) => e?.mobileType === KNIGHT_CITY_WATCH || e?.team === 'PlayerAlly' || e?.mobileTeam === 'PlayerAlly';
// One extra round so the haste lasts the full duration however the magic round falls.
export const hasteBundle = (p) => ({
  name: "Courier's Haste", rangeType: 0, element: 4,
  effects: [{
    type: 9, subType: 6, durationBase: Math.max(1, p.rounds | 0) + 1, durationMod: 0, durationPerLevel: 1,
    chanceBase: 1, chanceMod: 1, chancePerLevel: 1,
    magnitudeBaseLow: p.speed, magnitudeBaseHigh: p.speed, magnitudeLevelBase: 0, magnitudeLevelHigh: 0, magnitudePerLevel: 1,
  }],
});
export function lootKill(foe) {
  if (!foe || neverCounts(foe)) return;
  const door = playerDoor();
  const me = door?.player?.() ?? playerEntity;
  const well = mine(me) ? Math.min(WELLSPRING_CAP, wornSum(me, 'wellspring')) : 0;
  if (well > 0 && me.maxMagicka > 0) gainMana(me, (me.maxMagicka * well) / 100);
  const powers = wornPowers(me);
  if (!powers.length) return;
  const now = _now();
  for (const { power: p } of powers) {
    switch (p.kind) {
      case 'sanctified': if (foeGroup(foe) === p.group) healMine(me, (me.maxHealth * p.heal) / 100); break;
      case 'rage': healMine(me, (me.maxHealth * p.heal) / 100); break;
      case 'siphon': gainMana(me, (me.maxMagicka * p.pct) / 100); break;
      case 'tribute': { const g = p.gold * Math.max(1, foe.level | 0); addGoldPieces(me, g); say(`Tribute: ${g} gold.`); break; }
      case 'toll': if (p.refund && _lastToll?.foe === foe && now - _lastToll.at <= TOLL_REFUND_S && Array.isArray(me?.items)) { addItem(me.items, bowDamageArrow()); _lastToll = null; } break;
      case 'undertow': { const u = _undertow.get(foe); if (u && now - u.at <= TOLL_REFUND_S) { healMine(me, (me.maxHealth * p.heal) / 100); _undertow.delete(foe); } break; }
      case 'haste':
        if (now >= _s.hasteReady && door?.castOnPlayer) { _s.hasteReady = now + p.recover; _s.recovering.add('haste'); door.castOnPlayer(hasteBundle(p)); }
        break;
      default: break;
    }
  }
}

export const spellOfSchool = (spell, school) => {
  const fx = (spell?.effects ?? []).filter((e) => e && e.type > -1);
  return fx.length > 0 && fx.every((e) => effectSchool(e) === school);
};
export function lootCastCost(entity, sp, spell = null) {
  if (!mine(entity)) return sp;
  let pct = Math.min(FOCUS_CAP, wornSum(entity, 'focus'));
  for (const { power: p } of wornPowers(entity)) {
    if (p.kind === 'conduit') pct += p.less;
    else if (p.kind === 'mastery') pct += Number.isFinite(entity.magicka) && entity.maxMagicka > 0 && entity.magicka < entity.maxMagicka / 2 ? p.low : p.less;
    else if (p.kind === 'school' && spellOfSchool(spell, p.school)) pct += p.less;
  }
  pct = Math.min(SPELL_CUT_MOST, pct);
  return pct > 0 ? (sp * (100 - pct)) / 100 : sp;
}

export function lootSpellPower(entity, target) {
  if (!mine(entity) || !target || target.isPlayer) return 0;
  let pct = Math.min(POTENCY_CAP, wornSum(entity, 'potency'));
  const surge = powerKind(entity, 'surge');
  if (surge && entity.maxMagicka > 0 && Number.isFinite(entity.magicka) && entity.magicka > (entity.maxMagicka * surge.above) / 100) pct += surge.pct;
  return Math.min(SPELL_POWER_MOST, pct);
}
export const lootSpellPierce = (entity, target) => (mine(entity) && target && !target.isPlayer ? (powerKind(entity, 'pierce')?.points ?? 0) : 0);

export function lootCastSpeed(entity) {
  if (!mine(entity)) return 0;
  return Math.min(CAST_SPEED_CAP, wornSum(entity, 'castSpeed'));
}

export const lootAbsorbChance = (target) => (mine(target) ? (powerKind(target, 'absorb')?.chance ?? 0) : 0);
const READY = Object.freeze({
  vigil: { at: () => _s.vigilReady, line: "The Ghost-King's Vigil is ready again.", kind: 'vigil' },
  grace: { at: () => _s.graceReady, line: 'Divine Grace is ready again.', kind: 'grace' },
  haste: { at: () => _s.hasteReady, line: null, kind: 'haste' },
});
export function lootRound(entity) {
  if (!mine(entity)) return;
  const hist = powerKind(entity, 'regen');
  if (hist && entity.maxHealth > 0 && entity.health > 0 && entity.health < entity.maxHealth) {
    { const held = regenShare((entity.maxHealth * (share(entity) < 0.5 ? hist.low : hist.pct)) / 100, 'hist', entity); if (held > 0) healMine(entity, held); }
  }
  const well = powerKind(entity, 'attune');
  if (well && entity.maxMagicka > 0 && entity.health > 0 && Number.isFinite(entity.magicka) && entity.magicka < entity.maxMagicka
    && !(hasSpecialAbility(entity.career, SPECIAL_ABILITY.NoRegenSpellPoints) && !restIgnoresNoRegen())) {
    gainMana(entity, (entity.maxMagicka * (entity.magicka < entity.maxMagicka / 2 ? well.low : well.pct)) / 100);
  }
  if (!_s.recovering.size) return;
  const now = _now();
  for (const k of [..._s.recovering]) {
    const r = READY[k];
    if (now < r.at() || lootSpireHeld(k)) continue;
    _s.recovering.delete(k);
    if (r.line && powerKind(entity, r.kind)) say(r.line);
  }
}
export function lootFind() {
  const me = playerDoor()?.player?.() ?? playerEntity;
  return powerKind(me, 'fortune')?.mult ?? 1;
}

// Folded onto the entity so readers such as survival, standing, and skill values stay import-free.
export function wardrobeFold(entity) {
  const powers = wornPowers(entity);
  if (!powers.length) return EMPTY_MODS;
  let mods = null;
  const m = () => (mods ??= newMods());
  for (const { power: p, item } of powers) {
    switch (p.kind) {
      case 'climate': m().heatDegrees += p.heat ?? 0; m().coldDegrees += p.cold ?? 0; break;
      case 'longroad': m().fatigueLess += p.fatigue ?? 0; m().fallLess += p.fall ?? 0; break;
      case 'bearing': { const s = m().standing; for (let g = 0; g < s.length; g++) s[g] += p.standing ?? 0; break; }
      case 'hood': if (hoodUp(item)) m().skills[p.skill] = (m().skills[p.skill] ?? 0) + (p.more ?? 0); break;
      default: break;
    }
  }
  return mods ?? EMPTY_MODS;
}

export const LOOT_POWERS = 'lootPowers';
registerWeaponBlowMod(LOOT_POWERS, lootBlow);
registerPlayerStrikeListener(LOOT_POWERS, lootStrike);
registerPlayerBlowLanded(LOOT_POWERS, lootLanded);
registerSpellCostMod(LOOT_POWERS, lootCastCost);
registerCastSpeedMod(LOOT_POWERS, lootCastSpeed);
registerSpellPowerMod(LOOT_POWERS, lootSpellPower);
registerSpellPierceMod(LOOT_POWERS, lootSpellPierce);
registerPlayerDamageMod(LOOT_POWERS, lootDamageMod);
registerPlayerDeathSave(LOOT_POWERS, lootDeathSave);
registerPlayerHurtListener(LOOT_POWERS, lootHurt);
registerPlayerKillListener(LOOT_POWERS, lootKill);
registerAbsorptionChance(LOOT_POWERS, lootAbsorbChance);
registerMagicRoundHook(LOOT_POWERS, lootRound);
registerLegendaryFind(LOOT_POWERS, lootFind);
registerRollerLevel(() => { const me = playerDoor()?.player?.(); return me ? effectiveLevel(me) : null; });
registerEntityFold(LOOT_POWERS, wardrobeFold);
registerSpireRedoubt(LOOT_POWERS, lootRedoubtTaken);

export function lootHudChips(entity, now = _now()) {
  const powers = wornPowers(entity);
  if (!powers.length) return [];
  const has = (k) => powers.some((p) => p.power.kind === k);
  const left = (t) => Math.max(0, Math.ceil(t - now));
  const time = (n) => (n >= 60 ? `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}` : `${n}s`);
  const wait = (k, field) => (lootSpireHeld(k) ? 'Redoubt' : left(_s[field]) ? time(left(_s[field])) : '');
  const out = [];
  if (has('flow') && flowStacks(now)) out.push({ key: 'flow', set: 'legendary', name: `Flow ${flowStacks(now)}`, text: time(left(_s.flowUntil)), state: 'active' });
  if (has('bedrock') && bedrockStacks(now)) out.push({ key: 'bedrock', set: 'legendary', name: `Bedrock ${bedrockStacks(now)}`, text: time(left(_s.bedrockUntil)), state: 'active' });
  if (has('dawnward') && _s.charges) out.push({ key: 'dawnward', set: 'legendary', name: 'Dawnward', text: `${_s.charges}/${powerKind(entity, 'dawnward').charges}`, state: 'active' });
  if (has('vigil') && wait('vigil', 'vigilReady')) out.push({ key: 'vigil', set: 'legendary', name: 'Vigil', text: wait('vigil', 'vigilReady'), state: 'recovering' });
  if (has('grace') && wait('grace', 'graceReady')) out.push({ key: 'grace', set: 'legendary', name: 'Divine Grace', text: wait('grace', 'graceReady'), state: 'recovering' });
  if (has('haste') && left(_s.hasteReady)) out.push({ key: 'haste', set: 'legendary', name: 'Haste', text: time(left(_s.hasteReady)), state: 'recovering' });
  return out;
}

export function _resetLootPowersForTests() {
  _carry = new WeakMap(); _resetPlayerHealForTests(); _s = freshState(); _hexed = new WeakMap(); _struck = new WeakSet(); _tolls = new WeakMap(); _lastToll = null;
  _undertow = new WeakMap();
  _say = (line) => { hudText(line); };
}
export function _setLootPowersClockForTests(fn) { _now = typeof fn === 'function' ? fn : () => performance.now() / 1000; }
export function _setLootPowersRandForTests(fn) { _rand = typeof fn === 'function' ? fn : Math.random; }
