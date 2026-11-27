// Port of PlayerGPS climate and location-rect change events.

const _listeners = [];
let _climate, _inRect;
const start = () => { _climate = 0; _inRect = false; };
start();

export function onPlayerGpsEvents(listener) {
  if (!listener || typeof listener !== 'object') throw new Error('onPlayerGpsEvents: { climateIndexChanged, enterLocationRect, exitLocationRect }');
  _listeners.push(listener);
}

export function readPlayerGps({ climateIndex, inLocationRect }) {
  if (Number.isInteger(climateIndex) && climateIndex !== _climate) {
    _climate = climateIndex;
    for (const l of _listeners) l.climateIndexChanged?.(_climate);
  }
  if (typeof inLocationRect !== 'boolean' || inLocationRect === _inRect) return;
  _inRect = inLocationRect;
  for (const l of _listeners) (_inRect ? l.enterLocationRect : l.exitLocationRect)?.(_climate);
}

const RESET_ON = new Set(['load', 'travel']);

export function resetPlayerGpsState(jump) { if (RESET_ON.has(jump)) _inRect = false; }

export function _resetPlayerGps() { _listeners.length = 0; start(); }
