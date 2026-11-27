// @ts-check
import { seededRng } from '../../weather/wind.js';
import { spoilsBase } from '../../worldEvents/gateSpoils.js';
import { applyRarity } from '../../items/lootRarity.js';
import { isForbiddenEquip, wearableItem } from '../../characters/equip.js';
import { ITEM_GROUPS } from '../../items/loot.js';
import { createWeapon, randomMaterial, randomArmorMaterial, WEAPONS_ENUM, ARMOR_ENUM } from '../../combat/enemyEquipment.js';
import { setItemFields, mintCondition, templateByIndex } from '../../items/itemTemplates.js';
import { weaponSkillUsed } from '../../characters/weapons.js';
import { SKILLS, skillValue } from '../../characters/skills.js';
import { factionsTable } from '../quest/tables.js';
import { PAY_NAMES } from './qlSheets.js';

export const PAY_PROFILES = Object.freeze({
  standard: Object.freeze({ gold: 1, gear: true, step: 0 }),
  lesser: Object.freeze({ gold: 0.75, gear: true, step: 0 }),
  greater: Object.freeze({ gold: 1.25, gear: true, step: 1 }),
  double: Object.freeze({ gold: 1, gear: true, step: 0 }),
  betrayal: Object.freeze({ gold: 1, gear: false, step: 0 }),
  own: Object.freeze({ gold: 1, gear: false, step: 0 }),
  none: Object.freeze({ gold: 1, gear: false, step: 0 }),
});
export const OUTCOME_GOLD_MIN = 0.75;
export const OUTCOME_GOLD_MAX = 1.5;
export const REWARD_CHOICES = 3;
// A quest piece stops at Rare, and tier 4 climbs no rung, because a social quest takes its tier from level alone.
export const TIER_FLOORS = Object.freeze({
  1: Object.freeze({ floor: 'magic', up: 0 }),
  2: Object.freeze({ floor: 'magic', up: 0.25 }),
  3: Object.freeze({ floor: 'rare', up: 0 }),
  4: Object.freeze({ floor: 'rare', up: 0 }),
});
const RUNGS = Object.freeze(['magic', 'rare', 'legendary']);
export const WEAPON_SKILLS = Object.freeze([SKILLS.ShortBlade, SKILLS.LongBlade, SKILLS.Axe, SKILLS.BluntWeapon, SKILLS.Archery]);

if (PAY_NAMES.some((p) => !PAY_PROFILES[p]) || Object.keys(PAY_PROFILES).some((p) => !PAY_NAMES.includes(p))) {
  throw new Error('qlRewards: PAY_PROFILES and qlSheets.PAY_NAMES name different pays');
}

export const payProfileOf = (outcome) => PAY_PROFILES[outcome?.pay] ?? PAY_PROFILES.none;

export const goldFactor = (outcome) => Math.min(OUTCOME_GOLD_MAX, Math.max(OUTCOME_GOLD_MIN, payProfileOf(outcome).gold));

export function scaleGold(dfItem, outcome, isGold) {
  if (!dfItem || !isGold) return null;
  const before = Math.max(0, Math.floor(dfItem.stackCount ?? 0));
  const after = Math.max(1, Math.round(before * goldFactor(outcome)));
  dfItem.stackCount = after;
  return { before, after };
}

export const rewardTier = (tier, outcome) => Math.min(4, Math.max(1, (tier | 0) + payProfileOf(outcome).step));

export function pieceRarity(tier, rolls) {
  const t = TIER_FLOORS[Math.min(4, Math.max(1, tier | 0))];
  const i = RUNGS.indexOf(t.floor) + (rolls() < t.up ? 1 : 0);
  return RUNGS[Math.min(RUNGS.length - 1, i)];
}

