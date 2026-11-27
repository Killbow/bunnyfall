// @ts-check
import { getPref } from '../../ui/uiPrefs.js';
import { getInnerSymbolName } from '../quest/symbol.js';
import { QL_STAMP, freshState } from './qlState.js';

export { QL_STAMP, freshState, readState, writeState } from './qlState.js';

export const QUESTLINES_PREF = 'questlines';

export const questlinesOn = () => !!getPref(QUESTLINES_PREF);

// A quest is stamped when it starts and keeps the stamp in its save; a later switch change never restamps it.
export const startStamp = (on = questlinesOn()) => (on ? freshState() : null);

export const isStamped = (quest) => quest?.ql?.stamp === QL_STAMP;

// `end quest` sets ticksToEnd before the layer hears the end and questComplete later, so `ended` holds at once.
export const isEnding = (quest) => !!quest?.questComplete || (quest?.ticksToEnd ?? 0) > 0;

export const isCatchAll = (o) => !!o?.on && Object.keys(o.on).length === 1 && o.on.ended === true;

export const BINDING_KINDS = Object.freeze(['started', 'ended', 'success', 'task', 'item', 'clock', 'clockDone', 'step', 'global', 'foeDead', 'act', 'choice', 'all', 'any', 'not']);

// A sheet may spell a symbol as the script does (`_S.02_`) or by its inner name; the machine keys on the inner one.
export const symName = (s) => getInnerSymbolName(String(s ?? ''));
const resource = (quest, name, kind) => {
  const r = quest?.resources?.get?.(symName(name));
  return r && r[kind] ? r : null;
};

/**
 * @param {any} quest
 * @param {any} b
 * @param {{ carries?: (r: any) => boolean, ending?: boolean }} [probe]
 * @returns {boolean}
 */
export function holds(quest, b, probe = {}) {
  if (!quest || !b || typeof b !== 'object') return false;
  if (Array.isArray(b.all)) return b.all.length > 0 && b.all.every((x) => holds(quest, x, probe));
  if (Array.isArray(b.any)) return b.any.some((x) => holds(quest, x, probe));
  if (b.not) return !holds(quest, b.not, probe);
  if (b.started === true) return true;
  if (b.ended === true) return isEnding(quest) || !!probe.ending;
  if (b.success === true) return !!quest.questSuccess;
  if (b.task != null) return !!quest.tasks?.get?.(symName(b.task))?.getTriggerValue?.();
  if (b.item != null) { const r = resource(quest, b.item, 'isItem'); return !!r && !!probe.carries?.(r); }
  if (b.clock != null) { const r = resource(quest, b.clock, 'isClock'); return !!r && !!r.clockEnabled && !r.clockFinished; }
  if (b.clockDone != null) { const r = resource(quest, b.clockDone, 'isClock'); return !!r && !!r.clockFinished; }
  if (b.step != null) return [...(quest.activeLogMessages?.values?.() ?? [])].some((e) => e?.stepID === b.step);
  if (b.global != null) return !!quest.hooks?.globalVars?.get?.(b.global);
  if (b.foeDead != null) { const f = resource(quest, b.foeDead, 'isFoe'); return !!f && (f.killCount | 0) >= Math.max(1, f.spawnCount | 0); }
  if (b.act != null) return (quest.ql?.acts?.[b.act] ?? 0) >= Math.max(1, b.n | 0);
  if (b.choice && typeof b.choice === 'object') return quest.ql?.choices?.[b.choice.branch] === b.choice.is;
  return false;
}

export function bindingSymbols(b, out = []) {
  if (!b || typeof b !== 'object') return out;
  for (const k of ['all', 'any']) if (Array.isArray(b[k])) for (const x of b[k]) bindingSymbols(x, out);
  if (b.not) bindingSymbols(b.not, out);
  for (const k of ['task', 'item', 'clock', 'clockDone', 'foeDead']) if (b[k] != null) out.push({ kind: k, name: symName(b[k]) });
  return out;
}

const ALWAYS = Object.freeze({ started: true });

// A state saved before a binding was mended holds the old latch, which is ignored until observe forgets it.
const unmended = (st, o) => !!o?.reread && !(st?.reread ?? []).includes(o.reread);
const latched = (st, list, o) => !!list?.includes(o.id) && !unmended(st, o);

/**
 * @param {any} quest
 * @param {any} sheet
 * @param {{ carries?: (r: any) => boolean }} [probe]
 */
