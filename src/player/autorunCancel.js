// BUNNYFALL: pressing forward takes the walk back. DFU's autorun latch only lets go on MoveBackwards or a second press
// of the binding, so a player who grabs W to steer was left walking on after letting go. A fresh press of the forward key
// (not a key already held when the latch was set) drops the latch; strafing keeps it, so a curve under autorun still works.
let prevForward = false;

/** Call once per frame before the move axes read the latch. `mv` is `moveHeld(keys)`, `player` carries `toggleAutorun`. */
export function autorunCancel(mv, player) {
  const now = !!mv?.forwards;
  const pressed = now && !prevForward;
  prevForward = now;
  if (pressed && player?.toggleAutorun) player.toggleAutorun = false;
}
