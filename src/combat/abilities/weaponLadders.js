// The ladder order follows the four proficiency ranks in the registry.
const dash = (length, halfW = .55) => ({ mech: 'dash', aim: 'lane', length, halfW });
const leap = (length, apex = 1.3) => ({ ...dash(length), mech: 'leap', apex });
// A side hop lands beside the locked enemy (or sideways from the view), alternating sides unless `side` is set.
const hop = (length, side = 0, apex = .45) => ({ mech: 'dash', aim: 'side', length, apex, side });
const chase = { mech: 'dash', aim: 'target', range: [.5, 5] };
const shield = (magnitude) => ({ type: 35, subType: 255, rounds: 1, magnitude });
const haste = (magnitude) => ({ type: 9, subType: 6, rounds: 2, magnitude });
const veil = { type: 23, subType: 0, rounds: 1 };
const rooted = { driftM: .19 };
const stages = ['StrikeRight', 'StrikeLeft', 'StrikeDown', 'StrikeRight', 'StrikeLeft', 'StrikeDown'];
const cleave = (targetCap, arcRad, shove = 0) => ({ targetCap, arcRad, control: { shove, poiseShare: .25 } });
const wind = (windUpMs, recoveryMs) => ({ windUpMs, recoveryMs });
const combo = (beats, tempo = 1.25) => ({ beats, tempo, strikes: stages.slice(0, beats) });
const cap = (base, stat) => ({ base, stat });
const trail = (channel, share, seconds) => ({ channel, share, seconds });

function melee(rank, action, description, options) {
  const [spend, cooldownMs, windUpMs, activeMs, recoveryMs, potency] = [
    [4, 6500, 200, 210, 360, .72], [6, 9000, 255, 260, 475, 1.05],
    [8, 12500, 320, 390, 630, 1.5], [14, 36500, 510, 1000, 900, 2.85],
  ][rank];
  return [action, { kind: 'melee', strike: 'StrikeRight', beats: 1, rangeM: 2.25,
    arcRad: Math.PI * .28, spend, cooldownMs, windUpMs, activeMs, recoveryMs, potency, description, ...options }];
}

function ladder(style, rows) {
  return rows.map(([action, description, options], rank) => {
    const [name, profile] = melee(rank, action, description, options);
    return ['weapon.' + style + '.' + name, profile];
  });
}

