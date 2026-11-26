// @ts-check
import { t } from '../ui/textManager.js';
import { weaponSkillUsed } from './weapons.js';
import { SKILLS } from './skills.js';
import { eliteHash, eliteRng } from './eliteFoes.js';
import { setTraitTitleFormat } from './foeTitle.js';

// Append only: the order is the wire mask's bit order.
export const BOSS_TRAITS = Object.freeze(['warded', 'flameproof', 'frostproof', 'venomproof', 'stormproof', 'spellproof', 'bladeturning', 'stoneskin', 'curbing', 'wrathful', 'thorned']);
export const ELEMENT_TRAITS = Object.freeze(['flameproof', 'frostproof', 'venomproof', 'stormproof', 'spellproof']);
export const WARD_SHARE = 0.3;
export const WARD_REGROW_S = 10;
export const WARD_REFILL_S = 4;
export const RESIST_SHARE = 0.25;
export const WEAPON_RESIST_SHARE = 0.5;
export const CURB_SHARE = 0.05;
export const WRATH_AFTER_S = 75;
export const WRATH_X = 1.6;
export const WRATH_COOL_S = 30;
export const THORN_SHARE = 0.2;
export const BOSS_TRAIT_MASK_MAX = (1 << BOSS_TRAITS.length) - 1;
const EXCLUSIVE = Object.freeze([['bladeturning', 'stoneskin']]);

/**
 * @param {number} nowMs
 * @param {boolean} [paused]
 */
export function tickBossClock(nowMs, paused = false) {
  if (_clockAt != null && !paused) _clockS += Math.max(0, Math.min(1, (nowMs - _clockAt) / 1000));
  _clockAt = nowMs;
  return _clockS;
}
let _clockS = 0, /** @type {number|null} */ _clockAt = null;
export const bossClockS = () => _clockS;

export const bossTraitMask = (traits) => (Array.isArray(traits) ? traits : []).reduce((m, id) => { const i = BOSS_TRAITS.indexOf(id); return i >= 0 ? m | (1 << i) : m; }, 0);
export function bossTraitsOfMask(mask, most = Infinity) {
  if (!Number.isInteger(mask) || mask <= 0) return [];
  const out = [];
  for (const [i, id] of BOSS_TRAITS.entries()) {
    if (!(mask & (1 << i)) || out.length >= most) continue;
    if (EXCLUSIVE.some((pair) => pair.includes(id) && pair.some((o) => o !== id && out.includes(o)))) continue;
    out.push(id);
  }
  return out;
}
export const bossTraitsOf = (entity) => (Array.isArray(entity?.bossTraits) ? entity.bossTraits : []);
export const hasBossTrait = (entity, id) => bossTraitsOf(entity).includes(id);

/**
 * @param {number} n
 * @param {() => number} [roll]
 * @param {readonly string[]} [from]
 */
export function rollBossTraits(n, roll = Math.random, from = BOSS_TRAITS) {
  const pool = [...from];
  const out = [];
  while (out.length < n && pool.length) {
    const id = pool.splice(Math.min(pool.length - 1, Math.floor(roll() * pool.length)), 1)[0];
    out.push(id);
    for (const pair of EXCLUSIVE) if (pair.includes(id)) for (const o of pair) { const k = pool.indexOf(o); if (k >= 0) pool.splice(k, 1); }
  }
  return out;
}

/**
 * @param {any} entity
 * @param {readonly string[]} traits
 * @param {{ own?: boolean }} [o]
 */
export function giveBossTraits(entity, traits, { own = true } = {}) {
  if (!entity || !Array.isArray(traits) || !traits.length || bossTraitsOf(entity).length) return false;
  entity.bossTraits = BOSS_TRAITS.filter((id) => traits.includes(id));
  entity.bossTitle = BOSS_TRAIT_WORDS[entity.bossTraits[0]]?.() ?? '';
  if (own) standBossWard(entity, _clockS);
  return entity.bossTraits.length > 0;
}
export function standBossWard(entity, nowS = Infinity) {
  if (!entity || entity.bossWard || !hasBossTrait(entity, 'warded')) return false;
  const shown = Number.isFinite(entity.bossWardShown) ? Math.max(0, Math.min(1, entity.bossWardShown)) : 1;
  entity.bossWard = { f: shown, at: shown < 1 ? nowS : -Infinity };
  return true;
}
const wardMax = (entity) => Math.max(1, Math.round((entity?.maxHealth || 1) * WARD_SHARE));
export function bossWardNow(entity, nowS) {
  const w = entity?.bossWard, max = wardMax(entity);
  if (!w) return hasBossTrait(entity, 'warded') && Number.isFinite(entity?.bossWardShown) ? { now: max * entity.bossWardShown, max } : null;
  const since = nowS - w.at - WARD_REGROW_S;
  const f = since > 0 ? Math.min(1, w.f + since / WARD_REFILL_S) : w.f;
  return { now: max * f, max };
}

