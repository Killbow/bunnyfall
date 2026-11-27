// Horse care and wagon upkeep tiers as data. Keep this module import-free: the prefs load reads it on the entry's
// static path, and the account service bundles it.
export const HORSE_CARE_OFF = 'off';
export const HORSE_CARE_TIER_IDS = Object.freeze([HORSE_CARE_OFF, 'boons', 'hard']);
export const HORSE_CARE_DEFAULT = 'boons';

// Off is stored as the old switch's `false`, so older saves and builds read it as off. The default is never stored.
export const HORSE_CARE_STORED = Object.freeze({ off: false, boons: 'boons', hard: 'hard' });
const TIER_OF_STORED = new Map(Object.entries(HORSE_CARE_STORED).map(([tier, v]) => [v, tier]));
export const isStoredHorseCare = (v) => TIER_OF_STORED.has(v);
// The old switch's stored `true` was the system as it stood, so the prefs load moves it to Hard once.
export const HORSE_CARE_OLD_ON = true;
export const HORSE_CARE_OLD_ON_TIER = 'hard';
export const horseCareTierOfStored = (v) => TIER_OF_STORED.get(v) ?? HORSE_CARE_DEFAULT;

const deepFreeze = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
};

export const HORSE_CARE_RULES = deepFreeze({
  boons: {
    id: 'boons',
    hungerCosts: false,
    bondFades: false,
    paceFloor: true,
    draftDrags: false,
    refusedRunWalks: false,
  },
  hard: {
    id: 'hard',
    hungerCosts: true,
    bondFades: true,
    paceFloor: false,
    draftDrags: true,
    refusedRunWalks: true,
  },
});

// Functions handed no rules run Hard.
export const HORSE_CARE_HARD = HORSE_CARE_RULES.hard;
export const horseCareRulesForTier = (tier) => (typeof tier === 'string' && Object.hasOwn(HORSE_CARE_RULES, tier) ? HORSE_CARE_RULES[tier] : null);

export const WAGON_UPKEEP_OFF = 'off';
export const WAGON_UPKEEP_TIER_IDS = Object.freeze([WAGON_UPKEEP_OFF, 'boons', 'hard']);
export const WAGON_UPKEEP_DEFAULT = 'boons';
// Stored the same way as horse care's tiers.
export const WAGON_UPKEEP_STORED = Object.freeze({ off: false, boons: 'boons', hard: 'hard' });
const WAGON_TIER_OF_STORED = new Map(Object.entries(WAGON_UPKEEP_STORED).map(([tier, v]) => [v, tier]));
export const isStoredWagonUpkeep = (v) => WAGON_TIER_OF_STORED.has(v);
export const WAGON_UPKEEP_OLD_ON = true;
export const WAGON_UPKEEP_OLD_ON_TIER = 'hard';
export const wagonUpkeepTierOfStored = (v) => WAGON_TIER_OF_STORED.get(v) ?? WAGON_UPKEEP_DEFAULT;

export const WAGON_SOUND_BOON = 1.1;
export const WAGON_UPKEEP_RULES = deepFreeze({
  boons: {
    id: 'boons',
    wearSlows: false,
    wearPrices: false,
    soundPace: WAGON_SOUND_BOON,
  },
  hard: {
    id: 'hard',
    wearSlows: true,
    wearPrices: true,
    soundPace: 1,
  },
});
export const WAGON_UPKEEP_HARD = WAGON_UPKEEP_RULES.hard;
export const wagonUpkeepRulesForTier = (tier) => (typeof tier === 'string' && Object.hasOwn(WAGON_UPKEEP_RULES, tier) ? WAGON_UPKEEP_RULES[tier] : null);
