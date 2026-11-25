import { SKILLS } from '../../characters/skills.js';

const dash = (length, halfW = .55) => ({ mech: 'dash', aim: 'lane', length, halfW });
const leap = (length, apex = 1.35) => ({ ...dash(length), mech: 'leap', apex });
const flank = { mech: 'dash', aim: 'foe', range: [.5, 4.4], behind: 1.05 };
const guard = magnitude => ({ type: 35, subType: 255, rounds: 1, magnitude });
const veil = { type: 23, subType: 0, rounds: 1 };
const rally = { type: 9, subType: 6, magnitude: 8, rounds: 2, companionRange: 8 };
const wound = share => ({ channel: 'rake', share, seconds: 8 });
const capstone = (base, stat = 'strength') => ({ capstone: { base, stat } });
const hit = (strike, rangeM, share, fx, other) => ({ strike, rangeM, share, fx, ...other });
const cut = (range, share, other) => hit('StrikeRight', range, share, 'cleave', other);
const thrust = (range, share, other) => hit('StrikeUp', range, share, 'measureFinish', { halfWidthM: .43, ...other });
const smash = (range, share, other) => hit('StrikeDown', range, share, 'crush', other);
const sweep = (range, share, count, shove, other) => cut(range, share, {
  targetCap: count, arcRad: Math.PI * .62, control: { shove, poiseShare: .5 }, ...other,
});

function melee(rank, description, stages, options) {
  const common = rank === 100
    ? { spend: 15, cooldownMs: 39000, windUpMs: 490, activeMs: 1000, recoveryMs: 950, potency: 2.6 }
    : { spend: 7, cooldownMs: 11000, windUpMs: 230, activeMs: 520, recoveryMs: 470, potency: 1.25 };
  return { ...common, kind: 'melee', description, stages, beats: stages.length, ...options };
}

