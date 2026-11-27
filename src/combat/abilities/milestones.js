import { ARROW_FLIGHT_SPEED } from '../../magic/spellcast.js';
import { expandedWeaponLadders } from './weaponLadders.js';
import { buffRoundsForRank as rounds, ROUND_SECONDS } from './buffDuration.js';

export const PREVIEW_THRUST = 'weapon.longsword.extended-thrust';
export const PREVIEW_JAB = 'weapon.hand-to-hand.jab-chain';
export const PREVIEW_POWER_DRAW = 'weapon.long-bow.power-draw';
export const PREVIEW_DEADEYE = 'weapon.crossbow.deadeye-bolt';
export const PREVIEW_SIEGE_BOLT = 'weapon.ballista.siege-bolt';
export const PREVIEW_KEEP_AWAY = 'weapon.longsword.keep-away';
export const PREVIEW_BARRAGE = 'weapon.long-bow.broadhead-barrage';
export const PREVIEW_ANCHORED_SIGHT = 'weapon.crossbow.anchored-sight';
export const PREVIEW_ANCHOR_FIRE = 'weapon.ballista.anchor-and-fire';
export const PREVIEW_SHOULDER_BREAK = 'weapon.hand-to-hand.shoulder-break';
export const PREVIEW_PIERCING_LINE = 'weapon.longsword.piercing-line';
export const PREVIEW_EAGLES_RHYTHM = 'weapon.long-bow.eagles-rhythm';
export const PREVIEW_ARMOR_NEEDLE = 'weapon.crossbow.armor-needle';
export const PREVIEW_LINEBREAKER = 'weapon.ballista.linebreaker';
export const PREVIEW_FLOW_STATE = 'weapon.hand-to-hand.flow-state';
export const PREVIEW_KINGS_MEASURE = 'weapon.longsword.kings-measure';
export const PREVIEW_SKYFALL = 'weapon.long-bow.skyfall';
export const PREVIEW_FINAL_VERDICT = 'weapon.crossbow.final-verdict';
export const PREVIEW_SIEGE_OF_HEAVEN = 'weapon.ballista.siege-of-heaven';
export const PREVIEW_HUNDRED_FIST = 'weapon.hand-to-hand.hundred-fist-ascension';
export const DAGGER_MILESTONES = Object.freeze([
  'weapon.dagger.veil-cut', 'weapon.dagger.kidney-step', 'weapon.dagger.marked-for-silence', 'weapon.dagger.nightfall',
]);
export const TANTO_MILESTONES = Object.freeze([
  'weapon.tanto.battle-prayer', 'weapon.tanto.edge-ritual', 'weapon.tanto.shared-resolve', 'weapon.tanto.hundredfold-blessing',
]);

