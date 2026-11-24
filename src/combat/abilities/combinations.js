import { SKILLS } from '../../characters/skills.js';
import { weaponSkillUsed } from '../../characters/weapons.js';
import { CROSSBOW_TEMPLATE } from '../../characters/crossbowIds.js';
import { BALLISTA_TEMPLATE } from '../../characters/heavyGearIds.js';
import { abilityById } from './registry.js';
import { meleeCombinations, rangedCombinations } from './combinationLadders.js';

export const BLADE_WEAVE = 'combination.long-blade.short-blade.blade-weave';
export const THOUSAND_CUTS = 'combination.long-blade.short-blade.thousand-cuts';
export const HUNTING_LINE = 'combination.archery.long-blade.hunting-line';
export const PREDATORS_CROSSING = 'combination.archery.long-blade.predators-crossing';
export const KNOCKOUT_CHAIN = 'combination.blunt.hand-to-hand.knockout-chain';
export const TITANS_HANDS = 'combination.blunt.hand-to-hand.titans-hands';

const previews = new Map([
  [BLADE_WEAVE, 'Open with a straight poke, then cut quickly at the same target. Works with either blade family.'],
  [THOUSAND_CUTS, 'Advance through a line of enemies, then redirect two rapid cuts after landing. Works with either blade family.'],
  [HUNTING_LINE, 'Mark a foe with a ranged hit, equip a long blade, then press again for a thrust. The mark lasts 15 seconds.'],
  [PREDATORS_CROSSING, 'Mark a foe with a heavy ranged shot, equip a long blade, then press again to pursue it with a forward strike. The mark lasts 15 seconds.'],
  [KNOCKOUT_CHAIN, 'Wear down a foe’s poise, then follow with a heavier hit. Works with blunt weapons or empty hands.'],
  [TITANS_HANDS, 'Break an interruptible wind-up with the first hit, then sweep nearby foes with the finisher. Works with blunt weapons or empty hands.'],
]);

export const combinationDescription = id => previews.get(id) ?? meleeCombinations.get(id)?.description
  ?? rangedCombinations.get(id)?.description ?? null;
export const combinationPlayable = id => combinationDescription(id) != null;

function melee(stages, options) {
  return { kind: 'melee', stages, beats: stages.length, ...options };
}

function advance(length, halfW) {
  return { mech: 'dash', aim: 'lane', length, halfW };
}

function huntingDelivery(finisher, skill, template, variant = null) {
  const common = finisher
    ? { spend: 15, cooldownMs: 39000, windUpMs: 750, activeMs: 450, recoveryMs: 1200, capstone: { base: 33, stat: 'agility' } }
    : { spend: 6, cooldownMs: 12000, windUpMs: 250, activeMs: 240, recoveryMs: 420 };
  if (skill === SKILLS.Archery) {
    const crossbow = template === CROSSBOW_TEMPLATE, ballista = template === BALLISTA_TEMPLATE;
    const settings = variant?.arrow;
    const profile = { ...common, kind: 'ranged', strike: 'StrikeDown', ammo: 1, rangeM: ballista ? 52 : crossbow ? 47 : 36,
      projectileSpeed: ballista ? null : crossbow ? 48 : 34, potency: finisher ? 1.3 : .65,
      weakPointBonus: crossbow ? .3 : 0, linkMs: 15000, fx: finisher ? 'verdict' : 'pierce',
      windUpMs: common.windUpMs + (ballista ? 400 : crossbow ? 120 : 0),
      ...(ballista ? { stance: { driftM: .2 } } : {}),
      ...settings, switchTo: variant?.switchTo ?? 'a long blade',
    };
    if (ballista && profile.ammo > 1) return { ...profile, ammo: 1, burstCap: profile.ammo, fx: 'siege' };
    return profile;
  }
  if (variant && variant.family !== skill) return null;
  if (variant) {
    const follow = variant.melee;
    const reach = skill === SKILLS.HandToHand ? 1.85 : skill === SKILLS.ShortBlade ? 2 : 2.7;
    const stages = [{
      strike: 'StrikeRight', rangeM: reach, fx: follow.fx, share: follow.beats ? .47 : 1,
      rearBonus: follow.rearBonus, armorPierce: follow.armorPierce, lowHealthBonus: follow.lowHealthBonus,
      control: { poiseShare: finisher ? .85 : .55 },
    }];
    if (follow.beats) stages.push({
      strike: 'StrikeDown', rangeM: reach + .45, share: .53, fx: follow.sweep ? 'quake' : 'flurryFinish',
      ...(follow.sweep ? { targetCap: 4, arcRad: Math.PI * .65, control: { poiseShare: .75, shove: 1.15 } }
        : { rearBonus: follow.rearBonus, tempo: 1.45 }),
    });
    return melee(stages, { ...common, requiresLink: true, potency: finisher ? 2.12 : 1.2,
      spend: finisher ? 10 : 5, windUpMs: finisher ? 340 : 180,
      advance: follow.advance, selfEffect: follow.selfEffect, fx: follow.fx });
  }
  const stage = { strike: 'StrikeUp', rangeM: finisher ? 5 : 3.65, halfWidthM: .48,
    control: { poiseShare: finisher ? .8 : .35 }, fx: finisher ? 'measureFinish' : 'lunge' };
  return melee([stage], { ...common, requiresLink: true, potency: finisher ? 2.1 : 1.25,
    spend: finisher ? 10 : 5, windUpMs: finisher ? 330 : 160,
    ...(finisher ? { advance: advance(5, .48) } : {}),
  });
}

