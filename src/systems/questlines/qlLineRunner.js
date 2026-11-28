// @ts-check
import { QL_LINES, lineById, lineStepOf, lineContentOn, lineOpens, opensWords, witnessOf, lineServiceOf, unmetNeeds } from './qlLines.js';
import { QL_SERVICE_LINES, qlStepClaimed } from '../../net/questlineClaims.js';
import { questlinesOn } from './qlLaw.js';
import { t } from '../../ui/textManager.js';
import { lootRarityOn } from '../../items/lootRarity.js';
import { getPref } from '../../ui/uiPrefs.js';
import { KINGS_GAMBIT_KEY } from '../../mods/features.js';
import { modSetting } from '../../mods/modSettings.js';
import { revenantHeld } from '../../revenants/revenant.js';
import { starfallRuns } from '../../net/starfall/starfallLaw.js';

export const NEED_CHECKS = Object.freeze({
  lootRarity: () => lootRarityOn(),
  kingsGambit: () => !!getPref(KINGS_GAMBIT_KEY),
  naval: () => getPref('naval') !== false && (() => { try { return modSetting('come-sail-away', 'Enabled') !== false; } catch { return false; } })(),
  renown: () => !revenantHeld(),
  starfall: (/** @type {number} */ nowMs) => starfallRuns(nowMs),
});

// Step gaps are in the character's game seconds; claim retries are in real milliseconds.
export const STEP_GAP_S = 3600;
export const RETRY_GAP_S = 24 * 3600;
export const CLAIM_RETRY_MS = 60_000;
export const CLAIM_TRIES = 5;
export const CLAIM_SLOW_MS = 600_000;

const freshLine = (begun = 0) => ({ step: 0, outcomes: {}, done: false, wait: 0, claims: {}, begun, lettered: 0, aside: false, taken: true });

export function letterOnItsWay(quest) {
  if (!quest || quest.questComplete || quest.shelvedAt != null) return false;
  for (const task of quest.tasks?.values?.() ?? []) {
    const clock = quest.getClock?.(task.symbol);
    if (!task.triggered && !(clock?.clockEnabled && !clock.clockFinished)) continue;
    if (task.actions?.some((a) => courierGive(quest, a))) return true;
  }
  return false;
}

const courierGive = (quest, a) => a.typeName === 'GivePc' && a.textId && !a.isComplete && quest.getItem?.(a.itemSymbol)?.itemName === 'letter';
const hasCourier = (quest) => [...(quest?.tasks?.values?.() ?? [])].some((t) => t.actions?.some((a) => courierGive(quest, a)));

