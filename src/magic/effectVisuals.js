// @ts-check
// BUNNYFALL SPELL VISUALS: what a body's lasting effects look like, as bits - the one source for the draw
// (render/effectMotes.js) and the pose's `ef` (net/wire.js validPose), so a peer burns for everyone as it burns here.

export const FX_FIRE = 1, FX_FROST = 2, FX_SHOCK = 4, FX_POISON = 8, FX_BUBBLE = 16, FX_MAGIC = 32;
export const FX_ALL = 63;

/** A continuous damage spell's element (spell.element: 0 fire, 1 frost, 2 poison, 3 shock, 4 magic) as its bit. */
const ELEMENT_BIT = [FX_FIRE, FX_FROST, FX_POISON, FX_SHOCK, FX_MAGIC];

/** The visible effects on `entity` now: continuous damage by element, poison, Water Breathing. 0 for none. */
export function effectVfxBits(entity) {
  const list = entity?.activeEffects;
  if (!list?.length) return 0;
  let bits = 0;
  for (const a of list) {
    if (!a || a.ended) continue;
    if (a.kind === 'continuousDamage') bits |= ELEMENT_BIT[a.element | 0] ?? FX_MAGIC;
    else if (a.kind === 'poison' && a.state !== 'waiting') bits |= FX_POISON;   // once it has started to work
    else if (a.kind === 'waterBreathing') bits |= FX_BUBBLE;
  }
  return bits;
}
