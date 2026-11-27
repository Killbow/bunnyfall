// @ts-check

import { lootRarityOn } from '../items/lootRarity.js';
import { foeTitle } from './foeTitle.js';
import { registerPlayerStruckListener, registerPlayerStrikeListener } from '../combat/formulas.js';
import { hurtPlayer } from './playerEntity.js';
import { KNIGHT_CITY_WATCH } from './mobileTypes.js';
import { enemyDisplayName } from './enemyBasics.js';
import { popupMessage } from '../ui/notify.js';
import { markUnquiet } from '../revenants/unquietMark.js';

export const CHAMPION_PER_MILLE = 70;
export const CHAMPION_MIN_LEVEL = 3;
export const CHAMPION_HEALTH = 2;
export const CHAMPION_DAMAGE = 1.25;
/** @typedef {{ id: string, name: string, text: string, damage?: number, health?: number, speed?: number, drink?: number, thorns?: number }} ChampionTrait */
// Append only: the index is sent on the wire as cp.
/** @type {ReadonlyArray<Readonly<ChampionTrait>>} */
export const CHAMPION_TRAITS = Object.freeze([
  Object.freeze({ id: 'mighty', name: 'Mighty', text: 'Its blows hit 50% harder', damage: 1.5 }),
  Object.freeze({ id: 'stalwart', name: 'Stalwart', text: 'It has 50% more health, on top of a champion\'s double', health: 1.5 }),
  Object.freeze({ id: 'swift', name: 'Swift', text: 'It has 30 more Speed, so it closes in and attacks sooner', speed: 30 }),
  Object.freeze({ id: 'vampiric', name: 'Vampiric', text: 'It heals for half the damage it deals you', drink: 50 }),
  Object.freeze({ id: 'thorned', name: 'Thorned', text: 'Your hits on it hurt you for a seventh of their damage', thorns: 7 }),
]);
export const championTrait = (id) => CHAMPION_TRAITS.find((t) => t.id === id) ?? null;
export const championIndex = (id) => CHAMPION_TRAITS.findIndex((t) => t.id === id);
export const championOf = (entity) => (entity?.champion ? championTrait(entity.champion) : null);
export function championName(entity, base) {
  return foeTitle(entity, base);
}

export function properName(entity) {
  const n = typeof entity?.properName === 'string' ? entity.properName : '';
  return n ? n[0].toUpperCase() + n.slice(1) : null;
}

function mix(...ns) {
  let h = 0x811c9dc5;
  for (const n of ns) {
    let v = Math.trunc(Number(n) || 0) >>> 0;
    for (let i = 0; i < 4; i++) { h ^= v & 0xff; h = Math.imul(h, 0x01000193) >>> 0; v >>>= 8; }
  }
  return h >>> 0;
}
export function markDungeonChampions(records, locationKey) {
  if (!lootRarityOn() || !Array.isArray(records)) return 0;
  let n = 0;
  records.forEach((e, i) => {
    if (!e || e.allied || e.champion != null) return;
    const h = mix(locationKey, i, 0x10071);
    if (h % 1000 < CHAMPION_PER_MILLE) { e.champion = (h >>> 10) % CHAMPION_TRAITS.length; n++; }
  });
  return n;
}
let _streetN = 0;
export function rollStreetChampion(feet = null, mobileType = 0) {
  if (!lootRarityOn()) return null;
  const h = mix(Math.round((Number(feet?.[0]) || 0) * 64), Math.round((Number(feet?.[2]) || 0) * 64), mobileType, ++_streetN, 0x57ee7);
  return h % 1000 < CHAMPION_PER_MILLE ? (h >>> 10) % CHAMPION_TRAITS.length : null;
}
export function _resetStreetChampionsForTests() { _streetN = 0; }

export function championTraitFor(entity, traitIndex) {
  if (!entity || !Number.isInteger(traitIndex) || !lootRarityOn()) return null;
  const t = CHAMPION_TRAITS[traitIndex];
  if (!t || (entity.level | 0) < CHAMPION_MIN_LEVEL) return null;
  if (entity.mobileType === KNIGHT_CITY_WATCH || entity.team === 'PlayerAlly' || entity.mobileTeam === 'PlayerAlly') return null;
  return t;
}

export function applyChampion(entity, traitIndex, { own = true } = {}) {
  const t = championTraitFor(entity, traitIndex);
  if (!t) return false;
  entity.champion = t.id;
  const hp = CHAMPION_HEALTH * (t.health ?? 1);
  entity.maxHealth = Math.max(1, Math.round((entity.maxHealth ?? 1) * hp));
  entity.health = entity.maxHealth;
  entity.healthMult = (entity.healthMult ?? 1) * hp;
  entity.damageScale = (Number.isFinite(entity.damageScale) ? entity.damageScale : 1) * CHAMPION_DAMAGE * (t.damage ?? 1);
  if (t.speed && entity.stats) entity.stats.speed = Math.min(100, (entity.stats.speed ?? 50) + t.speed);
  if (own) markUnquiet(entity);
  return true;
}

export function championStruck(attacker, target, damage) {
  const t = championOf(attacker);
  if (!t?.drink || !(damage > 0) || !target?.isPlayer || !(attacker.health > 0)) return;
  attacker.health = Math.min(attacker.maxHealth ?? attacker.health, attacker.health + Math.max(1, Math.round((damage * t.drink) / 100)));
}
export function championStrike(attacker, target, damage) {
  const t = championOf(target);
  if (!t?.thorns || !(damage > 0) || !attacker?.isPlayer || attacker.peer) return;
  hurtPlayer(attacker, Math.max(1, Math.round(damage / t.thorns)));
}
export const CHAMPIONS = 'champions';
registerPlayerStruckListener(CHAMPIONS, championStruck);
registerPlayerStrikeListener(CHAMPIONS, championStrike);

export function championLines(entity) {
  const t = championOf(entity);
  const base = t ? enemyDisplayName(entity.mobileType) : null;
  return base ? [`${championName(entity, base)} stands as a champion.`, `${t.text}.`] : null;
}
const _said = new WeakSet();
export function sayChampion(entity, say = popupMessage) {
  if (!entity || _said.has(entity)) return false;
  const lines = championLines(entity);
  if (!lines) return false;
  _said.add(entity);
  for (const line of lines) say(line);
  return true;
}
export const CHAMPIONS_SAID = 'champions-said';
registerPlayerStruckListener(CHAMPIONS_SAID, (attacker, target, damage) => { if (damage > 0 && target?.isPlayer && !target.peer) sayChampion(attacker); });
registerPlayerStrikeListener(CHAMPIONS_SAID, (attacker, target, damage) => { if (damage > 0 && attacker?.isPlayer && !attacker.peer) sayChampion(target); });
