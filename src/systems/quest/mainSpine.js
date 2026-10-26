// @ts-check
// MAIN-SPINE (2026-10-26, Discord #feature-feedback "Main quest borked" - Blu3cak3: "Level 8 and still no letter from
// Morgiah ... Other people having issues too"; bible/01-Overview/bugs/Field-Bugs-2026-10-26b.md): THE MAIN QUEST'S
// BACKBONE IS KEPT. S0000999 ("Main Quest Backbone") sends every royal letter of the opening - Morgiah's at level 3
// (`_S.46_ when _S.11_ and _S.18_`), Lhotun's at 5 - and starts each court's first quest. Nothing else starts it: the
// main quest's opener, _BRISIEN, does once, `start quest 999 999` in its `until _exitstarter_ performed` block, on the
// game's second tick (vendor/dfu-quests/Quests/_BRISIEN.txt).
//
// WHAT WENT WRONG. Parsing S0000999 reads seven royals' faction records (WhenNpcIsAvailable, WhenReputeWith ->
// person.js getFactionDataOrThrow), and the world host answers them from townTalk's FACTION.TXT, read fire-and-forget at
// boot (world.js `_questStore`). An online character's birth saves and reloads the page between the opener's first tick
// and its second (realmBirth), so the reloaded page's first quest tick parsed the backbone - and when FACTION.TXT had not
// landed yet, the parse threw "Could not find faction data for FactionID 382", `start quest` swallowed it as
// QuestMachine.StartQuest/ParseQuest do (machine.js scheduleQuestByName), StartQuest marked itself done, and nothing ever
// started the backbone again: Brisienna's letter came (its timer is in the same block), no royal letter ever did.
// Measured with the real bridge and FACTION.TXT, either order of meeting Brisienna and reaching level 3.
//
// THE LAW NOW, a departure from StartQuest.cs's one try: A LOST BACKBONE IS STARTED AGAIN (spineOwed, machine.js
// keepSpine). A game whose opener has run its `start quest 999 999` (or met Brisienna - MetLadyBrisienna) with no
// S0000999 standing (running, ended, or scheduled) and no step of the story begun is owed it: a backbone that ever ran
// starts the courts' quests, so none begun is a backbone that never ran, and every letter it sends is still owed. Checked
// every SPINE_CHECK_TICKS - a parse that fails again (the records still away) is asked again at the next check, and a
// character who lost theirs before this law gets it back on their next session. A save from before the story was
// recorded (storyLegacy) is left as it is: its story's steps are not known.
import { globalVarsTable } from './tables.js';

/** The backbone, and the quest that starts it. */
export const SPINE = 'S0000999';
export const SPINE_OPENER = '_BRISIEN';
/** Quest ticks between the checks. */
export const SPINE_CHECK_TICKS = 30;

const named = (q, name) => String(q?.questName ?? '').toUpperCase() === name;
/** A global's id by its table name (Quests-GlobalVars), or -1. @param {string} name */
const globalId = (name) => { try { const t = globalVarsTable(); return t.hasValue(name) ? parseInt(t.getValue('id', name)) : -1; } catch { return -1; } };

/** Whether the opener has run its backbone start: its StartQuest of S0000999 done. @param {any} quest */
function openerStartedSpine(quest) {
  for (const task of quest?.tasks?.values?.() ?? []) {
    for (const a of task.actions ?? []) {
      if (a?.constructor?.typeName !== 'StartQuest' || !a.isComplete) continue;
      if (String(a.questName ?? '').toUpperCase() === SPINE || a.questIndex1 === 999) return true;
    }
  }
  return false;
}

/**
 * Whether this machine's game is owed its backbone: none standing (running, tombstoned or scheduled), the opener's start
 * of it done (or Brisienna met), no story step begun, and a story record of its own (not a legacy save's).
 * @param {{ quests: Map<any, any>, questsToInvoke: any[], globalVars: Map<number, boolean>, storyStarted: Set<string>, storyLegacy?: boolean }} m
 */
export function spineOwed(m) {
  if (m.storyLegacy || m.storyStarted.size > 0) return false;
  for (const q of m.quests.values()) if (named(q, SPINE)) return false;
  if (m.questsToInvoke.some((q) => named(q, SPINE))) return false;
  const met = globalId('MetLadyBrisienna');
  if (met >= 0 && m.globalVars.get(met)) return true;
  for (const q of m.quests.values()) if (named(q, SPINE_OPENER) && openerStartedSpine(q)) return true;
  return false;
}
