#!/usr/bin/env node
// Measures each power registry's top from the records and laws, so the ceilings in src/characters/powerCeiling.js
// come from current numbers.
// Run: node tools/powerCeiling.mjs.

import { isMain } from './lib/isMain.mjs';
import { AFFIX_RANGES, allLegendaries, powerOf } from '../src/items/lootRarity.js';
import { GILDED_RECORDS } from '../src/items/gilded.js';
import { SIGIL_POWER_MAX, SIGIL_STAGES } from '../src/items/sigil.js';
import { SIGIL_SETS, tierValues, SET_STAGE_MAX, RAMPAGE_STACKS, BLOOD_STACKS, COIL_STACKS, UNBROKEN_LESS } from '../src/items/sigilSets.js';
import {
  STAT_DEFS, BLOW_CAP, BLOW_TOTAL_CAP, CAST_COST_CAP, blowPct, statDef, ATTRIBUTES, COMBAT_SKILLS, LIFE_SKILLS, FIRM_ELEMENTS, SCHOOLS, GATHERING,
  CRAFTING, ACTS,
} from '../src/net/firmament/firmamentLaw.js';
import { FIRM_NODES } from '../src/net/firmament/firmamentTree.js';
import { WEAPON_POTENCY_PER_POINT, WEAPON_HALF_PER_POINT } from '../src/characters/weaponMastery.js';
import { EFFECTIVE_SKILL_MAX, SKILL_SOFT_CAP } from '../src/characters/skillSoftcap.js';
import { MARTIAL_BLOW_MOST } from '../src/characters/martialPowers.js';
import { MARTIAL_NUMBERS } from '../src/characters/martialPaths.js';
import { PATH_NUMBERS } from '../src/characters/arcanePaths.js';
import { WEAPON_HANDS } from '../src/characters/equipRules.js';

export const SET_PLACE_COUNT = 9;

export const SET_TIER_BLOW = Object.freeze({
  bloodfury: (v) => v.more * 2,
  rampage: (v) => v.stack * RAMPAGE_STACKS,
  nightfall: (v) => v.more,
  wrath: (v) => v.more,
  riposte: (v) => v.more,
  'run-them-down': (v) => v.more,
  'no-escape': (v) => v.more,
  'blood-for-blood': (v) => v.stack * BLOOD_STACKS,
  constrict: (v) => v.stack * COIL_STACKS,
  'tallow-ward': (v) => v.more,
  'battlemages-discipline': (v) => v.armed,
  'bound-in-silk': (v) => v.more,
  undertow: (v) => v.more,
});
export const SET_TIER_GUARD = Object.freeze({
  unbroken: () => UNBROKEN_LESS,
  'hold-the-line': (v) => v.less,
  gearward: (v) => v.lighter,
});
export const POWER_BLOW = Object.freeze({
  bane: { pct: (p) => p.pct, moment: 'any' },
  unaware: { pct: (p) => p.pct, moment: 'any' },
  sanctified: { pct: (p) => p.pct, moment: 'any' },
  flow: { pct: (p) => p.pct * p.max, moment: 'any' },
  moon: { pct: (p) => p.pct + p.beast, moment: 'any' },
  rage: { pct: (p) => p.pct, moment: 'any' },
  execute: { pct: (p) => p.pct, moment: 'any' },
  firstblood: { pct: (p) => p.pct, moment: 'fresh' },
  toll: { pct: (p) => p.pct, moment: 'any' },
  undertow: { pct: (p) => p.pct * p.max, moment: 'struck' },
});
export const POWER_GUARD = Object.freeze({
  hex: (p) => p.less,
  bedrock: (p) => p.less * p.max,
  laststand: (p) => p.less,
});