export const meleeCombinations = new Map([
  ['combination.axe.long-blade.warlords-breach', melee(75, 'Thrust, then aim a short advance that cleaves through up to three foes.', [
    thrust(3.1, .4), sweep(3.2, .6, 3, .75, { advance: dash(3.2) }),
  ], { redirect: true, fx: 'lunge' })],
  ['combination.axe.long-blade.rallying-ruin', melee(100, 'Charge and sweep the lane, rallying nearby companions before a wide finishing slash.', [
    sweep(4.7, .42, 3, 1, { advance: dash(4.7, .7) }), sweep(3.5, .58, 5, 1.5, { fx: 'rally' }),
  ], { ...capstone(42), selfEffect: rally, redirect: true, fx: 'rally' })],
  ['combination.blunt.long-blade.iron-verdict', melee(75, 'Punish an exposed foe and follow with a heavier strike that penetrates armor.', [
    cut(2.65, .38, { counterBonus: .8, control: { poiseShare: .65 } }),
    smash(2.8, .62, { armorPierce: .42 }),
  ], { fx: 'measure' })],
  ['combination.blunt.long-blade.judgement-bastion', melee(100, 'Raise a shield as you leap into two heavy blows. The final hit scatters nearby foes.', [
    smash(4.2, .43, { advance: leap(5.6, 2.2), targetCap: 2, control: { poiseShare: .65 } }),
    sweep(3.25, .57, 4, 1.65, { fx: 'quake' }),
  ], { ...capstone(44, 'endurance'), selfEffect: guard(24), redirect: true, fx: 'rally' })],
  ['combination.hand-to-hand.long-blade.reversal-step', melee(75, 'Interrupt an exposed foe at close range, then lunge into a second strike.', [
    cut(1.9, .43, { control: { poiseShare: .85 }, counterBonus: .55, fx: 'haymaker' }),
    thrust(3, .57, { advance: dash(3, .45) }),
  ], { fx: 'lunge' })],
  ['combination.hand-to-hand.long-blade.cyclone-form', melee(100, 'Advance, turn through the next two strikes, and finish with a broad sweep.', [
    cut(3.25, .24, { advance: dash(3.25), targetCap: 2 }), hit('StrikeLeft', 2.1, .23, 'flurry', { tempo: 1.5 }),
    cut(2.35, .2, { tempo: 1.6 }), sweep(2.9, .33, 4, 1.15),
  ], { ...capstone(39, 'speed'), redirect: true, fx: 'flurry' })],
  ['combination.axe.short-blade.open-vein', melee(75, 'Cut a deep wound that bleeds and can be exploited by Gutting Pursuit.', [
    cut(2.15, 1, { opening: wound(.72), rearBonus: .55 }),
  ], { fx: 'execute' })],
  ['combination.axe.short-blade.gutting-pursuit', melee(100, 'Rush into a wounded foe, burst the open wound, and follow with a finishing chop.', [
    cut(2.2, .42, { advance: { ...flank, aim: 'target' }, exploit: 'rake' }),
    smash(2.35, .58, { lowHealthBonus: .92 }),
  ], { ...capstone(42, 'agility'), fx: 'shadowstep' })],
  ['combination.blunt.short-blade.blackjack', melee(75, 'Open with a poise-breaking hit, then strike again. Unaware foes take more damage.', [
    smash(1.85, .46, { unawareBonus: .75, control: { poiseShare: 1 } }),
    thrust(2.15, .54, { unawareBonus: .48, tempo: 1.4 }),
  ], { fx: 'shadowstep' })],
  ['combination.blunt.short-blade.silent-verdict', melee(100, 'Disrupt an exposed foe, then strike through armor for a heavy rear or finishing blow.', [
    smash(2.1, .34, { counterBonus: .68, control: { poiseShare: 1 } }),
    thrust(2.4, .66, { armorPierce: .38, rearBonus: 1.25, lowHealthBonus: .7 }),
  ], { ...capstone(45, 'agility'), fx: 'execute' })],
  ['combination.hand-to-hand.short-blade.phantom-grip', melee(75, 'Dash to a clear spot around a foe and land a close strike with a bonus from behind.', [
    cut(1.9, 1, { advance: flank, rearBonus: .65, control: { poiseShare: .6 }, fx: 'shadowstep' }),
  ], { fx: 'shadowstep' })],
  ['combination.hand-to-hand.short-blade.dance-of-shadows', melee(100, 'Briefly blend into your surroundings, flank the foe, and punish it with three fast strikes.', [
    cut(1.9, .29, { advance: flank, rearBonus: .8, tempo: 1.5 }), hit('StrikeLeft', 1.9, .29, 'flurry', { tempo: 1.6 }),
    thrust(2.15, .42, { rearBonus: 1, counterBonus: .7, tempo: 1.5 }),
  ], { ...capstone(40, 'speed'), selfEffect: veil, fx: 'shadowstep' })],
  ['combination.axe.blunt.siege-stance', melee(75, 'Plant your feet, raise a brief shield, and deliver an armor-piercing guard break.', [
    smash(2.8, 1, { armorPierce: .35, counterBonus: .65, control: { poiseShare: .95 } }),
  ], { stance: { driftM: .2 }, selfEffect: guard(20), fx: 'rally', windUpMs: 430 })],
  ['combination.axe.blunt.earthsplitter', melee(100, 'Commit to a heavy opening blow, then rupture the ground in a wide knockback sweep.', [
    smash(2.85, .38, { control: { poiseShare: 1 }, armorPierce: .25 }),
    sweep(4.45, .62, 6, 1.8, { arcRad: Math.PI, fx: 'quake' }),
  ], { ...capstone(52), stance: { driftM: .2 }, windUpMs: 820, redirect: true, fx: 'quake' })],
  ['combination.axe.hand-to-hand.savage-entry', melee(75, 'Rush to a foe, interrupt its wind-up at close range, and cleave through nearby enemies.', [
    cut(1.85, .42, { advance: { ...flank, aim: 'target' }, control: { poiseShare: .8 } }),
    sweep(2.5, .58, 3, .85),
  ], { fx: 'lunge' })],
  ['combination.axe.hand-to-hand.bloodstorm', melee(100, 'Rush down the lane, land two quick strikes, then finish with a wide knockback blow.', [
    cut(4, .2, { advance: dash(4), targetCap: 2 }), hit('StrikeLeft', 2, .2, 'flurry', { tempo: 1.55 }),
    smash(2.2, .22, { lowHealthBonus: .65 }), sweep(3.2, .38, 4, 1.6, { fx: 'flurryFinish' }),
  ], { ...capstone(44), redirect: true, fx: 'flurry' })],
]);

