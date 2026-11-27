// Morrowind arm spell hand: with a spell readied, the left arm takes the Spell stance idle and the right keeps
// the weapon stance. While casting, the body plays the spellcast group and the right arm takes the weapon idle.

export const SPELL_HAND_ARM = Object.freeze({ spell: 'L', weapon: 'R' });

export function createHeldClips({ pick, step, sampleTrack }) {
  const memo = new WeakMap();
  return {
    clip(r, group, dt = 0) {
      if (!r || !r.sources || !group) return null;
      let m = memo.get(r);
      if (!m) { m = new Map(); memo.set(r, m); }
      if (!m.has(group)) m.set(group, pick(r, group));
      const p = m.get(group);
      if (!p) return null;
      if (dt > 0) step(p.state, p.source.keys, dt);
      return { tracks: p.source.trackMap, sampleTrack, time: p.state.time };
    },
  };
}

/** @param {{ casting?: boolean, ready?: boolean, weaponIdle?: object | null, spellIdle?: object | null }} s */
export function spellHandLimbs({ casting = false, ready = false, weaponIdle = null, spellIdle = null } = {}) {
  if (casting) return weaponIdle ? { limbs: { [SPELL_HAND_ARM.weapon]: { clip: weaponIdle, side: SPELL_HAND_ARM.weapon, mirror: false } }, key: 'spellhand:cast' } : null;
  if (ready) return spellIdle ? { limbs: { [SPELL_HAND_ARM.spell]: { clip: spellIdle, side: SPELL_HAND_ARM.spell, mirror: false } }, key: 'spellhand:ready' } : null;
  return null;
}

// Waits through an equip or unequip, so a stance flip never skips the unequip detach key.
/**
 * @param {{ upper: number, spellReady: boolean }} s
 * @param {{ Equipping: number, Unequipping: number, Casting: number }} U
 * @returns {'wait' | 'afterCast' | 'drop' | 'keep'}
 */
export function spellHandStanceStep({ upper, spellReady }, U) {
  if (upper === U.Equipping || upper === U.Unequipping) return 'wait';
  if (upper === U.Casting) return 'afterCast';
  return spellReady ? 'drop' : 'keep';
}

// The Spell stance is let go before the draw starts, so a weapon draw never plays the spellcast group's equip.
export const drawsIntoSpellHand = ({ spellHand = false, spellReady = false, casting = false } = {}) => !!spellHand && !!spellReady && !casting;