const tiersAt = (set, n) => set.tiers.filter((t) => n >= t.at);
export function setKits(sets = Object.values(SIGIL_SETS), places = SET_PLACE_COUNT) {
  const out = [];
  const walk = (i, left, kit) => {
    if (i === sets.length) { if (kit.length) out.push(kit); return; }
    for (const n of [0, 2, 4, 6]) if (n <= left) walk(i + 1, left - n, n ? [...kit, [sets[i], n]] : kit);
  };
  walk(0, places, []);
  return out;
}
const ascendant = (t) => tierValues(t, SET_STAGE_MAX);

export function setsBlowTop() {
  let best = { pct: 0, kit: [] };
  for (const kit of setKits()) {
    let pct = 0;
    for (const [set, n] of kit) for (const t of tiersAt(set, n)) pct += SET_TIER_BLOW[t.key]?.(ascendant(t)) ?? 0;
    if (pct > best.pct) best = { pct, kit: kit.map(([s, n]) => `${s.id} ${n}`) };
  }
  return best;
}
export function setsGuardKeep() {
  let best = { keep: 1, kit: [] };
  for (const kit of setKits()) {
    let keep = 1;
    for (const [set, n] of kit) for (const t of tiersAt(set, n)) keep *= 1 - (SET_TIER_GUARD[t.key]?.(ascendant(t)) ?? 0) / 100;
    if (keep < best.keep) best = { keep, kit: kit.map(([s, n]) => `${s.id} ${n}`) };
  }
  return best;
}

function lootPowers() {
  const weapons = [], worn = [];
  for (const r of allLegendaries()) {
    const p = powerOf(r.id);
    if (!p) continue;
    (r.group === 'Weapons' ? weapons : worn).push({ id: r.id, power: p, templates: r.templates ?? null, slayer: true });
  }
  for (const r of GILDED_RECORDS) weapons.push({ id: r.id, power: r.power, templates: [r.templateIndex], slayer: false });
  return { weapons, worn };
}
const oneHanded = (w) => !w.templates || w.templates.some((t) => WEAPON_HANDS[t] !== 'Both');

export function lootBlowTop() {
  const { weapons, worn } = lootPowers();
  const marks = weapons.filter((w) => w.power.kind === 'broadside');
  const slayerTop = AFFIX_RANGES.slayer.legendary[1];
  const blowOf = (p, moment) => { const b = POWER_BLOW[p.kind]; return b && (b.moment === 'any' || b.moment === moment) ? b.pct(p) : 0; };
  let best = { pct: 0, kit: [] };
  for (const w of [{ id: 'no power', power: null, templates: null, slayer: true }, ...weapons]) {
    if (w.power?.kind === 'broadside') continue;
    for (const moment of ['fresh', 'struck']) {
      let pct = (w.power ? blowOf(w.power, moment) : 0) + (w.slayer ? slayerTop : 0);
      const kit = [w.id];
      for (const o of worn) { const n = blowOf(o.power, moment); if (n) { pct += n; kit.push(o.id); } }
      if (moment === 'struck' && oneHanded(w)) for (const m of marks) { pct += blowOf(m.power, moment); kit.push(`${m.id} (other hand)`); }
      if (pct > best.pct) best = { pct, kit: [...kit, `slayer ${w.slayer ? slayerTop : 0}`, moment] };
    }
  }
  return best;
}
export function lootGuardKeep() {
  const { worn } = lootPowers();
  let keep = 1;
  const kit = [];
  for (const o of worn) { const g = POWER_GUARD[o.power.kind]; if (g) { keep *= 1 - g(o.power) / 100; kit.push(o.id); } }
  return { keep, kit };
}

export function firmamentBlowTop() {
  const c = Object.fromEntries(Object.entries(STAT_DEFS).map(([k, d]) => [k, d.max]));
  return blowPct(c, { skill: 'LongBlade', group: 'undead', unaware: true, wounded: true });
}
export const masteryBlowTop = () => Math.round((EFFECTIVE_SKILL_MAX - SKILL_SOFT_CAP) * Math.max(WEAPON_POTENCY_PER_POINT, WEAPON_HALF_PER_POINT) * 100);
const lighterTop = (numbers) => Math.max(0, ...Object.values(numbers).map((n) => n.lighter ?? 0));

