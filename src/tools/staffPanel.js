// @ts-check
// BUNNYFALL (2026-11-06): staff.html - the staff page of this fork. A staff member signs in (password, or password + a
// key this browser makes), then reads an account's saves and takes them out, browses the database read-only and reads
// the audit log.
// BUNNYFALL (2026-11-12, the owner: "make the entire staff panel and staff.html merged into one staff panel i can access
// in game"): THE ONE STAFF PANEL. The same page opens on its own in a browser and inside the game's staff window
// (ui/staffDock.js, `?embed=1`): every staff door of the account service as a form (staffPanelActions.js), a picked
// player and character the forms share, and - in game - the staff hook's half the old browser extension held
// (net/staffHook.js): Follow, the live map, Hide me and the staff tags, through the dock's relay.
/* global btoa, atob, sessionStorage, confirm, crypto, prompt */
import { selfAccountUrl } from '../net/selfHost.js';
import { STAFF_TABS, showAnswer, buildActs } from './staffPanelActions.js';

const $ = (/** @type {string} */ id) => /** @type {any} */ (document.getElementById(id));
const KEY_STORE = 'bunnyfall-staff-key';
const SESSION_STORE = 'bunnyfall-staff-session';
const enc = new TextEncoder();
const b64u = (/** @type {Uint8Array} */ b) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const el = (/** @type {string} */ tag, /** @type {string} */ text = '', /** @type {string} */ cls = '') => { const e = document.createElement(tag); e.textContent = text; if (cls) e.className = cls; return e; };

/** In game: inside the staff dock's window (ui/staffDock.js), which carries the game's staff hook. */
const embedded = new URLSearchParams(location.search).has('embed') && window.parent !== window;
if (embedded) document.body.classList.add('embed');
let session = '';
try { session = sessionStorage.getItem(SESSION_STORE) ?? ''; } catch { /* no storage */ }

