import { ownsShip, shipCoords } from '../../trade/banking.js';
import { TRANSPORT_MODES } from '../../travel/transport.js';

export const REPOSITION = Object.freeze({
  None: 'None',
  RandomStartMarker: 'RandomStartMarker',
  DirectionFromStartMarker: 'DirectionFromStartMarker',
});

let _shipAvailable = null;
export function setShipAvailable(fn) { _shipAvailable = typeof fn === 'function' ? fn : null; }
export function isShipAvailable({ canSail = false, ownsShip = false, onShip = false, locationLoaded = false, portTown = null } = {}) {
  if (!canSail) return false;
  const o = _shipAvailable?.({ onShip, locationLoaded, portTown, ownsShip });
  return o ?? ownsShip;
}

// As in classic Daggerfall, a player who boards, saves, and loads elsewhere is off the ship,
// so boarding again replaces the memory.
export function isOnShip(player, boardShipPosition, mapPixel) {
  const coords = shipCoords(player);
  return !!boardShipPosition && !!coords && !!mapPixel
    && mapPixel.x === coords.x && mapPixel.y === coords.y;
}

/**
 * @returns {{go:{x:number,y:number}, reposition:string,
 *            boardShipPosition:object|null, mode:string}|null}
 */
export function shipTransition(player, { boardShipPosition = null, mapPixel = null, position = null } = {}) {
  const coords = shipCoords(player);
  // Classic Daggerfall throws here with no ship; the picker disables the row, so this returns null.
  if (!ownsShip(player) || !coords) return null;
  // Ship is not a travel mode: it teleports to the ship or back to the saved spot, and the mode returns to Foot.
  if (isOnShip(player, boardShipPosition, mapPixel)) {
    return {
      go: { x: boardShipPosition.mapPixel.x, y: boardShipPosition.mapPixel.y },
      reposition: REPOSITION.None,
      restore: boardShipPosition,
      boardShipPosition: null,
      mode: TRANSPORT_MODES.Foot,
    };
  }
  return {
    go: { x: coords.x, y: coords.y },
    reposition: REPOSITION.RandomStartMarker,
    restore: null,
    boardShipPosition: position,
    mode: TRANSPORT_MODES.Foot,
  };
}

// The memory stores height without the streamer's vertical compensation, so a recenter or reload keeps the spot.
export function shipMemory(position, compensationY) {
  const p = position.pos;
  return { ...position, pos: [p[0], p[1] - compensationY, p[2]], compensationFree: true };
}

export function shipRestorePos(restore, compensationY) {
  // A memory saved without the flag cannot recover its height, so the host grounds that arrival.
  if (!restore?.compensationFree) return null;
  const p = restore.pos;
  return [p[0], p[1] + compensationY, p[2]];
}