export function measureBlowTops() {
  return {
    sigil: (SIGIL_POWER_MAX * SIGIL_STAGES[SIGIL_STAGES.length - 1].share) / 100,
    sets: setsBlowTop().pct,
    loot: lootBlowTop().pct,
    firmament: firmamentBlowTop(),
    mastery: masteryBlowTop(),
    martial: MARTIAL_BLOW_MOST,
  };
}
export function measureGuardKeeps() {
  return {
    loot: lootGuardKeep().keep,
    sets: setsGuardKeep().keep,
    firmament: 1 + Math.min(STAT_DEFS.blowTaken.min, STAT_DEFS.spellTaken.min) / 100,
    martial: 1 - lighterTop(MARTIAL_NUMBERS) / 100,
    arcane: 1 - lighterTop(PATH_NUMBERS) / 100,
  };
}
export const SET_TIER_OTHER = Object.freeze(['orc-hide', 'spite', 'ravager', 'shadows-grace', 'eventide', 'forbidden-lore', 'waters', 'eye',
  'burning-gate', 'cleave', 'watch-oath', 'keen-eyed', 'thick-skinned', 'iron-hide', 'sea-scale', 'shed-skin', 'dwemer-brass', 'hour-turns',
  'battlemages-bearing', 'battlemages-reprieve', 'wyrd-sight', 'soul-harvest', 'spinners-thread', 'mephalas-veil', 'stormwrack', 'captains-due']);
export const POWER_OTHER = Object.freeze(['chain', 'unyielding', 'dawnward', 'fortune', 'tribute', 'mastery', 'venom', 'quake', 'conduit', 'siphon',
  'echo', 'vigil', 'haste', 'fists', 'evade', 'bulwark', 'grace', 'regen', 'absorb', 'climate', 'school', 'longroad', 'bearing', 'hood',
  'pierce', 'attune', 'surge', 'dragonfire']);
export const FIELD_ROLES = Object.freeze({
  more: 'blow', stack: 'blow', armed: 'blow', pct: 'blow', beast: 'blow', less: 'guard', lighter: 'guard',
  armor: 'line:armor', strength: 'line:stat', endurance: 'line:stat', agility: 'line:stat', intelligence: 'line:stat', willpower: 'line:stat',
  speed: 'line:stat', critical: 'line:skill', stealth: 'line:skill', schools: 'line:skill', archery: 'line:skill', blunt: 'line:skill',
  fire: 'line:resist', frost: 'line:resist', shock: 'line:resist', poison: 'line:resist', magic: 'line:resist', resist: 'line:resist',
  heal: 'heal', absorb: 'chance', chance: 'chance', share: 'splash', back: 'thorns', sear: 'flat', flat: 'flat', nova: 'burst', ward: 'ward',
  shield: 'shield', magicka: 'magicka', refund: 'mana', mana: 'manaFlat', recover: 'recover', halved: 'seconds', seconds: 'seconds', rounds: 'rounds',
  below: 'below', above: 'above', max: 'stacks', charges: 'cadence', every: 'cadence', most: 'hitCap', metres: 'reach', mult: 'find', gold: 'gold',
  heat: 'climate', cold: 'climate', fatigue: 'road', fall: 'road', points: 'pierce', guns: 'ship', hull: 'ship',
  foes: 'id', school: 'id', skill: 'id', standing: 'line:standing',
  'siphon.pct': 'mana', 'regen.pct': 'regen', 'regen.low': 'regen', 'attune.pct': 'regen', 'attune.low': 'regen', 'surge.pct': 'spell',
  'mastery.less': 'cost', 'mastery.low': 'cost', 'conduit.less': 'cost', 'school.less': 'cost', 'waters.less': 'cost', 'bulwark.less': 'flatGuard',
  'haste.speed': 'buff', 'hood.more': 'line:skill',
});
export const LOWER_IS_STRONGER = Object.freeze(['recover', 'above', 'cadence', 'hitCap']);
export function powerNumbers() {
  const out = [];
  const add = (where, kind, p) => {
    for (const [field, value] of Object.entries(p)) {
      if (typeof value !== 'number' && !Array.isArray(value)) continue;
      out.push({ where, field, value, role: FIELD_ROLES[`${kind}.${field}`] ?? FIELD_ROLES[field] ?? null });
    }
  };
  for (const r of allLegendaries()) { const p = powerOf(r.id); if (p) add(`${r.id} (${p.name})`, p.kind, p); }
  for (const r of GILDED_RECORDS) add(`${r.id} (${r.power.name})`, r.power.kind, r.power);
  for (const s of Object.values(SIGIL_SETS)) for (const t of s.tiers) add(`${s.id} ${t.at} (${t.name})`, t.key, ascendant(t));
  return out;
}
export function roleTops(numbers = powerNumbers(), lower = LOWER_IS_STRONGER) {
  const tops = {};
  for (const n of numbers) {
    if (!n.role || n.role === 'id' || n.role.startsWith('line:')) continue;
    const low = lower.includes(n.role);
    if (!(n.role in tops) || (low ? n.value < tops[n.role] : n.value > tops[n.role])) tops[n.role] = n.value;
  }
  return Object.fromEntries(Object.entries(tops).sort(([a], [b]) => a.localeCompare(b)));
}

