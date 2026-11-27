// @ts-check
import { SKILLS, SKILL_KEYS, permanentSkillValue } from './skills.js';
import { ATTRIBUTES, COMBAT_SKILLS, LIFE_SKILLS, FIRM_ELEMENTS, blowPct, castCostPct, statDef, pctOf } from '../net/firmament/firmamentLaw.js';
import { firmamentStats, onFirmamentChange, firmamentInForce } from './firmamentLive.js';
import { sigilDueling } from '../items/sigil.js';
import { registerEntityFold, registerWeaponBlowMod, newMods, EMPTY_MODS, NUMBER_BODY_PARTS, STANDING_CHANNELS, computeEntityMods } from './entityMods.js';
import { blowRoom, guardRoom } from './powerCeiling.js';
import { registerSpellPowerMod, registerSpellPierceMod } from '../magic/spellPower.js';
import { registerSpellCostMod, effectSchool } from '../magic/spellcost.js';
import { registerCastSpeedMod } from '../magic/castSpeed.js';
import { registerPlayerDamageMod, registerPlayerBlowEvasion, playerEntity } from './playerEntity.js';
import { registerPlayerKillListener } from '../player/playerKills.js';
import { registerMagicRoundHook } from '../world/worldTick.js';
import { registerAbsorptionChance } from '../magic/absorption.js';
import { pendingPlayerBlow } from '../items/sigilSetPowers.js';
import { foeGroup } from '../items/lootPowers.js';
import { healMine, manaMine } from '../player/playerHeal.js';
import { playerDoor } from '../player/playerDoor.js';
import { setOnlineLayerExtra, renownHpOf, renownMpOf } from './renownLayer.js';
import { evenHpOf } from './levelEven.js';
import { weaponSkillUsed } from './weapons.js';
import { KNIGHT_CITY_WATCH } from './mobileTypes.js';
import { regenShare } from '../worldEvents/courtRules.js';

/** @type {Readonly<Record<string, number>>} */
const NONE = Object.freeze({});
const mine = (e) => !!e?.isPlayer && !e.peer;
export const firmamentAwake = (e) => mine(e) && firmamentInForce() && !sigilDueling() && !e?._mentor;
const fight = (e) => (!_quiet && firmamentAwake(e) ? firmamentStats() : NONE);
const life = (e) => (!_quiet && mine(e) && !e?._mentor ? firmamentStats() : NONE);
let _quiet = false;
export function withoutFirmament(entity, fn) {
  if (!entity || !firmamentInForce()) return fn();
  const kept = entity._mods;
  _quiet = true;
  try { computeEntityMods(entity); return fn(); } finally { _quiet = false; entity._mods = kept; }
}

let _rand = Math.random;
let _carry = new WeakMap();
let _takenOwed = { blow: 0, spell: 0 };

function shareOf(key, damage, pct, keep = true) {
  const exact = (damage * pct) / 100 + (_carry.get(key) ?? 0);
  const whole = pct >= 0 ? Math.floor(exact + 1e-9) : Math.ceil(exact - 1e-9);
  if (keep) _carry.set(key, exact - whole);
  return whole;
}

const capAt = (key, v) => { const d = statDef(key); return d ? Math.max(d.min, Math.min(d.max, v)) : v; };

const attributeGain = (entity, a, read) => capAt(a, read(a) + pctOf(entity.stats?.[a], read(`pct.${a}`)));
export function firmamentFold(entity) {
  const f = fight(entity), l = life(entity);
  if (f === NONE && l === NONE) return EMPTY_MODS;
  const mods = newMods();
  const read = (key) => (statDef(key)?.kind === 'life' ? l[key] : f[key]) ?? 0;
  for (const a of ATTRIBUTES) {
    const v = attributeGain(entity, a, read);
    if (v) mods.stats[a] = v;
    if (v > 0) mods.statMax[a] = v;
  }
  for (const n of [...COMBAT_SKILLS, ...LIFE_SKILLS]) {
    const id = SKILLS[n];
    const share = read(`skillPct.${n}`);
    const v = capAt(`skill.${n}`, read(`skill.${n}`) + (share ? pctOf(permanentSkillValue(entity, id), share) : 0));
    if (v) mods.skills[id] = v;
  }
  for (const e of FIRM_ELEMENTS) { const v = read(`resist.${e}`); if (v) mods.resist[e] = v; }
  const armor = read('armor');
  if (armor) for (let p = 0; p < NUMBER_BODY_PARTS; p++) mods.armorParts[p] = armor;
  mods.weightMult = read('carry') / 100;
  const standing = read('standing');
  if (standing) for (let g = 0; g < STANDING_CHANNELS; g++) mods.standing[g] = standing;
  for (const k of ['warmth', 'dry', 'coldDegrees', 'heatDegrees', 'fatigueLess', 'fallLess']) /** @type {any} */ (mods)[k] = read(k);
  return mods;
}

export function firmamentBlow(weapon, damage, attacker, target, info) {
  if (!(damage > 0) || !target || target.isPlayer || target.warded) return damage;
  const c = fight(attacker);
  if (c === NONE) return damage;
  const skill = weapon ? SKILL_KEYS[weaponSkillUsed(weapon.templateIndex)] ?? null : 'HandToHand';
  const wounded = Number.isFinite(attacker.health) && attacker.maxHealth > 0 && attacker.health < attacker.maxHealth / 2;
  const pct = blowRoom(blowPct(c, { skill, group: foeGroup(target), unaware: !!info?.unaware, wounded }), 'firmament');
  if (!pct) return damage;
  return Math.max(1, damage + shareOf(weapon ?? attacker, damage, pct, !info?.estimate));
}

