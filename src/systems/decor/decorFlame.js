// @ts-check
// CHAIN-FLAME (2026-10-30, the owner: "a lamp on a chain gives light from its flame"): WHERE A HANGING LANTERN'S FLAME
// IS. TEXTURE.210's lanterns on a chain (24 long, 25 medium, 26 short) are a chain with the lantern at its foot, so their
// light belongs near the picture's bottom, not its middle or its top. Measured as a share of the picture's height, so a
// piece made bigger or smaller keeps its light in its flame.

/** record -> how far up the picture its flame is, as a share of its height. */
// Measured from the game's own TEXTURE.210 (2026-10-30, the owner's files): the middle of each picture's lit glass, as a
// share of its height from the foot - the round lantern (22) hangs on a chain too, and the plain lantern (27) from a hook.
export const DECOR_CHAIN_FLAME = Object.freeze(new Map([[22, 0.21], [24, 0.1], [25, 0.16], [26, 0.23], [27, 0.46]]));

/** How far above a lantern-on-a-chain's foot its flame is, for a picture `h` high; null for any other record. */
export function decorFlameLift(/** @type {number} */ record, /** @type {number} */ h) {
  const k = DECOR_CHAIN_FLAME.get(record);
  return k == null || !(h > 0) ? null : h * k;
}
