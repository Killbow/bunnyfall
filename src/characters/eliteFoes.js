// Elite enemies: one enemy with extra health and blows, a quarter larger size, a glow, and its own drop.
// Pure apart from the item minters; the hosts call these functions.
import { createRandomWeapon, createRandomArmor } from '../items/loot.js';
import { mintCondition, setItemFields } from '../items/itemTemplates.js';
import { applyRarity, rarityEligible, rarityChances, championSource, corpseSource, lootRarityOn } from '../items/lootRarity.js';
import { rareGate, legendaryGate, rollerLevel } from '../items/lootLevelGate.js';
import { goldStack } from '../items/inventory.js';
import { isAmmunition } from '../items/itemTemplates.js';
import { KNIGHT_CITY_WATCH } from './mobileTypes.js';
import { ENEMY_BASICS, isClassEnemyId } from './enemyBasics.js';
import { WEAPON_MATERIALS } from './weapons.js';
import { renownOpens } from '../items/sigil.js';
import { markUnquiet } from '../revenants/unquietMark.js';

export const ELITE_FOE_HEALTH_MULT = 5;
export const ELITE_FOE_DAMAGE_MULT = 3;
export const ELITE_FOE_ELITE_DUNGEON_HEALTH_MULT = 7;
export const ELITE_FOE_ELITE_DUNGEON_DAMAGE_MULT = 4;
export const ELITE_FOE_SUPER_DUNGEON_HEALTH_MULT = 9;
export const ELITE_FOE_SUPER_DUNGEON_DAMAGE_MULT = 4.5;
export const ELITE_FOE_SIZE = 1.25;
export const ELITE_FOE_OVERWORLD_CHANCE = 0.05;
export const ELITE_FOE_DUNGEON_MIN = 3;
export const ELITE_FOE_DUNGEON_MAX = 4;
export const ELITE_FOE_NORMAL_DUNGEON_CHANCE = 0.2;
export const ELITE_FOE_LOOT = Object.freeze({ magic: 2, common: 1, legendaryChance: 0.06, goldPerLevel: [20, 60] });
export const ELITE_RARE_PIECES = 2;
export const ELITE_RARE_SHARE = 0.5;
export function eliteRareChance(level = 1) {
  const lv = Math.max(1, level | 0);
  const blue = rarityChances(championSource(corpseSource({ level: lv }, lv, null))).magic / 1000;
  return ELITE_RARE_SHARE * (1 - (1 - blue) ** ELITE_RARE_PIECES);
}
export const ELITE_FOE_PREFIX = 'Elite ';
export const ELITE_FOE_MIN_LEVEL = 3;
export const ELITE_FOE_MIN_RENOWN = 5;
/**
 * @param {{ online?: boolean, renown?: number|null }} [o]
 */
export const eliteRenownOpen = (o) => renownOpens(ELITE_FOE_MIN_RENOWN, o);

export const eliteEligible = (entity, { checkLevel = true } = {}) => !!entity
  && (!checkLevel || (entity.level | 0) >= ELITE_FOE_MIN_LEVEL)
  && entity.mobileType !== KNIGHT_CITY_WATCH
  && entity.team !== 'PlayerAlly' && entity.mobileTeam !== 'PlayerAlly';

export const elitesAllowed = ({ onlinePage = false, inRoom = false } = {}) => !!(onlinePage || inRoom) || lootRarityOn();

export const isEliteFoe = (entity) => !!entity?.eliteFoe;

export function promoteEliteFoe(entity, { own = true, eliteDungeon = false, superDungeon = false, checkLevel = true } = {}) {
  if (!entity) return false;
  if (entity.eliteFoe) return true;
  if (own && !eliteEligible(entity, { checkLevel })) return false;
  entity.eliteFoe = true;
  // Hosts promote before other scaling and in place of the doubling in Elite Dungeons, so this scales the enemy's roll.
  if (own) {
    const hm = superDungeon ? ELITE_FOE_SUPER_DUNGEON_HEALTH_MULT : eliteDungeon ? ELITE_FOE_ELITE_DUNGEON_HEALTH_MULT : ELITE_FOE_HEALTH_MULT;
    entity.maxHealth = Math.max(1, Math.round((entity.maxHealth || 1) * hm));
    entity.health = entity.maxHealth;
    entity.healthMult = (entity.healthMult ?? 1) * hm;
  }
  const prior = Number.isFinite(entity.damageScale) && entity.damageScale > 0 ? entity.damageScale : 1;
  entity.damageScale = prior * (superDungeon ? ELITE_FOE_SUPER_DUNGEON_DAMAGE_MULT : eliteDungeon ? ELITE_FOE_ELITE_DUNGEON_DAMAGE_MULT : ELITE_FOE_DAMAGE_MULT);
  if (own) markUnquiet(entity);
  return true;
}

