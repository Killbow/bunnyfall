// DFU's EntityEffectBroker.SyntheticTimeIncrease flag. After a prison term, fast travel, or the vampirism
// fortnight, ItemDeteriorates, HealthLeech, and CastWhenHeld skip the catch-up window, so worn items survive it.
// A leaf with no imports, because worldTick.js imports the enchantment pump, which must stay off that cycle.

let _synthetic = false;
let _claimed = false;

// A raise always re-arms, so a second jump before the first was claimed shields the window that finally runs.
export function setSyntheticTimeIncrease(v = true) {
  _synthetic = !!v;
  _claimed = false;
  return _synthetic;
}

export const syntheticTimeIncrease = () => _synthetic;

// Enemy pools run the same window after the player, so DFU's lowering at the end of the update is deferred to the
// next claim instead, which no host can forget.
/** @returns {boolean} */
export function claimSyntheticTimeIncrease() {
  if (_claimed) { _synthetic = false; _claimed = false; }
  if (_synthetic) _claimed = true;
  return _synthetic;
}

// DFU never saves the flag, so a load starts fresh.
export function resetSyntheticTimeIncrease() {
  _synthetic = false;
  _claimed = false;
}
