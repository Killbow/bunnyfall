// @ts-check
// BUNNYFALL (2026-11-06): staff.html - the staff page of this fork. A staff member signs in (password, or password + a
// key this browser makes).
// BUNNYFALL (2026-11-12, the owner: "make the entire staff panel and staff.html merged into one staff panel i can access
// in game"): the same page opens on its own in a browser and inside the game's staff window (ui/staffDock.js,
// `?embed=1`), where it also holds the staff hook's half the old browser extension held (net/staffHook.js): Follow, the
// live map, Hide me and the staff tags, through the dock's relay.
// BUNNYFALL (2026-11-12, the owner: "the web page is bad, all the go buttons, all the searches manually, this needs a
// complete rework for ease of use"; asked: "a dashboard home page and lets me search from a list of proper chars",
// "Events and notices, Give and fix" first): THE REWORK. A Home of what needs a look (who is on, open reports, live
// events, quick actions), one search over every character as you type, a character's page with its buttons (each a
// small dialog that asks only what it needs), Events and Notices pages in plain fields, and the rest under More. The
// older form-per-route page lives on as More > All tools (staffPanelActions.js).
/* global btoa, atob, sessionStorage, confirm, crypto, Node */
import { selfAccountUrl } from '../net/selfHost.js';
import { STAFF_TABS, showAnswer, buildActs } from './staffPanelActions.js';
import { reportsView } from './staffReports.js';   // BUNNYFALL: the open reports, readable and closable
import { MOBILE_TYPES } from '../characters/mobile/mobileTypes.js';

const $ = (/** @type {string} */ id) => /** @type {any} */ (document.getElementById(id));
const KEY_STORE = 'bunnyfall-staff-key';
const SESSION_STORE = 'bunnyfall-staff-session';
const enc = new TextEncoder();
const b64u = (/** @type {Uint8Array} */ b) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A DOM node: `h('button', { class: 'primary', onclick }, 'Give')`. Children: strings, nodes, arrays, null. @returns {any} */
function h(/** @type {string} */ tag, /** @type {any} */ props = null, /** @type {any[]} */ ...kids) {
  const e = /** @type {any} */ (document.createElement(tag));
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k in e && k !== 'list') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  const add = (/** @type {any} */ k) => { if (k == null || k === false) return; if (Array.isArray(k)) k.forEach(add); else e.append(k instanceof Node ? k : String(k)); };
  kids.forEach(add);
  return e;
}
const when = (/** @type {any} */ s) => (s ? new Date(s * 1000).toLocaleString() : '-');
const ago = (/** @type {any} */ s) => {
  if (!s) return '-';
  const d = Math.max(0, Date.now() / 1000 - s);
  return d < 90 ? 'just now' : d < 5400 ? `${Math.round(d / 60)} min ago` : d < 129600 ? `${Math.round(d / 3600)} h ago` : `${Math.round(d / 86400)} days ago`;
};
const pretty = (/** @type {string} */ k) => k.replace(/[_-]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
const rid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 24);

/** In game: inside the staff dock's window (ui/staffDock.js), which carries the game's staff hook. */
const embedded = new URLSearchParams(location.search).has('embed') && window.parent !== window;
if (embedded) document.body.classList.add('embed');

let session = '';
try { session = sessionStorage.getItem(SESSION_STORE) ?? ''; } catch { /* no storage */ }
/** @type {any} */ let me = null;

// ═══ THE KEY (an older sign-in, kept) ═══
async function loadKey() {
  try {
    const raw = localStorage.getItem(KEY_STORE);
    if (raw) { const { priv, pub } = JSON.parse(raw); return { pub, key: await crypto.subtle.importKey('jwk', priv, { name: 'Ed25519' }, false, ['sign']) }; }
  } catch { /* make one */ }
  return makeKey();
}
async function makeKey() {
  const pair = /** @type {CryptoKeyPair} */ (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']));
  const priv = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const pub = b64u(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
  try { localStorage.setItem(KEY_STORE, JSON.stringify({ priv, pub })); } catch { /* this page only */ }
  return { pub, key: await crypto.subtle.importKey('jwk', priv, { name: 'Ed25519' }, false, ['sign']) };
}
/** @type {{ pub: string, key: CryptoKey } | null} */
let keyed = null;
async function showKey() {
  try { keyed = await loadKey(); } catch { $('keyLine').textContent = 'This browser cannot make an Ed25519 key.'; return; }
  $('keyLine').textContent = `OWNER_KEYS = "${$('handle').value.trim() || 'Killbunny'}:${keyed.pub}"`;
}

// ═══ THE CALLS ═══
async function call(/** @type {string} */ path, body = {}) {
  let r;
  try { r = await fetch(`${selfAccountUrl()}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(session ? { 'x-staff-session': session } : {}) }, body: JSON.stringify(body) }); }
  catch { return { error: 'offline' }; }
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = { error: text.slice(0, 120) || `http ${r.status}` }; }
  if (!r.ok && !j.error) j.error = `http ${r.status}`;
  if (j.error === 'staff-session') signedOut();
  return j;
}
const WORDS = {
  'staff-login': 'Wrong handle or password, or this account is not staff.', rate: 'Too many tries. Wait a few minutes.', offline: 'The server could not be reached.',
  'staff-admin': 'Only an Admin can do that.', 'staff-owner': 'Only the owner can do that.', 'staff-session': 'Signed out. Sign in again.',
  'no-player': 'No such player.', ambiguous: 'More than one guest has that name.', 'no-data': 'No save data there.', 'bad-query': 'Only one SELECT.',
  'staff-reason': 'Pick a reason.', 'staff-note': 'Write a note: it goes in the audit log.', seq: 'Their save changed meanwhile. Try again.', body: 'Something in the form is missing or wrong.',
  'no-realm-character': 'No such character.', 'staff-self': 'Not on yourself.', 'not-found': 'The server does not know this yet (restart the account service).',
  'staff-item-template': 'That item cannot be made like that (count, material or kind).', 'staff-item-enchant': 'Those enchantments do not fit.',
  'staff-item-unlawful': 'The game would flag that item as impossible.', dead: 'That character is dead.', 'no-clean': 'There is no clean save to roll back to.',
  'service-moved': 'The server moved items since the clean save (a sale or trade), so a rollback would duplicate them.', 'bank-moved': 'Their bank changed meanwhile. Open it again.',
  'greed-amount': 'Give between 1 and 1,000,000 gold, or 1 and 1,000 Dusk Tokens.', 'greed-no-player': 'No such player.', 'bad-minutes': 'Pick a time.', 'bad-days': 'A ban is 1 to 365 days, or forever.',
  'no-case': 'That case is already closed.', 'case-closed': 'That case is already closed.', 'case-acted': 'Someone is acting on that case right now. Refresh.',
  'staff-claimed': 'Another staff member has taken that case.', 'not-developer': 'Only a developer can close a spawn check.', 'not-moderator': 'Only a moderator can do that.',
  'watch-full': 'Your watch list is full.', 'not-watched': 'Not on your watch list.', 'staff-message-long': 'Keep it under 200 characters.',
};
const why = (/** @type {any} */ j) => {
  const e = String(j?.error ?? '');
  if (e.startsWith('event-bad-')) return `The event's ${({ paykills: 'kills needed', bossname: 'boss name', words: 'text', label: 'map label', announce: 'announce switch' })[e.slice(10)] ?? e.slice(10)} is not right.`;
  return `${WORDS[/** @type {keyof typeof WORDS} */ (e)] ?? e}${j?.message ? ` (${j.message})` : ''}`;
};
let toastTimer = 0;
function toast(/** @type {string} */ text, bad = false) {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: `toast${bad ? ' bad' : ''}` }, text);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.remove(), 3500);
}

// ═══ SIGN IN / OUT ═══
async function signIn() {
  const handle = $('handle').value.trim();
  /** @type {any} */ let body = { handle, password: $('password').value };
  if ($('useKey').checked) {
    if (!keyed) await showKey();
    if (!keyed) return;
    const ts = Math.floor(Date.now() / 1000);
    const sig = b64u(new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, keyed.key, enc.encode(`dfo-staff:v1:login:${handle.toLowerCase()}:${ts}`))));
    body = { ...body, pub: keyed.pub, ts, sig };
  }
  $('loginMsg').textContent = 'Signing in...'; $('loginMsg').className = 'dim';
  const j = await call('/v1/staff/login', body);
  if (j.error) { $('loginMsg').textContent = why(j); $('loginMsg').className = 'bad'; return; }
  session = j.session;
  try { sessionStorage.setItem(SESSION_STORE, session); } catch { /* this page only */ }
  $('password').value = '';
  opened(j);
}
function opened(/** @type {any} */ who) {
  me = who;
  $('login').hidden = true; $('app').hidden = false;
  $('who').textContent = `${who.handle} · ${who.owner ? 'owner' : who.role}`;
  loadChars();
  doorOpen();
  go('home');
}
function signedOut() {
  session = ''; me = null;
  try { sessionStorage.removeItem(SESSION_STORE); } catch { /* */ }
  $('login').hidden = false; $('app').hidden = true;
}