export function eliteHash(...parts) {
  let h = 0x811c9dc5;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    h ^= 0x2c; h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
export function eliteRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickDungeonElites(enemies, key, { elite = true, count = null, classLevel = Infinity } = {}) {
  if (!Array.isArray(enemies) || !enemies.length) return 0;
  const rng = eliteRng(eliteHash(elite ? 'elite-dungeon' : 'normal-dungeon', key));
  const want = Number.isInteger(count) ? Math.max(0, count) : elite
    ? ELITE_FOE_DUNGEON_MIN + Math.floor(rng() * (ELITE_FOE_DUNGEON_MAX - ELITE_FOE_DUNGEON_MIN + 1))
    : (rng() < ELITE_FOE_NORMAL_DUNGEON_CHANCE ? 1 : 0);
  const pool = [];
  // Offline one client builds class enemies, so the host hands classLevel; online it stays Infinity so every client's
  // pick agrees.
  const kindLevel = (t) => (isClassEnemyId(t) ? classLevel : (ENEMY_BASICS[t]?.level ?? 0));
  enemies.forEach((e, i) => { if (e && !e.allied && e.reaction !== 'passive' && e.champion == null && kindLevel(e.mobileType) >= ELITE_FOE_MIN_LEVEL) pool.push(i); });
  let n = 0;
  while (n < want && pool.length) {
    const at = Math.floor(rng() * pool.length);
    const i = pool.splice(at, 1)[0];
    enemies[i].eliteFoe = true;
    enemies[i].eliteSeed = eliteHash('elite-trait', key, i);
    n++;
  }
  return n;
}

export const rollOverworldElite = (rolls = Math.random) => rolls() < ELITE_FOE_OVERWORLD_CHANCE && eliteRenownOpen();

function gearPiece(level, rolls) {
  for (let tries = 0; tries < 6; tries++) {
    const raw = rolls() < 0.5 ? createRandomWeapon(level, rolls) : createRandomArmor(level, rolls);
    if (!raw || isAmmunition(raw)) continue;
    const it = mintCondition(setItemFields(raw));
    if (it) return it;
  }
  return null;
}
function tiered(level, tier, rolls) {
  for (let tries = 0; tries < 6; tries++) {
    const it = gearPiece(level, rolls);
    if (!it) continue;
    if (tier === 'common') return it;
    if (!rarityEligible(it)) continue;
    applyRarity(it, tier, rolls);
    if (it.rarity === tier || (tier === 'legendary' && it.rarity)) return it;
  }
  return null;
}
export const tieredGear = (level, tier, rolls = Math.random) => tiered(Math.max(1, level | 0), tier, rolls);

export function eliteLoot(level = 1, rolls = Math.random, rarityMultiplier = 1) {
  const lv = Math.max(1, level | 0);
  const out = [];
  for (let i = 0; i < ELITE_FOE_LOOT.magic; i++) { const it = tiered(lv, 'magic', rolls); if (it) out.push(it); }
  for (let i = 0; i < ELITE_FOE_LOOT.common; i++) { const it = tiered(lv, 'common', rolls); if (it) out.push(it); }
  const at = rollerLevel() ?? lv;
  if (rolls() < rarityMultiplier * eliteRareChance(lv) * (at == null ? 1 : rareGate(at))) { const it = tiered(lv, 'rare', rolls); if (it) out.push(it); }
  if (rolls() < rarityMultiplier * ELITE_FOE_LOOT.legendaryChance * (at == null ? 1 : legendaryGate(at))) { const it = tiered(lv, 'legendary', rolls); if (it) out.push(it); }
  const [lo, hi] = ELITE_FOE_LOOT.goldPerLevel;
  out.push(goldStack(Math.round(lv * (lo + rolls() * (hi - lo)))));
  return out;
}

const _eliteLaid = new WeakMap();
export function grantEliteLoot(entity, level, rolls = Math.random) {
  if (!entity?.eliteFoe || entity._eliteLoot) return;
  entity._eliteLoot = true;
  entity.items = entity.items ?? [];
  const laid = eliteLoot(level ?? entity.level, rolls, entity.cromwarkLootMultiplier ?? 1);
  _eliteLaid.set(entity, laid);
  entity.items.push(...laid);
}
export function withdrawEliteLoot(entity) {
  const laid = _eliteLaid.get(entity);
  if (!laid || !Array.isArray(entity?.items)) return 0;
  _eliteLaid.delete(entity);
  const before = entity.items.length;
  entity.items = entity.items.filter((it) => !laid.includes(it));
  return before - entity.items.length;
}

export function eliteGlow(entity, nowSeconds, phase = 0) {
  if (!entity?.eliteFoe) return 0;
  const k = 0.775 + 0.225 * Math.sin(nowSeconds * 3.2 + phase);
  return entity.staffBoss ? (entity.staffBoss.purple ? SIFRIT_GLOW : STAFF_BOSS_GLOW) + k : k;
}
export const ELITE_FOE_PAD = Object.freeze([0.08, 0.03, 0.08, 0.24]);
export function setBatchEliteGlow(batch, k, nowSeconds = 0) {
  if (!batch) return;
  const v = k > 0 ? k : 0;
  if ((batch.eliteGlow || 0) !== v) batch.eliteGlow = v;
  batch.elitePad = v > 0 ? ELITE_FOE_PAD : null;
  if (v > 0) batch.eliteTime = nowSeconds % 3600;
}
export const ELITE_CORPSE_GLOW = 0.85;
export const ELITE_CORPSE_PAD = Object.freeze([0.08, 0.03, 0.08, 0.03]);
export const isEliteCorpse = (entity) => !!entity?.eliteFoe;
export function markEliteCorpseBatch(batch, phase = Math.random(), boss = false) {
  if (!batch) return;
  batch.eliteGlow = -((boss === 'purple' ? SIFRIT_GLOW : boss ? STAFF_BOSS_GLOW : 0) + 0.05 + 0.95 * Math.min(1, Math.max(0, phase)));
  batch.elitePad = ELITE_CORPSE_PAD;
}
export const eliteCorpseSize = (size, entity) => (isEliteCorpse(entity) && size ? { ...size, w: size.w * eliteSize(entity), h: size.h * eliteSize(entity) } : size);

export const eliteSize = (entity) => (entity?.staffBoss ? entity.staffBoss.size : entity?.raidLeader ? RAID_LEADER_SIZE : entity?.eliteFoe ? ELITE_FOE_SIZE : 1);

export const RAID_LEADER_SIZE = 1.5;
export function promoteRaidLeader(entity, { own = true, name = '' } = {}) {
  if (!entity) return false;
  promoteEliteFoe(entity, { own, checkLevel: false });
  if (!entity.raidLeader) entity.raidLeader = { name: String(name ?? '') };
  if (own) grantEliteLoot(entity, entity.level);
  return true;
}

export const STAFF_BOSS_GLOW = 2;
export const SIFRIT_GLOW = 4;
export const STAFF_BOSS_HEALTH_MULT = 10;
export const STAFF_BOSS_DAMAGE_MULT = ELITE_FOE_DAMAGE_MULT;
export const STAFF_BOSS_MIN_METAL = WEAPON_MATERIALS.Silver;
export const STAFF_BOSS_ARMOR = 10;
export const STAFF_BOSS_SPELL_TAKEN = 0.1;
export const STAFF_BOSS_HIT_SHARE = 0.01;
export const STAFF_BOSS_FIGHTERS_MAX = 100;
export const staffBossHit = (damage, maxHealth, fighters) =>
  Math.min(damage, Math.max(1, Math.round(((maxHealth > 0 ? maxHealth : 1) * STAFF_BOSS_HIT_SHARE) / Math.max(1, fighters))));
export const isStaffBoss = (entity) => !!entity?.staffBoss;
/**
 * @param {any} entity
 * @param {{ own?: boolean, sizePct?: number, healthX?: number, hp?: number, level?: number, name?: string, purple?: boolean }} [o]
 */
export function promoteStaffBoss(entity, { own = true, sizePct = 200, healthX = STAFF_BOSS_HEALTH_MULT, hp = 0, level, name = '', purple = false } = {}) {
  if (!entity || entity.staffBoss) return !!entity;
  entity.staffBoss = { size: Math.max(1.5, Math.min(3, sizePct / 100)), ...(typeof name === 'string' && name ? { name: name.slice(0, 32) } : {}), ...(purple ? { purple: true } : {}) };
  entity.eliteFoe = true;
  if (own) {
    const base = entity.maxHealth || 1;
    const hx = Number.isSafeInteger(hp) && hp >= 1 ? Math.min(1000000, hp) / base
      : Number.isFinite(healthX) && healthX >= 1 ? Math.min(100, healthX) : STAFF_BOSS_HEALTH_MULT;
    entity.maxHealth = Math.max(1, Math.round((entity.maxHealth || 1) * hx));
    entity.health = entity.maxHealth;
    entity.healthMult = (entity.healthMult ?? 1) * hx;
  }
  const prior = Number.isFinite(entity.damageScale) && entity.damageScale > 0 ? entity.damageScale : 1;
  entity.damageScale = prior * STAFF_BOSS_DAMAGE_MULT;
  entity.minMetalToHit = Math.max(entity.minMetalToHit ?? -1, STAFF_BOSS_MIN_METAL);
  entity.armorValues = Array.from({ length: 7 }, (_, i) => Math.min(entity.armorValues?.[i] ?? 100, STAFF_BOSS_ARMOR));
  entity.armor = Math.min(entity.armor ?? 100, STAFF_BOSS_ARMOR);
  if (own) grantEliteLoot(entity, level ?? entity.level);
  return true;
}