export function readObjectives(quest, sheet, probe = {}) {
  const st = quest?.ql ?? null;
  return (sheet?.objectives ?? []).map((o) => {
    const done = latched(st, st?.done, o) || holds(quest, o.done, probe);
    const failed = !done && (latched(st, st?.failed, o) || (!!o.fail && holds(quest, o.fail, probe)));
    const open = done || failed || latched(st, st?.opened, o) || holds(quest, o.open ?? ALWAYS, probe);
    return {
      id: o.id, text: o.text, state: done ? 'done' : failed ? 'failed' : open ? 'open' : 'hidden',
      optional: !!o.optional, group: o.group ?? null, any: o.any ?? null, mark: o.mark ? symName(o.mark) : null,
    };
  });
}

export function outcomeNow(quest, sheet, probe = {}) {
  for (const o of sheet?.outcomes ?? []) if (holds(quest, o.on, probe)) return o;
  return null;
}

export function fallbackOutcome(quest, sheet) {
  const list = sheet?.outcomes ?? [];
  if (quest?.questSuccess) return list.find((o) => o.id === (sheet?.success ?? 'done') && !o.failure) ?? null;
  return list.find((o) => o.id === 'failed') ?? list.find((o) => o.failure) ?? null;
}

/**
 * @param {any} quest
 * @param {any} sheet
 * @param {{ carries?: (r: any) => boolean }} [probe0]
 * @param {{ settle?: boolean, ending?: boolean }} [opts]
 */
export function observe(quest, sheet, probe0 = {}, { settle = false, ending = false } = {}) {
  const probe = ending ? { ...probe0, ending: true } : probe0;
  const moved = { done: [], failed: [], chose: [], outcome: null };
  const st = isStamped(quest) ? quest.ql : null;
  if (!st || !sheet) return moved;
  st.reread ??= [];
  const mends = new Set();
  for (const o of sheet.objectives ?? []) {
    if (!unmended(st, o)) continue;
    mends.add(o.reread);
    for (const k of ['done', 'opened', 'failed']) st[k] = (st[k] ?? []).filter((x) => x !== o.id);
  }
  for (const m of mends) st.reread.push(m);
  for (const b of sheet.branches ?? []) {
    if (st.choices[b.id]) continue;
    const c = (b.choices ?? []).find((x) => holds(quest, { task: x.sets }, probe));
    if (c) { st.choices[b.id] = c.id; moved.chose.push({ branch: b.id, choice: c.id }); }
  }
  for (const o of sheet.objectives ?? []) {
    if (!st.opened.includes(o.id) && holds(quest, o.open ?? ALWAYS, probe)) st.opened.push(o.id);
    if (st.done.includes(o.id)) continue;
    if (holds(quest, o.done, probe)) {
      st.done.push(o.id);
      st.failed = st.failed.filter((x) => x !== o.id);
      moved.done.push(o.id);
    } else if (o.fail && !st.failed.includes(o.id) && holds(quest, o.fail, probe)) {
      st.failed.push(o.id);
      moved.failed.push(o.id);
    }
  }
  if (settle && !st.outcome) {
    let o = outcomeNow(quest, sheet, probe);
    if (o?.failure && quest.questSuccess && isCatchAll(o)) o = fallbackOutcome(quest, sheet) ?? o;
    if (!o && (ending || isEnding(quest))) o = fallbackOutcome(quest, sheet);
    if (o) { st.outcome = o.id; moved.outcome = o.id; }
  }
  return moved;
}

export const outcomeOf = (quest, sheet) => (quest?.ql?.outcome ? (sheet?.outcomes ?? []).find((o) => o.id === quest.ql.outcome) ?? null : null);

export const rankTier = (rank) => (rank >= 6 ? 4 : rank >= 4 ? 3 : rank >= 2 ? 2 : 1);
export const reputationTier = (rep) => (rep >= 60 ? 4 : rep >= 40 ? 3 : rep >= 20 ? 2 : 1);
export const levelTier = (level) => (level >= 21 ? 4 : level >= 14 ? 3 : level >= 7 ? 2 : 1);

/** @param {{ minReq?: number|null, level?: number, social?: boolean, sheetTier?: number|null }} facts */
export function questTierOf({ minReq = null, level = 1, social = false, sheetTier = null } = {}) {
  if (Number.isSafeInteger(sheetTier) && sheetTier >= 1 && sheetTier <= 4) return sheetTier;
  if (Number.isSafeInteger(minReq) && minReq >= 10) return reputationTier(minReq);
  // A social group's list floor under 10 is a level, not a rank.
  if (Number.isSafeInteger(minReq) && minReq >= 0 && !social) return rankTier(minReq);
  return levelTier(Math.max(1, level | 0));
}
