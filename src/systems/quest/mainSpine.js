// @ts-check
// S0000999 sends the main quest royal letters and starts each court's first quest, and only _BRISIEN starts it.
// A failed parse (such as faction data not loaded yet) would lose it, so the machine starts an owed backbone again.

import { contentOn } from '../../mods/contentOff.js';

export const SPINE = 'S0000999';
export const SPINE_OPENER = '_BRISIEN';
export const SPINE_CURSE = 'S0000977';
export const SPINE_CHECK_TICKS = 30;

const named = (q, name) => String(q?.questName ?? '').toUpperCase() === name;

/** @param {{ quests: Map<any, any>, questsToInvoke: any[] }} m @param {string} name */
export const questHeld = (m, name) => [...m.quests.values()].some((q) => named(q, name)) || m.questsToInvoke.some((q) => named(q, name));

/** @param {any} quest */
function openerStartedSpine(quest) {
  for (const task of quest?.tasks?.values?.() ?? []) {
    for (const a of task.actions ?? []) {
      if (a?.constructor?.typeName !== 'StartQuest' || !a.isComplete) continue;
      if (String(a.questName ?? '').toUpperCase() === SPINE || a.questIndex1 === 999) return true;
    }
  }
  return false;
}

// A saved Curse counts as a trace of the opener, since every new game starts it beside _BRISIEN.
/** @param {any} saved @param {string[]} names */
export function spineRecord(saved, names) {
  const has = (n) => names.some((x) => String(x ?? '').toUpperCase() === n);
  return { opened: saved?.opened === true || has(SPINE_OPENER) || has(SPINE_CURSE), ran: saved?.ran === true || has(SPINE),
    cursed: saved?.cursed === true || has(SPINE_CURSE) };
}

// A game with any main quest global set, such as a classic import, gets no letter.
/**
 * @param {{ quests: Map<any, any>, questsToInvoke: any[], storyStarted: Set<string>, globalVars?: Map<any, boolean>,
 *   spine: { opened: boolean, ran: boolean, cursed?: boolean } }} m
 * @returns {string[]}
 */
export function openersOwed(m) {
  const out = [];
  const held = (n) => questHeld(m, n);
  const classic = [...(m.globalVars?.values() ?? [])].some(Boolean);
  if (contentOn('mainQuest') && !m.spine.opened && !m.spine.ran && m.storyStarted.size === 0 && !classic && !held(SPINE_OPENER) && !held(SPINE)) out.push(SPINE_OPENER);
  if (contentOn('curseOfDaggerfall') && !m.spine.cursed && !held(SPINE_CURSE)) out.push(SPINE_CURSE);
  return out;
}

// A backbone that ran is never owed again, because a restart could send its letters twice.
// Classic globals are not read here, so a classic import with no opener is never owed one.
/**
 * @param {{ quests: Map<any, any>, questsToInvoke: any[], storyStarted: Set<string>, spine: { opened: boolean, ran: boolean } }} m
 */
export function spineOwed(m) {
  if (!contentOn('mainQuest')) return false;
  if (m.spine.ran || m.storyStarted.size > 0) return false;
  if (m.questsToInvoke.some((q) => named(q, SPINE))) return false;
  for (const q of m.quests.values()) if (named(q, SPINE_OPENER)) return openerStartedSpine(q);
  return m.spine.opened;
}
