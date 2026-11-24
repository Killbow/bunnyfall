// Lets go of every held key and mouse button when the window loses focus or the page is hidden. The browser sends no
// key-up or mouse-up for a press released elsewhere, so walking or a swing would carry on.
import { MOUSE_CODES, isSwingButton, swingKeyHeld } from './input.js';

/**
 * Clears the hold before the release, so the release fires nothing.
 * @param {{ playerWeapon: { cancelHold: () => void }, attackInput: (dx: number, dy: number, held: boolean) => void }} rig
 * @param {{ cancelAim: () => void } | null | undefined} guns
 */
export function cancelHeldSwing(rig, guns) {
  rig.playerWeapon.cancelHold();
  rig.attackInput(0, 0, false);
  guns?.cancelAim();
}

/** @param {Set<string>} keys */
function swingInputHeld(keys) {
  for (const code of keys) {
    const button = MOUSE_CODES.indexOf(code);
    if (button >= 0 && isSwingButton(button)) return true;
  }
  return swingKeyHeld(keys);
}

/**
 * Puts down a held swing or drawn bow on each rig given, and the ship's aimed guns, when a swing button or key is held.
 * @param {Set<string>} keys
 * @param {Array<Parameters<typeof cancelHeldSwing>[0] | null | undefined>} rigs
 * @param {{ cancelAim: () => void } | null | undefined} guns
 */
export function cancelHeldAttacks(keys, rigs, guns) {
  if (!swingInputHeld(keys)) return;
  for (const rig of rigs) if (rig) cancelHeldSwing(rig, null);
  guns?.cancelAim();
}

/**
 * Runs `cancel` while the keys still read held. Then each held key gets a key-up and each held button a mouse-up, so
 * every listener lets go as on a real release.
 * @param {Window} win
 * @param {Set<string>} keys
 * @param {() => void} cancel
 */
export function releaseHeldOnFocusLoss(win, keys, cancel) {
  const release = () => {
    if (!keys.size) return;
    cancel();
    for (const code of [...keys]) {
      const button = MOUSE_CODES.indexOf(code);
      win.dispatchEvent(button >= 0 ? new win.MouseEvent('mouseup', { button }) : new win.KeyboardEvent('keyup', { code }));
    }
  };
  win.addEventListener('blur', release);
  win.document?.addEventListener('visibilitychange', () => { if (win.document.visibilityState === 'hidden') release(); });
  return release;
}
