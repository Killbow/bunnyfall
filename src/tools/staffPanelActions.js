// @ts-check
// BUNNYFALL (2026-11-12): THE STAFF PANEL'S ACTION FORMS - every staff door of the account service (server-account/src
// staff*.js), as a row of fields and a button, grouped into the panel's tabs. A form only asks and shows: the service
// checks who may open each door (a Moderator is told `staff-admin` for an Admin's), writes the audit row and bounds every
// field. Field kinds:
//   ['who']               the picked player: sent as `target`, their account id (looked up from the name when typed)
//   ['char', 'id']        the picked character's id, under the key given (`id`: required; `char`: optional)
//   [key, 't', hint]      text     [key, 'n', hint] number     [key, 'b', label] checkbox (true when ticked)
//   [key, 's', 'a|b|c']   one of   [key, 'j', hint] JSON (an object or a list)
//   [key, 'x']            textarea (long text)
// `fixed` is sent as it is; `click` adds a one-time press id (Mute and Ban); `danger` asks before it sends.

/* global crypto, confirm */
/** @typedef {[string, string?, string?]} Field */
/** @typedef {{ t: string, p: string, f?: Field[], fixed?: object, click?: boolean, danger?: string, note?: string, give?: boolean }} Act */

/** @type {Record<string, { h: string, acts: Act[] }[]>} */
export const STAFF_TABS = {
  players: [
    { h: 'Find', acts: [
      { t: 'Search players', p: '/v1/staff/players', f: [['q', 't', 'handle starts with'], ['online', 'b', 'online now'], ['ban', 's', '|banned|muted']] },
      { t: 'Player card', p: '/v1/staff/player', f: [['who'], ['tab', 's', 'overview|skills|equipment|inventories|market|trades|economy|history'], ['char', 'char']] },
      { t: 'Devices', p: '/v1/staff/player/devices', f: [['who']] },
      { t: 'Strikes', p: '/v1/staff/strikes', f: [['who']] },
    ] },
    { h: 'Moderation', acts: [
      { t: 'Mute', p: '/v1/staff/mute', f: [['who'], ['minutes', 'n', 'minutes (0 lifts)'], ['case', 't', 'case id (optional)']], click: true },
      { t: 'Ban', p: '/v1/staff/ban', f: [['who'], ['days', 'n', 'days'], ['reason', 't', 'reason'], ['case', 't', 'case id (optional)']], click: true, danger: 'Ban this player?' },
      { t: 'Unban', p: '/v1/staff/unban', f: [['who']] },
      { t: 'Dismiss their case', p: '/v1/staff/dismiss', f: [['who'], ['case', 't', 'case id (optional)']] },
      { t: 'Freeze', p: '/v1/staff/freeze', f: [['who'], ['minutes', 'n', 'minutes'], ['reason', 't', 'reason']] },
      { t: 'Unfreeze', p: '/v1/staff/unfreeze', f: [['who']] },
      { t: 'Who is frozen', p: '/v1/staff/freezes' },
      { t: 'Banned list', p: '/v1/staff/banned', f: [['name', 't', 'name (optional)']] },
      { t: 'Sign them out everywhere', p: '/v1/staff/player/signout', f: [['who']], danger: 'Sign this player out of every device?' },
      { t: 'Rename', p: '/v1/staff/player/rename', f: [['who'], ['name', 't', 'new name']], danger: 'Rename this account?' },
    ] },
    { h: 'Notes, watch list, messages', acts: [
      { t: 'Notes', p: '/v1/staff/notes', f: [['who']] },
      { t: 'Add a note', p: '/v1/staff/notes/add', f: [['who'], ['text', 't', 'the note']] },
      { t: 'My watch list', p: '/v1/staff/watch' },
      { t: 'Watch them', p: '/v1/staff/watch/add', f: [['who']] },
      { t: 'Stop watching', p: '/v1/staff/watch/remove', f: [['who']] },
      { t: 'Watch list events', p: '/v1/staff/watch/events' },
      { t: 'Message on their screen', p: '/v1/staff/message', f: [['who'], ['text', 't', 'up to 200 characters']] },
      { t: 'Messages sent', p: '/v1/staff/messages', f: [['who']] },
      { t: 'Monster reports', p: '/v1/staff/monsters' },
    ] },
  ],
  items: [
    { h: 'Give and take items', acts: [
      { t: 'Item catalogue', p: '/v1/staff/item/catalogue' },
      { t: 'Give an item', p: '/v1/staff/item/give', give: true, note: 'Check first: it shows the piece and the character\'s save number; Give sends it.',
        f: [['char', 'id'], ['template', 'n', 'template'], ['group', 'n', 'group'], ['material', 'n', 'material'], ['count', 'n', 'count'], ['gold', 'n', 'gold'],
          ['enchant', 'j', 'enchantments [..] (optional)'], ['reason', 's', 'bug-refund|event-prize|compensation|testing|other'], ['note', 't', 'note (required)']] },
      { t: 'Take an item', p: '/v1/staff/item/take', f: [['char', 'id'], ['key', 't', 'item uid'], ['note', 't', 'note'], ['confirm', 'b', 'confirm']] },
      { t: 'Destroy marked copies', p: '/v1/staff/item/purge-dupes', f: [['char', 'id'], ['note', 't', 'note'], ['confirm', 'b', 'confirm']], danger: 'Destroy every marked copy on this character?' },
      { t: 'Findings', p: '/v1/staff/findings', f: [['char', 'id']] },
      { t: 'Roll back to the clean save', p: '/v1/staff/rollback', f: [['char', 'id'], ['note', 't', 'note'], ['confirm', 'b', 'confirm']], danger: 'Roll this character back?' },
    ] },
    { h: 'Fixes', acts: [
      { t: 'Letter', p: '/v1/staff/fix/letter', f: [['char', 'id'], ['note', 't', 'note']] },
      { t: 'Repair', p: '/v1/staff/fix/repair', f: [['char', 'id'], ['note', 't', 'note']] },
      { t: 'Mend', p: '/v1/staff/fix/mend', f: [['char', 'id'], ['note', 't', 'note']] },
      { t: 'Bank', p: '/v1/staff/fix/bank', f: [['char', 'id'], ['note', 't', 'note']] },
    ] },
    { h: 'Trade holds and evidence', acts: [
      { t: 'Trade holds', p: '/v1/staff/trade-holds' },
      { t: 'Hold the whole account', p: '/v1/staff/trade-hold', f: [['who'], ['note', 't', 'note']] },
      { t: 'Hold one character', p: '/v1/staff/trade-hold', f: [['char', 'id'], ['note', 't', 'note']] },
      { t: 'Lift a hold', p: '/v1/staff/trade-unhold', f: [['char', 'id'], ['note', 't', 'note'], ['confirm', 'b', 'confirm']] },
      { t: 'Gains (who got rich fast)', p: '/v1/staff/gains', f: [['days', 'n', 'days']] },
      { t: 'Evidence', p: '/v1/staff/evidence', f: [['who']] },
      { t: 'Put evidence back', p: '/v1/staff/evidence/return', f: [['id', 't', 'evidence id'], ['note', 't', 'note']] },
    ] },
    { h: 'Market', acts: [
      { t: 'Reported listings', p: '/v1/staff/market/reported' },
      { t: 'Pull a listing (back to its seller)', p: '/v1/staff/market/pull', f: [['listing', 't', 'listing id'], ['reason', 's', 'duplicated|duped-gold|bug-reward|other'], ['note', 't', 'note']] },
      { t: 'Remove a listing', p: '/v1/staff/market/remove', f: [['listing', 't', 'listing id'], ['reason', 's', 'duplicated|duped-gold|bug-reward|other'], ['note', 't', 'note']], danger: 'Remove this listing for good?' },
    ] },
    { h: 'Economy and census', acts: [
      { t: 'Economy', p: '/v1/staff/econ/economy', f: [['days', 'n', 'days']] },
      { t: 'Money stream', p: '/v1/staff/econ/stream' },
      { t: 'Harvests', p: '/v1/staff/econ/harvests', f: [['name', 't', 'player (optional)']] },
      { t: 'Guilds', p: '/v1/staff/econ/guilds' },
      { t: 'Item census', p: '/v1/staff/census' },
      { t: 'Find an item', p: '/v1/staff/census/find', f: [['q', 't', 'name or uid']] },
      { t: 'Jumps', p: '/v1/staff/census/jumps' },
      { t: 'Contested pieces', p: '/v1/staff/contested' },
      { t: 'One piece', p: '/v1/staff/contested/piece', f: [['uid', 't', 'uid']] },
      { t: 'Its trail', p: '/v1/staff/contested/trail', f: [['uid', 't', 'uid']] },
    ] },
  ],
  reports: [
    { h: 'Reports', acts: [
      { t: 'Open cases', p: '/v1/staff/cases' },
      { t: 'Their case', p: '/v1/staff/case', f: [['who']] },
      { t: 'Claim their case', p: '/v1/staff/claim', f: [['who']] },
      { t: 'Release it', p: '/v1/staff/release', f: [['who']] },
      { t: 'Reported board posts', p: '/v1/staff/board/reported' },
      { t: 'Moderate a post', p: '/v1/staff/board/moderate', f: [['act', 's', 'remove|restore'], ['id', 't', 'post id']] },
      { t: 'Reactions', p: '/v1/staff/reactions' },
    ] },
    { h: 'Events', acts: [
      { t: 'Events', p: '/v1/staff/events' },
      { t: 'Start an event', p: '/v1/staff/event', fixed: { op: 'start' }, note: 'Where I stand fills the place from the game.', f: [['ev', 'j', '{ "rg": .., "loc": .., "nm": "..", "mt": [..], "n": .., "m": .., "mins": .. }']] },
      { t: 'Bring the boss', p: '/v1/staff/event', fixed: { op: 'boss' }, f: [['id', 't', 'event id']] },
      { t: 'End an event', p: '/v1/staff/event', fixed: { op: 'end' }, f: [['id', 't', 'event id']] },
      { t: 'Clear one from the list', p: '/v1/staff/event', fixed: { op: 'clear' }, f: [['id', 't', 'event id']] },
    ] },
    { h: 'Notices and settings', acts: [
      { t: 'Send a notice to everyone', p: '/v1/staff/notice', f: [['subject', 't', 'subject'], ['body', 'x', 'the notice'], ['days', 'n', 'days shown']], danger: 'Send this notice to every player?' },
      { t: 'My settings', p: '/v1/staff/settings' },
      { t: 'Save my settings', p: '/v1/staff/settings/save', f: [['settings', 'j', '{ ... }']] },
      { t: 'AI score', p: '/v1/staff/ai-score', f: [['days', 'n', 'days']] },
    ] },
    { h: 'Server', acts: [
      { t: 'Status', p: '/v1/staff/status' },
      { t: 'Limits', p: '/v1/staff/limits' },
      { t: 'Set a limit', p: '/v1/staff/limit/set', f: [['metric', 't', 'metric'], ['amber', 'n', 'amber'], ['red', 'n', 'red']] },
      { t: 'Network', p: '/v1/staff/net' },
    ] },
    { h: 'Staff team', acts: [
      { t: 'Me', p: '/v1/staff/me' },
      { t: 'Team', p: '/v1/staff/team' },
      { t: 'Moderators', p: '/v1/staff/mods' },
      { t: 'Make a moderator', p: '/v1/staff/mod/add', f: [['handle', 't', 'handle']] },
      { t: 'Remove a moderator', p: '/v1/staff/mod/remove', f: [['handle', 't', 'handle']], danger: 'Remove this moderator?' },
      { t: 'Invite to staff', p: '/v1/staff/invite', f: [['handle', 't', 'handle']] },
      { t: 'Cut from staff', p: '/v1/staff/cut', f: [['handle', 't', 'handle']], danger: 'Cut this member from staff?' },
      { t: 'Staff keys', p: '/v1/staff/keys' },
      { t: 'Forget a key', p: '/v1/staff/key/forget', f: [['id', 't', 'key id']] },
      { t: 'Sign out every staff session', p: '/v1/staff/logout', fixed: { all: true }, danger: 'Sign out every one of your staff sessions?' },
    ] },
  ],
};