// ═══ THE CHARACTERS (searched as you type) ═══
/** @type {any[]} */ let chars = [];
let charsAt = 0;
async function loadChars(force = false) {
  if (!force && chars.length && Date.now() - charsAt < 60_000) return chars;
  const j = await call('/v1/staff/chars');
  if (!j.error) { chars = j.chars ?? []; charsAt = Date.now(); }
  return chars;
}
const norm = (/** @type {string} */ s) => String(s ?? '').toLowerCase();
function findChars(/** @type {string} */ q, max = 30) {
  const n = norm(q).trim();
  if (!n) return [];
  const hit = chars.filter((c) => norm(c.name).includes(n) || norm(c.account?.name).includes(n) || c.id === q || c.account?.id === q);
  hit.sort((a, b) => Number(norm(b.name).startsWith(n)) - Number(norm(a.name).startsWith(n)) || Number(b.playing) - Number(a.playing) || (b.savedAt ?? 0) - (a.savedAt ?? 0));
  return hit.slice(0, max);
}
const charLine = (/** @type {any} */ c) => spaced(
  h('b', null, c.name), h('span', { class: 'dim' }, `lvl ${c.level ?? '?'}${c.className ? ` ${c.className}` : ''} · ${c.account?.name ?? ''}`),
  c.playing ? h('span', { class: 'chip on' }, 'playing') : null, c.dead ? h('span', { class: 'chip bad' }, 'dead') : null,
  c.banned ? h('span', { class: 'chip bad' }, 'banned') : null, c.muted ? h('span', { class: 'chip warn' }, 'muted') : null, c.frozen ? h('span', { class: 'chip warn' }, 'frozen') : null,
);
const charChips = (/** @type {any} */ c) => charLine(c).slice(4);
/** Nodes with a space between each, the missing left out. @param {any[]} xs */
function spaced(...xs) { return xs.filter((x) => x != null && x !== false).flatMap((x, i) => (i ? [' ', x] : [x])); }
/** replaceChildren, the missing left out. @param {any} e @param {any[]} kids */
const put = (e, ...kids) => e.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));

/** A search box with a list under it: picks a character. @param {HTMLInputElement} input @param {HTMLElement} drop @param {(c: any) => void} pick */
function searchBox(input, drop, pick) {
  let hi = 0, list = /** @type {any[]} */ ([]);
  const draw = () => {
    list = findChars(input.value);
    drop.replaceChildren(...list.map((c, i) => h('div', { class: `item${i === hi ? ' hi' : ''}`, onmousedown: (/** @type {Event} */ e) => { e.preventDefault(); choose(c); } }, charLine(c))));
    if (!list.length && input.value.trim()) drop.append(h('div', { class: 'item dim' }, chars.length ? 'No character by that name.' : 'Loading the characters...'));
    drop.hidden = !input.value.trim();
  };
  const choose = (/** @type {any} */ c) => { drop.hidden = true; input.value = ''; pick(c); };
  input.addEventListener('input', () => { hi = 0; draw(); });
  input.addEventListener('focus', () => { loadChars().then(draw); });
  input.addEventListener('blur', () => setTimeout(() => { drop.hidden = true; }, 120));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { hi = Math.min(hi + 1, list.length - 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { hi = Math.max(hi - 1, 0); draw(); e.preventDefault(); }
    else if (e.key === 'Enter' && list[hi]) choose(list[hi]);
    else if (e.key === 'Escape') { input.value = ''; drop.hidden = true; }
  });
}

// ═══ DIALOGS ═══
/** Open a dialog. `run` returns false (or an error string) to stay open. @param {string} title @param {string} sub
 *  @param {any[]} body @param {{ label?: string, danger?: boolean, run?: () => Promise<boolean|string|void> }} [act] */
function dialog(title, sub, body, act = {}) {
  const msg = h('span', { class: 'msg dim' });
  const close = () => { veil.remove(); window.removeEventListener('keydown', onKey, true); };
  const onKey = (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const btn = act.run ? h('button', { class: act.danger ? 'danger' : 'primary' }, act.label ?? 'OK') : null;
  if (btn) btn.onclick = async () => {
    btn.disabled = true; msg.className = 'msg dim'; msg.textContent = 'Working...';
    let r;
    try { r = await act.run?.(); } catch (e) { r = String(/** @type {any} */ (e)?.message ?? e); }
    btn.disabled = false;
    if (typeof r === 'string') { msg.className = 'msg bad'; msg.textContent = r; return; }
    if (r === false) { msg.textContent = ''; return; }
    close();
  };
  const veil = h('div', { class: 'veil', onmousedown: (/** @type {any} */ e) => { if (e.target === veil) close(); } },
    h('div', { class: 'dialog' }, h('h3', null, title), sub ? h('div', { class: 'sub' }, sub) : null, body,
      h('div', { class: 'foot' }, msg, h('button', { class: 'ghost', onclick: close }, act.run ? 'Cancel' : 'Close'), btn)));
  document.body.append(veil);
  window.addEventListener('keydown', onKey, true);
  /** @type {any} */ (veil.querySelector('input, textarea, select'))?.focus();
  return { close, msg };
}
const field = (/** @type {string} */ label, /** @type {any} */ input, /** @type {string} */ hint = '') => h('label', { class: 'field' }, h('span', null, label), input, hint ? h('span', null, hint) : null);
const sel = (/** @type {[any, string][]} */ opts, /** @type {any} */ v = undefined) => {
  const s = h('select', null, opts.map(([val, text]) => h('option', { value: String(val) }, text)));
  if (v !== undefined) s.value = String(v);
  return s;
};

// ═══ THE PAGES ═══
const PAGES = [['home', 'Home'], ['chars', 'Characters'], ['events', 'Events'], ['notices', 'Notices'], ['more', 'More']];
let page = 'home';
let refresh = 0;
function go(/** @type {string} */ to, /** @type {any} */ arg = null) {
  page = to;
  clearInterval(refresh); refresh = 0;
  $('nav').replaceChildren(...PAGES.map(([k, label]) => h('button', { class: (to === k || (to === 'char' && k === 'chars') || (to.startsWith('more') && k === 'more')) ? 'on' : '', onclick: () => go(k) }, label)));
  const root = $('page');
  root.replaceChildren();
  window.scrollTo(0, 0);
  if (to === 'home') homePage(root);
  else if (to === 'chars') charsPage(root);
  else if (to === 'char') charPage(root, arg);
  else if (to === 'events') eventsPage(root);
  else if (to === 'notices') noticesPage(root);
  else if (to === 'more') morePage(root);
  else if (to.startsWith('more:')) moreTool(root, to.slice(5));
}
const openChar = (/** @type {any} */ c) => go('char', c);
/** A list's loading line, then its items or its error. */
async function fill(/** @type {HTMLElement} */ box, /** @type {() => Promise<any[]|string>} */ get, empty = 'Nothing here.') {
  box.replaceChildren(h('div', { class: 'dim' }, 'Loading...'));
  const r = await get();
  if (typeof r === 'string') box.replaceChildren(h('div', { class: 'bad' }, r));
  else box.replaceChildren(...(r.length ? r : [h('div', { class: 'dim' }, empty)]));
}

// ── Home ──
function homePage(/** @type {HTMLElement} */ root) {
  const online = h('div', { class: 'list' }), reports = h('div', { class: 'list' }), events = h('div', { class: 'list' });
  const nOnline = h('span', { class: 'big' }, '-'), nReports = h('span', { class: 'big' }, '-'), nEvents = h('span', { class: 'big' }, '-');
  root.append(
    h('div', { class: 'card' }, h('h2', null, 'Quick actions'), h('div', { class: 'actions' },
      h('button', { class: 'primary', onclick: () => startEventDialog() }, 'Start an event'),
      h('button', { class: 'primary', onclick: () => noticeDialog() }, 'Send a notice'),
      h('button', { onclick: () => giveItemDialog(null) }, 'Give an item'),
      h('button', { onclick: () => greedDialog(null, 'gold') }, 'Give gold'),
      h('button', { onclick: () => greedDialog(null, 'nyx') }, 'Give Dusk Tokens'))),
    h('div', { class: 'grid section' },
      h('div', { class: 'card' }, h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, 'Playing now'), h('span', { style: 'flex:1' }), nOnline), h('div', { class: 'section' }, online)),
      h('div', { class: 'card' }, h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, 'Open reports'), h('span', { style: 'flex:1' }), nReports), h('div', { class: 'section' }, reports)),
      h('div', { class: 'card' }, h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, 'Events'), h('span', { style: 'flex:1' }), nEvents), h('div', { class: 'section' }, events))),
  );
  const load = () => {
    fill(online, async () => {
      await loadChars(true);
      const on = chars.filter((c) => c.playing);
      nOnline.textContent = String(on.length);
      return on.map((c) => h('div', { class: 'li click', onclick: () => openChar(c) }, h('span', { class: 'grow' }, charLine(c)),
        embedded ? h('button', { onclick: (/** @type {Event} */ e) => { e.stopPropagation(); follow(c); } }, 'Follow') : null));
    }, 'Nobody is playing.');
    fill(reports, async () => {
      const j = await call('/v1/staff/cases');
      if (j.error) { nReports.textContent = '-'; return why(j); }
      nReports.textContent = String(j.total ?? j.cases?.length ?? 0);
      return (j.cases ?? []).slice(0, 8).map((c) => h('div', { class: 'li click', onclick: () => go('more:reports') },   // BUNNYFALL: to the case, readable
        h('span', { class: `chip ${c.level === 'high' ? 'bad' : c.level === 'medium' ? 'warn' : ''}` }, c.level),
        h('span', { class: 'grow' }, h('b', null, c.name), ' ', h('span', { class: 'dim' }, `${c.reports} report${c.reports === 1 ? '' : 's'} · ${(c.reasons ?? []).join(', ')}`)),
        h('span', { class: 'dim' }, ago(c.lastReport || c.openedAt))));
    }, 'No open reports.');
    fill(events, async () => {
      const j = await call('/v1/staff/events');
      if (j.error) return why(j);
      const live = (j.events ?? []).filter((e) => e.live || e.state === 'live' || e.state === 'starting');
      nEvents.textContent = String(live.length);
      return live.length ? live.map(eventRow) : [h('div', { class: 'dim' }, 'No event running. '), h('div', null, h('button', { onclick: () => startEventDialog() }, 'Start one'))];
    });
  };
  load();
  refresh = window.setInterval(() => { if (page === 'home' && !document.querySelector('.veil')) load(); }, 30_000);
}

