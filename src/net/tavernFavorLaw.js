// @ts-check
export const FAVOR_OFFERS = Object.freeze([
  { id: 'legendary', kind: 'item', name: 'Random Legendary', price: 25 },
  { id: 'barmaster', kind: 'title', name: 'Bar Master', price: 100 },
  { id: 'legendarybartender', kind: 'title', name: 'Legendary Bartender', price: 500 },
  { id: 'shards', kind: 'item', name: '5 Welkynd Shards', price: 10 },
  { id: 'stamina', kind: 'item', name: '3 Stamina Potions', price: 5 },
  { id: 'magicka', kind: 'item', name: '3 Restore Power Potions', price: 5 },
]);
/** Gold multiplier for the College's ten ranks, Busker (0) through Archbard (9). */
export const BARD_RANK_SHARE = 0.15;
export const bardGoldMultiplier = (rank) => 1 + BARD_RANK_SHARE * Math.max(0, Math.min(9, Math.trunc(Number(rank)) || 0));
export const songFavor = (seconds) => Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds / 60)) : 0;
/** Saved alongside guild membership; city goodwill is separate for each city. */
export function tavernProgressOf(raw) {
  return { favor: Number.isSafeInteger(raw?.favor) && raw.favor >= 0 ? raw.favor : 0,
    cities: Object.fromEntries(Object.entries(raw?.cities ?? {}).filter(([k, v]) => k.length < 100 && Number.isSafeInteger(v) && Number(v) >= 0)) };
}
/** Both the live character and the realm save use this award. */
export function tavernReputation(entity, progress, region, city, amount = 1) {
  if (!Number.isInteger(region) || region < 0 || region >= 62 || !city || amount <= 0) return;
  entity.legalRep ??= {};
  entity.legalRep[region] = Math.min(100, (Number(entity.legalRep[region]) || 0) + amount);
  progress.cities[city] = Math.min(100, (Number(progress.cities[city]) || 0) + amount);
}