// ── the key ──
async function loadKey() {
  try {
    const raw = localStorage.getItem(KEY_STORE);
    if (raw) {
      const { priv, pub } = JSON.parse(raw);
      return { pub, key: await crypto.subtle.importKey('jwk', priv, { name: 'Ed25519' }, false, ['sign']) };
    }
  } catch { /* make one */ }
  return makeKey();
}
async function makeKey() {
  const pair = /** @type {CryptoKeyPair} */ (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']));
  const priv = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const pub = b64u(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
  try { localStorage.setItem(KEY_STORE, JSON.stringify({ priv, pub })); } catch { /* kept for this page only */ }
  return { pub, key: await crypto.subtle.importKey('jwk', priv, { name: 'Ed25519' }, false, ['sign']) };
}
/** @type {{ pub: string, key: CryptoKey } | null} */
let keyed = null;
async function showKey() {
  try { keyed = await loadKey(); } catch (e) { $('keyLine').textContent = 'This browser cannot make an Ed25519 key (update the browser).'; return; }
  const h = $('handle').value.trim() || 'Killbunny';
  $('keyLine').textContent = `OWNER_KEYS = "${h}:${keyed.pub}"`;
}

// ── the calls ──
async function call(/** @type {string} */ path, body = {}) {
  const r = await fetch(`${selfAccountUrl()}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(session ? { 'x-staff-session': session } : {}) }, body: JSON.stringify(body) });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = { error: text.slice(0, 120) || `http ${r.status}` }; }
  if (!r.ok && !j.error) j.error = `http ${r.status}`;
  if (j.error === 'staff-session') signedOut();
  return j;
}
const say = (/** @type {string} */ id, /** @type {string} */ msg, /** @type {boolean} */ bad = false) => { const e = $(id); e.textContent = msg; e.className = bad ? 'bad' : 'dim'; };
const words = {
  'staff-login': 'Wrong handle or password, or this account is not a developer (or the server has not been updated yet).', 'rate': 'Too many tries. Wait a few minutes.',
  'staff-admin': 'That needs a developer account.', 'staff-owner': 'That is for the owner only.', 'staff-session': 'Signed out. Sign in again.',
  'no-player': 'No such account.', 'ambiguous': 'More than one guest has that name. Use the handle.', 'no-data': 'No save data there.', 'bad-query': 'Only one SELECT.',
  'staff-reason': 'Pick a reason.', 'staff-note': 'Write a note: it goes in the audit log.', 'seq': 'Their save moved since the check. Check again.', 'body': 'A field is missing or not valid.',
  'no-realm-character': 'No such character (pick one from a player card).', 'staff-self': 'Not on yourself.', 'not-found': 'This server does not know that door yet.',
};
const why = (/** @type {any} */ j) => `${words[/** @type {keyof typeof words} */ (j.error)] ?? j.error}${j.message ? ` (${j.message})` : ''}`;

// ── sign in / out ──
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
  say('loginMsg', 'Signing in...');
  const j = await call('/v1/staff/login', body);
  if (j.error) return say('loginMsg', why(j), true);
  session = j.session;
  try { sessionStorage.setItem(SESSION_STORE, session); } catch { /* this page only */ }
  $('password').value = '';
  opened(j);
}
function opened(/** @type {any} */ me) {
  $('login').hidden = true; $('app').hidden = false;
  $('who').textContent = `${me.handle} (${me.owner ? 'owner' : me.role})`;
  doorOpen();
}
function signedOut() {
  session = '';
  try { sessionStorage.removeItem(SESSION_STORE); } catch { /* */ }
  $('login').hidden = false; $('app').hidden = true;
}

// ── downloads ──
function save(/** @type {string} */ name, /** @type {BlobPart} */ data, type = 'application/octet-stream') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function exportSave(/** @type {any} */ body, /** @type {string} */ msgId) {
  say(msgId, 'Taking the save out...');
  const j = await call('/v1/staff/data/export', body);
  if (j.error) return say(msgId, why(j), true);
  if (j.encoding === 'text') save(j.name, j.data, 'application/json');
  else save(j.name, Uint8Array.from(atob(j.data), (c) => c.charCodeAt(0)));
  if (j.warning) say(msgId, `Saved ${j.name}, but ${j.warning}.`, true); else say(msgId, `Saved ${j.name}.`);
}

// ── saves ──
const when = (/** @type {any} */ s) => (s ? new Date(s * 1000).toLocaleString() : '-');
async function findSaves() {
  const who = await pickedId();
  if (!who) return say('savesMsg', 'Pick a player first (the Player box above).', true);
  say('savesMsg', 'Looking...');
  const j = await call('/v1/staff/data/saves', { target: who });
  if (j.error) return say('savesMsg', why(j), true);
  say('savesMsg', `${j.player.handle ?? j.player.guestName} (${j.player.id})`);
  const out = $('savesOut'); out.replaceChildren();
  out.append(el('h2', `Online characters (${j.realm.length})`));
  for (const c of j.realm) {
    const row = el('div', '', 'row');
    row.append(el('b', c.name ?? c.id), el('span', `seq ${c.seq} - saved ${when(c.updatedAt)}${c.deadAt ? ' - dead' : ''}${c.held ? ' - held' : ''}${c.leased ? ' - in play' : ''}`, 'dim'));
    if (c.hasSave) {
      const t = el('button', 'Export JSON'); t.onclick = () => exportSave({ target: who, kind: 'realm', char: c.id }, 'savesMsg');
      const r = el('button', 'Export raw'); r.onclick = () => exportSave({ target: who, kind: 'realm', char: c.id, as: 'raw' }, 'savesMsg');
      row.append(t, r);
      if (c.hasPrev) { const pv = el('button', 'Export previous'); pv.onclick = () => exportSave({ target: who, kind: 'realm', char: c.id, which: 'prev' }, 'savesMsg'); row.append(pv); }
    } else row.append(el('span', 'no save written', 'dim'));
    out.append(row);
  }
  out.append(el('h2', `Cloud saves (${j.cloud.length})`));
  for (const s of j.cloud) {
    const row = el('div', '', 'row');
    row.append(el('b', `${s.characterName ?? s.characterId} / ${s.saveName}`), el('span', `${s.bytes} bytes - ${when(s.updatedAt)} - game ${s.gameTime ?? '-'}`, 'dim'));
    const d = el('button', 'Export data'); d.onclick = () => exportSave({ target: who, kind: 'cloud', characterId: s.characterId, saveName: s.saveName, part: 'data' }, 'savesMsg');
    row.append(d);
    if (s.shotBytes) { const sh = el('button', 'Screenshot'); sh.onclick = () => exportSave({ target: who, kind: 'cloud', characterId: s.characterId, saveName: s.saveName, part: 'shot' }, 'savesMsg'); row.append(sh); }
    out.append(row);
  }
}

// ── database ──
/** @type {any[]} */ let lastRows = [];
function table(/** @type {HTMLElement} */ into, /** @type {string[]} */ cols, /** @type {any[]} */ rows) {
  const t = document.createElement('table');
  const head = t.createTHead().insertRow();
  for (const c of cols) head.append(el('th', c));
  const body = t.createTBody();
  for (const r of rows) {
    const tr = body.insertRow();
    for (const c of cols) { const v = r[c]; const td = el('td', v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)); td.title = td.textContent ?? ''; tr.append(td); }
  }
  into.replaceChildren(t);
}
async function loadTables() {
  const j = await call('/v1/staff/data/tables');
  if (j.error) return say('sqlMsg', why(j), true);
  const box = $('tables'); box.replaceChildren();
  for (const t of j.tables) { const b = el('button', `${t.name} (${t.rows ?? '?'})`); b.onclick = () => { $('sql').value = `SELECT * FROM ${t.name} LIMIT 50`; runSql(); }; box.append(b); }
}
async function runSql() {
  say('sqlMsg', 'Running...');
  const j = await call('/v1/staff/data/query', { sql: $('sql').value });
  if (j.error) return say('sqlMsg', why(j), true);
  lastRows = j.rows;
  say('sqlMsg', `${j.rows.length} rows${j.rows.length >= j.limit ? ` (the first ${j.limit})` : ''}`);
  table($('sqlOut'), j.columns, j.rows);
}
const csvCell = (/** @type {any} */ v) => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

// ── skins (custom paperdolls waiting for review) ──
async function loadSkins(/** @type {string} */ status = 'pending') {
  say('skinsMsg', 'Loading...');
  const j = await call('/v1/staff/skins/queue', { status });
  if (j.error) return say('skinsMsg', why(j), true);
  say('skinsMsg', `${j.skins.length} ${status}`);
  const out = $('skinsOut'); out.replaceChildren();
  for (const s of j.skins) {
    const card = el('div', '', 'skin');
    for (const [label, data] of [['Front', s.front], ['Back', s.back]]) {
      const box = el('div'); box.append(el('div', label, 'dim'));
      if (data) { const img = /** @type {HTMLImageElement} */ (document.createElement('img')); img.src = `data:image/png;base64,${data}`; box.append(img); }
      card.append(box);
    }
    const info = el('div');
    info.append(el('b', s.name), el('div', `by ${s.owner}`, 'dim'), el('div', `${Math.round(s.height * 100)}% of a player's height, ${s.w} x ${s.h}`, 'dim'), el('div', `status: ${s.status}${s.note ? ` - ${s.note}` : ''}`, 'dim'));
    const row = el('div', '', 'row');
    const ok = el('button', 'Approve'); ok.onclick = () => reviewSkin(s.id, 'approve', '', status);
    const no = el('button', 'Reject...'); no.onclick = () => { const n = prompt('Why is it rejected? The player sees this.'); if (n) reviewSkin(s.id, 'reject', n, status); };
    row.append(ok, no); info.append(row); card.append(info);
    out.append(card);
  }
}
async function reviewSkin(/** @type {string} */ id, /** @type {string} */ verdict, /** @type {string} */ note, /** @type {string} */ status) {
  const j = await call('/v1/staff/skins/review', { id, verdict, note });
  if (j.error) return say('skinsMsg', why(j), true);
  await loadSkins(status);
}

async function banSkins(/** @type {boolean} */ on) {
  const id = await pickedId();
  if (!id) return say('skinsMsg', 'Pick a player first (the Player box above).', true);
  const j = await call('/v1/staff/skins/ban', { target: id, on, note: $('banNote').value.trim() });
  if (j.error) return say('skinsMsg', why(j), true);
  say('skinsMsg', on ? `Skins switched off for ${picked.name}.` : `Skins switched on again for ${picked.name}.`);
  await loadBanned();
}
async function loadBanned() {
  const j = await call('/v1/staff/skins/banned');
  if (j.error) return say('skinsMsg', why(j), true);
  $('bannedOut').textContent = j.banned.length ? `Disabled: ${j.banned.map((/** @type {any} */ b) => `${b.owner}${b.note ? ` (${b.note})` : ''}`).join(', ')}` : 'Nobody is disabled.';
}

// ── audit ──
async function loadAudit() {
  const j = await call('/v1/staff/audit', { limit: 100 });
  if (j.error) return say('auditMsg', why(j), true);
  say('auditMsg', `${j.rows.length} rows`);
  table($('auditOut'), ['at', 'actorName', 'role', 'act', 'target', 'outcome', 'detail'], j.rows.map((/** @type {any} */ r) => ({ ...r, at: when(r.at) })));
}

// ── wiring ──
$('go').onclick = signIn;
$('password').addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter') signIn(); });
$('handle').addEventListener('input', showKey);
$('copyKey').onclick = () => navigator.clipboard?.writeText($('keyLine').textContent);
$('newKey').onclick = async () => { if (confirm('A new key has to be put into OWNER_KEYS again. Make one?')) { keyed = await makeKey(); showKey(); } };
$('out').onclick = async () => { await call('/v1/staff/logout', {}); signedOut(); };
$('findSaves').onclick = findSaves;
$('loadTables').onclick = loadTables;
$('runSql').onclick = runSql;
$('dlJson').onclick = () => save('query.json', JSON.stringify(lastRows, null, 1), 'application/json');
$('dlCsv').onclick = () => { const cols = lastRows[0] ? Object.keys(lastRows[0]) : []; save('query.csv', [cols.join(','), ...lastRows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n'), 'text/csv'); };
$('loadAudit').onclick = loadAudit;
$('loadSkins').onclick = () => loadSkins('pending');
$('banOn').onclick = () => banSkins(true);
$('banOff').onclick = () => banSkins(false);
$('loadBanned').onclick = loadBanned;
$('loadSkinsOk').onclick = () => loadSkins('approved');
const TABS = ['map', 'players', 'items', 'reports', 'saves', 'db', 'skins', 'audit'];
for (const b of document.querySelectorAll('#tabs button')) {
  /** @type {any} */ (b).onclick = () => {
    for (const x of document.querySelectorAll('#tabs button')) x.classList.toggle('on', x === b);
    for (const t of TABS) $(`t-${t}`).hidden = t !== /** @type {any} */ (b).dataset.t;
  };
}

// ── the picked player and character, which every form shares ──
const picked = { id: '', name: '', char: '', charName: '' };
function pickPlayer(/** @type {string} */ id, /** @type {string} */ name) {
  if (picked.id !== id) { picked.char = ''; picked.charName = ''; $('pickChar').value = ''; }
  picked.id = id; picked.name = name; $('pick').value = name;
  say('pickMsg', `picked ${name}`);
}
function pickChar(/** @type {string} */ id, /** @type {string} */ name) {
  picked.char = id; picked.charName = name; $('pickChar').value = id;
  say('pickMsg', `picked ${picked.name || 'a player'} / ${name}`);
}
/** The picked player's account id: looked up by the name typed when it is not the one picked from a list. */
async function pickedId() {
  const typed = $('pick').value.trim();
  if (!typed) return null;
  if (picked.id && (typed === picked.name || typed === picked.id)) return picked.id;
  const j = await call('/v1/staff/player', { name: typed });
  if (j.error || typeof j.account?.id !== 'string') { say('pickMsg', why(j.error ? j : { error: 'no-player' }), true); return null; }
  pickPlayer(j.account.id, j.account.handle ?? j.account.guestName ?? typed);
  return picked.id;
}
const picks = { pickPlayer, pickChar };
$('pickChar').addEventListener('input', () => { picked.char = $('pickChar').value.trim(); });
async function openCard() {
  const id = await pickedId();
  if (!id) return;
  for (const x of document.querySelectorAll('#tabs button')) if (/** @type {any} */ (x).dataset.t === 'players') /** @type {any} */ (x).click();
  const out = $('cardOut');
  out.replaceChildren(el('div', 'Loading...', 'dim'));
  const j = await call('/v1/staff/player', { target: id });
  if (j.error) out.replaceChildren(el('div', why(j), 'bad')); else showAnswer(out, j, picks);
}
$('pickLoad').onclick = openCard;
$('pick').addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter') openCard(); });

// ── the action tabs (staffPanelActions.js) ──
async function send(/** @type {any} */ act, /** @type {any} */ body, /** @type {HTMLElement} */ out) {
  out.replaceChildren(el('div', 'Working...', 'dim'));
  const j = await call(act.p, body);
  if (j.error) out.replaceChildren(el('div', why(j), 'bad'));
  else showAnswer(out, j, picks);
  if (!j.error && (act.p === '/v1/staff/watch/add' || act.p === '/v1/staff/watch/remove')) sendTags();
  return j;
}
const cardBox = el('div'); cardBox.id = 'cardOut';
$('t-players').append(el('h2', 'Player card'), el('div', 'Type a name in the Player box and press Open, or Pick one from a list.', 'dim'), cardBox);
for (const tab of ['players', 'items', 'reports']) {
  buildActs($(`t-${tab}`), STAFF_TABS[tab], {
    send, who: pickedId, char: () => picked.char,
    extra: (act, row, _read, fields) => {
      if (act.fixed && /** @type {any} */ (act.fixed).op === 'start' && embedded) {   // an event's place, from where I stand in game
        const b = el('button', 'Where I stand');
        b.onclick = async () => {
          const h = await ask({ dfoStaff: 'here?' }, 'here');
          const box = /** @type {any} */ (fields.get('ev'));
          if (!h || h.region == null) { say('pickMsg', 'The game did not say where you stand (outdoors only).', true); return; }
          let ev = {}; try { ev = JSON.parse(box.value || '{}'); } catch { /* start again */ }
          box.value = JSON.stringify({ ...ev, rg: h.region, loc: h.loc ?? undefined, nm: h.place ?? h.name ?? undefined, px: h.px, py: h.py }, null, 1);
        };
        row.append(b);
      }
    },
  });
}

// ── the game's staff hook, through the dock (in game only) ──
const toGame = (/** @type {object} */ m) => { if (embedded) window.parent.postMessage(m, location.origin); };
/** @type {Map<string, (m: any) => void>} */
const answers = new Map();
/** Ask the game and wait for its answer word (up to 4 s). @param {object} m @param {string} word */
const ask = (m, word) => new Promise((resolve) => {
  const t = setTimeout(() => { answers.delete(word); resolve(null); }, 4000);
  answers.set(word, (a) => { clearTimeout(t); answers.delete(word); resolve(a); });
  toGame(m);
});
let doorUp = false;
function doorOpen() {
  if (!embedded) { $('mapNoGame').hidden = false; $('mapGame').hidden = true; $('gameLink').textContent = ''; return; }
  $('mapNoGame').hidden = true; $('mapGame').hidden = false;
  toGame({ dfoStaff: 'hook?' });
  toGame({ dfoStaff: 'regions?' });
  hideRead();
}
async function hideRead() {
  const j = await call('/v1/staff/hide', {});
  $('hideState').textContent = j.error ? why(j) : j.hidden ? 'hidden' : 'shown';
}
async function hideSet(/** @type {boolean} */ on) {
  const j = await call('/v1/staff/hide', { on });
  if (!j.error) toGame({ dfoStaff: 'relink' });
  $('hideState').textContent = j.error ? why(j) : j.hidden ? 'hidden' : 'shown';
  return !j.error;
}
async function sendTags() {
  if (!embedded || !session) return;
  const j = await call('/v1/staff/watch', {});
  const list = (j.watch ?? []).slice(0, 200).map((/** @type {any} */ w) => ({ sub: w.sub, level: 'medium', why: 'watched', watch: true }));
  toGame({ dfoStaff: 'tags', dist: 100, list });
}
function showMap(/** @type {any} */ m) {
  say('mapMsg', `${m.name ?? ''} - ${m.state === 'open' ? 'live' : m.state === 'hide' ? 'turn Hide me on to watch' : m.state ?? ''} - ${m.list?.length ?? 0} players`);
  const out = $('mapOut');
  const t = document.createElement('table');
  const head = t.createTHead().insertRow();
  for (const c of ['', 'name', 'x', 'y', 'road', 'seen']) head.append(el('th', c));
  const body = t.createTBody();
  for (const p of m.list ?? []) {
    const tr = body.insertRow();
    const td = tr.insertCell();
    const f = el('button', 'Follow'); f.onclick = () => { toGame({ dfoStaff: 'follow', sub: p.sub }); say('followMsg', `following ${p.name}`); };
    const pk = el('button', 'Pick'); pk.onclick = () => pickPlayer(p.sub, p.name);
    td.append(f, ' ', pk);
    for (const v of [p.name, p.px, p.py, p.road ?? '', `${p.ageS ?? 0}s ago`]) tr.append(el('td', String(v ?? '')));
  }
  out.replaceChildren(t);
}
window.addEventListener('message', async (e) => {
  if (!embedded || e.source !== window.parent || e.origin !== location.origin) return;
  const m = /** @type {any} */ (e.data);
  if (!m || typeof m.dfoStaff !== 'string') return;
  answers.get(m.dfoStaff)?.(m);
  if (m.dfoStaff === 'hook') { doorUp = true; $('gameLink').textContent = `game hook v${m.v}`; sendTags(); }
  else if (m.dfoStaff === 'regions' && Array.isArray(m.names)) {
    const sel = $('region'); sel.replaceChildren();
    m.names.forEach((/** @type {string} */ n, /** @type {number} */ i) => { const o = /** @type {HTMLOptionElement} */ (el('option', n)); o.value = String(i); sel.append(o); });
  } else if (m.dfoStaff === 'map') showMap(m);
  else if (m.dfoStaff === 'act' && m.act === 'follow' && typeof m.sub === 'string') { pickPlayer(m.sub, m.name ?? m.sub); say('followMsg', `following ${m.name ?? m.sub}`); }
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
$('hideOn').onclick = () => hideSet(true);
$('hideOff').onclick = () => hideSet(false);
$('followPick').onclick = async () => {
  const id = await pickedId();
  if (!id) return say('followMsg', 'Pick a player first.', true);
  toGame({ dfoStaff: 'follow', sub: id }); say('followMsg', doorUp ? `following ${picked.name}` : 'asked (the game has not answered yet)');
};
$('unlock').onclick = () => { toGame({ dfoStaff: 'unlock' }); say('followMsg', 'let go'); };
$('watchRegion').onclick = () => { const v = $('region').value; if (v !== '') toGame({ dfoStaff: 'map?', region: Number(v) }); };
$('stopRegion').onclick = () => { toGame({ dfoStaff: 'map?', region: null }); say('mapMsg', 'stopped'); };
setInterval(() => { if (doorUp && session) sendTags(); }, 60_000);
if (embedded) window.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.parent.postMessage({ dfoStaffDock: 'close' }, location.origin); });

showKey();
if (session) call('/v1/staff/me').then((j) => { if (!j.error) opened(j); else signedOut(); });