// ── showing an answer ──
const TIME_KEY = /(At|at|until|Until|since|time)$/;
const cellText = (/** @type {string} */ k, /** @type {any} */ v) => {
  if (v == null) return '';
  if (typeof v === 'number' && TIME_KEY.test(k) && v > 1e9 && v < 1e11) return new Date(v * 1000).toLocaleString();
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
};
const el = (/** @type {string} */ tag, text = '', cls = '') => { const e = document.createElement(tag); e.textContent = text; if (cls) e.className = cls; return e; };

/**
 * Draw a service answer: lists of rows as tables, the rest as key and value. A players list's row and a characters
 * list's row get a Pick button. @param {HTMLElement} into @param {any} j
 * @param {{ pickPlayer: (id: string, name: string) => void, pickChar: (id: string, name: string) => void }} picks
 */
export function showAnswer(into, j, picks) {
  into.replaceChildren();
  if (j == null || typeof j !== 'object') { into.append(el('pre', String(j))); return; }
  const kv = el('div', '', 'kv');
  for (const [k, v] of Object.entries(j)) {
    if (Array.isArray(v) && v.some((r) => r && typeof r === 'object' && !Array.isArray(r))) {
      into.append(el('h3', `${k} (${v.length})`));
      const box = el('div', '', 'scroll'); box.append(table(k, v, picks)); into.append(box);
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      into.append(el('h3', k));
      const inner = el('div', '', 'kv');
      for (const [k2, v2] of Object.entries(v)) inner.append(el('b', k2), el('span', cellText(k2, v2)));
      into.append(inner);
      if (k === 'account' && typeof v.id === 'string') picks.pickPlayer(v.id, v.handle ?? v.guestName ?? v.name ?? v.id);
    } else kv.append(el('b', k), el('span', cellText(k, v)));
  }
  if (kv.childElementCount) into.prepend(kv);
}

