// BUNNYFALL: the owner's update button, server side. A tiny HTTP door beside the two Workers.
// It never runs anything itself: it leaves a request file the host's cron picks up (selfhost/update.sh --if-requested),
// so no container holds Docker or GitHub access.
//   GET  /status  Bearer <account secret>  -> { owner, pending, last }
//   POST /update  Bearer <account secret>  -> { queued }
import { createServer } from 'node:http';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// The desktop app's page origin, set by app/main.cjs; the website calls same-origin.
const APP_ORIGIN = 'dagger://game';

function ownerHandles(accountToml) {
  const m = readFileSync(accountToml, 'utf8').match(/^OWNER_HANDLES\s*=\s*"([^"]*)"/m);
  return new Set((m?.[1] ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
}

function lastLines(file, n) {
  try { return readFileSync(file, 'utf8').trim().split('\n').slice(-n).join('\n'); } catch { return ''; }
}

export function startUpdater({ port, bind, accountBase, accountToml, dir, discord }) {
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
    const fromApp = req.headers.origin === APP_ORIGIN;
    if (fromApp) res.setHeader('access-control-allow-origin', APP_ORIGIN);
    if (fromApp && req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-methods': 'GET, POST',
        'access-control-allow-headers': 'authorization, content-type, x-staff-session',
        'access-control-max-age': '86400',
      });
      return res.end();
    }
    if (path === '/discord' && discord) {
      if (req.method !== 'POST') return send(res, 405, { error: 'method' });
      const session = req.headers['x-staff-session'];
      if (typeof session !== 'string' || !session || session.length > 256) {
        return send(res, 403, { error: 'staff-owner' });
      }
      try {
        const response = await fetch(`${accountBase}/v1/staff/me`, {
          method: 'POST', headers: { 'x-staff-session': session, 'content-type': 'application/json' },
          body: '{}', signal: AbortSignal.timeout(5000),
        });
        if (!response.ok || (await response.json()).owner !== true) {
          return send(res, 403, { error: 'staff-owner' });
        }
        const parts = [];
        let bytes = 0;
        for await (const part of req.iterator({ destroyOnReturn: false })) {
          bytes += part.length;
          if (bytes > 1024) return send(res, 413, { error: 'body' });
          parts.push(part);
        }
        let body;
        try { body = JSON.parse(Buffer.concat(parts).toString('utf8')); }
        catch { return send(res, 400, { error: 'body' }); }
        if (body?.action === 'status') return send(res, 200, discord.status());
        if (body?.action !== 'save' || !discord.configure(body)) return send(res, 400, { error: 'body' });
        return send(res, 200, discord.status());
      } catch {
        return send(res, 503, { error: 'discord-setup' });
      }
    }
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
