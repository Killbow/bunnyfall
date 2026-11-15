// Lets go of every held key and mouse button when the window loses focus or the page is hidden. The browser sends no
// key-up or mouse-up for a press released elsewhere, so walking or a swing would carry on.
import { MOUSE_CODES } from './input.js';

/** @param {Window} win @param {Set<string>} keys */
export function releaseHeldOnFocusLoss(win, keys) {
  const release = () => {
    for (const code of [...keys]) {
      const button = MOUSE_CODES.indexOf(code);
      win.dispatchEvent(button >= 0 ? new win.MouseEvent('mouseup', { button }) : new win.KeyboardEvent('keyup', { code }));
    }
  };
  win.addEventListener('blur', release);
  win.document?.addEventListener('visibilitychange', () => { if (win.document.visibilityState === 'hidden') release(); });
  return release;
}