/** @param {{ machine: any, ctx?: any, service?: any, nowMs?: () => number }} deps */
export function createLineRunner({ machine, ctx = {}, service = null, nowMs = () => Date.now() }) {
  let lines = {};
  // Pending claims are not saved: the records' claims say what was answered, and a load asks the rest again.
  let pending = [];

  // Counts loads, so a claim answered after a load does not touch the new records.
  let generation = 0;

  const level = () => ctx.level?.() ?? 1;
  const online = () => !!service && !!ctx.online?.();
  const now = () => ctx.nowSeconds?.() ?? 0;
  const registered = () => !!service && !service.guest?.();
  const need = (n) => { try { return !!NEED_CHECKS[n]?.(nowMs()); } catch { return false; } };
  const probe = { level, online, registered, need, lineDone: (id) => !!lines[id]?.done };

  // A step's quest is found by name, never by uid, so a restarted or set-aside copy is still the step.
  const runningStep = (questName) => {
    for (const q of machine.quests.values()) {
      if (q.questName === questName && !q.questComplete && !q.questTombstoned) return q;
    }
    return machine.questsToInvoke?.find?.((q) => q.questName === questName) ?? null;
  };

  function queueClaim(lineId, step, phase, choice = null) {
    if (!service || !(phase === 'open' ? Object.hasOwn(QL_SERVICE_LINES, lineId) : qlStepClaimed(lineId, step))) return null;
    if (pending.some((c) => c.line === lineId && c.step === step && c.phase === phase)) return null;
    const c = { line: lineId, step, choice, phase, next: 0, tries: 0 };
    pending.push(c);
    return c;
  }

  // An unanswered claim is asked again for as long as the page lives; the line moves on its own quest either way.
  async function ask(c) {
    const gen = generation;
    let a;
    try { a = await service.claim({ line: c.line, step: c.step, phase: c.phase, ...(c.choice ? { choice: c.choice } : {}) }); } catch { a = { ok: false, error: 'offline' }; }
    if (gen !== generation) return;
    const rec = lines[c.line];
    if (!rec) return;
    const d = a?.ok ? a.data ?? {} : null;
    const answered = !!d && (d.why === 'unpaid' || (c.phase === 'open' ? !!d.opened : d.witnessed === true));
    if (answered) {
      pending = pending.filter((x) => x !== c);
      rec.claims[c.step] = d.why === 'unpaid' ? 'refused:unpaid' : c.phase === 'open' ? (rec.claims[c.step] ?? 'opened') : 'witnessed';
      const title = d.title ?? (c.lost ? d.titleHeld ?? null : null);
      if (title || d.key || d.keyHeld) ctx.onHonour?.({ line: c.line, title, key: !!d.key, keys: Number.isSafeInteger(d.keys) ? d.keys : null, keyHeld: !!d.keyHeld });
      return;
    }
    // No answer at all may still have committed, so a title the service later reports as held is announced.
    if (!d && !(a?.status >= 400 && a?.status < 500)) c.lost = true;
    if (d && c.phase === 'end') rec.claims[c.step] = d.why === 'guest' ? 'refused:guest' : 'unseen';
    c.refused = !a?.ok && (a?.error === 'ql-closed' || a?.error === 'ql-body') ? a.error : null;
    c.tries++;
    c.next = nowMs() + (c.tries < CLAIM_TRIES ? CLAIM_RETRY_MS : CLAIM_SLOW_MS);
  }

  // A step whose need stops holding is set aside, then reclaimed; a quest the player set aside is never reclaimed.
  function keepSeason(l, rec, q) {
    if (unmetNeeds(l, rec.step, probe).length) {
      if (q.shelvedAt == null && machine.shelveQuest?.(q.uid)?.ok) rec.aside = true;
      return;
    }
    if (!rec.aside || (q.shelvedAt != null && !machine.reclaimQuest?.(q.uid)?.ok)) return;
    rec.aside = false;
  }

  function startStep(l, rec) {
    const step = l.steps[rec.step];
    if (!step) return;
    if (runningStep(step.quest)) { if (!rec.claims[rec.step]) queueClaim(l.id, rec.step, 'open'); return; }
    if (unmetNeeds(l, rec.step, probe).length) return;
    if (!courierMay(now())) return;
    const q = machine.scheduleQuestByName(step.quest);
    if (!q) { rec.wait = now() + RETRY_GAP_S; rec.stalled = true; return; }
    rec.stalled = false;
    rec.retry = false;
    queueClaim(l.id, rec.step, 'open');
  }

  function waitingWords(l, rec) {
    if (rec.done) return null;
    const o = l.opens;
    if (o.online && !online()) return t('ql.line.continuesOnline', 'Continues online.');
    if (o.account && !registered()) return t('ql.line.continuesAccount', 'Continues with a registered account.');
    if (unmetNeeds(l, rec.step, probe).length) return opensWords({ ...l, opens: {} }, probe, rec.step);
    return rec.stalled ? t('ql.line.stalled', 'Its next step could not begin here: it will be offered again.') : null;
  }

  // GivePc holds a letter until a town by day, so a later step's courier waits while any letter is on its way
  // and for STEP_GAP_S after the last one arrived.
  const courierMay = (s) => Object.entries(lines).every(([id, r]) => {
    if (r.lettered > 0 && r.lettered > s - STEP_GAP_S) return false;
    const q = r.done ? null : runningStep(lineById(id)?.steps[r.step]?.quest ?? '');
    return !letterOnItsWay(q) && !(q && machine.questsToInvoke?.includes?.(q) && hasCourier(q));
  });

  // Dropping pending claims for a line is safe: the account server writes each opening once.
  const reoffer = (id) => { delete lines[id]; pending = pending.filter((c) => c.line !== id); };

  const undelivered = (q) => !q.questComplete && !q.questTombstoned && !(q.getLogMessages?.()?.length > 0);
  const sentUndelivered = (questName) => {
    let found = false;
    for (const q of [...machine.quests.values()]) {
      if (q.questName !== questName || !undelivered(q)) continue;
      found = true;
      machine.removeQuest?.(q);
    }
    const held = machine.questsToInvoke ?? [];
    for (let i = held.length - 1; i >= 0; i--) if (held[i]?.questName === questName && undelivered(held[i])) { held.splice(i, 1); found = true; }
    return found;
  };

  const firstShelved = (l, rec) => {
    if (!rec || rec.done || rec.step !== 0 || rec.aside) return null;
    const q = runningStep(l.steps[0].quest);
    return q?.shelvedAt != null ? q : null;
  };

  const runner = {
    look() {
      if (!questlinesOn()) return;
      const s = now();
      for (const l of QL_LINES) {
        const rec = lines[l.id];
        if (!rec || !lineContentOn(l)) continue;
        if (rec.stalled && !rec.done && runningStep(l.steps[rec.step]?.quest)) { rec.stalled = false; rec.wait = 0; }
        // A first step with no quest puts its line back on offer; it is never started again unasked.
        if (!rec.done && rec.step === 0 && !runningStep(l.steps[0].quest)) { reoffer(l.id); continue; }
        if (rec.done || rec.wait > s) continue;
        const stepQuest = runningStep(l.steps[rec.step]?.quest);
        if (stepQuest) keepSeason(l, rec, stepQuest);
        if (l.opens.online && !online()) continue;
        if (l.opens.account && !registered()) continue;
        startStep(l, rec);
      }
      const ms = nowMs();
      for (const c of pending) if (c.next <= ms && !c.busy) { c.busy = true; ask(c).finally(() => { c.busy = false; }); }
    },

    ended(quest, outcome) {
      const at = lineStepOf(quest?.questName);
      if (!at) return null;
      const rec = lines[at.line.id];
      if (!rec || rec.done || rec.step !== at.index) return null;
      const good = outcome ? !outcome.failure : !!quest.questSuccess;
      rec.stalled = false;
      if (!good && at.index === 0) { reoffer(at.line.id); return { line: at.line.id, step: 0, moved: false, reoffered: true }; }
      if (!good) { rec.wait = now() + RETRY_GAP_S; rec.retry = true; return { line: at.line.id, step: at.index, moved: false }; }
      rec.retry = false;
      rec.outcomes[at.index] = { id: outcome?.id ?? 'done', text: ctx.outcomeText?.(quest) ?? null };
      queueClaim(at.line.id, at.index, 'end', outcome?.id ?? null);
      rec.step++;
      rec.wait = now() + STEP_GAP_S;
      if (rec.step >= at.line.steps.length) rec.done = true;
      return { line: at.line.id, step: at.index, moved: true, done: rec.done };
    },

    dropped(quest) {
      const at = lineStepOf(quest?.questName);
      const rec = at ? lines[at.line.id] : null;
      if (!rec || rec.done || rec.step !== at.index || quest.questComplete || rec.wait > now()) return;
      rec.wait = now() + RETRY_GAP_S;
      rec.stalled = true;
    },

    takeLine(id, { quest = null } = {}) {
      if (!questlinesOn()) return { ok: false, line: id, reason: 'off' };
      const l = lineById(id);
      if (!l) return { ok: false, line: id, reason: 'unknown' };
      if (!lineContentOn(l)) return { ok: false, line: id, reason: 'closed' };
      const rec = lines[id];
      const shelved = firstShelved(l, rec);
      if (shelved) {
        const r = machine.reclaimQuest?.(shelved.uid);
        return r?.ok ? { ok: true, line: id, reclaimed: true } : { ok: false, line: id, reason: r?.reason ?? 'begun' };
      }
      if (rec) return { ok: false, line: id, reason: 'begun' };
      if (!lineOpens(l, probe)) return { ok: false, line: id, reason: 'closed' };
      const first = l.steps[0].quest;
      const copy = runningStep(first);
      if (copy?.shelvedAt != null && !machine.reclaimQuest?.(copy.uid)?.ok) return { ok: false, line: id, reason: 'begun' };
      // The quest the offer was read from is the one started, so the letter read is the letter taken.
      const read = !copy && quest && String(quest.questName).toUpperCase() === first && !quest.questComplete ? quest : null;
      let q = copy;
      if (read) {
        try { q = machine.startQuestImmediate(read); } catch (e) { console.warn(`[questlines] ${first} could not start (${e?.message ?? e})`); q = null; }
      } else if (!q) q = machine.scheduleQuestByName(first);
      if (!q) return { ok: false, line: id, reason: 'noplace' };
      const s = Math.max(1, now());
      lines[id] = { ...freshLine(s), lettered: s };
      queueClaim(id, 0, 'open');
      return { ok: true, line: id };
    },

    offerQuest(id) {
      const l = lineById(id);
      if (!l || !questlinesOn() || lines[id] || !lineOpens(l, probe)) return null;
      const source = machine.deps?.getQuestSourceLines?.(l.steps[0].quest);
      return source ? machine.parseQuestForLists?.(source, 0) ?? null : null;
    },

    onOffer(id) {
      const l = lineById(id);
      return !!l && lineContentOn(l) && questlinesOn() && (lines[id] ? !!firstShelved(l, lines[id]) : lineOpens(l, probe));
    },

    shelvedFirst: (id) => { const l = lineById(id); return l ? firstShelved(l, lines[id]) : null; },

    rows() {
      return QL_LINES.filter((l) => lines[l.id]?.done || (lineContentOn(l) && (lines[l.id] || lineOpens(l, probe)))).map((l) => {
        const rec = lines[l.id];
        const stepQuest = rec && !rec.done ? runningStep(l.steps[rec.step]?.quest) : null;
        const shelved = stepQuest?.shelvedAt != null;
        const running = !!stepQuest && !shelved;
        const aside = shelved && !!rec?.aside;
        const offered = !rec || !!firstShelved(l, rec);
        const steps = l.steps.map((s, i) => {
          const state = offered ? 'next' : rec.done || i < rec.step ? 'done' : i === rec.step && (running || shelved) ? 'current' : 'next';
          const said = rec?.claims?.[i];
          const refused = pending.find((c) => c.line === l.id && c.step === i && c.refused)?.refused ?? null;
          return { quest: s.quest, title: s.title(), state, witnessed: !!witnessOf(l, i), seen: said === 'witnessed', unseen: state === 'done' && !!witnessOf(l, i) && said !== 'witnessed', outcome: rec?.outcomes?.[i]?.text ?? null, refused };
        });
        const state = offered ? 'offered' : rec.done ? 'done' : running ? 'running' : shelved && !aside ? 'shelved' : rec.retry ? 'retry' : 'waiting';
        const last = rec?.outcomes?.[l.steps.length - 1] ?? null;
        return {
          id: l.id, group: l.group, title: l.title(), lead: l.lead(), giver: l.giver(), state, steps,
          opens: state === 'waiting' || state === 'retry' ? waitingWords(l, rec) : null,
          outcome: rec?.done ? last?.text ?? null : null,
          honour: lineServiceOf(l)?.title ?? null,
          post: !rec && (l.post !== 'board' || online()) ? l.post ?? null : null,
        };
      });
    },

    lettered(quest) {
      const at = lineStepOf(quest?.questName);
      const rec = at ? lines[at.line.id] : null;
      if (rec && !rec.done && rec.step === at.index) rec.lettered = Math.max(1, now());
    },

    lineState: (id) => (lines[id] ? structuredClone(lines[id]) : null),

    snapshot: () => structuredClone(lines),
    restore(data) {
      lines = {};
      pending = [];
      generation++;
      if (!data || typeof data !== 'object') return;
      for (const [id, r] of Object.entries(data)) {
        const l = lineById(id);
        if (!l || !r || typeof r !== 'object') continue;
        // A save from before lines were taken can hold a first step sent unasked and never delivered; it is let go.
        if (!r.taken && !r.done && (r.step ?? 0) === 0 && sentUndelivered(l.steps[0].quest)) continue;
        const step = Math.max(0, Math.min(l.steps.length, Number.isSafeInteger(r.step) ? r.step : 0));
        lines[id] = {
          step, done: !!r.done || step >= l.steps.length, wait: Number.isFinite(r.wait) ? r.wait : 0,
          begun: Number.isFinite(r.begun) ? r.begun : 0, lettered: Number.isFinite(r.lettered) ? r.lettered : 0, stalled: !!r.stalled, retry: !!r.retry, aside: !!r.aside,
          taken: true,
          outcomes: r.outcomes && typeof r.outcomes === 'object' ? structuredClone(r.outcomes) : {},
          claims: r.claims && typeof r.claims === 'object' ? { ...r.claims } : {},
        };
        const rec = lines[id];
        for (let i = 0; i <= Math.min(rec.step, l.steps.length - 1); i++) {
          const ended = i < rec.step;
          const said = rec.claims[i];
          // An end the save never heard answered may have been answered and lost; a held title shows on retry.
          if (ended && said !== 'witnessed' && said !== 'refused:unpaid') { const c = queueClaim(id, i, 'end', rec.outcomes[i]?.id ?? null); if (c && (said == null || said === 'opened')) c.lost = true; }
          else if (!ended && !rec.done && !said) queueClaim(id, i, 'open');
        }
      }
    },
  };
  return runner;
}
