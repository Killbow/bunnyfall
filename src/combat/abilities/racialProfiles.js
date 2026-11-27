import { raceById, raceByKey } from '../../characters/races.js';
import { RACIAL_BUFF_ROUNDS, ROUND_SECONDS } from './buffDuration.js';

const racialSeconds = RACIAL_BUFF_ROUNDS * ROUND_SECONDS;

export function racialKey(entity) {
  return raceByKey(entity?.race)?.key ?? raceById(entity?.raceId)?.key ?? null;
}

export const RACIAL_TRAITS = Object.freeze({
  Breton: { passive: 'Gain 30 points on saving throws against the Magic element.', pace: 'walk', condition: 'readied', movement: 'Walk 15% faster with a weapon or spell readied.' },
  Redguard: { passive: 'Martial Discipline reduces melee damage by 10% at half fatigue or higher.', guard: 'melee', guardShare: .10, guardCondition: 'rested',
    pace: 'run', condition: 'rested', movement: 'Run 15% faster at half fatigue or higher.' },
  Nord: { passive: 'Gain 30 points on saving throws against Frost.', pace: 'walk', condition: 'wounded', movement: 'Walk 15% faster below half health.' },
  DarkElf: { passive: 'Ash Veil reduces physical damage by 15% below half health.', guard: 'physical', guardCondition: 'wounded',
    pace: 'run', condition: 'wounded', movement: 'Run 15% faster below half health.' },
  HighElf: { passive: 'Resist paralysis completely unless your class has low tolerance or critical weakness to it. Free Action covers that weakness.', pace: 'walk', condition: 'spell', movement: 'Walk 15% faster with a spell readied.' },
  WoodElf: { passive: 'Cover Sense reduces physical damage by 15% while concealed, including during Forest Ambush.', guard: 'physical', guardCondition: 'concealed',
    pace: 'run', condition: 'outdoors', movement: 'Run 15% faster outdoors.' },
  Khajiit: { passive: 'Close-Quarters Agility reduces melee damage by 15% below half health.', guard: 'melee', guardCondition: 'wounded',
    pace: 'climb', condition: 'rested', movement: 'Climb 15% faster at half fatigue or higher.' },
  Argonian: { passive: 'Waterwise reduces physical damage by 15% while swimming or under Water Breathing.', guard: 'physical', guardCondition: 'amphibious',
    pace: 'swim', movement: 'Swim 15% faster.' },
  Imperial: { passive: 'Resolve reduces melee damage by 15% below half health.', guard: 'melee', guardCondition: 'wounded',
    pace: 'walk', condition: 'sheathed', movement: 'Walk 15% faster with weapons sheathed.' },
  Lilmothit: { passive: 'Misdirection reduces physical damage by 15% while blending or using a decoy.', guard: 'physical', guardCondition: 'concealed',
    pace: 'run', condition: 'concealed', movement: 'Run 15% faster while blending or using a decoy.' },
  Lungaris: { passive: 'Light on Your Feet reduces melee damage by 15% while running on foot.', guard: 'melee', guardCondition: 'running',
    pace: 'run', condition: 'wounded', movement: 'Run 15% faster below half health.' },
  Orc: { passive: 'Thick Hide reduces physical damage by 15% below half health.', guard: 'physical', guardCondition: 'wounded',
    pace: 'run', condition: 'wounded', movement: 'Run 15% faster below half health.' },
});

const common = { spend: 7, cooldownMs: 25000, windUpMs: 250, activeMs: 440, recoveryMs: 600 };
const launch = (length, halfW) => ({ mech: 'dash', aim: 'lane', length, halfW });
const melee = (options) => ({ ...common, kind: 'melee', equipment: 'melee', strike: 'StrikeRight',
  beats: 1, potency: 1, rangeM: 2.3, arcRad: Math.PI * .26, ...options });