/** A report names an account: open its newest character, or its card. */
async function openAccount(/** @type {string} */ id, /** @type {string} */ name) {
  await loadChars();
  const c = chars.find((x) => x.account?.id === id);
  if (c) openChar(c); else go('char', { id: null, name, account: { id, name } });
}

// ── Characters ──
function charsPage(/** @type {HTMLElement} */ root) {
  const filter = h('input', { type: 'search', placeholder: 'Filter by name or player...' });
  const onlyOn = h('input', { type: 'checkbox' }), withDead = h('input', { type: 'checkbox' });
  const sort = sel([['seen', 'Last played'], ['name', 'Name'], ['level', 'Level']]);
  const box = h('div', { class: 'scroll' });
  const count = h('span', { class: 'dim' });
  const draw = () => {
    const q = norm(filter.value).trim();
    let list = chars.filter((c) => (!q || norm(c.name).includes(q) || norm(c.account?.name).includes(q)) && (!onlyOn.checked || c.playing) && (withDead.checked || !c.dead));
    const s = sort.value;
    list = [...list].sort((a, b) => (s === 'name' ? norm(a.name).localeCompare(norm(b.name)) : s === 'level' ? (b.level ?? 0) - (a.level ?? 0) : (b.savedAt ?? 0) - (a.savedAt ?? 0)));
    count.textContent = `${list.length} of ${chars.length}`;
    box.replaceChildren(h('table', null,
      h('thead', null, h('tr', null, ['Name', 'Level', 'Class', 'Race', 'Player', '', 'Last saved'].map((t) => h('th', null, t)))),
      h('tbody', null, list.slice(0, 500).map((c) => h('tr', { class: 'click', onclick: () => openChar(c) },
        h('td', null, h('b', null, c.name)), h('td', null, c.level ?? ''), h('td', null, c.className ?? ''), h('td', null, c.race ?? ''), h('td', null, c.account?.name ?? ''),
        h('td', null, charChips(c)), h('td', { class: 'dim' }, ago(c.savedAt)))))));
  };
  for (const x of [filter, onlyOn, withDead, sort]) x.addEventListener('input', draw);
  root.append(h('div', { class: 'card' },
    h('div', { class: 'row' }, filter, h('label', null, onlyOn, ' Playing now'), h('label', null, withDead, ' Show dead'), sort, h('span', { style: 'flex:1' }), count,
      h('button', { onclick: async () => { await loadChars(true); draw(); } }, 'Refresh')),
    h('div', { class: 'section' }, box)));
  loadChars().then(draw);
  filter.focus();
}

// ── One character ──
function charPage(/** @type {HTMLElement} */ root, /** @type {any} */ c) {
  const acct = c.account;
  const head = h('div', { class: 'card' });
  const details = h('div');
  const side = h('div');
  root.append(head, h('div', { class: 'grid section', style: 'grid-template-columns: minmax(0,2fr) minmax(280px,1fr)' }, h('div', null, details), side));
  head.append(
    h('div', { class: 'row' }, h('h1', null, c.name ?? acct.name), h('span', { class: 'dim' }, c.id ? `level ${c.level ?? '?'} ${c.race ?? ''} ${c.className ?? ''}` : 'no character'),
      ...charChips(c)),
    h('div', { class: 'dim' }, `Player ${acct.name}${acct.online ? ' · online' : ''}${c.savedAt ? ` · last saved ${ago(c.savedAt)}` : ''}`),
    h('div', { class: 'section' }, h('h2', null, 'Give and fix'), h('div', { class: 'actions' },
      h('button', { class: 'primary', onclick: () => giveItemDialog(c), disabled: !c.id }, 'Give an item'),
      h('button', { class: 'primary', onclick: () => greedDialog(c, 'gold') }, 'Give gold'),
      h('button', { class: 'primary', onclick: () => greedDialog(c, 'nyx') }, 'Give Dusk Tokens'),
      h('button', { onclick: () => bankDialog(c), disabled: !c.id }, 'Set bank gold'),
      h('button', { onclick: () => rollbackDialog(c), disabled: !c.id }, 'Roll back'))),
    h('div', { class: 'section' }, h('h2', null, 'Moderation'), h('div', { class: 'actions' },
      embedded ? h('button', { onclick: () => follow(c) }, 'Follow in game') : null,
      h('button', { onclick: () => messageDialog(c) }, 'Message on screen'),
      c.muted ? h('button', { onclick: () => quickAct(c, '/v1/staff/mute', { minutes: 0, click: rid() }, 'Unmuted.') }, 'Unmute') : h('button', { onclick: () => muteDialog(c) }, 'Mute'),
      c.frozen ? h('button', { onclick: () => quickAct(c, '/v1/staff/unfreeze', {}, 'Unfrozen.') }, 'Unfreeze') : h('button', { onclick: () => freezeDialog(c) }, 'Freeze'),
      c.banned ? h('button', { onclick: () => quickAct(c, '/v1/staff/unban', {}, 'Unbanned.') }, 'Unban') : h('button', { class: 'danger', onclick: () => banDialog(c) }, 'Ban'),
      h('button', { onclick: () => noteDialog(c) }, 'Add a note'),
      h('button', { onclick: () => quickAct(c, '/v1/staff/watch/add', {}, 'On your watch list.') }, 'Watch'),
      h('button', { class: 'danger', onclick: () => { if (confirm(`Sign ${acct.name} out of every device?`)) quickAct(c, '/v1/staff/player/signout', {}, 'Signed out.'); } }, 'Sign out everywhere'))),
  );
  // the details: the profile's tabs
  const TABS = [['overview', 'Overview'], ['inventories', 'Inventory'], ['equipment', 'Equipment'], ['skills', 'Skills'], ['economy', 'Economy'], ['market', 'Market'], ['trades', 'Trades'], ['history', 'History'], ['notes', 'Notes'], ['saves', 'Saves']];
  const tabBar = h('div', { class: 'tabs' }), out = h('div', { class: 'card' });
  details.append(tabBar, out);
  const show = async (/** @type {string} */ tab) => {
    tabBar.replaceChildren(...TABS.map(([k, label]) => h('button', { class: k === tab ? 'on' : '', onclick: () => show(k) }, label)));
    out.replaceChildren(h('div', { class: 'dim' }, 'Loading...'));
    if (tab === 'notes') return showNotes(acct, out);
    if (tab === 'saves') return savesOf(acct.id, out);
    const j = await call('/v1/staff/player', { target: acct.id, ...(tab !== 'overview' ? { tab } : {}), ...(c.id ? { char: c.id } : {}) });
    if (j.error) { out.replaceChildren(h('div', { class: 'bad' }, why(j))); return; }
    if (tab === 'overview') {
      const others = (j.characters ?? []).filter((/** @type {any} */ x) => x.id !== c.id);
      put(side,
        h('div', { class: 'card' }, h('h2', null, 'Account'), kv({ handle: j.account?.handle, created: when(j.account?.createdAt), 'last played': ago(j.account?.playedAt), 'time played': j.account?.playedS ? `${Math.round(j.account.playedS / 3600)} h` : '-', devices: j.devices,
          strikes: j.sanctions?.strikes, muted: j.sanctions?.mutedUntil ? `until ${when(j.sanctions.mutedUntil)}` : 'no', banned: j.sanctions?.bannedUntil ? `until ${when(j.sanctions.bannedUntil)}${j.sanctions.banReason ? ` (${j.sanctions.banReason})` : ''}` : 'no',
          frozen: j.sanctions?.frozenUntil ? `until ${when(j.sanctions.frozenUntil)}` : 'no' })),
        others.length ? h('div', { class: 'card' }, h('h2', null, 'Their other characters'), h('div', { class: 'list' }, others.map((/** @type {any} */ x) =>
          h('div', { class: 'li click', onclick: () => openChar({ ...x, account: acct }) }, h('span', { class: 'grow' }, h('b', null, x.name), ' ', h('span', { class: 'dim' }, `lvl ${x.level ?? '?'} ${x.className ?? ''}`)), x.dead ? h('span', { class: 'chip bad' }, 'dead') : null)))) : null,
        (j.openCases ?? []).length ? h('div', { class: 'card' }, h('h2', null, 'Open reports'), h('div', { class: 'list' }, j.openCases.map((/** @type {any} */ k) => h('div', { class: 'li' }, h('span', { class: 'grow' }, `${k.kind} · ${k.reports} reports`), h('span', { class: 'dim' }, ago(k.openedAt)))))) : null,
      );
      const mine = (j.characters ?? []).find((/** @type {any} */ x) => x.id === c.id);
      out.replaceChildren(mine ? kv({ level: mine.level, class: mine.className, race: mine.race, playing: mine.playing ? 'yes' : 'no', dead: mine.dead ? 'yes' : 'no', 'trade hold': mine.held ?? 'none', guild: mine.guild ? `${mine.guild.name} [${mine.guild.tag}] (${mine.guild.rank})` : 'none', 'law strikes': mine.lawStrikes, wealth: mine.wealth, 'renown xp': mine.renownXp }) : h('div', { class: 'dim' }, 'No character picked.'));
      return;
    }
    showAnswer(out, j, { pickPlayer: () => {}, pickChar: (id) => { const x = chars.find((y) => y.id === id); if (x) openChar(x); } });
  };
  show('overview');
}
const kv = (/** @type {Record<string, any>} */ o) => h('div', { class: 'kv' }, Object.entries(o).flatMap(([k, v]) => [h('b', null, k), h('span', null, v == null || v === '' ? '-' : String(v))]));
async function quickAct(/** @type {any} */ c, /** @type {string} */ path, /** @type {any} */ body, /** @type {string} */ done) {
  const j = await call(path, { target: c.account.id, ...body });
  if (j.error) toast(why(j), true); else { toast(done); await loadChars(true); const x = chars.find((y) => y.id === c.id); if (page === 'char' && x) openChar(x); }
}
async function showNotes(/** @type {any} */ acct, /** @type {HTMLElement} */ out) {
  const j = await call('/v1/staff/notes', { target: acct.id });
  if (j.error) { out.replaceChildren(h('div', { class: 'bad' }, why(j))); return; }
  const list = j.notes ?? [];
  out.replaceChildren(list.length ? h('div', { class: 'list' }, list.map((/** @type {any} */ n) => h('div', { class: 'li' }, h('span', { class: 'grow', style: 'white-space:normal' }, n.text ?? n.body ?? ''), h('span', { class: 'dim' }, `${n.byName ?? ''} · ${ago(n.at)}`)))) : h('div', { class: 'dim' }, 'No notes yet.'));
}

