// Undead body designs and color ramps for the neutral-body rig; specs scale the loft rows and add no faces.
import { MOBILE_TYPES } from './mobileTypes.js';

export const UNDEAD_RAMPS = Object.freeze({
  rotFlesh: [144, 156],
  curedSkin: [120, 127],
  linen: [112, 120],
  linenDark: [118, 125],
  oldBlood: [176, 188],
  gravecloth: [32, 44],
  bone: [112, 118],
  weathered: [36, 46],
  graveRobe: [86, 94],
  ashRobe: [90, 95],
  pallor: [113, 119],
  bloodSilk: [244, 251],
  darkCloth: [84, 92],
  spectral: [96, 103],
  wraithBlue: [102, 109],
});

const B = 'body',
  AL = 'armL',
  AR = 'armR',
  LL = 'legL',
  LR = 'legR';

const torso = (mat, yLo, yHi = 1.62, th = 0.012) => ({ groups: [B], yLo, yHi, th, mat });
const pelvis = (mat, yLo = 0.9, yHi = 1.14, th = 0.012) => ({ groups: [B], yLo, yHi, th, mat });
const legsTo = (mat, yLo, yHi = 1.0, th = 0.012) => ({ groups: [LL, LR], yLo, yHi, th, mat, leg: true });
const arms = (mat, yLo, yHi = 1.62, th = 0.011) => ({ groups: [AL, AR], yLo, yHi, th, mat, arm: true });
const feet = (mat, yLo = 0.0, yHi = 0.16, th = 0.014) => ({ groups: [LL, LR], yLo, yHi, th, mat, leg: true });
const skull = (mat, yLo, yHi, th = 0.014) => ({ groups: ['head'], yLo, yHi, th, mat });
const hands = (mat, yLo, yHi, th = 0.012) => ({ groups: [AL, AR], yLo, yHi, th, mat, arm: true });

