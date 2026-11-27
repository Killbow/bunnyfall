// @ts-check
// ═══════════════════════════════════════════════════════════════════
// POI-6 (2026-10-14) - THE APPROVER'S QUEUE AND A POI'S HISTORY, IN THE EDITOR.
//
// Mac: "I need to be able to approve changes" (bible/06-Systems/POI-Editor-Arc.md POI-6). Two dialogs over the POI
// editor's panel (ui/poi/poiEditorPanel.js):
//
//   - APPROVALS (an approver's; the bar's button): every submission, oldest first - its name, who sent it and when,
//     whether it is new, a change or a retirement, whether it was made from a revision no longer live (approving it puts
//     back what went live since), WHAT IT CHANGES against the live one (poi/poiDiff.js, in words), and THE LAW'S REPORT
//     (its problems, its assets' once known). LOOK AT IT opens the submission in the editor and takes the eye to its
//     place; BEFORE and AFTER show the live one and the submission there in turn (poiEdit.js showAs - the screen's
//     alone). APPROVE, or SEND BACK with a word (a word is asked: the builder is told why).
//   - HISTORY (a POI's inspector): every revision, newest first - its state, author, when, the reviewer's word, which is
//     live. OPEN any as the editor's working document (its base the live revision); an approver PUTS BACK an earlier
//     approved revision as the live one (asked twice).
//
// Every word through the text core (L10N4); every name a builder typed written with `textContent`. Not a DFU member.
// Ledger A (POI).
// ═══════════════════════════════════════════════════════════════════

import { t } from '../textManager.js';   // L10N4: the words through the text core
import { POI_LIMITS, poiDocProblems } from '../../poi/poiLaw.js';
import { poiDiff } from '../../poi/poiDiff.js';
import { comparableRevs, compareRevisions, defaultPair } from '../../poi/poiRevCompare.js';
import { diffText, problemText, problemWhere, uncheckedRows } from '../../poi/poiText.js';
import { poiQueue, poiReview, poiHistory, poiRollback } from '../../poi/poiService.js';
import { agoText } from '../saveTile.js';   // the port's one "how long ago"
import { poiPayProblems } from '../../poi/poiTradeLaw.js';
import { isTextEntryTarget } from '../input.js';   // AUDIT POI T8: a word being typed keeps its field

/** A revision's state as the history says it. @param {string} state */
export const revStateText = (state) => (state === 'draft' ? t('poi.editor.state.draft', 'draft')
  : state === 'submitted' ? t('poi.editor.state.submitted', 'sent for approval')
    : state === 'approved' ? t('poi.review.approved', 'approved')
      : state === 'rejected' ? t('poi.editor.state.rejected', 'sent back')
        // AUDIT POI C2: a retirement its builder took back (the store's own state, no English note)
        : state === 'withdrawn' ? t('poi.review.withdrawn', 'withdrawn by builder')
          : String(state));

/**
 * @param {{
 *   doc?: Document, host: any, me: { handle: string | null, builder: boolean, approver: boolean },
 *   act: (fn: (io: any) => Promise<any>) => Promise<any>, say: (text: string, kind?: string) => void, refusal: (r: any) => string,
 *   edit: any, facts: { check: (d: any, own: any[]) => { list: any[], checking: boolean, unchecked: boolean, unloaded: { path: string, passes: boolean }[] }, retry: () => void }, goTo: (place: any) => void, feed?: { refresh?: () => any } | null,
 *   now?: () => number,
 * }} deps `goTo` takes the eye to a document's place; `facts` the panel's asset facts (the law's asset check); `feed` the
 *   game's feed, asked again once the world changed (a verdict, a put-back)
 */
