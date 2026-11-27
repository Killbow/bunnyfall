import { MOBILE_TYPES } from './mobileTypes.js';

// Frost, Fire, Daedroth, Lord, and Seducer enemy builds, reusing the werewolf and atronach mechanisms.

export const DAEDRA_RAMPS = Object.freeze({
  frost: [98, 105],
  hellfire: [240, 247],
  scale: [176, 184],
  lordflesh: [50, 58],
  gilt: [226, 234],
  ironDark: [86, 93],
  fair: [113, 120],
});

const B = 'body',
  AL = 'armL',
  AR = 'armR',
  LL = 'legL',
  LR = 'legR';

const torso = (mat, yLo, yHi = 1.62, th = 0.02) => ({ groups: [B], yLo, yHi, th, mat });
const arms = (mat, yLo, yHi = 1.5, th = 0.018) => ({ groups: [AL, AR], yLo, yHi, th, mat, arm: true });
const pelvis = (mat, yLo = 0.88, yHi = 1.12, th = 0.02) => ({ groups: [B], yLo, yHi, th, mat });
const legs = (mat, yLo, yHi = 0.96, th = 0.018) => ({ groups: [LL, LR], yLo, yHi, th, mat, leg: true });

export const DAEDRA_DESIGNS = [
  {
    id: MOBILE_TYPES.FrostDaedra,
    name: 'Frost Daedra',
    level: 17,
    damage: [50, 100],
    weaponTier: 2,
    build: { torso: 1.26, shoulder: 1.36, arm: 1.26, hand: 1.3, neck: 1.2, skull: 1.02, jaw: 1.12, leg: 1.2 },
    zones: [torso('rime', 1.2, 1.56, 0.026), arms('rime', 1.06, 1.42, 0.022)],
    mats: { rime: DAEDRA_RAMPS.fair },
    hideRamp: 'frost',
    bootRamp: 'frost',
    spectral: { opacity: 0.8 },
  },
  {
    id: MOBILE_TYPES.FireDaedra,
    name: 'Fire Daedra',
    level: 17,
    damage: [15, 50],
    weaponTier: 2,
    build: { torso: 1.14, shoulder: 1.2, arm: 1.14, hand: 1.16, neck: 1.1, skull: 1, jaw: 1.06, leg: 1.1 },
    zones: [],
    mats: {},
    hideRamp: 'hellfire',
    bootRamp: 'hellfire',
    spectral: { opacity: 0.82, additive: true },
  },
  {
    id: MOBILE_TYPES.Daedroth,
    name: 'Daedroth',
    level: 18,
    damage: [15, 50],
    weaponTier: 2,
    build: { torso: 1.24, shoulder: 1.3, arm: 1.24, hand: 1.3, neck: 1.26, skull: 1, jaw: 1, leg: 1.18 },
    zones: [],
    mats: {},
    hideRamp: 'scale',
    bootRamp: 'scale',
    collapse: ['head'],
    beastHead: { skull: 0.11, snout: 0.24, depth: 0.85, ears: 0, tusks: 0.5 },
    tail: { len: 0.4, up: 0.15, thick: 0.038 },
  },
  {
    id: MOBILE_TYPES.DaedraLord,
    name: 'Daedra Lord',
    level: 20,
    damage: [15, 50],
    weaponTier: 2,
    build: { torso: 1.3, shoulder: 1.42, arm: 1.3, hand: 1.34, neck: 1.26, skull: 1.06, jaw: 1.18, leg: 1.24 },
    zones: [
      torso('plate', 1.14, 1.58, 0.03),
      arms('plate', 1.12, 1.44, 0.024),
      pelvis('plate'),
      legs('plate', 0.42, 0.96, 0.024),
      torso('gold', 1.3, 1.4, 0.036),
    ],
    mats: { plate: DAEDRA_RAMPS.ironDark, gold: DAEDRA_RAMPS.gilt },
    hideRamp: 'lordflesh',
    bootRamp: 'ironDark',
    horns: { len: 0.26, thick: 0.024, sweep: 0.85, skull: 0.106 },
    drape: null,
  },
  {
    id: MOBILE_TYPES.DaedraSeducer,
    name: 'Daedra Seducer',
    level: 19,
    damage: [15, 50],
    weaponTier: 2,
    build: { torso: 0.94, shoulder: 0.96, arm: 0.92, hand: 0.94, neck: 0.94, skull: 0.98, jaw: 0.94, leg: 0.96 },
    zones: [torso('gold', 1.24, 1.36, 0.022), pelvis('gold', 0.9, 1.06, 0.02)],
    mats: { gold: DAEDRA_RAMPS.gilt },
    hideRamp: 'fair',
    bootRamp: 'fair',
    horns: { len: 0.11, thick: 0.013, sweep: 0.95, skull: 0.098 },
    drape: { name: 'Toga', mat: 'gold' },
  },
];

export function daedraOpts(design, pal) {
  const ramp = ([a, b]) => {
    const out = [];
    for (let i = b; i >= a; i--) {
      const c = pal.get(i);
      out.push([c.r, c.g, c.b]);
    }
    return out;
  };
  const mats = {};
  for (const [name, span] of Object.entries(design.mats)) mats[name] = ramp(span);
  const hide = ramp(DAEDRA_RAMPS[design.hideRamp]);
  const drape = design.drape ? { name: design.drape.name, ramp: mats[design.drape.mat] } : null;
  return {
    drape,
    ramps: { skin: hide, boot: ramp(DAEDRA_RAMPS[design.bootRamp]) },
    opts: { build: design.build, clothZones: design.zones, armorZones: [], mats },
    hide,
  };
}