export function bossWardShare(entity, nowS = _clockS) {
  const w = bossWardNow(entity, nowS);
  return w ? Math.max(0, Math.min(100, Math.round((100 * w.now) / Math.max(1, w.max)))) : 0;
}

const bluntBlow = (kind, weapon) => kind === 'melee' && (!weapon || weaponSkillUsed(weapon.templateIndex) === SKILLS.BluntWeapon);
const bladeBlow = (kind, weapon) => kind === 'arrow' || (kind === 'melee' && !!weapon && weaponSkillUsed(weapon.templateIndex) !== SKILLS.BluntWeapon);

/**
 * @param {any} entity
 * @param {number} damage
 * @param {{ kind?: string, weapon?: any, element?: number|null, whole?: boolean }} [o]
 * @returns {{ damage: number, thorns: number }}
 */
export function bossStrike(entity, damage, { kind = 'melee', weapon = null, element = null, whole = false } = {}) {
  const traits = bossTraitsOf(entity);
  if (!traits.length || whole || !(damage > 0)) return { damage, thorns: 0 };
  let d = damage;
  if (kind === 'spell' && Number.isInteger(element) && traits.includes(ELEMENT_TRAITS[/** @type {number} */ (element)])) d *= RESIST_SHARE;
  if (traits.includes('bladeturning') && bladeBlow(kind, weapon)) d *= WEAPON_RESIST_SHARE;
  if (traits.includes('stoneskin') && bluntBlow(kind, weapon)) d *= WEAPON_RESIST_SHARE;
  const landed = d < damage ? Math.max(1, Math.round(d)) : damage;
  const thorns = traits.includes('thorned') && (kind === 'melee' || kind === 'arrow') ? Math.max(1, Math.round(landed * THORN_SHARE)) : 0;
  return { damage: landed, thorns };
}

/**
 * @param {any} entity
 * @param {number} damage
 * @param {{ whole?: boolean, nowS?: number, blow?: boolean, mine?: boolean }} [o]
 * @returns {{ damage: number, ward: number, broke: boolean }}
 */
export function bossTake(entity, damage, { whole = false, nowS = 0, blow = true, mine = true } = {}) {
  const traits = bossTraitsOf(entity);
  if (!traits.length || whole || !blow || !(damage > 0)) return { damage, ward: 0, broke: false };
  let d = damage;
  if (traits.includes('curbing')) d = Math.min(d, Math.max(1, Math.round((entity.maxHealth || 1) * CURB_SHARE)));
  if (mine) { bossTraitsTick(entity, nowS); entity.bossFoughtS = nowS; if (traits.includes('wrathful') && entity.bossWrathFrom == null) entity.bossWrathFrom = nowS; }
  let ward = 0, broke = false;
  const w = bossWardNow(entity, nowS);
  if (w && entity.bossWard) {
    ward = Math.min(w.now, d);
    entity.bossWard.f = w.max > 0 ? (w.now - ward) / w.max : 0;
    entity.bossWard.at = nowS;
    broke = w.now > 0 && entity.bossWard.f <= 0;
    d -= ward;
  }
  return { damage: d, ward, broke };
}

/**
 * @param {any} entity
 * @param {number} nowS
 */
export function bossWrathDue(entity, nowS) {
  if (!entity || entity.bossWrath || !hasBossTrait(entity, 'wrathful') || entity.bossWrathFrom == null) return false;
  if (nowS - entity.bossWrathFrom < WRATH_AFTER_S) return false;
  return markBossWrath(entity);
}
/**
 * @param {any} entity
 * @param {number} nowS
 */
export function bossTraitsTick(entity, nowS) {
  if (!entity || entity.bossWrath || entity.bossWrathFrom == null) return null;
  if (nowS - (entity.bossFoughtS ?? entity.bossWrathFrom) > WRATH_COOL_S) { entity.bossWrathFrom = null; return null; }
  return bossWrathDue(entity, nowS) ? 'wrath' : null;
}
export function markBossWrath(entity) {
  if (!entity || entity.bossWrath) return false;
  entity.bossWrath = true;
  const prior = Number.isFinite(entity.damageScale) && entity.damageScale > 0 ? entity.damageScale : 1;
  entity.damageScale = prior * WRATH_X;
  return true;
}