const pilots = new Map([
  ['racial.breton.wardbreaker', melee({
    rangeM: 2.75, halfWidthM: .5, counterBonus: .5, control: { poiseShare: 1 }, fx: 'measureFinish',
    description: 'Strike during an interruptible enemy wind-up to break its poise. Works with a melee weapon or empty hands.',
  })],
  ['racial.redguard.sword-song', { ...common, kind: 'self', accuracy: { bonus: 5, seconds: 9 }, fx: 'measure',
    description: `Enter a ${racialSeconds}-second stance that improves weapon accuracy by 5 points.` }],
  ['racial.nord.frostborn-charge', melee({
    advance: launch(6.5, .73), rangeM: 4.2, targetCap: 3, potency: 1.05, control: { poiseShare: .85, shove: 1.3 }, fx: 'frostRush',
    description: 'Rush forward and disrupt up to three enemies in the path you travel.',
  })],
  ['racial.dark-elf.ashstep', melee({
    advance: launch(5.8, .63), rangeM: 3.8, targetCap: 3, potency: .85, windUpMs: 155, tempo: 1.35, fx: 'ashRush',
    description: 'Step through a short lane and cut up to three enemies in your path, leaving an ash trail.',
  })],
  ['racial.high-elf.perfect-focus', { ...common, kind: 'self', accuracy: { bonus: 7, seconds: 6 },
    selfEffect: { type: 26, subType: 255, rounds: 1 }, fx: 'verdict',
    description: `Gain 7 points of weapon accuracy and a Free Action effect for ${racialSeconds} seconds.` }],
  ['racial.wood-elf.forest-ambush', { ...common, kind: 'ranged', equipment: 'ranged', strike: 'StrikeDown', ammo: 1,
    rangeM: 39, projectileSpeed: 38, potency: .9, weakPointBonus: .55, fx: 'verdict', impactFx: 'markTarget',
    selfEffect: { type: 23, subType: 0, rounds: 1 },
    description: 'Blend into your surroundings and fire one arrow. A landed shot flashes a mark at the target.',
  }],
  ['racial.khajiit.predators-pounce', melee({
    advance: { ...launch(6.8, .45), mech: 'leap', apex: 1.6 }, rangeM: 3.4, potency: 1.5, beats: 2, fx: 'flurry',
    stages: [
      { strike: 'StrikeRight', rangeM: 3.4, control: { poiseShare: .45, shove: .35 }, fx: 'flurry' },
      { strike: 'StrikeLeft', rangeM: 2, arcRad: Math.PI * .28, tempo: 1.45, control: { poiseShare: .55 }, fx: 'flurryFinish' },
    ],
    description: 'Pounce onto the enemy under your aim and rake it with a two-hit combo.',
  })],
  ['racial.argonian.marsh-coil', melee({
    advance: launch(2.8, .54), rangeM: 2.8, targetCap: 2, potency: .75, windUpMs: 170,
    control: { poiseShare: .7, shove: 1.2 }, selfEffect: { type: 30, subType: 255, rounds: 2 }, fx: 'frostRush',
    description: `Slip forward, shove up to two enemies, and gain a Water Breathing effect for ${racialSeconds} seconds.`,
  })],
  ['racial.imperial.commanders-call', { ...common, kind: 'self', accuracy: { bonus: 4, seconds: 7 }, fx: 'measure',
    selfEffect: { type: 9, subType: 6, rounds: 2, magnitude: 6, companionRange: 9 },
    description: `Gain 4 weapon accuracy and grant 6 Speed to yourself and nearby companions in sight for ${RACIAL_BUFF_ROUNDS} magic rounds.` }],
  ['racial.lilmothit.foxfire-feint', melee({
    advance: launch(3.1, .46), rangeM: 3.1, potency: .8, windUpMs: 155, fx: 'ashRush',
    selfEffect: { type: 53, subType: 255, rounds: 1, placed: true },
    description: 'Leave a decoy and dash into a quick melee strike.',
  })],
  ['racial.lungaris.harebound', melee({
    advance: { ...launch(6.6, .45), mech: 'leap', apex: 2.6 }, rangeM: 4.3, potency: 1.2, windUpMs: 175, fx: 'lunge',
    description: 'Spring in a long, high hare leap onto the enemy under your aim and strike where you land.',
  })],
  ['racial.orc.skullsplitter', melee({
    rangeM: 2.9, potency: 1.35, windUpMs: 320, control: { poiseShare: .9, shove: .9 }, fx: 'lunge',
    description: 'Bring a heavy overhead blow down on the enemy ahead of you, staggering it. Works with a melee weapon or empty hands.',
  })],
]);

export const racialDelivery = id => pilots.get(id) ?? null;