// Ranged openers share target ownership and the normal arrow-spend path.
// Each entry defines its own ranged shape and the weapon family used to cash in the mark.
export const rangedCombinations = new Map([
  ['combination.archery.short-blade.hidden-relay', { family: SKILLS.ShortBlade, switchTo: 'a short blade',
    description: 'Blend briefly and mark a foe with an arrow. Equip a short blade and use the ability again to flank it and strike.',
    arrow: { selfEffect: veil, unawareBonus: .65 }, melee: { fx: 'shadowstep', advance: flank, rearBonus: .55 } }],
  ['combination.archery.short-blade.vanishing-execution', { family: SKILLS.ShortBlade, switchTo: 'a short blade',
    description: 'Mark a foe with a heavy shot. Equip a short blade and use the ability again to flank it under concealment and strike twice.',
    arrow: { selfEffect: veil, unawareBonus: .75 }, melee: { fx: 'shadowstep', advance: flank, selfEffect: veil, rearBonus: .9, beats: 2 } }],
  ['combination.archery.axe.hunters-exchange', { family: SKILLS.Axe, switchTo: 'an axe',
    description: 'Mark your quarry with a tracking shot. Equip an axe and use the ability again to rush into a heavy strike.',
    arrow: { weakPointBonus: .32 }, melee: { fx: 'lunge', advance: { ...flank, aim: 'target' }, lowHealthBonus: .55 } }],
  ['combination.archery.axe.felling-volley', { family: SKILLS.Axe, switchTo: 'an axe',
    description: 'Loose a spread of arrows and mark the first damaging hit. Equip an axe and use the ability again for a charging chop.',
    arrow: { ammo: 3, spreadRad: .018, fx: 'volley' }, melee: { fx: 'execute', advance: { ...flank, aim: 'target' }, lowHealthBonus: .85 } }],
  ['combination.archery.blunt.consecrated-break', { family: SKILLS.BluntWeapon, switchTo: 'a blunt weapon',
    description: 'Hit a marked weak point with an armor-piercing shot. Equip a blunt weapon and use the ability again to break its poise.',
    arrow: { weakPointBonus: .6, armorPierce: .3 }, melee: { fx: 'crush', armorPierce: .38 } }],
  ['combination.archery.blunt.hallowed-barrage', { family: SKILLS.BluntWeapon, switchTo: 'a blunt weapon',
    description: 'Fire a spread that disrupts wind-ups. Equip a blunt weapon and use the ability again to strike the marked foe and sweep around you.',
    arrow: { ammo: 3, spreadRad: .023, control: { poiseShare: .7 }, fx: 'volley' },
    melee: { fx: 'quake', armorPierce: .35, beats: 2, sweep: true } }],
  ['combination.archery.hand-to-hand.windstep-shot', { family: SKILLS.HandToHand, switchTo: 'empty hands',
    description: 'Gain Speed while loosing a marking shot. Ready your empty hands and use the ability again for a quick closing punch.',
    arrow: { selfEffect: { type: 9, subType: 6, rounds: 1, magnitude: 10 } },
    melee: { fx: 'haymaker', advance: { ...flank, aim: 'target' } } }],
  ['combination.archery.hand-to-hand.stormrunner', { family: SKILLS.HandToHand, switchTo: 'empty hands',
    description: 'Loose two arrows while gaining Speed. Ready your empty hands and use the ability again to vault toward the mark and sweep nearby foes.',
    arrow: { ammo: 2, spreadRad: .026, fx: 'volley', selfEffect: { type: 9, subType: 6, rounds: 1, magnitude: 14 } },
    melee: { fx: 'flurry', advance: { ...flank, aim: 'target', mech: 'leap', apex: 1.35 }, beats: 2, sweep: true } }],
]);
