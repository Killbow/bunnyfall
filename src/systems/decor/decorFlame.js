// @ts-check
// CHAIN-FLAME (2026-10-30, the owner: "a lamp on a chain gives light from its flame"): WHERE A HANGING LANTERN'S FLAME
// IS. TEXTURE.210's lanterns on a chain (24 long, 25 medium, 26 short) are a chain with the lantern at its foot, so their
// light belongs near the picture's bottom, not its middle or its top. Measured as a share of the picture's height, so a
// piece made bigger or smaller keeps its light in its flame.

/** record -> how far up the picture its flame is, as a share of its height. */
export const DECOR_CHAIN_FLAME = Object.freeze(new Map([[24, 0.1], [25, 0.17], [26, 0.25]]));

/** How far above a lantern-on-a-chain's foot its flame is, for a picture `h` high; null for any other record. */
export function decorFlameLift(/** @type {number} */ record, /** @type {number} */ h) {
  const k = DECOR_CHAIN_FLAME.get(record);
  return k == null || !(h > 0) ? null : h * k;
}