// ── the dialogs a character's buttons open ──
/** A character to act on: the one given, or a search inside the dialog. @returns {{ el: any, get: () => any }} */
function charChooser(/** @type {any} */ c) {
  if (c) return { el: null, get: () => c };
  let picked = /** @type {any} */ (null);
  const input = h('input', { type: 'search', placeholder: 'Type a character or player name...' });
  const drop = h('div', { class: 'drop', hidden: true });
  const shown = h('div', { class: 'dim', style: 'margin-top:4px' }, 'No one picked yet.');
  searchBox(input, drop, (x) => { picked = x; shown.replaceChildren(...charLine(x)); shown.className = 'row'; });
  return { el: field('Who', h('div', { class: 'search', style: 'max-width:none' }, input, drop, shown)), get: () => picked };
}

/** @type {any} */ let catalogue = null;
async function giveItemDialog(/** @type {any} */ c) {
  const who = charChooser(c);
  if (!catalogue) { const j = await call('/v1/staff/item/catalogue'); if (j.error) { toast(why(j), true); return; } catalogue = j; }
  let item = /** @type {any} */ (null);
  const q = h('input', { type: 'search', placeholder: 'Search items: sword, potion, letter of credit...' });
  const list = h('div', { class: 'picklist' });
  const extra = h('div');
  const group = h('select'), material = h('select'), count = h('input', { type: 'number', value: '1', min: '1' }), gold = h('input', { type: 'number', placeholder: 'gold the letter is worth' });
  const enchRows = h('div'), reason = sel(catalogue.reasons.map((/** @type {string} */ r) => [r, pretty(r)]), 'event-prize'), note = h('input', { type: 'text', placeholder: 'why (goes in the audit log)' });
  const drawList = () => {
    const n = norm(q.value).trim();
    const hit = catalogue.items.filter((/** @type {any} */ t) => !n || norm(t.name).includes(n)).slice(0, 60);
    list.replaceChildren(...hit.map((/** @type {any} */ t) => h('div', { class: `item${item?.i === t.i ? ' on' : ''}`, onclick: () => { item = t; drawList(); drawExtra(); } }, t.name, ' ', h('span', { class: 'dim' }, t.groups.join(', ')))));
  };
  const addEnch = () => {
    const key = sel([['', 'pick an enchantment'], ...catalogue.enchants.map((/** @type {any} */ e) => [e.key, `${e.name}${e.side ? ' (side effect)' : ''}`])]);
    const param = h('select');
    key.onchange = () => { const e = catalogue.enchants.find((/** @type {any} */ x) => x.key === key.value); param.replaceChildren(...(e?.params ?? []).map((/** @type {any} */ p) => h('option', { value: JSON.stringify(p[0]) }, `${p[1] || 'default'} (${p[2]})`))); };
    const row = h('div', { class: 'row', style: 'margin-bottom:6px' }, key, param, h('button', { class: 'ghost', onclick: () => row.remove() }, 'remove'));
    enchRows.append(row);
  };
  const drawExtra = () => {
    extra.replaceChildren();
    if (!item) return;
    group.replaceChildren(...item.groups.map((/** @type {string} */ g) => h('option', { value: g }, g)));
    const mats = () => catalogue.materials[group.value] ?? null;
    const drawMats = () => { const m = mats(); material.replaceChildren(...(m ?? []).map((/** @type {any} */ x) => h('option', { value: String(x[0]) }, x[1]))); matField.hidden = !m; };
    const matField = field('Material', material);
    group.onchange = drawMats;
    extra.append(h('div', { class: 'fields' }, item.groups.length > 1 ? field('Kind', group) : null, matField, item.stacks ? field('How many', count) : null, item.i === catalogue.letter ? field('Worth (gold)', gold) : null));
    drawMats();
    extra.append(h('details', null, h('summary', { class: 'dim' }, 'Enchantments (optional)'), enchRows, h('button', { onclick: addEnch }, 'Add an enchantment')));
  };
  q.addEventListener('input', drawList);
  drawList();
  dialog('Give an item', c ? `To ${c.name}. It lands in their pack.` : 'It lands in their pack.', [who.el, field('Item', h('div', null, q, h('div', { style: 'height:6px' }), list)), extra, h('div', { class: 'fields' }, field('Reason', reason), field('Note', note))], {
    label: 'Give', run: async () => {
      const x = who.get();
      if (!x?.id) return 'Pick who gets it.';
      if (!item) return 'Pick an item.';
      if (!note.value.trim()) return 'Write a short note (it goes in the audit log).';
      /** @type {any} */ const body = { id: x.id, template: item.i, reason: reason.value, note: note.value.trim() };
      if (item.groups.length > 1) body.group = group.value;
      if (catalogue.materials[group.value || item.groups[0]]) body.material = Number(material.value);
      if (item.stacks && Number(count.value) > 1) body.count = Number(count.value);
      if (item.i === catalogue.letter) body.gold = Number(gold.value);
      const ench = [...enchRows.querySelectorAll('.row')].map((r) => { const s = r.querySelectorAll('select'); return s[0].value ? { key: s[0].value, param: JSON.parse(s[1].value || 'null') } : null; }).filter(Boolean);
      if (ench.length) body.enchant = ench;
      const look = await call('/v1/staff/item/give', body);
      if (look.error) return why(look);
      if (look.findings?.length) return `The game would flag it: ${look.findings.map((/** @type {any} */ f) => f.rule ?? f.why ?? JSON.stringify(f)).join(', ')}`;
      const j = await call('/v1/staff/item/give', { ...body, confirm: true, seq: look.seq });
      if (j.error) return why(j);
      toast(`Given: ${j.piece?.name ?? item.name} to ${x.name}${j.playing ? ' (they get it on their next save load)' : ''}.`);
    },
  });
}