export function combinationDelivery(id, weapon) {
  if (!combinationPlayable(id)) return null;
  const template = weapon?.templateIndex;
  const skill = template == null ? SKILLS.HandToHand : weaponSkillUsed(template);
  const variant = rangedCombinations.get(id);
  if (variant) return huntingDelivery(abilityById(id).rank === 100, skill, template, variant);
  const profile = meleeCombinations.get(id);
  if (profile) return skill === SKILLS.HandToHand ? {
    ...profile, stages: profile.stages.map(stage => ({ ...stage, rangeM: stage.rangeM * .85 })),
  } : profile;
  const short = skill === SKILLS.ShortBlade;
  const bare = skill === SKILLS.HandToHand;
  const opening = { strike: 'StrikeUp', rangeM: short ? 2.6 : 3.4, halfWidthM: .42, share: .4, fx: 'lunge' };
  const cut = { strike: 'StrikeRight', rangeM: short ? 1.8 : 2.45, arcRad: Math.PI * .22, tempo: 1.4, share: .6, fx: 'cleave' };
  const stagger = { strike: 'StrikeRight', rangeM: bare ? 1.65 : 2.55, arcRad: Math.PI * .22,
    share: .34, control: { poiseShare: .7, shove: .3 }, fx: 'haymaker' };
  const smash = { strike: 'StrikeDown', rangeM: bare ? 1.85 : 2.75, arcRad: Math.PI * .28,
    share: .66, control: { poiseShare: .45 }, fx: 'crush' };
  switch (id) {
    case BLADE_WEAVE:
      return melee([opening, cut], { potency: 1.25, spend: 6, cooldownMs: 10500, windUpMs: 150, activeMs: 550, recoveryMs: 420 });
    case THOUSAND_CUTS:
      return melee([
        { ...opening, targetCap: 3, share: .4 },
        { ...cut, strike: 'StrikeLeft', share: .25 },
        { ...cut, share: .35 },
      ], { advance: advance(short ? 3.8 : 4.8, .62), redirect: true, capstone: { base: 34, stat: 'speed' },
        potency: 2, spend: 14, cooldownMs: 38000, windUpMs: 420, activeMs: 1000, recoveryMs: 1000 });
    case HUNTING_LINE:
    case PREDATORS_CROSSING:
      return huntingDelivery(id === PREDATORS_CROSSING, skill, template);
    case KNOCKOUT_CHAIN:
      return melee([stagger, smash], { potency: 1.15, spend: 6, cooldownMs: 10000, windUpMs: 185, activeMs: 540, recoveryMs: 480 });
    case TITANS_HANDS:
      return melee([
        { ...stagger, control: { poiseShare: 1, shove: .4 } },
        { ...smash, rangeM: bare ? 2.65 : 3.45, arcRad: Math.PI * .55, targetCap: 4,
          control: { poiseShare: .6, shove: 1.7 }, fx: 'slam' },
      ], { fx: 'flurry', capstone: { base: 43, stat: 'strength' }, potency: 2.6, spend: 15, cooldownMs: 40000,
        windUpMs: 440, activeMs: 850, recoveryMs: 1250 });
    default:
      return null;
  }
}
