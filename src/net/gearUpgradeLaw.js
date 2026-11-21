// Fixed Imperial Argent surcharge for each online upgrade.
const prices = Object.freeze({
  reforge: Object.freeze({ magic: 30, rare: 70, exalted: 150 }),
  hone: Object.freeze({ magic: 20, rare: 50, exalted: 100 }),
  imbue: Object.freeze({ magic: 40, rare: 100 }),
});

export function upgradeArgents(service, tier) {
  return typeof service === 'string' && typeof tier === 'string'
    && Object.hasOwn(prices, service) && Object.hasOwn(prices[service], tier)
    ? prices[service][tier] : null;
}
