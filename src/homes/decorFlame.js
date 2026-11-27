// @ts-check
// A TEXTURE.210 lantern hangs at the foot of its chain, so each flame height is a measured share of the picture.

export const DECOR_CHAIN_FLAME = Object.freeze(new Map([[22, 0.21], [24, 0.1], [25, 0.16], [26, 0.23], [27, 0.46]]));

export function decorFlameLift(/** @type {number} */ record, /** @type {number} */ h) {
  const k = DECOR_CHAIN_FLAME.get(record);
  return k == null || !(h > 0) ? null : h * k;
}
