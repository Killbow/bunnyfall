// @ts-check
// BUNNYFALL (2026-11-06): staff.html - the staff page of this fork. A developer signs in (password + a key this browser
// makes), then reads an account's saves and takes them out, browses the database read-only and reads the audit log.
/* global btoa, atob, sessionStorage, confirm, crypto */
// All of it is server-account/src/staffData.js and staff.js; this file only asks and shows.
import { selfAccountUrl } from '../net/selfHost.js';

const $ = (/** @type {string} */ id) => /** @type {any} */ (document.getElementById(id));
const KEY_STORE = 'bunnyfall-staff-key';
const SESSION_STORE = 'bunnyfall-staff-session';
const enc = new TextEncoder();
const b64u = (/** @type {Uint8Array} */ b) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const el = (/** @type {string} */ tag, /** @type {string} */ text = '', /** @type {string} */ cls = '') => { const e = document.createElement(tag); e.textContent = text; if (cls) e.className = cls; return e; };

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
  say(msgId, `Saved ${j.name}.`);
}

// ── saves ──
const when = (/** @type {any} */ s) => (s ? new Date(s * 1000).toLocaleString() : '-');
async function findSaves() {
  const who = $('who2').value.trim();
  if (!who) return;
  say('savesMsg', 'Looking...');
  const j = await call('/v1/staff/data/saves', { name: who, target: who });
  if (j.error) return say('savesMsg', why(j), true);
  say('savesMsg', `${j.player.handle ?? j.player.guestName} (${j.player.id})`);
  const out = $('savesOut'); out.replaceChildren();
  out.append(el('h2', `Online characters (${j.realm.length})`));
  for (const c of j.realm) {
    const row = el('div', '', 'row');
    row.append(el('b', c.name ?? c.id), el('span', `seq ${c.seq} - saved ${when(c.updatedAt)}${c.deadAt ? ' - dead' : ''}${c.held ? ' - held' : ''}${c.leased ? ' - in play' : ''}`, 'dim'));
    if (c.hasSave) {
      const t = el('button', 'Export JSON'); t.onclick = () => exportSave({ name: who, target: who, kind: 'realm', char: c.id }, 'savesMsg');
      const r = el('button', 'Export raw'); r.onclick = () => exportSave({ name: who, target: who, kind: 'realm', char: c.id, as: 'raw' }, 'savesMsg');
      row.append(t, r);
    } else row.append(el('span', 'no save written', 'dim'));
    out.append(row);
  }
  out.append(el('h2', `Cloud saves (${j.cloud.length})`));
  for (const s of j.cloud) {
    const row = el('div', '', 'row');
    row.append(el('b', `${s.characterName ?? s.characterId} / ${s.saveName}`), el('span', `${s.bytes} bytes - ${when(s.updatedAt)} - game ${s.gameTime ?? '-'}`, 'dim'));
    const d = el('button', 'Export data'); d.onclick = () => exportSave({ name: who, target: who, kind: 'cloud', characterId: s.characterId, saveName: s.saveName, part: 'data' }, 'savesMsg');
    row.append(d);
    if (s.shotBytes) { const sh = el('button', 'Screenshot'); sh.onclick = () => exportSave({ name: who, target: who, kind: 'cloud', characterId: s.characterId, saveName: s.saveName, part: 'shot' }, 'savesMsg'); row.append(sh); }
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
$('who2').addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter') findSaves(); });
$('loadTables').onclick = loadTables;
$('runSql').onclick = runSql;
$('dlJson').onclick = () => save('query.json', JSON.stringify(lastRows, null, 1), 'application/json');
$('dlCsv').onclick = () => { const cols = lastRows[0] ? Object.keys(lastRows[0]) : []; save('query.csv', [cols.join(','), ...lastRows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n'), 'text/csv'); };
$('loadAudit').onclick = loadAudit;
for (const b of document.querySelectorAll('#tabs button')) {
  /** @type {any} */ (b).onclick = () => {
    for (const x of document.querySelectorAll('#tabs button')) x.classList.toggle('on', x === b);
    for (const t of ['saves', 'db', 'audit']) $(`t-${t}`).hidden = t !== /** @type {any} */ (b).dataset.t;
  };
}
showKey();
if (session) call('/v1/staff/me').then((j) => { if (!j.error) opened(j); else signedOut(); });