export const PATH_FIELD_ROLES = Object.freeze({
  pct: 'blow', lighter: 'guard', stacks: 'stacks', seconds: 'seconds', rounds: 'rounds', recover: 'recover', oneIn: 'oneIn',
  below: 'below', heal: 'heal', health: 'killHeal', magicka: 'killMana', trapped: 'killMana', fatigue: 'fatigue', pace: 'pace',
  share: 'extra', burn: 'extra', back: 'refund', leech: 'leech', foes: 'foes', times: 'times', metres: 'reach', points: 'pierce',
  perMissing: 'perMissing', chance: 'chance', agility: 'line:stat', speed: 'line:stat', personality: 'line:stat',
  dodging: 'line:skill', running: 'line:skill', jumping: 'line:skill', etiquette: 'line:skill', streetwise: 'line:skill',
  'flowingSteel.pct': 'blowStack', 'conflux.pct': 'spellStack', 'warRhythm.pct': 'pace', 'grit.health': 'regen', 'grit.fatigue': 'regen',
  'steadfast.pct': 'regen', 'spellsteel.pct': 'spell', 'unseenStrike.pct': 'spell', 'dawnsWard.pct': 'spell', 'sanguine.most': 'spell',
  'betweenMoments.pct': 'castSpeed', 'attunedWards.pct': 'cost', 'aegisBolt.most': 'shieldCap', 'dawnbolt.heal': 'leechShare',
  'siphonLife.share': 'leechShare', 'soulLance.share': 'manaShare',
});
export const PATH_LOWER_IS_STRONGER = Object.freeze(['recover', 'oneIn', 'perMissing']);
export function pathNumbers() {
  const out = [];
  for (const [table, numbers] of [['martial', MARTIAL_NUMBERS], ['arcane', PATH_NUMBERS]]) {
    for (const [id, p] of Object.entries(numbers)) {
      for (const [field, value] of Object.entries(p)) out.push({ where: `${table} ${id}`, field, value, role: PATH_FIELD_ROLES[`${id}.${field}`] ?? PATH_FIELD_ROLES[field] ?? null });
    }
  }
  return out;
}
const SKY_FAMILIES = Object.freeze({
  skill: [...COMBAT_SKILLS, ...LIFE_SKILLS], skillPct: [...COMBAT_SKILLS, ...LIFE_SKILLS], pct: ATTRIBUTES, resist: FIRM_ELEMENTS,
  castCost: SCHOOLS, yield: GATHERING, xp: [...GATHERING, ...CRAFTING], act: ACTS,
});
const SKY_TAKEN = Object.freeze(['blowTaken', 'spellTaken']);
export function skyNumbers() {
  const keys = new Set([...Object.keys(STAT_DEFS), ...Object.entries(SKY_FAMILIES).flatMap(([f, args]) => args.map((a) => `${f}.${a}`))]);
  for (const n of FIRM_NODES.values()) for (const k of Object.keys(n.stats ?? {})) keys.add(k);
  const out = [];
  for (const key of keys) {
    const d = statDef(key);
    const fam = key.includes('.') ? key.slice(0, key.indexOf('.')) : null;
    const role = !d ? null : fam ? `${fam}:${d.kind}` : ATTRIBUTES.includes(key) ? 'attribute' : key;
    out.push({ where: `the sky ${key}`, field: SKY_TAKEN.includes(key) ? 'min' : 'max', value: d ? (SKY_TAKEN.includes(key) ? -d.min : d.max) : null, role });
  }
  out.push({ where: 'the sky BLOW_CAP', field: 'cap', value: BLOW_CAP, role: 'blowCap' }, { where: 'the sky BLOW_TOTAL_CAP', field: 'cap', value: BLOW_TOTAL_CAP, role: 'blowTotal' },
    { where: 'the sky CAST_COST_CAP', field: 'cap', value: CAST_COST_CAP, role: 'castCostCap' });
  return out;
}