function greedDialog(/** @type {any} */ c, /** @type {'gold'|'nyx'} */ kind) {
  const who = charChooser(c);
  const amount = h('input', { type: 'number', min: '1', placeholder: kind === 'gold' ? 'up to 1,000,000' : 'up to 1,000' });
  dialog(kind === 'gold' ? 'Give gold' : 'Give Dusk Tokens', `${c ? `To ${c.account.name}. ` : ''}It waits for them and lands in game within a minute while they play.`, [who.el, field('Amount', amount)], {
    label: 'Give', run: async () => {
      const x = who.get();
      if (!x) return 'Pick who gets it.';
      const n = Number(amount.value);
      if (!Number.isSafeInteger(n) || n < 1) return 'Write an amount.';
      const j = await call('/v1/staff/greed', { to: x.account.id, [kind]: n });
      if (j.error) return why(j);
      toast(`${n.toLocaleString()} ${kind === 'gold' ? 'gold' : 'Dusk Tokens'} on the way to ${j.to ?? x.account.name}.`);
    },
  });
}

async function bankDialog(/** @type {any} */ c) {
  const j = await call('/v1/staff/player', { target: c.account.id, tab: 'inventories', char: c.id });
  if (j.error) { toast(why(j), true); return; }
  const gold = h('input', { type: 'number', min: '0', value: String(j.banks ?? 0) });
  const note = h('input', { type: 'text', placeholder: 'why' });
  dialog('Set bank gold', `${c.name}'s bank holds ${Number(j.banks ?? 0).toLocaleString()} gold (purse ${Number(j.purse ?? 0).toLocaleString()}). Every branch is folded into one account set to this.`, [h('div', { class: 'fields' }, field('Bank gold', gold), field('Note', note))], {
    label: 'Set', run: async () => {
      if (!note.value.trim()) return 'Write a short note.';
      const r = await call('/v1/staff/fix/bank', { id: c.id, ticket: `bf-${rid().slice(0, 20)}`, was: j.banks ?? 0, gold: Number(gold.value), note: note.value.trim() });
      if (r.error) return why(r);
      toast(`${c.name}'s bank is now ${Number(gold.value).toLocaleString()} gold.`);
    },
  });
}

async function rollbackDialog(/** @type {any} */ c) {
  const look = await call('/v1/staff/rollback', { id: c.id });
  if (look.error) { toast(why(look), true); return; }
  const note = h('input', { type: 'text', placeholder: 'why' });
  const nu = look.notUndone ?? {};
  dialog('Roll back to the clean save', `${c.name} goes back to the last save the server judged clean. Everything since is lost.`, [
    h('div', { class: 'card' }, kv({ 'clean save from': when(look.cleanAt), 'wealth now': look.wealth?.now, 'wealth then': look.wealth?.then, 'stays (not rolled back): stores': nu.stores?.units ?? 0, 'stays: drakes': typeof nu.drakes === 'object' ? JSON.stringify(nu.drakes) : nu.drakes ?? 0, 'stays: market purse': nu.marketPurse ?? 0 })),
    look.blocked ? h('div', { class: 'bad' }, why({ error: look.blocked })) : null, field('Note', note)], {
    label: 'Roll back', danger: true, run: async () => {
      if (!note.value.trim()) return 'Write a short note.';
      const r = await call('/v1/staff/rollback', { id: c.id, confirm: true, note: note.value.trim() });
      if (r.error) return why(r);
      toast(`${c.name} rolled back.`);
    },
  });
}

function messageDialog(/** @type {any} */ c) {
  const text = h('textarea', { maxLength: 200, placeholder: 'Shown in the middle of their screen until they press OK.' });
  dialog('Message on screen', `To ${c.account.name}`, [text], { label: 'Send', run: async () => {
    if (!text.value.trim()) return 'Write the message.';
    const j = await call('/v1/staff/message', { target: c.account.id, text: text.value.trim() });
    if (j.error) return why(j);
    toast('Message sent.');
  } });
}
const MUTES = [[10, '10 minutes'], [60, '1 hour'], [360, '6 hours'], [1440, '1 day'], [10080, '1 week']];
function muteDialog(/** @type {any} */ c) {
  const m = sel(/** @type {any} */ (MUTES), 60);
  dialog('Mute', `${c.account.name} cannot chat for:`, [field('How long', m)], { label: 'Mute', run: async () => {
    const j = await call('/v1/staff/mute', { target: c.account.id, minutes: Number(m.value), click: rid() });
    if (j.error) return why(j);
    toast('Muted.'); quickRefresh(c);
  } });
}
function freezeDialog(/** @type {any} */ c) {
  const m = sel(/** @type {any} */ (MUTES.slice(0, 4)), 60), reason = h('input', { type: 'text', placeholder: 'shown to them' });
  dialog('Freeze', `${c.account.name} cannot move or act until it ends.`, [h('div', { class: 'fields' }, field('How long', m), field('Reason', reason))], { label: 'Freeze', run: async () => {
    const j = await call('/v1/staff/freeze', { target: c.account.id, minutes: Number(m.value), reason: reason.value.trim() || undefined });
    if (j.error) return why(j);
    toast('Frozen.'); quickRefresh(c);
  } });
}
function banDialog(/** @type {any} */ c) {
  const d = sel([[1, '1 day'], [3, '3 days'], [7, '1 week'], [30, '30 days'], [365, '1 year'], [0, 'Forever']], 7), reason = h('input', { type: 'text', placeholder: 'shown to them' });
  dialog('Ban', `${c.account.name} cannot play until it ends. Every character on the account.`, [h('div', { class: 'fields' }, field('How long', d), field('Reason', reason))], { label: 'Ban', danger: true, run: async () => {
    const j = await call('/v1/staff/ban', { target: c.account.id, days: Number(d.value), reason: reason.value.trim() || undefined, click: rid() });
    if (j.error) return why(j);
    toast('Banned.'); quickRefresh(c);
  } });
}
function noteDialog(/** @type {any} */ c) {
  const text = h('textarea', { placeholder: 'Only staff see notes.' });
  dialog('Add a note', `On ${c.account.name}`, [text], { label: 'Save', run: async () => {
    if (!text.value.trim()) return 'Write the note.';
    const j = await call('/v1/staff/notes/add', { target: c.account.id, text: text.value.trim() });
    if (j.error) return why(j);
    toast('Note saved.');
  } });
}
async function quickRefresh(/** @type {any} */ c) { await loadChars(true); const x = chars.find((y) => y.id === c.id); if (page === 'char' && x) openChar(x); }

// ── Events ──
const MONSTERS = Object.entries(MOBILE_TYPES).filter(([n, v]) => v !== MOBILE_TYPES.None && !/invalid/i.test(n) && v !== 39 && v !== 146)
  .map(([n, v]) => ({ v, name: pretty(n).replace(/ +/g, ' ').trim() })).concat([{ v: 3072, name: 'Sifrit the Forbidden One' }]).sort((a, b) => a.name.localeCompare(b.name));
