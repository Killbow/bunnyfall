// Leaf module: the HUD imports these keys, so this file must not import the sea module.
export const BOAT_ACTIONS = Object.freeze({
  disembark: 'BoatDisembark', toggleLight: 'BoatToggleLight',
  toggleSail: 'BoatToggleSail', trimRight: 'BoatTrimRight', trimLeft: 'BoatTrimLeft', trimModifier: 'BoatTrimModifier',
  timeScaleUp: 'BoatTimeScaleUp', timeScaleDown: 'BoatTimeScaleDown', timeScaleReset: 'BoatTimeScaleReset',
  sailUp: 'BoatSailUp', sailDown: 'BoatSailDown',
});
