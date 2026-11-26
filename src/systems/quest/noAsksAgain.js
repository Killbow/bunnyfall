// @ts-check
// A prompt answered No that leads nowhere asks again on the next click, so a stray No cannot soft-lock a quest.
// This covers a click asking whose No is inert, clears that asking, or gives back the toted item.
// Quest.update runs it every tick, and Quest.restoreSaveData runs it after every restore.
import { TaskType } from './task.js';
import { getInnerSymbolName } from './symbol.js';
import { QL_STAMP } from '../questlines/qlState.js';
import { sheetFor } from '../questlines/qlSheets.js';

export const CLICK_TRIGGERS = Object.freeze(['ClickedNpc', 'ClickedItem', 'ClickedFoe', 'TotingItemAndClickedNpc']);

/** @param {any} action @returns {string[]} */
export function namesOf(action) {
  const names = [];
  for (const [field, kind = 'raw'] of action?.saveShape ?? []) {
    const v = action[field];
    if (kind === 'sym') { if (v?.name) names.push(v.name); }
    else if (kind === 'symArray') { for (const s of v ?? []) if (s?.name) names.push(s.name); }
  }
  if (action?.typeName === 'WhenTask') for (const e of action.evaluations ?? []) names.push(getInnerSymbolName(e.task));
  return names;
}

/** @param {any} quest @param {string} name */
function timesNamed(quest, name) {
  let n = 0;
  for (const r of quest.resources.values()) if (r.symbol?.name === name) n++;
  for (const task of quest.tasks.values()) {
    if (task.type === TaskType.PersistUntil && task.targetSymbol?.name === name) n++;
    for (const action of task.actions) for (const x of namesOf(action)) if (x === name) n++;
  }
  return n;
}

/** @param {any} quest @param {any} prompt */
export function inertNo(quest, prompt) {
  const no = quest.getTask(prompt.noTaskSymbol);
  if (!no || no.type !== TaskType.Variable) return null;
  if (no.actions.length > 0) return null;
  return timesNamed(quest, no.symbol.name) === 1 ? no : null;
}

/**
 * @param {any} quest
 * @param {any} task
 * @param {any} prompt
 */
export function clearingNo(quest, task, prompt) {
  const no = quest.getTask(prompt.noTaskSymbol);
  if (!no || no === task || no.type !== TaskType.Standard || no.pendingActionLines?.length) return null;
  if (!no.actions.length || !no.actions.every((/** @type {any} */ a) => a.typeName === 'ClearTask' && a.taskSymbols?.length
    && a.taskSymbols.every((/** @type {any} */ s) => s?.name === task.symbol.name))) return null;
  return timesNamed(quest, no.symbol.name) === 1 ? no : null;
}

/**
 * @param {any} quest
 * @param {any} task
 * @param {any} prompt
 */
export function givesBackNo(quest, task, prompt) {
  const no = quest.getTask(prompt.noTaskSymbol);
  if (!no || no === task || no.type !== TaskType.Standard || no.pendingActionLines?.length || !no.actions.length) return null;
  const toted = new Set(task.actions.filter((/** @type {any} */ a) => a.typeName === 'TotingItemAndClickedNpc').map((/** @type {any} */ a) => a.itemSymbol?.name));
  if (!no.actions.every((/** @type {any} */ a) => a.typeName === 'GetItem' && toted.has(a.itemSymbol?.name))) return null;
  // A No the questlines sheet reads is a player choice, not a soft-lock, so it never asks again.
  if (sheetReadTasks(quest).has(no.symbol.name)) return null;
  return timesNamed(quest, no.symbol.name) === 1 ? no : null;
}

/** @param {any} quest @returns {Set<string>} */
export function sheetReadTasks(quest) {
  const out = new Set();
  if (quest?.ql?.stamp !== QL_STAMP) return out;
  const sheet = sheetFor(quest.questName);
  if (!sheet) return out;
  const walk = (/** @type {any} */ b) => {
    if (!b || typeof b !== 'object') return;
    for (const k of ['all', 'any']) if (Array.isArray(b[k])) for (const x of b[k]) walk(x);
    if (b.not) walk(b.not);
    if (b.task != null) out.add(getInnerSymbolName(String(b.task)));
  };
  for (const o of sheet.objectives ?? []) { walk(o.open); walk(o.done); walk(o.fail); }
  for (const o of sheet.outcomes ?? []) walk(o.on);
  for (const b of sheet.branches ?? []) for (const c of b.choices ?? []) if (c?.sets) out.add(getInnerSymbolName(String(c.sets)));
  return out;
}

// Only a click asking qualifies: a re-armed demand on an injured trigger would ask again every tick.
/**
 * @param {any} quest
 * @param {any} task
 * @param {number} [named]
 */
export function asksOnAClick(quest, task, named = 0) {
  // A global task is shared by every quest, so only a plain task qualifies.
  if (task.type !== TaskType.Standard) return false;
  const triggers = task.actions.filter((/** @type {any} */ a) => a.isTriggerCondition);
  if (!triggers.length || !triggers.every((/** @type {any} */ a) => CLICK_TRIGGERS.includes(a.typeName))) return false;
  return timesNamed(quest, task.symbol.name) === named;
}

// Verdicts are cached per action object; a restore creates new action objects.
const verdicts = new WeakMap();
/** @param {any} quest @param {any} task @param {any} prompt */
function lawFor(quest, task, prompt) {
  if (!verdicts.has(prompt)) {
    const onClick = asksOnAClick(quest, task);
    const inert = onClick ? inertNo(quest, prompt) : null;
    const clearer = inert ? null : clearingNo(quest, task, prompt);
    const clears = clearer && asksOnAClick(quest, task, clearer.actions.reduce((n, /** @type {any} */ a) => n + a.taskSymbols.length, 0)) ? clearer : null;
    const gives = !inert && !clears && onClick ? givesBackNo(quest, task, prompt) : null;
    verdicts.set(prompt, inert ? { no: inert, clears: false } : clears ? { no: clears, clears: true } : gives ? { no: gives, clears: false, gives: true } : null);
  }
  return verdicts.get(prompt);
}

/** @param {any} quest */
export function promptsThatAskAgain(quest) {
  const out = [];
  for (const task of quest.tasks.values()) {
    for (const prompt of task.actions) {
      if (prompt.typeName !== 'Prompt') continue;
      const law = lawFor(quest, task, prompt);
      if (law) out.push({ task, prompt, no: law.no, clears: law.clears });
    }
  }
  return out;
}

/** @param {any} quest */
export function askAgain(quest) {
  let asked = 0;
  for (const task of quest.tasks.values()) {
    for (const prompt of task.actions) {
      if (prompt.typeName !== 'Prompt' || !prompt.isComplete) continue;
      // The verdict comes first because it reads no task state, and reading a global task trigger during a load
      // writes it from the store.
      const law = lawFor(quest, task, prompt);
      if (!law) continue;
      const { no } = law;
      if (law.clears) {
        if (!no.getTriggerValue() || task.getTriggerValue()) continue;
        prompt.isComplete = false;
        no.clear();
        asked++;
        continue;
      }
      if (!task.getTriggerValue()) continue;
      if (!no.getTriggerValue()) continue;
      if (law.gives && !no.actions.every((/** @type {any} */ a) => a.isComplete)) continue;
      task.clear();
      prompt.isComplete = false;
      no.clear();
      asked++;
    }
  }
  return asked;
}
