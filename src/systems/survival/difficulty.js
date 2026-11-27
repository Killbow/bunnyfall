// A leaf with no imports, so the laws, the switch, and the prefs shelf read it without a cycle.
// A law handed no rules runs Hard.
export const SURVIVAL_OFF = 'off';
export const SURVIVAL_TIER_IDS = Object.freeze([SURVIVAL_OFF, 'boons', 'casual', 'hard']);
export const SURVIVAL_DEFAULT = 'boons';

// Off stays stored as the old switch's `false`, so an old shelf needs no conversion and an older build still
// reads it as off. The default is never stored.
export const SURVIVAL_STORED = Object.freeze({ off: false, boons: 'boons', casual: 'casual', hard: 'hard' });
const TIER_OF_STORED = new Map(Object.entries(SURVIVAL_STORED).map(([tier, v]) => [v, tier]));
export const isStoredTier = (v) => TIER_OF_STORED.has(v);
// Anything else, such as the old `true` or a hand edit, reads as the default, and the shelf drops it at load.
export const tierOfStored = (v) => TIER_OF_STORED.get(v) ?? SURVIVAL_DEFAULT;

const deepFreeze = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
};

// A field is here only because the tiers differ on it. `stamina.floor` is the share of the pool the needs may not
// take; heat and cold charge at a felt temperature of `hotFrom` or more, or `coldFrom` or less.
export const SURVIVAL_RULES = deepFreeze({
  // Boons' floor is the whole pool, so the needs charge nothing; its temperature edges only decide whether a loan
  // carried from Casual is repaid.
  boons: {
    id: 'boons',
    stamina: { floor: 1, hotFrom: 51, coldFrom: -31, bareFeet: false, duringRest: false, repaid: true, fireWarms: true },
    attributes: false,
    health: false,
    rust: false,
    sickness: false,
    roughRest: { recovery: 1, encounters: 1, stiffHours: 0 },
    roughSleepFloor: null,
    restGate: false,
    blackout: false,
    wastedMeal: false,
    boons: true,
  },
  casual: {
    id: 'casual',
    stamina: { floor: 0.5, hotFrom: 51, coldFrom: -31, bareFeet: false, duringRest: false, repaid: true, fireWarms: true },
    attributes: false,
    health: false,
    rust: false,
    sickness: false,
    roughRest: { recovery: 1, encounters: 1, stiffHours: 0 },
    roughSleepFloor: null,
    restGate: false,
    blackout: false,
    wastedMeal: false,
    boons: false,
  },
  hard: {
    id: 'hard',
    stamina: { floor: 0, hotFrom: 20, coldFrom: -20, bareFeet: true, duringRest: true, repaid: false, fireWarms: false },
    attributes: true,
    health: true,
    rust: true,
    sickness: true,
    roughRest: { recovery: 0.5, encounters: 2, stiffHours: 4 },
    roughSleepFloor: 'tired',
    restGate: true,
    blackout: true,
    wastedMeal: true,
    boons: false,
  },
});

export const HARD_RULES = SURVIVAL_RULES.hard;
export const rulesForTier = (tier) => (typeof tier === 'string' && Object.hasOwn(SURVIVAL_RULES, tier) ? SURVIVAL_RULES[tier] : null);
