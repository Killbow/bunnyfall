// @ts-check
// Keep this module free of imports: smallerDungeons.js imports it, so reaching back to the size law would form a
// cycle.

export const DUNGEON_TIERS = Object.freeze(['regular', 'elite', 'super']);
// The tier keyed `super` in code is shown to players as Abyss Dungeon.
export const DUNGEON_TIER_TEXT = Object.freeze({ regular: 'Regular Dungeon', elite: 'Elite Dungeon', super: 'Abyss Dungeon' });
export const DUNGEON_SIZE_TEXT = Object.freeze({ small: 'Small', medium: 'Medium', large: 'Large' });

export function dungeonTier(loc) {
  if (!loc?.hasDungeon) return null;
  if (loc.superTier === true) return 'super';
  return loc.elite === true ? 'elite' : 'regular';
}

export function dungeonTierText(loc) {
  const t = dungeonTier(loc);
  return t ? DUNGEON_TIER_TEXT[t] : null;
}

export const tierShown = (online) => online === true;

export const tierPhrase = (label) => (label?.text ? `${label.text}${label.size ? `, ${label.size}` : ''}` : '');
