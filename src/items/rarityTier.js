// Leaf module so combat and enchantment code can test rarity tiers without importing the loot rarity ladder.

export const ROLLED_TIERS = Object.freeze(['magic', 'rare', 'legendary']);

export const rolledTier = (item) => ROLLED_TIERS.includes(item?.rarity);

// Pieces with a stamped tier keep existing when they break instead of fading.
export const stampedTier = (item) => rolledTier(item) || item?.rarity === 'aetheric' || item?.rarity === 'gilded';
