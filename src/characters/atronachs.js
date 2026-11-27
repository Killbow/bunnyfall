import { MOBILE_TYPES } from './mobileTypes.js';

export const ATRONACH_RAMPS = Object.freeze({
  flame: [240, 247],
  ember: [224, 232],
  ice: [97, 104],
  rime: [112, 117],
  iron: [88, 95],
  meat: [50, 60],
  suture: [180, 190],
});

const B = 'body',
  AL = 'armL',
  AR = 'armR',
  LL = 'legL',
  LR = 'legR';

const torso = (mat, yLo, yHi = 1.62, th = 0.02) => ({ groups: [B], yLo, yHi, th, mat });
const arms = (mat, yLo, yHi = 1.5, th = 0.018) => ({ groups: [AL, AR], yLo, yHi, th, mat, arm: true });
const legs = (mat, yLo, yHi = 0.96, th = 0.018) => ({ groups: [LL, LR], yLo, yHi, th, mat, leg: true });

export const ATRONACH_DESIGNS = [
  {
    id: MOBILE_TYPES.FireAtronach,
    name: 'Fire Atronach',
    level: 16,
    damage: [5, 15],
    weaponTier: 0,
    build: { torso: 1.06, shoulder: 1.16, arm: 0.96, hand: 0.9, neck: 0.9, skull: 0.86, jaw: 0.84, leg: 0.86 },
    zones: [torso('ember', 1.0, 1.5, 0.024), arms('ember', 1.1, 1.46, 0.02)],
    mats: { ember: ATRONACH_RAMPS.ember },
    hideRamp: 'flame',
    bootRamp: 'ember',
    spectral: { opacity: 0.78, additive: true },
  },
  {
    id: MOBILE_TYPES.IceAtronach,
    name: 'Ice Atronach',
    level: 16,
    damage: [5, 15],
    weaponTier: 0,
    build: { torso: 1.14, shoulder: 1.24, arm: 1.12, hand: 1.1, neck: 1.02, skull: 0.96, jaw: 0.98, leg: 1.08 },
    zones: [torso('rime', 1.3, 1.58, 0.03), arms('rime', 1.0, 1.3, 0.024)],
    mats: { rime: ATRONACH_RAMPS.rime },
    hideRamp: 'ice',
    bootRamp: 'rime',
    spectral: { opacity: 0.66 },
  },
  {
    id: MOBILE_TYPES.IronAtronach,
    name: 'Iron Atronach',
    level: 16,
    damage: [5, 15],
    weaponTier: 0,
    build: { torso: 1.34, shoulder: 1.42, arm: 1.3, hand: 1.36, neck: 1.24, skull: 1.02, jaw: 1.16, leg: 1.28 },
    zones: [
      torso('iron', 1.06, 1.6, 0.034),
      arms('iron', 1.02, 1.48, 0.03),
      legs('iron', 0.3, 0.96, 0.03),
    ],
    mats: { iron: ATRONACH_RAMPS.iron },
    hideRamp: 'iron',
    bootRamp: 'iron',
  },
  {
    id: MOBILE_TYPES.FleshAtronach,
    name: 'Flesh Atronach',
    level: 16,
    damage: [5, 15],
    weaponTier: 0,
    build: { torso: 1.22, shoulder: 1.1, arm: 1.18, hand: 1.24, neck: 0.86, skull: 0.94, jaw: 1.06, leg: 1.14 },
    zones: [
      torso('suture', 1.24, 1.34, 0.026),
      torso('suture', 0.96, 1.04, 0.024),
      arms('suture', 1.16, 1.24, 0.022),
    ],
    mats: { suture: ATRONACH_RAMPS.suture },
    hideRamp: 'meat',
    bootRamp: 'meat',
  },
];

export function atronachOpts(design, pal) {
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
  const hide = ramp(ATRONACH_RAMPS[design.hideRamp]);
  return {
    drape: null,
    ramps: { skin: hide, boot: ramp(ATRONACH_RAMPS[design.bootRamp]) },
    opts: { build: design.build, clothZones: design.zones, armorZones: [], mats },
    hide,
  };
}
