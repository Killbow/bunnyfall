
import { TRANSPORT_HORSE_TEMPLATE, hasCart, hasHorse } from '../items/inventorySession.js';

export const TRANSPORT_MODES = Object.freeze({ Foot: 'Foot', Horse: 'Horse', Cart: 'Cart', Ship: 'Ship' });

export const DF_RIDE_BASE = 375;
export const DF_CART_BASE = 250;

export const HORSE_ITEM_INDEXES = Object.freeze([TRANSPORT_HORSE_TEMPLATE]);

export { hasCart, hasHorse };

export const isOnFoot = (mode) => mode === TRANSPORT_MODES.Foot;
export const isRiding = (mode) => mode === TRANSPORT_MODES.Horse || mode === TRANSPORT_MODES.Cart;

/** @returns {string} */
export function toggleMount(mode, items = []) {
  if (isRiding(mode)) return TRANSPORT_MODES.Foot;
  if (hasHorse(items)) return TRANSPORT_MODES.Horse;
  if (hasCart(items)) return TRANSPORT_MODES.Cart;
  return mode;
}

export const rideBaseFor = (mode) => (mode === TRANSPORT_MODES.Cart ? DF_CART_BASE : DF_RIDE_BASE);

let _canRun = null;
export function setCanRunOverride(fn) { _canRun = typeof fn === 'function' ? fn : null; }
// Horse care has the final word on a gallop, after the mod's `CanRun` override, so a winded or starving horse never
// gallops.
let _gallop = null;
export function setGallopGate(fn) { _gallop = typeof fn === 'function' ? fn : null; }
export const canRunUnlessRiding = (mode) => {
  const mods = _canRun?.(mode) ?? null;
  return _gallop?.(mode, mods) ?? mods ?? !isRiding(mode);
};
// `runAsked` matters because the Boons tier rides a refused gallop at the DFU pace, while the Hard tier holds the
// horse to a walk.
let _walk = null;
export function setRideWalk(fn) { _walk = typeof fn === 'function' ? fn : null; }
export const rideWalks = (mode, runAsked = false) => isRiding(mode) && _walk?.(mode, !!runAsked) === true;

// Leaving an interior does not remount, as in DFU, so the player walks out on foot.
export const dismountOnTransition = (mode, transition) =>
  (transition === 'ToBuildingInterior' || transition === 'ToDungeonInterior' ? TRANSPORT_MODES.Foot : mode);
