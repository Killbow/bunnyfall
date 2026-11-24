import { ABILITIES, PHYSICAL_SKILLS } from '../src/combat/abilities/registry.js';
import { PLAYABLE_RACE_TEMPLATES } from '../src/characters/races.js';
import { SKILLS } from '../src/characters/skills.js';
import { EQUIP_SLOTS, equipTableOf } from '../src/characters/equip.js';
import { calculateAttackDamage, registerFormulaOverride } from '../src/combat/formulas.js';
import { createWeapon } from '../src/combat/enemyEquipment.js';
import { installPcaao, uninstallPcaao } from '../src/combat/pcaao.js';
import { mintCondition, registerCustomTemplates } from '../src/items/itemTemplates.js';
import { RRI_TEMPLATES } from '../src/mods/rriItems.js';
import { installHeavyGear } from '../src/systems/heavyGear.js';
import { installCrossbowLoot } from '../src/items/crossbow.js';
import { buildAt, mulberry } from './heroMeasure.mjs';

const styles = ABILITIES.filter(ability => ability.category === 'weapon' && ability.rank === 25)
  .map(ability => ({ name: ability.id.split('.')[1], template: ability.templates[0] }));
const tiers = [
  { level: 1, skill: 25 },
  { level: 12, skill: 50 },
  { level: 20, skill: 75 },
  { level: 30, skill: 100 },
  { level: 30, skill: 130 },
];
const opponents = {
  unarmored: { armor: 100, dodge: 15 },
  armored: { armor: 30, dodge: 35, plating: true },
  evasive: { armor: 80, dodge: 90 },
};
const armor = [['ChestArmor', 102], ['Gloves', 103], ['LegsArmor', 104], ['LeftArm', 105],
  ['RightArm', 106], ['Head', 107], ['Feet', 108]];

function player(race, { level, skill }) {
  const { STR, AGI, END, SPD, LUC, WIL, hp, crit } = buildAt(level);
  const skills = new Array(35).fill(0);
  for (const id of PHYSICAL_SKILLS) skills[id] = skill;
  skills[SKILLS.CriticalStrike] = crit;
  return { isPlayer: true, race: race.key, raceId: race.id, level, health: hp, maxHealth: hp,
    stats: { strength: STR, agility: AGI, endurance: END, speed: SPD, luck: LUC, willpower: WIL },
    skills, career: {}, items: [], reflexes: 2 };
}

function opponent(level, { armor: ac, dodge, plating }) {
  const target = { level, health: 10000, maxHealth: 10000,
    stats: { strength: 50, agility: 55, endurance: 60, speed: 50, luck: 50, willpower: 50 },
    skills: { [SKILLS.Dodging]: dodge }, armorValues: new Array(7).fill(ac), items: [] };
  if (plating) {
    const equip = equipTableOf(target);
    for (const [slot, templateIndex] of armor) {
      const item = mintCondition({ group: 'Armor', templateIndex, material: 0x0204 });
      equip[EQUIP_SLOTS[slot]] = item;
      target.items.push(item);
    }
  }
  return target;
}

function measure(attacker, target, weapon, samples) {
  let total = 0;
  let damaging = 0;
  for (let i = 0; i < samples; i++) {
    // Reset the RNG per attack so a miss cannot move the next sample's rolls.
    const rolls = mulberry(100003 + i);
    const damage = calculateAttackDamage(attacker, target, {
      weapon, rolls, dfRand: () => Math.floor(rolls() * 32768), weaponAnimTime: 1100,
    });
    if (!Number.isFinite(damage)) throw new Error('Non-finite damage for ' + (weapon?.name ?? 'unarmed'));
    total += Math.max(0, damage);
    if (damage > 0) damaging++;
  }
  return { damagePerAttack: total / samples, damageRate: damaging / samples };
}

const relativeSpread = values => {
  const min = Math.min(...values);
  return min > 0 ? Math.max(...values) / min - 1 : null;
};

function summarize(rows) {
  return rows.map(({ core, level, skill, opponent, styles: measured }) => {
    const widest = (mode) => measured.reduce((worst, row) => {
      const spread = relativeSpread(row.races.map(race => race[mode].damagePerAttack));
      return spread != null && (worst == null || spread > worst.spread) ? { style: row.style, spread } : worst;
    }, null);
    return { core, level, skill, opponent, legacy: widest('legacy'), normalized: widest('normalized'),
      zeroDamageStyles: measured.filter(row => row.races.some(race => race.normalized.damagePerAttack <= 0)).map(row => row.style) };
  });
}

const samplesArg = process.argv.find(arg => arg.startsWith('--samples='));
const samples = samplesArg ? Number(samplesArg.slice('--samples='.length)) : 256;
if (!Number.isSafeInteger(samples) || samples < 1) throw new Error('Choose a positive integer sample count');
registerCustomTemplates(RRI_TEMPLATES);
installCrossbowLoot();
installHeavyGear();
uninstallPcaao();
const settings = new Set(['Enabled', 'armorHitFormulaRedone', 'fixedStrengthDamageModifier',
  'criticalStrikesIncreaseDamage', 'conditionBasedEffectiveness', 'softMaterialRequirements']);
const rows = [];
for (const core of ['classic', 'PCAAO']) {
  if (core === 'PCAAO') installPcaao({ read: key => settings.has(key), other: () => undefined });
  registerFormulaOverride('damageEquipment', () => false);
  for (const tier of tiers) {
    for (const [name, defense] of Object.entries(opponents)) {
      const target = opponent(tier.level, defense);
      const measured = styles.map(({ name: style, template }) => {
        const weapon = template === 'bare' ? null : createWeapon(template, buildAt(tier.level).wmat);
        const races = PLAYABLE_RACE_TEMPLATES.map(race => {
          const attacker = player(race, tier);
          globalThis.location = { search: '' };
          const legacy = measure(attacker, target, weapon, samples);
          globalThis.location.search = '?abilities';
          const normalized = measure(attacker, target, weapon, samples);
          return { race: race.key, legacy, normalized };
        });
        return { style, races };
      });
      rows.push({ core, ...tier, opponent: name, styles: measured });
    }
  }
}
uninstallPcaao();
const summary = summarize(rows);
const limits = 'Provisional stationary basic attacks at full health with matched seeded rolls and fixed equipment condition. Racial actives, spell rotations, movement, target retaliation, and encounter TTK remain unmeasured.';
if (process.argv.includes('--markdown')) {
  const pct = entry => entry ? `${(entry.spread * 100).toFixed(1)}% (${entry.style})` : 'Unavailable';
  console.log('# Racial weapon parity');
  console.log('\n' + limits);
  console.log(`\n${samples} attacks per race, weapon style, opponent, progression point and combat core. The largest gap is the highest mean damage divided by the lowest for the same style, minus one.\n`);
  console.log('| Combat core | Level | Skill | Opponent | Largest legacy racial gap | Largest normalized racial gap | Styles with a zero-damage sample mean |');
  console.log('| --- | ---: | ---: | --- | --- | --- | --- |');
  for (const row of summary) {
    console.log(`| ${row.core} | ${row.level} | ${row.skill} | ${row.opponent} | ${pct(row.legacy)} | ${pct(row.normalized)} | ${row.zeroDamageStyles.join(', ') || 'None'} |`);
  }
} else {
  console.log(JSON.stringify({ samples, styles: styles.length, races: PLAYABLE_RACE_TEMPLATES.length, limits, summary, rows }, null, 2));
}
