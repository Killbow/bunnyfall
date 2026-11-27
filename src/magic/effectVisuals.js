// @ts-check
// These bits travel in the pose `ef` field. net/wire.js accepts up to 63, so a new bit needs a wire change.

export const FX_FIRE = 1, FX_FROST = 2, FX_SHOCK = 4, FX_POISON = 8, FX_BUBBLE = 16, FX_MAGIC = 32;
export const FX_ALL = 63;

// Indexed by spell element: 0 fire, 1 frost, 2 poison, 3 shock, and 4 magic.
const ELEMENT_BIT = [FX_FIRE, FX_FROST, FX_POISON, FX_SHOCK, FX_MAGIC];

export function effectVfxBits(entity) {
  const list = entity?.activeEffects;
  if (!list?.length) return 0;
  let bits = 0;
  for (const a of list) {
    if (!a || a.ended) continue;
    if (a.kind === 'continuousDamage') bits |= ELEMENT_BIT[a.element | 0] ?? FX_MAGIC;
    else if (a.kind === 'poison' && a.state !== 'waiting') bits |= FX_POISON;
    else if (a.kind === 'waterBreathing') bits |= FX_BUBBLE;
  }
  return bits;
}