export function createPoiReview({ doc = document, host, me, act, say, refusal, edit, facts, goTo, feed = null, now = () => Date.now() / 1000 }) {
  const el = (tag, cls = '', text = null) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const btn = (text, onClick, cls = 'dfpoi-btn') => { const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', (e) => { e.stopPropagation?.(); onClick(); }); return b; };
  const swallow = (e) => e.stopPropagation?.();
  const box = () => { const d = el('div', 'dfpoi-dialog dfpoi-shelf'); for (const ty of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'wheel', 'contextmenu', 'touchstart']) d.addEventListener(ty, swallow); return d; };

  /** @type {any} */
  let dialog = null;
  let queue = null;
  let looking = null;        // the submission being looked at: `{ id, rev, before, after }`
  let showing = 'after';
  // the open history, `{ id, h, pair }`, where `pair` holds the two revisions being compared (`{ from, to }`)
  let history = null;
  let puttingBack = null;    // the revision whose putting back asks again
  let rolling = false;       // AUDIT POI U12: a put-back out - the put-back buttons held until it answers
  let more = false;          // AUDIT POI C3: more submissions wait than the store sent
  const notes = new Map();   // a submission's word, kept while the queue is drawn again
  const deciding = new Set();   // AUDIT POI U12: the submissions (`id:rev`) a word is out for - one word each

  function close() {
    dialog?.remove?.(); dialog = null;
    if (looking) { edit.showAs(looking.id, undefined); looking = null; showing = 'after'; }
    history = null; puttingBack = null;
  }

  // ── APPROVALS ───────────────────────────────────────────────────
  async function openQueue() {
    close();
    dialog = box();
    dialog.dataset.kind = 'queue';
    host.append(dialog);
    drawQueue();
    await refreshQueue();
  }
  async function refreshQueue() {
    const r = await act((i) => poiQueue(i));
    if (!r) return;
    if (!r.ok) { say(refusal(r), 'bad'); return; }
    queue = r.data.queue ?? [];
    more = !!r.data.more;
    drawQueue();
  }
  /** The law's report on a submission: its own problems, then its assets' once every one is known. */
  const lawOf = (d) => facts.check(d, poiPayProblems(d, poiDocProblems(d)));
  function drawQueue() {
    if (!dialog || dialog.dataset.kind !== 'queue') return;
    const rows = [el('div', 'dfpoi-h', t('poi.review.title', 'Approvals')), el('div', 'dfpoi-sub', t('poi.review.hint', 'Inspect each submission in the world, then approve it or send it back with a note.'))];
    const top = el('div', 'dfpoi-row');
    top.append(btn(t('poi.editor.refresh', 'Refresh'), () => refreshQueue()), btn(t('poi.review.close', 'Close'), () => close()));
    rows.push(top);
    if (!queue) rows.push(el('div', 'dfpoi-sub', t('poi.library.loading', 'Loading...')));
    else if (!queue.length) rows.push(el('div', 'dfpoi-ok', t('poi.review.none', 'No submissions are waiting for approval.')));
    else for (const item of queue) rows.push(queueRow(item));
    // AUDIT POI C3: the queue is bounded - what waits past it is said, not left to be guessed
    if (queue?.length && more) rows.push(el('div', 'dfpoi-sub', t('poi.review.more', 'More submissions are waiting. Review these to see the rest.')));
    dialog.replaceChildren(...rows);
  }
  function queueRow(item) {
    const r = el('div', 'dfpoi-review');
    const name = item.doc?.name ?? item.liveDoc?.name ?? item.id;
    const kind = item.kind === 'retire' ? t('poi.review.kindRetire', 'remove from the world') : item.liveDoc ? t('poi.review.kindChange', 'a change') : t('poi.review.kindNew', 'new');
    r.append(el('div', 'dfpoi-shelf-name', name), el('div', 'dfpoi-shelf-meta', t('poi.review.sent', '{kind} · by {author} · sent {ago}', { kind, author: item.author, ago: agoText(item.submittedAt, now()) })));
    if (item.stale) r.append(el('div', 'dfpoi-warn', t('poi.review.stale', 'Based on an older live revision. Approving it will overwrite changes made since then.')));
    // what it changes
    const changes = poiDiff(item.liveDoc, item.kind === 'retire' ? null : item.doc);
    const list = el('div', 'dfpoi-sub');
    for (const c of changes) list.append(el('div', '', diffText(c)));
    if (!changes.length) list.append(el('div', '', t('poi.review.noChange', 'No differences from the live revision.')));
    r.append(el('div', 'dfpoi-h', t('poi.review.changes', 'Changes')), list);
    // the law's report
    if (item.doc) {
      const { list: ps, checking, unchecked, unloaded } = lawOf(item.doc);
      r.append(el('div', 'dfpoi-h', t('poi.review.law', 'Checks')));
      if (unchecked) r.append(...uncheckedRows(item.doc, unloaded, el, btn, () => facts.retry()));
      else if (!ps.length) r.append(el('div', checking ? 'dfpoi-sub' : 'dfpoi-ok', checking ? t('poi.editor.checking', 'Checking models and pictures...') : t('poi.review.lawOk', 'No problems found.')));
      for (const p of ps.slice(0, 12)) { const where = problemWhere(p.path, item.doc); r.append(el('div', 'dfpoi-problem', where ? `${where}: ${problemText(p)}` : problemText(p))); }
    }
    // looking, then the word
    const acts = el('div', 'dfpoi-row');
    const mine = looking?.id === item.id && looking.rev === item.rev;
    acts.append(btn(t('poi.review.look', 'View in world'), () => look(item)));
    if (mine) {
      const toggle = btn(showing === 'after' ? t('poi.review.showBefore', 'Show live version') : t('poi.review.showAfter', 'Show submission'), () => flip());
      acts.append(toggle, el('span', 'dfpoi-chip', showing === 'after' ? t('poi.review.showingAfter', 'showing: submission') : t('poi.review.showingBefore', 'showing: live version')));
    }
    const note = el('textarea');
    note.maxLength = POI_LIMITS.note; note.placeholder = t('poi.review.notePlaceholder', 'Note for the builder (required when sending back)');
    note.value = notes.get(`${item.id}:${item.rev}`) ?? '';
    note.addEventListener('input', () => notes.set(`${item.id}:${item.rev}`, note.value));
    const decide = el('div', 'dfpoi-row');
    const approve = btn(t('poi.review.approve', 'Approve'), () => decideOn(item, 'approve', note.value)), reject = btn(t('poi.review.reject', 'Send back'), () => decideOn(item, 'reject', note.value));
    approve.disabled = reject.disabled = deciding.has(`${item.id}:${item.rev}`);   // AUDIT POI U12: held while its word is out
    decide.append(approve, reject);
    r.append(acts, note, decide);
    return r;
  }
  /** Look at a submission: it opens in the editor (unless changes of the builder's own to it are open) and the eye goes there. */
  function look(item) {
    const id = item.id;
    // AUDIT POI U12: refused before anything moves - the look before it, its showing and its chip, left as they were (the
    // showing was let go and the chip went on saying it)
    if (item.kind !== 'retire' && edit.has(id) && edit.dirty(id)) { say(t('poi.review.openDirty', 'You have this POI open with changes: save or close it first.'), 'bad'); return; }
    if (looking && looking.id !== id) edit.showAs(looking.id, undefined);
    if (item.kind !== 'retire') {
      if (edit.has(id)) edit.close(id);
      edit.open(id, { doc: structuredClone(item.doc), base: item.liveRev ?? null, rev: item.rev, state: 'submitted' });
      edit.select({ id, part: null });
    }
    looking = { id, rev: item.rev, before: item.liveDoc, after: item.kind === 'retire' ? null : item.doc };
    showing = 'after';
    edit.showAs(id, looking.after ? undefined : null);
    goTo((looking.after ?? looking.before).place);
    drawQueue();
  }
  /** Before and after, in turn, where it stands: the live one (none for a new POI) or the submission (none for a retirement). */
  function flip() {
    if (!looking) return;
    showing = showing === 'after' ? 'before' : 'after';
    const d = showing === 'after' ? looking.after : looking.before;
    edit.showAs(looking.id, d ? (showing === 'after' ? undefined : d) : null);
    drawQueue();
  }
  /** The look at a submission ended: its showing let go, and the submission it opened, unchanged, closed - what the world
   *  stands now is the store's. */
  function endLook(item) {
    if (looking?.id !== item.id) return;
    edit.showAs(item.id, undefined);
    if (edit.has(item.id) && !edit.dirty(item.id) && edit.entryOf(item.id)?.state === 'submitted') edit.close(item.id);
    looking = null; showing = 'after';
  }
  async function decideOn(item, verdict, note) {
    const key = `${item.id}:${item.rev}`;
    // AUDIT POI U12: one word on a submission at a time - pressed again while it is out, nothing is sent (two were, and the
    // loser's refusal was said over the winner's word)
    if (deciding.has(key)) return;
    const word = note.trim();
    if (verdict === 'reject' && !word) { say(t('poi.review.needWord', 'Add a note for the builder explaining why you are sending it back.'), 'bad'); return; }
    deciding.add(key);
    drawQueue();
    let r;
    // AUDIT POI C1: decided only as it was listed - the document's hash the queue gave (poiService.js poiReview's sixth)
    try { r = await act((i) => poiReview(i, item.id, item.rev, verdict, word || null, item.docSha ?? null)); } finally { deciding.delete(key); }
    if (!r) { drawQueue(); return; }
    if (!r.ok) {
      say(refusal(r), 'bad');
      // AUDIT POI C1: changed since it was listed (or decided by another approver) - the look ends and the queue is asked
      // again, so what is approved next is what is seen
      if (r.error === 'poi-changed' || r.error === 'poi-state') { endLook(item); await refreshQueue(); } else drawQueue();
      return;
    }
    const name = item.doc?.name ?? item.liveDoc?.name ?? item.id;
    say(verdict === 'approve' ? t('poi.review.approvedName', 'Approved: {name}. It is now live in the world.', { name }) : t('poi.review.rejectedName', 'Sent back: {name}.', { name }));
    notes.delete(key);
    endLook(item);
    feed?.refresh?.();   // AUDIT POI C7: the world on this screen as it now stands, not at the feed's next minute
    await refreshQueue();
  }

  // ── HISTORY ─────────────────────────────────────────────────────
  async function openHistory(id) {
    close();
    dialog = box();
    dialog.dataset.kind = 'history';
    host.append(dialog);
    history = { id, h: null, pair: null };
    drawHistory();
    await loadHistory(id);
  }
  /** A POI's revisions asked of the store - drawn into that POI's history while it is open, and into no other dialog. */
  async function loadHistory(id) {
    const r = await act((i) => poiHistory(i, id));
    if (!r) return;
    if (!r.ok) { say(refusal(r), 'bad'); return; }
    if (history?.id === id) { history.h = r.data; history.pair = keptPair(r.data, history.pair); drawHistory(); }
  }
  function drawHistory() {
    if (!dialog || dialog.dataset.kind !== 'history' || !history) return;
    const h = history.h;
    const named = h?.revs?.slice().reverse().find((x) => x.doc)?.doc?.name ?? history.id;
    const rows = [el('div', 'dfpoi-h', t('poi.review.historyTitle', 'History: {name}', { name: named })), btn(t('poi.review.close', 'Close'), () => close())];
    if (!h) rows.push(el('div', 'dfpoi-sub', t('poi.library.loading', 'Loading...')));
    else { rows.push(...compareRows(h)); for (const rev of [...h.revs].reverse()) rows.push(historyRow(h, rev)); }
    dialog.replaceChildren(...rows);
  }
  /** Preserves the previously selected revision pair across a history reload if both revisions are still in
   *  `comparableRevs(h)`; otherwise falls back to `defaultPair(h)`. */
  function keptPair(h, pair) {
    const revs = new Set(comparableRevs(h).map((x) => x.rev));
    return pair && revs.has(pair.from) && revs.has(pair.to) ? pair : defaultPair(h);
  }
  /** Builds the revision-comparison controls and diff list (poi/poiRevCompare.js) for the history dialog, or returns
   *  an empty array when fewer than two revisions can be compared. */
  function compareRows(h) {
    const pair = history?.pair;
    if (!pair) return [];
    // labels rollback and retirement revisions by their action, matching their history rows
    const options = comparableRevs(h).map((x) => [x.rev, x.kind === 'retire' || x.kind === 'rollback' ? t('poi.review.rev', 'Revision {rev}: {what}', { rev: x.rev, what: x.kind === 'retire' ? t('poi.review.kindRetire', 'remove from the world') : t('poi.review.kindRollback', 'restore revision {rev}', { rev: x.base }) })
      : t('poi.review.compareRev', 'Revision {rev} ({state})', { rev: x.rev, state: revStateText(x.state) })]);
    const pick = (side) => {
      const s = el('select');
      s.dataset.side = side;
      for (const [rev, text] of options) { const o = el('option', '', text); o.value = String(rev); if (rev === pair[side]) o.selected = true; s.append(o); }
      s.value = String(pair[side]);
      s.addEventListener('change', () => { if (history) { history.pair = { ...history.pair, [side]: Number(s.value) }; drawHistory(); } });
      // keeps key presses in the dropdown, such as the arrow keys, from reaching the editor's own key handling
      for (const ty of ['keydown', 'keyup']) s.addEventListener(ty, swallow);
      return s;
    };
    const head = el('div', 'dfpoi-row');
    head.append(el('span', '', t('poi.review.compareFrom', 'From')), pick('from'), el('span', '', t('poi.review.compareTo', 'to')), pick('to'));
    const changes = compareRevisions(h, pair.from, pair.to) ?? [];
    const list = el('div', 'dfpoi-sub dfpoi-compare');
    if (pair.from === pair.to) list.append(el('div', '', t('poi.review.compareSame', 'Pick two different revisions.')));
    else if (!changes.length) list.append(el('div', '', t('poi.review.compareNone', 'No differences between these revisions.')));
    for (const c of changes) list.append(el('div', '', diffText(c)));
    return [el('div', 'dfpoi-h', t('poi.review.compare', 'Compare two revisions')), head, list];
  }
  function historyRow(h, rev) {
    const r = el('div', 'dfpoi-review');
    const live = rev.rev === h.liveRev;
    // AUDIT POI C2: a put-back is a revision of its own (no document; its base the revision it put back)
    const what = rev.kind === 'retire' ? t('poi.review.kindRetire', 'remove from the world')
      : rev.kind === 'rollback' ? t('poi.review.kindRollback', 'restore revision {rev}', { rev: rev.base })
        : rev.doc?.name ?? '';
    r.append(el('div', 'dfpoi-shelf-name', t('poi.review.rev', 'Revision {rev}: {what}', { rev: rev.rev, what })));
    r.append(el('div', 'dfpoi-shelf-meta', t('poi.review.revMeta', '{state} · by {author} · {ago}', { state: revStateText(rev.state), author: rev.author, ago: agoText(rev.at, now()) })));
    if (live) r.append(el('div', 'dfpoi-ok', t('poi.review.live', 'In the world now.')));
    if (rev.reviewer) r.append(el('div', 'dfpoi-sub', rev.note ? t('poi.review.word', '{reviewer}: {note}', { reviewer: rev.reviewer, note: rev.note }) : t('poi.review.decidedBy', 'Reviewed by {reviewer}.', { reviewer: rev.reviewer })));
    const acts = el('div', 'dfpoi-row');
    if (rev.doc) acts.append(btn(t('poi.review.openRev', 'Open revision'), () => openRevision(h, rev)));
    // AUDIT POI C2: only a document goes back - an approved retirement or put-back has none (the store refuses it)
    if (me.approver && rev.state === 'approved' && !live && rev.kind === 'doc' && rev.doc) {
      const b = btn(puttingBack === rev.rev ? t('poi.review.putBackSure', 'Restore this revision?') : t('poi.review.putBack', 'Restore revision'), () => putBack(h, rev));
      b.disabled = rolling;   // AUDIT POI U12: held while a put-back is out
      acts.append(b);
    }
    r.append(acts);
    return r;
  }
  /** A past revision as the working document: its base the live one, saved as the builder's own draft. */
  function openRevision(h, rev) {
    if (edit.has(h.id) && edit.dirty(h.id)) { say(t('poi.review.openDirty', 'You have this POI open with changes: save or close it first.'), 'bad'); return; }
    if (edit.has(h.id)) edit.close(h.id);
    // saved as the live one is (none: never approved), so a revision that is not the live one opens as a change to save
    const live = h.revs.find((x) => x.rev === h.liveRev)?.doc ?? null;
    edit.open(h.id, { doc: structuredClone(rev.doc), saved: live, base: h.liveRev ?? null, rev: null, state: h.liveRev ? 'live' : 'draft' });
    edit.select({ id: h.id, part: null });
    close();
    goTo(rev.doc.place);
    say(t('poi.review.opened', 'Opened revision {rev}. Save it as a draft to send it again.', { rev: rev.rev }));
  }
  async function putBack(h, rev) {
    if (puttingBack !== rev.rev) { puttingBack = rev.rev; drawHistory(); return; }
    puttingBack = null;
    rolling = true;
    drawHistory();
    let r;
    try { r = await act((i) => poiRollback(i, h.id, rev.rev)); } finally { rolling = false; }
    if (!r) { drawHistory(); return; }
    if (!r.ok) { say(refusal(r), 'bad'); drawHistory(); return; }
    say(t('poi.review.putBackDone', 'Revision {rev} is live in the world again.', { rev: rev.rev }));
    feed?.refresh?.();   // AUDIT POI C7
    // AUDIT POI U12, P8: the history asked again in place - never opened anew over a queue opened since (ending its look),
    // nor over the editor once a revision was opened from it
    await loadHistory(h.id);
  }

  /** An asset's facts learnt: the queue's law reports drawn again - unless a word is being typed there (it is drawn at the
   *  next act, the word kept). */
  function learned() {
    if (dialog?.dataset.kind !== 'queue') return;
    // a word being typed, and nothing else (AUDIT POI U1's rule: a pressed button keeps the focus and holds nothing - the
    // report stayed "checking" after Look at it was pressed)
    const a = doc.activeElement;
    if (isTextEntryTarget(a) && dialog.contains?.(a)) return;
    drawQueue();
  }

  return {
    openQueue: () => openQueue(),
    learned,
    openHistory: (id) => openHistory(id),
    close,
    dialog: () => dialog,
    queue: () => queue,
    looking: () => looking,
  };
}