export const lineTop = (id) => AFFIX_RANGES[id]?.legendary?.[1] ?? null;
export function linesPastCeiling(item) {
  const out = [];
  for (const a of Array.isArray(item?.affixes) ? item.affixes : []) {
    const top = lineTop(a?.id);
    if (top == null) out.push(`a line of no kind (${JSON.stringify(a)})`);
    else if (!(Number.isInteger(a.value) && a.value <= top)) out.push(`${a.id}${a.param != null ? `:${a.param}` : ''} ${a.value} past ${top}`);
  }
  return out;
}

export const productOf = (tops) => Object.values(tops).reduce((k, p) => k * (1 + p / 100), 1);
export const keepOf = (keeps) => Object.values(keeps).reduce((k, s) => k * s, 1);
export { BLOW_TOTAL_CAP };

if (isMain(import.meta.url)) {
  const blow = measureBlowTops(), guard = measureGuardKeeps();
  console.log('THE BLOW POWERS (per cent onto one blow, each registry at its best):');
  for (const [k, v] of Object.entries(blow)) console.log(`  ${k.padEnd(10)} +${v}%`);
  console.log(`  composite x${productOf(blow).toFixed(5)}`);
  console.log(`  sets kit: ${setsBlowTop().kit.join(', ')}`);
  console.log(`  loot kit: ${lootBlowTop().kit.join(', ')}`);
  console.log('THE GUARDS (share of a hurt each leaves, at its strongest):');
  for (const [k, v] of Object.entries(guard)) console.log(`  ${k.padEnd(10)} x${v.toFixed(4)}`);
  console.log(`  composite x${keepOf(guard).toFixed(6)} kept (${(100 - keepOf(guard) * 100).toFixed(2)}% off)`);
  console.log(`  sets kit: ${setsGuardKeep().kit.join(', ')}; loot kit: ${lootGuardKeep().kit.join(', ')}`);
  console.log('EVERY OTHER NUMBER, today\'s strongest by role:');
  console.log(`  ${JSON.stringify(roleTops())}`);
  const loose = powerNumbers().filter((n) => !n.role);
  if (loose.length) console.log(`  NO ROLE: ${loose.map((n) => `${n.where}.${n.field}`).join(', ')}`);
  console.log('THE PATHS\' NUMBERS, today\'s strongest by role:');
  console.log(`  ${JSON.stringify(roleTops(pathNumbers(), PATH_LOWER_IS_STRONGER))}`);
  console.log('THE SKY\'S CHANNELS, each at its cap:');
  console.log(`  ${JSON.stringify(roleTops(skyNumbers(), []))}`);
}
