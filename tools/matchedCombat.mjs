import { registerCustomTemplates } from '../src/items/itemTemplates.js';
import { RRI_TEMPLATES } from '../src/mods/rriItems.js';
import { installHeavyGear } from '../src/systems/heavyGear.js';
import { installCrossbowLoot } from '../src/items/crossbow.js';
import { combinationDelivery } from '../src/combat/abilities/combinations.js';
import { CAPSTONE_RECOVERY_MS } from '../src/combat/abilities/engine.js';
import { equipDelayFor } from '../src/characters/equip.js';
import fs from 'node:fs';
import { readSpellsStd } from '../src/formats/spellsStd.js';
import { calculateCastCost } from '../src/magic/spellcost.js';
import { applySpell, isDamageHealth } from '../src/magic/effects.js';
import { playerAttackOptions } from '../src/combat/playerWeapon.js';
import { calculateAttackDamage, registerFormulaOverride } from '../src/combat/formulas.js';
import { createWeapon } from '../src/combat/enemyEquipment.js';
import { ABILITIES } from '../src/combat/abilities/registry.js';
import { milestoneDelivery } from '../src/combat/abilities/milestones.js';
import { capstonePower } from '../src/combat/abilities/capstones.js';
import { previewDamage } from '../src/combat/abilities/previewHits.js';
import { SKILLS } from '../src/characters/skills.js';
import { FATIGUE_MULTIPLIER, maxFatigue } from '../src/characters/statMods.js';
import { SWING_FATIGUE_COST } from '../src/combat/hostCombat.js';
import { installPcaao, uninstallPcaao } from '../src/combat/pcaao.js';
import { buildAt, mulberry } from './heroMeasure.mjs';

globalThis.location = { search: '?abilities' };
const book = readSpellsStd(fs.readFileSync(process.argv.slice(2).find(arg => !arg.startsWith('--')) ?? '../bunnyfall-data/ARENA2/SPELLS.STD'));
const sampleCount = 256;
const rank = Number(process.argv.find(arg => arg.startsWith('--rank='))?.slice(7) ?? 100);
const level = {25: 1, 50: 12, 75: 20, 100: 30, 130: 30}[rank];
if (!level) throw Error('Supported ranks are 25, 50, 75, 100 and 130');
const tier = buildAt(level);
const material = rank >= 100 ? 9 : tier.wmat;
const bossHP = Math.round(2000 * tier.hp / buildAt(30).hp);
const stats = { strength: 100, intelligence: 100, willpower: 100, agility: 100, endurance: 100, speed: 100, luck: 75 };
if (rank < 100) Object.assign(stats, { strength: tier.STR, intelligence: tier.STR, agility: tier.AGI, endurance: tier.END, speed: tier.SPD, luck: tier.LUC, willpower: tier.WIL });
const hero = { isPlayer: true, raceId: 1, level, health: 300, maxHealth: 300, reflexes: 2,
  stats, skills: Array(35).fill(rank), career: {}, items: [] };
registerCustomTemplates(RRI_TEMPLATES);
installHeavyGear();
installCrossbowLoot();
const styles = Map.groupBy(ABILITIES.filter(a => a.category === 'weapon'), a => a.id.split('.')[1]);
const spells = book.filter(s => s.effects.some(isDamageHealth) && s.effects.every(e => e.type < 0 || isDamageHealth(e)));
const prices = new Map(spells.map(s => [s, calculateCastCost(s, hero).sp]));
const windows = [10000, 30000, 120000];

function encounter(seed) {
  const target = { level, health: bossHP, maxHealth: bossHP, stats: { ...stats, willpower: 60, agility: 55, luck: 50 },
    skills: { [SKILLS.Dodging]: 35 }, armorValues: Array(7).fill(30), career: {}, items: [], activeEffects: [] };
  const rolls = mulberry(seed);
  let total = 0, kill = Infinity;
  const damage = windows.map(() => 0);
  function hit(at, amount) {
    if (!Number.isFinite(amount)) throw Error('Invalid damage');
    total += Math.max(0, amount);
    if (at <= windows.at(-1) && total >= bossHP && !Number.isFinite(kill)) kill = at / 1000;
    windows.forEach((end, i) => { if (at <= end) damage[i] += Math.max(0, amount); });
  }
  return { target, rolls, hit, result: () => ({ damage, kill }) };
}

function caster(seed, spell, interval) {
  const fight = encounter(seed);
  let magicka = stats.intelligence * 3;
  for (let at = interval; at <= 120000 && magicka >= prices.get(spell); at += interval) {
    magicka -= prices.get(spell);
    applySpell(spell, hero.level, fight.target, { hurt: n => fight.hit(at, n) }, fight.rolls, { entity: hero });
  }
  return fight.result();
}