function table(/** @type {string} */ key, /** @type {any[]} */ rows, /** @type {any} */ picks) {
  const cols = [...new Set(rows.flatMap((r) => (r && typeof r === 'object' ? Object.keys(r) : [])))];
  const charRows = key === 'characters' || key === 'chars';
  const playerRows = ['players', 'watch', 'online', 'banned', 'freezes', 'frozen', 'team', 'mods'].includes(key);
  const t = document.createElement('table');
  const head = t.createTHead().insertRow();
  if (charRows || playerRows) head.append(el('th', ''));
  for (const c of cols) head.append(el('th', c));
  const body = t.createTBody();
  for (const r of rows) {
    const tr = body.insertRow();
    if (charRows || playerRows) {
      const td = tr.insertCell();
      const id = r?.sub ?? r?.target ?? r?.id, name = r?.name ?? r?.handle ?? r?.guestName ?? id;
      if (typeof id === 'string') {
        const b = el('button', 'Pick');
        b.onclick = () => (charRows ? picks.pickChar(id, name) : picks.pickPlayer(id, name));
        td.append(b);
      }
    }
    for (const c of cols) { const td = el('td', cellText(c, r?.[c])); td.title = td.textContent ?? ''; tr.append(td); }
  }
  return t;
}

/**
 * Build a tab's forms. @param {HTMLElement} into @param {{ h: string, acts: Act[] }[]} groups
 * @param {{ send: (act: Act, body: any, out: HTMLElement) => Promise<any>, who: () => Promise<string|null>, char: () => string,
 *   extra?: (act: Act, row: HTMLElement, read: () => any, fields: Map<string, HTMLElement>) => void }} ctx
 */
