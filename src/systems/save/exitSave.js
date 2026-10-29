// @ts-check
// BUNNYFALL SAVE-ON-EXIT: playing offline, leaving the game (the pause menu's Exit, closing the tab or the desktop app)
// writes the character to its own AutoSave slot. QuickSave and the saves the player named are never touched offline, so
// an older save stays a way back. Online play keeps its own exit save (scenes/world.js exitAutosave, every slot) and a
// realm character its checkpoint. Never while dead or on a death screen, as DFU never saves a death.
import { QUICK_SAVE_NAME } from './saveSlots.js';

/** The slot an offline exit writes. */
export const EXIT_SAVE_NAME = 'AutoSave';

/** The slots an offline exit writes for this character now: AutoSave, or none while dead. */
export function offlineExitSaveNames(entity, { deathUp = false } = {}) {
  if (deathUp || !(entity?.health > 0)) return [];
  return EXIT_SAVE_NAME === QUICK_SAVE_NAME ? [] : [EXIT_SAVE_NAME];
}

/** The offline exit save, as the world host asks it: each slot written quietly through `save(name, opts)`, a failure
 *  logged and never thrown (the game is closing). Kept here so the host only wires it (HOST-SPLIT). */
export function offlineExitSave(entity, deathUp, save) {
  for (const saveName of offlineExitSaveNames(entity, { deathUp })) {
    try { save(saveName, { quiet: true }); } catch (e) { console.error('[save] exit save failed', e); }
  }
}