export function rewardSeed(quest) {
  const s = `${quest?.questName ?? ''}|${quest?.uid ?? 0}|${Math.floor(quest?.questStartTime ?? 0)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function bestWeaponSkills(entity, n = 2) {
  if (!entity) return [...WEAPON_SKILLS];
  return [...WEAPON_SKILLS].map((id, i) => ({ id, i, v: safeSkill(entity, id) }))
    .sort((a, b) => b.v - a.v || a.i - b.i).slice(0, n).map((x) => x.id);
}
const safeSkill = (entity, id) => { try { return Number(skillValue(entity, id)) || 0; } catch { return 0; } };

const KIND_GROUP = Object.freeze({ weapon: 'Weapons', armor: 'Armor', jewel: 'Jewellery' });
const TRIES = 96;

export function fitsPlayer(item, kind, entity, skills = bestWeaponSkills(entity)) {
  if (!item || item.group !== KIND_GROUP[kind]) return false;
  if (isForbiddenEquip(entity?.career ?? null, item)) return false;
  if (kind === 'weapon') return skills.includes(weaponSkillUsed(item.templateIndex));
  return true;
}

const NAMED_BASES = Object.freeze({
  weapon: Object.freeze(Object.values(WEAPONS_ENUM)),
  armor: Object.freeze(Object.values(ARMOR_ENUM)),
  jewel: Object.freeze([...(ITEM_GROUPS.Jewellery ?? [])]),
});
export function namedBaseOf(named) {
  if (!named || typeof named.base !== 'string' || !NAMED_BASES[named.kind]) return null;
  const i = NAMED_BASES[named.kind].find((t) => templateByIndex(t)?.name === named.base);
  return i != null && wearableItem({ group: KIND_GROUP[named.kind], templateIndex: i }) ? i : null;
}
function baseOf(kind, index, level, rolls) {
  if (kind === 'weapon') return mintCondition({ group: 'Weapons', ...createWeapon(index, randomMaterial(level, rolls)) });
  if (kind === 'armor') return mintCondition(setItemFields({ group: 'Armor', templateIndex: index, material: randomArmorMaterial(level, rolls) }));
  return mintCondition(setItemFields({ group: 'Jewellery', templateIndex: index }));
}

/**
 * @param {{ seed: number, level: number, tier: number, entity?: any, named?: { name: string, kind: string, base: string } | null }} args
 */
export function rollRewardChoice({ seed, level, tier, entity = null, named = null }) {
  const rolls = seededRng(seed >>> 0);
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  const skills = bestWeaponSkills(entity);
  const base = namedBaseOf(named);
  const out = [];
  const draw = (kind) => {
    for (let n = 0; n < TRIES; n++) {
      const item = spoilsBase(lv, rolls);
      if (fitsPlayer(item, kind, entity, skills)) return item;
    }
    return null;
  };
  const drawNamed = () => {
    for (let n = 0; n < TRIES; n++) {
      const item = baseOf(named.kind, base, lv, rolls);
      if (fitsPlayer(item, named.kind, entity, skills)) return item;
    }
    return null;
  };
  for (const kind of ['weapon', 'armor', 'jewel']) {
    let item = base != null && named.kind === kind ? drawNamed() : null, k = kind;
    const isNamed = !!item;
    if (!item) item = draw(kind);
    if (!item) { k = kind === 'armor' || out.some((p) => p.kind === 'armor') ? 'jewel' : 'armor'; item = draw(k); }
    if (!item) continue;
    const rarity = pieceRarity(tier, rolls);
    applyRarity(item, rarity, rolls);
    item.isIdentified = true;
    if (isNamed) { item.name = named.name; item.qlNamed = true; }
    out.push(isNamed ? { item, tier: item.rarity ?? rarity, kind: k, named: true } : { item, tier: item.rarity ?? rarity, kind: k });
  }
  return out.slice(0, REWARD_CHOICES);
}

// Only an individual row (p2 of -1) names a faction; p2 of 0 and up is an occupation code, and other negative rows
// are kinds and local groups.
export function factionIdOf(name) {
  try {
    const table = factionsTable();
    if (!table.hasValue(name)) return null;
    if (Number.parseInt(table.getValue('p2', name), 10) !== -1) return null;
    const id = Number.parseInt(table.getValue('p3', name), 10);
    return Number.isSafeInteger(id) && id > 0 && id !== 10000 ? id : null;
  } catch { return null; }
}

/**
 * @param {{ base: number, factor: number, shares?: number } | null | undefined} paid
 * @param {any} outcome
 */
export function goldStillOwed(paid, outcome) {
  if (!paid || !outcome || outcome.failure || outcome.pay === 'none') return 0;
  if (!Number.isSafeInteger(paid.base) || paid.base < 0 || !Number.isFinite(paid.factor)) return 0;
  const shares = Math.max(1, Math.trunc(paid.shares ?? 1) || 1);
  // The pay path scales the gold first and then splits it into shares, so the difference is taken per share.
  const share = (factor) => Math.max(1, Math.floor(Math.max(1, Math.round(paid.base * factor)) / shares));
  return Math.max(0, share(goldFactor(outcome)) - share(paid.factor));
}

export const standingMovesOf = (outcome) => Object.entries(outcome?.standing ?? {})
  .map(([name, amount]) => ({ factionId: factionIdOf(name), name, amount }))
  .filter((s) => s.factionId != null && Number.isSafeInteger(s.amount) && s.amount !== 0);
