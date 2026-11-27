import { modSetting } from '../mods/modSettings.js';
import { contentOn } from '../mods/contentOff.js';
import { STAT_KEYS_ORDER, hitPointsPerLevelUp } from './chargen.js';
import { refreshOnlineLayer } from './renownLayer.js';
import { atLevelCap, releaseCapLatch } from './levelCap.js';

export const ORL_VENDOR = 'oblivion-remaster-leveling';

export const LEVELUP_TOTAL = 100;

export const ATTRIBUTE_INCREASE_LIMIT = 5;

export const MAX_ATTRIBUTE_VALUE = 100;
export const MAX_SKILL_VALUE = 100;

export const LUCK = 'luck';

export const LEVELING_CLASSIC = 'classic';
export const LEVELING_VIRTUE = 'virtue';

const read = (k, r = null) => (r ? r(k) : modSetting(ORL_VENDOR, k));

export const oblivionLevelingEnabled = (r = null) => !!read('Enabled', r);

export function levelingSettings(r = null) {
  return Object.freeze({
    attributePoints: read('attributePoints', r) | 0,
    maxUpdatableAttribute: read('maxUpdatableAttribute', r) | 0,
    allowLuckIncrease: !!read('allowLuckIncrease', r),
    luckIncreaseCost: read('luckIncreaseCost', r) | 0,
    primarySkillsImpact: read('primarySkillsImpact', r) | 0,
    majorSkillsImpact: read('majorSkillsImpact', r) | 0,
    minorSkillsImpact: read('minorSkillsImpact', r) | 0,
    miscSkillsImpact: read('miscSkillsImpact', r) | 0,
  });
}

export const ONLINE_LEVELING_SYSTEM = LEVELING_CLASSIC;
export function newCharacterLevelingSystem(requested, { online = false } = {}) {
  const want = requested === LEVELING_VIRTUE ? LEVELING_VIRTUE : LEVELING_CLASSIC;
  return online ? ONLINE_LEVELING_SYSTEM : want;
}

export function usesVirtueLeveling(entity) {
  if (!contentOn('oblivionLeveling')) return false;
  return entity?.levelingSystem === LEVELING_VIRTUE;
}

export function skillTier(entity, skillId) {
  const c = entity?.career;
  if (!c) return 'misc';
  if (c.primarySkills?.includes(skillId)) return 'primary';
  if (c.majorSkills?.includes(skillId)) return 'major';
  if (c.minorSkills?.includes(skillId)) return 'minor';
  return 'misc';
}

export function skillImpact(tier, s) {
  if (tier === 'primary') return s.primarySkillsImpact;
  if (tier === 'major') return s.majorSkillsImpact;
  if (tier === 'minor') return s.minorSkillsImpact;
  return s.miscSkillsImpact > 0 ? s.miscSkillsImpact : 0;
}

export function addSkillProgress(entity, skillId, s) {
  if (!(MAX_SKILL_VALUE > (entity.skills?.[skillId] ?? 0))) return 0;
  const value = skillImpact(skillTier(entity, skillId), s);
  if (value <= 0) return 0;
  const progress = entity.levelProgress ?? 0;
  const newProgress = progress + value;
  let added = value;
  if (newProgress > LEVELUP_TOTAL) {
    const rollUp = newProgress - LEVELUP_TOTAL;
    added = value - rollUp;
    entity.levelRollUp = (entity.levelRollUp ?? 0) + rollUp;
  }
  entity.levelProgress = progress + added;
  return added;
}

export const levelBarProgress = (entity) => Math.max(0, Math.min(LEVELUP_TOTAL, entity?.levelProgress ?? 0));

export function checkForVirtueLevelUp(entity) {
  if (entity.oghmaLevelUp) return false;
  if (atLevelCap(entity)) { releaseCapLatch(entity); return false; }
  if ((entity.levelProgress ?? 0) < LEVELUP_TOTAL) return false;
  entity.readyToLevelUp = true;
  entity.pendingLevel = entity.level + 1;
  return true;
}

export function rollOverLevelProgress(entity) {
  const rollUp = entity.levelRollUp ?? 0;
  if (rollUp >= LEVELUP_TOTAL) {
    entity.levelProgress = LEVELUP_TOTAL;
    entity.levelRollUp = rollUp - LEVELUP_TOTAL;
  } else {
    entity.levelProgress = rollUp;
    entity.levelRollUp = 0;
  }
}

export function attributeOffset(attrKey, s) {
  return (attrKey === LUCK && s.allowLuckIncrease) ? s.luckIncreaseCost : 1;
}

export function attributeIncreaseLimit(attrKey, s) {
  return (attrKey === LUCK && !s.allowLuckIncrease) ? 1 : ATTRIBUTE_INCREASE_LIMIT;
}

function spendableOn(value, attrKey, s) {
  const limit = attributeIncreaseLimit(attrKey, s);
  const offset = attributeOffset(attrKey, s);
  const headroom = MAX_ATTRIBUTE_VALUE - value;
  if (headroom > limit) return limit * offset;
  if (headroom > 0) return headroom * offset;
  return 0;
}