export function buildActs(into, groups, ctx) {
  for (const g of groups) {
    into.append(el('h2', g.h));
    for (const act of g.acts) {
      const box = el('div', '', 'act');
      const row = el('div', '', 'row');
      row.append(el('b', act.t));
      /** @type {Map<string, HTMLElement>} */
      const fields = new Map();
      for (const [key, kind = 't', hint = ''] of act.f ?? []) {
        if (key === 'who' || key === 'char') continue;
        /** @type {any} */ let input;
        if (kind === 'b') { const l = el('label'); input = document.createElement('input'); input.type = 'checkbox'; l.append(input, hint || key); row.append(l); }
        else if (kind === 's') { input = document.createElement('select'); for (const o of hint.split('|')) { const op = /** @type {HTMLOptionElement} */ (el('option', o || '(any)')); op.value = o; input.append(op); } row.append(input); }
        else if (kind === 'x' || kind === 'j') { input = document.createElement('textarea'); input.placeholder = hint; input.spellcheck = false; }
        else { input = document.createElement('input'); input.type = kind === 'n' ? 'number' : 'text'; input.placeholder = hint || key; row.append(input); }
        fields.set(key, input);
      }
      const uses = (act.f ?? []).map((f) => f[0]);
      if (uses.includes('who')) row.append(el('span', '(picked player)', 'dim'));
      if (act.f?.some((f) => f[0] === 'char')) row.append(el('span', '(picked character)', 'dim'));
      const out = el('div');
      const read = () => {
        /** @type {any} */ const body = { ...(act.fixed ?? {}) };
        for (const [key, kind = 't'] of act.f ?? []) {
          if (key === 'who' || key === 'char') continue;
          const input = /** @type {any} */ (fields.get(key));
          if (kind === 'b') { if (input.checked) body[key] = true; continue; }
          const v = String(input.value ?? '').trim();
          if (!v) continue;
          if (kind === 'n') body[key] = Number(v);
          else if (kind === 'j') body[key] = JSON.parse(v);
          else body[key] = v;
        }
        return body;
      };
      const go = async (/** @type {any} */ more = {}) => {
        let body;
        try { body = { ...read(), ...more }; } catch { out.replaceChildren(el('div', 'That JSON does not read. Check its brackets and quotes.', 'bad')); return null; }
        if (uses.includes('who')) { const id = await ctx.who(); if (!id) { out.replaceChildren(el('div', 'Pick a player first (the Player box above).', 'bad')); return null; } body.target = id; }
        const charField = act.f?.find((f) => f[0] === 'char');
        if (charField) {
          const c = ctx.char(), at = charField[1] ?? 'char';
          if (c) body[at] = c;
          else if (at === 'id') { out.replaceChildren(el('div', 'Pick a character first (open a player card, then Pick).', 'bad')); return null; }
        }
        if (act.click) body.click = crypto.randomUUID();
        if (act.danger && !confirm(act.danger)) return null;
        return ctx.send(act, body, out);
      };
      if (act.give) {
        let seq = /** @type {number|null} */ (null);
        const check = el('button', 'Check'); check.onclick = async () => { const j = await go(); seq = Number.isSafeInteger(j?.seq) ? j.seq : null; };
        const give = el('button', 'Give'); give.onclick = async () => {
          if (seq == null) { out.replaceChildren(el('div', 'Check first: the give needs the save number it read.', 'bad')); return; }
          const j = await go({ confirm: true, seq }); if (j && !j.error) seq = Number.isSafeInteger(j.seq) ? j.seq : null;
        };
        row.append(check, give);
      } else {
        const b = el('button', 'Go'); if (act.danger) b.className = 'warn'; b.onclick = () => go(); row.append(b);
      }
      box.append(row);
      for (const [, input] of fields) if (input.tagName === 'TEXTAREA') box.append(input);
      if (act.note) box.append(el('div', act.note, 'dim'));
      ctx.extra?.(act, row, read, fields);
      box.append(out);
      into.append(box);
    }
  }
}