export const UNDEAD_DESIGNS = [
  {
    id: MOBILE_TYPES.Zombie,
    name: 'Zombie',
    level: 10,
    damage: [15, 50],
    weaponTier: 0,
    build: {
      torso: 0.9,
      shoulder: 0.86,
      arm: 0.82,
      hand: 1.1,
      neck: 0.78,
      skull: 0.98,
      jaw: 0.9,
    },
    zones: [
      { groups: [B], yLo: 0.98, yHi: 1.2, th: 0.03, mat: 'bloat' },
      pelvis('rag', 0.9, 1.12),
      legsTo('rag', 0.62, 0.96),
    ],
    mats: { rag: UNDEAD_RAMPS.gravecloth, bloat: UNDEAD_RAMPS.rotFlesh },
    hideRamp: 'rotFlesh',
  },
  {
    id: MOBILE_TYPES.Mummy,
    name: 'Mummy',
    level: 11,
    damage: [5, 15],
    weaponTier: 0,
    build: {
      torso: 0.86,
      shoulder: 0.88,
      arm: 0.8,
      hand: 0.9,
      neck: 0.74,
      skull: 0.96,
      jaw: 0.86,
    },
    zones: [
      torso('linen', 1.12, 1.62, 0.034),
      torso('linen', 0.96, 1.12, 0.044),
      arms('linen', 0.78, 1.5, 0.03),
      pelvis('linen', 0.88, 1.1, 0.04),
      legsTo('linen', 0.2, 0.96, 0.032),
      feet('linen', 0.0, 0.2, 0.034),
      skull('linen', 1.62, 1.9, 0.018),
      skull('linen', 1.5, 1.62, 0.02),
      hands('linen', 0.6, 0.78, 0.016),

      torso('stain', 1.24, 1.34, 0.036),
    ],
    mats: { linen: UNDEAD_RAMPS.linen, stain: UNDEAD_RAMPS.oldBlood },
    hideRamp: 'curedSkin',
  },
  {
    id: MOBILE_TYPES.SkeletalWarrior,
    name: 'Skeletal Warrior',
    level: 9,
    damage: [5, 15],
    weaponTier: 1,
    build: {
      torso: 0.62,
      shoulder: 0.7,
      arm: 0.6,
      hand: 0.72,
      neck: 0.6,
      skull: 0.94,
      jaw: 0.78,
      leg: 0.62,
    },
    zones: [],
    mats: {},
    hideRamp: 'bone',
    bootRamp: 'bone',
    bones: { ribs: 6, gap: 0.42 },
  },
  {
    id: MOBILE_TYPES.Centaur,
    name: 'Centaur',
    level: 5,
    damage: [5, 15],
    weaponTier: 1,
    build: {
      torso: 1.1,
      shoulder: 1.14,
      arm: 1.08,
      hand: 1.06,
      neck: 1.02,
      skull: 1.0,
      jaw: 1.0,
      leg: 0.6,
    },
    zones: [],
    mats: {},
    hideRamp: 'weathered',
    bootRamp: 'weathered',
    horse: { girth: 1, len: 1, legs: 1 },
    collapse: ['legL', 'legR'],
  },
  {
    id: MOBILE_TYPES.Giant,
    name: 'Giant',
    level: 10,
    damage: [10, 30],
    weaponTier: 0,
    build: {
      torso: 1.46,
      shoulder: 1.52,
      arm: 1.44,
      hand: 1.5,
      neck: 1.4,
      skull: 1.16,
      jaw: 1.3,
      leg: 1.4,
    },
    zones: [pelvis('pelt', 0.88, 1.14, 0.02), legsTo('pelt', 0.6, 0.94, 0.018)],
    mats: { pelt: UNDEAD_RAMPS.gravecloth },
    hideRamp: 'weathered',
  },
  {
    id: MOBILE_TYPES.Lich,
    name: 'Lich',
    level: 20,
    damage: [70, 100],
    weaponTier: 2,
    build: {
      torso: 0.6,
      shoulder: 0.68,
      arm: 0.6,
      hand: 0.7,
      neck: 0.6,
      skull: 0.92,
      jaw: 0.74,
      leg: 0.6,
    },
    zones: [],
    mats: { robe: UNDEAD_RAMPS.graveRobe },
    hideRamp: 'bone',
    bootRamp: 'bone',
    bones: { ribs: 5, gap: 0.5 },
    drape: { name: 'Plain Robes', mat: 'robe' },
  },
  {
    id: MOBILE_TYPES.AncientLich,
    name: 'Ancient Lich',
    level: 21,
    damage: [70, 100],
    weaponTier: 2,
    build: {
      torso: 0.6,
      shoulder: 0.64,
      arm: 0.6,
      hand: 0.68,
      neck: 0.6,
      skull: 0.9,
      jaw: 0.7,
      leg: 0.6,
    },
    zones: [],
    mats: { robe: UNDEAD_RAMPS.ashRobe },
    hideRamp: 'bone',
    bootRamp: 'bone',
    bones: { ribs: 4, gap: 0.58 },
    drape: { name: 'Priest Robes', mat: 'robe' },
  },
  {
    id: MOBILE_TYPES.Vampire,
    name: 'Vampire',
    level: 19,
    damage: [20, 50],
    weaponTier: 2,
    build: {
      torso: 0.96,
      shoulder: 1.0,
      arm: 0.94,
      hand: 0.96,
      neck: 0.92,
      skull: 0.98,
      jaw: 0.94,
      leg: 0.96,
    },
    zones: [
      torso('coat', 1.06, 1.62, 0.016),
      arms('coat', 0.9, 1.5, 0.014),
      pelvis('coat', 0.88, 1.1, 0.016),
      legsTo('coat', 0.4, 0.94, 0.014),
      feet('coat', 0.0, 0.18, 0.016),
      torso('silk', 1.22, 1.42, 0.02),
    ],
    mats: { coat: UNDEAD_RAMPS.darkCloth, silk: UNDEAD_RAMPS.bloodSilk },
    hideRamp: 'pallor',
    bootRamp: 'darkCloth',
    drape: { name: 'Formal Cloak', mat: 'coat' },
  },
  {
    id: MOBILE_TYPES.VampireAncient,
    name: 'Ancient Vampire',
    level: 20,
    damage: [20, 60],
    weaponTier: 2,
    build: {
      torso: 1.02,
      shoulder: 1.1,
      arm: 1.0,
      hand: 1.0,
      neck: 0.96,
      skull: 1.0,
      jaw: 1.0,
      leg: 1.0,
    },
    zones: [
      torso('coat', 1.02, 1.62, 0.018),
      arms('coat', 0.86, 1.5, 0.016),
      pelvis('coat', 0.86, 1.1, 0.018),
      legsTo('coat', 0.36, 0.94, 0.016),
      feet('coat', 0.0, 0.2, 0.018),
      torso('silk', 1.14, 1.5, 0.024),
    ],
    mats: { coat: UNDEAD_RAMPS.darkCloth, silk: UNDEAD_RAMPS.bloodSilk },
    hideRamp: 'pallor',
    bootRamp: 'darkCloth',
    drape: { name: 'Formal Cloak', mat: 'coat' },
  },
  {
    id: MOBILE_TYPES.Ghost,
    name: 'Ghost',
    level: 11,
    damage: [10, 35],
    weaponTier: 0,
    build: { torso: 0.94, shoulder: 0.96, arm: 0.92, hand: 0.92, neck: 0.9, skull: 0.96, jaw: 0.92, leg: 0.94 },
    zones: [],
    mats: {},
    hideRamp: 'spectral',
    bootRamp: 'spectral',
    spectral: { opacity: 0.42 },
    drape: null,
  },
  {
    id: MOBILE_TYPES.Wraith,
    name: 'Wraith',
    level: 15,
    damage: [20, 45],
    weaponTier: 0,
    build: { torso: 0.82, shoulder: 0.86, arm: 0.8, hand: 0.84, neck: 0.8, skull: 0.94, jaw: 0.86, leg: 0.84 },
    zones: [],
    mats: { shroud: UNDEAD_RAMPS.wraithBlue },
    hideRamp: 'wraithBlue',
    bootRamp: 'wraithBlue',
    spectral: { opacity: 0.3 },
    drape: { name: 'Plain Robes', mat: 'shroud' },
  },
];

/**
 * @param {object} design
 * @param {{get:(i:number)=>{r:number,g:number,b:number}}} pal
 */
export function undeadOpts(design, pal) {
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
  const hide = ramp(UNDEAD_RAMPS[design.hideRamp]);
  const drape = design.drape ? { name: design.drape.name, ramp: mats[design.drape.mat] } : null;
  return {
    drape,
    ramps: { skin: hide, boot: ramp(UNDEAD_RAMPS[design.bootRamp || 'gravecloth']) },
    opts: { build: design.build, clothZones: design.zones, armorZones: [], mats },
    hide,
  };
}