export const BOSS_TRAIT_WORDS = Object.freeze({
  warded: () => t('bossTraits.word.warded', 'Warded'),
  flameproof: () => t('bossTraits.word.flameproof', 'Flameproof'),
  frostproof: () => t('bossTraits.word.frostproof', 'Frostproof'),
  venomproof: () => t('bossTraits.word.venomproof', 'Venomproof'),
  stormproof: () => t('bossTraits.word.stormproof', 'Stormproof'),
  spellproof: () => t('bossTraits.word.spellproof', 'Spellproof'),
  bladeturning: () => t('bossTraits.word.bladeturning', 'Blade-turning'),
  stoneskin: () => t('bossTraits.word.stoneskin', 'Stoneskinned'),
  curbing: () => t('bossTraits.word.curbing', 'Curbing'),
  wrathful: () => t('bossTraits.word.wrathful', 'Wrathful'),
  thorned: () => t('bossTraits.word.thorned', 'Thorned'),
});
export const BOSS_TRAIT_RULES = Object.freeze({
  warded: () => t('bossTraits.rule.warded', 'A ward takes every blow first. It grows back if you stop hitting it.'),
  flameproof: () => t('bossTraits.rule.flameproof', 'Fire spells do a quarter of their damage.'),
  frostproof: () => t('bossTraits.rule.frostproof', 'Frost spells do a quarter of their damage.'),
  venomproof: () => t('bossTraits.rule.venomproof', 'Poison spells do a quarter of their damage.'),
  stormproof: () => t('bossTraits.rule.stormproof', 'Shock spells do a quarter of their damage.'),
  spellproof: () => t('bossTraits.rule.spellproof', 'Magic spells do a quarter of their damage.'),
  bladeturning: () => t('bossTraits.rule.bladeturning', 'Blades and arrows do half damage. Blunt weapons and fists do full.'),
  stoneskin: () => t('bossTraits.rule.stoneskin', 'Blunt weapons and fists do half damage. Blades do full.'),
  curbing: () => t('bossTraits.rule.curbing', 'No single blow takes more than {pct}% of its health.', { pct: Math.round(CURB_SHARE * 100) }),
  wrathful: () => t('bossTraits.rule.wrathful', 'It hits much harder once the fight has gone on for {s} seconds.', { s: WRATH_AFTER_S }),
  thorned: () => t('bossTraits.rule.thorned', 'Some of every weapon blow that lands comes back at you.'),
});
setTraitTitleFormat((word, name) => t('bossTraits.title', '{trait} {name}', { trait: word, name }));
export const bossTraitWords = (entity) => bossTraitsOf(entity).map((id) => BOSS_TRAIT_WORDS[id]?.() ?? id);
export const bossTraitRules = (entity) => bossTraitsOf(entity).map((id) => BOSS_TRAIT_RULES[id]?.() ?? '').filter(Boolean);
const _taught = new Set();
export function bossTraitsTaught(entity) {
  const out = [];
  for (const id of bossTraitsOf(entity)) {
    if (_taught.has(id)) continue;
    _taught.add(id);
    out.push(t('bossTraits.say.learn', '{trait}: {rule}', { trait: BOSS_TRAIT_WORDS[id]?.() ?? id, rule: BOSS_TRAIT_RULES[id]?.() ?? '' }));
  }
  return out;
}
export const _resetBossTraitsTaughtForTests = () => _taught.clear();
export const bossWardBrokeLine = (name) => t('bossTraits.say.wardBroke', 'The ward on {name} breaks!', { name });
export const bossWrathLine = (name) => t('bossTraits.say.wrath', '{name} flies into a rage!', { name });

/**
 * @param {any} entity
 * @param {number} damage
 * @param {string} kind
 * @param {any} weapon
 * @param {number|null} element
 * @param {boolean} whole
 * @param {((n: number) => void) | null} thorns
 */
export function bossStrikeAt(entity, damage, kind, weapon, element, whole, thorns) {
  const s = bossStrike(entity, damage, { kind, weapon, element, whole });
  if (s.thorns > 0) thorns?.(s.thorns);
  return s.damage;
}
/**
 * @param {any} entity
 * @param {number} damage
 * @param {boolean} whole
 * @param {number} nowS
 * @param {((line: string) => void) | null} say
 * @param {() => string} nameOf
 */
export function bossTakeAt(entity, damage, whole, nowS, say, nameOf, { blow = true, mine = true } = {}) {
  if (!bossTraitsOf(entity).length) return damage;
  const tk = bossTake(entity, damage, { whole, nowS, blow, mine });
  if (tk.broke) say?.(bossWardBrokeLine(nameOf()));
  if (bossWrathDue(entity, nowS)) say?.(bossWrathLine(nameOf()));
  return tk.damage;
}

export function eliteTraits(entity, seed = null) {
  return giveBossTraits(entity, rollBossTraits(1, Number.isSafeInteger(seed) ? eliteRng(seed) : Math.random));
}
export const RELAY_BOSS_TRAITS = Object.freeze(['flameproof', 'frostproof', 'venomproof', 'stormproof', 'spellproof', 'bladeturning', 'stoneskin', 'thorned']);
export const RELAY_BOSS_BLOW_TRAITS = Object.freeze(['bladeturning', 'stoneskin', 'thorned']);
export function relayBossTraits(name, kind) {
  const r = eliteRng(eliteHash('relay-boss', name ?? '', kind ?? ''));
  const pick = (list) => list[Math.min(list.length - 1, Math.floor(r() * list.length))];
  return [pick(ELEMENT_TRAITS), pick(RELAY_BOSS_BLOW_TRAITS)];
}
export const bossTraitsMetLine = (name, words) => t('bossTraits.say.met', '{name}: {traits}.', { name, traits: words.join(', ') });