const monsterName = (/** @type {number} */ v) => MONSTERS.find((m) => m.v === v)?.name ?? `#${v}`;
function eventRow(/** @type {any} */ e) {
  const ev = e.ev ?? {};
  const live = e.live || e.state === 'live' || e.state === 'starting';
  return h('div', { class: 'li' },
    h('span', { class: `chip ${live ? 'on' : ''}` }, e.state ?? (live ? 'live' : 'ended')),
    h('span', { class: 'grow' }, h('b', null, ev.nm ?? '?'), ' ', h('span', { class: 'dim' }, `${e.kills ?? 0}/${ev.n ?? '?'} kills · boss ${e.boss ?? '-'} · ${e.fighters ?? 0} fighting · ${ago(e.at)}`)),
    live ? h('button', { onclick: () => eventOp('boss', e.id, 'Boss called.') }, 'Bring the boss') : null,
    live ? h('button', { class: 'danger', onclick: () => { if (confirm(`End ${ev.nm}?`)) eventOp('end', e.id, 'Event ended.'); } }, 'End') : h('button', { class: 'ghost', onclick: () => eventOp('clear', e.id, 'Cleared.') }, 'Clear'));
}
async function eventOp(/** @type {string} */ op, /** @type {string} */ id, /** @type {string} */ done) {
  const j = await call('/v1/staff/event', { op, id });
  if (j.error) toast(why(j), true); else { toast(done); go(page); }
}
function eventsPage(/** @type {HTMLElement} */ root) {
  const box = h('div', { class: 'list' });
  root.append(h('div', { class: 'card' }, h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, 'Events'), h('span', { style: 'flex:1' }),
    h('button', { class: 'primary', onclick: () => startEventDialog() }, 'Start an event'), h('button', { onclick: () => go('events') }, 'Refresh')), h('div', { class: 'section' }, box)));
  fill(box, async () => { const j = await call('/v1/staff/events'); return j.error ? why(j) : (j.events ?? []).map(eventRow); }, 'No events yet.');
}
async function startEventDialog() {
  /** @type {any} */ const place = { rg: null, loc: -1, px: null, py: null, kind: null };
  const placeLine = h('div', { class: 'dim' }, 'No place picked.');
  const name = h('input', { type: 'text', maxLength: 48, placeholder: 'shown to players, e.g. Raid on Daggerfall' });
  const setPlace = (/** @type {any} */ p) => {
    Object.assign(place, p);
    placeLine.textContent = `${p.label ?? 'Picked'}: map ${p.px}, ${p.py}${p.loc >= 0 ? '' : ' (open ground)'}`; placeLine.className = 'ok';
    if (!name.value && p.nm) name.value = p.nm;
  };
  const region = h('select'), town = h('select');
  /** @type {any[]} */ let places = [];
  const placeBits = h('div');
  if (embedded) {
    const r = await ask({ dfoStaff: 'regions?' }, 'regions');
    region.replaceChildren(h('option', { value: '' }, 'Pick a region'), ...(r?.names ?? []).map((/** @type {string} */ n, /** @type {number} */ i) => h('option', { value: String(i) }, n)));
    region.onchange = async () => {
      if (region.value === '') return;
      const p = await ask({ dfoStaff: 'places?', region: Number(region.value) }, 'places');
      places = p?.list ?? [];
      town.replaceChildren(h('option', { value: '' }, 'Pick a place'), ...places.map((x, i) => h('option', { value: String(i) }, `${x.name} (${x.kind})`)));
    };
    town.onchange = () => { const x = places[Number(town.value)]; if (x) setPlace({ rg: Number(region.value), loc: x.loc, px: x.px, py: x.py, kind: x.kind, nm: x.name, label: x.name }); };
    placeBits.append(h('div', { class: 'row' }, h('button', { onclick: async () => {
      const here = await ask({ dfoStaff: 'here?' }, 'here');
      if (!here || here.region == null) { toast('The game did not say where you stand (go outdoors).', true); return; }
      setPlace({ rg: here.region, loc: here.loc ?? -1, px: here.px, py: here.py, kind: here.kind, nm: here.place ?? here.name, label: here.place ?? here.name ?? 'Where you stand' });
    } }, 'Where I stand'), h('span', { class: 'dim' }, 'or'), region, town));
  } else {
    const rg = h('input', { type: 'number', placeholder: 'region number' }), px = h('input', { type: 'number', placeholder: 'map x' }), py = h('input', { type: 'number', placeholder: 'map y' });
    const set = () => { if (rg.value && px.value && py.value) setPlace({ rg: Number(rg.value), loc: -1, px: Number(px.value), py: Number(py.value), label: 'By hand' }); };
    for (const x of [rg, px, py]) x.addEventListener('input', set);
    placeBits.append(h('div', { class: 'dim' }, 'Open this panel from the ST button in game to pick the place from the map or where you stand. Here it is set by hand (the game shows map x, y with /pos).'), h('div', { class: 'row' }, rg, px, py));
  }
  // monsters
  /** @type {number[]} */ const picked = [];
  const chips = h('div', { class: 'row' });
  const mq = h('input', { type: 'search', placeholder: 'Add monsters: skeleton, orc, vampire...' });
  const mlist = h('div', { class: 'picklist', hidden: true });
  const drawChips = () => chips.replaceChildren(...(picked.length ? picked.map((v) => h('span', { class: 'chip warn' }, monsterName(v), h('a', { href: '#', onclick: (/** @type {Event} */ e) => { e.preventDefault(); picked.splice(picked.indexOf(v), 1); drawChips(); } }, ' x'))) : [h('span', { class: 'dim' }, 'No monsters yet.')]));
  mq.addEventListener('input', () => {
    const n = norm(mq.value).trim();
    mlist.hidden = !n;
    mlist.replaceChildren(...MONSTERS.filter((m) => norm(m.name).includes(n)).slice(0, 30).map((m) => h('div', { class: 'item', onclick: () => { if (!picked.includes(m.v) && picked.length < 12) picked.push(m.v); mq.value = ''; mlist.hidden = true; drawChips(); } }, m.name)));
  });
  drawChips();
  const total = h('input', { type: 'number', value: '60', min: '1', max: '500' }), meter = h('input', { type: 'number', value: '40', min: '1', max: '500' });
  const boss = sel([['', 'Pick the boss'], ...MONSTERS.map((m) => /** @type {[any, string]} */ ([m.v, m.name]))]);
  const size = h('input', { type: 'range', min: '150', max: '300', value: '200' }), sizeTxt = h('span', { class: 'dim' }, '200%');
  size.oninput = () => { sizeTxt.textContent = `${size.value}%`; };
  const health = h('input', { type: 'number', value: '10', min: '1', max: '100' });
  const mins = sel([[30, '30 minutes'], [60, '1 hour'], [120, '2 hours'], [240, '4 hours'], [0, 'Until I end it']], 60);
  const endAtBoss = h('input', { type: 'checkbox', checked: true });
  // announcements, the map label, the boss's name and the pay (all optional)
  const announce = h('input', { type: 'checkbox', checked: true });
  const txt = (/** @type {string} */ ph, max = 140) => h('input', { type: 'text', maxLength: max, placeholder: ph });
  const tx = txt('Start line, e.g. Sifrit stirs beneath Daggerfall!'), bl = txt('Line when the boss appears'), el = txt('Line when it ends');
  const lb = txt('Map label, e.g. The siege of Daggerfall', 40), bn = txt('Boss name, e.g. Sifrit the Forbidden One', 32);
  const rk = h('input', { type: 'number', value: '3', min: '3', max: '500' });
  const gd = h('input', { type: 'number', value: '0', min: '0', max: '100000' }), sv = h('input', { type: 'number', value: '0', min: '0', max: '100' });
  const extras = h('details', null, h('summary', { class: 'dim' }, 'Announcements, map label, boss name and rewards (optional)'),
    h('div', { class: 'fields' }, field('Tell everyone online', h('label', null, announce, ' say it when it starts and ends')), field('Map label', lb)),
    field('Start line', tx), h('div', { class: 'fields' }, field('Boss line', bl), field('End line', el)),
    field('Boss name', bn),
    h('div', { class: 'dim' }, 'Pay for the players who fought: every one with enough kills gets it when the event ends (Argents go to the account, gold to the character, on top of the usual loot).'),
    h('div', { class: 'fields' }, field('Kills needed (3+)', rk), field('Gold each', gd), field('Imperial Argents each (max 100)', sv)));
  dialog('Start an event', 'Monsters keep coming at the place until enough fall, then the boss shows up.', [
    field('Where', h('div', null, placeBits, placeLine)),
    field('Name', name),
    field('Monsters', h('div', null, chips, h('div', { style: 'height:6px' }), mq, mlist)),
    h('div', { class: 'fields' }, field('Monsters in all', total), field('Kills before the boss', meter), field('Boss', boss), field('Boss health (x its normal)', health)),
    h('div', { class: 'fields' }, field('Boss size', h('div', { class: 'row' }, size, sizeTxt)), field('Runs for', mins), field('Ends', h('label', null, endAtBoss, ' when the boss falls'))),
    extras,
  ], {
    label: 'Start', run: async () => {
      if (place.rg == null || place.px == null) return 'Pick where it happens.';
      if (!picked.length) return 'Add at least one monster.';
      if (boss.value === '') return 'Pick the boss.';
      if (!name.value.trim()) return 'Give it a name.';
      const n = Number(total.value), m = Math.min(Number(meter.value), n);
      const ev = { rg: place.rg, loc: place.loc ?? -1, px: place.px, py: place.py, nm: name.value.trim(), ct: place.loc >= 0 && place.kind === 'town' ? 1 : 0, mt: picked, n, m,
        b: Number(boss.value), bs: Number(size.value), bh: Number(health.value), mins: Number(mins.value), eb: endAtBoss.checked ? 1 : 0,
        an: announce.checked ? 1 : 0, tx: tx.value.trim(), bl: bl.value.trim(), el: el.value.trim(), lb: lb.value.trim(), bn: bn.value.trim(),
        rk: Number(rk.value) || 3, gd: Math.floor(Number(gd.value)) || 0, sv: Math.floor(Number(sv.value)) || 0 };
      const j = await call('/v1/staff/event', { op: 'start', ev });
      if (j.error) return why(j);
      toast(`${ev.nm} has begun.`);
      if (page === 'events' || page === 'home') go(page);
    },
  });
}