export function modVirtuePurse(stats, s) {
  let purse = s.attributePoints;
  let total = 0;
  let luckSpendable = 0;
  for (const key of STAT_KEYS_ORDER) {
    const spendable = spendableOn(stats[key], key, s);
    if (key === LUCK) luckSpendable = spendable;
    total += spendable;
  }
  if (total < purse) return total;
  const luckOffset = attributeOffset(LUCK, s);
  const others = total - luckSpendable;
  if (purse > others) purse = others + Math.floor((purse - others) / luckOffset) * luckOffset;
  return purse;
}

export function virtuePurse(stats, s) {
  return virtueSpendPlan(stats, s, modVirtuePurse(stats, s)).cost;
}

export function virtueSpendPlan(stats, s, budget, deltas = null) {
  const rows = STAT_KEYS_ORDER.map((k) => {
    const taken = deltas?.[k] ?? 0;
    const headroom = MAX_ATTRIBUTE_VALUE - stats[k] - taken;
    return {
      k,
      off: attributeOffset(k, s),
      room: Math.max(0, Math.min(attributeIncreaseLimit(k, s) - taken, headroom)),
      slot: taken > 0 ? 0 : 1,
    };
  });
  const open = rows.reduce((n, r) => n + (r.slot === 0 ? 1 : 0), 0);
  const slots = Math.min(rows.length, Math.max(0, (s.maxUpdatableAttribute | 0) - open));
  const reachable = rows.reduce((n, r) => n + r.room * r.off, 0);
  const B = Math.min(reachable, Math.max(0, budget | 0));

  const mk = () => Array.from({ length: slots + 1 }, () => new Int16Array(B + 1).fill(-1));
  let best = mk();
  best[0][0] = 0;
  const trail = [];
  for (const row of rows) {
    const nb = mk(), nt = mk();
    for (let n = 0; n <= slots; n++) {
      for (let c = 0; c <= B; c++) {
        const have = best[n][c];
        if (have < 0) continue;
        if (have > nb[n][c]) { nb[n][c] = have; nt[n][c] = 0; }
        const n2 = n + row.slot;
        if (n2 > slots) continue;
        for (let d = 1; d <= row.room; d++) {
          const cc = c + d * row.off;
          if (cc > B) break;
          if (have + d > nb[n2][cc]) { nb[n2][cc] = have + d; nt[n2][cc] = d; }
        }
      }
    }
    trail.push(nt);
    best = nb;
  }

  let cost = 0, usedSlots = 0;
  for (let c = B; c >= 0; c--) {
    let n = -1, pts = -1;
    for (let i = 0; i <= slots; i++) if (best[i][c] > pts) { pts = best[i][c]; n = i; }
    if (n >= 0 && pts >= 0) { cost = c; usedSlots = n; break; }
  }

  const plan = Object.fromEntries(STAT_KEYS_ORDER.map((k) => [k, 0]));
  let c = cost, n = usedSlots;
  for (let i = rows.length - 1; i >= 0; i--) {
    const d = trail[i][n][c];
    if (d > 0) { plan[rows[i].k] = d; c -= d * rows[i].off; n -= rows[i].slot; }
  }
  return { cost, plan };
}

export function canRaiseAttribute(attrKey, stats, deltas, purse, s) {
  const delta = deltas[attrKey] ?? 0;
  if (purse === 0) return false;
  if (purse - attributeOffset(attrKey, s) < 0) return false;
  if (delta === attributeIncreaseLimit(attrKey, s)) return false;
  if (stats[attrKey] + delta === MAX_ATTRIBUTE_VALUE) return false;
  const raised = STAT_KEYS_ORDER.reduce((n, k) => n + ((deltas[k] ?? 0) > 0 ? 1 : 0), 0);
  if (s.maxUpdatableAttribute <= raised && delta === 0) return false;
  return true;
}

export function canLowerAttribute(attrKey, deltas) {
  return (deltas[attrKey] ?? 0) > 0;
}

export function commitVirtueLevelUp(entity, deltas, purse, s, rolls = Math.random) {
  if (!entity.readyToLevelUp) return false;
  if (atLevelCap(entity)) { entity.readyToLevelUp = false; entity.pendingLevel = null; return false; }
  if (purse !== 0) return false;
  entity.maxHealth = (entity.rawMaxHealth ?? entity.maxHealth) + hitPointsPerLevelUp(entity.career, entity.stats.endurance, rolls);
  entity.health = Math.min(entity.health, entity.maxHealth);
  for (const key of STAT_KEYS_ORDER) {
    const d = deltas[key] ?? 0;
    if (d > 0) entity.stats[key] = entity.stats[key] + d;
  }
  entity.level += 1;
  refreshOnlineLayer(entity, { keepHealth: true });
  rollOverLevelProgress(entity);
  entity.readyToLevelUp = false;
  entity.pendingLevel = null;
  return true;
}

export function virtueLevelUpHeadless(entity, s, rolls = Math.random) {
  const { plan } = virtueSpendPlan(entity.stats, s, modVirtuePurse(entity.stats, s));
  return commitVirtueLevelUp(entity, plan, 0, s, rolls);
}

export function initVirtueLeveling(entity, system) {
  entity.levelingSystem = system;
  entity.levelProgress = 0;
  entity.levelRollUp = 0;
}
