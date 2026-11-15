// @ts-check

// When the in-game POI editor opens (`/play/?editor`): once the player stands in the world. A character still being
// made, the one-time name picker, or a window over the world (the first message of a new character) keeps it waiting;
// it asks again every half second. In a mode with no walking body (`?shot` without `&play`, `&fly`) it does not wait for
// a body. A wait that goes on (a `?class=N` whose class could not be read leaves no character to make) is said on
// screen once. Not a DFU member.

import { needsNames } from '../systems/names.js';
import { t } from '../systems/textManager.js';

/** How long the door waits before it says on screen why the editor is not open yet, in milliseconds. */
export const POI_EDITOR_DOOR_TELL_MS = 15_000;

/**
 * Calls `open` once, when the character is made, has its names, and `standing()` holds. Answers a stop.
 * @param {{ entity: () => any, standing: () => boolean, open: () => void, say?: (line: string) => void, every?: number,
 *   tellAfter?: number, timer?: { setTimeout: (fn: () => void, ms: number) => any, clearTimeout: (id: any) => void } }} o
 */
export function openPoiEditorWhenStanding({ entity, standing, open, say = () => {}, every = 500, tellAfter = POI_EDITOR_DOOR_TELL_MS, timer = globalThis }) {
  let id = null, stopped = false, waited = 0, told = false;
  const ready = () => { const e = entity(); return !!e?.chargenDone && !needsNames(e) && standing(); };
  const tick = () => {
    id = null;
    if (stopped) return;
    if (ready()) { stopped = true; open(); return; }
    waited += every;
    if (!told && waited >= tellAfter) { told = true; say(t('poi.editor.waitingToOpen', 'The POI editor opens once your character is made and stands in the world.')); }
    id = timer.setTimeout(tick, every);
  };
  tick();
  return () => { stopped = true; if (id != null) timer.clearTimeout(id); id = null; };
}
