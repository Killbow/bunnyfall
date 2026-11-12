// @ts-check
// BUNNYFALL STAFF REPORTS (Killbunny: "the reports feature needs to be fixed a lot, it kinda sucks to read and i cant
// even close wrong reports"): THE OPEN REPORTS, READABLE. Each case is a line in plain words (who, what kind, why its
// level), opened in place to its own words (the reported chat or the spawn check's findings, the reporters' reasons and
// notes) with its acts beside them: Dismiss, Mute, Ban, Open player. Ticked cases are dismissed together. The routes are
// the service's own (server-account/src/staffCases.js): /v1/staff/cases, /v1/staff/case, /v1/staff/dismiss, /mute, /ban.
// staffPanel.js wires it, its helpers handed in (`kit`).

const KIND = { chat: 'Chat report', spawn: 'Spawn check (old)' };
const KIND_WHAT = {
  chat: 'Players reported what this account said in chat.',
  spawn: 'An old automatic spawn check, from before only player reports opened cases.',
};
const TAB = { grant: 'Spawn check', chat: 'Chat' };
const MUTES = [[10, '10 minutes'], [60, '1 hour'], [360, '6 hours'], [1440, '1 day'], [10080, '1 week']];
const BANS = [[1, '1 day'], [3, '3 days'], [7, '1 week'], [30, '30 days'], [365, '1 year'], [0, 'Forever']];

/**
 * The Open reports view, into `card`.
 * @param {HTMLElement} card
 * @param {{ h: Function, call: (path: string, body?: any) => Promise<any>, toast: (t: string, bad?: boolean) => void,
 *   why: (j: any) => string, ago: (s: any) => string, when: (s: any) => string, rid: () => string,
 *   openAccount: (id: string, name: string) => void }} kit
 */