const loadout = new Map([
  ...expandedWeaponLadders,
  [TANTO_MILESTONES[0], { kind: 'melee', strike: 'StrikeRight', rangeM: 1.9, potency: 1.1, beats: 1,
    selfEffect: { type: 9, subType: 6, rounds: 2, magnitude: 8 }, fx: 'measure',
    spend: 4, cooldownMs: 7500, windUpMs: 180, activeMs: 200, recoveryMs: 350,
    description: `Cut while invoking a blessing that grants 8 Speed for ${rounds(25)} magic rounds.` }],
  [TANTO_MILESTONES[1], { kind: 'self', edgeRitual: true, fx: 'measure',
    spend: 6, cooldownMs: 15000, windUpMs: 230, activeMs: 250, recoveryMs: 350,
    description: `Empower your next three damaging Tanto strikes for ${rounds(50) * ROUND_SECONDS} seconds. Stand for 25% extra damage or crouch as the ritual completes to recover fatigue on hit.` }],
  [TANTO_MILESTONES[2], { kind: 'self', fx: 'rally',
    selfEffect: { type: 9, subType: 4, rounds: 2, magnitude: 8, companionRange: 8 },
    spend: 8, cooldownMs: 18000, windUpMs: 370, activeMs: 370, recoveryMs: 560,
    description: `Grant 8 Endurance for ${rounds(75)} magic rounds to yourself and companions in sight within eight meters.` }],
  [TANTO_MILESTONES[3], { kind: 'melee', rangeM: 2, arcRad: Math.PI * .3, potency: 3.05, beats: 3, tempo: 1.4,
    strikes: ['StrikeRight', 'StrikeLeft', 'StrikeDown'], capstone: { base: 48, stat: 'willpower' },
    selfEffect: [
      { type: 9, subType: 6, rounds: 2, magnitude: 12 },
      { type: 9, subType: 0, rounds: 2, magnitude: 10 },
      { type: 35, subType: 255, rounds: 2, magnitude: 20 },
    ], fx: 'rally', finishFx: 'measureFinish', finishControl: { poiseShare: .7 },
    spend: 14, cooldownMs: 30000, windUpMs: 510, activeMs: 1000, recoveryMs: 750,
    description: `Strike three times and gain 12 Speed, 10 Strength, and a 20-point Shield for ${rounds(100)} magic rounds.` }],
  [DAGGER_MILESTONES[0], { kind: 'melee', strike: 'StrikeRight', rangeM: 1.9, potency: 0.65, beats: 1,
    unawareBonus: 0.8, fx: 'shadowstep', selfEffect: { type: 23, subType: 0, rounds: 1 },
    spend: 4, cooldownMs: 6500, windUpMs: 140, activeMs: 180, recoveryMs: 330,
    description: 'Briefly blend as you strike. Deal extra damage if the enemy has yet to detect you.' }],
  [DAGGER_MILESTONES[1], { kind: 'melee', strike: 'StrikeRight', rangeM: 1.85, potency: 0.9, beats: 1,
    advance: { mech: 'dash', aim: 'foe', range: [0.5, 4.5], behind: 1.1 }, rearBonus: 0.55, fx: 'shadowstep',
    spend: 6, cooldownMs: 9000, windUpMs: 175, activeMs: 350, recoveryMs: 410,
    description: 'Aim at a nearby enemy and dash to a clear position around it. A strike from behind deals extra damage.' }],
  [DAGGER_MILESTONES[2], { kind: 'melee', strike: 'StrikeDown', rangeM: 2, potency: 1.1, beats: 1,
    targetMark: { seconds: 6, bonus: 0.95 }, fx: 'measureFinish',
    spend: 7, cooldownMs: 12000, windUpMs: 200, activeMs: 220, recoveryMs: 400,
    description: 'Mark an enemy on a damaging hit. Your next damaging dagger technique against it within six seconds gains a burst bonus.' }],
  [DAGGER_MILESTONES[3], { kind: 'melee', rangeM: 1.9, arcRad: Math.PI * 0.28, potency: 3.25, beats: 5, tempo: 1.7,
    rearBonus: 1.15, lowHealthBonus: 0.75, capstone: { base: 38, stat: 'agility' },
    strikes: ['StrikeRight', 'StrikeLeft', 'StrikeRight', 'StrikeLeft', 'StrikeDown'],
    fx: 'flurry', finishFx: 'flurryFinish', finishControl: { poiseShare: 0.8 },
    spend: 14, cooldownMs: 35000, windUpMs: 330, activeMs: 1050, recoveryMs: 830,
    description: 'Commit to five rapid strikes on one enemy. Each strike gains damage from behind and against enemies below 40% health.' }],
  [PREVIEW_THRUST, { kind: 'melee', strike: 'StrikeUp', rangeM: 3.8, halfWidthM: 0.45, potency: 1, beats: 1,
    spend: 4, cooldownMs: 6000, windUpMs: 220, activeMs: 180, recoveryMs: 350,
    description: 'Thrust your longsword at an enemy up to 3.8 meters away.' }],
  [PREVIEW_JAB, { kind: 'melee', strike: 'StrikeRight', rangeM: 2, arcRad: Math.PI * 0.24, potency: 0.98, beats: 3,
    strikes: ['StrikeRight', 'StrikeLeft', 'StrikeDown'],
    control: { poiseShare: 0.05 },
    spend: 4, cooldownMs: 6000, windUpMs: 180, activeMs: 160, recoveryMs: 330, description: "Aim three quick punches at one enemy. Each landed punch chips away at its poise." }],
  [PREVIEW_POWER_DRAW, { kind: 'ranged', strike: 'StrikeDown', rangeM: 34, projectileSpeed: 34, potency: 1.1, pierce: 2,
    spend: 4, ammo: 1, cooldownMs: 7000, windUpMs: 340, activeMs: 320, recoveryMs: 440, description: "Loose one piercing arrow through enemies lined up behind the first." }],
  [PREVIEW_DEADEYE, { kind: 'ranged', strike: 'StrikeDown', rangeM: 38, projectileSpeed: 48, potency: 1.15,
    weakPointBonus: 0.25,
    spend: 4, ammo: 1, cooldownMs: 8000, windUpMs: 500, activeMs: 190, recoveryMs: 720, description: "Fire a precise bolt. Aim at the upper part of the target for bonus damage." }],
  [PREVIEW_SIEGE_BOLT, { kind: 'ranged', strike: 'StrikeDown', rangeM: 38, potency: 1.25, burstCap: 3,
    spend: 5, ammo: 1, cooldownMs: 8000, windUpMs: 650, activeMs: 240, recoveryMs: 1100, description: "Fire a heavy bolt that can also damage nearby enemies at impact." }],
  [PREVIEW_KEEP_AWAY, { kind: 'melee', strike: 'StrikeUp', rangeM: 3.3, halfWidthM: 0.55, potency: 0.65, beats: 1,
    counterBonus: 0.65, control: { poiseShare: 0.55, shove: 1.65 },
    spend: 5, cooldownMs: 7500, windUpMs: 150, activeMs: 180, recoveryMs: 400,
    description: 'Poke and push back an enemy. Deals extra damage during its wind-up or overreach.' }],
  [PREVIEW_BARRAGE, { kind: 'ranged', strike: 'StrikeDown', rangeM: 30, projectileSpeed: 34, potency: 1.5,
    spend: 7, ammo: 3, spreadRad: 0.012, cooldownMs: 10000, windUpMs: 480, activeMs: 320, recoveryMs: 660,
    description: 'Fire three arrows in a tight spread. Consumes three arrows.' }],
  [PREVIEW_ANCHORED_SIGHT, { kind: 'ranged', strike: 'StrikeDown', rangeM: 43, projectileSpeed: 50, potency: 0.85,
    weakPointBonus: 1.25, stance: { driftM: 0.22, aimRad: 0.12 },
    spend: 6, ammo: 1, cooldownMs: 10500, windUpMs: 840, activeMs: 190, recoveryMs: 760,
    description: 'Keep your feet and aim steady until the bolt releases. Weak-point hits deal extra damage.' }],
  [PREVIEW_ANCHOR_FIRE, { kind: 'ranged', strike: 'StrikeDown', rangeM: 46, potency: 1.9, burstCap: 3,
    stance: { driftM: 0.15 },
    spend: 8, ammo: 1, cooldownMs: 11500, windUpMs: 1100, activeMs: 240, recoveryMs: 1350,
    description: 'Stay planted to brace the carried ballista, then fire an arcing bolt with splash.' }],
  [PREVIEW_SHOULDER_BREAK, { kind: 'melee', strike: 'StrikeRight', rangeM: 1.55, arcRad: Math.PI * 0.22, potency: 0.7, beats: 1,
    control: { poiseShare: 1 },
    spend: 6, cooldownMs: 8500, windUpMs: 140, activeMs: 180, recoveryMs: 490,
    description: 'Strike at close range to break an interruptible wind-up.' }],
  [PREVIEW_PIERCING_LINE, { kind: 'melee', strike: 'StrikeUp', rangeM: 4.8, halfWidthM: 0.8, potency: 1.35, beats: 1,
    advance: { mech: 'dash', aim: 'lane', length: 4.8, halfW: 0.8 }, targetCap: 3,
    spend: 8, cooldownMs: 11000, windUpMs: 250, activeMs: 350, recoveryMs: 650,
    description: 'Advance along the aimed lane and strike up to three enemies along the path you travel.' }],
  [PREVIEW_EAGLES_RHYTHM, { kind: 'ranged', strike: 'StrikeDown', rangeM: 37, projectileSpeed: 36, potency: 0.35,
    rhythm: { shots: 3, windowMs: 12000, bonus: 0.45 },
    spend: 4, ammo: 1, cooldownMs: 14000, windUpMs: 230, activeMs: 220, recoveryMs: 320,
    description: 'Press again after each shot to loose up to three arrows over 12 seconds. Consecutive hits strengthen the next shot. A miss resets the bonus.' }],
  [PREVIEW_ARMOR_NEEDLE, { kind: 'ranged', strike: 'StrikeDown', rangeM: 41, projectileSpeed: 52, potency: 1.1,
    armorPierce: 0.65, spend: 8, ammo: 1, cooldownMs: 12000, windUpMs: 600, activeMs: 200, recoveryMs: 820,
    description: 'Fire a single bolt that ignores a share of armor protection.' }],
  [PREVIEW_LINEBREAKER, { kind: 'ranged', strike: 'StrikeDown', rangeM: 50, projectileSpeed: 36, potency: 1.55,
    linearRadius: 0.68, pierce: 4, control: { shove: 2 }, stance: { driftM: 0.2 },
    spend: 10, ammo: 1, cooldownMs: 14000, windUpMs: 950, activeMs: 230, recoveryMs: 1400,
    description: 'Brace and drive a heavy bolt straight through up to four enemies, knocking them back along its path.' }],
  [PREVIEW_FLOW_STATE, { kind: 'melee', strike: 'StrikeRight', rangeM: 2.05, arcRad: Math.PI * 0.22, potency: 1.65, beats: 4,
    strikes: ['StrikeRight', 'StrikeLeft', 'StrikeDown', 'StrikeRight'], redirect: true, control: { poiseShare: 0.12 },
    spend: 8, cooldownMs: 11500, windUpMs: 150, activeMs: 350, recoveryMs: 550,
    description: 'Deliver four strikes. Turn between punches to redirect the combo toward a different enemy.' }],
  [PREVIEW_KINGS_MEASURE, { kind: 'melee', beats: 2, potency: 3.2, fx: 'measure', capstone: { base: 34, stat: 'strength' },
    stages: [
      { strike: 'StrikeRight', rangeM: 4.25, arcRad: Math.PI * 0.44, targetCap: 4, share: 0.4,
        control: { poiseShare: 0.65, shove: 0.8 }, fx: 'measure' },
      { strike: 'StrikeUp', rangeM: 7.1, halfWidthM: 0.5, targetCap: 3, share: 0.6,
        control: { poiseShare: 0.85, shove: 1.45 }, fx: 'measureFinish' },
    ],
    spend: 14, cooldownMs: 36000, windUpMs: 510, activeMs: 1100, recoveryMs: 800,
    description: 'Sweep your reach to push back up to four enemies, then aim a longer piercing thrust through up to three.' }],
  [PREVIEW_SKYFALL, { kind: 'ranged', strike: 'StrikeDown', rangeM: 38, projectileSpeed: 36, potency: 4.1,
    capstone: { base: 42, stat: 'agility' }, rain: { radius: 3.3, height: 12, perTarget: 3 }, linearRadius: 0.3, projectileScale: 1,
    spend: 16, ammo: 7, cooldownMs: 38000, windUpMs: 850, activeMs: 750, recoveryMs: 1050, fx: 'skyfall',
    description: 'Aim at visible ground to rain up to seven arrows into the area. Requires seven arrows in the quiver.' }],
  [PREVIEW_FINAL_VERDICT, { kind: 'ranged', strike: 'StrikeDown', rangeM: 72, projectileSpeed: 62, potency: 2.8,
    capstone: { base: 50, stat: 'agility' }, linearRadius: 0.18, projectileScale: 1.3, armorPierce: 0.5,
    weakPointBonus: 1.25, execution: { rangeM: 24, missingHealth: 0.55, bonus: 1.55 },
    stance: { driftM: 0.22, aimRad: 0.13 }, spend: 15, ammo: 1, cooldownMs: 37000,
    windUpMs: 1180, activeMs: 300, recoveryMs: 1450, fx: 'verdict',
    description: 'Hold your position and aim for an extreme-range shot. A weak-point hit on an enemy below 45% health gains a finishing bonus from 24 m.' }],
  [PREVIEW_SIEGE_OF_HEAVEN, { kind: 'ranged', strike: 'StrikeDown', rangeM: 86, potency: 3.6,
    capstone: { base: 55, stat: 'strength' }, projectileScale: 1.8,
    burstCap: 6, burstRadius: 5.5, burstScale: 1.7, control: { poiseShare: 0.7, shove: 1.8 },
    stance: { driftM: 0.16 }, spend: 20, ammo: 1, cooldownMs: 45000,
    windUpMs: 1750, activeMs: 420, recoveryMs: 1850, fx: 'siege',
    description: 'Brace the carried ballista through a long charge. The arcing bolt deals splash damage to up to six enemies within reach of the impact.' }],
  [PREVIEW_HUNDRED_FIST, { kind: 'melee', rangeM: 2.05, arcRad: Math.PI * 0.26, potency: 3.6, beats: 7, tempo: 1.85,
    capstone: { base: 38, stat: 'speed' },
    strikes: ['StrikeRight', 'StrikeLeft', 'StrikeRight', 'StrikeDown', 'StrikeLeft', 'StrikeRight', 'StrikeDown'],
    control: { poiseShare: 0.26, shove: 0.45 }, finishControl: { poiseShare: 1, shove: 1.65 },
    fx: 'flurry', finishFx: 'flurryFinish', spend: 15, cooldownMs: 38000, windUpMs: 420, activeMs: 1350, recoveryMs: 1100,
    description: 'Commit to seven rapid strikes on one enemy, wearing down its poise before a heavy finishing blow. Once a punch connects, the remaining punches can only hit that enemy.' }],
]);
for (const [id, profile] of loadout) {
  if (profile.capstone) continue;
  loadout.set(id, { ...profile, spend: Math.max(1, Math.round(profile.spend / 3)),
    potency: profile.kind === 'melee' ? profile.potency + .35 : profile.potency });
}
export const milestoneDelivery = (id) => loadout.get(id) ?? null;
export const abilityPlayable = (id) => loadout.has(id);
export const milestoneShotSpeedScale = (delivery) => delivery.projectileSpeed ? delivery.projectileSpeed / ARROW_FLIGHT_SPEED : null;