export const firmamentSpellPower = (caster) => fight(caster).spellPower ?? 0;
export const firmamentSpellPierce = (caster) => fight(caster).spellPierce ?? 0;
export const firmamentCastSpeed = (entity) => fight(entity).castSpeed ?? 0;
export function firmamentCastCost(entity, sp, spell = null) {
  const c = fight(entity);
  if (c === NONE) return sp;
  const schools = (spell?.effects ?? []).filter((e) => e && e.type > -1).map((e) => SKILL_KEYS[effectSchool(e)]).filter(Boolean);
  const pct = castCostPct(c, schools);
  return pct ? (sp * (100 - pct)) / 100 : sp;
}

export function firmamentDamage(entity, dmg) {
  const c = fight(entity);
  if (c === NONE || !(dmg > 0)) return dmg;
  const ch = pendingPlayerBlow() ? 'blow' : 'spell';
  const pct = -guardRoom(-(ch === 'blow' ? (c.blowTaken ?? 0) : (c.spellTaken ?? 0)), 'firmament');
  if (!pct) return dmg;
  const exact = (dmg * pct) / 100 + _takenOwed[ch];
  const whole = pct >= 0 ? Math.floor(exact + 1e-9) : Math.ceil(exact - 1e-9);
  _takenOwed[ch] = exact - whole;
  return Math.max(0, dmg + whole);
}
export function firmamentEvade(entity) {
  const c = fight(entity);
  if (!c.evade || !pendingPlayerBlow()) return false;
  return _rand() * 100 < c.evade;
}
export const firmamentAbsorb = (target) => fight(target).absorb ?? 0;

const neverCounts = (e) => !!e?.isPlayer || !!e?.peer || e?.mobileType === KNIGHT_CITY_WATCH || e?.team === 'PlayerAlly' || e?.mobileTeam === 'PlayerAlly';
const me = () => playerDoor()?.player?.() ?? playerEntity;
export function firmamentKill(foe) {
  if (!foe || neverCounts(foe)) return;
  const m = me();
  const c = fight(m);
  if (c.killHeal) healMine(m, (m.maxHealth * c.killHeal) / 100);
  if (c.killMana) manaMine(m, (m.maxMagicka * c.killMana) / 100);
}
export function firmamentRound(entity) {
  if (!mine(entity)) return;
  firmamentLayer(entity);
  const c = fight(entity);
  if (c.hpRegen && entity.health > 0 && entity.health < entity.maxHealth) { const held = regenShare((entity.maxHealth * c.hpRegen) / 1000, 'firmament', entity); if (held > 0) healMine(entity, held); }
  if (c.mpRegen && entity.magicka < entity.maxMagicka) manaMine(entity, (entity.maxMagicka * c.mpRegen) / 1000);
}
export function firmamentLayer(entity = me()) {
  const c = fight(entity);
  if (!entity) return;
  const baseHp = Number.isFinite(entity.rawMaxHealth) ? entity.rawMaxHealth : (entity.maxHealth ?? 0) - renownHpOf(entity);
  const baseMp = (entity.maxMagicka ?? 0) - renownMpOf(entity);
  const end = attributeGain(entity, 'endurance', (key) => c[key] ?? 0);
  const floored = baseHp + (Number.isFinite(entity.rawMaxHealth) ? evenHpOf(entity, (entity.stats?.endurance ?? NaN) + end) : 0);
  setOnlineLayerExtra(entity, { hp: capAt('hp', (c.hp ?? 0) + pctOf(floored, c.hpPct ?? 0)), mp: capAt('mp', (c.mp ?? 0) + pctOf(baseMp, c.mpPct ?? 0)), end });
}

export const FIRMAMENT_POWERS = 'firmament';
registerEntityFold(FIRMAMENT_POWERS, firmamentFold);
registerWeaponBlowMod(FIRMAMENT_POWERS, firmamentBlow);
registerSpellPowerMod(FIRMAMENT_POWERS, firmamentSpellPower);
registerSpellPierceMod(FIRMAMENT_POWERS, firmamentSpellPierce);
registerSpellCostMod(FIRMAMENT_POWERS, firmamentCastCost);
registerCastSpeedMod(FIRMAMENT_POWERS, firmamentCastSpeed);
registerPlayerDamageMod(FIRMAMENT_POWERS, firmamentDamage);
registerPlayerBlowEvasion(FIRMAMENT_POWERS, firmamentEvade);
registerAbsorptionChance(FIRMAMENT_POWERS, firmamentAbsorb);
registerPlayerKillListener(FIRMAMENT_POWERS, firmamentKill);
registerMagicRoundHook(FIRMAMENT_POWERS, firmamentRound);
onFirmamentChange(() => {
  const m = me();
  if (!m) return;
  try { computeEntityMods(m); firmamentLayer(m); } catch { }
});

export function _resetFirmamentPowersForTests() { _carry = new WeakMap(); _takenOwed = { blow: 0, spell: 0 }; }
export function _setFirmamentPowersRandForTests(fn) { _rand = typeof fn === 'function' ? fn : Math.random; }
