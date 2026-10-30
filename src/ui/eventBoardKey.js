// @ts-check
// EVENT-BOARD-KEY (2026-10-30, a player: "The world event panel is a bit obtrusive at the moment. It'd be nice to be able
// to toggle it"): THE KEY THAT SHOWS OR HIDES THE EVENT BOARD. One press flips the player's own switch (the Event board
// row's, prefs `eventBoard`), the same one the settings drawer shows, so the two never disagree. Hidden, the board's lines
// go where they went before it (systems/eventNotices.js: the chat, or the HUD's line), and one line says how to bring it
// back. Rebindable like every action (Controls, the Windows group); Equal by default.
//
// Installed by ui/eventBoard.js drawEventBoard, before it asks whether the board stands - so the key that brings the
// board back is live while the board is away.

import { eventActions, isTextEntryTarget, hostPaused } from './input.js';
import { actionKeyWord } from './quickslotTags.js';
import { eventBoardOn, EVENT_BOARD_PREF } from '../systems/eventNotices.js';
import { getPref, setPref } from '../systems/uiPrefs.js';
import { hudText } from '../systems/notify.js';
import { t } from '../systems/textManager.js';

export const EVENT_BOARD_ACTION = 'EventBoard';

/** Flips the switch and says so. Answers whether the board was turned on. */
export function toggleEventBoard() {
  const turnOn = getPref(EVENT_BOARD_PREF) === false;
  setPref(EVENT_BOARD_PREF, turnOn);
  if (turnOn) {
    // under Enhanced Plus the HUD editor can also put the piece away - the switch alone does not bring it back
    hudText(eventBoardOn() ? t('eventBoard.shown', 'Event board shown.') : t('eventBoard.awayInEditor', 'The event board is put away in the HUD editor.'));
  } else {
    hudText(t('eventBoard.hidden', 'Event board hidden. Press {key} to show it again.', { key: actionKeyWord(EVENT_BOARD_ACTION) || '=' }));
  }
  return turnOn;
}

let installed = false;
/** Listens for the key, once. */
export function installEventBoardKey(win = globalThis.window) {
  if (installed || !win?.addEventListener) return;
  installed = true;
  win.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => {
    if (e.repeat || e.metaKey || isTextEntryTarget(e.target)) return;
    if (hostPaused() === true) return;   // a window is up: its keys are its own
    if (!eventActions(e).includes(EVENT_BOARD_ACTION)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    toggleEventBoard();
  }, true);
}