function physical(seed, basicMs, rotation, weapon, skill) {
  const { target, rolls, hit, result } = encounter(seed);
  const ready = new Map();
  let capstoneReady = 0;
  let fatigue = maxFatigue(hero);
  let follow = null;
  for (let at = 0; at < 120000 && fatigue >= SWING_FATIGUE_COST; ) {
    const ability = follow ?? rotation.find(a => {
      const d = a.profile;
      return (a.rank < 100 || capstoneReady <= at) && (ready.get(a.id) ?? 0) <= at && fatigue > d.spend * FATIGUE_MULTIPLIER + (d.beats ?? 1) * SWING_FATIGUE_COST;
    });
    const d = ability?.profile;
    const usedWeapon = follow ? follow.weapon : weapon;
    follow = null;
    let landed = false;
    const beats = d?.rain?.perTarget ?? d?.ammo ?? d?.beats ?? 1;
    fatigue -= (d?.spend ?? 0) * FATIGUE_MULTIPLIER + (d?.beats ?? 1) * SWING_FATIGUE_COST;
    if (ability?.rank === 100 && !d.requiresLink) capstoneReady = at + CAPSTONE_RECOVERY_MS;
    if (d) ready.set(ability.id, at + d.cooldownMs);
    for (let i = 0; i < beats; i++) {
      const swing = playerAttackOptions(usedWeapon, d?.stages?.[i]?.strike ?? d?.strikes?.[i] ?? d?.strike ?? 'StrikeRight', 0, rolls);
      if (d?.capstone) swing.damageMod += capstonePower(d.capstone, hero, skill, usedWeapon);
      const rolled = calculateAttackDamage(hero, target, { ...swing, armorPierce: d?.stages?.[i]?.armorPierce ?? d?.armorPierce, dfRand: () => Math.floor(rolls() * 32768) });
      const amount = d ? previewDamage({ id: ability.id, mult: (1 + d.potency) * (d.stages?.[i]?.share ?? 1 / (d.ammo ?? beats)) },
        rolled, { entity: target }, { distance: 2 }) : rolled;
      landed ||= amount > 0;
      hit(at + (d ? d.windUpMs + i * d.activeMs / beats : basicMs), amount);
    }
    at += d ? d.windUpMs + d.activeMs + d.recoveryMs : basicMs;
    if (landed && ability?.follow && ability.follow.switchMs + d.activeMs + d.recoveryMs < d.linkMs && fatigue > ability.follow.profile.spend * FATIGUE_MULTIPLIER + ability.follow.profile.beats * SWING_FATIGUE_COST) {
      follow = ability.follow;
      at += follow.switchMs;
    } else if (d?.requiresLink) at += ability.switchMs;
  }
  return result();
}

function measure(name, run) {
  const rows = Array.from({ length: sampleCount }, (_, i) => run(13001 + i));
  const times = rows.map(r => r.kill).sort((a,b) => a-b);
  return { name, ttk: times[sampleCount / 2], kills: times.filter(Number.isFinite).length,
    median120: rows.map(r => r.damage[2] / 120).sort((a,b) => a-b)[sampleCount / 2],
    dps: windows.map((ms, j) => +(rows.reduce((sum,r) => sum+r.damage[j],0) / sampleCount / (ms/1000)).toFixed(1)) };
}
const best = rows => rows.sort((a,b) => a.ttk-b.ttk || b.kills-a.kills || b.dps[2]-a.dps[2])[0];
const settings = new Set(['Enabled','armorHitFormulaRedone','fixedStrengthDamageModifier','criticalStrikesIncreaseDamage','conditionBasedEffectiveness','softMaterialRequirements']);
uninstallPcaao();
for (const cadence of (process.argv.includes('--cadences') ? [800,1100,1400] : [1100])) {
  const candidates = spells.map(s => measure(s.name, seed => caster(seed,s,cadence)));
  const magic = best(candidates);
  const sustainedCaster = candidates.reduce((best,row) => row.median120 > best.median120 ? row : best);
  for (const core of ['Classic','PCAAO']) {
    if (core === 'PCAAO') installPcaao({read:key=>settings.has(key),other:()=>undefined});
    registerFormulaOverride('damageEquipment', () => false);
    for (const [style, abilities] of styles) {
      const { templates, skills } = abilities[0];
      const weapon = templates[0] === 'bare' ? null : createWeapon(templates[0], material, mulberry(42));
      const ladder = abilities.filter(a => a.rank <= rank).map(a => ({...a, profile: milestoneDelivery(a.id)}))
        .filter(a => a.profile.kind !== 'self').reverse();
      const combos = ABILITIES.filter(a => a.category === 'combination' && a.rank <= rank && a.templates.includes(templates[0]))
        .map(a => ({...a, profile: combinationDelivery(a.id, weapon)}))
        .filter(a => a.profile && !a.profile.requiresLink).reverse();
      const evaluate = (name, rotation) => measure(name, seed => physical(seed, cadence, rotation, weapon, skills[0]));
      const soloCandidates = [evaluate('ladder', ladder), evaluate('capstone', ladder.slice(0,1)), evaluate('basics', [])];
      const solo = best(soloCandidates);
      const sustainedPhysical = Math.max(...soloCandidates.map(row => row.median120));
      const mixed = best([solo, evaluate('mixed', [...ladder, ...combos].sort((a,b) => b.rank-a.rank).slice(0,10))]);
      const linked = [];
      for (const opener of combos.filter(a => a.profile.linkMs)) {
        const template = opener.templates.find(t => !abilities[0].templates.includes(t) &&
          [...styles.values()].some(rows => rows[0].templates.includes(t) && rows[0].skills[0] !== SKILLS.Archery));
        const followWeapon = template === 'bare' ? null : createWeapon(template, material, mulberry(42));
        const switchMs = (equipDelayFor(weapon) + equipDelayFor(followWeapon)) * 1000 / 980;
        const follow = { ...opener, weapon: followWeapon, switchMs, profile: combinationDelivery(opener.id, followWeapon) };
        if (!follow.profile?.requiresLink) throw Error('Missing follow-up for ' + opener.id);
        linked.push(evaluate(opener.id, [{ ...opener, follow }, ...ladder]));
      }
      console.log(JSON.stringify({ rank, level, bossHP, cadence, core, style, magic, sustainedCaster, sustainedPhysical, solo, mixed, linked }));
    }
    uninstallPcaao();
  }
}