// ── Notices ──
function noticeDialog() {
  const subject = h('input', { type: 'text', maxLength: 80, placeholder: 'e.g. Server restart tonight' }), body = h('textarea', { placeholder: 'What every player reads on the notice boards.' });
  const days = sel([[1, '1 day'], [3, '3 days'], [7, '1 week'], [14, '2 weeks'], [30, '30 days']], 7);
  const r = rid();
  dialog('Send a notice', 'Pinned on every notice board in the game.', [field('Title', subject), field('Text', body), field('Shown for', days)], {
    label: 'Send', run: async () => {
      if (!subject.value.trim() || !body.value.trim()) return 'Write a title and the text.';
      const j = await call('/v1/staff/notice', { subject: subject.value.trim(), body: body.value.trim(), days: Number(days.value), rid: r });
      if (j.error) return why(j);
      toast('Notice posted.');
      if (page === 'notices') go('notices');
    },
  });
}
function noticesPage(/** @type {HTMLElement} */ root) {
  const box = h('div', { class: 'list' });
  root.append(h('div', { class: 'card' }, h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, 'Notices'), h('span', { style: 'flex:1' }),
    h('button', { class: 'primary', onclick: noticeDialog }, 'Send a notice')),
  h('div', { class: 'dim section' }, 'A notice is pinned on every notice board. To speak on everyone\'s screen right away, use /dm in the game\'s chat. To message one player, open them and press Message on screen.'),
  h('div', { class: 'section' }, box)));
  fill(box, async () => {
    const j = await call('/v1/staff/data/query', { sql: 'SELECT subject, body, author_name, at, expires_at FROM board_notices ORDER BY at DESC LIMIT 30' });
    if (j.error) return 'The list of past notices needs the owner (database access).';
    return (j.rows ?? []).map((/** @type {any} */ n) => h('div', { class: 'li' }, h('span', { class: 'grow', style: 'white-space:normal' }, h('b', null, n.subject), h('div', { class: 'dim' }, n.body)),
      h('span', { class: 'dim' }, `${n.author_name ?? ''} · ${ago(n.at)}${n.expires_at * 1000 < Date.now() ? ' · ended' : ''}`)));
  }, 'No notices yet.');
}

// ── More ──
const TOOLS = [
  ['reports', 'Reports', 'Every open report, claimed or not'], ['economy', 'Economy', 'Gold in and out, gains, trade holds, the market'],
  ['saves', 'Saves', 'Take a player\'s save out (search them first)'], ['db', 'Database', 'Read the database (owner)'], ['skins', 'Skins', 'Custom paperdolls waiting for review'],
  ['audit', 'Audit log', 'Everything staff did'], ['team', 'Staff team', 'Moderators, invites, server status'], ['all', 'All tools', 'Every staff action as a raw form'],
];
function morePage(/** @type {HTMLElement} */ root) {
  root.append(h('div', { class: 'grid' }, TOOLS.map(([k, t, d]) => h('div', { class: 'card li click', style: 'border-bottom:1px solid var(--line)', onclick: () => go(`more:${k}`) },
    h('span', { class: 'grow', style: 'white-space:normal' }, h('b', null, t), h('div', { class: 'dim' }, d))))));
}
function moreTool(/** @type {HTMLElement} */ root, /** @type {string} */ k) {
  const card = h('div', { class: 'card' });
  root.append(h('div', { class: 'row', style: 'margin-bottom:10px' }, h('button', { class: 'ghost', onclick: () => go('more') }, '< More'), h('b', null, TOOLS.find((t) => t[0] === k)?.[1] ?? k)), card);
  if (k === 'reports') { reportsView(card, { h, call, toast, why, ago, when, rid, openAccount }); const rest = h('div', { class: 'card' }); root.append(rest); return answerTabs(rest, [['Banned players', '/v1/staff/banned'], ['Frozen players', '/v1/staff/freezes'], ['Reported board posts', '/v1/staff/board/reported'], ['My watch list', '/v1/staff/watch']]); }
  if (k === 'economy') return answerTabs(card, [['Economy (7 days)', '/v1/staff/econ/economy', { days: 7 }], ['Who got rich fast', '/v1/staff/gains', { days: 7 }], ['Trade holds', '/v1/staff/trade-holds'], ['Reported listings', '/v1/staff/market/reported'], ['Guilds', '/v1/staff/econ/guilds'], ['Item census', '/v1/staff/census']]);
  if (k === 'team') return answerTabs(card, [['Team', '/v1/staff/team'], ['Moderators', '/v1/staff/mods'], ['Server status', '/v1/staff/status'], ['My keys', '/v1/staff/keys']]);
  if (k === 'saves') { const out = h('div'); const box = charChooser(null); card.append(box.el, h('button', { class: 'primary', onclick: () => { const x = box.get(); if (x) savesOf(x.account.id, out); } }, 'Show their saves'), h('div', { class: 'section' }, out)); return; }
  if (k === 'db') return dbTool(card);
  if (k === 'skins') return skinsTool(card);
  if (k === 'audit') return answerTabs(card, [['Newest staff actions', '/v1/staff/audit', { limit: 200 }]]);
  if (k === 'all') {
    card.append(h('div', { class: 'dim' }, 'Every staff action, one form each. The forms act on this character:'));
    let cur = /** @type {any} */ (null);
    const box = charChooser(null);
    const pickBtn = h('button', { onclick: () => { cur = box.get(); toast(cur ? `Forms act on ${cur.name}.` : 'Pick someone first.', !cur); } }, 'Use them');
    card.append(box.el, pickBtn);
    for (const tab of ['players', 'items', 'reports']) {
      const sec = h('div', { class: 'section' });
      buildActs(sec, STAFF_TABS[tab], {
        send: async (act, body, out) => { out.replaceChildren(h('div', { class: 'dim' }, 'Working...')); const j = await call(act.p, body); if (j.error) out.replaceChildren(h('div', { class: 'bad' }, why(j))); else showAnswer(out, j, { pickPlayer: () => {}, pickChar: () => {} }); return j; },
        who: async () => cur?.account?.id ?? null, char: () => cur?.id ?? '',
      });
      card.append(sec);
    }
  }
}
/** Pages of read-only answers, loaded when picked. @param {HTMLElement} card @param {[string, string, any?][]} list */
function answerTabs(card, list) {
  const bar = h('div', { class: 'tabs' }), out = h('div', { class: 'scroll' });
  card.append(bar, out);
  const show = async (/** @type {number} */ i) => {
    bar.replaceChildren(...list.map(([t], k) => h('button', { class: k === i ? 'on' : '', onclick: () => show(k) }, t)));
    out.replaceChildren(h('div', { class: 'dim' }, 'Loading...'));
    const j = await call(list[i][1], list[i][2] ?? {});
    if (j.error) out.replaceChildren(h('div', { class: 'bad' }, why(j)));
    else showAnswer(out, j, { pickPlayer: (id) => openAccount(id, id), pickChar: (id) => { const x = chars.find((y) => y.id === id); if (x) openChar(x); } });
  };
  show(0);
}

// saves
function save(/** @type {string} */ name, /** @type {BlobPart} */ data, type = 'application/octet-stream') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function exportSave(/** @type {any} */ body) {
  const j = await call('/v1/staff/data/export', body);
  if (j.error) { toast(why(j), true); return; }
  if (j.encoding === 'text') save(j.name, j.data, 'application/json'); else save(j.name, Uint8Array.from(atob(j.data), (c) => c.charCodeAt(0)));
  toast(j.warning ? `Saved ${j.name}, but ${j.warning}.` : `Saved ${j.name}.`, !!j.warning);
}
async function savesOf(/** @type {string} */ target, /** @type {HTMLElement} */ out) {
  out.replaceChildren(h('div', { class: 'dim' }, 'Loading...'));
  const j = await call('/v1/staff/data/saves', { target });
  if (j.error) { out.replaceChildren(h('div', { class: 'bad' }, why(j))); return; }
  out.replaceChildren(
    h('h2', null, `Online characters (${j.realm.length})`),
    h('div', { class: 'list' }, j.realm.map((/** @type {any} */ c) => h('div', { class: 'li' }, h('span', { class: 'grow' }, h('b', null, c.name ?? c.id), ' ', h('span', { class: 'dim' }, `saved ${when(c.updatedAt)}${c.deadAt ? ' · dead' : ''}${c.leased ? ' · in play' : ''}`)),
      c.hasSave ? [h('button', { onclick: () => exportSave({ target, kind: 'realm', char: c.id }) }, 'Download'), h('button', { class: 'ghost', onclick: () => exportSave({ target, kind: 'realm', char: c.id, as: 'raw' }) }, 'Raw'),
        c.hasPrev ? h('button', { class: 'ghost', onclick: () => exportSave({ target, kind: 'realm', char: c.id, which: 'prev' }) }, 'Previous') : null] : h('span', { class: 'dim' }, 'no save')))),
    h('h2', { class: 'section' }, `Cloud saves (${j.cloud.length})`),
    h('div', { class: 'list' }, j.cloud.map((/** @type {any} */ s) => h('div', { class: 'li' }, h('span', { class: 'grow' }, h('b', null, `${s.characterName ?? s.characterId} / ${s.saveName}`), ' ', h('span', { class: 'dim' }, `${s.bytes} bytes · ${when(s.updatedAt)}`)),
      h('button', { onclick: () => exportSave({ target, kind: 'cloud', characterId: s.characterId, saveName: s.saveName, part: 'data' }) }, 'Download'),
      s.shotBytes ? h('button', { class: 'ghost', onclick: () => exportSave({ target, kind: 'cloud', characterId: s.characterId, saveName: s.saveName, part: 'shot' }) }, 'Screenshot') : null))));
}

