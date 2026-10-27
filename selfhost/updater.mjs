// BUNNYFALL: the owner's update button, server side. A tiny HTTP door beside the two Workers.
// It never runs anything itself: it leaves a request file the host's cron picks up (selfhost/update.sh --if-requested),
// so no container holds Docker or GitHub access.
//   GET  /status  Bearer <account secret>  -> { owner, pending, last }
//   POST /update  Bearer <account secret>  -> { queued }
import { createServer } from 'node:http';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function ownerHandles(accountToml) {
  const m = readFileSync(accountToml, 'utf8').match(/^OWNER_HANDLES\s*=\s*"([^"]*)"/m);
  return new Set((m?.[1] ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
}

function lastLines(file, n) {
  try { return readFileSync(file, 'utf8').trim().split('\n').slice(-n).join('\n'); } catch { return ''; }
}

export function startUpdater({ port, bind, accountBase, accountToml, dir }) {
  mkdirSync(dir, { recursive: true });
  try { chmodSync(dir, 0o777); } catch { /* not ours to change */ }   // the host's cron, a plain user, clears the request
  const requestFile = join(dir, 'update-requested');
  const logFile = join(dir, 'update.log');

  async function isOwner(req) {
    const auth = String(req.headers.authorization || '');
    if (!/^Bearer \S{8,}$/.test(auth)) return false;
    try {
      const res = await fetch(`${accountBase}/v1/account`, { headers: { authorization: auth } });
      if (!res.ok) return false;
      const handle = String((await res.json())?.account?.handle || '').toLowerCase();
      return !!handle && ownerHandles(accountToml).has(handle);
    } catch { return false; }
  }

  const send = (res, code, body) => {
    res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (req.method === 'GET' && path === '/status') {
      if (!(await isOwner(req))) return send(res, 200, { owner: false });
      return send(res, 200, { owner: true, pending: existsSync(requestFile), last: lastLines(logFile, 4) });
    }
    if (req.method === 'POST' && path === '/update') {
      if (!(await isOwner(req))) return send(res, 403, { error: 'not-owner' });
      writeFileSync(requestFile, `${new Date().toISOString()}\n`, { mode: 0o666 });
      try { chmodSync(requestFile, 0o666); } catch { /* fine */ }
      console.log('[bunnyfall] owner asked for an update');
      return send(res, 200, { queued: true });
    }
    send(res, 404, { error: 'not-found' });
  });
  server.listen(Number(port), bind);
  return server;
}
