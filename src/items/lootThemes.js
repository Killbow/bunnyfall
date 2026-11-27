// Narrows which creature ingredient a listed monster can drop; the classic roll odds stay unchanged.
// Unlisted mobile types, including every human class, keep the full classic pool.
import { MOBILE_TYPES } from '../characters/mobileTypes.js';

// The first four lines are CreatureIngredients1, the next two CreatureIngredients2, and the last CreatureIngredients3.
const IDX = Object.freeze({
  WerewolfsBlood: 33, FairyDragonScales: 35, WraithEssence: 38, Ectoplasm: 39,
  GhoulsTongue: 40, SpidersVenom: 41, TrollsBlood: 42, SnakeVenom: 43,
  GorgonSnake: 44, LichDust: 45, GiantsBlood: 50, BasilisksEye: 51,
  DaedrasHeart: 53, SaintsHair: 54, OrcsBlood: 61,
  DragonsScales: 46, GiantScorpionStinger: 47, SmallScorpionStinger: 48,
  MummyWrappings: 49, GryphonsFeather: 52,
  WereboarsTusk: 34, NymphHair: 36, UnicornHorn: 37,
});

export const CREATURE_INGREDIENT_THEME = Object.freeze({
  [MOBILE_TYPES.Imp]:           Object.freeze({ C1: Object.freeze([IDX.DaedrasHeart]) }),
  [MOBILE_TYPES.Harpy]:         Object.freeze({ C2: Object.freeze([IDX.GryphonsFeather]) }),
  [MOBILE_TYPES.Giant]:         Object.freeze({ C1: Object.freeze([IDX.GiantsBlood]) }),
  [MOBILE_TYPES.Centaur]:       Object.freeze({ C1: Object.freeze([IDX.FairyDragonScales]), C3: Object.freeze([IDX.NymphHair]) }),
  [MOBILE_TYPES.Nymph]:         Object.freeze({ C1: Object.freeze([IDX.FairyDragonScales]), C3: Object.freeze([IDX.NymphHair]) }),
  [MOBILE_TYPES.OrcShaman]:     Object.freeze({ C1: Object.freeze([IDX.OrcsBlood]) }),
  [MOBILE_TYPES.DaedraSeducer]: Object.freeze({ C1: Object.freeze([IDX.DaedrasHeart]) }),
  [MOBILE_TYPES.DaedraLord]:    Object.freeze({ C1: Object.freeze([IDX.DaedrasHeart]) }),
  [MOBILE_TYPES.Lich]:          Object.freeze({ C1: Object.freeze([IDX.LichDust, IDX.WraithEssence, IDX.Ectoplasm, IDX.GhoulsTongue]), C2: Object.freeze([IDX.MummyWrappings]) }),
  [MOBILE_TYPES.AncientLich]:   Object.freeze({ C1: Object.freeze([IDX.LichDust, IDX.WraithEssence, IDX.Ectoplasm, IDX.GhoulsTongue]), C2: Object.freeze([IDX.MummyWrappings]) }),
  // Nothing in the pool fits these monsters, so every tier is left out on purpose.
  [MOBILE_TYPES.Vampire]:        Object.freeze({}),
  [MOBILE_TYPES.VampireAncient]: Object.freeze({}),
  [MOBILE_TYPES.Dreugh]:         Object.freeze({}),
  [MOBILE_TYPES.Lamia]:          Object.freeze({}),
});

// A tier missing from an entry returns an empty pool and mints nothing; it never falls back to the classic pool.
export function themedIngredientPool(mobileType, tier, vanillaPool) {
  const theme = mobileType == null ? undefined : CREATURE_INGREDIENT_THEME[mobileType];
  if (!theme) return vanillaPool;
  return theme[tier] ?? [];
}