// database
const csvCell = (/** @type {any} */ v) => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function dbTool(/** @type {HTMLElement} */ card) {
  const tables = h('div', { class: 'row' }), sql = h('textarea', { spellcheck: false, placeholder: 'SELECT * FROM players LIMIT 20' }), out = h('div', { class: 'scroll' }), msg = h('span', { class: 'dim' });
  /** @type {any[]} */ let rows = [];
  const run = async () => {
    msg.textContent = 'Running...';
    const j = await call('/v1/staff/data/query', { sql: sql.value });
    if (j.error) { msg.textContent = why(j); return; }
    rows = j.rows; msg.textContent = `${j.rows.length} rows`;
    out.replaceChildren(h('table', null, h('thead', null, h('tr', null, j.columns.map((/** @type {string} */ c) => h('th', null, c)))),
      h('tbody', null, j.rows.map((/** @type {any} */ r) => h('tr', null, j.columns.map((/** @type {string} */ c) => { const v = r[c]; const t = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return h('td', { title: t }, t); }))))));
  };
  card.append(h('div', { class: 'dim' }, 'Read only, one SELECT, 500 rows at most. Secrets show as [hidden].'), h('div', { class: 'section' }, tables), sql,
    h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'primary', onclick: run }, 'Run'),
      h('button', { onclick: () => save('query.json', JSON.stringify(rows, null, 1), 'application/json') }, 'Download JSON'),
      h('button', { onclick: () => { const cols = rows[0] ? Object.keys(rows[0]) : []; save('query.csv', [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n'), 'text/csv'); } }, 'Download CSV'), msg),
    h('div', { class: 'section' }, out));
  call('/v1/staff/data/tables').then((j) => { if (j.error) tables.replaceChildren(h('span', { class: 'bad' }, why(j))); else tables.replaceChildren(...j.tables.map((/** @type {any} */ t) => h('button', { class: 'ghost', onclick: () => { sql.value = `SELECT * FROM ${t.name} LIMIT 50`; run(); } }, `${t.name} (${t.rows ?? '?'})`))); });
}

// skins
function skinsTool(/** @type {HTMLElement} */ card) {
  const out = h('div');
  const load = async (/** @type {string} */ status) => {
    out.replaceChildren(h('div', { class: 'dim' }, 'Loading...'));
    const j = await call('/v1/staff/skins/queue', { status });
    if (j.error) { out.replaceChildren(h('div', { class: 'bad' }, why(j))); return; }
    if (!j.skins.length) { out.replaceChildren(h('div', { class: 'dim' }, status === 'pending' ? 'Nothing waiting.' : 'None.')); return; }
    out.replaceChildren(...j.skins.map((/** @type {any} */ s) => h('div', { class: 'skin' },
      [['Front', s.front], ['Back', s.back]].map(([label, data]) => h('div', null, h('div', { class: 'dim' }, label), data ? h('img', { src: `data:image/png;base64,${data}` }) : null)),
      h('div', null, h('b', null, s.name), h('div', { class: 'dim' }, `by ${s.owner}`), h('div', { class: 'dim' }, `${Math.round(s.height * 100)}% of a player's height`), h('div', { class: 'dim' }, `${s.status}${s.note ? ` · ${s.note}` : ''}`),
        h('div', { class: 'row', style: 'margin-top:8px' },
          h('button', { class: 'primary', onclick: async () => { const r = await call('/v1/staff/skins/review', { id: s.id, verdict: 'approve', note: '' }); if (r.error) toast(why(r), true); else load(status); } }, 'Approve'),
          h('button', { class: 'danger', onclick: () => { const note = h('input', { type: 'text', placeholder: 'the player sees this' }); dialog('Reject this skin', s.name, [field('Why', note)], { label: 'Reject', danger: true, run: async () => { if (!note.value.trim()) return 'Say why.'; const r = await call('/v1/staff/skins/review', { id: s.id, verdict: 'reject', note: note.value.trim() }); if (r.error) return why(r); load(status); } }); } }, 'Reject'))))));
  };
  card.append(h('div', { class: 'tabs' }, h('button', { onclick: () => load('pending') }, 'Waiting'), h('button', { onclick: () => load('approved') }, 'Approved')), out);
  load('pending');
}

// ═══ THE GAME'S STAFF HOOK, through the dock (in game only) ═══
const toGame = (/** @type {object} */ m) => { if (embedded) window.parent.postMessage(m, location.origin); };
/** @type {Map<string, (m: any) => void>} */
const answers = new Map();
/** Ask the game and wait for its answer word (up to 4 s). @param {object} m @param {string} word @returns {Promise<any>} */
const ask = (m, word) => new Promise((resolve) => {
  if (!embedded) { resolve(null); return; }
  const t = setTimeout(() => { answers.delete(word); resolve(null); }, 4000);
  answers.set(word, (a) => { clearTimeout(t); answers.delete(word); resolve(a); });
  toGame(m);
});
let hidden = false, following = /** @type {string|null} */ (null);
function drawGameBits() {
  if (!embedded) { $('gameBits').replaceChildren(); return; }
  put($('gameBits'),
    h('button', { class: hidden ? 'primary' : '', title: 'Hidden staff are kept out of every room\'s player lists', onclick: () => hideSet(!hidden) }, hidden ? 'Hidden' : 'Hide me'),
    following ? h('span', { class: 'chip on' }, `following ${following}`, h('a', { href: '#', onclick: (/** @type {Event} */ e) => { e.preventDefault(); toGame({ dfoStaff: 'unlock' }); following = null; drawGameBits(); } }, ' let go')) : null);
}
function follow(/** @type {any} */ c) {
  toGame({ dfoStaff: 'follow', sub: c.account.id });
  following = c.name; drawGameBits();
  toast(`Following ${c.name}. Close this window to watch.`);
}
async function doorOpen() {
  if (!embedded) return;
  toGame({ dfoStaff: 'hook?' });
  const j = await call('/v1/staff/hide', {});
  hidden = !j.error && !!j.hidden;
  drawGameBits();
}
async function hideSet(/** @type {boolean} */ on) {
  const j = await call('/v1/staff/hide', { on });
  if (j.error) { toast(why(j), true); return false; }
  hidden = !!j.hidden;
  toGame({ dfoStaff: 'relink' });
  drawGameBits();
  return true;
}
async function sendTags() {
  if (!embedded || !session) return;
  const j = await call('/v1/staff/watch', {});
  if (j.error) return;
  toGame({ dfoStaff: 'tags', dist: 100, list: (j.watch ?? []).slice(0, 200).map((/** @type {any} */ w) => ({ sub: w.sub, level: 'medium', why: 'watched', watch: true })) });
}
window.addEventListener('message', async (e) => {
  if (!embedded || e.source !== window.parent || e.origin !== location.origin) return;
  const m = /** @type {any} */ (e.data);
  if (!m || typeof m.dfoStaff !== 'string') return;
  answers.get(m.dfoStaff)?.(m);
  if (m.dfoStaff === 'hook') sendTags();
  else if (m.dfoStaff === 'act' && m.act === 'follow' && typeof m.sub === 'string') { following = m.name ?? m.sub; drawGameBits(); }
  else if (m.dfoStaff === 'tags?') sendTags();
  else if (m.dfoStaff === 'token' && !('tok' in m) && session) {
    // the hook asks a follow token for a room: minted on this staff session (server-account/src/staffFollow.js)
    const j = await call('/v1/staff/follow', { sub: m.sub, ...(m.room ? { room: m.room } : {}) });
    toGame({ dfoStaff: 'token', sub: m.sub, room: m.room, tok: typeof j.token === 'string' ? j.token : null });
  } else if (m.dfoStaff === 'hide' && !('ok' in m) && typeof m.on === 'boolean') {
    const ok = session ? await hideSet(m.on) : false;
    toGame({ dfoStaff: 'hide', on: m.on, ok });
  }
});
setInterval(() => { if (embedded && session) sendTags(); }, 60_000);
if (embedded) window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !document.querySelector('.veil')) window.parent.postMessage({ dfoStaffDock: 'close' }, location.origin); });

// ═══ WIRING ═══
$('go').onclick = signIn;
$('password').addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter') signIn(); });
$('handle').addEventListener('input', showKey);
$('copyKey').onclick = () => navigator.clipboard?.writeText($('keyLine').textContent);
$('newKey').onclick = async () => { if (confirm('A new key has to be put into OWNER_KEYS again. Make one?')) { keyed = await makeKey(); showKey(); } };
$('out').onclick = async () => { await call('/v1/staff/logout', {}); signedOut(); };
searchBox($('q'), $('drop'), openChar);
showKey();
if (session) call('/v1/staff/me').then((j) => { if (!j.error) opened(j); else signedOut(); });

