// The orc line: Orc, OrcSergeant, OrcShaman, and OrcWarlord share one body design and differ by rank.

import { MOBILE_TYPES } from './mobileTypes.js';

export const ORC_RAMPS = Object.freeze({
  hideGreen: [160, 172],
  hideOlive: [192, 204],
  hideAsh:   [112, 124],
  leather:   [70, 79],
  ironDark:  [80, 92],
  bloodRed:  [240, 251],
  boneWhite: [64, 72],
  brassGold: [224, 236],
});

const B = 'body', AL = 'armL', AR = 'armR', LL = 'legL', LR = 'legR';
const torso   = (mat, yLo, yHi = 1.62, th = 0.010) => ({ groups: [B], yLo, yHi, th, mat });
const sleeves = (mat, yLo, yHi = 1.62, th = 0.010) => ({ groups: [AL, AR], yLo, yHi, th, mat, arm: true });
const legs    = (mat, yLo, yHi = 1.00, th = 0.010) => ({ groups: [LL, LR], yLo, yHi, th, mat, leg: true });
const pelvis  = (mat, yLo = 0.90, yHi = 1.16, th = 0.014) => ({ groups: [B], yLo, yHi, th, mat });
const feet    = (mat, yLo = 0.00, yHi = 0.14, th = 0.014) => ({ groups: [LL, LR], yLo, yHi, th, mat, leg: true });
const greaves = (mat, th = 0.020) => ({ groups: [LL, LR], yLo: 0.38, yHi: 1.00, th, mat, leg: true });
const boots   = (mat, th = 0.016) => ({ groups: [LL, LR], yLo: 0.00, yHi: 0.42, th, mat, leg: true });
const hose    = (mat, th = 0.012) => ({ groups: [LL, LR], yLo: 0.00, yHi: 1.00, th, mat, leg: true });
const bracers = (mat, yLo = 1.00, yHi = 1.24, th = 0.018) => ({ groups: [AL, AR], yLo, yHi, th, mat, arm: true });
const spaulder = (mat, th = 0.026) => ({ groups: [AL, AR], yLo: 1.48, yHi: 1.66, th, mat, arm: true });

export const ORC_DESIGNS = Object.freeze([
  {
    id: MOBILE_TYPES.Orc, name: 'Orc',
    level: 5, damage: [1, 6], weaponTier: 0,
    build: { torso: 1.22, shoulder: 1.20, arm: 1.22, hand: 1.26, neck: 1.34, skull: 1.04, jaw: 1.32, leg: 1.14 },
    tusk: { size: 1.00 }, brow: { jut: 1.00 },
    zones: [pelvis('hide', 0.90, 1.18), greaves('hide', 0.014), boots('hide', 0.016), bracers('hide')],
    mats: { hide: ORC_RAMPS.leather },
    hideRamp: 'hideGreen',
  },
  {
    id: MOBILE_TYPES.OrcSergeant, name: 'Orc Sergeant',
    level: 7, damage: [5, 15], weaponTier: 1,
    build: { torso: 1.28, shoulder: 1.26, arm: 1.24, hand: 1.26, neck: 1.36, skull: 1.05, jaw: 1.34, leg: 1.16 },
    tusk: { size: 1.10 }, brow: { jut: 1.05 },
    zones: [torso('iron', 1.16, 1.62), spaulder('iron'), pelvis('hide', 0.90, 1.18),
            greaves('iron'), boots('hide'), bracers('iron')],
    mats: { iron: ORC_RAMPS.ironDark, hide: ORC_RAMPS.leather },
    hideRamp: 'hideGreen',
  },
  {
    id: MOBILE_TYPES.OrcShaman, name: 'Orc Shaman',
    level: 13, damage: [2, 20], weaponTier: 0,
    build: { torso: 1.10, shoulder: 1.08, arm: 1.06, hand: 1.14, neck: 1.24, skull: 1.10, jaw: 1.30, leg: 1.04 },
    tusk: { size: 1.22 }, brow: { jut: 1.14 },
    zones: [torso('robe', 1.02, 1.62), sleeves('robe', 1.16, 1.62), pelvis('robe', 0.88, 1.20),
            hose('robe'), boots('hide', 0.018)],
    mats: { robe: ORC_RAMPS.hideAsh, hide: ORC_RAMPS.leather, bone: ORC_RAMPS.boneWhite },
    hideRamp: 'hideOlive',
  },
  {
    id: MOBILE_TYPES.OrcWarlord, name: 'Orc Warlord',
    level: 16, damage: [5, 50], weaponTier: 2,
    build: { torso: 1.38, shoulder: 1.40, arm: 1.34, hand: 1.32, neck: 1.44, skull: 1.08, jaw: 1.40, leg: 1.24 },
    tusk: { size: 1.30 }, brow: { jut: 1.20 },
    zones: [torso('plate', 1.10, 1.64), spaulder('brass', 0.032), pelvis('plate', 0.88, 1.20),
            greaves('plate', 0.024), boots('plate', 0.020), bracers('brass')],
    mats: { plate: ORC_RAMPS.ironDark, brass: ORC_RAMPS.brassGold, war: ORC_RAMPS.bloodRed },
    hideRamp: 'hideGreen',
  },
]);

export function orcOpts(design, pal) {
  const ramp = ([a, b]) => {
    const out = [];
    for (let i = b; i >= a; i--) { const c = pal.get(i); out.push([c.r, c.g, c.b]); }
    return out;
  };
  const mats = {};
  for (const [name, span] of Object.entries(design.mats)) mats[name] = ramp(span);
  const hide = ramp(ORC_RAMPS[design.hideRamp]);
  return {
    ramps: { skin: hide, boot: ramp(ORC_RAMPS.leather) },
    opts: { build: design.build, clothZones: design.zones, armorZones: [], mats },
    hide,
  };
}

export function orcDesignFor(id) {
  return ORC_DESIGNS.find((d) => d.id === id) || null;
}