export function reportsView(card, kit) {
  const { h, call, toast, why, ago, when, rid, openAccount } = kit;
  let sort = 'urgent';
  const picked = new Set();
  const open = new Set();
  const head = h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;margin-bottom:10px' });
  const list = h('div', { class: 'list' });
  card.append(head, list);

  const chip = (/** @type {string} */ level) => h('span', { class: `chip ${level === 'high' ? 'bad' : level === 'medium' ? 'warn' : ''}` }, level);

  /** Dismiss one case: closed as no action, its automatic mutes lifted. Answers whether it went. */
  const dismiss = async (/** @type {any} */ c) => {
    const j = await call('/v1/staff/dismiss', { target: c.target, case: c.id });
    if (j.error) { toast(`${c.name}: ${why(j)}`, true); return false; }
    return true;
  };

  async function load() {
    list.replaceChildren(h('div', { class: 'dim' }, 'Loading...'));
    const all = [];
    let from = 0, j;
    do {   // every page: a list short enough to read whole
      j = await call('/v1/staff/cases', { sort, from });
      if (j.error) { list.replaceChildren(h('div', { class: 'bad' }, why(j))); return; }
      all.push(...(j.cases ?? []));
      from = j.next;
    } while (from != null && all.length < 500);
    for (const id of [...picked]) if (!all.some((c) => c.id === id)) picked.delete(id);
    drawHead(all);
    if (!all.length) { list.replaceChildren(h('div', { class: 'dim' }, 'No open reports.')); return; }
    list.replaceChildren(...all.map(row));
  }

  function drawHead(/** @type {any[]} */ all) {
    const high = all.filter((c) => c.level === 'high').length;
    const spawnIdle = all.filter((c) => c.kind === 'spawn' && !Number(c.reports));
    const bulk = async (/** @type {any[]} */ cs, /** @type {string} */ what) => {
      if (!cs.length || !globalThis.confirm(`Dismiss ${cs.length} ${what}? They close as "no action".`)) return;
      let n = 0;
      for (const c of cs) if (await dismiss(c)) n++;
      toast(`Dismissed ${n} of ${cs.length}.`, n < cs.length);
      picked.clear();
      load();
    };
    head.replaceChildren(...[
      h('b', null, `${all.length} open`), high ? h('span', { class: 'chip bad' }, `${high} high`) : null,
      h('span', { style: 'flex:1' }),
      h('button', { class: sort === 'urgent' ? 'on' : 'ghost', onclick: () => { sort = 'urgent'; load(); } }, 'Most urgent'),
      h('button', { class: sort === 'newest' ? 'on' : 'ghost', onclick: () => { sort = 'newest'; load(); } }, 'Newest'),
      h('button', { onclick: () => load() }, 'Refresh'),
      picked.size ? h('button', { class: 'danger', onclick: () => bulk(all.filter((c) => picked.has(c.id)), 'ticked cases') }, `Dismiss ${picked.size} ticked`) : null,
      spawnIdle.length ? h('button', { onclick: () => bulk(spawnIdle, 'automatic spawn checks nobody reported') }, `Dismiss all ${spawnIdle.length} automatic spawn checks`) : null,
    ].filter(Boolean));
  }

  /** One case: its line, and its words when opened. */
  function row(/** @type {any} */ c) {
    const box = h('div', { class: 'card', style: 'padding:10px 12px;margin:0 0 8px' });
    const body = h('div');
    const n = Number(c.reports) || 0;
    const tick = h('input', { type: 'checkbox', checked: picked.has(c.id), title: 'Tick to dismiss with others',
      onclick: (/** @type {any} */ e) => { e.stopPropagation(); if (e.target.checked) picked.add(c.id); else picked.delete(c.id); load(); } });
    const reasons = (c.reasons ?? []).length ? ` for ${c.reasons.join(', ')}` : '';
    const who = n ? `${n} report${n === 1 ? '' : 's'}${reasons}` : 'nobody reported it';
    const arrow = h('span', { class: 'dim' }, open.has(c.id) ? '▲' : '▼');
    const toggle = () => { if (open.has(c.id)) { open.delete(c.id); body.replaceChildren(); } else { open.add(c.id); detail(c, body); } arrow.textContent = open.has(c.id) ? '▲' : '▼'; };
    box.append(
      h('div', { class: 'row click', style: 'gap:10px;align-items:center;cursor:pointer', onclick: toggle },
        tick, chip(c.level),
        h('span', { class: 'grow', style: 'white-space:normal;flex:1' },
          h('b', null, c.name), ' ', h('span', { class: 'dim' }, `${KIND[c.kind] ?? c.kind} · ${who}`),
          c.claim ? h('span', { class: 'dim' }, ` · taken by ${c.claim.mine ? 'you' : c.claim.name ?? 'staff'}`) : null,
          h('div', { class: 'dim', style: 'font-size:12.5px' }, `Why ${c.level}: ${(c.why ?? []).filter((w) => !/^\d+ reporters?$/.test(w)).join('; ') || 'nothing urgent'}`)),
        h('span', { class: 'dim' }, ago(c.lastReport || c.openedAt)),
        arrow),
      body);
    if (open.has(c.id)) detail(c, body);
    return box;
  }

  async function detail(/** @type {any} */ c, /** @type {HTMLElement} */ body) {
    body.replaceChildren(h('div', { class: 'dim', style: 'margin-top:8px' }, 'Loading...'));
    const j = await call('/v1/staff/case', { target: c.target, case: c.id });
    if (j.error) { body.replaceChildren(h('div', { class: 'bad', style: 'margin-top:8px' }, why(j))); return; }
    const k = j.case ?? {};
    const lines = k.lines ?? [];
    const strikes = j.record?.strikes ?? null;
    const done = () => { open.delete(c.id); load(); };
    const mute = h('select', null, MUTES.map(([v, t]) => h('option', { value: v, selected: v === 60 }, t)));
    const ban = h('select', null, BANS.map(([v, t]) => h('option', { value: v, selected: v === 7 }, t)));
    const reason = h('input', { type: 'text', placeholder: 'reason (shown to them)', style: 'min-width:180px' });
    body.replaceChildren(h('div', { class: 'section', style: 'margin-top:10px;display:flex;flex-direction:column;gap:10px' },
      h('div', { class: 'dim' }, KIND_WHAT[c.kind] ?? ''),
      h('div', null, h('b', null, lines.length ? 'What happened' : 'What happened: no lines kept'),
        lines.length ? h('div', { class: 'list', style: 'margin-top:4px' }, lines.map((l) => h('div', { class: 'li', style: 'white-space:normal;align-items:flex-start' },
          h('span', { class: 'dim', style: 'min-width:150px' }, when(l.at)),
          h('span', { class: 'grow', style: 'white-space:normal' }, h('b', null, `${l.name ?? ''}`), l.tab && TAB[l.tab] ? h('span', { class: 'dim' }, ` (${TAB[l.tab]})`) : null, ': ', l.text)))) : null),
      (k.notes ?? []).length || (k.reasons ?? []).length ? h('div', null, h('b', null, 'What the reporters said'),
        h('div', { class: 'dim' }, `Reasons: ${(k.reasons ?? []).join(', ') || '-'}`),
        (k.notes ?? []).map((/** @type {string} */ t) => h('div', { style: 'white-space:normal' }, `"${t}"`))) : null,
      strikes != null ? h('div', { class: 'dim' }, `Strikes on record: ${strikes}`) : null,
      h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;align-items:center' },
        h('button', { class: 'primary', onclick: async () => { if (await dismiss(c)) { toast(`${c.name}: dismissed, no action.`); done(); } } }, 'Dismiss (not a problem)'),
        h('span', { class: 'dim' }, '|'), mute,
        h('button', { onclick: async () => {
          const r = await call('/v1/staff/mute', { target: c.target, case: c.id, minutes: Number(mute.value), reason: reason.value.trim() || undefined, click: rid() });
          if (r.error) toast(why(r), true); else { toast(`${c.name}: muted, case closed.`); done(); }
        } }, 'Mute'),
        ban,
        h('button', { class: 'danger', onclick: async () => {
          if (!globalThis.confirm(`Ban ${c.name}? Every character on the account.`)) return;
          const r = await call('/v1/staff/ban', { target: c.target, case: c.id, days: Number(ban.value), reason: reason.value.trim() || undefined, click: rid() });
          if (r.error) toast(why(r), true); else { toast(`${c.name}: banned, case closed.`); done(); }
        } }, 'Ban'),
        reason,
        h('span', { style: 'flex:1' }),
        h('button', { class: 'ghost', onclick: () => openAccount(c.target, c.name) }, 'Open player')),
    ));
  }

  load();
}