export const expandedWeaponLadders = [
  ...ladder('shortsword', [
    ['quickstep-slash', 'Dash a short distance and cut along your path.', { advance: dash(2.7), rangeM: 2.7, fx: 'lunge' }],
    ['vaulting-riposte', 'Vault to the side of the enemy under your aim and punish an interruptible wind-up or an overextended enemy.', { advance: hop(2.8, 1, .7), rangeM: 2.4, counterBonus: .85, fx: 'shadowstep' }],
    ['dancing-route', 'Dash through up to two enemies, then change direction for a second dash.', { beats: 2, redirect: true, fx: 'lunge', stages: [
      { strike: 'StrikeRight', advance: dash(3.1), rangeM: 3.1, targetCap: 2, share: .46, tempo: 1.45, fx: 'lunge' },
      { strike: 'StrikeLeft', advance: dash(2.8), rangeM: 2.8, targetCap: 2, share: .54, tempo: 1.45, fx: 'lunge' },
    ] }],
    ['untouchable-waltz', 'Hop to one side of your enemy, then the other, cutting each time. The final dash disrupts up to three enemies in its path.', { beats: 3, redirect: true, cooldownMs: 31500, capstone: cap(42, 'speed'), fx: 'shadowstep', stages: [
      { strike: 'StrikeRight', advance: hop(2.8, 1), rangeM: 2.4, targetCap: 2, tempo: 1.55, share: .25, fx: 'lunge' },
      { strike: 'StrikeLeft', advance: hop(2.8, -1), rangeM: 2.4, targetCap: 2, tempo: 1.55, share: .3, fx: 'shadowstep' },
      { strike: 'StrikeDown', advance: dash(3.6, .7), rangeM: 3.6, targetCap: 3, tempo: 1.5, share: .45, control: { poiseShare: .8, shove: 1 }, fx: 'flurryFinish' },
    ] }],
  ]),
  ...ladder('wakizashi', [
    ['crosscut', 'Cut twice. Pair with a second short blade to use the offhand on the second hit.', { ...combo(2), alternateHands: true, fx: 'flurry' }],
    ['twin-guard', 'Raise a brief shield and answer with a cut that punishes an exposed enemy.', { alternateHands: true, openOffhand: true, selfEffect: shield(12), counterBonus: .65, fx: 'measure' }],
    ['mirrored-tempo', 'Alternate hands with a second short blade. The final cut carries the largest share of damage.', { ...combo(3, 1.45), alternateHands: true, fx: 'flurry', stages: [
      { strike: 'StrikeRight', rangeM: 2, share: .23, tempo: 1.3, fx: 'flurry' },
      { strike: 'StrikeLeft', rangeM: 2, share: .32, tempo: 1.48, fx: 'flurry' },
      { strike: 'StrikeDown', rangeM: 2.15, share: .45, tempo: 1.62, fx: 'flurryFinish' },
    ] }],
    ['two-moon-dance', 'Alternate a series of rapid cuts, then sweep up to three enemies with the lead blade.', { ...combo(5, 1.65), alternateHands: true, capstone: cap(37, 'agility'), fx: 'flurry', stages: [
      { strike: 'StrikeRight', rangeM: 2.1, share: .14, tempo: 1.65, fx: 'flurry' },
      { strike: 'StrikeLeft', rangeM: 2.1, share: .16, tempo: 1.65, fx: 'flurry' },
      { strike: 'StrikeRight', rangeM: 2.1, share: .17, tempo: 1.65, fx: 'flurry' },
      { strike: 'StrikeLeft', rangeM: 2.1, share: .18, tempo: 1.65, fx: 'flurry' },
      { strike: 'StrikeDown', rangeM: 2.5, share: .35, tempo: 1.42, ...cleave(3, 1.45, .7), fx: 'flurryFinish' },
    ] }],
  ]),
  ...ladder('broadsword', [
    ['measured-cut', 'Deliver a quick, accurate cut with extra reach.', { rangeM: 2.7, toHit: 8, fx: 'measure' }],
    ['adaptive-guard', 'Stand for a stronger cut or crouch through release to gain a brief shield.', { crouchEffect: shield(14), standPotency: .45, fx: 'measure' }],
    ['champions-answer', 'Answer an exposed enemy with a strong interruption and extra damage.', { counterBonus: .95, control: { poiseShare: 1 }, fx: 'measureFinish' }],
    ['perfect-form', 'Gain a brief shield while delivering two measured cuts and a long-reaching finishing thrust.', { ...combo(3, 1.25), rangeM: 2.65, selfEffect: shield(18), capstone: cap(40, 'strength'), fx: 'measure', stages: [
      { strike: 'StrikeRight', rangeM: 2.45, share: .23, fx: 'measure' },
      { strike: 'StrikeLeft', rangeM: 2.45, share: .27, fx: 'measure' },
      { strike: 'StrikeUp', rangeM: 4, halfWidthM: .55, share: .5, toHit: 12, fx: 'measureFinish' },
    ] }],
  ]),
  ...ladder('saber', [
    ['silent-draw', 'Open with a fast draw that deals extra damage to unaware enemies.', { ...wind(135, 305), unawareBonus: .95, fx: 'shadowstep' }],
    ['flowing-pursuit', 'Rush toward the enemy under your aim, cut, and gain a short Speed boost.', { advance: chase, selfEffect: haste(6), fx: 'lunge' }],
    ['crescent-current', 'Sweep up to three enemies twice. Turn between cuts to catch a different group.', { ...combo(2, 1.45), ...cleave(3, 1.35), redirect: true, fx: 'measure' }],
    ['moonlit-torrent', 'Build speed through four cuts and finish with a sweeping fifth swing.', { ...combo(5, 1.6), rangeM: 2.6, redirect: true, capstone: cap(37, 'speed'), ...cleave(3, 1.2), finishControl: { poiseShare: .8, shove: .8 }, fx: 'flurry', finishFx: 'flurryFinish' }],
  ]),
  ...ladder('katana', [
    ['iai-cut', 'Prepare a deliberate draw with high single-target damage.', { ...wind(465, 540), potency: 1.35, rangeM: 2.7, strike: 'StrikeDown', fx: 'execute' }],
    ['vanishing-sheath', 'Dash forward under brief concealment and strike through the line you travel.', { advance: dash(3.7, .48), rangeM: 3.7, selfEffect: veil, fx: 'shadowstep' }],
    ['fatal-opening', 'Exploit a wind-up or overreach. A rear strike deals additional damage.', { counterBonus: 1.05, rearBonus: .65, fx: 'measureFinish' }],
    ['one-perfect-stroke', 'Commit to a long draw that deals extreme damage from behind or against a weakened enemy.', { ...wind(1050, 1450), potency: 3.65, rearBonus: 1.4, lowHealthBonus: .9, capstone: cap(52, 'agility'), rangeM: 3.4, strike: 'StrikeDown', fx: 'execute' }],
  ]),
  ...ladder('claymore', [
    ['wide-arc', 'Sweep up to three enemies in front of you.', { rangeM: 3.1, ...cleave(3, 1.55), fx: 'measure' }],
    ['earthwheel', 'Turn through a broad sweep that knocks back up to four enemies.', { rangeM: 3.2, ...cleave(4, 2.4, 1.45), fx: 'sweep' }],
    ['reaping-circle', 'Charge a full-circle sweep through up to five enemies.', { ...wind(630, 750), rangeM: 3.3, ...cleave(5, Math.PI, .9), fx: 'sweep' }],
    ['greatstorm', 'Deliver three wide sweeps. Turn between strikes to cover the battlefield.', { ...combo(3, 1.22), rangeM: 3.65, ...cleave(5, 2.2, 1), capstone: cap(42, 'strength'), fx: 'sweep', finishFx: 'measureFinish' }],
  ]),
  ...ladder('dai-katana', [
    ['iron-draw', 'Commit to a slow downward cut that penetrates armor.', { ...wind(480, 680), strike: 'StrikeDown', armorPierce: .3, fx: 'execute' }],
    ['falling-moon', 'Bound high onto the enemy under your aim and bring a heavy cut down through it and anyone in your landing lane.', { advance: leap(6.4, 2.5), rangeM: 4.1, targetCap: 2, strike: 'StrikeDown', fx: 'execute' }],
    ['execution-stance', 'Stay planted until release, then deliver a heavy cut that punishes a weakened enemy.', { stance: rooted, ...wind(680, 750), lowHealthBonus: 1.1, armorPierce: .25, fx: 'execute' }],
    ['heaven-splitting-draw', 'Hold your ground through a long wind-up, then split the line with an armor-piercing strike.', { stance: rooted, ...wind(1280, 1550), rangeM: 5.4, halfWidthM: .55, targetCap: 3, strike: 'StrikeDown', armorPierce: .5, capstone: cap(55, 'strength'), fx: 'measureFinish' }],
  ]),
  ...ladder('battle-axe', [
    ['hunters-hook', 'Aim at a nearby enemy and rush into a hooked strike that marks it for 7 seconds. Hit it with Relentless Pursuit to consume the mark for bonus damage.', { advance: chase, opening: trail('hunt', .38, 7), fx: 'lunge' }],
    ['blood-trail', 'Cut an enemy and mark it for Relentless Pursuit for 8 seconds. The cut deals extra damage below 40% health.', { lowHealthBonus: .9, opening: trail('hunt', .48, 8), fx: 'execute' }],
    ['relentless-pursuit', 'Rush a nearby enemy and consume its Hunter’s Hook or Blood Trail mark for extra damage. A finishing hit makes the same ability recover sooner.', { advance: chase, exploit: 'hunt', takedownCooldownMs: 2800, fx: 'lunge' }],
    ['no-escape', 'Rush into three hits against one target. Hits gain bonus damage below 40% health. The first hit can consume a Hunter’s Hook or Blood Trail mark for extra damage.', { ...combo(3, 1.28), advance: chase, exploit: 'hunt', lowHealthBonus: .95, capstone: cap(42, 'strength'), fx: 'lunge', finishFx: 'execute' }],
  ]),
  ...ladder('archers-axe', [
    ['quick-draw-cleave', 'Cut a path through up to two enemies and knock them away.', { ...cleave(2, 1.4, 1.8), ...wind(145, 330), fx: 'sweep' }],
    ['arrow-to-axe', 'Rush into an axe strike. An enemy you recently hit with an arrow takes extra damage.', { advance: chase, exploit: 'arrow', fx: 'lunge' }],
    ['split-pursuit', 'Strike with your axe to open the target to your next arrow.', { opening: trail('axe', .85, 9), fx: 'measure' }],
    ['huntsmans-relay', 'Sweep three enemies and open each for a powerful follow-up arrow.', { ...cleave(3, 1.35, .7), opening: trail('axe', 1.6, 12), capstone: cap(41, 'agility'), fx: 'measureFinish' }],
  ]),
  ...ladder('war-axe', [
    ['brace-and-hew', 'Gain a brief shield as you deliver a heavy chop.', { selfEffect: shield(12), strike: 'StrikeDown', fx: 'execute' }],
    ['iron-root', 'Stay planted through the wind-up. Gain a stronger shield and stagger an interruptible enemy.', { stance: rooted, selfEffect: shield(22), control: { poiseShare: .85 }, fx: 'rally' }],
    ['guardians-break', 'Sweep up to three enemies hard enough to disrupt wind-ups and knock them back.', { ...cleave(3, 1.5, 1.2), control: { poiseShare: .9, shove: 1.2 }, counterBonus: .5, fx: 'sweep' }],
    ['mountainfall', 'Hold your position, then raise a shield and send a knockback sweep around you.', { stance: rooted, ...wind(950, 1250), selfEffect: shield(28), rangeM: 3.9, ...cleave(5, Math.PI, 1.8), capstone: cap(46, 'endurance'), fx: 'quake' }],
  ]),
  ...ladder('mace', [
    ['crack-plate', 'Crack the target’s armor so your next mace technique can exploit it.', { armorPierce: .15, opening: trail('sunder', .4, 8), strike: 'StrikeDown', fx: 'execute' }],
    ['hammer-the-gap', 'Drive through armor and deal extra damage against a target whose armor you cracked.', { armorPierce: .3, exploit: 'sunder', strike: 'StrikeDown', fx: 'execute' }],
    ['crushing-verdict', 'Break an enemy’s wind-up with an armor-piercing blow and leave its armor open.', { armorPierce: .45, opening: trail('sunder', .55, 8), strike: 'StrikeDown', control: { poiseShare: 1 }, fx: 'execute' }],
    ['shatter-dominion', 'Send a wide armor-breaking shockwave through up to four enemies.', { rangeM: 3.4, ...cleave(4, 1.9, 1.35), armorPierce: .55, exploit: 'sunder', opening: trail('sunder', .5, 9), capstone: cap(46, 'strength'), fx: 'quake' }],
  ]),
  ...ladder('light-flail', [
    ['double-lash', 'Strike twice with a fast repeat lash.', { ...combo(2, 1.42), fx: 'flurry' }],
    ['chain-flicker', 'Hop to the side of your enemy, then deliver a second lash in close range.', { ...combo(2, 1.5), advance: hop(2.6), rangeM: 2.4, fx: 'lunge' }],
    ['storm-of-links', 'Deliver four fast checks that pressure one enemy’s poise.', { ...combo(4, 1.55), control: { poiseShare: .2 }, fx: 'flurry' }],
    ['silver-tempest', 'Deliver six rapid lashes, then knock away enemies caught by the last swing.', { ...combo(6, 1.72), ...cleave(2, 1.25), finishControl: { poiseShare: .83, shove: 1.25 }, capstone: cap(35, 'speed'), fx: 'flurry', finishFx: 'flurryFinish' }],
  ]),
  ...ladder('staff', [
    ['staff-jab', 'Jab quickly along a narrow line from outside normal melee range.', { strike: 'StrikeUp', ...wind(140, 300), rangeM: 3.55, halfWidthM: .44, fx: 'measureFinish' }],
    ['sweeping-ward', 'Push up to three enemies away and gain a brief shield.', { rangeM: 3.1, ...cleave(3, 1.45, 1.6), selfEffect: shield(13), fx: 'sweep' }],
    ['vault-strike', 'Pole-vault high onto the enemy under your aim and drive a long thrust through up to two enemies in your lane.', { advance: leap(5.8, 2.2), rangeM: 4.4, targetCap: 2, strike: 'StrikeUp', fx: 'lunge' }],
    ['circle-of-the-master', 'Drive two rapid jabs, then knock nearby enemies away with a circular sweep.', { ...combo(3, 1.35), capstone: cap(38, 'willpower'), fx: 'measure', stages: [
      { strike: 'StrikeUp', rangeM: 3.15, halfWidthM: .55, share: .24, tempo: 1.5, fx: 'measureFinish' },
      { strike: 'StrikeUp', rangeM: 3.3, halfWidthM: .55, share: .26, tempo: 1.5, fx: 'measureFinish' },
      { strike: 'StrikeRight', rangeM: 3.5, share: .5, ...cleave(5, Math.PI, 1.85), fx: 'sweep' },
    ] }],
  ]),
  ...ladder('flail', [
    ['raking-chain', 'Make the target bleed for three seconds and leave a wound that Blood Spiral or Crimson Cyclone can exploit.', { opening: trail('rake', .55, 8), fx: 'measure' }],
    ['rolling-links', 'Alternate three swings and deepen the wound on damaging hits.', { ...combo(3, 1.3), opening: trail('rake', .78, 8), control: { poiseShare: .16 }, fx: 'flurry' }],
    ['blood-spiral', 'Sweep through three enemies and consume your wounds on the targets for bonus burst damage.', { ...cleave(3, 1.5, .65), exploit: 'rake', fx: 'sweep' }],
    ['crimson-cyclone', 'Chain four broad strikes and burst wounds on the enemies you catch.', { ...combo(4, 1.32), ...cleave(4, 1.85, .9), exploit: 'rake', capstone: cap(43, 'strength'), fx: 'sweep', finishFx: 'quake' }],
  ]),
  ...ladder('warhammer', [
    ['hammer-drop', 'Raise the hammer for a slow, high-impact single smash.', { ...wind(620, 690), potency: 1.25, strike: 'StrikeDown', control: { poiseShare: .5 }, fx: 'execute' }],
    ['faultline', 'Strike the ground and shove up to three enemies in a short shockwave.', { ...wind(465, 720), rangeM: 3.4, ...cleave(3, 1.25, 1.15), strike: 'StrikeDown', fx: 'quake' }],
    ['bonebreaker', 'Disrupt an enemy with the first hit and follow with a heavy finishing smash.', { beats: 2, fx: 'quake', stages: [
      { strike: 'StrikeRight', rangeM: 2.4, share: .35, control: { poiseShare: 1 }, fx: 'execute' },
      { strike: 'StrikeDown', rangeM: 2.55, share: .65, armorPierce: .28, fx: 'quake' },
    ] }],
    ['worldbreaker', 'Stay planted through a long charge and deliver a colossal circular shockwave.', { stance: rooted, ...wind(1550, 1600), rangeM: 4.65, ...cleave(6, Math.PI, 2), control: { poiseShare: 1, shove: 2 }, strike: 'StrikeDown', capstone: cap(57, 'strength'), fx: 'quake' }],
  ]),
  ...ladder('short-bow', [
    ['quiet-shot', 'Loose one arrow. Unaware enemies take extra damage.', { kind: 'ranged', strike: 'StrikeDown', ammo: 1, rangeM: 28, projectileSpeed: 34, unawareBonus: .8, fx: 'pierce' }],
    ['ghost-volley', 'Briefly blend into the surroundings and loose a close spread of two arrows.', { kind: 'ranged', strike: 'StrikeDown', ammo: 2, rangeM: 29, projectileSpeed: 34, spreadRad: .025, selfEffect: veil, fx: 'volley' }],
    ['shadow-pin', 'Fire an arrow that briefly slows the enemy, disrupts a wind-up, and marks it for Midnight Rain.', { kind: 'ranged', strike: 'StrikeDown', ammo: 1, rangeM: 31, projectileSpeed: 38, control: { poiseShare: .85 }, opening: trail('shadow', 1.1, 12), slow: 1, impactFx: 'markTarget', fx: 'pierce' }],
    ['midnight-rain', 'Rain five arrows onto visible ground. A target marked by Shadow Pin takes a bonus on its first impact.', { kind: 'ranged', strike: 'StrikeDown', ammo: 5, rangeM: 34, projectileSpeed: 35, linearRadius: .25, rain: { radius: 2.7, height: 10, perTarget: 2 }, exploit: 'shadow', capstone: cap(40, 'agility'), fx: 'skyfall' }],
  ]),
];
