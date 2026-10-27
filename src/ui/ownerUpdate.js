// BUNNYFALL: the owner's secret button on the main menu, top-left. It asks the server to pull the latest version from
// GitHub and rebuild (selfhost/updater.mjs leaves the request, the host's cron runs selfhost/update.sh). Only the
// account on OWNER_HANDLES ever sees it: the server says who is owner, the client only hides or shows.
import { storedSession } from '../net/accountClient.js';
import { selfUpdaterUrl } from '../net/selfHost.js';

const STYLE_ID = 'bf-owner-update-style';
const CSS = `
.px-support:empty { display: none; }
.bf-owner { position: absolute; top: 16px; left: 18px; z-index: 5; display: flex; align-items: flex-start; gap: 8px; }
.bf-owner[hidden] { display: none; }
.bf-owner-btn { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; cursor: pointer;
  background: rgba(10,12,17,0.55); border: 2px solid #7d7460; color: #d9b45a; font: 22px/1 monospace; padding: 0; }
.bf-owner-btn:hover, .bf-owner-btn:focus-visible { border-color: #d9b45a; outline: none; }
.bf-owner-btn[disabled] { opacity: 0.6; cursor: default; }
.bf-owner-out { max-width: min(420px, 70vw); padding: 6px 10px; background: rgba(10,12,17,0.85); border: 2px solid #7d7460;
  color: #e8e2d0; font: 12px/1.4 monospace; white-space: pre-wrap; word-break: break-word; }
.bf-owner-out:empty { display: none; }
@media (max-width: 700px) { .bf-owner { top: 10px; left: 10px; } }
`;

function ensureStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const s = doc.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  doc.head.append(s);
}

/**
 * The button, hidden until the server says this account is the owner.
 * @param {{ storage: any, fetch?: typeof fetch, doc?: Document }} deps
 */
export function ownerUpdateMark({ storage, fetch = (...a) => globalThis.fetch(...a), doc = globalThis.document }) {
  ensureStyle(doc);
  const box = doc.createElement('div');
  box.className = 'bf-owner';
  box.hidden = true;
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = 'bf-owner-btn';
  btn.textContent = '↻';
  btn.title = 'Update the server from GitHub';
  btn.setAttribute('aria-label', 'Update the server from GitHub');
  const out = doc.createElement('div');
  out.className = 'bf-owner-out';
  box.append(btn, out);

  const secret = storedSession(storage)?.secret;
  if (!secret) return box;
  const base = selfUpdaterUrl();
  const headers = { authorization: `Bearer ${secret}` };
  const status = async () => {
    try { return await (await fetch(`${base}/status`, { headers, cache: 'no-store' })).json(); } catch { return null; }
  };

  let timer = null;
  const watch = (until) => {
    clearInterval(timer);
    timer = setInterval(async () => {
      if (!box.isConnected || Date.now() > until) { clearInterval(timer); btn.disabled = false; return; }
      const s = await status();
      if (!s?.owner) return;
      out.textContent = s.pending ? 'Waiting for the server to pick it up...' : (s.last || 'Working...');
      if (!s.pending && /done|up to date|failed|not pulling/i.test(s.last || '')) { clearInterval(timer); btn.disabled = false; }
    }, 5000);
  };

  btn.addEventListener('click', async () => {
    if (!globalThis.confirm?.('Pull the latest version from GitHub and restart the server? Players get a short reconnect.')) return;
    btn.disabled = true;
    out.textContent = 'Asking the server...';
    try {
      const r = await fetch(`${base}/update`, { method: 'POST', headers });
      if (!r.ok) throw new Error(String(r.status));
      out.textContent = 'Queued. The server checks within a minute, then builds.';
      watch(Date.now() + 15 * 60_000);
    } catch (e) {
      out.textContent = `Could not ask the server (${e?.message || e}).`;
      btn.disabled = false;
    }
  });

  status().then((s) => {
    if (!s?.owner) return;
    box.hidden = false;
    if (s.pending) { btn.disabled = true; out.textContent = 'An update is already queued.'; watch(Date.now() + 15 * 60_000); }
  });
  return box;
}
