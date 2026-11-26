// @ts-check


import { needsNames } from '../characters/names.js';
import { t } from '../ui/textManager.js';

export const POI_EDITOR_DOOR_TELL_MS = 15_000;

/** @param {{ entity: () => any, standing: () => boolean, open: () => void, say?: (line: string) => void, every?: number,
 *   tellAfter?: number, timer?: { setTimeout: (fn: () => void, ms: number) => any, clearTimeout: (id: any) => void } }} o */
export function openPoiEditorWhenStanding({ entity, standing, open, say = () => {}, every = 500, tellAfter = POI_EDITOR_DOOR_TELL_MS, timer = globalThis }) {
  let id = null, stopped = false, waited = 0, told = false;
  const ready = () => { const e = entity(); return !!e?.chargenDone && !needsNames(e) && standing(); };
  const tick = () => {
    id = null;
    if (stopped) return;
    if (ready()) { stopped = true; open(); return; }
    waited += every;
    if (!told && waited >= tellAfter) { told = true; say(t('poi.editor.waitingToOpen', 'The POI editor will open once your character is created and in the world.')); }
    id = timer.setTimeout(tick, every);
  };
  tick();
  return () => { stopped = true; if (id != null) timer.clearTimeout(id); id = null; };
}
